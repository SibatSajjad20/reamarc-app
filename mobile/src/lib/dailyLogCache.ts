import type { DailyLogEntry } from './dailyLog';

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** Stale window for ranges that include today (ms). Historical ranges stay fresh until force refresh. */
export const DAILY_LOG_STALE_MS = 120_000;

class BoundedCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 40) {
    this.maxEntries = maxEntries;
  }

  public get(key: string): CacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (entry) {
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  public set(key: string, data: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, { data, fetchedAt: Date.now() });
  }

  public values(): IterableIterator<CacheEntry<T>> {
    return this.map.values();
  }

  public clear(): void {
    this.map.clear();
  }
}

export type WorkedHoursCacheData = {
  total: number;
  byDate: Record<string, number>;
};

export type EmployeeCacheOption = {
  id: string;
  full_name: string;
  department?: string | null;
  role?: string;
  is_active?: boolean;
};

const entriesCache = new BoundedCache<DailyLogEntry[]>(40);
const workedCache = new BoundedCache<WorkedHoursCacheData>(40);
const employeesCache = new BoundedCache<EmployeeCacheOption[]>(1);

const EMPLOYEES_KEY = 'employees';

export function makeEntriesCacheKey(
  startDate: string,
  endDate: string,
  userId: string,
  resourceName: string,
): string {
  return `entries|${startDate}|${endDate}|${userId || ''}|${resourceName || ''}`;
}

export function makeWorkedCacheKey(startDate: string, endDate: string, userId: string): string {
  return `worked|${startDate}|${endDate}|${userId || ''}`;
}

export function rangeIncludesToday(startDate: string, endDate: string, today: string): boolean {
  return startDate <= today && today <= endDate;
}

export function isCacheStale(
  entry: CacheEntry<unknown> | undefined,
  startDate: string,
  endDate: string,
  today: string,
  staleMs: number = DAILY_LOG_STALE_MS,
): boolean {
  if (!entry) return true;
  if (!rangeIncludesToday(startDate, endDate, today)) return false;
  return Date.now() - entry.fetchedAt > staleMs;
}

export function getCachedEntries(
  startDate: string,
  endDate: string,
  userId: string,
  resourceName: string,
): CacheEntry<DailyLogEntry[]> | undefined {
  return entriesCache.get(makeEntriesCacheKey(startDate, endDate, userId, resourceName));
}

export function setCachedEntries(
  startDate: string,
  endDate: string,
  userId: string,
  resourceName: string,
  data: DailyLogEntry[],
): void {
  entriesCache.set(makeEntriesCacheKey(startDate, endDate, userId, resourceName), data);
}

export function getCachedWorked(
  startDate: string,
  endDate: string,
  userId: string,
): CacheEntry<WorkedHoursCacheData> | undefined {
  return workedCache.get(makeWorkedCacheKey(startDate, endDate, userId));
}

export function setCachedWorked(
  startDate: string,
  endDate: string,
  userId: string,
  data: WorkedHoursCacheData,
): void {
  workedCache.set(makeWorkedCacheKey(startDate, endDate, userId), data);
}

export function getCachedEmployees(): CacheEntry<EmployeeCacheOption[]> | undefined {
  return employeesCache.get(EMPLOYEES_KEY);
}

export function setCachedEmployees(data: EmployeeCacheOption[]): void {
  employeesCache.set(EMPLOYEES_KEY, data);
}

/** Find a single entry across the session entries cache (for detail hydrate). */
export function findCachedEntryById(entryId: string): DailyLogEntry | null {
  if (!entryId) return null;
  for (const bucket of entriesCache.values()) {
    const found = bucket.data.find((item) => item.id === entryId);
    if (found) return found;
  }
  return null;
}

export function clearDailyLogCaches(): void {
  entriesCache.clear();
  workedCache.clear();
  employeesCache.clear();
}
