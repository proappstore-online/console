// Web Push handlers, imported into the workbox-generated service worker
// (vite.config.ts → workbox.importScripts). Shows a notification when the
// backend pushes an agent task update, and focuses/opens the project on click.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* non-JSON push */ }
  const title = data.title || 'ProAppStore'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag,            // collapse repeated updates for the same ticket
      renotify: Boolean(data.tag),
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || './'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Focus an existing tab if one is open, navigating it to the target.
      for (const w of wins) {
        if ('focus' in w) {
          if ('navigate' in w) { try { w.navigate(target) } catch { /* cross-origin */ } }
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
