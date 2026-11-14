// Korttelikauppa: a city board game for 2–4 players (children, on one phone,
// or against the phone), in 3D on the streets of a small town.
//
// Throw two dice and go round the ring road. Buy the plots you stop on; on
// your own plots build a hut, a house, a block of flats and, when you own the
// whole block (two plots of one colour), a hotel. Others who stop on your plot
// pay rent: the bigger the building, the bigger the rent. Passing the start
// gives 150 €. The police take you to jail; out with doubles, a free card or
// 50 €. Surprise cards, an ice cream kiosk and a park where the fees end up.
// The game ends after the chosen rounds, or when someone cannot pay: the
// richest wins. The houses are Talot's (lib/house.ts), the rules lib/rules.ts.

import { N, SQ, START, JAIL, PARK, POLICE, KIOSK, PASS_BONUS, JAIL_FINE, KIOSK_FEE, MAX_LEVEL, BLOCK_COLORS, CARDS,
  Game, newGame as rulesNew, baseRent, buildCost, rent, rentAt, canBuild, buildable, wholeBlock, worth, buy, build, pay, path, stepsTo, drawCard,
  ranking, nextPlayer, aiBuy, aiBuild, aiPlan, aiJail, owned } from "lib/rules";
import { Spec, CATS, objects, visible, front, extent, Obj, Pic } from "lib/house";

// ---- names and pictures ----------------------------------------------------
const STREET: any = {
  siili: ["Siilipolku", "Hedgehog Path", "Senda del Erizo"], myyra: ["Myyräkuja", "Mole Lane", "Callejón del Topo"],
  kala: ["Kalatie", "Fish Road", "Calle del Pez"], simpukka: ["Simpukkakuja", "Shell Lane", "Callejón de la Concha"],
  perhonen: ["Perhoskuja", "Butterfly Lane", "Callejón Mariposa"], kukka: ["Kukkatie", "Flower Road", "Calle de las Flores"],
  kettu: ["Kettukatu", "Fox Street", "Calle del Zorro"], orava: ["Oravatie", "Squirrel Road", "Calle de la Ardilla"],
  mansikka: ["Mansikkakatu", "Strawberry Street", "Calle Fresa"], kirsikka: ["Kirsikkatie", "Cherry Road", "Calle Cereza"],
  aurinko: ["Aurinkokatu", "Sun Street", "Calle del Sol"], banaani: ["Banaanitie", "Banana Road", "Calle Plátano"],
  sammakko: ["Sammakkokatu", "Frog Street", "Calle de la Rana"], omena: ["Omenatie", "Apple Road", "Calle Manzana"],
  valas: ["Valaskatu", "Whale Street", "Calle de la Ballena"], meri: ["Merikatu", "Sea Street", "Calle del Mar"],
  start: ["Lähtö", "Start", "Salida"], jail: ["Vankila", "Jail", "Cárcel"], park: ["Puisto", "Park", "Parque"],
  police: ["Poliisi", "Police", "Policía"], kiosk: ["Jäätelökioski", "Ice cream kiosk", "Heladería"], chance: ["Yllätys", "Surprise", "Sorpresa"],
};
function sqName(i: number): string { const s = STREET[SQ[i].id]; return rg.t(s[0], s[1], s[2]); }
const TOK: any[] = [
  { id: "auto", color: "#e63946", emoji: "🚗", name: ["Auto", "Car", "Coche"], turn: ["Auton vuoro", "Car's turn", "Turno del coche"] },
  { id: "raketti", color: "#3a86ff", emoji: "🚀", name: ["Raketti", "Rocket", "Cohete"], turn: ["Raketin vuoro", "Rocket's turn", "Turno del cohete"] },
  { id: "ankka", color: "#f4b400", emoji: "🦆", name: ["Ankka", "Duck", "Pato"], turn: ["Ankan vuoro", "Duck's turn", "Turno del pato"] },
  { id: "kilpikonna", color: "#2a9d8f", emoji: "🐢", name: ["Kilpikonna", "Turtle", "Tortuga"], turn: ["Kilpikonnan vuoro", "Turtle's turn", "Turno de la tortuga"] },
];
function tokName(t: number): string { const n = TOK[t].name; return rg.t(n[0], n[1], n[2]); }
const LEVEL_NAME: any[] = [["Tontti", "Plot", "Terreno"], ["Maja", "Hut", "Cabaña"], ["Talo", "House", "Casa"], ["Kerrostalo", "Flats", "Edificio"], ["Hotelli", "Hotel", "Hotel"]];
function levelName(l: number): string { const n = LEVEL_NAME[l]; return rg.t(n[0], n[1], n[2]); }
// the buildings of the levels, as Talot houses
const SPEC: Spec[] = [
  { base: "", walls: "", door: "", win: "", roof: "", top: "", paint: "" },
  { base: "kivi", walls: "maja", door: "puu", win: "pieni", roof: "vihrea", top: "", paint: "" },
  { base: "kivi", walls: "punainen", door: "valkoinen", win: "risti", roof: "musta", top: "tiili", paint: "" },
  { base: "betoni", walls: "kerros", door: "lasi", win: "rivi", roof: "tasa", top: "antenni", paint: "" },
  { base: "betoni", walls: "kerros", door: "lasi", win: "rivi", roof: "torni", top: "lippu", paint: "#e9c46a" },
];
const JAIL_SPEC: Spec = { base: "betoni", walls: "linna", door: "kaari", win: "kapea", roof: "tasa", top: "", paint: "#8d99ae" };
const POLICE_SPEC: Spec = { base: "betoni", walls: "punainen", door: "lasi", win: "rivi", roof: "tasa", top: "antenni", paint: "#3a6ea5" };
const CARD_TEXT: any = {
  loysit: ["Löysit kadulta 50 euroa!", "You found 50 euros in the street!", "¡Encontraste 50 euros en la calle!"],
  synttarit: ["Synttärit! Jokainen antaa sinulle 20 euroa.", "Birthday! Everyone gives you 20 euros.", "¡Cumpleaños! Todos te dan 20 euros."],
  pyora: ["Pyörä hajosi. Korjaus maksaa 40 euroa.", "Your bike broke. The repair costs 40 euros.", "Se rompió tu bici. Arreglarla cuesta 40 euros."],
  piirustus: ["Voitit piirustuskilpailun! Saat 100 euroa.", "You won the drawing contest! You get 100 euros.", "¡Ganaste el concurso de dibujo! Recibes 100 euros."],
  lahtoon: ["Mene lähtöruutuun ja ota 150 euroa.", "Go to the start and take 150 euros.", "Ve a la salida y toma 150 euros."],
  vankilaan: ["Poliisi! Mene suoraan vankilaan.", "Police! Go straight to jail.", "¡Policía! Ve directo a la cárcel."],
  peruuta: ["Peruuta kolme askelta.", "Go back three steps.", "Retrocede tres pasos."],
  vapaa: ["Vapaakortti! Sillä pääset pois vankilasta.", "A free card! It gets you out of jail.", "¡Tarjeta libre! Te saca de la cárcel."],
  puistoon: ["Hyppää puistoon!", "Jump to the park!", "¡Salta al parque!"],
  jaatelo: ["Jäätelöä kaikille! Anna jokaiselle 10 euroa.", "Ice cream for everyone! Give everyone 10 euros.", "¡Helado para todos! Da 10 euros a cada uno."],
};
const CARD_ICON: any = { loysit: "💶", synttarit: "🎂", pyora: "🚲", piirustus: "🖍️", lahtoon: "🏁", vankilaan: "👮", peruuta: "⏪", vapaa: "🔑", puistoon: "🌳", jaatelo: "🍦" };
function T3(a: any): string { return rg.t(a[0], a[1], a[2]); }

// ---- state -----------------------------------------------------------------
type Dlg = { kind: string; sq: number; title: string; text: string; icon: string; color: string; btns: any[]; ai: number };
let phase = "menu";          // menu | setup | rules | play | over
let step = "";               // in play: turn | rolling | moving | dialog | wait
let g: Game = rulesNew([0, 1], [false, true], 0, () => rg.random());
let t = 0, aiClock = 0, waitT = 0, overT = 0;
let dlg: Dlg | null = null;
let msg = "";
let dice = [0, 0];
let rollClock = 0, rollJail = false;
let extra = false;              // doubles: the same player throws again
let shown: number[] = [];      // each player's position on screen (a float while moving)
let move: any = { path: [], i: 0, u: 0, fly: false, from: 0, then: "" };
let floats: any[] = [];        // "+150 €" texts rising from the panels
let setupN = 2, setupAi = [false, true, true, true], setupRounds = 10;
let builtLevel: number[] = []; // the levels drawn in 3D
let dropT: number[] = [];
let overview = false;
let saidRoll = 0;

function P() { return g.players[g.cur]; }
function rnd(): number { return rg.random(); }
function say(ids: any) { rg.say(ids); }

