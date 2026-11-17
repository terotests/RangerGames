// Työmaa: the building site, for 5-year-olds. Levels:
//   1 Lapio        shovel as many loads of sand into the wheelbarrow as the
//                  dots show (counting); later steps end with ✓, so the child
//                  has to stop at the right number
//   2 Betonimylly  put cement, sand and water in the mixer as the picture
//                  recipe says, run it, and pour the concrete into the mould;
//                  then smooth the mould's bumpy top with a trowel (seen from
//                  above, 2D) until it is flat
//                  the mixer is 3D (rg.three): the inside tumbles and turns grey,
//                  it rumbles and the phone shakes while it turns
//   3 Kaivuri      3D view from the excavator cab: two sticks turn the cab and
//                  move the boom (then the bucket, then the arm) to dig sand
//                  from the pile into the truck
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
  else if (K.level === 1) rg.say(phase === "fill" ? "rk_t_mylly" : phase === "mix" ? "rk_t_kaynnista" : phase === "smooth" ? "rk_t_tasoita" : "rk_t_kaada");
  else sayDig();
}

function next() {
  const s = step();
  K.wait = K.level === 2 ? 3.6 : 1.8;
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
    bits = []; fly = []; mixK = 0; tiltNow = REST; drum = 0; bump = []; trowel.on = false;
    build3d();
  } else {
    phase = "play";
    startDig();
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
  if (K.level === 1 && phase === "smooth") { trowel = { x, y, on: true }; return; }
  if (K.level === 1 && phase === "fill") {
    recipe.forEach((r, i) => {
      const s = srcPos(i);
      if (Math.abs(x - s.x) < 44 && Math.abs(y - s.y) < 44) { grab = "ing"; carrying = r.id; hand = { x, y }; rg.sound("click"); }
    });
    return;
  }
  if (K.level === 2) digDown(x, y);
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

// ---- 3: digger, seen from its cab in 3D ----------------------------------------------
// The cab turns (yaw); the boom, the arm and the bucket move in the cab's own
// upright plane. Two control sticks: the left one turns the cab (and later moves
// the arm), the right one lifts the boom (and later turns the bucket). Step 0: the
// bucket fills and empties by itself; step 1: the bucket is the child's; step 2:
// the arm too, and the sand pile is farther away.
const DG = { boomH: 1.45, boomF: 0.55, boomX: 0.42, L1: 3.3, L2: 2.3, LB: 0.75 };
const CABH = 2.55, CABX = -0.7, CABF = -0.5, FOVD = 74;
const PSAND = "#c4964e", PSAND2 = "#a87d38";
const PILE_YAW = 1.05, TRUCK_YAW = -1.15;
const BED = { d: 4.5, top: 1.25, len: 2.3, wid: 1.5 };
const YELLOW = "#f2b705", YELLOW2 = "#c78f00", STEEL = "#4a4f55";
let yaw = 0, boomA = 0.55, armA = -1.55, buck = 0.25;   // buck: 0 open (empties), 1 curled
let full = false, loads = 0, pileD = 4.7;
let stick: any = { L: [0, 0], R: [0, 0] };
let digGrab = "";
let humT = 0, wasIn = false;

function fwd(y: number) { return [Math.sin(y), 0, -Math.cos(y)]; }
function rgt(y: number) { return [Math.cos(y), 0, Math.sin(y)]; }
// a point of the cab's plane (lateral x, forward f, height h) in the world
function cabPt(x: number, f: number, h: number): number[] { const F = fwd(yaw), Rr = rgt(yaw); return [x * Rr[0] + f * F[0], h, x * Rr[2] + f * F[2]]; }
// the joints in the cab plane: [f, h]
function joints() {
  const p0 = [DG.boomF, DG.boomH];
  const e1 = [p0[0] + DG.L1 * Math.cos(boomA), p0[1] + DG.L1 * Math.sin(boomA)];
  const aa = boomA + armA;
  const e2 = [e1[0] + DG.L2 * Math.cos(aa), e1[1] + DG.L2 * Math.sin(aa)];
  // the bucket hangs from the arm's pin like a backhoe's: open (0) the teeth point
  // forward and the mouth down, curled (1) the teeth point back and the mouth up
  const ba = aa + 2.4 - buck * 3.4;
  const t = [e2[0] + DG.LB * Math.cos(ba), e2[1] + DG.LB * Math.sin(ba)];
  return { p0, e1, e2, t, aa, ba };
}
// the way the bucket's mouth looks, as an angle in the cab plane (0 forward, π/2 up)
function mouthAngle(): number { const j = joints(); return j.ba - 2.16; }
function tipWorld(): number[] { const j = joints(); return cabPt(DG.boomX, j.t[0], j.t[1]); }
function pileC(): number[] { const F = fwd(PILE_YAW); return [F[0] * pileD, 0, F[2] * pileD]; }
function truckC(): number[] { const F = fwd(TRUCK_YAW), Rr = rgt(TRUCK_YAW); return [F[0] * BED.d + Rr[0] * truckOff, 0, F[2] * BED.d + Rr[2] * truckOff]; }

// ---- the sand: heightfields, like the sand game but in 3D ----------------------
// The pile and the truck's load are grids of sand heights. Sand that stands
// steeper than it can slides down to its neighbours (a sandpile), so a hole
// dug in the pile fills from the sides and a load dumped in the truck spreads
// into a heap. The bucket cuts the sand at its teeth: curling, the cut sand goes
// into the bucket; moving sideways, it pushes the sand along (or stops, deep in).
const PN = 16, PS = 4.8, PCS = PS / PN;            // pile grid: cells, size, cell size
const BNX = 10, BNZ = 6;                           // the truck bed's grid
const BCX = BED.len / BNX, BCZ = BED.wid / BNZ;
const FLOOR = 0.88, WALL = 0.42;                   // the bed floor's top, the walls' height over it
const REPOSE = 0.68;                               // how steep sand stands (rise per run)
const CAP = 0.42;                                  // what the bucket holds, m³
let pile: number[] = [], bedH: number[] = [];
let load = 0, bucketLump: number[] = [];
let pileDirty = true, bedDirty = true, sentT = -10, lumpSig = "";
let truckOff = 0, truckT = -10;                    // the truck's place along its length; when it came
let bumpT = -10, deepSaid = false, hitSaid = false;
let pourBed = 0, pourLost = 0, loadsSaid = 0;

function pileAt(x: number, z: number): number { const c = pileC(); const i = Math.round((x - c[0]) / PCS + PN / 2), j = Math.round((z - c[2]) / PCS + PN / 2); return i < 0 || j < 0 || i > PN || j > PN ? -1 : j * (PN + 1) + i; }
// a world point in the truck's frame: [along (towards the back), across, height]
function inTruck(p: number[]): number[] {
  const c = truckC(), F = fwd(TRUCK_YAW), Rr = rgt(TRUCK_YAW);
  const dx = p[0] - c[0], dz = p[2] - c[2];
  return [dx * Rr[0] + dz * Rr[2], dx * F[0] + dz * F[2], p[1]];
}
function bedAt(al: number, ac: number): number {
  const i = Math.round((al + BED.len / 2) / BCX), j = Math.round((-ac + BED.wid / 2) / BCZ);
  return i < 0 || j < 0 || i > BNX || j > BNZ ? -1 : j * (BNX + 1) + i;
}
function bedVol() { let s = 0; for (const h of bedH) s += h; return s * BCX * BCZ; }
function perLoad() { return CAP * 0.72; }

// sand steeper than REPOSE slides to the lower neighbour
function relax(h: number[], nx: number, nz: number, csx: number, csz: number, open: boolean, iters: number): boolean {
  let moved = false;
  for (let it = 0; it < iters; it++) {
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const a = j * (nx + 1) + i;
      if (i < nx) moved = slide(h, a, a + 1, REPOSE * csx) || moved;
      if (j < nz) moved = slide(h, a, a + nx + 1, REPOSE * csz) || moved;
    }
    // the pile's rim runs out onto the ground
    if (open) for (let k = 0; k <= nx; k++) { h[k] = 0; h[nz * (nx + 1) + k] = 0; h[k * (nx + 1)] = 0; h[k * (nx + 1) + nx] = 0; }
  }
  return moved;
}
function slide(h: number[], a: number, b: number, lim: number): boolean {
  const d = h[a] - h[b];
  if (Math.abs(d) <= lim + 0.002) return false;
  const m = (Math.abs(d) - lim) * 0.35;
  if (d > 0) { h[a] -= m; h[b] += m; } else { h[a] += m; h[b] -= m; }
  return true;
}
function makePile() {
  pile = new Array((PN + 1) * (PN + 1)).fill(0);
  const c2 = [0.55, -0.45];
  for (let j = 0; j <= PN; j++) for (let i = 0; i <= PN; i++) {
    const x = (i - PN / 2) * PCS, z = (j - PN / 2) * PCS;
    const a = 1.45 - Math.hypot(x, z) * REPOSE * 0.98;
    const b = 1.0 - Math.hypot(x - c2[0], z - c2[1]) * REPOSE * 0.98;
    pile[j * (PN + 1) + i] = Math.max(0, a, b) + (Math.random() - 0.5) * 0.06;
  }
  relax(pile, PN, PN, PCS, PCS, true, 6);
}
function newLump() { bucketLump = []; for (let k = 0; k < 35; k++) bucketLump.push(0.75 + Math.random() * 0.5); }
// the sand in the bucket: a lumpy heap over the bucket's mouth, as tall as the load
function lumpHeights(): number[] {
  const f = load / CAP, out: number[] = [];
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 6; i++) {
    const u = (i - 3) / 3, v = (j - 2) / 2;
    const d = 1 - (u * u * 0.8 + v * v);
    out.push(i === 0 || j === 0 || i === 6 || j === 4 ? 0 : Math.round(Math.max(0, d) * 0.26 * f * bucketLump[j * 7 + i] * 100) / 100 + 0.01);
  }
  return out;
}
function r2(h: number[]) { return h.map((v) => Math.round(v * 100) / 100); }

