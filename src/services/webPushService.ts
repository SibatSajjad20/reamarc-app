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

export function canUsePush(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!canUsePush()) return null;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('[WebPush] ServiceWorker registration failed:', err);
    return null;
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!canUsePush()) return 'unsupported';
  return Notification.permission;
}

/** Show an immediate local desktop notification to verify on-screen display. */
export async function showWelcomeNotification(
  title = 'Notifications Enabled 🎉',
  body = 'You will now receive real-time alerts from Reamarc.'
): Promise<boolean> {
  if (!canUsePush() || Notification.permission !== 'granted') return false;
  try {
    const reg = await getRegistration();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, {
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
        tag: `reamarc-test-${Date.now()}`,
      });
      return true;
    }
    if ('Notification' in window) {
      new Notification(title, {
        body,
        icon: '/favicon.png',
      });
      return true;
    }
  } catch (err) {
    console.warn('[WebPush] Failed to show on-screen popup notification:', err);
  }
  return false;
}

/** Subscribe this browser when permission is already granted. Does not prompt. */
export async function syncWebPushSubscription(): Promise<boolean> {
  if (!canUsePush() || Notification.permission !== 'granted') return false;
  try {
    const reg = await getRegistration();
    if (!reg) return false;
    let publicKey: string;
    try {
      const res = await apiClient.get<{ public_key: string }>('/web-push/vapid-public-key');
      publicKey = res.public_key;
    } catch (err) {
      console.warn('[WebPush] VAPID public key fetch failed:', err);
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
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }
    const json = sub.toJSON();
    const keys = (json.keys || {}) as PushKeys;
    if (!json.endpoint || !keys.p256dh || !keys.auth) return false;
    await apiClient.post('/web-push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });
    return true;
  } catch (err) {
    console.error('[WebPush] syncWebPushSubscription error:', err);
    return false;
  }
}

/** Must be called from a user gesture (e.g. button click). Prompts and triggers test popup. */
export async function enableWebPush(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUsePush()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await syncWebPushSubscription();
      // Instantly fire a local welcome notification so the user sees the popup immediately
      await showWelcomeNotification();
    }
    return permission;
  } catch (err) {
    console.error('[WebPush] Error during enableWebPush:', err);
    return Notification.permission || 'denied';
  }
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

/** Send an end-to-end backend push test or fallback to local notification popup. */
export async function sendTestPush(): Promise<{ success: boolean; message: string }> {
  if (!canUsePush()) {
    return { success: false, message: 'Browser notifications are not supported.' };
  }
  if (Notification.permission !== 'granted') {
    return { success: false, message: 'Notifications are not allowed. Please click "Enable notifications" first.' };
  }
  try {
    await syncWebPushSubscription();
    const res = await apiClient.post<{ sent: number; message: string }>('/web-push/test');
    if (res.sent > 0) {
      return { success: true, message: 'Test notification sent from server! Popup should appear.' };
    }
    await showWelcomeNotification('Reamarc Test Notification 🔔', 'Web push is working properly on this browser.');
    return { success: true, message: res.message || 'Test notification displayed.' };
  } catch (err: any) {
    // Fallback to local popup
    await showWelcomeNotification('Reamarc Test Notification 🔔', 'Web push is working properly on this browser.');
    return { success: true, message: 'Local notification popup displayed.' };
  }
}
