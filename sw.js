// ==================== SERVICE WORKER - MIXMAX MINIMARKET ====================
const CACHE_NAME = 'mixmax-minimarket-v1';
const STATIC_CACHE = 'mixmax-minimarket-static-v1';
const DYNAMIC_CACHE = 'mixmax-minimarket-dynamic-v1';

const STATIC_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/auth.js',
  '/admin.js',
  '/pos.js',
  '/client.js',
  '/menutactile.js',
  '/db-cache.js',
  '/firebase-config.js',
  '/caissier.js',
  '/depenses.js',
  '/statistics.js',
  '/manifest.json',
  '/logo.png',
  '/background.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;

  if (url.includes('firestore.googleapis.com') || url.includes('googleapis.com')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  if (STATIC_FILES.some(file => request.url.endsWith(file) || request.url.includes(file))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache => {
        return cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(err => {
            console.warn('Erreur réseau, utilisation du cache', err);
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      const responseClone = response.clone();
      caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
      return response;
    }).catch(() => caches.match(request).then(cached => {
      if (cached) return cached;
      if (request.headers.get('accept').includes('text/html')) {
        return caches.match('/offline.html');
      }
      return new Response('Hors ligne', { status: 503 });
    }))
  );
});

console.log('🛒 Mixmax Minimarket - Service Worker OK');
