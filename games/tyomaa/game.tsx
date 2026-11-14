// Työmaa: the building site, for 5-year-olds. Levels:
//   1 Lapio        shovel as many loads of sand into the wheelbarrow as the
//                  dots show (counting); later steps end with ✓, so the child
//                  has to stop at the right number
//   2 Betonimylly  put cement, sand and water in the mixer as the picture
//                  recipe says, run it, and pour the concrete into the mould;
//                  the mixer is 3D (rg.three): the inside tumbles and turns grey,
//                  it rumbles and the phone shakes while it turns
//   3 Kaivuri      move the excavator's arm to dig sand into the truck: first
//                  by tapping, then with a lever, then lever and bucket button
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, turn, rect, ngon, Button } from "lib/kit";

const SAND = "#e9c46a", SAND2 = "#d4a84f";

function picDigger(x: number, y: number, s: number) {
  return Excavator(x - 10 * s, y + 30 * s, s * 0.45, -0.7, 0.3, false);
}
const LEVELS: Level[] = [
  { name: rg.t("Lapio", "Shovel", "La pala"), color: "#f4a100", say: "rk_t_lapio", pic: (x, y, s) => [Poly(Mound(x + 10 * s, y + 34 * s, 50 * s, 34 * s), SAND)].concat(Shovel(x - 20 * s, y + 10 * s, s * 0.8, true)) },
  { name: rg.t("Betonimylly", "Mixer", "Hormigonera"), color: "#6c757d", say: "rk_t_mylly", pic: (x, y, s) => Mixer(x, y + 6 * s, s * 0.55, K.t, 0, 0) },
  { name: rg.t("Kaivuri", "Digger", "Excavadora"), color: "#e76f51", say: "rk_t_kaivuri", pic: (x, y, s) => picDigger(x, y, s) },
];

let phase = "play";
let want = 3, have = 0;
let grab = "";
let hand = { x: 0, y: 0 };
let carrying = "";
let hintT = -10;
let flyT = -10;
// the mixer
type Ing = { id: string; want: number; have: number };
let recipe: Ing[] = [];
let mixT = -10, pourT = -10, drum = 0, bounce = { id: "", t: -10 };
// the digger
let boom = -1.6;          // the arm's angle (radians, screen: 0 right, -π/2 up, -π left)
let goal = -1.6;          // where a tap sends it
let curl = false;         // the bucket closed (holding sand)
let full = false;         // sand in the bucket
let loads = 0;
let auto = "";            // step 0: "dig" or "dump" going on
let autoT = 0;
let spill = -10;

function GY() { return Math.round(height * 0.68); }

