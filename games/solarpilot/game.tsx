// Solar Pilot: the solar system at its real scale. The Sun, the planets and
// the Moon have their real radii, masses (GM), rotation periods and distances
// from the Sun; low orbits are at real altitudes (the Moon 100 km, the Earth
// 400 km like the ISS). Units are kilometres and the physics is Newton's.
//
// Two helps make it a game:
// - Near a body time runs faster (×60…×200), so that one low orbit takes about
//   90 seconds, and the engine is strong enough to circularize in a few seconds.
// - Between the bodies the ship flies in "supercruise": its top speed grows
//   with the distance to the nearest body (far faster than light), and a tap on
//   a body (or its tag at the screen's edge) is an autopilot warp to it.
//
// Goal: reach a stable low orbit round each of the 7 bodies, or land softly
// on the ones that have a solid surface. The ship's deflector bounces it off a
// surface hit too hard (and off the Sun and Jupiter's cloud tops).
//
// The ship computer HUD is a green phosphor terminal.
//
// Based on Painovoimalento (the children's version with a scaled-down solar
// system).

import { surface } from "lib/surfaces";
import { MODEL as SHIP } from "lib/keha";
// Kehä's own colours a little darker (0.62): the light grey hull looked white in the sun
// (the glowing triangles keep theirs)
const GLOWING = new Set<number>(SHIP.glow);
function darker(c: number) {
  const k = 0.62;
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

type Body = {
  id: string; code: string; name: string;
  pos: number[];
  r: number;         // radius, km
  gm: number;        // km³/s²
  rot: number;       // rotation period, s (0: kept facing `turn`)
  tilt: number;
  h: number;         // the target low orbit's altitude, km
  soi: number;       // gravity reach, in radii
  land: boolean;     // a solid surface to land on
  atm: number;       // km of air that colours the sky (0: none)
  sky: string;
  turn: number;
  vc: number; warp: number; acc: number; reach: number; g0: number;
  bonus: boolean;    // a bonus find (not a gravity field): BONUS below
};

// ---- vectors -------------------------------------------------------------------

function add(a: number[], b: number[]) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul(a: number[], k: number) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len(a: number[]) { return Math.sqrt(dot(a, a)); }
function norm(a: number[]) { const l = len(a); return l < 1e-12 ? [0, 0, 0] : mul(a, 1 / l); }
function rotate(v: number[], k: number[], a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
function euler(a: number[], b: number[], c: number[]) {
  const m13 = c[0], m23 = c[1], m33 = c[2], m12 = b[0], m11 = a[0], m32 = b[2], m22 = b[1];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999) return { rx: Math.atan2(-m23, m33), ry, rz: Math.atan2(-m12, m11) };
  return { rx: Math.atan2(m32, m22), ry, rz: 0 };
}

// ---- the solar system --------------------------------------------------------

const AU = 149597871;
const C_LIGHT = 299792;
function orbitPos(a: number, deg: number, inc: number) { const r = deg * Math.PI / 180; return [a * Math.cos(r), a * inc, a * Math.sin(r)]; }
const EARTH_POS = [AU, 0, 0];
const MOON_DIR = norm([0.45, 0.1, 0.89]);

function body(id: string, code: string, name: string, pos: number[], r: number, gm: number, rot: number, tilt: number,
              h: number, soi: number, land: boolean, atm: number, sky: string, turn: number): Body {
  return { id, code, name, pos, r, gm, rot, tilt, h, soi, land, atm, sky, turn, vc: 0, warp: 1, acc: 0, reach: 0, g0: 0, bonus: false };
}

const BODIES: Body[] = [
  body("sun", "SOL", rg.t("Aurinko", "Sun", "Sol"), [0, 0, 0], 696000, 1.32712e11, 2.19e6, 0.13, 348000, 2.5, false, 0, "", 0),
  body("mercury", "MER", rg.t("Merkurius", "Mercury", "Mercurio"), orbitPos(57.9e6, 200, 0.06), 2440, 22032, 5.07e6, 0, 200, 3, true, 0, "", 0),
  body("venus", "VEN", "Venus", orbitPos(108.2e6, 120, 0.03), 6052, 324859, -2.1e7, 0.05, 300, 2.5, true, 250, "#a3864a", 0),
  body("earth", "TER", rg.t("Maa", "Earth", "Tierra"), EARTH_POS, 6371, 398600, 86164, 0.41, 400, 2.5, true, 100, "#3f7fd0", Math.PI),
  body("moon", "LUN", rg.t("Kuu", "Moon", "Luna"), add(EARTH_POS, mul(MOON_DIR, 384400)), 1737, 4904.9, 0, 0.03, 100, 3, true, 0, "",
       Math.atan2(MOON_DIR[2], -MOON_DIR[0])),
  body("mars", "MAR", "Mars", orbitPos(227.9e6, 60, -0.02), 3390, 42828, 88643, 0.44, 300, 3, true, 60, "#b07a58", 0),
  body("jupiter", "JUP", rg.t("Jupiter", "Jupiter", "Júpiter"), orbitPos(778.5e6, -40, 0.02), 69911, 1.26687e8, 35730, 0.05, 5000, 2, false, 300, "#7d6a52", 0),
];

// ---- bonus finds ---------------------------------------------------------------
// Small bodies at (roughly) their real places in late 2026. They show on the
// map and as tags only near (`seen`), are found within `find`, and a find is
// kept (rg.save "found"). Supercruise slows down near them, which is a hint.
// The regions (belt, Kuiper belt, Oort cloud) are found by flying into them.
function eclPos(au: number, deg: number, lat: number) {
  const a = au * AU, t = deg * Math.PI / 180, p = lat * Math.PI / 180;
  return [a * Math.cos(p) * Math.cos(t), a * Math.sin(p), a * Math.cos(p) * Math.sin(t)];
}
type BonusInfo = { find: number; seen: number; color: string; fact: string };
const BONUS: Body[] = [];
const BONUS_INFO: { [id: string]: BonusInfo } = {};
function bonus(id: string, code: string, name: string, p: number[], r: number, find: number, seenAu: number, color: string, fact: string) {
  const b = body(id, code, name, p, r, 0, 0, 0, 0, 1, false, 0, "", 0);
  b.bonus = true;
  b.reach = find * 0.8;
  BONUS.push(b);
  BONUS_INFO[id] = { find, seen: seenAu * AU, color, fact };
}
bonus("ceres", "CER", "Ceres", eclPos(2.77, 150, 3), 470, 100000, 0.6, "#a59d92",
  rg.t("Asteroidivyöhykkeen suurin kappale ja kääpiöplaneetta, halkaisija 940 km.", "The largest body of the asteroid belt, a dwarf planet 940 km across.", "El mayor cuerpo del cinturón de asteroides, un planeta enano de 940 km."));
bonus("vesta", "VES", "Vesta", eclPos(2.36, 250, -4), 263, 80000, 0.6, "#b8ad9c",
  rg.t("Kirkkain asteroidi. Etelänavalla on 500 km leveä törmäyskraatteri.", "The brightest asteroid. Its south pole has a 500 km wide impact crater.", "El asteroide más brillante. Su polo sur tiene un cráter de 500 km."));
bonus("apophis", "APO", "Apophis", eclPos(0.92, 25, 1), 0.17, 20000, 0.1, "#8f8579",
  rg.t("Maan lähelle tuleva asteroidi. 13.4.2029 se ohittaa Maan vain 32 000 km:n päästä.", "A near-Earth asteroid. On 13 April 2029 it passes only 32,000 km from the Earth.", "Un asteroide cercano. El 13-4-2029 pasará a solo 32 000 km de la Tierra."));
bonus("hektor", "HEK", "Hektor", eclPos(5.2, 20, 5), 100, 50000, 1, "#7d6655",
  rg.t("Jupiterin troijalainen: 60° Jupiterin edellä (L4). Kiertää Aurinkoa samassa ajassa kuin Jupiter.", "A Jupiter trojan 60° ahead of Jupiter (L4). It goes round the Sun in Jupiter's time.", "Un troyano de Júpiter, 60° por delante (L4). Gira alrededor del Sol al ritmo de Júpiter."));
bonus("patroclus", "PAT", "Patroklos", eclPos(5.2, -100, -6), 60, 50000, 1, "#806b5c",
  rg.t("Troijalainen 60° Jupiterin jäljessä (L5). Se on kaksoisasteroidi: kaksi kappaletta kiertää toisiaan.", "A trojan 60° behind Jupiter (L5). It is a double: two bodies circling each other.", "Un troyano 60° por detrás de Júpiter (L5). Es doble: dos cuerpos que giran juntos."));
bonus("halley", "HAL", rg.t("Halleyn komeetta", "Halley's Comet", "Cometa Halley"), eclPos(35.1, 255, -16), 5.5, 50000, 4, "#5f5a55",
  rg.t("Nyt radan uloimmassa kohdassa Neptunuksen takana: jäinen ja ilman pyrstöä. Kierros 76 vuotta, kulkee planeettoja vastaan, rata 18° kallellaan. Palaa Maan lähelle 2061.",
       "Now at the far end of its orbit beyond Neptune: icy, no tail. One round takes 76 years, against the planets, tilted 18°. Back near the Earth in 2061.",
       "Ahora en el punto más lejano de su órbita, sin cola. Una vuelta dura 76 años, al revés que los planetas, inclinada 18°. Vuelve en 2061."));
bonus("pluto", "PLU", "Pluto", eclPos(34.8, 300, -2), 1188, 200000, 5, "#c9b49a",
  rg.t("Kuiperin vyöhykkeen kääpiöplaneetta. Auringon valo tulee tänne 4,8 tunnissa.", "A dwarf planet of the Kuiper belt. Sunlight takes 4.8 hours to get here.", "Planeta enano del cinturón de Kuiper. La luz del Sol tarda 4,8 horas en llegar."));
bonus("atlas", "3I", "3I/ATLAS", eclPos(12.5, 170, 5), 2.8, 30000, 2, "#9a8f86",
  rg.t("Tähtienvälinen vierailija, löydetty 2025. Tullut toisen tähden luota 58 km/s ja lähtee pois, eikä palaa koskaan.", "An interstellar visitor found in 2025. It came from another star at 58 km/s and leaves for good.", "Un visitante interestelar descubierto en 2025. Vino de otra estrella a 58 km/s y no volverá."));
// the regions: [id, name, inner AU, outer AU, fact]
const REGIONS: any[] = [
  ["belt", rg.t("Asteroidivyöhyke", "Asteroid belt", "Cinturón de asteroides"), 2.1, 3.3,
    rg.t("2,1–3,3 AU Marsin ja Jupiterin välissä. Kappaleiden välit ovat miljoonia kilometrejä. Ceres ja Vesta ovat täällä jossain.", "2.1–3.3 AU between Mars and Jupiter. The rocks are millions of km apart. Ceres and Vesta are here somewhere.", "2,1–3,3 UA entre Marte y Júpiter. Las rocas están a millones de km. Ceres y Vesta están por aquí.")],
  ["kuiper", rg.t("Kuiperin vyöhyke", "Kuiper belt", "Cinturón de Kuiper"), 30, 50,
    rg.t("30–50 AU Neptunuksen takana: jäisiä kappaleita, kuten Pluto. Monet lyhytjaksoiset komeetat syntyvät täällä.", "30–50 AU beyond Neptune: icy bodies such as Pluto. Many short-period comets come from here.", "30–50 UA tras Neptuno: cuerpos helados como Plutón. De aquí vienen muchos cometas.")],
  ["oort", rg.t("Oortin pilvi", "Oort cloud", "Nube de Oort"), 2000, 1e9,
    rg.t("Yli 2000 AU: Aurinko on täältä vain kirkas tähti. Pilvi voi ulottua 100 000 AU:hun asti. Pitkäjaksoisten komeettojen koti.", "Beyond 2000 AU the Sun is only a bright star. The cloud may reach 100,000 AU. Home of the long-period comets.", "Más allá de 2000 UA el Sol es solo una estrella. La nube puede llegar a 100 000 UA.")],
];
const FIND_TOTAL = 8 + 3;
let found: { [id: string]: boolean } = {};
let findToast: { title: string; fact: string; t: number } | null = null;
let findQueue: any[] = [];       // finds made at the same time are shown in turn
function loadFound() {
  found = {};
  const s = rg.load("found", "");
  if (s) for (const id of String(s).split(",")) if (id) found[id] = true;
}
function discover(id: string, name: string, fact: string) {
  if (found[id]) return;
  found[id] = true;
  rg.save("found", Object.keys(found).join(","));
  findQueue.push({ title: name, fact, t: 0, n: Object.keys(found).length });
  rg.celebrate(width / 2, height * 0.3, { count: 16 });
  rg.vibrate(40);
}
function checkFinds() {
  for (const b of BONUS) {
    if (!found[b.id] && len(sub(b.pos, pos)) - b.r < BONUS_INFO[b.id].find) discover(b.id, b.name, BONUS_INFO[b.id].fact);
  }
  const au = len(pos) / AU;
  for (const g of REGIONS) {
    if (!found[g[0]] && au >= g[2] && au <= g[3]) discover(g[0], g[1], g[4]);
  }
}
function shade(hexColor: string, k: number) {
  const c = hex(hexColor);
  return rgb([Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]);
}
function bonusSeen(b: Body) { return len(sub(b.pos, pos)) < BONUS_INFO[b.id].seen; }
function done(b: Body) { return b.bonus ? !!found[b.id] : !!visited[b.id]; }
function findToastView() {
  if (!findToast) return null;
  const n = (findToast as any).n;
  return <div className="findToast" style={{ left: midX(12), top: Math.round(height * 0.42) }}>
    <div className="findHead">{"✦ " + rg.t("LÖYTÖ ", "FIND ", "HALLAZGO ") + n + "/" + FIND_TOTAL}</div>
    <div className="findTitle">{findToast.title.toUpperCase()}</div>
    <div className="findFact">{findToast.fact}</div>
  </div>;
}

const ORBIT_GAME_S = 90;     // one target orbit takes this many seconds of play
const BURN_S = 3;            // full throttle reaches the orbital speed in this many seconds
for (const b of BODIES) {
  const rt = b.r + b.h;
  b.vc = Math.sqrt(b.gm / rt);
  b.warp = 2 * Math.PI * Math.sqrt(rt * rt * rt / b.gm) / ORBIT_GAME_S;
  b.acc = b.vc / (BURN_S * b.warp);
  b.reach = b.r * b.soi;
  b.g0 = b.gm / (b.r * b.r);
}

// air for entry: sea-level density (kg/m³), scale height (km), the height
// (km) where the parachute opens. Venus and Jupiter at the 1-bar level
const AIR: any = { earth: [1.225, 8.5, 9], venus: [65, 15.9, 50], mars: [0.02, 11.1, 9], jupiter: [0.16, 27, 0] };
const BETA = 380, BETA_CHUTE = 8;   // ballistic coefficient (kg/m²) of the ship, with the parachute
const Q_MAX = 4;              // MW/m² the heat shield takes
const G_MAX = 12;             // g the crew takes
const CHUTE_V = 0.2;          // km/s: the parachute opens below this

const SHIP_R = 0.03;         // km
const SHIP_SCALE = 0.02;     // the ship model is ~2 units long: 40 m
const CAM_BACK = 0.24, CAM_UP = 0.075, CAM_AHEAD = 1.2, CAM_DOWN = 0.25;
const TURN = 1.6;
const DRAG = 0.6;            // supercruise slows down without thrust (1/s)
const CRUISE_K = 0.55;       // supercruise top speed: this × the distance to the nearest gravity field, per second
const TAP_TIME = 0.36;
const STILL = 14;
const FOV = 62;
const BG = [2, 3, 8];

// ---- state -------------------------------------------------------------------

type Screen = "title" | "play";
let screen: Screen = "title";
let t = 0;
let simT = 0;                 // seconds of the ship's clock
let pos = [0, 0, 0];
let vel = [0, 0, 0];          // in a field: km/s; in supercruise: km per game second
let cruise = 0;               // supercruise speed, km per game second
let fwd = [1, 0, 0];
let up = [0, 1, 0];
let thrusting = 0;
let field: Body | null = null;   // the body whose gravity the ship is in
let landed = false;
let auto: { b: Body; c0: number; c1: number; dir: number[]; dir1: number[]; f0: number[]; t: number; dur: number } | null = null;
let autoSpeed = 0;
let aimAlt = 0;
let heatQ = 0, gLoad = 0;       // the entry's heating (MW/m²) and deceleration (g) now
let shieldHp = 1;               // 1 = whole; over the limits it wears away (per real second)
let chute = false;
let chuteK = 0;                 // 0…1: how far the parachute has opened
let dead: { cause: string; t: number } | null = null;
let checkpoint: any = null;     // where a lost ship starts again
let impactIn = -1;              // real seconds to the surface on the path ahead (-1: none)
let shake = 0;                 // where the approach path's closest point was aimed (km above the surface)
let visited: any = {};
let bounces = 0;
let lastBounce = -10;
let bounceText = "";
let message = "";
let messageClock = 0;
let skyKey = "";
let cam = { pos: [0, 0, 0], look: [1, 0, 0], up: [0, 1, 0] };
let camOff = [0, 0, 0], lookOff = [0, 0, 0];
let origin = [0, 0, 0];       // the engine draws everything relative to this (floating origin)
let stick: { id: number; x: number; y: number; dx: number; dy: number; t: number; moved: boolean } | null = null;
let throttlePointer: number | null = null;
let autoAlign = false;          // the nose follows the orbit assist's burn direction
let sightAt: number[] | null = null;  // where the sight was drawn (screen)
let best = 0;
// 0 kadetti: the autopilot parks in orbit, the sight can steer the nose
// 1 lentäjä: the autopilot stops on an approach path; brake into orbit yourself
// 2 veteraani: a random approach, half the thrust, no automatic aiming
function accK() { return 1; }

let orbitTrail: number[][] = [];
let orbitGuide: number[][] = [];
let orbitLaneInner: number[][] = [];
let orbitLaneOuter: number[][] = [];
let orbitBurnLatch = 0;
let orbitBurnWasActive = false;
let orbitStableSeconds = 0;
let orbitOutcome = "";
let orbitBodyId = "";
let orbitCacheAt = -100;

function rgb(c: number[]) { return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")"; }
function hex(h: string) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function R(p: number[]) { return sub(p, origin); }

function say(text: string) {
  message = text.toUpperCase();
  messageClock = 3.6;
  rg.sound("note", { note: 86, len: 0.05, wave: "square", volume: 0.18 });
}

// ---- the game ----------------------------------------------------------------

function init() {
  best = rg.load("best", 0);
  loadFound();
  build();
  reset();
}

function build() {
  rg.three("clear");
  rg.three("scene", { background: rgb(BG) });
  rg.three("space", { sun: [0, 0, 0], stars: 1100 });
  rg.three("light", { id: "ambient", type: "ambient", intensity: 0.32 });
  rg.three("light", { id: "sun", type: "directional", x: -1, y: 0.3, z: 0.2, intensity: 0.95 });
  for (const b of BODIES) {
    const args = surface(b.id);
    args.id = b.id; args.r = b.r; args.tilt = b.tilt; args.spin = b.turn;
    args.x = b.pos[0]; args.y = b.pos[1]; args.z = b.pos[2];
    rg.three("planet", args);
  }
  for (const b of BONUS) {
    // a cratered ball: the Moon's craters in the body's own colour
    const args = surface("moon");
    args.texture = "";
    const col = BONUS_INFO[b.id].color;
    args.ocean = col;
    args.colors = { sea: shade(col, 0.7), rim: shade(col, 1.15), floor: shade(col, 0.9), bright: shade(col, 1.25) };
    args.id = b.id; args.r = b.r; args.x = b.pos[0]; args.y = b.pos[1]; args.z = b.pos[2];
    rg.three("planet", args);
  }
  // the ship: Kehä, a ring ship from RangerSpaceshipBuilder (lib/keha.ts,
  // `ship scene ships/keha.ship.json`), a blue ion flame behind it
  rg.three("add", { id: "hull", shape: "mesh", verts: SHIP.verts, tris: SHIP.tris, colors: SHIP.colors.map((c: number, i: number) => GLOWING.has(i) ? c : darker(c)), glow: SHIP.glow });
  rg.three("add", { id: "flame", shape: "cone", size: [0.3, 1.2], detail: 8, color: "#58c7ff", emissive: true, visible: false });
  rg.three("add", { id: "flame2", shape: "cone", size: [0.17, 0.8], detail: 8, color: "#e6fbff", emissive: true, visible: false });
  // the entry's plasma: a glowing shock in front, a trail behind
  rg.three("add", { id: "shock", shape: "sphere", size: [1], detail: 10, color: "#ffd27a", emissive: true, visible: false });
  rg.three("add", { id: "trail", shape: "cone", size: [0.9, 5], detail: 10, color: "#ff8a2a", emissive: true, visible: false });
  rg.three("add", { id: "canopy", shape: "dome", size: [1.6], detail: 12, color: "#ff5a3d", visible: false });
}

// the start: a circular low Earth orbit over Europe in daylight
function reset() {
  const earth = BODIES[3];
  const dir = norm([-0.93, 0.366, 0.05]);
  const north = [-Math.sin(earth.tilt), Math.cos(earth.tilt), 0];
  const east = norm(cross(north, dir));
  pos = add(earth.pos, mul(dir, earth.r + earth.h));
  vel = mul(east, earth.vc);
  fwd = east;
  up = dir;
  field = earth;
  landed = false;
  cruise = 0;
  simT = 0;
  hullK = -1;
  visited = {};
  bounces = 0;
  message = "";
  skyKey = "";
  auto = null;
  stick = null;
  throttlePointer = null;
  autoAlign = false;
  orbitTrail = []; orbitGuide = []; orbitLaneInner = []; orbitLaneOuter = [];
  orbitBurnLatch = 0; orbitBurnWasActive = false; orbitStableSeconds = 0;
  orbitBodyId = ""; orbitCacheAt = -100;
  dead = null; chute = false; shieldHp = 1; heatQ = 0; gLoad = 0;
  saveCheckpoint();
  placeAll();
  camera(1);
}

// ---- drawing the 3D scene -------------------------------------------------------

function placeBodies() {
  for (const b of BODIES) {
    const spin = b.rot ? b.turn + simT * 2 * Math.PI / b.rot : b.turn;
    const p = R(b.pos);
    rg.three("planet", { id: b.id, x: p[0], y: p[1], z: p[2], spin });
  }
  for (const b of BONUS) {
    const p = R(b.pos);
    rg.three("planet", { id: b.id, x: p[0], y: p[1], z: p[2] });
  }
  updateDetail();
  const s = R([0, 0, 0]);
  rg.three("space", { sun: s });
  const l = norm(mul(pos, -1));
  rg.three("light", { id: "sun", type: "directional", x: l[0], y: l[1], z: l[2], intensity: 0.95 });
}

// sharper map pieces under the ship when it is low: NASA LRO WAC, 22.5° a
// picture (16 × 8 of them), the 2 × 2 nearest the point under the ship
const DETAIL: { [id: string]: string } = { moon: "img/moon/d5", mars: "img/mars/d5", earth: "img/earth/d5" };
const DETAIL_ALT = 1500;
let detailKey = "";
let detailBody = "";
function updateDetail() {
  let key = "";
  let list: any[] = [];
  const b = field;
  if (b && DETAIL[b.id]) {
    const d = sub(pos, b.pos);
    const r = len(d);
    if (r - b.r < DETAIL_ALT) {
      // the planet's own frame, as the engine turns it (scene3d.rs axes)
      const spin = b.rot ? b.turn + simT * 2 * Math.PI / b.rot : b.turn;
      const ss = Math.sin(spin), cs = Math.cos(spin), st = Math.sin(b.tilt), ct = Math.cos(b.tilt);
      const ax = [cs * ct, cs * st, -ss];
      const ay = [-ss * ct, -ss * st, -cs];
      const az = [-st, ct, 0];
      const lon = Math.atan2(dot(d, ay), dot(d, ax));
      const lat = Math.asin(Math.max(-1, Math.min(1, dot(d, az) / r)));
      const u = (lon / (2 * Math.PI) + 0.5) * 16;
      const v = (0.5 - lat / Math.PI) * 8;
      const c0 = Math.floor(u), r0 = Math.min(7, Math.floor(v));
      const c1 = u - c0 < 0.5 ? c0 - 1 : c0 + 1;
      const r1 = v - r0 < 0.5 ? Math.max(0, r0 - 1) : Math.min(7, r0 + 1);
      const cols = [(c0 + 16) % 16, (c1 + 16) % 16];
      const rows = r1 === r0 ? [r0] : [r0, r1];
      for (const c of cols) {
        for (const w of rows) {
          list.push({ src: DETAIL[b.id] + "/" + c + "_" + w + ".jpg", u0: c / 16, v0: w / 8, u1: (c + 1) / 16, v1: (w + 1) / 8 });
          key += c + "_" + w + " ";
        }
      }
    }
  }
  const id = b ? b.id : "";
  if (key === detailKey && id === detailBody) return;
  if (detailBody && detailBody !== id) rg.three("planet", { id: detailBody, detail: [] });
  if (id && DETAIL[id]) rg.three("planet", { id, detail: list });
  detailKey = key;
  detailBody = id;
}

function part(id: string, off: number[], a: number[], b: number[], c: number[], extra?: any) {
  const right = cross(fwd, up);
  const toWorld = (v: number[]) => add(add(mul(right, v[0]), mul(up, v[1])), mul(fwd, -v[2]));
  const e = euler(toWorld(a), toWorld(b), toWorld(c));
  const p = toWorld(mul(off, SHIP_SCALE));   // relative to the ship (= the origin)
  const args: any = { id, x: p[0], y: p[1], z: p[2], rx: e.rx, ry: e.ry, rz: e.rz, sx: SHIP_SCALE, sy: SHIP_SCALE, sz: SHIP_SCALE, visible: true };
  if (extra) for (const k in extra) args[k] = extra[k];
  rg.three("set", args);
}

const PARTS = ["hull", "flame", "flame2", "shock", "trail", "canopy"];
function hideShip() { for (const id of PARTS) rg.three("set", { id, visible: false }); }

function placeShip() {
  const tail = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
  const flat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  part("hull", [0, 0, 0], flat[0], flat[1], flat[2]);
  const f = thrusting > 0 ? 0.8 + 0.25 * Math.sin(t * 47) : 0;
  const k = SHIP_SCALE;
  part("flame", [0, 0, 0.98 + 0.6 * f], tail[0], tail[1], tail[2], { visible: f > 0, sy: Math.max(0.01, f) * k });
  part("flame2", [0, 0, 0.92 + 0.4 * f], tail[0], tail[1], tail[2], { visible: f > 0, sy: Math.max(0.01, f) * k });
  // the plasma follows the flight path, not the nose
  const glow = Math.min(1, heatQ / (Q_MAX * 0.35));
  const v = len(vel);
  if (glow > 0.03 && v > 1e-6 && field) {
    const f0 = fwd, u0 = up;
    fwd = mul(vel, 1 / v);
    up = norm(sub(u0, mul(fwd, dot(u0, fwd))));
    if (len(up) < 0.5) up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
    const fl = 0.85 + 0.15 * Math.sin(t * 61);
    part("shock", [0, 0, -1.3], flat[0], flat[1], flat[2], { visible: true, sx: k * 0.75 * glow * fl, sy: k * 0.75 * glow * fl, sz: k * 0.22 * glow });
    part("trail", [0, 0, 1.2 + 2.5 * glow], tail[0], tail[1], tail[2], { visible: true, sx: k * glow * fl, sy: k * glow * (0.8 + 0.4 * fl), sz: k * glow * fl, color: glow > 0.7 ? "#ffd27a" : "#ff8a2a" });
    fwd = f0; up = u0;
  } else {
    rg.three("set", { id: "shock", visible: false });
    rg.three("set", { id: "trail", visible: false });
  }
  if (chute && v > 1e-6) {
    // the canopy trails behind along the flight path (above the ship as it falls)
    const f0 = fwd, u0 = up;
    fwd = mul(vel, 1 / v);
    up = norm(sub(u0, mul(fwd, dot(u0, fwd))));
    if (len(up) < 0.5) up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
    const w = k * (0.3 + 0.9 * chuteK);
    part("canopy", [0, 0, 3.2], tail[0], tail[1], tail[2], { visible: true, sx: w, sy: k * 0.8, sz: w });
    fwd = f0; up = u0;
  } else rg.three("set", { id: "canopy", visible: false });
}

function placeAll() {
  origin = pos;
  placeBodies();
  placeShip();
}

// keeps the camera out of the bodies
function outside(c: number[]) {
  for (const b of BODIES) {
    const d = sub(c, b.pos);
    const l = len(d);
    if (l < b.r + 0.02) c = add(b.pos, mul(d, (b.r + 0.02) / l));
  }
  return c;
}

// behind the ship; the offsets are kept relative to the ship, so the camera
// keeps up at any speed
function camera(snap: number) {
  const k = Math.min(1, snap);
  let want = add(mul(fwd, -CAM_BACK), mul(up, CAM_UP));
  let wantLook = add(mul(fwd, CAM_AHEAD), mul(up, -CAM_DOWN));
  let wantUp = up;
  if (chute && field) {
    // under the canopy: watch from the side, the canopy above the ship
    const r = norm(sub(pos, field.pos));
    let s = cross(r, fwd);
    if (len(s) < 0.1) s = cross(r, [0, 1, 0]);
    s = norm(s);
    want = add(mul(s, CAM_BACK * 2.2), mul(r, -CAM_BACK * 0.4));
    wantLook = mul(r, SHIP_SCALE * 1.8);
    wantUp = r;
  }
  camOff = add(camOff, mul(sub(want, camOff), k));
  lookOff = add(lookOff, mul(sub(wantLook, lookOff), k));
  cam.up = norm(add(cam.up, mul(sub(wantUp, cam.up), k)));
  const j = shake * 0.006;
  cam.pos = outside(add(add(pos, camOff), j > 0 ? [(Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j] : [0, 0, 0]));
  cam.look = add(pos, lookOff);
  const c = R(cam.pos);
  rg.three("camera", { x: c[0], y: c[1], z: c[2], lookAt: R(cam.look), up: cam.up, fov: FOV });
}

function start() {
  screen = "play";
  rg.sound("click");
  reset();
  say(rg.t("Matala Maan kiertorata, 400 km. Valitse kohde.", "Low Earth orbit, 400 km. Choose a target.", "Órbita terrestre baja, 400 km. Elige un destino."));
}

// ---- controls ----------------------------------------------------------------

const PAD_R = 54;

// the thermometer across the top: the temperature round the ship, -273 °C
// (blue) to the Sun's surface (5500 °C) on a log scale of kelvins
const T_MAX = 5800;
const SURFACE_C: { [id: string]: number } = { mercury: 167, venus: 464, earth: 15, moon: -20, mars: -63, jupiter: -110, sun: 5500 };
// the temperature the ship's hull settles to here: the Sun's warmth by the
// distance (in a shadow the cold of space, ~100 K), near the ground the
// surface's own temperature
function envTargetK() {
  const d = len(pos);
  let k = shadowNow ? 100 : Math.min(T_MAX, 278.6 / Math.sqrt(Math.max(d, 1) / AU));
  const b = field;
  if (b && !auto && SURFACE_C[b.id] !== undefined) {
    const alt = Math.max(0, len(sub(pos, b.pos)) - b.r);
    const top = Math.max(b.atm, 10);
    const s = SURFACE_C[b.id] + 273.15;
    if (landed) k = s;
    else if (alt < top) k = k + (s - k) * (1 - alt / top);
  }
  return k;
}
// the hull warms and cools slowly, in the ship's own time (so faster when
// time is sped up): halfway to the new temperature in ~10 minutes
let hullK = -1;
let hullSimT = 0;
const HULL_TAU = 900;
function updateHull() {
  const target = envTargetK();
  const ds = Math.max(0, simT - hullSimT);
  hullSimT = simT;
  if (hullK < 0 || ds > 86400 * 30) hullK = target;
  else hullK = hullK + (target - hullK) * (1 - Math.exp(-ds / HULL_TAU));
}
function envTempK() {
  // the entry's hot plasma round the ship shows at once
  if (heatQ > 0.05) return Math.max(hullK, 300 + Math.min(1, heatQ / Q_MAX) * 1900);
  return hullK;
}
// the temperature cell beside altitude and gravity: a red ▲ when very hot,
// a blue ▼ below -50 °C, VARJOSSA in a shadow otherwise
function tempCell() {
  const c = Math.round(envTempK() - 273.15);
  const hot = c >= 60, cold = c < -50;
  const mark = hot ? "▲ " + rg.t("KUUMA", "HOT", "CALIENTE") : cold ? "▼ " + rg.t("KYLMÄ", "COLD", "FRÍO") : shadowNow ? rg.t("VARJOSSA", "IN SHADOW", "EN SOMBRA") : "";
  return <div className="cell temp">
    <div className="lab">{rg.t("LÄMPÖTILA", "TEMPERATURE", "TEMPERATURA")}</div>
    <div className={hot ? "val hot" : cold ? "val cold" : "val"}>{(c > 0 ? "+" : "") + c + " °C"}</div>
    <div className={hot ? "tempMark hot" : cold ? "tempMark cold" : "tempMark"}>{mark}</div>
  </div>;
}

// the round map of the solar system, bottom left (the thrust button's twin)
const MAP_R = 46;
function mapCentre() { return { x: 12 + MAP_R, y: height - 10 - MAP_R }; }
function onMap(px: number, py: number) {
  const c = mapCentre(), dx = px - c.x, dy = py - c.y;
  return dx * dx + dy * dy <= MAP_R * MAP_R;
}
const MAP_COLORS: { [id: string]: string } = { sun: "#ffcf5a", mercury: "#b9ada0", venus: "#e6c983", earth: "#64b0ff", mars: "#ea8052", jupiter: "#dcb68e" };
// a point of the ecliptic (x-z plane) on the map: the distance from the Sun
// as its square root, so the inner planets do not crowd the Sun
let mapMax = 778.5e6;           // the map's edge: Jupiter, or farther when the ship is
function mapPoint(p: number[]) {
  const c = mapCentre();
  const d = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
  const r = (MAP_R - 6) * Math.sqrt(Math.min(1.08, d / mapMax));
  const a = Math.atan2(p[2], p[0]);
  return { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a), r };
}
// Halley's orbit (a 17.8 AU, e 0.967, tilted 18°, the far end where the comet is now)
let halleyOrbit: number[][] = [];
function makeHalleyOrbit() {
  const h = BONUS.filter((x) => x.id === "halley")[0];
  const A = norm(h.pos);
  let n0 = sub([0, 1, 0], mul(A, A[1]));
  n0 = norm(n0);
  const N = norm(rotate(n0, A, 18 * Math.PI / 180));
  const B = norm(cross(N, A));
  const a = 17.83 * AU, e = 0.967;
  halleyOrbit = [];
  for (let i = 0; i <= 72; i++) {
    // even steps of the true anomaly: dense where it turns round the Sun
    const u = i / 72;
    const nu = Math.PI * (2 * u - 1);
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    halleyOrbit.push(add(mul(A, -r * Math.cos(nu)), mul(B, r * Math.sin(nu))));
  }
}
function mapRing(au: number, color: string) {
  const c = mapCentre();
  const r = (MAP_R - 6) * Math.sqrt(au * AU / mapMax);
  if (r > MAP_R - 2 || r < 1.5) return null;
  return <div className="mapOrbit" style={{ left: c.x - r, top: c.y - r, width: r * 2, height: r * 2, borderRadius: r, borderColor: color }} />;
}
function miniMap() {
  const c = mapCentre();
  const out: any[] = [];
  mapMax = Math.max(778.5e6, Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]) * 1.12);
  out.push(<div className="mapDisc" style={{ left: c.x - MAP_R, top: c.y - MAP_R, width: MAP_R * 2, height: MAP_R * 2, borderRadius: MAP_R }} />);
  // the asteroid belt and the Kuiper belt as faint rings
  out.push(mapRing(2.1, "rgba(214,180,120,0.22)"));
  out.push(mapRing(3.3, "rgba(214,180,120,0.22)"));
  out.push(mapRing(30, "rgba(140,190,255,0.22)"));
  out.push(mapRing(50, "rgba(140,190,255,0.22)"));
  if (found["halley"]) {
    if (!halleyOrbit.length) makeHalleyOrbit();
    for (let i = 1; i < halleyOrbit.length; i += 2) {
      const seg = orbitSegment(mapPoint(halleyOrbit[i - 1]), mapPoint(halleyOrbit[i]), "rgba(190,220,255,0.45)", 1);
      if (seg) out.push(seg);
    }
  }
  for (const b of BODIES) {
    if (b.id === "sun" || b.id === "moon") continue;
    const q = mapPoint(b.pos);
    out.push(<div className="mapOrbit" style={{ left: c.x - q.r, top: c.y - q.r, width: q.r * 2, height: q.r * 2, borderRadius: q.r }} />);
  }
  const ship = mapPoint(pos);
  if (auto) {
    const q = mapPoint(auto.b.pos);
    const seg = orbitSegment(ship, q, "rgba(255,176,0,0.55)", 1);
    if (seg) out.push(seg);
  }
  for (const b of BODIES) {
    if (b.id === "moon") continue;
    const q = mapPoint(b.pos);
    const s = b.id === "sun" ? 7 : b.id === "jupiter" ? 6 : 4;
    if (b === field || (auto && auto.b === b)) {
      out.push(<div className="mapHere" style={{ left: q.x - 5.5, top: q.y - 5.5, width: 11, height: 11, borderRadius: 5.5 }} />);
    }
    out.push(<div className="mapDot" style={{ left: q.x - s / 2, top: q.y - s / 2, width: s, height: s, borderRadius: s / 2, backgroundColor: MAP_COLORS[b.id] }} />);
  }
  // bonus bodies: only near (white, blinking) or once found (gold)
  for (const b of BONUS) {
    const near = bonusSeen(b);
    if (!near && !found[b.id]) continue;
    const q = mapPoint(b.pos);
    if (near && !found[b.id] && (t * 3) % 1 > 0.6) continue;
    out.push(<div className="mapDot" style={{ left: q.x - 1.5, top: q.y - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: found[b.id] ? "#ffcf5a" : "#ffffff" }} />);
  }
  const blink = (t * 2) % 1 < 0.6;
  out.push(<div className={blink ? "mapShip" : "mapShip dim"} style={{ left: ship.x - 2, top: ship.y - 2 }} />);
  return out;
}

