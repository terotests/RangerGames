// Vesiputket – guide water and sand where they are needed. The play field is
// a grid of 8 px cells (a "falling sand" simulation): sand and water fall,
// slide down slopes, and water also spreads sideways and finds its level.
// Sand is heavier than water and sinks through it. Water puts out fire,
// drains swallow water, and earth, rock, pots and boxes stay where they are.
//
// The player digs earth and sand away (⛏️), builds pipe walls (🧱), pours
// sand (🏖️) and opens the tap. The tank holds only so much water (or sand),
// so it has to go to the right place: a flower to water, a campfire to put
// out, a pool to fill for the duck, a sandbox to fill.

type Tool = "dig" | "pipe" | "sand" | "water" | "fire";
type GoalKind = "flower" | "fire" | "pool" | "box";
type Goal = { kind: GoalKind; x: number; y: number; w: number; h: number; need: number; have: number };
type Level = {
  id: string; icon: string; name: string; text: string; say: string;
  src: number[]; srcKind: number; tank: number; tools: Tool[]; budget: { [k: string]: number };
  build: () => void; goals: Goal[]; ghost?: number[];
};
type Steam = { x: number; y: number; t: number };
type Mode = "menu" | "play" | "done";

const W = 44, H = 56, C = 8;
const FX = 4, FY = 54;
const SIM_DT = 1 / 40;

// materials
const E = 0, ROCK = 1, EARTH = 2, SAND = 3, WATER = 4, PIPE = 5, FIRE = 6, DRAIN = 7, POT = 8, WOOD = 9;
const COLOR = ["", "#6c757d", "#9c6644", "#e9c46a", "#3a86ff", "#8d99ae", "#ff6b35", "#22223b", "#c8553d", "#8b5a2b"];

let g = new Uint8Array(W * H);
let st = new Uint8Array(W * H);
let stamp = 1;

let mode: Mode = "menu";
let t = 0;
let lvIndex = 0;
let L: Level;
let tool: Tool = "dig";
let left: { [k: string]: number } = {};
let tank = 0;
let open = false;
let acc = 0;
let steps = 0;
let painting = false;
let lastCX = -1, lastCY = -1;
let steam: Steam[] = [];
let msg = "";
let msgT = 0;
let doneT = 0;
let won = false;
let emptyT = 0;
let hiss = 0;
let done: boolean[] = rg.load("vp_done", []);

function fill(x: number, y: number, w: number, h: number, m: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && i < W && j >= 0 && j < H) g[j * W + i] = m;
}
function goal(kind: GoalKind, x: number, y: number, w: number, h: number, need: number): Goal {
  return { kind: kind, x: x, y: y, w: w, h: h, need: need, have: 0 };
}

