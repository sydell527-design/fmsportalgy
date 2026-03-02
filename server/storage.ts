import { db } from "./db";
import {
  users, timesheets, requests, geofences, employeeChildren, employeeLoans, schedules, callSigns, companySettings, payslips,
  type User, type InsertUser,
  type Timesheet, type InsertTimesheet,
  type Request, type InsertRequest,
  type Geofence, type InsertGeofence,
  type EmployeeChild, type InsertEmployeeChild,
  type EmployeeLoan, type InsertEmployeeLoan,
  type Schedule, type InsertSchedule,
  type CallSign, type InsertCallSign,
  type CompanySettings,
  type Payslip, type InsertPayslip,
} from "@shared/schema";
import { eq, and, gte, lte, desc, inArray, sql } from "drizzle-orm";

export interface TimesheetFilters {
  startDate?: string;   // "YYYY-MM-DD"
  endDate?: string;     // "YYYY-MM-DD"
  eid?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;

  getTimesheets(filters?: TimesheetFilters): Promise<Timesheet[]>;
  getTimesheet(id: number): Promise<Timesheet | undefined>;
  createTimesheet(ts: InsertTimesheet): Promise<Timesheet>;
  bulkCreateTimesheets(records: InsertTimesheet[]): Promise<Timesheet[]>;
  updateTimesheet(id: number, updates: Partial<InsertTimesheet>): Promise<Timesheet>;
  deleteTimesheet(id: number): Promise<void>;
  dedupTimesheets(): Promise<number>;

  getRequests(): Promise<Request[]>;
  getRequest(id: number): Promise<Request | undefined>;
  createRequest(req: InsertRequest): Promise<Request>;
  updateRequest(id: number, updates: Partial<InsertRequest>): Promise<Request>;

  getGeofences(): Promise<Geofence[]>;
  getGeofence(id: number): Promise<Geofence | undefined>;
  createGeofence(geo: InsertGeofence): Promise<Geofence>;
  updateGeofence(id: number, updates: Partial<InsertGeofence>): Promise<Geofence>;
  deleteGeofence(id: number): Promise<void>;

  getAllChildren(): Promise<EmployeeChild[]>;
  getChildrenByEid(eid: string): Promise<EmployeeChild[]>;
  createChild(child: InsertEmployeeChild): Promise<EmployeeChild>;
  updateChild(id: number, updates: Partial<InsertEmployeeChild>): Promise<EmployeeChild>;
  deleteChild(id: number): Promise<void>;

  getLoansByEid(eid: string): Promise<EmployeeLoan[]>;
  createLoan(loan: InsertEmployeeLoan): Promise<EmployeeLoan>;
  updateLoan(id: number, updates: Partial<InsertEmployeeLoan>): Promise<EmployeeLoan>;
  deleteLoan(id: number): Promise<void>;

  getAllSchedules(): Promise<Schedule[]>;
  getSchedulesByEid(eid: string): Promise<Schedule[]>;
  getSchedulesByEids(eids: string[]): Promise<Schedule[]>;
  createSchedule(s: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: number, updates: Partial<InsertSchedule>): Promise<Schedule>;
  deleteSchedule(id: number): Promise<void>;
  clearSchedules(eids: string[], startDate?: string, endDate?: string): Promise<number>;

  getCallSigns(): Promise<CallSign[]>;
  importCallSigns(records: InsertCallSign[]): Promise<number>;
  clearCallSigns(): Promise<void>;

  getCompanySettings(): Promise<CompanySettings>;
  updateCompanySettings(updates: Partial<Omit<CompanySettings, "id">>): Promise<CompanySettings>;

  getPayslipsByEid(eid: string): Promise<Payslip[]>;
  getAllPayslips(): Promise<Payslip[]>;
  createPayslip(p: InsertPayslip): Promise<Payslip>;
  markPayslipSeen(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  }
  async getUserByUsername(username: string) {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    return u;
  }
  async getUsers() { return db.select().from(users); }
  async createUser(user: InsertUser) {
    const [u] = await db.insert(users).values(user).returning();
    return u;
  }
  async updateUser(id: number, updates: Partial<InsertUser>) {
    const [u] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return u;
  }
  async deleteUser(id: number) {
    await db.delete(users).where(eq(users.id, id));
  }

