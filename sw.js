// Service Worker for Discord Ultimate Clone
const CACHE_NAME = 'discord-clone-cache-v1';
const urlsToCache = [
  '/',
  # We cache external assets so the app loads faster and works offline
  'https://cdn-icons-png.flaticon.com/512/1256/1256650.png',
  'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'
];

// 1. Install Event: Cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
});

// 2. Fetch Event: Serve cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
            // Fallback for offline mode if the fetch fails
            console.log("App is offline and resource is not cached.");
        });
      }
    )
  );
});

// 3. Push Event: Handle incoming Push Notifications
self.addEventListener('push', event => {
  let payload = { title: "New Message", body: "You have a new notification." };
  
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/1256/1256650.png', // The app icon
    badge: 'https://cdn-icons-png.flaticon.com/512/1256/1256650.png',
    vibrate: [200, 100, 200], // Vibrate pattern for phones
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// 4. Notification Click Event: What happens when the user clicks the notification
self.addEventListener('notificationclick', event => {
  event.notification.close();

  // This looks to see if the current window is already open and focuses if it is
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // If window isn't open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// 5. Activate Event: Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});