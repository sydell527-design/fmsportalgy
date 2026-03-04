import { AlertCircle } from "lucide-react";
import { formatGYD, PAYROLL_CONSTANTS, TIME_CONSTANTS } from "@/lib/payroll";
import type { PayrollResult } from "@/lib/payroll";
import type { YTDFigures } from "@/lib/payslip-pdf";
import { COMPANY_NAME } from "@/lib/payslip-pdf";

const C = PAYROLL_CONSTANTS;
function fmt(n: number) { return formatGYD(n); }
function ytdStr(n: number) { return n > 0 ? formatGYD(n) : ""; }

export function PayslipLandscape({
  r, tin, nisNumber, ytd,
}: {
  r: PayrollResult;
  tin?: string | null;
  nisNumber?: string | null;
  ytd?: YTDFigures;
}) {
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
  const isTime = r.isTimeEmployee ?? false;

  const incomeItems: Array<{label: string; amount: number; sub?: string; ytd?: number}> = [];
  const otMult = pc?.otMultiplier ?? 1.5;
  const phMult = pc?.phMultiplier ?? 1.5;
  const hdMult = (pc as any)?.hdMultiplier ?? 2.0;
  incomeItems.push({ label: "Basic Salary", amount: r.basicPay, sub: `${r.regularHours.toFixed(2)} hrs × ${fmt(r.effectiveRate)}/hr`, ytd: ytd?.basicPay });
  if (r.otPay > 0) incomeItems.push({
    label: "Overtime Pay",
    amount: r.otPay,
    sub: `${r.otHours.toFixed(2)} hrs × ${fmt(r.effectiveRate)}/hr × ${otMult}`,
    ytd: ytd?.otPay,
  });
  if (r.phPay > 0) incomeItems.push({
    label: "Public Holiday Pay",
    amount: r.phPay,
    sub: `${r.phHours.toFixed(2)} hrs × ${fmt(r.effectiveRate)}/hr × ${phMult}`,
    ytd: ytd?.phPay,
  });
  if (r.hdPay > 0) incomeItems.push({
    label: "Holiday Double Pay",
    amount: r.hdPay,
    sub: `${r.hdHours.toFixed(2)} hrs × ${fmt(r.effectiveRate)}/hr × ${hdMult}`,
    ytd: ytd?.hdPay,
  });
  // Time employee computed income (replaces flat allowances for meals & risk)
  if (isTime && (r.mealsPay ?? 0) > 0)
    incomeItems.push({ label: `Meals Pay (${r.mealsCount ?? 0} × GYD ${TIME_CONSTANTS.MEAL_RATE})`, amount: r.mealsPay!, ytd: ytd?.mealsPay });
  if (isTime && (r.responsibilitiesPay ?? 0) > 0)
    incomeItems.push({ label: `Responsibilities (${r.responsibilityDays ?? 0} days × GYD ${TIME_CONSTANTS.RESPONSIBILITY_RATE})`, amount: r.responsibilitiesPay!, ytd: ytd?.responsibilitiesPay });
  if (isTime && (r.riskPay ?? 0) > 0)
    incomeItems.push({ label: `Risk Pay (${r.armedDays ?? 0} armed days)`, amount: r.riskPay!, ytd: ytd?.riskPay });
  // Allowances from PayConfig (skip mealAllowance + riskAllowance for Time employees)
  if ((pc?.housingAllowance   ?? 0) > 0) incomeItems.push({ label: "Housing Allowance",   amount: (pc!.housingAllowance)   / ppm, ytd: ytd?.housingAllowance });
  if ((pc?.transportAllowance ?? 0) > 0) incomeItems.push({ label: "Transport Allowance", amount: (pc!.transportAllowance) / ppm, ytd: ytd?.transportAllowance });
  if (!isTime && (pc?.mealAllowance ?? 0) > 0) incomeItems.push({ label: "Meal Allowance", amount: (pc!.mealAllowance) / ppm, ytd: ytd?.mealAllowance });
  if ((pc?.uniformAllowance   ?? 0) > 0) incomeItems.push({ label: "Uniform Allowance",   amount: (pc!.uniformAllowance)   / ppm, ytd: ytd?.uniformAllowance });
  if (!isTime && (pc?.riskAllowance ?? 0) > 0) incomeItems.push({ label: "Risk Allowance", amount: (pc!.riskAllowance) / ppm, ytd: ytd?.riskAllowance });
  if ((pc?.shiftAllowance     ?? 0) > 0) incomeItems.push({ label: "Shift Allowance",     amount: (pc!.shiftAllowance)     / ppm, ytd: ytd?.shiftAllowance });
  (pc?.otherAllowances ?? []).forEach((a) => incomeItems.push({ label: a.name, amount: a.amount / ppm, ytd: ytd?.otherAllowances?.[a.name] }));

  const freeItems: Array<{label: string; amount: number; ytd?: number}> = [];
  freeItems.push({ label: "Statutory Free Pay", amount: r.personalAllowance, ytd: ytd?.personalAllowance });
  if (r.qualifyingChildren > 0) freeItems.push({ label: `Child Tax Credit (${r.qualifyingChildren})`, amount: r.childAllowance, ytd: ytd?.childAllowance });
  if (!pc?.nisExempt)             freeItems.push({ label: `Emp. NIS (${(C.NIS_EMP_RATE*100).toFixed(1)}%)`, amount: r.employeeNIS, ytd: ytd?.employeeNIS });
  if (!pc?.healthSurchargeExempt) freeItems.push({ label: "Health Surcharge",    amount: r.healthSurcharge, ytd: ytd?.healthSurcharge });

  const dedItems: Array<{label: string; amount: number; ytd?: number}> = [];
  if (!pc?.taxExempt)         dedItems.push({ label: `PAYE${r.chargeableIncome > C.TAX_LOWER_LIMIT/ppm ? " (25%/35%)" : " (25%)"}`, amount: r.paye, ytd: ytd?.paye });
  if (r.creditUnion      > 0) dedItems.push({ label: "Credit Union",      amount: r.creditUnion,      ytd: ytd?.creditUnion });
  if (r.loanRepayment    > 0) dedItems.push({ label: "Loan Repayment",    amount: r.loanRepayment,    ytd: ytd?.loanRepayment });
  if (r.advancesRecovery > 0) dedItems.push({ label: "Advances Recovery", amount: r.advancesRecovery, ytd: ytd?.advancesRecovery });
  if (r.unionDues        > 0) dedItems.push({ label: "Union Dues",        amount: r.unionDues,        ytd: ytd?.unionDues });
  (pc?.otherDeductions ?? []).forEach((d) => dedItems.push({ label: d.name, amount: d.amount, ytd: ytd?.otherDeductions?.[d.name] }));

  const totalFreePay = r.personalAllowance + r.childAllowance + r.employeeNIS + r.healthSurcharge;
  const totalDeduct  = r.paye + r.totalVoluntary;
  const maxRows = Math.max(incomeItems.length, freeItems.length, dedItems.length);

  const showYTD = !!ytd;

  return (
    <div className="text-xs">
      <div className="text-center py-3 border-b border-border">
        <p className="font-bold text-sm text-foreground tracking-wide">{COMPANY_NAME}</p>
        <p className="text-muted-foreground text-xs">{r.employee.dept} — {r.employee.pos}</p>
      </div>

      <div className="flex justify-between items-center px-2 py-2 border-b border-border bg-muted/20 text-xs">
        <div className="space-y-0.5">
          <p><span className="font-semibold">ID:</span> {r.employee.userId}&emsp;<span className="font-semibold">Name:</span> {r.employee.name}</p>
          <p className="text-muted-foreground">D.O.E: {r.employee.joined ?? "N/A"} · {r.approvedTimesheets} approved timesheet{r.approvedTimesheets !== 1 ? "s" : ""} · {fmt(r.effectiveRate)}/hr</p>
          {(tin || nisNumber) && (
            <p className="text-muted-foreground">
              {tin      && <span className="mr-3"><span className="font-semibold text-foreground">TIN:</span> {tin}</span>}
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
            <th colSpan={showYTD ? 3 : 2} className="bg-blue-700 text-white text-center py-1 px-2 border border-border">Income</th>
            <th colSpan={showYTD ? 3 : 2} className="bg-emerald-700 text-white text-center py-1 px-2 border border-border">FreePay</th>
            <th colSpan={showYTD ? 3 : 2} className="bg-red-700 text-white text-center py-1 px-2 border border-border">Deductions</th>
          </tr>
          <tr className="bg-muted/50 text-muted-foreground text-[10px]">
            <th className="text-left py-0.5 px-2 border border-border font-medium">Description</th>
            <th className="text-right py-0.5 px-2 border border-border font-medium">Amount (GYD)</th>
            {showYTD && <th className="text-right py-0.5 px-2 border border-border font-medium text-blue-600">YTD</th>}
            <th className="text-left py-0.5 px-2 border border-border font-medium">Description</th>
            <th className="text-right py-0.5 px-2 border border-border font-medium">Amount (GYD)</th>
            {showYTD && <th className="text-right py-0.5 px-2 border border-border font-medium text-emerald-600">YTD</th>}
            <th className="text-left py-0.5 px-2 border border-border font-medium">Description</th>
            <th className="text-right py-0.5 px-2 border border-border font-medium">Amount (GYD)</th>
            {showYTD && <th className="text-right py-0.5 px-2 border border-border font-medium text-red-600">YTD</th>}
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
                <td className="py-0.5 px-2 border border-border text-right font-mono">{inc ? fmt(inc.amount) : ""}</td>
                {showYTD && <td className="py-0.5 px-2 border border-border text-right font-mono text-blue-700 text-[10px]">{inc?.ytd != null ? ytdStr(inc.ytd) : ""}</td>}
                <td className="py-0.5 px-2 border border-border">{fp?.label ?? ""}</td>
                <td className="py-0.5 px-2 border border-border text-right font-mono">{fp ? fmt(fp.amount) : ""}</td>
                {showYTD && <td className="py-0.5 px-2 border border-border text-right font-mono text-emerald-700 text-[10px]">{fp?.ytd != null ? ytdStr(fp.ytd) : ""}</td>}
                <td className="py-0.5 px-2 border border-border">{ded?.label ?? ""}</td>
                <td className="py-0.5 px-2 border border-border text-right font-mono text-red-600">{ded ? fmt(ded.amount) : ""}</td>
                {showYTD && <td className="py-0.5 px-2 border border-border text-right font-mono text-red-400 text-[10px]">{ded?.ytd != null ? ytdStr(ded.ytd) : ""}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-yellow-50 dark:bg-yellow-900/20 font-semibold">
            <td className="py-1 px-2 border border-border">Gross</td>
            <td className="py-1 px-2 border border-border text-right font-mono">{fmt(r.grossPay)}</td>
            {showYTD && <td className="py-1 px-2 border border-border text-right font-mono text-blue-700 text-[10px]">{ytd ? ytdStr(ytd.grossPay) : ""}</td>}
            <td className="py-1 px-2 border border-border">Total FreePay</td>
            <td className="py-1 px-2 border border-border text-right font-mono">{fmt(totalFreePay)}</td>
            {showYTD && <td className="py-1 px-2 border border-border text-right font-mono text-emerald-700 text-[10px]">{ytd ? ytdStr(ytd.totalFreePay) : ""}</td>}
            <td className="py-1 px-2 border border-border">Total Deduction</td>
            <td className="py-1 px-2 border border-border text-right font-mono text-red-600">{fmt(totalDeduct)}</td>
            {showYTD && <td className="py-1 px-2 border border-border text-right font-mono text-red-400 text-[10px]">{ytd ? ytdStr(ytd.totalDeductions) : ""}</td>}
          </tr>
        </tfoot>
      </table>

      <div className="flex justify-between items-center bg-green-600 text-white rounded-sm px-4 py-2 mt-1">
        <span className="font-bold text-sm">Net Pay</span>
        {showYTD && <span className="text-xs opacity-90">YTD: {ytd ? fmt(ytd.netPay) : ""}</span>}
        <span className="font-bold text-xl font-mono">{fmt(r.netPay)}</span>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="bg-muted/20 rounded p-2 space-y-0.5 text-[10px]">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">PAYE Computation</p>
          <div className="flex justify-between"><span>Gross Pay</span><span className="font-mono">{fmt(r.grossPay)}</span></div>
          <div className="flex justify-between text-red-600"><span>Less: Employee NIS</span><span className="font-mono">− {fmt(r.employeeNIS)}</span></div>
          <div className="flex justify-between text-red-600"><span>Less: Insurance</span><span className="font-mono">− {fmt(r.healthSurcharge)}</span></div>
          <div className="flex justify-between text-red-600"><span>Less: Personal Allowance</span><span className="font-mono">− {fmt(r.personalAllowance)}</span></div>
          {r.qualifyingChildren > 0 && (
            <div className="flex justify-between text-red-600"><span>Less: Child Allowance</span><span className="font-mono">− {fmt(r.childAllowance)}</span></div>
          )}
          <div className="flex justify-between font-semibold border-t border-border pt-0.5">
            <span>Chargeable Income</span><span className="font-mono">{fmt(r.chargeableIncome)}</span>
          </div>
          <div className="flex justify-between font-semibold text-red-600">
            <span>PAYE</span><span className="font-mono">− {fmt(r.paye)}</span>
          </div>
        </div>
        <div className="bg-muted/20 rounded p-2 text-[10px] space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Employer NIS (Not deducted from employee)</p>
          <div className="flex justify-between">
            <span>Employer NIS ({(C.NIS_ER_RATE*100).toFixed(1)}%)</span>
            <span className="font-mono">{fmt(r.employerNIS)}</span>
          </div>
          <p className="text-muted-foreground mt-1 italic">
            National Insurance values shown under FreePay will be remitted to the National Insurance Scheme.
          </p>
        </div>
      </div>
    </div>
  );
}
