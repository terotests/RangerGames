// Vuodenajat: the game's pictures as SVG, drawn here by hand (our own art,
// no outside images). tools/vuodenajat/render.js turns them into the PNGs in
// games/vuodenajat/img (PNGs are cheap to draw every frame on the old phone).
// Every animal faces right. Summer and winter coats share one shape and only
// change colours, as the real animals do.

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const eye = (x, y, r = 4.5) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#1d1d24"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/>`;
const shut = (x, y, r = 5) => `<path d="M${x - r} ${y} Q ${x} ${y + r * 0.9} ${x + r} ${y}" stroke="#1d1d24" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
const blush = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.5" fill="#ff8fa3" opacity="0.45"/>`;

// ---- animals -------------------------------------------------------------------

function janis(c) {
  const o = c.line ? ` stroke="${c.line}" stroke-width="2.5"` : "";
  return svg(200, 170, `
  <ellipse cx="96" cy="160" rx="70" ry="7" fill="#000" opacity="0.12"/>
  <ellipse cx="42" cy="104" rx="11" ry="10" fill="${c.tail}"${o}/>
  <ellipse cx="98" cy="112" rx="58" ry="40" fill="${c.body}"${o}/>
  <ellipse cx="74" cy="118" rx="36" ry="32" fill="${c.shade}"/>
  <ellipse cx="118" cy="128" rx="26" ry="18" fill="${c.belly}"/>
  <ellipse cx="86" cy="152" rx="34" ry="8" fill="${c.shade}"${o}/>
  <ellipse cx="146" cy="150" rx="15" ry="7" fill="${c.body}"${o}/>
  <g transform="rotate(-18 128 44)"><ellipse cx="128" cy="44" rx="10" ry="34" fill="${c.body}"${o}/><ellipse cx="128" cy="47" rx="5" ry="24" fill="${c.ear}"/><path d="M118.5 22 Q128 0 137.5 22 Q128 16 118.5 22Z" fill="#1d1d24"/></g>
  <g transform="rotate(-4 146 40)"><ellipse cx="146" cy="40" rx="10" ry="33" fill="${c.body}"${o}/><ellipse cx="146" cy="43" rx="5" ry="23" fill="${c.ear}"/><path d="M136.5 18 Q146 -4 155.5 18 Q146 12 136.5 18Z" fill="#1d1d24"/></g>
  <ellipse cx="150" cy="82" rx="30" ry="25" fill="${c.body}"${o}/>
  <ellipse cx="166" cy="92" rx="13" ry="10" fill="${c.belly}"/>
  ${eye(158, 76, 5)}
  <circle cx="178" cy="87" r="3.6" fill="#e07a8a"/>
  <path d="M170 95 Q174 99 178 95" stroke="#6b4b3a" stroke-width="1.6" fill="none"/>
  ${blush(150, 92)}`);
}

function karppa(c) {
  const o = c.line ? ` stroke="${c.line}" stroke-width="2.5"` : "";
  return svg(220, 130, `
  <ellipse cx="110" cy="122" rx="80" ry="6" fill="#000" opacity="0.12"/>
  <path d="M52 86 C 30 80 18 66 10 46" stroke="${c.body}" stroke-width="15" fill="none" stroke-linecap="round"/>
  <path d="M17 60 C 13 54 11 50 10 46" stroke="#1d1d24" stroke-width="16" fill="none" stroke-linecap="round"/>
  <rect x="58" y="96" width="12" height="24" rx="6" fill="${c.body}"${o}/>
  <rect x="140" y="96" width="12" height="24" rx="6" fill="${c.body}"${o}/>
  <ellipse cx="104" cy="88" rx="58" ry="20" fill="${c.body}"${o}/>
  <ellipse cx="116" cy="100" rx="40" ry="8" fill="${c.belly}"/>
  <rect x="74" y="98" width="12" height="22" rx="6" fill="${c.body}"${o}/>
  <rect x="124" y="98" width="12" height="22" rx="6" fill="${c.body}"${o}/>
  <ellipse cx="162" cy="76" rx="16" ry="18" fill="${c.body}"${o}/>
  <circle cx="168" cy="52" r="8" fill="${c.body}"${o}/><circle cx="168" cy="52" r="4" fill="${c.ear}"/>
  <ellipse cx="180" cy="62" rx="24" ry="17" fill="${c.body}"${o}/>
  <ellipse cx="186" cy="72" rx="16" ry="7" fill="${c.belly}"/>
  ${eye(186, 58, 4.5)}
  <circle cx="203" cy="64" r="3.4" fill="#1d1d24"/>
  ${blush(178, 70)}`);
}

