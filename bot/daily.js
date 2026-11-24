// TAGES-ROUTINE: jeden Morgen um 07:00 (Berlin) wertet der Bot den Vortag aus und schickt den Bericht aufs Handy.
// Grundsatz: Der Bot verbessert sich NUR schützend selbst. Er erhöht nie das Risiko und ändert keine Strategie-Regeln –
// ein Tag mit 1–3 Trades ist statistisch Zufall; Regeln an den Vortag anzupassen macht einen Bot nachweislich schlechter.
// Automatische Schutzmaßnahme: Läuft ein Markt über ≥ 20 eigene Trades weit (2,5 Standardfehler) unter der Test-Erwartung,
// wird er 14 Tage pausiert (Hinweis auf Ausführungs-/Datenproblem oder verlorenen Vorteil). Alles andere sind Befunde für den Menschen.
'use strict';
const fs = require('fs'), path = require('path'), U = require('./util');
const DIR = process.env.DATA_DIR || '/tmp/cloude-skill', FILE = path.join(DIR, 'daily.json');
const REPORT_HOUR = 7, PAUSE_DAYS = 14, MIN_N = 20, SD_R = 1.8;
let D = { reports: [], pauses: {}, count: {}, lastDate: null };
try { D = { ...D, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) {}
const save = () => { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(D)); } catch (_) {} };
const day = (t = Date.now()) => U.berlin(t).date;
const bump = (d, k, by = 1) => { const c = D.count[d] = D.count[d] || {}; c[k] = (c[k] || 0) + by; };
// Zähler während des Tages
function note(kind, x = {}) { const d = day();
  if (kind === 'cycle') { bump(d, 'cycles'); if (x.mt5 && !x.connected) bump(d, 'mt5DownMin', x.intervalS / 60); if (x.error) { bump(d, 'errors'); (D.count[d].lastError = String(x.error).slice(0, 100)); } }
  if (kind === 'reject') { bump(d, 'rejects'); const c = D.count[d]; c.rejectWhy = c.rejectWhy || {}; const k = String(x.why || '?').slice(0, 60); c.rejectWhy[k] = (c.rejectWhy[k] || 0) + 1; }
  if (kind === 'pause') bump(d, 'pause_' + x.type);
  const keep = Object.keys(D.count).sort().slice(-10); D.count = Object.fromEntries(keep.map(k => [k, D.count[k]])); }
