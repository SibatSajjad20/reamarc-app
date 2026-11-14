import type { DailyLogEntry } from './dailyLog';
import type { UnifiedVarianceData } from './logVariance';

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** TTL for log-variance ranges that include today (5 minutes). */
export const LOG_VARIANCE_TODAY_TTL_MS = 5 * 60 * 1000;

/** TTL for log-variance ranges entirely in the past (30 minutes). */
export const LOG_VARIANCE_PAST_TTL_MS = 30 * 60 * 1000;

/** Stale window for ranges that include today (ms). Kept for backwards compatibility. */
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
const logVarianceCache = new BoundedCache<UnifiedVarianceData>(40);
const snapshotCache = new BoundedCache<unknown>(24);
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

export function makeLogVarianceCacheKey(userId: string, startDate: string, endDate: string): string {
  return `${userId || ''}|${startDate}|${endDate}`;
}

export function rangeIncludesToday(startDate: string, endDate: string, today: string): boolean {
  return startDate <= today && today <= endDate;
}

export function isLogVarianceCacheStale(
  entry: CacheEntry<UnifiedVarianceData> | undefined,
  startDate: string,
  endDate: string,
  today: string,
): boolean {
  if (!entry) return true;
  const todayIncluded = entry.data.range?.today_included ?? rangeIncludesToday(startDate, endDate, today);
  const ttl = todayIncluded ? LOG_VARIANCE_TODAY_TTL_MS : LOG_VARIANCE_PAST_TTL_MS;
  return Date.now() - entry.fetchedAt > ttl;
}

export function getCachedLogVariance(
  userId: string,
  startDate: string,
  endDate: string,
): CacheEntry<UnifiedVarianceData> | undefined {
  return logVarianceCache.get(makeLogVarianceCacheKey(userId, startDate, endDate));
}

export function setCachedLogVariance(
  userId: string,
  startDate: string,
  endDate: string,
  data: UnifiedVarianceData,
): void {
  logVarianceCache.set(makeLogVarianceCacheKey(userId, startDate, endDate), data);
}

export function invalidateLogVarianceCache(): void {
  logVarianceCache.clear();
}

export function getCachedSnapshot<T>(key: string): CacheEntry<T> | undefined {
  return snapshotCache.get(key) as CacheEntry<T> | undefined;
}

export function setCachedSnapshot<T>(key: string, data: T): void {
  snapshotCache.set(key, data);
}

export function invalidateSnapshotCache(): void {
  snapshotCache.clear();
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

export function invalidateEntriesCache(): void {
  entriesCache.clear();
}

// Backwards-compatibility for existing tests
export function makeWorkedCacheKey(startDate: string, endDate: string, userId: string): string {
  return `worked|${startDate}|${endDate}|${userId || ''}`;
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
  logVarianceCache.clear();
  snapshotCache.clear();
  workedCache.clear();
  employeesCache.clear();
}
