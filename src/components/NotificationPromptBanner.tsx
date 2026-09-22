import React, { useState, useEffect } from 'react';
import { Bell, X, Sparkles } from 'lucide-react';
import { enableWebPush, notificationPermission } from '../services/webPushService';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export const NotificationPromptBanner: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [show, setShow] = useState<boolean>(false);
  const [enabling, setEnabling] = useState<boolean>(false);

  useEffect(() => {
    // Only prompt internal users (skip clients) when permission has not yet been requested
    if (!user || user.role === 'client') {
      setShow(false);
      return;
    }

    const dismissed = sessionStorage.getItem('reamarc_dismiss_push_prompt');
    if (dismissed === 'true') {
      setShow(false);
      return;
    }

    const currentPermission = notificationPermission();
    if (currentPermission === 'default') {
      // Small timeout so it smoothly slides in right after the app finishes loading
      const timer = window.setTimeout(() => {
        setShow(true);
      }, 1000);
      return () => window.clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [user]);

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem('reamarc_dismiss_push_prompt', 'true');
  };

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const permission = await enableWebPush();
      if (permission === 'granted') {
        setShow(false);
        addToast('Notifications Enabled 🎉', 'You will now receive desktop alerts in real time.', 'success');
      } else if (permission === 'denied') {
        setShow(false);
        addToast('Notifications Blocked', 'Desktop notifications are blocked in your browser settings.', 'warning');
      }
    } catch {
      setShow(false);
    } finally {
      setEnabling(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl p-4 text-zinc-900 dark:text-zinc-100 transition-all">
        {/* Subtle decorative glow */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
            <Bell className="w-5 h-5 animate-bounce-subtle" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <h4 className="text-sm font-bold tracking-tight">Enable Desktop Notifications</h4>
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-3">
              Get instant alerts for leave approvals, attendance check-ins, and team updates.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEnable}
                disabled={enabling}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {enabling ? 'Enabling…' : 'Enable Notifications'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Maybe Later
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
