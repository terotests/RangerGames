// Korkeasaari: an orienteering game in Helsinki's zoo. The map of the island
// and where every animal lives come from OpenStreetMap (tools/korkeasaari/
// build_map.py, ODbL). The child looks for one animal at a time: at home by
// walking on the map with a finger, at the zoo with the phone's GPS (works
// offline). At the animal there are picture questions that are read aloud, so
// a child who can't read yet can play (🐣 Eskari); 🎒 Koulu adds harder ones.
// Every animal found gives a sticker for the album.

import { MAP } from "lib/mapdata";
import { RIGS } from "lib/rigs";
import { ANIMALS, FOODS, HOMES, WORLD, WORLD_MAP, MOVES, PRINTS, SLEEPS, COVERS, ACTIVE, CHILD_KG, Animal } from "lib/animals";
import { KS_LANG } from "lib/lang";

// English or Spanish (the launcher's flags): the clip texts of that language
// replace the Finnish names, facts and questions
const KS: any = KS_LANG[rg.lang] || null;
const unbang = (s: string) => s.replace(/^¡/, "").replace(/[!.]$/, "");
if (KS) {
  for (const a of ANIMALS) {
    if (KS["ks_" + a.id]) a.name = unbang(KS["ks_" + a.id]);
    if (KS["ks_" + a.id + "_fakta"]) a.fact = KS["ks_" + a.id + "_fakta"];
  }
  for (const k in FOODS) if (KS["ks_ruoka_" + k]) FOODS[k].name = unbang(KS["ks_ruoka_" + k]);
  for (const k in HOMES) if (KS["ks_koti_" + k]) HOMES[k].name = unbang(KS["ks_koti_" + k]);
}
// a question's text: the clip's text in English or Spanish, built in Finnish
function qtext(clip: string, fi: string) { return KS && KS[clip] ? KS[clip] : fi; }

// ---- geography ----
const toX = (lon: number) => (lon - MAP.lon0) * MAP.kx;
const toZ = (lat: number) => (MAP.lat0 - lat) * MAP.ky;
const SEA = "#7cc4ee";
const ROUTE = "#ff3d7f";
const WALK = 40; // the pretend child's metres a second on the map

type Mode = "loading" | "menu" | "map" | "visit" | "album";
let mode: Mode = "loading";
let t = 0;
let loadClock = 0;
let level = "eskari";          // "eskari" | "koulu"
let gps = false;               // at the zoo: the child is where the GPS says
let found: { [id: string]: number } = {}; // id -> stars
let target = "";
let pick = false;              // the list of animals to choose from

// ---- the paths ----
let N = 0;
let NX: Float64Array, NZ: Float64Array;
let ADJ: number[][] = [];

function loadPaths() {
  const v = MAP.nodes;
  N = v.length / 2;
  NX = new Float64Array(N); NZ = new Float64Array(N);
  for (let i = 0; i < N; i++) { NX[i] = v[2 * i] / 10; NZ[i] = v[2 * i + 1] / 10; ADJ.push([]); }
  const e = MAP.edges;
  for (let i = 0; i < e.length; i += 2) {
    const a = e[i], b = e[i + 1];
    const d = Math.hypot(NX[a] - NX[b], NZ[a] - NZ[b]);
    ADJ[a].push(b, d); ADJ[b].push(a, d);
  }
}

function nearestNode(x: number, z: number, max: number) {
  let best = -1, bd = max;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(NX[i] - x, NZ[i] - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// every node's way to the goal, by one search from the goal
let treeFor = -1;
let NEXT: Int32Array, DIST: Float64Array;

function buildTree(goal: number) {
  if (treeFor === goal) return;
  treeFor = goal;
  DIST = new Float64Array(N).fill(1e18);
  NEXT = new Int32Array(N).fill(-1);
  DIST[goal] = 0;
  const hk: number[] = [0], hv: number[] = [goal];
  while (hk.length) {
    // the smallest (a plain list is fast enough for 1600 points)
    let bi = 0;
    for (let i = 1; i < hk.length; i++) if (hk[i] < hk[bi]) bi = i;
    const d = hk[bi], u = hv[bi];
    hk[bi] = hk[hk.length - 1]; hv[bi] = hv[hv.length - 1]; hk.pop(); hv.pop();
    if (d > DIST[u]) continue;
    const a = ADJ[u];
    for (let k = 0; k < a.length; k += 2) {
      const w = a[k], nd = d + a[k + 1];
      if (nd < DIST[w]) { DIST[w] = nd; NEXT[w] = u; hk.push(nd); hv.push(w); }
    }
  }
}

// the route from node `from` to the goal of the tree, as points [x, z, x, z, ...]
function routeFrom(from: number): number[] {
  const out: number[] = [];
  let u = from, guard = 0;
  while (u >= 0 && guard++ < 5000) {
    out.push(NX[u], NZ[u]);
    u = NEXT[u];
  }
  return out;
}

function routeLength(r: number[]) {
  let L = 0;
  for (let i = 2; i < r.length; i += 2) L += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]);
  return L;
}

// ---- the animals ----
const byId: { [id: string]: Animal } = {};
for (const a of ANIMALS) byId[a.id] = a;
const place = (id: string) => MAP.animals[id];
const standNode = (id: string): number => place(id).node;

function nextAnimal(): string {
  // the nearest animal not yet found, by walking
  const here = childNode();
  let best = "", bd = 1e18;
  for (const a of ANIMALS) {
    if (found[a.id] || a.id === target) continue;
    const p = place(a.id);
    const d = here >= 0 ? Math.hypot(NX[here] - p.x, NZ[here] - p.z) : 0;
    if (d < bd) { bd = d; best = a.id; }
  }
  return best;
}

function setTarget(id: string, speak: boolean) {
  target = id;
  pick = false;
  if (!id) return;
  buildTree(standNode(id));
  arrivedSaid = false;
  if (speak) { rg.say("ks_" + id + "_etsi"); bannerPulse = 1; }
  if (!gps) walkTo(standNode(id));
}

// ---- the child: on the map (pretend) or from the GPS ----
let kx = 0, kz = 0;            // where the child is
let walkPath: number[] = [];   // the pretend child's way, points
let walkAt = 0;                // metres along it
let facing = 90;
let fix: any = null;
let lastFixAt = -100;
let gpsError = "";
let heading = -1;
let arrivedSaid = false;
let nearSaid = false;

function childNode() { return nearestNode(kx, kz, 1e9); }

function walkTo(goal: number) {
  const from = childNode();
  if (from < 0 || goal < 0) return;
  const saveFor = treeFor;
  buildTree(goal);
  const r = routeFrom(from);
  walkPath = [kx, kz].concat(r);
  walkAt = 0;
  if (saveFor !== goal && target) buildTree(standNode(target));
}

function pointAlong(r: number[], s: number): number[] {
  for (let i = 2; i < r.length; i += 2) {
    const L = Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]);
    if (s <= L && L > 0) return [r[i - 2] + (r[i] - r[i - 2]) * s / L, r[i - 1] + (r[i + 1] - r[i - 1]) * s / L];
    s -= L;
  }
  return [r[r.length - 2], r[r.length - 1]];
}

function onLocation(f: any) {
  if (!f) return;
  fix = { x: toX(f.lon), z: toZ(f.lat), acc: f.accuracy || 30 };
  lastFixAt = t;
  gpsError = "";
  if (gps) { kx = fix.x; kz = fix.z; }
}
function onHeading(deg: number) { if (typeof deg === "number") heading = deg; }
function onSensor(name: string, data: any) {
  if (name === "error" && data && data.sensor === "location") gpsError = data.reason || "error";
}

const onIsland = () => kx > -320 && kx < 600 && kz > -260 && kz < 620;

