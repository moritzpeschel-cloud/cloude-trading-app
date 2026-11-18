// BROKER-Helfer: Paper-Trading-Konto in EUR (kein echtes Geld). Market- und Limit-Orders mit Spread, Slippage, Kommission;
// Stop (Grenze) / Ziel werden bei jedem Kurs-Tick geprüft; Kurslücken werden zum schlechteren Kurs gefüllt (realistisch).
// Alles wird in DATA_DIR/paper.json gespeichert (Render Free: /tmp – nach Neustart startet das Konto neu, siehe README).
'use strict';
const fs = require('fs'), path = require('path'), I = require('./instruments'), U = require('./util');
const DIR = process.env.DATA_DIR || '/tmp/cloude-skill', FILE = path.join(DIR, 'paper.json');
let A = null, saveT = null;
const blank = (bal = 10000) => ({ v: 2, start: bal, balance: bal, pos: [], orders: [], hist: [], curve: [], seq: 1, created: Date.now(), dayStart: { date: U.berlin().date, eq: bal }, src: null });
function load(bal) { try { A = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (A.v !== 2) throw 0; } catch (_) { A = blank(bal); } return A; }
function save(now = false) { const w = () => { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(A)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.warn('paper save', e.message); } };
  if (now) return w(); clearTimeout(saveT); saveT = setTimeout(w, 1500); }
function reset(bal = 10000) { A = blank(bal); save(true); return A; }
// Umrechnung Gewinn in Quote-Währung -> EUR
let EURUSD = 1.08; const setFx = p => { if (p > .5 && p < 2) EURUSD = p; };
const toEur = (sym, q, px) => { const inst = I.get(sym); const usd = inst.quoteUsd === false ? q / px : q; return usd / EURUSD; };
const pnlOf = (p, px) => toEur(p.sym, p.dir * (px - p.entry) * p.lots * I.get(p.sym).cs, px);
const commEur = (sym, lots) => (I.get(sym).comm || 0) * lots / EURUSD;
const quote = (sym, mid) => { const s = I.get(sym).spread; return { bid: mid - s / 2, ask: mid + s / 2 }; };
function slip(sym, r = Math.random) { return I.get(sym).spread * .15 * r(); }
function open({ sym, dir, lots, sl, tp, mid, by, plan, meta, t = Date.now() }) {
  const q = quote(sym, mid), px = dir > 0 ? q.ask + slip(sym) : q.bid - slip(sym), c = commEur(sym, lots);
  const p = { id: A.seq++, sym, dir, lots, entry: px, sl, tp, sl0: sl, open: t, by, plan, meta, comm: c, maxR: 0, be: false, last: mid, riskEur: Math.abs(toEur(sym, (px - sl) * lots * I.get(sym).cs, px)) };
  A.balance -= c; A.pos.push(p); save(); return p;
}
function placeLimit({ sym, dir, lots, limit, sl, tp, by, plan, meta, ttl = 6 * 3600e3, t = Date.now() }) {
  const o = { id: A.seq++, sym, dir, lots, limit, sl, tp, by, plan, meta, placed: t, expires: t + ttl }; A.orders.push(o); save(); return o;
}
function close(p, mid, reason, t = Date.now(), px = null) {
  const q = quote(p.sym, mid); px = px != null ? px : (p.dir > 0 ? q.bid : q.ask);
  const c = commEur(p.sym, p.lots), gross = pnlOf(p, px), net = gross - c - p.comm;
  A.balance += gross - c; A.pos = A.pos.filter(x => x.id !== p.id);
  const h = { id: p.id, sym: p.sym, dir: p.dir, lots: p.lots, entry: p.entry, exit: px, sl: p.sl0, tp: p.tp, open: p.open, close: t, pnl: U.round(net, 2), R: U.round(net / (p.riskEur || 1), 2), reason, by: p.by, meta: p.meta };
  A.hist.unshift(h); A.hist = A.hist.slice(0, 500); save(); return h;
}
// Tick: Limit-Fills, Verfall, Stop/Ziel. events: [{type:'fill'|'expire'|'close', ...}]
function tick(prices, t = Date.now()) {
  const ev = [];
  for (const o of [...A.orders]) { const mid = prices[o.sym]; if (mid == null) continue; const q = quote(o.sym, mid);
    if (t > o.expires) { A.orders = A.orders.filter(x => x !== o); ev.push({ type: 'expire', o }); continue; }
    const hit = o.dir > 0 ? q.ask <= o.limit : q.bid >= o.limit;
    if (hit) { A.orders = A.orders.filter(x => x !== o); const p = open({ ...o, mid, t }); p.entry = o.dir > 0 ? Math.min(q.ask, o.limit) : Math.max(q.bid, o.limit); ev.push({ type: 'fill', p }); } }
  for (const p of [...A.pos]) { const mid = prices[p.sym]; if (mid == null) continue; const q = quote(p.sym, mid), px = p.dir > 0 ? q.bid : q.ask; p.last = mid;
    const r = p.dir * (px - p.entry) / Math.abs(p.entry - p.sl0); p.maxR = Math.max(p.maxR, r);
    if (p.dir > 0 ? px <= p.sl : px >= p.sl) ev.push({ type: 'close', h: close(p, mid, p.be ? (p.sl > p.entry ? 'Trailing-Stop' : 'Break-even') : 'Grenze (Stop)', t) });
    else if (p.dir > 0 ? px >= p.tp : px <= p.tp) ev.push({ type: 'close', h: close(p, mid, 'Ziel erreicht', t) }); }
  if (ev.length) save(); return ev;
}
function equity(prices) { let u = 0; for (const p of A.pos) { const mid = prices[p.sym] ?? p.last; const q = quote(p.sym, mid); p.upnl = U.round(pnlOf(p, p.dir > 0 ? q.bid : q.ask), 2); u += p.upnl; } return A.balance + u; }
function mark(prices, t = Date.now()) {
  const eq = equity(prices), d = U.berlin(t).date; if (A.dayStart.date !== d) A.dayStart = { date: d, eq };
  const lastPt = A.curve[A.curve.length - 1]; if (!lastPt || t - lastPt[0] > 10 * 60e3) { A.curve.push([t, U.round(eq, 2)]); if (A.curve.length > 3000) A.curve = A.curve.filter((_, i) => i % 2 === 0); save(); } else lastPt[1] = U.round(eq, 2);
  return eq;
}
function stats() {
  const H = A.hist, w = H.filter(h => h.pnl > 0), l = H.filter(h => h.pnl <= 0), gw = w.reduce((s, h) => s + h.pnl, 0), gl = Math.abs(l.reduce((s, h) => s + h.pnl, 0));
  let pk = A.start, dd = 0; for (const [, e] of A.curve) { pk = Math.max(pk, e); dd = Math.max(dd, (pk - e) / pk); }
  const since = ms => H.filter(h => h.close > Date.now() - ms).reduce((s, h) => s + h.pnl, 0);
  return { n: H.length, wins: w.length, losses: l.length, winrate: H.length ? w.length / H.length : null, pf: gl ? gw / gl : (gw ? 99 : null), avgR: H.length ? U.mean(H.map(h => h.R)) : null,
    best: H.length ? Math.max(...H.map(h => h.pnl)) : null, worst: H.length ? Math.min(...H.map(h => h.pnl)) : null, maxDD: dd, week: U.round(since(7 * 864e5), 2), month: U.round(since(30 * 864e5), 2) };
}
module.exports = { load, save, reset, open, placeLimit, close, tick, equity, mark, stats, setFx, quote, toEur, pnlOf, acc: () => A, FILE };
