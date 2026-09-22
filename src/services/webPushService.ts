import { apiClient } from './apiClient';

type PushKeys = { p256dh?: string; auth?: string };

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function canUsePush(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!canUsePush()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  } catch {
    return null;
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!canUsePush()) return 'unsupported';
  return Notification.permission;
}

/** Subscribe this browser when permission is already granted. Does not prompt. */
export async function syncWebPushSubscription(): Promise<boolean> {
  if (!canUsePush() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  let publicKey: string;
  try {
    const res = await apiClient.get<{ public_key: string }>('/web-push/vapid-public-key');
    publicKey = res.public_key;
  } catch {
    return false;
  }
  if (!publicKey) return false;
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  const currentKey = sub?.options?.applicationServerKey;
  const sameKey =
    currentKey &&
    applicationServerKey.length === currentKey.byteLength &&
    applicationServerKey.every((byte, index) => byte === new Uint8Array(currentKey)[index]);
  if (sub && !sameKey) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as unknown as BufferSource });
  }
  const json = sub.toJSON();
  const keys = (json.keys || {}) as PushKeys;
  if (!json.endpoint || !keys.p256dh || !keys.auth) return false;
  await apiClient.post('/web-push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  });
  return true;
}

/** Must be called from a click. Prompts, then stores the subscription. */
export async function enableWebPush(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUsePush()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await syncWebPushSubscription();
  }
  return permission;
}

/** Drop this browser's subscription before the session cookie is cleared. */
export async function disableWebPush(): Promise<void> {
  if (!canUsePush()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint;
    if (endpoint) {
      try {
        await apiClient.post('/web-push/unsubscribe', { endpoint });
      } catch {
        // Session may already be gone; still drop the browser subscription.
      }
      await sub.unsubscribe();
    }
  } catch {
    // Leaving the subscription in place is worse, but a failed logout must still finish.
  }
}
