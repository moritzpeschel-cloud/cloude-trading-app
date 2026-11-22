// NEWS-Helfer: Schlagzeilen je Symbol (Yahoo-Finance-RSS, ohne Key) + Stimmungs-Score per Finanz-Wörterbuch (EN/DE),
// zeitlich gewichtet (Halbwertszeit 12 h). Eilmeldung = < 90 Min. alt und starke Stimmung. Ohne Netz: ehrlich „keine Quelle“.
'use strict';
const M = require('./market'), I = require('./instruments');
const POS = { beat: 2, beats: 2, surge: 2, surges: 2, soar: 2, soars: 2, rally: 2, rallies: 2, record: 1.5, upgrade: 2, upgrades: 2, upgraded: 2, outperform: 1.5, bullish: 2, gain: 1, gains: 1, rise: 1, rises: 1, jump: 1.5, jumps: 1.5,
  strong: 1, growth: 1, profit: 1, raises: 1, raise: 1, buyback: 1.5, approval: 1.5, approved: 1.5, wins: 1, win: 1, higher: .8, optimism: 1.2, rebound: 1.2, boost: 1.2, tops: 1.2, exceeds: 1.5,
  steigt: 1, steigen: 1, gewinn: 1, gewinne: 1, rekord: 1.5, hochgestuft: 2, kaufempfehlung: 2, erholung: 1.2, stark: 1, übertrifft: 1.5, zuwachs: 1 };
const NEG = { miss: -2, misses: -2, plunge: -2, plunges: -2, slump: -2, slumps: -2, crash: -2.5, tumble: -2, tumbles: -2, downgrade: -2, downgrades: -2, downgraded: -2, bearish: -2, loss: -1, losses: -1, fall: -1, falls: -1,
  drop: -1, drops: -1, weak: -1, cut: -1, cuts: -1, lawsuit: -1.5, probe: -1.5, investigation: -1.5, recall: -1.5, fraud: -2.5, warning: -1.5, warns: -1.5, layoffs: -1.2, lower: -.8, fears: -1.2, recession: -1.5, sell: -.6, selloff: -2, tariff: -1, tariffs: -1, bankruptcy: -3, halt: -1.5,
  fällt: -1, fallen: -1, verlust: -1, verluste: -1, einbruch: -2, herabgestuft: -2, warnung: -1.5, klage: -1.5, crash_de: -2.5, schwach: -1, rezession: -1.5, zölle: -1 };
