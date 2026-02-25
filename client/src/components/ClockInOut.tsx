import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCreateTimesheet, useTimesheets, useUpdateTimesheet } from "@/hooks/use-timesheets";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, LogIn, LogOut, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

// Hardcoded geofences based on backend notes
const GEOFENCES: Record<string, { lat: number, lng: number, radius: number }> = {
  "HEAD OFFICE": { lat: 6.813348605011895, lng: -58.14785407612874, radius: 150 },
  "CARICOM": { lat: 6.820398733945807, lng: -58.11684933928277, radius: 200 },
};

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function ClockInOut() {
  const { user } = useAuth();
  const { data: timesheets } = useTimesheets();
  const { mutateAsync: createTimesheet, isPending: isCreating } = useCreateTimesheet();
  const { mutateAsync: updateTimesheet, isPending: isUpdating } = useUpdateTimesheet();
  const { toast } = useToast();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locating, setLocating] = useState(false);
  const [activeZone, setActiveZone] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  
  // Find today's timesheet for this user
  const todaysTimesheet = timesheets?.find(t => t.eid === user?.userId && t.date === today);
  const hasClockedIn = !!todaysTimesheet?.ci;
  const hasClockedOut = !!todaysTimesheet?.co;

  const getLocation = (): Promise<{lat: number, lng: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
      } else {
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocating(false);
            const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
            setLocation(pos);
            resolve(pos);
          },
          (error) => {
            setLocating(false);
            reject(error);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    });
  };

  const validateGeofence = (coords: {lat: number, lng: number}) => {
    if (!user?.geo) return false;
    
    for (const zoneName of user.geo) {
      const fence = GEOFENCES[zoneName];
      if (fence) {
        const dist = haversineMetres(coords.lat, coords.lng, fence.lat, fence.lng);
        if (dist <= fence.radius) {
          setActiveZone(zoneName);
          return true;
        }
      }
    }
    return false;
  };

  const handleAction = async (action: 'in' | 'out') => {
    try {
      const coords = await getLocation();
      const isWithinFence = validateGeofence(coords);
      
      if (!isWithinFence) {
        toast({
          title: "Location Verification Failed",
          description: "You are not within an authorized work location zone.",
          variant: "destructive"
        });
        return;
      }

      const timeStr = format(new Date(), "HH:mm");

      if (action === 'in') {
        await createTimesheet({
          tsId: `TS-${Date.now()}`,
          eid: user!.userId,
          date: today,
          ci: timeStr,
          gIn: coords,
          status: "pending_employee",
          notes: "",
        } as any);
        toast({ title: "Successfully clocked in!" });
      } else {
        if (!todaysTimesheet) return;
        await updateTimesheet({
          id: todaysTimesheet.id,
          co: timeStr,
          gOut: coords,
          status: "pending_first_approval", // Auto submit to manager on clock out
        });
        toast({ title: "Successfully clocked out!" });
      }

    } catch (error: any) {
      toast({
        title: "Action Failed",
        description: error.message || "Could not complete action",
        variant: "destructive"
      });
    }
  };

  if (!user) return null;

  return (
    <div className="bg-white rounded-3xl p-8 border border-border/50 corporate-shadow relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

      <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-display font-bold">Time Tracking</h3>
          </div>
          <p className="text-4xl font-display font-light text-foreground tracking-tight mb-2">
            {format(currentTime, "hh:mm:ss a")}
          </p>
          <p className="text-muted-foreground font-medium flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {activeZone ? `Within zone: ${activeZone}` : 'Location unknown'}
            {locating && " (Locating...)"}
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 min-w-[200px]">
          {hasClockedOut ? (
            <div className="bg-success/10 text-success border border-success/20 px-6 py-4 rounded-2xl flex items-center gap-3 w-full justify-center">
              <ShieldAlert className="w-6 h-6" />
              <span className="font-semibold">Shift Completed</span>
            </div>
          ) : !hasClockedIn ? (
            <Button 
              size="lg" 
              className="w-full h-16 text-lg rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 transition-all"
              onClick={() => handleAction('in')}
              disabled={isCreating || locating}
            >
              <LogIn className="w-6 h-6 mr-2" />
              {isCreating ? "Processing..." : "Clock In"}
            </Button>
          ) : (
            <div className="w-full space-y-3">
              <div className="bg-warning/10 text-warning-foreground border border-warning/20 px-4 py-2 rounded-xl text-sm font-medium text-center">
                Clocked in at {todaysTimesheet?.ci}
              </div>
              <Button 
                size="lg" 
                variant="destructive"
                className="w-full h-16 text-lg rounded-2xl shadow-lg shadow-destructive/20 hover:shadow-destructive/40 hover:-translate-y-1 transition-all"
                onClick={() => handleAction('out')}
                disabled={isUpdating || locating}
              >
                <LogOut className="w-6 h-6 mr-2" />
                {isUpdating ? "Processing..." : "Clock Out"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
