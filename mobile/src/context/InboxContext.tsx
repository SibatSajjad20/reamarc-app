import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

type InboxValue = {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const InboxContext = createContext<InboxValue | undefined>(undefined);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const rows = await api<{ id: string; read?: boolean }[]>('/mobile/notifications');
      setUnreadCount((rows || []).filter((r) => !r.read).length);
    } catch {
      /* keep last count */
    }
  }, [user]);

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
    const id = setInterval(refreshUnread, 15000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  return (
    <InboxContext.Provider value={{ unreadCount, refreshUnread, markAllRead }}>
      {children}
    </InboxContext.Provider>
  );
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInbox must be used within InboxProvider');
  return ctx;
}
