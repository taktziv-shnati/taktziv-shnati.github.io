// Sync between devices through the user's own cloud (Dropbox or Google Drive). There is no server of ours:
// the app talks straight to the user's account, and only to a private app folder there (nobody else sees it).
// One file, budget.json. Each device remembers the remote revision it last saw (base) and a fingerprint of what it
// last sent or received (hash). Remote changed + local unchanged: take remote. Both changed: the user chooses, and
// the other side is kept as a copy in the device.
'use strict';
(function () {
  // App keys from the provider consoles (public by design: PKCE / token flow, no secret). Empty = the option is hidden.
  const CFG = { dropbox: 'pm3w123kptvtgy5', google: '' };
  const FILE = 'budget.json', K = 'budget4all.cloud', REQ = 'b4a.oauthReq', RES = 'b4a.oauthRes';
  const A = () => window.App, C = () => window.BudgetCalc, Store = () => window.BudgetStore;
  const redirect = () => new URL('oauth.html', location.href).href;
  let st = load(), busy = false, timer = null, status = st.prov ? 'idle' : 'off', err = '', fails = 0, conflicts = 0, lastPull = 0;

  function load() { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (_) { return {}; } }
  function keep() { try { localStorage.setItem(K, JSON.stringify(st)); } catch (_) { /* ignore */ } }
  const qs = o => Object.keys(o).filter(k => o[k] != null && o[k] !== '').map(k => k + '=' + encodeURIComponent(o[k])).join('&');
  const b64u = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rnd = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
  function fail(msg, auth) { const e = new Error(msg); e.auth = !!auth; return e; }
  async function http(url, opt, what) {
    let r;
    try { r = await fetch(url, opt); } catch (_) { throw fail('אין חיבור לאינטרנט'); }
    if (r.status === 401) throw fail('צריך להתחבר מחדש', true);
    return r;
  }
  // a fingerprint of the data, without the field that only says which build saved it
  function hashOf(S) {
    const o = Object.assign({}, S); delete o.writtenBy;
    const s = JSON.stringify(o); let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + '.' + s.length;
  }

  /* ---------- providers ---------- */
  const P = {
    dropbox: {
      name: 'Dropbox', icon: '📦',
      authUrl: (q, paste) => 'https://www.dropbox.com/oauth2/authorize?' + qs({ client_id: CFG.dropbox, response_type: 'code', code_challenge: q.ch, code_challenge_method: 'S256', token_access_type: 'offline', state: paste ? null : q.state, redirect_uri: paste ? null : redirect() }),
      async token(body) {
        const r = await http('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs(Object.assign({ client_id: CFG.dropbox }, body)) });
        if (!r.ok) {
          let d = ''; try { const e = await r.json(); d = [e.error, e.error_description].filter(Boolean).join(': '); } catch (_) { /* ignore */ }
          throw fail('Dropbox לא אישר את החיבור' + (d ? ' (' + d.slice(0, 120) + ')' : ' (' + r.status + ')'), true);
        }
        const j = await r.json();
        return { access: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 - 60e3, refresh: j.refresh_token };
      },
      exchange(code, q, paste) { return this.token({ code, grant_type: 'authorization_code', code_verifier: q.ver, redirect_uri: paste ? null : redirect() }); },
      async refresh(t) { if (!t.refresh) return null; const n = await this.token({ grant_type: 'refresh_token', refresh_token: t.refresh }); n.refresh = t.refresh; return n; },
      async meta(a) {
        const r = await http('https://api.dropboxapi.com/2/files/get_metadata', { method: 'POST', headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/' + FILE }) });
        if (r.status === 409) return null;
        if (!r.ok) throw fail('Dropbox: שגיאה ' + r.status);
        return { rev: (await r.json()).rev };
      },
      async get(a) {
        const r = await http('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + a, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE }) } });
        if (!r.ok) throw fail('Dropbox: לא הצלחתי להוריד');
        return r.text();
      },
      async put(a, txt, m) {
        const arg = { path: '/' + FILE, mode: m ? { '.tag': 'update', update: m.rev } : 'add', mute: true, autorename: false };
        const r = await http('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify(arg) }, body: txt });
        if (r.status === 409) { const e = fail('השתנה במקביל'); e.conflict = true; throw e; }
        if (!r.ok) throw fail('Dropbox: לא הצלחתי לשמור');
        return (await r.json()).rev;
      },
      revoke(a) { fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + a } }).catch(() => {}); }
    },
    google: {
      name: 'Google Drive', icon: '🟢',
      authUrl: q => 'https://accounts.google.com/o/oauth2/v2/auth?' + qs({ client_id: CFG.google, redirect_uri: redirect(), response_type: 'token', scope: 'https://www.googleapis.com/auth/drive.appdata', state: q.state, include_granted_scopes: 'true', prompt: st.prov === 'google' ? null : 'select_account' }),
      refresh: async () => null, // the token lasts an hour; after that one tap reconnects
      async meta(a) {
        const r = await http('https://www.googleapis.com/drive/v3/files?' + qs({ spaces: 'appDataFolder', q: "name='" + FILE + "' and trashed=false", fields: 'files(id,version)', orderBy: 'modifiedTime desc' }), { headers: { Authorization: 'Bearer ' + a } });
        if (!r.ok) throw fail('Google Drive: שגיאה ' + r.status, r.status === 403);
        const f = (await r.json()).files[0];
        return f ? { rev: String(f.version), id: f.id } : null;
      },
      async get(a, m) {
        const r = await http('https://www.googleapis.com/drive/v3/files/' + m.id + '?alt=media', { headers: { Authorization: 'Bearer ' + a } });
        if (!r.ok) throw fail('Google Drive: לא הצלחתי להוריד');
        return r.text();
      },
      async put(a, txt, m) {
        let r;
        if (m) r = await http('https://www.googleapis.com/upload/drive/v3/files/' + m.id + '?uploadType=media&fields=version', { method: 'PATCH', headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'application/json' }, body: txt });
        else {
          const b = 'b4a' + rnd(9);
          const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${txt}\r\n--${b}--`;
          r = await http('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=version', { method: 'POST', headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'multipart/related; boundary=' + b }, body });
        }
        if (!r.ok) throw fail('Google Drive: לא הצלחתי לשמור');
        return String((await r.json()).version);
      },
      revoke(a) { fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(a), { method: 'POST' }).catch(() => {}); }
    }
  };
  if (st.prov && !P[st.prov]) { st = {}; keep(); status = 'off'; } // an unknown provider (old test): start clean
  const isIOSApp = () => Store().isIOS() && Store().isStandalone();
  // Google's sign-in opens outside the home-screen app on iPhone, so it cannot hand the answer back there
  const usable = id => CFG[id] && !(id === 'google' && isIOSApp());
  const available = () => Object.keys(P).filter(id => CFG[id]);

  /* ---------- connecting ---------- */
  async function connect(id) {
    const app = A();
    if (!usable(id)) return;
    const ver = rnd(48), q = { prov: id, state: rnd(16), ver, ch: b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver))), t: Date.now() };
    try { localStorage.setItem(REQ, JSON.stringify(q)); localStorage.removeItem(RES); } catch (_) { /* ignore */ }
    const paste = id === 'dropbox' && isIOSApp();
    const url = P[id].authUrl(q, paste);
    if (paste) {
      window.open(url, '_blank');
      const v = await app.ask('אחרי האישור ב-Dropbox מופיע קוד. העתק אותו, חזור לכאן והדבק:', { ok: 'התחבר', html: '<input name="code" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%" placeholder="הקוד מ-Dropbox">', focus: 'input' });
      if (v && v.code) await finish({ prov: id, code: v.code.trim(), paste: true });
      return;
    }
    const w = window.open(url, 'b4a-oauth', 'width=520,height=700');
    if (!w) { await app.saveNow(); location.href = url; } // popups blocked: go in the same window, come back to oauth.html → the app
  }
  // the sign-in window (oauth.html) leaves its answer in localStorage
  async function takeResult() {
    let res, q;
    try { res = JSON.parse(localStorage.getItem(RES) || 'null'); q = JSON.parse(localStorage.getItem(REQ) || 'null'); } catch (_) { return; }
    if (!res) return;
    try { localStorage.removeItem(RES); } catch (_) { /* ignore */ }
    if (!q) return;
    if (Date.now() - q.t > 15 * 60e3) return;
    const p = new URLSearchParams((res.hash || '').replace(/^#/, '') || (res.search || '').replace(/^\?/, ''));
    if (p.get('state') !== q.state) return;
    if (p.get('error')) { A().setStatus('החיבור בוטל', true); return; }
    await finish({ prov: q.prov, code: p.get('code'), access: p.get('access_token'), expires: +p.get('expires_in') || 3600 });
  }
  async function finish(r) {
    let q; try { q = JSON.parse(localStorage.getItem(REQ) || 'null'); localStorage.removeItem(REQ); } catch (_) { /* ignore */ }
    if (!q || q.prov !== r.prov) return;
    try {
      const tok = r.access ? { access: r.access, exp: Date.now() + r.expires * 1000 - 60e3 } : await P[r.prov].exchange(r.code, q, r.paste);
      const same = st.prov === r.prov;
      st = same ? Object.assign(st, { tok }) : { prov: r.prov, tok }; // a new account starts without a base: the first sync compares
      keep(); status = 'idle'; fails = 0;
      A().setStatus('מחובר ל-' + P[r.prov].name + ' ✓');
      await sync(true);
    } catch (e) { A().tell('החיבור ל-' + P[r.prov].name + ' לא הצליח: ' + e.message); }
  }
  async function access() {
    const t = st.tok;
    if (t && t.access && Date.now() < t.exp) return t.access;
    const n = t ? await P[st.prov].refresh(t).catch(e => { if (e.auth) return null; throw e; }) : null;
    if (!n) return null;
    st.tok = n; keep();
    return n.access;
  }
  function disconnect() {
    if (st.prov && st.tok && st.tok.access) P[st.prov].revoke(st.tok.access);
    st = {}; keep(); status = 'off'; A().render();
  }

  /* ---------- syncing ---------- */
  async function apply(remote, m) {
    const app = A();
    if (app.S) await Store().snapshotBefore(app.S, 'לפני סנכרון מהענן');
    st.base = m.rev; st.hash = hashOf(remote); keep();
    const y = app.ui.year, t = app.ui.tab, has = remote.years && remote.years[y];
    await app.start(remote, has ? { year: y, tab: typeof t === 'number' && !(has.months && has.months[t]) ? null : t } : {});
  }
  async function upload(S, m) {
    const tok = await access(); if (!tok) throw fail('צריך להתחבר מחדש', true);
    if (window.BUILD) S.writtenBy = window.BUILD.n;
    st.base = await P[st.prov].put(tok, JSON.stringify(S), m);
    st.hash = hashOf(S); keep();
  }
  async function sync(force) {
    const app = A();
    if (busy || !st.prov || !app || app.ro || !navigator.onLine) return;
    busy = true; const was = status; status = 'sync';
    try {
      const tok = await access();
      if (!tok) { status = 'auth'; return; }
      const prov = P[st.prov], m = await prov.meta(tok), S = app.S, dirty = !!S && hashOf(S) !== st.hash;
      lastPull = Date.now();
      if (m && m.rev !== st.base) {
        let remote; try { remote = JSON.parse(await prov.get(tok, m)); } catch (_) { remote = null; }
        if (!remote || !C().isValid(remote)) throw fail('הקובץ בענן פגום');
        if (+remote.v > C().DATA_V) { status = 'update'; if (window.BudgetUpdate) window.BudgetUpdate.check(); return; }
        if (S && hashOf(remote) === hashOf(S)) { st.base = m.rev; st.hash = hashOf(S); keep(); }
        else if (!dirty) await apply(remote, m);
        else {
          const v = await app.ask('יש שינויים שונים במכשיר הזה ובמכשיר אחר. איזו גרסה להמשיך? הגרסה השנייה תישמר כעותק בהגדרות, כך ששום דבר לא נמחק.', { ok: 'מהמכשיר האחר', cancel: 'מהמכשיר הזה' });
          if (v) await apply(remote, m);
          else { await Store().snapshotBefore(remote, 'גרסה מהמכשיר האחר (סנכרון)'); await upload(app.S, m); }
        }
      } else if (S && (dirty || !m)) await upload(S, m);
      status = 'ok'; fails = 0; conflicts = 0; err = ''; st.last = Date.now(); keep();
    } catch (e) {
      if (e.conflict && ++conflicts < 3) { busy = false; status = was; setTimeout(sync, 1500); return; } // changed meanwhile on another device: read it first
      status = e.auth ? 'auth' : 'err'; err = e.message; fails++;
    } finally {
      busy = false;
      if (status !== was && A()) { if (A().ui.tab === 'settings' || status === 'auth' || fails > 2) A().render(); }
    }
  }
  // after every save on this device (called by app.js); a few seconds later, so typing is not interrupted
  function changed() { if (!st.prov) return; clearTimeout(timer); timer = setTimeout(sync, 4000); }

  window.addEventListener('storage', e => { if (e.key === RES && e.newValue) takeResult(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (timer) { clearTimeout(timer); sync(); } return; }
    takeResult();
    if (Date.now() - lastPull > 15e3) sync();
  });
  window.addEventListener('online', () => sync());
  setInterval(() => { if (!document.hidden && Date.now() - lastPull > 85e3) sync(); }, 30e3);
  // first sync once the app has started
  const wait = setInterval(() => { const a = A(); if (a && (a.S || document.querySelector('.wiz'))) { clearInterval(wait); takeResult().then(() => sync()); } }, 300);

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cloud]'); if (!b) return;
    const [act, id] = b.dataset.cloud.split(':');
    if (act === 'connect') connect(id);
    else if (act === 'reauth') connect(st.prov);
    else if (act === 'now') { lastPull = 0; sync(true).then(() => A().setStatus(status === 'ok' ? 'סונכרן ✓' : '⚠ ' + (err || 'לא סונכרן'), status !== 'ok')); }
    else if (act === 'off') A().ask('לנתק את הסנכרון? הנתונים נשארים במכשיר הזה ובענן.', { ok: 'נתק' }).then(v => { if (v) disconnect(); });
  });

  /* ---------- what app.js shows ---------- */
  const esc = s => A().esc(s);
  function box() {
    const ids = available();
    if (st.prov && P[st.prov]) {
      const p = P[st.prov];
      const line = status === 'auth' ? '<span class="neg">צריך להתחבר מחדש</span>' : status === 'err' && fails > 1 ? '<span class="neg">' + esc(err) + '</span>' : status === 'update' ? 'יש גרסה חדשה יותר, מתעדכן…' : st.last ? 'סונכרן ' + new Date(st.last).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'מסתנכרן…';
      return `<div class="install"><b>☁ מסונכרן עם ${p.icon} ${p.name}</b><p style="margin:4px 0 8px">${line}<br><small>כל שינוי עובר לבד לכל מכשיר שמחובר לאותו חשבון.</small></p>
        <div class="row">${status === 'auth' ? '<button class="pri" data-cloud="reauth">התחבר מחדש</button>' : '<button class="ghost" data-cloud="now">סנכרן עכשיו</button>'}<button class="ghost" data-cloud="off">נתק</button></div></div>`;
    }
    if (!ids.length) return '';
    return `<div class="install"><b>☁ סנכרון אוטומטי בין הטלפון למחשב</b><p style="margin:4px 0 8px">מתחברים פעם אחת בכל מכשיר עם אותו חשבון, ומאז הכל מסתנכרן לבד. הנתונים נשמרים בתיקייה פרטית בחשבון שלך, ורק אתה רואה אותם.</p>
      <div class="cloudopts">${ids.map(id => `<button class="${id === ids[0] ? 'pri' : 'ghost'}" data-cloud="connect:${id}"${usable(id) ? '' : ' disabled'}>${P[id].icon} ${P[id].name}</button>`).join('')}</div>
      ${CFG.dropbox ? '<p class="muted" style="margin:6px 0 0">ב-Dropbox תופיע אזהרה "Before you connect this app". זה רגיל לאפליקציה חדשה: לוחצים Continue ואז Allow.</p>' : ''}
      ${CFG.google && isIOSApp() ? '<p class="muted" style="margin:6px 0 0">באייפון, באפליקציה שבמסך הבית, אפשר רק Dropbox.</p>' : ''}
      ${CFG.google ? '<p class="muted" style="margin:6px 0 0">Google Drive מבקש לחיצה אחת לחיבור מחדש אחרי שעה בלי שימוש. Dropbox אוטומטי לגמרי.</p>' : ''}</div>`;
  }
  function banner() {
    if (!st.prov) return '';
    if (status === 'auth') return `<div class="banner info"><span class="grow">☁ כדי לסנכרן עם ${P[st.prov].name}, צריך להתחבר שוב (לחיצה אחת).</span><button class="sm pri" data-cloud="reauth">התחבר</button></div>`;
    if (status === 'err' && fails > 2) return `<div class="banner warn"><span class="grow">☁ הסנכרון לא הצליח (${esc(err)}). הנתונים שמורים במכשיר.</span><button class="sm" data-cloud="now">נסה שוב</button></div>`;
    return '';
  }
  // on the welcome screen: data already synced from another device
  const welcome = () => st.prov ? '' : available().filter(usable).map(id => `<button class="big" data-cloud="connect:${id}">${P[id].icon} יש לי נתונים ב-${P[id].name}</button>`).join('');
  const fresh = () => !!(st.prov && st.last && Date.now() - st.last < 3 * 864e5);
  window.Cloud = { changed, sync, box, banner, fresh, welcome, get on() { return !!st.prov; }, get status() { return status; }, _hash: hashOf, _st: () => st,
    _mock(impl) { P.mock = Object.assign({ name: 'בדיקה', icon: '🧪', refresh: async () => null }, impl); CFG.mock = 'x'; st = { prov: 'mock', tok: { access: 't', exp: 9e15 } }; keep(); status = 'idle'; } };
})();
