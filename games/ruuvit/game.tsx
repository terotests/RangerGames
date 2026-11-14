// Ruuvit: screws and screwdrivers in 3D, for 5-year-olds. Four levels:
//   1 Kierrä kiinni   turn the screw in with a finger, clockwise
//   2 Oikea meisseli  pick the screwdriver whose tip fits the head
//                     (slot, cross, star, hexagon socket), then turn
//   3 Avaa ruuvi      turn it out, counter-clockwise (last step: either way)
//   4 Pidike          a loose screw wobbles and falls over when turned; put
//                     the holder round it first (last step: put the screw in
//                     its hole first, and pick the screwdriver)
//
// The screw, the board, the screwdriver and the holder are the engine's own
// 3D shapes (rg.three); turning is a finger going round the screw on the
// screen. The threads are little bumps on a helix, so they move as the screw
// turns, and the part of the screw in the wood is hidden.
import { K, Level, setup, step, start, win, miss, update, back, toMenu, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, TurnArrow, PointAt, ngon, star, rect, Button } from "lib/kit";

type Kind = "ura" | "risti" | "torx" | "kolo";
const KINDS: Kind[] = ["ura", "risti", "torx", "kolo"];
const DRIVER_C: any = { ura: "#e63946", risti: "#f4a100", torx: "#2a9d8f", kolo: "#7b2cbf" };
const L = 1.25;            // the screw's length (tip to the head's underside)
const START = 0.35;        // how deep a started screw stands in the wood
const BUMPS = 22;

