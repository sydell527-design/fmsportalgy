import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCreateTimesheet, useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, LogIn, LogOut, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const GEOFENCES: Record<string, { lat: number; lng: number; radius: number }> = {
  "HEAD OFFICE": { lat: 6.813348605011895, lng: -58.14785407612874, radius: 150 },
  "CARICOM": { lat: 6.820398733945807, lng: -58.11684933928277, radius: 200 },
  "EU": { lat: 6.8080, lng: -58.1600, radius: 200 },
  "UN": { lat: 6.8100, lng: -58.1550, radius: 200 },
  "DMC": { lat: 6.8050, lng: -58.1620, radius: 200 },
  "ARU": { lat: 6.8120, lng: -58.1480, radius: 200 },
  "CANTEEN": { lat: 6.8135, lng: -58.1478, radius: 80 },
};

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
  const { mutateAsync: createTimesheet, isPending: isCreating } = useCreateTimesheet();
  const { mutateAsync: updateTimesheet, isPending: isUpdating } = useUpdateTimesheet();
  const { toast } = useToast();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [activeZone, setActiveZone] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  const todaysTs = timesheets?.find((t) => t.eid === user?.userId && t.date === today);
  const hasClockedIn = !!todaysTs?.ci;
  const hasClockedOut = !!todaysTs?.co;

  const getLocation = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsCoords(coords);
          resolve(coords);
        },
        (err) => { setLocating(false); reject(err); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });

  const validateGeofence = (coords: { lat: number; lng: number }) => {
    const assignedGeo = user?.geo ?? [];
    const toCheck = assignedGeo.length > 0 ? assignedGeo : Object.keys(GEOFENCES);
    for (const zoneName of toCheck) {
      const fence = GEOFENCES[zoneName];
      if (fence && haversineMetres(coords.lat, coords.lng, fence.lat, fence.lng) <= fence.radius) {
        setActiveZone(zoneName);
        return true;
      }
    }
    return false;
  };

  const handleAction = async (action: "in" | "out") => {
    try {
      const coords = await getLocation();
      const inFence = validateGeofence(coords);
      if (!inFence) {
        toast({ title: "Outside Work Zone", description: "You are not within an authorized work location.", variant: "destructive" });
        return;
      }
      const timeStr = format(new Date(), "HH:mm");
      if (action === "in") {
        await createTimesheet({
          tsId: `TS-${Date.now()}`,
          eid: user!.userId,
          date: today,
          ci: timeStr,
          gIn: coords,
          status: "pending_employee",
          reg: 0, ot: 0, brk: 0,
          notes: "",
          edited: false,
          hist: [],
        } as any);
        toast({ title: "Clocked in successfully!", description: `Zone: ${activeZone ?? "Verified"}` });
      } else {
        if (!todaysTs) return;
        const [ih, im] = (todaysTs.ci ?? "08:00").split(":").map(Number);
        const [oh, om] = timeStr.split(":").map(Number);
        const totalMins = (oh * 60 + om) - (ih * 60 + im);
        const workMins = Math.max(0, totalMins - 30);
        const reg = Math.min(8, workMins / 60);
        const ot = Math.max(0, workMins / 60 - 8);
        await updateTimesheet({
          id: todaysTs.id,
          co: timeStr,
          gOut: coords,
          reg: Math.round(reg * 100) / 100,
          ot: Math.round(ot * 100) / 100,
          brk: 30,
          status: "pending_employee",
        });
        toast({ title: "Clocked out successfully!", description: `${reg.toFixed(1)}h regular${ot > 0 ? ` + ${ot.toFixed(1)}h OT` : ""}` });
      }
    } catch (err: any) {
      toast({ title: "Action Failed", description: err.message || "Could not complete action", variant: "destructive" });
    }
  };

  if (!user) return null;

  return (
    <div className="bg-card border border-border rounded-md p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Live Time</span>
          </div>
          <p className="text-4xl font-mono font-semibold text-foreground tracking-tight">
            {format(currentTime, "hh:mm:ss a")}
          </p>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {activeZone ? `Zone: ${activeZone}` : gpsCoords ? "Outside work zones" : "GPS not yet captured"}
            {locating && " — locating..."}
          </p>
          {todaysTs?.ci && (
            <p className="text-sm text-muted-foreground mt-1">
              Clocked in at <strong>{todaysTs.ci}</strong>
              {todaysTs.co && <> · Clocked out at <strong>{todaysTs.co}</strong></>}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 min-w-[200px]">
          {hasClockedOut ? (
            <div className="flex items-center gap-2 px-5 py-3 rounded-md bg-green-50 border border-green-200 text-green-700 w-full justify-center">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">Shift Complete</span>
            </div>
          ) : !hasClockedIn ? (
            <Button
              size="lg"
              className="w-full"
              onClick={() => handleAction("in")}
              disabled={isCreating || locating}
              data-testid="button-clock-in"
            >
              <LogIn className="w-5 h-5 mr-2" />
              {isCreating ? "Processing..." : "Clock In"}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="destructive"
              className="w-full"
              onClick={() => handleAction("out")}
              disabled={isUpdating || locating}
              data-testid="button-clock-out"
            >
              <LogOut className="w-5 h-5 mr-2" />
              {isUpdating ? "Processing..." : "Clock Out"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground text-center">
            GPS verification required
          </p>
        </div>
      </div>
    </div>
  );
}
