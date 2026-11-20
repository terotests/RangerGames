// Painovoimalento (Gravity Flight): fly a small rocket between the Sun, the
// planets and the Moon. Near a body its gravity pulls you in, each with its
// own strength (the real surface gravity, a bit sped up so falling does not
// take ages), and you bounce off its surface like a rubber ball instead of
// crashing. Touch every body to collect its badge.
//
// Controls for small children: hold a finger still on the screen and the
// rocket fires its engine until the finger lifts; dragging steers. Without
// the engine the rocket slowly slows down, so it never gets too fast. A tap
// on a planet (or its icon at the edge) is a quick flight close to it. When
// the rocket feels each planet's gravity in its movement. The same follow
// camera and player controls are used throughout, including during descent
// and after bouncing back from a surface.
//
// The bodies are drawn by the engine (rg.three("planet", …)): the same globe
// as Muuttolintu's and Kopterilento's, placed in the 3D scene in perspective
// and lit by the Sun. They are much bigger and closer to each other than in
// reality, so that flying between them is a game.
//
// Country outlines: Natural Earth (public domain), lib/world.ts. The Moon's
// seas, Mars's dark lands and Jupiter's bands are rough outlines drawn here.

import { REGIONS } from "lib/world";
// Speech: rg.say ids play this game's own clips voice/<id>.wav (Google TTS,
// made with the speak tool) instead of the engine's synthesized ones.
const __rgSay = rg.say;
rg.say = function (ids, opts) {
  const a = Array.isArray(ids) ? ids : [ids];
  __rgSay(a.map((id) => (!id || String(id).charAt(0) === "/") ? id : rg.asset("voice/" + id + ".wav")), opts);
};

type Body = {
  id: string; name: string; icon: string;
  dot?: string;        // drawn as a coloured disc instead of the icon (no old emoji for it)
  pos: number[]; r: number;
  g: number;           // the real surface gravity, m/s²
  pull: number;        // the game's surface gravity, units/s²
  soi: number;         // how far the pull reaches (in radii)
  bounce: number;      // how much of the speed a bounce keeps
  spin: number;        // radians a second
  turn?: number;       // the starting angle (radians): which side faces the Sun
  tilt: number;
  sky?: string;        // the colour of the air close to the surface
};

// the game's gravity is the real one × FALL (units are about 64 km each, so
// the planets are huge next to the rocket, and falling is sped up)
const FALL = 0.62;
const BODIES: Body[] = [
  { id: "sun", name: rg.t("Aurinko", "Sun", "Sol"), icon: "☀️", pos: [0, 0, 0], r: 520, g: 274, pull: 34, soi: 2.9, bounce: 1.15, spin: 0.01, tilt: 0.1 },
  { id: "mercury", name: rg.t("Merkurius", "Mercury", "Mercurio"), icon: "🌑", pos: [1700, -100, -900], r: 42, g: 3.7, pull: 3.7 * FALL, soi: 4, bounce: 0.8, spin: 0.01, tilt: 0 },
  { id: "venus", name: rg.t("Venus", "Venus", "Venus"), icon: "", dot: "#e9c46a", pos: [2900, 100, 1400], r: 95, g: 8.9, pull: 8.9 * FALL, soi: 3.6, bounce: 0.8, spin: -0.005, tilt: 0.05, sky: "#8a6b2e" },
  { id: "earth", name: rg.t("Maa", "Earth", "Tierra"), icon: "🌍", pos: [4500, 0, 0], r: 100, g: 9.8, pull: 9.8 * FALL, soi: 4, bounce: 0.8, spin: 0.02, turn: 2.6, tilt: 0.41, sky: "#4a90d9" },
  { id: "moon", name: rg.t("Kuu", "Moon", "Luna"), icon: "🌕", pos: [4150, 120, -560], r: 40, g: 1.62, pull: 1.62 * FALL, soi: 4, bounce: 0.8, spin: 0.01, tilt: 0.03 },
  { id: "mars", name: rg.t("Mars", "Mars", "Marte"), icon: "🔴", pos: [6000, -200, 1800], r: 60, g: 3.7, pull: 3.7 * FALL, soi: 4, bounce: 0.8, spin: 0.03, tilt: 0.44, sky: "#b5765a" },
  { id: "jupiter", name: rg.t("Jupiter", "Jupiter", "Júpiter"), icon: "", dot: "#e07a3c", pos: [8800, 400, -2600], r: 340, g: 24.8, pull: 24.8 * FALL, soi: 3.2, bounce: 0.8, spin: 0.05, tilt: 0.05 },
];
const SHIP_R = 0.9;
const THRUST = 22;
const MAX_SPEED = 150;      // the engine cannot push the rocket faster than this
const DRAG = 0.45;          // without the engine the speed fades (1/s)
const TAP_TIME = 0.36;      // short planet taps still trigger quick travel
const STILL = 14;           // steering dead zone in screen pixels
const TURN = 1.7;
const AUTO_TIME = 2.6;      // the quick flight to a tapped planet, seconds
const FOV = 65;
const BG = [6, 8, 22];

type Screen = "title" | "play";
let screen: Screen = "title";
let t = 0;
let pos = [0, 0, 0];
let vel = [0, 0, 0];
let fwd = [1, 0, 0];
let up = [0, 1, 0];
let thrusting = 0;
// quick flight to a tapped planet
let auto: { b: Body; from: number[]; to: number[]; f0: number[]; t: number } | null = null;
// Track being in a planet's gravity field for bounce/escape state only.
let fall: { b: Body; bounced: boolean; t: number } | null = null;
let visited: any = {};
let bounces = 0;
let near: Body | null = null;        // the body whose pull is strongest
let nearAcc = 0;
let alt = 0;
let lastBounce = -10;
let bounceText = "";
let message = "";
let messageClock = 0;
let skyKey = "";
let cam = { pos: [0, 0, 0], look: [1, 0, 0], up: [0, 1, 0] };
// Steering and throttle are separate: never auto-thrust while dragging.
let stick: { id: number; x: number; y: number; dx: number; dy: number; t: number; moved: boolean } | null = null;
let throttlePointer: number | null = null;
let best = 0;

// Orbital navigation: a sampled no-thrust forecast and a guide ring.
let orbitTrail: number[][] = [];
let orbitGuide: number[][] = [];
let orbitLaneInner: number[][] = [];
let orbitLaneOuter: number[][] = [];
let orbitBurnLatch = 0;
let orbitBurnWasActive = false;
let orbitStableSeconds = 0;
let orbitCelebrateBody = "";
let orbitOutcome = "";
let orbitBodyId = "";
let orbitCacheAt = -100;
const ORBIT_RING_RADIUS = 1.75; // measured from the planet's center

// ---- vectors -------------------------------------------------------------------

function add(a: number[], b: number[]) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul(a: number[], k: number) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len(a: number[]) { return Math.sqrt(dot(a, a)); }
function norm(a: number[]) { const l = len(a); return l < 1e-9 ? [0, 0, 0] : mul(a, 1 / l); }
// `v` turned round the unit axis `k` by `a` radians
function rotate(v: number[], k: number[], a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

// three.js's XYZ Euler angles of the rotation whose columns are a, b, c
function euler(a: number[], b: number[], c: number[]) {
  const m13 = c[0], m23 = c[1], m33 = c[2], m12 = b[0], m11 = a[0], m32 = b[2], m22 = b[1];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999) return { rx: Math.atan2(-m23, m33), ry, rz: Math.atan2(-m12, m11) };
  return { rx: Math.atan2(m32, m22), ry, rz: 0 };
}

