const CACHE_NAME = 'invit-mar-v105';
const ASSETS_TO_CACHE = [
  './index.html?v=105',
  './app.js?v=105',
  './manifest.json',
  './assets/heart_wax_seal.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network First, NEVER cache HTML/JS/CSS to ensure instant updates)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  // Always fetch JS, CSS, and HTML fresh from network!
  if (url.includes('.js') || url.includes('.css') || url.includes('.html') || url.endsWith('/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
          }
        });
      })
  );
});
