// KONGRESS-Helfer: Aktienkäufe/-verkäufe von US-Abgeordneten (STOCK-Act-Meldungen, Verzögerung bis 45 Tage!).
// Quelle: QUIVER_API_KEY (api.quiverquant.com) oder eigene JSON-Liste über CONGRESS_URL. Ohne Quelle: neutral, ehrlich „inaktiv“.
'use strict';
const https = require('https'), M = require('./market');
const KEY = (process.env.QUIVER_API_KEY || '').trim(), URL_ = (process.env.CONGRESS_URL || '').trim();
let C = { at: 0, rows: [], ok: false, note: 'lädt …' };
function getJson(url, headers = {}) {
  return new Promise((ok, no) => { const r = https.get(url, { timeout: 15000, headers: { 'User-Agent': 'trader-skill/2.0', Accept: 'application/json', ...headers } }, res => {
    const b = []; res.on('data', x => b.push(x)); res.on('end', () => { if (res.statusCode !== 200) return no(new Error('HTTP ' + res.statusCode)); try { ok(JSON.parse(Buffer.concat(b).toString())); } catch (e) { no(e); } }); });
  r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', no); });
}
// Betragsspanne "$1,001 - $15,000" -> Mittelwert
const amount = s => { const n = String(s || '').replace(/[$,]/g, '').match(/\d+/g); if (!n) return 8000; const v = n.map(Number); return v.length > 1 ? (v[0] + v[1]) / 2 : v[0]; };
function norm(x) {
  const tk = String(x.Ticker || x.ticker || '').toUpperCase(), tx = String(x.Transaction || x.type || x.transaction || '').toLowerCase();
  const side = /purchase|buy|kauf/.test(tx) ? 1 : /sale|sell|verkauf/.test(tx) ? -1 : 0, t = Date.parse(x.TransactionDate || x.transaction_date || x.ReportDate || x.disclosure_date || '');
  return tk && side && isFinite(t) ? { tk, side, t, who: String(x.Representative || x.representative || x.senator || x.name || 'Abgeordnete/r').slice(0, 60), amt: amount(x.Range || x.amount || x.Amount), house: x.House || x.chamber || '' } : null;
}
async function refresh(now = Date.now()) {
  if (now - C.at < 6 * 3600e3 && C.at) return C;
  if (!KEY && !URL_) { C = { at: now, rows: [], ok: false, note: 'inaktiv – keine Datenquelle (QUIVER_API_KEY oder CONGRESS_URL setzen)' }; return C; }
  if (M.status().source === 'sim') { C = { at: now, rows: [], ok: false, note: 'keine Live-Verbindung' }; return C; }
  try { const j = KEY ? await getJson('https://api.quiverquant.com/beta/live/congresstrading', { Authorization: 'Bearer ' + KEY }) : await getJson(URL_);
    const rows = (Array.isArray(j) ? j : j.data || []).map(norm).filter(Boolean).filter(r => now - r.t < 120 * 864e5).sort((a, b) => b.t - a.t);
    C = { at: now, rows: rows.slice(0, 3000), ok: true, note: null };
  } catch (e) { C = { ...C, at: now, ok: false, note: 'Quelle nicht erreichbar (' + String(e.message).slice(0, 30) + ')' }; }
  return C;
}
// Netto-Fluss für eine Aktie in den letzten 90 Tagen: -1..1
function flow(sym, now = Date.now()) {
  const rows = C.rows.filter(r => r.tk === sym && now - r.t < 90 * 864e5); let buy = 0, sell = 0; rows.forEach(r => r.side > 0 ? buy += r.amt : sell += r.amt);
  const tot = buy + sell; return { score: tot ? (buy - sell) / tot * Math.min(1, rows.length / 4) : 0, n: rows.length, buy, sell, recent: rows.slice(0, 6) };
}
const latest = (n = 12) => C.rows.slice(0, n);
module.exports = { refresh, flow, latest, state: () => ({ ok: C.ok, note: C.note, n: C.rows.length }), _set: rows => { C = { at: Date.now(), rows: rows.map(norm).filter(Boolean), ok: true }; } };
