// Matka Marsiin (Journey to Mars): what it is like to live and move inside a
// spaceship on its 259 days to Mars. The ship is the International Space
// Station's pressurized modules with their real sizes (tools/three/make-iss.mjs):
// Unity, Destiny, Harmony, Columbus, Kibo, Tranquility with the Cupola,
// Leonardo, BEAM, Quest, PMA-1, Zarya and Zvezda.
//
// Without weight nothing holds you: a push sends you drifting at the same
// speed until you grab a handrail or bump into a wall. Each played day has
// tasks around the ship (breakfast at Zvezda's table, the treadmill, the
// plants, a message home that takes minutes to arrive, Mars out of the
// Cupola's window), and some days an event: the engine burns that leave Earth
// and arrive at Mars, a solar storm, an air leak. The flight is a real Hohmann
// transfer (lib/trip.ts): distances, the light's delay and how big Mars looks
// are true. The crew are glTF models played by THREE.AnimationMixer
// (tools/three/make-astronaut.mjs), in <scene3d> with three.js's names.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODULES, FREE, HATCHES, SPOTS } from "lib/station";
import { MODULE_TEXT, TASKS, DAYS, SAY, CREW_SAYS, CREW_NAMES } from "lib/texts";
import { where, angleAt, R_EARTH, R_MARS, R_SUN, TRANSFER_DAYS } from "lib/trip";

type V = number[];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.sqrt(dot(a, a));
const norm = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const T = (t: string[]) => rg.t(t[0], t[1], t[2]);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// a rotation (quaternion) that turns a model (facing +z, up +y) to face fwd with up
function quatOf(up: V, fwd: V): number[] {
  const z = norm(fwd);
  let x = cross(up, z);
  if (len(x) < 1e-4) x = cross([0, 1, 0], z);
  if (len(x) < 1e-4) x = [1, 0, 0];
  x = norm(x);
  const y = cross(z, x);
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }
  return [qx, qy, qz, qw];
}
function slerp(a: number[], b: number[], t: number): number[] {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i] - v) * t); const l = Math.hypot(r[0], r[1], r[2], r[3]); return r.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return a.map((v, i) => v * ka + bb[i] * kb);
}
// the up and forward of a model turned by q
function qrot(q: number[], v: V): V {
  const [x, y, z, w] = q;
  const uv = cross([x, y, z], v), uuv = cross([x, y, z], uv);
  return add(v, add(mul(uv, 2 * w), mul(uuv, 2)));
}

// ---- the ship -------------------------------------------------------------------
const loader = new GLTFLoader();
const MOD_IDS = MODULES.map((m) => m.id);
const MODELS: any = {};
for (const id of MOD_IDS) MODELS[id] = loader.loadSync("models/m-" + id + ".glb");
const HULL = loader.loadSync("models/hull.glb");
const SKY = loader.loadSync("models/sky.glb");
const SUN = loader.loadSync("models/sun.glb");
const EARTH = loader.loadSync("models/earth.glb");
const MARS = loader.loadSync("models/mars.glb");
const SUIT = loader.loadSync("models/suit.glb");
const ASTRO: any = {};
for (const c of ["blue", "red", "green", "yellow"]) ASTRO[c] = loader.loadSync("models/astro-" + c + ".glb");

// modules next to each other (through a hatch)
const ADJ: { [id: string]: string[] } = {};
for (const id of MOD_IDS) ADJ[id] = [];
for (const h of HATCHES) { ADJ[h.a].push(h.b); ADJ[h.b].push(h.a); }
const hatchAxis = (h: any): V => MODULES[MOD_IDS.indexOf(h.b)].axis;
const WINDOWED = { destiny: 1, kibo: 1, cupola: 1, zvezda: 1, tranquility: 1 } as any;

function inside(p: V, grow = 0): number {
  for (let i = 0; i < FREE.length; i++) {
    const b = FREE[i];
    if (p[0] >= b[0] - grow && p[0] <= b[3] + grow && p[1] >= b[1] - grow && p[1] <= b[4] + grow && p[2] >= b[2] - grow && p[2] <= b[5] + grow) return b[6];
  }
  return -1;
}
// the module a point is in: its free boxes first, then the box around the module
function moduleAt(p: V, last: string): string {
  const i = inside(p);
  if (i >= 0) {
    // in a hatch two modules' boxes overlap: keep the one we were in
    const li = MOD_IDS.indexOf(last);
    if (li >= 0 && li !== i) for (const b of FREE) if (b[6] === li && p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5]) return last;
    return MOD_IDS[i];
  }
  return last;
}
// the way from one module to another: the next module on the way
function nextOnWay(from: string, to: string): string {
  if (from === to) return to;
  const prev: any = {};
  prev[from] = "";
  const q = [from];
  while (q.length) {
    const m = q.shift() as string;
    if (m === to) break;
    for (const n of ADJ[m]) if (prev[n] === undefined) { prev[n] = m; q.push(n); }
  }
  let m = to;
  while (prev[m] !== undefined && prev[m] !== from) m = prev[m];
  return m;
}
function hatchBetween(a: string, b: string) { return HATCHES.find((h) => (h.a === a && h.b === b) || (h.a === b && h.b === a)); }
// modules worth drawing: this one and two hatches on
function nearModules(cur: string): string[] {
  const out = [cur];
  for (const a of ADJ[cur]) { if (out.indexOf(a) < 0) out.push(a); for (const b of ADJ[a]) if (out.indexOf(b) < 0) out.push(b); }
  return out;
}

// ---- state -----------------------------------------------------------------------
type Crew = { model: any; mixer: any; act: any; cur: string; spot: string; clip: string; wave: number; say: number };
type Item = { kind: number; p: V; v: V; rot: number; spin: number; col: string };
let screen = "title";              // title | play | night | end
let dayIdx = rg.load("day", 0);
let tasks: { id: string; done: boolean }[] = [];
let t = 0;
let mod = "harmony";
let lastShownMod = "";
let banner = 0;
let msg = ""; let msgTime = 0;
let pushPtr: any = null, holdPtr: any = null;
let look: any = null;
let yaw = Math.PI, pitch = 0;
let pos: V = [0, 0, 0], vel: V = [0, 0, 0];
let bodyQ = [0, 0, 0, 1];
let firstPerson = rg.load("fp", false);
let showMap = false;
let doing: any = null;             // { task, t, from, fromQ }
let night = 0;                     // the fade between days
let event: any = null;             // { kind, t, phase }
let dose = 0;
let pressure = 101.3;
let leak: any = null;
let bumpT = -9;
let items: Item[] = [];
let crew: Crew[] = [];
let crewTalk = -1, crewTalkT = 0, crewSayIdx = 0;
let shake = 0;
let zoom = 0;
let jump = -1;
let dbg = 0;

