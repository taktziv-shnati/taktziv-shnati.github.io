// Updates reach everyone by themselves: when a new version is installed in the background, the app saves, keeps a copy,
// and refreshes at a quiet moment (nothing being typed, no dialog open, or the app in the background).
// version.json { "min": N }: a copy older than build N refreshes at once (an emergency switch for a serious bug).
'use strict';
(function () {
  const A = () => window.App, Store = window.BudgetStore, BUILD = window.BUILD || { n: 0 };
  const sw = navigator.serviceWorker;
  if (!sw || location.protocol === 'file:') return;
  const hadController = !!sw.controller; // the first install also "changes controller": that is not an update
  let pending = false, reloading = false, quietTicks = 0;

  // a quiet moment: no dialog, nothing focused for typing, no import or opening flow in progress
  // a flow that a refresh would cut off (a dialog such as the Dropbox code, an import, the opening wizard): never refresh, even in the background
  function inFlow() {
    const m = document.getElementById('modal');
    return !!((m && !m.hidden) || (window.ImportUI && window.ImportUI.active) || document.querySelector('.wiz'));
  }
  function quiet() {
    const a = document.activeElement;
    if (inFlow()) return false;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return false;
    return true;
  }
  async function apply(force) {
    if (reloading) return;
    reloading = true;
    try {
      const app = A();
      if (app && app.S) {
        await app.saveNow();
        await Store.snapshotBefore(app.S, 'לפני עדכון גרסה', { prefix: 'upd-', keep: 2, minGapMin: 10 });
      }
    } catch (_) { /* the data is already saved on every change */ }
    // the user came back and started typing meanwhile: wait for the next quiet moment
    if (!force && (document.hidden ? inFlow() : !quiet())) { reloading = false; quietTicks = 0; return; }
    try { const app = A(); sessionStorage.setItem('b4a-updated', JSON.stringify({ time: Date.now(), place: app && app.place ? app.place() : null })); } catch (_) { /* ignore */ }
    if (force) {
      try { const regs = await sw.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (_) { /* ignore */ }
      try { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('b4a-')).map(k => caches.delete(k))); } catch (_) { /* ignore */ }
    }
    location.reload();
  }
  function onNewVersion() {
    if (pending) return;
    pending = true;
    if (document.hidden && !inFlow()) apply(false); // in the background: the best moment (unless a flow is open)
  }
  sw.addEventListener('controllerchange', () => { if (hadController) onNewVersion(); });
  // wait for two quiet checks in a row (6 seconds), then refresh
  setInterval(() => {
    if (!pending || reloading) return;
    quietTicks = quiet() ? quietTicks + 1 : 0;
    if (quietTicks >= 2) { if (A() && A().setStatus) A().setStatus('מתעדכן לגרסה חדשה…'); setTimeout(() => apply(false), 600); }
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pending && !inFlow()) apply(false); return; }
    check(); // back to the app: look for a new version
  });

  // look for a new version (at most every 20 minutes, and when coming back to the app)
  let lastCheck = 0;
  async function check(now) {
    if (now !== true && Date.now() - lastCheck < 20 * 60e3) return;
    lastCheck = Date.now();
    try { const r = await sw.getRegistration(); if (r) r.update(); } catch (_) { /* offline */ }
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const v = await res.json();
      if (+v.min > BUILD.n) {
        // at most twice an hour, so a mistake on the server can never loop
        let tries = []; try { tries = JSON.parse(localStorage.getItem('budget4all.forced') || '[]').filter(t => Date.now() - t < 36e5); } catch (_) { /* ignore */ }
        if (tries.length >= 2) return;
        tries.push(Date.now()); try { localStorage.setItem('budget4all.forced', JSON.stringify(tries)); } catch (_) { /* ignore */ }
        apply(true);
      }
    } catch (_) { /* offline: try next time */ }
  }
  setInterval(check, 20 * 60e3);
  setTimeout(check, 4000);

  window.BudgetUpdate = { check: () => check(true), inFlow, force: () => apply(true), quiet, get pending() { return pending; }, _simulate: onNewVersion };
})();
