# FMS Timetrack — Facility Management Services (Guyana)

## Overview
Role-based workforce management system with GPS geofenced attendance, three-stage electronic signature approval (Employee → Shift Supervisor → General Manager), Guyana 2026 compliant payroll, QuickBooks export, multi-tab reports, and a full changelog.

## Key Features (v1.7.0)
- GPS geofenced clock in/out — multiple shifts per day supported
- Three-stage e-signature approval chain with lock enforcement
- Shift Supervisor portal with Active Officers real-time view
- Server-side date filtering on timesheets — handles years of historical data
- Month-by-month navigation in Timesheets page (← →)
- Fully responsive layout: desktop sidebar, tablet/phone bottom navigation bar + hamburger menu
- Changelog page at `/changelog` (admin only)
- Payroll engine: NIS 5.6%/8.4%, PAYE 28%, GYD 100k allowance, 1.5× OT, QuickBooks CSV export
- Admin bulk timesheet upload via Excel/CSV (flexible column mapping, preview with employee match status)
- Admin delete individual timesheets from General Timesheet tab (with confirmation)

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

## Key Features

### Time Tracking
- GPS geofence clock in/out (Haversine distance, 7 zones)
- Auto-calculates regular + overtime hours on clock out
- 30-min break deducted, OT = hours > 8/day

### Dual-Signature Approval Workflow
Status flow: `pending_employee` → `pending_first_approval` → `pending_second_approval` → `approved`
- Employee self-signs (typed name + timestamp)
- 1st approver: matched by `emp.fa === user.pos`
- 2nd approver: matched by `emp.sa === user.pos`
- Employees can raise disputes with claimed times before submitting

### Payroll Engine (`client/src/lib/payroll.ts`)
Guyana 2026 compliant:
- **Time employees**: `hourlyRate × reg + hourlyRate × ot × 1.5`
- **Fixed/Executive**: Monthly salary + optional OT = `salary ÷ 176 × ot × 1.5`
- **Employee NIS**: 5.6% (capped at GYD 280k/month)
- **Employer NIS**: 8.4%
- **Personal Allowance**: GYD 100,000/month
- **PAYE**: 28% on `(gross - NIS - allowance)`
- QuickBooks CSV export

### Pages
| Route | Roles | Description |
|-------|-------|-------------|
| `/` | All | Dashboard with role-specific stats + approval queue |
| `/timesheets` | All | Full approval workflow, dispute flow, audit chain |
| `/requests` | All | Leave/OT/Shift Swap/Payroll Dispute requests |
| `/payroll` | Manager/Admin | Payroll table + payslips + QuickBooks export |
| `/reports` | Manager/Admin | Time summary, attendance, OT, payroll, audit trail |
| `/employees` | Admin | Employee directory, create/edit, credential modal |
| `/settings` | All | Profile, password change; Admin: payroll rules + geofences |

### Geofences (hardcoded, 7 zones)
HEAD OFFICE, CARICOM, EU, UN, DMC, ARU, CANTEEN — each has GPS coordinates and radius

## Seeded Employees
1. Marcus Webb (1001) — Security Officer, Time, GYD 1800/hr
2. Priya Sharma (1002) — Office Clerk, Fixed, GYD 185k/mo
3. Devon Charles (1003) — Warehouse Supervisor, Fixed, GYD 220k/mo
4. Jordan Baptiste (1004) — Security Officer, Time, GYD 1800/hr
5. Troy Mason (1005) — Shift Supervisor, Fixed, GYD 250k/mo
6. Sandra Ali (MGR001) — Operations Manager, Executive, GYD 380k/mo
7. Shemar Ferguson (ADMIN001) — Junior General Manager, Executive, GYD 520k/mo

## Approval Chain Example
- Security Officers → Shift Supervisor (Troy Mason, pos="Shift Supervisor") → Junior General Manager (Shemar Ferguson)
- Office/Logistics → Operations Manager (Sandra Ali) → Junior General Manager

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