// ---- the concrete mixer in 3D ---------------------------------------------------------
// The drum hangs on a pivot between two posts: the hand wheel tilts it, the
// motor turns it round its own axis. What is inside tumbles as small balls
// that turn grey as they mix. Our own drawing (a photo was only a reference).
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
const CAM = [3.9, 4.4, 9.0], LOOK = [-0.2, 1.05, 0.5], FOV = 31;
function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(a: number[]) { const l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function project(p: number[]): number[] {
  const f = unit(sub(LOOK, CAM)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f);
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  const v = sub(p, CAM), z = dot(v, f);
  return [width / 2 + dot(v, r) / z * focal, height / 2 - dot(v, u) / z * focal];
}
function hex(c: string): number[] { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function mix(a: string, b: string, k: number): string {
  const x = hex(a), y = hex(b);
  return "#" + [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * k).toString(16).padStart(2, "0")).join("");
}

const PIVOT = [0, 1.22, 0];
const REST = 0.72, POUR = 2.05;          // the drum's tilt: mixing, pouring
const MOULD = [-0.15, 0, 1.25];
const ORANGE = "#f26b1d", ORANGE2 = "#c9500f", CONCRETE = "#8b8f94";
const ING_C: any = { sementti: ["#c9ccd1", "#9aa0a6"], hiekka: ["#e9c46a", "#c9a227"], vesi: ["#3a86ff", "#4cc9f0"] };
// what is inside: up to MAXG fine grains, drawn in 2D over the drum's mouth as a
// few paths (one per colour), so thousands of them cost only a handful of draws
const MAXG = 760, PER_DROP = 95;
const CONC = ["#8b8f94", "#6f747a", "#a3a7ab"];
type Grain = { rho: number; th: number; sp: number; c: string; k: number; v: number; s: number };
let bits: Grain[] = [];
let massSeen = false;
let massT: M3 = rx(REST);
let massJig = [0, 0, 0];
let tiltNow = REST;
let mixK = 0;                            // 0 = separate, 1 = concrete
type Fly = { x: number; y: number; vx: number; vy: number; c: string; t: number; r: number };
let fly: Fly[] = [];
let rumbleT = 0;

// drum parts: [id, shape, size, local position (pivot at 0), colour, extra turn]
const DRUM: any[] = [
  ["dBot", "cylinder", [0.6, 0.3, 0.32], [0, -0.36, 0], ORANGE],
  ["dMid", "cylinder", [0.6, 0.6, 0.4], [0, 0, 0], ORANGE],
  ["dTop", "cylinder", [0.34, 0.6, 0.56], [0, 0.48, 0], ORANGE],
  ["dLip", "torus", [0.35, 0.035], [0, 0.76, 0], ORANGE2, rx(Math.PI / 2)],
  ["dGear", "torus", [0.62, 0.04], [0, -0.1, 0], "#5c3d2e", rx(Math.PI / 2)],
];
function partSet(id: string, M: M3, local: number[], extra: M3 | null, jig: number[], vis?: boolean) {
  const w = mv(M, local);
  const e = euler(extra ? mm(M, extra) : M);
  const o: any = { id, x: PIVOT[0] + w[0] + jig[0], y: PIVOT[1] + w[1] + jig[1], z: PIVOT[2] + w[2] + jig[2], rx: e[0], ry: e[1], rz: e[2] };
  if (vis !== undefined) o.visible = vis;
  rg.three("set", o);
}

function build3d() {
  rg.three("clear");
  rg.three("scene", { background: ["#a9d6f5", "#e8f4fc"], ground: { y: 0, color: "#6f9a3e" } });
  rg.three("camera", { x: CAM[0], y: CAM[1], z: CAM[2], lookAt: LOOK, fov: FOV });
  rg.three("light", { id: "sun", type: "directional", x: -2, y: 6, z: 4, intensity: 0.55 });
  rg.three("light", { id: "amb", type: "ambient", intensity: 0.45 });
  // gravel under the mixer
  rg.three("add", { id: "gravel", shape: "cylinder", size: [1.5, 1.5, 0.02], detail: 16, color: "#8f877a", x: 0, y: 0.01, z: 0.2, layer: -1 });
  // the stand: a base, two posts with legs, the axle, wheels
  rg.three("add", { id: "base", shape: "box", size: [1.9, 0.08, 0.1], color: ORANGE, x: 0, y: 0.2, z: 0.45 });
  rg.three("add", { id: "base2", shape: "box", size: [1.9, 0.08, 0.1], color: ORANGE, x: 0, y: 0.2, z: -0.45 });
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? "L" : "R";
    rg.three("add", { id: "post" + n, shape: "box", size: [0.09, 1.1, 0.09], color: ORANGE, x: sx * 0.86, y: 0.72, z: 0 });
    rg.three("add", { id: "legF" + n, shape: "box", size: [0.08, 0.62, 0.08], color: ORANGE, x: sx * 0.86, y: 0.32, z: 0.24, rx: 0.9 });
    rg.three("add", { id: "legB" + n, shape: "box", size: [0.08, 0.62, 0.08], color: ORANGE, x: sx * 0.86, y: 0.32, z: -0.24, rx: -0.9 });
    rg.three("add", { id: "foot" + n, shape: "box", size: [0.12, 0.05, 1.0], color: ORANGE2, x: sx * 0.86, y: 0.03, z: 0 });
  }
  rg.three("add", { id: "wheelR", shape: "cylinder", size: [0.2, 0.2, 0.1], detail: 12, color: "#212529", x: 1.02, y: 0.2, z: 0.45, rz: Math.PI / 2 });
  rg.three("add", { id: "wheelR2", shape: "cylinder", size: [0.2, 0.2, 0.1], detail: 12, color: "#212529", x: 1.02, y: 0.2, z: -0.45, rz: Math.PI / 2 });
  rg.three("add", { id: "axle", shape: "cylinder", size: [0.05, 0.05, 1.85], detail: 8, color: "#6c757d", x: 0, y: PIVOT[1], z: 0, rz: Math.PI / 2 });
  // the motor box on the right post
  rg.three("add", { id: "motor", shape: "box", size: [0.26, 0.5, 0.42], color: "#343a40", x: 1.05, y: PIVOT[1] - 0.05, z: 0 });
  rg.three("add", { id: "motorCap", shape: "cylinder", size: [0.2, 0.2, 0.08], detail: 12, color: "#495057", x: 1.2, y: PIVOT[1] - 0.05, z: 0, rz: Math.PI / 2 });
  rg.three("add", { id: "label", shape: "box", size: [0.16, 0.12, 0.01], color: "#ffd166", x: 1.05, y: PIVOT[1] + 0.08, z: 0.215 });
  rg.three("add", { id: "switch", shape: "box", size: [0.07, 0.07, 0.03], color: "#e63946", x: 1.05, y: PIVOT[1] - 0.15, z: 0.22 });
  // the hand wheel on the left: a ring and spokes, it turns as the drum tilts
  rg.three("add", { id: "hw", shape: "torus", size: [0.36, 0.028], detail: 20, color: ORANGE });
  for (let i = 0; i < 3; i++) rg.three("add", { id: "hs" + i, shape: "box", size: [0.03, 0.72, 0.03], color: ORANGE });
  rg.three("add", { id: "hhub", shape: "cylinder", size: [0.06, 0.06, 0.08], detail: 8, color: ORANGE2 });
  // the yoke that holds the drum, turning with the tilt
  rg.three("add", { id: "yL", shape: "box", size: [0.07, 0.62, 0.07], color: ORANGE });
  rg.three("add", { id: "yR", shape: "box", size: [0.07, 0.62, 0.07], color: ORANGE });
  rg.three("add", { id: "yB", shape: "box", size: [1.5, 0.07, 0.07], color: ORANGE });
  // the drum, its ribs, the dark inside and what is in it
  for (const d of DRUM) rg.three("add", { id: d[0], shape: d[1], size: d[2], detail: d[1] === "torus" ? 22 : 16, color: d[4] });
  for (let i = 0; i < 4; i++) rg.three("add", { id: "rib" + i, shape: "box", size: [0.04, 0.36, 0.05], color: ORANGE2 });
  rg.three("add", { id: "inside", shape: "cylinder", size: [0.32, 0.32, 0.01], detail: 16, color: "#2b2d31", layer: 1 });
  // the mould in front: four planks and the concrete that fills it
  const [mx, , mz] = MOULD;
  rg.three("add", { id: "mF", shape: "box", size: [0.9, 0.16, 0.05], color: "#a0522d", x: mx, y: 0.08, z: mz + 0.3 });
  rg.three("add", { id: "mB", shape: "box", size: [0.9, 0.16, 0.05], color: "#a0522d", x: mx, y: 0.08, z: mz - 0.3 });
  rg.three("add", { id: "mL", shape: "box", size: [0.05, 0.16, 0.6], color: "#8b4513", x: mx - 0.45, y: 0.08, z: mz });
  rg.three("add", { id: "mR", shape: "box", size: [0.05, 0.16, 0.6], color: "#8b4513", x: mx + 0.45, y: 0.08, z: mz });
  rg.three("add", { id: "mFill", shape: "box", size: [0.85, 0.14, 0.55], color: CONCRETE, x: mx, y: 0.075, z: mz, layer: -1, visible: false });
  place3d();
}

