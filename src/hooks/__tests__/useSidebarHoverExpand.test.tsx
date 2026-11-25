import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useSidebarHoverExpand } from '../useSidebarHoverExpand';

function mockMatchMedia(reduced = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: q.includes('reduce') ? reduced : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

describe('useSidebarHoverExpand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('opening on hover', () => {
    it('enter, then advance 119 ms → still closed; advance 1 more ms → opening/open', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));
      expect(result.current.peekState).toBe('closed');

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(119);
      });
      expect(result.current.peekState).toBe('closed');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(['opening', 'open']).toContain(result.current.peekState);
      expect(result.current.isPeeking).toBe(true);
    });

    it('enter, then leave at 80 ms → never opens (sweep, no flicker)', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(80);
      });
      expect(result.current.peekState).toBe('closed');

      act(() => {
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      // Advance well past the 120ms open delay
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.peekState).toBe('closed');
      expect(result.current.isPeeking).toBe(false);
    });
  });

  describe('closing', () => {
    it('open, then leave → still open at 249 ms → closing at 250 ms → closed after transitionend or 240 ms fallback', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      // Open
      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120);
      });
      expect(result.current.isPeeking).toBe(true);

      // Advance until open transition settles
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.peekState).toBe('open');

      // Leave
      act(() => {
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.peekState).toBe('closing');

      // Test fallback timer closes it after 240 ms
      act(() => {
        vi.advanceTimersByTime(240);
      });
      expect(result.current.peekState).toBe('closed');
    });

    it('closed after transitionend during closing', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120);
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(250);
      });
      expect(result.current.peekState).toBe('closing');

      const mockElement = {} as HTMLElement;
      act(() => {
        result.current.onTransitionEnd({
          target: mockElement,
          currentTarget: mockElement,
          propertyName: 'width',
        } as unknown as React.TransitionEvent<HTMLElement>);
      });
      expect(result.current.peekState).toBe('closed');
    });

    it('leave, then re-enter at 200 ms → stays open', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current.peekState).toBe('open');
    });

    it('re-enter during closing → back to open with no 120 ms delay', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(250);
      });
      expect(result.current.peekState).toBe('closing');

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });
      // Immediately back to open with no 120 ms delay
      expect(result.current.peekState).toBe('open');
    });
  });

  describe('pointer type', () => {
    it("pointerType: 'touch' and 'pen' never open", () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'touch' } as React.PointerEvent<HTMLElement>);
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.peekState).toBe('closed');

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'pen' } as React.PointerEvent<HTMLElement>);
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.peekState).toBe('closed');
    });
  });

  describe('disabling', () => {
    it('enabled=false never opens; switching to false while open → closed, and timers are cleared (vi.getTimerCount() → 0)', () => {
      let enabled = false;
      const { result, rerender } = renderHook(() => useSidebarHoverExpand({ enabled }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(500);
      });
      expect(result.current.peekState).toBe('closed');
      expect(vi.getTimerCount()).toBe(0);

      // Enable and open
      enabled = true;
      rerender();

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120);
      });
      expect(result.current.isPeeking).toBe(true);

      // Disable while open
      enabled = false;
      rerender();
      expect(result.current.peekState).toBe('closed');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('focus', () => {
    it("keyboard focus (stub matches(':focus-visible') → true) opens immediately", () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      const mockTarget = {
        matches: (sel: string) => sel === ':focus-visible',
        hasAttribute: () => false,
      };

      act(() => {
        result.current.panelProps.onFocusCapture({ target: mockTarget } as unknown as React.FocusEvent<HTMLElement>);
      });

      expect(['opening', 'open']).toContain(result.current.peekState);
      expect(result.current.isPeeking).toBe(true);
    });

    it('non-visible focus does not open', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      const mockTarget = {
        matches: () => false,
        hasAttribute: () => false,
      };

      act(() => {
        result.current.panelProps.onFocusCapture({ target: mockTarget } as unknown as React.FocusEvent<HTMLElement>);
      });

      expect(result.current.peekState).toBe('closed');
      expect(result.current.isPeeking).toBe(false);
    });

    it('blur to outside closes after 250 ms', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      const mockTarget = {
        matches: (sel: string) => sel === ':focus-visible',
        hasAttribute: () => false,
      };
      act(() => {
        result.current.panelProps.onFocusCapture({ target: mockTarget } as unknown as React.FocusEvent<HTMLElement>);
        vi.advanceTimersByTime(200);
      });
      expect(result.current.peekState).toBe('open');

      const panelElem = { contains: () => false };
      act(() => {
        result.current.panelProps.onBlurCapture({
          currentTarget: panelElem,
          relatedTarget: null,
        } as unknown as React.FocusEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.peekState).toBe('closing');
    });

    it('blur to inside does not close', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      const mockTarget = {
        matches: (sel: string) => sel === ':focus-visible',
        hasAttribute: () => false,
      };
      act(() => {
        result.current.panelProps.onFocusCapture({ target: mockTarget } as unknown as React.FocusEvent<HTMLElement>);
        vi.advanceTimersByTime(200);
      });
      expect(result.current.peekState).toBe('open');

      const insideTarget = {};
      const panelElem = { contains: (node: unknown) => node === insideTarget };
      act(() => {
        result.current.panelProps.onBlurCapture({
          currentTarget: panelElem,
          relatedTarget: insideTarget,
        } as unknown as React.FocusEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.peekState).toBe('open');
    });

    it('Escape closes', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        result.current.panelProps.onKeyDown({
          key: 'Escape',
          stopPropagation: () => {},
        } as React.KeyboardEvent<HTMLElement>);
      });
      expect(result.current.peekState).toBe('closing');

      act(() => {
        vi.advanceTimersByTime(240);
      });
      expect(result.current.peekState).toBe('closed');
    });
  });

  describe('overlays', () => {
    it('setOverlayOpen("user", true) then leave → stays open indefinitely (advance 5 s)', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        result.current.setOverlayOpen('user', true);
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.peekState).toBe('open');
    });

    it('setOverlayOpen("user", false) with the pointer outside → closes after 250 ms', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
        result.current.setOverlayOpen('user', true);
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      act(() => {
        result.current.setOverlayOpen('user', false);
      });

      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.peekState).toBe('closing');
    });

    it('two overlays: closing one keeps it open', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
        result.current.setOverlayOpen('company', true);
        result.current.setOverlayOpen('user', true);
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      // Close only company
      act(() => {
        result.current.setOverlayOpen('company', false);
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.peekState).toBe('open');

      // Close user as well
      act(() => {
        result.current.setOverlayOpen('user', false);
      });

      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(result.current.peekState).toBe('closing');
    });
  });

  describe('reduced motion', () => {
    it('reduced motion: no opening/closing states, instant open/closed', () => {
      mockMatchMedia(true);
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120);
      });
      // Skips 'opening', goes instantly to 'open'
      expect(result.current.peekState).toBe('open');

      act(() => {
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(250);
      });
      // Skips 'closing', goes instantly to 'closed'
      expect(result.current.peekState).toBe('closed');
    });
  });

  describe('no redundant state', () => {
    it('repeated enter events while open cause no extra renders (count renders)', () => {
      let renderCount = 0;
      const { result } = renderHook(() => {
        renderCount++;
        return useSidebarHoverExpand({ enabled: true });
      });

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
      });
      expect(result.current.peekState).toBe('open');

      const countAfterOpen = renderCount;

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });

      expect(renderCount).toBe(countAfterOpen);
    });
  });


  describe('closeNow', () => {
    it('closes immediately and does not reopen until pointer leaves and re-enters', () => {
      const { result } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
      });
      expect(result.current.peekState).toBe('open');

      act(() => {
        result.current.closeNow();
      });
      expect(result.current.peekState).toBe('closed');
      expect(result.current.isPeeking).toBe(false);

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(500);
      });
      expect(result.current.peekState).toBe('closed');

      act(() => {
        result.current.panelProps.onPointerLeave({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
        vi.advanceTimersByTime(120 + 200);
      });
      expect(result.current.peekState).toBe('open');
    });
  });

  describe('unmount with pending timers', () => {
    it('unmount with pending timers: no warnings, timer count 0', () => {
      const { result, unmount } = renderHook(() => useSidebarHoverExpand({ enabled: true }));

      act(() => {
        result.current.panelProps.onPointerEnter({ pointerType: 'mouse' } as React.PointerEvent<HTMLElement>);
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
