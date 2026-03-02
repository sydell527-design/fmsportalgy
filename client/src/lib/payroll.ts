import type { User, Timesheet, EmployeeChild, PayConfig } from "@shared/schema";
import { differenceInYears, parseISO, getDaysInMonth } from "date-fns";

// ── Guyana 2026 Statutory Constants ─────────────────────────────────────────
export const PAYROLL_CONSTANTS = {
  NIS_EMP_RATE: 0.056,
  NIS_ER_RATE: 0.084,
  NIS_CEILING_MONTHLY: 280_000,
  PERSONAL_ALLOWANCE: 140_000,
  CHILD_ALLOWANCE: 10_000,
  TAX_LOWER_RATE: 0.25,
  TAX_LOWER_LIMIT: 280_000,
  TAX_UPPER_RATE: 0.35,
  HEALTH_SURCHARGE_FULL: 1_200,
  HEALTH_SURCHARGE_HALF: 600,
  WORKING_HOURS_PER_MONTH: 160,
  OT_MULTIPLIER_DEFAULT: 1.5,
  PH_MULTIPLIER_DEFAULT: 2.0,
};

const C = PAYROLL_CONSTANTS;

// ── Pay frequency helpers ─────────────────────────────────────────────────────
// ppm = periods per calendar month (used to prorate monthly statutory values)
export function freqPpm(freq: string): number {
  if (freq === "weekly")    return 52 / 12;   // ≈ 4.333 weeks/month
  if (freq === "biweekly")  return 26 / 12;   // ≈ 2.167 fortnights/month
  if (freq === "monthly")   return 1;
  return 2;                                   // bimonthly (default)
}

export function freqHrsPerPeriod(freq: string): number {
  if (freq === "weekly")   return 40;
  if (freq === "biweekly") return 80;
  if (freq === "monthly")  return 160;
  return 80; // bimonthly
}

// ── Qualifying child for PAYE child allowance ─────────────────────────────────
function isQualifyingChild(child: EmployeeChild): boolean {
  if (!child.active) return false;
  if (child.taxEligible === false) return false;   // explicitly excluded from PAYE deduction
  const age = differenceInYears(new Date(), parseISO(child.dob));
  if (age < 18) return true;
  if (age <= 25 && child.school) return true;
  return false;
}