function drumM(): M3 { return mm(rx(tiltNow), ry(drum)); }
function mouthWorld(): number[] { const w = mv(rx(tiltNow), [0, 0.78, 0]); return [PIVOT[0] + w[0], PIVOT[1] + w[1], PIVOT[2] + w[2]]; }
function mouthScreen(): number[] { return project(mouthWorld()); }

function place3d() {
  const T = rx(tiltNow), D = drumM();
  const shaking = phase === "mixing";
  const jig = shaking ? [Math.sin(K.t * 53) * 0.008, Math.sin(K.t * 71) * 0.008, 0] : [0, 0, 0];
  for (const d of DRUM) partSet(d[0], D, d[3], d[5] || null, jig);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    partSet("rib" + i, mm(D, ry(a)), mv(ry(a), [0, 0, 0.61]), null, jig);
  }
  partSet("yL", T, [-0.72, -0.31, 0], null, jig);
  partSet("yR", T, [0.72, -0.31, 0], null, jig);
  partSet("yB", T, [0, -0.6, 0], null, jig);
  // the hand wheel turns three times as much as the drum tilts
  const W = mm(rx(tiltNow * 3), ry(Math.PI / 2));
  const hwp = [-1.02, PIVOT[1], 0];
  rg.three("set", { id: "hw", x: hwp[0], y: hwp[1], z: hwp[2], rx: euler(W)[0], ry: euler(W)[1], rz: euler(W)[2] });
  for (let i = 0; i < 3; i++) { const e = euler(rx(tiltNow * 3 + i * Math.PI / 3)); rg.three("set", { id: "hs" + i, x: hwp[0], y: hwp[1], z: hwp[2], rx: e[0], ry: e[1], rz: e[2] }); }
  const eh = euler(rz(Math.PI / 2));
  rg.three("set", { id: "hhub", x: hwp[0] + 0.02, y: hwp[1], z: hwp[2], rx: eh[0], ry: eh[1], rz: eh[2] });
  // the inside and what is in it show while the mouth faces the camera
  const mw = mouthWorld();
  const up = mv(T, [0, 1, 0]);
  const seen = dot(up, unit(sub(CAM, mw))) > 0.12;
  partSet("inside", T, [0, 0.765, 0], null, jig, seen);
  rg.three("set", { id: "inside", color: "#2b2d31" });
  massSeen = seen; massT = T; massJig = jig;
  // the mould fills while it is poured
  const pf = phase === "pouring" ? Math.min(1, (K.t - pourT) / 1.6) : phase === "end" ? 1 : 0;
  rg.three("set", { id: "mFill", visible: pf > 0.02, sy: Math.max(0.05, pf), y: 0.01 + 0.07 * pf });
}

function addBits(id: string) {
  const c = ING_C[id];
  for (let i = 0; i < PER_DROP && bits.length < MAXG; i++) {
    bits.push({ rho: Math.sqrt(Math.random()), th: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 0.8, c: c[i % 2], k: Math.random() * 0.6, v: i % 3, s: 1.3 + Math.random() * 1.5 });
  }
}

// a grain's colour: its own, turning grey as the mixing goes on (some sooner than others),
// rounded to a few steps so that the grains share few paths
function grainColor(g: Grain): string {
  const q = Math.max(0, Math.min(1, Math.round((mixK * 1.6 - g.k) * 4) / 4));
  return q <= 0 ? g.c : q >= 1 ? CONC[g.v] : mix(g.c, CONC[g.v], q);
}
function vbox() { return "0 0 " + width + " " + height; }
function fullS() { return { position: "absolute", left: 0, top: 0, width, height }; }
// squares of whole-pixel side s at (x, y), many to one path per colour: whole numbers
// and short relative steps keep the path text small, which is what costs
const TAILS = ["h1v1h-1z", "h2v2h-2z", "h3v3h-3z", "h4v4h-4z"];
function Grains(list: { x: number; y: number; s: number; c: string }[]) {
  const by: any = {};
  for (const g of list) {
    const p = "M" + Math.round(g.x) + " " + Math.round(g.y) + TAILS[Math.max(0, Math.min(3, Math.round(g.s) - 1))];
    const a = by[g.c];
    if (a) a.push(p); else by[g.c] = [p];
  }
  const out: any[] = [];
  for (const c in by) out.push(<path d={by[c].join("")} fill={c} viewBox={vbox()} style={fullS()} />);
  return out;
}

