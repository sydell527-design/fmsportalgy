import { db } from "./db";
import {
  users, timesheets, requests, geofences,
  type User, type InsertUser,
  type Timesheet, type InsertTimesheet,
  type Request, type InsertRequest,
  type Geofence, type InsertGeofence,
} from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

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
  updateTimesheet(id: number, updates: Partial<InsertTimesheet>): Promise<Timesheet>;

  getRequests(): Promise<Request[]>;
  getRequest(id: number): Promise<Request | undefined>;
  createRequest(req: InsertRequest): Promise<Request>;
  updateRequest(id: number, updates: Partial<InsertRequest>): Promise<Request>;

  getGeofences(): Promise<Geofence[]>;
  getGeofence(id: number): Promise<Geofence | undefined>;
  createGeofence(geo: InsertGeofence): Promise<Geofence>;
  updateGeofence(id: number, updates: Partial<InsertGeofence>): Promise<Geofence>;
  deleteGeofence(id: number): Promise<void>;
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
  async updateTimesheet(id: number, updates: Partial<InsertTimesheet>) {
    const [t] = await db.update(timesheets).set(updates).where(eq(timesheets.id, id)).returning();
    return t;
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
}

export const storage = new DatabaseStorage();
