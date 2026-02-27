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
  Trash2, Upload, FileSpreadsheet, Download, FileText, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FMS_LOCATIONS, CLIENT_AGENCIES, type ArmedStatus, type CallSign } from "@shared/schema";

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

interface AgencyRoster {
  agency: string;          // e.g. "CARICOM", "EU"
  rows: EmpRow[];          // main / primary officers
  reliefRows: EmpRow[];    // relief security officers
  reserveRows: EmpRow[];   // reserve officers
  savedCount?: number;     // shifts saved in last save action (for tab badge)
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

// ── Agency search combobox ────────────────────────────────────────────────────
function AgencyCombo({ onSelect, existing }: {
  onSelect: (agency: string) => void;
  existing: string[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const qLow = q.trim().toLowerCase();
    return CLIENT_AGENCIES.filter((a) => !qLow || a.toLowerCase().includes(qLow));
  }, [q]);

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
          placeholder="Search agency…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          data-testid="input-roster-agency-search"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((a) => {
            const active = existing.includes(a);
            return (
              <button
                key={a}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                onMouseDown={() => { onSelect(a); setQ(""); setOpen(false); }}
                data-testid={`roster-agency-${a}`}
              >
                <span className="font-medium">{a}</span>
                {active && <span className="text-[10px] text-primary font-semibold">● Open</span>}
              </button>
            );
          })}
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