  async getTimesheets(filters: TimesheetFilters = {}) {
    const conditions = [];
    if (filters.startDate) conditions.push(gte(timesheets.date, filters.startDate));
    if (filters.endDate)   conditions.push(lte(timesheets.date, filters.endDate));
    if (filters.eid)       conditions.push(eq(timesheets.eid, filters.eid));
    if (filters.status)    conditions.push(eq(timesheets.status, filters.status));

    const query = db
      .select()
      .from(timesheets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(timesheets.date), desc(timesheets.id));

    if (filters.limit !== undefined) {
      // @ts-ignore — drizzle limit/offset chaining
      return query.limit(filters.limit).offset(filters.offset ?? 0);
    }
    return query;
  }

  async getTimesheet(id: number) {
    const [ts] = await db.select().from(timesheets).where(eq(timesheets.id, id));
    return ts;
  }
  async createTimesheet(ts: InsertTimesheet) {
    const [t] = await db.insert(timesheets).values(ts).returning();
    return t;
  }
  async bulkCreateTimesheets(records: InsertTimesheet[]) {
    if (!records.length) return [];
    // Fetch existing timesheets for the same eids so we can skip duplicates
    const eids = [...new Set(records.map((r) => r.eid))];
    const existing = await db.select().from(timesheets).where(inArray(timesheets.eid, eids));
    const existingKeys = new Set(existing.map((t) => `${t.eid}|${t.date}|${t.ci ?? ""}|${t.co ?? ""}`));
    const fresh = records.filter((r) => !existingKeys.has(`${r.eid}|${r.date}|${r.ci ?? ""}|${r.co ?? ""}`));
    if (!fresh.length) return [];
    return db.insert(timesheets).values(fresh).returning();
  }
  async updateTimesheet(id: number, updates: Partial<InsertTimesheet>) {
    const [t] = await db.update(timesheets).set(updates).where(eq(timesheets.id, id)).returning();
    return t;
  }
  async deleteTimesheet(id: number) {
    await db.delete(timesheets).where(eq(timesheets.id, id));
  }

