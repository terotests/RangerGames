// Kopterilento: a geography game. Fly a helicopter and find places.
//  - Tampere: the city centre from above (the Liikenneretki map); find
//    Näsinneula, the cathedral, the station … Every place has its picture on
//    the map and on the task card, so a child who can't read plays too.
//  - The globe: first the continents (each its own colour, and its shape on
//    the card), then well-known countries, then harder ones. The globe turns
//    under the helicopter; the place under it counts.
// Hold a finger where you want to fly (or the arrow keys). Finding the place
// gives points, more when it's quick; after a while an arrow shows the way.
//
// Country outlines: Natural Earth (public domain). Tampere map: Tampere Taxi
// Driver's data (OpenStreetMap contributors, ODbL; Tampereen kaupunki CC BY 4.0).
// Data: tools/kopteri/build.py.

import { REGIONS, STAGES, CONTINENT_COLORS, TAMPERE, MAPINFO } from "lib/world";
// place names in English and Spanish (lib/world.ts has the Finnish ones),
// by id in lower case; the spoken prompts are the k_<id> clips of each language
const PLACE_NAMES: any = {
  af: ["Africa", "África"],
  eu: ["Europe", "Europa"],
  as: ["Asia", "Asia"],
  na: ["North America", "América del Norte"],
  sa: ["South America", "América del Sur"],
  oc: ["Australia", "Australia"],
  an: ["Antarctica", "Antártida"],
  fin: ["Finland", "Finlandia"],
  swe: ["Sweden", "Suecia"],
  nor: ["Norway", "Noruega"],
  rus: ["Russia", "Rusia"],
  chn: ["China", "China"],
  usa: ["United States", "Estados Unidos"],
  can: ["Canada", "Canadá"],
  bra: ["Brazil", "Brasil"],
  ind: ["India", "India"],
  aus: ["Australia", "Australia"],
  egy: ["Egypt", "Egipto"],
  jpn: ["Japan", "Japón"],
  mex: ["Mexico", "México"],
  grl: ["Greenland", "Groenlandia"],
  arg: ["Argentina", "Argentina"],
  deu: ["Germany", "Alemania"],
  fra: ["France", "Francia"],
  ita: ["Italy", "Italia"],
  esp: ["Spain", "España"],
  gbr: ["Great Britain", "Gran Bretaña"],
  est: ["Estonia", "Estonia"],
  isl: ["Iceland", "Islandia"],
  zaf: ["South Africa", "Sudáfrica"],
  tur: ["Turkey", "Turquía"],
  idn: ["Indonesia", "Indonesia"],
  mdg: ["Madagascar", "Madagascar"],
  nzl: ["New Zealand", "Nueva Zelanda"],
  chl: ["Chile", "Chile"],
  kaz: ["Kazakhstan", "Kazajistán"],
  mng: ["Mongolia", "Mongolia"],
  sau: ["Saudi Arabia", "Arabia Saudita"],
  pol: ["Poland", "Polonia"],
  ukr: ["Ukraine", "Ucrania"],
  grc: ["Greece", "Grecia"],
  prt: ["Portugal", "Portugal"],
  dnk: ["Denmark", "Dinamarca"],
  lva: ["Latvia", "Letonia"],
  ltu: ["Lithuania", "Lituania"],
  irl: ["Ireland", "Irlanda"],
  irn: ["Iran", "Irán"],
  pak: ["Pakistan", "Pakistán"],
  tha: ["Thailand", "Tailandia"],
  vnm: ["Vietnam", "Vietnam"],
  phl: ["Philippines", "Filipinas"],
  kor: ["South Korea", "Corea del Sur"],
  nga: ["Nigeria", "Nigeria"],
  ken: ["Kenya", "Kenia"],
  mar: ["Morocco", "Marruecos"],
  dza: ["Algeria", "Argelia"],
  col: ["Colombia", "Colombia"],
  per: ["Peru", "Perú"],
  cub: ["Cuba", "Cuba"],
  nasinneula: ["Näsinneula tower", "Torre Näsinneula"],
  tuomiokirkko: ["Cathedral", "Catedral"],
  asema: ["Railway station", "Estación de tren"],
  kauppahalli: ["Market hall", "Mercado"],
  keskustori: ["Central square", "Plaza central"],
  koskikeskus: ["Koskikeskus", "Koskikeskus"],
  finlayson: ["Finlayson", "Finlayson"],
  tampella: ["Tampella", "Tampella"],
  metso: ["Metso library", "Biblioteca Metso"],
  koskipuisto: ["Rapids Park", "Parque de los rápidos"],
  hameenpuisto: ["Hämeenpuisto park", "Parque Hämeenpuisto"],
  nasinpuisto: ["Näsinpuisto park", "Parque Näsinpuisto"],
  pikkukakkonen: ["Pikku Kakkonen park", "Parque Pikku Kakkonen"],
  sorinaukio: ["Sori square playground", "Parque infantil de Sori"],
  tammerkoski: ["Tammerkoski rapids", "Rápidos de Tammerkoski"],
  nasijarvi: ["Lake Näsijärvi", "Lago Näsijärvi"]
};
if (rg.lang !== "fi") {
  const tr = (p: any) => { const n = PLACE_NAMES[String(p.id).toLowerCase()]; if (n) p.name = rg.lang === "en" ? n[0] : n[1]; };
  for (const st of STAGES) for (const c of st) tr(c);
  for (const p of TAMPERE) tr(p);
}