const LEVELS: Level[] = [
  { id: "kukka", icon: "🌷", name: rg.t("Kastele kukka", "Water the flower", "Riega la flor"),
    text: rg.t("Kaiva tunneli mäen läpi ⛏️ ja avaa hana 🚰", "Dig a tunnel through the hill ⛏️ and open the tap 🚰", "Cava un túnel por la colina ⛏️ y abre el grifo 🚰"),
    say: "vp_kukka", src: [8, 2], srcKind: WATER, tank: 450, tools: ["dig"], budget: {},
    build: () => {
      fill(0, 20, 44, 36, EARTH); fill(20, 0, 6, 20, EARTH); 
      fill(31, 20, 9, 27, E); fill(30, 30, 1, 18, POT); fill(40, 30, 1, 18, POT); fill(30, 47, 11, 1, POT);
    },
    goals: [] },
  { id: "nuotio", icon: "🔥", name: rg.t("Sammuta nuotio", "Put out the campfire", "Apaga la fogata"),
    text: rg.t("Kaiva vedelle reitti kiven ohi nuotiolle", "Dig a way for the water past the rock to the fire", "Cava un camino para el agua hasta el fuego"),
    say: "vp_nuotio", src: [37, 2], srcKind: WATER, tank: 420, tools: ["dig"], budget: {},
    build: () => {
      fill(0, 14, 44, 42, EARTH); fill(4, 26, 30, 3, ROCK);
      fill(6, 36, 20, 12, E); fill(11, 46, 10, 1, WOOD); fill(12, 42, 8, 4, FIRE); fill(6, 48, 20, 1, ROCK);
    },
    goals: [] },
  { id: "allas", icon: "🦆", name: rg.t("Ankan uima-allas", "The duck's pool", "La piscina del pato"),
    text: rg.t("Rakenna putki 🧱 rotkon yli, niin vesi pääsee altaaseen", "Build a pipe 🧱 over the gap so the water reaches the pool", "Construye una tubería 🧱 sobre el hueco hasta la piscina"),
    say: "vp_allas", src: [5, 2], srcKind: WATER, tank: 420, tools: ["pipe", "dig"], budget: { pipe: 60 },
    build: () => {
      fill(0, 22, 14, 34, EARTH); fill(14, 54, 14, 2, DRAIN);
      fill(28, 34, 16, 22, ROCK); fill(28, 22, 2, 12, ROCK); fill(42, 22, 2, 12, ROCK);
    },
    goals: [], ghost: [14, 22, 14, 1] },
  { id: "hiekka", icon: "🏰", name: rg.t("Hiekkalaatikko", "The sandbox", "El arenero"),
    text: rg.t("Kaiva hyllyihin reiät, niin hiekka valuu laatikkoon", "Dig holes in the shelves so the sand pours into the box", "Haz agujeros en los estantes para que la arena caiga en la caja"),
    say: "vp_hiekka", src: [30, 2], srcKind: SAND, tank: 320, tools: ["dig"], budget: {},
    build: () => {
      fill(14, 12, 30, 3, EARTH); fill(0, 26, 44, 3, EARTH); fill(28, 26, 7, 3, ROCK); fill(0, 54, 44, 2, EARTH);
      fill(24, 44, 1, 10, WOOD); fill(38, 44, 1, 10, WOOD); fill(24, 53, 15, 1, WOOD);
    },
    goals: [] },
  { id: "kaksi", icon: "🌻", name: rg.t("Kaksi kukkaa", "Two flowers", "Dos flores"),
    text: rg.t("Molemmat kukat tarvitsevat vettä!", "Both flowers need water!", "¡Las dos flores necesitan agua!"),
    say: "vp_kaksi", src: [21, 2], srcKind: WATER, tank: 480, tools: ["dig", "pipe"], budget: { pipe: 40 },
    build: () => {
      fill(0, 16, 44, 40, EARTH); fill(16, 12, 12, 4, ROCK); fill(0, 28, 15, 2, ROCK); fill(29, 28, 15, 2, ROCK);
      fill(3, 34, 8, 9, E); fill(2, 34, 1, 10, POT); fill(11, 34, 1, 10, POT); fill(2, 43, 10, 1, POT);
      fill(33, 34, 8, 9, E); fill(32, 34, 1, 10, POT); fill(41, 34, 1, 10, POT); fill(32, 43, 10, 1, POT);
    },
    goals: [] },
  { id: "silta", icon: "🌉", name: rg.t("Hiekkasilta", "Sand bridge", "Puente de arena"),
    text: rg.t("Täytä kuoppa hiekalla 🏖️, niin vesi pääsee kukalle", "Fill the pit with sand 🏖️ so the water reaches the flower", "Llena el hoyo con arena 🏖️ para que el agua llegue a la flor"),
    say: "vp_silta", src: [5, 2], srcKind: WATER, tank: 420, tools: ["sand"], budget: { sand: 90 },
    build: () => {
      fill(0, 30, 44, 26, EARTH); fill(16, 30, 7, 8, E); fill(16, 37, 7, 1, DRAIN);
      fill(30, 30, 1, 11, POT); fill(39, 30, 1, 11, POT); fill(30, 40, 10, 1, POT); fill(31, 30, 8, 10, E);
    },
    goals: [] },
  { id: "leikki", icon: "🧪", name: rg.t("Vapaa leikki", "Free play", "Juego libre"),
    text: rg.t("Kokeile vettä, hiekkaa, putkia ja tulta!", "Try water, sand, pipes and fire!", "¡Prueba agua, arena, tuberías y fuego!"),
    say: "vp_leikki", src: [22, 2], srcKind: WATER, tank: -1, tools: ["water", "sand", "dig", "pipe", "fire"], budget: {},
    build: () => { fill(0, 48, 44, 8, EARTH); fill(0, 47, 6, 1, EARTH); fill(36, 46, 8, 2, EARTH); },
    goals: [] },
];

