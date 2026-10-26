/* Keeps the staff pages working when the internet drops. */
var VERSION = 'bh-v1';
var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
var CORE = ['index.html', 'dashboard.html', 'admin.html', 'login.html', 'account.html', 'book.html', 'status.html',
  'style.css', 'config.js', 'theme-early.js', 'common.js', 'backend.js', 'app.js', 'dashboard.js', 'admin.js',
  'site.js', 'book.js', 'status.js', 'auth.js', 'favicon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () { /* skip */ }); })
      .concat([fetch(CDN, { mode: 'no-cors' }).then(function (r) { return c.put(CDN, r); }).catch(function () { /* skip */ })]));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  if (req.url === CDN) {
    e.respondWith(caches.match(CDN).then(function (hit) { return hit || fetch(req); }));
    return;
  }
  if (!sameOrigin) { return; } // database and photos always go to the network
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match(url.pathname.replace(/\/$/, '') + '.html') || caches.match('index.html');
      });
    })
  );
});
