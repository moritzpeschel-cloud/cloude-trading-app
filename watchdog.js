// Ausfall-Alarm (25.10.2026): Der Bot schickt alle 30 s einen Snapshot (POST /api/update) – auch am Wochenende.
// Kommt > STALE_MIN Minuten (Standard 5) nichts, geht EINE Meldung „⚠️ Bot offline seit HH:MM“ (Berliner Zeit) an alle Push-Abos
// und – falls TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Render gesetzt sind – direkt an Telegram. Kommen wieder Daten:
// „✅ Bot wieder online“. Ein Timer im Prozess prüft alle 30 s. Hält Render NICHT wach (Render Free schläft nur nach
// 15 Min. ohne eingehende Anfragen) – dafür den externen Pinger (cron-job.org bzw. .github/workflows/keepalive.yml) nutzen.
// Nach einem Server-Neustart ohne Daten zählt die Startzeit als „letztes Lebenszeichen“. Werte werden nie geloggt.
'use strict';
const https = require('https'), fs = require('fs');
const STALE_MS = (+process.env.STALE_MIN || 5) * 60e3, CHECK_MS = 30e3, STATE_FILE = process.env.ALARM_FILE || '/tmp/cloude-alarm.json';
let S = { last: 0, boot: Date.now(), down: false, downSince: 0, alerts: 0, lastAlert: null, tg: null }, CTX = null, TIMER = null;
try { const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (j.down) Object.assign(S, { down: true, downSince: j.downSince, last: j.last || 0 }); } catch (_) {}
const persist = () => fs.writeFile(STATE_FILE, JSON.stringify({ down: S.down, downSince: S.downSince, last: S.last }), () => {});
const hhmm = t => new Date(t).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const tgCfg = () => ({ tok: (process.env.TELEGRAM_BOT_TOKEN || '').trim(), chat: (process.env.TELEGRAM_CHAT_ID || '').trim() });
function telegram(text) {
  const { tok, chat } = tgCfg(); if (!tok || !chat) return Promise.resolve('nicht konfiguriert');
  const body = JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true });
  return new Promise(ok => {
    const r = https.request({ host: 'api.telegram.org', path: `/bot${tok}/sendMessage`, method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); res.on('end', () => ok(res.statusCode === 200 ? 'ok' : 'HTTP ' + res.statusCode)); });
    r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', e => ok('Fehler ' + String(e.code || e.message).replace(tok, '***').slice(0, 40))); r.end(body);
  });
}
async function notify(kind, title, body, test = false) {
  const t = (test ? '🧪 TEST · ' : '') + title, out = {};
  try { out.push = CTX && CTX.token ? await CTX.push.sendAlert(CTX.token, { id: (test ? 'test-' : '') + kind + ':' + Date.now(), title: t, body, color: kind === 'online' ? 'green' : 'red', test }) : 'kein API_TOKEN'; }
  catch (e) { out.push = 'Fehler ' + String(e.message).slice(0, 40); }
  for (let i = 0; i < 3; i++) { out.telegram = await telegram(t + (body ? '\n' + body : '')); if (out.telegram === 'ok' || out.telegram === 'nicht konfiguriert') break; await new Promise(r => setTimeout(r, 3000 * (i + 1))); }
  S.lastAlert = { kind, t: Date.now(), push: out.push && out.push.sent, telegram: out.telegram }; S.tg = out.telegram; return out;
}
const offlineText = since => `⚠️ Bot offline seit ${hhmm(since)}`;
async function check(now = Date.now()) {
  const ref = S.last || S.boot;
  if (!S.down && now - ref > STALE_MS) {
    S.down = true; S.downSince = ref; S.alerts++; persist();
    await notify('offline', offlineText(ref), S.last ? `Seit ${Math.round((now - ref) / 60e3)} Min. keine Daten vom Trading-Bot. PC/Server, run.py und Internet prüfen.` : 'Seit dem Neustart des Handy-Servers noch keine Daten vom Bot.');
    return 'offline';
  }
  return null;
}
async function seen(t = Date.now()) {
  const was = S.down, since = S.downSince; S.last = t;
  if (was) { S.down = false; persist(); await notify('online', '✅ Bot wieder online', `Daten kommen wieder (Ausfall ${hhmm(since)}–${hhmm(t)}, ${Math.max(1, Math.round((t - since) / 60e3))} Min.).`); return 'online'; }
  return null;
}
function start(ctx) { CTX = ctx; if (!TIMER) { TIMER = setInterval(() => check().catch(() => {}), CHECK_MS); } return TIMER; }
function stop() { clearInterval(TIMER); TIMER = null; }
async function test() {
  const a = await notify('offline', offlineText(Date.now() - 6 * 60e3), 'Probe-Alarm – der Bot läuft normal.', true);
  const b = await notify('online', '✅ Bot wieder online', 'Probe-Entwarnung – der Bot läuft normal.', true);
  return { ok: true, offline: a, online: b };
}
const state = () => ({ down: S.down, since: S.down ? new Date(S.downSince).toISOString() : null, alerts: S.alerts, telegram: tgCfg().tok && tgCfg().chat ? 'konfiguriert' : 'nicht konfiguriert', staleMin: STALE_MS / 60e3 });
module.exports = { start, stop, check, seen, test, state, telegram, _S: () => S, _reset(o = {}) { S = { last: 0, boot: Date.now(), down: false, downSince: 0, alerts: 0, lastAlert: null, tg: null, ...o }; } };
