// Vesilabra: water and sand in pipes. The water and the sand are the
// engine's own simulation (rg.sim, crates/rg_engine/src/fluid.rs): water
// flows, presses and rises in the other arm of a U-tube, sand falls, piles
// and sinks in water, wheels turn when water or sand lands on their blades.
// This file builds the levels, draws the handles (valves, taps, pipes) and
// checks the goals.
//
// Hiekkalaatikko: pour water or sand with a finger, draw walls, add wheels.
// Levels: open a valve, turn the pipes, let a wheel open a gate, fill two
// connected vessels to the lines, plug a hole with sand.

type Mode = "menu" | "play";
type Tool = "water" | "sand" | "wall" | "erase" | "wheel";
type Valve = { id: string; x: number; y: number; w: number; h: number; open: boolean; tap: boolean };
type Pipe = { id: string; x: number; y: number; size: number; shape: string; rot: number };
type Tap = { id: string; x: number; y: number; on: boolean; mat: string };
type Line = { zone: string; x: number; w: number; bottom: number; level: number; tol: number };
type Level = {
  name: string;
  en: string;
  goal: string;
  goalEn: string;
  learn: string;
  learnEn: string;
  tools: Tool[];
  build: () => void;
  // 0..1: how far the goal is; 1 = done
  progress: (st: any) => number;
};

const W = 360;
const H = 720;
const TOP = 56;          // the HUD's height
const BAR = 76;          // the tool bar's height
const FLOOR = H - BAR;   // the sim's floor
const CELL = 3;

const STONE = "#5c677d";
const PIPE = "#7d8597";
const GLASS = "#9fb3c8";
const WOOD = "#9c6644";
const RED = "#e63946";
const WHEEL = "#ffb703";
const MESH = "#6c757d";

let mode: Mode = "menu";
let level = -1;          // -1: the sandbox
let tool: Tool = "water";
let valves: Valve[] = [];
let pipes: Pipe[] = [];
let taps: Tap[] = [];
let lines: Line[] = [];
let wheels: string[] = [];
let done = false;
let doneAt = 0;
let hold = 0;            // seconds the goal has held
let progress = 0;
let stars: number[] = [];
let pouring = false;
let lastX = 0;
let lastY = 0;
let drawFrom: { x: number; y: number } | null = null;
let sandLeft = 0;
let clock = 0;
let turnsHeard: { [id: string]: number } = {};
let gateOpen = false;

const t = (fi: string, en: string) => rg.t(fi, en, en);

// --- building blocks -------------------------------------------------------

function wall(x: number, y: number, w: number, h: number, color?: string) {
  rg.sim("rect", { x, y, w, h, mat: "wall", color: color || STONE });
}

function bar(x0: number, y0: number, x1: number, y1: number, width?: number, color?: string) {
  rg.sim("line", { x0, y0, x1, y1, width: width || 6, mat: "wall", color: color || WOOD });
}

// a vessel: an open box (walls on the sides and at the bottom)
function vessel(x: number, y: number, w: number, h: number, color?: string) {
  const c = color || GLASS;
  wall(x, y, 6, h, c);
  wall(x + w - 6, y, 6, h, c);
  wall(x, y + h - 6, w, 6, c);
}

function valve(id: string, x: number, y: number, w: number, h: number, open: boolean, tap: boolean) {
  valves.push({ id, x, y, w, h, open, tap });
  rg.sim("valve", { id, x, y, w, h, open, color: RED });
}

function setValve(id: string, open: boolean) {
  for (const v of valves) if (v.id === id) v.open = open;
  rg.sim("valve", { id, open });
}

function pipe(id: string, x: number, y: number, size: number, shape: string, rot: number) {
  pipes.push({ id, x, y, size, shape, rot });
  rg.sim("pipe", { id, x, y, size, shape, rot, color: PIPE, thick: 6 });
}

function tap(id: string, x: number, y: number, w: number, on: boolean, rate: number, mat?: string) {
  taps.push({ id, x: x + w / 2, y, on, mat: mat || "water" });
  rg.sim("source", { id, x, y, w, rate, on, mat: mat || "water" });
}

function zone(id: string, x: number, y: number, w: number, h: number) {
  rg.sim("zone", { id, x, y, w, h });
}

// the floor swallows what falls off (and the sandbox's bottom corner)
function floorDrain() {
  rg.sim("drain", { id: "floor", x: 0, y: FLOOR - 6, w: W, h: 6 });
}