// ---- the board in the world ----------------------------------------------------
// the ring road's middle line is R from the middle; corners at (±R, ±R); the
// squares go round anticlockwise seen from above: from the start (R, R) towards -x
const R = 10, STEPW = 20 / 6, HOUSE_OUT = 2.9;
const NORM = [[0, 1], [-1, 0], [0, -1], [1, 0]];        // out from the board on each side
const TANG = [[-1, 0], [0, -1], [1, 0], [0, 1]];        // the way of going on each side
const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];    // a house's turn: its front to the road
function sqXZ(q: number): number[] {
  q = ((q % N) + N) % N;
  const side = Math.floor(q / 6), d = (q - side * 6) * STEPW;
  if (side === 0) return [R - d, R];
  if (side === 1) return [-R, R - d];
  if (side === 2) return [-R + d, -R];
  return [R, -R + d];
}
function sideOf(i: number): number { return Math.floor(i / 6) % 4; }
// the house's place on plot i
function houseXZ(i: number): number[] { const p = sqXZ(i), n = NORM[sideOf(i)]; return [p[0] + n[0] * HOUSE_OUT, p[1] + n[1] * HOUSE_OUT]; }
// the camera's turn at a (fractional) square: one side at a time, turning round the corners
function yawAt(q: number): number {
  const f = q / 6, k = Math.round(f), d = f - k;
  if (Math.abs(d) <= 1 / 6) return -((k - 1) + (d + 1 / 6) * 3) * Math.PI / 2;
  return -Math.floor(f) * Math.PI / 2;
}
// an object of a turned house: its place and facing in the world
function turnObj(o: Obj, cx: number, cz: number, a: number) {
  const c = Math.cos(a), s = Math.sin(a), x = o.x, z = o.z;
  o.x = cx + x * c + z * s;
  o.z = cz - x * s + z * c;
  if (o.face !== 99) o.face += a;
}
function addObj(o: Obj, a: number, group: number, dy: number) {
  rg.three("add", { id: o.id, shape: o.shape, size: o.size, color: o.color, x: o.x, y: o.y + dy, z: o.z, rx: o.rx, ry: o.ry, rz: o.rz, wy: a,
    sx: o.sx, sy: o.sy, sz: o.sz, layer: o.layer, detail: o.detail, visible: o.vis, group });
}
// the objects of a Talot house at (cx, cz) turned by a
function houseObjs(s: Spec, prefix: string, cx: number, cz: number, a: number): Obj[] {
  const out = objects(s, CATS, prefix, 0);
  for (const o of out) turnObj(o, cx, cz, a);
  return out;
}

let houses: any[] = [];       // per square: { objs, a, on } of the building on it
let fixed: any[] = [];        // the jail and the police station: { objs, a, x, z, on }

function setHouse(i: number, drop: boolean) {
  const h = houses[i];
  if (h) for (const o of h.objs) rg.three("remove", { id: o.id });
  houses[i] = null;
  const l = g.level[i];
  builtLevel[i] = l;
  if (!l) return;
  const hp = houseXZ(i), a = YAW[sideOf(i)];
  const objs = houseObjs(SPEC[l], "h" + i + "_" + l + "_", hp[0], hp[1], a);
  houses[i] = { objs, a, on: true, x: hp[0], z: hp[1] };
  dropT[i] = drop ? t : -10;
  for (const o of objs) { o.vis = visible(o, CAM); addObj(o, a, i + 1, drop ? 5 : 0); }
}

function scene() {
  rg.three("clear");
  rg.three("scene", { background: ["#7cc8f5", "#e3f6ff"], ground: { y: 0, color: "#86c95f" } });
  rg.three("light", { id: "sun", type: "directional", x: 4, y: 8, z: 3, intensity: 0.65 });
  rg.three("light", { id: "ambient", type: "ambient", intensity: 0.45 });
  // the ring road and its square lines
  const L = 2 * R + 1.8;
  rg.three("add", { id: "rd0", shape: "box", size: [L, 0.02, 1.8], color: "#5c636a", x: 0, y: 0.01, z: R, layer: -1 });
  rg.three("add", { id: "rd2", shape: "box", size: [L, 0.02, 1.8], color: "#5c636a", x: 0, y: 0.01, z: -R, layer: -1 });
  rg.three("add", { id: "rd1", shape: "box", size: [1.8, 0.02, L], color: "#5c636a", x: -R, y: 0.01, z: 0, layer: -1 });
  rg.three("add", { id: "rd3", shape: "box", size: [1.8, 0.02, L], color: "#5c636a", x: R, y: 0.01, z: 0, layer: -1 });
  for (let i = 0; i < N; i++) {
    const s = sideOf(i), j = i % 6;
    if (j === 0) continue;
    // a white line before and after each side square
    for (const h of [-0.5, 0.5]) {
      if ((j === 1 && h < 0) || (j === 5 && h > 0)) continue;
      const p = sqXZ(i + h), tg = TANG[s];
      rg.three("add", { id: "ln" + i + "_" + h, shape: "box", size: tg[0] ? [0.08, 0.02, 1.7] : [1.7, 0.02, 0.08], color: "#e9ecef", x: p[0], y: 0.02, z: p[1], layer: -1 });
    }
    const p = sqXZ(i), n = NORM[s], tg = TANG[s];
    const sq = SQ[i];
    // the plot: a sand-coloured yard and a stripe of the block's colour by the road
    const w = STEPW - 0.25, d = 3.5;
    const yard = sq.kind === "plot" ? "#d8c79a" : sq.kind === "chance" ? "#ffe8a3" : "#f6d0e0";
    const cx = p[0] + n[0] * (0.9 + d / 2 + 0.1), cz = p[1] + n[1] * (0.9 + d / 2 + 0.1);
    rg.three("add", { id: "yd" + i, shape: "box", size: tg[0] ? [w, 0.02, d] : [d, 0.02, w], color: yard, x: cx, y: 0.015, z: cz, layer: -1 });
    if (sq.kind === "plot") {
      const sx = p[0] + n[0] * 1.15, sz = p[1] + n[1] * 1.15;
      rg.three("add", { id: "st" + i, shape: "box", size: tg[0] ? [w, 0.03, 0.42] : [0.42, 0.03, w], color: BLOCK_COLORS[sq.block], x: sx, y: 0.025, z: sz, layer: -1 });
      // the owner's flag at the corner of the plot
      const fx = p[0] + n[0] * 1.5 + tg[0] * (w / 2 - 0.2), fz = p[1] + n[1] * 1.5 + tg[1] * (w / 2 - 0.2);
      rg.three("add", { id: "fp" + i, shape: "cylinder", size: [0.04, 0.04, 1.3], color: "#495057", x: fx, y: 0.65, z: fz, detail: 6, visible: false });
      rg.three("add", { id: "ff" + i, shape: "box", size: [0.55, 0.36, 0.04], color: "#ffffff", x: fx - tg[0] * 0.3, y: 1.1, z: fz - tg[1] * 0.3, wy: YAW[s], visible: false });
    } else if (sq.kind === "chance") gift("gf" + i, cx, cz, YAW[s]);
    else if (sq.kind === "kiosk") kiosk(cx, cz, YAW[s]);
  }
  corners();
  middle();
  houses = []; builtLevel = []; dropT = [];
  for (let i = 0; i < N; i++) { houses.push(null); builtLevel.push(0); dropT.push(-10); }
  for (let i = 0; i < N; i++) if (g.level[i]) setHouse(i, false);
  flags();
  for (let k = 0; k < g.players.length; k++) pieceAdd(k);
}
// a present box on a surprise square
function gift(id: string, x: number, z: number, a: number) {
  rg.three("add", { id: id + "b", shape: "box", size: [1.0, 0.8, 1.0], color: "#9b5de5", x, y: 0.4, z, wy: a + 0.3 });
  rg.three("add", { id: id + "r1", shape: "box", size: [1.04, 0.82, 0.18], color: "#ffd166", x, y: 0.41, z, wy: a + 0.3 });
  rg.three("add", { id: id + "r2", shape: "box", size: [0.18, 0.82, 1.04], color: "#ffd166", x, y: 0.41, z, wy: a + 0.3 });
  rg.three("add", { id: id + "k", shape: "sphere", size: [0.2], color: "#ffd166", x, y: 0.88, z, detail: 8 });
}
function kiosk(x: number, z: number, a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  const at = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const k = at(0, 0);
  rg.three("add", { id: "ki_b", shape: "box", size: [1.6, 1.0, 1.1], color: "#ffffff", x: k[0], y: 0.5, z: k[1], wy: a, group: 201 });
  rg.three("add", { id: "ki_w", shape: "box", size: [1.1, 0.4, 0.04], color: "#8fd3f4", x: at(0, 0.56)[0], y: 0.7, z: at(0, 0.56)[1], wy: a, layer: 1, group: 201 });
  rg.three("add", { id: "ki_r", shape: "roof", size: [1.4, 0.35, 1.9], color: "#f15bb5", x: k[0], y: 1.0, z: k[1], wy: a + Math.PI / 2, layer: 2, group: 201 });
  const ic = at(0.95, 0.6);
  rg.three("add", { id: "ki_c", shape: "cone", size: [0.22, 0.7], color: "#e0a458", x: ic[0], y: 0.35, z: ic[1], rx: Math.PI });
  rg.three("add", { id: "ki_s", shape: "sphere", size: [0.27], color: "#ffafcc", x: ic[0], y: 0.82, z: ic[1], detail: 8 });
}
function corners() {
  fixed = [];
  // jail and police station, facing the middle of the board
  const J = [-R - 2.7, R + 2.7], Pc = [R + 2.7, -R - 2.7];
  const jo = houseObjs(JAIL_SPEC, "jl_", J[0], J[1], 3 * Math.PI / 4);
  for (const o of jo) { o.vis = true; addObj(o, 3 * Math.PI / 4, 101, 0); }
  fixed.push({ objs: jo, a: 3 * Math.PI / 4, x: J[0], z: J[1] });
  // bars in front of the jail's windows: a striped fence
  for (let k = -3; k <= 3; k++) {
    const u = k * 0.32, x = J[0] + 1.9 * 0.707 + u * 0.707, z = J[1] - 1.9 * 0.707 + u * 0.707;
    rg.three("add", { id: "jb" + k, shape: "box", size: [0.07, 1.0, 0.07], color: "#343a40", x, y: 0.5, z });
  }
  const po = houseObjs(POLICE_SPEC, "po_", Pc[0], Pc[1], -Math.PI / 4);
  for (const o of po) { o.vis = true; addObj(o, -Math.PI / 4, 102, 0); }
  fixed.push({ objs: po, a: -Math.PI / 4, x: Pc[0], z: Pc[1] });
  rg.three("add", { id: "pl_r", shape: "sphere", size: [0.18], color: "#e63946", x: Pc[0] - 0.3, y: 2.25, z: Pc[1] + 0.3, emissive: true, detail: 8 });
  rg.three("add", { id: "pl_b", shape: "sphere", size: [0.18], color: "#3a86ff", x: Pc[0] + 0.3, y: 2.25, z: Pc[1] - 0.3, emissive: true, detail: 8 });
  // a police car by the station
  const pc = [R + 1.6, -R - 0.6];
  rg.three("add", { id: "pc_b", shape: "box", size: [0.6, 0.28, 1.1], color: "#f8f9fa", x: pc[0], y: 0.24, z: pc[1] });
  rg.three("add", { id: "pc_s", shape: "box", size: [0.62, 0.1, 1.12], color: "#1d4e89", x: pc[0], y: 0.22, z: pc[1] });
  rg.three("add", { id: "pc_c", shape: "box", size: [0.5, 0.22, 0.55], color: "#1d4e89", x: pc[0], y: 0.48, z: pc[1] - 0.05 });
  rg.three("add", { id: "pc_l", shape: "box", size: [0.3, 0.08, 0.12], color: "#3a86ff", x: pc[0], y: 0.63, z: pc[1] - 0.05, emissive: true });
  // the start: a gate over the road
  const S = sqXZ(START);
  for (const d of [-1, 1]) rg.three("add", { id: "sg" + d, shape: "cylinder", size: [0.12, 0.12, 2.4], color: "#ffffff", x: S[0] + d * 1.2 * 0.707, y: 1.2, z: S[1] - d * 1.2 * 0.707, detail: 8 });
  rg.three("add", { id: "sg_t", shape: "box", size: [2.8, 0.5, 0.12], color: "#06d6a0", x: S[0], y: 2.4, z: S[1], wy: Math.PI / 4 });
  for (let k = 0; k < 6; k++) rg.three("add", { id: "sg_c" + k, shape: "box", size: [0.42, 0.42, 0.02], color: k % 2 ? "#212529" : "#ffffff", x: S[0] + (k - 2.5) * 0.42 * 0.707, y: 2.4, z: S[1] - (k - 2.5) * 0.42 * 0.707 + 0.0, wy: Math.PI / 4, layer: 1 });
  rg.three("add", { id: "sg_g", shape: "box", size: [2.6, 0.03, 2.6], color: "#e9ecef", x: S[0] + 2.2, y: 0.02, z: S[1] + 2.2, layer: -1 });
  // the park: trees and a fountain
  const Pk = [-R - 2.5, -R - 2.5];
  rg.three("add", { id: "pk_g", shape: "box", size: [3.6, 0.02, 3.6], color: "#5cb85c", x: Pk[0], y: 0.02, z: Pk[1], layer: -1 });
  rg.three("add", { id: "pk_f", shape: "cylinder", size: [0.9, 1.0, 0.35], color: "#adb5bd", x: Pk[0] + 0.5, y: 0.17, z: Pk[1] + 0.5, detail: 14 });
  rg.three("add", { id: "pk_w", shape: "cylinder", size: [0.75, 0.75, 0.05], color: "#4cc9f0", x: Pk[0] + 0.5, y: 0.36, z: Pk[1] + 0.5, detail: 14 });
  rg.three("add", { id: "pk_j", shape: "cylinder", size: [0.08, 0.15, 0.8], color: "#90e0ef", x: Pk[0] + 0.5, y: 0.75, z: Pk[1] + 0.5, detail: 8 });
  tree("pk_t1", Pk[0] - 1.1, Pk[1] - 0.6, 1.0);
  tree("pk_t2", Pk[0] - 0.4, Pk[1] - 1.3, 0.85);
  tree("pk_t3", Pk[0] + 1.3, Pk[1] - 1.2, 0.9);
}
function tree(id: string, x: number, z: number, s: number) {
  rg.three("add", { id: id + "s", shape: "cylinder", size: [0.12 * s, 0.16 * s, 0.8 * s], color: "#7a4f2a", x, y: 0.4 * s, z, detail: 6 });
  rg.three("add", { id: id + "c", shape: "cone", size: [0.7 * s, 1.6 * s], color: "#2d6a4f", x, y: 0.8 * s + 0.8 * s, z, detail: 8 });
}
// the middle of the town: a pond, trees and flowers
function middle() {
  rg.three("add", { id: "md_p", shape: "cylinder", size: [3.2, 3.2, 0.02], color: "#48cae4", x: 0, y: 0.02, z: 0, detail: 18, layer: -1 });
  rg.three("add", { id: "md_s", shape: "cylinder", size: [3.6, 3.6, 0.02], color: "#e9d8a6", x: 0, y: 0.01, z: 0, detail: 18, layer: -1 });
  // low bushes and flower beds (nothing tall: the camera looks over the middle)
  const B = [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5], [0, -6.0], [-6.0, 0], [6.0, 0], [0, 6.0]];
  B.forEach((p, k) => {
    rg.three("add", { id: "md_b" + k, shape: "sphere", size: [0.45], color: k % 2 ? "#52b788" : "#40916c", x: p[0], y: 0.25, z: p[1], sy: 0.6, detail: 8 });
    rg.three("add", { id: "md_f" + k, shape: "cylinder", size: [0.9, 0.9, 0.02], color: ["#ffafcc", "#ffd166", "#cdb4db", "#ff8fab"][k % 4], x: p[0] * 0.75, y: 0.02, z: p[1] * 0.75, detail: 10, layer: -1 });
  });
  // a duck in the pond
  rg.three("add", { id: "md_d", shape: "sphere", size: [0.22], color: "#ffffff", x: -1.2, y: 0.12, z: 1.0, sz: 1.3, detail: 8 });
  rg.three("add", { id: "md_h", shape: "sphere", size: [0.13], color: "#ffffff", x: -1.2, y: 0.33, z: 1.25, detail: 8 });
}
// the owners' flags
function flags() {
  for (let i = 0; i < N; i++) {
    if (SQ[i].kind !== "plot") continue;
    const o = g.owner[i];
    rg.three("set", { id: "fp" + i, visible: o >= 0 });
    rg.three("set", { id: "ff" + i, visible: o >= 0, color: o >= 0 ? TOK[g.players[o].tok].color : "#ffffff" });
  }
}

