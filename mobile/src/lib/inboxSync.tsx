import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useInbox } from '../context/InboxContext';

/**
 * Expo Go cannot receive remote lock-screen pushes (SDK 53+).
 * Show a local banner for new inbox rows, which Expo Go does support.
 * Rows come from the shared inbox poll (InboxProvider), so this adds no request of its own.
 */
export function InboxSync() {
  const { user } = useAuth();
  const { rows, rowsKey } = useInbox();
  const seenRef = useRef<Set<string>>(new Set());
  const primedKeyRef = useRef<string | null>(null);
  const userKey = user ? `${user.id}:${user.company_id || ''}` : null;

  useEffect(() => {
    if (!user) return;
    void Notifications.requestPermissionsAsync();
  }, [user?.id, user?.company_id]);

  useEffect(() => {
    if (!userKey || rowsKey !== userKey) return;
    const primed = primedKeyRef.current === userKey;
    if (!primed) seenRef.current = new Set();
    void (async () => {
      for (const item of rows || []) {
        if (!item?.id) continue;
        if (!primed) {
          seenRef.current.add(item.id);
          continue;
        }
        if (seenRef.current.has(item.id)) continue;
        seenRef.current.add(item.id);
        try {
          await Notifications.scheduleNotificationAsync({
            content: { title: item.title || '', body: item.body || '', sound: true },
            trigger: null,
          });
        } catch {
          /* keep going */
        }
      }
    })();
    primedKeyRef.current = userKey;
  }, [rows, rowsKey, userKey]);

  return null;
}
