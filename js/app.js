// The budget app: month screens, year summary, settings (look, sections, categories, backups), quick add. No network.
'use strict';
(function () {
  const C = window.BudgetCalc, Store = window.BudgetStore;
  const { num, r2, TYPES } = C;
  const MN = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const UNDO_LIMIT = 60;
  const KEEP = [['all', 'נשארות כולל הסכומים'], ['names', 'נשארות, הסכומים מתאפסים'], ['none', 'נמחקות']];
  const COLORS = [['blue', '#2f64c9', 'כחול'], ['teal', '#0c7064', 'טורקיז'], ['purple', '#5639b8', 'סגול'], ['green', '#256f2e', 'ירוק'], ['orange', '#a64b0c', 'כתום'], ['pink', '#a32d5e', 'ורוד']];
  // fields shown in the row itself on a computer; everything else is in the row's details (⋯)
  const MAIN = { income: ['name', 'amount'], expense: ['name', 'amount', 'cat'], loan: ['name', 'monthly', 'balance', 'left'], deposit: ['name', 'amount'],
    bank: ['name', 'balance'], saving: ['name', 'monthly', 'balance'], asset: ['name', 'value', 'cur'], future: ['name', 'amount'] };
  const COLW = { name: 'minmax(0,1.7fr)', n: 'minmax(0,1fr)', cat: 'minmax(0,1.2fr)', calc: 'minmax(0,.9fr)', sel: '76px', text: 'minmax(0,1fr)', chk: '60px' };
  // the amount a phone row shows next to the name
  const PHONE_AMT = { income: 'amount', expense: 'amount', loan: 'monthly', deposit: 'amount', bank: 'balance', saving: 'balance', asset: 'value', future: 'amount' };
  // ready names, so nobody has to type them (tap = a new row with that name)
  const SUGG = {
    income: ['משכורת', 'משכורת בן/בת הזוג', 'קצבת ילדים', 'עבודה נוספת', 'החזר מס', 'בונוס', 'שכר דירה שמתקבל'],
    fixed: ['שכר דירה', 'משכנתא', 'ארנונה', 'חשמל', 'מים', 'גז', 'ועד בית', 'אינטרנט', 'סלולר', 'טלוויזיה', 'ביטוח רכב', 'ביטוח בריאות', 'ביטוח חיים', 'גן / מסגרת', 'חוגים', 'חדר כושר'],
    cards: ['כרטיס אשראי', 'ויזה', 'מאסטרקארד', 'ישראכרט', 'מקס', 'כאל', 'אמריקן אקספרס', 'דיינרס'],
    expense: ['סופר', 'דלק', 'מסעדות', 'מזומן', 'ביט / פייבוקס', 'מתנות', 'תחבורה ציבורית', 'בית מרקחת', 'קניות אונליין'],
    loan: ['הלוואה מהבנק', 'הלוואת רכב', 'משכנתא', 'הלוואה מקרן השתלמות'],
    deposit: ['תיק השקעות', 'קרן כספית', 'פיקדון', 'חיסכון לכל ילד'],
    bank: ['עו"ש', 'חשבון נוסף'],
    saving: ['קרן פנסיה', 'קרן השתלמות', 'קופת גמל', 'ביטוח מנהלים', 'פיקדון', 'חיסכון לכל ילד'],
    asset: ['תיק השקעות', 'קריפטו', 'דירה', 'רכב', 'זהב'],
    future: ['פיצויים', 'החזר מס צפוי', 'פיקדון שמשתחרר', 'מענק צפוי']
  };

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => { const x = r2(n); return (x === 0 ? 0 : x).toLocaleString('he-IL', { maximumFractionDigits: 2 }); };
  const I = s => '<span class="n">' + s + '</span>'; // keeps "-1,234" in order inside right-to-left text
  // summaries show whole shekels from 100 up; the fields keep the exact agorot
  const money = n => I((Math.abs(n) >= 100 ? Math.round(n).toLocaleString('he-IL') : fmt(n)) + ' ₪');
  const usd = n => I((n < 0 ? '-$' : '$') + fmt(Math.abs(n)));
  const pct = v => I((Math.round(v * 10) / 10).toLocaleString('he-IL') + '%');
  const kpi = (l, v, cls = '', sub = '', info = '') => `<div class="kpi ${cls}"><small>${l}${info ? `<button class="ibtn" data-info="${info}" aria-label="הסבר: ${l}">?</button>` : ''}</small><b>${v}</b>${sub ? `<small class="sub">${sub}</small>` : ''}</div>`;
  const curWrap = (sign, inp) => `<span class="cur" data-cur="${sign}">${inp}</span>`;
  const mq = window.matchMedia('(max-width: 759px)');
  const phone = () => mq.matches;

  let S = null;
  const ui = { year: new Date().getFullYear(), tab: 'summary' };
  let notice = null, autoNote = null, saveT = null, lastEdit = 0, installEvt = null;
  const UNDO = [], REDO = [];

  /* ---------- dialogs (a sheet from the bottom on phones) ---------- */
  let dlgResolve = null, dlgOpener = null, dlgOnOpen = null;
  function ask(msg, opts = {}) {
    if (dlgResolve) dlgResolve(false);
    const m = $('#modal'), d = m.querySelector('.dlg');
    dlgOpener = document.activeElement;
    $('#dlgMsg').textContent = msg;
    $('#dlgBody').innerHTML = opts.html || '';
    $('#dlgOk').textContent = opts.ok || 'אישור';
    $('#dlgCancel').textContent = opts.cancel || 'ביטול';
    $('#dlgOk').className = opts.danger ? 'danger' : 'pri';
    d.classList.toggle('alert', !!opts.alert);
    $('#dlgBody').querySelectorAll('[data-extra]').forEach(b => b.addEventListener('click', () => closeDlg(b.dataset.extra)));
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    if (opts.onOpen) opts.onOpen($('#dlgBody'));
    setTimeout(() => { const f = opts.focus ? $('#dlgBody ' + opts.focus) : (phone() ? null : $('#dlgBody input:not([type=checkbox]),#dlgBody select')); (f || $('#dlgOk')).focus({ preventScroll: true }); }, 30);
    return new Promise(res => { dlgResolve = res; });
  }
  const tell = msg => ask(msg, { alert: true, ok: 'סגור' });
  function closeDlg(v) {
    const r = dlgResolve; dlgResolve = null;
    // collect the dialog's fields before it closes
    const vals = {};
    $$('#dlgBody [name]').forEach(e => {
      if (e.type === 'radio') { if (e.checked) vals[e.name] = e.value; }
      else vals[e.name] = e.type === 'checkbox' ? e.checked : e.value;
    });
    $$('#dlgBody [data-pick].on').forEach(e => { vals[e.dataset.pick] = e.dataset.val; });
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    if (dlgOpener && document.contains(dlgOpener)) try { dlgOpener.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    if (r) r(typeof v === 'string' ? Object.assign(vals, { _action: v }) : v ? (Object.keys(vals).length ? vals : true) : false);
  }
  $('#dlgOk').addEventListener('click', () => closeDlg(true));
  $('#dlgCancel').addEventListener('click', () => closeDlg(false));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeDlg(false); });
  // chips that pick one value inside a dialog (category, icon, type)
  $('#modal').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    $$(`#dlgBody [data-pick="${b.dataset.pick}"]`).forEach(x => x.classList.toggle('on', x === b));
    b.dispatchEvent(new CustomEvent('picked', { bubbles: true }));
  });
  // the keyboard on phones: keep the sheet above it
  if (window.visualViewport) {
    const kb = () => { const v = visualViewport; const h = Math.max(0, window.innerHeight - v.height - v.offsetTop); document.documentElement.style.setProperty('--kb', (h > 60 ? h : 0) + 'px'); };
    visualViewport.addEventListener('resize', kb); visualViewport.addEventListener('scroll', kb);
  }

  /* ---------- data helpers ---------- */
  const Y = () => S.years[ui.year];
  const curM = () => Y() && typeof ui.tab === 'number' ? Y().months[ui.tab] : null;
  const sec = id => S.sections.find(s => s.id === id);
  const cat = id => S.categories.find(x => x.id === id);
  const catName = id => { const c = cat(id); return c ? c.name : 'ללא קטגוריה'; };
  const recompute = () => C.recompute(S);
  const calc = m => C.calc(m, S);
  const hasType = t => C.active(S).some(s => s.type === t);
  const usesUsd = () => C.active(S).some(s => s.type === 'asset');
  const fieldDef = (type, key) => TYPES[type].fields.find(f => f[0] === key);
  const amtField = type => C.typeAmount ? C.typeAmount(type) : TYPES[type].amount;
  function periodText(y, k) {
    const pd = Math.min(28, Math.max(1, num(S.profile.payDay) || 1));
    if (pd === 1) return '1–' + new Date(y, k, 0).getDate() + ' ב' + MN[k - 1];
    const end = new Date(y, k, pd - 1);
    return `${pd}/${k} – ${end.getDate()}/${end.getMonth() + 1}`;
  }
  const isNowMonth = (y, k) => { const c = C.currentMonth(S, new Date()); return c.y === +y && c.k === +k; };

  /* ---------- look: color, light/dark, text size ---------- */
  function applyLook() {
    const st = (S && S.settings) || C.SETTINGS_DEFAULT(), html = document.documentElement;
    html.dataset.color = st.theme || 'blue';
    if (st.mode === 'light' || st.mode === 'dark') html.dataset.mode = st.mode; else delete html.dataset.mode;
    if (st.textSize && st.textSize !== 'normal') html.dataset.size = st.textSize; else delete html.dataset.size;
    const col = (COLORS.find(c => c[0] === st.theme) || COLORS[0])[1];
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = col;
    Store.setMeta({ look: { theme: st.theme, mode: st.mode, textSize: st.textSize } });
  }
  function applyLookEarly() {
    const l = Store.meta().look; if (!l) return;
    const html = document.documentElement;
    html.dataset.color = l.theme || 'blue';
    if (l.mode === 'light' || l.mode === 'dark') html.dataset.mode = l.mode;
    if (l.textSize && l.textSize !== 'normal') html.dataset.size = l.textSize;
  }

  /* ---------- undo / redo ---------- */
  function pushUndo(force) {
    const now = Date.now();
    if (force || now - lastEdit > 1500) { UNDO.push(JSON.stringify(S)); if (UNDO.length > UNDO_LIMIT) UNDO.shift(); REDO.length = 0; }
    lastEdit = now; btns();
  }
  function restore(js) { S = JSON.parse(js); lastEdit = 0; ensureUi(); applyLook(); render(); queueSave(true); }
  function commitFocus() { const a = document.activeElement; if (a && a.dataset && a.dataset.k && a.blur) a.blur(); }
  function undo() { commitFocus(); if (!UNDO.length) return; REDO.push(JSON.stringify(S)); restore(UNDO.pop()); setStatus('בוטל ↶'); }
  function redo() { commitFocus(); if (!REDO.length) return; UNDO.push(JSON.stringify(S)); restore(REDO.pop()); }
  function btns() { $('#undo').disabled = !UNDO.length; $('#redo').disabled = !REDO.length; }

  /* ---------- saving (this device only) ---------- */
  let statusT = null;
  function setStatus(t, err) {
    const s = $('#status'); s.textContent = t; s.className = err ? 'err' : '';
    clearTimeout(statusT); if (!err) statusT = setTimeout(() => { s.textContent = ''; }, 2600);
    if (phone() && t) toast(t, err);
  }
  let toastEl = null, toastT = null;
  function toast(t, err) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status'); toastEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom));background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:999px;font-size:.87rem;z-index:120;max-width:90vw;text-align:center;box-shadow:0 4px 14px #0004'; document.body.appendChild(toastEl); }
    toastEl.textContent = t; toastEl.style.background = err ? 'var(--bad)' : 'var(--ink)'; toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, err ? 5000 : 2200);
  }
  // Only one window of the app saves at a time (Web Locks), so two windows never overwrite each other.
  // The window that opened later waits with a notice and can take over with one tap.
  let staleTab = false, ownLock = false, autoT = null, autoState = null;
  const STALE_MSG = null; // the read-only bar explains it
  function becomeStale() {
    if (staleTab) return;
    staleTab = true; ownLock = false; clearTimeout(saveT); saveT = null; clearTimeout(autoT);
    if (S) render(); setStatus('⚠ פתוח בחלון אחר', true);
  }
  function claimSaving(steal) {
    if (!navigator.locks || !navigator.locks.request) return Promise.resolve(true);
    return new Promise(res => {
      navigator.locks.request('budget4all-owner', steal ? { steal: true } : { ifAvailable: true }, lock => {
        if (!lock) { res(false); return; }
        ownLock = true; res(true);
        return new Promise(() => {}); // held while this window is open
      }).catch(() => becomeStale()); // another window took over
    });
  }
  async function takeOver() {
    if (!(await claimSaving(true))) return;
    const r = await Store.load();
    staleTab = false; notice = null;
    if (r.data && C.isValid(r.data)) await start(r.data, { noCatchUp: true, year: ui.year, tab: ui.tab }); else render();
    setStatus('ממשיכים כאן ✓');
  }
  function readOnlyNote() { toast('החלון הזה לקריאה בלבד: האפליקציה פתוחה בחלון אחר. לחץ "המשך לעבוד בחלון הזה".', true); }
  function queueSave(now) { if (!S || staleTab) return; clearTimeout(saveT); saveT = setTimeout(doSave, now ? 0 : 500); }
  async function doSave() {
    saveT = null;
    if (staleTab) return;
    if (window.BUILD) S.writtenBy = window.BUILD.n;
    const r = await Store.save(S);
    if (r.ok) {
      if (!phone()) setStatus('נשמר במכשיר ✓');
      // the automatic backup file follows a few seconds after the last change
      if (autoState === 'on' || autoState === 'error') { clearTimeout(autoT); autoT = setTimeout(runAuto, 3000); }
    } else setStatus('⚠ השמירה נכשלה: ' + r.error, true);
  }
  async function runAuto() {
    if (staleTab) return;
    const ok = await Store.autoWrite(S);
    const before = autoState;
    if (ok) autoState = 'on';
    else { const st = (await Store.autoStatus()).state; autoState = st === 'on' ? 'error' : st; } // permission is fine but the file could not be written (moved, locked, disk full)
    if (autoState !== before) render();
  }
  async function saveNow() {
    if (saveT) { clearTimeout(saveT); saveT = null; }
    if (S && !staleTab) { if (window.BUILD) S.writtenBy = window.BUILD.n; Store.saveSync(S); await Store.save(S); }
    if (autoT) { clearTimeout(autoT); autoT = null; await runAuto(); }
  }
  function flushSave() { if (saveT) { clearTimeout(saveT); if (S && !staleTab) Store.saveSync(S); doSave(); } }
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

  function ensureUi() {
    const ys = Object.keys(S.years).map(Number).sort((a, b) => a - b);
    if (!ys.length) { S.years[ui.year] = { months: {} }; return; }
    if (!S.years[ui.year]) ui.year = ys[ys.length - 1];
    if (typeof ui.tab === 'number' && (ui.tab < 1 || ui.tab > 12)) ui.tab = 'summary';
  }
  function lastMonth() {
    const ks = Object.keys(Y().months || {}).map(Number).sort((a, b) => a - b);
    return ks.length ? ks[ks.length - 1] : null;
  }

  /* ---------- start ---------- */
  async function start(data, opts = {}) {
    const before = opts.fresh ? null : JSON.stringify(data);
    S = C.migrate(data);
    recompute();
    applyLook();
    autoNote = null;
    let opened = [];
    if (S.settings.autoOpen !== false && !opts.noCatchUp) {
      const had = C.chainMonths(S).length > 0;
      opened = C.catchUp(S, new Date());
      if (opened.length && had) {
        const key = await Store.snapshotBefore(JSON.parse(before), 'לפני פתיחה אוטומטית של חודשים');
        autoNote = { opened, key };
      }
    }
    const cur = C.currentMonth(S, new Date());
    if (opts.year) ui.year = opts.year;
    else if (S.years[cur.y] && S.years[cur.y].months[cur.k]) ui.year = cur.y;
    ensureUi();
    if (opts.tab != null) ui.tab = opts.tab;
    else if (ui.year === cur.y && Y().months[cur.k]) ui.tab = cur.k;
    else { const lm = lastMonth(); ui.tab = lm != null ? lm : 'summary'; }
    $('#top').hidden = false;
    if (Store.meta().seenBuild == null && window.BUILD) Store.setMeta({ seenBuild: opts.fresh ? window.BUILD.n : window.BUILD.n - 1 });
    if (!staleTab && !ownLock && !(await claimSaving(false))) staleTab = true;
    autoState = (await Store.autoStatus()).state;
    render();
    queueSave(true);
    Store.persist();
  }
  async function init() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    applyLookEarly();
    await Store.init();
    const r = await Store.load();
    if (r.error) { $('#main').innerHTML = `<section class="box"><h3>אי אפשר לשמור נתונים</h3><p>${esc(r.error)}</p></section>`; return; }
    if (r.message) notice = r.message;
    if (r.data && +r.data.v > C.DATA_V) return needUpdate();
    if (r.data && C.isValid(r.data)) {
      await start(r.data, restorePlace());
      if (r.message) tell(r.message);
      return;
    }
    window.Wizard.show();
  }
  function needUpdate() {
    staleTab = true; // never save: the saved data belongs to a newer version
    $('#main').innerHTML = `<section class="box stack"><h3>האפליקציה צריכה להתעדכן</h3><p>הנתונים שלך נשמרו בגרסה חדשה יותר של האפליקציה. הם שמורים ולא נפגעו. כדי לפתוח אותם, צריך לעדכן (חיבור לאינטרנט).</p><div class="row"><button class="pri" id="forceUpdate">עדכן עכשיו</button></div></section>`;
    $('#forceUpdate').addEventListener('click', () => window.BudgetUpdate ? window.BudgetUpdate.force() : location.reload());
    if (window.BudgetUpdate) window.BudgetUpdate.check();
  }
  // after an update refresh: back to the same year, screen and scroll position
  function restorePlace() {
    let u = null; try { u = JSON.parse(sessionStorage.getItem('b4a-updated') || 'null'); sessionStorage.removeItem('b4a-updated'); } catch (_) { /* ignore */ }
    if (!u || !u.place || Date.now() - u.time > 60e3) return {};
    setTimeout(() => { scrollTo(0, u.place.y || 0); setStatus('עודכן לגרסה ' + (window.BUILD ? window.BUILD.n : '') + ' ✓'); }, 50);
    return { year: u.place.year, tab: u.place.tab, noCatchUp: false };
  }
  const place = () => ({ year: ui.year, tab: ui.tab, y: window.scrollY });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#hdrInstall').hidden = false; });
  window.addEventListener('appinstalled', () => { installEvt = null; $('#hdrInstall').hidden = true; setStatus('האפליקציה הותקנה ✓'); });
  mq.addEventListener ? mq.addEventListener('change', () => { if (S && !window.ImportUI.active) render(); }) : mq.addListener(() => { if (S) render(); });

  /* ---------- month: rows ---------- */
  function inputFor(sid, i, key, row, type, opts = {}) {
    const f = fieldDef(type, key); if (!f) return '';
    const [, lab, kind, extra] = f;
    const k = `${sid}|${i}|${key}`, v = row[key];
    const aria = ` aria-label="${esc(lab)}${row.name ? ' – ' + esc(row.name) : ''}"`;
    if (kind === 'sel') return `<select data-k="${k}"${aria}>${extra.map(o => `<option value="${o[0]}"${v === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
    if (kind === 'cat') return `<select data-k="${k}"${aria}><option value="">ללא קטגוריה</option>${S.categories.map(c => `<option value="${c.id}"${v === c.id ? ' selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>`;
    if (kind === 'calc') return `<span class="calc" data-calc="${sid}|${i}">${type === 'loan' ? C.loanLeft(row) || '—' : ''}</span>`;
    if (kind === 'chk') return `<input type="checkbox" data-k="${k}"${v ? ' checked' : ''}${aria}>`;
    if (kind === 'n') {
      const sign = extra === 'cur' ? (row.cur === 'USD' ? '$' : '₪') : extra;
      const inp = `<input inputmode="decimal" enterkeyhint="next" class="num" data-k="${k}" data-n="1" placeholder="${opts.ph || ' '}" value="${v == null || v === '' ? '' : esc(v)}"${aria}>`;
      return sign ? curWrap(sign, inp) : inp;
    }
    return `<input data-k="${k}" value="${esc(v)}"${aria}${key === 'name' ? ' placeholder="שם"' : ''}>`;
  }
  function deskFields(s) {
    return MAIN[s.type].filter(k => k !== 'cat' || S.settings.useCats);
  }
  function deskCols(s) {
    return deskFields(s).map(k => k === 'name' ? COLW.name : COLW[(fieldDef(s.type, k) || [])[2] || 'text'] || COLW.text).join(' ') + ' 30px 30px';
  }
  function rowSub(s, r) {
    const parts = [];
    if (r.est) parts.push('<span class="esttag">משוער</span>');
    if (r.cat && (S.settings.useCats || s.type === 'expense') && cat(r.cat) && r.name !== catName(r.cat)) parts.push(esc((cat(r.cat).icon || '') + ' ' + catName(r.cat)));
    if (s.type === 'loan') { const l = C.loanLeft(r); if (l) parts.push('נותרו ' + l + (r.balance != null && r.balance !== '' ? ' · יתרה ' + fmt(r.balance) : '')); }
    if (s.type === 'saving' && num(r.monthly)) parts.push('הפקדה ' + fmt(r.monthly));
    if (s.type === 'income' && r.internal) parts.push('העברה פנימית');
    if (r.date) parts.push(/^\d{1,2}$/.test(String(r.date)) ? 'ב-' + esc(r.date) + ' לחודש' : esc(r.date));
    if (r.note) parts.push(esc(r.note));
    return parts.join(' · ');
  }
  function renderRow(s, r, i) {
    if (phone()) {
      const af = PHONE_AMT[s.type], sub = rowSub(s, r);
      return `<div class="pr${r.est ? ' est' : ''}" data-row="${s.id}|${i}">
        <button class="nm" data-rowedit="${s.id}|${i}" aria-label="פרטים: ${esc(r.name || 'שורה')}"><span>${esc(r.name || 'ללא שם')}</span>${sub ? `<small>${sub}</small>` : ''}</button>
        ${inputFor(s.id, i, af, r, s.type)}
        <button class="more" data-rowedit="${s.id}|${i}" aria-label="עוד פרטים">⋯</button></div>`;
    }
    return `<div class="r${r.est ? ' est' : ''}" style="--c:${deskCols(s)}" data-row="${s.id}|${i}">${deskFields(s).map(k => `<div>${inputFor(s.id, i, k, r, s.type)}</div>`).join('')}
      <button class="more" data-rowedit="${s.id}|${i}" title="עוד פרטים${r.est ? ' (הסכום משוער: הועתק מהחודש הקודם)' : ''}" aria-label="עוד פרטים">${r.est ? '◌' : '⋯'}</button><button class="del" title="מחק שורה" aria-label="מחק שורה" data-del="${s.id}|${i}">✕</button></div>`;
  }
  function sectionTotal(s, c) {
    const v = c.bySec[s.id] || 0;
    if (s.type === 'asset') { const ru = C.rowsOf(curM(), s.id).some(r => r.cur === 'USD'); return money(v) + (ru ? ` · ${usd(c.assetsUsd)}` : ''); }
    return money(v);
  }
  const WIDE = { expense: 1, loan: 1, saving: 1 };
  function renderSection(s, m, c) {
    const rows = C.rowsOf(m, s.id), est = rows.some(r => r.est);
    let h = `<section class="box${WIDE[s.type] && !phone() && deskFields(s).length > 2 ? ' wide' : ''}" data-sec="${s.id}"><div class="bh"><h3><span class="ic" aria-hidden="true">${esc(s.icon || '')}</span>${esc(s.title)}</h3>
      <span class="row" style="gap:6px"><span class="tot" data-tot="${s.id}">${sectionTotal(s, c)}</span>${est ? `<button class="sm" data-estok="${s.id}" title="הסכומים המשוערים נכונים">✓ אשר סכומים</button>` : ''}<button class="sm ghost" data-secedit="${s.id}" aria-label="הגדרות הסעיף ${esc(s.title)}">⚙</button></span></div>`;
    if (s.type === 'bank' && rows.length) h += `<p class="muted" style="margin:0 0 6px">היתרה מחושבת לבד מהחודש הקודם ומה שנכנס ויצא. מקלידים יתרה אמיתית כדי לתקן.</p>`;
    if (!phone() && rows.length) h += `<div class="hd" style="--c:${deskCols(s)}">${deskFields(s).map(k => `<div>${k === 'name' ? 'שם' : (fieldDef(s.type, k) || [])[1]}</div>`).join('')}<div></div><div></div></div>`;
    h += rows.map((r, i) => renderRow(s, r, i)).join('');
    if (!rows.length) h += `<p class="muted" style="margin:4px 0">אין עדיין שורות. לוחצים "הוסף" ובוחרים שם מהרשימה.</p>`;
    h += `<button class="add" data-add="${s.id}">＋ הוסף</button></section>`;
    return h;
  }
  function monthKpis(c) {
    const k = [];
    const nowM = isNowMonth(ui.year, ui.tab);
    k.push(kpi(nowM ? 'נשאר לך החודש' : 'נשאר בחודש', money(c.net), 'hero ' + (c.net < 0 ? 'neg' : 'pos'), c.income ? pct(c.net / c.income * 100) + ' מההכנסות' : '', 'net'));
    if (hasType('income')) k.push(kpi('הכנסות', money(c.income), '', c.internal ? 'לא כולל העברה פנימית ' + money(c.internal) : ''));
    if (hasType('expense') || hasType('loan')) k.push(kpi('הוצאות', money(c.expense)));
    if (hasType('deposit')) k.push(kpi('הפקדתי לחיסכון', money(c.depNet), '', 'נשאר אחרי ההפקדה: ' + money(c.remain), 'dep'));
    if (hasType('bank')) k.push(kpi('בבנק', money(c.bank)));
    if (hasType('saving')) k.push(kpi('חסכונות', money(c.savings)));
    if (hasType('asset')) k.push(kpi('השקעות', money(c.assets), '', c.assetsUsd ? usd(c.assetsUsd) : ''));
    if (hasType('loan')) k.push(kpi('חובות', money(c.debts), c.debts ? 'neg' : ''));
    if (hasType('bank') || hasType('saving') || hasType('asset')) k.push(kpi('שווי נקי', money(c.equity), c.equity < 0 ? 'neg' : 'pos', '', 'equity'));
    let h = '';
    if (c.net < 0 && c.income) h += `<div class="banner bad">החודש ההוצאות גבוהות מההכנסות ב-${money(-c.net)}.</div>`;
    return h + `<div class="kpis" aria-live="polite">${k.join('')}</div>`;
  }
  function targetState(v, t) {
    if (!(t > 0)) return { cls: '', txt: '' };
    const p = v / t * 100;
    return { cls: p > 100 ? 'bad' : p >= 85 ? 'warn' : 'ok', txt: p > 100 ? `עברת את היעד ב-${money(Math.round(v - t))}` : `${Math.round(p)}% מהיעד (${money(t)})`, p };
  }
  function catBox(c) {
    if (!S.settings.useCats) return '';
    const list = S.categories.map(x => ({ x, v: c.byCat[x.id] || 0 })).filter(o => o.v || o.x.target > 0);
    const none = c.byCat[''] || 0;
    if (!list.length && !none) return '';
    const mx = Math.max(1, ...list.map(o => Math.max(o.v, o.x.target || 0)));
    return `<section class="box" id="cats"><div class="bh"><h3><span class="ic">📊</span>לפי קטגוריה</h3><span class="muted">לחיצה על קטגוריה = יעד חודשי</span></div><div class="catl">
      ${list.sort((a, b) => b.v - a.v).map(({ x, v }) => { const t = targetState(v, x.target); return `<button class="catr" data-cattarget="${x.id}" style="border:0;border-top:1px solid var(--line);background:none;text-align:start;cursor:pointer;width:100%">
        <span class="nm">${esc(x.icon || '')} ${esc(x.name)}${t.txt ? `<small class="${t.cls}">${t.txt}</small>` : ''}</span>
        <span class="pbar" role="img" aria-label="${x.target > 0 ? Math.round(v / x.target * 100) + '% מהיעד' : ''}"><i class="${t.cls}" style="width:${Math.min(100, Math.max(2, (x.target > 0 ? v / x.target : v / mx) * 100))}%"></i></span>
        <span class="v">${money(v)}</span></button>`; }).join('')}
      ${none ? `<div class="catr"><span class="nm muted">ללא קטגוריה</span><span></span><span class="v">${money(none)}</span></div>` : ''}</div></section>`;
  }
  function bannersMonth(k) {
    let h = '';
    if (autoNote && autoNote.opened.some(o => o.y === ui.year && o.k === k)) {
      const names = autoNote.opened.map(o => MN[o.k - 1] + (o.y !== ui.year ? ' ' + o.y : '')).join(', ');
      h += `<div class="banner info"><span class="grow">פתחתי לבד את ${names} על בסיס החודש הקודם. סכומים שהועתקו מסומנים <span class="esttag">משוער</span> עד שתאשר או תטען קובץ.</span><button class="sm" id="autoUndo">↶ בטל פתיחה</button><button class="sm ghost" id="autoOk">הבנתי</button></div>`;
    }
    const tips = C.hasStarted(S, ui.year, k, new Date()) ? C.insights(S, ui.year, k) : [];
    if (tips.length) h += `<div class="tips">${tips.map(t => `<div class="banner ${t.kind === 'ok' ? 'ok' : 'warn'}">${t.kind === 'ok' ? '👏' : '💡'} ${esc(t.text)}</div>`).join('')}</div>`;
    return h;
  }
  function renderMonth(k) {
    const m = Y().months[k];
    if (!m) {
      const prevK = [...Array(k - 1).keys()].map(x => x + 1).reverse().find(x => Y().months[x]);
      const prevY = !prevK && S.years[ui.year - 1] ? S.years[ui.year - 1].months[12] : null;
      const from = prevK ? MN[prevK - 1] : prevY ? 'דצמבר ' + (ui.year - 1) : null;
      return `<section class="box"><h3>${MN[k - 1]} ${ui.year}: עוד לא נפתח</h3>
        <p class="muted">${from ? `ייפתח כהעתק של ${from}${prevK && prevK < k - 1 ? ` (גם ${MN.slice(prevK, k - 1).join(', ')} ${k - 1 - prevK === 1 ? 'ייפתח' : 'ייפתחו'}, כדי שלא יידלג חודש)` : ''}: השורות נשארות, וסכומים מתעדכנים לפי ההגדרה של כל סעיף (כרטיסים מתאפסים, יתרת הלוואה יורדת).` : 'חודש ריק חדש, עם הסעיפים שלך.'}</p>
        <div class="row"><button class="pri" data-open="${k}">פתח את ${MN[k - 1]}</button><button class="ghost" data-open="${k}" data-thenimport="1">פתח וטען קובץ</button></div></section>`;
    }
    const c = calc(m);
    let h = `<div class="top"><div><h2>${MN[k - 1]} ${ui.year}</h2><span class="sub">${periodText(ui.year, k)}${!C.hasStarted(S, ui.year, k, new Date()) ? ' · החודש עוד לא התחיל' : C.isEstimate(S, ui.year, k, new Date()) ? ' · החודש עוד לא נגמר' : ''}</span></div><div class="det">
      ${usesUsd() ? `<label>שער דולר${curWrap('₪', `<input class="num" data-k="m:rate" data-n="1" inputmode="decimal" placeholder=" " value="${m.rate == null ? '' : esc(m.rate)}">`)}</label>` : ''}
      ${phone() ? '' : `<button class="sm" id="quickAdd">＋ הוספה מהירה</button>`}
    </div></div>`;
    h += bannersMonth(k);
    h += `<div id="sum">${monthKpis(c)}</div>`;
    h += `<div id="catsWrap">${catBox(c)}</div>`;
    const act = C.active(S);
    if (!act.length) h += `<section class="box"><p>כל הסעיפים כבויים. אפשר להדליק אותם בהגדרות.</p></section>`;
    h += `<div class="secgrid">${act.map(s => renderSection(s, m, c)).join('')}</div>`;
    h += `<div class="row" style="margin-top:4px"><button class="add" id="addSec">＋ סעיף חדש</button><button class="ghost" id="importHere">⬆ טען קובץ לחודש הזה</button><button class="ghost" data-reset="${k}">↺ אפס חודש</button></div>`;
    return h;
  }

  /* ---------- year summary ---------- */
  function lineChart(points, opts = {}) {
    const W = 760, H = 210, pad = 44, n = points.length;
    const vals = points.map(p => p.v).concat((opts.ref || []).filter(v => v != null));
    const lo = Math.min(...vals), hi = Math.max(...vals), rng = (hi - lo) || 1;
    const xs = i => n === 1 ? W / 2 : pad + i * (W - 2 * pad) / (n - 1), ys = v => H - 30 - ((v - lo) / rng) * (H - 62);
    const firstEst = points.findIndex(p => p.est), solidEnd = firstEst < 0 ? n : firstEst;
    const pts = (a, b) => points.slice(a, b).map((p, j) => xs(a + j) + ',' + ys(p.v)).join(' ');
    const K = v => Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:240px" role="img" aria-label="${esc(opts.label || 'גרף')}">
      ${opts.ref && opts.ref[0] != null ? `<polyline fill="none" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="5 4" points="${opts.ref.map((v, i) => xs(i) + ',' + ys(v)).join(' ')}"/>` : ''}
      <polyline fill="none" stroke="var(--pri)" stroke-width="2.5" points="${pts(0, solidEnd)}"/>
      ${firstEst > 0 ? `<polyline fill="none" stroke="var(--pri)" stroke-width="2.5" stroke-dasharray="3 5" points="${pts(firstEst - 1, n)}"/>` : ''}
      ${points.map((p, i) => `<circle cx="${xs(i)}" cy="${ys(p.v)}" r="3.5" fill="${p.est ? 'var(--card)' : 'var(--pri)'}" stroke="var(--pri)" stroke-width="1.5"><title>${p.label}: ${fmt(p.v)}${p.est ? ' (הערכה)' : ''}</title></circle><text x="${xs(i)}" y="${H - 8}" text-anchor="middle">${p.label.slice(0, 3)}</text>`).join('')}
      <text x="${xs(0)}" y="${ys(points[0].v) - 9}" text-anchor="middle" direction="ltr">${K(points[0].v)}</text>
      ${n > 1 ? `<text x="${xs(n - 1)}" y="${ys(points[n - 1].v) - 9}" text-anchor="middle" direction="ltr">${K(points[n - 1].v)}</text>` : ''}
    </svg>`;
  }
  function barChart(act) {
    const W = 760, H = 200, pad = 30, n = act.length;
    const mx = Math.max(1, ...act.map(x => Math.max(x.c.income, x.c.expense)));
    const bw = Math.min(26, (W - 2 * pad) / n / 2.6), step = (W - 2 * pad) / n;
    const y = v => H - 26 - v / mx * (H - 46);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:220px" role="img" aria-label="הכנסות מול הוצאות לפי חודש">
      ${act.map((x, i) => { const cx = W - pad - step * i - step / 2; return `
        <rect x="${cx + 1}" y="${y(x.c.income)}" width="${bw}" height="${H - 26 - y(x.c.income)}" rx="3" fill="var(--ok)"><title>${MN[x.k - 1]}: הכנסות ${fmt(x.c.income)}</title></rect>
        <rect x="${cx - bw - 1}" y="${y(x.c.expense)}" width="${bw}" height="${H - 26 - y(x.c.expense)}" rx="3" fill="var(--bad)" opacity=".8"><title>${MN[x.k - 1]}: הוצאות ${fmt(x.c.expense)}</title></rect>
        <text x="${cx}" y="${H - 8}" text-anchor="middle">${MN[x.k - 1].slice(0, 3)}</text>`; }).join('')}
    </svg><div class="muted legend"><span style="--c:var(--ok)">הכנסות</span><span style="--c:var(--bad)">הוצאות</span></div>`;
  }
  function renderYear() {
    const y = C.yearSummary(S, ui.year, new Date());
    if (y.empty) {
      const lm = lastMonth();
      return `<section class="box"><h3>עוד אין נתונים ב-${ui.year}</h3><p class="muted">ממלאים חודש, והסיכום והגרפים יופיעו כאן.</p>
        <button class="pri" data-tab="${lm || 1}">${lm ? 'לחודש ' + MN[lm - 1] : 'לפתוח את ינואר'}</button></section>`;
    }
    const { act, tInc, tExp, tNet, tDep, e0, e1, first } = y;
    const n = act.length;
    let h = `<div class="top"><h2>סיכום ${ui.year}</h2><span class="sub">${n} חודשים</span></div><div class="kpis">
      ${kpi('נשאר השנה', money(tNet), 'hero ' + (tNet < 0 ? 'neg' : 'pos'), tInc ? pct(tNet / tInc * 100) + ' מההכנסות' : '')}
      ${kpi('הכנסות השנה', money(tInc), '', 'ממוצע ' + money(tInc / n) + ' לחודש')}
      ${kpi('הוצאות השנה', money(tExp), '', 'ממוצע ' + money(tExp / n) + ' לחודש')}
      ${hasType('deposit') ? kpi('הפקדתי לחיסכון והשקעה', money(tDep)) : ''}
      ${y.gainReal != null && hasType('asset') ? kpi('רווח מהשוק', money(y.gainReal), y.gainReal < 0 ? 'neg' : 'pos', 'שינוי השווי פחות ההפקדות') : ''}
      ${hasType('bank') || hasType('saving') || hasType('asset') ? kpi('שווי נקי היום', money(e1), e1 < 0 ? 'neg' : 'pos', n > 1 ? (e1 >= e0 ? 'עלייה של ' : 'ירידה של ') + money(Math.abs(e1 - e0)) + ' מ' + MN[first.k - 1] : '') : ''}
    </div>`;
    if (act.some(x => x.est)) h += `<p class="muted" style="margin:-4px 0 10px">${act.filter(x => x.est).map(x => MN[x.k - 1]).join(', ')}: החודש עוד לא נגמר, המספרים שלו הם הערכה.</p>`;
    h += `<div class="secgrid"><section class="box"><h3>חודש אחרי חודש</h3><div class="scroll"><table>
      <thead><tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>נשאר</th><th style="width:16%"></th></tr></thead><tbody>`;
    act.forEach(x => {
      const p = x.c.income > 0 ? x.c.net / x.c.income * 100 : x.c.net < 0 ? -100 : 0;
      h += `<tr><td><button class="link" data-tab="${x.k}">${MN[x.k - 1]}</button>${x.est ? ' <span class="esttag">הערכה</span>' : ''}</td><td>${money(x.c.income)}</td><td>${money(x.c.expense)}</td><td class="${x.c.net < 0 ? 'neg' : 'pos'}"><b>${money(x.c.net)}</b></td><td><div class="pbar" role="img" aria-label="${Math.round(p)}% מההכנסות"><i class="${p < 0 ? 'bad' : 'ok'}" style="width:${Math.min(100, Math.abs(p))}%"></i></div></td></tr>`;
    });
    h += `<tr class="tot"><td>סה״כ</td><td>${money(tInc)}</td><td>${money(tExp)}</td><td class="${tNet < 0 ? 'neg' : 'pos'}">${money(tNet)}</td><td></td></tr></tbody></table></div></section>`;
    h += `<section class="box"><h3>הכנסות מול הוצאות</h3>${barChart(act)}</section></div>`;
    const cats = Object.entries(y.byCat).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    if (cats.length && (S.settings.useCats || cats.some(([id]) => id))) {
      const mx = cats[0][1];
      h += `<section class="box"><h3>לאן הלך הכסף</h3><div class="catl">${cats.map(([id, v]) => { const ct = cat(id), avg = v / n, t = targetState(avg, ct && ct.target); return `<div class="catr"><span class="nm">${esc(ct ? (ct.icon || '') + ' ' + ct.name : 'ללא קטגוריה')}<small class="${t.cls}">ממוצע ${money(avg)} לחודש${t.txt ? ' · ' + t.txt : ''}</small></span><span class="pbar"><i style="width:${Math.max(2, v / mx * 100)}%"></i></span><span class="v">${money(v)} <small>${pct(tExp ? v / tExp * 100 : 0)}</small></span></div>`; }).join('')}</div></section>`;
    }
    if (hasType('bank') || hasType('saving') || hasType('asset')) h += `<section class="box"><h3>שווי נקי לאורך השנה</h3>${lineChart(act.map(x => ({ v: x.c.equity, label: MN[x.k - 1], est: x.est })), { label: 'שווי נקי לאורך השנה' })}
      <p class="muted">${S.settings.includeFuture ? 'כולל כל הכספים העתידיים' : 'בנק + חסכונות + השקעות − חובות'}</p></section>`;
    if (hasType('asset') && act.some(x => x.c.assets)) {
      let cum = y.openAssets;
      const put = y.assets.map(a => cum == null ? null : (cum += a.dep));
      h += `<section class="box"><h3>ההשקעות לאורך השנה</h3>${lineChart(y.assets.map(a => ({ v: a.value, label: MN[a.k - 1], est: a.est })), { ref: put, label: 'שווי ההשקעות' })}
        <div class="muted legend"><span>שווי ההשקעות</span>${put[0] != null ? '<span class="dash">כמה הפקדתי (תחילת שנה + הפקדות)</span>' : ''}</div>
        <div class="det" style="margin-top:10px"><label>שווי ההשקעות בתחילת השנה${curWrap('₪', `<input class="num" data-k="y:openAssets" data-n="1" inputmode="decimal" placeholder=" " value="${Y().openAssets == null ? '' : esc(Y().openAssets)}">`)}</label></div>
        <p class="muted">רווח של כל חודש = שינוי השווי פחות ההפקדות של אותו חודש.${y.openAssets == null ? ' בלי שווי בתחילת השנה, החודש הראשון לא נכנס לרווח.' : ''}</p></section>`;
    }
    h += `<div class="row"><button class="ghost" id="printYear">🖨 הדפסה / PDF</button></div>`;
    return h;
  }

  /* ---------- settings ---------- */
  const seg = (name, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-seg="${name}" data-val="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  function renderLook() {
    const st = S.settings;
    return `<section class="box stack"><h3>🎨 עיצוב</h3>
      <div><span class="muted">צבע</span><div class="swatches" style="margin-top:6px">${COLORS.map(([k, hex, l]) => `<button class="swatch${st.theme === k ? ' on' : ''}" data-color="${k}" style="background:${hex}" aria-label="${l}" aria-pressed="${st.theme === k}"></button>`).join('')}</div></div>
      <div><span class="muted">תצוגה</span><div style="margin-top:6px">${seg('mode', st.mode || 'auto', [['auto', 'אוטומטי'], ['light', '☀ בהיר'], ['dark', '🌙 כהה']])}</div></div>
      <div><span class="muted">גודל טקסט</span><div style="margin-top:6px">${seg('textSize', st.textSize || 'normal', [['normal', 'רגיל'], ['large', 'גדול'], ['xl', 'גדול מאוד']])}</div></div>
    </section>`;
  }
  function renderSecEditor() {
    const n = S.sections.length;
    let h = `<section class="box"><h3>📂 הסעיפים שלך</h3><p class="muted">מדליקים רק מה שיש לך. אפשר לשנות שם ואייקון, להזיז, למחוק וליצור סעיפים חדשים. סעיף כבוי לא מוצג ולא נספר, והנתונים שלו נשמרים.</p><div class="edl">`;
    S.sections.forEach((s, i) => {
      h += `<div class="edr${s.on === false ? ' off' : ''}">
        <label class="sw"><input type="checkbox" data-secon="${s.id}"${s.on === false ? '' : ' checked'} aria-label="להציג את ${esc(s.title)}"><i></i></label>
        <button class="icb" data-secicon="${s.id}" aria-label="אייקון">${esc(s.icon || '📦')}</button>
        <div class="nm"><input data-sectitle="${s.id}" value="${esc(s.title)}" aria-label="שם הסעיף"><small>${TYPES[s.type].label} · בחודש חדש השורות ${KEEP.find(x => x[0] === C.keepOf(s))[1]}</small></div>
        <div class="ctl"><button data-secup="${s.id}" ${i === 0 ? 'disabled' : ''} aria-label="הזז למעלה">↑</button><button data-secdown="${s.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="הזז למטה">↓</button><button data-secedit="${s.id}" aria-label="הגדרות הסעיף">⋯</button></div>
      </div>`;
    });
    h += `</div><button class="add" id="addSec">＋ סעיף חדש</button></section>`;
    return h;
  }
  function renderCatEditor() {
    const missing = C.CATEGORY_PRESETS.filter(p => !S.categories.some(c => c.name === p[0]));
    let h = `<section class="box"><h3>🏷 קטגוריות להוצאות</h3>
      <div class="stack" style="margin-bottom:8px"><span class="muted">איך לעקוב אחרי ההוצאות המשתנות?</span>${seg('useCats', S.settings.useCats ? 'cats' : 'cards', [['cards', '💳 סכום לכל כרטיס'], ['cats', '🏷 לפי קטגוריות']])}
      <span class="muted">${S.settings.useCats ? 'בכל שורת הוצאה אפשר לבחור קטגוריה, ובחודש רואים כמה הלך על כל אחת מול היעד.' : 'פשוט: שורה לכל כרטיס אשראי. אפשר לעבור לקטגוריות בכל רגע, בלי לאבד נתונים.'}</span></div>
      <div class="edl">`;
    S.categories.forEach(c => {
      h += `<div class="edr" style="grid-template-columns:auto minmax(0,1fr) 120px auto"><button class="icb" data-caticon="${c.id}" aria-label="אייקון">${esc(c.icon || '📦')}</button>
        <div class="nm"><input data-catname="${c.id}" value="${esc(c.name)}" aria-label="שם הקטגוריה"></div>
        <span class="cur" data-cur="₪"><input class="num" inputmode="decimal" data-cattgt="${c.id}" placeholder="יעד" value="${c.target > 0 ? esc(c.target) : ''}" aria-label="יעד חודשי ל${esc(c.name)}"></span>
        <div class="ctl"><button data-catdel="${c.id}" aria-label="מחק קטגוריה">✕</button></div></div>`;
    });
    h += `</div><div class="row" style="margin-top:8px"><input id="newCat" placeholder="קטגוריה חדשה" style="flex:1;min-width:150px" enterkeyhint="done"><button class="pri" id="addCat">הוסף</button></div>
      ${missing.length ? `<div class="suggest">${missing.map(p => `<button data-catpreset="${esc(p[0])}">${p[1]} ${esc(p[0])}</button>`).join('')}</div>` : ''}
      <p class="muted">יעד = כמה אתה רוצה להוציא על הקטגוריה בחודש. כשמתקרבים אליו הפס הופך לכתום, ומעליו לאדום.</p></section>`;
    return h;
  }
  function installHelp() {
    if (Store.isStandalone()) return '<p class="muted" style="margin:0">✓ האפליקציה מותקנת במכשיר הזה.</p>';
    if (Store.isIOS()) return `<div class="install"><b>באייפון ובאייפד (ספארי):</b><ol><li>לוחצים על כפתור השיתוף <b>⬆</b> (בגרסאות חדשות הוא בתפריט <b>⋯</b> שליד הכתובת)</li><li>גוללים ובוחרים "הוסף למסך הבית"</li><li>מוודאים ש"פתח כאפליקציה" דלוק ולוחצים "הוסף"</li><li>פותחים את האפליקציה רק מהאייקון החדש</li></ol>
      <p style="margin:6px 0 0">חשוב: לאפליקציה שבמסך הבית יש אחסון נפרד מספארי. אם כבר הזנת נתונים כאן, שמור גיבוי לקובץ ופתח אותו באפליקציה המותקנת.</p></div>`;
    if (installEvt) return `<button class="pri" id="doInstall">📲 התקן כאפליקציה</button>`;
    return `<p class="muted" style="margin:0">בכרום (אנדרואיד או מחשב): תפריט ⋮ ← "התקנת אפליקציה" או "הוספה למסך הבית". אחרי ההתקנה האפליקציה נפתחת מאייקון ועובדת גם בלי אינטרנט.</p>`;
  }
  function renderSettings() {
    const meta = Store.meta();
    const ys = Object.keys(S.years).sort();
    const pd = S.profile.payDay || 1;
    return `<div class="top"><h2>הגדרות</h2></div><div class="secgrid">` + renderLook() + `
    <section class="box stack"><h3>📅 החודש התקציבי</h3>
      <label><span>החודש מתחיל ב-</span><select data-k="p:payDay">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}"${pd === i + 1 ? ' selected' : ''}>${i + 1} לחודש${i === 0 ? ' (חודש רגיל)' : ''}</option>`).join('')}</select></label>
      <p class="muted" style="margin:0">רוב האנשים בוחרים את היום שבו המשכורת נכנסת. כשטוענים קובץ מהבנק, האפליקציה מציעה את היום לבד.</p>
      <label class="chk"><span class="sw"><input type="checkbox" id="autoOpen"${S.settings.autoOpen !== false ? ' checked' : ''}><i></i></span> לפתוח לבד חודש חדש כשהוא מתחיל</label>
      ${hasType('future') ? `<label class="chk"><input type="checkbox" id="incf" ${S.settings.includeFuture ? 'checked' : ''}> לכלול את כל הכספים העתידיים בשווי הנקי</label>` : ''}
    </section>
    <section class="box stack"><h3>📲 התקנה במכשיר</h3>${installHelp()}</section>
    <section class="box stack"><h3>💾 גיבוי ומעבר בין מכשירים</h3>
      <p class="muted" style="margin:0">הנתונים נשמרים רק במכשיר הזה. כדי לא לאבד אותם, ולהעביר לטלפון או למחשב אחר, שומרים קובץ גיבוי (למשל ב"קבצים", ב-Drive או בוואטסאפ לעצמך) ופותחים אותו במכשיר השני.</p>
      <p class="muted" style="margin:0">⚠ בקובץ יש את כל הנתונים שלך, כולל תיאורי פעולות מהבנק. שלח אותו רק לעצמך.</p>
      <p class="muted" style="margin:0">גיבוי אחרון: <b>${meta.backup ? new Date(meta.backup).toLocaleDateString('he-IL') : 'עוד לא נשמר'}</b></p>
      <div class="row"><button class="pri" id="doBackup">⬇ שמור גיבוי לקובץ</button><button class="ghost" id="doRestore">⬆ פתח קובץ גיבוי</button></div>
      ${autoBox()}
      <div id="snapList"><span class="muted">טוען עותקים אוטומטיים…</span></div>
    </section>
    <section class="box stack"><h3>🗓 שנים</h3>
      <p class="muted" style="margin:0">שנים קיימות: ${esc(ys.join(', '))}</p>
      <div class="row"><button class="ghost" id="newYear">＋ פתח שנה חדשה</button></div>
    </section></div>` + renderSecEditor() + renderCatEditor() + `
    <section class="box stack"><h3>התחלה מחדש</h3>
      <p class="muted" style="margin:0">מוחק את כל הנתונים מהמכשיר הזה וחוזר למסך הפתיחה. כדאי לשמור גיבוי לפני.</p>
      <div class="row"><button class="danger" id="wipe">מחק הכל והתחל מחדש</button></div>
    </section>
    <p class="small">תקציב שנתי הוא כלי מעקב אישי, לא ייעוץ פיננסי. אין שרת: הנתונים לא נשלחים לשום מקום. · גרסה ${window.BUILD ? window.BUILD.n : ''} · אחסון: ${Store.mode === 'idb' ? 'IndexedDB' : 'localStorage'}</p>`;
  }
  function autoBox() {
    const meta = Store.meta();
    if (autoState === 'unsupported' || !autoState) return `<p class="muted" style="margin:0">🔁 <b>אוטומטי:</b> האפליקציה שומרת לבד עותק במכשיר כל יום, ומזכירה לשמור קובץ גיבוי ${Store.isMobile() ? 'כל שבוע' : 'כל שבועיים'}. ${Store.isMobile() ? '' : 'בכרום או באדג׳ במחשב אפשר גם גיבוי אוטומטי לקובץ (למשל בתיקיית OneDrive).'}</p>`;
    if (autoState === 'off') return `<div class="install"><b>🔁 גיבוי אוטומטי לקובץ</b><p style="margin:4px 0 8px">בוחרים פעם אחת איפה לשמור (מומלץ: בתוך תיקיית OneDrive או Google Drive במחשב), ומאז כל שינוי נשמר לבד גם לשם.</p><button class="pri" id="autoChoose">בחר קובץ לגיבוי אוטומטי</button></div>`;
    return `<div class="install"><b>🔁 גיבוי אוטומטי לקובץ: ${autoState === 'on' ? '<span class="pos">פעיל ✓</span>' : autoState === 'error' ? '<span class="neg">נכשל, בחר קובץ מחדש</span>' : autoState === 'denied' ? '<span class="neg">הדפדפן חסם, בחר קובץ מחדש</span>' : 'ממתין לאישור'}</b>
      <p style="margin:4px 0 8px">${meta.autoBackup ? 'נשמר לאחרונה: ' + new Date(meta.autoBackup).toLocaleString('he-IL') : ''}</p>
      <div class="row">${autoState === 'prompt' ? '<button class="pri" id="autoResume">המשך גיבוי אוטומטי</button>' : ''}<button class="ghost" id="autoChoose">בחר קובץ אחר</button><button class="ghost" id="autoOffBtn">כבה</button></div></div>`;
  }
  async function fillSnapList() {
    const el = $('#snapList'); if (!el) return;
    const snaps = await Store.snapshots(), u = await Store.usage();
    const el2 = $('#snapList'); if (!el2) return;
    el2.innerHTML = (snaps.length ? `<details><summary class="muted">עותקים אוטומטיים במכשיר (${snaps.length})</summary><table>${snaps.map(s => `<tr><td>${new Date(s.time).toLocaleString('he-IL')}<br><small class="muted">${s.kind === 'before' ? esc(s.label || 'לפני פעולה') : 'עותק יומי'}</small></td><td><button class="sm" data-snap="${esc(s.key)}">שחזר</button></td></tr>`).join('')}</table></details>` : '')
      + (u && u.quota ? `<p class="muted" style="margin:6px 0 0">מקום בשימוש: ${(u.used / 1048576).toFixed(1)} MB${u.used / u.quota > 0.8 ? ' ⚠ כמעט מלא, שמור גיבוי' : ''}</p>` : '');
  }

  /* ---------- render ---------- */
  function render() {
    if (!S) return;
    renderNav(); btns();
    const main = $('#main');
    const nb = notice ? `<div class="banner bad"><span class="grow">${esc(notice)}</span><button class="sm" id="noticeX">הבנתי</button></div>` : '';
    const meta = Store.meta();
    const anyData = C.chainMonths(S).some(x => { const c = calc(x.m); return c.income || c.expense; });
    if (!meta.first) Store.setMeta({ first: Date.now() });
    const used = Date.now() - (Store.meta().first || Date.now()) > 3 * 864e5;
    let extra = '';
    const staleBar = staleTab ? `<div class="banner warn"><span class="grow">🔒 החלון הזה לקריאה בלבד, כי האפליקציה פתוחה בחלון אחר. אם החלון האחר סגור, או שאתה רוצה לעבוד כאן:</span><button class="sm pri" id="takeOver">המשך לעבוד בחלון הזה</button></div>` : '';
    if (autoState === 'error')
      extra += `<div class="banner bad"><span class="grow">⚠ הגיבוי האוטומטי לקובץ נכשל (אולי הקובץ הוזז או נעול). הנתונים שמורים במכשיר, אבל לא בקובץ.</span><button class="sm" id="autoChoose">בחר קובץ מחדש</button><button class="sm ghost" id="autoRetry">נסה שוב</button></div>`;
    if (autoState === 'prompt' && ui.tab !== 'settings')
      extra += `<div class="banner info"><span class="grow">💾 הגיבוי האוטומטי לקובץ ממתין לאישור (הדפדפן מבקש אחרי כל פתיחה).</span><button class="sm pri" id="autoResume">המשך גיבוי אוטומטי</button></div>`;
    const B = window.BUILD, news = B && meta.seenBuild != null && meta.seenBuild < B.n ? (B.notes || []).filter(x => x.n > meta.seenBuild) : [];
    if (news.length && ui.tab !== 'settings')
      extra += `<div class="banner ok"><span class="grow">✨ <b>מה חדש:</b> ${news.map(x => esc(x.text)).join(' ')}</span><button class="sm ghost" id="newsOk">הבנתי</button></div>`;
    else if (B && meta.seenBuild != null && meta.seenBuild < B.n) Store.setMeta({ seenBuild: B.n });
    const remindDays = Store.isMobile() ? 7 : 14;
    const autoFresh = autoState === 'on' && meta.autoBackup && Date.now() - meta.autoBackup < 3 * 864e5;
    if (anyData && used && !autoFresh && ui.tab !== 'settings' && (!meta.backup || Date.now() - meta.backup > remindDays * 864e5) && meta.remindOff !== new Date().toISOString().slice(0, 10))
      extra += `<div class="banner warn"><span class="grow">${meta.backup ? `עבר יותר מ-${remindDays === 7 ? 'שבוע' : 'שבועיים'} מהגיבוי האחרון.` : 'עוד לא שמרת גיבוי.'} הנתונים שמורים רק במכשיר הזה.</span><button class="sm" id="doBackup">⬇ שמור גיבוי</button><button class="sm ghost" id="remindOff">מחר</button></div>`;
    if (Store.isIOS() && !Store.isStandalone() && ui.tab !== 'settings' && !meta.iosTipOff)
      extra += `<div class="banner info"><span class="grow">📲 באייפון כדאי להוסיף את האפליקציה למסך הבית (שיתוף ⬆ ← "הוסף למסך הבית"), כדי שהנתונים יישמרו לאורך זמן.</span><button class="sm ghost" id="iosTipOff">הבנתי</button></div>`;
    if (ui.tab === 'summary') main.innerHTML = staleBar + nb + extra + renderYear();
    else if (ui.tab === 'settings') { main.innerHTML = staleBar + nb + renderSettings(); fillSnapList(); }
    else main.innerHTML = staleBar + nb + extra + renderMonth(ui.tab);
    main.classList.toggle('ro', staleTab);
    $('#fab').hidden = !(phone() && typeof ui.tab === 'number' && curM());
  }
  function renderNav() {
    let h = `<button class="${ui.tab === 'summary' ? 'on' : ''}" data-tab="summary">📊 סיכום</button>`;
    for (let k = 1; k <= 12; k++) { const has = !!Y().months[k]; h += `<button class="${ui.tab === k ? 'on' : ''}${has ? '' : ' empty'}" data-tab="${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${MN[k - 1]}</button>`; }
    h += `<button class="${ui.tab === 'settings' ? 'on' : ''}" data-tab="settings">⚙ הגדרות</button>`;
    $('#nav').innerHTML = h;
    const on = $('#nav .on'); if (on) { const n = $('#nav'); n.scrollLeft = on.offsetLeft - n.clientWidth / 2 + on.clientWidth / 2; }
    $('#yr').innerHTML = Object.keys(S.years).sort().map(y => `<option value="${esc(y)}"${+y === ui.year ? ' selected' : ''}>${esc(y)}</option>`).join('');
  }
  function refreshNumbers() {
    const m = curM(); if (!m) return;
    const c = calc(m);
    const s = $('#sum'); if (s) s.innerHTML = monthKpis(c);
    const cw = $('#catsWrap'); if (cw) cw.innerHTML = catBox(c);
    C.active(S).forEach(x => { const el = document.querySelector(`[data-tot="${x.id}"]`); if (el) el.innerHTML = sectionTotal(x, c); });
    // calculated values shown in other fields (bank, savings, loans left)
    C.active(S).forEach(x => {
      if (x.type === 'bank' || x.type === 'saving') C.rowsOf(m, x.id).forEach((r, i) => {
        const el = document.querySelector(`[data-k="${x.id}|${i}|balance"]`);
        if (!el || el === document.activeElement) return;
        const v = r.balance == null ? '' : String(r.balance);
        if (el.value !== v) { el.value = v; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      });
      if (x.type === 'loan') C.rowsOf(m, x.id).forEach((r, i) => { const cs = document.querySelector(`[data-calc="${x.id}|${i}"]`); if (cs) cs.textContent = C.loanLeft(r) || '—'; });
    });
  }

  /* ---------- editing ---------- */
  function evalExpr(s) {
    s = String(s).replace(/,/g, '').replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    if (!/^[-+*/().\d]+$/.test(s) || !/\d[-+*/]|\)[-+*/(]/.test(s)) return null;
    let p = 0;
    const peek = () => s[p];
    function factor() {
      if (peek() === '-') { p++; return -factor(); }
      if (peek() === '+') { p++; return factor(); }
      if (peek() === '(') { p++; const v = expr(); if (s[p++] !== ')') throw 0; return v; }
      const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(p)); if (!m) throw 0; p += m[0].length; return parseFloat(m[0]);
    }
    function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const o = s[p++], b = factor(); v = o === '*' ? v * b : v / b; } return v; }
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = s[p++], b = term(); v = o === '+' ? v + b : v - b; } return v; }
    try { const v = expr(); return p === s.length && isFinite(v) ? r2(v) : null; } catch (_) { return null; }
  }
  const numVal = t => { t = String(t).trim(); if (t === '') return null; const x = evalExpr(t); return x != null ? x : num(t); };
  // sets one field of a row, keeping the month-to-month chain right
  function setField(sid, i, f, v, y = ui.year, k = ui.tab) {
    const m = S.years[y].months[k], s = sec(sid), row = m.rows[sid][+i];
    if (f === amtField(s.type) || (s.type === 'loan' && f === 'balance') || (s.type === 'saving' && f === 'monthly')) delete row.est;
    if (s.type === 'saving' && f === 'balance') { C.setSavingBalance(S, y, k, sid, +i, v); return; }
    if (s.type === 'loan' && f === 'balance') { row.balTyped = v != null; row.balance = v; recompute(); return; }
    if (s.type === 'bank' && f === 'balance') {
      // only the first bank row is computed automatically; without a previous month there is nothing to compute from
      const autoRow = C.active(S).find(x => x.type === 'bank') === s && +i === 0;
      if (v == null) { row.manual = false; if (!autoRow || !C.prevRow(S, y, k, sid, +i)) row.balance = null; }
      else { row.manual = true; row.balance = v; }
      recompute(); return;
    }
    row[f] = v;
    recompute();
  }
  function applyEdit(el, final) {
    const k = el.dataset.k;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.n) { const t = el.value.trim(); v = t === '' ? null : (final ? numVal(t) : (evalExpr(t) != null ? null : num(t))); if (!final && evalExpr(t) != null) return; }
    else v = el.value;
    if (k.startsWith('y:')) { Y()[k.slice(2)] = v; return; }
    if (k.startsWith('p:')) { S.profile[k.slice(2)] = Math.min(28, Math.max(1, num(v) || 1)); return; }
    const m = curM(); if (!m) return;
    if (k.startsWith('m:')) { m[k.slice(2)] = v; recompute(); return; }
    const [sid, i, f] = k.split('|');
    setField(sid, i, f, v);
    const rowEl = el.closest('[data-row]'); if (rowEl && !m.rows[sid][+i].est) { rowEl.classList.remove('est'); const mb = rowEl.querySelector('.more'); if (mb && mb.textContent === '◌') mb.textContent = '⋯'; const t = rowEl.querySelector('.esttag'); if (t) t.remove(); }
  }
  document.addEventListener('input', e => {
    const el = e.target;
    if (!S || window.ImportUI.active || !el.dataset || !el.dataset.k || el.tagName === 'SELECT' || el.type === 'checkbox' || el.closest('#modal') || !document.contains(el)) return;
    if (staleTab) { readOnlyNote(); return; }
    if (/\|balance$/.test(el.dataset.k) && (sec(el.dataset.k.split('|')[0]) || {}).type === 'bank') return; // a bank balance applies when the field is left
    pushUndo(); applyEdit(el, false); refreshNumbers(); queueSave();
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (!S || el.closest('#modal') || window.ImportUI.active || !document.contains(el)) return;
    if (staleTab && el.id !== 'yr') { readOnlyNote(); render(); return; }
    if (el.id === 'yr') { ui.year = +el.value; const lm = lastMonth(); ui.tab = lm || 'summary'; render(); return; }
    if (el.id === 'incf') { pushUndo(true); S.settings.includeFuture = el.checked; queueSave(true); return; }
    if (el.id === 'autoOpen') { pushUndo(true); S.settings.autoOpen = el.checked; queueSave(true); return; }
    if (el.dataset.secon) {
      const s = sec(el.dataset.secon);
      const n = el.checked ? 0 : monthsWithData(s.id);
      if (n) {
        ask(offQuestion(s, n), { ok: 'כבה', danger: true }).then(ok => {
          if (ok) { pushUndo(true); s.on = false; recompute(); queueSave(true); }
          render();
        });
        return;
      }
      pushUndo(true); s.on = el.checked; recompute(); queueSave(true); render(); return;
    }
    if (el.dataset.sectitle) { pushUndo(true); sec(el.dataset.sectitle).title = el.value.trim() || sec(el.dataset.sectitle).title; queueSave(true); render(); return; }
    if (el.dataset.catname) { pushUndo(true); const c = cat(el.dataset.catname); if (el.value.trim()) c.name = el.value.trim(); queueSave(true); render(); return; }
    if (el.dataset.cattgt) { pushUndo(true); const c = cat(el.dataset.cattgt); const v = numVal(el.value); c.target = v > 0 ? v : null; queueSave(true); return; }
    if (!el.dataset.k) return;
    if (el.tagName === 'SELECT' || el.type === 'checkbox') { pushUndo(true); applyEdit(el, true); queueSave(true); render(); return; }
    if (el.dataset.n) { const x = numVal(el.value); el.value = x == null ? '' : String(x); }
    pushUndo(); applyEdit(el, true); queueSave(true);
    if (/^[yp]:/.test(el.dataset.k)) render(); else refreshNumbers();
  });
  document.addEventListener('keydown', e => {
    if (!$('#modal').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeDlg(false); return; }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); closeDlg(true); return; }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = $$('#modal button:not([hidden]),#modal input,#modal select,#modal textarea').filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    if (e.key === 'Enter' && e.target.id === 'newCat') { e.preventDefault(); addCategory(); return; }
    // Enter in a number field of a row moves to the next row's same field
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.n && e.target.dataset.k && e.target.dataset.k.includes('|')) {
      e.preventDefault();
      const all = $$('input[data-n][data-k*="|"]'), i = all.indexOf(e.target);
      if (i >= 0 && all[i + 1]) all[i + 1].focus(); else e.target.blur();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !S) return;
    if (e.target.matches && e.target.matches('input,textarea') && !e.target.dataset.k) return;
    const k = e.key.toLowerCase();
    if ((k === 'z' || e.code === 'KeyZ') && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || e.code === 'KeyY' || ((k === 'z' || e.code === 'KeyZ') && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  /* ---------- row details / new row (sheet) ---------- */
  function namesUsed(sid) {
    const seen = new Map();
    C.chainMonths(S).forEach(({ m }) => C.rowsOf(m, sid).forEach(r => { if (r.name) seen.set(r.name, r); }));
    return seen;
  }
  function suggestionsFor(s, m) {
    const have = new Set(C.rowsOf(m, s.id).map(r => r.name));
    const past = [...namesUsed(s.id).keys()];
    let base = SUGG[s.id] || SUGG[s.type] || [];
    if (s.type === 'expense' && S.settings.useCats && s.id === 'other') base = S.categories.map(c => c.name).concat(base);
    return [...new Set(past.concat(base))].filter(n => !have.has(n)).slice(0, 14);
  }
  function rowForm(s, r, isNew) {
    const T = TYPES[s.type];
    let h = `<div class="stack">`;
    h += `<label><span>שם</span><input name="name" value="${esc(r.name)}" list="dlNames" autocomplete="off" enterkeyhint="next" placeholder="בחר למטה או כתוב"></label>`;
    if (isNew) { const sg = suggestionsFor(s, curM()); if (sg.length) h += `<div class="suggest" id="sugg">${sg.map(n => `<button type="button" data-sg="${esc(n)}">${esc(n)}</button>`).join('')}</div>`; }
    const EXTRA = ['date', 'note', 'fee'];
    let more = '';
    T.fields.forEach(([key, lab, kind, extra]) => {
      if (key === 'name') return;
      const v = r[key];
      if (EXTRA.includes(key)) { more += `<label><span>${lab}</span><input name="${key}" value="${esc(v)}"${key === 'date' ? ' placeholder="למשל 10 או 10/11"' : ''}></label>`; return; }
      if (kind === 'n') {
        const sign = extra === 'cur' ? (r.cur === 'USD' ? '$' : '₪') : extra;
        h += `<label><span>${lab}${r.est && key === amtField(s.type) ? ' <span class="esttag">משוער</span>' : ''}</span>${curWrap(sign || '', `<input name="${key}" class="num${key === amtField(s.type) ? ' bigamt' : ''}" inputmode="decimal" enterkeyhint="done" placeholder=" " value="${v == null || v === '' ? '' : esc(v)}">`)}</label>`;
        if (key === amtField(s.type)) h += `<div class="keys" aria-label="סימנים לחישוב"><button type="button" data-key="+">+</button><button type="button" data-key="-">−</button><button type="button" data-key="*">×</button><button type="button" data-key="neg">±</button></div>`;
      } else if (kind === 'cat') {
        h += `<div><span class="muted">${lab}</span><div class="chipsel" style="margin-top:4px"><button type="button" data-pick="cat" data-val="" class="${!v ? 'on' : ''}">ללא</button>${S.categories.map(c => `<button type="button" data-pick="cat" data-val="${c.id}" class="${v === c.id ? 'on' : ''}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}</div></div>`;
      } else if (kind === 'chk') h += `<label class="chk"><input type="checkbox" name="${key}"${v ? ' checked' : ''}> ${lab}${key === 'internal' ? ' <small class="muted">(כסף מחשבון אחר שלך, לא הכנסה)</small>' : ''}</label>`;
      else if (kind === 'sel') h += `<label><span>${lab}</span><select name="${key}">${extra.map(o => `<option value="${o[0]}"${v === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;
      else if (kind === 'calc') h += r.name || !isNew ? `<p class="muted" style="margin:0">נותרו: ${C.loanLeft(r) || '—'}</p>` : '';
      else h += `<label><span>${lab}</span><input name="${key}" value="${esc(v)}"></label>`;
    });
    if (more) h += `<details${EXTRA.some(k => r[k]) ? ' open' : ''}><summary class="muted">עוד פרטים (תאריך, הערה)</summary><div class="stack" style="margin-top:8px">${more}</div></details>`;
    if (s.type === 'bank') h += `<p class="muted" style="margin:0">משאירים ריק כדי שהיתרה תחושב לבד.</p>`;
    if (!isNew) h += `<div class="row" style="justify-content:space-between"><button type="button" class="danger" data-extra="delete">🗑 מחק שורה</button></div>`;
    const dl = [...new Set([...namesUsed(s.id).keys()].concat(SUGG[s.id] || SUGG[s.type] || []))];
    h += `<datalist id="dlNames">${dl.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>`;
    return h;
  }
  function wireKeys(body, fieldName) {
    body.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => {
      const inp = body.querySelector(`[name="${fieldName}"]`); if (!inp) return;
      if (b.dataset.key === 'neg') { const x = numVal(inp.value); inp.value = x == null ? '-' : String(-x); }
      else inp.value += b.dataset.key === '-' ? '-' : b.dataset.key;
      inp.focus();
    }));
  }
  function readRowForm(s, vals, r) {
    TYPES[s.type].fields.forEach(([key, , kind]) => {
      if (kind === 'calc') return;
      if (kind === 'cat') { r.cat = vals.cat || ''; return; }
      if (!(key in vals)) return;
      r[key] = kind === 'n' ? numVal(vals[key]) : kind === 'chk' ? !!vals[key] : vals[key];
    });
    r.name = String(vals.name || '').trim();
  }
  async function rowSheet(sid, i) {
    const m = curM(), s = sec(sid), r = m.rows[sid][+i];
    const af = amtField(s.type);
    const v = await ask(r.name || 'שורה', { html: rowForm(s, r, false), ok: 'שמור', focus: phone() ? null : `[name="${af}"]`, onOpen: b => wireKeys(b, af) });
    if (!v) return;
    if (curM() !== m || m.rows[sid][+i] !== r) return;
    if (v._action === 'delete' && (r[af] != null && r[af] !== '') && !(await ask(`למחוק את השורה "${r.name || ''}"?`, { ok: 'מחק', danger: true }))) return;
    if (curM() !== m || m.rows[sid][+i] !== r) return;
    if (v._action === 'delete') { pushUndo(true); m.rows[sid].splice(+i, 1); recompute(); queueSave(true); render(); setStatus('השורה נמחקה (↶ לביטול)'); return; }
    pushUndo(true);
    const before = C.clone(r);
    readRowForm(s, v, r);
    if (!r.name) r.name = before.name;
    // balance fields go through the chain rules
    if (s.type === 'saving' && v.balance !== undefined && numVal(v.balance) !== before.balance) { r.balance = before.balance; setField(sid, i, 'balance', numVal(v.balance)); }
    if (s.type === 'loan' && r.balance !== before.balance) { r.balTyped = r.balance != null; }
    if (s.type === 'bank') { r.balance = before.balance; r.manual = before.manual; const nb = numVal(v.balance); if (nb !== before.balance) setField(sid, i, 'balance', nb); }
    if (r[af] !== before[af]) delete r.est;
    recompute(); queueSave(true); render();
  }
  async function newRowSheet(sid, preset) {
    const m = curM(); if (!m) return;
    const s = sec(sid), r = C.newRow(s.type);
    if (preset) Object.assign(r, preset);
    const af = amtField(s.type);
    const v = await ask('הוספה ל' + s.title, { html: rowForm(s, r, true), ok: 'הוסף', focus: phone() ? null : '[name="name"]', onOpen: b => {
      wireKeys(b, af);
      b.addEventListener('click', e => {
        const g = e.target.closest('[data-sg]'); if (!g) return;
        b.querySelector('[name="name"]').value = g.dataset.sg;
        prefill(b, s, g.dataset.sg);
        const a = b.querySelector(`[name="${af}"]`); if (a) a.focus();
      });
      const nm = b.querySelector('[name="name"]'); nm.addEventListener('change', () => prefill(b, s, nm.value));
    } });
    if (!v) return;
    readRowForm(s, v, r);
    if (!r.name) r.name = s.type === 'income' ? 'הכנסה' : s.title;
    pushUndo(true);
    (m.rows[sid] = m.rows[sid] || []).push(r);
    recompute(); queueSave(true); render();
    setStatus('נוסף ✓');
  }
  // choosing a name used before fills its last amount and category
  function prefill(body, s, name) {
    const prev = namesUsed(s.id).get(name);
    if (prev) {
      const af = amtField(s.type), a = body.querySelector(`[name="${af}"]`);
      if (a && !a.value && prev[af] != null && C.keepOf(s) !== 'none') a.value = prev[af];
      if (prev.cat) $$(`#dlgBody [data-pick="cat"]`).forEach(x => x.classList.toggle('on', x.dataset.val === prev.cat));
    } else if (S.settings.useCats) {
      const ct = S.categories.find(c => c.name === name);
      if (ct) $$(`#dlgBody [data-pick="cat"]`).forEach(x => x.classList.toggle('on', x.dataset.val === ct.id));
    }
  }

  /* ---------- quick add ---------- */
  async function quickAdd() {
    if (!curM()) { const c = C.currentMonth(S, new Date()); if (S.years[c.y] && S.years[c.y].months[c.k]) { ui.year = c.y; ui.tab = c.k; render(); } else return; }
    const m = curM();
    const exp = C.active(S).filter(s => s.type === 'expense'), inc = C.active(S).filter(s => s.type === 'income');
    if (!exp.length && !inc.length) { tell('אין סעיף הוצאות או הכנסות פעיל. אפשר להדליק אותו בהגדרות.'); return; }
    const defExp = (exp.find(s => s.id === 'other') || exp[0] || {}).id;
    const usage = {};
    C.chainMonths(S).slice(-3).forEach(({ m: mm }) => Object.values(mm.rows || {}).forEach(rows => rows.forEach(r => { if (r.cat) usage[r.cat] = (usage[r.cat] || 0) + 1; })));
    const cats = S.categories.slice().sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0));
    const allNames = new Map();
    C.chainMonths(S).forEach(({ m: mm }) => C.active(S).forEach(s => C.rowsOf(mm, s.id).forEach(r => { if (r.name && (s.type === 'expense' || s.type === 'income')) allNames.set(r.name, { sid: s.id, cat: r.cat || '' }); })));
    const html = `<div class="stack">
      <div class="chipsel" role="group">${exp.length ? `<button type="button" data-pick="kind" data-val="exp" class="on">הוצאה</button>` : ''}${inc.length ? `<button type="button" data-pick="kind" data-val="inc"${exp.length ? '' : ' class="on"'}>הכנסה</button>` : ''}</div>
      <label><span>סכום</span>${curWrap('₪', '<input name="amt" class="num bigamt" inputmode="decimal" enterkeyhint="done" placeholder=" ">')}</label>
      <div class="keys"><button type="button" data-key="+">+</button><button type="button" data-key="-">−</button><button type="button" data-key="*">×</button></div>
      <label><span>על מה?</span><input name="name" list="dlQuick" autocomplete="off" placeholder="למשל: סופר, דלק, מסעדה"></label>
      <datalist id="dlQuick">${[...allNames.keys()].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <label><span>לאיזה סעיף</span><select name="sid">${(exp.length ? exp : inc).map(s => `<option value="${s.id}"${s.id === defExp ? ' selected' : ''}>${esc(s.icon || '')} ${esc(s.title)}</option>`).join('')}</select></label>
      ${S.settings.useCats ? `<div id="qcats"><span class="muted">קטגוריה</span><div class="chipsel" style="margin-top:4px">${cats.map(c => `<button type="button" data-pick="cat" data-val="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}</div></div>` : ''}
      <p class="muted" style="margin:0">נכנס ל${MN[ui.tab - 1]} ${ui.year}.</p></div>`;
    const v = await ask('הוספה מהירה', { html, ok: 'הוסף', focus: '[name="amt"]', onOpen: b => {
      wireKeys(b, 'amt');
      const sel = b.querySelector('[name="sid"]');
      b.addEventListener('picked', e => {
        if (e.target.dataset.pick !== 'kind') return;
        const k = e.target.dataset.val;
        // the options are rebuilt (iPhone ignores hidden options)
        sel.innerHTML = (k === 'inc' ? inc : exp).map(s => `<option value="${s.id}"${s.id === defExp ? ' selected' : ''}>${esc(s.icon || '')} ${esc(s.title)}</option>`).join('');
        if (k === 'inc') $$('#dlgBody [data-pick="cat"]').forEach(x => x.classList.remove('on'));
        const qc = b.querySelector('#qcats'); if (qc) qc.hidden = k === 'inc';
      });
      const nm = b.querySelector('[name="name"]');
      nm.addEventListener('change', () => {
        const hit = allNames.get(nm.value.trim());
        if (hit && [...sel.options].some(o => o.value === hit.sid)) sel.value = hit.sid;
        if (hit && hit.cat) $$('#dlgBody [data-pick="cat"]').forEach(x => x.classList.toggle('on', x.dataset.val === hit.cat));
      });
    } });
    if (!v) return;
    const amt = numVal(v.amt);
    if (amt == null || !isFinite(amt) || amt === 0) { setStatus('לא נוסף: חסר סכום', true); return; }
    const s = sec(v.sid); if (!s || curM() !== m) return;
    if (s.type !== 'expense') v.cat = '';
    const name = String(v.name || '').trim() || (v.cat ? catName(v.cat) : s.type === 'income' ? 'הכנסה' : 'הוצאה');
    pushUndo(true);
    const rows = m.rows[s.id] = m.rows[s.id] || [];
    const empty = rows.find(r => r.name === name && (r.amount == null || r.amount === '' || r.est));
    if (empty) { empty.amount = amt; if (v.cat && 'cat' in empty) empty.cat = v.cat; delete empty.est; }
    else { const r = Object.assign(C.newRow(s.type), { name, amount: amt }); if (s.type === 'expense') r.cat = v.cat || ''; if (isNowMonth(ui.year, ui.tab)) { const d = new Date(); r.date = d.getDate() + '/' + (d.getMonth() + 1); } rows.push(r); }
    recompute(); queueSave(true); render();
    setStatus(`נוסף: ${name} ${fmt(amt)} ₪ ✓`);
  }

  /* ---------- sections and categories ---------- */
  function typeOptions(sel) {
    return Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${t.label}: ${t.hint}</option>`).join('');
  }
  const iconPicker = (cur) => `<div class="icons">${C.ICONS.map(ic => `<button type="button" data-pick="icon" data-val="${ic}" class="${ic === cur ? 'on' : ''}" aria-label="${ic}">${ic}</button>`).join('')}</div>`;
  async function addSectionDlg(prev) {
    prev = prev || {};
    const r = await ask('סעיף חדש', { ok: 'הוסף', html: `<div class="stack">
      ${prev.err ? '<p class="neg" style="margin:0">צריך לתת שם לסעיף.</p>' : ''}
      <label><span>שם הסעיף</span><input name="title" placeholder="למשל: רכב, ילדים, דירה להשקעה"></label>
      <label><span>מה הוא?</span><select name="type">${typeOptions(prev.type || 'expense')}</select></label>
      <p class="muted" style="margin:0">הסוג קובע איך הסעיף נספר: הוצאה מורידה מ"נשאר", הכנסה מוסיפה, חיסכון, השקעה ובנק נספרים בשווי הנקי, והלוואה היא חוב.</p>
      <div><span class="muted">אייקון</span>${iconPicker(prev.icon || '📦')}</div></div>`, focus: '[name="title"]' });
    if (!r) return;
    if (!r.title || !r.title.trim()) return addSectionDlg({ err: 1, type: r.type, icon: r.icon });
    pushUndo(true);
    const id = C.addSection(S, r.title.trim(), r.type, { icon: r.icon || '📦' });
    queueSave(true); render();
    setStatus('הסעיף נוסף ✓');
    const el = document.querySelector(`[data-sec="${id}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function editSectionDlg(id) {
    const s = sec(id);
    const has = C.sectionHasData(S, id);
    const keepSel = TYPES[s.type].amount === 'amount';
    const r = await ask('עריכת הסעיף', { ok: 'שמור', html: `<div class="stack">
      <label><span>שם</span><input name="title" value="${esc(s.title)}"></label>
      <label><span>סוג</span><select name="type">${typeOptions(s.type)}</select></label>
      ${keepSel ? `<label><span>כשנפתח חודש חדש, השורות של הסעיף</span><select name="keep">${KEEP.map(([k, l]) => `<option value="${k}"${C.keepOf(s) === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <label class="chk"><input type="checkbox" name="on"${s.on === false ? '' : ' checked'}> להציג ולספור את הסעיף</label>
      <div><span class="muted">אייקון</span>${iconPicker(s.icon)}</div>
      <div class="row"><button type="button" class="danger" data-extra="delete">🗑 מחק את הסעיף${has ? ' ואת השורות שלו' : ''}</button></div></div>` });
    if (!r) return;
    if (r._action === 'delete') {
      if (has && !(await ask(`למחוק את "${s.title}" עם כל השורות שלו בכל החודשים? אפשר לבטל מיד עם ↶.`, { ok: 'מחק', danger: true }))) return;
      pushUndo(true); C.removeSection(S, id); recompute(); queueSave(true); render(); setStatus('הסעיף נמחק (↶ לביטול)'); return;
    }
    if (!r.on && s.on !== false) { const n = monthsWithData(id); if (n && !(await ask(offQuestion(s, n), { ok: 'כבה', danger: true }))) r.on = true; }
    pushUndo(true);
    if (r.title && r.title.trim()) s.title = r.title.trim();
    if (r.type !== s.type) { s.type = r.type; delete s.keep; }
    if (r.keep && keepSel && r.type === s.type) s.keep = r.keep;
    if (r.icon) s.icon = r.icon;
    s.on = !!r.on;
    recompute(); queueSave(true); render();
  }
  async function iconDlg(obj) {
    const r = await ask('בחר אייקון', { ok: 'בחר', html: iconPicker(obj.icon) });
    if (!r || !r.icon) return;
    pushUndo(true); obj.icon = r.icon; queueSave(true); render();
  }
  function moveSection(id, d) {
    const i = S.sections.findIndex(s => s.id === id), j = i + d;
    if (j < 0 || j >= S.sections.length) return;
    pushUndo(true);
    [S.sections[i], S.sections[j]] = [S.sections[j], S.sections[i]];
    queueSave(true); render();
  }
  function addCategory(name, icon) {
    const el = $('#newCat'), v = (name || (el && el.value) || '').trim();
    if (!v) return;
    if (S.categories.some(c => c.name === v)) { setStatus('הקטגוריה כבר קיימת'); return; }
    pushUndo(true); S.categories.push({ id: C.uid(), name: v, icon: icon || '📦', target: null }); queueSave(true); render();
    const n = $('#newCat'); if (n && !name) n.focus();
  }
  async function setUseCats(on) {
    if (!!S.settings.useCats === on) return;
    pushUndo(true);
    S.settings.useCats = on;
    if (on) {
      const o = sec('other') || S.sections.find(s => s.type === 'expense');
      const m = curM() || (() => { const c = C.currentMonth(S, new Date()); return S.years[c.y] && S.years[c.y].months[c.k]; })();
      if (o && m && await ask('להוסיף לחודש הנוכחי שורה לכל קטגוריה ב"' + o.title + '"? כך מקלידים רק סכום לכל קטגוריה.', { ok: 'כן, הוסף', cancel: 'לא' })) {
        o.on = true; if (C.keepOf(o) === 'none') o.keep = 'names';
        const cardsSec = sec('cards');
        if (cardsSec && cardsSec.on !== false && o.id !== 'cards') setTimeout(() => tell('שים לב: אם תקליד גם סכום בשורת הכרטיס וגם סכומים בקטגוריות, אותה הוצאה תיספר פעמיים. אפשר להשאיר את סכום הכרטיס ריק מעכשיו, או לבחור קטגוריה בכל שורת כרטיס. החודשים הקודמים לא השתנו.'), 50);
        const rows = m.rows[o.id] = m.rows[o.id] || [];
        S.categories.forEach(c => { if (!rows.some(r => r.cat === c.id)) rows.push(Object.assign(C.newRow('expense'), { name: c.name, cat: c.id })); });
      }
    }
    recompute(); queueSave(true); render();
  }
  async function targetDlg(id) {
    const c = cat(id); if (!c) return;
    const r = await ask(`יעד חודשי: ${c.icon || ''} ${c.name}`, { ok: 'שמור', html: `<div class="stack"><label><span>כמה אתה רוצה להוציא על זה בחודש?</span>${curWrap('₪', `<input name="t" class="num bigamt" inputmode="decimal" placeholder=" " value="${c.target > 0 ? esc(c.target) : ''}">`)}</label><p class="muted" style="margin:0">משאירים ריק כדי לבטל את היעד.</p></div>`, focus: '[name="t"]' });
    if (!r) return;
    pushUndo(true); const v = numVal(r.t); c.target = v > 0 ? v : null; queueSave(true); render();
  }
  async function openMonth(k) {
    pushUndo(true);
    const op = C.openThrough(S, ui.year, k);
    queueSave(true);
    ui.tab = k; render(); scrollTo(0, 0);
    if (op.length > 1) setStatus('נפתחו גם ' + op.slice(0, -1).map(o => MN[o.k - 1]).join(', ') + ', כדי שלא יידלג חודש');
  }
  function monthsWithData(sid) {
    const s = sec(sid); if (!s) return 0;
    const f = amtField(s.type);
    return C.chainMonths(S).filter(x => C.rowsOf(x.m, sid).some(r => r[f] != null && r[f] !== '' && num(r[f]) !== 0)).length;
  }
  const offQuestion = (s, n) => `לסעיף "${s.title}" יש נתונים ב${n === 1 ? 'חודש אחד' : '-' + n + ' חודשים'}. כיבוי מוריד אותו מכל החישובים, גם בחודשים קודמים (הנתונים עצמם נשמרים, ואפשר להדליק שוב). לכבות?`;
  const INFO = {
    net: 'נשאר = הכנסות פחות הוצאות (הוראות קבע, כרטיסים, הוצאות משתנות ותשלומי הלוואות). העברות פנימיות בין החשבונות שלך לא נספרות כהכנסה.',
    dep: 'הפקדות לחיסכון ולהשקעות לא נחשבות הוצאה, כי הכסף נשאר שלך. "נשאר אחרי ההפקדה" הוא מה שנשאר בעו"ש אחרי שהפקדת.',
    equity: 'שווי נקי = כסף בבנק + חסכונות + השקעות, פחות יתרות ההלוואות. זה כמה שווה כל מה שיש לך.'
  };

  document.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t || t.closest('#modal') || !S || t.closest('.wiz')) return;
    if (staleTab && !(t.id === 'takeOver' || t.id === 'noticeX' || t.id === 'hdrBackup' || t.id === 'doBackup' || t.dataset.tab !== undefined || t.dataset.info)) { readOnlyNote(); return; }
    if (window.ImportUI.active) { if (!t.closest('#top')) return; window.ImportUI.cancel(); } // leaving the import screen from the header or months
    if (t.id === 'undo') return undo();
    if (t.id === 'redo') return redo();
    if (t.id === 'fab' || t.id === 'quickAdd') return quickAdd();
    if (t.id === 'noticeX') { notice = null; render(); return; }
    if (t.id === 'remindOff') { Store.setMeta({ remindOff: new Date().toISOString().slice(0, 10) }); render(); return; }
    if (t.id === 'takeOver') return takeOver();
    if (t.id === 'autoRetry') { await runAuto(); setStatus(autoState === 'on' ? 'הגיבוי האוטומטי נשמר ✓' : '⚠ עדיין נכשל', autoState !== 'on'); return; }
    if (t.id === 'autoResume') { try { if (await Store.autoResume(S)) { autoState = 'on'; setStatus('הגיבוי האוטומטי פעיל ✓'); } else autoState = (await Store.autoStatus()).state; } catch (_) { /* canceled */ } render(); return; }
    if (t.id === 'autoChoose') { try { const n = await Store.autoChoose(S); autoState = 'on'; render(); tell('מעכשיו כל שינוי נשמר לבד גם לקובץ "' + n + '". אם שמרת אותו בתוך תיקיית OneDrive או Google Drive, הוא מגובה גם בענן.\nאחרי כל פתיחה של האפליקציה הדפדפן יבקש אישור בלחיצה אחת.'); } catch (e) { if (!e || e.name !== 'AbortError') tell('לא הצלחתי ליצור קובץ גיבוי: ' + (e && e.message)); } return; }
    if (t.id === 'autoOffBtn') { await Store.autoOff(); autoState = 'off'; render(); setStatus('הגיבוי האוטומטי כובה'); return; }
    if (t.id === 'newsOk') { Store.setMeta({ seenBuild: window.BUILD.n }); render(); return; }
    if (t.id === 'iosTipOff') { Store.setMeta({ iosTipOff: 1 }); render(); return; }
    if (t.id === 'autoOk') { autoNote = null; render(); return; }
    if (t.id === 'autoUndo') {
      const op = (autoNote && autoNote.opened) || [];
      const names = op.map(o => MN[o.k - 1] + ' ' + o.y).join(', ');
      if (op.length && await ask(`לבטל את הפתיחה האוטומטית? ${names} יימחקו, יחד עם מה שהוזן בהם. שאר החודשים לא משתנים, ואפשר לפתוח אותם שוב בלחיצה על החודש.`, { ok: 'בטל פתיחה', danger: true })) {
        pushUndo(true);
        op.forEach(o => { if (S.years[o.y] && S.years[o.y].months) delete S.years[o.y].months[o.k]; });
        Object.keys(S.years).forEach(y => { if (!Object.keys(S.years[y].months || {}).length && Object.keys(S.years).length > 1) delete S.years[y]; });
        S.settings.autoOpen = false; autoNote = null;
        recompute(); ensureUi(); const lm = lastMonth(); ui.tab = lm || 'summary'; queueSave(true); render();
        tell('בוטל. הפתיחה האוטומטית כובתה, ואפשר להדליק אותה שוב בהגדרות ← החודש התקציבי.');
      }
      return;
    }
    if (t.id === 'doBackup' || t.id === 'hdrBackup') { flushSave(); const r = await Store.exportFile(S); if (r.ok) { setStatus('הגיבוי נשמר ✓'); render(); } return; }
    if (t.id === 'doRestore') { $('#fileBackup').click(); return; }
    if (t.id === 'hdrInstall' || t.id === 'doInstall') {
      if (installEvt) { installEvt.prompt(); const c = await installEvt.userChoice.catch(() => null); if (c && c.outcome === 'accepted') { installEvt = null; $('#hdrInstall').hidden = true; } }
      else { ui.tab = 'settings'; render(); }
      return;
    }
    if (t.id === 'hdrImport' || t.id === 'importHere') { window.ImportUI.open(); return; }
    if (t.id === 'printYear') { window.print(); return; }
    if (t.id === 'addSec') return addSectionDlg();
    if (t.id === 'addCat') return addCategory();
    if (t.id === 'newYear') return newYear();
    if (t.id === 'wipe') {
      if (await ask('למחוק את כל הנתונים מהמכשיר הזה? אי אפשר לבטל את זה. אם לא שמרת גיבוי, הנתונים יאבדו.', { ok: 'מחק הכל', danger: true })
        && await ask('בטוח? זה הצעד האחרון, ואין דרך חזרה.', { ok: 'כן, למחוק הכל', danger: true })) {
        await Store.clearAll(); location.reload();
      }
      return;
    }
    if (t.dataset.info) { tell(INFO[t.dataset.info]); return; }
    if (t.dataset.seg) {
      const k = t.dataset.seg, v = t.dataset.val;
      if (k === 'useCats') return setUseCats(v === 'cats');
      pushUndo(true); S.settings[k] = v; applyLook(); queueSave(true); render(); return;
    }
    if (t.dataset.color) { pushUndo(true); S.settings.theme = t.dataset.color; applyLook(); queueSave(true); render(); return; }
    if (t.dataset.snap) {
      const s = await Store.snapshot(t.dataset.snap);
      if (s && C.isValid(s.data) && await ask('לשחזר את העותק מ-' + new Date(s.time).toLocaleString('he-IL') + '? הנתונים הנוכחיים יוחלפו (אפשר לבטל עם ↶).', { ok: 'שחזר' })) {
        pushUndo(true); await Store.snapshotBefore(S, 'לפני שחזור עותק'); await start(s.data, { tab: 'summary', noCatchUp: true }); setStatus('שוחזר ✓');
      }
      return;
    }
    if (t.dataset.tab !== undefined) { ui.tab = /^\d+$/.test(t.dataset.tab) ? +t.dataset.tab : t.dataset.tab; render(); scrollTo(0, 0); return; }
    if (t.dataset.open) { openMonth(+t.dataset.open); if (t.dataset.thenimport) window.ImportUI.open(); return; } // same tap: phones allow the file picker only then
    if (t.dataset.add) return newRowSheet(t.dataset.add);
    if (t.dataset.rowedit) { const [sid, i] = t.dataset.rowedit.split('|'); return rowSheet(sid, i); }
    if (t.dataset.estok) {
      const m = curM(); if (!m) return; pushUndo(true);
      C.rowsOf(m, t.dataset.estok).forEach(r => { delete r.est; }); queueSave(true); render(); setStatus('הסכומים אושרו ✓'); return;
    }
    if (t.dataset.del) {
      const m = curM(); if (!m) return;
      const [sid, i] = t.dataset.del.split('|'), r = m.rows[sid][+i];
      // an empty row goes at once; a row with data asks first
      const filled = r && Object.keys(r).some(k => k !== 'name' && k !== 'manual' && k !== 'gain' && k !== 'cur' && r[k] != null && r[k] !== '' && r[k] !== false && r[k] !== 0);
      if (!filled || await ask('למחוק את השורה' + (r && r.name ? ` "${r.name}"` : '') + '?', { ok: 'מחק', danger: true })) {
        if (curM() !== m || m.rows[sid][+i] !== r) return;
        pushUndo(true); m.rows[sid].splice(+i, 1); recompute(); queueSave(true); render(); setStatus('נמחק (↶ לביטול)');
      }
      return;
    }
    if (t.dataset.reset) {
      const k = +t.dataset.reset;
      if (await ask(`לאפס את ${MN[k - 1]}? כל השורות של החודש נמחקות, והוא ייפתח מחדש מהחודש הקודם. אפשר לבטל עם ↶.`, { ok: 'אפס', danger: true })) {
        pushUndo(true); delete Y().months[k]; await openMonth(k);
      }
      return;
    }
    if (t.dataset.cattarget) return targetDlg(t.dataset.cattarget);
    if (t.dataset.secedit) return editSectionDlg(t.dataset.secedit);
    if (t.dataset.secicon) return iconDlg(sec(t.dataset.secicon));
    if (t.dataset.caticon) return iconDlg(cat(t.dataset.caticon));
    if (t.dataset.secup) return moveSection(t.dataset.secup, -1);
    if (t.dataset.secdown) return moveSection(t.dataset.secdown, 1);
    if (t.dataset.catpreset) { const p = C.CATEGORY_PRESETS.find(x => x[0] === t.dataset.catpreset); return addCategory(p[0], p[1]); }
    if (t.dataset.catdel) {
      const c = cat(t.dataset.catdel);
      if (await ask(`למחוק את הקטגוריה "${c.name}"? שורות שהיו בה יעברו ל"ללא קטגוריה".`, { ok: 'מחק', danger: true })) { pushUndo(true); C.removeCategory(S, c.id); queueSave(true); render(); }
    }
  });

  $('#fileBackup').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let d;
    try { d = JSON.parse(String(await Store.readFile(f)).replace(/^﻿/, '')); } catch (_) { tell('הקובץ הזה אינו גיבוי של תקציב שנתי.'); return; }
    if (!C.isValid(d)) { tell('הקובץ הזה אינו גיבוי של תקציב שנתי.'); return; }
    if (+d.v > C.DATA_V) { tell('הגיבוי נשמר בגרסה חדשה יותר של האפליקציה. סגור ופתח את האפליקציה כדי שתתעדכן, ואז נסה שוב.'); return; }
    if (staleTab) { tell('האפליקציה פתוחה בחלון אחר. לחץ קודם "המשך לעבוד בחלון הזה", ואז פתח את הגיבוי.'); return; }
    if (S && !(await ask(`לפתוח את הגיבוי "${f.name}"? הנתונים שבמכשיר יוחלפו (אפשר לבטל עם ↶, ונשמר עותק בהגדרות).`, { ok: 'פתח' }))) return;
    if (S) { pushUndo(true); await Store.snapshotBefore(S, 'לפני פתיחת קובץ גיבוי'); }
    Store.setMeta({ backup: Date.now() });
    if (window.Wizard && window.Wizard.close) window.Wizard.close();
    await start(d, { tab: undefined });
    setStatus('הגיבוי נפתח ✓');
  });

  async function newYear() {
    const ys = Object.keys(S.years).map(Number);
    const ny = Math.max(...ys) + 1;
    if (!(await ask(`לפתוח את ${ny}? ינואר ייפתח כהעתק של החודש האחרון. אם חסרים חודשים בסוף ${ny - 1}, הם ייפתחו גם, כדי שלא יידלג חודש.`, { ok: 'פתח' }))) return;
    pushUndo(true);
    C.openThrough(S, ny, 1);
    ui.year = ny; ui.tab = 1; queueSave(true); render();
  }

  window.App = {
    get S() { return S; }, ui, MN, esc, money, fmt, I, ask, tell, setStatus, start, render, pushUndo, queueSave, recompute, curM, Y, openMonth,
    catName, sec, flushSave, saveNow, place, get UNDO() { return UNDO; }, undo, redo, evalExpr, numVal, applyLook, phone
  };
  btns();
  // start once every script (onboarding, import) has loaded
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
