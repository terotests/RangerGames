// Talot: build houses from ready-made parts, in 3D, for 5-year-olds.
//   1–6  a picture card of a house (log cabin, red wooden house, block of
//        flats, castle, igloo, treehouse): build it part by part. Each part
//        (base, walls, door, windows, roof, last touch) is picked from 2–4
//        tiles (3 adaptive steps); the part drops onto the house.
//   7    Oma kylä: pick a spot in a 3D village, build a house there with every
//        part and wall paint (up to 6 houses, tap 🔨 to change one); little
//        people move into each new house and walk between the houses
//   8    Oma katu: every house built so far stands on the child's street
// The house can be turned with a finger. Everything is spoken; a wrong tile
// says "look at the picture", the second one shows the right part.
import { K, Level, setup, step, start, win, miss, update, toMenu, Header, Menu, Sparks, Poly, Box, PointAt } from "lib/kit";
import { Spec, CATS, OPTIONS, HOUSES, PAINTS, empty, copy, get, set, dims, tallness, objects, front, extent, visible, doorFront, Obj, Pic } from "lib/house";

const LETTER: any = { base: "b", walls: "w", door: "d", win: "i", roof: "r", top: "t" };
const NAMES: any = {
  mokki: rg.t("Hirsimökki", "Log cabin", "Cabaña"), punainen: rg.t("Punainen talo", "Red house", "Casa roja"),
  kerros: rg.t("Kerrostalo", "Flats", "Edificio"), linna: rg.t("Linna", "Castle", "Castillo"),
  iglu: rg.t("Iglu", "Igloo", "Iglú"), puumaja: rg.t("Puumaja", "Treehouse", "Casa del árbol"),
};
const ASK: any = {
  base: rg.t("Mikä pohja?", "Which base?", "¿Qué base?"), walls: rg.t("Mitkä seinät?", "Which walls?", "¿Qué paredes?"),
  door: rg.t("Mikä ovi?", "Which door?", "¿Qué puerta?"), win: rg.t("Mitkä ikkunat?", "Which windows?", "¿Qué ventanas?"),
  roof: rg.t("Mikä katto?", "Which roof?", "¿Qué tejado?"), top: rg.t("Mitä vielä?", "What else?", "¿Qué más?"),
};
const FREE_CATS = ["base", "walls", "paint", "door", "win", "roof", "top"];
const FREE_START: Spec = { base: "kivi", walls: "punainen", door: "", win: "", roof: "", top: "", paint: "" };
const FREE_LV = 6, STREET_LV = 7, MAX_STREET = 8;

// ---- fitting a picture of a house in a box ---------------------------------------
function draw(p: Pic[]): any[] { return p.map((q) => q.e ? Poly(q.pts, q.c, q.e, 1.5) : Poly(q.pts, q.c)); }
// the house's picture (the parts in `cats`) in the box x, y, w, h; `crop`: leave out
// what is under the walls and above the roof (for a door or windows tile)
function fit(s: Spec, cats: string[], x: number, y: number, w: number, h: number, crop: any, ghost: boolean): any[] {
  const e = extent(s), m = dims(s);
  let b = 0, t = e[2] + 0.15, l = e[0], r = e[1];
  if (crop === true) { b = m.y0 - 0.1; t = m.y0 + m.h + 0.25; l = -m.w / 2 - 0.4; r = m.w / 2 + 0.4; }
  if (crop === "base") t = Math.max(m.y0 + m.h * 0.7, s.base === "puu" ? 4.6 : 0);
  const u = Math.min(w / (r - l), h / (t - b));
  const cx = x + w / 2 - (l + r) / 2 * u, by = y + h / 2 + (t - b) / 2 * u + b * u;
  return draw(front(s, cats, cx, by, u, ghost));
}

