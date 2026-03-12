import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCreateTimesheet, useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { useGeofences } from "@/hooks/use-geofences";
import { useSchedules } from "@/hooks/use-schedules";
import { useCreateRequest } from "@/hooks/use-requests";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, LogIn, LogOut, CheckCircle2, Navigation, AlertTriangle, PenLine, ShieldCheck, Car, Wifi, Shield, ShieldOff, Siren, HeartPulse, UserX } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  DAY_STATUSES, HOLIDAY_TYPES, ARMED_STATUSES, CLIENT_AGENCIES,
  PH_HOLIDAYS,
  type DayStatus, type HolidayType, type ArmedStatus, type ClientAgency,
} from "@shared/schema";

// ── Haversine distance ───────────────────────────────────────────────────────
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Zone → Client auto-mapping ───────────────────────────────────────────────
const ZONE_CLIENT_MAP: Record<string, ClientAgency> = {
  "HEAD OFFICE": "Head Office",
  "CARICOM":     "Caricom",
  "EU":          "EU",
  "UN":          "UN",
  "DMC":         "DMC",
  "ARU":         "ARU",
  "CANTEEN":     "Canteen",
};

// ── Auto time-out calculation (from FMS formula doc) ────────────────────────
// TIME employees: morning shift starts at 6 AM
// FIXED / EXECUTIVE: morning shift starts at 5 AM
function calcAutoTimeOut(timeIn: string, cat: string): string {
  const [h, m] = timeIn.split(":").map(Number);
  const mins = h * 60 + m;
  const morningStart = (cat === "Fixed" || cat === "Executive") ? 5 * 60 : 6 * 60;

  if (mins >= 1    && mins <= 2   * 60) return "07:00"; // Night late arrival: 12:01–2:00 AM → 7 AM
  if (mins >= morningStart && mins <= 8 * 60) return "12:00"; // Morning on-time → 12 PM
  if (mins >  8   * 60 && mins <= 13 * 60 + 59) return "15:00"; // Late morning → 3 PM
  if (mins >= 14  * 60 && mins <= 17 * 60 + 59) return "21:00"; // Afternoon → 9 PM
  if (mins >= 18  * 60 && mins <= 21 * 60 + 59) return "00:00"; // Evening → Midnight
  if (mins >= 22  * 60 && mins <= 23 * 60 + 59) return "07:00"; // Night → 7 AM next day
  return "";
}

// ── Meal entitlement (1 meal per qualifying shift) ───────────────────────────
// No meals if client = Canteen or Head Office
// TIME: qualifying clock-in window = 06–07, 14–15, 18–19, 22–23
// FIXED/EXECUTIVE: qualifying window = 05–07, 14–15, 18–19  (no 22–23)
function calcMeals(timeIn: string, client: string, cat: string, totalHours: number): number {
  if (!timeIn || totalHours <= 0) return 0;
  if (client === "Canteen" || client === "Head Office") return 0;
  const [h] = timeIn.split(":").map(Number);
  const windows: Array<[number, number]> =
    cat === "Time"
      ? [[6, 7], [14, 15], [18, 19], [22, 23]]
      : [[5, 7], [14, 15], [18, 19]];
  return windows.some(([s, e]) => h >= s && h < e) ? 1 : 0;
}

