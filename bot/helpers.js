// Die 11 Helfer des Trader-Skills. Jeder Helfer ist eine reine Funktion: Eingaben rein, Bericht raus
// ({ s: Status, t: Kurztext, score?, ...Details }). Die Reihenfolge im Zyklus steht in engine.js.
'use strict';
const T = require('./ta'), S = require('./strategy'), U = require('./util'), I = require('./instruments');
const MC = require('./montecarlo'), BT = require('./backtest'), N = require('./news'), K = require('./congress'), B = require('./broker');
const META = [
  ['scanner', 'Scanner', 'durchsucht alle Märkte nach Setups (Rücksetzer, Ausbruch, Rückkehr)'],
  ['analyst', 'Analyst', 'liest den Trend auf 1h / 4h / Tag und bewertet die Marktphase'],
  ['news', 'News', 'liest Schlagzeilen und misst die Stimmung'],
  ['kongress', 'Kongress', 'verfolgt Aktien-Trades von US-Politikern'],
  ['einstieg', 'Einstieg', 'findet den Einstiegszeitpunkt – wartet auf Kerzenschluss'],
  ['ausstieg', 'Ausstieg', 'setzt Ziel & Grenze und managt offene Trades'],
  ['timemachine', 'Time Machine', '10.000 Zukünfte + Rückblick auf die eigenen Regeln'],
  ['risiko', 'Risiko', 'prüft jedes Limit – darf jeden Trade stoppen'],
  ['budget', 'Budget', 'rechnet die Positionsgröße aus dem Risiko'],
  ['broker', 'Broker', 'führt geprüfte Orders aus (Paper-Konto)'],
  ['alarm', 'Alarm', 'beobachtet Kurse und meldet sich per Push'],
];
const lastClosed = bars => bars.length && bars[bars.length - 1].live ? bars.length - 2 : bars.length - 1;
function agg(bars, n) { const o = []; for (let i = 0; i + n <= bars.length; i += n) { const g = bars.slice(i, i + n); o.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map(b => b.h)), l: Math.min(...g.map(b => b.l)), c: g[g.length - 1].c, v: g.reduce((s, b) => s + (b.v || 0), 0) }); } return o; }

// 1 · SCANNER – alle Symbole, Rangliste
function scanner(markets, cfg) {
  const rows = [];
  for (const [sym, m] of Object.entries(markets)) {
    const b = m.h1, s = m.s, i = lastClosed(b); if (i < 210) continue;
    const sig = S.signal(sym, m), c = m.price, d24 = b[Math.max(0, b.length - 25)].c, play = S.playOf(sym);
    rows.push({ sym, name: I.get(sym).name, price: c, dp: I.get(sym).dp, chg: (c - d24) / d24, rsi: s.rsi[i], adx: s.adx.adx[i], atrPct: s.atr[i] / c, open: m.open, src: m.src,
      play: play ? S.NAME[play] : null, sig: sig ? { dir: sig.dir, setup: sig.setup, q: sig.q, tf: sig.tf } : null, bar: sig ? sig.t : b[i].t, spark: b.slice(-48).map(x => +x.c.toPrecision(6)) });
  }
  rows.sort((a, b) => (b.sig ? b.sig.q : -1) - (a.sig ? a.sig.q : -1) || Math.abs(b.chg) - Math.abs(a.chg));
  const cand = rows.filter(r => r.sig && r.sig.q >= cfg.minScore && r.open);
  return { s: 'done', t: cand.length ? `${cand.length} Setup${cand.length > 1 ? 's' : ''}: ${cand.slice(0, 3).map(r => r.sym + ' ' + (r.sig.dir > 0 ? '▲' : '▼')).join(', ')}` : `${rows.length} Märkte gescannt (${rows.filter(r => r.play).length} mit bewährter Strategie) – gerade kein Signal`, rows, cand };
}
// 2 · ANALYST – Multi-Timeframe-Trend
function tfState(bars) { if (bars.length < 60) return null; const s = T.compute(bars), i = lastClosed(bars), c = bars[i].c;
  const e20 = s.e20[i], e50 = s.e50[i], slope = (s.e20[i] - s.e20[Math.max(0, i - 5)]) / (s.atr[i] || 1);
  let sc = 0; sc += c > e20 ? .25 : -.25; sc += e20 > e50 ? .3 : -.3; sc += U.clamp(slope / 2, -.25, .25); sc += U.clamp((s.rsi[i] - 50) / 80, -.1, .1); sc += s.macd.hist[i] > 0 ? .1 : -.1;
  return { score: U.clamp(sc, -1, 1), rsi: s.rsi[i], adx: s.adx.adx[i], trend: sc > .35 ? 'aufwärts' : sc < -.35 ? 'abwärts' : 'seitwärts' }; }
