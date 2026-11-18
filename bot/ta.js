// Technische Analyse: Indikator-Reihen (gleich lang wie die Kerzen, NaN bis genug Daten da sind).
'use strict';
const ema = (x, n) => { const o = new Array(x.length).fill(NaN), k = 2 / (n + 1); let e = NaN, s = 0;
  for (let i = 0; i < x.length; i++) { if (i < n) { s += x[i]; if (i === n - 1) { e = s / n; o[i] = e; } continue; } e = x[i] * k + e * (1 - k); o[i] = e; } return o; };
const sma = (x, n) => { const o = new Array(x.length).fill(NaN); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
function rsi(c, n = 14) { const o = new Array(c.length).fill(NaN); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return o; }
function atr(b, n = 14) { const tr = b.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)) : x.h - x.l);
  const o = new Array(b.length).fill(NaN); let a = NaN; for (let i = 0; i < b.length; i++) { if (i === n - 1) a = tr.slice(0, n).reduce((s, x) => s + x, 0) / n; else if (i >= n) a = (a * (n - 1) + tr[i]) / n; o[i] = a; } return o; }
function macd(c, f = 12, s = 26, g = 9) { const a = ema(c, f), b = ema(c, s), line = c.map((_, i) => a[i] - b[i]); const st = line.findIndex(x => !isNaN(x));
  const sig = new Array(c.length).fill(NaN); if (st >= 0) ema(line.slice(st), g).forEach((v, i) => sig[st + i] = v); return { line, sig, hist: line.map((x, i) => x - sig[i]) }; }
function adx(b, n = 14) { const len = b.length, o = new Array(len).fill(NaN), pdi = new Array(len).fill(NaN), mdi = new Array(len).fill(NaN); if (len < 2 * n + 1) return { adx: o, pdi, mdi };
  let trS = 0, pS = 0, mS = 0, dxs = [], a = NaN;
  for (let i = 1; i < len; i++) { const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l, p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    if (i <= n) { trS += tr; pS += p; mS += m; if (i < n) continue; } else { trS = trS - trS / n + tr; pS = pS - pS / n + p; mS = mS - mS / n + m; }
    const P = 100 * pS / (trS || 1e-12), M = 100 * mS / (trS || 1e-12), dx = 100 * Math.abs(P - M) / ((P + M) || 1e-12); pdi[i] = P; mdi[i] = M;
    if (isNaN(a)) { dxs.push(dx); if (dxs.length === n) { a = dxs.reduce((s, x) => s + x, 0) / n; o[i] = a; } } else { a = (a * (n - 1) + dx) / n; o[i] = a; } }
  return { adx: o, pdi, mdi }; }
function boll(c, n = 20, k = 2) { const m = sma(c, n), up = [], lo = [], w = [];
  for (let i = 0; i < c.length; i++) { if (isNaN(m[i])) { up.push(NaN); lo.push(NaN); w.push(NaN); continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - m[i]) ** 2; const sd = Math.sqrt(s / n); up.push(m[i] + k * sd); lo.push(m[i] - k * sd); w.push(2 * k * sd / m[i]); }
  return { mid: m, up, lo, width: w }; }
function donchian(b, n = 20) { const hi = new Array(b.length).fill(NaN), lo = new Array(b.length).fill(NaN);   // Hoch/Tief der n Kerzen VOR i (ohne i)
  for (let i = n; i < b.length; i++) { let h = -Infinity, l = Infinity; for (let j = i - n; j < i; j++) { h = Math.max(h, b[j].h); l = Math.min(l, b[j].l); } hi[i] = h; lo[i] = l; } return { hi, lo }; }
// Perzentil-Rang des letzten Werts innerhalb der letzten n Werte (0..1)
const pctRank = (x, i, n) => { const a = x.slice(Math.max(0, i - n + 1), i + 1).filter(v => !isNaN(v)); if (a.length < 5) return NaN; return a.filter(v => v <= x[i]).length / a.length; };
// Swing-Hochs/Tiefs (Fraktale, k Kerzen links/rechts) – für Struktur-Stops und Ziele
function swings(b, k = 3, upto = b.length - 1) { const hi = [], lo = [];
  for (let i = k; i <= upto - k; i++) { let H = true, L = true; for (let j = 1; j <= k; j++) { if (b[i].h <= b[i - j].h || b[i].h < b[i + j].h) H = false; if (b[i].l >= b[i - j].l || b[i].l > b[i + j].l) L = false; } if (H) hi.push({ i, p: b[i].h }); if (L) lo.push({ i, p: b[i].l }); }
  return { hi, lo }; }
// Alles auf einmal (für Analyst, Scanner, Backtest)
function compute(bars) {
  const c = bars.map(b => b.c), v = bars.map(b => b.v || 0);
  return { c, e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200), rsi: rsi(c, 14), atr: atr(bars, 14), macd: macd(c), adx: adx(bars, 14), bb: boll(c, 20, 2), dc: donchian(bars, 20), vma: sma(v, 20), v };
}
module.exports = { ema, sma, rsi, atr, macd, adx, boll, donchian, pctRank, swings, compute };