// ── Hours split (reg / ot / ph) based on dayStatus ──────────────────────────
function splitHours(totalHours: number, dayStatus: DayStatus, holidayType: HolidayType | "") {
  if (dayStatus === "Sick" || dayStatus === "Absent" || dayStatus === "Annual Leave") {
    return { reg: 0, ot: 0, ph: 0 };
  }
  if (dayStatus === "Off Day") {
    return { reg: 0, ot: totalHours, ph: 0 };
  }
  if (dayStatus === "Holiday") {
    if (holidayType && PH_HOLIDAYS.includes(holidayType as any)) {
      return { reg: 0, ot: 0, ph: totalHours };
    }
    // Holiday Double or unknown → OT
    return { reg: 0, ot: totalHours, ph: 0 };
  }
  // On Day
  return {
    reg: Math.min(8, totalHours),
    ot:  Math.max(0, totalHours - 8),
    ph:  0,
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export function ClockInOut() {
  const { user } = useAuth();
  const todayDate = format(new Date(), "yyyy-MM-dd");
  const { data: timesheets } = useTimesheets({ startDate: todayDate, endDate: todayDate, eid: user?.userId });
  const { data: allGeofences } = useGeofences();
  const { data: mySchedules = [] } = useSchedules(user?.userId);
  const { mutateAsync: createTimesheet, isPending: isCreating } = useCreateTimesheet();
  const { mutateAsync: updateTimesheet, isPending: isUpdating } = useUpdateTimesheet();
  const { mutateAsync: createRequest, isPending: isSubmittingAction } = useCreateRequest();
  const { toast } = useToast();
  const [actionOpen, setActionOpen] = useState(false);
  const [actionNote, setActionNote] = useState("");

  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedPost, setSelectedPost] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); // metres, from browser Geolocation API
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "ok" | "error">("idle");
  const [distanceFromZone, setDistanceFromZone] = useState<number | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);

  const [client, setClient] = useState<ClientAgency | "">("");

  // ── Auto-detect day status and armed status from today's schedule ─────────
  const todaySchedule = mySchedules.find((s) => s.date === todayDate) ?? null;
  const dayStatus: DayStatus     = todaySchedule ? "On Day" : "Off Day";
  const armedStatus: ArmedStatus =
    (todaySchedule?.armed as ArmedStatus | undefined) ??
    ((user as any)?.armed as ArmedStatus | undefined) ??
    "Unarmed";
  // Holiday type is not set at clock-in — manager applies it via timesheet edit
  const holidayType: HolidayType | "" = "";

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-fill client when zone changes
  useEffect(() => {
    if (selectedZone) {
      const mapped = ZONE_CLIENT_MAP[selectedZone.toUpperCase()] ?? null;
      if (mapped) setClient(mapped);
    }
  }, [selectedZone]);

  const today = todayDate;
  const todaysTsList = timesheets ?? [];
  const todaysTs = todaysTsList.find((t) => t.ci && !t.co) ?? null;
  const hasClockedIn = !!todaysTs;

  const availableZones = (allGeofences ?? []).filter((g) => g.active);

  const selectedFence = availableZones.find((g) => g.name === selectedZone);
  const mobility: string = (user as any)?.mobility ?? "fixed";
  const clockInFence = (allGeofences ?? []).find((g) => g.name === todaysTs?.zone);

  const distanceFromClockInZone =
    gpsCoords && clockInFence
      ? Math.round(haversineMetres(gpsCoords.lat, gpsCoords.lng, clockInFence.lat, clockInFence.lng))
      : null;

  const isWithinClockInZone =
    gpsCoords && clockInFence
      ? haversineMetres(gpsCoords.lat, gpsCoords.lng, clockInFence.lat, clockInFence.lng) <= clockInFence.radius + Math.min(gpsAccuracy ?? 0, 100)
      : false;

  const enableLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", description: "Your browser does not support GPS.", variant: "destructive" });
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const acc = Math.round(pos.coords.accuracy ?? 0);
        setGpsCoords(coords);
        setGpsAccuracy(acc);
        setGpsStatus("ok");
        setLocationEnabled(true);
        if (selectedFence) {
          setDistanceFromZone(Math.round(haversineMetres(coords.lat, coords.lng, selectedFence.lat, selectedFence.lng)));
        }
        toast({ title: "Location captured", description: `GPS accuracy: ±${acc}m` });
      },
      (err) => {
        setGpsStatus("error");
        toast({ title: "Location access denied", description: err.message || "Please allow location access.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleZoneChange = (zoneName: string) => {
    setSelectedZone(zoneName);
    setSelectedPost("");
    const fence = availableZones.find((g) => g.name === zoneName);
    if (fence && gpsCoords) {
      setDistanceFromZone(Math.round(haversineMetres(gpsCoords.lat, gpsCoords.lng, fence.lat, fence.lng)));
    } else {
      setDistanceFromZone(null);
    }
  };

  // GPS accuracy buffer: capped at 100m to prevent very poor network fixes
  // from granting access far from the fence.
  const accuracyBuffer = Math.min(gpsAccuracy ?? 0, 100);

  const isWithinFence = () => {
    if (!selectedFence || !gpsCoords) return false;
    const dist = haversineMetres(gpsCoords.lat, gpsCoords.lng, selectedFence.lat, selectedFence.lng);
    return dist <= selectedFence.radius + accuracyBuffer;
  };

  // True only when the user is within the hard radius (no accuracy padding needed)
  const isStrictlyWithinFence = () => {
    if (!selectedFence || !gpsCoords) return false;
    return haversineMetres(gpsCoords.lat, gpsCoords.lng, selectedFence.lat, selectedFence.lng) <= selectedFence.radius;
  };

  // ── Clock In ─────────────────────────────────────────────────────────────
  const handleClockIn = async () => {
    if (!user) return;
    if (!locationEnabled || !gpsCoords) {
      toast({ title: "Location required", description: "Please enable your location first.", variant: "destructive" });
      return;
    }
    if (!selectedZone || !selectedFence) {
      toast({ title: "Work location required", description: "Please select your work location.", variant: "destructive" });
      return;
    }
    if (!isWithinFence()) {
      toast({
        title: "Outside work zone",
        description: `You are ${distanceFromZone ?? "?"}m from ${selectedZone} (radius: ${selectedFence.radius}m). Move closer to clock in.`,
        variant: "destructive",
      });
      return;
    }

    const ciTime = format(new Date(), "HH:mm");
    const autoOut = calcAutoTimeOut(ciTime, user.cat ?? "Time");

    try {
      await createTimesheet({
        tsId: `TS-${Date.now()}`,
        eid: user.userId,
        date: today,
        ci: ciTime,
        gIn: gpsCoords,
        zone: selectedZone,
        post: selectedPost || null,
        dayStatus,
        holidayType: dayStatus === "Holiday" ? (holidayType || null) : null,
        armed: armedStatus,
        client: client || null,
        status: "pending_employee",
        reg: 0, ot: 0, ph: 0, brk: 0, meals: 0,
        notes: autoOut ? `Auto time-out: ${autoOut}` : "",
        edited: false, hist: [],
      } as any);

      toast({
        title: "Clocked in!",
        description: `${selectedZone}${selectedPost ? ` · ${selectedPost}` : ""} · ${armedStatus}${autoOut ? ` · Expected out: ${autoOut}` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Clock in failed", description: err.message, variant: "destructive" });
    }
  };

  // ── Clock Out ────────────────────────────────────────────────────────────
  const handleClockOut = async () => {
    if (!todaysTs) return;
    if (!gpsCoords) {
      toast({ title: "Location required", description: "Please enable your location to clock out.", variant: "destructive" });
      return;
    }
    if (mobility === "fixed" && clockInFence && !isWithinClockInZone) {
      toast({
        title: "Outside your work zone",
        description: `You must be within ${todaysTs.zone} (radius: ${clockInFence.radius}m) to clock out. You are ${distanceFromClockInZone}m away.`,
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    const nowStr = format(new Date(), "HH:mm");
    const [ih, im] = (todaysTs.ci ?? "08:00").split(":").map(Number);
    const [oh, om] = nowStr.split(":").map(Number);
    let totalMins = (oh * 60 + om) - (ih * 60 + im);
    if (totalMins < 0) totalMins += 24 * 60; // crosses midnight
    const workMins = Math.max(0, totalMins - 30); // 30-min break
    const totalHours = Math.round((workMins / 60) * 100) / 100;

    const ds = (todaysTs.dayStatus as DayStatus) ?? "On Day";
    const ht = (todaysTs.holidayType as HolidayType | "") ?? "";
    const { reg, ot, ph } = splitHours(totalHours, ds, ht);

    const mealCount = calcMeals(
      todaysTs.ci ?? "",
      todaysTs.client ?? "",
      user?.cat ?? "Time",
      totalHours
    );

    let notes = todaysTs.notes ?? "";
    if (clockInFence && !isWithinClockInZone && mobility !== "fixed") {
      const tag = `[Auto] Clocked out ${distanceFromClockInZone}m from ${todaysTs.zone} (${mobility}).`;
      notes = notes ? `${notes}\n${tag}` : tag;
    }

    try {
      await updateTimesheet({
        id: todaysTs.id,
        co: nowStr,
        gOut: gpsCoords,
        reg: Math.round(reg * 100) / 100,
        ot:  Math.round(ot  * 100) / 100,
        ph:  Math.round(ph  * 100) / 100,
        brk: 30,
        meals: mealCount,
        status: "pending_employee",
        notes,
      });

      const summary = [
        reg > 0 ? `${reg.toFixed(1)}h reg` : null,
        ot  > 0 ? `${ot.toFixed(1)}h OT` : null,
        ph  > 0 ? `${ph.toFixed(1)}h PH` : null,
        mealCount > 0 ? `${mealCount} meal` : null,
      ].filter(Boolean).join(" · ");

      toast({ title: "Clocked out!", description: summary || `${totalHours.toFixed(1)}h total` });
    } catch (err: any) {
      toast({ title: "Clock out failed", description: err.message, variant: "destructive" });
    }
  };

  const [, setLocation] = useLocation();
  if (!user) return null;

  const fenceOk      = locationEnabled && selectedZone && isWithinFence();
  const fenceStrict  = locationEnabled && selectedZone && isStrictlyWithinFence();
  const fenceFail    = locationEnabled && selectedZone && !isWithinFence();
  // True when inside only because of the accuracy buffer (not hard radius)
  const fenceByAccuracy = fenceOk && !fenceStrict;
  const clockOutZoneOk   = gpsCoords && clockInFence && isWithinClockInZone;
  const clockOutZoneFail = gpsCoords && clockInFence && !isWithinClockInZone;

  const mobilityIcon =
    mobility === "mobile" ? <Car className="w-3 h-3" /> :
    mobility === "remote" ? <Wifi className="w-3 h-3" /> :
    <MapPin className="w-3 h-3" />;
  const mobilityLabel =
    mobility === "mobile" ? "Mobile" :
    mobility === "remote" ? "Remote" : "Fixed";

  const selectCls = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-50";

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div className="flex flex-col md:flex-row gap-0 divide-y md:divide-y-0 md:divide-x divide-border">

        {/* ── Live clock ── */}
        <div className="flex-1 p-5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Current Time
          </p>
          <p className="text-3xl font-mono font-semibold">{format(currentTime, "hh:mm:ss a")}</p>
          <p className="text-xs text-muted-foreground mt-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>

          {todaysTs?.ci && (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <p>Clocked in: <strong className="text-foreground">{todaysTs.ci}</strong>
                {todaysTs.co && <> · Out: <strong className="text-foreground">{todaysTs.co}</strong></>}
              </p>
              {todaysTs.zone && <p>Zone: <strong className="text-foreground">{todaysTs.zone}</strong>{todaysTs.post ? ` · ${todaysTs.post}` : ""}</p>}
              {todaysTs.dayStatus && <p>Status: <strong className="text-foreground">{todaysTs.dayStatus}</strong>{todaysTs.holidayType ? ` (${todaysTs.holidayType})` : ""}</p>}
              {todaysTs.armed && <p>Armed: <strong className={todaysTs.armed === "Armed" ? "text-red-600" : "text-foreground"}>{todaysTs.armed}</strong></p>}
              {todaysTs.client && <p>Client: <strong className="text-foreground">{todaysTs.client}</strong></p>}
            </div>
          )}

          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {mobilityIcon}
            <span>{mobilityLabel} worker</span>
            {mobility === "fixed"  && <span className="text-orange-600 font-medium">· zone-locked</span>}
            {mobility === "mobile" && <span className="text-blue-600 font-medium">· may leave zone</span>}
            {mobility === "remote" && <span className="text-purple-600 font-medium">· offsite permitted</span>}
          </div>
        </div>

        {/* ── Zone / shift setup / GPS ── */}
        <div className="flex-1 p-5 space-y-3">
          {!hasClockedIn ? (
            <>
              {/* Work location */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Work Location
                </p>
                {availableZones.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No active work locations found.</p>
                ) : (
                  <select className={selectCls} value={selectedZone} onChange={(e) => handleZoneChange(e.target.value)} data-testid="select-work-zone">
                    <option value="">— Select your work location —</option>
                    {availableZones.map((g) => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                )}

                {selectedZone && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Post <span className="font-normal">(optional)</span>
                    </p>
                    <select className={selectCls} value={selectedPost} onChange={(e) => setSelectedPost(e.target.value)} data-testid="select-post-number">
                      <option value="">— Select post —</option>
                      {(selectedFence?.postNames?.length
                        ? selectedFence.postNames
                        : Array.from({ length: selectedFence?.posts ?? 10 }, (_, i) => `Post ${i + 1}`)
                      ).map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Auto-detected shift info (read-only) */}
              <div className={`rounded-md border px-3 py-2.5 text-sm ${
                dayStatus === "On Day"
                  ? "bg-green-50 border-green-200 text-green-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`} data-testid="shift-status-info">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {dayStatus === "On Day"
                      ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                      : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <p className="font-semibold leading-tight">
                      {dayStatus === "On Day" ? "Scheduled today — On Day" : "Not on schedule — Off Day"}
                    </p>
                    <p className="text-xs opacity-80">
                      {armedStatus === "Armed"
                        ? <><Shield className="w-3 h-3 inline mr-0.5" />Armed</>
                        : <><ShieldOff className="w-3 h-3 inline mr-0.5" />Unarmed</>}
                      {" · "}
                      {todaySchedule
                        ? `Shift: ${todaySchedule.shiftStart}–${todaySchedule.shiftEnd}`
                        : `from profile default`}
                      {todaySchedule?.location && ` · ${todaySchedule.location}`}
                      {todaySchedule?.company && ` · ${todaySchedule.company}`}
                    </p>
                  </div>
                </div>
                {/* Take Action — only when scheduled but not yet clocked in */}
                {dayStatus === "On Day" && !hasClockedIn && (
                  <button
                    onClick={() => setActionOpen(true)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-green-800 underline underline-offset-2 hover:text-green-700 transition-colors"
                    data-testid="button-take-action"
                  >
                    <Siren className="w-3 h-3" /> Can't make it today? Report here
                  </button>
                )}
              </div>

              {/* Enable GPS */}
              <button
                onClick={enableLocation}
                disabled={gpsStatus === "locating"}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  gpsStatus === "ok"    ? "border-green-300 bg-green-50 text-green-700" :
                  gpsStatus === "error" ? "border-red-300 bg-red-50 text-red-700" :
                  "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid="button-enable-location"
              >
                <Navigation className={`w-4 h-4 ${gpsStatus === "locating" ? "animate-pulse" : ""}`} />
                {gpsStatus === "idle"     && "Enable Location"}
                {gpsStatus === "locating" && "Getting GPS coordinates..."}
                {gpsStatus === "ok"       && `${gpsCoords?.lat.toFixed(6)}, ${gpsCoords?.lng.toFixed(6)} · ±${gpsAccuracy ?? "?"}m accuracy`}
                {gpsStatus === "error"    && "Location denied — tap to retry"}
              </button>

              {/* Warn when GPS accuracy is too poor to be trusted */}
              {locationEnabled && gpsAccuracy !== null && gpsAccuracy > 500 && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm font-medium" data-testid="gps-accuracy-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>GPS accuracy is very poor (±{gpsAccuracy}m). Your device is using network/IP location instead of real GPS. Enable device GPS or move outdoors and tap the button again for a better fix.</span>
                </div>
              )}

              {locationEnabled && selectedZone && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium ${
                  fenceStrict     ? "border-green-300 bg-green-50 text-green-700" :
                  fenceByAccuracy ? "border-amber-300 bg-amber-50 text-amber-700" :
                  "border-red-300 bg-red-50 text-red-700"
                }`} data-testid="geofence-status">
                  {fenceStrict
                    ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> Within {selectedZone} zone ({distanceFromZone}m from centre · limit {selectedFence?.radius}m)</>
                    : fenceByAccuracy
                    ? <><AlertTriangle className="w-4 h-4 shrink-0" /> Near {selectedZone} ({distanceFromZone}m) — GPS accuracy ±{gpsAccuracy}m, clock-in allowed</>
                    : <><AlertTriangle className="w-4 h-4 shrink-0" /> Outside zone — {distanceFromZone}m from centre (limit {selectedFence?.radius}m)</>
                  }
                </div>
              )}

              {/* Auto time-out preview */}
              {locationEnabled && selectedZone && fenceOk && (() => {
                const preview = calcAutoTimeOut(format(currentTime, "HH:mm"), user.cat ?? "Time");
                return preview ? (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Expected shift end: <strong className="text-foreground">{preview}</strong>
                    {" "}· Meals: <strong className="text-foreground">{client && (client === "Canteen" || client === "Head Office") ? "None (site policy)" : "1 if qualifying shift"}</strong>
                  </p>
                ) : null;
              })()}
            </>
          ) : (
            /* ── CLOCKED IN: show current shift info + GPS re-acquire ── */
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Current Shift
                </p>
                <div className="text-sm space-y-1">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                    <p><span className="text-muted-foreground">Zone:</span> <strong>{todaysTs?.zone}</strong></p>
                    <p><span className="text-muted-foreground">Post:</span> <strong>{todaysTs?.post ?? "—"}</strong></p>
                    <p><span className="text-muted-foreground">Status:</span> <strong>{todaysTs?.dayStatus ?? "On Day"}</strong></p>
                    <p><span className="text-muted-foreground">Client:</span> <strong>{todaysTs?.client ?? "—"}</strong></p>
                    <p><span className="text-muted-foreground">Armed:</span> <strong className={todaysTs?.armed === "Armed" ? "text-red-600" : ""}>{todaysTs?.armed ?? "—"}</strong></p>
                    <p><span className="text-muted-foreground">In:</span> <strong>{todaysTs?.ci}</strong></p>
                  </div>
                  {todaysTs?.holidayType && (
                    <p className="text-xs text-amber-700 font-medium">Holiday: {todaysTs.holidayType}</p>
                  )}
                </div>
              </div>

              <button
                onClick={enableLocation}
                disabled={gpsStatus === "locating"}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  gpsStatus === "ok"    ? "border-green-300 bg-green-50 text-green-700" :
                  gpsStatus === "error" ? "border-red-300 bg-red-50 text-red-700" :
                  "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid="button-enable-location"
              >
                <Navigation className={`w-4 h-4 ${gpsStatus === "locating" ? "animate-pulse" : ""}`} />
                {gpsStatus === "idle"     && "Enable Location to Clock Out"}
                {gpsStatus === "locating" && "Getting GPS coordinates..."}
                {gpsStatus === "ok"       && `${gpsCoords?.lat.toFixed(6)}, ${gpsCoords?.lng.toFixed(6)} · ±${gpsAccuracy ?? "?"}m accuracy`}
                {gpsStatus === "error"    && "Location denied — tap to retry"}
              </button>

              {gpsCoords && clockInFence && (
                <div className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm font-medium ${
                  clockOutZoneOk ? "border-green-300 bg-green-50 text-green-700" :
                  mobility === "fixed" ? "border-red-300 bg-red-50 text-red-700" :
                  "border-amber-300 bg-amber-50 text-amber-700"
                }`} data-testid="clock-out-zone-status">
                  {clockOutZoneOk ? (
                    <><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Within {todaysTs?.zone} — OK to clock out ({distanceFromClockInZone}m)</span></>
                  ) : mobility === "fixed" ? (
                    <><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>Outside {todaysTs?.zone}</strong> — {distanceFromClockInZone}m away (limit {clockInFence.radius}m). Return to zone to clock out.</span></>
                  ) : (
                    <><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>Outside {todaysTs?.zone}</strong> — {distanceFromClockInZone}m. {mobilityLabel} worker — may clock out but will be noted.</span></>
                  )}
                </div>
              )}

              {/* Preview of what clock-out will calculate */}
              {gpsCoords && todaysTs?.ci && (() => {
                const [ih, im] = todaysTs.ci.split(":").map(Number);
                const now = new Date();
                let mins = (now.getHours() * 60 + now.getMinutes()) - (ih * 60 + im);
                if (mins < 0) mins += 1440;
                const totalH = Math.max(0, (mins - 30) / 60);
                const ds = (todaysTs.dayStatus as DayStatus) ?? "On Day";
                const ht = (todaysTs.holidayType as HolidayType | "") ?? "";
                const { reg, ot, ph } = splitHours(totalH, ds, ht);
                const meals = calcMeals(todaysTs.ci, todaysTs.client ?? "", user.cat ?? "Time", totalH);
                return (
                  <p className="text-[11px] text-muted-foreground text-center">
                    If clocked out now: <strong className="text-foreground">
                      {[
                        reg > 0 ? `${reg.toFixed(1)}h reg` : null,
                        ot  > 0 ? `${ot.toFixed(1)}h OT`  : null,
                        ph  > 0 ? `${ph.toFixed(1)}h PH`  : null,
                        meals > 0 ? `${meals} meal` : null,
                      ].filter(Boolean).join(" · ") || "0h"}
                    </strong>
                  </p>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Clock button ── */}
        <div className="p-5 flex flex-col items-center justify-center gap-3 min-w-[180px]">
          {!hasClockedIn ? (
            <>
              <Button
                size="lg"
                className="w-full"
                onClick={handleClockIn}
                disabled={isCreating || !locationEnabled || !selectedZone || gpsStatus === "locating"}
                data-testid="button-clock-in"
              >
                <LogIn className="w-5 h-5 mr-2" />
                {isCreating ? "Processing..." : "Clock In"}
              </Button>
              <div className="text-xs text-muted-foreground text-center space-y-0.5">
                {!selectedZone && <p>Select location first</p>}
                {selectedZone && !locationEnabled && <p>Enable location first</p>}
                {locationEnabled && selectedZone && (
                  <p>
                    {armedStatus === "Armed"
                      ? <span className="text-red-600 font-medium">Armed · {dayStatus}</span>
                      : <span className="text-blue-600 font-medium">Unarmed · {dayStatus}</span>}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <Button
                size="lg"
                variant="destructive"
                className="w-full"
                onClick={handleClockOut}
                disabled={isUpdating || !gpsCoords || (mobility === "fixed" && !!clockInFence && !isWithinClockInZone)}
                data-testid="button-clock-out"
              >
                <LogOut className="w-5 h-5 mr-2" />
                {isUpdating ? "Processing..." : "Clock Out"}
              </Button>
              {!gpsCoords && (
                <p className="text-xs text-muted-foreground text-center">Enable location to clock out</p>
              )}
              {gpsCoords && mobility === "fixed" && clockInFence && !isWithinClockInZone && (
                <p className="text-xs text-red-600 text-center font-medium">Return to {todaysTs?.zone} to clock out</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Unsigned shifts banner ── */}
      {(() => {
        const unsigned = todaysTsList.filter((t) => t.ci && t.co && t.status === "pending_employee");
        if (unsigned.length === 0) return null;
        const single = unsigned.length === 1;
        return (
          <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <PenLine className="w-4 h-4 shrink-0" />
              <span>
                {single
                  ? <>Your <strong>{unsigned[0].ci}–{unsigned[0].co}</strong> shift needs your signature.</>
                  : <><strong>{unsigned.length} shifts</strong> today are awaiting your signature.</>}
              </span>
            </div>
            <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0" onClick={() => setLocation("/timesheets")} data-testid="button-go-sign">
              <PenLine className="w-3.5 h-3.5 mr-1.5" /> Review & Sign
            </Button>
          </div>
        );
      })()}

      {/* ── Take Action dialog ──────────────────────────────────────────────── */}
      <Dialog open={actionOpen} onOpenChange={(o) => { setActionOpen(o); if (!o) setActionNote(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Siren className="w-4 h-4 text-orange-500" /> Report Attendance Issue
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Select the reason you cannot attend your scheduled shift today ({format(new Date(), "MMMM d, yyyy")}).
            Your supervisor and admin will be notified immediately.
          </p>
          <div className="space-y-2 pt-1">
            {[
              { sub: "Sick",               icon: <HeartPulse className="w-4 h-4" />, label: "Report Sick",           desc: "I am unwell and cannot attend my shift." },
              { sub: "Emergency",          icon: <Siren      className="w-4 h-4" />, label: "Personal Emergency",    desc: "An urgent personal situation prevents attendance." },
              { sub: "Absent",             icon: <UserX      className="w-4 h-4" />, label: "Report Absence",        desc: "I will be absent from my shift today." },
            ].map(({ sub, icon, label, desc }) => (
              <button
                key={sub}
                disabled={isSubmittingAction}
                className="w-full flex items-start gap-3 border rounded-lg px-4 py-3 text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                data-testid={`action-${sub.toLowerCase()}`}
                onClick={async () => {
                  try {
                    await createRequest({
                      reqId: `ACT-${user.userId}-${Date.now()}`,
                      eid:   user.userId,
                      type:  "Attendance",
                      sub,
                      date:  format(new Date(), "yyyy-MM-dd"),
                      reason: actionNote.trim() || desc,
                      status: "pending",
                    });
                    toast({ title: "Report submitted", description: `Your ${label.toLowerCase()} has been sent to your supervisor and admin.` });
                    setActionOpen(false);
                    setActionNote("");
                  } catch (err: any) {
                    toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
                  }
                }}
              >
                <span className="text-primary mt-0.5 shrink-0">{icon}</span>
                <div>
                  <p className="font-semibold text-sm leading-tight">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="pt-1">
            <label className="text-xs font-medium text-muted-foreground">Additional note (optional)</label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder="e.g. Doctor's appointment, family emergency…"
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-action-note"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