// a link from a to b (cab plane points) as a box of thickness w × d
function link(id: string, a: number[], b: number[], x: number) {
  const A = cabPt(x, a[0], a[1]), B = cabPt(x, b[0], b[1]);
  const d = unit(sub(B, A)), Rr = rgt(yaw);
  const z = cross(Rr, d);
  const M: M3 = [[Rr[0], d[0], z[0]], [Rr[1], d[1], z[1]], [Rr[2], d[2], z[2]]];
  const e = euler(M), L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  rg.three("set", { id, x: (A[0] + B[0]) / 2, y: (A[1] + B[1]) / 2, z: (A[2] + B[2]) / 2, rx: e[0], ry: e[1], rz: e[2], sy: L });
}

// the truck's parts: id, shape, size, along, across, height, colour, extra
const TRUCK: any[] = [
  ["tCab", "box", [1.3, 1.5, 1.6], -BED.len / 2 - 0.75, 0, 1.35, "#e63946"],
  ["tWin", "box", [0.05, 0.6, 1.3], -BED.len / 2 - 1.42, 0, 1.7, "#a8dadc"],
  ["tChassis", "box", [BED.len + 1.6, 0.3, 1.4], -0.7, 0, 0.6, "#343a40"],
  ["tFloor", "box", [BED.len, 0.12, BED.wid], 0, 0, 0.82, "#6c757d"],
  ["tWallA", "box", [BED.len, 0.45, 0.07], 0, BED.wid / 2, 1.05, "#adb5bd"],
  ["tWallB", "box", [BED.len, 0.45, 0.07], 0, -BED.wid / 2, 1.05, "#adb5bd"],
  ["tWallC", "box", [0.07, 0.45, BED.wid], BED.len / 2, 0, 1.05, "#adb5bd"],
  ["tWallD", "box", [0.07, 0.45, BED.wid], -BED.len / 2, 0, 1.05, "#adb5bd"],
];
function truckParts(): any[] {
  const out = TRUCK.slice();
  [-1.7, -0.1, 0.8].forEach((al, i) => { for (const ac of [-0.75, 0.75]) out.push(["tw" + i + (ac > 0 ? "a" : "b"), "cylinder", [0.38, 0.38, 0.25], al, ac, 0.38, "#212529", true]); });
  return out;
}
function placeTruck(add: boolean) {
  const c = truckC(), ty = -TRUCK_YAW + Math.PI / 2;
  const Rr = rgt(TRUCK_YAW), F = fwd(TRUCK_YAW);
  // a wheel's axle (the cylinder's y) lies across the truck: turned to z first, then
  // turned with the truck (the engine applies rx, ry, rz in the other order)
  for (const p of truckParts()) {
    const x = c[0] + Rr[0] * p[3] + F[0] * p[4], z = c[2] + Rr[2] * p[3] + F[2] * p[4];
    const o: any = { id: p[0], x, y: p[5], z };
    if (add) { o.shape = p[1]; o.size = p[2]; o.color = p[6]; o.ry = ty + Math.PI / 2; if (p[7]) { const e = euler(mm(ry(ty + Math.PI / 2), rx(Math.PI / 2))); o.rx = e[0]; o.ry = e[1]; o.rz = e[2]; } }
    rg.three(add ? "add" : "set", o);
  }
  // the load turns with the truck: its own x along the truck, z across (the other way)
  rg.three(add ? "add" : "set", Object.assign({ id: "tLoad", x: c[0], y: FLOOR, z: c[2] }, add ? { shape: "heightfield", size: [BED.len - 0.1, BED.wid - 0.1, BNX, BNZ], heights: r2(bedH), color: PSAND, ry: -TRUCK_YAW } : {}));
}

