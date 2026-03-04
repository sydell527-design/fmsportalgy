import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useTimesheets, useUpdateTimesheet, useDeleteTimesheet, useBulkCreateTimesheets, useDedupTimesheets } from "@/hooks/use-timesheets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useGeofences } from "@/hooks/use-geofences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Clock, MapPin, PenLine, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Lock, ShieldCheck, Edit2, CalendarDays, ChevronLeft, ChevronRight,
  Trash2, Upload, FileSpreadsheet, CheckCircle, XCircle as XCircleIcon, Info, PenSquare, Loader2,
  Search, Filter,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet } from "@shared/schema";
import { DAY_STATUSES, HOLIDAY_TYPES, ARMED_STATUSES, CLIENT_AGENCIES } from "@shared/schema";
import type { InsertTimesheet } from "@shared/routes";
import * as XLSX from "xlsx";

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcHours(ci: string, co: string, brkMins: number) {
  const [ih, im] = ci.split(":").map(Number);
  const [oh, om] = co.split(":").map(Number);
  const totalMins = oh * 60 + om - (ih * 60 + im);
  const workMins = Math.max(0, totalMins - brkMins);
  const reg = Math.round(Math.min(8, workMins / 60) * 100) / 100;
  const ot = Math.round(Math.max(0, workMins / 60 - 8) * 100) / 100;
  return { reg, ot };
}

