// Tampereen liikenneretki: a child walks through the centre of Tampere to a
// goal (mum's or dad's home, school, day care, a park, a tram
// stop, a sight). Streets are crossed only on zebra crossings: wait for the
// green man at the lights, look out for cars at the other crossings and for
// bikes on the cycle paths. The tram (lines 1 and 3) can be ridden from stop
// to stop. The map is drawn from Tampere Taxi Driver's map data (OSM and the
// city's own data) by tools/tampere/build_map.py.
//
// Coordinates are metres, x east and z south, as in Tampere Taxi Driver.

import { MAP, WALK } from "lib/mapdata";
import { PHOTOS } from "lib/photos";

type Car = { road: number; s: number; v: number; len: number; wid: number; color: string; bus: boolean; honk: number; wait: number };
type Bike = { path: number; s: number; dir: number; v: number; color: string; ring: number; stop: number };
type Tram = { line: number; s: number; dir: number; v: number; dwell: number; stopIdx: number; lastStop: number; key: number };
type Place = { id: string; name: string; kind: string; x: number; z: number; icon: string };
type Mode = "start" | "gpswait" | "goal" | "how" | "play" | "ride" | "win";
type Bit = { x: number; y: number; vx: number; vy: number; t: number; c: string; r: number };

const X0: number = MAP.X0, Z0: number = MAP.Z0, MW: number = MAP.W, MH: number = MAP.H;
const CELL: number = MAP.CELL, GW: number = MAP.GW, GH: number = MAP.GH;
const TILE: number = MAP.TILE, TPPM: number = MAP.PPM;
const WALK_SPEED = 6.5;          // m/s: a child in a hurry (the map is big)
const CYCLE = 18;                // traffic light cycle, s
const ZOOMS = [3, 4.5, 6];

let mode: Mode = "start";
let t = 0;
let modeClock = 0;
let zoomIdx = 1;
let Z = ZOOMS[1];
let places: Place[] = [];
let homes: Place[] = [];
let startPlace: Place | null = null;
let goal: Place | null = null;
let goalChoices: Place[] = [];
let goalPhoto: any = null;       // {f, by, lic} of the goal, shown when picking it and on arrival
let peekUntil = 0;               // the goal's photo is shown on top until this time
function photosOf(p: Place | null): any[] { return p && PHOTOS[p.id] ? PHOTOS[p.id] : []; }
let kid = { x: 0, z: 0, face: 0, step: 0, moving: false, safeX: 0, safeZ: 0, tx: 0, tz: 0 };
let cam = { x: 0, z: 0 };
let hearts = 3;
let points = 0;
let roundPoints = 0;
let total = 0;
let found = 0;
let hurt = 0;
let msg = "";
let msgClock = 0;
let msgKind = "info";
let walking = false;
let showMap = false;
let cars: Car[] = [];
let bikes: Bike[] = [];
let trams: Tram[] = [];
// The trams run to Nysse's real timetable (lib/mapdata.ts from the GTFS feed),
// on the game clock: Finnish time now, plus what ⏩ has skipped.
let clockStart = 0;      // seconds after midnight when the game started
let clockDay = 0;        // 0 Mon-Thu, 1 Fri, 2 Sat, 3 Sun
let clockShift = 0;
let nightNote = false;   // no trams at night: the game runs at noon instead
let ridingKey = -1;
// walking to the goal by tram: board at one stop, get off at another
let plan: any = null;    // { board: Place, alight: Place, stage: 0 walk to stop | 1 on the tram | 2 walk to goal, walkM, tramM }
let nearRoads: number[] = [];
let nearBikes: number[] = [];
let nearClock = 0;
let inCross = -1;
let lastCross = -1;
let crossOk = true;
let waitedRed = false;
let redWait = 0;
let rewardClock = 0;
let riding = -1;         // index of the tram the child is on (trams is rebuilt every frame: see ridingKey)
let rideFrom = "";
let bits: Bit[] = [];
let roadHint = 0;
let celebrate = 0;
let debugOn = false;
// GPS: the child's real position drives the walk, and a route is shown
let gps = false;
let gpsFix: any = null;         // { x, z, acc, time }
let gpsWait = 0;
let gpsMsg = "";
let route: number[] = [];       // x, z, x, z ... from the child to the goal
let routeClock = 0;
let routeCross: number[] = [];  // crossings on the route
const LAT0 = 61.4994, LON0 = 23.764;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110950;
function lonToX(lon: number) { return (lon - LON0) * KX; }
function latToZ(lat: number) { return -(lat - LAT0) * KY; }

// ---- map data -------------------------------------------------------------

const rowCache: any[] = [];
function row(gz: number) {
  let r = rowCache[gz];
  if (r) return r;
  const parts = WALK[gz].split(".");
  const ends: number[] = [];
  const vals: number[] = [];
  let x = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    x += parseInt(p.slice(1), 36);
    ends.push(x);
    vals.push(parseInt(p.charAt(0), 10));
  }
  r = { ends, vals };
  rowCache[gz] = r;
  return r;
}

// 0 blocked, 1 walk, 2 road, 3 crossing, 4 cycle path, 5 tram track
function cell(x: number, z: number): number {
  const gx = Math.floor((x - X0) / CELL), gz = Math.floor((z - Z0) / CELL);
  if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) return 0;
  const r = row(gz);
  let lo = 0, hi = r.ends.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (r.ends[m] > gx) hi = m; else lo = m + 1;
  }
  return r.vals[lo];
}

type Line = { pts: number[]; cum: number[]; len: number };
function makeLine(p: number[]): Line {
  const cum = [0];
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    acc += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    cum.push(acc);
  }
  return { pts: p, cum, len: acc };
}
// position and heading at distance s along a line
function along(l: Line, s: number) {
  const c = l.cum;
  if (s <= 0) s = 0;
  if (s >= l.len) s = l.len;
  let lo = 0, hi = c.length - 1;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (c[m] <= s) lo = m; else hi = m;
  }
  const seg = c[hi] - c[lo] || 1;
  const k = (s - c[lo]) / seg;
  const ax = l.pts[lo * 2], az = l.pts[lo * 2 + 1], bx = l.pts[hi * 2], bz = l.pts[hi * 2 + 1];
  return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, a: Math.atan2(bz - az, bx - ax) };
}

const roadLines: Line[] = [];
const roadsFrom: number[][] = [];
const bikeLines: Line[] = [];
const bikeNext: number[][][] = [];   // [path][end 0|1] -> list of [path, end]
const tramLines: Line[] = [];
const tramStops: any[] = [];         // per line: [{s, name, place}]
const tramCross: any[] = [];         // per line: [[s, crossing, phase forward, phase backward]]
const crossBuckets: any = {};

function bucketKey(x: number, z: number) { return Math.floor(x / 40) + ":" + Math.floor(z / 40); }

// the places' names in English and Spanish (lib/mapdata.ts has the Finnish
// ones); tram stops keep their Finnish names
const PLACE_NAMES: any = {
  koti: ["Mum's home", "Casa de mamá"], isa: ["Dad's home", "Casa de papá"],
  koulu: ["School", "Colegio"], paivakoti: ["Daycare", "Guardería"],
  pikkukakkonen: ["Pikku Kakkonen park", "Parque Pikku Kakkonen"], koskipuisto: ["Rapids Park", "Parque de los rápidos"],
  nasinpuisto: ["Näsinpuisto park", "Parque Näsinpuisto"], hameenpuisto: ["Hämeenpuisto park", "Parque Hämeenpuisto"],
  kirkkopuisto: ["Pyynikki church park", "Parque de la iglesia de Pyynikki"], siltasen: ["Aleksandra Siltanen park", "Parque Aleksandra Siltanen"],
  sorinaukio: ["Sori square playground", "Parque infantil de la plaza Sori"], tuomiokirkonpuisto: ["Cathedral park", "Parque de la catedral"],
  keskustori: ["Central Square", "Plaza central"], tuomiokirkko: ["Cathedral", "Catedral"], asema: ["Railway station", "Estación de tren"],
  kauppahalli: ["Market hall", "Mercado"], koskikeskus: ["Koskikeskus shopping centre", "Centro comercial Koskikeskus"],
  nasinneula: ["Särkänniemi and Näsinneula", "Särkänniemi y Näsinneula"], finlayson: ["Finlayson", "Finlayson"],
  metso: ["Metso library", "Biblioteca Metso"], tampella: ["Tampella", "Tampella"],
};

function setupMap() {
  places = MAP.places;
  const li = rg.lang === "en" ? 0 : rg.lang === "es" ? 1 : -1;
  if (li >= 0) for (let i = 0; i < places.length; i++) { const n = PLACE_NAMES[places[i].id]; if (n) places[i].name = n[li]; }
  // real homes, school and day care from places.local.js beside this file
  // (git-ignored, so they never go to GitHub):
  // export const PLACES = { koti: { lat, lon }, koulu: { lat, lon, name, name_en, name_es }, ... }
  // (a name is used in every language unless name_en / name_es is given; the
  // homes keep "Mum's home" / "Dad's home" in English and Spanish without them)
  try {
    const m = __cerxesImport("places.local");
    const lp = m && m.PLACES;
    for (let i = 0; i < places.length; i++) {
      const h = lp && lp[places[i].id];
      if (h && typeof h.lat === "number") { const q = nearestWalk(lonToX(h.lon), latToZ(h.lat)); places[i].x = q.x; places[i].z = q.z; }
      const own = h && (rg.lang === "en" ? h.name_en : rg.lang === "es" ? h.name_es : h.name);
      if (typeof own === "string") places[i].name = own;
      else if (h && typeof h.name === "string" && (rg.lang === "fi" || (places[i].id !== "koti" && places[i].id !== "isa"))) places[i].name = h.name;
    }
  } catch (e) { }
  for (let i = 0; i < MAP.roads.length; i++) {
    const r = MAP.roads[i];
    roadLines.push(makeLine(r.p));
    if (!roadsFrom[r.f]) roadsFrom[r.f] = [];
    roadsFrom[r.f].push(i);
  }
  for (let i = 0; i < MAP.bikes.length; i++) bikeLines.push(makeLine(MAP.bikes[i]));
  for (let i = 0; i < bikeLines.length; i++) {
    bikeNext.push([[], []]);
    for (let e = 0; e < 2; e++) {
      const p = bikeLines[i].pts;
      const x = e === 0 ? p[0] : p[p.length - 2], z = e === 0 ? p[1] : p[p.length - 1];
      for (let j = 0; j < bikeLines.length; j++) {
        if (j === i) continue;
        const q = bikeLines[j].pts;
        if (Math.hypot(q[0] - x, q[1] - z) < 4) bikeNext[i][e].push([j, 0]);
        else if (Math.hypot(q[q.length - 2] - x, q[q.length - 1] - z) < 4) bikeNext[i][e].push([j, 1]);
      }
    }
  }
  for (let i = 0; i < MAP.trams.length; i++) {
    const tr = MAP.trams[i];
    const l = makeLine(tr.p);
    tramLines.push(l);
    const st: any[] = [];
    for (let k = 0; k < tr.stops.length; k++) {
      const pl = findPlace("stop:" + tr.stops[k][1]);
      st.push({ s: tr.stops[k][0], name: tr.stops[k][1], place: pl });
    }
    tramStops.push(st);
    const cr: any[] = [];
    for (let k = 0; k < tr.x.length; k++) {
      const s = tr.x[k][0], ci = tr.x[k][1];
      const c = MAP.crossings[ci];
      let pf = -1, pb = -1;
      if (c[4] >= 0) {
        const axis = MAP.inters[c[4]][2];
        const a = along(l, s).a;
        pf = angDiff(a, axis) < Math.PI / 4 ? 0 : 1;
        pb = pf;
      }
      cr.push([s, ci, pf, pb]);
    }
    tramCross.push(cr);
  }
  for (let i = 0; i < MAP.crossings.length; i++) {
    const c = MAP.crossings[i];
    const mx = (c[0] + c[2]) / 2, mz = (c[1] + c[3]) / 2;
    const k = bucketKey(mx, mz);
    if (!crossBuckets[k]) crossBuckets[k] = [];
    crossBuckets[k].push(i);
  }
  // the four homes the game starts from
  homes = [findPlace("koti"), findPlace("isa"), findPlace("koulu"), findPlace("paivakoti")];
  // mum and dad wait at their homes (Emoji 11 at most: the phone's font is old)
  homes[0].icon = "👩";
  homes[1].icon = "👨";
  // tram stops no line serves are only places on the map
  places = places.filter((p) => p.kind !== "stop" || onTram(p.id));
}