// ---- small 3×3 matrices, for turning the parts of a tilted, spinning screw --
type M3 = number[][];
function rx(a: number): M3 { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function ry(a: number): M3 { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function rz(a: number): M3 { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
function mm(a: M3, b: M3): M3 {
  const o: M3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return o;
}
function mv(a: M3, v: number[]): number[] { return [a[0][0] * v[0] + a[0][1] * v[1] + a[0][2] * v[2], a[1][0] * v[0] + a[1][1] * v[1] + a[1][2] * v[2], a[2][0] * v[0] + a[2][1] * v[1] + a[2][2] * v[2]]; }
// the engine's rx, ry, rz (three.js XYZ order: M = Rx·Ry·Rz)
function euler(m: M3): number[] {
  const s = Math.max(-1, Math.min(1, m[0][2]));
  const b = Math.asin(s);
  if (Math.abs(s) < 0.99999) return [Math.atan2(-m[1][2], m[2][2]), b, Math.atan2(-m[0][1], m[0][0])];
  return [Math.atan2(m[2][1], m[1][1]), b, 0];
}

// ---- the camera, and points between the screen and the board ---------------
const CAM = [0, 7.2, 6.6], LOOK = [0, 1.0, 0.2], FOV = 40;
function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(a: number[]) { const l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function basis() {
  const f = unit(sub(LOOK, CAM)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f);
  return { f, r, u, focal: (height / 2) / Math.tan(FOV * Math.PI / 360) };
}
function project(p: number[]): number[] {
  const b = basis(), v = sub(p, CAM), z = dot(v, b.f);
  return [width / 2 + dot(v, b.r) / z * b.focal, height / 2 - dot(v, b.u) / z * b.focal];
}
// where the finger at (sx, sy) points on the plane y = h
function onPlane(sx: number, sy: number, h: number): number[] {
  const b = basis();
  const dx = (sx - width / 2) / b.focal, dy = (height / 2 - sy) / b.focal;
  const d = [b.f[0] + b.r[0] * dx + b.u[0] * dy, b.f[1] + b.r[1] * dx + b.u[1] * dy, b.f[2] + b.r[2] * dx + b.u[2] * dy];
  const k = d[1] < -1e-6 ? (h - CAM[1]) / d[1] : 20;
  return [CAM[0] + d[0] * k, h, CAM[2] + d[2] * k];
}

// ---- levels -----------------------------------------------------------------
function picScrew(x: number, y: number, s: number, kind: Kind, arrow: number) {
  const out: any[] = [];
  out.push(Poly([[x - 9 * s, y - 6 * s], [x + 9 * s, y - 6 * s], [x + 9 * s, y + 26 * s], [x, y + 40 * s], [x - 9 * s, y + 26 * s]], "#c0c6cf", "#6c757d", 2));
  for (let i = 0; i < 4; i++) out.push(Line([[x - 11 * s, y + (2 + i * 7) * s], [x + 11 * s, y + (5 + i * 7) * s]], "#6c757d", 2.5));
  out.push(Poly(ngon(x, y - 12 * s, 26 * s, 24, 0).map((p) => [p[0], y - 12 * s + (p[1] - y + 12 * s) * 0.45]), "#dee2e6", "#6c757d", 2));
  out.push(Head(x, y - 12 * s, 16 * s, kind, "#495057", 0.45));
  if (arrow) for (const e of TurnArrow(x, y - 12 * s, 40 * s, arrow, "#ffffff")) out.push(e);
  return out;
}
const LEVELS: Level[] = [
  { name: rg.t("Kierrä kiinni", "Screw it in", "Atornilla"), color: "#f77f00", say: "rk_r_kierra", pic: (x, y, s) => picScrew(x, y, s, "ura", 1) },
  { name: rg.t("Oikea kärki", "Right tip", "La punta"), color: "#2a9d8f", say: "rk_r_valitse", pic: (x, y, s) => picDriver(x - 22 * s, y + 12 * s, s * 0.9, "risti", -0.5).concat(picDriver(x + 22 * s, y + 12 * s, s * 0.9, "torx", 0.5)) },
  { name: rg.t("Avaa ruuvi", "Unscrew", "Desatornilla"), color: "#118ab2", say: "rk_r_avaa", pic: (x, y, s) => picScrew(x, y, s, "risti", -1) },
  { name: rg.t("Pidike", "Holder", "El soporte"), color: "#7b2cbf", say: "rk_r_pidike", pic: (x, y, s) => picScrew(x, y, s, "torx", 0).concat([Poly(rect(x - 40 * s, y - 2 * s, 22 * s, 30 * s), "#ff9f1c", "#b5540a", 2), Poly(rect(x + 18 * s, y - 2 * s, 22 * s, 30 * s), "#ff9f1c", "#b5540a", 2)]) },
];

// ---- the question -------------------------------------------------------------
let kind: Kind = "ura";
let dir = 1;               // 1 in (clockwise), -1 out
let turns = 2;             // full turns from start to the end
let p = 0;                 // 0 started (or out), 1 all the way in
let phase = "turn";        // "pick", "place", "hold", "turn", "end"
let driver = "";           // the screwdriver on the screw
let choices: Kind[] = [];
let wrongCards: number[] = [];
let shakeCard = -1, shakeT = -10;
let needHolder = false, holder = false;
let holderPos = [1.3, 0.22, 0.7];
let screwPos = [0, 0, 0];  // where the screw stands (its hole); lying: where it lies
let lying = false;         // the screw lies on the board (to be put in its hole)
let tilt = 0;              // radians, about the z axis
let fallT = -10;           // when it fell over
let spin = 0;              // radians, the screw's own turn
let rise = 0;              // the screw jumping out at the end
let wrongDeg = 0;
let turnedDeg = 0;         // turned without a holder (it falls after a while)
let hintT = -10;
let grab = "";             // "turn", "holder", "screw"
let lastA = 0;
let tickAcc = 0;
let endT = -10;

function hasArrow(): boolean {
  if (phase !== "turn") return false;
  return (K.level === 0 && step() === 0) || (K.level === 2 && step() === 0) || K.t - hintT < 5;
}

function instruct() {
  if (phase === "pick") rg.say("rk_r_valitse");
  else if (phase === "place") rg.say("rk_r_vie_reikaan");
  else if (phase === "hold") rg.say("rk_r_pidike");
  else rg.say(dir > 0 ? "rk_r_kierra" : "rk_r_avaa");
}

function next() {
  const s = step();
  kind = rg.pick(K.level === 1 ? KINDS.slice(0, [2, 3, 4][s]) : KINDS.slice(0, 2 + Math.min(2, s)));
  dir = 1;
  turns = K.level === 0 ? [2, 3, 4][s] : 2;
  driver = kind;
  phase = "turn";
  needHolder = false;
  holder = false;
  lying = false;
  holderPos = [1.3, 0.22, 0.7];
  screwPos = [0, 0, 0];
  tilt = 0;
  spin = rg.random() * 6;
  rise = 0;
  wrongDeg = 0;
  turnedDeg = 0;
  hintT = -10;
  fallT = -10;
  endT = -10;
  wrongCards = [];
  choices = [];
  if (K.level === 1 || (K.level === 3 && s === 2)) {
    const n = K.level === 1 ? [2, 3, 4][s] : 2;
    const others = rg.shuffle(KINDS.filter((k) => k !== kind)).slice(0, n - 1);
    choices = rg.shuffle([kind].concat(others));
    driver = "";
    phase = "pick";
  }
  if (K.level === 2) { dir = s === 2 ? rg.pick([1, -1]) : -1; turns = s === 0 ? 1.5 : 2; }
  if (K.level === 3) {
    needHolder = true;
    tilt = 0.3;
    if (s === 2) { lying = true; screwPos = [-1.3, 0.13, 0.7]; tilt = Math.PI / 2; }
    if (phase !== "pick") phase = lying ? "place" : "hold";
  }
  p = dir > 0 ? 0 : 1;
  build();
  instruct();
}

// ---- the 3D scene ----------------------------------------------------------------
function build() {
  rg.three("clear");
  rg.three("scene", { background: ["#ffe8c2", "#fff6e6"] });
  rg.three("camera", { x: CAM[0], y: CAM[1], z: CAM[2], lookAt: LOOK, fov: FOV });
  rg.three("light", { id: "sun", type: "directional", x: 2, y: 6, z: 3, intensity: 0.5 });
  rg.three("light", { id: "amb", type: "ambient", intensity: 0.42 });
  rg.three("add", { id: "table", shape: "box", size: [9, 0.4, 6], color: "#8d99ae", x: 0, y: -0.85, z: -0.5, layer: -1 });
  rg.three("add", { id: "board", shape: "box", size: [3.8, 0.6, 2.6], color: "#d39150", x: 0, y: -0.3, z: 0.1, layer: -1 });
  for (let i = 0; i < 4; i++) rg.three("add", { id: "grain" + i, shape: "box", size: [3.6, 0.01, 0.04], color: "#b5733a", x: 0.1 * i, y: 0.004, z: -0.95 + i * 0.62 + (i === 1 ? 0.18 : 0), layer: -1 });
  rg.three("add", { id: "hole", shape: "cylinder", size: [0.2, 0.2, 0.02], detail: 12, color: "#6b3e1f", x: 0, y: 0.012, z: 0, layer: -1 });
  rg.three("add", { id: "head", shape: "cylinder", size: [0.42, 0.42, 0.16], detail: 18, color: "#d9dee4" });
  if (kind === "ura") rg.three("add", { id: "mark0", shape: "box", size: [0.7, 0.06, 0.1], color: "#343a40" });
  if (kind === "risti") { rg.three("add", { id: "mark0", shape: "box", size: [0.56, 0.06, 0.1], color: "#343a40" }); rg.three("add", { id: "mark1", shape: "box", size: [0.1, 0.06, 0.56], color: "#343a40" }); }
  if (kind === "torx") rg.three("add", { id: "mark0", shape: "star", size: [0.24, 0.05], color: "#343a40" });
  if (kind === "kolo") rg.three("add", { id: "mark0", shape: "cylinder", size: [0.17, 0.17, 0.06], detail: 6, color: "#343a40" });
  rg.three("add", { id: "shaft", shape: "cylinder", size: [0.13, 0.13, 1], detail: 12, color: "#b8c0ca" });
  rg.three("add", { id: "tip", shape: "cone", size: [0.13, 0.3], detail: 12, color: "#b8c0ca" });
  for (let i = 0; i < BUMPS; i++) rg.three("add", { id: "b" + i, shape: "box", size: [0.08, 0.05, 0.08], color: "#8e98a5" });
  // the screwdriver (shown when it is on the screw)
  rg.three("add", { id: "dshaft", shape: "cylinder", size: [0.06, 0.06, 0.75], detail: 8, color: "#adb5bd", visible: false });
  rg.three("add", { id: "dhandle", shape: "cylinder", size: [0.25, 0.22, 0.85], detail: 12, color: DRIVER_C[kind], visible: false });
  rg.three("add", { id: "dcap", shape: "sphere", size: [0.25], detail: 10, color: DRIVER_C[kind], visible: false });
  for (let i = 0; i < 4; i++) rg.three("add", { id: "ds" + i, shape: "box", size: [0.07, 0.7, 0.07], color: "#ffffff", visible: false });
  if (needHolder) {
    rg.three("add", { id: "hl", shape: "box", size: [0.28, 0.44, 0.7], color: "#ff9f1c" });
    rg.three("add", { id: "hr", shape: "box", size: [0.28, 0.44, 0.7], color: "#ff9f1c" });
    rg.three("add", { id: "hbar", shape: "box", size: [0.9, 0.12, 0.16], color: "#b5540a" });
  }
  place();
}

// screw depth: how far the tip is under the board's top
function depth(): number { return lying ? 0 : START + (L - 0.02 - START) * p; }

function setPart(id: string, M: M3, base: number[], local: number[], extra: M3 | null, visible: boolean) {
  const w = mv(M, local);
  const e = euler(extra ? mm(M, extra) : M);
  rg.three("set", { id, x: base[0] + w[0], y: base[1] + w[1], z: base[2] + w[2], rx: e[0], ry: e[1], rz: e[2], visible });
}

function place() {
  const dp = depth();
  const base = lying ? screwPos : [screwPos[0], -dp + rise, screwPos[2]];
  const M = mm(rz(-tilt), ry(spin));
  const show = (y: number) => lying || tilt > 0.05 || y >= dp - 0.02;
  setPart("head", M, base, [0, L + 0.08, 0], null, true);
  const flat = kind === "torx" ? rx(-Math.PI / 2) : null;
  setPart("mark0", M, base, [0, L + 0.165, 0], flat, true);
  if (kind === "risti") setPart("mark1", M, base, [0, L + 0.165, 0], null, true);
  const from = lying || tilt > 0.05 ? 0.28 : Math.max(dp, 0.28);
  const len = Math.max(0.01, L - from);
  const e = euler(M), w = mv(M, [0, from + len / 2, 0]);
  rg.three("set", { id: "shaft", x: base[0] + w[0], y: base[1] + w[1], z: base[2] + w[2], rx: e[0], ry: e[1], rz: e[2], sy: len, visible: len > 0.02 });
  setPart("tip", M, base, [0, 0.14, 0], rx(Math.PI), show(0.25));
  for (let i = 0; i < BUMPS; i++) {
    const a = i * Math.PI * 2 / 7, y = 0.12 + i * 0.05;
    setPart("b" + i, M, base, [Math.cos(a) * 0.14, y, Math.sin(a) * 0.14], ry(-a), show(y) && y < L - 0.05);
  }
  const on = driver !== "" && phase !== "pick";
  setPart("dshaft", M, base, [0, L + 0.17 + 0.37, 0], null, on);
  setPart("dhandle", M, base, [0, L + 0.17 + 0.75 + 0.42, 0], null, on);
  setPart("dcap", M, base, [0, L + 0.17 + 0.75 + 0.86, 0], rz(0), on);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    setPart("ds" + i, M, base, [Math.cos(a) * 0.23, L + 0.17 + 0.75 + 0.42, Math.sin(a) * 0.23], null, on);
  }
  if (needHolder) {
    const hp = holder ? [screwPos[0], 0.22, screwPos[2]] : holderPos;
    const gap = holder ? 0.28 : 0.42;
    rg.three("set", { id: "hl", x: hp[0] - gap, y: hp[1], z: hp[2] });
    rg.three("set", { id: "hr", x: hp[0] + gap, y: hp[1], z: hp[2] });
    rg.three("set", { id: "hbar", x: hp[0], y: hp[1] + 0.26, z: hp[2] + 0.28 });
  }
}

// ---- playing ----------------------------------------------------------------------
function screwScreen(): number[] { return project([screwPos[0], lying ? 0.1 : 0.9 - depth() * 0.4, screwPos[2]]); }

function hintSay() {
  hintT = K.t;
  if (phase === "pick") rg.say("rk_r_vihje_" + kind);
  else if (phase === "place") rg.say("rk_r_vie_reikaan");
  else if (phase === "hold") rg.say("rk_r_vihje_pidike");
  else rg.say(dir > 0 ? "rk_vihje_myota" : "rk_vihje_vasta");
}

function pickCard(i: number) {
  if (phase !== "pick" || wrongCards.indexOf(i) >= 0) return;
  if (choices[i] === kind) {
    driver = kind;
    rg.sound("pop");
    phase = lying ? "place" : needHolder && !holder ? "hold" : "turn";
    if (phase === "turn") rg.say(["rk_r_sopii", dir > 0 ? "rk_r_kierra" : "rk_r_avaa"]);
    else { rg.sound("click"); instruct(); }
    place();
    return;
  }
  wrongCards.push(i);
  shakeCard = i; shakeT = K.t;
  const n = miss();
  if (n >= 2) { hintT = K.t; rg.say(["rk_r_ei_sovi", "rk_r_vihje_" + kind]); } else rg.say("rk_r_ei_sovi");
}

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0) return;
  if (phase === "place") {
    const s = project([screwPos[0], 0.15, screwPos[2]]);
    if (Math.abs(x - s[0]) < 60 && Math.abs(y - s[1]) < 60) { grab = "screw"; rg.sound("click"); }
    return;
  }
  if (phase === "hold") {
    const h = project(holderPos);
    if (Math.abs(x - h[0]) < 70 && Math.abs(y - h[1]) < 60) { grab = "holder"; rg.sound("click"); }
    return;
  }
  if (phase !== "turn" || y < 120) return;
  if (K.t - fallT < 1.4) return;
  const c = screwScreen();
  grab = "turn";
  lastA = Math.atan2(y - c[1], x - c[0]);
}

function drag(x: number, y: number) {
  if (grab === "screw") {
    const q = onPlane(x, y, 0.13);
    screwPos = [Math.max(-1.7, Math.min(1.7, q[0])), 0.13, Math.max(-1, Math.min(1.3, q[2]))];
    place();
    return;
  }
  if (grab === "holder") {
    const q = onPlane(x, y, 0.22);
    holderPos = [Math.max(-1.7, Math.min(1.7, q[0])), 0.22, Math.max(-1, Math.min(1.3, q[2]))];
    place();
    return;
  }
  if (grab !== "turn") return;
  const c = screwScreen();
  const a = Math.atan2(y - c[1], x - c[0]);
  let da = a - lastA;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  lastA = a;
  if (Math.abs(da) > 1.2) return;
  turnScrew(da);
}

function turnScrew(da: number) {
  // da > 0: clockwise on the screen
  spin -= da;
  tickAcc += Math.abs(da);
  if (tickAcc > 0.5) { tickAcc = 0; rg.sound("tick", { volume: 0.5 }); }
  if (needHolder && !holder) {
    turnedDeg += Math.abs(da) * 180 / Math.PI;
    if (turnedDeg > 70) fall();
    place();
    return;
  }
  const dp = da * dir / (Math.PI * 2 * turns);
  if (dp < 0) {
    wrongDeg += -da * dir * 180 / Math.PI;
    if (wrongDeg > 100) {
      wrongDeg = 0;
      const n = miss();
      hintT = K.t;
      rg.say(n >= 2 ? ["rk_toiseen_suuntaan", dir > 0 ? "rk_vihje_myota" : "rk_vihje_vasta"] : "rk_toiseen_suuntaan");
    }
  } else wrongDeg = Math.max(0, wrongDeg - dp * 360);
  // turning the wrong way moves the screw the other way, as far as it goes
  p = Math.max(0, Math.min(1, p + dp * dir));
  if (dir > 0 && p >= 1) finish();
  if (dir < 0 && p <= 0) finish();
  place();
}

function fall() {
  grab = "";
  turnedDeg = 0;
  fallT = K.t;
  const n = miss();
  rg.sound("hit");
  rg.say(n >= 2 ? ["rk_r_kaatui", "rk_r_vihje_pidike"] : "rk_r_kaatui");
  hintT = K.t;
}

function finish() {
  grab = "";
  phase = "end";
  endT = K.t;
  const c = screwScreen();
  win(c[0], c[1], [dir > 0 ? "rk_r_kiinni" : "rk_r_auki"]);
}

function drop() {
  if (grab === "screw") {
    const d = Math.hypot(screwPos[0], screwPos[2]);
    if (d < 0.55) {
      lying = false;
      screwPos = [0, 0, 0];
      tilt = 0.3;
      rg.sound("pop");
      phase = needHolder && !holder ? "hold" : "turn";
      instruct();
    } else { rg.sound("click"); }
    place();
  }
  if (grab === "holder") {
    const d = Math.hypot(holderPos[0] - screwPos[0], holderPos[2] - screwPos[2]);
    if (d < 0.7) {
      holder = true;
      tilt = 0;
      rg.sound("pop");
      rg.vibrate(25);
      phase = "turn";
      rg.say(["rk_r_pysyy", dir > 0 ? "rk_r_kierra" : "rk_r_avaa"]);
    }
    place();
  }
  grab = "";
}

function onPointerUp() { drop(); }

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  if (grab && input && input.pointer) {
    if (input.pointer.down) drag(input.pointer.x, input.pointer.y); else drop();
  }
  // a loose screw wobbles; one that fell gets up again
  if (needHolder && !holder && !lying) {
    const since = K.t - fallT;
    if (since < 0.5) tilt = 0.3 + (1.35 - 0.3) * (since / 0.5);
    else if (since < 1.3) tilt = 1.35;
    else if (since < 1.7) tilt = 1.35 - (1.35 - 0.3) * ((since - 1.3) / 0.4);
    else tilt = 0.3 + Math.sin(K.t * 4) * 0.06;
    place();
  }
  if (phase === "end" && dir < 0) { rise = Math.min(0.6, (K.t - endT) * 1.5); place(); }
}

