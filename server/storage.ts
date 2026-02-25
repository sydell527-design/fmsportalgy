import { db } from "./db";
import {
  users, timesheets, requests,
  type User, type InsertUser,
  type Timesheet, type InsertTimesheet,
  type Request, type InsertRequest
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;
  
  // Timesheets
  getTimesheets(): Promise<Timesheet[]>;
  getTimesheet(id: number): Promise<Timesheet | undefined>;
  createTimesheet(ts: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: number, updates: Partial<InsertTimesheet>): Promise<Timesheet>;
  
  // Requests
  getRequests(): Promise<Request[]>;
  getRequest(id: number): Promise<Request | undefined>;
  createRequest(req: InsertRequest): Promise<Request>;
  updateRequest(id: number, updates: Partial<InsertRequest>): Promise<Request>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }
  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User> {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  // Timesheets
  async getTimesheets(): Promise<Timesheet[]> {
    return await db.select().from(timesheets);
  }
  async getTimesheet(id: number): Promise<Timesheet | undefined> {
    const [ts] = await db.select().from(timesheets).where(eq(timesheets.id, id));
    return ts;
  }
  async createTimesheet(ts: InsertTimesheet): Promise<Timesheet> {
    const [created] = await db.insert(timesheets).values(ts).returning();
    return created;
  }
  async updateTimesheet(id: number, updates: Partial<InsertTimesheet>): Promise<Timesheet> {
    const [updated] = await db.update(timesheets).set(updates).where(eq(timesheets.id, id)).returning();
    return updated;
  }

  // Requests
  async getRequests(): Promise<Request[]> {
    return await db.select().from(requests);
  }
  async getRequest(id: number): Promise<Request | undefined> {
    const [req] = await db.select().from(requests).where(eq(requests.id, id));
    return req;
  }
  async createRequest(req: InsertRequest): Promise<Request> {
    const [created] = await db.insert(requests).values(req).returning();
    return created;
  }
  async updateRequest(id: number, updates: Partial<InsertRequest>): Promise<Request> {
    const [updated] = await db.update(requests).set(updates).where(eq(requests.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
