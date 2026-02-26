import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, eachDayOfInterval, parseISO, startOfWeek, addWeeks } from "date-fns";
import {
  X, Plus, Search, ChevronDown, Save, Loader2, Shield, ShieldOff,
  Trash2, RefreshCw, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FMS_LOCATIONS, CLIENT_AGENCIES, type ClientAgency, type ArmedStatus } from "@shared/schema";

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

// ── Main RosterBuilder ────────────────────────────────────────────────────────
export function RosterBuilder({ open, onClose, employees, onSaved }: Props) {
  const { user }  = useAuth();
  const { toast } = useToast();
  const qc        = useQueryClient();
  const todayStr  = format(new Date(), "yyyy-MM-dd");

  // Period
  const defaultStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const defaultEnd   = format(addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 2), "yyyy-MM-dd");

  const [dateFrom,  setDateFrom]  = useState(defaultStart);
  const [dateTo,    setDateTo]    = useState(defaultEnd);
  const [location,  setLocation]  = useState("");
  const [client,    setClient]    = useState<ClientAgency | "">("");
  const [armed,     setArmed]     = useState<ArmedStatus>("Unarmed");
  const [rows,      setRows]      = useState<EmpRow[]>([]);
  const [saving,    setSaving]    = useState(false);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setDateFrom(defaultStart);
      setDateTo(defaultEnd);
      setLocation("");
      setClient("");
      setArmed("Unarmed");
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
    setRows((prev) => [...prev, { eid: emp.userId, name: emp.name, pos: emp.pos, cells: {}, customTimes: {} }]);
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
          armed,
          location:   location || null,
          client:     client   || null,
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Roster Builder</h2>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Period:</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-2 py-1 text-sm h-8" />
            <span>→</span>
            <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-2 py-1 text-sm h-8" />
            <span className="text-xs text-muted-foreground">({days.length} days)</span>
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

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Apply to All</p>

              <div className="space-y-1">
                <Label className="text-xs">Armed Status</Label>
                <div className="flex gap-1.5">
                  {(["Unarmed", "Armed"] as ArmedStatus[]).map((a) => (
                    <button key={a} type="button" onClick={() => setArmed(a)}
                      className={`flex-1 py-1 rounded border text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                        armed === a
                          ? a === "Armed" ? "bg-red-600 text-white border-red-600" : "bg-blue-600 text-white border-blue-600"
                          : "bg-background border-input hover:bg-muted"
                      }`}
                      data-testid={`button-roster-armed-${a.toLowerCase()}`}
                    >
                      {a === "Armed" ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />Location</Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  data-testid="select-roster-location"
                >
                  <option value="">— Select location —</option>
                  {FMS_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Client / Agency</Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  value={client}
                  onChange={(e) => setClient(e.target.value as ClientAgency | "")}
                  data-testid="select-roster-client"
                >
                  <option value="">— Select client —</option>
                  {CLIENT_AGENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
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
                  {/* Employee header */}
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-40 sticky left-0 bg-background z-10 border-b">
                    Employee
                  </th>
                  {/* Quick fill header */}
                  <th className="py-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide w-24 sticky left-40 bg-background z-10 border-b">
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
                    {/* Employee name cell */}
                    <td className="py-1.5 px-3 align-middle sticky left-0 bg-background group-hover:bg-muted/10 z-10 border-r">
                      <div className="font-medium text-sm truncate max-w-[140px]">{row.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{row.pos}</div>
                    </td>

                    {/* Quick fill buttons */}
                    <td className="py-1 px-1 align-middle sticky left-40 bg-background group-hover:bg-muted/10 z-10 border-r">
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