const pausedUntil = (sym, now = Date.now()) => { const u = D.pauses[sym]; return u && u > now ? u : null; };
// Bericht für den Vortag
function build({ hist = [], journal = [], expect = {}, perf = null, cfg = {}, mode = 'paper', cal = null, scanner = [], manual = false }, now = Date.now()) {
  const y = day(now - 864e5), inY = t => t && day(t) === y, c = D.count[y] || {};
  const closed = hist.filter(h => inY(h.close)), opened = hist.filter(h => inY(h.open)).length;
  const pnl = closed.reduce((a, h) => a + (h.pnl || 0), 0), Rs = closed.filter(h => h.R != null).map(h => h.R);
  const skips = {}; for (const j of journal.filter(j => j.kind === 'skip' && inY(j.t))) { const m = /nicht gehandelt: ([^:–(]+)/.exec(j.text); const k = (m ? m[1] : 'sonstiges').trim().slice(0, 60); skips[k] = (skips[k] || 0) + 1; }
  const F = [], A = [];   // Befunde, automatische Aktionen
  const add = (lvl, text) => F.push({ lvl, text });
  // 1) Ausführung & Technik
  if (mode === 'mt5' && (c.mt5DownMin || 0) >= 30) add('warn', `MT5-Brücke war ${Math.round(c.mt5DownMin)} Min. nicht verbunden – auf Groks Server prüfen (supervisorctl status).`);
  if (c.rejects) add('warn', `${c.rejects} Order(s) von MT5 abgelehnt: ${Object.entries(c.rejectWhy || {}).map(([k, v]) => `${k} (${v}×)`).join(', ')}.`);
  if ((c.errors || 0) > 5) add('warn', `${c.errors} Zyklen mit Fehler (zuletzt: ${c.lastError}) – Datenquelle oder Server prüfen.`);
  if (cal && !cal.ok) add('info', `Wirtschaftskalender nicht verfügbar (${cal.note || 'unbekannt'}) – News-Pause greift nur über Kurssprünge.`);
  // 2) Risiko & Handel
  const skipTop = Object.entries(skips).sort((a, b) => b[1] - a[1]);
  if (skipTop.length) add('info', `Ausgelassene Signale: ${skipTop.slice(0, 4).map(([k, v]) => `${k} (${v}×)`).join(', ')}.`);
  const untrad = scanner.filter(r => r.play && r.tradeable === false).map(r => r.sym);
  if (untrad.length) add('info', `Mit ${cfg.riskEur ?? '?'} € je Trade nicht handelbar: ${untrad.join(', ')} – erst bei höherem Risiko je Trade möglich.`);
  const dayLoss = -closed.filter(h => h.pnl < 0).reduce((a, h) => a + h.pnl, 0);
  if (cfg.riskMode === 'eur' && dayLoss >= .8 * cfg.maxDailyLossEur) add('warn', `Tageslimit fast/ganz erreicht (Verlust ${dayLoss.toFixed(2)} € von ${cfg.maxDailyLossEur} €).`);
  if (closed.some(h => cfg.riskMode === 'eur' && h.pnl < -(cfg.riskEur * 1.5))) add('warn', `Ein Trade verlor mehr als 1,5 × das Risiko je Trade (Kurslücke/Slippage?) – Stop-Ausführung prüfen.`);
  // 3) Leistung gegen Test-Erwartung + automatischer Schutz je Markt
  if (perf && perf.status === 'warn') add('warn', perf.text);
  const bySym = {}; for (const h of [...hist].sort((a, b) => a.close - b.close)) if (h.R != null) (bySym[h.sym] = bySym[h.sym] || []).push(h.R);
  for (const [sym, rs] of Object.entries(bySym)) { const last = rs.slice(-MIN_N); if (last.length < MIN_N) continue;
    const avg = U.mean(last), exp = expect[sym] ?? .1, lim = exp - 2.5 * SD_R / Math.sqrt(last.length);
    if (avg < lim && !pausedUntil(sym, now)) { D.pauses[sym] = now + PAUSE_DAYS * 864e5; A.push(`${sym} für ${PAUSE_DAYS} Tage pausiert: letzte ${last.length} Trades Ø ${avg.toFixed(2)} R, Test-Erwartung ${exp.toFixed(2)} R (Grenze ${lim.toFixed(2)} R).`); } }
  for (const [sym, u] of Object.entries(D.pauses)) if (u <= now) { delete D.pauses[sym]; A.push(`Pause für ${sym} beendet – wird wieder gehandelt.`); }
  if (!F.length && !A.length) add('ok', closed.length ? 'Alles im Plan – keine Auffälligkeiten.' : 'Keine Trades – kein Signal hat alle Prüfungen bestanden. Das ist bei diesem Playbook normal.');
  const rep = { date: y, at: now, trades: { opened, closed: closed.length, wins: closed.filter(h => h.pnl > 0).length, losses: closed.filter(h => h.pnl <= 0).length, pnl: U.round(pnl, 2), sumR: U.round(Rs.reduce((a, b) => a + b, 0), 2) },
    byMarket: Object.entries(closed.reduce((m, h) => { (m[h.sym] = m[h.sym] || { n: 0, pnl: 0 }); m[h.sym].n++; m[h.sym].pnl += h.pnl || 0; return m; }, {})).map(([sym, v]) => ({ sym, n: v.n, pnl: U.round(v.pnl, 2) })),
    skips, tech: { mt5DownMin: Math.round(c.mt5DownMin || 0), rejects: c.rejects || 0, errors: c.errors || 0, cycles: c.cycles || 0 }, perf, findings: F, actions: A, paused: { ...D.pauses } };
  D.reports = [rep, ...D.reports.filter(r => r.date !== y)].slice(0, 30); if (!manual) D.lastDate = day(now); save(); return rep;
}
// Fällig? (ab 07:00 Berlin, einmal pro Tag)
const due = (now = Date.now()) => { const b = U.berlin(now); return b.h >= REPORT_HOUR && D.lastDate !== b.date; };
module.exports = { note, build, due, pausedUntil, reports: () => D.reports, pauses: () => ({ ...D.pauses }), REPORT_HOUR, _reset() { D = { reports: [], pauses: {}, count: {}, lastDate: null }; } };