function goalsFor(id: string): Goal[] {
  if (id === "kukka") return [goal("flower", 31, 30, 9, 17, 70)];
  if (id === "nuotio") return [goal("fire", 12, 42, 8, 4, 32)];
  if (id === "allas") return [goal("pool", 30, 22, 12, 12, 90)];
  if (id === "hiekka") return [goal("box", 25, 44, 13, 9, 90)];
  if (id === "kaksi") return [goal("flower", 3, 34, 8, 9, 50), goal("flower", 33, 34, 8, 9, 50)];
  if (id === "silta") return [goal("flower", 31, 30, 8, 10, 60)];
  return [];
}

// ---- the simulation ------------------------------------------------------------

function at(x: number, y: number) { return x < 0 || x >= W || y < 0 || y >= H ? ROCK : g[y * W + x]; }

function move(a: number, b: number) {
  const m = g[a];
  g[a] = g[b];
  g[b] = m;
  st[a] = stamp;
  st[b] = stamp;
}

function puff(x: number, y: number) {
  if (steam.length < 40) steam.push({ x: FX + x * C + 4, y: FY + y * C + 4, t: 0 });
}

function stepSand(x: number, y: number, i: number) {
  if (y === H - 1) return;
  const b = g[i + W];
  if (b === E || b === WATER) { move(i, i + W); return; }
  const d = ((x + steps) & 1) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const dx = k === 0 ? d : -d;
    const nx = x + dx;
    if (nx < 0 || nx >= W) continue;
    const s = g[i + dx], n = g[i + W + dx];
    if ((n === E || n === WATER) && (s === E || s === WATER)) { move(i, i + W + dx); return; }
  }
}

function stepWater(x: number, y: number, i: number) {
  // water next to fire: both turn into steam
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (at(nx, ny) === FIRE) {
      g[ny * W + nx] = E; g[i] = E; puff(nx, ny); hiss++;
      return;
    }
  }
  const bottom = y === H - 1;
  const b = bottom ? ROCK : g[i + W];
  if (b === DRAIN) { g[i] = E; return; }
  if (b === E) { move(i, i + W); return; }
  const d = ((x + y + steps) & 1) ? 1 : -1;
  if (!bottom) for (let k = 0; k < 2; k++) {
    const dx = k === 0 ? d : -d;
    const nx = x + dx;
    if (nx < 0 || nx >= W) continue;
    if (g[i + dx] === E && g[i + W + dx] === E) { move(i, i + W + dx); return; }
  }
  // spread sideways, up to three cells, to find the level
  for (let k = 0; k < 2; k++) {
    const dx = k === 0 ? d : -d;
    let to = -1;
    for (let s = 1; s <= 3; s++) {
      const nx = x + dx * s;
      if (nx < 0 || nx >= W || g[i + dx * s] !== E) break;
      to = i + dx * s;
      if (!bottom && g[to + W] === E) break;
    }
    if (to >= 0) { move(i, to); return; }
  }
}

function step() {
  steps++;
  stamp = stamp === 255 ? 1 : stamp + 1;
  // the tap
  if (open && (tank !== 0)) {
    const sx = L.src[0] + (steps & 1), sy = L.src[1] + 1;
    const si = sy * W + sx;
    if (g[si] === E) { g[si] = L.srcKind; if (tank > 0) tank--; }
  }
  const ltr = (steps & 1) === 0;
  for (let y = H - 1; y >= 0; y--) {
    const row = y * W;
    for (let n = 0; n < W; n++) {
      const x = ltr ? n : W - 1 - n;
      const i = row + x;
      const m = g[i];
      if (m !== SAND && m !== WATER) continue;
      if (st[i] === stamp) continue;
      if (m === SAND) stepSand(x, y, i); else stepWater(x, y, i);
    }
  }
  // the goals
  for (const k of L.goals) {
    if (k.kind === "flower") {
      for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++) {
        const i = y * W + x;
        if (g[i] === WATER) { g[i] = E; if (k.have < k.need) k.have++; }
      }
    } else if (k.kind === "fire") {
      let n = 0;
      for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++) if (g[y * W + x] === FIRE) n++;
      k.have = k.need - n;
    } else {
      const want = k.kind === "pool" ? WATER : SAND;
      let n = 0;
      for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++) if (g[y * W + x] === want) n++;
      k.have = Math.min(n, k.need);
    }
  }
}

