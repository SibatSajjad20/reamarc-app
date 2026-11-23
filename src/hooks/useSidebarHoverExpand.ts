import React, { useState, useEffect, useRef, useCallback } from 'react';

export type PeekState = 'closed' | 'opening' | 'open' | 'closing';

export interface UseSidebarHoverExpandOptions {
  enabled: boolean;
  openDelay?: number;
  closeDelay?: number;
  closeAnimMs?: number;
}

export interface UseSidebarHoverExpandResult {
  peekState: PeekState;
  isPeeking: boolean;
  panelProps: {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
    onFocusCapture: (e: React.FocusEvent<HTMLElement>) => void;
    onBlurCapture: (e: React.FocusEvent<HTMLElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  };
  setOverlayOpen: (key: string, open: boolean) => void;
  onTransitionEnd: (e: React.TransitionEvent<HTMLElement>) => void;
  closeNow: () => void;
}

export function useSidebarHoverExpand({
  enabled,
  openDelay = 120,
  closeDelay = 250,
  closeAnimMs = 240,
}: UseSidebarHoverExpandOptions): UseSidebarHoverExpandResult {
  const [peekState, setPeekState] = useState<PeekState>('closed');
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  const peekStateRef = useRef<PeekState>('closed');

  const updatePeekState = useCallback((next: PeekState) => {
    if (peekStateRef.current === next) return;
    peekStateRef.current = next;
    setPeekState(next);
  }, []);

  const reducedMotionRef = useRef<boolean>(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closeAnimTimerRef = useRef<number | null>(null);
  const openAnimTimerRef = useRef<number | null>(null);

  const isPointerInsideRef = useRef(false);
  const hasKeyboardFocusRef = useRef(false);
  const openOverlaysRef = useRef<Set<string>>(new Set());

  // Subscribe to prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    try {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handler = (e: MediaQueryListEvent) => {
        setReducedMotion(e.matches);
      };
      if (mql.addEventListener) {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
      } else if (mql.addListener) {
        mql.addListener(handler);
        return () => mql.removeListener(handler);
      }
    } catch {}
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearOpenAnimTimer = useCallback(() => {
    if (openAnimTimerRef.current !== null) {
      window.clearTimeout(openAnimTimerRef.current);
      openAnimTimerRef.current = null;
    }
  }, []);

