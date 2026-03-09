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
  // Statutory public holidays (New Year's, Republic Day, Labour Day, etc.) = time-and-a-half
  PH_MULTIPLIER_DEFAULT: 1.5,
  // "Holiday Double" — employer-designated double-pay days = 2×
  HD_MULTIPLIER_DEFAULT: 2.0,
};

// ── Time Employee Constants ───────────────────────────────────────────────────
export const TIME_CONSTANTS = {
  MEAL_RATE: 300,
  RESPONSIBILITY_RATE: 260,
  SPECIAL_RESPONSIBILITY_LOCATIONS: [
    "Hebrews", "Romans", "Romans-2", "Globe", "Globe-12", "Neptune P1",
  ] as string[],
  RECOGNIZED_HOLIDAY_TYPES: [
    "New Year's Day", "Republic Day", "Phagwah", "Good Friday", "Easter Monday",
    "Labour Day", "Arrival Day", "Independence Day", "Eid al-Adha", "Eid ul Adha",
    "Eid ul Azha", "CARICOM Day", "Emancipation Day", "Youman Nabi",
    "Deepavali", "Christmas Day", "Boxing Day", "Christmas",
  ] as string[],
};

// ── Guyana Public Holiday Engine ─────────────────────────────────────────────
// Fixed holidays are exact for any year. Easter (Good Friday / Easter Monday)
// is calculated via the Anonymous Gregorian algorithm — 100 % accurate.
// CARICOM Day (first Monday of July) is calculated for any year.
// Eid al-Adha (10 Dhul Hijja) and Youman Nabi (12 Rabi al-Awwal) are computed
// using the Tabular (Kuwaiti) Islamic Calendar — accurate to ±1–2 days vs the
// observed crescent moon used by Guyana authorities; official dates for 2024–2028
// are applied as verified overrides sourced from publicholidays.gy and
// officeholidays.com.
// Phagwah (Holi) and Deepavali follow the Hindu lunisolar calendar; a verified
// table covers 2024–2029 (from the same official sources); beyond that the
// system marks the holiday as absent — an admin should set dayStatus manually
// once the GoG announces the date each year.

function _p2(n: number): string { return String(n).padStart(2, "0"); }

/**
 * Anonymous / Spencer Jones Gregorian Easter algorithm.
 * Returns [month, day] (1-indexed) for Easter Sunday — exact for any year.
 */