function level0(st: any, id: string): number {
  return st && st.zones && st.zones[id] ? st.zones[id].level : 0;
}

// --- the levels ------------------------------------------------------------

const LEVELS: Level[] = [
  {
    name: "Avaa venttiili", en: "Open the valve",
    goal: "Avaa punainen venttiili, niin vesi pääsee säiliöön.", goalEn: "Open the red valve so the water reaches the tank.",
    learn: "Vesi virtaa alaspäin, koska painovoima vetää sitä.", learnEn: "Water flows down because gravity pulls it.",
    tools: [],
    build() {
      tap("tap", 60, 84, 24, true, 26);
      // the pipe down and the slope to the tank
      wall(48, 70, 8, 320, PIPE);
      wall(88, 100, 8, 290, PIPE);
      wall(48, 70, 48, 8, PIPE);
      valve("v", 56, 250, 32, 9, false, true);
      bar(30, 420, 250, 486, 8);
      bar(30, 380, 30, 420, 8);
      vessel(230, 470, 112, FLOOR - 470);
      zone("tank", 236, 470, 100, FLOOR - 476);
      lines.push({ zone: "tank", x: 236, w: 100, bottom: FLOOR - 6, level: 60, tol: 999 });
      floorDrain();
    },
    progress(st) { return level0(st, "tank") / 60; },
  },
  {
    name: "Käännä putket", en: "Turn the pipes",
    goal: "Napauta putkia ja käännä ne niin, että vesi kulkee säiliöön.", goalEn: "Tap the pipes to turn them so the water reaches the tank.",
    learn: "Vesi kulkee putkea pitkin vain, jos putket ovat yhdessä.", learnEn: "Water only follows the pipes when they are connected.",
    tools: [],
    build() {
      const s = 48;
      tap("tap", 40 + 16, 90, 15, true, 24);
      pipe("a", 40, 100, s, "I", 1);
      pipe("b", 40, 100 + s, s, "L", 3);
      pipe("c", 40 + s, 100 + s, s, "I", 0);
      pipe("d", 40 + 2 * s, 100 + s, s, "L", 0);
      pipe("e", 40 + 2 * s, 100 + 2 * s, s, "I", 1);
      vessel(110, 430, 120, FLOOR - 430);
      zone("tank", 116, 430, 108, FLOOR - 436);
      lines.push({ zone: "tank", x: 116, w: 108, bottom: FLOOR - 6, level: 70, tol: 999 });
      floorDrain();
    },
    progress(st) { return level0(st, "tank") / 70; },
  },
  {
    name: "Hyrrä avaa portin", en: "The wheel opens the gate",
    goal: "Käännä putki niin, että vesi pyörittää hyrrää myötäpäivään. Hyrrä nostaa portin.", goalEn: "Turn the pipe so the water spins the wheel clockwise. The wheel lifts the gate.",
    learn: "Virtaava vesi tekee työtä: se pyörittää vesipyörää.", learnEn: "Flowing water does work: it turns a water wheel.",
    tools: [],
    build() {
      tap("tap", 108, 90, 14, true, 30);
      pipe("p", 92, 100, 48, "L", 3);
      rg.sim("wheel", { id: "w", x: 112, y: 270, r: 50, blades: 6, color: WHEEL });
      wheels.push("w");
      // the reservoir behind the gate
      wall(196, 90, 8, 170, STONE);
      wall(330, 90, 8, 170, STONE);
      wall(196, 254, 52, 8, STONE);
      wall(282, 254, 56, 8, STONE);
      valve("gate", 248, 254, 34, 8, false, false);
      rg.sim("rect", { x: 204, y: 120, w: 126, h: 134, mat: "water" });
      vessel(206, 470, 130, FLOOR - 470);
      zone("tank", 212, 470, 118, FLOOR - 476);
      lines.push({ zone: "tank", x: 212, w: 118, bottom: FLOOR - 6, level: 80, tol: 999 });
      bar(30, 400, 180, 450, 8);
      floorDrain();
      gateOpen = false;
    },
    progress(st) { return level0(st, "tank") / 80; },
  },
  {
    name: "Yhteydessä olevat astiat", en: "Connected vessels",
    goal: "Täytä molemmat astiat viivaan asti. Hana: 🚰, alhaalla venttiili.", goalEn: "Fill both vessels to the line. Tap: 🚰, valve at the bottom.",
    learn: "Kun astiat ovat yhteydessä, vesi on molemmissa yhtä korkealla.", learnEn: "In connected vessels the water stands at the same height.",
    tools: [],
    build() {
      tap("tap", 64, 180, 24, false, 260);
      vessel(40, 300, 76, 310);
      vessel(224, 300, 76, 310);
      // the pipe between them at the bottom (the vessels' bottoms open into it)
      wall(110, 568, 120, 8, PIPE);
      wall(110, 604, 120, 8, PIPE);
      rg.sim("rect", { x: 110, y: 576, w: 120, h: 28, mat: "empty" });
      rg.sim("rect", { x: 40, y: 604, w: 260, h: 8, mat: "wall", color: GLASS });
      valve("mid", 166, 576, 9, 28, false, true);
      // a drain valve in A's floor, in case of too much
      wall(40, 604, 30, 8, GLASS);
      valve("out", 70, 604, 24, 8, false, true);
      zone("a", 46, 300, 64, 304);
      zone("b", 230, 300, 64, 304);
      lines.push({ zone: "a", x: 46, w: 64, bottom: 604, level: 110, tol: 9 });
      lines.push({ zone: "b", x: 230, w: 64, bottom: 604, level: 110, tol: 9 });
      floorDrain();
    },
    progress(st) { return linesProgress(st); },
  },
  {
    name: "Kaksi eri korkeutta", en: "Two heights",
    goal: "Täytä astiat eri viivoihin. Venttiili erottaa astiat toisistaan.", goalEn: "Fill the vessels to different lines. The valve keeps them apart.",
    learn: "Suljettu venttiili katkaisee yhteyden, ja pinnat voivat olla eri korkeudella.", learnEn: "A closed valve breaks the connection, and the levels can differ.",
    tools: [],
    build() {
      LEVELS[3].build();
      lines = [];
      lines.push({ zone: "a", x: 46, w: 64, bottom: 604, level: 170, tol: 9 });
      lines.push({ zone: "b", x: 230, w: 64, bottom: 604, level: 80, tol: 9 });
    },
    progress(st) { return linesProgress(st); },
  },
  {
    name: "Hiekkapato", en: "Sand dam",
    goal: "Vesi karkaa kuoppaan. Täytä kuoppa hiekalla, niin vesi pääsee säiliöön.", goalEn: "The water escapes into the pit. Fill it with sand so the water reaches the tank.",
    learn: "Märkä hiekka pitää vettä, mutta verkko päästää veden läpi.", learnEn: "Wet sand holds water back, but a sieve lets water through.",
    tools: ["sand"],
    build() {
      tap("tap", 26, 230, 24, true, 22);
      wall(14, 220, 8, 60, STONE);
      // the slope with the pit
      bar(14, 280, 140, 312, 8, STONE);
      bar(184, 323, 300, 352, 8, STONE);
      wall(136, 312, 6, 70, STONE);
      wall(184, 318, 6, 64, STONE);
      rg.sim("rect", { x: 142, y: 376, w: 42, h: 6, mat: "mesh", color: MESH });
      rg.sim("drain", { id: "pit", x: 142, y: 382, w: 42, h: 6 });
      wall(136, 382, 54, 4, STONE);
      vessel(236, 440, 106, FLOOR - 440);
      zone("tank", 242, 440, 94, FLOOR - 446);
      lines.push({ zone: "tank", x: 242, w: 94, bottom: FLOOR - 6, level: 70, tol: 999 });
      floorDrain();
      sandLeft = 2400;
    },
    progress(st) { return level0(st, "tank") / 70; },
  },
];

