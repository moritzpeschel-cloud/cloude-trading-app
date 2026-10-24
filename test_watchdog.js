// Selbsttest Ausfall-Alarm: node test_watchdog.js (ohne Netz: Telegram nicht konfiguriert, Push gemockt)
process.env.ALARM_FILE = require('path').join(require('os').tmpdir(), 'ct-alarm-test-' + process.pid + '.json');
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
const assert = require('assert'), W = require('./watchdog'); const SENT = [];
const push = { sendAlert: async (tok, ev) => { SENT.push(ev); return { sent: 1 }; } };
(async () => {
  W.start({ token: 'x', push }); W.stop();
  const t0 = Date.now(); W._reset({ boot: t0 });
  assert.equal(await W.check(t0 + 60e3), null, 'kein Alarm nach 1 Min.');
  await W.seen(t0 + 60e3); assert.equal(await W.check(t0 + 60e3 + 4.9 * 60e3), null, 'kein Alarm < 5 Min.');
  assert.equal(await W.check(t0 + 60e3 + 5.1 * 60e3), 'offline', 'Alarm > 5 Min.');
  assert.equal(SENT.length, 1); assert.match(SENT[0].title, /^⚠️ Bot offline seit \d\d:\d\d$/); assert.equal(SENT[0].color, 'red');
  for (let i = 1; i < 20; i++) assert.equal(await W.check(t0 + (6 + i) * 60e3), null, 'kein Spam');
  assert.equal(SENT.length, 1);
  assert.equal(await W.seen(t0 + 30 * 60e3), 'online'); assert.equal(SENT[1].title, '✅ Bot wieder online'); assert.equal(SENT.length, 2);
  assert.equal(await W.seen(t0 + 30.5 * 60e3), null); assert.equal(SENT.length, 2);
  W._reset({ boot: t0 }); assert.equal(await W.check(t0 + 6 * 60e3), 'offline', 'Neustart ohne Daten -> Alarm'); assert.match(SENT[2].body, /Neustart/);
  const r = await W.test(); assert.ok(SENT[3].title.startsWith('🧪 TEST · ⚠️ Bot offline seit')); assert.ok(SENT[4].title.startsWith('🧪 TEST · ✅')); assert.equal(r.offline.telegram, 'nicht konfiguriert');
  assert.equal(W.state().telegram, 'nicht konfiguriert');
  console.log('watchdog ok'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