const player = (() => {
  const m = ASTRO.blue;
  const model = m.scene.clone();
  const mixer = new THREE.AnimationMixer(model);
  const act: any = {};
  for (const c of m.animations) act[c.name] = mixer.clipAction(c);
  for (const n of ["Push", "Grab"]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
  return { model, mixer, act, cur: "" };
})();
function anim(who: any, name: string, fade = 0.3) {
  if (who.cur === name) return;
  const old = who.cur ? who.act[who.cur] : null;
  const a = who.act[name];
  if (!a) return;
  a.reset().play();
  if (old) a.crossFadeFrom(old, fade); else a.fadeIn(fade);
  who.cur = name;
}
anim(player, "Float");

function makeCrew(color: string): Crew {
  const m = ASTRO[color];
  const model = m.scene.clone();
  const mixer = new THREE.AnimationMixer(model);
  const act: any = {};
  for (const c of m.animations) act[c.name] = mixer.clipAction(c);
  return { model, mixer, act, cur: "", spot: "", clip: "", wave: 0, say: 0 };
}
crew = [makeCrew("red"), makeCrew("green"), makeCrew("yellow")];
const suits = [SUIT.scene.clone(), SUIT.scene.clone()];
const suitMix = suits.map((s: any) => { const mx = new THREE.AnimationMixer(s); mx.clipAction("Hang").play(); return mx; });

rg.seed(Math.floor(Date.now() % 100000) + 1);

// ---- the days ----------------------------------------------------------------------
const CREW_PLACES = [["npc_destiny", "Work"], ["galley2", "Eat"], ["npc_columbus", "Work"], ["npc_kibo", "Work"], ["zvezdadesk", "Work"], ["npc_harmony", "Float"], ["galley3", "Eat"]];
function startDay(i: number) {
  dayIdx = i;
  rg.save("day", i);
  const D = DAYS[i];
  tasks = D.tasks.map((id) => ({ id, done: false }));
  // wake up in front of your cabin
  const s = SPOTS.bed_front;
  pos = add(s.p, mul(s.up, 0.95));
  vel = [0, 0, 0];
  yaw = Math.atan2(s.fwd[2], s.fwd[0]); pitch = 0;
  bodyQ = quatOf(s.up, s.fwd);
  mod = "harmony"; lastShownMod = "";
  doing = null; event = null; leak = null; dose = 0; pressure = 101.3; zoom = 0;
  // the crew go about their own work
  const used = tasks.map((x) => TASKS[x.id].spot);
  const places = CREW_PLACES.filter((p) => used.indexOf(p[0]) < 0 && !(used.indexOf("galley") >= 0 && p[0].indexOf("galley") === 0 && p[0] === "galley3"));
  for (let k = 0; k < crew.length; k++) {
    const p = places[(k * 2 + i) % places.length];
    crew[k].spot = p[0]; crew[k].clip = p[1];
    crew[k].cur = ""; anim(crew[k], p[1], 0.01);
  }
  // loose things floating about
  items = [];
  const homes = ["harmony", "destiny", "unity", "tranquility", "zvezda", "columbus"];
  for (let k = 0; k < 7; k++) {
    const mm = MODULES[MOD_IDS.indexOf(homes[k % homes.length])];
    const b = mm.box;
    const p = [b[0] + (b[3] - b[0]) * rg.random(), b[1] + (b[4] - b[1]) * (0.3 + 0.4 * rg.random()), b[2] + (b[5] - b[2]) * rg.random()];
    if (inside(p) < 0) continue;
    items.push({ kind: k % 4, p, v: [(rg.random() - 0.5) * 0.06, (rg.random() - 0.5) * 0.04, (rg.random() - 0.5) * 0.06], rot: rg.random() * 6, spin: (rg.random() - 0.5) * 1.5, col: ["#4aa3ff", "#f2b630", "#e63946", "#f4f4f4"][k % 4] });
  }
  if (D.event === "arrive") event = { kind: "burn", t: -4, arrive: true };
  if (D.event === "storm") event = { kind: "storm", t: -6 };
  screen = "play";
  rg.music("sounds/hum.wav", { volume: 0.5 });
  say(T(SAY.day) + " " + D.day + ": " + T(TASKS[tasks[0].id].name), 5);
  rg.say(i === 0 ? ["mm_intro", "mm_t_" + tasks[0].id] : "mm_t_" + tasks[0].id);
}
function currentTask(): string {
  if (event && event.kind === "storm" && event.t >= 0 && !event.safe) return "shelter";
  if (leak && !leak.fixed) return "leak";
  const tk = tasks.find((x) => !x.done);
  if (tk) return tk.id;
  if (event && event.kind === "burn") return "";
  if (dayIdx === DAYS.length - 1) return "";
  return "sleep";
}
function spotOf(id: string) {
  if (id === "leak" && leak) return leak.spot;
  return SPOTS[TASKS[id].spot];
}

function say(s: string, time = 6) { msg = s; msgTime = time; }

// ---- where the planets are today --------------------------------------------------
type Sky = { earth: any; mars: any; sun: any; dEarth: number; dMars: number; delay: number };
let skyCache: Sky | null = null, skyDay = -1, skyLast = false;
function skyToday(): Sky {
  const D = DAYS[dayIdx];
  const first = dayIdx === 0, last = dayIdx === DAYS.length - 1 && !(event && event.kind === "burn" && event.t < 16);
  if (skyDay === dayIdx && skyLast === last && skyCache) return skyCache;
  const w = where(first ? 0 : D.day >= 259 ? TRANSFER_DAYS : D.day);
  const RD = 900;
  // the ship turns its Cupola (down, -y) to the planet it is going to
  const dirToward = (ang: number, side: number): V => [Math.sin(ang) * side, -Math.cos(ang), 0];
  let earth: any, mars: any, sun: any;
  let dEarth = w.dEarth, dMars = w.dMars;
  // the arrival day before the braking burn: still coming in, 60 000 km out
  if (D.day >= 259) dMars = Math.max(dMars, 60000);
  if (first) {
    dEarth = R_EARTH + 400;
    earth = { d: [0, -1, 0], r: RD * R_EARTH / dEarth, sunAng: 0.7 };
    mars = null;
    // the Sun high above: the Earth below is in daylight (the Sahara and the Mediterranean)
    sun = { d: [0.34, 0.94, 0], dist: 149.6e6 };
  } else if (last) {
    dMars = R_MARS + 400;
    mars = { d: [0, -1, 0], r: RD * R_MARS / dMars, sunAng: 0.6 };
    earth = null;
    sun = { d: [0.42, 0.9, 0.1], dist: 228e6 };
  } else {
    const ge = angleAt(w.ship, w.mars, w.earth), gs = angleAt(w.ship, w.mars, [0, 0]);
    mars = { d: [0, -1, 0], r: RD * R_MARS / dMars, min: RD * 0.0016, sunAng: gs };
    earth = { d: dirToward(ge, 1), r: RD * R_EARTH / dEarth, min: RD * 0.0014, sunAng: Math.PI - ge };
    sun = { d: dirToward(gs, -1), dist: w.dSun };
  }
  skyCache = { earth, mars, sun, dEarth, dMars, delay: dEarth / 299792.458 };
  skyDay = dayIdx; skyLast = last;
  return skyCache;
}

// ---- moving without weight -------------------------------------------------------
const ACC = 1.1, VMAX = 0.9;
function viewBasis() {
  const f: V = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
  let r = cross(f, [0, 1, 0]);
  if (len(r) < 1e-3) r = [Math.sin(yaw), 0, -Math.cos(yaw)];
  r = norm(r);
  const u = cross(r, f);
  return { f, r, u };
}
function pushDown() { return !!pushPtr || !!(__input.keys["w"] || __input.keys["ArrowUp"] && __input.keys["Shift"]); }
function holdDown() { return !!holdPtr || !!__input.keys["s"]; }

function moveBody(dt: number) {
  const { f, u } = viewBasis();
  const pushing = pushDown() && !doing, holding = holdDown() && !doing;
  if (pushing) {
    vel = add(vel, mul(f, ACC * dt));
    const sp = len(vel);
    if (sp > VMAX) vel = mul(vel, VMAX / sp);
  }
  if (holding) vel = mul(vel, Math.exp(-5 * dt));
  // the engine pushes the ship forward: everything loose falls to the back
  if (event && event.kind === "burn" && event.t >= 0 && event.t < 16 && !holding && !doing) {
    vel = add(vel, [-0.15 * dt, 0, 0]);
    if (len(vel) > 1.1) vel = mul(vel, 1.1 / len(vel));
  }
  vel = mul(vel, Math.exp(-0.03 * dt));     // the air, a little
  // a hatch ahead pulls you to its middle (your hands guide you through)
  const sp = len(vel);
  if (sp > 0.12) for (const h of HATCHES) {
    const d = sub(pos, h.p);
    if (dot(d, d) > 4) continue;
    const ax = hatchAxis(h);
    const along = dot(d, ax);
    const lat = sub(d, mul(ax, along));
    const toward = -Math.sign(along) * dot(vel, ax);
    if (Math.abs(along) < 1.6 && toward > 0.08 && len(lat) < 1.1) {
      const k = Math.min(1, 2.5 * dt);
      pos = sub(pos, mul(lat, k));
      const vl = sub(vel, mul(ax, dot(vel, ax)));
      vel = sub(vel, mul(vl, k));
    }
  }
  // move axis by axis: a wall stops that part of the motion and bounces a little
  let hit = 0;
  if (inside(pos) < 0) { pos = add(pos, mul(vel, dt)); nudgeIn(dt); }
  else for (let k = 0; k < 3; k++) {
    const q = pos.slice();
    q[k] += vel[k] * dt;
    if (inside(q) >= 0) pos = q;
    else { hit = Math.max(hit, Math.abs(vel[k])); vel[k] = -vel[k] * 0.25; }
  }
  if (hit > 0.18 && t - bumpT > 0.4) {
    bumpT = t;
    rg.sound("hit", { volume: Math.min(1, hit) * 0.6, pitch: 0.7 });
    rg.vibrate(Math.round(20 + hit * 40));
    if (hit > 0.45) say(T(SAY.bump), 1.2);
  }
  // the body: upright when still, head first when flying
  const flying = len(vel) > 0.25 && pushing || len(vel) > 0.45;
  const target = flying ? quatOf(f, mul(u, -1)) : quatOf(u, f);
  bodyQ = slerp(bodyQ, target, Math.min(1, dt * (flying ? 2.5 : 3.5)));
  if (!doing) {
    let a = "Float";
    if (event && event.kind === "burn" && event.t > -3 && event.t < 16) a = "Hold";
    else if (holding) a = len(vel) > 0.05 ? "Grab" : "Hold";
    else if (pushing && len(vel) < 0.35) a = "Push";
    else if (flying) a = "Glide";
    anim(player, a, 0.35);
  }
}
// outside every box (after a sharp turn at a hatch): back to the nearest box's middle
function nudgeIn(dt: number) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < FREE.length; i++) {
    const b = FREE[i];
    const c = [clamp(pos[0], b[0], b[3]), clamp(pos[1], b[1], b[4]), clamp(pos[2], b[2], b[5])];
    const d = len(sub(c, pos));
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0) {
    const b = FREE[best];
    const c = [clamp(pos[0], b[0] + 0.02, b[3] - 0.02), clamp(pos[1], b[1] + 0.02, b[4] - 0.02), clamp(pos[2], b[2] + 0.02, b[5] - 0.02)];
    pos = add(pos, mul(sub(c, pos), Math.min(1, 6 * dt)));
    if (bd > 0.6) pos = c;
  }
}

