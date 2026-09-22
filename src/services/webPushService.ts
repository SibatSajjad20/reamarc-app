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
 * OS notification. `new Notification` still banners while this tab is focused.
 * The service worker notification remains after the tab is hidden or the browser closes.
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
  const options = {
    body,
    icon: '/favicon.png',
    tag: noteTag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { path },
  } as NotificationOptions;

  const reveal = (popup: Notification) => {
    heldPopups.push(popup);
    if (heldPopups.length > 8) heldPopups.shift();
    popup.onclick = () => {
      window.focus();
      popup.close();
    };
  };

  try {
    reveal(new Notification(title, options));
    return true;
  } catch (err) {
    console.warn('[WebPush] Desktop popup failed, retrying with basic options:', err);
  }

  try {
    reveal(new Notification(title, { body, icon: '/favicon.png', tag: noteTag }));
    return true;
  } catch (err) {
    console.warn('[WebPush] Basic desktop popup failed:', err);
  }

  try {
    const reg = await getRegistration();
    if (!reg) return false;
    await reg.showNotification(title, {
      body,
      tag: noteTag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      data: { path },
    } as NotificationOptions);
    return true;
  } catch (err) {
    console.warn('[WebPush] Service worker notification failed:', err);
    return false;
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

const TEST_POPUP_TAG = 'reamarc-web-push-test';
const TEST_POPUP_TITLE = 'Reamarc Web Push Test';
const TEST_POPUP_BODY = 'Desktop notifications are working on this browser. This popup stays until you dismiss it.';

/** Send an end-to-end backend push test and show a system popup immediately. */
export async function sendTestPush(): Promise<{ success: boolean; message: string }> {
  if (!canUsePush()) {
    return { success: false, message: 'Browser notifications are not supported.' };
  }
  if (Notification.permission !== 'granted') {
    return { success: false, message: 'Notifications are not allowed. Please click "Enable notifications" first.' };
  }
  const shown = await showDesktopPopup(TEST_POPUP_TITLE, TEST_POPUP_BODY, TEST_POPUP_TAG);
  try {
    await syncWebPushSubscription();
    const res = await apiClient.post<{ sent: number; message: string }>('/web-push/test');
    if (shown && res.sent > 0) {
      return {
        success: true,
        message: 'Desktop popup sent. It still appears if you switch tabs, minimize, or close the browser.',
      };
    }
    if (shown) {
      return {
        success: true,
        message: 'Desktop popup shown on this device. Enable notifications again if it should also arrive after the browser is closed.',
      };
    }
    if (res.sent > 0) {
      return {
        success: false,
        message: 'The server sent the test, but this browser did not open a system popup. Allow notifications for the browser in Windows Settings, then try again.',
      };
    }
    return { success: false, message: res.message || 'Could not show a desktop popup.' };
  } catch {
    return {
      success: shown,
      message: shown
        ? 'Desktop popup shown on this device. The server test could not be reached.'
        : 'Could not show a desktop popup.',
    };
  }
}