// ---- the pieces ---------------------------------------------------------------
const PS = 1.5;
// [shape, size, color, x, y, z, rx, rz] facing +z
const PARTS: any[] = [
  [["box", [0.5, 0.22, 0.8], "#e63946", 0, 0.2, 0, 0, 0], ["box", [0.42, 0.2, 0.42], "#a8dadc", 0, 0.41, -0.05, 0, 0],
   ["cylinder", [0.12, 0.12, 0.08], "#212529", 0.27, 0.12, 0.26, 0, Math.PI / 2], ["cylinder", [0.12, 0.12, 0.08], "#212529", -0.27, 0.12, 0.26, 0, Math.PI / 2],
   ["cylinder", [0.12, 0.12, 0.08], "#212529", 0.27, 0.12, -0.26, 0, Math.PI / 2], ["cylinder", [0.12, 0.12, 0.08], "#212529", -0.27, 0.12, -0.26, 0, Math.PI / 2]],
  [["cylinder", [0.16, 0.16, 0.55], "#3a86ff", 0, 0.42, 0, 0, 0], ["cone", [0.16, 0.3], "#e63946", 0, 0.84, 0, 0, 0],
   ["box", [0.5, 0.22, 0.04], "#e63946", 0, 0.24, 0, 0, 0], ["box", [0.04, 0.22, 0.5], "#e63946", 0, 0.24, 0, 0, 0],
   ["sphere", [0.07], "#ffffff", 0, 0.52, 0.14, 0, 0]],
  [["sphere", [0.26], "#ffd60a", 0, 0.28, -0.04, 0, 0], ["sphere", [0.17], "#ffd60a", 0, 0.6, 0.14, 0, 0],
   ["cone", [0.07, 0.18], "#f77f00", 0, 0.58, 0.36, Math.PI / 2, 0], ["sphere", [0.035], "#212529", 0.08, 0.66, 0.28, 0, 0], ["sphere", [0.035], "#212529", -0.08, 0.66, 0.28, 0, 0]],
  [["cylinder", [0.34, 0.34, 0.08], "#8ac926", 0, 0.08, 0, 0, 0], ["dome", [0.32], "#2a9d8f", 0, 0.1, 0, 0, 0],
   ["sphere", [0.12], "#8ac926", 0, 0.18, 0.4, 0, 0], ["sphere", [0.08], "#8ac926", 0.24, 0.06, 0.22, 0, 0], ["sphere", [0.08], "#8ac926", -0.24, 0.06, 0.22, 0, 0],
   ["sphere", [0.08], "#8ac926", 0.24, 0.06, -0.22, 0, 0], ["sphere", [0.08], "#8ac926", -0.24, 0.06, -0.22, 0, 0]],
];
function pieceAdd(k: number) {
  const parts = PARTS[g.players[k].tok];
  parts.forEach((q: any, j: number) => rg.three("add", { id: "pc" + k + "_" + j, shape: q[0], size: q[1].map((v: number) => v * PS), color: q[2], rx: q[6], rz: q[7], detail: 8 }));
  piecePlace(k, 0, 0, 0, 0);
}
function piecePlace(k: number, x: number, y: number, z: number, h: number) {
  const parts = PARTS[g.players[k].tok], c = Math.cos(h), s = Math.sin(h);
  const vis = !g.players[k].out;
  parts.forEach((q: any, j: number) => {
    const lx = q[3] * PS, lz = q[5] * PS;
    rg.three("set", { id: "pc" + k + "_" + j, x: x + lx * c + lz * s, y: y + q[4] * PS, z: z - lx * s + lz * c, wy: h, visible: vis });
  });
}
function heading(q: number): number { const tg = TANG[sideOf(Math.floor(((q % N) + N) % N))]; return Math.atan2(tg[0], tg[1]); }
// where piece k stands now (and the hop of a move)
function piecePos(k: number): number[] {
  const p = g.players[k];
  const q = shown[k];
  let xz = sqXZ(q), y = 0.03;
  let h = heading(q);
  const moving = step === "moving" && k === g.cur;
  if (moving && move.fly) {
    const a = sqXZ(move.from), b = sqXZ(move.path[0]), u = move.u;
    xz = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    y += Math.sin(u * Math.PI) * 5;
    h = t * 6;
  } else if (moving) {
    y += Math.abs(Math.sin(move.u * Math.PI)) * 0.7;
    if (move.back) h += Math.PI;
  } else {
    if (p.jail > 0) {
      // behind the jail's bars
      const J = sqXZ(JAIL), m = jailMates().indexOf(k);
      return [J[0] - 1.1 + (m - 0.5) * 0.5 * 0.707, 0.03, J[1] + 1.1 + (m - 0.5) * 0.5 * 0.707, 3 * Math.PI / 4];
    }
    // several on one square stand side by side
    const here: number[] = [];
    g.players.forEach((o, j) => { if (!o.out && o.jail === 0 && Math.round(shown[j]) % N === Math.round(q) % N) here.push(j); });
    if (here.length > 1) {
      const m = here.indexOf(k), s = sideOf(Math.round(q) % N), tg = TANG[s], n = NORM[s];
      const off = [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.4], [0.4, 0.4]][m];
      xz = [xz[0] + tg[0] * off[0] + n[0] * off[1], xz[1] + tg[1] * off[0] + n[1] * off[1]];
    }
  }
  return [xz[0], y, xz[1], h];
}
function jailMates(): number[] { const out: number[] = []; g.players.forEach((p, j) => { if (p.jail > 0 && !p.out) out.push(j); }); return out; }