// ---- doing a task ------------------------------------------------------------------
// a task whose place you are at (any of today's, in any order)
function nearTask(): string {
  if (doing) return "";
  const cur = currentTask();
  const ids = cur === "shelter" || cur === "leak" || cur === "sleep" ? [cur] : tasks.filter((x) => !x.done).map((x) => x.id);
  for (const id of ids) {
    const s = spotOf(id);
    if (!s) continue;
    const c = add(s.p, mul(s.up, 0.95));
    if (len(sub(c, pos)) < (id === "leak" ? 1.0 : 1.35)) return id;
  }
  return "";
}
function startTask(id: string) {
  const s = spotOf(id);
  doing = { id, t: 0, from: pos.slice(), fromQ: bodyQ.slice(), to: add(s.p, mul(s.up, 0.95)), toQ: quatOf(s.up, s.fwd) };
  vel = [0, 0, 0];
  rg.sound("click");
  if (id === "sleep") rg.say("mm_hyvaa_yota");
}
function stepTask(dt: number) {
  if (!doing) return;
  const def = TASKS[doing.id];
  doing.t += dt;
  const k = Math.min(1, doing.t / 0.9), e = k * k * (3 - 2 * k);
  pos = add(doing.from, mul(sub(doing.to, doing.from), e));
  bodyQ = slerp(doing.fromQ, doing.toQ, e);
  if (doing.t > 0.5) anim(player, def.anim, 0.4);
  if (doing.id === "cupola" || doing.id === "earth") zoom = Math.min(1, zoom + dt * 0.5);
  if (doing.t >= def.time + 0.9) finishTask(doing.id);
}
function finishTask(id: string) {
  doing = null;
  zoom = 0;
  anim(player, "Float");
  const sky = skyToday();
  let fact = T(TASKS[id].fact);
  if (id === "call") {
    const m = Math.max(1, Math.round(sky.delay / 60));
    fact = rg.t("Viestisi kulkee valon nopeudella " + m + " min. Vastaus tulee aikaisintaan " + 2 * m + " minuutin päästä, joten puhelut eivät onnistu: Maahan lähetetään viestejä.",
      "Your message travels at the speed of light: " + m + " min. The answer comes at least " + 2 * m + " minutes later, so phone calls are impossible: messages are sent instead.",
      "Tu mensaje viaja a la velocidad de la luz: " + m + " min. La respuesta llega al menos " + 2 * m + " minutos después, así que no se puede llamar: se envían mensajes.");
  }
  if (id === "cupola") {
    const dm = sky.dMars;
    fact = dm < 10000 ? T(SAY.burnArrive).split("!")[0] + "! " + rg.t("Mars on 6 779 km leveä. Punainen väri on ruostetta.", "Mars is 6,779 km wide. Its red colour is rust.", "Marte mide 6779 km. Su color rojo es óxido.")
      : rg.t("Mars on " + fmtKm(dm) + " päässä. Se näkyy vasta kameran zoomilla kiekkona.", "Mars is " + fmtKm(dm) + " away. Only the camera's zoom shows it as a disc.", "Marte está a " + fmtKm(dm) + ". Solo el zoom de la cámara lo muestra como un disco.");
  }
  if (id === "sleep") { toNight(); return; }
  if (id === "shelter") { event.safe = true; event.t = Math.max(event.t, 40); }
  if (id === "leak") { leak.fixed = true; pressure = Math.max(pressure, 99); }
  const tk = tasks.find((x) => x.id === id && !x.done);
  if (tk) tk.done = true;
  rg.sound("star"); rg.vibrate(30);
  rg.celebrate(width / 2, height * 0.45);
  say(fact, 10);
  // speak the fact (the call and cupola facts are worked out live, so they have no clip), then what's next
  const next = currentTask();
  const clips: string[] = [];
  if (id !== "call" && id !== "cupola") clips.push("mm_f_" + id);
  if (next === "sleep") clips.push("mm_kaikki_tehty");
  else if (next) clips.push("mm_t_" + next);
  if (clips.length) rg.say(clips);
  // events that come after tasks
  const D = DAYS[dayIdx];
  if (D.event === "leak" && !leak && tasks.filter((x) => x.done).length === 1) startLeak();
  if (!tasks.find((x) => !x.done)) {
    if (D.event === "depart" && !(event && event.done)) event = { kind: "burn", t: -6 };
    else if (dayIdx === DAYS.length - 1) { screen = "end"; rg.say("mm_loppu", { queue: true }); rg.celebrate(width / 2, height / 2, { big: true }); rg.save("day", 0); }
  }
}
function fmtKm(km: number) {
  if (km > 1e6) return (Math.round(km / 1e5) / 10).toFixed(1).replace(".", rg.lang === "en" ? "." : ",") + " " + T(SAY.mkm);
  return Math.round(km / 1000) + " " + T(SAY.kkm);
}
function startLeak() {
  const options = ["zaryabags", "zvezdadesk", "unity", "food", "beam"];
  const id = options[Math.floor(rg.random() * options.length)];
  leak = { spot: SPOTS[id], fixed: false, hiss: 0 };
  rg.sound("sounds/alarm.wav");
  rg.vibrate([80, 60, 80]);
  say(T(SAY.leak), 8);
  rg.say("mm_vuoto");
}
function toNight() {
  night = 0.001;
  screen = "night";
  rg.stopMusic();
}

