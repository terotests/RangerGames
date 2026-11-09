// Kielisaari: the game's pictures as SVG, drawn here by hand (our own art, no
// outside images). tools/kielisaari/render.js turns them into the PNGs in
// games/kielisaari/img (PNGs are cheap to draw every frame on the old phone).
// Scenes are 360 x 560 (rendered at 2x); things and characters face the viewer.

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const eye = (x, y, r = 5) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#1d1d24"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.38}" r="${r * 0.38}" fill="#fff"/>`;
const smile = (x, y, w = 10, c = "#1d1d24") => `<path d="M${x - w} ${y} Q ${x} ${y + w * 0.9} ${x + w} ${y}" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const blush = (x, y, r = 7) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.55}" fill="#ff8fa3" opacity="0.5"/>`;
const shadow = (x, y, rx) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.16}" fill="#000" opacity="0.13"/>`;
const OUT = `stroke="#3b2a1e" stroke-width="3" stroke-linejoin="round"`;

// ---- things (120 x 120) ----------------------------------------------------------

function shell() {
  return svg(120, 120, `${shadow(60, 104, 40)}
  <path d="M60 18 C 92 18 108 56 104 86 Q 82 100 60 100 Q 38 100 16 86 C 12 56 28 18 60 18Z" fill="#ffb4a2" ${OUT}/>
  <path d="M60 22 L60 98 M60 22 L40 96 M60 22 L80 96 M60 22 L24 86 M60 22 L96 86" stroke="#e5989b" stroke-width="3" fill="none"/>
  <path d="M44 100 Q 60 112 76 100 Z" fill="#ffcdb2" ${OUT}/>`);
}

function fish() {
  return svg(120, 120, `${shadow(58, 104, 40)}
  <path d="M86 60 L114 36 L110 60 L114 84 Z" fill="#f77f00" ${OUT}/>
  <ellipse cx="56" cy="60" rx="40" ry="28" fill="#fcbf49" ${OUT}/>
  <path d="M52 34 Q 64 22 76 38" fill="#f77f00" ${OUT}/>
  <path d="M60 46 Q 70 60 60 74 M72 48 Q 80 60 72 72" stroke="#f77f00" stroke-width="3" fill="none"/>
  ${eye(34, 54, 6)}${smile(28, 70, 6)}`);
}

function star() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 48, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push((60 + r * Math.cos(a)).toFixed(1) + "," + (62 + r * Math.sin(a)).toFixed(1));
  }
  return svg(120, 120, `${shadow(60, 110, 36)}
  <polygon points="${pts.join(" ")}" fill="#ff9e5e" ${OUT}/>
  <circle cx="60" cy="40" r="3" fill="#ffd6a5"/><circle cx="42" cy="58" r="3" fill="#ffd6a5"/><circle cx="78" cy="58" r="3" fill="#ffd6a5"/>
  <circle cx="48" cy="80" r="3" fill="#ffd6a5"/><circle cx="72" cy="80" r="3" fill="#ffd6a5"/>
  ${eye(52, 60, 4)}${eye(68, 60, 4)}${smile(60, 68, 5)}`);
}

function apple(body, dark) {
  return svg(120, 120, `${shadow(60, 108, 38)}
  <path d="M60 34 C 40 20 14 30 16 62 C 18 92 40 108 60 100 C 80 108 102 92 104 62 C 106 30 80 20 60 34Z" fill="${body}" ${OUT}/>
  <path d="M30 52 Q 34 40 46 38" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.6"/>
  <path d="M60 34 Q 58 20 64 10" stroke="#6b4226" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M64 18 Q 80 6 92 16 Q 80 28 64 18Z" fill="#52b788" ${OUT}/>
  <path d="M60 36 Q 56 40 52 38" stroke="${dark}" stroke-width="3" fill="none"/>`);
}

