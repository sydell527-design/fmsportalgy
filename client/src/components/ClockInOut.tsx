import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCreateTimesheet, useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { useGeofences } from "@/hooks/use-geofences";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, LogIn, LogOut, CheckCircle2, Navigation, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ClockInOut() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { data: allGeofences } = useGeofences();
  const { mutateAsync: createTimesheet, isPending: isCreating } = useCreateTimesheet();
  const { mutateAsync: updateTimesheet, isPending: isUpdating } = useUpdateTimesheet();
  const { toast } = useToast();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedZone, setSelectedZone] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "ok" | "error">("idle");
  const [distanceFromZone, setDistanceFromZone] = useState<number | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  const todaysTs = timesheets?.find((t) => t.eid === user?.userId && t.date === today);
  const hasClockedIn = !!todaysTs?.ci;
  const hasClockedOut = !!todaysTs?.co;

  // Zones assigned to this employee that are active
  const assignedZoneNames = user?.geo ?? [];
  const availableZones = (allGeofences ?? []).filter(
    (g) => g.active && assignedZoneNames.includes(g.name)
  );

  // Find the currently selected zone's geofence record
  const selectedFence = availableZones.find((g) => g.name === selectedZone);

  const enableLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", description: "Your browser does not support GPS.", variant: "destructive" });
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsCoords(coords);
        setGpsStatus("ok");
        setLocationEnabled(true);
        // If a zone is already selected, calculate distance
        if (selectedFence) {
          const dist = haversineMetres(coords.lat, coords.lng, selectedFence.lat, selectedFence.lng);
          setDistanceFromZone(Math.round(dist));
        }
        toast({ title: "Location enabled", description: "GPS coordinates captured." });
      },
      (err) => {
        setGpsStatus("error");
        toast({
          title: "Location access denied",
          description: err.message || "Please allow location access in your browser to clock in.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleZoneChange = (zoneName: string) => {
    setSelectedZone(zoneName);
    const fence = availableZones.find((g) => g.name === zoneName);
    if (fence && gpsCoords) {
      const dist = haversineMetres(gpsCoords.lat, gpsCoords.lng, fence.lat, fence.lng);
      setDistanceFromZone(Math.round(dist));
    } else {
      setDistanceFromZone(null);
    }
  };

  const isWithinFence = () => {
    if (!selectedFence || !gpsCoords) return false;
    const dist = haversineMetres(gpsCoords.lat, gpsCoords.lng, selectedFence.lat, selectedFence.lng);
    return dist <= selectedFence.radius;
  };

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
      const dist = distanceFromZone ?? "?";
      toast({
        title: "Outside work zone",
        description: `You are ${dist}m from ${selectedZone} (radius: ${selectedFence.radius}m). Move closer to clock in.`,
        variant: "destructive",
      });
      return;
    }

    try {
      await createTimesheet({
        tsId: `TS-${Date.now()}`,
        eid: user.userId,
        date: today,
        ci: format(new Date(), "HH:mm"),
        gIn: gpsCoords,
        zone: selectedZone,
        status: "pending_employee",
        reg: 0, ot: 0, brk: 0,
        notes: "", edited: false, hist: [],
      } as any);
      toast({ title: "Clocked in!", description: `Zone: ${selectedZone}` });
    } catch (err: any) {
      toast({ title: "Clock in failed", description: err.message, variant: "destructive" });
    }
  };

  const handleClockOut = async () => {
    if (!todaysTs) return;

    // Re-acquire location for clock out too
    if (!gpsCoords) {
      toast({ title: "Location required", description: "Please enable your location to clock out.", variant: "destructive" });
      return;
    }

    // Recalculate hours
    const [ih, im] = (todaysTs.ci ?? "08:00").split(":").map(Number);
    const nowStr = format(new Date(), "HH:mm");
    const [oh, om] = nowStr.split(":").map(Number);
    const totalMins = oh * 60 + om - (ih * 60 + im);
    const workMins = Math.max(0, totalMins - 30);
    const reg = Math.min(8, workMins / 60);
    const ot = Math.max(0, workMins / 60 - 8);

    try {
      await updateTimesheet({
        id: todaysTs.id,
        co: format(new Date(), "HH:mm"),
        gOut: gpsCoords,
        reg: Math.round(reg * 100) / 100,
        ot: Math.round(ot * 100) / 100,
        brk: 30,
        status: "pending_employee",
      });
      toast({ title: "Clocked out!", description: `${reg.toFixed(1)}h regular${ot > 0 ? ` + ${ot.toFixed(1)}h OT` : ""}` });
    } catch (err: any) {
      toast({ title: "Clock out failed", description: err.message, variant: "destructive" });
    }
  };

  if (!user) return null;

  const fenceOk = locationEnabled && selectedZone && isWithinFence();
  const fenceFail = locationEnabled && selectedZone && !isWithinFence();

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      {/* Header row */}
      <div className="flex flex-col md:flex-row gap-0 divide-y md:divide-y-0 md:divide-x divide-border">

        {/* Live clock */}
        <div className="flex-1 p-5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Current Time
          </p>
          <p className="text-3xl font-mono font-semibold">{format(currentTime, "hh:mm:ss a")}</p>
          <p className="text-xs text-muted-foreground mt-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
          {todaysTs?.ci && (
            <p className="text-xs mt-2 text-muted-foreground">
              Clocked in: <strong className="text-foreground">{todaysTs.ci}</strong>
              {todaysTs.co && <> · Out: <strong className="text-foreground">{todaysTs.co}</strong></>}
              {todaysTs.zone && <> · Zone: <strong className="text-foreground">{todaysTs.zone}</strong></>}
            </p>
          )}
        </div>

        {/* Zone & GPS selector */}
        {!hasClockedOut && (
          <div className="flex-1 p-5 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Work Location
              </p>
              {availableZones.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No locations assigned to your profile.</p>
              ) : (
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-50"
                  value={selectedZone}
                  onChange={(e) => handleZoneChange(e.target.value)}
                  disabled={hasClockedIn}
                  data-testid="select-work-zone"
                >
                  <option value="">— Select your work location —</option>
                  {availableZones.map((g) => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* GPS button */}
            <button
              onClick={enableLocation}
              disabled={gpsStatus === "locating"}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                gpsStatus === "ok"
                  ? "border-green-300 bg-green-50 text-green-700"
                  : gpsStatus === "error"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
              data-testid="button-enable-location"
            >
              <Navigation className={`w-4 h-4 ${gpsStatus === "locating" ? "animate-pulse" : ""}`} />
              {gpsStatus === "idle" && "Enable Location"}
              {gpsStatus === "locating" && "Getting GPS coordinates..."}
              {gpsStatus === "ok" && `Location captured (${gpsCoords?.lat.toFixed(5)}, ${gpsCoords?.lng.toFixed(5)})`}
              {gpsStatus === "error" && "Location denied — tap to retry"}
            </button>

            {/* Geofence status indicator */}
            {locationEnabled && selectedZone && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium ${
                fenceOk ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"
              }`} data-testid="geofence-status">
                {fenceOk ? (
                  <><CheckCircle2 className="w-4 h-4 shrink-0" /> Within {selectedZone} zone ({distanceFromZone}m · limit {selectedFence?.radius}m)</>
                ) : (
                  <><AlertTriangle className="w-4 h-4 shrink-0" /> Outside zone — {distanceFromZone}m away (limit {selectedFence?.radius}m)</>
                )}
              </div>
            )}
          </div>
        )}

        {/* Clock button */}
        <div className="p-5 flex flex-col items-center justify-center gap-3 min-w-[180px]">
          {hasClockedOut ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="font-semibold text-sm">Shift Complete</p>
              <p className="text-xs text-muted-foreground">Submit your timesheet for approval</p>
            </div>
          ) : !hasClockedIn ? (
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
              {(!locationEnabled || !selectedZone) && (
                <p className="text-xs text-muted-foreground text-center">
                  {!selectedZone ? "Select location first" : "Enable location first"}
                </p>
              )}
            </>
          ) : (
            <>
              <Button
                size="lg"
                variant="destructive"
                className="w-full"
                onClick={handleClockOut}
                disabled={isUpdating || !gpsCoords}
                data-testid="button-clock-out"
              >
                <LogOut className="w-5 h-5 mr-2" />
                {isUpdating ? "Processing..." : "Clock Out"}
              </Button>
              {!gpsCoords && (
                <p className="text-xs text-muted-foreground text-center">Enable location to clock out</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
