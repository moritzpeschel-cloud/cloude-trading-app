'use strict';
// Leichte Canvas-Charts ohne Bibliotheken (HiDPI, passt sich der Breite an).
const CH = (() => {
  const C = { up: '#2fd27a', dn: '#ff5a5f', grid: 'rgba(148,163,200,.10)', tx: '#6e7891', core: '#ff7a3d', gold: '#f5c451', blue: '#4c8dff', cyan: '#38d4ff' };
  function setup(cv) { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2), w = Math.max(10, r.width), h = Math.max(10, r.height);
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h); return { x, w, h }; }
  const fmt = (v, dp) => v == null ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const rw = (x, v, dp) => { x.font = '700 10.5px ui-monospace,Menlo,monospace'; return Math.max(58, Math.ceil(x.measureText(fmt(v, dp)).width) + 16); };
  function axisY(x, w, top, bot, lo, hi, dp, right = 54) { x.font = '10.5px ui-monospace,Menlo,monospace'; x.fillStyle = C.tx; x.strokeStyle = C.grid; x.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = bot - (bot - top) * k / 4; x.beginPath(); x.moveTo(0, y + .5); x.lineTo(w - right, y + .5); x.stroke(); x.fillText(fmt(v, dp), w - right + 6, y + 3.5); } }
  function tag(x, w, y, text, col, right = 54) { x.font = '700 10.5px ui-monospace,Menlo,monospace'; const tw = x.measureText(text).width + 10; x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(w - right + 2, y - 8, Math.max(tw, right - 4), 16, 4) : x.rect(w - right + 2, y - 8, right - 4, 16); x.fill(); x.fillStyle = '#05070d'; x.fillText(text, w - right + 6, y + 3.5); }
  function hline(x, w, y, col, dash, label, right = 54) { x.save(); x.strokeStyle = col; x.setLineDash(dash || []); x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, y); x.lineTo(w - right, y); x.stroke(); x.restore(); if (label) { x.font = '700 10px system-ui'; x.fillStyle = col; x.fillText(label, 6, y - 4); } }
  // Kerzen + EMA + Bollinger + Plan-Linien
  function candles(cv, ch, plan, dp) {
    const { x, w, h } = setup(cv), bars = ch.bars, top = 10, bot = h - 18; if (!bars.length) return;
    let lo = Infinity, hi = -Infinity; bars.forEach(b => { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); });
    if (plan) [plan.stop, plan.target, plan.entry].forEach(v => { if (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    const pad = (hi - lo) * .06; lo -= pad; hi += pad; const R = rw(x, hi, dp); const Y = v => bot - (v - lo) / (hi - lo) * (bot - top), n = bars.length, cw = (w - R) / n, X = i => i * cw + cw / 2;
    axisY(x, w, top, bot, lo, hi, dp, R);
    // Bollinger-Band
    x.beginPath(); let st = false; ch.bbU.forEach((v, i) => { if (v == null) return; st ? x.lineTo(X(i), Y(v)) : (x.moveTo(X(i), Y(v)), st = true); });
    for (let i = n - 1; i >= 0; i--) if (ch.bbL[i] != null) x.lineTo(X(i), Y(ch.bbL[i])); x.closePath(); x.fillStyle = 'rgba(76,141,255,.06)'; x.fill();
    if (plan) { const xs = X(n - 1) - cw * 6, xe = w - R; x.fillStyle = 'rgba(47,210,122,.10)'; x.fillRect(xs, Math.min(Y(plan.target), Y(plan.entry)), xe - xs, Math.abs(Y(plan.target) - Y(plan.entry)));
      x.fillStyle = 'rgba(255,90,95,.10)'; x.fillRect(xs, Math.min(Y(plan.stop), Y(plan.entry)), xe - xs, Math.abs(Y(plan.stop) - Y(plan.entry))); }
    bars.forEach((b, i) => { const up = b[4] >= b[1], col = up ? C.up : C.dn; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1;
      x.beginPath(); x.moveTo(X(i) + .5, Y(b[2])); x.lineTo(X(i) + .5, Y(b[3])); x.stroke(); const y1 = Y(Math.max(b[1], b[4])), y2 = Y(Math.min(b[1], b[4]));
      x.globalAlpha = up ? .9 : .85; x.fillRect(X(i) - Math.max(1, cw * .32), y1, Math.max(2, cw * .64), Math.max(1, y2 - y1)); x.globalAlpha = 1; });
    const line = (arr, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); let s = false; arr.forEach((v, i) => { if (v == null) return; s ? x.lineTo(X(i), Y(v)) : (x.moveTo(X(i), Y(v)), s = true); }); x.stroke(); };
    line(ch.e20, C.gold, 1.4); line(ch.e50, C.violet || '#9b7bff', 1.4);
    if (plan) { hline(x, w, Y(plan.target), C.up, [5, 4], 'ZIEL', R); hline(x, w, Y(plan.entry), '#e9eefb', [2, 3], 'EINSTIEG', R); hline(x, w, Y(plan.stop), C.dn, [5, 4], 'GRENZE', R);
      tag(x, w, Y(plan.target), fmt(plan.target, dp), C.up, R); tag(x, w, Y(plan.stop), fmt(plan.stop, dp), C.dn, R); }
    const lp = bars[n - 1][4]; tag(x, w, Y(lp), fmt(lp, dp), C.cyan, R);
    x.font = '10px system-ui'; x.fillStyle = C.tx; [0, Math.floor(n / 2), n - 1].forEach(i => { const d = new Date(bars[i][0]); x.fillText(d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit' }), Math.max(0, Math.min(X(i) - 30, w - R - 80)), h - 4); });
    x.fillStyle = C.gold; x.fillText('EMA 20', 6, 12); x.fillStyle = '#9b7bff'; x.fillText('EMA 50', 52, 12);
  }
  // Monte-Carlo-Fächer: Bänder + Beispielpfade (grün = Ziel zuerst, rot = Grenze zuerst, grau = keins), animiert
  function fan(cv, mc, dp, prog = 1) {
    const { x, w, h } = setup(cv), top = 12, bot = h - 18, H = mc.horizon, B = mc.bands;
    let lo = Math.min(mc.stop, mc.target, ...B.p5), hi = Math.max(mc.stop, mc.target, ...B.p95); const pad = (hi - lo) * .05; lo -= pad; hi += pad; const R = rw(x, hi, dp);
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top), X = i => i / H * (w - R - 8) + 4;
    axisY(x, w, top, bot, lo, hi, dp, R);
    const band = (a, b, col) => { x.beginPath(); a.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); for (let i = b.length - 1; i >= 0; i--) x.lineTo(X(i), Y(b[i])); x.closePath(); x.fillStyle = col; x.fill(); };
    band(B.p95, B.p5, 'rgba(76,141,255,.08)'); band(B.p75, B.p25, 'rgba(76,141,255,.13)');
    const lim = Math.max(1, Math.round(H * prog));
    mc.paths.forEach(p => { x.strokeStyle = p.o > 0 ? 'rgba(47,210,122,.55)' : p.o < 0 ? 'rgba(255,90,95,.5)' : 'rgba(170,180,200,.35)'; x.lineWidth = 1; x.beginPath();
      for (let i = 0; i <= lim && i < p.p.length; i++) i ? x.lineTo(X(i), Y(p.p[i])) : x.moveTo(X(i), Y(p.p[i])); x.stroke(); });
    x.strokeStyle = C.gold; x.lineWidth = 2; x.beginPath(); B.p50.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); x.stroke();
    hline(x, w, Y(mc.target), C.up, [5, 4], 'ZIEL', R); hline(x, w, Y(mc.stop), C.dn, [5, 4], 'GRENZE', R); hline(x, w, Y(mc.entry), '#e9eefb', [2, 3], 'EINSTIEG', R);
    tag(x, w, Y(mc.target), fmt(mc.target, dp), C.up, R); tag(x, w, Y(mc.stop), fmt(mc.stop, dp), C.dn, R);
    x.font = '10px system-ui'; x.fillStyle = C.tx; x.fillText('jetzt', 4, h - 4); x.fillText('+' + H + ' h', X(H) - 30, h - 4);
  }
  // Bullauge (rund, wie die Time-Machine-Optik): Fächer von links nach rechts
  function porthole(cv, mc, prog = 1) {
    const { x, w, h } = setup(cv), cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2; x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
    const H = mc.horizon, lo = Math.min(mc.stop, mc.target, ...mc.bands.p5), hi = Math.max(mc.stop, mc.target, ...mc.bands.p95), pad = (hi - lo) * .12;
    const Y = v => cy + r * .62 - (v - lo + pad) / (hi - lo + 2 * pad) * r * 1.24, X = i => cx - r * .78 + i / H * r * 1.56, lim = Math.max(1, Math.round(H * prog));
    x.globalCompositeOperation = 'lighter';
    mc.paths.forEach(p => { x.strokeStyle = p.o > 0 ? 'rgba(47,210,122,.33)' : p.o < 0 ? 'rgba(255,90,95,.30)' : 'rgba(150,170,200,.22)'; x.lineWidth = 1.1; x.beginPath();
      for (let i = 0; i <= lim && i < p.p.length; i++) i ? x.lineTo(X(i), Y(p.p[i])) : x.moveTo(X(i), Y(p.p[i])); x.stroke(); });
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 12; x.beginPath(); x.arc(X(0), Y(mc.entry), 3.5, 0, 7); x.fill(); x.shadowBlur = 0;
    x.setLineDash([3, 4]); x.lineWidth = 1; x.strokeStyle = 'rgba(47,210,122,.6)'; x.beginPath(); x.moveTo(X(0), Y(mc.target)); x.lineTo(X(H), Y(mc.target)); x.stroke();
    x.strokeStyle = 'rgba(255,90,95,.6)'; x.beginPath(); x.moveTo(X(0), Y(mc.stop)); x.lineTo(X(H), Y(mc.stop)); x.stroke(); x.restore();
  }
  function histo(cv, hist) {
    const { x, w, h } = setup(cv), n = hist.length, mx = Math.max(...hist, 1), bw = (w - 10) / n, bot = h - 20;
    hist.forEach((v, i) => { const r = -2 + i * 4 / (n - 1), bh = v / mx * (bot - 8); const g = x.createLinearGradient(0, bot - bh, 0, bot);
      const col = r > .05 ? [47, 210, 122] : r < -.05 ? [255, 90, 95] : [150, 160, 180]; g.addColorStop(0, `rgba(${col},.95)`); g.addColorStop(1, `rgba(${col},.25)`); x.fillStyle = g;
      x.beginPath(); x.roundRect ? x.roundRect(5 + i * bw + 1.5, bot - bh, bw - 3, bh, 3) : x.rect(5 + i * bw + 1.5, bot - bh, bw - 3, bh); x.fill(); });
    x.fillStyle = C.tx; x.font = '10px system-ui'; ['≤−2R', '−1R', '0', '+1R', '≥+2R'].forEach((t, k) => x.fillText(t, 5 + k * (w - 10) / 4 - (k === 4 ? 26 : k ? 8 : 0), h - 5));
  }
  // Linie mit Verlaufsfläche (Kontoverlauf, Backtest-Kurve, KPI-Mini)
  function area(cv, pts, opt = {}) {
    const { x, w, h } = setup(cv); if (pts.length < 2) { x.fillStyle = C.tx; x.font = '12px system-ui'; if (!opt.mini) x.fillText('noch zu wenig Daten', 10, h / 2); return; }
    const R = opt.mini ? 0 : rw(x, Math.max(...pts.map(p => Math.abs(p[1]))), opt.dp ?? 0), top = opt.mini ? 4 : 10, bot = h - (opt.mini ? 2 : 18), ys = pts.map(p => p[1]); let lo = Math.min(...ys, opt.base ?? Infinity), hi = Math.max(...ys, opt.base ?? -Infinity);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; } const pad = (hi - lo) * .08; lo -= pad; hi += pad;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0], X = t => (t - t0) / ((t1 - t0) || 1) * (w - R - 2) + 1, Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    if (!opt.mini) axisY(x, w, top, bot, lo, hi, opt.dp ?? 0, R);
    const good = ys[ys.length - 1] >= (opt.base ?? ys[0]), col = opt.col || (good ? C.up : C.dn);
    const g = x.createLinearGradient(0, top, 0, bot); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
    x.beginPath(); pts.forEach(([t, v], i) => i ? x.lineTo(X(t), Y(v)) : x.moveTo(X(t), Y(v))); x.lineTo(X(t1), bot); x.lineTo(X(t0), bot); x.closePath(); x.fillStyle = g; x.fill();
    x.beginPath(); pts.forEach(([t, v], i) => i ? x.lineTo(X(t), Y(v)) : x.moveTo(X(t), Y(v))); x.strokeStyle = col; x.lineWidth = opt.mini ? 1.5 : 2; x.stroke();
    if (opt.base != null && !opt.mini) hline(x, w, Y(opt.base), 'rgba(245,196,81,.6)', [4, 4], opt.baseLabel || '', R);
  }
  // Rundes Messgerät (Gesamtnote) als SVG
  function gauge(v) { const p = v == null ? 0 : Math.max(0, Math.min(100, v)) / 100, a0 = Math.PI * .75, a1 = a0 + Math.PI * 1.5 * p, R = 34, c = 42;
    const pt = a => [c + R * Math.cos(a), c + R * Math.sin(a)], [x0, y0] = pt(a0), [x1, y1] = pt(a1), [xe, ye] = pt(a0 + Math.PI * 1.5), big = (a1 - a0) > Math.PI ? 1 : 0;
    const col = v == null ? '#55607a' : v >= 70 ? '#2fd27a' : v >= 50 ? '#f5c451' : '#ff5a5f';
    return `<svg class="gauge" viewBox="0 0 84 84"><path d="M${x0} ${y0} A${R} ${R} 0 1 1 ${xe} ${ye}" stroke="rgba(255,255,255,.08)" stroke-width="7" fill="none" stroke-linecap="round"/>${p > 0 ? `<path d="M${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1}" stroke="${col}" stroke-width="7" fill="none" stroke-linecap="round"/>` : ''}<text x="42" y="45" text-anchor="middle" fill="#e9eefb" font-size="21" font-weight="800" font-family="system-ui">${v == null ? '–' : v}</text><text x="42" y="60" text-anchor="middle" fill="#6e7891" font-size="8.5" font-weight="700" letter-spacing="1.5" font-family="system-ui">NOTE</text></svg>`; }
  function spark(vals, up) { if (!vals || vals.length < 2) return ''; const lo = Math.min(...vals), hi = Math.max(...vals), d = hi - lo || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 84).toFixed(1)},${(24 - (v - lo) / d * 22).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 84 26"><polyline points="${pts}" fill="none" stroke="${up ? '#2fd27a' : '#ff5a5f'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`; }
  const bar = (p, col) => `<svg viewBox="0 0 100 5" preserveAspectRatio="none"><rect width="${Math.max(0, Math.min(100, p * 100)).toFixed(1)}" height="5" rx="2.5" fill="${col}"/></svg>`;
  return { candles, fan, porthole, histo, area, gauge, spark, bar, C };
})();
// Der leuchtende Kern (Trader-Skill) – rotierende Strahlen, Orbits, Puls bei Helfer-Meldungen
function Core(cv, small) {
  const x = cv.getContext('2d'); let t0 = performance.now(), pulse = 0, W = 0, H = 0, d = 1; const parts = Array.from({ length: small ? 0 : 26 }, (_, i) => ({ a: Math.random() * 7, r: .55 + Math.random() * .5, s: .2 + Math.random() * .6, z: Math.random() }));
  const size = () => { const r = cv.getBoundingClientRect(); d = Math.min(devicePixelRatio || 1, 2); W = r.width || cv.width; H = r.height || cv.height; cv.width = W * d; cv.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener('resize', size);
  function frame(now) { if (!document.body.contains(cv)) return; const t = (now - t0) / 1000, cx = W / 2, cy = small ? H / 2 : H * .46, R = Math.min(W, H) * (small ? .26 : .23); pulse *= .95;
    x.clearRect(0, 0, W, H);
    const g = x.createRadialGradient(cx, cy, R * .2, cx, cy, R * (2.3 + pulse)); g.addColorStop(0, `rgba(255,140,70,${.55 + pulse * .3})`); g.addColorStop(.45, 'rgba(255,110,50,.16)'); g.addColorStop(1, 'rgba(255,110,50,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (!small) { x.save(); x.translate(cx, cy); for (let k = 0; k < 3; k++) { x.save(); x.rotate(t * (k % 2 ? -.25 : .18) + k); x.scale(1, .32 + k * .08); x.beginPath(); x.arc(0, 0, R * (1.65 + k * .32), 0, 7);
      x.strokeStyle = k === 1 ? 'rgba(245,196,81,.35)' : 'rgba(255,190,140,.22)'; x.lineWidth = 1.2; x.stroke(); const a = t * (1.2 + k * .4); x.fillStyle = '#ffd9b0'; x.shadowColor = '#ffb36b'; x.shadowBlur = 10;
      x.beginPath(); x.arc(Math.cos(a) * R * (1.65 + k * .32), Math.sin(a) * R * (1.65 + k * .32), 2.4, 0, 7); x.fill(); x.restore(); } x.restore();
      for (const p of parts) { p.a += .004 * p.s; const rr = R * (1.4 + p.r * 1.3); x.fillStyle = `rgba(255,200,150,${.15 + p.z * .35})`; x.beginPath(); x.arc(cx + Math.cos(p.a) * rr, cy + Math.sin(p.a) * rr * .45, .8 + p.z * 1.2, 0, 7); x.fill(); } }
    // Kugel
    x.save(); x.shadowColor = '#ff7a3d'; x.shadowBlur = 40 + pulse * 40; const s = x.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
    s.addColorStop(0, '#3a2a24'); s.addColorStop(.7, '#1a1312'); s.addColorStop(1, '#0c0909'); x.fillStyle = s; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill(); x.restore();
    x.strokeStyle = `rgba(255,170,110,${.5 + pulse * .5})`; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
    // Strahlenkranz
    x.save(); x.translate(cx, cy); x.rotate(t * .25); const n = 12;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, len = R * (.78 + .08 * Math.sin(t * 2.2 + i * 1.7) + pulse * .12), wd = R * .1;
      x.save(); x.rotate(a); const lg = x.createLinearGradient(0, 0, len, 0); lg.addColorStop(0, '#fff1e2'); lg.addColorStop(.35, '#ffa25c'); lg.addColorStop(1, '#ff6a2a');
      x.fillStyle = lg; x.beginPath(); x.moveTo(R * .1, -wd * .5); x.quadraticCurveTo(len * .6, -wd * .9, len, 0); x.quadraticCurveTo(len * .6, wd * .9, R * .1, wd * .5); x.closePath(); x.fill(); x.restore(); }
    x.restore(); const cg = x.createRadialGradient(cx, cy, 0, cx, cy, R * .3); cg.addColorStop(0, '#fff'); cg.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, R * .3, 0, 7); x.fill();
    requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  return { hit() { pulse = 1; }, center() { const r = cv.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (small ? r.height / 2 : r.height * .46) }; } };
}