function linesProgress(st: any): number {
  let p = 1;
  for (const l of lines) {
    const lv = level0(st, l.zone);
    const d = Math.abs(lv - l.level);
    const one = d <= l.tol ? 1 : Math.max(0, 1 - (d - l.tol) / l.level);
    p = Math.min(p, one);
  }
  return p;
}

function sandbox() {
  // a funnel, zigzag platforms, a wheel, a U-tube with a valve
  bar(120, 90, 160, 130, 6, STONE);
  bar(240, 90, 200, 130, 6, STONE);
  bar(30, 190, 170, 220, 7);
  bar(330, 250, 190, 290, 7);
  rg.sim("wheel", { id: "w1", x: 196, y: 370, r: 40, blades: 6, color: WHEEL });
  wheels.push("w1");
  vessel(30, 450, 60, 190 - 6);
  vessel(150, 450, 60, 190 - 6);
  wall(84, 600, 72, 6, GLASS);
  rg.sim("rect", { x: 30, y: 606, w: 180, h: 28, mat: "empty" });
  wall(30, 628, 180, 6, GLASS);
  wall(30, 600, 6, 34, GLASS);
  wall(204, 600, 6, 34, GLASS);
  valve("u", 116, 606, 8, 22, true, true);
  bar(250, 420, 340, 470, 7);
  wall(240, 560, 110, 6, STONE);
  rg.sim("rect", { x: 270, y: 520, w: 50, h: 6, mat: "mesh", color: MESH });
  rg.sim("drain", { id: "corner", x: 330, y: FLOOR - 10, w: 30, h: 10 });
}