// ---- the camera ----
let cx = 140, cz = 190, zoom = 0.4;
let follow = true;
let drag: any = null;
const sx = (x: number) => width / 2 + (x - cx) * zoom;
const sy = (z: number) => height / 2 + (z - cz) * zoom;

// ---- the visit: questions at the animal ----
type Q = { kind: string; text: string; clip: string[]; opts: any[]; answer: number; tries: number; done: boolean };
let qs: Q[] = [];
let qi = 0;
let visitClock = 0;
let wrong: { [i: number]: boolean } = {};
let shake = 0;
let stars = 0;
let sticker = 0; // > 0: the sticker flies in

function others(not: string[], n: number): string[] {
  const pool = ANIMALS.filter((a) => not.indexOf(a.id) < 0).map((a) => a.id);
  return rg.shuffle(pool).slice(0, n);
}

function choiceQ(kind: string, text: string, clip: string[], right: any, wrongs: any[]): Q {
  const opts = rg.shuffle([right].concat(wrongs));
  return { kind: kind, text: text, clip: clip, opts: opts, answer: opts.indexOf(right), tries: 0, done: false };
}

function makeQuestions(a: Animal): Q[] {
  const out: Q[] = [];
  const foodsWrong = rg.shuffle(Object.keys(FOODS).filter((k) => a.eats.indexOf(k) < 0)).slice(0, 2);
  const homesWrong = rg.shuffle(Object.keys(HOMES).filter((k) => a.home.indexOf(k) < 0)).slice(0, 2);
  // which animal is this: the names as text, one under another
  const kuka = choiceQ("name", qtext("ks_mika_elain", "Mikä eläin tämä on?"), ["ks_mika_elain"], a.id, others([a.id], 2));
  // where in the world: three continents on the world map (a farm animal gets the name question)
  const worldWrong = rg.shuffle(Object.keys(WORLD).filter((k) => a.world.indexOf(k) < 0)).slice(0, 2);
  const first = a.world.length ? choiceQ("world", qtext("ks_" + a.id + "_maailma", "Missä päin maailmaa " + a.name.toLowerCase() + " asuu?"), ["ks_" + a.id + "_maailma"], a.world[0], worldWrong) : kuka;
  const syo = choiceQ("food", qtext("ks_" + a.id + "_syo", "Mitä " + a.name.toLowerCase() + " syö?"), ["ks_" + a.id + "_syo"], a.eats[0], foodsWrong);
  const asuu = choiceQ("home", qtext("ks_" + a.id + "_asuu", "Missä " + a.name.toLowerCase() + " asuu luonnossa?"), ["ks_" + a.id + "_asuu"], a.home[0], homesWrong);
  // bigger: an animal at least twice as heavy, or half as heavy
  const pair = rg.shuffle(ANIMALS.filter((b) => b.id !== a.id && (b.kg >= a.kg * 2 || b.kg * 2 <= a.kg)))[0];
  const big = pair.kg > a.kg ? pair.id : a.id;
  const isompi = choiceQ("animal", rg.t("Kumpi on isompi?", "Which one is bigger?", "¿Cuál es más grande?"), ["ks_kumpi_isompi"], big, [big === a.id ? pair.id : a.id]);
  // picture questions that suit this animal (an empty field: not for it)
  const l = a.name.toLowerCase();
  const pick3 = (table: any, right: string[]) => rg.shuffle(Object.keys(table).filter((k) => right.indexOf(k) < 0)).slice(0, 2);
  const pool: Q[] = [syo, asuu];
  pool.push(choiceQ("move", qtext("ks_" + a.id + "_liike", "Miten " + l + " liikkuu?"), ["ks_" + a.id + "_liike"], a.move[0], pick3(MOVES, a.move)));
  if (a.print) pool.push(choiceQ("print", qtext("ks_" + a.id + "_jalki", "Millaisen jäljen " + l + " jättää?"), ["ks_" + a.id + "_jalki"], a.print, pick3(PRINTS, [a.print])));
  pool.push(choiceQ("sleep", qtext("ks_" + a.id + "_uni", "Missä " + l + " nukkuu?"), ["ks_" + a.id + "_uni"], a.sleep[0], pick3(SLEEPS, a.sleep)));
  pool.push(choiceQ("cover", qtext("ks_" + a.id + "_peite", "Mikä peittää " + a.gen + " kehoa?"), ["ks_" + a.id + "_peite"], a.cover, pick3(COVERS, [a.cover])));
  if (a.active.length) pool.push(choiceQ("active", qtext("ks_" + a.id + "_aika", "Milloin " + l + " on liikkeellä?"), ["ks_" + a.id + "_aika"], a.active[0], pick3(ACTIVE, a.active)));
  // bigger or smaller than the child: only when it is clear
  if (a.kg <= CHILD_KG * 0.6 || a.kg >= CHILD_KG * 2) {
    const sz = choiceQ("size", qtext("ks_" + a.id + "_koko", "Onko " + l + " isompi vai pienempi kuin sinä?"), ["ks_" + a.id + "_koko"], a.kg > CHILD_KG ? "isompi" : "pienempi", [a.kg > CHILD_KG ? "pienempi" : "isompi"]);
    sz.opts = ["pienempi", "isompi"]; sz.answer = a.kg > CHILD_KG ? 1 : 0;
    pool.push(sz);
  }
  const picked = rg.shuffle(pool).slice(0, 3);
  if (level === "eskari") {
    out.push(first);
    for (const q of picked) out.push(q);
  } else {
    out.push(first, picked[0], picked[1], isompi);
    const f: Q = { kind: "fact", text: a.fact, clip: ["ks_" + a.id + "_fakta", "ks_totta_vai"], opts: [true, false], answer: a.factTrue ? 0 : 1, tries: 0, done: false };
    out.push(f);
  }
  return out;
}

function startVisit() {
  const a = byId[target];
  mode = "visit";
  qs = makeQuestions(a);
  qi = 0; wrong = {}; stars = 0; sticker = 0; visitClock = 0;
  rg.say(["ks_" + a.id + "_loysit"].concat(qs[0].clip));
  rg.sound("win");
  rg.vibrate([60, 40, 120]);
  rg.celebrate(width / 2, height * 0.3, { big: true });
}

// the clip of an answer, said when the child taps it
const OPT_CLIP: any = { name: "ks_", world: "ks_mt_", food: "ks_ruoka_", home: "ks_koti_", move: "ks_liike_", print: "ks_jalki_",
  sleep: "ks_uni_", cover: "ks_peite_", active: "ks_aika_", size: "ks_koko_" };
function optClip(q: Q, i: number): string[] { return OPT_CLIP[q.kind] ? [OPT_CLIP[q.kind] + q.opts[i]] : []; }

const PRAISE = ["oikein", "hienoa", "hyva", "mahtavaa", "loistavaa", "jee"];

function answer(i: number) {
  const q = qs[qi];
  if (q.done || wrong[i]) return;
  q.tries++;
  if (i === q.answer) {
    q.done = true;
    if (q.tries === 1) stars++;
    rg.sound("coin");
    rg.celebrate(width / 2, height * 0.62, {});
    const next = qi + 1 < qs.length ? qs[qi + 1].clip : [];
    const said = optClip(q, i);
    rg.say(said.concat([q.kind === "fact" ? (q.answer === 0 ? "ks_totta" : "ks_ei_totta") : rg.pick(PRAISE)]).concat(next));
    advanceAt = t + 1.4;
  } else {
    wrong[i] = true;
    shake = 0.4;
    rg.sound("hit");
    rg.vibrate(80);
    rg.say(q.kind === "fact" ? ["hups", "kokeile_toista"] : optClip(q, i).concat(["yrita_uudelleen"]));
  }
}
let advanceAt = -1;

