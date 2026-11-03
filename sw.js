/* Кешира файловете на приложението, за да се отваря бързо и без връзка. */
var CACHE = 'rb-v2';
var FILES = ['./', 'index.html', 'css/styles.css', 'js/units.js', 'js/data.js', 'js/store.js', 'js/config.js', 'js/cloud.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // първо мрежата (за нови версии), при липса на връзка — кеш
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () { return caches.match(e.request); }));
});