// ---- the bodies' surfaces -----------------------------------------------------

let seed = 1;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

// a lumpy round patch round (lon, lat), `r` degrees across
function blob(lon: number, lat: number, r: number, lump: number, n = 20) {
  const ring: number[] = [];
  const k = 1 / Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const ph = rnd() * 6.28, ph2 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const rr = r * (1 + lump * (0.6 * Math.sin(a * 3 + ph) + 0.4 * Math.sin(a * 5 + ph2)));
    ring.push(lon + Math.cos(a) * rr * k, Math.max(-89, Math.min(89, lat + Math.sin(a) * rr)));
  }
  return ring;
}

// a band round the whole ball between two latitudes, its edges wavy
function band(lat0: number, lat1: number, wave: number, k: number) {
  const ring: number[] = [];
  const ph = rnd() * 6.28;
  for (let lon = -180; lon <= 180; lon += 10) ring.push(lon, lat0 + wave * Math.sin(lon * k * Math.PI / 180 + ph));
  for (let lon = 180; lon >= -180; lon -= 10) ring.push(lon, lat1 + wave * Math.sin(lon * k * Math.PI / 180 + ph * 1.7));
  return ring;
}

// the cap round a pole, down to `lat`
function polar(lat: number, lump: number) {
  const ring: number[] = [];
  for (let lon = -180; lon < 180; lon += 10) ring.push(lon, lat + (lat > 0 ? -1 : 1) * lump * Math.abs(Math.sin(lon * 0.05)));
  return ring;
}

function craters(regions: any[], n: number, rim: string, floor: string, maxR: number) {
  for (let i = 0; i < n; i++) {
    const lon = rnd() * 360 - 180, lat = Math.asin(rnd() * 2 - 1) * 180 / Math.PI;
    const r = 0.8 + Math.pow(rnd(), 2.5) * maxR;
    regions.push(["c" + i, rim, blob(lon, lat, r, 0.08, 14)]);
    regions.push(["f" + i, floor, blob(lon + r * 0.06, lat - r * 0.06, r * 0.72, 0.06, 12)]);
  }
}

function moonRegions() {
  seed = 11;
  const regions: any[] = [];
  const mare = (lon: number, lat: number, r: number) => regions.push(["mare", "sea", blob(lon, lat, r, 0.18, 24)]);
  // the near side faces lon 0
  mare(-57, 18, 21); mare(-48, -2, 14); mare(-64, 38, 12);       // Oceanus Procellarum
  mare(-16, 33, 16);                                            // Imbrium
  mare(17, 28, 9);                                              // Serenitatis
  mare(31, 8, 10); mare(24, 1, 6);                              // Tranquillitatis
  mare(59, 17, 7);                                              // Crisium
  mare(51, -8, 7);                                              // Fecunditatis
  mare(35, -15, 5);                                             // Nectaris
  mare(-17, -21, 9);                                            // Nubium
  mare(-39, -24, 5);                                            // Humorum
  mare(4, 13, 4);                                               // Vaporum
  regions.push(["frigoris", "sea", blob(5, 56, 7, 0.3, 24)]);
  mare(-145, -55, 9); mare(147, -27, 5);                        // the far side has few seas
  craters(regions, 90, "rim", "floor", 6);
  // Tycho and Copernicus, bright
  regions.push(["tycho", "bright", blob(-11, -43, 3.5, 0.05, 16)]);
  regions.push(["copernicus", "bright", blob(-20, 10, 3, 0.05, 16)]);
  return regions;
}

function mercuryRegions() {
  seed = 29;
  const regions: any[] = [];
  for (let i = 0; i < 9; i++) regions.push(["plain", "sea", blob(rnd() * 360 - 180, rnd() * 120 - 60, 8 + rnd() * 12, 0.2, 22)]);
  regions.push(["caloris", "basin", blob(170, 30, 16, 0.08, 24)]);
  craters(regions, 120, "rim", "floor", 5);
  return regions;
}

function venusRegions() {
  seed = 41;
  const regions: any[] = [];
  const cols = ["c1", "c2", "c3"];
  for (let lat = -80, i = 0; lat < 80; lat += 16, i++) regions.push(["b" + i, cols[i % 3], band(lat, lat + 9, 4, 2 + (i % 3))]);
  regions.push(["n", "c2", polar(80, 3)]);
  regions.push(["s", "c2", polar(-80, 3)]);
  return regions;
}

function marsRegions() {
  seed = 53;
  const regions: any[] = [];
  const dark = (lon: number, lat: number, r: number) => regions.push(["dark", "dark", blob(lon, lat, r, 0.3, 24)]);
  dark(70, 10, 10); dark(62, 2, 8);                  // Syrtis Major
  dark(-30, 45, 12); dark(-15, 40, 7);               // Acidalium
  dark(0, -5, 8); dark(-20, -8, 7);                  // Sinus Meridiani, Margaritifer
  dark(-40, -25, 12); dark(-10, -25, 10);            // Erythraeum
  dark(100, -20, 12); dark(140, -25, 14); dark(-150, -35, 12); dark(175, -30, 10);  // Tyrrhenum, Cimmerium, Sirenum
  dark(110, 25, 6);
  regions.push(["hellas", "hellas", blob(70, -42, 10, 0.06, 24)]);
  regions.push(["argyre", "hellas", blob(-43, -50, 6, 0.06, 20)]);
  // Valles Marineris, a long dark canyon
  regions.push(["valles", "canyon", [-95, -6, -75, -4, -55, -8, -42, -12, -42, -15, -55, -12, -75, -9, -95, -10]]);
  regions.push(["ncap", "ice", polar(80, 4)]);
  regions.push(["scap", "ice", polar(-83, 2)]);
  return regions;
}

function jupiterRegions() {
  seed = 67;
  const regions: any[] = [];
  const edges = [-90, -62, -48, -36, -27, -19, -10, -3, 6, 15, 22, 31, 42, 55, 70, 90];
  const cols = ["pole", "belt", "zone", "belt2", "zone", "belt", "zone2", "zone", "belt", "zone2", "belt2", "zone", "belt", "zone", "pole"];
  for (let i = 0; i + 1 < edges.length; i++) {
    if (edges[i] === -90) regions.push(["b" + i, cols[i], polar(-62, 2)]);
    else if (edges[i + 1] === 90) regions.push(["b" + i, cols[i], polar(70, 2)]);
    else regions.push(["b" + i, cols[i], band(edges[i], edges[i + 1], 1.4, 4 + (i % 3))]);
  }
  // the Great Red Spot and a few white ovals
  regions.push(["grs", "spot", blob(-60, -22, 9, 0.05, 28).map((v: number, i: number) => i % 2 ? -22 + (v + 22) * 0.55 : v)]);
  for (let i = 0; i < 6; i++) regions.push(["oval" + i, "oval", blob(rnd() * 360 - 180, -34 + (i % 2) * 2, 2.5, 0.05, 14)]);
  return regions;
}