function buildDig() {
  rg.three("clear");
  rg.three("scene", { background: ["#8fb8de", "#e3edf5"], ground: { y: 0, color: "#7d6b4f" } });
  rg.three("light", { id: "sun", type: "directional", x: 3, y: 7, z: 2, intensity: 0.6 });
  rg.three("light", { id: "amb", type: "ambient", intensity: 0.42 });
  // the site: a fence round it, houses behind, a few trees
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, F = fwd(a);
    rg.three("add", { id: "fence" + i, shape: "box", size: [3.0, 1.6, 0.08], color: i % 2 ? "#3d4a52" : "#46545c", x: F[0] * 13.5, y: 0.8, z: F[2] * 13.5, ry: -a, layer: -1 });
  }
  const houses = [[0.3, 26, 7, 5], [0.75, 28, 10, 7], [-0.4, 27, 6, 8], [-0.95, 25, 9, 6], [1.6, 26, 8, 6], [2.4, 27, 6, 9], [-1.8, 28, 7, 7], [3.1, 26, 9, 5], [-2.6, 27, 8, 8]];
  houses.forEach((h, i) => { const F = fwd(h[0]); rg.three("add", { id: "house" + i, shape: "box", size: [h[2], h[3], 4], color: ["#a9a399", "#9c968b", "#b5b0a6"][i % 3], x: F[0] * h[1], y: h[3] / 2, z: F[2] * h[1], ry: -h[0], layer: -1 }); });
  [[2.0, 9], [-2.1, 10], [2.8, 8.5], [-0.2, 11]].forEach((t, i) => {
    const F = fwd(t[0]);
    rg.three("add", { id: "trunk" + i, shape: "cylinder", size: [0.15, 0.15, 1], detail: 6, color: "#7f5539", x: F[0] * t[1], y: 0.5, z: F[2] * t[1] });
    rg.three("add", { id: "tree" + i, shape: "cone", size: [0.9, 2.2], detail: 8, color: "#40916c", x: F[0] * t[1], y: 2.0, z: F[2] * t[1] });
  });
  // the sand pile
  const pc = pileC();
  rg.three("add", { id: "pile", shape: "heightfield", size: [PS, PS, PN, PN], heights: r2(pile), color: PSAND, x: pc[0], y: 0, z: pc[2] });
  placeTruck(true);
  // the digger's own parts: boom, arm, bucket plates, hydraulic cylinders, sand in the bucket
  rg.three("add", { id: "boom", shape: "box", size: [0.34, 1, 0.42], color: YELLOW });
  rg.three("add", { id: "arm", shape: "box", size: [0.26, 1, 0.32], color: YELLOW });
  rg.three("add", { id: "cylB", shape: "cylinder", size: [0.07, 0.07, 1], detail: 8, color: "#ced4da" });
  rg.three("add", { id: "cylA", shape: "cylinder", size: [0.06, 0.06, 1], detail: 8, color: "#ced4da" });
  rg.three("add", { id: "bkBack", shape: "box", size: [0.8, 1, 0.08], color: STEEL });
  rg.three("add", { id: "bkBot", shape: "box", size: [0.8, 1, 0.08], color: "#3b3f44" });
  rg.three("add", { id: "bkL", shape: "box", size: [0.06, 1, 0.5], color: STEEL });
  rg.three("add", { id: "bkR", shape: "box", size: [0.06, 1, 0.5], color: STEEL });
  for (let i = 0; i < 4; i++) rg.three("add", { id: "tooth" + i, shape: "box", size: [0.08, 1, 0.06], color: "#adb5bd" });
  rg.three("add", { id: "bkSand", shape: "heightfield", size: [0.7, 0.8, 6, 4], heights: [], color: PSAND, visible: false });
  // the machine's own front under the cab: tracks and the boom's foot
  rg.three("add", { id: "foot", shape: "box", size: [0.6, 0.7, 0.8], color: YELLOW2 });
  pileDirty = bedDirty = false; lumpSig = "";
  placeDig();
}