// ---- the camera --------------------------------------------------------------------
const FOV = 50, TOPH = 64, BOTH = 150;
let CAM = [0, 30, 20], LOOK = [0, 0, 0];
let camYaw = 0, camSet = false, userYaw = 0;
let camPos = [0, 30, 20], camLook = [0, 0, 0];
function focusQ(): number {
  const p = P();
  if (p.jail > 0 && step !== "moving") return JAIL;
  return shown[g.cur];
}
function camStep(dt: number) {
  let tc: number[], tl: number[];
  if (overview) {
    tc = [0, 56, 29]; tl = [0, 0, 1.5];
  } else {
    const q = focusQ();
    let want = yawAt(q) + userYaw;
    while (want - camYaw > Math.PI) want -= Math.PI * 2;
    while (want - camYaw < -Math.PI) want += Math.PI * 2;
    camYaw = camSet ? camYaw + (want - camYaw) * (1 - Math.exp(-dt * 3)) : want;
    const p = sqXZ(q), n = [Math.sin(camYaw), Math.cos(camYaw)];
    tl = [p[0] + n[0] * 3.0, 1.0, p[1] + n[1] * 3.0];
    tc = [p[0] - n[0] * 10.5, 6.4, p[1] - n[1] * 10.5];
  }
  const a = camSet ? 1 - Math.exp(-dt * 6) : 1;
  for (let k = 0; k < 3; k++) { camPos[k] += (tc[k] - camPos[k]) * a; camLook[k] += (tl[k] - camLook[k]) * a; }
  camSet = true;
  // the view is between the top bar and the bottom panel: the look point is moved
  // so that it shows in the middle of that space
  CAM = camPos.slice(); LOOK = camLook.slice();
  rg.three("camera", { x: CAM[0], y: CAM[1], z: CAM[2], lookAt: shiftLook(), fov: FOV });
  cull();
}
function shiftLook(): number[] {
  const want = (TOPH + height - BOTH) / 2, dy = height / 2 - want;   // pixels the middle is above the screen's middle
  const f = [LOOK[0] - CAM[0], LOOK[1] - CAM[1], LOOK[2] - CAM[2]];
  const dist = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
  const focal = (height / 2) / Math.tan(FOV * Math.PI / 360);
  // looking a little lower moves the world up on the screen
  return [LOOK[0], LOOK[1] - dy * dist / focal, LOOK[2]];
}
// buildings out of sight are not drawn, nor the things on walls that face away
let lastCull = [999, 999, 999];
function cull() {
  const moved = Math.abs(CAM[0] - lastCull[0]) + Math.abs(CAM[1] - lastCull[1]) + Math.abs(CAM[2] - lastCull[2]);
  if (moved < 0.15) return;
  lastCull = CAM.slice();
  const f = [LOOK[0] - CAM[0], LOOK[2] - CAM[2]], fl = Math.sqrt(f[0] * f[0] + f[1] * f[1]) || 1;
  const fx = f[0] / fl, fz = f[1] / fl;
  const check = (h: any) => {
    const dx = h.x - CAM[0], dz = h.z - CAM[2];
    const z = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
    const on = overview || (z > -3 && z < 30 && side < z * 0.75 + 5);
    for (const o of h.objs) {
      const v = on && visible(o, CAM);
      if (v !== o.vis) { o.vis = v; rg.three("set", { id: o.id, visible: v }); }
    }
  };
  for (const h of houses) if (h) check(h);
  for (const h of fixed) check(h);
}

// ---- the game's flow -----------------------------------------------------------------
function startGame() {
  const toks: number[] = [], ais: boolean[] = [];
  for (let k = 0; k < setupN; k++) { toks.push(k); ais.push(setupAi[k]); }
  g = rulesNew(toks, ais, setupRounds, rnd);
  shown = g.players.map(() => START);
  phase = "play"; overT = 0; floats = []; saidRoll = 0; camSet = false; overview = false; userYaw = 0;
  scene();
  rg.sound("click");
  startTurn();
}
function save() {
  if (phase !== "play" || g.over) { rg.save("game", ""); return; }
  rg.save("game", JSON.stringify(g));
}
function resume() {
  const s = rg.load("game", "");
  if (!s) return;
  g = JSON.parse(s);
  shown = g.players.map((p) => p.pos);
  phase = "play"; overT = 0; floats = []; camSet = false; overview = false; userYaw = 0;
  scene();
  rg.sound("click");
  startTurn();
}

function startTurn() {
  dlg = null; dice = [0, 0]; extra = false; aiClock = 0; userYaw = 0;
  const p = P();
  if (p.jail > 0) {
    step = "dialog";
    jailDialog();
    say(["kt_vuoro_" + p.tok, "kt_vankilassa"]);
  } else {
    step = "turn";
    msg = T3(TOK[p.tok].turn) + ": " + rg.t("heitä nopat!", "throw the dice!", "¡tira los dados!");
    say(saidRoll++ < 2 && !p.ai ? ["kt_vuoro_" + p.tok, "kt_heita"] : "kt_vuoro_" + p.tok);
  }
  save();
}
function roll(jail: boolean) {
  if (step !== "turn" && !(jail && step === "dialog")) return;
  dlg = null;
  rollJail = jail;
  dice = [rg.range(1, 6), rg.range(1, 6)];
  rollClock = 0;
  step = "rolling"; aiClock = 0;
  const c = dieHome();
  for (let k = 0; k < 2; k++) {
    roll3[k] = { x0: c[0] + (k ? 40 : -40), y0: c[1], x1: c[0] + (k ? 50 : -50) + (rnd() - 0.5) * 50, y1: c[1] + (rnd() - 0.5) * 40,
      sa: (3 + rnd() * 3) * Math.PI * (rnd() < 0.5 ? -1 : 1), sb: (3 + rnd() * 3) * Math.PI * (rnd() < 0.5 ? -1 : 1), sc: (1 + rnd() * 2) * Math.PI * (rnd() < 0.5 ? -1 : 1) };
  }
  rg.sound("whoosh");
  rg.vibrate(20);
}
function rolled() {
  const p = P(), sum = dice[0] + dice[1], dbl = dice[0] === dice[1];
  rg.sound("pop", { pitch: 0.8 + sum * 0.05 });
  if (rollJail) {
    if (dbl) {
      p.jail = 0;
      rg.sound("coin");
      msg = rg.t("Tuplat! Pääsit vapaaksi.", "Doubles! You are free.", "¡Dobles! Estás libre.");
      say(["kt_tuplat_vapaa"]);
      walk(sum, false);
      return;
    }
    p.jail++;
    if (p.jail > 3) {
      // the third try: pay and go
      payTo(g.cur, -2, JAIL_FINE);
      p.jail = 0;
      msg = rg.t("Kolmas yritys: maksoit " + JAIL_FINE + " € ja lähdet.", "Third try: you paid " + JAIL_FINE + " € and go.", "Tercer intento: pagaste " + JAIL_FINE + " € y sales.");
      say(["kt_kolmas"]);
      if (g.over) { gameOver(); return; }
      walk(sum, false);
      return;
    }
    info(rg.t("Ei tuplia", "No doubles", "No hay dobles"), rg.t("Odota vankilassa seuraavaan vuoroon.", "Wait in jail until your next turn.", "Espera en la cárcel hasta tu próximo turno."), "🔒", "#6c757d", "kt_ei_tuplia");
    return;
  }
  if (dbl) {
    g.doubles++;
    if (g.doubles >= 3) {
      msg = rg.t("Kolmet tuplat! Poliisi vie vankilaan.", "Three doubles! The police take you to jail.", "¡Tres dobles! La policía te lleva a la cárcel.");
      say(["kt_kolmet_tuplat"]);
      toJail();
      return;
    }
    extra = true;
  }
  msg = rg.t("Sait " + sum + ".", "You got " + sum + ".", "Sacaste " + sum + ".") + (dbl ? rg.t(" Tuplat!", " Doubles!", " ¡Dobles!") : "");
  if (!p.ai) say(dbl ? [rg.sayId.number(sum), "kt_tuplat"] : rg.sayId.number(sum));
  walk(sum, false);
}
// a move of n squares along the road (n < 0: backwards)
function walk(n: number, then: boolean) {
  const p = P();
  move = { path: path(p.pos, n), i: 0, u: 0, fly: false, from: p.pos, back: n < 0 };
  step = "moving";
}
function fly(to: number) {
  const p = P();
  move = { path: [to], i: 0, u: 0, fly: true, from: p.pos, back: false };
  step = "moving";
  rg.sound("whoosh");
}
function toJail() {
  const p = P();
  extra = false;
  p.jail = 1;
  fly(JAIL);
}
function moveStep(dt: number) {
  const p = P();
  move.u += dt * (move.fly ? 0.9 : 3.6);
  if (!move.fly) {
    const prev = move.i === 0 ? move.from : move.path[move.i - 1];
    let next = move.path[move.i];
    if (!move.back && next < prev) next += N;
    if (move.back && next > prev) next -= N;
    shown[g.cur] = prev + (next - prev) * Math.min(1, move.u);
  }
  while (move.u >= 1 && step === "moving") {
    move.u -= 1;
    const sq = move.path[move.i];
    if (!move.fly) {
      rg.sound("pop", { pitch: 1.1 + (move.i % 2) * 0.15, volume: 0.5 });
      // passing (or landing on) the start
      if (!move.back && sq === START) {
        p.money += PASS_BONUS;
        float(g.cur, "+" + PASS_BONUS + " €", "#06d6a0");
        rg.sound("coin");
        say("kt_lahto");
      }
    }
    p.pos = sq;
    shown[g.cur] = sq;
    move.i++;
    if (move.i >= move.path.length) {
      if (move.fly) { move.u = 0; rg.sound("hit"); rg.vibrate(40); }
      arrive();
    }
  }
}

