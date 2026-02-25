import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useUsers } from "@/hooks/use-users";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, TrendingUp, Users, DollarSign, Building2 } from "lucide-react";
import { calcPayroll, formatGYD, generateQuickBooksCSV, downloadCSV, PAYROLL_CONSTANTS } from "@/lib/payroll";
import { format, subMonths } from "date-fns";
import type { PayrollResult } from "@/lib/payroll";

const C = PAYROLL_CONSTANTS;

export default function Payroll() {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { data: timesheets } = useTimesheets();

  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [selectedResult, setSelectedResult] = useState<PayrollResult | null>(null);

  if (user?.role === "employee") return <Redirect to="/" />;

  const activeEmployees = (users ?? []).filter((u) => u.status === "active" && u.role !== "admin");
  const results = activeEmployees.map((emp) => calcPayroll(emp, timesheets ?? [], period));

  const totals = results.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossPay,
      nis: acc.nis + r.employeeNIS,
      paye: acc.paye + r.paye,
      net: acc.net + r.netPay,
      employerNIS: acc.employerNIS + r.employerNIS,
    }),
    { gross: 0, nis: 0, paye: 0, net: 0, employerNIS: 0 }
  );

  const handleExport = () => {
    const csv = generateQuickBooksCSV(results);
    downloadCSV(csv, `FMS_Payroll_${period}.csv`);
  };

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Guyana 2026 compliant payroll calculations</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            data-testid="select-payroll-period"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Button onClick={handleExport} data-testid="button-export-quickbooks">
            <Download className="w-4 h-4 mr-2" /> QuickBooks CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Gross</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-total-gross">{formatGYD(totals.gross)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Net Pay</span>
          </div>
          <p className="text-xl font-bold text-green-600" data-testid="stat-total-net">{formatGYD(totals.net)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">NIS Deductions</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-total-nis">{formatGYD(totals.nis)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Employer NIS</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-employer-nis">{formatGYD(totals.employerNIS)}</p>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3 text-right">Hours (Reg + OT)</th>
                <th className="px-5 py-3 text-right">Gross Pay</th>
                <th className="px-5 py-3 text-right">NIS (Emp)</th>
                <th className="px-5 py-3 text-right">PAYE</th>
                <th className="px-5 py-3 text-right">Net Pay</th>
                <th className="px-5 py-3 text-center">Timesheets</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((r) => (
                <tr key={r.employee.id} className="hover:bg-muted/20 transition-colors" data-testid={`payroll-row-${r.employee.userId}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {r.employee.av}
                      </div>
                      <div>
                        <p className="font-semibold leading-tight">{r.employee.name}</p>
                        <p className="text-xs text-muted-foreground">{r.employee.pos}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant="outline" className="text-xs">{r.employee.cat}</Badge>
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm">
                    {r.regularHours.toFixed(1)} + <span className="text-amber-600">{r.otHours.toFixed(1)}</span>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">{formatGYD(r.grossPay)}</td>
                  <td className="px-5 py-4 text-right text-muted-foreground">{formatGYD(r.employeeNIS)}</td>
                  <td className="px-5 py-4 text-right text-muted-foreground">{formatGYD(r.paye)}</td>
                  <td className="px-5 py-4 text-right font-bold text-green-600">{formatGYD(r.netPay)}</td>
                  <td className="px-5 py-4 text-center">
                    <Badge variant={r.approvedTimesheets > 0 ? "default" : "secondary"} className="text-xs">
                      {r.approvedTimesheets}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedResult(r)} data-testid={`button-payslip-${r.employee.userId}`}>
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/20 border-t border-border font-semibold">
              <tr>
                <td className="px-5 py-3" colSpan={3}>Totals</td>
                <td className="px-5 py-3 text-right">{formatGYD(totals.gross)}</td>
                <td className="px-5 py-3 text-right">{formatGYD(totals.nis)}</td>
                <td className="px-5 py-3 text-right">{formatGYD(totals.paye)}</td>
                <td className="px-5 py-3 text-right text-green-600">{formatGYD(totals.net)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Tax Info */}
      <Card className="p-5 mt-4">
        <h3 className="font-semibold text-sm mb-3">Guyana 2026 Payroll Rules Applied</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Employee NIS Rate</p>
            <p className="font-semibold">{(C.NIS_EMP_RATE * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Employer NIS Rate</p>
            <p className="font-semibold">{(C.NIS_ER_RATE * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">NIS Earnings Ceiling</p>
            <p className="font-semibold">{formatGYD(C.NIS_CEILING_MONTHLY)}/mo</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Personal Allowance</p>
            <p className="font-semibold">{formatGYD(C.PERSONAL_ALLOWANCE)}/mo</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">PAYE Rate</p>
            <p className="font-semibold">{(C.PAYE_RATE * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Overtime Multiplier</p>
            <p className="font-semibold">{C.OT_MULTIPLIER}x</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Working Hours/Month</p>
            <p className="font-semibold">{C.WORKING_HOURS_PER_MONTH}h</p>
          </div>
        </div>
      </Card>

      {/* Payslip Modal */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payslip — {selectedResult?.period}</DialogTitle>
          </DialogHeader>
          {selectedResult && (
            <div className="space-y-4 mt-2" data-testid="payslip-modal">
              <div className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-md">
                <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center font-bold text-lg">
                  {selectedResult.employee.av}
                </div>
                <div>
                  <p className="font-bold text-lg leading-tight">{selectedResult.employee.name}</p>
                  <p className="text-primary-foreground/80 text-sm">{selectedResult.employee.pos} · {selectedResult.employee.dept}</p>
                  <p className="text-primary-foreground/60 text-xs font-mono">{selectedResult.employee.userId}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Pay Period</span>
                  <span className="font-medium">{selectedResult.period}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Regular Hours</span>
                  <span>{selectedResult.regularHours.toFixed(2)}h</span>
                </div>
                {selectedResult.otHours > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overtime Hours (1.5x)</span>
                    <span className="text-amber-600">{selectedResult.otHours.toFixed(2)}h</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Regular Pay</span>
                  <span>{formatGYD(selectedResult.regularPay)}</span>
                </div>
                {selectedResult.otPay > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overtime Pay</span>
                    <span className="text-amber-600">{formatGYD(selectedResult.otPay)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-border pt-2">
                  <span>Gross Pay</span>
                  <span>{formatGYD(selectedResult.grossPay)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Employee NIS (5.6%)</span>
                  <span>- {formatGYD(selectedResult.employeeNIS)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>PAYE (28%)</span>
                  <span>- {formatGYD(selectedResult.paye)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t-2 border-border pt-3">
                  <span>Net Pay</span>
                  <span className="text-green-600">{formatGYD(selectedResult.netPay)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs border-t border-border pt-2">
                  <span>Employer NIS Contribution (8.4%)</span>
                  <span>{formatGYD(selectedResult.employerNIS)}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    const r = selectedResult;
                    const csv = generateQuickBooksCSV([r]);
                    downloadCSV(csv, `Payslip_${r.employee.userId}_${r.period}.csv`);
                  }}
                  data-testid="button-download-payslip"
                >
                  <Download className="w-4 h-4 mr-1.5" /> Download CSV
                </Button>
                <Button onClick={() => setSelectedResult(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
