import { useEffect, useState } from 'react';
import { taskService } from '@/services/taskService';
import type { TaskCounts } from '@/types/task';

const FOCUS_THROTTLE_MS = 30_000;
const SAFETY_MS = 5 * 60 * 1000;

type Store = {
  counts: TaskCounts | null;
  canSeeTasks: boolean;
  listeners: Set<() => void>;
  timer: number | null;
  inflight: boolean;
  lastFocusRefresh: number;
};

const store: Store = {
  counts: null,
  canSeeTasks: false,
  listeners: new Set(),
  timer: null,
  inflight: false,
  lastFocusRefresh: 0,
};

let taskCountsEnabled = true;

function notify() {
  store.listeners.forEach((fn) => fn());
}

function stopTimer() {
  if (typeof window === 'undefined') return;
  if (store.timer != null) {
    window.clearInterval(store.timer);
    store.timer = null;
  }
}

async function refresh() {
  if (!taskCountsEnabled) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (store.inflight) return;
  store.inflight = true;
  store.lastFocusRefresh = Date.now();
  try {
    const counts = await taskService.getCounts();
    store.counts = counts;
    store.canSeeTasks = true;
    notify();
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    if (status === 403) {
      store.canSeeTasks = false;
      store.counts = null;
      notify();
    }
  } finally {
    store.inflight = false;
  }
}

function refreshFocusThrottled() {
  if (!taskCountsEnabled) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (now - store.lastFocusRefresh < FOCUS_THROTTLE_MS) return;
  store.lastFocusRefresh = now;
  void refresh();
}

function ensureSafetyTimer() {
  if (!taskCountsEnabled) return;
  if (typeof window === 'undefined') return;
  if (store.timer != null) return;
  store.timer = window.setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void refresh();
    }
  }, SAFETY_MS);
}

function onVisibility() {
  if (!taskCountsEnabled) return;
  if (document.visibilityState === 'visible') refreshFocusThrottled();
}

function onFocus() {
  if (!taskCountsEnabled) return;
  refreshFocusThrottled();
}

function onChanged() {
  if (!taskCountsEnabled) return;
  void refresh();
}

export function setTaskCountsEnabled(enabled: boolean) {
  if (taskCountsEnabled === enabled) {
    if (enabled) ensureSafetyTimer();
    return;
  }
  taskCountsEnabled = enabled;
  if (!enabled) {
    stopTimer();
    store.canSeeTasks = false;
    store.counts = null;
    store.inflight = false;
    notify();
    return;
  }
  if (store.listeners.size > 0) {
    ensureSafetyTimer();
    void refresh();
  }
}

export function useTaskCounts() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    store.listeners.add(listener);
    if (taskCountsEnabled) {
      ensureSafetyTimer();
      void refresh();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('focus', onFocus);
      window.addEventListener('reamarc-tasks-changed', onChanged);
      window.addEventListener('reamarc-task-activity', onChanged);
    }
    return () => {
      store.listeners.delete(listener);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('reamarc-tasks-changed', onChanged);
      window.removeEventListener('reamarc-task-activity', onChanged);
      if (store.listeners.size === 0) {
        stopTimer();
      }
    };
  }, []);

  return {
    counts: store.counts,
    canSeeTasks: taskCountsEnabled && store.canSeeTasks,
    refresh,
  };
}
