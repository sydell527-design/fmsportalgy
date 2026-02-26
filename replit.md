# FMS Timetrack — Facility Management Services (Guyana)

## Overview
Role-based workforce management system with GPS geofenced attendance, three-stage electronic signature approval (Employee → Shift Supervisor → General Manager), Guyana 2026 compliant payroll, QuickBooks export, multi-tab reports, and a full changelog.

## Architecture
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: localStorage-based session persistence (key: `fms:session`)
- **Routing**: wouter (client-side)
- **State/Queries**: TanStack Query v5
- **Shared types**: `shared/schema.ts` + `shared/routes.ts`

## Default Credentials
| Role | Username | Password |
|------|----------|----------|
| Admin | `ADMIN001` | `admin123` |
| Manager | `MGR001` | `manager123` |
| Employee | `1001`–`1005` | `temp` (force change on first login) |

## User Roles
- **Employee**: Clock in/out (GPS), view own timesheets, sign/dispute timesheets, submit requests
- **Manager**: All employee access + approve/reject timesheets (position-matched), view Payroll & Reports
- **Admin**: Full access — employee management, payroll, reports, geofence/payroll config

## Pay Frequencies (only two options)
| | Bi-monthly (default) | Weekly |
|---|---|---|
| Periods/month | 2 | 4.333 (52÷12) |
| Hours/period | 86.67 | 40 |
| Period label | /bi-mo | /wk |
| NIS ceiling/period | GYD 140,000 | GYD 64,615 |
| Personal allowance/period | GYD 70,000 | GYD 32,308 |
| Health surcharge full | GYD 600 | GYD 277 |
| PAYE 25% bracket up to | GYD 140,000 | GYD 64,615 |

**Stored internally**: salary always as monthly amount; period gross = monthly ÷ ppm

## Payroll Engine (`client/src/lib/payroll.ts`)
GRA 2026 compliant — all figures prorated to pay period:
- **Time employees**: `hourlyRate × reg + hourlyRate × 1.5 × ot`
- **Fixed/Executive**: `monthlySalary ÷ ppm` per period + optional OT
- **NIS employee**: 5.6% of period gross (ceiling = NIS_ANNUAL_CAP ÷ 12 ÷ ppm × 12 ... prorated)
- **NIS employer**: 8.4%
- **Personal Allowance**: GYD 140k/mo or ⅓ gross (whichever greater), prorated
- **PAYE**: 25% up to GYD 280k/mo chargeable, 35% above — all prorated
- **Health Surcharge**: GYD 1,200/mo full, GYD 600/mo reduced — prorated
- **Child Allowance**: GYD 10k/child/mo (qualifying children ≤ 18 or studying)
- QuickBooks CSV export
- All statutory fields editable with auto-calculated defaults and override hints
- Null safety: always `pc ?? { ...DEFAULT_PAY_CONFIG }` pattern

## Seeded Employees
1. Marcus Webb (1001) — Security Officer, Time, GYD 1800/hr
2. Priya Sharma (1002) — Office Clerk, Fixed, GYD 185k/mo
3. Devon Charles (1003) — Warehouse Supervisor, Fixed, GYD 220k/mo
4. Jordan Baptiste (1004) — Security Officer, Time, GYD 1800/hr
5. Troy Mason (1005) — Shift Supervisor, Fixed, GYD 250k/mo
6. Sandra Ali (MGR001) — Operations Manager, Executive, GYD 380k/mo
7. Shemar Ferguson (ADMIN001) — Junior General Manager, Executive, GYD 520k/mo

## Pages
| Route | Roles | Description |
|-------|-------|-------------|
| `/` | All | Dashboard with role-specific stats + approval queue |
| `/timesheets` | All | Full approval workflow, dispute flow, audit chain |
| `/requests` | All | Leave/OT/Shift Swap/Payroll Dispute requests |
| `/payroll` | Manager/Admin | Payroll table + payslips + QuickBooks export |
| `/reports` | Manager/Admin | Time summary, attendance, OT, payroll, audit trail |
| `/employees` | Admin | Employee directory, create/edit, credential modal |
| `/settings` | All | Profile, password change; Admin: payroll rules + geofences |

## Approval Chain
Status flow: `pending_employee` → `pending_first_approval` → `pending_second_approval` → `approved`
- Employee self-signs (typed name + timestamp)
- 1st approver: matched by `emp.fa === user.pos`
- 2nd approver: matched by `emp.sa === user.pos`
- Employees can raise disputes with claimed times before submitting

## Geofences (7 zones in DB)
HEAD OFFICE, CARICOM, EU, UN, DMC, ARU, CANTEEN — each has GPS coordinates and radius

## File Structure
```
client/src/
  pages/         Dashboard, Timesheets, Requests, Payroll, Reports, Employees, Settings, Login
  components/    Layout, ClockInOut, ForcePasswordChange
  hooks/         use-auth, use-timesheets, use-requests, use-users
  lib/           payroll.ts, queryClient.ts
shared/
  schema.ts      Drizzle schema + Zod types
  routes.ts      API contract + type re-exports
server/
  routes.ts      Express routes + seed data
  storage.ts     PostgreSQL storage layer
  index.ts       Entry point
```

---

## Change Log

