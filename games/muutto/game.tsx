// Muuttolintu: fly a year as a migratory bird. Spring comes from the south,
// so fly north to Finland as the snow melts, nest and feed the chicks, and
// fly south again before winter catches you.
//
// The globe (Kopterilento's) is lit as at noon under the bird: the sun stands
// over the bird's longitude at the latitude of the season (the axial tilt), so
// the far pole sinks into polar night in its winter. The land is coloured by a
// simple temperature model: snow, bare ground, spring green, summer, autumn.
// The small window up right shows the Earth going round the sun with its axis
// always tilted the same way. The year runs fast while you fly.
//
// Country outlines: Natural Earth (public domain). Bird art: drawn here.
// Data: tools/muutto/build.py.

import { REGIONS } from "lib/world";

type Screen = "menu" | "play" | "nest" | "done";
type Phase = "spring" | "wait" | "autumn";

// the route points run from the wintering place to Finland [lon, lat]
const SPECIES = [
  { id: "joutsen", name: rg.t("Laulujoutsen", "Whooper swan", "Cisne cantor"), winter: "DNK", wname: rg.t("Tanska", "Denmark", "Dinamarca"), wlon: 9.5, wlat: 56, start: 92, leave: 293,
    food: "🌿", foodAt: "land", color: "#48cae4", stars: 1,
    route: [[9.5, 56], [12.5, 55.6], [15.5, 56.5], [18, 58.5], [21, 60.2], [24, 61.5], [26, 63]] },
  { id: "kurki", name: rg.t("Kurki", "Crane", "Grulla"), winter: "ETH", wname: rg.t("Etiopia", "Ethiopia", "Etiopía"), wlon: 39, wlat: 9, start: 70, leave: 253,
    food: "🐸", foodAt: "land", color: "#8d99ae", stars: 2,
    route: [[39, 9], [34, 15], [31.5, 24], [30, 31], [26, 37], [22, 42.5], [20.5, 47.5], [20.5, 52], [23.5, 57], [26, 63]] },
  { id: "paasky", name: rg.t("Haarapääsky", "Barn swallow", "Golondrina"), winter: "ZAF", wname: rg.t("Etelä-Afrikka", "South Africa", "Sudáfrica"), wlon: 25, wlat: -29, start: 62, leave: 244,
    food: "🦟", foodAt: "land", color: "#3a0ca3", stars: 3,
    route: [[25, -29], [27, -15], [23, -2], [17, 9], [14, 20], [12, 30], [12.5, 38], [12, 45], [17, 51], [22, 57], [26, 63]] },
  { id: "tiira", name: rg.t("Lapintiira", "Arctic tern", "Charrán ártico"), winter: "ATA", wname: rg.t("Etelämanner", "Antarctica", "Antártida"), wlon: -10, wlat: -71, start: 50, leave: 222,
    food: "🐟", foodAt: "sea", color: "#e63946", stars: 4,
    route: [[-10, -69], [0, -55], [8, -38], [5, -20], [-2, -5], [-16, 8], [-19, 20], [-13, 33], [-10, 44], [-3, 49], [4, 56], [12, 57.5], [19, 59], [21, 62], [24, 64]] },
];
const FIN = { id: "FIN", lon: 26, lat: 63 };
const MONTHS = rg.lang === "en" ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  : rg.lang === "es" ? ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
  : ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu", "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ZOOMS = [1, 1.6, 2.6];
const SPEED = 12;               // degrees a second, full of energy
const YEAR_RATE = 3;            // days a second while flying
const WAIT_RATE = 14;           // days a second while waiting for spring
const HINT_AFTER = 15;
const TILT = 23.44;
// land colours
const SNOW = "#f2f6fb", BARE = "#a39b6b", SPRING = "#b6e36a", SUMMER = "#5fb04a", AUTUMN = "#e5a03a", MILD = "#86b25e";
const DESERT = "#e6cf96";
const DESERTS = ["SAH", "MRT", "DZA", "LBY", "EGY", "MLI", "NER", "TCD", "SAU", "OMN", "YEM", "ARE", "QAT", "KWT", "JOR"];
const ICE = ["ATA", "GRL"];

let screen: Screen = "menu";
let phase: Phase = "spring";
let sp: any = SPECIES[0];
let t = 0;
let day = 60;                   // day of the year, 0 = 1 January
let bird = { lon: 0, lat: 0, head: 0, vx: 0, vy: 0, flap: 0 };
let flying = false;
let zoomIdx = 1;
let energy = 1;
let eaten = 0;
let coldTime = 0;
let foods: any[] = [];
let clock = 0;
let hinted = false;
let lastBands = "";
let baseColors: any = {};
let regionBoxes: any[] = [];
let silhouette: any = null;
let sayCold = 0;                // when the bird may say "brr" again
let sayHungry = 0;
let arriveClock = -1;           // >= 0: arrived, a moment before the next scene
let best: any = {};
let stars: any[] = [];
let flakes: any[] = [];
let routeDots: number[][] = [];
let routeVecs: number[][] = [];
let lastSeason = "";
// the nest
let nest = { clock: 0, hatched: false, chicks: [0, 0, 0], feed: -1, feedClock: 0, from: 0, to: 0, grown: false, flyClock: 0 };

// ---- setup -------------------------------------------------------------------

function init() {
  for (const s of SPECIES) best[s.id] = rg.load("best_" + s.id, 0);
  for (const r of REGIONS) {
    const b = { x0: 9999, y0: 9999, x1: -9999, y1: -9999 };
    for (let k = 2; k < r.length; k++) {
      const ring = r[k];
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i], y = ring[i + 1];
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
        if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      }
    }
    regionBoxes.push(b);
  }
  rg.seed(11);
  for (let i = 0; i < 40; i++) stars.push({ x: rg.random(), y: rg.random(), s: 1 + rg.random() * 2 });
  for (let i = 0; i < 36; i++) flakes.push({ x: rg.random(), y: rg.random(), s: 3 + rg.random() * 4, v: 30 + rg.random() * 40 });
  rg.seed(Math.floor(Date.now() % 100000) + 1);
  rg.say("m_tervetuloa");
}

