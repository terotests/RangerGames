// Kotiin: a walking navigator for a child. The phone's GPS shows where the
// child is on a map of Tampere, and a big arrow and a coloured line show the
// way to dad's or mum's home. Works without a network: the map is drawn into
// tiles and the walking network comes with the game (tools/navi/build.py),
// and the route is computed on the phone.
//
// The homes are set on the phone by an adult (hold the gear for a moment):
// stand at the door and press "Tähän", or pick the place on the map. They are
// kept in the phone's own save, never in the game's files.

import { NET } from "net";
import { MAP } from "mapinfo";

// ---- geography: metres, x east and z south of Keskustori ----
const LAT0 = 61.4994, LON0 = 23.764;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110950;
const toX = (lon: number) => (lon - LON0) * KX;
const toZ = (lat: number) => (LAT0 - lat) * KY;
const toLat = (z: number) => LAT0 - z / KY;
const toLon = (x: number) => LON0 + x / KX;

const BG = "#eeead6";
const ROUTE = "#ff3d7f";
const WALK_SPEED = 1.2; // a child's metres a second, for the minutes

type Slot = { id: string; name: string; who: string; house: string; color: string };
const SLOTS: Slot[] = [
  { id: "isa", name: "Isän luo", who: "👨", house: "🏠", color: "#3a86ff" },
  { id: "aiti", name: "Äidin luo", who: "👩", house: "🏡", color: "#ff5d8f" },
  { id: "mummola", name: "Mummolaan", who: "👵", house: "🏘️", color: "#8338ec" },
  { id: "koulu", name: "Kouluun", who: "🎒", house: "🏫", color: "#fb8500" },
  { id: "paivakoti", name: "Päiväkotiin", who: "🧸", house: "🏫", color: "#06a77d" },
];
type Place = { x: number; z: number };

// ---- the walking network ----
let N = 0, E = 0;
let NX: Float64Array, NZ: Float64Array;
let EA: Int32Array, EB: Int32Array, EC: Float64Array, EL: Float64Array, EP: Int32Array, EN: Int32Array;
let PX: Float64Array, PZ: Float64Array; // every edge's points: A, the bends, B
let ADJ0: Int32Array, ADJ: Int32Array; // node -> edges (CSR)
const CELL = 60;
let GX0 = 0, GZ0 = 0, GW = 0, GH = 0;
let GRID: number[][] = [];

function loadNet() {
  const v = NET.split(",");
  let p = 0;
  const n = () => parseInt(v[p++], 36);
  N = n();
  NX = new Float64Array(N); NZ = new Float64Array(N);
  let x = 0, z = 0;
  for (let i = 0; i < N; i++) { x += n(); z += n(); NX[i] = x / 10; NZ[i] = z / 10; }
  E = n();
  EA = new Int32Array(E); EB = new Int32Array(E); EC = new Float64Array(E); EL = new Float64Array(E);
  EP = new Int32Array(E); EN = new Int32Array(E);
  const px: number[] = [], pz: number[] = [];
  const deg = new Int32Array(N);
  for (let e = 0; e < E; e++) {
    const a = n(), b = a + n();
    EA[e] = a; EB[e] = b; EC[e] = n() / 20;
    const k = n();
    EP[e] = px.length; EN[e] = k + 2;
    let cx = NX[a] * 10, cz = NZ[a] * 10;
    px.push(NX[a]); pz.push(NZ[a]);
    for (let j = 0; j < k; j++) { cx += n(); cz += n(); px.push(cx / 10); pz.push(cz / 10); }
    px.push(NX[b]); pz.push(NZ[b]);
    let L = 0;
    for (let j = EP[e]; j < px.length - 1; j++) L += Math.hypot(px[j + 1] - px[j], pz[j + 1] - pz[j]);
    EL[e] = Math.max(L, 0.01);
    deg[a]++; deg[b]++;
  }
  PX = new Float64Array(px); PZ = new Float64Array(pz);
  ADJ0 = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) ADJ0[i + 1] = ADJ0[i] + deg[i];
  ADJ = new Int32Array(ADJ0[N]);
  const fill = new Int32Array(N);
  for (let e = 0; e < E; e++) {
    ADJ[ADJ0[EA[e]] + fill[EA[e]]++] = e;
    ADJ[ADJ0[EB[e]] + fill[EB[e]]++] = e;
  }
  // a grid of the edges for finding the nearest way
  const b = MAP.box;
  GX0 = b[0] - 200; GZ0 = b[1] - 200;
  GW = Math.ceil((b[2] - b[0] + 400) / CELL); GH = Math.ceil((b[3] - b[1] + 400) / CELL);
  GRID = new Array(GW * GH);
  for (let e = 0; e < E; e++) {
    let last = -1;
    for (let j = EP[e]; j < EP[e] + EN[e]; j++) {
      const c = cellOf(PX[j], PZ[j]);
      if (c >= 0 && c !== last) { (GRID[c] || (GRID[c] = [])).push(e); last = c; }
    }
    // long straight pieces: their middle cells too
    for (let j = EP[e]; j < EP[e] + EN[e] - 1; j++) {
      const L = Math.hypot(PX[j + 1] - PX[j], PZ[j + 1] - PZ[j]);
      for (let s = CELL / 2; s < L; s += CELL / 2) {
        const c = cellOf(PX[j] + (PX[j + 1] - PX[j]) * s / L, PZ[j] + (PZ[j + 1] - PZ[j]) * s / L);
        const g = c >= 0 ? (GRID[c] || (GRID[c] = [])) : null;
        if (g && g[g.length - 1] !== e) g.push(e);
      }
    }
  }
}