function banana() {
  return svg(120, 120, `${shadow(60, 108, 40)}
  <path d="M18 40 C 20 84 60 104 100 82 C 104 78 102 74 96 76 C 64 88 38 70 32 40 Z" fill="#ffd60a" ${OUT}/>
  <path d="M30 46 C 38 74 62 86 92 80" stroke="#e9b400" stroke-width="3" fill="none"/>
  <path d="M18 40 L 16 28 L 30 30 L 32 40 Z" fill="#8a6d1f" ${OUT}/>
  <path d="M98 76 L106 80 L100 84 Z" fill="#5c4413"/>`);
}

function flower(petal) {
  let p = "";
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    p += `<ellipse cx="${60 + 22 * Math.cos(a)}" cy="${44 + 22 * Math.sin(a)}" rx="16" ry="16" fill="${petal}" ${OUT}/>`;
  }
  return svg(120, 120, `${shadow(60, 112, 26)}
  <path d="M60 64 Q 56 90 60 110" stroke="#2d6a4f" stroke-width="6" fill="none"/>
  <path d="M60 92 Q 40 78 30 90 Q 44 100 60 96Z" fill="#52b788" ${OUT}/>
  <path d="M60 86 Q 80 72 92 82 Q 78 94 60 90Z" fill="#52b788" ${OUT}/>
  ${p}<circle cx="60" cy="44" r="14" fill="#ffb703" ${OUT}/>${eye(55, 42, 3)}${eye(65, 42, 3)}${smile(60, 48, 4)}`);
}

function cake() {
  return svg(120, 120, `${shadow(60, 108, 46)}
  <ellipse cx="60" cy="100" rx="50" ry="10" fill="#e9ecef" ${OUT}/>
  <path d="M20 56 L20 94 Q 60 106 100 94 L100 56 Z" fill="#f4a261" ${OUT}/>
  <path d="M20 72 Q 60 84 100 72" stroke="#fff3e0" stroke-width="6" fill="none"/>
  <ellipse cx="60" cy="56" rx="40" ry="12" fill="#ffafcc" ${OUT}/>
  <path d="M22 58 Q 26 70 32 60 Q 38 72 44 62 Q 50 72 56 62 Q 62 74 68 62 Q 74 72 80 62 Q 86 72 92 60 Q 96 68 98 58" fill="#ffafcc" stroke="#3b2a1e" stroke-width="2.5"/>
  <circle cx="60" cy="40" r="9" fill="#e63946" ${OUT}/>
  <path d="M60 32 Q 64 22 72 20" stroke="#2d6a4f" stroke-width="3" fill="none"/>
  <circle cx="40" cy="54" r="2.5" fill="#fff"/><circle cx="78" cy="52" r="2.5" fill="#fff"/><circle cx="54" cy="60" r="2.5" fill="#3a86ff"/>`);
}

function key(c, dark) {
  return svg(120, 120, `${shadow(60, 104, 40)}
  <circle cx="34" cy="56" r="22" fill="${c}" ${OUT}/>
  <circle cx="34" cy="56" r="9" fill="#fdf6e3" ${OUT}/>
  <rect x="52" y="49" width="56" height="14" rx="4" fill="${c}" ${OUT}/>
  <rect x="84" y="60" width="9" height="18" rx="2" fill="${c}" ${OUT}/>
  <rect x="98" y="60" width="9" height="13" rx="2" fill="${c}" ${OUT}/>
  <path d="M22 44 Q 28 38 36 38" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.6"/>
  <rect x="56" y="52" width="46" height="3" fill="${dark}" opacity="0.35"/>`);
}

