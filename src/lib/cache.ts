interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function setCache<T>(key: string, value: T, ttlSeconds: number): void {
  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export function getCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function deleteCache(key: string): boolean {
  return memoryCache.delete(key);
}

export function clearCache(): void {
  memoryCache.clear();
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = getCache<T>(key);
  if (cached !== null) {
    return cached;
  }
  const result = await fn();
  setCache(key, result, ttlSeconds);
  return result;
}