// ---- levels (the menu tiles) -----------------------------------------------------
function housePic(i: number) { return (x: number, y: number, s: number) => fit(HOUSES[i], CATS, x - 52 * s, y - 44 * s, 104 * s, 82 * s, false, false); }
const FREE_PIC: Spec = { base: "kivi", walls: "keltainen", door: "puu", win: "risti", roof: "punainen", top: "tiili", paint: "" };
const LEVELS: Level[] = HOUSES.map((h: any, i: number) => ({ name: NAMES[h.id], color: ["#8d5a2b", "#c0392b", "#7f8c8d", "#5d6d7e", "#5dade2", "#43a047"][i], say: "rk_h_h_" + h.id, pic: housePic(i) }));
LEVELS.push({ name: rg.t("Oma kylä", "My village", "Mi pueblo"), color: "#f77f00", say: "rk_h_kyla", pic: (x, y, s) => {
  const out = fit(FREE_PIC, CATS, x - 40 * s, y - 40 * s, 80 * s, 76 * s, false, false);
  for (let i = 0; i < 5; i++) { const a = K.t * 1.5 + i * 1.26; out.push(Box(x + Math.cos(a) * 46 * s - 4 * s, y - 4 * s + Math.sin(a) * 34 * s, 8 * s, 8 * s, PAINTS[i], 4 * s)); }
  return out;
} });
LEVELS.push({ name: rg.t("Oma katu", "My street", "Mi calle"), color: "#6a4c93", say: "rk_h_katu", pic: (x, y, s) => {
  const out: any[] = [Box(x - 58 * s, y + 28 * s, 116 * s, 10 * s, "#495057", 2)];
  [0, 1, 4].forEach((k, i) => { for (const e of fit(HOUSES[k], CATS, x - 60 * s + i * 40 * s, y - 24 * s, 40 * s, 52 * s, false, false)) out.push(e); });
  return out;
} });

// ---- state -------------------------------------------------------------------------
let target: Spec = empty();       // the picture card's house
let built: Spec = empty();        // the house being built
let placed: string[] = [];        // its parts so far
let cat = "base";                 // the part asked now
let choices: string[] = [];
let wrong: number[] = [];
let shakeI = -1, shakeT = -10, hintT = -10;
let objs: Obj[] = [];
let dropCat = "", dropT = -10;
let yaw = 0.55, turned = false;
let dragging = false, lastX = 0;
let freeCat = "walls";
let street: Spec[] = rg.load("street", []);
let streetX = 0;
let doneFree = false, lastMode = "menu", doneT = -10;
// the village: six plots, two by two along three roads; a house is { p: plot, s: spec, n: people }
const PLOTS = [[-2.9, 0], [2.9, 0], [-2.9, -7], [2.9, -7], [-2.9, -14], [2.9, -14]];
const ROAD = 3.5;                 // a row's road is this far in front of its plots
let village: any[] = rg.load("village", []);
let vmode = "village";            // "village" (pick a spot) or "build"
let plot = 0;                     // the plot being built on
type Person = { id: string; x: number; z: number; path: number[][]; wait: number; house: number; to: number; shown: boolean };
let people: Person[] = [];
let personN = 0, strollT = 4, welcomed = false;
const SHIRTS = ["#e63946", "#457b9d", "#f4a261", "#2a9d8f", "#9b5de5", "#f15bb5", "#00bbf9", "#fee440"];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];

