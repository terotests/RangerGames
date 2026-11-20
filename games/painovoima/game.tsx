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
  return { id, code, name, pos, r, gm, rot, tilt, h, soi, land, atm, sky, turn, vc: 0, warp: 1, acc: 0, reach: 0, g0: 0 };
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
let aimAlt = 0;                 // where the approach path's closest point was aimed (km above the surface)
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
let level = 1;
function accK() { return level === 2 ? 0.5 : 1; }
const LEVELS = [rg.t("KADETTI", "CADET", "CADETE"), rg.t("LENTÄJÄ", "PILOT", "PILOTO"), rg.t("VETERAANI", "VETERAN", "VETERANO")];

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
  level = rg.load("level", 1);
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
  // the ship: a grey hull, an amber canopy, a blue ion flame
  rg.three("add", { id: "body", shape: "cone", size: [0.5, 2.2], detail: 10, color: "#c3c7cc" });
  rg.three("add", { id: "band", shape: "cylinder", size: [0.42, 0.48, 0.4], detail: 10, color: "#4a5058" });
  rg.three("add", { id: "window", shape: "sphere", size: [0.18], detail: 8, color: "#ffb347", emissive: true });
  rg.three("add", { id: "wingL", shape: "box", size: [1.1, 0.07, 0.6], color: "#6b727c" });
  rg.three("add", { id: "wingR", shape: "box", size: [1.1, 0.07, 0.6], color: "#6b727c" });
  rg.three("add", { id: "fin", shape: "box", size: [0.07, 0.7, 0.6], color: "#6b727c" });
  rg.three("add", { id: "flame", shape: "cone", size: [0.3, 1.2], detail: 8, color: "#58c7ff", emissive: true, visible: false });
  rg.three("add", { id: "flame2", shape: "cone", size: [0.17, 0.8], detail: 8, color: "#e6fbff", emissive: true, visible: false });
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
  const s = R([0, 0, 0]);
  rg.three("space", { sun: s });
  const l = norm(mul(pos, -1));
  rg.three("light", { id: "sun", type: "directional", x: l[0], y: l[1], z: l[2], intensity: 0.95 });
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

const PARTS = ["body", "band", "window", "wingL", "wingR", "fin", "flame", "flame2"];
function hideShip() { for (const id of PARTS) rg.three("set", { id, visible: false }); }

