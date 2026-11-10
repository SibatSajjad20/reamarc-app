import { useCallback, useEffect, useRef, useState } from 'react';
import { taskService } from '@/services/taskService';
import type { TaskConversation } from '@/types/task';

const FOCUS_THROTTLE_MS = 30_000;
const SAFETY_MS = 5 * 60 * 1000;

export function useTaskChat(enabled: boolean, panelOpen = false) {
  const [conversations, setConversations] = useState<TaskConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [page, setPage] = useState(1);
  const unreadInflight = useRef(false);
  const convInflight = useRef(false);
  const lastFocusRefresh = useRef(0);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const pageRef = useRef(page);
  pageRef.current = page;

  const loadUnread = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (unreadInflight.current) return;
    unreadInflight.current = true;
    lastFocusRefresh.current = Date.now();
    try {
      const unread = await taskService.getChatUnread();
      setUnreadTotal(unread.total || 0);
    } catch {
      setUnreadTotal(0);
    } finally {
      unreadInflight.current = false;
    }
  }, [enabled]);

  const loadConversations = useCallback(async () => {
    if (!enabled || !panelOpenRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (convInflight.current) return;
    convInflight.current = true;
    try {
      const conv = await taskService.getConversations(pageRef.current, 30);
      setConversations(conv.items || []);
      setTotal(conv.total || 0);
    } catch {
      setConversations([]);
    } finally {
      convInflight.current = false;
    }
  }, [enabled]);

  const load = useCallback(async () => {
    await Promise.all([loadUnread(), loadConversations()]);
  }, [loadUnread, loadConversations]);

  const loadFocusThrottled = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastFocusRefresh.current < FOCUS_THROTTLE_MS) return;
    lastFocusRefresh.current = now;
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    void loadUnread();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, SAFETY_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') loadFocusThrottled();
    };
    window.addEventListener('focus', loadFocusThrottled);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('reamarc-tasks-changed', load);
    window.addEventListener('reamarc-task-activity', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', loadFocusThrottled);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('reamarc-tasks-changed', load);
      window.removeEventListener('reamarc-task-activity', load);
    };
  }, [enabled, load, loadUnread, loadFocusThrottled]);

  useEffect(() => {
    if (!enabled || !panelOpen) return;
    void loadConversations();
  }, [enabled, panelOpen, page, loadConversations]);

  const markRead = useCallback(async (taskId: string) => {
    await taskService.markRead(taskId);
    await load();
  }, [load]);

  return {
    conversations,
    total,
    unreadTotal,
    page,
    setPage,
    refresh: load,
    markRead,
  };
}
