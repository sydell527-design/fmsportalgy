import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Crosshair, Save, X } from "lucide-react";
import type { Geofence } from "@shared/schema";

// Fix Leaflet default marker icons when bundled with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const newCenterIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  className: "hue-rotate-[180deg]",
});

function FlyToZone({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(lat, lng).toBounds(radius * 5);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
  }, [lat, lng, radius, map]);
  return null;
}

function MapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = enabled ? "crosshair" : "";
  }, [enabled, map]);
  return null;
}

interface Props {
  zone: Geofence;
  allZones: Geofence[];
  onClose: () => void;
  onSaveLocation?: (id: number, lat: number, lng: number) => Promise<void>;
}

export default function GeofenceMapModal({ zone, allZones, onClose, onSaveLocation }: Props) {
  const [repositioning, setRepositioning] = useState(false);
  const [newCenter, setNewCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newCenter || !onSaveLocation) return;
    setSaving(true);
    try {
      await onSaveLocation(zone.id, newCenter.lat, newCenter.lng);
      setRepositioning(false);
      setNewCenter(null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const cancelReposition = () => {
    setRepositioning(false);
    setNewCenter(null);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-2">
            <div>
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
                  {newCenter
                    ? `${newCenter.lat.toFixed(6)}, ${newCenter.lng.toFixed(6)}`
                    : `${zone.lat.toFixed(6)}, ${zone.lng.toFixed(6)}`}
                </span>
                <span className="mx-2">·</span>
                <strong>{zone.radius}m</strong> radius
              </p>
            </div>

            {onSaveLocation && !repositioning && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRepositioning(true)}
                className="shrink-0 gap-1.5 text-xs"
                data-testid="button-reposition"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Move Center
              </Button>
            )}
          </div>

          {repositioning && (
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2 text-xs text-amber-800">
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">
                {newCenter
                  ? `New center: ${newCenter.lat.toFixed(6)}, ${newCenter.lng.toFixed(6)} — click again to adjust`
                  : "Click anywhere on the map to set the new center point for this zone"}
              </span>
              <div className="flex gap-1.5 shrink-0">
                {newCenter && (
                  <Button size="sm" onClick={handleSave} disabled={saving} className="h-6 px-2 text-xs gap-1">
                    <Save className="w-3 h-3" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={cancelReposition} className="h-6 px-2 text-xs gap-1">
                  <X className="w-3 h-3" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="h-[460px] w-full">
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
            <MapClickHandler enabled={repositioning} onPick={(lat, lng) => setNewCenter({ lat, lng })} />

            {/* Other zones — faint context */}
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
                    fillOpacity: 0.07,
                    weight: 1,
                    dashArray: "4 4",
                  }}
                >
                  <Popup>
                    <strong>{z.name}</strong><br />Radius: {z.radius}m
                  </Popup>
                </Circle>
              ))}

            {/* Current zone circle */}
            <Circle
              center={[zone.lat, zone.lng]}
              radius={zone.radius}
              pathOptions={{
                color: zone.active ? "#16a34a" : "#9ca3af",
                fillColor: zone.active ? "#22c55e" : "#9ca3af",
                fillOpacity: newCenter ? 0.08 : 0.2,
                weight: newCenter ? 1.5 : 2.5,
                dashArray: newCenter ? "6 4" : undefined,
              }}
            >
              <Popup>
                <strong>{zone.name}</strong><br />
                {zone.description && <span>{zone.description}<br /></span>}
                Current center · Radius: <strong>{zone.radius}m</strong>
              </Popup>
            </Circle>

            {/* Current center marker */}
            <Marker position={[zone.lat, zone.lng]}>
              <Popup>
                <strong>{zone.name}</strong><br />
                {newCenter ? "Original center" : "Center point"}
              </Popup>
            </Marker>

            {/* New proposed center + circle */}
            {newCenter && (
              <>
                <Circle
                  center={[newCenter.lat, newCenter.lng]}
                  radius={zone.radius}
                  pathOptions={{
                    color: "#2563eb",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.18,
                    weight: 2.5,
                  }}
                >
                  <Popup>
                    <strong>New center preview</strong><br />
                    {newCenter.lat.toFixed(6)}, {newCenter.lng.toFixed(6)}<br />
                    Radius: {zone.radius}m
                  </Popup>
                </Circle>
                <Marker position={[newCenter.lat, newCenter.lng]} icon={newCenterIcon}>
                  <Popup>
                    <strong>New center</strong><br />
                    Click "Save" to apply
                  </Popup>
                </Marker>
              </>
            )}
          </MapContainer>
        </div>

        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 opacity-70 border border-green-600" />
            Current zone
          </span>
          {newCenter && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500 opacity-70 border border-blue-600" />
              New position preview
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-gray-400 opacity-40 border border-dashed border-gray-500" />
            Other zones
          </span>
          <span className="ml-auto">© OpenStreetMap contributors</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