function arrive() {
  const p = P(), i = p.pos, sq = SQ[i];
  step = "dialog";
  aiClock = 0;
  if (p.jail > 0) {
    info(rg.t("Vankilassa", "In jail", "En la cárcel"), rg.t("Pääset pois tuplilla, vapaakortilla tai maksamalla " + JAIL_FINE + " €.", "Get out with doubles, a free card or " + JAIL_FINE + " €.", "Sales con dobles, una tarjeta libre o " + JAIL_FINE + " €."), "🔒", "#6c757d", "kt_vankilaan");
    return;
  }
  if (sq.kind === "plot") {
    const o = g.owner[i];
    if (o < 0) {
      if (p.money >= sq.price) {
        dlg = { kind: "deed", sq: i, title: sqName(i), text: rg.t("Ostatko tontin " + sq.price + " eurolla?", "Buy the plot for " + sq.price + " euros?", "¿Compras el terreno por " + sq.price + " euros?"), icon: "", color: BLOCK_COLORS[sq.block],
          btns: [{ id: "buy", label: "🏷️ " + rg.t("Osta", "Buy", "Comprar") + " " + sq.price + " €", cls: "go", act: () => doBuy(i) }, { id: "nobuy", label: rg.t("Ei nyt", "Not now", "Ahora no"), cls: "back", act: () => endTurn() }],
          ai: aiBuy(g, g.cur, i) ? 0 : 1 };
        say(p.ai ? [] : ["kt_k_" + sq.id, "kt_osta"]);
      } else {
        dlg = { kind: "deed", sq: i, title: sqName(i), text: rg.t("Tontti maksaa " + sq.price + " €. Rahasi eivät riitä.", "The plot costs " + sq.price + " €. You don't have enough money.", "El terreno cuesta " + sq.price + " €. No tienes suficiente dinero."), icon: "", color: BLOCK_COLORS[sq.block],
          btns: [{ id: "ok", label: rg.t("Selvä", "OK", "Vale"), cls: "go", act: () => endTurn() }], ai: 0 };
        say(p.ai ? [] : "kt_ei_rahaa");
      }
    } else if (o === g.cur) {
      if (canBuild(g, g.cur, i) && p.money >= buildCost(i)) {
        const l = g.level[i] + 1;
        dlg = { kind: "deed", sq: i, title: sqName(i), text: rg.t("Oma tonttisi! Rakennetaanko " + levelName(l).toLowerCase() + " (" + buildCost(i) + " €)?", "Your own plot! Build a " + levelName(l).toLowerCase() + " (" + buildCost(i) + " €)?", "¡Tu terreno! ¿Construyes: " + levelName(l).toLowerCase() + " (" + buildCost(i) + " €)?"), icon: "", color: BLOCK_COLORS[sq.block],
          btns: [{ id: "build", label: "🔨 " + rg.t("Rakenna", "Build", "Construir") + " " + buildCost(i) + " €", cls: "go", act: () => { doBuild(i); endTurn(); } }, { id: "nobuild", label: rg.t("Ei nyt", "Not now", "Ahora no"), cls: "back", act: () => endTurn() }],
          ai: aiBuild(g, g.cur, i) ? 0 : 1 };
        say(p.ai ? [] : "kt_oma_rakenna");
      } else {
        const why = g.level[i] >= MAX_LEVEL ? rg.t("Hotelli on valmis.", "The hotel is ready.", "El hotel está listo.")
          : g.level[i] === MAX_LEVEL - 1 && !wholeBlock(g, i) ? rg.t("Hotellin saa rakentaa, kun koko kortteli on sinun.", "You can build a hotel when the whole block is yours.", "Puedes construir un hotel cuando toda la manzana sea tuya.")
          : rg.t("Rahat eivät riitä rakentamiseen.", "Not enough money to build.", "No tienes dinero para construir.");
        msg = rg.t("Oma tontti. ", "Your own plot. ", "Tu terreno. ") + why;
        say(p.ai ? [] : "kt_oma");
        wait(1.4);
      }
    } else {
      const r = rent(g, i), ow = g.players[o];
      dlg = { kind: "deed", sq: i, title: sqName(i), text: rg.t(tokName(ow.tok) + " omistaa tontin. Maksa vuokraa " + r + " €.", tokName(ow.tok) + " owns this plot. Pay " + r + " € rent.", "El terreno es de " + tokName(ow.tok) + ". Paga " + r + " € de alquiler."), icon: "", color: BLOCK_COLORS[sq.block],
        btns: [{ id: "rent", label: "💶 " + rg.t("Maksa", "Pay", "Pagar") + " " + r + " €", cls: "open", act: () => { payTo(g.cur, o, r); endTurn(); } }], ai: 0 };
      say(["kt_vuokra_" + ow.tok]);
    }
    return;
  }
  if (sq.kind === "chance") { card(); return; }
  if (sq.kind === "kiosk") {
    info(sqName(i), rg.t("Jäätelö maksaa " + KIOSK_FEE + " €. Raha menee puistoon.", "An ice cream costs " + KIOSK_FEE + " €. The money goes to the park.", "Un helado cuesta " + KIOSK_FEE + " €. El dinero va al parque."), "🍦", "#f15bb5", "kt_kioski");
    dlg.btns[0].act = () => { payTo(g.cur, -2, KIOSK_FEE); endTurn(); };
    return;
  }
  if (sq.kind === "park") {
    if (g.pot > 0) {
      const pot = g.pot;
      info(sqName(i), rg.t("Löysit puistosta lompakon: " + pot + " €!", "You found a wallet in the park: " + pot + " €!", "¡Encontraste una cartera en el parque: " + pot + " €!"), "👛", "#5cb85c", "kt_puisto");
      dlg.btns[0].act = () => { p.money += pot; g.pot = 0; float(g.cur, "+" + pot + " €", "#06d6a0"); rg.sound("coin"); endTurn(); };
    } else { msg = rg.t("Lepotauko puistossa.", "A rest in the park.", "Un descanso en el parque."); say(p.ai ? [] : "kt_lepo"); wait(1.2); }
    return;
  }
  if (sq.kind === "police") {
    info(sqName(i), rg.t("Poliisi vie sinut vankilaan!", "The police take you to jail!", "¡La policía te lleva a la cárcel!"), "👮", "#3a6ea5", "kt_poliisi");
    dlg.btns[0].act = () => { dlg = null; toJail(); };
    return;
  }
  if (sq.kind === "jail") { msg = rg.t("Vierailet vankilassa.", "Just visiting the jail.", "Solo visitas la cárcel."); say(p.ai ? [] : "kt_vierailu"); wait(1.2); return; }
  wait(0.6);
}
function wait(s: number) { dlg = null; step = "wait"; waitT = s; }
function info(title: string, text: string, icon: string, color: string, clip: string) {
  dlg = { kind: "info", sq: -1, title, text, icon, color, btns: [{ id: "ok", label: rg.t("Selvä", "OK", "Vale"), cls: "go", act: () => endTurn() }], ai: 0 };
  step = "dialog"; aiClock = 0;
  if (clip) say(clip);
}

function card() {
  const c = drawCard(g, rnd), id = CARDS[c], p = P();
  const next = (fn: () => void) => () => { dlg = null; fn(); };
  let act: () => void = () => endTurn();
  if (id === "loysit") act = () => { p.money += 50; float(g.cur, "+50 €", "#06d6a0"); rg.sound("coin"); endTurn(); };
  else if (id === "piirustus") act = () => { p.money += 100; float(g.cur, "+100 €", "#06d6a0"); rg.sound("coin"); endTurn(); };
  else if (id === "pyora") act = () => { payTo(g.cur, -2, 40); endTurn(); };
  else if (id === "synttarit") act = () => { g.players.forEach((o, j) => { if (j !== g.cur && !o.out && !g.over) payTo(j, g.cur, 20); }); rg.sound("coin"); endTurn(); };
  else if (id === "jaatelo") act = () => { g.players.forEach((o, j) => { if (j !== g.cur && !o.out && !g.over) payTo(g.cur, j, 10); }); endTurn(); };
  else if (id === "lahtoon") act = next(() => walk(stepsTo(p.pos, START) || N, false));
  else if (id === "puistoon") act = next(() => walk(stepsTo(p.pos, PARK) || N, false));
  else if (id === "peruuta") act = next(() => walk(-3, false));
  else if (id === "vankilaan") act = next(() => toJail());
  else if (id === "vapaa") act = () => { p.free++; rg.sound("star"); endTurn(); };
  dlg = { kind: "card", sq: -1, title: rg.t("Yllätyskortti", "Surprise card", "Tarjeta sorpresa"), text: T3(CARD_TEXT[id]), icon: CARD_ICON[id], color: "#9b5de5",
    btns: [{ id: "ok", label: rg.t("Selvä!", "OK!", "¡Vale!"), cls: "go", act }], ai: 0 };
  step = "dialog"; aiClock = 0;
  say(["kt_yllatys", "kt_y_" + id]);
}

