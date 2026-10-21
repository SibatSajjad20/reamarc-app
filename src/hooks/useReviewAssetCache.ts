import { useCallback, useEffect, useRef, useState } from 'react';

export const REVIEW_CACHE_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const REVIEW_CACHE_MAX_BLOB_BYTES = 50 * 1024 * 1024;
export const REVIEW_CACHE_MAX_VIDEO_PREFETCH_BYTES = 8 * 1024 * 1024;

export type ReviewCacheStatus = 'loading' | 'ready' | 'error' | 'direct';

export interface ReviewCacheEntry {
  objectUrl?: string;
  bytes: number;
  kind: 'image' | 'video';
  status: ReviewCacheStatus;
  lastUsed: number;
}

export interface ReviewCacheAsset {
  id?: string | number | null;
  url?: string | null;
  kind?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  size?: number | null;
  file_size?: number | null;
}

type IdleCancel = () => void;

export function reviewAssetCacheKey(asset: ReviewCacheAsset): string {
  if (asset.id != null && String(asset.id) !== '') return String(asset.id);
  return String(asset.url || '');
}

export function knownAssetBytes(asset: ReviewCacheAsset): number | null {
  const record = asset as ReviewCacheAsset & Record<string, unknown>;
  for (const field of ['size', 'file_size', 'size_bytes'] as const) {
    const value = record[field];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function mediaKind(asset: ReviewCacheAsset): 'image' | 'video' | 'other' {
  const kind = String(asset.kind || '').toLowerCase();
  const type = String(asset.content_type || '').toLowerCase();
  if (kind === 'video' || type.startsWith('video/')) return 'video';
  if (kind === 'image' || type.startsWith('image/')) return 'image';
  return 'other';
}

/** Images are blob-cached. Videos are blob-cached only while prefetching a known file ≤ 8 MB. */
export function shouldCacheBlob(asset: ReviewCacheAsset, prefetch: boolean): boolean {
  const kind = mediaKind(asset);
  const known = knownAssetBytes(asset);
  if (!asset.url) return false;
  if (known != null && known > REVIEW_CACHE_MAX_BLOB_BYTES) return false;
  if (kind === 'image') return true;
  if (kind === 'video') {
    return prefetch && known != null && known <= REVIEW_CACHE_MAX_VIDEO_PREFETCH_BYTES;
  }
  return false;
}

export function isPrefetchCandidate(asset: ReviewCacheAsset, activeKey: string): boolean {
  const key = reviewAssetCacheKey(asset);
  if (!key || key === activeKey) return false;
  return shouldCacheBlob(asset, true);
}

function saveDataEnabled(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}

function headerByteLength(res: Response): number | null {
  const raw = res.headers?.get?.('content-length');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Session cache of review creatives. Object URLs live until unmount or the
 * review token / item id changes — never across a thumbnail switch.
 */
export function useReviewAssetCache(scopeKey: string) {
  const cacheRef = useRef<Map<string, ReviewCacheEntry>>(new Map());
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const scopeGenRef = useRef(0);
  const clockRef = useRef(0);
  const totalBytesRef = useRef(0);
  const activeKeyRef = useRef('');
  const prefetchGenRef = useRef(0);
  const prefetchSigRef = useRef('');
  const idleCancelsRef = useRef<IdleCancel[]>([]);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const [, setVersion] = useState(0);

  const bump = useCallback((scopeGen: number) => {
    if (scopeGen !== scopeGenRef.current) return;
    setVersion((value) => value + 1);
  }, []);

  const noteActive = useCallback((key: string) => {
    activeKeyRef.current = key;
  }, []);

  const releaseEntry = useCallback((key: string) => {
    const existing = cacheRef.current.get(key);
    if (!existing) return;
    if (existing.objectUrl) {
      URL.revokeObjectURL(existing.objectUrl);
      totalBytesRef.current = Math.max(0, totalBytesRef.current - existing.bytes);
    }
    cacheRef.current.delete(key);
  }, []);

  const evictFor = useCallback(
    (needed: number, protectKey: string) => {
      const ranked = [...cacheRef.current.entries()]
        .filter(([key, entry]) => key !== protectKey && Boolean(entry.objectUrl))
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [key] of ranked) {
        if (totalBytesRef.current + needed <= REVIEW_CACHE_MAX_TOTAL_BYTES) break;
        releaseEntry(key);
      }
      return totalBytesRef.current + needed <= REVIEW_CACHE_MAX_TOTAL_BYTES;
    },
    [releaseEntry],
  );

  const load = useCallback(
    (asset: ReviewCacheAsset, options?: { prefetch?: boolean }): Promise<void> => {
      const key = reviewAssetCacheKey(asset);
      const url = String(asset.url || '');
      const scopeGen = scopeGenRef.current;
      const signal = abortRef.current?.signal;
      if (!key || !url || signal?.aborted) return Promise.resolve();

      const existing = cacheRef.current.get(key);
      if (existing && existing.status !== 'loading') {
        existing.lastUsed = ++clockRef.current;
        return Promise.resolve();
      }
      const pending = inflightRef.current.get(key);
      if (pending) return pending;

      const kind = mediaKind(asset);
      const storedKind: 'image' | 'video' = kind === 'video' ? 'video' : 'image';
      const prefetch = Boolean(options?.prefetch);

      if (!shouldCacheBlob(asset, prefetch)) {
        if (kind === 'image') {
          cacheRef.current.set(key, { bytes: 0, kind: 'image', status: 'direct', lastUsed: ++clockRef.current });
          bump(scopeGen);
        }
        return Promise.resolve();
      }

      const work = (async () => {
        cacheRef.current.set(key, {
          bytes: 0,
          kind: storedKind,
          status: 'loading',
          lastUsed: ++clockRef.current,
        });
        bump(scopeGen);
        try {
          const res = await fetch(url, { credentials: 'include', signal });
          if (scopeGen !== scopeGenRef.current || signal?.aborted) return;
          if (!res.ok) throw new Error('Review asset fetch failed');
          const advertised = headerByteLength(res);
          if (advertised != null && advertised > REVIEW_CACHE_MAX_BLOB_BYTES) {
            await res.body?.cancel?.();
            cacheRef.current.set(key, { bytes: 0, kind: storedKind, status: 'direct', lastUsed: ++clockRef.current });
            bump(scopeGen);
            return;
          }
          const blob = await res.blob();
          if (scopeGen !== scopeGenRef.current || signal?.aborted) return;
          if (blob.size > REVIEW_CACHE_MAX_BLOB_BYTES) {
            cacheRef.current.set(key, { bytes: 0, kind: storedKind, status: 'direct', lastUsed: ++clockRef.current });
            bump(scopeGen);
            return;
          }
          const protectKey = activeKeyRef.current || key;
          if (!evictFor(blob.size, protectKey)) {
            cacheRef.current.set(key, { bytes: 0, kind: storedKind, status: 'direct', lastUsed: ++clockRef.current });
            bump(scopeGen);
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          if (scopeGen !== scopeGenRef.current || signal?.aborted) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          totalBytesRef.current += blob.size;
          cacheRef.current.set(key, {
            objectUrl,
            bytes: blob.size,
            kind: storedKind,
            status: 'ready',
            lastUsed: ++clockRef.current,
          });
          bump(scopeGen);
        } catch (err) {
          if (isAbortError(err, signal) || scopeGen !== scopeGenRef.current) return;
          cacheRef.current.set(key, {
            bytes: 0,
            kind: storedKind,
            status: 'error',
            lastUsed: ++clockRef.current,
          });
          bump(scopeGen);
        }
      })();

      const settled = work.finally(() => {
        if (inflightRef.current.get(key) === settled) inflightRef.current.delete(key);
      });
      inflightRef.current.set(key, settled);
      return settled;
    },
    [bump, evictFor],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  const prefetch = useCallback((assets: ReviewCacheAsset[], activeKey: string) => {
    if (saveDataEnabled()) return;
    const sig = `${scopeKey}|${activeKey}|${assets.map((asset) => reviewAssetCacheKey(asset)).join('\n')}`;
    if (prefetchSigRef.current === sig) return;
    prefetchSigRef.current = sig;
    const gen = ++prefetchGenRef.current;
    const queue = assets.filter((asset) => isPrefetchCandidate(asset, activeKey));
    const run = chainRef.current.then(async () => {
      for (const asset of queue) {
        if (gen !== prefetchGenRef.current) return;
        if (abortRef.current?.signal.aborted) return;
        const key = reviewAssetCacheKey(asset);
        const existing = cacheRef.current.get(key);
        if (existing && existing.status !== 'loading') continue;
        await new Promise<void>((resolve) => {
          const ric = window.requestIdleCallback;
          if (typeof ric === 'function') {
            const id = ric(() => resolve());
            idleCancelsRef.current.push(() => window.cancelIdleCallback(id));
            return;
          }
          const id = window.setTimeout(resolve, 0);
          idleCancelsRef.current.push(() => window.clearTimeout(id));
        });
        if (gen !== prefetchGenRef.current || abortRef.current?.signal.aborted) return;
        await loadRef.current(asset, { prefetch: true });
      }
    }, async () => undefined);
    chainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
  }, [scopeKey]);

  const get = useCallback((asset: ReviewCacheAsset) => {
    return cacheRef.current.get(reviewAssetCacheKey(asset));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      scopeGenRef.current += 1;
      prefetchGenRef.current += 1;
      prefetchSigRef.current = '';
      controller.abort();
      abortRef.current = null;
      idleCancelsRef.current.forEach((cancel) => cancel());
      idleCancelsRef.current = [];
      chainRef.current = Promise.resolve();
      for (const entry of cacheRef.current.values()) {
        if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      }
      cacheRef.current.clear();
      inflightRef.current.clear();
      totalBytesRef.current = 0;
    };
  }, [scopeKey]);

  return { load, prefetch, get, noteActive };
}