function onTram(id: string) {
  for (let i = 0; i < tramStops.length; i++) for (let k = 0; k < tramStops[i].length; k++) if (tramStops[i][k].place && tramStops[i][k].place.id === id) return true;
  return false;
}

function findPlace(id: string): Place {
  for (let i = 0; i < MAP.places.length; i++) if (MAP.places[i].id === id) return MAP.places[i];
  return MAP.places[0];
}

function angDiff(a: number, b: number) {
  let d = Math.abs((a - b) % Math.PI);
  if (d < 0) d += Math.PI;
  return Math.min(d, Math.PI - d);
}

// the crossing under a point, or -1
function crossingAt(x: number, z: number): number {
  let best = -1, bd = 3.2;
  const bx = Math.floor(x / 40), bz = Math.floor(z / 40);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const list = crossBuckets[(bx + dx) + ":" + (bz + dz)];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const c = MAP.crossings[list[i]];
      const d = segDist(x, z, c[0], c[1], c[2], c[3]);
      if (d < bd) { bd = d; best = list[i]; }
    }
  }
  return best;
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz || 1;
  let k = ((px - ax) * dx + (pz - az) * dz) / L;
  k = k < -0.15 ? -0.15 : k > 1.15 ? 1.15 : k;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}

// ---- traffic lights ---------------------------------------------------------

// where the light cycle of an intersection is: [active phase or -1, seconds into it]
function lightState(inter: number) {
  const off = MAP.inters[inter][3];
  const c = (t + off) % CYCLE;
  if (c < 8) return [0, c];
  if (c < 9) return [-1, 0];
  if (c < 17) return [1, c - 9];
  return [-1, 0];
}
// the walk light of a crossing: "green", "blink" or "red"
function walkLight(ci: number): string {
  const c = MAP.crossings[ci];
  if (c[4] < 0) return "none";
  const st = lightState(c[4]);
  if (st[0] !== c[5]) return "red";
  return st[1] < 5.5 ? "green" : "blink";
}
// may a vehicle of this phase drive through
function carGo(inter: number, phase: number): boolean {
  const st = lightState(inter);
  return st[0] === phase && st[1] < 7.2;
}

// ---- game flow --------------------------------------------------------------

function init() {
  total = rg.load("points", 0);
  found = rg.load("found", 0);
  setupMap();
  startPlace = homes[0];
  placeKid(startPlace);
  initClock();
  stepTrams(0);
}

function placeKid(p: Place) {
  kid.x = p.x; kid.z = p.z; kid.safeX = p.x; kid.safeZ = p.z;
  cam.x = kid.x; cam.z = kid.z;
  cars = []; bikes = [];
  nearClock = 0;
}

function chooseStart(p: Place) {
  rg.sound("click");
  stopGps();
  startPlace = p;
  placeKid(p);
  makeGoalChoices();
  mode = "goal";
  modeClock = 0;
}

function pickNear(kind: string, n: number): Place[] {
  const list = places.filter((p) => p.kind === kind && Math.hypot(p.x - kid.x, p.z - kid.z) > 120);
  list.sort((a, b) => Math.hypot(a.x - kid.x, a.z - kid.z) - Math.hypot(b.x - kid.x, b.z - kid.z));
  const pool = list.slice(0, Math.max(n, 4));
  return rg.shuffle(pool).slice(0, n);
}

function makeGoalChoices() {
  const out: Place[] = [];
  for (let i = 0; i < homes.length; i++) if (Math.hypot(homes[i].x - kid.x, homes[i].z - kid.z) > 60) out.push(homes[i]);
  const park = pickNear("park", 1);
  const stop = pickNear("stop", 1);
  const sight = pickNear("sight", 1);
  goalChoices = out.concat(park, stop, sight);
}

function chooseGoal(p: Place) {
  rg.sound("coin");
  goal = p;
  const ph = photosOf(p);
  goalPhoto = ph.length ? ph[Math.floor(Math.random() * ph.length)] : null;
  peekUntil = goalPhoto ? t + 5 : 0;
  hearts = 3;
  roundPoints = 0;
  riding = -1; ridingKey = -1;
  showMap = false;
  plan = makePlan(p);
  if (plan) { mode = "how"; modeClock = 0; return; }
  startTrip();
}

// walk or tram: a tram is worth it when the walks to and from the stops are
// shorter than walking all the way (and the ride is at least 300 m)
function makePlan(g: Place): any {
  if (g.kind === "stop") return null;
  const direct = Math.hypot(g.x - kid.x, g.z - kid.z);
  if (direct < 450) return null;
  const stops = places.filter((q) => q.kind === "stop");
  let best: any = null;
  for (let i = 0; i < stops.length; i++) {
    for (let j = 0; j < stops.length; j++) {
      const b = stops[i], a = stops[j];
      if (i === j) continue;
      let tramM = -1;
      for (let l = 0; l < tramStops.length; l++) {
        let sb = -1, sa = -1;
        for (let k = 0; k < tramStops[l].length; k++) {
          if (tramStops[l][k].name === b.name) sb = tramStops[l][k].s;
          if (tramStops[l][k].name === a.name) sa = tramStops[l][k].s;
        }
        if (sb >= 0 && sa >= 0) tramM = Math.abs(sa - sb);
      }
      if (tramM < 0) continue;
      const walkM = Math.hypot(b.x - kid.x, b.z - kid.z) + Math.hypot(g.x - a.x, g.z - a.z);
      if (tramM >= 300 && walkM < direct * 0.85 && (!best || walkM < best.walkM)) best = { board: b, alight: a, stage: 0, walkM, tramM, direct };
    }
  }
  return best;
}

function chooseHow(byTram: boolean) {
  if (modeClock < 0.5) return;     // the tap that picked the goal must not pick this too
  rg.sound("click");
  if (!byTram) plan = null;
  startTrip();
}

function startTrip() {
  const p = goal as Place;
  mode = "play";
  modeClock = 0;
  if (gps) {
    kid.tx = kid.x; kid.tz = kid.z;
    updateRoute();
    routeClock = 0;
    route = [];
    say(rg.t("Lasketaan reittiä " + goalPhrase(p) + "…", "Finding the way to " + goalPhrase(p) + "…", "Calculando la ruta a " + goalPhrase(p) + "…"), "info", 3);
  } else {
    say(plan ? rg.t("Kävele ratikkapysäkille " + plan.board.name + "! Nuoli näyttää suunnan.", "Walk to the tram stop " + plan.board.name + "! The arrow shows the way.", "¡Camina hasta la parada de tranvía " + plan.board.name + "! La flecha te indica el camino.") : rg.t("Etsi " + goalPhrase(p) + "! Nuoli näyttää suunnan.", "Find " + goalPhrase(p) + "! The arrow shows the way.", "¡Busca " + goalPhrase(p) + "! La flecha te indica el camino."), "info", 4);
  }
}

function goalPhrase(p: Place) {
  if (p.id === "koti") return rg.t("äidin luo", "mum's home", "la casa de mamá");
  if (p.id === "isa") return rg.t("isän luo", "dad's home", "la casa de papá");
  if (p.kind === "stop") return rg.t("ratikkapysäkki ", "the tram stop ", "la parada de tranvía ") + p.name;
  return p.name;
}

function say(text: string, kind: string, secs: number) {
  msg = text; msgKind = kind; msgClock = secs;
}

function addPoints(n: number, why: string) {
  points += n;
  roundPoints += n;
  say("+" + n + " " + why, "good", 2.5);
}

function mistake(text: string) {
  if (hurt > 0 || gps) return;
  hearts--;
  hurt = 1.6;
  rg.vibrate([120, 60, 120]);
  rg.sound("wrong");
  kid.x = kid.safeX; kid.z = kid.safeZ;
  walking = false;
  if (hearts <= 0) {
    say(rg.t("Harjoitellaan vielä! Aloitetaan alusta.", "Let's practise more! Back to the start.", "¡Practiquemos más! Volvemos al principio."), "bad", 4);
    hearts = 3;
    if (startPlace) placeKid(startPlace);
  } else {
    say(text, "bad", 3.5);
  }
}

function win() {
  mode = "win";
  modeClock = 0;
  celebrate = 0;
  const bonus = 50 + hearts * 20;
  points += bonus;
  roundPoints += bonus;
  total += roundPoints;
  found++;
  rg.save("points", total);
  rg.save("found", found);
  rg.sound("win");
  rg.music("happy");
  rg.vibrate([80, 60, 80, 60, 250]);
  rg.celebrate(width / 2, height * 0.4, { big: true, sound: false });
}

function nextTrip() {
  rg.stopMusic();
  if (goal) startPlace = goal;
  makeGoalChoices();
  mode = "goal";
  modeClock = 0;
}

function onClose() {
  if (mode === "play" || mode === "ride" || mode === "win" || mode === "goal") { onBack(); return false; }
  return true;
}

function onBack() {
  if (showMap) { showMap = false; return; }
  if (mode === "play" || mode === "ride") { mode = "goal"; riding = -1; makeGoalChoices(); return; }
  if (mode === "goal") { stopGps(); mode = "start"; return; }
  if (mode === "gpswait") { stopGps(); mode = "start"; return; }
  if (mode === "win") { nextTrip(); return; }
  rg.exit();
}

// ---- input ----------------------------------------------------------------------

function onPointerDown(x: number, y: number) {
  if (mode === "play" && !showMap) walking = true;
}
function onPointerUp() { walking = false; }

function onKeyDown(key: string) {
  if (key === "m" || key === "M") showMap = !showMap;
  if (key === "z" || key === "Z") cycleZoom();
  if (key === "g") debugOn = !debugOn;
  // for testing: T jumps to the next tram stop
  if ((key === "t" || key === "T") && mode === "play") {
    const st = places.filter((p) => p.kind === "stop");
    const p = st[(st.indexOf(stopNear() as any) + 1) % st.length];
    kid.x = p.x; kid.z = p.z; kid.safeX = p.x; kid.safeZ = p.z; cars = []; bikes = []; nearClock = 0;
  }
}