type Screen = "menu" | "fly" | "done";
type Target = { id: string; name: string; icon: string; x: number; z: number; lon: number; lat: number; group: string };
type Box = { x0: number; y0: number; x1: number; y1: number };

const STAGE_INFO = [
  { key: "tampere", icon: "🏙", name: "Tampere", sub: rg.t("Näsinneula ja muut", "Näsinneula and more", "Näsinneula y más"), color: "#2a9d8f", stars: 1 },
  { key: "mantereet", icon: "🌍", name: rg.t("Mantereet", "Continents", "Continentes"), sub: rg.t("Afrikka, Australia …", "Africa, Australia …", "África, Australia …"), color: "#3a86ff", stars: 1 },
  { key: "maat1", icon: "🗺", name: rg.t("Tutut maat", "Famous countries", "Países conocidos"), sub: rg.t("Suomi, Kiina, Brasilia …", "Finland, China, Brazil …", "Finlandia, China, Brasil …"), color: "#8338ec", stars: 2 },
  { key: "maat2", icon: "🧭", name: rg.t("Lisää maita", "More countries", "Más países"), sub: rg.t("Saksa, Viro, Chile …", "Germany, Estonia, Chile …", "Alemania, Estonia, Chile …"), color: "#e76f51", stars: 3 },
  { key: "maat3", icon: "🏆", name: rg.t("Vaikeat maat", "Hard countries", "Países difíciles"), sub: rg.t("Latvia, Kenia, Peru …", "Latvia, Kenya, Peru …", "Letonia, Kenia, Perú …"), color: "#c1121f", stars: 4 },
];
const ROUND = 8;
const ZOOMS = [1, 1.6, 2.6, 4];
const TZ = 0.9;                 // Tampere: pixels a metre at helicopter height
const TSPEED = 130;             // m/s
const FOUND_R = 55;             // m
const HINT_AFTER = 12;          // s
const DONE = "#ffffff";          // a found place on the globe
const BLINK = "#ff006e";         // the hint