function finishVisit() {
  const a = byId[target];
  found[a.id] = Math.max(found[a.id] || 0, Math.max(1, stars));
  rg.save("found", found);
  sticker = 0.01;
  rg.sound("win");
  rg.celebrate(width / 2, height * 0.45, { big: true });
  const all = ANIMALS.every((b) => !!found[b.id]);
  rg.say(all ? ["ks_tarra", "ks_kaikki"] : ["ks_tarra", "ks_seuraava"]);
}

// ---- the game loop ----
function init() {
  rg.closeButton = "right";
  found = rg.load("found", {}) || {};
  level = rg.load("level", "eskari") || "eskari";
}

let bannerPulse = 0;

function tick(dt: number, input: any) {
  t += dt;
  if (mode === "loading") {
    loadClock += dt;
    if (loadClock > 0.05) {
      loadPaths();
      const g = MAP.gates.paanu;
      kx = NX[g]; kz = NZ[g];
      mode = "menu";
      rg.say("ks_tervetuloa");
    }
    return;
  }
  if (shake > 0) shake -= dt;
  if (bannerPulse > 0) bannerPulse = Math.max(0, bannerPulse - dt);
  if (mode === "map") tickMap(dt, input);
  if (mode === "visit") {
    visitClock += dt;
    if (advanceAt > 0 && t >= advanceAt) {
      advanceAt = -1;
      if (qi + 1 < qs.length) { qi++; wrong = {}; }
      else finishVisit();
    }
    if (sticker > 0 && sticker < 1) sticker = Math.min(1, sticker + dt * 1.5);
  }
}

function tickMap(dt: number, input: any) {
  dragMap(input);
  if (!gps && walkPath.length >= 4) {
    walkAt += WALK * dt;
    const L = routeLength(walkPath);
    const p = pointAlong(walkPath, Math.min(walkAt, L));
    if (Math.hypot(p[0] - kx, p[1] - kz) > 0.05) facing = Math.atan2(p[0] - kx, -(p[1] - kz)) * 180 / Math.PI;
    kx = p[0]; kz = p[1];
    if (walkAt >= L) walkPath = [];
  }
  // at the zoo the camera follows the child; far away it stays on the island
  if (follow && !drag && (!gps || (fix && onIsland()))) {
    cx += (kx - cx) * Math.min(1, dt * 3);
    cz += (kz - cz) * Math.min(1, dt * 3);
  }
  if (!target) return;
  const p = place(target);
  const sn = standNode(target);
  const d = Math.hypot(NX[sn] - kx, NZ[sn] - kz);
  if (gps) {
    if (!fix || t - lastFixAt > 30 || !onIsland()) return;
    const reach = 18 + Math.min(20, fix.acc * 0.5);
    if (d < reach || Math.hypot(p.x - kx, p.z - kz) < reach) { startVisit(); return; }
    if (d < 60 && !nearSaid) { nearSaid = true; rg.say("ks_lahella"); rg.vibrate(40); }
  } else if (walkPath.length === 0 && d < 3) {
    startVisit();
  }
}

function dragMap(input: any) {
  if (!drag) return;
  const p = input.pointer;
  if (!p.down) return;
  const dx = p.x - drag.x, dy = p.y - drag.y;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 10) drag.moved = true;
  if (drag.moved) { cx = drag.cx - dx / zoom; cz = drag.cz - dy / zoom; follow = false; }
}

function onPointerDown(x: number, y: number, info: any) {
  if (mode === "map" && !pick && !(info && info.id)) drag = { x: x, y: y, cx: cx, cz: cz, moved: false };
}

function onPointerUp(x: number, y: number, info: any) {
  const d = drag;
  drag = null;
  if (!d || d.moved || mode !== "map" || pick) return;
  // a tap on the map: the pretend child walks there
  if (gps) return;
  const wx = cx + (x - width / 2) / zoom, wz = cz + (y - height / 2) / zoom;
  const n = nearestNode(wx, wz, 40 / zoom + 10);
  if (n >= 0) { walkTo(n); follow = true; rg.sound("click"); }
}

function tapAnimal(id: string) {
  rg.sound("pop");
  if (id === target) {
    // at the zoo the GPS can be a little off: a tap on the animal when near enough
    if (gps && fix && Math.hypot(place(id).x - kx, place(id).z - kz) < 45) { startVisit(); return; }
    rg.say("ks_" + id + "_etsi");
    if (!gps) walkTo(standNode(id));
    return;
  }
  setTarget(id, true);
  follow = true;
}

function startMap(atZoo: boolean) {
  gps = atZoo;
  mode = "map";
  follow = true;
  zoom = atZoo ? 1.2 : 0.9;
  nearSaid = false;
  if (atZoo) { rg.sensor("location", true); rg.sensor("heading", true); walkPath = []; }
  else { rg.sensor("location", false); rg.sensor("heading", false); }
  if (!target || found[target]) setTarget(nextAnimal(), false);
  if (target) rg.say(atZoo ? ["ks_" + target + "_etsi"] : ["ks_" + target + "_etsi", "ks_napauta"]);
  if (!atZoo && target) walkPath = [];
  if (atZoo && !fix) rg.say(["ks_etsitaan"], { queue: true });
}

// ---- drawing ----
function rigPng(id: string) { return rg.asset("rig/" + id + ".png"); }

function tiles() {
  const lv = zoom < 1.0 ? "o" : "d";
  const mpp = MAP.levels[lv];
  const span = MAP.tile * mpp;
  const out: any[] = [];
  const x0 = cx - width / 2 / zoom, x1 = cx + width / 2 / zoom;
  const z0 = cz - height / 2 / zoom, z1 = cz + height / 2 / zoom;
  const have: any = {};
  for (const k of MAP.have[lv]) have[k] = true;
  const i0 = Math.floor((x0 - MAP.box[0]) / span), i1 = Math.floor((x1 - MAP.box[0]) / span);
  const j0 = Math.floor((z0 - MAP.box[1]) / span), j1 = Math.floor((z1 - MAP.box[1]) / span);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const key = i + "_" + j;
      if (!have[key]) continue;
      const left = Math.floor(sx(MAP.box[0] + i * span)), top = Math.floor(sy(MAP.box[1] + j * span));
      out.push(<img key={lv + key} src={rg.asset("tiles/" + lv + "/" + key + ".webp")}
        style={{ position: "absolute", left: left, top: top, width: Math.ceil(span * zoom) + 1, height: Math.ceil(span * zoom) + 1 }} />);
    }
  }
  return out;
}

function pathD(p: number[], close: boolean) {
  const parts: string[] = [];
  let last = "";
  for (let i = 0; i + 1 < p.length; i += 2) {
    const s = Math.round(sx(p[i])) + " " + Math.round(sy(p[i + 1]));
    if (s === last) continue;
    parts.push((parts.length ? "L " : "M ") + s);
    last = s;
  }
  return parts.join(" ") + (close ? " Z" : "");
}

const FULL = () => ({ position: "absolute", left: 0, top: 0, width: width, height: height });
const VB = () => "0 0 " + width + " " + height;

function targetPen() {
  if (!target) return null;
  const pen = place(target).pen;
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  return [
    <path d={pathD(pen, true)} fill="rgba(255,209,102,0.45)" stroke="#ff9f1c" strokeWidth={String(3 + pulse * 3)} viewBox={VB()} style={FULL()} />,
  ];
}

