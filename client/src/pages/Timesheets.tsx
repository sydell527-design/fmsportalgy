import { Layout } from "@/components/Layout";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Clock, MapPin, CheckCircle, AlertCircle } from "lucide-react";

export default function Timesheets() {
  const { user } = useAuth();
  const { data: timesheets, isLoading } = useTimesheets();

  // If employee, show only theirs. Otherwise show all (or filtered).
  const visibleTimesheets = timesheets?.filter(t => 
    user?.role === 'employee' ? t.eid === user.userId : true
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold">Timesheet History</h1>
        <p className="text-muted-foreground mt-1">Review chronological attendance records</p>
      </div>

      <div className="grid gap-4">
        {visibleTimesheets.map(ts => (
          <Card key={ts.id} className="p-6 rounded-2xl border-border/50 corporate-shadow flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-primary/30 transition-colors">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-display font-bold text-lg">{ts.date}</span>
                <Badge variant="outline" className="text-xs bg-secondary">{ts.eid}</Badge>
                {ts.status.includes('approved') ? (
                  <Badge className="bg-success text-success-foreground hover:bg-success/90"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-warning/20 text-warning-foreground"><AlertCircle className="w-3 h-3 mr-1" /> Pending</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground font-medium">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" /> 
                  <span className="text-foreground">In:</span> {ts.ci || '--'}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" /> 
                  <span className="text-foreground">Out:</span> {ts.co || '--'}
                </div>
                {ts.gIn && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" /> Geotagged
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-background border border-border/50 px-4 py-2 rounded-xl flex items-center gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Regular</p>
                <p className="font-display font-bold text-lg">{ts.reg}h</p>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Overtime</p>
                <p className="font-display font-bold text-lg">{ts.ot}h</p>
              </div>
            </div>
          </Card>
        ))}
        {visibleTimesheets.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-3xl">
             No timesheet records found.
          </div>
        )}
      </div>
    </Layout>
  );
}