// ---- events ------------------------------------------------------------------------
function stepEvent(dt: number) {
  if (!event) return;
  const was = event.t;
  event.t += dt;
  if (event.kind === "burn") {
    if (was < -5.5 && event.t >= -5.5) { say(T(SAY.burnSoon), 6); rg.sound("sounds/alarm.wav"); rg.say("mm_moottorit"); }
    if (event.t >= 0 && event.t < 16) {
      shake = 1;
      if (Math.floor(event.t / 1.6) !== Math.floor(was / 1.6)) { rg.sound("sounds/engine.wav", { volume: 0.8 }); rg.vibrate(120); }
      for (const it of items) { it.v = add(it.v, [-0.15 * dt, 0, 0]); if (len(it.v) > 1.1) it.v = mul(it.v, 1.1 / len(it.v)); }
    } else shake = 0;
    if (was < 16 && event.t >= 16) {
      shake = 0;
      if (event.arrive) { skyDay = -1; say(T(SAY.burnArrive), 9); rg.say("mm_perilla"); }
      else { say(T(SAY.burnDepart), 10); rg.say("mm_suunta_mars"); }
      rg.celebrate(width / 2, height / 2, { big: true });
      event.done = true;
    }
    if (event.t > 17 && !event.arrive) { event = { kind: "done", done: true }; say(T(SAY.goSleep), 7); }
    if (event.t > 17 && event.arrive) event = null;
  } else if (event.kind === "storm") {
    if (was < 0 && event.t >= 0) { say(T(SAY.storm), 9); rg.sound("sounds/alarm.wav"); rg.vibrate([80, 60, 80]); rg.say("mm_myrsky"); }
    if (event.t > 0 && !event.safe) dose += dt * (mod === "zvezda" ? 0.2 : 1.0);
    if (event.safe && event.t > 60) event = null;
  }
}