function start(i: number) {
  sp = SPECIES[i];
  rg.sound("click");
  rg.three("clear");
  day = sp.start;
  bird.lon = sp.wlon; bird.lat = sp.wlat; bird.head = 0; bird.vx = 0; bird.vy = 0;
  energy = 1; eaten = 0; coldTime = 0;
  zoomIdx = sp.id === "joutsen" ? 2 : 1;
  foods = [];
  lastBands = "";
  bandsDay = -1;
  lastSeason = "";
  makeRoute();
  setupGlobe();
  screen = "play";
  beginPhase("spring");
  rg.say(["m_" + sp.id + "_tieto", "m_kevat"]);
}

function setupGlobe() {
  const colors: any = {};
  for (const id of DESERTS) colors[id] = DESERT;
  for (const id of ICE) colors[id] = SNOW;
  baseColors = colors;
  rg.three("scene", { background: ["#061229", "#132a52"] });
  rg.three("globe", {
    regions: REGIONS, scale: 10, colors, ocean: "#2f7fc8", land: SUMMER, glow: "#7cc4ff", grid: "#ffffff",
    border: false, shade: 0.22, night: 0.7, visible: true,
  });
  updateBands();
}

function beginPhase(p: Phase) {
  phase = p;
  clock = 0;
  hinted = false;
  arriveClock = -1;
  silhouette = makeSilhouette(target());
}

function target() {
  if (phase === "autumn") return { id: sp.winter, lon: sp.wlon, lat: sp.wlat };
  return FIN;
}

// the route as dots every few degrees, along great circles
function makeRoute() {
  routeDots = [];
  const r = sp.route;
  for (let i = 0; i + 1 < r.length; i++) {
    const a = r[i], b = r[i + 1];
    const d = angDist(a[0], a[1], b[0], b[1]);
    const n = Math.max(1, Math.round(d / 2.6));
    for (let k = 0; k < n; k++) routeDots.push(slerp(a, b, k / n));
  }
  routeDots.push(r[r.length - 1]);
  routeVecs = routeDots.map((p: number[]) => vec(p[0], p[1]));
}

// ---- the seasons ---------------------------------------------------------------

// a simple yearly temperature (°C) at a latitude: colder towards the poles,
// bigger swings in the north (more land), coldest in late January
function temp(lat: number, d: number) {
  const a = Math.abs(lat);
  const mean = 28 - 0.0068 * a * a;
  const amp = lat >= 0 ? 0.25 * a : 0.12 * a;
  const dh = lat >= 0 ? d : d + 182.5;
  return mean - amp * Math.cos(2 * Math.PI * (dh - 20) / 365);
}

function rising(lat: number, d: number) {
  const dh = lat >= 0 ? d : d + 182.5;
  return Math.sin(2 * Math.PI * (dh - 20) / 365) > 0;
}

function seasonAt(lat: number, d: number) {
  const T = temp(lat, d);
  if (T < 0) return "snow";
  if (T < 5) return "bare";
  if (T >= 12) return "summer";
  const dh = ((lat >= 0 ? d : d + 182.5) % 365 + 365) % 365;
  if (rising(lat, d)) return "spring";
  if (dh > 200 && dh < 340) return "autumn";
  return "mild";
}

function seasonColor(s: string) {
  if (s === "snow") return SNOW;
  if (s === "bare") return BARE;
  if (s === "spring") return SPRING;
  if (s === "autumn") return AUTUMN;
  if (s === "mild") return MILD;
  return SUMMER;
}

// land colours by latitude, one-degree steps merged into bands
let bandsDay = -1;
function updateBands() {
  const today = Math.floor(day);
  if (today === bandsDay) return;
  bandsDay = today;
  const bands: any[] = [];
  let from = -90, col = seasonColor(seasonAt(-89.5, day));
  for (let lat = -89; lat <= 90; lat++) {
    const c = lat === 90 ? "" : seasonColor(seasonAt(lat + 0.5, day));
    if (c !== col) { bands.push([from, lat, col]); from = lat; col = c; }
  }
  const key = JSON.stringify(bands);
  if (key === lastBands) return;
  lastBands = key;
  rg.three("globe", { bands });
}

function declination(d: number) { return TILT * Math.sin(2 * Math.PI * (d - 80) / 365); }

function dayOfYear() { return ((Math.floor(day) % 365) + 365) % 365; }

function monthOf(d: number) {
  let m = 0, k = d;
  while (m < 11 && k >= MDAYS[m]) { k -= MDAYS[m]; m++; }
  return m;
}

function seasonIcon(s: string, lat: number, d: number) {
  if (s === "snow") return "❄️";
  if (s === "bare") return rising(lat, d) ? "🌱" : "🍂";
  if (s === "spring") return "🌱";
  if (s === "autumn") return "🍂";
  return "☀️";
}

// ---- geometry -------------------------------------------------------------------

function rad(x: number) { return x * Math.PI / 180; }

function angDist(lon1: number, lat1: number, lon2: number, lat2: number) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(rg.clamp(c, -1, 1)) * 180 / Math.PI;
}

function vec(lon: number, lat: number) {
  const cl = Math.cos(rad(lat));
  return [cl * Math.cos(rad(lon)), cl * Math.sin(rad(lon)), Math.sin(rad(lat))];
}

function slerp(a: number[], b: number[], f: number) {
  const va = vec(a[0], a[1]), vb = vec(b[0], b[1]);
  const v = [va[0] + (vb[0] - va[0]) * f, va[1] + (vb[1] - va[1]) * f, va[2] + (vb[2] - va[2]) * f];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [Math.atan2(v[1], v[0]) * 180 / Math.PI, Math.asin(v[2] / l) * 180 / Math.PI];
}

function bearing(lon1: number, lat1: number, lon2: number, lat2: number) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI;
}

function globeR() { return Math.min(width, height) * 0.44 * ZOOMS[zoomIdx]; }
function birdY() { return height * 0.56; }