function _calcEaster(y: number): [number, number] {
  const a = y % 19;
  const b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** Returns the day-of-month of the first Monday in a given month + year. */
function _firstMondayOfMonth(year: number, month: number): number {
  const dow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return 1 + ((8 - dow) % 7);
}

/**
 * Tabular Islamic Calendar — Kuwaiti algorithm.
 * Converts a Hijri date (yh, mh, dh) to a Julian Day Number.
 * Accuracy: ±1–2 days vs actual observed crescent (moon-sighting) dates.
 */
function _hijriToJDN(yh: number, mh: number, dh: number): number {
  return (
    Math.floor((11 * yh + 3) / 30) +
    354 * yh +
    30 * mh -
    Math.floor((mh - 1) / 2) +
    dh +
    1948440 -
    385
  );
}

/** Converts a Julian Day Number to [year, month, day] (Gregorian). */
function _jdnToGregorian(jdn: number): [number, number, number] {
  const l   = jdn + 68569;
  const n   = Math.floor((4 * l) / 146097);
  const ll  = l - Math.floor((146097 * n + 3) / 4);
  const i   = Math.floor((4000 * (ll + 1)) / 1461001);
  const lll = ll - Math.floor((1461 * i) / 4) + 31;
  const j   = Math.floor((80 * lll) / 2447);
  const day   = lll - Math.floor((2447 * j) / 80);
  const month = j + 2 - 12 * Math.floor(j / 11);
  const year  = 100 * (n - 49) + i + Math.floor(j / 11);
  return [year, month, day];
}

/**
 * Returns the range of Hijri years that can overlap with a given Gregorian year.
 * One Gregorian year can contain fragments of up to two Hijri years.
 */
function _approxHijriYears(gYear: number): number[] {
  const h = Math.floor(((gYear - 622) * 36525) / 35426);
  return [h - 1, h, h + 1, h + 2];
}

// ── Verified override tables (sourced from publicholidays.gy + officeholidays.com) ──
// These exact dates were published / confirmed by the GoG; they take priority
// over the tabular-calendar calculation for the years listed.

/** Eid al-Adha (10 Dhul Hijja) — verified Guyana dates. */
const _EID_ADHA_OVERRIDES: Record<number, [number, number]> = {
  2024: [6, 17],
  2025: [6,  6],
  2026: [5, 27],
  2027: [5, 17],
  2028: [5,  5],
};

/** Youman Nabi (12 Rabi al-Awwal) — verified Guyana dates. */
const _YOUMAN_NABI_OVERRIDES: Record<number, [number, number]> = {
  2024: [9, 16],
  2025: [9,  5],
  2026: [8, 24],
  2027: [8, 15],
};

/**
 * Phagwah (Holi) — full moon of Phalguna (Hindu lunisolar calendar).
 * Verified from publicholidays.gy and officeholidays.com.
 * Years beyond the table: GoG announces dates annually; set dayStatus manually.
 */
const _PHAGWAH_TABLE: Record<number, [number, number]> = {
  2024: [3, 25],
  2025: [3, 14],
  2026: [3,  3],
  2027: [3, 22],
  2028: [3, 11],
  2029: [3,  1],
};

/**
 * Deepavali (Diwali) — 15th day of Kartika (Hindu lunisolar calendar).
 * Verified from publicholidays.gy and officeholidays.com.
 */
const _DEEPAVALI_TABLE: Record<number, [number, number]> = {
  2024: [11,  1],
  2025: [10, 20],
  2026: [11,  8],
  2027: [10, 28],
  2028: [11, 17],
  2029: [11,  5],
};

// Per-year cache so we don't recompute on every keypress.
const _holidayCache: Map<number, Record<string, string>> = new Map();

/**
 * Returns all Guyana public holidays for any Gregorian year as a
 * `{ "YYYY-MM-DD": "Holiday Name" }` map.
 *
 * Fixed holidays  — exact for every year.
 * Easter          — mathematically exact (Anonymous Gregorian algorithm).
 * CARICOM Day     — first Monday of July — mathematically exact.
 * Eid al-Adha     — verified table 2024–2028; Tabular Islamic Calendar for other years (±1–2 d).
 * Youman Nabi     — verified table 2024–2028; Tabular Islamic Calendar for other years (±1–2 d).
 * Phagwah         — verified table 2024–2029; not auto-detected for later years.
 * Deepavali       — verified table 2024–2029; not auto-detected for later years.
 */
export function getGuyanaHolidaysForYear(year: number): Record<string, string> {
  if (_holidayCache.has(year)) return _holidayCache.get(year)!;

  const y = String(year);
  const h: Record<string, string> = {};

  const add = (month: number, day: number, name: string) => {
    h[`${y}-${_p2(month)}-${_p2(day)}`] = name;
  };

  // ── Fixed statutory holidays (same date every year) ──────────────────────
  add(1,  1,  "New Year's Day");
  add(2,  23, "Republic Day");
  add(5,  1,  "Labour Day");
  add(5,  5,  "Arrival Day");
  add(5,  26, "Independence Day");
  add(8,  1,  "Emancipation Day");
  add(12, 25, "Christmas Day");
  add(12, 26, "Boxing Day");

  // ── Easter — mathematically exact ────────────────────────────────────────
  const [em, ed] = _calcEaster(year);
  const easter = new Date(year, em - 1, ed);
  const gfDate = new Date(easter); gfDate.setDate(easter.getDate() - 2);
  const emDate = new Date(easter); emDate.setDate(easter.getDate() + 1);
  add(gfDate.getMonth() + 1, gfDate.getDate(), "Good Friday");
  add(emDate.getMonth() + 1, emDate.getDate(), "Easter Monday");

  // ── CARICOM Day — first Monday of July (calculable for any year) ─────────
  add(7, _firstMondayOfMonth(year, 7), "CARICOM Day");

  // ── Eid al-Adha — 10 Dhul Hijja ──────────────────────────────────────────
  if (_EID_ADHA_OVERRIDES[year]) {
    const [m, d] = _EID_ADHA_OVERRIDES[year];
    add(m, d, "Eid al-Adha");
  } else {
    for (const hy of _approxHijriYears(year)) {
      const [gy, gm, gd] = _jdnToGregorian(_hijriToJDN(hy, 12, 10));
      if (gy === year) { add(gm, gd, "Eid al-Adha"); break; }
    }
  }

  // ── Youman Nabi — 12 Rabi al-Awwal ───────────────────────────────────────
  if (_YOUMAN_NABI_OVERRIDES[year]) {
    const [m, d] = _YOUMAN_NABI_OVERRIDES[year];
    add(m, d, "Youman Nabi");
  } else {
    for (const hy of _approxHijriYears(year)) {
      const [gy, gm, gd] = _jdnToGregorian(_hijriToJDN(hy, 3, 12));
      if (gy === year) { add(gm, gd, "Youman Nabi"); break; }
    }
  }

  // ── Phagwah (Holi) ───────────────────────────────────────────────────────
  if (_PHAGWAH_TABLE[year]) {
    const [m, d] = _PHAGWAH_TABLE[year];
    add(m, d, "Phagwah");
  }

  // ── Deepavali ─────────────────────────────────────────────────────────────
  if (_DEEPAVALI_TABLE[year]) {
    const [m, d] = _DEEPAVALI_TABLE[year];
    add(m, d, "Deepavali");
  }

  _holidayCache.set(year, h);
  return h;
}

/** Returns the Guyana holiday name for a given YYYY-MM-DD date, or null. */
export function lookupGuyanaHoliday(dateStr: string): string | null {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!year || isNaN(year)) return null;
  return getGuyanaHolidaysForYear(year)[dateStr] ?? null;
}