// ---- input -------------------------------------------------------------------------
function onPointerDown(px: number, py: number, info: any) {
  if (screen !== "play") return;
  if (look) return;
  look = { id: info.pointer, x: px, y: py, moved: 0 };
}
function onPointerUp(px: number, py: number, info: any) {
  if (pushPtr === info.pointer) pushPtr = null;
  if (holdPtr === info.pointer) holdPtr = null;
  if (look && look.id === info.pointer) look = null;
}
function steer(dt: number) {
  const ps = __input.pointers || [];
  if (look) {
    let still = false;
    for (const p of ps) if (p.id === look.id && p.down) {
      still = true;
      const dx = p.x - look.x, dy = p.y - look.y;
      look.x = p.x; look.y = p.y;
      if (!doing) {
        yaw += dx * 0.0065;
        pitch = clamp(pitch - dy * 0.0065, -1.5, 1.5);
      }
    }
    if (!still) look = null;
  }
  if (pushPtr !== null && !ps.find((p: any) => p.id === pushPtr && p.down)) pushPtr = null;
  if (holdPtr !== null && !ps.find((p: any) => p.id === holdPtr && p.down)) holdPtr = null;
  const k = __input.keys;
  if (!doing) {
    if (k["ArrowLeft"] || k["a"]) yaw -= dt * 1.6;
    if (k["ArrowRight"] || k["d"]) yaw += dt * 1.6;
    if (k["ArrowUp"] && !k["Shift"]) pitch = clamp(pitch + dt * 1.2, -1.5, 1.5);
    if (k["ArrowDown"]) pitch = clamp(pitch - dt * 1.2, -1.5, 1.5);
  }
}
function onKeyDown(key: string) {
  if (key === "e" || key === "Enter") { const n = nearTask(); if (n) startTask(n); }
  if (key === "v") toggleView();
  if (key === "h") dbg = (dbg + 1) % 4;
  if (key === "j" && screen === "play") startDay(Math.min(DAYS.length - 1, dayIdx + 1));
  if (key === "m") showMap = !showMap;
  if (key === "n" && screen === "play") { for (const x of tasks) x.done = true; finishTask("call"); }
  // test: jump to the next place of work
  if (key === "t" && screen === "play") {
    const ids = Object.keys(SPOTS);
    jump = (jump + 1) % ids.length;
    const s = SPOTS[ids[jump]];
    pos = add(s.p, mul(s.up, 0.95)); vel = [0, 0, 0];
    yaw = Math.atan2(s.fwd[2], s.fwd[0]); pitch = Math.asin(clamp(s.fwd[1], -1, 1)) * 0.8;
    say(ids[jump], 2);
  }
}
function toggleView() { firstPerson = !firstPerson; rg.save("fp", firstPerson); rg.sound("click"); }
function onBack() {
  if (showMap) { showMap = false; return; }
  if (screen === "play") { screen = "title"; rg.stopMusic(); return; }
  rg.exit();
}

// ---- the frame ---------------------------------------------------------------------
function tick(dt: number) {
  dt = Math.min(dt, 0.05);
  t += dt;
  if (msgTime > 0) msgTime -= dt;
  if (banner > 0) banner -= dt;
  if (crewTalkT > 0) crewTalkT -= dt;
  player.mixer.update(dt);
  for (const c of crew) c.mixer.update(dt);
  for (const m of suitMix) m.update(dt);
  if (screen === "night") {
    night += dt / 4.5;
    if (night >= 1) { night = 0; startDay(Math.min(DAYS.length - 1, dayIdx + 1)); }
    return;
  }
  if (screen !== "play") return;
  steer(dt);
  stepEvent(dt);
  stepTask(dt);
  if (!doing) moveBody(dt);
  const m = moduleAt(pos, mod);
  if (m !== mod) mod = m;
  if (mod !== lastShownMod) {
    if (lastShownMod && !doing) rg.say("mm_m_" + mod, { queue: true });   // not on waking up: the day's task is being said then
    lastShownMod = mod; banner = 4.5;
  }
  // the crew: wave when you come close
  for (const c of crew) {
    const s = SPOTS[c.spot];
    const d = len(sub(add(s.p, mul(s.up, 0.95)), pos));
    const burning = event && event.kind === "burn" && event.t > -3 && event.t < 16;
    if (burning) anim(c, "Hold");
    else if (d < 2.2 && c.wave <= 0 && c.say <= 0) { c.wave = 2.4; c.say = 25; anim(c, "Wave"); }
    else if (c.wave > 0) { c.wave -= dt; if (c.wave <= 0) anim(c, c.clip); }
    else anim(c, c.clip);
    if (c.say > 0) c.say -= dt;
  }
  stepItems(dt);
  if (leak && !leak.fixed) {
    pressure = Math.max(95, pressure - dt * 0.02);
    leak.hiss -= dt;
    if (leak.hiss <= 0) {
      leak.hiss = 0.9;
      const d = len(sub(add(leak.spot.p, mul(leak.spot.up, 0.95)), pos));
      rg.sound("sounds/hiss.wav", { volume: clamp(1.4 / (d + 0.5), 0.04, 1) });
    }
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 0.2);
}
function stepItems(dt: number) {
  for (const it of items) {
    it.rot += it.spin * dt;
    const d = sub(it.p, pos);
    const dl = len(d);
    if (dl < 0.5 && dot(vel, d) > 0) {
      it.v = add(mul(vel, 1.3), mul(norm(d), 0.08));
      rg.sound("pop", { volume: 0.4 });
    }
    for (let k = 0; k < 3; k++) {
      const q = it.p.slice();
      q[k] += it.v[k] * dt;
      if (inside(q, 0.2) >= 0) it.p = q; else it.v[k] = -it.v[k] * 0.5;
    }
  }
}

