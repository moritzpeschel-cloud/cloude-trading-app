// Cloude Trading – Handy-Dashboard (Render Web Service, ohne npm-Abhängigkeiten).
// Der Bot pusht ausgehend: POST /api/update  (Authorization: Bearer <API_TOKEN>)  -> letzter Snapshot im Speicher.
// Das Handy meldet sich mit der View-PIN an: POST /api/login {pin} -> Sitzungs-Token (HMAC, 180 Tage) -> GET /api/state.
// Trade-Mitteilungen (Web-Push, push.js): POST /api/event (Bearer API_TOKEN) -> Push an alle Abos; /api/events, /api/push/* (Sitzung).
// ENV: API_TOKEN (Push-Token), VIEW_PIN (Anzeige-PIN), optional SESSION_SECRET, VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, PORT.
// Ausfall-Alarm (watchdog.js): kein /api/update > STALE_MIN (5) Min. -> Web-Push + optional Telegram (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), push = require('./push');
const PORT = +process.env.PORT || 3000, API_TOKEN = process.env.API_TOKEN || '', VIEW_PIN = process.env.VIEW_PIN || '';
const watchdog = require('./watchdog');
// Trader-Skill-Engine (11 Helfer, Paper-Trading) – läuft im selben Prozess. ENGINE=off schaltet sie ab.
const ENGINE_ON = (process.env.ENGINE || 'on').toLowerCase() !== 'off';
const engine = ENGINE_ON ? require('./bot/engine') : null;
const ANA = new Map();   // Analyse-Cache je Symbol (30 s), damit das Handy den Server nicht dauernd rechnen lässt
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('ct|' + API_TOKEN + '|' + VIEW_PIN).digest('hex');
const PUB = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname, MAX_BODY = 512 * 1024, SESSION_DAYS = 180;
let SNAP = null, LAST = 0, PUSHES = 0;
// Mitteilungs-Einstellungen (Bot hält die Wahrheit in data/notify_prefs.json; neuester Zeitstempel t gewinnt) + Test-Anfrage für Telegram
const PKEYS = ['open', 'close', 'telegram', 'push']; let PREFS = null, TESTREQ = null;
const cleanPrefs = (b, t) => { const o = { ...(PREFS || { open: true, close: true, telegram: true, push: true }) }; PKEYS.forEach(k => { if (typeof (b || {})[k] === 'boolean') o[k] = b[k]; }); o.t = t; return o; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
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
    if (p === '/healthz') return send(res, 200, { ok: true, engine: engine ? { cycle: engine._S.cycle, ageS: engine._S.last ? Math.round((Date.now() - engine._S.last) / 1000) : null } : 'off', hasData: !!SNAP, ageS: LAST ? Math.round((Date.now() - LAST) / 1000) : null, alarm: watchdog.state() });
    if (p === '/api/alarm/test' && req.method === 'POST') {   // 🧪 TEST der Ausfall-Meldungen (Bot-Token oder Sitzung)
      const bt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!((API_TOKEN && eq(bt, API_TOKEN)) || valid(bt))) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, await watchdog.test());
    }
    if (p === '/api/update' && req.method === 'POST') {
      const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!API_TOKEN) return send(res, 503, { error: 'API_TOKEN fehlt auf dem Server' });
      if (!eq(tok, API_TOKEN)) return send(res, 401, { error: 'unauthorized' });
      const b = await body(req); if (!b || typeof b !== 'object' || typeof b.gen !== 'number') return send(res, 400, { error: 'Snapshot ungültig' });
      SNAP = b; LAST = Date.now(); PUSHES++; watchdog.seen(LAST); return send(res, 200, { ok: true });
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
    if (p.startsWith('/api/prefs') || p === '/api/notify/test') {
      const bt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), bot = !!API_TOKEN && eq(bt, API_TOKEN), ses = valid(bt);
      if (p === '/api/prefs' && req.method === 'GET') { if (!bot && !ses) return send(res, 401, { error: 'Anmeldung nötig' }); return send(res, 200, { prefs: PREFS || (SNAP && SNAP.prefs) || null, test: bot ? TESTREQ : undefined }); }
      if (p === '/api/prefs' && req.method === 'POST') { if (!ses) return send(res, 401, { error: 'Anmeldung nötig' }); PREFS = cleanPrefs(await body(req), Date.now()); return send(res, 200, { ok: true, prefs: PREFS }); }
      if (p === '/api/prefs/restore' && req.method === 'POST') { if (!bot) return send(res, 401, { error: 'unauthorized' }); const b = (await body(req)).prefs || {};
        if (+b.t > ((PREFS && PREFS.t) || 0)) PREFS = cleanPrefs(b, +b.t); return send(res, 200, { ok: true, prefs: PREFS }); }
      if (p === '/api/prefs/ack' && req.method === 'POST') { if (!bot) return send(res, 401, { error: 'unauthorized' }); const b = await body(req); if (TESTREQ && b.id === TESTREQ.id) TESTREQ = null; return send(res, 200, { ok: true }); }
      if (p === '/api/notify/test' && req.method === 'POST') { if (!ses) return send(res, 401, { error: 'Anmeldung nötig' });
        const pr = PREFS || (SNAP && SNAP.prefs) || { push: true, telegram: true }; TESTREQ = pr.telegram !== false ? { id: 't' + Date.now(), t: Date.now() } : null;
        const r = pr.push !== false ? await push.sendTest(API_TOKEN) : { sent: 0, skipped: 'push aus' }; return send(res, 200, { ok: true, push: r, telegram: TESTREQ ? 'angefragt' : 'aus' }); }
      return send(res, 404, { error: 'not found' });
    }
    if (p.startsWith('/api/event') || p.startsWith('/api/push/')) {   // Trade-Mitteilungen (Web-Push) – siehe push.js
      const bearer = () => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const r = await push.handle(p, req, res, { send, body, token: API_TOKEN, bearerOk: () => !!API_TOKEN && eq(bearer(), API_TOKEN), sessionOk: () => valid(bearer()) });
      if (r !== false) return;
    }
    if (p === '/api/mt5/poll' || p === '/api/mt5/sync') {   // MT5-Brücke (mt5_bridge/bridge.py) – nur mit Bot-Token
      const bt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!API_TOKEN || !eq(bt, API_TOKEN)) return send(res, 401, { error: 'unauthorized' });
      if (!engine) return send(res, 503, { error: 'Engine ist aus' });
      if (p === '/api/mt5/poll') return send(res, 200, engine.mt5Poll());
      if (req.method !== 'POST') return send(res, 405, { error: 'POST erwartet' });
      return send(res, 200, engine.mt5Sync(await body(req)));
    }
    if (p.startsWith('/api/skill')) {   // Trader-Skill: Sitzung (Handy) ODER Bot-Token (CLI)
      const bt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!((API_TOKEN && eq(bt, API_TOKEN)) || valid(bt))) return send(res, 401, { error: 'Anmeldung nötig' });
      if (!engine) return send(res, 503, { error: 'Engine ist aus (ENGINE=off)' });
      if (p === '/api/skill' && req.method === 'GET') return send(res, 200, engine.snapshot());
      if (p === '/api/skill/analyze' && req.method === 'GET') {
        const sym = String(u.searchParams.get('sym') || '').toUpperCase(), c = ANA.get(sym);
        if (c && Date.now() - c.t < 30e3) return send(res, 200, c.r);
        try { const r = await engine.analyze(sym); ANA.set(sym, { t: Date.now(), r }); if (ANA.size > 40) ANA.delete(ANA.keys().next().value); return send(res, 200, r); }
        catch (e) { return send(res, 400, { error: String(e.message).slice(0, 80) }); }
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'POST erwartet' });
      const b = await body(req);
      if (p === '/api/skill/config') return send(res, 200, { ok: true, cfg: engine.setConfig(b || {}) });
      if (p === '/api/skill/control') {
        const a = String(b.action || ''), m = { auto_on: { auto: true }, auto_off: { auto: false }, kill_on: { kill: true }, kill_off: { kill: false }, ai_on: { claude: true }, ai_off: { claude: false }, broker_mt5: { broker: 'mt5' }, broker_paper: { broker: 'paper' } };
        if (m[a]) return send(res, 200, { ok: true, cfg: engine.setConfig(m[a]) });
        if (a === 'close_all') return send(res, 200, { ok: true, closed: engine.closeAll().length });
        if (a === 'kill_all') { engine.setConfig({ kill: true }); return send(res, 200, { ok: true, closed: engine.closeAll('Not-Aus: alles geschlossen').length }); }
        if (a === 'close') { try { return send(res, 200, { ok: true, r: engine.closeOne(b.id) }); } catch (e) { return send(res, 404, { error: e.message }); } }
        if (a === 'cycle') { await engine.cycle(); return send(res, 200, { ok: true }); }
        return send(res, 400, { error: 'unbekannte Aktion' });
      }
      if (p === '/api/skill/reset') { try { engine.resetAccount(b.balance); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (p === '/api/skill/alarm') { try { return send(res, 200, { ok: true, alarm: engine.addAlarm(b) }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (p === '/api/skill/alarm/delete') { engine.delAlarm(String(b.id || '')); return send(res, 200, { ok: true }); }
      return send(res, 404, { error: 'not found' });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : decodeURIComponent(p)));
    if (PUB === __dirname) { const flat = path.basename(f); f = /^(index\.html|app\.js|globe\.js|style\.css|sw\.js|manifest\.webmanifest|[a-z0-9-]+\.png)$/.test(flat) ? path.join(PUB, flat) : path.join(PUB, 'index.html'); }
    if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /\.(html|js|css|webmanifest)$/.test(f) ? 'no-cache' : 'public, max-age=3600', ...SEC });
    fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 400, { error: 'Anfrage ungültig' }); }
});
watchdog.start({ token: API_TOKEN, push });
if (engine) {
  engine.start({ notify: ev => { if (API_TOKEN) push.sendAlert(API_TOKEN, ev).catch(() => {}); } });
  // Ausfall-Alarm auch für die Engine: solange sie Zyklen dreht, gilt der Bot als lebendig (BOX_BOT=1 = nur der externe MT5-Bot zählt)
  if (process.env.BOX_BOT !== '1') setInterval(() => { const t = engine._S.last; if (t && Date.now() - t < 3 * 60e3) watchdog.seen(t); }, 30e3).unref();
}
server.listen(PORT, () => console.log(`Cloude Trading App auf Port ${PORT} · Token ${API_TOKEN ? 'gesetzt' : 'FEHLT'} · PIN ${VIEW_PIN ? 'gesetzt' : 'FEHLT'}`));
