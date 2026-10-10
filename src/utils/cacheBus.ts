/**
 * Cross-module cache invalidation bus and app-wide cache lifecycle manager.
 * Ensures instant updates across all views, widgets, and badges after mutations
 * without full-page reloads or redundant skeleton flashes.
 */
import { useEffect, useRef } from 'react';

export type InvalidationKey =
  | 'attendance'
  | 'requests'
  | 'approvals'
  | 'crm'
  | 'crm.leads'
  | 'crm.deals'
  | 'crm.counts'
  | 'daily-log'
  | 'content-calendar'
  | 'website-pipeline'
  | 'workspaces'
  | 'admin.members'
  | 'marketing'
  | 'exceptions'
  | 'notifications'
  | 'settings'
  | 'dashboard';

type InvalidationListener = (key: InvalidationKey) => void;
const listeners = new Set<{ keys: Set<InvalidationKey>; callback: InvalidationListener }>();

type CacheClearer = () => void;
const cacheClearers = new Set<CacheClearer>();

/**
 * Register a service or module cache cleaner for global logout/user-switch sweeps.
 */
export function registerCacheClearer(cleaner: CacheClearer): () => void {
  cacheClearers.add(cleaner);
  return () => {
    cacheClearers.delete(cleaner);
  };
}

/**
 * Sweeps all in-memory caches across all modules.
 * Called on user logout and user ID switch.
 */
export function clearAllAppCaches(): void {
  for (const cleaner of cacheClearers) {
    try {
      cleaner();
    } catch {
      // ignore
    }
  }
}

/**
 * Emit an invalidation event for one or more domain keys.
 */
export function emitInvalidation(keys: InvalidationKey | InvalidationKey[]): void {
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const key of keyList) {
    for (const sub of listeners) {
      if (sub.keys.has(key)) {
        try {
          sub.callback(key);
        } catch {
          // ignore listener errors
        }
      }
    }
  }
}

/**
 * Subscribe to invalidation events for given keys.
 */
export function subscribeInvalidation(
  keys: InvalidationKey | InvalidationKey[],
  callback: InvalidationListener
): () => void {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const entry = {
    keys: new Set(keyList),
    callback,
  };
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}

/**
 * React hook to listen for cache invalidations and quietly trigger revalidation.
 */
export function useCacheInvalidation(
  keys: InvalidationKey | InvalidationKey[],
  onInvalidate: (key: InvalidationKey) => void
): void {
  const callbackRef = useRef(onInvalidate);
  useEffect(() => {
    callbackRef.current = onInvalidate;
  });

  const keysKey = Array.isArray(keys) ? keys.sort().join('|') : keys;

  useEffect(() => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    return subscribeInvalidation(keyList, (k) => {
      callbackRef.current(k);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey]);
}