// ---- drawing -----------------------------------------------------------------------
function camera() {
  const { f, r, u } = viewBasis();
  let eye: V, at: V, up: V = u;
  const sh = shake > 0 ? [Math.sin(t * 37) * 0.012 * shake, Math.sin(t * 29) * 0.012 * shake, 0] : [0, 0, 0];
  const head = add(pos, mul(qrot(bodyQ, [0, 1, 0]), 0.62));
  if (doing && (doing.id === "cupola" || doing.id === "earth")) {
    // looking out: the camera turns to the planet and zooms in
    const s = spotOf(doing.id);
    eye = add(s.p, mul(s.up, 1.15));
    at = add(eye, zoom > 0.05 && doing.id === "cupola" ? [0, -1, 0] : [0.12, -1, 0.05]);
    up = [1, 0, 0];
    // the camera's zoom: Mars far away needs a long lens to be a disc
    const sky = skyToday();
    const R = doing.id === "earth" ? R_EARTH : R_MARS, d = doing.id === "earth" ? sky.dEarth : sky.dMars;
    const ang = 2 * Math.asin(Math.min(1, R / d)) * 180 / Math.PI;
    const fz = clamp(ang * 3, 0.8, 78);
    return { eye: add(eye, sh), at, up, fov: 78 + (fz - 78) * zoom, hide: true };
  }
  if (firstPerson) {
    eye = head;
    at = add(eye, f);
    return { eye: add(eye, sh), at, up, fov: 72, hide: true };
  }
  // behind and a little above, pulled in where a wall is closer
  // over the right shoulder: you are a little to the left and low on the screen
  const want = 2.2;
  const back = norm(add(add(mul(f, -1), mul(u, 0.3)), mul(r, 0.16)));
  let d = 0.3;
  for (let s = 0.3; s <= want; s += 0.1) {
    if (inside(add(pos, mul(back, s)), 0.33) < 0) break;
    d = s;
  }
  eye = add(pos, mul(back, d));
  at = add(add(add(pos, mul(f, 2.2)), mul(u, 0.5)), mul(r, 0.18));
  return { eye: add(eye, sh), at, up, fov: 74, hide: d < 0.7 };
}

function planets(sky: Sky) {
  const out = [];
  const D = 900;
  // far away a planet would be smaller than a pixel: it is drawn as a bright dot, except
  // in the camera's zoom, which shows its true size
  const size = (p: any) => Math.max(p.r, (p.min || 0) * (1 - zoom));
  if (sky.earth) out.push(<primitive key="earth" name="earth" object={EARTH.scene} position={mul(sky.earth.d, D)} scale={size(sky.earth)} rotation={[0, 0, Math.atan2(sunDir(sky)[1], sunDir(sky)[0])]} />);
  if (sky.mars) out.push(<primitive key="mars" name="mars" object={MARS.scene} position={mul(sky.mars.d, D)} scale={size(sky.mars)} rotation={[0, 0, Math.atan2(sunDir(sky)[1], sunDir(sky)[0])]} />);
  const sd = sky.sun.d;
  const sr = Math.max(2000 * R_SUN / sky.sun.dist, 7);
  out.push(<primitive key="sun" name="sun" object={SUN.scene} position={mul(sd, 2000)} scale={sr} rotation={[0, 0, Math.atan2(-sd[1], -sd[0])]} />);
  out.push(<primitive key="sky" name="sky" object={SKY.scene} scale={2500} />);
  return out;
}
function sunDir(sky: Sky): V { return sky.sun.d; }

function world() {
  if (screen === "title" || screen === "end") return titleWorld();
  const cam = camera();
  const sky = skyToday();
  const show = nearModules(mod);
  const out = [];
  for (const id of show) out.push(<primitive key={"m" + id} name={"m-" + id} object={MODELS[id].scene} />);
  const outside = WINDOWED[mod] || show.indexOf("cupola") >= 0 && (mod === "tranquility" || mod === "cupola");
  if ((mod === "cupola" || mod === "tranquility") && !(dbg & 1)) out.push(<primitive key="hull" name="hull" object={HULL.scene} />);
  if (show.indexOf("quest") >= 0) {
    for (let k = 0; k < 2; k++) {
      const s = SPOTS["suit" + (k + 1)];
      out.push(<primitive key={"suit" + k} name={"suit" + k} object={suits[k]} position={s.p} quaternion={quatOf(s.up, s.fwd)} />);
    }
  }
  // the crew
  crew.forEach((c, k) => {
    const s = SPOTS[c.spot];
    if (show.indexOf(s.m) < 0) return;
    out.push(<primitive key={"crew" + k} name={"crew" + k} object={c.model} position={s.p} quaternion={quatOf(s.up, s.fwd)} onClick={() => talk(k)} />);
  });
  // you
  if (!cam.hide) {
    out.push(
      <group key="me" name="me" position={pos} quaternion={bodyQ}>
        <primitive name="me-model" object={player.model} position={[0, -0.95, 0]} />
      </group>
    );
  }
  // loose things
  items.forEach((it, k) => {
    if (it.kind === 0) out.push(<mesh key={"it" + k} name={"it" + k} position={it.p}><sphereGeometry args={[0.05, 8, 6]} /><meshLambertMaterial color={it.col} emissive="#123a6a" /></mesh>);
    else if (it.kind === 1) out.push(<mesh key={"it" + k} name={"it" + k} position={it.p} rotation={[it.rot, it.rot * 0.7, 0]}><boxGeometry args={[0.16, 0.2, 0.04]} /><meshLambertMaterial color={it.col} /></mesh>);
    else if (it.kind === 2) out.push(<mesh key={"it" + k} name={"it" + k} position={it.p} rotation={[it.rot, 0, it.rot * 0.5]}><cylinderGeometry args={[0.008, 0.008, 0.15, 5]} /><meshLambertMaterial color={it.col} /></mesh>);
    else out.push(<mesh key={"it" + k} name={"it" + k} position={it.p} rotation={[0, it.rot, it.rot * 0.3]}><boxGeometry args={[0.1, 0.07, 0.1]} /><meshLambertMaterial color={it.col} /></mesh>);
  });
  // where to go: an arrow that floats in front of you
  const goal = goalPoint();
  if (goal && !doing) {
    const { f, u } = viewBasis();
    const ap = firstPerson ? add(cam.eye, add(mul(f, 0.9), mul(u, -0.28))) : add(add(pos, mul(u, 0.95)), mul(f, 0.3));
    const dir = norm(sub(goal, ap));
    out.push(
      <mesh key="arrow" name="arrow" position={ap} quaternion={quatOf(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])}>
        <coneGeometry args={[0.05, 0.16, 8]} />
        <meshBasicMaterial color={leak && !leak.fixed ? "#ff5a5a" : "#3dff8a"} />
      </mesh>
    );
  }
  // tea leaves drifting to the leak
  if (leak && !leak.fixed) {
    const lp = add(leak.spot.p, mul(leak.spot.up, 0.95));
    for (let k = 0; k < 6; k++) {
      const ph = (t * 0.25 + k / 6) % 1;
      const a = k * 2.1;
      const p = add(lp, [Math.cos(a) * (1 - ph) * 0.8, Math.sin(a * 1.3) * (1 - ph) * 0.6, Math.sin(a) * (1 - ph) * 0.8]);
      out.push(<mesh key={"tea" + k} name={"tea" + k} position={p} rotation={[t * 3 + k, t * 2, 0]}><boxGeometry args={[0.03, 0.005, 0.02]} /><meshBasicMaterial color="#5a4a20" /></mesh>);
    }
  }
  return (
    <scene3d>
      <color attach="background" args={["#000000"]} />
      <perspectiveCamera position={cam.eye} lookAt={cam.at} up={cam.up} fov={cam.fov} near={0.04} far={3000} />
      <hemisphereLight args={["#fff8ee", "#7a7f88", 0.95]} />
      <directionalLight position={[0.3, 1, 0.4]} intensity={0.55} />
      {out}
      {outside && !(dbg & 2) ? planets(sky) : null}
    </scene3d>
  );
}
function goalPoint(): V | null {
  const id = currentTask();
  if (!id) return null;
  const s = spotOf(id);
  if (!s) return null;
  if (s.m === mod) return add(s.p, mul(s.up, 0.95));
  const nx = nextOnWay(mod, s.m);
  const h = hatchBetween(mod, nx);
  return h ? h.p : null;
}
function talk(k: number) {
  crewTalk = k; crewTalkT = 7;
  crewSayIdx = (crewSayIdx + 1) % CREW_SAYS.length;
  rg.sound("pop");
  rg.say("mm_c_" + crewSayIdx);
}

