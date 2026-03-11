import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser } from "@/hooks/use-users";
import { useGeofences, useCreateGeofence, useUpdateGeofence, useDeleteGeofence } from "@/hooks/use-geofences";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Shield, Building2, UserCircle, KeyRound, MapPin, DollarSign,
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Map, Smartphone,
} from "lucide-react";
import GeofenceMapModal from "@/components/GeofenceMapModal";
import { useToast } from "@/hooks/use-toast";
import { PAYROLL_CONSTANTS } from "@/lib/payroll";
import type { Geofence } from "@shared/schema";
import { QRCodeSVG } from "qrcode.react";

const EMPTY_FENCE = { name: "", lat: "", lng: "", radius: "150", posts: "10", postNames: "", description: "", active: true };

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { mutateAsync: updateUser, isPending } = useUpdateUser();
  const { data: geofences, isLoading: loadingFences } = useGeofences();
  const { mutateAsync: createGeofence, isPending: creating } = useCreateGeofence();
  const { mutateAsync: updateGeofence, isPending: updating } = useUpdateGeofence();
  const { mutateAsync: deleteGeofence } = useDeleteGeofence();
  const { toast } = useToast();

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [activeTab, setActiveTab] = useState<"profile" | "password" | "payroll" | "geofence" | "install">("profile");

  // Geofence map preview
  const [mapZone, setMapZone] = useState<Geofence | null>(null);

  // Geofence modal state
  const [fenceModal, setFenceModal] = useState<{ mode: "create" | "edit"; data: typeof EMPTY_FENCE & { id?: number } } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Geofence | null>(null);

  if (!user) return null;

  // ── Password change ────────────────────────────────────────────────────────
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.current !== user.password) { toast({ title: "Current password incorrect", variant: "destructive" }); return; }
    if (pw.next.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    if (pw.next !== pw.confirm) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    if (pw.next === "temp") { toast({ title: "Cannot reuse the default password", variant: "destructive" }); return; }
    try {
      const updated = await updateUser({ id: user.id, password: pw.next, fpc: false });
      refreshUser(updated);
      toast({ title: "Password updated successfully" });
      setPw({ current: "", next: "", confirm: "" });
    } catch { toast({ title: "Failed to update password", variant: "destructive" }); }
  };

  // ── Geofence CRUD ──────────────────────────────────────────────────────────
  const openCreate = () => setFenceModal({ mode: "create", data: { ...EMPTY_FENCE } });
  const openEdit = (g: Geofence) => setFenceModal({ mode: "edit", data: { id: g.id, name: g.name, lat: String(g.lat), lng: String(g.lng), radius: String(g.radius), posts: String(g.posts ?? 10), postNames: (g.postNames ?? []).join("\n"), description: g.description ?? "", active: g.active } });

  const handleFenceSave = async () => {
    if (!fenceModal) return;
    const { name, lat, lng, radius, posts, postNames, description, active, id } = fenceModal.data;
    if (!name.trim()) { toast({ title: "Zone name is required", variant: "destructive" }); return; }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseInt(radius);
    // Parse named posts (one per line), fall back to numbered count
    const parsedNames = postNames.trim()
      ? postNames.split("\n").map((s) => s.trim()).filter(Boolean)
      : null;
    const postsNum = parsedNames ? parsedNames.length : Math.max(1, Math.min(50, parseInt(posts) || 10));
    if (isNaN(latNum) || isNaN(lngNum)) { toast({ title: "Enter valid GPS coordinates", variant: "destructive" }); return; }
    if (isNaN(radiusNum) || radiusNum < 10) { toast({ title: "Radius must be at least 10 metres", variant: "destructive" }); return; }
    try {
      if (fenceModal.mode === "create") {
        await createGeofence({ name: name.trim(), lat: latNum, lng: lngNum, radius: radiusNum, posts: postsNum, postNames: parsedNames ?? undefined, description: description || null, active });
        toast({ title: "Geofence zone created" });
      } else {
        await updateGeofence({ id: id!, name: name.trim(), lat: latNum, lng: lngNum, radius: radiusNum, posts: postsNum, postNames: parsedNames ?? undefined, description: description || null, active });
        toast({ title: "Geofence zone updated" });
      }
      setFenceModal(null);
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (g: Geofence) => {
    try {
      await updateGeofence({ id: g.id, active: !g.active });
      toast({ title: g.active ? "Zone deactivated" : "Zone activated" });
    } catch { toast({ title: "Failed to toggle zone", variant: "destructive" }); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteGeofence(deleteConfirm.id);
      toast({ title: "Geofence zone deleted" });
      setDeleteConfirm(null);
    } catch { toast({ title: "Failed to delete zone", variant: "destructive" }); }
  };

  const isFullAccess = user.role === "admin" || user.role === "manager";

  const tabs = [
    { key: "profile" as const, label: "Profile", icon: UserCircle },
    { key: "password" as const, label: "Password", icon: KeyRound },
    ...(isFullAccess ? [
      { key: "payroll" as const, label: "Payroll Rules", icon: DollarSign },
      { key: "geofence" as const, label: "Geofences", icon: MapPin },
    ] : []),
    { key: "install" as const, label: "Install App", icon: Smartphone },
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

      {/* ── PROFILE ────────────────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-5 pb-4 border-b border-border">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
                {user.av || user.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground text-sm font-mono">{user.userId}</p>
                <Badge className="mt-1 capitalize text-xs">{user.role}</Badge>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { icon: UserCircle, label: "Role", value: user.role },
                { icon: Building2, label: "Department", value: user.dept },
                { icon: Shield, label: "Position", value: user.pos },
                ...(user.email ? [{ icon: UserCircle, label: "Email", value: user.email }] : []),
                ...(user.phone ? [{ icon: UserCircle, label: "Phone", value: user.phone }] : []),
                ...(user.joined ? [{ icon: UserCircle, label: "Joined", value: user.joined }] : []),
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-1 text-sm">Authorized Work Zones</h3>
            <p className="text-xs text-muted-foreground mb-4">Geofenced locations you can clock in from.</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {user.geo && user.geo.length > 0 ? (
                user.geo.map((zone, i) => <Badge key={i} variant="secondary">{zone}</Badge>)
              ) : (
                <span className="text-sm text-muted-foreground italic">No locations assigned.</span>
              )}
            </div>
            {(user.fa || user.sa) && (
              <div className="pt-4 border-t border-border">
                <h3 className="font-semibold text-sm mb-3">Approval Chain</h3>
                <div className="space-y-2 text-sm">
                  {user.fa && <div className="flex justify-between"><span className="text-muted-foreground">1st Approver</span><span className="font-medium">{user.fa}</span></div>}
                  {user.sa && <div className="flex justify-between"><span className="text-muted-foreground">2nd Approver</span><span className="font-medium">{user.sa}</span></div>}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── PASSWORD ───────────────────────────────────────────────────────── */}
      {activeTab === "password" && (
        <Card className="p-6 max-w-md">
          <h3 className="font-semibold mb-4">Change Password</h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" data-testid="input-current-pw" required />
            </div>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="At least 6 characters" data-testid="input-new-pw" required />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Repeat new password" data-testid="input-confirm-pw" required />
            </div>
            <Button type="submit" disabled={isPending} className="w-full" data-testid="button-change-password">
              {isPending ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </Card>
      )}

      {/* ── PAYROLL RULES (full access) ─────────────────────────────────────── */}
      {activeTab === "payroll" && isFullAccess && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Guyana 2026 Payroll Configuration</h3>
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              Current statutory values for Guyana 2026. Updates require a system release.
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {[
                  ["Employee NIS Rate", `${(PAYROLL_CONSTANTS.NIS_EMP_RATE * 100).toFixed(1)}%`],
                  ["Employer NIS Rate", `${(PAYROLL_CONSTANTS.NIS_ER_RATE * 100).toFixed(1)}%`],
                  ["NIS Earnings Ceiling", `GYD ${PAYROLL_CONSTANTS.NIS_CEILING_MONTHLY.toLocaleString()}/month`],
                  ["Personal Allowance (PAYE)", `GYD ${PAYROLL_CONSTANTS.PERSONAL_ALLOWANCE.toLocaleString()}/month`],
                  ["PAYE Rate", `${(PAYROLL_CONSTANTS.PAYE_RATE * 100).toFixed(0)}%`],
                  ["Overtime Multiplier", `${PAYROLL_CONSTANTS.OT_MULTIPLIER}×`],
                  ["Standard Working Hours", `${PAYROLL_CONSTANTS.WORKING_HOURS_PER_MONTH}h/month`],
                ].map(([label, value]) => (
                  <tr key={label}><td className="py-2.5 text-muted-foreground">{label}</td><td className="py-2.5 text-right font-semibold">{value}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Pay Categories</h3>
            {[
              { name: "Time", desc: "Hourly rate × hours. OT = hours beyond 8/day at 1.5×." },
              { name: "Fixed", desc: "Monthly salary. OT eligible: (salary ÷ 176h) × OT hrs × 1.5×." },
              { name: "Executive", desc: "Monthly salary. OT typically excluded by policy." },
            ].map(({ name, desc }) => (
              <div key={name} className="mb-3 p-3 border border-border rounded-md">
                <Badge variant="outline" className="mb-1.5">{name}</Badge>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ── GEOFENCES (full access) ────────────────────────────────────────── */}
      {activeTab === "geofence" && isFullAccess && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Work Zone Geofences</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Define GPS zones where employees are permitted to clock in.</p>
            </div>
            <Button onClick={openCreate} data-testid="button-add-geofence">
              <Plus className="w-4 h-4 mr-2" /> Add Zone
            </Button>
          </div>

          {loadingFences ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : !geofences || geofences.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-md text-muted-foreground text-sm">
              No geofence zones configured yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {geofences.map((g) => (
                <Card key={g.id} className={`p-4 ${!g.active ? "opacity-60" : ""}`} data-testid={`geofence-card-${g.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${g.active ? "bg-green-100" : "bg-muted"}`}>
                        <MapPin className={`w-4 h-4 ${g.active ? "text-green-600" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{g.name}</p>
                        {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={g.active ? "default" : "secondary"} className="text-xs">
                        {g.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground font-mono mb-3 space-y-0.5">
                    <p>Lat: {g.lat.toFixed(6)} · Lng: {g.lng.toFixed(6)}</p>
                    <p>Radius: <strong className="text-foreground">{g.radius}m</strong> · {g.postNames?.length ? <><strong className="text-foreground">{g.postNames.length}</strong> named posts</> : <><strong className="text-foreground">{g.posts ?? 10}</strong> numbered posts</>}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMapZone(g)}
                      className="text-xs text-primary flex items-center gap-1 hover:underline font-medium"
                      data-testid={`button-map-${g.id}`}
                    >
                      <Map className="w-3 h-3" /> View Map
                    </button>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleActive(g)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title={g.active ? "Deactivate zone" : "Activate zone"}
                        data-testid={`button-toggle-${g.id}`}
                      >
                        {g.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => openEdit(g)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1"
                        data-testid={`button-edit-${g.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(g)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        data-testid={`button-delete-${g.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Help text */}
          <Card className="p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <strong>How to get GPS coordinates:</strong> Open{" "}
              <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Maps</a>,
              right-click on the location, and copy the coordinates. Paste the latitude and longitude here.
              Set the radius to match the size of the work area (e.g. 50m for a building, 200m for a compound).
            </p>
          </Card>
        </div>
      )}

      {/* ── Geofence Create/Edit Modal ───────────────────────────────────────── */}
      <Dialog open={!!fenceModal} onOpenChange={() => setFenceModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{fenceModal?.mode === "create" ? "Add New Work Zone" : "Edit Work Zone"}</DialogTitle>
          </DialogHeader>
          {fenceModal && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Zone Name <span className="text-destructive">*</span></Label>
                <Input
                  value={fenceModal.data.name}
                  onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, name: e.target.value } })}
                  placeholder="e.g. HEAD OFFICE, WAREHOUSE A"
                  data-testid="input-fence-name"
                  disabled={fenceModal.mode === "edit"}
                />
                {fenceModal.mode === "edit" && (
                  <p className="text-xs text-muted-foreground">Zone names cannot be changed after creation (employees reference them).</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={fenceModal.data.description}
                  onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, description: e.target.value } })}
                  placeholder="e.g. Main office building, Georgetown"
                  data-testid="input-fence-desc"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Latitude <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    step="any"
                    value={fenceModal.data.lat}
                    onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, lat: e.target.value } })}
                    placeholder="6.813348"
                    data-testid="input-fence-lat"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    step="any"
                    value={fenceModal.data.lng}
                    onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, lng: e.target.value } })}
                    placeholder="-58.147854"
                    data-testid="input-fence-lng"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Radius (metres) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min={10}
                    max={5000}
                    value={fenceModal.data.radius}
                    onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, radius: e.target.value } })}
                    placeholder="150"
                    data-testid="input-fence-radius"
                  />
                  <p className="text-xs text-muted-foreground">50–150m building, 200–500m compound</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Numbered Posts (fallback)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={fenceModal.data.posts}
                    onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, posts: e.target.value } })}
                    placeholder="10"
                    data-testid="input-fence-posts"
                    disabled={!!fenceModal.data.postNames.trim()}
                  />
                  <p className="text-xs text-muted-foreground">Used only if no named posts below</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Named Posts (one per line)</Label>
                <Textarea
                  value={fenceModal.data.postNames}
                  onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, postNames: e.target.value } })}
                  placeholder={"Neptune P1\nNeptune P2\nRainbow 1\n..."}
                  rows={6}
                  className="text-sm font-mono"
                  data-testid="textarea-fence-post-names"
                />
                <p className="text-xs text-muted-foreground">Enter custom post names, one per line. Leave blank to use numbered posts.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fence-active"
                  checked={fenceModal.data.active}
                  onChange={(e) => setFenceModal({ ...fenceModal, data: { ...fenceModal.data, active: e.target.checked } })}
                  data-testid="checkbox-fence-active"
                />
                <Label htmlFor="fence-active" className="cursor-pointer">Zone is active (employees can clock in here)</Label>
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setFenceModal(null)}>Cancel</Button>
                <Button onClick={handleFenceSave} disabled={creating || updating} data-testid="button-save-fence">
                  {creating || updating ? "Saving..." : fenceModal.mode === "create" ? "Create Zone" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── INSTALL APP ─────────────────────────────────────────────────────── */}
      {activeTab === "install" && (
        <div className="max-w-xl mx-auto space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Install on Your Phone</h2>
                <p className="text-xs text-muted-foreground">Scan to open, then install as an app</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-5">
              <div className="p-4 bg-white rounded-xl border border-border shadow-sm" data-testid="qr-code-container">
                <QRCodeSVG
                  value={window.location.origin}
                  size={220}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                  includeMargin={false}
                />
              </div>

              <p className="text-xs text-center text-muted-foreground font-mono break-all px-2">
                {window.location.origin}
              </p>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg border border-border p-4 bg-muted/30">
                  <p className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <span className="text-base">🤖</span> Android
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open in <strong>Chrome</strong></li>
                    <li>Tap the <strong>⋮ menu</strong> (top-right)</li>
                    <li>Tap <strong>"Add to Home screen"</strong></li>
                    <li>Tap <strong>Install</strong></li>
                  </ol>
                </div>
                <div className="rounded-lg border border-border p-4 bg-muted/30">
                  <p className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <span className="text-base">🍎</span> iPhone / iPad
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open in <strong>Safari</strong></li>
                    <li>Tap the <strong>Share</strong> button</li>
                    <li>Tap <strong>"Add to Home Screen"</strong></li>
                    <li>Tap <strong>Add</strong></li>
                  </ol>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center pt-1">
                Once installed, the app opens full-screen without the browser bar — just like a native app.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── Geofence Map Preview ─────────────────────────────────────────────── */}
      {mapZone && (
        <GeofenceMapModal
          zone={mapZone}
          allZones={geofences ?? []}
          onClose={() => setMapZone(null)}
          onSaveLocation={async (id, lat, lng) => {
            await updateGeofence({ id, lat, lng });
            toast({ title: "Zone center updated", description: `${mapZone.name} repositioned successfully.` });
          }}
        />
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Zone</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the <strong>{deleteConfirm?.name}</strong> zone?
            Employees assigned to this zone will no longer be able to clock in here.
          </p>
          <div className="flex gap-2 justify-end mt-3">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete-fence">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
