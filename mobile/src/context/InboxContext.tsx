import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { getClearedNotificationsCutoff } from '../lib/secure';
import { useAuth } from './AuthContext';

/** One inbox poll for the whole app (badge + local banners). Also refreshes on app focus. */
export const INBOX_POLL_MS = 30000;

export type InboxRow = { id: string; title?: string; body?: string; read?: boolean; created_at?: string };

type InboxValue = {
  unreadCount: number;
  /** Latest inbox rows and the `user:company` they were fetched for. */
  rows: InboxRow[];
  rowsKey: string | null;
  refreshUnread: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const InboxContext = createContext<InboxValue | undefined>(undefined);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [rowsKey, setRowsKey] = useState<string | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      setRows([]);
      setRowsKey(null);
      return;
    }
    const key = `${user.id}:${user.company_id || ''}`;
    try {
      const [fetched, cutoff] = await Promise.all([
        api<InboxRow[]>('/mobile/notifications'),
        getClearedNotificationsCutoff(),
      ]);
      const list = fetched || [];
      setRows(list);
      setRowsKey(key);
      const valid = list.filter((r) => !cutoff || !r.created_at || r.created_at > cutoff);
      setUnreadCount(valid.filter((r) => !r.read).length);
    } catch {
      /* keep last count */
    }
  }, [user, user?.company_id]);

  const markAllRead = useCallback(async () => {
    try {
      await api('/mobile/notifications/read-all', { method: 'POST' });
    } catch {
      /* still refresh */
    }
    await refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    refreshUnread();
    const id = setInterval(refreshUnread, INBOX_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshUnread();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refreshUnread, user?.company_id]);

  return (
    <InboxContext.Provider value={{ unreadCount, rows, rowsKey, refreshUnread, markAllRead }}>
      {children}
    </InboxContext.Provider>
  );
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInbox must be used within InboxProvider');
  return ctx;
}
