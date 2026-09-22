import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  chunkUtf8,
  joinChunks,
  parseCachedUser,
  type CachedAuthUser,
} from './sessionCodec';

const DEVICE_KEY = 'reamarc_device_uuid';
const ACCESS_KEY = 'reamarc_access_token';
const REFRESH_KEY = 'reamarc_refresh_token';
const ACCESS_KEY_V2 = 'reamarc_access_token_v2';
const REFRESH_KEY_V2 = 'reamarc_refresh_token_v2';
const USER_KEY_V2 = 'reamarc_auth_user_v2';
const NOTIF_CLEARED_KEY = 'reamarc_notif_cleared_cutoff';

/**
 * WHEN_UNLOCKED (the SecureStore default) can throw on iOS during a cold start,
 * before the keychain is readable. AFTER_FIRST_UNLOCK stays available once the
 * phone has been unlocked, which is what a saved login needs.
 */
const secureOptions: SecureStore.SecureStoreOptions =
  Platform.OS === 'ios'
    ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    : {};

type MemorySession = {
  loaded: boolean;
  access: string | null;
  refresh: string | null;
  user: CachedAuthUser | null;
};

let memory: MemorySession = { loaded: false, access: null, refresh: null, user: null };
const sessionClearedListeners = new Set<() => void>();

export function onSessionCleared(listener: () => void): () => void {
  sessionClearedListeners.add(listener);
  return () => sessionClearedListeners.delete(listener);
}

function notifySessionCleared() {
  sessionClearedListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* UI listener must not break storage */
    }
  });
}

function isTransientSecureError(err: unknown): boolean {
  const message = String((err as { message?: string })?.message || err || '').toLowerCase();
  return (
    message.includes('interaction is not allowed') ||
    message.includes('errsecinteractionnotallowed') ||
    message.includes('user interaction is not allowed') ||
    message.includes('react context') ||
    message.includes('e_securestore_read') ||
    message.includes('could not encrypt')
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSecureRetry<T>(op: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      last = err;
      if (!isTransientSecureError(err) || attempt === 3) throw err;
      await delay(200 * (attempt + 1));
    }
  }
  throw last;
}

async function readKey(key: string): Promise<string | null> {
  return withSecureRetry(() => SecureStore.getItemAsync(key, secureOptions));
}

async function writeKey(key: string, value: string): Promise<void> {
  await withSecureRetry(() => SecureStore.setItemAsync(key, value, secureOptions));
}

async function deleteKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, secureOptions);
  } catch {
    /* already gone */
  }
}

async function readSecret(baseKey: string): Promise<string | null> {
  const countRaw = await readKey(`${baseKey}_n`);
  const count = Number(countRaw);
  if (countRaw && Number.isInteger(count) && count > 1 && count <= 16) {
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await readKey(`${baseKey}_${i}`);
      if (!part) return readKey(baseKey);
      parts.push(part);
    }
    return joinChunks(parts);
  }
  return readKey(baseKey);
}

async function writeSecret(baseKey: string, value: string): Promise<void> {
  const parts = chunkUtf8(value);
  if (parts.length <= 1) {
    await writeKey(baseKey, value);
    await deleteKey(`${baseKey}_n`);
    for (let i = 0; i < 16; i += 1) await deleteKey(`${baseKey}_${i}`);
    return;
  }
  await writeKey(`${baseKey}_n`, String(parts.length));
  for (let i = 0; i < parts.length; i += 1) {
    await writeKey(`${baseKey}_${i}`, parts[i]);
  }
  for (let i = parts.length; i < 16; i += 1) await deleteKey(`${baseKey}_${i}`);
  await deleteKey(baseKey);
}

async function deleteSecret(baseKey: string): Promise<void> {
  await deleteKey(baseKey);
  await deleteKey(`${baseKey}_n`);
  for (let i = 0; i < 16; i += 1) await deleteKey(`${baseKey}_${i}`);
}

