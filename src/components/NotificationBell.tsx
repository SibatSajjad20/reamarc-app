import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { ViewType } from '../types';
import { apiClient } from '../services/apiClient';
import {
  enableWebPush,
  notificationPermission,
  sendTestPush,
  syncWebPushSubscription,
} from '../services/webPushService';
import { viewForNotificationKind } from '../utils/notificationRoute';
import { useToast } from '../context/ToastContext';

interface InboxItem {
  id: string;
  title: string;
  body: string;
  kind?: string;
  created_at?: string;
  read?: boolean;
}

interface NotificationBellProps {
  collapsed: boolean;
  onSelectView: (view: ViewType) => void;
}

function formatWhen(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ collapsed, onSelectView }) => {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [permission, setPermission] = useState(notificationPermission);
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((item) => !item.read).length;

  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const rows = await apiClient.get<InboxItem[]>('/mobile/notifications?limit=30');
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      // Keep the last list if the feed is briefly unavailable.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 45000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    setPermission(notificationPermission());
    const onPointer = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const markAllRead = async () => {
    try {
      await apiClient.post('/mobile/notifications/read-all');
      setItems((current) => current.map((item) => ({ ...item, read: true })));
    } catch {
      // Badge stays until the next successful poll.
    }
  };

  const enable = async () => {
    setEnabling(true);
    try {
      const next = await enableWebPush();
      setPermission(next);
      if (next === 'granted') {
        addToast('Notifications Enabled 🎉', 'Desktop alerts are now active.', 'success');
      }
    } finally {
      setEnabling(false);
    }
  };

  const handleTestPopup = async () => {
    setTesting(true);
    try {
      const result = await sendTestPush();
      addToast('Notification Test', result.message, result.success ? 'info' : 'warning');
    } catch (err: any) {
      addToast('Test Failed', err.message || 'Could not send test popup.', 'warning');
    } finally {
      setTesting(false);
    }
  };

  const openItem = (item: InboxItem) => {
    onSelectView(viewForNotificationKind(item.kind));
    setOpen(false);
    if (!item.read) void markAllRead();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (permission === 'granted') void syncWebPushSubscription();
          void load();
        }}
        className={`relative text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer ${
          collapsed ? 'w-10 h-10 flex items-center justify-center rounded-xl' : ''
        }`}
        title="Notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-3.5 text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Notifications</p>
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer"
            >
              Mark all read
            </button>
          </div>
          {permission === 'default' && (
            <button
              type="button"
              disabled={enabling}
              onClick={() => void enable()}
              className="w-full text-left px-3 py-2 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/70 transition-colors cursor-pointer"
            >
              {enabling ? 'Enabling…' : '🔔 Enable desktop notifications'}
            </button>
          )}
          {permission === 'granted' && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/40 text-[11px] text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Desktop alerts active
              </span>
              <button
                type="button"
                disabled={testing}
                onClick={() => void handleTestPopup()}
                className="font-semibold text-emerald-800 dark:text-emerald-200 hover:underline cursor-pointer disabled:opacity-50"
              >
                {testing ? 'Sending…' : 'Send test popup'}
              </button>
            </div>
          )}
          {permission === 'denied' && (
            <p className="px-3 py-2 text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
              Desktop alerts are blocked in this browser. You can still read them here.
            </p>
          )}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-zinc-500">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="w-full text-left px-3 py-2.5 border-b border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    {!item.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{item.title}</p>
                      <p className="text-[11px] text-zinc-500 line-clamp-2">{item.body}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{formatWhen(item.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
