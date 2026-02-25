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
import { Clock, MapPin, PenLine, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet } from "@shared/schema";

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
  if (!sig) return (
    <div className="text-xs text-muted-foreground italic py-1">{label}: — Pending</div>
  );
  return (
    <div className="text-xs py-1">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <strong>{sig.name}</strong> · {sig.time} · {sig.ip}
    </div>
  );
}

export default function Timesheets() {
  const { user } = useAuth();
  const { data: timesheets, isLoading } = useTimesheets();
  const { data: users } = useUsers();
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
  const { toast } = useToast();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sigModal, setSigModal] = useState<{ ts: Timesheet; mode: "employee" | "approver" } | null>(null);
  const [disputeModal, setDisputeModal] = useState<Timesheet | null>(null);
  const [sigName, setSigName] = useState("");
  const [disputeData, setDisputeData] = useState({ ci: "", co: "", reason: "", sigName: "" });

  if (!user) return null;

  const allTs = timesheets ?? [];

  // Filter visible timesheets based on role
  const visible = allTs.filter((ts) => {
    if (user.role === "employee") return ts.eid === user.userId;
    if (user.role === "manager") {
      const emp = users?.find((u) => u.userId === ts.eid);
      return ts.eid === user.userId || emp?.fa === user.pos || emp?.sa === user.pos;
    }
    return true; // admin sees all
  }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const empName = (eid: string) => users?.find((u) => u.userId === eid)?.name ?? eid;
  const empAv = (eid: string) => users?.find((u) => u.userId === eid)?.av ?? eid.slice(0, 2);

  const canEmployeeSign = (ts: Timesheet) => ts.eid === user.userId && ts.status === "pending_employee";
  const canManagerSign = (ts: Timesheet) => {
    const emp = users?.find((u) => u.userId === ts.eid);
    if (ts.status === "pending_first_approval" && emp?.fa === user.pos) return true;
    if (ts.status === "pending_second_approval" && emp?.sa === user.pos) return true;
    return false;
  };
  const canAdminSign = (ts: Timesheet) => user.role === "admin" && (ts.status === "pending_first_approval" || ts.status === "pending_second_approval");

  const openSig = (ts: Timesheet, mode: "employee" | "approver") => {
    setSigModal({ ts, mode });
    setSigName(user.name);
  };

  const submitEmployeeSig = async () => {
    if (!sigModal) return;
    const sigObj = { name: sigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    try {
      await updateTimesheet({ id: sigModal.ts.id, eSig: sigObj, status: "pending_first_approval" });
      toast({ title: "Timesheet signed and submitted" });
      setSigModal(null);
      setSigName("");
    } catch { toast({ title: "Failed to sign", variant: "destructive" }); }
  };

  const submitApproverSig = async () => {
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
      setSigModal(null);
      setSigName("");
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
  };

  const submitDispute = async () => {
    if (!disputeModal) return;
    const sigObj = { name: disputeData.sigName.trim(), time: format(new Date(), "yyyy-MM-dd HH:mm"), ip: "web" };
    const note = `Claimed CI: ${disputeData.ci} | Claimed CO: ${disputeData.co} | Reason: ${disputeData.reason}`;
    try {
      await updateTimesheet({ id: disputeModal.id, disputed: true, disputeNote: note, eSig: sigObj, status: "pending_first_approval" });
      toast({ title: "Dispute raised and submitted to approver" });
      setDisputeModal(null);
      setDisputeData({ ci: "", co: "", reason: "", sigName: "" });
    } catch { toast({ title: "Failed to raise dispute", variant: "destructive" }); }
  };

  const submitReject = async (ts: Timesheet) => {
    try {
      await updateTimesheet({ id: ts.id, status: "rejected" });
      toast({ title: "Timesheet rejected" });
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {user.role === "employee" ? "Your attendance records and approval status" : "Team timesheets and approval workflow"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
          No timesheet records found.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((ts) => {
            const expanded = expandedId === ts.id;
            return (
              <Card key={ts.id} className="overflow-hidden" data-testid={`ts-card-${ts.id}`}>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Employee avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {empAv(ts.eid)}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {user.role !== "employee" && (
                        <span className="font-semibold text-sm">{empName(ts.eid)}</span>
                      )}
                      <span className="text-sm text-muted-foreground">{ts.date}</span>
                      <StatusBadge status={ts.status} disputed={ts.disputed} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> In: <strong className="text-foreground">{ts.ci ?? "--"}</strong></span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Out: <strong className="text-foreground">{ts.co ?? "--"}</strong></span>
                      <span>Reg: <strong className="text-foreground">{ts.reg}h</strong></span>
                      {(ts.ot ?? 0) > 0 && <span>OT: <strong className="text-amber-600">{ts.ot}h</strong></span>}
                      {ts.gIn && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Geotagged</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {canEmployeeSign(ts) && (
                      <>
                        <Button size="sm" onClick={() => openSig(ts, "employee")} data-testid={`button-employee-sign-${ts.id}`}>
                          <PenLine className="w-3.5 h-3.5 mr-1" /> Sign & Submit
                        </Button>
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-200" onClick={() => { setDisputeModal(ts); setDisputeData({ ci: ts.ci ?? "", co: ts.co ?? "", reason: "", sigName: user.name }); }}>
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Dispute
                        </Button>
                      </>
                    )}
                    {(canManagerSign(ts) || canAdminSign(ts)) && (
                      <>
                        <Button size="sm" onClick={() => openSig(ts, "approver")} data-testid={`button-mgr-sign-${ts.id}`}>
                          <PenLine className="w-3.5 h-3.5 mr-1" /> Sign
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => submitReject(ts)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : ts.id)} data-testid={`button-expand-${ts.id}`}>
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded: Signatures & Audit */}
                {expanded && (
                  <div className="border-t border-border bg-muted/20 px-5 py-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approval Chain & Signatures</p>
                    <SigBlock sig={ts.eSig} label="Employee Self-Sign" />
                    <SigBlock sig={ts.f1Sig} label="1st Approver" />
                    <SigBlock sig={ts.f2Sig} label="2nd Approver" />
                    {ts.disputed && ts.disputeNote && (
                      <div className="mt-3 p-3 rounded border border-orange-200 bg-orange-50 text-xs text-orange-800">
                        <p className="font-semibold mb-1">Dispute Details</p>
                        <p>{ts.disputeNote}</p>
                      </div>
                    )}
                    {ts.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {ts.notes}</p>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Employee Sign Modal */}
      <Dialog open={!!(sigModal?.mode === "employee")} onOpenChange={() => setSigModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Sign Timesheet</DialogTitle></DialogHeader>
          {sigModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Date:</span> <strong>{sigModal.ts.date}</strong></p>
                <p><span className="text-muted-foreground">Clock In:</span> <strong>{sigModal.ts.ci}</strong> · <span className="text-muted-foreground">Clock Out:</span> <strong>{sigModal.ts.co}</strong></p>
                <p><span className="text-muted-foreground">Regular:</span> <strong>{sigModal.ts.reg}h</strong> · <span className="text-muted-foreground">Overtime:</span> <strong>{sigModal.ts.ot}h</strong></p>
              </div>
              <p className="text-sm text-muted-foreground">I confirm the above times are accurate and submit this timesheet for management approval.</p>
              <div className="space-y-1.5">
                <Label>Your Full Name (typed signature)</Label>
                <Input value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Type your full name" data-testid="input-emp-sig" />
              </div>
              <p className="text-xs text-muted-foreground">Timestamp: {format(new Date(), "yyyy-MM-dd HH:mm")} · Source: web</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSigModal(null)}>Cancel</Button>
                <Button onClick={submitEmployeeSig} disabled={!sigName.trim()} data-testid="button-emp-confirm-sig">
                  <PenLine className="w-4 h-4 mr-1.5" /> Sign & Submit
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approver Sign Modal */}
      <Dialog open={!!(sigModal?.mode === "approver")} onOpenChange={() => setSigModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Approver Electronic Signature</DialogTitle></DialogHeader>
          {sigModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> <strong>{empName(sigModal.ts.eid)}</strong></p>
                <p><span className="text-muted-foreground">Date:</span> <strong>{sigModal.ts.date}</strong> · <strong>{sigModal.ts.ci} – {sigModal.ts.co}</strong></p>
                <p><span className="text-muted-foreground">Hours:</span> <strong>{sigModal.ts.reg}h + {sigModal.ts.ot}h OT</strong></p>
                <p><span className="text-muted-foreground">Stage:</span> <strong>{sigModal.ts.status === "pending_first_approval" ? "1st Approver Signature" : "2nd Approver (Final) Signature"}</strong></p>
                {sigModal.ts.disputed && <p className="text-orange-600 font-medium">⚑ Timesheet has a dispute raised</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Your Full Name (typed signature)</Label>
                <Input value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Type your full name" data-testid="input-approver-sig" />
              </div>
              <p className="text-xs text-muted-foreground">By signing, you approve this timesheet entry. Timestamp: {format(new Date(), "yyyy-MM-dd HH:mm")}</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSigModal(null)}>Cancel</Button>
                <Button onClick={submitApproverSig} disabled={!sigName.trim()} data-testid="button-approver-confirm-sig">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve & Sign
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dispute Modal */}
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
