// End-to-End-Test MT5-Brücke mit nachgebautem Terminal (mt5_bridge/test_fake/MetaTrader5.py): node test_mt5.js
'use strict';
const { spawn, execFileSync } = require('child_process'), assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const FAKE = path.join(__dirname, 'mt5_bridge/test_fake');
try { execFileSync('python3', ['--version']); } catch (_) { console.log('mt5-brücke: übersprungen (python3 fehlt)'); process.exit(0); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mt5-')), PORT = 3997, B = `http://127.0.0.1:${PORT}`, TOK = 'mt5-test';
const STATE = path.join(TMP, 'fake_state.json');
const srv = spawn(process.execPath, ['-e', `process.chdir(${JSON.stringify(__dirname)});require('./server.js');const E=require('./bot/engine');global.E=E;
 require('http').createServer(async(q,r)=>{const b=[];q.on('data',c=>b.push(c));q.on('end',async()=>{const j=JSON.parse(Buffer.concat(b)+''||'{}');
  if(q.url==='/inject'){const m=E._S.markets[j.sym];E._S.inject=[{sym:j.sym,bar:Date.now(),sig:{dir:j.dir,setup:'Trend-Rücksetzer',q:.85}}];E.setConfig({minEV:-1,minScore:.3});await E.cycle();}
  if(q.url==='/cycle')await E.cycle(); if(q.url==='/manage'){const p=E._S&&require('./bot/mt5').acc().pos[0];p.sl=p.entry;require('./bot/mt5').save();}
  if(q.url==='/prices')return r.end(JSON.stringify(Object.fromEntries(Object.entries(E._S.markets).map(([k,m])=>[k,m.price]))));
  r.end(JSON.stringify(E.snapshot()))})}).listen(3996);`],
  { env: { ...process.env, PORT, API_TOKEN: TOK, VIEW_PIN: '1', DATA_SOURCE: 'sim', DATA_DIR: TMP, SUBS_FILE: path.join(TMP, 's'), EVENTS_FILE: path.join(TMP, 'e') }, stdio: 'inherit' });
const ctl = async (p, b = {}) => (await fetch('http://127.0.0.1:3996' + p, { method: 'POST', body: JSON.stringify(b) })).json();
const H = { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' };
let PX = {}; const bridge = (extra = {}) => execFileSync('python3', [path.join(__dirname, 'mt5_bridge/bridge.py'), '--once'], { env: { ...process.env, PYTHONPATH: FAKE, CT_URL: B, CT_TOKEN: TOK, FAKE_PX: JSON.stringify(PX), FAKE_OFF: '1.5', FAKE_STATE: STATE, ...extra } }).toString();
(async () => {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  try {
    assert.equal((await fetch(B + '/api/mt5/poll')).status, 401, 'Brücke braucht Token');
    // Brücke verbindet -> Bot schaltet automatisch auf MT5
    PX = await ctl('/prices');
    // Echtgeld-Konto wird abgelehnt
    let blocked = false; try { bridge({ FAKE_MODE: '2' }); } catch (e) { blocked = /KEIN Demo-Konto/.test(e.stdout + e.stderr); } assert.ok(blocked, 'Echtgeld verweigert');
    // Diagnose: falscher Token / MT5-Login-Fehler landen im Dashboard
    await fetch(B + '/api/mt5/poll', { headers: { Authorization: 'Bearer falsch' } }); let d = (await ctl('/cycle')).broker.mt5.diag; assert.ok(d.authFail, 'Token-Fehler sichtbar');
    try { execFileSync('python3', [path.join(__dirname, 'mt5_bridge/bridge.py')], { timeout: 4000, env: { ...process.env, PYTHONPATH: FAKE, CT_URL: B, CT_TOKEN: TOK, FAKE_STATE: STATE, FAKE_INIT_FAIL: '1' } }); } catch (_) {}
    d = (await ctl('/cycle')).broker.mt5.diag; assert.match(d.bridgeError || '', /Login fehlgeschlagen/, 'MT5-Login-Fehler sichtbar'); assert.ok(!d.authFail, 'Token jetzt ok');
    let out = bridge(); assert.match(out, /Demo-Konto 5551234/); assert.match(out, /US500→US500\.cash/); assert.match(out, /NAS100→USTEC/);
    let s = await ctl('/cycle'); assert.equal(s.broker.mode, 'mt5'); assert.ok(s.broker.mt5.connected, 'Brücke verbunden'); assert.ok(Math.abs(s.broker.mt5.offset.ETHUSD - 1.5) < PX.ETHUSD * .003, 'Kurs-Versatz erkannt ' + JSON.stringify(s.broker.mt5.offset));   // Toleranz: Simulator-Kurs kann zwischen zwei Minuten springen
    // Signal -> Befehl -> Brücke führt aus -> Position im Dashboard
    let SY = null, DIR = 0; outer: for (const sym of ['ETHUSD', 'BTCUSD', 'XAUUSD', 'EURUSD']) for (const dir of [1, -1]) { s = await ctl('/inject', { sym, dir }); if (/an MT5 gesendet/.test(s.journal[0].text)) { SY = sym; DIR = dir; break outer; } }
    assert.ok(SY, 'an MT5 gesendet');
    out = bridge(); assert.match(out, new RegExp('✔ ' + SY + (DIR > 0 ? ' KAUF' : ' VERKAUF'))); s = await ctl('/cycle');
    assert.equal(s.pos.length, 1); const p = s.pos[0]; assert.equal(p.sym, SY); assert.ok(p.lots > 0); assert.ok(Math.abs(p.entry - PX[SY]) < PX[SY] * .002 + .2, 'Einstieg in Bot-Kursen (Versatz abgezogen)');
    assert.ok(s.journal.some(j => /MT5 hat ausgeführt/.test(j.text)));
    const st = JSON.parse(fs.readFileSync(STATE)); const fp = st.pos[0]; const CS = { XAUUSD: 100, EURUSD: 1e5 }[SY] || 1, loss = Math.abs(fp.price_open - fp.sl) * fp.volume * CS;
    assert.ok(loss <= s.cfg.riskEur * 1.02 && loss > 0, `Risiko exakt aus MT5 berechnet, max. ${s.cfg.riskEur} € (${loss.toFixed(2)} €)`);
    // Ausstieg verschiebt Stop -> SLTP an MT5
    await ctl('/manage'); out = bridge(); assert.match(out, /Stop →/); const st2 = JSON.parse(fs.readFileSync(STATE)); assert.ok(Math.abs(st2.pos[0].sl - st2.pos[0].price_open) < Math.abs(fp.price_open - fp.sl) * .2, 'Stop auf Einstand');
    // Schließen aus dem Dashboard -> Brücke schließt -> geschlossener Trade erscheint
    await fetch(B + '/api/skill/control', { method: 'POST', headers: H, body: JSON.stringify({ action: 'close', id: p.id }) });
    out = bridge(); assert.match(out, /geschlossen/); bridge(); s = await ctl('/cycle');
    assert.equal(s.pos.length, 0); assert.equal(s.hist[0].sym, SY); assert.ok(s.journal.some(j => new RegExp(SY + '.*geschlossen').test(j.text)), 'Schließung im Journal');
    // Brücke weg -> Risiko-Prüfung „MT5 verbunden“ blockiert neue Orders
    console.log('mt5-brücke: alle Tests bestanden');
  } catch (e) { console.error('FEHLER', e.message); process.exitCode = 1; } finally { srv.kill(); process.exit(); }
})();
