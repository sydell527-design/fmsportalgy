import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useUsers, useCreateUser, useUpdateUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Employees() {
  const { user } = useAuth();
  const { data: users, isLoading } = useUsers();
  
  if (user?.role !== 'admin') {
    return <Redirect to="/" />;
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Directory</h1>
          <p className="text-muted-foreground mt-1">Manage personnel and assignments</p>
        </div>
        <EmployeeDialog />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl overflow-hidden corporate-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background/50 text-muted-foreground font-semibold border-b border-border/50">
              <tr>
                <th className="px-6 py-4 rounded-tl-3xl">Employee</th>
                <th className="px-6 py-4">Role & Dept</th>
                <th className="px-6 py-4">Locations</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right rounded-tr-3xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {users?.map((u) => (
                <tr key={u.id} className="hover:bg-background/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {u.av || u.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.userId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{u.pos}</div>
                    <div className="text-xs text-muted-foreground">{u.dept}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {u.geo?.map((g, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-secondary/50">{g}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.status === 'active' ? 'default' : 'destructive'} 
                           className={u.status === 'active' ? 'bg-success hover:bg-success text-success-foreground' : ''}>
                      {u.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                    <EmployeeDialog user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function EmployeeDialog({ user }: { user?: any }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync: createUser } = useCreateUser();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { toast } = useToast();

  const [formData, setFormData] = useState(user || {
    userId: `100${Math.floor(Math.random() * 100)}`,
    username: "",
    password: "tempPassword123",
    name: "",
    role: "employee",
    dept: "General",
    pos: "Staff",
    cat: "Time",
    geo: ["HEAD OFFICE"],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (user) {
        await updateUser({ id: user.id, ...formData });
        toast({ title: "Employee updated" });
      } else {
        await createUser({ ...formData, fpc: true });
        toast({ title: "Employee created" });
      }
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {user ? (
          <Button variant="ghost" size="icon" className="hover:bg-primary/10 hover:text-primary">
            <Edit2 className="w-4 h-4" />
          </Button>
        ) : (
          <Button className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <Plus className="w-5 h-5 mr-2" /> Add Employee
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">{user ? 'Edit' : 'New'} Employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Employee ID</label>
              <Input value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value, username: e.target.value})} required className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select 
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Position</label>
              <Input value={formData.pos} onChange={e => setFormData({...formData, pos: e.target.value})} required className="rounded-xl" />
            </div>
          </div>
          
          <div className="pt-4 border-t border-border/50 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button type="submit" className="rounded-xl">{user ? 'Save Changes' : 'Create Profile'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