function chest(open) {
  const lid = open
    ? `<path d="M14 54 L22 14 L98 14 L106 54 Z" fill="#a0522d" ${OUT}/><path d="M26 20 L94 20" stroke="#ffd166" stroke-width="5"/>`
    : `<path d="M14 58 Q 14 26 60 26 Q 106 26 106 58 Z" fill="#a0522d" ${OUT}/>`;
  const gold = open
    ? `<ellipse cx="60" cy="58" rx="42" ry="10" fill="#ffd166" ${OUT}/><circle cx="40" cy="54" r="7" fill="#ffd166" ${OUT}/><circle cx="74" cy="52" r="7" fill="#ffd166" ${OUT}/>
       <polygon points="58,36 64,48 52,48" fill="#c77dff" ${OUT}/><circle cx="84" cy="44" r="6" fill="#ef476f" ${OUT}/><circle cx="34" cy="46" r="5" fill="#06d6a0" ${OUT}/>`
    : "";
  return svg(120, 120, `${shadow(60, 112, 50)}${open ? lid + gold : ""}
  <rect x="14" y="56" width="92" height="50" rx="6" fill="#bc6c25" ${OUT}/>
  <rect x="14" y="56" width="92" height="10" fill="#8b4513" ${OUT}/>
  <rect x="26" y="56" width="10" height="50" fill="#ffd166" ${OUT}/><rect x="84" y="56" width="10" height="50" fill="#ffd166" ${OUT}/>
  ${open ? "" : lid}`);
}

function lock(c) {
  return svg(60, 70, `<path d="M16 30 L16 20 Q 16 6 30 6 Q 44 6 44 20 L44 30" stroke="#6c757d" stroke-width="7" fill="none"/>
  <rect x="6" y="28" width="48" height="38" rx="8" fill="${c}" ${OUT}/>
  <circle cx="30" cy="44" r="6" fill="#1d1d24"/><rect x="27" y="46" width="6" height="12" fill="#1d1d24"/>`);
}

function mappiece(n) {
  // three pieces of one treasure map; the X is on the last
  const shapes = [
    "M8 8 L112 8 L112 52 Q 100 60 112 70 L112 112 L8 112 Z",
    "M8 8 L112 8 L112 112 L8 112 L8 70 Q 20 60 8 52 Z",
    "M8 8 L112 8 L112 112 L8 112 L8 70 Q 20 60 8 52 Z",
  ];
  const marks = [
    `<path d="M24 92 Q 40 60 64 70 T 104 40" stroke="#a0522d" stroke-width="4" stroke-dasharray="7 6" fill="none"/><circle cx="30" cy="30" r="10" fill="#52b788"/>`,
    `<path d="M14 40 Q 50 30 60 60 T 104 96" stroke="#a0522d" stroke-width="4" stroke-dasharray="7 6" fill="none"/><path d="M76 24 l10 18 l-20 0z" fill="#8d6e63"/>`,
    `<path d="M14 30 Q 40 50 56 64" stroke="#a0522d" stroke-width="4" stroke-dasharray="7 6" fill="none"/><path d="M60 56 L84 80 M84 56 L60 80" stroke="#e63946" stroke-width="7" stroke-linecap="round"/>`,
  ];
  return svg(120, 120, `<path d="${shapes[n]}" fill="#f6e7c1" ${OUT}/>${marks[n]}`);
}

function flagEn() {
  // the United Kingdom's flag
  return svg(150, 100, `<defs><clipPath id="c"><rect x="0" y="0" width="150" height="100" rx="12"/></clipPath></defs>
  <g clip-path="url(#c)"><rect width="150" height="100" fill="#012169"/>
  <path d="M0 0 L150 100 M150 0 L0 100" stroke="#fff" stroke-width="20"/>
  <path d="M0 0 L150 100 M150 0 L0 100" stroke="#c8102e" stroke-width="7"/>
  <path d="M75 0 V100 M0 50 H150" stroke="#fff" stroke-width="30"/>
  <path d="M75 0 V100 M0 50 H150" stroke="#c8102e" stroke-width="16"/></g>
  <rect x="1.5" y="1.5" width="147" height="97" rx="12" fill="none" stroke="#3b2a1e" stroke-width="3"/>`);
}

function flagEs() {
  // Spain's flag (stripes only, without the coat of arms)
  return svg(150, 100, `<defs><clipPath id="c"><rect x="0" y="0" width="150" height="100" rx="12"/></clipPath></defs>
  <g clip-path="url(#c)"><rect width="150" height="100" fill="#c60b1e"/><rect y="25" width="150" height="50" fill="#ffc400"/></g>
  <rect x="1.5" y="1.5" width="147" height="97" rx="12" fill="none" stroke="#3b2a1e" stroke-width="3"/>`);
}

