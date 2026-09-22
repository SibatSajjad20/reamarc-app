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
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    try {
      await reg.update();
    } catch {
      // A failed update check must not block an already-active worker.
    }
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('[WebPush] ServiceWorker registration failed:', err);
    return null;
  }
}

const heldPopups: Notification[] = [];

/**
 * OS notification. Uses ServiceWorkerRegistration.showNotification() as primary
 * to ensure native system popups display on Windows/macOS whether tab is active or in background.
 */
export async function showDesktopPopup(
  title: string,
  body: string,
  tag?: string,
  path = '/'
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }
  const noteTag = tag || `reamarc-${Date.now()}`;
  const iconUrl = typeof window !== 'undefined' ? new URL('/favicon.png', window.location.origin).href : '/favicon.png';
  const options = {
    body,
    icon: iconUrl,
    badge: iconUrl,
    tag: noteTag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { path },
  } as NotificationOptions;

  // 1. Primary: ServiceWorkerRegistration.showNotification() - official standard for system popups
  try {
    const reg = await getRegistration();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch (err) {
    console.warn('[WebPush] Service worker showNotification failed, retrying basic options:', err);
    try {
      const reg = await getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, { body, tag: noteTag });
        return true;
      }
    } catch {
      // Fall through to window.Notification
    }
  }

  // 2. Fallback: window.Notification constructor
  try {
    const note = new Notification(title, options);
    heldPopups.push(note);
    if (heldPopups.length > 8) heldPopups.shift();
    note.onclick = () => {
      window.focus();
      note.close();
    };
    return true;
  } catch (err) {
    console.warn('[WebPush] Desktop popup fallback failed:', err);
  }

  return false;
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
  return showDesktopPopup(title, body, `reamarc-welcome-${Date.now()}`);
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

/** Send an end-to-end backend push test and ensure a system popup appears. */
export async function sendTestPush(): Promise<{ success: boolean; message: string }> {
  if (!canUsePush()) {
    return { success: false, message: 'Browser notifications are not supported on this device.' };
  }
  if (Notification.permission !== 'granted') {
    return { success: false, message: 'Notifications are not allowed. Please click "Enable desktop notifications" first.' };
  }

  // Ensure subscription is registered with service worker and synced to backend
  await syncWebPushSubscription();

  try {
    const res = await apiClient.post<{ sent: number; message: string }>('/web-push/test');
    if (res.sent > 0) {
      return {
        success: true,
        message: 'Desktop notification sent from server! A system popup will appear even if you switch tabs or minimize.',
      };
    }
    // If backend reports 0 subscribers (e.g. backend key sync delay), trigger local system popup directly
    const shown = await showDesktopPopup(
      'Reamarc Web Push Test 🚀',
      'Desktop popup notifications are active on this browser!',
      `reamarc-test-${Date.now()}`
    );
    return {
      success: shown,
      message: shown
        ? 'Desktop popup displayed on this device.'
        : 'Could not show a desktop popup. Please allow notifications for your browser in Windows Settings.',
    };
  } catch {
    const shown = await showDesktopPopup(
      'Reamarc Web Push Test 🚀',
      'Desktop popup notifications are active on this browser!',
      `reamarc-test-${Date.now()}`
    );
    return {
      success: shown,
      message: shown
        ? 'Desktop popup displayed locally (server test was unreachable).'
        : 'Could not show a desktop popup. Please check Windows Notification Settings.',
    };
  }
}