// ── Date range helpers ────────────────────────────────────────────────────────
// periodHalf: "1" = 1st–15th, "2" = 16th–end of month
export function periodDates(yearMonth: string, half: "1" | "2"): { start: string; end: string; label: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = getDaysInMonth(new Date(y, m - 1));
  if (half === "1") {
    return {
      start: `${yearMonth}-01`,
      end:   `${yearMonth}-15`,
      label: `${yearMonth} · Period 1 (1–15)`,
    };
  }
  return {
    start: `${yearMonth}-16`,
    end:   `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
    label: `${yearMonth} · Period 2 (16–${lastDay})`,
  };
}

export interface PayrollResult {
  employee: User;
  period: string;        // display label
  periodStart: string;
  periodEnd: string;

  // Hours
  regularHours: number;
  otHours: number;
  phHours: number;

  // Earnings
  basicPay: number;
  otPay: number;
  phPay: number;
  allowances: number;
  grossPay: number;

  // Statutory deductions
  employeeNIS: number;
  employerNIS: number;
  healthSurcharge: number;
  qualifyingChildren: number;
  childAllowance: number;
  personalAllowance: number;
  chargeableIncome: number;
  paye: number;

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

  // Derived: hourly rate used
  effectiveRate: number;
}

export function calcPayroll(
  employee: User,
  timesheets: Timesheet[],
  periodStart: string,                       // "2026-03-01"
  periodEnd: string,                         // "2026-03-15"
  allChildren: EmployeeChild[] = [],
  periodLabel?: string,
  companyPersonalAllowance?: number,         // company-wide threshold override (e.g. 130_000)
): PayrollResult {
  const pc: PayConfig = employee.payConfig ?? ({} as PayConfig);

  // ── Timesheets — exact date range for this pay period ─────────────────────
  const periodTs = timesheets.filter(
    (ts) =>
      ts.eid === employee.userId &&
      ts.date != null &&
      ts.date >= periodStart &&
      ts.date <= periodEnd
  );
  const approvedTs = periodTs.filter((ts) => ts.status === "approved");
  const approvedTimesheets = approvedTs.length;
  const pendingTimesheets = periodTs.filter(
    (ts) =>
      ts.status === "pending_first_approval" ||
      ts.status === "pending_second_approval" ||
      ts.status === "pending_employee"
  ).length;

  // Sum hours from approved timesheets only — no invented figures
  const regularHours = approvedTs.reduce((s, ts) => s + (ts.reg ?? 0), 0);
  const otHours      = approvedTs.reduce((s, ts) => s + (ts.ot ?? 0), 0);
  const phHours      = approvedTs.reduce((s, ts) => s + (ts.ph ?? 0), 0);

  // ── Pay frequency ─────────────────────────────────────────────────────────
  const freq = pc.frequency ?? "bimonthly";
  const ppm  = freqPpm(freq);            // periods per calendar month
  const hrsPerPeriod = freqHrsPerPeriod(freq);

  // ── Effective hourly rate ─────────────────────────────────────────────────
  // Primary: hourlyRate from employee profile (supports decimals e.g. 937.50)
  // Fallback: legacy Fixed/Executive records that only have salary (no hourlyRate)
  let effectiveRate = employee.hourlyRate ?? 0;
  if (effectiveRate === 0 && (employee.salary ?? 0) > 0) {
    effectiveRate = (employee.salary ?? 0) / (hrsPerPeriod * ppm);
  }

  // ── Earnings — all from actual approved timesheet hours × rate ────────────
  const otMultiplier = pc.otMultiplier ?? C.OT_MULTIPLIER_DEFAULT;
  const phMultiplier = pc.phMultiplier ?? C.PH_MULTIPLIER_DEFAULT;

  const basicPay = regularHours * effectiveRate;
  const otPay    = otHours      * effectiveRate * otMultiplier;
  const phPay    = phHours      * effectiveRate * phMultiplier;

  // Allowances are stored as monthly amounts → prorate to this pay period
  const monthlyAllowances =
    (pc.housingAllowance   ?? 0) +
    (pc.transportAllowance ?? 0) +
    (pc.mealAllowance      ?? 0) +
    (pc.uniformAllowance   ?? 0) +
    (pc.riskAllowance      ?? 0) +
    (pc.shiftAllowance     ?? 0) +
    (pc.otherAllowances ?? []).reduce((s, x) => s + x.amount, 0);
  const allowances = Math.round(monthlyAllowances / ppm);

  const grossPay = basicPay + otPay + phPay + allowances;

  // ── NIS — employee 5.6%, employer 8.4%, ceiling prorated to period ────────
  const effectiveNisCeiling = (pc.nisCeilingOverride ?? C.NIS_CEILING_MONTHLY) / ppm;
  const nisBase         = Math.min(grossPay, effectiveNisCeiling);
  const employeeNISCalc = pc.nisExempt ? 0 : Math.round(nisBase * C.NIS_EMP_RATE);
  const employeeNIS     = pc.nisEmployeeOverride != null ? pc.nisEmployeeOverride : employeeNISCalc;
  const employerNISCalc = pc.nisExempt ? 0 : Math.round(nisBase * C.NIS_ER_RATE);
  const employerNIS     = pc.nisEmployerOverride != null ? pc.nisEmployerOverride : employerNISCalc;

  // ── Hand In Hand Insurance — flat monthly fee prorated to period ──────────
  const hsMonthlyFlat = pc.healthSurchargeRate === "half"
    ? C.HEALTH_SURCHARGE_HALF
    : C.HEALTH_SURCHARGE_FULL;
  const healthSurchargeCalc =
    pc.healthSurchargeExempt ? 0 : Math.round(hsMonthlyFlat / ppm);
  const healthSurcharge =
    pc.healthSurchargeRate === "custom" && pc.healthSurchargeOverride != null
      ? pc.healthSurchargeExempt ? 0 : pc.healthSurchargeOverride
      : healthSurchargeCalc;

  // ── PAYE — GRA 2026 progressive tax ──────────────────────────────────────
  const empChildren        = allChildren.filter((ch) => ch.eid === employee.userId);
  const qualifyingChildren = empChildren.filter(isQualifyingChild).length;
  // Child allowance: monthly GYD 10,000/child → prorated to this period
  const childAllowance     = Math.round((qualifyingChildren * C.CHILD_ALLOWANCE) / ppm);

  // Personal allowance: GRA rule = max(company threshold/month, ⅓ of monthly gross)
  // companyPersonalAllowance overrides the statutory constant for company-wide config.
  // Per-employee personalAllowanceOverride takes highest precedence.
  const basePersonalAllowance = companyPersonalAllowance ?? C.PERSONAL_ALLOWANCE;
  const effectivePaMonthly = pc.personalAllowanceOverride ?? basePersonalAllowance;
  const monthlyGrossEquiv  = grossPay * ppm;   // annualise to monthly for GRA ⅓-rule
  const monthlyPersonalAl  = Math.max(effectivePaMonthly, Math.round(monthlyGrossEquiv / 3));
  const personalAllowance  = Math.round(monthlyPersonalAl / ppm);

  // Chargeable income: gross − NIS − insurance − personal − child allowances
  // (insurance deducted before PAYE per GRA guidance)
  const chargeableIncome = pc.taxExempt ? 0
    : Math.max(0, grossPay - employeeNIS - healthSurcharge - personalAllowance - childAllowance);

  // PAYE bracket prorated to this pay period
  const effectiveLowerLimit =
    pc.taxLowerLimitOverride != null
      ? pc.taxLowerLimitOverride / ppm
      : Math.round(C.TAX_LOWER_LIMIT / ppm);

  const payeCalc = pc.taxExempt ? 0
    : chargeableIncome <= effectiveLowerLimit
      ? Math.round(chargeableIncome * C.TAX_LOWER_RATE)
      : Math.round(
          effectiveLowerLimit * C.TAX_LOWER_RATE +
          (chargeableIncome - effectiveLowerLimit) * C.TAX_UPPER_RATE
        );
  const paye = pc.taxOverride != null ? (pc.taxExempt ? 0 : pc.taxOverride) : payeCalc;

  // ── Voluntary deductions — stored as per-period amounts ──────────────────
  const creditUnion      = pc.creditUnion      ?? 0;
  const loanRepayment    = pc.loanRepayment    ?? 0;
  const advancesRecovery = pc.advancesRecovery ?? 0;
  const unionDues        = pc.unionDues        ?? 0;
  const otherDeductions  = (pc.otherDeductions ?? []).reduce((s, x) => s + x.amount, 0);
  const totalVoluntary   = creditUnion + loanRepayment + advancesRecovery + unionDues + otherDeductions;

  // ── Net pay ───────────────────────────────────────────────────────────────
  const totalDeductions = employeeNIS + healthSurcharge + paye + totalVoluntary;
  const netPay          = Math.round(grossPay - totalDeductions);

  return {
    employee,
    period:      periodLabel ?? `${periodStart} – ${periodEnd}`,
    periodStart,
    periodEnd,
    regularHours,
    otHours,
    phHours,
    basicPay:     Math.round(basicPay),
    otPay:        Math.round(otPay),
    phPay:        Math.round(phPay),
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
    effectiveRate,
  };
}

export function formatGYD(amount: number): string {
  return `GYD ${Math.round(amount).toLocaleString("en-GY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function generateQuickBooksCSV(results: PayrollResult[]): string {
  const headers = [
    "Employee Name", "Employee ID", "Department", "Position", "Pay Category",
    "Period Start", "Period End",
    "Regular Hours", "OT Hours", "PH Hours",
    "Hourly Rate (GYD)",
    "Basic Pay (GYD)", "OT Pay (GYD)", "PH Pay (GYD)", "Allowances (GYD)", "Gross Pay (GYD)",
    "Employee NIS (GYD)", "Hand In Hand Insurance (GYD)",
    "Personal Allowance (GYD)", "Child Allowance (GYD)", "Qualifying Children",
    "Chargeable Income (GYD)", "PAYE (GYD)",
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
    r.periodStart,
    r.periodEnd,
    r.regularHours.toFixed(2),
    r.otHours.toFixed(2),
    r.phHours.toFixed(2),
    r.effectiveRate.toFixed(2),
    r.basicPay.toFixed(2),
    r.otPay.toFixed(2),
    r.phPay.toFixed(2),
    r.allowances.toFixed(2),
    r.grossPay.toFixed(2),
    r.employeeNIS.toFixed(2),
    r.healthSurcharge.toFixed(2),
    r.personalAllowance.toFixed(2),
    r.childAllowance.toFixed(2),
    String(r.qualifyingChildren),
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

  return [headers, ...rows]
    .map((row) => row.map((v) => `"${v}"`).join(","))
    .join("\n");
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