// ---- levels ----------------------------------------------------------------------

function startLevel(n: number) {
  lvIndex = n;
  L = LEVELS[n];
  g = new Uint8Array(W * H);
  st = new Uint8Array(W * H);
  L.build();
  L.goals = goalsFor(L.id);
  tool = L.tools[0];
  left = {};
  for (const k of L.tools) left[k] = L.budget[k] === undefined ? -1 : L.budget[k];
  tank = L.tank;
  open = false;
  acc = 0;
  steam = [];
  won = false;
  emptyT = 0;
  doneT = 0;
  msg = L.text; msgT = 5;
  mode = "play";
  rg.say(L.say);
  rg.sound("click");
}

function progress() {
  let a = 0, b = 0;
  for (const k of L.goals) { a += Math.min(k.have, k.need); b += k.need; }
  return b > 0 ? a / b : 0;
}

function solved() {
  if (L.goals.length === 0) return false;
  for (const k of L.goals) if (k.have < k.need) return false;
  return true;
}

function win() {
  won = true;
  open = false;
  mode = "done";
  doneT = 0;
  done[lvIndex] = true;
  rg.save("vp_done", done);
  rg.sound("win");
  rg.vibrate(60);
  rg.say("vp_valmis");
  const k = L.goals[0];
  rg.celebrate(FX + (k.x + k.w / 2) * C, FY + k.y * C, { big: true });
}

// ---- input --------------------------------------------------------------------

function cellAt(px: number, py: number) { return [Math.floor((px - FX) / C), Math.floor((py - FY) / C)]; }
function inField(px: number, py: number) { return px >= FX && px < FX + W * C && py >= FY && py < FY + H * C; }

function paintCell(x: number, y: number) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  const m = g[i];
  if (tool === "dig") {
    if (m === EARTH || m === SAND || m === PIPE) {
      g[i] = E;
      if (m === PIPE && left.pipe !== undefined && left.pipe >= 0) left.pipe++;
    }
  } else if (tool === "pipe") {
    if (m === E && left.pipe !== 0) { g[i] = PIPE; if (left.pipe > 0) left.pipe--; }
  } else if (tool === "sand") {
    if (m === E && left.sand !== 0) { g[i] = SAND; if (left.sand > 0) left.sand--; }
  } else if (tool === "water") {
    if (m === E) g[i] = WATER;
  } else if (tool === "fire") {
    if (m === E || m === WOOD) g[i] = FIRE;
  }
}

function brush(cx: number, cy: number) {
  if (tool === "dig") {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) paintCell(cx + dx, cy + dy);
  } else if (tool === "pipe") {
    paintCell(cx, cy);
  } else if (tool === "sand" || tool === "water") {
    // a few grains at a time, scattered
    paintCell(cx, cy);
    if ((steps & 1) === 0) paintCell(cx + 1, cy); else paintCell(cx - 1, cy);
  } else {
    paintCell(cx, cy); paintCell(cx + 1, cy);
  }
}

function paintTo(cx: number, cy: number) {
  if (lastCX < 0) { brush(cx, cy); lastCX = cx; lastCY = cy; return; }
  const n = Math.max(Math.abs(cx - lastCX), Math.abs(cy - lastCY));
  if (n === 0) { if (tool === "sand" || tool === "water" || tool === "fire") brush(cx, cy); return; }
  for (let s = 1; s <= n; s++) brush(Math.round(lastCX + (cx - lastCX) * s / n), Math.round(lastCY + (cy - lastCY) * s / n));
  lastCX = cx; lastCY = cy;
}

function onPointerDown(x: number, y: number) {
  if (mode !== "play") return;
  if (!inField(x, y)) return;
  painting = true;
  lastCX = -1;
  const c = cellAt(x, y);
  paintTo(c[0], c[1]);
  if (tool === "dig") rg.sound("tick", { volume: 0.3 });
}