let screen: Screen = "menu";
let stage = 0;                  // index in STAGE_INFO
let t = 0;
let targets: Target[] = [];
let ti = 0;                     // current target
let score = 0;
let best: number[] = [];
let clock = 0;                  // time on this target
let hinted = false;
let foundClock = -1;            // >= 0: landing on the found place
let flying = false;
let heli = { x: 0, z: 0, lon: 25, lat: 61, head: 0, vx: 0, vy: 0, spin: 0 };
let zoomIdx = 0;
let under = "";                 // the name of the place under the helicopter
let underClock = 0;
let gain = 0;                   // the points of the last find
let gainClock = 9;
let silhouette: any = null;     // the target's shape for the card
let newBest = false;
let regionBoxes: Box[] = [];
let names: any = {};            // country code -> Finnish name
let stars: any[] = [];
let baseColors: any = {};       // the globe's fills when nothing blinks

// ---- setup -------------------------------------------------------------------

function init() {
  for (let i = 0; i < STAGE_INFO.length; i++) best.push(rg.load("best_" + STAGE_INFO[i].key, 0));
  for (const r of REGIONS) {
    const b = { x0: 9999, y0: 9999, x1: -9999, y1: -9999 };
    for (let k = 2; k < r.length; k++) {
      const ring = r[k];
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i], y = ring[i + 1];
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
        if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      }
    }
    regionBoxes.push(b);
  }
  for (let s = 1; s < STAGES.length; s++) for (const c of STAGES[s]) names[c.id] = c.name;
  rg.seed(7);
  for (let i = 0; i < 40; i++) stars.push({ x: rg.random(), y: rg.random(), s: 1 + rg.random() * 2 });
  rg.seed(Math.floor(Date.now() % 100000) + 1);
  rg.say("k_tervetuloa");
}

function isGlobe() { return stage > 0; }

function start(s: number) {
  stage = s;
  rg.sound("click");
  rg.three("clear");
  score = 0;
  ti = 0;
  newBest = false;
  if (s === 0) {
    targets = rg.shuffle(TAMPERE).slice(0, ROUND).map((p: any) => ({ id: p.id, name: p.name, icon: p.icon, x: p.x, z: p.z, lon: 0, lat: 0, group: "" }));
    heli.x = 200; heli.z = -100;
  } else {
    const list = STAGES[s - 1];
    const pick = s === 1 ? rg.shuffle(list) : rg.shuffle(list).slice(0, ROUND);
    targets = pick.map((c: any) => ({ id: c.id, name: c.name, icon: "", x: 0, z: 0, lon: c.lon, lat: c.lat, group: c.group }));
    heli.lon = -30; heli.lat = 25;      // over the Atlantic, between the continents
    zoomIdx = s === 1 ? 0 : s === 2 ? 1 : 2;
    setupGlobe();
  }
  heli.head = 0; heli.vx = 0; heli.vy = 0;
  screen = "fly";
  beginTarget();
}

function setupGlobe() {
  const colors: any = {};
  for (const k in CONTINENT_COLORS) colors[k] = CONTINENT_COLORS[k];
  // countries: every other one a little lighter, so that neighbours differ
  if (stage > 1) {
    let i = 0;
    for (const r of REGIONS) {
      if (colors[r[0]] === undefined) colors[r[0]] = shade(CONTINENT_COLORS[r[1]], (i * 7) % 3 === 0 ? 1.12 : (i * 7) % 3 === 1 ? 0.93 : 1.0);
      i++;
    }
  }
  baseColors = colors;
  rg.three("scene", { background: ["#081a33", "#16325e"] });
  rg.three("globe", {
    regions: REGIONS, scale: 10, colors,
    ocean: "#2f7fc8", land: "#9bd17a", glow: "#7cc4ff", grid: "#ffffff",
    border: stage > 1 ? "#ffffff" : false, borderWidth: 0.8, shade: 0.28, visible: true,
  });
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const x = Math.round(rg.clamp(k > 1 ? v + (255 - v) * (k - 1) * 2 : v * k, 0, 255));
    return (x < 16 ? "0" : "") + x.toString(16);
  };
  return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

function cur(): Target { return targets[ti]; }

function beginTarget() {
  clock = 0;
  hinted = false;
  foundClock = -1;
  silhouette = isGlobe() ? makeSilhouette(cur()) : null;
  rg.say("k_" + cur().id.toLowerCase());
}

