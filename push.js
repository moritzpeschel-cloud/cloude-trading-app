// Trade-Mitteilungen per Standard-Web-Push (wie Gold Bot) – OHNE Abhängigkeiten: VAPID (RFC 8292, ES256) und
// Verschlüsselung aes128gcm (RFC 8291/8188) mit Node-crypto. Kostenlos (Apple/Google/Mozilla-Push-Dienste).
// VAPID-Schlüssel: Env VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (base64url, nur in Render-Env / .cloude_app.env, nie im Repo);
// fehlen sie, werden sie stabil aus API_TOKEN abgeleitet (gleich nach jedem Neustart, ohne zusätzliche Einstellungen).
// Abos + letzte Ereignisse liegen in /tmp (Render Free: flüchtig) – Selbstheilung: App meldet ihr Abo bei jedem Öffnen neu an,
// der Bot sichert die Liste (GET /api/push/subs) und spielt sie zurück (POST /api/push/restore).
'use strict';
const fs = require('fs'), crypto = require('crypto'), https = require('https'), http = require('http');
const SUBS_FILE = process.env.SUBS_FILE || '/tmp/cloude-subs.json', EVENTS_FILE = process.env.EVENTS_FILE || '/tmp/cloude-events.json';
const SUBJECT = process.env.VAPID_SUBJECT || 'https://cloude-trading.onrender.com', MAX_SUBS = 20, MAX_EVENTS = 60;
const ALLOW_HTTP = process.env.PUSH_ALLOW_HTTP_ENDPOINTS === '1';   // nur für lokale Tests
const b64u = b => Buffer.from(b).toString('base64url'), unb = s => Buffer.from(String(s), 'base64url');