function jailDialog() {
  const p = P();
  const btns: any[] = [];
  if (p.free > 0) btns.push({ id: "jfree", label: "🔑 " + rg.t("Käytä vapaakortti", "Use the free card", "Usa la tarjeta libre"), cls: "go", act: () => { p.free--; p.jail = 0; rg.sound("star"); dlg = null; step = "turn"; msg = rg.t("Pääsit vapaaksi! Heitä nopat.", "You are free! Throw the dice.", "¡Estás libre! Tira los dados."); say("kt_vapaa"); } });
  btns.push({ id: "jpay", label: "💶 " + rg.t("Maksa", "Pay", "Paga") + " " + JAIL_FINE + " €", cls: "open", act: () => { payTo(g.cur, -2, JAIL_FINE); p.jail = 0; dlg = null; if (g.over) { gameOver(); return; } step = "turn"; msg = rg.t("Pääsit vapaaksi! Heitä nopat.", "You are free! Throw the dice.", "¡Estás libre! Tira los dados."); say("kt_vapaa"); }, off: p.money < JAIL_FINE });
  btns.push({ id: "jroll", label: "🎲 " + rg.t("Heitä tuplat", "Roll doubles", "Saca dobles") + " (" + p.jail + "/3)", cls: "tram", act: () => roll(true) });
  const a = aiJail(g, g.cur);
  dlg = { kind: "info", sq: -1, title: rg.t("Vankilassa", "In jail", "En la cárcel"), text: rg.t("Pääset pois tuplilla, vapaakortilla tai maksamalla " + JAIL_FINE + " €.", "Get out with doubles, a free card or by paying " + JAIL_FINE + " €.", "Sales con dobles, una tarjeta libre o pagando " + JAIL_FINE + " €."), icon: "🔒", color: "#6c757d",
    btns, ai: btns.findIndex((b) => b.id === (a === "free" ? "jfree" : a === "pay" ? "jpay" : "jroll")) };
  msg = T3(TOK[p.tok].turn);
}

function doBuy(i: number) {
  if (!buy(g, g.cur, i)) return;
  rg.sound("coin");
  float(g.cur, "-" + SQ[i].price + " €", "#ef476f");
  flags();
  const whole = wholeBlock(g, i);
  say(whole ? ["kt_ostit", "kt_koko"] : "kt_ostit");
  rg.celebrate(width / 2, height / 2 - 40, { sound: false });
  if (whole) msg = rg.t("Koko kortteli on sinun! Vuokra tuplana.", "The whole block is yours! Double rent.", "¡Toda la manzana es tuya! Alquiler doble.");
  endTurn();
}
function doBuild(i: number): boolean {
  if (!build(g, g.cur, i)) return false;
  float(g.cur, "-" + buildCost(i) + " €", "#ef476f");
  setHouse(i, true);
  rg.sound("pop");
  say(g.level[i] === MAX_LEVEL ? "kt_hotelli" : "kt_rakennettu_" + g.level[i]);
  return true;
}
function payTo(from: number, to: number, amount: number) {
  const sold = pay(g, from, to, amount);
  float(from, "-" + amount + " €", "#ef476f");
  if (to >= 0) float(to, "+" + amount + " €", "#06d6a0");
  rg.sound("coin", { pitch: 0.8 });
  for (const s of sold) {
    if (s[1] < 0) flags(); else setHouse(s[0], false);
  }
  if (sold.length) say("kt_myit");
}
function endTurn() {
  dlg = null;
  if (g.over) { gameOver(); return; }
  if (extra && P().jail === 0) {
    extra = false;
    step = "turn"; dice = [0, 0];
    msg = rg.t("Tuplat! Heitä uudestaan.", "Doubles! Throw again.", "¡Dobles! Tira otra vez.");
    say("kt_uudestaan");
    aiClock = 0;
    return;
  }
  nextPlayer(g);
  if (g.over) { gameOver(); return; }
  startTurn();
}
function gameOver() {
  g.over = true;
  phase = "over"; overT = 0; dlg = null;
  rg.save("game", "");
  const w = ranking(g)[0];
  say(["kt_peli_loppui", "kt_voitti_" + g.players[w].tok]);
  rg.celebrate(width / 2, height / 3, { big: true });
}
// the build menu: every plot of the player that can be built on
function buildMenu() {
  const p = P();
  const can = buildable(g, g.cur);
  const btns: any[] = can.slice(0, 6).map((i) => ({ id: "b" + i, label: sqName(i) + ": " + levelName(g.level[i] + 1) + " " + buildCost(i) + " €", cls: "go small", sq: i,
    act: () => { if (doBuild(i)) { dlg = null; step = "turn"; } }, off: p.money < buildCost(i) }));
  btns.push({ id: "bclose", label: rg.t("← Takaisin", "← Back", "← Atrás"), cls: "back", act: () => { dlg = null; step = "turn"; } });
  dlg = { kind: "build", sq: -1, title: rg.t("Rakenna", "Build", "Construir"), text: rg.t("Valitse tontti. Hotelliin tarvitaan koko kortteli.", "Pick a plot. A hotel needs the whole block.", "Elige un terreno. Un hotel necesita toda la manzana."), icon: "🔨", color: "#f77f00", btns, ai: btns.length - 1 };
  step = "dialog";
  say("kt_valitse_tontti");
}

// ---- the phone's turns ----------------------------------------------------------------
function aiStep() {
  const p = P();
  if (step === "turn") {
    const plan = aiPlan(g, g.cur);
    if (plan.length) { doBuild(plan[0]); aiClock = 0.3; return; }
    roll(false);
  } else if (step === "dialog" && dlg) {
    const b = dlg.btns[Math.max(0, dlg.ai)];
    if (b && !b.off) b.act(); else dlg.btns[dlg.btns.length - 1].act();
  }
}

// ---- the dice (from Kanada-malja: a cube drawn as paths) ------------------------------
const ROLL_T = 1.2, HOLD_T = 0.7;
let roll3: any[] = [{}, {}];
const FACES: number[][][] = [
  [[0, 0, 1], [1, 0, 0], [0, 1, 0], [1]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0], [6]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0], [3]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0], [4]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1], [2]], [[0, -1, 0], [1, 0, 0], [0, 0, 1], [5]],
];
const PIPS: any = { 1: [[0, 0]], 2: [[-0.5, 0.5], [0.5, -0.5]], 3: [[-0.5, 0.5], [0, 0], [0.5, -0.5]],
  4: [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]], 5: [[-0.5, 0.5], [0.5, 0.5], [0, 0], [-0.5, -0.5], [0.5, -0.5]],
  6: [[-0.5, 0.55], [0.5, 0.55], [-0.5, 0], [0.5, 0], [-0.5, -0.55], [0.5, -0.55]] };
function mmul(a: number[], b: number[]): number[] {
  const o: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
  return o;
}
function mvec(m: number[], v: number[]): number[] {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
function rotX(a: number) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(a: number) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotZ(a: number) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
const BASE: number[][] = [];
for (let v = 1; v <= 6; v++) {
  let best = rotX(0), bz = -9;
  const f = FACES.filter((x) => x[3][0] === v)[0];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const m = mmul(rotY(j * Math.PI / 2), rotX(i * Math.PI / 2));
    const z = mvec(m, f[0])[2];
    if (z > bz) { bz = z; best = m; }
  }
  BASE.push(best);
}
function dieHome(): number[] { return [width / 2, TOPH + (height - TOPH - BOTH) * 0.55]; }
function n1(x: number) { return x.toFixed(1); }
function DieView(cx: number, cy: number, h: number, m: number[], lift: number, onTap: any, id: string) {
  const S = Math.ceil(h * 3.2), f = 6;
  const proj = (v: number[]) => { const p = f / (f - v[2]); return [S / 2 + v[0] * h * p, S / 2 - v[1] * h * p]; };
  const faces: any[] = [];
  for (const F of FACES) {
    const n = mvec(m, F[0]);
    if (n[2] <= 0.02) continue;
    const u = mvec(m, F[1]), w = mvec(m, F[2]);
    const pt = (a: number, b: number, out: number) => proj([n[0] * out + u[0] * a + w[0] * b, n[1] * out + u[1] * a + w[1] * b, n[2] * out + u[2] * a + w[2] * b]);
    const K = 0.82;
    const ring = [[-1, -K], [-K, -1], [K, -1], [1, -K], [1, K], [K, 1], [-K, 1], [-1, K]];
    let d = "";
    for (let i = 0; i < ring.length; i++) { const q = pt(ring[i][0], ring[i][1], 1); d += (i ? " L " : "M ") + n1(q[0]) + " " + n1(q[1]); }
    d += " Z";
    let pd = "";
    for (const pp of PIPS[F[3][0]]) {
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2;
        const q = pt(pp[0] + Math.cos(a) * 0.17, pp[1] + Math.sin(a) * 0.17, 1.01);
        pd += (k ? " L " : "M ") + n1(q[0]) + " " + n1(q[1]);
      }
      pd += " Z ";
    }
    const light = Math.max(0, n[0] * -0.35 + n[1] * 0.55 + n[2] * 0.76);
    const gr = Math.round(150 + 105 * light);
    faces.push({ z: n[2], d, pd, fill: "rgb(" + gr + "," + gr + "," + Math.round(gr * 0.94) + ")", pip: F[3][0] === 1 ? "#d62828" : "#1d3557" });
  }
  faces.sort((a: any, b: any) => a.z - b.z);
  const kids: any[] = [];
  const sh = 1 - Math.min(1, lift / 120);
  kids.push(<div className="dieshadow" style={{ left: S / 2 - h * 1.3 * sh, top: S / 2 + h * 0.9 + lift, width: h * 2.6 * sh, height: h * 0.7 * sh, borderRadius: h, opacity: String(0.35 * sh) }} />);
  for (const fc of faces) {
    kids.push(<path d={fc.d} fill={fc.fill} stroke="#8d99ae" strokeWidth="1.5" viewBox={"0 0 " + S + " " + S} style={{ position: "absolute", left: 0, top: 0, width: S, height: S }} />);
    kids.push(<path d={fc.pd} fill={fc.pip} viewBox={"0 0 " + S + " " + S} style={{ position: "absolute", left: 0, top: 0, width: S, height: S }} />);
  }
  if (onTap) return <div className="die3" id={id} style={{ left: cx - S / 2, top: cy - S / 2, width: S, height: S }} onClick={onTap}>{kids}</div>;
  return <div className="die3" style={{ left: cx - S / 2, top: cy - S / 2, width: S, height: S }}>{kids}</div>;
}
function Dice3() {
  const p = P();
  if (step === "turn" && !p.ai && !dlg && !overview) {
    const c = dieHome(), s = 1 + Math.sin(t * 5) * 0.04;
    const out: any[] = [];
    for (let k = 0; k < 2; k++) {
      const m = mmul(mmul(rotX(-0.42 + Math.sin(t * 2 + k) * 0.12), rotY(0.5 + Math.sin(t * 1.3 + k * 2) * 0.25)), BASE[k ? 4 : 0]);
      out.push(DieView(c[0] + (k ? 42 : -42), c[1] - 10, 30 * s, m, 6, () => roll(false), "die" + k));
    }
    out.push(<div className="dietip" id="dietip" style={{ left: c[0] - 90, top: c[1] + 46 }} onClick={() => roll(false)}>{rg.t("Napauta noppia!", "Tap the dice!", "¡Toca los dados!")}</div>);
    return <div className="diewrap" style={{ left: 0, top: 0, width, height }}>{out}</div>;
  }
  if (step !== "rolling") return null;
  const u = Math.min(1, rollClock / ROLL_T), e = 1 - Math.pow(1 - u, 3);
  const out: any[] = [];
  for (let k = 0; k < 2; k++) {
    const r = roll3[k];
    const m = mmul(mmul(mmul(rotX(-0.42 + r.sa * (1 - e)), rotY(0.5 + r.sb * (1 - e))), rotZ(r.sc * (1 - e))), BASE[dice[k] - 1]);
    const kk = u * 3, b = kk - Math.floor(kk);
    const lift = u >= 1 ? 0 : Math.sin(b * Math.PI) * 100 * Math.pow(0.45, Math.floor(kk)) * (1 - u * 0.3);
    const x = r.x0 + (r.x1 - r.x0) * e, y = r.y0 + (r.y1 - r.y0) * e;
    out.push(DieView(x, y - lift, 32 + lift * 0.1, m, lift, null, ""));
  }
  if (rollClock > ROLL_T) out.push(<div className="sumtag" style={{ left: width / 2 - 50, top: dieHome()[1] + 52 }}>{"= " + (dice[0] + dice[1])}</div>);
  return <div className="diewrap" style={{ left: 0, top: 0, width, height }}>{out}</div>;
}