// a point on the screen, as the engine draws the globe (orthographic, facing the bird)
let basis = { lon: 999, lat: 999, e: [0, 0, 0], n: [0, 0, 0], v: [0, 0, 0] };
function projectV(p: number[]) {
  if (basis.lon !== bird.lon || basis.lat !== bird.lat) {
    const slo = Math.sin(rad(bird.lon)), clo = Math.cos(rad(bird.lon));
    const sla = Math.sin(rad(bird.lat)), cla = Math.cos(rad(bird.lat));
    basis = { lon: bird.lon, lat: bird.lat, e: [-slo, clo, 0], n: [-sla * clo, -sla * slo, cla], v: [cla * clo, cla * slo, sla] };
  }
  const R = globeR();
  const z = basis.v[0] * p[0] + basis.v[1] * p[1] + basis.v[2] * p[2];
  const x = basis.e[0] * p[0] + basis.e[1] * p[1];
  const y = basis.n[0] * p[0] + basis.n[1] * p[1] + basis.n[2] * p[2];
  return { x: width / 2 + x * R, y: birdY() - y * R, z };
}
function project(lon: number, lat: number) { return projectV(vec(lon, lat)); }

function regionAt(lon: number, lat: number): any {
  const x = lon * 10, y = lat * 10;
  for (let i = 0; i < REGIONS.length; i++) {
    const b = regionBoxes[i];
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
    const r = REGIONS[i];
    for (let k = 2; k < r.length; k++) if (inRing(r[k], x, y)) return r;
  }
  return null;
}

function inRing(ring: number[], x: number, y: number) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function wrapLon(lon: number, around: number) {
  while (lon - around > 180) lon -= 360;
  while (lon - around < -180) lon += 360;
  return lon;
}

