// Lämpölabra – Sulata jää: ice sculptures on a lab tray, with treasures
// frozen inside. Heat the ice with a match, a candle, a burning stick, a
// camping stove, the hotplate under the tray, your palm, a hair dryer, a
// magnifying glass and the sun, or sprinkle salt on it. Warming ice gets
// to 0 °C first and then melts; melting ice cracks into smaller pieces, and
// a small physics engine (lib/physics.ts) lets the towers lean, slide and
// tumble down. Melt water collects in the tray, ice floats in it, the
// hotplate warms the water and boils it away.
//
// The heat is real physics, sped up (SPEED): a gram of ice warms 1 °C with
// 2.1 J and melts with 334 J; dry ice (frozen carbon dioxide, −78 °C) turns
// straight into gas with 571 J/g. Each heater has its real power, and hot
// air rises, so a flame under the ice warms it far better than beside it.
// The palm is 34 °C and cools as the ice takes its heat: hold it on too
// long and it freezes, and must warm up before it can be used again.

import { Body, World, newWorld, addBox, resize, remove, wake, step, touching, inside, nearest, extent } from "lib/physics";

type Kind = "ice" | "snow" | "blue" | "dry";
type Tool = "match" | "candle" | "wood" | "stove" | "palm" | "dryer" | "lens" | "salt";
type Ice = {
  ice: true; kind: Kind; T: number; g: number; g0: number; melted: number; salt: number;
  treasure: string; tx: number; ty: number; heat: number; glow: number; drip: number; seed: number; shock: number;
};
type Gem = { ice: false; treasure: string; freed: number };
type Drop = { x: number; y: number; vy: number; g: number };
type Puff = { x: number; y: number; vx: number; vy: number; t: number; life: number; s: number; kind: number };
type Grain = { x: number; y: number; vx: number; vy: number };
type Shard = { x: number; y: number; vx: number; vy: number; t: number; s: number };
type Block = { x: number; b: number; w: number; h: number; k: Kind; t?: string };
type Level = { id: string; name: string; en: string; es: string; blocks: Block[] };
type Mode = "menu" | "play" | "done";

const SPEED = 3;                 // the heat runs this many times faster than real time
const DEPTH = 30;                // the blocks are 30 mm thick (a pixel is a millimetre)
const C_ICE = 2.1, L_ICE = 334;  // J/(g·K), J/g
const C_DRY = 0.85, L_DRY = 571, T_DRY = -78.5;
const GRAVITY = 1300;
const MINP = 9;                  // a piece smaller than this melts away instead of cracking
const GEM = 26;
const STEP = 1 / 60;

const KINDS: { [k: string]: { name: string[]; T0: number; rho: number; crack: number; friction: number; absorb: number } } = {
  ice: { name: ["Jää", "Ice", "Hielo"], T0: -8, rho: 0.92, crack: 0.22, friction: 0.35, absorb: 0.18 },
  snow: { name: ["Lumi", "Snow", "Nieve"], T0: -4, rho: 0.45, crack: 0.1, friction: 0.65, absorb: 0.3 },
  blue: { name: ["Ikijää", "Glacier ice", "Hielo glaciar"], T0: -25, rho: 0.92, crack: 0.3, friction: 0.3, absorb: 0.12 },
  dry: { name: ["Kuivajää", "Dry ice", "Hielo seco"], T0: T_DRY, rho: 1.5, crack: 0.25, friction: 0.4, absorb: 0.3 },
};

// power: watts that reach the ice; r: how wide the flame (or the jet) is
const TOOLS: { [k: string]: { icon: string; name: string[]; power: number; r: number; tip: string[] } } = {
  match: { icon: "🔥", name: ["Tulitikku", "Match", "Cerilla"], power: 50, r: 6,
    tip: ["Liekki on kuuma (800 °C) mutta pieni, ja tikku palaa loppuun.", "The flame is hot (800 °C) but small, and the match burns out.", "La llama está caliente (800 °C) pero es pequeña y la cerilla se consume."] },
  candle: { icon: "🕯️", name: ["Kynttilä", "Candle", "Vela"], power: 80, r: 7,
    tip: ["Kuuma ilma nousee ylös: pidä liekki jään alla!", "Hot air rises: hold the flame under the ice!", "El aire caliente sube: ¡pon la llama debajo del hielo!"] },
  wood: { icon: "🪵", name: ["Palava puu", "Burning wood", "Leña ardiendo"], power: 900, r: 15,
    tip: ["Puussa on paljon energiaa, ja se vapautuu lämpönä kun puu palaa.", "Wood holds a lot of energy; burning sets it free as heat.", "La madera guarda mucha energía, que al arder se libera como calor."] },
  stove: { icon: "🏕️", name: ["Retkikeitin", "Camping stove", "Hornillo"], power: 2500, r: 20,
    tip: ["Kaasuliekki on sininen ja tosi kuuma. Tehokkain lämmitin!", "A gas flame is blue and very hot. The strongest heater!", "La llama de gas es azul y muy caliente. ¡El más potente!"] },
  palm: { icon: "✋", name: ["Kämmen", "Palm", "Mano"], power: 30, r: 0,
    tip: ["Käsi on 34 °C. Jää vie siitä lämpöä. Voit myös tönäistä!", "Your hand is 34 °C. The ice takes its heat. You can push too!", "La mano está a 34 °C. El hielo le quita calor. ¡Puedes empujar!"] },
  dryer: { icon: "💨", name: ["Hiustenkuivaaja", "Hair dryer", "Secador"], power: 450, r: 14,
    tip: ["Puhallin kuljettaa kuumaa ilmaa ja puhaltaa pienet palat pois.", "The fan carries hot air and blows small pieces away.", "El ventilador lleva aire caliente y empuja los trozos pequeños."] },
  lens: { icon: "🔍", name: ["Suurennuslasi", "Magnifying glass", "Lupa"], power: 14, r: 0,
    tip: ["Linssi kokoaa auringonvalon pisteeksi. Kirkas jää päästää valon läpi, tumma aarre lämpenee!", "The lens gathers sunlight into a spot. Clear ice lets light through, a dark treasure warms up!", "La lupa junta la luz del sol en un punto. El hielo deja pasar la luz, ¡un tesoro oscuro se calienta!"] },
  salt: { icon: "🧂", name: ["Suola", "Salt", "Sal"], power: 0, r: 0,
    tip: ["Suola alentaa sulamispistettä: jää sulaa, vaikka se kylmenee!", "Salt lowers the melting point: ice melts even though it gets colder!", "La sal baja el punto de fusión: ¡el hielo se derrite aunque se enfría!"] },
};
const ROW1: Tool[] = ["match", "candle", "wood", "stove", "palm"];
const ROW2: Tool[] = ["dryer", "lens", "salt"];