### 2026-02-26 — Clock-in full automation from FMS formula doc
- **Armed/Unarmed toggle buttons** — two clearly styled buttons (blue = Unarmed, red = Armed) on every clock-in; value saved to `timesheets.armed`
- **Day Status dropdown** — On Day / Off Day / Sick / Absent / Holiday / Annual Leave; saved to `timesheets.dayStatus`
- **Holiday Type dropdown** — appears only when Day Status = Holiday; Phagwah / Good Friday / Easter Monday / Labour Day / Christmas / Eid ul Azha / Holiday Double; saved to `timesheets.holidayType`
- **Client / Agency dropdown** — auto-filled from selected zone (CARICOM → Caricom, HEAD OFFICE → Head Office, etc.) but editable; saved to `timesheets.client`; used for meal eligibility (no meals at Canteen/Head Office)
- **Auto time-out preview** — shown before clock-in based on current time + employee category (TIME = 6 AM morning start; FIXED/EXECUTIVE = 5 AM morning start) per formula doc shift mapping
- **Live clock-out preview** — while clocked in shows real-time "If clocked out now: X.Xh reg · Y.Yh OT · 1 meal"
- **Hours split at clock-out** — Off Day: all→OT; PH holidays (Phagwah/Good Friday/Easter Monday/Labour Day/Christmas/Eid ul Azha): all→ph; Holiday Double: all→OT; On Day: >8h→OT
- **Meal auto-calculation at clock-out** — 1 meal if qualifying shift (TIME: 6-7 AM / 2-3 PM / 6-7 PM / 10-11 PM; FIXED/EXEC: 5-7 AM / 2-3 PM / 6-7 PM); 0 if client = Canteen or Head Office
- **30-min break deducted** automatically from total worked time at clock-out
- `splitHours()` and `calcMeals()` are pure utility functions (easy to unit-test)
- `calcAutoTimeOut()` implements the full FMS Excel formula (TIME vs FIXED/EXECUTIVE morning start difference)

### 2026-02-26 — Bi-monthly hours corrected to 80; calculator divisor fixed
- **Change**: Bi-monthly pay period = **80 hrs** (2 weeks × 40 hrs/wk); monthly = 160 hrs.
- `payroll.ts` `WORKING_HOURS_PER_MONTH` 173.33 → **160**; `FREQ_HRS.bimonthly` 86.67 → **80**
- Salary calculator for Time employees: divisor = **80** (bi-monthly hours). Formula: bi-monthly amount ÷ 80 = hourly rate. Example: GYD 75,000 ÷ 80 = **937.5/hr** ✓
- Label shows "bi-monthly (80 hrs)" with "bi-mo" suffix; preview hint shows correct /hr result
- `EmployeeProfile.tsx`: Time monthly basic `hourlyRate × 160`; hours bar max = 160
- Fixed/Executive OT hourly equivalent: `monthlySalary / 160`

### 2026-02-26 — Hourly rate calculator divisor fix
- **Bug**: For bi-monthly Time employees, the "Calculate from salary" helper divided the entered amount by **86.67** (bi-monthly hours) instead of **173.33** (monthly hours). Anyone entering the known monthly salary (e.g. GYD 311,994/mo) got back double the correct hourly rate (GYD 3,600/hr instead of GYD 1,800/hr).
- **Fix**: Changed the bi-monthly calculator to accept **monthly salary** as input and divide by **173.33 hours/month** (WORKING_HOURS_PER_MONTH). Label changed from "bi-monthly salary" → "monthly salary", unit suffix changed from "bi-mo" → "mo", placeholder updated. Weekly frequency unchanged (still weekly ÷ 40 = hourly rate).
- File: `client/src/pages/Employees.tsx` — salary calculator onChange and preview label (lines 824–849)

### 2026-02-26 — Hourly rate stale closure fix
- **Bug**: Typing directly into the Hourly Rate field in Add/Edit Employee dialog had no effect (or partially lost other edits). Root cause: all `setFormData({ ...formData, field: value })` calls captured a stale snapshot of `formData` from the render closure. Any `setPc()` update that ran between renders (frequency change, exemption toggle, etc.) used functional form and updated state correctly, but the next `{ ...formData, ... }` call spread the OLD snapshot, clobbering the payConfig update and making the field appear frozen.
- **Fix**: Converted every `setFormData({ ...formData, ... })` in `Employees.tsx` to `setFormData((prev) => ({ ...prev, ... }))` functional form — Employee ID, Role, Department, Position, Phone, Email, Join Date, Status, 1st/2nd Sign-off, Mobility, Pay Category, and Hourly Rate inputs.
- Also converted hourly rate to capture `e.target.value` before the setter: `const v = Number(e.target.value); setFormData((prev) => ({ ...prev, hourlyRate: v }))`.

### 2026-02-26 — Pay frequency reduced to two options only
- Removed all options except **Bi-monthly** (2×/month, 86.67 hrs, default) and **Weekly** (52/12 per month, 40 hrs)
- All GRA thresholds (NIS ceiling, personal allowance, PAYE brackets, health surcharge) prorated per pay period using PAYROLL_CONSTANTS from `payroll.ts` as single source of truth
- Updated `FREQ_PPM`, `FREQ_HRS`, `FREQ_LABEL` tables in Employees.tsx, EmployeeProfile.tsx, Payroll.tsx
- Default changed to `"bimonthly"` everywhere
- Display labels changed from raw enum values to "Bi-monthly" / "Weekly" in profile cards

### 2026-02-26 — Deductions & Compliance tab improvements
- Statutory deduction amounts (NIS, PAYE, health surcharge) hidden until salary/rate entered; shows "Set salary on Pay tab to preview" hint
- All statutory amounts made editable with auto-calculated defaults and "Auto: GYD X — reset" override hints
- Health surcharge now has Full/Reduced/Custom radio options
- Override fields added to PayConfig schema: `nisEmployeeOverride`, `nisEmployerOverride`, `taxOverride`, `healthSurchargeOverride`, `healthSurchargeRate: "custom"`
- Added null safety guards throughout (`pc ?? DEFAULT_PAY_CONFIG` fallback)
