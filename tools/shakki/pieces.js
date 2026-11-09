// Draws the chess pieces of games/shakki (our own art): cheerful pieces with
// eyes, as SVG, and renders them to games/shakki/img/<w|b><p|n|b|r|q|k>.png
// in Chromium.  node tools/shakki/pieces.js   (also writes the SVGs beside
// the PNGs in tools/shakki/svg/ for editing)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SIZE = 128;
const SIDES = {
  w: { top: "#fffaf0", bottom: "#f1d7a8", line: "#6b4423", shade: "#e2bd82", cheek: "#ffb4a2", eye: "#3b2414" },
  b: { top: "#6d5fa3", bottom: "#3a2f63", line: "#1d1536", shade: "#2c2350", cheek: "#ff8fab", eye: "#1d1536" },
};

const circle = (cx, cy, r) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const BASE = "M 22 93 L 78 93 Q 84 93 84 87 L 84 85 Q 84 79 77 79 L 23 79 Q 16 79 16 85 L 16 87 Q 16 93 22 93 Z";

function face(c, x, y, opts = {}) {
  const gap = opts.gap || 6, r = opts.r || 3.4;
  const eyes = opts.one ? [x] : [x - gap, x + gap];
  let s = "";
  for (const ex of eyes) {
    s += `<ellipse cx="${ex}" cy="${y}" rx="${r}" ry="${r * 1.25}" fill="#ffffff" stroke="${c.line}" stroke-width="1.6"/>`;
    s += `<circle cx="${ex + 0.6}" cy="${y + 0.8}" r="${r * 0.55}" fill="${c.eye}"/>`;
    s += `<circle cx="${ex + 1.4}" cy="${y - 0.4}" r="${r * 0.2}" fill="#ffffff"/>`;
  }
  if (!opts.one) {
    s += `<ellipse cx="${x - gap - 3}" cy="${y + 6}" rx="3" ry="1.8" fill="${c.cheek}" opacity="0.8"/>`;
    s += `<ellipse cx="${x + gap + 3}" cy="${y + 6}" rx="3" ry="1.8" fill="${c.cheek}" opacity="0.8"/>`;
    s += `<path d="M ${x - 3.5} ${y + 5.5} Q ${x} ${y + 9} ${x + 3.5} ${y + 5.5}" fill="none" stroke="${c.line}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  return s;
}

// one shape filled with the side's gradient and outlined
const part = (d, extra = "") => `<path d="${d}" fill="url(#g)" stroke="var(--line)" stroke-width="3.2" stroke-linejoin="round" ${extra}/>`;

const PIECES = {
  p: (c) =>
    part(BASE) +
    part("M 33 80 Q 35 62 43 53 L 57 53 Q 65 62 67 80 Z") +
    part("M 36 54 Q 36 49 50 49 Q 64 49 64 54 Q 64 58 50 58 Q 36 58 36 54 Z") +
    part(circle(50, 35, 15)) + face(c, 50, 34, { gap: 5.5, r: 3 }),
  r: (c) =>
    part(BASE) +
    part("M 31 80 L 35 42 L 65 42 L 69 80 Z") +
    `<path d="M 44 80 L 44 71 Q 50 63 56 71 L 56 80 Z" fill="${c.shade}" stroke="${c.line}" stroke-width="2.2"/>` +
    part("M 27 43 L 27 20 L 37 20 L 37 28 L 45 28 L 45 20 L 55 20 L 55 28 L 63 28 L 63 20 L 73 20 L 73 43 Z") +
    face(c, 50, 54, { gap: 6.5 }),
  n: (c) =>
    part(BASE) +
    part("M 28 80 Q 28 62 41 53 Q 33 52 25 57 Q 15 56 17 46 Q 26 31 38 22 L 39 10 L 48 19 Q 72 20 74 46 Q 76 64 72 80 Z") +
    `<path d="M 50 21 Q 68 26 69 46 Q 70 60 68 74" fill="none" stroke="${c.shade}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M 50 21 Q 68 26 69 46 Q 70 60 68 74" fill="none" stroke="${c.line}" stroke-width="1.6" stroke-dasharray="4 5" stroke-linecap="round"/>` +
    `<circle cx="22" cy="49" r="1.8" fill="${c.line}"/>` +
    `<ellipse cx="34" cy="42" rx="3" ry="1.8" fill="${c.cheek}" opacity="0.8"/>` +
    face(c, 37, 33, { one: true, r: 3.6 }),
  b: (c) =>
    part(BASE) +
    part("M 33 80 Q 37 65 43 60 L 57 60 Q 63 65 67 80 Z") +
    part("M 37 61 Q 37 56 50 56 Q 63 56 63 61 Q 63 65 50 65 Q 37 65 37 61 Z") +
    part("M 50 15 Q 71 31 63 49 Q 58 58 50 58 Q 42 58 37 49 Q 29 31 50 15 Z") +
    `<path d="M 56 24 L 48 35" fill="none" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/>` +
    part(circle(50, 12, 5)) +
    face(c, 50, 44, { gap: 5.5, r: 3 }),
  q: (c) =>
    part(BASE) +
    part("M 31 80 Q 37 60 41 48 L 59 48 Q 63 60 69 80 Z") +
    part("M 29 48 L 24 22 L 37 34 L 43 15 L 50 31 L 57 15 L 63 34 L 76 22 L 71 48 Z") +
    part(circle(24, 20, 4)) + part(circle(43, 13, 4)) + part(circle(57, 13, 4)) + part(circle(76, 20, 4)) +
    `<circle cx="50" cy="66" r="4" fill="#ef476f" stroke="${c.line}" stroke-width="2"/>` +
    face(c, 50, 39, { gap: 6.5 }),
  k: (c) =>
    part(BASE) +
    part("M 31 80 Q 37 60 41 50 L 59 50 Q 63 60 69 80 Z") +
    part("M 30 50 L 28 30 Q 50 21 72 30 L 70 50 Z") +
    part("M 46 4 L 54 4 L 54 10 L 60 10 L 60 17 L 54 17 L 54 25 L 46 25 L 46 17 L 40 17 L 40 10 L 46 10 Z") +
    `<circle cx="50" cy="66" r="4" fill="#06d6a0" stroke="${c.line}" stroke-width="2"/>` +
    face(c, 50, 38, { gap: 7 }),
};

function svg(side, p) {
  const c = SIDES[side];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${SIZE}" height="${SIZE}" style="--line:${c.line}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bottom}"/></linearGradient></defs>
<g transform="translate(0 1)">${PIECES[p](c)}</g></svg>`;
}

(async () => {
  const root = path.join(__dirname, "../..");
  const out = path.join(root, "games/shakki/img");
  const svgDir = path.join(__dirname, "svg");
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(svgDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  for (const side of ["w", "b"]) {
    for (const p of Object.keys(PIECES)) {
      const s = svg(side, p);
      fs.writeFileSync(path.join(svgDir, side + p + ".svg"), s);
      await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
      await page.screenshot({ path: path.join(out, side + p + ".png"), omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
    }
  }
  await browser.close();
  console.log("pieces →", out);
})();
