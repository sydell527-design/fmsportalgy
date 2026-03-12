import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { ClockInOut } from "@/components/ClockInOut";
import { useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { useRequests } from "@/hooks/use-requests";
import { useUsers } from "@/hooks/use-users";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Users, Clock, CheckCircle2, AlertTriangle, FileText,
  TrendingUp, Calendar, PenLine, XCircle, Building2,
  Trash2, Shield, ShieldOff, Radio, Search, ChevronDown,
  ChevronRight, LayoutDashboard, RefreshCw, Filter,
  Maximize2, Minimize2, MapPin, Briefcase, LogOut, Loader2,
  UserCheck, UserX, ClipboardList, Timer, ChevronUp,
} from "lucide-react";
import { format, differenceInMinutes, parse, startOfMonth, endOfMonth } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet, Schedule } from "@shared/schema";

// ── helpers ────────────────────────────────────────────────────────────────────
function statusColor(s: string) {
  if (s === "approved") return "bg-green-100 text-green-700 border-green-200";
  if (s === "rejected") return "bg-red-100 text-red-700 border-red-200";
  if (s === "pending_second_approval") return "bg-purple-100 text-purple-700 border-purple-200";
  if (s === "pending_first_approval") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (s === "pending_employee") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground";
}
function statusLabel(s: string) {
  const m: Record<string, string> = {
    approved: "Approved", rejected: "Rejected",
    pending_second_approval: "Awaiting 2nd Sign-off",
    pending_first_approval: "Awaiting 1st Sign-off",
    pending_employee: "Awaiting Your Signature",
  };
  return m[s] ?? s;
}
function computeElapsed(ci: string, date: string): string {
  const now = new Date();
  const start = parse(`${date} ${ci}`, "yyyy-MM-dd HH:mm", new Date());
  const totalMin = Math.max(0, differenceInMinutes(now, start));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((now.getTime() - (start.getTime() + totalMin * 60000)) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${Math.max(0, s)}s`;
}

// Real-time ticking elapsed counter — updates every second
function LiveElapsed({ ci, date, className }: { ci: string; date: string; className?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className={className}>{computeElapsed(ci, date)}</span>;
}
function fmtDate(d: string) { return format(new Date(d + "T00:00"), "d MMM yy"); }

// ── KPI stat card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color = "text-foreground", sub }: {
  label: string; value: string | number; icon: any; color?: string; sub?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-start gap-3 shadow-sm" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium leading-tight truncate">{label}</p>
        <p className={`text-2xl font-bold leading-tight mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Adherence Panel Component ──────────────────────────────────────────────────
type AdherenceRow = {
  sched: Schedule;
  emp: { name: string; pos: string; av: string; status: string } | undefined;
  ts: Timesheet | undefined;
  status: "on-time" | "late" | "not-in" | "absent" | "done";
  lateMins: number;
};

function AdherencePanel({
  rows,
  summary,
  adherenceFilter,
  setAdherenceFilter,
  openEndShift,
  isAdmin,
  isSupervisor,
}: {
  rows: AdherenceRow[];
  summary: { total: number; onTime: number; late: number; notIn: number; absent: number; done: number };
  adherenceFilter: string;
  setAdherenceFilter: (v: any) => void;
  openEndShift: (ts: Timesheet) => void;
  isAdmin: boolean;
  isSupervisor: boolean;
}) {
  const chips = [
    { key: "all",      label: "All",      count: summary.total,   color: "bg-muted text-muted-foreground border-border" },
    { key: "not-in",   label: "Not In",   count: summary.notIn,   color: "bg-red-50 text-red-700 border-red-200" },
    { key: "late",     label: "Late",     count: summary.late,    color: "bg-purple-50 text-purple-700 border-purple-200" },
    { key: "absent",   label: "Absent",   count: summary.absent,  color: "bg-orange-50 text-orange-700 border-orange-200" },
    { key: "on-time",  label: "On Time",  count: summary.onTime,  color: "bg-green-50 text-green-700 border-green-200" },
    { key: "done",     label: "Done",     count: summary.done,    color: "bg-blue-50 text-blue-700 border-blue-200" },
  ];

  function statusInfo(r: AdherenceRow) {
    if (r.status === "on-time")  return { icon: <UserCheck className="w-3.5 h-3.5 text-green-600" />, label: "On Time",    bg: "border-green-200 bg-green-50" };
    if (r.status === "late")     return { icon: <Timer className="w-3.5 h-3.5 text-purple-600" />,    label: `Late ${r.lateMins}m`, bg: "border-purple-200 bg-purple-50" };
    if (r.status === "not-in")   return { icon: <UserX className="w-3.5 h-3.5 text-red-500" />,       label: "Not In",     bg: "border-red-200 bg-red-50" };
    if (r.status === "absent")   return { icon: <XCircle className="w-3.5 h-3.5 text-orange-600" />,  label: r.ts?.dayStatus ?? "Absent", bg: "border-orange-200 bg-orange-50" };
    if (r.status === "done")     return { icon: <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />, label: `Done ${r.ts?.co ?? ""}`, bg: "border-blue-200 bg-blue-50" };
    return { icon: null, label: r.status, bg: "" };
  }

  if (summary.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <ClipboardList className="w-8 h-8 opacity-20" />
        <p className="text-sm">No shifts scheduled for today</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Summary strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 py-3 border-b bg-muted/10">
        {[
          { label: "Scheduled", value: summary.total, color: "text-foreground" },
          { label: "On Time",   value: summary.onTime, color: "text-green-600" },
          { label: "Late",      value: summary.late,   color: "text-purple-600" },
          { label: "Not In",    value: summary.notIn,  color: "text-red-600" },
          { label: "Absent",    value: summary.absent, color: "text-orange-600" },
          { label: "Done",      value: summary.done,   color: "text-blue-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b shrink-0">
        {chips.map(({ key, label, count, color }) => (
          <button
            key={key}
            onClick={() => setAdherenceFilter(key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap border transition-colors ${
              adherenceFilter === key
                ? "bg-primary text-primary-foreground border-primary"
                : color
            }`}
            data-testid={`filter-adherence-${key}`}
          >
            {label} {count > 0 && <span className="ml-1 font-bold">{count}</span>}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y overflow-y-auto max-h-[60vh] md:max-h-none">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
            <CheckCircle2 className="w-6 h-6 opacity-20" />
            <p className="text-xs">No records match this filter</p>
          </div>
        ) : rows.map(({ sched, emp, ts, status, lateMins }) => {
          const si = statusInfo({ sched, emp, ts, status, lateMins });
          const av = emp?.av ?? sched.eid.slice(0, 2).toUpperCase();
          return (
            <div key={sched.eid} className={`flex items-center gap-3 px-4 py-3 ${si.bg} border-l-4`} data-testid={`adherence-row-${sched.eid}`}>
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-white/80 border flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                {av}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{emp?.name ?? sched.eid}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    Scheduled {sched.shiftStart}–{sched.shiftEnd}
                  </span>
                  {ts?.ci && <span>Clocked in: <strong className="text-foreground">{ts.ci}</strong></span>}
                  {sched.client && <span className="flex items-center gap-0.5"><Briefcase className="w-3 h-3" />{sched.client}</span>}
                </div>
              </div>
              {/* Status badge */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="flex items-center gap-1 text-xs font-medium">
                  {si.icon} {si.label}
                </span>
                {(isAdmin || isSupervisor) && ts?.ci && !ts?.co && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => openEndShift(ts!)}
                    data-testid={`button-adherence-end-${sched.eid}`}
                  >
                    <LogOut className="w-3 h-3 mr-1" /> End
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { data: requests } = useRequests();
  const { data: users } = useUsers();
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user.role === "admin" || user.role === "manager";
  const isSupervisor =
    !isAdmin &&
    ((user.pos ?? "").toLowerCase().includes("supervisor") ||
      (users ?? []).some((u) => u.userId !== user.userId && (u.fa === user.pos || u.sa === user.pos)));

  // ── Admin/Supervisor schedule data ──────────────────────────────────────────
  const { data: allSchedules, refetch: refetchSchedules } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules/all"],
    enabled: isAdmin || isSupervisor,
  });

  // ── Filters ─────────────────────────────────────────────────────────────────
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo,   setDateTo]   = useState(format(endOfMonth(new Date()),   "yyyy-MM-dd"));
  const [agencyFilter, setAgencyFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [rosterView, setRosterView] = useState<"agency" | "employee">("agency");

  // ── Approval state ───────────────────────────────────────────────────────────
  const [sigModal, setSigModal] = useState<{ ts: Timesheet; role: "approver" } | null>(null);
  const [sigName, setSigName] = useState("");
  const [rejectModal, setRejectModal] = useState<Timesheet | null>(null);

  // ── Delete confirmation ──────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{
    label: string; eids: string[]; startDate: string; endDate: string; count: number;
  } | null>(null);

  // ── End-shift state (admin/supervisor force clock-out) ───────────────────────
  const [endShiftTarget, setEndShiftTarget] = useState<Timesheet | null>(null);
  const [endShiftCo,    setEndShiftCo]      = useState("");
  const [endShiftBrk,   setEndShiftBrk]     = useState("30");
  const [endShiftNote,  setEndShiftNote]     = useState("");
  const [endShiftBusy,  setEndShiftBusy]     = useState(false);

  function openEndShift(ts: Timesheet) {
    const now = new Date();
    setEndShiftCo(format(now, "HH:mm"));
    setEndShiftBrk("30");
    setEndShiftNote(`Shift ended by ${user.name}`);
    setEndShiftTarget(ts);
  }

  async function handleEndShift() {
    if (!endShiftTarget) return;
    setEndShiftBusy(true);
    try {
      const ci = endShiftTarget.ci ?? "00:00";
      const co = endShiftCo;
      const brk = parseInt(endShiftBrk, 10) || 0;
      const [ch, cm] = ci.split(":").map(Number);
      const [oh, om] = co.split(":").map(Number);
      let totalMins = oh * 60 + om - (ch * 60 + cm);
      if (totalMins < 0) totalMins += 24 * 60; // overnight
      const workMins = Math.max(0, totalMins - brk);
      const totalH = Math.round((workMins / 60) * 100) / 100;
      const reg = Math.min(8, totalH);
      const ot  = Math.max(0, totalH - 8);
      await updateTimesheet({
        id:    endShiftTarget.id,
        co,
        reg:   Math.round(reg * 100) / 100,
        ot:    Math.round(ot  * 100) / 100,
        ph:    0,
        brk,
        meals: totalH >= 8 ? 1 : 0,
        status: "pending_employee",
        notes: endShiftNote || `Shift ended by ${user.name}`,
      });
      toast({ title: "Shift ended", description: `${userMap[endShiftTarget.eid]?.name ?? endShiftTarget.eid} clocked out at ${co}` });
      setEndShiftTarget(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setEndShiftBusy(false);
    }
  }

  // ── Expand state (agency cards) ──────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // ── Mobile dashboard tab (admin) ─────────────────────────────────────────────
  const [mobileDashTab, setMobileDashTab] = useState<"roster" | "ops" | "adherence">("ops");

  // ── Live refresh tick ────────────────────────────────────────────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = todayStr;
  const yesterday = format(new Date(Date.now() - 86_400_000), "yyyy-MM-dd");
  const currentMonth = format(new Date(), "yyyy-MM");

  // ── Maps ─────────────────────────────────────────────────────────────────────
  const userMap = useMemo(() => {
    const m: Record<string, { name: string; pos: string; av: string; status: string }> = {};
    for (const u of users ?? []) {
      m[u.userId] = { name: u.name, pos: u.pos ?? "", av: u.av ?? u.name.charAt(0), status: u.status };
    }
    return m;
  }, [users]);

  // ── Filtered schedules (within date range) ───────────────────────────────────
  const filteredSchedules = useMemo(() => {
    return (allSchedules ?? []).filter((s) => {
      if (s.date < dateFrom || s.date > dateTo) return false;
      if (agencyFilter !== "ALL" && s.client !== agencyFilter) return false;
      if (search) {
        const name = (userMap[s.eid]?.name ?? "").toLowerCase();
        if (!name.includes(search.toLowerCase()) && !s.eid.includes(search)) return false;
      }
      return true;
    });
  }, [allSchedules, dateFrom, dateTo, agencyFilter, search, userMap]);

  // ── Agency list for filter ───────────────────────────────────────────────────
  const allAgencies = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSchedules ?? []) if (s.client) set.add(s.client);
    return Array.from(set).sort();
  }, [allSchedules]);

  // ── Grouped by agency ────────────────────────────────────────────────────────
  const agencyGroups = useMemo(() => {
    const g: Record<string, Schedule[]> = {};
    for (const s of filteredSchedules) {
      const k = s.client ?? "Unassigned";
      if (!g[k]) g[k] = [];
      g[k].push(s);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSchedules]);

  // ── Grouped by employee ──────────────────────────────────────────────────────
  const empGroups = useMemo(() => {
    const g: Record<string, Schedule[]> = {};
    for (const s of filteredSchedules) {
      if (!g[s.eid]) g[s.eid] = [];
      g[s.eid].push(s);
    }
    return Object.entries(g).sort(([a], [b]) =>
      (userMap[a]?.name ?? a).localeCompare(userMap[b]?.name ?? b)
    );
  }, [filteredSchedules, userMap]);

  // ── Admin KPIs ───────────────────────────────────────────────────────────────
  const totalEmployees = (users ?? []).filter((u) => u.status === "active").length;
  const clockedInToday = (timesheets ?? []).filter((t) => (t.date === today || t.date === yesterday) && t.ci && !t.co).length;
  const pendingApprovals = (timesheets ?? []).filter((ts) => {
    if (ts.status === "pending_first_approval") {
      return (users ?? []).find((u) => u.userId === ts.eid)?.fa === user.pos;
    }
    if (ts.status === "pending_second_approval") {
      return (users ?? []).find((u) => u.userId === ts.eid)?.sa === user.pos;
    }
    return false;
  });
  const disputesPending = (timesheets ?? []).filter((t) => t.disputed).length;
  const approvedMtd = (timesheets ?? []).filter((t) => t.status === "approved" && t.date?.startsWith(currentMonth)).length;
  const pendingRequests = (requests ?? []).filter((r) => r.status === "pending").length;
  const totalPlannedShifts = filteredSchedules.length;

  // ── My stats (employee/supervisor) ──────────────────────────────────────────
  const myTs = (timesheets ?? []).filter((t) => t.eid === user.userId);
  const myMonthTs = myTs.filter((t) => t.date?.startsWith(currentMonth));
  const myRegHours = myMonthTs.filter((t) => t.status === "approved").reduce((s, t) => s + (t.reg ?? 0), 0);
  const myOtHours = myMonthTs.filter((t) => t.status === "approved").reduce((s, t) => s + (t.ot ?? 0), 0);
  const ABSENCE_STATUSES = ["Sick", "Absent", "Annual Leave"];
  const isAbsenceRecord = (t: Timesheet) => ABSENCE_STATUSES.includes(t.dayStatus ?? "");
  // "Awaiting My Signature" = pending_employee AND either has a clock-out OR is an absence record (no co expected)
  const myPending = myTs.filter((t) =>
    t.status === "pending_employee" && (!!t.co || isAbsenceRecord(t))
  );
  const officersNeedingSignoff = isSupervisor
    ? (timesheets ?? []).filter((ts) => {
        const emp = (users ?? []).find((u) => u.userId === ts.eid);
        return ts.status === "pending_first_approval" && emp?.fa === user.pos && !ts.f2Sig;
      }).length
    : 0;

  // ── Live personnel ───────────────────────────────────────────────────────────
  const livePersonnel = useMemo(() => {
    const active = (timesheets ?? []).filter((t) => (t.date === today || t.date === yesterday) && t.ci && !t.co);
    const zones = Array.from(new Set(active.map((t) => t.zone ?? "Unknown"))).sort();
    return { active, zones };
  }, [timesheets, today, yesterday]);
  const [locFilter, setLocFilter] = useState("ALL");
  const [liveExpanded, setLiveExpanded] = useState(false);
  const [liveSearch, setLiveSearch] = useState("");

  // ── Schedule Adherence (today) ───────────────────────────────────────────────
  const todayAdherence = useMemo(() => {
    if (!allSchedules) return [];
    const GRACE = 15;
    const seen = new Set<string>();
    return (allSchedules ?? [])
      .filter((s) => s.date === today)
      .filter((s) => { if (seen.has(s.eid)) return false; seen.add(s.eid); return true; })
      .map((sched) => {
        const ts = (timesheets ?? []).find((t) => t.eid === sched.eid && (t.date === today || t.date === yesterday));
        const emp = userMap[sched.eid];
        const [sh, sm] = sched.shiftStart.split(":").map(Number);
        const schedMins = sh * 60 + sm;
        let status: "on-time" | "late" | "not-in" | "absent" | "done";
        let lateMins = 0;
        const ABSENCE = ["Sick", "Absent", "Annual Leave"];
        if (ts?.dayStatus && ABSENCE.includes(ts.dayStatus)) {
          status = "absent";
        } else if (ts?.co) {
          status = "done";
        } else if (ts?.ci) {
          const [ch, cm] = ts.ci.split(":").map(Number);
          lateMins = Math.max(0, ch * 60 + cm - schedMins - GRACE);
          status = lateMins > 0 ? "late" : "on-time";
        } else {
          status = "not-in";
        }
        return { sched, emp, ts, status, lateMins };
      })
      .sort((a, b) => {
        const ord: Record<string, number> = { absent: 0, "not-in": 1, late: 2, done: 3, "on-time": 4 };
        return (ord[a.status] ?? 9) - (ord[b.status] ?? 9);
      });
  }, [allSchedules, timesheets, today, yesterday, userMap]);

  const adherenceSummary = useMemo(() => ({
    total: todayAdherence.length,
    onTime: todayAdherence.filter((r) => r.status === "on-time").length,
    late: todayAdherence.filter((r) => r.status === "late").length,
    notIn: todayAdherence.filter((r) => r.status === "not-in").length,
    absent: todayAdherence.filter((r) => r.status === "absent").length,
    done: todayAdherence.filter((r) => r.status === "done").length,
  }), [todayAdherence]);

  // Supervisor sees only their direct reports; admin sees all
  const myAdherence = useMemo(() => {
    if (isAdmin) return todayAdherence;
    return todayAdherence.filter((row) => {
      const emp = (users ?? []).find((u) => u.userId === row.sched.eid);
      return emp?.fa === user.pos || emp?.sa === user.pos;
    });
  }, [isAdmin, todayAdherence, users, user.pos]);

  const [adherenceFilter, setAdherenceFilter] = useState<"all" | "not-in" | "late" | "absent" | "on-time" | "done">("all");
  const filteredAdherence = useMemo(() =>
    adherenceFilter === "all" ? myAdherence : myAdherence.filter((r) => r.status === adherenceFilter),
    [myAdherence, adherenceFilter],
  );
  const liveDisplayed = useMemo(() => {
    let rows = locFilter === "ALL"
      ? livePersonnel.active
      : livePersonnel.active.filter((t) => (t.zone ?? "Unknown") === locFilter);
    if (liveSearch.trim()) {
      const q = liveSearch.toLowerCase();
      rows = rows.filter((t) => {
        const info = userMap[t.eid];
        return (
          (info?.name ?? t.eid).toLowerCase().includes(q) ||
          (t.zone ?? "").toLowerCase().includes(q) ||
          (t.client ?? "").toLowerCase().includes(q) ||
          (t.post ?? "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [livePersonnel.active, locFilter, liveSearch, userMap]);

  // ── Approval actions ─────────────────────────────────────────────────────────
  const submitApproval = async () => {
    if (!sigModal) return;
    const ts = sigModal.ts;
    const sigObj = { name: sigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    const isFirst = ts.status === "pending_first_approval";
    try {
      await updateTimesheet({
        id: ts.id,
        ...(isFirst ? { f1Sig: sigObj, status: "pending_second_approval" } : { f2Sig: sigObj, status: "approved" }),
      });
      toast({ title: isFirst ? "First approval applied" : "Timesheet fully approved" });
      setSigModal(null); setSigName("");
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
  };

  const submitRejection = async () => {
    if (!rejectModal) return;
    try {
      await updateTimesheet({ id: rejectModal.id, status: "rejected" });
      toast({ title: "Timesheet rejected" });
      setRejectModal(null);
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
  };

  // ── Delete roster ────────────────────────────────────────────────────────────
  const deleteRoster = useMutation({
    mutationFn: async ({ eids, startDate, endDate }: { eids: string[]; startDate: string; endDate: string }) => {
      const params = new URLSearchParams({ eids: eids.join(","), startDate, endDate });
      return apiRequest("DELETE", `/api/schedules?${params}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedules/all"] });
      qc.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "Roster deleted successfully" });
      setDeleteTarget(null);
      refetchSchedules();
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteRoster.mutate({ eids: deleteTarget.eids, startDate: deleteTarget.startDate, endDate: deleteTarget.endDate });
  }

  function prepareAgencyDelete(agency: string, shifts: Schedule[]) {
    const eids = Array.from(new Set(shifts.map((s) => s.eid)));
    const dates = shifts.map((s) => s.date).sort();
    setDeleteTarget({ label: `${agency} roster`, eids, startDate: dates[0], endDate: dates[dates.length - 1], count: shifts.length });
  }

  function prepareEmpDelete(eid: string, shifts: Schedule[]) {
    const dates = shifts.map((s) => s.date).sort();
    setDeleteTarget({ label: `${userMap[eid]?.name ?? eid}'s shifts`, eids: [eid], startDate: dates[0], endDate: dates[dates.length - 1], count: shifts.length });
  }

  // ── EMPLOYEE / SUPERVISOR VIEW ───────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <Layout>
        <div className="space-y-5">
          <div className="bg-primary rounded-xl p-6 text-primary-foreground shadow">
            <div className="flex items-center gap-3 mb-1">
              <LayoutDashboard className="w-5 h-5 opacity-70" />
              <h2 className="text-2xl font-bold">Welcome, {user.name}</h2>
            </div>
            <p className="text-primary-foreground/75 text-sm">{user.pos} — {user.dept}</p>
            <p className="text-primary-foreground/55 text-xs mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={Clock} label="Regular Hours (MTD)" value={`${myRegHours.toFixed(1)}h`} />
            <KpiCard icon={TrendingUp} label="Overtime (MTD)" value={`${myOtHours.toFixed(1)}h`} />
            <KpiCard icon={FileText} label="Timesheets (MTD)" value={myMonthTs.length} />
            <KpiCard icon={AlertTriangle} label="Awaiting My Signature" value={myPending.length}
              color={myPending.length > 0 ? "text-amber-600" : undefined} />
          </div>
          {isSupervisor && officersNeedingSignoff > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-800">{officersNeedingSignoff} officer shift{officersNeedingSignoff > 1 ? "s" : ""} awaiting your sign-off</p>
            </div>
          )}
          <ClockInOut />
          {myPending.length > 0 && (
            <div className="bg-card border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-sm mb-3">Timesheets Awaiting Your Signature</h3>
              <div className="space-y-2">
                {myPending.map((ts) => {
                  const absence = isAbsenceRecord(ts);
                  return (
                    <div key={ts.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                      <div className="min-w-0">
                        <span className="font-medium text-sm">{ts.date}</span>
                        {absence ? (
                          <span className="text-amber-600 text-xs ml-2 font-medium">{ts.dayStatus}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs ml-2 whitespace-nowrap">{ts.ci} → {ts.co ?? "—"}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50 shrink-0">Sign Required</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Adherence card for supervisor ──────────────────────────── */}
          {isSupervisor && myAdherence.length > 0 && (
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/20">
                <ClipboardList className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Today's Schedule Adherence</h3>
                <Badge variant="secondary" className="text-xs">{myAdherence.length} scheduled</Badge>
                {adherenceSummary.notIn > 0 && <Badge variant="destructive" className="text-xs">{adherenceSummary.notIn} not in</Badge>}
                {adherenceSummary.late > 0 && <Badge className="text-xs bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-100">{adherenceSummary.late} late</Badge>}
              </div>
              <AdherencePanel
                rows={filteredAdherence}
                summary={{ ...adherenceSummary, total: myAdherence.length }}
                adherenceFilter={adherenceFilter}
                setAdherenceFilter={setAdherenceFilter}
                openEndShift={openEndShift}
                isAdmin={false}
                isSupervisor={true}
              />
            </div>
          )}
        </div>

        {/* ── End Shift Dialog (supervisor view) ──────────────────────────── */}
        <Dialog open={!!endShiftTarget} onOpenChange={(o) => { if (!o) setEndShiftTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="w-4 h-4 text-destructive" /> End Shift
              </DialogTitle>
              <DialogDescription>
                Manually clock out <strong>{endShiftTarget ? (userMap[endShiftTarget.eid]?.name ?? endShiftTarget.eid) : ""}</strong> who
                clocked in at <strong>{endShiftTarget?.ci}</strong> and forgot to clock out.
                Hours will be calculated automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Clock-out Time</Label>
                  <Input
                    type="time"
                    value={endShiftCo}
                    onChange={(e) => setEndShiftCo(e.target.value)}
                    data-testid="input-end-shift-co-sup"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Break (mins)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={endShiftBrk}
                    onChange={(e) => setEndShiftBrk(e.target.value)}
                    data-testid="input-end-shift-brk-sup"
                  />
                </div>
              </div>
              {endShiftTarget && endShiftCo && (() => {
                const [ch, cm] = (endShiftTarget.ci ?? "00:00").split(":").map(Number);
                const [oh, om] = endShiftCo.split(":").map(Number);
                let totalMins = oh * 60 + om - (ch * 60 + cm);
                if (totalMins < 0) totalMins += 24 * 60;
                const workMins = Math.max(0, totalMins - (parseInt(endShiftBrk, 10) || 0));
                const totalH = workMins / 60;
                const reg = Math.min(8, totalH);
                const ot  = Math.max(0, totalH - 8);
                return (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex gap-4">
                    <span>Total: <strong className="text-foreground">{totalH.toFixed(2)}h</strong></span>
                    <span>Reg: <strong className="text-foreground">{reg.toFixed(2)}h</strong></span>
                    {ot > 0 && <span>OT: <strong className="text-amber-600">{ot.toFixed(2)}h</strong></span>}
                  </div>
                );
              })()}
              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Textarea
                  rows={2}
                  value={endShiftNote}
                  onChange={(e) => setEndShiftNote(e.target.value)}
                  className="text-xs resize-none"
                  placeholder="Reason for manual clock-out…"
                  data-testid="input-end-shift-note-sup"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEndShiftTarget(null)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!endShiftCo || endShiftBusy}
                onClick={handleEndShift}
                data-testid="button-confirm-end-shift-sup"
              >
                {endShiftBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <LogOut className="w-3.5 h-3.5 mr-1.5" />}
                End Shift
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Layout>
    );
  }

  // ── ADMIN / MANAGER FULL DASHBOARD ──────────────────────────────────────────
  return (
    <Layout>
      {/* Break out of the Layout's padding to fill the screen edge-to-edge */}
      <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8">

        {/* ── HERO BAND ───────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-5 text-primary-foreground">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <LayoutDashboard className="w-5 h-5 opacity-75" />
                <h1 className="text-xl font-bold tracking-tight">Operations Dashboard</h1>
              </div>
              <p className="text-primary-foreground/70 text-xs">{format(new Date(), "EEEE, MMMM d, yyyy")} · {user.name} · {user.pos}</p>
            </div>
            <div className="flex items-center gap-2">
              <ClockInOut />
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5">
            {[
              { label: "Active Staff", value: totalEmployees, icon: Users },
              { label: "Clocked In", value: clockedInToday, icon: Clock, color: clockedInToday > 0 ? "text-green-300" : "text-primary-foreground" },
              { label: "Planned Shifts", value: totalPlannedShifts, icon: Calendar },
              { label: "Pending Approvals", value: pendingApprovals.length, icon: PenLine, color: pendingApprovals.length > 0 ? "text-amber-300" : "text-primary-foreground" },
              { label: "Open Requests", value: pendingRequests, icon: FileText, color: pendingRequests > 0 ? "text-yellow-300" : "text-primary-foreground" },
              { label: "Approved MTD", value: approvedMtd, icon: CheckCircle2, color: "text-green-300" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/10 rounded-lg px-3 py-2.5 text-center backdrop-blur-sm">
                <Icon className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                <p className={`text-xl font-bold leading-none ${color ?? "text-primary-foreground"}`}>{value}</p>
                <p className="text-[10px] text-primary-foreground/60 mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── FILTER BAR ──────────────────────────────────────────────────── */}
        <div className="bg-card border-b px-4 py-2.5 overflow-x-auto">
          <div className="flex items-center gap-2.5 min-w-max">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded px-2 py-1 text-xs h-7 bg-background" data-testid="filter-date-from" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border rounded px-2 py-1 text-xs h-7 bg-background" data-testid="filter-date-to" />
            </div>
            <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs h-7 bg-background" data-testid="filter-agency">
              <option value="ALL">All Agencies</option>
              {allAgencies.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee…" className="border rounded pl-6 pr-2 py-1 text-xs h-7 bg-background w-36"
                data-testid="filter-search" />
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs whitespace-nowrap"
              onClick={() => { setDateFrom(format(startOfMonth(new Date()), "yyyy-MM-dd")); setDateTo(format(endOfMonth(new Date()), "yyyy-MM-dd")); setAgencyFilter("ALL"); setSearch(""); }}
              data-testid="button-reset-filters">
              <RefreshCw className="w-3 h-3 mr-1" /> Reset
            </Button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{filteredSchedules.length} shift{filteredSchedules.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* ── MOBILE TAB SWITCHER ──────────────────────────────────────────── */}
        <div className="md:hidden flex border-b bg-card sticky top-0 z-10">
          <button
            onClick={() => setMobileDashTab("ops")}
            className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors ${mobileDashTab === "ops" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            data-testid="tab-mobile-ops"
          >
            Operations
          </button>
          <button
            onClick={() => setMobileDashTab("roster")}
            className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors ${mobileDashTab === "roster" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            data-testid="tab-mobile-roster"
          >
            Roster
          </button>
          <button
            onClick={() => setMobileDashTab("adherence")}
            className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors ${mobileDashTab === "adherence" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            data-testid="tab-mobile-adherence"
          >
            Adherence
          </button>
        </div>

        {/* ── ADHERENCE PANEL (mobile tab OR desktop full-width section) ─────── */}
        {/* Mobile: shows as its own tab */}
        <div className={`${mobileDashTab === "adherence" ? "block" : "hidden"} md:hidden`} data-testid="panel-adherence-mobile">
          <AdherencePanel
            rows={filteredAdherence}
            summary={adherenceSummary}
            adherenceFilter={adherenceFilter}
            setAdherenceFilter={setAdherenceFilter}
            openEndShift={openEndShift}
            isAdmin={isAdmin}
            isSupervisor={isSupervisor}
          />
        </div>

        {/* ── MAIN BODY (two columns on desktop, tabs on mobile) ───────────── */}
        <div className="flex flex-col md:flex-row gap-0 md:overflow-hidden md:h-[calc(100vh-14.5rem)]">

          {/* ── LEFT: Roster Management ─────────────────────────────────────── */}
          <div className={`${mobileDashTab === "roster" ? "flex" : "hidden"} md:flex flex-col w-full md:w-[42%] border-b md:border-b-0 md:border-r bg-background overflow-y-auto md:overflow-hidden`} style={{ minHeight: "50vh" }} data-testid="panel-roster">
            {/* Sub-header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Roster Management</span>
              <div className="ml-auto flex rounded-md border overflow-hidden text-xs">
                <button
                  onClick={() => setRosterView("agency")}
                  className={`px-3 py-1.5 font-medium transition-colors ${rosterView === "agency" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  data-testid="tab-roster-by-agency"
                >
                  By Agency
                </button>
                <button
                  onClick={() => setRosterView("employee")}
                  className={`px-3 py-1.5 font-medium transition-colors ${rosterView === "employee" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  data-testid="tab-roster-by-employee"
                >
                  By Employee
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredSchedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <Calendar className="w-10 h-10 opacity-20" />
                  <p className="text-sm">No schedules found for this period</p>
                </div>
              ) : rosterView === "agency" ? (
                agencyGroups.map(([agency, shifts]) => {
                  const empIds = Array.from(new Set(shifts.map((s) => s.eid)));
                  const dates = shifts.map((s) => s.date).sort();
                  const isOpen = expanded.has(agency);
                  const armedCount = shifts.filter((s) => s.armed === "Armed").length;
                  return (
                    <div key={agency} className="border rounded-lg bg-card shadow-sm overflow-hidden" data-testid={`agency-card-${agency}`}>
                      {/* Agency header row */}
                      <div
                        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                        onClick={() => setExpanded((prev) => {
                          const n = new Set(prev);
                          if (n.has(agency)) n.delete(agency); else n.add(agency);
                          return n;
                        })}
                      >
                        <div className="p-1.5 rounded-md bg-primary/10">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{agency}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {empIds.length} officer{empIds.length !== 1 ? "s" : ""} · {shifts.length} shift{shifts.length !== 1 ? "s" : ""}
                            {dates.length > 0 ? ` · ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {armedCount > 0 && (
                            <span className="text-[9px] bg-red-100 text-red-700 border border-red-200 rounded px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
                              <Shield className="w-2.5 h-2.5" />{armedCount}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); prepareAgencyDelete(agency, shifts); }}
                            data-testid={`button-delete-agency-${agency}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>

                      {/* Expanded employee list */}
                      {isOpen && (
                        <div className="border-t bg-muted/10 divide-y divide-border/50">
                          {empIds.map((eid) => {
                            const empShifts = shifts.filter((s) => s.eid === eid);
                            const info = userMap[eid];
                            return (
                              <div key={eid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group" data-testid={`emp-roster-row-${eid}`}>
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                                  {info?.av ?? eid.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{info?.name ?? eid}</p>
                                  <p className="text-[9px] text-muted-foreground">{empShifts.length} shift{empShifts.length !== 1 ? "s" : ""}</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => prepareEmpDelete(eid, empShifts)}
                                  data-testid={`button-delete-emp-${eid}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                empGroups.map(([eid, shifts]) => {
                  const info = userMap[eid];
                  const dates = shifts.map((s) => s.date).sort();
                  const agencies = Array.from(new Set(shifts.map((s) => s.client ?? "—")));
                  const armedCount = shifts.filter((s) => s.armed === "Armed").length;
                  return (
                    <div key={eid} className="border rounded-lg bg-card shadow-sm flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors group" data-testid={`emp-card-${eid}`}>
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {info?.av ?? eid.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{info?.name ?? eid}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {info?.pos ?? ""} · {agencies.join(", ")}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {shifts.length} shift{shifts.length !== 1 ? "s" : ""}
                            {dates.length > 0 ? ` · ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : ""}
                          </span>
                          {armedCount > 0 && (
                            <span className="text-[9px] bg-red-100 text-red-700 border border-red-200 rounded px-1.5 font-semibold flex items-center gap-0.5">
                              <Shield className="w-2.5 h-2.5" /> {armedCount} Armed
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => prepareEmpDelete(eid, shifts)}
                        data-testid={`button-delete-emp-card-${eid}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── RIGHT: Operations Panel ─────────────────────────────────────── */}
          <div className={`${mobileDashTab === "ops" ? "flex" : "hidden"} md:flex flex-1 flex-col overflow-hidden`} data-testid="panel-ops">

            {/* ── End Shift Dialog ──────────────────────────────────────────── */}
            <Dialog open={!!endShiftTarget} onOpenChange={(o) => { if (!o) setEndShiftTarget(null); }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-destructive" /> End Shift
                  </DialogTitle>
                  <DialogDescription>
                    Manually clock out <strong>{endShiftTarget ? (userMap[endShiftTarget.eid]?.name ?? endShiftTarget.eid) : ""}</strong> who
                    clocked in at <strong>{endShiftTarget?.ci}</strong> and forgot to clock out.
                    Hours will be calculated automatically.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Clock-out Time</Label>
                      <Input
                        type="time"
                        value={endShiftCo}
                        onChange={(e) => setEndShiftCo(e.target.value)}
                        data-testid="input-end-shift-co"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Break (mins)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={endShiftBrk}
                        onChange={(e) => setEndShiftBrk(e.target.value)}
                        data-testid="input-end-shift-brk"
                      />
                    </div>
                  </div>
                  {endShiftTarget && endShiftCo && (() => {
                    const [ch, cm] = (endShiftTarget.ci ?? "00:00").split(":").map(Number);
                    const [oh, om] = endShiftCo.split(":").map(Number);
                    let totalMins = oh * 60 + om - (ch * 60 + cm);
                    if (totalMins < 0) totalMins += 24 * 60;
                    const workMins = Math.max(0, totalMins - (parseInt(endShiftBrk, 10) || 0));
                    const totalH = workMins / 60;
                    const reg = Math.min(8, totalH);
                    const ot  = Math.max(0, totalH - 8);
                    return (
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex gap-4">
                        <span>Total: <strong className="text-foreground">{totalH.toFixed(2)}h</strong></span>
                        <span>Reg: <strong className="text-foreground">{reg.toFixed(2)}h</strong></span>
                        {ot > 0 && <span>OT: <strong className="text-amber-600">{ot.toFixed(2)}h</strong></span>}
                      </div>
                    );
                  })()}
                  <div className="space-y-1">
                    <Label className="text-xs">Note</Label>
                    <Textarea
                      rows={2}
                      value={endShiftNote}
                      onChange={(e) => setEndShiftNote(e.target.value)}
                      className="text-xs resize-none"
                      placeholder="Reason for manual clock-out…"
                      data-testid="input-end-shift-note"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setEndShiftTarget(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!endShiftCo || endShiftBusy}
                    onClick={handleEndShift}
                    data-testid="button-confirm-end-shift"
                  >
                    {endShiftBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <LogOut className="w-3.5 h-3.5 mr-1.5" />}
                    End Shift
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* ── Live Personnel Board ──────────────────────────────────────── */}
            <div className="flex flex-col md:max-h-[50%] shrink-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="font-semibold text-sm">Live Personnel</span>
                <Badge variant="secondary" className="text-xs">{livePersonnel.active.length} on duty</Badge>
                <div className="ml-auto flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Radio className="w-3 h-3" /> Live timers
                  </span>
                  <button
                    onClick={() => setLiveExpanded(true)}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Expand fullscreen"
                    data-testid="button-live-expand"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Zone filter */}
              <div className="px-3 pt-2 pb-1 flex gap-1.5 overflow-x-auto shrink-0">
                {["ALL", ...livePersonnel.zones].map((z) => (
                  <button
                    key={z}
                    onClick={() => setLocFilter(z)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap border transition-colors ${
                      locFilter === z
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/40"
                    }`}
                    data-testid={`filter-zone-${z}`}
                  >
                    {z === "ALL" ? "All Zones" : z}
                  </button>
                ))}
              </div>

              {/* Live cards */}
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {liveDisplayed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-muted-foreground gap-2">
                    <ShieldOff className="w-6 h-6 opacity-20" />
                    <p className="text-xs">No personnel currently on duty</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {liveDisplayed.map((ts) => {
                      const info = userMap[ts.eid];
                      return (
                        <div key={ts.id} className="border rounded-lg bg-card px-3 py-2.5 flex items-center gap-2.5 shadow-sm group" data-testid={`live-card-${ts.id}`}>
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs shrink-0">
                            {info?.av ?? ts.eid.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs truncate">{info?.name ?? ts.eid}</p>
                            <div className="flex items-center gap-1 flex-wrap">
                              {ts.client && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Briefcase className="w-2.5 h-2.5" />{ts.client}
                                </span>
                              )}
                              {ts.post && (
                                <span className="text-[10px] text-primary/80 flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />{ts.post}
                                </span>
                              )}
                              {!ts.client && !ts.post && (
                                <span className="text-[10px] text-muted-foreground">{ts.zone ?? "Unknown"}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="text-right">
                              <p className="text-xs font-mono font-semibold text-green-600">{ts.ci}</p>
                              <LiveElapsed ci={ts.ci ?? "00:00"} date={ts.date} className="text-[10px] text-muted-foreground font-mono" />
                            </div>
                            {(isAdmin || isSupervisor) && (
                              <button
                                onClick={() => openEndShift(ts)}
                                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
                                title="End shift (force clock-out)"
                                data-testid={`button-end-shift-${ts.id}`}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Fullscreen Live Personnel Dialog ──────────────────────────── */}
            <Dialog open={liveExpanded} onOpenChange={setLiveExpanded}>
              <DialogContent className="max-w-none w-screen h-screen m-0 rounded-none p-0 flex flex-col" data-testid="dialog-live-fullscreen">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/20 shrink-0">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <DialogTitle className="text-base font-semibold">Live Personnel</DialogTitle>
                  <Badge variant="secondary">{livePersonnel.active.length} on duty</Badge>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Radio className="w-3 h-3" /> Updates every 60s
                    </span>
                    <button
                      onClick={() => setLiveExpanded(false)}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      data-testid="button-live-collapse"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Controls */}
                <div className="px-6 py-3 border-b shrink-0 flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-sm"
                      placeholder="Search name, agency, post…"
                      value={liveSearch}
                      onChange={(e) => setLiveSearch(e.target.value)}
                      data-testid="input-live-search"
                    />
                  </div>
                  {/* Zone pills */}
                  <div className="flex gap-1.5 overflow-x-auto items-center">
                    {["ALL", ...livePersonnel.zones].map((z) => (
                      <button
                        key={z}
                        onClick={() => setLocFilter(z)}
                        className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap border transition-colors ${
                          locFilter === z
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/40"
                        }`}
                      >
                        {z === "ALL" ? "All Zones" : z}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                  {liveDisplayed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
                      <ShieldOff className="w-10 h-10 opacity-20" />
                      <p className="text-sm">No personnel currently on duty</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {liveDisplayed.map((ts) => {
                        const info = userMap[ts.eid];
                        return (
                          <div key={ts.id} className="border rounded-xl bg-card p-4 flex flex-col gap-3 shadow-sm" data-testid={`live-card-full-${ts.id}`}>
                            {/* Avatar + name */}
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm shrink-0">
                                {info?.av ?? ts.eid.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate leading-tight">{info?.name ?? ts.eid}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{info?.pos ?? "—"}</p>
                              </div>
                            </div>
                            {/* Location details */}
                            <div className="space-y-1 border-t pt-2">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Building2 className="w-3 h-3 shrink-0 text-primary/60" />
                                <span className="truncate font-medium">{ts.client ?? ts.zone ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0 text-primary/60" />
                                <span className="truncate">{ts.post ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Shield className="w-3 h-3 shrink-0 text-primary/60" />
                                <span>{ts.armed ?? info?.armed ?? "—"}</span>
                              </div>
                            </div>
                            {/* Time */}
                            <div className="border-t pt-2 flex items-center justify-between">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Clocked in</p>
                                <p className="text-sm font-mono font-bold text-green-600">{ts.ci}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">Elapsed</p>
                                <LiveElapsed ci={ts.ci ?? "00:00"} date={ts.date} className="text-sm font-semibold font-mono" />
                              </div>
                            </div>
                            {/* End Shift button */}
                            {(isAdmin || isSupervisor) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive text-xs h-7"
                                onClick={() => openEndShift(ts)}
                                data-testid={`button-end-shift-full-${ts.id}`}
                              >
                                <LogOut className="w-3 h-3 mr-1.5" /> End Shift
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer summary */}
                <div className="shrink-0 border-t px-6 py-3 bg-muted/10 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {livePersonnel.zones.map((z) => {
                    const count = livePersonnel.active.filter((t) => (t.zone ?? "Unknown") === z).length;
                    return (
                      <span key={z} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        {z}: <strong className="text-foreground">{count}</strong>
                      </span>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>

            {/* ── Pending Approvals ─────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col border-t overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20 shrink-0">
                <PenLine className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Pending Approvals</span>
                <Badge variant={pendingApprovals.length > 0 ? "default" : "secondary"} className="text-xs">
                  {pendingApprovals.length}
                </Badge>
                {disputesPending > 0 && (
                  <Badge variant="destructive" className="text-xs ml-1">{disputesPending} disputed</Badge>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {pendingApprovals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-muted-foreground gap-2">
                    <CheckCircle2 className="w-6 h-6 opacity-20" />
                    <p className="text-xs">All clear — no approvals waiting</p>
                  </div>
                ) : (
                  pendingApprovals.map((ts) => {
                    const emp = (users ?? []).find((u) => u.userId === ts.eid);
                    return (
                      <div key={ts.id} className="border rounded-lg bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-2.5 shadow-sm" data-testid={`approval-row-${ts.id}`}>
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {emp?.av ?? ts.eid.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs truncate">{emp?.name ?? ts.eid}</p>
                            <p className="text-[10px] text-muted-foreground">{ts.date} · {ts.ci}–{ts.co ?? "?"} · {ts.reg}h{(ts.ot ?? 0) > 0 ? ` +${ts.ot}h OT` : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor(ts.status)}`}>{statusLabel(ts.status)}</span>
                          {ts.disputed && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-200">Disputed</span>}
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { setSigModal({ ts, role: "approver" }); setSigName(user.name); }} data-testid={`button-approve-${ts.id}`}>
                            <PenLine className="w-3 h-3 mr-1" /> Sign
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRejectModal(ts)} data-testid={`button-reject-${ts.id}`}>
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── ADHERENCE SECTION (desktop — always visible below two-panel area) ── */}
        <div className="hidden md:block border-t" data-testid="panel-adherence-desktop">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Schedule Adherence — Today</span>
            <Badge variant="secondary" className="text-xs">{adherenceSummary.total} scheduled</Badge>
            {adherenceSummary.notIn > 0 && <Badge variant="destructive" className="text-xs">{adherenceSummary.notIn} not in</Badge>}
            {adherenceSummary.late > 0 && <Badge className="text-xs bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-100">{adherenceSummary.late} late</Badge>}
          </div>
          <AdherencePanel
            rows={filteredAdherence}
            summary={adherenceSummary}
            adherenceFilter={adherenceFilter}
            setAdherenceFilter={setAdherenceFilter}
            openEndShift={openEndShift}
            isAdmin={isAdmin}
            isSupervisor={isSupervisor}
          />
        </div>
      </div>

      {/* ── DELETE CONFIRMATION DIALOG ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Delete Roster
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4 mt-1">
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-1.5">
                <p className="text-sm font-semibold">{deleteTarget.label}</p>
                <p className="text-xs text-muted-foreground">{deleteTarget.count} shift{deleteTarget.count !== 1 ? "s" : ""} from {fmtDate(deleteTarget.startDate)} to {fmtDate(deleteTarget.endDate)}</p>
                <p className="text-xs text-muted-foreground">{deleteTarget.eids.length} employee{deleteTarget.eids.length !== 1 ? "s" : ""} affected</p>
              </div>
              <p className="text-xs text-muted-foreground">This action cannot be undone. All shift records in this roster will be permanently deleted.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={deleteRoster.isPending} data-testid="button-confirm-delete-roster">
                  {deleteRoster.isPending ? "Deleting…" : `Delete ${deleteTarget.count} Shift${deleteTarget.count !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── SIGNATURE MODAL ─────────────────────────────────────────────────── */}
      <Dialog open={!!sigModal} onOpenChange={() => setSigModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Electronic Signature — Approval</DialogTitle></DialogHeader>
          {sigModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> <strong>{(users ?? []).find((u) => u.userId === sigModal.ts.eid)?.name ?? sigModal.ts.eid}</strong></p>
                <p><span className="text-muted-foreground">Date:</span> <strong>{sigModal.ts.date}</strong></p>
                <p><span className="text-muted-foreground">Hours:</span> <strong>{sigModal.ts.reg}h reg + {sigModal.ts.ot}h OT</strong></p>
                <p><span className="text-muted-foreground">Stage:</span> <strong>{sigModal.ts.status === "pending_first_approval" ? "1st Approver" : "2nd Approver"}</strong></p>
              </div>
              <div className="space-y-1.5">
                <Label>Your Full Name (typed signature)</Label>
                <Input value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Type your full name" data-testid="input-sig-name" />
              </div>
              <p className="text-xs text-muted-foreground">By typing your name, you apply a legally binding electronic signature. Timestamp and source will be recorded.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSigModal(null)}>Cancel</Button>
                <Button onClick={submitApproval} disabled={!sigName.trim()} data-testid="button-confirm-sig">
                  <PenLine className="w-4 h-4 mr-1.5" /> Apply Signature
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── REJECTION MODAL ─────────────────────────────────────────────────── */}
      <Dialog open={!!rejectModal} onOpenChange={() => setRejectModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reject Timesheet</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will mark the timesheet as rejected and return it to the employee for review.</p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitRejection} data-testid="button-confirm-reject">Confirm Reject</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
