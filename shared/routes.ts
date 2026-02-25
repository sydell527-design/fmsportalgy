import { z } from "zod";
import { insertUserSchema, insertTimesheetSchema, insertRequestSchema, insertGeofenceSchema, users, timesheets, requests, geofences } from "./schema";
import type { User, InsertUser, Timesheet, InsertTimesheet, Request, InsertRequest, Geofence, InsertGeofence } from "./schema";

export type { User, InsertUser, Timesheet, InsertTimesheet, Request, InsertRequest, Geofence, InsertGeofence };

export const api = {
  auth: {
    login: {
      method: "POST" as const,
      path: "/api/auth/login" as const,
      input: z.object({ username: z.string(), password: z.string() }),
      responses: { 200: z.custom<typeof users.$inferSelect>(), 401: z.object({ message: z.string() }) },
    },
    logout: {
      method: "POST" as const,
      path: "/api/auth/logout" as const,
      responses: { 200: z.object({ message: z.string() }) },
    },
    me: {
      method: "GET" as const,
      path: "/api/auth/me" as const,
      responses: { 200: z.custom<typeof users.$inferSelect>(), 401: z.object({ message: z.string() }) },
    },
  },
  users: {
    list: { method: "GET" as const, path: "/api/users" as const, responses: { 200: z.array(z.custom<typeof users.$inferSelect>()) } },
    create: { method: "POST" as const, path: "/api/users" as const, input: insertUserSchema, responses: { 201: z.custom<typeof users.$inferSelect>(), 400: z.object({ message: z.string() }) } },
    update: { method: "PUT" as const, path: "/api/users/:id" as const, input: insertUserSchema.partial(), responses: { 200: z.custom<typeof users.$inferSelect>(), 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) } },
  },
  timesheets: {
    list: { method: "GET" as const, path: "/api/timesheets" as const, responses: { 200: z.array(z.custom<typeof timesheets.$inferSelect>()) } },
    create: { method: "POST" as const, path: "/api/timesheets" as const, input: insertTimesheetSchema, responses: { 201: z.custom<typeof timesheets.$inferSelect>(), 400: z.object({ message: z.string() }) } },
    update: { method: "PUT" as const, path: "/api/timesheets/:id" as const, input: insertTimesheetSchema.partial(), responses: { 200: z.custom<typeof timesheets.$inferSelect>(), 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) } },
  },
  requests: {
    list: { method: "GET" as const, path: "/api/requests" as const, responses: { 200: z.array(z.custom<typeof requests.$inferSelect>()) } },
    create: { method: "POST" as const, path: "/api/requests" as const, input: insertRequestSchema, responses: { 201: z.custom<typeof requests.$inferSelect>(), 400: z.object({ message: z.string() }) } },
    update: { method: "PUT" as const, path: "/api/requests/:id" as const, input: insertRequestSchema.partial(), responses: { 200: z.custom<typeof requests.$inferSelect>(), 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) } },
  },
  geofences: {
    list: { method: "GET" as const, path: "/api/geofences" as const, responses: { 200: z.array(z.custom<typeof geofences.$inferSelect>()) } },
    create: { method: "POST" as const, path: "/api/geofences" as const, input: insertGeofenceSchema, responses: { 201: z.custom<typeof geofences.$inferSelect>(), 400: z.object({ message: z.string() }) } },
    update: { method: "PUT" as const, path: "/api/geofences/:id" as const, input: insertGeofenceSchema.partial(), responses: { 200: z.custom<typeof geofences.$inferSelect>(), 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) } },
    delete: { method: "DELETE" as const, path: "/api/geofences/:id" as const, responses: { 204: z.null() } },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, String(value));
    });
  }
  return url;
}