// the mass in the drum seen through its mouth: the grains go round a loop in the low
// side of the opening; turning tilts the surface and keeps them flowing round
// it is built again only when something changed, and at most 30 times a second while
// turning, because building the paths is the costly part on an old phone
let massSig = "", massOut: any[] = [];
function Mass() {
  const turning = phase === "mixing" || phase === "pouring";
  const sig = bits.length + "|" + massSeen + "|" + phase + "|" + Math.round(mixK * 8) + "|" + Math.round(tiltNow * 100) + "|" + (turning ? Math.floor(K.t * 30) : 0);
  if (sig !== massSig) { massSig = sig; massOut = buildMass(); }
  return massOut;
}
function buildMass() {
  if (!massSeen || bits.length === 0) return [];
  const pf = phase === "pouring" ? Math.min(1, (K.t - pourT) / 1.6) : 0;
  const n = Math.round(bits.length * (1 - pf));
  if (n <= 0) return [];
  const R = 0.29;
  const f = bits.length / MAXG;
  const D = 2 * R * (0.55 + 0.3 * f) * (1 - pf * 0.7);
  const cw = R - D / 2;
  const Ru = Math.sqrt(Math.max(0.01, R * R - cw * cw)) * 0.92 + 0.02;
  const turning = phase === "mixing" || phase === "pouring";
  const slope = turning ? 0.38 : 0;
  const cs = Math.cos(slope), sn = Math.sin(slope);
  // the mouth plane on the screen: its middle and the screen steps of local x and z
  const at = (u: number, w: number) => { const p = mv(massT, [u, 0.775, w]); return project([PIVOT[0] + p[0] + massJig[0], PIVOT[1] + p[1] + massJig[1], PIVOT[2] + p[2] + massJig[2]]); };
  const C = at(0, 0), Pu = at(0.1, 0), Pw = at(0, 0.1);
  const ux = (Pu[0] - C[0]) * 10, uy = (Pu[1] - C[1]) * 10, wx = (Pw[0] - C[0]) * 10, wy = (Pw[1] - C[1]) * 10;
  const local = (rho: number, th: number) => {
    let u = rho * Ru * Math.cos(th), w = rho * (D / 2) * Math.sin(th);
    const u2 = u * cs - w * sn, w2 = u * sn + w * cs;
    u = u2; w = w2 + cw;
    const l = Math.sqrt(u * u + w * w);
    if (l > R) { u *= R / l; w *= R / l; }
    return [C[0] + u * ux + w * wx, C[1] + u * uy + w * wy];
  };
  // a dark wet bed under the grains, so that no holes show
  const bed: number[][] = [];
  for (let i = 0; i < 20; i++) bed.push(local(1.04, i / 20 * Math.PI * 2));
  const out: any[] = [Poly(bed, mix("#8c7a55", "#767a80", mixK))];
  const list: { x: number; y: number; s: number; c: string }[] = [];
  const spin = turning ? drum : 0;
  for (let i = 0; i < n; i++) {
    const g = bits[i];
    const p = local(g.rho, g.th + spin * g.sp);
    list.push({ x: p[0], y: p[1], s: g.s, c: grainColor(g) });
  }
  for (const e of Grains(list)) out.push(e);
  return out;
}
function spray(x: number, y: number, tx: number, ty: number, c: string[], n: number, spread: number) {
  for (let i = 0; i < n; i++) {
    const T = 0.35 + Math.random() * 0.2;
    fly.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, vx: (tx - x) / T + (Math.random() - 0.5) * 40, vy: (ty - y) / T - 300 * T / 2, c: c[i % c.length], t: T, r: 1 + Math.random() * 1.3 });
  }
}
function tickFly(dt: number) {
  for (const f of fly) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; f.t -= dt; }
  fly = fly.filter((f) => f.t > 0);
}
// the mixer rumbles: low knocks of the gravel, a hum, and the phone shakes
function rumble(dt: number) {
  rumbleT -= dt;
  if (rumbleT > 0) return;
  rumbleT = 0.13 + Math.random() * 0.12;
  rg.sound("hit", { pitch: 0.3 + Math.random() * 0.25, volume: 0.22 + Math.random() * 0.15 });
  if (Math.random() < 0.35) rg.sound("whoosh", { pitch: 0.18, volume: 0.25 });
  rg.vibrate(35);
}

function instruct() {
  if (K.level === 0) rg.say(["rk_t_lapio_n", rg.sayId.number(want), want === 1 ? "rk_t_lapiollinen" : "rk_t_lapiollista"]);
  else if (K.level === 1) rg.say(phase === "fill" ? "rk_t_mylly" : phase === "mix" ? "rk_t_kaynnista" : "rk_t_kaada");
  else rg.say(step() === 0 ? "rk_t_kaivuri" : step() === 1 ? "rk_t_vipu" : "rk_t_kauha");
}

function next() {
  const s = step();
  hintT = -10;
  grab = "";
  carrying = "";
  have = 0;
  if (K.level === 0) {
    rg.three("clear");
    const r = [[1, 3], [2, 5], [3, 7]][s];
    want = rg.range(r[0], r[1]);
    phase = "play";
  } else if (K.level === 1) {
    recipe = [
      { id: "sementti", want: s === 2 ? rg.range(1, 2) : 1, have: 0 },
      { id: "hiekka", want: [2, rg.range(2, 3), rg.range(3, 4)][s], have: 0 },
      { id: "vesi", want: s === 0 ? 1 : rg.range(1, 2), have: 0 },
    ];
    phase = "fill";
    mixT = -10; pourT = -10;
    bits = []; fly = []; mixK = 0; tiltNow = REST; drum = 0;
    build3d();
  } else {
    rg.three("clear");
    want = 3;
    loads = 0;
    boom = -1.6; goal = -1.6;
    curl = false; full = false;
    auto = "";
    phase = "play";
  }
  instruct();
}

// ---- 1: shovel --------------------------------------------------------------------
function pilePos() { return { x: width - 90, y: GY() }; }
function barrowPos() { return { x: 100, y: GY() - 10 }; }

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0 || y < 120) return;
  if (K.level === 0) {
    const p = pilePos();
    if (Math.abs(x - p.x) < 90 && y > p.y - 90 && y < p.y + 20) { grab = "shovel"; carrying = "hiekka"; hand = { x, y }; rg.sound("whoosh", { volume: 0.3 }); }
    return;
  }
  if (K.level === 1 && phase === "fill") {
    recipe.forEach((r, i) => {
      const s = srcPos(i);
      if (Math.abs(x - s.x) < 44 && Math.abs(y - s.y) < 44) { grab = "ing"; carrying = r.id; hand = { x, y }; rg.sound("click"); }
    });
    return;
  }
  if (K.level === 2) {
    if (step() === 0) { tapDigger(x, y); return; }
    if (y > height - 110 && y < height - 40) { grab = "lever"; lever(x); }
  }
}

