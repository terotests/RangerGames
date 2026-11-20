// Solar Pilot: the bodies' surfaces for the engine's planet globes
// (rg.three("planet", …)). Colours follow real photographs: a dark ocean and
// clouds on the Earth, grey highlands and darker maria on the Moon, Mars's
// butterscotch with dark albedo features, Jupiter's cream zones and brown belts.
// Country outlines: Natural Earth (public domain), lib/world.ts. The Moon's
// maria, Mars's albedo features and Jupiter's bands are approximate outlines.

import { REGIONS } from "lib/world";

let seed = 1;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

// a lumpy round patch round (lon, lat), `r` degrees across; sx stretches it east-west
function blob(lon: number, lat: number, r: number, lump: number, n = 20, sx = 1) {
  const ring: number[] = [];
  const k = sx / Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const ph = rnd() * 6.28, ph2 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const rr = r * (1 + lump * (0.6 * Math.sin(a * 3 + ph) + 0.4 * Math.sin(a * 5 + ph2)));
    ring.push(lon + Math.cos(a) * rr * k, Math.max(-89, Math.min(89, lat + Math.sin(a) * rr)));
  }
  return ring;
}

// a band round the whole ball between two latitudes, its edges wavy
function band(lat0: number, lat1: number, wave: number, k: number) {
  const ring: number[] = [];
  const ph = rnd() * 6.28;
  for (let lon = -180; lon <= 180; lon += 10) ring.push(lon, lat0 + wave * Math.sin(lon * k * Math.PI / 180 + ph));
  for (let lon = 180; lon >= -180; lon -= 10) ring.push(lon, lat1 + wave * Math.sin(lon * k * Math.PI / 180 + ph * 1.7));
  return ring;
}

// the cap round a pole, down to `lat`
function polar(lat: number, lump: number) {
  const ring: number[] = [];
  for (let lon = -180; lon < 180; lon += 10) ring.push(lon, lat + (lat > 0 ? -1 : 1) * lump * Math.abs(Math.sin(lon * 0.07 + 1)));
  return ring;
}

function craters(regions: any[], n: number, maxR: number, rays: number) {
  for (let i = 0; i < n; i++) {
    const lon = rnd() * 360 - 180, lat = Math.asin(rnd() * 2 - 1) * 180 / Math.PI;
    const r = 0.5 + Math.pow(rnd(), 3) * maxR;
    regions.push(["c" + i, "rim", blob(lon, lat, r, 0.06, 12)]);
    regions.push(["f" + i, i < rays ? "bright" : "floor", blob(lon + r * 0.08, lat - r * 0.08, r * 0.7, 0.05, 10)]);
  }
}

// the Earth's regions are given in tenths of a degree (scale: 10, like lib/world.ts)
function x10(ring: number[]) { return ring.map((v: number) => v * 10); }

function earthRegions() {
  seed = 5;
  const regions: any[] = [];
  regions.push(["arcticice", "seaice", x10(polar(78, 5))]);
  regions.push(["antice", "seaice", x10(polar(-64, 3))]);
  for (const r of REGIONS) regions.push(r);
  // clouds: the tropical belt, the mid-latitude storm tracks, a few spirals
  for (let i = 0; i < 16; i++) regions.push(["cloud", "cloud", x10(blob(rnd() * 360 - 180, -8 + rnd() * 16, 2 + rnd() * 3, 0.45, 14, 2.2))]);
  for (let i = 0; i < 26; i++) {
    const lat = (rnd() < 0.5 ? -1 : 1) * (38 + rnd() * 24);
    regions.push(["cloud", "cloud", x10(blob(rnd() * 360 - 180, lat, 2.5 + rnd() * 4, 0.5, 16, 2.8))]);
  }
  for (let i = 0; i < 14; i++) regions.push(["cloud", "cloud", x10(blob(rnd() * 360 - 180, rnd() * 100 - 50, 1.5 + rnd() * 2, 0.4, 12, 1.4))]);
  return regions;
}

function moonRegions() {
  seed = 11;
  const regions: any[] = [];
  const mare = (lon: number, lat: number, r: number) => regions.push(["mare", "sea", blob(lon, lat, r, 0.2, 24)]);
  // the near side faces lon 0
  mare(-57, 18, 21); mare(-48, -2, 14); mare(-64, 38, 12);       // Oceanus Procellarum
  mare(-16, 33, 16);                                            // Imbrium
  mare(17, 28, 9);                                              // Serenitatis
  mare(31, 8, 10); mare(24, 1, 6);                              // Tranquillitatis
  mare(59, 17, 7);                                              // Crisium
  mare(51, -8, 7);                                              // Fecunditatis
  mare(35, -15, 5);                                             // Nectaris
  mare(-17, -21, 9);                                            // Nubium
  mare(-39, -24, 5);                                            // Humorum
  mare(4, 13, 4);                                               // Vaporum
  regions.push(["frigoris", "sea", blob(5, 56, 7, 0.3, 24, 3)]);
  mare(-145, -55, 9); mare(147, -27, 5);                        // the far side has few maria
  craters(regions, 150, 5, 12);
  regions.push(["tycho", "bright", blob(-11, -43, 2.6, 0.05, 16)]);
  regions.push(["copernicus", "bright", blob(-20, 10, 2.4, 0.05, 16)]);
  regions.push(["aristarchus", "bright", blob(-47, 24, 1.2, 0.05, 12)]);
  return regions;
}