function placeDig() {
  const j = joints();
  const cam = cabPt(CABX, CABF, CABH), look = cabPt(0.55, 6, 0.8);
  rg.three("camera", { x: cam[0], y: cam[1], z: cam[2], lookAt: look, fov: FOVD });
  digCam = { cam, look };
  // the sand that changed, at most 30 times a second
  if ((pileDirty || bedDirty) && K.t - sentT > 0.033) {
    sentT = K.t;
    if (pileDirty) rg.three("set", { id: "pile", heights: r2(pile) });
    if (bedDirty) rg.three("set", { id: "tLoad", heights: r2(bedH) });
    pileDirty = bedDirty = false;
  }
  placeTruck(false);
  // the links
  link("foot", [DG.boomF - 0.1, DG.boomH - 0.6], [DG.boomF + 0.1, DG.boomH], DG.boomX);
  link("boom", j.p0, j.e1, DG.boomX);
  link("arm", j.e1, j.e2, DG.boomX);
  const mB = [j.p0[0] + DG.L1 * 0.45 * Math.cos(boomA), j.p0[1] + DG.L1 * 0.45 * Math.sin(boomA) - 0.25];
  link("cylB", [DG.boomF + 0.3, DG.boomH - 0.55], mB, DG.boomX);
  const e1b = [j.e1[0] - 0.5 * Math.cos(boomA), j.e1[1] - 0.5 * Math.sin(boomA) + 0.28];
  const a2 = [j.e1[0] + 1.2 * Math.cos(j.aa), j.e1[1] + 1.2 * Math.sin(j.aa) + 0.18];
  link("cylA", e1b, a2, DG.boomX);
  // the bucket: a back plate e2→tip, a bottom plate from the tip back, sides and teeth
  const bd = [Math.cos(j.ba), Math.sin(j.ba)];
  const nb = [bd[1], -bd[0]];          // towards the open side
  const bot = [j.t[0] + nb[0] * 0.5, j.t[1] + nb[1] * 0.5];
  link("bkBack", j.e2, j.t, DG.boomX);
  link("bkBot", j.t, bot, DG.boomX);
  link("bkL", j.e2, [j.t[0] + nb[0] * 0.25, j.t[1] + nb[1] * 0.25], DG.boomX - 0.4);
  link("bkR", j.e2, [j.t[0] + nb[0] * 0.25, j.t[1] + nb[1] * 0.25], DG.boomX + 0.4);
  for (let i = 0; i < 4; i++) link("tooth" + i, bot, [bot[0] + nb[0] * 0.14 - bd[0] * 0.05, bot[1] + nb[1] * 0.14 - bd[1] * 0.05], DG.boomX - 0.3 + i * 0.2);
  // the sand heap over the bucket's mouth (the line e2 – teeth), facing out of it
  const mouth = [j.e2[0] - bot[0], j.e2[1] - bot[1]], ml = Math.hypot(mouth[0], mouth[1]);
  const out = [mouth[1] / ml, -mouth[0] / ml];   // the mouth's normal, away from the bucket's inside
  const inside = [(j.t[0] - bot[0]) * out[0] + (j.t[1] - bot[1]) * out[1]];
  const o = inside[0] > 0 ? [-out[0], -out[1]] : out;
  const sink = 0.06 + 0.16 * (1 - load / CAP);
  const mid = [(j.e2[0] + bot[0]) / 2 - o[0] * sink, (j.e2[1] + bot[1]) / 2 - o[1] * sink];
  if (load > 0.004) {
    const Rr = rgt(yaw), F = fwd(yaw);
    const up = [F[0] * o[0], o[1], F[2] * o[0]];
    const z = cross(Rr, up);
    const e = euler([[Rr[0], up[0], z[0]], [Rr[1], up[1], z[1]], [Rr[2], up[2], z[2]]]);
    const sp = cabPt(DG.boomX, mid[0], mid[1]);
    const hs = lumpHeights(), sig = hs.join(",");
    const opt: any = { id: "bkSand", visible: true, x: sp[0], y: sp[1], z: sp[2], rx: e[0], ry: e[1], rz: e[2] };
    if (sig !== lumpSig) { lumpSig = sig; opt.heights = hs; }
    rg.three("set", opt);
  } else rg.three("set", { id: "bkSand", visible: false });
}
let digCam: any = { cam: [0, 2, 0], look: [0, 1, -5] };
function projDig(p: number[]): number[] {
  const f = unit(sub(digCam.look, digCam.cam)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f);
  const focal = (height / 2) / Math.tan(FOVD * Math.PI / 360);
  const v = sub(p, digCam.cam), z = Math.max(0.1, dot(v, f));
  return [width / 2 + dot(v, r) / z * focal, height / 2 - dot(v, u) / z * focal];
}

function startDig() {
  const s = step();
  want = s === 0 ? 2 : 3;
  loads = 0; load = 0; loadsSaid = 0; pourBed = 0; pourLost = 0;
  pileD = s === 2 ? 5.6 : 4.6;
  yaw = 0; boomA = 0.8; armA = -1.6; buck = 0.25;
  stick = { L: [0, 0], R: [0, 0] }; digGrab = "";
  fly = []; wasIn = false; deepSaid = false; hitSaid = false;
  truckOff = 9; truckT = K.t;
  makePile(); newLump();
  bedH = new Array((BNX + 1) * (BNZ + 1)).fill(0);
  buildDig();
}

// the sticks' places and size
function stickC(k: string) { return { x: k === "L" ? width * 0.25 : width * 0.75, y: height - 92 }; }
const STICK_R = 54;
let bdrag = { y: 0, b: 0 }, handT = -10;   // dragging the bucket itself; when the child last turned it
// the bucket's middle on the screen
function bucketScreen(): number[] { const j = joints(); return projDig(cabPt(DG.boomX, (j.e2[0] + j.t[0]) / 2, (j.e2[1] + j.t[1]) / 2)); }
function digDown(x: number, y: number) {
  for (const k of ["L", "R"]) { const c = stickC(k); if (Math.hypot(x - c.x, y - c.y) < STICK_R * 1.5) { digGrab = k; digMove(x, y); rg.sound("click", { volume: 0.4 }); return; } }
  // a finger (or the mouse) on the bucket turns it: up curls it, down opens it
  const b = bucketScreen();
  if (y < height - 180 && Math.hypot(x - b[0], y - b[1]) < 80) { digGrab = "bucket"; bdrag = { y, b: buck }; rg.sound("click", { volume: 0.4 }); }
}
function digMove(x: number, y: number) {
  if (digGrab === "bucket") { buck = Math.max(0, Math.min(1, bdrag.b - (y - bdrag.y) / 130)); handT = K.t; return; }
  const c = stickC(digGrab);
  let dx = (x - c.x) / STICK_R, dy = (y - c.y) / STICK_R;
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  stick[digGrab] = [dx, dy];
}
function digUp() { if (digGrab && digGrab !== "bucket") stick[digGrab] = [0, 0]; digGrab = ""; }
// which way each stick works in this step: [left x, left y, right x, right y]
function axes() { const s = step(); return { swing: true, arm: s >= 2, boom: true, bucket: true }; }
function dz(v: number) { return Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82; }

// points of the bucket in the world: the teeth and the back corner, across its width
function bucketPts(): number[][] {
  const j = joints();
  const bd = [Math.cos(j.ba), Math.sin(j.ba)], nb = [bd[1], -bd[0]];
  const bot = [j.t[0] + nb[0] * 0.5, j.t[1] + nb[1] * 0.5];
  const out: number[][] = [];
  for (const x of [-0.32, -0.1, 0.1, 0.32]) { out.push(cabPt(DG.boomX + x, bot[0], bot[1])); out.push(cabPt(DG.boomX + x, j.t[0], j.t[1])); }
  out.push(cabPt(DG.boomX, j.e2[0], j.e2[1]));
  return out;
}
// how far the bucket is into the truck's cab, walls or floor (0: not at all)
function truckDepth(): number {
  let d = 0;
  for (const p of bucketPts()) {
    const q = inTruck(p);
    const al = q[0], ac = Math.abs(q[1]), y = q[2];
    if (al > -BED.len / 2 - 1.45 && al < -BED.len / 2 - 0.05 && ac < 0.85 && y < 2.12) d += 2.12 - y;
    else if (Math.abs(al) < BED.len / 2 + 0.05 && ac < BED.wid / 2 + 0.05) {
      const inner = Math.abs(al) < BED.len / 2 - 0.06 && ac < BED.wid / 2 - 0.06;
      if (!inner && y < FLOOR + WALL + 0.03) d += FLOOR + WALL + 0.03 - y;
      if (inner && y < FLOOR + 0.03) d += FLOOR + 0.03 - y;   // the load is soft: the bucket goes into it
    }
  }
  return d;
}
// the sand above the bucket's cutting points
function sandAbove(): { v: number; ex: number }[] {
  const out: { v: number; ex: number }[] = [];
  const pts = bucketPts();
  for (let k = 0; k < 8; k++) {
    const p = pts[k], v = pileAt(p[0], p[2]);
    if (v >= 0 && pile[v] > p[1]) out.push({ v, ex: pile[v] - Math.max(0, p[1]) });
  }
  return out;
}
function inSand(): boolean { return sandAbove().some((c) => c.ex > 0.04); }

