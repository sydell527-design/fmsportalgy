import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useUsers, useCreateUser, useUpdateUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Edit2, Copy, CheckCircle, User, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WORK_LOCATIONS = ["CARICOM", "EU", "UN", "DMC", "ARU", "HEAD OFFICE", "CANTEEN"];
const POSITIONS = [
  "Security Officer", "Office Clerk", "Warehouse Supervisor", "Shift Supervisor",
  "Operations Manager", "Junior General Manager", "Driver", "Cleaner", "Technician",
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const EMPTY_FORM = {
  userId: "",
  username: "",
  password: "temp",
  name: "",
  role: "employee",
  dept: "",
  pos: "",
  cat: "Time",
  hourlyRate: 0,
  salary: 0,
  fa: "",
  sa: "Junior General Manager",
  email: "",
  phone: "",
  status: "active",
  fpc: true,
  joined: new Date().toISOString().split("T")[0],
  geo: ["HEAD OFFICE"] as string[],
  av: "",
};

export default function Employees() {
  const { user } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [createdCredentials, setCreatedCredentials] = useState<{ id: string; password: string; name: string } | null>(null);
  const [copied, setCopied] = useState<"id" | "pass" | null>(null);

  if (user?.role !== "admin") {
    return <Redirect to="/" />;
  }

  function copyToClipboard(text: string, field: "id" | "pass") {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6 gap-2">
        <div>
          <h1 className="text-2xl font-bold">Employee Directory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage personnel, assignments, and access</p>
        </div>
        <EmployeeDialog
          onCreated={(creds) => setCreatedCredentials(creds)}
        />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm p-8 text-center">Loading...</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Position / Dept</th>
                  <th className="px-5 py-3">Pay Type</th>
                  <th className="px-5 py-3">Locations</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users?.map((u) => (
                  <tr key={u.id} className="group hover:bg-muted/20 transition-colors" data-testid={`row-employee-${u.id}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {u.av || getInitials(u.name)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground leading-tight" data-testid={`text-name-${u.id}`}>{u.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{u.userId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium leading-tight">{u.pos}</div>
                      <div className="text-xs text-muted-foreground">{u.dept}</div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="outline" className="text-xs">{u.cat}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {u.geo?.map((g, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{g}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={u.status === "active" ? "default" : "destructive"}>
                        {u.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <EmployeeDialog user={u} onCreated={() => {}} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Credential Reveal Modal */}
      <Dialog open={!!createdCredentials} onOpenChange={() => setCreatedCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Profile Created
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              A login profile has been created for <strong>{createdCredentials?.name}</strong>. Share these credentials with the employee — they will be required to change their password on first login.
            </p>

            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Employee ID / Username</div>
                    <div className="font-mono font-semibold text-sm" data-testid="text-cred-id">{createdCredentials?.id}</div>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(createdCredentials?.id ?? "", "id")}
                  data-testid="button-copy-id"
                >
                  {copied === "id" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Default Password</div>
                    <div className="font-mono font-semibold text-sm" data-testid="text-cred-pass">{createdCredentials?.password}</div>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(createdCredentials?.password ?? "", "pass")}
                  data-testid="button-copy-pass"
                >
                  {copied === "pass" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The employee will be prompted to set a new password when they first log in.
            </p>

            <div className="flex justify-end">
              <Button onClick={() => setCreatedCredentials(null)} data-testid="button-dismiss-creds">
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function EmployeeDialog({
  user,
  onCreated,
}: {
  user?: any;
  onCreated: (creds: { id: string; password: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const { mutateAsync: createUser, isPending: creating } = useCreateUser();
  const { mutateAsync: updateUser, isPending: updating } = useUpdateUser();
  const { toast } = useToast();

  const [formData, setFormData] = useState<typeof EMPTY_FORM>(
    user
      ? {
          ...EMPTY_FORM,
          ...user,
          geo: user.geo ?? ["HEAD OFFICE"],
        }
      : { ...EMPTY_FORM }
  );

  function handleOpen(val: boolean) {
    if (val && !user) setFormData({ ...EMPTY_FORM });
    setOpen(val);
  }

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
        toast({ title: "Employee updated successfully" });
        setOpen(false);
      } else {
        const created = await createUser(payload);
        setOpen(false);
        onCreated({ id: created.userId ?? payload.userId, password: "temp", name: created.name });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const isPending = creating || updating;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {user ? (
          <Button variant="ghost" size="icon" data-testid={`button-edit-${user.id}`}>
            <Edit2 className="w-4 h-4" />
          </Button>
        ) : (
          <Button data-testid="button-add-employee">
            <Plus className="w-4 h-4 mr-2" /> Add Employee
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? "Edit Employee" : "New Employee"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-id">
                Employee ID <span className="text-muted-foreground text-xs">(becomes username)</span>
              </Label>
              <Input
                id="emp-id"
                data-testid="input-employee-id"
                value={formData.userId}
                onChange={(e) => handleIdChange(e.target.value)}
                placeholder="e.g. 1006 or MGR002"
                required
                disabled={!!user}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">Full Name</Label>
              <Input
                id="emp-name"
                data-testid="input-employee-name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="First and Last name"
                required
              />
            </div>
          </div>

          {/* Role & Department */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-role">System Role</Label>
              <select
                id="emp-role"
                data-testid="select-employee-role"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-dept">Department</Label>
              <Input
                id="emp-dept"
                data-testid="input-employee-dept"
                value={formData.dept}
                onChange={(e) => setFormData({ ...formData, dept: e.target.value })}
                placeholder="e.g. Security, Admin"
                required
              />
            </div>
          </div>

          {/* Position */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-pos">Position Title</Label>
              <Input
                id="emp-pos"
                data-testid="input-employee-pos"
                value={formData.pos}
                onChange={(e) => setFormData({ ...formData, pos: e.target.value })}
                placeholder="e.g. Security Officer"
                list="positions-list"
                required
              />
              <datalist id="positions-list">
                {POSITIONS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input
                id="emp-phone"
                data-testid="input-employee-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="592-600-XXXX"
              />
            </div>
          </div>

          {/* Pay */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-cat">Pay Category</Label>
              <select
                id="emp-cat"
                data-testid="select-employee-cat"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.cat}
                onChange={(e) => setFormData({ ...formData, cat: e.target.value })}
              >
                <option value="Time">Time (Hourly)</option>
                <option value="Fixed">Fixed (Salary)</option>
                <option value="Executive">Executive</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-hourly">Hourly Rate (GYD)</Label>
              <Input
                id="emp-hourly"
                data-testid="input-employee-hourly"
                type="number"
                value={formData.hourlyRate}
                onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })}
                disabled={formData.cat !== "Time"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-salary">Monthly Salary (GYD)</Label>
              <Input
                id="emp-salary"
                data-testid="input-employee-salary"
                type="number"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })}
                disabled={formData.cat === "Time"}
              />
            </div>
          </div>

          {/* Approval Chain */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-fa">1st Sign-off Position</Label>
              <Input
                id="emp-fa"
                data-testid="input-employee-fa"
                value={formData.fa}
                onChange={(e) => setFormData({ ...formData, fa: e.target.value })}
                placeholder="e.g. Shift Supervisor"
                list="positions-list"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-sa">2nd Sign-off Position</Label>
              <Input
                id="emp-sa"
                data-testid="input-employee-sa"
                value={formData.sa}
                onChange={(e) => setFormData({ ...formData, sa: e.target.value })}
                placeholder="e.g. Junior General Manager"
                list="positions-list"
              />
            </div>
          </div>

          {/* Work Locations */}
          <div className="space-y-2">
            <Label>Work Locations</Label>
            <div className="flex flex-wrap gap-2">
              {WORK_LOCATIONS.map((loc) => {
                const selected = formData.geo.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    data-testid={`toggle-location-${loc}`}
                    onClick={() => toggleLocation(loc)}
                    className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status (edit only) */}
          {user && (
            <div className="space-y-1.5">
              <Label htmlFor="emp-status">Status</Label>
              <select
                id="emp-status"
                data-testid="select-employee-status"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          {/* Default credential notice (create only) */}
          {!user && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
              <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span>
                A login profile will be automatically created using the Employee ID as username and <strong className="text-foreground font-mono">temp</strong> as the default password. The employee must change their password on first login.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-employee">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-employee">
              {isPending ? "Saving..." : user ? "Save Changes" : "Create Profile"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
