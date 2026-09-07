export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** Stale window for "today" attendance data (ms). Historical dates stay fresh until force refresh. */
export const ATTENDANCE_STALE_MS = 120_000;

class BoundedCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 30) {
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

  public clear(): void {
    this.map.clear();
  }
}

export type MatrixCachePayload = {
  matrix: unknown;
  pendingCount: number;
};

export type PunchTodayCachePayload = {
  today: unknown;
  dayTarget: unknown | null;
};

const matrixCache = new BoundedCache<MatrixCachePayload>(30);
const punchTodayCache = new BoundedCache<PunchTodayCachePayload>(1);

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isAttendanceCacheStale(
  entry: CacheEntry<unknown> | undefined,
  dateStr: string,
  staleMs: number = ATTENDANCE_STALE_MS,
): boolean {
  if (!entry) return true;
  if (dateStr !== todayIso()) return false;
  return Date.now() - entry.fetchedAt > staleMs;
}

export function getCachedMatrix(dateStr: string): CacheEntry<MatrixCachePayload> | undefined {
  return matrixCache.get(dateStr);
}

export function setCachedMatrix(
  dateStr: string,
  matrix: unknown,
  pendingCount: number,
): void {
  matrixCache.set(dateStr, { matrix, pendingCount });
}

export function getCachedPunchToday(): CacheEntry<PunchTodayCachePayload> | undefined {
  return punchTodayCache.get('today');
}

export function setCachedPunchToday(today: unknown, dayTarget: unknown | null): void {
  punchTodayCache.set('today', { today, dayTarget });
}

export function clearAttendanceCaches(): void {
  matrixCache.clear();
  punchTodayCache.clear();
}
