import { z } from 'zod';
import { insertUserSchema, insertTimesheetSchema, insertRequestSchema, users, timesheets, requests } from './schema';
import type { User, InsertUser, Timesheet, InsertTimesheet, Request, InsertRequest } from './schema';

export type { User, InsertUser, Timesheet, InsertTimesheet, Request, InsertRequest };

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({ username: z.string(), password: z.string() }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: { 200: z.object({ message: z.string() }) }
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    }
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users' as const,
      responses: { 200: z.array(z.custom<typeof users.$inferSelect>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/users' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/users/:id' as const,
      input: insertUserSchema.partial(),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      }
    }
  },
  timesheets: {
    list: {
      method: 'GET' as const,
      path: '/api/timesheets' as const,
      responses: { 200: z.array(z.custom<typeof timesheets.$inferSelect>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/timesheets' as const,
      input: insertTimesheetSchema,
      responses: {
        201: z.custom<typeof timesheets.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/timesheets/:id' as const,
      input: insertTimesheetSchema.partial(),
      responses: {
        200: z.custom<typeof timesheets.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      }
    }
  },
  requests: {
    list: {
      method: 'GET' as const,
      path: '/api/requests' as const,
      responses: { 200: z.array(z.custom<typeof requests.$inferSelect>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/requests' as const,
      input: insertRequestSchema,
      responses: {
        201: z.custom<typeof requests.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/requests/:id' as const,
      input: insertRequestSchema.partial(),
      responses: {
        200: z.custom<typeof requests.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