function cellOf(x: number, z: number) {
  const i = Math.floor((x - GX0) / CELL), j = Math.floor((z - GZ0) / CELL);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return -1;
  return j * GW + i;
}

type Snap = { e: number; along: number; x: number; z: number; d: number };

// the nearest point of the network to (x, z), within `max` metres
function snap(x: number, z: number, max: number): Snap | null {
  let best: Snap | null = null;
  const r = Math.ceil(max / CELL);
  const ci = Math.floor((x - GX0) / CELL), cj = Math.floor((z - GZ0) / CELL);
  const seen: { [k: number]: boolean } = {};
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const g = GRID[j * GW + i];
      if (!g) continue;
      for (let k = 0; k < g.length; k++) {
        const e = g[k];
        if (seen[e]) continue;
        seen[e] = true;
        let along = 0;
        for (let q = EP[e]; q < EP[e] + EN[e] - 1; q++) {
          const ax = PX[q], az = PZ[q], vx = PX[q + 1] - ax, vz = PZ[q + 1] - az;
          const L2 = vx * vx + vz * vz, L = Math.sqrt(L2);
          let t = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const sx = ax + vx * t, sz = az + vz * t;
          const d = Math.hypot(x - sx, z - sz);
          if (d <= max && (!best || d < best.d)) best = { e: e, along: along + L * t, x: sx, z: sz, d: d };
          along += L;
        }
      }
    }
  }
  return best;
}

// ---- routes: every node's way home, by one search from the home ----
type Tree = { dist: Float64Array; next: Int32Array; home: Snap; place: Place };
const trees: { [id: string]: Tree } = {};

function heapPush(hk: number[], hv: number[], k: number, v: number) {
  let i = hk.length;
  hk.push(k); hv.push(v);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hk[p] <= k) break;
    hk[i] = hk[p]; hv[i] = hv[p]; i = p;
  }
  hk[i] = k; hv[i] = v;
}

function heapPop(hk: number[], hv: number[]) {
  const top = hv[0];
  const lk: number = hk.pop(), lv: number = hv.pop();
  const n = hk.length;
  if (n) {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      let c = l;
      if (l + 1 < n && hk[l + 1] < hk[l]) c = l + 1;
      if (hk[c] >= lk) break;
      hk[i] = hk[c]; hv[i] = hv[c]; i = c;
    }
    hk[i] = lk; hv[i] = lv;
  }
  return top;
}

function buildTree(place: Place): Tree | null {
  const home = snap(place.x, place.z, 400);
  if (!home) return null;
  const dist = new Float64Array(N).fill(1e18);
  const next = new Int32Array(N).fill(-1);
  const hk: number[] = [], hv: number[] = [];
  const e0 = home.e;
  dist[EA[e0]] = home.along * EC[e0]; next[EA[e0]] = -2; // -2: the home's own way
  dist[EB[e0]] = (EL[e0] - home.along) * EC[e0]; next[EB[e0]] = -2;
  heapPush(hk, hv, dist[EA[e0]], EA[e0]);
  heapPush(hk, hv, dist[EB[e0]], EB[e0]);
  while (hk.length) {
    const d = hk[0];
    const u = heapPop(hk, hv);
    if (d > dist[u]) continue;
    for (let k = ADJ0[u]; k < ADJ0[u + 1]; k++) {
      const e = ADJ[k];
      const v = EA[e] === u ? EB[e] : EA[e];
      const nd = d + EL[e] * EC[e];
      if (nd < dist[v]) { dist[v] = nd; next[v] = e; heapPush(hk, hv, nd, v); }
    }
  }
  return { dist: dist, next: next, home: home, place: place };
}

// the points of edge e from `from` metres to `to` metres along it (either way)
function edgePart(e: number, from: number, to: number, out: number[]) {
  const s = EP[e], n = EN[e];
  const cum: number[] = [0];
  for (let q = s; q < s + n - 1; q++) cum.push(cum[cum.length - 1] + Math.hypot(PX[q + 1] - PX[q], PZ[q + 1] - PZ[q]));
  const at = (m: number) => {
    let q = 0;
    while (q < n - 2 && cum[q + 1] < m) q++;
    const L = cum[q + 1] - cum[q];
    const t = L > 0 ? (m - cum[q]) / L : 0;
    return [PX[s + q] + (PX[s + q + 1] - PX[s + q]) * t, PZ[s + q] + (PZ[s + q + 1] - PZ[s + q]) * t];
  };
  const a = at(from);
  out.push(a[0], a[1]);
  if (from < to) { for (let q = 1; q < n - 1; q++) if (cum[q] > from && cum[q] < to) out.push(PX[s + q], PZ[s + q]); }
  else { for (let q = n - 2; q >= 1; q--) if (cum[q] < from && cum[q] > to) out.push(PX[s + q], PZ[s + q]); }
  const b = at(to);
  out.push(b[0], b[1]);
}

