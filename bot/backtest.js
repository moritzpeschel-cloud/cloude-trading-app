// TIME MACHINE · Rückblick: Wie hätten GENAU diese Regeln (strategy.js) auf den letzten Kerzen abgeschnitten?
// Einstieg zur Eröffnung der Folgekerze inkl. Spread, Stop/Ziel intrabar, beides in einer Kerze = Stop (konservativ),
// sonst Ausstieg zum Schluss nach `horizon` Kerzen. Immer nur ein Trade gleichzeitig je Symbol.
'use strict';
const S = require('./strategy'), U = require('./util');
function run(bars, s, { horizon = 48, spread = 0, from = 210, minQ = .6, dir = 0, setup = null } = {}) {
  const trades = []; let i = Math.max(from, 210);
  while (i < bars.length - 2) {
    const sig = S.setupAt(bars, s, i);
    if (!sig || sig.q < minQ || (dir && sig.dir !== dir) || (setup && sig.setup !== setup)) { i++; continue; }
    const e = bars[i + 1].o + sig.dir * spread / 2, p = S.plan(bars, s, i, sig, e); let R = null, k = i + 1, why = 'Zeit';
    for (; k < Math.min(bars.length, i + 1 + horizon); k++) {
      const b = bars[k], sH = sig.dir > 0 ? b.l <= p.stop : b.h >= p.stop, tH = sig.dir > 0 ? b.h >= p.target : b.l <= p.target;
      if (sH) { R = -1; why = 'Grenze'; break; } if (tH) { R = p.rr; why = 'Ziel'; break; }
    }
    if (R == null) { k = Math.min(k, bars.length - 1); R = sig.dir * (bars[k].c - e) / p.risk; }
    R -= spread / 2 / p.risk; trades.push({ t: bars[i + 1].t, dir: sig.dir, setup: sig.setup, R: U.round(R, 3), why, bars: k - i }); i = k + 1;
  }
  const Rs = trades.map(t => t.R), w = Rs.filter(r => r > 0), l = Rs.filter(r => r <= 0);
  let eq = 0, pk = 0, dd = 0; const curve = Rs.map(r => { eq += r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); return U.round(eq, 2); });
  return { n: trades.length, winrate: trades.length ? w.length / trades.length : null, avgR: trades.length ? U.mean(Rs) : null,
    pf: l.length ? w.reduce((a, b) => a + b, 0) / Math.abs(l.reduce((a, b) => a + b, 0) || 1e-9) : (w.length ? 99 : null), totalR: U.round(eq, 2), maxDDR: U.round(dd, 2),
    curve, last: trades.slice(-12).reverse(), bySetup: Object.entries(trades.reduce((m, t) => { (m[t.setup] = m[t.setup] || []).push(t.R); return m; }, {})).map(([k, v]) => ({ setup: k, n: v.length, wr: v.filter(r => r > 0).length / v.length, avgR: U.mean(v) })) };
}
module.exports = { run };
