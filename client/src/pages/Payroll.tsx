import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useUsers } from "@/hooks/use-users";
import { useUpdateUser } from "@/hooks/use-users";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useAllChildren } from "@/hooks/use-children";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, TrendingUp, DollarSign, Building2, ShieldCheck, Upload, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { calcPayroll, formatGYD, generateQuickBooksCSV, downloadCSV, PAYROLL_CONSTANTS } from "@/lib/payroll";
import { format, subMonths } from "date-fns";
import type { PayrollResult } from "@/lib/payroll";
import * as XLSX from "xlsx";

const C = PAYROLL_CONSTANTS;

function Row({ label, value, sub, red, bold, indent }: {
  label: string; value: string; sub?: string; red?: boolean; bold?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex justify-between items-baseline ${indent ? "pl-3" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-muted-foreground"} ${indent ? "text-xs" : "text-sm"}`}>
        {label}{sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </span>
      <span className={`text-sm font-mono ${red ? "text-red-600" : bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function Divider({ label }: { label?: string }) {
  if (label) return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
  return <div className="h-px bg-border my-1" />;
}

type UploadRow = {
  eid: string; name: string;
  creditUnion: number; salaryAdvance: number;
  otherName: string; otherAmount: number;
};
type UploadResult = { eid: string; name: string; status: "ok" | "error"; message: string };

export default function Payroll() {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { data: timesheets } = useTimesheets();
  const { data: allChildren = [] } = useAllChildren();

  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [selectedResult, setSelectedResult] = useState<PayrollResult | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (user?.role === "employee") return <Redirect to="/" />;

  const activeEmployees = (users ?? []).filter((u) => u.status === "active" && u.role !== "admin");
  const allResults = activeEmployees.map((emp) => calcPayroll(emp, timesheets ?? [], period, allChildren));
  const results = allResults.filter((r) => r.approvedTimesheets > 0);

  const totals = results.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossPay,
      nis: acc.nis + r.employeeNIS,
      health: acc.health + r.healthSurcharge,
      paye: acc.paye + r.paye,
      voluntary: acc.voluntary + r.totalVoluntary,
      net: acc.net + r.netPay,
      employerNIS: acc.employerNIS + r.employerNIS,
    }),
    { gross: 0, nis: 0, health: 0, paye: 0, voluntary: 0, net: 0, employerNIS: 0 }
  );

  const handleExport = () => {
    downloadCSV(generateQuickBooksCSV(results), `FMS_Payroll_${period}.csv`);
  };

  const downloadTemplate = () => {
    const headers = ["Employee ID", "Full Name", "Credit Union", "Salary Advance", "Other Deduction Name", "Other Deduction Amount"];
    const sampleRows = (users ?? []).filter((u) => u.status === "active" && u.role !== "admin").map((u) => [
      u.userId, u.name,
      u.payConfig?.creditUnion ?? 0,
      u.payConfig?.advancesRecovery ?? 0,
      (u.payConfig?.otherDeductions ?? [])[0]?.name ?? "",
      (u.payConfig?.otherDeductions ?? [])[0]?.amount ?? 0,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deductions");
    XLSX.writeFile(wb, `FMS_Deductions_Template_${period}.xlsx`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResults([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      const results: UploadResult[] = [];
      for (const row of rows) {
        const eid = String(row["Employee ID"] ?? row["employee_id"] ?? row["eid"] ?? "").trim();
        const empName = String(row["Full Name"] ?? row["full_name"] ?? row["name"] ?? "").trim();
        if (!eid) continue;
        const emp = (users ?? []).find((u) => u.userId === eid);
        if (!emp) { results.push({ eid, name: empName || eid, status: "error", message: "Employee ID not found" }); continue; }
        const creditUnion = Number(row["Credit Union"] ?? row["credit_union"] ?? 0) || 0;
        const salaryAdvance = Number(row["Salary Advance"] ?? row["salary_advance"] ?? 0) || 0;
        const otherName = String(row["Other Deduction Name"] ?? row["other_deduction_name"] ?? "").trim();
        const otherAmount = Number(row["Other Deduction Amount"] ?? row["other_deduction_amount"] ?? 0) || 0;
        const existingOthers = (emp.payConfig?.otherDeductions ?? []).filter((d) => d.name !== otherName);
        const newOthers = otherName && otherAmount > 0 ? [...existingOthers, { name: otherName, amount: otherAmount }] : existingOthers;
        try {
          await updateUser({
            id: emp.id,
            ...emp,
            payConfig: {
              ...emp.payConfig,
              creditUnion,
              advancesRecovery: salaryAdvance,
              otherDeductions: newOthers,
            } as any,
          });
          results.push({ eid, name: emp.name, status: "ok", message: `Updated — CU: ${creditUnion}, Advance: ${salaryAdvance}${otherName ? `, ${otherName}: ${otherAmount}` : ""}` });
        } catch {
          results.push({ eid, name: emp.name, status: "error", message: "Failed to save" });
        }
      }
      setUploadResults(results);
    } catch {
      setUploadResults([{ eid: "", name: "", status: "error", message: "Could not parse file. Ensure it is a valid .xlsx or .csv file." }]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Guyana 2026 compliant — approved timesheets only</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            data-testid="select-payroll-period"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setUploadOpen(true)} data-testid="button-upload-deductions">
            <Upload className="w-4 h-4 mr-2" /> Upload Deductions
          </Button>
          <Button onClick={handleExport} data-testid="button-export-quickbooks">
            <Download className="w-4 h-4 mr-2" /> QuickBooks CSV
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={handleFileUpload} data-testid="input-deductions-file" />

      {/* Upload Deductions Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" /> Upload Deductions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload an Excel (.xlsx) or CSV file with employee deductions. Columns required:
            </p>
            <div className="bg-muted/40 rounded-md p-3 text-xs font-mono text-muted-foreground space-y-0.5">
              <p>• <span className="font-semibold text-foreground">Employee ID</span> — must match system ID</p>
              <p>• <span className="font-semibold text-foreground">Full Name</span> — reference only</p>
              <p>• <span className="font-semibold text-foreground">Credit Union</span> — amount per period</p>
              <p>• <span className="font-semibold text-foreground">Salary Advance</span> — recovery per period</p>
              <p>• <span className="font-semibold text-foreground">Other Deduction Name</span> — label for other deduction</p>
              <p>• <span className="font-semibold text-foreground">Other Deduction Amount</span> — amount per period</p>
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
                  Results — {uploadResults.filter((r) => r.status === "ok").length} updated · {uploadResults.filter((r) => r.status === "error").length} errors
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Gross</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-total-gross">{formatGYD(totals.gross)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Net Pay</span>
          </div>
          <p className="text-xl font-bold text-green-600" data-testid="stat-total-net">{formatGYD(totals.net)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">NIS + Health</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-total-nis">{formatGYD(totals.nis + totals.health)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Employer NIS</span>
          </div>
          <p className="text-xl font-bold" data-testid="stat-employer-nis">{formatGYD(totals.employerNIS)}</p>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Cat</th>
                <th className="px-5 py-3 text-right">Hrs (Reg+OT)</th>
                <th className="px-5 py-3 text-right">Gross Pay</th>
                <th className="px-5 py-3 text-right">NIS</th>
                <th className="px-5 py-3 text-right">Health</th>
                <th className="px-5 py-3 text-right">PAYE</th>
                <th className="px-5 py-3 text-right">Net Pay</th>
                <th className="px-5 py-3 text-center">Sheets</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    No approved timesheet records found for this period.
                  </td>
                </tr>
              )}
              {results.map((r) => (
                <tr key={r.employee.id} className="hover:bg-muted/20 transition-colors" data-testid={`payroll-row-${r.employee.userId}`}>
                  <td className="px-5 py-4">
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
                  <td className="px-5 py-4">
                    <Badge variant="outline" className="text-xs">{r.employee.cat}</Badge>
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm">
                    {r.regularHours.toFixed(1)}+<span className="text-amber-600">{r.otHours.toFixed(1)}</span>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">{formatGYD(r.grossPay)}</td>
                  <td className="px-5 py-4 text-right text-muted-foreground text-xs">{formatGYD(r.employeeNIS)}</td>
                  <td className="px-5 py-4 text-right text-muted-foreground text-xs">{formatGYD(r.healthSurcharge)}</td>
                  <td className="px-5 py-4 text-right text-muted-foreground text-xs">{formatGYD(r.paye)}</td>
                  <td className="px-5 py-4 text-right font-bold text-green-600">{formatGYD(r.netPay)}</td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge variant="default" className="text-xs">{r.approvedTimesheets} ✓</Badge>
                      {r.pendingTimesheets > 0 && (
                        <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300 bg-yellow-50">{r.pendingTimesheets} pend</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedResult(r)} data-testid={`button-payslip-${r.employee.userId}`}>
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {results.length > 0 && (
              <tfoot className="bg-muted/20 border-t border-border font-semibold text-sm">
                <tr>
                  <td className="px-5 py-3" colSpan={3}>Totals</td>
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

      {/* Guyana 2026 Statutory Reference */}
      <Card className="p-5 mt-4">
        <h3 className="font-semibold text-sm mb-3">Guyana 2026 Statutory Framework</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Employee NIS Rate</p>
            <p className="font-semibold">{(C.NIS_EMP_RATE * 100).toFixed(1)}% of insurable earnings</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Employer NIS Rate</p>
            <p className="font-semibold">{(C.NIS_ER_RATE * 100).toFixed(1)}% of insurable earnings</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">NIS Insurable Earnings Ceiling</p>
            <p className="font-semibold">{formatGYD(C.NIS_CEILING_MONTHLY)}/month</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Health Surcharge</p>
            <p className="font-semibold">{formatGYD(C.HEALTH_SURCHARGE_FULL)} full · {formatGYD(C.HEALTH_SURCHARGE_HALF)} casual/mo</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Personal Allowance</p>
            <p className="font-semibold">min. {formatGYD(C.PERSONAL_ALLOWANCE)}/month or ⅓ of gross</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Child Allowance</p>
            <p className="font-semibold">{formatGYD(C.CHILD_ALLOWANCE)}/child/month</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Income Tax (PAYE) — Progressive</p>
            <p className="font-semibold">{(C.TAX_LOWER_RATE * 100).toFixed(0)}% up to {formatGYD(C.TAX_LOWER_LIMIT)}/mo chargeable</p>
            <p className="font-semibold">{(C.TAX_UPPER_RATE * 100).toFixed(0)}% above {formatGYD(C.TAX_LOWER_LIMIT)}/mo chargeable</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Standard OT / PH Multipliers</p>
            <p className="font-semibold">{C.OT_MULTIPLIER_DEFAULT}× OT · {C.PH_MULTIPLIER_DEFAULT}× Public Holiday</p>
          </div>
        </div>
      </Card>

      {/* Payslip Modal — full Guyana 2026 breakdown */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payslip — {selectedResult?.period}</DialogTitle>
          </DialogHeader>
          {selectedResult && (() => {
            const r = selectedResult;
            const pc = r.employee.payConfig;
            return (
              <div className="space-y-3 mt-1 text-sm" data-testid="payslip-modal">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-md">
                  <div className="w-11 h-11 rounded-full bg-primary-foreground/20 flex items-center justify-center font-bold text-lg shrink-0">
                    {r.employee.av}
                  </div>
                  <div>
                    <p className="font-bold text-base leading-tight">{r.employee.name}</p>
                    <p className="text-primary-foreground/80 text-sm">{r.employee.pos} · {r.employee.dept}</p>
                    <p className="text-primary-foreground/60 text-xs font-mono">{r.employee.userId} · {r.period}</p>
                  </div>
                </div>

                {/* Hours */}
                <Divider label="Hours" />
                <Row label="Regular Hours" value={`${r.regularHours.toFixed(2)}h`} />
                {r.otHours > 0 && <Row label={`OT Hours (${pc?.otMultiplier ?? 1.5}×)`} value={`${r.otHours.toFixed(2)}h`} />}
                <Row label="Approved Timesheets" value={String(r.approvedTimesheets)} />

                {/* Earnings */}
                <Divider label="Earnings" />
                <Row label="Basic / Regular Pay" value={formatGYD(r.basicPay)} />
                {r.otPay > 0 && <Row label="Overtime Pay" value={formatGYD(r.otPay)} />}
                {r.allowances > 0 && <>
                  <Row label="Allowances" value={formatGYD(r.allowances)} />
                  {(pc?.housingAllowance ?? 0) > 0   && <Row label="Housing Allowance"    value={formatGYD(pc!.housingAllowance)}   indent />}
                  {(pc?.transportAllowance ?? 0) > 0 && <Row label="Transport Allowance"  value={formatGYD(pc!.transportAllowance)} indent />}
                  {(pc?.mealAllowance ?? 0) > 0      && <Row label="Meal Allowance"        value={formatGYD(pc!.mealAllowance)}      indent />}
                  {(pc?.uniformAllowance ?? 0) > 0   && <Row label="Uniform Allowance"     value={formatGYD(pc!.uniformAllowance)}   indent />}
                  {(pc?.riskAllowance ?? 0) > 0      && <Row label="Risk Allowance"         value={formatGYD(pc!.riskAllowance)}      indent />}
                  {(pc?.shiftAllowance ?? 0) > 0     && <Row label="Shift Allowance"        value={formatGYD(pc!.shiftAllowance)}     indent />}
                  {(pc?.otherAllowances ?? []).map((a, i) => (
                    <Row key={i} label={a.name} value={formatGYD(a.amount)} indent />
                  ))}
                </>}
                <div className="flex justify-between font-semibold bg-muted/30 rounded px-2 py-1">
                  <span>Gross Pay</span>
                  <span>{formatGYD(r.grossPay)}</span>
                </div>

                {/* Statutory Deductions */}
                <Divider label="Statutory Deductions" />
                <Row label={`Employee NIS (${(C.NIS_EMP_RATE * 100).toFixed(1)}%${pc?.nisExempt ? " — EXEMPT" : ""})`}
                     sub={`ceiling ${formatGYD(C.NIS_CEILING_MONTHLY)}/mo`}
                     value={pc?.nisExempt ? "GYD 0" : `- ${formatGYD(r.employeeNIS)}`} red={!pc?.nisExempt} />
                <Row label={`Health Surcharge${pc?.healthSurchargeExempt ? " — EXEMPT" : ` (${pc?.healthSurchargeRate ?? "full"})`}`}
                     value={pc?.healthSurchargeExempt ? "GYD 0" : `- ${formatGYD(r.healthSurcharge)}`} red={!pc?.healthSurchargeExempt} />
                <Row label={`Personal Allowance${r.personalAllowance > C.PERSONAL_ALLOWANCE ? " (⅓ gross)" : ""}`}
                     sub={r.personalAllowance > C.PERSONAL_ALLOWANCE ? `min. ${formatGYD(C.PERSONAL_ALLOWANCE)} — ⅓ gross applies` : undefined}
                     value={`- ${formatGYD(r.personalAllowance)}`} />
                {r.qualifyingChildren > 0 && (
                  <Row label={`Child Allowance (${r.qualifyingChildren} qualifying child${r.qualifyingChildren > 1 ? "ren" : ""})`}
                       value={`- ${formatGYD(r.childAllowance)}`} />
                )}
                <Row label="Chargeable Income" value={formatGYD(r.chargeableIncome)} bold />
                <Row label={`PAYE${pc?.taxExempt ? " — EXEMPT" : r.chargeableIncome > C.TAX_LOWER_LIMIT ? ` (${(C.TAX_LOWER_RATE*100).toFixed(0)}% / ${(C.TAX_UPPER_RATE*100).toFixed(0)}% progressive)` : ` (${(C.TAX_LOWER_RATE*100).toFixed(0)}%)`}`}
                     value={pc?.taxExempt ? "GYD 0" : `- ${formatGYD(r.paye)}`} red={!pc?.taxExempt} />

                {/* Voluntary Deductions */}
                {r.totalVoluntary > 0 && <>
                  <Divider label="Voluntary Deductions" />
                  {r.creditUnion > 0      && <Row label="Credit Union"       value={`- ${formatGYD(r.creditUnion)}`}      red />}
                  {r.loanRepayment > 0    && <Row label="Loan Repayment"     value={`- ${formatGYD(r.loanRepayment)}`}    red />}
                  {r.advancesRecovery > 0 && <Row label="Advances Recovery"  value={`- ${formatGYD(r.advancesRecovery)}`} red />}
                  {r.unionDues > 0        && <Row label="Union Dues"         value={`- ${formatGYD(r.unionDues)}`}        red />}
                  {(pc?.otherDeductions ?? []).map((d, i) => (
                    <Row key={i} label={d.name} value={`- ${formatGYD(d.amount)}`} red />
                  ))}
                </>}

                {/* Net Pay */}
                <Divider />
                <div className="flex justify-between items-center bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-2">
                  <span className="font-bold text-base">Net Pay</span>
                  <span className="font-bold text-xl text-green-600">{formatGYD(r.netPay)}</span>
                </div>
                <Row label={`Employer NIS (${(C.NIS_ER_RATE * 100).toFixed(1)}%) — not deducted from employee`}
                     value={formatGYD(r.employerNIS)} />

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="outline" onClick={() => { downloadCSV(generateQuickBooksCSV([r]), `Payslip_${r.employee.userId}_${r.period}.csv`); }}
                          data-testid="button-download-payslip">
                    <Download className="w-4 h-4 mr-1.5" /> Download CSV
                  </Button>
                  <Button onClick={() => setSelectedResult(null)}>Close</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