function sunRegions() {
  seed = 79;
  const regions: any[] = [];
  for (let i = 0; i < 40; i++) regions.push(["g" + i, "gran", blob(rnd() * 360 - 180, rnd() * 140 - 70, 3 + rnd() * 8, 0.3, 14)]);
  for (let i = 0; i < 7; i++) regions.push(["s" + i, "spot", blob(rnd() * 360 - 180, (rnd() < 0.5 ? -1 : 1) * (10 + rnd() * 20), 1.2 + rnd() * 1.5, 0.15, 12)]);
  return regions;
}

const EARTH_PEAKS = [
  [7.5, 46, 2.5], [10.5, 46.5, 2.2], [43, 43.2, 2.3], [72.5, 38.5, 2.5], [80, 42, 2.3], [80, 30.5, 2.8], [84, 28.6, 3],
  [86.9, 28, 3], [90, 28, 2.8], [37.35, -3.07, 2.6], [-151, 63, 2.6], [-120, 52, 1.8], [-114, 49, 2], [-106, 39.5, 2.2],
  [-78.5, -1, 2.5], [-77.5, -9, 2.6], [-68, -16, 2.8], [-70, -33, 3], [-72, -45, 2.2], [138.7, 35.4, 2.2], [170, -43.6, 2.2],
  [8, 61.6, 1.5], [16.5, 67.4, 1.3], [-19, 64.6, 1.4],
];

function placeBodies() {
  for (const b of BODIES) {
    const base: any = { id: b.id, x: b.pos[0], y: b.pos[1], z: b.pos[2], r: b.r, tilt: b.tilt, spin: b.turn || 0 };
    if (b.id === "earth") {
      const colors: any = {};
      for (const id of ["SAH", "MRT", "DZA", "LBY", "EGY", "MLI", "NER", "TCD", "SAU", "OMN", "YEM", "ARE", "QAT", "KWT", "JOR", "AUS"]) colors[id] = "#e6cf96";
      for (const id of ["ATA", "GRL"]) colors[id] = "#f2f6fb";
      Object.assign(base, { regions: REGIONS, scale: 10, colors, ocean: "#2f7fc8", land: "#5fb04a", glow: "#7cc4ff", cell: 15, night: 0.8,
        peaks: EARTH_PEAKS, peakSize: 1.6, peakSnow: "#f2f6fb" });
    } else if (b.id === "moon") {
      Object.assign(base, { regions: moonRegions(), ocean: "#bdbab3", colors: { sea: "#73716d", rim: "#d6d3cc", floor: "#a8a59e", bright: "#f1efe9" }, cell: 20, night: 0.88 });
    } else if (b.id === "mercury") {
      Object.assign(base, { regions: mercuryRegions(), ocean: "#9c948a", colors: { sea: "#857c72", basin: "#b0a598", rim: "#bcb3a7", floor: "#8a8277" }, cell: 20, night: 0.88 });
    } else if (b.id === "venus") {
      Object.assign(base, { regions: venusRegions(), ocean: "#e3c47e", colors: { c1: "#ecd59c", c2: "#dcbd7c", c3: "#f1deae" }, glow: "#ffe6a8", cell: 20, night: 0.8 });
    } else if (b.id === "mars") {
      Object.assign(base, { regions: marsRegions(), ocean: "#c4603a", colors: { dark: "#83432a", hellas: "#e0a77f", canyon: "#6e3220", ice: "#f6f1ea" }, glow: "#e8a986", cell: 20, night: 0.85,
        peaks: [[-134, 18, 3], [-104, 12, 2], [-113, 1, 2], [-121, -9, 2], [147, 25, 1.5]], peakSize: 2.6, peakSnow: "#d99a72" });
    } else if (b.id === "jupiter") {
      Object.assign(base, { regions: jupiterRegions(), ocean: "#d8c7a8",
        colors: { pole: "#a28a6e", belt: "#b0764d", belt2: "#c4936a", zone: "#efe4cd", zone2: "#e3d2b0", spot: "#c2532f", oval: "#f7f1e4" }, glow: "#f2dfc0", cell: 20, night: 0.85 });
    } else {
      Object.assign(base, { regions: sunRegions(), ocean: "#ffb32c", colors: { gran: "#ffc94a", spot: "#c2410c" }, glow: "#ffd36b", glowing: true });
    }
    rg.three("planet", base);
  }
}

// ---- the game ----------------------------------------------------------------

function init() {
  best = rg.load("best", 0);
  build();
  reset();
}

function build() {
  rg.three("clear");
  rg.three("scene", { background: rgb(BG) });
  rg.three("space", { sun: [0, 0, 0], stars: 700 });
  // the rocket's own light: the Sun is far, and it should look the same everywhere
  rg.three("light", { id: "ambient", type: "ambient", intensity: 0.55 });
  rg.three("light", { id: "sun", type: "directional", x: -1, y: 0.4, z: 0.2, intensity: 0.7 });
  placeBodies();
  rg.three("add", { id: "body", shape: "cone", size: [0.5, 2.2], detail: 10, color: "#f1f3f5" });
  rg.three("add", { id: "band", shape: "cylinder", size: [0.4, 0.46, 0.35], detail: 10, color: "#e63946" });
  rg.three("add", { id: "window", shape: "sphere", size: [0.2], detail: 8, color: "#48cae4", emissive: true });
  rg.three("add", { id: "wingL", shape: "box", size: [1.0, 0.08, 0.7], color: "#e63946" });
  rg.three("add", { id: "wingR", shape: "box", size: [1.0, 0.08, 0.7], color: "#e63946" });
  rg.three("add", { id: "fin", shape: "box", size: [0.08, 0.75, 0.7], color: "#e63946" });
  rg.three("add", { id: "flame", shape: "cone", size: [0.34, 1.1], detail: 8, color: "#ffb703", emissive: true, visible: false });
  rg.three("add", { id: "flame2", shape: "cone", size: [0.2, 0.7], detail: 8, color: "#fff3b0", emissive: true, visible: false });
}

function reset() {
  const earth = BODIES[3];
  // just outside the Earth's pull, so the game does not start with a fall
  pos = add(earth.pos, [-450, 60, 120]);
  vel = [0, 0, 0];
  fwd = norm(sub(earth.pos, pos));
  up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
  visited = {};
  bounces = 0;
  message = "";
  skyKey = "";
  auto = null;
  fall = null;
  stick = null;
  throttlePointer = null;
  orbitTrail = [];
  orbitGuide = [];
  orbitLaneInner = [];
  orbitLaneOuter = [];
  orbitBurnLatch = 0;
  orbitBurnWasActive = false;
  orbitStableSeconds = 0;
  orbitCelebrateBody = "";
  orbitBodyId = "";
  orbitCacheAt = -100;
  shipScale = 1;
  placeShip();
  camera(1);
}

function rgb(c: number[]) { return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")"; }
function hex(h: string) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

function say(text: string) { message = text; messageClock = 3.2; }

// Venus and Jupiter have no emoji old enough for the phone's font (the
// coloured circles are Unicode 12, Android 9 has Emoji 11): a drawn disc.
function Ico(b: Body, size: number) {
  if (!b.dot) return b.icon;
  return <div style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: b.dot, borderWidth: 1, borderColor: "rgba(0,0,0,0.35)" }} />;
}
function lead(b: Body): string { return b.icon ? b.icon + " " : ""; }