function dropShovel() {
  const b = barrowPos();
  if (Math.abs(hand.x - b.x) < 90 && Math.abs(hand.y - b.y) < 80) {
    have++;
    flyT = K.t;
    rg.sound("pop");
    rg.say(rg.sayId.number(have));
    if (have === want && step() === 0) win(b.x, b.y - 30, ["rk_t_valmis"]);
    else if (have > want && step() === 0) have = want;
  } else rg.sound("click");
}

function ready() {
  if (K.level !== 0 || K.solved >= 0) return;
  if (have === want) { win(barrowPos().x, barrowPos().y - 30, ["rk_t_valmis"]); return; }
  const n = miss();
  hintT = K.t;
  const why = have < want ? "rk_t_viela" : "rk_t_liikaa";
  if (have > want) have = want;
  rg.say(n >= 2 ? [why, "rk_t_vihje_lapio", rg.sayId.number(want)] : why);
}

// ---- 2: mixer ------------------------------------------------------------------------
function mixerPos() { const m = mouthScreen(); return { x: m[0], y: m[1] }; }
function srcPos(i: number) { return { x: 50 + i * 0 , y: 170 + i * 92 }; }

function dropIng() {
  const m = mixerPos();
  if (Math.hypot(hand.x - m.x, hand.y - m.y) > 100) { rg.sound("click"); return; }
  const r = recipe.filter((q) => q.id === carrying)[0];
  if (r.have >= r.want) {
    bounce = { id: r.id, t: K.t };
    const n = miss();
    hintT = K.t;
    rg.say(n >= 2 ? ["rk_t_riittaa", "rk_t_vihje_mylly"] : "rk_t_riittaa");
    return;
  }
  r.have++;
  rg.sound(r.id === "vesi" ? "pop" : "hit", { volume: 0.6 });
  spray(hand.x, hand.y, m.x, m.y + 6, ING_C[r.id], 90, 30);
  addBits(r.id);
  rg.say(rg.sayId.number(r.have));
  if (recipe.every((q) => q.have >= q.want)) { phase = "mix"; rg.say("rk_t_kaynnista"); }
}

function startMix() {
  if (phase !== "mix") return;
  phase = "mixing";
  mixT = K.t;
  rumbleT = 0;
  rg.sound("whoosh", { pitch: 0.4 });
}

function pour() {
  if (phase !== "pour") return;
  phase = "pouring";
  pourT = K.t;
  rg.sound("whoosh");
}

// ---- 3: digger ------------------------------------------------------------------------
const BOOM_L = 120, STICK_L = 70;
function base() { return { x: width / 2, y: GY() - 70 }; }
function tip(a: number) {
  const b = base();
  const ex = b.x + Math.cos(a) * BOOM_L, ey = b.y + Math.sin(a) * BOOM_L;
  const sa = a + (a > -Math.PI / 2 ? 1.25 : -1.25);
  return { x: ex + Math.cos(sa) * STICK_L, y: ey + Math.sin(sa) * STICK_L, ex, ey };
}
const PILE_A = -0.35, TRUCK_A = -2.75;
function atPile() { return Math.abs(boom - PILE_A) < 0.25; }
function atTruck() { return Math.abs(boom - TRUCK_A) < 0.3; }

function tapDigger(x: number, y: number) {
  if (auto) return;
  if (x > width / 2 && !full) { auto = "dig"; autoT = K.t; goal = PILE_A; rg.sound("click"); }
  else if (x < width / 2 && full) { auto = "dump"; autoT = K.t; goal = TRUCK_A; rg.sound("click"); }
  else if (x < width / 2 && !full) { const n = miss(); hintT = K.t; rg.say(n >= 2 ? ["rk_t_tyhja", "rk_t_vihje_kaivuri"] : "rk_t_tyhja"); }
  else { hintT = K.t; rg.say("rk_t_vie_autoon"); }
}

function lever(x: number) {
  const k = Math.max(0, Math.min(1, (x - 40) / (width - 80)));
  goal = TRUCK_A + (PILE_A - TRUCK_A) * k;
}

function bucket() {
  if (K.level !== 2 || step() < 2 || K.solved >= 0) return;
  if (!curl) {
    curl = true;
    if (atPile()) { full = true; rg.sound("hit"); rg.say("rk_t_kauha_taynna"); }
    else rg.sound("click");
    return;
  }
  curl = false;
  if (full && atTruck()) { dumped(); return; }
  if (full) {
    full = false;
    spill = K.t;
    const n = miss();
    hintT = K.t;
    rg.say(n >= 2 ? ["rk_t_valui", "rk_t_vihje_kaivuri"] : "rk_t_valui");
  } else rg.sound("click");
}