function placeShip() {
  const nose = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  const tail = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
  const flat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  part("body", [0, 0, -0.3], nose[0], nose[1], nose[2]);
  part("band", [0, 0, 0.62], nose[0], nose[1], nose[2]);
  part("window", [0, 0.26, -0.45], flat[0], flat[1], flat[2]);
  part("wingL", [-0.65, -0.07, 0.55], flat[0], flat[1], flat[2]);
  part("wingR", [0.65, -0.07, 0.55], flat[0], flat[1], flat[2]);
  part("fin", [0, 0.4, 0.58], flat[0], flat[1], flat[2]);
  const f = thrusting > 0 ? 0.8 + 0.25 * Math.sin(t * 47) : 0;
  const k = SHIP_SCALE;
  part("flame", [0, 0, 0.98 + 0.6 * f], tail[0], tail[1], tail[2], { visible: f > 0, sy: Math.max(0.01, f) * k });
  part("flame2", [0, 0, 0.92 + 0.4 * f], tail[0], tail[1], tail[2], { visible: f > 0, sy: Math.max(0.01, f) * k });
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
  const want = add(mul(fwd, -CAM_BACK), mul(up, CAM_UP));
  const wantLook = add(mul(fwd, CAM_AHEAD), mul(up, -CAM_DOWN));
  camOff = add(camOff, mul(sub(want, camOff), k));
  lookOff = add(lookOff, mul(sub(wantLook, lookOff), k));
  cam.up = norm(add(cam.up, mul(sub(up, cam.up), k)));
  cam.pos = outside(add(pos, camOff));
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

function onThrottleButton(px: number, py: number) {
  const dx = px - (width - 58), dy = py - (height - 58);
  return dx * dx + dy * dy <= 54 * 54;
}
function onPointerDown(px: number, py: number, info: any) {
  if (screen === "title") { const l = levelAt(px, py); if (l >= 0 && t > 0.6) { level = l; rg.save("level", l); start(); } return; }
  if (auto) return;
  if (onThrottleButton(px, py)) { throttlePointer = info.pointer; return; }
  if (stick) return;
  stick = { id: info.pointer, x: px, y: py, dx: 0, dy: 0, t, moved: false };
}
// the level buttons on the title screen
function levelBox(i: number) { return { x: 8 + i * 116, y: height - 130, w: 112, h: 58 }; }
function levelAt(px: number, py: number) {
  for (let i = 0; i < 3; i++) {
    const b = levelBox(i);
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return i;
  }
  return -1;
}
function onPointerUp(px: number, py: number, info: any) {
  if (info.pointer === throttlePointer) { throttlePointer = null; return; }
  if (!stick || stick.id !== info.pointer) return;
  const tap = !stick.moved && t - stick.t < TAP_TIME;
  stick = null;
  if (tap && !auto && !onThrottleButton(px, py)) {
    if (level === 0 && sightAt && Math.hypot(px - sightAt[0], py - sightAt[1]) < 42) {
      autoAlign = true;
      rg.sound("note", { note: 79, len: 0.08, wave: "square", volume: 0.25 });
      return;
    }
    const b = bodyAt(px, py);
    if (b) startAuto(b);
  }
}

function onKeyDown(key: string) {
  if (screen === "title" && (key === " " || key === "Enter")) start();
  if (screen === "title" && (key === "1" || key === "2" || key === "3")) { level = parseInt(key) - 1; rg.save("level", level); start(); }
  if (key === "r" && screen === "play") { reset(); say(rg.t("Takaisin Maan kiertoradalle", "Back to Earth orbit", "De vuelta a la órbita terrestre")); }
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

// the autopilot stops in a parking orbit (cadet) or far out on an approach path
function arrivalAlt(b: Body) { return level === 0 ? Math.min(3 * b.h, (b.reach - b.r) * 0.6) : (b.reach - b.r) * 0.8; }

function startAuto(b: Body) {
  if (b === field) return;
  const d = sub(pos, b.pos);
  const c0 = len(d);
  const c1 = b.r + arrivalAlt(b);
  if (c0 < c1 * 1.05) return;
  const dur = Math.max(2.6, Math.min(7, 2 + 0.75 * Math.log(c0 / c1) / Math.LN10));
  const dir = mul(d, 1 / c0);
  // above the cadet level the arrival point is off the straight line, in a
  // random direction, so every approach comes in at its own angle
  let dir1 = dir;
  if (level > 0) {
    let side = cross(dir, [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
    if (len(side) < 1e-3) side = cross(dir, [0, 1, 0]);
    dir1 = norm(rotate(dir, norm(side), (0.25 + Math.random() * 0.45) * (level === 2 ? 1.5 : 1)));
  }
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
  if (u >= 1) {
    auto = null;
    thrusting = 0;
    const radial = a.dir1;
    let tangent = norm(cross([0, 1, 0], radial));
    if (len(tangent) < 0.5) tangent = norm(cross([1, 0, 0], radial));
    const b = a.b;
    let v = mul(tangent, Math.sqrt(b.gm / a.c1));
    if (level === 0) {
      // a circular parking orbit at the arrival height, the nose prograde
      fwd = tangent;
      up = radial;
      camOff = add(mul(fwd, -CAM_BACK), mul(up, CAM_UP));
      lookOff = add(mul(fwd, CAM_AHEAD), mul(up, -CAM_DOWN));
      cam.up = up;
    } else {
      // falling in a little faster than escape speed in a random plane, aimed
      // off the target height: the closest point may be too high, too low or
      // even on the surface. The nose still points at the planet (no camera
      // jump); the pilot turns to the green sight and corrects the course
      // before braking into orbit at the closest point
      const spin = Math.random() * Math.PI * 2;
      tangent = norm(rotate(tangent, radial, spin));
      const lo = level === 1 ? -1.5 : -4, hi = level === 1 ? 5 : 10;
      aimAlt = b.h * (lo + Math.random() * (hi - lo));
      const rp = Math.max(b.r * 0.25, b.r + aimAlt);
      const s = vesc(b, a.c1) * (level === 1 ? 1.03 : 1.1);
      const vp = Math.sqrt(s * s - 2 * b.gm / a.c1 + 2 * b.gm / rp);
      const vt = Math.min(s, rp * vp / a.c1);
      const vr = Math.sqrt(Math.max(0, s * s - vt * vt));
      v = add(mul(tangent, vt), mul(radial, -vr));
    }
    enterField(b, v);
    if (level === 0) say(b.name + ": " + rg.t("pysäköintirata ", "parking orbit ", "órbita de espera ") + grp(a.c1 - b.r) + " km. " +
      rg.t("Laske tavoitteeseen ", "Lower to ", "Baja a ") + grp(b.h) + " km.");
    else say(b.name + ": " + rg.t("lähestymisrata, lähin kohta ", "approach path, closest point ", "trayectoria de aproximación, punto más cercano ") +
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
  return Math.max(floor, bestE * CRUISE_K);
}

function enterField(b: Body, v: number[]) {
  field = b;
  const r = len(sub(pos, b.pos));
  const lim = vesc(b, r);
  const s = len(v);
  vel = s > lim ? mul(v, lim / s) : v;
  cruise = 0;
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
    const sdt = dt * b.warp;
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
  if (auto) {
    stepAuto(h);
  } else {
    const c = controls();
    const n = field ? 10 : 2;
    for (let i = 0; i < n; i++) step(h / n, c);
  }
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
  const seconds = dv / (b.acc * accK() * b.warp);
  const ready = Math.abs(heightError) < b.h * 0.35
    && Math.abs(m.radialSpeed) < m.localSpeed * 0.12
    && Math.abs(m.sideways - m.localSpeed) < m.localSpeed * 0.1;
  const direction = dv > 1e-6 ? mul(delta, 1 / dv) : m.tangent;
  const locked = dot(fwd, direction) > 0.95;
  return { m, dv, seconds, direction, locked, ready, heightError };
}

function orbitReticle() {
  sightAt = null;
  if (!field || auto || landed) return null;
  const p = orbitManeuver(field);
  if (p.ready) return null;
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
  const label = autoAlign ? "AUTO" : (!q ? rg.t("TAKANA · NAPAUTA", "BEHIND · TAP", "DETRÁS · TOCA") : (p.locked ? "" : rg.t("NAPAUTA", "TAP", "TOCA")));
  const shipPoint = project(pos);
  const sx = shipPoint ? shipPoint.x : width * 0.5;
  const sy = shipPoint ? shipPoint.y : height * 0.4;
  const dx = px - sx, dy = py - sy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const ux = distance > 0.1 ? dx / distance : 0;
  const uy = distance > 0.1 ? dy / distance : -1;
  const ax = Math.max(20, Math.min(width - 20, sx + ux * 58));
  const ay = Math.max(146, Math.min(maxY - 8, sy + uy * 58));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return <div className="orbitReticleLayer">
    {!p.locked && distance > 70
      ? <div className="orbitAimArrow" style={{ left: ax - 13, top: ay - 13, transform: "rotate(" + angle + "deg)" }}>➤</div>
      : null}
    <div className={p.locked ? "orbitSight locked" : "orbitSight"} style={{ left: px - 25, top: py - 25 }}>
      {p.locked ? <div className="sightGoldHalo" /> : null}
      <div className={p.locked ? "sightRing aligned" : "sightRing"} />
      <div className={p.locked ? "sightCrossH aligned" : "sightCrossH"} />
      <div className={p.locked ? "sightCrossV aligned" : "sightCrossV"} />
      <div className={p.locked ? "sightDot aligned" : "sightDot"} />
    </div>
    {label ? <div className="sightLabel" style={{ left: px - 60, top: py + 28 }}>{label}</div> : null}
  </div>;
}

// the unpowered path ahead, with the same gravity as the ship's
function updateOrbitPrediction() {
  if (!field || auto) {
    orbitTrail = []; orbitGuide = []; orbitLaneInner = []; orbitLaneOuter = [];
    orbitBodyId = ""; orbitOutcome = "";
    return;
  }
  const b = field;
  if (orbitBodyId === b.id && t - orbitCacheAt < 0.24) return;
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
  const dtPred = b.warp * ORBIT_GAME_S / 260;
  for (let i = 0; i < 320; i++) {
    const d = sub(b.pos, pp);
    const r = len(d);
    vv = add(vv, mul(d, b.gm / (r * r * r) * dtPred));
    pp = add(pp, mul(vv, dtPred));
    if (i % 3 === 2) orbitTrail.push(pp);
    const radius = len(sub(pp, b.pos));
    if (radius <= b.r + SHIP_R) { orbitTrail.push(pp); orbitOutcome = "impact"; break; }
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
  if (dist < 1 || dist > width * 1.35) return null;
  if (Math.min(a.x, c.x) > width + 30 || Math.max(a.x, c.x) < -30 || Math.min(a.y, c.y) > height + 30 || Math.max(a.y, c.y) < -30) return null;
  return <div className="orbitSegment"
    style={{ left: (a.x + c.x) * 0.5 - dist * 0.5, top: (a.y + c.y) * 0.5 - thickness * 0.5, width: dist, height: thickness, backgroundColor: color,
      transform: "rotate(" + (Math.atan2(dy, dx) * 180 / Math.PI) + "deg)" }} />;
}
function orbitProjected(points: number[][], b: Body, color: string, dashed: boolean) {
  const out: any[] = [];
  for (let i = 1; i < points.length; i++) {
    if (dashed && (i % 2) === 0) continue;
    const p = points[i - 1], q = points[i];
    if (!orbitVisible(p, b) || !orbitVisible(q, b)) continue;
    const a = project(p), c = project(q);
    if (a && c) { const seg = orbitSegment(a, c, color, dashed ? 1.25 : 2); if (seg) out.push(seg); }
  }
  return out;
}
function orbitGraphic() {
  if (!field || auto || !orbitGuide.length || landed) return null;
  const b = field;
  const predictedColor = orbitOutcome === "impact" ? "rgba(255,120,70,0.6)" : orbitOutcome === "escape" ? "rgba(255,190,60,0.5)" : "rgba(125,255,142,0.6)";
  return <div className="orbitGraphics">
    {orbitProjected(orbitLaneInner, b, "rgba(125,255,142,0.16)", true)}
    {orbitProjected(orbitLaneOuter, b, "rgba(125,255,142,0.16)", true)}
    {orbitProjected(orbitGuide, b, "rgba(170,255,185,0.45)", true)}
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
  const aligned = p.locked && !p.ready;
  const status = p.ready ? rg.t("KIERTORATA VAKAA", "ORBIT STABLE", "ÓRBITA ESTABLE")
    : orbitOutcome === "impact" ? rg.t("TÖRMÄYSKURSSI", "IMPACT COURSE", "RUMBO DE IMPACTO")
    : orbitOutcome === "escape" ? rg.t("PAKORATA", "ESCAPE PATH", "TRAYECTORIA DE ESCAPE")
    : rg.t("KORJAA RATAA", "CORRECT ORBIT", "CORRIGE LA ÓRBITA");
  return <div className={p.ready ? "orbitAssist success" : "orbitAssist"}>
    <div className="orbitAssistRow">
      <div className="orbitAssistLabel">{rg.t("◉ RATA-AVUSTIN", "◉ ORBIT ASSIST", "◉ ASISTENTE")}</div>
      {p.ready
        ? <div className="orbitAssistCheck">✓</div>
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
  for (const b of BODIES) {
    const d = len(sub(b.pos, pos)) - b.r;
    const s = project(b.pos);
    if (s && s.x > 0 && s.x < width && s.y > 0 && s.y < height) {
      out.push({ b, d, edge: false, x: s.x, y: s.y, rpx: b.r / s.z * focal });
    } else {
      const dd = sub(b.pos, cam.pos);
      let ax = dot(dd, rr), ay = -dot(dd, u);
      const l = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= l; ay /= l;
      const top = 140, bottom = height - 200;
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
  for (const s of spots()) {
    const b = s.b;
    if (b === field && s.rpx > 40) continue;
    if (!s.edge) {
      if (s.rpx > width * 0.6) continue;
      const box = Math.max(16, Math.min(80, s.rpx * 2 + 10));
      if (s.y > 120 && s.y < height - 40) out.push(<div className={visited[b.id] ? "tbox seen" : "tbox"} style={{ left: s.x - box / 2, top: s.y - box / 2, width: box, height: box }} />);
      const y = s.y - box / 2 - 15;
      if (y < 122 || y > height - 60) continue;
      out.push(<div className={visited[b.id] ? "mark seen" : "mark"} style={{ left: Math.max(4, Math.min(width - 164, s.x - 80)), top: y }}>
        {(visited[b.id] ? "✓ " : "") + b.name.toUpperCase() + " " + distText(Math.max(0, s.d))}</div>);
    } else {
      if (b === field) continue;
      // slide along the edge: 0, +1, -1, +2, -2 … steps from where it points
      const alongX = s.y < 150 || s.y > height - 210;
      let x = s.x, y = s.y;
      let k = 1;
      while (k < 12 && clashes(px, py, x, y)) {
        const n = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        if (alongX) x = Math.max(26, Math.min(width - 26, s.x + n * 48));
        else y = Math.max(140, Math.min(height - 200, s.y + n * 26));
        k = k + 1;
      }
      px.push(x); py.push(y);
      out.push(<div className={visited[b.id] ? "edge seen" : "edge"} style={{ left: x - 22, top: y - 11 }}>{b.code}</div>);
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
          <div className="bootDim">{rg.t("NAPAUTA KOHDETTA = AUTOPILOTTI", "TAP A TARGET = AUTOPILOT", "TOCA UN DESTINO = PILOTO AUTOMÁTICO")}</div>
          <div className="bootDim">{rg.t("SEURAA VIHREÄÄ TÄHTÄINTÄ", "FOLLOW THE GREEN SIGHT", "SIGUE LA MIRA VERDE")}</div>
          {best > 0 ? <div className="bootDim">{rg.t("PARAS: KAIKKI ", "BEST: ALL WITH ", "MEJOR: TODOS CON ") + best + rg.t(" TÖRMÄYKSELLÄ", " IMPACTS", " IMPACTOS")}</div> : null}
        </div> : null}
      </div>
      {shown >= lines.length ? <div className="lvlHead" style={{ top: height - 152 }}>{"[ " + rg.t("VALITSE TASO", "CHOOSE A LEVEL", "ELIGE UN NIVEL") + " ]" + cursor()}</div> : null}
      {shown >= lines.length ? [0, 1, 2].map((i) => {
        const bx = levelBox(i);
        const note = [rg.t("PYSÄKÖINTIRATA", "PARKING ORBIT", "ÓRBITA DE ESPERA"), rg.t("JARRUTA ITSE", "BRAKE YOURSELF", "FRENA TÚ"), rg.t("½ TYÖNTÖ", "½ THRUST", "½ EMPUJE")][i];
        return <div className={i === level ? "lvl on" : "lvl"} style={{ left: bx.x, top: bx.y, width: bx.w, height: bx.h }}>
          <div className={i === level ? "lvlName on" : "lvlName"}>{LEVELS[i]}</div>
          <div className={i === level ? "lvlSub on" : "lvlSub"}>{note}</div>
        </div>;
      }) : null}
    </div>
  );
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
    timeText = "×" + Math.round(b.warp);
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
  const aimingCorrectly = !!(maneuver && maneuver.locked && !maneuver.ready);
  const codes = BODIES.map((x) => <div className={visited[x.id] ? "code on" : (x === field ? "code here" : "code")}>{x.code}</div>);
  return (
    <div className="screen">
      {sunGlare()}
      {orbitGraphic()}
      {orbitReticle()}
      {auto ? null : markers()}
      <div className="top">
        <div className="hdr"><div className="tag">{"NAV-6000 · " + LEVELS[level]}</div><div className="clock">{clockText(simT)}</div></div>
        <div className="rule" />
        <div className="target">{target}</div>
        <div className="grid">
          <div className="cell"><div className="lab">{b && !auto ? rg.t("KORKEUS", "ALTITUDE", "ALTITUD") : rg.t("ETÄISYYS", "DISTANCE", "DISTANCIA")}</div><div className="val">{altText}</div></div>
          <div className="cell"><div className="lab">{rg.t("PAINOVOIMA", "GRAVITY", "GRAVEDAD")}</div><div className="val">{gText}</div></div>
          <div className="cell"><div className="lab">{rg.t("AIKA", "TIME", "TIEMPO")}</div><div className={timeText === "WARP" ? "val warn" : "val"}>{timeText}</div></div>
        </div>
        <div className="codes">{codes}</div>
      </div>
      {orbitHud()}
      <div className="spd">
        <div className="lab">{rg.t("NOPEUS", "VELOCITY", "VELOCIDAD")}</div>
        <div className="spdv">{speed}</div>
        <div className="lab">{thrusting ? rg.t("MOOTTORI PÄÄLLÄ", "ENGINE ON", "MOTOR ENCENDIDO") : (b && !auto ? rg.t("TYÖNTÖ ", "THRUST ", "EMPUJE ") + fmt(b.acc * accK() * 1000 / 9.81, 1) + " G" : " ")}</div>
      </div>
      {t - lastBounce < 1.0 ? <div className="alert" style={{ top: height * 0.4 }}><div className="alertt">{bounceText}</div></div> : null}
      {messageClock > 0 ? <div className="msg" style={{ top: height * 0.3 }}>{"> " + message + cursor()}</div> : null}
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