// ---- the target's shape (equirectangular, fitted in a box) ------------------

function targetRings(tg: Target): any[] {
  const out: any[] = [];
  for (const r of REGIONS) {
    const hit = stage === 1 ? r[1] === tg.group : r[0] === tg.id;
    if (!hit) continue;
    for (let k = 2; k < r.length; k++) out.push(r[k]);
  }
  return out;
}

function wrapLon(lon: number, around: number) {
  while (lon - around > 180) lon -= 360;
  while (lon - around < -180) lon += 360;
  return lon;
}

function makeSilhouette(tg: Target) {
  const rings = targetRings(tg);
  const cosl = Math.max(0.3, Math.cos(tg.lat * Math.PI / 180));
  const pts: number[][] = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ring of rings) {
    // far-away parts (an overseas territory) are left out
    const lon = wrapLon(ring[0] / 10, tg.lon), lat = ring[1] / 10;
    if (Math.abs(lon - tg.lon) * cosl > 45 || Math.abs(lat - tg.lat) > 45) continue;
    const p: number[] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const x = (wrapLon(ring[i] / 10, tg.lon) - tg.lon) * cosl, y = -(ring[i + 1] / 10 - tg.lat);
      p.push(x, y);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    pts.push(p);
  }
  const W = 60, H = 48;
  const k = Math.min((W - 6) / Math.max(0.1, x1 - x0), (H - 6) / Math.max(0.1, y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  let d = "";
  for (const p of pts) {
    for (let i = 0; i < p.length; i += 2) {
      d += (i === 0 ? "M " : "L ") + (ox + (p[i] - x0) * k).toFixed(1) + " " + (oy + (p[i + 1] - y0) * k).toFixed(1) + " ";
    }
    d += "Z ";
  }
  const color = CONTINENT_COLORS[tg.group] || "#9bd17a";
  return { d, color, w: W, h: H };
}

// ---- input ------------------------------------------------------------------

function onPointerDown(x: number, y: number) {
  if (screen !== "fly") return;
  if (y < 76) return;                                       // the task card
  if (isGlobe() && x > width - 70 && y > height - 150) return;  // zoom buttons
  if (x < 70 && y > height - 80) return;                    // hint button
  flying = true;
}
function onPointerUp() { flying = false; }

function onKeyDown(key: string) {
  if (screen !== "fly") return;
  if (key === "+" || key === "=") zoom(1);
  if (key === "-") zoom(-1);
  if (key === "h") hint();
  if (key === "n" && foundClock < 0) found();   // for testing: this one is found
}

function onClose() {
  if (screen === "fly" || screen === "done") { back(); return false; }
  return true;
}

function back() {
  rg.three("clear");
  screen = "menu";
  flying = false;
}

function zoom(d: number) {
  zoomIdx = rg.clamp(zoomIdx + d, 0, ZOOMS.length - 1);
  rg.sound("click");
}

function hint() {
  if (hinted || foundClock >= 0) return;
  hinted = true;
  rg.sound("pop");
  rg.say("k_" + cur().id.toLowerCase());
}

// ---- tick -------------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  gainClock += dt;
  if (screen !== "fly") return;
  heli.spin += dt * (foundClock >= 0 ? 900 : 1500);
  if (foundClock >= 0) {
    foundClock += dt;
    heli.vx *= 0.9; heli.vy *= 0.9;
    if (foundClock > 2.4) next();
    drawGlobe();
    return;
  }
  clock += dt;
  if (clock > HINT_AFTER) hinted = true;

  // where to fly: x right, y down on the screen, length 0..1
  let dx = 0, dy = 0;
  const k = input.keys;
  if (k.ArrowLeft || k.a) dx -= 1;
  if (k.ArrowRight || k.d) dx += 1;
  if (k.ArrowUp || k.w) dy -= 1;
  if (k.ArrowDown || k.s) dy += 1;
  if (flying && input.pointer.down) {
    const px = input.pointer.x - width / 2, py = input.pointer.y - heliY();
    const d = Math.hypot(px, py);
    if (d > 12) { const f = rg.clamp(d / 110, 0.3, 1); dx = px / d * f; dy = py / d * f; }
  } else if (!input.pointer.down) flying = false;
  const L = Math.hypot(dx, dy);
  if (L > 1) { dx /= L; dy /= L; }
  // a little inertia, as a helicopter has
  const e = Math.min(1, dt * 4);
  heli.vx += (dx - heli.vx) * e;
  heli.vy += (dy - heli.vy) * e;
  const sp = Math.hypot(heli.vx, heli.vy);
  if (sp > 0.05) {
    const want = Math.atan2(heli.vx, -heli.vy) * 180 / Math.PI;
    let dh = want - heli.head;
    while (dh > 180) dh -= 360;
    while (dh < -180) dh += 360;
    heli.head += dh * Math.min(1, dt * 6);
  }

  if (isGlobe()) {
    const degs = 38 / ZOOMS[zoomIdx];
    heli.lat = rg.clamp(heli.lat - heli.vy * degs * dt, -78, 80);
    heli.lon += heli.vx * degs * dt / Math.max(0.25, Math.cos(heli.lat * Math.PI / 180));
    if (heli.lon > 180) heli.lon -= 360;
    if (heli.lon < -180) heli.lon += 360;
  } else {
    heli.x = rg.clamp(heli.x + heli.vx * TSPEED * dt, MAPINFO.X0 + 20, MAPINFO.X0 + MAPINFO.W - 20);
    heli.z = rg.clamp(heli.z + heli.vy * TSPEED * dt, MAPINFO.Z0 + 20, MAPINFO.Z0 + MAPINFO.H - 20);
  }

  underClock += dt;
  if (underClock > 0.25) { underClock = 0; checkUnder(); }
  drawGlobe();
}