const NEGATE = new Set(['not', 'no', 'nicht', 'kein', 'keine', "isn't", "doesn't", 'without']);
// Bei Währungs-/Rohstoff-Paaren: „Dollar stark“ ist für XXXUSD negativ
const USD_FLIP = /\b(dollar|greenback|usd)\b/i;
function score(title, sym) {
  const w = title.toLowerCase().replace(/[^a-zäöüß0-9' ]/g, ' ').split(/\s+/); let s = 0;
  w.forEach((x, i) => { const v = POS[x] || NEG[x] || 0; if (!v) return; s += NEGATE.has(w[i - 1]) || NEGATE.has(w[i - 2]) ? -v * .7 : v; });
  const inst = I.get(sym); if (inst && /USD$/.test(sym) && inst.type !== 'stock' && USD_FLIP.test(title) && !/gold|silver|euro|pound|bitcoin|ether/i.test(title)) s = -s;
  return Math.max(-4, Math.min(4, s));
}
const cache = new Map();
function parseRss(xml) {
  const items = []; for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const g = tag => { const r = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`).exec(m[1]); return r ? r[1].trim() : ''; };
    const ent = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const t = Date.parse(g('pubDate')); items.push({ title: ent(g('title')).slice(0, 200), link: /^https:\/\//.test(g('link')) ? g('link') : null, t: isFinite(t) ? t : Date.now() });
  } return items;
}
async function fetchNews(sym, now = Date.now()) {
  const c = cache.get(sym); if (c && now - c.at < 10 * 60e3) return c;
  if (M.status().source === 'sim') { const r = { at: now, items: [], ok: false, note: 'keine Live-Verbindung – keine Schlagzeilen (es werden keine erfunden)' }; cache.set(sym, r); return r; }
  try {
    const inst = I.get(sym), xml = await M.get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(inst.yahoo)}&region=US&lang=en-US`);
    const items = parseRss(xml).filter(x => now - x.t < 3 * 864e5).sort((a, b) => b.t - a.t).slice(0, 15).map(x => ({ ...x, s: score(x.title, sym) }));
    const r = { at: now, items, ok: true }; cache.set(sym, r); return r;
  } catch (e) { const r = { at: now, items: c ? c.items : [], ok: false, note: 'Quelle nicht erreichbar (' + String(e.message).slice(0, 30) + ')' }; cache.set(sym, r); return r; }
}
// Aggregat: -1..1
function sentiment(items, now = Date.now()) {
  let s = 0, w = 0; for (const x of items) { const k = Math.pow(.5, (now - x.t) / (12 * 3600e3)); s += x.s * k; w += k; }
  const val = w ? Math.tanh(s / Math.max(1.5, w) / 1.5) : 0;
  const breaking = items.find(x => now - x.t < 90 * 60e3 && Math.abs(x.s) >= 2) || null;
  return { score: val, n: items.length, breaking };
}
// ---------- Wirtschaftskalender (Forex Factory, öffentliche Wochen-Übersicht, ohne Key) ----------
// Hochwichtige USD-Termine (Zinsentscheid FOMC, Inflation CPI, Arbeitsmarkt NFP, Fed-Chef …) bewegen Gold, Krypto und US-Indizes oft
// sprunghaft – ein Stop kann dann übersprungen werden. Regel (Schutz, nicht als Gewinnregel getestet): keine NEUEN Einstiege von
// PAUSE_BEFORE Min. vor bis PAUSE_AFTER Min. nach so einem Termin. Offene Trades bleiben unangetastet (ihr Stop schützt).
const CAL_URL = process.env.CALENDAR_URL || 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const PAUSE_BEFORE = 30, PAUSE_AFTER = 60, CAL_EVERY = 3 * 3600e3, CURR = ['USD'];
let CAL = { at: 0, events: [], ok: false, note: 'lädt …' };
function parseCalendar(j) {
  return (Array.isArray(j) ? j : []).map(e => ({ title: String(e.title || '').slice(0, 80), cur: String(e.country || '').toUpperCase(), impact: String(e.impact || ''), t: Date.parse(e.date) }))
    .filter(e => isFinite(e.t) && e.impact === 'High' && CURR.includes(e.cur)).sort((a, b) => a.t - b.t);
}
let CAL_INFLIGHT = null, CAL_BACKOFF = 0;
async function refreshCalendar(now = Date.now()) {
  if (CAL_INFLIGHT) return CAL_INFLIGHT;   // nie mehrere Anfragen gleichzeitig (die Quelle antwortet sonst mit 429)
  if (CAL.at && now - CAL.at < (CAL.ok && !CAL.note ? CAL_EVERY : Math.max(15 * 60e3, CAL_BACKOFF))) return CAL;
  CAL_INFLIGHT = refreshCalendarNow(now).finally(() => { CAL_INFLIGHT = null; }); return CAL_INFLIGHT;
}
async function refreshCalendarNow(now) {
  if (M.status().source === 'sim') { CAL = { at: now, events: [], ok: false, note: 'keine Live-Verbindung – Kalender aus' }; return CAL; }
  try { const ev = parseCalendar(JSON.parse(await M.get(CAL_URL))); CAL = { at: now, events: ev, ok: true, note: null }; CAL_BACKOFF = 0; }
  catch (e) { const r429 = /429/.test(String(e.message)); CAL_BACKOFF = r429 ? Math.min(4 * 3600e3, Math.max(30 * 60e3, CAL_BACKOFF * 2)) : 15 * 60e3;
    CAL = { ...CAL, at: now, ok: CAL.events.length > 0, note: 'Kalender nicht erreichbar (' + String(e.message).slice(0, 30) + `) – neuer Versuch in ${Math.round(CAL_BACKOFF / 60e3)} Min.` + (CAL.events.length ? ', letzte Daten werden genutzt' : '') }; }
  return CAL;
}
// Pause aktiv? -> { paused, event, from, to } ; next = nächster Termin
function calendarPause(now = Date.now(), events = CAL.events) {
  const hit = events.find(e => now >= e.t - PAUSE_BEFORE * 60e3 && now <= e.t + PAUSE_AFTER * 60e3);
  const next = events.find(e => e.t > now) || null;
  return { paused: !!hit, event: hit || null, until: hit ? hit.t + PAUSE_AFTER * 60e3 : null, next, ok: CAL.ok, note: CAL.note };
}
module.exports = { fetchNews, sentiment, score, parseRss, parseCalendar, refreshCalendar, calendarPause, PAUSE_BEFORE, PAUSE_AFTER, _setCal: c => { CAL = { at: Date.now(), ok: true, note: null, ...c }; } };
