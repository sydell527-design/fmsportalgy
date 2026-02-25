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
  // Use a stable key that includes the filters so different filter combos cache separately
  const queryKey = [api.timesheets.list.path, filters];
  return useQuery<Timesheet[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return api.timesheets.list.responses[200].parse(await res.json());
    },
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