function dumped() {
  full = false;
  loads++;
  flyT = K.t;
  rg.sound("pop");
  rg.say(rg.sayId.number(loads));
  if (loads >= want) win(70, GY() - 60, ["rk_t_auto_taynna"]);
}

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  const p = input && input.pointer;
  if (grab && p) {
    if (p.down) { hand = { x: p.x, y: p.y }; if (grab === "lever") lever(p.x); }
    else { if (grab === "shovel") dropShovel(); if (grab === "ing") dropIng(); grab = ""; carrying = ""; }
  }
  if (K.level === 1) {
    if (phase === "mixing") {
      drum += dt * 5;
      mixK = Math.min(1, Math.max(0, (K.t - mixT - 0.6) / 2.4));
      rumble(dt);
      if (K.t - mixT > 3.4) { phase = "pour"; mixK = 1; rg.say("rk_t_kaada"); }
    }
    if (phase === "pouring") {
      drum += dt * 3;
      tiltNow = Math.min(POUR, REST + (K.t - pourT) * 2.2);
      // the concrete runs from the mouth into the mould once the drum leans over
      if (tiltNow > 1.7) {
        const m = mouthScreen(), t = project([MOULD[0] + (Math.random() - 0.5) * 0.5, 0.1, MOULD[2] + (Math.random() - 0.5) * 0.3]);
        spray(m[0], m[1] + 8, t[0], t[1], CONC, 18, 18);
      }
      if (K.t - pourT > 2.2) { phase = "end"; bits = []; win(width / 2 - 60, GY() + 20, ["rk_t_betoni_valmis"]); }
    }
    tickFly(dt);
    place3d();
  }
  if (K.level === 2) {
    const sp = 2.2 * dt;
    boom += Math.max(-sp, Math.min(sp, goal - boom));
    if (step() === 0 && auto) {
      if (auto === "dig" && Math.abs(boom - goal) < 0.02) { if (!curl) { curl = true; full = true; rg.sound("hit"); autoT = K.t; } else if (K.t - autoT > 0.4) { goal = -1.6; auto = ""; } }
      if (auto === "dump" && Math.abs(boom - goal) < 0.02) { curl = false; dumped(); auto = ""; goal = -1.6; }
    }
    if (step() === 1) {
      if (!full && atPile()) { curl = true; full = true; rg.sound("hit"); }
      if (full && atTruck()) { curl = false; dumped(); }
      if (!full && !atPile()) curl = false;
    }
  }
}

function onPointerUp() {
  if (grab === "shovel") dropShovel();
  if (grab === "ing") dropIng();
  grab = "";
  carrying = "";
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) rg.say(["rk_t_vihje_lapio", rg.sayId.number(want)]);
  else if (K.level === 1) rg.say(phase === "fill" ? "rk_t_vihje_mylly" : phase === "mix" ? "rk_t_kaynnista" : "rk_t_kaada");
  else rg.say("rk_t_vihje_kaivuri");
}

function onBack() { grab = ""; back(); }

// ---- drawing ------------------------------------------------------------------------
function Mound(cx: number, by: number, w: number, h: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([cx - w + 2 * w * t, by - Math.sin(t * Math.PI) * h]); }
  return pts;
}

function Shovel(x: number, y: number, s: number, sand: boolean) {
  // the blade at (x, y), the handle up to the right
  const out: any[] = [Line([[x + 6 * s, y - 8 * s], [x + 60 * s, y - 70 * s]], "#8d5524", 6 * s)];
  out.push(Poly([[x - 18 * s, y - 6 * s], [x + 14 * s, y - 14 * s], [x + 18 * s, y + 12 * s], [x - 2 * s, y + 24 * s], [x - 18 * s, y + 14 * s]], "#6c757d", "#343a40", 1.5));
  if (sand) out.push(Poly(Mound(x, y - 6 * s, 18 * s, 12 * s), SAND));
  out.push(Line([[x + 54 * s, y - 76 * s], [x + 68 * s, y - 64 * s]], "#343a40", 6 * s));
  return out;
}

function Barrow(x: number, y: number, n: number) {
  const out: any[] = [];
  const f = Math.min(1, n / 8);
  out.push(Circle(x + 40, y + 34, 16, "#343a40"));
  out.push(Line([[x - 50, y + 8], [x - 90, y - 4]], "#8d5524", 7));
  out.push(Line([[x - 40, y + 20], [x - 46, y + 44]], "#495057", 5));
  if (n > 0) out.push(Poly(Mound(x, y - 30, 56 * (0.5 + f / 2), 8 + 24 * f), SAND));
  out.push(Poly([[x - 60, y - 34], [x + 62, y - 34], [x + 44, y + 20], [x - 44, y + 20]], "#2a9d8f", "#1b6b62", 2));
  return out;
}

function Ingredient(id: string, x: number, y: number, s: number) {
  if (id === "sementti") return [Poly([[x - 26 * s, y - 30 * s], [x + 26 * s, y - 30 * s], [x + 30 * s, y + 30 * s], [x - 30 * s, y + 30 * s]], "#adb5bd", "#495057", 2), <div className="label" style={{ left: x - 30 * s, top: y - 10 * s, width: 60 * s, fontSize: 13 * s }}>CEM</div>];
  if (id === "hiekka") return [Poly(Mound(x, y + 26 * s, 34 * s, 40 * s), SAND, SAND2, 2)];
  return [Poly([[x - 24 * s, y - 24 * s], [x + 24 * s, y - 24 * s], [x + 18 * s, y + 28 * s], [x - 18 * s, y + 28 * s]], "#118ab2", "#073b4c", 2), Poly(rect(x - 22 * s, y - 24 * s, 44 * s, 10 * s), "#8ecae6")];
}