function routeLine() {
  let r: number[] = [];
  if (!target) return null;
  if (!gps && walkPath.length >= 4) {
    // what is still ahead of the pretend child
    let s = walkAt;
    r = [kx, kz];
    for (let i = 2; i < walkPath.length; i += 2) {
      const L = Math.hypot(walkPath[i] - walkPath[i - 2], walkPath[i + 1] - walkPath[i - 1]);
      if (s < L) r.push(walkPath[i], walkPath[i + 1]);
      s -= L;
    }
  } else {
    const n = nearestNode(kx, kz, gps ? 120 : 1e9);
    if (n < 0) return null;
    buildTree(standNode(target));
    r = [kx, kz].concat(routeFrom(n));
  }
  if (r.length < 4) return null;
  const d = pathD(r, false);
  const w = Math.max(4, 5 * zoom);
  return [
    <path d={d} stroke="#ffffff" strokeWidth={String(w + 5)} fill="none" viewBox={VB()} style={FULL()} />,
    <path d={d} stroke={ROUTE} strokeWidth={String(w)} fill="none" viewBox={VB()} style={FULL()} />,
  ];
}

function markers() {
  const out: any[] = [];
  const small = zoom < 0.7;
  const order = ANIMALS.filter((a) => a.id !== target).concat(target ? [byId[target]] : []);
  for (const a of order) {
    const p = place(a.id);
    const isT = a.id === target;
    const B = isT ? (small ? 58 : 72) : small ? 32 : 50;
    const X = sx(p.x), Y = sy(p.z) - (isT ? Math.abs(Math.sin(t * 3)) * 8 : 0);
    if (X < -B || X > width + B || Y < -B || Y > height + B) continue;
    out.push(<div style={{ position: "absolute", left: X - B / 2, top: Y - B / 2, width: B, height: B, borderRadius: B / 2,
      backgroundColor: isT ? "#ffffff" : found[a.id] ? a.color : "rgba(255,255,255,0.85)", borderWidth: isT ? 4 : 2,
      borderColor: isT ? "#ff9f1c" : "#ffffff", alignItems: "center", justifyContent: "center",
      shadowColor: "rgba(0,0,0,0.35)", shadowOffsetY: 2, shadowRadius: 3 }} onClick={() => tapAnimal(a.id)}>
      <img src={rigPng(a.id)} style={{ width: B * 0.86, height: B * 0.86 }} />
    </div>);
    if (found[a.id] && !small) out.push(<div style={{ position: "absolute", left: X + B / 2 - 14, top: Y - B / 2 - 6, fontSize: 18 }}>⭐</div>);
  }
  return out;
}

function childMarker() {
  const X = sx(kx), Y = sy(kz);
  const out: any[] = [];
  if (gps && fix) {
    const acc = Math.min(80, fix.acc) * zoom;
    if (acc > 12) out.push(<div style={{ position: "absolute", left: X - acc, top: Y - acc, width: acc * 2, height: acc * 2, borderRadius: acc,
      backgroundColor: "rgba(58,134,255,0.15)", borderWidth: 1, borderColor: "rgba(58,134,255,0.4)" }} />);
  }
  if (gps && !fix) return out;
  const dir = gps ? heading : facing;
  if (dir >= 0 || !gps) {
    out.push(<div style={{ position: "absolute", left: X - 40, top: Y - 40, width: 80, height: 80, transform: "rotate(" + Math.round(dir) + "deg)" }}>
      <path d="M 40 40 L 24 4 Q 40 -2 56 4 Z" fill="rgba(58,134,255,0.35)" viewBox="0 0 80 80" style={{ position: "absolute", left: 0, top: 0, width: 80, height: 80 }} />
    </div>);
  }
  const stale = gps && t - lastFixAt > 15;
  out.push(<div style={{ position: "absolute", left: X - 14, top: Y - 14, width: 28, height: 28, borderRadius: 14, backgroundColor: stale ? "#9aa5b1" : "#3a86ff",
    borderWidth: 4, borderColor: "#ffffff", shadowColor: "rgba(0,0,0,0.35)", shadowRadius: 4 }} />);
  const hop = !gps && walkPath.length ? Math.abs(Math.sin(t * 10)) * 4 : 0;
  out.push(<div style={{ position: "absolute", left: X - 16, top: Y - 50 - hop, width: 32, height: 34, alignItems: "center", fontSize: 28 }}>🧒</div>);
  return out;
}

function roundBtn(label: string, left: number, top: number, onClick: () => void, size?: number, bg?: string) {
  const z = size || 54;
  return <div style={{ position: "absolute", left: left, top: top, width: z, height: z, borderRadius: z / 2, backgroundColor: bg || "#ffffff",
    alignItems: "center", justifyContent: "center", fontSize: z * 0.5, shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 3, shadowRadius: 3 }}
    onClick={onClick}>{label}</div>;
}

function fmtDist(m: number) {
  if (m >= 100) return Math.round(m / 10) * 10 + " m";
  return Math.round(m) + " m";
}

// which way to go, as an arrow turned by the compass (at the zoo)
function arrow(): any {
  if (!target || !gps || !fix) return null;
  const n = nearestNode(kx, kz, 120);
  if (n < 0) return null;
  const r = [kx, kz].concat(routeFrom(n));
  const ahead = pointAlong(r, Math.min(routeLength(r), 20));
  const want = Math.atan2(ahead[0] - kx, -(ahead[1] - kz)) * 180 / Math.PI;
  const rel = heading >= 0 ? want - heading : want;
  return <div style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: ROUTE, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#ffffff" }}>
    <div style={{ width: 56, height: 56, transform: "rotate(" + Math.round(rel) + "deg)" }}>
      <path d="M 28 4 L 50 30 L 36 30 L 36 52 L 20 52 L 20 30 L 6 30 Z" fill="#ffffff" viewBox="0 0 56 56" style={{ position: "absolute", left: 0, top: 0, width: 56, height: 56 }} />
    </div>
  </div>;
}

function banner() {
  if (!target) return null;
  const a = byId[target];
  const sn = standNode(target);
  let dist = 0;
  if (gps) {
    const n = nearestNode(kx, kz, 120);
    if (n >= 0) { buildTree(sn); dist = DIST[n] + Math.hypot(NX[n] - kx, NZ[n] - kz); }
    else dist = Math.hypot(place(target).x - kx, place(target).z - kz);
  } else {
    dist = walkPath.length ? routeLength(walkPath) - walkAt : Math.hypot(NX[sn] - kx, NZ[sn] - kz);
  }
  const k = 1 + bannerPulse * 0.08 * Math.sin(t * 20);
  // room for the close button on the right (48 px)
  return <div style={{ position: "absolute", left: 10, top: 10, width: width - 76, height: 84, borderRadius: 24, backgroundColor: "#ffffff",
    flexDirection: "row", alignItems: "center", shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 4, shadowRadius: 0, transform: "scale(" + k.toFixed(3) + ")" }}
    onClick={() => { rg.say("ks_" + target + "_etsi"); bannerPulse = 0.6; }}>
    <div style={{ width: 72, height: 72, marginLeft: 6, borderRadius: 36, backgroundColor: a.color, alignItems: "center", justifyContent: "center" }}>
      <img src={rigPng(a.id)} style={{ width: 66, height: 66 }} />
    </div>
    <div style={{ marginLeft: 10, flexGrow: 1 }}>
      <div style={{ fontSize: 15, color: "#6c757d", fontWeight: "700" }}>🔍 {rg.t("Etsi", "Find", "Busca")}</div>
      <div style={{ fontSize: a.name.length > 14 ? 15 : 20, color: "#1d3557", fontWeight: "700" }}>{a.name}</div>
      <div style={{ fontSize: 15, color: ROUTE, fontWeight: "700" }}>{"👣 " + fmtDist(dist)}</div>
    </div>
    <div style={{ width: 40, fontSize: 26, alignItems: "center" }}>🔊</div>
  </div>;
}

