import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser } from "@/hooks/use-users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, UserCircle, KeyRound, MapPin, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PAYROLL_CONSTANTS } from "@/lib/payroll";

const WORK_LOCATIONS = ["CARICOM", "EU", "UN", "DMC", "ARU", "HEAD OFFICE", "CANTEEN"];

const GEOFENCES = {
  "HEAD OFFICE": { lat: 6.813348, lng: -58.147854, radius: 150 },
  "CARICOM": { lat: 6.820398, lng: -58.116849, radius: 200 },
  "EU": { lat: 6.8080, lng: -58.1600, radius: 200 },
  "UN": { lat: 6.8100, lng: -58.1550, radius: 200 },
  "DMC": { lat: 6.8050, lng: -58.1620, radius: 200 },
  "ARU": { lat: 6.8120, lng: -58.1480, radius: 200 },
  "CANTEEN": { lat: 6.8135, lng: -58.1478, radius: 80 },
};

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { mutateAsync: updateUser, isPending } = useUpdateUser();
  const { toast } = useToast();

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [activeTab, setActiveTab] = useState<"profile" | "password" | "payroll" | "geofence">("profile");

  if (!user) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.current !== user.password) {
      toast({ title: "Current password is incorrect", variant: "destructive" });
      return;
    }
    if (pw.next.length < 6) {
      toast({ title: "New password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (pw.next !== pw.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (pw.next === "temp") {
      toast({ title: "Cannot reuse the default password", variant: "destructive" });
      return;
    }
    try {
      const updated = await updateUser({ id: user.id, password: pw.next, fpc: false });
      refreshUser(updated);
      toast({ title: "Password changed successfully" });
      setPw({ current: "", next: "", confirm: "" });
    } catch {
      toast({ title: "Failed to update password", variant: "destructive" });
    }
  };

  const tabs = [
    { key: "profile" as const, label: "Profile", icon: UserCircle },
    { key: "password" as const, label: "Change Password", icon: KeyRound },
    ...(user.role === "admin" ? [
      { key: "payroll" as const, label: "Payroll Rules", icon: DollarSign },
      { key: "geofence" as const, label: "Geofences", icon: MapPin },
    ] : []),
  ];

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Account, security, and system configuration</p>
      </div>

      {/* Tab Nav */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            data-testid={`settings-tab-${key}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* PROFILE TAB */}
      {activeTab === "profile" && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-6 pb-5 border-b border-border">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
                {user.av || user.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground text-sm font-mono">{user.userId}</p>
                <Badge className="mt-1 capitalize">{user.role}</Badge>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { icon: UserCircle, label: "Role", value: user.role },
                { icon: Building2, label: "Department", value: user.dept },
                { icon: Shield, label: "Position", value: user.pos },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
              {user.email && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{user.email}</span>
                </div>
              )}
              {user.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{user.phone}</span>
                </div>
              )}
              {user.joined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Joined</span>
                  <span className="font-medium">{user.joined}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-3">Authorized Work Locations</h3>
            <p className="text-xs text-muted-foreground mb-4">These are the geofenced zones you are authorized to clock in from.</p>
            <div className="flex flex-wrap gap-2">
              {user.geo && user.geo.length > 0 ? (
                user.geo.map((zone, i) => (
                  <Badge key={i} variant="secondary" className="text-sm" data-testid={`zone-badge-${zone}`}>{zone}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground italic">No specific locations assigned.</span>
              )}
            </div>

            {user.fa && (
              <div className="mt-5 pt-4 border-t border-border">
                <h3 className="font-semibold text-sm mb-3">Reporting Chain</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">1st Sign-off</span>
                    <span className="font-medium">{user.fa}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">2nd Sign-off</span>
                    <span className="font-medium">{user.sa}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* PASSWORD TAB */}
      {activeTab === "password" && (
        <Card className="p-6 max-w-md">
          <h3 className="font-semibold mb-4">Change Password</h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Current Password</Label>
              <Input
                id="current-pw"
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                placeholder="Your current password"
                data-testid="input-current-pw"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New Password</Label>
              <Input
                id="new-pw"
                type="password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                placeholder="At least 6 characters"
                data-testid="input-new-pw"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                placeholder="Repeat new password"
                data-testid="input-confirm-pw"
                required
              />
            </div>
            <Button type="submit" disabled={isPending} className="w-full" data-testid="button-change-password">
              {isPending ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </Card>
      )}

      {/* PAYROLL RULES TAB (Admin only) */}
      {activeTab === "payroll" && user.role === "admin" && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Guyana 2026 Payroll Configuration</h3>
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-3">
                These values reflect the current Guyana 2026 statutory requirements. Changes require a system update.
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {[
                    ["Employee NIS Rate", `${(PAYROLL_CONSTANTS.NIS_EMP_RATE * 100).toFixed(1)}%`],
                    ["Employer NIS Rate", `${(PAYROLL_CONSTANTS.NIS_ER_RATE * 100).toFixed(1)}%`],
                    ["NIS Earnings Ceiling", `GYD ${PAYROLL_CONSTANTS.NIS_CEILING_MONTHLY.toLocaleString()}/month`],
                    ["Personal Allowance", `GYD ${PAYROLL_CONSTANTS.PERSONAL_ALLOWANCE.toLocaleString()}/month`],
                    ["PAYE Rate", `${(PAYROLL_CONSTANTS.PAYE_RATE * 100).toFixed(0)}%`],
                    ["Overtime Multiplier", `${PAYROLL_CONSTANTS.OT_MULTIPLIER}x`],
                    ["Working Hours/Month", `${PAYROLL_CONSTANTS.WORKING_HOURS_PER_MONTH}h`],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td className="py-2 text-muted-foreground">{label}</td>
                      <td className="py-2 text-right font-semibold">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Pay Categories</h3>
            <div className="space-y-3 text-sm">
              {[
                { name: "Time", desc: "Hourly rate × hours worked. OT at 1.5x for hours > 8/day." },
                { name: "Fixed", desc: "Monthly salary. Eligible for OT calculated at salary ÷ 176h × 1.5x." },
                { name: "Executive", desc: "Monthly salary. OT typically excluded unless configured." },
              ].map(({ name, desc }) => (
                <div key={name} className="p-3 border border-border rounded-md">
                  <Badge variant="outline" className="mb-1.5">{name}</Badge>
                  <p className="text-muted-foreground text-xs">{desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* GEOFENCE TAB (Admin only) */}
      {activeTab === "geofence" && user.role === "admin" && (
        <Card className="p-6">
          <h3 className="font-semibold mb-1">Work Zone Geofences</h3>
          <p className="text-xs text-muted-foreground mb-5">These are the GPS coordinates and radius for each authorized work location. Employees must be within the radius to clock in.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(GEOFENCES).map(([name, { lat, lng, radius }]) => (
              <div key={name} className="border border-border rounded-md p-4" data-testid={`geofence-${name}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">{radius}m radius</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </p>
                <div className="mt-2">
                  <a
                    href={`https://maps.google.com/?q=${lat},${lng}&z=16`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline"
                  >
                    View on Google Maps
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Layout>
  );
}
