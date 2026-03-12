import { useState, useMemo, useRef, useEffect } from "react";
import { RosterBuilder } from "@/components/RosterBuilder";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useUsers } from "@/hooks/use-users";
import { useTeamSchedules, useSchedules, useDeleteAnySchedule, useClearSchedules } from "@/hooks/use-schedules";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  format, startOfWeek, addDays,
  startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval,
  getDay, parseISO,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit2, CalendarDays,
  Shield, ShieldOff, Clock, MapPin, Users, User, Search, Check,
  CalendarRange, Loader2, Building2,
} from "lucide-react";
import {
  FMS_LOCATIONS, CLIENT_AGENCIES,
  type ArmedStatus, type ClientAgency,
} from "@shared/schema";
import type { Schedule } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewMode = "fortnight" | "month";
type DayIdx  = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mon … 6=Sun

const DAY_LABELS: Record<DayIdx, string> = {
  0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun",
};

// date-fns getDay returns 0=Sun, so remap to Mon-based
function dateToDayIdx(d: Date): DayIdx {
  const raw = getDay(d); // 0=Sun..6=Sat
  return ((raw + 6) % 7) as DayIdx;
}

// ── Range helpers ─────────────────────────────────────────────────────────────
function getRangeDays(anchor: Date, mode: ViewMode): Date[] {
  if (mode === "fortnight") {
    const yr = anchor.getFullYear();
    const mo = anchor.getMonth();
    const day = anchor.getDate();
    if (day <= 15) {
      return Array.from({ length: 15 }, (_, i) => new Date(yr, mo, i + 1));
    } else {
      const lastDay = new Date(yr, mo + 1, 0).getDate();
      return Array.from({ length: lastDay - 15 }, (_, i) => new Date(yr, mo, i + 16));
    }
  }
  return eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) });
}

function advance(anchor: Date, mode: ViewMode, dir: 1 | -1): Date {
  if (mode === "fortnight") {
    const yr = anchor.getFullYear();
    const mo = anchor.getMonth();
    const day = anchor.getDate();
    if (dir === 1) {
      return day <= 15 ? new Date(yr, mo, 16) : new Date(yr, mo + 1, 1);
    } else {
      return day > 15 ? new Date(yr, mo, 1) : new Date(yr, mo - 1, 16);
    }
  }
  return dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1);
}

function todayAnchor(mode: ViewMode): Date {
  const n = new Date();
  if (mode === "fortnight") {
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() <= 15 ? 1 : 16);
  }
  return startOfMonth(n);
}

function rangeLabel(days: Date[], mode: ViewMode): string {
  if (!days.length) return "";
  if (mode === "month") return format(days[0], "MMMM yyyy");
  const first = days[0];
  const last  = days[days.length - 1];
  const pNum  = first.getDate() <= 15 ? 1 : 2;
  return `Period ${pNum} · ${format(first, "MMM d")} – ${format(last, "d, yyyy")}`;
}

