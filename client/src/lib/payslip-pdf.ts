import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PayrollResult } from "./payroll";
import { PAYROLL_CONSTANTS } from "./payroll";
import { format } from "date-fns";

const C = PAYROLL_CONSTANTS;

function gyd(n: number) {
  return n.toLocaleString("en-GY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  try { return format(new Date(d + "T00:00"), "MMM dd yyyy"); } catch { return d; }
}

export function generatePayslipPDF(r: PayrollResult) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();   // 297
  const ph = doc.internal.pageSize.getHeight();  // 210
  const L  = 14;  // left margin
  const R  = pw - L; // right margin

  const pc  = r.employee.payConfig;
  const ppm = (pc?.frequency === "weekly" ? 52 / 12 : pc?.frequency === "biweekly" ? 26 / 12 : pc?.frequency === "monthly" ? 1 : 2);

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("FACILITY MANAGEMENT SERVICES (GUYANA) INC.", pw / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${r.employee.dept} — ${r.employee.pos}`, pw / 2, 20, { align: "center" });

  // ── INFO ROW ──────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Payslip# ${r.employee.userId}`, L, 27);
  doc.setFont("helvetica", "normal");
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

  // ── BUILD TABLE DATA ──────────────────────────────────────────────────────
  // FreePay = items that reduce taxable income
  const freePayRows: Array<[string, string]> = [];
  freePayRows.push(["Statutory Free Pay", gyd(r.personalAllowance)]);
  if (r.qualifyingChildren > 0) freePayRows.push(["Child Tax Credit", gyd(r.childAllowance)]);
  if (!pc?.nisExempt)           freePayRows.push(["National Insurance (EE)", gyd(r.employeeNIS)]);
  if (!pc?.healthSurchargeExempt) freePayRows.push(["Health Surcharge (Ins.)", gyd(r.healthSurcharge)]);

  // Income rows
  const incomeRows: Array<[string, string]> = [];
  incomeRows.push(["Basic Salary", gyd(r.basicPay)]);
  if (r.otPay > 0) incomeRows.push(["Overtime Pay", gyd(r.otPay)]);
  if (r.phPay > 0) incomeRows.push(["Public Holiday Pay", gyd(r.phPay)]);
  if (r.allowances > 0) {
    if ((pc?.housingAllowance   ?? 0) > 0) incomeRows.push(["Housing Allowance",    gyd((pc!.housingAllowance)   / ppm)]);
    if ((pc?.transportAllowance ?? 0) > 0) incomeRows.push(["Transport Allowance",  gyd((pc!.transportAllowance) / ppm)]);
    if ((pc?.mealAllowance      ?? 0) > 0) incomeRows.push(["Meal Allowance",       gyd((pc!.mealAllowance)      / ppm)]);
    if ((pc?.uniformAllowance   ?? 0) > 0) incomeRows.push(["Uniform Allowance",    gyd((pc!.uniformAllowance)   / ppm)]);
    if ((pc?.riskAllowance      ?? 0) > 0) incomeRows.push(["Risk Allowance",       gyd((pc!.riskAllowance)      / ppm)]);
    if ((pc?.shiftAllowance     ?? 0) > 0) incomeRows.push(["Shift Allowance",      gyd((pc!.shiftAllowance)     / ppm)]);
    (pc?.otherAllowances ?? []).forEach((a) => incomeRows.push([a.name, gyd(a.amount / ppm)]));
  }

  // Deduction rows
  const deductionRows: Array<[string, string]> = [];
  if (!pc?.taxExempt)   deductionRows.push(["PAYE", gyd(r.paye)]);
  if (r.creditUnion      > 0) deductionRows.push(["Credit Union",      gyd(r.creditUnion)]);
  if (r.loanRepayment    > 0) deductionRows.push(["Loan Repayment",    gyd(r.loanRepayment)]);
  if (r.advancesRecovery > 0) deductionRows.push(["Advances Recovery", gyd(r.advancesRecovery)]);
  if (r.unionDues        > 0) deductionRows.push(["Union Dues",        gyd(r.unionDues)]);
  (pc?.otherDeductions ?? []).forEach((d) => deductionRows.push([d.name, gyd(d.amount)]));

  const totalFreePay  = r.personalAllowance + r.childAllowance + r.employeeNIS + r.healthSurcharge;
  const totalDeduct   = r.paye + r.totalVoluntary;
  const maxRows = Math.max(incomeRows.length, freePayRows.length, deductionRows.length);

  const body: any[][] = [];
  const HDR_STYLE = { fillColor: [220, 220, 220], fontStyle: "bold", fontSize: 8 };

  for (let i = 0; i < maxRows; i++) {
    const inc  = incomeRows[i]  ?? ["", ""];
    const fp   = freePayRows[i] ?? ["", ""];
    const ded  = deductionRows[i] ?? ["", ""];
    body.push([inc[0], inc[1], "", fp[0], fp[1], "", ded[0], ded[1], ""]);
  }

  // Totals row
  body.push([
    { content: "Gross", styles: { fontStyle: "bold" } }, { content: gyd(r.grossPay), styles: { fontStyle: "bold" } }, "",
    { content: "Total FreePay", styles: { fontStyle: "bold" } }, { content: gyd(totalFreePay), styles: { fontStyle: "bold" } }, "",
    { content: "Total Deduction", styles: { fontStyle: "bold" } }, { content: gyd(totalDeduct), styles: { fontStyle: "bold" } }, "",
  ]);

  autoTable(doc, {
    startY: 38,
    head: [[
      { content: "Income",    colSpan: 3, styles: { halign: "center", fillColor: [60, 80, 120], textColor: 255 } },
      { content: "FreePay",   colSpan: 3, styles: { halign: "center", fillColor: [60, 100, 80],  textColor: 255 } },
      { content: "Deductions",colSpan: 3, styles: { halign: "center", fillColor: [120, 60, 60],  textColor: 255 } },
    ], [
      "Description", "Amount (GYD)", "YTD",
      "Description", "Amount (GYD)", "YTD",
      "Description", "Amount (GYD)", "YTD",
    ]],
    body,
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 25, halign: "right" },
      2: { cellWidth: 20, halign: "right", textColor: [160, 160, 160] },
      3: { cellWidth: 40 },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 20, halign: "right", textColor: [160, 160, 160] },
      6: { cellWidth: 40 },
      7: { cellWidth: 25, halign: "right" },
      8: { cellWidth: 20, halign: "right", textColor: [160, 160, 160] },
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
  doc.text(`GYD ${gyd(r.netPay)}`, R - 3, finalY + 6, { align: "right" });
  doc.setTextColor(0);

  // ── BANK / PAYMENT ROW ───────────────────────────────────────────────────
  const bankY = finalY + 14;
  autoTable(doc, {
    startY: bankY,
    head: [["Bank Name", "Payment Mode", "Amount (GYD)"]],
    body: [["Bank of Nova Scotia (Main Branch)", "BANK", gyd(r.netPay)]],
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 50 },
      2: { cellWidth: 50, halign: "right" },
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

export function downloadPayslipPDF(r: PayrollResult) {
  const doc = generatePayslipPDF(r);
  doc.save(`FMS_Payslip_${r.employee.userId}_${r.periodStart}_${r.periodEnd}.pdf`);
}
