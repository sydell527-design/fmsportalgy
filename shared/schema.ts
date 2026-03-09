import { pgTable, text, serial, integer, boolean, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  dept: text("dept").notNull(),
  pos: text("pos").notNull(),
  cat: text("cat").notNull(),
  hourlyRate: doublePrecision("hourly_rate").notNull().default(0),
  salary: integer("salary").notNull().default(0),
  fa: text("fa"),
  sa: text("sa"),
  email: text("email"),
  phone: text("phone"),
  status: text("status").notNull().default("active"),
  fpc: boolean("fpc").notNull().default(true),
  joined: text("joined"),
  dob: text("dob"),
  geo: jsonb("geo").$type<string[]>(),
  av: text("av"),
  mobility: text("mobility").notNull().default("fixed"),
  armed: text("armed").notNull().default("Unarmed"),
  payConfig: jsonb("pay_config").$type<PayConfig>(),
  tin: text("tin"),
  nisNumber: text("nis_number"),
  bankAccountNumber: text("bank_account_number"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  graFilingReference: text("gra_filing_reference"),
  taxCode: text("tax_code"),
});

export interface PayConfig {
  frequency: "weekly" | "biweekly" | "monthly" | "bimonthly";
  otMultiplier: number;
  phMultiplier: number;
  housingAllowance: number;
  transportAllowance: number;
  mealAllowance: number;
  uniformAllowance: number;
  riskAllowance: number;
  shiftAllowance: number;
  otherAllowances: Array<{ name: string; amount: number }>;
  nisExempt: boolean;
  nisEmployeeOverride?: number;
  nisEmployerOverride?: number;
  taxExempt: boolean;
  taxOverride?: number;
  healthSurchargeExempt: boolean;
  healthSurchargeRate: "full" | "half" | "custom";
  healthSurchargeOverride?: number;
  creditUnion: number;
  loanRepayment: number;
  advancesRecovery: number;
  unionDues: number;
  otherDeductions: Array<{ name: string; amount: number }>;
  // GRA 2026 threshold overrides (per-employee, optional — falls back to statutory defaults)
  personalAllowanceOverride?: number;  // default: 140,000/mo
  nisCeilingOverride?: number;         // default: 280,000/mo
  taxLowerLimitOverride?: number;      // default: 2,400,000/yr (PAYE bracket)
}

// ── Day / Holiday Status constants (from FMS formula documentation) ────────
export const DAY_STATUSES = ["On Day", "Off Day", "Sick", "Absent", "Holiday", "Annual Leave"] as const;
export type DayStatus = typeof DAY_STATUSES[number];

export const HOLIDAY_TYPES = [
  "Holiday Double",
  "New Year's Day",
  "Republic Day",
  "Phagwah",
  "Good Friday",
  "Easter Monday",
  "Labour Day",
  "Arrival Day",
  "Independence Day",
  "Eid al-Adha",
  "Eid ul Azha",
  "CARICOM Day",
  "Emancipation Day",
  "Youman Nabi",
  "Deepavali",
  "Christmas Day",
  "Christmas",
  "Boxing Day",
] as const;
export type HolidayType = typeof HOLIDAY_TYPES[number];

// Holidays whose hours go to the public-holiday (ph) bucket rather than OT.
// "Holiday Double" is excluded — it is a non-statutory day paid as OT (1.5×).
export const PH_HOLIDAYS: HolidayType[] = [
  "New Year's Day", "Republic Day", "Phagwah", "Good Friday", "Easter Monday",
  "Labour Day", "Arrival Day", "Independence Day", "Eid al-Adha", "Eid ul Azha",
  "CARICOM Day", "Emancipation Day", "Youman Nabi", "Deepavali",
  "Christmas Day", "Christmas", "Boxing Day",
];

export const ARMED_STATUSES = ["Unarmed", "Armed"] as const;
export type ArmedStatus = typeof ARMED_STATUSES[number];

export const CLIENT_AGENCIES = ["Caricom", "EU", "UN", "DMC", "ARU", "Head Office", "Canteen"] as const;
export type ClientAgency = typeof CLIENT_AGENCIES[number];

