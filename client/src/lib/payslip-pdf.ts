import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PayrollResult } from "./payroll";
import { PAYROLL_CONSTANTS } from "./payroll";
import { format } from "date-fns";

const C = PAYROLL_CONSTANTS;

export const COMPANY_NAME = "FEDERAL MANAGEMENT SYSTEMS INC.";

function gyd(n: number) {
  return n.toLocaleString("en-GY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  try { return format(new Date(d + "T00:00"), "MMM dd yyyy"); } catch { return d; }
}

export interface YTDFigures {
  basicPay: number;
  otPay: number;
  phPay: number;
  hdPay: number;
  housingAllowance: number;
  transportAllowance: number;
  mealAllowance: number;
  uniformAllowance: number;
  riskAllowance: number;
  shiftAllowance: number;
  otherAllowances: Record<string, number>;
  // Time employee extras
  mealsPay: number;
  responsibilitiesPay: number;
  riskPay: number;
  grossPay: number;
  personalAllowance: number;
  childAllowance: number;
  employeeNIS: number;
  healthSurcharge: number;
  totalFreePay: number;
  paye: number;
  creditUnion: number;
  loanRepayment: number;
  advancesRecovery: number;
  unionDues: number;
  otherDeductions: Record<string, number>;
  totalDeductions: number;
  netPay: number;
}

export function computeYTD(payslipDataList: PayrollResult[], currentPeriodEnd: string): YTDFigures {
  const currentYear = new Date(currentPeriodEnd + "T00:00").getFullYear();
  const relevant = payslipDataList.filter((r) => {
    const year = new Date((r.periodEnd ?? "") + "T00:00").getFullYear();
    return year === currentYear && (r.periodEnd ?? "") <= currentPeriodEnd;
  });

  const ytd: YTDFigures = {
    basicPay: 0, otPay: 0, phPay: 0, hdPay: 0,
    housingAllowance: 0, transportAllowance: 0, mealAllowance: 0,
    uniformAllowance: 0, riskAllowance: 0, shiftAllowance: 0,
    otherAllowances: {},
    mealsPay: 0, responsibilitiesPay: 0, riskPay: 0,
    grossPay: 0,
    personalAllowance: 0, childAllowance: 0, employeeNIS: 0, healthSurcharge: 0,
    totalFreePay: 0,
    paye: 0, creditUnion: 0, loanRepayment: 0, advancesRecovery: 0, unionDues: 0,
    otherDeductions: {},
    totalDeductions: 0,
    netPay: 0,
  };

  for (const r of relevant) {
    const pc  = r.employee.payConfig;
    const ppm = pc?.frequency === "weekly" ? 52 / 12 : pc?.frequency === "biweekly" ? 26 / 12 : pc?.frequency === "monthly" ? 1 : 2;

    ytd.basicPay              += r.basicPay ?? 0;
    ytd.otPay                 += r.otPay ?? 0;
    ytd.phPay                 += r.phPay ?? 0;
    ytd.hdPay                 += r.hdPay ?? 0;
    ytd.housingAllowance      += (pc?.housingAllowance   ?? 0) / ppm;
    ytd.transportAllowance    += (pc?.transportAllowance ?? 0) / ppm;
    ytd.mealAllowance         += (pc?.mealAllowance      ?? 0) / ppm;
    ytd.uniformAllowance      += (pc?.uniformAllowance   ?? 0) / ppm;
    ytd.riskAllowance         += (pc?.riskAllowance      ?? 0) / ppm;
    ytd.shiftAllowance        += (pc?.shiftAllowance     ?? 0) / ppm;
    ytd.mealsPay              += r.mealsPay              ?? 0;
    ytd.responsibilitiesPay   += r.responsibilitiesPay   ?? 0;
    ytd.riskPay               += r.riskPay               ?? 0;
    ytd.grossPay              += r.grossPay ?? 0;
    ytd.personalAllowance     += r.personalAllowance ?? 0;
    ytd.childAllowance        += r.childAllowance ?? 0;
    ytd.employeeNIS           += r.employeeNIS ?? 0;
    ytd.healthSurcharge       += r.healthSurcharge ?? 0;
    ytd.totalFreePay          += (r.personalAllowance ?? 0) + (r.childAllowance ?? 0) + (r.employeeNIS ?? 0) + (r.healthSurcharge ?? 0);
    ytd.paye                  += r.paye ?? 0;
    ytd.creditUnion           += r.creditUnion ?? 0;
    ytd.loanRepayment         += r.loanRepayment ?? 0;
    ytd.advancesRecovery      += r.advancesRecovery ?? 0;
    ytd.unionDues             += r.unionDues ?? 0;
    ytd.totalDeductions       += (r.paye ?? 0) + (r.totalVoluntary ?? 0);
    ytd.netPay                += r.netPay ?? 0;

    (pc?.otherAllowances ?? []).forEach((a) => {
      ytd.otherAllowances[a.name] = (ytd.otherAllowances[a.name] ?? 0) + a.amount / ppm;
    });
    (pc?.otherDeductions ?? []).forEach((d) => {
      ytd.otherDeductions[d.name] = (ytd.otherDeductions[d.name] ?? 0) + d.amount;
    });
  }

  return ytd;
}

export function generatePayslipPDF(r: PayrollResult, ytd?: YTDFigures) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const L  = 14;
  const R  = pw - L;

  const pc  = r.employee.payConfig;
  const ppm = (pc?.frequency === "weekly" ? 52 / 12 : pc?.frequency === "biweekly" ? 26 / 12 : pc?.frequency === "monthly" ? 1 : 2);

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(COMPANY_NAME, pw / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${r.employee.dept} — ${r.employee.pos}`, pw / 2, 20, { align: "center" });

  // ── INFO ROW ──────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Payslip# ${r.employee.userId}`, L, 27);
  doc.setFont("helvetica", "normal");
  const tin        = (r.employee as any).tin      ? `TIN: ${(r.employee as any).tin}` : "";
  const nisNum     = (r.employee as any).nisNumber ? `NIS#: ${(r.employee as any).nisNumber}` : "";
  const idParts    = [tin, nisNum].filter(Boolean).join("   ");
  if (idParts) doc.text(idParts, pw / 2, 27, { align: "center" });
  const freqLabel = pc?.frequency === "weekly" ? "Weekly" : pc?.frequency === "biweekly" ? "Bi-Weekly" : pc?.frequency === "monthly" ? "Monthly" : "Bi-Monthly";
  doc.text(`${freqLabel} Work Period: ${fmtDate(r.periodStart)} to ${fmtDate(r.periodEnd)}`, R, 27, { align: "right" });

  // ── EMPLOYEE ROW ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.text(`${r.employee.userId}  ${r.employee.name}  [D.O.E: ${r.employee.joined ?? "N/A"}]`, L, 33);
  doc.setFont("helvetica", "normal");
  doc.text(`Pay Period: ${fmtDate(r.periodStart)} to ${fmtDate(r.periodEnd)}`, R, 33, { align: "right" });

  // ── SEPARATOR LINE ────────────────────────────────────────────────────────
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.line(L, 36, R, 36);

  // ── YTD LABEL MAP ─────────────────────────────────────────────────────────
  const ytdMap: Record<string, string> = ytd ? {
    "Basic Salary":              gyd(ytd.basicPay),
    "Overtime Pay":              gyd(ytd.otPay),
    "Public Holiday Pay":        gyd(ytd.phPay),
    "Holiday Double Pay":        gyd(ytd.hdPay),
    "Housing Allowance":         gyd(ytd.housingAllowance),
    "Transport Allowance":       gyd(ytd.transportAllowance),
    "Meal Allowance":            gyd(ytd.mealAllowance),
    "Uniform Allowance":         gyd(ytd.uniformAllowance),
    "Risk Allowance":            gyd(ytd.riskAllowance),
    "Shift Allowance":           gyd(ytd.shiftAllowance),
    "Meals Pay":                 gyd(ytd.mealsPay),
    "Responsibilities Pay":      gyd(ytd.responsibilitiesPay),
    "Risk Pay":                  gyd(ytd.riskPay),
    "Statutory Free Pay":        gyd(ytd.personalAllowance),
    "Child Tax Credit":          gyd(ytd.childAllowance),
    "National Insurance (EE)":   gyd(ytd.employeeNIS),
    "Health Surcharge (Ins.)":   gyd(ytd.healthSurcharge),
    "PAYE":                      gyd(ytd.paye),
    "Credit Union":              gyd(ytd.creditUnion),
    "Loan Repayment":            gyd(ytd.loanRepayment),
    "Advances Recovery":         gyd(ytd.advancesRecovery),
    "Union Dues":                gyd(ytd.unionDues),
    ...Object.fromEntries(Object.entries(ytd.otherAllowances).map(([k, v]) => [k, gyd(v)])),
    ...Object.fromEntries(Object.entries(ytd.otherDeductions).map(([k, v]) => [k, gyd(v)])),
  } : {};

  // ── BUILD TABLE DATA ──────────────────────────────────────────────────────
  const freePayRows: Array<[string, string]> = [];
  freePayRows.push(["Statutory Free Pay", gyd(r.personalAllowance)]);
  if (r.qualifyingChildren > 0) freePayRows.push(["Child Tax Credit", gyd(r.childAllowance)]);
  if (!pc?.nisExempt)           freePayRows.push(["National Insurance (EE)", gyd(r.employeeNIS)]);
  if (!pc?.healthSurchargeExempt) freePayRows.push(["Health Surcharge (Ins.)", gyd(r.healthSurcharge)]);

  const isTimeEmployee = r.isTimeEmployee ?? false;
  // Third element is the stable YTD map key (label can change with hours, key stays fixed)
  const incomeRows: Array<[string, string, string?]> = [];
  const otMult = pc?.otMultiplier ?? 1.5;
  const phMult = pc?.phMultiplier ?? 1.5;
  const hdMult = (pc as any)?.hdMultiplier ?? 2.0;
  incomeRows.push(["Basic Salary", gyd(r.basicPay), "Basic Salary"]);
  if (r.otPay > 0) incomeRows.push([`Overtime Pay (${r.otHours.toFixed(2)} hrs × ${otMult}×)`, gyd(r.otPay), "Overtime Pay"]);
  if (r.phPay > 0) incomeRows.push([`Public Holiday Pay (${r.phHours.toFixed(2)} hrs × ${phMult}×)`, gyd(r.phPay), "Public Holiday Pay"]);
  if (r.hdPay > 0) incomeRows.push([`Holiday Double Pay (${r.hdHours.toFixed(2)} hrs × ${hdMult}×)`, gyd(r.hdPay), "Holiday Double Pay"]);
  // Time employee computed extras
  if ((r.mealsPay ?? 0) > 0)            incomeRows.push([`Meals Pay (${r.mealsCount ?? 0} meals)`,            gyd(r.mealsPay ?? 0)]);
  if ((r.responsibilitiesPay ?? 0) > 0) incomeRows.push([`Responsibilities Pay (${r.responsibilityDays ?? 0} days)`, gyd(r.responsibilitiesPay ?? 0)]);
  if ((r.riskPay ?? 0) > 0)             incomeRows.push([`Risk Pay (${r.armedDays ?? 0} armed days)`,         gyd(r.riskPay ?? 0)]);
  if (r.allowances > 0) {
    if ((pc?.housingAllowance   ?? 0) > 0) incomeRows.push(["Housing Allowance",   gyd((pc!.housingAllowance)   / ppm)]);
    if ((pc?.transportAllowance ?? 0) > 0) incomeRows.push(["Transport Allowance", gyd((pc!.transportAllowance) / ppm)]);
    if (!isTimeEmployee && (pc?.mealAllowance ?? 0) > 0) incomeRows.push(["Meal Allowance", gyd((pc!.mealAllowance) / ppm)]);
    if ((pc?.uniformAllowance   ?? 0) > 0) incomeRows.push(["Uniform Allowance",   gyd((pc!.uniformAllowance)   / ppm)]);
    if (!isTimeEmployee && (pc?.riskAllowance ?? 0) > 0) incomeRows.push(["Risk Allowance", gyd((pc!.riskAllowance) / ppm)]);
    if ((pc?.shiftAllowance     ?? 0) > 0) incomeRows.push(["Shift Allowance",     gyd((pc!.shiftAllowance)     / ppm)]);
    (pc?.otherAllowances ?? []).forEach((a) => incomeRows.push([a.name, gyd(a.amount / ppm)]));
  }

  const deductionRows: Array<[string, string]> = [];
  if (!pc?.taxExempt)           deductionRows.push(["PAYE", gyd(r.paye)]);
  if (r.creditUnion      > 0)   deductionRows.push(["Credit Union",      gyd(r.creditUnion)]);
  if (r.loanRepayment    > 0)   deductionRows.push(["Loan Repayment",    gyd(r.loanRepayment)]);
  if (r.advancesRecovery > 0)   deductionRows.push(["Advances Recovery", gyd(r.advancesRecovery)]);
  if (r.unionDues        > 0)   deductionRows.push(["Union Dues",        gyd(r.unionDues)]);
  (pc?.otherDeductions ?? []).forEach((d) => deductionRows.push([d.name, gyd(d.amount)]));

  const totalFreePay  = r.personalAllowance + r.childAllowance + r.employeeNIS + r.healthSurcharge;
  const totalDeduct   = r.paye + r.totalVoluntary;
  const maxRows = Math.max(incomeRows.length, freePayRows.length, deductionRows.length);

  const body: any[][] = [];
  for (let i = 0; i < maxRows; i++) {
    const inc  = incomeRows[i]    ?? ["", ""];
    const fp   = freePayRows[i]   ?? ["", ""];
    const ded  = deductionRows[i] ?? ["", ""];
    const incYtdKey = (inc as [string, string, string?])[2] ?? inc[0];
    body.push([
      inc[0], inc[1], incYtdKey && ytd ? (ytdMap[incYtdKey] ?? "") : "",
      fp[0],  fp[1],  fp[0]  && ytd ? (ytdMap[fp[0]]  ?? "") : "",
      ded[0], ded[1], ded[0] && ytd ? (ytdMap[ded[0]] ?? "") : "",
    ]);
  }

  // Totals row
  body.push([
    { content: "Gross",           styles: { fontStyle: "bold" } },
    { content: gyd(r.grossPay),   styles: { fontStyle: "bold" } },
    { content: ytd ? gyd(ytd.grossPay)       : "", styles: { fontStyle: "bold", textColor: [80, 80, 80] } },
    { content: "Total FreePay",   styles: { fontStyle: "bold" } },
    { content: gyd(totalFreePay), styles: { fontStyle: "bold" } },
    { content: ytd ? gyd(ytd.totalFreePay)   : "", styles: { fontStyle: "bold", textColor: [80, 80, 80] } },
    { content: "Total Deduction", styles: { fontStyle: "bold" } },
    { content: gyd(totalDeduct),  styles: { fontStyle: "bold" } },
    { content: ytd ? gyd(ytd.totalDeductions): "", styles: { fontStyle: "bold", textColor: [80, 80, 80] } },
  ]);

  autoTable(doc, {
    startY: 38,
    head: [[
      { content: "Income",     colSpan: 3, styles: { halign: "center", fillColor: [60, 80, 120], textColor: 255 } },
      { content: "FreePay",    colSpan: 3, styles: { halign: "center", fillColor: [60, 100, 80], textColor: 255 } },
      { content: "Deductions", colSpan: 3, styles: { halign: "center", fillColor: [120, 60, 60], textColor: 255 } },
    ], [
      "Description", "Amount (GYD)", "YTD",
      "Description", "Amount (GYD)", "YTD",
      "Description", "Amount (GYD)", "YTD",
    ]],
    body,
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 22, halign: "right", textColor: [100, 100, 100] },
      3: { cellWidth: 38 },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 22, halign: "right", textColor: [100, 100, 100] },
      6: { cellWidth: 38 },
      7: { cellWidth: 24, halign: "right" },
      8: { cellWidth: 22, halign: "right", textColor: [100, 100, 100] },
    },
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fontSize: 8 },
    margin: { left: L, right: L },
    didParseCell: (data) => {
      if (data.row.index === maxRows) {
        data.cell.styles.fillColor = [240, 240, 200];
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 3;

  // ── NET PAY ROW ───────────────────────────────────────────────────────────
  doc.setFillColor(34, 139, 34);
  doc.rect(L, finalY, R - L, 9, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Net Pay", L + 3, finalY + 6);
  if (ytd) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`YTD: GYD ${gyd(ytd.netPay)}`, pw / 2, finalY + 6, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
  }
  doc.text(`GYD ${gyd(r.netPay)}`, R - 3, finalY + 6, { align: "right" });
  doc.setTextColor(0);

  // ── BANK / PAYMENT ROW ───────────────────────────────────────────────────
  const bankY = finalY + 14;
  const empBankName   = (r.employee as any).bankName   ? `${(r.employee as any).bankName}` : "—";
  const empBankBranch = (r.employee as any).bankBranch ? ` — ${(r.employee as any).bankBranch}` : "";
  const empBankAcct   = (r.employee as any).bankAccountNumber ? `A/C: ${(r.employee as any).bankAccountNumber}` : "";
  const bankDisplay   = empBankName !== "—" ? `${empBankName}${empBankBranch}` : "Not specified";
  autoTable(doc, {
    startY: bankY,
    head: [["Bank Name / Branch", "Account Number", "Payment Mode", "Amount (GYD)"]],
    body: [[bankDisplay, empBankAcct || "—", "BANK TRANSFER", gyd(r.netPay)]],
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 55 },
      2: { cellWidth: 45 },
      3: { cellWidth: 45, halign: "right" },
    },
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 80, 120], textColor: 255, fontSize: 8 },
    margin: { left: L, right: L },
  });

  const bankFinalY = (doc as any).lastAutoTable.finalY + 4;

  // ── EMPLOYER NIS NOTE ────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  doc.text(
    `Employer NIS (${(C.NIS_ER_RATE * 100).toFixed(1)}%): GYD ${gyd(r.employerNIS)} — This amount is paid by the employer and is not deducted from your pay.`,
    pw / 2, bankFinalY, { align: "center" }
  );
  doc.text(
    "National Insurance values shown under FreePay will be remitted to the National Insurance Scheme.",
    pw / 2, bankFinalY + 5, { align: "center" }
  );
  doc.setTextColor(0);

  // ── FOOTER LINE ───────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Generated by FMS Timetrack · ${format(new Date(), "dd MMM yyyy HH:mm")} · CONFIDENTIAL`,
    pw / 2, ph - 6, { align: "center" }
  );

  return doc;
}

export function downloadPayslipPDF(r: PayrollResult, ytd?: YTDFigures) {
  const doc = generatePayslipPDF(r, ytd);
  doc.save(`FMS_Payslip_${r.employee.userId}_${r.periodStart}_${r.periodEnd}.pdf`);
}
