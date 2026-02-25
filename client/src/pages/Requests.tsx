import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useRequests, useCreateRequest, useUpdateRequest } from "@/hooks/use-requests";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Clock, ArrowLeftRight, FileText, CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const TYPE_ICONS: Record<string, any> = {
  Leave: Calendar,
  Overtime: Clock,
  "Shift Swap": ArrowLeftRight,
  "Payroll Dispute": FileText,
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

function statusClass(status: string) {
  if (status === "approved") return "bg-green-100 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-100 text-red-700 border-red-200";
  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}

export default function Requests() {
  const { user } = useAuth();
  const { data: requests } = useRequests();
  const { data: users } = useUsers();
  const [filterType, setFilterType] = useState("All");
  const [commentModal, setCommentModal] = useState<{ id: number; comments: string[] } | null>(null);
  const [commentText, setCommentText] = useState("");
  const { mutateAsync: updateRequest } = useUpdateRequest();
  const { toast } = useToast();

  const visible = (requests ?? []).filter((r) => {
    if (user?.role === "employee" && r.eid !== user.userId) return false;
    if (filterType !== "All" && r.type !== filterType) return false;
    return true;
  }).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const empName = (eid: string) => users?.find((u) => u.userId === eid)?.name ?? eid;

  const handleAction = async (id: number, status: string, comment?: string) => {
    const req = requests?.find((r) => r.id === id);
    const existingComments = req?.comments ?? [];
    const newComments = comment ? [...existingComments, `${comment} — ${user?.name}`] : existingComments;
    try {
      await updateRequest({ id, status, comments: newComments });
      toast({ title: `Request ${status}` });
    } catch { toast({ title: "Action failed", variant: "destructive" }); }
  };

  const submitComment = async () => {
    if (!commentModal || !commentText.trim()) return;
    const req = requests?.find((r) => r.id === commentModal.id);
    const newComments = [...(req?.comments ?? []), `${commentText.trim()} — ${user?.name}`];
    try {
      await updateRequest({ id: commentModal.id, comments: newComments });
      toast({ title: "Comment added" });
      setCommentModal(null);
      setCommentText("");
    } catch { toast({ title: "Failed to add comment", variant: "destructive" }); }
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Leave, overtime, shift swap, and dispute requests</p>
        </div>
        {user?.role === "employee" && <RequestDialog />}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {["All", "Leave", "Overtime", "Shift Swap", "Payroll Dispute"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-md text-sm font-medium border transition-colors ${filterType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"}`}
            data-testid={`filter-${t.toLowerCase().replace(" ", "-")}`}
          >
            {t}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
          No requests found.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((req) => {
            const Icon = TYPE_ICONS[req.type] ?? FileText;
            const canAct = user?.role !== "employee" && req.status === "pending";
            return (
              <Card key={req.id} className="flex flex-col p-5" data-testid={`req-card-${req.id}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-primary/10">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{req.type}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusClass(req.status)}`}>{req.status}</span>
                </div>

                <h3 className="font-semibold text-sm mb-0.5">{req.sub}</h3>
                {user?.role !== "employee" && <p className="text-xs text-muted-foreground mb-2">{empName(req.eid)}</p>}
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{req.reason}</p>

                <div className="mt-auto pt-3 border-t border-border space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {req.type === "Leave" || req.type === "Shift Swap" ? (
                      <><Calendar className="w-3 h-3" /> {req.start} {req.end && req.end !== req.start ? `→ ${req.end}` : ""}</>
                    ) : req.type === "Overtime" ? (
                      <><Clock className="w-3 h-3" /> {req.date} · {req.hrs}h</>
                    ) : <><FileText className="w-3 h-3" /> {req.at?.split(" ")[0]}</>}
                  </div>

                  {(req.comments ?? []).length > 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 space-y-1">
                      {(req.comments ?? []).slice(-2).map((c, i) => <p key={i}>{c}</p>)}
                    </div>
                  )}

                  {canAct && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="flex-1" onClick={() => handleAction(req.id, "approved", "Approved")} data-testid={`button-approve-req-${req.id}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200" onClick={() => handleAction(req.id, "rejected", "Rejected")} data-testid={`button-reject-req-${req.id}`}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setCommentModal({ id: req.id, comments: req.comments ?? [] }); }} data-testid={`button-comment-${req.id}`}>
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Comment Modal */}
      <Dialog open={!!commentModal} onOpenChange={() => setCommentModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Comment</DialogTitle></DialogHeader>
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write your comment..."
            rows={3}
            data-testid="input-comment"
          />
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setCommentModal(null)}>Cancel</Button>
            <Button onClick={submitComment} disabled={!commentText.trim()}>Add Comment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function RequestDialog() {
  const [open, setOpen] = useState(false);
  const { mutateAsync: createRequest, isPending } = useCreateRequest();
  const { user } = useAuth();
  const { toast } = useToast();

  const [type, setType] = useState("Leave");
  const [sub, setSub] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hrs, setHrs] = useState(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await createRequest({
        reqId: `REQ-${Date.now()}`,
        eid: user.userId,
        type,
        sub: sub || type,
        reason,
        status: "pending",
        at: format(new Date(), "yyyy-MM-dd HH:mm"),
        start: ["Leave", "Shift Swap"].includes(type) ? startDate : undefined,
        end: ["Leave", "Shift Swap"].includes(type) ? endDate : undefined,
        date: type === "Overtime" ? startDate : undefined,
        hrs: type === "Overtime" ? hrs : undefined,
        comments: [],
      });
      toast({ title: "Request submitted" });
      setOpen(false);
      setType("Leave"); setSub(""); setReason(""); setStartDate(""); setEndDate(""); setHrs(1);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-request">
          <Plus className="w-4 h-4 mr-2" /> New Request
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Submit a Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <Label>Request Type</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
              data-testid="select-request-type"
            >
              <option value="Leave">Leave</option>
              <option value="Overtime">Overtime</option>
              <option value="Shift Swap">Shift Swap</option>
              <option value="Payroll Dispute">Payroll Dispute</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder={`e.g. Annual Leave, Overtime Request`} data-testid="input-request-sub" />
          </div>

          {["Leave", "Shift Swap"].includes(type) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required data-testid="input-start-date" />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required data-testid="input-end-date" />
              </div>
            </div>
          )}

          {type === "Overtime" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required data-testid="input-ot-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Hours Requested</Label>
                <Input type="number" min={0.5} max={12} step={0.5} value={hrs} onChange={(e) => setHrs(Number(e.target.value))} data-testid="input-ot-hours" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason / Details</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain your request..." rows={3} required data-testid="input-request-reason" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-request">
              {isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
