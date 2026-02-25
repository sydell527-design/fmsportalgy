import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth mock for simplicity
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      res.status(200).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    res.status(200).json({ message: "Logged out" });
  });

  app.get(api.auth.me.path, (req, res) => {
    res.status(401).json({ message: "Not authenticated" });
  });

  // Users
  app.get(api.users.list.path, async (req, res) => {
    const usersList = await storage.getUsers();
    res.json(usersList);
  });
  
  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  app.put(api.users.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.users.update.input.parse(req.body);
      const user = await storage.updateUser(id, input);
      res.status(200).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  // Timesheets
  app.get(api.timesheets.list.path, async (req, res) => {
    const tsList = await storage.getTimesheets();
    res.json(tsList);
  });

  app.post(api.timesheets.create.path, async (req, res) => {
    try {
      const input = api.timesheets.create.input.parse(req.body);
      const ts = await storage.createTimesheet(input);
      res.status(201).json(ts);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  app.put(api.timesheets.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.timesheets.update.input.parse(req.body);
      const ts = await storage.updateTimesheet(id, input);
      res.status(200).json(ts);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  // Requests
  app.get(api.requests.list.path, async (req, res) => {
    const reqList = await storage.getRequests();
    res.json(reqList);
  });

  app.post(api.requests.create.path, async (req, res) => {
    try {
      const input = api.requests.create.input.parse(req.body);
      const request = await storage.createRequest(input);
      res.status(201).json(request);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  app.put(api.requests.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.requests.update.input.parse(req.body);
      const request = await storage.updateRequest(id, input);
      res.status(200).json(request);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const usersList = await storage.getUsers();
  if (usersList.length === 0) {
    await storage.createUser({
      userId: "1001", username: "1001", password: "temp", name: "Marcus Webb", role: "employee",
      dept: "Security", pos: "Security Officer", cat: "Time", hourlyRate: 1800, salary: 0,
      fa: "Shift Supervisor", sa: "Junior General Manager", email: "m.webb@fms.gy",
      phone: "592-600-1001", status: "active", fpc: true, joined: "2024-01-15",
      geo: ["HEAD OFFICE"], av: "MW"
    });
    await storage.createUser({
      userId: "MGR001", username: "MGR001", password: "manager123", name: "Sandra Ali", role: "manager",
      dept: "Management", pos: "Operations Manager", cat: "Executive", hourlyRate: 0, salary: 380000,
      fa: "Junior General Manager", sa: "Junior General Manager", email: "s.ali@fms.gy",
      phone: "592-600-2001", status: "active", fpc: false, joined: "2022-05-01",
      geo: ["HEAD OFFICE", "CARICOM"], av: "SA"
    });
    await storage.createUser({
      userId: "ADMIN001", username: "ADMIN001", password: "admin123", name: "Shemar Ferguson", role: "admin",
      dept: "Administration", pos: "Junior General Manager", cat: "Executive", hourlyRate: 0, salary: 520000,
      fa: "Junior General Manager", sa: "Junior General Manager", email: "s.ferguson@fms.gy",
      phone: "592-600-9001", status: "active", fpc: false, joined: "2022-01-01",
      geo: ["HEAD OFFICE", "CARICOM", "EU", "UN", "DMC", "ARU", "CANTEEN"], av: "SF"
    });
  }
}
