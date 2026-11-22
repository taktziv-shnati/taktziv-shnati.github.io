// Offline support: the app's own files are cached, so it opens without internet. No data passes through here.
// Every release raises BUILD (here, in js/build.js and in the ?v= of index.html: bump.js does all three),
// so the browser installs the new files and the app refreshes itself. Touch only caches that start with b4a-.
const BUILD = 6;
const VERSION = 'b4a-' + BUILD, V = '?v=' + BUILD;
const PAGE = ['./', 'index.html'];
const FILES = PAGE.concat(['css/styles.css', 'js/build.js', 'js/calc.js', 'js/demo.js', 'js/store.js', 'js/importer.js', 'js/app.js', 'js/wizard.js', 'js/import-ui.js', 'js/update.js',
  'vendor/xlsx.full.min.js'].map(f => f + V), ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']);
// install: every file fresh from the server; a page or build.js from an older release (a CDN edge that has not caught up)
// fails the install, and the browser tries again on its next update check, so the offline copy is never a mix of versions
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => fetch(f, { cache: 'reload' }).then(async r => {
    if (!r.ok) throw new Error(f + ' ' + r.status);
    if (f === 'index.html' || f.startsWith('js/build.js')) {
      const t = await r.clone().text();
      if (!t.includes(f === 'index.html' ? 'build.js' + V + '"' : 'n: ' + BUILD + ',')) throw new Error('old copy of ' + f);
    }
    return c.put(f, r);
  })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('b4a-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first, checked with the server (so updates arrive at once); the cache when offline
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then(r => {
    if (r.ok && !req.url.includes('version.json')) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.open(VERSION).then(c => c.match(req).then(r => r || (req.mode === 'navigate' ? c.match('index.html') : undefined)))));
});