// ---- characters (200 x 200) ------------------------------------------------------

function pip() {
  // Pip the parrot, the guide
  return svg(200, 200, `${shadow(100, 188, 50)}
  <path d="M84 150 L70 196 L92 168 Z" fill="#3a86ff" ${OUT}/><path d="M100 152 L100 198 L112 166 Z" fill="#ffd60a" ${OUT}/>
  <ellipse cx="100" cy="118" rx="46" ry="52" fill="#e63946" ${OUT}/>
  <ellipse cx="104" cy="134" rx="26" ry="30" fill="#ffd166"/>
  <path d="M56 104 Q 30 130 50 160 Q 70 150 72 120 Z" fill="#06d6a0" ${OUT}/>
  <path d="M144 104 Q 170 130 150 160 Q 130 150 128 120 Z" fill="#06d6a0" ${OUT}/>
  <path d="M52 140 Q 50 152 56 158 M148 140 Q 150 152 144 158" stroke="#3a86ff" stroke-width="5" fill="none"/>
  <circle cx="100" cy="64" r="40" fill="#e63946" ${OUT}/>
  <path d="M92 26 Q 96 6 110 10 Q 104 18 104 26 Q 116 12 126 20 Q 114 24 110 32" fill="#ffd60a" ${OUT}/>
  <ellipse cx="80" cy="62" rx="14" ry="16" fill="#fff"/><ellipse cx="120" cy="62" rx="14" ry="16" fill="#fff"/>
  ${eye(82, 62, 7)}${eye(118, 62, 7)}
  <path d="M90 78 Q 100 70 110 78 Q 112 96 100 104 Q 92 94 90 78Z" fill="#ffb703" ${OUT}/>
  <path d="M92 86 Q 100 90 108 86" stroke="#3b2a1e" stroke-width="2.5" fill="none"/>
  ${blush(68, 80)}${blush(132, 80)}
  <path d="M84 176 l-8 10 M84 176 l0 12 M84 176 l8 10 M116 176 l-8 10 M116 176 l0 12 M116 176 l8 10" stroke="#ffb703" stroke-width="4" stroke-linecap="round"/>`);
}

function tilly() {
  // Tilly the turtle (beach)
  return svg(200, 200, `${shadow(100, 186, 80)}
  <ellipse cx="44" cy="170" rx="18" ry="12" fill="#95d5b2" ${OUT}/><ellipse cx="156" cy="170" rx="18" ry="12" fill="#95d5b2" ${OUT}/>
  <path d="M30 156 Q 30 86 100 82 Q 170 86 170 156 Z" fill="#52b788" ${OUT}/>
  <path d="M60 150 L72 112 L100 100 L128 112 L140 150 M72 112 L48 130 M128 112 L152 130 M100 100 L100 84" stroke="#2d6a4f" stroke-width="4" fill="none"/>
  <path d="M24 156 Q 100 172 176 156 Q 176 166 166 168 Q 100 180 34 168 Q 24 166 24 156Z" fill="#b7e4c7" ${OUT}/>
  <ellipse cx="100" cy="60" rx="38" ry="34" fill="#95d5b2" ${OUT}/>
  ${eye(86, 54, 7)}${eye(114, 54, 7)}${smile(100, 70, 12)}${blush(76, 70)}${blush(124, 70)}
  <path d="M68 34 Q 100 10 132 34 Q 100 26 68 34Z" fill="#ff70a6" ${OUT}/><circle cx="132" cy="30" r="8" fill="#ffd60a" ${OUT}/>`);
}