async function readAccessToken(): Promise<string | null> {
  return (await readSecret(ACCESS_KEY_V2)) || (await readSecret(ACCESS_KEY));
}

async function readRefreshToken(): Promise<string | null> {
  return (await readSecret(REFRESH_KEY_V2)) || (await readSecret(REFRESH_KEY));
}

export async function getOrCreateDeviceUuid(): Promise<string> {
  const existing = await readKey(DEVICE_KEY);
  if (existing && typeof existing === 'string') return existing;
  let generated = '';
  if (typeof Crypto.randomUUID === 'function') {
    generated = Crypto.randomUUID();
  } else {
    const bytes = await Crypto.getRandomBytesAsync(16);
    generated = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const uuid = String(generated || '').trim();
  if (!uuid) {
    throw new Error('Could not create a device id for secure storage.');
  }
  await writeKey(DEVICE_KEY, uuid);
  return uuid;
}

export async function saveCachedUser(user: CachedAuthUser): Promise<void> {
  const payload = JSON.stringify(user);
  await writeSecret(USER_KEY_V2, payload);
  memory = { ...memory, loaded: true, user };
}

export async function saveTokens(access?: unknown, refresh?: unknown) {
  const accessToken = typeof access === 'string' ? access.trim() : '';
  const refreshToken = typeof refresh === 'string' ? refresh.trim() : '';
  if (!accessToken) {
    throw new Error('Authentication succeeded but no access token was returned.');
  }
  try {
    await writeSecret(ACCESS_KEY_V2, accessToken);
    if (refreshToken) await writeSecret(REFRESH_KEY_V2, refreshToken);
    else await deleteSecret(REFRESH_KEY_V2);

    const storedAccess = await readSecret(ACCESS_KEY_V2);
    const storedRefresh = refreshToken ? await readSecret(REFRESH_KEY_V2) : null;
    if (storedAccess !== accessToken || (refreshToken && storedRefresh !== refreshToken)) {
      throw new Error('Could not save your sign-in on this phone. Please try again.');
    }
    memory = {
      loaded: true,
      access: accessToken,
      refresh: refreshToken || null,
      user: memory.user,
    };
  } catch (err) {
    memory = { ...memory, loaded: false };
    throw err;
  }
  await deleteSecret(ACCESS_KEY);
  await deleteSecret(REFRESH_KEY);
}

export async function loadPersistedSession(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  user: CachedAuthUser | null;
}> {
  if (memory.loaded) {
    return { accessToken: memory.access, refreshToken: memory.refresh, user: memory.user };
  }
  const access = await readAccessToken();
  const refresh = await readRefreshToken();
  const user = parseCachedUser(await readSecret(USER_KEY_V2));
  memory = { loaded: true, access, refresh, user };
  if (access && !(await readSecret(ACCESS_KEY_V2))) {
    try {
      await saveTokens(access, refresh);
      if (user) await saveCachedUser(user);
    } catch {
      /* legacy copy can be migrated on the next successful login */
    }
  }
  return { accessToken: memory.access, refreshToken: memory.refresh, user: memory.user };
}

export async function getAccessToken() {
  if (!memory.loaded) await loadPersistedSession();
  return memory.access;
}

export async function getRefreshToken() {
  if (!memory.loaded) await loadPersistedSession();
  return memory.refresh;
}

export async function clearSession() {
  memory = { loaded: true, access: null, refresh: null, user: null };
  await deleteSecret(ACCESS_KEY_V2);
  await deleteSecret(REFRESH_KEY_V2);
  await deleteSecret(USER_KEY_V2);
  await deleteSecret(ACCESS_KEY);
  await deleteSecret(REFRESH_KEY);
  notifySessionCleared();
}

export async function getClearedNotificationsCutoff(): Promise<string | null> {
  return readKey(NOTIF_CLEARED_KEY);
}

export async function setClearedNotificationsCutoff(isoString?: string | null): Promise<void> {
  if (isoString && typeof isoString === 'string') {
    await writeKey(NOTIF_CLEARED_KEY, isoString);
  }
}