// the way from (x, z) home as points [x, z, x, z, ...], or null
function routeFrom(tree: Tree, me: Snap, x: number, z: number): number[] | null {
  const pts: number[] = [x, z];
  const e = me.e, h = tree.home;
  if (e === h.e) {
    edgePart(e, me.along, h.along, pts);
  } else {
    const viaA = me.along * EC[e] + tree.dist[EA[e]];
    const viaB = (EL[e] - me.along) * EC[e] + tree.dist[EB[e]];
    if (Math.min(viaA, viaB) >= 1e17) return null;
    let u = viaA <= viaB ? EA[e] : EB[e];
    edgePart(e, me.along, u === EA[e] ? 0 : EL[e], pts);
    let guard = 0;
    while (tree.next[u] >= 0 && guard++ < 100000) {
      const f = tree.next[u];
      const v = EA[f] === u ? EB[f] : EA[f];
      edgePart(f, u === EA[f] ? 0 : EL[f], u === EA[f] ? EL[f] : 0, pts);
      u = v;
    }
    edgePart(h.e, u === EA[h.e] ? 0 : EL[h.e], h.along, pts);
  }
  pts.push(tree.place.x, tree.place.z);
  // drop repeated points
  const out: number[] = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    if (Math.abs(pts[i] - out[out.length - 2]) + Math.abs(pts[i + 1] - out[out.length - 1]) > 0.05) out.push(pts[i], pts[i + 1]);
  }
  return out;
}

function lengthOf(p: number[]) {
  let L = 0;
  for (let i = 0; i + 3 < p.length; i += 2) L += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
  return L;
}

// the point `m` metres along the route
function pointAlong(p: number[], m: number): number[] {
  for (let i = 0; i + 3 < p.length; i += 2) {
    const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
    if (m <= L) { const t = L > 0 ? m / L : 0; return [p[i] + (p[i + 2] - p[i]) * t, p[i + 1] + (p[i + 3] - p[i + 1]) * t]; }
    m -= L;
  }
  return [p[p.length - 2], p[p.length - 1]];
}

