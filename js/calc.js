// Calculations for the dynamic budget. Shared by the app (window.BudgetCalc) and the Node tests.
// The budget is made of user-defined sections. Each section has a TYPE, and the type decides
// how its rows count: income, expense, loan, deposit, bank, saving, asset or future money.
(function (root) {
  'use strict';
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[,₪$\s]/g, '')); return isFinite(n) ? n : 0; };
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = () => Math.random().toString(36).slice(2, 9);

  // Field: [key, label, kind, extra]. kind: text (default) | n (number, extra = currency sign) | chk | cat | calc | sel
  // keep: what a new month keeps from the previous one: 'all' (rows and amounts), 'names' (rows, amounts cleared), 'none'.
  const TYPES = {
    income: { label: 'הכנסה', hint: 'משכורת, הכנסות נוספות', keep: 'names', amount: 'amount',
      fields: [['name', 'מקור'], ['amount', 'סכום', 'n', '₪'], ['date', 'תאריך'], ['internal', 'העברה פנימית', 'chk']] },
    expense: { label: 'הוצאה', hint: 'כרטיסים, הוראות קבע, העברות', keep: 'names', amount: 'amount',
      fields: [['name', 'שם'], ['amount', 'סכום', 'n', '₪'], ['date', 'תאריך'], ['cat', 'קטגוריה', 'cat'], ['note', 'הערה']] },
    loan: { label: 'הלוואה', hint: 'תשלום חודשי ויתרה', keep: 'all', amount: 'monthly',
      fields: [['name', 'שם'], ['monthly', 'תשלום חודשי', 'n', '₪'], ['balance', 'יתרה', 'n', '₪'], ['left', 'נותרו', 'calc'], ['cat', 'קטגוריה', 'cat']] },
    deposit: { label: 'הפקדה לחיסכון/השקעה', hint: 'כסף מהעו"ש לשוק ההון או לחיסכון', keep: 'none', amount: 'amount',
      fields: [['name', 'לאן'], ['amount', 'סכום', 'n', '₪'], ['date', 'תאריך'], ['note', 'הערה']] },
    bank: { label: 'יתרה בבנק', hint: 'עו"ש', keep: 'all', amount: 'balance',
      fields: [['name', 'חשבון'], ['balance', 'יתרה', 'n', '₪']] },
    saving: { label: 'חיסכון/קרן', hint: 'פנסיה, השתלמות, גמל, פיקדון', keep: 'all', amount: 'balance',
      fields: [['name', 'שם'], ['monthly', 'הפקדה חודשית', 'n', '₪'], ['balance', 'יתרה', 'n', '₪'], ['fee', 'דמי ניהול']] },
    asset: { label: 'השקעה/נכס', hint: 'תיק השקעות, קריפטו, רכב', keep: 'all', amount: 'value',
      fields: [['name', 'נכס'], ['value', 'שווי', 'n', 'cur'], ['cur', 'מטבע', 'sel', [['ILS', '₪'], ['USD', '$']]]] },
    future: { label: 'כסף עתידי', hint: 'כסף שמגיע בעתיד', keep: 'all', amount: 'amount',
      fields: [['name', 'שם'], ['amount', 'סכום', 'n', '₪'], ['date', 'מועד צפוי'], ['inEquity', 'בהון העצמי', 'chk']] }
  };

  // The sections a new budget can start with (the wizard turns each on or off).
  const DEFAULT_SECTIONS = [
    { id: 'income', title: 'הכנסות', type: 'income', icon: '💼', on: true },
    { id: 'fixed', title: 'הוראות קבע וחשבונות', type: 'expense', keep: 'all', icon: '🧾', on: true },
    { id: 'cards', title: 'כרטיסי אשראי', type: 'expense', keep: 'names', icon: '💳', on: true },
    { id: 'other', title: 'הוצאות משתנות', type: 'expense', keep: 'none', icon: '🛒', on: true },
    { id: 'loans', title: 'הלוואות', type: 'loan', icon: '🏦', on: false },
    { id: 'deposits', title: 'הפקדות לחיסכון והשקעה', type: 'deposit', icon: '📥', on: false },
    { id: 'bank', title: 'יתרה בבנק', type: 'bank', icon: '🏛️', on: true },
    { id: 'savings', title: 'חסכונות וקרנות', type: 'saving', icon: '🐷', on: false },
    { id: 'assets', title: 'השקעות', type: 'asset', icon: '📈', on: false },
    { id: 'future', title: 'כספים עתידיים', type: 'future', icon: '⏳', on: false }
  ];
  // Categories the user can pick (with an icon). The names stay editable.
  const CATEGORY_PRESETS = [['אוכל וסופר', '🛒'], ['דיור וחשבונות', '🏠'], ['רכב ותחבורה', '🚗'], ['ילדים', '👶'], ['בריאות', '💊'],
    ['בילויים ומסעדות', '🍽️'], ['ביגוד וקניות', '👕'], ['ביטוחים', '🛡️'], ['מנויים ותקשורת', '📱'], ['חופשות', '✈️'],
    ['חיות מחמד', '🐶'], ['לימודים', '📚'], ['מתנות ותרומות', '🎁'], ['אחר', '📦']];
  const DEFAULT_CATEGORIES = CATEGORY_PRESETS.map(c => c[0]);
  const ICONS = ['💼', '💰', '🧾', '💳', '🛒', '🏦', '📥', '🏛️', '🐷', '📈', '⏳', '🏠', '🚗', '👶', '💊', '🍽️', '👕', '🛡️', '📱', '✈️',
    '🐶', '📚', '🎁', '📦', '⚡', '💧', '🔥', '🎓', '🏋️', '🎮', '☕', '🚌', '⛽', '🧹', '💇', '🏖️', '🪙', '💵', '🧸', '❤️'];
  const SETTINGS_DEFAULT = () => ({ includeFuture: false, useCats: false, autoOpen: true, theme: 'blue', mode: 'auto', textSize: 'normal' });

  // opts: { year, payDay, on: [section ids], cats: [category names] (picked = expenses tracked by category) }
  function newBudget(opts = {}) {
    const y = opts.year || new Date().getFullYear();
    const picked = Array.isArray(opts.cats) && opts.cats.length ? opts.cats : null;
    const S = {
      app: 'budget-for-all', v: 2,
      profile: { payDay: opts.payDay || 1 },
      settings: Object.assign(SETTINGS_DEFAULT(), { useCats: !!picked }),
      sections: clone(DEFAULT_SECTIONS),
      categories: (picked || DEFAULT_CATEGORIES).map(name => { const p = CATEGORY_PRESETS.find(c => c[0] === name); return { id: uid(), name, icon: p ? p[1] : '📦', target: null }; }),
      mappings: [], rules: [], updates: [],
      years: { [y]: { months: {} } }
    };
    if (Array.isArray(opts.on)) S.sections.forEach(s => { s.on = opts.on.includes(s.id); });
    // by category: one row per category in "variable expenses", so typing a total is enough
    if (picked) { const o = S.sections.find(s => s.id === 'other'); o.on = true; o.keep = 'names'; }
    return S;
  }
  // First month of a new budget: a few named rows, so the user only types amounts.
  function seedMonth(S) {
    const m = emptyMonth(S);
    const add = (id, name, extra) => { const s = S.sections.find(x => x.id === id); if (s && s.on !== false) m.rows[id].push(Object.assign(newRow(s.type), { name }, extra || {})); };
    add('income', 'משכורת');
    if (S.settings.useCats) S.categories.forEach(c => add('other', c.name, { cat: c.id }));
    else add('cards', 'כרטיס אשראי');
    add('bank', 'עו"ש', { manual: true });
    return m;
  }
  // Older saved data gets the newer fields (only the unused card charge day is dropped).
  const DATA_V = 2;
  function migrate(S) {
    if (+S.v > DATA_V) return S; // written by a newer version: leave it exactly as it is
    S.settings = Object.assign(SETTINGS_DEFAULT(), S.settings || {});
    S.profile = S.profile || {}; if (!S.profile.payDay) S.profile.payDay = 1; delete S.profile.chargeDay;
    ['mappings', 'rules', 'updates', 'categories'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
    S.sections.forEach(s => { if (!s.icon) { const d = DEFAULT_SECTIONS.find(x => x.id === s.id) || DEFAULT_SECTIONS.find(x => x.type === s.type); s.icon = d ? d.icon : '📦'; } });
    S.categories.forEach(c => { if (!c.icon) { const p = CATEGORY_PRESETS.find(x => x[0] === c.name); c.icon = p ? p[1] : '📦'; } if (c.target === undefined) c.target = null; });
    Object.keys(S.years || {}).forEach(y => { if (!S.years[y].months) S.years[y].months = {}; });
    S.v = 2;
    return S;
  }

  function newRow(type) {
    const r = { name: '' };
    TYPES[type].fields.forEach(([k, , kind]) => {
      if (k === 'name' || kind === 'calc') return;
      r[k] = kind === 'n' ? null : kind === 'chk' ? false : k === 'cur' ? 'ILS' : '';
    });
    if (type === 'future') r.inEquity = false;
    if (type === 'bank') r.manual = false;
    if (type === 'saving') { r.gain = 0; }
    return r;
  }
  function emptyMonth(S) {
    const rows = {};
    (S.sections || []).forEach(s => { rows[s.id] = []; });
    return { period: '', rate: 3.6, rows };
  }
  const active = S => (S.sections || []).filter(s => s.on !== false);
  const rowsOf = (m, id) => (m && m.rows && m.rows[id]) || [];
  const keepOf = s => s.keep || TYPES[s.type].keep;

  // Monthly totals.
  function calc(m, S) {
    const t = { income: 0, internal: 0, expense: 0, deposits: 0, debts: 0, bank: 0, savings: 0, assets: 0, assetsUsd: 0,
      future: 0, futureEq: 0, fundsMonthly: 0, bySec: {}, byCat: {} };
    const rate = num(m.rate);
    active(S).forEach(s => {
      let sec = 0;
      rowsOf(m, s.id).forEach(r => {
        switch (s.type) {
          case 'income': { const a = num(r.amount); if (r.internal) t.internal += a; else { t.income += a; sec += a; } break; }
          case 'expense': { const a = num(r.amount); t.expense += a; sec += a; addCat(t, r.cat, a); break; }
          case 'loan': { const a = num(r.monthly); t.expense += a; sec += a; t.debts += num(r.balance); addCat(t, r.cat, a); break; }
          case 'deposit': { const a = num(r.amount); t.deposits += a; sec += a; break; }
          case 'bank': { const a = num(r.balance); t.bank += a; sec += a; break; }
          case 'saving': { const a = num(r.balance); t.savings += a; sec += a; t.fundsMonthly += num(r.monthly); break; }
          case 'asset': { const usd = r.cur === 'USD', v = num(r.value) * (usd ? rate : 1); t.assets += v; if (usd) t.assetsUsd += num(r.value); sec += v; break; }
          case 'future': { const a = num(r.amount); t.future += a; if (r.inEquity) t.futureEq += a; sec += a; break; }
        }
      });
      t.bySec[s.id] = r2(sec);
    });
    t.net = t.income - t.expense;                     // נשאר בנטו
    t.depNet = Math.max(0, t.deposits - t.internal);  // a deposit funded by an internal transfer is not new money
    t.remain = t.net - t.depNet;                      // נשאר בפועל
    t.cashFlow = t.income + t.internal - t.expense - t.deposits; // the real change in the bank account
    t.futureIn = S.settings && S.settings.includeFuture ? t.future : t.futureEq;
    t.equity = t.bank + t.savings + t.assets - t.debts + t.futureIn;
    Object.keys(t).forEach(k => { if (typeof t[k] === 'number') t[k] = r2(t[k]); });
    return t;
  }
  function addCat(t, cat, a) { const k = cat || ''; t.byCat[k] = r2((t.byCat[k] || 0) + a); }

  // All months of all years, in time order: [{ y, k, m }]
  function chainMonths(S) {
    const out = [];
    Object.keys(S.years || {}).map(Number).sort((a, b) => a - b).forEach(y => {
      const ms = (S.years[y] || {}).months || {};
      Object.keys(ms).map(Number).sort((a, b) => a - b).forEach(k => out.push({ y, k, m: ms[k] }));
    });
    return out;
  }
  const isPrevMonth = (a, b) => (a.y === b.y && a.k === b.k - 1) || (a.y === b.y - 1 && a.k === 12 && b.k === 1);
  const nameKey = r => String(r && r.name != null ? r.name : '').trim();
  // For each row of section id in month m, the row with the same name (same occurrence) in month prev, or null.
  function matchRows(m, prev, id) {
    const used = new Set(), pr = rowsOf(prev, id);
    return rowsOf(m, id).map(r => {
      if (!prev) return null;
      const i = pr.findIndex((p, j) => !used.has(j) && nameKey(p) === nameKey(r));
      if (i < 0) return null;
      used.add(i); return pr[i];
    });
  }
  // The chain from month to month:
  //  - saving: balance = previous balance + monthly deposit + gain. A typed balance is kept by moving the difference into gain.
  //  - bank: the first bank row is automatic (previous balance + this month's cash flow) unless typed by hand (manual).
  function recompute(S) {
    const list = chainMonths(S);
    list.forEach((cur, idx) => {
      const p = idx > 0 && isPrevMonth(list[idx - 1], cur) ? list[idx - 1].m : null;
      let firstBank = true;
      (S.sections || []).forEach(s => {
        if (s.type !== 'saving' && s.type !== 'bank' && s.type !== 'loan') return;
        const links = matchRows(cur.m, p, s.id);
        rowsOf(cur.m, s.id).forEach((r, i) => {
          const pr = links[i];
          // loan: the balance continues from the previous month minus this month's payment, unless typed this month (balTyped)
          if (s.type === 'loan') {
            if (r.balTyped === false && pr && pr.balance != null && pr.balance !== '') r.balance = Math.max(0, r2(num(pr.balance) - num(r.monthly)));
            return;
          }
          if (s.type === 'bank') {
            const auto = firstBank && s.on !== false; firstBank = false;
            if (r.manual == null) r.manual = true;
            if (auto && !r.manual && pr) r.balance = r2(num(pr.balance) + calc(cur.m, S).cashFlow);
            return;
          }
          if (r.gain == null || r.gain === '') r.gain = 0;
          if (pr) { r.balance = r2(num(pr.balance) + num(r.monthly) + num(r.gain)); delete r.open; }
          else {
            if (r.open == null || r.open === '') r.open = r2(num(r.balance) - num(r.monthly) - num(r.gain));
            r.balance = r2(num(r.open) + num(r.monthly) + num(r.gain));
          }
        });
      });
    });
    return S;
  }
  function prevRow(S, y, k, id, i) {
    const list = chainMonths(S), idx = list.findIndex(x => x.y === +y && x.k === +k);
    if (idx <= 0 || !isPrevMonth(list[idx - 1], list[idx])) return null;
    return matchRows(list[idx].m, list[idx - 1].m, id)[i] || null;
  }
  // Typing a saving balance (from a statement): keep the chain, put the difference into gain.
  function setSavingBalance(S, y, k, id, i, balance) {
    const r = S.years[y].months[k].rows[id][i];
    const pr = prevRow(S, y, k, id, i);
    if (balance == null) { r.gain = 0; return recompute(S); }
    const start = pr ? num(pr.balance) : num(r.open);
    r.gain = r2(num(balance) - start - num(r.monthly));
    return recompute(S);
  }

  // Opening a month copies the previous one, section by section, by its keep rule.
  function deriveMonth(prev, S) {
    const m = emptyMonth(S);
    m.rate = prev.rate;
    (S.sections || []).forEach(s => {
      const src = rowsOf(prev, s.id), keep = keepOf(s);
      let rows;
      if (keep === 'none') rows = [];
      else if (s.type === 'income') rows = src.filter(r => !r.internal).map(r => Object.assign(clone(r), { amount: keep === 'all' ? r.amount : null, date: keep === 'all' ? r.date : '' }));
      else if (keep === 'names' && TYPES[s.type].amount === 'amount') rows = src.map(r => Object.assign(clone(r), { amount: null, date: '', note: '' }));
      else rows = clone(src);
      rows.forEach(r => {
        delete r.est; delete r.imp; delete r.impFill; delete r.impPrev; delete r.impField;
        // copied amounts are a guess until the user confirms them or an import replaces them
        if ((s.type === 'expense' || s.type === 'income') && r.amount != null && r.amount !== '') r.est = 1;
        if (s.type === 'asset' && r.value != null && r.value !== '') r.est = 1;
        if (s.type === 'loan') { if (r.balance != null && r.balance !== '') r.balance = Math.max(0, r2(num(r.balance) - num(r.monthly))); r.balTyped = false; }
        if (s.type === 'saving') { r.gain = 0; delete r.open; }
        if (s.type === 'bank') r.manual = false;
      });
      m.rows[s.id] = rows;
    });
    return m;
  }

  // The budget month running on `today`: from payDay of month k to the day before payDay of month k+1.
  function currentMonth(S, today) {
    const pd = Math.min(28, Math.max(1, num(S.profile && S.profile.payDay) || 1));
    let y = today.getFullYear(), k = today.getMonth() + 1;
    if (today.getDate() < pd) { k--; if (k < 1) { k = 12; y--; } }
    return { y, k };
  }
  const ord = (y, k) => y * 12 + (k - 1);
  // Opens the months that have arrived since the last one, each a copy of the one before it.
  // A new budget gets the running month. A gap opens every missing month, at most the last 12.
  function catchUp(S, today) {
    const cur = currentMonth(S, today), list = chainMonths(S), opened = [];
    const put = (y, k, m) => { S.years[y] = S.years[y] || { months: {} }; S.years[y].months = S.years[y].months || {}; S.years[y].months[k] = m; opened.push({ y, k }); };
    if (!list.length) { put(cur.y, cur.k, seedMonth(S)); recompute(S); return opened; }
    const last = list[list.length - 1];
    const to = ord(cur.y, cur.k), from = Math.max(ord(last.y, last.k) + 1, to - 11);
    if (to < from) return opened;
    let prev = last.m;
    for (let o = from; o <= to; o++) { const m = deriveMonth(prev, S); put(Math.floor(o / 12), o % 12 + 1, m); prev = m; }
    recompute(S);
    return opened;
  }
  // Opens month (y,k) and every missing month before it, each a copy of the one before, so no payment or cash flow is skipped.
  function openThrough(S, y, k) {
    const list = chainMonths(S), target = ord(y, k), opened = [];
    const before = list.filter(x => ord(x.y, x.k) < target);
    const put = (yy, kk, m) => { S.years[yy] = S.years[yy] || { months: {} }; S.years[yy].months = S.years[yy].months || {}; S.years[yy].months[kk] = m; opened.push({ y: yy, k: kk }); };
    if (!before.length) { put(y, k, seedMonth(S)); recompute(S); return opened; }
    const last = before[before.length - 1];
    let prev = last.m;
    for (let o = Math.max(ord(last.y, last.k) + 1, target - 23); o <= target; o++) {
      const yy = Math.floor(o / 12), kk = o % 12 + 1;
      if (S.years[yy] && S.years[yy].months && S.years[yy].months[kk]) { prev = S.years[yy].months[kk]; continue; }
      const m = deriveMonth(prev, S); put(yy, kk, m); prev = m;
    }
    recompute(S);
    return opened;
  }
  // has the budget month started yet (on `today`)?
  function hasStarted(S, y, k, today) {
    const pd = Math.min(28, Math.max(1, num(S.profile && S.profile.payDay) || 1));
    return new Date(+y, k - 1, pd) <= today;
  }
  // Short tips, only once there are 3 earlier months with data.
  function insights(S, y, k) {
    const list = chainMonths(S), idx = list.findIndex(x => x.y === +y && x.k === +k);
    if (idx < 3) return [];
    const has = c => c.income || c.expense;
    const prev = list.slice(0, idx).map(x => calc(x.m, S)).filter(has).slice(-3);
    if (prev.length < 3) return [];
    const c = calc(list[idx].m, S), out = [];
    const avgExp = prev.reduce((a, x) => a + x.expense, 0) / 3;
    if (c.expense && avgExp && c.expense > avgExp * 1.15 && c.expense - avgExp > 300) out.push({ kind: 'warn', text: 'ההוצאות החודש גבוהות ב-' + Math.round((c.expense / avgExp - 1) * 100) + '% מהממוצע של 3 החודשים הקודמים.' });
    Object.keys(c.byCat).forEach(cat => {
      if (!cat) return;
      const avg = prev.reduce((a, x) => a + (x.byCat[cat] || 0), 0) / 3, v = c.byCat[cat];
      const ct = (S.categories || []).find(x => x.id === cat);
      if (ct && avg > 0 && v > avg * 1.2 && v - avg > 200) out.push({ kind: 'warn', text: 'על ' + ct.name + ' הוצאת ' + Math.round((v / avg - 1) * 100) + '% יותר מהממוצע.' });
    });
    const all = list.slice(0, idx + 1).map(x => calc(x.m, S)).filter(has);
    let streak = 0; for (let i = all.length - 1; i >= 0 && all[i].net > 0; i--) streak++;
    if (streak >= 3) out.push({ kind: 'ok', text: streak + ' חודשים ברצף בפלוס.' });
    return out.slice(0, 3);
  }

  // Loan: payments left = balance / monthly payment.
  function loanLeft(r) {
    if (r.balance == null || r.balance === '' || !(num(r.monthly) > 0)) return '';
    const n = Math.ceil(num(r.balance) / num(r.monthly) - 0.005);
    return n <= 0 ? 'שולמה' : n + ' חודשים';
  }

  // Is the budget month (y,k) still running on `today`? A month runs from payDay of month k to payDay of month k+1.
  function isEstimate(S, y, k, today) {
    if (!today) return false;
    const pd = Math.min(28, Math.max(1, num(S.profile && S.profile.payDay) || 1));
    return new Date(+y, k, pd) > today;
  }

  // Year summary.
  function yearSummary(S, y, today) {
    const yr = S.years[y] || { months: {} };
    const act = Object.keys(yr.months || {}).map(Number).sort((a, b) => a - b).map(k => {
      const m = yr.months[k], c = calc(m, S);
      return { k, m, c, est: isEstimate(S, y, k, today) };
    });
    const withData = act.filter(x => x.c.income || x.c.expense || x.c.deposits || x.c.equity);
    if (!withData.length) return { act: withData, empty: true };
    const sum = f => r2(withData.reduce((s, x) => s + f(x), 0));
    const byCat = {};
    withData.forEach(x => Object.keys(x.c.byCat).forEach(c => { byCat[c] = r2((byCat[c] || 0) + x.c.byCat[c]); }));
    const first = withData[0], last = withData[withData.length - 1];
    // assets: value per month and the market change (= change in value minus deposits of that month)
    let prev = yr.openAssets != null && yr.openAssets !== '' ? num(yr.openAssets) : null;
    const open = prev;
    const assets = withData.map(x => {
      const v = x.c.assets, dep = x.c.deposits;
      const gain = prev == null ? null : r2(v - prev - dep);
      const base = prev == null ? 0 : prev + dep;
      prev = v;
      return { k: x.k, value: v, dep, gain, pct: base ? gain / base * 100 : null, est: x.est };
    });
    const real = assets.filter(a => !a.est && a.gain != null);
    const gainReal = real.length ? r2(real.reduce((s, a) => s + a.gain, 0)) : null;
    return {
      act: withData, empty: false, first, last, byCat, assets, openAssets: open, gainReal,
      tInc: sum(x => x.c.income), tExp: sum(x => x.c.expense), tDep: sum(x => x.c.deposits),
      tNet: sum(x => x.c.net), tRemain: sum(x => x.c.remain), e0: first.c.equity, e1: last.c.equity
    };
  }

  // Changing a section: delete keeps nothing; rename/type changes stay in S.sections only.
  function addSection(S, title, type, opts = {}) {
    const id = 's' + uid();
    S.sections.push(Object.assign({ id, title, type, on: true }, opts));
    chainMonths(S).forEach(({ m }) => { m.rows = m.rows || {}; m.rows[id] = []; });
    return id;
  }
  function removeSection(S, id) {
    S.sections = S.sections.filter(s => s.id !== id);
    chainMonths(S).forEach(({ m }) => { if (m.rows) delete m.rows[id]; });
  }
  function sectionHasData(S, id) {
    return chainMonths(S).some(({ m }) => rowsOf(m, id).length > 0);
  }
  function removeCategory(S, catId) {
    S.categories = S.categories.filter(c => c.id !== catId);
    chainMonths(S).forEach(({ m }) => Object.values(m.rows || {}).forEach(rows => rows.forEach(r => { if (r.cat === catId) r.cat = ''; })));
  }

  // deep enough that a damaged or hostile file is refused with a message instead of breaking the app later
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const SAFE_ID = /^[\w-]{1,40}$/;
  const isValid = d => isObj(d) && d.app === 'budget-for-all' && Array.isArray(d.sections) && isObj(d.years)
    && d.sections.every(s => isObj(s) && typeof s.id === 'string' && SAFE_ID.test(s.id) && Object.prototype.hasOwnProperty.call(TYPES, s.type))
    && (d.categories == null || (Array.isArray(d.categories) && d.categories.every(c => isObj(c) && typeof c.id === 'string' && SAFE_ID.test(c.id))))
    && Object.keys(d.years).every(y => /^\d{4}$/.test(y) && isObj(d.years[y]) && (d.years[y].months == null || (isObj(d.years[y].months)
      && Object.keys(d.years[y].months).every(k => isObj(d.years[y].months[k]) && (d.years[y].months[k].rows == null || (isObj(d.years[y].months[k].rows)
        && Object.values(d.years[y].months[k].rows).every(rs => Array.isArray(rs) && rs.every(isObj))))))));

  const api = { num, r2, clone, uid, TYPES, DEFAULT_SECTIONS, DEFAULT_CATEGORIES, CATEGORY_PRESETS, ICONS, SETTINGS_DEFAULT,
    DATA_V, newBudget, seedMonth, migrate, newRow, emptyMonth, active, rowsOf, keepOf,
    calc, chainMonths, recompute, prevRow, setSavingBalance, deriveMonth, currentMonth, catchUp, openThrough, hasStarted, insights, loanLeft, isEstimate, yearSummary,
    addSection, removeSection, sectionHasData, removeCategory, isValid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BudgetCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