function gpsNote(): any {
  if (!gps) return null;
  let txt = "", col = "#fb8500";
  if (gpsError === "permission") { txt = rg.t("📍 Sijainnille tarvitaan lupa", "📍 Location permission needed", "📍 Se necesita permiso de ubicación"); col = "#d62828"; }
  else if (gpsError === "gps-off") { txt = rg.t("📍 Laita sijainti päälle", "📍 Turn on location", "📍 Activa la ubicación"); col = "#d62828"; }
  else if (!fix || t - lastFixAt > 30) txt = rg.t("🛰️ Etsitään paikkaa…", "🛰️ Finding your place…", "🛰️ Buscando dónde estás…");
  else if (!onIsland()) { txt = rg.t("🏝️ Et ole Korkeasaaressa", "🏝️ You are not in Korkeasaari", "🏝️ No estás en Korkeasaari"); col = "#6d597a"; }
  else if (fix.acc > 30) { txt = "🛰️ ±" + Math.round(fix.acc) + " m"; col = "#e9c46a"; }
  if (!txt) return null;
  const off = fix && !onIsland();
  return <div style={{ position: "absolute", left: 10, top: 102, width: width - 20, alignItems: "flex-start" }}>
    <div style={{ height: 34, borderRadius: 17, paddingLeft: 14, paddingRight: 14, backgroundColor: col, alignItems: "center", justifyContent: "center",
      color: "#ffffff", fontSize: 15, fontWeight: "700" }}>{txt}</div>
    {off ? <div style={{ marginTop: 8, height: 40, borderRadius: 20, paddingLeft: 14, paddingRight: 14, backgroundColor: "#06d6a0", alignItems: "center",
      justifyContent: "center", color: "#ffffff", fontSize: 16, fontWeight: "700" }} onClick={() => { startMap(false); }}>👆 {rg.t("Kävele kartalla", "Walk on the map", "Camina por el mapa")}</div> : null}
  </div>;
}

function picker() {
  if (!pick) return null;
  const cells = ANIMALS.map((a) => (
    <div style={{ width: 74, height: 86, margin: 4, borderRadius: 18, backgroundColor: found[a.id] ? a.color : "#f1f3f5", alignItems: "center",
      borderWidth: a.id === target ? 3 : 0, borderColor: "#ff9f1c" }} onClick={() => { setTarget(a.id, true); follow = true; }}>
      <img src={rigPng(a.id)} style={{ width: 62, height: 62 }} />
      <div style={{ fontSize: 15 }}>{found[a.id] ? "⭐" : " "}</div>
    </div>
  ));
  return <div style={{ position: "absolute", left: 0, top: 0, width: width, height: height, backgroundColor: "rgba(0,0,0,0.45)" }}
    onClick={() => { pick = false; }}>
    <div style={{ position: "absolute", left: 8, top: 60, width: width - 16, height: height - 120, borderRadius: 26, backgroundColor: "#ffffff", padding: 8 }}>
      <div style={{ fontSize: 20, fontWeight: "700", color: "#1d3557", marginLeft: 8, marginBottom: 4 }}>{rg.t("Kenen luo mennään?", "Who shall we visit?", "¿A quién visitamos?")}</div>
      <div style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>{cells}</div>
    </div>
  </div>;
}

function viewMap() {
  const done = ANIMALS.filter((a) => !!found[a.id]).length;
  return <div style={{ position: "absolute", left: 0, top: 0, width: width, height: height, backgroundColor: SEA }}>
    {tiles()}
    {targetPen()}
    {routeLine()}
    {markers()}
    {childMarker()}
    {banner()}
    {gpsNote()}
    <div style={{ position: "absolute", left: width - 70, top: height - 290 }}>{arrow()}</div>
    {roundBtn("➕", width - 66, height - 212, () => { zoom = Math.min(3, zoom * 1.5); rg.sound("click"); }, 50)}
    {roundBtn("➖", width - 66, height - 154, () => { zoom = Math.max(0.3, zoom / 1.5); rg.sound("click"); }, 50)}
    {follow ? null : roundBtn("📍", width - 66, height - 270, () => { follow = true; rg.sound("click"); }, 50)}
    {roundBtn("🐾", 14, height - 86, () => { pick = true; rg.sound("pop"); rg.say("ks_valitse"); }, 64, "#ffd166")}
    <div style={{ position: "absolute", left: 88, top: height - 78, height: 48, borderRadius: 24, paddingLeft: 14, paddingRight: 14, backgroundColor: "#ffffff",
      alignItems: "center", justifyContent: "center", flexDirection: "row", shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 3, shadowRadius: 3 }}
      onClick={() => { mode = "album"; rg.sound("pop"); }}>
      <div style={{ fontSize: 24 }}>📒</div>
      <div style={{ fontSize: 18, fontWeight: "700", color: "#1d3557", marginLeft: 6 }}>{done + "/" + ANIMALS.length}</div>
    </div>
    <div style={{ position: "absolute", left: width - 160, top: height - 18, width: 156, fontSize: 10, color: "rgba(30,40,60,0.75)", alignItems: "flex-end" }}>{rg.t("© OpenStreetMap-tekijät", "© OpenStreetMap contributors", "© colaboradores de OpenStreetMap")}</div>
    {picker()}
  </div>;
}

// ---- the rigged animals (as in the Kolmården game) ----
type Pose = { ph: number; amp: number; talk: number };
const GAIT: any = { bn: 0, frf: 0, bf: Math.PI, frn: Math.PI };

function joint(kind: string, id: string, p: Pose): number {
  const s = Math.sin;
  if (id === "body") return kind === "bird" ? s(t * 2) * 2 : 0;
  if (id.slice(0, 5) === "thigh") {
    const k = id.slice(6);
    if (kind === "hop") return (k.slice(0, 2) === "fr" ? 24 : -32) * p.amp * Math.max(0, s(p.ph));
    return 24 * p.amp * s(p.ph + (GAIT[k] || 0));
  }
  if (id.slice(0, 4) === "shin") {
    const k = id.slice(5);
    const front = k.slice(0, 2) === "fr";
    return (front ? 1 : -0.6) * 30 * p.amp * Math.max(0, s(p.ph + (GAIT[k] || 0) - 1.4));
  }
  if (id === "head") return kind === "bird" ? s(t * 0.9) * 14 : s(t * 1.4) * 3 + p.talk * s(t * 8) * 4;
  if (id === "neck") return s(t * 1.1) * 3 - p.talk * 3;
  if (id.slice(0, 4) === "tail") {
    const i = +id.slice(4);
    return s(t * 3 - i * 0.8) * (8 + i * 5) + p.amp * s(p.ph * 2) * 5;
  }
  if (id === "wing_r") return -Math.max(0, s(t * 2.5)) * 12 * (1 + p.talk);
  if (id === "ear1" || id === "ear2") return s(t * 2 + (id === "ear1" ? 0 : 1.3)) * 7;
  return 0;
}

function rigPic(name: string, size: number, left: boolean, p: Pose) {
  const r = RIGS[name];
  const k = size / 200;
  const by: any = {};
  for (const q of r.parts) by[q.id] = q;
  const W: any = {};
  const world = (q: any): any => {
    if (W[q.id]) return W[q.id];
    const ang = joint(r.kind, q.id, p);
    let w: any;
    if (q.parent === "") w = { x: q.px, y: q.py, a: ang };
    else {
      const pq = by[q.parent];
      const pw = world(pq);
      const rad = pw.a * Math.PI / 180;
      const dx = q.px - pq.px, dy = q.py - pq.py;
      w = { x: pw.x + dx * Math.cos(rad) - dy * Math.sin(rad), y: pw.y + dx * Math.sin(rad) + dy * Math.cos(rad), a: pw.a + ang };
    }
    W[q.id] = w;
    return w;
  };
  const els: any[] = [];
  for (const q of r.parts) {
    const w = world(q);
    let X = w.x * k;
    const Y = w.y * k;
    let ang = w.a;
    const ox = (q.px - q.x) * k, oy = (q.py - q.y) * k;
    if (left) { X = size - X; ang = -ang; }
    let tr = "";
    if (Math.abs(ang) > 0.05) tr = "rotate(" + ang.toFixed(1) + "deg)";
    if (left) tr += (tr === "" ? "" : " ") + "scale(-1, 1)";
    els.push(<img className="apic" src={rg.asset("rig/" + name + "/" + q.id + ".png")}
      style={{ left: X - ox, top: Y - oy, width: q.w * k, height: q.h * k, transformOrigin: ox.toFixed(1) + "px " + oy.toFixed(1) + "px", transform: tr === "" ? "none" : tr }} />);
  }
  return els;
}