function tickDig(dt: number) {
  const A = axes(), s = step();
  const L = stick.L, R = stick.R;
  const old = { yaw, boomA, armA, buck };
  const tip0 = tipWorld();
  const depth0 = truckDepth();
  const low0 = bucketPts().reduce((m, q) => Math.min(m, q[1]), 9);
  // the truck comes in, and drives off once full
  if (K.solved >= 0) {
    const k = K.t - K.solved - 0.9;
    if (k > 0) { truckOff = -k * k * 1.6; if (Math.floor(K.t * 4) !== Math.floor((K.t - dt) * 4)) rg.sound("hit", { pitch: 0.16, volume: 0.25 }); }
  } else if (truckOff > 0) {
    const k = Math.min(1, (K.t - truckT) / 1.8);
    truckOff = 9 * (1 - k) * (1 - k);
    if (Math.floor(K.t * 4) !== Math.floor((K.t - dt) * 4)) rg.sound("hit", { pitch: 0.16, volume: 0.22 });
  }
  yaw += dz(L[0]) * 0.9 * dt;
  yaw = Math.max(-1.9, Math.min(1.9, yaw));
  boomA -= dz(R[1]) * 0.55 * dt;
  boomA = Math.max(0.05, Math.min(1.0, boomA));
  if (A.arm) { armA -= dz(L[1]) * 0.8 * dt; armA = Math.max(-2.3, Math.min(-0.7, armA)); }
  if (A.bucket && dz(R[0]) !== 0) { buck += dz(R[0]) * 1.4 * dt; buck = Math.max(0, Math.min(1, buck)); handT = K.t; }
  if (s === 0 && K.t - handT > 1.5 && digGrab !== "bucket") {
    // until the child turns it, the bucket curls by itself in the sand and opens over the truck
    const over = overBed();
    const target = load > 0.02 && over ? 0 : load > 0.02 || (inSand() && load < CAP) ? 1 : 0.25;
    buck += Math.max(-1.6 * dt, Math.min(1.6 * dt, target - buck));
  }
  // the teeth stop at the ground, and at the truck
  const low = () => bucketPts().reduce((m, q) => Math.min(m, q[1]), 9);
  // (a move that lifts the bucket out of the ground is always fine)
  // first the bucket's turn is undone, then the boom and arm, last the swing
  const sunk = () => { const l = low(); return l < 0.03 && l < low0 - 1e-4; };
  if (sunk()) {
    const tried = buck;
    buck = old.buck;
    // step 0 curls by itself: lift the boom a little so the teeth clear the ground
    if (s === 0 && tried > old.buck) boomA = Math.min(1.0, boomA + 0.35 * dt);
    if (sunk()) { boomA = old.boomA; armA = old.armA; if (sunk()) yaw = old.yaw; }
  }
  // a move that takes the bucket deeper into the truck is stopped (one out of it is not,
  // so sand heaped up under the bucket cannot trap it)
  const deeper = () => truckDepth() > depth0 + 0.002;
  if (deeper()) {
    buck = old.buck;
    if (deeper()) { boomA = old.boomA; armA = old.armA; if (deeper()) yaw = old.yaw; }
    if (K.t - bumpT > 0.4) { bumpT = K.t; rg.sound("hit", { pitch: 1.3, volume: 0.6 }); rg.vibrate(50); if (!hitSaid) { hitSaid = true; rg.say("rk_t_osui_autoon"); } }
  }
  // the sand: cut into the bucket while it curls, pushed along while it moves sideways
  const cut = sandAbove();
  if (cut.length) {
    const curling = buck > old.buck + 1e-4;
    const tip1 = tipWorld();
    const mv = [tip1[0] - tip0[0], tip1[2] - tip0[2]], ml = Math.hypot(mv[0], mv[1]);
    const deep = cut.reduce((m, c) => Math.max(m, c.ex), 0);
    if (curling && load < CAP) {
      // step 0 digs a little deeper by itself
      const bonus = s === 0 ? 0.25 : 0;
      for (const c of cut) {
        const take = Math.min(c.ex + bonus, pile[c.v], (CAP - load) / (PCS * PCS));
        pile[c.v] -= take; load += take * PCS * PCS;
      }
      if (load >= CAP * 0.85 && loadsSaid === 0) { loadsSaid = 1; rg.say("rk_t_kauha_taynna"); }
      pileDirty = true;
    } else if (ml > 1e-4 && deep > 0.4 && (yaw !== old.yaw || armA !== old.armA)) {
      // too deep to push sideways: the bucket stops
      yaw = old.yaw; armA = old.armA;
      if (K.t - bumpT > 0.5) { bumpT = K.t; rg.sound("hit", { pitch: 0.45, volume: 0.5 }); rg.vibrate(40); if (!deepSaid) { deepSaid = true; rg.say("rk_t_liian_syvalla"); } }
    } else {
      // push the cut sand one cell on, the way the bucket goes (or round it)
      for (const c of cut) {
        const i = c.v % (PN + 1), jj = Math.floor(c.v / (PN + 1));
        const n = ml > 1e-4 ? [Math.round(mv[0] / ml), Math.round(mv[1] / ml)] : [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        const ni = i + n[0], nj = jj + n[1];
        pile[c.v] -= c.ex;
        if (ni >= 0 && nj >= 0 && ni <= PN && nj <= PN) pile[nj * (PN + 1) + ni] += c.ex;
      }
      pileDirty = true;
    }
  }
  // pouring: the open bucket lets the sand out where it is
  // sand stays in while the mouth looks up or sideways, and runs out when it looks down
  const down = -Math.sin(mouthAngle());
  if (load > 0 && down > 0.1) {
    const flow = Math.min(load, CAP * dt * (0.8 + 4 * Math.min(1, (down - 0.1) / 0.5)));
    load -= flow;
    const t = tipWorld(), q = inTruck(t);
    const b = bedAt(q[0], q[1]);
    if (b >= 0 && Math.abs(q[0]) < BED.len / 2 && Math.abs(q[1]) < BED.wid / 2 && t[1] > FLOOR) {
      // spread over the cell and its neighbours
      const bi = b % (BNX + 1), bj = Math.floor(b / (BNX + 1));
      const per = flow / (BCX * BCZ) / 5;
      for (const d of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = Math.max(0, Math.min(BNX, bi + d[0])), jj = Math.max(0, Math.min(BNZ, bj + d[1]));
        bedH[jj * (BNX + 1) + i] += per;
      }
      bedDirty = true; pourBed += flow;
    } else {
      const v = pileAt(t[0], t[2]);
      if (v >= 0) { pile[v] += flow / (PCS * PCS); pileDirty = true; } else pourLost += flow;
    }
    if (Math.random() < 0.7) {
      const p = projDig(t), g = projDig([t[0], b >= 0 ? FLOOR + 0.2 : 0, t[2]]);
      spray(p[0], p[1], g[0], g[1], [SAND, SAND2, "#d9b25f"], 5, 18);
    }
    if (Math.floor(K.t * 6) !== Math.floor((K.t - dt) * 6)) rg.sound("whoosh", { pitch: 0.4 + Math.random() * 0.2, volume: 0.25 });
    if (load <= 0.001) { load = 0; afterPour(); }
  }
  // the sand settles
  if (relax(pile, PN, PN, PCS, PCS, true, 1)) pileDirty = true;
  if (relax(bedH, BNX, BNZ, BCX, BCZ, false, 2)) { bedDirty = true; for (let k = 0; k < bedH.length; k++) if (bedH[k] > WALL + 0.35) bedH[k] = WALL + 0.35; }
  // the engine's hum while something moves
  const moving = Math.abs(yaw - old.yaw) + Math.abs(boomA - old.boomA) + Math.abs(armA - old.armA) + Math.abs(buck - old.buck) > 1e-4;
  humT -= dt;
  if (moving && humT <= 0) { humT = 0.22; rg.sound("hit", { pitch: 0.22 + Math.random() * 0.06, volume: 0.12 }); }
  const sand = inSand();
  if (sand && !wasIn) { rg.sound("hit", { pitch: 0.5, volume: 0.4 }); rg.vibrate(30); }
  wasIn = sand;
  full = load > CAP * 0.3;
  tickFly(dt);
  placeDig();
}
// the bucket is empty: count the truck's loads, or tell that the sand fell down
function afterPour() {
  loadsSaid = 0; newLump();
  const v = bedVol();
  const n = Math.min(want, Math.floor(v / perLoad() + 0.08));
  if (pourLost > pourBed && pourLost > CAP * 0.3) spill();
  else if (n > loads) { loads = n; rg.sound("pop"); rg.say(rg.sayId.number(loads)); }
  pourBed = 0; pourLost = 0;
  if (loads >= want) win(width / 2, height / 2, ["rk_t_auto_taynna"]);
}
// is the bucket over the truck's bed?
function overBed(): boolean {
  const t = tipWorld(), q = inTruck(t);
  return Math.abs(q[0]) < BED.len / 2 + 0.2 && Math.abs(q[1]) < BED.wid / 2 + 0.3 && t[1] > FLOOR + WALL - 0.2;
}
function spill() {
  const n = miss();
  hintT = K.t;
  rg.say(n >= 2 ? ["rk_t_valui", "rk_t_vihje_kaivuri"] : "rk_t_valui");
}
// what to do next, for the hint arrows and speech
function nextDo(): string {
  const t = tipWorld();
  const qt = inTruck(t);
  if (!full && Math.abs(qt[0]) < BED.len / 2 + 0.6 && Math.abs(qt[1]) < BED.wid / 2 + 0.6 && t[1] < FLOOR + WALL + 0.35) return "boomUp";
  if (!full) {
    if (Math.abs(yaw - PILE_YAW) > 0.35) return yaw < PILE_YAW ? "swingR" : "swingL";
    if (step() >= 2) { const c = pileC(); const r = Math.hypot(t[0] - c[0], t[2] - c[2]); if (r > 1.9) return "armOut"; }
    if (!inSand()) return "boomDown";
    return step() >= 1 ? "curl" : "boomDown";
  }
  if (t[1] < BED.top + 0.5 && Math.abs(yaw - TRUCK_YAW) > 0.3) return "boomUp";
  if (Math.abs(yaw - TRUCK_YAW) > 0.3) return yaw < TRUCK_YAW ? "swingR" : "swingL";
  if (!overBed()) return t[1] < BED.top + 0.3 ? "boomUp" : "boomDown";
  return "open";
}
function sayDig() { rg.say(step() === 0 ? "rk_t_kaivuri3d" : step() === 1 ? "rk_t_kauha3d" : "rk_t_varsi3d"); }
function hintDig() {
  const n = nextDo();
  const id: any = { swingR: full ? "rk_t_kaanna_autolle" : "rk_t_kaanna_hiekalle", swingL: full ? "rk_t_kaanna_autolle" : "rk_t_kaanna_hiekalle", boomDown: "rk_t_laske_puomi", boomUp: full ? "rk_t_vie_autoon" : "rk_t_nosta_puomi", armOut: "rk_t_varsi3d", curl: "rk_t_kauha3d", open: "rk_t_kauha3d" };
  rg.say(id[n]);
}

// the cab around the view and the sticks on the dashboard
function Stick(k: string, a: any, color: string) {
  const out: any[] = [];
  const c = stickC(k), v = stick[k];
  out.push(Circle(c.x, c.y, STICK_R, "#2b2d31", "#495057"));
  const tri = (dx: number, dy: number, col: string) => {
    const x = c.x + dx * (STICK_R - 12), y = c.y + dy * (STICK_R - 12);
    out.push(Poly([[x + dx * 9, y + dy * 9], [x - dy * 8 - dx * 4, y + dx * 8 - dy * 4], [x + dy * 8 - dx * 4, y - dx * 8 - dy * 4]], col));
  };
  if (k === "L") { tri(-1, 0, "#f77f00"); tri(1, 0, "#f77f00"); if (a.arm) { tri(0, -1, "#06d6a0"); tri(0, 1, "#06d6a0"); } }
  else { tri(0, -1, YELLOW); tri(0, 1, YELLOW); if (a.bucket) { tri(-1, 0, "#4cc9f0"); tri(1, 0, "#4cc9f0"); } }
  const kx = c.x + v[0] * (STICK_R - 20), ky = c.y + v[1] * (STICK_R - 20);
  out.push(Line([[c.x, c.y + 6], [kx, ky]], "#111", 9));
  out.push(Circle(kx, ky, 22, color, "#111"));
  return out;
}
function Cab() {
  const out: any[] = [];
  const W = width, H = height, dash = H - 170;
  // pillars, roof and the dashboard, a little slanted like a real cab
  out.push(Poly([[0, 0], [30, 0], [44, dash], [0, dash]], "#22262a"));
  out.push(Poly([[W, 0], [W - 26, 0], [W - 40, dash], [W, dash]], "#22262a"));
  out.push(Poly([[0, 0], [W, 0], [W, 12], [0, 18]], "#22262a"));
  out.push(Poly([[46, 0], [52, 0], [70, dash], [62, dash]], "#3a3f44"));
  out.push(Poly([[0, dash - 6], [W, dash - 14], [W, H], [0, H]], "#343a40"));
  out.push(Poly([[0, dash - 6], [W, dash - 14], [W, dash - 4], [0, dash + 4]], "#495057"));
  return out;
}
function PlayDig(out: any[]) {
  const hinting = K.t - hintT < 5;
  for (const e of Grains(fly.map((f) => ({ x: f.x, y: f.y, s: f.r * 2.4, c: f.c })))) out.push(e);
  for (const e of Cab()) out.push(e);
  const a = axes();
  for (const e of Stick("L", a, "#f77f00")) out.push(e);
  for (const e of Stick("R", a, YELLOW)) out.push(e);
  // loads as dots
  for (let i = 0; i < want; i++) out.push(Circle(width / 2 - (want - 1) * 17 + i * 34, height - 160, 11, i < loads ? "#06d6a0" : "#ffffff", "#e76f51"));
  if (K.question === 0 || hinting) {
    const n = nextDo(), L = stickC("L"), R = stickC("R");
    const at: any = { swingR: [L.x + 62, L.y], swingL: [L.x - 62, L.y], armOut: [L.x, L.y - 62], boomDown: [R.x, R.y + 64], boomUp: [R.x, R.y - 64], curl: [R.x + 62, R.y], open: [R.x - 62, R.y] };
    const p = at[n];
    // the bucket itself can be dragged: an arrow beside it, up to curl, down to open
    if ((n === "curl" || n === "open") && K.solved < 0 && digGrab !== "bucket") {
      const bs = bucketScreen(), dy = n === "curl" ? -1 : 1, x = bs[0] + 62, y = bs[1] + Math.sin(K.t * 5) * 8 * dy;
      out.push(Line([[x, y - 26 * dy], [x, y + 18 * dy]], "#ffd166", 7));
      out.push(Poly([[x, y + 32 * dy], [x - 13, y + 12 * dy], [x + 13, y + 12 * dy]], "#ffd166"));
    }
    if (p && K.solved < 0) { const r = 15 + 4 * Math.sin(K.t * 8); out.push(Circle(p[0] - (p[0] - (n.startsWith("swing") || n === "armOut" ? L.x : R.x)) * 0.25, p[1] - (p[1] - (n.startsWith("swing") || n === "armOut" ? L.y : R.y)) * 0.25, r, "rgba(255,209,102,0.35)", "#ffd166")); }
  }
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
      if (K.t - pourT > 2.2) { bits = []; fly = []; startSmooth(); }
    }
    if (phase === "smooth") { if (trowel.on && p) { if (p.down) smoothMove(p.x, p.y); else trowel.on = false; } }
    else { tickFly(dt); place3d(); }
  }
  if (K.level === 2) {
    if (digGrab && p) { if (p.down) digMove(p.x, p.y); else digUp(); }
    tickDig(dt);
  }
}

