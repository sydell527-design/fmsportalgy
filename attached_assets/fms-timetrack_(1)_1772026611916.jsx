/*
╔══════════════════════════════════════════════════════════════════════════════════╗
║              FMS TIMETRACK — MASTER CHANGELOG & STATE DOCUMENT                 ║
║  Read this before making ANY changes. Update the Session Log at the bottom     ║
║  of this block every time a change is made.                                    ║
╚══════════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COMPANY CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Company       : Federal Management Systems (FMS), Georgetown, Guyana
  Admin user    : Shemar Ferguson — Junior General Manager
                  ID: ADMIN001 | Password: admin123
  Payroll std   : Guyana 2026 — NIS 5.6% emp / 8.4% employer
                  PAYE 28% | Personal allowance GYD 100,000/month
  Framework     : React single JSX file — runs directly in Claude.ai artifact
  Persistence   : window.storage API (survives reloads)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STORAGE KEYS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  fms:employees   — all employee records
  fms:timesheets  — all timesheet entries
  fms:requests    — all leave/overtime requests
  fms:session     — { userId, savedTab } — restores login on reload

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEED EMPLOYEES (INIT_EMPLOYEES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ID        Name               Role      Position                  fa (1st)              sa (2nd)
  1001      Marcus Webb        employee  Security Officer          Shift Supervisor      Junior General Manager
  1002      Priya Sharma       employee  Office Clerk              Operations Manager    Junior General Manager
  1003      Devon Charles      employee  Warehouse Supervisor      Operations Manager    Junior General Manager
  1004      Jordan Baptiste    employee  Security Officer          Shift Supervisor      Junior General Manager
  1005      Troy Mason         employee  Shift Supervisor          Operations Manager    Junior General Manager
  MGR001    Sandra Ali         manager   Operations Manager        Junior General Manager Junior General Manager
  ADMIN001  Shemar Ferguson    admin     Junior General Manager    Junior General Manager Junior General Manager

  Default passwords: employees = "temp", Sandra Ali = "manager123", Shemar = "admin123"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WORK LOCATIONS (WORK_LOCATIONS constant)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CARICOM | EU | UN | DMC | ARU | HEAD OFFICE | CANTEEN
  - Used in: Clock In screen (employee selects where they're working)
  - Used in: Add/Edit Employee form (multi-select checkboxes assign locations)
  - emp.geo is an ARRAY e.g. ["CARICOM", "HEAD OFFICE"] — NOT a single string
  - Clock In shows only the employee's assigned locations (all if none assigned)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL ARCHITECTURE RULES — DO NOT BREAK THESE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. APPROVAL CHAIN IS POSITION-BASED — NOT PERSON-BASED
     emp.fa and emp.sa store POSITION TITLE STRINGS (e.g. "Shift Supervisor")
     NEVER store employee IDs in fa/sa.
     Routing: timesheets go to anyone whose user.pos === emp.fa (1st)
              or user.pos === emp.sa (2nd)
     Reason: Multiple people can hold the same position — any one of them
             should be able to approve, not just a specific person.

  2. EMPLOYEE ID = USERNAME
     When adding a new employee, admin provides a custom ID (e.g. 1006, SEC007).
     That becomes: emp.id, emp.username, default password = "temp", fpc = true.
     Email field is REMOVED from the add employee form.

  3. emp.geo IS AN ARRAY
     Always treat emp.geo as string[] e.g. ["CARICOM", "DMC"]
     Use Array.isArray(emp.geo) checks everywhere. Migration converts old strings.

  4. DO NOT ROUTE APPROVALS BY user.role
     Old code used user.role === "manager" — this is WRONG and has been removed.
     Always use: emp.fa === user.pos  and  emp.sa === user.pos

  5. MIGRATION RUNS ON EVERY LOAD (in the App useEffect)
     - Merges any missing seed employees (e.g. Troy Mason added later)
     - Converts old ID-based fa/sa values → position title strings
     - Saves migrated data back to storage
     Detection: values with no spaces are treated as IDs (positions always have spaces)

  6. EmpForm IS A TOP-LEVEL FUNCTION
     Defined OUTSIDE EmployeesPanel. If nested inside, React remounts it on every
     render causing inputs to lose focus after each keystroke. Do not move it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BUGS FIXED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  #1  Form inputs lose focus while typing
      Cause: EmpForm was defined inside EmployeesPanel — remounted every render
      Fix:   Extracted EmpForm as top-level function (see Rule #6 above)

  #2  Auto-logout on every code update
      Cause: Session was only in React state — cleared on remount
      Fix:   Session persisted to fms:session, restored on mount

  #3  All data lost on reload
      Cause: All state lived in React memory only
      Fix:   Wrapped setters auto-save; load from storage on mount

  #4  1st sign-off dropdown only showed one option / "No active staff" error
      Cause: Stored employees still had old ID-based fa/sa (e.g. "MGR001")
             + Troy Mason was missing from storage
      Fix:   Migration on load converts IDs → position strings + merges seed

  #5  App not running after adding WORK_LOCATIONS
      Cause: str_replace accidentally deleted "const INIT_GEOFENCES = [" line
      Fix:   Restored the missing const declaration

  #6  Reporting To showed names not position titles
      Cause: Dropdown used employee objects as options
      Fix:   Switched to unique position title strings as value and label

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SESSION LOG — update this every session
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  S01  Initial build — full app: clock in/out, approvals, payroll, geofencing,
       reports, settings, employee management
  S02  Bug fixes: form focus loss, auto-logout, data persistence
       Added Reporting To / approval chain fields in employee form
  S03  Fixed approval routing to position-based; added Troy Mason (Shift Supervisor);
       migration logic for old fa/sa values
  S04  Reporting To dropdown shows position titles only (not names)
       2nd sign-off restricted to managers/admins only
  S05  Clock In: location selector added (required before clocking in)
       Add Employee: email field removed, replaced with Employee ID field
       Auto-credentials modal after employee creation
       WORK_LOCATIONS constant added
  S06  Locations updated to: CARICOM, EU, UN, DMC, ARU, HEAD OFFICE, CANTEEN
       Fixed broken INIT_GEOFENCES (const declaration accidentally deleted)
  S07  Geofence field in employee form → multi-select pill checkboxes
       emp.geo changed from string to string array
       Clock In shows only the employee's assigned locations
  S08  Changelog embedded directly into JSX file as top comment block
       Separate changelog .md file no longer needed
  S09  Force password change screen added — triggers on first login when fpc=true
       Validates: min 4 chars, passwords match, cannot reuse "temp"
       Clears fpc flag and saves new password to storage on completion
       Also triggers if session is restored with fpc still true
  S10  Dispute option added to Sign Timesheet modal
       Employee can select "Sign & Submit" (correct) or "Raise Dispute" (incorrect times)
       Dispute form: correct clock in/out times + reason/explanation + signature
       Disputed timesheets route to approver's queue as normal but flagged with
       orange ⚠️ DISPUTED badge and a dispute details box showing the employee's
       claimed times and explanation. ts.disputed=true, ts.disputeNote=string
  S11  Fixed: force password change screen kept reappearing after setting new password
       Root cause: completePasswordChange relied on wrapped setEmployees async timing
       Fix: explicitly call save("fms:employees", next) inside the setter callback
       to guarantee fpc:false is written to storage before any reload can occur
  S12  Fixed again: fpc prompt still reappearing after password change
       Root cause: setEmployees wraps setEmployeesRaw — React calls the inner fn
       asynchronously, so save() inside it runs AFTER React's render cycle, not
       immediately. If anything interrupts that cycle, the save never happens.
       Fix: call setEmployeesRaw directly in completePasswordChange so save() is
       guaranteed to run synchronously in the same call stack as the state update.
  S13  Full debug pass on uploaded file — bugs found and fixed:
       CRITICAL: calcPayroll used wrong field names — emp.category (should be emp.cat)
                 and emp.monthlySalary (should be emp.salary). This caused all
                 Fixed and Executive employee payroll to return $0.
       HIGH:     ClockPanel `location` state shadowed window.location built-in.
                 Renamed to `workLocation` / `setWorkLocation` throughout.
                 ts.location data field preserved — only the state var was renamed.
       CONFIRMED OK (not bugs):
         - user.role === "manager" in sidebar/renderPanel = correct UI routing
         - useEffect inside ClockPanel = correct (those are component-level hooks)
         - .map() with {return} blocks = correct JSX pattern
         - unclosed [ on line 105 = inside changelog comment, not runtime code
  S14  Geofencing panel rebuilt with real interactive map (no API key required)
       First attempt: Google Maps JS API — required API key + billing, map hung
       without &callback= param. Switched to Leaflet + OpenStreetMap: 100% free,
       no account needed, works in Guyana.
       Features: drag zone labels to reposition, click-to-place crosshair mode,
       radius slider with quick-pick buttons (50/100/200/500/1000m), color swatches,
       lat/lng editable text inputs (paste-friendly, type="text" not type="number"),
       Zoom In button per zone, all zones drawn as colored circles simultaneously.
       CSS fix: added Leaflet overrides to prevent global *{margin:0;padding:0}
       from breaking tile layout. Added invalidateSize() at 100ms + 400ms after load
       to fix grey/incomplete tile rendering. Map container given position:relative
       + z-index:0 for correct internal Leaflet layer stacking.
  S15  Real GPS coordinates updated in INIT_GEOFENCES:
       Main Office — Georgetown : 6.813348605011895, -58.14785407612874
       CARICOM                  : 6.820398733945807, -58.11684933928277
       Warehouse Complex + Northfield Substation still use placeholder coords
       — update INIT_GEOFENCES when real coordinates are provided.
  S16  Reset Credentials button (🔑) added to each employee row in EmployeesPanel
       Positioned between ✏️ edit and Deactivate button.
       Shows confirmation dialog explaining the action before proceeding.
       On confirm: sets password="temp" and fpc=true so employee is forced to
       choose a new password on their next login.
       resetCreds() function added to EmployeesPanel (uses setConfirm for safety).
  S17  Real GPS geofencing on Clock In — no longer simulated
       navigator.geolocation.getCurrentPosition() triggered when employee selects
       a work location (not on login, not while browsing — only clock-in flow).
       States: idle | requesting | inside | outside | unavailable | no_zone
       Haversine distance formula added (haversineMetres) for accurate metre-level
       distance calculation between device position and zone centre.
       LOCATION_ZONE_MAP added to link WORK_LOCATIONS strings to INIT_GEOFENCES zones.
       GPS banner shows distance from centre when inside/outside zone.
       unavailable/no_zone states were allowing clock-in — this was incorrect.
  S18  Hard block on clock-in unless GPS confirms inside zone
       ONLY gps==="inside" enables the Clock In button — all other states block it.
       Rewrote clock-in card as 3-step flow: select location → enable GPS → verify.
       sandbox_blocked state detects iframe silently blocking geolocation (3s timer).
       Browser-specific instructions shown for Chrome/Edge, Firefox, Safari.
       denied and sandbox_blocked unified — same fix either way.
  S19  Full debug pass — 2 real bugs found and fixed:
       BUG 1 (HIGH): INIT_EMPLOYEES had geo as strings ("main-site", "warehouse")
         but architecture requires arrays. Fixed all 7 seed employees:
           1001,1002,1004,1005 → ["HEAD OFFICE"]
           1003                → ["CARICOM"]
           MGR001              → ["HEAD OFFICE","CARICOM"]
           ADMIN001            → all 7 locations
         Impact: Clock In location dropdown was silently showing all locations
         for seed employees instead of their assigned ones.
       BUG 2 (HIGH): Migration block did not convert old geo strings → arrays.
         Any employee stored in localStorage with geo:"string" would fail the
         Array.isArray() check silently. Fixed: migration now normalises geo
         to array on every load (typeof string → wrap in [], null/undefined → []).
       All other checks passed (21 checks total):
         calcPayroll fields, canClockIn guard, completePasswordChange Raw setter,
         position-based approvals, EmpForm scope, Leaflet/OSM geofencing,
         session persistence, payroll rates, GPS states, sandbox detection.
       ONLY gps==="inside" enables the Clock In button — all other states block it.
       Rewrote clock-in card as a 3-step flow:
         Step 1: Select work location (dropdown)
         Step 2: "📡 Enable Location Access" button appears — browser prompts user
                 to grant permission explicitly (not auto-requested on page load)
         Step 3: GPS check runs — Inside=green allow, Outside=red block with distance
       States that block clock-in: outside, denied, no_zone, unavailable, requesting
       "denied" state shows browser settings instructions to re-enable permission
       "outside" state shows distance and a Re-check button
       "unavailable" state shows Retry button
       "no_zone" tells employee to contact admin (location has no geofence yet)
       Re-check / Retry links available for outside/unavailable states
       navigator.geolocation.getCurrentPosition() triggered when employee selects
       a work location (not on login, not while browsing — only clock-in flow).
       States: idle | requesting | inside | outside | unavailable | no_zone
       Haversine distance formula added (haversineMetres) for accurate metre-level
       distance calculation between device position and zone centre.
       LOCATION_ZONE_MAP added to link WORK_LOCATIONS strings to INIT_GEOFENCES zones:
         HEAD OFFICE → Main Office — Georgetown
         CARICOM     → CARICOM
         EU/UN/DMC/ARU/CANTEEN → "no_zone" (no geofence configured yet)
       GPS banner shows distance from centre when inside/outside zone.
       Clock In button label changes: "📡 Checking location…" while requesting,
       "🚫 Outside Zone" if outside (button disabled), "🟢 Clock In" otherwise.
       unavailable/no_zone states allow clock-in with a warning (not blocked).
       Real GPS coords saved to ts.gIn and ts.gOut on timesheet record.
       Positioned between ✏️ edit and Deactivate button.
       Shows confirmation dialog explaining the action before proceeding.
       On confirm: sets password="temp" and fpc=true so employee is forced to
       choose a new password on their next login.
       resetCreds() function added to EmployeesPanel (uses setConfirm for safety).
*/

import { useState, useEffect, useRef, useCallback } from "react";

// ─── GUYANA 2026 PAYROLL ENGINE ───────────────────────────────────────────────
const TAX = {
  NIS_EMP: 0.056, NIS_EMPLR: 0.084,
  NIS_CEIL: 280000, PERSONAL_ALLOW: 100000,
  PAYE: 0.28, OT: 1.5, HOLIDAY: 2.0, WEEKEND: 1.5,
};

function calcPayroll(emp, hrs = { regular: 176, overtime: 0 }) {
  if (!emp) return { gross: 0, nisEmployee: 0, nisEmployer: 0, paye: 0, net: 0 };
  const gross = emp.cat === "Time"
    ? (hrs.regular * emp.hourlyRate) + (hrs.overtime * emp.hourlyRate * TAX.OT)
    : (emp.salary || 0);
  const nisBasis = Math.min(gross, TAX.NIS_CEIL);
  const nisEmp = +(nisBasis * TAX.NIS_EMP).toFixed(2);
  const nisEmplr = +(nisBasis * TAX.NIS_EMPLR).toFixed(2);
  const taxable = Math.max(0, gross - nisEmp - TAX.PERSONAL_ALLOW);
  const paye = +(taxable * TAX.PAYE).toFixed(2);
  const net = +(gross - nisEmp - paye).toFixed(2);
  return { gross: +gross.toFixed(2), nisEmployee: nisEmp, nisEmployer: nisEmplr, paye, net };
}

const fmt = n => `GYD ${(n||0).toLocaleString("en-GY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const uid = () => Math.random().toString(36).slice(2,8).toUpperCase();
const tsNow = () => new Date().toISOString().replace("T"," ").slice(0,16);
const timeNow = () => new Date().toTimeString().slice(0,5);
const dateToday = () => new Date().toISOString().split("T")[0];

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const INIT_EMPLOYEES = [
  { id:"1001", name:"Marcus Webb",    role:"employee", dept:"Security",    pos:"Security Officer",       cat:"Time",      hourlyRate:1800, salary:0,      fa:"Shift Supervisor",        sa:"Junior General Manager", email:"m.webb@fms.gy",    phone:"592-600-1001", status:"active", username:"1001",    password:"temp",       fpc:true,  joined:"2024-01-15", geo:["HEAD OFFICE"], av:"MW" },
  { id:"1002", name:"Priya Sharma",   role:"employee", dept:"Admin",       pos:"Office Clerk",           cat:"Fixed",     hourlyRate:0,    salary:185000, fa:"Operations Manager",      sa:"Junior General Manager", email:"p.sharma@fms.gy",  phone:"592-600-1002", status:"active", username:"1002",    password:"temp",       fpc:true,  joined:"2024-03-01", geo:["HEAD OFFICE"], av:"PS" },
  { id:"1003", name:"Devon Charles",  role:"employee", dept:"Logistics",   pos:"Warehouse Supervisor",   cat:"Fixed",     hourlyRate:0,    salary:220000, fa:"Operations Manager",      sa:"Junior General Manager", email:"d.charles@fms.gy", phone:"592-600-1003", status:"active", username:"1003",    password:"temp",       fpc:false, joined:"2023-09-10", geo:["CARICOM"],  av:"DC" },
  { id:"1004", name:"Jordan Baptiste",role:"employee", dept:"Security",    pos:"Security Officer",       cat:"Time",      hourlyRate:1800, salary:0,      fa:"Shift Supervisor",        sa:"Junior General Manager", email:"j.baptiste@fms.gy",phone:"592-600-1004", status:"active", username:"1004",    password:"temp",       fpc:true,  joined:"2025-01-05", geo:["HEAD OFFICE"], av:"JB" },
  { id:"1005", name:"Troy Mason",     role:"employee", dept:"Security",    pos:"Shift Supervisor",       cat:"Fixed",     hourlyRate:0,    salary:250000, fa:"Operations Manager",      sa:"Junior General Manager", email:"t.mason@fms.gy",   phone:"592-600-1005", status:"active", username:"1005",    password:"temp",       fpc:false, joined:"2023-03-15", geo:["HEAD OFFICE"], av:"TM" },
  { id:"MGR001",name:"Sandra Ali",    role:"manager",  dept:"Management",  pos:"Operations Manager",     cat:"Executive", hourlyRate:0,    salary:380000, fa:"Junior General Manager",  sa:"Junior General Manager", email:"s.ali@fms.gy",    phone:"592-600-2001", status:"active", username:"MGR001",  password:"manager123", fpc:false, joined:"2022-05-01", geo:["HEAD OFFICE","CARICOM"], av:"SA" },
  { id:"ADMIN001",name:"Shemar Ferguson",role:"admin", dept:"Administration",pos:"Junior General Manager",cat:"Executive",hourlyRate:0,   salary:520000, fa:"Junior General Manager",  sa:"Junior General Manager", email:"s.ferguson@fms.gy",phone:"592-600-9001",status:"active",username:"ADMIN001",password:"admin123",  fpc:false, joined:"2022-01-01", geo:["HEAD OFFICE","CARICOM","EU","UN","DMC","ARU","CANTEEN"], av:"SF" },
];

const INIT_TIMESHEETS = [
  { id:"TS001", eid:"1001", date:"2025-06-16", ci:"07:58", co:"16:02", reg:8,   ot:0, brk:30, gIn:{lat:6.8013,lng:-58.1553}, gOut:{lat:6.8013,lng:-58.1553}, status:"pending_employee",           eSig:null, f1Sig:null, f2Sig:null, notes:"", edited:false, hist:[] },
  { id:"TS002", eid:"1002", date:"2025-06-16", ci:"08:01", co:"17:05", reg:8,   ot:1, brk:60, gIn:{lat:6.8013,lng:-58.1553}, gOut:{lat:6.8013,lng:-58.1553}, status:"pending_first_approval",  eSig:{name:"Priya Sharma",  time:"2025-06-16 17:10",ip:"192.168.1.45"}, f1Sig:null, f2Sig:null, notes:"", edited:false, hist:[] },
  { id:"TS003", eid:"1003", date:"2025-06-15", ci:"06:30", co:"15:30", reg:8,   ot:1, brk:60, gIn:{lat:6.8045,lng:-58.1490}, gOut:{lat:6.8045,lng:-58.1490}, status:"pending_second_approval", eSig:{name:"Devon Charles", time:"2025-06-15 15:35",ip:"192.168.1.62"}, f1Sig:{name:"Sandra Ali",time:"2025-06-15 16:00",ip:"192.168.1.70"}, f2Sig:null, notes:"", edited:false, hist:[] },
  { id:"TS004", eid:"1004", date:"2025-06-14", ci:"07:45", co:"16:15", reg:8,   ot:0.5, brk:30, gIn:{lat:6.8013,lng:-58.1553}, gOut:{lat:6.8013,lng:-58.1553}, status:"approved", eSig:{name:"Jordan Baptiste",time:"2025-06-14 16:20",ip:"192.168.1.30"}, f1Sig:{name:"Sandra Ali",time:"2025-06-14 17:00",ip:"192.168.1.70"}, f2Sig:{name:"Shemar Ferguson",time:"2025-06-14 18:00",ip:"10.0.0.1"}, notes:"", edited:false, hist:[] },
  { id:"TS005", eid:"1001", date:"2025-06-13", ci:"08:00", co:"17:30", reg:8,   ot:1.5, brk:30, gIn:{lat:6.8013,lng:-58.1553}, gOut:{lat:6.8013,lng:-58.1553}, status:"approved", eSig:{name:"Marcus Webb",   time:"2025-06-13 17:35",ip:"192.168.1.11"}, f1Sig:{name:"Sandra Ali",time:"2025-06-13 18:00",ip:"192.168.1.70"}, f2Sig:{name:"Shemar Ferguson",time:"2025-06-13 19:00",ip:"10.0.0.1"}, notes:"", edited:false, hist:[] },
];

const INIT_REQUESTS = [
  { id:"REQ001", eid:"1001", type:"Leave",   sub:"Annual Leave",   start:"2025-06-25", end:"2025-06-27", reason:"Family vacation to Trinidad",    status:"pending",  at:"2025-06-10 09:30", comments:[] },
  { id:"REQ002", eid:"1002", type:"Overtime", sub:"Planned Overtime",date:"2025-06-20", hrs:3,           reason:"End of month reporting deadline",  status:"approved", at:"2025-06-12 14:00", comments:["Approved — Sandra Ali"] },
  { id:"REQ003", eid:"1003", type:"Leave",   sub:"Sick Leave",     start:"2025-06-18", end:"2025-06-18", reason:"Doctor's appointment",            status:"rejected", at:"2025-06-15 08:00", comments:["Not enough notice — S. Ferguson"] },
  { id:"REQ004", eid:"1004", type:"Shift Swap",sub:"Shift Swap",   start:"2025-06-22", end:"2025-06-22", reason:"Personal commitment",             status:"pending",  at:"2025-06-16 10:00", comments:[] },
];

const WORK_LOCATIONS = [
  "CARICOM",
  "EU",
  "UN",
  "DMC",
  "ARU",
  "HEAD OFFICE",
  "CANTEEN",
];

const INIT_GEOFENCES = [
  { id:"main-site",  name:"Main Office — Georgetown", lat:6.813348605011895, lng:-58.14785407612874, radius:150, color:"#00c9a7" },
  { id:"warehouse",  name:"CARICOM",                    lat:6.820398733945807, lng:-58.11684933928277, radius:200, color:"#f59e0b" },
  { id:"northfield", name:"Northfield Substation",     lat:6.8080, lng:-58.1600, radius:100, color:"#a855f7" },
];

// Maps WORK_LOCATIONS strings → INIT_GEOFENCES zone names (case-insensitive match)
// Add entries here as real coordinates are added to INIT_GEOFENCES
const LOCATION_ZONE_MAP = {
  "CARICOM":      "CARICOM",
  "HEAD OFFICE":  "Main Office — Georgetown",
  // EU, UN, DMC, ARU, CANTEEN → no zone yet (will show "No zone configured")
};

// Haversine formula — returns distance in metres between two lat/lng points
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#09111f", surf:"#101b2e", surfAlt:"#172234", border:"#1d2f47", borderLt:"#263f5f",
  gold:"#d4a843", goldLt:"#f0c96b", teal:"#00c9a7", tealDk:"#009d83",
  red:"#ef4444", green:"#22c55e", blue:"#3b82f6", purple:"#a855f7", orange:"#f97316",
  text:"#e8edf5", mid:"#94a3b8", dim:"#4a5568",
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", flexDirection:"column", gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type==="success"?`${C.teal}18`:t.type==="error"?`${C.red}18`:`${C.gold}18`,
          border:`1px solid ${t.type==="success"?C.teal:t.type==="error"?C.red:C.gold}60`,
          borderRadius:10, padding:"12px 16px", color:C.text, fontSize:13,
          display:"flex", alignItems:"center", gap:10, minWidth:260, boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          animation:"slideIn 0.2s ease",
        }}>
          <span style={{ fontSize:16 }}>{t.type==="success"?"✅":t.type==="error"?"❌":"ℹ️"}</span>
          <span style={{ flex:1 }}>{t.msg}</span>
          <button onClick={() => remove(t.id)} style={{ background:"none", border:"none", color:C.mid, cursor:"pointer", fontSize:16, padding:0, lineHeight:1 }}>×</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  const remove = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, add, remove };
}

// ─── BASE COMPONENTS ──────────────────────────────────────────────────────────
function Av({ letters, color=C.gold, size=36 }) {
  return <div style={{ width:size, height:size, borderRadius:"50%", background:`${color}20`, border:`2px solid ${color}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.34, fontWeight:700, color, flexShrink:0, fontFamily:"'DM Mono',monospace" }}>{letters}</div>;
}

