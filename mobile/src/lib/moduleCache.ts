const DEFAULT_TTL_MS = 5 * 60 * 1000;

type Entry<T> = { data: T; fetchedAt: number };

const store = new Map<string, Entry<unknown>>();

export function getModuleCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) return null;
  return entry.data;
}

export function peekModuleCache<T>(key: string): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  return entry ? entry.data : null;
}

export function setModuleCache<T>(key: string, data: T): T {
  store.set(key, { data, fetchedAt: Date.now() });
  return data;
}

export function invalidateModuleCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of Array.from(store.keys())) {
    if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key);
  }
}
