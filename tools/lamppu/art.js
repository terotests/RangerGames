// Draws the parts of games/lamppu (our own vector art, modelled on photos of
// real parts): a clear incandescent bulb (off, lit, burnt), its socket, three
// real battery types (AA 1.5 V, flat 4.5 V 3LR12, 9 V PP3), a wall light
// switch (off/on), carbon-film resistors whose length grows with the
// resistance, and the light circuit board.  No brand logos.
//   node tools/lamppu/art.js   → games/lamppu/img/*.png (SVGs in tools/lamppu/svg/)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SCALE = 3; // pixels per game pixel

// ---- bulb: 60 × 96 game px ----------------------------------------------------

const GLASS = "M 30 4 C 12 4 3 18 3 32 C 3 44 10 51 16 57 C 19 60 19 63 19 66 L 41 66 C 41 63 41 60 44 57 C 50 51 57 44 57 32 C 57 18 48 4 30 4 Z";

function filament(state) {
  const hot = state === "on", burnt = state === "burnt";
  const wire = burnt ? "#2a2a2a" : hot ? "#fff8d6" : "#6b6b6b";
  const coil = burnt ? "#1a1a1a" : hot ? "#ffffff" : "#8a5a2b";
  let s = "";
  // glass stem and the two support wires
  s += `<path d="M 25 66 L 26 52 Q 30 48 34 52 L 35 66 Z" fill="${burnt ? "#555" : "#ffffff"}" opacity="${burnt ? 0.5 : 0.55}" stroke="${burnt ? "#333" : "#c9d3dc"}" stroke-width="0.6"/>`;
  s += `<path d="M 27 60 L 21 33" stroke="${wire}" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M 33 60 L 39 33" stroke="${wire}" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M 30 50 L 30 26" stroke="${burnt ? "#2a2a2a" : "#9aa5ae"}" stroke-width="0.7" fill="none"/>`;
  s += `<path d="M 30 26 L 24 30 M 30 26 L 36 30" stroke="${burnt ? "#2a2a2a" : "#9aa5ae"}" stroke-width="0.6" fill="none"/>`;
  // the coiled filament between the wires
  let d = "M 21 33";
  const n = 9;
  for (let k = 1; k <= n; k++) {
    const x = 21 + (18 * k) / n;
    if (burnt && k === 5) { d += ` M ${x} ${k % 2 ? 31 : 35}`; continue; }
    d += ` L ${x.toFixed(2)} ${k % 2 ? 30.5 : 35.5}`;
  }
  if (hot) s += `<path d="${d}" stroke="#ffd166" stroke-width="5" fill="none" stroke-linejoin="round" opacity="0.6"/>`;
  s += `<path d="${d}" stroke="${coil}" stroke-width="1.4" fill="none" stroke-linejoin="round"/>`;
  return s;
}

