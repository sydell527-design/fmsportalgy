import type { User, Timesheet, EmployeeChild, PayConfig } from "@shared/schema";
import { differenceInYears, parseISO } from "date-fns";

// ── Guyana 2026 Statutory Constants ─────────────────────────────────────────
// Sources: GRA official notice, DPI Budget 2026 announcement (Jan 27 2026),
//          PwC Guyana National Budget Insights 2026
export const PAYROLL_CONSTANTS = {
  // NIS (National Insurance Scheme) — unchanged from 2025
  NIS_EMP_RATE: 0.056,             // 5.6% employee contribution
  NIS_ER_RATE: 0.084,              // 8.4% employer contribution
  NIS_CEILING_MONTHLY: 280_000,    // GYD/month maximum insurable earnings (= GYD 3,360,000/yr)

  // Income Tax (PAYE) — Budget 2026 rates effective 1 Jan 2026
  // Personal allowance = max(GYD 140,000/month, 1/3 of gross income) — whichever is greater
  PERSONAL_ALLOWANCE: 140_000,     // GYD/month minimum personal allowance (raised from 130,000 in 2025)
  CHILD_ALLOWANCE: 10_000,         // GYD/month per qualifying child (unchanged)
  TAX_LOWER_RATE: 0.25,            // 25% on chargeable income up to GYD 280,000/month
  TAX_LOWER_LIMIT: 280_000,        // GYD/month — 25% bracket ceiling (= GYD 3,360,000/year)
  TAX_UPPER_RATE: 0.35,            // 35% on chargeable income above GYD 280,000/month

  // Health Surcharge — no change announced in Budget 2026
  HEALTH_SURCHARGE_FULL: 1_200,    // GYD/month — employed persons
  HEALTH_SURCHARGE_HALF: 600,      // GYD/month — casual/part-time workers

  // Hours
  WORKING_HOURS_PER_MONTH: 160,    // 80h/bi-monthly period × 2 periods/month
  OT_MULTIPLIER_DEFAULT: 1.5,
  PH_MULTIPLIER_DEFAULT: 2.0,
};

const C = PAYROLL_CONSTANTS;

// A qualifying child reduces chargeable income:
//   — under 18 years old, OR
//   — 18–25 years old and currently in full-time education (child.school = true)
function isQualifyingChild(child: EmployeeChild): boolean {
  if (!child.active) return false;
  const age = differenceInYears(new Date(), parseISO(child.dob));
  if (age < 18) return true;
  if (age <= 25 && child.school) return true;
  return false;
}

export interface PayrollResult {
  employee: User;
  period: string;

  // Hours
  regularHours: number;
  otHours: number;

  // Earnings
  basicPay: number;
  otPay: number;
  allowances: number;        // sum of all payConfig allowances
  grossPay: number;          // basicPay + otPay + allowances

  // Statutory deductions
  employeeNIS: number;       // 5.6% capped at NIS ceiling
  employerNIS: number;       // 8.4% capped at NIS ceiling (employer cost, not deducted from employee)
  healthSurcharge: number;   // 1,200 full / 600 half / 0 if exempt
  qualifyingChildren: number;
  childAllowance: number;    // qualifyingChildren × 10,000
  personalAllowance: number; // max(GYD 140,000, grossPay/3) — GRA 2026 rule
  chargeableIncome: number;  // grossPay − employeeNIS − personalAllowance − childAllowance
  paye: number;              // progressive 25%/35% (Budget 2026)

  // Voluntary deductions
  creditUnion: number;
  loanRepayment: number;
  advancesRecovery: number;
  unionDues: number;
  otherDeductions: number;
  totalVoluntary: number;

  // Totals
  totalDeductions: number;
  netPay: number;

  // Timesheet counts
  approvedTimesheets: number;
  pendingTimesheets: number;
  totalTimesheets: number;
}

