// Service worker de Skid: recibe las notificaciones (aunque el juego esté cerrado)
// y, al tocarlas, abre el juego donde toca (la sala del duelo, la portada…).
// El contenido llega cifrado desde el servidor (backend/src/push.ts) y el
// navegador lo descifra antes de dárnoslo.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Skid', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // La misma etiqueta sustituye a la anterior (p. ej. dos avisos del mismo duelo).
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      // Si el juego ya está abierto, se usa esa pestaña; si no, se abre.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })(),
  );
});
