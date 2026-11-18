'use strict';
// Cloude Trading · Trader-Skill Dashboard. Anmeldung mit View-PIN -> Sitzungs-Token (180 Tage). Daten: /api/skill (Engine), /api/state (MT5-Box-Bot, optional).
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = v => v == null ? '–' : nf(v) + ' €', sg = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v)) + ' €', cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
const pct = (v, d = 1) => v == null || !isFinite(v) ? '–' : nf(v * 100, d) + ' %', sR = v => v == null ? '–' : (v >= 0 ? '+' : '−') + nf(Math.abs(v), 2) + ' R';
const tm = t => t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} Min.` : `vor ${Math.round(s / 3600)} Std.`; };
const side = d => d > 0 ? '<span class="dir b">KAUF</span>' : d < 0 ? '<span class="dir s">VERKAUF</span>' : '<span class="dir n">—</span>';
let TOK = localStorage.getItem('ct_tok'), SK = null, BOX = null, CORE = null, PAGE = localStorage.getItem('ct_page') || 'cockpit', SEL = null, ANA = null, LASTCYC = 0, TMKEY = '', OPEN = null;
const api = (p, o = {}) => fetch(p, { ...o, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOK, ...(o.headers || {}) } });
const post = async (p, b) => { const r = await api(p, { method: 'POST', body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; };
function toast(title, body, c) { const t = $('#toast'); t.className = 'toast ' + (c || ''); t.innerHTML = `<b>${esc(title)}</b>${body ? `<div>${esc(body)}</div>` : ''}`; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 6000); }

// ---------- Navigation ----------
const ICON = {
  cockpit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  markt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19h16M6 15v-4M10 15V7M14 15v-6M18 15V5"/></svg>',
  tm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/></svg>',
  trades: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/></svg>',
  mehr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>' };
const PAGES = [['cockpit', 'Cockpit'], ['markt', 'Märkte'], ['tm', 'Time Machine'], ['trades', 'Trades'], ['mehr', 'Mehr']];
function nav() {
  const b = PAGES.map(([k, n]) => `<button data-p="${k}" class="${k === PAGE ? 'on' : ''}">${ICON[k]}<span>${n}</span></button>`).join('');
  $('#tabs').innerHTML = b; $('#side').insertAdjacentHTML('beforeend', b + '<div class="sfoot" id="sfoot"></div>');
  $$('[data-p]').forEach(x => x.onclick = () => go(x.dataset.p));
}
function go(p) { PAGE = p; localStorage.setItem('ct_page', p); $$('[data-p]').forEach(x => x.classList.toggle('on', x.dataset.p === p)); $$('.page').forEach(x => x.classList.toggle('on', x.id === 'p-' + p)); scrollTo(0, 0); renderAll(true); }

// ---------- Anmeldung ----------
function showLock(msg) { $('#lock').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#pwmsg').textContent = msg || ''; if (!showLock.c) { showLock.c = Core($('#lockcore'), true); } }
$('#pwf').onsubmit = async ev => { ev.preventDefault(); const b = $('#pwb'); b.disabled = true; b.textContent = 'Prüfe …'; $('#pwmsg').textContent = '';
  try { const r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('#pw').value }) }); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Anmeldung fehlgeschlagen'); TOK = j.token; localStorage.setItem('ct_tok', TOK); $('#pw').value = ''; $('#lock').classList.add('hidden'); await refresh(); }
  catch (e) { $('#pwmsg').textContent = e.message === 'Failed to fetch' ? 'Server nicht erreichbar (startet evtl. gerade – 30 s warten).' : e.message; } finally { b.disabled = false; b.textContent = 'Entsperren'; } };

// ---------- Daten ----------
async function refresh() {
  try { const r = await api('api/skill'); if (r.status === 401) { TOK = null; localStorage.removeItem('ct_tok'); return showLock('Sitzung abgelaufen – bitte PIN erneut eingeben.'); }
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); SK = j; localStorage.setItem('ct_sk', JSON.stringify(j)); start(); renderAll(); }
  catch (e) { const c = localStorage.getItem('ct_sk'); if (c && !SK) { SK = JSON.parse(c); SK.offline = true; start(); renderAll(); } pills(e.message); }
}
async function refreshBox() { try { const r = await api('api/state'); BOX = r.ok ? await r.json() : null; } catch (_) { BOX = null; } if (PAGE === 'mehr') renderBox(); }
let started = false;
function start() { $('#app').classList.remove('hidden'); $('#lock').classList.add('hidden'); if (started) return; started = true; nav(); CORE = Core($('#core')); buildStage(); setupMehr(); pushStart(); refreshBox(); setInterval(() => { if (TOK && !document.hidden) refreshBox(); }, 30000); go(PAGE); }

// ---------- Kopfzeile ----------
function pills(err) {
  if (!SK) return; const e = SK.engine, d = SK.data, age = (Date.now() - e.last) / 1000;
  const p = (c, t) => `<span class="pill ${c}"><i></i>${esc(t)}</span>`;
  $('#pills').innerHTML = (d.source === 'sim' ? '<span class="pill sim">SIMULIERTE KURSE</span>' : p(d.source === 'live' ? 'ok' : 'wn', d.source === 'live' ? 'Live-Kurse' : 'Daten starten'))
    + (SK.cfg.broker === 'mt5' ? p(SK.broker.mt5.connected ? 'ok' : 'bad', SK.broker.mt5.connected && SK.broker.mt5.account ? 'MT5-Demo ' + SK.broker.mt5.account.login : 'MT5 getrennt') : p('', 'Paper-Konto'))
    + p(SK.cfg.kill ? 'bad' : SK.cfg.auto ? 'ok' : 'wn', SK.cfg.kill ? 'Not-Aus AN' : SK.cfg.auto ? 'Auto AN' : 'Auto AUS')
    + p(err || SK.offline ? 'bad' : age > 180 ? 'wn' : 'ok', err || SK.offline ? 'offline' : age > 180 ? 'Bot hängt?' : 'Zyklus ' + e.cycle);
}

// ---------- Bühne mit 11 Helfern ----------
const TIERS = [['kongress', 'analyst', 'budget', 'broker'], ['risiko', 'timemachine', 'alarm'], ['scanner', 'news', 'einstieg', 'ausstieg']];
const ORDER = ['scanner', 'analyst', 'news', 'kongress', 'einstieg', 'ausstieg', 'timemachine', 'risiko', 'budget', 'broker', 'alarm'];
const STW = { done: 'fertig', working: 'arbeitet', veto: 'Veto', error: 'Fehler', wait: 'wartet', idle: 'bereit' };
const meta = k => (SK.meta || []).find(m => m[0] === k) || [k, k, ''];
function buildStage() {
  $('#tiers').innerHTML = TIERS.map(r => `<div class="tier">${r.map((k, i) => `<button class="bot" id="bot-${k}" data-k="${k}">${robotSVG(k, 'st' + k)}<span class="led" id="led-${k}"></span><span class="lbl">${esc(meta(k)[1])}</span></button>`).join('')}</div>`).join('');
  $$('.bot').forEach(b => b.onclick = () => { OPEN = b.dataset.k; hbar(); sheet(OPEN); });
}
function stage() {
  const H = SK.helpers || {}, e = SK.engine; for (const k of ORDER) { const h = H[k] || {}, led = $('#led-' + k); if (!led) continue; led.className = 'led ' + (h.s || 'idle'); $('#bot-' + k).classList.toggle('veto', h.s === 'veto'); }
  $('#cyc').textContent = e.error ? 'Fehler: ' + e.error : `Zyklus ${e.cycle} · ${e.watch} Märkte · ${nf(e.ms / 1000, 1)} s`;
  const nx = Math.max(0, Math.round((e.last + e.intervalS * 1000 - Date.now()) / 1000)); $('#nextc').textContent = e.last ? `nächster in ${nx} s` : '';
  const t = SK.acc.today; $('#tick').textContent = sg(t); $('#tick').className = 'ticker ' + cls(t);
  hbar();
  if (e.cycle !== LASTCYC) { const first = !LASTCYC; LASTCYC = e.cycle; if (!first && PAGE === 'cockpit' && !document.hidden) beamRun(); }
}
function hbar() { if (!SK) return; const k = OPEN || 'scanner', m = meta(k), h = (SK.helpers || {})[k] || {};
  $('#hbar').innerHTML = `<div class="hi">${robotSVG(k, 'hb')}</div><div><b>${esc(m[1])}</b><span class="state ${h.s || ''}">${STW[h.s] || 'bereit'}</span><div class="ht">${esc(h.t || '–')}</div><div class="hj">${esc(m[2])}${h.at ? ' · ' + ago(h.at) : ''}</div></div>`;
  $$('.bot').forEach(b => b.classList.toggle('sel', b.dataset.k === OPEN)); }
function beamRun() { const ks = ORDER.filter(k => (SK.helpers[k] || {}).s !== 'idle'); ks.forEach((k, i) => setTimeout(() => beam(k), i * 260)); }
function beam(k) {
  const svg = $('#beams'), bot = $('#bot-' + k), st = $('#stage'); if (!svg || !bot || !CORE) return; const S = st.getBoundingClientRect(), b = bot.getBoundingClientRect(), c = CORE.center();
  const x1 = b.left + b.width / 2 - S.left, y1 = b.top + b.height * .45 - S.top, x2 = c.x - S.left, y2 = c.y - S.top, mx = (x1 + x2) / 2 + (x1 < x2 ? -20 : 20), my = Math.min(y1, y2) + 10;
  const ns = 'http://www.w3.org/2000/svg', p = document.createElementNS(ns, 'path'), q = document.createElementNS(ns, 'path'), dot = document.createElementNS(ns, 'circle');
  const col = (SK.helpers[k] || {}).s === 'veto' ? '#ff5a5f' : '#7fe3ff'; const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  [[p, 6, .25], [q, 1.6, .95]].forEach(([el, w, o]) => { el.setAttribute('d', d); el.setAttribute('fill', 'none'); el.setAttribute('stroke', col); el.setAttribute('stroke-width', w); el.setAttribute('stroke-opacity', o); el.setAttribute('stroke-linecap', 'round'); svg.append(el); });
  dot.setAttribute('r', 3.5); dot.setAttribute('fill', '#fff'); svg.append(dot); const L = q.getTotalLength(); [p, q].forEach(el => { el.style.strokeDasharray = L; el.style.strokeDashoffset = L; });
  bot.classList.remove('ping'); void bot.offsetWidth; bot.classList.add('ping');
  const t0 = performance.now(); (function f(t) { const u = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - u, 3); [p, q].forEach(el => el.style.strokeDashoffset = L * (1 - e)); const pt = q.getPointAtLength(L * e); dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
    if (u < 1) requestAnimationFrame(f); else { CORE.hit(); dot.remove(); const t1 = performance.now(); (function g(t) { const v = Math.min(1, (t - t1) / 500); [p, q].forEach(el => el.style.opacity = 1 - v); if (v < 1) requestAnimationFrame(g); else { p.remove(); q.remove(); } })(t1); } })(t0);
}
// Detail-Blatt eines Helfers
function sheet(k) {
  const m = meta(k), h = (SK.helpers || {})[k] || {}, f = SK.focus; let more = '';
  if (k === 'scanner') more = `<h3>Rangliste</h3>${SK.scanner.slice(0, 8).map(r => `<div class="item"><div class="a"><b>${esc(r.sym)}</b>${r.sig ? `<span class="sig ${r.sig.dir > 0 ? 'b' : 's'}">${r.sig.dir > 0 ? '▲' : '▼'} ${esc(r.sig.setup)} · ${Math.round(r.sig.q * 100)}</span>` : '<span class="sig n">kein Setup</span>'}</div></div>`).join('')}`;
  if (f && k === 'analyst') more = tfGrid(f.analyst);
  if (f && k === 'news') more = newsList(f.news);
  if (k === 'kongress') more = kongList();
  if (f && k === 'risiko') more = `<h3>${esc(f.sym)} – Prüfungen</h3>${checks(f.risiko)}`;
  if (f && k === 'timemachine') more = `<h3>${esc(f.sym)}</h3>${probs(f.tm)}`;
  if (f && k === 'ausstieg') more = `<h3>Plan ${esc(f.sym)}</h3>${ladder(f)}<p class="hint">Management: ab +1 R Grenze auf Einstand, ab +1,5 R Trailing-Stop (1,2 ATR), Zeit-Ausstieg ohne Fortschritt, Ausstieg bei Trendwechsel.</p>`;
  if (k === 'alarm') more = `<h3>Letzte Alarme</h3>${alog()}`;
  if (k === 'broker') more = `<h3>Offene Trades</h3>${posList(true)}`;
  const el = document.createElement('div'); el.className = 'sheet'; el.innerHTML = `<div class="in"><div class="grab"></div><div class="hd">${robotSVG(k, 'sh')}<div><b>${esc(m[1])}</b><span class="state ${h.s || ''}">${STW[h.s] || 'bereit'}</span><div class="hint">${esc(m[2])}</div></div></div><div class="decision mt2">${esc(h.t || '–')}</div>${more}<button class="btn ghost full">Schließen</button></div>`;
  el.onclick = e => { if (e.target === el || e.target.tagName === 'BUTTON') el.remove(); }; document.body.append(el);
}

// ---------- Kennzahlen ----------
function kpis() {
  const A = SK.acc, s = A.stats, k = (l, v, sub, c, id) => `<div class="kpi">${id ? `<canvas id="${id}"></canvas>` : ''}<div class="l">${l}</div><div class="v ${c || ''}">${v}</div><div class="s">${sub || ''}</div></div>`;
  $('#kpis').innerHTML = k(isMT ? 'Equity · MT5' : 'Equity · Paper', eur(A.equity), `Start ${eur(A.start)}`, '', 'kpi-eq') + k('Heute', sg(A.today), 'realisiert + offen', cls(A.today)) + k('Gesamt', sg(A.total), pct(A.total / A.start, 2), cls(A.total))
    + k('Trefferquote', s.winrate == null ? '–' : pct(s.winrate, 0), `${s.wins} G / ${s.losses} V`) + k('Profit-Faktor', s.pf == null ? '–' : nf(Math.min(s.pf, 99), 2), `Ø ${sR(s.avgR)}`) + k('Max. Drawdown', pct(s.maxDD, 1), `${A.open} offen`, s.maxDD > .1 ? 'dn' : '');
  const c = $('#kpi-eq'); if (c) CH.area(c, A.curve, { mini: true, base: A.start });
}

// ---------- Trade-Plan ----------
function ladder(f) { const dp = f.dp, p = f.plan, b = f.budget;
  return `<div class="ladder"><div class="cap">${f.hypo ? 'Probe-Rechnung · kein Signal' : 'Plan der Helfer'} · ${esc(f.sym)}</div>
  <div class="lrow t"><span>Ziel</span><span>${nf(p.target, dp)}</span></div><div class="lrow e"><span>Einstieg</span><span>${nf(p.entry, dp)}</span></div>
  <div class="lrow g"><span>Grenze</span><span>${nf(p.stop, dp)}</span></div><div class="lrow m"><span>Max. Verlust</span><span>${b.ok || f.hypo ? '−' + eur(b.riskEur) : '–'}</span></div></div>`; }
function checks(r) { return `<div class="checks">${(r.checks || []).map(c => `<div class="chk ${c.ok ? 'y' : 'n'}"><i>${c.ok ? '✓' : '✕'}</i><div>${esc(c.name)}<small>${esc(c.why)}</small></div></div>`).join('')}</div>`; }
function planCard() {
  const f = SK.focus, el = $('#plan'); if (!f) { el.innerHTML = '<div class="empty">Die Helfer sammeln noch Daten …</div>'; return; }
  $('#plan-sub').textContent = `${f.hypo ? 'Beobachtung' : esc(f.sig.setup)} · ${ago(f.at)}`;
  const dec = f.decision ? `<div class="decision ${/eröffnet|gelegt/.test(f.decision) ? 'ok' : 'no'}">${esc(f.decision)}</div>` : f.hypo && SK.pos.some(p => p.sym === f.sym) ? `<div class="decision ok">Offener Trade in ${esc(f.sym)} läuft – der Ausstieg-Helfer managt ihn (siehe „Offene Trades“). Hier die aktuelle Probe-Rechnung.</div>` : f.hypo ? `<div class="decision">Kein Setup im Scanner – die Helfer beobachten ${esc(f.sym)} und rechnen den Plan probehalber durch.</div>` : '';
  el.innerHTML = `<div class="plhead"><div class="sym">${esc(f.sym)} ${side(f.hypo ? 0 : f.sig.dir)}<small>${esc(f.name)} · ${nf(f.price, f.dp)} · ${esc(f.analyst.regime)}</small></div>${CH.gauge(f.grade)}</div>
  <div class="plan mt2"><div>${ladder(f)}</div><div class="facts">
   <div class="fact"><div class="l">Chance/Risiko</div><div class="v">${nf(f.plan.rr, 1)} R</div></div>
   <div class="fact"><div class="l">Größe</div><div class="v">${f.budget.lots ?? '–'}</div></div>
   <div class="fact"><div class="l">Ziel zuerst</div><div class="v up">${pct(f.tm.mc.pTarget, 1)}</div></div>
   <div class="fact"><div class="l">Grenze zuerst</div><div class="v dn">${pct(f.tm.mc.pStop, 1)}</div></div>
   <div class="fact"><div class="l">Erwartung</div><div class="v ${cls(f.tm.adj.evR)}">${sR(f.tm.adj.evR)}</div></div>
   <div class="fact"><div class="l">Analyst</div><div class="v ${cls(f.analyst.bias)}">${f.analyst.bias >= 0 ? '+' : ''}${nf(f.analyst.bias, 2)}</div></div></div></div>
  <div class="mt2">${dec}</div>${f.claude ? `<div class="decision mt2 ${f.claude.verdict === 'VETO' ? 'no' : 'ok'}">✦ KI-Prüfer: ${esc(f.claude.t)}</div>` : ''}
  <h3>Risiko-Prüfungen</h3>${checks(f.risiko)}`;
}

// ---------- Time Machine ----------
function probs(t) { const m = t.mc, a = t.adj;
  return `<div class="probs"><div class="prob t"><i></i><span class="n">Ziel zuerst</span><b>${pct(m.pTarget)}</b><div class="bar">${CH.bar(m.pTarget, '#2fd27a')}</div></div>
  <div class="prob g"><i></i><span class="n">Grenze zuerst</span><b>${pct(m.pStop)}</b><div class="bar">${CH.bar(m.pStop, '#ff5a5f')}</div></div>
  <div class="prob k"><i></i><span class="n">Keins bis Schluss</span><b>${pct(m.pNone)}</b><div class="bar">${CH.bar(m.pNone, '#8b93a8')}</div></div>
  <div class="facts"><div class="fact"><div class="l">Mit Historie</div><div class="v up">${pct(a.pTarget)}</div></div><div class="fact"><div class="l">Erwartung</div><div class="v ${cls(a.evR)}">${sR(a.evR)}</div></div><div class="fact"><div class="l">Rückblick</div><div class="v">${t.bt.n} Tr.</div></div></div></div>`; }
function tmBlock(el, id) { const f = SK.focus; if (!f) { el.innerHTML = '<div class="empty">noch keine Rechnung</div>'; return; }
  el.innerHTML = `<div class="porthole"><div class="glass"><canvas id="${id}"></canvas><div class="cnt" id="${id}-n">${nf(f.tm.mc.n, 0)} DURCHLÄUFE</div></div></div><div>${probs(f.tm)}</div>`;
  const key = f.sym + f.at, cv = $('#' + id), mc = f.tm.mc, n = mc.n;
  if (TMKEY !== key + id) { TMKEY = key + id; const t0 = performance.now(); (function a(t) { const u = Math.min(1, (t - t0) / 1800), e = 1 - Math.pow(1 - u, 2); if (!document.body.contains(cv)) return; CH.porthole(cv, mc, e); const c = $('#' + id + '-n'); if (c) c.textContent = nf(Math.round(n * e), 0) + ' DURCHLÄUFE'; if (u < 1) requestAnimationFrame(a); })(t0); }
  else CH.porthole(cv, mc, 1); }
function tmPage() {
  const f = SK.focus; if (!f) return; $('#tm-sub').textContent = `${f.sym} · ${f.hypo ? 'Probe-Rechnung' : f.sig.setup} · Horizont ${f.tm.mc.horizon} h`;
  tmBlock($('#tm-big'), 'ph-big'); CH.fan($('#fan'), f.tm.mc, f.dp); CH.histo($('#histo'), f.tm.mc.hist);
  $('#fan-note').textContent = `Volatilität auf aktuelles Niveau skaliert (×${nf(f.tm.mc.volScale, 2)}). Median-Zeit bis Ziel: ${f.tm.mc.tTarget ? f.tm.mc.tTarget + ' h' : '–'} · bis Grenze: ${f.tm.mc.tStop ? f.tm.mc.tStop + ' h' : '–'}.`;
  const bt = f.tm.bt; CH.area($('#btc'), bt.curve.map((v, i) => [i, v]), { base: 0, dp: 1 });
  $('#bts').innerHTML = `<div class="facts mt2"><div class="fact"><div class="l">Trades</div><div class="v">${bt.n}${bt.broad ? '*' : ''}</div></div><div class="fact"><div class="l">Treffer</div><div class="v">${pct(bt.winrate, 0)}</div></div><div class="fact"><div class="l">Ø je Trade</div><div class="v ${cls(bt.avgR)}">${sR(bt.avgR)}</div></div>
   <div class="fact"><div class="l">Profit-F.</div><div class="v">${bt.pf == null ? '–' : nf(Math.min(bt.pf, 99), 2)}</div></div><div class="fact"><div class="l">Summe</div><div class="v ${cls(bt.totalR)}">${sR(bt.totalR)}</div></div><div class="fact"><div class="l">Max. DD</div><div class="v dn">${nf(bt.maxDDR, 1)} R</div></div></div>
   ${bt.broad ? '<p class="hint">* zu wenige Fälle dieses Setups – Rückblick über alle Setups des Symbols.</p>' : ''}`;
  $('#tm-how').innerHTML = `<p><b>1 · Zukunft:</b> ${nf(f.tm.mc.n, 0)} Pfade aus echten vergangenen ${esc(f.sym)}-Kerzen (Block-Bootstrap, je 4 Kerzen am Stück). Die Richtung wird herausgerechnet – die Maschine wünscht sich nichts.</p>
   <p><b>2 · Treffer:</b> Pro Pfad zählt, ob zuerst das Ziel oder zuerst die Grenze berührt wird. Berührt eine Kerze beides, zählt die Grenze.</p>
   <p><b>3 · Rückblick:</b> Dieselben Regeln, die live handeln, laufen über die letzten Kerzen (inkl. Spread). Ergebnis wird mit der Basisquote gemischt.</p>
   <p><b>4 · Entscheidung:</b> Nur wenn der Erwartungswert ≥ ${nf(SK.cfg.minEV, 2)} R ist, gibt das Risiko-Team frei.</p>`;
}

// ---------- Listen ----------
function posList(compact) { const P = SK.pos, O = SK.orders;
  if (!P.length && !O.length) return '<div class="empty">Keine offenen Trades – der Bot wartet auf ein geprüftes Setup.</div>';
  return P.map(p => `<div class="item open"><div class="a"><div><b>${esc(p.sym)}</b> ${side(p.dir)} <span class="mut">${p.lots}</span></div><b class="${cls(p.upnl)}">${sg(p.upnl)}</b></div>
   <div class="b">Einstieg ${nf(p.entry, p.dp)} · Ziel ${nf(p.tp, p.dp)} · Grenze ${nf(p.sl, p.dp)}${p.be ? ' (gesichert)' : ''} · ${sR(p.R)} · ${esc(p.by)} · ${tm(p.open)}</div>
   ${compact ? '' : `<div class="chips"><button class="btn ghost sm" data-close="${p.id}">Schließen</button></div>`}</div>`).join('')
   + O.map(o => `<div class="item order"><div class="a"><div><b>${esc(o.sym)}</b> ${side(o.dir)} <span class="mut">Limit ${nf(o.limit, o.dp)}</span></div><span class="mut">bis ${tm(o.expires)}</span></div><div class="b">Ziel ${nf(o.tp, o.dp)} · Grenze ${nf(o.sl, o.dp)} · ${o.lots} · ${esc(o.by)}</div>${compact ? '' : `<div class="chips"><button class="btn ghost sm" data-close="${o.id}">Löschen</button></div>`}</div>`).join(''); }
function bindClose(root) { root.querySelectorAll('[data-close]').forEach(b => b.onclick = async () => { if (!confirm('Diesen Trade/diese Order jetzt schließen?')) return; try { await post('api/skill/control', { action: 'close', id: +b.dataset.close }); toast('Geschlossen'); refresh(); } catch (e) { toast('Fehler', e.message, 'dn'); } }); }
function journal(n) { const J = SK.journal.slice(0, n); return J.length ? J.map(j => `<div class="item ${esc(j.kind)}"><div class="a"><span>${esc(j.text)}</span></div><div class="b">${tm(j.t)}</div>${j.h && j.h.length ? `<div class="chips">${j.h.map(c => `<span class="chip">${esc(c.n)} · ${esc(c.e)}</span>`).join('')}</div>` : ''}</div>`).join('') : '<div class="empty">Noch keine Entscheidungen.</div>'; }
function newsList(n) { if (!n) return ''; if (!n.ok && !n.items.length) return `<div class="empty">${esc((SK.helpers.news || {}).t || 'keine Schlagzeilen')}</div>`;
  return n.items.map(x => { const c = x.s > .5 ? 'p' : x.s < -.5 ? 'n' : 'z'; const inner = `${esc(x.title)}<div class="m"><span class="sent ${c}">${x.s > 0 ? '+' : ''}${nf(x.s, 1)}</span><span>${tm(x.t)}</span></div>`;
    return x.link ? `<a class="newsi" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="newsi">${inner}</div>`; }).join(''); }
function kongList() { const k = SK.kongress; if (!k.ok) return `<div class="empty">${esc(k.note || 'keine Daten')}</div>`;
  return k.latest.length ? k.latest.map(r => `<div class="item"><div class="a"><b>${esc(r.tk)}</b><span class="sig ${r.side > 0 ? 'b' : 's'}">${r.side > 0 ? 'Kauf' : 'Verkauf'}</span></div><div class="b">${esc(r.who)} · ~${nf(r.amt, 0)} $ · ${new Date(r.t).toLocaleDateString('de-DE')}</div></div>`).join('') : '<div class="empty">keine Meldungen</div>'; }
function alog() { return SK.alarmLog.length ? SK.alarmLog.map(a => `<div class="item"><div class="a"><b>${esc(a.title)}</b></div><div class="b">${esc(a.body)} · ${tm(a.t)}</div></div>`).join('') : '<div class="empty">Noch keine Alarme.</div>'; }
function tfGrid(a) { const c = (n, x) => x ? `<div class="tf"><div class="l">${n}</div><div class="v ${x.score > .15 ? 'up' : x.score < -.15 ? 'dn' : ''}">${esc(x.trend)}</div><div class="s">RSI ${nf(x.rsi, 0)} · ADX ${nf(x.adx, 0)}</div></div>` : `<div class="tf"><div class="l">${n}</div><div class="v mut">–</div></div>`;
  return `<div class="tfs">${c('1 STD', a.tf.h1)}${c('4 STD', a.tf.h4)}${c('TAG', a.tf.d1)}</div>`; }

// ---------- Cockpit ----------
function cockpit() { stage(); kpis(); planCard(); tmBlock($('#tm-mini'), 'ph-mini'); const f = SK.focus; $('#tm-mini-sub').textContent = f ? `${f.sym} · Horizont ${f.tm.mc.horizon} h` : '';
  $('#pos-sub').textContent = `${SK.pos.length} offen · ${SK.orders.length} Order`; $('#pos-mini').innerHTML = posList(false); bindClose($('#pos-mini')); $('#jr-mini').innerHTML = journal(5); }

// ---------- Märkte ----------
function markt() {
  const R = SK.scanner; $('#scan-sub').textContent = `${R.length} Märkte · ${R.filter(r => r.sig).length} Setups`;
  $('#scan').innerHTML = `<tr><th>Markt</th><th class="r">Kurs</th><th class="r">24 h</th><th>Verlauf</th><th>Signal</th><th class="r">RSI</th><th class="r">ADX</th></tr>` + R.map(r => `<tr class="click" data-sym="${esc(r.sym)}">
   <td><b>${esc(r.sym)}</b><div class="mut">${esc(r.name)}${r.open ? '' : ' · <span class="closed">GESCHLOSSEN</span>'}</div></td><td class="r">${nf(r.price, r.dp)}</td><td class="r ${cls(r.chg)}">${r.chg >= 0 ? '+' : ''}${pct(r.chg, 2)}</td>
   <td>${CH.spark(r.spark, r.spark[r.spark.length - 1] >= r.spark[0])}</td><td>${r.sig ? `<span class="sig ${r.sig.dir > 0 ? 'b' : 's'}">${r.sig.dir > 0 ? '▲' : '▼'} ${esc(r.sig.setup)}</span> <span class="qbar">${CH.bar(r.sig.q, r.sig.q >= SK.cfg.minScore ? '#f5c451' : '#55607a')}</span>` : '<span class="sig n">–</span>'}</td>
   <td class="r">${nf(r.rsi, 0)}</td><td class="r">${nf(r.adx, 0)}</td></tr>`).join('');
  $$('#scan tr[data-sym]').forEach(t => t.onclick = () => { SEL = t.dataset.sym; analyze(); $('#ana').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#kong').innerHTML = kongList();
  if (!SEL) SEL = SK.focus ? SK.focus.sym : (R[0] || {}).sym;
  $('#symbar').innerHTML = R.map(r => `<button data-s="${esc(r.sym)}" class="${r.sym === SEL ? 'on' : ''}">${esc(r.sym)}${r.sig ? `<em class="${r.sig.dir > 0 ? 'up' : 'dn'}">${r.sig.dir > 0 ? '▲' : '▼'}</em>` : ''}</button>`).join('');
  $$('#symbar button').forEach(b => b.onclick = () => { SEL = b.dataset.s; analyze(); });
  if (!ANA || ANA.sym !== SEL) analyze(); else anaRender();
}
async function analyze() { $$('#symbar button').forEach(b => b.classList.toggle('on', b.dataset.s === SEL)); if (!ANA || ANA.sym !== SEL) $('#ana').innerHTML = '<div class="empty">Die 11 Helfer analysieren ' + esc(SEL) + ' …</div>';
  try { const r = await api('api/skill/analyze?sym=' + encodeURIComponent(SEL)); const j = await r.json(); if (!r.ok) throw new Error(j.error); ANA = j; anaRender(); } catch (e) { $('#ana').innerHTML = `<div class="empty">${esc(e.message)}</div>`; } }
function anaRender() { const a = ANA, el = $('#ana'); if (!a) return;
  const rows = [['scanner', a.hypo ? 'kein Setup – Beobachtung' : `${a.sig.setup} · Qualität ${Math.round(a.sig.q * 100)}`, a.hypo ? 'idle' : 'done'], ['analyst', a.analyst.t, 'done'], ['news', a.news.t, a.news.s], ['kongress', a.kongress.t, a.kongress.s], ['einstieg', a.hypo ? 'kein Signal – nichts zu timen' : a.einstieg.t, a.hypo ? 'idle' : a.einstieg.s],
    ['ausstieg', a.plan.t, 'done'], ['timemachine', a.tm.t, 'done'], ['risiko', (a.hypo ? 'Probe-Rechnung: ' : '') + a.risiko.t, a.hypo ? 'idle' : a.risiko.s], ['budget', (a.hypo ? 'Probe-Rechnung: ' : '') + a.budget.t, a.hypo ? 'idle' : a.budget.s], ['broker', a.hypo ? 'kein Auftrag (kein Signal)' : a.risiko.ok && a.budget.ok ? 'würde ausführen' : 'würde NICHT ausführen', a.risiko.ok && a.budget.ok && !a.hypo ? 'done' : 'idle'], ['alarm', 'beobachtet ' + a.sym, 'done']];
  el.innerHTML = `<div class="plhead"><div class="sym">${esc(a.sym)} ${side(a.hypo ? 0 : a.sig.dir)}<small>${esc(a.name)} · ${nf(a.price, a.dp)} · ${a.open ? 'Markt offen' : 'Markt geschlossen'} · ${a.src === 'sim' ? 'simuliert' : 'live'}</small></div>${CH.gauge(a.grade)}</div>
   <canvas class="cv h340 mt2" id="cand"></canvas>
   <div class="grid g2 mt"><div><h3>Die 11 Helfer</h3>${rows.map(([k, t, s]) => `<div class="hbar"><div class="hi">${robotSVG(k, 'an' + k)}</div><div><b>${esc(meta(k)[1])}</b><span class="state ${s || ''}">${STW[s] || 'bereit'}</span><div class="ht">${esc(t)}</div></div></div>`).join('')}</div>
   <div><h3>Trend je Zeitebene</h3>${tfGrid(a.analyst)}<h3>Plan</h3>${ladder(a)}<h3>Time Machine</h3>${probs(a.tm)}<h3>Risiko</h3>${checks(a.risiko)}<h3>Schlagzeilen</h3>${newsList(a.news)}</div></div>`;
  CH.candles($('#cand'), a.chart, a.plan, a.dp); }

// ---------- Trades ----------
function trades() { const A = SK.acc, s = A.stats; $('#eq-sub').textContent = `${eur(A.equity)} · ${sg(A.total)}`; CH.area($('#eqc'), A.curve, { base: A.start, baseLabel: 'START', dp: 0 });
  const F = (l, v, c) => `<div class="fact"><div class="l">${l}</div><div class="v ${c || ''}">${v}</div></div>`;
  $('#stats').innerHTML = F('Trades', s.n) + F('Treffer', pct(s.winrate, 0)) + F('Profit-F.', s.pf == null ? '–' : nf(Math.min(s.pf, 99), 2)) + F('Woche', sg(A.week), cls(A.week)) + F('Monat', sg(A.month), cls(A.month)) + F('Bester', sg(s.best), 'up');
  $('#pos').innerHTML = posList(false); bindClose($('#pos')); $('#ord').innerHTML = '';
  $('#hist-sub').textContent = `${SK.hist.length} letzte`;
  $('#hist').innerHTML = SK.hist.length ? SK.hist.map(h => `<div class="item ${h.pnl > 0 ? 'win' : 'loss'}"><div class="a"><div><b>${esc(h.sym)}</b> ${side(h.dir)} <span class="mut">${h.lots}</span></div><b class="${cls(h.pnl)}">${sg(h.pnl)}</b></div>
    <div class="b">${nf(h.entry, h.dp)} → ${nf(h.exit, h.dp)} · ${sR(h.R)} · ${esc(h.reason)} · ${esc(h.by || '')} · ${tm(h.close)}</div></div>`).join('') : '<div class="empty">Noch keine geschlossenen Trades.</div>';
  $('#jr').innerHTML = journal(40); }

// ---------- Mehr ----------
const CFGUI = [['riskPct', 'Risiko je Trade', '%', .05, 3, .05], ['maxDailyLossPct', 'Tages-Verlustlimit', '%', .5, 10, .5], ['maxOpen', 'Max. offene Trades', '', 1, 10, 1], ['maxPerGroup', 'Max. je Markt-Gruppe', '', 1, 6, 1],
  ['minScore', 'Min. Setup-Qualität', '', .4, .95, .01], ['minEV', 'Min. Erwartungswert', 'R', -.2, 1, .01], ['rr', 'Chance/Risiko-Ziel', 'R', 1, 5, .1], ['horizon', 'Time-Machine-Horizont', 'h', 6, 120, 6], ['mcRuns', 'Monte-Carlo-Durchläufe', '', 1000, 20000, 1000], ['maxLeverage', 'Max. Hebel', '×', 1, 30, 1]];
function setupMehr() {
  const ctl = (id, a, b) => $(id).onchange = async e => { try { await post('api/skill/control', { action: e.target.checked ? a : b }); toast('Gespeichert'); refresh(); } catch (er) { toast('Fehler', er.message, 'dn'); e.target.checked = !e.target.checked; } };
  ctl('#c-auto', 'auto_on', 'auto_off'); ctl('#c-mt5', 'broker_mt5', 'broker_paper'); ctl('#c-kill', 'kill_on', 'kill_off'); ctl('#c-ai', 'ai_on', 'ai_off');
  $('#b-cycle').onclick = async () => { $('#b-cycle').disabled = true; try { await post('api/skill/control', { action: 'cycle' }); await refresh(); toast('Zyklus ausgeführt'); } catch (e) { toast('Fehler', e.message, 'dn'); } $('#b-cycle').disabled = false; };
  $('#b-closeall').onclick = async () => { if (!confirm('ALLE offenen Paper-Trades und Orders schließen?')) return; try { const r = await post('api/skill/control', { action: 'close_all' }); toast(`${r.closed} Trade(s) geschlossen`); refresh(); } catch (e) { toast('Fehler', e.message, 'dn'); } };
  $('#b-reset').onclick = async () => { const b = +$('#r-bal').value || 10000; if (!confirm(`Paper-Konto komplett zurücksetzen auf ${nf(b, 0)} €? Verlauf wird gelöscht.`)) return; try { await post('api/skill/reset', { balance: b }); toast('Konto zurückgesetzt'); refresh(); } catch (e) { toast('Fehler', e.message, 'dn'); } };
  $('#a-add').onclick = async () => { try { await post('api/skill/alarm', { sym: $('#a-sym').value, price: +$('#a-px').value, note: $('#a-note').value }); $('#a-px').value = ''; $('#a-note').value = ''; toast('Alarm gesetzt'); refresh(); } catch (e) { toast('Fehler', e.message, 'dn'); } };
  $('#logout').onclick = () => { if (!confirm('Dieses Gerät abmelden?')) return; TOK = null; localStorage.removeItem('ct_tok'); localStorage.removeItem('ct_sk'); location.reload(); };
}
let CFGBUSY = false;
function mehr() { const c = SK.cfg, mt = (SK.broker || {}).mt5 || {}; $('#c-mt5').checked = c.broker === 'mt5';
  $('#mt5-sub').textContent = mt.blocked ? mt.blocked : mt.connected && mt.account ? `verbunden · Demo ${mt.account.login} · ${mt.account.server} · ${nf(mt.account.equity)} ${mt.account.currency}` : c.broker === 'mt5' ? 'Brücke meldet sich nicht – bridge.py auf dem MT5-Rechner starten' : 'Orders über die MT5-Brücke ausführen (nur Demo)';
  $('#b-reset').disabled = c.broker === 'mt5'; $('#c-auto').checked = c.auto; $('#c-kill').checked = c.kill; $('#c-ai').checked = c.claude; $('#c-ai').disabled = !SK.engine.ai && !c.claude;
  $('#ai-sub').textContent = SK.engine.ai ? `Claude (${SK.engine.aiModel}) prüft jede Order` : 'ANTHROPIC_API_KEY auf dem Server setzen, um ihn zu aktivieren';
  if (!CFGBUSY) { $('#cfg').innerHTML = CFGUI.map(([k, n, u, lo, hi, st]) => `<div class="row"><div class="grow"><b>${n}</b><input class="rng" type="range" min="${lo}" max="${hi}" step="${st}" value="${c[k]}" data-k="${k}"></div><span class="val" id="v-${k}">${nf(c[k], st < 1 ? (st < .1 ? 2 : 1) : 0)}${u ? ' ' + u : ''}</span></div>`).join('');
    $$('#cfg input').forEach(i => { const row = CFGUI.find(x => x[0] === i.dataset.k); i.oninput = () => { CFGBUSY = true; $('#v-' + row[0]).textContent = nf(+i.value, row[5] < 1 ? (row[5] < .1 ? 2 : 1) : 0) + (row[2] ? ' ' + row[2] : ''); };
      i.onchange = async () => { try { await post('api/skill/config', { [row[0]]: +i.value }); toast(row[1] + ' gespeichert'); } catch (e) { toast('Fehler', e.message, 'dn'); } CFGBUSY = false; refresh(); }; }); }
  const sel = $('#a-sym'); if (!sel.options.length) sel.innerHTML = SK.scanner.map(r => `<option>${esc(r.sym)}</option>`).join('');
  $('#alarms').innerHTML = SK.alarms.length ? SK.alarms.map(a => `<div class="item"><div class="a"><span><b>${esc(a.sym)}</b> ${a.dir > 0 ? 'steigt über' : 'fällt unter'} ${nf(a.price, 4).replace(/0+$/, '').replace(/,$/, '')}</span><button class="btn ghost sm" data-al="${esc(a.id)}">✕</button></div>${a.note ? `<div class="b">${esc(a.note)}</div>` : ''}</div>`).join('') : '<div class="empty">Keine aktiven Kurs-Alarme.</div>';
  $$('[data-al]').forEach(b => b.onclick = async () => { await post('api/skill/alarm/delete', { id: b.dataset.al }).catch(() => {}); refresh(); });
  $('#alog').innerHTML = alog();
  const e = SK.engine, d = SK.data; $('#sys').innerHTML = `<div class="row"><span>Kursdaten</span><b>${d.source === 'sim' ? 'Simulator' : d.source === 'live' ? 'Live (Yahoo Finance)' : d.source}</b></div>${d.error ? `<div class="hint">Letzter Datenfehler: ${esc(d.error)}</div>` : ''}
   <div class="row"><span>Zyklen</span><b>${e.cycle} · alle ${e.intervalS} s</b></div><div class="row"><span>Rechenzeit</span><b>${nf(e.ms / 1000, 2)} s</b></div><div class="row"><span>Läuft seit</span><b>${tm(e.started)}</b></div>
   <div class="row"><span>KI-Prüfer</span><b>${e.ai ? 'verfügbar' : 'nicht konfiguriert'}</b></div>`;
  prefsUI(BOX && BOX.prefs); renderBox(); loadEvents(); pushUI(); }
function renderBox() { const el = $('#box'); if (!el) return; if (!BOX || !BOX.acc) { el.innerHTML = '<div class="empty">Kein externer MT5-Bot verbunden. Sobald der Bot auf der Box Daten an <span class="mono">/api/update</span> schickt, erscheint sein Konto hier.</div>'; return; }
  const A = BOX.acc, age = Math.max(0, Date.now() / 1000 - BOX.gen); $('#box-sub').textContent = `${BOX.mode || ''} · Stand ${new Date(BOX.gen * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${age > 300 ? ' · sendet nicht!' : ''}`;
  const L = (cmd, t, k) => `<a class="btn ${k || 'ghost'} sm" href="https://t.me/moritz_goldtrading_bot?start=${cmd}" target="_blank" rel="noopener">${t}</a>`;
  el.innerHTML = `<div class="facts"><div class="fact"><div class="l">Konto</div><div class="v">${eur(A.balance)}</div></div><div class="fact"><div class="l">Equity</div><div class="v">${eur(A.equity)}</div></div><div class="fact"><div class="l">Heute</div><div class="v ${cls(A.today)}">${sg(A.today)}</div></div></div>
   <h3>Positionen</h3>${(BOX.pos || []).length ? BOX.pos.map(p => `<div class="item open"><div class="a"><span><b>${esc(p.sym)}</b> ${side(p.side === 'buy' ? 1 : -1)} ${esc(p.vol)}</span><b class="${cls(p.pnl)}">${sg(p.pnl)}</b></div><div class="b">Einstieg ${esc(p.entry)} · SL ${esc(p.sl)} · TP ${esc(p.tp)}</div></div>`).join('') : '<div class="empty">keine</div>'}
   <h3>Telegram-Steuerung</h3><div class="ctl">${L('status', '📊 Status')}${L('notaus', '🛑 Not-Aus', 'red')}${L('weiter', '✅ Weiter', 'green')}${L('auto_an', '🤖 Auto an', 'green')}${L('auto_aus', '⏸ Auto aus', 'red')}${L('notaus_alles', '⛔ Alles zu', 'red')}</div>`; }

// ---------- Mitteilungen (Web-Push) ----------
let PREFS = null, PBUSY = false, PINFO = '';
function prefsUI(p) { if (p && !PBUSY && (!PREFS || (p.t || 0) >= (PREFS.t || 0))) PREFS = p; const P = PREFS || { open: true, close: true, telegram: true, push: true };
  $$('.tg').forEach(x => { x.checked = P[x.dataset.k] !== false; x.onchange = savePrefs; }); $('#ptest').onclick = testMsg; }
async function savePrefs() { const b = {}; $$('.tg').forEach(x => b[x.dataset.k] = x.checked); PBUSY = true; $('#prefmsg').textContent = 'Speichere …';
  try { const j = await post('api/prefs', b); PREFS = j.prefs; $('#prefmsg').textContent = 'Gespeichert ✓'; } catch (e) { $('#prefmsg').textContent = 'Fehler: ' + e.message; } finally { PBUSY = false; } }
async function testMsg() { const b = $('#ptest'); b.disabled = true; try { const j = await post('api/notify/test', {}); $('#prefmsg').textContent = `Test gesendet ✓ · Push an ${j.push && j.push.sent || 0} Gerät(e)`; loadEvents(); } catch (e) { $('#prefmsg').textContent = 'Fehler: ' + e.message; } b.disabled = false; }
const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, iOS = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const u8 = s => { const p = '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); };
const keyOf = sub => { try { return btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (_) { return ''; } };
async function subscribe(ask) {
  if (!pushOK()) { PINFO = iOS && !standalone() ? 'iPhone: zuerst in Safari „Teilen → Zum Home-Bildschirm“, dann die App vom Home-Bildschirm öffnen (iOS 16.4+).' : 'Dieser Browser unterstützt keine Mitteilungen.'; return pushUI(); }
  try { if (ask) { const r = await Notification.requestPermission(); if (r !== 'granted') { PINFO = 'Mitteilungen nicht erlaubt.'; return pushUI(); } }
    if (Notification.permission !== 'granted') return pushUI();
    const k = await (await api('api/push/key')).json(); if (!k.publicKey) throw new Error('Server ohne Push-Schlüssel');
    const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription(); if (sub && keyOf(sub) && keyOf(sub) !== k.publicKey) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(k.publicKey) });
    await post('api/push/subscribe', { subscription: sub.toJSON() }); localStorage.setItem('ct_push', '1'); if (ask) PINFO = 'Mitteilungen sind aktiv ✓'; }
  catch (e) { PINFO = 'Fehler: ' + (e && e.message || e); } pushUI(); }
async function unsubscribe() { try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) { await post('api/push/unsubscribe', { subscription: sub.toJSON() }).catch(() => {}); await sub.unsubscribe(); } } catch (_) {} localStorage.setItem('ct_push', '0'); PINFO = 'Mitteilungen sind aus.'; pushUI(); }
function pushUI() { const perm = pushOK() ? Notification.permission : 'n/a', on = perm === 'granted' && localStorage.getItem('ct_push') === '1';
  $('#pstat').textContent = perm === 'n/a' ? (iOS && !standalone() ? 'nur in der Home-Bildschirm-App' : 'nicht unterstützt') : perm === 'denied' ? 'blockiert' : on ? 'aktiv' : 'aus';
  $('#pbox').innerHTML = perm === 'n/a' || perm === 'denied' ? '' : on ? '<button class="btn ghost sm" id="poff">Aus</button>' : '<button class="btn sm" id="pon">🔔 Erlauben</button>';
  const a = $('#pon'), b = $('#poff'); if (a) a.onclick = () => subscribe(true); if (b) b.onclick = unsubscribe;
  $('#pinfo').textContent = PINFO || 'Push bei jeder Eröffnung/Schließung, bei Kurs-Alarmen, Eilmeldungen und wenn das Tageslimit naht.'; }
async function loadEvents() { try { const r = await api('api/events'); if (!r.ok) return; const ev = ((await r.json()).events || []).slice(0, 12);
  $('#evs').innerHTML = ev.length ? ev.map(e => `<div class="item ${e.color === 'green' ? 'win' : e.color === 'red' ? 'loss' : ''}"><div class="a"><b>${esc(e.title)}</b></div><div class="b">${esc(e.body)} · ${new Date(e.t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div></div>`).join('') : '<div class="empty">Noch keine Mitteilungen.</div>'; } catch (_) {} }
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', m => { const d = m.data || {}; if (d.type === 'ct-event' && d.event) { toast(d.event.title, d.event.body, d.event.color === 'green' ? 'up' : d.event.color === 'red' ? 'dn' : ''); refresh(); } });
let pushInit = false; function pushStart() { if (pushInit) return; pushInit = true; if (localStorage.getItem('ct_push') !== '0') subscribe(false); }

// ---------- Rendern ----------
function renderAll(pageChange) { if (!SK) return; pills();
  try { if (PAGE === 'cockpit') cockpit(); else if (PAGE === 'markt') markt(); else if (PAGE === 'tm') tmPage(); else if (PAGE === 'trades') trades(); else if (PAGE === 'mehr') mehr(); else stage(); } catch (e) { console.error(e); }
  if (PAGE !== 'cockpit') stage();
  const e = SK.engine; $('#foot').textContent = `Trader-Skill · ${e.watch} Märkte · ${SK.data.source === 'sim' ? 'simulierte Kurse' : 'Live-Kurse'} · ${SK.cfg.broker === 'mt5' ? 'MT5-Demo' : 'Paper-Konto'} · keine Anlageberatung`;
  const sf = $('#sfoot'); if (sf) sf.textContent = `Zyklus ${e.cycle} · ${ago(e.last || Date.now())}`; }
let rT = 0; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => renderAll(), 200); });
(async () => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  if (!TOK) showLock(''); else await refresh();
  setInterval(() => { if (TOK && !document.hidden) refresh(); }, 10000); setInterval(() => { if (SK && PAGE === 'cockpit' && !document.hidden) stage(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && TOK) refresh(); }); })();
