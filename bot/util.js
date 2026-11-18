// Gemeinsame Helfer: deterministischer Zufall, Statistik, Zeit, Formatierung.
'use strict';
// mulberry32 – schneller, reproduzierbarer PRNG (für Monte-Carlo und Simulator)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// Normalverteilte Zufallszahl (Box-Muller)
const gauss = r => { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x, d = 2) => { if (x == null || !isFinite(x)) return null; const f = 10 ** d; return Math.round(x * f) / f; };
const quantile = (sorted, q) => { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, b = Math.floor(p), r = p - b; return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b]; };
const last = (a, n = 1) => a[a.length - n];
const FB = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
const FN = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const parts = (f, t) => { const o = {}; for (const x of f.formatToParts(new Date(t))) o[x.type] = x.value; return o; };
// Zeitzonen-Teile sind je Viertelstunde gleich -> Cache (Intl ist teuer)
const memo = (f, mk) => { const c = new Map(); return t => { const k = Math.floor(t / 900e3); let v = c.get(k); if (!v) { v = mk(parts(f, k * 900e3)); if (c.size > 50000) c.clear(); c.set(k, v); } return v; }; };
const _b = memo(FB, p => ({ wd: p.weekday, h: +p.hour % 24, m0: +p.minute, date: `${p.year}-${p.month}-${p.day}` }));
const _n = memo(FN, p => ({ wd: p.weekday, m0: (+p.hour % 24) * 60 + +p.minute }));
const berlin = (t = Date.now()) => { const v = _b(t), dm = Math.floor((t % 900e3) / 60e3); return { wd: v.wd, h: v.h, m: v.m0 + dm, date: v.date }; };
const nyTime = (t = Date.now()) => { const v = _n(t); return { wd: v.wd, mins: v.m0 + Math.floor((t % 900e3) / 60e3) }; };
const fmtPrice = (x, d) => x == null ? '–' : Number(x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => x == null || !isFinite(x) ? '–' : (x * 100).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
module.exports = { rng, hash, gauss, mean, std, clamp, round, quantile, last, berlin, nyTime, fmtPrice, pct };
