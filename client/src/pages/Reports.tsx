import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useUsers } from "@/hooks/use-users";
import { useRequests } from "@/hooks/use-requests";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Clock, Users, AlertTriangle, FileText, TrendingUp, BarChart2 } from "lucide-react";
import { calcPayroll, formatGYD, downloadCSV } from "@/lib/payroll";
import { format, subMonths } from "date-fns";

type ReportTab = "time" | "attendance" | "overtime" | "payroll" | "audit";

export default function Reports() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { data: users } = useUsers();
  const { data: requests } = useRequests();
  const [tab, setTab] = useState<ReportTab>("time");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));

  if (user?.role === "employee") return <Redirect to="/" />;

  const allTs = timesheets ?? [];
  const allUsers = users ?? [];

  const periodTs = allTs.filter((t) => t.date?.startsWith(period));
  const activeEmps = allUsers.filter((u) => u.status === "active" && u.role !== "admin");

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });

  // ── Time Summary ─────────────────────────────────────────────────────────
  const timeSummary = activeEmps.map((emp) => {
    const empTs = periodTs.filter((t) => t.eid === emp.userId);
    const approved = empTs.filter((t) => t.status === "approved");
    return {
      emp,
      totalDays: empTs.length,
      approvedDays: approved.length,
      regHours: approved.reduce((s, t) => s + (t.reg ?? 0), 0),
      otHours: approved.reduce((s, t) => s + (t.ot ?? 0), 0),
      disputed: empTs.filter((t) => t.disputed).length,
    };
  });

  // ── OT Report ─────────────────────────────────────────────────────────────
  const otReport = periodTs.filter((t) => (t.ot ?? 0) > 0).map((t) => {
    const emp = allUsers.find((u) => u.userId === t.eid);
    return { ts: t, emp };
  }).sort((a, b) => (b.ts.ot ?? 0) - (a.ts.ot ?? 0));

  // ── Payroll Summary ────────────────────────────────────────────────────────
  const payrollResults = activeEmps.map((emp) => calcPayroll(emp, allTs, period));
  const payrollTotals = payrollResults.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossPay,
      nis: acc.nis + r.employeeNIS,
      paye: acc.paye + r.paye,
      net: acc.net + r.netPay,
      erNIS: acc.erNIS + r.employerNIS,
    }),
    { gross: 0, nis: 0, paye: 0, net: 0, erNIS: 0 }
  );

  // ── Audit Trail ───────────────────────────────────────────────────────────
  const auditTrail = allTs
    .filter((t) => t.eSig || t.f1Sig || t.f2Sig)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 50);

  const exportTimeSummary = () => {
    const headers = ["Employee", "ID", "Department", "Position", "Days Worked", "Approved Days", "Regular Hours", "OT Hours", "Disputes"];
    const rows = timeSummary.map((r) => [r.emp.name, r.emp.userId, r.emp.dept, r.emp.pos, r.totalDays, r.approvedDays, r.regHours.toFixed(2), r.otHours.toFixed(2), r.disputed]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    downloadCSV(csv, `FMS_TimeReport_${period}.csv`);
  };

  const exportPayrollCSV = () => {
    const headers = ["Employee", "ID", "Category", "Gross (GYD)", "NIS Emp (GYD)", "PAYE (GYD)", "Net (GYD)", "NIS Employer (GYD)"];
    const rows = payrollResults.map((r) => [r.employee.name, r.employee.userId, r.employee.cat, r.grossPay, r.employeeNIS, r.paye, r.netPay, r.employerNIS]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    downloadCSV(csv, `FMS_PayrollReport_${period}.csv`);
  };

  const tabs: { key: ReportTab; label: string; icon: any }[] = [
    { key: "time", label: "Time Summary", icon: Clock },
    { key: "attendance", label: "Attendance", icon: Users },
    { key: "overtime", label: "Overtime", icon: TrendingUp },
    { key: "payroll", label: "Payroll", icon: BarChart2 },
    { key: "audit", label: "Audit Trail", icon: FileText },
  ];

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Time, attendance, payroll, and audit reports</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            data-testid="select-report-period"
          >
            {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {tab === "time" && (
            <Button variant="outline" onClick={exportTimeSummary} data-testid="button-export-time">
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
          )}
          {tab === "payroll" && (
            <Button variant="outline" onClick={exportPayrollCSV} data-testid="button-export-payroll">
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-5 border-b border-border pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            data-testid={`tab-${key}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* TIME SUMMARY TAB */}
      {tab === "time" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3 text-center">Days Worked</th>
                  <th className="px-5 py-3 text-center">Approved</th>
                  <th className="px-5 py-3 text-right">Regular Hrs</th>
                  <th className="px-5 py-3 text-right">OT Hrs</th>
                  <th className="px-5 py-3 text-center">Disputes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {timeSummary.map(({ emp, totalDays, approvedDays, regHours, otHours, disputed }) => (
                  <tr key={emp.id} className="hover:bg-muted/20" data-testid={`time-row-${emp.userId}`}>
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-semibold">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.pos}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">{totalDays}</td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={approvedDays > 0 ? "default" : "secondary"} className="text-xs">{approvedDays}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{regHours.toFixed(1)}</td>
                    <td className="px-5 py-3 text-right font-mono text-amber-600">{otHours.toFixed(1)}</td>
                    <td className="px-5 py-3 text-center">
                      {disputed > 0 ? <Badge variant="destructive" className="text-xs">{disputed}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ATTENDANCE TAB */}
      {tab === "attendance" && (
        <div className="space-y-4">
          {activeEmps.map((emp) => {
            const empTs = periodTs.filter((t) => t.eid === emp.userId);
            const daysPercent = empTs.length > 0 ? (empTs.filter((t) => t.status === "approved").length / empTs.length) * 100 : 0;
            return (
              <Card key={emp.id} className="p-4" data-testid={`attendance-${emp.userId}`}>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{emp.av}</div>
                    <div>
                      <p className="font-semibold text-sm">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.pos}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{empTs.length} entries</span>
                    <span className="text-green-600 font-medium">{empTs.filter((t) => t.status === "approved").length} approved</span>
                    {empTs.filter((t) => t.status === "rejected").length > 0 && (
                      <span className="text-red-500">{empTs.filter((t) => t.status === "rejected").length} rejected</span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${daysPercent}%` }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* OVERTIME TAB */}
      {tab === "overtime" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">OT Hours</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {otReport.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No overtime recorded for this period.</td></tr>
                ) : otReport.map(({ ts, emp }) => (
                  <tr key={ts.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3">{emp?.name ?? ts.eid}</td>
                    <td className="px-5 py-3">{ts.date}</td>
                    <td className="px-5 py-3 text-right font-mono text-amber-600 font-semibold">{ts.ot?.toFixed(1)}h</td>
                    <td className="px-5 py-3">
                      <Badge variant={ts.status === "approved" ? "default" : "secondary"} className="text-xs">{ts.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* PAYROLL TAB */}
      {tab === "payroll" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Gross</p>
              <p className="text-lg font-bold">{formatGYD(payrollTotals.gross)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Net Pay</p>
              <p className="text-lg font-bold text-green-600">{formatGYD(payrollTotals.net)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">NIS (Employee)</p>
              <p className="text-lg font-bold">{formatGYD(payrollTotals.nis)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">PAYE Total</p>
              <p className="text-lg font-bold">{formatGYD(payrollTotals.paye)}</p>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Dept</th>
                    <th className="px-5 py-3 text-right">Gross</th>
                    <th className="px-5 py-3 text-right">NIS</th>
                    <th className="px-5 py-3 text-right">PAYE</th>
                    <th className="px-5 py-3 text-right">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payrollResults.map((r) => (
                    <tr key={r.employee.id} className="hover:bg-muted/20" data-testid={`payroll-report-${r.employee.userId}`}>
                      <td className="px-5 py-3 font-semibold">{r.employee.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.employee.dept}</td>
                      <td className="px-5 py-3 text-right">{formatGYD(r.grossPay)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatGYD(r.employeeNIS)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatGYD(r.paye)}</td>
                      <td className="px-5 py-3 text-right font-bold text-green-600">{formatGYD(r.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* AUDIT TRAIL TAB */}
      {tab === "audit" && (
        <div className="space-y-2">
          {auditTrail.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-border rounded-md">No audit records found.</div>
          ) : auditTrail.map((ts) => {
            const emp = allUsers.find((u) => u.userId === ts.eid);
            return (
              <Card key={ts.id} className="p-4" data-testid={`audit-row-${ts.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm">{emp?.name ?? ts.eid} — {ts.date}</p>
                    <p className="text-xs text-muted-foreground mt-1">{ts.ci} → {ts.co} · {ts.reg}h + {ts.ot}h OT</p>
                    {ts.eSig && <p className="text-xs text-muted-foreground mt-0.5">Employee: <strong>{ts.eSig.name}</strong> at {(ts.eSig as any).time}</p>}
                    {ts.f1Sig && <p className="text-xs text-muted-foreground mt-0.5">1st Approver: <strong>{(ts.f1Sig as any).name}</strong> at {(ts.f1Sig as any).time}</p>}
                    {ts.f2Sig && <p className="text-xs text-muted-foreground mt-0.5">2nd Approver: <strong>{(ts.f2Sig as any).name}</strong> at {(ts.f2Sig as any).time}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap shrink-0">
                    <Badge variant={ts.status === "approved" ? "default" : "secondary"} className="text-xs">{ts.status}</Badge>
                    {ts.disputed && <Badge variant="destructive" className="text-xs">Disputed</Badge>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