function StatusBadge({ status, disputed }: { status: string; disputed?: boolean | null }) {
  const map: Record<string, { label: string; className: string }> = {
    approved: { label: "Approved", className: "bg-green-100 text-green-700 border-green-200" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
    pending_second_approval: { label: "2nd Sign-off Pending", className: "bg-purple-100 text-purple-700 border-purple-200" },
    pending_first_approval: { label: "1st Sign-off Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    pending_employee: { label: "Your Signature Required", className: "bg-blue-100 text-blue-700 border-blue-200" },
  };
  const info = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${info.className}`}>{info.label}</span>
      {disputed && <span className="text-xs px-2 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-200">Disputed</span>}
    </span>
  );
}

function SigBlock({ sig, label }: { sig: any; label: string }) {
  if (!sig) return <div className="text-xs text-muted-foreground italic py-1">{label}: — Pending</div>;
  return (
    <div className="text-xs py-1">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <strong>{sig.name}</strong> · {sig.time} · {sig.ip}
    </div>
  );
}

export default function Timesheets() {
  const { user } = useAuth();

  // Month navigation — default to current month
  const [viewMonth, setViewMonth] = useState(new Date());
  const monthStart = format(startOfMonth(viewMonth), "yyyy-MM-dd");
  const monthEnd   = format(endOfMonth(viewMonth),   "yyyy-MM-dd");

  const { data: timesheets, isLoading } = useTimesheets({ startDate: monthStart, endDate: monthEnd });
  const { data: users } = useUsers();
  const { data: geofences } = useGeofences();
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
  const { mutateAsync: deleteTimesheet, isPending: isDeleting } = useDeleteTimesheet();
  const { mutateAsync: bulkCreate, isPending: isBulkUploading } = useBulkCreateTimesheets();

  // Bulk upload dialog state
  const [bulkOpen, setBulkOpen] = useState(false);
  interface BulkRow {
    rowNum: number;
    eid?: string;
    empName: string;
    date: string;
    ci: string;
    co?: string;
    zone?: string;
    post?: string;
    brk: number;
    notes?: string;
    dayStatus?: string;
    matched: boolean;
    error?: string;
    mergedFrom: number; // 1 = single row, >1 = merged from multiple rows in the file
  }

  // Detect a day-status from the Notes field (case-insensitive) — used when clock-in is absent
  const detectDayStatusFromNote = (note: string): string | null => {
    const n = note.toLowerCase().trim();
    if (n === "sick" || n.includes("report sick") || n.includes("sick leave")) return "Sick";
    if (n === "absent" || n.includes("report absent")) return "Absent";
    if (n.includes("annual leave") || n === "al") return "Annual Leave";
    if (n.includes("off day") || n === "day off") return "Off Day";
    return null;
  };
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dedupMutation = useDedupTimesheets();

  const findDuplicateTs = (row: BulkRow): Timesheet | null => {
    const allUsers = users ?? [];
    const found = allUsers.find(u =>
      u.name.toLowerCase() === row.empName.toLowerCase() ||
      u.userId.toLowerCase() === row.empName.toLowerCase()
    );
    if (!found || !row.ci) return null;
    return teamTs.find(t =>
      t.eid === found.userId &&
      t.date === row.date &&
      t.ci === row.ci &&
      (row.co ? t.co === row.co : true)
    ) ?? null;
  };

  // Detect zone mismatch: returns metres if gOut is outside the clock-in zone
  const getZoneMismatch = (ts: Timesheet): number | null => {
    if (!ts.gOut || !ts.zone || !geofences) return null;
    const fence = geofences.find((g) => g.name === ts.zone);
    if (!fence) return null;
    const dist = haversineMetres(ts.gOut.lat, ts.gOut.lng, fence.lat, fence.lng);
    return dist > fence.radius ? Math.round(dist) : null;
  };
  const { toast } = useToast();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Tab only shown for Full Access + Supervisors
  const [tsTab, setTsTab] = useState<"mine" | "general">("mine");

  // Review & Sign modal (employee — opens after clock-out)
  const [reviewModal, setReviewModal] = useState<Timesheet | null>(null);
  const [reviewForm, setReviewForm] = useState({ ci: "", co: "", brk: "30", notes: "", sigName: "" });

  // Dispute modal
  const [disputeModal, setDisputeModal] = useState<Timesheet | null>(null);
  const [disputeData, setDisputeData] = useState({ ci: "", co: "", reason: "", sigName: "" });

  // Approver sign modal
  const [approverModal, setApproverModal] = useState<Timesheet | null>(null);
  const [approverSigName, setApproverSigName] = useState("");

  // Admin bypass (force approve) modal
  const [bypassModal, setBypassModal] = useState<Timesheet | null>(null);
  const [bypassSigName, setBypassSigName] = useState("");

  // Admin override edit modal
  const [adminEditModal, setAdminEditModal] = useState<Timesheet | null>(null);
  const [adminForm, setAdminForm] = useState({
    ci: "", co: "", brk: "30", notes: "", reason: "",
    dayStatus: "", holidayType: "", armed: "", client: "",
    ph: "0", meals: "0",
  });

  // Sign All modal
  const [signAllOpen, setSignAllOpen] = useState(false);
  const [signAllName, setSignAllName] = useState("");
  const [signAllPending, setSignAllPending] = useState(false);
  const [signAllEmpId,  setSignAllEmpId]  = useState<string | null>(null);

  // Employee timesheet drawer (General tab)
  const [viewEmpId, setViewEmpId] = useState<string | null>(null);

  // Bulk-delete all records for an employee from the General tab
  const [deleteEmpId, setDeleteEmpId] = useState<string | null>(null);
  const [deleteEmpPending, setDeleteEmpPending] = useState(false);

  // Filters
  const [generalSearch, setGeneralSearch] = useState("");
  const [generalStatus, setGeneralStatus] = useState("all");
  const [mineStatus, setMineStatus] = useState("all");

  const parseExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });

        const normalize = (h: string) => h.toString().toLowerCase().replace(/[\s_\-\/]/g, "");
        const findCol = (row: Record<string, unknown>, ...aliases: string[]): string => {
          for (const key of Object.keys(row)) {
            if (aliases.map(normalize).includes(normalize(key))) return String(row[key] ?? "").trim();
          }
          return "";
        };
        const parseTime = (raw: string): string => {
          if (!raw) return "";
          const cleaned = raw.trim();
          // Standard HH:MM or H:MM (with optional seconds and AM/PM)
          if (/^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i.test(cleaned)) {
            const parts = cleaned.match(/^(\d{1,2}):(\d{2}).*?(AM|PM)?$/i);
            if (parts) {
              let h = parseInt(parts[1]);
              const m = parseInt(parts[2]);
              const ampm = parts[3]?.toUpperCase();
              if (ampm === "PM" && h < 12) h += 12;
              if (ampm === "AM" && h === 12) h = 0;
              return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            }
          }
          // Excel decimal fraction (e.g. 0.958333 = 23:00, 0.291667 = 07:00)
          const decimal = parseFloat(cleaned);
          if (!isNaN(decimal) && decimal >= 0 && decimal < 1) {
            const totalMins = Math.round(decimal * 24 * 60);
            const h = Math.floor(totalMins / 60) % 24;
            const m = totalMins % 60;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }
          // Unrecognized format — return empty so the row gets flagged
          return "";
        };
        const parseDate = (raw: string): string => {
          if (!raw) return "";
          const cleaned = raw.trim();
          // yyyy-MM-dd
          if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
          // MM/DD/YYYY or DD/MM/YYYY — 4-digit year
          const slash4 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (slash4) {
            const [, a, b, y] = slash4;
            return parseInt(a) > 12
              ? `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`
              : `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
          }
          // M/D/YY or MM/DD/YY — 2-digit year (Excel short date)
          const slash2 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
          if (slash2) {
            const [, a, b, yy] = slash2;
            const year = parseInt(yy) >= 0 ? `20${yy.padStart(2, "0")}` : `19${yy.padStart(2, "0")}`;
            return parseInt(a) > 12
              ? `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`
              : `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
          }
          // Excel date serial number (numeric string)
          const serial = parseInt(cleaned);
          if (!isNaN(serial) && serial > 40000 && serial < 60000) {
            const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
            return d.toISOString().slice(0, 10);
          }
          return cleaned;
        };

        const parsed: BulkRow[] = rows.map((row, i) => {
          const empRaw = findCol(row, "Full Name", "Name", "Employee Name", "Employee", "EID", "Employee ID", "Staff");
          const dateRaw = findCol(row, "Date", "Work Date", "Shift Date", "Day");
          const ciRaw = parseTime(findCol(row, "Clock In", "In", "Start", "Time In", "ClockIn", "Start Time"));
          const coRaw = parseTime(findCol(row, "Clock Out", "Out", "End", "Time Out", "ClockOut", "End Time"));
          const zoneRaw = findCol(row, "Zone", "Location", "Site");
          const postRaw = findCol(row, "Post", "Position", "Post Name");
          const brkRaw = findCol(row, "Break", "Break Minutes", "Breaks", "Brk");
          const notesRaw = findCol(row, "Notes", "Note", "Remarks", "Comment");
          const dateStr = parseDate(dateRaw);

          // Detect day-status from the Notes column (e.g. "Report Sick" → Sick)
          const autoStatus = notesRaw ? detectDayStatusFromNote(notesRaw) : null;
          const noClockNeeded = autoStatus === "Sick" || autoStatus === "Absent" || autoStatus === "Annual Leave" || autoStatus === "Off Day";

          let error: string | undefined;
          if (!empRaw) error = "Missing employee name";
          else if (!dateStr) error = "Missing or invalid date";
          else if (!ciRaw && !noClockNeeded) error = "Missing clock-in time";
          else if (!coRaw && !noClockNeeded) error = "Missing clock-out time";

          return {
            rowNum: i + 2,
            empName: empRaw,
            date: dateStr,
            ci: ciRaw || (noClockNeeded ? "00:00" : ""),
            co: coRaw || (noClockNeeded ? "00:00" : undefined),
            zone: zoneRaw || undefined,
            post: postRaw || undefined,
            brk: parseInt(brkRaw) || 0,
            notes: notesRaw || undefined,
            dayStatus: autoStatus ?? undefined,
            matched: false,
            error,
            mergedFrom: 1,
          };
        });

        // ── Within-file dedup: merge rows with same employee+date+ci+co ──────
        const mergeMap: Record<string, BulkRow> = {};
        for (const row of parsed) {
          if (row.error) {
            // Keep error rows individually (can't merge without valid key fields)
            mergeMap[`err-${row.rowNum}`] = row;
            continue;
          }
          const key = `${row.empName.toLowerCase()}|${row.date}|${row.ci}|${row.co ?? ""}`;
          if (mergeMap[key]) {
            const ex = mergeMap[key];
            // Take best break time
            if ((row.brk ?? 0) > (ex.brk ?? 0)) ex.brk = row.brk;
            // Fill in any blank optional fields from this row
            if (!ex.zone  && row.zone)  ex.zone  = row.zone;
            if (!ex.post  && row.post)  ex.post  = row.post;
            if (!ex.notes && row.notes) ex.notes = row.notes;
            ex.mergedFrom += 1;
          } else {
            mergeMap[key] = { ...row };
          }
        }

        setBulkRows(Object.values(mergeMap));
        setBulkFileName(file.name);
      } catch {
        toast({ title: "Failed to parse file", description: "Ensure it is a valid Excel (.xlsx) or CSV file.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const handleBulkUpload = async () => {
    const allUsers = users ?? [];
    const records: InsertTimesheet[] = [];
    let unmatchedCount = 0;
    let skippedDups = 0;
    let updatedDups = 0;
    let seq = 0;
    for (const row of bulkRows) {
      if (row.error) continue;
      const empSearch = row.empName.toLowerCase();
      const found = allUsers.find((u) =>
        u.name.toLowerCase() === empSearch ||
        u.userId.toLowerCase() === empSearch
      );
      if (!found) { unmatchedCount++; continue; }

      const existing = findDuplicateTs(row);
      if (existing) {
        // Auto-update: patch the existing record with any new/better values from the file
        try {
          const hours = row.ci && row.co ? calcHours(row.ci, row.co, row.brk) : { reg: existing.reg ?? 0, ot: existing.ot ?? 0 };
          await updateTimesheet({
            id: existing.id,
            brk: row.brk,
            zone: row.zone ?? existing.zone ?? undefined,
            post: row.post ?? existing.post ?? undefined,
            notes: row.notes ?? existing.notes ?? undefined,
            reg: hours.reg,
            ot: hours.ot,
            edited: true,
          });
          updatedDups++;
        } catch { /* skip on individual failure */ }
        continue;
      }

      const isSickAbsent = row.dayStatus === "Sick" || row.dayStatus === "Absent" || row.dayStatus === "Annual Leave" || row.dayStatus === "Off Day";
      const hours = (row.ci && row.co && !isSickAbsent) ? calcHours(row.ci, row.co, row.brk) : { reg: 0, ot: 0 };
      seq++;
      records.push({
        tsId: `TS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${seq}`,
        eid: found.userId,
        date: row.date,
        ci: row.ci || "00:00",
        co: row.co || null,
        brk: row.brk ?? 0,
        zone: row.zone ?? null,
        post: row.post ?? null,
        reg: isNaN(hours.reg) ? 0 : hours.reg,
        ot: isNaN(hours.ot) ? 0 : hours.ot,
        ph: 0,
        meals: 0,
        dayStatus: row.dayStatus ?? null,
        notes: row.notes ?? null,
        status: "pending_first_approval",
        disputed: false,
        disputeNote: null,
        eSig: null,
        f1Sig: null,
        f2Sig: null,
        gIn: null,
        gOut: null,
        edited: false,
        hist: [],
      });
    }

    try {
      if (records.length > 0) await bulkCreate(records);
      const parts: string[] = [];
      if (records.length > 0)  parts.push(`${records.length} new timesheet${records.length !== 1 ? "s" : ""} created`);
      if (updatedDups > 0)     parts.push(`${updatedDups} updated`);
      if (skippedDups > 0)     parts.push(`${skippedDups} duplicate${skippedDups !== 1 ? "s" : ""} skipped`);
      if (unmatchedCount > 0)  parts.push(`${unmatchedCount} employee${unmatchedCount !== 1 ? "s" : ""} not found`);
      if (parts.length === 0) {
        toast({ title: "Nothing to process", description: "All rows were duplicates or had errors.", variant: "destructive" });
        return;
      }
      toast({ title: "Upload complete", description: parts.join(" · ") });
      setBulkOpen(false);
      setBulkRows([]);
      setBulkFileName("");
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  };

  // Auto-clean duplicates on mount for full-access users (server handles batch delete efficiently)
  useEffect(() => {
    const role = user?.role;
    if (role === "admin" || role === "manager") {
      dedupMutation.mutate(undefined, {
        onSuccess: ({ removed }) => {
          if (removed > 0) {
            toast({ title: `${removed} duplicate record${removed !== 1 ? "s" : ""} automatically removed` });
          }
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  if (!user) return null;

  const allTs = timesheets ?? [];

  const isFullAccess = user.role === "admin" || user.role === "manager";
  // Stage 2: employee whose position appears as fa or sa on at least one other employee (dynamic, no hardcoded titles)
  const isSupervisor =
    user.role === "employee" &&
    (users ?? []).some(
      (u) => u.userId !== user.userId && (u.fa === user.pos || u.sa === user.pos)
    );

  const visible = allTs.filter((ts) => {
    if (isFullAccess) return true; // admin & manager see all timesheets
    // Stage 2: supervisor sees own timesheets + any employee whose fa or sa matches their position
    if (isSupervisor) {
      const emp = users?.find((u) => u.userId === ts.eid);
      return ts.eid === user.userId || emp?.fa === user.pos || emp?.sa === user.pos;
    }
    // Stage 1: basic employee sees only own
    return ts.eid === user.userId;
  }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // Split for tabbed view — available to Full Access users and Supervisors
  const hasTeamView = isFullAccess || isSupervisor;
  const myTs   = visible.filter((ts) => ts.eid === user.userId);
  const teamTs = visible.filter((ts) => ts.eid !== user.userId);
  const displayTs = hasTeamView ? (tsTab === "mine" ? myTs : teamTs) : visible;

  const empName = (eid: string) => users?.find((u) => u.userId === eid)?.name ?? eid;
  const empAv   = (eid: string) => users?.find((u) => u.userId === eid)?.av ?? eid.slice(0, 2);
  const empData = (eid: string) => users?.find((u) => u.userId === eid);

  // Shift in progress — works for ANY timesheet, any viewer
  const isShiftInProgress = (ts: Timesheet) =>
    ts.status === "pending_employee" && !!ts.ci && !ts.co;

  // Employee can only review/sign AFTER clock-out
  const canEmployeeReview = (ts: Timesheet) =>
    ts.eid === user.userId && ts.status === "pending_employee" && !!ts.co;

  // Legacy alias for own in-progress check
  const isInProgress = (ts: Timesheet) =>
    ts.eid === user.userId && isShiftInProgress(ts);

  const canManagerSign = (ts: Timesheet) => {
    if (isShiftInProgress(ts)) return false; // block while shift running
    const emp = users?.find((u) => u.userId === ts.eid);
    if (ts.status === "pending_first_approval" && emp?.fa === user.pos) return true;
    if (ts.status === "pending_second_approval" && emp?.sa === user.pos) return true;
    return false;
  };
  // Full access users can sign at any approval stage (but not while shift is running)
  const canAdminSign = (ts: Timesheet) =>
    isFullAccess && !isShiftInProgress(ts) &&
    (ts.status === "pending_first_approval" || ts.status === "pending_second_approval");

  // Full access users or JGM can override-edit any locked timesheet
  const canAdminEdit = (ts: Timesheet) =>
    (isFullAccess || user.pos === "Junior General Manager") && ts.status !== "pending_employee";

  // Admin bypass: skip all signature stages and force-approve immediately
  // Requires: admin/manager role, shift has ended (co exists), not already approved/rejected
  const canAdminBypass = (ts: Timesheet) =>
    isFullAccess &&
    !!ts.co &&
    ts.status !== "approved" &&
    ts.status !== "rejected";

  // Shift Supervisor can edit a timesheet that awaits their 1st sign-off (not yet locked by JGM)
  const canSupervisorEdit = (ts: Timesheet) => {
    if (!isSupervisor) return false;
    const emp = users?.find((u) => u.userId === ts.eid);
    return ts.status === "pending_first_approval" && emp?.fa === user.pos && !ts.f2Sig && ts.eid !== user.userId;
  };

  const openReview = (ts: Timesheet) => {
    setReviewForm({ ci: ts.ci ?? "", co: ts.co ?? "", brk: String(ts.brk ?? 30), notes: ts.notes ?? "", sigName: user.name });
    setReviewModal(ts);
  };

  const openAdminEdit = (ts: Timesheet) => {
    setAdminForm({
      ci: ts.ci ?? "", co: ts.co ?? "", brk: String(ts.brk ?? 30), notes: ts.notes ?? "", reason: "",
      dayStatus: ts.dayStatus ?? "", holidayType: ts.holidayType ?? "",
      armed: ts.armed ?? "", client: ts.client ?? "",
      ph: String(ts.ph ?? 0), meals: String(ts.meals ?? 0),
    });
    setAdminEditModal(ts);
  };

  // Derived hours for review form
  const reviewHours = reviewForm.ci && reviewForm.co
    ? calcHours(reviewForm.ci, reviewForm.co, Number(reviewForm.brk) || 0)
    : null;

  const adminHours = adminForm.ci && adminForm.co
    ? calcHours(adminForm.ci, adminForm.co, Number(adminForm.brk) || 0)
    : null;

  const submitReview = async () => {
    if (!reviewModal) return;
    if (!reviewForm.sigName.trim()) {
      toast({ title: "Signature required", variant: "destructive" }); return;
    }
    const sigObj = { name: reviewForm.sigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    const hours = reviewHours ?? { reg: reviewModal.reg, ot: reviewModal.ot };
    try {
      await updateTimesheet({
        id: reviewModal.id,
        ci: reviewForm.ci,
        co: reviewForm.co,
        brk: Number(reviewForm.brk) || 0,
        notes: reviewForm.notes,
        reg: hours.reg,
        ot: hours.ot,
        eSig: sigObj,
        status: "pending_first_approval",
        edited: reviewForm.ci !== reviewModal.ci || reviewForm.co !== reviewModal.co,
      });
      toast({ title: "Timesheet signed and submitted for approval" });
      setReviewModal(null);
    } catch { toast({ title: "Failed to submit", variant: "destructive" }); }
  };

  const submitAdminEdit = async () => {
    if (!adminEditModal) return;
    const hours = adminHours ?? { reg: adminEditModal.reg, ot: adminEditModal.ot };
    const auditNote = `Admin override by ${user.name} at ${format(new Date(), "yyyy-MM-dd HH:mm")}${adminForm.reason ? `: ${adminForm.reason}` : ""}`;
    try {
      await updateTimesheet({
        id: adminEditModal.id,
        ci: adminForm.ci,
        co: adminForm.co,
        brk: Number(adminForm.brk) || 0,
        notes: adminForm.notes ? `${adminForm.notes}\n[${auditNote}]` : `[${auditNote}]`,
        reg: hours.reg,
        ot: hours.ot,
        ph: Number(adminForm.ph) || 0,
        meals: Number(adminForm.meals) || 0,
        dayStatus: adminForm.dayStatus || null,
        holidayType: adminForm.holidayType || null,
        armed: adminForm.armed || null,
        client: adminForm.client || null,
        edited: true,
      });
      toast({ title: "Timesheet updated (admin override)" });
      setAdminEditModal(null);
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  };

  const submitAdminBypass = async () => {
    if (!bypassModal) return;
    const sigObj = { name: bypassSigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    const auditNote = `[Admin bypass approval by ${user.name} at ${format(new Date(), "yyyy-MM-dd HH:mm")} — all signature stages overridden]`;
    try {
      await updateTimesheet({
        id: bypassModal.id,
        f1Sig: sigObj,
        f2Sig: sigObj,
        eSig: bypassModal.eSig ?? sigObj,
        status: "approved",
        notes: bypassModal.notes ? `${bypassModal.notes}\n${auditNote}` : auditNote,
        edited: true,
      });
      toast({ title: "Timesheet approved (admin bypass)", description: "All signature stages have been overridden." });
      setBypassModal(null);
      setBypassSigName("");
    } catch {
      toast({ title: "Failed to approve", variant: "destructive" });
    }
  };

  const submitApproverSig = async () => {
    if (!approverModal) return;
    const ts = approverModal;
    const sigObj = { name: approverSigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    const isFirst = ts.status === "pending_first_approval";
    try {
      await updateTimesheet({
        id: ts.id,
        ...(isFirst ? { f1Sig: sigObj, status: "pending_second_approval" } : { f2Sig: sigObj, status: "approved" }),
      });
      toast({ title: isFirst ? "First approval signed" : "Timesheet fully approved" });
      setApproverModal(null);
      setApproverSigName("");
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
  };

  const submitReject = async (ts: Timesheet) => {
    try {
      await updateTimesheet({ id: ts.id, status: "rejected" });
      toast({ title: "Timesheet rejected" });
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
  };

  const submitDispute = async () => {
    if (!disputeModal) return;
    const sigObj = { name: disputeData.sigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    const note = `Claimed CI: ${disputeData.ci} | Claimed CO: ${disputeData.co} | Reason: ${disputeData.reason}`;
    try {
      await updateTimesheet({ id: disputeModal.id, disputed: true, disputeNote: note, eSig: sigObj, status: "pending_first_approval" });
      toast({ title: "Dispute submitted to approver" });
      setDisputeModal(null);
      setDisputeData({ ci: "", co: "", reason: "", sigName: "" });
    } catch { toast({ title: "Failed to raise dispute", variant: "destructive" }); }
  };

  const submitSignAll = async () => {
    if (!signAllName.trim()) return;
    const signable = teamTs.filter((ts) => canAdminSign(ts) && (!signAllEmpId || ts.eid === signAllEmpId));
    if (signable.length === 0) return;
    setSignAllPending(true);
    const sigObj = { name: signAllName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    let signed = 0;
    let failed = 0;
    for (const ts of signable) {
      const isFirst = ts.status === "pending_first_approval";
      try {
        await updateTimesheet({
          id: ts.id,
          ...(isFirst
            ? { f1Sig: sigObj, status: "pending_second_approval" }
            : { f2Sig: sigObj, status: "approved" }),
        });
        signed++;
      } catch { failed++; }
    }
    setSignAllPending(false);
    setSignAllOpen(false);
    setSignAllName("");
    setSignAllEmpId(null);
    if (failed === 0) {
      toast({ title: `${signed} timesheet${signed !== 1 ? "s" : ""} approved` });
    } else {
      toast({ title: `${signed} approved, ${failed} failed`, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {hasTeamView
              ? tsTab === "mine" ? "Your personal attendance records" : "Team timesheets and approval workflow"
              : "Your attendance records and approval status"}
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-1 self-start sm:self-auto">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewMonth(subMonths(viewMonth, 1))} data-testid="button-prev-month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1.5 px-2 min-w-[130px] justify-center">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{format(viewMonth, "MMMM yyyy")}</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            disabled={format(viewMonth, "yyyy-MM") >= format(new Date(), "yyyy-MM")}
            data-testid="button-next-month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Tab bar (Full Access & Supervisors only) ──────────────────────── */}
      {hasTeamView && (
        <div className="flex items-center border-b border-border mb-5">
          <button
            onClick={() => setTsTab("mine")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tsTab === "mine"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-my-timesheet"
          >
            My Timesheet
            {myTs.length > 0 && (
              <span className="ml-2 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{myTs.length}</span>
            )}
          </button>
          <button
            onClick={() => setTsTab("general")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tsTab === "general"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-general-timesheet"
          >
            General Timesheet
            {teamTs.length > 0 && (
              <span className="ml-2 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{teamTs.length}</span>
            )}
          </button>

          {/* Admin-only toolbar — shown when on General tab */}
          {isFullAccess && tsTab === "general" && (() => {
            const signableCount = teamTs.filter((ts) => canAdminSign(ts)).length;
            return (
              <div className="ml-auto pb-1 flex items-center gap-2">
                {signableCount > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => { setSignAllName(user.name); setSignAllOpen(true); }}
                    data-testid="button-sign-all"
                  >
                    <PenSquare className="w-3.5 h-3.5 mr-1.5" />
                    Sign All
                    <span className="ml-1.5 bg-white/20 text-white text-xs rounded-full px-1.5 py-0">{signableCount}</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setBulkRows([]); setBulkFileName(""); setBulkOpen(true); }}
                  data-testid="button-bulk-upload"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Bulk Upload
                </Button>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Filter toolbar ────────────────────────────────────────────────── */}
      {tsTab === "general" && hasTeamView && (
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search employee…"
              value={generalSearch}
              onChange={(e) => setGeneralSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-general-search"
            />
          </div>
          {/* Status pills */}
          {(["all","pending","approved","rejected","disputed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setGeneralStatus(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                generalStatus === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary bg-background"
              }`}
              data-testid={`filter-general-${s}`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {tsTab === "mine" && (
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {(["all","pending","approved","rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setMineStatus(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                mineStatus === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary bg-background"
              }`}
              data-testid={`filter-mine-${s}`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : (tsTab === "general" && hasTeamView ? teamTs.length === 0 : displayTs.length === 0) ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
          No timesheet records found.
        </div>
      ) : tsTab === "general" && hasTeamView ? (
        /* ── Grouped employee view (General tab) ─────────────────────────── */
        <div className="space-y-2">
          {(() => {
            const empMatchesStatus = (records: Timesheet[]) => {
              if (generalStatus === "all") return true;
              if (generalStatus === "pending")  return records.some(r => r.status === "pending_first_approval" || r.status === "pending_second_approval");
              if (generalStatus === "approved") return records.some(r => r.status === "approved");
              if (generalStatus === "rejected") return records.some(r => r.status === "rejected");
              if (generalStatus === "disputed") return records.some(r => r.disputed);
              return true;
            };
            const searchLower = generalSearch.trim().toLowerCase();
            const byEmp = teamTs.reduce<Record<string, Timesheet[]>>((acc, ts) => {
              if (!acc[ts.eid]) acc[ts.eid] = [];
              acc[ts.eid].push(ts);
              return acc;
            }, {});
            const filtered = Object.entries(byEmp).filter(([eid, records]) => {
              const emp = empData(eid);
              if (searchLower && !(emp?.name ?? eid).toLowerCase().includes(searchLower)) return false;
              return empMatchesStatus(records);
            });
            if (filtered.length === 0) {
              return (
                <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-border rounded-md">
                  No employees match the current filters.
                </div>
              );
            }
            return filtered
              .sort(([, a], [, b]) => {
                const pA = a.filter(t => canAdminSign(t)).length;
                const pB = b.filter(t => canAdminSign(t)).length;
                return pB - pA;
              })
              .map(([eid, records]) => {
                const emp = empData(eid);
                const dates = records.map(r => r.date).sort();
                const dateFrom = dates[0];
                const dateTo   = dates[dates.length - 1];
                const totalReg = records.reduce((s, r) => s + (r.reg ?? 0), 0);
                const totalOt  = records.reduce((s, r) => s + (r.ot ?? 0), 0);
                const pendingCount   = records.filter(r => r.status === "pending_first_approval" || r.status === "pending_second_approval").length;
                const approvedCount  = records.filter(r => r.status === "approved").length;
                const disputedCount  = records.filter(r => r.disputed).length;
                const inProgressCount = records.filter(r => isShiftInProgress(r)).length;
                const signableCount  = records.filter(r => canAdminSign(r)).length;

                return (
                  <Card
                    key={eid}
                    className="overflow-hidden hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => setViewEmpId(eid)}
                    data-testid={`emp-group-card-${eid}`}
                  >
                    <div className="p-4 flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {emp?.av ?? eid.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{emp?.name ?? eid}</span>
                          {emp?.dept && <span className="text-xs text-muted-foreground">{emp.dept}</span>}
                          {signableCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded border bg-yellow-50 text-yellow-700 border-yellow-200 font-medium">
                              {signableCount} awaiting signature
                            </span>
                          )}
                          {disputedCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-200 font-medium">
                              {disputedCount} disputed
                            </span>
                          )}
                          {inProgressCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200 font-medium animate-pulse">
                              ● Shift in progress
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {dateFrom === dateTo
                              ? format(new Date(dateFrom + "T00:00:00"), "MMM d, yyyy")
                              : `${format(new Date(dateFrom + "T00:00:00"), "MMM d")} – ${format(new Date(dateTo + "T00:00:00"), "MMM d, yyyy")}`}
                          </span>
                          <span><strong className="text-foreground">{records.length}</strong> record{records.length !== 1 ? "s" : ""}</span>
                          <span>Reg: <strong className="text-foreground">{Math.round(totalReg * 10) / 10}h</strong></span>
                          {totalOt > 0 && <span>OT: <strong className="text-amber-600">{Math.round(totalOt * 10) / 10}h</strong></span>}
                          {approvedCount > 0 && <span className="text-green-700">{approvedCount} approved</span>}
                          {pendingCount > 0 && <span className="text-yellow-700">{pendingCount} pending</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setDeleteEmpId(eid); }}
                          data-testid={`button-delete-emp-records-${eid}`}
                          title="Delete all records for this employee"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Card>
                );
              });
          })()}
        </div>
      ) : (
        <div className="space-y-3">
          {(mineStatus === "all" ? displayTs : displayTs.filter(ts => {
            if (mineStatus === "pending")  return ts.status === "pending_employee" || ts.status === "pending_first_approval" || ts.status === "pending_second_approval";
            if (mineStatus === "approved") return ts.status === "approved";
            if (mineStatus === "rejected") return ts.status === "rejected";
            return true;
          })).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-border rounded-md">
              No records match the selected filter.
            </div>
          ) : null}
          {(mineStatus === "all" ? displayTs : displayTs.filter(ts => {
            if (mineStatus === "pending")  return ts.status === "pending_employee" || ts.status === "pending_first_approval" || ts.status === "pending_second_approval";
            if (mineStatus === "approved") return ts.status === "approved";
            if (mineStatus === "rejected") return ts.status === "rejected";
            return true;
          })).map((ts) => {
            const expanded    = expandedId === ts.id;
            const inProgress  = isInProgress(ts);
            const shiftActive = isShiftInProgress(ts);
            const isLocked    = ts.status !== "pending_employee";
            const emp         = empData(ts.eid);

            return (
              <Card key={ts.id} className="overflow-hidden" data-testid={`ts-card-${ts.id}`}>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {empAv(ts.eid)}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {/* Show employee name on General tab only — on My Timesheet it's always the current user */}
                      {(isFullAccess || isSupervisor) && tsTab === "general" && (
                        <span className="font-semibold text-sm">{empName(ts.eid)}</span>
                      )}
                      <span className="text-sm text-muted-foreground">{ts.date}</span>
                      {shiftActive ? (
                        <span className="text-xs px-2 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200 font-medium animate-pulse">
                          ● Shift in progress
                        </span>
                      ) : (
                        <StatusBadge status={ts.status} disputed={ts.disputed} />
                      )}
                      {isLocked && <Lock className="w-3 h-3 text-muted-foreground" title="Locked — submitted for approval" />}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> In: <strong className="text-foreground">{ts.ci ?? "--"}</strong></span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Out: <strong className="text-foreground">{ts.co ?? "--"}</strong></span>
                      <span>Reg: <strong className="text-foreground">{ts.reg}h</strong></span>
                      {(ts.ot ?? 0) > 0 && <span>OT: <strong className="text-amber-600">{ts.ot}h</strong></span>}
                      {ts.zone && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ts.zone}{ts.post ? ` · ${ts.post}` : ""}</span>}
                      {ts.edited && <span className="text-amber-500 font-medium">Edited</span>}
                      {(() => {
                        const mismatch = getZoneMismatch(ts);
                        if (!mismatch) return null;
                        return (
                          <span className="flex items-center gap-1 text-orange-600 font-medium" title={`Clocked out ${mismatch}m from ${ts.zone} zone`}>
                            <AlertTriangle className="w-3 h-3" /> Clocked out {mismatch}m outside zone
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Employee: review & sign — only available after clock-out */}
                    {canEmployeeReview(ts) && (
                      <>
                        <Button size="sm" onClick={() => openReview(ts)} data-testid={`button-review-sign-${ts.id}`}>
                          <PenLine className="w-3.5 h-3.5 mr-1" /> Review & Sign
                        </Button>
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-200"
                          onClick={() => { setDisputeModal(ts); setDisputeData({ ci: ts.ci ?? "", co: ts.co ?? "", reason: "", sigName: user.name }); }}>
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Dispute
                        </Button>
                      </>
                    )}

                    {/* In-progress notices */}
                    {inProgress && (
                      <span className="text-xs text-muted-foreground italic">Sign-off available after clock-out</span>
                    )}
                    {shiftActive && !inProgress && (hasTeamView) && (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Awaiting clock-out — signatures locked
                      </span>
                    )}

                    {/* Approver actions */}
                    {(canManagerSign(ts) || canAdminSign(ts)) && (
                      <>
                        <Button size="sm" onClick={() => { setApproverModal(ts); setApproverSigName(user.name); }} data-testid={`button-mgr-sign-${ts.id}`}>
                          <PenLine className="w-3.5 h-3.5 mr-1" /> Sign
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => submitReject(ts)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </>
                    )}

                    {/* Admin bypass — force approve skipping all signature stages */}
                    {canAdminBypass(ts) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                        onClick={() => { setBypassModal(ts); setBypassSigName(user.name); }}
                        data-testid={`button-admin-bypass-${ts.id}`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Force Approve
                      </Button>
                    )}

                    {/* Supervisor can edit pending_first_approval records before JGM signs */}
                    {canSupervisorEdit(ts) && (
                      <Button size="sm" variant="outline" onClick={() => openAdminEdit(ts)} data-testid={`button-sup-edit-ts-${ts.id}`}>
                        <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                    )}

                    {/* Admin override edit — for locked timesheets */}
                    {canAdminEdit(ts) && (
                      <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => openAdminEdit(ts)} data-testid={`button-admin-edit-${ts.id}`}>
                        <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                    )}

                    {/* Admin delete — General tab only */}
                    {isFullAccess && tsTab === "general" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={isDeleting}
                        onClick={async () => {
                          if (!window.confirm(`Delete this timesheet record for ${format(new Date(ts.date + "T00:00:00"), "MMM d, yyyy")}? This cannot be undone.`)) return;
                          try {
                            await deleteTimesheet(ts.id);
                            toast({ title: "Timesheet deleted" });
                          } catch {
                            toast({ title: "Failed to delete", variant: "destructive" });
                          }
                        }}
                        data-testid={`button-delete-ts-${ts.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : ts.id)} data-testid={`button-expand-${ts.id}`}>
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded: signatures & staged approval chain */}
                {expanded && (
                  <div className="border-t border-border bg-muted/20 px-5 py-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approval Chain & Signatures</p>

                    {/* ── STAGE PROMPT BANNER ─────────────────────────────── */}
                    {shiftActive && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
                        <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-blue-800">Shift still in progress</p>
                          <p className="text-xs text-blue-700 mt-0.5">
                            {ts.eid === user.userId
                              ? "Your shift hasn't ended yet. Once you clock out, you'll be prompted to review and sign. Signatures from your approvers will follow."
                              : `${empName(ts.eid)} is still clocked in. The signing chain will begin automatically once they clock out and self-sign.`
                            }
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                            <span className="font-semibold">Next step:</span>
                            <span>{ts.eid === user.userId ? "Clock out to unlock signing" : "Wait for employee to clock out"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {ts.status === "pending_first_approval" && (
                      <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 flex items-start gap-3">
                        <PenLine className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-yellow-800">Awaiting 1st Approval</p>
                          <p className="text-xs text-yellow-700 mt-0.5">
                            {empName(ts.eid)} has reviewed and signed their timesheet.{" "}
                            <strong>{emp?.fa ?? "1st Approver"}</strong> is now required to sign.
                          </p>
                          <div className="mt-1 text-xs text-yellow-700">
                            <span className="font-semibold">Next step:</span> 2nd Approver ({emp?.sa ?? "—"}) will be prompted after this signature.
                          </div>
                        </div>
                      </div>
                    )}

                    {ts.status === "pending_second_approval" && (
                      <div className="rounded-md border border-purple-200 bg-purple-50 px-4 py-3 flex items-start gap-3">
                        <PenLine className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-purple-800">Awaiting 2nd Approval</p>
                          <p className="text-xs text-purple-700 mt-0.5">
                            1st approval is complete.{" "}
                            <strong>{emp?.sa ?? "2nd Approver"}</strong> must now provide the final sign-off to fully approve this timesheet.
                          </p>
                          <div className="mt-1 text-xs text-purple-700">
                            <span className="font-semibold">Final step:</span> Approval will be complete once this signature is applied.
                          </div>
                        </div>
                      </div>
                    )}

                    {ts.status === "approved" && (
                      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        <p className="text-xs text-green-800 font-medium">Fully approved — all three signatures complete.</p>
                      </div>
                    )}

                    {/* ── SIGNATURE BLOCKS ──────────────────────────────── */}
                    <div className="space-y-1 pl-1">
                      <SigBlock sig={ts.eSig} label="① Employee Sign-off" />
                      <SigBlock sig={ts.f1Sig} label={`② 1st Approver (${emp?.fa ?? "—"})`} />
                      <SigBlock sig={ts.f2Sig} label={`③ 2nd Approver (${emp?.sa ?? "—"})`} />
                    </div>

                    {(() => {
                      const mismatch = getZoneMismatch(ts);
                      if (!mismatch) return null;
                      const empMobility = (users ?? []).find((u) => u.userId === ts.eid) as any;
                      const mob: string = empMobility?.mobility ?? "fixed";
                      return (
                        <div className="p-3 rounded border border-orange-200 bg-orange-50 text-xs text-orange-800">
                          <p className="font-semibold mb-1 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> Zone Mismatch Detected
                          </p>
                          <p>
                            Clock-out location was <strong>{mismatch}m</strong> outside the <strong>{ts.zone}</strong> geofence boundary.
                            {mob === "fixed"
                              ? " This employee is classified as Fixed — they should not have left their assigned zone."
                              : ` This employee is classified as ${mob.charAt(0).toUpperCase() + mob.slice(1)} — leaving the zone is permitted but has been logged.`
                            }
                          </p>
                        </div>
                      );
                    })()}

                    {ts.disputed && ts.disputeNote && (
                      <div className="p-3 rounded border border-orange-200 bg-orange-50 text-xs text-orange-800">
                        <p className="font-semibold mb-1">Dispute Details</p>
                        <p>{ts.disputeNote}</p>
                      </div>
                    )}
                    {ts.notes && (
                      <div className="p-3 rounded border border-border bg-background text-xs">
                        <p className="text-muted-foreground font-medium mb-0.5">Notes</p>
                        <p className="whitespace-pre-wrap">{ts.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Employee Review & Sign Modal ─────────────────────────────────── */}
      <Dialog open={!!reviewModal} onOpenChange={() => setReviewModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="w-4 h-4" /> Review & Sign Timesheet
            </DialogTitle>
          </DialogHeader>
          {reviewModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md bg-muted/30 border border-border px-4 py-2 text-sm text-muted-foreground">
                <strong className="text-foreground">{reviewModal.date}</strong>
                {reviewModal.zone && <> · Zone: <strong className="text-foreground">{reviewModal.zone}</strong></>}
              </div>

              <p className="text-xs text-muted-foreground">
                Review your shift details below. You may correct the times or add a note before signing. Once submitted, this record is locked.
              </p>

              {/* Editable times */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Clock In</Label>
                  <Input type="time" value={reviewForm.ci} onChange={(e) => setReviewForm({ ...reviewForm, ci: e.target.value })} data-testid="input-review-ci" />
                </div>
                <div className="space-y-1.5">
                  <Label>Clock Out</Label>
                  <Input type="time" value={reviewForm.co} onChange={(e) => setReviewForm({ ...reviewForm, co: e.target.value })} data-testid="input-review-co" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Break (minutes)</Label>
                <Input type="number" min={0} max={120} value={reviewForm.brk} onChange={(e) => setReviewForm({ ...reviewForm, brk: e.target.value })} data-testid="input-review-brk" />
              </div>

              {/* Calculated hours preview */}
              {reviewHours && (
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 flex gap-6 text-sm">
                  <div><p className="text-xs text-muted-foreground">Regular</p><p className="font-bold text-lg">{reviewHours.reg}h</p></div>
                  {reviewHours.ot > 0 && <div><p className="text-xs text-amber-600">Overtime</p><p className="font-bold text-lg text-amber-600">{reviewHours.ot}h</p></div>}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} placeholder="Any comments about your shift..." rows={2} data-testid="input-review-notes" />
              </div>

              {/* Divider */}
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  By signing below, I confirm these times are accurate and submit this record for management approval. This action cannot be undone.
                </p>
                <div className="space-y-1.5">
                  <Label>Full Name (typed signature)</Label>
                  <Input value={reviewForm.sigName} onChange={(e) => setReviewForm({ ...reviewForm, sigName: e.target.value })} placeholder="Type your full name" data-testid="input-review-sig" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Timestamp: {format(new Date(), "yyyy-MM-dd HH:mm")} · web</p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setReviewModal(null)}>Cancel</Button>
                <Button onClick={submitReview} disabled={!reviewForm.sigName.trim() || !reviewForm.ci || !reviewForm.co} data-testid="button-confirm-review">
                  <PenLine className="w-4 h-4 mr-1.5" /> Sign & Submit
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Admin Override Edit Modal ─────────────────────────────────────── */}
      <Dialog open={!!adminEditModal} onOpenChange={() => setAdminEditModal(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" /> Admin Edit Override
            </DialogTitle>
          </DialogHeader>
          {adminEditModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This timesheet is locked (status: <strong>{adminEditModal.status}</strong>). Changes are logged as an admin override.
              </div>
              <div className="rounded-md bg-muted/30 border border-border px-4 py-2 text-sm">
                <strong>{empName(adminEditModal.eid)}</strong> · {adminEditModal.date}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Clock In</Label>
                  <Input type="time" value={adminForm.ci} onChange={(e) => setAdminForm({ ...adminForm, ci: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Clock Out</Label>
                  <Input type="time" value={adminForm.co} onChange={(e) => setAdminForm({ ...adminForm, co: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Break (minutes)</Label>
                <Input type="number" min={0} max={120} value={adminForm.brk} onChange={(e) => setAdminForm({ ...adminForm, brk: e.target.value })} />
              </div>
              {adminHours && (
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 flex gap-6 text-sm">
                  <div><p className="text-xs text-muted-foreground">Regular</p><p className="font-bold text-lg">{adminHours.reg}h</p></div>
                  {adminHours.ot > 0 && <div><p className="text-xs text-amber-600">Overtime</p><p className="font-bold text-lg text-amber-600">{adminHours.ot}h</p></div>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Day Status</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={adminForm.dayStatus} onChange={(e) => setAdminForm({ ...adminForm, dayStatus: e.target.value, holidayType: "" })}>
                    <option value="">— None —</option>
                    {DAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Holiday Type</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={adminForm.holidayType} onChange={(e) => setAdminForm({ ...adminForm, holidayType: e.target.value })}
                    disabled={adminForm.dayStatus !== "Holiday"}>
                    <option value="">— None —</option>
                    {HOLIDAY_TYPES.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Armed Status</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={adminForm.armed} onChange={(e) => setAdminForm({ ...adminForm, armed: e.target.value })}>
                    <option value="">— None —</option>
                    {ARMED_STATUSES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Client / Agency</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={adminForm.client} onChange={(e) => setAdminForm({ ...adminForm, client: e.target.value })}>
                    <option value="">— None —</option>
                    {CLIENT_AGENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Public Holiday Hrs</Label>
                  <Input type="number" min={0} step={0.5} value={adminForm.ph} onChange={(e) => setAdminForm({ ...adminForm, ph: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Meals</Label>
                  <Input type="number" min={0} max={2} value={adminForm.meals} onChange={(e) => setAdminForm({ ...adminForm, meals: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={adminForm.notes} onChange={(e) => setAdminForm({ ...adminForm, notes: e.target.value })} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Reason for edit <span className="text-muted-foreground font-normal">(logged in audit)</span></Label>
                <Input value={adminForm.reason} onChange={(e) => setAdminForm({ ...adminForm, reason: e.target.value })} placeholder="e.g. System error correction" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAdminEditModal(null)}>Cancel</Button>
                <Button onClick={submitAdminEdit} className="bg-amber-600 hover:bg-amber-700">
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> Save Override
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Admin Bypass (Force Approve) Modal ────────────────────────────── */}
      <Dialog open={!!bypassModal} onOpenChange={() => { setBypassModal(null); setBypassSigName(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Admin Override Approval
            </DialogTitle>
          </DialogHeader>
          {bypassModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-1.5">
                <p><span className="text-muted-foreground">Employee:</span> <strong>{empName(bypassModal.eid)}</strong></p>
                <p><span className="text-muted-foreground">Date:</span> <strong>{bypassModal.date}</strong> · <strong>{bypassModal.ci} – {bypassModal.co}</strong></p>
                <p><span className="text-muted-foreground">Hours:</span> <strong>{bypassModal.reg}h reg + {bypassModal.ot ?? 0}h OT</strong></p>
                <p><span className="text-muted-foreground">Current stage:</span> <strong className="capitalize">{bypassModal.status.replace(/_/g, " ")}</strong></p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>This will <strong>skip all pending signature stages</strong> (employee sign-off, 1st and 2nd approver) and immediately mark the timesheet as <strong>Approved</strong>. An audit note will be recorded. Use only when operationally necessary.</span>
              </div>
              <div className="space-y-1.5">
                <Label>Your Full Name (typed signature)</Label>
                <Input
                  value={bypassSigName}
                  onChange={(e) => setBypassSigName(e.target.value)}
                  placeholder="Type your full name to confirm"
                  data-testid="input-bypass-sig-name"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                By typing your name you apply a binding admin-override signature. Timestamp and override reason will be recorded in the timesheet notes.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setBypassModal(null); setBypassSigName(""); }}>Cancel</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={submitAdminBypass}
                  disabled={!bypassSigName.trim()}
                  data-testid="button-confirm-bypass-approve"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> Approve Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approver Sign Modal ───────────────────────────────────────────── */}
      <Dialog open={!!approverModal} onOpenChange={() => setApproverModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Approver Electronic Signature</DialogTitle></DialogHeader>
          {approverModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> <strong>{empName(approverModal.eid)}</strong></p>
                <p><span className="text-muted-foreground">Date:</span> <strong>{approverModal.date}</strong> · <strong>{approverModal.ci} – {approverModal.co}</strong></p>
                <p><span className="text-muted-foreground">Hours:</span> <strong>{approverModal.reg}h reg + {approverModal.ot}h OT</strong></p>
                <p><span className="text-muted-foreground">Stage:</span> <strong>{approverModal.status === "pending_first_approval" ? "1st Approver Signature" : "2nd Approver (Final) Signature"}</strong></p>
                {approverModal.disputed && <p className="text-orange-600 font-medium">⚑ Dispute raised on this record</p>}
                {approverModal.notes && <p className="text-muted-foreground text-xs mt-1">Notes: {approverModal.notes}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Your Full Name (typed signature)</Label>
                <Input value={approverSigName} onChange={(e) => setApproverSigName(e.target.value)} placeholder="Type your full name" data-testid="input-approver-sig" />
              </div>
              <p className="text-xs text-muted-foreground">By signing, you approve this timesheet. Timestamp: {format(new Date(), "yyyy-MM-dd HH:mm")}</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setApproverModal(null)}>Cancel</Button>
                <Button onClick={submitApproverSig} disabled={!approverSigName.trim()} data-testid="button-approver-confirm-sig">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve & Sign
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dispute Modal ─────────────────────────────────────────────────── */}
      <Dialog open={!!disputeModal} onOpenChange={() => setDisputeModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Raise a Dispute</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">If the recorded times are incorrect, enter your claimed times and explain the discrepancy.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Claimed Clock In</Label>
                <Input type="time" value={disputeData.ci} onChange={(e) => setDisputeData({ ...disputeData, ci: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Claimed Clock Out</Label>
                <Input type="time" value={disputeData.co} onChange={(e) => setDisputeData({ ...disputeData, co: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason / Explanation</Label>
              <Textarea value={disputeData.reason} onChange={(e) => setDisputeData({ ...disputeData, reason: e.target.value })} placeholder="Explain the discrepancy..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Your Full Name (typed signature)</Label>
              <Input value={disputeData.sigName} onChange={(e) => setDisputeData({ ...disputeData, sigName: e.target.value })} placeholder="Type your full name" data-testid="input-dispute-sig" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDisputeModal(null)}>Cancel</Button>
              <Button variant="destructive" onClick={submitDispute} disabled={!disputeData.reason || !disputeData.sigName.trim()} data-testid="button-submit-dispute">
                <AlertTriangle className="w-4 h-4 mr-1.5" /> Submit Dispute
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Employee Records Confirmation ─────────────────────────── */}
      {(() => {
        const emp = deleteEmpId ? empData(deleteEmpId) : null;
        const empRecords = deleteEmpId ? teamTs.filter(t => t.eid === deleteEmpId) : [];
        const handleDeleteAll = async () => {
          if (!deleteEmpId) return;
          setDeleteEmpPending(true);
          for (const ts of empRecords) {
            try { await deleteTimesheet(ts.id); } catch { /* skip */ }
          }
          setDeleteEmpPending(false);
          setDeleteEmpId(null);
          toast({ title: `${empRecords.length} record${empRecords.length !== 1 ? "s" : ""} deleted for ${emp?.name ?? deleteEmpId}` });
        };
        return (
          <Dialog open={!!deleteEmpId} onOpenChange={(o) => { if (!o && !deleteEmpPending) setDeleteEmpId(null); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-destructive" />
                  Delete All Records
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-1">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete all <strong>{empRecords.length} timesheet record{empRecords.length !== 1 ? "s" : ""}</strong> for{" "}
                  <strong>{emp?.name ?? deleteEmpId}</strong>. This cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDeleteEmpId(null)} disabled={deleteEmpPending}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAll}
                    disabled={deleteEmpPending}
                    data-testid="button-confirm-delete-emp-records"
                  >
                    {deleteEmpPending ? (
                      <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</span>
                    ) : (
                      <span className="flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Delete {empRecords.length} Record{empRecords.length !== 1 ? "s" : ""}</span>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Employee Timesheets Dialog (General tab grouped view) ─────────── */}
      {(() => {
        const empTs = viewEmpId ? teamTs.filter(t => t.eid === viewEmpId) : [];
        const emp   = viewEmpId ? empData(viewEmpId) : null;
        return (
          <Dialog open={!!viewEmpId} onOpenChange={(o) => { if (!o) { setViewEmpId(null); setExpandedId(null); } }}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {emp?.av ?? viewEmpId?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span>{emp?.name ?? viewEmpId}</span>
                    {emp && <span className="ml-2 text-sm font-normal text-muted-foreground">{emp.dept} · {emp.pos}</span>}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 mt-2">
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-b border-border pb-3">
                  <span><strong className="text-foreground">{empTs.length}</strong> record{empTs.length !== 1 ? "s" : ""}</span>
                  <span>Reg: <strong className="text-foreground">{Math.round(empTs.reduce((s, t) => s + (t.reg ?? 0), 0) * 10) / 10}h</strong></span>
                  {empTs.reduce((s, t) => s + (t.ot ?? 0), 0) > 0 && (
                    <span>OT: <strong className="text-amber-600">{Math.round(empTs.reduce((s, t) => s + (t.ot ?? 0), 0) * 10) / 10}h</strong></span>
                  )}
                  <span className="text-green-700">{empTs.filter(t => t.status === "approved").length} approved</span>
                  <span className="text-yellow-700">{empTs.filter(t => t.status === "pending_first_approval" || t.status === "pending_second_approval").length} pending</span>
                  {empTs.filter(t => t.disputed).length > 0 && (
                    <span className="text-orange-600">{empTs.filter(t => t.disputed).length} disputed</span>
                  )}
                  {/* Sign All button — only for signers when there are signable records */}
                  {isFullAccess && empTs.filter(t => canAdminSign(t)).length > 0 && (
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setSignAllEmpId(viewEmpId);
                        setSignAllName(user.name);
                        setSignAllOpen(true);
                      }}
                      data-testid="button-dialog-sign-all"
                    >
                      <PenSquare className="w-3.5 h-3.5 mr-1.5" />
                      Sign All
                      <span className="ml-1.5 bg-white/20 text-white text-xs rounded-full px-1.5 py-0">
                        {empTs.filter(t => canAdminSign(t)).length}
                      </span>
                    </Button>
                  )}
                </div>

                {/* Individual timesheet cards */}
                {[...empTs].sort((a, b) => b.date.localeCompare(a.date)).map((ts) => {
                  const expanded    = expandedId === ts.id;
                  const shiftActive = isShiftInProgress(ts);

                  return (
                    <Card key={ts.id} className="overflow-hidden" data-testid={`emp-dialog-ts-${ts.id}`}>
                      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        {/* Date + status */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{format(new Date(ts.date + "T00:00:00"), "EEE, MMM d, yyyy")}</span>
                            {shiftActive ? (
                              <span className="text-xs px-2 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200 font-medium animate-pulse">● In progress</span>
                            ) : (
                              <StatusBadge status={ts.status} disputed={ts.disputed} />
                            )}
                            {ts.edited && <span className="text-xs text-amber-500 font-medium">Edited</span>}
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ts.ci ?? "--"} – {ts.co ?? "--"}</span>
                            <span>Reg: <strong className="text-foreground">{ts.reg}h</strong></span>
                            {(ts.ot ?? 0) > 0 && <span>OT: <strong className="text-amber-600">{ts.ot}h</strong></span>}
                            {ts.brk > 0 && <span>Brk: {ts.brk}m</span>}
                            {ts.zone && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ts.zone}{ts.post ? ` · ${ts.post}` : ""}</span>}
                            {ts.notes && <span className="italic truncate max-w-[200px]" title={ts.notes}>{ts.notes}</span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          {(canManagerSign(ts) || canAdminSign(ts)) && (
                            <>
                              <Button size="sm" onClick={() => { setApproverModal(ts); setApproverSigName(user.name); }} data-testid={`button-dialog-sign-${ts.id}`}>
                                <PenLine className="w-3.5 h-3.5 mr-1" /> Sign
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => submitReject(ts)}>
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {(canAdminEdit(ts) || canSupervisorEdit(ts)) && (
                            <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => openAdminEdit(ts)} data-testid={`button-dialog-edit-${ts.id}`}>
                              <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                            </Button>
                          )}
                          {isFullAccess && (
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
                              disabled={isDeleting}
                              onClick={async () => {
                                if (!window.confirm(`Delete this timesheet for ${format(new Date(ts.date + "T00:00:00"), "MMM d, yyyy")}? This cannot be undone.`)) return;
                                try { await deleteTimesheet(ts.id); toast({ title: "Timesheet deleted" }); }
                                catch { toast({ title: "Failed to delete", variant: "destructive" }); }
                              }}
                              data-testid={`button-dialog-delete-${ts.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : ts.id)} data-testid={`button-dialog-expand-${ts.id}`}>
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded signature chain */}
                      {expanded && (
                        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approval Chain</p>
                          <SigBlock sig={ts.eSig}  label="Employee Signature" />
                          <SigBlock sig={ts.f1Sig} label="1st Approver" />
                          <SigBlock sig={ts.f2Sig} label="2nd Approver (Final)" />
                          {ts.disputeNote && (
                            <div className="text-xs text-orange-700 bg-orange-50 rounded p-2 mt-1">
                              <strong>Dispute:</strong> {ts.disputeNote}
                            </div>
                          )}
                          {ts.notes && (
                            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                              <strong>Notes:</strong> {ts.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Sign All Dialog ───────────────────────────────────────────────── */}
      {(() => {
        const signAllTarget = teamTs.filter(ts => canAdminSign(ts) && (!signAllEmpId || ts.eid === signAllEmpId));
        const signAllEmpName = signAllEmpId ? (empData(signAllEmpId)?.name ?? signAllEmpId) : null;
        return (
      <Dialog open={signAllOpen} onOpenChange={(o) => { if (!o && !signAllPending) { setSignAllOpen(false); setSignAllName(""); setSignAllEmpId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenSquare className="w-5 h-5 text-primary" />
              {signAllEmpName ? `Sign All — ${signAllEmpName}` : "Sign All Pending Timesheets"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Timesheets to approve:</span>{" "}
                <strong>{signAllTarget.length}</strong>
                {signAllEmpName && <span className="text-muted-foreground"> for {signAllEmpName}</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Each timesheet awaiting your signature will be advanced one stage. Timesheets at 1st sign-off will move to 2nd, and those at 2nd will be fully approved.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Your Full Name (typed signature)</Label>
              <Input
                value={signAllName}
                onChange={(e) => setSignAllName(e.target.value)}
                placeholder="Type your full name"
                disabled={signAllPending}
                data-testid="input-sign-all-name"
                onKeyDown={(e) => { if (e.key === "Enter" && signAllName.trim()) submitSignAll(); }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              By signing, you approve all eligible timesheets. Timestamp: {format(new Date(), "yyyy-MM-dd HH:mm")}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setSignAllOpen(false); setSignAllName(""); }} disabled={signAllPending}>
                Cancel
              </Button>
              <Button
                onClick={submitSignAll}
                disabled={!signAllName.trim() || signAllPending}
                data-testid="button-confirm-sign-all"
              >
                {signAllPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Approve All
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        );
      })()}

      {/* ── Bulk Upload Dialog ─────────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!o) { setBulkOpen(false); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Bulk Timesheet Upload
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Instructions */}
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Accepted column headers (flexible naming):</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                  <span><strong>Full Name / Employee</strong> — <span className="text-red-600 font-semibold">required</span></span>
                  <span><strong>Date / Work Date</strong> — <span className="text-red-600 font-semibold">required</span> (yyyy-MM-dd)</span>
                  <span><strong>Clock In / In / Start Time</strong> — <span className="text-red-600 font-semibold">required</span> (HH:mm)</span>
                  <span><strong>Clock Out / Out / End Time</strong> — <span className="text-red-600 font-semibold">required</span> (HH:mm)</span>
                  <span><strong>Zone / Location</strong> — optional</span>
                  <span><strong>Post / Post Name</strong> — optional</span>
                  <span><strong>Break / Break Minutes</strong> — optional</span>
                  <span><strong>Notes / Remarks</strong> — optional <span className="text-green-700">(write "Report Sick", "Sick", "Absent", or "Annual Leave" to skip clock times)</span></span>
                </div>
              </div>
            </div>

            {/* File picker */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                data-testid="input-bulk-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) parseExcelFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-choose-file"
              >
                <Upload className="w-4 h-4 mr-2" />
                {bulkFileName ? "Change File" : "Choose File (.xlsx / .csv)"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const template = [
                    {
                      "Full Name": "Sydell Griffith",
                      "Date": "2026-02-01",
                      "Clock In": "08:00",
                      "Clock Out": "16:00",
                      "Zone": "HEAD OFFICE",
                      "Post": "Post 1",
                      "Break Minutes": 30,
                      "Notes": "",
                    },
                    {
                      "Full Name": "Shemar Spencer",
                      "Date": "2026-02-01",
                      "Clock In": "07:30",
                      "Clock Out": "15:30",
                      "Zone": "CARICOM",
                      "Post": "Neptune P1",
                      "Break Minutes": 30,
                      "Notes": "Night shift",
                    },
                  ];
                  const ws = XLSX.utils.json_to_sheet(template);
                  const colWidths = [
                    { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 11 },
                    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
                  ];
                  ws["!cols"] = colWidths;
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Timesheets");
                  XLSX.writeFile(wb, "fms_timesheet_template.xlsx");
                }}
                data-testid="button-download-template"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Download Template
              </Button>
              {bulkFileName && (
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  {bulkFileName}
                </span>
              )}
            </div>

            {/* Preview table */}
            {bulkRows.length > 0 && (
              <div>
                {/* Smart summary — computed automatically */}
                {(() => {
                  const u = users ?? [];
                  let newCount = 0, updateCount = 0, mergedCount = 0, errorCount = 0;
                  for (const r of bulkRows) {
                    if (r.error) { errorCount++; continue; }
                    const matched = u.some(x => x.name.toLowerCase() === r.empName.toLowerCase() || x.userId.toLowerCase() === r.empName.toLowerCase());
                    if (!matched) { errorCount++; continue; }
                    if (r.mergedFrom > 1) mergedCount++;
                    if (findDuplicateTs(r)) updateCount++;
                    else newCount++;
                  }
                  return (
                    <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
                      <span className="text-muted-foreground font-medium">{bulkRows.length} unique record{bulkRows.length !== 1 ? "s" : ""} identified</span>
                      {newCount    > 0 && <span className="text-green-700 font-medium">✓ {newCount} new</span>}
                      {updateCount > 0 && <span className="text-blue-600 font-medium">↻ {updateCount} will update</span>}
                      {mergedCount > 0 && <span className="text-amber-600 font-medium">⊕ {mergedCount} merged from file</span>}
                      {errorCount  > 0 && <span className="text-red-600 font-medium">✕ {errorCount} cannot process</span>}
                    </div>
                  );
                })()}
                <div className="rounded-md border border-border overflow-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Row</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Employee</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">In / Day Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Out</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Zone</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Post</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Brk</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bulkRows.map((row) => {
                        const allU = users ?? [];
                        const matched = !row.error && allU.some((u) => u.name.toLowerCase() === row.empName.toLowerCase() || u.userId.toLowerCase() === row.empName.toLowerCase());
                        const existing = matched ? findDuplicateTs(row) : null;
                        const hasIssue = !!row.error || !matched;
                        const isMerged = row.mergedFrom > 1;
                        const rowBg = hasIssue
                          ? "bg-red-50 dark:bg-red-900/10"
                          : existing
                            ? "bg-blue-50 dark:bg-blue-900/10"
                            : isMerged
                              ? "bg-amber-50 dark:bg-amber-900/10"
                              : "";
                        return (
                          <tr key={row.rowNum} className={rowBg}>
                            <td className="px-3 py-1.5 text-muted-foreground">{row.rowNum}</td>
                            <td className="px-3 py-1.5">
                              {row.error ? (
                                <span className="flex items-center gap-1 text-red-600">
                                  <XCircleIcon className="w-3.5 h-3.5" />
                                  <span>{row.error}</span>
                                </span>
                              ) : !matched ? (
                                <span className="flex items-center gap-1 text-red-600">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Employee not found
                                </span>
                              ) : existing ? (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <Info className="w-3.5 h-3.5" />
                                  Update existing
                                  {isMerged && <span className="ml-1 text-amber-600">(merged {row.mergedFrom} rows)</span>}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-green-700">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  New{isMerged ? ` (merged ${row.mergedFrom} rows)` : ""}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-medium">{row.empName}</td>
                            <td className="px-3 py-1.5">{row.date}</td>
                            <td className="px-3 py-1.5">
                              {row.dayStatus ? <span className="text-orange-600 font-medium">{row.dayStatus}</span> : row.ci}
                            </td>
                            <td className="px-3 py-1.5">{row.dayStatus ? "—" : (row.co ?? "—")}</td>
                            <td className="px-3 py-1.5">{row.zone ?? "—"}</td>
                            <td className="px-3 py-1.5">{row.post ?? "—"}</td>
                            <td className="px-3 py-1.5">{row.brk}m</td>
                            <td className="px-3 py-1.5 max-w-[120px] truncate">{row.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {bulkRows.length === 0 && bulkFileName === "" && (
              <div className="text-center py-10 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
                No file selected. Choose an Excel or CSV file to preview records before uploading.
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button
                onClick={handleBulkUpload}
                disabled={bulkRows.length === 0 || isBulkUploading}
                data-testid="button-confirm-bulk-upload"
              >
                {isBulkUploading ? (
                  <span className="flex items-center gap-1.5"><Upload className="w-4 h-4 animate-bounce" /> Uploading…</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> Upload Timesheets</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
