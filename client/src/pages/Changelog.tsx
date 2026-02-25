import { Layout } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollText, Bug, Zap, Shield, Wrench } from "lucide-react";

const entries = [
  {
    version: "1.6.0",
    date: "2026-02-25",
    changes: [
      { type: "feat",  text: "Changelog page added to track all system changes" },
      { type: "feat",  text: "Server-side date-range filtering and pagination on timesheets API — system can handle years of historical data efficiently" },
      { type: "feat",  text: "Timesheets page: month picker, date range filter, and Load More pagination" },
      { type: "feat",  text: "Responsive layout for all devices — mobile bottom navigation bar on phones and tablets" },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-02-25",
    changes: [
      { type: "fix",  text: "Clock In / Clock Out widget no longer locks after first shift of the day — employees can clock in and out multiple times per day, each generating a separate timesheet record" },
      { type: "feat", text: "Amber 'Review & Sign' banner appears below clock widget when completed shifts need signing, with smart count if multiple shifts are pending" },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-02-25",
    changes: [
      { type: "feat", text: "Shift Supervisor portal: 'Active Officers' tab on Dashboard showing real-time on-duty list with elapsed timers" },
      { type: "feat", text: "Supervisors can edit times, add notes, and apply 1st sign-off directly from the Active Officers panel" },
      { type: "feat", text: "Timesheets page now shows supervisors' direct reports' records alongside their own" },
      { type: "feat", text: "Confirmation that signing chain is Employee → Shift Supervisor → General Manager" },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-02-25",
    changes: [
      { type: "feat",    text: "Employee timesheet sign-off now blocked until after clock-out — 'Shift in progress' badge shown instead" },
      { type: "feat",    text: "Review & Sign modal: employees can edit clock-in/out times, break duration, and add notes before signing — hours update in real time" },
      { type: "feat",    text: "Once an employee signs, the record is locked with a lock icon and cannot be edited by the employee" },
      { type: "security", text: "Admin Edit Override: admin and Junior General Manager can edit any locked timesheet — all changes logged with timestamp, editor name, and reason" },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-02-25",
    changes: [
      { type: "feat", text: "Interactive geofence map using OpenStreetMap — admin can preview zone radius and click to reposition" },
      { type: "fix",  text: "HEAD OFFICE and CANTEEN GPS coordinates corrected to actual location (6.80680, -58.15420)" },
      { type: "fix",  text: "All geofence zone radii restored to 100 m" },
      { type: "feat", text: "Work location dropdown on clock-in widget dynamically populated from active geofences in database" },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-02-24",
    changes: [
      { type: "feat",    text: "Employee directory with checkbox mass-select, individual and bulk delete" },
      { type: "feat",    text: "Reset credentials button: sets password to 'temp' and forces password change on next login" },
      { type: "feat",    text: "Inline status badge in employee list for accounts with temporary passwords" },
      { type: "security", text: "DELETE /api/users/:id endpoint with safeguards" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-02-20",
    changes: [
      { type: "feat", text: "Initial release: GPS geofenced clock in / clock out" },
      { type: "feat", text: "Dual electronic signature approval workflow (employee → 1st approver → 2nd approver)" },
      { type: "feat", text: "Guyana 2026 compliant payroll engine: NIS 5.6% / 8.4%, PAYE 28%, GYD 100k personal allowance, 1.5× OT" },
      { type: "feat", text: "QuickBooks CSV export from payroll module" },
      { type: "feat", text: "Leave, overtime, and shift swap request management" },
      { type: "feat", text: "Admin employee directory and Settings panel" },
      { type: "feat", text: "Role-based access: Employee, Shift Supervisor, Manager, Admin" },
    ],
  },
];

const typeConfig: Record<string, { label: string; color: string; icon: any }> = {
  feat:     { label: "Feature",  color: "bg-blue-100 text-blue-700 border-blue-200",    icon: Zap },
  fix:      { label: "Fix",      color: "bg-green-100 text-green-700 border-green-200",  icon: Bug },
  security: { label: "Security", color: "bg-purple-100 text-purple-700 border-purple-200", icon: Shield },
  improve:  { label: "Improve",  color: "bg-amber-100 text-amber-700 border-amber-200",  icon: Wrench },
};

export default function Changelog() {
  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-md bg-primary/10">
          <ScrollText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Changelog</h1>
          <p className="text-muted-foreground text-sm">FMS Timetrack — system update history</p>
        </div>
      </div>

      <div className="space-y-6">
        {entries.map((entry) => (
          <Card key={entry.version} className="overflow-hidden" data-testid={`changelog-${entry.version}`}>
            <div className="flex items-center gap-4 px-5 py-4 border-b border-border bg-muted/30">
              <div>
                <span className="font-bold text-base">v{entry.version}</span>
                <span className="text-muted-foreground text-sm ml-3">{entry.date}</span>
              </div>
              <Badge variant="secondary" className="text-xs ml-auto">
                {entry.changes.length} change{entry.changes.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <ul className="divide-y divide-border">
              {entry.changes.map((change, i) => {
                const cfg = typeConfig[change.type] ?? typeConfig.feat;
                const Icon = cfg.icon;
                return (
                  <li key={i} className="flex items-start gap-3 px-5 py-3">
                    <span className={`mt-0.5 text-xs px-2 py-0.5 rounded border font-medium shrink-0 flex items-center gap-1 ${cfg.color}`}>
                      <Icon className="w-3 h-3" />{cfg.label}
                    </span>
                    <span className="text-sm">{change.text}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
