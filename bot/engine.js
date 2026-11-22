// TRADER-SKILL ENGINE – ein Zyklus (Standard alle 60 s):
//  Daten → Broker-Tick (Fills/Stops/Ziele) → Ausstieg managt offene Trades → Scanner → für die besten Setups:
//  Analyst → News → Kongress → Einstieg → Ausstieg-Plan → Time Machine → Risiko → Budget → (KI-Prüfer) → Broker → Alarm.
// Ergebnis: snapshot() für das Dashboard. Nur Paper-Trading – es wird nie echtes Geld bewegt.
'use strict';
const fs = require('fs'), path = require('path');
const M = require('./market'), T = require('./ta'), H = require('./helpers'), PAPER = require('./broker'), MT5 = require('./mt5'), I = require('./instruments'), U = require('./util');
const K = require('./congress'), AI = require('./claude');
const DIR = process.env.DATA_DIR || '/tmp/cloude-skill', CFG_FILE = path.join(DIR, 'config.json'), AL_FILE = path.join(DIR, 'alarms.json');
let B = PAPER;
const DEF = { broker: process.env.BROKER === 'mt5' ? 'mt5' : 'paper', auto: true, kill: false, riskMode: 'eur', riskEur: 5, maxDailyLossEur: 10, maxTradesDay: 10, riskPct: 0.5, maxDailyLossPct: 3, maxOpen: 4, maxPerGroup: 2, maxLeverage: 10, minScore: 0.62, minEV: 0.05, rr: 2, horizon: 48, mcRuns: 10000, claude: false, startBalance: 10000, intervalS: 60 };
const LIM = { riskEur: [1, 1000], maxDailyLossEur: [2, 5000], maxTradesDay: [1, 20], riskPct: [0.05, 3], maxDailyLossPct: [0.5, 10], maxOpen: [1, 10], maxPerGroup: [1, 6], maxLeverage: [1, 30], minScore: [0.4, 0.95], minEV: [-0.2, 1], rr: [1, 5], horizon: [6, 120], mcRuns: [1000, 20000] };
let CFG = { ...DEF }, ALARMS = [], NOTIFY = () => {}, TIMER = null, RUNNING = false, BUSY = false;
const S = { gen: 0, cycle: 0, lastMs: 0, last: 0, helpers: {}, scanner: [], focus: null, journal: [], alarmLog: [], markets: {}, analysts: {}, error: null, started: Date.now(), dup: new Set() };
const wl = I.watchlist();
try { CFG = { ...DEF, ...JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) }; } catch (_) {}
try { ALARMS = JSON.parse(fs.readFileSync(AL_FILE, 'utf8')); } catch (_) {}
const persist = () => { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(CFG_FILE, JSON.stringify(CFG)); fs.writeFileSync(AL_FILE, JSON.stringify(ALARMS)); } catch (_) {} };
const setH = (k, r) => { S.helpers[k] = { s: r.s, t: r.t, at: Date.now() }; };
const log = (text, chips = [], kind = 'info', sym = null) => { S.journal.unshift({ t: Date.now(), text, h: chips, kind, sym }); S.journal = S.journal.slice(0, 120); };
const fmt = (sym, x) => U.fmtPrice(x, I.get(sym).dp), side = d => d > 0 ? 'KAUF' : 'VERKAUF';
const eur = v => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const brokerOk = () => B.mode !== 'mt5' || MT5.connected();
// Verlust-Bremse: Rückgang vom Höchststand der Equity -> ab 10 % halbes Risiko, ab 20 % keine neuen Trades
// Eigene Trades (Paper: alle; MT5: nur Magic 261118) – Grundlage für Euro-Limits, Tagesbilanz und Verlust-Bremse
function ownBook() { const acc = B.acc(), today = U.berlin().date, isToday = t => t && U.berlin(t).date === today;
  const hist = acc.hist || [], pos = acc.pos || [];
  const closedToday = hist.filter(h => isToday(h.close)), realizedLoss = -closedToday.filter(h => h.pnl < 0).reduce((a, h) => a + h.pnl, 0), realizedNet = closedToday.reduce((a, h) => a + (h.pnl || 0), 0);
  const remRisk = p => { const d0 = Math.abs(p.entry - (p.sl0 ?? p.sl)) || 1, frac = U.clamp(p.dir * (p.entry - p.sl) / d0, 0, 1);
    if (p.riskEur) return p.riskEur * frac; const inst = I.get(p.sym); return inst ? Math.max(0, -PAPER.toEur(p.sym, p.dir * (p.sl - p.entry) * p.lots * inst.cs, p.entry)) : 0; };
  const openRisk = pos.reduce((a, p) => a + remRisk(p), 0), upnl = pos.reduce((a, p) => a + (p.upnl || 0), 0);
  const entriesToday = pos.filter(p => isToday(p.open)).length + hist.filter(h => isToday(h.open)).length;
  const symsToday = [...new Set([...pos.filter(p => isToday(p.open)), ...hist.filter(h => isToday(h.open))].map(x => x.sym))];
  let run = 0, pk = 0; for (const h of [...hist].sort((a, b) => a.close - b.close)) { run += h.pnl || 0; pk = Math.max(pk, run); } const total = run + upnl; pk = Math.max(pk, total);
  return { realizedLoss, realizedNet, openRisk, upnl, today: realizedNet + upnl, entriesToday, symsToday, total, ddEur: Math.max(0, pk - total) }; }