// --- flow ------------------------------------------------------------------

function init() {
  stars = rg.load("stars", []);
  rg.closeButton = "right";
}

function start(n: number) {
  level = n;
  mode = "play";
  valves = [];
  pipes = [];
  taps = [];
  lines = [];
  wheels = [];
  done = false;
  hold = 0;
  progress = 0;
  pouring = false;
  drawFrom = null;
  clock = 0;
  sandLeft = 0;
  turnsHeard = {};
  rg.sim("init", { x: 0, y: 0, w: W, h: H, cell: CELL, background: ["#dff3ff", "#f7fbff"], water: "#3a86ff", deep: "#1d3f8f", sand: "#e9c46a" });
  // the edges of the play area
  wall(0, FLOOR, W, BAR, "#3d405b");
  if (n < 0) {
    tool = "water";
    sandbox();
  } else {
    const L = LEVELS[n];
    tool = L.tools.length ? L.tools[0] : "water";
    L.build();
  }
}

function toMenu() {
  mode = "menu";
  rg.sim("clear");
}

function onBack() {
  if (mode === "play") toMenu();
  else rg.exit();
}

function onClose() {
  if (mode === "play") { toMenu(); return false; }
  return true;
}

function canPour(): boolean {
  if (level < 0) return true;
  return LEVELS[level].tools.indexOf(tool) >= 0;
}

function inField(y: number): boolean {
  return y > TOP && y < FLOOR;
}

function onPointerDown(x: number, y: number) {
  if (mode !== "play" || !inField(y)) return;
  lastX = x; lastY = y;
  if (tool === "wheel" && level < 0) {
    const id = "w" + (wheels.length + 2);
    if (wheels.length >= 5) {
      const old = wheels.shift() as string;
      rg.sim("remove", { id: old });
    }
    rg.sim("wheel", { id, x, y, r: 34, blades: 6, color: WHEEL });
    wheels.push(id);
    rg.sound("pop");
    return;
  }
  if (tool === "wall" && level < 0) {
    drawFrom = { x, y };
    return;
  }
  if (canPour()) pouring = true;
}

function onPointerUp(x: number, y: number) {
  if (drawFrom) {
    rg.sim("line", { x0: drawFrom.x, y0: drawFrom.y, x1: x, y1: y, width: 7, mat: "wall", color: WOOD });
    rg.sound("click");
    drawFrom = null;
  }
  pouring = false;
}

function tick(dt: number, input: any) {
  if (mode !== "play") return;
  clock += dt;
  const p = input.pointer;
  if (pouring && p.down && inField(p.y)) {
    lastX = p.x; lastY = p.y;
    if (tool === "water") rg.sim("pour", { x: p.x, y: p.y, r: 9, mat: "water", amount: 0.8 });
    else if (tool === "sand") {
      if (level < 0 || sandLeft > 0) {
        rg.sim("pour", { x: p.x, y: p.y, r: 8, mat: "sand", amount: 0.35 });
        if (level >= 0) sandLeft = Math.max(0, sandLeft - 22);
      }
    } else if (tool === "erase") {
      rg.sim("erase", { x: p.x, y: p.y, r: 14 });
      rg.sim("circle", { x: p.x, y: p.y, r: 10, mat: "empty" });
    }
  } else if (!p.down) pouring = false;
  const st = rg.simState;
  if (!st) return;
  // a soft tick for every turn of a wheel
  for (const id of wheels) {
    const w = st.wheels[id];
    if (!w) continue;
    const n = Math.floor(w.turns);
    if (turnsHeard[id] === undefined) turnsHeard[id] = n;
    if (n > turnsHeard[id]) { turnsHeard[id] = n; rg.sound("tick", { volume: 0.3 }); }
  }
  if (level === 2) {
    // the wheel winds the gate up: two clockwise turns open it
    const w = st.wheels["w"];
    const open = w && w.angle > Math.PI * 4;
    if (open && !gateOpen) { gateOpen = true; setValve("gate", true); rg.sound("whoosh"); }
  }
  if (level >= 0 && !done) {
    progress = Math.max(0, Math.min(1, LEVELS[level].progress(st)));
    hold = progress >= 1 ? hold + dt : 0;
    if (hold > 1.2) win();
  }
}

