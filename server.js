// Cloude Trading – Handy-Dashboard (Render Web Service, ohne npm-Abhängigkeiten).
// Der Bot pusht ausgehend: POST /api/update  (Authorization: Bearer <API_TOKEN>)  -> letzter Snapshot im Speicher.
// Das Handy meldet sich mit der View-PIN an: POST /api/login {pin} -> Sitzungs-Token (HMAC, 180 Tage) -> GET /api/state.
// ENV: API_TOKEN (Push-Token), VIEW_PIN (Anzeige-PIN), optional SESSION_SECRET, PORT.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000, API_TOKEN = process.env.API_TOKEN || '', VIEW_PIN = process.env.VIEW_PIN || '';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('ct|' + API_TOKEN + '|' + VIEW_PIN).digest('hex');
const PUB = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname, MAX_BODY = 512 * 1024, SESSION_DAYS = 180;
let SNAP = null, LAST = 0, PUSHES = 0;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'" };
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sign = exp => exp + '.' + crypto.createHmac('sha256', SECRET).update('s' + exp).digest('base64url');
const valid = t => { const [e, s] = String(t || '').split('.'); return !!s && +e > Date.now() && eq(t, sign(e)); };
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SEC, ...h }); res.end(JSON.stringify(obj)); };
// Brute-Force-Schutz für die PIN: max. 5 Fehlversuche / 15 Min. pro IP, global max. 50 / 15 Min.
const FAILS = new Map(); let GFAIL = []; const WIN = 15 * 60e3;
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const blocked = ip => { const n = Date.now(); GFAIL = GFAIL.filter(t => n - t < WIN); const f = (FAILS.get(ip) || []).filter(t => n - t < WIN); FAILS.set(ip, f); return f.length >= 5 || GFAIL.length >= 50; };
const fail = ip => { FAILS.get(ip).push(Date.now()); GFAIL.push(Date.now()); };
function body(req) { return new Promise((ok, no) => { let n = 0, b = []; req.on('data', c => { n += c.length; if (n > MAX_BODY) { no(new Error('zu groß')); req.destroy(); } else b.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(b).toString() || '{}')); } catch (e) { no(e); } }); req.on('error', no); }); }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  try {
    if (p === '/healthz') return send(res, 200, { ok: true, hasData: !!SNAP, ageS: LAST ? Math.round((Date.now() - LAST) / 1000) : null });
    if (p === '/api/update' && req.method === 'POST') {
      const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!API_TOKEN) return send(res, 503, { error: 'API_TOKEN fehlt auf dem Server' });
      if (!eq(tok, API_TOKEN)) return send(res, 401, { error: 'unauthorized' });
      const b = await body(req); if (!b || typeof b !== 'object' || typeof b.gen !== 'number') return send(res, 400, { error: 'Snapshot ungültig' });
      SNAP = b; LAST = Date.now(); PUSHES++; return send(res, 200, { ok: true });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const ip = ipOf(req); if (!VIEW_PIN) return send(res, 503, { error: 'VIEW_PIN fehlt auf dem Server' });
      if (blocked(ip)) return send(res, 429, { error: 'Zu viele Versuche – bitte 15 Minuten warten.' });
      const b = await body(req).catch(() => ({}));
      if (!eq(String(b.pin || ''), VIEW_PIN)) { fail(ip); return send(res, 401, { error: 'Falsche PIN.' }); }
      return send(res, 200, { token: sign(Date.now() + SESSION_DAYS * 864e5) });
    }
    if (p === '/api/state') {
      const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!valid(t)) return send(res, 401, { error: 'Anmeldung nötig' });
      if (!SNAP) return send(res, 503, { error: 'Noch keine Daten vom Bot (Server gerade neu gestartet?)' });
      return send(res, 200, { ...SNAP, serverAgeS: Math.round((Date.now() - LAST) / 1000) });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : decodeURIComponent(p)));
    if (PUB === __dirname) { const flat = path.basename(f); f = /^(index\.html|app\.js|globe\.js|style\.css|sw\.js|manifest\.webmanifest|[a-z0-9-]+\.png)$/.test(flat) ? path.join(PUB, flat) : path.join(PUB, 'index.html'); }
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /sw\.js|index\.html/.test(f) ? 'no-cache' : 'public, max-age=3600', ...SEC });
    fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 400, { error: 'Anfrage ungültig' }); }
});
server.listen(PORT, () => console.log(`Cloude Trading App auf Port ${PORT} · Token ${API_TOKEN ? 'gesetzt' : 'FEHLT'} · PIN ${VIEW_PIN ? 'gesetzt' : 'FEHLT'}`));
