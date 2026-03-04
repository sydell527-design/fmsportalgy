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

// ── Time Employee Constants ───────────────────────────────────────────────────
export const TIME_CONSTANTS = {
  MEAL_RATE: 300,
  RESPONSIBILITY_RATE: 260,
  SPECIAL_RESPONSIBILITY_LOCATIONS: [
    "Hebrews", "Romans", "Romans-2", "Globe", "Globe-12", "Neptune P1",
  ] as string[],
  RECOGNIZED_HOLIDAY_TYPES: [
    "Phagwah", "Good Friday", "Easter Monday", "Labour Day", "Christmas", "Eid ul Azha",
  ] as string[],
};

const C = PAYROLL_CONSTANTS;

// ── Risk pay table (Armed guards only) ───────────────────────────────────────
export function lookupRiskPay(armedDays: number): number {
  if (armedDays <= 0)   return 0;
  if (armedDays === 1)  return 384;
  if (armedDays === 2)  return 769;
  if (armedDays <= 4)   return 1_153;
  if (armedDays === 5)  return 1_538;
  if (armedDays === 6)  return 1_923;
  if (armedDays === 7)  return 2_307;
  if (armedDays === 8)  return 2_692;
  if (armedDays === 9)  return 3_076;
  if (armedDays === 10) return 3_461;
  if (armedDays === 11) return 3_846;
  if (armedDays === 12) return 4_239;
  if (armedDays === 13) return 4_615;
  return 5_000; // 14+
}

// ── Pay frequency helpers ─────────────────────────────────────────────────────
export function freqPpm(freq: string): number {
  if (freq === "weekly")    return 52 / 12;
  if (freq === "biweekly")  return 26 / 12;
  if (freq === "monthly")   return 1;
  return 2; // bimonthly (default)
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
  if (child.taxEligible === false) return false;
  const age = differenceInYears(new Date(), parseISO(child.dob));
  if (age < 18) return true;
  if (age <= 25 && child.school) return true;
  return false;
}

// ── Date range helpers ────────────────────────────────────────────────────────
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

// ── Time employee: weekly 40-hr cap redistribution ───────────────────────────
interface TimeDistResult {
  reg: number;
  ot: number;
  ph: number;
  mealsCount: number;
  armedDays: number;
  responsibilityDays: number;
}

function redistributeTimeHours(approvedTs: Timesheet[], carryForwardHours: number, employeeArmed?: string | null): TimeDistResult {
  const sorted = [...approvedTs].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  let weeklyBefore = carryForwardHours;
  let totalReg = 0, totalOT = 0, totalPH = 0;
  let mealsCount = 0, armedDays = 0, responsibilityDays = 0;

  for (const ts of sorted) {
    if (!ts.date) continue;
    const dow = new Date(ts.date + "T00:00:00").getDay(); // 0=Sun

    if (dow === 0) weeklyBefore = 0; // new week — reset cap

    const rawHours  = (ts.reg ?? 0) + (ts.ot ?? 0) + (ts.ph ?? 0);
    const dayStatus = ts.dayStatus ?? "On Day";
    const holType   = ts.holidayType ?? "";

    let dayReg = 0, dayOT = 0, dayPH = 0, weekContrib = 0;

    if (dayStatus === "Annual Leave") {
      dayReg = 8; weekContrib = 8;
    } else if (dayStatus === "Off Day") {
      dayOT = rawHours; // all OT; Off Day does NOT count toward weekly cap
    } else if (dayStatus === "Sick" || dayStatus === "Absent") {
      // no hours, no pay
    } else if (dayStatus === "Holiday") {
      if (TIME_CONSTANTS.RECOGNIZED_HOLIDAY_TYPES.includes(holType)) {
        dayPH = rawHours; weekContrib = rawHours; // holiday hours count toward weekly cap
      } else {
        dayOT = rawHours; // "Holiday Double" → all OT, does not count toward cap
      }
    } else {
      // On Day: daily 8-hr cap + weekly 40-hr cap (Guyana Labour Law)
      const weeklyAvail = Math.max(0, 40 - weeklyBefore);
      const origReg     = Math.min(rawHours, 8);
      const dailyOT     = Math.max(0, rawHours - 8);
      const weeklyOTAdj = Math.max(0, origReg - weeklyAvail);
      dayReg = origReg - weeklyOTAdj;
      dayOT  = dailyOT + weeklyOTAdj;
      weekContrib = dayReg;
    }

    weeklyBefore += weekContrib;
    totalReg += dayReg;
    totalOT  += dayOT;
    totalPH  += dayPH;

    // ── Meals eligibility ──────────────────────────────────────────────────
    const client = (ts.client ?? "").trim();
    const notExcluded = !["Canteen", "Head Office"].includes(client);
    if (notExcluded && rawHours > 0 && ts.ci) {
      const parts = (ts.ci as string).split(":");
      const minOfDay = Number(parts[0]) * 60 + Number(parts[1] ?? 0);
      if (
        (minOfDay >= 360  && minOfDay <= 420)  || // 06:00–07:00 inclusive
        (minOfDay >= 840  && minOfDay <= 900)  || // 14:00–15:00 inclusive
        (minOfDay >= 1080 && minOfDay <= 1140) || // 18:00–19:00 inclusive
        (minOfDay >= 1320 && minOfDay <= 1380)    // 22:00–23:00 inclusive
      ) mealsCount++;
    }

    // ── Armed days (risk pay) ──────────────────────────────────────────────
    if ((ts.armed ?? employeeArmed) === "Armed" && rawHours > 0) armedDays++;

    // ── Responsibility days (special locations) ────────────────────────────
    const post = (ts.post ?? "").trim();
    if (notExcluded && rawHours > 0 && TIME_CONSTANTS.SPECIAL_RESPONSIBILITY_LOCATIONS.some(
      (loc) => post.toLowerCase().includes(loc.toLowerCase()),
    )) responsibilityDays++;
  }

  return { reg: totalReg, ot: totalOT, ph: totalPH, mealsCount, armedDays, responsibilityDays };
}