// seen from far away (the side view of a fall) the rocket is drawn bigger
let shipScale = 1;

// the ship's parts, each at its offset in the ship's frame (x right, y up, z back)
function part(id: string, off: number[], a: number[], b: number[], c: number[], extra?: any) {
  const right = cross(fwd, up);
  // the part's own axes in the world: columns a, b, c given in the ship frame
  const toWorld = (v: number[]) => add(add(mul(right, v[0]), mul(up, v[1])), mul(fwd, -v[2]));
  const e = euler(toWorld(a), toWorld(b), toWorld(c));
  const p = add(pos, toWorld(mul(off, shipScale)));
  const args: any = { id, x: p[0], y: p[1], z: p[2], rx: e.rx, ry: e.ry, rz: e.rz, sx: shipScale, sy: shipScale, sz: shipScale, visible: true };
  if (extra) for (const k in extra) args[k] = extra[k];
  rg.three("set", args);
}

const PARTS = ["body", "band", "window", "wingL", "wingR", "fin", "flame", "flame2"];
function hideShip() { for (const id of PARTS) rg.three("set", { id, visible: false }); }

function placeShip() {
  // a cone points up its own y: lay it along the nose (−z of the ship)
  const nose = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  const tail = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
  const flat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  part("body", [0, 0, -0.3], nose[0], nose[1], nose[2]);
  part("band", [0, 0, 0.62], nose[0], nose[1], nose[2]);
  part("window", [0, 0.28, -0.4], flat[0], flat[1], flat[2]);
  part("wingL", [-0.6, -0.07, 0.55], flat[0], flat[1], flat[2]);
  part("wingR", [0.6, -0.07, 0.55], flat[0], flat[1], flat[2]);
  part("fin", [0, 0.4, 0.58], flat[0], flat[1], flat[2]);
  const f = thrusting > 0 ? 0.8 + 0.3 * Math.sin(t * 40) : 0;
  const k = shipScale;
  part("flame", [0, 0, 0.95 + 0.55 * f], tail[0], tail[1], tail[2], { visible: f > 0, sy: Math.max(0.01, f) * k });
  part("flame2", [0, 0, 0.9 + 0.35 * f], tail[0], tail[1], tail[2], { visible: f > 0, sy: Math.max(0.01, f) * k });
}

// keeps the camera out of the planets
function outside(c: number[]) {
  for (const b of BODIES) {
    const d = sub(c, b.pos);
    const l = len(d);
    if (l < b.r + 2) c = add(b.pos, mul(d, (b.r + 2) / l));
  }
  return c;
}

// behind the rocket
function camera(snap: number) {
  const want = add(add(pos, mul(fwd, -11)), mul(up, 4.2));
  const k = Math.min(1, snap);
  cam.pos = outside(add(cam.pos, mul(sub(want, cam.pos), k)));
  cam.look = add(cam.look, mul(sub(add(add(pos, mul(fwd, 30)), mul(up, 2.5)), cam.look), k));
  cam.up = norm(add(cam.up, mul(sub(up, cam.up), k)));
  rg.three("camera", { x: cam.pos[0], y: cam.pos[1], z: cam.pos[2], lookAt: cam.look, up: cam.up, fov: FOV });
}

function start() {
  screen = "play";
  rg.sound("click");
  reset();
  say(rg.t("Vedä kääntääksesi. Paina KAASUTA lentääksesi!", "Drag to steer. Hold THRUST to fly!", "Arrastra para girar. Mantén ACELERAR para volar."));
}

// ---- controls ----------------------------------------------------------------

const PAD_R = 54;

// Large circular touch target for web, Android and desktop mouse.
// Two fingers: one steers, while another can hold the engine.
function onThrottleButton(px:number,py:number) {
  const dx=px-(width-58), dy=py-(height-58);
  return dx*dx+dy*dy<=54*54;
}
function onPointerDown(px: number, py: number, info: any) {
  if (screen === "title") { start(); return; }
  if (auto) return;
  if (onThrottleButton(px,py)) {
    throttlePointer = info.pointer;
    return;
  }
  if (stick) return; // another finger must not steal the steering stick
  stick = { id: info.pointer, x: px, y: py, dx: 0, dy: 0, t, moved: false };
}
function onPointerUp(px: number, py: number, info: any) {
  if (info.pointer === throttlePointer) {
    throttlePointer = null;
    return;
  }
  if (!stick || stick.id !== info.pointer) return;
  const tap = !stick.moved && t - stick.t < TAP_TIME;
  stick = null;
  if (tap && !fall && !auto && !onThrottleButton(px,py)) {
    const b = bodyAt(px, py);
    if (b) startAuto(b);
  }
}

function onKeyDown(key: string) {
  if (screen === "title" && (key === " " || key === "Enter")) start();
  if (key === "r" && screen === "play") { reset(); say(rg.t("Takaisin Maan luo", "Back to the Earth", "De vuelta a la Tierra")); }
}

function onBack() {
  if (screen === "play") screen = "title"; else rg.exit();
}

// a finger's drag beyond the still zone, as -1…1
function axis(d: number) {
  const a = Math.max(0, Math.abs(d) - STILL) / PAD_R;
  return (d < 0 ? -1 : 1) * Math.min(1, a);
}

function controls() {
  const k = __input.keys;
  const pointers = __input.pointers || [];
  let yaw = 0, pitch = 0;
  if (k["ArrowLeft"] || k["a"]) yaw += 1;
  if (k["ArrowRight"] || k["d"]) yaw -= 1;
  if (k["ArrowUp"]) pitch += 1;
  if (k["ArrowDown"]) pitch -= 1;

  // Sample all fingers, not just the first one. This works when the throttle
  // button receives its own pointer event rather than the game's global one.
  let gasDown = false;
  for (const p of pointers) {
    if (p.down && (onThrottleButton(p.x,p.y) ||
      (throttlePointer !== null && p.id === throttlePointer))) gasDown = true;
  }
  if (stick) {
    let steeringDown = false;
    for (const p of pointers) {
      if (!p.down || p.id !== stick.id) continue;
      steeringDown = true;
      stick.dx = p.x - stick.x; stick.dy = p.y - stick.y;
      if (Math.abs(stick.dx)>STILL || Math.abs(stick.dy)>STILL) stick.moved = true;
    }
    if (steeringDown) {
      yaw -= axis(stick.dx);
      pitch -= axis(stick.dy);
    } else {
      stick = null;
    }
  }
  // Holding a stationary steering finger NEVER ignites the engine.
  const thrust = !!(k["w"] || k[" "] || gasDown);
  return { yaw, pitch, thrust };
}

// ---- quick flight ------------------------------------------------------------

function startAuto(b: Body) {
  const d = sub(pos, b.pos);
  const to = add(b.pos, mul(norm(d), b.r * b.soi * 1.06));
  if (len(sub(to, pos)) < 20) return;
  auto = { b, from: pos, to, f0: fwd, t: 0 };
  vel = [0, 0, 0];
  rg.sound("click");
  say("🚀 " + rg.t("Pikalento", "Quick flight", "Vuelo rápido") + ": " + lead(b) + b.name);
}