function momo() {
  // Momo the monkey (garden)
  return svg(200, 200, `${shadow(100, 188, 56)}
  <path d="M146 150 Q 190 140 180 100 Q 176 86 166 92" stroke="#7f5539" stroke-width="10" fill="none" stroke-linecap="round"/>
  <ellipse cx="100" cy="140" rx="44" ry="44" fill="#9c6644" ${OUT}/>
  <ellipse cx="100" cy="148" rx="28" ry="30" fill="#e6ccb2"/>
  <ellipse cx="70" cy="180" rx="16" ry="10" fill="#9c6644" ${OUT}/><ellipse cx="130" cy="180" rx="16" ry="10" fill="#9c6644" ${OUT}/>
  <circle cx="48" cy="66" r="20" fill="#9c6644" ${OUT}/><circle cx="48" cy="66" r="11" fill="#e6ccb2"/>
  <circle cx="152" cy="66" r="20" fill="#9c6644" ${OUT}/><circle cx="152" cy="66" r="11" fill="#e6ccb2"/>
  <circle cx="100" cy="70" r="46" fill="#9c6644" ${OUT}/>
  <path d="M64 74 Q 64 44 92 50 Q 100 56 108 50 Q 136 44 136 74 Q 136 106 100 108 Q 64 106 64 74Z" fill="#e6ccb2"/>
  ${eye(86, 68, 7)}${eye(114, 68, 7)}
  <ellipse cx="96" cy="84" rx="2.5" ry="2" fill="#3b2a1e"/><ellipse cx="104" cy="84" rx="2.5" ry="2" fill="#3b2a1e"/>
  ${smile(100, 92, 12)}${blush(76, 88)}${blush(124, 88)}
  <path d="M96 26 Q 100 14 108 18" stroke="#7f5539" stroke-width="5" fill="none" stroke-linecap="round"/>`);
}

function bruno() {
  // Bruno the bear (café), with an apron and a chef's hat
  return svg(200, 200, `${shadow(100, 190, 62)}
  <ellipse cx="100" cy="140" rx="54" ry="50" fill="#a0673a" ${OUT}/>
  <path d="M66 112 L134 112 L140 182 Q 100 194 60 182 Z" fill="#fff" ${OUT}/>
  <path d="M84 140 L116 140" stroke="#e63946" stroke-width="4"/>
  <ellipse cx="44" cy="134" rx="14" ry="22" fill="#a0673a" ${OUT}/><ellipse cx="156" cy="134" rx="14" ry="22" fill="#a0673a" ${OUT}/>
  <circle cx="58" cy="44" r="18" fill="#a0673a" ${OUT}/><circle cx="58" cy="44" r="9" fill="#d4a373"/>
  <circle cx="142" cy="44" r="18" fill="#a0673a" ${OUT}/><circle cx="142" cy="44" r="9" fill="#d4a373"/>
  <circle cx="100" cy="72" r="46" fill="#a0673a" ${OUT}/>
  <ellipse cx="100" cy="90" rx="22" ry="17" fill="#d4a373"/>
  <ellipse cx="100" cy="82" rx="8" ry="6" fill="#3b2a1e"/>
  ${eye(82, 64, 6)}${eye(118, 64, 6)}${smile(100, 94, 9)}${blush(70, 84)}${blush(130, 84)}
  <path d="M70 34 Q 60 6 84 10 Q 92 -4 108 8 Q 128 2 132 22 Q 140 30 130 36 L70 36 Z" fill="#fff" ${OUT}/>
  <rect x="70" y="30" width="60" height="10" rx="3" fill="#fff" ${OUT}/>`);
}

function rabbit() {
  // Lumi the rabbit, a café guest
  return svg(200, 200, `${shadow(100, 188, 50)}
  <ellipse cx="100" cy="146" rx="42" ry="42" fill="#f1f3f5" ${OUT}/>
  <ellipse cx="78" cy="38" rx="13" ry="36" fill="#f1f3f5" ${OUT}/><ellipse cx="78" cy="40" rx="6" ry="26" fill="#ffc8dd"/>
  <ellipse cx="122" cy="38" rx="13" ry="36" fill="#f1f3f5" ${OUT}/><ellipse cx="122" cy="40" rx="6" ry="26" fill="#ffc8dd"/>
  <circle cx="100" cy="92" r="40" fill="#f1f3f5" ${OUT}/>
  ${eye(86, 88, 6)}${eye(114, 88, 6)}<ellipse cx="100" cy="102" rx="5" ry="4" fill="#ff70a6"/>
  ${smile(100, 108, 8)}${blush(76, 104)}${blush(124, 104)}
  <path d="M84 132 L100 142 L116 132 L116 150 L100 142 L84 150 Z" fill="#3a86ff" ${OUT}/>`);
}