function ddState(eq) { let dd, ddEur = null;
  if (CFG.riskMode === 'eur') { ddEur = ownBook().ddEur; dd = ddEur / (100 * CFG.riskEur); }   // Bot-Budget = 100 × Risiko je Trade (5 € → 500 €)
  else { const acc = B.acc(); let pk = acc.start || eq; for (const [, e] of acc.curve || []) pk = Math.max(pk, e); pk = Math.max(pk, eq); dd = pk > 0 ? Math.max(0, (pk - eq) / pk) : 0; }
  const lvl = dd >= .20 ? 2 : dd >= .10 ? 1 : 0;
  if (lvl !== S.ddLvl && S.ddLvl != null) { const t = lvl === 2 ? '⛔ Verlust-Bremse: neue Trades pausiert' : lvl === 1 ? '⚠️ Verlust-Bremse: halbes Risiko' : '✅ Verlust-Bremse aufgehoben';
    log(`${t} (Rückgang ${(dd * 100).toFixed(1)} % vom Höchststand)`, [{ n: 'Risiko', e: 'Bremse' }], 'cfg'); NOTIFY({ id: 'dd:' + lvl + ':' + U.berlin().date, kind: 'alert', color: lvl ? 'red' : 'green', title: t, body: `Rückgang ${(dd * 100).toFixed(1)} % vom Höchststand` }); }
  S.ddLvl = lvl; return { dd, ddEur, ddMul: lvl === 2 ? 0 : lvl === 1 ? .5 : 1 }; }
// Leistungs-Check: Live-Ergebnisse (R) gegen das, was der Rückblick erwarten lässt
function perfCheck() { const H = (B.acc().hist || []).filter(h => h.R != null && h.close >= S.started); const n = H.length, sum = H.reduce((a, h) => a + h.R, 0), avg = n ? sum / n : null;
  const ex = Object.values(S.expect || {}); const exp = ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : null;
  const band = n ? 1.5 * 2 / Math.sqrt(n) : null;   // ~2 Standardfehler bei typischer Streuung 1,5 R je Trade
  const status = n < 20 || exp == null ? 'sammelt' : avg < exp - band ? 'warn' : 'ok';
  return { n, sumR: U.round(sum, 2), avgR: avg == null ? null : U.round(avg, 3), expR: exp == null ? null : U.round(exp, 3), status,
    text: status === 'sammelt' ? `${n} von 20 Trades für eine Aussage gesammelt` : status === 'warn' ? `Live schwächer als im Test (Ø ${avg.toFixed(2)} R statt ${exp.toFixed(2)} R) – beobachten, ggf. Risiko senken` : `Live im erwarteten Bereich (Ø ${avg.toFixed(2)} R, Test ${exp.toFixed(2)} R)` }; }
function useBroker() {
  if (CFG.broker === 'mt5' && B === PAPER && PAPER.acc()) { const pa = PAPER.acc(); for (const p of [...pa.pos]) { const m = S.markets[p.sym]; const h = PAPER.close(p, m ? m.price : p.last, 'Wechsel auf MT5'); log(`${h.sym}: Paper-Trade geschlossen (Wechsel auf MT5) · ${eur(h.pnl)}`, [], h.pnl >= 0 ? 'win' : 'loss', h.sym); } pa.orders = []; PAPER.save(); }
  B = CFG.broker === 'mt5' ? MT5 : PAPER; B.load(CFG.startBalance); S.dup = new Set(); }