function cycleZoom() {
  zoomIdx = (zoomIdx + 1) % ZOOMS.length;
  Z = ZOOMS[zoomIdx];
  rg.sound("click");
}

// ---- GPS ---------------------------------------------------------------------

function startGps() {
  rg.sound("click");
  gps = true;
  gpsFix = null;
  gpsWait = 0;
  gpsMsg = rg.t("Haetaan sijaintia… mene ulos taivaan alle.", "Finding your location… go outside under the open sky.", "Buscando tu ubicación… sal al aire libre.");
  rg.sensor("location", true);
  mode = "gpswait";
  modeClock = 0;
}

function stopGps() {
  if (gps) rg.sensor("location", false);
  gps = false;
  route = [];
}

function onLocation(f: any) {
  if (!f || typeof f.lat !== "number") return;
  const x = lonToX(f.lon), z = latToZ(f.lat);
  gpsFix = { x, z, acc: f.accuracy || 0, time: t };
  if (x < X0 + 5 || x > X0 + MW - 5 || z < Z0 + 5 || z > Z0 + MH - 5) {
    gpsMsg = rg.t("Olet kartan ulkopuolella. Kartta kattaa Tampereen keskustan.", "You are outside the map. The map covers Tampere city centre.", "Estás fuera del mapa. El mapa cubre el centro de Tampere.");
    return;
  }
  // onto the nearest walkable spot (GPS drifts into buildings and streets)
  const p = nearestWalk(x, z);
  if (mode === "gpswait") {
    kid.x = p.x; kid.z = p.z; kid.safeX = p.x; kid.safeZ = p.z;
    cam.x = kid.x; cam.z = kid.z;
    startPlace = { id: "gps", name: rg.t("Oma sijainti", "My location", "Mi ubicación"), kind: "gps", x: p.x, z: p.z, icon: "📍" };
    cars = []; bikes = []; nearClock = 0;
    makeGoalChoices();
    mode = "goal";
    modeClock = 0;
    rg.sound("coin");
    return;
  }
  kid.tx = p.x; kid.tz = p.z;
}

function onSensor(kind: string, data: any) {
  if (kind !== "error" || !data || data.sensor !== "location") return;
  gpsMsg = data.reason === "permission" ? rg.t("Sijaintilupa puuttuu. Salli sijainti puhelimen asetuksista.", "No location permission. Allow location in the phone's settings.", "Falta el permiso de ubicación. Actívalo en los ajustes del teléfono.")
    : data.reason === "gps-off" ? rg.t("GPS on pois päältä. Laita sijainti päälle.", "GPS is off. Turn on location.", "El GPS está apagado. Activa la ubicación.")
    : rg.t("Sijaintia ei saatu tästä laitteesta.", "This device could not get a location.", "Este dispositivo no pudo obtener la ubicación.");
}

function nearestWalk(x: number, z: number) {
  for (let r = 0; r < 30; r++) {
    for (let k = 0; k < Math.max(1, r * 8); k++) {
      const a = k / Math.max(1, r * 8) * Math.PI * 2;
      const px = x + Math.cos(a) * r * CELL, pz = z + Math.sin(a) * r * CELL;
      const c = cell(px, pz);
      if (c === 1 || c === 4) return { x: px, z: pz };
    }
  }
  return { x, z };
}

// A* over the walk grid: sidewalks, paths and crossings, never across a
// carriageway. It runs a slice at a time (an old phone needs a few frames);
// the result is x, z pairs from the child to the goal, [] when not found.
function cellClass(i: number): number {
  const z = Math.floor(i / GW), x = i - z * GW;
  const r = row(z);
  let lo = 0, hi = r.ends.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (r.ends[m] > x) hi = m; else lo = m + 1; }
  return r.vals[lo];
}
function walkable(c: number) { return c === 1 || c === 3 || c === 4; }

function makeRouteJob(fx: number, fz: number, tx: number, tz: number): any {
  const sx0 = Math.floor((fx - X0) / CELL), sz0 = Math.floor((fz - Z0) / CELL);
  const job: any = { gx: Math.floor((tx - X0) / CELL), gz: Math.floor((tz - Z0) / CELL), start: sz0 * GW + sx0,
    g: {}, from: {}, closed: {}, heap: [], steps: 0, done: false, result: [] };
  job.g[job.start] = 0;
  heapPush(job.heap, routeH(job, job.start), job.start);
  return job;
}
function routeH(job: any, i: number) {
  const z = Math.floor(i / GW), x = i - z * GW;
  return Math.hypot(x - job.gx, z - job.gz) * 1.5;
}
function heapPush(heap: number[], f: number, i: number) {
  heap.push(f, i);
  let k = heap.length / 2 - 1;
  while (k > 0) {
    const pk = (k - 1) >> 1;
    if (heap[pk * 2] <= heap[k * 2]) break;
    const tf = heap[pk * 2], ti = heap[pk * 2 + 1];
    heap[pk * 2] = heap[k * 2]; heap[pk * 2 + 1] = heap[k * 2 + 1];
    heap[k * 2] = tf; heap[k * 2 + 1] = ti;
    k = pk;
  }
}
function heapPop(heap: number[]): number {
  const i = heap[1];
  const li = heap.pop() as number;
  const lf = heap.pop() as number;
  if (heap.length > 0) {
    heap[0] = lf; heap[1] = li;
    let k = 0;
    const n = heap.length / 2;
    while (true) {
      const a = k * 2 + 1, b = k * 2 + 2;
      let m = k;
      if (a < n && heap[a * 2] < heap[m * 2]) m = a;
      if (b < n && heap[b * 2] < heap[m * 2]) m = b;
      if (m === k) break;
      const tf = heap[m * 2], ti = heap[m * 2 + 1];
      heap[m * 2] = heap[k * 2]; heap[m * 2 + 1] = heap[k * 2 + 1];
      heap[k * 2] = tf; heap[k * 2 + 1] = ti;
      k = m;
    }
  }
  return i;
}
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];
// a slice of the search; true when finished
function runRouteJob(job: any, budget: number): boolean {
  if (job.done) return true;
  const heap = job.heap, g = job.g, from = job.from, closed = job.closed;
  let n = 0;
  while (heap.length && n < budget) {
    const i = heapPop(heap);
    if (closed[i]) continue;
    closed[i] = 1;
    n++; job.steps++;
    const z = Math.floor(i / GW), x = i - z * GW;
    if (Math.abs(x - job.gx) + Math.abs(z - job.gz) <= 2) { finishRoute(job, i); return true; }
    const gi = g[i];
    for (let d = 0; d < 8; d++) {
      const nx = x + DX8[d], nz = z + DZ8[d];
      if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
      const j = nz * GW + nx;
      if (closed[j]) continue;
      const c = cellClass(j);
      if (!walkable(c)) continue;
      if (d >= 4 && (!walkable(cellClass(z * GW + nx)) || !walkable(cellClass(nz * GW + x)))) continue;
      const ng = gi + (d >= 4 ? 1.414 : 1) * (c === 4 ? 1.4 : c === 3 ? 1.2 : 1);
      if (g[j] === undefined || ng < g[j]) {
        g[j] = ng; from[j] = i;
        heapPush(heap, ng + routeH(job, j), j);
      }
    }
  }
  if (!heap.length || job.steps > 250000) { job.done = true; job.result = []; return true; }
  return false;
}
function finishRoute(job: any, end: number) {
  const pts: number[] = [];
  let i = end, n = 0;
  while (true) {
    if (n % 2 === 0 || i === job.start) {
      const z = Math.floor(i / GW), x = i - z * GW;
      pts.push(X0 + (x + 0.5) * CELL, Z0 + (z + 0.5) * CELL);
    }
    n++;
    if (i === job.start) break;
    i = job.from[i];
  }
  const rev: number[] = [];
  for (let k = pts.length - 2; k >= 0; k -= 2) rev.push(pts[k], pts[k + 1]);
  job.done = true;
  job.result = rev;
}
let routeJob: any = null;

function updateRoute() {
  if (!goal) return;
  const g = target();
  routeJob = makeRouteJob(kid.x, kid.z, g.x, g.z);
}
function updateRouteIfGps() { if (gps) { updateRoute(); routeClock = 0; route = []; } }
// where the child heads now: the stop to board at, then the goal
function target(): any {
  if (plan && plan.stage === 0) return plan.board;
  if (plan && plan.stage === 1) return plan.alight;
  return goal;
}
function routeReady() {
  route = routeJob.result;
  routeJob = null;
  routeCross = [];
  for (let k = 0; k < route.length; k += 2) {
    if (cell(route[k], route[k + 1]) === 3) {
      const ci = crossingAt(route[k], route[k + 1]);
      if (ci >= 0 && routeCross.indexOf(ci) < 0) routeCross.push(ci);
    }
  }
}

// how far the child is from the route, metres
function offRoute(): number {
  let best = 1e9;
  for (let k = 0; k + 3 < route.length; k += 2) {
    const d = segDist(kid.x, kid.z, route[k], route[k + 1], route[k + 2], route[k + 3]);
    if (d < best) best = d;
  }
  return best;
}

// ---- the child --------------------------------------------------------------

function moveKid(dt: number, input: any) {
  let dx = 0, dz = 0;
  const k = input.keys;
  if (k.ArrowLeft || k.a) dx -= 1;
  if (k.ArrowRight || k.d) dx += 1;
  if (k.ArrowUp || k.w) dz -= 1;
  if (k.ArrowDown || k.s) dz += 1;
  if (walking && input.pointer.down) {
    const sx = (kid.x - cam.x) * Z + width / 2, sy = (kid.z - cam.z) * Z + height / 2;
    const px = input.pointer.x - sx, py = input.pointer.y - sy;
    const d = Math.hypot(px, py);
    if (d > 14) { dx = px / d; dz = py / d; }
  } else if (!input.pointer.down) walking = false;
  const L = Math.hypot(dx, dz);
  kid.moving = L > 0;
  if (!kid.moving) { redWaitCheck(dt); return; }
  dx /= L; dz /= L;
  kid.face = Math.atan2(dz, dx);
  kid.step += dt * 9;
  const dist = WALK_SPEED * dt;
  const n = Math.max(1, Math.ceil(dist / 0.5));
  for (let i = 0; i < n; i++) {
    const sx = dx * dist / n, sz = dz * dist / n;
    if (!tryStep(kid.x + sx, kid.z + sz)) {
      if (Math.abs(sx) > 0.01 && tryStep(kid.x + sx, kid.z)) continue;
      if (Math.abs(sz) > 0.01 && tryStep(kid.x, kid.z + sz)) continue;
      break;
    }
  }
}

