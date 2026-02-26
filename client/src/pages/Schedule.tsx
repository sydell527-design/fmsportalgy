import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useUsers } from "@/hooks/use-users";
import { useTeamSchedules, useSchedules, useDeleteSchedule } from "@/hooks/use-schedules";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit2, CalendarDays,
  Shield, ShieldOff, Clock, MapPin, Users, User,
} from "lucide-react";
import {
  FMS_LOCATIONS, CLIENT_AGENCIES, ARMED_STATUSES,
  type ArmedStatus, type ClientAgency,
} from "@shared/schema";
import type { Schedule } from "@shared/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function fmt12(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const BLANK_FORM = {
  eid: "",
  date: format(new Date(), "yyyy-MM-dd"),
  shiftStart: "06:00",
  shiftEnd: "14:00",
  location: "",
  armed: "Unarmed" as ArmedStatus,
  client: "" as ClientAgency | "",
  notes: "",
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Schedule() {
  const { user }      = useAuth();
  const { data: allUsers = [] } = useUsers();
  const { toast }     = useToast();
  const qc            = useQueryClient();

  const isSupervisor  = (user?.pos ?? "").toLowerCase().includes("supervisor");
  const isPrivileged  = user?.role === "admin" || user?.role === "manager" || isSupervisor;
  const isEmployee    = !isPrivileged;

  // Week navigation — starts on Monday
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const days = weekDates(weekStart);
  const weekLabel = `${format(days[0], "MMM d")} – ${format(days[6], "MMM d, yyyy")}`;

  // Employee filter (admin/manager only)
  const [filterEid, setFilterEid] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<Schedule | null>(null);
  const [form, setForm]             = useState({ ...BLANK_FORM });
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  // Active employees for the team schedule
  const activeEmployees = useMemo(
    () => allUsers.filter((u) => u.status === "active"),
    [allUsers]
  );

  // Fetch schedules
  const teamEids = isPrivileged
    ? (filterEid === "all" ? activeEmployees.map((u) => u.userId) : [filterEid])
    : [user?.userId ?? ""];

  const { data: teamSchedules = [] } = useTeamSchedules(teamEids);
  const { data: mySchedules   = [] } = useSchedules(isEmployee ? (user?.userId ?? "") : "");

  const schedules = isEmployee ? mySchedules : teamSchedules;

  // Delete schedule (for admin/manager)
  const { mutateAsync: deleteSchedule, isPending: isDeleting } = useDeleteSchedule(
    editing?.eid ?? user?.userId ?? ""
  );

  // ── Open add dialog ──────────────────────────────────────────────────────
  function openAdd(date?: Date, eid?: string) {
    setEditing(null);
    setForm({
      ...BLANK_FORM,
      date: date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      eid: eid ?? (isEmployee ? (user?.userId ?? "") : (filterEid !== "all" ? filterEid : "")),
    });
    setDialogOpen(true);
  }

  // ── Open edit dialog ─────────────────────────────────────────────────────
  function openEdit(s: Schedule) {
    setEditing(s);
    setForm({
      eid:        s.eid,
      date:       s.date,
      shiftStart: s.shiftStart,
      shiftEnd:   s.shiftEnd,
      location:   s.location ?? "",
      armed:      (s.armed as ArmedStatus) ?? "Unarmed",
      client:     (s.client as ClientAgency | "") ?? "",
      notes:      s.notes ?? "",
    });
    setDialogOpen(true);
  }

  // ── Save (create or update) ──────────────────────────────────────────────
  async function handleSave() {
    if (!form.eid)        { toast({ title: "Select an employee", variant: "destructive" }); return; }
    if (!form.date)       { toast({ title: "Select a date", variant: "destructive" }); return; }
    if (!form.shiftStart) { toast({ title: "Enter shift start time", variant: "destructive" }); return; }
    if (!form.shiftEnd)   { toast({ title: "Enter shift end time", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const body = {
        eid:        form.eid,
        date:       form.date,
        shiftStart: form.shiftStart,
        shiftEnd:   form.shiftEnd,
        location:   form.location || null,
        armed:      form.armed,
        client:     form.client || null,
        notes:      form.notes || null,
        createdBy:  user?.userId ?? "",
      };

      if (editing) {
        await apiRequest("PUT", `/api/schedules/${editing.id}`, body);
        toast({ title: "Schedule updated" });
      } else {
        await apiRequest("POST", "/api/schedules", body);
        toast({ title: "Schedule added" });
      }

      // Invalidate all schedule queries so the grid refreshes
      qc.invalidateQueries({ queryKey: ["/api/schedules"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSchedule(deleteTarget.id);
      qc.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "Schedule deleted" });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  // ── Schedules indexed by eid+date ────────────────────────────────────────
  const scheduleMap = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      const key = `${s.eid}::${s.date}`;
      if (!m[key]) m[key] = [];
      m[key].push(s);
    }
    return m;
  }, [schedules]);

  // Employees to show in grid rows
  const gridEmployees = useMemo(() => {
    if (isEmployee) return activeEmployees.filter((u) => u.userId === user?.userId);
    if (filterEid !== "all") return activeEmployees.filter((u) => u.userId === filterEid);
    return activeEmployees;
  }, [isEmployee, filterEid, activeEmployees, user]);

  // Lookup helper
  function empName(eid: string) {
    return allUsers.find((u) => u.userId === eid)?.name ?? eid;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-full">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Schedule</h1>
            <p className="text-sm text-muted-foreground">
              {isPrivileged ? "Manage team shifts — sets on-duty / off-duty status for clock-in" : "Your upcoming shifts"}
            </p>
          </div>
          {isPrivileged && (
            <Button onClick={() => openAdd()} data-testid="button-add-schedule">
              <Plus className="w-4 h-4 mr-2" /> Add Schedule
            </Button>
          )}
        </div>

        {/* ── Week nav + filters ───────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(w => subWeeks(w, 1))} data-testid="button-prev-week">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[170px] text-center">{weekLabel}</span>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(w => addWeeks(w, 1))} data-testid="button-next-week">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} data-testid="button-this-week">
              Today
            </Button>
          </div>

          {isPrivileged && (
            <div className="flex items-center gap-2 ml-auto">
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <select
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[180px]"
                value={filterEid}
                onChange={(e) => setFilterEid(e.target.value)}
                data-testid="select-filter-employee"
              >
                <option value="all">All employees</option>
                {activeEmployees.map((u) => (
                  <option key={u.userId} value={u.userId}>{u.name} ({u.userId})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Week grid (desktop) ──────────────────────────────────────────── */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 pr-4 pl-1 font-medium text-muted-foreground w-40 shrink-0">
                  <User className="w-3.5 h-3.5 inline mr-1" />Employee
                </th>
                {days.map((d, i) => {
                  const isToday = format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  return (
                    <th key={i} className={`text-center py-2 px-1 font-medium min-w-[110px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      <div>{DAYS[i]}</div>
                      <div className={`text-xs font-normal ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center mx-auto" : ""}`}>
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
                  <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                    No employees to display.
                  </td>
                </tr>
              ) : (
                gridEmployees.map((emp) => (
                  <tr key={emp.userId} className="border-t border-border/50 hover:bg-muted/20">
                    <td className="py-2 pr-4 pl-1 align-top">
                      <div className="font-medium text-sm truncate max-w-[140px]">{emp.name}</div>
                      <div className="text-[11px] text-muted-foreground">{emp.pos}</div>
                    </td>
                    {days.map((d, i) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const cellKey = `${emp.userId}::${dateStr}`;
                      const cellShifts = scheduleMap[cellKey] ?? [];
                      const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

                      return (
                        <td key={i} className={`py-1.5 px-1 align-top min-w-[110px] ${isToday ? "bg-primary/5" : ""}`}>
                          <div className="space-y-1">
                            {cellShifts.map((s) => (
                              <div
                                key={s.id}
                                className={`rounded-md px-2 py-1.5 text-[11px] leading-tight cursor-pointer border hover:shadow-sm transition-shadow ${
                                  s.armed === "Armed"
                                    ? "bg-red-50 border-red-200 text-red-900"
                                    : "bg-blue-50 border-blue-200 text-blue-900"
                                }`}
                                onClick={() => isPrivileged && openEdit(s)}
                                data-testid={`schedule-cell-${s.id}`}
                              >
                                <div className="font-semibold">
                                  {fmt12(s.shiftStart)} – {fmt12(s.shiftEnd)}
                                </div>
                                {s.location && <div className="truncate opacity-80">{s.location}</div>}
                                <div className="flex items-center gap-1 mt-0.5">
                                  {s.armed === "Armed"
                                    ? <Shield className="w-2.5 h-2.5" />
                                    : <ShieldOff className="w-2.5 h-2.5" />}
                                  <span>{s.armed ?? "Unarmed"}</span>
                                  {s.client && <span className="opacity-70">· {s.client}</span>}
                                </div>
                              </div>
                            ))}
                            {isPrivileged && (
                              <button
                                onClick={() => openAdd(d, emp.userId)}
                                className="w-full rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary text-xs py-1 flex items-center justify-center gap-1 transition-colors"
                                data-testid={`button-add-cell-${emp.userId}-${i}`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Day-by-day cards (mobile / tablet) ───────────────────────────── */}
        <div className="lg:hidden space-y-4">
          {days.map((d, di) => {
            const dateStr  = format(d, "yyyy-MM-dd");
            const isToday  = dateStr === format(new Date(), "yyyy-MM-dd");
            const dayShifts = schedules.filter((s) => s.date === dateStr);

            return (
              <div key={di}>
                <div className={`flex items-center justify-between mb-2 ${isToday ? "text-primary" : ""}`}>
                  <h3 className={`font-semibold text-sm ${isToday ? "text-primary" : "text-foreground"}`}>
                    {DAYS[di]}, {format(d, "MMMM d")}
                    {isToday && <span className="ml-2 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">Today</span>}
                  </h3>
                  {isPrivileged && (
                    <Button size="sm" variant="outline" onClick={() => openAdd(d)} className="h-7 text-xs">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  )}
                </div>

                {dayShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic pl-1">No shifts scheduled</p>
                ) : (
                  <div className="space-y-2">
                    {dayShifts.map((s) => (
                      <Card key={s.id} className={`p-3 border ${s.armed === "Armed" ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="font-semibold text-sm">{empName(s.eid)}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {fmt12(s.shiftStart)} – {fmt12(s.shiftEnd)}
                            </div>
                            {s.location && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3" /> {s.location}
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-xs font-medium">
                              {s.armed === "Armed"
                                ? <><Shield className="w-3 h-3 text-red-600" /><span className="text-red-700">Armed</span></>
                                : <><ShieldOff className="w-3 h-3 text-blue-600" /><span className="text-blue-700">Unarmed</span></>}
                              {s.client && <span className="text-muted-foreground ml-1">· {s.client}</span>}
                            </div>
                            {s.notes && <p className="text-[11px] text-muted-foreground italic">{s.notes}</p>}
                          </div>
                          {isPrivileged && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-white/60 rounded" data-testid={`button-edit-${s.id}`}>
                                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              <button onClick={() => setDeleteTarget(s)} className="p-1.5 hover:bg-white/60 rounded" data-testid={`button-delete-${s.id}`}>
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Summary card ─────────────────────────────────────────────────── */}
        {schedules.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-primary" /> Week Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{schedules.length}</p>
                <p className="text-xs text-muted-foreground">Total shifts</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{schedules.filter(s => s.armed === "Armed").length}</p>
                <p className="text-xs text-muted-foreground">Armed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{schedules.filter(s => s.armed !== "Armed").length}</p>
                <p className="text-xs text-muted-foreground">Unarmed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{new Set(schedules.map(s => s.eid)).size}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ── Add / Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Schedule" : "Add Schedule"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Employee */}
            {isPrivileged && (
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={form.eid}
                  onChange={(e) => setForm((p) => ({ ...p, eid: e.target.value }))}
                  data-testid="select-schedule-employee"
                >
                  <option value="">— Select employee —</option>
                  {activeEmployees.map((u) => (
                    <option key={u.userId} value={u.userId}>{u.name} ({u.userId}) — {u.pos}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                data-testid="input-schedule-date"
              />
            </div>

            {/* Shift times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shift Start</Label>
                <Input
                  type="time"
                  value={form.shiftStart}
                  onChange={(e) => setForm((p) => ({ ...p, shiftStart: e.target.value }))}
                  data-testid="input-shift-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Shift End</Label>
                <Input
                  type="time"
                  value={form.shiftEnd}
                  onChange={(e) => setForm((p) => ({ ...p, shiftEnd: e.target.value }))}
                  data-testid="input-shift-end"
                />
              </div>
            </div>

            {/* Armed / Unarmed */}
            <div className="space-y-1.5">
              <Label>Armed Status</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, armed: "Unarmed" }))}
                  data-testid="button-schedule-unarmed"
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                    form.armed === "Unarmed"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <ShieldOff className="w-4 h-4" /> Unarmed
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, armed: "Armed" }))}
                  data-testid="button-schedule-armed"
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                    form.armed === "Armed"
                      ? "bg-red-600 text-white border-red-600"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Shield className="w-4 h-4" /> Armed
                </button>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label>Location / Post</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                data-testid="select-schedule-location"
              >
                <option value="">— Select location —</option>
                {FMS_LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client / Agency</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.client}
                onChange={(e) => setForm((p) => ({ ...p, client: e.target.value as ClientAgency | "" }))}
                data-testid="select-schedule-client"
              >
                <option value="">— Select client —</option>
                {CLIENT_AGENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Relief shift, covering Neptune P3…"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                data-testid="input-schedule-notes"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={saving} data-testid="button-save-schedule">
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Schedule"}
              </Button>
              {editing && isPrivileged && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => { setDeleteTarget(editing); setDialogOpen(false); }}
                  data-testid="button-delete-schedule"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Schedule</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <strong>{empName(deleteTarget?.eid ?? "")}</strong>'s shift on{" "}
            <strong>{deleteTarget?.date}</strong> ({deleteTarget?.shiftStart} – {deleteTarget?.shiftEnd})?
            This cannot be undone.
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={isDeleting} data-testid="button-confirm-delete">
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
