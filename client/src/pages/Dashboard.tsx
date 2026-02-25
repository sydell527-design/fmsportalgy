import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { ClockInOut } from "@/components/ClockInOut";
import { ActiveOfficers } from "@/components/ActiveOfficers";
import { useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { useRequests } from "@/hooks/use-requests";
import { useUsers } from "@/hooks/use-users";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users, Clock, CheckCircle2, AlertTriangle, FileText,
  TrendingUp, BarChart2, Calendar, PenLine, XCircle, UserCheck,
  MapPin, Timer, Radio,
} from "lucide-react";
import { format, differenceInMinutes, parse } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet } from "@shared/schema";

function statusColor(status: string) {
  if (status === "approved") return "bg-green-100 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-100 text-red-700 border-red-200";
  if (status === "pending_second_approval") return "bg-purple-100 text-purple-700 border-purple-200";
  if (status === "pending_first_approval") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (status === "pending_employee") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    pending_second_approval: "Awaiting 2nd Sign-off",
    pending_first_approval: "Awaiting 1st Sign-off",
    pending_employee: "Awaiting Your Signature",
  };
  return map[status] ?? status;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { data: requests } = useRequests();
  const { data: users } = useUsers();
  const { mutateAsync: updateTimesheet } = useUpdateTimesheet();
  const { toast } = useToast();

  // Full Access: admin or manager always get the full portal
  const isFullAccess = user.role === "admin" || user.role === "manager";
  // Stage 2 (Supervisor): any employee whose position appears as fa or sa on at least one other employee
  // Dynamically derived — no position titles are hardcoded
  const isSupervisor =
    user.role === "employee" &&
    (users ?? []).some(
      (u) => u.userId !== user.userId && (u.fa === user.pos || u.sa === user.pos)
    );
  const [supTab, setSupTab] = useState<"my-shift" | "active-officers">("my-shift");

  const [sigModal, setSigModal] = useState<{ ts: Timesheet; role: "approver" } | null>(null);
  const [sigName, setSigName] = useState("");
  const [rejectModal, setRejectModal] = useState<Timesheet | null>(null);

  if (!user) return null;

  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = format(new Date(), "yyyy-MM");

  // ── Admin / Manager stats ──────────────────────────────────────────────────
  const totalEmployees = users?.filter((u) => u.status === "active").length ?? 0;
  const clockedInToday = timesheets?.filter((t) => t.date === today && t.ci && !t.co).length ?? 0;

  const pendingApprovals = timesheets?.filter((ts) => {
    if (ts.status === "pending_first_approval") {
      const emp = users?.find((u) => u.userId === ts.eid);
      return emp?.fa === user.pos;
    }
    if (ts.status === "pending_second_approval") {
      const emp = users?.find((u) => u.userId === ts.eid);
      return emp?.sa === user.pos;
    }
    return false;
  }) ?? [];

  const disputesPending = timesheets?.filter((t) => t.disputed).length ?? 0;
  const payrollReady = timesheets?.filter((t) => t.status === "approved" && t.date?.startsWith(currentMonth)).length ?? 0;
  const pendingRequests = requests?.filter((r) => r.status === "pending").length ?? 0;

  // ── Employee / Supervisor stats ────────────────────────────────────────────
  const myTimesheets = timesheets?.filter((t) => t.eid === user.userId) ?? [];
  const myMonthTs = myTimesheets.filter((t) => t.date?.startsWith(currentMonth));
  const myRegHours = myMonthTs.filter((t) => t.status === "approved").reduce((s, t) => s + (t.reg ?? 0), 0);
  const myOtHours = myMonthTs.filter((t) => t.status === "approved").reduce((s, t) => s + (t.ot ?? 0), 0);
  const myPending = myTimesheets.filter((t) => t.status === "pending_employee" && !!t.co);

  // For supervisor: count officers needing sign-off
  const officersNeedingSignoff = isSupervisor
    ? (timesheets ?? []).filter((ts) => {
        const emp = users?.find((u) => u.userId === ts.eid);
        return ts.status === "pending_first_approval" && emp?.fa === user.pos && !ts.f2Sig;
      }).length
    : 0;

  const handleApprove = async (ts: Timesheet) => {
    setSigModal({ ts, role: "approver" });
    setSigName(user.name);
  };

  const handleReject = (ts: Timesheet) => setRejectModal(ts);

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
      setSigModal(null);
      setSigName("");
    } catch {
      toast({ title: "Failed to approve", variant: "destructive" });
    }
  };

  const submitRejection = async () => {
    if (!rejectModal) return;
    try {
      await updateTimesheet({ id: rejectModal.id, status: "rejected" });
      toast({ title: "Timesheet rejected" });
      setRejectModal(null);
    } catch {
      toast({ title: "Failed to reject", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Welcome */}
        <div className="bg-primary rounded-md p-6 text-primary-foreground">
          <h2 className="text-2xl font-bold mb-0.5">Welcome, {user.name}</h2>
          <p className="text-primary-foreground/80 text-sm">
            {isFullAccess
              ? "Full Access — Administration & Team Management"
              : `${user.pos} — ${user.dept}`}
          </p>
          <p className="text-primary-foreground/60 text-xs mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>

        {/* ══ SHIFT SUPERVISOR LAYOUT ══════════════════════════════════════ */}
        {isSupervisor && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setSupTab("my-shift")}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  supTab === "my-shift"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-my-shift"
              >
                <Clock className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                My Shift
              </button>
              <button
                onClick={() => setSupTab("active-officers")}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  supTab === "active-officers"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-active-officers"
              >
                <UserCheck className="w-4 h-4" />
                Active Officers
                {officersNeedingSignoff > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {officersNeedingSignoff}
                  </span>
                )}
              </button>
            </div>

            {/* My Shift Tab */}
            {supTab === "my-shift" && (
              <div className="space-y-5">
                <ClockInOut />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={Clock} label="Regular Hours (MTD)" value={`${myRegHours.toFixed(1)}h`} />
                  <StatCard icon={TrendingUp} label="Overtime (MTD)" value={`${myOtHours.toFixed(1)}h`} />
                  <StatCard icon={FileText} label="Timesheets (MTD)" value={myMonthTs.length} />
                  <StatCard
                    icon={AlertTriangle}
                    label="My Pending Signature"
                    value={myPending.length}
                    color={myPending.length > 0 ? "text-amber-600" : undefined}
                  />
                </div>
                {myPending.length > 0 && (
                  <Card className="p-5">
                    <h3 className="font-semibold text-sm mb-3">Timesheets Awaiting Your Signature</h3>
                    <div className="space-y-2">
                      {myPending.map((ts) => (
                        <div key={ts.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`pending-ts-${ts.id}`}>
                          <div>
                            <span className="font-medium text-sm">{ts.date}</span>
                            <span className="text-muted-foreground text-xs ml-3">{ts.ci} → {ts.co}</span>
                          </div>
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">Sign Required</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Active Officers Tab */}
            {supTab === "active-officers" && <ActiveOfficers />}
          </>
        )}

        {/* ══ REGULAR EMPLOYEE LAYOUT (Stage 1) ═══════════════════════════ */}
        {user.role === "employee" && !isSupervisor && (
          <>
            <ClockInOut />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Clock} label="Regular Hours (MTD)" value={`${myRegHours.toFixed(1)}h`} />
              <StatCard icon={TrendingUp} label="Overtime (MTD)" value={`${myOtHours.toFixed(1)}h`} />
              <StatCard icon={FileText} label="Timesheets (MTD)" value={myMonthTs.length} />
              <StatCard
                icon={AlertTriangle}
                label="Awaiting My Signature"
                value={myPending.length}
                color={myPending.length > 0 ? "text-amber-600" : undefined}
              />
            </div>
            {myPending.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-3">Timesheets Awaiting Your Signature</h3>
                <div className="space-y-2">
                  {myPending.map((ts) => (
                    <div key={ts.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`pending-ts-${ts.id}`}>
                      <div>
                        <span className="font-medium text-sm">{ts.date}</span>
                        <span className="text-muted-foreground text-xs ml-3">{ts.ci} → {ts.co}</span>
                      </div>
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">Sign Required</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ══ FULL ACCESS LAYOUT (Admin + Manager) ════════════════════════ */}
        {isFullAccess && (
          <>
            {/* Own clock in/out — all personnel can clock regardless of role */}
            <ClockInOut />

            {/* Personal timesheets awaiting own signature */}
            {myPending.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-3">Your Timesheets Awaiting Signature</h3>
                <div className="space-y-2">
                  {myPending.map((ts) => (
                    <div key={ts.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`pending-ts-${ts.id}`}>
                      <div>
                        <span className="font-medium text-sm">{ts.date}</span>
                        <span className="text-muted-foreground text-xs ml-3">{ts.ci} → {ts.co}</span>
                      </div>
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">Sign Required</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard icon={Users} label="Active Employees" value={totalEmployees} />
              <StatCard icon={Clock} label="Clocked In Today" value={clockedInToday} color="text-green-600" />
              <StatCard icon={AlertTriangle} label="Pending Approvals" value={pendingApprovals.length} color={pendingApprovals.length > 0 ? "text-amber-600" : undefined} />
              <StatCard icon={CheckCircle2} label="Approved (MTD)" value={payrollReady} />
              <StatCard icon={Calendar} label="Open Requests" value={pendingRequests} />
              <StatCard icon={BarChart2} label="Disputes Pending" value={disputesPending} color={disputesPending > 0 ? "text-red-500" : undefined} />
            </div>

            {/* ── Live Personnel Board ──────────────────────────────── */}
            <LivePersonnelBoard timesheets={timesheets ?? []} users={users ?? []} today={today} />

            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Pending Approvals Queue</h3>
                <Badge variant="secondary">{pendingApprovals.length} item{pendingApprovals.length !== 1 ? "s" : ""}</Badge>
              </div>
              {pendingApprovals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-md">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All clear — no approvals waiting.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingApprovals.map((ts) => {
                    const emp = users?.find((u) => u.userId === ts.eid);
                    return (
                      <div key={ts.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-border rounded-md" data-testid={`approval-row-${ts.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {emp?.av ?? ts.eid.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{emp?.name ?? ts.eid}</p>
                            <p className="text-xs text-muted-foreground">{ts.date} · {ts.ci} – {ts.co ?? "?"} · {ts.reg}h reg{(ts.ot ?? 0) > 0 ? ` + ${ts.ot}h OT` : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded border ${statusColor(ts.status)}`}>{statusLabel(ts.status)}</span>
                          {ts.disputed && <span className="text-xs px-2 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-200">Disputed</span>}
                          <Button size="sm" onClick={() => handleApprove(ts)} data-testid={`button-approve-${ts.id}`}>
                            <PenLine className="w-3.5 h-3.5 mr-1.5" /> Sign
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleReject(ts)} data-testid={`button-reject-${ts.id}`}>
                            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Approval Signature Modal */}
      <Dialog open={!!sigModal} onOpenChange={() => setSigModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Electronic Signature — Approval</DialogTitle>
          </DialogHeader>
          {sigModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> <strong>{users?.find((u) => u.userId === sigModal.ts.eid)?.name ?? sigModal.ts.eid}</strong></p>
                <p><span className="text-muted-foreground">Date:</span> <strong>{sigModal.ts.date}</strong></p>
                <p><span className="text-muted-foreground">Hours:</span> <strong>{sigModal.ts.reg}h regular + {sigModal.ts.ot}h OT</strong></p>
                <p><span className="text-muted-foreground">Stage:</span> <strong>{sigModal.ts.status === "pending_first_approval" ? "1st Approver Signature" : "2nd Approver Signature"}</strong></p>
              </div>
              <div className="space-y-1.5">
                <Label>Your Full Name (typed signature)</Label>
                <Input value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Type your full name" data-testid="input-sig-name" />
              </div>
              <p className="text-xs text-muted-foreground">By typing your name, you are applying a legally binding electronic signature. Timestamp and source will be recorded.</p>
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

      {/* Rejection Modal */}
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

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <Card className="p-4" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground font-medium leading-tight">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color ?? "text-foreground"}`}>{value}</p>
        </div>
        <div className="p-2 rounded-md bg-primary/10 shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
    </Card>
  );
}

function elapsedStr(ci: string): string {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const start = parse(`${today} ${ci}`, "yyyy-MM-dd HH:mm", new Date());
  const mins = Math.max(0, differenceInMinutes(now, start));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function LivePersonnelBoard({
  timesheets,
  users,
  today,
}: {
  timesheets: Timesheet[];
  users: any[];
  today: string;
}) {
  const [locFilter, setLocFilter] = useState("ALL");
  const [, setTick] = useState(0);

  // Refresh elapsed times every 60 seconds
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // All active (clocked in, not yet out) across every zone for today
  const active = timesheets.filter((ts) => ts.date === today && ts.ci && !ts.co);

  // Unique zones among active records — sorted alphabetically
  const zones = Array.from(new Set(active.map((ts) => ts.zone ?? "Unknown"))).sort();

  const displayed = locFilter === "ALL" ? active : active.filter((ts) => (ts.zone ?? "Unknown") === locFilter);

  // Group displayed by zone for the "All" view
  const grouped: Record<string, Timesheet[]> = {};
  for (const ts of displayed) {
    const z = ts.zone ?? "Unknown";
    if (!grouped[z]) grouped[z] = [];
    grouped[z].push(ts);
  }

  const empName = (eid: string) => users.find((u) => u.userId === eid)?.name ?? eid;
  const empPos = (eid: string) => users.find((u) => u.userId === eid)?.pos ?? "";
  const empAv = (eid: string) => {
    const av = users.find((u) => u.userId === eid)?.av;
    return av ?? eid.slice(0, 2).toUpperCase();
  };

  return (
    <Card className="p-5" data-testid="live-personnel-board">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <h3 className="font-semibold">Live Personnel</h3>
          <Badge variant="secondary" className="text-xs">{active.length} on duty</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Radio className="w-3 h-3" />
          <span>Updates every 60s</span>
        </div>
      </div>

      {/* Location filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setLocFilter("ALL")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            locFilter === "ALL"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          }`}
          data-testid="filter-all-locations"
        >
          All Locations
          <span className="ml-1.5 bg-white/20 rounded px-1">{active.length}</span>
        </button>
        {zones.map((z) => {
          const cnt = active.filter((ts) => (ts.zone ?? "Unknown") === z).length;
          return (
            <button
              key={z}
              onClick={() => setLocFilter(z)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                locFilter === z
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
              data-testid={`filter-location-${z}`}
            >
              <MapPin className="inline w-3 h-3 mr-1 -mt-0.5" />
              {z}
              <span className={`ml-1.5 rounded px-1 ${locFilter === z ? "bg-white/20" : "bg-muted"}`}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {active.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-md text-muted-foreground">
          <Timer className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No one is currently clocked in.</p>
        </div>
      )}

      {/* Cards */}
      {active.length > 0 && (
        locFilter === "ALL" ? (
          // Grouped by zone
          <div className="space-y-5">
            {Object.entries(grouped).map(([zone, records]) => (
              <div key={zone}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">{zone}</span>
                  <span className="text-xs text-muted-foreground">— {records.length} on duty</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {records.map((ts) => (
                    <PersonnelCard key={ts.id} ts={ts} name={empName(ts.eid)} pos={empPos(ts.eid)} av={empAv(ts.eid)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Single zone flat list
          displayed.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
              No one clocked in at {locFilter} right now.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {displayed.map((ts) => (
                <PersonnelCard key={ts.id} ts={ts} name={empName(ts.eid)} pos={empPos(ts.eid)} av={empAv(ts.eid)} />
              ))}
            </div>
          )
        )
      )}
    </Card>
  );
}

function PersonnelCard({ ts, name, pos, av }: { ts: Timesheet; name: string; pos: string; av: string }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
      data-testid={`personnel-card-${ts.id}`}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-700 dark:text-green-300 font-bold text-sm shrink-0">
        {av}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight truncate">{name}</p>
        {pos && <p className="text-xs text-muted-foreground truncate">{pos}</p>}

        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {/* Zone */}
          {ts.zone && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <MapPin className="w-3 h-3" /> {ts.zone}
            </span>
          )}
          {/* Post */}
          {ts.post && (
            <span className="text-xs font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
              {ts.post}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <Clock className="w-3 h-3" /> In: <strong className="ml-0.5 text-foreground">{ts.ci}</strong>
          </span>
          <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-0.5">
            <Timer className="w-3 h-3" /> {elapsedStr(ts.ci!)}
          </span>
        </div>
      </div>

      {/* Live indicator */}
      <span className="relative flex h-2 w-2 mt-1 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
    </div>
  );
}