function riekko(c) {
  const o = c.line ? ` stroke="${c.line}" stroke-width="2.5"` : "";
  const spots = c.spots
    ? [[80, 80], [100, 72], [120, 80], [70, 100], [92, 96], [112, 100], [140, 70], [150, 46], [134, 92]]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="3" fill="${c.spots}"/>`).join("")
    : "";
  return svg(200, 170, `
  <ellipse cx="104" cy="160" rx="62" ry="7" fill="#000" opacity="0.12"/>
  <path d="M54 92 L 22 80 L 26 100 L 20 112 L 56 108Z" fill="#1d1d24"/>
  <ellipse cx="104" cy="104" rx="56" ry="42" fill="${c.body}"${o}/>
  <ellipse cx="112" cy="122" rx="40" ry="22" fill="${c.belly}"/>
  ${spots}
  <path d="M70 92 C 82 70 120 74 128 96 C 116 114 82 116 70 92Z" fill="${c.wing}"${o}/>
  <path d="M78 98 Q 98 106 120 98" stroke="#d8dee6" stroke-width="2" fill="none"/>
  <circle cx="148" cy="62" r="24" fill="${c.head}"${o}/>
  <path d="M146 44 Q 156 36 166 46" stroke="#e5383b" stroke-width="5" fill="none" stroke-linecap="round"/>
  ${eye(156, 56, 4.5)}
  <path d="M170 60 L 182 64 L 170 70Z" fill="#2b2d42"/>
  <ellipse cx="94" cy="148" rx="13" ry="9" fill="${c.feet}"${o}/>
  <ellipse cx="122" cy="148" rx="13" ry="9" fill="${c.feet}"${o}/>
  ${blush(150, 70)}`);
}

function orava(c) {
  return svg(190, 190, `
  <ellipse cx="104" cy="182" rx="56" ry="6" fill="#000" opacity="0.12"/>
  <path d="M84 168 C 20 172 6 110 26 70 C 40 40 78 30 84 58 C 90 84 56 92 62 124 C 66 146 84 152 94 160Z" fill="${c.tail}"/>
  <path d="M40 80 C 50 60 70 56 74 70" stroke="${c.dark}" stroke-width="5" fill="none" opacity="0.35" stroke-linecap="round"/>
  <ellipse cx="114" cy="128" rx="36" ry="44" fill="${c.body}"/>
  <ellipse cx="124" cy="136" rx="20" ry="30" fill="${c.belly}"/>
  <ellipse cx="104" cy="170" rx="22" ry="9" fill="${c.body}"/>
  <path d="M120 44 L 128 ${16 + (10 - c.tuft)} L 138 44Z" fill="${c.body}"/>
  <path d="M128 ${18 + (10 - c.tuft)} L 122 ${14 + (10 - c.tuft) - c.tuft} M128 ${18 + (10 - c.tuft)} L 128 ${12 + (10 - c.tuft) - c.tuft} M128 ${18 + (10 - c.tuft)} L 134 ${14 + (10 - c.tuft) - c.tuft}" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="134" cy="68" r="28" fill="${c.body}"/>
  <ellipse cx="148" cy="80" rx="14" ry="11" fill="${c.belly}"/>
  ${eye(142, 62, 5)}
  <circle cx="162" cy="74" r="3.6" fill="#3a2a22"/>
  <ellipse cx="140" cy="112" rx="10" ry="8" fill="${c.body}"/>
  ${blush(136, 80)}`);
}

function karhu() {
  const b = "#6e4527", d = "#553419", s = "#b08455";
  return svg(240, 170, `
  <ellipse cx="120" cy="162" rx="96" ry="7" fill="#000" opacity="0.14"/>
  <rect x="48" y="104" width="26" height="54" rx="12" fill="${d}"/>
  <rect x="140" y="104" width="26" height="54" rx="12" fill="${d}"/>
  <path d="M30 100 C 26 50 70 34 110 36 C 150 36 184 52 184 92 C 184 124 150 128 110 128 C 60 128 32 126 30 100Z" fill="${b}"/>
  <rect x="68" y="106" width="28" height="54" rx="12" fill="${b}"/>
  <rect x="160" y="106" width="28" height="54" rx="12" fill="${b}"/>
  <circle cx="186" cy="60" r="12" fill="${b}"/><circle cx="186" cy="60" r="6" fill="${s}"/>
  <circle cx="190" cy="76" r="30" fill="${b}"/>
  <circle cx="176" cy="50" r="10" fill="${b}"/><circle cx="176" cy="50" r="5" fill="${s}"/>
  <ellipse cx="214" cy="86" rx="18" ry="13" fill="${s}"/>
  <ellipse cx="228" cy="80" rx="6" ry="5" fill="#2b1a10"/>
  ${eye(198, 68, 5)}
  ${blush(192, 90)}`);
}

function karhuUni() {
  const b = "#6e4527", s = "#b08455";
  return svg(200, 130, `
  <ellipse cx="100" cy="122" rx="86" ry="6" fill="#000" opacity="0.14"/>
  <path d="M14 104 C 8 50 60 22 104 24 C 156 26 190 58 186 96 C 184 118 150 120 100 120 C 50 120 18 122 14 104Z" fill="${b}"/>
  <ellipse cx="70" cy="110" rx="30" ry="11" fill="#5a3a20"/>
  <circle cx="148" cy="88" r="28" fill="${b}"/>
  <circle cx="136" cy="62" r="9" fill="${b}"/><circle cx="136" cy="62" r="4.5" fill="${s}"/>
  <ellipse cx="170" cy="100" rx="16" ry="11" fill="${s}"/>
  <ellipse cx="183" cy="96" rx="5" ry="4" fill="#2b1a10"/>
  ${shut(152, 84, 6)}
  <ellipse cx="128" cy="112" rx="26" ry="9" fill="#5a3a20"/>`);
}

function spikes(cx, cy, r, from, to, n, col) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    const a2 = from + ((to - from) * (i + 0.5)) / n;
    const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a2) * (r + 16), y2 = cy + Math.sin(a2) * (r + 16);
    d += (i === 0 ? "M" : "L") + x1.toFixed(1) + " " + y1.toFixed(1);
    if (i < n) d += " L" + x2.toFixed(1) + " " + y2.toFixed(1);
  }
  return `<path d="${d} L${cx} ${cy}Z" fill="${col}"/>`;
}

function siili() {
  return svg(180, 120, `
  <ellipse cx="88" cy="112" rx="70" ry="6" fill="#000" opacity="0.12"/>
  ${spikes(84, 96, 50, Math.PI, Math.PI * 2, 14, "#5b4a3c")}
  <ellipse cx="84" cy="88" rx="56" ry="30" fill="#7a6553"/>
  <path d="M40 76 L 52 66 M60 64 L 72 56 M86 60 L 98 54 M106 64 L 118 58 M50 92 L 62 84 M76 82 L 88 76 M98 86 L 112 80" stroke="#e9dccb" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M120 70 C 150 74 168 90 172 100 C 160 108 130 112 116 104Z" fill="#d9b994"/>
  <circle cx="172" cy="100" r="5" fill="#1d1d24"/>
  ${eye(144, 88, 4)}
  <ellipse cx="66" cy="110" rx="9" ry="5" fill="#a07c5c"/><ellipse cx="116" cy="110" rx="9" ry="5" fill="#a07c5c"/>
  ${blush(140, 98)}`);
}

function siiliUni() {
  return svg(150, 120, `
  <ellipse cx="75" cy="112" rx="56" ry="6" fill="#000" opacity="0.12"/>
  ${spikes(75, 66, 42, 0, Math.PI * 2, 22, "#5b4a3c")}
  <circle cx="75" cy="66" r="44" fill="#7a6553"/>
  <path d="M50 44 L 60 36 M78 34 L 90 30 M100 50 L 110 44 M48 70 L 58 64 M72 58 L 84 52 M96 74 L 108 68 M64 88 L 76 82" stroke="#e9dccb" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M86 98 C 100 96 112 86 114 76 C 104 78 92 88 86 98Z" fill="#d9b994"/>
  ${shut(102, 86, 4)}`);
}

function sammakko(c) {
  const e = c.sleep ? shut : eye;
  return svg(160, 120, `
  <ellipse cx="80" cy="112" rx="60" ry="6" fill="#000" opacity="0.12"/>
  <ellipse cx="40" cy="100" rx="30" ry="12" fill="${c.dark}"/>
  <ellipse cx="74" cy="80" rx="54" ry="30" fill="${c.body}"/>
  <ellipse cx="80" cy="94" rx="40" ry="14" fill="${c.belly}"/>
  <circle cx="96" cy="50" r="15" fill="${c.body}"/><circle cx="124" cy="54" r="15" fill="${c.body}"/>
  <circle cx="96" cy="50" r="10" fill="#fff"/><circle cx="124" cy="54" r="10" fill="#fff"/>
  ${c.sleep ? shut(96, 50, 7) + shut(124, 54, 7) : eye(98, 50, 6) + eye(126, 54, 6)}
  <ellipse cx="112" cy="80" rx="34" ry="20" fill="${c.body}"/>
  <path d="M90 86 Q 116 98 142 82" stroke="#3b3a1e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <ellipse cx="54" cy="70" rx="6" ry="4" fill="${c.dark}"/><ellipse cx="72" cy="62" rx="5" ry="3.5" fill="${c.dark}"/><ellipse cx="40" cy="84" rx="5" ry="3.5" fill="${c.dark}"/>
  <ellipse cx="112" cy="106" rx="16" ry="6" fill="${c.dark}"/>
  ${blush(132, 88)}`);
}

function mayra(c) {
  const g = "#8d8f93", k = "#26262a";
  const head = c.sleep
    ? `<ellipse cx="150" cy="96" rx="32" ry="20" fill="#f4f4f2"/><path d="M128 86 C 142 80 160 82 178 96" stroke="${k}" stroke-width="9" fill="none" stroke-linecap="round"/>${shut(156, 94, 5)}<circle cx="180" cy="102" r="5" fill="${k}"/>`
    : `<path d="M150 58 C 186 60 206 78 212 92 C 196 104 160 108 146 100Z" fill="#f4f4f2"/><path d="M152 64 C 172 66 190 76 204 88" stroke="${k}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M150 90 C 168 94 186 96 200 96" stroke="${k}" stroke-width="5" fill="none" opacity="0.0"/><circle cx="212" cy="92" r="5" fill="${k}"/>${eye(180, 76, 4)}<circle cx="156" cy="58" r="8" fill="#f4f4f2"/>`;
  const legs = c.sleep ? "" : `<rect x="54" y="98" width="20" height="26" rx="8" fill="${k}"/><rect x="128" y="98" width="20" height="26" rx="8" fill="${k}"/>`;
  return svg(220, 130, `
  <ellipse cx="108" cy="124" rx="90" ry="6" fill="#000" opacity="0.12"/>
  ${legs}
  <path d="M24 92 C 22 58 64 46 100 46 C 136 46 160 56 160 86 C 160 108 136 112 100 112 C 60 112 26 112 24 92Z" fill="${g}"/>
  <path d="M30 96 C 60 108 120 110 156 96" stroke="${k}" stroke-width="10" fill="none" opacity="0.55"/>
  <ellipse cx="22" cy="84" rx="10" ry="7" fill="${g}"/>
  ${head}`);
}

function narhi() {
  return svg(190, 150, `
  <ellipse cx="96" cy="144" rx="54" ry="5" fill="#000" opacity="0.12"/>
  <path d="M58 86 L 10 106 L 16 118 L 60 104Z" fill="#26262a"/>
  <ellipse cx="96" cy="88" rx="48" ry="32" fill="#c9a08a"/>
  <ellipse cx="62" cy="100" rx="14" ry="10" fill="#fff"/>
  <path d="M66 78 C 84 62 118 66 126 86 C 114 106 84 108 66 78Z" fill="#26262a"/>
  <path d="M100 68 L 112 70 L 110 80 L 98 78Z M104 69 L 106 79" fill="#3a7bd5" stroke="#fff" stroke-width="1.5"/>
  <rect x="96" y="68" width="18" height="10" fill="#3a7bd5"/>
  <path d="M96 70 L114 70 M96 74 L114 74" stroke="#fff" stroke-width="1.6"/>
  <path d="M74 86 L 92 92" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <circle cx="136" cy="56" r="22" fill="#c9a08a"/>
  <path d="M120 40 C 124 26 140 22 148 34 C 140 34 132 36 128 44Z" fill="#e2c6b4"/>
  <path d="M126 36 L 130 44 M134 32 L 136 42 M142 32 L 142 40" stroke="#26262a" stroke-width="1.8"/>
  ${eye(144, 54, 4.5)}
  <path d="M136 64 L 150 74" stroke="#26262a" stroke-width="4" stroke-linecap="round"/>
  <path d="M156 54 L 170 58 L 156 64Z" fill="#3a3a40"/>
  <path d="M90 118 L 86 138 M104 118 L 106 138" stroke="#a07a60" stroke-width="4" stroke-linecap="round"/>`);
}

function kurki() {
  return svg(170, 220, `
  <ellipse cx="80" cy="214" rx="40" ry="5" fill="#000" opacity="0.12"/>
  <path d="M72 140 L 66 210 M90 140 L 96 210" stroke="#3a3a40" stroke-width="4" stroke-linecap="round"/>
  <path d="M30 108 C 18 120 16 140 30 148 C 40 136 48 126 56 118Z" fill="#5a5f66"/>
  <ellipse cx="80" cy="116" rx="46" ry="30" fill="#a7afb8"/>
  <path d="M28 104 C 10 116 8 138 22 150 C 34 140 42 128 50 112Z" fill="#6c727a"/>
  <path d="M110 104 C 118 80 120 56 116 40" stroke="#a7afb8" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M116 92 C 120 74 122 60 118 46" stroke="#26262a" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M114 82 C 110 66 110 54 112 44" stroke="#f4f4f2" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="120" cy="34" r="12" fill="#26262a"/>
  <circle cx="122" cy="26" r="5" fill="#e5383b"/>
  <path d="M110 36 C 112 44 116 46 120 46" stroke="#f4f4f2" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="124" cy="33" r="2.6" fill="#ffd166"/>
  <path d="M130 34 L 158 40 L 130 40Z" fill="#4a4a50"/>`);
}

function paasky() {
  return svg(190, 130, `
  <path d="M60 70 L 4 52 L 30 72 L 2 92 L 62 82Z" fill="#1d3a72"/>
  <path d="M84 62 C 70 30 92 6 128 2 C 112 24 108 44 104 64Z" fill="#1d3a72"/>
  <path d="M84 86 C 70 112 90 128 124 128 C 110 112 106 98 104 82Z" fill="#244a8f"/>
  <ellipse cx="100" cy="74" rx="46" ry="18" fill="#1d3a72"/>
  <ellipse cx="108" cy="82" rx="34" ry="10" fill="#fdf6ea"/>
  <circle cx="146" cy="68" r="16" fill="#1d3a72"/>
  <path d="M146 76 C 154 82 162 80 164 74 L 150 70Z" fill="#c8402a"/>
  ${eye(150, 64, 3.8)}
  <path d="M160 66 L 172 69 L 160 72Z" fill="#26262a"/>`);
}

function tiainen() {
  return svg(150, 140, `
  <ellipse cx="72" cy="134" rx="40" ry="5" fill="#000" opacity="0.12"/>
  <path d="M40 80 L 6 96 L 12 106 L 44 94Z" fill="#4a5a6a"/>
  <ellipse cx="74" cy="86" rx="40" ry="32" fill="#7e9a4c"/>
  <ellipse cx="80" cy="96" rx="30" ry="24" fill="#f4d03f"/>
  <path d="M96 76 L 90 118" stroke="#1d1d24" stroke-width="8" stroke-linecap="round"/>
  <path d="M46 78 C 56 66 80 70 84 82 C 72 92 56 92 46 78Z" fill="#5c7086"/>
  <path d="M50 80 L 76 84" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <circle cx="104" cy="56" r="22" fill="#1d1d24"/>
  <ellipse cx="106" cy="62" rx="12" ry="9" fill="#fff"/>
  ${eye(112, 50, 4)}
  <path d="M124 54 L 134 57 L 124 60Z" fill="#26262a"/>
  <path d="M70 116 L 68 130 M84 116 L 86 130" stroke="#6a7480" stroke-width="3.5" stroke-linecap="round"/>`);
}

// ---- food -------------------------------------------------------------------------

const kapy = () => svg(80, 100, `
  <ellipse cx="40" cy="54" rx="24" ry="36" fill="#7a4e2a"/>
  ${[22, 36, 50, 64, 78].map((y, i) => [-14, 0, 14].map((dx) => `<path d="M${40 + dx - 9 + (i % 2) * 5} ${y} Q ${40 + dx + (i % 2) * 5} ${y + 10} ${40 + dx + 9 + (i % 2) * 5} ${y}" fill="#a26a3a" stroke="#5a3418" stroke-width="1.6"/>`).join("")).join("")}
  <rect x="37" y="8" width="6" height="12" rx="3" fill="#5a3418"/>`);

const pahkina = () => svg(80, 80, `
  <path d="M40 10 C 64 14 72 40 66 56 C 60 72 20 72 14 56 C 8 40 16 14 40 10Z" fill="#b5793d"/>
  <path d="M18 54 C 26 66 54 66 62 54 C 60 72 20 72 18 54Z" fill="#e8d2a6"/>
  <path d="M30 20 C 26 34 26 44 30 52" stroke="#e0a868" stroke-width="3" fill="none" stroke-linecap="round"/>`);

const sieni = () => svg(90, 90, `
  <path d="M34 44 L 30 82 C 40 88 52 88 60 82 L 56 44Z" fill="#f2e6cf"/>
  <path d="M4 48 C 6 18 30 6 46 6 C 64 6 86 20 86 48 C 66 54 24 54 4 48Z" fill="#8a4f24"/>
  <path d="M20 26 C 28 16 40 12 50 12" stroke="#b07444" stroke-width="5" fill="none" stroke-linecap="round"/>`);

const terho = () => svg(70, 90, `
  <path d="M14 38 C 14 64 24 84 35 84 C 46 84 56 64 56 38Z" fill="#c9952e"/>
  <path d="M24 46 C 22 60 26 70 30 74" stroke="#e8c070" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M8 36 C 10 20 22 14 35 14 C 48 14 60 20 62 36 C 48 42 22 42 8 36Z" fill="#7a5426"/>
  <path d="M14 30 L 56 30 M18 24 L 52 24" stroke="#5a3a18" stroke-width="2" stroke-dasharray="3 3"/>
  <rect x="32" y="4" width="6" height="12" rx="3" fill="#5a3a18"/>`);

// ---- the land, one picture per season (360 x 330) -----------------------------------

const SEASON = {
  kevat: { sky: ["#a8dcff", "#eef9ff"], hills: "#7fa37a", ground: "#8cc152", ground2: "#6faa3f", spruce: "#2f6b3e",
    crown: ["#b8e06a", "#a2d455"], leaves: "#a07a4a", snow: 0.25, sun: [70, 60] },
  kesa: { sky: ["#6cc0ff", "#d9f1ff"], hills: "#4f8a5a", ground: "#5fae4a", ground2: "#4c9a3c", spruce: "#2a5f37",
    crown: ["#4caf50", "#3d9a42"], leaves: "#8a6a3a", snow: 0, sun: [180, 40] },
  syksy: { sky: ["#9fb8cc", "#ece4d6"], hills: "#8a7a4a", ground: "#a59a42", ground2: "#8a7e34", spruce: "#2a553a",
    crown: ["#f4a62a", "#e2702a"], leaves: "#d9772a", snow: 0, sun: [280, 70] },
  talvi: { sky: ["#bcd0e4", "#f3f7fb"], hills: "#cfdbe8", ground: "#f4f8fc", ground2: "#dde8f3", spruce: "#2a4f3a",
    crown: null, leaves: "#b88a5a", snow: 1, sun: [300, 110] },
};

function spruceTree(x, base, h, w, col, snow) {
  let s = `<rect x="${x - 7}" y="${base - h * 0.3}" width="14" height="${h * 0.3}" fill="#5a3a22"/>`;
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const top = base - h + (h * 0.8 * i) / layers;
    const bot = top + h * 0.34;
    const ww = (w * (i + 2)) / (layers + 1) / 2;
    s += `<path d="M${x} ${top} L ${x + ww} ${bot} Q ${x} ${bot - 8} ${x - ww} ${bot}Z" fill="${col}"/>`;
    if (snow > 0.5) s += `<path d="M${x} ${top + 2} L ${x + ww * 0.75} ${top + (bot - top) * 0.72} Q ${x} ${top + (bot - top) * 0.55} ${x - ww * 0.75} ${top + (bot - top) * 0.72}Z" fill="#fbfdff"/>`;
  }
  return s;
}

function land(name) {
  const c = SEASON[name];
  const W = 360, H = 330;
  let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.sky[0]}"/><stop offset="1" stop-color="${c.sky[1]}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${c.sun[0]}" cy="${c.sun[1]}" r="22" fill="${name === "talvi" ? "#fff2c4" : "#ffe066"}" opacity="0.95"/>`;
  // clouds
  s += `<g fill="#fff" opacity="0.85"><ellipse cx="120" cy="58" rx="30" ry="10"/><ellipse cx="138" cy="50" rx="18" ry="10"/><ellipse cx="236" cy="92" rx="24" ry="8"/></g>`;
  // far forest
  let f = `M0 ${H}`;
  for (let x = 0; x <= W; x += 12) f += ` L${x} ${206 - ((x * 7) % 23) - (x % 24 === 0 ? 14 : 0)}`;
  s += `<path d="${f} L${W} ${H}Z" fill="${c.hills}"/>`;
  // ground
  s += `<path d="M0 252 C 80 238 160 248 220 244 C 280 240 330 236 360 242 L360 ${H} L0 ${H}Z" fill="${c.ground}"/>`;
  s += `<path d="M0 290 C 90 282 200 296 360 284 L360 ${H} L0 ${H}Z" fill="${c.ground2}"/>`;
  if (name === "kevat") s += `<g fill="#f4f8fc" opacity="0.9"><ellipse cx="40" cy="262" rx="26" ry="5"/><ellipse cx="230" cy="256" rx="20" ry="4"/><ellipse cx="300" cy="296" rx="28" ry="5"/></g>`;
  if (name === "kesa" || name === "kevat") {
    const fl = name === "kesa" ? ["#ff5d8f", "#ffd166", "#ffffff", "#9b5de5"] : ["#ffffff", "#9fd3ff"];
    [[150, 270], [178, 262], [240, 276], [26, 300], [292, 268], [196, 300]].forEach(([x, y], i) =>
      (s += `<circle cx="${x}" cy="${y}" r="3.2" fill="${fl[i % fl.length]}"/><circle cx="${x}" cy="${y}" r="1.2" fill="#ffd166"/>`));
  }
  if (name === "syksy") [[150, 272], [184, 266], [236, 280], [30, 300], [120, 296]].forEach(([x, y], i) =>
    (s += `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.4" fill="${i % 2 ? "#e2702a" : "#f4a62a"}" transform="rotate(${i * 40} ${x} ${y})"/>`));
  // the spruce and the bear's den under its roots (centre 95, 290)
  s += spruceTree(70, 300, 240, 130, c.spruce, c.snow);
  s += `<path d="M58 300 C 60 262 130 256 136 300Z" fill="${name === "talvi" ? "#e8eff7" : "#7a5a3a"}"/>`;
  s += `<path d="M72 300 C 74 276 120 274 122 300Z" fill="#2a1d14"/>`;
  s += `<path d="M60 298 L 76 286 M120 286 L 136 300 M84 276 L 70 270 M110 272 L 128 268" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>`;
  if (name === "talvi") s += `<path d="M56 296 C 60 252 132 248 138 296 C 120 268 74 268 56 296Z" fill="#fbfdff"/>`;
  // moss for the jay (centre 150, 314)
  s += `<ellipse cx="150" cy="314" rx="22" ry="8" fill="${name === "talvi" ? "#eef4fa" : "#5d8a3a"}"/>`;
  if (name !== "talvi") s += `<g fill="#79a84a"><circle cx="140" cy="310" r="4"/><circle cx="152" cy="308" r="5"/><circle cx="162" cy="312" r="4"/></g>`;
  // the hedgehog's leaf pile (centre 205, 300)
  s += `<path d="M172 312 C 176 284 236 280 240 312Z" fill="${c.leaves}"/>`;
  [[184, 300], [198, 292], [214, 294], [226, 304], [204, 306], [190, 308]].forEach(([x, y], i) =>
    (s += `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.5" fill="${["#e2702a", "#c9a03a", "#a0522d"][i % 3]}" transform="rotate(${i * 35} ${x} ${y})"/>`));
  if (name === "talvi") s += `<path d="M170 310 C 176 278 236 276 242 310 C 224 296 188 296 170 310Z" fill="#fbfdff"/>`;
  // the badger's burrow (centre 272, 302)
  s += `<path d="M242 316 C 246 282 300 280 304 316Z" fill="${name === "talvi" ? "#e8eff7" : "#8a6a44"}"/>`;
  s += `<ellipse cx="272" cy="306" rx="13" ry="10" fill="#2a1d14"/>`;
  if (name === "talvi") s += `<path d="M240 312 C 248 278 298 276 306 312 C 296 290 250 290 240 312Z" fill="#fbfdff"/>`;
  // the tree with the squirrel's hole (330, 170) and the branch (y 128)
  s += `<rect x="318" y="30" width="24" height="270" rx="8" fill="#e9e4da"/>`;
  [[322, 70], [334, 110], [320, 150], [336, 200], [324, 240], [334, 270]].forEach(([x, y]) => (s += `<rect x="${x}" y="${y}" width="10" height="4" rx="2" fill="#2b2b2b"/>`));
  s += `<path d="M322 128 C 300 124 270 126 240 118" stroke="#d8d2c6" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M330 60 L 300 30 M330 80 L 356 48 M330 40 L 344 10" stroke="#d8d2c6" stroke-width="5" stroke-linecap="round"/>`;
  if (c.crown) {
    const r = name === "kevat" ? 0.7 : 1;
    [[300, 52, 36], [340, 40, 32], [322, 20, 30], [280, 86, 26], [352, 86, 22]].forEach(([x, y, rr], i) =>
      (s += `<circle cx="${x}" cy="${y}" r="${rr * r}" fill="${c.crown[i % 2]}" opacity="0.95"/>`));
  } else {
    s += `<path d="M322 128 C 300 124 270 126 240 118" stroke="#fbfdff" stroke-width="3" fill="none" stroke-linecap="round" transform="translate(0,-4)"/>`;
  }
  s += `<ellipse cx="330" cy="170" rx="9" ry="13" fill="#2a1d14"/>`;
  // the shore
  s += `<path d="M0 318 C 120 314 240 320 360 316 L360 ${H} L0 ${H}Z" fill="${name === "talvi" ? "#e3ecf5" : "#d9c08a"}"/>`;
  return svg(W, H, s);
}

