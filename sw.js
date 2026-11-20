// Service worker: NETWORK FIRST, cache as fallback.
// - Online: always gets the latest files (new prices show up straight away).
// - Offline / no signal: opens from the last saved copy.
var CACHE = 'spm-billing-v1';
var CORE = [
  './',
  'index.html',
  'cost.html',
  'style.css',
  'app.js',
  'cost.js',
  'pwa.js',
  'products.js',
  'manifest.webmanifest',
  'vendor/jspdf.umd.min.js',
  'vendor/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(CORE); })
      .catch(function () { /* e.g. login page in the way: cache fills on normal use instead */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      // only keep real copies of our own files (never login redirects / errors)
      if (res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true })
        .then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('index.html') : null); })
        .then(function (res) { return res || Response.error(); });
    })
  );
});
