'use strict';
// Die 11 Helfer als eigene SVG-Roboter (Farbe + Werkzeug je Aufgabe). Reines SVG, keine Inline-Styles (CSP).
const ROBO = {
  kongress:   { c1: '#f1f4fa', c2: '#9aa6bd', ac: '#f5c451', prop: 'dome' },
  analyst:    { c1: '#a98bff', c2: '#5b3fc4', ac: '#ffb36b', prop: 'chart' },
  budget:     { c1: '#ffab6b', c2: '#b45518', ac: '#ffe0b8', prop: 'calc' },
  broker:     { c1: '#5f8dff', c2: '#2140a8', ac: '#f5c451', prop: 'case' },
  risiko:     { c1: '#7aa4ff', c2: '#2c4fb8', ac: '#2fd27a', prop: 'shield' },
  timemachine:{ c1: '#f8d784', c2: '#a8771f', ac: '#fff3c4', prop: 'hourglass' },
  alarm:      { c1: '#ff9a5c', c2: '#b8481a', ac: '#f5c451', prop: 'bell' },
  scanner:    { c1: '#62a0ff', c2: '#1f4fb5', ac: '#38d4ff', prop: 'radar' },
  news:       { c1: '#f3f5fa', c2: '#a6b0c4', ac: '#ff7a3d', prop: 'paper' },
  einstieg:   { c1: '#4fe08f', c2: '#14874a', ac: '#f5c451', prop: 'watch' },
  ausstieg:   { c1: '#3fd6a5', c2: '#0f7a5a', ac: '#2fd27a', prop: 'exit' },
};
const PROPS = {
  dome: '<g transform="translate(70 58)"><rect x="2" y="20" width="22" height="4" rx="1" fill="#e9edf5"/><rect x="4" y="12" width="18" height="8" fill="#d5dbe7"/><path d="M5 12 Q13 -2 21 12Z" fill="#f5f7fb"/><rect x="12.2" y="0" width="1.6" height="4" fill="#f5c451"/><g fill="#9aa6bd"><rect x="7" y="13" width="1.6" height="6"/><rect x="11" y="13" width="1.6" height="6"/><rect x="15" y="13" width="1.6" height="6"/><rect x="19" y="13" width="1.6" height="6"/></g></g>',
  chart: '<g transform="translate(68 52)"><rect width="28" height="24" rx="3" fill="#f3f5fb"/><rect x="2" y="2" width="24" height="20" rx="2" fill="#fff"/><rect x="5" y="14" width="3.5" height="6" fill="#ff7a3d"/><rect x="10.5" y="10" width="3.5" height="10" fill="#4c8dff"/><rect x="16" y="6" width="3.5" height="14" fill="#2fd27a"/><path d="M4 12 L11 8 L16 9 L24 4" stroke="#e2434a" stroke-width="1.4" fill="none"/></g>',
  calc: '<g transform="translate(70 60)"><rect width="20" height="26" rx="3" fill="#2b2f3a"/><rect x="3" y="3" width="14" height="6" rx="1" fill="#9fe8b9"/><g fill="#f0f2f7"><rect x="3" y="11" width="4" height="3" rx=".8"/><rect x="8" y="11" width="4" height="3" rx=".8"/><rect x="13" y="11" width="4" height="3" rx=".8"/><rect x="3" y="16" width="4" height="3" rx=".8"/><rect x="8" y="16" width="4" height="3" rx=".8"/><rect x="3" y="21" width="4" height="3" rx=".8"/><rect x="8" y="21" width="4" height="3" rx=".8"/></g><rect x="13" y="16" width="4" height="8" rx=".8" fill="#ff7a3d"/></g>',
  case: '<g transform="translate(70 66)"><rect x="7" y="0" width="10" height="5" rx="2" fill="none" stroke="#c8963a" stroke-width="2"/><rect y="4" width="24" height="17" rx="3" fill="#7a4a1d"/><rect y="10" width="24" height="2.2" fill="#5c3613"/><rect x="10" y="9" width="4" height="5" rx="1" fill="#f5c451"/></g>',
  shield: '<g transform="translate(68 56)"><path d="M13 0 L26 5 V14 C26 22 20 27 13 30 C6 27 0 22 0 14 V5Z" fill="#dfe7f7"/><path d="M13 3 L23 7 V14 C23 20 18.5 24 13 26.6 C7.5 24 3 20 3 14 V7Z" fill="#2c4fb8"/><path d="M7.5 14.5 L11.5 18.5 L19 10.5" stroke="#2fd27a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>',
  hourglass: '<g transform="translate(72 58)"><rect width="18" height="3" rx="1.2" fill="#c8963a"/><rect y="25" width="18" height="3" rx="1.2" fill="#c8963a"/><path d="M2 3 H16 C16 9 10 12 9 14 C10 16 16 19 16 25 H2 C2 19 8 16 9 14 C8 12 2 9 2 3Z" fill="#e8f3ff" opacity=".9"/><path d="M5 6 H13 C12 9 10 11 9 12 C8 11 6 9 5 6Z" fill="#f5c451"/><path d="M4.5 24 C6 20 8 18.5 9 18 C10 18.5 12 20 13.5 24Z" fill="#f5c451"/></g>',
  bell: '<g transform="translate(70 58)"><path d="M12 2 C5 2 4 9 4 14 C4 18 2 20 0 22 H24 C22 20 20 18 20 14 C20 9 19 2 12 2Z" fill="#f5c451"/><circle cx="12" cy="25" r="3" fill="#c8963a"/><rect x="10.5" y="0" width="3" height="3" rx="1.5" fill="#c8963a"/><path d="M-3 8 Q-6 13 -3 18 M27 8 Q30 13 27 18" stroke="#f5c451" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></g>',
  radar: '<g transform="translate(69 56)"><circle cx="13" cy="13" r="13" fill="#0b1a33" stroke="#38d4ff" stroke-width="1.6"/><circle cx="13" cy="13" r="8" fill="none" stroke="#38d4ff" stroke-width=".8" opacity=".6"/><circle cx="13" cy="13" r="3.5" fill="none" stroke="#38d4ff" stroke-width=".8" opacity=".6"/><path d="M13 13 L13 0 A13 13 0 0 1 24 7Z" fill="#38d4ff" opacity=".45"/><circle cx="19" cy="8" r="1.6" fill="#7ff0ff"/></g>',
  paper: '<g transform="translate(69 56)"><rect width="24" height="30" rx="2" fill="#fbfcff" transform="rotate(8 12 15)"/><g transform="rotate(8 12 15)"><rect x="3" y="3" width="18" height="4" fill="#2b3245"/><g fill="#a3acc0"><rect x="3" y="10" width="18" height="1.6"/><rect x="3" y="14" width="10" height="1.6"/><rect x="3" y="18" width="18" height="1.6"/><rect x="3" y="22" width="14" height="1.6"/></g><rect x="14" y="10" width="7" height="7" fill="#ff7a3d"/></g></g>',
  watch: '<g transform="translate(70 58)"><rect x="10" y="0" width="5" height="3" rx="1" fill="#c8963a"/><circle cx="12.5" cy="15" r="12" fill="#f5c451"/><circle cx="12.5" cy="15" r="9.5" fill="#fffaf0"/><path d="M12.5 15 L12.5 8.5 M12.5 15 L17 17" stroke="#2b2f3a" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.5" cy="15" r="1.3" fill="#e2434a"/></g>',
  exit: '<g transform="translate(68 62)"><rect width="28" height="18" rx="3" fill="#0d3b2c" stroke="#2fd27a" stroke-width="1.6"/><path d="M6 9 H19 M15 4.5 L19.5 9 L15 13.5" stroke="#2fd27a" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="21" y="3" width="3" height="12" rx="1" fill="#2fd27a"/></g>',
};
function robotSVG(k, uid) {
  const r = ROBO[k] || ROBO.scanner, g = 'g' + uid, v = 'v' + uid;
  const orbit = k === 'timemachine' ? `<ellipse cx="50" cy="38" rx="34" ry="9" fill="none" stroke="#f5c451" stroke-width="1.3" opacity=".75" transform="rotate(-14 50 38)"/><ellipse cx="50" cy="38" rx="30" ry="7" fill="none" stroke="#f5c451" stroke-width=".8" opacity=".5" transform="rotate(18 50 38)"/>` : '';
  const hat = k === 'kongress' ? '<path d="M30 26 Q50 4 70 26Z" fill="#ffffff" opacity=".95"/><rect x="28" y="24" width="44" height="4" rx="2" fill="#d9dfeb"/>' : k === 'news' ? '<path d="M31 24 Q50 10 69 24Z" fill="#ff7a3d"/>' : '';
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r.c1}"/><stop offset="1" stop-color="${r.c2}"/></linearGradient>
<radialGradient id="${v}"><stop offset="0" stop-color="#ffd2a8"/><stop offset=".55" stop-color="#ff7a3d"/><stop offset="1" stop-color="#7a2a0c"/></radialGradient></defs>
<ellipse cx="50" cy="114" rx="26" ry="4" fill="#000" opacity=".45"/>
<line x1="50" y1="6" x2="50" y2="17" stroke="${r.c2}" stroke-width="2.4"/><circle cx="50" cy="6" r="3.6" fill="${r.ac}"/>
${orbit}
<rect x="22" y="31" width="7" height="13" rx="3" fill="${r.c2}"/><rect x="71" y="31" width="7" height="13" rx="3" fill="${r.c2}"/>
<rect x="27" y="16" width="46" height="38" rx="15" fill="url(#${g})"/>
${hat}
<rect x="32" y="27" width="36" height="16" rx="8" fill="#0a1222"/>
<rect x="37" y="31.5" width="9" height="6" rx="3" fill="#7fe3ff"/><rect x="54" y="31.5" width="9" height="6" rx="3" fill="#7fe3ff"/>
<rect x="44" y="53" width="12" height="5" fill="${r.c2}"/>
<rect x="18" y="62" width="9" height="24" rx="4.5" fill="url(#${g})"/><rect x="73" y="62" width="9" height="24" rx="4.5" fill="url(#${g})"/>
<rect x="29" y="57" width="42" height="36" rx="11" fill="url(#${g})"/>
<rect x="33" y="62" width="34" height="2.4" rx="1.2" fill="#fff" opacity=".25"/>
<circle cx="50" cy="75" r="9.5" fill="#1a1d27"/><circle cx="50" cy="75" r="7" fill="url(#${v})"/>
<g stroke="#fff3e6" stroke-width="1.3" stroke-linecap="round" opacity=".95"><path d="M50 70.5V79.5M45.5 75H54.5M46.8 71.8L53.2 78.2M53.2 71.8L46.8 78.2"/></g>
<rect x="34" y="92" width="11" height="17" rx="4" fill="${r.c2}"/><rect x="55" y="92" width="11" height="17" rx="4" fill="${r.c2}"/>
<rect x="31" y="105" width="16" height="7" rx="3.5" fill="#1d2230"/><rect x="53" y="105" width="16" height="7" rx="3.5" fill="#1d2230"/>
${PROPS[r.prop] || ''}</svg>`;
}
