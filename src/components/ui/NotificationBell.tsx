import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, MessageSquare, RefreshCcw, Loader2 } from 'lucide-react';
import { portalService } from '../../services/portalService';
import type { RevisionNotification } from '../../services/portalService';
import { useToast } from '../../context/ToastContext';

interface NotificationBellProps {
  onResetToReview?: (campaignId: string, rowId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onResetToReview }) => {
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<RevisionNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await portalService.getNotifications();
      setCount(data.count);
      setItems(data.items);
    } catch {
      // silently fail — bell is non-critical
    }
  }, []);

  // Poll every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleOpen = async () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setIsLoading(true);
      try {
        const data = await portalService.getNotifications();
        setCount(data.count);
        setItems(data.items);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleReset = async (item: RevisionNotification) => {
    const key = `${item.campaignId}-${item.rowId}`;
    setResettingId(key);
    try {
      await portalService.resetToReview(item.campaignId, item.rowId);
      addToast('Reset to Review ✅', `${item.serial} sent back to client review.`, 'success');
      onResetToReview?.(item.campaignId, item.rowId);
      await fetchNotifications();
    } catch (err: any) {
      addToast('Reset Failed', err.message, 'error');
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-sm"
        title="Client Revision Requests"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-slate-950 animate-pulse">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-rose-50 dark:bg-rose-950/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">Client Revision Requests</span>
              {count > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={fetchNotifications} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer">
                <RefreshCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                No pending revision requests.
              </div>
            ) : (
              items.map((item) => {
                const key = `${item.campaignId}-${item.rowId}`;
                return (
                  <div key={key} className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">{item.serial}</span>
                          <span className="text-[11px] text-slate-600 dark:text-zinc-400 truncate">{item.campaignTitle}</span>
                        </div>
                        {item.client_feedback && (
                          <>
                            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              [{item.client_feedback.category}]
                            </p>
                            <p className="text-[11px] text-slate-700 dark:text-zinc-300 mt-0.5 line-clamp-2 leading-relaxed">
                              {item.client_feedback.notes}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1">
                              by {item.client_feedback.submitted_by} · {new Date(item.client_feedback.submitted_at).toLocaleDateString()}
                            </p>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleReset(item)}
                        disabled={resettingId === key}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-bold transition-colors cursor-pointer"
                        title="Mark as addressed & reset to In Client Review"
                      >
                        {resettingId === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                        Reset
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
