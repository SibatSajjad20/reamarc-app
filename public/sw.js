/* Reamarc Web Push worker. Shows only title, body, and a same-origin path. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Reamarc', body: '', path: '/', kind: 'custom' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...parsed };
      }
    }
  } catch {
    payload.body = '';
  }
  const title = String(payload.title || 'Reamarc').slice(0, 120);
  const body = String(payload.body || '').slice(0, 500);
  const path = safePath(payload.path);

  // 1. Show OS-level notification popup (using raster PNG icon for Windows/Chrome compatibility)
  const notificationPromise = self.registration.showNotification(title, {
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: `reamarc-${Date.now()}`,
    data: { path },
  });

  // 2. Also broadcast to all active window clients for immediate on-screen in-app toast
  const broadcastPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({
        type: 'reamarc-push-received',
        title,
        body,
        path,
        kind: payload.kind,
      });
    }
  });

  event.waitUntil(Promise.all([notificationPromise, broadcastPromise]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.path);
  event.waitUntil(openApp(path));
});

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