/** Back-compat: flat map of all holidays for a multi-year range (used by legacy callers). */
export function buildHolidayMap(fromYear: number, toYear: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let y = fromYear; y <= toYear; y++) {
    Object.assign(out, getGuyanaHolidaysForYear(y));
  }
  return out;
}

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
  hd: number; // Holiday Double (2×) — employer-designated double-pay days
  mealsCount: number;
  armedDays: number;       // Actual days physically worked while Armed (for display)
  armedMissedDays: number; // Sick/Absent/Annual-Leave days for Armed employees (for risk-pay table)
  responsibilityDays: number;
}

function redistributeTimeHours(approvedTs: Timesheet[], carryForwardHours: number, employeeArmed?: string | null, periodStdHours = 0): TimeDistResult {
  const sorted = [...approvedTs].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  // Pre-build a holiday map covering all years in this batch so we can auto-detect
  // the holiday type for any row where holidayType was not explicitly stored.
  const years = new Set(sorted.map((ts) => ts.date ? new Date(ts.date + "T00:00").getFullYear() : 0));
  years.delete(0);
  const calendarMap: Record<string, string> = {};
  for (const y of years) Object.assign(calendarMap, getGuyanaHolidaysForYear(y));

  let weeklyBefore = carryForwardHours;
  let totalReg = 0, totalOT = 0, totalPH = 0, totalHD = 0;
  let mealsCount = 0, armedDays = 0, armedMissedDays = 0, responsibilityDays = 0;
  // Per-date dedup sets — meals/armed/responsibility are counted once per calendar day
  const mealDates        = new Set<string>();
  const armedDates       = new Set<string>();
  const missedArmedDates = new Set<string>(); // Sick/Absent/AL dates for Armed employees
  const respDates        = new Set<string>();

  for (const ts of sorted) {
    if (!ts.date) continue;
    const dow = new Date(ts.date + "T00:00:00").getDay(); // 0=Sun

    if (dow === 0) weeklyBefore = 0; // new week — reset cap

    const rawHours  = (ts.reg ?? 0) + (ts.ot ?? 0) + (ts.ph ?? 0);
    const dayStatus = ts.dayStatus ?? "On Day";
    // If holidayType is missing, fall back to calendar lookup before defaulting
    const storedType = ts.holidayType ?? "";
    const holType = storedType || (dayStatus === "Holiday" ? (calendarMap[ts.date] ?? "") : "");

    let dayReg = 0, dayOT = 0, dayPH = 0, dayHD = 0, weekContrib = 0;

    if (dayStatus === "Annual Leave") {
      dayReg = 8; weekContrib = 8;
    } else if (dayStatus === "Sick") {
      // Person did not work — no pay, no contribution to the weekly 40-hr cap.
    } else if (dayStatus === "Off Day") {
      dayOT = rawHours; // all OT; Off Day does NOT count toward weekly cap
    } else if (dayStatus === "Absent") {
      // No-show / AWOL — no pay, no cap contribution
    } else if (dayStatus === "Holiday") {
      if (holType === "Holiday Double") {
        // Employer-designated double-pay day (2×); does NOT count toward weekly cap
        dayHD = rawHours;
      } else if (TIME_CONSTANTS.RECOGNIZED_HOLIDAY_TYPES.includes(holType)) {
        // Statutory public holiday (1.5×); counts toward weekly cap
        dayPH = rawHours; weekContrib = rawHours;
      } else {
        // Genuinely unknown — treat as Holiday Double (cannot silently underpay)
        dayHD = rawHours;
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
    totalHD  += dayHD;

    // ── Meals eligibility (once per calendar date) ────────────────────────
    const client = (ts.client ?? "").trim();
    const notExcluded = !["Canteen", "Head Office"].includes(client);
    if (notExcluded && rawHours > 0 && ts.ci && !mealDates.has(ts.date)) {
      const parts = (ts.ci as string).split(":");
      const minOfDay = Number(parts[0]) * 60 + Number(parts[1] ?? 0);
      if (
        (minOfDay >= 360  && minOfDay <= 420)  || // 06:00–07:00 inclusive
        (minOfDay >= 840  && minOfDay <= 900)  || // 14:00–15:00 inclusive
        (minOfDay >= 1080 && minOfDay <= 1140) || // 18:00–19:00 inclusive
        (minOfDay >= 1320 && minOfDay <= 1380)    // 22:00–23:00 inclusive
      ) { mealsCount++; mealDates.add(ts.date); }
    }

    // ── Armed days — once per calendar date, only for days physically worked ─
    // Sick, Absent, and Annual Leave do not count toward armed day display.
    const isPhysicallyWorked = dayStatus !== "Sick" && dayStatus !== "Absent" && dayStatus !== "Annual Leave";
    const isArmed = (ts.armed ?? employeeArmed) === "Armed";
    if (isArmed && rawHours > 0 && isPhysicallyWorked && !armedDates.has(ts.date)) {
      armedDays++;
      armedDates.add(ts.date);
    }
    // Track missed days for risk-pay table input (14 - missedDays → lookupRiskPay).
    // Off Days are NOT missed — they are scheduled rest.
    //
    // For Sick days, the note distinguishes two cases:
    //   • Notes contain "sick leave" or "sickleave" (case-insensitive)
    //     → employee has a medical certificate → does NOT reduce risk pay
    //   • Any other sick entry ("sick", "report sick", etc.)
    //     → no medical certificate → DOES reduce risk pay (counts as missed)
    const noteLC = (ts.notes ?? "").toLowerCase().trim();
    const hasMedCert = dayStatus === "Sick" &&
      (noteLC.includes("sick leave") || noteLC.includes("sickleave"));
    const countsAsMissed = !isPhysicallyWorked && !hasMedCert;

    if (isArmed && countsAsMissed && !missedArmedDates.has(ts.date)) {
      armedMissedDays++;
      missedArmedDates.add(ts.date);
    }

    // ── Responsibility days — once per calendar date ───────────────────────
    const post = (ts.post ?? "").trim();
    if (notExcluded && rawHours > 0 && !respDates.has(ts.date) && TIME_CONSTANTS.SPECIAL_RESPONSIBILITY_LOCATIONS.some(
      (loc) => post.toLowerCase().includes(loc.toLowerCase()),
    )) { responsibilityDays++; respDates.add(ts.date); }
  }

  // ── Period-level cap: ensure regular hours never exceed the standard hours ──
  // e.g. bimonthly = 80 hrs (2 × 40). The rolling weekly cap alone can allow
  // more than 80 reg when the pay period spans parts of 3 calendar weeks and
  // no single week hits the 40-hr limit. Any excess above the period standard
  // is reclassified as overtime.
  if (periodStdHours > 0 && totalReg > periodStdHours) {
    const excess = Math.round((totalReg - periodStdHours) * 100) / 100;
    totalReg -= excess;
    totalOT  += excess;
  }

  return { reg: totalReg, ot: totalOT, ph: totalPH, hd: totalHD, mealsCount, armedDays, armedMissedDays, responsibilityDays };
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
  phHours: number;  // Statutory public holiday hours (1.5×)
  hdHours: number;  // Holiday Double hours (2×)

  // Earnings
  basicPay: number;
  otPay: number;
  phPay: number;    // Statutory PH pay (1.5×)
  hdPay: number;    // Holiday Double pay (2×)
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

export interface PeriodDeductionOverride {
  advancesRecovery: number;
  otherDeductions: Array<{ name: string; amount: number }>;
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
  periodDeductionOverride?: PeriodDeductionOverride,  // one-time period-specific deductions
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
  let regularHours: number, otHours: number, phHours: number, hdHours: number;
  let mealsCount = 0, armedDays = 0, responsibilityDays = 0;
  let riskTableInput = 0; // Input to lookupRiskPay: 14 - missedDays (not raw armedDays)
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
      // Use stored reg + ph from those timesheets as the carry-forward.
      // Annual Leave counts as 8 reg hours (it is paid and occupies that week slot).
      // Sick days are not worked — they contribute 0 to the cap.
      carryForwardHours = cfApproved.reduce((s, ts) => {
        if (ts.dayStatus === "Annual Leave") return s + 8;
        return s + (ts.reg ?? 0) + (ts.ph ?? 0);
      }, 0);
    }

    const dist = redistributeTimeHours(approvedTs, carryForwardHours, employee.armed, hrsPerPeriod);
    regularHours      = dist.reg;
    otHours           = dist.ot;
    phHours           = dist.ph;
    hdHours           = dist.hd;
    mealsCount        = dist.mealsCount;
    armedDays         = dist.armedDays;
    responsibilityDays = dist.responsibilityDays;
    // Risk-pay table input: 14 - missed days. 0 missed → 14 → GYD 5,000 (full period).
    // Off Days are NOT missed — only Sick/Absent/Annual Leave reduce the count.
    // Guard: only give risk pay when the employee actually has Armed shifts in this period.
    const hasArmedActivity = armedDays > 0 || dist.armedMissedDays > 0;
    riskTableInput    = hasArmedActivity ? Math.max(0, 14 - dist.armedMissedDays) : 0;
  } else {
    // For non-Time employees we read stored field values, but must separate
    // Holiday Double (stored in ts.ot by ClockInOut) from regular overtime.
    regularHours = approvedTs.reduce((s, ts) => s + (ts.reg ?? 0), 0);
    hdHours = approvedTs.reduce((s, ts) =>
      ts.dayStatus === "Holiday" && ts.holidayType === "Holiday Double"
        ? s + (ts.ot ?? 0) + (ts.ph ?? 0)
        : s, 0);
    otHours = approvedTs.reduce((s, ts) =>
      ts.dayStatus === "Holiday" && ts.holidayType === "Holiday Double"
        ? s
        : s + (ts.ot ?? 0), 0);
    phHours = approvedTs.reduce((s, ts) =>
      ts.dayStatus === "Holiday" && ts.holidayType === "Holiday Double"
        ? s
        : s + (ts.ph ?? 0), 0);
  }

  // ── Earnings ──────────────────────────────────────────────────────────────
  const otMultiplier = pc.otMultiplier ?? C.OT_MULTIPLIER_DEFAULT;
  const phMultiplier = pc.phMultiplier ?? C.PH_MULTIPLIER_DEFAULT;
  const hdMultiplier = (pc as any).hdMultiplier ?? C.HD_MULTIPLIER_DEFAULT;

  const basicPay = regularHours * effectiveRate;
  const otPay    = otHours      * effectiveRate * otMultiplier;
  const phPay    = phHours      * effectiveRate * phMultiplier;
  const hdPay    = hdHours      * effectiveRate * hdMultiplier;

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
  const riskPay             = isTimeEmployee ? lookupRiskPay(riskTableInput) : 0;

  const grossPay = basicPay + otPay + phPay + hdPay + allowances + mealsPay + responsibilitiesPay + riskPay;

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
  // Standing deductions (from pay_config — apply every period)
  const creditUnion      = pc.creditUnion   ?? 0;
  const loanRepayment    = pc.loanRepayment ?? 0;
  const unionDues        = pc.unionDues     ?? 0;
  // One-time deductions: use period-specific override if supplied, otherwise fall back to pay_config
  const advancesRecovery = periodDeductionOverride != null
    ? periodDeductionOverride.advancesRecovery
    : (pc.advancesRecovery ?? 0);
  const otherDeductions  = periodDeductionOverride != null
    ? periodDeductionOverride.otherDeductions.reduce((s, x) => s + x.amount, 0)
    : (pc.otherDeductions ?? []).reduce((s, x) => s + x.amount, 0);
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
    hdHours,
    basicPay:     Math.round(basicPay),
    otPay:        Math.round(otPay),
    phPay:        Math.round(phPay),
    hdPay:        Math.round(hdPay),
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
    "Regular Hours", "OT Hours", "PH Hours", "HD Hours",
    "Hourly Rate (GYD)",
    "Basic Pay (GYD)", "OT Pay (GYD)", "PH Pay (GYD)", "HD Pay (GYD)",
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
    r.hdHours.toFixed(2),
    r.effectiveRate.toFixed(2),
    r.basicPay.toFixed(2),
    r.otPay.toFixed(2),
    r.phPay.toFixed(2),
    r.hdPay.toFixed(2),
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