function Badge({ label, type="neutral" }) {
  const m = { neutral:{bg:"#1d2f47",c:C.mid}, success:{bg:"#052e16",c:C.green}, warning:{bg:"#422006",c:C.orange}, error:{bg:"#450a0a",c:C.red}, info:{bg:"#0c1a3a",c:C.blue}, gold:{bg:"#2a1a00",c:C.gold}, purple:{bg:"#2d1b69",c:"#c084fc"} };
  const {bg,c} = m[type]||m.neutral;
  return <span style={{ background:bg, color:c, border:`1px solid ${c}44`, padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:700, letterSpacing:"0.04em", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>{label?.toString().toUpperCase()}</span>;
}

function Card({ children, style={} }) {
  return <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:12, padding:18, ...style }}>{children}</div>;
}

function Btn({ children, onClick, variant="primary", size="md", disabled=false, style={} }) {
  const [h, setH] = useState(false);
  const v = {
    primary: { bg:C.gold,       hbg:C.goldLt,   c:"#09111f", border:"none" },
    teal:    { bg:C.teal,       hbg:"#00e5c0",  c:"#09111f", border:"none" },
    ghost:   { bg:"transparent",hbg:C.surfAlt,  c:C.mid,     border:`1px solid ${C.border}` },
    danger:  { bg:"#450a0a",    hbg:"#600f0f",  c:C.red,     border:`1px solid ${C.red}44` },
    success: { bg:"#052e16",    hbg:"#064e20",  c:C.green,   border:`1px solid ${C.green}44` },
    purple:  { bg:"#2d1b69",    hbg:"#3d2880",  c:"#c084fc", border:`1px solid #a855f744` },
    orange:  { bg:"#431407",    hbg:"#5a1e0a",  c:C.orange,  border:`1px solid ${C.orange}44` },
    red:     { bg:C.red,        hbg:"#dc2626",  c:"#fff",    border:"none" },
  }[variant]||{bg:C.gold,hbg:C.goldLt,c:"#09111f",border:"none"};
  const s = { sm:{p:"4px 10px",fs:11}, md:{p:"7px 16px",fs:13}, lg:{p:"11px 24px",fs:14} }[size]||{p:"7px 16px",fs:13};
  return (
    <button onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      onClick={disabled?undefined:onClick} disabled={disabled}
      style={{ background:disabled?C.border:h?v.hbg:v.bg, color:disabled?C.dim:v.c, border:v.border,
        borderRadius:8, cursor:disabled?"not-allowed":"pointer", fontWeight:700, letterSpacing:"0.02em",
        display:"inline-flex", alignItems:"center", gap:5, fontFamily:"'DM Sans',sans-serif",
        transition:"all 0.15s", padding:s.p, fontSize:s.fs, flexShrink:0, ...style }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, type="text", placeholder, disabled, style={} }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, ...style }}>
      {label && <label style={{ color:C.mid, fontSize:11, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace" }}>{label.toUpperCase()}</label>}
      <input type={type} value={value??""} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{ background:disabled?`${C.surfAlt}88`:C.surfAlt, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", width:"100%", boxSizing:"border-box", opacity:disabled?0.6:1 }} />
    </div>
  );
}

function Sel({ label, value, onChange, options, style={} }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, ...style }}>
      {label && <label style={{ color:C.mid, fontSize:11, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace" }}>{label.toUpperCase()}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{ background:C.surfAlt, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", width:"100%", boxSizing:"border-box" }}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Modal({ title, onClose, children, width=600 }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:16, width:"100%", maxWidth:width, maxHeight:"90vh", overflow:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.9)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 22px", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:C.surf, zIndex:1 }}>
          <h2 style={{ margin:0, fontSize:15, fontWeight:800, color:C.text, fontFamily:"'DM Sans',sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background:`${C.red}20`, border:`1px solid ${C.red}40`, color:C.red, cursor:"pointer", padding:"4px 8px", borderRadius:6, fontWeight:700, fontSize:14 }}>✕</button>
        </div>
        <div style={{ padding:22 }}>{children}</div>
      </div>
    </div>
  );
}

function Confirm({ msg, onConfirm, onCancel }) {
  return (
    <Modal title="Confirm Action" onClose={onCancel} width={400}>
      <p style={{ color:C.mid, fontSize:14, marginBottom:24, lineHeight:1.6 }}>{msg}</p>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant="red" onClick={onConfirm}>🗑 Confirm Delete</Btn>
      </div>
    </Modal>
  );
}

function Checkbox({ checked, onChange, indeterminate=false }) {
  const ref = useRef();
  useEffect(() => { if(ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}
      style={{ width:15, height:15, accentColor:C.gold, cursor:"pointer", flexShrink:0 }} />
  );
}

function Th({ children }) {
  return <th style={{ padding:"11px 14px", textAlign:"left", fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.06em", whiteSpace:"nowrap", fontFamily:"'DM Mono',monospace", borderBottom:`1px solid ${C.border}`, background:C.surfAlt }}>{children}</th>;
}

function Td({ children, mono=false, style={} }) {
  return <td style={{ padding:"10px 14px", fontSize:13, color:C.text, fontFamily:mono?"'DM Mono',monospace":"'DM Sans',sans-serif", borderBottom:`1px solid ${C.border}`, ...style }}>{children}</td>;
}

function SectionH({ title, sub }) {
  return <div style={{ marginBottom:20 }}>
    <h2 style={{ margin:0, fontSize:20, fontWeight:900, color:C.text, fontFamily:"'DM Sans',sans-serif", letterSpacing:"-0.01em" }}>{title}</h2>
    {sub && <p style={{ margin:"4px 0 0", color:C.mid, fontSize:13 }}>{sub}</p>}
  </div>;
}

function StatCard({ label, value, sub, color=C.teal }) {
  return (
    <Card>
      <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.08em", marginBottom:6, fontFamily:"'DM Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize:28, fontWeight:900, color, lineHeight:1, fontFamily:"'DM Mono',monospace" }}>{value}</div>
      {sub && <div style={{ color:C.dim, fontSize:11, marginTop:5 }}>{sub}</div>}
    </Card>
  );
}

function BulkBar({ count, onDelete, onClear }) {
  if (!count) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", background:`${C.gold}15`, border:`1px solid ${C.gold}40`, borderRadius:8, marginBottom:12 }}>
      <span style={{ color:C.gold, fontWeight:700, fontSize:13 }}>{count} selected</span>
      <Btn variant="red" size="sm" onClick={onDelete}>🗑 Delete Selected</Btn>
      <Btn variant="ghost" size="sm" onClick={onClear}>Clear Selection</Btn>
    </div>
  );
}

// status helpers
const tsStatusBadge = (s) => {
  const m = { pending_employee:["Awaiting Employee","warning"], pending_first_approval:["Pending 1st Sign","info"], pending_second_approval:["Pending 2nd Sign","purple"], approved:["Approved","success"], rejected:["Rejected","error"] };
  const [l,t] = m[s]||[s,"neutral"]; return <Badge label={l} type={t} />;
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// ─── FORCE PASSWORD CHANGE ────────────────────────────────────────────────────
function ForcePasswordChange({ user, onComplete, onLogout }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");

  const handle = () => {
    if (pw1.length < 4) { setErr("Password must be at least 4 characters."); return; }
    if (pw1 !== pw2) { setErr("Passwords do not match."); return; }
    if (pw1 === "temp") { setErr("You cannot reuse the default password."); return; }
    onComplete(pw1);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔑</div>
          <div style={{ fontSize:26, fontWeight:900, color:C.text, marginBottom:6 }}>Set Your Password</div>
          <div style={{ fontSize:14, color:C.mid }}>Welcome, <strong style={{ color:C.gold }}>{user.name}</strong>.</div>
          <div style={{ fontSize:13, color:C.mid, marginTop:4 }}>Your account requires a new password before you can continue.</div>
        </div>

        {/* Card */}
        <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:16, padding:28 }}>
          <div style={{ padding:"10px 14px", background:`${C.orange}12`, border:`1px solid ${C.orange}35`, borderRadius:8, marginBottom:20, fontSize:12, color:C.orange }}>
            ⚠️ You are logged in with a temporary password. Please set a new password to continue.
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <div style={{ fontSize:12, color:C.mid, fontWeight:600, marginBottom:6 }}>New Password</div>
              <input
                type="password"
                value={pw1}
                onChange={e => { setPw1(e.target.value); setErr(""); }}
                placeholder="Enter new password"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handle()}
                style={{ width:"100%", background:C.surfAlt, border:`1px solid ${pw1 ? C.teal : C.border}`, borderRadius:8, color:C.text, padding:"11px 14px", fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:"none" }}
              />
            </div>
            <div>
              <div style={{ fontSize:12, color:C.mid, fontWeight:600, marginBottom:6 }}>Confirm New Password</div>
              <input
                type="password"
                value={pw2}
                onChange={e => { setPw2(e.target.value); setErr(""); }}
                placeholder="Re-enter new password"
                onKeyDown={e => e.key === "Enter" && handle()}
                style={{ width:"100%", background:C.surfAlt, border:`1px solid ${pw2 && pw2===pw1 ? C.green : pw2 ? C.red : C.border}`, borderRadius:8, color:C.text, padding:"11px 14px", fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:"none" }}
              />
              {pw2 && pw1 === pw2 && <div style={{ fontSize:11, color:C.green, marginTop:4 }}>✓ Passwords match</div>}
              {pw2 && pw1 !== pw2 && <div style={{ fontSize:11, color:C.red, marginTop:4 }}>✗ Passwords do not match</div>}
            </div>

            {err && (
              <div style={{ padding:"9px 12px", background:`${C.red}15`, border:`1px solid ${C.red}40`, borderRadius:8, fontSize:13, color:C.red }}>
                {err}
              </div>
            )}

            <button
              onClick={handle}
              disabled={!pw1 || !pw2}
              style={{ background:pw1&&pw2?C.teal:C.border, border:"none", borderRadius:10, color:pw1&&pw2?C.bg:C.dim, padding:"13px", fontSize:15, fontWeight:800, cursor:pw1&&pw2?"pointer":"not-allowed", fontFamily:"'DM Sans',sans-serif", transition:"all 0.2s" }}
            >
              Set Password & Continue →
            </button>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:16 }}>
          <button onClick={onLogout} style={{ background:"none", border:"none", color:C.dim, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

function Login({ allEmployees, onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const handle = () => {
    setLoading(true); setErr("");
    setTimeout(() => {
      const emp = allEmployees.find(e => e.username===u && e.password===p && e.status==="active");
      if (emp) onLogin(emp); else setErr("Invalid credentials or account inactive.");
      setLoading(false);
    }, 500);
  };
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20, position:"relative", overflow:"hidden", fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:`radial-gradient(${C.borderLt}22 1px, transparent 1px)`, backgroundSize:"32px 32px" }} />
      <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:`${C.gold}06`, top:-150, right:-150 }} />
      <div style={{ position:"absolute", width:350, height:350, borderRadius:"50%", background:`${C.teal}06`, bottom:-100, left:-100 }} />
      <div style={{ position:"relative", width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:60, height:60, borderRadius:14, background:`${C.gold}18`, border:`2px solid ${C.gold}50`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:26 }}>⚡</div>
          <h1 style={{ margin:0, fontSize:26, fontWeight:900, color:C.text, letterSpacing:"-0.02em" }}>FMS <span style={{ color:C.gold }}>TimeTrack</span></h1>
          <p style={{ margin:"4px 0 0", color:C.mid, fontSize:12 }}>Federal Management Systems · Guyana 2026</p>
        </div>
        <Card style={{ boxShadow:"0 24px 60px rgba(0,0,0,0.7)" }}>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>Sign in</div>
            <div style={{ fontSize:12, color:C.mid, marginTop:2 }}>Use employee number or admin ID</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Input label="Username" value={u} onChange={setU} placeholder="ADMIN001 / MGR001 / 1001" />
            <Input label="Password" type="password" value={p} onChange={setP} placeholder="Password" />
            {err && <div style={{ background:"#450a0a", border:`1px solid ${C.red}50`, borderRadius:8, padding:"9px 12px", color:C.red, fontSize:12 }}>⚠ {err}</div>}
            <Btn onClick={handle} disabled={loading||!u||!p} size="lg" style={{ width:"100%", justifyContent:"center", marginTop:4 }}>{loading?"Authenticating…":"Sign In"}</Btn>
          </div>
          <div style={{ marginTop:18, padding:14, background:C.surfAlt, borderRadius:8, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:10, color:C.dim, fontWeight:700, letterSpacing:"0.08em", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>DEMO ACCOUNTS</div>
            {[["Admin","ADMIN001","admin123",C.gold],["Manager","MGR001","manager123",C.teal],["Employee","1001","temp",C.blue]].map(([r,un,pw,c])=>(
              <div key={un} onClick={()=>{setU(un);setP(pw);}} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.mid, marginBottom:4, cursor:"pointer", padding:"3px 6px", borderRadius:4, transition:"background 0.1s" }}
                onMouseEnter={e=>e.currentTarget.style.background=C.surfAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{ color:c, fontWeight:700 }}>{r}</span>
                <span style={{ fontFamily:"'DM Mono',monospace" }}>{un} / {pw}</span>
              </div>
            ))}
            <div style={{ fontSize:10, color:C.dim, marginTop:6 }}>↑ Click any row to auto-fill</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ user, tab, setTab, onLogout }) {
  const nav = user.role==="admin" ? [
    {id:"dashboard",label:"Dashboard",icon:"📊"},{id:"employees",label:"Employees",icon:"👥"},
    {id:"timesheets",label:"Timesheets",icon:"🕐"},{id:"approvals",label:"Approvals",icon:"✍️"},
    {id:"payroll",label:"Payroll",icon:"💰"},{id:"geofencing",label:"Geofencing",icon:"📍"},
    {id:"requests",label:"Requests",icon:"📋"},{id:"reports",label:"Reports",icon:"📄"},
    {id:"settings",label:"Settings",icon:"⚙️"},
  ] : user.role==="manager" ? [
    {id:"dashboard",label:"Dashboard",icon:"📊"},{id:"approvals",label:"Approvals",icon:"✍️"},
    {id:"timesheets",label:"Timesheets",icon:"🕐"},{id:"requests",label:"Requests",icon:"📋"},
  ] : [
    {id:"clock",label:"My Time",icon:"🕐"},{id:"requests",label:"Requests",icon:"📋"},
    {id:"payslips",label:"Pay Slips",icon:"💳"},
  ];
  const rc = user.role==="admin"?C.gold:user.role==="manager"?C.teal:C.blue;
  return (
    <div style={{ width:210, flexShrink:0, background:C.surf, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", height:"100vh", position:"sticky", top:0 }}>
      <div style={{ padding:"18px 16px 14px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:17, fontWeight:900, color:C.text }}>FMS <span style={{ color:C.gold }}>Track</span></div>
        <div style={{ fontSize:10, color:C.dim, marginTop:1, letterSpacing:"0.07em", fontFamily:"'DM Mono',monospace" }}>WORKFORCE PLATFORM</div>
      </div>
      <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:10, alignItems:"center" }}>
        <Av letters={user.av} color={rc} size={34} />
        <div style={{ overflow:"hidden" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{user.name}</div>
          <div style={{ fontSize:10, color:rc, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace" }}>{user.role.toUpperCase()}</div>
        </div>
      </div>
      <nav style={{ flex:1, padding:"10px 8px", overflowY:"auto" }}>
        {nav.map(item => {
          const active = tab===item.id;
          return (
            <button key={item.id} onClick={()=>setTab(item.id)}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, marginBottom:2, background:active?`${rc}18`:"transparent", color:active?rc:C.mid, border:active?`1px solid ${rc}35`:"1px solid transparent", cursor:"pointer", fontSize:13, fontWeight:active?700:500, fontFamily:"'DM Sans',sans-serif", transition:"all 0.12s", textAlign:"left" }}>
              <span style={{ fontSize:15 }}>{item.icon}</span>{item.label}
            </button>
          );
        })}
      </nav>
      <div style={{ padding:8, borderTop:`1px solid ${C.border}` }}>
        <button onClick={onLogout} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:"transparent", color:C.mid, border:"1px solid transparent", cursor:"pointer", fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
          🚪 Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function Dashboard({ employees, timesheets, requests, setTab }) {
  const active = employees.filter(e=>e.status==="active").length;
  const pendingA = timesheets.filter(t=>["pending_first_approval","pending_second_approval"].includes(t.status)).length;
  const pendingR = requests.filter(r=>r.status==="pending").length;
  const approved = timesheets.filter(t=>t.status==="approved").length;
  const clockedIn = 5;

  const activity = [
    {text:"Devon Charles timesheet pending 2nd signature",time:"2m ago",c:C.gold,icon:"✍️"},
    {text:"Priya Sharma submitted overtime request",time:"15m ago",c:C.blue,icon:"📋"},
    {text:"Jordan Baptiste timesheet fully approved",time:"1h ago",c:C.teal,icon:"✅"},
    {text:"Marcus Webb clocked in — Main Site",time:"2h ago",c:C.green,icon:"📍"},
    {text:"Payroll generated for June 2025",time:"Yesterday",c:C.purple,icon:"💰"},
  ];

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:C.text, letterSpacing:"-0.01em" }}>Admin Dashboard</h1>
        <p style={{ margin:"3px 0 0", color:C.mid, fontSize:13 }}>{new Date().toLocaleDateString("en-GY",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:22 }}>
        <StatCard label="Active Employees" value={active} sub={`${employees.length-active} inactive`} color={C.teal} />
        <StatCard label="Clocked In" value={clockedIn} sub="Currently on site" color={C.green} />
        <StatCard label="Pending Approvals" value={pendingA} sub="Need signatures" color={C.gold} />
        <StatCard label="Approved Sheets" value={approved} sub="Payroll ready" color={C.blue} />
        <StatCard label="Open Requests" value={pendingR} sub="Awaiting action" color={C.orange} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.6fr 1fr", gap:14 }}>
        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:14 }}>Recent Activity</div>
          {activity.map((a,i)=>(
            <div key={i} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"flex-start", padding:"8px 10px", background:i%2?`${C.surfAlt}60`:"transparent", borderRadius:6 }}>
              <span style={{ fontSize:14 }}>{a.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:C.text }}>{a.text}</div>
                <div style={{ fontSize:11, color:C.dim, marginTop:1 }}>{a.time}</div>
              </div>
            </div>
          ))}
        </Card>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:12 }}>Quick Actions</div>
            {[["👥 Add Employee","employees"],["✍️ Review Approvals","approvals"],["💰 Run Payroll","payroll"],["📄 View Reports","reports"]].map(([label,t])=>(
              <button key={t} onClick={()=>setTab(t)} style={{ width:"100%", background:C.surfAlt, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", textAlign:"left", marginBottom:6, transition:"background 0.15s" }}
                onMouseEnter={e=>e.target.style.background=C.borderLt} onMouseLeave={e=>e.target.style.background=C.surfAlt}>
                {label}
              </button>
            ))}
          </Card>
          <Card>
            <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:12 }}>Payroll Status</div>
            {[["June 2025","In Progress",C.gold],["May 2025","Processed",C.green],["April 2025","Archived",C.dim]].map(([p,s,c])=>(
              <div key={p} style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
                <span style={{ color:C.mid }}>{p}</span><span style={{ color:c, fontWeight:700 }}>{s}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── EMPLOYEE FORM (top-level so React never remounts inputs on state change) ─
function EmpForm({ data, onChange, employees }) {
  const SUPERVISORY_KEYWORDS = ["supervisor","manager","lead","chief","head","coordinator","director","superintendent","foreman","general manager"];
  const isSupervisory = e => SUPERVISORY_KEYWORDS.some(k => e.pos.toLowerCase().includes(k)) || e.role === "manager" || e.role === "admin";

  // Get unique position titles for 1st sign-off (any supervisory position)
  const firstSignOffPositions = [...new Set(
    employees
      .filter(e => e.status === "active" && isSupervisory(e) && e.pos !== data.pos)
      .sort((a, b) => a.pos.localeCompare(b.pos))
      .map(e => e.pos)
  )];

  // Get unique position titles for 2nd sign-off (managers & admins only)
  const secondSignOffPositions = [...new Set(
    employees
      .filter(e => e.status === "active" && (e.role === "manager" || e.role === "admin"))
      .sort((a, b) => a.pos.localeCompare(b.pos))
      .map(e => e.pos)
  )];

  // Who currently holds the selected positions
  const fa1Holders = employees.filter(e => e.pos === data.fa && e.status === "active");
  const fa2Holders = employees.filter(e => e.pos === data.sa && e.status === "active");

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Personal Info */}
      <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.07em", fontFamily:"'DM Mono',monospace", paddingBottom:4, borderBottom:`1px solid ${C.border}` }}>PERSONAL INFORMATION</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Input label="Full Name *" value={data.name} onChange={v=>onChange({name:v})} style={{gridColumn:"1/-1"}} />
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <Input label="Employee ID *" value={data.customId||""} onChange={v=>onChange({customId:v.toUpperCase().replace(/\s/g,"")})} placeholder="e.g. 1006, SEC007" />
          <div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace", paddingLeft:2 }}>Used to log in · auto-set as username</div>
        </div>
        <Input label="Phone" value={data.phone} onChange={v=>onChange({phone:v})} />
      </div>

      {/* Role & Pay */}
      <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.07em", fontFamily:"'DM Mono',monospace", paddingBottom:4, borderBottom:`1px solid ${C.border}`, marginTop:2 }}>ROLE & COMPENSATION</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Input label="Department *" value={data.dept} onChange={v=>onChange({dept:v})} />
        <Input label="Position / Job Title" value={data.pos} onChange={v=>onChange({pos:v})} />
        <Sel label="Employee Category" value={data.cat} onChange={v=>onChange({cat:v})} options={["Fixed","Time","Executive"].map(v=>({value:v,label:v}))} />
        {data.cat==="Time"
          ? <Input label="Hourly Rate (GYD)" value={data.hourlyRate} onChange={v=>onChange({hourlyRate:+v})} type="number" />
          : <Input label="Monthly Salary (GYD)" value={data.salary} onChange={v=>onChange({salary:+v})} type="number" />
        }
      </div>

      {/* Assigned Locations — multi-select */}
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ fontSize:12, color:C.mid, fontWeight:600 }}>Assigned Work Locations <span style={{ color:C.dim }}>(select all that apply)</span></div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"12px 14px", background:C.surfAlt, borderRadius:10, border:`1px solid ${C.border}` }}>
          {WORK_LOCATIONS.map(loc => {
            const geos = Array.isArray(data.geo) ? data.geo : (data.geo ? [data.geo] : []);
            const checked = geos.includes(loc);
            return (
              <label key={loc} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", padding:"6px 12px", borderRadius:20, background:checked?`${C.teal}20`:`${C.surf}`, border:`1px solid ${checked?C.teal:C.border}`, transition:"all 0.15s" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const current = Array.isArray(data.geo) ? data.geo : (data.geo ? [data.geo] : []);
                    const next = checked ? current.filter(g=>g!==loc) : [...current, loc];
                    onChange({ geo: next });
                  }}
                  style={{ accentColor:C.teal, width:14, height:14 }}
                />
                <span style={{ fontSize:12, fontWeight:checked?700:400, color:checked?C.teal:C.mid, fontFamily:"'DM Mono',monospace" }}>{loc}</span>
              </label>
            );
          })}
        </div>
        {(!data.geo || (Array.isArray(data.geo) && data.geo.length === 0)) && (
          <div style={{ fontSize:11, color:C.dim, paddingLeft:2 }}>No locations selected — employee can clock in at any site</div>
        )}
        {Array.isArray(data.geo) && data.geo.length > 0 && (
          <div style={{ fontSize:11, color:C.teal, paddingLeft:2 }}>✓ Assigned to: {data.geo.join(", ")}</div>
        )}
      </div>

      {/* Reporting / Sign-Off Chain */}
      <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.07em", fontFamily:"'DM Mono',monospace", paddingBottom:4, borderBottom:`1px solid ${C.border}`, marginTop:2 }}>REPORTING & TIMESHEET SIGN-OFF CHAIN</div>
      <div style={{ fontSize:12, color:C.mid, marginBottom:4 }}>
        Select the <strong style={{ color:C.text }}>position</strong> that must sign off — any staff member holding that position can approve.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* 1st Sign-Off — position title */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <Sel
            label="Reporting To — 1st Sign-Off *"
            value={data.fa}
            onChange={v=>onChange({fa:v})}
            options={[
              { value:"", label:"— Select Position —" },
              ...firstSignOffPositions.map(pos => ({ value: pos, label: pos }))
            ]}
          />
          {/* Show who currently holds this position */}
          {data.fa && fa1Holders.length > 0 && (
            <div style={{ padding:"8px 10px", background:`${C.teal}10`, border:`1px solid ${C.teal}30`, borderRadius:7 }}>
              <div style={{ fontSize:10, color:C.teal, fontWeight:700, letterSpacing:"0.05em", marginBottom:4, fontFamily:"'DM Mono',monospace" }}>CURRENTLY HELD BY</div>
              {fa1Holders.map(h => (
                <div key={h.id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <Av letters={h.av} size={18} color={C.teal} />
                  <span style={{ fontSize:12, color:C.mid }}>{h.name} <span style={{ color:C.dim }}>· {h.dept}</span></span>
                </div>
              ))}
            </div>
          )}
          {data.fa && fa1Holders.length === 0 && (
            <div style={{ padding:"7px 10px", background:`${C.orange}10`, border:`1px solid ${C.orange}30`, borderRadius:7, fontSize:11, color:C.orange }}>
              ⚠️ No active staff hold this position
            </div>
          )}
        </div>

        {/* 2nd Sign-Off — position title */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <Sel
            label="Final Approver — 2nd Sign-Off *"
            value={data.sa}
            onChange={v=>onChange({sa:v})}
            options={[
              { value:"", label:"— Select Position —" },
              ...secondSignOffPositions.map(pos => ({ value: pos, label: pos }))
            ]}
          />
          {data.sa && fa2Holders.length > 0 && (
            <div style={{ padding:"8px 10px", background:`${C.gold}10`, border:`1px solid ${C.gold}30`, borderRadius:7 }}>
              <div style={{ fontSize:10, color:C.gold, fontWeight:700, letterSpacing:"0.05em", marginBottom:4, fontFamily:"'DM Mono',monospace" }}>CURRENTLY HELD BY</div>
              {fa2Holders.map(h => (
                <div key={h.id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <Av letters={h.av} size={18} color={C.gold} />
                  <span style={{ fontSize:12, color:C.mid }}>{h.name} <span style={{ color:C.dim }}>· {h.dept}</span></span>
                </div>
              ))}
            </div>
          )}
          {data.sa && fa2Holders.length === 0 && (
            <div style={{ padding:"7px 10px", background:`${C.orange}10`, border:`1px solid ${C.orange}30`, borderRadius:7, fontSize:11, color:C.orange }}>
              ⚠️ No active staff hold this position
            </div>
          )}
        </div>
      </div>

      {/* Live chain preview */}
      {(data.fa || data.sa) && (
        <div style={{ padding:"12px 16px", background:`${C.gold}10`, border:`1px solid ${C.gold}30`, borderRadius:10 }}>
          <div style={{ fontSize:10, color:C.gold, fontWeight:700, letterSpacing:"0.07em", marginBottom:10, fontFamily:"'DM Mono',monospace" }}>APPROVAL CHAIN PREVIEW</div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            {/* Employee */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:80 }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:`${C.blue}20`, border:`2px solid ${C.blue}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:C.blue }}>
                {data.name ? data.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "??"}
              </div>
              <div style={{ fontSize:11, color:C.blue, fontWeight:700, textAlign:"center", maxWidth:90 }}>{data.pos||"New Employee"}</div>
              <div style={{ fontSize:10, color:C.mid, textAlign:"center", maxWidth:90 }}>{data.name||"—"}</div>
            </div>
            <div style={{ color:C.dim, fontSize:20 }}>→</div>
            {/* 1st Sign-Off */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:100 }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:data.fa?`${C.teal}20`:`${C.border}40`, border:`2px solid ${data.fa?C.teal:C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:data.fa?C.teal:C.dim, textAlign:"center", padding:4 }}>
                {data.fa ? "✍️" : "?"}
              </div>
              <div style={{ fontSize:11, color:data.fa?C.teal:C.dim, fontWeight:700, textAlign:"center", maxWidth:110 }}>{data.fa||"Not set"}</div>
              <div style={{ fontSize:9, color:C.teal, fontFamily:"'DM Mono',monospace" }}>1ST SIGN-OFF</div>
              {data.fa && <div style={{ fontSize:9, color:C.dim, textAlign:"center" }}>Any {data.fa}</div>}
            </div>
            <div style={{ color:C.dim, fontSize:20 }}>→</div>
            {/* 2nd Sign-Off */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:100 }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:data.sa?`${C.gold}20`:`${C.border}40`, border:`2px solid ${data.sa?C.gold:C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:data.sa?C.gold:C.dim, textAlign:"center", padding:4 }}>
                {data.sa ? "✅" : "?"}
              </div>
              <div style={{ fontSize:11, color:data.sa?C.gold:C.dim, fontWeight:700, textAlign:"center", maxWidth:110 }}>{data.sa||"Not set"}</div>
              <div style={{ fontSize:9, color:C.gold, fontFamily:"'DM Mono',monospace" }}>FINAL SIGN-OFF</div>
              {data.sa && <div style={{ fontSize:9, color:C.dim, textAlign:"center" }}>Any {data.sa}</div>}
            </div>
            <div style={{ color:C.dim, fontSize:20 }}>→</div>
            {/* Payroll */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:`${C.green}20`, border:`2px solid ${C.green}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>💰</div>
              <div style={{ fontSize:11, color:C.green, fontWeight:700 }}>Payroll</div>
              <div style={{ fontSize:9, color:C.green, fontFamily:"'DM Mono',monospace" }}>PROCESSED</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EMPLOYEES PANEL ─────────────────────────────────────────────────────────
function EmployeesPanel({ employees, setEmployees, toast }) {
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [viewEmp, setViewEmp] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name:"", customId:"", phone:"", dept:"", pos:"", cat:"Fixed", hourlyRate:0, salary:0, fa:"", sa:"", geo:[] });
  const f = v => setForm(p=>({...p,...v}));

  const visible = employees.filter(e => e.role!=="admin" && (e.name.toLowerCase().includes(search.toLowerCase())||e.dept.toLowerCase().includes(search.toLowerCase())||e.id.includes(search)));
  const allChecked = sel.size===visible.length && visible.length>0;
  const someChecked = sel.size>0 && sel.size<visible.length;

  const toggleAll = () => allChecked ? setSel(new Set()) : setSel(new Set(visible.map(e=>e.id)));
  const toggleOne = id => { const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); setSel(s); };

  const deleteOne = (id) => { setConfirm({ msg:`Delete employee ${employees.find(e=>e.id===id)?.name}? This cannot be undone.`, onOk:()=>{ setEmployees(p=>p.filter(e=>e.id!==id)); setSel(p=>{const s=new Set(p);s.delete(id);return s;}); toast(`Employee deleted`,"success"); setConfirm(null); }}); };
  const deleteSel = () => { setConfirm({ msg:`Delete ${sel.size} employee(s)? This cannot be undone.`, onOk:()=>{ setEmployees(p=>p.filter(e=>!sel.has(e.id))); setSel(new Set()); toast(`${sel.size} employees deleted`,"success"); setConfirm(null); }}); };

  const [newEmpCreds, setNewEmpCreds] = useState(null);

  const addEmployee = () => {
    if(!form.name.trim()||!form.dept.trim()||!form.customId?.trim()) return;
    if(employees.find(e => e.id === form.customId)) { toast(`Employee ID "${form.customId}" already exists — choose a different ID`,"error"); return; }
    const empId = form.customId.trim().toUpperCase();
    const n = {
      ...form,
      id: empId,
      username: empId,
      password: "temp",
      role: "employee",
      status: "active",
      av: form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(),
      fpc: true,
      joined: dateToday(),
      email: "",
    };
    delete n.customId;
    setEmployees(p=>[...p,n]);
    setShowAdd(false);
    setNewEmpCreds({ name: n.name, id: empId, pos: n.pos, dept: n.dept });
    setForm({ name:"", customId:"", phone:"", dept:"", pos:"", cat:"Fixed", hourlyRate:0, salary:0, fa:"", sa:"", geo:[] });
  };

  const saveEdit = () => { setEmployees(p=>p.map(e=>e.id===editEmp.id?editEmp:e)); setEditEmp(null); toast("Employee updated","success"); };
  const toggleStatus = id => { setEmployees(p=>p.map(e=>e.id===id?{...e,status:e.status==="active"?"inactive":"active"}:e)); toast("Status updated","success"); };
  const resetCreds = id => setConfirm({ msg:`Reset credentials for ${employees.find(e=>e.id===id)?.name}? Their password will be set back to "temp" and they'll be prompted to change it on next login.`, onOk:()=>{ setEmployees(p=>p.map(e=>e.id===id?{...e,password:"temp",fpc:true}:e)); toast(`Credentials reset — password is now "temp"`,"success"); setConfirm(null); }});

  const exportCSV = () => {
    const rows=[["ID","Name","Department","Position","Category","Salary/Rate","Status","Email","Phone","Joined"],...employees.filter(e=>e.role!=="admin").map(e=>[e.id,e.name,e.dept,e.pos,e.cat,e.cat==="Time"?e.hourlyRate:e.salary,e.status,e.email,e.phone,e.joined])];
    const csv=rows.map(r=>r.join(",")).join("\n"); const b=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="FMS_Employees.csv"; a.click(); toast("Employees exported","success");
  };

  return (
    <div>
      <SectionH title="Employee Management" sub="Manage workforce records, categories and approval chains" />
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <Input value={search} onChange={setSearch} placeholder="Search name, dept, ID…" style={{ flex:1, minWidth:200 }} />
        <Btn onClick={()=>setShowAdd(true)}>➕ Add Employee</Btn>
        <Btn variant="ghost" onClick={exportCSV}>⬇️ Export CSV</Btn>
        <Btn variant="ghost" onClick={()=>{ document.getElementById("csvImport")?.click(); }}>⬆️ Import CSV</Btn>
        <input id="csvImport" type="file" accept=".csv" style={{display:"none"}} onChange={()=>toast("CSV import simulated — connect backend to process","info")} />
      </div>

      <BulkBar count={sel.size} onDelete={deleteSel} onClear={()=>setSel(new Set())} />

      <Card style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <Th><Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} /></Th>
              <Th>Employee</Th><Th>ID</Th><Th>Department</Th><Th>Category</Th><Th>Compensation</Th><Th>Reporting To</Th><Th>Status</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length===0 && <tr><Td style={{textAlign:"center",color:C.dim,padding:32}} colSpan="9">No employees found</Td></tr>}
            {visible.map((emp,i)=>{
              const fa1 = employees.find(e=>e.id===emp.fa);
              return (
              <tr key={emp.id} style={{ background:sel.has(emp.id)?`${C.gold}08`:i%2?`${C.surfAlt}40`:"transparent" }}>
                <Td><Checkbox checked={sel.has(emp.id)} onChange={()=>toggleOne(emp.id)} /></Td>
                <Td>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Av letters={emp.av} color={emp.role==="manager"?C.teal:C.blue} size={30} />
                    <div>
                      <div style={{ fontWeight:700, color:C.text }}>{emp.name}</div>
                      <div style={{ fontSize:11, color:C.dim }}>{emp.pos}</div>
                    </div>
                  </div>
                </Td>
                <Td mono>{emp.id}</Td>
                <Td><span style={{ color:C.mid }}>{emp.dept}</span></Td>
                <Td><Badge label={emp.cat} type={emp.cat==="Executive"?"gold":emp.cat==="Fixed"?"info":"neutral"} /></Td>
                <Td mono><span style={{ color:C.teal }}>{emp.cat==="Time"?`${fmt(emp.hourlyRate)}/hr`:fmt(emp.salary)}</span></Td>
                <Td>
                  {fa1 ? (
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Av letters={fa1.av} size={22} color={C.teal} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.teal }}>{fa1.pos}</div>
                        <div style={{ fontSize:10, color:C.dim }}>{fa1.name}</div>
                      </div>
                    </div>
                  ) : <span style={{ color:C.dim, fontSize:12 }}>Not set</span>}
                </Td>
                <Td><Badge label={emp.status} type={emp.status==="active"?"success":"error"} /></Td>
                <Td>
                  <div style={{ display:"flex", gap:5 }}>
                    <Btn variant="ghost" size="sm" onClick={()=>setViewEmp(emp)}>👁</Btn>
                    <Btn variant="ghost" size="sm" onClick={()=>setEditEmp({...emp})}>✏️</Btn>
                    <Btn variant="ghost" size="sm" title="Reset credentials to default" onClick={()=>resetCreds(emp.id)}>🔑</Btn>
                    <Btn variant={emp.status==="active"?"orange":"success"} size="sm" onClick={()=>toggleStatus(emp.id)}>{emp.status==="active"?"Deactivate":"Activate"}</Btn>
                    <Btn variant="danger" size="sm" onClick={()=>deleteOne(emp.id)}>🗑</Btn>
                  </div>
                </Td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {showAdd && (
        <Modal title="Add New Employee" onClose={()=>setShowAdd(false)} width={720}>
          <EmpForm data={form} onChange={f} employees={employees} />
          <div style={{ display:"flex", gap:10, marginTop:18, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={addEmployee} disabled={!form.name||!form.dept||!form.customId||!form.fa||!form.sa}>➕ Create Employee</Btn>
          </div>
        </Modal>
      )}

      {editEmp && (
        <Modal title={`Edit Employee — ${editEmp.name}`} onClose={()=>setEditEmp(null)} width={720}>
          <EmpForm data={editEmp} onChange={v=>setEditEmp(p=>({...p,...v}))} employees={employees} />
          <div style={{ display:"flex", gap:10, marginTop:18, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setEditEmp(null)}>Cancel</Btn>
            <Btn onClick={saveEdit}>💾 Save Changes</Btn>
          </div>
        </Modal>
      )}

      {viewEmp && (
        <Modal title={`Profile — ${viewEmp.name}`} onClose={()=>setViewEmp(null)} width={500}>
          <div style={{ display:"flex", gap:14, marginBottom:18, alignItems:"center" }}>
            <Av letters={viewEmp.av} size={52} color={C.teal} />
            <div><div style={{ fontSize:18, fontWeight:800, color:C.text }}>{viewEmp.name}</div><div style={{ color:C.mid }}>{viewEmp.pos} · {viewEmp.dept}</div></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["ID",viewEmp.id],["Username",viewEmp.username],["Category",viewEmp.cat],["Join Date",viewEmp.joined],["Email",viewEmp.email||"—"],["Phone",viewEmp.phone||"—"],["Geofence",viewEmp.geo],["Status",viewEmp.status]].map(([k,v])=>(
              <div key={k} style={{ background:C.surfAlt, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace", fontWeight:700, marginBottom:2 }}>{k.toUpperCase()}</div>
                <div style={{ fontSize:13, color:C.text, fontWeight:700 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Reporting / Sign-Off Chain */}
          <div style={{ marginTop:14, padding:14, background:`${C.blue}08`, border:`1px solid ${C.blue}25`, borderRadius:10 }}>
            <div style={{ fontSize:10, color:C.blue, fontWeight:700, letterSpacing:"0.07em", marginBottom:12, fontFamily:"'DM Mono',monospace" }}>REPORTING & SIGN-OFF CHAIN</div>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              {/* Employee node */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <Av letters={viewEmp.av} size={38} color={C.blue} />
                <div style={{ fontSize:11, color:C.teal, textAlign:"center", maxWidth:100, fontWeight:700 }}>{viewEmp.pos}</div>
                <div style={{ fontSize:10, color:C.mid, textAlign:"center", maxWidth:90 }}>{viewEmp.name}</div>
              </div>
              <div style={{ color:C.dim, fontSize:20 }}>→</div>
              {/* 1st Approver */}
              {(()=>{ const a=employees.find(e=>e.id===viewEmp.fa); return (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <Av letters={a?.av||"?"} size={38} color={C.teal} />
                  <div style={{ fontSize:11, color:C.teal, textAlign:"center", maxWidth:110, fontWeight:700 }}>{a?.pos||"Not Assigned"}</div>
                  <div style={{ fontSize:10, color:C.mid, textAlign:"center", maxWidth:100 }}>{a?.name||"—"}</div>
                  <div style={{ fontSize:9, color:C.teal, fontFamily:"'DM Mono',monospace" }}>1ST SIGN-OFF</div>
                </div>
              );})()}
              <div style={{ color:C.dim, fontSize:20 }}>→</div>
              {/* 2nd Approver */}
              {(()=>{ const a=employees.find(e=>e.id===viewEmp.sa); return (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <Av letters={a?.av||"?"} size={38} color={C.gold} />
                  <div style={{ fontSize:11, color:C.gold, textAlign:"center", maxWidth:110, fontWeight:700 }}>{a?.pos||"Not Assigned"}</div>
                  <div style={{ fontSize:10, color:C.mid, textAlign:"center", maxWidth:100 }}>{a?.name||"—"}</div>
                  <div style={{ fontSize:9, color:C.gold, fontFamily:"'DM Mono',monospace" }}>FINAL SIGN-OFF</div>
                </div>
              );})()}
              <div style={{ color:C.dim, fontSize:20 }}>→</div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:`${C.green}20`, border:`2px solid ${C.green}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>💰</div>
                <div style={{ fontSize:11, color:C.green, fontWeight:700, textAlign:"center" }}>Payroll</div>
                <div style={{ fontSize:9, color:C.green, fontFamily:"'DM Mono',monospace" }}>PROCESSED</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop:14, padding:14, background:`${C.gold}12`, border:`1px solid ${C.gold}30`, borderRadius:8 }}>
            <div style={{ fontSize:10, color:C.gold, fontWeight:700, fontFamily:"'DM Mono',monospace", marginBottom:4 }}>COMPENSATION</div>
            <div style={{ fontSize:22, fontWeight:900, color:C.gold, fontFamily:"'DM Mono',monospace" }}>{viewEmp.cat==="Time"?`${fmt(viewEmp.hourlyRate)}/hr`:fmt(viewEmp.salary)}</div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
            <Btn onClick={()=>{setViewEmp(null);setEditEmp({...viewEmp});}}>✏️ Edit Employee</Btn>
          </div>
        </Modal>
      )}

      {newEmpCreds && (
        <Modal title="✅ Employee Profile Created" onClose={()=>setNewEmpCreds(null)} width={460}>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:`${C.teal}20`, border:`2px solid ${C.teal}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:C.teal, margin:"0 auto 12px" }}>
              {newEmpCreds.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
            </div>
            <div style={{ fontSize:18, fontWeight:800, color:C.text }}>{newEmpCreds.name}</div>
            <div style={{ fontSize:13, color:C.mid, marginTop:2 }}>{newEmpCreds.pos} · {newEmpCreds.dept}</div>
          </div>
          <div style={{ background:C.surfAlt, borderRadius:12, padding:20, marginBottom:16 }}>
            <div style={{ fontSize:10, color:C.gold, fontWeight:700, letterSpacing:"0.08em", fontFamily:"'DM Mono',monospace", marginBottom:14 }}>AUTO-GENERATED LOGIN CREDENTIALS</div>
            {[
              ["Employee ID / Username", newEmpCreds.id],
              ["Default Password", "temp"],
              ["Account Status", "Active"],
              ["First Login", "Password change required"],
            ].map(([label, val]) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontSize:12, color:C.dim }}>{label}</span>
                <span style={{ fontSize:13, fontWeight:800, color:C.text, fontFamily:"'DM Mono',monospace" }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ padding:"10px 14px", background:`${C.orange}10`, border:`1px solid ${C.orange}30`, borderRadius:8, fontSize:12, color:C.orange, marginBottom:16 }}>
            ⚠️ Share these credentials securely with the employee. They will be prompted to set a new password on first login.
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <Btn onClick={()=>setNewEmpCreds(null)}>Done</Btn>
          </div>
        </Modal>
      )}

      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}

// ─── TIMESHEETS PANEL ─────────────────────────────────────────────────────────
function TimesheetsPanel({ timesheets, setTimesheets, employees, toast }) {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(new Set());
  const [viewTs, setViewTs] = useState(null);
  const [editTs, setEditTs] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const getEmp = id => employees.find(e=>e.id===id);
  const visible = filter==="all" ? timesheets : timesheets.filter(t=>t.status===filter);
  const allChk = sel.size===visible.length&&visible.length>0;
  const someChk = sel.size>0&&sel.size<visible.length;
  const toggleAll = () => allChk?setSel(new Set()):setSel(new Set(visible.map(t=>t.id)));
  const toggleOne = id => { const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); setSel(s); };

  // Reset selection when filter changes
  useEffect(() => { setSel(new Set()); }, [filter]);

  const deleteOne = id => setConfirm({ msg:"Delete this timesheet record? This removes it from payroll.", onOk:()=>{ setTimesheets(p=>p.filter(t=>t.id!==id)); toast("Timesheet deleted","success"); setConfirm(null); }});
  const deleteSel = () => setConfirm({ msg:`Delete ${sel.size} timesheet(s)? This cannot be undone.`, onOk:()=>{ setTimesheets(p=>p.filter(t=>!sel.has(t.id))); toast(`${sel.size} timesheets deleted`,"success"); setSel(new Set()); setConfirm(null); }});

  const saveEdit = () => {
    setTimesheets(p=>p.map(t=>t.id===editTs.id?{...editTs,edited:true,hist:[...t.hist,{at:tsNow(),note:`Hours edited: ${t.reg}h reg, ${t.ot}h OT → ${editTs.reg}h reg, ${editTs.ot}h OT`}]}:t));
    setEditTs(null); toast("Timesheet updated","success");
  };

  const exportCSV = () => {
    const rows=[["ID","Employee","Date","Clock In","Clock Out","Regular","Overtime","Status"],...timesheets.map(t=>{const e=getEmp(t.eid); return [t.id,e?.name||t.eid,t.date,t.ci,t.co||"",t.reg,t.ot,t.status];})];
    const csv=rows.map(r=>r.join(",")).join("\n"); const b=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="FMS_Timesheets.csv"; a.click(); toast("Timesheets exported","success");
  };

  const filters = ["all","pending_employee","pending_first_approval","pending_second_approval","approved","rejected"];

  return (
    <div>
      <SectionH title="Timesheet Registry" sub="Full audit of all time entries with complete signature chain" />
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        {filters.map(f=>(
          <Btn key={f} variant={filter===f?"primary":"ghost"} size="sm" onClick={()=>setFilter(f)}>{f==="all"?"All":f.replace(/_/g," ")}</Btn>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <Btn variant="ghost" size="sm" onClick={exportCSV}>⬇️ Export CSV</Btn>
        </div>
      </div>

      <BulkBar count={sel.size} onDelete={deleteSel} onClear={()=>setSel(new Set())} />

      <Card style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <Th><Checkbox checked={allChk} indeterminate={someChk} onChange={toggleAll} /></Th>
              <Th>Employee</Th><Th>Date</Th><Th>Clock In</Th><Th>Clock Out</Th><Th>Regular</Th><Th>Overtime</Th><Th>Status</Th><Th>Signatures</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length===0 && <tr><td colSpan={10} style={{ padding:32, textAlign:"center", color:C.dim }}>No timesheets found</td></tr>}
            {visible.map((ts,i)=>{
              const emp=getEmp(ts.eid);
              return (
                <tr key={ts.id} style={{ background:sel.has(ts.id)?`${C.gold}08`:i%2?`${C.surfAlt}40`:"transparent" }}>
                  <Td><Checkbox checked={sel.has(ts.id)} onChange={()=>toggleOne(ts.id)} /></Td>
                  <Td>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {emp&&<Av letters={emp.av} size={28} color={C.blue} />}
                      <div>
                        <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>{emp?.name||ts.eid}</div>
                        <div style={{ fontSize:11, color:C.dim }}>{emp?.dept}</div>
                      </div>
                    </div>
                  </Td>
                  <Td mono>{ts.date}</Td>
                  <Td mono><span style={{ color:C.green }}>{ts.ci}</span></Td>
                  <Td mono><span style={{ color:C.red }}>{ts.co||"—"}</span></Td>
                  <Td mono>{ts.reg}h</Td>
                  <Td mono><span style={{ color:ts.ot>0?C.orange:C.dim }}>{ts.ot}h</span></Td>
                  <Td>{tsStatusBadge(ts.status)}</Td>
                  <Td>
                    <div style={{ display:"flex", gap:4 }}>
                      <span title="Employee" style={{ fontSize:14, opacity:ts.eSig?1:0.2 }}>👤</span>
                      <span title="1st Approver" style={{ fontSize:14, opacity:ts.f1Sig?1:0.2 }}>✍️</span>
                      <span title="2nd Approver" style={{ fontSize:14, opacity:ts.f2Sig?1:0.2 }}>✅</span>
                      {ts.edited&&<span title="Edited" style={{ fontSize:12, color:C.orange }}>✏</span>}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ display:"flex", gap:5 }}>
                      <Btn variant="ghost" size="sm" onClick={()=>setViewTs(ts)}>👁</Btn>
                      <Btn variant="ghost" size="sm" onClick={()=>setEditTs({...ts})} disabled={ts.status==="approved"}>✏️</Btn>
                      <Btn variant="danger" size="sm" onClick={()=>deleteOne(ts.id)}>🗑</Btn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {viewTs && (()=>{
        const emp=getEmp(viewTs.eid);
        const p=calcPayroll(emp,{regular:viewTs.reg,overtime:viewTs.ot});
        return (
          <Modal title="Timesheet Details" onClose={()=>setViewTs(null)} width={560}>
            <div style={{ display:"flex", gap:12, marginBottom:18, alignItems:"center" }}>
              {emp&&<Av letters={emp.av} size={44} color={C.blue} />}
              <div><div style={{ fontSize:15, fontWeight:800, color:C.text }}>{emp?.name}</div><div style={{ color:C.mid }}>{emp?.pos} · {emp?.dept}</div></div>
              {tsStatusBadge(viewTs.status)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
              {[["Date",viewTs.date],["Clock In",viewTs.ci],["Clock Out",viewTs.co||"—"],["Regular",`${viewTs.reg}h`],["Overtime",`${viewTs.ot}h`],["Break",`${viewTs.brk}min`]].map(([k,v])=>(
                <div key={k} style={{ background:C.surfAlt, borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize:14, color:C.text, fontWeight:700, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
              {[["Gross",fmt(p.gross),C.text],["NIS",fmt(p.nisEmployee),C.orange],["PAYE",fmt(p.paye),C.red],["Net Pay",fmt(p.net),C.teal]].map(([k,v,c])=>(
                <div key={k} style={{ background:C.surfAlt, borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize:13, color:c, fontWeight:700, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.06em", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>SIGNATURE CHAIN</div>
              {[["Employee",viewTs.eSig,C.blue],["First Approver",viewTs.f1Sig,C.teal],["Second Approver",viewTs.f2Sig,C.gold]].map(([label,sig,color])=>(
                <div key={label} style={{ display:"flex", gap:10, padding:"8px 10px", background:C.surfAlt, borderRadius:6, marginBottom:4, alignItems:"center" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:sig?color:C.border, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:12, color:C.mid, marginRight:8 }}>{label}:</span>
                    {sig ? <span style={{ fontSize:12, color, fontFamily:"'DM Mono',monospace" }}>{sig.name} · {sig.time} · IP:{sig.ip}</span> : <span style={{ fontSize:12, color:C.dim }}>Pending</span>}
                  </div>
                </div>
              ))}
            </div>
            {viewTs.hist?.length>0 && (
              <div style={{ padding:10, background:`${C.orange}10`, border:`1px solid ${C.orange}30`, borderRadius:8, fontSize:12, color:C.orange }}>
                ✏ Edited — {viewTs.hist.map(h=>h.note).join("; ")}
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:14, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setViewTs(null)}>Close</Btn>
              <Btn variant="ghost" onClick={()=>{setViewTs(null);setEditTs({...viewTs});}} disabled={viewTs.status==="approved"}>✏️ Edit</Btn>
              <Btn variant="danger" onClick={()=>{setViewTs(null);deleteOne(viewTs.id);}}>🗑 Delete</Btn>
            </div>
          </Modal>
        );
      })()}

      {editTs && (
        <Modal title="Edit Timesheet" onClose={()=>setEditTs(null)} width={480}>
          <div style={{ padding:"10px 14px", background:`${C.orange}12`, border:`1px solid ${C.orange}40`, borderRadius:8, marginBottom:16, fontSize:12, color:C.orange }}>
            ⚠️ Editing a timesheet will reset approvals and flag this entry in the audit trail.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Input label="Clock In" value={editTs.ci} onChange={v=>setEditTs(p=>({...p,ci:v}))} type="time" />
            <Input label="Clock Out" value={editTs.co} onChange={v=>setEditTs(p=>({...p,co:v}))} type="time" />
            <Input label="Regular Hours" value={editTs.reg} onChange={v=>setEditTs(p=>({...p,reg:+v}))} type="number" />
            <Input label="Overtime Hours" value={editTs.ot} onChange={v=>setEditTs(p=>({...p,ot:+v}))} type="number" />
            <Input label="Break (minutes)" value={editTs.brk} onChange={v=>setEditTs(p=>({...p,brk:+v}))} type="number" />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:12 }}>
            <label style={{ color:C.mid, fontSize:11, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace" }}>EDIT REASON</label>
            <textarea value={editTs.notes} onChange={e=>setEditTs(p=>({...p,notes:e.target.value}))} rows={2}
              style={{ background:C.surfAlt, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"vertical" }} />
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setEditTs(null)}>Cancel</Btn>
            <Btn onClick={saveEdit}>💾 Save Changes</Btn>
          </div>
        </Modal>
      )}

      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}

// ─── APPROVALS PANEL ─────────────────────────────────────────────────────────
function ApprovalsPanel({ timesheets, setTimesheets, employees, user, toast }) {
  const [sigModal, setSigModal] = useState(null);
  const [sigName, setSigName] = useState("");
  const [confirm, setConfirm] = useState(null);

  const getEmp = id => employees.find(e=>e.id===id);

  // Route timesheets by position title stored in emp.fa / emp.sa — not by role
  const pending1st = timesheets.filter(ts => {
    if (ts.status !== "pending_first_approval") return false;
    const emp = getEmp(ts.eid);
    return emp && (user.role === "admin" || emp.fa === user.pos);
  });

  const pending2nd = timesheets.filter(ts => {
    if (ts.status !== "pending_second_approval") return false;
    const emp = getEmp(ts.eid);
    return emp && (user.role === "admin" || emp.sa === user.pos);
  });

  const history = timesheets.filter(ts => ts.status==="approved"||ts.status==="rejected");
  const totalPending = pending1st.length + pending2nd.length;

  const sign = (ts, approve, isFirst) => { setSigModal({ts, approve, isFirst}); setSigName(user.name); };

  const confirmSign = () => {
    const {ts, approve, isFirst} = sigModal;
    const sig = { name:sigName, time:tsNow(), ip:`10.0.${Math.floor(Math.random()*9)}.${Math.floor(Math.random()*200+10)}` };
    setTimesheets(prev=>prev.map(t=>{
      if(t.id!==ts.id) return t;
      if(!approve) return {...t, status:"rejected"};
      if(isFirst) return {...t, f1Sig:sig, status:"pending_second_approval"};
      return {...t, f2Sig:sig, status:"approved"};
    }));
    setSigModal(null);
    toast(approve?"Timesheet approved ✅":"Timesheet rejected","success");
  };

  const deleteTs = id => setConfirm({ msg:"Remove this timesheet from the queue?", onOk:()=>{ setTimesheets(p=>p.filter(t=>t.id!==id)); toast("Removed","success"); setConfirm(null); }});

  const TsCard = ({ ts, isFirst }) => {
    const emp = getEmp(ts.eid);
    if (!emp) return null;
    const p = calcPayroll(emp, {regular:ts.reg, overtime:ts.ot});
    const col = isFirst ? C.teal : C.gold;
    return (
      <Card style={{ border:`1px solid ${ts.disputed ? C.orange : col}40` }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:280 }}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"3px 10px", background:`${col}15`, border:`1px solid ${col}35`, borderRadius:20 }}>
                <span style={{ fontSize:10, fontWeight:700, color:col, fontFamily:"'DM Mono',monospace" }}>
                  {isFirst ? `1ST SIGN-OFF · Required: ${emp.fa}` : `FINAL SIGN-OFF · Required: ${emp.sa}`}
                </span>
              </div>
              {ts.disputed && (
                <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", background:`${C.orange}20`, border:`1px solid ${C.orange}50`, borderRadius:20 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:C.orange, fontFamily:"'DM Mono',monospace" }}>⚠️ DISPUTED</span>
                </div>
              )}
            </div>

            {/* Dispute details box */}
            {ts.disputed && ts.disputeNote && (
              <div style={{ padding:"10px 14px", background:`${C.orange}10`, border:`1px solid ${C.orange}40`, borderRadius:8, marginBottom:12 }}>
                <div style={{ fontSize:10, color:C.orange, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>EMPLOYEE DISPUTE</div>
                <div style={{ fontSize:12, color:C.mid, marginBottom:6 }}>{ts.disputeNote}</div>
                <div style={{ display:"flex", gap:16, fontSize:11 }}>
                  <span style={{ color:C.dim }}>Claimed In: <strong style={{ color:C.text }}>{ts.ci}</strong></span>
                  <span style={{ color:C.dim }}>Claimed Out: <strong style={{ color:C.text }}>{ts.co}</strong></span>
                </div>
              </div>
            )}

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <Av letters={emp.av} size={40} color={C.blue} />
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{emp.name}</div>
                <div style={{ fontSize:12, color:C.mid }}>{emp.pos} · {emp.dept}</div>
                <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>{ts.date} · In: {ts.ci} · Out: {ts.co}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {[["Regular",`${ts.reg}h`,C.text],["Overtime",`${ts.ot}h`,C.orange],["Gross",fmt(p.gross),C.text],["NIS",fmt(p.nisEmployee),C.orange],["PAYE",fmt(p.paye),C.red],["NET",fmt(p.net),C.teal]].map(([k,v,c])=>(
                <div key={k} style={{ background:C.surfAlt, borderRadius:8, padding:"7px 11px", minWidth:70 }}>
                  <div style={{ fontSize:9, color:C.dim, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{k}</div>
                  <div style={{ fontSize:13, color:c, fontWeight:700, marginTop:1 }}>{v}</div>
                </div>
              ))}
            </div>
            {ts.eSig && <div style={{ marginTop:10, padding:"7px 10px", background:`${C.blue}12`, border:`1px solid ${C.blue}25`, borderRadius:6, fontSize:11, color:C.mid }}>👤 Employee signed: <strong style={{ color:C.blue }}>{ts.eSig.name}</strong> · {ts.eSig.time}</div>}
            {ts.f1Sig && <div style={{ marginTop:6, padding:"7px 10px", background:`${C.teal}12`, border:`1px solid ${C.teal}25`, borderRadius:6, fontSize:11, color:C.mid }}>✍️ 1st signed by <strong style={{ color:C.teal }}>{ts.f1Sig.name}</strong> ({emp.fa}) · {ts.f1Sig.time}</div>}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, justifyContent:"center", minWidth:140 }}>
            <Btn variant="success" onClick={()=>sign(ts,true,isFirst)}>✍️ Sign & Approve</Btn>
            <Btn variant="danger" onClick={()=>sign(ts,false,isFirst)}>✕ Reject</Btn>
            <Btn variant="ghost" size="sm" onClick={()=>deleteTs(ts.id)}>🗑 Remove</Btn>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <SectionH title="Approval Queue" sub={`Showing timesheets that require sign-off from: ${user.pos}`} />

      {totalPending === 0 ? (
        <Card style={{ textAlign:"center", padding:48 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
          <div style={{ fontSize:16, fontWeight:800, color:C.text }}>All Clear</div>
          <div style={{ color:C.mid, fontSize:13, marginTop:4 }}>No timesheets require your approval right now.</div>
          <div style={{ marginTop:10, padding:"8px 14px", background:C.surfAlt, borderRadius:8, display:"inline-block" }}>
            <span style={{ fontSize:12, color:C.dim }}>You sign off as: </span>
            <span style={{ fontSize:12, color:C.gold, fontWeight:700 }}>{user.pos}</span>
          </div>
        </Card>
      ) : (
        <>
          {pending1st.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <div style={{ padding:"4px 14px", background:`${C.teal}15`, border:`1px solid ${C.teal}35`, borderRadius:20, fontSize:12, fontWeight:700, color:C.teal }}>
                  1st Sign-Off — {pending1st.length} pending
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {pending1st.map(ts => <TsCard key={ts.id} ts={ts} isFirst={true} />)}
              </div>
            </div>
          )}
          {pending2nd.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <div style={{ padding:"4px 14px", background:`${C.gold}15`, border:`1px solid ${C.gold}35`, borderRadius:20, fontSize:12, fontWeight:700, color:C.gold }}>
                  Final Sign-Off — {pending2nd.length} pending
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {pending2nd.map(ts => <TsCard key={ts.id} ts={ts} isFirst={false} />)}
              </div>
            </div>
          )}
        </>
      )}

      {history.length>0 && (
        <>
          <div style={{ fontSize:14, fontWeight:800, color:C.text, marginBottom:12 }}>Recent History</div>
          <Card style={{ padding:0, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><Th>Employee</Th><Th>Date</Th><Th>1st Sign-Off Position</Th><Th>Final Sign-Off Position</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {history.slice(0,8).map((ts,i)=>{
                  const emp=getEmp(ts.eid);
                  return (
                    <tr key={ts.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                      <Td><div style={{ display:"flex", alignItems:"center", gap:8 }}>{emp&&<Av letters={emp.av} size={26} color={C.blue} />}<span style={{ fontWeight:700, color:C.text }}>{emp?.name}</span></div></Td>
                      <Td mono>{ts.date}</Td>
                      <Td><span style={{ color:C.teal, fontSize:12 }}>{emp?.fa||"—"}</span>{ts.f1Sig&&<div style={{ fontSize:10, color:C.dim }}>{ts.f1Sig.name}</div>}</Td>
                      <Td><span style={{ color:C.gold, fontSize:12 }}>{emp?.sa||"—"}</span>{ts.f2Sig&&<div style={{ fontSize:10, color:C.dim }}>{ts.f2Sig.name}</div>}</Td>
                      <Td>{tsStatusBadge(ts.status)}</Td>
                      <Td><Btn variant="danger" size="sm" onClick={()=>deleteTs(ts.id)}>🗑</Btn></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {sigModal && (
        <Modal title={sigModal.approve?"Sign & Approve":"Reject Timesheet"} onClose={()=>setSigModal(null)} width={460}>
          <div style={{ marginBottom:14, padding:"10px 14px", background:`${sigModal.isFirst?C.teal:C.gold}12`, border:`1px solid ${sigModal.isFirst?C.teal:C.gold}30`, borderRadius:8, fontSize:12, color:C.mid }}>
            Signing as: <strong style={{ color:sigModal.isFirst?C.teal:C.gold }}>{user.pos}</strong> · {sigModal.isFirst?"1st Sign-Off":"Final Sign-Off"}
          </div>
          <p style={{ color:C.mid, fontSize:13, marginBottom:16 }}>
            {sigModal.approve?"Your electronic signature, timestamp and IP will be permanently recorded.":"This will reject the timesheet and flag it for the employee."}
          </p>
          {sigModal.approve && <Input label="Your Full Name (Electronic Signature)" value={sigName} onChange={setSigName} />}
          <div style={{ marginTop:12, padding:"9px 12px", background:C.surfAlt, borderRadius:8, fontSize:12, color:C.dim }}>
            🕐 {tsNow()} · IP logged automatically
          </div>
          <div style={{ display:"flex", gap:10, marginTop:18, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setSigModal(null)}>Cancel</Btn>
            <Btn variant={sigModal.approve?"success":"danger"} onClick={confirmSign} disabled={sigModal.approve&&!sigName.trim()}>
              {sigModal.approve?"✅ Confirm Signature":"✕ Confirm Rejection"}
            </Btn>
          </div>
        </Modal>
      )}
      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}

// ─── PAYROLL PANEL ────────────────────────────────────────────────────────────
function PayrollPanel({ employees, timesheets, setTimesheets, toast }) {
  const [period, setPeriod] = useState("June 2025");
  const [generated, setGenerated] = useState(false);
  const [viewSlip, setViewSlip] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [confirm, setConfirm] = useState(null);
  const [excluded, setExcluded] = useState(new Set());

  const empList = employees.filter(e=>e.role!=="admin"&&e.status==="active"&&!excluded.has(e.id));
  const approvedSheets = timesheets.filter(ts=>ts.status==="approved");

  const payroll = empList.map(emp=>{
    const sheets = approvedSheets.filter(ts=>ts.eid===emp.id);
    const totalReg = sheets.reduce((a,b)=>a+b.reg,0)||(emp.cat!=="Time"?176:0);
    const totalOT = sheets.reduce((a,b)=>a+b.ot,0);
    const calc = calcPayroll(emp,{regular:totalReg,overtime:totalOT});
    return { emp, calc, sheets:sheets.length };
  });

  const totals = payroll.reduce((a,{calc})=>({gross:a.gross+calc.gross,nisEmp:a.nisEmp+calc.nisEmployee,nisEmplr:a.nisEmplr+calc.nisEmployer,paye:a.paye+calc.paye,net:a.net+calc.net}),{gross:0,nisEmp:0,nisEmplr:0,paye:0,net:0});

  const allChk = sel.size===payroll.length&&payroll.length>0;
  const someChk = sel.size>0&&sel.size<payroll.length;
  const toggleAll = () => allChk?setSel(new Set()):setSel(new Set(payroll.map(p=>p.emp.id)));
  const toggleOne = id => { const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); setSel(s); };

  const exportCSV = (selectedOnly=false) => {
    const rows=payroll.filter(r=>!selectedOnly||sel.has(r.emp.id));
    const csv=[["Employee","Dept","Category","Gross","NIS Employee","NIS Employer","PAYE","Net Pay"],...rows.map(({emp,calc})=>[emp.name,emp.dept,emp.cat,calc.gross,calc.nisEmployee,calc.nisEmployer,calc.paye,calc.net])].map(r=>r.join(",")).join("\n");
    const b=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`FMS_Payroll_${period.replace(" ","_")}.csv`; a.click();
    toast(`Payroll exported to QuickBooks CSV`,"success");
  };

  const exportIIF = () => {
    const lines=["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO","!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO","!ENDTRNS"];
    payroll.forEach(({emp,calc},i)=>{
      lines.push(`TRNS\t${i+1}\tPAYCHECK\t${period.replace(" ","/")}\t5000-Payroll\t${emp.name}\t${calc.gross}\tPayroll ${period}`);
      lines.push(`SPL\t${i+1}\tPAYCHECK\t${period.replace(" ","/")}\t2200-Wages\t${emp.name}\t-${calc.net}\tNet wages`);
      lines.push(`SPL\t${i+2}\tPAYCHECK\t${period.replace(" ","/")}\t2100-PAYE\t${emp.name}\t-${calc.paye}\tPAYE`);
      lines.push(`SPL\t${i+3}\tPAYCHECK\t${period.replace(" ","/")}\t5100-NIS\t${emp.name}\t-${calc.nisEmployee}\tNIS`);
      lines.push("ENDTRNS");
    });
    const b=new Blob([lines.join("\n")],{type:"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`FMS_Payroll_${period.replace(" ","_")}.iif`; a.click();
    toast("IIF file exported for QuickBooks import","success");
  };

  const generatePayroll = () => {
    if(approvedSheets.length===0) { toast("No approved timesheets found for this period","error"); return; }
    setGenerated(true); toast(`Payroll generated for ${period} — ${payroll.length} employees`,"success");
  };

  const deleteOne = (empId, empName) => setConfirm({ msg:`Remove ${empName} from the ${period} payroll run? Their employee record will not be deleted.`, onOk:()=>{ setExcluded(p=>new Set([...p,empId])); setSel(s=>{const n=new Set(s);n.delete(empId);return n;}); toast(`${empName} excluded from payroll run`,"success"); setConfirm(null); }});
  const deleteSel = () => setConfirm({ msg:`Remove ${sel.size} employee(s) from the ${period} payroll run?`, onOk:()=>{ setExcluded(p=>new Set([...p,...sel])); setSel(new Set()); toast(`${sel.size} employees excluded from payroll run`,"success"); setConfirm(null); }});
  const restoreAll = () => { setExcluded(new Set()); toast("All exclusions cleared","success"); };

  const printSlip = (emp, calc) => {
    const html=`<html><head><title>Payslip - ${emp.name}</title><style>body{font-family:monospace;padding:30px;max-width:500px;margin:0 auto}h1{color:#d4a843}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}.total{font-size:20px;font-weight:bold;color:#00c9a7}</style></head><body><h1>FEDERAL MANAGEMENT SYSTEMS</h1><p>${period} | ${emp.name} | ${emp.id}</p><table><tr><td>Gross Pay</td><td align="right">GYD ${calc.gross.toLocaleString()}</td></tr><tr><td>NIS (Employee 5.6%)</td><td align="right">(GYD ${calc.nisEmployee.toLocaleString()})</td></tr><tr><td>PAYE (28%)</td><td align="right">(GYD ${calc.paye.toLocaleString()})</td></tr></table><p class="total">NET PAY: GYD ${calc.net.toLocaleString()}</p></body></html>`;
    const w=window.open("","_blank"); w.document.write(html); w.document.close(); w.print();
  };

  return (
    <div>
      <SectionH title="Payroll Engine" sub="Guyana 2026 Labour Law Compliant · NIS & PAYE Calculations" />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:20 }}>
        <StatCard label="Gross Payroll" value={`$${Math.round(totals.gross/1000)}K`} sub={fmt(totals.gross)} color={C.gold} />
        <StatCard label="Total NIS" value={`$${Math.round((totals.nisEmp+totals.nisEmplr)/1000)}K`} sub="Emp + Employer" color={C.blue} />
        <StatCard label="Total PAYE" value={`$${Math.round(totals.paye/1000)}K`} sub="Income Tax" color={C.red} />
        <StatCard label="Net Payroll" value={`$${Math.round(totals.net/1000)}K`} sub={fmt(totals.net)} color={C.teal} />
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <Sel label="" value={period} onChange={setPeriod} options={["June 2025","May 2025","April 2025","March 2025"].map(v=>({value:v,label:v}))} style={{ minWidth:160 }} />
        <Btn onClick={generatePayroll}>⚙️ Generate Payroll</Btn>
        <Btn variant="teal" onClick={()=>exportCSV(false)}>⬇️ QuickBooks CSV</Btn>
        <Btn variant="ghost" onClick={exportIIF}>⬇️ Export IIF</Btn>
        {sel.size>0 && <Btn variant="ghost" onClick={()=>exportCSV(true)}>⬇️ Export Selected ({sel.size})</Btn>}
        {excluded.size>0 && <Btn variant="orange" onClick={restoreAll}>↩️ Restore {excluded.size} Excluded</Btn>}
      </div>

      {generated && <div style={{ padding:"10px 14px", background:`${C.teal}15`, border:`1px solid ${C.teal}40`, borderRadius:8, marginBottom:14, fontSize:13, color:C.teal }}>✅ Payroll generated for {period} · {payroll.length} employees processed · {approvedSheets.length} approved timesheets</div>}

      <BulkBar count={sel.size} onDelete={deleteSel} onClear={()=>setSel(new Set())} />

      <Card style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <Th><Checkbox checked={allChk} indeterminate={someChk} onChange={toggleAll} /></Th>
              <Th>Employee</Th><Th>Category</Th><Th>Gross Pay</Th><Th>NIS (Emp)</Th><Th>NIS (Emplr)</Th><Th>PAYE</Th><Th>Net Pay</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {payroll.map(({emp,calc,sheets},i)=>(
              <tr key={emp.id} style={{ background:sel.has(emp.id)?`${C.gold}08`:i%2?`${C.surfAlt}40`:"transparent" }}>
                <Td><Checkbox checked={sel.has(emp.id)} onChange={()=>toggleOne(emp.id)} /></Td>
                <Td>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Av letters={emp.av} size={28} color={C.blue} />
                    <div><div style={{ fontWeight:700, color:C.text }}>{emp.name}</div><div style={{ fontSize:11, color:C.dim }}>{emp.dept} · {sheets} sheet(s)</div></div>
                  </div>
                </Td>
                <Td><Badge label={emp.cat} type={emp.cat==="Executive"?"gold":emp.cat==="Fixed"?"info":"neutral"} /></Td>
                <Td mono><span style={{ color:C.text }}>{fmt(calc.gross)}</span></Td>
                <Td mono><span style={{ color:C.orange }}>{fmt(calc.nisEmployee)}</span></Td>
                <Td mono><span style={{ color:C.orange }}>{fmt(calc.nisEmployer)}</span></Td>
                <Td mono><span style={{ color:C.red }}>{fmt(calc.paye)}</span></Td>
                <Td mono><span style={{ color:C.teal, fontWeight:800 }}>{fmt(calc.net)}</span></Td>
                <Td>
                  <div style={{ display:"flex", gap:5 }}>
                    <Btn variant="ghost" size="sm" onClick={()=>setViewSlip({emp,calc})}>Payslip</Btn>
                    <Btn variant="ghost" size="sm" onClick={()=>printSlip(emp,calc)}>🖨</Btn>
                    <Btn variant="danger" size="sm" onClick={()=>deleteOne(emp.id, emp.name)}>🗑</Btn>
                  </div>
                </Td>
              </tr>
            ))}
            <tr style={{ background:`${C.gold}08`, borderTop:`2px solid ${C.gold}40` }}>
              <td colSpan={3} style={{ padding:"11px 14px", fontWeight:900, color:C.gold, fontFamily:"'DM Mono',monospace", fontSize:12 }}>TOTALS — {payroll.length} EMPLOYEES</td>
              <Td mono><span style={{ color:C.gold, fontWeight:900 }}>{fmt(totals.gross)}</span></Td>
              <Td mono><span style={{ color:C.orange, fontWeight:800 }}>{fmt(totals.nisEmp)}</span></Td>
              <Td mono><span style={{ color:C.orange, fontWeight:800 }}>{fmt(totals.nisEmplr)}</span></Td>
              <Td mono><span style={{ color:C.red, fontWeight:800 }}>{fmt(totals.paye)}</span></Td>
              <Td mono><span style={{ color:C.teal, fontWeight:900 }}>{fmt(totals.net)}</span></Td>
              <td />
            </tr>
          </tbody>
        </table>
      </Card>

      {viewSlip && (
        <Modal title={`Payslip — ${viewSlip.emp.name}`} onClose={()=>setViewSlip(null)} width={480}>
          <div style={{ fontFamily:"'DM Mono',monospace" }}>
            <div style={{ textAlign:"center", paddingBottom:16, borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
              <div style={{ fontSize:18, fontWeight:900, color:C.gold }}>FEDERAL MANAGEMENT SYSTEMS</div>
              <div style={{ color:C.mid, fontSize:12, marginTop:2 }}>Employee Payslip · {period}</div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{viewSlip.emp.name}</div>
              <div style={{ color:C.mid, fontSize:12 }}>{viewSlip.emp.pos} · {viewSlip.emp.dept} · ID: {viewSlip.emp.id}</div>
            </div>
            {[["GROSS PAY",viewSlip.calc.gross,C.text],["NIS Employee (5.6%)",viewSlip.calc.nisEmployee,C.orange],["PAYE (28%)",viewSlip.calc.paye,C.red]].map(([k,v,c])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ color:C.mid, fontSize:13 }}>{k}</span>
                <span style={{ color:c, fontSize:13, fontWeight:700 }}>{fmt(v)}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 0 0", fontSize:20, fontWeight:900 }}>
              <span style={{ color:C.teal }}>NET PAY</span><span style={{ color:C.teal }}>{fmt(viewSlip.calc.net)}</span>
            </div>
            <div style={{ marginTop:14, padding:10, background:C.surfAlt, borderRadius:8, fontSize:11, color:C.dim, textAlign:"center" }}>
              NIS Employer Contribution: {fmt(viewSlip.calc.nisEmployer)} · Guyana 2026 Compliant
            </div>
            <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"center" }}>
              <Btn onClick={()=>printSlip(viewSlip.emp,viewSlip.calc)}>🖨 Print Payslip</Btn>
              <Btn variant="ghost" onClick={()=>exportCSV(false)}>⬇️ Export CSV</Btn>
            </div>
          </div>
        </Modal>
      )}
      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}

// ─── GEOFENCING PANEL ─────────────────────────────────────────────────────────
function GeofencingPanel({ toast }) {
  const [zones, setZones]     = useState(INIT_GEOFENCES);
  const [sel, setSel]         = useState(zones[0]?.id || "");
  const [confirm, setConfirm] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newZone, setNewZone] = useState({ name:"", lat:6.813348, lng:-58.147854, radius:200, color:"#00c9a7" });
  const [mapReady, setMapReady] = useState(false);
  const [placing, setPlacing] = useState(false);

  const mapRef      = useRef(null);
  const mapInst     = useRef(null);
  const circlesRef  = useRef({});
  const markersRef  = useRef({});
  const placingRef  = useRef(false);
  const selRef      = useRef(sel);
  const zonesRef    = useRef(zones);

  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

  const active    = zones.find(z => z.id === sel) || zones[0];
  const setActive = v => setZones(p => p.map(z => z.id === sel ? {...z, ...v} : z));

  // Load Leaflet (no API key — free OpenStreetMap)
  useEffect(() => {
    if (window.L) { initMap(window.L); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => initMap(window.L);
    document.head.appendChild(s);
  }, []);

  const initMap = (L) => {
    if (mapInst.current || !mapRef.current) return;
    const first = zonesRef.current[0];
    const map = L.map(mapRef.current, {
      center: [first?.lat || 6.8133, first?.lng || -58.1479],
      zoom: 16,
      zoomControl: true,
    });

    // OpenStreetMap — free, no key, works in Guyana
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInst.current = map;
    zonesRef.current.forEach(z => drawZone(z, L));
    setMapReady(true);
    // invalidateSize forces Leaflet to recalculate tile layout after the
    // container becomes visible (fixes the grey/broken tile issue)
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 400);

    // Click to place
    map.on("click", e => {
      if (!placingRef.current) return;
      const lat = +e.latlng.lat.toFixed(6);
      const lng = +e.latlng.lng.toFixed(6);
      const id  = selRef.current;
      setZones(prev => prev.map(z => z.id === id ? {...z, lat, lng} : z));
      placingRef.current = false;
      setPlacing(false);
      map.getContainer().style.cursor = "";
      toast("📍 Zone placed — adjust radius then Save", "success");
    });
  };

  const drawZone = (zone, L) => {
    if (!mapInst.current) return;
    const isActive = zone.id === selRef.current;
    // Remove old
    if (circlesRef.current[zone.id]) {
      circlesRef.current[zone.id].remove();
      delete circlesRef.current[zone.id];
    }
    if (markersRef.current[zone.id]) {
      markersRef.current[zone.id].remove();
      delete markersRef.current[zone.id];
    }
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      color: zone.color,
      fillColor: zone.color,
      fillOpacity: isActive ? 0.22 : 0.1,
      weight: isActive ? 3 : 1.5,
    }).addTo(mapInst.current);

    circle.on("click", () => setSel(zone.id));

    const icon = L.divIcon({
      className: "",
      html: `<div style="background:${zone.color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;font-family:'DM Sans',sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer">${zone.name}</div>`,
      iconAnchor: [0, 8],
    });

    const marker = L.marker([zone.lat, zone.lng], {
      icon,
      draggable: true,
      title: zone.name,
    }).addTo(mapInst.current);

    marker.on("click", () => setSel(zone.id));
    marker.on("dragend", e => {
      const { lat, lng } = e.target.getLatLng();
      setZones(prev => prev.map(z => z.id === zone.id ? {...z, lat:+lat.toFixed(6), lng:+lng.toFixed(6)} : z));
    });

    circlesRef.current[zone.id] = circle;
    markersRef.current[zone.id] = marker;
  };

  // Redraw all circles when zones change
  useEffect(() => {
    if (!mapInst.current || !window.L) return;
    // Remove deleted zones
    Object.keys(circlesRef.current).forEach(id => {
      if (!zones.find(z => z.id === id)) {
        circlesRef.current[id].remove(); delete circlesRef.current[id];
        markersRef.current[id]?.remove(); delete markersRef.current[id];
      }
    });
    zones.forEach(z => drawZone(z, window.L));
  }, [zones, sel]);

  // Pan to active zone
  useEffect(() => {
    if (!mapInst.current || !active) return;
    mapInst.current.panTo([active.lat, active.lng], { animate: true });
  }, [sel]);

  const saveZone = () => toast(`Zone "${active.name}" saved ✅`, "success");

  const deleteZone = () => setConfirm({
    msg: `Delete zone "${active?.name}"?`,
    onOk: () => {
      circlesRef.current[sel]?.remove(); delete circlesRef.current[sel];
      markersRef.current[sel]?.remove(); delete markersRef.current[sel];
      const remaining = zones.filter(z => z.id !== sel);
      setZones(remaining); setSel(remaining[0]?.id || "");
      toast("Zone deleted", "success"); setConfirm(null);
    }
  });

  const addZone = () => {
    const z = {...newZone, id:`zone-${uid()}`};
    setZones(p => [...p, z]); setSel(z.id);
    setShowAdd(false);
    toast("Zone created — drag the label to position it", "success");
    setNewZone({name:"", lat:6.813348, lng:-58.147854, radius:200, color:"#00c9a7"});
    if (mapInst.current) mapInst.current.panTo([z.lat, z.lng]);
  };

  const startPlacing = () => {
    placingRef.current = true; setPlacing(true);
    if (mapInst.current) mapInst.current.getContainer().style.cursor = "crosshair";
    toast("🎯 Click anywhere on the map to place this zone", "success");
  };

  const cancelPlacing = () => {
    placingRef.current = false; setPlacing(false);
    if (mapInst.current) mapInst.current.getContainer().style.cursor = "";
  };

  const COLORS = ["#00c9a7","#f59e0b","#3b82f6","#a855f7","#ef4444","#22c55e","#f97316","#ec4899"];

  return (
    <div>
      <SectionH title="Geofencing Manager" sub="Free map — no API key needed. Drag pins or click to place zones." />
      <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:14 }}>

        {/* Zone list */}
        <div>
          <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.07em", marginBottom:10, fontFamily:"'DM Mono',monospace" }}>CONFIGURED ZONES</div>
          {zones.map(z => (
            <div key={z.id} onClick={()=>setSel(z.id)} style={{ cursor:"pointer", marginBottom:8, padding:12, background:C.surf, border:`2px solid ${sel===z.id?z.color:C.border}`, borderRadius:10, transition:"all 0.15s" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:z.color, flexShrink:0, boxShadow:`0 0 6px ${z.color}` }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:sel===z.id?C.text:C.mid }}>{z.name}</div>
                  <div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace" }}>r={z.radius}m</div>
                </div>
              </div>
            </div>
          ))}
          <Btn style={{ width:"100%", justifyContent:"center", marginTop:8 }} onClick={()=>setShowAdd(true)}>➕ Add Zone</Btn>
          <div style={{ marginTop:14, padding:"10px 12px", background:C.surfAlt, borderRadius:8, fontSize:11, color:C.dim, lineHeight:1.7 }}>
            <div style={{ fontWeight:700, color:C.mid, marginBottom:4 }}>💡 How to position</div>
            <div>• <strong>Drag</strong> the zone label on the map</div>
            <div>• Or click <strong>📍 Click to Place</strong></div>
            <div>• Adjust radius with the slider</div>
          </div>
        </div>

        {/* Map + editor */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card style={{ padding:0, overflow:"hidden" }}>
            {/* Toolbar */}
            <div style={{ display:"flex", gap:8, alignItems:"center", padding:"10px 14px", borderBottom:`1px solid ${C.border}`, flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:6, alignItems:"center", flex:1 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:active?.color||C.teal, flexShrink:0 }} />
                <span style={{ fontSize:13, fontWeight:800, color:C.text }}>{active?.name}</span>
                <span style={{ fontSize:11, color:C.dim, fontFamily:"'DM Mono',monospace" }}>r={active?.radius}m</span>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {mapReady && (placing
                  ? <Btn variant="danger" size="sm" onClick={cancelPlacing}>✕ Cancel</Btn>
                  : <Btn variant="teal" size="sm" onClick={startPlacing}>📍 Click to Place</Btn>
                )}
                {mapReady && <Btn variant="ghost" size="sm" onClick={()=>{ if(mapInst.current&&active) mapInst.current.setView([active.lat,active.lng],18); }}>🔍 Zoom In</Btn>}
              </div>
            </div>

            {placing && (
              <div style={{ padding:"8px 14px", background:`${C.teal}18`, borderBottom:`1px solid ${C.teal}35`, fontSize:12, color:C.teal, fontWeight:700 }}>
                🎯 Crosshair active — click the map to set center of "{active?.name}"
              </div>
            )}

            {!mapReady && (
              <div style={{ height:440, display:"flex", alignItems:"center", justifyContent:"center", background:C.surfAlt }}>
                <div style={{ textAlign:"center", color:C.mid }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🗺️</div>
                  <div style={{ fontSize:13 }}>Loading OpenStreetMap…</div>
                </div>
              </div>
            )}
            <div ref={mapRef} style={{ height:440, display: mapReady ? "block" : "none", position:"relative", zIndex:0 }} />
          </Card>

          {/* Zone editor */}
          {active && (
            <Card>
              <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:14 }}>Edit: {active.name}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <Input label="Zone Name" value={active.name} onChange={v=>setActive({name:v})} style={{gridColumn:"1/-1"}} />

                <div style={{gridColumn:"1/-1"}}>
                  <div style={{ fontSize:11, color:C.mid, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:8 }}>RADIUS</div>
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <input type="range" min={50} max={5000} step={50} value={active.radius}
                      onChange={e=>setActive({radius:+e.target.value})}
                      style={{ flex:1, accentColor:active.color }} />
                    <span style={{ fontSize:15, fontWeight:900, color:active.color, fontFamily:"'DM Mono',monospace", minWidth:70 }}>{active.radius}m</span>
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    {[50,100,200,500,1000].map(r=>(
                      <button key={r} onClick={()=>setActive({radius:r})}
                        style={{ padding:"3px 10px", background:active.radius===r?`${active.color}25`:C.surfAlt, border:`1px solid ${active.radius===r?active.color:C.border}`, borderRadius:6, color:active.radius===r?active.color:C.mid, cursor:"pointer", fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize:11, color:C.mid, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:8 }}>ZONE COLOR</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {COLORS.map(col=>(
                      <div key={col} onClick={()=>setActive({color:col})} style={{ width:26, height:26, borderRadius:"50%", background:col, cursor:"pointer", border:`3px solid ${active.color===col?"#fff":"transparent"}`, boxShadow:active.color===col?`0 0 0 2px ${col}`:"none", transition:"all 0.15s" }} />
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize:11, color:C.mid, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:8 }}>LATITUDE</div>
                  <input type="text" inputMode="decimal" defaultValue={active.lat} key={`lat-${active.id}`}
                    onBlur={e => { const v=parseFloat(e.target.value); if(!isNaN(v)){setActive({lat:v}); if(mapInst.current) mapInst.current.panTo([v, active.lng]);} else e.target.value=active.lat; }}
                    style={{ width:"100%", background:C.surfAlt, border:`1px solid ${C.teal}`, borderRadius:8, color:C.text, padding:"9px 12px", fontSize:13, fontFamily:"'DM Mono',monospace", outline:"none", boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:11, color:C.mid, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:8 }}>LONGITUDE</div>
                  <input type="text" inputMode="decimal" defaultValue={active.lng} key={`lng-${active.id}`}
                    onBlur={e => { const v=parseFloat(e.target.value); if(!isNaN(v)){setActive({lng:v}); if(mapInst.current) mapInst.current.panTo([active.lat, v]);} else e.target.value=active.lng; }}
                    style={{ width:"100%", background:C.surfAlt, border:`1px solid ${C.teal}`, borderRadius:8, color:C.text, padding:"9px 12px", fontSize:13, fontFamily:"'DM Mono',monospace", outline:"none", boxSizing:"border-box" }} />
                </div>
              </div>

              <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                <Btn onClick={saveZone}>💾 Save Zone</Btn>
                <Btn variant="danger" onClick={deleteZone}>🗑 Delete</Btn>
              </div>
            </Card>
          )}
        </div>
      </div>

      {showAdd && (
        <Modal title="Add New Geofence Zone" onClose={()=>setShowAdd(false)} width={480}>
          <div style={{ padding:"9px 14px", background:`${C.teal}12`, border:`1px solid ${C.teal}30`, borderRadius:8, marginBottom:14, fontSize:12, color:C.teal }}>
            💡 After creating, drag the label on the map to position the zone.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Input label="Zone Name *" value={newZone.name} onChange={v=>setNewZone(p=>({...p,name:v}))} style={{gridColumn:"1/-1"}} />
            <Input label="Radius (meters)" value={newZone.radius} onChange={v=>setNewZone(p=>({...p,radius:+v}))} type="number" />
            <div>
              <div style={{ fontSize:11, color:C.mid, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:8 }}>COLOR</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {COLORS.map(col=>(
                  <div key={col} onClick={()=>setNewZone(p=>({...p,color:col}))} style={{ width:24, height:24, borderRadius:"50%", background:col, cursor:"pointer", border:`3px solid ${newZone.color===col?"#fff":"transparent"}`, boxShadow:newZone.color===col?`0 0 0 2px ${col}`:"none" }} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={addZone} disabled={!newZone.name.trim()}>➕ Create Zone</Btn>
          </div>
        </Modal>
      )}

      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}
// ─── REQUESTS PANEL ───────────────────────────────────────────────────────────
function RequestsPanel({ requests, setRequests, employees, user, toast }) {
  const [sel, setSel] = useState(new Set());
  const [showNew, setShowNew] = useState(false);
  const [viewReq, setViewReq] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ type:"Leave", sub:"Annual Leave", reason:"", start:"", end:"" });

  const isAdmin = user.role==="admin"||user.role==="manager";
  const visible = (isAdmin ? requests : requests.filter(r=>r.eid===user.id)).filter(r=>filter==="all"||r.status===filter);
  const getEmp = id => employees.find(e=>e.id===id);

  const allChk = sel.size===visible.length&&visible.length>0;
  const someChk = sel.size>0&&sel.size<visible.length;
  const toggleAll = () => allChk?setSel(new Set()):setSel(new Set(visible.map(r=>r.id)));
  const toggleOne = id => { const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); setSel(s); };

  const updateStatus = (id, status) => {
    setRequests(p=>p.map(r=>r.id===id?{...r,status,comments:[...r.comments,`${status==="approved"?"✅":"❌"} ${status} by ${user.name} · ${tsNow()}`]}:r));
    toast(`Request ${status}`,"success");
  };

  const addComment = id => {
    if(!commentText.trim()) return;
    setRequests(p=>p.map(r=>r.id===id?{...r,comments:[...r.comments,`💬 ${user.name}: ${commentText} · ${tsNow()}`]}:r));
    setCommentText(""); toast("Comment added","success");
  };

  const deleteOne = id => setConfirm({ msg:"Delete this request record?", onOk:()=>{ setRequests(p=>p.filter(r=>r.id!==id)); setSel(s=>{const n=new Set(s);n.delete(id);return n;}); toast("Request deleted","success"); setConfirm(null); }});
  const deleteSel = () => setConfirm({ msg:`Delete ${sel.size} request(s)?`, onOk:()=>{ setRequests(p=>p.filter(r=>!sel.has(r.id))); setSel(new Set()); toast(`${sel.size} requests deleted`,"success"); setConfirm(null); }});

  const submit = () => {
    if(!form.reason.trim()) return;
    setRequests(p=>[...p,{id:`REQ${uid()}`,eid:user.id,...form,status:"pending",at:tsNow(),comments:[]}]);
    setShowNew(false); toast("Request submitted","success");
    setForm({type:"Leave",sub:"Annual Leave",reason:"",start:"",end:""});
  };

  const exportCSV = () => {
    const rows=[["ID","Employee","Type","Sub-Type","Start","End","Status","Submitted"],...requests.map(r=>{const e=getEmp(r.eid);return[r.id,e?.name||r.eid,r.type,r.sub,r.start||"",r.end||"",r.status,r.at];})];
    const csv=rows.map(r=>r.join(",")).join("\n"); const b=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="FMS_Requests.csv"; a.click(); toast("Requests exported","success");
  };

  const reqTypes = { Leave:["Annual Leave","Sick Leave","Maternity Leave","Paternity Leave","Compassionate Leave","Study Leave"], Overtime:["Planned Overtime","Emergency Overtime"],"Shift Swap":["Shift Swap"],"Payroll Dispute":["Wrong Hours","Wrong Rate","Missing Overtime"] };

  return (
    <div>
      <SectionH title="Requests" sub={isAdmin?"Manage all employee requests":"Submit and track your requests"} />
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        {["all","pending","approved","rejected"].map(f=>(<Btn key={f} variant={filter===f?"primary":"ghost"} size="sm" onClick={()=>setFilter(f)}>{f==="all"?"All":f}</Btn>))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {(user.role==="employee") && <Btn onClick={()=>setShowNew(true)}>➕ New Request</Btn>}
          {isAdmin && <Btn variant="ghost" size="sm" onClick={exportCSV}>⬇️ Export</Btn>}
        </div>
      </div>

      <BulkBar count={sel.size} onDelete={deleteSel} onClear={()=>setSel(new Set())} />

      <Card style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <Th><Checkbox checked={allChk} indeterminate={someChk} onChange={toggleAll} /></Th>
              {isAdmin&&<Th>Employee</Th>}
              <Th>Type</Th><Th>Sub-Type</Th><Th>Dates</Th><Th>Reason</Th><Th>Status</Th><Th>Submitted</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length===0 && <tr><td colSpan={isAdmin?9:8} style={{ padding:32, textAlign:"center", color:C.dim }}>No requests found</td></tr>}
            {visible.map((req,i)=>{
              const emp = getEmp(req.eid);
              return (
                <tr key={req.id} style={{ background:sel.has(req.id)?`${C.gold}08`:i%2?`${C.surfAlt}40`:"transparent" }}>
                  <Td><Checkbox checked={sel.has(req.id)} onChange={()=>toggleOne(req.id)} /></Td>
                  {isAdmin&&<Td><div style={{ display:"flex", alignItems:"center", gap:8 }}>{emp&&<Av letters={emp.av} size={26} color={C.blue} />}<span style={{ fontWeight:700, color:C.text }}>{emp?.name||req.eid}</span></div></Td>}
                  <Td><Badge label={req.type} type="info" /></Td>
                  <Td><span style={{ color:C.mid, fontSize:12 }}>{req.sub}</span></Td>
                  <Td mono><span style={{ fontSize:12, color:C.mid }}>{req.start||"—"}{req.end&&req.end!==req.start?` → ${req.end}`:""}</span></Td>
                  <Td><span style={{ color:C.mid, fontSize:12, maxWidth:160, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{req.reason}</span></Td>
                  <Td><Badge label={req.status} type={req.status==="approved"?"success":req.status==="rejected"?"error":"warning"} /></Td>
                  <Td mono><span style={{ fontSize:11, color:C.dim }}>{req.at}</span></Td>
                  <Td>
                    <div style={{ display:"flex", gap:5 }}>
                      <Btn variant="ghost" size="sm" onClick={()=>setViewReq(req)}>👁</Btn>
                      {isAdmin&&req.status==="pending"&&<>
                        <Btn variant="success" size="sm" onClick={()=>updateStatus(req.id,"approved")}>✅</Btn>
                        <Btn variant="danger" size="sm" onClick={()=>updateStatus(req.id,"rejected")}>✕</Btn>
                      </>}
                      <Btn variant="danger" size="sm" onClick={()=>deleteOne(req.id)}>🗑</Btn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {viewReq && (
        <Modal title={`Request Detail — ${viewReq.type}`} onClose={()=>setViewReq(null)} width={500}>
          {(()=>{const emp=getEmp(viewReq.eid); return (<>
            {emp&&<div style={{ display:"flex", gap:12, marginBottom:16, alignItems:"center" }}><Av letters={emp.av} size={40} color={C.blue} /><div><div style={{ fontWeight:800, color:C.text }}>{emp.name}</div><div style={{ color:C.mid, fontSize:12 }}>{emp.pos}</div></div></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[["Type",viewReq.type],["Sub-Type",viewReq.sub],["Start",viewReq.start||"—"],["End",viewReq.end||"—"],["Submitted",viewReq.at],["Status",viewReq.status]].map(([k,v])=>(
                <div key={k} style={{ background:C.surfAlt, borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize:13, color:C.text, fontWeight:700, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ padding:12, background:C.surfAlt, borderRadius:8, marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.dim, fontWeight:700, marginBottom:4, fontFamily:"'DM Mono',monospace" }}>REASON</div>
              <div style={{ fontSize:13, color:C.text }}>{viewReq.reason}</div>
            </div>
            {viewReq.comments?.length>0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:C.dim, fontWeight:700, marginBottom:6, fontFamily:"'DM Mono',monospace" }}>COMMENTS</div>
                {viewReq.comments.map((c,i)=><div key={i} style={{ padding:"6px 10px", background:C.surfAlt, borderRadius:6, marginBottom:4, fontSize:12, color:C.mid }}>{c}</div>)}
              </div>
            )}
            {isAdmin && viewReq.status==="pending" && (
              <>
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <input value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Add comment…" style={{ flex:1, background:C.surfAlt, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
                  <Btn variant="ghost" size="sm" onClick={()=>addComment(viewReq.id)}>Send</Btn>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <Btn variant="success" onClick={()=>{updateStatus(viewReq.id,"approved");setViewReq(null);}}>✅ Approve</Btn>
                  <Btn variant="danger" onClick={()=>{updateStatus(viewReq.id,"rejected");setViewReq(null);}}>✕ Reject</Btn>
                </div>
              </>
            )}
          </>);})()}
        </Modal>
      )}

      {showNew && (
        <Modal title="Submit New Request" onClose={()=>setShowNew(false)} width={480}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Sel label="Type" value={form.type} onChange={v=>setForm(p=>({...p,type:v,sub:reqTypes[v][0]}))} options={Object.keys(reqTypes).map(v=>({value:v,label:v}))} />
            <Sel label="Sub-Type" value={form.sub} onChange={v=>setForm(p=>({...p,sub:v}))} options={(reqTypes[form.type]||[]).map(v=>({value:v,label:v}))} />
            <Input label="Start Date" value={form.start} onChange={v=>setForm(p=>({...p,start:v}))} type="date" />
            <Input label="End Date" value={form.end} onChange={v=>setForm(p=>({...p,end:v}))} type="date" />
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={{ color:C.mid, fontSize:11, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace" }}>REASON *</label>
              <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3}
                style={{ background:C.surfAlt, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"vertical" }} placeholder="Provide reason for this request…" />
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setShowNew(false)}>Cancel</Btn>
              <Btn onClick={submit} disabled={!form.reason.trim()}>Submit Request</Btn>
            </div>
          </div>
        </Modal>
      )}
      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}

// ─── REPORTS PANEL ────────────────────────────────────────────────────────────
function ReportsPanel({ employees, timesheets, requests, toast }) {
  const [active, setActive] = useState("attendance");
  const reports = [
    {id:"attendance",label:"Attendance"},
    {id:"overtime",label:"Overtime"},
    {id:"geofence",label:"Geofence Violations"},
    {id:"paye",label:"PAYE Report"},
    {id:"nis",label:"NIS Contributions"},
    {id:"ytd",label:"Year-To-Date"},
    {id:"audit",label:"Audit Trail"},
    {id:"disputes",label:"Disputes Log"},
  ];
  const getEmp = id => employees.find(e=>e.id===id);

  const attData = employees.filter(e=>e.role!=="admin"&&e.status==="active").map(emp=>{
    const s=timesheets.filter(t=>t.eid===emp.id);
    return {emp,days:s.length,reg:s.reduce((a,b)=>a+b.reg,0),ot:s.reduce((a,b)=>a+b.ot,0),approved:s.filter(t=>t.status==="approved").length};
  });

  const nisData = employees.filter(e=>e.role!=="admin"&&e.status==="active").map(emp=>({emp,...calcPayroll(emp,{regular:176,overtime:0})}));

  const exportReport = (name) => {
    toast(`${name} report exported as PDF`,"success");
  };

  return (
    <div>
      <SectionH title="Reports & Analytics" sub="Time, payroll, compliance and audit reports" />
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {reports.map(r=><Btn key={r.id} variant={active===r.id?"primary":"ghost"} size="sm" onClick={()=>setActive(r.id)}>{r.label}</Btn>)}
      </div>

      {active==="attendance" && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontWeight:800, color:C.text }}>Attendance Summary — June 2025</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("Attendance")}>⬇️ Export PDF</Btn>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><Th>Employee</Th><Th>Department</Th><Th>Days</Th><Th>Regular Hrs</Th><Th>Overtime Hrs</Th><Th>Approved</Th><Th>Rate</Th></tr></thead>
            <tbody>
              {attData.map(({emp,days,reg,ot,approved},i)=>(
                <tr key={emp.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                  <Td><div style={{ display:"flex", alignItems:"center", gap:8 }}><Av letters={emp.av} size={26} color={C.blue} /><span style={{ fontWeight:700 }}>{emp.name}</span></div></Td>
                  <Td><span style={{ color:C.mid }}>{emp.dept}</span></Td>
                  <Td mono>{days}</Td>
                  <Td mono><span style={{ color:C.teal }}>{reg}h</span></Td>
                  <Td mono><span style={{ color:ot>0?C.orange:C.dim }}>{ot}h</span></Td>
                  <Td><Badge label={`${approved}/${days}`} type={approved===days?"success":approved>0?"warning":"error"} /></Td>
                  <Td><div style={{ height:6, background:C.border, borderRadius:3, width:80 }}><div style={{ height:6, background:C.teal, borderRadius:3, width:days>0?`${(approved/days)*100}%`:"0%" }} /></div></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {active==="nis" && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontWeight:800, color:C.text }}>NIS Contribution Report — June 2025</div>
            <div style={{ display:"flex", gap:8 }}>
              <span style={{ fontSize:11, color:C.dim }}>Emp: 5.6% · Emplr: 8.4% · Ceiling: {fmt(TAX.NIS_CEIL)}</span>
              <Btn variant="ghost" size="sm" onClick={()=>exportReport("NIS")}>⬇️ Export</Btn>
            </div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><Th>Employee</Th><Th>Gross</Th><Th>NIS Basis</Th><Th>Employee NIS</Th><Th>Employer NIS</Th><Th>Total NIS</Th></tr></thead>
            <tbody>
              {nisData.map(({emp,gross,nisEmployee,nisEmployer},i)=>(
                <tr key={emp.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                  <Td><div style={{ display:"flex", alignItems:"center", gap:8 }}><Av letters={emp.av} size={26} color={C.blue} /><div><div style={{ fontWeight:700 }}>{emp.name}</div><div style={{ fontSize:11, color:C.dim }}>{emp.dept}</div></div></div></Td>
                  <Td mono>{fmt(gross)}</Td>
                  <Td mono><span style={{ color:C.mid }}>{fmt(Math.min(gross,TAX.NIS_CEIL))}</span></Td>
                  <Td mono><span style={{ color:C.orange }}>{fmt(nisEmployee)}</span></Td>
                  <Td mono><span style={{ color:C.orange }}>{fmt(nisEmployer)}</span></Td>
                  <Td mono><span style={{ color:C.red, fontWeight:800 }}>{fmt(nisEmployee+nisEmployer)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {active==="paye" && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontWeight:800, color:C.text }}>PAYE Income Tax Report — June 2025</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("PAYE")}>⬇️ Export</Btn>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><Th>Employee</Th><Th>Gross</Th><Th>Personal Allowance</Th><Th>NIS Deduction</Th><Th>Taxable Income</Th><Th>PAYE (28%)</Th></tr></thead>
            <tbody>
              {nisData.map(({emp,gross,nisEmployee,paye},i)=>{
                const taxable=Math.max(0,gross-nisEmployee-TAX.PERSONAL_ALLOW);
                return (
                  <tr key={emp.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                    <Td><div style={{ display:"flex", alignItems:"center", gap:8 }}><Av letters={emp.av} size={26} color={C.blue} /><span style={{ fontWeight:700 }}>{emp.name}</span></div></Td>
                    <Td mono>{fmt(gross)}</Td>
                    <Td mono><span style={{ color:C.green }}>{fmt(TAX.PERSONAL_ALLOW)}</span></Td>
                    <Td mono><span style={{ color:C.orange }}>{fmt(nisEmployee)}</span></Td>
                    <Td mono><span style={{ color:C.mid }}>{fmt(taxable)}</span></Td>
                    <Td mono><span style={{ color:C.red, fontWeight:800 }}>{fmt(paye)}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {active==="ytd" && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontWeight:800, color:C.text }}>Year-To-Date Earnings — 2025</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("YTD")}>⬇️ Export</Btn>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><Th>Employee</Th><Th>Monthly</Th><Th>YTD Gross</Th><Th>YTD NIS</Th><Th>YTD PAYE</Th><Th>YTD Net</Th></tr></thead>
            <tbody>
              {nisData.map(({emp,gross,nisEmployee,nisEmployer,paye,net},i)=>(
                <tr key={emp.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                  <Td><div style={{ display:"flex", alignItems:"center", gap:8 }}><Av letters={emp.av} size={26} color={C.blue} /><div><div style={{ fontWeight:700 }}>{emp.name}</div><div style={{ fontSize:11, color:C.dim }}>{emp.dept}</div></div></div></Td>
                  <Td mono>{fmt(gross)}</Td>
                  <Td mono><span style={{ color:C.text, fontWeight:700 }}>{fmt(gross*6)}</span></Td>
                  <Td mono><span style={{ color:C.orange }}>{fmt((nisEmployee+nisEmployer)*6)}</span></Td>
                  <Td mono><span style={{ color:C.red }}>{fmt(paye*6)}</span></Td>
                  <Td mono><span style={{ color:C.teal, fontWeight:800 }}>{fmt(net*6)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {active==="audit" && (
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:800, color:C.text }}>Approval Audit Trail</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("Audit Trail")}>⬇️ Export</Btn>
          </div>
          {timesheets.filter(ts=>ts.eSig||ts.f1Sig||ts.f2Sig).map(ts=>{
            const emp=getEmp(ts.eid);
            return (
              <div key={ts.id} style={{ marginBottom:14, padding:14, background:C.surfAlt, borderRadius:10, border:`1px solid ${C.border}` }}>
                <div style={{ fontWeight:800, color:C.text, marginBottom:10, display:"flex", gap:10, alignItems:"center" }}>
                  {emp&&<Av letters={emp.av} size={26} color={C.blue} />}
                  <div>{emp?.name} · {ts.date} &nbsp; {tsStatusBadge(ts.status)}</div>
                </div>
                {[["👤 Employee",ts.eSig,C.blue],["✍️ First Approver",ts.f1Sig,C.teal],["✅ Second Approver",ts.f2Sig,C.gold]].map(([label,sig,color])=>(
                  <div key={label} style={{ display:"flex", gap:10, marginBottom:5, fontSize:12, alignItems:"center" }}>
                    <span style={{ color:C.dim, width:160, flexShrink:0 }}>{label}:</span>
                    {sig ? <span style={{ color, fontFamily:"'DM Mono',monospace" }}>{sig.name} · {sig.time} · IP:{sig.ip}</span> : <span style={{ color:C.dim }}>Pending</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </Card>
      )}

      {active==="overtime" && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontWeight:800, color:C.text }}>Overtime Report — June 2025</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("Overtime")}>⬇️ Export</Btn>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><Th>Employee</Th><Th>Date</Th><Th>OT Hours</Th><Th>OT Rate</Th><Th>OT Pay</Th><Th>Status</Th></tr></thead>
            <tbody>
              {timesheets.filter(t=>t.ot>0).map((ts,i)=>{
                const emp=getEmp(ts.eid);
                const otPay=emp?(ts.ot*(emp.hourlyRate||0)*TAX.OT):0;
                return (
                  <tr key={ts.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                    <Td><div style={{ display:"flex", alignItems:"center", gap:8 }}>{emp&&<Av letters={emp.av} size={26} color={C.blue} />}<span style={{ fontWeight:700 }}>{emp?.name||ts.eid}</span></div></Td>
                    <Td mono>{ts.date}</Td>
                    <Td mono><span style={{ color:C.orange, fontWeight:700 }}>{ts.ot}h</span></Td>
                    <Td mono><span style={{ color:C.mid }}>1.5×</span></Td>
                    <Td mono><span style={{ color:C.orange }}>{fmt(otPay)}</span></Td>
                    <Td>{tsStatusBadge(ts.status)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {active==="geofence" && (
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:800, color:C.text }}>Geofence Violations — June 2025</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("Geofence")}>⬇️ Export</Btn>
          </div>
          {[{emp:"Unknown Device",zone:"Main Office",type:"Unauthorized Entry",time:"2025-06-16 08:10",lat:6.8020,lng:-58.1545},{emp:"Marcus Webb",zone:"Warehouse",type:"Outside Zone at Clock-In",time:"2025-06-14 07:55",lat:6.8060,lng:-58.1510}].map((v,i)=>(
            <div key={i} style={{ padding:12, background:C.surfAlt, borderRadius:8, marginBottom:8, border:`1px solid ${C.red}30`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:700, color:C.text, marginBottom:2 }}>{v.emp}</div>
                <div style={{ fontSize:12, color:C.mid }}>{v.type} · {v.zone}</div>
                <div style={{ fontSize:11, color:C.dim, fontFamily:"'DM Mono',monospace", marginTop:2 }}>{v.lat}, {v.lng} · {v.time}</div>
              </div>
              <Badge label="Violation" type="error" />
            </div>
          ))}
          <div style={{ marginTop:10, fontSize:12, color:C.dim }}>2 violations recorded this month</div>
        </Card>
      )}

      {active==="disputes" && (
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:800, color:C.text }}>Disputes Log</div>
            <Btn variant="ghost" size="sm" onClick={()=>exportReport("Disputes")}>⬇️ Export</Btn>
          </div>
          {requests.filter(r=>r.type==="Payroll Dispute").length===0
            ? <div style={{ textAlign:"center", color:C.dim, padding:32 }}>No payroll disputes recorded</div>
            : requests.filter(r=>r.type==="Payroll Dispute").map((req,i)=>{
                const emp=getEmp(req.eid);
                return (<div key={i} style={{ padding:12, background:C.surfAlt, borderRadius:8, marginBottom:8 }}>
                  <div style={{ fontWeight:700, color:C.text }}>{emp?.name||req.eid} · <Badge label={req.status} type={req.status==="resolved"?"success":"warning"} /></div>
                  <div style={{ fontSize:12, color:C.mid, marginTop:4 }}>{req.reason}</div>
                </div>);
              })
          }
        </Card>
      )}
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({ employees, setEmployees, toast, onResetData }) {
  const [rates, setRates] = useState({...TAX, NIS_EMP:TAX.NIS_EMP, NIS_EMPLR:TAX.NIS_EMPLR, NIS_CEIL:TAX.NIS_CEIL, PERSONAL_ALLOW:TAX.PERSONAL_ALLOW, PAYE:TAX.PAYE, OT:TAX.OT, HOLIDAY:TAX.HOLIDAY, WEEKEND:TAX.WEEKEND});
  const [qbMap, setQBMap] = useState({ gross:"5000-Payroll Expense", nisEmp:"2100-NIS Payable", nisEmplr:"5100-NIS Employer Expense", paye:"2200-PAYE Payable", net:"2300-Wages Payable" });
  const [sysConfig, setSysConfig] = useState({ sessionTimeout:30, autoBackup:true, emailNotif:true, twoFactor:false, geoEnabled:true });

  const saveRates = () => { toast("Tax rates saved successfully","success"); };
  const saveQB = () => { toast("QuickBooks mapping saved","success"); };
  const saveSys = () => { toast("System configuration saved","success"); };
  const resetPw = id => { setEmployees(p=>p.map(e=>e.id===id?{...e,password:"temp",fpc:true}:e)); toast(`Password reset for ${employees.find(e=>e.id===id)?.name}`,"success"); };
  const forceLogout = () => toast("All sessions terminated","success");

  return (
    <div>
      <SectionH title="System Settings" sub="Configure payroll rules, tax rates, QuickBooks mapping, and system preferences" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:C.gold, marginBottom:14 }}>🏦 NIS Configuration (2026)</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Input label="Employee Rate (e.g. 0.056 = 5.6%)" value={rates.NIS_EMP} onChange={v=>setRates(p=>({...p,NIS_EMP:+v}))} type="number" />
            <Input label="Employer Rate (e.g. 0.084 = 8.4%)" value={rates.NIS_EMPLR} onChange={v=>setRates(p=>({...p,NIS_EMPLR:+v}))} type="number" />
            <Input label="Monthly Ceiling (GYD)" value={rates.NIS_CEIL} onChange={v=>setRates(p=>({...p,NIS_CEIL:+v}))} type="number" />
            <Btn onClick={saveRates}>💾 Save NIS Settings</Btn>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:C.gold, marginBottom:14 }}>📊 PAYE Tax Brackets</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Input label="Monthly Personal Allowance (GYD)" value={rates.PERSONAL_ALLOW} onChange={v=>setRates(p=>({...p,PERSONAL_ALLOW:+v}))} type="number" />
            <Input label="PAYE Rate (e.g. 0.28 = 28%)" value={rates.PAYE} onChange={v=>setRates(p=>({...p,PAYE:+v}))} type="number" />
            <div style={{ padding:10, background:`${C.gold}10`, border:`1px solid ${C.gold}30`, borderRadius:8, fontSize:12, color:C.mid }}>
              Current: 28% on income above GYD 100,000/month after NIS deduction
            </div>
            <Btn onClick={saveRates}>💾 Save PAYE Settings</Btn>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:C.gold, marginBottom:14 }}>⏱ Overtime & Pay Multipliers</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Input label="Overtime Multiplier (standard)" value={rates.OT} onChange={v=>setRates(p=>({...p,OT:+v}))} type="number" />
            <Input label="Public Holiday Multiplier" value={rates.HOLIDAY} onChange={v=>setRates(p=>({...p,HOLIDAY:+v}))} type="number" />
            <Input label="Weekend Rate Multiplier" value={rates.WEEKEND} onChange={v=>setRates(p=>({...p,WEEKEND:+v}))} type="number" />
            <Btn onClick={saveRates}>💾 Save Rate Settings</Btn>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:C.gold, marginBottom:14 }}>📘 QuickBooks Mapping</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Input label="Payroll Expense Account" value={qbMap.gross} onChange={v=>setQBMap(p=>({...p,gross:v}))} />
            <Input label="NIS Employee Payable" value={qbMap.nisEmp} onChange={v=>setQBMap(p=>({...p,nisEmp:v}))} />
            <Input label="NIS Employer Expense" value={qbMap.nisEmplr} onChange={v=>setQBMap(p=>({...p,nisEmplr:v}))} />
            <Input label="PAYE Payable Account" value={qbMap.paye} onChange={v=>setQBMap(p=>({...p,paye:v}))} />
            <Input label="Net Wages Payable" value={qbMap.net} onChange={v=>setQBMap(p=>({...p,net:v}))} />
            <Btn onClick={saveQB}>💾 Save QB Mapping</Btn>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:C.gold, marginBottom:14 }}>🔒 Security & System</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Input label="Session Timeout (minutes)" value={sysConfig.sessionTimeout} onChange={v=>setSysConfig(p=>({...p,sessionTimeout:+v}))} type="number" />
            {[["autoBackup","Auto Daily Backup"],["emailNotif","Email Notifications"],["twoFactor","Two-Factor Auth"],["geoEnabled","Geofencing Active"]].map(([k,label])=>(
              <label key={k} style={{ display:"flex", gap:10, alignItems:"center", cursor:"pointer", fontSize:13, color:C.mid }}>
                <input type="checkbox" checked={sysConfig[k]} onChange={e=>setSysConfig(p=>({...p,[k]:e.target.checked}))} style={{ accentColor:C.gold }} />
                {label}
              </label>
            ))}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <Btn onClick={saveSys}>💾 Save</Btn>
              <Btn variant="danger" onClick={forceLogout}>🔒 Force Logout All</Btn>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:C.gold, marginBottom:14 }}>🔑 Password Management</div>
          <div style={{ fontSize:12, color:C.mid, marginBottom:12 }}>Reset employee passwords to "temp" (forces change on next login)</div>
          {employees.filter(e=>e.role!=="admin"&&e.status==="active").map(emp=>(
            <div key={emp.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:C.surfAlt, borderRadius:6, marginBottom:6 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <Av letters={emp.av} size={26} color={emp.role==="manager"?C.teal:C.blue} />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{emp.name}</div>
                  <div style={{ fontSize:11, color:C.dim }}>{emp.id} {emp.fpc&&<Badge label="PW Change Required" type="warning" />}</div>
                </div>
              </div>
              <Btn variant="orange" size="sm" onClick={()=>resetPw(emp.id)}>🔄 Reset PW</Btn>
            </div>
          ))}
          <div style={{ marginTop:10 }}>
            <Btn variant="ghost" style={{ width:"100%", justifyContent:"center" }} onClick={()=>{ setEmployees(p=>p.map(e=>e.role!=="admin"?{...e,password:"temp",fpc:true}:e)); toast("All passwords reset to 'temp'","success"); }}>🔄 Reset All Passwords</Btn>
          </div>
        </Card>

        <Card style={{ border:`1px solid ${C.red}40`, gridColumn:"1/-1" }}>
          <div style={{ fontSize:14, fontWeight:800, color:C.red, marginBottom:6 }}>⚠️ Data Management</div>
          <div style={{ fontSize:12, color:C.mid, marginBottom:14 }}>These actions affect all stored data and cannot be undone. Use with caution.</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <Btn variant="danger" onClick={() => onResetData("timesheets")}>🗑 Clear All Timesheets</Btn>
            <Btn variant="danger" onClick={() => onResetData("requests")}>🗑 Clear All Requests</Btn>
            <Btn variant="danger" onClick={() => onResetData("employees")}>🗑 Reset Employees to Default</Btn>
            <Btn variant="danger" onClick={() => onResetData("all")}>🗑 Reset Everything to Default</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SIGN TIMESHEET MODAL (top-level component — hooks must not be in IIFE) ───
function SignTimesheetModal({ ts, sigName, setSigName, onSign, onDispute, onClose }) {
  const [mode, setMode] = useState("sign");
  const [disputeCi, setDisputeCi] = useState(ts.ci || "");
  const [disputeCo, setDisputeCo] = useState(ts.co || "");
  const [disputeNote, setDisputeNote] = useState("");

  return (
    <Modal title="Sign Your Timesheet" onClose={onClose} width={500}>
      {/* Time summary */}
      <div style={{ background:C.surfAlt, borderRadius:8, padding:14, marginBottom:16 }}>
        {[["Date",ts.date],["Clock In",ts.ci],["Clock Out",ts.co||"Still active"],["Location",ts.location||"—"],["Regular Hours",`${ts.reg}h`],["Overtime",`${ts.ot}h`]].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ color:C.mid }}>{k}</span><span style={{ color:C.text, fontWeight:700 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Mode tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[["sign","✍️ Sign & Submit","Confirm times are correct"],["dispute","⚠️ Raise Dispute","Times are incorrect"]].map(([m, label, sub])=>(
          <button key={m} onClick={()=>setMode(m)} style={{
            flex:1, padding:"10px 12px", borderRadius:10, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left",
            background: mode===m ? (m==="sign"?`${C.teal}20`:`${C.orange}20`) : C.surfAlt,
            border: `2px solid ${mode===m ? (m==="sign"?C.teal:C.orange) : C.border}`,
            color: mode===m ? (m==="sign"?C.teal:C.orange) : C.mid,
            transition:"all 0.15s"
          }}>
            <div style={{ fontWeight:700, fontSize:13 }}>{label}</div>
            <div style={{ fontSize:11, opacity:0.8, marginTop:2 }}>{sub}</div>
          </button>
        ))}
      </div>

      {mode === "sign" && (
        <>
          <Input label="Your Full Name — Electronic Signature" value={sigName} onChange={setSigName} />
          <div style={{ marginTop:10, fontSize:11, color:C.dim, padding:"8px 12px", background:C.surfAlt, borderRadius:6 }}>
            🕐 {tsNow()} · IP address will be logged automatically
          </div>
          <div style={{ padding:"10px 12px", background:`${C.blue}12`, border:`1px solid ${C.blue}30`, borderRadius:8, fontSize:12, color:C.mid, marginTop:10 }}>
            ✅ By signing you confirm this time entry is accurate and legally binding.
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={onClose}>Decline</Btn>
            <Btn variant="success" onClick={()=>onSign(sigName)} disabled={!sigName.trim()}>✍️ Sign & Submit</Btn>
          </div>
        </>
      )}

      {mode === "dispute" && (
        <>
          <div style={{ padding:"10px 14px", background:`${C.orange}12`, border:`1px solid ${C.orange}35`, borderRadius:8, marginBottom:14, fontSize:12, color:C.orange }}>
            ⚠️ Enter the correct times and explain what happened. Your supervisor will review and approve or reject the dispute.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:12, color:C.mid, fontWeight:600, marginBottom:6 }}>Correct Clock In</div>
              <input type="time" value={disputeCi} onChange={e=>setDisputeCi(e.target.value)}
                style={{ width:"100%", background:C.surfAlt, border:`1px solid ${disputeCi?C.teal:C.border}`, borderRadius:8, color:C.text, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:C.mid, fontWeight:600, marginBottom:6 }}>Correct Clock Out</div>
              <input type="time" value={disputeCo} onChange={e=>setDisputeCo(e.target.value)}
                style={{ width:"100%", background:C.surfAlt, border:`1px solid ${disputeCo?C.teal:C.border}`, borderRadius:8, color:C.text, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:C.mid, fontWeight:600, marginBottom:6 }}>Reason / Explanation *</div>
            <textarea value={disputeNote} onChange={e=>setDisputeNote(e.target.value)} rows={3}
              placeholder="e.g. System was down and I could not clock in on time. I arrived at 08:00 but clocked in at 09:15 due to technical issues."
              style={{ width:"100%", background:C.surfAlt, border:`1px solid ${disputeNote?C.orange:C.border}`, borderRadius:8, color:C.text, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"vertical" }} />
          </div>
          <Input label="Your Full Name — Electronic Signature" value={sigName} onChange={setSigName} />
          <div style={{ marginTop:10, fontSize:11, color:C.dim, padding:"8px 12px", background:C.surfAlt, borderRadius:6 }}>
            🕐 {tsNow()} · Dispute will be flagged to your supervisor for review
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setMode("sign")}>← Back</Btn>
            <Btn variant="orange" onClick={()=>onDispute(disputeCi, disputeCo, disputeNote, sigName)} disabled={!disputeNote.trim()||!disputeCi||!disputeCo||!sigName.trim()}>⚠️ Submit Dispute</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── EMPLOYEE: CLOCK IN/OUT ────────────────────────────────────────────────────
function ClockPanel({ user, timesheets, setTimesheets, toast }) {
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const [workLocation, setWorkLocation] = useState("");
  const [nowTime, setNowTime] = useState(timeNow());
  // gps states:
  //   "idle"        — no location selected yet
  //   "need_perm"   — location selected but user hasn't granted permission yet
  //   "requesting"  — permission granted, waiting for coords
  //   "inside"      — confirmed inside the zone  ✅ ONLY state that allows clock-in
  //   "outside"     — confirmed outside the zone ❌
  //   "denied"      — browser permission denied  ❌
  //   "no_zone"     — location has no geofence yet ❌
  //   "unavailable" — GPS hardware error         ❌
  const [gps, setGps]             = useState("idle");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsDist, setGpsDist]     = useState(null);
  const [gpsZone, setGpsZone]     = useState(null);  // the zone being checked
  const [sigModal, setSigModal]   = useState(null);
  const [sigName, setSigName]     = useState(user.name);
  const [editModal, setEditModal] = useState(null);
  const [confirm, setConfirm]     = useState(null);

  useEffect(() => {
    const iv = setInterval(() => setNowTime(timeNow()), 10000);
    return () => clearInterval(iv);
  }, []);

  // When location changes, reset GPS and show permission prompt
  useEffect(() => {
    if (!workLocation) { setGps("idle"); setGpsCoords(null); setGpsDist(null); setGpsZone(null); return; }
    const zoneName = LOCATION_ZONE_MAP[workLocation];
    const zone = INIT_GEOFENCES.find(z => z.name === zoneName);
    if (!zone) { setGps("no_zone"); setGpsZone(null); return; }
    setGpsZone(zone);
    setGps("need_perm"); // show the Enable Location button — don't auto-request
    setGpsCoords(null);
    setGpsDist(null);
  }, [workLocation]);

  // Called when employee taps "Enable Location" button
  const requestLocation = async () => {
    if (!gpsZone) return;
    if (!navigator.geolocation) { setGps("unavailable"); return; }

    // Check permission state FIRST via Permissions API
    // If state is "denied" already, no popup will ever show — tell user immediately
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      if (perm.state === "denied") {
        setGps("sandbox_blocked"); // denied by iframe or user — same fix
        return;
      }
      // "granted" → go straight to getting position (no popup needed)
      // "prompt"  → popup will appear when we call getCurrentPosition
    } catch(e) {
      // Permissions API not supported — proceed anyway and see what happens
    }

    setGps("requesting");

    // Wrap in a short timeout — if the iframe blocks geolocation silently
    // (no popup, no error — just never fires), we detect it after 3 seconds
    let fired = false;
    const sandboxTimer = setTimeout(() => {
      if (!fired) setGps("sandbox_blocked");
    }, 3000);

    navigator.geolocation.getCurrentPosition(
      pos => {
        fired = true;
        clearTimeout(sandboxTimer);
        const { latitude: lat, longitude: lng } = pos.coords;
        setGpsCoords({ lat, lng });
        const dist = Math.round(haversineMetres(lat, lng, gpsZone.lat, gpsZone.lng));
        setGpsDist(dist);
        setGps(dist <= gpsZone.radius ? "inside" : "outside");
      },
      err => {
        fired = true;
        clearTimeout(sandboxTimer);
        if (err.code === 1) setGps("sandbox_blocked"); // permission denied = same fix as sandbox
        else setGps("unavailable");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const mySheets = timesheets.filter(t=>t.eid===user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const totHrs = mySheets.slice(0,7).reduce((a,b)=>a+b.reg+b.ot,0);

  const handleClockIn = () => {
    if (gps !== "inside") return; // hard block — only inside verified zone can clock in
    setClockedIn(true); setClockInTime(timeNow()); toast(`Clocked in at ${workLocation} 🟢`,"success");
  };

  const handleClockOut = () => {
    const co=timeNow();
    const [ih,im]=clockInTime.split(":").map(Number);
    const [oh,om]=co.split(":").map(Number);
    const totalMins=(oh*60+om)-(ih*60+im);
    const totalHrs=Math.max(0,(totalMins-30)/60);
    const reg=+Math.min(8,totalHrs).toFixed(2);
    const ot=+Math.max(0,totalHrs-8).toFixed(2);
    const newTs={ id:`TS${uid()}`, eid:user.id, date:dateToday(), ci:clockInTime, co, reg, ot, brk:30, location:workLocation, gIn:gpsCoords||{lat:null,lng:null}, gOut:gpsCoords||{lat:null,lng:null}, status:"pending_employee", eSig:null, f1Sig:null, f2Sig:null, notes:"", edited:false, hist:[] };
    setTimesheets(p=>[...p,newTs]);
    setClockedIn(false); setClockInTime(null);
    setSigModal(newTs); setSigName(user.name);
    toast(`Clocked out — ${reg}h regular, ${ot}h overtime`,"success");
  };

  const signTs = (ts, name) => {
    const sig={ name: name||sigName, time:tsNow(), ip:`192.168.${Math.floor(Math.random()*5)}.${Math.floor(Math.random()*200+10)}` };
    setTimesheets(p=>p.map(t=>t.id===ts.id?{...t,eSig:sig,status:"pending_first_approval"}:t));
    setSigModal(null); toast("Timesheet signed and submitted for approval ✅","success");
  };

  const saveEdit = () => {
    setTimesheets(p=>p.map(t=>t.id===editModal.id?{...editModal,edited:true}:t));
    setEditModal(null); toast("Time entry updated","success");
  };

  const deleteTs = id => setConfirm({ msg:"Delete this time entry?", onOk:()=>{ setTimesheets(p=>p.filter(t=>t.id!==id)); toast("Entry deleted","success"); setConfirm(null); }});

  // Only "inside" is green and allows clock-in — everything else blocks
  const GPS_UI = {
    idle:            { color:C.dim,    icon:"📍", text:"Select a location to verify your position" },
    need_perm:       { color:C.blue,   icon:"📡", text:"Tap Enable Location to verify you're on-site" },
    requesting:      { color:C.blue,   icon:"📡", text:"Checking your location…" },
    inside:          { color:C.green,  icon:"✅", text:`Inside Work Zone${gpsDist!==null?" · "+gpsDist+"m from centre":""}` },
    outside:         { color:C.red,    icon:"🚫", text:`Outside Zone — ${gpsDist!==null?gpsDist+"m from boundary":"move closer"}` },
    denied:          { color:C.red,    icon:"🔒", text:"Location permission denied — see instructions below" },
    no_zone:         { color:C.orange, icon:"⚠️", text:"No geofence set up for this location" },
    unavailable:     { color:C.red,    icon:"⚠️", text:"Could not get your location — check GPS/signal" },
    sandbox_blocked: { color:C.orange, icon:"🔒", text:"Location blocked — see instructions below" },
  };
  const gUI = GPS_UI[gps] || GPS_UI.idle;
  const canClockIn = gps === "inside";

  return (
    <div>
      <SectionH title="My Time" sub="Clock in/out, manage time entries, and track your hours" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:22 }}>
        <Card style={{ textAlign:"center", padding:32 }}>
          {/* Clock */}
          <div style={{ fontSize:52, fontWeight:900, color:C.text, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{nowTime}</div>
          <div style={{ color:C.mid, fontSize:13, marginTop:4, marginBottom:20 }}>{dateToday()}</div>

          {/* GPS status banner */}
          <div style={{ padding:"10px 14px", background:`${gUI.color}15`, border:`1px solid ${gUI.color}40`, borderRadius:10, marginBottom:16, display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
            <span style={{ fontSize:16 }}>{gUI.icon}</span>
            <span style={{ fontSize:12, color:gUI.color, fontWeight:700 }}>{gUI.text}</span>
          </div>

          {!clockedIn && (<>
            {/* Step 1: pick location */}
            <div style={{ marginBottom:14, textAlign:"left" }}>
              <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>STEP 1 — SELECT WORK LOCATION</div>
              {(() => {
                const assigned = Array.isArray(user.geo) ? user.geo : (user.geo ? [user.geo] : []);
                const options  = assigned.length > 0 ? assigned : WORK_LOCATIONS;
                return (
                  <>
                    <select value={workLocation} onChange={e=>setWorkLocation(e.target.value)}
                      style={{ width:"100%", background:C.surfAlt, border:`1px solid ${workLocation?C.teal:C.border}`, borderRadius:8, color:workLocation?C.text:C.dim, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", cursor:"pointer" }}>
                      <option value="">— Select location —</option>
                      {options.map(loc=><option key={loc} value={loc}>{loc}</option>)}
                    </select>
                    {assigned.length > 0 && <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>Showing your {assigned.length} assigned location{assigned.length>1?"s":""}</div>}
                  </>
                );
              })()}
            </div>

            {/* Step 2: enable location */}
            {(gps==="need_perm" || gps==="denied" || gps==="unavailable" || gps==="sandbox_blocked") && (
              <div style={{ marginBottom:14, textAlign:"left" }}>
                <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>STEP 2 — VERIFY YOU ARE ON-SITE</div>

                {(gps==="denied" || gps==="sandbox_blocked") ? (
                  <div style={{ background:`${C.orange}10`, border:`1px solid ${C.orange}35`, borderRadius:10, overflow:"hidden" }}>
                    <div style={{ background:`${C.orange}20`, padding:"10px 14px", display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:18 }}>🔒</span>
                      <div>
                        <div style={{ fontWeight:800, color:C.orange, fontSize:13 }}>Location Access Blocked</div>
                        <div style={{ fontSize:11, color:C.mid }}>You need to allow location for this site</div>
                      </div>
                    </div>
                    <div style={{ padding:"12px 14px", fontSize:12, lineHeight:1.9 }}>
                      <div style={{ color:C.mid, marginBottom:10 }}>Follow these steps for your browser, then click Try Again:</div>

                      <div style={{ marginBottom:8, padding:"8px 10px", background:C.surfAlt, borderRadius:8 }}>
                        <div style={{ fontWeight:700, color:C.text, marginBottom:3 }}>🟡 Chrome or Edge</div>
                        <div style={{ color:C.mid }}>1. Click the <strong style={{color:C.text}}>🔒 lock icon</strong> in the address bar</div>
                        <div style={{ color:C.mid }}>2. Click <strong style={{color:C.text}}>Site settings</strong></div>
                        <div style={{ color:C.mid }}>3. Find <strong style={{color:C.text}}>Location</strong> → set to <strong style={{color:C.green}}>Allow</strong></div>
                        <div style={{ color:C.mid }}>4. Refresh the page</div>
                      </div>

                      <div style={{ marginBottom:8, padding:"8px 10px", background:C.surfAlt, borderRadius:8 }}>
                        <div style={{ fontWeight:700, color:C.text, marginBottom:3 }}>🦊 Firefox</div>
                        <div style={{ color:C.mid }}>1. Click the <strong style={{color:C.text}}>shield 🛡 icon</strong> in the address bar</div>
                        <div style={{ color:C.mid }}>2. Click <strong style={{color:C.text}}>Connection Secure</strong> → <strong style={{color:C.text}}>More information</strong></div>
                        <div style={{ color:C.mid }}>3. Permissions tab → <strong style={{color:C.text}}>Access your Location</strong> → Allow</div>
                      </div>

                      <div style={{ marginBottom:12, padding:"8px 10px", background:C.surfAlt, borderRadius:8 }}>
                        <div style={{ fontWeight:700, color:C.text, marginBottom:3 }}>🧭 Safari</div>
                        <div style={{ color:C.mid }}>1. Safari menu → <strong style={{color:C.text}}>Settings for this Website</strong></div>
                        <div style={{ color:C.mid }}>2. <strong style={{color:C.text}}>Location</strong> → <strong style={{color:C.green}}>Allow</strong></div>
                      </div>

                      <Btn variant="teal" style={{ width:"100%", justifyContent:"center" }} onClick={requestLocation}>🔄 Try Again</Btn>
                    </div>
                  </div>

                ) : gps==="unavailable" ? (
                  <div>
                    <div style={{ padding:"10px 12px", background:`${C.red}12`, border:`1px solid ${C.red}30`, borderRadius:8, fontSize:12, color:C.red, marginBottom:8, lineHeight:1.6 }}>
                      ⚠️ Could not get your GPS position.<br/>Check your signal or move outdoors, then retry.
                    </div>
                    <Btn style={{ width:"100%", justifyContent:"center" }} onClick={requestLocation}>🔄 Retry Location Check</Btn>
                  </div>

                ) : (
                  <Btn variant="teal" style={{ width:"100%", justifyContent:"center", fontSize:14, padding:"13px" }} onClick={requestLocation}>
                    📡 Enable Location Access
                  </Btn>
                )}
              </div>
            )}

            {/* Step 3: spinner while checking */}
            {gps==="requesting" && (
              <div style={{ marginBottom:14, padding:"12px", background:`${C.blue}12`, border:`1px solid ${C.blue}30`, borderRadius:8, fontSize:12, color:C.blue, textAlign:"center" }}>
                📡 Checking your GPS position… please wait
              </div>
            )}

            {/* No zone message */}
            {gps==="no_zone" && (
              <div style={{ marginBottom:14, padding:"10px 12px", background:`${C.orange}12`, border:`1px solid ${C.orange}30`, borderRadius:8, fontSize:12, color:C.orange }}>
                ⚠️ This location has no geofence zone configured. Contact your administrator.
              </div>
            )}

            {/* Clock In button — ONLY enabled when inside verified zone */}
            <Btn variant="success" size="lg" style={{ width:"100%", justifyContent:"center", opacity:canClockIn?1:0.4, cursor:canClockIn?"pointer":"not-allowed" }}
              onClick={handleClockIn} disabled={!canClockIn}>
              {canClockIn ? "🟢 Clock In" : gps==="outside" ? "🚫 Outside Zone — Cannot Clock In" : gps==="requesting" ? "📡 Verifying Location…" : "🟢 Clock In"}
            </Btn>

            {/* Outside zone: show distance and retry */}
            {gps==="outside" && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:12, color:C.red, marginBottom:8 }}>You are {gpsDist}m outside the {workLocation} zone. You must be within the designated area to clock in.</div>
                <Btn variant="ghost" size="sm" style={{ width:"100%", justifyContent:"center" }} onClick={requestLocation}>🔄 Re-check My Location</Btn>
              </div>
            )}

            {/* Inside: show re-check option */}
            {gps==="inside" && (
              <div style={{ marginTop:8, fontSize:11, color:C.dim, textAlign:"center" }}>
                {gpsDist}m from zone centre · <span style={{ color:C.teal, cursor:"pointer", textDecoration:"underline" }} onClick={requestLocation}>Re-check</span>
              </div>
            )}
          </>)}

          {clockedIn && (<>
            <div style={{ color:C.green, fontSize:13, marginBottom:8, fontWeight:700 }}>🟢 Clocked in at {clockInTime}</div>
            <div style={{ color:C.teal, fontSize:12, marginBottom:16 }}>📍 {workLocation}</div>
            <Btn variant="danger" size="lg" style={{ width:"100%", justifyContent:"center" }} onClick={handleClockOut}>🔴 Clock Out</Btn>
          </>)}
        </Card>

        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:14 }}>This Week</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
            <div style={{ background:C.surfAlt, borderRadius:8, padding:14, textAlign:"center" }}>
              <div style={{ fontSize:30, fontWeight:900, color:C.teal, fontFamily:"'DM Mono',monospace" }}>{totHrs.toFixed(0)}h</div>
              <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>Total Hours</div>
            </div>
            <div style={{ background:C.surfAlt, borderRadius:8, padding:14, textAlign:"center" }}>
              <div style={{ fontSize:30, fontWeight:900, color:C.gold, fontFamily:"'DM Mono',monospace" }}>{mySheets.slice(0,7).length}</div>
              <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>Days Logged</div>
            </div>
          </div>
          <div style={{ fontSize:11, color:C.dim, fontWeight:700, letterSpacing:"0.06em", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>RECENT STATUS</div>
          {mySheets.slice(0,3).map(ts=>(
            <div key={ts.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, padding:"6px 10px", background:C.surfAlt, borderRadius:6 }}>
              <span style={{ color:C.mid, fontSize:12 }}>{ts.date}</span>
              <span style={{ color:C.mid, fontSize:12, fontFamily:"'DM Mono',monospace" }}>{ts.reg}h + {ts.ot}h OT</span>
              {tsStatusBadge(ts.status)}
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, fontWeight:800, color:C.text }}>My Time Entries</div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr><Th>Date</Th><Th>Clock In</Th><Th>Clock Out</Th><Th>Regular</Th><Th>Overtime</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {mySheets.length===0&&<tr><td colSpan={7} style={{ padding:32, textAlign:"center", color:C.dim }}>No time entries yet. Clock in to get started.</td></tr>}
            {mySheets.map((ts,i)=>(
              <tr key={ts.id} style={{ background:i%2?`${C.surfAlt}40`:"transparent" }}>
                <Td mono>{ts.date}</Td>
                <Td mono><span style={{ color:C.green }}>{ts.ci}</span></Td>
                <Td mono><span style={{ color:C.red }}>{ts.co||"—"}</span></Td>
                <Td mono>{ts.reg}h</Td>
                <Td mono><span style={{ color:ts.ot>0?C.orange:C.dim }}>{ts.ot}h</span></Td>
                <Td>{tsStatusBadge(ts.status)}</Td>
                <Td>
                  <div style={{ display:"flex", gap:5 }}>
                    {ts.status==="pending_employee"&&<Btn variant="success" size="sm" onClick={()=>{setSigModal(ts);setSigName(user.name);}}>✍️ Sign</Btn>}
                    {ts.status==="pending_employee"&&<Btn variant="ghost" size="sm" onClick={()=>setEditModal({...ts})}>✏️</Btn>}
                    <Btn variant="danger" size="sm" onClick={()=>deleteTs(ts.id)}>🗑</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {sigModal && (
        <SignTimesheetModal
          ts={sigModal}
          sigName={sigName}
          setSigName={setSigName}
          onSign={(name)=>signTs(sigModal, name)}
          onDispute={(disputeCi, disputeCo, disputeNote, name) => {
            const sig = { name: name||sigName, time:tsNow(), ip:`192.168.${Math.floor(Math.random()*5)}.${Math.floor(Math.random()*200+10)}` };
            const [ih,im] = disputeCi.split(":").map(Number);
            const [oh,om] = disputeCo.split(":").map(Number);
            const totalMins = (oh*60+om) - (ih*60+im);
            const totalHrs = Math.max(0,(totalMins-30)/60);
            const reg = +Math.min(8,totalHrs).toFixed(2);
            const ot = +Math.max(0,totalHrs-8).toFixed(2);
            const tsId = sigModal?.id;
            const empName = user.name;
            setTimesheets(p=>p.map(t=>t.id===tsId ? {
              ...t, ci:disputeCi, co:disputeCo, reg, ot, eSig:sig,
              status:"pending_first_approval", disputed:true,
              disputeNote:disputeNote.trim(),
              hist:[...(t.hist||[]),{ note:`Disputed by ${empName}: ${disputeNote.trim()}`, time:tsNow() }]
            } : t));
            setSigModal(null);
            toast("Dispute submitted for review ⚠️","success");
          }}
          onClose={()=>setSigModal(null)}
        />
      )}

      {editModal && (
        <Modal title="Edit Time Entry" onClose={()=>setEditModal(null)} width={440}>
          <div style={{ padding:"9px 12px", background:`${C.orange}12`, border:`1px solid ${C.orange}40`, borderRadius:8, marginBottom:14, fontSize:12, color:C.orange }}>⚠️ Edits are logged in the audit trail.</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Input label="Clock In" value={editModal.ci} onChange={v=>setEditModal(p=>({...p,ci:v}))} type="time" />
            <Input label="Clock Out" value={editModal.co} onChange={v=>setEditModal(p=>({...p,co:v}))} type="time" />
            <Input label="Regular Hours" value={editModal.reg} onChange={v=>setEditModal(p=>({...p,reg:+v}))} type="number" />
            <Input label="Overtime Hours" value={editModal.ot} onChange={v=>setEditModal(p=>({...p,ot:+v}))} type="number" />
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setEditModal(null)}>Cancel</Btn>
            <Btn onClick={saveEdit}>💾 Save</Btn>
          </div>
        </Modal>
      )}
      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.onOk} onCancel={()=>setConfirm(null)} />}
    </div>
  );
}

// ─── EMPLOYEE PAYSLIPS ────────────────────────────────────────────────────────
function PayslipsPanel({ user, toast }) {
  const months = ["June 2025","May 2025","April 2025","March 2025","February 2025","January 2025"];
  const [month, setMonth] = useState(months[0]);

  const baseHrs = { regular:176, overtime: user.id==="1001"?8:0 };
  const calc = calcPayroll(user, baseHrs);

  const print = () => {
    const html=`<html><head><title>Payslip - ${user.name}</title><style>body{font-family:monospace;max-width:500px;margin:40px auto;padding:20px;border:2px solid #d4a843}h1{color:#d4a843;font-size:18px}hr{border-color:#d4a843}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.net{font-size:22px;font-weight:bold;color:#00c9a7;display:flex;justify-content:space-between;padding-top:12px}</style></head><body><h1>⚡ FEDERAL MANAGEMENT SYSTEMS</h1><p>Payslip for ${month}<br>${user.name} · ${user.pos} · ${user.id}</p><hr><div class="row"><span>Gross Pay</span><span>GYD ${calc.gross.toLocaleString()}</span></div><div class="row"><span>NIS (Employee 5.6%)</span><span>(GYD ${calc.nisEmployee.toLocaleString()})</span></div><div class="row"><span>PAYE (28%)</span><span>(GYD ${calc.paye.toLocaleString()})</span></div><div class="net"><span>NET PAY</span><span>GYD ${calc.net.toLocaleString()}</span></div><br><small>NIS Employer Contribution: GYD ${calc.nisEmployer.toLocaleString()} | Guyana 2026 Labour Law Compliant</small></body></html>`;
    const w=window.open("","_blank"); w.document.write(html); w.document.close(); w.print();
  };

  return (
    <div>
      <SectionH title="My Pay Slips" sub="View and download your monthly payslips" />
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {months.map(m=><Btn key={m} variant={month===m?"primary":"ghost"} size="sm" onClick={()=>setMonth(m)}>{m}</Btn>)}
      </div>
      <div style={{ maxWidth:520 }}>
        <Card style={{ border:`1px solid ${C.gold}40` }}>
          <div style={{ textAlign:"center", paddingBottom:18, borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
            <div style={{ fontSize:20, fontWeight:900, color:C.gold }}>⚡ FEDERAL MANAGEMENT SYSTEMS</div>
            <div style={{ color:C.mid, fontSize:12, marginTop:2 }}>Employee Payslip · {month}</div>
          </div>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{user.name}</div>
            <div style={{ color:C.mid, fontSize:12 }}>{user.pos} · {user.dept} · ID: {user.id}</div>
            <div style={{ color:C.dim, fontSize:11, marginTop:2 }}>Category: {user.cat} · Joined: {user.joined}</div>
          </div>
          <div style={{ background:C.surfAlt, borderRadius:10, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.dim, fontWeight:700, letterSpacing:"0.07em", marginBottom:10, fontFamily:"'DM Mono',monospace" }}>EARNINGS</div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
              <span style={{ color:C.mid }}>Basic {user.cat==="Time"?`(${baseHrs.regular}hrs × ${fmt(user.hourlyRate)})`:user.cat+" Salary"}</span>
              <span style={{ color:C.text, fontWeight:700 }}>{fmt(user.cat==="Time"?baseHrs.regular*user.hourlyRate:user.salary)}</span>
            </div>
            {baseHrs.overtime>0&&<div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
              <span style={{ color:C.mid }}>Overtime ({baseHrs.overtime}hrs × 1.5)</span>
              <span style={{ color:C.orange, fontWeight:700 }}>{fmt(baseHrs.overtime*(user.hourlyRate||0)*1.5)}</span>
            </div>}
            <div style={{ display:"flex", justifyContent:"space-between", paddingTop:10, borderTop:`1px solid ${C.border}`, fontWeight:800 }}>
              <span style={{ color:C.text }}>Gross Pay</span><span style={{ color:C.text }}>{fmt(calc.gross)}</span>
            </div>
          </div>
          <div style={{ background:C.surfAlt, borderRadius:10, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.dim, fontWeight:700, letterSpacing:"0.07em", marginBottom:10, fontFamily:"'DM Mono',monospace" }}>DEDUCTIONS</div>
            {[["NIS Employee (5.6%)",calc.nisEmployee,C.orange],["PAYE (28%)",calc.paye,C.red]].map(([k,v,c])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
                <span style={{ color:C.mid }}>{k}</span><span style={{ color:c, fontWeight:700 }}>({fmt(v)})</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 0 4px", fontSize:22, fontWeight:900 }}>
            <span style={{ color:C.teal }}>NET PAY</span><span style={{ color:C.teal, fontFamily:"'DM Mono',monospace" }}>{fmt(calc.net)}</span>
          </div>
          <div style={{ marginTop:12, padding:10, background:C.surfAlt, borderRadius:8, fontSize:11, color:C.dim, textAlign:"center" }}>
            Employer NIS Contribution: {fmt(calc.nisEmployer)} · Tax Year 2025/2026 · Guyana GRA Compliant
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <Btn style={{ flex:1, justifyContent:"center" }} onClick={print}>🖨 Print / Download PDF</Btn>
            <Btn variant="ghost" style={{ flex:1, justifyContent:"center" }} onClick={()=>toast("Payslip emailed to your address","success")}>📧 Email Payslip</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
const save = (key, val) => window.storage.set(key, JSON.stringify(val)).catch(() => {});
const load = async (key, fallback) => {
  try { const r = await window.storage.get(key); return r?.value ? JSON.parse(r.value) : fallback; }
  catch (_) { return fallback; }
};

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [employees, setEmployeesRaw] = useState(INIT_EMPLOYEES);
  const [timesheets, setTimesheetsRaw] = useState(INIT_TIMESHEETS);
  const [requests,   setRequestsRaw]   = useState(INIT_REQUESTS);
  const [user,   setUser]   = useState(null);
  const [tab,    setTab]    = useState("dashboard");
  const [ready,  setReady]  = useState(false);
  const [forcePwChange, setForcePwChange] = useState(false);
  const { toasts, add: toast, remove } = useToast();

  // Wrapped setters — update state AND immediately persist to storage
  const setEmployees = useCallback(fn => {
    setEmployeesRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      save("fms:employees", next);
      return next;
    });
  }, []);

  const setTimesheets = useCallback(fn => {
    setTimesheetsRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      save("fms:timesheets", next);
      return next;
    });
  }, []);

  const setRequests = useCallback(fn => {
    setRequestsRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      save("fms:requests", next);
      return next;
    });
  }, []);

  // ── Load everything from storage on mount ─────────────────────────────────
  useEffect(() => {
    (async () => {
      const [savedEmps, savedTs, savedReqs, savedSession] = await Promise.all([
        load("fms:employees",  INIT_EMPLOYEES),
        load("fms:timesheets", INIT_TIMESHEETS),
        load("fms:requests",   INIT_REQUESTS),
        load("fms:session",    null),
      ]);

      // ── Migration: ensure all seed employees exist (e.g. Troy Mason added later) ──
      const mergedEmps = [...savedEmps];
      INIT_EMPLOYEES.forEach(seed => {
        if (!mergedEmps.find(e => e.id === seed.id)) mergedEmps.push(seed);
      });

      // ── Migration: if fa/sa look like employee IDs (not position strings),
      //    convert them by looking up that employee's position title ──
      const isIdLike = v => v && !v.includes(" ");   // IDs have no spaces; position titles always do
      const migratedEmps = mergedEmps.map(e => {
        let { fa, sa } = e;
        if (isIdLike(fa)) {
          const holder = mergedEmps.find(x => x.id === fa);
          fa = holder?.pos || fa;
        }
        if (isIdLike(sa)) {
          const holder = mergedEmps.find(x => x.id === sa);
          sa = holder?.pos || sa;
        }
        // Also normalise geo: convert old string → array
        let geo = e.geo;
        if (typeof geo === "string") geo = geo ? [geo] : [];
        if (!Array.isArray(geo)) geo = [];
        return { ...e, fa, sa, geo };
      });

      // Save migrated data back so future loads are clean
      if (JSON.stringify(migratedEmps) !== JSON.stringify(savedEmps)) {
        save("fms:employees", migratedEmps);
      }

      setEmployeesRaw(migratedEmps);
      setTimesheetsRaw(savedTs);
      setRequestsRaw(savedReqs);

      // Restore logged-in user from the migrated employee list
      if (savedSession?.userId) {
        const found = migratedEmps.find(e => e.id === savedSession.userId && e.status === "active");
        if (found) {
          setUser(found);
          if (found.fpc) {
            setForcePwChange(true);
          } else {
            setTab(savedSession.savedTab || (found.role === "employee" ? "clock" : "dashboard"));
          }
        }
      }

      setReady(true);
    })();
  }, []);

  // Persist tab + user whenever they change
  useEffect(() => {
    if (user) save("fms:session", { userId: user.id, savedTab: tab });
  }, [tab, user]);

  const login = emp => {
    if (emp.fpc) {
      // Force password change before entering the app
      setUser(emp);
      setForcePwChange(true);
      return;
    }
    setUser(emp);
    const newTab = emp.role === "employee" ? "clock" : "dashboard";
    setTab(newTab);
    save("fms:session", { userId: emp.id, savedTab: newTab });
  };

  const logout = () => {
    setUser(null);
    setTab("dashboard");
    setForcePwChange(false);
    window.storage.delete("fms:session").catch(() => {});
  };

  const completePasswordChange = (newPassword) => {
    const updated = { ...user, password: newPassword, fpc: false };
    // Compute the new employees array NOW — before React's async cycle
    // so we can save it to storage immediately and synchronously
    setEmployeesRaw(prev => {
      const next = prev.map(e => e.id === user.id ? updated : e);
      save("fms:employees", next); // guaranteed to run before any reload
      return next;
    });
    setUser(updated);
    setForcePwChange(false);
    const newTab = updated.role === "employee" ? "clock" : "dashboard";
    setTab(newTab);
    save("fms:session", { userId: updated.id, savedTab: newTab });
  };

  // Show a brief loading screen while storage is being read
  if (!ready) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:14 }}>⚡</div>
          <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:6 }}>FMS TimeTrack</div>
          <div style={{ color:C.mid, fontSize:13 }}>Loading your data…</div>
        </div>
      </div>
    );
  }

  const resetData = (what) => {
    if (what === "timesheets" || what === "all") { setTimesheets(INIT_TIMESHEETS); }
    if (what === "requests"   || what === "all") { setRequests(INIT_REQUESTS); }
    if (what === "employees"  || what === "all") { setEmployees(INIT_EMPLOYEES); }
    if (what === "all") { window.storage.delete("fms:session").catch(()=>{}); setUser(null); setTab("dashboard"); }
    toast(`Reset complete — ${what === "all" ? "all data cleared" : what + " cleared"}`, "success");
  };

  const renderPanel = () => {
    if(user.role==="admin") {
      return ({
        dashboard: <Dashboard employees={employees} timesheets={timesheets} requests={requests} setTab={setTab} />,
        employees: <EmployeesPanel employees={employees} setEmployees={setEmployees} toast={toast} />,
        timesheets: <TimesheetsPanel timesheets={timesheets} setTimesheets={setTimesheets} employees={employees} toast={toast} />,
        approvals: <ApprovalsPanel timesheets={timesheets} setTimesheets={setTimesheets} employees={employees} user={user} toast={toast} />,
        payroll: <PayrollPanel employees={employees} timesheets={timesheets} setTimesheets={setTimesheets} toast={toast} />,
        geofencing: <GeofencingPanel toast={toast} />,
        requests: <RequestsPanel requests={requests} setRequests={setRequests} employees={employees} user={user} toast={toast} />,
        reports: <ReportsPanel employees={employees} timesheets={timesheets} requests={requests} toast={toast} />,
        settings: <SettingsPanel employees={employees} setEmployees={setEmployees} toast={toast} onResetData={resetData} />,
      })[tab]||null;
    }
    if(user.role==="manager") {
      return ({
        dashboard: <Dashboard employees={employees} timesheets={timesheets} requests={requests} setTab={setTab} />,
        approvals: <ApprovalsPanel timesheets={timesheets} setTimesheets={setTimesheets} employees={employees} user={user} toast={toast} />,
        timesheets: <TimesheetsPanel timesheets={timesheets} setTimesheets={setTimesheets} employees={employees} toast={toast} />,
        requests: <RequestsPanel requests={requests} setRequests={setRequests} employees={employees} user={user} toast={toast} />,
      })[tab]||null;
    }
    return ({
      clock: <ClockPanel user={user} timesheets={timesheets} setTimesheets={setTimesheets} toast={toast} />,
      requests: <RequestsPanel requests={requests} setRequests={setRequests} employees={employees} user={user} toast={toast} />,
      payslips: <PayslipsPanel user={user} toast={toast} />,
    })[tab]||null;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};color:${C.text};font-family:'DM Sans',sans-serif;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${C.surf};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        /* Leaflet overrides — prevent global reset from breaking map tiles */
        .leaflet-container{font-family:'DM Sans',sans-serif !important;background:#1a2c3e;}
        .leaflet-tile-container img,.leaflet-tile{margin:0 !important;padding:0 !important;border:none !important;box-shadow:none !important;max-width:none !important;}
        .leaflet-pane,.leaflet-map-pane,.leaflet-tile-pane,.leaflet-overlay-pane,.leaflet-shadow-pane,.leaflet-marker-pane,.leaflet-tooltip-pane,.leaflet-popup-pane{position:absolute !important;}
        .leaflet-control-container .leaflet-control{margin:8px !important;}
        .leaflet-control-zoom a{background:${C.surf} !important;color:${C.text} !important;border-color:${C.border} !important;}
        .leaflet-control-zoom a:hover{background:${C.surfAlt} !important;}
        .leaflet-control-attribution{background:${C.bg}bb !important;color:${C.dim} !important;font-size:10px !important;}
        .leaflet-control-attribution a{color:${C.teal} !important;}
        input,select,textarea{color-scheme:dark;}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        button:focus-visible{outline:2px solid ${C.gold};outline-offset:2px;}
      `}</style>
      {!user
        ? <Login allEmployees={employees} onLogin={login} />
        : forcePwChange
        ? <ForcePasswordChange user={user} onComplete={completePasswordChange} onLogout={logout} />
        : <div style={{ display:"flex", minHeight:"100vh" }}>
            <Sidebar user={user} tab={tab} setTab={setTab} onLogout={logout} />
            <main style={{ flex:1, padding:26, overflowY:"auto", maxHeight:"100vh" }}>
              {renderPanel()}
            </main>
          </div>
      }
      <Toast toasts={toasts} remove={remove} />
    </>
  );
}