// ---- scenes (360 x 560) ----------------------------------------------------------

function sun(x, y) {
  let r = "";
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    r += `<path d="M${x + 30 * Math.cos(a)} ${y + 30 * Math.sin(a)} L${x + 42 * Math.cos(a)} ${y + 42 * Math.sin(a)}" stroke="#ffd60a" stroke-width="5" stroke-linecap="round"/>`;
  }
  return r + `<circle cx="${x}" cy="${y}" r="24" fill="#ffd60a"/>`;
}
const cloud = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity="0.95"><ellipse cx="0" cy="0" rx="30" ry="16"/><ellipse cx="24" cy="-8" rx="22" ry="18"/><ellipse cx="46" cy="2" rx="24" ry="14"/></g>`;
function palm(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 0 Q -8 -60 10 -120" stroke="#8b5a2b" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M0 -10 Q -6 -40 4 -60 M-4 -30 Q 2 -50 6 -80 M2 -70 Q 6 -90 8 -100" stroke="#6f4518" stroke-width="3" fill="none"/>
  <path d="M10 -120 Q -30 -140 -60 -110 Q -30 -122 10 -116Z" fill="#2d6a4f"/>
  <path d="M10 -120 Q 50 -144 80 -112 Q 46 -124 10 -116Z" fill="#40916c"/>
  <path d="M10 -120 Q -10 -164 -40 -160 Q -14 -148 8 -118Z" fill="#40916c"/>
  <path d="M10 -120 Q 34 -166 62 -156 Q 36 -148 12 -118Z" fill="#2d6a4f"/>
  <circle cx="2" cy="-114" r="7" fill="#7f5539"/><circle cx="16" cy="-112" r="7" fill="#7f5539"/></g>`;
}

function bgMap() {
  // the island from above, the four places marked by the game on top
  return svg(360, 560, `<defs><radialGradient id="sea" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#6fd3ee"/><stop offset="1" stop-color="#1d7fb5"/></radialGradient></defs>
  <rect width="360" height="560" fill="url(#sea)"/>
  <path d="M30 120 q 10 -6 20 0 t 20 0 M260 470 q 10 -6 20 0 t 20 0 M290 90 q 10 -6 20 0 t 20 0 M40 480 q 10 -6 20 0 t 20 0" stroke="#e0fbfc" stroke-width="3" fill="none" opacity="0.7"/>
  <path d="M70 200 C 40 120 140 70 210 96 C 300 80 340 170 312 250 C 340 330 300 440 210 450 C 140 480 50 440 56 360 C 20 310 30 250 70 200Z" fill="#ffe8a3"/>
  <path d="M86 206 C 64 140 150 100 210 118 C 284 108 310 180 288 250 C 312 322 280 418 210 426 C 150 452 76 420 80 356 C 52 312 58 258 86 206Z" fill="#74c69d"/>
  <path d="M130 170 C 160 140 230 140 250 190 C 270 240 230 260 190 250 C 150 262 110 220 130 170Z" fill="#52b788"/>
  <path d="M220 330 L250 270 L280 330 Z" fill="#8d99ae"/><path d="M240 330 L262 290 L290 330 Z" fill="#6c757d"/><path d="M243 286 L250 270 L257 286 Z" fill="#fff"/>
  <path d="M120 250 Q 160 300 200 290 T 250 330 M120 250 Q 110 330 150 370 M150 370 Q 200 380 250 330" stroke="#bc8a5f" stroke-width="5" stroke-dasharray="9 8" fill="none"/>
  ${palm(70, 400, 0.45)}${palm(300, 210, 0.4)}${palm(170, 140, 0.35)}
  ${cloud(40, 50, 0.9)}${cloud(250, 36, 0.7)}`);
}

