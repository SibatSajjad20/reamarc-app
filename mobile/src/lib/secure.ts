import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_KEY = 'reamarc_device_uuid';
const ACCESS_KEY = 'reamarc_access_token';
const REFRESH_KEY = 'reamarc_refresh_token';

export async function getOrCreateDeviceUuid(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY);
  if (existing) return existing;
  const uuid = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_KEY, uuid);
  return uuid;
}

export async function saveTokens(access?: string | null, refresh?: string | null) {
  if (access && typeof access === 'string') {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
  }
  if (refresh && typeof refresh === 'string') {
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  }
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearSession() {
  try {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {}
}

const NOTIF_CLEARED_KEY = 'reamarc_notif_cleared_cutoff';

export async function getClearedNotificationsCutoff(): Promise<string | null> {
  return SecureStore.getItemAsync(NOTIF_CLEARED_KEY);
}

export async function setClearedNotificationsCutoff(isoString?: string | null): Promise<void> {
  if (isoString && typeof isoString === 'string') {
    await SecureStore.setItemAsync(NOTIF_CLEARED_KEY, isoString);
  }
}
