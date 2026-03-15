// Simple in-memory cache for performance
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

export function setCache(key: string, data: any, ttlMs = 5 * 60 * 1000): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs
  });
}

export function getCache<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() - item.timestamp > item.ttl) {
    cache.delete(key);
    return null;
  }
  
  return item.data as T;
}

export function clearCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  Array.from(cache.keys()).forEach(key => {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  });
}

// Auto-cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Array.from(cache.entries()).forEach(([key, item]) => {
    if (now - item.timestamp > item.ttl) {
      cache.delete(key);
    }
  });
}, 5 * 60 * 1000);
