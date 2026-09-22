/* Reamarc Web Push worker. Shows only title, body, and a same-origin path. */
self.addEventListener('push', (event) => {
  let payload = { title: 'Reamarc', body: '', path: '/' };
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
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { path },
    })
  );
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
