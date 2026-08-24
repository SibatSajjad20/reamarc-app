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

export async function saveTokens(access: string, refresh?: string | null) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

const NOTIF_CLEARED_KEY = 'reamarc_notif_cleared_cutoff';

export async function getClearedNotificationsCutoff(): Promise<string | null> {
  return SecureStore.getItemAsync(NOTIF_CLEARED_KEY);
}

export async function setClearedNotificationsCutoff(isoString: string): Promise<void> {
  await SecureStore.setItemAsync(NOTIF_CLEARED_KEY, isoString);
}