export function calcPayroll(
  employee: User,
  timesheets: Timesheet[],
  period: string,
  allChildren: EmployeeChild[] = [],
): PayrollResult {
  const pc: PayConfig = employee.payConfig ?? ({} as PayConfig);

  // ── Timesheets ─────────────────────────────────────────────────────────────
  const periodTs = timesheets.filter(
    (ts) => ts.eid === employee.userId && ts.date?.startsWith(period)
  );
  const approvedTs = periodTs.filter((ts) => ts.status === "approved");
  const approvedTimesheets = approvedTs.length;
  const pendingTimesheets = periodTs.filter(
    (ts) => ts.status === "pending_first_approval" ||
            ts.status === "pending_second_approval" ||
            ts.status === "pending_employee"
  ).length;

  const regularHours = approvedTs.reduce((s, ts) => s + (ts.reg ?? 0), 0);
  const otHours      = approvedTs.reduce((s, ts) => s + (ts.ot ?? 0), 0);

  // ── Pay frequency — periods per calendar month ────────────────────────────
  const freq = pc.frequency ?? "bimonthly";
  const ppm  = freq === "weekly" ? 52 / 12 : 2;   // bimonthly = 2 periods/month

  // ── Earnings ──────────────────────────────────────────────────────────────
  const otMultiplier = pc.otMultiplier ?? C.OT_MULTIPLIER_DEFAULT;
  let basicPay = 0;
  let otPay = 0;

  // All categories use hourlyRate as the stored rate.
  // Fallback for legacy Fixed/Executive records that only have salary (hourlyRate = 0).
  const hrsPerPeriod = freq === "weekly" ? 40 : 80;
  let rate = employee.hourlyRate ?? 0;
  if (employee.cat !== "Time" && rate === 0 && (employee.salary ?? 0) > 0) {
    rate = (employee.salary ?? 0) / (hrsPerPeriod * ppm);
  }
  // All categories paid from timesheet hours — Fixed/Executive can also earn OT
  basicPay = regularHours * rate;
  otPay    = otHours * rate * otMultiplier;

  // Monthly allowances prorated to this pay period
  const allowances =
    ((pc.housingAllowance   ?? 0) +
     (pc.transportAllowance ?? 0) +
     (pc.mealAllowance      ?? 0) +
     (pc.uniformAllowance   ?? 0) +
     (pc.riskAllowance      ?? 0) +
     (pc.shiftAllowance     ?? 0) +
     (pc.otherAllowances    ?? []).reduce((s, x) => s + x.amount, 0)) / ppm;

  const grossPay = basicPay + otPay + allowances;

  // ── NIS — ceiling prorated to pay period ─────────────────────────────────
  const nisBase         = Math.min(grossPay, C.NIS_CEILING_MONTHLY / ppm);
  const employeeNISCalc = pc.nisExempt ? 0 : Math.round(nisBase * C.NIS_EMP_RATE);
  const employeeNIS     = (pc.nisEmployeeOverride != null) ? pc.nisEmployeeOverride : employeeNISCalc;
  const employerNISCalc = pc.nisExempt ? 0 : Math.round(nisBase * C.NIS_ER_RATE);
  const employerNIS     = (pc.nisEmployerOverride != null) ? pc.nisEmployerOverride : employerNISCalc;

  // ── Health Surcharge — prorated from monthly flat amount ──────────────────
  const hsMonthly = pc.healthSurchargeRate === "half" ? C.HEALTH_SURCHARGE_HALF : C.HEALTH_SURCHARGE_FULL;
  const healthSurchargeCalc = pc.healthSurchargeExempt ? 0 : Math.round(hsMonthly / ppm);
  const healthSurcharge = (pc.healthSurchargeRate === "custom" && pc.healthSurchargeOverride != null)
    ? (pc.healthSurchargeExempt ? 0 : pc.healthSurchargeOverride)
    : healthSurchargeCalc;

  // ── PAYE (Income Tax) — progressive, GRA thresholds prorated to period ────
  const empChildren        = allChildren.filter((ch) => ch.eid === employee.userId);
  const qualifyingChildren = empChildren.filter(isQualifyingChild).length;
  const childAllowance     = Math.round((qualifyingChildren * C.CHILD_ALLOWANCE) / ppm);

  // GRA rule: personal allowance = greater of GYD 140,000/month OR 1/3 of monthly gross
  // Prorated to pay period
  const monthlyGross      = grossPay * ppm;
  const monthlyPersonalAl = Math.max(C.PERSONAL_ALLOWANCE, Math.round(monthlyGross / 3));
  const personalAllowance = Math.round(monthlyPersonalAl / ppm);

  // Insurance (healthSurcharge) is deductible before PAYE alongside NIS
  const chargeableIncome = pc.taxExempt ? 0
    : Math.max(0, grossPay - employeeNIS - healthSurcharge - personalAllowance - childAllowance);

  const periodLowerLimit = Math.round(C.TAX_LOWER_LIMIT / ppm);
  const payeCalc = pc.taxExempt ? 0
    : chargeableIncome <= periodLowerLimit
      ? Math.round(chargeableIncome * C.TAX_LOWER_RATE)
      : Math.round(
          periodLowerLimit * C.TAX_LOWER_RATE +
          (chargeableIncome - periodLowerLimit) * C.TAX_UPPER_RATE
        );
  const paye = (pc.taxOverride != null) ? (pc.taxExempt ? 0 : pc.taxOverride) : payeCalc;

  // ── Voluntary Deductions ──────────────────────────────────────────────────
  const creditUnion      = pc.creditUnion      ?? 0;
  const loanRepayment    = pc.loanRepayment    ?? 0;
  const advancesRecovery = pc.advancesRecovery ?? 0;
  const unionDues        = pc.unionDues        ?? 0;
  const otherDeductions  = (pc.otherDeductions ?? []).reduce((s, x) => s + x.amount, 0);
  const totalVoluntary   = creditUnion + loanRepayment + advancesRecovery + unionDues + otherDeductions;

  // ── Net Pay ───────────────────────────────────────────────────────────────
  const totalDeductions = employeeNIS + healthSurcharge + paye + totalVoluntary;
  const netPay          = Math.round(grossPay - totalDeductions);

  return {
    employee,
    period,
    regularHours,
    otHours,
    basicPay:     Math.round(basicPay),
    otPay:        Math.round(otPay),
    allowances:   Math.round(allowances),
    grossPay:     Math.round(grossPay),
    employeeNIS,
    employerNIS,
    healthSurcharge,
    qualifyingChildren,
    childAllowance,
    personalAllowance,
    chargeableIncome: Math.round(chargeableIncome),
    paye,
    creditUnion,
    loanRepayment,
    advancesRecovery,
    unionDues,
    otherDeductions:  Math.round(otherDeductions),
    totalVoluntary:   Math.round(totalVoluntary),
    totalDeductions:  Math.round(totalDeductions),
    netPay,
    approvedTimesheets,
    pendingTimesheets,
    totalTimesheets: periodTs.length,
  };
}