const LEVELS: Level[] = [
  { id: "kuutio", name: "Jääkuutio", en: "Ice cube", es: "Cubo de hielo", blocks: [
    { x: 0, b: 0, w: 110, h: 96, k: "ice", t: "🐟" },
  ] },
  { id: "torni", name: "Jäätorni", en: "Ice tower", es: "Torre de hielo", blocks: [
    { x: 0, b: 0, w: 120, h: 28, k: "ice" },
    { x: -42, b: 28, w: 30, h: 62, k: "ice" }, { x: 42, b: 28, w: 30, h: 62, k: "ice" },
    { x: 0, b: 28, w: 40, h: 40, k: "snow", t: "🐌" },
    { x: 0, b: 90, w: 132, h: 24, k: "ice" },
    { x: 0, b: 114, w: 64, h: 54, k: "ice", t: "🐧" },
    { x: 0, b: 168, w: 32, h: 30, k: "snow" },
  ] },
  { id: "linna", name: "Lumilinna", en: "Snow castle", es: "Castillo de nieve", blocks: [
    { x: -72, b: 0, w: 44, h: 40, k: "snow" }, { x: -72, b: 40, w: 44, h: 40, k: "snow" }, { x: -72, b: 80, w: 44, h: 36, k: "snow" },
    { x: 72, b: 0, w: 44, h: 40, k: "snow" }, { x: 72, b: 40, w: 44, h: 40, k: "snow" }, { x: 72, b: 80, w: 44, h: 36, k: "snow" },
    { x: 0, b: 0, w: 98, h: 38, k: "snow", t: "🦆" }, { x: 0, b: 38, w: 98, h: 30, k: "ice" },
    { x: 0, b: 68, w: 60, h: 34, k: "snow", t: "🐿️" },
    { x: -84, b: 116, w: 16, h: 16, k: "snow" }, { x: -60, b: 116, w: 16, h: 16, k: "snow" },
    { x: 60, b: 116, w: 16, h: 16, k: "snow" }, { x: 84, b: 116, w: 16, h: 16, k: "snow" },
  ] },
  { id: "jaavuori", name: "Ikijäävuori", en: "Glacier", es: "Glaciar", blocks: [
    { x: -64, b: 0, w: 62, h: 46, k: "blue" }, { x: 0, b: 0, w: 62, h: 46, k: "blue", t: "🐚" }, { x: 64, b: 0, w: 62, h: 46, k: "blue" },
    { x: -32, b: 46, w: 62, h: 46, k: "blue" }, { x: 32, b: 46, w: 62, h: 46, k: "blue" },
    { x: 0, b: 92, w: 62, h: 46, k: "blue", t: "💎" },
  ] },
  { id: "kuivajaa", name: "Kuivajää", en: "Dry ice", es: "Hielo seco", blocks: [
    { x: 0, b: 0, w: 84, h: 70, k: "ice", t: "🦖" },
    { x: 0, b: 70, w: 150, h: 22, k: "dry" },
    { x: -48, b: 92, w: 36, h: 36, k: "dry" }, { x: 48, b: 92, w: 36, h: 36, k: "dry" },
    { x: 0, b: 92, w: 44, h: 50, k: "ice", t: "🐙" },
  ] },
  { id: "silta", name: "Jääsilta", en: "Ice bridge", es: "Puente de hielo", blocks: [
    { x: -82, b: 0, w: 34, h: 92, k: "ice" }, { x: 82, b: 0, w: 34, h: 92, k: "ice" },
    { x: 0, b: 0, w: 52, h: 40, k: "ice", t: "🍓" },
    { x: 0, b: 92, w: 226, h: 22, k: "blue" },
    { x: -54, b: 114, w: 40, h: 40, k: "snow" }, { x: 0, b: 114, w: 46, h: 46, k: "ice", t: "🐻" }, { x: 54, b: 114, w: 40, h: 40, k: "snow" },
  ] },
  { id: "leikki", name: "Vapaa leikki", en: "Free play", es: "Juego libre", blocks: [] },
];

let mode: Mode = "menu";
let t = 0;
let level = 0;
let world: World = newWorld(GRAVITY);
let floorBody: Body | null = null;
let FLOOR = 480;
let TRAY_L = 22, TRAY_R = 338;
let acc = 0;
let clock = 0;            // seconds in this level
let energy = 0;           // joules given to the ice (and the water)
let freed = 0;
let gems = 0;
let tool: Tool = "candle";
let heater = { x: 70, y: 400, on: false, life: 0, burnt: false };
let grab = false;
let grabDX = 0, grabDY = 0;
let matches = 0;
let palm: Body | null = null;
let handT = 34;
let handFrozen = false;
let plateOn = false;
let plateT = 20;
let water = 0;            // grams in the tray
let waterJ = 0;           // heat in the water above 0 °C, joules
let drops: Drop[] = [];
let puffs: Puff[] = [];
let grains: Grain[] = [];
let shards: Shard[] = [];
let focus: Body | null = null;
let focusHeat = 0;
let msg = "";
let msgClock = 0;
let told: { [k: string]: boolean } = {};
let sizzle = 0;
let best: { [k: string]: number } = {};
let doneClock = 0;

function init() {
  best = rg.load("best", {});
}

// ---- the level ---------------------------------------------------------------

function toolbarTop() { return height - 116; }

function startLevel(n: number) {
  level = n;
  mode = "play";
  world = newWorld(GRAVITY);
  FLOOR = Math.round(height - 172);
  // the tray: its floor with the hotplate in the middle, low rims, and the
  // screen's edges so nothing flies away
  floorBody = addBox(world, 180, FLOOR + 30, 400, 60, 0, null);
  floorBody.friction = 0.6;
  addBox(world, TRAY_L - 5, FLOOR - 24, 10, 48, 0, null);
  addBox(world, TRAY_R + 5, FLOOR - 24, 10, 48, 0, null);
  addBox(world, -30, FLOOR - 400, 60, 1000, 0, null);
  addBox(world, 390, FLOOR - 400, 60, 1000, 0, null);
  const L = LEVELS[n];
  gems = 0;
  freed = 0;
  for (const b of L.blocks) {
    addIce(190 + b.x, FLOOR - b.b - b.h / 2, b.w, b.h, b.k, b.t || "", 0, 0);
    if (b.t) gems++;
  }
  if (L.id === "leikki") for (let i = 0; i < 5; i++) dropIce(true);
  // a little time for the stack to settle before anyone looks
  for (let i = 0; i < 20; i++) step(world, STEP);
  acc = 0; clock = 0; energy = 0; matches = 0;
  palm = null; handT = 34; handFrozen = false;
  plateOn = false; plateT = 20;
  water = 0; waterJ = 0;
  drops = []; puffs = []; grains = []; shards = [];
  focus = null; focusHeat = 0;
  told = {}; msg = ""; msgClock = 0;
  heater = { x: 64, y: FLOOR - 52, on: false, life: 0, burnt: false };
  tool = "candle";
  grab = false;
  rg.sound("click");
  rg.say(L.id === "leikki" ? "ll_leikki" : "ll_alku");
  tell("start", rg.t("Valitse lämmitin alhaalta ja vedä se jään luo.", "Pick a heater below and drag it to the ice.", "Elige un calentador abajo y arrástralo al hielo."));
}

function addIce(x: number, y: number, w: number, h: number, k: Kind, treasure: string, tx: number, ty: number): Body {
  const K = KINDS[k];
  const g = grams(k, w, h);
  const ice: Ice = { ice: true, kind: k, T: K.T0, g, g0: g, melted: 0, salt: 0, treasure, tx, ty, heat: 0, glow: 0, drip: 0, seed: Math.floor(rg.random() * 1000), shock: 0 };
  const b = addBox(world, x, y, w, h, K.rho, ice);
  b.friction = K.friction;
  return b;
}

function grams(k: Kind, w: number, h: number) { return KINDS[k].rho * w * h * DEPTH / 1000; }

// free play: a new block falls from above
function dropIce(start: boolean) {
  const kinds: Kind[] = ["ice", "ice", "snow", "blue", "dry"];
  const k = rg.pick(kinds);
  const w = 26 + rg.range(0, 8) * 8, h = 22 + rg.range(0, 6) * 8;
  const T = rg.random() < 0.35 ? rg.pick(["🐟", "⭐", "🍒", "🐞", "🔑", "🎈"]) : "";
  const x = 80 + rg.random() * 210;
  const y = start ? FLOOR - 40 - rg.random() * 200 : 70;
  const b = addIce(x, y, Math.max(w, T ? 40 : w), Math.max(h, T ? 40 : h), k, k === "dry" ? "" : T, 0, 0);
  b.a = (rg.random() - 0.5) * 0.6;
  if ((b.data as Ice).treasure) gems++;
  wake(world);
  if (!start) rg.sound("whoosh", { pitch: 0.7 });
}

