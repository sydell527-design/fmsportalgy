import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useUsers, useUpdateUser } from "@/hooks/use-users";
import { useTimesheets } from "@/hooks/use-timesheets";
import { EmployeeFormDialog } from "@/pages/Employees";
import { useChildren, useCreateChild, useUpdateChild, useDeleteChild } from "@/hooks/use-children";
import { useLoans, useCreateLoan, useUpdateLoan, useDeleteLoan } from "@/hooks/use-loans";
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from "@/hooks/use-schedules";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft, User, Banknote, ShieldCheck, Baby, CreditCard,
  PlusCircle, Edit2, Trash2, TrendingDown, TrendingUp,
  Clock, DollarSign, Calendar, GraduationCap, Briefcase,
  Info, Phone, Mail, MapPin, LayoutDashboard, CalendarDays, Shield, Building2, Radio,
} from "lucide-react";
import { format, differenceInYears, differenceInMonths, addYears, parseISO, isAfter, startOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType, EmployeeChild, EmployeeLoan, PayConfig, Schedule, InsertSchedule } from "@shared/schema";
import { FMS_LOCATIONS, ARMED_STATUSES, CLIENT_AGENCIES } from "@shared/schema";
import { detectShift, fmt12, SHIFT_TEMPLATES } from "@/lib/shifts";
import { PAYROLL_CONSTANTS } from "@/lib/payroll";

// ── Guyana 2026 constants (single source of truth from payroll.ts) ─────────
const GY_NIS_EMP       = PAYROLL_CONSTANTS.NIS_EMP_RATE;
const GY_NIS_EMP_MAX   = PAYROLL_CONSTANTS.NIS_CEILING_MONTHLY;
const GY_NIS_EMP_RATE  = PAYROLL_CONSTANTS.NIS_ER_RATE;
const GY_PERSONAL_ALLOW = PAYROLL_CONSTANTS.PERSONAL_ALLOWANCE;
const GY_CHILD_ALLOW   = PAYROLL_CONSTANTS.CHILD_ALLOWANCE;
const GY_TAX1_LIMIT    = PAYROLL_CONSTANTS.TAX_LOWER_LIMIT;
const GY_TAX1          = PAYROLL_CONSTANTS.TAX_LOWER_RATE;
const GY_TAX2          = PAYROLL_CONSTANTS.TAX_UPPER_RATE;
const GY_HEALTH_FULL   = PAYROLL_CONSTANTS.HEALTH_SURCHARGE_FULL;
const GY_HEALTH_HALF   = PAYROLL_CONSTANTS.HEALTH_SURCHARGE_HALF;

function today() { return format(new Date(), "yyyy-MM-dd"); }
function childAge(dob: string)       { return differenceInYears(new Date(), parseISO(dob)); }
function childAgeMonths(dob: string) { return differenceInMonths(new Date(), parseISO(dob)); }
function monthsTo18(dob: string) {
  return Math.max(0, differenceInMonths(addYears(parseISO(dob), 18), new Date()));
}
function isQualifyingChild(child: EmployeeChild) {
  if (!child.active) return false;
  if (child.taxEligible === false) return false;   // explicitly excluded from PAYE deduction
  const age = childAge(child.dob);
  if (age < 18) return true;
  if (age <= 25 && child.school) return true;
  return false;
}

function computePayroll(emp: UserType, children: EmployeeChild[]) {
  const pc: PayConfig = emp.payConfig ?? {} as PayConfig;
  const basic = emp.cat === "Time"
    ? (emp.hourlyRate ?? 0) * 160
    : (emp.salary ?? 0);
  const allowances =
    (pc.housingAllowance ?? 0) + (pc.transportAllowance ?? 0) + (pc.mealAllowance ?? 0) +
    (pc.uniformAllowance ?? 0) + (pc.riskAllowance ?? 0) + (pc.shiftAllowance ?? 0) +
    (pc.otherAllowances ?? []).reduce((s, x) => s + x.amount, 0);
  const gross = basic + allowances;
  const nisBase      = Math.min(gross, GY_NIS_EMP_MAX);
  const nisEmpCalc   = pc.nisExempt ? 0 : Math.round(nisBase * GY_NIS_EMP);
  const nisEmp       = (pc.nisEmployeeOverride != null) ? pc.nisEmployeeOverride : nisEmpCalc;
  const nisEmpRateCalc = pc.nisExempt ? 0 : Math.round(nisBase * GY_NIS_EMP_RATE);
  const nisEmployer  = (pc.nisEmployerOverride != null) ? pc.nisEmployerOverride : nisEmpRateCalc;
  const healthCalc   = pc.healthSurchargeExempt ? 0
    : pc.healthSurchargeRate === "half" ? GY_HEALTH_HALF : GY_HEALTH_FULL;
  const health       = (pc.healthSurchargeRate === "custom" && pc.healthSurchargeOverride != null)
    ? (pc.healthSurchargeExempt ? 0 : pc.healthSurchargeOverride)
    : healthCalc;
  const qualifying    = children.filter(isQualifyingChild).length;
  const childDeduct   = qualifying * GY_CHILD_ALLOW;
  const personalAllow = Math.max(GY_PERSONAL_ALLOW, Math.round(gross / 3));
  const chargeable    = pc.taxExempt ? 0
    : Math.max(0, gross - nisEmp - personalAllow - childDeduct);
  const payeCalc = pc.taxExempt ? 0
    : chargeable <= GY_TAX1_LIMIT
      ? Math.round(chargeable * GY_TAX1)
      : Math.round(GY_TAX1_LIMIT * GY_TAX1 + (chargeable - GY_TAX1_LIMIT) * GY_TAX2);
  const paye = (pc.taxOverride != null) ? (pc.taxExempt ? 0 : pc.taxOverride) : payeCalc;
  const statutory = nisEmp + health + paye;
  const voluntary = (pc.creditUnion ?? 0) + (pc.loanRepayment ?? 0) +
    (pc.advancesRecovery ?? 0) + (pc.unionDues ?? 0) +
    (pc.otherDeductions ?? []).reduce((s, x) => s + x.amount, 0);
  const net = gross - statutory - voluntary;
  return { basic, allowances, gross, nisEmp, nisEmployer, health, paye, chargeable, personalAllow, statutory, voluntary, net, qualifying, childDeduct };
}