// the menu picture of the mixer: a tilted orange drum on a stand with the hand wheel
function Mixer(x: number, y: number, s: number, rot: number, tilt: number, fill: number) {
  const out: any[] = [];
  const O = "#f26b1d", O2 = "#c9500f";
  // stand: legs and a post
  out.push(Line([[x - 50 * s, y + 70 * s], [x - 34 * s, y + 4 * s], [x - 18 * s, y + 70 * s]], O, 6 * s));
  out.push(Line([[x + 30 * s, y + 70 * s], [x + 46 * s, y + 4 * s], [x + 62 * s, y + 70 * s]], O, 6 * s));
  out.push(Line([[x - 50 * s, y + 52 * s], [x + 62 * s, y + 52 * s]], O2, 5 * s));
  out.push(Circle(x + 62 * s, y + 70 * s, 9 * s, "#212529"));
  // drum: a rounded body leaning to the left, its open mouth up
  const body = turn([[x - 30 * s, y - 34 * s], [x + 30 * s, y - 34 * s], [x + 44 * s, y - 6 * s], [x + 40 * s, y + 26 * s], [x + 14 * s, y + 42 * s], [x - 14 * s, y + 42 * s], [x - 40 * s, y + 26 * s], [x - 44 * s, y - 6 * s]], x, y, -0.35 - tilt);
  out.push(Poly(body, O, O2, 2));
  for (let i = 0; i < 3; i++) {
    const k = ((rot * 0.3 + i / 3) % 1) * 2 - 1;
    out.push(Line(turn([[x + k * 34 * s, y - 20 * s], [x + k * 30 * s, y + 30 * s]], x, y, -0.35 - tilt), O2, 3 * s));
  }
  const m = turn([[x, y - 40 * s]], x, y, -0.35 - tilt)[0];
  out.push(Poly(turn(ngon(m[0], m[1], 1, 16, 0).map((p) => [m[0] + (p[0] - m[0]) * 26 * s, m[1] + (p[1] - m[1]) * 10 * s]), m[0], m[1], -0.35 - tilt), "#2b2d31", O2, 3 * s));
  // hand wheel and motor
  out.push(Poly(ngon(x - 46 * s, y + 4 * s, 17 * s, 14, 0), O)); out.push(Poly(ngon(x - 46 * s, y + 4 * s, 12 * s, 14, 0), "#6c757d"));
  out.push(Line([[x - 62 * s, y + 4 * s], [x - 30 * s, y + 4 * s]], O, 3 * s));
  out.push(Line([[x - 46 * s, y - 12 * s], [x - 46 * s, y + 20 * s]], O, 3 * s));
  out.push(Poly(rect(x + 40 * s, y - 14 * s, 18 * s, 28 * s), "#343a40"));
  out.push(Poly(rect(x + 44 * s, y - 8 * s, 10 * s, 7 * s), "#ffd166"));
  return out;
}

function Excavator(x: number, gy: number, s: number, a: number, cl: number, sand: boolean) {
  // x, gy: the tracks' middle on the ground; a: the arm's angle; cl: bucket closed 0..1
  const out: any[] = [];
  const bx = x, by = gy - 70 * s;
  out.push(Box(x - 70 * s, gy - 26 * s, 140 * s, 26 * s, "#343a40", 13 * s));
  for (let i = 0; i < 5; i++) out.push(Circle(x - 52 * s + i * 26 * s, gy - 13 * s, 7 * s, "#6c757d"));
  out.push(Poly(rect(x - 56 * s, gy - 66 * s, 112 * s, 40 * s), "#ffb703", "#b5540a", 2));
  out.push(Poly(rect(x - 50 * s, gy - 110 * s, 52 * s, 46 * s), "#ffb703", "#b5540a", 2));
  out.push(Poly(rect(x - 44 * s, gy - 104 * s, 40 * s, 26 * s), "#8ecae6"));
  // the arm
  const ex = bx + Math.cos(a) * BOOM_L * s, ey = by + Math.sin(a) * BOOM_L * s;
  const sa = a + (a > -Math.PI / 2 ? 1.25 : -1.25);
  const tx = ex + Math.cos(sa) * STICK_L * s, ty = ey + Math.sin(sa) * STICK_L * s;
  out.push(Line([[bx, by], [ex, ey]], "#f4a100", 14 * s));
  out.push(Line([[ex, ey], [tx, ty]], "#e09f00", 10 * s));
  out.push(Circle(ex, ey, 6 * s, "#343a40"));
  // the bucket: a scoop that turns open or closed
  const side = a > -Math.PI / 2 ? 1 : -1;
  const ba = sa + side * (0.4 + cl * 1.6);
  const bucket = turn([[tx, ty], [tx + 30 * s, ty - 4 * s], [tx + 34 * s, ty + 22 * s], [tx + 6 * s, ty + 30 * s]], tx, ty, ba - Math.PI / 2 * side);
  out.push(Poly(bucket, "#495057", "#212529", 1.5));
  if (sand) out.push(Circle((bucket[1][0] + bucket[3][0]) / 2, (bucket[1][1] + bucket[3][1]) / 2, 12 * s, SAND));
  return out;
}

function Truck(x: number, gy: number, n: number) {
  const out: any[] = [];
  out.push(Circle(x - 40, gy - 14, 14, "#343a40"));
  out.push(Circle(x + 40, gy - 14, 14, "#343a40"));
  if (n > 0) out.push(Poly(Mound(x - 10, gy - 70, 46, 6 + n * 9), SAND));
  out.push(Poly(rect(x - 70, gy - 70, 110, 44), "#e63946", "#9d0208", 2));
  out.push(Poly(rect(x + 40, gy - 76, 34, 50), "#e63946", "#9d0208", 2));
  out.push(Poly(rect(x + 46, gy - 70, 22, 18), "#8ecae6"));
  return out;
}

