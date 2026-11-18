// TIME MACHINE · Rückblick: simuliert GENAU das Playbook (strategy.js) auf der Historie des Symbols –
// Einstieg Eröffnung der Folgekerze inkl. halbem Spread, Stop intrabar (Kurslücke zum schlechteren Kurs),
// Trailing bzw. Ausstiegsregel wie live, Kosten: Spread + Kommission + Übernacht-Finanzierung.
'use strict';
const S = require('./strategy'), T = require('./ta'), U = require('./util'), I = require('./instruments');
function simulate(sym, h1, s, d1) {
  const inst = I.get(sym), pl = S.playOf(sym), fin = S.FIN(sym), cost = inst.spread + 2 * (inst.comm || 0) / inst.cs, out = [];
  let b, sigAt, step;
  if (pl === 'trend') { b = h1; const dT = S.dailyTrendFn(d1); sigAt = i => S.trendAt(b, s, i, dT); step = 3600e3; }
  else if (pl === 'rsi2') { b = d1; const ds = S.dailySeries(d1); sigAt = i => S.rsi2At(b, ds, i); step = 864e5; var DS = ds; }
  else return out;
  const atr = pl === 'trend' ? s.atr : DS.atr; let i = 1;
  while (i < b.length - 2) {
    const g = sigAt(i); if (!g) { i++; continue; }
    const dir = g.dir, e = b[i + 1].o + dir * cost / 2, risk = g.stopDist; let st = e - dir * risk, ex = null, k = i + 1, why = 'Zeit', hh = b[i].c;
    const maxK = pl === 'trend' ? S.P.maxHoldH : S.P.rsi2MaxD;
    for (; k < Math.min(b.length, i + 1 + maxK); k++) {
      const x = b[k]; if (dir > 0 ? x.l <= st : x.h >= st) { ex = dir > 0 ? Math.min(x.o, st) : Math.max(x.o, st); why = 'Stop'; break; }
      if (pl === 'rsi2' && DS.c[k] > DS.s5[k]) { ex = x.c; why = 'SMA 5'; break; }
      if (pl === 'trend') { hh = dir > 0 ? Math.max(hh, x.c) : Math.min(hh, x.c); const n = hh - dir * S.P.trailA * atr[k]; if (dir * (n - st) > 0) st = n; }
    }
    if (ex == null) { k = Math.min(k, b.length - 1); ex = b[k].c; }
    const hrs = (b[k].t - b[i + 1].t) / 3600e3 + step / 3600e3;
    out.push({ t: b[i + 1].t, dir, setup: g.setup, R: U.round((dir * (ex - e) - cost / 2 - e * fin * hrs / 8760) / risk, 3), why, bars: k - i });
    i = k + 1;
  }
  return out;
}
function run(sym, h1, s, d1, { lookbackDays = 730 } = {}) {
  const from = Date.now() - lookbackDays * 864e5, trades = simulate(sym, h1, s, d1).filter(t => t.t >= from);
  const Rs = trades.map(t => t.R), w = Rs.filter(r => r > 0), l = Rs.filter(r => r <= 0);
  let eq = 0, pk = 0, dd = 0; const curve = Rs.map(r => { eq += r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); return U.round(eq, 2); });
  const avgW = w.length ? U.mean(w) : 0, avgL = l.length ? -U.mean(l) : 1;
  return { n: trades.length, winrate: trades.length ? w.length / trades.length : null, avgR: trades.length ? U.mean(Rs) : null, avgW, avgL,
    pf: l.length ? w.reduce((a, b) => a + b, 0) / Math.abs(l.reduce((a, b) => a + b, 0) || 1e-9) : (w.length ? 99 : null), totalR: U.round(eq, 2), maxDDR: U.round(dd, 2),
    curve, last: trades.slice(-12).reverse(), bySetup: trades.length ? [{ setup: trades[0].setup, n: trades.length, wr: w.length / trades.length, avgR: U.mean(Rs) }] : [] };
}
module.exports = { run, simulate };
