// Opening: welcome → what you have (tiles) → how to track expenses → how to fill. No typing; dates are not asked (the 1st by default,
// and a bank file suggests the pay day later).
'use strict';
(function () {
  const C = window.BudgetCalc, Store = window.BudgetStore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // section tiles: [id, label, sub]
  const HAVE = [['income', 'משכורת והכנסות', ''], ['fixed', 'הוראות קבע', 'שכירות, חשבונות'], ['cards', 'כרטיסי אשראי', ''], ['other', 'הוצאות משתנות', 'מזומן, ביט, העברות'],
    ['bank', 'חשבון בנק', 'יתרת עו"ש'], ['loans', 'הלוואות', 'או משכנתא'], ['savings', 'חסכונות', 'פנסיה, השתלמות'], ['deposits', 'הפקדות קבועות', 'לחיסכון / השקעה'],
    ['assets', 'השקעות', 'תיק, קריפטו'], ['future', 'כסף עתידי', 'פיקדון, מענק']];
  const ICON = Object.fromEntries(C.DEFAULT_SECTIONS.map(s => [s.id, s.icon]));

  let st = null;
  function reset() {
    st = { step: 0, on: new Set(['income', 'fixed', 'cards', 'other', 'bank']), mode: 'cards',
      cats: new Set(C.CATEGORY_PRESETS.slice(0, 7).map(c => c[0])), fill: 'manual', iosOk: false };
  }
  const STEPS = 3;
  function bar(n) { return `<div class="row" style="justify-content:space-between"><button class="link" data-w="back">→ חזרה</button><span class="muted">שלב ${n} מתוך ${STEPS}</span></div><div class="bar"><i style="width:${n / STEPS * 100}%"></i></div>`; }
  const tile = (key, on, ic, label, sub, attr) => `<button class="tile${on ? ' on' : ''}" ${attr}="${esc(key)}" aria-pressed="${on}"><span class="ic" aria-hidden="true">${ic}</span><span>${esc(label)}</span>${sub ? `<small class="muted" style="font-size:.72rem">${esc(sub)}</small>` : ''}</button>`;
  function iosCard() {
    if (!Store.isIOS() || Store.isStandalone()) return '';
    return `<div class="install"><b>📲 באייפון: כדאי להתקין לפני שמתחילים</b>
      <ol><li>לוחצים על כפתור השיתוף <b>⬆</b> בספארי (בגרסאות חדשות: בתפריט <b>⋯</b>)</li><li>"הוסף למסך הבית", ומוודאים ש"פתח כאפליקציה" דלוק</li><li>פותחים את "תקציב שנתי" מהאייקון החדש וממשיכים משם</li></ol>
      <p style="margin:6px 0 0" class="muted">לאפליקציה שבמסך הבית יש אחסון משלה, וספארי עלול למחוק נתונים של אתר שלא נפתח שבוע.</p></div>`;
  }
  function view() {
    const s = st;
    if (s.step === 0) return `<div class="welcome-hero"><img class="logo" src="icon.svg" alt=""></div>
      <h2 style="text-align:center">תקציב שנתי</h2>
      <p class="lead" style="text-align:center">רואים לאן הולך הכסף, חודש אחרי חודש: הכנסות, הוצאות, חסכונות ושווי נקי.</p>
      <div class="banner info">🔒 הכל נשמר רק במכשיר שלך. אין הרשמה, ושום דבר לא נשלח אלינו. אפשר לסנכרן בין הטלפון למחשב דרך חשבון הענן הפרטי שלך.</div>
      ${iosCard()}
      <div class="grow"></div>
      <button class="big pri" data-w="new">בוא נתחיל</button>
      <button class="big" data-w="open">יש לי קובץ גיבוי</button>
      ${window.Cloud ? window.Cloud.welcome() : ''}
      <button class="big" data-w="demo">רק להציץ (נתוני דוגמה)</button>
      <p class="small">כלי מעקב אישי, לא ייעוץ פיננסי</p>`;
    if (s.step === 1) return bar(1) + `<h2>מה יש לך?</h2>
      <p class="lead">מסמנים מה רלוונטי. אפשר לשנות הכל אחר כך.</p>
      <div class="tiles">${HAVE.map(([id, l, sub]) => tile(id, s.on.has(id), ICON[id], l, sub, 'data-have')).join('')}</div>
      <div class="grow"></div>
      <button class="big pri" data-w="next">המשך</button>`;
    if (s.step === 2) return bar(2) + `<h2>איך לעקוב אחרי ההוצאות?</h2>
      <button class="opt${s.mode === 'cards' ? ' on' : ''}" data-mode="cards"><span class="ic">💳</span><span><b>סכום לכל כרטיס</b><small>הכי פשוט: כמה ירד בכל כרטיס אשראי החודש.</small></span></button>
      <button class="opt${s.mode === 'cats' ? ' on' : ''}" data-mode="cats"><span class="ic">🏷</span><span><b>לפי קטגוריות</b><small>אוכל, דיור, רכב… רואים לאן הלך הכסף, ואפשר לקבוע יעד לכל אחת. פירוט כרטיס שנטען מתחלק לקטגוריות לבד.</small></span></button>
      ${s.mode === 'cats' ? `<p class="lead" style="margin-top:4px">על מה הולך הכסף שלך?</p><div class="tiles">${C.CATEGORY_PRESETS.map(([n, ic]) => tile(n, s.cats.has(n), ic, n, '', 'data-cat')).join('')}</div>` : ''}
      <div class="grow"></div>
      <button class="big pri" data-w="next">המשך</button>`;
    return bar(3) + `<h2>איך תמלא את החודש?</h2>
      <button class="opt${s.fill === 'docs' ? ' on' : ''}" data-fill="docs"><span class="ic">📥</span><span><b>טעינת קובץ מהבנק או מחברת האשראי</b><small>מורידים מהאתר של הבנק קובץ אקסל או CSV, והאפליקציה ממלאת לבד. בפעם הראשונה מסמנים איזו עמודה היא מה.</small></span></button>
      <button class="opt${s.fill === 'manual' ? ' on' : ''}" data-fill="manual"><span class="ic">✍️</span><span><b>אקליד בעצמי</b><small>השורות כבר מוכנות עם שמות, מקלידים רק סכומים. יש גם כפתור "הוספה מהירה".</small></span></button>
      <div class="grow"></div>
      <button class="big pri" data-w="finish">יוצאים לדרך</button>`;
  }
  function draw(keepScroll) {
    $('#top').hidden = true; $('#fab').hidden = true;
    $('#main').innerHTML = `<div class="wiz"><div class="card">${view()}</div></div>`;
    if (!keepScroll) scrollTo(0, 0);
  }
  function finish() {
    const on = [...st.on];
    if (!on.includes('income')) on.push('income');
    // by category: card charges are split into the categories, so a separate card list would count them twice
    if (st.mode === 'cats' && on.includes('cards')) on.splice(on.indexOf('cards'), 1);
    const S = C.newBudget({ year: new Date().getFullYear(), on, cats: st.mode === 'cats' ? C.CATEGORY_PRESETS.map(c => c[0]).filter(n => st.cats.has(n)) : null });
    if (st.mode === 'cats' && !st.cats.size) S.settings.useCats = true;
    const docs = st.fill === 'docs';
    st = null;
    window.App.start(S, { fresh: true });
    // the file picker opens inside this same tap (phones allow it only then)
    if (docs) window.ImportUI.open();
  }
  document.addEventListener('click', e => {
    if (!st) return;
    const t = e.target.closest('.wiz button'); if (!t) return;
    const w = t.dataset.w;
    if (w === 'new') { st.step = 1; return draw(); }
    if (w === 'open') return $('#fileBackup').click();
    if (w === 'demo') {
      const y = new Date().getFullYear(); st = null;
      window.App.start(window.BudgetDemo.demoBudget(y, new Date().getMonth() + 1), { year: y, tab: 'summary', noCatchUp: true, fresh: true });
      window.App.setStatus('נתוני דוגמה (מומצאים). מתחילים מחדש בהגדרות ← "מחק הכל".');
      return;
    }
    if (w === 'back') { st.step = Math.max(0, st.step - 1); return draw(); }
    if (w === 'next') { st.step++; return draw(); }
    if (w === 'finish') return finish();
    if (t.dataset.have) { const id = t.dataset.have; if (st.on.has(id)) st.on.delete(id); else st.on.add(id); return draw(true); }
    if (t.dataset.cat) { const n = t.dataset.cat; if (st.cats.has(n)) st.cats.delete(n); else st.cats.add(n); return draw(true); }
    if (t.dataset.mode) { st.mode = t.dataset.mode; return draw(true); }
    if (t.dataset.fill) { st.fill = t.dataset.fill; return draw(true); }
  });
  window.Wizard = { show() { reset(); draw(); }, close() { st = null; } };
})();
