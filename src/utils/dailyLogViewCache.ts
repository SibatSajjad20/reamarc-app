import { BoundedCache, type CacheEntry } from './cache';
import { registerCacheClearer } from './cacheBus';
import type { DailyLogColumn, DailyLogEntry, UserLogActivity } from '../types/dailyLog';

const dlColumnsCache = new BoundedCache<DailyLogColumn[]>(2);
const dlSheetsCache = new BoundedCache<string[]>(2);
const dlEntriesCache = new BoundedCache<DailyLogEntry[]>(10);
const dlActivityCache = new BoundedCache<UserLogActivity>(2);

export const dailyLogViewCache = {
  getCachedColumns(): CacheEntry<DailyLogColumn[]> | undefined {
    return dlColumnsCache.get('columns');
  },
  setCachedColumns(data: DailyLogColumn[]): void {
    dlColumnsCache.set('columns', data);
  },
  getCachedSheets(): CacheEntry<string[]> | undefined {
    return dlSheetsCache.get('sheets');
  },
  setCachedSheets(data: string[]): void {
    dlSheetsCache.set('sheets', data);
  },
  getCachedEntries(key: string): CacheEntry<DailyLogEntry[]> | undefined {
    return dlEntriesCache.get(key);
  },
  setCachedEntries(key: string, data: DailyLogEntry[]): void {
    dlEntriesCache.set(key, data);
  },
  replaceCachedEntries(key: string, list: DailyLogEntry[]): void {
    dlEntriesCache.set(key, list);
  },
  invalidateEntries(exceptKey?: string): void {
    if (!exceptKey) {
      dlEntriesCache.clear();
      return;
    }
    const current = dlEntriesCache.get(exceptKey);
    dlEntriesCache.clear();
    if (current) {
      dlEntriesCache.set(exceptKey, current.data);
    }
  },
  getCachedActivity(): CacheEntry<UserLogActivity> | undefined {
    return dlActivityCache.get('activity');
  },
  setCachedActivity(data: UserLogActivity): void {
    dlActivityCache.set('activity', data);
  },
  hasInitialCache(): boolean {
    return dlEntriesCache.size() > 0;
  },
  clearCachedColumns(): void {
    dlColumnsCache.clear();
  },
  clearCachedActivity(): void {
    dlActivityCache.clear();
  },
  clearAllCaches(): void {
    dlColumnsCache.clear();
    dlSheetsCache.clear();
    dlEntriesCache.clear();
    dlActivityCache.clear();
  },
};

registerCacheClearer(() => dailyLogViewCache.clearAllCaches());