const ART = {
  janis_kesa: janis({ body: "#9a7350", shade: "#84603f", belly: "#e6d3b8", tail: "#f4ece0", ear: "#e8b4a0" }),
  janis_talvi: janis({ body: "#f7f9fc", shade: "#e4ebf3", belly: "#ffffff", tail: "#ffffff", ear: "#f2c8c0", line: "#a9b8c9" }),
  karppa_kesa: karppa({ body: "#8b5a2b", belly: "#f6e8c4", ear: "#e8b4a0" }),
  karppa_talvi: karppa({ body: "#fbfbf7", belly: "#fbfbf7", ear: "#f2c8c0", line: "#a9b8c9" }),
  riekko_kesa: riekko({ body: "#8a5a35", belly: "#f4f1ea", wing: "#f4f4f2", head: "#7a4a2a", feet: "#f4f4f2", spots: "#5e3a20" }),
  riekko_talvi: riekko({ body: "#fbfcfe", belly: "#ffffff", wing: "#fbfcfe", head: "#fbfcfe", feet: "#ffffff", line: "#a9b8c9" }),
  orava_kesa: orava({ body: "#c8602a", tail: "#b9541f", belly: "#f6e2c4", dark: "#7a3410", tuft: 2 }),
  orava_talvi: orava({ body: "#8e6e60", tail: "#7d5f52", belly: "#efe6dc", dark: "#3e2a22", tuft: 10 }),
  karhu: karhu(),
  karhu_uni: karhuUni(),
  siili: siili(),
  siili_uni: siiliUni(),
  sammakko: sammakko({ body: "#8f8f45", belly: "#e3d9a0", dark: "#5d5d2a" }),
  sammakko_uni: sammakko({ body: "#6f6e3c", belly: "#b8ad7a", dark: "#4a4a24", sleep: true }),
  mayra: mayra({}),
  mayra_uni: mayra({ sleep: true }),
  narhi: narhi(),
  kurki: kurki(),
  paasky: paasky(),
  tiainen: tiainen(),
  kapy: kapy(),
  pahkina: pahkina(),
  sieni: sieni(),
  terho: terho(),
  maa_kevat: land("kevat"),
  maa_kesa: land("kesa"),
  maa_syksy: land("syksy"),
  maa_talvi: land("talvi"),
};

module.exports = { ART };