function onPointerUp() { painting = false; lastCX = -1; }

function pick(k: Tool) {
  tool = k;
  rg.sound("click");
  if (k === "pipe" && L.id === "allas") { msg = rg.t("Piirrä putki sormella valkoisen viivan kohdalle", "Draw the pipe with your finger along the white line", "Dibuja la tubería con el dedo sobre la línea blanca"); msgT = 3; }
}

function toggleTap() {
  if (tank === 0) { reset(); return; }
  open = !open;
  rg.sound(open ? "whoosh" : "click", { volume: 0.5, pitch: L.srcKind === SAND ? 0.7 : 1.3 });
}

function reset() { startLevel(lvIndex); }

function onKeyDown(key: string) {
  if (mode === "menu" && (key === " " || key === "Enter")) startLevel(0);
  else if (mode === "play" && key === " ") toggleTap();
}

function onBack() {
  if (mode === "menu") rg.exit();
  else { mode = "menu"; open = false; painting = false; }
}

function onClose() {
  if (mode !== "menu") { mode = "menu"; open = false; painting = false; return false; }
  return true;
}

// ---- the frame ----------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  if (msgT > 0) msgT -= dt;
  if (mode === "menu") return;
  if (mode === "done") doneT += dt;
  dt = Math.min(dt, 0.05);
  const ptr = input.pointer;
  if (painting && mode === "play") {
    if (ptr.down && inField(ptr.x, ptr.y)) { const c = cellAt(ptr.x, ptr.y); paintTo(c[0], c[1]); }
    else if (!ptr.down) { painting = false; lastCX = -1; }
  }
  acc += dt;
  let n = 0;
  while (acc >= SIM_DT && n < 2) { step(); acc -= SIM_DT; n++; }
  if (acc > SIM_DT) acc = 0;
  if (hiss > 0) { if (steps % 6 === 0) { rg.sound("whoosh", { volume: 0.25, pitch: 2.4 }); hiss = 0; } }
  for (const s of steam) { s.t += dt; s.y -= 30 * dt; }
  steam = steam.filter((s) => s.t < 1);
  if (mode === "play" && !won && solved()) win();
  if (mode === "play" && tank === 0 && !solved()) {
    emptyT += dt;
    if (emptyT > 3 && emptyT - dt <= 3) {
      msg = rg.t("Säiliö on tyhjä. Paina ↺ ja yritä uudestaan!", "The tank is empty. Press ↺ and try again!", "El depósito está vacío. ¡Pulsa ↺ e inténtalo de nuevo!");
      msgT = 6;
      rg.say("vp_tyhja");
    }
  }
}

// ---- drawing ------------------------------------------------------------------

function Cells() {
  const out = [];
  const flick = Math.floor(t * 8);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let x = 0;
    while (x < W) {
      const m = g[row + x];
      if (m === E) { x++; continue; }
      let e = x + 1;
      while (e < W && g[row + e] === m) e++;
      let col = COLOR[m];
      if (m === FIRE) col = ((y + flick) & 1) ? "#ff6b35" : "#ffb703";
      out.push(<div className="cell" style={{ left: FX + x * C, top: FY + y * C, width: (e - x) * C, height: C, backgroundColor: col,
        opacity: m === WATER ? 0.85 : 1 }} />);
      x = e;
    }
    // grass on earth under open sky, foam on the water's surface
    if (y > 0) {
      x = 0;
      while (x < W) {
        const m = g[row + x];
        const top = g[row - W + x];
        const k = m === EARTH && top === E ? 1 : m === WATER && top === E ? 2 : 0;
        if (k === 0) { x++; continue; }
        let e = x + 1;
        while (e < W) {
          const m2 = g[row + e], t2 = g[row - W + e];
          const k2 = m2 === EARTH && t2 === E ? 1 : m2 === WATER && t2 === E ? 2 : 0;
          if (k2 !== k) break;
          e++;
        }
        out.push(<div className={k === 1 ? "grass" : "foam"} style={{ left: FX + x * C, top: FY + y * C, width: (e - x) * C }} />);
        x = e;
      }
    }
  }
  return out;
}

