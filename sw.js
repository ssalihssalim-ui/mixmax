// ==================== SERVICE WORKER - MIXMAX MINIMARKET ====================
// Version avec gestion PWA, cache, et reconnaissance vocale

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
  console.log('📦 Mixmax - Service Worker Installation...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('📦 Mise en cache des fichiers statiques...');
      return cache.addAll(STATIC_FILES)
        .then(() => console.log('✅ Cache statique prêt'))
        .catch(err => console.error('❌ Erreur de mise en cache:', err));
    })
  );
  self.skipWaiting();
});

// ==================== ACTIVATION ====================
self.addEventListener('activate', event => {
  console.log('⚡ Mixmax - Service Worker Activation...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('🗑️ Suppression ancien cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('✅ Service Worker activé');
    })
  );
  self.clients.claim();
});

// ==================== INTERCEPTION DES REQUÊTES ====================
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;

  // ⚠️ NE PAS INTERCEPTER Firebase / Google (reconnaissance vocale)
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
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
          }
          return response;
        }).catch(() => {
          if (request.destination === 'image') {
            // Retourne une image vide transparente
            return new Response(
              'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
              { status: 200, headers: { 'Content-Type': 'image/gif' } }
            );
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

  // Autres requêtes : network-first avec fallback cache
  event.respondWith(
    fetch(request).then(response => {
      // Mettre en cache les réponses réussies
      if (response.status === 200) {
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, responseClone);
        });
      }
      return response;
    }).catch(() => caches.match(request).then(cached => {
      if (cached) return cached;
      
      // Si c'est une page HTML et qu'on est hors ligne
      const acceptHeader = request.headers.get('accept') || '';
      if (acceptHeader.includes('text/html')) {
        return caches.match('/offline.html').then(offlinePage => {
          if (offlinePage) return offlinePage;
          // Page hors ligne intégrée
          return new Response(
            `<!DOCTYPE html>
            <html lang="fr">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Hors ligne - Mixmax</title>
              <style>
                body {
                  font-family: 'Inter', -apple-system, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  background: #0A0D12;
                  color: #fff;
                  margin: 0;
                  text-align: center;
                  padding: 20px;
                }
                .offline-card {
                  max-width: 400px;
                  padding: 2rem;
                }
                .offline-card i {
                  font-size: 4rem;
                  color: #66BB6A;
                  margin-bottom: 1rem;
                  display: block;
                }
                .offline-card h1 {
                  font-size: 1.5rem;
                  margin-bottom: 0.5rem;
                }
                .offline-card p {
                  color: #94a3b8;
                  margin-bottom: 1.5rem;
                }
                .offline-card button {
                  background: #66BB6A;
                  border: none;
                  padding: 12px 32px;
                  border-radius: 10px;
                  color: white;
                  font-weight: 600;
                  font-size: 1rem;
                  cursor: pointer;
                  transition: all 0.3s;
                }
                .offline-card button:hover {
                  background: #4CAF50;
                  transform: translateY(-2px);
                }
              </style>
            </head>
            <body>
              <div class="offline-card">
                <i class="fas fa-wifi-slash"></i>
                <h1>📡 Hors ligne</h1>
                <p>Vous n'êtes pas connecté à internet.<br>Vérifiez votre connexion et réessayez.</p>
                <button onclick="location.reload()">🔄 Réessayer</button>
              </div>
            </body>
            </html>`,
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        });
      }
      
      return new Response('Hors ligne', { status: 503 });
    }))
  );
});

// ==================== GESTION DES MESSAGES ====================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('🛒 Mixmax Minimarket - Service Worker OK');
