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
module.exports = { fetchNews, sentiment, score, parseRss };
