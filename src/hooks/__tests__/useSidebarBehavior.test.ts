import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarBehavior } from '../useSidebarBehavior';
import {
  DEFAULT_SIDEBAR_BEHAVIOR,
  SIDEBAR_BEHAVIOR_EVENT,
  resetInMemoryBehaviorOverrides,
} from '@/utils/sidebarBehavior';

describe('useSidebarBehavior', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInMemoryBehaviorOverrides();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to hover with empty storage, and with garbage values', () => {
    const { result } = renderHook(() => useSidebarBehavior());
    expect(result.current.behavior).toBe(DEFAULT_SIDEBAR_BEHAVIOR);
    expect(result.current.behavior).toBe('hover');

    // Garbage value in localStorage
    act(() => {
      localStorage.setItem('sidebar_behavior', 'invalid_junk');
      window.dispatchEvent(new CustomEvent(SIDEBAR_BEHAVIOR_EVENT));
    });
    expect(result.current.behavior).toBe('hover');
  });

  it('per-user key wins over the generic key', () => {
    localStorage.setItem('sidebar_behavior', 'hover');
    localStorage.setItem('sidebar_behavior_user_1', 'expanded');

    const { result } = renderHook(() => useSidebarBehavior('user_1'));
    expect(result.current.behavior).toBe('expanded');

    const { result: otherUser } = renderHook(() => useSidebarBehavior('user_2'));
    expect(otherUser.current.behavior).toBe('hover');
  });

  it('setBehavior persists both keys and notifies another hook instance in the same tab (the custom event)', () => {
    const hookA = renderHook(() => useSidebarBehavior('user_42'));
    const hookB = renderHook(() => useSidebarBehavior('user_42'));

    expect(hookA.result.current.behavior).toBe('hover');
    expect(hookB.result.current.behavior).toBe('hover');

    act(() => {
      hookA.result.current.setBehavior('collapsed');
    });

    expect(hookA.result.current.behavior).toBe('collapsed');
    expect(hookB.result.current.behavior).toBe('collapsed');
    expect(localStorage.getItem('sidebar_behavior_user_42')).toBe('collapsed');
    expect(localStorage.getItem('sidebar_behavior')).toBe('collapsed');
  });

  it('a storage event from another tab updates it', () => {
    const { result } = renderHook(() => useSidebarBehavior());
    expect(result.current.behavior).toBe('hover');

    act(() => {
      localStorage.setItem('sidebar_behavior', 'expanded');
      window.dispatchEvent(new StorageEvent('storage', { key: 'sidebar_behavior', newValue: 'expanded' }));
    });

    expect(result.current.behavior).toBe('expanded');
  });

  it('toggle: hover→expanded→hover; collapsed→expanded→collapsed (rail mode remembered)', () => {
    const { result } = renderHook(() => useSidebarBehavior());
    // Initially hover
    expect(result.current.behavior).toBe('hover');

    // hover -> expanded
    act(() => {
      result.current.toggle();
    });
    expect(result.current.behavior).toBe('expanded');

    // expanded -> hover (rail mode was hover)
    act(() => {
      result.current.toggle();
    });
    expect(result.current.behavior).toBe('hover');

    // Set to collapsed (rail mode becomes collapsed)
    act(() => {
      result.current.setBehavior('collapsed');
    });
    expect(result.current.behavior).toBe('collapsed');

    // collapsed -> expanded
    act(() => {
      result.current.toggle();
    });
    expect(result.current.behavior).toBe('expanded');

    // expanded -> collapsed (rail mode was remembered as collapsed)
    act(() => {
      result.current.toggle();
    });
    expect(result.current.behavior).toBe('collapsed');
  });

  it('localStorage throwing (stub setItem to throw) → no crash, in-memory value still updates', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    const { result } = renderHook(() => useSidebarBehavior());
    expect(result.current.behavior).toBe('hover');

    expect(() => {
      act(() => {
        result.current.setBehavior('expanded');
      });
    }).not.toThrow();

    expect(result.current.behavior).toBe('expanded');
  });

  it('old sidebar_collapsed* keys are untouched', () => {
    localStorage.setItem('sidebar_collapsed_user_99', 'true');
    localStorage.setItem('sidebar_collapsed', 'true');

    const { result } = renderHook(() => useSidebarBehavior('user_99'));
    // Should still default to hover, ignoring old collapsed keys
    expect(result.current.behavior).toBe('hover');

    act(() => {
      result.current.setBehavior('expanded');
    });

    // Old keys remain byte-untouched
    expect(localStorage.getItem('sidebar_collapsed_user_99')).toBe('true');
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
  });
});