function titleWorld() {
  const a = t * 0.06;
  const c: V = [-4, 0, -2];
  const eye: V = add(c, [Math.cos(a) * 62, 22 + Math.sin(t * 0.03) * 6, Math.sin(a) * 62]);
  const end = screen === "end";
  const RD = 900;
  return (
    <scene3d>
      <color attach="background" args={["#000000"]} />
      <perspectiveCamera position={eye} lookAt={[c[0], c[1] - 6, c[2]]} fov={55} near={0.5} far={3000} />
      <hemisphereLight args={["#ffffff", "#5a6a8a", 0.5]} />
      <directionalLight position={[0.75, 0.3, -0.6]} intensity={1.1} />
      <primitive name="hull" object={HULL.scene} />
      {end
        ? <primitive name="mars" object={MARS.scene} position={[0, -RD, 0]} scale={RD * R_MARS / (R_MARS + 400)} rotation={[0, 0, 1.15]} />
        : <primitive name="earth" object={EARTH.scene} position={[0, -RD, 0]} scale={RD * R_EARTH / (R_EARTH + 400)} rotation={[0, 0, 1.22]} />}
      <primitive name="sun" object={SUN.scene} position={mul(norm([0.75, 0.3, -0.6]), 2000)} scale={9} rotation={[0, 0, Math.atan2(-0.3, -0.75)]} />
      <primitive name="sky" object={SKY.scene} scale={2500} />
    </scene3d>
  );
}

