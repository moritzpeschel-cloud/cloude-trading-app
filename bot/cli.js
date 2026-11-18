#!/usr/bin/env node
// Trader-Skill auf der Kommandozeile (auch für Claude Code, siehe .claude/skills/trader/SKILL.md):
//   node bot/cli.js analyze NVDA      – alle 11 Helfer für ein Symbol (JSON mit --json)
//   node bot/cli.js scan              – Scanner über die Watchlist
//   node bot/cli.js list              – verfügbare Symbole
// Kurse: live (Yahoo) wenn erreichbar, sonst Simulator (DATA_SOURCE=sim|live erzwingt). Es wird NIE gehandelt.
'use strict';
process.env.DATA_DIR = process.env.DATA_DIR || require('path').join(require('os').tmpdir(), 'cloude-skill-cli');
const E = require('./engine'), I = require('./instruments'), M = require('./market'), U = require('./util');
const [cmd = 'help', arg] = process.argv.slice(2), json = process.argv.includes('--json');
const line = (k, s, t) => console.log(`  ${k.padEnd(13)} ${('[' + s + ']').padEnd(9)} ${t}`);
(async () => {
  if (cmd === 'list') { for (const [k, v] of Object.entries(I.ALL)) console.log(k.padEnd(8), v.name); return; }
  if (cmd === 'scan') { await Promise.all(I.watchlist().map(s => E.analyze(s).catch(() => null))); const H = require('./helpers'); const sc = H.scanner(E._S.markets, E.cfg());
    if (json) return console.log(JSON.stringify(sc.rows.map(({ spark, ...r }) => r), null, 1));
    console.log(`Daten: ${M.status().source}\n`); for (const r of sc.rows) console.log(r.sym.padEnd(8), U.fmtPrice(r.price, r.dp).padStart(12), U.pct(r.chg, 2).padStart(9), r.open ? '      ' : ' (zu) ', r.sig ? `${r.sig.dir > 0 ? 'KAUF' : 'VERKAUF'} ${r.sig.setup} (${Math.round(r.sig.q * 100)})` : '–'); return; }
  if (cmd === 'analyze' && arg) { const sym = arg.toUpperCase(); if (!I.get(sym)) throw new Error('Unbekanntes Symbol – node bot/cli.js list');
    const a = await E.analyze(sym); if (json) { delete a.chart; a.tm.mc.paths = a.tm.mc.paths.length + ' Pfade'; return console.log(JSON.stringify(a, null, 1)); }
    const dp = a.dp; console.log(`\n${a.sym} · ${a.name} · ${U.fmtPrice(a.price, dp)} · Daten: ${a.src === 'sim' ? 'SIMULIERT' : 'live'} · ${a.open ? 'Markt offen' : 'Markt geschlossen'}`);
    console.log(a.hypo ? 'Kein Setup – Probe-Rechnung in Trendrichtung\n' : `Setup: ${a.sig.dir > 0 ? 'KAUF' : 'VERKAUF'} · ${a.sig.setup} · Gesamtnote ${a.grade}/100\n`);
    line('Scanner', a.hypo ? 'idle' : 'done', a.hypo ? 'kein Setup' : `${a.sig.setup} (Qualität ${Math.round(a.sig.q * 100)})`);
    for (const [k, r] of [['Analyst', a.analyst], ['News', a.news], ['Kongress', a.kongress], ['Einstieg', a.einstieg], ['Ausstieg', a.plan], ['Time Machine', a.tm], ['Risiko', a.risiko], ['Budget', a.budget]]) line(k, r.s, r.t);
    line('Broker', 'info', a.hypo ? 'kein Auftrag' : a.risiko.ok && a.budget.ok ? 'würde ausführen (CLI handelt nie)' : 'würde NICHT ausführen'); line('Alarm', 'info', 'Kurs-Alarme über das Dashboard');
    console.log(`\n  ZIEL ${U.fmtPrice(a.plan.target, dp)} | EINSTIEG ${U.fmtPrice(a.plan.entry, dp)} | GRENZE ${U.fmtPrice(a.plan.stop, dp)} | MAX. VERLUST ${a.budget.riskEur.toFixed(2)} €`);
    console.log(`  Time Machine: Ziel zuerst ${U.pct(a.tm.mc.pTarget)} · Grenze zuerst ${U.pct(a.tm.mc.pStop)} · keins bis Schluss ${U.pct(a.tm.mc.pNone)} · Erwartung ${a.tm.adj.evR.toFixed(2)} R`);
    for (const c of a.risiko.checks) console.log(`  ${c.ok ? '✓' : '✕'} ${c.name}: ${c.why}`); console.log('\nKeine Anlageberatung.'); return; }
  console.log('Befehle: analyze <SYMBOL> [--json] | scan [--json] | list');
})().then(() => process.exit(0), e => { console.error('Fehler:', e.message); process.exit(1); });
