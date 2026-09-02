import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../lib/api';
import { clearSession, getAccessToken, getOrCreateDeviceUuid, saveTokens } from '../lib/secure';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string | null;
  designation?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  deviceUuid: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function registerPushToken(deviceUuid: string) {
  const payload = {
    device_uuid: deviceUuid,
    device_name: Device.modelName || Device.deviceName || 'Phone',
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reamarc_alerts_v2', {
        name: 'Reamarc Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#965cfd',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
    await Notifications.requestPermissionsAsync();
    let pushToken: string | undefined;
    if (Device.isDevice) {
      try {
        const projectId =
          process.env.EXPO_PUBLIC_PROJECT_ID ||
          Constants.expoConfig?.extra?.eas?.projectId ||
          (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId ||
          '88e7fa1c-536f-4324-8b86-ddfe10e8e5e6';
        try {
          const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
          pushToken = tokenResp?.data;
        } catch (e1) {
          console.warn('[push] Error with projectId, trying without:', e1);
          const tokenResp = await Notifications.getExpoPushTokenAsync();
          pushToken = tokenResp?.data;
        }
      } catch (err) {
        console.warn('[push] Expo remote token unavailable; using Alerts inbox.', err);
      }
    }
    await api('/mobile/register-device', {
      method: 'POST',
      body: JSON.stringify({ ...payload, push_token: pushToken }),
    });
  } catch {
    try {
      await api('/mobile/register-device', { method: 'POST', body: JSON.stringify(payload) });
    } catch {
      /* bind can retry on next launch */
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceUuid, setDeviceUuid] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    const me = await api<AuthUser>('/auth/me');
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const uuid = await getOrCreateDeviceUuid();
        setDeviceUuid(uuid);
        const token = await getAccessToken();
        if (token) {
          await refreshMe();
          await registerPushToken(uuid);
        }
      } catch {
        await clearSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMe]);

  const login = async (email: string, password: string) => {
    const uuid = deviceUuid || (await getOrCreateDeviceUuid());
    setDeviceUuid(uuid);
    const data = await api<{ access_token?: string; refresh_token?: string; user: AuthUser }>(
      '/auth/login',
      {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email, password, device_uuid: uuid }),
      },
    );
    if (!data?.access_token) {
      throw new Error('Authentication succeeded but no access token was returned.');
    }
    await saveTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    void registerPushToken(uuid);
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    await clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, deviceUuid, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
