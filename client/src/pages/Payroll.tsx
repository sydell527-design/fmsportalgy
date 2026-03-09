import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useUsers } from "@/hooks/use-users";
import { useUpdateUser } from "@/hooks/use-users";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useAllChildren } from "@/hooks/use-children";
import { useAuth } from "@/hooks/use-auth";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/use-settings";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Redirect } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Download, FileText, TrendingUp, DollarSign, Building2, ShieldCheck,
  Upload, FileSpreadsheet, CheckCircle2, XCircle, Clock, AlertCircle, Settings2, Send,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  calcPayroll, formatGYD, generateQuickBooksCSV, downloadCSV,
  PAYROLL_CONSTANTS, periodDates,
} from "@/lib/payroll";
import { downloadPayslipPDF, computeYTD } from "@/lib/payslip-pdf";
import { PayslipLandscape } from "@/components/PayslipLandscape";
import { format } from "date-fns";
import type { PayrollResult, PeriodDeductionOverride } from "@/lib/payroll";
import type { Payslip, PeriodDeduction } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import * as XLSX from "xlsx";

const C = PAYROLL_CONSTANTS;

function Row({ label, value, sub, red, bold, indent, muted }: {
  label: string; value: string; sub?: string;
  red?: boolean; bold?: boolean; indent?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex justify-between items-baseline ${indent ? "pl-4" : ""}`}>
      <span className={`${bold ? "font-semibold" : muted ? "text-muted-foreground text-xs" : "text-muted-foreground"} ${indent ? "text-xs" : "text-sm"}`}>
        {label}
        {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </span>
      <span className={`font-mono ${indent ? "text-xs" : "text-sm"} ${red ? "text-red-600 font-medium" : bold ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Divider({ label }: { label?: string }) {
  if (label) return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
  return <div className="h-px bg-border my-1" />;
}

type UploadRow = { eid: string; name: string; creditUnion: number; salaryAdvance: number; otherName: string; otherAmount: number };
type UploadResult = { eid: string; name: string; status: "ok" | "error"; message: string };

export default function Payroll() {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { data: allChildren = [] } = useAllChildren();
  const { data: companySettingsData } = useCompanySettings();
  const { mutateAsync: saveSettings, isPending: savingSettings } = useUpdateCompanySettings();

  const now = new Date();
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);   // 1-based
  const yearMonth = `${selYear}-${String(selMonth).padStart(2, "0")}`;
  const [half, setHalf] = useState<"1" | "2">("1");
  const [selectedResult, setSelectedResult] = useState<PayrollResult | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<"all" | string>("all");

  const { data: allPayslips = [] } = useQuery<Payslip[]>({ queryKey: ["/api/payslips"] });

  // ── Period key & one-time deductions ──────────────────────────────────
  // Period key format: "YYYY-MM-H" e.g. "2026-01-1" or "2026-01-2"
  const periodKey = `${yearMonth}-${half}`;

  const { data: rawPeriodDeductions = [] } = useQuery<PeriodDeduction[]>({
    queryKey: ["/api/period-deductions", periodKey],
    queryFn: () => fetch(`/api/period-deductions?period=${periodKey}`).then((r) => r.json()),
  });

  // Build a map of eid → PeriodDeductionOverride for use in calcPayroll
  const periodDeductionMap: Record<string, PeriodDeductionOverride> = {};
  for (const pd_ of rawPeriodDeductions) {
    periodDeductionMap[pd_.eid] = {
      advancesRecovery: pd_.advancesRecovery ?? 0,
      otherDeductions: pd_.otherDeductions ?? [],
    };
  }

  const { mutateAsync: sendPayslips, isPending: sending } = useMutation({
    mutationFn: (payload: { sentBy: string; payslips: Array<{ eid: string; period: string; periodStart: string; periodEnd: string; data: unknown }> }) =>
      apiRequest("POST", "/api/payslips/send", payload),
  });
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  // Company-level personal allowance threshold (GYD/month)
  const companyPA = companySettingsData?.personalAllowance ?? C.PERSONAL_ALLOWANCE;
  const [paEdit, setPaEdit] = useState<number | "">("");

  if (user?.role === "employee") return <Redirect to="/" />;

  // ── Compute exact date range for the selected period ────────────────────
  const pd = periodDates(yearMonth, half);

  // ── Carry-forward window: up to 6 days before period start (partial week) ─
  const cfWindowEnd   = (() => { const d = new Date(pd.start + "T00:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const cfWindowStart = (() => { const d = new Date(pd.start + "T00:00:00"); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();

  // ── Fetch timesheets for this period and for the carry-forward window ──
  const { data: timesheets = [] } = useTimesheets({
    startDate: pd.start,
    endDate:   pd.end,
  });
  const { data: cfTimesheets = [] } = useTimesheets({
    startDate: cfWindowStart,
    endDate:   cfWindowEnd,
  });

  // ── Compute payroll for all active non-admin employees ────────────────
  const activeEmployees = (users ?? []).filter((u) => u.status === "active" && u.role !== "admin");

  const allResults = activeEmployees.map((emp) =>
    calcPayroll(emp, timesheets, pd.start, pd.end, allChildren, pd.label, companyPA, cfTimesheets, periodDeductionMap[emp.userId])
  );

  // Show employees who have at least one approved timesheet in this period
  const results = allResults.filter((r) => r.approvedTimesheets > 0);

  // Employees with only pending timesheets (not yet approvable)
  const pendingOnly = allResults.filter(
    (r) => r.approvedTimesheets === 0 && r.pendingTimesheets > 0
  );

  const totals = results.reduce(
    (acc, r) => ({
      gross:       acc.gross       + r.grossPay,
      nis:         acc.nis         + r.employeeNIS,
      health:      acc.health      + r.healthSurcharge,
      paye:        acc.paye        + r.paye,
      voluntary:   acc.voluntary   + r.totalVoluntary,
      net:         acc.net         + r.netPay,
      employerNIS: acc.employerNIS + r.employerNIS,
      regHrs:      acc.regHrs      + r.regularHours,
      otHrs:       acc.otHrs       + r.otHours,
    }),
    { gross: 0, nis: 0, health: 0, paye: 0, voluntary: 0, net: 0, employerNIS: 0, regHrs: 0, otHrs: 0 }
  );

  const handleExport = () => {
    if (results.length === 0) return;
    downloadCSV(
      generateQuickBooksCSV(results),
      `FMS_Payroll_${pd.start}_${pd.end}.csv`
    );
  };

  // ── Deductions upload ─────────────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = [
      "Employee ID", "Full Name",
      "Credit Union (standing — every period)",
      "Salary Advance (one-time — this period only)",
      "Other Deduction Name (one-time)", "Other Deduction Amount (one-time)",
    ];
    const rows = (users ?? [])
      .filter((u) => u.status === "active" && u.role !== "admin")
      .map((u) => {
        const periodOvr = periodDeductionMap[u.userId];
        return [
          u.userId, u.name,
          u.payConfig?.creditUnion ?? 0,
          periodOvr?.advancesRecovery ?? 0,
          periodOvr?.otherDeductions?.[0]?.name ?? "",
          periodOvr?.otherDeductions?.[0]?.amount ?? 0,
        ];
      });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 32 }, { wch: 28 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deductions");
    XLSX.writeFile(wb, `FMS_Deductions_${periodKey}.xlsx`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResults([]);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      const out: UploadResult[] = [];
      for (const row of rows) {
        const eid = String(row["Employee ID"] ?? row["employee_id"] ?? row["eid"] ?? "").trim();
        const empName = String(row["Full Name"] ?? row["full_name"] ?? row["name"] ?? "").trim();
        if (!eid) continue;
        const emp = (users ?? []).find((u) => u.userId === eid);
        if (!emp) { out.push({ eid, name: empName || eid, status: "error", message: "Employee ID not found" }); continue; }

        // Credit union — standing, stored in pay_config (applies every period)
        const creditUnion = Number(
          row["Credit Union (standing — every period)"] ?? row["Credit Union"] ?? row["credit_union"] ?? 0
        ) || 0;

        // One-time deductions — stored in period_deductions for this period only
        const salaryAdvance = Number(
          row["Salary Advance (one-time — this period only)"] ?? row["Salary Advance"] ?? row["salary_advance"] ?? 0
        ) || 0;
        const otherName = String(
          row["Other Deduction Name (one-time)"] ?? row["Other Deduction Name"] ?? row["other_deduction_name"] ?? ""
        ).trim();
        const otherAmount = Number(
          row["Other Deduction Amount (one-time)"] ?? row["Other Deduction Amount"] ?? row["other_deduction_amount"] ?? 0
        ) || 0;
        const newOthers = otherName && otherAmount > 0
          ? [{ name: otherName, amount: otherAmount }]
          : [];

        try {
          // 1. Save credit union to pay_config (standing)
          await updateUser({
            id: emp.id,
            ...emp,
            payConfig: { ...emp.payConfig, creditUnion } as any,
          });

          // 2. Save one-time deductions to period_deductions for this period
          await fetch("/api/period-deductions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eid,
              period: periodKey,
              advancesRecovery: salaryAdvance,
              otherDeductions: newOthers,
            }),
          });

          out.push({
            eid,
            name: emp.name,
            status: "ok",
            message: `CU (standing): ${creditUnion} | Advance (${periodKey}): ${salaryAdvance}${otherName ? ` | ${otherName}: ${otherAmount}` : ""}`,
          });
        } catch {
          out.push({ eid, name: emp.name, status: "error", message: "Failed to save" });
        }
      }
      // Refresh period deductions cache
      await queryClient.invalidateQueries({ queryKey: ["/api/period-deductions", periodKey] });
      setUploadResults(out);
    } catch {
      setUploadResults([{ eid: "", name: "", status: "error", message: "Could not parse file — ensure it is .xlsx or .csv" }]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const yearRange = Array.from({ length: 10 }, (_, i) => now.getFullYear() - 4 + i);

  return (
    <Layout>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Guyana 2026 compliant · approved timesheets only · {pd.label}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month picker */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={selMonth}
            onChange={(e) => setSelMonth(Number(e.target.value))}
            data-testid="select-payroll-month"
          >
            {MONTHS.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          {/* Year picker */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={selYear}
            onChange={(e) => setSelYear(Number(e.target.value))}
            data-testid="select-payroll-year"
          >
            {yearRange.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {/* Period half picker */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={half}
            onChange={(e) => setHalf(e.target.value as "1" | "2")}
            data-testid="select-payroll-period"
          >
            <option value="1">Period 1 (1st – 15th)</option>
            <option value="2">Period 2 (16th – end)</option>
          </select>
          <Button variant="outline" onClick={() => { setPaEdit(companyPA); setSettingsOpen(true); }} data-testid="button-payroll-settings">
            <Settings2 className="w-4 h-4 mr-2" /> Settings
          </Button>
          <Button variant="outline" onClick={() => setUploadOpen(true)} data-testid="button-upload-deductions">
            <Upload className="w-4 h-4 mr-2" /> Upload Deductions
          </Button>
          <Button onClick={handleExport} disabled={results.length === 0} data-testid="button-export-quickbooks">
            <Download className="w-4 h-4 mr-2" /> QuickBooks CSV
          </Button>
          <Button variant="secondary" onClick={() => { setSendTarget("all"); setSendOpen(true); }} disabled={results.length === 0} data-testid="button-send-payslips">
            <Send className="w-4 h-4 mr-2" /> Send Payslip
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={handleFileUpload} data-testid="input-deductions-file" />

      {/* ── Upload Deductions Dialog ──────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" /> Upload Deductions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Uploading deductions for <span className="font-semibold">{pd.label}</span>
              </p>
            </div>
            <div className="bg-muted/40 rounded-md p-3 text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground text-[11px] uppercase tracking-wide mb-1">Column guide</p>
              <p>• <span className="font-semibold text-foreground">Employee ID</span> — must match system ID</p>
              <p>• <span className="font-semibold text-foreground">Full Name</span> — reference only</p>
              <p>• <span className="font-semibold text-green-700 dark:text-green-400">Credit Union (standing)</span> — saves to employee profile, applies every period</p>
              <p>• <span className="font-semibold text-amber-700 dark:text-amber-400">Salary Advance (one-time)</span> — applies to <strong>{pd.label}</strong> only</p>
              <p>• <span className="font-semibold text-amber-700 dark:text-amber-400">Other Deduction Name / Amount (one-time)</span> — applies to <strong>{pd.label}</strong> only</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={downloadTemplate} data-testid="button-download-template">
                <Download className="w-4 h-4 mr-2" /> Download Template
              </Button>
              <Button className="flex-1" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-choose-file">
                <Upload className="w-4 h-4 mr-2" /> {uploading ? "Processing…" : "Choose File"}
              </Button>
            </div>
            {uploadResults.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {uploadResults.filter((r) => r.status === "ok").length} updated · {uploadResults.filter((r) => r.status === "error").length} errors
                </p>
                {uploadResults.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${r.status === "ok" ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                    {r.status === "ok"
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-semibold">{r.name || r.eid}</p>
                      <p className="text-muted-foreground">{r.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setUploadOpen(false); setUploadResults([]); }}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payroll Settings Dialog ───────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" /> Payroll Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Personal Allowance Threshold</Label>
              <p className="text-xs text-muted-foreground">
                Company-wide monthly personal allowance (GYD). GRA 2026 statutory is GYD 140,000.
                The higher of this threshold or ⅓ of monthly gross is applied.
              </p>
              <div className="flex gap-2 flex-wrap">
                {[100_000, 130_000, 135_000, 140_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPaEdit(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      (paEdit === "" ? companyPA : paEdit) === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                    data-testid={`button-pa-preset-${v}`}
                  >
                    GYD {v.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Or enter custom amount</Label>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={paEdit}
                  onChange={(e) => setPaEdit(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder={`Current: GYD ${companyPA.toLocaleString()}`}
                  data-testid="input-personal-allowance"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button
                disabled={savingSettings}
                onClick={async () => {
                  const val = paEdit === "" ? companyPA : paEdit;
                  await saveSettings({ personalAllowance: Number(val) });
                  setSettingsOpen(false);
                }}
                data-testid="button-save-settings"
              >
                {savingSettings ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Gross</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-total-gross">{formatGYD(totals.gross)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{totals.regHrs.toFixed(1)} reg + {totals.otHrs.toFixed(1)} OT hrs</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Net Pay</span>
          </div>
          <p className="text-xl font-bold text-green-600" data-testid="stat-total-net">{formatGYD(totals.net)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{results.length} employee{results.length !== 1 ? "s" : ""}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">NIS + Insurance</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-total-nis">{formatGYD(totals.nis + totals.health)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">PAYE: {formatGYD(totals.paye)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Employer NIS</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-employer-nis">{formatGYD(totals.employerNIS)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">8.4% employer contribution</p>
        </Card>
      </div>

      {/* ── Pending timesheets notice ─────────────────────────────────── */}
      {pendingOnly.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-4 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <span className="font-semibold">{pendingOnly.length} employee{pendingOnly.length !== 1 ? "s" : ""}</span> ha{pendingOnly.length !== 1 ? "ve" : "s"} pending timesheets awaiting approval and are not included in this payroll:{" "}
            {pendingOnly.map((r) => r.employee.name).join(", ")}.
          </span>
        </div>
      )}

      {/* ── Payroll Table ─────────────────────────────────────────────── */}
      <Card className="overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3 text-center">Cat</th>
                <th className="px-5 py-3 text-right">Rate/hr</th>
                <th className="px-5 py-3 text-right">Reg hrs</th>
                <th className="px-5 py-3 text-right">OT hrs</th>
                <th className="px-5 py-3 text-right">Gross Pay</th>
                <th className="px-5 py-3 text-right">NIS</th>
                <th className="px-5 py-3 text-right">Insurance</th>
                <th className="px-5 py-3 text-right">PAYE</th>
                <th className="px-5 py-3 text-right">Net Pay</th>
                <th className="px-5 py-3 text-center">Sheets</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-12 text-center">
                    <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No approved timesheets for {pd.label}.</p>
                    <p className="text-muted-foreground text-xs mt-1">Approve timesheets in the Timesheets tab to include employees here.</p>
                  </td>
                </tr>
              )}
              {results.map((r) => (
                <tr key={r.employee.id} className="hover:bg-muted/20 transition-colors" data-testid={`payroll-row-${r.employee.userId}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {r.employee.av}
                      </div>
                      <div>
                        <p className="font-semibold leading-tight">{r.employee.name}</p>
                        <p className="text-xs text-muted-foreground">{r.employee.pos}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Badge variant="outline" className="text-xs">{r.employee.cat}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-xs text-muted-foreground">
                    {r.effectiveRate > 0 ? r.effectiveRate.toFixed(2) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm">
                    {r.regularHours.toFixed(1)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm text-amber-600">
                    {r.otHours > 0 ? r.otHours.toFixed(1) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold">{formatGYD(r.grossPay)}</td>
                  <td className="px-5 py-3.5 text-right text-muted-foreground text-xs">{formatGYD(r.employeeNIS)}</td>
                  <td className="px-5 py-3.5 text-right text-muted-foreground text-xs">{formatGYD(r.healthSurcharge)}</td>
                  <td className="px-5 py-3.5 text-right text-muted-foreground text-xs">{formatGYD(r.paye)}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-green-600">{formatGYD(r.netPay)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge variant="default" className="text-xs">{r.approvedTimesheets} ✓</Badge>
                      {r.pendingTimesheets > 0 && (
                        <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300 bg-yellow-50">
                          {r.pendingTimesheets} pend
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedResult(r)} data-testid={`button-payslip-${r.employee.userId}`}>
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {results.length > 0 && (
              <tfoot className="bg-muted/20 border-t-2 border-border font-semibold text-sm">
                <tr>
                  <td className="px-5 py-3" colSpan={5}>Totals — {results.length} employee{results.length !== 1 ? "s" : ""}</td>
                  <td className="px-5 py-3 text-right">{formatGYD(totals.gross)}</td>
                  <td className="px-5 py-3 text-right text-xs">{formatGYD(totals.nis)}</td>
                  <td className="px-5 py-3 text-right text-xs">{formatGYD(totals.health)}</td>
                  <td className="px-5 py-3 text-right text-xs">{formatGYD(totals.paye)}</td>
                  <td className="px-5 py-3 text-right text-green-600">{formatGYD(totals.net)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* ── Guyana 2026 Statutory Reference ───────────────────────────── */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3">Guyana 2026 Statutory Framework</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Employee NIS</p>
            <p className="font-semibold">{(C.NIS_EMP_RATE * 100).toFixed(1)}% of insurable earnings</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Employer NIS</p>
            <p className="font-semibold">{(C.NIS_ER_RATE * 100).toFixed(1)}% of insurable earnings</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">NIS Insurable Ceiling</p>
            <p className="font-semibold">{formatGYD(C.NIS_CEILING_MONTHLY)}/month</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Hand In Hand Insurance</p>
            <p className="font-semibold">{formatGYD(C.HEALTH_SURCHARGE_FULL)} full · {formatGYD(C.HEALTH_SURCHARGE_HALF)} casual/mo</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Personal Allowance</p>
            <p className="font-semibold">
              min. {formatGYD(companyPA)}/month or ⅓ of gross
              {companyPA !== C.PERSONAL_ALLOWANCE && (
                <span className="ml-1 text-xs text-amber-600 font-normal">(company override)</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Child Allowance</p>
            <p className="font-semibold">{formatGYD(companySettingsData?.childAllowance ?? C.CHILD_ALLOWANCE)}/child/month</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">PAYE — Progressive</p>
            <p className="font-semibold">{(C.TAX_LOWER_RATE * 100).toFixed(0)}% up to {formatGYD(C.TAX_LOWER_LIMIT)}/mo chargeable</p>
            <p className="font-semibold">{(C.TAX_UPPER_RATE * 100).toFixed(0)}% above {formatGYD(C.TAX_LOWER_LIMIT)}/mo</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Standard OT / PH Multipliers</p>
            <p className="font-semibold">{C.OT_MULTIPLIER_DEFAULT}× OT · {C.PH_MULTIPLIER_DEFAULT}× Public Holiday</p>
          </div>
        </div>
      </Card>

      {/* ── Send Payslip Dialog ────────────────────────────────────────── */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" /> Send Payslip
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose who to send the payslip for <span className="font-semibold text-foreground">{pd.label}</span>. Payslips will appear in each employee's portal.
            </p>
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <Select value={sendTarget} onValueChange={(v) => setSendTarget(v)}>
                <SelectTrigger data-testid="select-send-target">
                  <SelectValue placeholder="Choose recipients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees ({results.length})</SelectItem>
                  {results.map((r) => (
                    <SelectItem key={r.employee.userId} value={r.employee.userId}>
                      {r.employee.name} ({r.employee.userId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
              <Button
                disabled={sending}
                data-testid="button-confirm-send-payslips"
                onClick={async () => {
                  const toSend = sendTarget === "all" ? results : results.filter((r) => r.employee.userId === sendTarget);
                  if (toSend.length === 0) return;
                  await sendPayslips({
                    sentBy: user.userId,
                    payslips: toSend.map((r) => ({
                      eid: r.employee.userId,
                      period: r.period,
                      periodStart: r.periodStart,
                      periodEnd: r.periodEnd,
                      data: r,
                    })),
                  });
                  setSendOpen(false);
                  toast({
                    title: "Payslips sent",
                    description: `Sent ${toSend.length} payslip${toSend.length !== 1 ? "s" : ""} to the employee portal.`,
                  });
                }}
              >
                {sending ? "Sending…" : sendTarget === "all" ? `Send to all (${results.length})` : `Send to ${results.find((r) => r.employee.userId === sendTarget)?.employee.name ?? sendTarget}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payslip Modal (Landscape) ──────────────────────────────────── */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto" data-testid="payslip-modal">
          {selectedResult && (() => {
            const r = selectedResult;
            // YTD: combine previously sent payslips for this employee + current result,
            // then filter by same year and ≤ periodEnd
            const historicalData = allPayslips
              .filter((ps) => ps.eid === r.employee.userId)
              .map((ps) => ps.data as unknown as PayrollResult);
            const ytdData = [...historicalData, r];
            const ytd = r.periodEnd ? computeYTD(ytdData, r.periodEnd) : undefined;

            return (
              <div data-testid="payslip-modal">
                <PayslipLandscape
                  r={r}
                  tin={(r.employee as any).tin}
                  nisNumber={(r.employee as any).nisNumber}
                  ytd={ytd}
                />
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => downloadPayslipPDF(r, ytd)} data-testid="button-download-pdf">
                    <Download className="w-4 h-4 mr-1.5" /> Download PDF
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => downloadCSV(generateQuickBooksCSV([r]), `Payslip_${r.employee.userId}_${r.periodStart}_${r.periodEnd}.csv`)}
                    data-testid="button-download-payslip">
                    <Download className="w-4 h-4 mr-1.5" /> Download CSV
                  </Button>
                  <Button size="sm" onClick={() => setSelectedResult(null)}>Close</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
