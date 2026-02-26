import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
import { useGeofences } from "@/hooks/use-geofences";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Plus, Edit2, Copy, CheckCircle, User, KeyRound,
  Trash2, RotateCcw, AlertTriangle, Search, UserCircle,
  CreditCard, ShieldCheck, Banknote, PlusCircle, X,
  TrendingDown, TrendingUp, DollarSign, Info, Baby,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType, PayConfig } from "@shared/schema";

const POSITIONS = [
  "Security Officer", "Office Clerk", "Warehouse Supervisor", "Shift Supervisor",
  "Operations Manager", "Junior General Manager", "Driver", "Cleaner", "Technician",
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const DEFAULT_PAY_CONFIG: PayConfig = {
  frequency: "monthly",
  otMultiplier: 1.5,
  phMultiplier: 2.0,
  housingAllowance: 0,
  transportAllowance: 0,
  mealAllowance: 0,
  uniformAllowance: 0,
  riskAllowance: 0,
  shiftAllowance: 0,
  otherAllowances: [],
  nisExempt: false,
  taxExempt: false,
  healthSurchargeExempt: false,
  healthSurchargeRate: "full",
  creditUnion: 0,
  loanRepayment: 0,
  advancesRecovery: 0,
  unionDues: 0,
  otherDeductions: [],
};

const EMPTY_FORM = {
  userId: "", username: "", password: "temp", name: "", role: "employee",
  dept: "", pos: "", cat: "Time", hourlyRate: 0, salary: 0,
  fa: "", sa: "Junior General Manager", email: "", phone: "",
  status: "active", fpc: true,
  joined: new Date().toISOString().split("T")[0],
  geo: ["HEAD OFFICE"] as string[], av: "",
  payConfig: { ...DEFAULT_PAY_CONFIG } as PayConfig,
};

export default function Employees() {
  const { user } = useAuth();
  const { data: users, isLoading } = useUsers();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { mutateAsync: deleteUser } = useDeleteUser();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [createdCredentials, setCreatedCredentials] = useState<{ id: string; password: string; name: string } | null>(null);
  const [copied, setCopied] = useState<"id" | "pass" | null>(null);
  const [editTarget, setEditTarget] = useState<UserType | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserType | null>(null);
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);

  if (user?.role !== "admin") return <Redirect to="/" />;

  const filtered = (users ?? []).filter((u) =>
    search === "" ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.userId.toLowerCase().includes(search.toLowerCase()) ||
    u.pos.toLowerCase().includes(search.toLowerCase()) ||
    u.dept.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
  const someSelected = filtered.some((u) => selected.has(u.id));

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.add(u.id));
        return next;
      });
    }
  };

  const copy = (text: string, field: "id" | "pass") => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    try {
      await updateUser({ id: resetTarget.id, password: "temp", fpc: true });
      toast({ title: `Credentials reset for ${resetTarget.name}`, description: "Password set to 'temp'. Employee must change on next login." });
      setResetTarget(null);
    } catch {
      toast({ title: "Reset failed", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      toast({ title: `${deleteTarget.name} deleted` });
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      setDeleteTarget(null);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const handleMassDelete = async () => {
    const ids = Array.from(selected);
    let count = 0;
    for (const id of ids) {
      try { await deleteUser(id); count++; } catch { /* skip errors */ }
    }
    setSelected(new Set());
    setMassDeleteOpen(false);
    toast({ title: `${count} employee${count !== 1 ? "s" : ""} deleted` });
  };

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Employee Directory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage personnel, access, and credentials</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-add-employee">
          <Plus className="w-4 h-4 mr-2" /> Add Employee
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search by name, ID, position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-employees"
          />
        </div>

        {someSelected && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setMassDeleteOpen(true)}
              data-testid="button-mass-delete"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm p-8 text-center">Loading...</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="rounded"
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Position / Dept</th>
                  <th className="px-4 py-3">Pay</th>
                  <th className="px-4 py-3">Locations</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      {search ? "No employees match your search." : "No employees yet."}
                    </td>
                  </tr>
                ) : filtered.map((u) => (
                  <tr
                    key={u.id}
                    className={`transition-colors ${selected.has(u.id) ? "bg-primary/5" : "hover:bg-muted/20"}`}
                    data-testid={`row-employee-${u.id}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        className="rounded"
                        data-testid={`checkbox-${u.id}`}
                      />
                    </td>

                    {/* Identity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {u.av || getInitials(u.name)}
                        </div>
                        <div>
                          <Link href={`/employees/${u.userId}`} className="font-semibold leading-tight hover:underline hover:text-primary transition-colors" data-testid={`link-profile-${u.id}`}>{u.name}</Link>
                          <p className="text-xs text-muted-foreground font-mono">{u.userId}</p>
                        </div>
                      </div>
                    </td>

                    {/* Position */}
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{u.pos}</p>
                      <p className="text-xs text-muted-foreground">{u.dept}</p>
                    </td>

                    {/* Pay */}
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{u.cat}</Badge>
                      {u.cat === "Time" && u.hourlyRate > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">GYD {u.hourlyRate.toLocaleString()}/hr</p>
                      )}
                      {u.cat !== "Time" && u.salary > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">GYD {u.salary.toLocaleString()}/mo</p>
                      )}
                    </td>

                    {/* Locations */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.geo ?? []).slice(0, 3).map((g, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{g}</Badge>
                        ))}
                        {(u.geo ?? []).length > 3 && (
                          <Badge variant="secondary" className="text-[10px]">+{(u.geo ?? []).length - 3}</Badge>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge variant={u.status === "active" ? "default" : "destructive"} className="text-xs w-fit">
                          {u.status}
                        </Badge>
                        {u.fpc && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 w-fit">
                            Temp PW
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTarget(u)}
                          title="Edit employee"
                          data-testid={`button-edit-${u.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setResetTarget(u)}
                          title="Reset credentials to default"
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          data-testid={`button-reset-${u.id}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(u)}
                          title="Delete employee"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`button-delete-${u.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t border-border text-xs text-muted-foreground">
              {filtered.length} employee{filtered.length !== 1 ? "s" : ""} · {(users ?? []).filter((u) => u.status === "active").length} active
            </div>
          )}
        </Card>
      )}

      {/* ── Credential Reveal Modal ──────────────────────────────────────── */}
      <Dialog open={!!createdCredentials} onOpenChange={() => setCreatedCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" /> Profile Created
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Share these credentials with <strong>{createdCredentials?.name}</strong>. They will be required to change their password on first login.
            </p>
            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Employee ID / Username</p>
                    <p className="font-mono font-semibold" data-testid="text-cred-id">{createdCredentials?.id}</p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => copy(createdCredentials?.id ?? "", "id")} data-testid="button-copy-id">
                  {copied === "id" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Default Password</p>
                    <p className="font-mono font-semibold" data-testid="text-cred-pass">{createdCredentials?.password}</p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => copy(createdCredentials?.password ?? "", "pass")} data-testid="button-copy-pass">
                  {copied === "pass" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The employee will be prompted to set a new password on first login.</p>
            <div className="flex justify-end">
              <Button onClick={() => setCreatedCredentials(null)} data-testid="button-dismiss-creds">Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset Credentials Confirm ────────────────────────────────────── */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reset Credentials</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                This will reset <strong>{resetTarget?.name}</strong>'s password back to <strong className="font-mono">temp</strong> and require them to change it on next login.
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border text-sm">
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono font-semibold">{resetTarget?.userId}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">New Password</span>
                <span className="font-mono font-semibold">temp</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button onClick={handleReset} className="bg-amber-600 hover:bg-amber-700" data-testid="button-confirm-reset">
                <RotateCcw className="w-4 h-4 mr-1.5" /> Reset Credentials
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Single Confirm ────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Employee</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3 p-3 rounded-md bg-red-50 border border-red-200">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                Permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.userId})? This cannot be undone. Their timesheet and request history will remain.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete">
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mass Delete Confirm ──────────────────────────────────────────── */}
      <Dialog open={massDeleteOpen} onOpenChange={setMassDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete {selected.size} Employees</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3 p-3 rounded-md bg-red-50 border border-red-200">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                You are about to permanently delete <strong>{selected.size} employee profile{selected.size !== 1 ? "s" : ""}</strong>. This action cannot be undone.
              </p>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border text-sm">
              {(users ?? []).filter((u) => selected.has(u.id)).map((u) => (
                <div key={u.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {u.av || getInitials(u.name)}
                  </div>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-muted-foreground font-mono text-xs ml-auto">{u.userId}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setMassDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleMassDelete} data-testid="button-confirm-mass-delete">
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete All {selected.size}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Employee Form Dialog ─────────────────────────────── */}
      {showCreate && (
        <EmployeeFormDialog
          onClose={() => setShowCreate(false)}
          onCreated={(creds) => { setShowCreate(false); setCreatedCredentials(creds); }}
        />
      )}
      {editTarget && (
        <EmployeeFormDialog
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onCreated={() => { setEditTarget(null); }}
        />
      )}
    </Layout>
  );
}

// ── Guyana 2026 Payroll Constants ───────────────────────────────────────────
const GY_NIS_EMPLOYEE_RATE = 0.056;        // 5.6%
const GY_NIS_EMPLOYER_RATE = 0.084;        // 8.4%
const GY_NIS_MAX_INSURABLE = 280_000;      // GYD/month
const GY_PERSONAL_ALLOWANCE = 100_000;     // GYD/month
const GY_TAX_LOWER_RATE = 0.28;           // 28% on first $200,000/month chargeable
const GY_TAX_LOWER_LIMIT = 200_000;       // monthly equivalent of $2.4M/year
const GY_TAX_UPPER_RATE = 0.40;           // 40% above $200,000/month chargeable
const GY_HEALTH_SURCHARGE_FULL = 1_200;   // GYD/month
const GY_HEALTH_SURCHARGE_HALF = 600;     // GYD/month (casual/part-time)

function gyCalc(basic: number, cat: string, pc: PayConfig) {
  const monthlyBasic = cat === "Time"
    ? basic * 173.33           // 40h/wk × 4.333wk/mo
    : basic;
  const allowances = (pc.housingAllowance ?? 0) + (pc.transportAllowance ?? 0) +
    (pc.mealAllowance ?? 0) + (pc.uniformAllowance ?? 0) + (pc.riskAllowance ?? 0) +
    (pc.shiftAllowance ?? 0) + (pc.otherAllowances ?? []).reduce((s, x) => s + x.amount, 0);
  const gross = monthlyBasic + allowances;

  const nisBase = Math.min(gross, GY_NIS_MAX_INSURABLE);
  const nisEmployee = pc.nisExempt ? 0 : Math.round(nisBase * GY_NIS_EMPLOYEE_RATE);
  const nisEmployer = pc.nisExempt ? 0 : Math.round(nisBase * GY_NIS_EMPLOYER_RATE);
  const healthSurcharge = pc.healthSurchargeExempt ? 0
    : pc.healthSurchargeRate === "half" ? GY_HEALTH_SURCHARGE_HALF : GY_HEALTH_SURCHARGE_FULL;
  const chargeable = pc.taxExempt ? 0
    : Math.max(0, gross - nisEmployee - GY_PERSONAL_ALLOWANCE);
  const tax = pc.taxExempt ? 0
    : chargeable <= GY_TAX_LOWER_LIMIT
      ? Math.round(chargeable * GY_TAX_LOWER_RATE)
      : Math.round(GY_TAX_LOWER_LIMIT * GY_TAX_LOWER_RATE + (chargeable - GY_TAX_LOWER_LIMIT) * GY_TAX_UPPER_RATE);

  const statutory = nisEmployee + healthSurcharge + tax;
  const voluntary = (pc.creditUnion ?? 0) + (pc.loanRepayment ?? 0) +
    (pc.advancesRecovery ?? 0) + (pc.unionDues ?? 0) +
    (pc.otherDeductions ?? []).reduce((s, x) => s + x.amount, 0);
  const net = gross - statutory - voluntary;
  return { gross, allowances, monthlyBasic, nisEmployee, nisEmployer, healthSurcharge, tax, statutory, voluntary, net, chargeable };
}

function fmt(n: number) { return `GYD ${Math.round(n).toLocaleString("en-GY")}`; }
function sel(value: string, onChange: (v: string) => void, opts: [string, string][], testId?: string) {
  return (
    <select
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
    >
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function EmployeeFormDialog({
  user,
  onClose,
  onCreated,
}: {
  user?: UserType;
  onClose: () => void;
  onCreated: (creds: { id: string; password: string; name: string }) => void;
}) {
  const { mutateAsync: createUser, isPending: creating } = useCreateUser();
  const { mutateAsync: updateUser, isPending: updating } = useUpdateUser();
  const { data: geofences } = useGeofences();
  const { toast } = useToast();

  const availableLocations = (geofences ?? []).filter((g) => g.active).map((g) => g.name);
  const [tab, setTab] = useState<"personal" | "pay" | "deductions">("personal");

  const initPayConfig = (): PayConfig => ({
    ...DEFAULT_PAY_CONFIG,
    ...(user?.payConfig ?? {}),
    otherAllowances: user?.payConfig?.otherAllowances ?? [],
    otherDeductions: user?.payConfig?.otherDeductions ?? [],
  });

  const [formData, setFormData] = useState<typeof EMPTY_FORM>(
    user
      ? { ...EMPTY_FORM, ...user, geo: user.geo ?? ["HEAD OFFICE"], payConfig: initPayConfig() }
      : { ...EMPTY_FORM }
  );

  const pc = formData.payConfig;
  const setPc = (patch: Partial<PayConfig>) =>
    setFormData((prev) => ({ ...prev, payConfig: { ...prev.payConfig, ...patch } }));

  function toggleLocation(loc: string) {
    setFormData((prev) => ({
      ...prev,
      geo: prev.geo.includes(loc) ? prev.geo.filter((g) => g !== loc) : [...prev.geo, loc],
    }));
  }

  const calc = useMemo(() =>
    gyCalc(formData.cat === "Time" ? formData.hourlyRate : formData.salary, formData.cat, pc),
    [formData.cat, formData.hourlyRate, formData.salary, pc]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.userId.trim() || !formData.name.trim() || !formData.dept.trim() || !formData.pos.trim()) {
      toast({ title: "Personal Details incomplete", description: "Employee ID, name, department and position are required.", variant: "destructive" });
      setTab("personal");
      return;
    }
    try {
      const payload = {
        ...formData,
        username: formData.userId,
        password: user ? formData.password : "temp",
        fpc: user ? formData.fpc : true,
        hourlyRate: Number(formData.hourlyRate),
        salary: Number(formData.salary),
      };
      if (user) {
        await updateUser({ id: user.id, ...payload });
        toast({ title: "Employee updated" });
        onClose();
      } else {
        const created = await createUser(payload);
        onCreated({ id: created.userId ?? payload.userId, password: "temp", name: created.name });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const tabCls = (active: boolean) =>
    `flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
    }`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col p-0 gap-0">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle className="text-lg">{user ? `Edit — ${user.name}` : "New Employee Profile"}</DialogTitle>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex border-b border-border px-6 mt-3 shrink-0">
          <button type="button" onClick={() => setTab("personal")} className={tabCls(tab === "personal")} data-testid="tab-personal">
            <UserCircle className="w-4 h-4" /> Personal Details
          </button>
          <button type="button" onClick={() => setTab("pay")} className={tabCls(tab === "pay")} data-testid="tab-pay">
            <Banknote className="w-4 h-4" /> Pay Structure
          </button>
          <button type="button" onClick={() => setTab("deductions")} className={tabCls(tab === "deductions")} data-testid="tab-deductions">
            <ShieldCheck className="w-4 h-4" /> Deductions &amp; Compliance
          </button>
        </div>

        {/* Scrollable content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ══ TAB 1: PERSONAL DETAILS ══════════════════════════════════ */}
            {tab === "personal" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Employee ID <span className="text-muted-foreground text-xs">(login)</span></Label>
                    <Input value={formData.userId} onChange={(e) => setFormData({ ...formData, userId: e.target.value, username: e.target.value })} placeholder="e.g. 1006" required disabled={!!user} data-testid="input-employee-id" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input value={formData.name} onChange={(e) => { const n = e.target.value; setFormData((p) => ({ ...p, name: n, av: getInitials(n) })); }} placeholder="First and Last name" required data-testid="input-employee-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>System Role</Label>
                    {sel(formData.role, (v) => setFormData({ ...formData, role: v }), [["employee","Employee"],["manager","Manager"],["admin","Admin"]], "select-employee-role")}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Input value={formData.dept} onChange={(e) => setFormData({ ...formData, dept: e.target.value })} placeholder="e.g. Security" required data-testid="input-employee-dept" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Position Title</Label>
                    <Input value={formData.pos} onChange={(e) => setFormData({ ...formData, pos: e.target.value })} placeholder="e.g. Security Officer" list="positions-list" required data-testid="input-employee-pos" />
                    <datalist id="positions-list">{POSITIONS.map((p) => <option key={p} value={p} />)}</datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="592-600-XXXX" data-testid="input-employee-phone" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="name@fms.gy" data-testid="input-employee-email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Join Date</Label>
                    <Input type="date" value={formData.joined} onChange={(e) => setFormData({ ...formData, joined: e.target.value })} data-testid="input-employee-joined" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    {sel(formData.status, (v) => setFormData({ ...formData, status: v }), [["active","Active"],["inactive","Inactive"]], "select-employee-status")}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>1st Sign-off Position</Label>
                    <Input value={formData.fa ?? ""} onChange={(e) => setFormData({ ...formData, fa: e.target.value })} placeholder="e.g. Shift Supervisor" list="positions-list" data-testid="input-employee-fa" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>2nd Sign-off Position</Label>
                    <Input value={formData.sa ?? ""} onChange={(e) => setFormData({ ...formData, sa: e.target.value })} placeholder="e.g. Junior General Manager" list="positions-list" data-testid="input-employee-sa" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Authorized Work Locations</Label>
                  {availableLocations.length === 0
                    ? <p className="text-xs text-muted-foreground italic">No active geofence zones. Add zones in Settings.</p>
                    : <div className="flex flex-wrap gap-2">
                        {availableLocations.map((loc) => {
                          const on = formData.geo.includes(loc);
                          return (
                            <button key={loc} type="button" onClick={() => toggleLocation(loc)}
                              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
                              data-testid={`toggle-location-${loc}`}>{loc}</button>
                          );
                        })}
                      </div>
                  }
                </div>

                {!user && (
                  <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                    <KeyRound className="w-4 h-4 shrink-0 text-primary" />
                    Temporary password <strong className="text-foreground font-mono mx-1">temp</strong> will be set. Employee must change it on first login.
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB 2: PAY STRUCTURE ═════════════════════════════════════ */}
            {tab === "pay" && (
              <div className="grid grid-cols-2 gap-6">
                {/* Left: basic + multipliers */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic Compensation</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Pay Category</Label>
                      {sel(formData.cat, (v) => setFormData({ ...formData, cat: v }), [["Time","Time (Hourly)"],["Fixed","Fixed (Salary)"],["Executive","Executive"]], "select-employee-cat")}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Pay Frequency</Label>
                      {sel(pc.frequency, (v) => setPc({ frequency: v as any }), [["weekly","Weekly"],["biweekly","Bi-weekly"],["monthly","Monthly"]], "select-pay-frequency")}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {formData.cat === "Time" ? (<>
                      <Label>Hourly Rate (GYD)</Label>
                      <Input type="number" min={0} value={formData.hourlyRate} onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })} data-testid="input-employee-hourly" />
                      <p className="text-xs text-muted-foreground">≈ {fmt(formData.hourlyRate * 173.33)}/mo</p>
                    </>) : (<>
                      <Label>Monthly Salary (GYD)</Label>
                      <Input type="number" min={0} value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })} data-testid="input-employee-salary" />
                    </>)}
                  </div>

                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Overtime Rates</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>OT Multiplier</Label>
                        <Input type="number" step="0.1" min={1} max={4} value={pc.otMultiplier} onChange={(e) => setPc({ otMultiplier: Number(e.target.value) })} data-testid="input-ot-mult" />
                        <p className="text-xs text-muted-foreground">Standard: 1.5× (Labour Act §16)</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Public Holiday Multiplier</Label>
                        <Input type="number" step="0.5" min={1} max={4} value={pc.phMultiplier} onChange={(e) => setPc({ phMultiplier: Number(e.target.value) })} data-testid="input-ph-mult" />
                        <p className="text-xs text-muted-foreground">Standard: 2.0× (Labour Act §22)</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: allowances */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-green-600" /> Allowances (Monthly GYD)
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["housingAllowance",   "Housing"],
                      ["transportAllowance", "Transport"],
                      ["mealAllowance",      "Meal"],
                      ["uniformAllowance",   "Uniform"],
                      ["riskAllowance",      "Risk / Hazard"],
                      ["shiftAllowance",     "Shift Differential"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="space-y-1.5">
                        <Label>{label}</Label>
                        <Input type="number" min={0} value={pc[key]} onChange={(e) => setPc({ [key]: Number(e.target.value) })} data-testid={`input-${key}`} />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Other Allowances</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPc({ otherAllowances: [...(pc.otherAllowances ?? []), { name: "", amount: 0 }] })} data-testid="button-add-other-allowance">
                        <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    </div>
                    {(pc.otherAllowances ?? []).map((a, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input placeholder="Allowance name" value={a.name} onChange={(e) => { const arr = [...pc.otherAllowances]; arr[i] = { ...arr[i], name: e.target.value }; setPc({ otherAllowances: arr }); }} className="flex-1" data-testid={`input-other-allowance-name-${i}`} />
                        <Input type="number" min={0} placeholder="GYD" value={a.amount} onChange={(e) => { const arr = [...pc.otherAllowances]; arr[i] = { ...arr[i], amount: Number(e.target.value) }; setPc({ otherAllowances: arr }); }} className="w-32" data-testid={`input-other-allowance-amount-${i}`} />
                        <Button type="button" variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => setPc({ otherAllowances: pc.otherAllowances.filter((_, j) => j !== i) })}><X className="w-4 h-4" /></Button>
                      </div>
                    ))}
                    {(pc.otherAllowances ?? []).length === 0 && <p className="text-xs text-muted-foreground italic">No custom allowances. Click Add to include one.</p>}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-border text-sm font-semibold">
                    <span className="text-muted-foreground">Total Allowances / Month</span>
                    <span className="text-green-700">{fmt(calc.allowances)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB 3: DEDUCTIONS & COMPLIANCE ══════════════════════════ */}
            {tab === "deductions" && (
              <div className="space-y-5">

              {/* Child allowance callout */}
              <div className="rounded-md border border-pink-200 bg-pink-50 px-4 py-3 flex items-start gap-3">
                <Baby className="w-4 h-4 text-pink-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pink-800">Child Allowance Tax Deduction (Guyana 2026)</p>
                  <p className="text-xs text-pink-700 mt-0.5">
                    GYD 10,000/month per qualifying child is deducted from chargeable income before PAYE is calculated.
                    Children and dependents are managed on the <strong>employee's profile page</strong>.
                  </p>
                </div>
                {user && (
                  <Link
                    href={`/employees/${user.userId}?tab=children`}
                    onClick={onClose}
                    className="shrink-0 text-xs font-semibold text-pink-700 underline underline-offset-2 hover:text-pink-900 whitespace-nowrap"
                    data-testid="link-manage-children"
                  >
                    Manage Children →
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Left: Statutory */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Statutory Deductions (Guyana 2026)
                  </p>

                  {/* NIS */}
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">NIS — National Insurance Scheme</p>
                        <p className="text-xs text-muted-foreground">Employee 5.6% · Employer 8.4% · Max {fmt(GY_NIS_MAX_INSURABLE)}/mo</p>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 mt-0.5">
                        <input type="checkbox" checked={pc.nisExempt} onChange={(e) => setPc({ nisExempt: e.target.checked })} data-testid="checkbox-nis-exempt" /> Exempt
                      </label>
                    </div>
                    {!pc.nisExempt && (
                      <div className="grid grid-cols-2 gap-2 text-xs bg-background rounded p-2 border border-border">
                        <div><span className="text-muted-foreground">Employee:</span> <strong className="text-red-600">{fmt(calc.nisEmployee)}/mo</strong></div>
                        <div><span className="text-muted-foreground">Employer:</span> <strong className="text-blue-600">{fmt(calc.nisEmployer)}/mo</strong></div>
                      </div>
                    )}
                  </div>

                  {/* Health Surcharge */}
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">Health Surcharge</p>
                        <p className="text-xs text-muted-foreground">Full GYD 1,200/mo · Reduced GYD 600/mo</p>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 mt-0.5">
                        <input type="checkbox" checked={pc.healthSurchargeExempt} onChange={(e) => setPc({ healthSurchargeExempt: e.target.checked })} data-testid="checkbox-hs-exempt" /> Exempt
                      </label>
                    </div>
                    {!pc.healthSurchargeExempt && (
                      <div className="flex items-center gap-4">
                        {(["full","half"] as const).map((r) => (
                          <label key={r} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="radio" name="hsRate" checked={pc.healthSurchargeRate === r} onChange={() => setPc({ healthSurchargeRate: r })} data-testid={`radio-hs-${r}`} />
                            {r === "full" ? "Full — GYD 1,200" : "Reduced — GYD 600"}
                          </label>
                        ))}
                        <span className="ml-auto text-xs font-semibold text-red-600">{fmt(calc.healthSurcharge)}/mo</span>
                      </div>
                    )}
                  </div>

                  {/* PAYE */}
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">Income Tax (PAYE)</p>
                        <p className="text-xs text-muted-foreground">Personal allowance {fmt(GY_PERSONAL_ALLOWANCE)}/mo · 28% / 40%</p>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 mt-0.5">
                        <input type="checkbox" checked={pc.taxExempt} onChange={(e) => setPc({ taxExempt: e.target.checked })} data-testid="checkbox-tax-exempt" /> Exempt
                      </label>
                    </div>
                    {!pc.taxExempt && (
                      <div className="grid grid-cols-2 gap-2 text-xs bg-background rounded p-2 border border-border">
                        <div><span className="text-muted-foreground">Chargeable income:</span> <strong>{fmt(calc.chargeable)}/mo</strong></div>
                        <div><span className="text-muted-foreground">PAYE deduction:</span> <strong className="text-red-600">{fmt(calc.tax)}/mo</strong></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Voluntary + pay summary */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Voluntary Deductions (Monthly GYD)
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["creditUnion","Credit Union"],["loanRepayment","Loan Repayment"],
                      ["advancesRecovery","Advances Recovery"],["unionDues","Union Dues"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="space-y-1.5">
                        <Label>{label}</Label>
                        <Input type="number" min={0} value={pc[key]} onChange={(e) => setPc({ [key]: Number(e.target.value) })} data-testid={`input-${key}`} />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Other Deductions</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPc({ otherDeductions: [...(pc.otherDeductions ?? []), { name: "", amount: 0 }] })} data-testid="button-add-other-deduction">
                        <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    </div>
                    {(pc.otherDeductions ?? []).map((d, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input placeholder="Deduction name" value={d.name} onChange={(e) => { const arr = [...pc.otherDeductions]; arr[i] = { ...arr[i], name: e.target.value }; setPc({ otherDeductions: arr }); }} className="flex-1" data-testid={`input-other-deduction-name-${i}`} />
                        <Input type="number" min={0} placeholder="GYD" value={d.amount} onChange={(e) => { const arr = [...pc.otherDeductions]; arr[i] = { ...arr[i], amount: Number(e.target.value) }; setPc({ otherDeductions: arr }); }} className="w-32" data-testid={`input-other-deduction-amount-${i}`} />
                        <Button type="button" variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => setPc({ otherDeductions: pc.otherDeductions.filter((_, j) => j !== i) })}><X className="w-4 h-4" /></Button>
                      </div>
                    ))}
                    {(pc.otherDeductions ?? []).length === 0 && <p className="text-xs text-muted-foreground italic">No additional deductions configured.</p>}
                  </div>

                  {/* Pay summary */}
                  <div className="rounded-md border-2 border-primary/20 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary" />
                      <p className="font-semibold text-sm">Estimated Monthly Pay</p>
                      <Badge variant="outline" className="text-xs ml-auto capitalize">{pc.frequency}</Badge>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Basic {formData.cat === "Time" ? "Wage" : "Salary"}</span><span>{fmt(calc.monthlyBasic)}</span></div>
                      {calc.allowances > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Allowances</span><span className="text-green-700">+ {fmt(calc.allowances)}</span></div>}
                      <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Gross</span><span>{fmt(calc.gross)}</span></div>
                    </div>
                    <div className="space-y-1 text-sm border-t border-border pt-1.5">
                      {!pc.nisExempt && <div className="flex justify-between text-red-600"><span>NIS (5.6%)</span><span>− {fmt(calc.nisEmployee)}</span></div>}
                      {!pc.healthSurchargeExempt && <div className="flex justify-between text-red-600"><span>Health Surcharge</span><span>− {fmt(calc.healthSurcharge)}</span></div>}
                      {!pc.taxExempt && calc.tax > 0 && <div className="flex justify-between text-red-600"><span>PAYE</span><span>− {fmt(calc.tax)}</span></div>}
                      {calc.voluntary > 0 && <div className="flex justify-between text-amber-600"><span>Voluntary</span><span>− {fmt(calc.voluntary)}</span></div>}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t-2 border-primary/20 font-bold">
                      <span>Net Pay</span><span className="text-primary text-base">{fmt(calc.net)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-start gap-1 pt-1">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" /> Estimate only — excludes OT, public holidays, mid-period adjustments.
                    </p>
                  </div>
                </div>
              </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 shrink-0">
            <div className="flex gap-1.5">
              {(["personal","pay","deductions"] as const).map((t) => (
                <div key={t} className={`h-1.5 rounded-full transition-all ${tab === t ? "w-6 bg-primary" : "w-3 bg-muted-foreground/30"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-employee">Cancel</Button>
              {tab !== "deductions"
                ? <Button type="button" onClick={() => setTab(tab === "personal" ? "pay" : "deductions")} data-testid="button-next-tab">Next →</Button>
                : <Button type="submit" disabled={creating || updating} data-testid="button-submit-employee">{creating || updating ? "Saving..." : user ? "Save Changes" : "Create Profile"}</Button>
              }
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
