import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { enableWebPush, notificationPermission } from '@/services/webPushService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

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
        addToast('Desktop notifications on', 'Desktop alerts are now active.', 'success');
      } else if (permission === 'denied') {
        setShow(false);
        addToast('Notifications blocked', 'Desktop notifications are blocked in your browser settings.', 'warning');
      }
    } catch {
      setShow(false);
    } finally {
      setEnabling(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed top-[64px] right-6 z-50 max-w-[360px] w-full animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="rounded-lg border border-border bg-surface shadow-md p-4 text-fg relative">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 p-1 text-fg-muted hover:text-fg rounded-md hover:bg-hover transition-colors cursor-pointer"
          aria-label="Dismiss desktop notifications prompt"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-8 h-8 rounded-full bg-subtle text-fg-2 flex items-center justify-center shrink-0 mt-0.5">
            <Bell size={16} className="text-fg-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-fg">Turn on desktop notifications</h4>
            <p className="text-[13px] text-fg-muted mt-1 leading-normal">
              Get approvals and reminders even when this tab is in the background.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="primary"
                size="sm"
                loading={enabling}
                onClick={handleEnable}
              >
                Turn on
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
              >
                Not now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
