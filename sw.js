// ==================== SERVICE WORKER - MIXMAX MINIMARKET ====================
const CACHE_NAME = 'mixmax-minimarket-v2';
const STATIC_CACHE = 'mixmax-minimarket-static-v2';
const DYNAMIC_CACHE = 'mixmax-minimarket-dynamic-v2';

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

// ==================== INSTALLATION ====================
self.addEventListener('install', event => {
  console.log('📦 Service Worker - Installation en cours...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('📦 Mise en cache des fichiers statiques...');
      return cache.addAll(STATIC_FILES).catch(err => {
        console.error('❌ Erreur de mise en cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ==================== ACTIVATION ====================
self.addEventListener('activate', event => {
  console.log('⚡ Service Worker - Activation...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('🗑️ Suppression de l\'ancien cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// ==================== INTERCEPTION DES REQUÊTES ====================
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;

  // ⚠️ NE PAS INTERCEPTER les requêtes Firebase / Google
  if (url.includes('firestore.googleapis.com') || 
      url.includes('googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('speech.googleapis.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // Images et polices : cache-first
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
          return response;
        }).catch(() => {
          // Fallback image si hors ligne
          if (request.destination === 'image') {
            return new Response('', { status: 200, headers: { 'Content-Type': 'image/png' } });
          }
          return new Response('Hors ligne', { status: 503 });
        });
      })
    );
    return;
  }

  // Fichiers statiques : stale-while-revalidate
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
            console.warn('⚠️ Erreur réseau, utilisation du cache', err);
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Autres requêtes (API, etc.) : network-first
  event.respondWith(
    fetch(request).then(response => {
      const responseClone = response.clone();
      caches.open(DYNAMIC_CACHE).then(cache => {
        if (response.status === 200) {
          cache.put(request, responseClone);
        }
      });
      return response;
    }).catch(() => caches.match(request).then(cached => {
      if (cached) return cached;
      // Si c'est une page HTML et qu'on est hors ligne
      if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
        return caches.match('/offline.html').then(offlinePage => {
          if (offlinePage) return offlinePage;
          return new Response(
            '<!DOCTYPE html><html><head><title>Hors ligne</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#0A0D12;color:#fff;text-align:center;}</style></head><body><div><h1>📡 Hors ligne</h1><p>Vérifiez votre connexion internet.</p><button onclick="location.reload()">🔄 Réessayer</button></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        });
      }
      return new Response('Hors ligne', { status: 503 });
    }))
  );
});

console.log('🛒 Mixmax Minimarket - Service Worker OK');
