import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmployeeChild, InsertEmployeeChild } from "@shared/schema";

export function useChildren(eid: string) {
  return useQuery<EmployeeChild[]>({
    queryKey: ["/api/employees", eid, "children"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${eid}/children`);
      if (!res.ok) throw new Error("Failed to fetch children");
      return res.json();
    },
    enabled: !!eid,
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
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
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
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
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
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "children"] }),
  });
}
