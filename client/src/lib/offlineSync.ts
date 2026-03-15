import { queueDelete, queueList } from "./offlineDb";
import { shadowDeleteCreate, shadowDeletePatch } from "./offlineApi";

const API_BASE = import.meta.env.PROD
  ? 'https://debora-unstandard-feyly.ngrok-free.dev'
  : 'http://localhost:5000';

function getPathname(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

export async function flushOfflineQueue(): Promise<{ attempted: number; sent: number }>
{
  const items = await queueList();
  let sent = 0;

  for (const item of items) {
    if (item.id === undefined) continue;

    try {
      const fullUrl = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;
      const res = await fetch(fullUrl, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...(item.headers ?? {}),
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
        credentials: item.credentials ?? "include",
      });

      if (!res.ok) {
        // Keep queued; it may become valid later (e.g., auth) or be manually resolved.
        continue;
      }

      // Clean up local shadow records for known endpoints.
      const path = getPathname(item.url);
      const body = (item.body ?? {}) as any;
      if (item.method === "POST" && path === "/api/requests" && body?.reqId) {
        await shadowDeleteCreate("requests", String(body.reqId));
      }
      if (item.method === "POST" && path === "/api/timesheets" && body?.tsId) {
        await shadowDeleteCreate("timesheets", String(body.tsId));
      }
      if (item.method === "PUT" && path.startsWith("/api/timesheets/") ) {
        const id = path.split("/").pop();
        if (id) await shadowDeletePatch("timesheets", id);
      }

      await queueDelete(item.id);
      sent += 1;
    } catch {
      // still offline
      break;
    }
  }

  return { attempted: items.length, sent };
}
