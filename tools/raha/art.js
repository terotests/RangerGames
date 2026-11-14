// Rahakauppa: the coins and notes as SVG, drawn here by hand. They are our own
// simplified pictures, not copies of the real euro designs: the colours, the
// metals (copper, gold, silver and gold rings) and the relative sizes are like
// the real money, so a child learns to recognise them, but the motifs are
// simple stars, waves and arches. tools/raha/render.js turns them into
// games/raha/img/*.png.
//
// A coin is drawn filling its picture (the game scales it to the coin's real
// size); a note's picture has the note's real proportions.

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// metals: [light, mid, dark, text]
const COPPER = ["#f2a66b", "#c8713a", "#8a4520", "#6b3215"];
const GOLD = ["#ffe58a", "#e2b43c", "#a67a12", "#6e4f05"];
const SILVER = ["#f4f6f8", "#c3c8ce", "#808890", "#4a5058"];

function grad(id, m) {
  return `<radialGradient id="${id}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${m[0]}"/><stop offset="0.55" stop-color="${m[1]}"/><stop offset="1" stop-color="${m[2]}"/></radialGradient>`;
}

// little stars on a circle (a ring of stars, like on every euro coin)
function stars(cx, cy, r, n, size, color, skipFrom, skipTo) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const deg = ((i * 360) / n) % 360;
    if (skipFrom !== undefined && deg > skipFrom && deg < skipTo) continue;
    out += star(cx + r * Math.cos(a), cy + r * Math.sin(a), size, color);
  }
  return out;
}
function star(x, y, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push((x + rr * Math.cos(a)).toFixed(1) + "," + (y + rr * Math.sin(a)).toFixed(1));
  }
  return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
}

const FONT = `font-family="Arial Rounded MT Bold, Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle"`;

// a one-metal coin: 5, 10, 20, 50 cents
function coin(value, metal, notches) {
  const S = 200, c = S / 2;
  let edge = `<circle cx="${c}" cy="${c}" r="97" fill="${metal[2]}"/>`;
  if (notches) {
    // seven dents in the edge (the real 20 cent coin can be felt this way)
    let d = "";
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
      d += `<circle cx="${(c + 98 * Math.cos(a)).toFixed(1)}" cy="${(c + 98 * Math.sin(a)).toFixed(1)}" r="9" fill="#000"/>`;
    }
    edge = `<mask id="m"><rect width="${S}" height="${S}" fill="#fff"/>${d.split("#000").join("#000")}</mask><circle cx="${c}" cy="${c}" r="97" fill="${metal[2]}" mask="url(#m)"/>`;
  }
  return svg(S, S, `<defs>${grad("g", metal)}</defs>${edge}
  <circle cx="${c}" cy="${c}" r="88" fill="url(#g)" ${notches ? 'mask="url(#m)"' : ""}/>
  <circle cx="${c}" cy="${c}" r="80" fill="none" stroke="${metal[2]}" stroke-width="3" opacity="0.6"/>
  ${stars(c, c, 66, 12, 6, metal[3], 100, 260)}
  <path d="M40 112 Q 70 98 100 112 T 160 112" stroke="${metal[2]}" stroke-width="4" fill="none" opacity="0.5"/>
  <text x="${c}" y="104" font-size="78" fill="${metal[3]}" ${FONT}>${value}</text>
  <text x="${c}" y="150" font-size="26" fill="${metal[3]}" ${FONT} letter-spacing="2">${value === 1 ? "CENT" : "CENT"}</text>`);
}

// a two-metal coin: 1 € (silver middle, gold ring) and 2 € (gold middle, silver ring)
function bicolour(value, ring, mid) {
  const S = 200, c = S / 2;
  return svg(S, S, `<defs>${grad("r", ring)}${grad("m", mid)}</defs>
  <circle cx="${c}" cy="${c}" r="97" fill="${ring[2]}"/>
  <circle cx="${c}" cy="${c}" r="91" fill="url(#r)"/>
  ${stars(c, c, 80, 12, 6.5, ring[3])}
  <circle cx="${c}" cy="${c}" r="66" fill="${mid[2]}"/>
  <circle cx="${c}" cy="${c}" r="62" fill="url(#m)"/>
  <path d="M48 116 Q 74 102 100 116 T 152 116" stroke="${mid[2]}" stroke-width="4" fill="none" opacity="0.5"/>
  <text x="${c}" y="108" font-size="80" fill="${mid[3]}" ${FONT}>${value}</text>
  <text x="${c}" y="144" font-size="24" fill="${mid[3]}" ${FONT} letter-spacing="2">EURO</text>`);
}

