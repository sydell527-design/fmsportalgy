import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
import { useGeofences } from "@/hooks/use-geofences";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Plus, Edit2, Copy, CheckCircle, User, KeyRound,
  Trash2, RotateCcw, AlertTriangle, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType } from "@shared/schema";

const POSITIONS = [
  "Security Officer", "Office Clerk", "Warehouse Supervisor", "Shift Supervisor",
  "Operations Manager", "Junior General Manager", "Driver", "Cleaner", "Technician",
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const EMPTY_FORM = {
  userId: "", username: "", password: "temp", name: "", role: "employee",
  dept: "", pos: "", cat: "Time", hourlyRate: 0, salary: 0,
  fa: "", sa: "Junior General Manager", email: "", phone: "",
  status: "active", fpc: true,
  joined: new Date().toISOString().split("T")[0],
  geo: ["HEAD OFFICE"] as string[], av: "",
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
                          <p className="font-semibold leading-tight" data-testid={`text-name-${u.id}`}>{u.name}</p>
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

  const [formData, setFormData] = useState<typeof EMPTY_FORM>(
    user ? { ...EMPTY_FORM, ...user, geo: user.geo ?? ["HEAD OFFICE"] } : { ...EMPTY_FORM }
  );

  function toggleLocation(loc: string) {
    setFormData((prev) => ({
      ...prev,
      geo: prev.geo.includes(loc) ? prev.geo.filter((g) => g !== loc) : [...prev.geo, loc],
    }));
  }

  function handleIdChange(id: string) {
    setFormData((prev) => ({ ...prev, userId: id, username: id }));
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({ ...prev, name, av: getInitials(name) }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? "Edit Employee" : "New Employee"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-3">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Employee ID <span className="text-muted-foreground text-xs">(username)</span></Label>
              <Input value={formData.userId} onChange={(e) => handleIdChange(e.target.value)} placeholder="e.g. 1006" required disabled={!!user} data-testid="input-employee-id" />
            </div>
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={formData.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="First and Last name" required data-testid="input-employee-name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>System Role</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} data-testid="select-employee-role">
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input value={formData.dept} onChange={(e) => setFormData({ ...formData, dept: e.target.value })} placeholder="e.g. Security" required data-testid="input-employee-dept" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="name@fms.gy" data-testid="input-employee-email" />
            </div>
            <div className="space-y-1.5">
              <Label>Join Date</Label>
              <Input type="date" value={formData.joined} onChange={(e) => setFormData({ ...formData, joined: e.target.value })} data-testid="input-employee-joined" />
            </div>
          </div>

          {/* Pay */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Pay Category</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={formData.cat} onChange={(e) => setFormData({ ...formData, cat: e.target.value })} data-testid="select-employee-cat">
                <option value="Time">Time (Hourly)</option>
                <option value="Fixed">Fixed (Salary)</option>
                <option value="Executive">Executive</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Hourly Rate (GYD)</Label>
              <Input type="number" value={formData.hourlyRate} onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })} disabled={formData.cat !== "Time"} data-testid="input-employee-hourly" />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Salary (GYD)</Label>
              <Input type="number" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })} disabled={formData.cat === "Time"} data-testid="input-employee-salary" />
            </div>
          </div>

          {/* Approval chain */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>1st Sign-off Position</Label>
              <Input value={formData.fa} onChange={(e) => setFormData({ ...formData, fa: e.target.value })} placeholder="e.g. Shift Supervisor" list="positions-list" data-testid="input-employee-fa" />
            </div>
            <div className="space-y-1.5">
              <Label>2nd Sign-off Position</Label>
              <Input value={formData.sa} onChange={(e) => setFormData({ ...formData, sa: e.target.value })} placeholder="e.g. Junior General Manager" list="positions-list" data-testid="input-employee-sa" />
            </div>
          </div>

          {/* Authorized Locations — pulled live from geofences DB */}
          <div className="space-y-2">
            <Label>Authorized Work Locations</Label>
            {availableLocations.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No active geofence zones configured. Add zones in Settings → Geofences.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableLocations.map((loc) => {
                  const isOn = formData.geo.includes(loc);
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => toggleLocation(loc)}
                      className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${isOn ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
                      data-testid={`toggle-location-${loc}`}
                    >
                      {loc}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status (edit only) */}
          {user && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} data-testid="select-employee-status">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          {/* Default password notice (create only) */}
          {!user && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
              <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span>Login profile will use the Employee ID as the username and <strong className="text-foreground font-mono">temp</strong> as the default password. Employee must change it on first login.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-employee">Cancel</Button>
            <Button type="submit" disabled={creating || updating} data-testid="button-submit-employee">
              {creating || updating ? "Saving..." : user ? "Save Changes" : "Create Profile"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
