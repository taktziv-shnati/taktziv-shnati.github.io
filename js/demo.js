// Invented demo data (no real person): a family budget for one year, used by "נסה עם נתוני דוגמה" and by the tests.
(function (root) {
  'use strict';
  const C = root.BudgetCalc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  function demoBudget(year, months) {
    const S = C.newBudget({ year, payDay: 10 });
    S.settings.useCats = true;
    S.sections.forEach(s => { s.on = true; });
    const cat = n => (S.categories.find(c => c.name === n) || {}).id || '';
    // deterministic "random" so the demo is the same every time
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const around = (v, p) => Math.round(v * (1 + (rnd() - 0.5) * p) * 100) / 100;
    const last = months || 11;
    let m = null;
    for (let k = 1; k <= last; k++) {
      m = m ? C.deriveMonth(m, S) : C.emptyMonth(S);
      m.period = `10/${String(k).padStart(2, '0')} – 09/${String(k % 12 + 1).padStart(2, '0')}`;
      m.rate = Math.round((3.7 - k * 0.02 + (rnd() - 0.5) * 0.06) * 100) / 100;
      const R = m.rows;
      if (k === 1) {
        R.income = [{ name: 'משכורת', amount: null, date: '', internal: false }, { name: 'משכורת בן/בת זוג', amount: null, date: '', internal: false }, { name: 'קצבת ילדים', amount: null, date: '', internal: false }];
        R.fixed = [
          { name: 'שכר דירה', amount: 5200, date: '1', cat: cat('דיור וחשבונות'), note: '' },
          { name: 'ועד בית', amount: 180, date: '5', cat: cat('דיור וחשבונות'), note: '' },
          { name: 'ביטוח בריאות', amount: 210, date: '15', cat: cat('ביטוחים'), note: '' },
          { name: 'סלולר ואינטרנט', amount: 160, date: '20', cat: cat('מנויים ותקשורת'), note: '' },
          { name: 'גן ילדים', amount: 2400, date: '1', cat: cat('ילדים'), note: '' }];
        R.cards = [{ name: 'כרטיס 1111', amount: null, date: '', cat: '', note: '' }, { name: 'כרטיס 2222', amount: null, date: '', cat: '', note: '' }];
        R.loans = [{ name: 'הלוואת רכב', monthly: 1150, balance: 48300, cat: cat('רכב ותחבורה') }];
        R.bank = [{ name: 'עו"ש', balance: 8400, manual: true }];
        R.savings = [
          { name: 'קרן פנסיה', monthly: 2100, balance: 182000, gain: 0, fee: '0.2%' },
          { name: 'קרן השתלמות', monthly: 1300, balance: 64500, gain: 0, fee: '0.6%' },
          { name: 'חיסכון לכל ילד', monthly: 57, balance: 3900, gain: 0, fee: '' }];
        R.assets = [{ name: 'תיק השקעות', value: 21000, cur: 'USD' }];
        R.future = [{ name: 'פיקדון בנק', amount: 15000, date: 'סוף השנה', inEquity: true }];
      }
      R.income[0].amount = around(14200, 0.02); R.income[0].date = '10';
      R.income[1].amount = around(9800, 0.03); R.income[1].date = '9';
      R.income[2].amount = 173; R.income[2].date = '20';
      R.cards[0].amount = around(6400, 0.3); R.cards[0].date = '10'; R.cards[0].cat = cat('אוכל וסופר');
      R.cards[1].amount = around(2900, 0.5); R.cards[1].date = '10'; R.cards[1].cat = cat('ביגוד וקניות');
      R.other = [{ name: 'דלק', amount: around(650, 0.3), date: '', cat: cat('רכב ותחבורה'), note: '' }];
      if (k % 3 === 0) R.other.push({ name: 'מסעדה', amount: around(420, 0.4), date: '', cat: cat('בילויים ומסעדות'), note: '' });
      if (k === 6) R.other.push({ name: 'רופא שיניים', amount: 1800, date: '', cat: cat('בריאות'), note: '' });
      R.deposits = [{ name: 'תיק השקעות', amount: 2000, date: '12', note: '' }];
      R.savings.forEach(s => { s.gain = Math.round(s.balance * (rnd() - 0.35) * 0.012); });
      const usd = R.assets[0];
      usd.value = Math.round((usd.value + 2000 / m.rate) * (1 + (rnd() - 0.4) * 0.05));
      if (!S.years[year].months[k - 1]) R.bank[0].manual = true;
      Object.values(R).forEach(rows => rows.forEach(r => { delete r.est; }));
      S.years[year].months[k] = m;
      C.recompute(S);
    }
    S.years[year].openAssets = Math.round(21000 * 3.72);
    [['אוכל וסופר', 6500], ['ביגוד וקניות', 2500], ['רכב ותחבורה', 2000], ['בילויים ומסעדות', 500]].forEach(([n, t]) => { const c = S.categories.find(x => x.name === n); if (c) c.target = t; });
    C.recompute(S);
    return S;
  }
  const api = { demoBudget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BudgetDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
