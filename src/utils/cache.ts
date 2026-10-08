/**
 * Reusable bounded in-memory LRU cache utility for client-side module state persistence.
 * Prevents redundant skeleton reloads when switching across modules while keeping
 * memory footprint strictly bounded.
 */

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export class BoundedCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 30) {
    this.maxEntries = maxEntries;
  }

  public get(key: string): CacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (entry) {
      // LRU refresh on hit
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

  public delete(key: string): void {
    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public size(): number {
    return this.map.size;
  }
}