// Brücke weg? Dann nicht stillstehen: nach 10 Min. ohne Meldung auf Paper weiterhandeln (BROKER=mt5 erzwingt MT5)
function brokerFallback() {
  if (CFG.broker !== 'mt5' || process.env.BROKER === 'mt5' || MT5.connected()) return;
  const st = MT5.status(), since = st.lastSync || S.mt5Since || (S.mt5Since = Date.now());
  if (Date.now() - since < 10 * 60e3) return;
  if (B.acc().pos.length) return;   // offene MT5-Trades: nicht wechseln (Stop/Ziel liegen beim Broker)
  S.mt5Since = null; CFG.broker = 'paper'; persist(); useBroker();
  log('MT5-Brücke seit über 10 Min. nicht erreichbar – Bot handelt vorerst mit dem Paper-Konto weiter (schaltet automatisch zurück, sobald die Brücke wieder läuft)', [{ n: 'Broker', e: 'Paper' }], 'cfg');
  NOTIFY({ id: 'mt5off:' + Math.floor(Date.now() / 36e5), kind: 'alert', color: 'red', title: '⚠️ MT5-Brücke weg', body: 'Bot handelt vorerst mit dem Paper-Konto weiter' });
}
function setConfig(b) {
  for (const k of Object.keys(DEF)) { if (!(k in b)) continue;
    if (k === 'broker') { const v = b.broker === 'mt5' ? 'mt5' : 'paper'; S.mt5Since = null; if (v !== CFG.broker) { CFG.broker = v; useBroker(); log(v === 'mt5' ? 'Broker gewechselt: MT5-Demo-Konto (über die Brücke)' : 'Broker gewechselt: Paper-Konto', [{ n: 'Broker', e: v }], 'cfg'); } }
    else if (k === 'riskMode') CFG.riskMode = b.riskMode === 'pct' ? 'pct' : 'eur';
    else if (typeof DEF[k] === 'boolean') CFG[k] = !!b[k];
    else if (LIM[k] && isFinite(+b[k])) CFG[k] = U.clamp(+b[k], ...LIM[k]); }
  persist(); log(`Einstellungen geändert: ${Object.keys(b).filter(k => k in DEF).map(k => k + '=' + CFG[k]).join(', ')}`, [], 'cfg'); return CFG;
}
// ---------- Analyse eines Symbols (auch ohne Trade, z. B. „Analysieren“ im Dashboard) ----------
async function analyze(sym, sigIn = null, ctx = null) {
  await K.refresh(); const m = S.markets[sym] || await loadMarket(sym), now = Date.now(); if (!m || m.h1.length < 220) throw new Error('zu wenig Daten für ' + sym);
  const i = H.lastClosed(m.h1); let sig = sigIn || require('./strategy').signal(sym, m), hypo = false;
  if (sig && sig.stopDist == null) { const a14 = m.s.atr[i]; sig = { tf: '1h', t: m.h1[i].t, ref: m.h1[i].c, atr: a14, stopDist: 2 * a14, play: require('./strategy').playOf(sym), ...sig }; }   // z. B. manuell eingespeiste Signale
  const an = H.analyst(sym, m); S.analysts[sym] = an;
  if (!sig) { hypo = true; const a14 = m.s.atr[i]; sig = { dir: an.bias >= 0 ? 1 : -1, setup: 'Beobachtung (kein Signal)', q: 0, tf: '1h', t: m.h1[i].t, ref: m.h1[i].c, atr: a14, stopDist: 2 * a14, play: null }; }
  const [nw, ko] = [await H.news(sym, now), H.kongress(sym)];
  const ein = H.einstieg(sym, m, sig), entry = ein.type === 'limit' ? ein.price : m.price;
  const plan = H.ausstiegPlan(sym, m, sig, entry), tm = H.timemachine(sym, m, sig, plan, CFG, U.hash(sym + m.h1[i].t));
  if (!hypo && tm.bt && tm.bt.n >= 15) { S.expect = S.expect || {}; S.expect[sym] = tm.bt.avgR; }
  if (!B.acc()) B.load(CFG.startBalance); const acc = B.acc(), prices = priceMap(), eq = B.equity(prices);
  ctx = ctx || { cfg: CFG, acc, eq, positions: acc.pos, open: m.open, broker: brokerOk(), own: ownBook(), ...ddState(eq) };
  // Kurssprung-Pause: bewegte sich der Markt in einer der letzten 2 Stundenkerzen > 3 ATR, 2 h lang keine neuen Einstiege in diesem Markt
  { const b = m.h1, j = H.lastClosed(b); let shock = { on: false, atr: 0, leftMin: 0 };
    for (let k = j; k > j - 2 && k > 15; k--) { const a14 = m.s.atr[k - 1], mv = Math.abs(b[k].c - b[k - 1].c) / (a14 || Infinity), left = Math.round((b[k].t + 3 * 3600e3 - now) / 60e3);
      if (mv > 3 && left > 0) { shock = { on: true, atr: mv, leftMin: left }; break; } }
    ctx = { ...ctx, shock }; }
  const bu = H.budget(sym, plan, tm, ctx), rk = H.risiko(sym, sig, plan, tm, an, nw, { ...ctx, newRisk: bu.riskEur });
  // Gesamtnote 0..100 (wie stark stimmen die Helfer überein?)
  const al = x => U.clamp(x * sig.dir, -1, 1);
  const grade = hypo ? null : Math.round(U.clamp(sig.q * 40 + (al(an.bias) + 1) / 2 * 25 + (al(nw.score) + 1) / 2 * 10 + (al(ko.score) + 1) / 2 * 5 + U.clamp(tm.adj.evR / .5, 0, 1) * 20, 0, 100));
  const lb = m.h1.slice(-140), s = m.s, off = m.h1.length - lb.length;
  return { sym, name: I.get(sym).name, dp: I.get(sym).dp, price: m.price, src: m.src, open: m.open, at: now, hypo, sig, grade,
    analyst: an, news: nw, kongress: ko, einstieg: ein, plan, tm, risiko: rk, budget: bu,
    chart: { bars: lb.map(b => [b.t, +b.o.toPrecision(7), +b.h.toPrecision(7), +b.l.toPrecision(7), +b.c.toPrecision(7)]), e20: s.e20.slice(off).map(v => isNaN(v) ? null : +v.toPrecision(7)), e50: s.e50.slice(off).map(v => isNaN(v) ? null : +v.toPrecision(7)), bbU: s.bb.up.slice(off).map(v => isNaN(v) ? null : +v.toPrecision(7)), bbL: s.bb.lo.slice(off).map(v => isNaN(v) ? null : +v.toPrecision(7)) } };
}
async function loadMarket(sym) {
  const d = await M.load(sym); const s = T.compute(d.h1); const m = { ...d, s }; S.markets[sym] = m; if (sym === 'EURUSD') B.setFx(d.price); return m;
}
const priceMap = () => Object.fromEntries(Object.entries(S.markets).map(([k, m]) => [k, m.price]));
const chips = a => [['Scanner', a.sig.setup], ['Analyst', a.analyst.bias.toFixed(2)], ['News', a.news.ok ? a.news.score.toFixed(2) : '–'], ['Time Machine', (a.tm.adj.evR >= 0 ? '+' : '') + a.tm.adj.evR.toFixed(2) + ' R'], ['Risiko', a.risiko.ok ? 'ok' : 'veto']].map(([n, e]) => ({ n, e: String(e) }));