function onBack() { grab = ""; back(); }

// ---- 2D pictures -------------------------------------------------------------------
// a screw head's mark: a slot, a cross, a six-pointed star or a hexagon
function Head(x: number, y: number, r: number, k: Kind, color: string, squash: number) {
  const sq = (pts: number[][]) => pts.map((q) => [q[0], y + (q[1] - y) * squash]);
  if (k === "ura") return Poly(sq(rect(x - r, y - r * 0.16, r * 2, r * 0.32)), color);
  if (k === "risti") return Poly(sq([[x - r * 0.16, y - r], [x + r * 0.16, y - r], [x + r * 0.16, y - r * 0.16], [x + r, y - r * 0.16], [x + r, y + r * 0.16], [x + r * 0.16, y + r * 0.16], [x + r * 0.16, y + r], [x - r * 0.16, y + r], [x - r * 0.16, y + r * 0.16], [x - r, y + r * 0.16], [x - r, y - r * 0.16], [x - r * 0.16, y - r * 0.16]]), color);
  if (k === "torx") return Poly(sq(star(x, y, r * 0.8, r * 0.45, 6, -Math.PI / 2)), color);
  return Poly(sq(ngon(x, y, r * 0.62, 6, 0)), color);
}

// a screwdriver lying at `ang` (0 = tip up), its tip at (x, y - 46 s)
function picDriver(x: number, y: number, s: number, k: Kind, ang: number) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  const P = (px: number, py: number) => [x + px * c - py * sn, y + px * sn + py * c];
  const out: any[] = [];
  out.push(Poly([P(-11 * s, 4 * s), P(11 * s, 4 * s), P(13 * s, 40 * s), P(-13 * s, 40 * s)], DRIVER_C[k], "#00000044", 1.5));
  out.push(Poly([P(-3 * s, -40 * s), P(3 * s, -40 * s), P(3 * s, 4 * s), P(-3 * s, 4 * s)], "#adb5bd"));
  const tip = P(0, -46 * s);
  out.push(Circle(tip[0], tip[1], 13 * s, "#ffffff", "#495057"));
  out.push(Head(tip[0], tip[1], 10 * s, k, "#343a40", 1));
  return out;
}