let autoSpeed = 0;
function stepAuto(dt: number) {
  if (!auto) return;
  auto.t += dt;
  const u = Math.min(1, auto.t / AUTO_TIME);
  const e = u * u * (3 - 2 * u);
  const prev = pos;
  pos = add(auto.from, mul(sub(auto.to, auto.from), e));
  autoSpeed = len(sub(pos, prev)) / Math.max(1e-6, dt);
  // the nose turns to the planet during the first half
  const want = norm(sub(auto.b.pos, pos));
  const w = Math.min(1, u * 2);
  fwd = norm(add(mul(auto.f0, 1 - w), mul(want, w)));
  if (len(fwd) < 0.5) fwd = want;
  up = norm(cross(cross(fwd, up), fwd));
  if (len(up) < 0.5) up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
  thrusting = u < 0.8 ? 1 : 0;
  if (u >= 1) { auto = null; thrusting = 0; }
}

// ---- physics -----------------------------------------------------------------

function pullAt(b: Body, r: number) {
  const reach = b.r * b.soi;
  if (r > reach) return 0;
  // the real 1/r² pull, fading out at the edge of its reach
  const fade = Math.min(1, (reach - r) / (reach * 0.35));
  return b.pull * (b.r / r) * (b.r / r) * fade * fade * (3 - 2 * fade);
}

function gravity(p: number[]) {
  let acc = [0, 0, 0];
  let strongest = 0;
  let who: Body | null = null;
  for (const b of BODIES) {
    const d = sub(b.pos, p);
    const r = len(d);
    const a = pullAt(b, r);
    if (a <= 0) continue;
    acc = add(acc, mul(d, a / r));
    if (a > strongest) { strongest = a; who = b; }
  }
  return { acc, who, strongest };
}

// the speed straight up from the surface that carries the rocket out of the
// pull, a little more so it does not crawl over the edge
const escapes: any = {};
function escape(b: Body) {
  if (escapes[b.id]) return escapes[b.id];
  const r0 = b.r + SHIP_R, r1 = b.r * b.soi;
  let e = 0;
  const n = 200;
  for (let i = 0; i < n; i++) e += pullAt(b, r0 + (r1 - r0) * (i + 0.5) / n) * (r1 - r0) / n;
  const v = Math.sqrt(2 * e) * 1.18 + 6;
  escapes[b.id] = v;
  return v;
}

function startFall(b: Body) {
  // Only enable gravity-field status. Never move, rotate, or zoom the camera.
  fall = { b, bounced: false, t: 0 };
  // Keep the finger held down when entering the gravity field.
  rg.vibrate(25);
  say(lead(b) + b.name + " " + rg.t("vetää sinua!", "pulls you in!", "¡te atrae!"));
}

function step(dt: number, c: any) {
  if (c) {
    // Manual rotation and thrust also work while a planet is pulling us in.
    if (c.yaw) { fwd = norm(rotate(fwd, up, c.yaw * TURN * dt)); }
    if (c.pitch) { const r = cross(fwd, up); fwd = norm(rotate(fwd, r, c.pitch * TURN * dt)); up = norm(rotate(up, r, c.pitch * TURN * dt)); }
    up = norm(cross(cross(fwd, up), fwd));
    thrusting = c.thrust ? 1 : 0;
    if (c.thrust) vel = add(vel, mul(fwd, THRUST * dt));
  } else {
    // No active controls: preserve the rocket's pointing direction.
    thrusting = 0;
    up = norm(cross(cross(fwd, up), fwd));
    if (len(up) < 0.5) up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
  }
  const g = gravity(pos);
  vel = add(vel, mul(g.acc, dt));
  near = g.who;
  nearAcc = g.strongest;
  const s = len(vel);
  if (!fall) {
    // the engine has a top speed, and without it the rocket slows down
    if (s > MAX_SPEED) vel = mul(vel, Math.max(MAX_SPEED, s - 60 * dt) / s);
    if (!thrusting && !near) vel = mul(vel, Math.exp(-DRAG * dt));
  }
  pos = add(pos, mul(vel, dt));
  if (!fall && near) startFall(near);
  // bounce off the surfaces: like a rubber ball, high enough to get back to space
  for (const b of BODIES) {
    const d = sub(pos, b.pos);
    const r = len(d);
    if (r >= b.r + SHIP_R) continue;
    const n = mul(d, 1 / r);
    pos = add(b.pos, mul(n, b.r + SHIP_R));
    const vn = dot(vel, n);
    if (vn < 0) {
      const tang = sub(vel, mul(n, vn));
      vel = add(mul(tang, 0.5), mul(n, escape(b)));
      hit(b, -vn);
      if (fall) fall.bounced = true;
    }
    land(b);
  }
  if (fall) {
    fall.t += dt;
    const out = len(sub(pos, fall.b.pos)) > fall.b.r * fall.b.soi;
    // Gravity status ends at the edge of the field; no camera transition.
    if (out || fall.t > 30) endFall();
  }
}

function endFall() {
  // The rocket keeps exactly the orientation the player gave it.
  fall = null;
  near = null;
}

function hit(b: Body, speed: number) {
  if (t - lastBounce > 0.25) {
    bounces++;
    rg.sound("jump", { pitch: Math.max(0.5, Math.min(1.8, 30 / (speed + 10))) , volume: Math.min(1, 0.3 + speed / 40) });
    rg.vibrate(Math.min(80, 10 + speed * 2));
  }
  lastBounce = t;
  bounceText = b.id === "sun" ? rg.t("Kuumaa! Pomppu!", "Hot! Boing!", "¡Quema! ¡Bote!") : rg.t("Pomppu!", "Boing!", "¡Bote!");
}

function land(b: Body) {
  if (visited[b.id]) return;
  visited[b.id] = true;
  const n = Object.keys(visited).length;
  rg.celebrate(width / 2, height * 0.3, { count: 18 });
  if (n === BODIES.length) {
    say(rg.t("Kävit kaikilla! Mahtavaa!", "You visited them all! Great!", "¡Los visitaste todos! ¡Genial!"));
    rg.celebrate(width / 2, height * 0.35, { big: true });
    if (bounces < best || best === 0) { best = bounces; rg.save("best", best); }
  } else {
    say(lead(b) + b.name + " " + rg.t("käyty!", "visited!", "¡visitado!") + " " + n + "/" + BODIES.length);
  }
}