function tell(key: string, text: string) {
  if (told[key]) return;
  told[key] = true;
  msg = text;
  msgClock = key === "start" ? 6 : 4.5;
}

// ---- heat --------------------------------------------------------------------

function iceOf(b: Body): Ice | null { return b.data && b.data.ice ? (b.data as Ice) : null; }

function meltPoint(ice: Ice): number {
  if (ice.kind === "dry") return T_DRY;
  return -Math.min(21, ice.salt * 1.2);
}

// joules of heat into a block: warm it to its melting point, then melt
function heat(b: Body, J: number) {
  const ice = iceOf(b);
  if (!ice || J <= 0 || b.dead) return;
  energy += J;
  ice.heat += J;
  const dry = ice.kind === "dry";
  const c = dry ? C_DRY : C_ICE, L = dry ? L_DRY : L_ICE;
  const Tm = meltPoint(ice);
  if (ice.T < Tm) {
    const need = (Tm - ice.T) * ice.g * c;
    if (J < need) { ice.T += J / (ice.g * c); return; }
    J -= need;
    ice.T = Tm;
  }
  melt(b, ice, J / L);
}

function melt(b: Body, ice: Ice, dm: number) {
  if (dm <= 0) return;
  dm = Math.min(dm, ice.g);
  ice.g -= dm;
  ice.melted += dm;
  if (ice.kind === "dry") {
    ice.drip += dm;
    if (ice.drip > 0.4) { ice.drip = 0; fog(b, 1); }
    tell("dry", rg.t("Kuivajää ei sula vedeksi: se muuttuu suoraan hiilidioksidikaasuksi.", "Dry ice does not melt into water: it turns straight into carbon dioxide gas.", "El hielo seco no se derrite: se convierte directamente en gas."));
  } else {
    ice.drip += dm;
    if (ice.drip > 1.2) { drip(b, ice.drip); ice.drip = 0; }
  }
  if (ice.g < 0.25 || Math.max(b.hw, b.hh) * 2 < 5) { gone(b, ice); return; }
  const f = Math.sqrt(ice.g / grams(ice.kind, b.hw * 2, b.hh * 2));
  if (f < 0.995) {
    resize(world, b, b.hw * 2 * f, b.hh * 2 * f);
    ice.tx *= f; ice.ty *= f;
  }
  if (ice.treasure && Math.min(b.hw, b.hh) * 2 < GEM + 2) free(b, ice);
  if (ice.melted / ice.g0 > KINDS[ice.kind].crack) crack(b, ice);
}

function gone(b: Body, ice: Ice) {
  if (ice.treasure) free(b, ice);
  if (ice.kind !== "dry" && ice.g + ice.drip > 0) addWater(ice.g + ice.drip);
  remove(world, b);
  if (focus === b) focus = null;
}

function addWater(g: number) {
  water += g;
  if (water > 30) tell("water", rg.t("Sulanut jää on vettä. Se valuu altaan pohjalle.", "Melted ice is water. It collects in the tray.", "El hielo derretido es agua. Se junta en la bandeja."));
}

// a treasure comes out of its ice
function free(b: Body, ice: Ice) {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  releaseGem(b.x + c * ice.tx - s * ice.ty, b.y + s * ice.tx + c * ice.ty, b.vx, b.vy, ice.treasure);
  ice.treasure = "";
}

function releaseGem(x: number, y: number, vx: number, vy: number, emoji: string) {
  const gem: Gem = { ice: false, treasure: emoji, freed: t };
  const g = addBox(world, x, y, GEM - 4, GEM - 4, 1.3, gem);
  g.friction = 0.6;
  g.vx = vx; g.vy = vy - 120; g.w = (rg.random() - 0.5) * 4;
  freed++;
  rg.celebrate(x, y, { count: 14 });
  rg.say(freed >= gems ? "ll_valmis" : "ll_vapaa");
  if (freed >= gems && mode === "play" && LEVELS[level].id !== "leikki") {
    mode = "done";
    doneClock = 0;
    const prev = best[LEVELS[level].id];
    if (!prev || clock < prev) { best[LEVELS[level].id] = Math.round(clock); rg.save("best", best); }
    rg.celebrate(width / 2, height * 0.35, { big: true, sound: true });
  }
}

// a block breaks in two (snow crumbles in four)
function crack(b: Body, ice: Ice) {
  const W = b.hw * 2, H = b.hh * 2;
  const alongX = W >= H;
  const L = alongX ? W : H;
  if (L < MINP * 2) { ice.melted = 0; ice.g0 = ice.g; return; }
  const c = Math.cos(b.a), s = Math.sin(b.a);
  const k = 0.38 + rg.random() * 0.24;
  const parts: number[][] = [];  // local cx, cy, w, h
  if (alongX) {
    parts.push([-W / 2 + k * W / 2, 0, k * W - 1, H]);
    parts.push([-W / 2 + k * W + (1 - k) * W / 2, 0, (1 - k) * W - 1, H]);
  } else {
    parts.push([0, -H / 2 + k * H / 2, W, k * H - 1]);
    parts.push([0, -H / 2 + k * H + (1 - k) * H / 2, W, (1 - k) * H - 1]);
  }
  // snow crumbles across too
  if (ice.kind === "snow" && Math.min(W, H) >= MINP * 2) {
    const out: number[][] = [];
    for (const p of parts) {
      if (alongX) { out.push([p[0], -H / 4, p[2], H / 2 - 1]); out.push([p[0], H / 4, p[2], H / 2 - 1]); }
      else { out.push([-W / 4, p[1], W / 2 - 1, p[3]]); out.push([W / 4, p[1], W / 2 - 1, p[3]]); }
    }
    parts.length = 0;
    for (const p of out) parts.push(p);
  }
  remove(world, b);
  if (focus === b) focus = null;
  let gemGone = !ice.treasure;
  const total = parts.reduce((a, p) => a + p[2] * p[3], 0);
  for (const p of parts) {
    const x = b.x + c * p[0] - s * p[1], y = b.y + s * p[0] + c * p[1];
    // the piece moves as that point of the block moved
    const rx = x - b.x, ry = y - b.y;
    const hasGem = !gemGone && Math.abs(ice.tx - p[0]) <= p[2] / 2 && Math.abs(ice.ty - p[1]) <= p[3] / 2;
    const n = addIce(x, y, p[2], p[3], ice.kind, hasGem ? ice.treasure : "", hasGem ? ice.tx - p[0] : 0, hasGem ? ice.ty - p[1] : 0);
    if (hasGem) gemGone = true;
    const ni = n.data as Ice;
    ni.T = ice.T; ni.salt = ice.salt * (p[2] * p[3]) / total;
    ni.g = ice.g * (p[2] * p[3]) / total; ni.g0 = ni.g;
    n.a = b.a;
    // a small pop apart
    const len = Math.sqrt(p[0] * p[0] + p[1] * p[1]) || 1;
    n.vx = b.vx - b.w * ry + (c * p[0] - s * p[1]) / len * 30;
    n.vy = b.vy + b.w * rx + (s * p[0] + c * p[1]) / len * 30 - 20;
    n.w = b.w + (rg.random() - 0.5) * 1.5;
    if (hasGem && Math.min(p[2], p[3]) < GEM + 2) free(n, ni);
    if (focus === null) focus = n;
  }
  // a treasure no piece holds any more is out
  if (!gemGone) releaseGem(b.x + c * ice.tx - s * ice.ty, b.y + s * ice.tx + c * ice.ty, b.vx, b.vy, ice.treasure);
  for (let i = 0; i < 6; i++) shards.push({ x: b.x + (rg.random() - 0.5) * W * 0.6, y: b.y + (rg.random() - 0.5) * H * 0.6, vx: (rg.random() - 0.5) * 160, vy: -60 - rg.random() * 120, t: 0, s: 2 + rg.random() * 4 });
  rg.sound("hit", { pitch: 1.4 + rg.random() * 0.8, volume: 0.45 });
  rg.vibrate(12);
}