// Complete FMS locations list
export const FMS_LOCATIONS = [
  "Unico", "Unico-2", "Unico-42", "Unico-44", "Unico-46", "Unico-47", "Unico-48", "Unico-49",
  "Globe", "Globe-12", "Hebrews", "Romans-2", "Beacon", "Numbers", "Zebra-24",
  "Sunrise", "Sunrise-1", "Sunflower 6", "Sunset 12", "Sunset 11", "Ripple",
  "Neptune P1", "Neptune P2", "Neptune P3", "Neptune P4", "Neptune P5", "Neptune P6", "Neptune P7",
  "Rainbow 1", "Rainbow 2", "Citadel", "Autumn", "Autumn-2", "Miracle", "Miracle 1",
  "Canteen", "Guard Hut", "Head Office",
] as const;

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  tsId: text("ts_id").notNull().unique(),
  eid: text("eid").notNull(),
  date: text("date").notNull(),
  ci: text("ci"),
  co: text("co"),
  reg: doublePrecision("reg").notNull().default(0),
  ot: doublePrecision("ot").notNull().default(0),
  ph: doublePrecision("ph").notNull().default(0),        // Public holiday hours
  brk: integer("brk").notNull().default(0),
  meals: integer("meals").notNull().default(0),           // Meal count for the shift
  gIn: jsonb("g_in").$type<{ lat: number; lng: number } | null>(),
  gOut: jsonb("g_out").$type<{ lat: number; lng: number } | null>(),
  zone: text("zone"),
  post: text("post"),
  dayStatus: text("day_status"),                          // On Day / Off Day / Sick / Absent / Holiday / Annual Leave
  holidayType: text("holiday_type"),                      // Phagwah / Good Friday / Easter Monday / Labour Day / Christmas / Eid ul Azha / Holiday Double
  armed: text("armed"),                                   // Unarmed / Armed
  client: text("client"),                                 // Caricom / EU / UN / DMC / ARU / Head Office / Canteen
  status: text("status").notNull(),
  eSig: jsonb("e_sig").$type<{ name: string; time: string; ip: string } | null>(),
  f1Sig: jsonb("f1_sig").$type<{ name: string; time: string; ip: string } | null>(),
  f2Sig: jsonb("f2_sig").$type<{ name: string; time: string; ip: string } | null>(),
  notes: text("notes"),
  edited: boolean("edited").notNull().default(false),
  hist: jsonb("hist").$type<any[]>(),
  disputed: boolean("disputed").default(false),
  disputeNote: text("dispute_note"),
});

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  reqId: text("req_id").notNull().unique(),
  eid: text("eid").notNull(),
  type: text("type").notNull(),
  sub: text("sub").notNull(),
  start: text("start"),
  end: text("end"),
  date: text("date"),
  hrs: doublePrecision("hrs"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  at: text("at"),
  comments: jsonb("comments").$type<string[]>(),
});

export const employeeChildren = pgTable("employee_children", {
  id: serial("id").primaryKey(),
  eid: text("eid").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dob: text("dob").notNull(),
  relationship: text("relationship").notNull().default("biological"),
  school: text("school"),
  active: boolean("active").notNull().default(true),
  taxEligible: boolean("tax_eligible").notNull().default(true),
});

export const employeeLoans = pgTable("employee_loans", {
  id: serial("id").primaryKey(),
  eid: text("eid").notNull(),
  description: text("description").notNull(),
  principal: integer("principal").notNull(),
  balance: integer("balance").notNull(),
  monthlyPayment: integer("monthly_payment").notNull(),
  startDate: text("start_date").notNull(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
});

export const geofences = pgTable("geofences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radius: integer("radius").notNull().default(150),
  posts: integer("posts").notNull().default(10),
  postNames: jsonb("post_names").$type<string[]>(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
});

// ── Employee Schedules ─────────────────────────────────────────────────────
// Created by admin / manager / shift supervisor; read-only for employees.
// Not all employees will have a schedule — only those explicitly assigned.
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  eid: text("eid").notNull(),                   // Employee userId
  date: text("date").notNull(),                 // yyyy-MM-dd
  shiftStart: text("shift_start").notNull(),    // HH:mm  e.g. "06:00"
  shiftEnd: text("shift_end").notNull(),        // HH:mm  e.g. "14:00"
  location: text("location"),                   // from FMS_LOCATIONS
  armed: text("armed"),                         // Unarmed / Armed
  client: text("client"),                       // Caricom / EU / UN / ...
  company: text("company"),                     // Company A – Company F
  notes: text("notes"),
  createdBy: text("created_by").notNull(),      // userId of creator
});

