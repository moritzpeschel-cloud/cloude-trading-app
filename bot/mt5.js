// MT5-BROKER (Demo): gleiche Schnittstelle wie broker.js, aber ausgeführt wird über die MT5-Brücke (mt5_bridge/bridge.py),
// die auf dem Rechner mit dem MetaTrader-5-Terminal läuft. Die Brücke holt Befehle ab (GET /api/mt5/poll) und meldet
// Konto, Positionen, Orders, geschlossene Trades und Broker-Kurse zurück (POST /api/mt5/sync) – nur ausgehende Verbindungen.
// Preise: Der Bot rechnet mit seinen Kursdaten (Yahoo); der Broker kann leicht abweichen (z. B. Gold-Future vs. Spot).
// Deshalb gehen Stop/Ziel als ABSTAND zum Einstieg raus und Kursniveaus werden über einen laufenden Versatz je Symbol umgerechnet.
'use strict';
const fs = require('fs'), path = require('path'), U = require('./util'), I = require('./instruments');
const DIR = process.env.DATA_DIR || '/tmp/cloude-skill', FILE = path.join(DIR, 'mt5.json');
const MAGIC = +process.env.MT5_MAGIC || 261118, STALE = 60e3;
let S = null, saveT = null, EURUSD = 1.08;
const blank = () => ({ v: 1, seq: 1, meta: {}, hist: [], curve: [], dayStart: null, start: null, queue: [], account: null, positions: [], orders: [], lastSync: 0, offset: {}, events: [], seen: [] });
function load() { try { S = { ...blank(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')), positions: [], orders: [], account: null, lastSync: 0, events: [] }; } catch (_) { S = blank(); } return acc(); }
function save(now) { if (!S) return; syncSl(); const w = () => { try { fs.mkdirSync(DIR, { recursive: true }); const { positions, orders, events, ...keep } = S; fs.writeFileSync(FILE + '.tmp', JSON.stringify(keep)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.warn('mt5 save', e.message); } };
  if (now) return w(); clearTimeout(saveT); saveT = setTimeout(w, 1500); }
const connected = () => !!S && Date.now() - S.lastSync < STALE;
const ccyRate = () => { const c = S.account && S.account.currency; return !c || c === 'EUR' ? 1 : c === 'USD' ? EURUSD : 1; };   // Kontowährung -> EUR
const toAcc = eur => eur * ccyRate(), toEur = v => v / ccyRate();
const off = sym => S.offset[sym] || 0;
const cmd = c => { c.id = 'c' + (S.seq++); c.t = Date.now(); S.queue.push(c); save(); return c; };
// ---------- Schnittstelle wie broker.js ----------
function open({ sym, dir, sl, tp, mid, by, plan, meta, riskEur }) {
  const c = cmd({ cmd: 'open', type: 'market', sym, dir, slDist: Math.abs(mid - sl), tpDist: Math.abs(tp - mid), risk: U.round(toAcc(riskEur || 0), 2), magic: MAGIC, comment: ('TS ' + (by || '')).slice(0, 26) });
  S.meta[c.id] = { by, meta, sl0Dist: Math.abs(mid - sl), riskEur };
  return { id: c.id, sym, dir, lots: '≈', entry: mid, sl, tp, queued: true };
}
function placeLimit({ sym, dir, limit, sl, tp, by, plan, meta, riskEur, ttl = 6 * 3600e3 }) {
  const c = cmd({ cmd: 'open', type: 'limit', sym, dir, price: limit + off(sym), slDist: Math.abs(limit - sl), tpDist: Math.abs(tp - limit), risk: U.round(toAcc(riskEur || 0), 2), magic: MAGIC, expires: Date.now() + ttl, comment: ('TS ' + (by || '')).slice(0, 26) });
  S.meta[c.id] = { by, meta, sl0Dist: Math.abs(limit - sl), riskEur, expires: c.expires };
  return { id: c.id, sym, dir, limit, sl, tp, queued: true };
}
function close(p, mid, reason) {
  if (!S.queue.some(c => c.cmd === 'close' && c.ticket === p.id)) cmd({ cmd: 'close', ticket: p.id, sym: p.sym, reason });
  p.closing = reason;
  return { id: p.id, sym: p.sym, dir: p.dir, lots: p.lots, entry: p.entry, exit: mid, pnl: U.round(p.upnl || 0, 2), R: p.riskEur ? U.round((p.upnl || 0) / p.riskEur, 2) : 0, reason: reason + ' (an MT5 gesendet)', by: p.by };
}
function cancel(o) { if (!S.queue.some(c => c.cmd === 'cancel' && c.order === o.id)) cmd({ cmd: 'cancel', order: o.id, sym: o.sym }); }
// Ausstieg-Helfer verschiebt p.sl -> als SLTP-Änderung an MT5
function syncSl() { for (const p of S.positions) { if (p.closing) continue; const want = p.sl + off(p.sym), have = p._brokerSl;
  const tick = (I.get(p.sym) || {}).spread || 0; if (have == null || Math.abs(want - have) > tick * .5) { if (!S.queue.some(c => c.cmd === 'modify' && c.ticket === p.id && Math.abs(c.sl - want) < 1e-9)) { cmd({ cmd: 'modify', ticket: p.id, sym: p.sym, sl: want }); p._brokerSl = want; } } } }
function tick(prices) {
  if (!S) return []; for (const p of S.positions) if (prices[p.sym] != null) p.last = prices[p.sym];
  for (const o of S.orders) if (o.expires && Date.now() > o.expires && !S.queue.some(c => c.cmd === 'cancel' && c.order === o.id)) cmd({ cmd: 'cancel', order: o.id, sym: o.sym });
  const ev = S.events; S.events = []; return ev;
}
function equity() { if (!S.account) return S.curve.length ? S.curve[S.curve.length - 1][1] : 0; return toEur(S.account.equity); }
function mark(prices, t = Date.now()) { const eq = equity(), d = U.berlin(t).date; if (!eq) return eq;
  if (!S.dayStart || S.dayStart.date !== d) S.dayStart = { date: d, eq }; if (S.start == null) S.start = eq;
  const l = S.curve[S.curve.length - 1]; if (!l || t - l[0] > 10 * 60e3) { S.curve.push([t, U.round(eq, 2)]); if (S.curve.length > 3000) S.curve = S.curve.filter((_, i) => i % 2 === 0); save(); } else l[1] = U.round(eq, 2); return eq; }
function stats() { const H = S.hist, w = H.filter(h => h.pnl > 0), l = H.filter(h => h.pnl <= 0), gw = w.reduce((s, h) => s + h.pnl, 0), gl = Math.abs(l.reduce((s, h) => s + h.pnl, 0));
  let pk = S.start || 0, dd = 0; for (const [, e] of S.curve) { pk = Math.max(pk, e); if (pk) dd = Math.max(dd, (pk - e) / pk); } const since = ms => H.filter(h => h.close > Date.now() - ms).reduce((s, h) => s + h.pnl, 0);
  return { n: H.length, wins: w.length, losses: l.length, winrate: H.length ? w.length / H.length : null, pf: gl ? gw / gl : (gw ? 99 : null), avgR: H.length ? U.mean(H.map(h => h.R || 0)) : null,
    best: H.length ? Math.max(...H.map(h => h.pnl)) : null, worst: H.length ? Math.min(...H.map(h => h.pnl)) : null, maxDD: dd, week: U.round(since(7 * 864e5), 2), month: U.round(since(30 * 864e5), 2) }; }
function acc() { if (!S) return null; const eq = equity();
  return { start: S.start ?? eq, balance: S.account ? toEur(S.account.balance) : eq, pos: S.positions, orders: S.orders, hist: S.hist, curve: S.curve, dayStart: S.dayStart || { date: U.berlin().date, eq }, src: null, mt5: true }; }
// ---------- Brücke ----------
function poll() { if (!S) load(); const now = Date.now(); S.queue = S.queue.filter(c => now - c.t < 10 * 60e3); return { cmds: S.queue, magic: MAGIC, watch: I.watchlist() }; }
function sync(b, ourPrices = {}) {
  if (!S) load();
  const now = Date.now(); S.lastSync = now; const a = b.account || {};
  if (a.trade_mode !== 0 && a.trade_mode !== 'DEMO') { S.account = null; S.blocked = 'Kein Demo-Konto – Brücke gesperrt'; return { ok: false, error: S.blocked }; }
  S.blocked = null; S.account = { login: a.login, server: String(a.server || '').slice(0, 60), company: String(a.company || '').slice(0, 60), currency: a.currency || 'EUR', balance: +a.balance || 0, equity: +a.equity || 0, leverage: a.leverage };
  if (ourPrices.EURUSD) EURUSD = ourPrices.EURUSD;
  // Versatz Broker-Kurs vs. Bot-Kurs je Symbol (geglättet)
  for (const [sym, px] of Object.entries(b.prices || {})) { const o = ourPrices[sym]; if (!(px > 0) || !(o > 0)) continue; const d = px - o; if (Math.abs(d) / o > .05) continue; S.offset[sym] = S.offset[sym] == null ? d : S.offset[sym] * .8 + d * .2; }
  // Ergebnisse der Befehle
  for (const r of b.results || []) { const c = S.queue.find(x => x.id === r.id); S.queue = S.queue.filter(x => x.id !== r.id); if (!c) continue;
    if (c.cmd === 'open' && r.ok && r.ticket) { const m = S.meta[c.id] || {}; S.meta['t' + r.ticket] = { ...m, open: now, comment: c.comment }; delete S.meta[c.id]; if (c.type === 'market') S.events.push({ type: 'fill', p: { id: r.ticket, sym: c.sym, dir: c.dir, lots: r.volume, entry: r.price - off(c.sym), sl: r.sl - off(c.sym), tp: r.tp - off(c.sym) } }); }
    else if (!r.ok) S.events.push({ type: 'reject', c, error: String(r.error || 'Fehler').slice(0, 140) }); }
  // Positionen (nur eigene Magic)
  const prev = new Map(S.positions.map(p => [p.id, p]));
  S.positions = (b.positions || []).filter(x => x.magic === MAGIC && I.get(x.sym)).map(x => { const p = prev.get(x.ticket) || {}, m = S.meta['t' + x.ticket] || S.meta['p' + x.ticket] || {}, o = off(x.sym), dir = x.type === 0 ? 1 : -1;
    const entry = x.price_open - o, sl0Dist = m.sl0Dist || Math.abs(x.price_open - (x.sl || x.price_open)) || 1, upnl = toEur((+x.profit || 0) + (+x.swap || 0));
    const riskEur = m.riskEur || p.riskEur || null;
    const q = Object.assign(p, { id: x.ticket, sym: x.sym, dir, lots: x.volume, entry, sl: x.sl ? x.sl - o : entry - dir * sl0Dist, tp: x.tp ? x.tp - o : null, sl0: entry - dir * sl0Dist, open: x.time * 1000, last: (x.price_current || x.price_open) - o, upnl: U.round(upnl, 2), by: m.by || x.comment || 'MT5', meta: m.meta, riskEur, broker: x.symbol });
    q._brokerSl = x.sl || null; if (q.be == null) q.be = dir * ((x.sl || 0) - x.price_open) >= 0 && !!x.sl; q.maxR = Math.max(q.maxR || 0, dir * (q.last - entry) / sl0Dist); return q; });
  S.orders = (b.orders || []).filter(x => x.magic === MAGIC && I.get(x.sym)).map(x => ({ id: x.ticket, sym: x.sym, dir: x.type % 2 === 0 ? 1 : -1, lots: x.volume, limit: x.price - off(x.sym), sl: x.sl - off(x.sym), tp: x.tp - off(x.sym), by: (x.comment || '').replace(/^TS /, ''), expires: (S.meta['t' + x.ticket] || {}).expires || null, dp: I.get(x.sym).dp }));
  // geschlossene Trades
  for (const h of b.closed || []) { if (h.magic !== MAGIC || S.seen.includes(h.position)) continue; S.seen.push(h.position); if (S.seen.length > 2000) S.seen = S.seen.slice(-1000);
    const m = S.meta['t' + h.position] || {}, o = off(h.sym), pnl = U.round(toEur(h.pnl), 2);
    const rec = { id: h.position, sym: h.sym, dir: h.dir, lots: h.volume, entry: h.entry - o, exit: h.exit - o, sl: null, tp: null, open: h.time_open * 1000, close: h.time * 1000, pnl, R: m.sl0Dist ? U.round(h.dir * (h.exit - h.entry) / m.sl0Dist, 2) : null, reason: h.reason || 'geschlossen', by: m.by || 'MT5', meta: m.meta };
    S.hist.unshift(rec); S.hist = S.hist.slice(0, 500); delete S.meta['t' + h.position]; S.events.push({ type: 'close', h: rec }); }
  save(); return { ok: true, ...poll() };
}
const ensure = () => { if (!S) load(); };
const status = () => S ? { connected: connected(), lastSync: S.lastSync || null, account: S.account, blocked: S.blocked || null, queue: S.queue.length, magic: MAGIC, offset: Object.fromEntries(Object.entries(S.offset).map(([k, v]) => [k, U.round(v, 5)])) } : { connected: false };
module.exports = { mode: 'mt5', load, save, reset() { throw new Error('MT5-Konto kann nicht zurückgesetzt werden – im Demo-Konto beim Broker zurücksetzen'); }, open, placeLimit, close, tick, equity, mark, stats, acc,
  setFx: p => { if (p > .5 && p < 2) EURUSD = p; }, toEur: require('./broker').toEur, poll, sync, status, connected, cancel, MAGIC, _S: () => S };