// degrees from north (clockwise) of the way from a to b
const bearing = (ax: number, az: number, bx: number, bz: number) => {
  let d = (Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
};
const angleDiff = (a: number, b: number) => { let d = (b - a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

// the next turn on the route: { at: metres ahead, dir: -1 left / 1 right }
function nextTurn(p: number[]): { at: number; dir: number; deg: number } | null {
  const L = lengthOf(p);
  let along = 0;
  for (let i = 2; i + 3 < p.length; i += 2) {
    along += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (along < 6 || along > 70) { if (along > 70) break; continue; }
    if (L - along < 12) break;
    const a = pointAlong(p, Math.max(0, along - 10)), b = pointAlong(p, along + 10);
    const din = bearing(a[0], a[1], p[i], p[i + 1]), dout = bearing(p[i], p[i + 1], b[0], b[1]);
    const d = angleDiff(din, dout);
    if (Math.abs(d) > 40) return { at: along, dir: d < 0 ? -1 : 1, deg: d };
  }
  return null;
}

// ---- state ----
type Mode = "loading" | "menu" | "computing" | "nav" | "arrived" | "settings" | "pick";
let mode: Mode = "loading";
let loadClock = 0;
let places: { [id: string]: Place } = {};
let target = "";            // the slot we are walking to
let pickSlot = "";
let demo = false;           // test mode: a pretend child walks the route
let t = 0;

// the child
let fix: { x: number; z: number; acc: number; at: number } | null = null;
let gpsError = "";
let heading = -1;           // compass, degrees from north, -1 = none
let moveBearing = -1;       // the GPS's own course while walking
let lastFixAt = -100;

// the map view: centre in metres, pixels a metre
let cx = 0, cz = 0, zoom = 0.5;
let follow = true;
let drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;

// the route now
let route: number[] | null = null;
let routeLen = 0;
let offNet = 0;             // metres from the nearest way
let turn: { at: number; dir: number; deg: number } | null = null;
let turnBuzzed = -1;        // where along the route the last turn alert was
let lastBuzzPos: number[] = [0, 0];
let startLen = 0;
let arrivedClock = 0;
let gearHold = -1;
let demoAlong = 0;

const save = () => rg.save("places", places);

// Optional default places from places.local.js beside this file (git-ignored,
// so addresses never go to GitHub): export const PLACES = { isa: { lat, lon }, ... }.
// The phone's own saved places win.
function localDefaults(): { [id: string]: Place } {
  const out: { [id: string]: Place } = {};
  try {
    const m = __cerxesImport("places.local");
    const p = m && m.PLACES;
    for (const k in p) if (p[k] && typeof p[k].lat === "number") out[k] = { x: toX(p[k].lon), z: toZ(p[k].lat) };
  } catch (e) { }
  return out;
}

function init() {
  places = rg.load("places", null) || localDefaults();
  demo = !!rg.load("demo", false);
  rg.closeButton = "right";
}

function placeName(id: string) { for (const s of SLOTS) if (s.id === id) return s; return SLOTS[0]; }

// ---- sensors ----
function onLocation(f: any) {
  if (demo || !f) return;
  const x = toX(f.lon), z = toZ(f.lat);
  fix = { x: x, z: z, acc: f.accuracy || 30, at: t };
  lastFixAt = t;
  gpsError = "";
  if (f.bearing >= 0 && f.speed > 0.6) moveBearing = f.bearing;
  if (mode === "nav") update();
}

function onHeading(deg: number) {
  if (typeof deg === "number") heading = deg;
}

function onSensor(name: string, data: any) {
  if (name === "error" && data && data.sensor === "location") gpsError = data.reason || "error";
}

function sensorsOn() { rg.sensor("location", true); rg.sensor("heading", true); }

// ---- walking ----
function go(id: string) {
  target = id;
  route = null; turn = null; turnBuzzed = -1; startLen = 0;
  follow = true; zoom = 0.5;
  rg.sound("click");
  if (!trees[id]) { mode = "computing"; loadClock = 0; }
  else startNav();
}

function startNav() {
  mode = "nav";
  if (demo) {
    // the pretend child starts at Keskustori (a tap on the map moves it)
    if (!fix) fix = { x: 0, z: 0, acc: 5, at: t };
    demoAlong = 0;
  }
  update();
}

// a new position: the route again, turns, arrival
function update() {
  const tree = trees[target];
  if (!tree || !fix) return;
  const me = snap(fix.x, fix.z, 600);
  if (!me) { route = null; offNet = 9999; return; }
  offNet = me.d;
  route = routeFrom(tree, me, fix.x, fix.z);
  if (!route) return;
  routeLen = lengthOf(route);
  if (startLen === 0 || routeLen > startLen) startLen = routeLen;
  turn = nextTurn(route);
  // a buzz and a tick when a turn is near (once a turn)
  if (turn && turn.at < 18) {
    const p = pointAlong(route, turn.at);
    if (Math.hypot(p[0] - lastBuzzPos[0], p[1] - lastBuzzPos[1]) > 15) {
      lastBuzzPos = p;
      rg.vibrate(turn.dir < 0 ? [80, 80, 80] : [80, 80, 80, 80, 80]);
      rg.sound("tick");
    }
  }
  const home = tree.place;
  if (Math.hypot(fix.x - home.x, fix.z - home.z) < 18 || routeLen < 12) {
    mode = "arrived"; arrivedClock = 0;
    rg.celebrate(width / 2, height * 0.4, { big: true });
    rg.vibrate([100, 60, 100, 60, 300]);
  }
}

function tick(dt: number, input: any) {
  t += dt;
  dragMap(input);
  if (gearHold >= 0 && !input.pointer.down) gearHold = -1;
  if (mode === "loading") {
    loadClock += dt;
    // one frame on the screen first, then the work
    if (loadClock > 0.05) {
      loadNet();
      mode = "menu";
      sensorsOn();
    }
    return;
  }
  if (mode === "computing") {
    loadClock += dt;
    if (loadClock > 0.05) {
      const p = places[target];
      const tr = p ? buildTree(p) : null;
      if (tr) { trees[target] = tr; startNav(); }
      else mode = "menu";
    }
    return;
  }
  if (mode === "arrived") arrivedClock += dt;
  if (mode === "nav" && demo && route && fix) {
    // the pretend child walks 3 m/s along the route
    const k = input.keys;
    const step = 3 * dt;
    if (k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight) {
      fix.x += (k.ArrowRight ? 1 : 0) * step * 2 - (k.ArrowLeft ? 1 : 0) * step * 2;
      fix.z += (k.ArrowDown ? 1 : 0) * step * 2 - (k.ArrowUp ? 1 : 0) * step * 2;
    } else if (!drag) {
      const p = pointAlong(route, Math.min(step + 0.5, routeLen));
      moveBearing = bearing(fix.x, fix.z, p[0], p[1]);
      const q = pointAlong(route, Math.min(step, routeLen));
      fix.x = q[0]; fix.z = q[1];
    }
    fix.acc = 5; fix.at = t; lastFixAt = t;
    update();
  }
  if ((mode === "nav" || mode === "arrived") && follow && fix) {
    cx += (fix.x - cx) * Math.min(1, dt * 4);
    cz += (fix.z - cz) * Math.min(1, dt * 4);
  }
  if (gearHold >= 0) {
    gearHold += dt;
    if (gearHold > 1.2) { gearHold = -1; mode = "settings"; rg.sound("pop"); rg.vibrate(30); }
  }
}

// ---- map drawing ----
const sx = (x: number) => width / 2 + (x - cx) * zoom;
const sy = (z: number) => mapH() / 2 + (z - cz) * zoom;
let mapTop = 0;
const mapH = () => height;

function tiles() {
  const lv = zoom < 0.3 ? "o" : "d";
  const mpp = MAP.levels[lv];
  const span = MAP.tile * mpp;
  const have: { [k: string]: boolean } = {};
  for (const k of MAP.have[lv]) have[k] = true;
  const x0 = cx - width / 2 / zoom, x1 = cx + width / 2 / zoom;
  const z0 = cz - mapH() / 2 / zoom, z1 = cz + mapH() / 2 / zoom;
  const out: any[] = [];
  const i0 = Math.floor((x0 - MAP.box[0]) / span), i1 = Math.floor((x1 - MAP.box[0]) / span);
  const j0 = Math.floor((z0 - MAP.box[1]) / span), j1 = Math.floor((z1 - MAP.box[1]) / span);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const key = i + "_" + j;
      if (!have[key]) continue;
      const left = Math.floor(sx(MAP.box[0] + i * span)), top = Math.floor(sy(MAP.box[1] + j * span));
      const size = Math.ceil(span * zoom) + 1;
      out.push(<img key={lv + key} src={rg.asset("tiles/" + lv + "/" + key + ".webp")}
        style={{ position: "absolute", left: left, top: top, width: size, height: size }} />);
    }
  }
  return out;
}

function pathD(p: number[]) {
  const parts: string[] = [];
  let last = "";
  for (let i = 0; i + 1 < p.length; i += 2) {
    const s = Math.round(sx(p[i])) + " " + Math.round(sy(p[i + 1]));
    if (s === last) continue;
    parts.push((parts.length ? "L " : "M ") + s);
    last = s;
  }
  return parts.join(" ");
}

function routeLine() {
  if (!route || route.length < 4) return null;
  const d = pathD(route);
  const full = { position: "absolute", left: 0, top: 0, width: width, height: mapH() };
  const vb = "0 0 " + width + " " + mapH();
  return [
    <path d={d} stroke="#ffffff" strokeWidth={String(Math.max(9, 14 * zoom * 2))} fill="none" viewBox={vb} style={full} />,
    <path d={d} stroke={ROUTE} strokeWidth={String(Math.max(5, 8 * zoom * 2))} fill="none" viewBox={vb} style={full} />,
  ];
}

// each home: the house, and beside it the person who lives there (mum, dad, ...)
// in a round badge of the slot's colour, so a child sees whose home it is
function homeMarkers() {
  const out: any[] = [];
  for (const s of SLOTS) {
    const p = places[s.id];
    if (!p) continue;
    const isTarget = s.id === target && (mode === "nav" || mode === "arrived");
    if (mode === "nav" && !isTarget && s.id !== "isa" && s.id !== "aiti") continue;
    const k = isTarget ? 1.25 : mode === "nav" ? 0.8 : 1;
    const X = sx(p.x), Y = sy(p.z);
    const B = 46 * k;
    out.push(<div style={{ position: "absolute", left: X - 22 * k, top: Y - 50 * k, width: 44 * k, height: 50 * k, alignItems: "center", justifyContent: "flex-end" }}>
      <div style={{ fontSize: 38 * k }}>{s.house}</div>
    </div>);
    out.push(<div style={{ position: "absolute", left: X + 14 * k, top: Y - 50 * k - B * 0.55, width: B, height: B, borderRadius: B / 2, backgroundColor: s.color,
      borderWidth: 3, borderColor: "#ffffff", alignItems: "center", justifyContent: "center", shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 2, shadowRadius: 3 }}>
      <div style={{ fontSize: 30 * k }}>{s.who}</div>
    </div>);
  }
  return out;
}

function childMarker() {
  if (!fix) return null;
  const X = sx(fix.x), Y = sy(fix.z);
  const acc = Math.min(120, fix.acc) * zoom;
  const out: any[] = [];
  if (acc > 14) out.push(<div style={{ position: "absolute", left: X - acc, top: Y - acc, width: acc * 2, height: acc * 2, borderRadius: acc, backgroundColor: "rgba(58,134,255,0.15)", borderWidth: 1, borderColor: "rgba(58,134,255,0.4)" }} />);
  const dir = heading >= 0 ? heading : moveBearing;
  if (dir >= 0) {
    // a beam the way the child faces
    out.push(<div style={{ position: "absolute", left: X - 40, top: Y - 40, width: 80, height: 80, transform: "rotate(" + Math.round(dir) + "deg)" }}>
      <path d="M 40 40 L 22 2 Q 40 -4 58 2 Z" fill="rgba(58,134,255,0.35)" viewBox="0 0 80 80" style={{ position: "absolute", left: 0, top: 0, width: 80, height: 80 }} />
    </div>);
  }
  const stale = t - lastFixAt > 15;
  out.push(<div style={{ position: "absolute", left: X - 15, top: Y - 15, width: 30, height: 30, borderRadius: 15, backgroundColor: stale ? "#9aa5b1" : "#3a86ff", borderWidth: 4, borderColor: "#ffffff", shadowColor: "rgba(0,0,0,0.35)", shadowRadius: 4 }} />);
  out.push(<div style={{ position: "absolute", left: X - 14, top: Y - 48, width: 28, height: 30, alignItems: "center", fontSize: 24 }}>🧒</div>);
  return out;
}

function mapLayer(extra: any[]) {
  return <div style={{ position: "absolute", left: 0, top: 0, width: width, height: height, backgroundColor: BG }}>
    {tiles()}
    {routeLine()}
    {homeMarkers()}
    {childMarker()}
    {extra}
    <div style={{ position: "absolute", left: 14, top: height - 96, fontSize: 10, color: "rgba(60,60,60,0.8)" }}>© OpenStreetMap, Tampereen kaupunki</div>
  </div>;
}

function onPointerDown(x: number, y: number) {
  if (mode === "nav" || mode === "pick") drag = { x: x, y: y, cx: cx, cz: cz, moved: false };
}

function onPointerUp(x: number, y: number) {
  // test mode: a tap on the map moves the pretend child there
  if (drag && !drag.moved && demo && mode === "nav" && y > 130 && y < height - 90 && x < width - 76) {
    fix = { x: cx + (x - width / 2) / zoom, z: cz + (y - mapH() / 2) / zoom, acc: 5, at: t };
    update();
  }
  drag = null;
}

// dragging the map: the pointer state, every frame
function dragMap(input: any) {
  if (!drag) return;
  const p = input.pointer;
  if (!p.down) { drag = null; return; }
  const dx = p.x - drag.x, dy = p.y - drag.y;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
  if (drag.moved) {
    cx = drag.cx - dx / zoom; cz = drag.cz - dy / zoom;
    if (mode === "nav") follow = false;
  }
}

// ---- views ----
function btn(label: any, color: string, onClick: () => void, style?: any) {
  const s: any = { height: 58, borderRadius: 29, backgroundColor: color, alignItems: "center", justifyContent: "center",
    paddingLeft: 18, paddingRight: 18, color: "#ffffff", fontSize: 20, fontWeight: "700",
    shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 4, shadowRadius: 0 };
  if (style) for (const k in style) s[k] = style[k];
  return <div style={s} onClick={onClick}>{label}</div>;
}

function roundBtn(label: string, left: number, top: number, onClick: () => void, size?: number) {
  const z = size || 56;
  return <div style={{ position: "absolute", left: left, top: top, width: z, height: z, borderRadius: z / 2, backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center", fontSize: z * 0.48, shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 3, shadowRadius: 3 }}
    onClick={onClick}>{label}</div>;
}

function gpsBadge() {
  let txt = "🛰️ Etsitään…", col = "#fb8500";
  if (demo) { txt = "🧪 Testi"; col = "#8338ec"; }
  else if (gpsError === "permission") { txt = "📍 Ei lupaa"; col = "#d62828"; }
  else if (gpsError === "gps-off") { txt = "📍 GPS pois"; col = "#d62828"; }
  else if (fix && t - lastFixAt < 15) { txt = fix.acc < 25 ? "🛰️ OK" : "🛰️ ±" + Math.round(fix.acc) + " m"; col = fix.acc < 25 ? "#2a9d8f" : "#e9c46a"; }
  return <div style={{ height: 30, borderRadius: 15, paddingLeft: 12, paddingRight: 12, backgroundColor: col, alignItems: "center", justifyContent: "center", color: "#ffffff", fontSize: 15, fontWeight: "700" }}>{txt}</div>;
}

function viewLoading() {
  return <div style={{ width: width, height: height, backgroundColor: "#3a86ff", alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontSize: 80 }}>🗺️</div>
    <div style={{ fontSize: 26, color: "#ffffff", fontWeight: "700", marginTop: 12 }}>Kotiin</div>
    <div style={{ fontSize: 16, color: "#dbe7ff", marginTop: 8 }}>Ladataan karttaa…</div>
  </div>;
}

function viewMenu() {
  const set = SLOTS.filter((s) => !!places[s.id]);
  const cards = set.map((s) => (
    <div style={{ width: 300, height: 80, borderRadius: 24, backgroundColor: s.color, marginTop: 12, flexDirection: "row",
      paddingLeft: 16, paddingTop: 12, shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 5, shadowRadius: 0 }} onClick={() => go(s.id)}>
      <div style={{ fontSize: 44 }}>{s.house}</div>
      <div style={{ fontSize: 36, marginLeft: 4 }}>{s.who}</div>
      <div style={{ fontSize: 23, fontWeight: "700", color: "#ffffff", marginLeft: 12, marginTop: 12 }}>{s.name}</div>
    </div>
  ));
  const holding = gearHold >= 0 ? Math.min(1, gearHold / 1.2) : 0;
  return <div style={{ width: width, height: height, backgroundColor: "#bde0fe", alignItems: "center" }}>
    <div style={{ marginTop: 40, fontSize: 52 }}>🧒🗺️</div>
    <div style={{ fontSize: 30, fontWeight: "700", color: "#1d3557", marginTop: 6 }}>Minne mennään?</div>
    <div style={{ marginTop: 8 }}>{gpsBadge()}</div>
    {cards}
    {set.length === 0 ? <div style={{ width: 290, marginTop: 30, padding: 16, borderRadius: 18, backgroundColor: "#ffffff", fontSize: 16, color: "#1d3557" }}>
      Aikuinen: pidä hammasratasta alhaalla painettuna ja aseta kotien paikat.
    </div> : null}
    <div style={{ position: "absolute", left: 16, top: height - 72, width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255," + (0.6 + holding * 0.4) + ")",
      alignItems: "center", justifyContent: "center", fontSize: 28 + holding * 10 }}
      onPointerDown={() => { gearHold = 0; }} onPointerUp={() => { gearHold = -1; }}>⚙️</div>
  </div>;
}

function viewComputing() {
  const s = placeName(target);
  return <div style={{ width: width, height: height, backgroundColor: s.color, alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontSize: 80 }}>{s.house}</div>
    <div style={{ fontSize: 22, color: "#ffffff", fontWeight: "700", marginTop: 14 }}>Etsitään reittiä…</div>
  </div>;
}

function fmtDist(m: number) {
  if (m >= 1000) return (Math.round(m / 100) / 10).toString().replace(".", ",") + " km";
  if (m >= 100) return Math.round(m / 10) * 10 + " m";
  return Math.round(m) + " m";
}

// the big arrow: which way to walk, turned by the compass (or the walking course)
function bigArrow() {
  if (!route || !fix) return null;
  const ahead = pointAlong(route, Math.min(routeLen, 25));
  const want = bearing(fix.x, fix.z, ahead[0], ahead[1]);
  const facing = heading >= 0 ? heading : moveBearing;
  const rel = facing >= 0 ? angleDiff(facing, want) : want; // without a direction: north up, like the map
  const s = placeName(target);
  return <div style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: s.color, alignItems: "center", justifyContent: "center",
    borderWidth: 4, borderColor: "#ffffff", shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 3, shadowRadius: 0 }}>
    <div style={{ width: 80, height: 80, transform: "rotate(" + Math.round(rel) + "deg)" }}>
      <path d="M 40 6 L 70 44 L 51 44 L 51 74 L 29 74 L 29 44 L 10 44 Z" fill="#ffffff" viewBox="0 0 80 80"
        style={{ position: "absolute", left: 0, top: 0, width: 80, height: 80 }} />
    </div>
  </div>;
}