function onThrottleButton(px: number, py: number) {
  const dx = px - (width - 58), dy = py - (height - 58);
  return dx * dx + dy * dy <= 54 * 54;
}
function onPointerDown(px: number, py: number, info: any) {
  if (screen === "title") { if (onStart(px, py) && t > 0.6) start(); return; }
  if (dead) { if (t - dead.t > 1.5 && checkpoint) loadCheckpoint(); return; }
  if (onMap(px, py)) return;
  if (field && !auto && onTimeCell(px, py)) {
    realTime = !realTime;
    orbitCacheAt = -100;
    rg.sound("click");
    say(realTime ? rg.t("Reaaliaika ×1", "Real time ×1", "Tiempo real ×1") : rg.t("Aika nopeutettu ×", "Time sped up ×", "Tiempo acelerado ×") + Math.round(warpNow(field)));
    return;
  }
  if (auto) return;
  if (onThrottleButton(px, py)) { throttlePointer = info.pointer; return; }
  if (stick) return;
  stick = { id: info.pointer, x: px, y: py, dx: 0, dy: 0, t, moved: false };
}
// the start button on the title screen
function startBox() { return { x: width / 2 - 90, y: height - 130, w: 180, h: 58 }; }
function onStart(px: number, py: number) {
  const b = startBox();
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}
function onPointerUp(px: number, py: number, info: any) {
  if (info.pointer === throttlePointer) { throttlePointer = null; return; }
  if (!stick || stick.id !== info.pointer) return;
  const tap = !stick.moved && t - stick.t < TAP_TIME;
  stick = null;
  if (tap && !auto && !onThrottleButton(px, py)) {
    const b = bodyAt(px, py);
    if (b) startAuto(b);
  }
}

