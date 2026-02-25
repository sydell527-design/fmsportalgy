import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertGeofence, type Geofence } from "@shared/routes";

export function useGeofences() {
  return useQuery<Geofence[]>({
    queryKey: [api.geofences.list.path],
    queryFn: async () => {
      const res = await fetch(api.geofences.list.path);
      if (!res.ok) throw new Error("Failed to fetch geofences");
      return res.json();
    },
  });
}

export function useCreateGeofence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertGeofence) => {
      const res = await fetch(api.geofences.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to create geofence");
      }
      return res.json() as Promise<Geofence>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.geofences.list.path] }),
  });
}

export function useUpdateGeofence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertGeofence>) => {
      const url = buildUrl(api.geofences.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to update geofence");
      }
      return res.json() as Promise<Geofence>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.geofences.list.path] }),
  });
}

export function useDeleteGeofence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.geofences.delete.path, { id });
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete geofence");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.geofences.list.path] }),
  });
}
