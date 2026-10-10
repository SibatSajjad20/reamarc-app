import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Contact,
  Clock,
  CalendarCheck2,
  CalendarDays,
} from 'lucide-react';
import type { ViewType } from '@/types';
import { apiClient } from '@/services/apiClient';
import {
  enableWebPush,
  notificationPermission,
  syncWebPushSubscription,
} from '@/services/webPushService';
import { viewForNotificationKind } from '@/utils/notificationRoute';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { emitInvalidation, useCacheInvalidation } from '@/utils/cacheBus';

interface InboxItem {
  id: string;
  title: string;
  body: string;
  kind?: string;
  created_at?: string;
  read?: boolean;
}

export interface NotificationBellProps {
  collapsed?: boolean;
  onSelectView: (view: ViewType) => void;
  placement?: 'bottom' | 'top';
  className?: string;
}

function getRelativeTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    if (diffHours < 6) return `${diffHours}h`;
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isDateToday(value?: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function getNotificationIcon(kind?: string) {
  if (!kind) return Bell;
  const k = kind.toLowerCase();
  if (k.startsWith('crm')) return Contact;
  if (k.includes('leave') || k.includes('attendance') || k.includes('checkin') || k.includes('shift')) {
    return k.includes('leave') ? CalendarCheck2 : Clock;
  }
  if (k.startsWith('content_calendar') || k.startsWith('campaign')) return CalendarDays;
  return Bell;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onSelectView,
  className,
}) => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [permission, setPermission] = useState(notificationPermission);
  const [enabling, setEnabling] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((item) => !item.read).length;

  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const rows = await apiClient.get<InboxItem[]>('/mobile/notifications?limit=30');
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      // Keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 45000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    const onPush = (e: MessageEvent) => {
      if (e.data?.type === 'reamarc-push-received') {
        void load();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onPush);

    const onCustomRefresh = () => void load();
    window.addEventListener('reamarc-notification-refresh', onCustomRefresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onPush);
      window.removeEventListener('reamarc-notification-refresh', onCustomRefresh);
    };
  }, [load]);

  useCacheInvalidation(['notifications', 'requests', 'approvals'], () => {
    void load();
  });

  useEffect(() => {
    if (!open) return;
    setPermission(notificationPermission());
    const onPointer = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const markAllRead = async () => {
    try {
      await apiClient.post('/mobile/notifications/read-all');
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      emitInvalidation(['notifications']);
    } catch {
      // Badge stays
    }
  };

  const enable = async () => {
    setEnabling(true);
    try {
      const next = await enableWebPush();
      setPermission(next);
      if (next === 'granted') {
        addToast('Desktop notifications on', 'Desktop alerts are now active.', 'success');
      }
    } finally {
      setEnabling(false);
    }
  };


  const markOneRead = async (id: string) => {
    try {
      await apiClient.post(`/mobile/notifications/${encodeURIComponent(id)}/read`);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
      emitInvalidation(['notifications']);
    } catch {
      // Keep state as is on error
    }
  };

  const openItem = (item: InboxItem) => {
    onSelectView(viewForNotificationKind(item.kind, user?.role));
    setOpen(false);
    if (!item.read) {
      void markOneRead(item.id);
    }
  };

  const filteredItems = activeTab === 'unread' ? items.filter((item) => !item.read) : items;
  const todayItems = filteredItems.filter((item) => isDateToday(item.created_at));
  const earlierItems = filteredItems.filter((item) => !isDateToday(item.created_at));

  return (
    <div className={cn('relative', className)} ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (permission === 'granted') void syncWebPushSubscription();
          void load();
        }}
        className={cn(
          'w-8 h-8 rounded-md flex items-center justify-center text-fg-2 hover:bg-hover transition-colors relative cursor-pointer select-none focus-visible:focus-ring',
          open && 'bg-subtle text-fg'
        )}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Bell size={18} className="shrink-0 text-fg-muted" />
        {unreadCount > 0 && (
          <span
            className="absolute top-[7px] right-[8px] w-[7px] h-[7px] rounded-full bg-accent ring-2 ring-surface"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications panel"
          className="absolute right-0 top-full mt-2 w-[384px] max-w-[calc(100vw-2rem)] max-h-[480px] rounded-lg border border-border bg-surface text-fg shadow-md z-[var(--z-popover)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-120"
        >
          {/* Header */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
            <h3 className="text-sm font-semibold text-fg">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={CheckCheck}
                onClick={() => void markAllRead()}
                className="h-7 text-xs text-accent-text hover:text-accent-hover"
              >
                Mark all as read
              </Button>
            )}
          </div>

          {/* Underline Tabs: All vs Unread */}
          <div className="flex px-4 border-b border-border gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={cn(
                'h-9 text-[13px] font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer',
                activeTab === 'all'
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={cn(
                'h-9 text-[13px] font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer',
                activeTab === 'unread'
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              )}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="text-micro font-medium px-1.5 py-0.5 rounded-full bg-subtle text-fg-2 font-mono">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Push permission state prompt */}
          {permission === 'default' && (
            <div className="px-4 py-2.5 bg-subtle border-b border-border flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Bell size={16} className="text-fg-muted shrink-0" />
                <span className="text-[13px] text-fg truncate">Get desktop alerts for new activity</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={enabling}
                onClick={() => void enable()}
                className="shrink-0"
              >
                {enabling ? 'Enabling…' : 'Turn on'}
              </Button>
            </div>
          )}


          {permission === 'denied' && (
            <div className="px-4 py-2 bg-subtle text-fg-muted border-b border-border text-xs shrink-0">
              Desktop alerts are blocked in this browser. You can still read notifications here.
            </div>
          )}

          {/* List Content */}
          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 items-start animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-skel shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-skel rounded w-3/5" />
                      <div className="h-3 bg-skel rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-fg-muted mb-2">
                  <Bell size={20} />
                </div>
                <p className="text-[13px] font-medium text-fg">You&apos;re all caught up</p>
                <p className="text-xs text-fg-muted mt-0.5">New notifications will show up here.</p>
              </div>
            ) : (
              <div>
                {todayItems.length > 0 && (
                  <div>
                    <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-fg-muted">
                      Today
                    </div>
                    {todayItems.map((item) => {
                      const Icon = getNotificationIcon(item.kind);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openItem(item)}
                          className="w-full text-left px-4 py-3 border-b border-border hover:bg-hover transition-colors flex items-start gap-3 cursor-pointer select-none"
                        >
                          <div className="w-8 h-8 rounded-full bg-subtle text-fg-2 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'text-[13px] truncate',
                                  item.read ? 'text-fg-2 font-normal' : 'text-fg font-medium'
                                )}
                              >
                                {item.title}
                              </span>
                              <span className="text-xs text-fg-muted font-mono shrink-0">
                                {getRelativeTime(item.created_at)}
                              </span>
                            </div>
                            <p className="text-xs text-fg-muted line-clamp-2 mt-0.5 leading-normal">
                              {item.body}
                            </p>
                          </div>
                          {!item.read && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-2"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {earlierItems.length > 0 && (
                  <div>
                    <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-fg-muted">
                      Earlier
                    </div>
                    {earlierItems.map((item) => {
                      const Icon = getNotificationIcon(item.kind);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openItem(item)}
                          className="w-full text-left px-4 py-3 border-b border-border hover:bg-hover transition-colors flex items-start gap-3 cursor-pointer select-none"
                        >
                          <div className="w-8 h-8 rounded-full bg-subtle text-fg-2 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'text-[13px] truncate',
                                  item.read ? 'text-fg-2 font-normal' : 'text-fg font-medium'
                                )}
                              >
                                {item.title}
                              </span>
                              <span className="text-xs text-fg-muted font-mono shrink-0">
                                {getRelativeTime(item.created_at)}
                              </span>
                            </div>
                            <p className="text-xs text-fg-muted line-clamp-2 mt-0.5 leading-normal">
                              {item.body}
                            </p>
                          </div>
                          {!item.read && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-2"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
