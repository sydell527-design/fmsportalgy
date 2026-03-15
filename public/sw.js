const CACHE_NAME = 'fms-tracker-v1';
const STATIC_CACHE = 'fms-static-v1';
const API_CACHE = 'fms-api-v1';

// Files to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/index-J72B7PTa.js',
  '/assets/index-DoLArlMq.css',
  '/assets/fms_logo_acronym_(2)_1773261874549-DfpcKGxE.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
            console.log('Service Worker: Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Try to serve from cache if network fails
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline fallback for API requests
              return new Response(JSON.stringify({
                error: 'Offline - Request queued for sync',
                queued: true
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            });
        })
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Serve from cache if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network
        return fetch(request)
          .then((response) => {
            // Cache new static assets
            if (response.ok && request.destination === 'script' || 
                request.destination === 'style' || 
                request.destination === 'image') {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Offline fallback for HTML requests
            if (request.destination === 'document') {
              return caches.match('/');
            }
            // Return offline indicator for other requests
            return new Response('Offline - Content not available', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Background sync for queued requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queued-requests') {
    event.waitUntil(syncQueuedRequests());
  }
});

// Sync queued requests when online
async function syncQueuedRequests() {
  try {
    // Get all queued requests from IndexedDB
    const queuedRequests = await getQueuedRequests();
    
    for (const request of queuedRequests) {
      try {
        // Retry the request
        const response = await fetch(request.url, request.options);
        if (response.ok) {
          // Remove from queue on success
          await removeQueuedRequest(request.id);
        }
      } catch (error) {
        console.log('Sync failed for request:', request.id, error);
      }
    }
  } catch (error) {
    console.log('Sync process failed:', error);
  }
}

// Helper functions for IndexedDB operations
async function getQueuedRequests() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fms-offline-db', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['queued-requests'], 'readonly');
      const store = transaction.objectStore('queued-requests');
      const getAll = store.getAll();
      
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    };
  });
}

async function removeQueuedRequest(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fms-offline-db', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['queued-requests'], 'readwrite');
      const store = transaction.objectStore('queued-requests');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// Push notification for sync status updates
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Sync status updated',
    icon: '/fms_logo_acronym_(2)_1773261874549-DfpcKGxE.png',
    badge: '/fms_logo_acronym_(2)_1773261874549-DfpcKGxE.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('FMS Tracker', options)
  );
});

console.log('Service Worker: Loaded');