function heliY() { return height * 0.55; }

function drawGlobe() {
  if (!isGlobe()) return;
  const args: any = { lon: heli.lon, lat: heli.lat, r: globeR(), x: width / 2, y: heliY() };
  // the target blinks once the hint is on
  if (hinted && foundClock < 0) {
    const on = Math.floor(t * 3) % 2 === 0;
    const c: any = {};
    const key = stage === 1 ? cur().group : cur().id;
    c[key] = on ? BLINK : baseColors[key];
    args.colors = c;
  }
  rg.three("globe", args);
}

function checkUnder() {
  if (isGlobe()) {
    const hit = regionAt(heli.lon, heli.lat);
    const tg = cur();
    if (hit) under = stage === 1 ? continentName(hit[1]) : (names[hit[0]] || continentName(hit[1]));
    else under = "";
    if (hit && (stage === 1 ? hit[1] === tg.group : hit[0] === tg.id)) found();
  } else {
    under = "";
    let bestD = 140;
    for (const p of TAMPERE) {
      const d = Math.hypot(p.x - heli.x, p.z - heli.z);
      if (d < bestD) { bestD = d; under = p.name; }
    }
    const tg = cur();
    if (Math.hypot(tg.x - heli.x, tg.z - heli.z) < FOUND_R) found();
  }
}

function continentName(k: string) {
  for (const c of STAGES[0]) if (c.id === k) return c.name;
  return "";
}

function regionAt(lon: number, lat: number): any {
  const x = lon * 10, y = lat * 10;
  for (let i = 0; i < REGIONS.length; i++) {
    const b = regionBoxes[i];
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
    const r = REGIONS[i];
    for (let k = 2; k < r.length; k++) if (inRing(r[k], x, y)) return r;
  }
  return null;
}