function mercuryRegions() {
  seed = 29;
  const regions: any[] = [];
  for (let i = 0; i < 10; i++) regions.push(["plain", "sea", blob(rnd() * 360 - 180, rnd() * 120 - 60, 8 + rnd() * 12, 0.25, 22)]);
  regions.push(["caloris", "basin", blob(170, 30, 15, 0.08, 24)]);
  craters(regions, 170, 4.5, 14);
  return regions;
}

function venusRegions() {
  seed = 41;
  const regions: any[] = [];
  const cols = ["c1", "c2", "c3", "c2"];
  // the cloud deck: faint chevrons that run round the planet
  for (let lat = -76, i = 0; lat < 76; lat += 9, i++) regions.push(["b" + i, cols[i % 4], band(lat, lat + 6, 5, 1 + (i % 2))]);
  regions.push(["n", "c3", polar(76, 4)]);
  regions.push(["s", "c3", polar(-76, 4)]);
  return regions;
}

function marsRegions() {
  seed = 53;
  const regions: any[] = [];
  const dark = (lon: number, lat: number, r: number, c = "dark") => regions.push([c, c, blob(lon, lat, r, 0.35, 24)]);
  dark(70, 10, 10); dark(62, 2, 8);                  // Syrtis Major
  dark(-30, 45, 12); dark(-15, 40, 7);               // Acidalium
  dark(0, -5, 8); dark(-20, -8, 7);                  // Sinus Meridiani, Margaritifer
  dark(-40, -25, 12); dark(-10, -25, 10);            // Erythraeum
  dark(100, -20, 12); dark(140, -25, 14); dark(-150, -35, 12); dark(175, -30, 10);  // Tyrrhenum, Cimmerium, Sirenum
  dark(110, 25, 6, "dark2"); dark(-80, -30, 8, "dark2"); dark(30, -35, 9, "dark2");
  regions.push(["hellas", "hellas", blob(70, -42, 10, 0.06, 24)]);
  regions.push(["argyre", "hellas", blob(-43, -50, 6, 0.06, 20)]);
  // Tharsis volcanoes, darker
  regions.push(["olympus", "volc", blob(-134, 18, 3, 0.05, 16)]);
  regions.push(["ascraeus", "volc", blob(-104, 12, 1.6, 0.05, 12)]);
  regions.push(["pavonis", "volc", blob(-113, 1, 1.5, 0.05, 12)]);
  regions.push(["arsia", "volc", blob(-121, -9, 1.7, 0.05, 12)]);
  // Valles Marineris, a long dark canyon
  regions.push(["valles", "canyon", [-95, -6, -75, -4, -55, -8, -42, -12, -42, -15, -55, -12, -75, -9, -95, -10]]);
  craters(regions, 40, 3, 0);
  regions.push(["ncap", "ice", polar(80, 4)]);
  regions.push(["scap", "ice", polar(-83, 2)]);
  return regions;
}

function jupiterRegions() {
  seed = 67;
  const regions: any[] = [];
  const edges = [-90, -62, -52, -44, -36, -27, -19, -12, -5, 5, 10, 18, 25, 33, 42, 52, 65, 90];
  const cols = ["pole", "belt3", "zone2", "belt2", "zone", "belt", "zone", "belt", "eq", "belt", "belt2", "zone", "belt3", "zone2", "belt2", "belt3", "pole"];
  for (let i = 0; i + 1 < edges.length; i++) {
    if (edges[i] === -90) regions.push(["b" + i, cols[i], polar(-62, 2)]);
    else if (edges[i + 1] === 90) regions.push(["b" + i, cols[i], polar(65, 2)]);
    else regions.push(["b" + i, cols[i], band(edges[i], edges[i + 1], 1.2, 5 + (i % 4))]);
  }
  // festoons and white ovals along the belts
  for (let i = 0; i < 14; i++) regions.push(["fest" + i, "festoon", blob(rnd() * 360 - 180, 6 + rnd() * 3, 1.6, 0.3, 12, 2.5)]);
  for (let i = 0; i < 9; i++) regions.push(["oval" + i, "oval", blob(rnd() * 360 - 180, -40 + (i % 3) * 1.5, 2, 0.05, 14, 1.5)]);
  // the Great Red Spot: a pale collar and the red oval
  regions.push(["grsc", "zone", blob(-60, -22, 9.5, 0.03, 28, 1.7).map((v: number, i: number) => i % 2 ? -22 + (v + 22) * 0.6 : v)]);
  regions.push(["grs", "spot", blob(-60, -22, 7.5, 0.03, 28, 1.7).map((v: number, i: number) => i % 2 ? -22 + (v + 22) * 0.6 : v)]);
  return regions;
}

