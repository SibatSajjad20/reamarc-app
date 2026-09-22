/* Reamarc Web Push worker. System popups stay up when the tab is hidden or the browser is closed. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.path);
  event.waitUntil(openApp(path));
});

async function handlePush(event) {
  let payload = { title: 'Reamarc', body: '', path: '/', kind: 'custom' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') payload = { ...payload, ...parsed };
    }
  } catch {
    try {
      payload.body = event.data ? event.data.text() : '';
    } catch {
      payload.body = '';
    }
  }

  const title = String(payload.title || 'Reamarc').slice(0, 120);
  const body = String(payload.body || '').slice(0, 500);
  const path = safePath(payload.path);
  const tag = payload.kind === 'test' ? 'reamarc-web-push-test' : `reamarc-${Date.now()}`;

  let windows = [];
  try {
    windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch {
    windows = [];
  }
  const pageIsVisible = windows.some((client) => client.visibilityState === 'visible');

  // While this site is the focused tab, Chrome on Windows often swallows the
  // worker banner and the page only showed an in-app toast. The open page raises
  // the system popup itself in that case. Hidden, minimized, and closed windows
  // still get the worker notification.
  let displayed = false;
  if (!pageIsVisible) {
    try {
      await showDesktopNotification(title, body, path, tag);
      displayed = true;
    } catch (err) {
      console.warn('[Reamarc SW] Could not show system notification', err);
    }
  }

  for (const client of windows) {
    client.postMessage({
      type: 'reamarc-push-received',
      title,
      body,
      path,
      kind: payload.kind,
      tag,
      displayed,
    });
  }
}

async function showDesktopNotification(title, body, path, tag) {
  const options = {
    body,
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { path },
    icon: '/favicon.png',
  };
  try {
    await self.registration.showNotification(title, options);
  } catch (err) {
    console.warn('[Reamarc SW] Notification with icon failed, retrying', err);
    delete options.icon;
    await self.registration.showNotification(title, options);
  }
}

function safePath(path) {
  if (typeof path !== 'string') return '/';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || path.includes('\\')) {
    return '/';
  }
  return path.slice(0, 200);
}

async function openApp(path) {
  const target = new URL(path, self.location.origin);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try {
      if (new URL(client.url).origin !== self.location.origin) continue;
    } catch {
      continue;
    }
    client.postMessage({ type: 'reamarc-navigate', path });
    if ('focus' in client) return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow(target.href);
  return undefined;
}