function fmt12(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Employee search combobox ───────────────────────────────────────────────────
interface EmpSearchProps {
  employees: { userId: string; name: string; pos: string }[];
  value: string;
  onChange: (eid: string) => void;
  placeholder?: string;
}
function EmpSearch({ employees, value, onChange, placeholder = "Type a name to search…" }: EmpSearchProps) {
  const [query, setQuery]     = useState("");
  const [open, setOpen]       = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);
  const selected              = employees.find((e) => e.userId === value);

  const filtered = useMemo(() => {
    if (!query) return employees.slice(0, 12);
    const q = query.toLowerCase();
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.userId.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [query, employees]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={selected && !open ? selected.name : query}
          placeholder={placeholder}
          className="pl-8"
          onFocus={() => { setQuery(""); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); }}
          data-testid="input-emp-search"
        />
        {selected && !open && (
          <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground">{selected.userId}</span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          ) : (
            filtered.map((e) => (
              <button
                key={e.userId}
                type="button"
                className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left transition-colors ${value === e.userId ? "bg-primary/10" : ""}`}
                onMouseDown={() => { onChange(e.userId); setQuery(""); setOpen(false); }}
                data-testid={`emp-option-${e.userId}`}
              >
                <span>
                  <span className="font-medium">{e.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{e.pos}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{e.userId}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Builder dialog (create/bulk) ──────────────────────────────────────────────
interface BuilderDialogProps {
  open: boolean;
  onClose: () => void;
  employees: { userId: string; name: string; pos: string }[];
  defaultEid?: string;
  defaultDate?: string;
  createdBy: string;
  onSaved: () => void;
}

const ALL_DAYS: DayIdx[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS: DayIdx[] = [0, 1, 2, 3, 4];

function BuilderDialog({ open, onClose, employees, defaultEid, defaultDate, createdBy, onSaved }: BuilderDialogProps) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");

  const [eid,        setEid]        = useState(defaultEid  ?? "");
  const [dateFrom,   setDateFrom]   = useState(defaultDate ?? today);
  const [dateTo,     setDateTo]     = useState(defaultDate ?? today);
  const [activeDays, setActiveDays] = useState<DayIdx[]>(ALL_DAYS);
  const [shiftStart, setShiftStart] = useState("06:00");
  const [shiftEnd,   setShiftEnd]   = useState("14:00");
  const [armed,      setArmed]      = useState<ArmedStatus>("Unarmed");
  const [location,   setLocation]   = useState("");
  const [client,     setClient]     = useState<ClientAgency | "">("");
  const [notes,      setNotes]      = useState("");
  const [saving,     setSaving]     = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setEid(defaultEid ?? "");
      setDateFrom(defaultDate ?? today);
      setDateTo(defaultDate ?? today);
      setActiveDays(ALL_DAYS);
      setShiftStart("06:00");
      setShiftEnd("14:00");
      setArmed("Unarmed");
      setLocation("");
      setClient("");
      setNotes("");
    }
  }, [open, defaultEid, defaultDate]);

  const isSingleDay = dateFrom === dateTo;

  function toggleDay(d: DayIdx) {
    setActiveDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  // Compute preview dates
  const previewDates = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    const from = parseISO(dateFrom);
    const to   = parseISO(dateTo);
    return eachDayOfInterval({ start: from, end: to }).filter((d) =>
      isSingleDay || activeDays.includes(dateToDayIdx(d))
    );
  }, [dateFrom, dateTo, activeDays, isSingleDay]);

  async function handleSave() {
    if (!eid)          { toast({ title: "Please select an employee", variant: "destructive" }); return; }
    if (!dateFrom)     { toast({ title: "Please select a start date", variant: "destructive" }); return; }
    if (!shiftStart)   { toast({ title: "Please enter a shift start time", variant: "destructive" }); return; }
    if (!shiftEnd)     { toast({ title: "Please enter a shift end time", variant: "destructive" }); return; }
    if (previewDates.length === 0) { toast({ title: "No dates selected", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const rows = previewDates.map((d) => ({
        eid,
        date:       format(d, "yyyy-MM-dd"),
        shiftStart,
        shiftEnd,
        armed,
        location:   location || null,
        client:     client   || null,
        notes:      notes    || null,
        createdBy,
      }));

      if (rows.length === 1) {
        await apiRequest("POST", "/api/schedules", rows[0]);
      } else {
        await apiRequest("POST", "/api/schedules/bulk", rows);
      }

      toast({ title: `${rows.length} shift${rows.length > 1 ? "s" : ""} scheduled` });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const empName = employees.find((e) => e.userId === eid)?.name ?? "";

  // Quick shift presets (same codes as RosterBuilder)
  const QUICK_PRESETS = [
    { label: "7–3",  start: "07:00", end: "15:00" },
    { label: "3–11", start: "15:00", end: "23:00" },
    { label: "11–7", start: "23:00", end: "07:00" },
    { label: "20–5", start: "20:00", end: "05:00" },
    { label: "8–4",  start: "08:00", end: "16:00" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[780px] p-0 overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-5 py-3 border-b">
          <CalendarRange className="w-4 h-4 text-primary shrink-0" />
          <DialogTitle className="text-base font-semibold">Single Shift</DialogTitle>
          <DialogDescription className="sr-only">Schedule a single shift for one employee</DialogDescription>
        </div>

        {/* ── Landscape two-column body ───────────────────────────────────── */}
        <div className="grid grid-cols-[1fr_1px_1fr] max-h-[75vh]">

          {/* ── LEFT column ── Employee · Dates · Repeat days ──────────────── */}
          <div className="overflow-y-auto px-5 py-4 space-y-4">

            {/* Employee */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee</Label>
              <EmpSearch employees={employees} value={eid} onChange={setEid} />
              {eid && (
                <p className="text-[11px] text-muted-foreground pl-0.5">
                  <span className="font-medium text-foreground">{empName}</span> · {eid}
                </p>
              )}
            </div>

            {/* Date range */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">From</p>
                  <Input
                    type="date" value={dateFrom} className="h-8 text-sm"
                    onChange={(e) => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
                    data-testid="input-date-from"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">To</p>
                  <Input
                    type="date" value={dateTo} min={dateFrom} className="h-8 text-sm"
                    onChange={(e) => setDateTo(e.target.value)}
                    data-testid="input-date-to"
                  />
                </div>
              </div>
            </div>

            {/* Repeat on (multi-day only) */}
            {!isSingleDay && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repeat On</Label>
                  <div className="flex gap-2 text-[11px]">
                    <button type="button" className="text-primary hover:underline" onClick={() => setActiveDays(WEEKDAYS)}>Weekdays</button>
                    <span className="text-muted-foreground">·</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => setActiveDays(ALL_DAYS)}>All</button>
                    <span className="text-muted-foreground">·</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => setActiveDays([5, 6])}>Weekend</button>
                  </div>
                </div>
                <div className="flex gap-1">
                  {ALL_DAYS.map((d) => {
                    const active = activeDays.includes(d);
                    return (
                      <button
                        key={d} type="button" onClick={() => toggleDay(d)}
                        className={`flex-1 h-8 rounded border text-[11px] font-medium transition-colors ${
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input text-muted-foreground hover:bg-muted"
                        }`}
                        data-testid={`button-day-${d}`}
                      >{DAY_LABELS[d]}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview */}
            {previewDates.length > 0 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-primary flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {previewDates.length} shift{previewDates.length > 1 ? "s" : ""} will be created
                </p>
                <div className="flex flex-wrap gap-1">
                  {previewDates.slice(0, 15).map((d) => (
                    <span key={format(d, "yyyy-MM-dd")} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5">
                      {format(d, "EEE d")}
                    </span>
                  ))}
                  {previewDates.length > 15 && (
                    <span className="text-[11px] text-muted-foreground self-center">+{previewDates.length - 15} more</span>
                  )}
                </div>
                {empName && (
                  <p className="text-[11px] text-muted-foreground">
                    {empName} · {fmt12(shiftStart)}–{fmt12(shiftEnd)}{location ? ` · ${location}` : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Divider ──────────────────────────────────────────────────────── */}
          <div className="bg-border" />

          {/* ── RIGHT column ── Shift · Armed · Location · Client · Notes ──── */}
          <div className="overflow-y-auto px-5 py-4 space-y-4">

            {/* Quick shift presets */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shift Preset</Label>
              <div className="flex gap-1.5 flex-wrap">
                {QUICK_PRESETS.map((p) => {
                  const active = shiftStart === p.start && shiftEnd === p.end;
                  return (
                    <button
                      key={p.label} type="button"
                      onClick={() => { setShiftStart(p.start); setShiftEnd(p.end); }}
                      className={`px-3 py-1.5 rounded border text-xs font-semibold transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input text-muted-foreground hover:bg-muted"
                      }`}
                      data-testid={`button-preset-${p.label}`}
                    >{p.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Custom shift times */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Times</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Start</p>
                  <Input type="time" value={shiftStart} className="h-8 text-sm" onChange={(e) => setShiftStart(e.target.value)} data-testid="input-shift-start" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">End</p>
                  <Input type="time" value={shiftEnd} className="h-8 text-sm" onChange={(e) => setShiftEnd(e.target.value)} data-testid="input-shift-end" />
                </div>
              </div>
            </div>

            {/* Armed status */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Armed Status</Label>
              <div className="flex gap-2">
                {(["Unarmed", "Armed"] as ArmedStatus[]).map((a) => (
                  <button
                    key={a} type="button" onClick={() => setArmed(a)}
                    className={`flex-1 py-1.5 rounded border text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                      armed === a
                        ? a === "Armed" ? "bg-red-600 text-white border-red-600" : "bg-blue-600 text-white border-blue-600"
                        : "bg-background border-input hover:bg-muted"
                    }`}
                    data-testid={`button-armed-${a.toLowerCase()}`}
                  >
                    {a === "Armed" ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location / Post</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={location} onChange={(e) => setLocation(e.target.value)}
                data-testid="select-schedule-location"
              >
                <option value="">— Select location —</option>
                {FMS_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Client */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client / Agency</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={client} onChange={(e) => setClient(e.target.value as ClientAgency | "")}
                data-testid="select-schedule-client"
              >
                <option value="">— Select client —</option>
                {CLIENT_AGENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes <span className="font-normal normal-case">(optional)</span></Label>
              <Input
                value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-sm"
                placeholder="e.g. Cover shift, bring radio"
                data-testid="input-schedule-notes"
              />
            </div>

            {/* Save */}
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || previewDates.length === 0 || !eid}
              data-testid="button-save-schedule"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                : previewDates.length > 1
                  ? `Schedule ${previewDates.length} shifts`
                  : "Schedule shift"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog (single existing shift) ──────────────────────────────────────
interface EditDialogProps {
  shift: Schedule | null;
  employees: { userId: string; name: string; pos: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (s: Schedule) => void;
}
function EditDialog({ shift, employees, onClose, onSaved, onDelete }: EditDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    shiftStart: "", shiftEnd: "", armed: "Unarmed" as ArmedStatus,
    location: "", client: "" as ClientAgency | "", company: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shift) {
      setForm({
        shiftStart: shift.shiftStart,
        shiftEnd:   shift.shiftEnd,
        armed:      (shift.armed as ArmedStatus) ?? "Unarmed",
        location:   shift.location ?? "",
        client:     (shift.client as ClientAgency | "") ?? "",
        company:    shift.company ?? "",
        notes:      shift.notes ?? "",
      });
    }
  }, [shift]);

  async function handleSave() {
    if (!shift) return;
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/schedules/${shift.id}`, {
        ...form,
        location: form.location || null,
        client:   form.client   || null,
        company:  form.company  || null,
        notes:    form.notes    || null,
      });
      toast({ title: "Shift updated" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const empName = employees.find((e) => e.userId === shift?.eid)?.name ?? shift?.eid ?? "";

  return (
    <Dialog open={!!shift} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" /> Edit Shift
          </DialogTitle>
        </DialogHeader>
        {shift && (
          <div className="space-y-4 pt-1">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="font-semibold">{empName}</span>
              <span className="text-muted-foreground ml-2">
                {format(parseISO(shift.date), "EEEE, MMMM d, yyyy")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input type="time" value={form.shiftStart} onChange={(e) => setForm((p) => ({ ...p, shiftStart: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input type="time" value={form.shiftEnd} onChange={(e) => setForm((p) => ({ ...p, shiftEnd: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2">
              {(["Unarmed", "Armed"] as ArmedStatus[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, armed: a }))}
                  className={`flex-1 py-1.5 rounded-md border text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                    form.armed === a
                      ? a === "Armed"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-blue-600 text-white border-blue-600"
                      : "bg-background border-input hover:bg-muted"
                  }`}
                >
                  {a === "Armed" ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                  {a}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              >
                <option value="">— Select —</option>
                {FMS_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Client / Agency</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.client}
                onChange={(e) => setForm((p) => ({ ...p, client: e.target.value as ClientAgency | "" }))}
              >
                <option value="">— Select —</option>
                {CLIENT_AGENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.company}
                onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                data-testid="select-edit-company"
              >
                <option value="">— None —</option>
                {["Company A","Company B","Company C","Company D","Company E","Company F"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <Input
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notes"
            />

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => { onDelete(shift); onClose(); }}
                type="button"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const { user }      = useAuth();
  const { data: allUsers = [] } = useUsers();
  const { toast }     = useToast();
  const qc            = useQueryClient();

  const isSupervisor = (user?.pos ?? "").toLowerCase().includes("supervisor");
  const isPrivileged = user?.role === "admin" || user?.role === "manager" || isSupervisor;

  // View mode + anchor (desktop)
  const [viewMode, setViewMode] = useState<ViewMode>("fortnight");
  const [anchor,   setAnchor]   = useState<Date>(() => todayAnchor("fortnight"));

  // Admin mobile roster-grid state (independent week anchor, Mon-first)
  const [mobileGridAnchor, setMobileGridAnchor] = useState<Date>(
    () => startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  // Employee mobile calendar state
  const [empCalAnchor, setEmpCalAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [empPeriod,    setEmpPeriod]    = useState<1 | 2>(() => new Date().getDate() <= 15 ? 1 : 2);

  const days     = useMemo(() => getRangeDays(anchor, viewMode), [anchor, viewMode]);
  const label    = rangeLabel(days, viewMode);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  function switchMode(m: ViewMode) { setViewMode(m); setAnchor(todayAnchor(m)); }

  // Employee filter search (grid filter)
  const [gridSearch, setGridSearch] = useState("");

  // Dialog state
  const [rosterOpen,    setRosterOpen]    = useState(false);
  const [builderOpen,   setBuilderOpen]   = useState(false);
  const [builderDefEid, setBuilderDefEid] = useState<string | undefined>();
  const [builderDefDate,setBuilderDefDate]= useState<string | undefined>();
  const [editShift,     setEditShift]     = useState<Schedule | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<Schedule | null>(null);

  // Admin desktop view: agency roster (default) or employee grid
  const [adminDesktopView, setAdminDesktopView] = useState<"agency" | "employee">("agency");
  const [agencyFilter, setAgencyFilter] = useState<string>(CLIENT_AGENCIES[0]);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Multi-select for mass delete
  const [selectedEids, setSelectedEids] = useState<Set<string>>(new Set());
  const [massDeleteConfirm, setMassDeleteConfirm] = useState(false);

  function toggleEidSelection(eid: string) {
    setSelectedEids((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid); else next.add(eid);
      return next;
    });
  }
  function clearSelection() { setSelectedEids(new Set()); }

  const deleteAny   = useDeleteAnySchedule();
  const clearSched  = useClearSchedules();

  const activeEmployees = useMemo(
    () => allUsers.filter((u) => u.status === "active"),
    [allUsers]
  );

  // Fetch schedules
  const teamEids = isPrivileged
    ? activeEmployees.map((u) => u.userId)
    : [user?.userId ?? ""];

  const { data: teamSchedules = [] } = useTeamSchedules(teamEids);
  const { data: mySchedules   = [] } = useSchedules(!isPrivileged ? (user?.userId ?? "") : "");
  const schedules = isPrivileged ? teamSchedules : mySchedules;

  function refreshSchedules() {
    qc.invalidateQueries({ queryKey: ["/api/schedules"] });
    qc.invalidateQueries({ queryKey: ["/api/schedules/team"] });
  }

  // Filter to visible date range
  const rangeStart = days.length ? format(days[0], "yyyy-MM-dd") : "";
  const rangeEnd   = days.length ? format(days[days.length - 1], "yyyy-MM-dd") : "";

  const visibleSchedules = useMemo(
    () => schedules.filter((s) => s.date >= rangeStart && s.date <= rangeEnd),
    [schedules, rangeStart, rangeEnd]
  );

  const scheduleMap = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    for (const s of visibleSchedules) {
      const key = `${s.eid}::${s.date}`;
      if (!m[key]) m[key] = [];
      m[key].push(s);
    }
    return m;
  }, [visibleSchedules]);

  // Agency roster map: `${client.toLowerCase()}::${date}` → Schedule[]
  const agencyMap = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      const key = `${(s.client ?? "").toLowerCase()}::${s.date}`;
      if (!m[key]) m[key] = [];
      m[key].push(s);
    }
    return m;
  }, [schedules]);

  // eid → display name lookup
  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of allUsers) m[u.userId] = u.name;
    return m;
  }, [allUsers]);

  // Mobile grid days — 7 days Mon-first from anchor
  const mobileGridDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(mobileGridAnchor, i)),
    [mobileGridAnchor]
  );

  const mobileGridLabel = `${format(mobileGridDays[0], "MMM d")} – ${format(mobileGridDays[6], "MMM d, yyyy")}`;

  // Mobile period label (P1 = 1–15, P2 = 16–end)
  const mobilePeriodInfo = useMemo(() => {
    const anchor = mobileGridDays[0];
    const yr     = anchor.getFullYear();
    const mo     = anchor.getMonth();
    const day    = anchor.getDate();
    let pNum: number, pStart: Date, pEnd: Date;
    if (day <= 15) {
      pNum   = 1;
      pStart = new Date(yr, mo, 1);
      pEnd   = new Date(yr, mo, 15);
    } else {
      pNum   = 2;
      pStart = new Date(yr, mo, 16);
      pEnd   = new Date(yr, mo + 1, 0);
    }
    return {
      label: `P${pNum}  ·  ${format(pStart, "MMM d")} – ${format(pEnd, "MMM d, yyyy")}`,
    };
  }, [mobileGridDays]);

  const mobileIsCurrentWeek =
    format(mobileGridAnchor, "yyyy-MM-dd") ===
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  // ── Employee personal calendar computed values ─────────────────────────
  // 42-cell Mon-first grid for the employee's selected month
  const empCalGrid = useMemo(() => {
    const gs = startOfWeek(empCalAnchor, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gs, i));
  }, [empCalAnchor]);

  const empPeriodBounds = useMemo(() => {
    const yr = empCalAnchor.getFullYear();
    const mo = empCalAnchor.getMonth();
    if (empPeriod === 1) return {
      start: format(new Date(yr, mo, 1), "yyyy-MM-dd"),
      end:   format(new Date(yr, mo, 15), "yyyy-MM-dd"),
      label: `P1  ·  ${format(empCalAnchor, "MMM")} 1 – 15`,
    };
    const lastDay = new Date(yr, mo + 1, 0).getDate();
    return {
      start: format(new Date(yr, mo, 16), "yyyy-MM-dd"),
      end:   format(new Date(yr, mo + 1, 0), "yyyy-MM-dd"),
      label: `P2  ·  ${format(empCalAnchor, "MMM")} 16 – ${lastDay}`,
    };
  }, [empCalAnchor, empPeriod]);

  // Shift lookup by date (all of the employee's loaded schedules)
  const empShiftByDate = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      if (!m[s.date]) m[s.date] = [];
      m[s.date].push(s);
    }
    return m;
  }, [schedules]);

  // Shifts falling inside the selected period
  const empPeriodShifts = useMemo(
    () => schedules.filter((s) => s.date >= empPeriodBounds.start && s.date <= empPeriodBounds.end),
    [schedules, empPeriodBounds]
  );

  const empTotalHours = empPeriodShifts.reduce((acc, s) => {
    const [sh, sm] = s.shiftStart.split(":").map(Number);
    const [eh, em] = s.shiftEnd.split(":").map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return acc + mins / 60;
  }, 0);

  const empTodayInCurrentMonth =
    format(empCalAnchor, "yyyy-MM") === format(new Date(), "yyyy-MM");

  // Shift map for mobile: eid::date → Schedule[]
  const mobileShiftMap = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      const key = `${s.eid}::${s.date}`;
      if (!m[key]) m[key] = [];
      m[key].push(s);
    }
    return m;
  }, [schedules]);

  // Grid employee rows (filtered by search)
  const gridEmployees = useMemo(() => {
    let base = isPrivileged ? activeEmployees : activeEmployees.filter((u) => u.userId === user?.userId);
    if (gridSearch.trim()) {
      const q = gridSearch.toLowerCase();
      base = base.filter((e) => e.name.toLowerCase().includes(q) || e.userId.toLowerCase().includes(q));
    }
    return base;
  }, [isPrivileged, activeEmployees, user, gridSearch]);

  function empName(eid: string) { return allUsers.find((u) => u.userId === eid)?.name ?? eid; }

  function openBuilder(date?: Date, eid?: string) {
    setBuilderDefEid(eid);
    setBuilderDefDate(date ? format(date, "yyyy-MM-dd") : undefined);
    setBuilderOpen(true);
  }

  async function handleDelete(s: Schedule) {
    try {
      await deleteAny.mutateAsync(s.id);
      toast({ title: "Shift deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  }

  // Column widths per mode
  const colMin = viewMode === "fortnight" ? "min-w-[62px]" : "min-w-[50px]";

  const modeBtnCls = (m: ViewMode) =>
    `px-3 py-1 text-sm rounded-md border transition-colors ${
      viewMode === m
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background border-input hover:bg-muted"
    }`;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-full">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Schedule</h1>
            <p className="text-sm text-muted-foreground">
              {isPrivileged
                ? "Plan team shifts — search an employee and schedule across any date range"
                : "Your upcoming shifts"}
            </p>
          </div>
          {isPrivileged && (
            <div className="flex gap-2">
              <Button onClick={() => setRosterOpen(true)} data-testid="button-roster-builder">
                <Plus className="w-4 h-4 mr-2" /> Roster Builder
              </Button>
              <Button variant="outline" onClick={() => openBuilder()} data-testid="button-add-schedule" size="sm">
                Single Shift
              </Button>
            </div>
          )}
        </div>

        {/* ── Controls row (admins/supervisors only) ───────────────────────── */}
        {isPrivileged && (
          <div className="flex flex-col gap-3">
            {/* Top row: view-mode tabs + Agency/Employee toggle + Clear */}
            <div className="flex items-center gap-2 flex-wrap">
              <button className={modeBtnCls("fortnight")}  onClick={() => switchMode("fortnight")}  data-testid="button-view-fortnight">Fortnight</button>
              <button className={modeBtnCls("month")}      onClick={() => switchMode("month")}      data-testid="button-view-month">Month</button>

              <div className="flex items-center rounded-md border border-border overflow-hidden ml-2">
                <button
                  onClick={() => setAdminDesktopView("agency")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${adminDesktopView === "agency" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  data-testid="button-view-agency"
                >
                  Agency View
                </button>
                <button
                  onClick={() => setAdminDesktopView("employee")}
                  className={`px-3 py-1.5 text-xs font-medium border-l border-border transition-colors ${adminDesktopView === "employee" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  data-testid="button-view-employee"
                >
                  Employee View
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {selectedEids.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setMassDeleteConfirm(true)}
                    data-testid="button-mass-delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Selected ({selectedEids.size})
                  </Button>
                )}
                {selectedEids.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearSelection} data-testid="button-clear-selection">
                    Cancel
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 border-destructive/40"
                  onClick={() => setClearConfirm(true)}
                  data-testid="button-clear-all"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear Period
                </Button>
              </div>
            </div>

            {/* Navigation + search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setAnchor((a) => advance(a, viewMode, -1))} data-testid="button-prev-period">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium min-w-[190px] text-center">{label}</span>
                <Button variant="outline" size="icon" onClick={() => setAnchor((a) => advance(a, viewMode, 1))} data-testid="button-next-period">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAnchor(todayAnchor(viewMode))} data-testid="button-today">
                  Today
                </Button>
              </div>

              {adminDesktopView === "employee" && (
                <div className="relative sm:ml-auto">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={gridSearch}
                    onChange={(e) => setGridSearch(e.target.value)}
                    placeholder="Filter grid by name…"
                    className="pl-8 w-52"
                    data-testid="input-grid-search"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Clear confirmation dialog ─────────────────────────────────────── */}
        <Dialog open={clearConfirm} onOpenChange={setClearConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> Clear Schedule
              </DialogTitle>
              <DialogDescription>
                This will permanently delete all schedules in the current period ({label}). This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setClearConfirm(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={clearSched.isPending}
                onClick={async () => {
                  await clearSched.mutateAsync({
                    eids: teamEids,
                    startDate: rangeStart,
                    endDate: rangeEnd,
                  });
                  setClearConfirm(false);
                  toast({ title: "Schedule cleared", description: `All shifts in ${label} have been removed.` });
                }}
                data-testid="button-confirm-clear"
              >
                {clearSched.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Yes, Clear All
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mass Delete Confirmation Dialog */}
        <Dialog open={massDeleteConfirm} onOpenChange={(open) => { if (!open) { setMassDeleteConfirm(false); clearSelection(); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> Delete Employee Shifts
              </DialogTitle>
              <DialogDescription>
                This will permanently delete all shifts in {label} for {selectedEids.size} selected employee{selectedEids.size !== 1 ? "s" : ""}. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setMassDeleteConfirm(false); clearSelection(); }}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={clearSched.isPending}
                onClick={async () => {
                  const count = selectedEids.size;
                  const eids = Array.from(selectedEids);
                  await clearSched.mutateAsync({ eids, startDate: rangeStart, endDate: rangeEnd });
                  setMassDeleteConfirm(false);
                  clearSelection();
                  toast({ title: "Shifts deleted", description: `Removed shifts for ${count} employee${count !== 1 ? "s" : ""} in ${label}.` });
                }}
                data-testid="button-confirm-mass-delete"
              >
                {clearSched.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Yes, Delete Shifts
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Desktop: Agency Roster View (admin/supervisor only) ─────────── */}
        {isPrivileged && adminDesktopView === "agency" && (
        <div className="hidden lg:block space-y-3">
          {/* Agency dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Agency
            </label>
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="select-agency-filter"
            >
              {CLIENT_AGENCIES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Roster grid: employees as rows, dates as columns */}
          <div className="overflow-x-auto">
            {(() => {
              const agencyShiftsInPeriod = visibleSchedules.filter(
                (s) => (s.client ?? "").toLowerCase() === agencyFilter.toLowerCase()
              );
              const agencyEids = Array.from(new Set(agencyShiftsInPeriod.map((s) => s.eid)));
              const agencyEmployees = activeEmployees.filter((e) => agencyEids.includes(e.userId));

              return (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-3 pl-2 font-semibold sticky left-0 bg-background z-10 border-r border-border/40 min-w-[185px]">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                          <Users className="w-3.5 h-3.5" /> Employee
                        </div>
                      </th>
                      {days.map((d, i) => {
                        const isToday = format(d, "yyyy-MM-dd") === todayStr;
                        return (
                          <th key={i} className={`text-center py-1.5 px-1 font-medium ${colMin}`}>
                            <div className={`flex flex-col items-center rounded-md px-0.5 py-0.5 ${isToday ? "bg-primary/10" : ""}`}>
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</span>
                              <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{format(d, "d")}</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {agencyEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={days.length + 1} className="py-12 text-center text-muted-foreground text-sm italic">
                          No shifts scheduled for {agencyFilter} in this period.
                        </td>
                      </tr>
                    ) : (
                      agencyEmployees.map((emp) => {
                        const isSelected = selectedEids.has(emp.userId);
                        return (
                        <tr key={emp.userId} className={`border-t border-border/40 hover:bg-muted/10 group ${isSelected ? "bg-destructive/5" : ""}`}>
                          <td className={`py-2 pr-2 pl-2 align-middle sticky left-0 z-10 border-r border-border/40 ${isSelected ? "bg-destructive/5" : "bg-background group-hover:bg-muted/10"}`}>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleEidSelection(emp.userId)}
                                className="w-3.5 h-3.5 accent-destructive shrink-0 cursor-pointer"
                                data-testid={`checkbox-emp-${emp.userId}`}
                              />
                              <button
                                className="text-left flex-1 min-w-0 hover:text-primary transition-colors"
                                onClick={() => openBuilder(undefined, emp.userId)}
                                data-testid={`button-agency-emp-row-${emp.userId}`}
                              >
                                <div className="font-medium text-sm truncate max-w-[120px]">{emp.name}</div>
                                <div className="text-[11px] text-muted-foreground truncate max-w-[120px]">{emp.pos}</div>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedEids(new Set([emp.userId]));
                                  setMassDeleteConfirm(true);
                                }}
                                className="shrink-0 w-5 h-5 rounded hover:bg-destructive/10 hover:text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                title={`Delete all ${agencyFilter} shifts for ${emp.name} in this period`}
                                data-testid={`button-delete-emp-row-${emp.userId}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          {days.map((d, i) => {
                            const dateStr = format(d, "yyyy-MM-dd");
                            const cellShifts = (scheduleMap[`${emp.userId}::${dateStr}`] ?? []).filter(
                              (s) => (s.client ?? "").toLowerCase() === agencyFilter.toLowerCase()
                            );
                            const isToday = dateStr === todayStr;
                            return (
                              <td key={i} className={`py-1 px-1 align-top ${colMin} ${isToday ? "bg-primary/5" : ""}`}>
                                <div className="space-y-0.5">
                                  {cellShifts.map((s) => (
                                    <div
                                      key={s.id}
                                      className={`rounded px-1.5 py-1 text-[10px] leading-tight border flex items-start justify-between gap-0.5 cursor-pointer hover:shadow-sm transition-shadow ${
                                        s.armed === "Armed"
                                          ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100"
                                          : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100"
                                      }`}
                                      onClick={() => setEditShift(s)}
                                      data-testid={`agency-cell-${s.id}`}
                                    >
                                      <div className="min-w-0">
                                        <div className="font-semibold whitespace-nowrap">{fmt12(s.shiftStart)}</div>
                                        <div className="opacity-80 whitespace-nowrap">{fmt12(s.shiftEnd)}</div>
                                        {s.location && <div className="truncate opacity-70 text-[9px]">{s.location}</div>}
                                        <div className="flex items-center gap-0.5 mt-0.5 opacity-70">
                                          {s.armed === "Armed" ? <Shield className="w-2 h-2 shrink-0" /> : <ShieldOff className="w-2 h-2 shrink-0" />}
                                        </div>
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteAny.mutate(s.id); }}
                                        className="shrink-0 w-4 h-4 rounded hover:bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete shift"
                                        data-testid={`button-delete-agency-shift-${s.id}`}
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                  {cellShifts.length === 0 && empHasAnyShift && (
                                    <div className="flex items-center justify-center min-h-[52px] text-[10px] font-medium text-muted-foreground/60 tracking-wide group-hover:hidden">Off Duty</div>
                                  )}
                                  <button
                                    onClick={() => openBuilder(d, emp.userId)}
                                    className="w-full rounded border border-dashed border-border/60 text-muted-foreground/60 hover:border-primary hover:text-primary py-0.5 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                    data-testid={`button-add-agency-${emp.userId}-${i}`}
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                      })
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
        )}

        {/* ── Desktop: Employee Grid View (admin/supervisor only) ──────────── */}
        {isPrivileged && adminDesktopView === "employee" && (
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 pr-3 pl-1 font-medium text-muted-foreground w-36 shrink-0 sticky left-0 bg-background z-10 border-r border-border/40">
                  <div className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> Employee
                  </div>
                </th>
                {days.map((d, i) => {
                  const isToday = format(d, "yyyy-MM-dd") === todayStr;
                  return (
                    <th key={i} className={`text-center py-1.5 px-0.5 font-medium ${colMin} ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      <div className={`flex flex-col items-center gap-0 rounded-md px-0.5 py-0.5 ${isToday ? "bg-primary/10" : ""}`}>
                        <span className="text-[9px] uppercase tracking-wide">{format(d, "EEE")}</span>
                        <span className={`text-xs font-bold ${isToday ? "text-primary" : ""}`}>{format(d, "d")}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {gridEmployees.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 1} className="py-16 text-center text-muted-foreground text-sm">
                    {gridSearch ? `No employees matching "${gridSearch}"` : "No employees to display."}
                  </td>
                </tr>
              ) : (
                gridEmployees.map((emp) => {
                  const isSelected = selectedEids.has(emp.userId);
                  const empHasAnyShift = days.some((d) => (scheduleMap[`${emp.userId}::${format(d, "yyyy-MM-dd")}`] ?? []).length > 0);
                  return (
                  <tr key={emp.userId} className={`border-t border-border/40 hover:bg-muted/10 group ${isSelected ? "bg-destructive/5" : ""}`}>
                    <td className={`py-2 pr-2 pl-1 align-top sticky left-0 z-10 border-r border-border/40 ${isSelected ? "bg-destructive/5" : "bg-background group-hover:bg-muted/10"}`}>
                      <div className="flex items-start gap-1.5">
                        {isPrivileged && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEidSelection(emp.userId)}
                            className="w-3.5 h-3.5 mt-0.5 accent-destructive shrink-0 cursor-pointer"
                            data-testid={`checkbox-emp-grid-${emp.userId}`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            className="text-left w-full hover:text-primary transition-colors"
                            onClick={() => isPrivileged && openBuilder(undefined, emp.userId)}
                            title="Open Schedule Builder for this employee"
                            data-testid={`button-emp-row-${emp.userId}`}
                          >
                            <div className="font-medium text-sm truncate max-w-[110px]">{emp.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[110px]">{emp.pos}</div>
                          </button>
                        </div>
                        {isPrivileged && (
                          <button
                            onClick={() => {
                              setSelectedEids(new Set([emp.userId]));
                              setMassDeleteConfirm(true);
                            }}
                            className="shrink-0 w-5 h-5 rounded hover:bg-destructive/10 hover:text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                            title={`Delete all shifts for ${emp.name} in this period`}
                            data-testid={`button-delete-emp-grid-${emp.userId}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {days.map((d, i) => {
                      const dateStr    = format(d, "yyyy-MM-dd");
                      const cellShifts = scheduleMap[`${emp.userId}::${dateStr}`] ?? [];
                      const isToday    = dateStr === todayStr;

                      return (
                        <td key={i} className={`py-1 px-0.5 align-top ${colMin} ${isToday ? "bg-primary/5" : ""}`}>
                          <div className="space-y-1">
                            {cellShifts.map((s) => (
                              <div
                                key={s.id}
                                className={`rounded px-1.5 py-1 leading-tight border hover:shadow-sm transition-shadow text-[10px] ${
                                  isPrivileged ? "cursor-pointer" : ""
                                } ${
                                  s.armed === "Armed"
                                    ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100"
                                    : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100"
                                }`}
                                onClick={() => isPrivileged && setEditShift(s)}
                                data-testid={`schedule-cell-${s.id}`}
                              >
                                <div className="font-semibold whitespace-nowrap">{fmt12(s.shiftStart)}</div>
                                <div className="opacity-80 whitespace-nowrap">{fmt12(s.shiftEnd)}</div>
                                {s.client && <div className="truncate opacity-70 text-[9px] font-semibold">{s.client}</div>}
                                {s.location && <div className="truncate opacity-60 text-[9px]">{s.location}</div>}
                                <div className="flex items-center gap-0.5 mt-0.5">
                                  {s.armed === "Armed"
                                    ? <Shield className="w-2 h-2 shrink-0" />
                                    : <ShieldOff className="w-2 h-2 shrink-0" />}
                                </div>
                              </div>
                            ))}
                            {cellShifts.length === 0 && empHasAnyShift && (
                              <div className="flex items-center justify-center min-h-[52px] text-[10px] font-medium text-muted-foreground/60 tracking-wide group-hover:hidden">Off Duty</div>
                            )}
                            {isPrivileged && (
                              <button
                                onClick={() => openBuilder(d, emp.userId)}
                                className="w-full rounded border border-dashed border-border/60 text-muted-foreground/60 hover:border-primary hover:text-primary py-0.5 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                data-testid={`button-add-cell-${emp.userId}-${i}`}
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* ── Desktop: Employee personal schedule (non-admin) ─────────────── */}
        {!isPrivileged && (
        <div className="hidden lg:flex gap-6">

          {/* Left: Calendar */}
          <div className="flex-1 min-w-0">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setEmpCalAnchor((a) => subMonths(a, 1))} className="p-1.5 rounded-md hover:bg-muted" data-testid="button-emp-prev-month-desktop"><ChevronLeft className="w-4 h-4" /></button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">{format(empCalAnchor, "MMMM yyyy")}</h2>
                {!empTodayInCurrentMonth && (
                  <button onClick={() => setEmpCalAnchor(startOfMonth(new Date()))} className="text-xs text-primary font-medium hover:underline" data-testid="button-emp-today-desktop">Today</button>
                )}
              </div>
              <button onClick={() => setEmpCalAnchor((a) => addMonths(a, 1))} className="p-1.5 rounded-md hover:bg-muted" data-testid="button-emp-next-month-desktop"><ChevronRight className="w-4 h-4" /></button>
            </div>
            {/* Period tabs */}
            <div className="flex border rounded-lg overflow-hidden mb-4">
              {([1, 2] as const).map((p) => {
                const yr = empCalAnchor.getFullYear(), mo = empCalAnchor.getMonth();
                const lbl = p === 1 ? `Period 1 · ${format(empCalAnchor, "MMM")} 1–15`
                  : `Period 2 · ${format(empCalAnchor, "MMM")} 16–${new Date(yr, mo + 1, 0).getDate()}`;
                return (
                  <button key={p} onClick={() => setEmpPeriod(p)} className={`flex-1 py-2 text-sm font-semibold transition-colors ${empPeriod === p ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`} data-testid={`button-emp-period-desktop-${p}`}>{lbl}</button>
                );
              })}
            </div>
            {/* DOW headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                <div key={d} className="text-center text-[11px] font-bold text-muted-foreground uppercase py-1">{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 border-l border-t border-border/30 rounded-md overflow-hidden">
              {empCalGrid.map((d, i) => {
                const ds = format(d, "yyyy-MM-dd");
                const inMonth = format(d, "yyyy-MM") === format(empCalAnchor, "yyyy-MM");
                const inPeriod = ds >= empPeriodBounds.start && ds <= empPeriodBounds.end;
                const isToday = ds === todayStr;
                const dayShifts = empShiftByDate[ds] ?? [];
                return (
                  <div key={i} className={`border-b border-r border-border/30 min-h-[80px] p-1.5 ${!inMonth ? "bg-muted/10 opacity-30" : !inPeriod ? "bg-muted/5 opacity-50" : isToday ? "bg-primary/5" : ""}`}>
                    <div className={`text-[11px] font-bold mb-1 flex items-center justify-between`}>
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{format(d, "d")}</span>
                      ) : <span className={!inMonth || !inPeriod ? "text-muted-foreground" : "text-foreground"}>{format(d, "d")}</span>}
                    </div>
                    {dayShifts.map((s) => (
                      <div key={s.id} className={`rounded p-1 mb-0.5 text-[10px] leading-tight ${s.armed === "Armed" ? "bg-red-100 border border-red-200 text-red-900" : "bg-green-100 border border-green-200 text-green-900"}`} data-testid={`emp-shift-desktop-${s.id}`}>
                        <div className="font-bold">{fmt12(s.shiftStart)}–{fmt12(s.shiftEnd)}</div>
                        {s.company && <div className="truncate opacity-80 font-semibold">{s.company}</div>}
                        {s.location && <div className="truncate opacity-70">{s.location}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Period shift list */}
          <div className="w-80 shrink-0">
            <div className="bg-primary text-primary-foreground rounded-t-lg px-4 py-3">
              <p className="font-bold text-sm">{empPeriodBounds.label}</p>
              <p className="text-xs opacity-80 mt-0.5">
                {empPeriodShifts.length} shift{empPeriodShifts.length !== 1 ? "s" : ""}
                {empTotalHours > 0 ? `  ·  ${empTotalHours % 1 === 0 ? empTotalHours : empTotalHours.toFixed(1)} hrs scheduled` : ""}
              </p>
            </div>
            <div className="border border-t-0 rounded-b-lg overflow-hidden">
              {empPeriodShifts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground italic">No shifts scheduled this period.</div>
              ) : (
                <div className="divide-y">
                  {empPeriodShifts.sort((a, b) => a.date.localeCompare(b.date)).map((s) => (
                    <div key={s.id} className="px-4 py-3" data-testid={`emp-period-shift-${s.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground">{format(parseISO(s.date), "EEE, MMM d")}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.armed === "Armed" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {s.armed === "Armed" ? "Armed" : "Unarmed"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-0.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {fmt12(s.shiftStart)} – {fmt12(s.shiftEnd)}
                      </div>
                      {s.company && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="w-3 h-3 shrink-0" /> {s.company}
                        </div>
                      )}
                      {s.location && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" /> {s.location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="flex gap-4 mt-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> On Duty (Unarmed)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> On Duty (Armed)</span>
            </div>
          </div>

        </div>
        )}

        {/* ── Mobile views (admin: roster grid | employee: personal calendar) ── */}
        <div className="lg:hidden -mx-4">

        {/* ═══════════════════ ADMIN / PRIVILEGED: roster grid ══════════════ */}
        {isPrivileged && (<>

          {/* Period banner */}
          <div className="bg-primary text-primary-foreground text-center py-1.5 px-4">
            <span className="text-[11px] font-semibold tracking-wider uppercase">
              {mobilePeriodInfo.label}
            </span>
          </div>

          {/* Week navigation */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
            <button
              className="p-2 rounded-lg hover:bg-muted active:scale-95 transition-all"
              onClick={() => setMobileGridAnchor((a) => addDays(a, -7))}
              data-testid="button-mobile-prev-week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[12px] font-semibold text-foreground">{mobileGridLabel}</span>
              {!mobileIsCurrentWeek && (
                <button
                  onClick={() => setMobileGridAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  className="text-[10px] text-primary font-medium mt-0.5"
                  data-testid="button-mobile-today"
                >
                  Today
                </button>
              )}
            </div>
            <button
              className="p-2 rounded-lg hover:bg-muted active:scale-95 transition-all"
              onClick={() => setMobileGridAnchor((a) => addDays(a, 7))}
              data-testid="button-mobile-next-week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Full-width roster grid — fills screen in portrait & landscape */}
          <div className="w-full overflow-x-hidden">
            <table
              className="w-full border-collapse"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                {/* Employee col: fixed 68px; day cols split remaining width evenly */}
                <col style={{ width: "68px" }} />
                {mobileGridDays.map((_, i) => <col key={i} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/50 border-b border-r py-1.5 px-1 text-left">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Staff</span>
                  </th>
                  {mobileGridDays.map((d, i) => {
                    const ds       = format(d, "yyyy-MM-dd");
                    const isToday  = ds === todayStr;
                    const dow      = d.getDay();
                    const isWkend  = dow === 0 || dow === 6;
                    return (
                      <th
                        key={i}
                        className={`text-center py-1.5 border-b border-r ${
                          isToday ? "bg-primary/15" : isWkend ? "bg-muted/40" : "bg-muted/20"
                        }`}
                      >
                        <div className={`text-[9px] font-semibold leading-none ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                          {["Su","Mo","Tu","We","Th","Fr","Sa"][dow]}
                        </div>
                        <div className={`text-[12px] font-bold leading-snug ${isToday ? "text-primary" : isWkend ? "text-muted-foreground/70" : "text-foreground"}`}>
                          {format(d, "d")}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {gridEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-muted-foreground text-xs italic">
                      No employees
                    </td>
                  </tr>
                ) : gridEmployees.map((emp, ri) => (
                  <tr
                    key={emp.userId}
                    className={`border-t border-border/30 ${ri % 2 === 0 ? "" : "bg-muted/5"}`}
                  >
                    {/* Employee name — sticky left */}
                    <td className="sticky left-0 z-10 bg-background border-r px-1 py-1 align-middle"
                        style={{ backgroundImage: ri % 2 !== 0 ? "color-mix(in srgb, var(--muted) 5%, transparent)" : undefined }}>
                      <div className="text-[10px] font-semibold leading-tight truncate">
                        {emp.name.split(" ")[0]}
                      </div>
                      <div className="text-[9px] text-muted-foreground leading-tight truncate">
                        {emp.name.split(" ").slice(1).join(" ")}
                      </div>
                    </td>
                    {/* Day cells */}
                    {mobileGridDays.map((d, ci) => {
                      const ds     = format(d, "yyyy-MM-dd");
                      const isToday = ds === todayStr;
                      const dow    = d.getDay();
                      const isWkend = dow === 0 || dow === 6;
                      const shifts = mobileShiftMap[`${emp.userId}::${ds}`] ?? [];

                      // Abbreviate: "08:00" → "8A", "16:00" → "4P"
                      const abbr = (t: string) => fmt12(t).replace(":00 AM","A").replace(":00 PM","P").replace(" AM","A").replace(" PM","P");

                      return (
                        <td
                          key={ci}
                          className={`p-0.5 align-top border-r ${
                            isToday ? "bg-primary/5" : isWkend ? "bg-muted/20" : ""
                          }`}
                        >
                          {shifts.length > 0 ? (
                            shifts.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => setEditShift(s)}
                                className={`w-full rounded text-center py-1 leading-none text-white hover:opacity-85 active:scale-95 transition-all block ${
                                  s.armed === "Armed"
                                    ? "bg-red-500 dark:bg-red-700"
                                    : "bg-blue-500 dark:bg-blue-700"
                                }`}
                                data-testid={`mobile-cell-${s.id}`}
                              >
                                <div className="text-[9px] font-bold">{abbr(s.shiftStart)}</div>
                                <div className="text-[8px] opacity-80">{abbr(s.shiftEnd)}</div>
                              </button>
                            ))
                          ) : isPrivileged ? (
                            <button
                              onClick={() => openBuilder(d, emp.userId)}
                              className="w-full rounded border border-dashed border-border/40 hover:border-primary hover:bg-primary/5 flex items-center justify-center transition-colors"
                              style={{ minHeight: "36px" }}
                              data-testid={`mobile-add-${emp.userId}-${ci}`}
                            >
                              <Plus className="w-2.5 h-2.5 text-muted-foreground/40" />
                            </button>
                          ) : (
                            <div className="w-full" style={{ minHeight: "36px" }} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-5 px-4 py-2 text-[10px] text-muted-foreground border-t bg-muted/10">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded bg-red-500" /> Armed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded bg-blue-500" /> Unarmed
            </span>
            {isPrivileged && (
              <span className="flex items-center gap-1.5">
                <Plus className="w-2.5 h-2.5" /> Tap to add
              </span>
            )}
          </div>
        </>)}

        {/* ═══════════════ EMPLOYEE: clean personal calendar ══════════════════ */}
        {!isPrivileged && (
            <>
              {/* Month navigation header */}
              <div className="flex items-center bg-primary text-primary-foreground select-none">
                <button
                  onClick={() => setEmpCalAnchor((a) => subMonths(a, 1))}
                  className="p-3 hover:bg-white/10 active:bg-white/20 transition-colors"
                  data-testid="button-emp-prev-month"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-[15px] font-bold tracking-wide">{format(empCalAnchor, "MMMM yyyy")}</p>
                  {!empTodayInCurrentMonth && (
                    <button
                      onClick={() => setEmpCalAnchor(startOfMonth(new Date()))}
                      className="text-[10px] opacity-80 underline underline-offset-2"
                      data-testid="button-emp-today"
                    >
                      Back to today
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setEmpCalAnchor((a) => addMonths(a, 1))}
                  className="p-3 hover:bg-white/10 active:bg-white/20 transition-colors"
                  data-testid="button-emp-next-month"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Period selector tabs */}
              <div className="flex border-b bg-background">
                {([1, 2] as const).map((p) => {
                  const yr = empCalAnchor.getFullYear();
                  const mo = empCalAnchor.getMonth();
                  const tabLabel = p === 1
                    ? `P1  ·  1 – 15 ${format(empCalAnchor, "MMM")}`
                    : `P2  ·  16 – ${new Date(yr, mo + 1, 0).getDate()} ${format(empCalAnchor, "MMM")}`;
                  return (
                    <button
                      key={p}
                      onClick={() => setEmpPeriod(p)}
                      className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors border-b-2 ${
                        empPeriod === p
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`button-emp-period-${p}`}
                    >
                      {tabLabel}
                    </button>
                  );
                })}
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 bg-muted/20 border-b">
                {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => (
                  <div key={d} className="text-center py-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 bg-background">
                {empCalGrid.map((d, i) => {
                  const ds        = format(d, "yyyy-MM-dd");
                  const inMonth   = format(d, "yyyy-MM") === format(empCalAnchor, "yyyy-MM");
                  const inPeriod  = ds >= empPeriodBounds.start && ds <= empPeriodBounds.end;
                  const isToday   = ds === todayStr;
                  const dow       = d.getDay();
                  const isWkend   = dow === 0 || dow === 6;
                  // Only show shifts for the currently selected period
                  const dayShifts = (inPeriod && inMonth) ? (empShiftByDate[ds] ?? []) : [];
                  const isEmpty   = inPeriod && inMonth && dayShifts.length === 0;

                  return (
                    <div
                      key={i}
                      className={`min-h-[78px] p-1 border-b border-r border-border/20 ${
                        !inMonth    ? "bg-muted/10 opacity-20"
                        : !inPeriod ? "bg-muted/5 opacity-40"
                        : isToday   ? "bg-primary/5"
                        : isWkend   ? "bg-muted/15"
                        : "bg-background"
                      }`}
                    >
                      {/* Day number */}
                      <div className={`h-5 flex items-center text-[11px] font-semibold leading-none mb-1 ${
                        isToday     ? "text-primary"
                        : !inMonth || !inPeriod ? "text-muted-foreground/40"
                        : isWkend   ? "text-muted-foreground/60"
                        : "text-foreground"
                      }`}>
                        {isToday ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                            {format(d, "d")}
                          </span>
                        ) : format(d, "d")}
                      </div>

                      {/* Shift chips — only for the selected period */}
                      {dayShifts.map((s) => (
                        <div
                          key={s.id}
                          className={`w-full rounded px-1 py-0.5 mb-0.5 leading-tight ${
                            s.armed === "Armed"
                              ? "bg-red-100 border border-red-200 text-red-900"
                              : "bg-green-100 border border-green-200 text-green-900"
                          }`}
                          data-testid={`emp-shift-${s.id}`}
                        >
                          <div className="text-[9px] font-bold tabular-nums">{fmt12(s.shiftStart)}</div>
                          <div className="text-[8px] opacity-70 tabular-nums">{fmt12(s.shiftEnd)}</div>
                        </div>
                      ))}

                      {/* Off Duty label — only shown when the employee has actual shifts in the period */}
                      {isEmpty && empPeriodShifts.length > 0 && (
                        <div className={`text-[8px] font-medium text-center leading-tight mt-1 ${
                          isWkend ? "text-muted-foreground/40" : "text-muted-foreground/55"
                        }`}>
                          <span>Off</span><br /><span>Duty</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Period summary bar */}
              <div className="px-4 py-3 bg-muted/10 border-t space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-foreground">{empPeriodBounds.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {empPeriodShifts.length} shift{empPeriodShifts.length !== 1 ? "s" : ""}
                      {empTotalHours > 0 ? `  ·  ${empTotalHours % 1 === 0 ? empTotalHours : empTotalHours.toFixed(1)} hrs` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded inline-block bg-red-400" /> Armed</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded inline-block bg-green-400" /> Unarmed</span>
                  </div>
                </div>

                {/* Shift detail list for the period */}
                {empPeriodShifts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Period Shifts</p>
                    {empPeriodShifts.sort((a, b) => a.date.localeCompare(b.date)).map((s) => (
                      <div key={s.id} className={`flex flex-col rounded-md px-3 py-2 border ${s.armed === "Armed" ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`} data-testid={`emp-period-row-${s.id}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-foreground">{format(parseISO(s.date), "EEE, MMM d")}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${s.armed === "Armed" ? "bg-red-200 text-red-800" : "bg-green-200 text-green-800"}`}>{s.armed ?? "Unarmed"}</span>
                        </div>
                        <div className="text-[11px] font-semibold mt-0.5">{fmt12(s.shiftStart)} – {fmt12(s.shiftEnd)}</div>
                        {s.company && <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3 shrink-0" />{s.company}</div>}
                        {s.location && <div className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{s.location}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
        )}

        </div>

        {/* ── Summary card (admins/supervisors only) ────────────────────────── */}
        {isPrivileged && visibleSchedules.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-primary" />
              {viewMode === "fortnight" ? "Fortnight" : "Month"} Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{visibleSchedules.length}</p>
                <p className="text-xs text-muted-foreground">Total shifts</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{visibleSchedules.filter((s) => s.armed === "Armed").length}</p>
                <p className="text-xs text-muted-foreground">Armed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{visibleSchedules.filter((s) => s.armed !== "Armed").length}</p>
                <p className="text-xs text-muted-foreground">Unarmed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{new Set(visibleSchedules.map((s) => s.eid)).size}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ── Roster Builder (full screen) ──────────────────────────────────────── */}
      <RosterBuilder
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        employees={activeEmployees}
        onSaved={refreshSchedules}
      />

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}
      <BuilderDialog
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        employees={activeEmployees}
        defaultEid={builderDefEid}
        defaultDate={builderDefDate}
        createdBy={user?.userId ?? ""}
        onSaved={refreshSchedules}
      />

      <EditDialog
        shift={editShift}
        employees={activeEmployees}
        onClose={() => setEditShift(null)}
        onSaved={refreshSchedules}
        onDelete={(s) => { setEditShift(null); setDeleteTarget(s); }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete shift?</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">
                Remove the <strong>{fmt12(deleteTarget.shiftStart)} – {fmt12(deleteTarget.shiftEnd)}</strong> shift
                for <strong>{empName(deleteTarget.eid)}</strong> on{" "}
                <strong>{format(parseISO(deleteTarget.date), "MMMM d, yyyy")}</strong>?
                This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleDelete(deleteTarget)} data-testid="button-confirm-delete">
                  Delete shift
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
