// Offline support: the app's own files are cached, so it opens without internet. No data passes through here.
// The site is shared with other apps (run, english): touch only caches that start with b4a-
const VERSION = 'b4a-5';
const FILES = ['./', 'index.html', 'css/styles.css', 'js/calc.js', 'js/demo.js', 'js/store.js', 'js/importer.js', 'js/app.js', 'js/wizard.js', 'js/import-ui.js',
  'vendor/xlsx.full.min.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('b4a-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (so updates arrive), the cache when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.open(VERSION).then(c => c.match(e.request, { ignoreSearch: true }).then(r => r || c.match('index.html')))));
});