function hud() {
  const D = DAYS[dayIdx];
  const sky = skyToday();
  const cur = currentTask();
  const near = nearTask();
  const mt = MODULE_TEXT[mod];
  const toMars = dayIdx === DAYS.length - 1 ? 0 : sky.dMars;
  const out = [];
  out.push(
    <div class="top" key="top">
      <div class="dayline">{T(SAY.day) + " " + D.day + " / 259"}</div>
      <div class="dist">{dayIdx === 0 ? rg.t("Maan kiertoradalla", "In Earth orbit", "En órbita terrestre") : toMars ? T(SAY.toMars) + " " + fmtKm(toMars) + " · " + T(SAY.delay) + " " + Math.max(1, Math.round(sky.delay / 60)) + " " + T(SAY.min) : rg.t("Marsin kiertoradalla", "In Mars orbit", "En órbita marciana")}</div>
      {tasks.map((x) => <div class={"task" + (x.done ? " ok" : x.id === cur ? " cur" : "")} key={"t" + x.id}>{(x.done ? "✓ " : x.id === cur ? "▶ " : "○ ") + T(TASKS[x.id].name)}</div>)}
      {cur === "sleep" ? <div class="task cur">{"▶ " + T(TASKS.sleep.name)}</div> : null}
      {cur === "shelter" ? <div class="task alarm">{"⚠ " + T(TASKS.shelter.name)}</div> : null}
      {cur === "leak" ? <div class="task alarm">{"⚠ " + T(TASKS.leak.name)}</div> : null}
    </div>
  );
  out.push(
    <div class="tools" key="tools">
      <div class="tbtn" onClick={() => { showMap = !showMap; rg.sound("click"); }}>🗺</div>
      <div class="tbtn" onClick={toggleView}>{firstPerson ? "👁" : "🧑‍🚀"}</div>
    </div>
  );
  if (banner > 0 && mt) {
    out.push(
      <div class="banner" key="banner" style={{ opacity: Math.min(1, banner) }}>
        <div class="bname">{T(mt.name)}</div>
        <div class="binfo">{T(mt.info)}</div>
      </div>
    );
  }
  if (event && event.kind === "storm" && event.t >= 0 && !event.safe || dose > 0.01 && event && event.kind === "storm") {
    out.push(<div class="meter" key="rad"><div class="mlabel">{"☢ " + T(SAY.radiation)}</div><div class="mbar"><div class="mfill rad" style={{ width: Math.min(140, dose * 2.5) }} /></div></div>);
  }
  if (leak && !leak.fixed) {
    out.push(<div class="meter" key="pres"><div class="mlabel">{T(SAY.pressure) + " " + pressure.toFixed(1) + " kPa"}</div><div class="mbar"><div class="mfill pres" style={{ width: Math.max(0, (pressure - 95) / 6.3 * 140) }} /></div></div>);
  }
  if (event && event.kind === "burn" && event.t > -5.5 && event.t < 16) {
    out.push(<div class="burnwrap" key="burn"><div class="burn">{event.t < 0 ? String(Math.ceil(-event.t)) : T(SAY.burnNow)}</div></div>);
  }
  if (doing) {
    const def = TASKS[doing.id];
    const k = clamp((doing.t - 0.9) / def.time, 0, 1);
    out.push(<div class="doing" key="doing"><div class="dname">{T(def.name)}</div><div class="pbar"><div class="pfill" style={{ width: Math.round(k * 220) }} /></div></div>);
  }
  if (msgTime > 0 && msg) out.push(<div class="msgbox" key="msg" onClick={() => { msgTime = 0; }}><div class="msg">{msg}</div></div>);
  if (crewTalkT > 0 && crewTalk >= 0) out.push(<div class="msgbox talk" key="talk" onClick={() => { crewTalkT = 0; }}><div class="msg"><div class="who">{T(CREW_NAMES[crewTalk])}</div>{T(CREW_SAYS[crewSayIdx])}</div></div>);
  // the buttons
  out.push(
    <div class="bar" key="bar">
      <div class={"round hold" + (holdDown() ? " on" : "")} onPointerDown={(e: any) => { holdPtr = e.pointer; }} onPointerUp={(e: any) => { if (holdPtr === e.pointer) holdPtr = null; }}>
        <div class="ricon">✋</div><div class="rtext">{T(SAY.hold)}</div>
      </div>
      {near ? <div class="dobtn" onClick={() => startTask(near)}>{T(SAY.doit) + T(TASKS[near].name)}</div> : <div class="dospace" />}
      <div class={"round push" + (pushDown() ? " on" : "")} onPointerDown={(e: any) => { pushPtr = e.pointer; rg.sound("whoosh", { volume: 0.25 }); }} onPointerUp={(e: any) => { if (pushPtr === e.pointer) pushPtr = null; }}>
        <div class="ricon">⬆</div><div class="rtext">{T(SAY.push)}</div>
      </div>
    </div>
  );
  out.push(<div class="speed" key="spd">{(Math.round(len(vel) * 10) / 10).toFixed(1) + " m/s"}</div>);
  if (showMap) out.push(mapView());
  return out;
}

// the ship from above (x to the right, z down the screen)
function mapView() {
  const W = Math.min(width - 24, 340);
  const x0 = -32, x1 = 21, z0 = -15, z1 = 10.5;
  const k = W / (x1 - x0);
  const H = (z1 - z0) * k;
  const boxes = [];
  for (const m of MODULES) {
    if (m.id === "cupola") continue;
    const b = m.box;
    const pad = 0.9;
    const l = (Math.min(b[0], b[3]) - pad - x0) * k, r = (Math.max(b[0], b[3]) + pad - x0) * k;
    const tp = (Math.min(b[2], b[5]) - pad - z0) * k, bt = (Math.max(b[2], b[5]) + pad - z0) * k;
    const cur = m.id === mod;
    const target = (() => { const id = currentTask(); const s = id ? spotOf(id) : null; return s && s.m === m.id; })();
    boxes.push(<div key={"mb" + m.id} class={"mbox" + (cur ? " here" : target ? " goal" : "")} style={{ left: l, top: tp, width: r - l, height: bt - tp }} />);
  }
  const names = [];
  for (const m of MODULES) {
    if (m.id === "pma1") continue;
    const b = m.box;
    const cx = ((b[0] + b[3]) / 2 - x0) * k, cz = ((b[2] + b[5]) / 2 - z0) * k + (m.id === "cupola" ? 10 : 0);
    names.push(<div key={"mn" + m.id} class="mname" style={{ left: cx - 40, top: cz - 7 }}>{T(MODULE_TEXT[m.id].name).split(" ·")[0]}</div>);
  }
  const me = <div key="me" class="mdot" style={{ left: (pos[0] - x0) * k - 6, top: (pos[2] - z0) * k - 6 }} />;
  return (
    <div class="mapwrap" key="map" onClick={() => { showMap = false; }}>
      <div class="maptitle">{T(SAY.mapTitle)}</div>
      <div class="map" style={{ width: W, height: H }}>{boxes}{names}{me}</div>
      <div class="mapclose">{T(SAY.close)}</div>
    </div>
  );
}

function view() {
  return (
    <div class="screen">
      {world()}
      {screen === "play" ? hud() : null}
      {screen === "night" ? <div class="night" style={{ opacity: Math.min(1, night * 3, (1 - night) * 3) }}><div class="ntext">{T(SAY.nightNext)}</div><div class="nday">{T(SAY.day) + " " + DAYS[Math.min(DAYS.length - 1, dayIdx + 1)].day}</div></div> : null}
      {screen === "title" ? (
        <div class="menu">
          <div class="mtitle">{T(SAY.title)}</div>
          <div class="mintro">{T(SAY.intro)}</div>
          {dayIdx > 0 ? <div class="btn" onClick={() => startDay(dayIdx)}>{T(SAY.cont) + " · " + T(SAY.day) + " " + DAYS[dayIdx].day}</div> : null}
          <div class={"btn" + (dayIdx > 0 ? " alt" : "")} onClick={() => startDay(0)}>{dayIdx > 0 ? T(SAY.restart) : T(SAY.start)}</div>
        </div>
      ) : null}
      {screen === "end" ? (
        <div class="menu">
          <div class="mtitle">{rg.t("Perillä!", "We made it!", "¡Llegamos!")}</div>
          <div class="mintro">{T(SAY.end)}</div>
          <div class="btn" onClick={() => { screen = "title"; dayIdx = 0; }}>{T(SAY.restart)}</div>
        </div>
      ) : null}
    </div>
  );
}

function init() {
  if (dayIdx >= DAYS.length) dayIdx = 0;
}
