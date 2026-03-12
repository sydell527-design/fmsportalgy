import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertTimesheet, type Timesheet } from "@shared/routes";

export interface TimesheetFilters {
  startDate?: string;
  endDate?: string;
  eid?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

function buildTimesheetUrl(filters: TimesheetFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate)   params.set("endDate",   filters.endDate);
  if (filters.eid)       params.set("eid",       filters.eid);
  if (filters.status)    params.set("status",    filters.status);
  if (filters.limit !== undefined)  params.set("limit",  String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return qs ? `${api.timesheets.list.path}?${qs}` : api.timesheets.list.path;
}

export function useTimesheets(filters: TimesheetFilters = {}) {
  const url = buildTimesheetUrl(filters);
  const queryKey = [api.timesheets.list.path, filters];
  return useQuery<Timesheet[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return api.timesheets.list.responses[200].parse(await res.json());
    },
    refetchInterval: 60_000,
  });
}

export function useCreateTimesheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertTimesheet) => {
      const validated = api.timesheets.create.input.parse(data);
      const res = await fetch(api.timesheets.create.path, {
        method: api.timesheets.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create timesheet");
      return api.timesheets.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.timesheets.list.path] }),
  });
}

export function useUpdateTimesheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertTimesheet>) => {
      const validated = api.timesheets.update.input.parse(updates);
      const url = buildUrl(api.timesheets.update.path, { id });
      const res = await fetch(url, {
        method: api.timesheets.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update timesheet");
      return api.timesheets.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.timesheets.list.path] }),
  });
}

export function useDeleteTimesheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.timesheets.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete timesheet");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.timesheets.list.path] }),
  });
}

export function useDedupTimesheets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ removed: number }> => {
      const res = await fetch("/api/timesheets/dedup", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Dedup failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.timesheets.list.path] }),
  });
}

export function useBulkCreateTimesheets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (records: InsertTimesheet[]) => {
      const res = await fetch(api.timesheets.bulkCreate.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(records),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(body.message ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.timesheets.list.path] }),
  });
}
