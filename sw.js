const CACHE_NAME = 'drmusic-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/storage.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.png',
  'https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js',
  'https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js'
];

// Instalar el Service Worker y almacenar archivos en caché
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando App Shell');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activar y limpiar cachés antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia: Cache First con Network Fallback para assets locales
self.addEventListener('fetch', (e) => {
  // Ignorar peticiones de la API de YouTube y el iframe API para que no fallen por CORS
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('youtube.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Guardar en caché dinámicamente si es un recurso de nuestro origen o CDN de Ionicons
        if (
          networkResponse.status === 200 &&
          (e.request.url.startsWith(self.location.origin) || e.request.url.includes('unpkg.com'))
        ) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Si falla todo (offline) y es navegación HTML, retornar index.html
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
