import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CompanySettings } from "@shared/schema";

export function useCompanySettings() {
  return useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Omit<CompanySettings, "id">>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json() as Promise<CompanySettings>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/settings"] }),
  });
}