function GoalViews() {
  const out = [];
  for (const k of L.goals) {
    const p = k.have / k.need;
    const cx = FX + (k.x + k.w / 2) * C;
    if (k.kind === "flower") {
      const e = p >= 1 ? "🌻" : p > 0.66 ? "🌷" : p > 0.33 ? "🌿" : "🌱";
      const s = 22 + p * 20;
      // the flower stands on the pot's soil
      const by = FY + (k.y + k.h) * C;
      out.push(<div className="cell" style={{ left: FX + k.x * C, top: by - 10, width: k.w * C, height: 10, backgroundColor: "#6b4423" }} />);
      out.push(<div className="emoji" style={{ left: cx - 30, top: by - 10 - s * 1.2, width: 60, fontSize: s }}>{e}</div>);
      if (p < 1 && p > 0) out.push(<div className="cell" style={{ left: FX + k.x * C, top: by - 10, width: k.w * C * p, height: 3, backgroundColor: "#4cc9f0" }} />);
    } else if (k.kind === "fire") {
      if (p < 1) {
        const s = 26 + (1 - p) * 16;
        out.push(<div className="emoji" style={{ left: cx - 30, top: FY + k.y * C - s - 2 + Math.sin(t * 9) * 2, width: 60, fontSize: s }}>🔥</div>);
      } else out.push(<div className="emoji" style={{ left: cx - 30, top: FY + (k.y + k.h) * C - 34, width: 60, fontSize: 26 }}>⛺</div>);
    } else if (k.kind === "pool") {
      // the duck floats on the highest water in the pool
      let top = k.y + k.h;
      for (let y = k.y + k.h - 1; y >= k.y; y--) {
        let any = false;
        for (let x = k.x; x < k.x + k.w; x++) if (g[y * W + x] === WATER) any = true;
        if (any) top = y; else break;
      }
      const bob = top < k.y + k.h ? Math.sin(t * 3) * 2 : 0;
      out.push(<div className="emoji" style={{ left: cx - 20, top: FY + top * C - 26 + bob, width: 40, fontSize: 26 }}>🦆</div>);
      out.push(<div className="ghost" style={{ left: FX + k.x * C, top: FY + (k.y + k.h - Math.ceil(k.need / k.w)) * C, width: k.w * C, height: 1 }} />);
    } else {
      if (p >= 1) out.push(<div className="emoji" style={{ left: cx - 30, top: FY + k.y * C - 44, width: 60, fontSize: 36 }}>🏰</div>);
      else out.push(<div className="ghost" style={{ left: FX + k.x * C, top: FY + (k.y + k.h - Math.ceil(k.need / k.w)) * C, width: k.w * C, height: 1 }} />);
      out.push(<div className="emoji" style={{ left: FX + (k.x + k.w) * C + 4, top: FY + (k.y + k.h) * C - 26, width: 30, fontSize: 20 }}>🪣</div>);
    }
  }
  return out;
}

function Tap() {
  const x = FX + L.src[0] * C, y = FY + L.src[1] * C;
  const out = [];
  out.push(<div className="emoji" id="tapicon" onClick={() => toggleTap()} style={{ left: x - 16, top: y - 22, width: 40, fontSize: 28 }}>{L.srcKind === SAND ? "⏳" : "🚰"}</div>);
  if (L.tank > 0) {
    const f = tank / L.tank;
    out.push(<div className="tank" style={{ left: x + 26, top: y - 18 }}>
      <div className="tankfill" style={{ top: 40 - 40 * f, height: 40 * f, backgroundColor: L.srcKind === SAND ? "#e9c46a" : "#3a86ff" }} />
    </div>);
  }
  return out;
}

function Head() {
  const icons = L.goals.map((k) => k.kind === "flower" ? "🌷" : k.kind === "fire" ? "🔥" : k.kind === "pool" ? "🦆" : "🏰");
  return (
    <div className="head">
      <div className="hname">{L.icon + " " + L.name}</div>
      {L.goals.length ? <div className="goal">
        <div className="gicon">{icons[0]}</div>
        <div className="gbar"><div className="gfill" style={{ width: 70 * progress() }} /></div>
      </div> : null}
    </div>
  );
}