export function formatGYD(amount: number): string {
  return `GYD ${Math.round(amount).toLocaleString("en-GY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function generateQuickBooksCSV(results: PayrollResult[]): string {
  const headers = [
    "Employee Name", "Employee ID", "Department", "Position", "Pay Category",
    "Period", "Regular Hours", "OT Hours",
    "Basic Pay (GYD)", "OT Pay (GYD)", "Allowances (GYD)", "Gross Pay (GYD)",
    "Employee NIS (GYD)", "Hand In Hand Insurance (GYD)", "Qualifying Children",
    "Child Allowance (GYD)", "Chargeable Income (GYD)", "PAYE (GYD)",
    "Credit Union (GYD)", "Loan Repayment (GYD)", "Advances Recovery (GYD)",
    "Union Dues (GYD)", "Other Deductions (GYD)",
    "Total Deductions (GYD)", "Net Pay (GYD)", "Employer NIS (GYD)",
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
    r.basicPay.toFixed(2),
    r.otPay.toFixed(2),
    r.allowances.toFixed(2),
    r.grossPay.toFixed(2),
    r.employeeNIS.toFixed(2),
    r.healthSurcharge.toFixed(2),
    String(r.qualifyingChildren),
    r.childAllowance.toFixed(2),
    r.chargeableIncome.toFixed(2),
    r.paye.toFixed(2),
    r.creditUnion.toFixed(2),
    r.loanRepayment.toFixed(2),
    r.advancesRecovery.toFixed(2),
    r.unionDues.toFixed(2),
    r.otherDeductions.toFixed(2),
    r.totalDeductions.toFixed(2),
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
