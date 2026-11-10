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
  { id: "joutsen", name: rg.t("Laulujoutsen", "Whooper swan", "Cisne cantor"), winter: "DNK", wname: rg.t("Tanska", "Denmark", "Dinamarca"), wlon: 9.5, wlat: 56, start: 70, leave: 293,
    food: "🌿", foodAt: "land", color: "#48cae4", stars: 1,
    route: [[9.5, 56], [12.5, 55.6], [15.5, 56.5], [18, 58.5], [21, 60.2], [24, 61.5], [26, 63]] },
  { id: "kurki", name: rg.t("Kurki", "Crane", "Grulla"), winter: "ETH", wname: rg.t("Etiopia", "Ethiopia", "Etiopía"), wlon: 39, wlat: 9, start: 40, leave: 253,
    food: "🐸", foodAt: "land", color: "#8d99ae", stars: 2,
    route: [[39, 9], [34, 15], [31.5, 24], [30, 31], [26, 37], [22, 42.5], [20.5, 47.5], [20.5, 52], [23.5, 57], [26, 63]] },
  { id: "paasky", name: rg.t("Haarapääsky", "Barn swallow", "Golondrina"), winter: "ZAF", wname: rg.t("Etelä-Afrikka", "South Africa", "Sudáfrica"), wlon: 25, wlat: -29, start: 30, leave: 244,
    food: "🦟", foodAt: "land", color: "#3a0ca3", stars: 3,
    route: [[25, -29], [27, -15], [23, -2], [17, 9], [14, 20], [12, 30], [12.5, 38], [12, 45], [17, 51], [22, 57], [26, 63]] },
  { id: "tiira", name: rg.t("Lapintiira", "Arctic tern", "Charrán ártico"), winter: "ATA", wname: rg.t("Etelämanner", "Antarctica", "Antártida"), wlon: -10, wlat: -71, start: 15, leave: 222,
    food: "🐟", foodAt: "sea", color: "#e63946", stars: 4,
    route: [[-10, -69], [0, -55], [8, -38], [5, -20], [-2, -5], [-16, 8], [-19, 20], [-13, 33], [-10, 44], [-3, 49], [4, 56], [12, 57.5], [19, 59], [21, 62], [24, 64]] },
];
const FIN = { id: "FIN", lon: 26, lat: 63 };
const MONTHS = rg.lang === "en" ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  : rg.lang === "es" ? ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
  : ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu", "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ZOOMS = [1, 1.6, 2.6];
const SPEED = 7;                // degrees a second, full of energy
const YEAR_RATE = 3;            // days a second while flying
const HOUR = 9;                 // the local time under the bird: the sun stands (12 - HOUR) × 15° east
// mountains [lon, lat, size]: size 2 and up have snow on top all year
const PEAKS = [
  [21.3, 69.3, 1], [20.8, 68.9, 0.9], [24.1, 68.1, 0.9], [27.4, 68.4, 0.8], [29.8, 63.1, 0.6],   // Lapland fells, Koli
  [7, 60, 1.3], [8, 61.6, 1.5], [6.6, 62.3, 1.3], [13, 63.4, 1.2], [16.5, 67.4, 1.3], [18.6, 68.4, 1.4],   // the Scandinavian mountains
  [-5, 57, 0.8], [-19, 64.6, 1.4], [0.5, 42.7, 1.6], [7.5, 46, 2.5], [10.5, 46.5, 2.2], [13, 47.1, 2],
  [13.5, 42.4, 1.1], [21, 42, 1.2], [22.5, 48.8, 1.1], [25, 45.5, 1.2], [43, 43.2, 2.3], [44.3, 39.7, 2.2],
  [-7.5, 31.2, 1.8], [-4.5, 33, 1.4], [5.5, 23.3, 1.4], [18.5, 21, 1.5], [34, 28.5, 1], [44, 15, 1.4],
  [38.5, 10.5, 1.6], [39.5, 12.5, 1.5], [9.2, 4.2, 1.6], [29.9, 0.4, 2.2], [37.3, -0.15, 2.2], [37.35, -3.07, 2.6],
  [29.3, -29.3, 1.5], [47, -19, 1.2], [59.5, 60, 1], [59, 64, 1], [72.5, 38.5, 2.5], [80, 42, 2.3],
  [80, 30.5, 2.8], [84, 28.6, 3], [86.9, 28, 3], [90, 28, 2.8], [138.7, 35.4, 2.2], [148.3, -36.5, 1.3], [170, -43.6, 2.2],
  [-151, 63, 2.6], [-120, 52, 1.8], [-114, 49, 2], [-106, 39.5, 2.2], [-78.5, -1, 2.5], [-77.5, -9, 2.6],
  [-68, -16, 2.8], [-70, -33, 3], [-72, -45, 2.2], [-85, -78, 2], [160, -77, 2],
];
const WAIT_RATE = 14;           // days a second while waiting for spring
const HINT_AFTER = 15;
const TILT = 23.44;
// land colours
const SNOW = "#f2f6fb", BARE = "#a39b6b", SPRING = "#b6e36a", SUMMER = "#5fb04a", AUTUMN = "#e5a03a", MILD = "#86b25e";
const DESERT = "#e6cf96";
const DESERTS = ["SAH", "MRT", "DZA", "LBY", "EGY", "MLI", "NER", "TCD", "SAU", "OMN", "YEM", "ARE", "QAT", "KWT", "JOR"];
const ICE = ["ATA", "GRL"];
// weather stations for the forecast signs: real monthly mean temperatures (°C,
// January first, rounded climate normals) and the months with much rain
const WX_FIN = { name: "Jyväskylä", lon: 25.7, lat: 62.2, t: [-8, -8, -4, 2, 9, 14, 17, 14, 9, 3, -2, -6], wet: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0] };
const WX: any = {
  joutsen: [{ name: rg.t("Tukholma", "Stockholm", "Estocolmo"), lon: 18.1, lat: 59.3, t: [-2, -2, 1, 6, 11, 16, 19, 18, 13, 8, 3, 0], wet: [0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0] },
    { name: rg.t("Kööpenhamina", "Copenhagen", "Copenhague"), lon: 12.6, lat: 55.7, t: [1, 1, 3, 7, 12, 15, 18, 17, 14, 10, 5, 2], wet: [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1] }],
  kurki: [{ name: "Budapest", lon: 19, lat: 47.5, t: [0, 2, 7, 12, 17, 20, 22, 22, 17, 12, 6, 1], wet: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0] },
    { name: "Addis Abeba", lon: 38.7, lat: 9, t: [16, 17, 19, 19, 19, 18, 17, 17, 17, 16, 16, 16], wet: [0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0] }],
  paasky: [{ name: "Sahara", lon: 19.1, lat: 17.9, t: [21, 23, 27, 31, 34, 34, 33, 33, 32, 29, 25, 21], wet: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "Johannesburg", lon: 28, lat: -26.2, t: [20, 20, 19, 16, 13, 10, 10, 12, 16, 18, 19, 20], wet: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1] }],
  tiira: [{ name: "São Tomé", lon: 6.7, lat: 0.3, t: [27, 27, 27, 27, 26, 25, 24, 24, 25, 25, 26, 26], wet: [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1] },
    { name: "Weddell", lon: -26.6, lat: -75.6, t: [-5, -9, -15, -19, -22, -25, -28, -27, -25, -18, -11, -5], wet: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
};

let screen: Screen = "menu";
let phase: Phase = "spring";
let sp: any = SPECIES[0];
let t = 0;
let day = 60;                   // day of the year, 0 = 1 January
let bird = { lon: 0, lat: 0, roll: 0, head: 0, vx: 0, vy: 0, flap: 0 };   // roll: the bearing up on the screen
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
// the nest: build it, lay the eggs, keep them warm, then hunt for the chicks
type NestStage = "build" | "lay" | "sit" | "feed";
let nest: any = {
  stage: "build", clock: 0, from: 0, to: 0, grown: false, flyClock: 0,
  loads: [0, 0], eggs: 0, warm: 0, hatchP: 0, holdIdle: 0, sayCold: 0,
  chicks: [], meals: 0, items: [], prey: [], nextId: 1,
  bx: 0, by: 0, head: 180, task: null, carry: null, fedClock: -1, fedChick: -1,
};

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
  for (let i = 0; i < 70; i++) flakes.push({ x: rg.random(), y: rg.random(), s: 4 + rg.random() * 4, v: 30 + rg.random() * 40 });
  rg.seed(Math.floor(Date.now() % 100000) + 1);
  rg.say("m_tervetuloa");
}