const TOOL_ICON: { [k: string]: string } = { dig: "⛏️", pipe: "🧱", sand: "🏖️", water: "💧", fire: "🔥" };

function Bar() {
  const top = FY + H * C + 8;
  const out = [];
  for (const k of L.tools) {
    const n = left[k];
    out.push(<div className={tool === k ? "tool on" : "tool"} id={"tool_" + k} onClick={() => pick(k)}>
      <div className="ticon">{TOOL_ICON[k]}</div>
      {n >= 0 ? <div className="tcount">{String(n)}</div> : null}
    </div>);
  }
  const empty = tank === 0;
  out.push(<div className={open ? "tool tap open" : "tool tap"} id="tap" onClick={() => toggleTap()}>
    <div className="ticon">{empty ? "↺" : open ? "⏸️" : L.srcKind === SAND ? "⏳" : "🚰"}</div>
    <div className="tcount w">{empty ? rg.t("uudestaan", "again", "otra vez") : open ? rg.t("kiinni", "close", "cerrar") : rg.t("avaa", "open", "abrir")}</div>
  </div>);
  out.push(<div className="tool" id="reset" onClick={() => reset()}><div className="ticon">↺</div></div>);
  return <div className="bar" style={{ top: top }}>{out}</div>;
}

function Steams() {
  return steam.map((s) => {
    const r = 6 + s.t * 14;
    return <div className="steam" style={{ left: s.x - r / 2, top: s.y - r / 2, width: r, height: r, borderRadius: r / 2, opacity: 0.8 * (1 - s.t) }} />;
  });
}

function Ghost() {
  if (!L.ghost) return null;
  const k = L.ghost;
  let n = 0;
  for (let x = k[0]; x < k[0] + k[2]; x++) if (g[k[1] * W + x] === PIPE) n++;
  if (n >= k[2] - 2) return null;
  return <div className="ghost" style={{ left: FX + k[0] * C, top: FY + k[1] * C, width: k[2] * C, height: k[3] * C, opacity: 0.5 + 0.4 * Math.sin(t * 4) }} />;
}

function Play() {
  const out = [
    <div className="field" style={{ left: FX, top: FY, width: W * C, height: H * C }} />,
    Ghost(),
    Cells(),
    GoalViews(),
    Tap(),
    Steams(),
    Head(),
    Bar(),
  ];
  if (msgT > 0 && msg) out.push(<div className="msg" style={{ top: FY + H * C - 56, opacity: Math.min(1, msgT) }}>{msg}</div>);
  if (mode === "done" && doneT > 1.2) {
    const last = lvIndex >= LEVELS.length - 2;
    out.push(<div className="card" style={{ top: 250 }}>
      <div className="big">⭐</div>
      <div className="ctext">{rg.t("Hienoa, onnistui!", "Great, you did it!", "¡Genial, lo lograste!")}</div>
      {last ? null : <div className="btn" id="next" onClick={() => startLevel(lvIndex + 1)}><div className="btext">{rg.t("Seuraava ➜", "Next ➜", "Siguiente ➜")}</div></div>}
      <div className="btn blue" id="again" onClick={() => reset()}><div className="btext">{rg.t("↺ Uudestaan", "↺ Again", "↺ Otra vez")}</div></div>
      <div className="btn grey" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="btext">{rg.t("Valikkoon", "Menu", "Menú")}</div></div>
    </div>);
  }
  return <div className="screen">{out}</div>;
}

function Menu() {
  const bob = Math.sin(t * 2) * 4;
  return (
    <div className="screen menu">
      <div className="title" style={{ marginTop: 40 + bob }}>🚰 {rg.t("Vesiputket", "Water Pipes", "Tuberías")}</div>
      <div className="lead">{rg.t("Ohjaa vesi ja hiekka perille", "Guide the water and the sand", "Guía el agua y la arena")}</div>
      <div className="levels">
        {LEVELS.map((k, i) => (
          <div className={k.id === "leikki" ? "lv free" : "lv"} id={"lv" + i} onClick={() => startLevel(i)}>
            <div className="lvicon">{k.icon}</div>
            <div className="lvname">{k.name}</div>
            {done[i] ? <div className="lvstar">⭐</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function view() {
  if (mode === "menu") return Menu();
  return Play();
}