  async dedupTimesheets(): Promise<number> {
    const all = await db.select().from(timesheets);
    const groups: Record<string, typeof all> = {};
    for (const ts of all) {
      const key = `${ts.eid}|${ts.date}|${ts.ci ?? ""}|${ts.co ?? ""}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ts);
    }
    const toDelete: number[] = [];
    for (const group of Object.values(groups)) {
      if (group.length <= 1) continue;
      // Keep the record with highest brk; tie-break on lowest id (earliest)
      const sorted = [...group].sort((a, b) => {
        if ((b.brk ?? 0) !== (a.brk ?? 0)) return (b.brk ?? 0) - (a.brk ?? 0);
        return a.id - b.id;
      });
      for (const ts of sorted.slice(1)) toDelete.push(ts.id);
    }
    if (toDelete.length > 0) {
      await db.delete(timesheets).where(inArray(timesheets.id, toDelete));
    }
    return toDelete.length;
  }

  async getRequests() { return db.select().from(requests); }
  async getRequest(id: number) {
    const [r] = await db.select().from(requests).where(eq(requests.id, id));
    return r;
  }
  async createRequest(req: InsertRequest) {
    const [r] = await db.insert(requests).values(req).returning();
    return r;
  }
  async updateRequest(id: number, updates: Partial<InsertRequest>) {
    const [r] = await db.update(requests).set(updates).where(eq(requests.id, id)).returning();
    return r;
  }

  async getGeofences() { return db.select().from(geofences); }
  async getGeofence(id: number) {
    const [g] = await db.select().from(geofences).where(eq(geofences.id, id));
    return g;
  }
  async createGeofence(geo: InsertGeofence) {
    const [g] = await db.insert(geofences).values(geo).returning();
    return g;
  }
  async updateGeofence(id: number, updates: Partial<InsertGeofence>) {
    const [g] = await db.update(geofences).set(updates).where(eq(geofences.id, id)).returning();
    return g;
  }
  async deleteGeofence(id: number) {
    await db.delete(geofences).where(eq(geofences.id, id));
  }

  async getAllChildren() {
    return db.select().from(employeeChildren);
  }
  async getChildrenByEid(eid: string) {
    return db.select().from(employeeChildren).where(eq(employeeChildren.eid, eid));
  }
  async createChild(child: InsertEmployeeChild) {
    const [c] = await db.insert(employeeChildren).values(child).returning();
    return c;
  }
  async updateChild(id: number, updates: Partial<InsertEmployeeChild>) {
    const [c] = await db.update(employeeChildren).set(updates).where(eq(employeeChildren.id, id)).returning();
    return c;
  }
  async deleteChild(id: number) {
    await db.delete(employeeChildren).where(eq(employeeChildren.id, id));
  }

  async getLoansByEid(eid: string) {
    return db.select().from(employeeLoans).where(eq(employeeLoans.eid, eid));
  }
  async createLoan(loan: InsertEmployeeLoan) {
    const [l] = await db.insert(employeeLoans).values(loan).returning();
    return l;
  }
  async updateLoan(id: number, updates: Partial<InsertEmployeeLoan>) {
    const [l] = await db.update(employeeLoans).set(updates).where(eq(employeeLoans.id, id)).returning();
    return l;
  }
  async deleteLoan(id: number) {
    await db.delete(employeeLoans).where(eq(employeeLoans.id, id));
  }

  async getAllSchedules() {
    return db.select().from(schedules).orderBy(schedules.date);
  }
  async getSchedulesByEid(eid: string) {
    return db.select().from(schedules).where(eq(schedules.eid, eid)).orderBy(schedules.date);
  }
  async getSchedulesByEids(eids: string[]) {
    if (!eids.length) return [];
    return db.select().from(schedules).where(inArray(schedules.eid, eids)).orderBy(schedules.date);
  }
  async createSchedule(s: InsertSchedule) {
    const [r] = await db.insert(schedules).values(s).returning();
    return r;
  }
  async updateSchedule(id: number, updates: Partial<InsertSchedule>) {
    const [r] = await db.update(schedules).set(updates).where(eq(schedules.id, id)).returning();
    return r;
  }
  async deleteSchedule(id: number) {
    await db.delete(schedules).where(eq(schedules.id, id));
  }
  async clearSchedules(eids: string[], startDate?: string, endDate?: string) {
    if (!eids.length) return 0;
    let q = db.delete(schedules).where(inArray(schedules.eid, eids));
    if (startDate && endDate) {
      q = db.delete(schedules).where(
        and(inArray(schedules.eid, eids), gte(schedules.date, startDate), lte(schedules.date, endDate))
      );
    }
    const result = await q;
    return (result as any).rowCount ?? 0;
  }

  async getCallSigns() {
    return db.select().from(callSigns).orderBy(callSigns.callSign);
  }

  async importCallSigns(records: InsertCallSign[]) {
    if (!records.length) return 0;
    await db
      .insert(callSigns)
      .values(records)
      .onConflictDoUpdate({
        target: callSigns.callSign,
        set: { location: sql`excluded.location`, note: sql`excluded.note` },
      });
    return records.length;
  }

  async clearCallSigns() {
    await db.delete(callSigns);
  }

  async getCompanySettings(): Promise<CompanySettings> {
    const [row] = await db.select().from(companySettings).limit(1);
    if (row) return row;
    const [created] = await db.insert(companySettings).values({ personalAllowance: 140_000, childAllowance: 10_000 }).returning();
    return created;
  }

  async updateCompanySettings(updates: Partial<Omit<CompanySettings, "id">>): Promise<CompanySettings> {
    const existing = await this.getCompanySettings();
    const [updated] = await db.update(companySettings)
      .set(updates)
      .where(eq(companySettings.id, existing.id))
      .returning();
    return updated;
  }

  async getPayslipsByEid(eid: string): Promise<Payslip[]> {
    return db.select().from(payslips).where(eq(payslips.eid, eid)).orderBy(desc(payslips.id));
  }

  async getAllPayslips(): Promise<Payslip[]> {
    return db.select().from(payslips).orderBy(desc(payslips.id));
  }

  async createPayslip(p: InsertPayslip): Promise<Payslip> {
    const [row] = await db.insert(payslips).values(p).returning();
    return row;
  }

  async markPayslipSeen(id: number): Promise<void> {
    await db.update(payslips).set({ seen: true }).where(eq(payslips.id, id));
  }
}

export const storage = new DatabaseStorage();