// ---- the camera -------------------------------------------------------------------
const FOV = 50;
let CAM = [0, 5, 8], LOOK = [0, 1, 0];
function trayTop(): number {
  if (K.mode === "done") return height_() - 150;
  if (K.level === STREET_LV) return height_() - 20;
  if (K.level === FREE_LV) return vmode === "village" ? height_() - 20 : height_() - 214;
  return height_() - 132;
}
function height_(): number { return height; }
function focal(): number { return (height_() / 2) / Math.tan(FOV * Math.PI / 360); }
function camera() {
  let h = 2.5, cx = 0, cz = 0, dist = 0, up = 0.42;
  const top = K.mode === "done" || K.level === FREE_LV ? 120 : 228;
  if (K.level === STREET_LV) { h = 2.6; cx = streetX; dist = 13; up = 0.24; }
  else if (K.level === FREE_LV && vmode === "village") { h = 1.2; cz = -6.3; dist = 20.5; up = 0.95; }
  else {
    // far enough that the whole house fits between the picture card and the tray
    const s = K.level === FREE_LV ? built : target, e = extent(s);
    h = tallness(s);
    const avail = trayTop() - top;
    dist = Math.max((e[1] - e[0] + 0.6) * focal() / (width * 0.86), (h + 0.6) * focal() / (avail * 0.95)) + dims(s).d / 2 + 0.8;
    if (K.level === FREE_LV) { cx = PLOTS[plot][0]; cz = PLOTS[plot][1]; }
  }
  const want = (top + trayTop()) / 2, shift = (height_() / 2 - want) * dist / focal();
  const ly = h * 0.45 - shift * 0.9;
  const ya = K.level === STREET_LV ? 0.12 : yaw;
  LOOK = [cx, ly, cz];
  CAM = [cx + Math.sin(ya) * dist * 0.9, ly + dist * up, cz + Math.cos(ya) * dist * 0.9];
  rg.three("camera", { x: CAM[0], y: CAM[1], z: CAM[2], lookAt: LOOK, fov: FOV });
  cull();
}
// things on the walls that face away from the camera are hidden
function cull() {
  for (const o of objs) {
    const v = visible(o, CAM);
    if (v !== o.vis) { o.vis = v; rg.three("set", { id: o.id, visible: v }); }
  }
}
function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(a: number[]) { const l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function project(p: number[]): number[] {
  const f = unit(sub(LOOK, CAM)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f);
  const fo = focal(), v = sub(p, CAM), z = dot(v, f);
  return [width / 2 + dot(v, r) / z * fo, height_() / 2 - dot(v, u) / z * fo];
}

// ---- the 3D scene ------------------------------------------------------------------
function scene(snow: boolean) {
  rg.three("clear");
  rg.three("scene", { background: snow ? ["#6fa8dc", "#cfe2f3"] : ["#8fd3ff", "#e6f7ff"], ground: { y: 0, color: snow ? "#a9c4dc" : "#8fd16a" } });
  rg.three("light", { id: "sun", type: "directional", x: 3, y: 7, z: 5, intensity: 0.65 });
  rg.three("light", { id: "ambient", type: "ambient", intensity: 0.45 });
}
function addObj(o: Obj, dy: number) {
  o.vis = visible(o, CAM);
  rg.three("add", { id: o.id, shape: o.shape, size: o.size, color: o.color, x: o.x, y: o.y + dy, z: o.z, rx: o.rx, ry: o.ry, rz: o.rz, sx: o.sx, sy: o.sy, sz: o.sz, layer: o.layer, detail: o.detail, visible: o.vis });
}
function yard(snow: boolean, s: Spec) {
  const m = dims(s);
  rg.three("add", { id: "plot", shape: "box", size: [m.w + 1.2, 0.01, m.d + 1.2], color: snow ? "#c3d6e8" : "#c8a97e", x: 0, y: 0.005, z: 0, layer: -1 });
  if (!snow) {
    rg.three("add", { id: "path", shape: "box", size: [0.7, 0.02, 3], color: "#d9c9a3", x: 0, y: 0.01, z: 2.6, layer: -1 });
    rg.three("add", { id: "bush1", shape: "sphere", size: [0.45], color: "#2e8b57", x: -2.6, y: 0.3, z: -1.6, detail: 8 });
    rg.three("add", { id: "bush2", shape: "sphere", size: [0.35], color: "#3cb371", x: 2.7, y: 0.25, z: -1.9, detail: 8 });
  }
}
// the whole house again; the parts of `fresh` drop from above
function rebuild(fresh: string) {
  if (K.level === FREE_LV) { buildVillage(fresh); return; }
  const s = target;
  const snow = s.base === "lumi" || s.walls === "lumi";
  scene(snow);
  yard(snow, s);
  objs = [];
  camera();
  objs = objects(built, K.level === FREE_LV ? CATS : placed, "h", 0);
  dropCat = fresh; dropT = K.t;
  for (const o of objs) addObj(o, o.cat === fresh ? 4 : 0);
}
function buildStreet() {
  scene(false);
  rg.three("add", { id: "road", shape: "box", size: [Math.max(12, street.length * 5 + 10), 0.02, 1.6], color: "#5c636a", x: (street.length - 1) * 2.5, y: 0.01, z: 3.2, layer: -1 });
  for (let i = -1; i <= street.length * 2 + 1; i++) rg.three("add", { id: "dash" + i, shape: "box", size: [0.8, 0.02, 0.12], color: "#f8f9fa", x: i * 2.5, y: 0.02, z: 3.2, layer: -1 });
  objs = [];
  camera();
  let all: Obj[] = [];
  street.forEach((s: Spec, i: number) => {
    rg.three("add", { id: "walk" + i, shape: "box", size: [0.6, 0.02, 1.2], color: "#d9c9a3", x: i * 5, y: 0.012, z: 2.0, layer: -1 });
    for (const o of objects(s, CATS, "s" + i + "_", i * 5)) { addObj(o, 0); all.push(o); }
  });
  objs = all;
}
function drop(dt: number) {
  if (!dropCat) return;
  const t = K.t - dropT;
  let dy = 0;
  if (t < 0.4) { const u = 1 - t / 0.4; dy = 4 * u * u; }
  else if (t < 0.62) dy = Math.sin((t - 0.4) / 0.22 * Math.PI) * 0.18;
  for (const o of objs) if (o.cat === dropCat && o.id.charAt(0) === "h") rg.three("set", { id: o.id, y: o.y + dy });
  if (t >= 0.62) dropCat = "";
  if (t >= 0.4 && t - dt < 0.4) { rg.sound("hit", { volume: 0.6 }); rg.vibrate(30); }
}

// ---- building a picture card's house -------------------------------------------------
function next() {
  dragging = false;
  if (K.level === FREE_LV) { startFree(); return; }
  if (K.level === STREET_LV) { startStreet(); return; }
  if (K.question === 0) {
    target = copy(HOUSES[K.level]);
    built = empty();
    built.walls = target.walls;      // the parts' sizes follow the walls from the start
    placed = [];
    yaw = 0.55;
    rebuild("");
  }
  cat = CATS[K.question];
  const right = get(target, cat);
  const n = [2, 3, 4][step()];
  const others = rg.shuffle(OPTIONS[cat].filter((o: string) => o !== right)).slice(0, n - 1);
  choices = rg.shuffle([right].concat(others));
  wrong = [];
  hintT = -10;
  if (K.question === 0) rg.say(["rk_h_h_" + target.id, "rk_h_s_" + cat]); else rg.say("rk_h_s_" + cat);
}
function center(): number[] { const s = K.level === FREE_LV ? built : target; return project([0, tallness(s) * 0.5, 0]); }

function pick(i: number) {
  if (K.mode !== "play" || K.solved >= 0 || wrong.indexOf(i) >= 0) return;
  const v = choices[i];
  if (v === get(target, cat)) {
    set(built, cat, v);
    placed.push(cat);
    rebuild(cat);
    const c = center();
    win(c[0], c[1], ["rk_h_" + LETTER[cat] + "_" + v]);
    return;
  }
  wrong.push(i);
  shakeI = i; shakeT = K.t;
  const n = miss();
  if (n >= 2) { hintT = K.t; rg.say("rk_h_vihje"); } else rg.say("rk_h_katso");
}
function hint() { hintT = K.t; rg.say("rk_h_vihje"); }

// ---- the village and free building -----------------------------------------------------------
function houseAt(p: number): number { for (let i = 0; i < village.length; i++) if (village[i].p === p) return i; return -1; }
function startFree() {
  village = rg.load("village", []);
  vmode = "village";
  yaw = 0;
  people = [];
  welcomed = false;
  buildVillage("");
  rg.say(village.length >= PLOTS.length ? "rk_h_kyla_taysi" : village.length ? "rk_h_kyla" : "rk_h_paikka");
}
// the village scene; in build mode the house being built is `built` on its plot, in full detail
function buildVillage(fresh: string) {
  scene(false);
  objs = [];
  camera();
  for (let r = 0; r < 3; r++) {
    const z = PLOTS[r * 2][1] + ROAD;
    rg.three("add", { id: "road" + r, shape: "box", size: [16, 0.02, 1.3], color: "#6c757d", x: 0, y: 0.01, z, layer: -1 });
  }
  rg.three("add", { id: "mainroad", shape: "box", size: [1.3, 0.02, 21], color: "#6c757d", x: 0, y: 0.011, z: -6, layer: -1 });
  rg.three("add", { id: "pond", shape: "cylinder", size: [1.6, 1.6, 0.02], color: "#4ea8de", x: 6.8, y: 0.01, z: -3.5, layer: -1, detail: 16 });
  const trees = [[-7, 1], [7, 2], [-7.2, -5], [-6.8, -11], [7, -9], [7.2, -15], [-7, -17], [0, -19], [4, -19.5], [-3.8, -19.2]];
  trees.forEach((t, i) => {
    rg.three("add", { id: "trunk" + i, shape: "cylinder", size: [0.14, 0.18, 0.7], color: "#7a4f2a", x: t[0], y: 0.35, z: t[1], detail: 6 });
    rg.three("add", { id: "crown" + i, shape: "cone", size: [0.8, 1.8], color: i % 2 ? "#2e7d32" : "#388e3c", x: t[0], y: 1.6, z: t[1], detail: 8 });
  });
  let all: Obj[] = [];
  PLOTS.forEach((pl, p) => {
    const i = houseAt(p), building = vmode === "build" && p === plot;
    const s = building ? built : i >= 0 ? village[i].s : null;
    // a walk from the road to the door, and a sandy plot where nothing is built yet
    rg.three("add", { id: "walk" + p, shape: "box", size: [0.6, 0.02, ROAD - 1.4], color: "#d9c9a3", x: pl[0], y: 0.012, z: pl[1] + 0.7 + (ROAD - 1.4) / 2, layer: -1 });
    if (!s) { rg.three("add", { id: "plot" + p, shape: "box", size: [3.6, 0.01, 3.4], color: "#c8a97e", x: pl[0], y: 0.006, z: pl[1], layer: -1 }); return; }
    const os = objects(s, CATS, building ? "h" : "v" + p + "_", pl[0], pl[1], !building);
    for (const o of os) { addObj(o, building && o.cat === fresh ? 4 : 0); all.push(o); }
  });
  objs = all;
  dropCat = fresh; dropT = K.t;
  for (const q of people) addPerson(q);
}
function startBuild(p: number) {
  const i = houseAt(p);
  plot = p;
  built = i >= 0 ? copy(village[i].s) : copy(FREE_START);
  freeCat = "walls";
  vmode = "build";
  yaw = 0.55;
  rg.sound("click");
  buildVillage("");
  rg.say("rk_h_vapaa");
}
function freePick(v: string) {
  const c = freeCat === "paint" ? "paint" : freeCat;
  if (get(built, c) === v && c !== "base" && c !== "walls") v = "";
  set(built, c, v);
  rg.sound("pop");
  rebuild(c === "paint" ? "" : c);
  if (c !== "paint" && v) rg.say("rk_h_" + LETTER[c] + "_" + v);
  else if (c !== "paint") rg.say("rk_h_pois");
}
function freeDone() {
  const i = houseAt(plot), fresh = i < 0;
  if (fresh) village.push({ p: plot, s: copy(built), n: 0 }); else village[i].s = copy(built);
  rg.save("village", village);
  vmode = "village";
  yaw = 0;
  buildVillage("");
  const pl = PLOTS[plot], c = project([pl[0], 1.2, pl[1]]);
  rg.celebrate(c[0], c[1], { big: true });
  if (fresh) { moveIn(village.length - 1, 3); rg.say("rk_h_valmis_oma"); } else rg.say(["hienoa"]);
}
function backToVillage() { vmode = "village"; yaw = 0; rg.sound("click"); buildVillage(""); }

// ---- little people ------------------------------------------------------------------------------
function doorOf(i: number): number[] { const h = village[i], pl = PLOTS[h.p], d = doorFront(h.s); return [pl[0] + d[0], pl[1] + d[1]]; }
function roadOf(i: number): number { return PLOTS[village[i].p][1] + ROAD; }
function addPerson(q: Person) {
  const k = parseInt(q.id.slice(2), 10);
  rg.three("add", { id: q.id + "b", shape: "cylinder", size: [0.13, 0.17, 0.46], color: SHIRTS[k % SHIRTS.length], x: q.x, y: 0.23, z: q.z, detail: 8, visible: q.shown });
  rg.three("add", { id: q.id + "h", shape: "sphere", size: [0.13], color: SKIN[k % SKIN.length], x: q.x, y: 0.6, z: q.z, detail: 8, visible: q.shown });
}
function newPerson(x: number, z: number, path: number[][], wait: number, to: number): Person {
  const q: Person = { id: "pp" + (personN++), x, z, path, wait, house: -1, to, shown: false };
  people.push(q);
  addPerson(q);
  return q;
}
// `n` people come along the main road and go into house i
function moveIn(i: number, n: number) {
  const d = doorOf(i), r = roadOf(i);
  for (let k = 0; k < n; k++) newPerson(0.25 * (k - 1), 5, [[0.25 * (k - 1), r], [d[0], r], d], 1.2 + k * 0.8, i);
}
// now and then someone walks from one house to another
function stroll() {
  const homes: number[] = [];
  village.forEach((h: any, i: number) => { if (h.n > 0) homes.push(i); });
  if (!homes.length || village.length < 2) return;
  const a = rg.pick(homes);
  let b = rg.pick(village.map((h: any, i: number) => i).filter((i: number) => i !== a));
  const da = doorOf(a), db = doorOf(b), ra = roadOf(a), rb = roadOf(b);
  village[a].n--;
  rg.save("village", village);
  const path = ra === rb ? [[da[0], ra], [db[0], rb], db] : [[da[0], ra], [0, ra], [0, rb], [db[0], rb], db];
  newPerson(da[0], da[1], path, 0, b);
}
function walk(dt: number) {
  for (const q of people) {
    if (q.wait > 0) { q.wait -= dt; continue; }
    if (!q.shown) { q.shown = true; rg.three("set", { id: q.id + "b", visible: true }); rg.three("set", { id: q.id + "h", visible: true }); }
    const t = q.path[0], dx = t[0] - q.x, dz = t[1] - q.z, d = Math.sqrt(dx * dx + dz * dz), st = 1.4 * dt;
    if (d <= st) { q.x = t[0]; q.z = t[1]; q.path.shift(); }
    else { q.x += dx / d * st; q.z += dz / d * st; }
    const bob = Math.abs(Math.sin(K.t * 11 + q.x)) * 0.05;
    rg.three("set", { id: q.id + "b", x: q.x, y: 0.23 + bob, z: q.z });
    rg.three("set", { id: q.id + "h", x: q.x, y: 0.6 + bob, z: q.z });
    if (!q.path.length) {
      // in through the door
      q.house = q.to;
      if (village[q.to]) { village[q.to].n++; rg.save("village", village); }
      rg.three("remove", { id: q.id + "b" }); rg.three("remove", { id: q.id + "h" });
      rg.sound("pop", { volume: 0.6 });
      if (!welcomed) { welcomed = true; rg.say("rk_h_muutti"); }
    }
  }
  people = people.filter((q) => q.path.length > 0);
  if (vmode === "village") {
    strollT -= dt;
    if (strollT <= 0) { strollT = 3 + rg.random() * 4; if (people.length < 3) stroll(); }
  }
}
function addToStreet(s: Spec) {
  street.push(copy(s));
  while (street.length > MAX_STREET) street.shift();
  rg.save("street", street);
}
function startStreet() {
  street = rg.load("street", []);
  streetX = Math.max(0, (street.length - 1) * 5);
  buildStreet();
  rg.say(street.length ? "rk_h_katu" : "rk_h_katu_tyhja");
}

// ---- input ------------------------------------------------------------------------
function onPointerDown(x: number, y: number) {
  if (K.mode === "menu") return;
  if (y > 112 && y < trayTop()) { dragging = true; lastX = x; }
}
function onPointerUp() { dragging = false; }
function tick(dt: number, input: any) {
  update(dt);
  if (K.mode === "done" && lastMode === "play" && !doneFree) {
    // the kit just finished the round: the house moves to the street
    addToStreet(built);
    doneT = K.t;
    rg.say(["rk_h_v_" + target.id, "rk_h_kadulle"]);
  }
  if (K.mode !== "done") doneFree = false;
  lastMode = K.mode;
  if (K.mode === "menu") return;
  if (dragging && input && input.pointer && input.pointer.down) {
    const dx = input.pointer.x - lastX;
    lastX = input.pointer.x;
    if (Math.abs(dx) > 0) {
      if (K.level === STREET_LV) streetX = Math.max(-2, Math.min(Math.max(0, (street.length - 1) * 5) + 2, streetX - dx * 0.03));
      else { yaw -= dx * 0.012; if (Math.abs(dx) > 2) turned = true; }
      camera();
    }
  } else if (dragging) dragging = false;
  if (K.mode === "done" && !dragging && K.level !== STREET_LV) { yaw += dt * 0.5; camera(); }
  drop(dt);
  if (K.level === FREE_LV && K.mode === "play") walk(dt);
}
function onBack() {
  dragging = false;
  if (K.mode === "menu") rg.exit();
  else if (K.level === FREE_LV && vmode === "build") backToVillage();
  else toMenu();
}

// ---- screens ----------------------------------------------------------------------------
function shake(i: number): number { return shakeI === i ? Math.sin((K.t - shakeT) * 50) * 10 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0; }

function Card(): any[] {
  const out: any[] = [];
  const x = 10, y = 116, w = 112, h = 104;
  const glow = K.t - hintT < 6 && Math.floor(K.t * 3) % 2 === 0;
  out.push(<div className="card" id="pic" onClick={() => rg.say("rk_h_h_" + target.id)} style={{ left: x, top: y, width: w, height: h, backgroundColor: glow ? "#fff3b0" : "#ffffff" }} />);
  for (const e of fit(target, CATS, x + 6, y + 6, w - 12, h - 12, false, false)) out.push(e);
  return out;
}

function Tray(): any[] {
  const out: any[] = [];
  const n = choices.length, gap = 8, tw = (width - 20 - gap * (n - 1)) / n, th = 116, y = height_() - th - 10;
  const showHint = K.t - hintT < 6;
  choices.forEach((v, i) => {
    const x = 10 + i * (tw + gap) + shake(i);
    const s = copy(target);
    set(s, cat, v);
    const off = wrong.indexOf(i) >= 0;
    const right = v === get(target, cat);
    out.push(<div className={off ? "card off" : "card"} style={{ left: x, top: y, width: tw, height: th, backgroundColor: showHint && right ? "#fff3b0" : "#ffffff" }} />);
    const parts = cat === "walls" ? ["walls"] : cat === "base" ? ["base"] : cat === "roof" ? ["walls", "roof"] : [cat];
    const crop = cat === "door" || cat === "win" ? true : cat === "base" ? "base" : false;
    for (const e of fit(s, parts, x + 6, y + 6, tw - 12, th - 12, crop, cat !== "walls")) out.push(e);
    if (showHint && right && K.solved < 0) out.push(PointAt(x + tw / 2, y + 4, "#f77f00"));
    out.push(<div className="hit" id={"opt" + i} onClick={() => pick(i)} style={{ left: x, top: y, width: tw, height: th }} />);
  });
  return out;
}

function Play(): any[] {
  const out: any[] = [];
  for (const e of Header(ASK[cat], () => rg.say("rk_h_s_" + cat), () => hint())) out.push(e);
  for (const e of Card()) out.push(e);
  for (const e of Tray()) out.push(e);
  if (!turned && K.question >= 2 && K.solved < 0) out.push(<div className="label" style={{ left: width - 120, top: trayTop() - 34, width: 110 }}>{"👆 ↔"}</div>);
  return out;
}

function FreeTray(): any[] {
  const out: any[] = [];
  const top = trayTop();
  out.push(<div style={{ position: "absolute", left: 0, top: top - 4, width, height: height_() - top + 4, backgroundColor: "rgba(255,243,214,0.92)" }} />);
  // the tabs: one for each kind of part
  const tw = (width - 16) / FREE_CATS.length;
  FREE_CATS.forEach((c, i) => {
    const x = 8 + i * tw, on = c === freeCat;
    out.push(<div className="card" style={{ left: x + 2, top: top + 2, width: tw - 4, height: 50, backgroundColor: on ? "#ffd166" : "#ffffff" }} />);
    if (c === "paint") out.push(<div className="label" style={{ left: x, top: top + 10, width: tw, height: 34, fontSize: 24 }}>{"🎨"}</div>);
    else {
      const s = copy(FREE_PIC);
      if (c === "walls" || c === "base") for (const e of fit(s, [c], x + 7, top + 7, tw - 14, 40, c === "base" ? "base" : false, c !== "walls")) out.push(e);
      else for (const e of fit(s, c === "roof" ? ["walls", "roof"] : [c], x + 7, top + 7, tw - 14, 40, c === "door" || c === "win", true)) out.push(e);
    }
    out.push(<div className="hit" id={"tab" + c} onClick={() => { freeCat = c; rg.sound("click"); rg.say("rk_h_c_" + c); }} style={{ left: x, top, width: tw, height: 54 }} />);
  });
  // the options of the tab
  const opts: string[] = freeCat === "paint" ? PAINTS : freeCat === "base" || freeCat === "walls" ? OPTIONS[freeCat] : OPTIONS[freeCat].concat([""]);
  const cols = 4, ow = (width - 20 - 6 * (cols - 1)) / cols, oh = 70;
  opts.forEach((v, i) => {
    const x = 10 + (i % cols) * (ow + 6), y = top + 60 + Math.floor(i / cols) * (oh + 6);
    const c = freeCat;
    const on = get(built, c) === v;
    out.push(<div className="card" style={{ left: x, top: y, width: ow, height: oh, backgroundColor: on ? "#c9f7e4" : "#ffffff" }} />);
    if (v === "") out.push(<div className="big" style={{ left: x, top: y + 12, width: ow, height: 44, color: "#d62828" }}>{"✕"}</div>);
    else if (c === "paint") out.push(Box(x + 12, y + 10, ow - 24, oh - 20, v, 12));
    else {
      const s = copy(built);
      set(s, c, v);
      const parts = c === "roof" ? ["walls", "roof"] : [c];
      for (const e of fit(s, parts, x + 5, y + 5, ow - 10, oh - 10, c === "door" || c === "win" ? true : c === "base" ? "base" : false, c !== "walls")) out.push(e);
    }
    out.push(<div className="hit" id={"fo" + i} onClick={() => freePick(v)} style={{ left: x, top: y, width: ow, height: oh }} />);
  });
  return out;
}

function Village(): any[] {
  const out: any[] = [];
  const full = village.length >= PLOTS.length;
  out.push(<div className="prompt" id="prompt" style={{ left: 14, top: 64, width: width - 28 }} onClick={() => rg.say(full ? "rk_h_kyla_taysi" : "rk_h_paikka")}><div className="ptext">{"🔊 " + (full ? rg.t("Oma kylä", "My village", "Mi pueblo") : rg.t("Mihin talo tulee?", "Where does it go?", "¿Dónde va la casa?"))}</div></div>);
  let firstEmpty = -1;
  PLOTS.forEach((pl, p) => {
    const i = houseAt(p);
    if (i < 0) {
      if (firstEmpty < 0) firstEmpty = p;
      const c = project([pl[0], 0.3, pl[1]]), b = Math.sin(K.t * 4 + p) * 4;
      out.push(<div className="btn" id={"plot" + p} onClick={() => startBuild(p)} style={{ left: c[0] - 26, top: c[1] - 26 + b, width: 52, height: 52, borderRadius: 26, backgroundColor: "#06d6a0" }}><div className="btext">{"+"}</div></div>);
    } else {
      const s = village[i].s, c = project([pl[0], tallness(s) + 0.3, pl[1]]);
      out.push(<div className="hintbtn" id={"edit" + p} onClick={() => startBuild(p)} style={{ left: c[0] - 23, top: c[1] - 50 }}>🔨</div>);
      if (village[i].n > 0) out.push(<div className="label" style={{ left: c[0] + 22, top: c[1] - 42, width: 50, fontSize: 14, color: "#ffffff" }}>{"🙂" + village[i].n}</div>);
    }
  });
  if (!village.length && firstEmpty >= 0) { const c = project([PLOTS[firstEmpty][0], 0.3, PLOTS[firstEmpty][1]]); out.push(PointAt(c[0], c[1] - 30, "#f77f00")); }
  return out;
}

function Free(): any[] {
  if (vmode === "village") return Village();
  const out: any[] = [];
  out.push(<div className="hintbtn" id="tovillage" onClick={() => backToVillage()} style={{ left: 10, top: 64 }}>🏘</div>);
  out.push(<div className="prompt" id="prompt" style={{ left: 64, top: 64, width: width - 210 }} onClick={() => rg.say("rk_h_vapaa")}><div className="ptext">{"🔊 " + rg.t("Oma talo", "My house", "Mi casa")}</div></div>);
  out.push(<div className="btn" id="ready" onClick={() => freeDone()} style={{ left: width - 138, top: 58, width: 126, backgroundColor: "#06d6a0" }}><div className="btext">{"✔ " + rg.t("Valmis", "Ready", "Listo")}</div></div>);
  for (const e of FreeTray()) out.push(e);
  return out;
}

function Street(): any[] {
  const out: any[] = [];
  out.push(<div className="prompt" id="prompt" style={{ left: 14, top: 64, width: width - 28 }} onClick={() => rg.say(street.length ? "rk_h_katu" : "rk_h_katu_tyhja")}><div className="ptext">{"🔊 " + rg.t("Oma katu", "My street", "Mi calle")}</div></div>);
  if (!street.length) out.push(<div className="label" style={{ left: 20, top: height_() / 2 - 20, width: width - 40, fontSize: 22 }}>{rg.t("Rakenna talo, niin se muuttaa tänne!", "Build a house and it moves here!", "¡Construye una casa y se mudará aquí!")}</div>);
  else out.push(<div className="label" style={{ left: width / 2 - 60, top: height_() - 60, width: 120 }}>{"👆 ↔"}</div>);
  return out;
}

function DoneView(): any[] {
  const out: any[] = [];
  out.push(<div className="titlebox" style={{ left: 0, top: 20, width }}><div className="dtitle">{rg.t("Valmis!", "Ready!", "¡Listo!")}</div></div>);
  if (!doneFree) {
    let st = "";
    for (let i = 0; i < K.round; i++) st += i < K.right ? "⭐" : "☆";
    out.push(<div className="label" style={{ left: 0, top: 78, width, fontSize: 26, color: "#f4a100" }}>{st}</div>);
  }
  const y = height_() - 140, bw = (width - 36) / 2;
  const again = doneFree ? rg.t("Uusi talo", "New house", "Otra casa") : rg.t("Seuraava ▶", "Next ▶", "Siguiente ▶");
  out.push(<div className="btn" id="again" onClick={() => start(doneFree ? FREE_LV : (K.level + 1) % 6)} style={{ left: 12, top: y, width: bw, backgroundColor: "#f77f00" }}><div className="btext">{again}</div></div>);
  out.push(<div className="btn" id="street" onClick={() => start(STREET_LV)} style={{ left: 24 + bw, top: y, width: bw, backgroundColor: "#6a4c93" }}><div className="btext">{rg.t("Kadulle", "Street", "La calle")}</div></div>);
  out.push(<div className="btn" id="menu" onClick={() => toMenu()} style={{ left: width / 2 - 110, top: y + 70, width: 220, backgroundColor: "#9a8c98" }}><div className="btext">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>);
  return out;
}

setup(rg.t("Rakenna talo", "Build a house", "Construye una casa"), LEVELS, 6, next);

function view() {
  let body: any;
  if (K.mode === "menu") return <div className="root">{Menu([])}{Sparks()}</div>;
  if (K.mode === "done") body = DoneView();
  else if (K.level === FREE_LV) body = Free();
  else if (K.level === STREET_LV) body = Street();
  else body = Play();
  return <div className="root3d"><div className="screen">{body}</div>{Sparks()}</div>;
}
