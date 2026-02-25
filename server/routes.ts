import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── AUTH ────────────────────────────────────────────────────────────────────
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      res.json(user);
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post(api.auth.logout.path, (_req, res) => {
    res.json({ message: "Logged out" });
  });

  app.get(api.auth.me.path, (_req, res) => {
    res.status(401).json({ message: "Not authenticated" });
  });

  // ── USERS ───────────────────────────────────────────────────────────────────
  app.get(api.users.list.path, async (_req, res) => {
    res.json(await storage.getUsers());
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put(api.users.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.users.update.input.parse(req.body);
      const user = await storage.updateUser(id, input);
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── TIMESHEETS ──────────────────────────────────────────────────────────────
  app.get(api.timesheets.list.path, async (_req, res) => {
    res.json(await storage.getTimesheets());
  });

  app.post(api.timesheets.create.path, async (req, res) => {
    try {
      const input = api.timesheets.create.input.parse(req.body);
      const ts = await storage.createTimesheet(input);
      res.status(201).json(ts);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put(api.timesheets.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.timesheets.update.input.parse(req.body);
      const ts = await storage.updateTimesheet(id, input);
      res.json(ts);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── REQUESTS ────────────────────────────────────────────────────────────────
  app.get(api.requests.list.path, async (_req, res) => {
    res.json(await storage.getRequests());
  });

  app.post(api.requests.create.path, async (req, res) => {
    try {
      const input = api.requests.create.input.parse(req.body);
      const request = await storage.createRequest(input);
      res.status(201).json(request);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put(api.requests.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.requests.update.input.parse(req.body);
      const request = await storage.updateRequest(id, input);
      res.json(request);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Server error" });
    }
  });

  await seedDatabase();
  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getUsers();
  if (existing.length > 0) return;

  const employees = [
    { userId:"1001", username:"1001", password:"temp", name:"Marcus Webb", role:"employee", dept:"Security", pos:"Security Officer", cat:"Time", hourlyRate:1800, salary:0, fa:"Shift Supervisor", sa:"Junior General Manager", email:"m.webb@fms.gy", phone:"592-600-1001", status:"active", fpc:true, joined:"2024-01-15", geo:["HEAD OFFICE"], av:"MW" },
    { userId:"1002", username:"1002", password:"temp", name:"Priya Sharma", role:"employee", dept:"Admin", pos:"Office Clerk", cat:"Fixed", hourlyRate:0, salary:185000, fa:"Operations Manager", sa:"Junior General Manager", email:"p.sharma@fms.gy", phone:"592-600-1002", status:"active", fpc:true, joined:"2024-03-01", geo:["HEAD OFFICE"], av:"PS" },
    { userId:"1003", username:"1003", password:"temp", name:"Devon Charles", role:"employee", dept:"Logistics", pos:"Warehouse Supervisor", cat:"Fixed", hourlyRate:0, salary:220000, fa:"Operations Manager", sa:"Junior General Manager", email:"d.charles@fms.gy", phone:"592-600-1003", status:"active", fpc:false, joined:"2023-09-10", geo:["CARICOM"], av:"DC" },
    { userId:"1004", username:"1004", password:"temp", name:"Jordan Baptiste", role:"employee", dept:"Security", pos:"Security Officer", cat:"Time", hourlyRate:1800, salary:0, fa:"Shift Supervisor", sa:"Junior General Manager", email:"j.baptiste@fms.gy", phone:"592-600-1004", status:"active", fpc:true, joined:"2025-01-05", geo:["HEAD OFFICE"], av:"JB" },
    { userId:"1005", username:"1005", password:"temp", name:"Troy Mason", role:"employee", dept:"Security", pos:"Shift Supervisor", cat:"Fixed", hourlyRate:0, salary:250000, fa:"Operations Manager", sa:"Junior General Manager", email:"t.mason@fms.gy", phone:"592-600-1005", status:"active", fpc:false, joined:"2023-03-15", geo:["HEAD OFFICE"], av:"TM" },
    { userId:"MGR001", username:"MGR001", password:"manager123", name:"Sandra Ali", role:"manager", dept:"Management", pos:"Operations Manager", cat:"Executive", hourlyRate:0, salary:380000, fa:"Junior General Manager", sa:"Junior General Manager", email:"s.ali@fms.gy", phone:"592-600-2001", status:"active", fpc:false, joined:"2022-05-01", geo:["HEAD OFFICE","CARICOM"], av:"SA" },
    { userId:"ADMIN001", username:"ADMIN001", password:"admin123", name:"Shemar Ferguson", role:"admin", dept:"Administration", pos:"Junior General Manager", cat:"Executive", hourlyRate:0, salary:520000, fa:"Junior General Manager", sa:"Junior General Manager", email:"s.ferguson@fms.gy", phone:"592-600-9001", status:"active", fpc:false, joined:"2022-01-01", geo:["HEAD OFFICE","CARICOM","EU","UN","DMC","ARU","CANTEEN"], av:"SF" },
  ];

  for (const emp of employees) {
    await storage.createUser(emp as any);
  }

  // Seed timesheets
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  const tseed = [
    { tsId:"TS001", eid:"1001", date:`${year}-${month}-10`, ci:"07:58", co:"16:02", reg:8, ot:0, brk:30, status:"approved", eSig:{name:"Marcus Webb",time:`${year}-${month}-10 16:05`,ip:"web"}, f1Sig:{name:"Troy Mason",time:`${year}-${month}-10 17:00`,ip:"web"}, f2Sig:{name:"Shemar Ferguson",time:`${year}-${month}-10 18:00`,ip:"web"}, notes:"", edited:false, hist:[] },
    { tsId:"TS002", eid:"1001", date:`${year}-${month}-11`, ci:"08:00", co:"17:30", reg:8, ot:1.5, brk:30, status:"approved", eSig:{name:"Marcus Webb",time:`${year}-${month}-11 17:35`,ip:"web"}, f1Sig:{name:"Troy Mason",time:`${year}-${month}-11 18:00`,ip:"web"}, f2Sig:{name:"Shemar Ferguson",time:`${year}-${month}-11 19:00`,ip:"web"}, notes:"", edited:false, hist:[] },
    { tsId:"TS003", eid:"1002", date:`${year}-${month}-10`, ci:"08:01", co:"17:05", reg:8, ot:1, brk:60, status:"approved", eSig:{name:"Priya Sharma",time:`${year}-${month}-10 17:10`,ip:"web"}, f1Sig:{name:"Sandra Ali",time:`${year}-${month}-10 18:00`,ip:"web"}, f2Sig:{name:"Shemar Ferguson",time:`${year}-${month}-10 19:00`,ip:"web"}, notes:"", edited:false, hist:[] },
    { tsId:"TS004", eid:"1003", date:`${year}-${month}-10`, ci:"06:30", co:"15:30", reg:8, ot:1, brk:60, status:"approved", eSig:{name:"Devon Charles",time:`${year}-${month}-10 15:35`,ip:"web"}, f1Sig:{name:"Sandra Ali",time:`${year}-${month}-10 16:00`,ip:"web"}, f2Sig:{name:"Shemar Ferguson",time:`${year}-${month}-10 17:00`,ip:"web"}, notes:"", edited:false, hist:[] },
    { tsId:"TS005", eid:"1004", date:`${year}-${month}-11`, ci:"07:45", co:"16:15", reg:8, ot:0.5, brk:30, status:"pending_second_approval", eSig:{name:"Jordan Baptiste",time:`${year}-${month}-11 16:20`,ip:"web"}, f1Sig:{name:"Troy Mason",time:`${year}-${month}-11 17:00`,ip:"web"}, f2Sig:null, notes:"", edited:false, hist:[] },
    { tsId:"TS006", eid:"1005", date:`${year}-${month}-12`, ci:"08:00", co:"16:30", reg:8, ot:0.5, brk:30, status:"pending_first_approval", eSig:{name:"Troy Mason",time:`${year}-${month}-12 16:35`,ip:"web"}, f1Sig:null, f2Sig:null, notes:"", edited:false, hist:[] },
    { tsId:"TS007", eid:"1001", date:`${year}-${month}-13`, ci:"07:55", co:null, reg:0, ot:0, brk:0, status:"pending_employee", eSig:null, f1Sig:null, f2Sig:null, notes:"", edited:false, hist:[] },
  ];

  for (const ts of tseed) {
    await storage.createTimesheet(ts as any);
  }

  // Seed requests
  const reqseed = [
    { reqId:"REQ001", eid:"1001", type:"Leave", sub:"Annual Leave", start:`${year}-${month}-25`, end:`${year}-${month}-27`, reason:"Family vacation", status:"pending", at:`${year}-${month}-10 09:30`, comments:[] },
    { reqId:"REQ002", eid:"1002", type:"Overtime", sub:"Planned Overtime", date:`${year}-${month}-20`, hrs:3, reason:"End of month reporting deadline", status:"approved", at:`${year}-${month}-12 14:00`, comments:["Approved — Sandra Ali"] },
    { reqId:"REQ003", eid:"1003", type:"Leave", sub:"Sick Leave", start:`${year}-${month}-18`, end:`${year}-${month}-18`, reason:"Doctor appointment", status:"rejected", at:`${year}-${month}-15 08:00`, comments:["Insufficient notice — S. Ferguson"] },
    { reqId:"REQ004", eid:"1004", type:"Shift Swap", sub:"Shift Swap", start:`${year}-${month}-22`, end:`${year}-${month}-22`, reason:"Personal commitment", status:"pending", at:`${year}-${month}-16 10:00`, comments:[] },
  ];

  for (const req of reqseed) {
    await storage.createRequest(req as any);
  }
}
