import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmployeeLoan, InsertEmployeeLoan } from "@shared/schema";

async function parseError(res: Response): Promise<string> {
  try { const e = await res.json(); return e.message || `${res.status} ${res.statusText}`; }
  catch { return `${res.status} ${res.statusText}`; }
}

export function useLoans(eid: string) {
  return useQuery<EmployeeLoan[]>({
    queryKey: ["/api/employees", eid, "loans"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${eid}/loans`);
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    enabled: !!eid,
    staleTime: 0,
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
      if (!res.ok) throw new Error(await parseError(res));
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
      if (!res.ok) throw new Error(await parseError(res));
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
      if (!res.ok) throw new Error(await parseError(res));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", eid, "loans"] }),
  });
}
