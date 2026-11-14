import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api, isAuthRejection } from '../lib/api';
import { clearDailyLogCaches } from '../lib/dailyLogCache';
import { clearAttendanceCaches } from '../lib/attendanceCache';
import { clearCrmCaches } from '../lib/crmCache';
import { invalidateModuleCache } from '../lib/moduleCache';
import {
  clearSession,
  getOrCreateDeviceUuid,
  resetDeviceUuid,
  loadPersistedSession,
  onSessionCleared,
  saveCachedUser,
  saveTokens,
} from '../lib/secure';
import { decideStartupSession, userFromAccessToken, type RevalidateError } from '../lib/sessionCodec';

function waitUntilActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      sub.remove();
      resolve();
    }, 2000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(timeout);
        sub.remove();
        resolve();
      }
    });
  });
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  department?: string | null;
  primary_department?: string | null;
  designation?: string | null;
  crm_enabled?: boolean | null;
  company_id?: string | null;
  company?: {
    id?: string;
    name?: string;
    slug?: string;
    logo_url?: string | null;
    accent_color?: string;
  } | null;
  companies?: Array<{
    id: string;
    name: string;
    slug?: string;
    logo_url?: string | null;
    role?: string;
    accent_color?: string;
  }>;
  permissions?: {
    summary?: { sales?: string; finance?: string; [key: string]: string | undefined };
    levels?: { [key: string]: string | undefined };
    modules?: { [key: string]: boolean | undefined };
    capabilities?: { approve_won_deal?: boolean; approve_requests?: boolean };
    tracked?: { attendance?: boolean; daily_log?: boolean };
    access_version?: number;
    primary_department?: string;
    view_only?: boolean;
    [key: string]: any;
  } | null;
  tracked?: { attendance?: boolean; daily_log?: boolean };
  effective_access?: { [key: string]: boolean | undefined };
  company_modules?: string[] | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  deviceUuid: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<AuthUser>;
  switchCompany: (companyId: string) => Promise<void>;
  resetDevice: () => Promise<string>;
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
      const channelOpts = {
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
      };
      await Notifications.setNotificationChannelAsync('oneworklane_alerts_v1', {
        name: 'OneWorkLane Alerts',
        ...channelOpts,
      });
      await Notifications.setNotificationChannelAsync('reamarc_alerts_v2', {
        name: 'OneWorkLane Alerts',
        ...channelOpts,
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
    try {
      await saveCachedUser(me);
    } catch {
      /* the access token still restores this profile on the next launch */
    }
    return me;
  }, []);

  const sessionVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onSessionCleared(() => {
      sessionVersion.current += 1;
      if (!cancelled) setUser(null);
    });

    (async () => {
      let uuid: string | null = null;
      try {
        await waitUntilActive();
        if (cancelled) return;
        try {
          uuid = await getOrCreateDeviceUuid();
          if (!cancelled) setDeviceUuid(uuid);
        } catch {
          uuid = null;
        }

        const session = await loadPersistedSession();
        if (cancelled) return;
        const optimistic = session.accessToken
          ? session.user ?? userFromAccessToken(session.accessToken)
          : null;
        if (optimistic) {
          setUser(optimistic);
          setLoading(false);
        }
        if (!session.accessToken) {
          setUser(null);
          return;
        }

        let serverUser: AuthUser | null = null;
        let revalidateError: RevalidateError = 'none';
        const seenVersion = sessionVersion.current;
        try {
          serverUser = await refreshMe();
        } catch (err) {
          revalidateError = isAuthRejection(err) ? 'auth' : 'transient';
        }
        if (cancelled || sessionVersion.current !== seenVersion) return;

        const decision = decideStartupSession({
          accessToken: session.accessToken,
          cachedUser: session.user ?? optimistic,
          revalidateError,
          serverUser,
        });
        if (!decision.keepTokens) {
          clearDailyLogCaches();
          clearAttendanceCaches();
          clearCrmCaches();
          invalidateModuleCache();
          await clearSession();
        }
        if (!cancelled) setUser(decision.user);
        if (decision.user && revalidateError === 'none' && uuid) {
          void registerPushToken(uuid);
        }
      } catch {
        /* keychain was not readable; leave any saved tokens in place */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshMe]);

  const login = async (email: string, password: string) => {
    clearDailyLogCaches();
    clearAttendanceCaches();
    const uuid = deviceUuid || (await getOrCreateDeviceUuid());
    setDeviceUuid(uuid);
    const data = await api<{ access_token?: string | null; refresh_token?: string | null; user: AuthUser }>(
      '/auth/login',
      {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email, password, device_uuid: uuid }),
      },
    );
    const accessToken = typeof data?.access_token === 'string' ? data.access_token.trim() : '';
    const refreshToken = typeof data?.refresh_token === 'string' ? data.refresh_token.trim() : '';
    if (!accessToken) {
      throw new Error('Authentication succeeded but no access token was returned.');
    }
    await saveTokens(accessToken, refreshToken || null);
    try {
      await saveCachedUser(data.user);
    } catch {
      /* token read-back already succeeded */
    }
    setUser(data.user);
    try {
      await refreshMe();
    } catch {
      /* login payload already applied */
    }
    void registerPushToken(uuid);
  };

  const switchCompany = async (companyId: string) => {
    clearDailyLogCaches();
    clearAttendanceCaches();
    clearCrmCaches();
    invalidateModuleCache();
    const data = await api<{ access_token?: string | null; refresh_token?: string | null; user: AuthUser }>(
      '/auth/switch-company',
      {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId }),
      },
    );
    const accessToken = typeof data?.access_token === 'string' ? data.access_token.trim() : '';
    const refreshToken = typeof data?.refresh_token === 'string' ? data.refresh_token.trim() : '';
    if (!accessToken) {
      throw new Error('Switching company succeeded but no access token was returned.');
    }
    await saveTokens(accessToken, refreshToken || null);
    try {
      await saveCachedUser(data.user);
    } catch {
      /* ignore */
    }
    setUser(data.user);
    try {
      await refreshMe();
    } catch {
      /* switch payload already applied; tabs still follow the new company user */
    }
    const uuid = deviceUuid || (await getOrCreateDeviceUuid());
    if (uuid) {
      void registerPushToken(uuid);
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ device_uuid: deviceUuid }),
      });
    } catch {
      /* ignore */
    }
    clearDailyLogCaches();
    clearAttendanceCaches();
    clearCrmCaches();
    invalidateModuleCache();
    await clearSession();
    setUser(null);
  };

  const resetDevice = useCallback(async () => {
    const next = await resetDeviceUuid();
    setDeviceUuid(next);
    return next;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, deviceUuid, login, logout, refreshMe, switchCompany, resetDevice }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
