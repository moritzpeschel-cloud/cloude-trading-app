// Marktdaten: Live-Kurse von Yahoo Finance (ohne API-Key), sonst ein realistischer Markt-Simulator (deutlich als SIMULIERT markiert).
// Kerzen: { t (ms, Bar-Beginn), o, h, l, c, v }. 1h-Kerzen für Signale, 1d-Kerzen für den großen Trend.
// Datenquelle ist GLOBAL (alle Symbole live oder alle simuliert), damit nie Kurse zweier Quellen gemischt werden.
'use strict';
const https = require('https');
const U = require('./util'), I = require('./instruments');
const H = 3600e3, D = 24 * H;
const MODE_ENV = (process.env.DATA_SOURCE || 'auto').toLowerCase();   // auto | live | sim
let SOURCE = MODE_ENV === 'sim' ? 'sim' : 'probe', lastProbe = 0, lastError = null;
const cache = new Map();   // sym -> { h1, d1, price, t, src, fetchedH1, fetchedD1 }

// ---------- Handelszeiten ----------
function isOpen(inst, t = Date.now()) {
  if (inst.session === '24/7') return true;
  const ny = U.nyTime(t);
  if (inst.session === 'fx') { if (ny.wd === 'Sat') return false; if (ny.wd === 'Fri' && ny.mins >= 17 * 60) return false; if (ny.wd === 'Sun' && ny.mins < 17 * 60) return false; return true; }
  if (inst.session === 'us') return !['Sat', 'Sun'].includes(ny.wd) && ny.mins >= 570 && ny.mins < 960;
  if (inst.session === 'eu') { const b = U.berlin(t); const m = b.h * 60 + b.m; return !['Sat', 'Sun'].includes(b.wd) && m >= 540 && m < 1050; }
  return true;
}

