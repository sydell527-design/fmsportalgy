import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertRequest, type Request } from "@shared/routes";
import { cachedGetJson, queueMutation, shadowCreate, shadowListCreates } from "@/lib/offlineApi";

export function useRequests() {
  return useQuery<Request[]>({
    queryKey: [api.requests.list.path],
    queryFn: async () => {
      const base = api.requests.list.responses[200].parse(
        await cachedGetJson(api.requests.list.path, { credentials: "include" }),
      );

      const pendingCreates = await shadowListCreates("requests");
      const local = pendingCreates.map((c) => c.value) as Request[];

      // Show local (pending) items first so the user can see what they submitted offline.
      return [...local, ...base];
    },
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertRequest) => {
      const validated = api.requests.create.input.parse(data);

      if (!navigator.onLine) {
        await shadowCreate("requests", validated.reqId, validated);
        await queueMutation(api.requests.create.method, api.requests.create.path, validated, {
          credentials: "include",
        });
        // Return a local placeholder that matches the Request shape.
        return validated as unknown as Request;
      }

      const res = await fetch(api.requests.create.path, {
        method: api.requests.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create request");
      return api.requests.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.requests.list.path] }),
  });
}

export function useUpdateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertRequest>) => {
      const validated = api.requests.update.input.parse(updates);
      const url = buildUrl(api.requests.update.path, { id });
      const res = await fetch(url, {
        method: api.requests.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update request");
      return api.requests.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.requests.list.path] }),
  });
}