function bulb(state) {
  const defs = `
  <radialGradient id="gl" cx="0.38" cy="0.3" r="0.75">
    ${state === "on" ? `<stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#fff6c4"/><stop offset="1" stop-color="#ffc94a"/>`
      : state === "burnt" ? `<stop offset="0" stop-color="#8a8a8a"/><stop offset="0.6" stop-color="#4a4a4a"/><stop offset="1" stop-color="#262626"/>`
      : `<stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#eef3f7"/><stop offset="1" stop-color="#c6d2dc"/>`}
  </radialGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7d8790"/><stop offset="0.3" stop-color="#e9edf0"/><stop offset="0.55" stop-color="#b9c1c8"/><stop offset="1" stop-color="#5d666e"/>
  </linearGradient>`;
  let s = "";
  s += `<path d="${GLASS}" fill="url(#gl)" stroke="${state === "burnt" ? "#1e1e1e" : state === "on" ? "#f2b632" : "#9fb0bf"}" stroke-width="1.2"/>`;
  s += filament(state);
  // glass highlights
  if (state !== "burnt") {
    s += `<path d="M 13 22 Q 16 11 27 8" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"/>`;
    s += `<path d="M 10 33 Q 10 30 11 28" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>`;
  } else {
    s += `<path d="M 14 20 Q 17 12 26 9" stroke="#bdbdbd" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>`;
    s += `<path d="M 36 12 L 41 20 L 38 24 L 44 31" stroke="#d0d0d0" stroke-width="0.9" fill="none" opacity="0.8"/>`;
  }
  // E27-style screw base: collar, threads, black insulator, tip contact
  s += `<path d="M 18 65 L 42 65 L 42 69 L 18 69 Z" fill="url(#metal)" stroke="#4c545b" stroke-width="0.8"/>`;
  for (let k = 0; k < 4; k++) {
    const y = 69 + k * 4;
    s += `<path d="M 18 ${y} Q 30 ${y + 1.2} 42 ${y} Q 43.5 ${y + 2} 42 ${y + 4} Q 30 ${y + 5.2} 18 ${y + 4} Q 16.5 ${y + 2} 18 ${y} Z" fill="url(#metal)" stroke="#4c545b" stroke-width="0.7"/>`;
  }
  s += `<path d="M 19 85 L 41 85 L 37 90 L 23 90 Z" fill="#1d1d1d"/>`;
  s += `<path d="M 25 90 L 35 90 L 33.5 94 Q 30 95.5 26.5 94 Z" fill="url(#metal)" stroke="#4c545b" stroke-width="0.6"/>`;
  return { w: 60, h: 96, defs, body: s };
}

// ---- socket under the bulb: 64 × 22 ----------------------------------------------