function drip(b: Body, g: number) {
  const e = extent(b);
  if (drops.length > 70) { addWater(g); return; }
  drops.push({ x: b.x + (rg.random() - 0.5) * e[0] * 1.4, y: b.y + e[1], vy: 20, g });
}

function fog(b: Body, n: number) {
  const e = extent(b);
  for (let i = 0; i < n; i++) {
    if (puffs.length > 26) break;
    puffs.push({ x: b.x + (rg.random() - 0.5) * e[0] * 2, y: b.y + (rg.random() - 0.3) * e[1] * 2, vx: (rg.random() - 0.5) * 30, vy: 15 + rg.random() * 20, t: 0, life: 2.5 + rg.random(), s: 22 + rg.random() * 16, kind: 0 });
  }
}

function steam(x: number, y: number) {
  if (puffs.length > 26) return;
  puffs.push({ x, y, vx: (rg.random() - 0.5) * 20, vy: -40 - rg.random() * 30, t: 0, life: 1.4 + rg.random() * 0.6, s: 10 + rg.random() * 10, kind: 1 });
}

function waterTop() { return FLOOR - water * 1000 / ((TRAY_R - TRAY_L) * DEPTH); }
function waterT() { return water > 0.5 ? waterJ / (water * 4.19) : 0; }

// where the active heater's heat comes from
function source(): number[] {
  const T = TOOLS[tool];
  if (tool === "stove") return [heater.x, heater.y - 14];
  if (tool === "wood") return [heater.x, heater.y - 16];
  if (tool === "lens") return [heater.x, heater.y + 40];
  return [heater.x, heater.y - T.r];
}

// A flame's heat: the hot air rises in a widening plume, and the first
// block in its way takes most of it; a little warms what is beside it.
function flameHeat(P: number, sx: number, sy: number, r: number, dt: number) {
  const list: { b: Body; up: number; w: number; cov: number }[] = [];
  for (const b of world.bodies) {
    if (!iceOf(b) || b.dead) continue;
    const p = nearest(b, sx, sy);
    const dx = p[0] - sx, dy = p[1] - sy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const e = extent(b);
    if (d < 1) { list.push({ b, up: 0, w: 1, cov: 1 }); continue; }
    if (dy < 2) {
      const up = -dy;
      const spread = r + 0.3 * up;
      const w = Math.exp(-(dx * dx) / (2 * spread * spread)) * Math.exp(-up / 200);
      if (w > 0.01) list.push({ b, up, w, cov: Math.min(1, e[0] / spread) });
    }
    // radiation: close by, any side
    const side = Math.exp(-d / (r * 1.5 + 6)) * 0.12;
    if (side > 0.005) heat(b, P * side * SPEED * dt);
  }
  list.sort((a, b) => a.up - b.up);
  let left = 1;
  for (const o of list) {
    const take = Math.min(0.75, o.w * o.cov);
    heat(o.b, P * left * take * SPEED * dt);
    left *= 1 - take;
    if (left < 0.02) break;
  }
}

// the hair dryer's jet goes sideways, and pushes what it hits
function jetHeat(P: number, sx: number, sy: number, dir: number, dt: number) {
  const list: { b: Body; along: number; w: number; cov: number }[] = [];
  for (const b of world.bodies) {
    if (b.invM === 0) continue;
    const p = nearest(b, sx, sy);
    const along = (p[0] - sx) * dir;
    if (along < -4) continue;
    const lat = p[1] - sy;
    const spread = 14 + 0.3 * Math.max(0, along);
    const w = Math.exp(-(lat * lat) / (2 * spread * spread)) * Math.exp(-Math.max(0, along) / 240);
    if (w < 0.02) continue;
    const e = extent(b);
    list.push({ b, along, w, cov: Math.min(1, e[1] / spread) });
  }
  list.sort((a, b) => a.along - b.along);
  let left = 1;
  for (const o of list) {
    const take = Math.min(0.85, o.w * o.cov);
    heat(o.b, P * left * take * SPEED * dt);
    const e = extent(o.b);
    o.b.fx += dir * left * take * e[1] * 2 * 11000;
    o.b.fy -= left * take * e[1] * 1500;
    if (o.b.asleep) { o.b.asleep = false; o.b.still = 0; }
    left *= 1 - take;
    if (left < 0.03) break;
  }
  for (const p of puffs) if (Math.abs(p.y - sy) < 40 && (p.x - sx) * dir > 0) p.vx += dir * 300 * dt;
  for (const g of grains) if (Math.abs(g.y - sy) < 30 && (g.x - sx) * dir > 0) g.vx += dir * 400 * dt;
}

function contactHeat(src: Body, P: number, srcT: number, dt: number) {
  const ts = touching(world, src).filter((b) => iceOf(b) !== null);
  for (const b of ts) {
    const ice = iceOf(b) as Ice;
    const k = Math.max(0, (srcT - ice.T) / 34);
    heat(b, P * k / ts.length * SPEED * dt);
  }
  return ts.length;
}

// the hotplate warms what stands on it, and the water above it
function plateHeat(dt: number) {
  const target = plateOn ? 380 : 20;
  plateT += (target - plateT) * Math.min(1, dt * (plateOn ? 0.35 : 0.2));
  if (plateT < 30) return;
  const P = 1500 * (plateT - 20) / 360;
  const x0 = 180 - 60, x1 = 180 + 60;
  let toWater = 0;
  const wt = waterTop();
  if (water > 2) toWater = Math.min(0.8, (FLOOR - wt) / 8);
  if (toWater > 0) {
    waterJ += P * toWater * SPEED * dt;
    energy += P * toWater * SPEED * dt;
  }
  // what rests on the plate (sleeping bodies make no contacts, so by shape)
  const on: Body[] = [];
  for (const b of world.bodies) {
    if (!iceOf(b) || b.dead) continue;
    const e = extent(b);
    if (b.y + e[1] < FLOOR - 2.5) continue;
    if (b.x + e[0] > x0 && b.x - e[0] < x1) on.push(b);
  }
  for (const b of on) heat(b, P * (1 - toWater) / Math.max(1, on.length) * SPEED * dt);
  if (on.length) tell("plate", rg.t("Lämpö siirtyy kosketuksessa: se on johtumista.", "Heat moves where things touch: that is conduction.", "El calor pasa donde las cosas se tocan: es conducción."));
}

// the water: warmed by the plate, it melts the ice in it and cools down;
// at 100 °C it boils away
function waterStep(dt: number) {
  if (water < 0.5) { waterJ = 0; return; }
  const wt = waterTop();
  let T = waterT();
  if (T > 100) {
    const extra = (T - 100) * water * 4.19;
    const boil = Math.min(water, extra / 2260);
    water -= boil;
    waterJ = 100 * water * 4.19;
    if (rg.random() < 0.6) steam(180 + (rg.random() - 0.5) * 110, wt);
    tell("boil", rg.t("Vesi kiehuu 100 °C:ssa ja muuttuu höyryksi.", "Water boils at 100 °C and turns into steam.", "El agua hierve a 100 °C y se convierte en vapor."));
    T = 100;
  }
  for (const b of world.bodies) {
    const ice = iceOf(b);
    if (!ice) continue;
    const e = extent(b);
    const top = b.y - e[1], bot = b.y + e[1];
    if (bot <= wt) continue;
    const f = Math.min(1, (bot - wt) / (bot - top));
    // buoyancy and drag
    b.fy -= f * (b.hw * b.hh * 4) * 1.0 * GRAVITY;
    b.vx *= 1 - Math.min(1, 1.5 * f * dt);
    b.vy *= 1 - Math.min(1, 1.5 * f * dt);
    b.w *= 1 - Math.min(1, 2.5 * f * dt);
    if (b.asleep && f > 0.05 && ice.kind !== "dry") { b.asleep = false; b.still = 0; }
    if (f > 0.3 && FLOOR - wt > 16 && KINDS[ice.kind].rho < 1 && b.vy < 5) tell("float", rg.t("Jää kelluu, koska se on kevyempää kuin vesi.", "Ice floats because it is lighter than water.", "El hielo flota porque pesa menos que el agua."));
    // warm water melts the ice (h·A·ΔT), and loses that heat
    const area = f * 2 * (b.hw * b.hh * 4 + (b.hw + b.hh) * 2 * DEPTH) * 1e-6;
    let q = 250 * area * Math.max(0, T - ice.T);
    if (ice.kind === "dry") { q += 30 * f; if (rg.random() < f * 0.5) fog(b, 1); }
    const J = q * SPEED * dt;
    const fromWater = Math.min(J, waterJ);
    if (fromWater > 0) { waterJ -= fromWater; heat(b, fromWater); energy -= fromWater; }
  }
}