function start(i: number) {
  sp = SPECIES[i];
  rg.sound("click");
  rg.three("clear");
  day = sp.start;
  bird.lon = sp.wlon; bird.lat = sp.wlat; bird.roll = 0; bird.head = 0; bird.vx = 0; bird.vy = 0;
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
    border: false, shade: 0.22, night: 0.72, visible: true,
    cell: 10, peaks: PEAKS, peakSize: 1.4, peakSnow: SNOW,
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
let basis = { lon: 999, lat: 999, roll: 0, e: [0, 0, 0], n: [0, 0, 0], v: [0, 0, 0] };
function projectV(p: number[]) {
  if (basis.lon !== bird.lon || basis.lat !== bird.lat || basis.roll !== bird.roll) {
    const f = frame(bird.lon, bird.lat);
    const cr = Math.cos(rad(bird.roll)), sr = Math.sin(rad(bird.roll));
    const e = [cr * f.e[0] - sr * f.n[0], cr * f.e[1] - sr * f.n[1], cr * f.e[2] - sr * f.n[2]];
    const n = [cr * f.n[0] + sr * f.e[0], cr * f.n[1] + sr * f.e[1], cr * f.n[2] + sr * f.e[2]];
    basis = { lon: bird.lon, lat: bird.lat, roll: bird.roll, e, n, v: f.v };
  }
  const R = globeR();
  const z = basis.v[0] * p[0] + basis.v[1] * p[1] + basis.v[2] * p[2];
  const x = basis.e[0] * p[0] + basis.e[1] * p[1] + basis.e[2] * p[2];
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

// A press steers unless it lands on the task card or a button (EVG's hit test
// gives their id). Fixed screen rectangles were used before, and on a short
// screen (a landscape browser window) the sun window's one covered the whole
// right side, so the bird could not be turned to the right. The sun window
// steers too (on a short screen it is right beside the bird); a quick tap on
// it still explains the sun.
let orbitDown = -1;
function onPointerDown(x: number, y: number, info?: any) {
  if (screen !== "play") return;
  const id = info ? info.id : "";
  if (id === "orbit") orbitDown = t;
  else if (id) return;
  flying = true;
}
function onPointerUp(x: number, y: number, info?: any) {
  if (orbitDown >= 0 && info && info.id === "orbit" && t - orbitDown < 0.3) sayOrbit();
  orbitDown = -1;
  flying = false;
}

function onKeyDown(key: string) {
  if (screen === "nest" && key === "n") skipNestStep();
  if (screen !== "play") return;
  if (key === "+" || key === "=") zoom(1);
  if (key === "-") zoom(-1);
  if (key === "h") hint();
  if (key === "n") { const tg = target(); bird.lon = tg.lon; bird.lat = tg.lat; bird.roll = 0; }   // for testing: jump there
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
  if (screen === "nest") { tickNest(dt, input); return; }
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
  move(rad(degs * dt));
}

// Moves the bird along a great circle in the direction it flies on the
// screen, so it can fly over the poles too: the screen turns with it (roll)
// and slowly comes back to north up away from the poles.
function move(step: number) {
  const fr = frame(bird.lon, bird.lat);
  const cr = Math.cos(rad(bird.roll)), sr = Math.sin(rad(bird.roll));
  const U = [cr * fr.n[0] + sr * fr.e[0], cr * fr.n[1] + sr * fr.e[1], cr * fr.n[2] + sr * fr.e[2]];
  const R = [cr * fr.e[0] - sr * fr.n[0], cr * fr.e[1] - sr * fr.n[1], cr * fr.e[2] - sr * fr.n[2]];
  const d = [bird.vx * R[0] - bird.vy * U[0], bird.vx * R[1] - bird.vy * U[1], bird.vx * R[2] - bird.vy * U[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  const P = fr.v;
  let Q = P, V = U;
  if (L > 1e-6) {
    const a = step * L, ca = Math.cos(a), sa = Math.sin(a);
    Q = [P[0] * ca + d[0] / L * sa, P[1] * ca + d[1] / L * sa, P[2] * ca + d[2] / L * sa];
    const q = Math.hypot(Q[0], Q[1], Q[2]);
    Q = [Q[0] / q, Q[1] / q, Q[2] / q];
    const k = U[0] * Q[0] + U[1] * Q[1] + U[2] * Q[2];
    V = [U[0] - k * Q[0], U[1] - k * Q[1], U[2] - k * Q[2]];
  }
  bird.lat = Math.asin(rg.clamp(Q[2], -1, 1)) * 180 / Math.PI;
  if (Math.abs(Q[0]) + Math.abs(Q[1]) > 1e-9) bird.lon = Math.atan2(Q[1], Q[0]) * 180 / Math.PI;
  const f2 = frame(bird.lon, bird.lat);
  let roll = Math.atan2(V[0] * f2.e[0] + V[1] * f2.e[1] + V[2] * f2.e[2], V[0] * f2.n[0] + V[1] * f2.n[1] + V[2] * f2.n[2]) * 180 / Math.PI;
  // back towards north up, but not near a pole where north turns fast
  const w = rg.clamp((72 - Math.abs(bird.lat)) / 15, 0, 1);
  const dl = -roll * w * Math.min(1, step * 6);
  bird.roll = roll + dl;
  // the screen turned by dl: keep the bird flying the same way over the ground
  bird.head -= dl;
  const c = Math.cos(rad(dl)), s2 = Math.sin(rad(dl));
  const vx = bird.vx * c + bird.vy * s2, vy = -bird.vx * s2 + bird.vy * c;
  bird.vx = vx; bird.vy = vy;
}

function frame(lon: number, lat: number) {
  const slo = Math.sin(rad(lon)), clo = Math.cos(rad(lon));
  const sla = Math.sin(rad(lat)), cla = Math.cos(rad(lat));
  return { e: [-slo, clo, 0], n: [-sla * clo, -sla * slo, cla], v: [cla * clo, cla * slo, sla] };
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
    rg.say("m_lunta_suomessa", { queue: true });   // after the arrival clip, not over it
    return;
  }
  toNest();
}

function finish() {
  screen = "done";
  flying = false;
  const n = starsNow();
  if (n > best[sp.id]) { best[sp.id] = n; rg.save("best_" + sp.id, n); }
  rg.say("m_valmis", { queue: true });   // "Perillä! Kun Suomessa on talvi…" first
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
//
// Each species nests in its own kind of place, seen from the side:
//   swan:    a big mound of reeds and moss on a lake shore
//   crane:   hay and moss on a tussock in a bog
//   swallow: a cup of clay under the barn roof, lined with hay
//   tern:    a shallow scrape among pebbles and shells on a rocky islet
// Tap a material and the parent bird fetches it. When the nest is ready, tap
// it to lay the eggs, hold a finger down to keep them warm until they hatch,
// then tap the prey (each species its own) so the parent catches it and feeds
// the hungriest chick. Zones are fractions of the screen [x0, y0, x1, y1].

const BLOB_CLAY = "#8b5a2b", BLOB_MOSS = "#4f8a2b", BLOB_STONE = "#9aa0a6";
const NESTS: any = {
  joutsen: {
    at: [0.5, 0.64], w: 130, col: "#a68a4a", line: "#6f5a2a", lining: "#5f8f3a", kind: "mound",
    mats: [{ icon: "🌾", n: 5, z: [[0.03, 0.5, 0.2, 0.92]], name: rg.t("Kaislaa", "Reeds", "Juncos") },
      { blob: BLOB_MOSS, n: 3, z: [[0.25, 0.6, 0.8, 0.76]], name: rg.t("Sammalta", "Moss", "Musgo") }],
    eggs: 4, egg: "#f3ecd8", spots: "",
    prey: [{ e: "🌿", m: "bob", z: [[0.28, 0.82, 0.95, 0.96], [0.62, 0.46, 0.95, 0.56]] }, { e: "🐌", m: "crawl", z: [[0.25, 0.62, 0.8, 0.75]] }],
    preyNames: rg.t("vesikasveja ja etanoita", "water plants and snails", "plantas acuáticas y caracoles"),
  },
  kurki: {
    at: [0.5, 0.62], w: 110, col: "#c2a35a", line: "#8a6d2c", lining: "#5f8f3a", kind: "mound",
    mats: [{ icon: "🌾", n: 5, z: [[0.05, 0.46, 0.95, 0.95]], name: rg.t("Heiniä", "Hay", "Heno") },
      { blob: BLOB_MOSS, n: 3, z: [[0.05, 0.46, 0.95, 0.95]], name: rg.t("Sammalta", "Moss", "Musgo") }],
    eggs: 2, egg: "#b9a77c", spots: "#6b4f2a",
    prey: [{ e: "🐸", m: "hop", z: [[0.05, 0.5, 0.95, 0.95]] }, { e: "🦗", m: "hop", z: [[0.05, 0.46, 0.95, 0.95]] }, { e: "🐛", m: "crawl", z: [[0.05, 0.5, 0.95, 0.95]] }],
    preyNames: rg.t("sammakoita ja hyönteisiä", "frogs and insects", "ranas e insectos"),
  },
  paasky: {
    at: [0.3, 0.37], w: 66, col: BLOB_CLAY, line: "#5e3a17", lining: "#e9c46a", kind: "cup",
    mats: [{ blob: BLOB_CLAY, n: 5, z: [[0.67, 0.79, 0.92, 0.85]], name: rg.t("Savea", "Clay", "Barro") },
      { icon: "🌾", n: 3, z: [[0.05, 0.89, 0.5, 0.96]], name: rg.t("Heiniä", "Hay", "Heno") }],
    eggs: 4, egg: "#fffaf0", spots: "#b5523b",
    prey: [{ e: "🦟", m: "fly", z: [[0.42, 0.4, 0.94, 0.76]] }, { e: "🦋", m: "fly", z: [[0.55, 0.4, 0.94, 0.76]] }],
    preyNames: rg.t("hyönteisiä ilmasta", "insects in the air", "insectos en el aire"),
  },
  tiira: {
    at: [0.45, 0.63], w: 76, col: "#6e6a62", line: BLOB_STONE, lining: "#f1e4d0", kind: "scrape",
    mats: [{ blob: BLOB_STONE, n: 4, z: [[0.2, 0.6, 0.72, 0.76]], name: rg.t("Pikkukiviä", "Pebbles", "Piedritas") },
      { icon: "🐚", n: 3, z: [[0.2, 0.6, 0.72, 0.76]], name: rg.t("Simpukoita", "Shells", "Conchas") }],
    eggs: 2, egg: "#a8a77a", spots: "#3f3a2a",
    prey: [{ e: "🐟", m: "jump", z: [[0.04, 0.48, 0.96, 0.96]] }, { e: "🦐", m: "jump", z: [[0.04, 0.48, 0.96, 0.96]] }],
    preyNames: rg.t("kaloja merestä", "fish from the sea", "peces del mar"),
  },
};
const MEALS = 8;                 // meals for the whole brood (shared by the chicks)
const FLY_PX = 430;              // the parent's speed, px a second

function NC() { return NESTS[sp.id]; }
function nestX() { return width * NC().at[0]; }
function nestY() { return height * NC().at[1]; }
function perch() { return { x: nestX() + NC().w / 2 + 26, y: nestY() - 26 }; }
function sitPos() { return { x: nestX(), y: nestY() - 12 }; }
function totalLoads() { return NC().mats[0].n + NC().mats[1].n; }
function loadsDone() { return nest.loads[0] + nest.loads[1]; }
function curMat() { return nest.loads[0] < NC().mats[0].n ? 0 : 1; }
function perChick() { return MEALS / NC().eggs; }

function toNest() {
  screen = "nest";
  flying = false;
  const c = NC();
  nest.stage = "build"; nest.clock = 0; nest.grown = false; nest.flyClock = 0;
  nest.loads = [0, 0]; nest.eggs = 0; nest.warm = 0; nest.hatchP = 0; nest.holdIdle = 0; nest.sayCold = 0;
  nest.chicks = []; for (let i = 0; i < c.eggs; i++) nest.chicks.push(0);
  nest.meals = 0; nest.items = []; nest.prey = []; nest.task = null; nest.carry = null; nest.fedClock = -1; nest.fedChick = -1;
  const p = perch(); nest.bx = p.x; nest.by = p.y; nest.head = 180;
  nest.from = day;
  nest.to = Math.max(sp.leave, day + 40);
  rg.three("globe", { visible: false });
  rg.say("m_" + sp.id + "_pesa", { queue: true });   // after "Perillä Suomessa!" / "Kevät tuli"
}

function sayNestTask() {
  if (nest.grown) { rg.say("m_isoja"); return; }
  if (nest.stage === "build") rg.say(curMat() === 0 ? "m_" + sp.id + "_pesa" : "m_" + sp.id + "_pesa2");
  else if (nest.stage === "lay") rg.say("m_pesa_valmis");
  else if (nest.stage === "sit") rg.say("m_hautoo");
  else rg.say("m_" + sp.id + "_ruoka");
}

// a random point in one of the zones, away from the nest (and, for the water
// and sea zones, off the islet)
function spot(zones: number[][], water: boolean) {
  let x = 0, y = 0;
  for (let k = 0; k < 30; k++) {
    const z = zones[Math.floor(rg.random() * zones.length)];
    x = width * (z[0] + (z[2] - z[0]) * rg.random());
    y = height * (z[1] + (z[3] - z[1]) * rg.random());
    if (Math.hypot(x - nestX(), y - nestY()) < NC().w / 2 + 24) continue;
    if (water && onIslet(x, y)) continue;
    if (y < 120 && x > width - 150) continue;     // not under the sun window
    break;
  }
  return { x, y };
}

function onIslet(x: number, y: number) {
  if (sp.id !== "joutsen" && sp.id !== "tiira") return false;
  const g = islet();
  const dx = (x - g.x) / (g.rx + 16), dy = (y - g.y) / (g.ry + 16);
  return dx * dx + dy * dy < 1;
}

function islet() {
  if (sp.id === "tiira") return { x: width * 0.45, y: height * 0.68, rx: width * 0.34, ry: height * 0.11 };
  return { x: width * 0.52, y: height * 0.69, rx: width * 0.36, ry: height * 0.1 };
}

function tickNest(dt: number, input: any) {
  heldNow = !!input.pointer.down;
  nest.clock += dt;
  bird.flap += dt * 5;
  const c = NC();
  if (nest.stage === "build") {
    const m = curMat();
    while (nest.items.length < 4) {
      const p = spot(c.mats[m].z, false);
      nest.items.push({ id: nest.nextId++, m, x: p.x, y: p.y, ph: rg.random() * 6 });
    }
  } else if (nest.stage === "lay") {
    if (nest.eggs >= c.eggs && nest.clock > 0.9) { nest.stage = "sit"; nest.clock = 0; rg.say("m_hautoo"); }
  } else if (nest.stage === "sit") {
    tickSit(dt, input);
  } else if (nest.stage === "feed") {
    tickPrey(dt);
  }
  moveParent(dt);
  if (nest.fedClock >= 0) { nest.fedClock += dt; if (nest.fedClock > 0.6) nest.fedClock = -1; }
  // the summer goes by as the nest gets built, the eggs hatch and the chicks grow
  let prog = 0;
  if (nest.stage === "build") prog = 0.15 * loadsDone() / totalLoads();
  else if (nest.stage === "lay") prog = 0.15;
  else if (nest.stage === "sit") prog = 0.15 + 0.35 * nest.hatchP;
  else prog = 0.5 + 0.5 * Math.min(1, nest.meals / MEALS);
  const goal = nest.from + (nest.to - nest.from) * prog;
  if (day < goal) day = Math.min(goal, day + dt * 20);
  if (nest.stage === "feed" && nest.meals >= MEALS && !nest.grown && nest.fedClock < 0 && day >= nest.to - 0.5) {
    nest.grown = true;
    nest.flyClock = 0;
    nest.prey = [];
    rg.celebrate(width / 2, height * 0.45, { big: true });
    rg.say("m_isoja");
  }
  if (nest.grown) nest.flyClock += dt;
}

// hold a finger down: the parent sits on the eggs and they stay warm
function tickSit(dt: number, input: any) {
  const holding = heldNow;
  const s = sitPos();
  const onEggs = holding && Math.hypot(nest.bx - s.x, nest.by - s.y) < 8;
  if (onEggs) { nest.warm = Math.min(1, nest.warm + dt * 0.9); nest.holdIdle = 0; }
  else { nest.warm = Math.max(0, nest.warm - dt * 0.12); nest.holdIdle += dt; }
  nest.hatchP = Math.min(1, nest.hatchP + dt * nest.warm / 8);
  if (nest.holdIdle > 6 && t > nest.sayCold) { nest.sayCold = t + 12; rg.say("m_kylma_munat"); }
  if (nest.hatchP >= 1) {
    nest.stage = "feed";
    nest.clock = 0;
    rg.sound("pop");
    rg.celebrate(nestX(), nestY() - 10, {});
    rg.say(["m_munat", "m_" + sp.id + "_ruoka"]);
  }
}

function tickPrey(dt: number) {
  const c = NC();
  if (nest.grown) return;
  const want = sp.id === "paasky" ? 4 : 3;
  while (nest.prey.length < want) {
    const kind = c.prey[Math.floor(rg.random() * c.prey.length)];
    const water = kind.m === "bob" || kind.m === "jump";
    const p = spot(kind.z, water);
    const ang = rg.random() * Math.PI * 2;
    nest.prey.push({ id: nest.nextId++, e: kind.e, m: kind.m, z: kind.z, x: p.x, y: p.y, x0: p.x, y0: p.y, x1: p.x, y1: p.y,
      a: ang, t: 0, wait: kind.m === "jump" ? 0.4 + rg.random() * 2.2 : 0.6 + rg.random() * 2, hop: -1, ph: rg.random() * 6, gone: false });
  }
  for (let i = nest.prey.length - 1; i >= 0; i--) {
    const p = nest.prey[i];
    p.t += dt;
    const z = p.z[0];
    const zx0 = width * z[0], zx1 = width * z[2], zy0 = height * z[1], zy1 = height * z[3];
    if (p.m === "fly") {
      p.a += (Math.sin(t * 1.3 + p.ph) * 2.2) * dt;
      const v = p.e === "🦋" ? 45 : 70;
      p.x += Math.cos(p.a) * v * dt; p.y += Math.sin(p.a) * v * dt;
      if (p.x < zx0 || p.x > zx1) { p.a = Math.PI - p.a; p.x = rg.clamp(p.x, zx0, zx1); }
      if (p.y < zy0 || p.y > zy1) { p.a = -p.a; p.y = rg.clamp(p.y, zy0, zy1); }
    } else if (p.m === "crawl") {
      p.x += Math.cos(p.a) * 10 * dt;
      if (p.x < zx0 || p.x > zx1) { p.a = Math.PI - p.a; p.x = rg.clamp(p.x, zx0, zx1); }
    } else if (p.m === "hop") {
      if (p.hop < 0) {
        p.wait -= dt;
        if (p.wait <= 0) {
          p.hop = 0; p.x0 = p.x; p.y0 = p.y;
          const q = { x: rg.clamp(p.x + (rg.random() - 0.5) * 120, zx0, zx1), y: rg.clamp(p.y + (rg.random() - 0.5) * 50, zy0, zy1) };
          p.x1 = q.x; p.y1 = q.y;
        }
      } else {
        p.hop += dt / 0.5;
        const k = Math.min(1, p.hop);
        p.x = p.x0 + (p.x1 - p.x0) * k;
        p.y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * 30;
        if (k >= 1) { p.hop = -1; p.wait = 1 + rg.random() * 2; }
      }
    } else if (p.m === "jump") {
      // under water until it jumps out in an arc, then it is gone
      if (p.hop < 0) {
        p.wait -= dt;
        if (p.wait <= 0) { p.hop = 0; p.x0 = p.x; p.x1 = rg.clamp(p.x + (rg.random() < 0.5 ? -1 : 1) * 70, zx0, zx1); }
      } else {
        p.hop += dt / 2.6;
        const k = Math.min(1, p.hop);
        p.x = p.x0 + (p.x1 - p.x0) * k;
        p.y = p.y0 - Math.sin(k * Math.PI) * 46;
        if (k >= 1) p.gone = true;
      }
    }
    if (p.gone) nest.prey.splice(i, 1);
  }
}

function preyShown(p: any) { return p.m !== "jump" || p.hop >= 0; }

function moveParent(dt: number) {
  let tx = 0, ty = 0;
  const task = nest.task;
  if (task && task.kind === "mat") { tx = task.item.x; ty = task.item.y; }
  else if (task && task.kind === "prey") {
    const p = nest.prey.find((q: any) => q.id === task.id);
    if (!p || !preyShown(p)) { nest.task = null; rg.sound("click"); }   // it got away
    else { tx = p.x; ty = p.y; }
  }
  if (!nest.task) {
    const home = nest.carry || nest.stage === "lay" || (nest.stage === "sit" && heldNow) ? sitPos() : perch();
    tx = home.x; ty = home.y;
  }
  const dx = tx - nest.bx, dy = ty - nest.by;
  const d = Math.hypot(dx, dy);
  const step = FLY_PX * (nest.carry ? 0.85 : 1) * dt;
  if (d > 2) {
    const want = Math.atan2(dx, -dy) * 180 / Math.PI;
    let dh = want - nest.head;
    while (dh > 180) dh -= 360;
    while (dh < -180) dh += 360;
    if (d > 10) nest.head += dh * Math.min(1, dt * 10);
  }
  if (d <= step) { nest.bx = tx; nest.by = ty; arrive(); }
  else { nest.bx += dx / d * step; nest.by += dy / d * step; }
}

let heldNow = false;

function arrive() {
  const task = nest.task;
  if (task && task.kind === "mat") {
    nest.items = nest.items.filter((it: any) => it.id !== task.item.id);
    nest.carry = { icon: NC().mats[task.item.m].icon, blob: NC().mats[task.item.m].blob, m: task.item.m };
    nest.task = null;
    rg.sound("click");
    return;
  }
  if (task && task.kind === "prey") {
    const p = nest.prey.find((q: any) => q.id === task.id);
    nest.prey = nest.prey.filter((q: any) => q.id !== task.id);
    nest.carry = { icon: p ? p.e : "🐛", prey: true };
    nest.task = null;
    rg.sound("click");
    return;
  }
  if (!nest.carry) return;
  // home with something in the beak
  const c = NC();
  if (!nest.carry.prey) {
    const m = nest.carry.m;
    nest.carry = null;
    if (nest.loads[m] < c.mats[m].n) nest.loads[m]++;
    rg.sound("pop");
    if (m === 0 && nest.loads[0] === c.mats[0].n) { nest.items = []; rg.say("m_" + sp.id + "_pesa2"); }
    if (loadsDone() >= totalLoads()) {
      nest.stage = "lay"; nest.clock = 0; nest.items = [];
      rg.celebrate(nestX(), nestY(), {});
      rg.say("m_pesa_valmis");
    }
    return;
  }
  nest.carry = null;
  // the hungriest chick gets it
  let best = 0;
  for (let i = 1; i < nest.chicks.length; i++) if (nest.chicks[i] < nest.chicks[best]) best = i;
  nest.chicks[best]++;
  nest.meals++;
  nest.fedChick = best; nest.fedClock = 0;
  rg.sound("pop");
}

function tapItem(id: number) {
  if (nest.task || nest.carry || nest.stage !== "build") return;
  const it = nest.items.find((q: any) => q.id === id);
  if (!it || it.m !== curMat()) return;
  nest.task = { kind: "mat", item: it };
}

function tapPrey(id: number) {
  if (nest.task || nest.carry || nest.stage !== "feed" || nest.grown || nest.meals >= MEALS) return;
  const p = nest.prey.find((q: any) => q.id === id);
  if (!p || !preyShown(p)) return;
  nest.task = { kind: "prey", id };
}

function layEgg() {
  if (nest.stage !== "lay" || nest.eggs >= NC().eggs) return;
  const s = sitPos();
  if (Math.hypot(nest.bx - s.x, nest.by - s.y) > 6) return;
  nest.eggs++;
  nest.clock = 0;
  rg.sound("pop");
}

// for testing: the next step at once
function skipNestStep() {
  const c = NC();
  nest.task = null; nest.carry = null;
  if (nest.stage === "build") { nest.loads = [c.mats[0].n, c.mats[1].n]; nest.items = []; nest.stage = "lay"; nest.clock = 0; }
  else if (nest.stage === "lay") { nest.eggs = c.eggs; }
  else if (nest.stage === "sit") { nest.hatchP = 1; nest.warm = 1; }
  else { for (let i = 0; i < nest.chicks.length; i++) nest.chicks[i] = Math.ceil(perChick()); nest.meals = MEALS; }
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
  const args: any = { lon: bird.lon, lat: bird.lat, roll: bird.roll, r: globeR(), x: width / 2, y: birdY(), sun: [bird.lon + (12 - HOUR) * 15, declination(dayOfYear())] };
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
  const ang = bearing(bird.lon, bird.lat, aim[0], aim[1]) - bird.roll;
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

// snow falls wherever the ground under it is snowy (not only where the bird is)
function Snow() {
  if (screen !== "play") return null;
  const d = dayOfYear();
  const R = globeR();
  projectV([1, 0, 0]);          // makes sure the screen basis is current
  const out: any[] = [];
  for (const f of flakes) {
    const y = ((f.y * height + t * f.v) % (height + 20)) - 10;
    const x = f.x * width + Math.sin(t * 1.5 + f.y * 9) * 12;
    const gx = (x - width / 2) / R, gy = (birdY() - y) / R;
    const r2 = gx * gx + gy * gy;
    if (r2 >= 0.98) continue;
    const gz = Math.sqrt(1 - r2);
    const pz = gx * basis.e[2] + gy * basis.n[2] + gz * basis.v[2];
    const lat = Math.asin(rg.clamp(pz, -1, 1)) * 180 / Math.PI;
    if (temp(lat, d) >= 0) continue;
    out.push(<div className="flake" style={{ left: x, top: y, width: f.s, height: f.s, borderRadius: f.s / 2 }} />);
  }
  return out;
}

function wxSymbol(st: any, m: number) {
  const T = st.t[m];
  if (T <= 0) return "🌨️";
  if (st.wet[m]) return "🌧️";
  if (T >= 15) return "☀️";
  return "⛅";
}

// floating forecast signs: in Finland, halfway and at the wintering place
function Weather() {
  const m = monthOf(dayOfYear());
  const out: any[] = [];
  const list = [WX_FIN].concat(WX[sp.id] || []);
  let k = 0;
  for (const st of list) {
    k++;
    const q = project(st.lon, st.lat);
    if (q.z < 0.15 || q.x < -40 || q.x > width + 40 || q.y < 60 || q.y > height + 40) continue;
    const bob = Math.sin(t * 2 + k * 1.7) * 3;
    const T = st.t[m];
    const txt = (T < 0 ? "−" + (-T) : (T > 0 ? "+" + T : "0")) + "°";
    out.push(<div className="wxstem" style={{ left: q.x - 1, top: q.y - 22 + bob }} />);
    out.push(<div className="wxdot" style={{ left: q.x - 3, top: q.y - 3 }} />);
    out.push(
      <div className="wx" style={{ left: q.x - 37, top: q.y - 78 + bob }}>
        <div className="wxrow"><div className="wxsym">{wxSymbol(st, m)}</div><div className={T < 0 ? "wxt cold" : "wxt"}>{txt}</div></div>
        <div className="wxname">{st.name}</div>
      </div>
    );
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
    <div className="orbit" id="orbit" style={{ left: ox, top: oy, width: W, height: H }}>
      {box(orbit, "none", "rgba(255,255,255,0.35)", 1)}
      {behind ? earth : sun}
      {behind ? sun : earth}
      <div className="month" style={{ width: W }}>{seasonIcon(s, bird.lat, d) + " " + MONTHS[monthOf(d)] + "  🕘"}</div>
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

// a path in screen coordinates over the whole screen
function SP(d: string, fill: string, stroke?: string, sw?: number) {
  return <path d={d} fill={fill} stroke={stroke || "none"} strokeWidth={String(sw || 0)} viewBox={"0 0 " + width + " " + height}
    style={{ position: "absolute", left: 0, top: 0, width: width, height: height }} />;
}
function rect(x0: number, y0: number, x1: number, y1: number) { return poly([x0, y0, x1, y0, x1, y1, x0, y1]); }

// the place of the nest, seen from the side
function Scene() {
  const W = width, H = height;
  const out: any[] = [];
  const d = dayOfYear();
  const grass = seasonColor(seasonAt(FIN.lat, d));
  if (sp.id === "paasky") {
    // inside the barn: plank wall, the roof beam, the open door
    out.push(SP(rect(0, 0, W, H), "#9c6b3f"));
    let planks = "";
    for (let x = 24; x < W; x += 30) planks += "M " + x + " 0 L " + x + " " + H + " ";
    out.push(SP(planks, "none", "#7d5230", 2));
    const dx0 = W * 0.62, dy0 = H * 0.36, dx1 = W * 0.96, dy1 = H * 0.88;
    out.push(SP(rect(dx0, dy0, dx1, dy1), "#9ad0f5", "#5c3a1e", 5));
    out.push(SP(rect(dx0, H * 0.76, dx1, dy1), grass));
    out.push(SP(ell(W * 0.795, H * 0.82, W * 0.14, H * 0.035, 18), "#6b4423"));     // the puddle
    out.push(SP(rect(0, H * 0.88, W, H), "#6b4a2b"));
    out.push(SP(ell(W * 0.26, H * 0.95, W * 0.24, H * 0.05, 18), "#e9c46a", "#c9a227", 2));   // the hay pile
    out.push(SP(rect(0, H * 0.255, W, H * 0.305), "#5c3a1e"));                       // the beam
    out.push(SP(rect(0, 0, W, H * 0.12), "#4a2e17"));
  } else if (sp.id === "kurki") {
    out.push(SP(rect(0, 0, W, H * 0.42), "#9ad0f5"));
    let pines = "M 0 " + (H * 0.42) + " ";
    for (let x = 0; x <= W; x += 18) pines += "L " + x + " " + (H * (0.36 + ((x * 7) % 5) * 0.008)) + " L " + (x + 9) + " " + (H * 0.41) + " ";
    out.push(SP(pines + "L " + W + " " + (H * 0.42) + " Z", "#2d5a3a"));
    out.push(SP(rect(0, H * 0.42, W, H), "#a4a35c"));
    const pools = [[0.18, 0.56, 0.12, 0.03], [0.8, 0.52, 0.14, 0.025], [0.25, 0.86, 0.16, 0.035], [0.78, 0.8, 0.12, 0.03]];
    for (const p of pools) out.push(SP(ell(W * p[0], H * p[1], W * p[2], H * p[3], 18), "#3b6e8f"));
    const tus = [[0.08, 0.7], [0.4, 0.5], [0.66, 0.68], [0.9, 0.62], [0.55, 0.9], [0.12, 0.95]];
    for (const p of tus) out.push(SP(ell(W * p[0], H * p[1], 16, 7, 12), "#6f8f3a"));
    out.push(SP(ell(nestX(), nestY() + 12, NC().w * 0.75, 22, 20), "#6f8f3a"));      // the tussock
  } else if (sp.id === "joutsen") {
    out.push(SP(rect(0, 0, W, H * 0.42), "#9ad0f5"));
    out.push(SP(rect(0, H * 0.35, W, H * 0.43), "#2d6a4f"));
    out.push(SP(rect(0, H * 0.43, W, H), "#3a86c8"));
    let waves = "";
    for (let k = 0; k < 9; k++) { const y = H * (0.48 + k * 0.055), x = ((k * 83) % (W - 60)) + 10; waves += "M " + x + " " + y + " L " + (x + 34) + " " + y + " "; }
    out.push(SP(waves, "none", "rgba(255,255,255,0.35)", 2));
    const g = islet();
    out.push(SP(ell(g.x, g.y, g.rx, g.ry, 24), "#8a9a5b", "#6b7a43", 2));
    let reeds = "";
    for (let k = 0; k < 16; k++) { const x = W * 0.02 + k * W * 0.012, y = H * (0.92 - (k % 3) * 0.02); reeds += "M " + x.toFixed(1) + " " + y.toFixed(1) + " L " + (x + 3).toFixed(1) + " " + (H * (0.5 + (k % 4) * 0.02)).toFixed(1) + " "; }
    out.push(SP(reeds, "none", "#6a8f3a", 3));
  } else {
    out.push(SP(rect(0, 0, W, H * 0.44), "#9ad0f5"));
    out.push(SP(rect(0, H * 0.44, W, H), "#2f7fc8"));
    let waves = "";
    for (let k = 0; k < 9; k++) { const y = H * (0.5 + k * 0.052), x = ((k * 97) % (W - 60)) + 10; waves += "M " + x + " " + y + " L " + (x + 34) + " " + y + " "; }
    out.push(SP(waves, "none", "rgba(255,255,255,0.35)", 2));
    const g = islet();
    out.push(SP(ell(g.x, g.y, g.rx, g.ry, 24), "#8d8f92", "#5f6266", 3));
    out.push(SP(ell(g.x - g.rx * 0.3, g.y - g.ry * 0.3, g.rx * 0.35, g.ry * 0.35, 14), "#a3a5a8"));
  }
  return out;
}

function NestArt() {
  const c = NC();
  const out: any[] = [];
  const nx = nestX(), ny = nestY();
  const p0 = nest.loads[0] / c.mats[0].n, p1 = nest.loads[1] / c.mats[1].n;
  const R = c.w / 2;
  if (c.kind === "cup") {
    // clay pellets build the cup from the wall down; hay lines the rim
    if (nest.loads[0] > 0) {
      const depth = 8 + 26 * p0;
      const pts: number[] = [];
      for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; pts.push(nx + Math.cos(a) * R, ny + Math.sin(a) * depth); }
      out.push(SP(poly(pts), c.col, c.line, 2));
      let dots = "";
      for (let k = 0; k < nest.loads[0] * 4; k++) {
        const a = Math.PI * (0.1 + 0.8 * ((k * 37) % 20) / 20), r = 0.4 + 0.5 * ((k * 13) % 7) / 7;
        const x = nx + Math.cos(a) * R * r, y = ny + Math.sin(a) * depth * r;
        dots += ell(x, y, 3, 2.4, 6) + " ";
      }
      out.push(SP(dots, "#6e4320"));
    }
    if (nest.loads[1] > 0) {
      let hay = "";
      for (let k = 0; k < nest.loads[1] * 4; k++) { const x = nx - R + 6 + ((k * 23) % Math.floor(R * 2 - 12)); hay += "M " + x + " " + (ny + 2) + " L " + (x + 9) + " " + (ny - 4) + " "; }
      out.push(SP(hay, "none", c.lining, 2.5));
    }
    return out;
  }
  if (c.kind === "scrape") {
    // a shallow hollow ringed with pebbles and shells
    out.push(SP(ell(nx, ny, R * 0.7, 9, 18), "#5b5853"));
    let peb = "";
    const n0 = nest.loads[0] * 4;
    for (let k = 0; k < n0; k++) { const a = Math.PI * 2 * k / 16; peb += ell(nx + Math.cos(a) * R * 0.85, ny + Math.sin(a) * 13, 6, 4, 8) + " "; }
    if (peb) out.push(SP(peb, BLOB_STONE, "#6c7075", 1));
    let sh = "";
    for (let k = 0; k < nest.loads[1] * 2; k++) { const a = Math.PI * 2 * (k + 0.5) / 6; sh += ell(nx + Math.cos(a) * R * 0.6, ny + Math.sin(a) * 8, 4, 3, 8) + " "; }
    if (sh) out.push(SP(sh, c.lining, "#c9b79c", 1));
    return out;
  }
  // a mound of reeds or hay, moss on top
  if (nest.loads[0] > 0) {
    const rx = R * (0.55 + 0.45 * p0), ry = 8 + 16 * p0;
    out.push(SP(ell(nx, ny + ry * 0.4, rx, ry, 22), c.col, c.line, 2));
    let straw = "";
    for (let k = 0; k < nest.loads[0] * 3; k++) {
      const y = ny + ry * 0.4 + ry * (-0.6 + 1.2 * ((k * 7) % 9) / 9), w = rx * (0.5 + 0.4 * ((k * 5) % 4) / 4);
      straw += "M " + (nx - w) + " " + y.toFixed(1) + " L " + (nx + w) + " " + (y + ((k % 2) ? 3 : -3)).toFixed(1) + " ";
    }
    out.push(SP(straw, "none", c.line, 1.5));
  }
  if (nest.loads[1] > 0) out.push(SP(ell(nx, ny, R * 0.62 * (0.5 + 0.5 * p1), 6 + 3 * p1, 18), c.lining, "#3f6b25", 1));
  return out;
}

function Eggs() {
  const c = NC();
  const out: any[] = [];
  const n = nest.eggs;
  const shake = nest.stage === "sit" && nest.hatchP > 0.85;
  for (let i = 0; i < n; i++) {
    const x = nestX() + (i - (n - 1) / 2) * 15 + (shake ? Math.sin(t * 30 + i) * 1.5 : 0), y = nestY() - 9;
    out.push(<div className="negg" style={{ left: x - 6, top: y - 8, width: 12, height: 16, borderRadius: 6, borderWidth: 1, backgroundColor: c.egg }}>
      {c.spots ? <div className="espot" style={{ left: 2, top: 4, backgroundColor: c.spots }} /> : null}
      {c.spots ? <div className="espot" style={{ left: 6, top: 9, backgroundColor: c.spots }} /> : null}
    </div>);
  }
  return out;
}

function Chicks() {
  const out: any[] = [];
  const n = nest.chicks.length;
  const chickColor = sp.id === "joutsen" ? "#ced4da" : sp.id === "kurki" ? "#c08552" : sp.id === "paasky" ? "#495057" : "#adb5bd";
  const full = perChick();
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, nest.chicks[i] / full);
    const x = nestX() + (i - (n - 1) / 2) * (n > 2 ? 17 : 24), y = nestY() - 6;
    if (nest.grown && nest.flyClock > 0.6) {
      // the grown chick flies away as a small bird
      const S = 46, f = nest.flyClock - 0.6;
      out.push(<div className="bird" style={{ left: x - S / 2 + (i - (n - 1) / 2) * f * 60, top: y - S / 2 - f * 140, width: S, height: S }}>{birdArt(sp.id, S, 0.5 + 0.5 * Math.sin(t * 14 + i))}</div>);
      continue;
    }
    const r = 8 + g * 6;
    const hungry = g < 1;
    const fed = nest.fedChick === i && nest.fedClock >= 0;
    const bob = fed ? 6 : hungry ? Math.abs(Math.sin(t * 6 + i * 2)) * 3 : 0;
    out.push(
      <div className="chick" style={{ left: x - r, top: y - r * 1.4 - bob, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: chickColor }}>
        <div className="eye" style={{ left: r - 6, top: r * 0.45, width: 4, height: 4 }} />
        <div className="eye" style={{ left: r + 2, top: r * 0.45, width: 4, height: 4 }} />
        {hungry ? <div className="beak" style={{ left: r - 6, top: r * 0.9, width: 12, height: 8 }} /> : null}
      </div>
    );
  }
  return out;
}

function Item(it: any) {
  const mat = NC().mats[it.m];
  const bob = Math.sin(t * 3 + it.ph) * 2;
  if (mat.icon) return <div className="mat" id={"it" + it.id} onClick={() => tapItem(it.id)} style={{ left: it.x - 20, top: it.y - 20 + bob }}>{mat.icon}</div>;
  return (
    <div className="mat" id={"it" + it.id} onClick={() => tapItem(it.id)} style={{ left: it.x - 20, top: it.y - 20 + bob }}>
      <div className="blob" style={{ backgroundColor: mat.blob }}><div className="blobhi" /></div>
    </div>
  );
}

function Prey(p: any) {
  if (!preyShown(p)) return null;
  const flip = (p.m === "fly" && Math.cos(p.a) < 0) || (p.m === "crawl" && Math.cos(p.a) < 0) ? "scaleX(-1)" : "";
  const bob = p.m === "bob" ? Math.sin(t * 2 + p.ph) * 3 : 0;
  return <div className="prey" id={"pr" + p.id} onClick={() => tapPrey(p.id)} style={{ left: p.x - 22, top: p.y - 22 + bob, transform: flip }}>{p.e}</div>;
}

function Parent() {
  const S = 76;
  const sitting = nest.stage === "sit" && Math.hypot(nest.bx - sitPos().x, nest.by - sitPos().y) < 3;
  const still = !nest.task && !nest.carry && Math.hypot(nest.bx - perch().x, nest.by - perch().y) < 3;
  const out: any[] = [];
  const flap = sitting || still ? 0.12 : 0.5 + 0.5 * Math.sin(t * 16);
  out.push(<div className="bird" style={{ left: nest.bx - S / 2, top: nest.by - S / 2, width: S, height: S, transform: "rotate(" + Math.round(still || sitting ? 180 : nest.head) + "deg)" }}>{birdArt(sp.id, S, flap)}</div>);
  if (nest.carry) {
    const a = rad(nest.head);
    const x = nest.bx + Math.sin(a) * 30, y = nest.by - Math.cos(a) * 30;
    if (nest.carry.icon) out.push(<div className="carry" style={{ left: x - 13, top: y - 13 }}>{nest.carry.icon}</div>);
    else out.push(<div className="carry" style={{ left: x - 13, top: y - 13 }}><div className="blob small" style={{ backgroundColor: nest.carry.blob }} /></div>);
  }
  return out;
}

function NestBars() {
  if (nest.stage !== "sit") return null;
  const y = Math.min(height - 70, nestY() + 46);
  return (
    <div className="nbar" style={{ left: width / 2 - 112, top: y }}>
      <div className="nicon">🌡️</div>
      <div className="ebar"><div className="efill" style={{ width: Math.round(70 * nest.warm), backgroundColor: nest.warm > 0.4 ? "#f77f00" : "#4cc9f0" }} /></div>
      <div className="nicon" style={{ marginLeft: 8 }}>🐣</div>
      <div className="ebar"><div className="efill" style={{ width: Math.round(70 * nest.hatchP), backgroundColor: "#ffd166" }} /></div>
    </div>
  );
}

function nestCardText() {
  const c = NC();
  if (nest.grown) return { icon: "🍂", find: rg.t("Poikaset kasvoivat", "The chicks grew up", "Los polluelos crecieron"), name: rg.t("Lennä etelään!", "Fly south!", "¡Vuela al sur!") };
  if (nest.stage === "build") {
    const m = curMat();
    return { icon: c.mats[m].icon || "", blob: c.mats[m].blob, find: rg.t("Hae pesään", "Bring to the nest", "Lleva al nido"), name: c.mats[m].name + "  " + nest.loads[m] + "/" + c.mats[m].n };
  }
  if (nest.stage === "lay") return { icon: "🥚", find: rg.t("Pesä on valmis", "The nest is ready", "El nido está listo"), name: rg.t("Napauta pesää", "Tap the nest", "Toca el nido") };
  if (nest.stage === "sit") return { icon: "🥚", find: rg.t("Pidä munat lämpiminä", "Keep the eggs warm", "Calienta los huevos"), name: rg.t("Paina ja pidä", "Press and hold", "Mantén pulsado") };
  return { icon: c.prey[0].e, find: rg.t("Ruoki poikaset", "Feed the chicks", "Alimenta a los polluelos") + "  " + Math.min(nest.meals, MEALS) + "/" + MEALS, name: c.preyNames };
}

function Nest() {
  const c = NC();
  const out: any[] = Scene();
  out.push(Orbit());
  out.push(NestArt());
  if (nest.stage === "lay" || nest.stage === "sit") out.push(Eggs());
  if (nest.stage === "feed") out.push(Chicks());
  if (nest.stage === "lay") out.push(<div className="nestspot" id="nestspot" onClick={layEgg} style={{ left: nestX() - c.w / 2 - 10, top: nestY() - 50, width: c.w + 20, height: 80 }} />);
  for (const it of nest.items) out.push(Item(it));
  for (const p of nest.prey) out.push(Prey(p));
  out.push(Parent());
  out.push(NestBars());
  const ct = nestCardText();
  const pic = ct.icon ? <div className="picicon">{ct.icon}</div> : <div className="blob" style={{ backgroundColor: ct.blob }}><div className="blobhi" /></div>;
  return (
    <div className="screen" style={{ backgroundColor: "#9ad0f5" }}>
      {out}
      <div className="card" id="card" onClick={sayNestTask} style={{ width: width - 72 }}>
        <div className="pic">{pic}</div>
        <div className="cardtext">
          <div className="find">{ct.find + " 🔊"}</div>
          <div className={ct.name.length > 18 ? "tname small" : "tname"}>{ct.name}</div>
        </div>
      </div>
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
      {screen === "play" ? Weather() : null}
      {Snow()}
      {screen === "play" ? Hud() : null}
      {screen === "play" ? Card() : null}
      {screen === "play" ? Orbit() : null}
      {screen === "done" ? Done() : null}
    </div>
  );
}
