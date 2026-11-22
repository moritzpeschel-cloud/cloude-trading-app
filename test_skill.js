// Selbsttest Trader-Skill (offline, Simulator): node test_skill.js
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
process.env.DATA_SOURCE = 'sim'; process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-skill-')); delete process.env.ANTHROPIC_API_KEY;
const U = require('./bot/util'), T = require('./bot/ta'), MC = require('./bot/montecarlo'), B = require('./bot/broker'), N = require('./bot/news'), E = require('./bot/engine'), M = require('./bot/market');
(async () => {
  // Indikatoren gegen Handrechnung
  assert.deepEqual(T.sma([1, 2, 3, 4], 2).slice(1), [1.5, 2.5, 3.5]);
  const r = T.rsi(Array.from({ length: 30 }, (_, i) => i)); assert.ok(r[29] > 99, 'RSI nur steigend ~100');
  // Monte-Carlo: symmetrisches Ziel/Grenze ohne Drift -> ~50/50, deterministisch bei gleichem Seed
  const bars = []; let p = 100; const rr = U.rng(7); for (let i = 0; i < 700; i++) { const o = p; p *= Math.exp(U.gauss(rr) * .004); bars.push({ t: i, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * .999, c: p }); }
  const a = MC.run({ bars, entry: p, stop: p * .98, target: p * 1.02, dir: 1, horizon: 400, n: 4000, seed: 3 }), b = MC.run({ bars, entry: p, stop: p * .98, target: p * 1.02, dir: 1, horizon: 400, n: 4000, seed: 3 });
  assert.equal(a.pTarget, b.pTarget); assert.ok(Math.abs(a.pTarget - a.pStop) < .08, `symmetrisch ${a.pTarget} vs ${a.pStop}`); assert.ok(Math.abs(a.pTarget + a.pStop + a.pNone - 1) < 1e-9);
  // News-Stimmung
  assert.ok(N.score('Apple beats estimates, stock surges', 'AAPL') > 0); assert.ok(N.score('Tesla shares plunge after recall', 'TSLA') < 0);
  assert.equal(N.parseRss('<rss><item><title><![CDATA[A &amp; B]]></title><link>https://x.y/z</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate></item></rss>')[0].title, 'A & B');
  // Engine: echter Zyklus mit Simulator
  const sent = []; E.start({ notify: e => sent.push(e) }); E.stop(); while (!E._S.last) await new Promise(r => setTimeout(r, 50));
  let s = E.snapshot(); assert.equal(s.meta.length, 11, '11 Helfer'); for (const [k] of s.meta) assert.ok(s.helpers[k], 'Bericht von ' + k);
  assert.equal(s.data.source, 'sim'); assert.ok(s.scanner.length >= 10); assert.ok(s.focus && s.focus.tm.mc.n === 10000, '10.000 Durchläufe');
  // Handelsweg erzwingen: BTCUSD (24/7) mit Signal, lockere Schwellen -> Trade wird eröffnet
  E.setConfig({ minEV: -0.2, minScore: 0.4 }); const m = E._S.markets.BTCUSD, bar = m.h1[m.h1.length - 2].t;
  outer: for (const sym of ['BTCUSD', 'ETHUSD']) for (const dir of [1, -1]) for (const setup of ['Trend-Rücksetzer', 'Rückkehr zur Mitte']) {
    const mm = E._S.markets[sym]; E._S.inject = [{ sym, bar: mm.h1[mm.h1.length - 2].t + dir + setup.length, sig: { dir, setup, q: .8 } }]; await E.cycle(); if (B.acc().pos.length || B.acc().orders.length) break outer; }
  const acc = B.acc(); s = E.snapshot(); const j = s.journal[0];
  assert.ok(j, 'Journal-Eintrag'); console.log('  Entscheidung:', j.text);
  if (acc.pos.length) {
    const pos = acc.pos[0]; assert.ok(sent.some(e => e.kind === 'open'), 'Push bei Eröffnung'); assert.ok(pos.sl !== pos.entry && pos.tp !== pos.entry);
    assert.ok(Math.abs(pos.riskEur) <= s.acc.equity * s.cfg.riskPct / 100 * 1.05, 'Risiko ≤ Limit');
    const ev = B.tick({ [pos.sym]: pos.tp + pos.dir * Math.abs(pos.tp - pos.entry) }); assert.equal(ev[0].type, 'close'); assert.equal(ev[0].h.reason, 'Ziel erreicht'); assert.ok(ev[0].h.pnl > 0, 'Gewinn am Ziel');
  } else assert.ok(/nicht gehandelt|Limit/.test(j.text) || acc.orders.length, 'begründet');
  // Broker direkt: Grenze + Kosten
  const q = B.open({ sym: 'EURUSD', dir: 1, lots: 1, sl: 1.07, tp: 1.1, mid: 1.08, by: 'Test' }); const c = B.tick({ EURUSD: 1.0695 })[0];
  assert.equal(c.h.reason, 'Grenze (Stop)'); assert.ok(c.h.pnl < 0 && c.h.pnl > -1100, 'Verlust ≈ 1 Lot × 100 Pips in EUR'); assert.ok(q.id);
  // Risiko-Veto bei Not-Aus
  E.setConfig({ kill: true }); E._S.inject = [{ sym: 'ETHUSD', bar: 1, sig: { dir: 1, setup: 'Ausbruch', q: .9 } }]; const n0 = B.acc().pos.length; await E.cycle();
  assert.equal(B.acc().pos.length, n0, 'Not-Aus verhindert Trades'); assert.equal(E.snapshot().helpers.risiko.s, 'veto');
  // Konfig-Grenzen
  assert.equal(E.setConfig({ riskPct: 99 }).riskPct, 3, 'Risiko gedeckelt');
  // Alarm
  const px = E._S.markets.XAUUSD.price, al = E.addAlarm({ sym: 'XAUUSD', price: px * 1.01 }); assert.equal(al.dir, 1);
  await E._alarms({ XAUUSD: px * 1.005 }, 10000); assert.ok(!E.snapshot().alarmLog.some(x => x.id === 'al:' + al.id), 'noch nicht');
  await E._alarms({ XAUUSD: px * 1.02 }, 10000); assert.ok(E.snapshot().alarmLog.some(x => x.id === 'al:' + al.id), 'Kurs-Alarm ausgelöst');
  // MT5 gewählt, Brücke nie da -> nach 10 Min. zurück auf Paper
  E.setConfig({ kill: false, broker: 'mt5' }); assert.equal(E.cfg().broker, 'mt5'); E._S.mt5Since = Date.now() - 11 * 60e3; await E.cycle();
  assert.equal(E.cfg().broker, 'paper', 'Rückfall auf Paper'); assert.ok(E.snapshot().journal.some(j => /Paper-Konto weiter/.test(j.text)));
  // Playbook: Devisen/Aktien nur beobachten, Trend-Trailing zieht nach
  const SG = require('./bot/strategy'); assert.equal(SG.playOf('EURUSD'), null); assert.equal(SG.playOf('XAUUSD'), 'trend'); assert.equal(SG.playOf('US500'), 'rsi2');
  assert.equal(SG.signal('EURUSD', E._S.markets.EURUSD), null, 'kein Handel ohne bewährte Strategie');
  const H2 = require('./bot/helpers'), mx = E._S.markets.ETHUSD, px0 = mx.h1[mx.h1.length - 30].c;
  const fake = { sym: 'ETHUSD', dir: 1, entry: px0, sl: px0 * .5, sl0: px0 * .5, open: mx.h1[mx.h1.length - 30].t };
  const acts = H2.manage([fake], E._S.markets, E._S.analysts, E.cfg(), Date.now()); assert.ok(fake.sl > px0 * .5, 'Trailing-Stop nachgezogen'); assert.ok(acts.length >= 1);
  // halbes Risiko für RSI-2, Verlust-Bremse
  const ctxB = { cfg: E.cfg(), eq: 10000 }, plB = { risk: 50, entry: 6000 }, tmB = { bt: { winrate: .6, avgW: 1, avgL: 1 } };
  const bT = H2.budget('XAUUSD', { risk: 20, entry: 2700 }, tmB, ctxB), bR = H2.budget('US500', plB, tmB, ctxB); assert.equal(bT.mul, 1); assert.equal(bR.mul, .5, 'RSI-2 mit halbem Risiko');
  const bD = H2.budget('US500', plB, tmB, { ...ctxB, ddMul: .5 }); assert.equal(bD.mul, .25, 'Verlust-Bremse halbiert');
  const rk = H2.risiko('XAUUSD', { dir: 1, tf: '1h' }, { risk: 20 }, { adj: { evR: .3 }, edge: .3, bt: { n: 30 } }, { bias: .5 }, {}, { cfg: E.cfg(), acc: { dayStart: { eq: 10000 }, orders: [] }, eq: 10000, positions: [], open: true, dd: .22 });
  assert.ok(!rk.ok && rk.checks.some(c => c.name === 'Verlust-Bremse' && !c.ok), 'ab 20 % Rückgang Pause');
  assert.ok(E.snapshot().perf && E.snapshot().perf.status, 'Leistungs-Check im Snapshot');
  // Euro-Limits (5 €/Trade, 10 €/Tag, max. 3 Trades) – wie trader-budget/trader-risk
  const C = E.cfg(); assert.equal(C.riskMode, 'eur'); assert.equal(C.riskEur, 5); assert.equal(C.maxDailyLossEur, 10); assert.equal(C.maxTradesDay, 10);
  const ctxE = { cfg: C, eq: 100000 }, tmE = { bt: { winrate: .3, avgW: 3, avgL: 1 } };
  const bGold = H2.budget('XAUUSD', { risk: 37, entry: 3757 }, tmE, ctxE); assert.ok(!bGold.ok, 'Gold bei 5 € nicht handelbar (Min-Lot zu groß)'); assert.match(bGold.t, /kleinste Größe/);
  const bSpx = H2.budget('US500', { risk: 335, entry: 6910 }, tmE, ctxE); assert.ok(bSpx.ok && bSpx.riskEur <= 5 && bSpx.lots >= .01, 'S&P 500 mit 5 € handelbar');
  const bEth = H2.budget('ETHUSD', { risk: 32, entry: 1766 }, tmE, ctxE); assert.ok(bEth.ok && bEth.riskEur <= 5 && bEth.riskEur > 4, 'ETH nutzt die 5 € fast voll, nie mehr');
  assert.ok(H2.budget('ETHUSD', { risk: 32, entry: 1766 }, tmE, { ...ctxE, eq: 10000 }).riskEur <= 5, 'unabhängig von der Kontogröße');
  const base = { cfg: C, acc: { dayStart: { eq: 1e5 }, orders: [] }, eq: 1e5, positions: [], open: true, dd: 0 }, okArgs = ['ETHUSD', { dir: 1, tf: '1h' }, { risk: 32 }, { adj: { evR: .3 }, edge: .3, bt: { n: 30 } }, { bias: .5 }, {}];
  const chk = (own, newRisk) => H2.risiko(...okArgs, { ...base, own: { realizedLoss: 0, openRisk: 0, entriesToday: 0, symsToday: [], ...own }, newRisk });
  assert.ok(chk({}, 4.9).ok, 'normaler Fall erlaubt');
  assert.ok(!chk({ realizedLoss: 6 }, 4.9).ok, '6 € Verlust + 4,9 € neues Risiko > 10 € → Stopp');
  assert.ok(!chk({ openRisk: 6 }, 4.9).ok, 'offenes Risiko zählt mit');
  assert.ok(!chk({ entriesToday: 10 }, 1).ok, 'max. 10 Trades je Tag');
  assert.ok(!chk({ symsToday: ['ETHUSD'] }, 1).ok, 'kein 2. Einstieg im selben Markt am selben Tag');
  assert.ok(E.snapshot().own && typeof E.snapshot().own.openRisk === 'number', 'eigene Tagesbilanz im Snapshot');
  console.log('trader-skill: alle Tests bestanden'); process.exit(0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