function tick(dt: number) {
  t += dt;
  // the planets turn
  for (const b of BODIES) rg.three("planet", { id: b.id, spin: (b.turn || 0) + t * b.spin });
  if (messageClock > 0) messageClock -= dt;
  if (screen !== "play") {
    // the title: the camera slowly circles the Earth
    const earth = BODIES[3];
    const a = t * 0.08;
    const c = add(earth.pos, [-Math.cos(a) * 290, 70, Math.sin(a) * 290]);
    rg.three("camera", { x: c[0], y: c[1], z: c[2], lookAt: add(earth.pos, [0, 20, 0]), up: [0, 1, 0], fov: FOV });
    hideShip();
    return;
  }
  const h = Math.min(dt, 0.05);
  if (auto) {
    stepAuto(h);
  } else {
    // Read controls throughout gravity-assisted descent and ascent too.
    const c = controls();
    const n = fall ? 8 : 4;
    // Keep exactly the same simulation speed in space and in gravity.
    for (let i = 0; i < n; i++) step(h / n, c);
  }
  // One chase camera for all flight states, including inside gravity fields.
  camera(auto ? 1 : Math.min(1, dt * 4));
  placeShip();
  if (near) alt = len(sub(pos, near.pos)) - near.r - SHIP_R;
  updateOrbitPrediction();
  if (near && !auto) {
    const maneuver=orbitManeuver(near);
    if (thrusting) {
      if (!orbitBurnWasActive) orbitBurnLatch=Math.max(0.2,maneuver.seconds);
      orbitBurnWasActive=true;
    } else {
      orbitBurnWasActive=false;
      orbitBurnLatch=0;
    }
    // Only reward a stable near-orbit, not a single passing frame.
    orbitStableSeconds=maneuver.ready?orbitStableSeconds+h:0;
    if (orbitStableSeconds>=1.1 && orbitCelebrateBody!==near.id) {
      orbitCelebrateBody=near.id;
      rg.sound("win",{volume:0.55});
      rg.celebrate(width/2,height*0.34,{big:true});
    }
  } else {
    orbitBurnWasActive=false;
    orbitBurnLatch=0;
    orbitStableSeconds=0;
  }
  sky();
}

// the sky turns to the colour of the air close to a planet that has some
function sky() {
  let col = BG;
  for (const b of BODIES) {
    if (!b.sky) continue;
    const a = len(sub(cam.pos, b.pos)) - b.r;
    const k = Math.max(0, Math.min(1, 1 - a / (b.r * 0.12)));
    if (k > 0) { const s = hex(b.sky); col = [BG[0] + (s[0] - BG[0]) * k, BG[1] + (s[1] - BG[1]) * k, BG[2] + (s[2] - BG[2]) * k]; }
  }
  const key = rgb(col);
  if (key !== skyKey) { skyKey = key; rg.three("scene", { background: key }); }
}


// ---- orbital navigation ------------------------------------------------------

// The suggested ring is safely within the strong part of the game's
// gravitational field, so its speed estimate follows this game's pullAt().
function orbitMetrics(b: Body) {
  const rel = sub(pos, b.pos);
  const radius = Math.max(b.r + SHIP_R, len(rel));
  const radial = norm(rel);
  const radialSpeed = dot(vel, radial);
  const sideVel = sub(vel, mul(radial, radialSpeed));
  const sideways = len(sideVel);
  let tangent = norm(sideVel);
  if (len(tangent) < 0.1) tangent = norm(cross([0, 1, 0], radial));
  if (len(tangent) < 0.1) tangent = norm(cross([1, 0, 0], radial));

  const targetRadius = b.r * ORBIT_RING_RADIUS;
  const targetSpeed = Math.sqrt(Math.max(0, pullAt(b, targetRadius) * targetRadius));
  const localSpeed = Math.sqrt(Math.max(0, pullAt(b, radius) * radius));
  const ratio = localSpeed > 0.01 ? sideways / localSpeed : 0;
  const atGuide = Math.abs(radius - targetRadius) < b.r * 0.3;
  let status = rg.t("KOHOTA / LASKE", "ADJUST HEIGHT", "AJUSTA ALTURA");
  if (atGuide) {
    if (Math.abs(radialSpeed) > Math.max(3, localSpeed * 0.27))
      status = rg.t("TASAA PYSTYVAUHTI", "REDUCE RADIAL SPEED", "REDUCE VELOCIDAD RADIAL");
    else if (ratio < 0.86)
      status = rg.t("LIIAN HIDAS", "TOO SLOW", "MUY LENTO");
    else if (ratio > 1.14)
      status = rg.t("LIIAN NOPEA", "TOO FAST", "MUY RÁPIDO");
    else
      status = rg.t("LÄHELLÄ KIERTORATAA", "NEAR ORBIT", "CASI EN ÓRBITA");
  }
  return {radial, radius, radialSpeed, sideways, tangent, targetRadius,
          targetSpeed, localSpeed, ratio, status, atGuide};
}


// A simple, actionable maneuver planner: a desired velocity at the guide
// ring minus the current velocity. Its direction is where to point the nose.
// Time = required change in speed / engine acceleration, updated in flight.
// Because gravity keeps acting and the ship moves, this is a LIVE ESTIMATE.
function orbitManeuver(b:Body) {
  const m=orbitMetrics(b);
  const heightError=m.targetRadius-m.radius;
  // A modest radial component takes the rocket toward the guide ring.
  // At the ring, radial velocity is reduced to zero.
  const desiredRadial=Math.max(-14,Math.min(14,heightError*0.15));
  const desired=add(mul(m.tangent,m.targetSpeed),mul(m.radial,desiredRadial));
  const delta=sub(desired,vel);
  const dv=len(delta);
  const seconds=dv/THRUST;
  const ready=Math.abs(heightError)<b.r*0.22
    && Math.abs(m.radialSpeed)<Math.max(2.4,m.localSpeed*0.13)
    && Math.abs(m.sideways-m.localSpeed)<Math.max(1.4,m.localSpeed*0.11);
  const direction=dv>0.001?mul(delta,1/dv):m.tangent;
  const locked=dot(fwd,direction)>0.952;
  // Both speed-up and slow-down use the very same forward-thrust control.
  // Minus means the green aiming reticle points partly retrograde.
  const sign=m.sideways>m.targetSpeed? "−" : "+";
  return {m,delta,dv,seconds,direction,locked,ready,sign};
}

// The green crosshair floats at the direction in which the engine should push.
// The flight camera never changes; only this HUD marker moves as you steer.
function orbitReticle() {
  if(!near || auto) return null;
  const p=orbitManeuver(near);
  if(p.ready) return null;
  const f=norm(sub(cam.look,cam.pos));
  const right=norm(cross(f,cam.up));
  const upcam=cross(right,f);
  const q=project(add(pos,mul(p.direction,100)));
  let px=q?q.x:width/2+dot(p.direction,right)*300;
  let py=q?q.y:height/2-dot(p.direction,upcam)*300;
  if(!q && Math.abs(px-width/2)<8) px=width/2+70;
  const minY=148,maxY=Math.max(220,height-245);
  px=Math.max(34,Math.min(width-34,px));
  py=Math.max(minY,Math.min(maxY,py));
  const shipPoint=project(pos);
  const sx=shipPoint?shipPoint.x:width*0.5;
  const sy=shipPoint?shipPoint.y:height*0.4;
  const dx=px-sx,dy=py-sy;
  const distance=Math.sqrt(dx*dx+dy*dy);
  const ux=distance>0.1?dx/distance:0;
  const uy=distance>0.1?dy/distance:-1;
  const ax=Math.max(20,Math.min(width-20,sx+ux*58));
  const ay=Math.max(146,Math.min(maxY-8,sy+uy*58));
  const angle=Math.atan2(dy,dx)*180/Math.PI;
  return <div className="orbitReticleLayer">
    {!p.locked && distance>70
      ? <div className="orbitAimArrow" style={{left:ax-13,top:ay-13,
          transform:"rotate("+angle+"deg)"}}>➤</div>
      : null}
    <div className={p.locked?"orbitSight locked":"orbitSight"} style={{left:px-25,top:py-25}}>
      {p.locked?<div className="sightGoldHalo"/>:null}
      <div className={p.locked?"sightRing aligned":"sightRing"}/>
      <div className={p.locked?"sightCrossH aligned":"sightCrossH"}/>
      <div className={p.locked?"sightCrossV aligned":"sightCrossV"}/>
      <div className={p.locked?"sightDot aligned":"sightDot"}/>
    </div>
  </div>;
}

