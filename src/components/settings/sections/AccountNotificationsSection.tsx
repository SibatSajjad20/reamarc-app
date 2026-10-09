import React, { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import {
  enableWebPush,
  disableWebPush,
  canUsePush,
  notificationPermission,
} from '@/services/webPushService';
import { Switch } from '@/components/ui/switch';
import { SettingsCard } from '../SettingsCard';

export const AccountNotificationsSection: React.FC = () => {
  const { addToast } = useToast();

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return canUsePush() && notificationPermission() === 'granted';
  });
  const [isToggling, setIsToggling] = useState(false);

  const isPushSupported = canUsePush();

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    try {
      if (checked) {
        const perm = await enableWebPush();
        if (perm === 'granted') {
          setNotificationsEnabled(true);
          addToast('Notifications enabled', 'Desktop notifications are now active.', 'success');
        } else if (perm === 'denied') {
          setNotificationsEnabled(false);
          addToast(
            'Notifications blocked',
            'Notifications are blocked in your browser settings.',
            'warning'
          );
        } else {
          setNotificationsEnabled(false);
        }
      } else {
        await disableWebPush();
        setNotificationsEnabled(false);
        addToast('Notifications disabled', 'Desktop notifications turned off.', 'info');
      }
    } catch (err: any) {
      addToast('Notification error', err?.message || 'Could not update notification settings', 'error');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Desktop notifications"
        description="Receive instant alerts for lead assignments, approval requests, and check-in reminders."
      >
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-subtle/40">
          <div>
            <span className="block text-xs font-semibold text-fg">
              Browser push notifications
            </span>
            <span className="block text-caption text-fg-muted mt-0.5">
              {isPushSupported
                ? notificationsEnabled
                  ? 'Active · Alerts will appear on your desktop even when minimized.'
                  : 'Inactive · Turn on to receive critical activity updates.'
                : 'Not supported in this browser environment.'}
            </span>
          </div>

          <Switch
            checked={notificationsEnabled}
            onCheckedChange={handleToggle}
            disabled={!isPushSupported || isToggling}
          />
        </div>
      </SettingsCard>
    </div>
  );
};