// ── Shared roster grid (used for Main, Relief, Reserve sections) ──────────────
function SectionGrid({
  rows, days, DAY_ABBR, todayFmt, callSignRegistry,
  onUpdateField, onUpdateCell, onFillRow, onClearRow,
}: {
  rows: EmpRow[];
  days: Date[];
  DAY_ABBR: string[];
  todayFmt: string;
  callSignRegistry: CallSign[];
  onUpdateField: (eid: string, field: "callSign" | "location", value: string) => void;
  onUpdateCell: (eid: string, dateStr: string, code: string, custom?: { start: string; end: string }) => void;
  onFillRow: (eid: string, code: string) => void;
  onClearRow: (eid: string) => void;
}) {
  return (
    <table className="border-collapse text-sm w-full">
      <thead>
        <tr>
          <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-20 sticky left-0 bg-background z-10 border-b border-r">Call Sign</th>
          <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32 sticky left-20 bg-background z-10 border-b border-r">Location</th>
          <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-40 sticky left-52 bg-background z-10 border-b border-r">Employee</th>
          <th className="py-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide w-24 sticky left-[368px] bg-background z-10 border-b border-r">Fill Row</th>
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
        {rows.map((row) => (
          <tr key={row.eid} className="border-t border-border/40 hover:bg-muted/10 group">
            <td className="py-1 px-1 align-middle sticky left-0 bg-background group-hover:bg-muted/10 z-10 border-r w-20">
              <CallSignCombo
                value={row.callSign}
                registry={callSignRegistry}
                onChange={(v) => onUpdateField(row.eid, "callSign", v)}
                onLocationFill={(loc) => onUpdateField(row.eid, "location", loc)}
              />
            </td>
            <td className="py-1 px-1 align-middle sticky left-20 bg-background group-hover:bg-muted/10 z-10 border-r w-32">
              <select
                value={row.location}
                onChange={(e) => onUpdateField(row.eid, "location", e.target.value)}
                className="w-full text-xs border rounded px-1 py-1 bg-background h-7"
                data-testid={`select-location-${row.eid}`}
              >
                <option value="">— loc —</option>
                {FMS_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </td>
            <td className="py-1.5 px-3 align-middle sticky left-52 bg-background group-hover:bg-muted/10 z-10 border-r w-40">
              <div className="font-medium text-sm truncate max-w-[140px]">{row.name}</div>
              <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{row.pos}</div>
            </td>
            <td className="py-1 px-1 align-middle sticky left-[368px] bg-background group-hover:bg-muted/10 z-10 border-r">
              <div className="flex flex-col gap-0.5">
                <select
                  className="text-[10px] border rounded px-1 py-0.5 bg-background h-6"
                  onChange={(e) => { if (e.target.value) { onFillRow(row.eid, e.target.value); e.target.value = ""; }}}
                  data-testid={`select-fill-row-${row.eid}`}
                >
                  <option value="">Fill…</option>
                  <optgroup label="All Days">{SHIFT_PRESETS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</optgroup>
                  <optgroup label="Weekdays Only (W)">{SHIFT_PRESETS.filter((p) => p.code !== "Off").map((p) => <option key={`${p.code}|W`} value={`${p.code}|W`}>{p.label} W</option>)}</optgroup>
                </select>
                <button onClick={() => onClearRow(row.eid)} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 justify-center" title="Clear row">
                  <Trash2 className="w-2.5 h-2.5" /> Clear
                </button>
              </div>
            </td>
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
                      onUpdate={(code, ct) => onUpdateCell(row.eid, ds, code, ct)}
                    />
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
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

  const [agencyRosters, setAgencyRosters] = useState<AgencyRoster[]>([]);
  const [activeAgency,  setActiveAgency]  = useState<string>("");
  const [saving,     setSaving]    = useState(false);
  const [importing,  setImporting] = useState(false);
  const [exportOpen,  setExportOpen]  = useState(false);
  const [reliefOpen,  setReliefOpen]  = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const exportRef     = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Build a 2-D array from the current active roster tab for export
  function buildRosterData(): (string | number)[][] {
    const periodLabel = fmsPeriod(anchor, activePeriod).label;
    const header: string[] = ["Name", "Position", "Call Sign", "Location", ...days.map((d) => format(d, "EEE d MMM"))];
    const toRows = (empRows: EmpRow[]) => empRows.map((row) => [
      row.name,
      row.pos,
      row.callSign,
      row.location,
      ...days.map((d) => row.cells[format(d, "yyyy-MM-dd")] ?? ""),
    ]);
    const data: (string | number)[][] = [
      [`${activeAgency} Roster — ${periodLabel}`],
      [],
      header,
      ...toRows(activeRows),
    ];
    if (activeReliefRows.length > 0) {
      data.push([], ["— Relief Security —"], header, ...toRows(activeReliefRows));
    }
    if (activeReserveRows.length > 0) {
      data.push([], ["— Reserve —"], header, ...toRows(activeReserveRows));
    }
    return data;
  }

  // Excel export using xlsx (already installed)
  async function exportExcel() {
    setExportOpen(false);
    const XLSX = await import("xlsx");
    const data = buildRosterData();
    const numCols = 4 + days.length;
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Merge section header rows (rows with a single cell starting with "—") across all columns
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    data.forEach((row, ri) => {
      const txt = String(row[0] ?? "");
      const isSectionHeader = row.length === 1 && txt.startsWith("—");
      const isTitleRow = ri === 0;
      if (isSectionHeader || isTitleRow) {
        merges.push({ s: { r: ri, c: 0 }, e: { r: ri, c: numCols - 1 } });
        // Center-align the merged cell
        const cellAddr = XLSX.utils.encode_cell({ r: ri, c: 0 });
        if (ws[cellAddr]) {
          ws[cellAddr].s = { alignment: { horizontal: "center" }, font: { bold: true } };
        }
      }
    });
    if (merges.length) ws["!merges"] = merges;

    // Auto-width columns
    const colWidths = data.reduce<number[]>((acc, row) => {
      row.forEach((cell, i) => { acc[i] = Math.max(acc[i] ?? 6, String(cell).length + 2); });
      return acc;
    }, []);
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (activeAgency || "Roster").slice(0, 31));
    XLSX.writeFile(wb, `${activeAgency || "Roster"}_Roster_${format(days[0] ?? new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Excel exported", description: `${activeAgency} roster downloaded as .xlsx` });
  }

  // CSV export
  function exportCSV() {
    setExportOpen(false);
    const data = buildRosterData();
    const csv = data
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${activeAgency || "Roster"}_Roster_${format(days[0] ?? new Date(), "yyyy-MM-dd")}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${activeAgency} roster downloaded as .csv` });
  }

  // Build an HTML table string for print / Word
  function buildHtmlTable(): string {
    const periodLabel = fmsPeriod(anchor, activePeriod).label;
    const title = `${activeAgency} Roster — ${periodLabel}`;
    const numCols = 4 + days.length;

    const thS = `background:#1d4ed8;color:#fff;padding:6px 10px;text-align:left;white-space:nowrap;font-size:11px;border:1px solid #1e40af`;
    const th = (txt: string) => `<th style="${thS}">${txt}</th>`;
    const td = (txt: string, light: boolean) =>
      `<td style="padding:5px 10px;font-size:11px;border:1px solid #d1d5db;background:${light ? "#f8fafc" : "#fff"}">${txt ?? ""}</td>`;

    const dateHeaders = days.map((d) => th(format(d, "EEE d MMM")));
    const headerRow = `<tr>${th("Name")}${th("Position")}${th("Call Sign")}${th("Location")}${dateHeaders.join("")}</tr>`;

    const buildRows = (rows: EmpRow[]) =>
      rows.map((row, ri) =>
        `<tr>${td(row.name, ri % 2 === 0)}${td(row.pos, ri % 2 === 0)}${td(row.callSign, ri % 2 === 0)}${td(row.location, ri % 2 === 0)}${days.map((d) => td(row.cells[format(d, "yyyy-MM-dd")] ?? "", ri % 2 === 0)).join("")}</tr>`
      ).join("");

    const spacerRow = `<tr><td colspan="${numCols}" style="padding:6px;border:none"></td></tr>`;

    const sectionHeaderRow = (label: string, bg: string, color: string, border: string) =>
      `<tr><td colspan="${numCols}" style="text-align:center;font-weight:bold;font-size:13px;letter-spacing:3px;text-transform:uppercase;padding:10px 6px;background:${bg};color:${color};border:2px solid ${border}">${label}</td></tr>`;

    let body = buildRows(activeRows);

    if (activeReliefRows.length > 0) {
      body += spacerRow;
      body += sectionHeaderRow("Relief Security", "#fef3c7", "#92400e", "#fcd34d");
      body += headerRow;
      body += buildRows(activeReliefRows);
    }
    if (activeReserveRows.length > 0) {
      body += spacerRow;
      body += sectionHeaderRow("Reserve", "#dbeafe", "#1e40af", "#93c5fd");
      body += headerRow;
      body += buildRows(activeReserveRows);
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;margin:20px}h2{color:#1d4ed8;margin-bottom:12px}table{border-collapse:collapse;width:100%}@media print{@page{size:landscape}body{margin:12px}}</style>
</head><body><h2>${title}</h2><table>${headerRow}${body}</table></body></html>`;
  }

  // PDF — open print dialog in a new window
  function exportPDF() {
    setExportOpen(false);
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) { toast({ title: "Popup blocked", description: "Allow popups to export PDF.", variant: "destructive" }); return; }
    w.document.write(buildHtmlTable());
    w.document.close();
    w.onload = () => { w.print(); };
    toast({ title: "Print dialog opened", description: "Use 'Save as PDF' in the print dialog." });
  }

  // Word — download an HTML file that Word opens natively
  function exportWord() {
    setExportOpen(false);
    const html = buildHtmlTable();
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${activeAgency || "Roster"}_Roster_${format(days[0] ?? new Date(), "yyyy-MM-dd")}.doc` });
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Word document exported", description: `${activeAgency} roster downloaded as .doc` });
  }

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
      setAgencyRosters([]);
      setActiveAgency("");
    }
  }, [open]);

  const days = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    return eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
  }, [dateFrom, dateTo]);

  // Derive the active agency's rows
  const activeRows = useMemo(
    () => agencyRosters.find((ar) => ar.agency === activeAgency)?.rows ?? [],
    [agencyRosters, activeAgency]
  );

  // Helper — update only the active agency's rows
  function updateActiveRows(updater: (rows: EmpRow[]) => EmpRow[]) {
    setAgencyRosters((prev) =>
      prev.map((ar) => ar.agency === activeAgency ? { ...ar, rows: updater(ar.rows) } : ar)
    );
  }

  // Derive active agency's relief and reserve rows
  const activeReliefRows = useMemo(
    () => agencyRosters.find((ar) => ar.agency === activeAgency)?.reliefRows ?? [],
    [agencyRosters, activeAgency]
  );
  const activeReserveRows = useMemo(
    () => agencyRosters.find((ar) => ar.agency === activeAgency)?.reserveRows ?? [],
    [agencyRosters, activeAgency]
  );

  function updateActiveReliefRows(updater: (rows: EmpRow[]) => EmpRow[]) {
    setAgencyRosters((prev) =>
      prev.map((ar) => ar.agency === activeAgency ? { ...ar, reliefRows: updater(ar.reliefRows) } : ar)
    );
  }
  function updateActiveReserveRows(updater: (rows: EmpRow[]) => EmpRow[]) {
    setAgencyRosters((prev) =>
      prev.map((ar) => ar.agency === activeAgency ? { ...ar, reserveRows: updater(ar.reserveRows) } : ar)
    );
  }

  // Agency management
  function openAgency(agency: string) {
    setAgencyRosters((prev) => {
      if (prev.some((ar) => ar.agency === agency)) return prev;
      return [...prev, { agency, rows: [], reliefRows: [], reserveRows: [] }];
    });
    setActiveAgency(agency);
    setReliefOpen(false);
    setReserveOpen(false);
  }

  function closeAgency(agency: string) {
    setAgencyRosters((prev) => {
      const next = prev.filter((ar) => ar.agency !== agency);
      if (activeAgency === agency) {
        const idx = prev.findIndex((ar) => ar.agency === agency);
        const fallback = next[Math.max(0, idx - 1)]?.agency ?? "";
        setActiveAgency(fallback);
      }
      return next;
    });
  }

  // Available employees not yet in the CURRENT agency's roster
  const availableEmps = useMemo(
    () => employees.filter((e) => !activeRows.some((r) => r.eid === e.userId)),
    [employees, activeRows]
  );
  const availableRelief = useMemo(
    () => employees.filter((e) =>
      !activeRows.some((r) => r.eid === e.userId) &&
      !activeReliefRows.some((r) => r.eid === e.userId)
    ),
    [employees, activeRows, activeReliefRows]
  );
  const availableReserve = useMemo(
    () => employees.filter((e) =>
      !activeRows.some((r) => r.eid === e.userId) &&
      !activeReliefRows.some((r) => r.eid === e.userId) &&
      !activeReserveRows.some((r) => r.eid === e.userId)
    ),
    [employees, activeRows, activeReliefRows, activeReserveRows]
  );

  // ── Main section helpers ────────────────────────────────────────────────────
  function addEmployee(emp: typeof employees[0]) {
    updateActiveRows((prev) => [
      ...prev,
      { eid: emp.userId, name: emp.name, pos: emp.pos, callSign: emp.userId, location: "", cells: {}, customTimes: {} },
    ]);
  }

  function updateRowField(eid: string, field: "callSign" | "location", value: string) {
    updateActiveRows((prev) => prev.map((r) => r.eid === eid ? { ...r, [field]: value } : r));
  }

  function removeEmployee(eid: string) {
    updateActiveRows((prev) => prev.filter((r) => r.eid !== eid));
  }

  // ── Relief section helpers ──────────────────────────────────────────────────
  function addRelief(emp: typeof employees[0]) {
    updateActiveReliefRows((prev) => [
      ...prev,
      { eid: emp.userId, name: emp.name, pos: emp.pos, callSign: emp.userId, location: "", cells: {}, customTimes: {} },
    ]);
  }
  function removeRelief(eid: string) {
    updateActiveReliefRows((prev) => prev.filter((r) => r.eid !== eid));
  }
  function updateReliefRowField(eid: string, field: "callSign" | "location", value: string) {
    updateActiveReliefRows((prev) => prev.map((r) => r.eid === eid ? { ...r, [field]: value } : r));
  }
  function updateReliefCell(eid: string, dateStr: string, code: string, custom?: { start: string; end: string }) {
    updateActiveReliefRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells = { ...r.cells, [dateStr]: code };
      const customTimes = { ...r.customTimes };
      if (custom) customTimes[dateStr] = custom; else delete customTimes[dateStr];
      return { ...r, cells, customTimes };
    }));
  }
  function fillReliefRow(eid: string, rawCode: string) {
    const weekdaysOnly = rawCode.endsWith("|W");
    const code = weekdaysOnly ? rawCode.slice(0, -2) : rawCode;
    updateActiveReliefRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells: Record<string, string> = {};
      days.forEach((d) => {
        const dow = d.getDay();
        cells[format(d, "yyyy-MM-dd")] = weekdaysOnly && (dow === 0 || dow === 6) ? "Off" : code;
      });
      return { ...r, cells, customTimes: {} };
    }));
  }
  function clearReliefRow(eid: string) {
    updateActiveReliefRows((prev) => prev.map((r) => r.eid === eid ? { ...r, cells: {}, customTimes: {} } : r));
  }

  // ── Reserve section helpers ─────────────────────────────────────────────────
  function addReserve(emp: typeof employees[0]) {
    updateActiveReserveRows((prev) => [
      ...prev,
      { eid: emp.userId, name: emp.name, pos: emp.pos, callSign: emp.userId, location: "", cells: {}, customTimes: {} },
    ]);
  }
  function removeReserve(eid: string) {
    updateActiveReserveRows((prev) => prev.filter((r) => r.eid !== eid));
  }
  function updateReserveRowField(eid: string, field: "callSign" | "location", value: string) {
    updateActiveReserveRows((prev) => prev.map((r) => r.eid === eid ? { ...r, [field]: value } : r));
  }
  function updateReserveCell(eid: string, dateStr: string, code: string, custom?: { start: string; end: string }) {
    updateActiveReserveRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells = { ...r.cells, [dateStr]: code };
      const customTimes = { ...r.customTimes };
      if (custom) customTimes[dateStr] = custom; else delete customTimes[dateStr];
      return { ...r, cells, customTimes };
    }));
  }
  function fillReserveRow(eid: string, rawCode: string) {
    const weekdaysOnly = rawCode.endsWith("|W");
    const code = weekdaysOnly ? rawCode.slice(0, -2) : rawCode;
    updateActiveReserveRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells: Record<string, string> = {};
      days.forEach((d) => {
        const dow = d.getDay();
        cells[format(d, "yyyy-MM-dd")] = weekdaysOnly && (dow === 0 || dow === 6) ? "Off" : code;
      });
      return { ...r, cells, customTimes: {} };
    }));
  }
  function clearReserveRow(eid: string) {
    updateActiveReserveRows((prev) => prev.map((r) => r.eid === eid ? { ...r, cells: {}, customTimes: {} } : r));
  }

  function updateCell(eid: string, dateStr: string, code: string, custom?: { start: string; end: string }) {
    updateActiveRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells = { ...r.cells, [dateStr]: code };
      const customTimes = { ...r.customTimes };
      if (code === "custom" && custom) customTimes[dateStr] = custom;
      else delete customTimes[dateStr];
      return { ...r, cells, customTimes };
    }));
  }

  // Fill an entire row with a preset.
  // Codes ending with "|W" mean "weekdays only" — weekends get "Off".
  function fillRow(eid: string, rawCode: string) {
    const weekdaysOnly = rawCode.endsWith("|W");
    const code = weekdaysOnly ? rawCode.slice(0, -2) : rawCode;
    updateActiveRows((prev) => prev.map((r) => {
      if (r.eid !== eid) return r;
      const cells: Record<string, string> = {};
      days.forEach((d) => {
        const dow = d.getDay(); // 0 = Sun, 6 = Sat
        const isWeekend = dow === 0 || dow === 6;
        cells[format(d, "yyyy-MM-dd")] = weekdaysOnly && isWeekend ? "Off" : code;
      });
      return { ...r, cells, customTimes: {} };
    }));
  }

  // Clear a row
  function clearRow(eid: string) {
    updateActiveRows((prev) => prev.map((r) => r.eid === eid ? { ...r, cells: {}, customTimes: {} } : r));
  }

  // Convert shift code → start/end times
  function codeToTimes(code: string, custom?: { start: string; end: string }): { start: string; end: string } | null {
    if (code === "Off" || !code) return null;
    if (code === "custom" && custom) return custom;
    const p = presetByCode(code);
    return p ? { start: p.start, end: p.end } : null;
  }

  async function handleSave() {
    if (!activeAgency) {
      toast({ title: "No agency selected", description: "Select an agency tab before saving.", variant: "destructive" });
      return;
    }
    const toCreate: object[] = [];
    const allSectionRows = [
      ...activeRows,
      ...activeReliefRows,
      ...activeReserveRows,
    ];
    for (const row of allSectionRows) {
      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        const code = row.cells[dateStr] ?? "";
        const times = codeToTimes(code, row.customTimes[dateStr]);
        if (!times) continue;
        toCreate.push({
          eid:        row.eid,
          date:       dateStr,
          shiftStart: times.start,
          shiftEnd:   times.end,
          armed:      "Unarmed",
          location:   row.location || null,
          client:     activeAgency,
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
      // Mark this agency tab as saved
      setAgencyRosters((prev) =>
        prev.map((ar) => ar.agency === activeAgency ? { ...ar, savedCount: toCreate.length } : ar)
      );
      toast({ title: `${toCreate.length} shift${toCreate.length > 1 ? "s" : ""} saved for ${activeAgency}` });
      onSaved();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const totalShifts = [...activeRows, ...activeReliefRows, ...activeReserveRows].reduce((sum, row) =>
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
          <Button onClick={handleSave} disabled={saving || activeRows.length === 0 || !activeAgency} size="sm" data-testid="button-roster-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {activeAgency ? `Save ${activeAgency}` : "Save Roster"}
          </Button>

          {/* ── Download / Print dropdown ──────────────────────────────────── */}
          <div ref={exportRef} className="relative" data-testid="export-dropdown-container">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen((o) => !o)}
              disabled={activeRows.length === 0 || !activeAgency}
              data-testid="button-export-open"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
              <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-md border border-border bg-background shadow-lg py-1">
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={exportExcel}
                  data-testid="button-export-excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">Excel (.xlsx)</div>
                    <div className="text-[10px] text-muted-foreground">Open in Microsoft Excel</div>
                  </div>
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={exportCSV}
                  data-testid="button-export-csv"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">CSV (.csv)</div>
                    <div className="text-[10px] text-muted-foreground">Compatible with Excel &amp; Sheets</div>
                  </div>
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={exportWord}
                  data-testid="button-export-word"
                >
                  <FileText className="w-4 h-4 text-blue-700 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">Word (.doc)</div>
                    <div className="text-[10px] text-muted-foreground">Open in Microsoft Word</div>
                  </div>
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={exportPDF}
                  data-testid="button-export-pdf"
                >
                  <Printer className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">Print / PDF</div>
                    <div className="text-[10px] text-muted-foreground">Print or save as PDF</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button onClick={onClose} className="p-2 rounded hover:bg-muted transition-colors" data-testid="button-roster-close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Agency tab strip (Excel-style sheet tabs) ──────────────────────── */}
      <div className="flex items-end gap-0 px-4 pt-2 border-b bg-muted/10 shrink-0 overflow-x-auto">
        {agencyRosters.map((ar) => (
          <div
            key={ar.agency}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium border-t border-l border-r rounded-t-md cursor-pointer select-none transition-colors mr-0.5 ${
              ar.agency === activeAgency
                ? "bg-background border-border text-foreground shadow-sm"
                : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setActiveAgency(ar.agency)}
            data-testid={`roster-tab-${ar.agency}`}
          >
            <span>{ar.agency}</span>
            {ar.savedCount !== undefined && (
              <span className="text-[10px] text-emerald-600 font-semibold">✓{ar.savedCount}</span>
            )}
            {ar.rows.length > 0 && ar.savedCount === undefined && (
              <span className="text-[10px] bg-primary/20 text-primary rounded-full px-1.5">{ar.rows.length}</span>
            )}
            <button
              type="button"
              className="w-3.5 h-3.5 rounded-full hover:bg-muted-foreground/20 flex items-center justify-center ml-0.5"
              onClick={(e) => { e.stopPropagation(); closeAgency(ar.agency); }}
              data-testid={`roster-tab-close-${ar.agency}`}
              title={`Close ${ar.agency}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
        {agencyRosters.length === 0 && (
          <span className="text-xs text-muted-foreground pb-2 italic">No agency open — search below to start</span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-64 border-r flex flex-col shrink-0 overflow-y-auto bg-muted/20">
          <div className="p-3 space-y-3">
            {/* Agency search — above employee search */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Agency / Client</p>
              <AgencyCombo onSelect={openAgency} existing={agencyRosters.map((ar) => ar.agency)} />
            </div>

            {/* ── MAIN section ─────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Add Employee</p>
              {activeAgency
                ? <EmpCombo employees={availableEmps} onAdd={addEmployee} />
                : <p className="text-xs text-muted-foreground italic">Select an agency first</p>
              }
            </div>

            {activeRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">On Roster ({activeRows.length})</p>
                <div className="space-y-1">
                  {activeRows.map((r) => (
                    <div key={r.eid} className="flex items-center justify-between gap-1 bg-background border rounded px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.pos}</p>
                      </div>
                      <button onClick={() => removeEmployee(r.eid)} className="shrink-0 p-0.5 hover:text-destructive transition-colors" data-testid={`remove-main-${r.eid}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── RELIEF SECURITY section ───────────────────────────────────── */}
            {activeAgency && (
              <div className="border-t pt-3">
                <button
                  type="button"
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                    reliefOpen
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300"
                      : "bg-muted text-muted-foreground hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700"
                  }`}
                  onClick={() => setReliefOpen((o) => !o)}
                  data-testid="button-toggle-relief"
                >
                  <span>Relief Security{activeReliefRows.length > 0 ? ` (${activeReliefRows.length})` : ""}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${reliefOpen ? "rotate-180" : ""}`} />
                </button>

                {reliefOpen && (
                  <div className="mt-2 space-y-2">
                    <EmpCombo employees={availableRelief} onAdd={addRelief} />
                    {activeReliefRows.length > 0 && (
                      <div className="space-y-1">
                        {activeReliefRows.map((r) => (
                          <div key={r.eid} className="flex items-center justify-between gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{r.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{r.pos}</p>
                            </div>
                            <button onClick={() => removeRelief(r.eid)} className="shrink-0 p-0.5 hover:text-destructive transition-colors" data-testid={`remove-relief-${r.eid}`}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── RESERVE section ───────────────────────────────────────────── */}
            {activeAgency && (
              <div className="border-t pt-3">
                <button
                  type="button"
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                    reserveOpen
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                      : "bg-muted text-muted-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700"
                  }`}
                  onClick={() => setReserveOpen((o) => !o)}
                  data-testid="button-toggle-reserve"
                >
                  <span>Reserve{activeReserveRows.length > 0 ? ` (${activeReserveRows.length})` : ""}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${reserveOpen ? "rotate-180" : ""}`} />
                </button>

                {reserveOpen && (
                  <div className="mt-2 space-y-2">
                    <EmpCombo employees={availableReserve} onAdd={addReserve} />
                    {activeReserveRows.length > 0 && (
                      <div className="space-y-1">
                        {activeReserveRows.map((r) => (
                          <div key={r.eid} className="flex items-center justify-between gap-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{r.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{r.pos}</p>
                            </div>
                            <button onClick={() => removeReserve(r.eid)} className="shrink-0 p-0.5 hover:text-destructive transition-colors" data-testid={`remove-reserve-${r.eid}`}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </aside>

        {/* ── Grid area ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-3">
          {!activeAgency ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
              <Search className="w-10 h-10 opacity-20" />
              <div>
                <p className="font-medium">No agency selected</p>
                <p className="text-sm">Search for an agency in the left panel to open a roster sheet</p>
              </div>
            </div>
          ) : (activeRows.length === 0 && activeReliefRows.length === 0 && activeReserveRows.length === 0) ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
              <Search className="w-10 h-10 opacity-20" />
              <div>
                <p className="font-semibold">{activeAgency} roster is empty</p>
                <p className="text-sm">Add employees from the left panel, or open a Relief / Reserve section</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── Main roster table ─────────────────────────────────────────── */}
              {activeRows.length > 0 && (
                <SectionGrid
                  rows={activeRows}
                  days={days}
                  DAY_ABBR={DAY_ABBR}
                  todayFmt={todayFmt}
                  callSignRegistry={callSignRegistry}
                  onUpdateField={updateRowField}
                  onUpdateCell={updateCell}
                  onFillRow={fillRow}
                  onClearRow={clearRow}
                />
              )}

              {/* ── Relief Security section ───────────────────────────────────── */}
              {activeReliefRows.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 border-t border-amber-300 dark:border-amber-700" />
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-full px-3 py-0.5">
                      Relief Security
                    </span>
                    <div className="flex-1 border-t border-amber-300 dark:border-amber-700" />
                  </div>
                  <SectionGrid
                    rows={activeReliefRows}
                    days={days}
                    DAY_ABBR={DAY_ABBR}
                    todayFmt={todayFmt}
                    callSignRegistry={callSignRegistry}
                    onUpdateField={updateReliefRowField}
                    onUpdateCell={updateReliefCell}
                    onFillRow={fillReliefRow}
                    onClearRow={clearReliefRow}
                  />
                </div>
              )}

              {/* ── Reserve section ───────────────────────────────────────────── */}
              {activeReserveRows.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 border-t border-blue-300 dark:border-blue-700" />
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-full px-3 py-0.5">
                      Reserve
                    </span>
                    <div className="flex-1 border-t border-blue-300 dark:border-blue-700" />
                  </div>
                  <SectionGrid
                    rows={activeReserveRows}
                    days={days}
                    DAY_ABBR={DAY_ABBR}
                    todayFmt={todayFmt}
                    callSignRegistry={callSignRegistry}
                    onUpdateField={updateReserveRowField}
                    onUpdateCell={updateReserveCell}
                    onFillRow={fillReserveRow}
                    onClearRow={clearReserveRow}
                  />
                </div>
              )}

            </div>
          )}
        </main>
      </div>

      {/* ── Bottom status bar ──────────────────────────────────────────────── */}
      {(activeRows.length > 0 || activeReliefRows.length > 0 || activeReserveRows.length > 0) && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-4 bg-muted/20 shrink-0 flex-wrap">
          {activeAgency && <span className="font-semibold text-foreground">{activeAgency}</span>}
          {activeAgency && <span>·</span>}
          {activeRows.length > 0 && <span>{activeRows.length} main</span>}
          {activeReliefRows.length > 0 && <span className="text-amber-700">{activeReliefRows.length} relief</span>}
          {activeReserveRows.length > 0 && <span className="text-blue-700">{activeReserveRows.length} reserve</span>}
          <span>·</span>
          <span>{days.length} days</span>
          <span>·</span>
          <span className="font-medium text-foreground">{totalShifts} shifts planned</span>
          <span>·</span>
          {Object.values(SHIFT_PRESETS).filter(p => p.code !== "Off").map(p => {
            const allRows = [...activeRows, ...activeReliefRows, ...activeReserveRows];
            const cnt = allRows.reduce((s, r) => s + Object.values(r.cells).filter(c => c === p.code).length, 0);
            return cnt > 0 ? <span key={p.code} className={`${p.text} font-medium`}>{p.label}: {cnt}</span> : null;
          })}
          {(() => {
            const allRows = [...activeRows, ...activeReliefRows, ...activeReserveRows];
            const customCnt = allRows.reduce((s, r) => s + Object.values(r.cells).filter(c => c === "custom").length, 0);
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
