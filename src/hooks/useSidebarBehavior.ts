import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  type SidebarBehavior,
  DEFAULT_SIDEBAR_BEHAVIOR,
  SIDEBAR_BEHAVIOR_EVENT,
  readSidebarBehavior,
  persistSidebarBehavior,
  readRailMode,
  persistRailMode,
  resetInMemoryBehaviorOverrides,
} from '@/utils/sidebarBehavior';

export interface UseSidebarBehaviorResult {
  behavior: SidebarBehavior;
  setBehavior: (behavior: SidebarBehavior) => void;
  toggle: () => void;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleCustom = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith('sidebar_behavior') || e.key.startsWith('sidebar_rail_mode')) {
      resetInMemoryBehaviorOverrides();
      callback();
    }
  };
  window.addEventListener(SIDEBAR_BEHAVIOR_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(SIDEBAR_BEHAVIOR_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useSidebarBehavior(userId?: string | null): UseSidebarBehaviorResult {
  const effectiveUserId = useMemo(() => {
    if (userId) return userId;
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem('reamarc_last_user_id') : null;
    } catch {
      return null;
    }
  }, [userId]);

  const getSnapshot = useCallback(() => {
    return readSidebarBehavior(effectiveUserId);
  }, [effectiveUserId]);

  const getServerSnapshot = useCallback(() => {
    return DEFAULT_SIDEBAR_BEHAVIOR;
  }, []);

  const behavior = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setBehavior = useCallback(
    (newBehavior: SidebarBehavior) => {
      if (newBehavior === 'hover' || newBehavior === 'collapsed') {
        persistRailMode(newBehavior, effectiveUserId);
      }
      persistSidebarBehavior(newBehavior, effectiveUserId);
    },
    [effectiveUserId]
  );

  const toggle = useCallback(() => {
    const current = readSidebarBehavior(effectiveUserId);
    if (current === 'expanded') {
      const railMode = readRailMode(effectiveUserId);
      setBehavior(railMode);
    } else {
      setBehavior('expanded');
    }
  }, [effectiveUserId, setBehavior]);

  return { behavior, setBehavior, toggle };
}