function inRing(ring: number[], x: number, y: number) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function found() {
  foundClock = 0;
  flying = false;
  const bonus = Math.max(0, Math.round(100 - clock * 4));
  gain = (stage <= 1 ? 100 : stage * 50 + 50) + (hinted ? Math.round(bonus / 2) : bonus);
  score += gain;
  gainClock = 0;
  rg.celebrate(width / 2, heliY(), { big: ti === targets.length - 1 });
  rg.say(rg.pick(["k_loysit", "hienoa", "mahtavaa", "jee", "loistavaa"]));
  if (isGlobe()) {
    const c: any = {};
    const key = stage === 1 ? cur().group : cur().id;
    c[key] = DONE;
    baseColors[key] = DONE;
    rg.three("globe", { colors: c });
  }
}

function next() {
  ti++;
  if (ti >= targets.length) {
    screen = "done";
    flying = false;
    if (score > best[stage]) { best[stage] = score; rg.save("best_" + STAGE_INFO[stage].key, score); newBest = true; }
    rg.say(newBest ? ["k_kaikki", "uusi_ennatys"] : "k_kaikki");
    rg.celebrate(width / 2, height / 2, { big: true });
    rg.three("globe", { visible: false });
    return;
  }
  beginTarget();
}

// ---- view -------------------------------------------------------------------

function Helicopter() {
  const y = heliY();
  const land = foundClock >= 0 ? Math.min(1, foundClock / 1.2) : 0;
  const sc = 1 - land * 0.25;
  const sh = 16 - land * 10;          // the shadow comes closer when landing
  const S = 120;
  const body = (
    <div className="heli" style={{ left: width / 2 - S / 2, top: y - S / 2, width: S, height: S, transform: "rotate(" + Math.round(heli.head) + "deg) scale(" + sc.toFixed(2) + ")" }}>
      <div className="boom" />
      <div className="fin" />
      <div className="trotor" />
      <div className="skid" style={{ left: 36 }} />
      <div className="skid" style={{ left: 79 }} />
      <div className="cabin" />
      <div className="glass" />
    </div>
  );
  // the rotor turns on its own, as a path (its blades as boxes did not turn about the middle)
  const R = 108 * sc;
  const rotor = [
    <div className="disc" style={{ left: width / 2 - R / 2, top: y - R / 2, width: R, height: R, borderRadius: R / 2 }} />,
    <div className="rotor" style={{ left: width / 2 - R / 2, top: y - R / 2, width: R, height: R, transform: "rotate(" + Math.round(heli.spin % 360) + "deg)" }}>
      <path d="M 4 54 L 104 54 M 54 4 L 54 104" stroke="rgba(43,45,66,0.85)" strokeWidth="7" fill="none" viewBox="0 0 108 108"
        style={{ position: "absolute", left: 0, top: 0, width: R, height: R }} />
    </div>,
    <div className="hub" style={{ left: width / 2 - 8, top: y - 8 }} />,
  ];
  return [
    <div className="hshadow" style={{ left: width / 2 - 26 + sh, top: y - 34 + sh, transform: "rotate(" + Math.round(heli.head) + "deg)" }} />,
    body,
    rotor,
  ];
}

function Arrow() {
  if (!hinted || foundClock >= 0) return null;
  let ang = 0;    // screen angle, 0 = up, clockwise
  let far = 999;
  const tg = cur();
  if (isGlobe()) {
    const p1 = heli.lat * Math.PI / 180, p2 = tg.lat * Math.PI / 180, dl = (tg.lon - heli.lon) * Math.PI / 180;
    ang = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI;
  } else {
    ang = Math.atan2(tg.x - heli.x, -(tg.z - heli.z)) * 180 / Math.PI;
    far = Math.hypot(tg.x - heli.x, tg.z - heli.z) * TZ;
  }
  if (far < 70) return null;
  const R = 78 + Math.sin(t * 6) * 5;
  const a = ang * Math.PI / 180;
  const x = width / 2 + Math.sin(a) * R, y = heliY() - Math.cos(a) * R;
  return (
    <div className="arrow" style={{ left: x - 22, top: y - 22, transform: "rotate(" + Math.round(ang) + "deg)" }}>
      <path d="M 22 2 L 40 26 L 29 26 L 29 42 L 15 42 L 15 26 L 4 26 Z" fill="#ffd166" stroke="#7a3e00" strokeWidth="3" viewBox="0 0 44 44"
        style={{ position: "absolute", left: 0, top: 0, width: 44, height: 44 }} />
    </div>
  );
}