// one small step; false when the way is shut
function tryStep(x: number, z: number): boolean {
  const c = cell(x, z);
  if (c === 0) return false;
  if (c === 2 || c === 5) {
    if (roadHint <= 0) {
      say(rg.t("Kadun yli vain suojatietä pitkin!", "Cross the street only at a zebra crossing!", "¡Cruza la calle solo por el paso de cebra!") + " 🦓", "info", 2.5);
      rg.sound("tick");
      roadHint = 3;
    }
    return false;
  }
  if (c === 3) {
    const ci = crossingAt(x, z);
    if (inCross < 0 && ci >= 0) {
      // stepping onto a crossing: the light, then the cars
      const wl = walkLight(ci);
      if (wl === "red") { mistake(rg.t("Punainen valo! Odota vihreää ukkoa.", "Red light! Wait for the green man.", "¡Luz roja! Espera al muñeco verde.") + " 🔴"); return false; }
      if (carComing(ci)) { honkNear(ci); mistake(rg.t("Auto tulee! Katso ensin vasemmalle ja oikealle.", "A car is coming! Look left and right first.", "¡Viene un coche! Mira primero a la izquierda y a la derecha.") + " 🚗"); return false; }
      inCross = ci;
      crossOk = true;
    }
  } else {
    if (inCross >= 0) {
      // off the crossing on the other side
      const c0 = MAP.crossings[inCross];
      if (crossOk && rewardClock <= 0 && inCross !== lastCross) {
        if (c0[4] >= 0) addPoints(waitedRed ? 15 : 10, waitedRed ? rg.t("Odotit vihreää valoa!", "You waited for the green light!", "¡Esperaste la luz verde!") : rg.t("Ylitit vihreällä!", "You crossed on green!", "¡Cruzaste en verde!"));
        else addPoints(5, rg.t("Hyvin katsottu!", "Good looking!", "¡Bien mirado!"));
        rg.celebrate(sx(kid.x), sy(kid.z), { count: c0[4] >= 0 ? 18 : 10 });
        rewardClock = 2;
      }
      lastCross = inCross;
      inCross = -1;
      waitedRed = false;
    }
    kid.safeX = x; kid.safeZ = z;
  }
  kid.x = x; kid.z = z;
  return true;
}

// standing still next to a red light earns the "waited for green" bonus
function redWaitCheck(dt: number) {
  if (inCross >= 0) return;
  for (let r = 0; r < 4; r++) {
    const a = r * Math.PI / 2;
    const c = cell(kid.x + Math.cos(a) * 3, kid.z + Math.sin(a) * 3);
    if (c === 3) {
      const ci = crossingAt(kid.x + Math.cos(a) * 3, kid.z + Math.sin(a) * 3);
      if (ci >= 0 && walkLight(ci) === "red") {
        redWait += dt;
        if (redWait > 1.2 && !waitedRed) { waitedRed = true; say(rg.t("Hyvä, odotat vihreää!", "Good, you are waiting for green!", "¡Bien, esperas la luz verde!") + " 🟢", "good", 2); }
      }
      return;
    }
  }
}

function carComing(ci: number): boolean {
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.v < 2) continue;
    const st = MAP.roads[c.road].s;
    for (let k = 0; k < st.length; k++) {
      if (st[k][1] !== ci) continue;
      const ahead = st[k][0] - c.s;
      if (ahead > -2 && ahead < 6 + c.v * 1.6) return true;
    }
  }
  for (let i = 0; i < trams.length; i++) {
    const tr = trams[i];
    if (tr.v < 1) continue;
    const cr = tramCross[tr.line];
    for (let k = 0; k < cr.length; k++) {
      if (cr[k][1] !== ci) continue;
      const ahead = (cr[k][0] - tr.s) * tr.dir;
      if (ahead > -30 && ahead < 25) return true;
    }
  }
  return false;
}

function honkNear(ci: number) {
  for (let i = 0; i < cars.length; i++) {
    const st = MAP.roads[cars[i].road].s;
    for (let k = 0; k < st.length; k++) if (st[k][1] === ci) cars[i].honk = 1;
  }
  rg.sound("hit", { pitch: 0.5 });
}

// ---- traffic ------------------------------------------------------------------

const CAR_COLORS = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#ffffff", "#ffd166", "#8d99ae", "#6a4c93", "#222831"];

function refreshNear() {
  nearRoads = [];
  for (let i = 0; i < MAP.roads.length; i++) {
    const p = MAP.roads[i].p;
    const m = (p.length >> 2) << 1;
    if (Math.hypot(p[m] - kid.x, p[m + 1] - kid.z) < 260) nearRoads.push(i);
  }
  nearBikes = [];
  for (let i = 0; i < bikeLines.length; i++) {
    const p = bikeLines[i].pts;
    const m = (p.length >> 2) << 1;
    if (Math.hypot(p[m] - kid.x, p[m + 1] - kid.z) < 180) nearBikes.push(i);
  }
}

function spawnTraffic(first: boolean) {
  let tries = 0;
  while (cars.length < 14 && nearRoads.length > 0 && tries < 20) {
    tries++;
    const r = rg.pick(nearRoads);
    const l = roadLines[r];
    const s = rg.random() * l.len;
    const p = along(l, s);
    const d = Math.hypot(p.x - kid.x, p.z - kid.z);
    if (!first && d < 70) continue;
    if (d < 25) continue;
    if (carAt(r, s, 10)) continue;
    const bus = MAP.roads[r].c <= 2 && rg.random() < 0.18;
    cars.push({ road: r, s, v: 6, len: bus ? 12 : 4.6, wid: bus ? 2.6 : 2.0, color: bus ? "#1d6fb8" : rg.pick(CAR_COLORS), bus, honk: 0, wait: 0 });
  }
  tries = 0;
  while (bikes.length < 5 && nearBikes.length > 0 && tries < 10) {
    tries++;
    const b = rg.pick(nearBikes);
    const l = bikeLines[b];
    const s = rg.random() * l.len;
    const p = along(l, s);
    const d = Math.hypot(p.x - kid.x, p.z - kid.z);
    if (d < (first ? 30 : 60)) continue;
    bikes.push({ path: b, s, dir: rg.random() < 0.5 ? 1 : -1, v: 4.5, color: rg.pick(CAR_COLORS), ring: 0, stop: 0 });
  }
}

function carAt(road: number, s: number, gap: number): boolean {
  for (let i = 0; i < cars.length; i++) if (cars[i].road === road && Math.abs(cars[i].s - s) < gap) return true;
  return false;
}

function stepCars(dt: number) {
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    const road = MAP.roads[c.road];
    const l = roadLines[c.road];
    const cruise = road.c === 1 ? 11 : road.c === 2 ? 9.5 : 7.5;
    let limit = cruise;
    // crossings and lights ahead
    const st = road.s;
    for (let k = 0; k < st.length; k++) {
      const ahead = st[k][0] - c.s - c.len / 2;
      if (ahead < -1 || ahead > 30) continue;
      const ci = st[k][1];
      let stop = false;
      if (st[k][2] >= 0 && st[k][3] >= 0 && !carGo(st[k][2], st[k][3]) && ahead > 1.5) stop = true;
      if (inCross === ci) stop = true;
      if (!stop && kidNearCross(ci) && ahead > 1) stop = true;
      if (stop) limit = Math.min(limit, Math.max(0, (ahead - 2.5) * 1.4));
    }
    // the car in front
    for (let j = 0; j < cars.length; j++) {
      if (j === i) continue;
      const o = cars[j];
      if (o.road === c.road && o.s > c.s) {
        const gap = o.s - c.s - (o.len + c.len) / 2;
        if (gap < 20) limit = Math.min(limit, Math.max(0, (gap - 2.5) * 1.2));
      }
    }
    // the tram on the same street (a car never runs into it)
    c.v += (limit > c.v ? 3.5 : -12) * dt;
    if (c.v > limit && limit < 0.5) c.v = Math.max(0, c.v - 18 * dt);
    if (c.v < 0) c.v = 0;
    if (c.v > cruise) c.v = cruise;
    c.s += c.v * dt;
    if (c.honk > 0) c.honk -= dt;
    if (c.s > l.len) {
      // the next street: anything but straight back
      const outs = roadsFrom[road.t] || [];
      const choices = outs.filter((o) => MAP.roads[o].t !== road.f);
      const pool = choices.length ? choices : outs;
      if (!pool.length) { cars.splice(i, 1); continue; }
      const next = rg.pick(pool);
      c.wait += dt;
      if (carAt(next, 0, 7) && c.wait < 3) { c.s = l.len; c.v = 0; continue; }
      c.wait = 0;
      c.s -= l.len;
      c.road = next;
    }
    const p = along(roadLines[c.road], c.s);
    if (Math.hypot(p.x - kid.x, p.z - kid.z) > 330) cars.splice(i, 1);
  }
}

// the child stands at the kerb of the crossing, about to step on it
function kidNearCross(ci: number): boolean {
  const c = MAP.crossings[ci];
  const da = Math.hypot(kid.x - c[0], kid.z - c[1]), db = Math.hypot(kid.x - c[2], kid.z - c[3]);
  return (da < 4 || db < 4) && kid.moving;
}

function stepBikes(dt: number) {
  for (let i = bikes.length - 1; i >= 0; i--) {
    const b = bikes[i];
    const l = bikeLines[b.path];
    const p = along(l, b.s);
    const hx = Math.cos(p.a) * b.dir, hz = Math.sin(p.a) * b.dir;
    const rx = kid.x - p.x, rz = kid.z - p.z;
    const ahead = rx * hx + rz * hz, side = Math.abs(-rx * hz + rz * hx);
    let target = 4.5;
    if (ahead > 0 && ahead < 12 && side < 2.5 && mode === "play") {
      target = 1.5;
      if (b.ring <= 0) { rg.sound("note", { pitch: 2.2, volume: 0.6 }); b.ring = 2.5; }
    }
    if (Math.hypot(rx, rz) < 1.5 && mode === "play" && hurt <= 0) {
      b.stop = 1.2;
      mistake(rg.t("Varo pyöräilijää! Pyörätiellä kävellään reunassa.", "Watch out for the bike! Walk at the edge of the bike path.", "¡Cuidado con la bici! Camina por el borde del carril bici.") + " 🚲");
    }
    if (b.ring > 0) b.ring -= dt;
    if (b.stop > 0) { b.stop -= dt; target = 0; }
    b.v += (target - b.v) * Math.min(1, dt * 3);
    b.s += b.v * b.dir * dt;
    if (b.s < 0 || b.s > l.len) {
      const end = b.s < 0 ? 0 : 1;
      const nx = bikeNext[b.path][end];
      if (!nx.length) { bikes.splice(i, 1); continue; }
      const n = rg.pick(nx);
      b.path = n[0];
      b.dir = n[1] === 0 ? 1 : -1;
      b.s = n[1] === 0 ? 0 : bikeLines[n[0]].len;
    }
    if (Math.hypot(p.x - kid.x, p.z - kid.z) > 220) bikes.splice(i, 1);
  }
}

// ---- the clock and the timetable -------------------------------------------------

// Finnish local time from the UTC clock (EET, EEST from the last Sunday of March
// to the last Sunday of October, 01:00 UTC); the phone's interpreter may not know
// the time zone, so it is worked out here.
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function lastSundayUtc(y: number, m: number): number {
  const last = daysFromCivil(y, m + 1, 1) - 1;          // last day of month m
  const wd = (last + 4) % 7;                            // 0 = Sunday
  return (last - wd) * 86400 + 3600;
}
function finnishNow(): any {
  const u = Math.floor(Date.now() / 1000);
  const days = Math.floor(u / 86400);
  // civil year of the UTC day
  const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const mo = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (mo <= 2 ? 1 : 0);
  const summer = u >= lastSundayUtc(y, 3) && u < lastSundayUtc(y, 10);
  const local = u + (summer ? 3 : 2) * 3600;
  const ld = Math.floor(local / 86400);
  const wd = (ld + 4) % 7;                              // 0 Sunday .. 6 Saturday
  return { sec: local - ld * 86400, day: wd === 0 ? 3 : wd === 6 ? 2 : wd === 5 ? 1 : 0 };
}
function initClock() {
  const n = finnishNow();
  clockStart = n.sec; clockDay = n.day;
  // at night no tram runs: play at noon
  if (nextDeparture(-1, "", clockStart) > 40 * 60) { clockShift = 12 * 3600 - clockStart; nightNote = true; }
}
function clockNow(): number { return clockStart + t + clockShift; }
function clockText(sec: number): string {
  const m = Math.floor(sec / 60) % 1440;
  const mm = m % 60;
  return Math.floor(m / 60) + ":" + (mm < 10 ? "0" : "") + mm;
}