function salt(dt: number) {
  for (const b of world.bodies) {
    const ice = iceOf(b);
    if (!ice || ice.salt <= 0 || ice.kind === "dry") continue;
    const Tm = meltPoint(ice);
    // brine eats into the ice; the heat for it comes out of the ice itself
    const dm = Math.min(ice.g, 0.12 * Math.min(ice.salt, 25) * dt * SPEED / 5);
    const J = dm * L_ICE;
    const cool = J / (ice.g * C_ICE);
    if (ice.T - cool > Tm) ice.T -= cool;
    else ice.T = Math.max(Tm, ice.T - cool * 0.2);
    ice.salt = Math.max(0, ice.salt - dm * 0.08);
    melt(b, ice, dm);
    if (ice.T < -10) tell("saltcold", rg.t("Katso mittaria: suolattu jää kylmenee, vaikka se sulaa!", "Look at the thermometer: salted ice gets colder while it melts!", "Mira el termómetro: ¡el hielo con sal se enfría mientras se derrite!"));
  }
}

// ---- the frame ---------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  if (msgClock > 0) msgClock -= dt;
  if (mode === "done") doneClock += dt;
  if (mode === "menu") return;
  clock += mode === "play" ? dt : 0;
  dt = Math.min(dt, 0.05);

  const ptr = input.pointer;
  if (grab && ptr.down) {
    heater.x = rg.clamp(ptr.x + grabDX, 10, 350);
    heater.y = rg.clamp(ptr.y + grabDY, 60, FLOOR + 10);
  }
  if (grab && !ptr.down) release();

  // the palm follows the finger (it pushes, it is not pushed)
  if (palm) {
    const tx = rg.clamp(ptr.x, 20, 340), ty = rg.clamp(ptr.y - 46, 60, FLOOR - 20);
    const max = 420;
    palm.vx = rg.clamp((tx - palm.x) / STEP, -max, max) * 0.5;
    palm.vy = rg.clamp((ty - palm.y) / STEP, -max, max) * 0.5;
  }

  // heaters
  for (const b of world.bodies) { const ice = iceOf(b); if (ice) ice.heat = 0; }
  const T = TOOLS[tool];
  if (heater.on) {
    const s = source();
    if (tool === "match") {
      heater.life -= dt;
      if (heater.life <= 0) { heater.on = false; heater.burnt = true; rg.sound("pop", { volume: 0.3 }); tell("burnt", rg.t("Tikku paloi loppuun. Napauta, niin saat uuden.", "The match burnt out. Tap for a new one.", "La cerilla se apagó. Toca para otra.")); }
      else flameHeat(T.power, s[0], s[1], T.r, dt);
    } else if (tool === "candle" || tool === "wood" || tool === "stove") {
      flameHeat(T.power, s[0], s[1], T.r, dt);
      if (tool === "wood" && rg.random() < 0.3) puffs.push({ x: s[0] + (rg.random() - 0.5) * 16, y: s[1], vx: (rg.random() - 0.5) * 40, vy: -80 - rg.random() * 60, t: 0, life: 0.6 + rg.random() * 0.4, s: 3, kind: 2 });
    } else if (tool === "dryer") {
      jetHeat(T.power, heater.x, heater.y, dryerDir(), dt);
      tell("dryer", rg.t("Puhallin kuljettaa lämpöä ilman mukana: se on kuljettumista.", "A fan carries heat with the air: that is convection.", "El aire lleva el calor: eso es convección."));
    } else if (tool === "lens") {
      lensHeat(s[0], s[1], dt);
    }
  }
  if (tool === "salt" && grab && ptr.down && rg.random() < 0.7 && grains.length < 60) {
    grains.push({ x: heater.x + (rg.random() - 0.5) * 8, y: heater.y + 14, vx: (rg.random() - 0.5) * 30, vy: 40 });
  }
  if (palm) {
    const n = contactHeat(palm, T.power * handT / 34, handT, dt);
    if (n > 0) handT -= dt * 2.4 * Math.min(2, n);
    if (handT < 14) {
      handFrozen = true;
      remove(world, palm);
      palm = null;
      rg.sound("lose", { volume: 0.5 });
      rg.vibrate([60, 40, 60]);
      rg.say("ll_kasi");
      msg = rg.t("Kämmen jäätyi! Odota, että käsi lämpenee.", "Your palm froze! Wait for the hand to warm up.", "¡Se te congeló la mano! Espera a que se caliente.");
      msgClock = 4;
    }
  } else {
    handT = Math.min(34, handT + dt * 3);
    if (handFrozen && handT >= 30) handFrozen = false;
  }
  plateHeat(dt);
  waterStep(dt);
  salt(dt);
  // the room's air (20 °C) warms everything a little
  for (const b of world.bodies) {
    const ice = iceOf(b);
    if (!ice || b.dead) continue;
    heat(b, 0.004 * (b.hw + b.hh) * 2 * Math.max(0, 20 - ice.T) / 20 * SPEED * dt);
    // thermal shock: very cold ice heated fast cracks
    if (ice.heat > 0 && ice.kind !== "snow" && ice.T < -12) {
      const perG = ice.heat / dt / SPEED / ice.g;
      if (perG > 4 && rg.random() < dt * 2.5) {
        tell("shock", rg.t("Lämpöshokki! Kylmä jää halkeaa, kun sitä lämmittää nopeasti.", "Thermal shock! Cold ice cracks when it is heated fast.", "¡Choque térmico! El hielo frío se agrieta si se calienta rápido."));
        if (!b.dead) crack(b, ice);
      }
    }
  }
  for (const b of world.bodies) {
    const ice = iceOf(b);
    if (!ice) continue;
    const rate = ice.heat / dt / SPEED / Math.max(1, ice.g);
    ice.glow += (Math.min(0.45, rate * 0.06) - ice.glow) * Math.min(1, dt * 6);
  }
  // the block heated most is the one on the thermometer
  let hot: Body | null = null, hotJ = 0;
  for (const b of world.bodies) { const ice = iceOf(b); if (ice && !b.dead && ice.heat > hotJ) { hotJ = ice.heat; hot = b; } }
  if (hot && hotJ / dt > 2) { focus = hot; focusHeat = 0.6; }
  else focusHeat = Math.max(0, focusHeat - dt);
  if (focus && focus.dead) focus = null;

  // physics
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 2) { step(world, STEP); acc -= STEP; n++; }
  if (acc > STEP) acc = 0;
  for (const b of world.bodies) if (b.y > height + 100) remove(world, b);

  particles(dt);
}