// ---- input and time ---------------------------------------------------------------
let drag = { on: false, x: 0, moved: false };
function onPointerDown(x: number, y: number) {
  if (phase !== "play" || y < TOPH || y > height - BOTH || dlg) return;
  drag = { on: true, x, moved: false };
}
function onPointerUp() { drag.on = false; }
function tick(dt: number, input: any) {
  t += dt;
  if (drag.on) {
    if (!input || !input.pointer || !input.pointer.down) drag.on = false;
    else {
      const dx = input.pointer.x - drag.x;
      if (Math.abs(dx) > 4) drag.moved = true;
      if (drag.moved) { userYaw = Math.max(-1.3, Math.min(1.3, userYaw + dx * 0.008)); drag.x = input.pointer.x; }
    }
  }
  if (phase === "over") overT += dt;
  if (phase !== "play" && phase !== "over") return;
  if (phase === "play") {
    if (step === "rolling") {
      const before = rollClock;
      rollClock += dt;
      if (before < ROLL_T && Math.floor(rollClock / ROLL_T * 3) !== Math.floor(before / ROLL_T * 3)) { rg.sound("hit", { pitch: 1.3, volume: 0.5 }); rg.vibrate(12); }
      if (rollClock >= ROLL_T + HOLD_T) rolled();
    } else if (step === "moving") moveStep(dt);
    else if (step === "wait") { waitT -= dt; if (waitT <= 0) endTurn(); }
    if (P().ai && (step === "turn" || step === "dialog")) {
      aiClock += dt;
      if (aiClock > 1.1) { aiClock = 0; aiStep(); }
    }
  }
  // the pieces and the buildings that drop into place
  for (let k = 0; k < g.players.length; k++) { const q = piecePos(k); piecePlace(k, q[0], q[1], q[2], q[3]); }
  for (let i = 0; i < N; i++) {
    const h = houses[i];
    if (!h || dropT[i] < 0) continue;
    const u = t - dropT[i];
    let dy = 0;
    if (u < 0.5) { const v = 1 - u / 0.5; dy = 5 * v * v; }
    else if (u < 0.75) dy = Math.sin((u - 0.5) / 0.25 * Math.PI) * 0.2;
    for (const o of h.objs) rg.three("set", { id: o.id, y: o.y + dy });
    if (u >= 0.5 && u - dt < 0.5) { rg.sound("hit", { volume: 0.7 }); rg.vibrate(35); }
    if (u >= 0.75) dropT[i] = -10;
  }
  floats = floats.filter((f) => t - f.t < 1.6);
  camStep(dt);
}
function onBack() {
  if (phase === "setup" || phase === "rules") { phase = "menu"; rg.stopSay(); }
  else if (phase === "play" || phase === "over") { save(); phase = "menu"; rg.three("clear"); }
  else rg.exit();
}
function float(k: number, text: string, color: string) { floats.push({ k, text, color, t }); }

// ---- the screen -------------------------------------------------------------------------
function draw(p: Pic[]): any[] {
  const vb = "0 0 " + width + " " + height;
  return p.map((q) => {
    let d = "";
    for (let i = 0; i < q.pts.length; i++) d += (i ? " L " : "M ") + q.pts[i][0].toFixed(1) + " " + q.pts[i][1].toFixed(1);
    d += " Z";
    const st = { position: "absolute", left: 0, top: 0, width, height };
    return q.e ? <path d={d} fill={q.c} stroke={q.e} strokeWidth="1" viewBox={vb} style={st} /> : <path d={d} fill={q.c} viewBox={vb} style={st} />;
  });
}
// a building's picture in a box
function housePic(l: number, x: number, y: number, w: number, h: number): any[] {
  const s = SPEC[l];
  if (!l) return [<div style={{ position: "absolute", left: x + 4, top: y + h - 10, width: w - 8, height: 8, borderRadius: 3, backgroundColor: "#d8c79a" }} />];
  const e = extent(s), u = Math.min(w / (e[1] - e[0]), h / (e[2] + 0.1));
  return draw(front(s, CATS, x + w / 2 - (e[0] + e[1]) / 2 * u, y + h, u, false));
}

function Panels() {
  const n = g.players.length, w = (width - 58 - 4 * n) / n;
  const out: any[] = [];
  g.players.forEach((p, k) => {
    const on = k === g.cur && phase === "play";
    const tk = TOK[p.tok];
    out.push(
      <div className={"panel" + (on ? " on" : "") + (p.out ? " out" : "")} style={{ left: 4 + k * (w + 4), width: w, backgroundColor: tk.color }}>
        <div className="pemoji">{tk.emoji}</div>
        <div className="pcol">
          <div className="money">{p.money + " €"}</div>
          <div className="pinfo">{(p.ai ? "📱 " : "") + owned(g, k).length + "🏠" + (p.jail > 0 ? " 🔒" : "") + (p.free > 0 ? " 🔑" : "")}</div>
        </div>
      </div>
    );
  });
  floats.forEach((f) => {
    const u = (t - f.t) / 1.6, w2 = (width - 58 - 4 * n) / n;
    out.push(<div className="float" style={{ left: 4 + f.k * (w2 + 4), width: w2, top: TOPH - 6 + u * 40, color: f.color, opacity: String(1 - u * u) }}>{f.text}</div>);
  });
  return out;
}

function Bottom() {
  const p = P();
  const btns: any[] = [];
  if (step === "turn" && !p.ai && !dlg) {
    btns.push(<div className="btn go" id="roll" onClick={() => roll(false)}>{"🎲 " + rg.t("Heitä", "Throw", "Tirar")}</div>);
    if (buildable(g, g.cur).length) btns.push(<div className="btn open" id="buildmenu" onClick={() => buildMenu()}>{"🔨 " + rg.t("Rakenna", "Build", "Construir")}</div>);
  }
  const dd: any[] = [];
  if (dice[0] && step !== "rolling") for (let k = 0; k < 2; k++) dd.push(SmallDie(dice[k]));
  return (
    <div className="bottom" style={{ top: height - BOTH, height: BOTH }}>
      <div className="msgrow">{dd}<div className="msg">{msg}</div></div>
      <div className="btnrow">{btns}</div>
      <div className="potrow">{"🌳 " + rg.t("Puistossa", "In the park", "En el parque") + " " + g.pot + " € · " + rg.t("Kierros", "Round", "Ronda") + " " + g.round + (g.rounds ? "/" + g.rounds : "")}</div>
    </div>
  );
}
function SmallDie(v: number) {
  const spots: any = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const cells: any[] = [];
  for (let c = 0; c < 9; c++) cells.push(<div className="dcell">{spots[v].indexOf(c) >= 0 ? <div className="pip" /> : null}</div>);
  return <div className="dice">{cells}</div>;
}

