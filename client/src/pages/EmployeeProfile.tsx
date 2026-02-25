import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useUsers, useUpdateUser } from "@/hooks/use-users";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useChildren, useCreateChild, useUpdateChild, useDeleteChild } from "@/hooks/use-children";
import { useLoans, useCreateLoan, useUpdateLoan, useDeleteLoan } from "@/hooks/use-loans";
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
  PlusCircle, Edit2, Trash2, AlertTriangle, CheckCircle2,
  TrendingDown, TrendingUp, Clock, DollarSign, Calendar,
  GraduationCap, Briefcase, Info, Phone, Mail, MapPin,
} from "lucide-react";
import { format, differenceInYears, differenceInMonths, addYears, parseISO, isBefore } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType, EmployeeChild, EmployeeLoan, PayConfig } from "@shared/schema";

// ── Guyana 2026 Payroll ────────────────────────────────────────────────────
const GY_NIS_EMP = 0.056;
const GY_NIS_EMP_MAX = 280_000;
const GY_NIS_EMP_RATE = 0.084;
const GY_PERSONAL_ALLOW = 100_000;
const GY_CHILD_ALLOW = 10_000;
const GY_TAX1_LIMIT = 200_000;
const GY_TAX1 = 0.28;
const GY_TAX2 = 0.40;
const GY_HEALTH_FULL = 1_200;
const GY_HEALTH_HALF = 600;

function today() { return format(new Date(), "yyyy-MM-dd"); }
function childAge(dob: string) { return differenceInYears(new Date(), parseISO(dob)); }
function childAgeMonths(dob: string) { return differenceInMonths(new Date(), parseISO(dob)); }
function monthsTo18(dob: string) {
  const eighteenth = addYears(parseISO(dob), 18);
  return Math.max(0, differenceInMonths(eighteenth, new Date()));
}
function isQualifyingChild(child: EmployeeChild) {
  if (!child.active) return false;
  const age = childAge(child.dob);
  if (age < 18) return true;
  if (age <= 25 && child.school) return true;
  return false;
}

function computePayroll(emp: UserType, children: EmployeeChild[]) {
  const pc: PayConfig = emp.payConfig ?? {} as PayConfig;
  const basic = emp.cat === "Time"
    ? (emp.hourlyRate ?? 0) * 173.33
    : (emp.salary ?? 0);
  const allowances =
    (pc.housingAllowance ?? 0) + (pc.transportAllowance ?? 0) + (pc.mealAllowance ?? 0) +
    (pc.uniformAllowance ?? 0) + (pc.riskAllowance ?? 0) + (pc.shiftAllowance ?? 0) +
    (pc.otherAllowances ?? []).reduce((s, x) => s + x.amount, 0);
  const gross = basic + allowances;
  const nisBase = Math.min(gross, GY_NIS_EMP_MAX);
  const nisEmp = pc.nisExempt ? 0 : Math.round(nisBase * GY_NIS_EMP);
  const nisEmployer = pc.nisExempt ? 0 : Math.round(nisBase * GY_NIS_EMP_RATE);
  const health = pc.healthSurchargeExempt ? 0
    : pc.healthSurchargeRate === "half" ? GY_HEALTH_HALF : GY_HEALTH_FULL;
  const qualifyingChildren = children.filter(isQualifyingChild).length;
  const childAllowDeduction = qualifyingChildren * GY_CHILD_ALLOW;
  const chargeable = pc.taxExempt ? 0
    : Math.max(0, gross - nisEmp - GY_PERSONAL_ALLOW - childAllowDeduction);
  const paye = pc.taxExempt ? 0
    : chargeable <= GY_TAX1_LIMIT
      ? Math.round(chargeable * GY_TAX1)
      : Math.round(GY_TAX1_LIMIT * GY_TAX1 + (chargeable - GY_TAX1_LIMIT) * GY_TAX2);
  const statutory = nisEmp + health + paye;
  const voluntary = (pc.creditUnion ?? 0) + (pc.loanRepayment ?? 0) +
    (pc.advancesRecovery ?? 0) + (pc.unionDues ?? 0) +
    (pc.otherDeductions ?? []).reduce((s, x) => s + x.amount, 0);
  const net = gross - statutory - voluntary;
  return { basic, allowances, gross, nisEmp, nisEmployer, health, paye, chargeable, statutory, voluntary, net, qualifyingChildren, childAllowDeduction };
}

