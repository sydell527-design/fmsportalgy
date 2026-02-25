import { useState } from "react";
import { useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Clock, MapPin, PenLine, Edit2, CheckCircle2,
  Lock, UserCheck, Timer, ShieldCheck,
} from "lucide-react";
import { format, differenceInMinutes, parse } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet } from "@shared/schema";

function calcHours(ci: string, co: string, brkMins: number) {
  const [ih, im] = ci.split(":").map(Number);
  const [oh, om] = co.split(":").map(Number);
  const totalMins = Math.max(0, oh * 60 + om - (ih * 60 + im));
  const workMins = Math.max(0, totalMins - brkMins);
  const reg = Math.round(Math.min(8, workMins / 60) * 100) / 100;
  const ot = Math.round(Math.max(0, workMins / 60 - 8) * 100) / 100;
  return { reg, ot };
}

function elapsed(ci: string): string {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const start = parse(`${today} ${ci}`, "yyyy-MM-dd HH:mm", new Date());
  const mins = differenceInMinutes(now, start);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function ActiveOfficers() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { data: users } = useUsers();
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
  const { toast } = useToast();

  // Edit + sign modal
  const [editModal, setEditModal] = useState<Timesheet | null>(null);
  const [editForm, setEditForm] = useState({ ci: "", co: "", brk: "30", notes: "", sigName: "", addNote: "" });
  const [sigOnly, setSigOnly] = useState(false); // true = just adding note & signing, false = full edit

  if (!user) return null;

  const today = format(new Date(), "yyyy-MM-dd");

  // Officers who list this user's position as their 1st or 2nd sign-off approver
  // Fully dynamic — no position titles hardcoded anywhere
  const myOfficers = (users ?? []).filter(
    (u) => u.userId !== user.userId && (u.fa === user.pos || u.sa === user.pos)
  );
  const officerIds = myOfficers.map((u) => u.userId);

  // Today's timesheets for those officers
  const officerTs = (timesheets ?? []).filter(
    (ts) => officerIds.includes(ts.eid) && ts.date === today
  );

  // In-progress: clocked in, not clocked out yet
  const inProgress = officerTs.filter((ts) => ts.ci && !ts.co);

  // Awaiting 1st sign-off (employee has signed) — not yet locked by JGM
  const awaitingSignoff = officerTs.filter(
    (ts) => ts.status === "pending_first_approval" && !ts.f2Sig
  );

  // Already approved or locked by JGM
  const completed = officerTs.filter(
    (ts) => ts.status === "pending_second_approval" || ts.status === "approved" || (ts.f2Sig !== null && ts.f2Sig !== undefined)
  );

  const empName = (eid: string) => users?.find((u) => u.userId === eid)?.name ?? eid;
  const empAv = (eid: string) => users?.find((u) => u.userId === eid)?.av ?? eid.slice(0, 2);

  const openEdit = (ts: Timesheet, signOnly = false) => {
    setSigOnly(signOnly);
    setEditForm({
      ci: ts.ci ?? "",
      co: ts.co ?? "",
      brk: String(ts.brk ?? 30),
      notes: ts.notes ?? "",
      sigName: user.name,
      addNote: "",
    });
    setEditModal(ts);
  };

  const editHours = editForm.ci && editForm.co
    ? calcHours(editForm.ci, editForm.co, Number(editForm.brk) || 0)
    : null;

  const submitEditAndSign = async (doSign: boolean) => {
    if (!editModal) return;
    if (doSign && !editForm.sigName.trim()) {
      toast({ title: "Signature name required", variant: "destructive" }); return;
    }

    const hours = editHours ?? { reg: editModal.reg, ot: editModal.ot };
    const sigObj = doSign
      ? { name: editForm.sigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" }
      : null;

    const combinedNotes = [
      editForm.notes,
      editForm.addNote ? `[Supervisor note by ${user.name} @ ${format(new Date(), "HH:mm")}]: ${editForm.addNote}` : "",
    ].filter(Boolean).join("\n");

    try {
      await updateTimesheet({
        id: editModal.id,
        ci: editForm.ci,
        co: editForm.co,
        brk: Number(editForm.brk) || 0,
        reg: hours.reg,
        ot: hours.ot,
        notes: combinedNotes || editModal.notes,
        edited: editForm.ci !== editModal.ci || editForm.co !== editModal.co,
        ...(doSign ? { f1Sig: sigObj, status: "pending_second_approval" } : {}),
      });
      toast({ title: doSign ? "Timesheet approved — 1st sign-off applied" : "Timesheet updated" });
      setEditModal(null);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  if (myOfficers.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
        <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
        No officers are assigned under your supervision.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── In Progress ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Timer className="w-4 h-4 text-green-600" />
          <h3 className="font-semibold text-sm">Currently On Duty</h3>
          <Badge variant="secondary" className="text-xs">{inProgress.length}</Badge>
        </div>

        {inProgress.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-3 px-4 border border-dashed border-border rounded-md">
            No officers currently clocked in.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {inProgress.map((ts) => (
              <Card key={ts.id} className="p-4 border-l-4 border-l-green-400" data-testid={`active-officer-${ts.id}`}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm shrink-0">
                    {empAv(ts.eid)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight">{empName(ts.eid)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Clocked in <strong>{ts.ci}</strong>
                      {ts.zone && <> · <MapPin className="inline w-3 h-3" /> {ts.zone}</>}
                      {ts.post && <> · Post <strong>{ts.post}</strong></>}
                    </p>
                    <p className="text-xs text-green-600 font-medium mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> On duty for {elapsed(ts.ci!)}
                    </p>
                  </div>
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs shrink-0">Active</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Awaiting 1st Sign-off ───────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <PenLine className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold text-sm">Awaiting Your Sign-off</h3>
          <Badge variant="secondary" className="text-xs">{awaitingSignoff.length}</Badge>
        </div>

        {awaitingSignoff.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-3 px-4 border border-dashed border-border rounded-md">
            No timesheets pending your approval.
          </div>
        ) : (
          <div className="space-y-2">
            {awaitingSignoff.map((ts) => (
              <Card key={ts.id} className="p-4 border-l-4 border-l-amber-400" data-testid={`pending-sign-${ts.id}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                      {empAv(ts.eid)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{empName(ts.eid)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ts.date} · <strong>{ts.ci}</strong> → <strong>{ts.co}</strong>
                        {ts.zone && <> · <MapPin className="inline w-3 h-3" /> {ts.zone}</>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ts.reg}h reg{(ts.ot ?? 0) > 0 ? ` + ${ts.ot}h OT` : ""}
                        {ts.brk ? ` · ${ts.brk}min break` : ""}
                        {ts.edited && <span className="text-amber-500 ml-2 font-medium">Edited</span>}
                        {ts.disputed && <span className="text-orange-500 ml-2 font-medium">⚑ Dispute</span>}
                      </p>
                      {ts.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{ts.notes}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(ts, false)} data-testid={`button-sup-edit-${ts.id}`}>
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" onClick={() => openEdit(ts, true)} data-testid={`button-sup-sign-${ts.id}`}>
                      <PenLine className="w-3.5 h-3.5 mr-1" /> Sign Off
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Completed / Locked ──────────────────────────────────────── */}
      {completed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-muted-foreground">Processed Today</h3>
            <Badge variant="outline" className="text-xs">{completed.length}</Badge>
          </div>
          <div className="space-y-2">
            {completed.map((ts) => (
              <Card key={ts.id} className="p-3 opacity-70" data-testid={`completed-ts-${ts.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs shrink-0">
                    {empAv(ts.eid)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{empName(ts.eid)}</p>
                    <p className="text-xs text-muted-foreground">
                      {ts.ci} → {ts.co} · {ts.reg}h · {ts.status === "approved" ? "Fully Approved" : "Awaiting GM Sign-off"}
                    </p>
                  </div>
                  {ts.status === "approved" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-purple-500 shrink-0" />
                  )}
                  <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Edit / Sign Modal ─────────────────────────────────────────── */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sigOnly ? <PenLine className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {sigOnly ? "Review & Sign Off" : "Edit Timesheet"}
            </DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md bg-muted/30 border border-border px-4 py-2 text-sm">
                <strong>{empName(editModal.eid)}</strong> · {editModal.date}
                {editModal.zone && <> · <MapPin className="inline w-3 h-3 mx-0.5" />{editModal.zone}</>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Clock In</Label>
                  <Input type="time" value={editForm.ci} onChange={(e) => setEditForm({ ...editForm, ci: e.target.value })} data-testid="input-sup-ci" />
                </div>
                <div className="space-y-1.5">
                  <Label>Clock Out</Label>
                  <Input type="time" value={editForm.co} onChange={(e) => setEditForm({ ...editForm, co: e.target.value })} data-testid="input-sup-co" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Break (minutes)</Label>
                <Input type="number" min={0} max={120} value={editForm.brk} onChange={(e) => setEditForm({ ...editForm, brk: e.target.value })} />
              </div>

              {editHours && (
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 flex gap-6 text-sm">
                  <div><p className="text-xs text-muted-foreground">Regular</p><p className="font-bold text-lg">{editHours.reg}h</p></div>
                  {editHours.ot > 0 && <div><p className="text-xs text-amber-600">Overtime</p><p className="font-bold text-lg text-amber-600">{editHours.ot}h</p></div>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Supervisor Note <span className="text-muted-foreground font-normal">(appended to record)</span></Label>
                <Textarea
                  value={editForm.addNote}
                  onChange={(e) => setEditForm({ ...editForm, addNote: e.target.value })}
                  placeholder="e.g. Officer covered extended post until relief arrived..."
                  rows={2}
                  data-testid="input-sup-note"
                />
              </div>

              {/* Signature section */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {sigOnly
                    ? "By signing, you approve this shift record as 1st sign-off. This cannot be undone."
                    : "You can save changes only, or save and apply your 1st sign-off simultaneously."}
                </p>
                <div className="space-y-1.5">
                  <Label>Your Full Name (typed signature)</Label>
                  <Input
                    value={editForm.sigName}
                    onChange={(e) => setEditForm({ ...editForm, sigName: e.target.value })}
                    placeholder="Type your full name"
                    data-testid="input-sup-sig"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Timestamp: {format(new Date(), "yyyy-MM-dd HH:mm")} · web</p>
              </div>

              <div className="flex gap-2 justify-end flex-wrap">
                <Button variant="outline" onClick={() => setEditModal(null)}>Cancel</Button>
                {!sigOnly && (
                  <Button variant="outline" onClick={() => submitEditAndSign(false)} data-testid="button-sup-save-only">
                    Save Changes
                  </Button>
                )}
                <Button
                  onClick={() => submitEditAndSign(true)}
                  disabled={!editForm.sigName.trim()}
                  data-testid="button-sup-confirm-sign"
                >
                  <PenLine className="w-4 h-4 mr-1.5" />
                  {sigOnly ? "Apply 1st Sign-off" : "Save & Sign Off"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
