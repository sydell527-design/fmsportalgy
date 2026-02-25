import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmployeeLoan, InsertEmployeeLoan } from "@shared/schema";

export function useLoans(eid: string) {
  return useQuery<EmployeeLoan[]>({
    queryKey: ["/api/employees", eid, "loans"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${eid}/loans`);
      if (!res.ok) throw new Error("Failed to fetch loans");
      return res.json();
    },
    enabled: !!eid,
  });
}

export function useCreateLoan(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<InsertEmployeeLoan, "eid">) => {
      const res = await fetch(`/api/employees/${eid}/loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json() as Promise<EmployeeLoan>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "loans"] }),
  });
}

export function useUpdateLoan(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertEmployeeLoan>) => {
      const res = await fetch(`/api/loans/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json() as Promise<EmployeeLoan>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "loans"] }),
  });
}

export function useDeleteLoan(eid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/loans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "loans"] }),
  });
}