// the target country's shape for the card
function makeSilhouette(tg: any) {
  const cosl = Math.max(0.3, Math.cos(rad(tg.lat)));
  const pts: number[][] = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const polar = tg.lat < -60;
  for (const r of REGIONS) {
    if (r[0] !== tg.id) continue;
    for (let k = 2; k < r.length; k++) {
      const ring = r[k];
      const lon0 = wrapLon(ring[0] / 10, tg.lon), lat0 = ring[1] / 10;
      if (!polar && (Math.abs(lon0 - tg.lon) * cosl > 45 || Math.abs(lat0 - tg.lat) > 45)) continue;
      const p: number[] = [];
      for (let i = 0; i < ring.length; i += 2) {
        let x = 0, y = 0;
        if (polar) {
          // Antarctica seen from below the South Pole
          const rr = 90 + ring[i + 1] / 10, a = rad(ring[i] / 10);
          x = rr * Math.sin(a); y = -rr * Math.cos(a);
        } else {
          x = (wrapLon(ring[i] / 10, tg.lon) - tg.lon) * cosl; y = -(ring[i + 1] / 10 - tg.lat);
        }
        p.push(x, y);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      pts.push(p);
    }
  }
  const W = 60, H = 48;
  const k = Math.min((W - 6) / Math.max(0.1, x1 - x0), (H - 6) / Math.max(0.1, y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  let d = "";
  for (const p of pts) {
    for (let i = 0; i < p.length; i += 2) d += (i === 0 ? "M " : "L ") + (ox + (p[i] - x0) * k).toFixed(1) + " " + (oy + (p[i + 1] - y0) * k).toFixed(1) + " ";
    d += "Z ";
  }
  return { d, w: W, h: H };
}

// ---- input ------------------------------------------------------------------

function onPointerDown(x: number, y: number) {
  if (screen !== "play") return;
  if (y < 76) return;                                       // the task card
  if (x > width - 140 && y < 176) return;                   // the sun window
  if (x > width - 70 && y > height - 150) return;           // zoom buttons
  if (x < 70 && y > height - 80) return;                    // hint button
  flying = true;
}
function onPointerUp() { flying = false; }

function onKeyDown(key: string) {
  if (screen === "nest" && key === "n") { for (let i = 0; i < 3; i++) nest.chicks[i] = 3; }
  if (screen !== "play") return;
  if (key === "+" || key === "=") zoom(1);
  if (key === "-") zoom(-1);
  if (key === "h") hint();
  if (key === "n") { const tg = target(); bird.lon = tg.lon; bird.lat = tg.lat; }   // for testing: jump there
  if (key === "y") day += 30;                                                       // for testing: a month on
}

function onClose() {
  if (screen !== "menu") { back(); return false; }
  return true;
}

function back() {
  rg.three("clear");
  screen = "menu";
  flying = false;
}

function zoom(d: number) {
  zoomIdx = rg.clamp(zoomIdx + d, 0, ZOOMS.length - 1);
  rg.sound("click");
}

function hint() {
  if (hinted) return;
  hinted = true;
  rg.sound("pop");
  sayTask();
}

function sayTask() {
  if (phase === "autumn") rg.say("m_" + sp.id + "_etela");
  else rg.say("m_suomi");
}

function sayOrbit() {
  const s = seasonAt(FIN.lat, dayOfYear());
  rg.say(["m_aurinko", s === "snow" || s === "bare" ? "m_talvi_suomi" : s === "summer" ? "m_kesa_suomi" : s === "spring" ? "m_kevat" : "m_syksy"]);
}

// ---- tick -------------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  if (screen === "nest") { tickNest(dt); return; }
  if (screen !== "play") return;
  bird.flap += dt * (6 + Math.hypot(bird.vx, bird.vy) * 4);
  clock += dt;
  if (clock > HINT_AFTER) hinted = true;

  if (phase === "wait") {
    day += WAIT_RATE * dt;
    if (temp(bird.lat, dayOfYear()) > 1.5) { rg.say("m_kevat_tuli"); toNest(); return; }
  } else if (arriveClock >= 0) {
    arriveClock += dt;
    bird.vx *= 0.9; bird.vy *= 0.9;
    if (arriveClock > 2.2) afterArrival();
  } else {
    day += YEAR_RATE * dt;
    steer(dt, input);
  }
  updateBands();
  const T = temp(bird.lat, dayOfYear());
  const cold = T < 0;
  if (phase !== "wait" && arriveClock < 0) {
    energy -= dt * (0.012 + (cold ? 0.07 : 0));
    if (cold) {
      coldTime += dt;
      if (t > sayCold) { sayCold = t + 9; rg.say(phase === "autumn" ? "m_kylma_syksy" : "m_kylma_kevat"); }
    }
    if (energy < 0.25 && t > sayHungry && !cold) { sayHungry = t + 12; rg.say("m_nalka"); }
    energy = rg.clamp(energy, 0, 1);
    tickFoods();
    checkArrival();
  }
  const s = seasonAt(bird.lat, dayOfYear());
  lastSeason = s;
  drawGlobe();
}

function steer(dt: number, input: any) {
  let dx = 0, dy = 0;
  const k = input.keys;
  if (k.ArrowLeft || k.a) dx -= 1;
  if (k.ArrowRight || k.d) dx += 1;
  if (k.ArrowUp || k.w) dy -= 1;
  if (k.ArrowDown || k.s) dy += 1;
  if (flying && input.pointer.down) {
    const px = input.pointer.x - width / 2, py = input.pointer.y - birdY();
    const d = Math.hypot(px, py);
    if (d > 12) { const f = rg.clamp(d / 110, 0.3, 1); dx = px / d * f; dy = py / d * f; }
  } else if (!input.pointer.down) flying = false;
  const L = Math.hypot(dx, dy);
  if (L > 1) { dx /= L; dy /= L; }
  const e = Math.min(1, dt * 3);
  bird.vx += (dx - bird.vx) * e;
  bird.vy += (dy - bird.vy) * e;
  const v = Math.hypot(bird.vx, bird.vy);
  if (v > 0.05) {
    const want = Math.atan2(bird.vx, -bird.vy) * 180 / Math.PI;
    let dh = want - bird.head;
    while (dh > 180) dh -= 360;
    while (dh < -180) dh += 360;
    bird.head += dh * Math.min(1, dt * 6);
  }
  const cold = temp(bird.lat, dayOfYear()) < 0;
  const degs = SPEED * (0.45 + 0.55 * energy) * (cold ? 0.7 : 1);
  bird.lat = rg.clamp(bird.lat - bird.vy * degs * dt, -80, 82);
  bird.lon += bird.vx * degs * dt / Math.max(0.2, Math.cos(rad(bird.lat)));
  if (bird.lon > 180) bird.lon -= 360;
  if (bird.lon < -180) bird.lon += 360;
}

function checkArrival() {
  const tg = target();
  const hit = regionAt(bird.lon, bird.lat);
  if (!hit || hit[0] !== tg.id) return;
  arriveClock = 0;
  flying = false;
  rg.celebrate(width / 2, birdY(), { big: phase === "autumn" });
  if (phase === "autumn") rg.say("m_" + sp.id + "_perilla");
  else rg.say("m_perilla_suomi");
}

function afterArrival() {
  if (phase === "autumn") { finish(); return; }
  if (temp(bird.lat, dayOfYear()) <= 1.5) {
    phase = "wait";
    rg.say("m_lunta_suomessa");
    return;
  }
  toNest();
}

function finish() {
  screen = "done";
  flying = false;
  const n = starsNow();
  if (n > best[sp.id]) { best[sp.id] = n; rg.save("best_" + sp.id, n); }
  rg.say("m_valmis");
  rg.celebrate(width / 2, height / 2, { big: true });
  rg.three("globe", { visible: false });
}

function starsNow() {
  let n = 1;
  if (coldTime < 6) n++;
  if (eaten >= 5) n++;
  return n;
}

// ---- food -------------------------------------------------------------------

function tickFoods() {
  const d = dayOfYear();
  // eat what is under the bird
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    const dist = angDist(bird.lon, bird.lat, f.lon, f.lat);
    if (dist * globeR() * Math.PI / 180 < 30) {
      foods.splice(i, 1);
      energy = Math.min(1, energy + 0.3);
      eaten++;
      rg.sound("pop");
      if (eaten % 3 === 1) rg.say("m_namia");
      continue;
    }
    if (dist > 40 || temp(f.lat, d) < 2) foods.splice(i, 1);
  }
  // new food ahead, where it is warm
  let tries = 0;
  while (foods.length < 7 && tries < 6) {
    tries++;
    const tg = target();
    const toward = bearing(bird.lon, bird.lat, tg.lon, tg.lat);
    const ang = rad(toward + (rg.random() - 0.5) * 160);
    const dist = 6 + rg.random() * 22;
    const lat = bird.lat + Math.cos(ang) * dist;
    if (lat > 80 || lat < -78) continue;
    const lon = bird.lon + Math.sin(ang) * dist / Math.max(0.25, Math.cos(rad(bird.lat)));
    if (temp(lat, d) < 5) continue;
    const land = regionAt(lon, lat) !== null;
    if ((sp.foodAt === "sea") === land) continue;
    foods.push({ lon, lat, v: vec(lon, lat), ph: rg.random() * 6 });
  }
}

// ---- the nest -------------------------------------------------------------------

function toNest() {
  screen = "nest";
  flying = false;
  nest.clock = 0; nest.hatched = false; nest.chicks = [0, 0, 0]; nest.feed = -1; nest.grown = false; nest.flyClock = 0;
  nest.from = day;
  nest.to = Math.max(sp.leave, day + 40);
  rg.three("globe", { visible: false });
  rg.say("m_pesa");
}

function tickNest(dt: number) {
  nest.clock += dt;
  bird.flap += dt * 5;
  if (!nest.hatched && nest.clock > 2.5) { nest.hatched = true; rg.sound("pop"); rg.say("m_munat"); }
  if (nest.feed >= 0) {
    nest.feedClock += dt;
    if (nest.feedClock > 0.6) { nest.chicks[nest.feed]++; nest.feed = -1; rg.sound("pop"); }
  }
  let fed = 0;
  for (const c of nest.chicks) fed += Math.min(3, c);
  // the summer goes by as the chicks grow
  const goal = nest.from + (nest.to - nest.from) * fed / 9;
  if (day < goal) day = Math.min(goal, day + dt * 20);
  if (fed >= 9 && !nest.grown && day >= nest.to - 0.5) {
    nest.grown = true;
    nest.flyClock = 0;
    rg.celebrate(width / 2, height * 0.45, { big: true });
    rg.say("m_isoja");
  }
  if (nest.grown) nest.flyClock += dt;
}

function feedChick(i: number) {
  if (!nest.hatched || nest.feed >= 0 || nest.chicks[i] >= 3) return;
  nest.feed = i;
  nest.feedClock = 0;
  rg.sound("click");
}

function leaveNest() {
  rg.sound("click");
  screen = "play";
  rg.three("globe", { visible: true });
  bird.vx = 0; bird.vy = 0;
  beginPhase("autumn");
  rg.say(["m_syksy", "m_" + sp.id + "_etela"]);
}

// ---- drawing helpers -------------------------------------------------------------

function poly(p: number[]) {
  let d = "";
  for (let i = 0; i < p.length; i += 2) d += (i === 0 ? "M " : "L ") + p[i].toFixed(1) + " " + p[i + 1].toFixed(1) + " ";
  return d + "Z";
}

function ell(cx: number, cy: number, rx: number, ry: number, n: number) {
  const p: number[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return poly(p);
}

function P(d: string, fill: string, S: number, stroke?: string, sw?: number) {
  return <path d={d} fill={fill} stroke={stroke || "none"} strokeWidth={String(sw || 0)} viewBox="0 0 100 100"
    style={{ position: "absolute", left: 0, top: 0, width: S, height: S }} />;
}

// one wing (side -1 left, 1 right): span and sweep in the 100 x 100 box
function wing(side: number, span: number, y0: number, chord: number, sweep: number, pointy: number) {
  const x = (f: number) => 50 + side * (5 + (span - 5) * f);
  return poly([
    x(0), y0,
    x(0.45), y0 - 3 + sweep * 0.3,
    x(0.85), y0 + sweep * 0.8,
    x(1), y0 + sweep + chord * 0.15,
    x(0.8), y0 + sweep * 0.8 + chord * (0.45 - pointy * 0.25),
    x(0.45), y0 + chord * 0.85 + sweep * 0.3,
    x(0), y0 + chord,
  ]);
}

function wingTip(side: number, span: number, y0: number, chord: number, sweep: number, pointy: number) {
  const x = (f: number) => 50 + side * (5 + (span - 5) * f);
  return poly([
    x(0.7), y0 - 1 + sweep * 0.6,
    x(0.85), y0 + sweep * 0.8,
    x(1), y0 + sweep + chord * 0.15,
    x(0.8), y0 + sweep * 0.8 + chord * (0.45 - pointy * 0.25),
    x(0.7), y0 + chord * 0.6 + sweep * 0.6,
  ]);
}

// a bird seen from above, head up, in an S x S box; flap 0..1 (1: wings spread)
function birdArt(id: string, S: number, flap: number) {
  const out: any[] = [];
  const f = 0.45 + 0.55 * flap;
  if (id === "joutsen") {
    const span = 8 + 40 * f;
    out.push(P(ell(50, 74, 6, 5, 10), "#e9ecef", S));
    for (const s of [-1, 1]) out.push(P(wing(s, span, 42, 20, 6, 0), "#ffffff", S, "#adb5bd", 1.2));
    for (const s of [-1, 1]) out.push(P(wingTip(s, span, 42, 20, 6, 0), "#dee2e6", S));
    out.push(P(ell(50, 54, 9, 19, 16), "#ffffff", S, "#ced4da", 1));
    out.push(P(poly([47.5, 40, 52.5, 40, 52, 20, 48, 20]), "#ffffff", S, "#ced4da", 0.8));
    out.push(P(ell(50, 18, 4.2, 5.5, 12), "#ffffff", S, "#ced4da", 0.8));
    out.push(P(poly([47.6, 14, 52.4, 14, 51.2, 7, 48.8, 7]), "#ffd60a", S));
    out.push(P(poly([48.8, 7, 51.2, 7, 50, 4]), "#212529", S));
  } else if (id === "kurki") {
    const span = 8 + 41 * f;
    out.push(P("M 47 70 L 46 94 M 53 70 L 54 94", "none", S, "#343a40", 2));
    for (const s of [-1, 1]) out.push(P(wing(s, span, 40, 22, 5, 0.2), "#adb5bd", S, "#6c757d", 1));
    for (const s of [-1, 1]) out.push(P(wingTip(s, span, 40, 22, 5, 0.2), "#212529", S));
    out.push(P(poly([44, 64, 56, 64, 54, 76, 46, 76]), "#495057", S));
    out.push(P(ell(50, 52, 7.5, 16, 16), "#adb5bd", S, "#6c757d", 1));
    out.push(P(poly([48, 40, 52, 40, 51.5, 18, 48.5, 18]), "#212529", S));
    out.push(P(poly([50.3, 38, 52, 38, 51.6, 22, 50.3, 22]), "#ffffff", S));
    out.push(P(ell(50, 16, 3.6, 4.6, 12), "#212529", S));
    out.push(P(ell(50, 14.5, 1.8, 1.8, 8), "#e63946", S));
    out.push(P(poly([48.8, 12, 51.2, 12, 50, 3]), "#6c757d", S));
  } else if (id === "paasky") {
    const span = 8 + 40 * f;
    out.push(P(poly([47, 62, 53, 62, 60, 96, 56.5, 96, 50, 72, 43.5, 96, 40, 96]), "#14213d", S));
    for (const s of [-1, 1]) out.push(P(wing(s, span, 40, 14, 16, 1), "#1d3a8a", S, "#0b132b", 1));
    out.push(P(ell(50, 50, 6.5, 14, 14), "#1d3a8a", S, "#0b132b", 1));
    out.push(P(ell(50, 35, 5.2, 5.5, 12), "#1d3a8a", S));
    out.push(P(ell(50, 31.5, 3.6, 2.4, 10), "#c1121f", S));
    out.push(P(poly([48.3, 30, 51.7, 30, 50, 25]), "#212529", S));
  } else {
    const span = 8 + 41 * f;
    out.push(P(poly([46.5, 62, 53.5, 62, 58, 88, 55, 88, 50, 72, 45, 88, 42, 88]), "#ffffff", S, "#ced4da", 0.8));
    for (const s of [-1, 1]) out.push(P(wing(s, span, 40, 15, 12, 1), "#e9ecef", S, "#adb5bd", 1));
    for (const s of [-1, 1]) out.push(P(wingTip(s, span, 40, 15, 12, 1), "#6c757d", S));
    out.push(P(ell(50, 50, 6, 14, 14), "#ffffff", S, "#ced4da", 1));
    out.push(P(ell(50, 35, 5, 5.5, 12), "#212529", S));
    out.push(P(poly([48.6, 31, 51.4, 31, 50, 21]), "#e63946", S));
  }
  return out;
}

// ---- view -------------------------------------------------------------------

function drawGlobe() {
  const args: any = { lon: bird.lon, lat: bird.lat, r: globeR(), x: width / 2, y: birdY(), sun: [bird.lon, declination(dayOfYear())] };
  if (hinted && arriveClock < 0 && phase !== "wait") {
    const on = Math.floor(t * 3) % 2 === 0;
    const c: any = {};
    const id = target().id;
    c[id] = on ? "#ff006e" : (baseColors[id] || null);
    args.colors = c;
  } else {
    const c: any = {};
    const id = target().id;
    c[id] = baseColors[id] || null;
    args.colors = c;
  }
  rg.three("globe", args);
}

function Bird() {
  const y = birdY();
  const S = 112;
  const cold = lastSeason === "snow" && arriveClock < 0 && phase !== "wait";
  const jit = cold ? Math.sin(t * 40) * 1.5 : 0;
  const flap = 0.5 + 0.5 * Math.sin(bird.flap);
  const land = arriveClock >= 0 ? Math.min(1, arriveClock / 1.2) : phase === "wait" ? 1 : 0;
  const sc = 1 - land * 0.2;
  const sh = 18 - land * 10;
  return [
    <div className="bshadow" style={{ left: width / 2 - 30 + sh, top: y - 22 + sh, transform: "rotate(" + Math.round(bird.head) + "deg)" }} />,
    <div className="bird" style={{ left: width / 2 - S / 2 + jit, top: y - S / 2, width: S, height: S, transform: "rotate(" + Math.round(bird.head) + "deg) scale(" + sc.toFixed(2) + ")" }}>
      {birdArt(sp.id, S, land > 0.9 ? 0.15 : flap)}
    </div>,
  ];
}

function Route() {
  const out: any[] = [];
  for (const p of routeVecs) {
    const q = projectV(p);
    if (q.z < 0.08 || q.x < -10 || q.x > width + 10 || q.y < -10 || q.y > height + 10) continue;
    out.push(<div className="rdot" style={{ left: q.x - 3, top: q.y - 3 }} />);
  }
  return out;
}

function Goal() {
  const tg = target();
  const q = project(tg.lon, tg.lat);
  if (q.z < 0.1) return null;
  const bob = Math.sin(t * 4) * 3;
  if (phase === "autumn") return <div className="goal" style={{ left: q.x - 20, top: q.y - 44 + bob }}>☀️</div>;
  return (
    <div className="nestpin" style={{ left: q.x - 18, top: q.y - 30 + bob }}>
      <div className="egg" style={{ left: 7, top: 8 }} />
      <div className="egg" style={{ left: 16, top: 11 }} />
      <div className="egg" style={{ left: 11, top: 16 }} />
    </div>
  );
}

function Foods() {
  const out: any[] = [];
  for (const f of foods) {
    const q = projectV(f.v);
    if (q.z < 0.1 || q.x < -20 || q.x > width + 20 || q.y < -20 || q.y > height + 20) continue;
    const bob = Math.sin(t * 3 + f.ph) * 3;
    out.push(<div className="food" style={{ left: q.x - 15, top: q.y - 15 + bob }}>{sp.food}</div>);
  }
  return out;
}

function Arrow() {
  if (!hinted || arriveClock >= 0 || phase === "wait") return null;
  const tg = target();
  // toward the next route point ahead, or the goal
  let aim = [tg.lon, tg.lat];
  let bestI = 0, bestD = 1e9;
  for (let i = 0; i < sp.route.length; i++) {
    const d = angDist(bird.lon, bird.lat, sp.route[i][0], sp.route[i][1]);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  const nextI = phase === "autumn" ? bestI - 1 : bestI + 1;
  if (bestD < 8 && nextI >= 0 && nextI < sp.route.length) aim = sp.route[nextI];
  else if (bestD >= 8) aim = sp.route[bestI];
  const ang = bearing(bird.lon, bird.lat, aim[0], aim[1]);
  const R = 76 + Math.sin(t * 6) * 5;
  const a = rad(ang);
  const x = width / 2 + Math.sin(a) * R, y = birdY() - Math.cos(a) * R;
  return (
    <div className="arrow" style={{ left: x - 22, top: y - 22, transform: "rotate(" + Math.round(ang) + "deg)" }}>
      <path d="M 22 2 L 40 26 L 29 26 L 29 42 L 15 42 L 15 26 L 4 26 Z" fill="#ffd166" stroke="#7a3e00" strokeWidth="3" viewBox="0 0 44 44"
        style={{ position: "absolute", left: 0, top: 0, width: 44, height: 44 }} />
    </div>
  );
}

function Snow() {
  if (lastSeason !== "snow" || screen !== "play") return null;
  const out: any[] = [];
  for (const f of flakes) {
    const y = ((f.y * height + t * f.v) % (height + 20)) - 10;
    const x = f.x * width + Math.sin(t * 1.5 + f.y * 9) * 12;
    out.push(<div className="flake" style={{ left: x, top: y, width: f.s, height: f.s, borderRadius: f.s / 2 }} />);
  }
  return out;
}

// the Earth going round the sun, its axis always leaning the same way
function Orbit() {
  const W = 128, H = 96;
  const ox = width - W - 8, oy = 76;
  const cx = W / 2, cy = 38, RX = 52, RY = 23;
  const d = dayOfYear();
  const th = 2 * Math.PI * (d - 172) / 365;
  const ex = cx - RX * Math.cos(th), ey = cy + RY * Math.sin(th);
  const behind = Math.sin(th) < 0;             // the far side of the sun
  const er = 9 + Math.sin(th) * 1.5;
  let orbit = "";
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * Math.PI * 2;
    orbit += (i === 0 ? "M " : "L ") + (cx + RX * Math.cos(a)).toFixed(1) + " " + (cy + RY * Math.sin(a)).toFixed(1) + " ";
  }
  // the half of the Earth facing the sun
  const toSun = Math.atan2(cy - ey, cx - ex);
  const lit: number[] = [];
  for (let k = 0; k <= 12; k++) { const a = toSun - Math.PI / 2 + Math.PI * k / 12; lit.push(ex + Math.cos(a) * er, ey + Math.sin(a) * er); }
  const tx = Math.sin(rad(TILT)), ty = Math.cos(rad(TILT));
  const L = er + 5;
  const axis = "M " + (ex - tx * L).toFixed(1) + " " + (ey + ty * L).toFixed(1) + " L " + (ex + tx * L).toFixed(1) + " " + (ey - ty * L).toFixed(1);
  const finX = ex + tx * er * 0.62, finY = ey - ty * er * 0.62;
  const box = (d2: string, fill: string, stroke?: string, sw?: number) =>
    <path d={d2} fill={fill} stroke={stroke || "none"} strokeWidth={String(sw || 0)} viewBox={"0 0 " + W + " " + H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} />;
  const earth = [
    box(ell(ex, ey, er, er, 20), "#16324f"),
    box(poly(lit), "#4cc9f0"),
    box(axis, "none", "#ffffff", 1.6),
    <div className="fin" style={{ left: finX - 2.5, top: finY - 2.5 }} />,
  ];
  const sun = [
    <div className="sunglow" style={{ left: cx - 13, top: cy - 13 }} />,
    <div className="sun" style={{ left: cx - 8, top: cy - 8 }} />,
  ];
  const s = seasonAt(bird.lat, d);
  return (
    <div className="orbit" id="orbit" onClick={sayOrbit} style={{ left: ox, top: oy, width: W, height: H }}>
      {box(orbit, "none", "rgba(255,255,255,0.35)", 1)}
      {behind ? earth : sun}
      {behind ? sun : earth}
      <div className="month" style={{ width: W }}>{seasonIcon(s, bird.lat, d) + " " + MONTHS[monthOf(d)]}</div>
    </div>
  );
}

function Card() {
  const tg = target();
  const name = phase === "autumn" ? sp.wname : "Suomi";
  const pic = <div className="pic"><path d={silhouette.d} fill={phase === "autumn" ? "#ffb703" : "#90e0ef"} stroke="#3d405b" strokeWidth="1.2"
    viewBox={"0 0 " + silhouette.w + " " + silhouette.h} style={{ position: "absolute", left: 2, top: 4, width: silhouette.w, height: silhouette.h }} /></div>;
  return (
    <div className="card" id="card" onClick={sayTask} style={{ width: width - 72 }}>
      {pic}
      <div className="cardtext">
        <div className="find">{(phase === "autumn" ? rg.t("Talveksi", "For the winter", "Para el invierno") : rg.t("Pesimään", "To nest", "A anidar")) + " 🔊"}</div>
        <div className="tname">{name}</div>
      </div>
    </div>
  );
}

function Hud() {
  const out: any[] = [];
  const low = energy < 0.25;
  out.push(
    <div className="energy">
      <div className="efood">{sp.food}</div>
      <div className="ebar"><div className="efill" style={{ width: Math.round(70 * energy), backgroundColor: low ? "#e63946" : "#06d6a0" }} /></div>
    </div>
  );
  if (phase === "wait") out.push(<div className="under" style={{ left: 0, width: width, top: birdY() + 62 }}><div className="underin">{"❄️ ➜ 🌱  " + rg.t("odotetaan kevättä", "waiting for spring", "esperando la primavera")}</div></div>);
  if (!hinted && arriveClock < 0 && phase !== "wait") out.push(<div className="btn" id="hint" onClick={hint} style={{ left: 12, top: height - 68 }}>❓</div>);
  out.push(<div className="btn" id="zin" onClick={() => zoom(1)} style={{ left: width - 64, top: height - 136 }}>➕</div>);
  out.push(<div className="btn" id="zout" onClick={() => zoom(-1)} style={{ left: width - 64, top: height - 68 }}>➖</div>);
  return out;
}

function Stars() {
  const R = globeR() * 1.08, hy = birdY();
  const out: any[] = [];
  for (const s of stars) {
    const x = s.x * width, y = s.y * height;
    if (Math.hypot(x - width / 2, y - hy) < R) continue;
    out.push(<div className="star" style={{ left: x, top: y, width: s.s, height: s.s }} />);
  }
  return out;
}

function Nest() {
  const d = dayOfYear();
  const ground = seasonColor(seasonAt(FIN.lat, d));
  const cx = width / 2, cy = height * 0.52;
  const out: any[] = [];
  // grass tufts
  for (let i = 0; i < 14; i++) {
    const gx = (i * 97) % width, gy = 120 + ((i * 211) % Math.max(1, height - 200));
    out.push(<div className="tuft" style={{ left: gx, top: gy }} />);
  }
  out.push(<div className="nestring" style={{ left: cx - 95, top: cy - 80, width: 190, height: 160, borderRadius: 80 }} />);
  out.push(<div className="nestin" style={{ left: cx - 72, top: cy - 58, width: 144, height: 116, borderRadius: 58 }} />);
  const spots = [[-36, -10], [32, -14], [0, 26]];
  const chickColor = sp.id === "joutsen" ? "#ced4da" : sp.id === "kurki" ? "#c08552" : sp.id === "paasky" ? "#495057" : "#adb5bd";
  for (let i = 0; i < 3; i++) {
    const x = cx + spots[i][0], y = cy + spots[i][1];
    if (!nest.hatched) {
      const shake = nest.clock > 1.6 ? Math.sin(t * 30 + i) * 2 : 0;
      out.push(<div className="negg" style={{ left: x - 15 + shake, top: y - 20 }} />);
      continue;
    }
    const g = Math.min(3, nest.chicks[i]);
    const flyOff = nest.grown ? nest.flyClock * 120 : 0;
    if (nest.grown && nest.flyClock > 0.6) {
      // the grown chick flies away as a small bird
      const S = 56;
      out.push(<div className="bird" style={{ left: x - S / 2 + spots[i][0] * nest.flyClock, top: y - S / 2 - flyOff, width: S, height: S }}>{birdArt(sp.id, S, 0.5 + 0.5 * Math.sin(t * 14 + i))}</div>);
      continue;
    }
    const r = 14 + g * 5;
    const hungry = g < 3;
    const bob = hungry ? Math.abs(Math.sin(t * 6 + i * 2)) * 3 : 0;
    out.push(
      <div className="chick" id={"chick" + i} onClick={() => feedChick(i)} style={{ left: x - r, top: y - r - bob, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: chickColor }}>
        <div className="eye" style={{ left: r - 9, top: r * 0.45 }} />
        <div className="eye" style={{ left: r + 3, top: r * 0.45 }} />
        {hungry ? <div className="beak" style={{ left: r - 7, top: r * 0.8 }} /> : null}
      </div>
    );
  }
  // the parent
  const S = 100;
  const px = cx + 95, py = cy - 120;
  let fx = px, fy = py;
  if (nest.feed >= 0) {
    const k = Math.min(1, nest.feedClock / 0.6);
    fx = px + (cx + spots[nest.feed][0] - px) * k;
    fy = py + (cy + spots[nest.feed][1] - py) * k;
    out.push(<div className="food" style={{ left: fx - 15, top: fy - 15 }}>{sp.food}</div>);
  }
  out.push(<div className="bird" style={{ left: px - S / 2, top: py - S / 2, width: S, height: S, transform: "rotate(200deg)" }}>{birdArt(sp.id, S, 0.5 + 0.5 * Math.sin(bird.flap * 2))}</div>);
  const pct = Math.round(100 * (day - nest.from) / Math.max(1, nest.to - nest.from));
  return (
    <div className="screen" style={{ backgroundColor: ground }}>
      {out}
      <div className="card" style={{ width: width - 72 }}>
        <div className="pic"><div className="picicon">{nest.grown ? "🍂" : "🏡"}</div></div>
        <div className="cardtext">
          <div className="find">{nest.hatched ? "Ruoki poikaset 🔊" : "Munat kuoriutuvat …"}</div>
          <div className="tname">{nest.grown ? rg.t("Lennä etelään!", "Fly south!", "¡Vuela al sur!") : rg.t("Pesä Suomessa", "Nest in Finland", "Nido en Finlandia")}</div>
        </div>
      </div>
      {Orbit()}
      {nest.grown && nest.flyClock > 1.2 ? <div className="go big" id="south" onClick={leaveNest} style={{ left: width / 2 - 90, top: height - 120 }}>🍂 ➜ ☀️</div> : null}
    </div>
  );
}

function Menu() {
  const tiles = SPECIES.map((s: any, i: number) => {
    const st: any[] = [];
    for (let k = 0; k < s.stars; k++) st.push("⭐");
    let got = best[s.id] > 0 ? "   🏅 " : "";
    for (let k = 0; k < best[s.id]; k++) got += "★";
    return (
      <div className="mtile" id={"sp-" + s.id} onClick={() => start(i)} style={{ backgroundColor: s.color }}>
        <div className="micon"><div className="mbird">{birdArt(s.id, 64, 0.8)}</div></div>
        <div className="mtext">
          <div className="mname">{s.name}</div>
          <div className="msub">{rg.t("Suomi", "Finland", "Finlandia") + " ⇄ " + s.wname}</div>
          <div className="mstars">{st.join("") + got}</div>
        </div>
      </div>
    );
  });
  const bob = Math.sin(t * 3) * 4;
  return (
    <div className="menu">
      <div className="title" style={{ marginTop: 14 + bob }}>
        <div className="mbird big">{birdArt("paasky", 84, 0.5 + 0.5 * Math.sin(t * 8))}</div>
      </div>
      <div className="logo">{rg.t("Muuttolintu", "Migrating Bird", "Ave migratoria")}</div>
      <div className="mlist">{tiles}</div>
    </div>
  );
}

function Done() {
  const n = starsNow();
  let st = "";
  for (let k = 0; k < 3; k++) st += k < n ? "⭐" : "☆";
  return (
    <div className="overlay">
      <div className="donebox">
        <div className="mbird done">{birdArt(sp.id, 90, 0.5 + 0.5 * Math.sin(t * 8))}</div>
        <div className="donetitle">{rg.t("Vuosi lennetty!", "A year of flying!", "¡Un año volando!")}</div>
        <div className="donestars">{st}</div>
        <div className="donerow">{sp.food + " " + eaten + "    ❄️ " + Math.round(coldTime) + " s"}</div>
        <div className="row">
          <div className="go" id="again" onClick={() => start(SPECIES.indexOf(sp))}>🔁</div>
          <div className="go alt" id="menu" onClick={back}>🏠</div>
        </div>
      </div>
    </div>
  );
}

function view() {
  if (screen === "menu") return <div className="screen" style={{ backgroundColor: "#8ecae6" }}>{Menu()}</div>;
  if (screen === "nest") return Nest();
  return (
    <div className="screen">
      {Stars()}
      {screen === "play" ? Route() : null}
      {screen === "play" ? Foods() : null}
      {screen === "play" ? Goal() : null}
      {screen === "play" ? Arrow() : null}
      {screen === "play" ? Bird() : null}
      {Snow()}
      {screen === "play" ? Hud() : null}
      {screen === "play" ? Card() : null}
      {screen === "play" ? Orbit() : null}
      {screen === "done" ? Done() : null}
    </div>
  );
}