function win() {
  done = true;
  doneAt = clock;
  const s = clock < 40 ? 3 : clock < 80 ? 2 : 1;
  if (!(stars[level] >= s)) {
    stars[level] = s;
    rg.save("stars", stars);
  }
  rg.sound("win");
  rg.vibrate([40, 60, 40]);
  rg.celebrate(W / 2, H / 2);
}

function toggleValve(v: Valve) {
  if (!v.tap || done) return;
  setValve(v.id, !v.open);
  rg.sound(v.open ? "pop" : "click");
}

function turnPipe(p: Pipe) {
  if (done) return;
  p.rot = (p.rot + 1) % 4;
  rg.sim("pipe", { id: p.id, x: p.x, y: p.y, size: p.size, shape: p.shape, rot: p.rot, color: PIPE, thick: 6 });
  rg.sound("click");
}

function toggleTap(tp: Tap) {
  tp.on = !tp.on;
  rg.sim("source", { id: tp.id, on: tp.on });
  rg.sound(tp.on ? "pop" : "click");
}

// --- view ------------------------------------------------------------------

function view() {
  return mode === "menu" ? menuView() : playView();
}

function menuView() {
  const items: any[] = [];
  items.push(
    <div className="item sandbox" onClick={() => start(-1)}>
      <div className="itemIcon">🏖️</div>
      <div className="itemText">
        <div className="itemName">{t("Hiekkalaatikko", "Sandbox")}</div>
        <div className="itemSub">{t("Kaada vettä ja hiekkaa, rakenna putkia", "Pour water and sand, build pipes")}</div>
      </div>
    </div>
  );
  LEVELS.forEach((L, i) => {
    const s = stars[i] || 0;
    items.push(
      <div className="item" onClick={() => start(i)}>
        <div className="itemNum">{String(i + 1)}</div>
        <div className="itemText">
          <div className="itemName">{t(L.name, L.en)}</div>
          <div className="itemStars">{"★".repeat(s) + "☆".repeat(3 - s)}</div>
        </div>
      </div>
    );
  });
  return (
    <div className="menu">
      <div className="title">💧 {t("Vesilabra", "Water Lab")}</div>
      <div className="subtitle">{t("Ohjaa vesi perille", "Guide the water home")}</div>
      {items}
    </div>
  );
}

