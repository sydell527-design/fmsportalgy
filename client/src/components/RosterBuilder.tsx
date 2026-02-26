import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  format, eachDayOfInterval, parseISO,
  startOfMonth, endOfMonth, addMonths, subMonths, getDate, getDaysInMonth,
} from "date-fns";
import {
  X, Plus, Search, ChevronDown, Save, Loader2,
  Trash2, Upload, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FMS_LOCATIONS, type ArmedStatus, type CallSign } from "@shared/schema";

// ── Shift presets (from actual FMS schedule formats) ──────────────────────────
interface ShiftPreset {
  code: string;
  label: string;
  start: string;
  end: string;
  bg: string;
  text: string;
  border: string;
}

const SHIFT_PRESETS: ShiftPreset[] = [
  { code: "7-3",  label: "7–3",   start: "07:00", end: "15:00", bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
  { code: "3-11", label: "3–11",  start: "15:00", end: "23:00", bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-300"    },
  { code: "11-7", label: "11–7",  start: "23:00", end: "07:00", bg: "bg-violet-100",  text: "text-violet-800",  border: "border-violet-300"  },
  { code: "20-5", label: "20–5",  start: "20:00", end: "05:00", bg: "bg-orange-100",  text: "text-orange-800",  border: "border-orange-300"  },
  { code: "8-4",  label: "8–4",   start: "08:00", end: "16:00", bg: "bg-cyan-100",    text: "text-cyan-800",    border: "border-cyan-300"    },
  { code: "Off",  label: "Off",   start: "",       end: "",      bg: "bg-muted",       text: "text-muted-foreground", border: "border-border" },
];

function presetByCode(code: string): ShiftPreset | undefined {
  return SHIFT_PRESETS.find((p) => p.code === code);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmpRow {
  eid: string;
  name: string;
  pos: string;
  callSign: string;
  location: string;
  cells: Record<string, string>; // date → shift code ("7-3","3-11",…,"Off","","custom")
  customTimes: Record<string, { start: string; end: string }>; // for custom entries
}

interface Props {
  open: boolean;
  onClose: () => void;
  employees: { userId: string; name: string; pos: string }[];
  onSaved: () => void;
}

// ── Employee search combobox ───────────────────────────────────────────────────
function EmpCombo({
  employees, onAdd,
}: { employees: { userId: string; name: string; pos: string }[]; onAdd: (e: typeof employees[0]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() =>
    q.trim()
      ? employees.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()) || e.userId.includes(q)).slice(0, 8)
      : employees.slice(0, 8),
    [q, employees]
  );
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          className="flex h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search employee…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          data-testid="input-roster-emp-search"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((e) => (
            <button
              key={e.userId}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between items-center"
              onMouseDown={() => { onAdd(e); setQ(""); setOpen(false); }}
              data-testid={`roster-emp-${e.userId}`}
            >
              <span><span className="font-medium">{e.name}</span> <span className="text-muted-foreground text-xs">{e.pos}</span></span>
              <span className="text-xs text-muted-foreground ml-2">{e.userId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Call Sign combobox (per row in grid) ──────────────────────────────────────
function CallSignCombo({
  value, registry, onChange, onLocationFill,
}: {
  value: string;
  registry: CallSign[];
  onChange: (v: string) => void;
  onLocationFill: (loc: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return registry.slice(0, 10);
    return registry.filter((r) => r.callSign.toLowerCase().includes(q)).slice(0, 10);
  }, [value, registry]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function selectEntry(cs: CallSign) {
    onChange(cs.callSign);
    onLocationFill(cs.location);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full text-xs border rounded px-1.5 py-1 bg-background font-mono font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder={registry.length ? "Search…" : "ID"}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-[60] top-full left-0 mt-0.5 min-w-[160px] rounded-md border bg-background shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((cs) => (
            <button
              key={cs.callSign}
              type="button"
              className="w-full text-left px-2 py-1 text-xs hover:bg-muted flex items-center justify-between gap-2"
              onMouseDown={() => selectEntry(cs)}
            >
              <span className="font-mono font-semibold">{cs.callSign}</span>
              <span className="text-muted-foreground truncate">{cs.location}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cell popup ────────────────────────────────────────────────────────────────
interface CellPopupProps {
  code: string;
  customTime: { start: string; end: string } | undefined;
  onSelect: (code: string, custom?: { start: string; end: string }) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
}
function CellPopup({ code, customTime, onSelect, onClose, anchorRef }: CellPopupProps) {
  const [customStart, setCustomStart] = useState(customTime?.start ?? "07:00");
  const [customEnd,   setCustomEnd]   = useState(customTime?.end   ?? "15:00");
  const [showCustom,  setShowCustom]  = useState(code === "custom");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={ref} className="absolute z-[100] bg-background border border-border rounded-lg shadow-xl p-2 min-w-[160px]" style={{ top: "calc(100% + 4px)", left: 0 }}>
      <div className="grid grid-cols-2 gap-1 mb-1.5">
        {SHIFT_PRESETS.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => { onSelect(p.code); onClose(); }}
            className={`px-2 py-1.5 rounded-md border text-xs font-semibold transition-colors ${p.bg} ${p.text} ${p.border} ${code === p.code ? "ring-2 ring-primary ring-offset-1" : ""}`}
          >
            {p.label}
            {p.start && <span className="block text-[9px] font-normal opacity-70">{p.start}</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className={`px-2 py-1.5 rounded-md border text-xs font-semibold col-span-2 ${code === "custom" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"}`}
        >
          Custom time
        </button>
      </div>
      {showCustom && (
        <div className="border-t pt-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Start</p>
              <input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="w-full text-xs border rounded px-1 py-1" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">End</p>
              <input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full text-xs border rounded px-1 py-1" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onSelect("custom", { start: customStart, end: customEnd }); onClose(); }}
            className="w-full py-1 rounded bg-primary text-primary-foreground text-xs font-medium"
          >Apply</button>
        </div>
      )}
    </div>
  );
}

// ── Single grid cell ──────────────────────────────────────────────────────────
function Cell({ code, customTime, onUpdate }: {
  code: string;
  customTime: { start: string; end: string } | undefined;
  onUpdate: (code: string, custom?: { start: string; end: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null!);
  const preset = presetByCode(code);
  const isEmpty = !code;

  const cellLabel = code === "custom" && customTime
    ? `${customTime.start.slice(0,5)}–${customTime.end.slice(0,5)}`
    : preset?.label ?? "—";

  const cellStyle = code === "custom"
    ? "bg-amber-100 text-amber-800 border-amber-300"
    : preset
      ? `${preset.bg} ${preset.text} ${preset.border}`
      : "bg-background border-border text-muted-foreground/40 hover:border-primary/40";

  return (
    <td className="p-0.5 relative">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-10 rounded border text-[11px] font-semibold transition-colors hover:opacity-80 ${cellStyle}`}
        data-testid={`cell-${code}`}
      >
        {isEmpty ? <Plus className="w-3 h-3 mx-auto opacity-30" /> : cellLabel}
      </button>
      {open && (
        <CellPopup
          code={code}
          customTime={customTime}
          onSelect={(c, ct) => onUpdate(c, ct)}
          onClose={() => setOpen(false)}
          anchorRef={ref}
        />
      )}
    </td>
  );
}

// ── FMS bi-monthly period helpers ─────────────────────────────────────────────
// Period 1: 1st – 15th | Period 2: 16th – last day of month
function fmsPeriod(anchor: Date, p: 1 | 2): { from: string; to: string; label: string } {
  const som = startOfMonth(anchor);
  if (p === 1) {
    return {
      from:  format(som, "yyyy-MM-dd"),
      to:    format(new Date(anchor.getFullYear(), anchor.getMonth(), 15), "yyyy-MM-dd"),
      label: `Period 1 · ${format(som, "MMM d")}–15`,
    };
  }
  return {
    from:  format(new Date(anchor.getFullYear(), anchor.getMonth(), 16), "yyyy-MM-dd"),
    to:    format(endOfMonth(anchor), "yyyy-MM-dd"),
    label: `Period 2 · ${format(som, "MMM")} 16–${getDaysInMonth(anchor)}`,
  };
}

function currentFmsPeriod(): { from: string; to: string; p: 1 | 2; anchor: Date } {
  const now = new Date();
  const p: 1 | 2 = getDate(now) <= 15 ? 1 : 2;
  const { from, to } = fmsPeriod(now, p);
  return { from, to, p, anchor: now };
}

// ── Main RosterBuilder ────────────────────────────────────────────────────────
export function RosterBuilder({ open, onClose, employees, onSaved }: Props) {
  const { user }  = useAuth();
  const { toast } = useToast();
  const qc        = useQueryClient();
  const todayStr  = format(new Date(), "yyyy-MM-dd");

  // FMS period state — default to whichever period contains today
  const initPeriod = currentFmsPeriod();
  const [anchor,   setAnchor]   = useState<Date>(initPeriod.anchor);
  const [activePeriod, setActivePeriod] = useState<1 | 2>(initPeriod.p);
  const [dateFrom, setDateFrom] = useState(initPeriod.from);
  const [dateTo,   setDateTo]   = useState(initPeriod.to);

  const [rows,      setRows]      = useState<EmpRow[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Call sign registry from the database
  const { data: callSignRegistry = [], refetch: refetchCallSigns } =
    useQuery<CallSign[]>({ queryKey: ["/api/call-signs"] });

  // Excel import: parse client-side, send JSON to backend
  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];

      // Auto-detect columns: look for a header row or assume col A = callSign, col B = location
      let startRow = 0;
      const header = (rows[0] ?? []).map((c: any) => String(c).toLowerCase());
      const csIdx  = header.findIndex((h) => h.includes("call") || h.includes("sign") || h.includes("id"));
      const locIdx = header.findIndex((h) => h.includes("loc") || h.includes("site") || h.includes("post"));
      const noteIdx = header.findIndex((h) => h.includes("note") || h.includes("desc"));

      let csCol  = csIdx  >= 0 ? csIdx  : 0;
      let locCol = locIdx >= 0 ? locIdx : 1;
      let noteCol = noteIdx >= 0 ? noteIdx : -1;
      if (csIdx >= 0 || locIdx >= 0) startRow = 1; // skip header

      const records: { callSign: string; location: string; note?: string }[] = [];
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        const cs  = String(row[csCol] ?? "").trim();
        const loc = String(row[locCol] ?? "").trim();
        if (!cs || !loc) continue;
        const note = noteCol >= 0 ? String(row[noteCol] ?? "").trim() || undefined : undefined;
        records.push({ callSign: cs, location: loc, ...(note ? { note } : {}) });
      }

      if (!records.length) {
        toast({ title: "No data found", description: "The file had no valid call sign / location rows.", variant: "destructive" });
        return;
      }

      const res = await apiRequest("POST", "/api/call-signs/import", records);
      const { imported } = await res.json();
      await refetchCallSigns();
      toast({ title: `${imported} call sign${imported > 1 ? "s" : ""} imported`, description: "Call sign → location mapping updated." });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  // Apply a period button
  function applyPeriod(p: 1 | 2, a: Date = anchor) {
    const pd = fmsPeriod(a, p);
    setActivePeriod(p);
    setDateFrom(pd.from);
    setDateTo(pd.to);
  }

  // Navigate months
  function goMonth(dir: 1 | -1) {
    const next = dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1);
    setAnchor(next);
    applyPeriod(activePeriod, next);
  }

  // Reset when opened
  useEffect(() => {
    if (open) {
      const init = currentFmsPeriod();
      setAnchor(init.anchor);
      setActivePeriod(init.p);
      setDateFrom(init.from);
      setDateTo(init.to);
      setRows([]);
    }
  }, [open]);

  const days = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    return eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
  }, [dateFrom, dateTo]);

  // Available employees not yet in the roster
  const availableEmps = useMemo(
    () => employees.filter((e) => !rows.some((r) => r.eid === e.userId)),
    [employees, rows]
  );

  function addEmployee(emp: typeof employees[0]) {
    setRows((prev) => [...prev, { eid: emp.userId, name: emp.name, pos: emp.pos, callSign: emp.userId, location: "", cells: {}, customTimes: {} }]);
  }

  function updateRowField(eid: string, field: "callSign" | "location", value: string) {
    setRows((prev) => prev.map((r) => r.eid === eid ? { ...r, [field]: value } : r));
  }

  function removeEmployee(eid: string) {
    setRows((prev) => prev.filter((r) => r.eid !== eid));
  }

  function updateCell(eid: string, dateStr: string, code: string, custom?: { start: string; end: string }) {
    setRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells = { ...r.cells, [dateStr]: code };
      const customTimes = { ...r.customTimes };
      if (code === "custom" && custom) customTimes[dateStr] = custom;
      else delete customTimes[dateStr];
      return { ...r, cells, customTimes };
    }));
  }

  // Fill an entire row with a preset
  function fillRow(eid: string, code: string) {
    setRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells: Record<string, string> = {};
      days.forEach((d) => { cells[format(d, "yyyy-MM-dd")] = code; });
      return { ...r, cells, customTimes: {} };
    }));
  }

  // Clear a row
  function clearRow(eid: string) {
    setRows((prev) => prev.map((r) => r.eid === eid ? { ...r, cells: {}, customTimes: {} } : r));
  }

  // Convert shift code → start/end times
  function codeToTimes(code: string, custom?: { start: string; end: string }): { start: string; end: string } | null {
    if (code === "Off" || !code) return null;
    if (code === "custom" && custom) return custom;
    const p = presetByCode(code);
    return p ? { start: p.start, end: p.end } : null;
  }

  async function handleSave() {
    const toCreate: object[] = [];
    for (const row of rows) {
      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        const code = row.cells[dateStr] ?? "";
        const times = codeToTimes(code, row.customTimes[dateStr]);
        if (!times) continue; // skip Off Duty and empty cells
        toCreate.push({
          eid:        row.eid,
          date:       dateStr,
          shiftStart: times.start,
          shiftEnd:   times.end,
          armed:      "Unarmed",
          location:   row.location || null,
          client:     null,
          notes:      null,
          createdBy:  user?.userId ?? "",
        });
      }
    }

    if (toCreate.length === 0) {
      toast({ title: "No shifts to save", description: "Mark at least one shift (not Off Duty) to continue.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await apiRequest("POST", "/api/schedules/bulk", toCreate);
      qc.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: `${toCreate.length} shift${toCreate.length > 1 ? "s" : ""} saved successfully` });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const totalShifts = rows.reduce((sum, row) =>
    sum + Object.values(row.cells).filter((c) => c && c !== "Off").length, 0
  );

  if (!open) return null;

  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayFmt = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="roster-builder">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0 gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold">Roster Builder</h2>

          {/* FMS bi-monthly period selector */}
          <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/40">
            {/* Prev month */}
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="px-2 py-1 rounded text-xs hover:bg-background font-medium"
              data-testid="button-roster-prev-month"
            >‹</button>

            {/* Month label */}
            <span className="px-2 text-xs font-semibold text-muted-foreground min-w-[60px] text-center">
              {format(anchor, "MMM yyyy")}
            </span>

            {/* Period 1 button — 1st to 15th */}
            <button
              type="button"
              onClick={() => applyPeriod(1)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activePeriod === 1
                  ? "bg-primary text-primary-foreground shadow"
                  : "hover:bg-background text-muted-foreground"
              }`}
              data-testid="button-roster-period1"
            >
              P1 · 1–15
            </button>

            {/* Period 2 button — 16th to end */}
            <button
              type="button"
              onClick={() => applyPeriod(2)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activePeriod === 2
                  ? "bg-primary text-primary-foreground shadow"
                  : "hover:bg-background text-muted-foreground"
              }`}
              data-testid="button-roster-period2"
            >
              P2 · 16–{getDaysInMonth(anchor)}
            </button>

            {/* Next month */}
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="px-2 py-1 rounded text-xs hover:bg-background font-medium"
              data-testid="button-roster-next-month"
            >›</button>
          </div>

          {/* Period label + day count */}
          <span className="text-xs text-muted-foreground">
            {format(parseISO(dateFrom), "d MMM")} – {format(parseISO(dateTo), "d MMM yyyy")}
            <span className="ml-1 opacity-60">({days.length} days)</span>
          </span>

          {/* Custom override */}
          <div className="flex items-center gap-1">
            <input type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setActivePeriod(0 as any); }}
              className="border rounded px-2 py-1 text-xs h-7" />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" value={dateTo} min={dateFrom}
              onChange={(e) => { setDateTo(e.target.value); setActivePeriod(0 as any); }}
              className="border rounded px-2 py-1 text-xs h-7" />
          </div>
        </div>

        {/* Shift legend */}
        <div className="hidden xl:flex items-center gap-1.5 flex-wrap">
          {SHIFT_PRESETS.map((p) => (
            <span key={p.code} className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${p.bg} ${p.text} ${p.border}`}>
              {p.label}{p.start ? ` ${p.start}` : ""}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded border text-[11px] font-semibold bg-amber-100 text-amber-800 border-amber-300">Custom</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Hidden file input for Excel import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileImport}
          />

          {/* Import call signs button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            data-testid="button-import-callsigns"
            title="Import call signs from Excel"
          >
            {importing
              ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
              : <FileSpreadsheet className="w-4 h-4 mr-1" />}
            {callSignRegistry.length > 0
              ? `Call Signs (${callSignRegistry.length})`
              : "Import Call Signs"}
          </Button>

          {totalShifts > 0 && (
            <span className="text-xs text-muted-foreground">{totalShifts} shift{totalShifts > 1 ? "s" : ""} planned</span>
          )}
          <Button onClick={handleSave} disabled={saving || rows.length === 0} size="sm" data-testid="button-roster-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Roster
          </Button>
          <button onClick={onClose} className="p-2 rounded hover:bg-muted transition-colors" data-testid="button-roster-close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-64 border-r flex flex-col shrink-0 overflow-y-auto bg-muted/20">
          <div className="p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Add Employee</p>
              <EmpCombo employees={availableEmps} onAdd={addEmployee} />
            </div>

            {rows.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">On Roster ({rows.length})</p>
                <div className="space-y-1">
                  {rows.map((r) => (
                    <div key={r.eid} className="flex items-center justify-between gap-1 bg-background border rounded px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.pos}</p>
                      </div>
                      <button onClick={() => removeEmployee(r.eid)} className="shrink-0 p-0.5 hover:text-destructive transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </aside>

        {/* ── Grid area ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-3">
          {rows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
              <Search className="w-10 h-10 opacity-20" />
              <div>
                <p className="font-medium">No employees added yet</p>
                <p className="text-sm">Search and add employees from the left panel to start building the roster</p>
              </div>
            </div>
          ) : (
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr>
                  {/* Call Sign header */}
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-20 sticky left-0 bg-background z-10 border-b border-r">
                    Call Sign
                  </th>
                  {/* Locations header */}
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32 sticky left-20 bg-background z-10 border-b border-r">
                    Location
                  </th>
                  {/* Employee header */}
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-40 sticky left-52 bg-background z-10 border-b border-r">
                    Employee
                  </th>
                  {/* Quick fill header */}
                  <th className="py-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide w-24 sticky left-[368px] bg-background z-10 border-b border-r">
                    Fill Row
                  </th>
                  {/* Date columns */}
                  {days.map((d, i) => {
                    const ds = format(d, "yyyy-MM-dd");
                    const isToday = ds === todayFmt;
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th key={i} className={`text-center py-1.5 px-0.5 min-w-[56px] border-b ${isToday ? "bg-primary/10" : isWeekend ? "bg-muted/40" : ""}`}>
                        <div className={`text-[9px] uppercase ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{DAY_ABBR[dow]}</div>
                        <div className={`text-xs font-bold ${isToday ? "text-primary" : isWeekend ? "text-muted-foreground" : "text-foreground"}`}>{format(d, "d")}</div>
                        <div className="text-[8px] text-muted-foreground">{format(d, "MMM")}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row.eid} className="border-t border-border/40 hover:bg-muted/10 group">
                    {/* Call Sign cell */}
                    <td className="py-1 px-1 align-middle sticky left-0 bg-background group-hover:bg-muted/10 z-10 border-r w-20">
                      <CallSignCombo
                        value={row.callSign}
                        registry={callSignRegistry}
                        onChange={(v) => updateRowField(row.eid, "callSign", v)}
                        onLocationFill={(loc) => updateRowField(row.eid, "location", loc)}
                      />
                    </td>

                    {/* Location cell */}
                    <td className="py-1 px-1 align-middle sticky left-20 bg-background group-hover:bg-muted/10 z-10 border-r w-32">
                      <select
                        value={row.location}
                        onChange={(e) => updateRowField(row.eid, "location", e.target.value)}
                        className="w-full text-xs border rounded px-1 py-1 bg-background h-7"
                        data-testid={`select-location-${row.eid}`}
                      >
                        <option value="">— loc —</option>
                        {FMS_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>

                    {/* Employee name cell */}
                    <td className="py-1.5 px-3 align-middle sticky left-52 bg-background group-hover:bg-muted/10 z-10 border-r w-40">
                      <div className="font-medium text-sm truncate max-w-[140px]">{row.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{row.pos}</div>
                    </td>

                    {/* Quick fill buttons */}
                    <td className="py-1 px-1 align-middle sticky left-[368px] bg-background group-hover:bg-muted/10 z-10 border-r">
                      <div className="flex flex-col gap-0.5">
                        <select
                          className="text-[10px] border rounded px-1 py-0.5 bg-background h-6"
                          onChange={(e) => { if (e.target.value) { fillRow(row.eid, e.target.value); e.target.value = ""; }}}
                          data-testid={`select-fill-row-${row.eid}`}
                        >
                          <option value="">Fill…</option>
                          {SHIFT_PRESETS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                        </select>
                        <button
                          onClick={() => clearRow(row.eid)}
                          className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 justify-center"
                          title="Clear row"
                        >
                          <Trash2 className="w-2.5 h-2.5" /> Clear
                        </button>
                      </div>
                    </td>

                    {/* Day cells */}
                    {days.map((d, ci) => {
                      const ds = format(d, "yyyy-MM-dd");
                      const dow = d.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const isToday = ds === todayFmt;
                      return (
                        <td key={ci} className={`p-0.5 align-middle ${isToday ? "bg-primary/5" : isWeekend ? "bg-muted/20" : ""}`}>
                          <div className="relative">
                            <CellButton
                              code={row.cells[ds] ?? ""}
                              customTime={row.customTimes[ds]}
                              onUpdate={(code, ct) => updateCell(row.eid, ds, code, ct)}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>

      {/* ── Bottom status bar ──────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-4 bg-muted/20 shrink-0">
          <span>{rows.length} employee{rows.length > 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{days.length} days</span>
          <span>·</span>
          <span className="font-medium text-foreground">{totalShifts} shifts planned</span>
          <span>·</span>
          {Object.values(SHIFT_PRESETS).filter(p => p.code !== "Off").map(p => {
            const cnt = rows.reduce((s, r) => s + Object.values(r.cells).filter(c => c === p.code).length, 0);
            return cnt > 0 ? <span key={p.code} className={`${p.text} font-medium`}>{p.label}: {cnt}</span> : null;
          })}
          {(() => {
            const customCnt = rows.reduce((s, r) => s + Object.values(r.cells).filter(c => c === "custom").length, 0);
            return customCnt > 0 ? <span className="text-amber-700 font-medium">Custom: {customCnt}</span> : null;
          })()}
        </div>
      )}
    </div>
  );
}

// ── Standalone cell button component ─────────────────────────────────────────
function CellButton({ code, customTime, onUpdate }: {
  code: string;
  customTime: { start: string; end: string } | undefined;
  onUpdate: (code: string, custom?: { start: string; end: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null!);
  const preset = presetByCode(code);
  const isEmpty = !code;

  const cellLabel = code === "custom" && customTime
    ? `${customTime.start.slice(0,5)}`
    : preset?.label ?? "";

  const cellStyle = code === "custom"
    ? "bg-amber-100 text-amber-800 border-amber-300"
    : code === "Off"
      ? "bg-muted border-border text-muted-foreground/60"
      : preset
        ? `${preset.bg} ${preset.text} ${preset.border}`
        : "bg-background border-dashed border-border/40 text-transparent hover:border-primary/40 hover:text-muted-foreground/30";

  return (
    <div className="relative">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-10 min-w-[52px] rounded border text-[11px] font-semibold transition-all hover:opacity-80 hover:shadow-sm ${cellStyle}`}
      >
        {isEmpty ? <Plus className="w-2.5 h-2.5 mx-auto opacity-20" /> : cellLabel}
      </button>
      {open && (
        <CellPopup
          code={code}
          customTime={customTime}
          onSelect={(c, ct) => onUpdate(c, ct)}
          onClose={() => setOpen(false)}
          anchorRef={ref}
        />
      )}
    </div>
  );
}
