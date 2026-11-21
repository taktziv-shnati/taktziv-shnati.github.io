// Loading documents: pick files → map columns (once per bank) → review the month → into the budget.
'use strict';
(function () {
  const C = window.BudgetCalc, IM = window.BudgetImport;
  const $ = s => document.querySelector(s);
  const A = () => window.App;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ROLE = [['ignore', 'להתעלם'], ['date', 'תאריך'], ['desc', 'תיאור'], ['amount', 'סכום'], ['debit', 'חובה (יצא)'], ['credit', 'זכות (נכנס)'], ['balance', 'יתרה']];
  const dstr = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2);
  const cell = v => v instanceof Date ? dstr(v) : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v == null ? '' : v);

  let st = null; // { files: [{ name, table, mapping, txs }], step, y, k, plan }

  function open() {
    $('#fileDocs').value = '';
    $('#fileDocs').click();
  }
  $('#fileDocs').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    st = { files: [], step: 'map', cur: 0 };
    for (const f of files) {
      try {
        const buf = /\.(csv|txt)$/i.test(f.name) ? await readText(f) : new Uint8Array(await f.arrayBuffer());
        const table = IM.readTable(buf, f.name);
        const hi = IM.findHeader(table.rows);
        const header = hi >= 0 ? table.rows[hi] : (table.rows[0] || []);
        const saved = hi >= 0 ? IM.findMapping(A().S, header) : null;
        const roles = saved ? saved.roles.slice() : IM.guessRoles(header.map(String));
        const kind = saved ? saved.kind : IM.guessKind(header.map(String), roles);
        st.files.push({ name: f.name, table, mapping: { header: Math.max(0, hi), roles, kind, name: saved ? saved.name : '', saved: !!saved, cardName: '' } });
      } catch (err) {
        A().tell(`אי אפשר לקרוא את "${f.name}". אפשר לנסות לשמור אותו מהבנק כאקסל (xlsx) או CSV.\n(${err.message})`);
      }
    }
    if (!st.files.length) { st = null; return; }
    // a saved bank mapping goes straight through; card files still need "which card"
    st.cur = st.files.findIndex(f => !f.mapping.saved || f.mapping.kind === 'card');
    if (st.cur < 0) toReview(); else draw();
  });
  async function readText(f) {
    const buf = await f.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1255').decode(buf); // older Hebrew files
    return txt;
  }

  /* ---------- mapping screen ---------- */
  function cardNames() {
    const S = A().S, m = A().curM();
    const cards = C.active(S).find(s => s.id === 'cards') || C.active(S).find(s => s.type === 'expense');
    const names = new Set();
    C.chainMonths(S).slice(-3).forEach(({ m: mm }) => (mm.rows[cards && cards.id] || []).forEach(r => { if (r.name) names.add(r.name); }));
    if (m) (m.rows[cards && cards.id] || []).forEach(r => { if (r.name) names.add(r.name); });
    return [...names];
  }
  function viewMap() {
    const f = st.files[st.cur], mp = f.mapping, rows = f.table.rows;
    const header = rows[mp.header] || [];
    const ncol = Math.max(header.length, ...rows.slice(mp.header + 1, mp.header + 8).map(r => r.length));
    const sample = rows.slice(mp.header + 1).filter(r => r.some(c => c !== '')).slice(0, 6);
    const cn = cardNames();
    let h = `<div class="top"><h2>טעינת מסמך</h2><span class="muted">${st.cur + 1} מתוך ${st.files.length}</span></div>
    <section class="box stack">
      <div><b>📄 ${esc(f.name)}</b> <span class="muted">${rows.length} שורות</span></div>
      ${mp.saved ? `<div class="banner ok">✓ זוהה כ"${esc(mp.name)}", לפי מה ששמרת בפעם הקודמת.</div>` : `<p class="muted" style="margin:0">מה יש בכל עמודה? בחרתי לפי הכותרות, תקן אם צריך. עושים את זה פעם אחת: בפעם הבאה קובץ מאותו בנק ייקרא לבד.</p>`}
      <label class="stack" style="gap:3px"><span class="muted">שורת הכותרות</span><select data-im="header">${rows.slice(0, 40).map((r, i) => `<option value="${i}"${i === mp.header ? ' selected' : ''}>שורה ${i + 1}: ${esc(r.filter(c => c !== '').slice(0, 4).map(cell).join(' · ').slice(0, 60))}</option>`).join('')}</select></label>
      <div class="scroll"><table class="maptbl"><thead><tr>${[...Array(ncol).keys()].map(i => `<th><select data-role="${i}">${ROLE.map(([k, l]) => `<option value="${k}"${(mp.roles[i] || 'ignore') === k ? ' selected' : ''}>${l}</option>`).join('')}</select><div class="muted" style="font-weight:400">${esc(cell(header[i]))}</div></th>`).join('')}</tr></thead>
      <tbody>${sample.map(r => `<tr>${[...Array(ncol).keys()].map(i => `<td style="${(mp.roles[i] || 'ignore') === 'ignore' ? 'color:var(--mut)' : ''}">${esc(cell(r[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <label class="stack" style="gap:3px"><span class="muted">סוג המסמך</span><select data-im="kind"><option value="bank"${mp.kind === 'bank' ? ' selected' : ''}>עו"ש בנק</option><option value="card"${mp.kind === 'card' ? ' selected' : ''}>פירוט כרטיס אשראי</option></select></label>
      ${mp.kind === 'card' ? `<label class="stack" style="gap:3px"><span class="muted">של איזה כרטיס?</span><select data-im="cardSel">${cn.map(n => `<option${n === mp.cardName ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="__new"${!cn.length || mp.cardName === '__new' ? ' selected' : ''}>כרטיס אחר…</option></select></label>
        ${!cn.length || mp.cardName === '__new' || !cn.includes(mp.cardName) ? `<input data-im="cardNew" placeholder="כרטיס 1234 (4 ספרות אחרונות)" value="${esc(mp.cardNew || '')}">` : ''}` : ''}
      ${mp.saved ? '' : `<label class="stack" style="gap:3px"><span class="muted">שם לזיהוי בפעם הבאה</span><input data-im="name" value="${esc(mp.name)}" placeholder="${mp.kind === 'card' ? 'למשל: כרטיס של הבנק' : 'למשל: הבנק שלי'}"></label>`}
      <p id="imErr" class="neg" style="margin:0"></p>
      <div class="row"><button class="pri" data-imgo="1">קרא את המסמך</button><button class="ghost" data-imcancel="1">ביטול</button></div>
    </section>`;
    return h;
  }
  function readMapForm() {
    const f = st.files[st.cur], mp = f.mapping;
    document.querySelectorAll('[data-role]').forEach(s => { mp.roles[+s.dataset.role] = s.value; });
    const g = n => $(`[data-im="${n}"]`);
    if (g('kind')) mp.kind = g('kind').value;
    if (g('name')) mp.name = g('name').value.trim();
    if (g('cardSel')) mp.cardName = g('cardSel').value;
    if (g('cardNew')) mp.cardNew = g('cardNew').value.trim();
  }
  function goMap() {
    readMapForm();
    const f = st.files[st.cur], mp = f.mapping, R = mp.roles, err = t => { $('#imErr').textContent = t; };
    if (!R.includes('date')) return err('בחר איזו עמודה היא התאריך.');
    if (!R.includes('amount') && !R.includes('debit') && !R.includes('credit')) return err('בחר עמודת סכום (או עמודות חובה וזכות).');
    if (mp.kind === 'card') {
      const name = mp.cardName && mp.cardName !== '__new' ? mp.cardName : mp.cardNew;
      if (!name) return err('כתוב לאיזה כרטיס שייך הפירוט, למשל "כרטיס 1234".');
      if (/\d{9,}/.test(name.replace(/[\s-]/g, ''))) return err('לא רושמים מספר כרטיס מלא. מספיקות 4 הספרות האחרונות.');
      f.cardName = name;
    }
    f.txs = IM.transactions(f.table, mp);
    if (!f.txs.length) return err('לא נמצאו שורות עם תאריך וסכום. בדוק את שורת הכותרות ואת העמודות.');
    // card files: a charge is positive. Some files show charges as negative: flip when most lines are negative.
    if (mp.kind === 'card' && f.txs.filter(t => t.amount < 0).length > f.txs.length / 2) f.txs.forEach(t => { t.amount = -t.amount; });
    if (!mp.saved) {
      const S = A().S, sig = IM.signature(f.table.rows[mp.header] || []);
      S.mappings = (S.mappings || []).filter(x => x.sig !== sig);
      S.mappings.push({ sig, roles: R.slice(), kind: mp.kind, name: mp.name || (mp.kind === 'card' ? 'פירוט כרטיס' : 'עו"ש') });
      mp.saved = true;
    }
    const next = st.files.findIndex((x, i) => i > st.cur && (!x.mapping.saved || x.mapping.kind === 'card'));
    if (next >= 0) { st.cur = next; draw(); return; }
    toReview();
  }

  /* ---------- review ---------- */
  async function toReview() {
    st.files.forEach(f => { if (!f.txs) f.txs = IM.transactions(f.table, f.mapping); });
    const S = A().S;
    const bankTx = st.files.filter(f => f.mapping.kind === 'bank').flatMap(f => f.txs);
    // the salary day from the bank file → offered as the start of the budget month, before the lines are split into months
    const guess = IM.guessPayDay(bankTx), meta = window.BudgetStore.meta();
    if (guess && guess !== (S.profile.payDay || 1) && meta.payAsked !== guess) {
      window.BudgetStore.setMeta({ payAsked: guess });
      if (await A().ask(`נראה שהמשכורת שלך נכנסת בערך ב-${guess} לחודש. לקבוע שהחודש התקציבי יתחיל ב-${guess}?
כך ההכנסה וההוצאות של אותו מחזור יושבות באותו חודש. אפשר לשנות בהגדרות.`, { ok: `כן, מה-${guess}`, cancel: 'להשאיר' })) {
        A().pushUndo(true); S.profile.payDay = guess; A().queueSave(true);
      }
      if (!st) return;
    }
    const all = bankTx.length ? bankTx : st.files.flatMap(f => f.txs);
    const best = IM.bestMonth(S, all);
    const tab = A().ui.tab;
    st.y = typeof tab === 'number' ? A().ui.year : best ? best.y : A().ui.year;
    st.k = typeof tab === 'number' ? tab : best ? best.k : 1;
    if (best && typeof tab === 'number' && (best.y !== st.y || best.k !== st.k)) st.suggest = best;
    st.step = 'review';
    buildPlan();
    draw();
  }
  // a month that is not open yet: the copy of the previous month it will become, so lines match its rows (and nothing is counted twice)
  function draftMonth() {
    const S = A().S;
    if (st.draft && st.draft.y === st.y && st.draft.k === st.k) return st.draft.m;
    const prevK = [...Array(st.k - 1).keys()].map(x => x + 1).reverse().find(x => S.years[st.y] && S.years[st.y].months[x]);
    const prev = prevK ? S.years[st.y].months[prevK] : S.years[st.y - 1] && S.years[st.y - 1].months && S.years[st.y - 1].months[12];
    st.draft = { y: st.y, k: st.k, m: prev ? C.deriveMonth(prev, S) : C.seedMonth(S) };
    return st.draft.m;
  }
  function monthFor() {
    const S = A().S;
    return (S.years[st.y] && S.years[st.y].months && S.years[st.y].months[st.k]) || null; // a year is created only when the import is approved
  }
  function buildPlan() {
    const S = A().S, p = IM.period(S, st.y, st.k);
    const m = monthFor() || draftMonth();
    const bankFiles = st.files.filter(f => f.mapping.kind === 'bank');
    const bankAll = bankFiles.flatMap(f => f.txs);
    const inP = bankAll.filter(t => IM.inPeriod(t.date, p));
    st.outside = bankAll.length - inP.length;
    st.plan = {
      bank: IM.classifyBank(S, m, inP),
      cards: st.files.filter(f => f.mapping.kind === 'card').map(f => ({ cardName: f.cardName, file: f.name, lines: IM.classifyCard(S, f.txs).map(x => ({ t: x.t, cat: x.cat, status: x.status })) })),
      cash: 0, bankBalance: null
    };
    // closing balance from the bank file: the last line of the period that has a balance
    const withBal = inP.filter(t => t.balance != null);
    st.closing = withBal.length ? withBal.reduce((a, b) => (b.date >= a.date ? b : a)).balance : null;
    st.useClosing = st.closing != null && C.active(S).some(s => s.type === 'bank');
  }
  function targetOptions(p) {
    const S = A().S;
    const opts = [];
    C.active(S).filter(s => ['income', 'expense', 'loan', 'deposit'].includes(s.type)).forEach(s => {
      if (s.id === 'cards' || (p.card && s.type === 'expense' && s === C.active(S).find(x => x.type === 'expense' && x.id === 'cards'))) return;
      opts.push([s.id, s.title]);
    });
    const cards = C.active(S).find(s => s.id === 'cards');
    if (cards) cardNames().forEach(n => opts.push(['card:' + n, cards.title + ': ' + n]));
    opts.push(['internal', 'העברה פנימית (לא הכנסה)'], ['ignore', 'להתעלם']);
    const cur = p.card ? 'card:' + p.row : p.to;
    if (p.card && !opts.some(o => o[0] === cur)) opts.splice(opts.length - 2, 0, [cur, (cards ? cards.title + ': ' : '') + p.row]);
    return opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }
  const catSel = (val, attr) => `<select ${attr}><option value="">ללא קטגוריה</option>${A().S.categories.map(c => `<option value="${c.id}"${c.id === val ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  function needsCat(p) { const s = A().sec(p.to); return s && (s.type === 'expense' || s.type === 'loan') && !p.card && A().S.categories.length; }
  function item(p, i) {
    const amt = p.t.amount;
    return `<div class="rvi${p.status === 'ask' ? ' warn' : ''}">
      <div class="t"><span>${p.status === 'ask' ? '⚠' : '✓'} ${esc(p.t.desc)} <span class="muted">${dstr(p.t.date)}</span></span><b class="n ${amt > 0 ? 'pos' : ''}">${A().money(Math.abs(amt))}${amt > 0 ? ' נכנס' : ''}</b></div>
      ${p.status === 'ask' ? `<span class="muted">${esc(p.why)}</span>` : ''}
      <div class="row"><select data-pto="${i}" style="flex:1;min-width:150px">${targetOptions(p)}</select>${needsCat(p) ? catSel(p.cat, `data-pcat="${i}" style="flex:1;min-width:120px"`) : ''}</div>
      ${p.status === 'ask' || p.changed ? `<label class="row muted"><input type="checkbox" data-prem="${i}"${p.remember !== false ? ' checked' : ''}> לזכור לפעם הבאה</label>` : ''}
    </div>`;
  }
  function viewReview() {
    const S = A().S, MN = A().MN, P = st.plan;
    const ask = P.bank.map((p, i) => [p, i]).filter(([p]) => p.status === 'ask');
    const ok = P.bank.map((p, i) => [p, i]).filter(([p]) => p.status !== 'ask');
    const ys = [st.y - 1, st.y, st.y + 1];
    let h = `<div class="top"><h2>סקירת ${MN[st.k - 1]} ${st.y}</h2><span class="muted">${ask.length ? ask.length + ' לאישור' : 'הכל מוכן'}</span></div>`;
    h += `<section class="box stack"><div class="det"><label>חודש<select data-rv="k">${MN.map((n, i) => `<option value="${i + 1}"${i + 1 === st.k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>שנה<select data-rv="y">${ys.map(y => `<option${y === st.y ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>
      ${st.suggest && (st.suggest.y !== st.y || st.suggest.k !== st.k) ? `<div class="banner warn">רוב השורות בקובץ שייכות ל${MN[st.suggest.k - 1]} ${st.suggest.y}. <button class="sm" data-rvsug="1">עבור ל${MN[st.suggest.k - 1]}</button></div>` : ''}
      <p class="muted" style="margin:0">${P.bank.length} שורות מהעו"ש בתקופה של החודש${st.outside ? ` · ${st.outside} שורות מחוץ לתקופה לא ייכנסו` : ''}${P.cards.length ? ` · ${P.cards.length} פירוטי כרטיס` : ''}. ${monthFor() ? 'מה שנטען קודם מאותם מסמכים יוחלף, לא יוכפל.' : 'החודש ייפתח.'}</p></section>`;
    if (ask.length) h += `<section class="box"><h3>צריך החלטה (${ask.length})</h3><div class="rv">${ask.map(([p, i]) => item(p, i)).join('')}</div></section>`;
    // card checks: statement total vs the charge in the bank
    P.cards.forEach((c, ci) => {
      const total = c.lines.reduce((s, l) => s + l.t.amount, 0);
      const inBank = P.bank.filter(p => p.card && p.row === c.cardName && p.to !== 'ignore').reduce((s, p) => s + Math.abs(p.t.amount), 0);
      const merchants = {};
      c.lines.forEach((l, li) => { const k = IM.ruleKey(l.t.desc); (merchants[k] = merchants[k] || { name: l.t.desc, sum: 0, idx: [], cat: l.cat }).sum += l.t.amount; merchants[k].idx.push(li); });
      const list = Object.entries(merchants).sort((a, b) => b[1].sum - a[1].sum);
      const noCat = list.filter(([, x]) => !x.cat).length;
      h += `<section class="box stack"><h3>💳 ${esc(c.cardName)}: ${A().money(total)}</h3>
        ${P.bank.length ? (inBank ? (Math.abs(inBank - total) < 1 ? `<div class="banner ok">✓ תואם לחיוב בעו"ש (${A().money(inBank)})</div>` : `<div class="banner warn">⚠ בעו"ש ירד ${A().money(inBank)}, והפירוט מסתכם ב-${A().money(total)}. ההפרש ${A().money(Math.abs(inBank - total))}. בדוק שזה הפירוט של אותו חודש.</div>`) : `<div class="banner warn">⚠ לא מצאתי בעו"ש חיוב של הכרטיס הזה בתקופה.</div>`) : ''}
        <details${noCat && S.categories.length ? ' open' : ''}><summary class="muted">קטגוריות לפי בית עסק (${list.length} בתי עסק${noCat ? ', ' + noCat + ' בלי קטגוריה' : ''}). אפשר לדלג.</summary>
        <div class="rv" style="margin-top:8px">${list.map(([k, x]) => `<div class="rvi"><div class="t"><span>${esc(x.name)} <span class="muted">×${x.idx.length}</span></span><b class="n">${A().money(x.sum)}</b></div>${S.categories.length ? catSel(x.cat, `data-mcat="${ci}|${esc(k)}"`) : ''}</div>`).join('')}</div></details></section>`;
    });
    if (ok.length) {
      const bySec = {};
      ok.forEach(([p]) => { const k = p.to === 'ignore' ? 'להתעלם' : p.to === 'internal' ? 'העברה פנימית' : p.card ? 'כרטיסי אשראי' : (A().sec(p.to) || {}).title || p.to; bySec[k] = (bySec[k] || 0) + Math.abs(p.t.amount); });
      h += `<section class="box"><h3>מולא אוטומטית (${ok.length})</h3><p class="muted" style="margin:0 0 6px">${Object.entries(bySec).map(([k, v]) => `${esc(k)}: ${A().money(v)}`).join(' · ')}</p>
        <details><summary class="muted">להציג ולשנות</summary><div class="rv" style="margin-top:8px">${ok.map(([p, i]) => item(p, i)).join('')}</div></details></section>`;
    }
    h += `<section class="box stack"><h3>מה שאין עליו מסמך</h3>
      <label class="stack" style="gap:3px"><span class="muted">הוצאות במזומן החודש (אם היו)</span><span class="cur" data-cur="₪"><input class="num" inputmode="decimal" data-rv="cash" placeholder=" " value="${P.cash || ''}"></span></label>
      ${st.closing != null ? `<label class="row"><input type="checkbox" data-rv="useClosing"${st.useClosing ? ' checked' : ''}> לעדכן את היתרה בבנק לפי הקובץ: <b class="n">${A().money(st.closing)}</b></label>` : ''}
    </section>
    <div class="row"><button class="pri" data-rvok="1">אשר והכנס לתקציב</button><button class="ghost" data-imcancel="1">ביטול</button></div>`;
    return h;
  }

  async function apply() {
    if (!st || st.busy) return; // a double tap
    st.busy = true;
    const S = A().S, P = st.plan;
    A().pushUndo(true);
    await window.BudgetStore.snapshotBefore(S, 'לפני טעינת קובץ');
    A().ui.year = st.y;
    // open the month the normal way (a copy of the previous month), the same copy the review was built on
    if (!monthFor()) { S.years[st.y] = S.years[st.y] || { months: {} }; S.years[st.y].months = S.years[st.y].months || {}; S.years[st.y].months[st.k] = draftMonth(); }
    const m = monthFor();
    // card charges in the bank decided as "card:<name>"
    P.bank.forEach(p => { if (String(p.to).startsWith('card:')) { p.row = p.to.slice(5); p.card = true; p.to = (C.active(S).find(s => s.id === 'cards') || {}).id; } });
    P.bankBalance = st.useClosing ? st.closing : null;
    IM.apply(S, m, P);
    // remember decisions
    const rules = [];
    P.bank.forEach(p => {
      if ((p.status === 'ask' || p.changed) && p.remember !== false) rules.push({ key: IM.ruleKey(p.t.desc), sign: Math.sign(p.t.amount), to: p.to, row: p.card ? p.row : (p.row || ''), cat: p.cat || '', isCard: !!p.card });
    });
    P.cards.forEach(c => c.lines.forEach(l => { if (l.cat && l.status !== 'ok') rules.push({ key: IM.ruleKey(l.t.desc), card: true, cat: l.cat }); }));
    IM.remember(S, rules);
    S.updates = S.updates || [];
    S.updates.push({ n: S.updates.length + 1, date: new Date().toLocaleDateString('he-IL'), month: st.y + '-' + st.k, files: st.files.length });
    st = null;
    A().ui.tab = (() => { const k = +Object.keys(S.years[A().ui.year].months).find(x => S.years[A().ui.year].months[x] === m); return k; })();
    A().queueSave(true); A().render(); scrollTo(0, 0);
    A().setStatus('המסמכים נכנסו לתקציב ✓ (אפשר לבטל עם ↶)');
  }

  function draw() {
    $('#top').hidden = false; $('#fab').hidden = true;
    $('#main').innerHTML = st.step === 'map' ? viewMap() : viewReview();
  }
  document.addEventListener('click', e => {
    if (!st) return;
    const t = e.target.closest('#main button'); if (!t) return;
    if (t.dataset.imcancel) { st = null; A().render(); return; }
    if (t.dataset.imgo) { goMap(); return; }
    if (t.dataset.rvok) { apply().catch(err => { if (st) st.busy = false; A().tell('הטעינה נכשלה: ' + (err && err.message)); }); return; }
    if (t.dataset.rvsug) { st.y = st.suggest.y; st.k = st.suggest.k; buildPlan(); draw(); }
  }, true);
  document.addEventListener('change', e => {
    if (!st) return;
    const el = e.target;
    if (st.step === 'map') {
      if (el.dataset.im === 'header') { const f = st.files[st.cur]; f.mapping.header = +el.value; f.mapping.roles = IM.guessRoles((f.table.rows[+el.value] || []).map(String)); draw(); return; }
      if (el.dataset.im === 'kind' || el.dataset.im === 'cardSel' || el.dataset.role != null) { readMapForm(); draw(); }
      return;
    }
    const P = st.plan;
    if (el.dataset.rv === 'k' || el.dataset.rv === 'y') { st[el.dataset.rv] = +el.value; buildPlan(); draw(); return; }
    if (el.dataset.rv === 'cash') { P.cash = A().evalExpr(el.value) != null ? A().evalExpr(el.value) : C.num(el.value); return; }
    if (el.dataset.rv === 'useClosing') { st.useClosing = el.checked; return; }
    if (el.dataset.pto != null) {
      const p = P.bank[+el.dataset.pto], v = el.value;
      p.changed = true;
      if (v.startsWith('card:')) { p.card = true; p.row = v.slice(5); p.to = v; }
      else { p.card = false; p.to = v; p.row = p.t.desc; }
      draw(); return;
    }
    if (el.dataset.pcat != null) { const p = P.bank[+el.dataset.pcat]; p.cat = el.value; p.changed = true; return; }
    if (el.dataset.prem != null) { P.bank[+el.dataset.prem].remember = el.checked; return; }
    if (el.dataset.mcat != null) {
      const [ci, key] = el.dataset.mcat.split('|');
      P.cards[+ci].lines.forEach(l => { if (IM.ruleKey(l.t.desc) === key) { l.cat = el.value; l.status = 'new'; } });
    }
  }, true);

  window.ImportUI = { open, cancel() { st = null; }, get active() { return !!st; } };
})();