function bgBeach() {
  return svg(360, 560, `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecae6"/><stop offset="1" stop-color="#d7f0fa"/></linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#219ebc"/><stop offset="1" stop-color="#5ec8e0"/></linearGradient></defs>
  <rect width="360" height="200" fill="url(#sky)"/>${sun(300, 70)}${cloud(40, 70)}${cloud(170, 40, 0.7)}
  <rect y="180" width="360" height="110" fill="url(#sea)"/>
  <path d="M0 200 q 15 -8 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0" stroke="#e0fbfc" stroke-width="3" fill="none" opacity="0.8"/>
  <path d="M0 240 q 20 -8 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke="#e0fbfc" stroke-width="3" fill="none" opacity="0.6"/>
  <path d="M260 190 L300 190 L296 178 L264 178Z" fill="#bc6c25"/><path d="M280 178 L280 140 L300 172Z" fill="#fff"/>
  <path d="M0 290 Q 90 270 180 286 T 360 280 L360 560 L0 560 Z" fill="#ffe8a3"/>
  <path d="M0 300 Q 90 282 180 296 T 360 290" stroke="#fff" stroke-width="6" fill="none" opacity="0.8"/>
  <circle cx="60" cy="380" r="3" fill="#e9c46a"/><circle cx="200" cy="420" r="3" fill="#e9c46a"/><circle cx="300" cy="360" r="3" fill="#e9c46a"/><circle cx="120" cy="500" r="3" fill="#e9c46a"/><circle cx="270" cy="520" r="3" fill="#e9c46a"/>
  ${palm(330, 330, 0.9)}${palm(20, 320, 0.7)}`);
}

function bgGarden() {
  let fruitTrees = "";
  return svg(360, 560, `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a2d2ff"/><stop offset="1" stop-color="#e3f2fd"/></linearGradient></defs>
  <rect width="360" height="300" fill="url(#sky)"/>${cloud(40, 50, 0.8)}${cloud(240, 70)}
  <path d="M0 240 Q 80 200 180 230 T 360 220 L360 560 L0 560Z" fill="#95d5b2"/>
  <path d="M0 290 Q 100 260 200 285 T 360 280 L360 560 L0 560Z" fill="#74c69d"/>
  <rect x="160" y="150" width="40" height="160" rx="10" fill="#8b5a2b"/>
  <path d="M170 220 Q 150 200 130 210 M190 200 Q 214 180 230 190" stroke="#8b5a2b" stroke-width="12" stroke-linecap="round" fill="none"/>
  <ellipse cx="180" cy="120" rx="150" ry="100" fill="#40916c"/><ellipse cx="110" cy="100" rx="70" ry="60" fill="#52b788"/><ellipse cx="250" cy="110" rx="70" ry="56" fill="#52b788"/><ellipse cx="180" cy="70" rx="70" ry="50" fill="#74c69d" opacity="0.7"/>
  <path d="M0 470 Q 180 440 360 470 L360 560 L0 560Z" fill="#52b788"/>
  ${fruitTrees}`);
}