function sunRegions() {
  seed = 79;
  const regions: any[] = [];
  for (let i = 0; i < 60; i++) regions.push(["g" + i, rnd() < 0.5 ? "gran" : "gran2", blob(rnd() * 360 - 180, rnd() * 140 - 70, 2 + rnd() * 6, 0.35, 12)]);
  for (let i = 0; i < 9; i++) {
    const lon = rnd() * 360 - 180, lat = (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 22);
    const r = 0.8 + rnd() * 1.4;
    regions.push(["p" + i, "penumbra", blob(lon, lat, r * 1.7, 0.25, 14)]);
    regions.push(["s" + i, "spot", blob(lon, lat, r * 0.8, 0.15, 12)]);
  }
  return regions;
}

// the globe options of one body (sent once with rg.three("planet", …))
function surfaceBase(id: string): any {
  if (id === "earth") {
    const colors: any = { seaice: "#d9e2ea", cloud: "#eef2f6" };
    for (const c of ["SAH", "MRT", "DZA", "LBY", "EGY", "MLI", "NER", "TCD", "SAU", "OMN", "YEM", "ARE", "QAT", "KWT", "JOR", "IRQ", "IRN", "TKM", "UZB", "AFG", "PAK", "NAM", "BWA", "MNG", "SDN", "ERI", "SOM", "DJI", "SOL", "ESH", "MAR", "TUN", "ISR", "SYR"]) colors[c] = "#c8a46a";
    for (const c of ["AUS"]) colors[c] = "#b07a46";
    for (const c of ["ATA", "GRL"]) colors[c] = "#eef3f7";
    return {
      regions: earthRegions(), scale: 10, colors, ocean: "#14406f", land: "#46703a", glow: "#6fa8ff", cell: 12, night: 0.93,
      bands: [[-90, -60, "#e9eef2"], [-60, -40, "#4d6b3a"], [-40, -15, "#7f7a48"], [-15, 12, "#2c5a26"], [12, 30, "#9c8a58"],
              [30, 50, "#4f6e3a"], [50, 66, "#334f2c"], [66, 74, "#6f7466"], [74, 90, "#e9eef2"]],
    };
  }
  if (id === "moon") return { regions: moonRegions(), ocean: "#9d9993", colors: { sea: "#57554f", rim: "#b3afa7", floor: "#8a867f", bright: "#cfccc5" }, cell: 15, night: 0.96 };
  if (id === "mercury") return { regions: mercuryRegions(), ocean: "#8a847c", colors: { sea: "#6e6861", basin: "#a19789", rim: "#a7a097", floor: "#7b756d", bright: "#c7c1b8" }, cell: 15, night: 0.96 };
  if (id === "venus") return { regions: venusRegions(), ocean: "#d8c48f", colors: { c1: "#e3d3a6", c2: "#cdb57c", c3: "#ead9b2" }, glow: "#f3dfae", cell: 15, night: 0.92 };
  if (id === "mars") return {
    regions: marsRegions(), ocean: "#b8683f",
    colors: { dark: "#6a3a26", dark2: "#844a2e", hellas: "#cf9a6c", volc: "#7a4a33", canyon: "#4f2618", rim: "#a85d38", floor: "#c27449", bright: "#c27449", ice: "#efe9e2" },
    glow: "#d9a07a", cell: 15, night: 0.94,
  };
  if (id === "jupiter") return {
    regions: jupiterRegions(), ocean: "#d9c9a8",
    colors: { pole: "#7f7263", belt: "#9a6a47", belt2: "#b0825c", belt3: "#8c7360", zone: "#ece2cc", zone2: "#dccdae", eq: "#e6d7b8",
              festoon: "#6f5a4a", oval: "#f4efe4", spot: "#b75a3a" },
    glow: "#e9dcc2", cell: 15, night: 0.93,
  };
  return { regions: sunRegions(), ocean: "#fff0c4", colors: { gran: "#ffe39a", gran2: "#fff6d8", penumbra: "#c9772e", spot: "#5a2408" }, glow: "#ffd36b", glowing: true };
}

// real maps (Solar System Scope, CC BY 4.0, see CREDITS.md) where the host
// draws textured globes; the regions above stay for hosts that do not
const MAPS: { [id: string]: string } = { earth: "img/earth.jpg", mars: "img/mars.jpg", mercury: "img/mercury.jpg", venus: "img/venus.jpg", jupiter: "img/jupiter.jpg", sun: "img/sun.jpg" };
export function surface(id: string): any {
  const s = surfaceBase(id);
  if (MAPS[id]) s.texture = MAPS[id];
  return s;
}