// Predict the unpowered flight using exactly the same in-game gravity()
// as the actual rocket. Stop at an impact (before the game's bounce) or
// once the rocket leaves the selected body's sphere of influence.
function updateOrbitPrediction() {
  if (!near || auto) {
    orbitTrail=[]; orbitGuide=[]; orbitLaneInner=[]; orbitLaneOuter=[];
    orbitBodyId=""; orbitOutcome="";
    return;
  }
  const b=near;
  if (orbitBodyId===b.id && t-orbitCacheAt<0.24) return;
  orbitCacheAt=t;
  orbitBodyId=b.id;
  const m=orbitMetrics(b);
  orbitGuide=[]; orbitLaneInner=[]; orbitLaneOuter=[];
  const u=m.radial, v=m.tangent;
  for(let j=0;j<=64;j++) {
    const a=j*Math.PI*2/64;
    const circle=add(mul(u,Math.cos(a)),mul(v,Math.sin(a)));
    orbitGuide.push(add(b.pos,mul(circle,m.targetRadius)));
    orbitLaneInner.push(add(b.pos,mul(circle,m.targetRadius-b.r*0.09)));
    orbitLaneOuter.push(add(b.pos,mul(circle,m.targetRadius+b.r*0.09)));
  }
  let pp=[pos[0],pos[1],pos[2]];
  let vv=[vel[0],vel[1],vel[2]];
  orbitTrail=[pp];
  orbitOutcome="orbit";
  const dtPred=0.26;
  const maxSteps=300; // 78 s: at least one revolution for most bodies
  for(let i=0;i<maxSteps;i++){
    const g=gravity(pp);
    vv=add(vv,mul(g.acc,dtPred));
    // Match space drag/cap for the part of the forecast outside gravity.
    if(!g.who) {
      const s=len(vv);
      if(s>MAX_SPEED) vv=mul(vv,Math.max(MAX_SPEED,s-60*dtPred)/s);
      vv=mul(vv,Math.exp(-DRAG*dtPred));
    }
    pp=add(pp,mul(vv,dtPred));
    if(i%3===2) orbitTrail.push(pp);
    const radius=len(sub(pp,b.pos));
    if(radius<=b.r+SHIP_R){
      orbitTrail.push(pp);
      orbitOutcome="impact";
      break;
    }
    if(radius>=b.r*b.soi){
      orbitTrail.push(pp);
      orbitOutcome="escape";
      break;
    }
  }
}

// Hide projected line sections behind the solid planet (no X-ray overlay).
function orbitVisible(p:number[], b:Body) {
  const ray=sub(p,cam.pos);
  const dist=len(ray);
  if(dist<0.001) return false;
  const rayDir=mul(ray,1/dist);
  const origin=sub(cam.pos,b.pos);
  const half=dot(origin,rayDir);
  const discriminant=half*half-(dot(origin,origin)-b.r*b.r);
  if(discriminant<=0) return true;
  const hitDist=-half-Math.sqrt(discriminant);
  return !(hitDist>0 && hitDist<dist-0.5);
}
function orbitSegment(a:any,c:any,color:string,thickness:number) {
  const dx=c.x-a.x, dy=c.y-a.y;
  const dist=Math.sqrt(dx*dx+dy*dy);
  if(dist<1 || dist>width*1.35) return null;
  if(Math.min(a.x,c.x)>width+30 || Math.max(a.x,c.x)<-30
     || Math.min(a.y,c.y)>height+30 || Math.max(a.y,c.y)<-30) return null;
  return <div className="orbitSegment"
      style={{left:(a.x+c.x)*0.5-dist*0.5,top:(a.y+c.y)*0.5-thickness*0.5,
        width:dist,height:thickness,backgroundColor:color,
        transform:"rotate("+(Math.atan2(dy,dx)*180/Math.PI)+"deg)"}} />;
}
function orbitProjected(points:number[][],b:Body,color:string,dashed:boolean) {
  const out:any[]=[];
  for(let i=1;i<points.length;i++) {
    if(dashed && (i%2)===0) continue;
    const p=points[i-1], q=points[i];
    if(!orbitVisible(p,b)||!orbitVisible(q,b)) continue;
    const a=project(p),c=project(q);
    if(a&&c){
      const seg=orbitSegment(a,c,color,dashed?1.25:2.1);
      if(seg)out.push(seg);
    }
  }
  return out;
}
function orbitGraphic() {
  if(!near||auto||!orbitGuide.length) return null;
  const b=near;
  const predictedColor=orbitOutcome==="impact"?"rgba(255,164,103,0.48)":
    orbitOutcome==="escape"?"rgba(109,195,240,0.43)":"rgba(110,244,184,0.55)";
  return <div className="orbitGraphics">
    {orbitProjected(orbitLaneInner,b,"rgba(100,220,175,0.18)",true)}
    {orbitProjected(orbitLaneOuter,b,"rgba(100,220,175,0.18)",true)}
    {orbitProjected(orbitGuide,b,"rgba(164,255,215,0.46)",true)}
    {orbitProjected(orbitTrail,b,predictedColor,false)}
  </div>;
}
function orbitHud() {
  if(!near||auto) return null;
  const p=orbitManeuver(near);
  const sec=p.ready?0:Math.max(0,p.seconds);
  const full=orbitBurnWasActive?Math.max(orbitBurnLatch,0.3):Math.max(sec,0.3);
  const remaining=p.ready?1:Math.max(0,Math.min(1,sec/full));
  const aligned=p.locked&&!p.ready;
  return <div className={p.ready?"orbitAssist success":"orbitAssist"}>
    <div className="orbitAssistRow">
      <div className="orbitAssistLabel">◉ ORBIT ASSIST</div>
      {p.ready
        ? <div className="orbitAssistCheck">✓</div>
        : <div className={aligned?"orbitAssistTimer aligned":"orbitAssistTimer"}>{fmt(sec,1)+" s"}</div>}
    </div>
    <div className="orbitBurnTrack">
      {aligned?<div className="orbitBurnGlow"/>:null}
      <div className={aligned?"orbitBurnFill aligned":"orbitBurnFill"} style={{width:remaining*294}}/>
    </div>
  </div>;
}

// ---- the view ----------------------------------------------------------------

// a world point on the screen, as the engine projects it (null: behind)
function project(p: number[]) {
  const f = norm(sub(cam.look, cam.pos));
  let r = norm(cross(f, cam.up));
  const u = cross(r, f);
  const d = sub(p, cam.pos);
  const z = dot(d, f);
  if (z < 0.1) return null;
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  return { x: width / 2 + dot(d, r) / z * focal, y: height / 2 - dot(d, u) / z * focal, z };
}

function fmt(n: number, d = 1) {
  const s = n.toFixed(d);
  return rg.lang === "en" ? s : s.replace(".", ",");
}

function km(units: number) {
  const k = Math.round(units * 64);
  if (k < 1000) return k + " km";
  const t = Math.round(k / 1000);
  return (t >= 1000 ? Math.floor(t / 1000) + " " + String(t % 1000 + 1000).slice(1) : String(t)) + " 000 km";
}

