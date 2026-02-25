import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import type { Geofence } from "@shared/schema";

// Fix Leaflet's broken default marker icons when bundled with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FlyToZone({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(lat, lng).toBounds(radius * 4);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
  }, [lat, lng, radius, map]);
  return null;
}

interface Props {
  zone: Geofence;
  allZones: Geofence[];
  onClose: () => void;
}

export default function GeofenceMapModal({ zone, allZones, onClose }: Props) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {zone.name}
            <Badge variant={zone.active ? "default" : "secondary"} className="ml-1 text-xs">
              {zone.active ? "Active" : "Inactive"}
            </Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {zone.description && <span className="mr-3">{zone.description}</span>}
            <span className="font-mono">
              {zone.lat.toFixed(6)}, {zone.lng.toFixed(6)}
            </span>
            <span className="mx-2">·</span>
            <strong>{zone.radius}m</strong> radius
          </p>
        </DialogHeader>

        <div className="h-[480px] w-full">
          <MapContainer
            center={[zone.lat, zone.lng]}
            zoom={17}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FlyToZone lat={zone.lat} lng={zone.lng} radius={zone.radius} />

            {/* Render all zones faintly so context is visible */}
            {allZones
              .filter((z) => z.id !== zone.id)
              .map((z) => (
                <Circle
                  key={z.id}
                  center={[z.lat, z.lng]}
                  radius={z.radius}
                  pathOptions={{
                    color: "#6b7280",
                    fillColor: "#6b7280",
                    fillOpacity: 0.08,
                    weight: 1,
                    dashArray: "4 4",
                  }}
                >
                  <Popup>
                    <strong>{z.name}</strong>
                    <br />
                    Radius: {z.radius}m
                  </Popup>
                </Circle>
              ))}

            {/* Selected zone — highlighted */}
            <Circle
              center={[zone.lat, zone.lng]}
              radius={zone.radius}
              pathOptions={{
                color: zone.active ? "#16a34a" : "#9ca3af",
                fillColor: zone.active ? "#22c55e" : "#9ca3af",
                fillOpacity: 0.2,
                weight: 2.5,
              }}
            >
              <Popup>
                <strong>{zone.name}</strong>
                <br />
                {zone.description && <span>{zone.description}<br /></span>}
                Radius: <strong>{zone.radius}m</strong>
                <br />
                {zone.lat.toFixed(6)}, {zone.lng.toFixed(6)}
              </Popup>
            </Circle>

            {/* Center marker */}
            <Marker position={[zone.lat, zone.lng]}>
              <Popup>
                <strong>{zone.name}</strong><br />
                Center point
              </Popup>
            </Marker>
          </MapContainer>
        </div>

        <div className="px-5 py-2.5 border-t border-border bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 opacity-70 border border-green-600" />
            Selected zone
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-gray-400 opacity-40 border border-dashed border-gray-500" />
            Other zones
          </span>
          <span className="ml-auto">Map data © OpenStreetMap contributors</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
