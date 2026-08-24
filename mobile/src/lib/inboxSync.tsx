import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { useAuth } from '../context/AuthContext';

type Item = { id: string; title: string; body: string };

/**
 * Expo Go cannot receive remote lock-screen pushes (SDK 53+).
 * Poll the in-app inbox and show a local banner, which Expo Go does support.
 */
export function InboxSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const seen = new Set<string>();
    let primed = false;

    const tick = async () => {
      try {
        const items = await api<Item[]>('/mobile/notifications');
        if (cancelled) return;
        for (const item of items || []) {
          if (!item?.id) continue;
          if (!primed) {
            seen.add(item.id);
            continue;
          }
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          await Notifications.scheduleNotificationAsync({
            content: { title: item.title, body: item.body, sound: true },
            trigger: null,
          });
        }
        primed = true;
      } catch {
        /* keep polling */
      }
    };

    void Notifications.requestPermissionsAsync();
    void tick();
    const interval = setInterval(() => void tick(), 8000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [user?.id]);

  return null;
}
