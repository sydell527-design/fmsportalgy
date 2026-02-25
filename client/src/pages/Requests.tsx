import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useRequests, useCreateRequest, useUpdateRequest } from "@/hooks/use-requests";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Clock, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Requests() {
  const { user } = useAuth();
  const { data: requests } = useRequests();

  const visibleRequests = requests?.filter(r => 
    user?.role === 'employee' ? r.eid === user.userId : true
  ).sort((a, b) => new Date(b.at || '').getTime() - new Date(a.at || '').getTime()) || [];

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Requests</h1>
          <p className="text-muted-foreground mt-1">Leave and overtime applications</p>
        </div>
        <RequestDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleRequests.map(req => (
          <div key={req.id} className="bg-card border border-border/50 p-6 rounded-3xl corporate-shadow hover:shadow-lg transition-all flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <Badge variant="outline" className="bg-secondary/50 font-semibold uppercase tracking-wider text-[10px]">
                {req.type}
              </Badge>
              <Badge variant={req.status === 'approved' ? 'default' : req.status === 'rejected' ? 'destructive' : 'secondary'}
                     className={req.status === 'approved' ? 'bg-success hover:bg-success text-success-foreground' : ''}>
                {req.status}
              </Badge>
            </div>
            
            <h3 className="font-display font-bold text-lg mb-1">{req.sub}</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{req.reason}</p>
            
            <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm font-medium text-foreground">
              {req.type === 'Leave' ? (
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary"/> {req.start} to {req.end}</div>
              ) : (
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary"/> {req.date} ({req.hrs}h)</div>
              )}
            </div>
            
            {user?.role !== 'employee' && req.status === 'pending' && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                <ApproveRejectButtons reqId={req.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}

function ApproveRejectButtons({ reqId }: { reqId: number }) {
  const { mutateAsync: updateRequest } = useUpdateRequest();
  const { toast } = useToast();

  const handleAction = async (status: string) => {
    try {
      await updateRequest({ id: reqId, status });
      toast({ title: `Request ${status}` });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  return (
    <>
      <Button size="sm" className="flex-1 rounded-xl bg-success hover:bg-success/90 text-success-foreground" onClick={() => handleAction('approved')}>Approve</Button>
      <Button size="sm" variant="outline" className="flex-1 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => handleAction('rejected')}>Reject</Button>
    </>
  );
}

function RequestDialog() {
  const [open, setOpen] = useState(false);
  const { mutateAsync: createRequest } = useCreateRequest();
  const { user } = useAuth();
  const { toast } = useToast();

  const [type, setType] = useState("Leave");
  const [sub, setSub] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await createRequest({
        reqId: `REQ-${Date.now()}`,
        eid: user.userId,
        type,
        sub,
        reason,
        status: "pending",
        at: format(new Date(), "yyyy-MM-dd HH:mm")
      });
      toast({ title: "Request submitted" });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
          <Plus className="w-5 h-5 mr-2" /> New Request
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Submit Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <select 
              className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={type} 
              onChange={e => setType(e.target.value)}
            >
              <option value="Leave">Leave</option>
              <option value="Overtime">Overtime</option>
              <option value="Expense">Expense</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Input value={sub} onChange={e => setSub(e.target.value)} required className="h-12 rounded-xl" placeholder="e.g. Annual Vacation" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Details / Reason</label>
            <textarea 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              required 
              className="flex min-h-[100px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" 
            />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl h-12 px-6">Cancel</Button>
            <Button type="submit" className="rounded-xl h-12 px-6">Submit</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