function Cards() {
  const n = choices.length, cw = Math.min(82, (width - 30) / n - 8), ch = 128;
  const x0 = width / 2 - (n * (cw + 8) - 8) / 2, y = height - ch - 18;
  const out: any[] = [];
  choices.forEach((k, i) => {
    const sh = shakeCard === i ? Math.sin((K.t - shakeT) * 50) * 10 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
    const x = x0 + i * (cw + 8) + sh;
    const off = wrongCards.indexOf(i) >= 0;
    out.push(<div className={off ? "card off" : "card"} style={{ left: x, top: y, width: cw, height: ch }} />);
    for (const e of picDriver(x + cw / 2, y + ch / 2 + 6, 1.15, k, 0)) out.push(e);
    out.push(<div className="hit" id={"card" + i} onClick={() => pickCard(i)} style={{ left: x, top: y, width: cw, height: ch }} />);
  });
  return out;
}

function Play() {
  const out: any[] = [];
  const text = phase === "pick" ? rg.t("Mikä meisseli sopii?", "Which screwdriver fits?", "¿Qué destornillador encaja?")
    : phase === "place" ? rg.t("Vie ruuvi reikään", "Put the screw in the hole", "Pon el tornillo en el agujero")
    : phase === "hold" ? rg.t("Laita pidike ruuviin", "Put the holder on the screw", "Pon el soporte en el tornillo")
    : dir > 0 ? rg.t("Kierrä ruuvi kiinni", "Screw it in", "Atornilla") : rg.t("Avaa ruuvi", "Unscrew it", "Desatornilla");
  for (const e of Header(text, () => instruct(), () => hintSay())) out.push(e);
  // the screw's head, big, in the corner: what the tip has to fit
  if (phase === "pick" || K.level === 1) {
    const hx = width - 52, hy = 156, glow = K.t - hintT < 5 && Math.floor(K.t * 4) % 2 === 0;
    out.push(Circle(hx, hy, 36, glow ? "#ffd166" : "#e9ecef", "#868e96"));
    out.push(Head(hx, hy, 24, kind, "#343a40", 1));
  }
  if (hasArrow()) {
    const c = screwScreen();
    for (const e of TurnArrow(c[0], c[1] - 10, 92, dir, "rgba(247,127,0,0.85)")) out.push(e);
  }
  if (phase === "hold" && (step() === 0 || K.t - hintT < 5) && grab !== "holder") {
    const h = project([holderPos[0], 0.5, holderPos[2]]), s = project([screwPos[0], 0.9, screwPos[2]]);
    out.push(PointAt(h[0], h[1] - 10, "#f77f00"));
    out.push(Line([[h[0] - 20, h[1] - 50], [s[0] + 30, s[1] - 30]], "rgba(247,127,0,0.5)", 5));
  }
  if (phase === "place" && grab !== "screw") {
    const s = project([screwPos[0], 0.2, screwPos[2]]), hl = project([0, 0, 0]);
    out.push(PointAt(s[0], s[1] - 10, "#f77f00"));
    const r = 22 + Math.sin(K.t * 5) * 4;
    out.push(Poly(ngon(hl[0], hl[1], r, 20, 0).map((q) => [q[0], hl[1] + (q[1] - hl[1]) * 0.55]), "rgba(247,127,0,0.35)"));
  }
  if (phase === "pick") for (const e of Cards()) out.push(e);
  if (phase === "turn" && K.question === 0 && K.misses === 0 && K.t - K.solved > 0 && p === (dir > 0 ? 0 : 1)) {
    out.push(<div className="label" style={{ left: 20, top: height - 70, width: width - 40 }}>{rg.t("Pyöritä sormella ruuvin ympäri", "Turn your finger round the screw", "Gira el dedo alrededor del tornillo")}</div>);
  }
  // how far the screw is: a bar at the bottom
  if (phase === "turn" || phase === "end") {
    const w = width - 80, f = dir > 0 ? p : 1 - p;
    out.push(Box(40, height - 34, w, 14, "rgba(0,0,0,0.12)", 7));
    out.push(Box(40, height - 34, Math.max(14, w * f), 14, "#06d6a0", 7));
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Ruuvit", "Screws", "Tornillos"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className={K.mode === "play" ? "root3d" : "root"}>{body}{Sparks()}</div>;
}