function fmt(n: number) {
  return `GYD ${Math.round(n).toLocaleString("en-GY")}`;
}

function Bar({ value, max = 100, color = "bg-primary", label, sub }: {
  value: number; max?: number; color?: string; label?: string; sub?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      {(label || sub) && (
        <div className="flex justify-between items-baseline">
          {label && <span className="text-xs font-medium">{label}</span>}
          {sub   && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      )}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{pct}%</span>
        <span>{Math.round(value).toLocaleString()} / {Math.round(max).toLocaleString()}</span>
      </div>
    </div>
  );
}

type Tab = "overview" | "pay" | "allowances" | "deductions" | "children" | "loans" | "schedule";

const NAV: { id: Tab; label: string; Icon: any }[] = [
  { id: "overview",    label: "Overview",              Icon: LayoutDashboard },
  { id: "pay",         label: "Pay Structure",         Icon: Banknote },
  { id: "allowances",  label: "Allowances",            Icon: TrendingUp },
  { id: "deductions",  label: "Deductions",            Icon: TrendingDown },
  { id: "children",    label: "Children / Dependents", Icon: Baby },
  { id: "loans",       label: "Loans",                 Icon: CreditCard },
  { id: "schedule",    label: "My Schedule",           Icon: CalendarDays },
];

export default function EmployeeProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user: authUser } = useAuth();
  const { data: users } = useUsers();
  const { data: allTimesheets } = useTimesheets();
  const { toast } = useToast();

  const emp = users?.find((u) => u.userId === userId);

  const { data: children = [] } = useChildren(userId);
  const { data: loans     = [] } = useLoans(userId);
  const { mutateAsync: createChild, isPending: addingChild } = useCreateChild(userId);
  const { mutateAsync: updateChild } = useUpdateChild(userId);
  const { mutateAsync: deleteChild } = useDeleteChild(userId);
  const { mutateAsync: createLoan,  isPending: addingLoan  } = useCreateLoan(userId);
  const { mutateAsync: updateLoan  } = useUpdateLoan(userId);
  const { mutateAsync: deleteLoan  } = useDeleteLoan(userId);

  const { data: scheduleData = [] } = useSchedules(userId);
  const { mutateAsync: createSchedule, isPending: addingSchedule } = useCreateSchedule(userId ?? "");
  const { mutateAsync: updateSchedule } = useUpdateSchedule(userId ?? "");
  const { mutateAsync: deleteSchedule } = useDeleteSchedule(userId ?? "");

  // Call signs for this employee (matched by userId or a call sign entry where callSign === userId)
  const { data: allCallSigns = [] } = useQuery<{ id: number; callSign: string; location: string }[]>({
    queryKey: ["/api/call-signs"],
  });
  const empCallSign = allCallSigns.find((cs) => cs.callSign === userId);

  const EMPTY_SCHED: Partial<InsertSchedule> = { date: format(new Date(), "yyyy-MM-dd"), shiftStart: "06:00", shiftEnd: "14:00", location: "", armed: "Unarmed", client: "", notes: "" };
  const [schedModal, setSchedModal] = useState<Partial<InsertSchedule> & { id?: number } | null>(null);

  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [childModal, setChildModal] = useState<Partial<EmployeeChild> | null>(null);
  const [loanModal,  setLoanModal]  = useState<Partial<EmployeeLoan>  | null>(null);

  const EMPTY_CHILD = { firstName: "", lastName: "", dob: "", relationship: "biological", school: "", active: true, taxEligible: true };
  const EMPTY_LOAN  = { description: "", principal: 0, balance: 0, monthlyPayment: 0, startDate: today(), status: "active", notes: "" };

  // Employees can only view their own profile; managers/admins can view any
  const canManageSchedule = authUser?.role === "admin" || authUser?.role === "manager" || authUser?.pos === "Shift Supervisor";
  const canViewProfile    = authUser?.role === "admin" || authUser?.role === "manager" || authUser?.userId === userId;
  if (!canViewProfile) return <Redirect to="/" />;

  if (!emp) return (
    <Layout>
      <div className="text-center py-20 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Employee not found.</p>
        <Link href="/employees">
          <Button className="mt-4" variant="outline"><ChevronLeft className="w-4 h-4 mr-1" />Back to Directory</Button>
        </Link>
      </div>
    </Layout>
  );

  const pay = computePayroll(emp, children);
  const pc  = emp.payConfig ?? {} as PayConfig;
  const currentMonth = format(new Date(), "yyyy-MM");
  const monthTs = (allTimesheets ?? []).filter((t) => t.eid === userId && t.date?.startsWith(currentMonth) && t.status === "approved");
  const totalReg = monthTs.reduce((s, t) => s + (t.reg ?? 0), 0);
  const totalOt  = monthTs.reduce((s, t) => s + (t.ot  ?? 0), 0);
  const activeLoans      = loans.filter((l) => l.status === "active");
  const totalLoanBalance = activeLoans.reduce((s, l) => s + l.balance, 0);
  const qualifyingKids   = children.filter(isQualifyingChild);
  const initials         = emp.av || emp.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleSaveChild = async () => {
    if (!childModal?.firstName || !childModal?.dob) {
      toast({ title: "First name and date of birth are required", variant: "destructive" }); return;
    }
    try {
      if (childModal.id) { await updateChild({ id: childModal.id, ...childModal }); toast({ title: "Dependent updated" }); }
      else               { await createChild(childModal as any); toast({ title: "Dependent added" }); }
      setChildModal(null);
    } catch (err: any) { toast({ title: "Failed to save", description: err.message, variant: "destructive" }); }
  };

  const handleSaveSchedule = async () => {
    if (!schedModal?.date || !schedModal?.shiftStart || !schedModal?.shiftEnd) {
      toast({ title: "Date, shift start and shift end are required", variant: "destructive" }); return;
    }
    try {
      if (schedModal.id) {
        await updateSchedule({ id: schedModal.id, ...schedModal });
        toast({ title: "Schedule entry updated" });
      } else {
        await createSchedule({ ...schedModal, eid: userId ?? "", createdBy: authUser?.userId ?? "" } as any);
        toast({ title: "Schedule entry added" });
      }
      setSchedModal(null);
    } catch (err: any) { toast({ title: "Failed to save schedule", description: err.message, variant: "destructive" }); }
  };

  const handleSaveLoan = async () => {
    if (!loanModal?.description || !loanModal?.principal || !loanModal?.monthlyPayment) {
      toast({ title: "Description, amount and monthly payment are required", variant: "destructive" }); return;
    }
    try {
      if (loanModal.id) { await updateLoan({ id: loanModal.id, ...loanModal }); toast({ title: "Loan updated" }); }
      else              { await createLoan({ ...loanModal, balance: loanModal.principal } as any); toast({ title: "Loan added" }); }
      setLoanModal(null);
    } catch (err: any) { toast({ title: "Failed to save", description: err.message, variant: "destructive" }); }
  };

  return (
    <Layout>
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/employees" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Employee Directory
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{emp.name}</span>
      </div>

      {/* ── Landscape two-panel layout ─────────────────────────────────── */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT SIDEBAR ────────────────────────────────────────────── */}
        <div className="w-64 shrink-0 space-y-3">

          {/* Avatar + identity */}
          <Card className="p-5 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
              {initials}
            </div>
            <div>
              <p className="font-bold text-base leading-tight">{emp.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{emp.pos}</p>
              <p className="text-xs text-muted-foreground">{emp.dept}</p>
              <div className="flex flex-wrap gap-1 justify-center mt-2">
                <Badge variant={emp.status === "active" ? "default" : "destructive"} className="text-[10px]">{emp.status}</Badge>
                <Badge variant="outline" className="text-[10px]">{emp.cat}</Badge>
              </div>
            </div>
          </Card>

          {/* Edit button */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setEditOpen(true)}
            data-testid="button-edit-employee-profile"
          >
            <Edit2 className="w-4 h-4" /> Edit Profile
          </Button>

          {/* Quick stats */}
          <Card className="p-4 space-y-2">
            {[
              { label: "Employee ID", value: emp.userId, mono: true },
              { label: "Joined",      value: emp.joined ?? "—" },
              { label: "Pay Frequency", value: (pc.frequency === "weekly" ? "Weekly" : "Bi-monthly"), cap: false },
              { label: "Approver 1",  value: emp.fa ?? "—" },
              { label: "Approver 2",  value: emp.sa ?? "—" },
            ].map(({ label, value, mono, cap }) => (
              <div key={label} className="flex flex-col border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
                <span className={`text-xs font-medium ${mono ? "font-mono" : ""} ${cap ? "capitalize" : ""}`}>{value}</span>
              </div>
            ))}
            {/* Call Sign */}
            <div className="flex items-start gap-1.5 border-t border-border pt-2">
              <Radio className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Call Sign</div>
                <div className="text-xs font-semibold font-mono">
                  {empCallSign ? empCallSign.callSign : "—"}
                </div>
                {empCallSign?.location && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{empCallSign.location}</div>
                )}
              </div>
            </div>
            {/* Assigned Locations */}
            {emp.geo && emp.geo.length > 0 && (
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Assigned Locations</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {emp.geo.map((loc) => (
                      <span key={loc} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{loc}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {emp.email && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="w-3 h-3 shrink-0" /><span className="truncate">{emp.email}</span>
              </div>
            )}
            {emp.phone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="w-3 h-3 shrink-0" />{emp.phone}
              </div>
            )}
          </Card>

          {/* Payroll snapshot */}
          <Card className="p-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Monthly Payroll</p>
            {[
              { label: "Gross",      value: fmt(pay.gross),      color: "text-green-700" },
              { label: "Deductions", value: fmt(pay.statutory + pay.voluntary), color: "text-red-600" },
              { label: "Net Pay",    value: fmt(pay.net),        color: "text-primary font-bold" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={color}>{value}</span>
              </div>
            ))}
            {totalLoanBalance > 0 && (
              <div className="flex justify-between items-center text-xs border-t border-border pt-2 mt-1">
                <span className="text-muted-foreground">Loan Balance</span>
                <span className="text-amber-600 font-medium">{fmt(totalLoanBalance)}</span>
              </div>
            )}
          </Card>

          {/* Vertical nav */}
          <Card className="p-2 space-y-0.5">
            {NAV.map(({ id, label, Icon }) => {
              const badge =
                id === "children" && qualifyingKids.length > 0 ? qualifyingKids.length :
                id === "loans"    && activeLoans.length > 0    ? activeLoans.length    : null;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  data-testid={`nav-${id}`}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left
                    ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0" />{label}
                  </span>
                  {badge && (
                    <span className={`text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold shrink-0 ${tab === id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </Card>
        </div>

        {/* ── RIGHT CONTENT PANEL ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ══ OVERVIEW ══════════════════════════════════════════════════ */}
          {tab === "overview" && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Hours This Month</span>
                  </div>
                  <div className="space-y-3">
                    <Bar label="Regular" sub={`${totalReg.toFixed(1)}h / 160h`} value={totalReg} max={160} color="bg-blue-500" />
                    <Bar label="Overtime" sub={`${totalOt.toFixed(1)}h`} value={totalOt} max={40} color="bg-amber-500" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Pay Breakdown</span>
                  </div>
                  <div className="space-y-3">
                    <Bar label="Gross" sub={fmt(pay.gross)} value={pay.gross} max={pay.gross || 1} color="bg-green-500" />
                    <Bar label="Statutory" sub={fmt(pay.statutory)} value={pay.statutory} max={pay.gross || 1} color="bg-red-400" />
                    <Bar label="Voluntary" sub={fmt(pay.voluntary)} value={pay.voluntary} max={pay.gross || 1} color="bg-orange-400" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Deduction Ratios</span>
                  </div>
                  <div className="space-y-3">
                    <Bar label="NIS 5.6%" sub={fmt(pay.nisEmp)} value={pay.nisEmp} max={pay.gross || 1} color="bg-blue-500" />
                    <Bar label="PAYE Tax" sub={fmt(pay.paye)} value={pay.paye} max={pay.gross || 1} color="bg-purple-500" />
                    <Bar label="Health"   sub={fmt(pay.health)} value={pay.health} max={pay.gross || 1} color="bg-teal-500" />
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Employment Details</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      ["Pay Category", emp.cat],
                      ["OT Multiplier", `${pc.otMultiplier ?? 1.5}×`],
                      ["Public Holiday", `${pc.phMultiplier ?? 2.0}×`],
                      emp.cat === "Time"
                        ? ["Hourly Rate", `GYD ${emp.hourlyRate}/hr`]
                        : ["Monthly Salary", fmt(emp.salary)],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Authorized Locations</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(emp.geo ?? []).map((g) => <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>)}
                    {(emp.geo ?? []).length === 0 && <p className="text-xs text-muted-foreground italic">No locations assigned.</p>}
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* ══ PAY STRUCTURE ═════════════════════════════════════════════ */}
          {tab === "pay" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-4">Basic Compensation</h3>
                <div className="space-y-2">
                  {[
                    ["Category", emp.cat],
                    ["Frequency", pc.frequency === "weekly" ? "Weekly" : "Bi-monthly"],
                    emp.cat === "Time"
                      ? ["Hourly Rate", `GYD ${emp.hourlyRate ?? 0}/hr`]
                      : ["Monthly Salary", fmt(emp.salary)],
                    ["Est. Monthly Basic", fmt(pay.basic)],
                    ["OT Rate", `${pc.otMultiplier ?? 1.5}× hourly`],
                    ["Public Holiday", `${pc.phMultiplier ?? 2.0}× hourly`],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                      <span className="text-muted-foreground">{l}</span>
                      <span className="font-medium capitalize">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-4">Payroll Summary</h3>
                <div className="space-y-3">
                  <Bar label="Basic Pay"    sub={fmt(pay.basic)}       value={pay.basic}       max={pay.gross || 1} color="bg-blue-500" />
                  <Bar label="Allowances"   sub={fmt(pay.allowances)}  value={pay.allowances}  max={pay.gross || 1} color="bg-green-500" />
                  <Bar label="Deductions"   sub={fmt(pay.statutory + pay.voluntary)} value={pay.statutory + pay.voluntary} max={pay.gross || 1} color="bg-red-400" />
                  <div className="flex justify-between pt-2 border-t border-border text-sm font-bold">
                    <span>Net Pay</span><span className="text-primary">{fmt(pay.net)}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ══ ALLOWANCES ════════════════════════════════════════════════ */}
          {tab === "allowances" && (
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" /> Allowances Breakdown
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-4">
                  {([
                    ["Housing Allowance",    pc.housingAllowance    ?? 0],
                    ["Transport Allowance",  pc.transportAllowance  ?? 0],
                    ["Meal Allowance",       pc.mealAllowance       ?? 0],
                  ] as [string, number][]).map(([l, a]) => (
                    <Bar key={l} label={l} sub={fmt(a) + "/mo"} value={a} max={pay.allowances || 1} color="bg-green-500" />
                  ))}
                </div>
                <div className="space-y-4">
                  {([
                    ["Uniform Allowance",    pc.uniformAllowance    ?? 0],
                    ["Risk / Hazard",        pc.riskAllowance       ?? 0],
                    ["Shift Differential",   pc.shiftAllowance      ?? 0],
                  ] as [string, number][]).map(([l, a]) => (
                    <Bar key={l} label={l} sub={fmt(a) + "/mo"} value={a} max={pay.allowances || 1} color="bg-green-500" />
                  ))}
                  {(pc.otherAllowances ?? []).map((a, i) => (
                    <Bar key={i} label={a.name || `Custom ${i + 1}`} sub={fmt(a.amount) + "/mo"} value={a.amount} max={pay.allowances || 1} color="bg-teal-500" />
                  ))}
                </div>
              </div>
              {qualifyingKids.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Baby className="w-4 h-4 text-pink-600" />
                    <span className="text-sm font-semibold text-pink-700">Child Allowance (Guyana 2026)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {qualifyingKids.length} qualifying child{qualifyingKids.length !== 1 ? "ren" : ""} × GYD 10,000/mo = <strong>{fmt(pay.childDeduct)}</strong> reduction from chargeable income
                  </p>
                  <Bar label="Child Allowance Benefit" sub={fmt(pay.childDeduct) + " off taxable income"} value={pay.childDeduct} max={GY_PERSONAL_ALLOW} color="bg-pink-400" />
                </div>
              )}
              <div className="flex justify-between pt-4 mt-4 border-t-2 border-border text-sm font-bold">
                <span>Total Allowances</span><span className="text-green-700">{fmt(pay.allowances)}</span>
              </div>
            </Card>
          )}

          {/* ══ DEDUCTIONS ════════════════════════════════════════════════ */}
          {tab === "deductions" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> Statutory (Guyana 2026)
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Bar label={`NIS Employee (5.6%)${pc.nisExempt ? " — EXEMPT" : ""}`} sub={fmt(pay.nisEmp) + "/mo"} value={pay.nisEmp} max={pay.gross || 1} color="bg-blue-500" />
                    <p className="text-[10px] text-muted-foreground">Employer: {fmt(pay.nisEmployer)}/mo · Max insurable: GYD 280,000</p>
                  </div>
                  <Bar label={`Hand In Hand Insurance${pc.healthSurchargeExempt ? " — EXEMPT" : pc.healthSurchargeRate === "custom" ? " (custom)" : ` (${pc.healthSurchargeRate ?? "full"})`}`} sub={fmt(pay.health) + "/mo"} value={pay.health} max={pay.gross || 1} color="bg-teal-500" />
                  <div className="space-y-2">
                    <Bar label={`PAYE Tax${pc.taxExempt ? " — EXEMPT" : ""}`} sub={fmt(pay.paye) + "/mo"} value={pay.paye} max={pay.gross || 1} color="bg-purple-500" />
                    <p className="text-[10px] text-muted-foreground">Chargeable: {fmt(pay.chargeable)} · Personal: {fmt(pay.personalAllow)}{pay.personalAllow > GY_PERSONAL_ALLOW ? " (⅓ gross)" : ""} · Child: {fmt(pay.childDeduct)}</p>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border text-sm font-semibold">
                    <span>Total Statutory</span><span className="text-red-600">{fmt(pay.statutory)}/mo</span>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" /> Voluntary Deductions
                </h3>
                <div className="space-y-4">
                  {([
                    ["Credit Union",       pc.creditUnion      ?? 0],
                    ["Loan Repayment",     pc.loanRepayment    ?? 0],
                    ["Advances Recovery",  pc.advancesRecovery ?? 0],
                    ["Union Dues",         pc.unionDues        ?? 0],
                  ] as [string, number][]).map(([l, a]) =>
                    a > 0 && <Bar key={l} label={l} sub={fmt(a) + "/mo"} value={a} max={pay.gross || 1} color="bg-orange-400" />
                  )}
                  {(pc.otherDeductions ?? []).map((d, i) =>
                    d.amount > 0 && <Bar key={i} label={d.name || `Custom ${i + 1}`} sub={fmt(d.amount) + "/mo"} value={d.amount} max={pay.gross || 1} color="bg-orange-400" />
                  )}
                  {pay.voluntary === 0 && <p className="text-xs text-muted-foreground italic">No voluntary deductions configured.</p>}
                  {pay.voluntary > 0 && (
                    <div className="flex justify-between pt-2 border-t border-border text-sm font-semibold">
                      <span>Total Voluntary</span><span className="text-orange-600">{fmt(pay.voluntary)}/mo</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ══ CHILDREN ══════════════════════════════════════════════════ */}
          {tab === "children" && (
            <div className="space-y-4">
              <div className="rounded-md border border-pink-200 bg-pink-50 px-4 py-3 text-xs text-pink-800 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span><strong>Guyana 2026:</strong> GYD 10,000/month per qualifying child deducted from taxable income. Qualifying = under 18, or 18–25 in full-time education.</span>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{children.length} dependent{children.length !== 1 ? "s" : ""} on record</h3>
                <Button size="sm" onClick={() => setChildModal({ ...EMPTY_CHILD })} data-testid="button-add-child">
                  <PlusCircle className="w-4 h-4 mr-2" /> Add Dependent
                </Button>
              </div>

              {children.length === 0 && (
                <Card className="p-12 text-center text-muted-foreground border-2 border-dashed">
                  <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No dependents on record.</p>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {children.map((child) => {
                  const age        = childAge(child.dob);
                  const ageMonths  = childAgeMonths(child.dob);
                  const mLeft      = monthsTo18(child.dob);
                  const ageQualifies = age < 18 || (age <= 25 && !!child.school);
                  const qualifying = isQualifyingChild(child);
                  const expired    = age >= 18 && !child.school;
                  const taxExcluded = child.taxEligible === false;
                  return (
                    <Card key={child.id} className={`p-4 ${expired ? "opacity-60 border-dashed" : ""}`} data-testid={`child-card-${child.id}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-sm">{child.firstName} {child.lastName}</p>
                            {qualifying && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Qualifying</Badge>}
                            {expired    && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                            {taxExcluded && ageQualifies && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Tax excluded</Badge>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{child.relationship} · {child.dob}</p>
                          {child.school && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><GraduationCap className="w-3 h-3" />{child.school}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setChildModal({ ...child })} data-testid={`button-edit-child-${child.id}`}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={async () => { await deleteChild(child.id); toast({ title: "Dependent removed" }); }} data-testid={`button-delete-child-${child.id}`}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Age <strong>{age}y {ageMonths % 12}m</strong></span>
                          {!expired ? <span>{Math.floor(mLeft / 12)}y {mLeft % 12}m to 18</span>
                                    : <span className="text-red-500 font-medium">Over 18</span>}
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${expired ? "bg-red-400" : age >= 15 ? "bg-amber-500" : "bg-pink-400"}`}
                            style={{ width: `${Math.min(100, (ageMonths / (18 * 12)) * 100)}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Birth</span><span>Age 18</span></div>
                      </div>
                      {ageQualifies && (
                        <div className={`mt-3 text-[10px] rounded border px-2 py-1.5 text-center flex items-center justify-between ${
                          qualifying
                            ? "bg-green-50 border-green-200 text-green-800"
                            : "bg-amber-50 border-amber-200 text-amber-800"
                        }`}>
                          <span>{qualifying ? "GYD 10,000/mo tax deduction" : "No tax deduction (excluded)"}</span>
                          <button
                            type="button"
                            className="underline text-[10px] ml-2 hover:opacity-75"
                            onClick={() => updateChild({ id: child.id, taxEligible: !qualifying })}
                          >
                            {qualifying ? "Exclude" : "Include"}
                          </button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {children.length > 0 && (
                <Card className="p-4 bg-pink-50/50 border-pink-200 flex items-center justify-between">
                  <span className="text-sm font-medium">Total Child Allowance Tax Benefit</span>
                  <div className="text-right">
                    <span className="font-bold text-pink-700">{fmt(pay.childDeduct)}/mo</span>
                    <p className="text-[10px] text-muted-foreground">{qualifyingKids.length} qualifying × GYD 10,000</p>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ══ LOANS ═════════════════════════════════════════════════════ */}
          {tab === "loans" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{loans.length} loan{loans.length !== 1 ? "s" : ""} on record</h3>
                  {totalLoanBalance > 0 && <p className="text-xs text-muted-foreground">Outstanding: {fmt(totalLoanBalance)}</p>}
                </div>
                <Button size="sm" onClick={() => setLoanModal({ ...EMPTY_LOAN })} data-testid="button-add-loan">
                  <PlusCircle className="w-4 h-4 mr-2" /> Add Loan
                </Button>
              </div>

              {loans.length === 0 && (
                <Card className="p-12 text-center text-muted-foreground border-2 border-dashed">
                  <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No loans on record.</p>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {loans.map((loan) => {
                  const paid = loan.principal - loan.balance;
                  const isPaid = loan.status === "paid" || loan.balance <= 0;
                  const mRemain = loan.balance > 0 ? Math.ceil(loan.balance / loan.monthlyPayment) : 0;
                  return (
                    <Card key={loan.id} className={`p-4 ${isPaid ? "opacity-60" : ""}`} data-testid={`loan-card-${loan.id}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-sm">{loan.description}</p>
                            <Badge className={`text-[10px] capitalize ${isPaid ? "bg-green-100 text-green-700" : loan.status === "suspended" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                              {isPaid ? "Paid" : loan.status}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Started: {loan.startDate} · {fmt(loan.monthlyPayment)}/mo</p>
                          {loan.notes && <p className="text-[10px] text-muted-foreground italic">"{loan.notes}"</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setLoanModal({ ...loan })} data-testid={`button-edit-loan-${loan.id}`}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={async () => { await deleteLoan(loan.id); toast({ title: "Loan removed" }); }} data-testid={`button-delete-loan-${loan.id}`}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3 text-center text-[10px]">
                        {[["Principal", fmt(loan.principal), ""], ["Paid", fmt(paid), "text-green-600"], ["Balance", fmt(loan.balance), loan.balance > 0 ? "text-red-600" : "text-green-600"]].map(([l, v, c]) => (
                          <div key={l} className="bg-muted/40 rounded py-1.5">
                            <p className="text-muted-foreground">{l}</p>
                            <p className={`font-semibold ${c}`}>{v}</p>
                          </div>
                        ))}
                      </div>

                      <Bar label="Repayment" sub={isPaid ? "Fully paid" : `~${mRemain}mo remaining`} value={paid} max={loan.principal} color={isPaid ? "bg-green-500" : "bg-blue-500"} />

                      {!isPaid && loan.status === "active" && (
                        <Button size="sm" variant="outline" className="mt-3 w-full text-xs" onClick={async () => {
                          const nb = Math.max(0, loan.balance - loan.monthlyPayment);
                          await updateLoan({ id: loan.id, balance: nb, status: nb === 0 ? "paid" : "active" });
                          toast({ title: nb === 0 ? "Loan fully paid off!" : `Balance now ${fmt(nb)}` });
                        }} data-testid={`button-apply-payment-${loan.id}`}>
                          Apply Payment · {fmt(loan.monthlyPayment)}
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
          {/* ══ SCHEDULE ══════════════════════════════════════════════════ */}
          {tab === "schedule" && (() => {
            const today = startOfDay(new Date());
            const upcoming = scheduleData.filter((s) => isAfter(new Date(s.date), today) || s.date === format(today, "yyyy-MM-dd"));
            const past = scheduleData.filter((s) => !isAfter(new Date(s.date), today) && s.date !== format(today, "yyyy-MM-dd"));

            const SchedCard = ({ s, showActions }: { s: Schedule; showActions: boolean }) => {
              const shift = detectShift(s.shiftStart);
              return (
                <Card key={s.id} className="p-3" data-testid={`schedule-card-${s.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex flex-col items-center text-center shrink-0 w-10">
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">{format(parseISO(s.date), "MMM")}</span>
                        <span className="text-xl font-bold leading-tight">{format(parseISO(s.date), "d")}</span>
                        <span className="text-[10px] text-muted-foreground">{format(parseISO(s.date), "EEE")}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm">{fmt12(s.shiftStart)} – {fmt12(s.shiftEnd)}</span>
                          {shift && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{shift.name}</Badge>
                          )}
                          {s.armed && s.armed !== "Unarmed" && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200">{s.armed}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                          {s.location && (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.location}</span>
                          )}
                          {s.client && (
                            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{s.client}</span>
                          )}
                        </div>
                        {s.notes && <p className="text-[10px] text-muted-foreground mt-1 italic">"{s.notes}"</p>}
                      </div>
                    </div>
                    {showActions && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSchedModal({ ...s })} data-testid={`button-edit-sched-${s.id}`}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={async () => {
                          await deleteSchedule(s.id);
                          toast({ title: "Schedule entry removed" });
                        }} data-testid={`button-delete-sched-${s.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            };

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-base">My Schedule</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {scheduleData.length === 0
                        ? "No schedule has been assigned yet"
                        : `${upcoming.length} upcoming · ${past.length} past`}
                    </p>
                  </div>
                  {canManageSchedule && (
                    <Button size="sm" onClick={() => setSchedModal({ ...EMPTY_SCHED })} data-testid="button-add-schedule">
                      <PlusCircle className="w-4 h-4 mr-1.5" /> Add Shift
                    </Button>
                  )}
                </div>

                {scheduleData.length === 0 && (
                  <Card className="p-10 text-center text-muted-foreground text-sm">
                    <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-25" />
                    <p>No schedule has been assigned to this employee yet.</p>
                    {canManageSchedule && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setSchedModal({ ...EMPTY_SCHED })}>
                        <PlusCircle className="w-4 h-4 mr-1.5" /> Add First Shift
                      </Button>
                    )}
                  </Card>
                )}

                {upcoming.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming</p>
                    {upcoming.map((s) => <SchedCard key={s.id} s={s} showActions={canManageSchedule} />)}
                  </div>
                )}

                {past.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Past Shifts</p>
                    {past.slice(0, 10).map((s) => (
                      <div key={s.id} className="opacity-50">
                        <SchedCard s={s} showActions={canManageSchedule} />
                      </div>
                    ))}
                    {past.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">+{past.length - 10} more past shifts</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        </div>{/* end right panel */}
      </div>{/* end landscape flex */}

      {/* ── Schedule Modal ────────────────────────────────────────────── */}
      <Dialog open={schedModal !== null} onOpenChange={(o) => { if (!o) setSchedModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{schedModal?.id ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={schedModal?.date ?? ""}
                onChange={(e) => setSchedModal((m) => m ? { ...m, date: e.target.value } : m)}
                data-testid="input-sched-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shift Template</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value=""
                onChange={(e) => {
                  const tmpl = SHIFT_TEMPLATES.find((t) => `${t.start}|${t.end}` === e.target.value);
                  if (tmpl) setSchedModal((m) => m ? { ...m, shiftStart: tmpl.start, shiftEnd: tmpl.end } : m);
                }}
                data-testid="select-sched-template"
              >
                <option value="">— Select a template or enter manually —</option>
                {SHIFT_TEMPLATES.map((t) => (
                  <option key={t.label} value={`${t.start}|${t.end}`}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shift Start <span className="text-destructive">*</span></Label>
                <Input
                  type="time"
                  value={schedModal?.shiftStart ?? "06:00"}
                  onChange={(e) => setSchedModal((m) => m ? { ...m, shiftStart: e.target.value } : m)}
                  data-testid="input-sched-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Shift End <span className="text-destructive">*</span></Label>
                <Input
                  type="time"
                  value={schedModal?.shiftEnd ?? "14:00"}
                  onChange={(e) => setSchedModal((m) => m ? { ...m, shiftEnd: e.target.value } : m)}
                  data-testid="input-sched-end"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={schedModal?.location ?? ""}
                onChange={(e) => setSchedModal((m) => m ? { ...m, location: e.target.value } : m)}
                data-testid="select-sched-location"
              >
                <option value="">— Select location —</option>
                {FMS_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Armed Status</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={schedModal?.armed ?? "Unarmed"}
                  onChange={(e) => setSchedModal((m) => m ? { ...m, armed: e.target.value } : m)}
                  data-testid="select-sched-armed"
                >
                  {ARMED_STATUSES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Client / Agency</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={schedModal?.client ?? ""}
                  onChange={(e) => setSchedModal((m) => m ? { ...m, client: e.target.value } : m)}
                  data-testid="select-sched-client"
                >
                  <option value="">— Select client —</option>
                  {CLIENT_AGENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={schedModal?.notes ?? ""}
                onChange={(e) => setSchedModal((m) => m ? { ...m, notes: e.target.value } : m)}
                placeholder="Optional notes"
                data-testid="input-sched-notes"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setSchedModal(null)} data-testid="button-cancel-sched">Cancel</Button>
              <Button onClick={handleSaveSchedule} disabled={addingSchedule} data-testid="button-save-sched">
                {addingSchedule ? "Saving…" : "Save Shift"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Employee dialog */}
      {editOpen && (
        <EmployeeFormDialog
          user={emp}
          onClose={() => setEditOpen(false)}
          onCreated={() => setEditOpen(false)}
        />
      )}

      {/* ── Child / Dependent modal ─────────────────────────────────────── */}
      <Dialog open={childModal !== null} onOpenChange={(o) => { if (!o) setChildModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{childModal?.id ? "Edit Dependent" : "Add Dependent"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input
                  value={childModal?.firstName ?? ""}
                  onChange={(e) => setChildModal((m) => m ? { ...m, firstName: e.target.value } : m)}
                  placeholder="First name"
                  data-testid="input-child-firstname"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input
                  value={childModal?.lastName ?? ""}
                  onChange={(e) => setChildModal((m) => m ? { ...m, lastName: e.target.value } : m)}
                  placeholder="Last name"
                  data-testid="input-child-lastname"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date of Birth <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={childModal?.dob ?? ""}
                  onChange={(e) => setChildModal((m) => m ? { ...m, dob: e.target.value } : m)}
                  data-testid="input-child-dob"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <select
                  value={childModal?.relationship ?? "biological"}
                  onChange={(e) => setChildModal((m) => m ? { ...m, relationship: e.target.value } : m)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  data-testid="select-child-relationship"
                >
                  <option value="biological">Biological</option>
                  <option value="adopted">Adopted</option>
                  <option value="stepchild">Stepchild</option>
                  <option value="ward">Ward</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>School / Institution (if 18–25)</Label>
              <Input
                value={childModal?.school ?? ""}
                onChange={(e) => setChildModal((m) => m ? { ...m, school: e.target.value } : m)}
                placeholder="Leave blank if not applicable"
                data-testid="input-child-school"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="child-active"
                checked={childModal?.active ?? true}
                onChange={(e) => setChildModal((m) => m ? { ...m, active: e.target.checked } : m)}
                className="rounded border-input"
                data-testid="checkbox-child-active"
              />
              <Label htmlFor="child-active">Active (on record)</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="child-tax-eligible"
                checked={childModal?.taxEligible !== false}
                onChange={(e) => setChildModal((m) => m ? { ...m, taxEligible: e.target.checked } : m)}
                className="rounded border-input"
                data-testid="checkbox-child-tax-eligible"
              />
              <Label htmlFor="child-tax-eligible">Count for PAYE tax deduction (GYD 10,000/mo)</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setChildModal(null)} data-testid="button-cancel-child">Cancel</Button>
              <Button onClick={handleSaveChild} disabled={addingChild} data-testid="button-save-child">
                {addingChild ? "Saving…" : "Save Dependent"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Loan modal ──────────────────────────────────────────────────── */}
      <Dialog open={loanModal !== null} onOpenChange={(o) => { if (!o) setLoanModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{loanModal?.id ? "Edit Loan" : "Add Loan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Input
                value={loanModal?.description ?? ""}
                onChange={(e) => setLoanModal((m) => m ? { ...m, description: e.target.value } : m)}
                placeholder="e.g. Staff Advance, Credit Union Loan"
                data-testid="input-loan-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Principal (GYD) <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min={0}
                  value={loanModal?.principal ?? ""}
                  onChange={(e) => setLoanModal((m) => m ? { ...m, principal: Number(e.target.value) } : m)}
                  placeholder="0"
                  data-testid="input-loan-principal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Payment (GYD) <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min={0}
                  value={loanModal?.monthlyPayment ?? ""}
                  onChange={(e) => setLoanModal((m) => m ? { ...m, monthlyPayment: Number(e.target.value) } : m)}
                  placeholder="0"
                  data-testid="input-loan-monthly-payment"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={loanModal?.startDate ?? today()}
                  onChange={(e) => setLoanModal((m) => m ? { ...m, startDate: e.target.value } : m)}
                  data-testid="input-loan-start-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  value={loanModal?.status ?? "active"}
                  onChange={(e) => setLoanModal((m) => m ? { ...m, status: e.target.value } : m)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  data-testid="select-loan-status"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="paid">Paid Off</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={loanModal?.notes ?? ""}
                onChange={(e) => setLoanModal((m) => m ? { ...m, notes: e.target.value } : m)}
                placeholder="Optional notes"
                data-testid="input-loan-notes"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setLoanModal(null)} data-testid="button-cancel-loan">Cancel</Button>
              <Button onClick={handleSaveLoan} disabled={addingLoan} data-testid="button-save-loan">
                {addingLoan ? "Saving…" : "Save Loan"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