function onKeyDown(key: string) {
  if (screen === "title" && (key === " " || key === "Enter")) start();
  // test keys: an Earth entry, shallow (e) or steep (E)
  if ((key === "e" || key === "E") && screen === "play") entryTest(key === "E" ? -8 : -1.6);
  if (key === "c" && screen === "play") entryTest(-60, 12, 0.3);
  if (key === "r" && screen === "play") { reset(); say(rg.t("Takaisin Maan kiertoradalle", "Back to Earth orbit", "De vuelta a la órbita terrestre")); }
}

function entryTest(gammaDeg: number, alt = 110, speed = 7.9) {
  const earth = BODIES[3];
  const dir = norm([-0.93, 0.366, 0.05]);
  const north = [-Math.sin(earth.tilt), Math.cos(earth.tilt), 0];
  const east = norm(cross(north, dir));
  const g = gammaDeg * Math.PI / 180;
  auto = null; landed = false; dead = null; chute = false; shieldHp = 1;
  field = earth;
  pos = add(earth.pos, mul(dir, earth.r + alt));
  vel = add(mul(east, speed * Math.cos(g)), mul(dir, speed * Math.sin(g)));
  fwd = norm(vel); up = dir;
  up = norm(sub(up, mul(fwd, dot(up, fwd))));
  saveCheckpoint();
  say(rg.t("Testi: ilmakehään tulo", "Test: atmospheric entry", "Prueba: entrada atmosférica"));
}

