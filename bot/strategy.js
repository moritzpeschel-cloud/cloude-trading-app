// PLAYBOOK – nur Strategien, die auf 2 Jahren echter Kursdaten (Yahoo, Stundenkerzen) in Lern- UND ungesehener Prüfphase
// nach allen Kosten (Spread, Kommission, Übernacht-Finanzierung) positiv waren (Labor-Ergebnis 18.11.2026):
//  1) TREND-RÜCKSETZER (1h, Tages-Trendfilter) – Gold, Silber, Bitcoin, Ethereum. Stop 2 ATR, kein festes Ziel,
//     Gewinne laufen mit Chandelier-Trailing 3,5 ATR (vom höchsten Schlusskurs), max. 240 h.
//     Robust über alle getesteten Parameter (Stop 1,5–2,5 / Trailing 2–4 ATR). Auf Devisen ±0 → dort NICHT gehandelt.
//  2) RSI-2-RÜCKKEHR (Tag) – S&P 500, Nasdaq 100, Dow Jones, nur Kauf: Schluss über SMA 200 und RSI(2) < 10,
//     Ausstieg Schluss über SMA 5 oder nach 10 Tagen, Not-Stop 2,5 ATR. 10-Jahres-Test (22.11.2026): nur US-Indizes in beiden
//     Phasen ≥ 0 (DAX, FTSE, CAC u. a. negativ) – kleiner Vorteil, daher HALBES Risiko (riskMul 0,5).
//  Forex: 5 Strategie-Familien auf 10 Paaren getestet (Trendfolge, RSI-2, Bollinger, London-Ausbruch, Rücksetzer) – keine profitabel → nur Beobachtung.
// Alle anderen Märkte: nur beobachten.
'use strict';
const T = require('./ta'), U = require('./util'), M = require('./market'), I = require('./instruments');
const PLAY = { XAUUSD: 'trend', XAGUSD: 'trend', BTCUSD: 'trend', ETHUSD: 'trend', US500: 'rsi2', NAS100: 'rsi2', US30: 'rsi2' };
const RISK_MUL = { trend: 1, rsi2: .5 };   // Risiko-Faktor je Strategie (Stärke des nachgewiesenen Vorteils)
const NAME = { trend: 'Trend-Rücksetzer', rsi2: 'RSI-2-Rückkehr' };
const P = { stopA: 2, trailA: 3.5, rsiMax: 65, touchA: .2, maxHoldH: 240, rsi2Lvl: 10, rsi2Exit: 5, rsi2Stop: 2.5, rsi2MaxD: 10 };
const FIN = sym => { const t = I.get(sym).type; return t === 'crypto' ? .20 : t === 'fx' ? .03 : .06; };   // Finanzierung p.a. auf den Positionswert
const playOf = sym => PLAY[sym] || null;
// Tages-Trend zum Zeitpunkt t (nur Tageskerzen, die mind. 1 Tag vor t fertig waren – kein Blick in die Zukunft)
function dailyTrendFn(d) { const dc = d.map(x => x.c), de = T.ema(dc, 50); let j = 0;
  return t => { while (j < d.length - 1 && d[j + 1].t <= t - 864e5) j++; const k = j; if (k < 51 || isNaN(de[k])) return 0;
    return dc[k] > de[k] && de[k] > de[k - 5] ? 1 : dc[k] < de[k] && de[k] < de[k - 5] ? -1 : 0; }; }
// Trend-Rücksetzer-Signal an Stundenkerze i
function trendAt(b, s, i, dTrend) {
  if (i < 210 || isNaN(s.atr[i])) return null; const a = s.atr[i], c = b[i].c, t = dTrend(b[i].t); if (!t) return null;
  if (t > 0 ? !(s.e20[i] > s.e50[i]) : !(s.e20[i] < s.e50[i])) return null;
  const touch = t > 0 ? b[i].l <= s.e20[i] + P.touchA * a && c > s.e20[i] && c > b[i].o : b[i].h >= s.e20[i] - P.touchA * a && c < s.e20[i] && c < b[i].o;
  if (!touch || (t > 0 ? s.rsi[i] > P.rsiMax : s.rsi[i] < 100 - P.rsiMax)) return null;
  return { dir: t, setup: NAME.trend, play: 'trend', q: .8, tf: '1h', t: b[i].t, ref: c, atr: a, stopDist: P.stopA * a };
}
function dailySeries(d) { const c = d.map(x => x.c); return { c, r2: T.rsi(c, 2), s200: T.sma(c, 200), s5: T.sma(c, P.rsi2Exit), atr: T.atr(d, 14) }; }
function rsi2At(d, ds, i) {
  if (i < 205 || isNaN(ds.atr[i])) return null; const c = ds.c[i]; if (!(c > ds.s200[i] && ds.r2[i] < P.rsi2Lvl)) return null;
  return { dir: 1, setup: NAME.rsi2, play: 'rsi2', q: .8, tf: '1d', t: d[i].t, ref: c, atr: ds.atr[i], stopDist: P.rsi2Stop * ds.atr[i] };
}
// letzte abgeschlossene Tageskerze (heutige Kerze zählt erst, wenn der Markt zu ist)
function lastClosedDaily(sym, d, now = Date.now()) { const L = d.length - 1; if (L < 0) return -1;
  return U.berlin(d[L].t).date === U.berlin(now).date && M.isOpen(I.get(sym), now) ? L - 1 : L; }
// Live-Signal für ein Symbol (m = Marktdaten mit h1, d1, s)
function signal(sym, m, now = Date.now()) {
  const pl = playOf(sym); if (!pl) return null;
  if (pl === 'trend') { const b = m.h1, i = b.length && b[b.length - 1].live ? b.length - 2 : b.length - 1; return trendAt(b, m.s, i, dailyTrendFn(m.d1)); }
  const d = m.d1, i = lastClosedDaily(sym, d, now); return i < 0 ? null : rsi2At(d, dailySeries(d), i);
}
// Trade-Plan: Grenze = Stop-Abstand. Ausstieg über Trailing bzw. SMA-5-Regel – das „Ziel“ ist nur ein weit entfernter
// Sicherheits-TP beim Broker (10 R Trend / 5 R RSI-2), damit Gewinner wie im Test laufen können. mcTarget = 3 R für die Monte-Carlo-Einordnung.
function plan(sym, m, sig, entry) {
  const risk = sig.stopDist, stop = entry - sig.dir * risk, rr = sig.play === 'rsi2' ? 5 : 10, target = entry + sig.dir * rr * risk, mcTarget = entry + sig.dir * 3 * risk;
  return { entry, stop, target, mcTarget, risk, rr, obstacle: null, obstacleR: null, atr: sig.atr, exit: sig.play === 'trend' ? `Trailing ${P.trailA} ATR vom besten Schlusskurs, max. ${P.maxHoldH} h` : `Schluss über SMA ${P.rsi2Exit} oder nach ${P.rsi2MaxD} Tagen` };
}
module.exports = { RISK_MUL, PLAY, NAME, P, FIN, playOf, signal, plan, trendAt, rsi2At, dailyTrendFn, dailySeries, lastClosedDaily };
