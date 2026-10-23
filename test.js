// Selbsttest ohne Abhängigkeiten: node test.js
const { spawn } = require('child_process'); const assert = require('assert');
const PORT = 3999, B = `http://127.0.0.1:${PORT}`;
const http = require('http'), crypto = require('crypto'), os = require('os'), path = require('path');
const TMP = require('fs').mkdtempSync(path.join(os.tmpdir(), 'ct-test-'));
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT, API_TOKEN: 'push-test-token', VIEW_PIN: '24681357', PUSH_ALLOW_HTTP_ENDPOINTS: '1',
  SUBS_FILE: path.join(TMP, 's.json'), EVENTS_FILE: path.join(TMP, 'e.json'), VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }, stdio: 'ignore' });
// Empfänger wie ein Push-Dienst: prüft VAPID-JWT (ES256) und entschlüsselt aes128gcm (RFC 8291) mit dem Geräte-Schlüssel
const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const AUTH = crypto.randomBytes(16), GOT = [];
const H = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function decrypt(buf) {
  const salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const ikm = H(H(AUTH, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])])), prk = H(salt, ikm);
  const d = crypto.createDecipheriv('aes-128-gcm', H(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16), H(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12));
  d.setAuthTag(ct.subarray(ct.length - 16)); const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2); return JSON.parse(pt.subarray(0, -1).toString());
}
const PS = http.createServer((q, r) => { const b = []; q.on('data', c => b.push(c)); q.on('end', () => {
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(q.headers.authorization || ''); assert.ok(m, 'VAPID-Header');
  const pub = Buffer.from(m[4], 'base64url'), key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
  assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')), 'JWT-Signatur');
  assert.equal(q.headers['content-encoding'], 'aes128gcm'); GOT.push({ key: m[4], msg: decrypt(Buffer.concat(b)) }); r.writeHead(q.url.includes('gone') ? 410 : 201); r.end(); }); }).listen(3998);
const j = (p, o = {}) => fetch(B + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } });
(async () => {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  try {
    assert.equal((await j('/api/update', { method: 'POST', body: '{"gen":1}' })).status, 401);
    assert.equal((await j('/api/update', { method: 'POST', body: '{"gen":1}', headers: { Authorization: 'Bearer falsch' } })).status, 401);
    assert.equal((await j('/api/update', { method: 'POST', body: JSON.stringify({ gen: 1, acc: { balance: 1 } }), headers: { Authorization: 'Bearer push-test-token' } })).status, 200);
    assert.equal((await j('/api/state')).status, 401);
    assert.equal((await j('/api/login', { method: 'POST', body: '{"pin":"0000"}' })).status, 401);
    const ok = await (await j('/api/login', { method: 'POST', body: '{"pin":"24681357"}' })).json(); assert.ok(ok.token);
    const st = await (await j('/api/state', { headers: { Authorization: 'Bearer ' + ok.token } })).json(); assert.equal(st.acc.balance, 1);
    assert.equal((await j('/api/state', { headers: { Authorization: 'Bearer ' + ok.token.replace(/.$/, 'x') } })).status, 401);
    for (let i = 0; i < 4; i++) await j('/api/login', { method: 'POST', body: '{"pin":"1111"}' });
    assert.equal((await j('/api/login', { method: 'POST', body: '{"pin":"24681357"}' })).status, 429);   // gesperrt nach 5 Fehlversuchen
    const idx = await fetch(B + '/'); assert.ok((await idx.text()).includes('apple-mobile-web-app-capable'));
    assert.equal((await fetch(B + '/manifest.webmanifest')).headers.get('content-type'), 'application/manifest+json');
    assert.equal((await fetch(B + '/../server.js')).status, 200);  // Pfad-Ausbruch -> liefert index.html, nie server.js
    assert.ok(!(await (await fetch(B + '/..%2fserver.js')).text()).includes('API_TOKEN'));
    // ---- Trade-Mitteilungen (Web-Push)
    const S = { Authorization: 'Bearer ' + ok.token }, P = { Authorization: 'Bearer push-test-token' };
    assert.equal((await j('/api/push/key')).status, 401);
    const key = (await (await j('/api/push/key', { headers: S })).json()).publicKey; assert.equal(Buffer.from(key, 'base64url').length, 65);
    const sub = { endpoint: 'http://127.0.0.1:3998/dev1', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: AUTH.toString('base64url') } };
    assert.equal((await j('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) })).status, 401);
    assert.equal((await j('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: { endpoint: 'http://evil.example/x', keys: sub.keys } }), headers: S })).status, 400);
    assert.equal((await j('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }), headers: S })).status, 200);
    const ev = { id: 'close:42', kind: 'close', pnl: -8.5, title: '🔴 −8,50 € · EURUSD BUY', body: 'Geschlossen · SL', symbol: 'EURUSD', side: 'BUY' };
    assert.equal((await j('/api/event', { method: 'POST', body: JSON.stringify(ev), headers: S })).status, 401);   // Sitzung reicht nicht, nur Bot-Token
    const r1 = await (await j('/api/event', { method: 'POST', body: JSON.stringify(ev), headers: P })).json(); assert.equal(r1.sent, 1);
    assert.equal(GOT[0].key, key); assert.equal(GOT[0].msg.title, ev.title); assert.equal(GOT[0].msg.color, 'red'); assert.ok(GOT[0].msg.icon.includes('notify-red'));
    assert.equal((await (await j('/api/event', { method: 'POST', body: JSON.stringify(ev), headers: P })).json()).dup, true); assert.equal(GOT.length, 1);   // keine Doppelten
    await j('/api/event', { method: 'POST', body: JSON.stringify({ ...ev, id: 'close:43', pnl: 12.34, title: '🟢 +12,34 €' }), headers: P }); assert.equal(GOT[1].msg.color, 'green');
    const evs = (await (await j('/api/events', { headers: S })).json()).events; assert.equal(evs[0].id, 'close:43'); assert.equal(evs.length, 2);
    const bk = await (await j('/api/push/subs', { headers: P })).json(); assert.equal(bk.subs.length, 1); assert.equal(bk.vapid, key);
    assert.equal((await j('/api/push/subs', { headers: S })).status, 401);
    await j('/api/push/restore', { method: 'POST', body: JSON.stringify({ subs: [{ ...sub, endpoint: 'http://127.0.0.1:3998/gone' }] }), headers: P });
    const r3 = await (await j('/api/event', { method: 'POST', body: JSON.stringify({ ...ev, id: 'open:44', kind: 'open', pnl: null }), headers: P })).json();
    assert.equal(r3.sent, 1); assert.equal(r3.removed, 1);   // abgelaufenes Abo (410) wird entfernt
    console.log('cloud_app: alle Tests bestanden');
  } catch (e) { console.error('FEHLER', e.message); process.exitCode = 1; } finally { srv.kill(); PS.close(); }
})();