// ── Call Sign Registry ─────────────────────────────────────────────────────
// Imported from admin's Excel sheet: call sign → location mapping
export const callSigns = pgTable("call_signs", {
  id:        serial("id").primaryKey(),
  callSign:  text("call_sign").notNull().unique(),  // e.g. "ALPHA-1", "1234"
  location:  text("location").notNull(),            // matches FMS_LOCATIONS
  note:      text("note"),                          // optional extra info
});

export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  personalAllowance: integer("personal_allowance").notNull().default(140_000),
  childAllowance: integer("child_allowance").notNull().default(10_000),
});

// ── Period-specific one-time deductions ────────────────────────────────────
// Standing deductions (credit union, union dues, loan repayment) remain in
// pay_config and apply every period.  One-time deductions (salary advance,
// other) are uploaded here against a specific period key ("YYYY-MM-H") and
// only apply to that period — they do NOT carry forward automatically.
export const periodDeductions = pgTable("period_deductions", {
  id:               serial("id").primaryKey(),
  eid:              text("eid").notNull(),
  period:           text("period").notNull(),            // e.g. "2026-01-1" or "2026-01-2"
  advancesRecovery: doublePrecision("advances_recovery").notNull().default(0),
  otherDeductions:  jsonb("other_deductions").$type<Array<{ name: string; amount: number }>>(),
  updatedAt:        text("updated_at").notNull(),
});

export type PeriodDeduction = typeof periodDeductions.$inferSelect;
export interface InsertPeriodDeduction {
  eid: string;
  period: string;
  advancesRecovery: number;
  otherDeductions: Array<{ name: string; amount: number }>;
  updatedAt: string;
}

export const payslips = pgTable("payslips", {
  id: serial("id").primaryKey(),
  eid: text("eid").notNull(),
  period: text("period").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  sentAt: text("sent_at").notNull(),
  sentBy: text("sent_by").notNull(),
  data: jsonb("data").notNull(),
  seen: boolean("seen").notNull().default(false),
});

// ── Insert schemas ─────────────────────────────────────────────────────────
export const insertEmployeeChildSchema = createInsertSchema(employeeChildren).omit({ id: true });
export const insertEmployeeLoanSchema = createInsertSchema(employeeLoans).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true }).extend({
  hourlyRate: z.number().min(0),
});
export const insertTimesheetSchema = createInsertSchema(timesheets).omit({ id: true });
export const insertRequestSchema = createInsertSchema(requests).omit({ id: true });
export const insertGeofenceSchema = createInsertSchema(geofences).omit({ id: true });
export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true });
export const insertCallSignSchema = createInsertSchema(callSigns).omit({ id: true });

// ── Select types ──────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;

export type Request = typeof requests.$inferSelect;
export type InsertRequest = z.infer<typeof insertRequestSchema>;

export type Geofence = typeof geofences.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;

export type EmployeeChild = typeof employeeChildren.$inferSelect;
export type InsertEmployeeChild = z.infer<typeof insertEmployeeChildSchema>;

export type EmployeeLoan = typeof employeeLoans.$inferSelect;
export type InsertEmployeeLoan = z.infer<typeof insertEmployeeLoanSchema>;

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;

export type CallSign = typeof callSigns.$inferSelect;
export type InsertCallSign = z.infer<typeof insertCallSignSchema>;

export type CompanySettings = typeof companySettings.$inferSelect;

export type Payslip = typeof payslips.$inferSelect;
export const insertPayslipSchema = createInsertSchema(payslips).omit({ id: true });
export type InsertPayslip = z.infer<typeof insertPayslipSchema>;