  const clearCloseTimers = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (closeAnimTimerRef.current !== null) {
      window.clearTimeout(closeAnimTimerRef.current);
      closeAnimTimerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearOpenTimer();
    clearOpenAnimTimer();
    clearCloseTimers();
  }, [clearOpenTimer, clearOpenAnimTimer, clearCloseTimers]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Handle enabled changes: when false, clear timers and reset to closed immediately
  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      isPointerInsideRef.current = false;
      hasKeyboardFocusRef.current = false;
      openOverlaysRef.current.clear();
      updatePeekState('closed');
    }
  }, [enabled, clearAllTimers, updatePeekState]);

  const startClosing = useCallback(() => {
    clearOpenTimer();
    clearOpenAnimTimer();
    clearCloseTimers();

    if (reducedMotionRef.current) {
      updatePeekState('closed');
      return;
    }

    updatePeekState('closing');
    closeAnimTimerRef.current = window.setTimeout(() => {
      closeAnimTimerRef.current = null;
      updatePeekState('closed');
    }, closeAnimMs);
  }, [clearOpenTimer, clearOpenAnimTimer, clearCloseTimers, closeAnimMs, updatePeekState]);

  const scheduleCloseIfAllowed = useCallback(() => {
    if (!enabled) return;
    if (isPointerInsideRef.current) return;
    if (hasKeyboardFocusRef.current) return;
    if (openOverlaysRef.current.size > 0) return;

    clearCloseTimers();
    clearOpenTimer();

    if (peekStateRef.current === 'closed') return;

    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      startClosing();
    }, closeDelay);
  }, [enabled, closeDelay, clearCloseTimers, clearOpenTimer, startClosing]);

  const onPointerEnter = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.pointerType !== 'mouse') return;

      isPointerInsideRef.current = true;
      clearCloseTimers();

      const current = peekStateRef.current;
      if (current === 'closing') {
        // Re-enter during closing reverses immediately with no intent delay
        clearCloseTimers();
        clearOpenTimer();
        clearOpenAnimTimer();
        updatePeekState('open');
        return;
      }

      if (current === 'open' || current === 'opening') {
        // Already open or opening, no redundant updates
        return;
      }

      // At rest (closed): start intent delay timer
      clearOpenTimer();
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        if (!isPointerInsideRef.current && !hasKeyboardFocusRef.current) return;

        if (reducedMotionRef.current) {
          updatePeekState('open');
        } else {
          updatePeekState('opening');
          clearOpenAnimTimer();
          openAnimTimerRef.current = window.setTimeout(() => {
            openAnimTimerRef.current = null;
            if (peekStateRef.current === 'opening') {
              updatePeekState('open');
            }
          }, 200);
        }
      }, openDelay);
    },
    [enabled, openDelay, clearCloseTimers, clearOpenTimer, clearOpenAnimTimer, updatePeekState]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.pointerType !== 'mouse') return;

      isPointerInsideRef.current = false;
      clearOpenTimer();
      scheduleCloseIfAllowed();
    },
    [enabled, clearOpenTimer, scheduleCloseIfAllowed]
  );

  const onFocusCapture = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      if (!enabled) return;
      const target = e.target as HTMLElement | null;
      let isVisible = false;
      try {
        isVisible = Boolean(
          target &&
            (target.matches(':focus-visible') || target.hasAttribute('data-focus-visible-added'))
        );
      } catch {
        isVisible = false;
      }

      if (isVisible) {
        hasKeyboardFocusRef.current = true;
        clearCloseTimers();
        clearOpenTimer();

        const current = peekStateRef.current;
        if (current === 'closed') {
          if (reducedMotionRef.current) {
            updatePeekState('open');
          } else {
            updatePeekState('opening');
            clearOpenAnimTimer();
            openAnimTimerRef.current = window.setTimeout(() => {
              openAnimTimerRef.current = null;
              if (peekStateRef.current === 'opening') {
                updatePeekState('open');
              }
            }, 200);
          }
        } else if (current === 'closing') {
          clearCloseTimers();
          updatePeekState('open');
        }
      }
    },
    [enabled, clearCloseTimers, clearOpenTimer, clearOpenAnimTimer, updatePeekState]
  );

  const onBlurCapture = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      if (!enabled) return;
      const currentTarget = e.currentTarget;
      const relatedTarget = e.relatedTarget as Node | null;
      const blurToOutside = !relatedTarget || !currentTarget.contains(relatedTarget);

      if (blurToOutside) {
        hasKeyboardFocusRef.current = false;
        scheduleCloseIfAllowed();
      }
    },
    [enabled, scheduleCloseIfAllowed]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.key === 'Escape') {
        if (openOverlaysRef.current.size === 0 && peekStateRef.current !== 'closed') {
          e.stopPropagation();
          hasKeyboardFocusRef.current = false;
          startClosing();
        }
      }
    },
    [enabled, startClosing]
  );

  const setOverlayOpen = useCallback(
    (key: string, open: boolean) => {
      if (open) {
        openOverlaysRef.current.add(key);
        clearCloseTimers();
      } else {
        openOverlaysRef.current.delete(key);
        scheduleCloseIfAllowed();
      }
    },
    [clearCloseTimers, scheduleCloseIfAllowed]
  );

  const onTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.propertyName !== 'width') return;

      if (peekStateRef.current === 'closing') {
        if (closeAnimTimerRef.current !== null) {
          window.clearTimeout(closeAnimTimerRef.current);
          closeAnimTimerRef.current = null;
        }
        updatePeekState('closed');
      } else if (peekStateRef.current === 'opening') {
        if (openAnimTimerRef.current !== null) {
          window.clearTimeout(openAnimTimerRef.current);
          openAnimTimerRef.current = null;
        }
        updatePeekState('open');
      }
    },
    [updatePeekState]
  );

  const closeNow = useCallback(() => {
    clearAllTimers();
    hasKeyboardFocusRef.current = false;
    isPointerInsideRef.current = false;
    updatePeekState('closed');
  }, [clearAllTimers, updatePeekState]);

  return {
    peekState,
    isPeeking: peekState !== 'closed',
    panelProps: {
      onPointerEnter,
      onPointerLeave,
      onFocusCapture,
      onBlurCapture,
      onKeyDown,
    },
    setOverlayOpen,
    onTransitionEnd,
    closeNow,
  };
}