function deriveVapid(seed) {
  for (let i = 0; i < 16; i++) {
    const k = crypto.createHmac('sha256', 'cloude-vapid-v1').update(seed + '|' + i).digest();
    try { const e = crypto.createECDH('prime256v1'); e.setPrivateKey(k); return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(k) }; } catch (_) {}
  }
  throw new Error('vapid');
}
let VAPID = null;
function vapid(token) {
  if (VAPID) return VAPID;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) VAPID = { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim(), src: 'env' };
  else if (token) VAPID = { ...deriveVapid('push|' + token), src: 'derived' };
  return VAPID;
}
function vapidAuth(endpoint, v) {
  const pub = unb(v.publicKey), aud = new URL(endpoint).origin;
  const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: b64u(Buffer.concat([Buffer.alloc(32), unb(v.privateKey)]).subarray(-32)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const data = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const sig = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${data}.${b64u(sig)}, k=${v.publicKey}`;
}
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function encrypt(sub, payload) {
  const uaPub = unb(sub.keys.p256dh), auth = unb(sub.keys.auth), as = crypto.createECDH('prime256v1'); as.generateKeys();
  const asPub = as.getPublicKey(), secret = as.computeSecret(uaPub), salt = crypto.randomBytes(16);
  const ikm = hmac(hmac(auth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce), body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}
function sendOne(sub, payload, v, ttl = 6 * 3600) {
  return new Promise((ok, no) => {
    const u = new URL(sub.endpoint), body = encrypt(sub, payload), lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, { method: 'POST', timeout: 10000, headers: { Authorization: vapidAuth(sub.endpoint, v), TTL: String(ttl), Urgency: 'high',
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Content-Length': body.length } }, res => {
      res.resume(); res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? ok(res.statusCode) : no(Object.assign(new Error('push ' + res.statusCode), { statusCode: res.statusCode })));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', no); req.end(body);
  });
}

function validSub(s) {
  return !!(s && typeof s === 'object' && typeof s.endpoint === 'string' && (/^https:\/\//.test(s.endpoint) || (ALLOW_HTTP && /^http:\/\/127\.0\.0\.1:/.test(s.endpoint))) && s.endpoint.length < 1000 &&
    s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100);
}
const slim = s => ({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
let subs = [], events = [], seen = new Set();
function addSub(s) { s = slim(s); const i = subs.findIndex(x => x.endpoint === s.endpoint); if (i >= 0) { subs[i] = s; return false; } subs.push(s); if (subs.length > MAX_SUBS) subs.shift(); return true; }
function load() {
  try { JSON.parse(process.env.PUSH_SUBSCRIPTIONS || '[]').filter(validSub).forEach(addSub); } catch (_) {}
  try { JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')).filter(validSub).forEach(addSub); } catch (_) {}
  try { events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')).slice(-MAX_EVENTS); events.forEach(e => seen.add(e.id)); } catch (_) {}
}
const save = () => fs.writeFile(SUBS_FILE, JSON.stringify(subs), () => {});
load();

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
function cleanEvent(b) {
  const kind = ['open', 'close', 'test', 'alert', 'report'].includes(b.kind) ? b.kind : null; if (!kind) throw new Error('kind fehlt');
  const id = str(b.id, 80); if (!id) throw new Error('id fehlt');
  const pnl = typeof b.pnl === 'number' && isFinite(b.pnl) ? Math.round(b.pnl * 100) / 100 : null;
  const color = pnl != null ? (pnl > 0.004 ? 'green' : pnl < -0.004 ? 'red' : 'neutral') : (['green', 'red'].includes(b.color) ? b.color : 'neutral');
  return { id, kind, title: str(b.title, 120), body: str(b.body, 300), pnl, color, symbol: str(b.symbol, 20), side: str(b.side, 8),
    test: !!b.test || kind === 'test', t: typeof b.t === 'number' ? b.t : Math.floor(Date.now() / 1000) };
}
async function sendAll(ev, token) {
  const v = vapid(token); if (!v) return { sent: 0, failed: 0, error: 'keine VAPID-Schlüssel' };
  const icon = ev.color === 'green' ? 'icons/notify-green.png' : ev.color === 'red' ? 'icons/notify-red.png' : 'icons/icon-192.png';
  const payload = JSON.stringify({ title: ev.title, body: ev.body, tag: 'ct-' + ev.id, icon, id: ev.id, color: ev.color, pnl: ev.pnl, test: ev.test });
  let sent = 0, failed = 0; const gone = [], errs = [];
  await Promise.all(subs.map(async s => {
    try { await sendOne(s, payload, v); sent++; }
    catch (e) { failed++; errs.push(String(e.statusCode || e.code || e.message).slice(0, 40)); if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint); }
  }));
  if (gone.length) { subs = subs.filter(s => !gone.includes(s.endpoint)); save(); }
  return { sent, failed, removed: gone.length, errors: errs.slice(0, 5) };
}
// h: { send, body, bearerOk, sessionOk, token }
async function handle(p, req, res, h) {
  if (p === '/api/event' && req.method === 'POST') {
    if (!h.token) return h.send(res, 503, { error: 'API_TOKEN fehlt' });
    if (!h.bearerOk()) return h.send(res, 401, { error: 'unauthorized' });
    const ev = cleanEvent(await h.body(req));
    if (seen.has(ev.id)) return h.send(res, 200, { ok: true, dup: true, subs: subs.length });
    seen.add(ev.id); if (seen.size > 2000) seen = new Set([...seen].slice(-1000));
    events.push(ev); events = events.slice(-MAX_EVENTS); fs.writeFile(EVENTS_FILE, JSON.stringify(events), () => {});
    return h.send(res, 200, { ok: true, dup: false, subs: subs.length, ...(await sendAll(ev, h.token)) });
  }
  if (p === '/api/events' && req.method === 'GET') {
    if (!h.sessionOk()) return h.send(res, 401, { error: 'Anmeldung nötig' });
    return h.send(res, 200, { events: events.slice().reverse() });
  }
  if (p === '/api/push/key' && req.method === 'GET') {
    if (!h.sessionOk()) return h.send(res, 401, { error: 'Anmeldung nötig' });
    const v = vapid(h.token); return h.send(res, v ? 200 : 503, { publicKey: v ? v.publicKey : null });
  }
  if ((p === '/api/push/subscribe' || p === '/api/push/unsubscribe') && req.method === 'POST') {
    if (!h.sessionOk()) return h.send(res, 401, { error: 'Anmeldung nötig' });
    const s = (await h.body(req)).subscription; if (!validSub(s)) return h.send(res, 400, { error: 'Abo ungültig' });
    if (p.endsWith('/subscribe')) addSub(s); else subs = subs.filter(x => x.endpoint !== s.endpoint);
    save(); return h.send(res, 200, { ok: true, subs: subs.length });
  }
  if (p === '/api/push/subs' && req.method === 'GET') {
    if (!h.bearerOk()) return h.send(res, 401, { error: 'unauthorized' });
    const v = vapid(h.token); return h.send(res, 200, { subs, vapid: v ? v.publicKey : null });
  }
  if (p === '/api/push/restore' && req.method === 'POST') {
    if (!h.bearerOk()) return h.send(res, 401, { error: 'unauthorized' });
    let added = 0; ((await h.body(req)).subs || []).filter(validSub).forEach(s => { if (addSub(s)) added++; });
    if (added) save(); return h.send(res, 200, { ok: true, added, subs: subs.length });
  }
  return false;
}
async function sendTest(token) {   // Test-Mitteilung aus den Einstellungen (keine Order)
  const ev = cleanEvent({ id: 'test-' + Date.now(), kind: 'test', title: '🧪 TEST · Cloude Trading', body: 'Test-Mitteilung aus den Einstellungen – keine echte Order.', pnl: null });
  events.push(ev); events = events.slice(-MAX_EVENTS); fs.writeFile(EVENTS_FILE, JSON.stringify(events), () => {});
  return { subs: subs.length, ...(await sendAll(ev, token)) };
}
async function sendAlert(token, b) {   // Server-eigene Alarme (Bot offline/online) – ohne Bot, direkt an alle Abos
  const ev = cleanEvent({ kind: 'alert', ...b }); if (seen.has(ev.id)) return { dup: true }; seen.add(ev.id);
  events.push(ev); events = events.slice(-MAX_EVENTS); fs.writeFile(EVENTS_FILE, JSON.stringify(events), () => {});
  return { subs: subs.length, ...(await sendAll(ev, token)) };
}
module.exports = { handle, sendTest, sendAlert, deriveVapid, encrypt, vapidAuth, _reset() { subs = []; events = []; seen = new Set(); VAPID = null; }, _subs: () => subs };