function TampereMap() {
  const out: any[] = [];
  const Z = TZ;
  const T = MAPINFO.TILE;
  const size = T * Z;
  const cx = heli.x, cz = heli.z, hy = heliY();
  const sx = (x: number) => (x - cx) * Z + width / 2;
  const sy = (z: number) => (z - cz) * Z + hy;
  const left = cx - width / 2 / Z, top = cz - hy / Z;
  const c0 = Math.max(0, Math.floor((left - MAPINFO.X0) / T)), r0 = Math.max(0, Math.floor((top - MAPINFO.Z0) / T));
  const c1 = Math.min(MAPINFO.NCOL - 1, Math.floor((left + width / Z - MAPINFO.X0) / T));
  const r1 = Math.min(MAPINFO.NROW - 1, Math.floor((top + height / Z - MAPINFO.Z0) / T));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const x = Math.floor(sx(MAPINFO.X0 + c * T)), y = Math.floor(sy(MAPINFO.Z0 + r * T));
    const h = Math.min(T, MAPINFO.H - r * T) * Z;
    out.push(<img className="tile" src={rg.asset("map/" + c + "_" + r + ".png")} style={{ left: x, top: y, width: Math.ceil(size) + 1, height: Math.ceil(h) + 1 }} />);
  }
  const tg = cur();
  for (const p of TAMPERE) {
    const X = sx(p.x), Y = sy(p.z);
    if (X < -40 || X > width + 40 || Y < -40 || Y > height + 40) continue;
    const isT = p.id === tg.id;
    const pulse = isT && hinted ? 1 + Math.sin(t * 8) * 0.12 : 1;
    if (isT && hinted) out.push(<div className="ring" style={{ left: X - 34, top: Y - 34, transform: "scale(" + (1 + (t * 1.5) % 1 * 0.6).toFixed(2) + ")", opacity: String(1 - (t * 1.5) % 1) }} />);
    out.push(<div className={isT && hinted ? "pin goal" : "pin"} style={{ left: X - 22, top: Y - 22, transform: "scale(" + pulse.toFixed(2) + ")" }}>{p.icon}</div>);
  }
  return out;
}

function Card() {
  if (screen !== "fly") return null;
  const tg = cur();
  const pic = isGlobe()
    ? <div className="pic"><path d={silhouette.d} fill={silhouette.color} stroke="#3d405b" strokeWidth="1.2" viewBox={"0 0 " + silhouette.w + " " + silhouette.h}
        style={{ position: "absolute", left: 2, top: 4, width: silhouette.w, height: silhouette.h }} /></div>
    : <div className="pic"><div className="picicon">{tg.icon}</div></div>;
  const dots: any[] = [];
  for (let i = 0; i < targets.length; i++) dots.push(<div className={i < ti || (i === ti && foundClock >= 0) ? "dot on" : i === ti ? "dot now" : "dot"} />);
  return (
    <div className="card" id="card" onClick={() => rg.say("k_" + cur().id.toLowerCase())} style={{ width: width - 72 }}>
      {pic}
      <div className="cardtext">
        <div className="find">{rg.t("Etsi", "Find", "Busca")} 🔊</div>
        <div className="tname">{tg.name}</div>
        <div className="dots">{dots}</div>
      </div>
    </div>
  );
}