const TRAM_V = 8;        // m/s between the map edge and the first stop
const DWELL = 14;        // seconds at a stop
// the stops of a trip in driving order, with arrival and departure times
function tripTimes(line: number, di: number, t0: number): any[] {
  const st = tramStops[line];
  const off = MAP.trams[line].tt[clockDay][di].off;
  const n = st.length;
  const out: any[] = [];
  let prevD = -1e9, prevS = 0;
  for (let k = 0; k < n; k++) {
    const idx = di === 0 ? k : n - 1 - k;
    let a = t0 + off[k] - DWELL / 2;
    if (k > 0) a = Math.max(a, prevD + Math.abs(st[idx].s - prevS) / 12);
    const d = a + DWELL;
    out.push({ idx, a, d, s: st[idx].s });
    prevD = d; prevS = st[idx].s;
  }
  return out;
}
// where a trip is at time T: null before it enters or after it leaves the map
function tripAt(line: number, di: number, t0: number, T: number): any {
  const l = tramLines[line];
  const dir = di === 0 ? 1 : -1;
  const tt = tripTimes(line, di, t0);
  const first = tt[0], last = tt[tt.length - 1];
  const lead = (dir > 0 ? first.s : l.len - first.s) / TRAM_V;
  const tail = (dir > 0 ? l.len - last.s : last.s) / TRAM_V;
  if (T < first.a - lead || T > last.d + tail) return null;
  if (T < first.a) return { s: first.s - dir * (first.a - T) * TRAM_V, v: TRAM_V, dwell: 0, stopIdx: first.idx, lastStop: -1 };
  for (let k = 0; k < tt.length; k++) {
    const q = tt[k];
    if (T <= q.d) {
      if (T >= q.a) return { s: q.s, v: 0, dwell: q.d - T, stopIdx: q.idx, lastStop: k > 0 ? tt[k - 1].idx : -1 };
      const p = tt[k - 1];
      const f = (T - p.d) / Math.max(1, q.a - p.d);
      const e = f * f * (3 - 2 * f);
      return { s: p.s + (q.s - p.s) * e, v: Math.abs(q.s - p.s) / Math.max(1, q.a - p.d) * 1.5 * (1 - Math.abs(2 * f - 1)), dwell: 0, stopIdx: q.idx, lastStop: p.idx };
    }
  }
  return { s: last.s + dir * (T - last.d) * TRAM_V, v: TRAM_V, dwell: 0, stopIdx: dir > 0 ? tramStops[line].length : -1, lastStop: last.idx };
}
// seconds until the next tram leaves the stop (any line if line < 0): 1e9 if none
function nextDeparture(line: number, stopName: string, T: number): number {
  let best = 1e9;
  for (let i = 0; i < tramLines.length; i++) {
    if (line >= 0 && i !== line) continue;
    for (let di = 0; di < 2; di++) {
      const deps = MAP.trams[i].tt[clockDay][di].dep;
      for (let k = 0; k < deps.length; k++) {
        const t0 = deps[k] * 60;
        if (t0 + 3600 < T || t0 - 3600 > T + best) continue;
        const tt = tripTimes(i, di, t0);
        for (let j = 0; j < tt.length; j++) {
          if (stopName && tramStops[i][tt[j].idx].name !== stopName) continue;
          if (j === tt.length - 1 && tt.length > 1 && stopName) continue;   // the end of the line: nobody gets on
          if (tt[j].d > T && tt[j].d - T < best) best = tt[j].d - T;
          if (!stopName) break;
        }
      }
    }
  }
  return best;
}
// the next departures from a stop: [{line, head, dep (s), toward}]
function departures(stopName: string, T: number, n: number): any[] {
  const out: any[] = [];
  for (let i = 0; i < tramLines.length; i++) {
    for (let di = 0; di < 2; di++) {
      const deps = MAP.trams[i].tt[clockDay][di].dep;
      for (let k = 0; k < deps.length; k++) {
        const t0 = deps[k] * 60;
        if (t0 + 3600 < T || t0 > T + 3600) continue;
        const tt = tripTimes(i, di, t0);
        for (let j = 0; j < tt.length - 1; j++) {
          if (tramStops[i][tt[j].idx].name !== stopName || tt[j].d < T) continue;
          const later: string[] = [];
          for (let m = j + 1; m < tt.length; m++) later.push(tramStops[i][tt[m].idx].name);
          out.push({ line: i, di, head: MAP.trams[i].head[di], dep: tt[j].d, arr: tt[j].a, later });
        }
      }
    }
  }
  out.sort((a, b) => a.dep - b.dep);
  return out.slice(0, n);
}

function stepTrams(dt: number) {
  const T = clockNow();
  const keep = ridingKey;
  const next: Tram[] = [];
  let ridingGone = keep >= 0;
  for (let i = 0; i < tramLines.length; i++) {
    for (let di = 0; di < 2; di++) {
      const deps = MAP.trams[i].tt[clockDay][di].dep;
      for (let k = 0; k < deps.length; k++) {
        const t0 = deps[k] * 60;
        if (t0 > T + 600 || t0 + 1800 < T) continue;
        const q = tripAt(i, di, t0, T);
        if (!q) continue;
        const key = i * 100000 + di * 50000 + deps[k] * 10 + (k % 10);
        if (key === keep) ridingGone = false;
        next.push({ line: i, s: q.s, dir: di === 0 ? 1 : -1, v: q.v, dwell: q.dwell, stopIdx: q.stopIdx, lastStop: q.lastStop, key });
      }
    }
  }
  // the child's tram: arrived at a stop, passed one, or left the map
  if (keep >= 0) {
    let prev: Tram | null = riding >= 0 && riding < trams.length ? trams[riding] : null;
    const now = next.filter((x) => x.key === keep)[0];
    if (ridingGone || !now) { if (prev) endOfLine(prev); }
    else if (prev) {
      if (now.dwell > 0 && prev.dwell <= 0) arriveAt(now);
      if (now.dwell <= 0 && prev.dwell > 0) leftStop(prev);
    }
  }
  trams = next;
  riding = -1;
  if (ridingKey >= 0) for (let i = 0; i < trams.length; i++) if (trams[i].key === ridingKey) riding = i;
  if (riding < 0) ridingKey = -1;
}

// ---- riding the tram ----------------------------------------------------------

function kidWaitsAt(st: any): boolean {
  return mode === "play" && st && st.place && Math.hypot(st.place.x - kid.x, st.place.z - kid.z) < 16;
}

function tramAtStop(stopId: string): number {
  // a tram toward the plan's stop first
  let any = -1;
  for (let i = 0; i < trams.length; i++) {
    const tr = trams[i];
    if (tr.dwell <= 1) continue;
    const st = tramStops[tr.line][tr.stopIdx];
    if (!st || !st.place || st.place.id !== stopId) continue;
    const k = tr.stopIdx + tr.dir;
    if (k < 0 || k >= tramStops[tr.line].length) continue;      // the end of the line
    if (plan && plan.stage === 0 && tramGoesTo(tr, plan.alight.name)) return i;
    if (any < 0) any = i;
  }
  return any;
}

function stopNear(): Place | null {
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (p.kind === "stop" && Math.hypot(p.x - kid.x, p.z - kid.z) < 16) return p;
  }
  return null;
}

function board(i: number) {
  riding = i;
  const tr = trams[i];
  ridingKey = tr.key;
  const st = tramStops[tr.line][tr.stopIdx];
  rideFrom = st ? st.name : "";
  mode = "ride";
  walking = false;
  rg.sound("note", { pitch: 1.5 });
  rg.vibrate(40);
  if (plan && plan.stage === 0) {
    if (tramGoesTo(tr, plan.alight.name)) { plan.stage = 1; say(rg.t("Kyydissä! Jää pois pysäkillä " + plan.alight.name + ".", "On board! Get off at the stop " + plan.alight.name + ".", "¡A bordo! Bájate en la parada " + plan.alight.name + "."), "good", 4); }
    else say(rg.t("Hups, tämä ratikka ei mene pysäkille " + plan.alight.name + ". Jää pois seuraavalla.", "Oops, this tram doesn't go to " + plan.alight.name + ". Get off at the next stop.", "Uy, este tranvía no va a " + plan.alight.name + ". Bájate en la siguiente."), "bad", 5);
  } else say(rg.t("Kyydissä! Jää pois, kun ratikka on pysäkillä.", "On board! Get off when the tram is at a stop.", "¡A bordo! Bájate cuando el tranvía esté en una parada."), "info", 3);
}

// the tram stops at that stop later on its trip
function tramGoesTo(tr: Tram, name: string): boolean {
  const st = tramStops[tr.line];
  const from = tr.dwell > 0 ? tr.stopIdx + tr.dir : tr.stopIdx;
  for (let k = from; k >= 0 && k < st.length; k += tr.dir) if (st[k].name === name) return true;
  return false;
}

function leftStop(tr: Tram) {
  const st = tramStops[tr.line][tr.stopIdx];
  rg.sound("whoosh", { volume: 0.4 });
  if (plan && plan.stage === 1 && st && st.name === plan.alight.name) {
    say(rg.t("Ohitit pysäkin " + st.name + "! Jää pois seuraavalla ja kävele takaisin.", "You passed the stop " + st.name + "! Get off at the next one and walk back.", "¡Te pasaste la parada " + st.name + "! Bájate en la siguiente y vuelve caminando."), "bad", 5);
  }
}

function arriveAt(tr: Tram) {
  const st = tramStops[tr.line][tr.stopIdx];
  if (!st) return;
  rg.sound("note", { pitch: 1.2 });
  say(rg.t("Pysäkki: ", "Stop: ", "Parada: ") + st.name, "info", 4);
}

function alight() {
  if (riding < 0) return;
  const tr = trams[riding];
  const st = tramStops[tr.line][tr.stopIdx];
  const pl = st ? st.place : null;
  if (pl) { kid.x = pl.x; kid.z = pl.z; kid.safeX = pl.x; kid.safeZ = pl.z; }
  riding = -1;
  mode = "play";
  inCross = -1;
  cars = []; bikes = []; nearClock = 0;
  ridingKey = -1;
  rg.sound("pop");
  if (plan && pl) {
    if (pl.name === plan.alight.name && plan.stage === 1) {
      plan.stage = 2;
      addPoints(40, rg.t("Oikea pysäkki: " + pl.name + "! Kävele nyt perille.", "Right stop: " + pl.name + "! Now walk the rest of the way.", "¡Parada correcta: " + pl.name + "! Ahora camina hasta el final."));
      updateRouteIfGps();
      return;
    }
    // got off elsewhere: catch the next tram from here
    plan.stage = 0; plan.board = pl;
    say(rg.t("Tämä on " + pl.name + ". Odota ratikkaa, joka menee pysäkille " + plan.alight.name + ".", "This is " + pl.name + ". Wait for a tram that goes to " + plan.alight.name + ".", "Esto es " + pl.name + ". Espera un tranvía que vaya a " + plan.alight.name + "."), "info", 5);
    updateRouteIfGps();
    return;
  }
  if (pl && rideFrom && st.name !== rideFrom) addPoints(20, rg.t("Ratikkamatka ", "Tram ride ", "Viaje en tranvía ") + rideFrom + " – " + st.name + "!");
}

