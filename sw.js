// Offline support: the app's own files are cached, so it opens without internet. No data passes through here.
// Every release raises BUILD (here, in js/build.js and in the ?v= of index.html: bump.js does all three),
// so the browser installs the new files and the app refreshes itself. Touch only caches that start with b4a-.
const BUILD = 11;
const VERSION = 'b4a-' + BUILD, V = '?v=' + BUILD;
const PAGE = ['./', 'index.html'];
const FILES = PAGE.concat(['css/styles.css', 'js/build.js', 'js/calc.js', 'js/demo.js', 'js/store.js', 'js/importer.js', 'js/app.js', 'js/wizard.js', 'js/import-ui.js', 'js/cloud.js', 'js/update.js',
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
// Files of this release (?v=BUILD) never change: from the cache at once. Everything else: network first, checked with the
// server (so updates arrive at once), and the cache when offline OR when the network hangs (a weak signal) for 3.5 seconds.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/oauth(\.html|\.js)$/.test(url.pathname)) return; // the sign-in answer: always the real page, never the app
  const appPage = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
  const fromCache = () => caches.open(VERSION).then(c => c.match(req).then(r => r || (appPage ? c.match('index.html') : undefined)));
  if (url.search === V) { e.respondWith(fromCache().then(r => r || fetch(req))); return; }
  const net = (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' })).then(r => {
    if (r.ok && !req.url.includes('version.json')) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  });
  if (url.pathname.endsWith('version.json')) { e.respondWith(net); return; }
  const slow = new Promise(res => setTimeout(res, 3500)).then(fromCache).then(r => r || net);
  e.respondWith(Promise.race([net.catch(() => fromCache()), slow]).then(r => r || net));
});