// ---------- Yahoo Finance ----------
function get(url, timeout = 12000) {
  return new Promise((ok, no) => {
    const r = https.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; trader-skill/2.0)', Accept: 'application/json,text/xml,*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return get(new URL(res.headers.location, url).href, timeout).then(ok, no); }
      const b = []; res.on('data', c => b.push(c)); res.on('end', () => res.statusCode === 200 ? ok(Buffer.concat(b).toString()) : no(new Error('HTTP ' + res.statusCode)));
    });
    r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', no);
  });
}
async function yahoo(sym, range, interval) {
  const inst = I.get(sym);
  const j = JSON.parse(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.yahoo)}?range=${range}&interval=${interval}&includePrePost=false`));
  const r = j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.timestamp) throw new Error('keine Daten');
  const q = r.indicators.quote[0], out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(x => x == null || !isFinite(x))) continue;
    out.push({ t: r.timestamp[i] * 1000, o, h, l, c, v: q.volume[i] || 0 });
  }
  return { bars: out, price: r.meta.regularMarketPrice || (out.length ? out[out.length - 1].c : null), mt: (r.meta.regularMarketTime || 0) * 1000 };
}

// ---------- Simulator (deterministisch: gleiche Kerze zu gleicher Zeit, GARCH-Volatilität + Trend-Regime) ----------
const SIM_EPOCH = Date.UTC(2026, 0, 1);
const simState = new Map();
function simStep(st, inst, r) {   // eine Stunde weiter
  const base = inst.vol / Math.sqrt(252 * 24);
  if (--st.regLeft <= 0) { st.regLeft = 80 + Math.floor(r() * 260); const z = r(); st.drift = z < .35 ? base * .09 : z < .7 ? -base * .09 : 0; }
  const e = U.gauss(r) * Math.sqrt(st.s2);
  st.s2 = base * base * .05 + .1 * e * e + .85 * st.s2;   // GARCH(1,1)
  const fat = r() < .015 ? U.gauss(r) * 3 * base : 0;      // seltene Sprünge (News)
  const o = st.p, c = o * Math.exp(st.drift + e + fat + (Math.log(inst.px0) - Math.log(o)) * .0004);
  const wig = Math.abs(U.gauss(r)) * Math.sqrt(st.s2) * .7, wig2 = Math.abs(U.gauss(r)) * Math.sqrt(st.s2) * .7;
  st.p = c; return { o, h: Math.max(o, c) * (1 + wig), l: Math.min(o, c) * (1 - wig2), c, v: Math.round(1000 * (1 + Math.abs(e) / base) * (0.6 + r())) };
}
function simulate(sym, now = Date.now()) {
  const inst = I.get(sym); let st = simState.get(sym);
  if (!st) { st = { p: inst.px0, s2: (inst.vol / Math.sqrt(252 * 24)) ** 2, drift: 0, regLeft: 0, t: SIM_EPOCH, r: U.rng(U.hash('sim|' + sym)), bars: [] }; simState.set(sym, st); }
  const cur = Math.floor(now / H) * H;
  while (st.t < cur) { const b = simStep(st, inst, st.r); if (isOpen(inst, st.t)) st.bars.push({ t: st.t, ...b }); else st.p = b.o; st.t += H; if (st.bars.length > 9000) st.bars.splice(0, 2000); }
  // laufende Kerze minutengenau (deterministisch je Stunde)
  const bars = st.bars.slice(-1500);
  if (isOpen(inst, now)) {
    const r = U.rng(U.hash(sym + '|' + cur)), mins = Math.floor((now - cur) / 60e3), s = Math.sqrt(st.s2) / Math.sqrt(60);
    let p = st.p, h = p, l = p; for (let m = 0; m <= mins; m++) { p *= Math.exp(U.gauss(r) * s + st.drift / 60); h = Math.max(h, p); l = Math.min(l, p); }
    bars.push({ t: cur, o: st.p, h, l, c: p, v: Math.round(800 * (mins + 1) / 60), live: true });
  }
  return bars;
}
function toDaily(h1) {
  const m = new Map();
  for (const b of h1) { const k = U.berlin(b.t).date; const d = m.get(k); if (!d) m.set(k, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }); else { d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l); d.c = b.c; d.v += b.v; } }
  return [...m.values()];
}

// ---------- öffentliche API ----------
async function probe() {
  lastProbe = Date.now();
  try { await yahoo('EURUSD', '1d', '1h'); SOURCE = 'live'; lastError = null; }
  catch (e) { lastError = String(e.message || e).slice(0, 60); SOURCE = MODE_ENV === 'live' ? 'live' : 'sim'; }
  return SOURCE;
}
async function load(sym, now = Date.now()) {
  if (SOURCE === 'probe' || (SOURCE === 'sim' && MODE_ENV === 'auto' && now - lastProbe > 30 * 60e3)) await probe();
  const inst = I.get(sym);
  if (SOURCE === 'sim') { const h1 = simulate(sym, now); const c = { h1, d1: toDaily(simState.get(sym).bars), price: h1[h1.length - 1].c, t: now, mt: h1[h1.length - 1].t, src: 'sim', open: isOpen(inst, now) }; cache.set(sym, c); return c; }
  let c = cache.get(sym);
  if (!c || c.src !== 'live') c = { h1: [], d1: [], price: null, t: 0, src: 'live', fetchedH1: 0, fetchedD1: 0 };
  try {
    if (!c.h1.length || now - c.fetchedH1 > 55e3) {
      const full = !c.h1.length || now - c.fetchedFull > 6 * H;
      const r = await yahoo(sym, full ? '60d' : '5d', '1h');
      if (full) { c.h1 = r.bars; c.fetchedFull = now; } else { const from = r.bars.length ? r.bars[0].t : Infinity; c.h1 = c.h1.filter(b => b.t < from).concat(r.bars).slice(-1500); }
      c.price = r.price; c.mt = r.mt; c.fetchedH1 = now;
    }
    if (!c.d1.length || now - c.fetchedD1 > 6 * H) { c.d1 = (await yahoo(sym, '2y', '1d')).bars; c.fetchedD1 = now; }
    c.err = null;
  } catch (e) { c.err = String(e.message || e).slice(0, 60); lastError = sym + ': ' + c.err; if (!c.h1.length) throw e; }
  c.t = now; c.open = isOpen(inst, now) && now - (c.mt || 0) < 3 * H; cache.set(sym, c); return c;
}
const status = () => ({ source: SOURCE === 'probe' ? 'startet' : SOURCE, error: lastError, forced: MODE_ENV !== 'auto' });
module.exports = { load, isOpen, simulate, toDaily, status, probe, get, _setSource: s => { SOURCE = s; } };
