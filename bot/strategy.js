// Setup-Erkennung + Trade-Plan. Wird identisch live (Scanner/Einstieg/Ausstieg) und im Backtest (Time Machine) benutzt –
// so misst die Time Machine genau die Regeln, nach denen der Bot handelt (kein „Backtest-Schönrechnen“).
'use strict';
const T = require('./ta');
const ok = x => x != null && !isNaN(x);
// Setups an Kerze i (abgeschlossene Kerze!). dir: +1 Kauf, -1 Verkauf. quality 0..1
function setupAt(b, s, i) {
  const c = s.c[i], a = s.atr[i]; if (!ok(s.e200[i]) || !ok(a) || !ok(s.adx.adx[i]) || !ok(s.dc.hi[i]) || a <= 0) return null;
  const up = s.e20[i] > s.e50[i] && s.e50[i] > s.e200[i], dn = s.e20[i] < s.e50[i] && s.e50[i] < s.e200[i], adx = s.adx.adx[i], r = s.rsi[i], hist = s.macd.hist[i], hist1 = s.macd.hist[i - 1];
  const volOk = !s.vma[i] || s.v[i] >= 1.15 * s.vma[i], out = [];
  // A) Trend-Rücksetzer: Trend intakt, Kurs hat die EMA20 angetestet und schließt wieder in Trendrichtung
  for (const d of [1, -1]) {
    const trend = d > 0 ? up : dn; if (!trend || adx < 18) continue;
    const touched = d > 0 ? b[i].l <= s.e20[i] + .25 * a && c > s.e20[i] : b[i].h >= s.e20[i] - .25 * a && c < s.e20[i];
    const rsiOk = d > 0 ? r > 40 && r < 65 : r < 60 && r > 35, turn = d * hist > d * hist1;
    if (touched && rsiOk) out.push({ dir: d, setup: 'Trend-Rücksetzer', q: .55 + Math.min(.25, (adx - 18) / 60) + (turn ? .12 : 0) + (d * (c - b[i].o) > 0 ? .08 : 0) });
  }
  // B) Ausbruch aus enger Spanne (Squeeze) über das 20-Kerzen-Hoch/-Tief
  const sq = T.pctRank(s.bb.width, i - 1, 120);
  for (const d of [1, -1]) {
    const brk = d > 0 ? c > s.dc.hi[i] : c < s.dc.lo[i]; if (!brk || !(sq < .35)) continue;
    const body = Math.abs(c - b[i].o) / a, align = d > 0 ? c > s.e200[i] : c < s.e200[i];
    out.push({ dir: d, setup: 'Ausbruch', q: .5 + (volOk ? .12 : 0) + Math.min(.15, body * .1) + (align ? .13 : -.1) + (sq < .15 ? .08 : 0) });
  }
  // C) Rückkehr zur Mitte: kein Trend (ADX < 20), Überdehnung außerhalb der Bollinger-Bänder, RSI extrem, Umkehrkerze
  if (adx < 20) for (const d of [1, -1]) {
    const ext = d > 0 ? b[i].l < s.bb.lo[i] && r < 32 : b[i].h > s.bb.up[i] && r > 68, rev = d * (c - b[i].o) > 0;
    if (ext && rev) out.push({ dir: d, setup: 'Rückkehr zur Mitte', q: .5 + Math.min(.2, Math.abs(r - 50) / 100) });
  }
  if (!out.length) return null;
  out.sort((x, y) => y.q - x.q); const best = out[0]; best.q = Math.max(0, Math.min(1, best.q)); return best;
}
// Plan: Stop hinter Struktur (Swing) bzw. ATR, Ziel 2R (Trend) oder Bandmitte (Rückkehr), Widerstand prüfen.
function plan(b, s, i, sig, entry, cfg = {}) {
  const a = s.atr[i], d = sig.dir, sw = T.swings(b, 3, i), look = i - 24;
  const sws = (d > 0 ? sw.lo : sw.hi).filter(x => x.i >= look).map(x => x.p);
  let stop = d > 0 ? Math.min(entry - 1.2 * a, ...(sws.length ? [Math.min(...sws) - .2 * a] : [])) : Math.max(entry + 1.2 * a, ...(sws.length ? [Math.max(...sws) + .2 * a] : []));
  let risk = Math.abs(entry - stop); if (risk > 3 * a) { risk = 3 * a; stop = entry - d * risk; } if (risk < .8 * a) { risk = .8 * a; stop = entry - d * risk; }
  let rr = cfg.rr || 2, target = entry + d * rr * risk;
  if (sig.setup === 'Rückkehr zur Mitte') { const mid = s.bb.mid[i]; const r2 = Math.abs(mid - entry) / risk; rr = Math.max(1.3, Math.min(2.5, r2)); target = entry + d * rr * risk; }
  // nächster Gegen-Swing innerhalb des Ziels -> Hindernis
  const opp = (d > 0 ? sw.hi : sw.lo).filter(x => x.i >= i - 120).map(x => x.p).filter(p => d > 0 ? p > entry + .3 * risk && p < target : p < entry - .3 * risk && p > target);
  const obstacle = opp.length ? (d > 0 ? Math.min(...opp) : Math.max(...opp)) : null;
  return { entry, stop, target, risk, rr, obstacle, obstacleR: obstacle != null ? Math.abs(obstacle - entry) / risk : null, atr: a };
}
module.exports = { setupAt, plan };