function endOfLine(tr: Tram) {
  // the line leaves the map: everyone out at the last stop
  const st = tramStops[tr.line];
  const last = tr.dir > 0 ? st[st.length - 1] : st[0];
  if (last.place) { kid.x = last.place.x; kid.z = last.place.z; kid.safeX = kid.x; kid.safeZ = kid.z; }
  riding = -1; ridingKey = -1;
  mode = "play";
  if (plan && last.place) { plan.stage = last.place.name === plan.alight.name ? 2 : 0; plan.board = last.place; }
  say(rg.t("Päätepysäkki! Kaikki ulos.", "Last stop! Everybody off.", "¡Última parada! Todos fuera."), "info", 3);
}

// ---- tick -----------------------------------------------------------------------

function tick(dt: number, input: any) {
  if (dt > 0.1) dt = 0.1;
  t += dt;
  modeClock += dt;
  if (msgClock > 0) msgClock -= dt;
  if (hurt > 0) hurt -= dt;
  if (rewardClock > 0) rewardClock -= dt;
  if (roadHint > 0) roadHint -= dt;
  stepTrams(dt);
  if (mode === "play" || mode === "ride") {
    nearClock -= dt;
    if (nearClock <= 0) {
      refreshNear();
      spawnTraffic(cars.length === 0);
      nearClock = 1;
    }
    stepCars(dt);
    stepBikes(dt);
  }
  if (mode === "gpswait") gpsWait += dt;
  if (mode === "play" && gps && !showMap) {
    // the real position, eased so the figure walks instead of jumping
    const dx = kid.tx - kid.x, dz = kid.tz - kid.z;
    const d = Math.hypot(dx, dz);
    kid.moving = d > 0.6;
    if (d > 60) { kid.x = kid.tx; kid.z = kid.tz; }
    else if (d > 0.05) {
      const k = Math.min(1, dt * 2.5);
      kid.x += dx * k; kid.z += dz * k;
      kid.face = Math.atan2(dz, dx);
      kid.step += dt * 8;
    }
    if (routeJob && runRouteJob(routeJob, 2500)) {
      const first = route.length === 0;
      routeReady();
      if (first) say(route.length ? rg.t("Kävele sinistä viivaa pitkin! Pysähdy aina suojatien eteen.", "Walk along the blue line! Always stop before a zebra crossing.", "¡Camina por la línea azul! Para siempre antes del paso de cebra.") : rg.t("Reittiä ei löytynyt tältä kartalta.", "No route found on this map.", "No se encontró ruta en este mapa."), "info", 5);
    }
    routeClock += dt;
    if (!routeJob && routeClock > 4 && (offRoute() > 15 || routeClock > 30)) { updateRoute(); routeClock = 0; }
    // a red light on the route just ahead
    for (let k = 0; k < routeCross.length; k++) {
      const c = MAP.crossings[routeCross[k]];
      const d0 = Math.min(Math.hypot(kid.x - c[0], kid.z - c[1]), Math.hypot(kid.x - c[2], kid.z - c[3]));
      if (d0 < 10 && msgClock <= 0) say(c[4] >= 0 ? rg.t("Suojatie valoilla: odota vihreää ukkoa!", "Crossing with lights: wait for the green man!", "Paso con semáforo: ¡espera al muñeco verde!") + " 🚦" : rg.t("Suojatie: pysähdy ja katso molempiin suuntiin!", "Zebra crossing: stop and look both ways!", "Paso de cebra: ¡para y mira a ambos lados!") + " 👀", "info", 4);
    }
    if (goal && Math.hypot(goal.x - kid.x, goal.z - kid.z) < 15) win();
  } else if (mode === "play" && !showMap) {
    if (hurt <= 0.8) moveKid(dt, input);
    if (goal && Math.hypot(goal.x - kid.x, goal.z - kid.z) < 12 && (goal.kind !== "stop" || true)) win();
  }
  if (mode === "ride" && riding >= 0 && riding < trams.length) {
    const tr = trams[riding];
    const p = along(tramLines[tr.line], tr.s);
    kid.x = p.x; kid.z = p.z;
    if (goal && goal.kind === "stop" && tr.dwell > 0) {
      const st = tramStops[tr.line][tr.stopIdx];
      if (st && st.place && st.place.id === goal.id) { alight(); win(); }
    }
  }
  // the camera follows, a little ahead of the walk
  const tx = kid.x, tz = kid.z;
  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.z += (tz - cam.z) * Math.min(1, dt * 6);
  const hw = width / 2 / Z, hh = height / 2 / Z;
  cam.x = rg.clamp(cam.x, X0 + hw, X0 + MW - hw);
  cam.z = rg.clamp(cam.z, Z0 + hh, Z0 + MH - hh);
  if (mode === "win") {
    celebrate += dt;
  }
}

// ---- view -------------------------------------------------------------------------

function sx(x: number) { return (x - cam.x) * Z + width / 2; }
function sy(z: number) { return (z - cam.z) * Z + height / 2; }

function Tiles() {
  const out: any[] = [];
  const size = TILE * Z;
  const left = cam.x - width / 2 / Z, top = cam.z - height / 2 / Z;
  const c0 = Math.max(0, Math.floor((left - X0) / TILE)), r0 = Math.max(0, Math.floor((top - Z0) / TILE));
  const c1 = Math.min(MAP.NCOL - 1, Math.floor((left + width / Z - X0) / TILE));
  const r1 = Math.min(MAP.NROW - 1, Math.floor((top + height / Z - Z0) / TILE));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const x = Math.floor(sx(X0 + c * TILE)), y = Math.floor(sy(Z0 + r * TILE));
    out.push(<img className="tile" src={rg.asset("tiles/" + c + "_" + r + ".png")} style={{ left: x, top: y, width: Math.ceil(size) + 1, height: Math.ceil(size) + 1 }} />);
  }
  return out;
}

function visible(x: number, z: number, m: number) {
  const X = sx(x), Y = sy(z);
  return X > -m && X < width + m && Y > -m && Y < height + m;
}

function RouteView() {
  if (!gps || mode !== "play" || route.length < 4) return null;
  const out: any[] = [];
  const r = 4.5 * Z / 4.5;
  for (let k = 0; k < route.length; k += 2) {
    const x = route[k], z = route[k + 1];
    if (!visible(x, z, 10)) continue;
    const onCross = cell(x, z) === 3;
    out.push(<div className="rdot" style={{ left: sx(x) - r, top: sy(z) - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: onCross ? "#ffd166" : "#3a86ff" }} />);
  }
  return out;
}

function Lights() {
  const out: any[] = [];
  for (let i = 0; i < MAP.crossings.length; i++) {
    const c = MAP.crossings[i];
    if (!visible(c[0], c[1], 30) && !visible(c[2], c[3], 30)) continue;
    const L = Math.hypot(c[2] - c[0], c[3] - c[1]) || 1;
    const ux = (c[2] - c[0]) / L, uz = (c[3] - c[1]) / L;
    if (c[4] >= 0) {
      const wl = walkLight(i);
      const on = wl === "green" || (wl === "blink" && Math.floor(t * 4) % 2 === 0);
      for (let e = 0; e < 2; e++) {
        const px = e === 0 ? c[0] - ux * 1.2 + uz * 2.6 : c[2] + ux * 1.2 - uz * 2.6;
        const pz = e === 0 ? c[1] - uz * 1.2 - ux * 2.6 : c[3] + uz * 1.2 + ux * 2.6;
        const s = Z / 4.5;
        out.push(
          <div className="sig" style={{ left: sx(px) - 6 * s, top: sy(pz) - 11 * s, width: 12 * s, height: 22 * s, borderRadius: 3 * s }}>
            <div className="lamp" style={{ left: 2 * s, top: 2 * s, width: 8 * s, height: 8 * s, borderRadius: 4 * s, backgroundColor: on ? "#3a1010" : "#ff3b30" }} />
            <div className="lamp" style={{ left: 2 * s, top: 12 * s, width: 8 * s, height: 8 * s, borderRadius: 4 * s, backgroundColor: on ? "#3cff6e" : "#103a18" }} />
          </div>
        );
      }
    } else {
      // the blue crossing sign
      const px = c[0] - ux * 1.5 + uz * 2.4, pz = c[1] - uz * 1.5 - ux * 2.4;
      const s = Z / 4.5;
      out.push(
        <div className="zsign" style={{ left: sx(px) - 8 * s, top: sy(pz) - 8 * s, width: 16 * s, height: 16 * s, borderRadius: 2 * s }}>
          <div className="ztri" style={{ fontSize: 10 * s, width: 16 * s, height: 16 * s }}>{"🚶"}</div>
        </div>
      );
    }
  }
  return out;
}

function Places() {
  const out: any[] = [];
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (!visible(p.x, p.z, 80)) continue;
    const isGoal = goal && (goal.id === p.id || (plan && plan.stage < 2 && target().id === p.id)) && (mode === "play" || mode === "ride");
    const bob = isGoal ? Math.sin(t * 5) * 4 : 0;
    const X = sx(p.x), Y = sy(p.z);
    if (p.kind === "stop") {
      out.push(<div className="stoppole" style={{ left: X - 2, top: Y - 34, height: 34 }} />);
      out.push(<div className="stopsign" style={{ left: X - 16, top: Y - 54 + bob }}>{"🚋"}</div>);
    } else {
      out.push(<div className={isGoal ? "pin goal" : "pin"} style={{ left: X - 20, top: Y - 62 + bob }}>{p.icon}</div>);
      if (p.id === "koti" || p.id === "isa") out.push(<div className="housebadge" style={{ left: X + 10, top: Y - 70 + bob }}>{"🏠"}</div>);
    }
    out.push(<div className={isGoal ? "plabel goal" : "plabel"} style={{ left: X - 80, top: Y - 20 }}>{p.name}</div>);
  }
  return out;
}

function CarView(c: Car) {
  const p = along(roadLines[c.road], c.s);
  if (!visible(p.x, p.z, 60)) return null;
  const k = Z * 1.25;
  const L = c.len * k, W = c.wid * k;
  const deg = p.a * 180 / Math.PI;
  return (
    <div className="car" style={{ left: sx(p.x) - L / 2, top: sy(p.z) - W / 2, width: L, height: W, backgroundColor: c.color, borderRadius: W * 0.35, transform: "rotate(" + deg + "deg)" }}>
      {c.bus ? <div className="busroof" style={{ left: L * 0.08, top: W * 0.18, width: L * 0.84, height: W * 0.64 }} /> : null}
      {c.bus ? null : <div className="wind" style={{ left: L * 0.56, top: W * 0.12, width: L * 0.17, height: W * 0.76 }} />}
      {c.bus ? null : <div className="roof" style={{ left: L * 0.25, top: W * 0.14, width: L * 0.3, height: W * 0.72, backgroundColor: c.color }} />}
      {c.honk > 0 ? <div className="honk" style={{ left: L - 4, top: -W * 0.8 }}>{"📢"}</div> : null}
    </div>
  );
}