function onPointerUp() {
  trowel.on = false;
  digUp();
  if (grab === "shovel") dropShovel();
  if (grab === "ing") dropIng();
  grab = "";
  carrying = "";
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) rg.say(["rk_t_vihje_lapio", rg.sayId.number(want)]);
  else if (K.level === 1) rg.say(phase === "fill" ? "rk_t_vihje_mylly" : phase === "mix" ? "rk_t_kaynnista" : phase === "smooth" ? "rk_t_vihje_tasoita" : "rk_t_kaada");
  else hintDig();
}

function onBack() { grab = ""; trowel.on = false; digUp(); back(); }

// ---- 2b: smoothing the concrete with a trowel, seen from above ------------------------
const CELL = 8;
let bump: number[] = [];            // each cell's lump height, 0 = flat
let gw = 0, gh = 0, bump0 = 1;
let trowel = { x: 0, y: 0, on: false };
let scrapeT = 0, smoothSig = "", smoothOut: any[] = [], smoothBuilt = -10;
function mouldBox() { const l = 30, t = 170, w = width - 60, h = Math.min(320, height - 330); return { l, t, w, h }; }
function startSmooth() {
  phase = "smooth";
  rg.three("clear");
  speckle = "";
  const m = mouldBox();
  gw = Math.floor(m.w / CELL); gh = Math.floor(m.h / CELL);
  bump = new Array(gw * gh).fill(0);
  const n = [4, 7, 10][step()];
  for (let k = 0; k < n; k++) {
    const cx = Math.random() * gw, cy = Math.random() * gh, r = 3 + Math.random() * 4.5, a = 0.5 + Math.random() * 0.5;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const d = Math.hypot(i - cx, j - cy) / r;
      if (d < 1.6) bump[j * gw + i] += a * Math.exp(-d * d * 1.2);
    }
  }
  for (let q = 0; q < bump.length; q++) bump[q] = Math.min(1.2, bump[q] + Math.random() * 0.08);
  bump0 = bump.reduce((a, b) => a + b, 0);
  trowel = { x: width / 2, y: m.t + m.h + 70, on: false };
  smoothSig = ""; smoothOut = [];
  rg.say("rk_t_tasoita");
}
function trowelW() { return [150, 100, 76][step()]; }
function smoothMove(x: number, y: number) {
  const d = Math.hypot(x - trowel.x, y - trowel.y);
  trowel.x = x; trowel.y = y;
  if (d < 0.5) return;
  const m = mouldBox(), tw = trowelW();
  const i0 = Math.floor((x - tw / 2 - m.l) / CELL), i1 = Math.floor((x + tw / 2 - m.l) / CELL);
  const j0 = Math.floor((y - 20 - m.t) / CELL), j1 = Math.floor((y + 20 - m.t) / CELL);
  const k = Math.min(0.6, d * 0.012);
  let touched = false;
  for (let j = Math.max(0, j0); j <= Math.min(gh - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(gw - 1, i1); i++) {
    const q = j * gw + i;
    if (bump[q] > 0.005) { bump[q] *= 1 - k; touched = true; }
  }
  if (touched && K.t - scrapeT > 0.12) { scrapeT = K.t; rg.sound("whoosh", { pitch: 1.6 + Math.random() * 0.4, volume: 0.18 }); }
  if (smoothLeft() <= 0.04) { trowel.on = false; phase = "end"; win(width / 2, m.t + m.h / 2, ["rk_t_tasainen"]); }
}
// the share of the lumps still left
function smoothLeft() { let s = 0; for (const b of bump) s += b; return s / bump0; }
function lumpiest(): number[] {
  const m = mouldBox();
  let best = 0, bq = 0;
  for (let q = 0; q < bump.length; q++) if (bump[q] > best) { best = bump[q]; bq = q; }
  return [m.l + (bq % gw) * CELL + CELL / 2, m.t + Math.floor(bq / gw) * CELL + CELL / 2];
}
// the concrete's top: each cell shaded by its slope towards the light (top left),
// a few shades, one path each
const SHADES = ["#67625b", "#706b64", "#79746d", "#837e76", "#8c877f", "#959088", "#9d988f", "#a6a197", "#afaaa0", "#b8b3a8", "#c1bcb1", "#cac5ba", "#d3cec3"];
const MID = 6;
// fine sand in the concrete: a fixed speckle over the top
let speckle = "";
function SmoothTop() {
  const m = mouldBox();
  if (smoothOut.length && K.t - smoothBuilt < 0.033) return smoothOut;
  const sig = bump.map((b) => Math.round(b * 20)).join("");
  if (sig === smoothSig) return smoothOut;
  smoothBuilt = K.t;
  smoothSig = sig;
  const by: string[] = SHADES.map(() => "");
  const at = (i: number, j: number) => bump[Math.max(0, Math.min(gh - 1, j)) * gw + Math.max(0, Math.min(gw - 1, i))];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const sl = (at(i - 1, j - 1) - at(i + 1, j + 1)) * 2.2 + at(i, j) * 0.25;
    const lv = Math.max(0, Math.min(SHADES.length - 1, Math.round(MID + sl * 5)));
    if (lv === MID) continue;
    by[lv] += "M" + (m.l + i * CELL) + " " + (m.t + j * CELL) + "h" + CELL + "v" + CELL + "h-" + CELL + "z";
  }
  const paths: any[] = [<path d={"M" + m.l + " " + m.t + "h" + gw * CELL + "v" + gh * CELL + "h-" + gw * CELL + "z"} fill={SHADES[MID]} />];
  by.forEach((d, i) => { if (d) paths.push(<path d={d} fill={SHADES[i]} />); });
  if (!speckle) for (let k = 0; k < 500; k++) speckle += "M" + Math.floor(m.l + Math.random() * (gw * CELL - 2)) + " " + Math.floor(m.t + Math.random() * (gh * CELL - 2)) + (k % 3 ? "h1v1h-1z" : "h2v2h-2z");
  paths.push(<path d={speckle} fill="rgba(60,55,50,0.35)" />);
  smoothOut = [<svg style={fullS()} viewBox={vbox()}>{paths}</svg>];
  return smoothOut;
}
// a finishing trowel from above: the steel plate and the wooden handle on its posts
function Trowel(x: number, y: number, w: number) {
  return [
    Box(x - w / 2 + 3, y - 15, w, 36, "rgba(0,0,0,0.18)", 8),
    Box(x - w / 2, y - 18, w, 36, "#495057", 8),
    Box(x - w / 2 + 2, y - 16, w - 4, 32, "#dee2e6", 7),
    Box(x - w / 2 + 6, y - 12, w - 12, 6, "#f8f9fa", 3),
    Circle(x - w * 0.28, y, 4, "#343a40"),
    Circle(x + w * 0.28, y, 4, "#343a40"),
    Box(x - w * 0.34, y - 7, w * 0.68, 14, "#8d5524", 7),
    Box(x - w * 0.32, y - 6, w * 0.64, 4, "#b07040", 2),
  ];
}
function PlaySmooth(out: any[]) {
  const m = mouldBox(), gwp = gw * CELL, ghp = gh * CELL;
  out.push(Box(0, 120, width, height - 120, "#cdb892"));
  out.push(Box(m.l - 14, m.t - 14, gwp + 28, ghp + 28, "#a0522d", 4));
  for (const e of SmoothTop()) out.push(e);
  // how smooth it is
  const left = smoothLeft();
  out.push(Box(40, 136, width - 80, 14, "rgba(0,0,0,0.12)", 7));
  out.push(Box(40, 136, Math.max(14, (width - 80) * Math.min(1, (1 - left) / 0.96)), 14, "#06d6a0", 7));
  const hinting = K.t - hintT < 5;
  if (hinting && K.solved < 0) { const p = lumpiest(); out.push(Circle(p[0], p[1], 30, "rgba(247,127,0,0.25)", "#f77f00")); }
  for (const e of Trowel(trowel.x, trowel.y, trowelW())) out.push(e);
  if (!trowel.on && K.solved < 0 && left > 0.9) out.push(PointAt(trowel.x, trowel.y - 60, "#f77f00"));
}

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