// where each body is on the screen: its disk (tappable, labelled), or its
// icon at the edge of the screen when it is out of sight
function spots() {
  const out: any[] = [];
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  const f = norm(sub(cam.look, cam.pos));
  const rr = norm(cross(f, cam.up));
  const u = cross(rr, f);
  for (const b of BODIES) {
    const d = len(sub(b.pos, pos)) - b.r;
    const s = project(b.pos);
    if (s && s.x > 0 && s.x < width && s.y > 0 && s.y < height) {
      const rpx = b.r / s.z * focal;
      out.push({ b, d, edge: false, x: s.x, y: s.y, rpx });
    } else {
      // off the screen: its icon at the edge, towards it
      const dd = sub(b.pos, cam.pos);
      let ax = dot(dd, rr), ay = -dot(dd, u);
      const l = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= l; ay /= l;
      // from the middle of the free area (below the HUD) to its edge
      const top = 130, bottom = height - 60;
      const cy = (top + bottom) / 2;
      const k = Math.min((width / 2 - 22) / Math.max(0.01, Math.abs(ax)), (bottom - top) / 2 / Math.max(0.01, Math.abs(ay)));
      out.push({ b, d, edge: true, x: width / 2 + ax * k, y: cy + ay * k, rpx: 16 });
    }
  }
  return out;
}

// the body a tap at (px, py) points at: an edge icon, a planet's disk or its label
function bodyAt(px: number, py: number) {
  let best: Body | null = null, bestD = 1e9;
  for (const s of spots()) {
    if (s.d < s.b.r * 0.3) continue;
    const r = s.edge ? 30 : Math.max(30, s.rpx + 8);
    let dd = Math.hypot(px - s.x, py - s.y);
    // the label above the disk counts too
    if (!s.edge && Math.abs(px - s.x) < 80 && Math.abs(py - (s.y - s.rpx - 12)) < 18) dd = Math.min(dd, r - 1);
    if (dd < r && dd - r < bestD) { bestD = dd - r; best = s.b; }
  }
  return best;
}

function markers() {
  const out = [];
  for (const s of spots()) {
    const b = s.b;
    if (s.d < b.r * 0.6) continue;
    if (!s.edge) {
      if (s.rpx > width * 0.9) continue;
      const y = s.y - s.rpx - 20;
      if (y < 120 || y > height - 60) continue;
      out.push(<div className={visited[b.id] ? "mark seen" : "mark"} style={{ left: Math.max(4, Math.min(width - 164, s.x - 80)), top: y }}>{b.name + " · " + km(s.d)}</div>);
    } else {
      out.push(<div className={visited[b.id] ? "edge seen" : "edge"} style={{ left: s.x - 16, top: s.y - 16 }}>{Ico(b, 18)}</div>);
    }
  }
  return out;
}

function view() {
  if (screen === "title") {
    return (
      <div className="screen">
        <div className="overlay">
          <div className="big">🚀 {rg.t("Painovoimalento", "Gravity Flight", "Vuelo gravitatorio")}</div>
          <div className="text">{rg.t("Lennä planeettojen luo. Lähellä planeetta vetää sinua puoleensa, ja pinnalta pomppaat kuin kumipallo. Käy jokaisella!",
            "Fly to the planets. Close up a planet pulls you in, and you bounce off its surface like a rubber ball. Visit every one!",
            "Vuela hacia los planetas. De cerca un planeta te atrae y rebotas en su superficie como una pelota de goma. ¡Visítalos todos!")}</div>
          <div className="text small">{rg.t("Vedä sormella kääntääksesi. Pidä erillistä KAASUTA-painiketta pohjassa lentääksesi, myös toisella sormella. Napauta planeettaa pikalentoa varten.",
            "Drag to steer. Hold the separate THRUST button to fly, even with a second finger. Tap a planet for quick travel.",
            "Arrastra para girar. Mantén el botón ACELERAR para volar, incluso con otro dedo. Toca un planeta para viajar rápido.")}</div>
          <div className="go">{rg.t("Napauta ja lähde!", "Tap to go!", "¡Toca para salir!")}</div>
          {best > 0 ? <div className="text small">{rg.t("Kaikki käyty pienimmillä pompuilla", "All visited with the fewest bounces", "Todos visitados con menos botes")}: {best}</div> : null}
        </div>
      </div>
    );
  }
  const speed = auto ? autoSpeed : len(vel);
  const maneuver = near && !auto ? orbitManeuver(near) : null;
  const aimingCorrectly = !!(maneuver && maneuver.locked && !maneuver.ready);
  const badges = BODIES.map((b) => <div className={visited[b.id] ? "badge on" : "badge"}>{Ico(b, 15)}</div>);
  const pull = near ? nearAcc / FALL : 0;
  const info = near
    ? <div className="pill col">
        <div className="pname">{lead(near) + near.name + " · " + fmt(near.g) + " m/s²"}</div>
        <div className="pline">{rg.t("vetää nyt", "pulling now", "atrae ahora")} {fmt(pull)} m/s² · {rg.t("korkeus", "height", "altura")} {km(Math.max(0, alt))}</div>
      </div>
    : <div className="pill col"><div className="pline">{rg.t("Avaruudessa: mikään ei vedä", "In space: nothing pulls", "En el espacio: nada te atrae")}</div></div>;
  return (
    <div className="screen">
      {orbitGraphic()}
      {orbitReticle()}
      {fall || auto ? null : markers()}
      <div className="hud">
        {info}
        <div className="row">{badges}</div>
      </div>
      {orbitHud()}
      <div className="speed">{fmt(speed * 64 / 1000)} {rg.t("t. km/s", "k km/s", "mil km/s")}{thrusting ? " 🔥" : ""}</div>
      {t - lastBounce < 0.7 ? <div className="boing" style={{ top: height * 0.38 }}><div className="boingt">{bounceText}</div></div> : null}
      {messageClock > 0 ? <div className="msg" style={{ top: height * 0.3 }}>{message}</div> : null}
      {stick && stick.moved ? <div className="stick" style={{ left: stick.x - PAD_R, top: stick.y - PAD_R, width: PAD_R * 2, height: PAD_R * 2, borderRadius: PAD_R }}>
        <div className="knob" style={{ left: PAD_R - 18 + Math.max(-PAD_R, Math.min(PAD_R, stick.dx)), top: PAD_R - 18 + Math.max(-PAD_R, Math.min(PAD_R, stick.dy)) }}></div>
      </div> : null}
      <div className={aimingCorrectly
          ? (thrusting>0?"throttleButton active aligned":"throttleButton aligned")
          : (thrusting>0?"throttleButton active":"throttleButton")}
        onPointerDown={(e:any) => { throttlePointer = e.pointer; }}
        onPointerUp={(e:any) => { if (throttlePointer === e.pointer) throttlePointer = null; }}>
        {aimingCorrectly?<div className="throttleGoldHalo"/>:null}
        <div className="throttleShine"/>
        <div className="throttleInner"/>
        <div className="throttleSymbol">▲</div>
        <div className="throttleText">{rg.t("KAASU","THRUST","GAS")}</div>
      </div>
    </div>
  );
}