function onBack() {
  if (screen === "play") screen = "title"; else rg.exit();
}

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
  let gasDown = false;
  for (const p of pointers) {
    if (p.down && (onThrottleButton(p.x, p.y) || (throttlePointer !== null && p.id === throttlePointer))) gasDown = true;
  }
  if (stick) {
    let steeringDown = false;
    for (const p of pointers) {
      if (!p.down || p.id !== stick.id) continue;
      steeringDown = true;
      stick.dx = p.x - stick.x; stick.dy = p.y - stick.y;
      if (Math.abs(stick.dx) > STILL || Math.abs(stick.dy) > STILL) stick.moved = true;
    }
    if (steeringDown) { yaw -= axis(stick.dx); pitch -= axis(stick.dy); } else stick = null;
  }
  const thrust = !!(k["w"] || k[" "] || gasDown);
  return { yaw, pitch, thrust };
}

// ---- autopilot warp ------------------------------------------------------------

// the autopilot stops far out on an approach path
function arrivalAlt(b: Body) { return (b.reach - b.r) * 0.8; }

function startAuto(b: Body) {
  if (b === field) return;
  const d = sub(pos, b.pos);
  const c0 = len(d);
  const c1 = b.r + arrivalAlt(b);
  if (c0 < c1 * 1.05) return;
  const dur = Math.max(2.6, Math.min(7, 2 + 0.75 * Math.log(c0 / c1) / Math.LN10));
  const dir = mul(d, 1 / c0);
  // the arrival point is off the straight line, in a random direction, so
  // every approach comes in at its own angle
  let side = cross(dir, [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
  if (len(side) < 1e-3) side = cross(dir, [0, 1, 0]);
  const dir1 = norm(rotate(dir, norm(side), 0.25 + Math.random() * 0.45));
  auto = { b, c0, c1, dir, dir1, f0: fwd, t: 0, dur };
  field = null;
  landed = false;
  autoAlign = false;
  vel = [0, 0, 0];
  cruise = 0;
  rg.sound("whoosh");
  rg.vibrate(30);
  say(rg.t("Autopilotti: ", "Autopilot: ", "Piloto automático: ") + b.name);
}

function stepAuto(dt: number) {
  if (!auto) return;
  const a = auto;
  a.t += dt;
  const u = Math.min(1, a.t / a.dur);
  const e = u * u * (3 - 2 * u);
  const prev = pos;
  // the distance shrinks geometrically: fast far away, gentle near the target
  const c = a.c0 * Math.pow(a.c1 / a.c0, e);
  const dirNow = norm(add(mul(a.dir, 1 - e), mul(a.dir1, e)));
  pos = add(a.b.pos, mul(dirNow, c));
  autoSpeed = len(sub(pos, prev)) / Math.max(1e-6, dt);
  const want = norm(sub(a.b.pos, pos));
  const w = Math.min(1, u * 2.2);
  fwd = norm(add(mul(a.f0, 1 - w), mul(want, w)));
  if (len(fwd) < 0.5) fwd = want;
  up = norm(cross(cross(fwd, up), fwd));
  if (len(up) < 0.5) up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
  thrusting = u < 0.85 ? 1 : 0;
  simT += dt * 60;
  if (u >= 1 && a.b.bonus) {
    auto = null;
    thrusting = 0;
    vel = [0, 0, 0];
    cruise = 0;
    fwd = want;
    say(a.b.name + " " + distText(Math.max(0, len(sub(a.b.pos, pos)) - a.b.r)));
    return;
  }
  if (u >= 1) {
    auto = null;
    thrusting = 0;
    const radial = a.dir1;
    let tangent = norm(cross([0, 1, 0], radial));
    if (len(tangent) < 0.5) tangent = norm(cross([1, 0, 0], radial));
    const b = a.b;
    let v = mul(tangent, Math.sqrt(b.gm / a.c1));
    // falling in a little faster than escape speed in a random plane, aimed
    // off the target height: the closest point may be too high, too low or
    // even on the surface. The nose still points at the planet (no camera
    // jump); the pilot turns to the green sight and corrects the course
    // before braking into orbit at the closest point
    const spin = Math.random() * Math.PI * 2;
    tangent = norm(rotate(tangent, radial, spin));
    const lo = -1.5, hi = 5;
    aimAlt = b.h * (lo + Math.random() * (hi - lo));
    const rp = Math.max(b.r * 0.25, b.r + aimAlt);
    const s = vesc(b, a.c1) * 1.03;
    const vp = Math.sqrt(s * s - 2 * b.gm / a.c1 + 2 * b.gm / rp);
    const vt = Math.min(s, rp * vp / a.c1);
    const vr = Math.sqrt(Math.max(0, s * s - vt * vt));
    v = add(mul(tangent, vt), mul(radial, -vr));
    enterField(b, v);
    say(b.name + ": " + rg.t("lähestymisrata, lähin kohta ", "approach path, closest point ", "trayectoria de aproximación, punto más cercano ") +
      (aimAlt < 0 ? rg.t("PINNAN ALLA", "BELOW THE SURFACE", "BAJO LA SUPERFICIE") : grp(aimAlt) + " km") + ". " +
      rg.t("Korjaa rata, tavoite ", "Correct the course, target ", "Corrige el rumbo, objetivo ") + grp(b.h) + " km.");
  }
}

// ---- physics -----------------------------------------------------------------

function vesc(b: Body, r: number) { return Math.sqrt(2 * b.gm / r); }

// supercruise's top speed (km per game second)
function cruiseCap() {
  let bestE = 1e30, cb = BODIES[0];
  for (const b of BODIES) {
    const e = len(sub(pos, b.pos)) - b.reach;
    if (e < bestE) { bestE = e; cb = b; }
  }
  const floor = 0.5 * vesc(cb, cb.reach) * cb.warp;
  let cap = Math.max(floor, bestE * CRUISE_K);
  // slower near a bonus body (a hint that something is near)
  for (const b of BONUS) {
    const e = len(sub(pos, b.pos)) - b.reach;
    cap = Math.min(cap, Math.max(400, e * CRUISE_K));
  }
  return cap;
}

function enterField(b: Body, v: number[]) {
  field = b;
  const r = len(sub(pos, b.pos));
  const lim = vesc(b, r);
  const s = len(v);
  vel = s > lim ? mul(v, lim / s) : v;
  cruise = 0;
  saveCheckpoint();
  rg.vibrate(25);
  if (s > 0 && !auto) say(rg.t("Gravitaatiokenttä: ", "Gravity field: ", "Campo gravitatorio: ") + b.name);
}

function leaveField() {
  const b = field!;
  cruise = len(vel) * b.warp;
  field = null;
  landed = false;
  say(rg.t("Supercruise päällä", "Supercruise engaged", "Supercrucero activado"));
}

// how fast the deflector throws the ship back up: to 1.6 × the orbit's altitude
function popSpeed(b: Body) { return Math.sqrt(2 * b.gm * (1 / b.r - 1 / (b.r + b.h * 1.6))); }
function landSpeed(b: Body) { return 0.025 * b.vc; }

function collide(b: Body) {
  const d = sub(pos, b.pos);
  const r = len(d);
  const floor = b.r + SHIP_R;
  if (r >= floor) { if (r > floor + 0.05) landed = false; return; }
  const n = mul(d, 1 / r);
  pos = add(b.pos, mul(n, floor));
  const vn = dot(vel, n);
  if (vn >= 0) return;
  const speed = len(vel);
  if (AIR[b.id] && b.land) {
    if (speed < 0.016) {
      if (!landed) {
        touchDown(b, speed);
        // stand level on the ground: nose to the horizon, roof to the sky
        let f = sub(fwd, mul(n, dot(fwd, n)));
        if (len(f) < 0.1) f = cross(n, [0, 1, 0]);
        fwd = norm(f); up = n;
      }
      vel = [0, 0, 0];
      landed = true;
      chute = false;
    } else die(rg.t("MAAHANSYÖKSY ", "GROUND IMPACT ", "IMPACTO CONTRA EL SUELO ") + fmt(speed * 1000, 0) + " M/S");
    return;
  }
  if (b.land && speed < landSpeed(b)) {
    if (!landed) touchDown(b, speed);
    vel = [0, 0, 0];
    landed = true;
  } else {
    const tang = sub(vel, mul(n, vn));
    vel = add(mul(tang, 0.4), mul(n, popSpeed(b)));
    hit(b, speed);
  }
}

function step(dt: number, c: any) {
  if (c.yaw || c.pitch) autoAlign = false;
  if (autoAlign && field && !landed) alignNose(field, dt);
  if (c.yaw) fwd = norm(rotate(fwd, up, c.yaw * TURN * dt));
  if (c.pitch) { const r = cross(fwd, up); fwd = norm(rotate(fwd, r, c.pitch * TURN * dt)); up = norm(rotate(up, r, c.pitch * TURN * dt)); }
  up = norm(cross(cross(fwd, up), fwd));
  if (len(up) < 0.5) up = norm(cross(cross(fwd, [0, 1, 0]), fwd));
  thrusting = c.thrust ? 1 : 0;
  if (field) {
    const b = field;
    const sdt = dt * warpNow(b);
    air(b, dt, sdt);
    if (dead) return;
    if (thrusting) vel = add(vel, mul(fwd, b.acc * accK() * sdt));
    const d = sub(b.pos, pos);
    const r = len(d);
    vel = add(vel, mul(d, b.gm / (r * r * r) * sdt));
    const r0 = mul(d, -1 / r);
    pos = add(pos, mul(vel, sdt));
    simT += sdt;
    collide(b);
    // attitude hold: the nose keeps its angle to the local horizon as the ship
    // goes round, so the planet stays below and the horizon level
    const r1 = norm(sub(pos, b.pos));
    const ax = cross(r0, r1);
    const sa = len(ax);
    if (sa > 1e-12 && !landed) {
      const k = mul(ax, 1 / sa), ang = Math.asin(Math.min(1, sa));
      fwd = norm(rotate(fwd, k, ang));
      up = norm(rotate(up, k, ang));
    }
    if (len(sub(pos, b.pos)) > b.reach) leaveField();
  } else {
    const cap = cruiseCap();
    if (thrusting) cruise += (cap - cruise) * Math.min(1, 1.1 * dt) + cap * 0.02 * dt;
    else cruise *= Math.exp(-DRAG * dt);
    if (cruise > cap) cruise = cap;
    vel = mul(fwd, cruise);
    pos = add(pos, mul(vel, dt));
    simT += dt * 60;
    for (const b of BODIES) {
      if (len(sub(pos, b.pos)) < b.reach) { enterField(b, mul(vel, 1 / b.warp)); break; }
    }
  }
}

// time runs slower in the air, so that an entry can be watched (and flown)
// the middle column's left edge on a wide screen (the HUD stays at the left)
function midX(off: number) { return Math.max(0, (width - 360) / 2) + off; }
// the eyes adapt: in a body's shadow the night side slowly comes out of the
// dark (eyes 0 → 1 in ~10 s); back in the sunlight they adapt faster and the
// light dazzles for a moment
let eyes = 0;                  // how dark-adapted the eyes are, 0…1
let eyesSent = -1;
let dazzle = 0;                // the white glare on leaving the shadow, 0…1
let shadowNow = false;
const EYES_NIGHT = 0.3;        // the planets' night when fully adapted (base ~0.94)
function setEyes(a: number) {
  eyes = a;
  if (Math.abs(a - eyesSent) < 0.01 && a !== 0 && a !== 1) return;
  if (a === eyesSent) return;
  eyesSent = a;
  for (const b of BODIES) {
    const base = surface(b.id).night;
    rg.three("planet", { id: b.id, night: base + (Math.min(base, EYES_NIGHT) - base) * a });
  }
}
// whether a body stands between the ship and the Sun (its shadow as a cylinder)
function inShadow() {
  const s = norm(mul(pos, -1));
  for (const b of BODIES) {
    if (b.id === "sun") continue;
    const d = sub(b.pos, pos);
    const along = dot(d, s);
    if (along <= 0) continue;
    if (len(sub(d, mul(s, along))) < b.r) return true;
  }
  return false;
}
function adaptEyes(dt: number) {
  const dark = screen === "play" && !dead && inShadow();
  if (shadowNow && !dark && eyes > 0.2) dazzle = Math.max(dazzle, eyes * 0.55);
  shadowNow = dark;
  // dark adaptation slow (~10 s), light adaptation ~2 s
  const a = dark ? Math.min(1, eyes + dt / 10) : Math.max(0, eyes - dt / 2);
  setEyes(a);
  dazzle = Math.max(0, dazzle - dt * 0.8);
}
let realTime = false;          // tap the TIME cell: real time ↔ the place's own speed-up
function onTimeCell(px: number, py: number) { return px >= 226 && px <= 358 && py >= 56 && py <= 102; }
function warpNow(b: Body) {
  if (realTime) return 1;
  const a = AIR[b.id];
  if (!a || landed) return b.warp;
  const alt = len(sub(pos, b.pos)) - b.r;
  if (alt > b.atm) return b.warp;
  // fast in the thin upper air, slow when it burns, faster again under the parachute
  const w = chute ? 30 : heatQ < 0.3 && gLoad < 1 ? 40 : heatQ < 2 && gLoad < 4 ? 15 : 6;
  return Math.min(b.warp, w);
}

// drag, heating and the parachute (dt: real seconds, sdt: the ship's seconds)
function air(b: Body, dt: number, sdt: number) {
  heatQ = 0; gLoad = 0; shake = 0;
  const a = AIR[b.id];
  if (!a || landed) { chute = false; return; }
  const alt = len(sub(pos, b.pos)) - b.r;
  if (alt > b.atm) { chute = false; return; }
  const rho = a[0] * Math.exp(-Math.max(0, alt) / a[1]);
  const v = len(vel);
  if (v < 1e-9) return;
  const vm = v * 1000;
  if (!chute && a[2] > 0 && alt < a[2] && v < CHUTE_V) {
    chute = true;
    chuteK = 0;
    rg.sound("whoosh");
    rg.vibrate(60);
    say(rg.t("Laskuvarjo auki", "Parachute open", "Paracaídas abierto"));
  }
  // the canopy opens over ~25 s of the ship's time, so the jolt stays bearable
  if (chute) chuteK = Math.min(1, chuteK + sdt / 25);
  const beta = chute ? BETA * Math.pow(BETA_CHUTE / BETA, chuteK) : BETA;
  const acc = rho * vm * vm / (2 * beta);   // m/s²
  const dv = Math.min(v, acc / 1000 * sdt);
  vel = sub(vel, mul(vel, dv / v));
  gLoad = acc / 9.81;
  heatQ = 1.74e-4 * Math.sqrt(rho) * vm * vm * vm / 1e6;
  const over = Math.max(heatQ / Q_MAX, gLoad / G_MAX);
  if (over > 1) shieldHp -= (over - 1 + 0.5) * dt;
  else shieldHp = Math.min(1, shieldHp + dt * 0.05);
  shake = Math.min(1, heatQ / Q_MAX + gLoad / G_MAX * 0.5);
  if (shieldHp <= 0) die(heatQ / Q_MAX > gLoad / G_MAX
    ? rg.t("LÄMPÖKILPI PETTI ", "HEAT SHIELD FAILED ", "FALLÓ EL ESCUDO TÉRMICO ") + fmt(heatQ, 1) + " MW/M²"
    : rg.t("G-VOIMAT ", "G FORCES ", "FUERZAS G ") + fmt(gLoad, 0) + " G");
}

// turns the nose towards the burn direction, keeping the planet below
function alignNose(b: Body, dt: number) {
  const dir = orbitManeuver(b).direction;
  const cs = Math.max(-1, Math.min(1, dot(fwd, dir)));
  const ang = Math.acos(cs);
  if (ang > 1e-4) {
    let k = cross(fwd, dir);
    if (len(k) < 1e-6) k = up;
    fwd = norm(rotate(fwd, norm(k), Math.min(ang, TURN * 1.4 * dt)));
  }
  const radial = norm(sub(pos, b.pos));
  if (Math.abs(dot(fwd, radial)) < 0.95) {
    const want = norm(sub(radial, mul(fwd, dot(radial, fwd))));
    up = norm(add(up, mul(sub(want, up), Math.min(1, 3 * dt))));
  }
  up = norm(sub(up, mul(fwd, dot(up, fwd))));
}

function saveCheckpoint() {
  checkpoint = { pos, vel, fwd, up, field: field ? field.id : "", cruise, simT };
}
function loadCheckpoint() {
  const c = checkpoint;
  dead = null; chute = false; chuteK = 0; shieldHp = 1; heatQ = 0; gLoad = 0; shake = 0; impactIn = -1; landed = false; auto = null;
  pos = c.pos; vel = c.vel; fwd = c.fwd; up = c.up; cruise = c.cruise; simT = c.simT; hullK = -1;
  field = null;
  for (const b of BODIES) if (b.id === c.field) field = b;
  camOff = add(mul(fwd, -CAM_BACK), mul(up, CAM_UP));
  lookOff = add(mul(fwd, CAM_AHEAD), mul(up, -CAM_DOWN));
  cam.up = up;
  orbitCacheAt = -100;
  say(rg.t("Varmuuskopio ladattu. Yritä uudelleen.", "Backup restored. Try again.", "Copia restaurada. Inténtalo de nuevo."));
}
function die(cause: string) {
  if (dead) return;
  dead = { cause, t };
  thrusting = 0;
  shake = 0;
  chute = false;
  rg.sound("hit", { volume: 1 });
  rg.vibrate([80, 40, 200]);
  rg.celebrate(width / 2, height * 0.45, { count: 30 });
}

function hit(b: Body, speed: number) {
  if (t - lastBounce > 0.3) {
    bounces++;
    rg.sound("hit", { volume: 0.7 });
    rg.vibrate([40, 30, 60]);
  }
  lastBounce = t;
  bounceText = b.id === "sun" ? rg.t("!! PLASMAKOSKETUS — DEFLEKTORI !!", "!! PLASMA CONTACT — DEFLECTOR !!", "!! CONTACTO CON PLASMA — DEFLECTOR !!")
    : b.land ? rg.t("!! PINTAKOSKETUS ", "!! SURFACE IMPACT ", "!! IMPACTO ") + fmt(speed * 1000, 0) + " M/S !!"
    : rg.t("!! PILVIKERROS — DEFLEKTORI !!", "!! CLOUD DECK — DEFLECTOR !!", "!! CAPA DE NUBES — DEFLECTOR !!");
}

function touchDown(b: Body, speed: number) {
  rg.sound("win", { volume: 0.5 });
  rg.vibrate(60);
  say(b.name + ": " + rg.t("laskeutuminen ", "touchdown ", "aterrizaje ") + fmt(speed * 1000, 0) + " m/s");
  reach(b);
}

function reach(b: Body) {
  if (visited[b.id]) return;
  visited[b.id] = true;
  const n = Object.keys(visited).length;
  rg.celebrate(width / 2, height * 0.32, { count: 18 });
  if (n === BODIES.length) {
    say(rg.t("Kaikki 7 kohdetta saavutettu!", "All 7 targets reached!", "¡Los 7 destinos alcanzados!"));
    rg.celebrate(width / 2, height * 0.35, { big: true });
    if (bounces < best || best === 0) { best = Math.max(1, bounces); rg.save("best", best); }
  }
}

function tick(dt: number) {
  t += dt;
  adaptEyes(Math.min(dt, 0.1));
  if (messageClock > 0) messageClock -= dt;
  if (screen !== "play") {
    // the title: the camera circles the Earth at 16 000 km
    const earth = BODIES[3];
    simT += dt * 300;
    const a = t * 0.05;
    const c = add(earth.pos, [-Math.cos(a) * 22000, 5000, Math.sin(a) * 22000]);
    origin = c;
    placeBodies();
    hideShip();
    rg.three("camera", { x: 0, y: 0, z: 0, lookAt: R(add(earth.pos, [0, 2500, 0])), up: [0, 1, 0], fov: FOV });
    return;
  }
  const h = Math.min(dt, 0.05);
  if (dead) {
    hideShip();
    camera(0);
    return;
  }
  if (auto) {
    stepAuto(h);
  } else {
    const c = controls();
    const n = field ? 10 : 2;
    for (let i = 0; i < n; i++) step(h / n, c);
  }
  checkFinds();
  updateHull();
  if (findToast) { findToast.t += dt; if (findToast.t > 7) findToast = null; }
  if (!findToast && findQueue.length) findToast = findQueue.shift();
  placeAll();
  camera(auto ? 1 : Math.min(1, dt * 5));
  updateOrbit(h);
  sky();
}

function updateOrbit(h: number) {
  updateOrbitPrediction();
  if (field && !auto && !landed) {
    const m = orbitManeuver(field);
    if (thrusting) {
      if (!orbitBurnWasActive) orbitBurnLatch = Math.max(0.2, m.seconds);
      orbitBurnWasActive = true;
    } else { orbitBurnWasActive = false; orbitBurnLatch = 0; }
    orbitStableSeconds = m.ready ? orbitStableSeconds + h : 0;
    if (orbitStableSeconds >= 1.5 && !visited[field.id]) {
      say(field.name + ": " + rg.t("vakaa kiertorata", "stable orbit", "órbita estable"));
      rg.sound("win", { volume: 0.55 });
      reach(field);
    }
  } else { orbitBurnWasActive = false; orbitBurnLatch = 0; orbitStableSeconds = 0; }
}

// the sky turns to the colour of the air low in an atmosphere
function sky() {
  let col = BG;
  for (const b of BODIES) {
    if (!b.atm) continue;
    const a = len(sub(cam.pos, b.pos)) - b.r;
    const k = Math.max(0, Math.min(1, 1 - a / b.atm));
    if (k > 0) { const s = hex(b.sky); col = [BG[0] + (s[0] - BG[0]) * k, BG[1] + (s[1] - BG[1]) * k, BG[2] + (s[2] - BG[2]) * k]; }
  }
  const key = rgb(col);
  if (key !== skyKey) { skyKey = key; rg.three("scene", { background: key }); }
}

// ---- orbital navigation ------------------------------------------------------

function orbitMetrics(b: Body) {
  const rel = sub(pos, b.pos);
  const radius = Math.max(b.r + SHIP_R, len(rel));
  const radial = norm(rel);
  const radialSpeed = dot(vel, radial);
  const sideVel = sub(vel, mul(radial, radialSpeed));
  const sideways = len(sideVel);
  let tangent = norm(sideVel);
  if (sideways < 1e-4) {
    // falling straight: orbit in the plane of the nose
    tangent = norm(sub(fwd, mul(radial, dot(fwd, radial))));
    if (len(tangent) < 0.1) tangent = norm(cross([0, 1, 0], radial));
  }
  const targetRadius = b.r + b.h;
  const localSpeed = Math.sqrt(b.gm / radius);
  return { radial, radius, radialSpeed, sideways, tangent, targetRadius, localSpeed };
}

function orbitManeuver(b: Body) {
  const m = orbitMetrics(b);
  const heightError = m.targetRadius - m.radius;
  const vr = Math.max(-0.35 * b.vc, Math.min(0.35 * b.vc, heightError / (6 * b.warp)));
  const desired = add(mul(m.tangent, b.vc), mul(m.radial, vr));
  const delta = sub(desired, vel);
  const dv = len(delta);
  const seconds = dv / (b.acc * accK() * warpNow(b));
  // stable only when the whole orbit stays clear of the ground and the air:
  // the lowest point above max(0.6 × target height, the air), the highest
  // below 1.6 × the target height
  const rel = sub(pos, b.pos);
  const r = len(rel);
  const v2 = dot(vel, vel);
  const energy = v2 / 2 - b.gm / r;
  const hm = len(cross(rel, vel));
  let rp = 0, ra = 1e18;
  if (energy < 0) {
    const sa = -b.gm / (2 * energy);
    const e = Math.sqrt(Math.max(0, 1 + 2 * energy * hm * hm / (b.gm * b.gm)));
    rp = sa * (1 - e); ra = sa * (1 + e);
  }
  const ready = Math.abs(heightError) < b.h * 0.35
    && rp - b.r >= Math.max(b.h * 0.6, b.atm)
    && ra - b.r <= b.h * 1.6;
  const direction = dv > 1e-6 ? mul(delta, 1 / dv) : m.tangent;
  const locked = dot(fwd, direction) > 0.95;
  // close enough to the guided path: coast and correct later (a dead band,
  // so the sight does not ask for tiny burns all the time, also in real time)
  const coast = !ready && dv < b.vc * 0.015 && orbitOutcome !== "impact";
  return { m, dv, seconds, direction, locked, ready, coast, heightError };
}

function orbitReticle() {
  sightAt = null;
  if (!field || auto || landed) return null;
  const p = orbitManeuver(field);
  if (p.ready || p.coast) return null;
  const f = norm(sub(cam.look, cam.pos));
  const right = norm(cross(f, cam.up));
  const upcam = cross(right, f);
  const q = project(add(pos, mul(p.direction, 50)));
  let px = q ? q.x : width / 2 + dot(p.direction, right) * 300;
  let py = q ? q.y : height / 2 - dot(p.direction, upcam) * 300;
  const minY = 150, maxY = Math.max(220, height - 250);
  if (!q) {
    // behind the camera: show it at the top, away from the ship
    const l = Math.hypot(px - width / 2, py - height / 2);
    if (l < 90) { px = width / 2 + (l > 1 ? (px - width / 2) / l * 90 : 0); py = minY + 10; }
  }
  px = Math.max(34, Math.min(width - 34, px));
  py = Math.max(minY, Math.min(maxY, py));
  sightAt = [px, py];
  const blink = Math.floor(t * 3) % 2 === 0;
  const label = autoAlign ? "AUTO" : !q ? rg.t("TAKANA · KOHDISTA", "BEHIND · ALIGN", "DETRÁS · ALINEA") : p.locked ? rg.t("ASEMOITU", "ALIGNED", "ALINEADO") : rg.t("KOHDISTA", "ALIGN", "ALINEA");
  const labelCls = autoAlign || p.locked ? "sightLabel ok" : blink ? "sightLabel bad" : "sightLabel badDim";
  const shipPoint = project(pos);
  const sx = shipPoint ? shipPoint.x : width * 0.5;
  const sy = shipPoint ? shipPoint.y : height * 0.4;
  const dx = px - sx, dy = py - sy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const ux = distance > 0.1 ? dx / distance : 0;
  const uy = distance > 0.1 ? dy / distance : -1;
  const ax = Math.max(20, Math.min(width - 20, sx + ux * 58));
  const ay = Math.max(134, Math.min(maxY - 8, sy + uy * 58));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  // red and blinking on a course into the ground
  const danger = orbitOutcome === "impact" && !chute && Math.floor(t * 4) % 2 ? " danger" : "";
  return <div className="orbitReticleLayer">
    {!p.locked && distance > 70
      ? <div className="orbitAimArrow" style={{ left: ax - 13, top: ay - 13, transform: "rotate(" + angle + "deg)" }}>➤</div>
      : null}
    <div className={p.locked ? "orbitSight locked" : "orbitSight"} style={{ left: px - 25, top: py - 25 }}>
      {p.locked ? <div className="sightGoldHalo" /> : null}
      <div className={(p.locked ? "sightRing aligned" : "sightRing") + danger} />
      <div className={(p.locked ? "sightCrossH aligned" : "sightCrossH") + danger} />
      <div className={(p.locked ? "sightCrossV aligned" : "sightCrossV") + danger} />
      <div className={p.locked ? "sightDot aligned" : "sightDot"} />
    </div>
    {label ? <div className={labelCls} style={{ left: Math.max(4, Math.min(width - 124, px - 60)), top: py + 28 }}>{label}</div> : null}
  </div>;
}

// the unpowered path ahead, with the same gravity as the ship's
function updateOrbitPrediction() {
  if (!field || auto) {
    orbitTrail = []; orbitGuide = []; orbitLaneInner = []; orbitLaneOuter = [];
    orbitBodyId = ""; orbitOutcome = ""; impactIn = -1;
    return;
  }
  const b = field;
  if (orbitBodyId === b.id && t - orbitCacheAt < (impactIn >= 0 && impactIn < 20 ? 0.1 : 0.24)) return;
  orbitCacheAt = t;
  orbitBodyId = b.id;
  const m = orbitMetrics(b);
  orbitGuide = []; orbitLaneInner = []; orbitLaneOuter = [];
  const u = m.radial, v = m.tangent;
  for (let j = 0; j <= 64; j++) {
    const a = j * Math.PI * 2 / 64;
    const circle = add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
    orbitGuide.push(add(b.pos, mul(circle, m.targetRadius)));
    orbitLaneInner.push(add(b.pos, mul(circle, m.targetRadius - b.h * 0.35)));
    orbitLaneOuter.push(add(b.pos, mul(circle, m.targetRadius + b.h * 0.35)));
  }
  let pp = [pos[0], pos[1], pos[2]];
  let vv = [vel[0], vel[1], vel[2]];
  orbitTrail = [pp];
  orbitOutcome = "orbit";
  impactIn = -1;
  const dtPred = b.warp * ORBIT_GAME_S / 260;
  for (let i = 0; i < 320; i++) {
    const d = sub(b.pos, pp);
    const r = len(d);
    vv = add(vv, mul(d, b.gm / (r * r * r) * dtPred));
    pp = add(pp, mul(vv, dtPred));
    if (i % 3 === 2) orbitTrail.push(pp);
    const radius = len(sub(pp, b.pos));
    if (radius <= b.r + SHIP_R) { orbitTrail.push(pp); orbitOutcome = "impact"; impactIn = (i + 1) * dtPred / warpNow(b); break; }
    if (radius >= b.reach) { orbitTrail.push(pp); orbitOutcome = "escape"; break; }
  }
}

function orbitVisible(p: number[], b: Body) {
  const ray = sub(p, cam.pos);
  const dist = len(ray);
  if (dist < 1e-6) return false;
  const rayDir = mul(ray, 1 / dist);
  const o = sub(cam.pos, b.pos);
  const half = dot(o, rayDir);
  const disc = half * half - (dot(o, o) - b.r * b.r);
  if (disc <= 0) return true;
  const hitDist = -half - Math.sqrt(disc);
  return !(hitDist > 0 && hitDist < dist - b.r * 0.001);
}
function orbitSegment(a: any, c: any, color: string, thickness: number) {
  const dx = c.x - a.x, dy = c.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;
  if (Math.min(a.x, c.x) > width + 30 || Math.max(a.x, c.x) < -30 || Math.min(a.y, c.y) > height + 30 || Math.max(a.y, c.y) < -30) return null;
  return <div className="orbitSegment"
    style={{ left: (a.x + c.x) * 0.5 - dist * 0.5, top: (a.y + c.y) * 0.5 - thickness * 0.5, width: dist, height: thickness, backgroundColor: color,
      transform: "rotate(" + (Math.atan2(dy, dx) * 180 / Math.PI) + "deg)" }} />;
}
function orbitProjected(points: number[][], b: Body, color: string, dashed: boolean) {
  const out: any[] = [];
  const f = norm(sub(cam.look, cam.pos));
  const near = Math.max(1e-3, dot(sub(pos, cam.pos), f) * 0.5);
  for (let i = 1; i < points.length; i++) {
    if (dashed && (i % 2) === 0) continue;
    let p = points[i - 1], q = points[i];
    if (!orbitVisible(p, b) || !orbitVisible(q, b)) continue;
    // cut at a plane in front of the camera (half way to the ship), so a
    // piece passing by the camera does not swing across the screen
    const zp = dot(sub(p, cam.pos), f), zq = dot(sub(q, cam.pos), f);
    if (zp < near && zq < near) continue;
    if (zp < near) p = add(p, mul(sub(q, p), (near - zp) / (zq - zp)));
    else if (zq < near) q = add(p, mul(sub(q, p), (near - zp) / (zq - zp)));
    const a = project(p), c = project(q);
    if (a && c) { const seg = orbitSegment(a, c, color, dashed ? 1 : 1.25); if (seg) out.push(seg); }
  }
  return out;
}
function fmtAlpha(x: number) { return String(Math.round(x * 100) / 100); }
function orbitGraphic() {
  if (!field || auto || !orbitGuide.length || landed) return null;
  const b = field;
  // seen edge-on (the camera in the orbit's plane) an orbit is one line
  // through the screen that tells nothing: it fades out
  const f = norm(sub(cam.look, cam.pos));
  const n = cross(sub(pos, b.pos), vel);
  const nl = len(n);
  const k = nl > 0 ? Math.abs(dot(f, n)) / nl : 1;
  const fade = Math.max(0, Math.min(1, (k - 0.12) / 0.25));
  if (fade <= 0) return null;
  const a = (x: number) => fmtAlpha(x * fade);
  const predictedColor = orbitOutcome === "impact" ? "rgba(255,120,70," + a(0.5) + ")" : orbitOutcome === "escape" ? "rgba(255,190,60," + a(0.4) + ")" : "rgba(125,255,142," + a(0.35) + ")";
  return <div className="orbitGraphics">
    {orbitProjected(orbitLaneInner, b, "rgba(125,255,142," + a(0.16) + ")", true)}
    {orbitProjected(orbitLaneOuter, b, "rgba(125,255,142," + a(0.16) + ")", true)}
    {orbitProjected(orbitGuide, b, "rgba(170,255,185," + a(0.3) + ")", true)}
    {orbitProjected(orbitTrail, b, predictedColor, false)}
  </div>;
}
function orbitHud() {
  if (!field || auto) return null;
  const b = field;
  if (landed) {
    return <div className="orbitAssist success">
      <div className="orbitAssistRow">
        <div className="orbitAssistLabel">{rg.t("▣ PINNALLA", "▣ LANDED", "▣ EN SUPERFICIE")}</div>
        <div className="orbitAssistCheck">✓</div>
      </div>
      <div className="orbitAssistSub">{rg.t("NOKKA YLÖS + TYÖNTÖ = NOUSU", "NOSE UP + THRUST = LIFT-OFF", "MORRO ARRIBA + EMPUJE = DESPEGUE")}</div>
    </div>;
  }
  const p = orbitManeuver(b);
  const sec = p.ready ? 0 : Math.max(0, p.seconds);
  const full = orbitBurnWasActive ? Math.max(orbitBurnLatch, 0.3) : Math.max(sec, 0.3);
  const remaining = p.ready ? 1 : Math.max(0, Math.min(1, sec / full));
  const aligned = p.locked && !p.ready && !p.coast;
  const status = p.ready ? rg.t("KIERTORATA VAKAA", "ORBIT STABLE", "ÓRBITA ESTABLE")
    : p.coast ? rg.t("KURSSI OK · LIUU", "ON COURSE · COAST", "EN RUMBO · DERIVA")
    : orbitOutcome === "impact" ? rg.t("TÖRMÄYSKURSSI", "IMPACT COURSE", "RUMBO DE IMPACTO")
    : orbitOutcome === "escape" ? rg.t("PAKORATA", "ESCAPE PATH", "TRAYECTORIA DE ESCAPE")
    : rg.t("KORJAA RATAA", "CORRECT ORBIT", "CORRIGE LA ÓRBITA");
  return <div className={p.ready ? "orbitAssist success" : "orbitAssist"}>
    <div className="orbitAssistRow">
      <div className="orbitAssistLabel">{rg.t("◉ RATA-AVUSTIN", "◉ ORBIT ASSIST", "◉ ASISTENTE")}</div>
      {p.ready || p.coast
        ? <div className="orbitAssistCheck">{p.ready ? "✓" : "—"}</div>
        : <div className={aligned ? "orbitAssistTimer aligned" : "orbitAssistTimer"}>{fmt(sec, 1) + " S"}</div>}
    </div>
    <div className="orbitBurnTrack">
      {aligned ? <div className="orbitBurnGlow" /> : null}
      <div className={aligned ? "orbitBurnFill aligned" : "orbitBurnFill"} style={{ width: remaining * 294 }} />
    </div>
    <div className="orbitAssistSub">{status + " · " + rg.t("TAVOITE ", "TARGET ", "OBJETIVO ") + grp(b.h) + " KM · Δv " + fmt(p.dv, 2) + " KM/S"}</div>
  </div>;
}

// ---- the view ----------------------------------------------------------------

function project(p: number[]) {
  const f = norm(sub(cam.look, cam.pos));
  const r = norm(cross(f, cam.up));
  const u = cross(r, f);
  const d = sub(p, cam.pos);
  const z = dot(d, f);
  if (z < 1e-3) return null;
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  return { x: width / 2 + dot(d, r) / z * focal, y: height / 2 - dot(d, u) / z * focal, z };
}

function fmt(n: number, d = 1) {
  const s = n.toFixed(d);
  return rg.lang === "en" ? s : s.replace(".", ",");
}
// whole numbers with a space between the thousands
function grp(n: number) {
  let s = String(Math.round(Math.abs(n)));
  let out = "";
  while (s.length > 3) { out = " " + s.slice(s.length - 3) + out; s = s.slice(0, s.length - 3); }
  return (n < 0 ? "-" : "") + s + out;
}
function distText(km: number) {
  if (km < 1e6) return grp(km) + " KM";
  if (km < 1e9) return fmt(km / 1e6, km < 1e7 ? 2 : 1) + rg.t(" MILJ. KM", " M KM", " M KM");
  return fmt(km / AU, 2) + " AU";
}
function speedText(kms: number) {
  if (kms < 100) return fmt(kms, 2) + " KM/S";
  if (kms < C_LIGHT * 0.5) return grp(kms) + " KM/S";
  return fmt(kms / C_LIGHT, kms < C_LIGHT * 10 ? 2 : 0) + " c";
}
function pad2(n: number) { return n < 10 ? "0" + n : String(n); }
function clockText(s: number) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const mm = Math.floor(s / 60); s -= mm * 60;
  return "T+" + (d > 0 ? d + rg.t("VRK ", "D ", "D ") : "") + pad2(hh) + ":" + pad2(mm) + ":" + pad2(s);
}

function spots() {
  const out: any[] = [];
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  const f = norm(sub(cam.look, cam.pos));
  const rr = norm(cross(f, cam.up));
  const u = cross(rr, f);
  const list = BODIES.concat(BONUS.filter((x) => bonusSeen(x)));
  for (const b of list) {
    const d = len(sub(b.pos, pos)) - b.r;
    const s = project(b.pos);
    if (s && s.x > 0 && s.x < width && s.y > 0 && s.y < height) {
      out.push({ b, d, edge: false, x: s.x, y: s.y, rpx: b.r / s.z * focal });
    } else {
      const dd = sub(b.pos, cam.pos);
      let ax = dot(dd, rr), ay = -dot(dd, u);
      const l = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= l; ay /= l;
      const top = 128, bottom = height - 200;
      const cy = (top + bottom) / 2;
      const k = Math.min((width / 2 - 26) / Math.max(0.01, Math.abs(ax)), (bottom - top) / 2 / Math.max(0.01, Math.abs(ay)));
      out.push({ b, d, edge: true, x: width / 2 + ax * k, y: cy + ay * k, rpx: 16 });
    }
  }
  return out;
}

function bodyAt(px: number, py: number) {
  let found: Body | null = null, bestD = 1e9;
  for (const s of spots()) {
    if (s.b === field) continue;
    const r = s.edge ? 30 : Math.max(30, s.rpx + 8);
    let dd = Math.hypot(px - s.x, py - s.y);
    if (!s.edge && Math.abs(px - s.x) < 80 && Math.abs(py - (s.y - Math.min(s.rpx, 60) - 16)) < 18) dd = Math.min(dd, r - 1);
    if (dd < r && dd - r < bestD) { bestD = dd - r; found = s.b; }
  }
  return found;
}

function clashes(xs: number[], ys: number[], x: number, y: number) {
  for (let i = 0; i < xs.length; i++) {
    if (Math.abs(xs[i] - x) < 46 && Math.abs(ys[i] - y) < 24) return true;
  }
  return false;
}

function markers() {
  const out: any[] = [];
  const px: number[] = [], py: number[] = [];
  // keep the edge tags off the sight and its label
  if (sightAt && !auto) {
    px.push(sightAt[0], sightAt[0] - 40, sightAt[0], sightAt[0] + 40);
    py.push(sightAt[1], sightAt[1] + 33, sightAt[1] + 33, sightAt[1] + 33);
  }
  for (const s of spots()) {
    const b = s.b;
    if (b === field && s.rpx > 40) continue;
    if (!s.edge) {
      if (s.rpx > width * 0.6) continue;
      const box = Math.max(16, Math.min(80, s.rpx * 2 + 10));
      if (s.y > 108 && s.y < height - 40) out.push(<div className={done(b) ? "tbox seen" : "tbox"} style={{ left: s.x - box / 2, top: s.y - box / 2, width: box, height: box }} />);
      const y = s.y - box / 2 - 15;
      if (y < 110 || y > height - 60) continue;
      out.push(<div className={done(b) ? "mark seen" : "mark"} style={{ left: Math.max(4, Math.min(width - 164, s.x - 80)), top: y }}>
        {(done(b) ? "✓ " : "") + b.name.toUpperCase() + " " + distText(Math.max(0, s.d))}</div>);
    } else {
      if (b === field) continue;
      // slide along the edge: 0, +1, -1, +2, -2 … steps from where it points
      const alongX = s.y < 138 || s.y > height - 210;
      let x = s.x, y = s.y;
      let k = 1;
      while (k < 12 && clashes(px, py, x, y)) {
        const n = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        if (alongX) x = Math.max(26, Math.min(width - 26, s.x + n * 48));
        else y = Math.max(128, Math.min(height - 200, s.y + n * 26));
        k = k + 1;
      }
      // the edge is full: stack the tag in a row inwards
      let row = 1;
      while (row < 6 && clashes(px, py, x, y)) {
        if (alongX) y = s.y + (s.y < 138 ? 1 : -1) * row * 26;
        else x = s.x + (s.x < width / 2 ? 1 : -1) * row * 48;
        row = row + 1;
      }
      px.push(x); py.push(y);
      out.push(<div className={done(b) ? "edge seen" : "edge"} style={{ left: x - 22, top: y - 11 }}>{b.code}</div>);
    }
  }
  return out;
}

// the Sun's glare when it is small on the screen and not behind a body
function sunGlare() {
  const sun = BODIES[0];
  const s = project(sun.pos);
  if (!s || s.x < -40 || s.x > width + 40 || s.y < -40 || s.y > height + 40) return null;
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  const rpx = sun.r / s.z * focal;
  if (rpx > 60) return null;
  for (const b of BODIES) if (b !== sun && !orbitVisible(sun.pos, b)) return null;
  const g1 = 64 + rpx * 2, g2 = 26 + rpx * 2;
  return <div className="glareLayer">
    <div className="glare1" style={{ left: s.x - g1 / 2, top: s.y - g1 / 2, width: g1, height: g1, borderRadius: g1 / 2 }} />
    <div className="glare2" style={{ left: s.x - g2 / 2, top: s.y - g2 / 2, width: g2, height: g2, borderRadius: g2 / 2 }} />
    <div className="glareH" style={{ left: s.x - 70, top: s.y - 1 }} />
  </div>;
}

function scanline() {
  const y = (t * 70) % (height + 40) - 20;
  return <div className="scan" style={{ top: y }} />;
}

function cursor() { return Math.floor(t * 2.5) % 2 ? "▮" : " "; }

function titleView() {
  const lines = [
    "NAV-6000 " + rg.t("ALUSTIETOKONE", "SHIP COMPUTER", "ORDENADOR DE A BORDO") + " v2.1.7",
    "> " + rg.t("REAKTORI", "REACTOR", "REACTOR") + " .................. OK",
    "> " + rg.t("PÄÄMOOTTORI", "MAIN ENGINE", "MOTOR PRINCIPAL") + " ........... OK",
    "> " + rg.t("DEFLEKTORI", "DEFLECTOR", "DEFLECTOR") + " ............. OK",
    "> " + rg.t("AURINKOKUNTA LADATTU 1:1", "SOLAR SYSTEM LOADED 1:1", "SISTEMA SOLAR CARGADO 1:1"),
    "> " + rg.t("TODELLISET KOOT JA ETÄISYYDET", "REAL SIZES AND DISTANCES", "TAMAÑOS Y DISTANCIAS REALES"),
    "> " + rg.t("TEHTÄVÄ: 7 KOHDETTA", "MISSION: 7 TARGETS", "MISIÓN: 7 DESTINOS"),
  ];
  const shown = Math.min(lines.length, Math.floor(t * 4));
  const out: any[] = [];
  for (let i = 0; i < shown; i++) out.push(<div className={i === 0 ? "bootHead" : "bootLine"}>{lines[i]}</div>);
  return (
    <div className="screen">
      {scanline()}
      <div className="titleBox">
        <div className="titleRow"><div className="tag">SOLAR PILOT</div><div className="clock">NAV-6000</div></div>
        <div className="rule2" />
        {out}
        {shown >= lines.length ? <div className="bootInfo">
          <div className="bootLine">{rg.t("SAAVUTA MATALA KIERTORATA TAI", "REACH A LOW ORBIT OR LAND", "ALCANZA UNA ÓRBITA BAJA O")}</div>
          <div className="bootLine">{rg.t("LASKEUDU JOKAISEEN KOHTEESEEN.", "SOFTLY ON EVERY TARGET.", "ATERRIZA EN CADA DESTINO.")}</div>
          <div className="rule2" />
          <div className="bootDim">{rg.t("VEDÄ = OHJAUS · TYÖNTÖ = MOOTTORI", "DRAG = STEER · THRUST = ENGINE", "ARRASTRA = GIRAR · EMPUJE = MOTOR")}</div>
          <div className="bootDim">{rg.t("NAPAUTA KOHDETTA = MATKA SEN LUO", "TAP A TARGET = CRUISE TO IT", "TOCA UN DESTINO = VIAJA HACIA ÉL")}</div>
          <div className="bootDim">{rg.t("SEURAA VIHREÄÄ TÄHTÄINTÄ", "FOLLOW THE GREEN SIGHT", "SIGUE LA MIRA VERDE")}</div>
          {Object.keys(found).length > 0 ? <div className="bootDim">{"✦ " + rg.t("LÖYDÖT ", "FINDS ", "HALLAZGOS ") + Object.keys(found).length + "/" + FIND_TOTAL}</div> : null}
          {best > 0 ? <div className="bootDim">{rg.t("PARAS: KAIKKI ", "BEST: ALL WITH ", "MEJOR: TODOS CON ") + best + rg.t(" TÖRMÄYKSELLÄ", " IMPACTS", " IMPACTOS")}</div> : null}
        </div> : null}
      </div>
      {shown >= lines.length ? (() => {
        const bx = startBox();
        return <div className="lvl on" style={{ left: bx.x, top: bx.y, width: bx.w, height: bx.h }}>
          <div className="lvlName on">{rg.t("LENNÄ", "FLY", "VUELA") + cursor()}</div>
        </div>;
      })() : null}
    </div>
  );
}

// the critical things blink red
function warnings() {
  if (!field || auto || dead || landed) return null;
  const b = field;
  const on = Math.floor(t * 4) % 2 === 0;
  const out: any[] = [];
  if (impactIn >= 0 && impactIn < 30 && !chute && heatQ < 0.05)
    out.push(<div className={on ? "warn red" : "warn redDim"}>{rg.t("TÖRMÄYS ", "IMPACT ", "IMPACTO ") + fmt(impactIn, impactIn < 10 ? 1 : 0) + " S"}</div>);
  const alt = len(sub(pos, b.pos)) - b.r;
  if (alt < b.h * 0.3 && dot(vel, norm(sub(pos, b.pos))) < 0 && !chute)
    out.push(<div className={on ? "warn red" : "warn redDim"}>{rg.t("MATALA KORKEUS ", "LOW ALTITUDE ", "ALTITUD BAJA ") + grp(alt) + " KM"}</div>);
  if (heatQ > Q_MAX * 0.4)
    out.push(<div className={heatQ > Q_MAX * 0.8 && on ? "warn red" : "warn amber"}>{rg.t("LÄMPÖKILPI ", "HEAT SHIELD ", "ESCUDO TÉRMICO ") + Math.round(heatQ / Q_MAX * 100) + " % · " + rg.t("KUNTO ", "INTEGRITY ", "ESTADO ") + Math.max(0, Math.round(shieldHp * 100)) + " %"}</div>);
  if (gLoad > 4)
    out.push(<div className={gLoad > G_MAX * 0.8 && on ? "warn red" : "warn amber"}>{rg.t("G-KUORMA ", "G LOAD ", "CARGA G ") + fmt(gLoad, 1) + " G"}</div>);
  if (AIR[b.id] && alt < b.atm && !chute && heatQ <= Q_MAX * 0.4 && len(vel) > CHUTE_V && alt < AIR[b.id][2] * 3)
    out.push(<div className="warn amber">{rg.t("LIIAN NOPEA LASKUVARJOLLE", "TOO FAST FOR THE PARACHUTE", "DEMASIADO RÁPIDO PARA EL PARACAÍDAS")}</div>);
  if (chute) out.push(<div className="warn green">{rg.t("LASKUVARJO AUKI · ", "PARACHUTE OPEN · ", "PARACAÍDAS ABIERTO · ") + fmt(len(vel) * 1000, 0) + " M/S"}</div>);
  if (!out.length) return null;
  return <div className="warnBox" style={{ top: 134, left: midX(16) }}>{out}</div>;
}

function deadView() {
  const d = dead!;
  return <div className="deadLayer">
    <div className="deadBox" style={{ top: height * 0.32, left: midX(24) }}>
      <div className="deadHead">{rg.t("!! ALUS MENETETTY !!", "!! SHIP LOST !!", "!! NAVE PERDIDA !!")}</div>
      <div className="deadCause">{d.cause}</div>
      <div className="deadSub">{t - d.t > 1.5 ? rg.t("NAPAUTA: LATAA VARMUUSKOPIO", "TAP: RESTORE BACKUP", "TOCA: RESTAURAR COPIA") + cursor() : " "}</div>
    </div>
  </div>;
}

function view() {
  if (screen === "title") return titleView();
  const b = field;
  let altText = "—", speed = "", timeText = "", gText = "—";
  let target = rg.t("SYVÄ AVARUUS", "DEEP SPACE", "ESPACIO PROFUNDO");
  if (auto) {
    target = "WARP → " + auto.b.name.toUpperCase();
    altText = distText(Math.max(0, len(sub(auto.b.pos, pos)) - auto.b.r));
    speed = speedText(autoSpeed);
    timeText = "WARP";
  } else if (b) {
    target = b.name.toUpperCase() + (landed ? rg.t(" · PINNALLA", " · LANDED", " · EN SUPERFICIE") : "");
    altText = grp(Math.max(0, len(sub(pos, b.pos)) - b.r)) + " KM";
    speed = speedText(len(vel));
    timeText = "×" + Math.round(warpNow(b)) + (realTime ? rg.t(" TOSI", " REAL", " REAL") : "");
    const r = len(sub(pos, b.pos));
    gText = fmt(b.gm / (r * r) * 1000, 2) + " M/S²";
  } else {
    let nb = BODIES[0], nd = 1e30;
    for (const x of BODIES) { const d = len(sub(x.pos, pos)) - x.r; if (d < nd) { nd = d; nb = x; } }
    altText = distText(nd);
    speed = speedText(cruise);
    timeText = "CRUISE";
    target = target + " · " + nb.code;
  }
  const maneuver = b && !auto && !landed ? orbitManeuver(b) : null;
  const aimingCorrectly = !!(maneuver && maneuver.locked && !maneuver.ready && !maneuver.coast);
  return (
    <div className="screen">
      {sunGlare()}
      {orbitGraphic()}
      {orbitReticle()}
      {auto ? null : markers()}
      <div className="top">
        <div className="hdr"><div className="tag">{"NAV-6000"}</div><div className="clock">{clockText(simT)}</div></div>
        <div className="rule" />
        <div className="target">{target}</div>
        <div className="grid">
          <div className="cell"><div className="lab">{b && !auto ? rg.t("KORKEUS", "ALTITUDE", "ALTITUD") : rg.t("ETÄISYYS", "DISTANCE", "DISTANCIA")}</div><div className="val">{altText}</div></div>
          <div className="cell"><div className="lab">{rg.t("PAINOVOIMA", "GRAVITY", "GRAVEDAD")}</div><div className="val">{gText}</div></div>
          <div className={b && !auto ? "cell tap" : "cell"}><div className="lab">{rg.t("AIKA", "TIME", "TIEMPO")}</div><div className={timeText === "WARP" ? "val warn" : "val"}>{timeText}</div></div>
          {tempCell()}
        </div>
      </div>
      {orbitHud()}
      {miniMap()}
      <div className="spd" style={{ left: width / 2 - 72 }}>
        <div className="spdLab">{rg.t("NOPEUS", "VELOCITY", "VELOCIDAD")}</div>
        <div className="spdv">{speed}</div>
        <div className={thrusting ? "spdLab on" : "spdLab"}>{thrusting ? rg.t("MOOTTORI PÄÄLLÄ", "ENGINE ON", "MOTOR ENCENDIDO") : (b && !auto ? rg.t("TYÖNTÖ ", "THRUST ", "EMPUJE ") + fmt(b.acc * accK() * 1000 / 9.81, 1) + " G" : " ")}</div>
      </div>
      {dazzle > 0.01 ? <div className="dazzle" style={{ opacity: dazzle }} /> : null}
      {warnings()}
      {findToastView()}
      {heatQ > Q_MAX * 0.15 ? <div className="heatTint" style={{ opacity: Math.min(0.55, heatQ / Q_MAX * 0.5) }} /> : null}
      {dead ? deadView() : null}
      {t - lastBounce < 1.0 ? <div className="alert" style={{ top: height * 0.4 }}><div className="alertt">{bounceText}</div></div> : null}
      {messageClock > 0 ? <div className="msg" style={{ top: height * 0.3, left: midX(16) }}>{"> " + message + cursor()}</div> : null}
      {stick && stick.moved ? <div className="stick" style={{ left: stick.x - PAD_R, top: stick.y - PAD_R, width: PAD_R * 2, height: PAD_R * 2, borderRadius: PAD_R }}>
        <div className="knob" style={{ left: PAD_R - 18 + Math.max(-PAD_R, Math.min(PAD_R, stick.dx)), top: PAD_R - 18 + Math.max(-PAD_R, Math.min(PAD_R, stick.dy)) }}></div>
      </div> : null}
      <div className={aimingCorrectly
          ? (thrusting > 0 ? "throttleButton active aligned" : "throttleButton aligned")
          : (thrusting > 0 ? "throttleButton active" : "throttleButton")}
        onPointerDown={(e: any) => { throttlePointer = e.pointer; }}
        onPointerUp={(e: any) => { if (throttlePointer === e.pointer) throttlePointer = null; }}>
        {aimingCorrectly ? <div className="throttleGoldHalo" /> : null}
        <div className="throttleInner" />
        <div className="throttleSymbol">▲</div>
        <div className="throttleText">{rg.t("TYÖNTÖ", "THRUST", "EMPUJE")}</div>
      </div>
      {scanline()}
    </div>
  );
}