const BOOM_L = 120, STICK_L = 70;   // the 2D digger of the menu picture
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
    : K.level === 1 && (phase === "smooth" || (phase === "end" && bump.length)) ? rg.t("Tasoita betoni", "Smooth the concrete", "Alisa el hormigón")
    : K.level === 1 ? (phase === "fill" ? rg.t("Tee betonia", "Make concrete", "Haz hormigón") : phase === "mix" || phase === "mixing" ? rg.t("Käynnistä mylly ▶", "Start the mixer ▶", "Arranca ▶") : rg.t("Kaada muottiin", "Pour into the mould", "Vierte en el molde"))
    : rg.t("Täytä auto hiekalla", "Fill the truck with sand", "Llena el camión de arena");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  if (K.level === 0) {
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
  if (K.level === 1 && (phase === "smooth" || (phase === "end" && bump.length))) { PlaySmooth(out); return <div className="screen">{out}</div>; }
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
  if (K.level === 2) PlayDig(out);
  return <div className="screen">{out}</div>;
}

setup(rg.t("Työmaa", "Building site", "La obra"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  const flat = K.level === 1 && bump.length > 0;
  return <div className={K.mode === "play" && K.level >= 1 && !flat ? "root3d" : "root"}>{body}{Sparks()}</div>;
}
