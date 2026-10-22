// Push notification handler for Elevator App
self.addEventListener('push', (event) => {
  let data = {
    title: 'Elevator Switch Alert',
    body: 'The elevator switch is offline.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'switch-status',
    url: '/admin',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'switch-status',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    data: {
      url: data.url || '/admin',
      timestamp: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