function viewNav() {
  const s = placeName(target);
  const extra: any[] = [];
  const W = width;
  // the top: arrow, distance, turn
  let msg = "";
  if (!fix) msg = gpsError === "permission" ? "Salli sijainti asetuksista" : gpsError === "gps-off" ? "Laita GPS päälle" : "Mene ulos, etsitään satelliitteja 🛰️";
  else if (offNet > 9000) msg = "Olet kartan ulkopuolella";
  else if (offNet > 45) msg = "Kävele lähimmälle tielle";
  const progress = startLen > 0 && route ? rg.clamp(1 - routeLen / startLen, 0, 1) : 0;
  const mins = route ? Math.max(1, Math.round(routeLen / WALK_SPEED / 60)) : 0;
  extra.push(<div style={{ position: "absolute", left: 10, top: 10, width: W - 76, flexDirection: "row", alignItems: "center", padding: 8, borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.94)", shadowColor: "rgba(0,0,0,0.25)", shadowOffsetY: 3, shadowRadius: 4 }}>
    {bigArrow()}
    <div style={{ marginLeft: 10, width: W - 76 - 16 - 96 - 14 }}>
      {route && fix ? <div style={{ fontSize: 34, fontWeight: "700", color: "#1d3557" }}>{fmtDist(routeLen)}</div> : null}
      {route && fix ? <div style={{ fontSize: 16, color: "#457b9d" }}>{"🚶 noin " + mins + " min"}</div> : null}
      {turn && turn.at < 40 && !msg ? <div style={{ fontSize: 18, fontWeight: "700", color: ROUTE, marginTop: 2 }}>{(turn.dir < 0 ? "⬅️ Käänny vasemmalle" : "➡️ Käänny oikealle")}</div> : null}
      {msg ? <div style={{ fontSize: 17, fontWeight: "700", color: "#e76f51", marginTop: 2 }}>{msg}</div> : null}
    </div>
  </div>);
  // the bottom: how far along, child to home
  const barW = W - 150;
  extra.push(<div style={{ position: "absolute", left: 10, top: height - 78, width: W - 20, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.94)",
    flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 12 }}>
    <div style={{ fontSize: 30 }}>🧒</div>
    <div style={{ width: barW, height: 16, borderRadius: 8, backgroundColor: "#dde5ee", marginLeft: 8, marginRight: 8 }}>
      <div style={{ width: Math.max(16, barW * progress), height: 16, borderRadius: 8, backgroundColor: s.color }} />
    </div>
    <div style={{ fontSize: 34 }}>{s.house}</div>
  </div>);
  // buttons: zoom, back to me
  extra.push(roundBtn("➕", W - 62, height - 220, () => { zoom = Math.min(2, zoom * 1.6); rg.sound("click"); }, 50));
  extra.push(roundBtn("➖", W - 62, height - 160, () => { zoom = Math.max(0.12, zoom / 1.6); rg.sound("click"); }, 50));
  if (!follow) extra.push(roundBtn("📍", W - 62, height - 280, () => { follow = true; zoom = 0.5; rg.sound("click"); }, 50));
  return mapLayer(extra);
}