function BikeView(b: Bike) {
  const p = along(bikeLines[b.path], b.s);
  if (!visible(p.x, p.z, 40)) return null;
  const k = Z * 1.9;
  const deg = p.a * 180 / Math.PI + (b.dir < 0 ? 180 : 0);
  return (
    <div className="bike" style={{ left: sx(p.x) - 1 * k, top: sy(p.z) - 0.35 * k, width: 2 * k, height: 0.7 * k, transform: "rotate(" + deg + "deg)" }}>
      <div className="rider" style={{ left: 0.55 * k, top: -0.25 * k, width: 0.8 * k, height: 1.2 * k, borderRadius: 0.4 * k, backgroundColor: b.color }} />
      <div className="helmet" style={{ left: 0.9 * k, top: 0.05 * k, width: 0.6 * k, height: 0.6 * k, borderRadius: 0.3 * k }} />
      {b.ring > 1.8 ? <div className="ring" style={{ left: 1.6 * k, top: -1.6 * k }}>{"🔔"}</div> : null}
    </div>
  );
}

function TramView(tr: Tram, i: number) {
  const l = tramLines[tr.line];
  const out: any[] = [];
  const k = Z;
  const segs = 3, segLen = 9.2;
  let any = false;
  for (let n = 0; n < segs; n++) {
    const s = tr.s - tr.dir * (n * segLen + segLen / 2);
    const p = along(l, s);
    if (!visible(p.x, p.z, 60)) continue;
    any = true;
    const L = (segLen - 0.4) * k, W = 2.65 * k * 1.3;
    const deg = p.a * 180 / Math.PI;
    out.push(
      <div className="tram" style={{ left: sx(p.x) - L / 2, top: sy(p.z) - W / 2, width: L, height: W, borderRadius: n === 0 || n === segs - 1 ? W * 0.45 : W * 0.15, transform: "rotate(" + deg + "deg)" }}>
        <div className="tramroof" style={{ left: L * 0.1, top: W * 0.32, width: L * 0.8, height: W * 0.36 }} />
      </div>
    );
  }
  if (!any) return null;
  if (i === riding) {
    const p = along(l, tr.s - tr.dir * segLen * 1.5);
    out.push(<div className="ridekid" style={{ left: sx(p.x) - 10, top: sy(p.z) - 10 }}>{"🙂"}</div>);
  }
  return out;
}

function Kid() {
  if (mode === "ride") return null;
  const X = sx(kid.x), Y = sy(kid.z);
  const s = Z / 4.5;
  const bob = kid.moving ? Math.abs(Math.sin(kid.step)) * 3 * s : 0;
  const blink = hurt > 0 && Math.floor(t * 10) % 2 === 0;
  if (blink) return null;
  const fx = Math.cos(kid.face), fz = Math.sin(kid.face);
  const sw = kid.moving ? Math.sin(kid.step) * 4 * s : 0;
  return (
    <div className="kidbox" style={{ left: X - 20 * s, top: Y - 20 * s, width: 40 * s, height: 40 * s }}>
      <div className="kshadow" style={{ left: 9 * s, top: 24 * s, width: 22 * s, height: 10 * s, borderRadius: 5 * s }} />
      <div className="kfoot" style={{ left: 12 * s + sw * fz, top: 22 * s - sw * fx - bob, width: 7 * s, height: 7 * s, borderRadius: 3.5 * s }} />
      <div className="kfoot" style={{ left: 21 * s - sw * fz, top: 22 * s + sw * fx - bob, width: 7 * s, height: 7 * s, borderRadius: 3.5 * s }} />
      <div className="kbody" style={{ left: 9 * s, top: 12 * s - bob, width: 22 * s, height: 16 * s, borderRadius: 8 * s }} />
      <div className="kbag" style={{ left: 13 * s - fx * 6 * s, top: 13 * s - fz * 5 * s - bob, width: 14 * s, height: 10 * s, borderRadius: 4 * s }} />
      <div className="khead" style={{ left: 11 * s + fx * 3 * s, top: 2 * s + fz * 2 * s - bob, width: 18 * s, height: 18 * s, borderRadius: 9 * s }} />
      <div className="khat" style={{ left: 11 * s + fx * 2 * s, top: 1 * s + fz * 1 * s - bob, width: 18 * s, height: 9 * s, borderRadius: 9 * s }} />
    </div>
  );
}

function Arrow() {
  if (!goal || mode !== "play") return null;
  const g = target();
  const gx = sx(g.x), gy = sy(g.z);
  const dist = Math.round(Math.hypot(g.x - kid.x, g.z - kid.z));
  if (gx > 20 && gx < width - 20 && gy > 80 && gy < height - 90) return null;
  const cx = width / 2, cy = height / 2;
  const a = Math.atan2(gy - cy, gx - cx);
  const rx = width / 2 - 34, ry = height / 2 - 100;
  const k = Math.min(Math.abs(rx / (Math.cos(a) || 0.001)), Math.abs(ry / (Math.sin(a) || 0.001)));
  const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
  return (
    <div className="arrowbox" style={{ left: ax - 30, top: ay - 30 }}>
      <div className="arrowdisc" style={{ transform: "rotate(" + (a * 180 / Math.PI) + "deg)" }}>{"➜"}</div>
      <div className="arrowdist">{dist + " m"}</div>
    </div>
  );
}

// ⏩: the game clock jumps to just before the tram comes (the one toward the
// plan's stop if there is one)
function waitTarget(deps: any[], T: number): number {
  let d = deps[0];
  if (plan && plan.stage === 0) for (let k = 0; k < deps.length; k++) if (deps[k].later.indexOf(plan.alight.name) >= 0) { d = deps[k]; break; }
  return d.arr - 6;
}
function skipTo(T: number) {
  const now = clockNow();
  if (T > now) clockShift += T - now;
  cars = []; bikes = []; nearClock = 0;
  rg.sound("whoosh", { volume: 0.5 });
}
function skipRide() {
  if (riding < 0) return;
  const tr = trams[riding];
  const di = tr.dir > 0 ? 0 : 1;
  const deps = MAP.trams[tr.line].tt[clockDay][di].dep;
  const key = tr.key - tr.line * 100000 - di * 50000;
  const t0 = Math.floor(key / 10) * 60;
  const tt = tripTimes(tr.line, di, t0);
  const want = tr.dwell > 0 ? tr.stopIdx + tr.dir : tr.stopIdx;
  for (let k = 0; k < tt.length; k++) if (tt[k].idx === want) { skipTo(tt[k].a + 1); return; }
  // no stop left: to the map edge
  skipTo(tt[tt.length - 1].d + 120);
}

function Hud() {
  const out: any[] = [];
  const hs = hearts >= 3 ? "❤️❤️❤️" : hearts === 2 ? "❤️❤️🤍" : "❤️🤍🤍";
  if (goalPhoto && t < peekUntil) out.push(
    <div className="peek" onClick={() => { peekUntil = 0; }}>
      <div className="peektitle">{rg.t("Etsi tämä: ", "Find this: ", "Busca esto: ") + (goal ? goal.name : "")}</div>
      <img className="peekimg" src={rg.asset(goalPhoto.f)} />
      <div className="photoby">{rg.t("Kuva: ", "Photo: ", "Foto: ") + goalPhoto.by + ", " + goalPhoto.lic + " (Wikimedia Commons)"}</div>
    </div>
  );
  out.push(
    <div className="hud">
      <div className="row"><div className="pill goalpill" onClick={() => { if (goalPhoto && peekUntil < t) peekUntil = t + 5; else { peekUntil = 0; showMap = true; } rg.sound("click"); }}>{(goal ? goal.icon + " " + goal.name : "") + (plan && plan.stage === 0 ? " · 🚏 " + plan.board.name : plan && plan.stage === 1 ? " · 🚪 " + plan.alight.name : "")}</div></div>
      <div className="row"><div className="pill hp">{hs + " " + points}</div></div>
    </div>
  );
  const near = mode === "play" ? stopNear() : null;
  if (near) {
    const T = clockNow();
    const deps = departures(near.name, T, 3);
    const rows: any[] = [];
    for (let k = 0; k < deps.length; k++) {
      const d = deps[k];
      const good = plan && plan.stage === 0 && d.later.indexOf(plan.alight.name) >= 0;
      const mins = Math.max(0, Math.floor((d.dep - T) / 60));
      rows.push(<div className={good ? "deprow good" : "deprow"}>{MAP.trams[d.line].line + " " + d.head + "  " + clockText(d.dep) + (d.arr <= T ? "  " + rg.t("nyt", "now", "ahora") : "  " + mins + " min") + (good ? " ✓" : "")}</div>);
    }
    out.push(
      <div className="stopinfo">
        <div className="stophead">{"🚋 " + near.name + " · klo " + clockText(T)}</div>
        {rows.length ? rows : <div className="deprow">{rg.t("Ei lähtöjä tänään", "No departures today", "No hay salidas hoy")}</div>}
      </div>
    );
    const ti = tramAtStop(near.id);
    const coming = deps.length && deps[0].arr - T < 15;
    if (ti >= 0) out.push(<div className="bigbtn tram" onClick={() => board(ti)}>{"🚋 " + rg.t("Nouse", "Get on", "Sube") + " (" + MAP.trams[trams[ti].line].line + ")"}</div>);
    else if (deps.length && !coming) out.push(<div className="skipbtn" onClick={() => skipTo(waitTarget(deps, T))}>{"⏩ Odota"}</div>);
  }
  if (mode === "ride" && riding >= 0 && riding < trams.length) {
    const tr = trams[riding];
    const st = tramStops[tr.line];
    const nxt = st[tr.stopIdx];
    out.push(<div className="ridebar">{rg.t("Ratikka ", "Tram ", "Tranvía ") + MAP.trams[tr.line].line + (nxt ? (tr.dwell > 0 ? rg.t(" · Pysäkki: ", " · Stop: ", " · Parada: ") : rg.t(" · Seuraava: ", " · Next: ", " · Siguiente: ")) + nxt.name : "")}</div>);
    if (tr.dwell > 0) out.push(<div className="bigbtn exitbtn" onClick={() => alight()}>{"🚪 " + rg.t("Jää pois", "Get off", "Bájate")}</div>);
    out.push(<div className="skipbtn" onClick={() => skipRide()}>{"⏩ " + rg.t("Seuraava pysäkki", "Next stop", "Siguiente parada")}</div>);
  }
  out.push(<div className="round mapbtn" onClick={() => { showMap = !showMap; rg.sound("click"); }}>{"🗺"}</div>);
  out.push(<div className="round zoombtn" onClick={() => cycleZoom()}>{zoomIdx === 0 ? "🔍" : zoomIdx === 1 ? "🔎" : "🔭"}</div>);
  if (debugOn) out.push(<div className="msg">{trams.map((tr) => tr.line + "/" + tr.dir + " s" + Math.round(tr.s) + " v" + Math.round(tr.v) + " d" + Math.round(tr.dwell) + " i" + tr.stopIdx).join(" | ") + " cars:" + cars.map((c) => Math.round(c.v)).join(",")}</div>);
  if (msgClock > 0) out.push(<div className={"msg " + msgKind} style={{ opacity: Math.min(1, msgClock * 2) }}>{msg}</div>);
  if (hurt > 0.8) out.push(<div className="ouch" />);
  return out;
}