function socket() {
  const defs = `<linearGradient id="cer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8dde3"/></linearGradient>
  <radialGradient id="brass" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff1b8"/><stop offset="1" stop-color="#b8892a"/></radialGradient>`;
  let s = `<rect x="6" y="3" width="52" height="17" rx="5" fill="url(#cer)" stroke="#8d99a6" stroke-width="1"/>`;
  s += `<rect x="18" y="0.5" width="28" height="6" rx="2" fill="#cfd5db" stroke="#8d99a6" stroke-width="0.8"/>`;
  for (const x of [13, 51]) {
    s += `<circle cx="${x}" cy="12" r="4.2" fill="url(#brass)" stroke="#7a5a14" stroke-width="0.8"/>`;
    s += `<path d="M ${x - 2.6} 12 L ${x + 2.6} 12" stroke="#6b4c0c" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  return { w: 64, h: 22, defs, body: s };
}

// ---- batteries ----------------------------------------------------------------------

const label = (x, y, t, size, color, extra = "") =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="${color}" text-anchor="middle" ${extra}>${t}</text>`;

// AA lying down: 64 × 20, minus end at the left, plus nub at the right
function batAA() {
  const defs = `<linearGradient id="cyl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1f7a4d"/><stop offset="0.28" stop-color="#5fd39a"/><stop offset="0.55" stop-color="#249a5f"/><stop offset="1" stop-color="#0f4a2d"/></linearGradient>
  <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b3b9bf"/><stop offset="0.3" stop-color="#ffffff"/><stop offset="0.6" stop-color="#cfd5da"/><stop offset="1" stop-color="#7d858c"/></linearGradient>`;
  let s = "";
  s += `<rect x="1" y="1.5" width="3" height="17" rx="1.5" fill="url(#band)" stroke="#5c646b" stroke-width="0.5"/>`;
  s += `<rect x="3" y="1" width="54" height="18" rx="2.5" fill="url(#cyl)" stroke="#0b3a23" stroke-width="0.7"/>`;
  s += `<rect x="47" y="1" width="10" height="18" fill="url(#band)" stroke="#5c646b" stroke-width="0.5"/>`;
  s += `<rect x="57" y="6" width="5" height="8" rx="1.5" fill="url(#band)" stroke="#5c646b" stroke-width="0.6"/>`;
  s += label(26, 13.6, "1.5V", 8.5, "#ffffff");
  s += label(42, 13.4, "+", 9, "#ffffff");
  s += label(8.5, 13.4, "−", 8, "#ffffff");
  return { w: 64, h: 20, defs, body: s, plus: [62, 10], minus: [1, 10] };
}

// flat 4.5 V (3LR12) standing: 46 × 66, two brass tabs on top (short = plus)
function bat45() {
  const defs = `<linearGradient id="box" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#b8321f"/><stop offset="0.25" stop-color="#f05a3c"/><stop offset="0.8" stop-color="#d9442a"/><stop offset="1" stop-color="#8e2414"/></linearGradient>
  <linearGradient id="tab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a87b1f"/><stop offset="0.5" stop-color="#ffe9a3"/><stop offset="1" stop-color="#a87b1f"/></linearGradient>`;
  let s = "";
  // long minus tab (left, bent at the tip) and short plus tab (right)
  s += `<path d="M 9 22 L 9 6 Q 9 3 12 3 L 18 3 L 18 6 L 13 6 L 13 22 Z" fill="url(#tab)" stroke="#7a5a14" stroke-width="0.6"/>`;
  s += `<rect x="31" y="12" width="5" height="10" fill="url(#tab)" stroke="#7a5a14" stroke-width="0.6"/>`;
  s += `<rect x="1" y="20" width="44" height="45" rx="3" fill="url(#box)" stroke="#6e1b0f" stroke-width="0.8"/>`;
  s += `<rect x="1" y="20" width="44" height="6" rx="2" fill="#2b2d42"/>`;
  s += `<rect x="1" y="45" width="44" height="11" fill="#ffd166"/>`;
  s += label(23, 54, "4.5V", 9.5, "#7a1e10");
  s += label(12, 38, "−", 11, "#ffffff");
  s += label(34, 38, "+", 11, "#ffffff");
  return { w: 46, h: 66, defs, body: s, plus: [33.5, 12], minus: [16, 4.5] };
}

// 9 V (PP3) standing: 30 × 58, snap terminals on top (small round = plus)
function bat9() {
  const defs = `<linearGradient id="nine" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#1b2a4a"/><stop offset="0.3" stop-color="#3f5f9a"/><stop offset="0.75" stop-color="#26406e"/><stop offset="1" stop-color="#101a30"/></linearGradient>
  <linearGradient id="top" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d858c"/><stop offset="0.4" stop-color="#eef1f3"/><stop offset="1" stop-color="#6c747b"/></linearGradient>`;
  let s = "";
  // snaps: hexagon minus (left), round plus (right)
  s += `<path d="M 6 8 L 8 4.5 L 12 4.5 L 14 8 L 12 11.5 L 8 11.5 Z" fill="url(#top)" stroke="#4c545b" stroke-width="0.7"/>`;
  s += `<rect x="18" y="4" width="6" height="7" rx="3" fill="url(#top)" stroke="#4c545b" stroke-width="0.7"/>`;
  s += `<rect x="1" y="9" width="28" height="7" rx="2" fill="url(#top)" stroke="#4c545b" stroke-width="0.7"/>`;
  s += `<rect x="1" y="14" width="28" height="43" rx="3" fill="url(#nine)" stroke="#0a1222" stroke-width="0.8"/>`;
  s += `<rect x="1" y="40" width="28" height="8" fill="#ffd166"/>`;
  s += label(15, 34, "9V", 11, "#ffffff");
  s += label(15, 46.6, "PP3", 6.5, "#1b2a4a");
  return { w: 30, h: 58, defs, body: s, plus: [21, 4], minus: [10, 4.5] };
}

// ---- wall light switch: 46 × 54 ------------------------------------------------------

function lightSwitch(on) {
  const defs = `<linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e7ec"/></linearGradient>
  <linearGradient id="rk" x1="0" y1="0" x2="0" y2="1">${on
    ? `<stop offset="0" stop-color="#d5dbe1"/><stop offset="0.5" stop-color="#f2f4f6"/><stop offset="1" stop-color="#ffffff"/>`
    : `<stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#f2f4f6"/><stop offset="1" stop-color="#d5dbe1"/>`}</linearGradient>`;
  let s = `<rect x="2" y="3" width="42" height="49" rx="7" fill="#000" opacity="0.15"/>`;
  s += `<rect x="1" y="1" width="42" height="49" rx="7" fill="url(#plate)" stroke="#9aa5b1" stroke-width="1"/>`;
  s += `<rect x="9" y="8" width="26" height="35" rx="4" fill="#c3cad2"/>`;
  s += `<rect x="10" y="9" width="24" height="33" rx="3.5" fill="url(#rk)" stroke="#8d99a6" stroke-width="0.8"/>`;
  s += `<path d="M 11 25.5 L 33 25.5" stroke="#b5bec7" stroke-width="0.8"/>`;
  // the pressed half is shaded, and a small lamp shows the state
  s += on ? `<rect x="10.5" y="9.5" width="23" height="16" rx="3" fill="#000" opacity="0.08"/>`
          : `<rect x="10.5" y="25.5" width="23" height="16" rx="3" fill="#000" opacity="0.08"/>`;
  s += `<circle cx="22" cy="${on ? 17 : 34}" r="3" fill="${on ? "#ffb703" : "#ced4da"}" stroke="${on ? "#c77d00" : "#9aa5b1"}" stroke-width="0.7"/>`;
  return { w: 46, h: 54, defs, body: s };
}

// ---- resistors ---------------------------------------------------------------------------

const BAND = ["#1b1b1b", "#7f4f24", "#d62828", "#f77f00", "#ffd60a", "#2a9d8f", "#3a86ff", "#7b2cbf", "#8d99ae", "#ffffff"];
const GOLD = "#d4a017";
function bands(ohm) {
  if (ohm < 10) return [BAND[Math.floor(ohm)], BAND[Math.round((ohm * 10) % 10)], GOLD, GOLD];
  const s = String(Math.round(ohm));
  return [BAND[+s.charAt(0)], BAND[+s.charAt(1)], BAND[s.length - 2], GOLD];
}
const RESS = [1, 2.2, 4.7, 10, 22, 47, 100];
// body length in game px: the bigger the resistance, the longer the resistor
const bodyLen = (ohm) => Math.round(16 + 22 * Math.log10(ohm * 2.2));
// and thicker too
const thick = (ohm) => 0.85 + 0.18 * Math.log10(ohm);
const LEAD = 9;

function resistor(ohm) {
  const Lb = bodyLen(ohm), H = 13, w = Lb + 2 * LEAD, cy = H / 2 + 0.5;
  const x0 = LEAD, x1 = LEAD + Lb, e = 5.5; // the bulging end caps
  const mid = 4.2; // half height of the waist
  const body = `M ${x0 + 1} ${cy - 5.5} Q ${x0 + e} ${cy - 6.8} ${x0 + e + 1.5} ${cy - mid} L ${x1 - e - 1.5} ${cy - mid} Q ${x1 - e} ${cy - 6.8} ${x1 - 1} ${cy - 5.5}
    Q ${x1 + 1} ${cy} ${x1 - 1} ${cy + 5.5} Q ${x1 - e} ${cy + 6.8} ${x1 - e - 1.5} ${cy + mid} L ${x0 + e + 1.5} ${cy + mid} Q ${x0 + e} ${cy + 6.8} ${x0 + 1} ${cy + 5.5} Q ${x0 - 1} ${cy} ${x0 + 1} ${cy - 5.5} Z`;
  const defs = `<linearGradient id="bd" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c9ad78"/><stop offset="0.25" stop-color="#fbebc4"/><stop offset="0.6" stop-color="#e3c893"/><stop offset="1" stop-color="#a88a55"/></linearGradient>
  <linearGradient id="ld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d858c"/><stop offset="0.45" stop-color="#eef1f3"/><stop offset="1" stop-color="#6c747b"/></linearGradient>
  <linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.25"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient>
  <clipPath id="clip"><path d="${body}"/></clipPath>`;
  let s = `<rect x="0" y="${cy - 1.2}" width="${w}" height="2.4" rx="1.2" fill="url(#ld)"/>`;
  s += `<path d="${body}" fill="url(#bd)" stroke="#7a6038" stroke-width="0.7"/>`;
  const c = bands(ohm);
  const bw = Math.max(2.4, Lb * 0.075);
  const at = [x0 + Lb * 0.24, x0 + Lb * 0.37, x0 + Lb * 0.5, x0 + Lb * 0.76];
  let b = "";
  for (let k = 0; k < 4; k++) b += `<rect x="${(at[k] - bw / 2).toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${H + 1}" fill="${c[k]}"/>`;
  s += `<g clip-path="url(#clip)">${b}<rect x="0" y="0" width="${w}" height="${H + 1}" fill="url(#sh)"/></g>`;
  const t = thick(ohm);
  return { w, h: Math.round((H + 1) * t * SCALE) / SCALE, defs, body: `<g transform="scale(1 ${t})">${s}</g>` };
}

// ---- the board: a light, perforated circuit board 344 × 272 ------------------------------

function board() {
  const W = 344, H = 272;
  let s = `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="16" fill="#eef8f1" stroke="#a9d8b8" stroke-width="3"/>`;
  let holes = "";
  for (let y = 14; y < H - 8; y += 12) for (let x = 14; x < W - 8; x += 12) holes += `<circle cx="${x}" cy="${y}" r="1.3"/>`;
  s += `<g fill="#cfe8d7">${holes}</g>`;
  // mounting screws in the corners
  for (const [x, y] of [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]]) {
    s += `<circle cx="${x}" cy="${y}" r="4.5" fill="#dfe5ea" stroke="#9aa5b1" stroke-width="1"/><path d="M ${x - 2.5} ${y} L ${x + 2.5} ${y}" stroke="#7d8790" stroke-width="1.2"/>`;
  }
  return { w: W, h: H, defs: "", body: s };
}

// ---- render ------------------------------------------------------------------------------

function svgOf(a) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${a.w} ${a.h}" width="${a.w * SCALE}" height="${a.h * SCALE}"><defs>${a.defs}</defs>${a.body}</svg>`;
}

