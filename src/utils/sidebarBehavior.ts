export type SidebarBehavior = 'expanded' | 'collapsed' | 'hover';
export type SidebarRailMode = 'hover' | 'collapsed';

export const DEFAULT_SIDEBAR_BEHAVIOR: SidebarBehavior = 'hover';
export const DEFAULT_RAIL_MODE: SidebarRailMode = 'hover';

export const SIDEBAR_BEHAVIOR_EVENT = 'reamarc:sidebar-behavior';

let inMemoryBehavior: SidebarBehavior | null = null;
let inMemoryRailMode: SidebarRailMode | null = null;

export function resetInMemoryBehaviorOverrides(): void {
  inMemoryBehavior = null;
  inMemoryRailMode = null;
}

export function readSidebarBehavior(userId?: string | null): SidebarBehavior {
  if (inMemoryBehavior !== null) {
    return inMemoryBehavior;
  }
  try {
    const userKey = userId ? `sidebar_behavior_${userId}` : null;
    const raw = (userKey ? localStorage.getItem(userKey) : null) ?? localStorage.getItem('sidebar_behavior');
    if (raw === 'expanded' || raw === 'collapsed' || raw === 'hover') {
      return raw;
    }
    return DEFAULT_SIDEBAR_BEHAVIOR;
  } catch {
    return DEFAULT_SIDEBAR_BEHAVIOR;
  }
}

export function persistSidebarBehavior(behavior: SidebarBehavior, userId?: string | null): void {
  try {
    if (userId) {
      localStorage.setItem(`sidebar_behavior_${userId}`, behavior);
    }
    localStorage.setItem('sidebar_behavior', behavior);
    inMemoryBehavior = null;
  } catch {
    inMemoryBehavior = behavior;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SIDEBAR_BEHAVIOR_EVENT));
  }
}

export function readRailMode(userId?: string | null): SidebarRailMode {
  if (inMemoryRailMode !== null) {
    return inMemoryRailMode;
  }
  try {
    const userKey = userId ? `sidebar_rail_mode_${userId}` : null;
    const raw = (userKey ? localStorage.getItem(userKey) : null) ?? localStorage.getItem('sidebar_rail_mode');
    if (raw === 'hover' || raw === 'collapsed') {
      return raw;
    }
    return DEFAULT_RAIL_MODE;
  } catch {
    return DEFAULT_RAIL_MODE;
  }
}

export function persistRailMode(mode: SidebarRailMode, userId?: string | null): void {
  try {
    if (userId) {
      localStorage.setItem(`sidebar_rail_mode_${userId}`, mode);
    }
    localStorage.setItem('sidebar_rail_mode', mode);
    inMemoryRailMode = null;
  } catch {
    inMemoryRailMode = mode;
  }
}
