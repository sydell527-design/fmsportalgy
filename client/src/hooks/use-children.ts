import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmployeeChild, InsertEmployeeChild } from "@shared/schema";

async function parseError(res: Response): Promise<string> {
  try { const e = await res.json(); return e.message || `${res.status} ${res.statusText}`; }
  catch { return `${res.status} ${res.statusText}`; }
}

export function useAllChildren() {
  return useQuery<EmployeeChild[]>({
    queryKey: ["/api/children"],
    queryFn: async () => {
      const res = await fetch("/api/children");
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    staleTime: 0,
  });
}

export function useChildren(eid: string) {
  return useQuery<EmployeeChild[]>({
    queryKey: ["/api/employees", eid, "children"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${eid}/children`);
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    enabled: !!eid,
    staleTime: 0,
  });
}

export function useCreateChild(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<InsertEmployeeChild, "eid">) => {
      const res = await fetch(`/api/employees/${eid}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json() as Promise<EmployeeChild>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "children"] }),
  });
}

export function useUpdateChild(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertEmployeeChild>) => {
      const res = await fetch(`/api/children/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json() as Promise<EmployeeChild>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "children"] }),
  });
}

export function useDeleteChild(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/children/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "children"] }),
  });
}