// a note: real proportions (mm x 2), its colour, the value big in two corners,
// a simple arch window and a bridge (made-up shapes, the same idea for every
// note but each with its own number of arches)
function note(value, w, h, main, light, dark, arches) {
  const W = w * 2, H = h * 2;
  let archs = "";
  const aw = 34, ax0 = W * 0.36;
  for (let i = 0; i < arches; i++) {
    const x = ax0 + i * (aw + 6);
    archs += `<path d="M${x} ${H * 0.78} L${x} ${H * 0.42} Q ${x + aw / 2} ${H * 0.24} ${x + aw} ${H * 0.42} L${x + aw} ${H * 0.78} Z" fill="${light}" stroke="${dark}" stroke-width="3"/>`;
    archs += `<path d="M${x + 7} ${H * 0.78} L${x + 7} ${H * 0.46} Q ${x + aw / 2} ${H * 0.33} ${x + aw - 7} ${H * 0.46} L${x + aw - 7} ${H * 0.78} Z" fill="${main}" opacity="0.55"/>`;
  }
  const bx = ax0 - 6, bw = arches * (aw + 6) + 6;
  return svg(W, H, `<defs><linearGradient id="n" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${main}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="12" fill="url(#n)" stroke="${dark}" stroke-width="4"/>
  <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="8" fill="none" stroke="${dark}" stroke-width="2" opacity="0.45"/>
  <path d="M14 ${H * 0.62} Q ${W * 0.25} ${H * 0.5} ${W * 0.5} ${H * 0.62} T ${W - 14} ${H * 0.62}" stroke="${light}" stroke-width="10" fill="none" opacity="0.7"/>
  <rect x="${bx}" y="${H * 0.78}" width="${bw}" height="10" fill="${dark}" opacity="0.8"/>
  ${archs}
  <circle cx="${W * 0.17}" cy="${H * 0.62}" r="${H * 0.2}" fill="${light}" opacity="0.8" stroke="${dark}" stroke-width="2"/>
  ${stars(W * 0.17, H * 0.62, H * 0.15, 12, 5, dark)}
  <text x="${W * 0.17}" y="${H * 0.33}" font-size="${H * 0.28}" fill="${dark}" ${FONT}>${value}</text>
  <text x="${W - 50}" y="${H - 22}" font-size="${H * 0.36}" fill="#ffffff" stroke="${dark}" stroke-width="3" paint-order="stroke" ${FONT}>${value}</text>
  <text x="${W * 0.62}" y="${H * 0.2}" font-size="${H * 0.13}" fill="${dark}" ${FONT} letter-spacing="4">EURO</text>`);
}

const ART = {
  c5: coin(5, COPPER, false),
  c10: coin(10, GOLD, false),
  c20: coin(20, GOLD, true),
  c50: coin(50, GOLD, false),
  e1: bicolour(1, GOLD, SILVER),
  e2: bicolour(2, SILVER, GOLD),
  e5: note(5, 120, 62, "#a9b4a6", "#e3e8df", "#56614f", 1),
  e10: note(10, 127, 67, "#ec8d84", "#fbd8d2", "#9b3329", 2),
  e20: note(20, 133, 72, "#7fa5e0", "#d6e3f8", "#2d4f8f", 3),
  e50: note(50, 140, 77, "#f4ab66", "#fde2c4", "#a35a14", 3),
  e100: note(100, 147, 77, "#7fc784", "#d7f0d4", "#2f7a35", 3),
};

// the launcher's tile (128 x 128): a 10 € note with a 2 € coin on it
function icon() {
  const n = ART.e10, c = ART.e2;
  const inner = (x) => x.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return svg(128, 128, `<g transform="translate(2 18) rotate(-14 62 34) scale(${124 / 254})">${inner(n).split('id="n"').join('id="n2"').split("url(#n)").join("url(#n2)")}</g>
  <g transform="translate(52 52) scale(${76 / 200})">${inner(c)}</g>`);
}
ART.icon = icon();

module.exports = { ART };