// ---------- Zyklus ----------
async function cycle() {
  if (BUSY) return; BUSY = true; const t0 = Date.now(); S.cycle++;
  try {
    brokerFallback(); await K.refresh();
    // Daten
    for (const k of Object.keys(S.helpers)) if (S.helpers[k].s !== 'veto') S.helpers[k].s = 'working';
    const res = await Promise.allSettled(wl.map(loadMarket)); const fails = res.filter(r => r.status === 'rejected').length;
    if (fails === wl.length) throw new Error('keine Marktdaten');
    const prices = priceMap(), acc = B.acc(), src = M.status().source;
    if (!acc.mt5 && acc.src && acc.src !== src && (acc.pos.length || acc.orders.length)) {   // Quelle gewechselt (Simulator -> Live): alte Positionen sauber schließen
      for (const p of [...acc.pos]) { const h = B.close(p, p.last, 'Datenquelle gewechselt'); log(`${p.sym}: geschlossen (Datenquelle gewechselt) ${eur(h.pnl)}`, [], 'close', p.sym); } acc.orders = [];
    } if (!acc.mt5) acc.src = src;
    // Broker-Tick: Limit-Fills, Grenzen, Ziele
    for (const e of B.tick(prices)) {
      if (e.type === 'close') { const h = e.h; log(`${h.sym} ${side(h.dir)} geschlossen · ${h.reason} · ${eur(h.pnl)} (${h.R >= 0 ? '+' : ''}${h.R} R)`, [{ n: 'Ausstieg', e: h.reason }], h.pnl >= 0 ? 'win' : 'loss', h.sym);
        NOTIFY({ id: 'close:' + h.id, kind: 'close', pnl: h.pnl, title: `${h.pnl >= 0 ? '🟢' : '🔴'} ${eur(h.pnl)} · ${h.sym} ${h.dir > 0 ? 'BUY' : 'SELL'}`, body: `Geschlossen · ${h.reason} · ${h.R >= 0 ? '+' : ''}${h.R} R`, symbol: h.sym, side: h.dir > 0 ? 'BUY' : 'SELL' }); }
      if (e.type === 'fill') { log(`${e.p.sym}: ${B.mode === 'mt5' ? 'MT5 hat ausgeführt' : 'Limit-Order ausgeführt'} · ${side(e.p.dir)} ${e.p.lots} @ ${fmt(e.p.sym, e.p.entry)}`, [{ n: 'Broker', e: 'Fill' }], 'open', e.p.sym); NOTIFY({ id: 'open:' + e.p.id, kind: 'open', title: `📈 ${e.p.sym} ${e.p.dir > 0 ? 'BUY' : 'SELL'} ${e.p.lots} @ ${fmt(e.p.sym, e.p.entry)}`, body: `Limit gefüllt · Ziel ${fmt(e.p.sym, e.p.tp)} · Grenze ${fmt(e.p.sym, e.p.sl)}`, symbol: e.p.sym }); }
      if (e.type === 'reject') { log(`${e.c.sym}: MT5 hat den Auftrag abgelehnt (${e.c.cmd}) – ${e.error}`, [{ n: 'Broker', e: 'abgelehnt' }], 'skip', e.c.sym); NOTIFY({ id: 'rej:' + e.c.id, kind: 'alert', color: 'red', title: `⚠️ MT5 lehnt ${e.c.sym} ab`, body: e.error }); }
      if (e.type === 'expire') log(`${e.o.sym}: Limit-Order verfallen (Kurs kam nicht zurück)`, [{ n: 'Einstieg', e: 'verfallen' }], 'info', e.o.sym);
    }
    // Scanner + Analyst für alle (Analyst braucht Ausstieg-Management)
    const sc = H.scanner(S.markets, CFG); S.scanner = sc.rows; setH('scanner', sc);
    for (const sym of wl) if (S.markets[sym]) S.analysts[sym] = H.analyst(sym, S.markets[sym]);
    // Ausstieg: offene Trades managen
    const acts = H.manage(acc.pos, S.markets, S.analysts, CFG, Date.now());
    for (const a of acts) { if (a.close) { const h = B.close(a.p, S.markets[a.p.sym].price, a.close); log(`${h.sym}: ${a.close} · ${eur(h.pnl)}`, [{ n: 'Ausstieg', e: a.close }], h.pnl >= 0 ? 'win' : 'loss', h.sym);
        NOTIFY({ id: 'close:' + h.id, kind: 'close', pnl: h.pnl, title: `${h.pnl >= 0 ? '🟢' : '🔴'} ${eur(h.pnl)} · ${h.sym}`, body: `Geschlossen · ${a.close}`, symbol: h.sym }); }
      else log(a.t, [{ n: 'Ausstieg', e: 'Stop' }], 'info', a.p.sym); }
    if (acts.length) B.save();
    setH('ausstieg', { s: 'done', t: acc.pos.length ? `${acc.pos.length} Trade(s) überwacht${acts.length ? ' · ' + acts.length + ' Anpassung(en)' : ''}` : 'kein offener Trade' });
    // Kandidaten durch die Helfer-Kette
    const eq = B.mark(prices), cands = (S.inject || sc.cand).slice(0, 4); S.inject = null; let focus = null, best = -1, acted = null;
    for (const c of cands) {
      const m = S.markets[c.sym], key = c.sym + '|' + c.bar + '|' + c.sig.dir;
      const a = await analyze(c.sym, c.sig, { cfg: CFG, acc, eq, positions: acc.pos, open: m.open, broker: brokerOk(), own: ownBook(), ...ddState(eq) });
      if (a.grade > best) { best = a.grade; focus = a; }
      if (S.dup.has(key)) { a.decision = acc.pos.some(p => p.sym === c.sym) ? 'Trade zu diesem Signal läuft bereits' : 'Signal wurde bereits entschieden'; continue; }   // dieses Signal (Kerze) wurde schon entschieden
      let decision = null;
      if (!CFG.auto) decision = 'Auto-Trading aus – nur Vorschlag';
      else if (!a.risiko.ok) decision = 'Risiko-Veto: ' + a.risiko.checks.filter(x => !x.ok).map(x => x.name).join(', ');
      else if (!a.budget.ok) decision = 'Budget: Position zu klein';
      else if (a.einstieg.type === 'none') decision = 'Einstieg: warten';
      if (!decision && CFG.claude && AI.available()) {
        const rv = await AI.review({ symbol: c.sym, richtung: side(c.sig.dir), setup: c.sig.setup, note: a.grade, analyst: { bias: +a.analyst.bias.toFixed(2), phase: a.analyst.regime, tf: Object.fromEntries(Object.entries(a.analyst.tf).map(([k, v]) => [k, v && v.trend])) },
          news: { stimmung: +a.news.score.toFixed(2), eil: a.news.breaking && a.news.breaking.title, schlagzeilen: a.news.items.slice(0, 5).map(x => x.title) }, kongress: a.kongress.t,
          plan: { einstieg: a.plan.entry, ziel: a.plan.target, grenze: a.plan.stop, rr: +a.plan.rr.toFixed(2), hindernisR: a.plan.obstacleR },
          timeMachine: { zielZuerst: +a.tm.mc.pTarget.toFixed(3), grenzeZuerst: +a.tm.mc.pStop.toFixed(3), keins: +a.tm.mc.pNone.toFixed(3), evR: +a.tm.adj.evR.toFixed(3), rueckblick: { n: a.tm.bt.n, winrate: a.tm.bt.winrate, avgR: a.tm.bt.avgR } }, budget: a.budget.t });
        a.claude = rv; S.helpers.claude = { s: rv.s, t: rv.t, at: Date.now() }; if (rv.verdict === 'VETO') decision = 'KI-Prüfer: ' + rv.t;
      }
      S.dup.add(key); if (S.dup.size > 500) S.dup = new Set([...S.dup].slice(-250));
      if (decision) { a.decision = decision; log(`${c.sym} ${side(c.sig.dir)} (${c.sig.setup}, Note ${a.grade}) – nicht gehandelt: ${decision}`, chips(a), 'skip', c.sym); continue; }
      const pl = a.plan, meta = { grade: a.grade, setup: c.sig.setup, pT: a.tm.mc.pTarget, ev: a.tm.adj.evR };
      if (a.einstieg.type === 'limit') { const o = B.placeLimit({ riskEur: a.budget.riskEur, sym: c.sym, dir: c.sig.dir, lots: a.budget.lots, limit: pl.entry, sl: pl.stop, tp: pl.target, by: c.sig.setup, plan: pl, meta });
        a.decision = o.queued ? `Limit-Order an MT5 gesendet (${o.id})` : `Limit-Order #${o.id} gelegt`; log(`${c.sym} ${side(c.sig.dir)} Limit ${fmt(c.sym, pl.entry)} · Ziel ${fmt(c.sym, pl.target)} · Grenze ${fmt(c.sym, pl.stop)} · ${a.budget.lots}`, chips(a), 'order', c.sym); }
      else { const p = B.open({ riskEur: a.budget.riskEur, sym: c.sym, dir: c.sig.dir, lots: a.budget.lots, sl: pl.stop, tp: pl.target, mid: S.markets[c.sym].price, by: c.sig.setup, plan: pl, meta });
        if (p.queued) { a.decision = `Order an MT5 gesendet (${p.id})`; log(`${c.sym} ${side(c.sig.dir)} an MT5 gesendet · Risiko ${a.budget.riskEur.toFixed(2)} € · Ziel ${fmt(c.sym, p.tp)} · Grenze ${fmt(c.sym, p.sl)} · Note ${a.grade}`, chips(a), 'order', c.sym); }
        else { a.decision = `Trade #${p.id} eröffnet`; log(`${c.sym} ${side(c.sig.dir)} ${p.lots} @ ${fmt(c.sym, p.entry)} · Ziel ${fmt(c.sym, p.tp)} · Grenze ${fmt(c.sym, p.sl)} · Note ${a.grade}`, chips(a), 'open', c.sym);
        NOTIFY({ id: 'open:' + p.id, kind: 'open', title: `📈 ${c.sym} ${c.sig.dir > 0 ? 'BUY' : 'SELL'} ${p.lots} @ ${fmt(c.sym, p.entry)}`, body: `${c.sig.setup} · Ziel ${fmt(c.sym, p.tp)} · Grenze ${fmt(c.sym, p.sl)} · Note ${a.grade}/100`, symbol: c.sym, side: c.sig.dir > 0 ? 'BUY' : 'SELL' }); } }
      setH('broker', { s: 'done', t: a.decision }); acted = a;
    }
    if (acted) focus = acted;   // ausgeführter Trade hat Vorrang im Dashboard
    // Fokus fürs Dashboard: bester Kandidat – sonst das Symbol mit offener Position – sonst stärkster Trend
    if (!focus) { const pick = acc.pos[0] ? acc.pos[0].sym : (S.focus && S.focus.sym) || [...wl].sort((x, y) => Math.abs((S.analysts[y] || {}).bias || 0) - Math.abs((S.analysts[x] || {}).bias || 0))[0];
      try { focus = await analyze(pick); } catch (_) {} }
    if (focus) { S.focus = focus;
      for (const k of ['analyst', 'news', 'kongress', 'einstieg', 'timemachine', 'risiko', 'budget']) { const r = k === 'timemachine' ? focus.tm : k === 'ausstieg' ? focus.plan : focus[k]; setH(k, focus.hypo && k === 'einstieg' ? { s: 'idle', t: `kein Signal – ${focus.sym} unter Beobachtung, warte auf Setup` } : { s: focus.hypo && ['risiko', 'budget'].includes(k) ? 'idle' : r.s, t: (focus.hypo && ['risiko', 'budget'].includes(k) ? 'Probe-Rechnung: ' : '') + r.t }); } }
    if (!cands.length) setH('broker', { s: 'idle', t: acc.pos.length ? `${acc.pos.length} offen · warte auf nächstes Setup` : 'wartet auf ein geprüftes Setup' });
    if (CFG.kill) setH('risiko', { s: 'veto', t: 'NOT-AUS aktiv – keine neuen Trades' });
    // Alarm
    await alarms(prices, eq);
    S.error = null;
  } catch (e) { S.error = String(e.message || e).slice(0, 120); console.warn('cycle', e); for (const k of Object.keys(S.helpers)) if (S.helpers[k].s === 'working') S.helpers[k].s = 'error'; }
  finally { S.lastMs = Date.now() - t0; S.last = Date.now(); S.gen = Math.floor(Date.now() / 1000); BUSY = false; }
}
// ---------- Alarm-Helfer ----------
async function alarms(prices, eq) {
  const acc = B.acc(), fired = [];
  for (const a of ALARMS) { const px = prices[a.sym]; if (px == null || a.done) continue;
    if (a.dir > 0 ? px >= a.price : px <= a.price) { a.done = Date.now(); fired.push({ id: 'al:' + a.id, title: `🔔 ${a.sym} ${a.dir > 0 ? 'über' : 'unter'} ${fmt(a.sym, a.price)}`, body: a.note || `Kurs ${fmt(a.sym, px)}` }); } }
  for (const p of acc.pos) { const R0 = Math.abs(p.entry - p.sl0), r = p.dir * ((prices[p.sym] ?? p.last) - p.entry) / R0, dist = p.dir * ((prices[p.sym] ?? p.last) - p.sl) / R0;
    if (dist < .25 && !p.be) fired.push({ id: 'near:' + p.id, title: `⚠️ ${p.sym}: nahe an der Grenze`, body: `${r.toFixed(2)} R · Grenze ${fmt(p.sym, p.sl)}` }); }
  const ob = ownBook(), day = CFG.riskMode === 'eur' ? -(ob.realizedLoss + Math.max(0, -ob.upnl)) : eq - acc.dayStart.eq, lim = CFG.riskMode === 'eur' ? CFG.maxDailyLossEur : CFG.maxDailyLossPct / 100 * acc.dayStart.eq;
  if (day < -.75 * lim) fired.push({ id: 'day:' + acc.dayStart.date, title: '⚠️ Tageslimit fast erreicht', body: `Heute ${eur(day)} von −${lim.toFixed(0)} €` });
  const f = S.focus; if (f && f.news && f.news.breaking) fired.push({ id: 'news:' + f.sym + ':' + f.news.breaking.t, title: `📰 Eilmeldung ${f.sym}`, body: f.news.breaking.title });
  for (const sym of wl) { const m = S.markets[sym]; if (!m) continue; const i = H.lastClosed(m.h1), a = m.s.atr[i], mv = m.price - m.h1[i].c;
    if (a && Math.abs(mv) > 2.2 * a && m.open) fired.push({ id: 'move:' + sym + ':' + m.h1[i].t, title: `⚡ ${sym} bewegt sich stark`, body: `${mv > 0 ? '+' : '−'}${(Math.abs(mv) / a).toFixed(1)} ATR in dieser Stunde · ${fmt(sym, m.price)}` }); }
  let n = 0; for (const x of fired) { if (S.dup.has(x.id)) continue; S.dup.add(x.id); n++; S.alarmLog.unshift({ ...x, t: Date.now() }); NOTIFY({ ...x, kind: 'alert', color: /⚠️|⚡/.test(x.title) ? 'red' : 'neutral' }); }
  S.alarmLog = S.alarmLog.slice(0, 40); if (fired.length) persist();
  const act = ALARMS.filter(a => !a.done).length;
  setH('alarm', { s: 'done', t: n ? `${n} neue Meldung(en): ${S.alarmLog[0].title}` : `${act} Kurs-Alarm(e) aktiv · beobachte ${acc.pos.length} Position(en)` });
}
function addAlarm(b) { const sym = String(b.sym || '').toUpperCase(), price = +b.price; if (!I.get(sym) || !(price > 0)) throw new Error('Symbol/Preis ungültig');
  const cur = S.markets[sym] && S.markets[sym].price; const a = { id: Date.now().toString(36), sym, price, dir: cur != null ? (price >= cur ? 1 : -1) : (b.dir > 0 ? 1 : -1), note: String(b.note || '').slice(0, 80), at: Date.now() };
  ALARMS.push(a); ALARMS = ALARMS.slice(-50); persist(); return a; }