function fmt(n: number) {
  return `GYD ${Math.round(n).toLocaleString("en-GY")}`;
}

function ProgressBar({ value, max = 100, color = "bg-primary", label, sublabel, danger }: {
  value: number; max?: number; color?: string; label?: string; sublabel?: string; danger?: boolean;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="space-y-1">
      {(label || sublabel) && (
        <div className="flex justify-between items-baseline">
          {label && <span className="text-xs font-medium text-foreground">{label}</span>}
          {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
        </div>
      )}
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${danger && pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{pct}%</span>
        <span>{Math.round(value).toLocaleString()} / {Math.round(max).toLocaleString()}</span>
      </div>
    </div>
  );
}

const TAB_STYLE = (active: boolean) =>
  `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
    active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
  }`;

export default function EmployeeProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user: authUser } = useAuth();
  const { data: users } = useUsers();
  const { data: allTimesheets } = useTimesheets();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { toast } = useToast();

  const emp = users?.find((u) => u.userId === userId);

  const { data: children = [] } = useChildren(userId);
  const { data: loans = [] } = useLoans(userId);
  const { mutateAsync: createChild, isPending: addingChild } = useCreateChild(userId);
  const { mutateAsync: updateChild } = useUpdateChild(userId);
  const { mutateAsync: deleteChild } = useDeleteChild(userId);
  const { mutateAsync: createLoan, isPending: addingLoan } = useCreateLoan(userId);
  const { mutateAsync: updateLoan } = useUpdateLoan(userId);
  const { mutateAsync: deleteLoan } = useDeleteLoan(userId);

  const [tab, setTab] = useState<"overview" | "pay" | "allowances" | "deductions" | "children" | "loans">("overview");
  const [childModal, setChildModal] = useState<Partial<EmployeeChild> | null>(null);
  const [loanModal, setLoanModal] = useState<Partial<EmployeeLoan> | null>(null);

  const EMPTY_CHILD = { firstName: "", lastName: "", dob: "", relationship: "biological", school: "", active: true };
  const EMPTY_LOAN = { description: "", principal: 0, balance: 0, monthlyPayment: 0, startDate: today(), status: "active", notes: "" };

  if (authUser?.role !== "admin" && authUser?.role !== "manager") return <Redirect to="/" />;
  if (!emp) return (
    <Layout>
      <div className="text-center py-20 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Employee not found</p>
        <Link href="/employees"><Button className="mt-4" variant="outline"><ChevronLeft className="w-4 h-4 mr-1" />Back to Directory</Button></Link>
      </div>
    </Layout>
  );

  const pay = computePayroll(emp, children);
  const pc = emp.payConfig ?? {} as PayConfig;
  const myTs = (allTimesheets ?? []).filter((t) => t.eid === userId);
  const currentMonth = format(new Date(), "yyyy-MM");
  const monthTs = myTs.filter((t) => t.date?.startsWith(currentMonth));
  const approvedMonthTs = monthTs.filter((t) => t.status === "approved");
  const totalRegHours = approvedMonthTs.reduce((s, t) => s + (t.reg ?? 0), 0);
  const totalOtHours = approvedMonthTs.reduce((s, t) => s + (t.ot ?? 0), 0);
  const activeLoans = loans.filter((l) => l.status === "active");
  const totalLoanBalance = activeLoans.reduce((s, l) => s + l.balance, 0);
  const qualifyingChildren = children.filter(isQualifyingChild);

  const handleSaveChild = async () => {
    if (!childModal?.firstName || !childModal?.dob) {
      toast({ title: "First name and date of birth are required", variant: "destructive" }); return;
    }
    try {
      if (childModal.id) {
        await updateChild({ id: childModal.id, ...childModal });
        toast({ title: "Dependent updated" });
      } else {
        await createChild(childModal as any);
        toast({ title: "Dependent added" });
      }
      setChildModal(null);
    } catch (err: any) { toast({ title: "Failed to save", description: err.message, variant: "destructive" }); }
  };

  const handleSaveLoan = async () => {
    if (!loanModal?.description || !loanModal?.principal || !loanModal?.monthlyPayment) {
      toast({ title: "Description, amount and monthly payment are required", variant: "destructive" }); return;
    }
    try {
      if (loanModal.id) {
        await updateLoan({ id: loanModal.id, ...loanModal });
        toast({ title: "Loan updated" });
      } else {
        const newLoan = { ...loanModal, balance: loanModal.principal };
        await createLoan(newLoan as any);
        toast({ title: "Loan added" });
      }
      setLoanModal(null);
    } catch (err: any) { toast({ title: "Failed to save", description: err.message, variant: "destructive" }); }
  };

  const initials = emp.av || emp.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Layout>
      <div className="space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/employees" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Employee Directory
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{emp.name}</span>
        </div>

        {/* Profile Header */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-bold">{emp.name}</h1>
                <Badge variant={emp.status === "active" ? "default" : "destructive"} className="text-xs">{emp.status}</Badge>
                <Badge variant="outline" className="text-xs">{emp.cat}</Badge>
                {qualifyingChildren.length > 0 && (
                  <Badge className="text-xs bg-pink-100 text-pink-700 border-pink-200">
                    <Baby className="w-3 h-3 mr-1" />{qualifyingChildren.length} qualifying child{qualifyingChildren.length !== 1 ? "ren" : ""}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{emp.pos} · {emp.dept}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span className="font-mono">ID: {emp.userId}</span>
                {emp.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{emp.email}</span>}
                {emp.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{emp.phone}</span>}
                {emp.joined && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Joined {emp.joined}</span>}
              </div>
            </div>
            {/* Quick payroll summary */}
            <div className="flex gap-4 sm:gap-6 shrink-0">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Gross / mo</p>
                <p className="font-bold text-sm text-green-700">{fmt(pay.gross)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Net / mo</p>
                <p className="font-bold text-sm text-primary">{fmt(pay.net)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Loan Balance</p>
                <p className="font-bold text-sm text-amber-600">{fmt(totalLoanBalance)}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {([
            ["overview", "Overview", User],
            ["pay", "Pay Structure", Banknote],
            ["allowances", "Allowances", TrendingUp],
            ["deductions", "Deductions", TrendingDown],
            ["children", "Children / Dependents", Baby],
            ["loans", "Loans", CreditCard],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={TAB_STYLE(tab === id)} data-testid={`tab-profile-${id}`}>
              <Icon className="w-4 h-4" /> {label}
              {id === "children" && qualifyingChildren.length > 0 && (
                <span className="ml-1 bg-pink-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{qualifyingChildren.length}</span>
              )}
              {id === "loans" && activeLoans.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{activeLoans.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ══ TAB: OVERVIEW ══════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* MTD Hours */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Hours This Month</h3>
              </div>
              <div className="space-y-3">
                <ProgressBar label="Regular Hours" sublabel={`${totalRegHours.toFixed(1)}h / 173.3h`} value={totalRegHours} max={173.33} color="bg-blue-500" />
                <ProgressBar label="Overtime Hours" sublabel={`${totalOtHours.toFixed(1)}h`} value={totalOtHours} max={40} color="bg-amber-500" />
              </div>
            </Card>

            {/* Payroll summary */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Monthly Pay Breakdown</h3>
              </div>
              <div className="space-y-3">
                <ProgressBar label="Gross Earnings" sublabel={fmt(pay.gross)} value={pay.gross} max={pay.gross} color="bg-green-500" />
                <ProgressBar label="Statutory Deductions" sublabel={fmt(pay.statutory)} value={pay.statutory} max={pay.gross} color="bg-red-400" />
                <ProgressBar label="Voluntary Deductions" sublabel={fmt(pay.voluntary)} value={pay.voluntary} max={pay.gross} color="bg-orange-400" />
                <div className="flex justify-between items-center pt-1 border-t border-border font-semibold text-sm">
                  <span>Estimated Net</span>
                  <span className="text-primary">{fmt(pay.net)}</span>
                </div>
              </div>
            </Card>

            {/* Deductions ratio */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Deduction Ratios</h3>
              </div>
              <div className="space-y-3">
                {pay.gross > 0 && <>
                  <ProgressBar label="NIS (5.6%)" sublabel={fmt(pay.nisEmp)} value={pay.nisEmp} max={pay.gross} color="bg-blue-500" />
                  <ProgressBar label="PAYE Tax" sublabel={fmt(pay.paye)} value={pay.paye} max={pay.gross} color="bg-purple-500" />
                  <ProgressBar label="Health Surcharge" sublabel={fmt(pay.health)} value={pay.health} max={pay.gross} color="bg-teal-500" />
                  {pay.voluntary > 0 && <ProgressBar label="Voluntary" sublabel={fmt(pay.voluntary)} value={pay.voluntary} max={pay.gross} color="bg-orange-400" />}
                </>}
                {pay.gross === 0 && <p className="text-xs text-muted-foreground italic">No basic pay configured.</p>}
              </div>
            </Card>

            {/* Employment details */}
            <Card className="p-5 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Employment Details</h3>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ["Pay Category", emp.cat],
                  ["Pay Frequency", pc.frequency ?? "monthly"],
                  ["OT Multiplier", `${pc.otMultiplier ?? 1.5}×`],
                  ["Public Holiday", `${pc.phMultiplier ?? 2.0}×`],
                  ["1st Approver", emp.fa ?? "—"],
                  ["2nd Approver", emp.sa ?? "—"],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-2 py-1 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-medium capitalize">{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Authorized locations */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Authorized Locations</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {(emp.geo ?? []).map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                ))}
                {(emp.geo ?? []).length === 0 && <p className="text-xs text-muted-foreground italic">No locations assigned.</p>}
              </div>
            </Card>
          </div>
        )}

        {/* ══ TAB: PAY STRUCTURE ═════════════════════════════════════════════ */}
        {tab === "pay" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4">Basic Compensation</h3>
              <div className="space-y-2 text-sm">
                {[
                  ["Pay Category", emp.cat],
                  ["Pay Frequency", pc.frequency ?? "monthly"],
                  emp.cat === "Time"
                    ? ["Hourly Rate", fmt(emp.hourlyRate)]
                    : ["Monthly Salary", fmt(emp.salary)],
                  ["Monthly Basic (est.)", fmt(pay.basic)],
                  ["OT Rate", `${pc.otMultiplier ?? 1.5}× hourly`],
                  ["Public Holiday Rate", `${pc.phMultiplier ?? 2.0}× hourly`],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-medium capitalize">{v}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4">Payroll Summary</h3>
              <div className="space-y-3">
                <ProgressBar label="Basic Pay" sublabel={fmt(pay.basic)} value={pay.basic} max={pay.gross || 1} color="bg-blue-500" />
                <ProgressBar label="Allowances" sublabel={fmt(pay.allowances)} value={pay.allowances} max={pay.gross || 1} color="bg-green-500" />
                <ProgressBar label="Total Deductions" sublabel={fmt(pay.statutory + pay.voluntary)} value={pay.statutory + pay.voluntary} max={pay.gross || 1} color="bg-red-400" />
                <div className="flex justify-between pt-2 border-t border-border text-sm font-bold">
                  <span>Net Pay</span>
                  <span className="text-primary">{fmt(pay.net)}</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ══ TAB: ALLOWANCES ════════════════════════════════════════════════ */}
        {tab === "allowances" && (
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" /> Allowances Breakdown
              </h3>
              <div className="space-y-4">
                {([
                  ["Housing Allowance", pc.housingAllowance ?? 0],
                  ["Transport Allowance", pc.transportAllowance ?? 0],
                  ["Meal Allowance", pc.mealAllowance ?? 0],
                  ["Uniform Allowance", pc.uniformAllowance ?? 0],
                  ["Risk / Hazard Allowance", pc.riskAllowance ?? 0],
                  ["Shift Differential", pc.shiftAllowance ?? 0],
                ] as [string, number][]).map(([label, amount]) => (
                  <ProgressBar key={label} label={label} sublabel={fmt(amount) + "/mo"} value={amount} max={pay.allowances || 1} color="bg-green-500" />
                ))}
                {(pc.otherAllowances ?? []).map((a, i) => (
                  <ProgressBar key={i} label={a.name || `Custom ${i + 1}`} sublabel={fmt(a.amount) + "/mo"} value={a.amount} max={pay.allowances || 1} color="bg-teal-500" />
                ))}
                {/* Child Allowance Tax Benefit */}
                {qualifyingChildren.length > 0 && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <Baby className="w-4 h-4 text-pink-600" />
                      <span className="text-sm font-medium text-pink-700">Child Allowance Tax Deduction (Guyana 2026)</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {qualifyingChildren.length} qualifying child{qualifyingChildren.length !== 1 ? "ren" : ""} × GYD 10,000/mo = <strong>{fmt(pay.childAllowDeduction)}</strong> reduction in chargeable income
                    </p>
                    <ProgressBar label="Child Allowance Benefit" sublabel={fmt(pay.childAllowDeduction) + " off taxable income"} value={pay.childAllowDeduction} max={GY_PERSONAL_ALLOW} color="bg-pink-400" />
                  </div>
                )}
              </div>
              <div className="flex justify-between pt-3 mt-3 border-t-2 border-border text-sm font-bold">
                <span>Total Allowances</span>
                <span className="text-green-700">{fmt(pay.allowances)}</span>
              </div>
            </Card>
          </div>
        )}

        {/* ══ TAB: DEDUCTIONS ════════════════════════════════════════════════ */}
        {tab === "deductions" && (
          <div className="space-y-4">
            {/* Statutory */}
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" /> Statutory Deductions (Guyana 2026)
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <ProgressBar label={`NIS Employee (5.6%)${pc.nisExempt ? " — EXEMPT" : ""}`} sublabel={fmt(pay.nisEmp) + "/mo"} value={pay.nisEmp} max={pay.gross || 1} color="bg-blue-500" />
                  <p className="text-xs text-muted-foreground pl-1">Employer also contributes {fmt(pay.nisEmployer)}/mo · Max insurable: GYD 280,000/mo</p>
                </div>
                <div className="space-y-2">
                  <ProgressBar label={`Health Surcharge${pc.healthSurchargeExempt ? " — EXEMPT" : ` (${pc.healthSurchargeRate ?? "full"})`}`} sublabel={fmt(pay.health) + "/mo"} value={pay.health} max={pay.gross || 1} color="bg-teal-500" />
                </div>
                <div className="space-y-2">
                  <ProgressBar label={`PAYE Income Tax${pc.taxExempt ? " — EXEMPT" : ""}`} sublabel={fmt(pay.paye) + "/mo"} value={pay.paye} max={pay.gross || 1} color="bg-purple-500" />
                  <p className="text-xs text-muted-foreground pl-1">
                    Chargeable income: {fmt(pay.chargeable)}/mo · Personal allowance: GYD 100,000 · Child allowance: {fmt(pay.childAllowDeduction)}
                  </p>
                </div>
                <div className="flex justify-between pt-2 border-t border-border text-sm font-semibold">
                  <span>Total Statutory</span>
                  <span className="text-red-600">{fmt(pay.statutory)}/mo</span>
                </div>
              </div>
            </Card>

            {/* Voluntary */}
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" /> Voluntary Deductions
              </h3>
              <div className="space-y-3">
                {([
                  ["Credit Union", pc.creditUnion ?? 0],
                  ["Loan Repayment", pc.loanRepayment ?? 0],
                  ["Advances Recovery", pc.advancesRecovery ?? 0],
                  ["Union Dues", pc.unionDues ?? 0],
                ] as [string, number][]).map(([label, amount]) => (
                  amount > 0 && <ProgressBar key={label} label={label} sublabel={fmt(amount) + "/mo"} value={amount} max={pay.gross || 1} color="bg-orange-400" />
                ))}
                {(pc.otherDeductions ?? []).map((d, i) => (
                  d.amount > 0 && <ProgressBar key={i} label={d.name || `Custom ${i + 1}`} sublabel={fmt(d.amount) + "/mo"} value={d.amount} max={pay.gross || 1} color="bg-orange-400" />
                ))}
                {pay.voluntary === 0 && <p className="text-xs text-muted-foreground italic">No voluntary deductions configured.</p>}
                {pay.voluntary > 0 && (
                  <div className="flex justify-between pt-2 border-t border-border text-sm font-semibold">
                    <span>Total Voluntary</span>
                    <span className="text-orange-600">{fmt(pay.voluntary)}/mo</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ══ TAB: CHILDREN / DEPENDENTS ════════════════════════════════════ */}
        {tab === "children" && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="rounded-md border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-800 flex items-start gap-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong>Guyana 2026 Child Allowance:</strong> GYD 10,000/month per qualifying child deducted from taxable income. Qualifying: under 18, or 18–25 if in full-time education. The system automatically removes the allowance when a child turns 18 (unless school is specified).
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{children.length} dependent{children.length !== 1 ? "s" : ""} on record</h3>
              <Button onClick={() => setChildModal({ ...EMPTY_CHILD })} data-testid="button-add-child">
                <PlusCircle className="w-4 h-4 mr-2" /> Add Dependent
              </Button>
            </div>

            {children.length === 0 && (
              <Card className="p-12 text-center text-muted-foreground border-2 border-dashed">
                <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No dependents on record. Add children to apply child allowance tax benefits.</p>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {children.map((child) => {
                const age = childAge(child.dob);
                const ageMonths = childAgeMonths(child.dob);
                const monthsLeft = monthsTo18(child.dob);
                const qualifying = isQualifyingChild(child);
                const expired = age >= 18 && !child.school;
                return (
                  <Card key={child.id} className={`p-5 ${expired ? "opacity-60 border-dashed" : ""}`} data-testid={`child-card-${child.id}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{child.firstName} {child.lastName}</p>
                          {qualifying && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Qualifying</Badge>}
                          {expired && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                          {!child.active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">{child.relationship} · DOB: {child.dob}</p>
                        {child.school && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><GraduationCap className="w-3 h-3" /> {child.school}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setChildModal({ ...child })} data-testid={`button-edit-child-${child.id}`}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={async () => { await deleteChild(child.id); toast({ title: "Dependent removed" }); }} data-testid={`button-delete-child-${child.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>

                    {/* Age progress bar — 0 to 18 years */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Age: <strong>{age} yr{age !== 1 ? "s" : ""} {ageMonths % 12} mo</strong></span>
                        {!expired && <span className="text-muted-foreground">{Math.floor(monthsLeft / 12)}y {monthsLeft % 12}m until 18</span>}
                        {expired && <span className="text-red-500 font-medium">Over 18 — allowance ended</span>}
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all ${expired ? "bg-red-400" : age >= 15 ? "bg-amber-500" : "bg-pink-400"}`}
                          style={{ width: `${Math.min(100, (ageMonths / (18 * 12)) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Birth</span>
                        <span>Age 18</span>
                      </div>
                    </div>

                    {qualifying && (
                      <div className="mt-3 text-xs rounded-md bg-green-50 border border-green-200 px-3 py-2 text-green-800">
                        Contributes <strong>GYD 10,000/mo</strong> tax deduction to payroll
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Child allowance summary */}
            {children.length > 0 && (
              <Card className="p-4 bg-pink-50/50 border-pink-200">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium">Total Child Allowance Tax Benefit</span>
                  <span className="font-bold text-pink-700">{fmt(pay.childAllowDeduction)}/mo</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{qualifyingChildren.length} qualifying × GYD 10,000 = PAYE reduction of approx. {fmt(pay.childAllowDeduction * GY_TAX1)}/mo</p>
              </Card>
            )}
          </div>
        )}

        {/* ══ TAB: LOANS ═════════════════════════════════════════════════════ */}
        {tab === "loans" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">{loans.length} loan{loans.length !== 1 ? "s" : ""} on record</h3>
                {totalLoanBalance > 0 && <p className="text-xs text-muted-foreground mt-0.5">Total outstanding: {fmt(totalLoanBalance)}</p>}
              </div>
              <Button onClick={() => setLoanModal({ ...EMPTY_LOAN })} data-testid="button-add-loan">
                <PlusCircle className="w-4 h-4 mr-2" /> Add Loan
              </Button>
            </div>

            {loans.length === 0 && (
              <Card className="p-12 text-center text-muted-foreground border-2 border-dashed">
                <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No loans on record.</p>
              </Card>
            )}

            <div className="space-y-4">
              {loans.map((loan) => {
                const paid = loan.principal - loan.balance;
                const pct = Math.round((paid / loan.principal) * 100);
                const monthsRemaining = loan.balance > 0 ? Math.ceil(loan.balance / loan.monthlyPayment) : 0;
                const isPaid = loan.status === "paid" || loan.balance <= 0;
                return (
                  <Card key={loan.id} className={`p-5 ${isPaid ? "opacity-60" : ""}`} data-testid={`loan-card-${loan.id}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{loan.description}</p>
                          <Badge className={`text-[10px] capitalize ${
                            loan.status === "paid" || isPaid ? "bg-green-100 text-green-700" :
                            loan.status === "suspended" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>{isPaid ? "Paid Off" : loan.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Started: {loan.startDate} · Monthly: {fmt(loan.monthlyPayment)}
                        </p>
                        {loan.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">"{loan.notes}"</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLoanModal({ ...loan })} data-testid={`button-edit-loan-${loan.id}`}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={async () => { await deleteLoan(loan.id); toast({ title: "Loan removed" }); }} data-testid={`button-delete-loan-${loan.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4 text-center text-xs">
                      <div className="bg-muted/40 rounded-md py-2">
                        <p className="text-muted-foreground">Principal</p>
                        <p className="font-semibold">{fmt(loan.principal)}</p>
                      </div>
                      <div className="bg-muted/40 rounded-md py-2">
                        <p className="text-muted-foreground">Paid</p>
                        <p className="font-semibold text-green-600">{fmt(paid)}</p>
                      </div>
                      <div className="bg-muted/40 rounded-md py-2">
                        <p className="text-muted-foreground">Balance</p>
                        <p className={`font-semibold ${loan.balance > 0 ? "text-red-600" : "text-green-600"}`}>{fmt(loan.balance)}</p>
                      </div>
                    </div>

                    {/* Repayment progress */}
                    <ProgressBar
                      label="Repayment Progress"
                      sublabel={isPaid ? "Fully paid" : `~${monthsRemaining} month${monthsRemaining !== 1 ? "s" : ""} remaining`}
                      value={paid}
                      max={loan.principal}
                      color={isPaid ? "bg-green-500" : "bg-blue-500"}
                      danger={false}
                    />

                    {/* Make a payment button */}
                    {!isPaid && loan.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        onClick={async () => {
                          const newBalance = Math.max(0, loan.balance - loan.monthlyPayment);
                          await updateLoan({ id: loan.id, balance: newBalance, status: newBalance === 0 ? "paid" : "active" });
                          toast({ title: newBalance === 0 ? "Loan fully paid off!" : `Payment applied — new balance: ${fmt(newBalance)}` });
                        }}
                        data-testid={`button-apply-payment-${loan.id}`}
                      >
                        Apply Monthly Payment ({fmt(loan.monthlyPayment)})
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit Child Modal ─────────────────────────────────────────── */}
      <Dialog open={!!childModal} onOpenChange={() => setChildModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Baby className="w-4 h-4" />
              {childModal?.id ? "Edit Dependent" : "Add Dependent"}
            </DialogTitle>
          </DialogHeader>
          {childModal && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First Name <span className="text-destructive">*</span></Label>
                  <Input value={childModal.firstName ?? ""} onChange={(e) => setChildModal({ ...childModal, firstName: e.target.value })} data-testid="input-child-fname" />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name</Label>
                  <Input value={childModal.lastName ?? ""} onChange={(e) => setChildModal({ ...childModal, lastName: e.target.value })} data-testid="input-child-lname" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date of Birth <span className="text-destructive">*</span></Label>
                  <Input type="date" value={childModal.dob ?? ""} onChange={(e) => setChildModal({ ...childModal, dob: e.target.value })} data-testid="input-child-dob" />
                  {childModal.dob && <p className="text-xs text-muted-foreground">Age: {childAge(childModal.dob)} years</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Relationship</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={childModal.relationship ?? "biological"} onChange={(e) => setChildModal({ ...childModal, relationship: e.target.value })} data-testid="select-child-relationship">
                    <option value="biological">Biological</option>
                    <option value="adopted">Adopted</option>
                    <option value="step">Step-child</option>
                    <option value="foster">Foster</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>School / Institution <span className="text-muted-foreground text-xs">(for ages 18–25 extension)</span></Label>
                <Input value={childModal.school ?? ""} onChange={(e) => setChildModal({ ...childModal, school: e.target.value })} placeholder="e.g. University of Guyana" data-testid="input-child-school" />
                <p className="text-xs text-muted-foreground">If enrolled in full-time education, allowance extends up to age 25.</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="child-active" checked={childModal.active ?? true} onChange={(e) => setChildModal({ ...childModal, active: e.target.checked })} data-testid="checkbox-child-active" />
                <Label htmlFor="child-active" className="cursor-pointer">Active (include in allowance calculations)</Label>
              </div>
              {childModal.dob && (
                <div className={`rounded-md px-3 py-2 text-xs ${isQualifyingChild({ ...EMPTY_CHILD, ...childModal } as EmployeeChild) ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                  {isQualifyingChild({ ...EMPTY_CHILD, ...childModal } as EmployeeChild)
                    ? `✓ Qualifying — GYD 10,000/month will be deducted from taxable income`
                    : `✗ Not qualifying — age ${childAge(childModal.dob)} (over 18 without school enrollment)`}
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setChildModal(null)}>Cancel</Button>
                <Button onClick={handleSaveChild} disabled={addingChild} data-testid="button-save-child">
                  {addingChild ? "Saving..." : childModal.id ? "Save Changes" : "Add Dependent"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Loan Modal ──────────────────────────────────────────── */}
      <Dialog open={!!loanModal} onOpenChange={() => setLoanModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              {loanModal?.id ? "Edit Loan" : "Add Loan"}
            </DialogTitle>
          </DialogHeader>
          {loanModal && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Input value={loanModal.description ?? ""} onChange={(e) => setLoanModal({ ...loanModal, description: e.target.value })} placeholder="e.g. Staff welfare loan 2026" data-testid="input-loan-desc" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Principal Amount (GYD) <span className="text-destructive">*</span></Label>
                  <Input type="number" min={0} value={loanModal.principal ?? 0} onChange={(e) => setLoanModal({ ...loanModal, principal: Number(e.target.value) })} data-testid="input-loan-principal" />
                </div>
                <div className="space-y-1.5">
                  <Label>Current Balance (GYD)</Label>
                  <Input type="number" min={0} value={loanModal.balance ?? loanModal.principal ?? 0} onChange={(e) => setLoanModal({ ...loanModal, balance: Number(e.target.value) })} data-testid="input-loan-balance" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Monthly Payment (GYD) <span className="text-destructive">*</span></Label>
                  <Input type="number" min={0} value={loanModal.monthlyPayment ?? 0} onChange={(e) => setLoanModal({ ...loanModal, monthlyPayment: Number(e.target.value) })} data-testid="input-loan-payment" />
                  {loanModal.monthlyPayment > 0 && loanModal.balance > 0 && (
                    <p className="text-xs text-muted-foreground">~{Math.ceil((loanModal.balance ?? 0) / loanModal.monthlyPayment)} months remaining</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={loanModal.startDate ?? today()} onChange={(e) => setLoanModal({ ...loanModal, startDate: e.target.value })} data-testid="input-loan-start" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={loanModal.status ?? "active"} onChange={(e) => setLoanModal({ ...loanModal, status: e.target.value })} data-testid="select-loan-status">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="paid">Paid Off</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={loanModal.notes ?? ""} onChange={(e) => setLoanModal({ ...loanModal, notes: e.target.value })} placeholder="Optional notes..." data-testid="input-loan-notes" />
              </div>
              {loanModal.principal > 0 && loanModal.monthlyPayment > 0 && (
                <div className="rounded-md bg-muted/40 border border-border p-3 text-xs space-y-1">
                  <p><span className="text-muted-foreground">Repayment term:</span> <strong>~{Math.ceil((loanModal.balance ?? loanModal.principal) / loanModal.monthlyPayment)} months</strong></p>
                  <p><span className="text-muted-foreground">Total repayable:</span> <strong>{fmt(Math.ceil((loanModal.balance ?? loanModal.principal) / loanModal.monthlyPayment) * loanModal.monthlyPayment)}</strong></p>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setLoanModal(null)}>Cancel</Button>
                <Button onClick={handleSaveLoan} disabled={addingLoan} data-testid="button-save-loan">
                  {addingLoan ? "Saving..." : loanModal.id ? "Save Changes" : "Add Loan"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