function lensHeat(sx: number, sy: number, dt: number) {
  for (const b of world.bodies) {
    if (b.dead || !inside(b, sx, sy, 0)) continue;
    const ice = iceOf(b);
    if (!ice) continue;
    let a = KINDS[ice.kind].absorb;
    if (ice.treasure) {
      const c = Math.cos(b.a), s = Math.sin(b.a);
      const gx = b.x + c * ice.tx - s * ice.ty, gy = b.y + s * ice.tx + c * ice.ty;
      if (Math.abs(gx - sx) < 16 && Math.abs(gy - sy) < 16) {
        a = 1;
        tell("dark", rg.t("Tumma esine imee valon ja lämpenee, kirkas jää ei.", "A dark object soaks up the light and warms up; clear ice does not.", "Un objeto oscuro absorbe la luz y se calienta; el hielo claro no."));
      }
    }
    heat(b, TOOLS.lens.power * a * 4 * SPEED * dt);
    return;
  }
}

function dryerDir() { return heater.x < 190 ? 1 : -1; }

function particles(dt: number) {
  const wt = waterTop();
  for (const d of drops) {
    d.vy += GRAVITY * 0.6 * dt;
    d.y += d.vy * dt;
    if (d.y >= wt - 1) {
      addWater(d.g);
      d.g = 0;
      if (plateT > 110 && Math.abs(d.x - 180) < 60 && water < 5) { sizzle += 1; steam(d.x, FLOOR - 4); }
      else if (rg.random() < 0.15) rg.sound("tick", { volume: 0.12, pitch: 1.8 + rg.random() * 0.6 });
    }
  }
  drops = drops.filter((d) => d.g > 0);
  // water on the hot plate with no pool yet sizzles away
  if (plateT > 110 && water > 0 && water < 5) {
    const ev = Math.min(water, dt * (plateT - 100) / 60);
    water -= ev;
    if (rg.random() < 0.3) steam(180 + (rg.random() - 0.5) * 100, FLOOR - 4);
    if (sizzle > 0 || rg.random() < dt) { rg.sound("whoosh", { volume: 0.15, pitch: 0.5 }); sizzle = 0; }
  }
  for (const p of puffs) {
    p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 0) {
      // carbon dioxide is heavier than air: the fog sinks and spreads on the floor
      p.vy += 20 * dt;
      if (p.y > FLOOR - 8) { p.y = FLOOR - 8; p.vy = 0; p.vx += (p.vx >= 0 ? 1 : -1) * 15 * dt; }
    } else if (p.kind === 2) p.vy += 120 * dt;
  }
  puffs = puffs.filter((p) => p.t < p.life);
  for (const g of grains) {
    g.vy += GRAVITY * 0.7 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt;
    for (const b of world.bodies) {
      const ice = iceOf(b);
      if (!ice || b.dead || !inside(b, g.x, g.y, 1)) continue;
      if (ice.kind !== "dry") { ice.salt += 1; if (focus === null || focusHeat <= 0) focus = b; }
      g.y = 9999;
      tell("salt", TOOLS.salt.tip[rg.langs.indexOf(rg.lang)] || TOOLS.salt.tip[0]);
      break;
    }
  }
  grains = grains.filter((g) => g.y < wt);
  for (const s of shards) { s.t += dt; s.vy += GRAVITY * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
  shards = shards.filter((s) => s.t < 0.6);
}

// ---- input -------------------------------------------------------------------

function inScene(y: number) { return y > 54 && y < toolbarTop() - 40; }

function onPointerDown(x: number, y: number) {
  if (mode === "menu") return;
  if (mode === "done") return;
  if (!inScene(y)) return;
  if (tool === "palm") {
    if (handFrozen) { rg.sound("tick"); return; }
    palm = addBox(world, rg.clamp(x, 20, 340), rg.clamp(y - 46, 60, FLOOR - 20), 40, 44, 0, null);
    palm.kinematic = true;
    palm.friction = 0.5;
    wake(world);
    return;
  }
  grab = true;
  // the finger holds the heater's handle, below the flame (or beside the jet)
  const off = tool === "lens" ? [0, -110] : tool === "dryer" ? [0, -34] : tool === "salt" ? [0, -56] : [0, -54];
  grabDX = off[0]; grabDY = off[1];
  heater.x = rg.clamp(x + grabDX, 10, 350);
  heater.y = rg.clamp(y + grabDY, 60, FLOOR + 10);
  if (tool === "match" && !heater.on) {
    heater.on = true; heater.burnt = false; heater.life = 8; matches++;
    rg.sound("whoosh", { pitch: 2.2, volume: 0.5 });
  } else if (tool !== "salt" && !heater.on) {
    heater.on = true;
    rg.sound(tool === "stove" ? "whoosh" : "pop", { volume: 0.4 });
  }
}

function onPointerUp() { release(); }

function release() {
  grab = false;
  if (palm) { remove(world, palm); palm = null; }
}

function pickTool(k: Tool) {
  rg.sound("click");
  if (k === tool) {
    // the same button again puts the heater out
    if (heater.on && k !== "salt") { heater.on = false; return; }
    return;
  }
  tool = k;
  heater.on = false;
  heater.burnt = false;
  if (palm) { remove(world, palm); palm = null; }
  if (k === "palm" && handFrozen) { msg = rg.t("Käsi on vielä kylmä. Odota hetki.", "The hand is still cold. Wait a moment.", "La mano sigue fría. Espera un poco."); msgClock = 2.5; }
}

function togglePlate() {
  plateOn = !plateOn;
  rg.sound(plateOn ? "note" : "click", { pitch: plateOn ? 1.4 : 1 });
  if (plateOn) tell("plateon", rg.t("Hellanlevy lämpenee hitaasti. Työnnä jäätä levylle kämmenellä!", "The hotplate warms up slowly. Push ice onto it with your palm!", "El hornillo se calienta despacio. ¡Empuja hielo encima con la mano!"));
}

function onKeyDown(key: string) {
  if (mode === "menu" && (key === " " || key === "Enter")) startLevel(0);
}

function onBack() {
  if (mode === "menu") rg.exit();
  else { mode = "menu"; release(); }
}

function onClose() {
  if (mode !== "menu") { mode = "menu"; release(); return false; }
  return true;
}

// ---- drawing -----------------------------------------------------------------

function L3(a: string[]) { return a[rg.langs.indexOf(rg.lang)] || a[0]; }

function deg(a: number) { return Math.round(a * 1800 / Math.PI) / 10; }

function fmtT(T: number) { return (T < -0.05 ? "−" : "") + Math.abs(T).toFixed(Math.abs(T) < 10 ? 1 : 0) + " °C"; }

// the colour of each kind of ice, and what it turns towards when it warms
const ICE_RGBA: { [k: string]: number[] } = {
  ice: [168, 220, 248, 0.62], snow: [243, 247, 252, 1], blue: [80, 158, 225, 0.78], dry: [223, 230, 234, 1],
};
const HOT = [255, 150, 70];

// One element a block (and one for its treasure, one for a crack): EVG lays
// out every element every frame, so the ice is drawn with few of them.
function IceView(b: Body) {
  const ice = b.data as Ice;
  const W = b.hw * 2, H = b.hh * 2;
  const m = Math.min(1, ice.melted / Math.max(0.01, ice.g0 * KINDS[ice.kind].crack));
  const r = Math.min(W, H) * (0.08 + 0.35 * m);
  const melting = ice.T >= meltPoint(ice) - 0.05 && ice.kind !== "dry" && ice.melted > 0.05;
  const c = ICE_RGBA[ice.kind];
  const k = ice.glow;
  const col = "rgba(" + Math.round(c[0] + (HOT[0] - c[0]) * k) + "," + Math.round(c[1] + (HOT[1] - c[1]) * k) + "," +
    Math.round(c[2] + (HOT[2] - c[2]) * k) + "," + Math.min(1, c[3] + k * 0.3).toFixed(2) + ")";
  const shine = "linear-gradient(160deg, rgba(255,255,255,0.75), " + col + " 38%, " + col + ")";
  const kids: any[] = [];
  if (ice.treasure) kids.push(<div className="gem in" style={{ left: b.hw + ice.tx - 15, top: b.hh + ice.ty - 17 }}>{ice.treasure}</div>);
  // a crack shows the ice starting to give
  if (m > 0.45 && W > 16 && H > 16) {
    const s = ice.seed;
    kids.push(<div className="crack" style={{ left: W * (0.3 + (s % 40) / 100), top: H * 0.12, height: H * 0.6 * m, transform: "rotate(" + ((s % 50) - 25) + "deg)" }} />);
  }
  // salt crust on top
  if (ice.salt > 0.5) kids.push(<div className="salt" style={{ width: W - 6, opacity: Math.min(1, 0.3 + ice.salt / 12) }} />);
  return (
    <div className={"ice " + ice.kind + (melting ? " wet" : "")} style={{ left: b.x - b.hw, top: b.y - b.hh, width: W, height: H, borderRadius: r,
      background: shine, transform: "rotate(" + deg(b.a) + "deg)" }}>
      {kids}
    </div>
  );
}

