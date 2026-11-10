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
// turns: the turns a tap cycles through (all four when left out); want: the
// turns that let the water through (for the hints)
type Pipe = { id: string; x: number; y: number; size: number; shape: string; rot: number; turns?: number[]; want?: number[] };
type Tap = { id: string; x: number; y: number; on: boolean; mat: string };
type Line = { zone: string; x: number; w: number; bottom: number; level: number; tol: number };
// a hint: the clip (and the text, TEXT[id]) and where the finger points;
// tool: a tool in the bar instead of a place on the screen
type Hint = { id: string; x: number; y: number; pour?: boolean; tool?: string };
type Level = {
  name: string;
  en: string;
  es: string;
  goal: string;
  goalEn: string;
  goalEs: string;
  say: string;        // the spoken goal, TEXT[say]
  learn: string;      // the spoken lesson after the win, TEXT[learn]
  tools: Tool[];
  hint: (st: any) => Hint | null;
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
let lastTouch = 0;       // when the player last touched something (clock)
let hintUntil = -1;      // the hint shows until this (clock)
let hintId = "";         // the hint showing now
let hintNow: Hint | null = null;
let wrongWay = 0;        // seconds the wheel has turned the wrong way
let saidWrong = false;

const t = (fi: string, en: string, es?: string) => rg.t(fi, en, es || en);

// The spoken texts: id -> [fi, en, es]. `node tools/vesilabra/voice.js`
// copies them into voice/fi.json and voice/en|es/vesilabra.json.
// VOICE-BEGIN
const TEXT: { [id: string]: string[] } = {
  vl_leikki: ["Hiekkalaatikko! Pidä sormea ruudulla, niin vettä tai hiekkaa valuu. Napauta venttiiliä, niin se aukeaa.", "Sandbox! Hold your finger on the screen to pour water or sand. Tap a valve to open it.", "¡Arenero! Mantén el dedo en la pantalla para echar agua o arena. Toca una válvula para abrirla."],
  vl_1: ["Avaa punainen venttiili, niin vesi pääsee säiliöön.", "Open the red valve so the water reaches the tank.", "Abre la válvula roja para que el agua llegue al depósito."],
  vl_2: ["Napauta putkia ja käännä ne niin, että vesi kulkee säiliöön.", "Tap the pipes to turn them so the water reaches the tank.", "Toca los tubos para girarlos y que el agua llegue al depósito."],
  vl_3: ["Vesi pyörittää hyrrää. Käännä putki niin, että vesi putoaa hyrrän oikealle puolelle. Silloin hyrrä pyörii oikeaan suuntaan ja nostaa portin.", "Water turns the wheel. Turn the pipe so the water falls on the right side of the wheel. Then the wheel turns the right way and lifts the gate.", "El agua mueve la rueda. Gira el tubo para que el agua caiga en el lado derecho de la rueda. Así la rueda gira bien y levanta la compuerta."],
  vl_4: ["Täytä molemmat astiat viivaan asti. Hana on ylhäällä ja venttiili alhaalla.", "Fill both vessels to the line. The tap is at the top and the valve at the bottom.", "Llena los dos vasos hasta la línea. El grifo está arriba y la válvula abajo."],
  vl_5: ["Täytä astiat eri viivoihin. Keskimmäinen venttiili erottaa astiat toisistaan.", "Fill the vessels to different lines. The middle valve keeps them apart.", "Llena los vasos hasta líneas distintas. La válvula del medio los separa."],
  vl_6: ["Vesi karkaa kuoppaan. Täytä kuoppa hiekalla, niin vesi pääsee säiliöön.", "The water escapes into the pit. Fill it with sand so the water reaches the tank.", "El agua se escapa por el hoyo. Llénalo de arena para que el agua llegue al depósito."],
  vl_1_opi: ["Vesi virtaa alaspäin, koska painovoima vetää sitä.", "Water flows down because gravity pulls it.", "El agua baja porque la gravedad la atrae."],
  vl_2_opi: ["Vesi kulkee putkea pitkin vain, jos putket ovat yhdessä.", "Water only follows the pipes when they are connected.", "El agua solo sigue los tubos si están unidos."],
  vl_3_opi: ["Virtaava vesi tekee työtä: se pyörittää vesipyörää.", "Flowing water does work: it turns a water wheel.", "El agua que corre hace trabajo: mueve una rueda de agua."],
  vl_4_opi: ["Kun astiat ovat yhteydessä, vesi on molemmissa yhtä korkealla.", "In connected vessels the water stands at the same height.", "En vasos comunicantes el agua queda a la misma altura."],
  vl_5_opi: ["Suljettu venttiili katkaisee yhteyden, ja pinnat voivat olla eri korkeudella.", "A closed valve breaks the connection, and the levels can differ.", "Una válvula cerrada corta la unión, y los niveles pueden ser distintos."],
  vl_6_opi: ["Märkä hiekka pitää vettä, mutta verkko päästää veden läpi.", "Wet sand holds water back, but a sieve lets water through.", "La arena mojada frena el agua, pero una rejilla la deja pasar."],
  vl_h_venttiili: ["Napauta punaista venttiiliä.", "Tap the red valve.", "Toca la válvula roja."],
  vl_h_putki: ["Napauta putkea, jonka kohdalla sormi on. Se kääntyy.", "Tap the pipe where the finger is. It turns.", "Toca el tubo donde está el dedo. Gira."],
  vl_h_hyrra: ["Napauta putkea, niin vesi putoaa hyrrän oikealle puolelle.", "Tap the pipe so the water falls on the right side of the wheel.", "Toca el tubo para que el agua caiga en el lado derecho de la rueda."],
  vl_h_vaarin: ["Hyrrä pyörii väärään suuntaan! Käännä putki toisin päin.", "The wheel turns the wrong way! Turn the pipe the other way.", "¡La rueda gira al revés! Gira el tubo hacia el otro lado."],
  vl_h_hana: ["Napauta hanaa, niin vettä alkaa tulla.", "Tap the tap to let the water run.", "Toca el grifo para que salga agua."],
  vl_h_hana_kiinni: ["Nyt riittää! Napauta hanaa, niin vesi loppuu.", "That's enough! Tap the tap to stop the water.", "¡Ya basta! Toca el grifo para cerrar el agua."],
  vl_h_auki: ["Avaa keskimmäinen venttiili, niin vesi pääsee toiseen astiaan.", "Open the middle valve so the water gets into the other vessel.", "Abre la válvula del medio para que el agua pase al otro vaso."],
  vl_h_kiinni: ["Sulje keskimmäinen venttiili, niin astiat erottuvat.", "Close the middle valve to keep the vessels apart.", "Cierra la válvula del medio para separar los vasos."],
  vl_h_pois: ["Liikaa vettä! Avaa vasemman astian pohjan venttiili, niin vettä valuu pois.", "Too much water! Open the valve in the left vessel's bottom to let some out.", "¡Demasiada agua! Abre la válvula del fondo del vaso izquierdo para vaciar un poco."],
  vl_h_pois_kiinni: ["Sulje vasemman astian pohjan venttiili.", "Close the valve in the left vessel's bottom.", "Cierra la válvula del fondo del vaso izquierdo."],
  vl_h_hiekka: ["Valitse alhaalta hiekka.", "Choose the sand at the bottom.", "Elige la arena abajo."],
  vl_h_kuoppa: ["Kaada hiekkaa kuoppaan sormella.", "Pour sand into the pit with your finger.", "Echa arena en el hoyo con el dedo."],
  vl_h_loppu: ["Hiekka loppui. Aloita alusta.", "The sand ran out. Start again.", "Se acabó la arena. Empieza otra vez."],
  vl_h_odota: ["Hyvä! Odota hetki, vesi virtaa.", "Good! Wait a moment, the water is flowing.", "¡Bien! Espera un poco, el agua corre."],
};
// VOICE-END

function tx(id: string): string {
  const s = TEXT[id];
  return s ? rg.t(s[0], s[1], s[2]) : "";
}

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

function pipe(id: string, x: number, y: number, size: number, shape: string, rot: number, want?: number[], turns?: number[]) {
  pipes.push({ id, x, y, size, shape, rot, want, turns });
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

// --- where the hints point -------------------------------------------------

function findValve(id: string): Valve | null {
  for (const v of valves) if (v.id === id) return v;
  return null;
}

// the middle of a valve's round handle (as drawn in playView)
function valveHint(id: string, clip: string): Hint | null {
  const v = findValve(id);
  if (!v) return null;
  const horiz = v.w >= v.h;
  return horiz ? { id: clip, x: v.x + v.w / 2, y: v.y + v.h + 21 } : { id: clip, x: v.x + v.w + 21, y: v.y + v.h / 2 };
}

function tapHint(clip: string): Hint | null {
  return taps.length ? { id: clip, x: taps[0].x, y: taps[0].y - 26 } : null;
}

function pipeHint(p: Pipe, clip: string): Hint {
  return { id: clip, x: p.x + p.size / 2, y: p.y + p.size / 2 };
}

function pipeOk(p: Pipe): boolean {
  return !p.want || p.want.indexOf(p.rot) >= 0;
}

function tapOn(): boolean {
  return taps.length > 0 && taps[0].on;
}

// the connected vessels: what to do next to get A and B to their lines
function vesselsHint(st: any): Hint | null {
  const a = lines[0], b = lines[1];
  const la = level0(st, "a"), lb = level0(st, "b");
  const mid = findValve("mid"), out = findValve("out");
  if (!mid || !out) return null;
  const highA = la > a.level + a.tol, highB = lb > b.level + b.tol;
  const lowA = la < a.level - a.tol, lowB = lb < b.level - b.tol;
  if (highA || highB) {
    if (tapOn()) return tapHint("vl_h_hana_kiinni");
    if (highB && !mid.open) return valveHint("mid", "vl_h_auki");
    if (!out.open) return valveHint("out", "vl_h_pois");
    return { id: "vl_h_odota", x: a.x + a.w / 2, y: a.bottom - la };
  }
  if (out.open) return valveHint("out", "vl_h_pois_kiinni");
  if (lowB) {
    // B fills only through the middle valve, and only while A is higher
    if (!mid.open) return valveHint("mid", "vl_h_auki");
    if (!tapOn()) return tapHint("vl_h_hana");
    return { id: "vl_h_odota", x: b.x + b.w / 2, y: b.bottom - lb };
  }
  if (lowA) {
    if (mid.open && b.level < a.level) return valveHint("mid", "vl_h_kiinni");
    if (!tapOn()) return tapHint("vl_h_hana");
    return { id: "vl_h_odota", x: a.x + a.w / 2, y: a.bottom - la };
  }
  if (tapOn()) return tapHint("vl_h_hana_kiinni");
  return null;
}

// --- the levels ------------------------------------------------------------

const LEVELS: Level[] = [
  {
    name: "Avaa venttiili", en: "Open the valve", es: "Abre la válvula",
    goal: "Avaa punainen venttiili, niin vesi pääsee säiliöön.", goalEn: "Open the red valve so the water reaches the tank.", goalEs: "Abre la válvula roja para que el agua llegue al depósito.",
    say: "vl_1", learn: "vl_1_opi",
    tools: [],
    hint() {
      const v = findValve("v");
      return v && !v.open ? valveHint("v", "vl_h_venttiili") : { id: "vl_h_odota", x: 286, y: 520 };
    },
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
    name: "Käännä putket", en: "Turn the pipes", es: "Gira los tubos",
    goal: "Napauta putkia ja käännä ne niin, että vesi kulkee säiliöön.", goalEn: "Tap the pipes to turn them so the water reaches the tank.", goalEs: "Toca los tubos para girarlos y que el agua llegue al depósito.",
    say: "vl_2", learn: "vl_2_opi",
    tools: [],
    hint() {
      // the first pipe on the water's way that is turned wrong
      for (const p of pipes) if (!pipeOk(p)) return pipeHint(p, "vl_h_putki");
      return { id: "vl_h_odota", x: 170, y: 560 };
    },
    build() {
      const s = 48;
      tap("tap", 40 + 16, 90, 15, true, 24);
      // the way: down, right, right, down (want = the turns that carry it)
      pipe("a", 40, 100, s, "I", 1, [0, 2]);
      pipe("b", 40, 100 + s, s, "L", 3, [0]);
      pipe("c", 40 + s, 100 + s, s, "I", 0, [1, 3]);
      pipe("d", 40 + 2 * s, 100 + s, s, "L", 0, [2]);
      pipe("e", 40 + 2 * s, 100 + 2 * s, s, "I", 1, [0, 2]);
      vessel(110, 430, 120, FLOOR - 430);
      zone("tank", 116, 430, 108, FLOOR - 436);
      lines.push({ zone: "tank", x: 116, w: 108, bottom: FLOOR - 6, level: 70, tol: 999 });
      floorDrain();
    },
    progress(st) { return level0(st, "tank") / 70; },
  },
  {
    name: "Hyrrä avaa portin", en: "The wheel opens the gate", es: "La rueda abre la compuerta",
    goal: "Napauta putkea: veden pitää pudota hyrrän oikealle puolelle 💧. Hyrrä nostaa portin.", goalEn: "Tap the pipe: the water must fall on the wheel's right side 💧. The wheel lifts the gate.", goalEs: "Toca el tubo: el agua debe caer en el lado derecho de la rueda 💧. La rueda levanta la compuerta.",
    say: "vl_3", learn: "vl_3_opi",
    tools: [],
    hint() {
      const p = pipes[0];
      if (p && !pipeOk(p)) return pipeHint(p, saidWrong ? "vl_h_vaarin" : "vl_h_hyrra");
      return gateOpen ? { id: "vl_h_odota", x: 270, y: 520 } : { id: "vl_h_odota", x: 150, y: 220 };
    },
    build() {
      tap("tap", 108, 90, 14, true, 30);
      // a tap flips the pipe between pouring left (wrong) and right (right):
      // the two other turns would only close it and puzzle a child
      pipe("p", 92, 100, 48, "L", 3, [0], [3, 0]);
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
    name: "Yhteydessä olevat astiat", en: "Connected vessels", es: "Vasos comunicantes",
    goal: "Täytä molemmat astiat viivaan asti. Hana: 🚰, alhaalla venttiili.", goalEn: "Fill both vessels to the line. Tap: 🚰, valve at the bottom.", goalEs: "Llena los dos vasos hasta la línea. Grifo: 🚰, válvula abajo.",
    say: "vl_4", learn: "vl_4_opi",
    tools: [],
    hint(st) { return vesselsHint(st); },
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
    name: "Kaksi eri korkeutta", en: "Two heights", es: "Dos alturas",
    goal: "Täytä astiat eri viivoihin. Venttiili erottaa astiat toisistaan.", goalEn: "Fill the vessels to different lines. The valve keeps them apart.", goalEs: "Llena los vasos hasta líneas distintas. La válvula los separa.",
    say: "vl_5", learn: "vl_5_opi",
    tools: [],
    hint(st) { return vesselsHint(st); },
    build() {
      LEVELS[3].build();
      lines = [];
      lines.push({ zone: "a", x: 46, w: 64, bottom: 604, level: 170, tol: 9 });
      lines.push({ zone: "b", x: 230, w: 64, bottom: 604, level: 80, tol: 9 });
    },
    progress(st) { return linesProgress(st); },
  },
  {
    name: "Hiekkapato", en: "Sand dam", es: "Dique de arena",
    goal: "Vesi karkaa kuoppaan. Täytä kuoppa hiekalla, niin vesi pääsee säiliöön.", goalEn: "The water escapes into the pit. Fill it with sand so the water reaches the tank.", goalEs: "El agua se escapa por el hoyo. Llénalo de arena para que llegue al depósito.",
    say: "vl_6", learn: "vl_6_opi",
    tools: ["sand"],
    hint(st) {
      if (tool !== "sand") return { id: "vl_h_hiekka", x: 0, y: 0, tool: "sand" };
      // the pit is full when the water runs past it into the tank
      if (level0(st, "tank") > 4) return { id: "vl_h_odota", x: 289, y: 560 };
      if (sandLeft <= 0) return { id: "vl_h_loppu", x: 0, y: 0, tool: "restart" };
      return { id: "vl_h_kuoppa", x: 163, y: 330, pour: true };
    },
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
  lastTouch = 0;
  hintUntil = -1;
  hintId = "";
  hintNow = null;
  wrongWay = 0;
  saidWrong = false;
  rg.sim("init", { x: 0, y: 0, w: W, h: H, cell: CELL, background: ["#dff3ff", "#f7fbff"], water: "#3a86ff", deep: "#1d3f8f", sand: "#e9c46a" });
  // the edges of the play area
  wall(0, FLOOR, W, BAR, "#3d405b");
  if (n < 0) {
    tool = "water";
    sandbox();
    rg.say("vl_leikki");
  } else {
    const L = LEVELS[n];
    tool = L.tools.length ? L.tools[0] : "water";
    L.build();
    rg.say(L.say);
  }
}

// 💡: show (and say) what to do next; it follows the steps for a while
function showHint() {
  hintUntil = clock + 9;
  hintId = "";
  lastTouch = clock;
}

function touched() {
  lastTouch = clock;
}

function toMenu() {
  mode = "menu";
  rg.stopSay();
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
  touched();
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
    // turning backwards: say so once and show where to tap
    wrongWay = w && w.speed < -0.4 ? wrongWay + dt : 0;
    if (wrongWay > 1.5 && !saidWrong && !gateOpen) {
      saidWrong = true;
      rg.sound("wrong", { volume: 0.4 });
      showHint();
    }
  }
  if (level >= 0 && !done) {
    progress = Math.max(0, Math.min(1, LEVELS[level].progress(st)));
    hold = progress >= 1 ? hold + dt : 0;
    if (hold > 1.2) win();
  }
  updateHint(st);
}

// The hint: after 💡, or by itself when nothing has been touched for a while.
// While it shows, it follows the level: a new step says its own clip.
function updateHint(st: any) {
  if (level < 0 || done) { hintNow = null; return; }
  if (clock > hintUntil && clock - lastTouch > 14) {
    // by itself only when there is something to do (not "wait")
    const h0 = LEVELS[level].hint(st);
    if (h0 && h0.id !== "vl_h_odota") showHint();
    else lastTouch = clock;
  }
  if (clock > hintUntil) { hintNow = null; hintId = ""; return; }
  const h = LEVELS[level].hint(st);
  hintNow = h;
  if (!h) { hintUntil = -1; hintId = ""; return; }
  if (h.id !== hintId) {
    hintId = h.id;
    rg.say(h.id);
    hintUntil = Math.max(hintUntil, clock + 7);
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
  hintNow = null;
  rg.sound("win");
  rg.say(["hienoa", LEVELS[level].learn]);
  rg.vibrate([40, 60, 40]);
  rg.celebrate(W / 2, H / 2);
}

function toggleValve(v: Valve) {
  if (!v.tap || done) return;
  touched();
  setValve(v.id, !v.open);
  rg.sound(v.open ? "pop" : "click");
}

function turnPipe(p: Pipe) {
  if (done) return;
  touched();
  if (p.turns) {
    const i = p.turns.indexOf(p.rot);
    p.rot = p.turns[(i + 1) % p.turns.length];
  } else p.rot = (p.rot + 1) % 4;
  rg.sim("pipe", { id: p.id, x: p.x, y: p.y, size: p.size, shape: p.shape, rot: p.rot, color: PIPE, thick: 6 });
  rg.sound("click");
}

function toggleTap(tp: Tap) {
  touched();
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
  // on the wheel level the pipe glows until it pours the right way
  const glow = level === 2 && !done;
  for (const p of pipes) {
    const lit = glow && !pipeOk(p);
    const pulse = lit ? 0.45 + 0.35 * Math.abs(Math.sin(clock * 4)) : 0;
    out.push(
      <div className={lit ? "pipeHit lit" : "pipeHit"} style={lit ? { left: p.x, top: p.y, width: p.size, height: p.size, borderColor: "rgba(255, 183, 3, " + pulse.toFixed(2) + ")" } : { left: p.x, top: p.y, width: p.size, height: p.size }} onClick={() => turnPipe(p)}>
        <div className={glow ? "turn big" : "turn"}>↻</div>
      </div>
    );
  }
  if (level === 2) out.push(wheelGuide(st));
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
  if (hintNow && !hintNow.tool && !done) out.push(finger(hintNow));
  out.push(
    <div className="hud">
      <div className="hudTitle">{L ? (level + 1) + ". " + t(L.name, L.en, L.es) : "🏖️ " + t("Hiekkalaatikko", "Sandbox", "Arenero")}</div>
      <div className="hudGoal">{L ? t(L.goal, L.goalEn, L.goalEs) : t("Pidä sormea ruudulla: vettä tai hiekkaa. Napauta venttiiliä.", "Hold a finger on the screen: water or sand. Tap the valve.", "Mantén el dedo en la pantalla: agua o arena. Toca la válvula.")}</div>
      {L ? <div className="meter"><div className="meterFill" style={{ width: Math.round(progress * 120) }} /></div> : null}
    </div>
  );
  // the hint's text: away from what the finger points at
  if (hintNow && !done) out.push(<div className="tipBox" style={{ top: hintNow.tool || hintNow.y > 330 ? 60 : 566 }}><div className="tipText">💡 {tx(hintNow.id)}</div></div>);
  out.push(toolbar());
  if (done && L) {
    const s = stars[level] || 0;
    out.push(
      <div className="win">
        <div className="winBox">
          <div className="winTitle">{t("Hienoa!", "Well done!")}</div>
          <div className="winStars">{"★".repeat(s) + "☆".repeat(3 - s)}</div>
          <div className="winLearn">{tx(L.learn)}</div>
          <div className="row">
            <div className="btn" onClick={() => toMenu()}>{t("Valikko", "Menu", "Menú")}</div>
            {level + 1 < LEVELS.length ? <div className="btn go" onClick={() => start(level + 1)}>{t("Seuraava ▶", "Next ▶", "Siguiente ▶")}</div> : null}
          </div>
        </div>
      </div>
    );
  }
  return <div className="screen">{out}</div>;
}

// the hint's finger: it bobs under the thing to tap (or strokes down where to pour)
function finger(h: Hint) {
  const k = Math.abs(Math.sin(clock * 5));
  const ring = 22 + 8 * k;
  const dy = h.pour ? -30 + 40 * ((clock * 0.8) % 1) : 10 + 8 * k;
  return (
    <div className="hintLayer">
      {h.pour ? null : <div className="ring" style={{ left: h.x - ring, top: h.y - ring, width: ring * 2, height: ring * 2, borderRadius: ring }} />}
      <div className="finger" style={{ left: h.x - 16, top: h.y + dy }}>👆</div>
    </div>
  );
}

// The wheel level: where the water should land (💧 and an arrow on the
// wheel's right side) and which way the wheel turns now (green = right way).
function wheelGuide(st: any) {
  const w = st && st.wheels ? st.wheels["w"] : null;
  const sp = w ? w.speed : 0;
  const dir = sp > 0.4 ? "good" : sp < -0.4 ? "bad" : "idle";
  const bob = Math.abs(Math.sin(clock * 3)) * 6;
  return (
    <div className="hintLayer">
      {gateOpen ? null : <div className="drop" style={{ left: 138, top: 186 + bob }}>💧</div>}
      {gateOpen ? null : <div className="dropArrow" style={{ left: 146, top: 214 + bob }}>⬇</div>}
      <div className={"spin " + dir} style={{ left: 112 - 30 + 14, top: 270 - 30 + 6 }}>{dir === "bad" ? "↺" : "↻"}</div>
      {dir === "bad" ? <div className="wrongWay" style={{ left: 20, top: 336 }}>{t("Väärä suunta!", "Wrong way!", "¡Al revés!")}</div> : null}
    </div>
  );
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
  const hinted = hintNow && hintNow.tool && !done ? hintNow.tool : "";
  const k = Math.abs(Math.sin(clock * 5));
  const items: any[] = tools.map(x => (
    <div className={tool === x.id ? "tool on" : hinted === x.id ? "tool lit" : "tool"} onClick={() => { tool = x.id; touched(); rg.sound("click"); }}>
      <div className="toolIcon">{x.icon}</div>
      <div className={tool === x.id ? "toolName on" : "toolName"}>{x.name}</div>
      {hinted === x.id ? <div className="toolFinger" style={{ top: -40 + 6 * k }}>👇</div> : null}
    </div>
  ));
  if (level >= 0 && LEVELS[level].tools.indexOf("sand") >= 0) {
    items.push(<div className="left">{Math.ceil(sandLeft / 16)}</div>);
  }
  items.push(
    <div className={hinted === "restart" ? "tool lit" : "tool"} onClick={() => { if (level < 0) { rg.sim("clearFluid"); } else start(level); rg.sound("whoosh"); }}>
      <div className="toolIcon">{level < 0 ? "🧹" : "↺"}</div>
      <div className="toolName">{level < 0 ? t("Tyhjennä", "Clear", "Vaciar") : t("Alusta", "Restart", "Reiniciar")}</div>
      {hinted === "restart" ? <div className="toolFinger" style={{ top: -40 + 6 * k }}>👇</div> : null}
    </div>
  );
  if (level >= 0) {
    // 🔊 says the goal again (only when the game talks); 💡 shows the next step
    if (rg.speechOn()) {
      items.push(
        <div className="tool" onClick={() => { touched(); rg.say(LEVELS[level].say); }}>
          <div className="toolIcon">🔊</div>
          <div className="toolName">{t("Kuuntele", "Listen", "Escuchar")}</div>
        </div>
      );
    }
    items.push(
      <div className={hintNow ? "tool on" : "tool"} onClick={() => { showHint(); rg.sound("click"); }}>
        <div className="toolIcon">💡</div>
        <div className={hintNow ? "toolName on" : "toolName"}>{t("Vihje", "Hint", "Pista")}</div>
      </div>
    );
  }
  return <div className="bar">{items}</div>;
}