function viewArrived() {
  const s = placeName(target);
  const bob = Math.sin(arrivedClock * 4) * 8;
  return <div style={{ width: width, height: height, backgroundColor: s.color, alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontSize: 110, marginTop: bob }}>{s.house}</div>
    <div style={{ fontSize: 70 }}>{s.who}</div>
    <div style={{ fontSize: 40, color: "#ffffff", fontWeight: "700", marginTop: 10 }}>Perillä!</div>
    <div style={{ fontSize: 22, color: "#ffffff", marginTop: 6 }}>Hienosti kävelty ⭐</div>
    {btn("Valmis", "#06d6a0", () => { mode = "menu"; rg.sound("click"); }, { marginTop: 40, width: 200 })}
  </div>;
}

function viewSettings() {
  const rows = SLOTS.map((s) => {
    const p = places[s.id];
    const gpsOk = !demo && fix && t - lastFixAt < 15 && fix.acc < 40;
    return <div style={{ width: 330, marginTop: 10, padding: 10, borderRadius: 18, backgroundColor: "#ffffff" }}>
      <div style={{ flexDirection: "row", alignItems: "center" }}>
        <div style={{ fontSize: 30 }}>{s.house + s.who}</div>
        <div style={{ fontSize: 19, fontWeight: "700", color: "#1d3557", marginLeft: 8 }}>{s.name}</div>
        <div style={{ fontSize: 14, color: p ? "#2a9d8f" : "#999999", marginLeft: 8 }}>{p ? "asetettu" : "ei asetettu"}</div>
      </div>
      <div style={{ flexDirection: "row", marginTop: 8 }}>
        {btn("📍 Tähän", gpsOk ? "#2a9d8f" : "#b0bec5", () => {
          if (!gpsOk || !fix) { rg.sound("hit"); return; }
          places[s.id] = { x: fix.x, z: fix.z }; delete trees[s.id]; save(); rg.sound("coin");
        }, { height: 44, fontSize: 16, paddingLeft: 12, paddingRight: 12 })}
        {btn("🗺️ Kartalta", "#3a86ff", () => {
          pickSlot = s.id; mode = "pick";
          if (p) { cx = p.x; cz = p.z; } else if (fix) { cx = fix.x; cz = fix.z; }
          zoom = 0.5; rg.sound("click");
        }, { height: 44, fontSize: 16, paddingLeft: 12, paddingRight: 12, marginLeft: 8 })}
        {p ? btn("🗑", "#e76f51", () => { delete places[s.id]; delete trees[s.id]; save(); rg.sound("pop"); },
          { height: 44, fontSize: 16, paddingLeft: 12, paddingRight: 12, marginLeft: 8 }) : null}
      </div>
    </div>;
  });
  return <div style={{ width: width, height: height, backgroundColor: "#e9eef5", alignItems: "center" }}>
    <div style={{ fontSize: 24, fontWeight: "700", color: "#1d3557", marginTop: 18 }}>⚙️ Aikuisille</div>
    <div style={{ marginTop: 6 }}>{gpsBadge()}</div>
    {rows}
    <div style={{ flexDirection: "row", marginTop: 14 }}>
      {btn(demo ? "🧪 Testitila: päällä" : "🧪 Testitila: pois", demo ? "#8338ec" : "#90a4ae", () => {
        demo = !demo; rg.save("demo", demo); fix = null; rg.sound("click");
      }, { height: 46, fontSize: 16 })}
      {btn("Valmis", "#06d6a0", () => { mode = "menu"; rg.sound("click"); }, { height: 46, fontSize: 16, marginLeft: 10 })}
    </div>
    <div style={{ width: 330, marginTop: 10, fontSize: 13, color: "#607d8b" }}>
      Paikat tallentuvat vain tähän puhelimeen. Testitilassa pieni kävelijä lähtee kartan keskeltä ja kävelee reitin itse.
    </div>
  </div>;
}