(async () => {
  const root = path.join(__dirname, "../..");
  const out = path.join(root, "games/lamppu/img");
  const svgDir = path.join(__dirname, "svg");
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(svgDir, { recursive: true });
  const parts = {
    bulb_off: bulb("off"), bulb_on: bulb("on"), bulb_burnt: bulb("burnt"), socket: socket(),
    bat_aa: batAA(), bat_45: bat45(), bat_9: bat9(),
    switch_off: lightSwitch(false), switch_on: lightSwitch(true), board: board(),
  };
  for (const r of RESS) parts["res_" + String(r).replace(".", "_")] = resistor(r);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sizes = {};
  for (const [name, a] of Object.entries(parts)) {
    const s = svgOf(a);
    fs.writeFileSync(path.join(svgDir, name + ".svg"), s);
    await page.setViewportSize({ width: Math.round(a.w * SCALE), height: Math.round(a.h * SCALE) });
    await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await page.screenshot({ path: path.join(out, name + ".png"), omitBackground: true, clip: { x: 0, y: 0, width: Math.round(a.w * SCALE), height: Math.round(a.h * SCALE) } });
    sizes[name] = { w: a.w, h: a.h };
    if (a.plus) { sizes[name].plus = a.plus; sizes[name].minus = a.minus; }
  }
  await browser.close();
  // sizes and battery terminals in game px, to copy into game.tsx
  console.log(JSON.stringify(sizes));
})();
