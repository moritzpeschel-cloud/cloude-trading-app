// TIME MACHINE · Monte-Carlo: 10.000 mögliche Zukünfte aus echten vergangenen Kerzen (Block-Bootstrap, Volatilität aufs
// aktuelle Niveau skaliert, Drift entfernt = keine Wunsch-Richtung). Pro Pfad: wird zuerst das ZIEL oder zuerst die GRENZE
// (Stop) getroffen – oder keins bis Schluss (Horizont)? Berührt eine Kerze beides, zählt konservativ die Grenze.
'use strict';
const U = require('./util');
function run({ bars, entry, stop, target, dir, horizon = 48, n = 10000, cost = 0, seed = 1, keep = 90 }) {
  const N = Math.min(bars.length - 1, 600), base = bars.slice(-N - 1), R = [], HI = [], LO = [];
  for (let j = 1; j < base.length; j++) { const p = base[j - 1].c; R.push(Math.log(base[j].c / p)); HI.push(Math.log(base[j].h / p)); LO.push(Math.log(base[j].l / p)); }
  const m = U.mean(R), sdAll = U.std(R) || 1e-9, sdNow = U.std(R.slice(-50)) || sdAll, scale = U.clamp(sdNow / sdAll, .6, 1.8);
  const risk = Math.abs(entry - stop), lT = Math.log(target), lS = Math.log(stop), l0 = Math.log(entry), M = R.length, BLOCK = 4;
  const r = U.rng(seed), ends = new Float32Array(n), steps = new Float32Array(horizon + 1), paths = new Float32Array(n * (horizon + 1));
  let hitT = 0, hitS = 0, tT = [], tS = [];
  const show = [];
  for (let k = 0; k < n; k++) {
    let x = l0, out = 0, j = 0, left = 0; paths[k * (horizon + 1)] = x;
    for (let h = 1; h <= horizon; h++) {
      if (left-- <= 0) { j = Math.floor(r() * (M - BLOCK)); left = BLOCK - 1; } else j++;
      const hi = x + (HI[j] - m) * scale, lo = x + (LO[j] - m) * scale, cl = x + (R[j] - m) * scale;
      const tHit = dir > 0 ? hi >= lT : lo <= lT, sHit = dir > 0 ? lo <= lS : hi >= lS;
      if (!out && sHit) { out = -1; hitS++; tS.push(h); x = lS; }
      else if (!out && tHit) { out = 1; hitT++; tT.push(h); x = lT; }
      else if (!out) x = cl;
      paths[k * (horizon + 1) + h] = x;
    }
    const endP = Math.exp(x); ends[k] = (dir * (endP - entry) - cost) / risk;
    if (show.length < keep && (k % Math.ceil(n / keep) === 0)) show.push({ o: out, p: Array.from(paths.subarray(k * (horizon + 1), (k + 1) * (horizon + 1)), v => +Math.exp(v).toPrecision(7)) });
  }
  // Bänder (5/25/50/75/95 %) je Schritt
  const band = { p5: [], p25: [], p50: [], p75: [], p95: [] }, col = new Float32Array(n);
  for (let h = 0; h <= horizon; h++) { for (let k = 0; k < n; k++) col[k] = paths[k * (horizon + 1) + h]; const s = Array.from(col).sort((a, b) => a - b);
    for (const [key, q] of [['p5', .05], ['p25', .25], ['p50', .5], ['p75', .75], ['p95', .95]]) band[key].push(+Math.exp(U.quantile(s, q)).toPrecision(7)); }
  const se = Array.from(ends).sort((a, b) => a - b), none = n - hitT - hitS;
  const hist = new Array(21).fill(0); for (const e of se) hist[U.clamp(Math.round((e + 2) / 4 * 20), 0, 20)]++;   // −2R..+2R… (Ränder gesammelt)
  const pT = hitT / n, pS = hitS / n, pN = none / n, ev = U.mean(Array.from(ends));
  return { n, horizon, pTarget: pT, pStop: pS, pNone: pN, evR: ev, medianR: U.quantile(se, .5), p5R: U.quantile(se, .05), p95R: U.quantile(se, .95),
    tTarget: tT.length ? U.quantile(tT.sort((a, b) => a - b), .5) : null, tStop: tS.length ? U.quantile(tS.sort((a, b) => a - b), .5) : null,
    volScale: scale, bands: band, paths: show, hist, entry, stop, target, dir };
}
module.exports = { run };