function delAlarm(id) { ALARMS = ALARMS.filter(a => a.id !== id); persist(); }
// ---------- Steuerung ----------
function closeAll(reason = 'Manuell geschlossen') { const acc = B.acc(), out = []; for (const p of [...acc.pos]) { const m = S.markets[p.sym]; out.push(B.close(p, m ? m.price : p.last, reason)); } if (B.mode === 'mt5') acc.orders.forEach(o => MT5.cancel(o)); else acc.orders = []; B.save(); out.forEach(h => log(`${h.sym}: ${reason} · ${eur(h.pnl)}`, [], h.pnl >= 0 ? 'win' : 'loss', h.sym)); return out; }
function closeOne(id) { const acc = B.acc(), p = acc.pos.find(x => x.id === +id); if (!p) { const o = acc.orders.find(x => x.id === +id); if (o) { if (B.mode === 'mt5') { MT5.cancel(o); log(`${o.sym}: Löschung der MT5-Order angefordert`, [], 'info', o.sym); return { cancelled: o.id }; } acc.orders = acc.orders.filter(x => x !== o); B.save(); log(`${o.sym}: Limit-Order gelöscht`, [], 'info', o.sym); return { cancelled: o.id }; } throw new Error('nicht gefunden'); }
  const h = B.close(p, S.markets[p.sym] ? S.markets[p.sym].price : p.last, 'Manuell geschlossen'); log(`${h.sym}: manuell geschlossen · ${eur(h.pnl)}`, [], h.pnl >= 0 ? 'win' : 'loss', h.sym); return h; }