// ── PayrollResult ─────────────────────────────────────────────────────────────
export interface PayrollResult {
  employee: User;
  period: string;
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

  // Time employee extras (undefined for Fixed/Executive)
  isTimeEmployee?: boolean;
  mealsPay?: number;
  responsibilitiesPay?: number;
  riskPay?: number;
  mealsCount?: number;
  responsibilityDays?: number;
  armedDays?: number;
  carryForwardHours?: number;

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

  // Derived
  effectiveRate: number;
}

export function calcPayroll(
  employee: User,
  timesheets: Timesheet[],
  periodStart: string,
  periodEnd: string,
  allChildren: EmployeeChild[] = [],
  periodLabel?: string,
  companyPersonalAllowance?: number,
  carryForwardTimesheets?: Timesheet[],   // previous-period timesheets for weekly CF calculation
): PayrollResult {
  const pc: PayConfig = employee.payConfig ?? ({} as PayConfig);
  const isTimeEmployee = employee.cat === "Time";

  // ── Filter timesheets to this period ──────────────────────────────────────
  const periodTs = timesheets.filter(
    (ts) =>
      ts.eid === employee.userId &&
      ts.date != null &&
      ts.date >= periodStart &&
      ts.date <= periodEnd,
  );
  const approvedTs = periodTs.filter((ts) => ts.status === "approved");
  const approvedTimesheets = approvedTs.length;
  const pendingTimesheets  = periodTs.filter(
    (ts) =>
      ts.status === "pending_first_approval" ||
      ts.status === "pending_second_approval" ||
      ts.status === "pending_employee",
  ).length;

  // ── Pay frequency ─────────────────────────────────────────────────────────
  const freq         = pc.frequency ?? "bimonthly";
  const ppm          = freqPpm(freq);
  const hrsPerPeriod = freqHrsPerPeriod(freq);

  // ── Effective hourly rate ─────────────────────────────────────────────────
  let effectiveRate = employee.hourlyRate ?? 0;
  if (effectiveRate === 0 && (employee.salary ?? 0) > 0) {
    effectiveRate = (employee.salary ?? 0) / (hrsPerPeriod * ppm);
  }

  // ── Hours — Time employees get weekly-cap redistribution; others sum stored values ──
  let regularHours: number, otHours: number, phHours: number;
  let mealsCount = 0, armedDays = 0, responsibilityDays = 0;
  let carryForwardHours = 0;

  if (isTimeEmployee) {
    // Compute carry-forward from the partial week before periodStart
    const pdStartDate     = new Date(periodStart + "T00:00:00");
    const dayOfWeekStart  = pdStartDate.getDay();
    if (dayOfWeekStart > 0 && carryForwardTimesheets && carryForwardTimesheets.length > 0) {
      const prevSun = new Date(pdStartDate);
      prevSun.setDate(prevSun.getDate() - dayOfWeekStart);
      const prevSunStr = prevSun.toISOString().slice(0, 10);
      const cfApproved = carryForwardTimesheets.filter(
        (ts) =>
          ts.eid === employee.userId &&
          ts.status === "approved" &&
          ts.date != null &&
          ts.date >= prevSunStr &&
          ts.date < periodStart,
      );
      // Use stored reg + ph from those timesheets as the carry-forward (daily cap was applied at clock-out)
      carryForwardHours = cfApproved.reduce((s, ts) => s + (ts.reg ?? 0) + (ts.ph ?? 0), 0);
    }

    const dist = redistributeTimeHours(approvedTs, carryForwardHours, employee.armed);
    regularHours      = dist.reg;
    otHours           = dist.ot;
    phHours           = dist.ph;
    mealsCount        = dist.mealsCount;
    armedDays         = dist.armedDays;
    responsibilityDays = dist.responsibilityDays;
  } else {
    regularHours = approvedTs.reduce((s, ts) => s + (ts.reg ?? 0), 0);
    otHours      = approvedTs.reduce((s, ts) => s + (ts.ot ?? 0), 0);
    phHours      = approvedTs.reduce((s, ts) => s + (ts.ph ?? 0), 0);
  }

  // ── Earnings ──────────────────────────────────────────────────────────────
  const otMultiplier = pc.otMultiplier ?? C.OT_MULTIPLIER_DEFAULT;
  const phMultiplier = pc.phMultiplier ?? C.PH_MULTIPLIER_DEFAULT;

  const basicPay = regularHours * effectiveRate;
  const otPay    = otHours      * effectiveRate * otMultiplier;
  const phPay    = phHours      * effectiveRate * phMultiplier;

  // For Time employees: riskAllowance and mealAllowance are computed dynamically;
  // exclude them from the PayConfig-based allowances sum.
  const monthlyAllowances =
    (pc.housingAllowance   ?? 0) +
    (pc.transportAllowance ?? 0) +
    (isTimeEmployee ? 0 : (pc.mealAllowance  ?? 0)) +
    (pc.uniformAllowance   ?? 0) +
    (isTimeEmployee ? 0 : (pc.riskAllowance  ?? 0)) +
    (pc.shiftAllowance     ?? 0) +
    (pc.otherAllowances ?? []).reduce((s, x) => s + x.amount, 0);
  const allowances = Math.round(monthlyAllowances / ppm);

  // Time-specific computed earnings
  const mealsPay           = isTimeEmployee ? Math.round(mealsCount        * TIME_CONSTANTS.MEAL_RATE)        : 0;
  const responsibilitiesPay = isTimeEmployee ? Math.round(responsibilityDays * TIME_CONSTANTS.RESPONSIBILITY_RATE) : 0;
  const riskPay             = isTimeEmployee ? lookupRiskPay(armedDays) : 0;

  const grossPay = basicPay + otPay + phPay + allowances + mealsPay + responsibilitiesPay + riskPay;

  // ── NIS ───────────────────────────────────────────────────────────────────
  const dob = (employee as any).dob as string | null | undefined;
  const ageExemptFromNIS = dob
    ? (() => {
        const birth = new Date(dob + "T00:00");
        const ref   = new Date(periodStart + "T00:00");
        let age = ref.getFullYear() - birth.getFullYear();
        const m = ref.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
        return age >= 60;
      })()
    : false;
  const effectiveNisExempt  = pc.nisExempt || ageExemptFromNIS;
  const effectiveNisCeiling = (pc.nisCeilingOverride ?? C.NIS_CEILING_MONTHLY) / ppm;
  const nisBase         = Math.min(grossPay, effectiveNisCeiling);
  const employeeNISCalc = effectiveNisExempt ? 0 : Math.round(nisBase * C.NIS_EMP_RATE);
  const employeeNIS     = pc.nisEmployeeOverride != null ? pc.nisEmployeeOverride : employeeNISCalc;
  const employerNISCalc = effectiveNisExempt ? 0 : Math.round(nisBase * C.NIS_ER_RATE);
  const employerNIS     = pc.nisEmployerOverride != null ? pc.nisEmployerOverride : employerNISCalc;

  // ── Health Surcharge ──────────────────────────────────────────────────────
  const hsMonthlyFlat = pc.healthSurchargeRate === "half"
    ? C.HEALTH_SURCHARGE_HALF
    : C.HEALTH_SURCHARGE_FULL;
  const healthSurchargeCalc = pc.healthSurchargeExempt ? 0 : Math.round(hsMonthlyFlat / ppm);
  const healthSurcharge =
    pc.healthSurchargeRate === "custom" && pc.healthSurchargeOverride != null
      ? pc.healthSurchargeExempt ? 0 : pc.healthSurchargeOverride
      : healthSurchargeCalc;

  // ── PAYE ──────────────────────────────────────────────────────────────────
  const empChildren        = allChildren.filter((ch) => ch.eid === employee.userId);
  const qualifyingChildren = empChildren.filter(isQualifyingChild).length;
  const childAllowance     = Math.round((qualifyingChildren * C.CHILD_ALLOWANCE) / ppm);

  const basePersonalAllowance = companyPersonalAllowance ?? C.PERSONAL_ALLOWANCE;
  const effectivePaMonthly = pc.personalAllowanceOverride ?? basePersonalAllowance;
  const monthlyGrossEquiv  = grossPay * ppm;
  const monthlyPersonalAl  = Math.max(effectivePaMonthly, Math.round(monthlyGrossEquiv / 3));
  const personalAllowance  = Math.round(monthlyPersonalAl / ppm);

  const chargeableIncome = pc.taxExempt ? 0
    : Math.max(0, grossPay - employeeNIS - healthSurcharge - personalAllowance - childAllowance);

  const effectiveLowerLimit =
    pc.taxLowerLimitOverride != null
      ? pc.taxLowerLimitOverride / ppm
      : Math.round(C.TAX_LOWER_LIMIT / ppm);

  const payeCalc = pc.taxExempt ? 0
    : chargeableIncome <= effectiveLowerLimit
      ? Math.round(chargeableIncome * C.TAX_LOWER_RATE)
      : Math.round(
          effectiveLowerLimit * C.TAX_LOWER_RATE +
          (chargeableIncome - effectiveLowerLimit) * C.TAX_UPPER_RATE,
        );
  const paye = pc.taxOverride != null ? (pc.taxExempt ? 0 : pc.taxOverride) : payeCalc;

  // ── Voluntary deductions ──────────────────────────────────────────────────
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
    isTimeEmployee,
    mealsPay:           isTimeEmployee ? Math.round(mealsPay)            : undefined,
    responsibilitiesPay: isTimeEmployee ? Math.round(responsibilitiesPay) : undefined,
    riskPay:             isTimeEmployee ? riskPay                         : undefined,
    mealsCount:          isTimeEmployee ? mealsCount                      : undefined,
    responsibilityDays:  isTimeEmployee ? responsibilityDays              : undefined,
    armedDays:           isTimeEmployee ? armedDays                       : undefined,
    carryForwardHours:   isTimeEmployee ? carryForwardHours               : undefined,
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
    "Basic Pay (GYD)", "OT Pay (GYD)", "PH Pay (GYD)",
    "Meals Pay (GYD)", "Responsibilities Pay (GYD)", "Risk Pay (GYD)",
    "Meals Count", "Responsibility Days", "Armed Days", "Carry Forward Hrs",
    "Allowances (GYD)", "Gross Pay (GYD)",
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
    (r.mealsPay ?? 0).toFixed(2),
    (r.responsibilitiesPay ?? 0).toFixed(2),
    (r.riskPay ?? 0).toFixed(2),
    String(r.mealsCount ?? ""),
    String(r.responsibilityDays ?? ""),
    String(r.armedDays ?? ""),
    String(r.carryForwardHours ?? ""),
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