function analyst(sym, m) {
  const h1 = tfState(m.h1), h4 = tfState(agg(m.h1.slice(m.h1.length % 4), 4)), d1 = tfState(m.d1);
  const parts = [[h1, .3], [h4, .35], [d1, .35]].filter(([x]) => x), w = parts.reduce((s, [, k]) => s + k, 0);
  const bias = w ? parts.reduce((s, [x, k]) => s + x.score * k, 0) / w : 0, i = lastClosed(m.h1), adx = m.s.adx.adx[i];
  const regime = adx > 25 ? 'Trendphase' : adx < 20 ? 'Seitwärtsphase' : 'Übergang', volRank = T.pctRank(m.s.atr, i, 300);
  const sw = T.swings(m.h1, 3, i), res = sw.hi.filter(x => x.p > m.price).map(x => x.p), sup = sw.lo.filter(x => x.p < m.price).map(x => x.p);
  const word = bias > .4 ? 'klar bullisch' : bias > .15 ? 'leicht bullisch' : bias < -.4 ? 'klar bärisch' : bias < -.15 ? 'leicht bärisch' : 'neutral';
  return { s: 'done', t: `${sym}: ${word} · ${regime}`, bias, regime, adx, volRank, tf: { h1, h4, d1 }, res: res.length ? Math.min(...res) : null, sup: sup.length ? Math.max(...sup) : null };
}
// 3 · NEWS
async function news(sym, now) {
  const r = await N.fetchNews(sym, now), st = N.sentiment(r.items, now);
  const word = st.score > .25 ? 'positiv' : st.score < -.25 ? 'negativ' : 'neutral';
  return { s: r.ok ? 'done' : 'idle', t: r.ok ? (st.breaking ? `EILMELDUNG: ${st.breaking.title.slice(0, 70)}` : `${st.n} Schlagzeilen · Stimmung ${word}`) : r.note, score: st.score, breaking: st.breaking, items: r.items.slice(0, 8), ok: r.ok };
}
// 4 · KONGRESS
function kongress(sym) {
  const st = K.state(); if (!I.get(sym).stock) return { s: st.ok ? 'done' : 'idle', t: st.ok ? `${sym}: keine Aktie – nicht relevant` : st.note, score: 0, n: 0, ok: st.ok };
  if (!st.ok) return { s: 'idle', t: st.note, score: 0, n: 0, ok: false };
  const f = K.flow(sym); return { s: 'done', t: f.n ? `${f.n} Meldungen (90 T.): ${f.score > .2 ? 'Politiker kaufen' : f.score < -.2 ? 'Politiker verkaufen' : 'gemischt'}` : `${sym}: keine Politiker-Trades`, score: f.score, n: f.n, recent: f.recent, ok: true };
}
// 5 · EINSTIEG – erst nach Kerzenschluss, nicht hinterherlaufen (im Labor: Einstieg zur Eröffnung der Folgekerze)
function einstieg(sym, m, sig) {
  const px = m.price, inst = I.get(sym), chase = sig.dir * (px - sig.ref) / sig.atr;
  if (chase > 1) return { s: 'wait', t: `${sym}: Kurs schon ${chase.toFixed(1)} ATR weitergelaufen – nicht hinterher, Signal verfällt`, type: 'none', chase };
  if (chase < -1) return { s: 'wait', t: `${sym}: Kurs ist ${(-chase).toFixed(1)} ATR gegen das Signal gelaufen – kein Einstieg`, type: 'none', chase };
  return { s: 'done', t: `${sym}: ${sig.tf === '1d' ? 'Tageskerze' : 'Stundenkerze'} geschlossen, ${sig.setup} bestätigt – Einstieg jetzt`, type: 'market', price: px, chase };
}
// 6 · AUSSTIEG – Plan + Management offener Positionen (genau die getesteten Regeln)
function ausstiegPlan(sym, m, sig, entry) {
  const p = S.plan(sym, m, sig, entry), dp = I.get(sym).dp;
  return { s: 'done', t: `Grenze ${U.fmtPrice(p.stop, dp)} (${(p.risk / sig.atr).toFixed(1)} ATR) · Ausstieg: ${p.exit} · Sicherheits-Ziel ${U.fmtPrice(p.target, dp)} (${p.rr} R)`, ...p };
}
function manage(pos, markets, analysts, cfg, now) {   // -> Liste von Aktionen
  const acts = [];
  for (const p of pos) { const m = markets[p.sym]; if (!m) continue; const play = S.playOf(p.sym) || 'trend';
    if (play === 'rsi2') {   // Schluss über SMA 5 (abgeschlossene Tageskerze nach dem Einstieg) oder nach 10 Tagen
      const d = m.d1, i = S.lastClosedDaily(p.sym, d, now); if (i < 5) continue; const ds = S.dailySeries(d);
      if (d[i].t >= p.open - 12 * 3600e3 && ds.c[i] > ds.s5[i]) acts.push({ p, close: `Schluss über SMA ${S.P.rsi2Exit}` });
      else if ((now - p.open) / 864e5 > S.P.rsi2MaxD * 1.4) acts.push({ p, close: `Zeit-Ausstieg (${S.P.rsi2MaxD} Handelstage)` });
      continue; }
    // Trend: Chandelier-Trailing vom besten Schlusskurs seit Einstieg, nur auf abgeschlossenen Stundenkerzen
    const b = m.h1, i = lastClosed(b); let best = null; for (let k = b.length - 1; k >= 0 && b[k].t >= p.open - 3600e3; k--) { if (k > i) continue; best = best == null ? b[k].c : p.dir > 0 ? Math.max(best, b[k].c) : Math.min(best, b[k].c); }
    if (best != null) { const n = best - p.dir * S.P.trailA * m.s.atr[i]; if (p.dir * (n - p.sl) > 0) { p.sl = n; p.be = p.dir * (n - p.entry) >= 0; acts.push({ p, t: `${p.sym}: Trailing-Stop nachgezogen auf ${U.fmtPrice(n, I.get(p.sym).dp)}` }); } }
    if ((now - p.open) / 3600e3 > S.P.maxHoldH) acts.push({ p, close: `Zeit-Ausstieg (${S.P.maxHoldH} h)` });
  }
  return acts;
}
// 7 · TIME MACHINE – Rückblick (genau dieses Playbook, 2 Jahre, nach Kosten) + 10.000 Monte-Carlo-Zukünfte zur Einordnung
const btCache = new Map();
function timemachine(sym, m, sig, plan, cfg, seed) {
  const inst = I.get(sym), key = sym + '|' + m.h1[lastClosed(m.h1)].t;
  let bt = btCache.get(key); if (!bt) { bt = BT.run(sym, m.h1, m.s, m.d1); btCache.set(key, bt); if (btCache.size > 100) btCache.delete(btCache.keys().next().value); }
  const daily = sig.tf === '1d', bars = daily ? m.d1 : m.h1, horizon = daily ? S.P.rsi2MaxD : cfg.horizon;
  const mc = MC.run({ bars, entry: plan.entry, stop: plan.stop, target: plan.mcTarget || plan.target, dir: sig.dir, horizon, n: cfg.mcRuns, cost: inst.spread, seed });
  // Entscheidungsgrundlage ist der Rückblick (echte Regeln, echte Kosten), vorsichtig geschrumpft bei wenigen Trades
  const nb = bt.n || 0, ev = nb ? bt.avgR * nb / (nb + 20) : 0, edge = nb >= 15 ? bt.avgR : null;
  return { s: 'done', t: `Rückblick ${nb} Trades: Ø ${bt.avgR != null ? (bt.avgR >= 0 ? '+' : '') + bt.avgR.toFixed(2) : '–'} R, Treffer ${U.pct(bt.winrate, 0)} · ${cfg.mcRuns.toLocaleString('de-DE')} Zukünfte: 3 R zuerst ${U.pct(mc.pTarget)}, Grenze zuerst ${U.pct(mc.pStop)}`,
    mc, bt: { n: bt.n, winrate: bt.winrate, avgR: bt.avgR, avgW: bt.avgW, avgL: bt.avgL, pf: bt.pf, totalR: bt.totalR, maxDDR: bt.maxDDR, curve: bt.curve.slice(-120), bySetup: bt.bySetup, broad: false, last: bt.last.slice(0, 6) },
    adj: { pTarget: bt.winrate ?? mc.pTarget, pStop: bt.winrate != null ? 1 - bt.winrate : mc.pStop, pNone: 0, evR: ev }, edge };
}
// 8 · RISIKO – harte Regeln, jede kann den Trade stoppen
function risiko(sym, sig, plan, tm, an, nw, ctx) {
  const { cfg, acc, eq, positions, open } = ctx, inst = I.get(sym), dayPnl = eq - acc.dayStart.eq, checks = [];
  const add = (ok, name, why) => checks.push({ ok, name, why });
  add(!cfg.kill, 'Not-Aus', cfg.kill ? 'Not-Aus ist AN' : 'aus');
  if (ctx.dd != null) add(ctx.dd < .20, 'Verlust-Bremse', ctx.dd >= .20 ? `Rückgang ${(ctx.dd * 100).toFixed(1)} % vom Höchststand – neue Trades pausiert` : ctx.dd >= .10 ? `Rückgang ${(ctx.dd * 100).toFixed(1)} % – halbes Risiko` : `Rückgang ${(ctx.dd * 100).toFixed(1)} % – normal`);
  if (ctx.broker === false) add(false, 'MT5 verbunden', 'Brücke meldet sich nicht – Order wird nicht gesendet');
  add(open, 'Markt offen', open ? 'Handelszeit' : 'Markt geschlossen / Daten veraltet');
  if (cfg.riskMode === 'eur' && ctx.own) {   // wie trader-risk: Verluste heute + offenes Risiko bis zu den Stops + diese Order ≤ Tageslimit (nur eigene Trades)
    const o = ctx.own, newR = ctx.newRisk || 0, sum = o.realizedLoss + o.openRisk + newR;
    add(sum <= cfg.maxDailyLossEur + 1e-9, 'Tageslimit (eigene Trades)', `Verlust heute ${o.realizedLoss.toFixed(2)} € + offenes Risiko ${o.openRisk.toFixed(2)} € + diese Order ${newR.toFixed(2)} € = ${sum.toFixed(2)} € (max. ${cfg.maxDailyLossEur} €)`);
    add(o.entriesToday < cfg.maxTradesDay, 'Max. Trades heute', `${o.entriesToday}/${cfg.maxTradesDay}`);
    add(!o.symsToday.includes(sym), 'Kein 2. Einstieg heute im selben Markt', o.symsToday.includes(sym) ? 'heute schon gehandelt' : 'frei');
  } else add(dayPnl > -cfg.maxDailyLossPct / 100 * acc.dayStart.eq, 'Tageslimit', `Heute ${dayPnl.toFixed(2)} € (Limit −${(cfg.maxDailyLossPct / 100 * acc.dayStart.eq).toFixed(0)} €)`);
  add(positions.length < cfg.maxOpen, 'Max. Positionen', `${positions.length}/${cfg.maxOpen} offen`);
  add(!positions.some(p => p.sym === sym) && !acc.orders.some(o => o.sym === sym), 'Nur 1 Trade je Markt', positions.some(p => p.sym === sym) ? 'schon offen' : 'frei');
  const grp = positions.filter(p => I.get(p.sym).group === inst.group).length; add(grp < cfg.maxPerGroup, 'Klumpenrisiko', `${grp}/${cfg.maxPerGroup} in Gruppe „${inst.group}“`);
  if (!S.playOf(sym)) add(false, 'Bewährte Strategie', 'für diesen Markt keine Strategie mit nachgewiesenem Vorteil – nur Beobachtung');
  if (sig.tf === '1d') add(true, 'Großer Trend intakt', 'Schluss über SMA 200 (Teil des Signals)');
  else add(an.bias * sig.dir > -.3, 'Nicht gegen den großen Trend', `Analyst ${an.bias >= 0 ? '+' : ''}${an.bias.toFixed(2)}`);
  add(!(nw.breaking && nw.breaking.s * sig.dir < 0), 'Keine Gegen-Eilmeldung', nw.breaking ? nw.breaking.title.slice(0, 50) : 'keine');
  add(inst.spread / plan.risk < .12, 'Spread-Kosten', `${(inst.spread / plan.risk * 100).toFixed(1)} % des Risikos`);
  add(tm.adj.evR >= cfg.minEV, 'Erwartungswert (Rückblick)', `${tm.adj.evR >= 0 ? '+' : ''}${tm.adj.evR.toFixed(2)} R je Trade nach Kosten (min. ${cfg.minEV} R)`);
  add(tm.edge == null || tm.edge > 0, 'Regeln historisch profitabel', tm.edge == null ? 'zu wenig Historie – neutral' : `Ø ${tm.edge.toFixed(2)} R in ${tm.bt.n} Trades`);
  const fail = checks.filter(c => !c.ok);
  return { s: fail.length ? 'veto' : 'done', t: fail.length ? `STOPP: ${fail.map(f => f.name).join(', ')}` : `alle ${checks.length} Prüfungen bestanden`, ok: !fail.length, checks };
}
// 9 · BUDGET – Positionsgröße: Risiko € / Abstand zur Grenze, mit ¼-Kelly-Deckel und Hebel-Grenze
function budget(sym, plan, tm, ctx) {
  const { cfg, eq } = ctx, inst = I.get(sym), mul = (S.RISK_MUL[S.playOf(sym)] ?? 1) * (ctx.ddMul ?? 1), riskPct = cfg.riskPct / 100 * mul;
  const bt = tm.bt || {}, p = bt.winrate ?? .4, ratio = bt.avgW && bt.avgL ? bt.avgW / bt.avgL : 1.5, kelly = Math.max(0, p - (1 - p) / ratio), kCap = kelly / 4;
  // Euro-Modus: fester Betrag je Trade (Obergrenze, ohne Kelly-Kürzung, ohne Strategie-Faktor – sonst wären bei 5 € fast keine Positionen möglich)
  const eurMode = cfg.riskMode === 'eur', usePct = eurMode ? (cfg.riskEur * (ctx.ddMul ?? 1)) / eq : Math.min(riskPct, Math.max(riskPct * .4, kCap || riskPct * .4)), riskEur = eurMode ? cfg.riskEur * (ctx.ddMul ?? 1) : eq * usePct;
  const perLotEur = Math.abs(B.toEur(sym, plan.risk * inst.cs, plan.entry)); let lots = Math.floor(riskEur / perLotEur / inst.step) * inst.step;
  const notionalEur = Math.abs(B.toEur(sym, plan.entry * inst.cs, plan.entry)), maxLots = Math.floor(eq * cfg.maxLeverage / notionalEur / inst.step) * inst.step; lots = Math.min(lots, maxLots); lots = +lots.toFixed(6);
  const ok = lots >= inst.min, real = lots * perLotEur;
  return { s: ok ? 'done' : 'veto', t: ok ? `${lots} ${inst.stock ? 'Stück' : 'Lot'} · Risiko ${real.toFixed(2)} €` + (cfg.riskMode === 'eur' ? ` (max. ${cfg.riskEur} €)` : ` (${(real / eq * 100).toFixed(2)} %)`) : `schon die kleinste Größe (${inst.min} ${inst.stock ? 'Stück' : 'Lot'}) riskiert ${(perLotEur * inst.min).toFixed(2)} € – mehr als erlaubt (${riskEur.toFixed(2)} €), ausgelassen`, ok, lots, riskEur: real, usePct, kelly, mul };
}
module.exports = { META, scanner, analyst, news, kongress, einstieg, ausstiegPlan, manage, timemachine, risiko, budget, lastClosed, agg };