function resetAccount(bal) { if (B.mode === 'mt5') throw new Error('Im MT5-Modus wird das Demo-Konto beim Broker zurückgesetzt, nicht hier'); const b = U.clamp(+bal || CFG.startBalance, 100, 1e7); CFG.startBalance = b; persist(); B.reset(b); S.dup = new Set(); log(`Paper-Konto zurückgesetzt auf ${b.toLocaleString('de-DE')} €`, [], 'cfg'); }

// ---------- Snapshot fürs Dashboard ----------
function snapshot() {
  const acc = B.acc(), prices = priceMap(), eq = B.equity(prices), st = B.stats(), ob = ownBook(), today = CFG.riskMode === 'eur' || acc.mt5 ? ob.today : eq - acc.dayStart.eq;
  const curve = acc.curve.length > 400 ? acc.curve.filter((_, i, a) => i % Math.ceil(a.length / 400) === 0 || i === a.length - 1) : acc.curve;
  const f = S.focus && { ...S.focus, tm: { ...S.focus.tm, mc: { ...S.focus.tm.mc } } };
  return { gen: S.gen, engine: { cycle: S.cycle, last: S.last, ms: S.lastMs, intervalS: CFG.intervalS, error: S.error, running: RUNNING, started: S.started, watch: wl.length, ai: AI.available(), aiModel: AI.available() ? AI.MODEL : null },
    data: M.status(), cfg: CFG, broker: { mode: B.mode === 'mt5' ? 'mt5' : 'paper', mt5: MT5.status() }, helpers: S.helpers, meta: H.META,
    acc: { start: acc.start, balance: U.round(acc.balance, 2), equity: U.round(eq, 2), today: U.round(today, 2), week: st.week, month: st.month, total: U.round(eq - acc.start, 2), stats: st, curve, open: acc.pos.length },
    pos: acc.pos.map(p => ({ id: p.id, sym: p.sym, dir: p.dir, lots: p.lots, entry: p.entry, sl: p.sl, tp: p.tp, sl0: p.sl0, open: p.open, upnl: p.upnl, last: p.last, by: p.by, be: p.be, dp: I.get(p.sym).dp, R: U.round(p.dir * (p.last - p.entry) / Math.abs(p.entry - p.sl0), 2), meta: p.meta })),
    orders: acc.orders.map(o => ({ id: o.id, sym: o.sym, dir: o.dir, lots: o.lots, limit: o.limit, sl: o.sl, tp: o.tp, expires: o.expires, by: o.by, dp: I.get(o.sym).dp })),
    hist: acc.hist.slice(0, 60).map(h => ({ ...h, dp: I.get(h.sym) ? I.get(h.sym).dp : 2 })),
    perf: perfCheck(), dd: ddState(eq), own: { today: U.round(ob.today, 2), total: U.round(ob.total, 2), realizedLoss: U.round(ob.realizedLoss, 2), openRisk: U.round(ob.openRisk, 2), entriesToday: ob.entriesToday, ddEur: U.round(ob.ddEur, 2) },
    scanner: S.scanner, focus: f, journal: S.journal.slice(0, 60), alarms: ALARMS.filter(a => !a.done), alarmLog: S.alarmLog.slice(0, 20), kongress: { ...K.state(), latest: K.latest(12) } };
}
function start({ notify } = {}) {
  if (notify) NOTIFY = notify; useBroker(); RUNNING = true;
  H.META.forEach(([k]) => setH(k, { s: 'idle', t: 'startet …' }));
  const loop = async () => { await cycle(); if (RUNNING) TIMER = setTimeout(loop, CFG.intervalS * 1000); };
  loop(); return module.exports;
}
function stop() { RUNNING = false; clearTimeout(TIMER); }
// Meldet sich die Brücke mit einem Demo-Konto, handelt der Bot automatisch dort (BROKER=paper verhindert das)
const mt5Sync = b => { const r = MT5.sync(b, priceMap());
  if (r.ok && CFG.broker !== 'mt5' && process.env.BROKER !== 'paper') { setConfig({ broker: 'mt5' }); const a = MT5.status().account || {};
    log(`MT5-Brücke verbunden – der Bot handelt ab jetzt im Demo-Konto ${a.login || ''} (${a.server || ''})`, [{ n: 'Broker', e: 'MT5-Demo' }], 'cfg');
    NOTIFY({ id: 'mt5on:' + (a.login || '') + ':' + U.berlin().date, kind: 'alert', color: 'green', title: '🔌 MT5-Demo verbunden', body: `Konto ${a.login || ''} · ${a.server || ''} – der Bot handelt jetzt dort` }); }
  return r; };
// öffentlicher Kurzstatus (ohne Kontonummer/Server): für /healthz
const mt5Health = () => { const st = MT5.status(), d = st.diag || {}, ago = t => t ? Math.round((Date.now() - t) / 1000) : null;
  return { mode: CFG.broker, connected: !!st.connected, lastSyncS: ago(st.lastSync), lastPollS: ago(d.poll), lastHelloS: ago(d.hello), tokenFailS: ago(d.authFail), problem: st.blocked || d.bridgeError || null }; };
const calHealth = () => { const N = require('./news'), c = N.calendarPause(); return { ok: c.ok, paused: c.paused, next: c.next ? { title: c.next.title, t: new Date(c.next.t).toISOString() } : null, note: c.note }; };
module.exports = { calHealth, mt5Health, mt5Note: o => MT5.note(o), mt5Sync, mt5Poll: () => MT5.poll(), _alarms: alarms, start, stop, cycle, snapshot, analyze, setConfig, addAlarm, delAlarm, closeAll, closeOne, resetAccount, cfg: () => CFG, _S: S };
