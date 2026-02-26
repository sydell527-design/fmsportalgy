// ── FMS Shift Detection & Rules ─────────────────────────────────────────────
// Based on FMS Timesheet Formulas & Rules documentation.
// TIME and ADDITIONAL timesheets use 6:00 AM morning start.
// FIXED and EXECUTIVE timesheets use 5:00 AM morning start.

export type ShiftType = "Morning" | "Afternoon" | "Evening" | "Night" | "Night (late)";

export interface ShiftInfo {
  name: ShiftType;
  scheduledEnd: string;   // HH:mm
  isOntimeStart: boolean; // true if checked in at the on-time morning window
}

/**
 * Determine shift name and scheduled end time from a clock-in HH:mm string.
 * @param ci      Clock-in time as "HH:mm"
 * @param earlyMorning  If true, morning shift starts at 05:00 (FIXED/EXECUTIVE).
 *                      If false, morning shift starts at 06:00 (TIME/ADDITIONAL).
 */
export function detectShift(ci: string | null | undefined, earlyMorning = false): ShiftInfo | null {
  if (!ci) return null;
  const [h, m] = ci.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const mins = h * 60 + m;

  const morningStart = earlyMorning ? 5 * 60 : 6 * 60; // 05:00 or 06:00
  const MIDNIGHT_01  = 1;           // 00:01
  const MIDNIGHT_120 = 2 * 60;      // 02:00 (inclusive)
  const MORNING_END  = 8 * 60;      // 08:00 (inclusive) — on-time morning cutoff
  const LATE_MORNING = 13 * 60 + 59;// 13:59 (inclusive) — late morning cutoff
  const AFTERNOON    = 14 * 60;     // 14:00
  const AFTERNOON_END= 17 * 60 + 59;// 17:59
  const EVENING      = 18 * 60;     // 18:00
  const EVENING_END  = 21 * 60 + 59;// 21:59
  const NIGHT        = 22 * 60;     // 22:00

  // Past-midnight late arrival (12:01 AM – 2:00 AM) → Night shift, out 07:00
  if (mins >= MIDNIGHT_01 && mins <= MIDNIGHT_120) {
    return { name: "Night (late)", scheduledEnd: "07:00", isOntimeStart: false };
  }
  // Morning on-time (05:00 or 06:00 – 08:00) → out 12:00
  if (mins >= morningStart && mins <= MORNING_END) {
    return { name: "Morning", scheduledEnd: "12:00", isOntimeStart: true };
  }
  // Morning late (08:01 – 13:59) → out 15:00
  if (mins > MORNING_END && mins <= LATE_MORNING) {
    return { name: "Morning", scheduledEnd: "15:00", isOntimeStart: false };
  }
  // Afternoon (14:00 – 17:59) → out 21:00
  if (mins >= AFTERNOON && mins <= AFTERNOON_END) {
    return { name: "Afternoon", scheduledEnd: "21:00", isOntimeStart: true };
  }
  // Evening (18:00 – 21:59) → out 00:00 (midnight)
  if (mins >= EVENING && mins <= EVENING_END) {
    return { name: "Evening", scheduledEnd: "00:00", isOntimeStart: true };
  }
  // Night (22:00 – 23:59) → out 07:00 next day
  if (mins >= NIGHT) {
    return { name: "Night", scheduledEnd: "07:00", isOntimeStart: true };
  }

  return null;
}

/**
 * Determine if a shift qualifies for a meal based on the FMS rules.
 * @param ci          Clock-in HH:mm
 * @param client      Client/Agency name
 * @param earlyMorning  If true, morning meal window starts at 05:00 (FIXED/EXECUTIVE)
 * @param hasNightMeal  If true, 22:00-23:00 shift also qualifies (TIME only)
 */
export function calcMealEntitlement(
  ci: string | null | undefined,
  client: string | null | undefined,
  earlyMorning = false,
  hasNightMeal = false,
): 0 | 1 {
  if (!ci) return 0;
  if (client === "Canteen" || client === "Head Office") return 0;

  const [h, m] = ci.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  const mins = h * 60 + m;

  const morningStart = earlyMorning ? 5 * 60 : 6 * 60;
  const morningEnd   = 7 * 60;   // 07:00 (on-time morning window inclusive end for meal)
  const aftStart     = 14 * 60;
  const aftEnd       = 15 * 60;
  const eveStart     = 18 * 60;
  const eveEnd       = 19 * 60;
  const nightStart   = 22 * 60;
  const nightEnd     = 23 * 60;

  if (mins >= morningStart && mins <= morningEnd) return 1;
  if (mins >= aftStart    && mins <= aftEnd)      return 1;
  if (mins >= eveStart    && mins <= eveEnd)      return 1;
  if (hasNightMeal && mins >= nightStart && mins <= nightEnd) return 1;

  return 0;
}

// FMS public holidays whose worked hours go to the PH bucket
export const FMS_PH_HOLIDAYS = [
  "Phagwah", "Good Friday", "Easter Monday", "Labour Day", "Christmas", "Eid ul Azha",
] as const;

export function isPHHoliday(holidayType: string | null | undefined): boolean {
  return FMS_PH_HOLIDAYS.includes(holidayType as any);
}

// Standard shift start/end templates for the schedule form
export const SHIFT_TEMPLATES = [
  { label: "Morning (06:00–14:00)", start: "06:00", end: "14:00" },
  { label: "Morning (05:00–13:00)", start: "05:00", end: "13:00" },
  { label: "Afternoon (14:00–22:00)", start: "14:00", end: "22:00" },
  { label: "Evening (18:00–00:00)", start: "18:00", end: "00:00" },
  { label: "Night (22:00–07:00)", start: "22:00", end: "07:00" },
  { label: "Day (08:00–16:00)", start: "08:00", end: "16:00" },
  { label: "Extended (06:00–18:00)", start: "06:00", end: "18:00" },
] as const;

export function shiftLabel(start: string, end: string): string {
  return `${start} – ${end}`;
}

/** Format HH:mm to 12-hour h:mm AM/PM */
export function fmt12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h)) return time;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