function playView() {
  const out: any[] = [];
  const st = rg.simState;
  // target lines and how high the water is
  for (const l of lines) {
    const lv = level0(st, l.zone);
    const ok = Math.abs(lv - l.level) <= l.tol || (l.tol > 900 && lv >= l.level);
    out.push(<div className={ok ? "target ok" : "target"} style={{ left: l.x - 6, top: l.bottom - l.level - 1, width: l.w + 12 }} />);
    if (l.tol < 900) out.push(<div className="band" style={{ left: l.x, top: l.bottom - l.level - l.tol, width: l.w, height: l.tol * 2 }} />);
  }
  for (const v of valves) {
    if (!v.tap) continue;
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h / 2;
    const horiz = v.w >= v.h;
    out.push(
      <div className={v.open ? "valve open" : "valve"} style={{ left: horiz ? cx - 17 : v.x + v.w + 4, top: horiz ? v.y + v.h + 4 : cy - 17 }} onClick={() => toggleValve(v)}>
        <div className="handle" style={{ transform: v.open === horiz ? "rotate(90deg)" : "rotate(0deg)" }} />
      </div>
    );
  }
  for (const p of pipes) {
    out.push(
      <div className="pipeHit" style={{ left: p.x, top: p.y, width: p.size, height: p.size }} onClick={() => turnPipe(p)}>
        <div className="turn">↻</div>
      </div>
    );
  }
  for (const tp of taps) {
    out.push(
      <div className={tp.on ? "tap on" : "tap"} style={{ left: tp.x - 20, top: tp.y - 46 }} onClick={() => toggleTap(tp)}>
        <div className="tapIcon">🚰</div>
      </div>
    );
  }
  if (level === 2) {
    const w = st && st.wheels ? st.wheels["w"] : null;
    const k = w ? Math.max(0, Math.min(1, w.angle / (Math.PI * 4))) : 0;
    out.push(
      <div className="gauge" style={{ left: 196, top: 268 }}>
        <div className="gaugeFill" style={{ width: Math.round(140 * (gateOpen ? 1 : k)) }} />
        <div className="gaugeText">{gateOpen ? t("Portti auki!", "Gate open!") : t("Portti", "Gate")}</div>
      </div>
    );
  }
  if (drawFrom) {
    // the wall being drawn
    const dx = lastX - drawFrom.x;
    const dy = lastY - drawFrom.y;
    out.push(<div className="ghost" style={{ left: drawFrom.x - 4, top: drawFrom.y - 4, width: 8, height: 8 }} />);
  }
  const L = level >= 0 ? LEVELS[level] : null;
  out.push(
    <div className="hud">
      <div className="hudTitle">{L ? (level + 1) + ". " + t(L.name, L.en) : "🏖️ " + t("Hiekkalaatikko", "Sandbox")}</div>
      <div className="hudGoal">{L ? t(L.goal, L.goalEn) : t("Pidä sormea ruudulla: vettä tai hiekkaa. Napauta venttiiliä.", "Hold a finger on the screen: water or sand. Tap the valve.")}</div>
      {L ? <div className="meter"><div className="meterFill" style={{ width: Math.round(progress * 120) }} /></div> : null}
    </div>
  );
  out.push(toolbar());
  if (done && L) {
    const s = stars[level] || 0;
    out.push(
      <div className="win">
        <div className="winBox">
          <div className="winTitle">{t("Hienoa!", "Well done!")}</div>
          <div className="winStars">{"★".repeat(s) + "☆".repeat(3 - s)}</div>
          <div className="winLearn">{t(L.learn, L.learnEn)}</div>
          <div className="row">
            <div className="btn" onClick={() => toMenu()}>{t("Valikko", "Menu")}</div>
            {level + 1 < LEVELS.length ? <div className="btn go" onClick={() => start(level + 1)}>{t("Seuraava ▶", "Next ▶")}</div> : null}
          </div>
        </div>
      </div>
    );
  }
  return <div className="screen">{out}</div>;
}

function toolbar() {
  const tools: { id: Tool; icon: string; name: string }[] = [];
  const all: { id: Tool; icon: string; name: string }[] = [
    { id: "water", icon: "💧", name: t("Vesi", "Water") },
    { id: "sand", icon: "⏳", name: t("Hiekka", "Sand") },
    { id: "wall", icon: "🧱", name: t("Seinä", "Wall") },
    { id: "wheel", icon: "⚙️", name: t("Hyrrä", "Wheel") },
    { id: "erase", icon: "🧽", name: t("Pyyhi", "Erase") },
  ];
  for (const x of all) if (level < 0 || LEVELS[level].tools.indexOf(x.id) >= 0) tools.push(x);
  const items: any[] = tools.map(x => (
    <div className={tool === x.id ? "tool on" : "tool"} onClick={() => { tool = x.id; rg.sound("click"); }}>
      <div className="toolIcon">{x.icon}</div>
      <div className={tool === x.id ? "toolName on" : "toolName"}>{x.name}</div>
    </div>
  ));
  if (level >= 0 && LEVELS[level].tools.indexOf("sand") >= 0) {
    items.push(<div className="left">{Math.ceil(sandLeft / 16)}</div>);
  }
  items.push(
    <div className="tool" onClick={() => { if (level < 0) { rg.sim("clearFluid"); } else start(level); rg.sound("whoosh"); }}>
      <div className="toolIcon">{level < 0 ? "🧹" : "↺"}</div>
      <div className="toolName">{level < 0 ? t("Tyhjennä", "Clear") : t("Alusta", "Restart")}</div>
    </div>
  );
  return <div className="bar">{items}</div>;
}
