import {
  cacheGet,
  cacheSet,
  isOfflineError,
  queueEnqueue,
  shadowCreateDelete,
  shadowCreateList,
  shadowCreatePut,
  shadowPatchDelete,
  shadowPatchGet,
  shadowPatchPut,
} from "./offlineDb";

export async function cachedGetJson<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    const json = (await res.json()) as T;
    await cacheSet(url, json);
    return json;
  } catch (err) {
    if (!navigator.onLine || isOfflineError(err)) {
      const cached = await cacheGet<T>(url);
      if (cached !== null) return cached;
    }
    throw err;
  }
}

export async function queueMutation(method: string, url: string, body: unknown, init?: RequestInit) {
  await queueEnqueue({
    createdAt: Date.now(),
    method,
    url,
    body,
    credentials: init?.credentials,
    headers: (init?.headers as Record<string, string> | undefined) ?? undefined,
  });
}

export async function shadowCreate(resource: string, key: string, value: unknown) {
  await shadowCreatePut(`${resource}:create:${key}`, value);
}

export async function shadowListCreates(resource: string) {
  return shadowCreateList(`${resource}:create:`);
}

export async function shadowDeleteCreate(resource: string, key: string) {
  return shadowCreateDelete(`${resource}:create:${key}`);
}

export async function shadowPatch(resource: string, key: string, patch: unknown) {
  await shadowPatchPut(`${resource}:patch:${key}`, patch);
}

export async function shadowGetPatch<T>(resource: string, key: string): Promise<T | null> {
  return shadowPatchGet<T>(`${resource}:patch:${key}`);
}

export async function shadowDeletePatch(resource: string, key: string) {
  return shadowPatchDelete(`${resource}:patch:${key}`);
}
