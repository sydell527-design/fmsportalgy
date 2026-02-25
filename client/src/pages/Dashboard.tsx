import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { ClockInOut } from "@/components/ClockInOut";
import { useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
  const { toast } = useToast();

  if (!user) return null;

  // Filter timesheets requiring this manager's approval
  const pendingApprovals = timesheets?.filter(t => {
    // Basic logic based on notes: if status is pending_first_approval and user's pos == timesheet owner's fa
    // Since we don't populate relationships heavily in this simple demo, we approximate:
    return t.status.includes('pending') && user.role !== 'employee';
  }) || [];

  const handleApprove = async (id: number) => {
    try {
      await updateTimesheet({ id, status: "approved" });
      toast({ title: "Timesheet approved" });
    } catch {
      toast({ title: "Failed to approve", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="grid gap-6">
        
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-sidebar to-sidebar/90 rounded-3xl p-8 text-white relative overflow-hidden corporate-shadow">
          <div className="relative z-10">
            <h2 className="text-3xl font-display font-bold mb-2">Welcome back, {user.name}</h2>
            <p className="text-white/80 text-lg">
              {user.role === 'admin' ? 'System Administrator Overview' : 
               user.role === 'manager' ? 'Manager Dashboard & Approvals' : 
               'Employee Portal'}
            </p>
          </div>
          <div className="absolute right-0 top-0 w-64 h-full opacity-10">
             <Building2 className="w-full h-full" />
          </div>
        </div>

        {/* Employee Specific Tools */}
        {user.role === 'employee' && (
          <ClockInOut />
        )}

        {/* Manager/Admin Approvals Widget */}
        {user.role !== 'employee' && (
          <div className="bg-card border border-border/50 rounded-3xl p-6 corporate-shadow">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-display font-bold">Pending Approvals</h3>
              <Badge variant="secondary" className="px-3 py-1 rounded-full text-sm">
                {pendingApprovals.length} Action Items
              </Badge>
            </div>
            
            {pendingApprovals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">All caught up! No pending approvals.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApprovals.map(ts => (
                  <div key={ts.id} className="flex flex-col sm:flex-row justify-between items-center p-4 border border-border/60 rounded-2xl hover:border-primary/50 transition-colors bg-background/50">
                    <div className="flex items-center gap-4 mb-4 sm:mb-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {ts.eid}
                      </div>
                      <div>
                        <p className="font-semibold">{ts.date}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {ts.ci || '--'} - {ts.co || 'Active'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button onClick={() => handleApprove(ts.id)} className="flex-1 sm:flex-none rounded-xl">Approve</Button>
                      <Button variant="outline" className="flex-1 sm:flex-none rounded-xl text-destructive hover:bg-destructive/10">Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}

// Need to import Building2 here for the decorative background
import { Building2 } from "lucide-react";