function Play() {
  const out: any[] = [];
  const gy = GY();
  const text = K.level === 0 ? rg.t("Lapioi ", "Shovel ", "Echa ") + want + rg.t(" lapiollista", " loads", " paladas")
    : K.level === 1 ? (phase === "fill" ? rg.t("Tee betonia", "Make concrete", "Haz hormigón") : phase === "mix" || phase === "mixing" ? rg.t("Käynnistä mylly ▶", "Start the mixer ▶", "Arranca ▶") : rg.t("Kaada muottiin", "Pour into the mould", "Vierte en el molde"))
    : rg.t("Täytä auto hiekalla", "Fill the truck with sand", "Llena el camión de arena");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  if (K.level !== 1) {
    out.push(Box(0, gy, width, height - gy, "#a7c957"));
    out.push(Box(0, gy, width, 10, "#6a994e"));
  }
  const hinting = K.t - hintT < 5;
  if (K.level === 0) {
    const p = pilePos(), b = barrowPos();
    out.push(Poly(Mound(p.x, p.y, 90, 80), SAND, SAND2, 2));
    for (const e of Barrow(b.x, b.y, have)) out.push(e);
    // the dots: how many loads
    for (let i = 0; i < want; i++) out.push(Circle(width / 2 - (want - 1) * 17 + i * 34, 150, 13, i < have ? "#06d6a0" : "#ffffff", "#2a9d8f"));
    if (grab === "shovel") for (const e of Shovel(hand.x, hand.y, 1, true)) out.push(e);
    else for (const e of Shovel(p.x - 20, p.y - 60, 1, false)) out.push(e);
    if (!grab && have === 0 && (K.question === 0 || hinting)) out.push(PointAt(p.x - 10, p.y - 90, "#f77f00"));
    if (grab) out.push(PointAt(b.x, b.y - 70, "#06d6a0"));
    if (step() > 0) out.push(Button("ready", "✓", width / 2 - 60, height - 90, 120, "#06d6a0", () => ready()));
    out.push(<div className="big" style={{ left: b.x - 40, top: gy + 40, width: 80 }}>{String(have)}</div>);
  }
  if (K.level === 1) {
    for (const e of Mass()) out.push(e);
    for (const e of Grains(fly.map((f) => ({ x: f.x, y: f.y, s: f.r * 2, c: f.c })))) out.push(e);
    // the recipe: each ingredient, its dots, and the place to drag it from
    recipe.forEach((r, i) => {
      const s = srcPos(i);
      const bx = bounce.id === r.id ? Math.sin((K.t - bounce.t) * 40) * 8 * Math.max(0, 1 - (K.t - bounce.t) / 0.5) : 0;
      out.push(<div className="card" style={{ left: 8, top: s.y - 44, width: 96, height: 86 }} />);
      if (!(grab === "ing" && carrying === r.id)) for (const e of Ingredient(r.id, s.x + bx, s.y - 6, 0.8)) out.push(e);
      for (let k = 0; k < r.want; k++) out.push(Circle(26 + k * 18, s.y + 30, 7, k < r.have ? "#06d6a0" : "#dee2e6", "#2a9d8f"));
      if (hinting && r.have < r.want && phase === "fill") out.push(PointAt(s.x + 40, s.y - 20, "#f77f00"));
    });
    if (grab === "ing") for (const e of Ingredient(carrying, hand.x, hand.y, 0.8)) out.push(e);
    if (phase === "mix") { out.push(Button("go", "▶", width / 2 - 60, height - 90, 120, "#06d6a0", () => startMix())); out.push(PointAt(width / 2, height - 96, "#06d6a0")); }
    if (phase === "pour") { out.push(Button("pour", rg.t("Kaada", "Pour", "Vierte"), width / 2 - 70, height - 90, 140, "#f77f00", () => pour())); out.push(PointAt(width / 2, height - 96, "#f77f00")); }
    if (K.question === 0 && phase === "fill" && recipe.every((q) => q.have === 0)) out.push(<div className="label" style={{ left: 110, top: height - 70, width: width - 130 }}>{rg.t("Vedä myllyyn", "Drag into the mixer", "Arrastra a la hormigonera")}</div>);
  }
  if (K.level === 2) {
    out.push(Poly(Mound(width - 50, gy, 70, 70), SAND, SAND2, 2));
    for (const e of Truck(62, gy + 6, loads)) out.push(e);
    const cl = curl ? 1 : 0;
    for (const e of Excavator(width / 2 + 24, gy + 6, 0.85, boom, cl, full)) out.push(e);
    if (K.t - spill < 1) { const t = tip(boom); out.push(Poly(Mound(t.x, gy, 20, 10), SAND)); }
    for (let i = 0; i < want; i++) out.push(Circle(width / 2 - (want - 1) * 17 + i * 34, 150, 13, i < loads ? "#06d6a0" : "#ffffff", "#e76f51"));
    if (step() === 0) {
      if (!auto && (K.question === 0 || hinting)) out.push(full ? PointAt(70, gy - 90, "#06d6a0") : PointAt(width - 50, gy - 80, "#f77f00"));
    } else {
      // the lever: left = the truck, right = the sand
      const k = (boom - TRUCK_A) / (PILE_A - TRUCK_A);
      out.push(Box(40, height - 86, width - 80, 22, "rgba(0,0,0,0.18)", 11));
      out.push(<div className="label" style={{ left: 10, top: height - 116, width: 60 }}>🚚</div>);
      out.push(<div className="label" style={{ left: width - 70, top: height - 116, width: 60 }}>⛰️</div>);
      out.push(Circle(40 + (width - 80) * Math.max(0, Math.min(1, k)), height - 75, 26, "#e76f51", "#ffffff"));
      if (step() === 2) out.push(Button("bucket", curl ? rg.t("Kauha auki", "Open", "Abrir") : rg.t("Kauha kiinni", "Scoop", "Cerrar"), width / 2 - 90, 186, 180, curl ? "#118ab2" : "#e76f51", () => bucket()));
      if (hinting) out.push(full ? PointAt(60, height - 100, "#06d6a0") : PointAt(width - 60, height - 100, "#f77f00"));
    }
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Työmaa", "Building site", "La obra"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className={K.mode === "play" && K.level === 1 ? "root3d" : "root"}>{body}{Sparks()}</div>;
}
