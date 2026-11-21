// Saving on this device only (IndexedDB, with localStorage as a fallback), automatic copies, and backup files. Nothing is sent anywhere.
(function (root) {
  'use strict';
  const DB = 'budget4all', ST = 'kv', LS = 'budget4all.', META = 'budget4all.meta';
  const DAILY = 10, BEFORE = 5;
  let db = null, mode = 'idb';

  const meta = () => { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch (_) { return {}; } };
  const setMeta = o => { try { localStorage.setItem(META, JSON.stringify(Object.assign(meta(), o))); } catch (_) { /* ignore */ } };

  function openDb() {
    return new Promise((res, rej) => {
      if (!root.indexedDB) return rej(new Error('no indexedDB'));
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(ST)) req.result.createObjectStore(ST); };
      req.onsuccess = () => {
        const d = req.result;
        // iPhone closes the connection after the app was in the background: forget it, the next save opens a new one
        d.onclose = () => { if (db === d) db = null; };
        d.onversionchange = () => { d.close(); if (db === d) db = null; };
        res(d);
      };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('blocked'));
    });
  }
  // a transaction, reopening the database once if the connection was lost
  async function tx(kind, fn) {
    try { if (!db) db = await openDb(); return await tx1(kind, fn); }
    catch (e) {
      if (!e || !/InvalidState|closing|closed|connection/i.test(e.name + ' ' + e.message)) throw e;
      db = await openDb();
      return tx1(kind, fn);
    }
  }
  function tx1(kind, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(ST, kind), st = t.objectStore(ST);
      let out;
      Promise.resolve(fn(st, v => { out = v; })).catch(rej);
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('aborted'));
    });
  }
  const get = k => mode === 'idb'
    ? tx('readonly', (st, put) => { const r = st.get(k); r.onsuccess = () => put(r.result); })
    : Promise.resolve(localStorage.getItem(LS + k));
  const set = (k, v) => mode === 'idb'
    ? tx('readwrite', st => { st.put(v, k); })
    : Promise.resolve().then(() => localStorage.setItem(LS + k, v));
  const del = k => mode === 'idb' ? tx('readwrite', st => { st.delete(k); }) : Promise.resolve(localStorage.removeItem(LS + k));
  const keys = () => mode === 'idb'
    ? tx('readonly', (st, put) => { const r = st.getAllKeys(); r.onsuccess = () => put(r.result.map(String)); })
    : Promise.resolve(Object.keys(localStorage).filter(k => k.startsWith(LS) && k !== META).map(k => k.slice(LS.length)));

  async function init() {
    try { db = await openDb(); mode = 'idb'; } catch (_) { db = null; mode = 'ls'; }
    try { if (mode === 'ls') localStorage.setItem(LS + 'probe', '1'), localStorage.removeItem(LS + 'probe'); } catch (_) { mode = 'none'; }
    // data of version 1 (localStorage) moves into IndexedDB once
    if (mode === 'idb') {
      try {
        const old = localStorage.getItem(LS + 'data');
        if (old && !(await get('data'))) { await set('data', old); }
        else if (old) { try { await set('before-' + Date.now(), JSON.stringify({ time: Date.now(), kind: 'before', label: 'נתונים קודמים מהדפדפן', data: JSON.parse(old) })); } catch (_) { /* damaged: skip */ } }
        if (old) localStorage.removeItem(LS + 'data');
        Object.keys(localStorage).filter(k => k.startsWith(LS + 'snap.')).forEach(k => localStorage.removeItem(k));
      } catch (_) { /* keep what is there */ }
    }
    return mode;
  }

  // On closing the page the IndexedDB save may not finish in time: a quick copy in localStorage covers the last edit.
  function saveSync(S) { try { localStorage.setItem(LS + 'pending', JSON.stringify({ time: Date.now(), data: S })); } catch (_) { /* too big: the normal save still runs */ } }
  function takePending() {
    try {
      const p = JSON.parse(localStorage.getItem(LS + 'pending') || 'null');
      if (p && p.data && p.time > (meta().saved || 0)) return p.data;
    } catch (_) { /* ignore */ }
    return null;
  }
  async function load() {
    const pend = takePending();
    if (pend) return { data: pend };
    if (mode === 'none') return { error: 'הדפדפן חוסם שמירה (אולי חלון גלישה בסתר). פתח את האפליקציה בחלון רגיל.' };
    let txt = null;
    try { txt = await get('data'); } catch (e) { return { error: 'אי אפשר לקרוא את הנתונים השמורים: ' + e.message }; }
    if (!txt) return { data: null };
    try { return { data: JSON.parse(txt) }; }
    catch (e) {
      // damaged: keep it aside and come back from the newest automatic copy
      try { await set('damaged-' + Date.now(), txt); } catch (_) { /* ignore */ }
      const s = (await snapshots())[0];
      return { data: s ? s.data : null, message: 'הנתונים השמורים נפגמו, ולכן נטען העותק האוטומטי האחרון' + (s ? ' (' + new Date(s.time).toLocaleString('he-IL') + ')' : '') + '.' };
    }
  }
  let chain = Promise.resolve();
  function save(S) {
    const txt = JSON.stringify(S);
    // saves run one after another, so an older save never overwrites a newer one
    chain = chain.then(async () => {
      try {
        await set('data', txt);
        setMeta({ saved: Date.now() });
        try { localStorage.removeItem(LS + 'pending'); } catch (_) { /* ignore */ }
        await snapshotDaily(txt);
        return { ok: true };
      } catch (e) { return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'אין מקום במכשיר. שמור גיבוי לקובץ ומחק שנים ישנות.' : (e && e.message) || 'שגיאה' }; }
    });
    return chain;
  }
  async function snapshotDaily(txt) {
    const day = new Date().toISOString().slice(0, 10);
    if (meta().snapDay === day) return;
    try {
      await set('snap-' + day, JSON.stringify({ time: Date.now(), kind: 'daily', data: JSON.parse(txt) }));
      setMeta({ snapDay: day });
      await prune('snap-', DAILY);
    } catch (_) { /* a missing copy is not fatal */ }
  }
  // A copy kept right before an automatic or big action (opening months, import, restore), so it can be undone even after closing the app.
  async function snapshotBefore(S, label) {
    try {
      const k = 'before-' + Date.now();
      await set(k, JSON.stringify({ time: Date.now(), kind: 'before', label, data: S }));
      await prune('before-', BEFORE);
      return k;
    } catch (_) { return null; }
  }
  async function prune(prefix, keep) {
    const ks = (await keys()).filter(k => k.startsWith(prefix)).sort();
    for (const k of ks.slice(0, Math.max(0, ks.length - keep))) await del(k);
  }
  async function snapshots() {
    try {
      const ks = (await keys()).filter(k => k.startsWith('snap-') || k.startsWith('before-'));
      const out = [];
      for (const k of ks) { try { const v = JSON.parse(await get(k)); v.key = k; out.push(v); } catch (_) { /* skip */ } }
      return out.sort((a, b) => b.time - a.time);
    } catch (_) { return []; }
  }
  async function snapshot(key) { try { const v = JSON.parse(await get(key)); return v; } catch (_) { return null; } }
  async function clearAll() {
    try { for (const k of await keys()) await del(k); } catch (_) { /* ignore */ }
    try { Object.keys(localStorage).filter(k => k.startsWith(LS)).forEach(k => localStorage.removeItem(k)); } catch (_) { /* ignore */ }
  }
  // Ask the browser not to clear our data when space runs low.
  async function persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (_) { /* ignore */ }
    return false;
  }
  async function usage() {
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } } catch (_) { /* ignore */ }
    return null;
  }

  // phones and tablets (iPadOS reports itself as a Mac with touch)
  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const isStandalone = () => (root.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  function backupName() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `תקציב-גיבוי-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
  }
  // Save a backup file: the share sheet on phones ("Save to Files", Drive, WhatsApp to yourself), a download elsewhere.
  async function exportFile(S) {
    const name = backupName(), txt = JSON.stringify(S, null, 1);
    if (isMobile() && navigator.share && navigator.canShare) {
      for (const type of ['application/json', 'text/plain']) {
        let file;
        try { file = new File([txt], name, { type }); } catch (_) { break; }
        if (!navigator.canShare({ files: [file] })) continue;
        try {
          await navigator.share({ files: [file], title: name });
          setMeta({ backup: Date.now() });
          return { ok: true, shared: true, name };
        } catch (e) {
          if (e && e.name === 'AbortError') return { canceled: true };
          break; // fall back to a download
        }
      }
    }
    const blob = new Blob([txt], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setMeta({ backup: Date.now() });
    return { ok: true, name };
  }
  function readFile(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });
  }
  /* ---------- automatic backup to a file the user picks once (Chrome / Edge on a computer; a OneDrive or Drive folder syncs it to the cloud) ---------- */
  const autoSupported = () => typeof root.showSaveFilePicker === 'function' && root.self === root.top && mode === 'idb';
  const getHandle = () => mode === 'idb' ? tx('readonly', (st, put) => { const r = st.get('autofile'); r.onsuccess = () => put(r.result || null); }) : Promise.resolve(null);
  async function autoStatus() {
    if (!autoSupported()) return { state: 'unsupported' };
    let h = null; try { h = await getHandle(); } catch (_) { /* none */ }
    if (!h) return { state: 'off' };
    let perm = 'prompt';
    try { perm = await h.queryPermission({ mode: 'readwrite' }); } catch (_) { /* ask again */ }
    return { state: perm === 'granted' ? 'on' : perm === 'denied' ? 'denied' : 'prompt', name: h.name };
  }
  // needs a tap (the browser asks where to save)
  async function autoChoose(S) {
    const h = await root.showSaveFilePicker({ suggestedName: 'תקציב-גיבוי-אוטומטי.json', types: [{ description: 'גיבוי תקציב שנתי', accept: { 'application/json': ['.json'] } }] });
    await tx('readwrite', st => { st.put(h, 'autofile'); });
    await autoWrite(S);
    return h.name;
  }
  // after reopening the app the browser asks once more (a tap)
  async function autoResume(S) {
    const h = await getHandle(); if (!h) return false;
    const p = await h.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return false;
    await autoWrite(S);
    return true;
  }
  let autoBusy = null;
  async function autoWrite(S) {
    if (!autoSupported()) return false;
    const run = async () => {
      const h = await getHandle(); if (!h) return false;
      if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
      const w = await h.createWritable();
      await w.write(JSON.stringify(S, null, 1));
      await w.close();
      setMeta({ autoBackup: Date.now(), backup: Date.now() });
      return true;
    };
    autoBusy = (autoBusy || Promise.resolve()).then(run, run).catch(() => false);
    return autoBusy;
  }
  async function autoOff() { if (mode === 'idb') await del('autofile'); setMeta({ autoBackup: null }); }

  root.BudgetStore = { init, load, save, saveSync, snapshots, snapshot, snapshotBefore, clearAll, persist, usage, exportFile, readFile, meta, setMeta,
    isMobile, isIOS, isStandalone, autoSupported, autoStatus, autoChoose, autoResume, autoWrite, autoOff, get mode() { return mode; } };
})(window);
