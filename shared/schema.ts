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
  hourlyRate: integer("hourly_rate").notNull().default(0),
  salary: integer("salary").notNull().default(0),
  fa: text("fa"),
  sa: text("sa"),
  email: text("email"),
  phone: text("phone"),
  status: text("status").notNull().default("active"),
  fpc: boolean("fpc").notNull().default(true),
  joined: text("joined"),
  geo: jsonb("geo").$type<string[]>(),
  av: text("av"),
});

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  tsId: text("ts_id").notNull().unique(),
  eid: text("eid").notNull(),
  date: text("date").notNull(),
  ci: text("ci"),
  co: text("co"),
  reg: doublePrecision("reg").notNull().default(0),
  ot: doublePrecision("ot").notNull().default(0),
  brk: integer("brk").notNull().default(0),
  gIn: jsonb("g_in").$type<{ lat: number; lng: number } | null>(),
  gOut: jsonb("g_out").$type<{ lat: number; lng: number } | null>(),
  zone: text("zone"),
  post: text("post"),
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

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertTimesheetSchema = createInsertSchema(timesheets).omit({ id: true });
export const insertRequestSchema = createInsertSchema(requests).omit({ id: true });
export const insertGeofenceSchema = createInsertSchema(geofences).omit({ id: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;

export type Request = typeof requests.$inferSelect;
export type InsertRequest = z.infer<typeof insertRequestSchema>;

export type Geofence = typeof geofences.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;