// ---- the visit ----
function viewVisit() {
  const a = byId[target];
  const home = HOMES[a.home[0]];
  const q = qs[qi];
  const S = Math.min(220, width * 0.6);
  // the animal strolls to and fro
  const span = width - S - 20;
  const ph = visitClock * 0.25;
  const pos = (Math.sin(ph) * 0.5 + 0.5) * span;
  const goingLeft = Math.cos(ph) < 0;
  const talk = visitClock < 2 || (advanceAt > 0) ? 1 : 0;
  const hop = RIGS[a.id].kind === "hop" ? Math.abs(Math.sin(visitClock * 5)) * 18 : 0;
  const top = 96;
  const parts: any[] = [];
  parts.push(<div style={{ position: "absolute", left: 0, top: 0, width: width, height: top + S * 0.92, backgroundColor: home.color }} />);
  parts.push(<div style={{ position: "absolute", left: 0, top: top + S * 0.86, width: width, height: height, backgroundColor: "#fefae0" }} />);
  parts.push(<div style={{ position: "absolute", left: 14, top: top + 10, fontSize: 40, opacity: 0.6 }}>{home.icon}</div>);
  parts.push(<div style={{ position: "absolute", left: width - 70, top: top + 30, fontSize: 30, opacity: 0.5 }}>{home.icon}</div>);
  parts.push(<div style={{ position: "absolute", left: 10 + pos, top: top - hop, width: S, height: S }}>
    {rigPic(a.id, S, goingLeft, { ph: visitClock * 6, amp: 0.8, talk: talk })}
  </div>);
  // the name, clear of the close button
  parts.push(<div style={{ position: "absolute", left: 10, top: 12, width: width - 76, height: 52, borderRadius: 22, backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center", flexDirection: "row" }} onClick={() => rg.say("ks_" + a.id)}>
    <div style={{ fontSize: a.name.length > 14 ? 18 : 24, fontWeight: "700", color: "#1d3557" }}>{q && q.kind === "name" && !q.done && sticker === 0 ? "❓" : a.name}</div>
    <div style={{ fontSize: 20, marginLeft: 8 }}>🔊</div>
  </div>);
  // stars: one for each question right at the first go
  const st: any[] = [];
  for (let i = 0; i < qs.length; i++) st.push(<div style={{ width: 30, height: 30, fontSize: 24, opacity: i < stars ? 1 : 0.25 }}>⭐</div>);
  parts.push(<div style={{ position: "absolute", left: 14, top: 76, flexDirection: "row" }}>{st}</div>);
  const qt = top + S + 6;
  if (sticker > 0) parts.push(stickerView(a, qt));
  else if (q) parts.push(questionView(q, qt));
  return <div style={{ position: "absolute", left: 0, top: 0, width: width, height: height, backgroundColor: "#fefae0" }}>{parts}</div>;
}

const QICON: any = { food: "🍽️", home: "🗺️", fact: "🤔", move: "🏃", print: "👣", sleep: "😴", cover: "✋", active: "🕐", size: "📏" };

function questionView(q: Q, top: number) {
  const dx = shake > 0 ? Math.sin(shake * 60) * 6 : 0;
  const opts: any[] = [];
  const n = q.opts.length;
  const W = n === 2 ? 150 : 104, H = q.kind === "animal" ? 118 : 104;
  if (q.kind === "world") return worldView(q, top);
  q.opts.forEach((o: any, i: number) => {
    const isWrong = !!wrong[i];
    const isRight = q.done && i === q.answer;
    let inner: any;
    if (q.kind === "name") {
      opts.push(<div style={{ width: width - 48, height: 54, marginTop: 8, borderRadius: 27, alignItems: "center", justifyContent: "center",
        backgroundColor: isRight ? "#b7efc5" : isWrong ? "#e9ecef" : "#ffffff", opacity: isWrong ? 0.45 : 1,
        borderWidth: 3, borderColor: isRight ? "#2a9d8f" : "#dee2e6", shadowColor: "rgba(0,0,0,0.25)", shadowOffsetY: 4, shadowRadius: 0,
        transform: isWrong && shake > 0 ? "translateX(" + dx.toFixed(1) + "px)" : "none" }}
        onClick={() => answer(i)}>
        <div style={{ fontSize: byId[o].name.length > 16 ? 17 : 22, fontWeight: "700", color: "#1d3557", letterSpacing: 1 }}>{byId[o].name.toUpperCase()}</div>
      </div>);
      return;
    }
    if (q.kind === "animal") inner = <img src={rigPng(o)} style={{ width: H - 14, height: H - 14 }} />;
    else if (q.kind === "food") inner = [<div style={{ fontSize: 50 }}>{FOODS[o].icon}</div>, level === "koulu" ? <div style={{ fontSize: 13, color: "#444" }}>{FOODS[o].name}</div> : null];
    else if (q.kind === "home") inner = [<div style={{ fontSize: 50 }}>{HOMES[o].icon}</div>, level === "koulu" ? <div style={{ fontSize: 13, color: "#444" }}>{HOMES[o].name}</div> : null];
    else if (q.kind === "move" || q.kind === "sleep" || q.kind === "active") {
      const e = (q.kind === "move" ? MOVES : q.kind === "sleep" ? SLEEPS : ACTIVE)[o];
      inner = [<div style={{ fontSize: 50 }}>{e.icon}</div>, level === "koulu" ? <div style={{ fontSize: 13, color: "#444" }}>{e.name}</div> : null];
    } else if (q.kind === "print" || q.kind === "cover") {
      inner = [<img src={rg.asset("kuvat/" + (q.kind === "print" ? "jalki_" : "peite_") + o + ".png")} style={{ width: 64, height: 64 }} />,
        level === "koulu" ? <div style={{ fontSize: 13, color: "#444" }}>{(q.kind === "print" ? PRINTS : COVERS)[o]}</div> : null];
    } else if (q.kind === "size") {
      // the animal beside a child, at their sizes
      const a = byId[target];
      const big = o === "isompi";
      inner = [<div style={{ flexDirection: "row", alignItems: "flex-end", height: 84 }}>
        <div style={{ fontSize: big ? 30 : 60 }}>🧒</div>
        <img src={rigPng(a.id)} style={{ width: big ? 84 : 40, height: big ? 84 : 40 }} />
      </div>, level === "koulu" ? <div style={{ fontSize: 13, color: "#444" }}>{big ? rg.t("Isompi kuin minä", "Bigger than me", "Más grande que yo") : rg.t("Pienempi kuin minä", "Smaller than me", "Más pequeño que yo")}</div> : null];
    }
    else inner = [<div style={{ fontSize: 50 }}>{o ? "👍" : "👎"}</div>, <div style={{ fontSize: 15, color: "#444", fontWeight: "700" }}>{o ? rg.t("Totta", "True", "Verdad") : rg.t("Ei totta", "Not true", "Falso")}</div>];
    opts.push(<div style={{ width: W, height: H, marginLeft: 5, marginRight: 5, borderRadius: 24, alignItems: "center", justifyContent: "center",
      backgroundColor: isRight ? "#b7efc5" : isWrong ? "#e9ecef" : "#ffffff", opacity: isWrong ? 0.45 : 1,
      borderWidth: 3, borderColor: isRight ? "#2a9d8f" : "#dee2e6", shadowColor: "rgba(0,0,0,0.25)", shadowOffsetY: 4, shadowRadius: 0,
      transform: isWrong && shake > 0 ? "translateX(" + dx.toFixed(1) + "px)" : "none" }}
      onClick={() => {
        // the clip of the option first, so a child hears what it chose
        answer(i);
      }}>{inner}</div>);
  });
  const showText = level === "koulu" || q.kind === "fact" || q.kind === "name";
  return <div style={{ position: "absolute", left: 0, top: top, width: width, alignItems: "center" }}>
    <div style={{ width: width - 24, height: showText ? 76 : 56, borderRadius: 20, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center",
      shadowColor: "rgba(0,0,0,0.2)", shadowOffsetY: 3, shadowRadius: 0 }}
      onClick={() => rg.say(q.clip)}>
      <div style={{ width: 48, height: 40, marginLeft: 8, fontSize: 30, alignItems: "center" }}>{QICON[q.kind] || (q.opts.length === 2 ? "⚖️" : "❓")}</div>
      <div style={{ width: width - 24 - 56 - 48, fontSize: 17, color: "#1d3557", fontWeight: "700" }}>{showText ? q.text : ""}</div>
      <div style={{ width: 44, height: 40, fontSize: 26, alignItems: "center" }}>🔊</div>
    </div>
    <div style={{ flexDirection: q.kind === "name" ? "column" : "row", marginTop: q.kind === "name" ? 6 : 14, alignItems: "center" }}>{opts}</div>
  </div>;
}

// the world map: a pin on each of the three continents to choose from; when
// answered, the animal shows where it lives
function worldView(q: Q, top: number) {
  const a = byId[target];
  const M = WORLD_MAP;
  const W = width - 16, H = Math.round(W * M.h / M.w);
  const mx = (lon: number) => 8 + (lon - M.lon0) / (M.lon1 - M.lon0) * W;
  const my = (lat: number) => (M.lat0 - lat) / (M.lat0 - M.lat1) * H;
  const dx = shake > 0 ? Math.sin(shake * 60) * 6 : 0;
  const pins: any[] = [];
  q.opts.forEach((o: any, i: number) => {
    const c = WORLD[o];
    const isWrong = !!wrong[i];
    const isRight = q.done && i === q.answer;
    const B = isRight ? 50 : 44;
    const X = mx(c.lon) + (isWrong && shake > 0 ? dx : 0), Y = my(c.lat);
    pins.push(<div style={{ position: "absolute", left: X - B / 2, top: Y - B / 2, width: B, height: B, borderRadius: B / 2,
      backgroundColor: isWrong ? "#adb5bd" : "#ffffff", borderWidth: 4, borderColor: isRight ? "#2a9d8f" : c.color, opacity: isWrong ? 0.6 : 1,
      alignItems: "center", justifyContent: "center", shadowColor: "rgba(0,0,0,0.35)", shadowOffsetY: 3, shadowRadius: 2 }} onClick={() => answer(i)}>
      <div style={{ fontSize: 22 }}>{isRight ? "✅" : isWrong ? "✖️" : "📍"}</div>
    </div>);
    if (level === "koulu" || isRight) pins.push(<div style={{ position: "absolute", left: X - 60, top: Y + B / 2, width: 120, alignItems: "center" }}>
      <div style={{ fontSize: 12, fontWeight: "700", color: "#1d3557", backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 6, paddingLeft: 4, paddingRight: 4 }}>{c.name}</div>
    </div>);
  });
  if (q.done) {
    const X = mx(a.at[0]), Y = my(a.at[1]);
    const k = 1 + 0.15 * Math.sin(t * 6);
    pins.push(<div style={{ position: "absolute", left: X - 22, top: Y - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: a.color,
      borderWidth: 3, borderColor: "#ffffff", alignItems: "center", justifyContent: "center", transform: "scale(" + k.toFixed(2) + ")" }}>
      <img src={rigPng(a.id)} style={{ width: 40, height: 40 }} />
    </div>);
  }
  const showText = level === "koulu";
  return <div style={{ position: "absolute", left: 0, top: top, width: width, alignItems: "center" }}>
    <div style={{ width: width - 24, height: showText ? 62 : 52, borderRadius: 20, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center",
      shadowColor: "rgba(0,0,0,0.2)", shadowOffsetY: 3, shadowRadius: 0 }} onClick={() => rg.say(q.clip)}>
      <div style={{ width: 48, height: 40, marginLeft: 8, fontSize: 30, alignItems: "center" }}>🌍</div>
      <div style={{ width: width - 24 - 56 - 48, fontSize: 17, color: "#1d3557", fontWeight: "700" }}>{showText ? q.text : ""}</div>
      <div style={{ width: 44, height: 40, fontSize: 26, alignItems: "center" }}>🔊</div>
    </div>
    <div style={{ width: width, height: H + 30, marginTop: 10 }}>
      <img src={rg.asset("kuvat/maailma.png")} style={{ position: "absolute", left: 8, top: 0, width: W, height: H, borderRadius: 12 }} />
      {pins}
    </div>
  </div>;
}

function stickerView(a: Animal, top: number) {
  const k = rg.ease ? sticker : sticker;
  const s = 0.4 + 0.6 * k;
  const all = ANIMALS.every((b) => !!found[b.id]);
  const nxt = nextAnimal();
  return <div style={{ position: "absolute", left: 0, top: top - 10, width: width, alignItems: "center" }}>
    <div style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: a.color, borderWidth: 6, borderColor: "#ffffff", alignItems: "center", justifyContent: "center",
      transform: "scale(" + s.toFixed(2) + ") rotate(" + Math.round((1 - k) * -40) + "deg)", shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 5, shadowRadius: 0 }}>
      <img src={rigPng(a.id)} style={{ width: 130, height: 130 }} />
    </div>
    <div style={{ fontSize: 20, fontWeight: "700", color: "#1d3557", marginTop: 8 }}>{all ? "🏆 " + rg.t("Kaikki tarrat!", "All the stickers!", "¡Todas las pegatinas!") : rg.t("Sait tarran!", "You got a sticker!", "¡Tienes una pegatina!") + " 🎉"}</div>
    <div style={{ flexDirection: "row", marginTop: 12 }}>
      {nxt ? <div style={{ height: 64, borderRadius: 32, paddingLeft: 16, paddingRight: 18, backgroundColor: "#06d6a0", flexDirection: "row", alignItems: "center",
        shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 4, shadowRadius: 0 }}
        onClick={() => { mode = "map"; setTarget(nxt, true); follow = true; }}>
        <div style={{ fontSize: 30 }}>➡️</div>
        <img src={rigPng(nxt)} style={{ width: 54, height: 54, marginLeft: 6 }} />
      </div> : null}
      <div style={{ width: 64, height: 64, borderRadius: 32, marginLeft: 14, backgroundColor: "#ffd166", alignItems: "center", justifyContent: "center",
        fontSize: 30, shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 4, shadowRadius: 0 }}
        onClick={() => { mode = "album"; rg.sound("pop"); }}>📒</div>
    </div>
  </div>;
}

