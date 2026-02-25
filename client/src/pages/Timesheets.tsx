import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
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
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet } from "@shared/schema";

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
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
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

  // Admin override edit modal
  const [adminEditModal, setAdminEditModal] = useState<Timesheet | null>(null);
  const [adminForm, setAdminForm] = useState({ ci: "", co: "", brk: "30", notes: "", reason: "" });

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
  const empAv = (eid: string) => users?.find((u) => u.userId === eid)?.av ?? eid.slice(0, 2);

  // Employee can only review/sign AFTER clock-out
  const canEmployeeReview = (ts: Timesheet) =>
    ts.eid === user.userId && ts.status === "pending_employee" && !!ts.co;

  // Timesheet is in-progress (clocked in, not out yet)
  const isInProgress = (ts: Timesheet) =>
    ts.eid === user.userId && ts.status === "pending_employee" && !!ts.ci && !ts.co;

  const canManagerSign = (ts: Timesheet) => {
    const emp = users?.find((u) => u.userId === ts.eid);
    if (ts.status === "pending_first_approval" && emp?.fa === user.pos) return true;
    if (ts.status === "pending_second_approval" && emp?.sa === user.pos) return true;
    return false;
  };
  // Full access users can sign at any approval stage
  const canAdminSign = (ts: Timesheet) =>
    isFullAccess && (ts.status === "pending_first_approval" || ts.status === "pending_second_approval");

  // Full access users or JGM can override-edit any locked timesheet
  const canAdminEdit = (ts: Timesheet) =>
    (isFullAccess || user.pos === "Junior General Manager") && ts.status !== "pending_employee";

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
    setAdminForm({ ci: ts.ci ?? "", co: ts.co ?? "", brk: String(ts.brk ?? 30), notes: ts.notes ?? "", reason: "" });
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
        edited: true,
      });
      toast({ title: "Timesheet updated (admin override)" });
      setAdminEditModal(null);
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
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
        <div className="flex border-b border-border mb-5">
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
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : displayTs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
          No timesheet records found.
        </div>
      ) : (
        <div className="space-y-3">
          {displayTs.map((ts) => {
            const expanded = expandedId === ts.id;
            const inProgress = isInProgress(ts);
            const isLocked = ts.status !== "pending_employee";

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
                      {inProgress ? (
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
                      {ts.zone && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ts.zone}</span>}
                      {ts.edited && <span className="text-amber-500 font-medium">Edited</span>}
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

                    {/* In-progress notice for employee */}
                    {inProgress && user.role === "employee" && (
                      <span className="text-xs text-muted-foreground italic">Sign-off available after clock-out</span>
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

                    <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : ts.id)} data-testid={`button-expand-${ts.id}`}>
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded: signatures & audit */}
                {expanded && (
                  <div className="border-t border-border bg-muted/20 px-5 py-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approval Chain & Signatures</p>
                    <SigBlock sig={ts.eSig} label="Employee Sign-off" />
                    <SigBlock sig={ts.f1Sig} label="1st Approver" />
                    <SigBlock sig={ts.f2Sig} label="2nd Approver" />
                    {ts.disputed && ts.disputeNote && (
                      <div className="mt-2 p-3 rounded border border-orange-200 bg-orange-50 text-xs text-orange-800">
                        <p className="font-semibold mb-1">Dispute Details</p>
                        <p>{ts.disputeNote}</p>
                      </div>
                    )}
                    {ts.notes && (
                      <div className="mt-2 p-3 rounded border border-border bg-background text-xs">
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
        <DialogContent className="sm:max-w-md">
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
    </Layout>
  );
}