// the plot's card: price, and the rent with each building
function Deed(i: number) {
  const out: any[] = [];
  const sq = SQ[i], o = g.owner[i];
  out.push(<div className="dprice">{rg.t("Hinta", "Price", "Precio") + " " + sq.price + " € · " + rg.t("rakennus", "building", "edificio") + " " + buildCost(i) + " €"}</div>);
  const cols: any[] = [];
  for (let l = 0; l <= MAX_LEVEL; l++) {
    const on = o >= 0 && g.level[i] === l;
    cols.push(
      <div className={"rcol" + (on ? " on" : "")}>
        <div className="rpic" />
        <div className="rval">{(l === 0 && wholeBlock(g, i) ? baseRent(i) * 2 : rentAt(i, l)) + " €"}</div>
      </div>
    );
  }
  out.push(<div className="rrow">{cols}</div>);
  out.push(<div className="rnote">{rg.t("Vuokra: tontti, maja, talo, kerrostalo, hotelli. Koko kortteli: tontin vuokra tuplana.", "Rent: plot, hut, house, flats, hotel. Whole block: double plot rent.", "Alquiler: terreno, cabaña, casa, edificio, hotel. Manzana entera: doble.")}</div>);
  if (o >= 0) out.push(<div className="rowner">{rg.t("Omistaja", "Owner", "Dueño") + ": " + TOK[g.players[o].tok].emoji + " " + tokName(g.players[o].tok)}</div>);
  return out;
}
const DW = 316;
function Dialog() {
  if (!dlg) return null;
  const d = dlg, human = !P().ai;
  const x = (width - DW) / 2, y = TOPH + 14;
  const body: any[] = [];
  if (d.icon) body.push(<div className="dicon">{d.icon}</div>);
  if (d.kind === "deed") for (const e of Deed(d.sq)) body.push(e);
  body.push(<div className="dtext">{d.text}</div>);
  const btns: any[] = [];
  for (const b of d.btns) {
    if (!human) continue;
    if (b.off) btns.push(<div className={"btn dbtn off " + b.cls}>{b.label}</div>);
    else btns.push(<div className={"btn dbtn " + b.cls} id={b.id} onClick={b.act}>{b.label}</div>);
  }
  if (!human) btns.push(<div className="thinking">{"📱 " + rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono piensa…")}</div>);
  const out: any[] = [
    <div className="dialog" style={{ left: x, top: y, width: DW }}>
      <div className="dhead" style={{ backgroundColor: d.color }}><div className="dtitle">{d.title}</div></div>
      {body}
      {btns}
    </div>,
  ];
  // the buildings' pictures over the card's rent row
  if (d.kind === "deed") {
    const cw = (DW - 28) / 5;
    for (let l = 0; l <= MAX_LEVEL; l++) for (const e of housePic(l, x + 14 + l * cw + 6, y + 82, cw - 12, 40)) out.push(e);
  }
  return out;
}

function Play() {
  return (
    <div className="screen">
      {Panels()}
      {overview ? null : <div className="zoombtn" id="map" style={{ left: 8, top: TOPH + 8 }} onClick={() => { overview = true; rg.sound("click"); }}>{"🗺️"}</div>}
      {overview ? <div className="zoombtn" id="unmap" style={{ left: 8, top: TOPH + 8 }} onClick={() => { overview = false; rg.sound("click"); }}>{"🔍"}</div> : null}
      {Bottom()}
      {Dialog()}
      {Dice3()}
    </div>
  );
}

function Over() {
  const order = ranking(g);
  const rows: any[] = [];
  order.forEach((k, n) => {
    const p = g.players[k], tk = TOK[p.tok];
    rows.push(
      <div className="rank" style={{ backgroundColor: tk.color }}>
        <div className="rpos">{n === 0 ? "🏆" : String(n + 1) + "."}</div>
        <div className="pemoji">{tk.emoji}</div>
        <div className="rname">{tokName(p.tok) + (p.out ? " 💸" : "")}</div>
        <div className="rworth">{worth(g, k) + " €"}</div>
      </div>
    );
  });
  const w = g.players[order[0]];
  return (
    <div className="screen overbox">
      <div className="wintitle" style={{ marginTop: 40 + Math.sin(overT * 3) * 6 }}>{TOK[w.tok].emoji + " " + rg.t(tokName(w.tok) + " voitti!", tokName(w.tok) + " wins!", "¡" + tokName(w.tok) + " gana!")}</div>
      <div className="winsub">{rg.t("Rikkain voittaa: rahat, tontit ja talot yhteensä.", "The richest wins: money, plots and houses together.", "Gana el más rico: dinero, terrenos y casas.")}</div>
      {rows}
      {overT > 1 ? <div className="btn go wide" id="again" onClick={() => { phase = "setup"; rg.three("clear"); rg.sound("click"); }}>{rg.t("Uusi peli", "New game", "Nueva partida")}</div> : null}
      {overT > 1 ? <div className="btn back wide" id="tomenu" onClick={() => { phase = "menu"; rg.three("clear"); rg.sound("click"); }}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div> : null}
    </div>
  );
}

function Menu() {
  const saved = rg.load("game", "");
  const bob = Math.sin(t * 2.5) * 6;
  const pics: any[] = [];
  for (let l = 1; l <= MAX_LEVEL; l++) for (const e of housePic(l, width / 2 - 150 + (l - 1) * 76, 60 + bob, 68, 80)) pics.push(e);
  return (
    <div className="screen menu">
      <div className="menupics">{pics}</div>
      <div className="title">{rg.t("Korttelikauppa", "City Blocks", "Barrios")}</div>
      <div className="subtitle">{rg.t("Heitä nopat, osta tontteja ja rakenna taloja ja hotelleja!", "Throw the dice, buy plots and build houses and hotels!", "¡Tira los dados, compra terrenos y construye casas y hoteles!")}</div>
      <div className="tokrow">{TOK.map((tk) => <div className="tokball" style={{ backgroundColor: tk.color }}>{tk.emoji}</div>)}</div>
      {saved ? <div className="btn go wide" id="resume" onClick={resume}>{"▶ " + rg.t("Jatka peliä", "Continue", "Continuar")}</div> : null}
      <div className="btn open wide" id="new" onClick={() => { phase = "setup"; rg.sound("click"); say("kt_kuka_pelaa"); }}>{"🎲 " + rg.t("Uusi peli", "New game", "Nueva partida")}</div>
      <div className="btn back wide" id="rules" onClick={() => { phase = "rules"; rg.sound("click"); say("kt_ohje"); }}>{"❓ " + rg.t("Säännöt", "Rules", "Reglas")}</div>
    </div>
  );
}

function Setup() {
  const rows: any[] = [];
  for (let k = 0; k < 4; k++) {
    const tk = TOK[k], on = k < setupN;
    rows.push(
      <div className={"srow" + (on ? "" : " off")} style={{ backgroundColor: on ? tk.color : "#495057" }}>
        <div className="pemoji">{tk.emoji}</div>
        <div className="sname">{tokName(k)}</div>
        {on ? <div className="stoggle" id={"who" + k} onClick={() => { setupAi[k] = !setupAi[k]; rg.sound("click"); }}>{setupAi[k] ? "📱 " + rg.t("Puhelin", "Phone", "Teléfono") : "🧒 " + rg.t("Pelaaja", "Player", "Jugador")}</div> : null}
      </div>
    );
  }
  const len = [[10, rg.t("Lyhyt", "Short", "Corta")], [20, rg.t("Pitkä", "Long", "Larga")], [0, rg.t("Loppuun asti", "To the end", "Hasta el final")]];
  return (
    <div className="screen menu">
      <div className="title small">{rg.t("Kuka pelaa?", "Who plays?", "¿Quién juega?")}</div>
      <div className="nrow">{[2, 3, 4].map((n) => <div className={"nbtn" + (n === setupN ? " on" : "")} id={"n" + n} onClick={() => { setupN = n; rg.sound("click"); }}>{String(n)}</div>)}</div>
      {rows}
      <div className="lenrow">{len.map((l: any) => <div className={"lbtn" + (l[0] === setupRounds || (l[0] === 0 && setupRounds === 0) ? " on" : "")} id={"len" + l[0]} onClick={() => { setupRounds = l[0]; rg.sound("click"); }}>{l[1] + (l[0] ? " " + l[0] : "")}</div>)}</div>
      <div className="btn go wide" id="start" onClick={startGame}>{"▶ " + rg.t("Aloita", "Start", "Empezar")}</div>
      <div className="btn back wide" id="sback" onClick={() => { phase = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}

function Rule(icon: string, text: string) {
  return <div className="rule"><div className="ruleicon">{icon}</div><div className="ruletext">{text}</div></div>;
}
function Rules() {
  return (
    <div className="screen menu">
      <div className="title small">{rg.t("Säännöt", "Rules", "Reglas")}</div>
      {Rule("🎲", rg.t("Heitä kahta noppaa ja kulje katua pitkin. Tuplilla saat heittää uudestaan.", "Throw two dice and go along the street. Doubles give another throw.", "Tira dos dados y avanza por la calle. Con dobles tiras otra vez."))}
      {Rule("🏷️", rg.t("Osta tontti, jolle pysähdyt. Toiset maksavat sinulle vuokraa.", "Buy the plot you stop on. The others pay you rent.", "Compra el terreno donde paras. Los demás te pagan alquiler."))}
      {Rule("🏠", rg.t("Rakenna omille tonteille maja, talo ja kerrostalo. Hotelliin tarvitset koko korttelin: kaksi saman väristä tonttia.", "Build a hut, a house and flats on your plots. A hotel needs the whole block: two plots of one colour.", "Construye cabaña, casa y edificio. Un hotel necesita la manzana: dos terrenos del mismo color."))}
      {Rule("🏁", rg.t("Lähtöruudun ohi kulkiessa saat 150 €.", "Passing the start gives you 150 €.", "Al pasar la salida recibes 150 €."))}
      {Rule("👮", rg.t("Poliisi vie vankilaan. Pois pääsee tuplilla, vapaakortilla tai 50 eurolla.", "The police take you to jail. Out with doubles, a free card or 50 €.", "La policía te lleva a la cárcel. Sales con dobles, tarjeta libre o 50 €."))}
      {Rule("🌳", rg.t("Maksut menevät puistoon. Kuka pysähtyy puistoon, saa ne!", "Fees go to the park. Whoever stops in the park gets them!", "Las multas van al parque. ¡Quien para en el parque se las lleva!"))}
      {Rule("🏆", rg.t("Peli loppuu kierrosten jälkeen tai kun joku ei pysty maksamaan. Rikkain voittaa.", "The game ends after the rounds or when someone cannot pay. The richest wins.", "El juego acaba tras las rondas o cuando alguien no puede pagar. Gana el más rico."))}
      <div className="btn back wide" id="rback" onClick={() => { phase = "menu"; rg.sound("click"); rg.stopSay(); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}

function view() {
  if (phase === "menu") return Menu();
  if (phase === "setup") return Setup();
  if (phase === "rules") return Rules();
  if (phase === "over") return Over();
  return Play();
}
