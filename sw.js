/* Signing STARLITE — service worker: notifikasi dokumen baru + angka di ikon aplikasi. Tidak menyimpan cache (data selalu langsung dari server). */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { });   // syarat pemasangan; tanpa cache
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { }
  var n = Number(d.count) || 0, title = d.title || 'Signing STARLITE';
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, { body: d.body || 'Ada dokumen menunggu tanda tangan Anda', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'sg-pending', renotify: true, data: { url: d.url || './?app=sign' } }),
    (self.navigator && self.navigator.setAppBadge) ? self.navigator.setAppBadge(n || undefined).catch(function () { }) : Promise.resolve()
  ]));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './?app=sign', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { cs[i].postMessage({ type: 'sg-refresh' }); return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
