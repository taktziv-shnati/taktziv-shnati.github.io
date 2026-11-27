// Reading bank and credit-card files (xlsx / xls / csv) inside the browser, and sorting their lines into the budget.
// Nothing leaves the device. Works in the browser (window.BudgetImport) and in Node (tests).
(function (root) {
  'use strict';
  const XLSX = root.XLSX || (typeof require !== 'undefined' ? require('../vendor/xlsx.full.min.js') : null);
  const C = root.BudgetCalc || (typeof require !== 'undefined' ? require('./calc.js') : null);
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const norm = s => String(s == null ? '' : s).replace(/[‎‏‪-‮⁦-⁩"'״׳`]/g, '').replace(/\s+/g, ' ').trim();

  /* ---------- reading the file into a table ---------- */
  function readTable(data, fileName) {
    const isText = typeof data === 'string';
    const wb = XLSX.read(data, isText ? { type: 'string', raw: true } : { type: 'array', cellDates: true, codepage: 1255 });
    // the sheet with the most filled rows
    let best = null;
    wb.SheetNames.forEach(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false });
      const filled = rows.filter(r => r.some(c => c !== '' && c != null)).length;
      if (!best || filled > best.filled) best = { name: n, rows, filled };
    });
    if (!best) throw new Error('בקובץ אין טבלה');
    return { rows: best.rows.map(r => r.map(c => typeof c === 'string' ? norm(c) : c)), sheet: best.name, fileName };
  }

  /* ---------- the header row and the column roles ---------- */
  const WORDS = {
    date: /תאריך|date/i,
    desc: /תיאור|פרטים|שם בית|בית העסק|בית עסק|הפעולה|פעולה|תאור|description|merchant/i,
    debit: /חובה|בחובה|debit|withdraw/i,
    credit: /זכות|בזכות|credit|deposit/i,
    amount: /סכום|amount|sum/i,
    balance: /יתרה|balance/i
  };
  function findHeader(rows) {
    let best = { idx: -1, score: 0 };
    rows.slice(0, 40).forEach((r, idx) => {
      const cells = r.map(c => typeof c === 'string' ? c : '');
      let score = 0;
      Object.values(WORDS).forEach(re => { if (cells.some(c => c && c.length < 40 && re.test(c))) score++; });
      if (score > best.score) best = { idx, score };
    });
    return best.score >= 2 ? best.idx : -1;
  }
  const signature = header => header.map(h => norm(h).replace(/\d+/g, '')).filter(Boolean).join('|');

  // roles: date | desc | amount | debit | credit | balance | ignore
  function guessRoles(header) {
    const roles = header.map(() => 'ignore');
    const take = (re, role, prefer) => {
      let idx = header.findIndex((h, i) => roles[i] === 'ignore' && typeof h === 'string' && prefer && prefer.test(h) && re.test(h));
      if (idx < 0) idx = header.findIndex((h, i) => roles[i] === 'ignore' && typeof h === 'string' && re.test(h));
      if (idx >= 0) roles[idx] = role;
      return idx;
    };
    take(WORDS.balance, 'balance');
    take(WORDS.date, 'date', /^תאריך$|עסקה|פעולה/);
    const d = take(WORDS.debit, 'debit'), c = take(WORDS.credit, 'credit');
    if (d < 0 || c < 0) { if (d >= 0) roles[d] = 'ignore'; if (c >= 0) roles[c] = 'ignore'; take(WORDS.amount, 'amount', /חיוב/); }
    take(WORDS.desc, 'desc', /בית|תיאור|פרטים/);
    return roles;
  }
  function guessKind(header, roles) {
    const h = header.join(' ');
    if (roles.includes('balance') || roles.includes('debit')) return 'bank';
    if (/בית עסק|בית העסק|כרטיס|עסקה|merchant/i.test(h)) return 'card';
    return 'bank';
  }

  /* ---------- values ---------- */
  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const s = norm(v);
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (m) {
      let y = +m[3], dd = +m[1], mm = +m[2]; if (y < 100) y += 2000;
      if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd]; // an American month/day file
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      const d = new Date(y, mm - 1, dd); return isNaN(d) || d.getMonth() !== mm - 1 ? null : d;
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null; }
    return null;
  }
  function parseNum(v) {
    if (typeof v === 'number') return v;
    // a typographic minus or dash, and the invisible direction marks that Hebrew exports add, count as plain text
    let s = norm(v).replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[₪$€,\s]|ש["״]ח|ILS|NIS/gi, '');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
  }
  // Remove personal identifiers from bank descriptions (ID numbers, long account numbers).
  function cleanDesc(s) {
    return norm(s)
      .replace(/(מזהה|ת\.?ז\.?|ת"ז|תעודת זהות)\s*:?\s*\d{5,}/g, '')
      .replace(/\d{7,}/g, m => '…' + m.slice(-4))
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------- turning a table + mapping into transactions ---------- */
  // mapping: { kind: 'bank'|'card', header: idx, roles: [...], name }
  // returns [{ date, desc, amount }] where amount > 0 is money in (bank) or a charge (card).
  function transactions(table, mapping) {
    const R = mapping.roles, col = role => R.indexOf(role);
    const iD = col('date'), iT = col('desc'), iA = col('amount'), iDb = col('debit'), iCr = col('credit'), iB = col('balance');
    const out = [];
    table.rows.slice(mapping.header + 1).forEach(r => {
      const date = iD >= 0 ? parseDate(r[iD]) : null;
      let amount = null;
      if (iA >= 0) amount = parseNum(r[iA]);
      else if (iDb >= 0 || iCr >= 0) {
        const db = iDb >= 0 ? parseNum(r[iDb]) : null, cr = iCr >= 0 ? parseNum(r[iCr]) : null;
        if (db == null && cr == null) amount = null;
        else amount = (cr || 0) - Math.abs(db || 0);
      }
      if (!date || amount == null || amount === 0) return; // totals, notes and empty lines have no date or amount
      const t = { date, desc: cleanDesc(iT >= 0 ? r[iT] : '') || 'ללא תיאור', amount: r2(amount) };
      if (iB >= 0) { const b = parseNum(r[iB]); if (b != null) t.balance = b; }
      out.push(t);
    });
    // a bank file with one amount column: most banks show money out as negative; if all are positive, there is nothing to tell apart
    return out;
  }

  /* ---------- budget month ---------- */
  function period(S, y, k) {
    const pd = Math.min(28, Math.max(1, +S.profile.payDay || 1));
    return { from: new Date(y, k - 1, pd), to: new Date(y, k, pd) }; // [from, to)
  }
  const inPeriod = (d, p) => d >= p.from && d < p.to;
  // The budget month that most of the transactions fall in.
  function bestMonth(S, txs) {
    const cnt = {};
    txs.forEach(t => {
      const pd = Math.min(28, Math.max(1, +S.profile.payDay || 1));
      const d = new Date(t.date); if (d.getDate() < pd) d.setMonth(d.getMonth() - 1);
      const key = d.getFullYear() + '-' + (d.getMonth() + 1); cnt[key] = (cnt[key] || 0) + 1;
    });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const [y, k] = top[0].split('-').map(Number);
    return { y, k };
  }

  /* ---------- sorting lines into sections ---------- */
  const ruleKey = desc => norm(desc).replace(/…\d{4}/g, '').replace(/\d+/g, '#').replace(/[^\p{L}#\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const CARD_RE = /ישראכרט|מקס|max|כאל|cal|לאומי קארד|ויזה|visa|אמריקן|אמקס|amex|דיינרס|diners|כרטיס|כ\.אשראי|מסטרקארד|mastercard/i;
  const GENERIC_RE = /העברה|העב'|ביט|bit|פייבוקס|paybox|מזומן|כספומט|משיכה|הפקדה|שיק|צ'ק|העברת/i;
  const LOAN_RE = /הלוואה|הלוו|החזר הלו/i;
  const SALARY_RE = /משכורת|שכר|salary/i;

  function firstOfType(S, type, prefer) {
    const act = C.active(S).filter(s => s.type === type);
    return (prefer && act.find(s => s.id === prefer)) || act[0] || null;
  }
  const last4 = s => (String(s).match(/(\d{4})(?!.*\d{4})/) || [])[1];

  // Proposals for bank lines: [{ t, sec, row, cat, status: 'ok'|'ask', why }]
  function classifyBank(S, m, txs, opts = {}) {
    const rules = S.rules || [];
    const income = firstOfType(S, 'income'), other = firstOfType(S, 'expense', 'other'), cards = C.active(S).find(s => s.id === 'cards') || other,
      fixed = firstOfType(S, 'expense', 'fixed'), loans = firstOfType(S, 'loan'), deposit = firstOfType(S, 'deposit');
    const rowsOf = id => (id && m.rows[id]) || [];
    const nameHit = (id, desc) => rowsOf(id).find(r => r.name && r.name.length >= 2 && (norm(desc).includes(norm(r.name)) || norm(r.name).includes(norm(desc))));
    return txs.map(t => {
      const key = ruleKey(t.desc);
      const rule = rules.find(r => r.key === key && (r.sign || 1) === Math.sign(t.amount));
      if (rule) {
        if (rule.to === 'ignore' || rule.to === 'internal') return { t, to: rule.to, status: 'ok', why: 'לפי מה שבחרת בעבר' };
        if (C.active(S).some(s => s.id === rule.to)) return { t, to: rule.to, row: rule.row || null, cat: rule.cat || '', status: 'ok', why: 'לפי מה שבחרת בעבר', card: !!rule.isCard };
      }
      if (t.amount > 0) {
        const hit = income && nameHit(income.id, t.desc);
        if (hit) return { t, to: income.id, row: hit.name, status: 'ok', why: 'שם מוכר' };
        if (income && SALARY_RE.test(t.desc)) return { t, to: income.id, row: rowsOf(income.id).find(r => SALARY_RE.test(r.name)) ? rowsOf(income.id).find(r => SALARY_RE.test(r.name)).name : 'משכורת', status: 'ok', why: 'משכורת' };
        return { t, to: income ? income.id : 'ignore', status: 'ask', why: 'כסף שנכנס: הכנסה, או העברה פנימית מחשבון אחר?' };
      }
      // money out
      const a = Math.abs(t.amount);
      const l4 = last4(t.desc);
      if (cards && (CARD_RE.test(t.desc) || (l4 && rowsOf(cards.id).some(r => last4(r.name) === l4)))) {
        const hit = rowsOf(cards.id).find(r => l4 && last4(r.name) === l4) || nameHit(cards.id, t.desc);
        return { t, to: cards.id, row: hit ? hit.name : (opts.cardName ? opts.cardName(t.desc) : 'כרטיס אשראי'), status: hit ? 'ok' : 'ask', why: hit ? 'חיוב כרטיס' : 'חיוב כרטיס אשראי: איזה כרטיס?', card: true, amount: a };
      }
      for (const s of [fixed, loans, deposit, other].filter(Boolean)) {
        const hit = nameHit(s.id, t.desc);
        if (hit) return { t, to: s.id, row: hit.name, cat: hit.cat || '', status: 'ok', why: 'שם מוכר' };
      }
      if (loans && LOAN_RE.test(t.desc)) return { t, to: loans.id, row: t.desc, status: 'ask', why: 'נראה כמו הלוואה' };
      const target = other || fixed || cards;
      return { t, to: target ? target.id : 'ignore', status: GENERIC_RE.test(t.desc) ? 'ask' : 'ok', why: GENERIC_RE.test(t.desc) ? 'העברה או מזומן בלי שם ברור: מה זה?' : 'הוצאה' };
    });
  }

  // Card statement lines → grouped by category (merchant rules give the category).
  function classifyCard(S, txs) {
    const rules = S.rules || [];
    return txs.map(t => {
      const rule = rules.find(r => r.key === ruleKey(t.desc) && r.card);
      return { t, cat: rule ? rule.cat : '', status: rule ? 'ok' : 'new' };
    });
  }

  /* ---------- applying to the month ---------- */
  // Rows made by an earlier import of this month are removed first, so importing again never doubles anything.
  function clearImported(m) {
    Object.keys(m.rows || {}).forEach(id => {
      m.rows[id] = m.rows[id].filter(r => !r.imp);
      m.rows[id].forEach(r => {
        if (!r.impFill) return;
        const f = r.impField || 'amount';
        r[f] = r.impPrev === undefined ? null : r.impPrev;
        delete r.impFill; delete r.impPrev; delete r.impField;
      });
    });
  }
  function addAmount(S, m, secId, name, amount, extra = {}) {
    const s = C.active(S).find(x => x.id === secId); if (!s) return;
    const rows = m.rows[secId] = m.rows[secId] || [];
    const field = s.type === 'loan' ? 'monthly' : 'amount';
    // a row of the same name (and category) that this import has not touched yet gets the amount;
    // its earlier value is kept aside, so importing again restores it first
    const sameCat = x => extra.cat == null || !x.cat || (x.cat || '') === (extra.cat || '');
    let r = rows.find(x => x.name === name && sameCat(x) && (x.imp || x.impFill)) || rows.find(x => x.name === name && sameCat(x) && !x.imp && !x.impFill);
    if (!r) { r = Object.assign(C.newRow(s.type), { name, imp: 1 }); rows.push(r); r[field] = r2(amount); }
    else if (!r.imp && !r.impFill) { r.impFill = 1; r.impPrev = r[field] == null ? null : r[field]; r.impField = field; r[field] = r2(amount); }
    else r[field] = r2((+r[field] || 0) + amount);
    delete r.est; // a real amount from a document is not a guess
    if (extra.cat != null && 'cat' in r) r.cat = extra.cat;
    if (extra.date && 'date' in r && !r.date) r.date = extra.date;
    if (extra.internal) r.internal = true;
  }
  const dstr = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');

  // plan: { bank: [proposal], cards: [{ cardName, lines: [{t, cat}] }], cash, bankBalance }
  function apply(S, m, plan) {
    clearImported(m);
    const cardFiles = new Set((plan.cards || []).map(c => c.cardName));
    (plan.bank || []).forEach(p => {
      if (p.to === 'ignore') return;
      if (p.to === 'internal') { const inc = firstOfType(S, 'income'); if (inc) addAmount(S, m, inc.id, 'העברה פנימית', p.t.amount, { internal: true }); return; }
      if (p.card && cardFiles.has(p.row)) return; // the card's own statement gives its lines
      const s = C.active(S).find(x => x.id === p.to); if (!s) return;
      const amt = Math.abs(p.t.amount);
      addAmount(S, m, s.id, p.row || p.t.desc, amt, { cat: s.type === 'expense' || s.type === 'loan' ? (p.cat || '') : undefined, date: dstr(p.t.date) });
    });
    const cards = C.active(S).find(s => s.id === 'cards');
    const other = firstOfType(S, 'expense', 'other');
    (plan.cards || []).forEach(c => {
      const byCat = {};
      c.lines.forEach(l => { byCat[l.cat || ''] = r2((byCat[l.cat || ''] || 0) + l.t.amount); });
      if (!cards) {
        // expenses by category (no card section): each category's total goes to the category row
        if (!other) return;
        Object.entries(byCat).forEach(([cat, amt]) => {
          const ct = (S.categories || []).find(x => x.id === cat);
          addAmount(S, m, other.id, ct ? ct.name : (c.cardName || 'כרטיס אשראי'), amt, { cat });
        });
        return;
      }
      // the card row without amounts (from the previous month) is replaced by the category rows
      m.rows[cards.id] = m.rows[cards.id].filter(r => !(r.name === c.cardName && (r.amount == null || r.amount === '') && !r.imp));
      Object.entries(byCat).forEach(([cat, amt]) => addAmount(S, m, cards.id, c.cardName, amt, { cat }));
    });
    if (plan.cash > 0) { const o = firstOfType(S, 'expense', 'other'); if (o) addAmount(S, m, o.id, 'מזומן', plan.cash); }
    if (plan.bankBalance != null) {
      const b = firstOfType(S, 'bank');
      if (b) { const rows = m.rows[b.id] = m.rows[b.id] || []; if (!rows.length) rows.push(Object.assign(C.newRow('bank'), { name: 'עו"ש' })); rows[0].balance = plan.bankBalance; rows[0].manual = true; }
    }
    C.recompute(S);
  }

  function remember(S, entries) {
    S.rules = S.rules || [];
    entries.forEach(e => {
      S.rules = S.rules.filter(r => !(r.key === e.key && !!r.card === !!e.card && (r.sign || 1) === (e.sign || 1)));
      S.rules.push(e);
    });
  }
  function findMapping(S, header) {
    const sig = signature(header);
    return (S.mappings || []).find(x => x.sig === sig) || null;
  }

  // The day the salary usually arrives, from bank lines (credits that look like salary, else the largest credits).
  // Returns a day 1-28, or null when there is not enough to tell.
  function guessPayDay(txs) {
    const credits = (txs || []).filter(t => t.amount > 0 && t.date instanceof Date);
    if (!credits.length) return null;
    let pick = credits.filter(t => SALARY_RE.test(t.desc));
    if (!pick.length) { const mx = Math.max(...credits.map(t => t.amount)); pick = credits.filter(t => t.amount >= mx * 0.6); }
    const days = pick.map(t => Math.min(28, t.date.getDate())).sort((a, b) => a - b);
    return days[Math.floor((days.length - 1) / 2)] || null;
  }

  const api = { readTable, findHeader, guessRoles, guessKind, signature, transactions, parseDate, parseNum, cleanDesc, period, inPeriod, bestMonth,
    ruleKey, classifyBank, classifyCard, apply, remember, findMapping, last4, norm, guessPayDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BudgetImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