function MapView() {
  // the whole map scaled to the screen, with the child, the goal and the stops
  const ow = MAP.NCOL * 60, oh = MAP.NROW * 60;   // overview.png: 0.6 px a metre
  const top = 70, avail = height - top - 90;
  // fit both the child and the goal, zoomed in as far as fits
  let minx = kid.x, maxx = kid.x, minz = kid.z, maxz = kid.z;
  if (goal) { minx = Math.min(minx, goal.x); maxx = Math.max(maxx, goal.x); minz = Math.min(minz, goal.z); maxz = Math.max(maxz, goal.z); }
  const spanX = maxx - minx + 260, spanZ = maxz - minz + 260;
  let sc = Math.min(width / spanX, avail / spanZ, 1.2);
  sc = Math.max(sc, Math.min(width / MW, avail / MH));
  const cxm = (minx + maxx) / 2, czm = (minz + maxz) / 2;
  let ox = width / 2 - (cxm - X0) * sc, oy = top + avail / 2 - (czm - Z0) * sc;
  ox = Math.min(0, Math.max(width - MW * sc, ox));
  oy = Math.min(top, Math.max(top + avail - MH * sc, oy));
  const mx = (x: number) => ox + (x - X0) * sc, my = (z: number) => oy + (z - Z0) * sc;
  const pins: any[] = [];
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    const isGoal = goal && goal.id === p.id;
    pins.push(<div className={isGoal ? "mpin goal" : "mpin"} style={{ left: mx(p.x) - 11, top: my(p.z) - 11 }}>{p.icon}</div>);
    if (isGoal || sc > 0.45) pins.push(<div className={isGoal ? "mlabel goal" : "mlabel"} style={{ left: mx(p.x) - 70, top: my(p.z) + 10 }}>{p.name}</div>);
  }
  return (
    <div className="mapview" onClick={() => { showMap = false; }}>
      <div className="mapclip" style={{ top: top, height: avail }}>
        <img className="mapimg" src={rg.asset("overview.png")} style={{ left: ox, top: oy - top, width: ow * sc / 0.6, height: oh * sc / 0.6 }} />
      </div>
      {pins}
      <div className="mkid" style={{ left: mx(kid.x) - 13, top: my(kid.z) - 13, transform: "scale(" + (1 + Math.sin(t * 6) * 0.15) + ")" }}>{"🧒"}</div>
      <div className="maptitle">{rg.t("Kartta · sinä 🧒 ja kohde ", "Map · you 🧒 and the goal ", "Mapa · tú 🧒 y el destino ") + (goal ? goal.icon : "")}</div>
      <div className="maphint">{rg.t("Napauta jatkaaksesi", "Tap to continue", "Toca para seguir")}</div>
    </div>
  );
}

function StartView() {
  const cards: any[] = [];
  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    const sub = "";
    cards.push(
      <div className="card" onClick={() => chooseStart(h)}>
        <div className="cicon">{h.icon}</div>
        <div className="ctext">
          <div className="cname">{h.name}</div>
          {sub ? <div className="csub">{sub}</div> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="title">{"🚦 " + rg.t("Tampereen liikenneretki", "Tampere traffic walk", "Paseo por Tampere")}</div>
      <div className="subtitle">{rg.t("Kävele kaupungilla, odota vihreää ja varo autoja!", "Walk in the city, wait for green and watch out for cars!", "¡Camina por la ciudad, espera la luz verde y cuidado con los coches!")}</div>
      {nightNote ? <div className="subtitle">{rg.t("Yöllä ratikat eivät kulje, joten pelissä on nyt päivä", "Trams don't run at night, so it is daytime in the game now", "Por la noche no circulan tranvías, así que en el juego ahora es de día") + " ☀️"}</div> : null}
      <div className="ask">{rg.t("Mistä lähdetään?", "Where do we start?", "¿Desde dónde salimos?")}</div>
      {cards}
      <div className="card gpscard" onClick={() => startGps()}>
        <div className="cicon">{"📍"}</div>
        <div className="ctext">
          <div className="cname">{rg.t("Missä olen nyt", "Where I am now", "Donde estoy ahora")}</div>
          <div className="csub">{rg.t("Puhelimen sijainti ja reitti", "Phone location and route", "Ubicación del teléfono y ruta")}</div>
        </div>
      </div>
      <div className="score">{"⭐ " + total + " pistettä · " + found + " retkeä"}</div>
      <div className="credit">{rg.t("Kartta: © OpenStreetMap-tekijät, Tampereen kaupunki · Aikataulut: Nysse · Kuvat: Wikimedia Commons", "Map: © OpenStreetMap contributors, City of Tampere · Timetables: Nysse · Photos: Wikimedia Commons", "Mapa: © colaboradores de OpenStreetMap, Ciudad de Tampere · Horarios: Nysse · Fotos: Wikimedia Commons")}</div>
    </div>
  );
}

function GoalView() {
  const cards: any[] = [];
  for (let i = 0; i < goalChoices.length; i++) {
    const g = goalChoices[i];
    const d = Math.round(Math.hypot(g.x - kid.x, g.z - kid.z) / 10) * 10;
    const kind = g.id === "koti" ? rg.t("Äidin luo", "To mum", "A casa de mamá") : g.id === "isa" ? rg.t("Isän luo", "To dad", "A casa de papá") : g.kind === "park" ? rg.t("Puistoon", "To the park", "Al parque") : g.kind === "stop" ? rg.t("Ratikkapysäkille", "To the tram stop", "A la parada de tranvía") : g.kind === "sight" ? rg.t("Katsomaan", "Sightseeing", "De visita") : g.kind === "school" ? rg.t("Kouluun", "To school", "Al colegio") : g.kind === "daycare" ? rg.t("Päiväkotiin", "To daycare", "A la guardería") : rg.t("Kylään", "Visiting", "De visita");
    cards.push(
      <div className="card small" onClick={() => chooseGoal(g)}>
        {photosOf(g).length ? <div className="cthumb"><img className="cthumbimg" src={rg.asset(photosOf(g)[0].f)} /></div> : <div className="cicon">{g.icon}</div>}
        <div className="ctext">
          <div className="csub">{kind}</div>
          <div className="cname">{g.name}</div>
        </div>
        <div className="cdist">{d + " m"}</div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="ask">{rg.t("Minne mennään?", "Where are we going?", "¿Adónde vamos?")}</div>
      <div className="subtitle">{rg.t("Lähtö: ", "Start: ", "Salida: ") + (startPlace ? startPlace.name : "")}</div>
      {cards}
      <div className="back" onClick={() => { stopGps(); mode = "start"; rg.sound("click"); }}>{rg.t("← Vaihda lähtöpaikka", "← Change start", "← Cambiar salida")}</div>
    </div>
  );
}

function HowView() {
  const g = goal as Place;
  return (
    <div className="panel">
      <div className="ask">{rg.t("Miten mennään?", "How do we go?", "¿Cómo vamos?")}</div>
      <div className="subtitle">{g.icon + " " + g.name}</div>
      <div className="card" onClick={() => chooseHow(false)}>
        <div className="cicon">{"🚶"}</div>
        <div className="ctext">
          <div className="cname">{rg.t("Kävellen", "Walking", "Caminando")}</div>
          <div className="csub">{rg.t("Koko matka, noin ", "All the way, about ", "Todo el camino, unos ") + Math.round(plan.direct / 50) * 50 + " m"}</div>
        </div>
      </div>
      <div className="card tramcard" onClick={() => chooseHow(true)}>
        <div className="cicon">{"🚋"}</div>
        <div className="ctext">
          <div className="cname">{rg.t("Ratikalla", "By tram", "En tranvía")}</div>
          <div className="csub">{rg.t("Kävele pysäkille " + plan.board.name + ", jää pois pysäkillä " + plan.alight.name, "Walk to " + plan.board.name + ", get off at " + plan.alight.name, "Camina hasta " + plan.board.name + ", bájate en " + plan.alight.name)}</div>
        </div>
      </div>
      <div className="back" onClick={() => { plan = null; mode = "goal"; rg.sound("click"); }}>{rg.t("← Vaihda kohde", "← Change goal", "← Cambiar destino")}</div>
    </div>
  );
}

function GpsWaitView() {
  return (
    <div className="panel">
      <div className="ticon">{"📍"}</div>
      <div className="ask">{rg.t("Missä olen?", "Where am I?", "¿Dónde estoy?")}</div>
      <div className="gpstext">{gpsMsg}</div>
      <div className="gpsdots">{"• • •".slice(0, 1 + (Math.floor(t * 2) % 3) * 2)}</div>
      <div className="back" onClick={() => { stopGps(); mode = "start"; }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}

function WinView() {
  const stars = hearts >= 3 ? "⭐⭐⭐" : hearts === 2 ? "⭐⭐" : "⭐";
  return (
    <div className="winwrap">
      <div className="wincard" style={{ transform: "scale(" + rg.ease.back(Math.min(1, modeClock * 2)) + ")" }}>
        {goalPhoto ? <img className="winimg" src={rg.asset(goalPhoto.f)} /> : <div className="wicon">{goal ? goal.icon : "🎉"}</div>}
        {goalPhoto ? <div className="photoby">{rg.t("Kuva: ", "Photo: ", "Foto: ") + goalPhoto.by + ", " + goalPhoto.lic}</div> : null}
        <div className="wtitle">{rg.t("Perillä!", "You made it!", "¡Llegaste!") + " 🎉"}</div>
        <div className="wtext">{goal ? (goal.id === "koti" ? rg.t("Äiti on iloinen, kun tulit!", "Mum is happy you came!", "¡Mamá está contenta de que vinieras!") : goal.id === "isa" ? rg.t("Isä on iloinen, kun tulit!", "Dad is happy you came!", "¡Papá está contento de que vinieras!") : rg.t("Löysit: ", "You found: ", "Encontraste: ") + goal.name) : ""}</div>
        <div className="wstars">{stars}</div>
        <div className="wpts">{"+" + roundPoints + rg.t(" pistettä", " points", " puntos")}</div>
        <div className="go" onClick={() => nextTrip()}>{rg.t("Uusi retki täältä", "New trip from here", "Nuevo paseo desde aquí") + " ➜"}</div>
        <div className="back" onClick={() => { rg.stopMusic(); stopGps(); mode = "start"; }}>{rg.t("Valikkoon", "Menu", "Menú")}</div>
      </div>
    </div>
  );
}

function view() {
  const game = mode === "play" || mode === "ride" || mode === "win";
  return (
    <div className="screen">
      {Tiles()}
      {RouteView()}
      {Lights()}
      {Places()}
      {cars.map((c) => CarView(c))}
      {bikes.map((b) => BikeView(b))}
      {trams.map((tr, i) => TramView(tr, i))}
      {game ? Kid() : null}
      {game && mode !== "win" && !showMap ? Arrow() : null}
      {game && mode !== "win" && !showMap ? Hud() : null}
      {showMap && game ? MapView() : null}
      {mode === "start" ? StartView() : null}
      {mode === "gpswait" ? GpsWaitView() : null}
      {mode === "goal" ? GoalView() : null}
      {mode === "how" ? HowView() : null}
      {mode === "win" ? WinView() : null}
    </div>
  );
}
