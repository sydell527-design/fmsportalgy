import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, ChevronRight, Download, FileDown } from "lucide-react";
import { format } from "date-fns";
import { formatGYD, PAYROLL_CONSTANTS } from "@/lib/payroll";
import { downloadPayslipPDF } from "@/lib/payslip-pdf";
import type { PayrollResult } from "@/lib/payroll";
import type { Payslip } from "@shared/schema";

const C = PAYROLL_CONSTANTS;

function Row({ label, value, sub, red, bold, indent, muted }: {
  label: string; value: string; sub?: string;
  red?: boolean; bold?: boolean; indent?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex justify-between items-baseline ${indent ? "pl-4" : ""}`}>
      <span className={`${bold ? "font-semibold" : muted ? "text-muted-foreground text-xs" : "text-muted-foreground"} ${indent ? "text-xs" : "text-sm"}`}>
        {label}
        {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </span>
      <span className={`font-mono ${indent ? "text-xs" : "text-sm"} ${red ? "text-red-600 font-medium" : bold ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Divider({ label }: { label?: string }) {
  if (label) return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
  return <div className="h-px bg-border my-1" />;
}

function PayslipDetail({ r }: { r: PayrollResult }) {
  const pc = r.employee.payConfig;
  const freq = pc?.frequency ?? "bimonthly";
  const ppm  = freq === "weekly" ? 52 / 12 : 2;
  return (
    <div className="space-y-3 mt-1 text-sm">
      <div className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-md">
        <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center font-bold text-lg shrink-0">
          {r.employee.av}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight">{r.employee.name}</p>
          <p className="text-primary-foreground/80 text-sm">{r.employee.pos} · {r.employee.dept}</p>
          <p className="text-primary-foreground/60 text-xs font-mono">{r.employee.userId} · {r.period}</p>
        </div>
      </div>

      <div className="text-xs bg-muted/40 rounded px-3 py-2 text-muted-foreground">
        <span className="font-semibold text-foreground">Data source:</span> {r.approvedTimesheets} approved timesheet{r.approvedTimesheets !== 1 ? "s" : ""} ({r.periodStart} – {r.periodEnd}) · rate {formatGYD(r.effectiveRate)}/hr · {freq} pay frequency
      </div>

      <Divider label="Hours Worked" />
      <Row label="Regular Hours" value={`${r.regularHours.toFixed(2)} h`} />
      {r.otHours > 0 && <Row label={`Overtime (${pc?.otMultiplier ?? 1.5}×)`} value={`${r.otHours.toFixed(2)} h`} />}
      {r.phHours > 0 && <Row label={`Public Holiday (${pc?.phMultiplier ?? 2}×)`} value={`${r.phHours.toFixed(2)} h`} />}
      <Row label="Approved Timesheets" value={String(r.approvedTimesheets)} muted />

      <Divider label="Earnings" />
      <Row label="Basic Pay" sub={`${r.regularHours.toFixed(2)} h × GYD ${r.effectiveRate.toFixed(2)}/hr`} value={formatGYD(r.basicPay)} />
      {r.otPay > 0 && <Row label="Overtime Pay" sub={`${r.otHours.toFixed(2)} h × ${r.effectiveRate.toFixed(2)} × ${pc?.otMultiplier ?? 1.5}`} value={formatGYD(r.otPay)} />}
      {r.phPay > 0 && <Row label="Public Holiday Pay" sub={`${r.phHours.toFixed(2)} h × ${r.effectiveRate.toFixed(2)} × ${pc?.phMultiplier ?? 2}`} value={formatGYD(r.phPay)} />}
      {r.allowances > 0 && (
        <>
          <Row label="Allowances (period)" value={formatGYD(r.allowances)} />
          {(pc?.housingAllowance   ?? 0) > 0 && <Row label="Housing"   value={formatGYD((pc!.housingAllowance)   / ppm)} indent />}
          {(pc?.transportAllowance ?? 0) > 0 && <Row label="Transport" value={formatGYD((pc!.transportAllowance) / ppm)} indent />}
          {(pc?.mealAllowance      ?? 0) > 0 && <Row label="Meal"      value={formatGYD((pc!.mealAllowance)      / ppm)} indent />}
          {(pc?.uniformAllowance   ?? 0) > 0 && <Row label="Uniform"   value={formatGYD((pc!.uniformAllowance)   / ppm)} indent />}
          {(pc?.riskAllowance      ?? 0) > 0 && <Row label="Risk"      value={formatGYD((pc!.riskAllowance)      / ppm)} indent />}
          {(pc?.shiftAllowance     ?? 0) > 0 && <Row label="Shift"     value={formatGYD((pc!.shiftAllowance)     / ppm)} indent />}
          {(pc?.otherAllowances ?? []).map((a, i) => <Row key={i} label={a.name} value={formatGYD(a.amount / ppm)} indent />)}
        </>
      )}
      <div className="flex justify-between font-semibold bg-muted/40 rounded px-3 py-1.5 mt-1">
        <span>Gross Pay</span>
        <span className="font-mono">{formatGYD(r.grossPay)}</span>
      </div>

      <Divider label="Statutory Deductions" />
      <Row
        label={`Employee NIS ${pc?.nisExempt ? "(EXEMPT)" : `(${(C.NIS_EMP_RATE * 100).toFixed(1)}%)`}`}
        sub={pc?.nisExempt ? undefined : `ceiling ${formatGYD(C.NIS_CEILING_MONTHLY)}/mo`}
        value={pc?.nisExempt ? "GYD 0" : `− ${formatGYD(r.employeeNIS)}`}
        red={!pc?.nisExempt}
      />
      <Row
        label={`Hand In Hand Insurance${pc?.healthSurchargeExempt ? " (EXEMPT)" : pc?.healthSurchargeRate === "custom" ? " (custom)" : pc?.healthSurchargeRate === "half" ? " (half/casual)" : ""}`}
        value={pc?.healthSurchargeExempt ? "GYD 0" : `− ${formatGYD(r.healthSurcharge)}`}
        red={!pc?.healthSurchargeExempt}
      />

      <div className="bg-muted/20 rounded p-2.5 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PAYE Computation</p>
        <Row label="Gross Pay" value={formatGYD(r.grossPay)} indent />
        <Row label="Less: Employee NIS" value={`− ${formatGYD(r.employeeNIS)}`} indent red />
        <Row label="Less: Insurance" value={`− ${formatGYD(r.healthSurcharge)}`} indent red />
        <Row
          label={`Less: Personal Allowance${r.personalAllowance * ppm > C.PERSONAL_ALLOWANCE ? " (⅓ gross)" : ""}`}
          sub={`max(${formatGYD(C.PERSONAL_ALLOWANCE)}/mo, ⅓ gross) ÷ ${ppm}`}
          value={`− ${formatGYD(r.personalAllowance)}`}
          indent
        />
        {r.qualifyingChildren > 0 && (
          <Row label={`Less: Child Allowance (${r.qualifyingChildren} child${r.qualifyingChildren > 1 ? "ren" : ""})`}
               value={`− ${formatGYD(r.childAllowance)}`} indent />
        )}
        <div className="border-t border-border/60 pt-1 mt-1">
          <Row label="Chargeable Income" value={formatGYD(r.chargeableIncome)} bold />
        </div>
        <Row
          label={`PAYE ${pc?.taxExempt ? "(EXEMPT)" : r.chargeableIncome > C.TAX_LOWER_LIMIT / ppm ? `(${(C.TAX_LOWER_RATE*100).toFixed(0)}%/${(C.TAX_UPPER_RATE*100).toFixed(0)}%)` : `(${(C.TAX_LOWER_RATE*100).toFixed(0)}%)`}`}
          value={pc?.taxExempt ? "GYD 0" : `− ${formatGYD(r.paye)}`}
          bold red={!pc?.taxExempt}
          indent
        />
      </div>

      {r.totalVoluntary > 0 && (
        <>
          <Divider label="Voluntary Deductions" />
          {r.creditUnion      > 0 && <Row label="Credit Union"      value={`− ${formatGYD(r.creditUnion)}`}      red />}
          {r.loanRepayment    > 0 && <Row label="Loan Repayment"    value={`− ${formatGYD(r.loanRepayment)}`}    red />}
          {r.advancesRecovery > 0 && <Row label="Advances Recovery" value={`− ${formatGYD(r.advancesRecovery)}`} red />}
          {r.unionDues        > 0 && <Row label="Union Dues"        value={`− ${formatGYD(r.unionDues)}`}        red />}
          {(pc?.otherDeductions ?? []).map((d, i) => <Row key={i} label={d.name} value={`− ${formatGYD(d.amount)}`} red />)}
        </>
      )}

      <Divider />
      <div className="flex justify-between items-center bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md px-4 py-3">
        <span className="font-bold text-base">Net Pay</span>
        <span className="font-bold text-2xl text-green-600">{formatGYD(r.netPay)}</span>
      </div>
      <Row
        label={`Employer NIS (${(C.NIS_ER_RATE * 100).toFixed(1)}%) — not deducted from employee`}
        value={formatGYD(r.employerNIS)}
        muted
      />
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
          {payslips.map((p) => {
            const r = p.data as unknown as PayrollResult;
            return (
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
                      Issued {format(new Date(p.sentAt), "d MMM yyyy, h:mm a")} · Net Pay: <span className="font-semibold text-green-600">{formatGYD(r.netPay)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!p.seen && <Badge variant="default" className="text-xs">New</Badge>}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payslip — {selected?.period}</DialogTitle>
          </DialogHeader>
          {selected && <PayslipDetail r={selected.data as unknown as PayrollResult} />}
          <div className="flex gap-2 justify-end pt-2 flex-wrap">
            {selected && (
              <Button variant="outline" size="sm"
                onClick={() => downloadPayslipPDF(selected.data as unknown as PayrollResult)}
                data-testid="button-download-pdf"
              >
                <FileDown className="w-4 h-4 mr-1.5" /> Download PDF
              </Button>
            )}
            <Button size="sm" onClick={() => setSelected(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