function viewPick() {
  const s = placeName(pickSlot);
  const extra: any[] = [];
  // the cross-hair in the middle
  extra.push(<div style={{ position: "absolute", left: width / 2 - 30, top: height / 2 - 62, width: 60, height: 62, alignItems: "center", justifyContent: "flex-end" }}>
    <div style={{ fontSize: 44 }}>{s.house}</div>
  </div>);
  extra.push(<div style={{ position: "absolute", left: width / 2 - 6, top: height / 2 - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: ROUTE, borderWidth: 2, borderColor: "#ffffff" }} />);
  extra.push(<div style={{ position: "absolute", left: 10, top: 10, width: width - 76, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.94)" }}>
    <div style={{ fontSize: 17, fontWeight: "700", color: "#1d3557" }}>{"Siirrä kartta niin, että " + s.house + " on kotiovella"}</div>
  </div>);
  extra.push(roundBtn("➕", width - 66, height / 2 - 70, () => { zoom = Math.min(3, zoom * 1.6); }));
  extra.push(roundBtn("➖", width - 66, height / 2 - 6, () => { zoom = Math.max(0.12, zoom / 1.6); }));
  if (fix) extra.push(roundBtn("📍", width - 66, height / 2 + 58, () => { if (fix) { cx = fix.x; cz = fix.z; } }));
  extra.push(<div style={{ position: "absolute", left: 20, top: height - 80, width: width - 40, flexDirection: "row", justifyContent: "space-between" }}>
    {btn("✕ Peru", "#90a4ae", () => { mode = "settings"; rg.sound("click"); }, { width: 130 })}
    {btn("✔ Tallenna", "#2a9d8f", () => {
      places[pickSlot] = { x: cx, z: cz }; delete trees[pickSlot]; save(); mode = "settings"; rg.sound("coin");
    }, { width: 170 })}
  </div>);
  return mapLayer(extra);
}

function view() {
  if (mode === "loading") return viewLoading();
  if (mode === "computing") return viewComputing();
  if (mode === "nav") return viewNav();
  if (mode === "arrived") return viewArrived();
  if (mode === "settings") return viewSettings();
  if (mode === "pick") return viewPick();
  return viewMenu();
}

function onBack() {
  if (mode === "nav" || mode === "arrived") { mode = "menu"; return; }
  if (mode === "pick") { mode = "settings"; return; }
  if (mode === "settings") { mode = "menu"; return; }
  rg.exit();
}

function onClose() {
  if (mode === "nav" || mode === "pick" || mode === "settings" || mode === "arrived") { onBack(); return false; }
  return true;
}

// the test mode's pretend child starts where the map is
function onKeyDown(k: string) {
  if (mode === "nav" && demo && k === "d") { if (fix) { fix.x = cx; fix.z = cz; } }
}