function GemView(b: Body) {
  const g = b.data as Gem;
  const pop = Math.max(0, 1 - (t - g.freed) * 2);
  return (
    <div className="gem free" style={{ left: b.x - 15, top: b.y - 17, fontSize: 24 + pop * 10, transform: "rotate(" + deg(b.a) + "deg)" }}>{g.treasure}</div>
  );
}

function Flame(x: number, y: number, size: number, blue: boolean) {
  const f = 1 + Math.sin(t * 23 + x) * 0.08 + Math.sin(t * 37) * 0.06;
  const h = size * 2 * f, w = size * 1.1;
  if (blue) {
    return (
      <div className="flame" style={{ left: x - w, top: y - h, width: w * 2, height: h }}>
        <div className="fl blue1" style={{ left: 0, top: 0, width: w * 2, height: h, borderRadius: w }} />
        <div className="fl blue2" style={{ left: w * 0.45, top: h * 0.35, width: w * 1.1, height: h * 0.65, borderRadius: w * 0.55 }} />
      </div>
    );
  }
  return (
    <div className="flame" style={{ left: x - w / 2, top: y - h, width: w, height: h }}>
      <div className="fl outer" style={{ left: 0, top: 0, width: w, height: h, borderRadius: w / 2 }} />
      <div className="fl mid" style={{ left: w * 0.18, top: h * 0.3, width: w * 0.64, height: h * 0.7, borderRadius: w * 0.32 }} />
      <div className="fl core" style={{ left: w * 0.33, top: h * 0.6, width: w * 0.34, height: h * 0.4, borderRadius: w * 0.17 }} />
    </div>
  );
}

function HeaterView() {
  const x = heater.x, y = heater.y;
  const on = heater.on;
  if (tool === "match") {
    return (
      <div className="layer">
        <div className="stick" style={{ left: x - 2, top: y, height: 50, backgroundColor: heater.burnt ? "#3a2a1a" : "#e9c46a" }} />
        <div className="mhead" style={{ left: x - 4, top: y - 4, backgroundColor: heater.burnt ? "#222" : on ? "#5a1a0a" : "#d62828" }} />
        {on ? Flame(x, y - 2, 8 * Math.min(1, heater.life / 2 + 0.4), false) : null}
      </div>
    );
  }
  if (tool === "candle") {
    return (
      <div className="layer">
        <div className="candle" style={{ left: x - 9, top: y + 6, height: 46 }} />
        <div className="wick" style={{ left: x - 1, top: y }} />
        {on ? Flame(x, y + 1, 9, false) : null}
      </div>
    );
  }
  if (tool === "wood") {
    return (
      <div className="layer">
        <div className="log" style={{ left: x - 7, top: y - 6, transform: "rotate(14deg)" }} />
        {on ? Flame(x, y + 2, 20, false) : null}
      </div>
    );
  }
  if (tool === "stove") {
    return (
      <div className="layer">
        <div className="burner" style={{ left: x - 18, top: y }} />
        <div className="canister" style={{ left: x - 22, top: y + 8 }}><div className="label">GAS</div></div>
        {on ? Flame(x, y + 1, 15, true) : null}
      </div>
    );
  }
  if (tool === "dryer") {
    const d = dryerDir();
    const kids: any[] = [];
    if (on) for (let i = 0; i < 4; i++) {
      const k = ((t * 2.2 + i / 4) % 1);
      kids.push(<div className="air" style={{ left: d > 0 ? x + k * 150 : x - 30 - k * 150, top: y - 6 + Math.sin(t * 9 + i) * (4 + k * 14), width: 30, opacity: 0.6 * (1 - k) }} />);
    }
    return (
      <div className="layer">
        {kids}
        <div className="dbody" style={{ left: d > 0 ? x - 58 : x + 8, top: y - 16 }} />
        <div className="nozzle" style={{ left: d > 0 ? x - 10 : x, top: y - 9 }} />
        <div className="handle" style={{ left: d > 0 ? x - 46 : x + 26, top: y + 10 }} />
      </div>
    );
  }
  if (tool === "lens") {
    const pulse = 0.8 + Math.sin(t * 12) * 0.2;
    return (
      <div className="layer">
        <div className="beam" style={{ left: x - 26, top: 66, height: Math.max(0, y - 22 - 66) }} />
        {on ? <div className="beam2" style={{ left: x - 26, top: y + 4, height: 34 }} /> : null}
        <div className="lens" style={{ left: x - 30, top: y - 30 }} />
        <div className="lhandle" style={{ left: x - 4, top: y + 28 }} />
        {on ? <div className="spot" style={{ left: x - 5 * pulse, top: y + 40 - 5 * pulse, width: 10 * pulse, height: 10 * pulse, borderRadius: 5 * pulse }} /> : null}
      </div>
    );
  }
  if (tool === "salt") {
    return <div className="layer"><div className="emoji" style={{ left: x - 18, top: y - 20, fontSize: 34, transform: grab ? "rotate(160deg)" : "rotate(0deg)" }}>🧂</div></div>;
  }
  return null;
}

function PalmView() {
  if (!palm) return null;
  const cold = 1 - (handT - 14) / 20;
  return (
    <div className="layer">
      <div className="emoji" style={{ left: palm.x - 26, top: palm.y - 30, fontSize: 48 }}>✋</div>
      <div className="frostpalm" style={{ left: palm.x - 22, top: palm.y - 22, opacity: Math.max(0, Math.min(0.7, cold)) }} />
    </div>
  );
}

function Thermo() {
  const ice = focus ? iceOf(focus) : null;
  const T = ice ? ice.T : waterT();
  const label = ice ? L3(KINDS[ice.kind].name) : rg.t("Vesi", "Water", "Agua");
  const top = 64, h = Math.max(110, Math.min(190, FLOOR - 150 - top));
  const lo = -40, hi = 60;
  const k = rg.clamp((T - lo) / (hi - lo), 0, 1);
  const zero = (0 - lo) / (hi - lo);
  return (
    <div className="thermo" style={{ left: 8, top }}>
      <div className="tlabel">{label}</div>
      <div className="tval" style={{ color: T < -0.05 ? "#4cc9f0" : T > 0.05 ? "#ff6b6b" : "#ffffff" }}>{fmtT(T)}</div>
      <div className="tube" style={{ height: h }}>
        <div className="merc" style={{ top: h * (1 - k), height: h * k }} />
        <div className="zero" style={{ top: h * (1 - zero) }} />
      </div>
      <div className="bulb" />
      <div className="t0" style={{ top: 44 + h * (1 - zero) - 7 }}>0°</div>
      {T < lo ? <div className="tdry">⬇</div> : null}
    </div>
  );
}

