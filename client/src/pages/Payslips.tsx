import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileText, ChevronRight, FileDown, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { formatGYD, PAYROLL_CONSTANTS } from "@/lib/payroll";
import { downloadPayslipPDF } from "@/lib/payslip-pdf";
import type { PayrollResult } from "@/lib/payroll";
import type { Payslip } from "@shared/schema";

const C = PAYROLL_CONSTANTS;

function PayslipLandscape({ r, tin, nisNumber }: { r: PayrollResult; tin?: string | null; nisNumber?: string | null }) {
  if (!r?.employee) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">This payslip could not be loaded — the data is invalid. Please ask your administrator to re-send it.</p>
      </div>
    );
  }

  const pc  = r.employee.payConfig;
  const freq = pc?.frequency ?? "bimonthly";
  const ppm  = freq === "weekly" ? 52/12 : freq === "biweekly" ? 26/12 : freq === "monthly" ? 1 : 2;
  const freqLabel = freq === "weekly" ? "Weekly" : freq === "biweekly" ? "Bi-Weekly" : freq === "monthly" ? "Monthly" : "Bi-Monthly";

  const incomeItems: Array<{label: string; amount: number; sub?: string}> = [];
  incomeItems.push({ label: "Basic Salary", amount: r.basicPay, sub: `${r.regularHours.toFixed(2)} h × ${formatGYD(r.effectiveRate)}/hr` });
  if (r.otPay  > 0) incomeItems.push({ label: `Overtime (${pc?.otMultiplier ?? 1.5}×)`,    amount: r.otPay });
  if (r.phPay  > 0) incomeItems.push({ label: `Public Holiday (${pc?.phMultiplier ?? 2}×)`, amount: r.phPay });
  if ((pc?.housingAllowance   ?? 0) > 0) incomeItems.push({ label: "Housing Allowance",   amount: (pc!.housingAllowance)   / ppm });
  if ((pc?.transportAllowance ?? 0) > 0) incomeItems.push({ label: "Transport Allowance", amount: (pc!.transportAllowance) / ppm });
  if ((pc?.mealAllowance      ?? 0) > 0) incomeItems.push({ label: "Meal Allowance",      amount: (pc!.mealAllowance)      / ppm });
  if ((pc?.uniformAllowance   ?? 0) > 0) incomeItems.push({ label: "Uniform Allowance",   amount: (pc!.uniformAllowance)   / ppm });
  if ((pc?.riskAllowance      ?? 0) > 0) incomeItems.push({ label: "Risk Allowance",      amount: (pc!.riskAllowance)      / ppm });
  if ((pc?.shiftAllowance     ?? 0) > 0) incomeItems.push({ label: "Shift Allowance",     amount: (pc!.shiftAllowance)     / ppm });
  (pc?.otherAllowances ?? []).forEach((a) => incomeItems.push({ label: a.name, amount: a.amount / ppm }));

  const freeItems: Array<{label: string; amount: number}> = [];
  freeItems.push({ label: "Statutory Free Pay", amount: r.personalAllowance });
  if (r.qualifyingChildren > 0) freeItems.push({ label: `Child Tax Credit (${r.qualifyingChildren})`, amount: r.childAllowance });
  if (!pc?.nisExempt)             freeItems.push({ label: `Emp. NIS (${(C.NIS_EMP_RATE*100).toFixed(1)}%)`, amount: r.employeeNIS });
  if (!pc?.healthSurchargeExempt) freeItems.push({ label: "Health Surcharge",    amount: r.healthSurcharge });

  const dedItems: Array<{label: string; amount: number}> = [];
  if (!pc?.taxExempt)        dedItems.push({ label: `PAYE${r.chargeableIncome > C.TAX_LOWER_LIMIT/ppm ? " (25%/35%)" : " (25%)"}`, amount: r.paye });
  if (r.creditUnion      > 0) dedItems.push({ label: "Credit Union",      amount: r.creditUnion });
  if (r.loanRepayment    > 0) dedItems.push({ label: "Loan Repayment",    amount: r.loanRepayment });
  if (r.advancesRecovery > 0) dedItems.push({ label: "Advances Recovery", amount: r.advancesRecovery });
  if (r.unionDues        > 0) dedItems.push({ label: "Union Dues",        amount: r.unionDues });
  (pc?.otherDeductions ?? []).forEach((d) => dedItems.push({ label: d.name, amount: d.amount }));

  const totalFreePay = r.personalAllowance + r.childAllowance + r.employeeNIS + r.healthSurcharge;
  const totalDeduct  = r.paye + r.totalVoluntary;
  const maxRows = Math.max(incomeItems.length, freeItems.length, dedItems.length);

  return (
    <div className="text-xs">
      <div className="text-center py-3 border-b border-border">
        <p className="font-bold text-sm text-foreground tracking-wide">FACILITY MANAGEMENT SERVICES (GUYANA) INC.</p>
        <p className="text-muted-foreground text-xs">{r.employee.dept} — {r.employee.pos}</p>
      </div>

      <div className="flex justify-between items-center px-2 py-2 border-b border-border bg-muted/20 text-xs">
        <div className="space-y-0.5">
          <p><span className="font-semibold">ID:</span> {r.employee.userId}&emsp;<span className="font-semibold">Name:</span> {r.employee.name}</p>
          <p className="text-muted-foreground">D.O.E: {r.employee.joined ?? "N/A"} · {r.approvedTimesheets} approved timesheet{r.approvedTimesheets !== 1 ? "s" : ""} · {formatGYD(r.effectiveRate)}/hr</p>
          {(tin || nisNumber) && (
            <p className="text-muted-foreground">
              {tin && <span className="mr-3"><span className="font-semibold text-foreground">TIN:</span> {tin}</span>}
              {nisNumber && <span><span className="font-semibold text-foreground">NIS#:</span> {nisNumber}</span>}
            </p>
          )}
        </div>
        <div className="text-right space-y-0.5">
          <p><span className="font-semibold">{freqLabel} Work Period:</span> {r.periodStart} to {r.periodEnd}</p>
          <p className="text-muted-foreground">Pay Period: {r.periodStart} – {r.periodEnd}</p>
        </div>
      </div>

      <table className="w-full border-collapse mt-1" style={{ fontSize: "11px" }}>
        <thead>
          <tr>
            <th colSpan={2} className="bg-blue-700 text-white text-center py-1 px-2 border border-border">Income</th>
            <th colSpan={2} className="bg-emerald-700 text-white text-center py-1 px-2 border border-border">FreePay</th>
            <th colSpan={2} className="bg-red-700 text-white text-center py-1 px-2 border border-border">Deductions</th>
          </tr>
          <tr className="bg-muted/50 text-muted-foreground text-[10px]">
            <th className="text-left py-0.5 px-2 border border-border font-medium">Description</th>
            <th className="text-right py-0.5 px-2 border border-border font-medium">Amount (GYD)</th>
            <th className="text-left py-0.5 px-2 border border-border font-medium">Description</th>
            <th className="text-right py-0.5 px-2 border border-border font-medium">Amount (GYD)</th>
            <th className="text-left py-0.5 px-2 border border-border font-medium">Description</th>
            <th className="text-right py-0.5 px-2 border border-border font-medium">Amount (GYD)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }, (_, i) => {
            const inc = incomeItems[i];
            const fp  = freeItems[i];
            const ded = dedItems[i];
            return (
              <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="py-0.5 px-2 border border-border">
                  {inc?.label ?? ""}
                  {inc?.sub && <span className="text-muted-foreground ml-1">({inc.sub})</span>}
                </td>
                <td className="py-0.5 px-2 border border-border text-right font-mono">{inc ? formatGYD(inc.amount) : ""}</td>
                <td className="py-0.5 px-2 border border-border">{fp?.label ?? ""}</td>
                <td className="py-0.5 px-2 border border-border text-right font-mono">{fp ? formatGYD(fp.amount) : ""}</td>
                <td className="py-0.5 px-2 border border-border">{ded?.label ?? ""}</td>
                <td className="py-0.5 px-2 border border-border text-right font-mono text-red-600">{ded ? formatGYD(ded.amount) : ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-yellow-50 dark:bg-yellow-900/20 font-semibold">
            <td className="py-1 px-2 border border-border">Gross</td>
            <td className="py-1 px-2 border border-border text-right font-mono">{formatGYD(r.grossPay)}</td>
            <td className="py-1 px-2 border border-border">Total FreePay</td>
            <td className="py-1 px-2 border border-border text-right font-mono">{formatGYD(totalFreePay)}</td>
            <td className="py-1 px-2 border border-border">Total Deduction</td>
            <td className="py-1 px-2 border border-border text-right font-mono text-red-600">{formatGYD(totalDeduct)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex justify-between items-center bg-green-600 text-white rounded-sm px-4 py-2 mt-1">
        <span className="font-bold text-sm">Net Pay</span>
        <span className="font-bold text-xl font-mono">{formatGYD(r.netPay)}</span>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="bg-muted/20 rounded p-2 space-y-0.5 text-[10px]">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">PAYE Computation</p>
          <div className="flex justify-between"><span>Gross Pay</span><span className="font-mono">{formatGYD(r.grossPay)}</span></div>
          <div className="flex justify-between text-red-600"><span>Less: Employee NIS</span><span className="font-mono">− {formatGYD(r.employeeNIS)}</span></div>
          <div className="flex justify-between text-red-600"><span>Less: Insurance</span><span className="font-mono">− {formatGYD(r.healthSurcharge)}</span></div>
          <div className="flex justify-between text-red-600"><span>Less: Personal Allowance</span><span className="font-mono">− {formatGYD(r.personalAllowance)}</span></div>
          {r.qualifyingChildren > 0 && (
            <div className="flex justify-between text-red-600"><span>Less: Child Allowance</span><span className="font-mono">− {formatGYD(r.childAllowance)}</span></div>
          )}
          <div className="flex justify-between font-semibold border-t border-border pt-0.5">
            <span>Chargeable Income</span><span className="font-mono">{formatGYD(r.chargeableIncome)}</span>
          </div>
          <div className="flex justify-between font-semibold text-red-600">
            <span>PAYE</span><span className="font-mono">− {formatGYD(r.paye)}</span>
          </div>
        </div>
        <div className="bg-muted/20 rounded p-2 text-[10px] space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Employer NIS (Not deducted from employee)</p>
          <div className="flex justify-between">
            <span>Employer NIS ({(C.NIS_ER_RATE*100).toFixed(1)}%)</span>
            <span className="font-mono">{formatGYD(r.employerNIS)}</span>
          </div>
          <p className="text-muted-foreground mt-1 italic">
            National Insurance values shown under FreePay will be remitted to the National Insurance Scheme.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Payslips() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Payslip | null>(null);

  const { data: payslips = [], isLoading } = useQuery<Payslip[]>({
    queryKey: ["/api/payslips", user.userId],
    queryFn: () => fetch(`/api/payslips?eid=${user.userId}`).then((r) => r.json()),
  });

  const { mutate: markSeen } = useMutation({
    mutationFn: (id: number) => apiRequest("PUT", `/api/payslips/${id}/seen`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/payslips", user.userId] }),
  });

  function open(p: Payslip) {
    setSelected(p);
    if (!p.seen) markSeen(p.id);
  }

  const unread = payslips.filter((p) => !p.seen).length;

  function safeNetPay(data: unknown): string {
    try {
      const r = data as PayrollResult;
      if (typeof r?.netPay === "number") return formatGYD(r.netPay);
    } catch {}
    return "N/A";
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Payslips
            {unread > 0 && (
              <Badge className="bg-red-500 text-white text-xs" data-testid="badge-unread-payslips">
                {unread} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Payslips issued to you by FMS Administration
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payslips.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-muted-foreground">No payslips yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Payslips will appear here once issued by your administrator.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {payslips.map((p) => (
            <Card
              key={p.id}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${!p.seen ? "border-primary/40 bg-primary/5" : ""}`}
              onClick={() => open(p)}
              data-testid={`payslip-card-${p.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${!p.seen ? "bg-primary" : "bg-transparent"}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight">{p.period}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Issued {format(new Date(p.sentAt), "d MMM yyyy, h:mm a")} · Net Pay:{" "}
                    <span className="font-semibold text-green-600">{safeNetPay(p.data)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!p.seen && <Badge variant="default" className="text-xs">New</Badge>}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto" aria-describedby="payslip-desc">
          <DialogTitle className="sr-only">Payslip — {selected?.period}</DialogTitle>
          <p id="payslip-desc" className="sr-only">Payslip detail view</p>
          {selected && (
            <>
              <div className="text-base font-bold mb-2 text-foreground">
                Payslip — {selected.period}
              </div>
              <PayslipLandscape
                r={selected.data as unknown as PayrollResult}
                tin={(user as any).tin}
                nisNumber={(user as any).nisNumber}
              />
              <div className="flex gap-2 justify-end pt-3 flex-wrap">
                {(selected.data as unknown as PayrollResult)?.employee && (
                  <Button variant="outline" size="sm"
                    onClick={() => {
                      const r = selected.data as unknown as PayrollResult;
                      downloadPayslipPDF({
                        ...r,
                        employee: {
                          ...r.employee,
                          tin: (user as any).tin ?? (r.employee as any).tin,
                          nisNumber: (user as any).nisNumber ?? (r.employee as any).nisNumber,
                          bankName: (user as any).bankName ?? (r.employee as any).bankName,
                          bankBranch: (user as any).bankBranch ?? (r.employee as any).bankBranch,
                          bankAccountNumber: (user as any).bankAccountNumber ?? (r.employee as any).bankAccountNumber,
                        } as any,
                      });
                    }}
                    data-testid="button-download-pdf"
                  >
                    <FileDown className="w-4 h-4 mr-1.5" /> Download PDF
                  </Button>
                )}
                <Button size="sm" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
