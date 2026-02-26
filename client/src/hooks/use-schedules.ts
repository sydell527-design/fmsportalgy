import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Schedule, InsertSchedule } from "@shared/schema";

async function parseError(res: Response): Promise<string> {
  try { const e = await res.json(); return e.message || `${res.status} ${res.statusText}`; }
  catch { return `${res.status} ${res.statusText}`; }
}

export function useSchedules(eid: string | undefined) {
  return useQuery<Schedule[]>({
    queryKey: ["/api/schedules", eid],
    queryFn: async () => {
      if (!eid) return [];
      const res = await fetch(`/api/schedules?eid=${encodeURIComponent(eid)}`);
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    enabled: !!eid,
    staleTime: 0,
  });
}

export function useTeamSchedules(eids: string[]) {
  const key = eids.slice().sort().join(",");
  return useQuery<Schedule[]>({
    queryKey: ["/api/schedules/team", key],
    queryFn: async () => {
      if (!eids.length) return [];
      const res = await fetch(`/api/schedules?eids=${encodeURIComponent(eids.join(","))}`);
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    enabled: eids.length > 0,
    staleTime: 0,
  });
}

export function useCreateSchedule(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<InsertSchedule, "eid">) =>
      apiRequest("POST", "/api/schedules", { ...data, eid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/schedules", eid] }),
  });
}

export function useUpdateSchedule(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: number } & Partial<InsertSchedule>) =>
      apiRequest("PUT", `/api/schedules/${id}`, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/schedules", eid] }),
  });
}

export function useDeleteSchedule(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/schedules", eid] }),
  });
}
