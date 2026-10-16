// Service worker de Skid: guarda el juego para poder jugar sin conexión, recibe
// las notificaciones (aunque el juego esté cerrado) y, al tocarlas, abre el
// juego donde toca (la sala del duelo, la portada…). El contenido de las
// notificaciones llega cifrado desde el servidor (backend/src/push.ts) y el
// navegador lo descifra antes de dárnoslo.

// Al compilar (vite.config.ts) se cambian estas dos líneas por la versión y la
// lista de archivos del juego: así cada despliegue es un service worker nuevo,
// que guarda los archivos nuevos y borra los de la versión anterior.
const BUILD = 'dev';
const PRECACHE = [];

const CACHE = `skid-${BUILD}`;
/** En desarrollo no se guarda nada (Vite sirve los archivos sobre la marcha). */
const OFFLINE = BUILD !== 'dev';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // La portada (./) y todo lo que necesita el juego para arrancar y jugar sin red.
      if (OFFLINE) await (await caches.open(CACHE)).addAll(['./', ...PRECACHE]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Lo guardado por versiones anteriores ya no hace falta.
      const old = (await caches.keys()).filter((key) => key.startsWith('skid-') && key !== CACHE);
      await Promise.all(old.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (!OFFLINE) return;
  const request = event.request;
  const url = new URL(request.url);
  // Solo lo de este dominio y para leer. La API y version.json (que avisa de
  // versiones nuevas) siempre van a la red.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/version.json' || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    // Páginas: primero la red (con conexión, siempre lo último); sin ella, lo guardado.
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
            await (await caches.open(CACHE)).put('./', response.clone());
          }
          return response;
        } catch {
          return (await caches.match(request, { ignoreSearch: true })) ?? (await caches.match('./'));
        }
      })(),
    );
    return;
  }

  // Archivos del juego: su nombre cambia con cada versión, así que lo guardado vale siempre.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })(),
  );
});

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
