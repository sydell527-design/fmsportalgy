import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, UserCircle } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold">Profile & Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account information</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-8 rounded-3xl border-border/50 corporate-shadow">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border/50">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold text-2xl">
              {user.av || user.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold font-display">{user.name}</h2>
              <p className="text-muted-foreground">{user.userId}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium flex items-center gap-2"><UserCircle className="w-4 h-4"/> Role</span>
              <span className="font-semibold capitalize">{user.role}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium flex items-center gap-2"><Building2 className="w-4 h-4"/> Department</span>
              <span className="font-semibold">{user.dept}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium flex items-center gap-2"><Shield className="w-4 h-4"/> Position</span>
              <span className="font-semibold">{user.pos}</span>
            </div>
          </div>
        </Card>

        <Card className="p-8 rounded-3xl border-border/50 corporate-shadow">
          <h3 className="text-xl font-display font-bold mb-4">Authorized Locations</h3>
          <p className="text-sm text-muted-foreground mb-6">
            You are authorized to clock in from the following geofenced zones:
          </p>
          <div className="flex flex-wrap gap-2">
            {user.geo?.map((zone, i) => (
              <Badge key={i} className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary rounded-xl text-sm">
                {zone}
              </Badge>
            ))}
            {(!user.geo || user.geo.length === 0) && (
              <span className="text-sm text-muted-foreground italic">No specific locations assigned.</span>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
