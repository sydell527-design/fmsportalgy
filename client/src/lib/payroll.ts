import type { User, Timesheet } from "@shared/schema";

// Guyana 2026 Payroll Constants
export const PAYROLL_CONSTANTS = {
  NIS_EMP_RATE: 0.056,
  NIS_ER_RATE: 0.084,
  NIS_CEILING_MONTHLY: 280000,
  PAYE_RATE: 0.28,
  PERSONAL_ALLOWANCE: 100000,
  OT_MULTIPLIER: 1.5,
  WORKING_HOURS_PER_MONTH: 176,
};

export interface PayrollResult {
  employee: User;
  period: string;
  regularHours: number;
  otHours: number;
  regularPay: number;
  otPay: number;
  grossPay: number;
  employeeNIS: number;
  employerNIS: number;
  paye: number;
  netPay: number;
  approvedTimesheets: number;
  pendingTimesheets: number;
  totalTimesheets: number;
}

export function calcPayroll(employee: User, timesheets: Timesheet[], period: string): PayrollResult {
  const C = PAYROLL_CONSTANTS;

  // All timesheets for this employee in the given period (YYYY-MM), excluding rejected
  const periodTs = timesheets.filter(
    (ts) => ts.eid === employee.userId && ts.date?.startsWith(period) && ts.status !== "rejected"
  );

  const approvedTimesheets = periodTs.filter((ts) => ts.status === "approved").length;
  const pendingTimesheets = periodTs.filter((ts) => ts.status !== "approved").length;

  // Calculate hours from all non-rejected timesheets (pending counts toward payroll estimate)
  const regularHours = periodTs.reduce((s, ts) => s + (ts.reg ?? 0), 0);
  const otHours = periodTs.reduce((s, ts) => s + (ts.ot ?? 0), 0);

  let regularPay = 0;
  let otPay = 0;
  let grossPay = 0;

  if (employee.cat === "Time") {
    const rate = employee.hourlyRate ?? 0;
    regularPay = regularHours * rate;
    otPay = otHours * rate * C.OT_MULTIPLIER;
    grossPay = regularPay + otPay;
  } else {
    // Fixed / Executive — monthly salary regardless of hours logged
    grossPay = employee.salary ?? 0;
    regularPay = grossPay;
    if (otHours > 0) {
      const hourlyEquivalent = grossPay / C.WORKING_HOURS_PER_MONTH;
      otPay = otHours * hourlyEquivalent * C.OT_MULTIPLIER;
      grossPay += otPay;
    }
  }

  const nisBase = Math.min(grossPay, C.NIS_CEILING_MONTHLY);
  const employeeNIS = Math.round(nisBase * C.NIS_EMP_RATE);
  const employerNIS = Math.round(nisBase * C.NIS_ER_RATE);
  const taxable = Math.max(0, grossPay - employeeNIS - C.PERSONAL_ALLOWANCE);
  const paye = Math.round(taxable * C.PAYE_RATE);
  const netPay = Math.round(grossPay - employeeNIS - paye);

  return {
    employee,
    period,
    regularHours,
    otHours,
    regularPay: Math.round(regularPay),
    otPay: Math.round(otPay),
    grossPay: Math.round(grossPay),
    employeeNIS,
    employerNIS,
    paye,
    netPay,
    approvedTimesheets,
    pendingTimesheets,
    totalTimesheets: periodTs.length,
  };
}

export function formatGYD(amount: number): string {
  return `GYD ${amount.toLocaleString("en-GY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function generateQuickBooksCSV(results: PayrollResult[]): string {
  const headers = [
    "Employee Name",
    "Employee ID",
    "Department",
    "Position",
    "Pay Category",
    "Period",
    "Regular Hours",
    "OT Hours",
    "Regular Pay (GYD)",
    "OT Pay (GYD)",
    "Gross Pay (GYD)",
    "Employee NIS (GYD)",
    "PAYE (GYD)",
    "Net Pay (GYD)",
    "Employer NIS (GYD)",
  ];

  const rows = results.map((r) => [
    r.employee.name,
    r.employee.userId,
    r.employee.dept,
    r.employee.pos,
    r.employee.cat,
    r.period,
    r.regularHours.toFixed(2),
    r.otHours.toFixed(2),
    r.regularPay.toFixed(2),
    r.otPay.toFixed(2),
    r.grossPay.toFixed(2),
    r.employeeNIS.toFixed(2),
    r.paye.toFixed(2),
    r.netPay.toFixed(2),
    r.employerNIS.toFixed(2),
  ]);

  return [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