function Tray() {
  const wt = waterTop();
  const glow = Math.max(0, Math.min(1, (plateT - 40) / 300));
  const wT = waterT();
  return (
    <div className="layer">
      <div className="table" style={{ top: FLOOR + 14 }} />
      <div className="trayfloor" style={{ left: TRAY_L - 10, top: FLOOR, width: TRAY_R - TRAY_L + 20 }} />
      <div className="plate" style={{ left: 120, top: FLOOR, width: 120 }}>
        <div className="platehot" style={{ opacity: glow }} />
        <div className="ring" style={{ opacity: 0.4 + glow * 0.6 }} />
      </div>
      <div className="rim" style={{ left: TRAY_L - 10, top: FLOOR - 48 }} />
      <div className="rim" style={{ left: TRAY_R, top: FLOOR - 48 }} />
      {water > 0.3 ? <div className="water" style={{ left: TRAY_L, top: wt, width: TRAY_R - TRAY_L, height: FLOOR - wt + 1,
        backgroundColor: "rgba(" + Math.round(70 + Math.min(1, wT / 80) * 120) + ",150,240,0.42)" }}><div className="surface" /></div> : null}
    </div>
  );
}

function Fx() {
  const out: any[] = [];
  for (const d of drops) out.push(<div className="drop" style={{ left: d.x - 2.5, top: d.y - 4 }} />);
  for (const g of grains) out.push(<div className="grain" style={{ left: g.x - 1.5, top: g.y - 1.5 }} />);
  for (const s of shards) out.push(<div className="shard" style={{ left: s.x, top: s.y, width: s.s, height: s.s, opacity: 1 - s.t / 0.6 }} />);
  for (const p of puffs) {
    const a = Math.min(1, p.t * 4) * (1 - p.t / p.life);
    if (p.kind === 2) out.push(<div className="spark" style={{ left: p.x, top: p.y, opacity: a }} />);
    else {
      const s = p.s * (1 + p.t * 0.6);
      out.push(<div className={p.kind === 0 ? "fog" : "steam"} style={{ left: p.x - s / 2, top: p.y - s / 2, width: s, height: s, borderRadius: s / 2, opacity: a * 0.7 }} />);
    }
  }
  return <div className="layer">{out}</div>;
}

function Hud() {
  const L = LEVELS[level];
  return (
    <div className="hud">
      <div className="lname">{rg.t(L.name, L.en, L.es)}</div>
      <div className="stats">
        {gems > 0 ? <div className="pill">🎁 {freed}/{gems}</div> : null}
        <div className="pill">⏱ {Math.floor(clock)} s</div>
        <div className="pill">⚡ {(energy / 1000).toFixed(energy < 10000 ? 1 : 0)} kJ</div>
      </div>
    </div>
  );
}

function ToolButton(k: Tool) {
  const T = TOOLS[k];
  const sel = tool === k;
  const on = sel && (heater.on || k === "salt" || k === "palm");
  let badge = "";
  if (k === "palm") badge = handFrozen ? "🥶" : "";
  if (k === "match" && matches > 0) badge = String(matches);
  return (
    <div className={"tool" + (sel ? " sel" : "") + (on ? " on" : "")} onPointerDown={() => pickTool(k)}>
      <div className="ticon">{k === "palm" && handFrozen ? "🥶" : T.icon}</div>
      {badge && k === "match" ? <div className="badge">{badge}</div> : null}
    </div>
  );
}

function Info() {
  const T = TOOLS[tool];
  let line = "";
  if (msgClock > 0) line = msg;
  else line = L3(T.tip);
  let head = L3(T.name);
  if (T.power > 0) head += " · " + T.power + " W";
  if (tool === "palm") head += " · " + Math.round(handT) + " °C";
  if (tool === "match" && heater.on) head += " · " + Math.ceil(heater.life) + " s";
  return (
    <div className="info" style={{ top: toolbarTop() - 44 }}>
      <div className="ihead">{head}<div className="speed">⏩ {SPEED}×</div></div>
      <div className={"itip" + (msgClock > 0 ? " news" : "")}>{line}</div>
    </div>
  );
}

function Toolbar() {
  const free = LEVELS[level].id === "leikki";
  return (
    <div className="toolbar" style={{ top: toolbarTop() }}>
      <div className="row">{ROW1.map((k) => ToolButton(k))}</div>
      <div className="row">
        {ROW2.map((k) => ToolButton(k))}
        <div className={"tool plateb" + (plateOn ? " on" : "")} onPointerDown={togglePlate}>
          <div className="ticon">{plateOn ? "♨️" : "⭕"}</div>
          <div className="tname">{rg.t("Hella", "Hotplate", "Hornillo")} {Math.round(plateT)}°</div>
        </div>
        {free
          ? <div className="tool util" onPointerDown={() => dropIce(false)}><div className="ticon">🧊➕</div></div>
          : <div className="tool util" onPointerDown={() => startLevel(level)}><div className="ticon">↺</div></div>}
      </div>
    </div>
  );
}

function Done() {
  const L = LEVELS[level];
  const last = level + 1 >= LEVELS.length - 1;
  return (
    <div className="overlay">
      <div className="card">
        <div className="big">{rg.t("Aarteet vapaana!", "Treasures free!", "¡Tesoros libres!")}</div>
        <div className="result">⏱ {Math.round(clock)} s   ⚡ {(energy / 1000).toFixed(0)} kJ</div>
        {best[L.id] ? <div className="hint">{rg.t("Paras aika", "Best time", "Mejor tiempo")}: {best[L.id]} s</div> : null}
        {doneClock > 0.8 ? <div className="buttons">
          <div className="btn alt" onClick={() => { mode = "play"; }}>{rg.t("Sulata lisää", "Keep melting", "Seguir")}</div>
          <div className="btn" onClick={() => startLevel(last ? LEVELS.length - 1 : level + 1)}>{last ? rg.t("Vapaa leikki ▶", "Free play ▶", "Juego libre ▶") : rg.t("Seuraava ▶", "Next ▶", "Siguiente ▶")}</div>
        </div> : null}
      </div>
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2) * 4;
  return (
    <div className="screen menu">
      <div className="mtitle" style={{ marginTop: 56 + bob }}>🧊 {rg.t("Lämpölabra", "Heat Lab", "Laboratorio de calor")}</div>
      <div className="msub">{rg.t("Sulata jää ja vapauta jäätyneet aarteet!", "Melt the ice and free the frozen treasures!", "¡Derrite el hielo y libera los tesoros congelados!")}</div>
      <div className="levels">
        {LEVELS.map((L, i) => (
          <div className={"lvl" + (L.id === "leikki" ? " play" : "")} onClick={() => startLevel(i)}>
            <div className="lvlicon">{L.blocks.filter((b) => b.t).map((b) => b.t).join("") || "🧊🧂🔥"}</div>
            <div className="lvlname">{rg.t(L.name, L.en, L.es)}</div>
            {best[L.id] ? <div className="lvlbest">✓ {best[L.id]} s</div> : null}
          </div>
        ))}
      </div>
      <div className="mlearn">{rg.t("Opitaan: lämpötila, olomuodot ja lämpöenergian siirtyminen.", "Learn: temperature, states of matter and how heat moves.", "Aprende: temperatura, estados de la materia y cómo se mueve el calor.")}</div>
    </div>
  );
}

function view() {
  if (mode === "menu") return Menu();
  const ices: any[] = [];
  const gemsV: any[] = [];
  for (const b of world.bodies) {
    if (b.dead || !b.data) continue;
    if (b.data.ice) ices.push(IceView(b));
    else gemsV.push(GemView(b));
  }
  return (
    <div className="screen lab">
      <div className="wall" />
      {tool === "lens" ? <div className="sun" style={{ left: heater.x - 26 }}>☀️</div> : null}
      {Tray()}
      {ices}
      {gemsV}
      {Fx()}
      {HeaterView()}
      {PalmView()}
      {Thermo()}
      {Hud()}
      {Info()}
      {Toolbar()}
      {mode === "done" ? Done() : null}
    </div>
  );
}