function Hud() {
  const out: any[] = [];
  out.push(<div className="score">⭐ {score}</div>);
  if (gainClock < 1.6) out.push(<div className="gain" style={{ top: heliY() - 90 - gainClock * 40, left: width / 2 - 60, opacity: String(Math.min(1, 2 - gainClock * 1.2)) }}>+{gain}</div>);
  if (under && foundClock < 0) out.push(<div className="under" style={{ left: 0, width: width, top: heliY() + 62 }}><div className="underin">{under}</div></div>);
  if (!hinted && foundClock < 0) out.push(<div className="btn hintbtn" id="hint" onClick={hint} style={{ left: 12, top: height - 68 }}>❓</div>);
  if (isGlobe()) {
    out.push(<div className="btn" id="zin" onClick={() => zoom(1)} style={{ left: width - 64, top: height - 136 }}>➕</div>);
    out.push(<div className="btn" id="zout" onClick={() => zoom(-1)} style={{ left: width - 64, top: height - 68 }}>➖</div>);
  }
  return out;
}

function globeR() { return Math.min(width, height) * 0.44 * ZOOMS[zoomIdx]; }

// stars in space, not on the globe
function Stars() {
  const R = (screen === "fly" ? globeR() : 0) * 1.08, hy = heliY();
  const out: any[] = [];
  for (const s of stars) {
    const x = s.x * width, y = s.y * height;
    if (Math.hypot(x - width / 2, y - hy) < R) continue;
    out.push(<div className="star" style={{ left: x, top: y, width: s.s, height: s.s }} />);
  }
  return out;
}

function Menu() {
  const tiles = STAGE_INFO.map((s, i) => {
    const st: any[] = [];
    for (let k = 0; k < s.stars; k++) st.push("⭐");
    return (
      <div className="mtile" id={"st-" + s.key} onClick={() => start(i)} style={{ backgroundColor: s.color }}>
        <div className="micon">{s.icon}</div>
        <div className="mtext">
          <div className="mname">{s.name}</div>
          <div className="msub">{s.sub}</div>
          <div className="mstars">{st.join("")}{best[i] > 0 ? "   🏅 " + best[i] : ""}</div>
        </div>
      </div>
    );
  });
  const bob = Math.sin(t * 3) * 4;
  return (
    <div className="menu">
      <div className="title" style={{ marginTop: 18 + bob }}>🚁</div>
      <div className="logo">{rg.t("Kopterilento", "Helicopter Flight", "Vuelo en helicóptero")}</div>
      <div className="mlist">{tiles}</div>
    </div>
  );
}

function Done() {
  const n = targets.length;
  const max = n * ((stage <= 1 ? 100 : stage * 50 + 50) + 100);
  const got = score / max;
  const st = got > 0.75 ? "⭐⭐⭐" : got > 0.5 ? "⭐⭐" : "⭐";
  return (
    <div className="overlay">
      <div className="donebox">
        <div className="donebig">{STAGE_INFO[stage].icon}</div>
        <div className="donetitle">{rg.t("Löysit kaikki!", "You found them all!", "¡Los encontraste todos!")}</div>
        <div className="donestars">{st}</div>
        <div className="donescore">⭐ {score}</div>
        {newBest ? <div className="record">🏅 {rg.t("Uusi ennätys!", "New record!", "¡Nuevo récord!")}</div> : <div className="record dim">🏅 {best[stage]}</div>}
        <div className="row">
          <div className="go" id="again" onClick={() => start(stage)}>🔁</div>
          <div className="go alt" id="menu" onClick={back}>🏠</div>
        </div>
      </div>
    </div>
  );
}

function view() {
  if (screen === "menu") return <div className="screen sky">{Menu()}</div>;
  if (isGlobe()) {
    return (
      <div className="screen">
        {Stars()}
        {screen === "fly" ? Arrow() : null}
        {screen === "fly" ? Helicopter() : null}
        {screen === "fly" ? Hud() : null}
        {Card()}
        {screen === "done" ? Done() : null}
      </div>
    );
  }
  return (
    <div className="screen town">
      {TampereMap()}
      {screen === "fly" ? Arrow() : null}
      {screen === "fly" ? Helicopter() : null}
      {screen === "fly" ? Hud() : null}
      {Card()}
      {screen === "done" ? Done() : null}
    </div>
  );
}