function bgCafe() {
  let tiles = "";
  for (let y = 380; y < 560; y += 30) for (let x = ((y / 30) % 2) * 30; x < 360; x += 60) tiles += `<rect x="${x}" y="${y}" width="30" height="30" fill="#e9ecef"/>`;
  return svg(360, 560, `<rect width="360" height="380" fill="#ffe5ec"/>
  <path d="M0 0 H360 V60 H0Z" fill="#fb6f92"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<path d="M${i * 45} 60 q 22.5 30 45 0" fill="${i % 2 ? "#fff" : "#fb6f92"}"/>`).join("")}
  <rect x="30" y="110" width="120" height="100" rx="10" fill="#a2d2ff" stroke="#fff" stroke-width="8"/><path d="M90 110 V210 M30 160 H150" stroke="#fff" stroke-width="6"/>
  ${cloud(60, 140, 0.5)}
  <rect x="210" y="100" width="120" height="16" rx="4" fill="#bc6c25"/><rect x="210" y="160" width="120" height="16" rx="4" fill="#bc6c25"/>
  <circle cx="230" cy="86" r="12" fill="#ffafcc"/><rect x="252" y="76" width="22" height="24" rx="4" fill="#3a86ff"/><circle cx="300" cy="88" r="11" fill="#ffd60a"/>
  <rect x="226" y="134" width="20" height="26" rx="6" fill="#52b788"/><rect x="260" y="138" width="26" height="22" rx="4" fill="#fff"/><circle cx="310" cy="148" r="12" fill="#e63946"/>
  <rect width="360" height="180" y="380" fill="#f8f9fa"/>${tiles}
  <rect x="0" y="300" width="360" height="90" fill="#bc6c25"/><rect x="0" y="292" width="360" height="16" rx="4" fill="#dda15e"/>
  <path d="M20 330 H340" stroke="#a0522d" stroke-width="4"/>`);
}

function bgCave() {
  return svg(360, 560, `<defs><radialGradient id="glow" cx="50%" cy="62%" r="60%"><stop offset="0" stop-color="#6c5b7b"/><stop offset="1" stop-color="#2b2140"/></radialGradient></defs>
  <rect width="360" height="560" fill="url(#glow)"/>
  <path d="M0 0 H360 V70 Q 330 120 300 80 Q 280 130 250 70 Q 220 110 200 60 Q 170 120 140 70 Q 110 110 90 70 Q 60 130 30 80 Q 14 110 0 90Z" fill="#1f1830"/>
  <path d="M0 560 V420 Q 60 400 120 430 Q 200 400 260 430 Q 320 410 360 420 V560Z" fill="#40335a"/>
  <path d="M30 420 l14 -34 l14 34z M300 424 l12 -28 l12 28z" fill="#9d4edd" opacity="0.8"/>
  <path d="M60 300 l10 -26 l10 26z M290 280 l8 -22 l8 22z" fill="#48cae4" opacity="0.7"/>
  <circle cx="80" cy="200" r="3" fill="#fff" opacity="0.7"/><circle cx="280" cy="180" r="2" fill="#fff" opacity="0.7"/><circle cx="200" cy="240" r="2.5" fill="#fff" opacity="0.6"/>
  <path d="M40 160 q 6 -20 12 0 q -6 8 -12 0z M310 220 q 6 -20 12 0 q -6 8 -12 0z" fill="#ffb703"/>
  <path d="M46 140 v20 M316 200 v20" stroke="#6f4518" stroke-width="4"/>`);
}

const ART = {
  shell: shell(), fish: fish(), star: star(),
  apple_red: apple("#e63946", "#9d0208"), apple_green: apple("#80b918", "#386641"),
  banana: banana(),
  flower_red: flower("#ef476f"), flower_yellow: flower("#ffd60a"), flower_blue: flower("#4895ef"),
  cake: cake(),
  key_red: key("#e63946", "#9d0208"), key_blue: key("#3a86ff", "#023e8a"), key_yellow: key("#ffd60a", "#b08900"), key_green: key("#52b788", "#1b4332"),
  lock_red: lock("#e63946"), lock_blue: lock("#3a86ff"), lock_yellow: lock("#ffd60a"), lock_green: lock("#52b788"),
  chest: chest(false), chest_open: chest(true),
  map1: mappiece(0), map2: mappiece(1), map3: mappiece(2),
  flag_en: flagEn(), flag_es: flagEs(),
  pip: pip(), tilly: tilly(), momo: momo(), bruno: bruno(), rabbit: rabbit(),
  bg_map: bgMap(), bg_beach: bgBeach(), bg_garden: bgGarden(), bg_cafe: bgCafe(), bg_cave: bgCave(),
};

module.exports = { ART };