// ---- the album ----
let albumSel = "";
let resetHold = -1;

function viewAlbum() {
  const done = ANIMALS.filter((a) => !!found[a.id]).length;
  const cells = ANIMALS.map((a) => {
    const f = !!found[a.id];
    return <div style={{ width: 76, height: 92, margin: 4, borderRadius: 20, backgroundColor: f ? a.color : "#dee2e6", alignItems: "center",
      borderWidth: albumSel === a.id ? 3 : 0, borderColor: "#1d3557" }}
      onClick={() => { albumSel = a.id; if (f) rg.say("ks_" + a.id); else { rg.sound("tick"); rg.say("ks_" + a.id + "_etsi"); } }}>
      <div style={{ width: 64, height: 64, opacity: f ? 1 : 0.2 }}><img src={rigPng(a.id)} style={{ width: 64, height: 64 }} /></div>
      <div style={{ fontSize: 14 }}>{f ? "⭐".repeat(Math.min(3, found[a.id])) : "❔"}</div>
    </div>;
  });
  const sel = albumSel ? byId[albumSel] : null;
  const card = sel && found[sel.id] ? <div style={{ position: "absolute", left: 12, top: height - 150, width: width - 24, height: 92, borderRadius: 22, backgroundColor: "#ffffff",
    flexDirection: "row", alignItems: "center", paddingLeft: 8, shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 4, shadowRadius: 0 }}
    onClick={() => rg.say("ks_" + sel.id + "_fakta")}>
    <img src={rigPng(sel.id)} style={{ width: 76, height: 76 }} />
    <div style={{ marginLeft: 8, flexShrink: 1 }}>
      <div style={{ fontSize: 18, fontWeight: "700", color: "#1d3557" }}>{sel.name}</div>
      <div style={{ fontSize: 26, flexDirection: "row" }}>{FOODS[sel.eats[0]].icon + " " + HOMES[sel.home[0]].icon + " 🔊"}</div>
    </div>
  </div> : null;
  const holding = resetHold >= 0 ? Math.min(1, (t - resetHold) / 2) : 0;
  if (resetHold >= 0 && holding >= 1) { found = {}; rg.save("found", found); resetHold = -1; rg.sound("whoosh"); }
  return <div style={{ position: "absolute", left: 0, top: 0, width: width, height: height, backgroundColor: "#fff3d6" }}>
    <div style={{ position: "absolute", left: 14, top: 14, flexDirection: "row", alignItems: "center" }}>
      <div style={{ fontSize: 34 }}>📒</div>
      <div style={{ fontSize: 24, fontWeight: "700", color: "#1d3557", marginLeft: 8 }}>{rg.t("Tarrat ", "Stickers ", "Pegatinas ") + done + "/" + ANIMALS.length}</div>
    </div>
    <div style={{ position: "absolute", left: 4, top: 66, width: width - 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>{cells}</div>
    {card}
    {roundBtn("🗺️", 14, height - 50 - 20, () => { mode = target ? "map" : "menu"; if (!target) mode = "menu"; rg.sound("click"); }, 54, "#8ecae6")}
    <div style={{ position: "absolute", left: width - 64, top: height - 64, width: 46, height: 46, borderRadius: 23,
      backgroundColor: "rgba(214,40,40," + (0.25 + holding * 0.75) + ")", alignItems: "center", justifyContent: "center", fontSize: 20 }}
      onPointerDown={() => { resetHold = t; }} onPointerUp={() => { resetHold = -1; }}>↺</div>
  </div>;
}

// ---- the menu ----
function viewMenu() {
  const done = ANIMALS.filter((a) => !!found[a.id]).length;
  const show = ["lumileopardi", "karhu", "tunturipollo", "pikkupanda", "kameli"];
  const big = (icon: string, label: string, color: string, onClick: () => void) =>
    <div style={{ width: 300, height: 74, borderRadius: 26, backgroundColor: color, marginTop: 14, flexDirection: "row", alignItems: "center", paddingLeft: 18,
      shadowColor: "rgba(0,0,0,0.3)", shadowOffsetY: 5, shadowRadius: 0 }} onClick={onClick}>
      <div style={{ fontSize: 40 }}>{icon}</div>
      <div style={{ fontSize: 21, fontWeight: "700", color: "#ffffff", marginLeft: 14 }}>{label}</div>
    </div>;
  const lv = (id: string, icon: string, label: string) =>
    <div style={{ width: 140, height: 50, borderRadius: 25, marginLeft: 6, marginRight: 6, backgroundColor: level === id ? "#1d3557" : "rgba(255,255,255,0.7)",
      flexDirection: "row", alignItems: "center", justifyContent: "center" }}
      onClick={() => { level = id; rg.save("level", level); rg.sound("click"); }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: "700", marginLeft: 6, color: level === id ? "#ffffff" : "#1d3557" }}>{label}</div>
    </div>;
  return <div style={{ position: "absolute", left: 0, top: 0, width: width, height: height, backgroundColor: "#8ecae6", alignItems: "center" }}>
    <div style={{ position: "absolute", left: 0, top: height * 0.55, width: width, height: height, backgroundColor: "#95d5b2" }} />
    <div style={{ marginTop: 34, fontSize: 36, fontWeight: "700", color: "#ffffff" }}>Korkeasaari</div>
    <div style={{ fontSize: 16, color: "#1d3557" }}>{rg.t("Löydä eläimet saarelta!", "Find the animals on the island!", "¡Encuentra los animales de la isla!")}</div>
    <div style={{ flexDirection: "row", marginTop: 8, height: 92 }}>
      {show.map((id, i) => <img src={rigPng(id)} style={{ width: 66, height: 66, marginTop: Math.abs(Math.sin(t * 2 + i)) * -10 + 14 }} />)}
    </div>
    {big("👆", rg.t("Leiki kartalla", "Play on the map", "Jugar en el mapa"), "#ff9f1c", () => startMap(false))}
    {big("📍", rg.t("Olen Korkeasaaressa", "I am in Korkeasaari", "Estoy en Korkeasaari"), "#3a86ff", () => startMap(true))}
    {big("📒", "Tarrat " + done + "/" + ANIMALS.length, "#06d6a0", () => { mode = "album"; rg.sound("pop"); })}
    <div style={{ flexDirection: "row", marginTop: 20 }}>
      {lv("eskari", "🐣", rg.t("Eskari", "Pre-school", "Infantil"))}
      {lv("koulu", "🎒", rg.t("Koulu", "School", "Escuela"))}
    </div>
    <div style={{ position: "absolute", left: 10, top: height - 22, fontSize: 10, color: "rgba(20,40,40,0.7)" }}>{rg.t("Kartta ja eläinten paikat © OpenStreetMap-tekijät (ODbL)", "Map and animal places © OpenStreetMap contributors (ODbL)", "Mapa y lugares de los animales © colaboradores de OpenStreetMap (ODbL)")}</div>
  </div>;
}

function viewLoading() {
  return <div style={{ width: width, height: height, backgroundColor: "#8ecae6", alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontSize: 80 }}>🦁</div>
    <div style={{ fontSize: 26, color: "#ffffff", fontWeight: "700", marginTop: 12 }}>Korkeasaari</div>
  </div>;
}

function view() {
  if (mode === "loading") return viewLoading();
  if (mode === "map") return viewMap();
  if (mode === "visit") return viewVisit();
  if (mode === "album") return viewAlbum();
  return viewMenu();
}

function onBack() {
  if (mode === "map" && pick) { pick = false; return; }
  if (mode === "visit") { mode = "map"; if (sticker > 0) setTarget(nextAnimal(), true); return; }
  if (mode === "map" || mode === "album") { mode = "menu"; rg.sensor("location", false); rg.sensor("heading", false); return; }
  rg.exit();
}

function onClose() {
  if (mode !== "menu") { onBack(); return false; }
  return true;
}

// on the web: d puts the GPS child where the map is (testing at home)
function onKeyDown(k: string) {
  if (mode === "visit" && k === "k" && qs[qi] && !qs[qi].done) answer(qs[qi].answer); // testing: the right answer
  if (mode === "map" && gps && k === "d") { fix = { x: cx, z: cz, acc: 8 }; lastFixAt = t; kx = cx; kz = cz; gpsError = ""; }
}
