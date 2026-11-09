// Magneettipaja (Magnet Workshop): a magnet in your hand pulls iron and
// steel, pushes or pulls other magnets and carries a steel ball through a
// maze from under the board. Six tasks teach attraction, repulsion, the two
// poles of a magnet and which materials a magnet pulls.
//
// The physics (lib/fysiikka.ts): every thing on the board is a rigid body
// (one or more circles) with friction and collisions; magnets are point
// poles (red = north, blue = south), iron and steel are magnetised by any
// pole, other materials feel nothing. The hand's magnet is a pole under the
// board: hold a finger on the screen and it pulls, lift the finger and it
// lets go. The magnet moves with the finger (drag anywhere, it follows the
// finger's movement, so the finger does not hide it); 🔄 turns it over, red
// side up or blue side up.

import { Body, World, Rect, Circle, makeBody, fasten, newWorld, step, toWorld, speed } from "lib/fysiikka";

type Mode = "menu" | "intro" | "play" | "done";
type L3 = { fi: string; en: string; es: string };
type Spec = { k: string; x: number; y: number; a?: number };
type Goal = { kind: "box" | "hole" | "spots"; x: number; y: number; w?: number; h?: number; r?: number };
type Level = {
  name: L3; icon: string; task: L3; learn: L3; say: string; sayLearn: string;
  hand: { x: number; y: number; q: number };
  zone?: Rect;           // where the hand's magnet may go (else the whole board)
  walls: Rect[]; pegs: Circle[]; items: Spec[]; goal: Goal; par: number;
};

// what each kind of thing is
type Kind = { name: L3; mat: L3; magnetic: boolean; emoji: string };
const KINDS: { [k: string]: Kind } = {
  naula:  { name: { fi: "naula", en: "nail", es: "clavo" }, mat: { fi: "rauta", en: "iron", es: "hierro" }, magnetic: true, emoji: "" },
  liitin: { name: { fi: "paperiliitin", en: "paper clip", es: "clip" }, mat: { fi: "teräs", en: "steel", es: "acero" }, magnetic: true, emoji: "📎" },
  mutteri:{ name: { fi: "ruuvi ja mutteri", en: "nut and bolt", es: "tuerca y tornillo" }, mat: { fi: "teräs", en: "steel", es: "acero" }, magnetic: true, emoji: "🔩" },
  sakset: { name: { fi: "sakset", en: "scissors", es: "tijeras" }, mat: { fi: "teräs", en: "steel", es: "acero" }, magnetic: true, emoji: "✂️" },
  kuula:  { name: { fi: "teräskuula", en: "steel ball", es: "bola de acero" }, mat: { fi: "teräs", en: "steel", es: "acero" }, magnetic: true, emoji: "" },
  ankka:  { name: { fi: "kumiankka", en: "rubber duck", es: "patito de goma" }, mat: { fi: "muovi", en: "plastic", es: "plástico" }, magnetic: false, emoji: "🦆" },
  palikka:{ name: { fi: "palikka", en: "block", es: "bloque" }, mat: { fi: "puu", en: "wood", es: "madera" }, magnetic: false, emoji: "" },
  sormus: { name: { fi: "sormus", en: "ring", es: "anillo" }, mat: { fi: "kulta", en: "gold", es: "oro" }, magnetic: false, emoji: "💍" },
  kyna:   { name: { fi: "kynä", en: "pencil", es: "lápiz" }, mat: { fi: "puu", en: "wood", es: "madera" }, magnetic: false, emoji: "✏️" },
  lasi:   { name: { fi: "lasikuula", en: "glass marble", es: "canica" }, mat: { fi: "lasi", en: "glass", es: "vidrio" }, magnetic: false, emoji: "" },
  punainen: { name: { fi: "magneetti", en: "magnet", es: "imán" }, mat: { fi: "magneetti", en: "magnet", es: "imán" }, magnetic: true, emoji: "" },
  sininen:  { name: { fi: "magneetti", en: "magnet", es: "imán" }, mat: { fi: "magneetti", en: "magnet", es: "imán" }, magnetic: true, emoji: "" },
  sauva:  { name: { fi: "sauvamagneetti", en: "bar magnet", es: "imán de barra" }, mat: { fi: "magneetti", en: "magnet", es: "imán" }, magnetic: true, emoji: "" },
  kiintea_p: { name: { fi: "magneetti", en: "magnet", es: "imán" }, mat: { fi: "magneetti", en: "magnet", es: "imán" }, magnetic: true, emoji: "" },
  kiintea_s: { name: { fi: "magneetti", en: "magnet", es: "imán" }, mat: { fi: "magneetti", en: "magnet", es: "imán" }, magnetic: true, emoji: "" }
};

// the board: 360 × 640, the play area inside the frame
const W = 360, H = 640;
const TOP = 58, BOTTOM = 560;
const FRAME: Rect[] = [
  { x: 0, y: TOP - 10, w: W, h: 10 }, { x: 0, y: BOTTOM, w: W, h: 10 },
  { x: 0, y: TOP - 10, w: 10, h: BOTTOM - TOP + 20 }, { x: W - 10, y: TOP - 10, w: 10, h: BOTTOM - TOP + 20 }
];

const LEVELS: Level[] = [
  {
    name: { fi: "Naulat laatikkoon", en: "Nails in the box", es: "Clavos a la caja" }, icon: "🔩",
    task: { fi: "Vedä naulat laatikkoon magneetilla. Pidä sormi ruudulla, niin magneetti vetää.", en: "Pull the nails into the box with the magnet. Keep your finger on the screen and the magnet pulls.", es: "Lleva los clavos a la caja con el imán. Mantén el dedo en la pantalla y el imán atrae." },
    learn: { fi: "Magneetti vetää rautaa ja terästä.", en: "A magnet pulls iron and steel.", es: "Un imán atrae el hierro y el acero." },
    say: "mag_l1", sayLearn: "mag_l1_opit",
    hand: { x: 180, y: 250, q: 1 },
    walls: [], pegs: [],
    items: [{ k: "naula", x: 80, y: 300, a: 0.4 }, { k: "naula", x: 190, y: 430, a: 1.2 }, { k: "naula", x: 100, y: 490, a: -0.3 }, { k: "mutteri", x: 270, y: 380 }],
    goal: { kind: "box", x: 240, y: 68, w: 100, h: 78 }, par: 25
  },
  {
    name: { fi: "Mikä tarttuu?", en: "What sticks?", es: "¿Qué se pega?" }, icon: "🧲",
    task: { fi: "Mitkä tavarat tarttuvat magneettiin? Vie ne laatikkoon.", en: "Which things stick to the magnet? Take them to the box.", es: "¿Qué cosas se pegan al imán? Llévalas a la caja." },
    learn: { fi: "Rauta ja teräs tarttuvat. Puu, muovi, lasi ja kulta eivät tartu magneettiin.", en: "Iron and steel stick. Wood, plastic, glass and gold do not stick to a magnet.", es: "El hierro y el acero se pegan. La madera, el plástico, el vidrio y el oro no se pegan al imán." },
    say: "mag_l2", sayLearn: "mag_l2_opit",
    hand: { x: 180, y: 300, q: 1 },
    walls: [], pegs: [],
    items: [
      { k: "liitin", x: 270, y: 190 }, { k: "sakset", x: 90, y: 330, a: 0.5 }, { k: "mutteri", x: 290, y: 470 }, { k: "naula", x: 190, y: 250, a: 2 },
      { k: "ankka", x: 200, y: 390 }, { k: "palikka", x: 70, y: 470, a: 0.2 }, { k: "sormus", x: 290, y: 320 }, { k: "kyna", x: 190, y: 465, a: 0.8 }, { k: "lasi", x: 230, y: 130 }
    ],
    goal: { kind: "box", x: 20, y: 68, w: 100, h: 78 }, par: 50
  },
  {
    name: { fi: "Kuula sokkelossa", en: "Ball in the maze", es: "Bola en el laberinto" }, icon: "⚪",
    task: { fi: "Kuljeta kuula reikään. Magneetti vetää laudan alta. Älä kiirehdi, muuten kuula jää.", en: "Take the ball to the hole. The magnet pulls from under the board. Go slowly or the ball stays behind.", es: "Lleva la bola al agujero. El imán atrae desde debajo del tablero. Ve despacio o la bola se queda." },
    learn: { fi: "Magneetin voima kulkee puun läpi.", en: "A magnet's force goes through wood.", es: "La fuerza del imán atraviesa la madera." },
    say: "mag_l3", sayLearn: "mag_l3_opit",
    hand: { x: 50, y: 470, q: 1 },
    walls: [{ x: 10, y: 432, w: 240, h: 14 }, { x: 110, y: 312, w: 240, h: 14 }, { x: 10, y: 192, w: 240, h: 14 }],
    pegs: [{ x: 300, y: 380, r: 10 }, { x: 60, y: 255, r: 10 }],
    items: [{ k: "kuula", x: 50, y: 510 }],
    goal: { kind: "hole", x: 300, y: 115, r: 24 }, par: 45
  },
  {
    name: { fi: "Työnnä magneettia", en: "Push the magnet", es: "Empuja el imán" }, icon: "🔴",
    task: { fi: "Työnnä punainen magneetti reikään koskematta siihen. Magneetilla voi olla vain alaosassa.", en: "Push the red magnet into the hole without touching it. Your magnet stays in the lower part.", es: "Empuja el imán rojo al agujero sin tocarlo. Tu imán se queda en la parte de abajo." },
    learn: { fi: "Samanväriset navat hylkivät toisiaan. Eriväriset navat vetävät toisiaan.", en: "Poles of the same colour push each other away. Different colours pull each other.", es: "Los polos del mismo color se repelen. Los de distinto color se atraen." },
    say: "mag_l4", sayLearn: "mag_l4_opit",
    hand: { x: 250, y: 520, q: 1 },
    zone: { x: 10, y: 390, w: 340, h: BOTTOM - 390 },
    walls: [{ x: 10, y: 250, w: 95, h: 14 }, { x: 255, y: 250, w: 95, h: 14 }],
    pegs: [],
    items: [{ k: "punainen", x: 115, y: 440 }],
    goal: { kind: "hole", x: 240, y: 140, r: 28 }, par: 40
  },
  {
    name: { fi: "Kaksi napaa", en: "Two poles", es: "Dos polos" }, icon: "🧲",
    task: { fi: "Käännä sauvamagneetti paikalleen: punainen pää punaiseen, sininen pää siniseen.", en: "Turn the bar magnet into place: red end on red, blue end on blue.", es: "Gira el imán de barra a su sitio: el extremo rojo en el rojo y el azul en el azul." },
    learn: { fi: "Jokaisessa magneetissa on kaksi napaa, punainen ja sininen.", en: "Every magnet has two poles, a red one and a blue one.", es: "Todo imán tiene dos polos, uno rojo y uno azul." },
    say: "mag_l5", sayLearn: "mag_l5_opit",
    hand: { x: 180, y: 500, q: 1 },
    walls: [], pegs: [],
    items: [{ k: "sauva", x: 180, y: 410, a: 0.4 }],
    goal: { kind: "spots", x: 180, y: 190 }, par: 40
  },
  {
    name: { fi: "Esteiden läpi", en: "Through the obstacles", es: "Entre obstáculos" }, icon: "🏁",
    task: { fi: "Kuljeta kuula maaliin. Laudalle kiinnitetyt magneetit vetävät kuulaa. Pidä se kaukana niistä.", en: "Take the ball to the goal. Magnets fixed on the board pull the ball. Keep it away from them.", es: "Lleva la bola a la meta. Los imanes fijos del tablero atraen la bola. Aléjala de ellos." },
    learn: { fi: "Rauta tarttuu kumpaankin napaan, punaiseen ja siniseen.", en: "Iron sticks to both poles, red and blue.", es: "El hierro se pega a los dos polos, rojo y azul." },
    say: "mag_l6", sayLearn: "mag_l6_opit",
    hand: { x: 50, y: 470, q: 1 },
    walls: [{ x: 10, y: 440, w: 230, h: 14 }, { x: 120, y: 320, w: 230, h: 14 }, { x: 10, y: 200, w: 210, h: 14 }],
    pegs: [{ x: 180, y: 380, r: 9 }],
    items: [{ k: "kuula", x: 50, y: 510 }, { k: "kiintea_s", x: 330, y: 500 }, { k: "kiintea_p", x: 30, y: 280 }, { k: "kiintea_s", x: 260, y: 170 }],
    goal: { kind: "hole", x: 70, y: 110, r: 24 }, par: 60
  }
];

// where the bar magnet goes in "Kaksi napaa": red on the left, blue on the right
const SPOT_D = 20;

// ---- state -------------------------------------------------------------------

let mode: Mode = "menu";
let t = 0;
let clock = 0;
let lvl = 0;
let wd: World = newWorld();
let goalLeft = 0;
let collected: { b: Body; t: number; x: number; y: number }[] = [];
let stars: number[] = [];
let lastStars = 0;
let handX = 180, handY = 300;          // where the magnet is
let targetX = 180, targetY = 300;      // where the finger wants it
let dragId = -1;
let anchor = { px: 0, py: 0, hx: 0, hy: 0 };
let heldTime = 0;                      // the magnet has been on this long
let flipT = -9;
let spotsHeld = 0;
let saidStick = false, saidPush = false, saidPull = false;
let notMag: { [id: number]: number } = {};   // a non-magnetic body under the magnet: how long
let noticed: { [id: number]: number } = {};  // ...and when it was said not to stick
let lastHit = 0;
let sparks: { x: number; y: number; t: number; c: string }[] = [];
let showHelp = 0;

function init() {
  stars = rg.load("stars", []);
  while (stars.length < LEVELS.length) stars.push(0);
}

function unlocked(i: number) { return i === 0 || stars[i - 1] > 0; }

// ---- building a level -------------------------------------------------------------

function makeThing(s: Spec): Body {
  const a = s.a || 0;
  let b: Body;
  if (s.k === "naula") {
    b = makeBody(s.k, s.x, s.y, a, 0.6, [{ x: -10, y: 0, r: 6 }, { x: 10, y: 0, r: 6 }]);
    b.iron = 1;
  } else if (s.k === "kuula") {
    b = makeBody(s.k, s.x, s.y, a, 1, [{ x: 0, y: 0, r: 13 }]);
    b.iron = 1; b.drag = 1.6; b.e = 0.45;
  } else if (s.k === "punainen" || s.k === "sininen") {
    b = makeBody(s.k, s.x, s.y, a, 1.5, [{ x: 0, y: 0, r: 17 }]);
    b.poles = [{ x: 0, y: 0, q: s.k === "punainen" ? 1 : -1 }];
    b.drag = 1.8; b.e = 0.5;
  } else if (s.k === "kiintea_p" || s.k === "kiintea_s") {
    b = fasten(makeBody(s.k, s.x, s.y, 0, 1, [{ x: 0, y: 0, r: 16 }]));
    b.poles = [{ x: 0, y: 0, q: s.k === "kiintea_p" ? 0.75 : -0.75 }];
  } else if (s.k === "sauva") {
    b = makeBody(s.k, s.x, s.y, a, 1.6, [{ x: -18, y: 0, r: 10 }, { x: 0, y: 0, r: 10 }, { x: 18, y: 0, r: 10 }]);
    b.poles = [{ x: 18, y: 0, q: 0.9 }, { x: -18, y: 0, q: -0.9 }];
    b.drag = 2.2; b.spinDrag = 3.5;
  } else if (s.k === "palikka") {
    b = makeBody(s.k, s.x, s.y, a, 1.4, [{ x: -7, y: -7, r: 9 }, { x: 7, y: -7, r: 9 }, { x: -7, y: 7, r: 9 }, { x: 7, y: 7, r: 9 }]);
  } else if (s.k === "kyna") {
    b = makeBody(s.k, s.x, s.y, a, 0.5, [{ x: -10, y: 0, r: 7 }, { x: 10, y: 0, r: 7 }]);
  } else if (s.k === "sakset") {
    b = makeBody(s.k, s.x, s.y, a, 1.2, [{ x: 0, y: 0, r: 16 }]);
    b.iron = 1.2;
  } else {
    const k = KINDS[s.k];
    b = makeBody(s.k, s.x, s.y, a, s.k === "lasi" ? 0.8 : 0.7, [{ x: 0, y: 0, r: s.k === "lasi" ? 12 : 15 }]);
    if (k.magnetic) b.iron = s.k === "liitin" ? 0.8 : 1;
    if (s.k === "lasi") { b.drag = 1.5; b.e = 0.5; }
  }
  return b;
}

function isTarget(b: Body): boolean {
  const L = LEVELS[lvl];
  if (L.goal.kind === "box") return KINDS[b.kind].magnetic && !b.fixed;
  if (L.goal.kind === "hole") return b.kind === "kuula" || b.kind === "punainen";
  return false;
}

function startLevel(i: number) {
  lvl = i;
  const L = LEVELS[i];
  wd = newWorld();
  wd.walls = FRAME.concat(L.walls);
  wd.pegs = L.pegs;
  for (const s of L.items) wd.bodies.push(makeThing(s));
  handX = targetX = L.hand.x;
  handY = targetY = L.hand.y;
  wd.hand = { x: handX, y: handY, q: L.hand.q, on: false };
  dragId = -1;
  collected = [];
  goalLeft = L.goal.kind === "spots" ? 1 : wd.bodies.filter(isTarget).length;
  spotsHeld = 0;
  saidStick = false; saidPush = false; saidPull = false;
  notMag = {}; noticed = {};
  sparks = [];
  mode = "intro";
  clock = 0;
  rg.say(L.say);
}

function play() {
  mode = "play";
  clock = 0;
  rg.sound("click");
}

function finish() {
  const L = LEVELS[lvl];
  mode = "done";
  lastStars = clock < L.par ? 3 : clock < L.par * 2 ? 2 : 1;
  if (lastStars > stars[lvl]) { stars[lvl] = lastStars; rg.save("stars", stars); }
  wd.hand.on = false;
  dragId = -1;
  rg.celebrate(W / 2, H * 0.35, { big: true });
  const all = stars.every((s) => s > 0);
  rg.say(lvl === LEVELS.length - 1 && all ? [L.sayLearn, "mag_kaikki"] : ["hienoa", L.sayLearn]);
  clock = 0;
}

// ---- the hand's magnet ---------------------------------------------------------------

function clampHand(x: number, y: number): number[] {
  const L = LEVELS[lvl];
  const z = L.zone || { x: 10, y: TOP, w: W - 20, h: BOTTOM - TOP };
  return [rg.clamp(x, z.x + 6, z.x + z.w - 6), rg.clamp(y, z.y + 6, z.y + z.h - 6)];
}

function flip() {
  wd.hand.q = -wd.hand.q;
  flipT = t;
  rg.sound("whoosh", { pitch: wd.hand.q > 0 ? 1.1 : 0.85 });
  rg.vibrate(20);
  rg.say(wd.hand.q > 0 ? "mag_punainen" : "mag_sininen");
}

function moveHand(dt: number) {
  let on = false;
  if (dragId >= 0) {
    let p = null;
    for (const q of __input.pointers) if (q.id === dragId && q.down) p = q;
    if (p) {
      on = true;
      const c = clampHand(anchor.hx + p.x - anchor.px, anchor.hy + p.y - anchor.py);
      targetX = c[0]; targetY = c[1];
    } else dragId = -1;
  }
  // keys: the arrows move the magnet and hold it on, space holds it on
  const k = __input.keys;
  let kx = 0, ky = 0;
  if (k["ArrowLeft"] || k["a"]) kx -= 1;
  if (k["ArrowRight"] || k["d"]) kx += 1;
  if (k["ArrowUp"] || k["w"]) ky -= 1;
  if (k["ArrowDown"] || k["s"]) ky += 1;
  if (kx !== 0 || ky !== 0 || k[" "]) {
    on = true;
    const c = clampHand(targetX + kx * 170 * dt, targetY + ky * 170 * dt);
    targetX = c[0]; targetY = c[1];
  }
  // the magnet glides after the finger (no teleporting through the board)
  const dx = targetX - handX, dy = targetY - handY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const maxStep = 900 * dt;
  if (d <= maxStep) { handX = targetX; handY = targetY; } else { handX += dx / d * maxStep; handY += dy / d * maxStep; }
  if (on && !wd.hand.on) rg.sound("pop", { volume: 0.4, pitch: 1.3 });
  wd.hand.on = on;
  wd.hand.x = handX;
  wd.hand.y = handY;
  heldTime = on ? heldTime + dt : 0;
}

function onPointerDown(x: number, y: number, info: any) {
  if (mode === "menu") return;
  if (mode === "intro") { if (clock > 0.4) play(); return; }
  if (mode === "done") return;
  if (y > BOTTOM + 10 || y < TOP - 8) return;   // the button bar and the top bar
  dragId = info.pointer;
  // touching near the magnet drags it from there; touching elsewhere brings it
  // just above the finger, so the finger does not hide it
  const near = Math.abs(x - handX) < 60 && Math.abs(y - handY) < 60;
  if (!near) { const c = clampHand(x, y - 46); targetX = c[0]; targetY = c[1]; }
  anchor = { px: x, py: y, hx: targetX, hy: targetY };
}

function onPointerUp(x: number, y: number, info: any) {
  if (info.pointer === dragId) dragId = -1;
}

function onKeyDown(key: string) {
  if (mode === "intro" && (key === " " || key === "Enter")) { play(); return; }
  if (mode === "play" && (key === "f" || key === "Tab" || key === "Enter")) flip();
  if (mode === "done" && (key === " " || key === "Enter")) next();
}

function onBack() {
  if (mode === "menu") rg.exit();
  else { mode = "menu"; rg.stopSay(); }
}

function next() {
  if (lvl + 1 < LEVELS.length) startLevel(lvl + 1); else { mode = "menu"; }
}

// ---- the game's step -------------------------------------------------------------------

function tick(dt: number) {
  t += dt;
  clock += dt;
  for (const s of sparks) s.t += dt;
  sparks = sparks.filter((s) => s.t < 0.6);
  if (showHelp > 0) showHelp -= dt;
  if (mode !== "play") {
    // the board keeps living under the cards (things settle)
    if (mode === "intro" || mode === "done") step(wd, dt);
    return;
  }
  moveHand(dt);
  step(wd, dt);
  const L = LEVELS[lvl];

  for (const b of wd.bodies) {
    if (b.gone) continue;
    // knocks
    if (b.hitSpeed > 120 && t - lastHit > 0.08) {
      lastHit = t;
      rg.sound("tick", { volume: Math.min(0.8, b.hitSpeed / 600), pitch: KINDS[b.kind].magnetic ? 1.2 : 0.8 });
      if (b.hitSpeed > 300) rg.vibrate(10);
    }
    // words for what is happening
    if (wd.hand.on) {
      const near = Math.abs(b.x - handX) < 42 && Math.abs(b.y - handY) < 42;
      if (b.iron > 0 && near && b.pull > 600 && !saidStick) { saidStick = true; rg.say("mag_tarttuu"); }
      if (b.poles.length > 0 && !b.fixed && b.push > 250 && !saidPush) { saidPush = true; rg.say("mag_hylkii"); sparkAt(b.x, b.y, "#ef476f"); }
      if (b.poles.length > 0 && !b.fixed && b.pull > 250 && !saidPull) { saidPull = true; rg.say("mag_vetaa"); }
      if (!KINDS[b.kind].magnetic && near) {
        notMag[b.id] = (notMag[b.id] || 0) + dt;
        if (notMag[b.id] > 0.9 && !noticed[b.id]) { noticed[b.id] = t; rg.say("mag_ei_tartu"); rg.sound("wrong", { volume: 0.4 }); }
      } else notMag[b.id] = 0;
    }
    // into the goal
    if (isTarget(b)) {
      if (L.goal.kind === "box") {
        const g = L.goal;
        if (b.x > g.x + 6 && b.x < g.x + (g.w || 0) - 6 && b.y > g.y + 6 && b.y < g.y + (g.h || 0) - 6) take(b);
      } else if (L.goal.kind === "hole") {
        const dx = b.x - L.goal.x, dy = b.y - L.goal.y;
        const r = L.goal.r || 20;
        if (dx * dx + dy * dy < r * r * 0.55) take(b);
        else if (dx * dx + dy * dy < r * r * 1.4) {
          // the hole's edge pulls it in a little
          b.vx -= dx * 3 * dt; b.vy -= dy * 3 * dt;
        }
      }
    }
  }

  if (L.goal.kind === "spots") {
    const bar = wd.bodies[0];
    const red = toWorld(bar, 18, 0), blue = toWorld(bar, -18, 0);
    const ok = dist(red[0], red[1], L.goal.x - SPOT_D, L.goal.y) < 13 && dist(blue[0], blue[1], L.goal.x + SPOT_D, L.goal.y) < 13;
    spotsHeld = ok ? spotsHeld + dt : 0;
    if (ok && spotsHeld < dt * 1.5) rg.sound("note", { pitch: 1.5 });
    if (spotsHeld > 0.6) { goalLeft = 0; rg.sound("coin"); }
  }
  if (goalLeft === 0) finish();
}

function take(b: Body) {
  b.gone = true;
  collected.push({ b, t, x: b.x, y: b.y });
  goalLeft--;
  rg.sound("coin");
  rg.vibrate(25);
  rg.celebrate(b.x, b.y, { count: 10, sound: false });
}

function sparkAt(x: number, y: number, c: string) {
  for (let i = 0; i < 6; i++) sparks.push({ x: x + rg.random() * 30 - 15, y: y + rg.random() * 30 - 15, t: 0, c });
}

function dist(ax: number, ay: number, bx: number, by: number) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }

// ---- drawing ----------------------------------------------------------------------------

const RED = "#e63946", BLUE = "#1d70d6";

function deg(a: number) { return (a * 180 / Math.PI).toFixed(1) + "deg"; }

function Thing(b: Body) {
  const k = b.kind;
  const rot = "rotate(" + deg(b.a) + ")";
  if (k === "naula") {
    return (
      <div className="thing" style={{ left: b.x - 17, top: b.y - 5, width: 34, height: 10, transform: rot }}>
        <div className="nail-shaft" />
        <div className="nail-head" />
        <div className="nail-tip" />
      </div>
    );
  }
  if (k === "kuula") return <div className="ball" style={{ left: b.x - 13, top: b.y - 13 }}><div className="ball-shine" /></div>;
  if (k === "lasi") return <div className="marble" style={{ left: b.x - 12, top: b.y - 12 }}><div className="marble-swirl" /></div>;
  if (k === "punainen" || k === "sininen") {
    return (
      <div className="puck" style={{ left: b.x - 17, top: b.y - 17, backgroundColor: k === "punainen" ? RED : BLUE }}>
        <div className="puck-ring" />
      </div>
    );
  }
  if (k === "kiintea_p" || k === "kiintea_s") {
    return (
      <div className="fixed" style={{ left: b.x - 16, top: b.y - 16, backgroundColor: k === "kiintea_p" ? RED : BLUE }}>
        <div className="screw" style={{ left: 5, top: 13 }} />
        <div className="screw" style={{ left: 21, top: 13 }} />
      </div>
    );
  }
  if (k === "sauva") {
    return (
      <div className="bar" style={{ left: b.x - 28, top: b.y - 10, transform: rot }}>
        <div className="bar-half" style={{ left: 0, backgroundColor: BLUE }}><div className="bar-letter">S</div></div>
        <div className="bar-half" style={{ left: 28, backgroundColor: RED }}><div className="bar-letter">N</div></div>
      </div>
    );
  }
  if (k === "palikka") {
    return <div className="block" style={{ left: b.x - 15, top: b.y - 15, transform: rot }}><div className="block-grain" /></div>;
  }
  if (k === "kyna") {
    return (
      <div className="thing" style={{ left: b.x - 17, top: b.y - 6, width: 34, height: 12, transform: rot }}>
        <div className="pencil-body" />
        <div className="pencil-tip" />
        <div className="pencil-end" />
      </div>
    );
  }
  const e = KINDS[k].emoji;
  return <div className="emoji" style={{ left: b.x - 17, top: b.y - 17, transform: rot }}>{e}</div>;
}

function Goal() {
  const g = LEVELS[lvl].goal;
  if (g.kind === "box") {
    return (
      <div className="box" style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
        <div className="box-label">📦</div>
        {lvl === 1 ? <div className="box-tag">🧲</div> : null}
      </div>
    );
  }
  if (g.kind === "hole") {
    const r = g.r || 20;
    const pulse = 1 + Math.sin(t * 4) * 0.08;
    return (
      <div>
        <div className="hole-ring" style={{ left: g.x - r * 1.4 * pulse, top: g.y - r * 1.4 * pulse, width: r * 2.8 * pulse, height: r * 2.8 * pulse, borderRadius: r * 1.4 * pulse }} />
        <div className="hole" style={{ left: g.x - r, top: g.y - r, width: r * 2, height: r * 2, borderRadius: r }} />
      </div>
    );
  }
  // the bar magnet's place: an outline with a red and a blue end
  const ok = spotsHeld > 0;
  return (
    <div className="slot" style={{ left: g.x - 34, top: g.y - 14, borderColor: ok ? "#06d6a0" : "rgba(60,40,20,0.45)" }}>
      <div className="slot-end" style={{ left: 4, backgroundColor: "rgba(230,57,70,0.45)" }} />
      <div className="slot-end" style={{ left: 38, backgroundColor: "rgba(29,112,214,0.45)" }} />
    </div>
  );
}

function Hand() {
  const q = wd.hand.q;
  const on = wd.hand.on;
  const c = q > 0 ? RED : BLUE;
  const flipK = Math.min(1, (t - flipT) / 0.3);
  const sx = Math.abs(Math.cos(flipK * Math.PI));
  const out = [];
  if (on) {
    // the field: rings that move out from the pole (in) or into it
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 0.9 + i / 3) % 1);
      const r = 24 + ph * 100;
      out.push(<div className="field" style={{ left: handX - r, top: handY - r, width: r * 2, height: r * 2, borderRadius: r, borderColor: c, opacity: (1 - ph) * 0.45 }} />);
    }
  }
  out.push(
    <div className="hand" style={{ left: handX - 24, top: handY - 24, opacity: on ? 0.8 : 0.45, transform: "scale(" + Math.max(0.15, sx).toFixed(2) + ", 1)" }}>
      <div className="hand-disc" style={{ backgroundColor: c }}>
        <div className="hand-letter">{q > 0 ? "N" : "S"}</div>
      </div>
    </div>
  );
  return out;
}

function Board() {
  const L = LEVELS[lvl];
  const z = L.zone;
  return (
    <div className="board">
      <div className="strip" style={{ top: 0, height: TOP - 10 }} />
      <div className="strip" style={{ top: BOTTOM + 10, height: H - BOTTOM - 10 }} />
      {z ? <div className="zone" style={{ left: z.x, top: z.y, width: z.w, height: z.h }}><div className="zone-label">🧲 ✋</div></div> : null}
      {Goal()}
      {L.walls.map((w) => <div className="wall" style={{ left: w.x, top: w.y, width: w.w, height: w.h }} />)}
      {L.pegs.map((p) => <div className="peg" style={{ left: p.x - p.r, top: p.y - p.r, width: p.r * 2, height: p.r * 2, borderRadius: p.r }} />)}
      {FRAME.map((w) => <div className="frame" style={{ left: w.x, top: w.y, width: w.w, height: w.h }} />)}
      {mode === "play" ? Hand() : null}
      {wd.bodies.filter((b) => !b.gone).map((b) => Thing(b))}
      {collected.filter((c) => t - c.t < 0.5).map((c) => <div className="poof" style={{ left: c.x - 20, top: c.y - 20, opacity: 1 - (t - c.t) * 2 }}>✨</div>)}
      {wd.bodies.filter((b) => noticed[b.id] && t - noticed[b.id] < 1.6).map((b) => <div className="nope" style={{ left: b.x - 14, top: b.y - 44 }}>🚫</div>)}
      {sparks.map((s) => <div className="spark" style={{ left: s.x - 4, top: s.y - 4 - s.t * 30, opacity: 1 - s.t / 0.6, backgroundColor: s.c }} />)}
    </div>
  );
}

function Hud() {
  const L = LEVELS[lvl];
  const total = L.goal.kind === "spots" ? 0 : wd.bodies.filter((b) => isTarget(b)).length;
  return (
    <div className="hud">
      <div className="pill" onClick={() => { mode = "menu"; rg.stopSay(); rg.sound("click"); }}>☰</div>
      <div className="title">{L.icon} {rg.t(L.name)}</div>
      {total > 0 ? <div className="pill">{total - goalLeft}/{total}</div> : null}
    </div>
  );
}

function Bar() {
  const q = wd.hand.q;
  return (
    <div className="bar-row">
      <div className="btn small" onClick={() => { rg.sound("click"); startLevel(lvl); play(); }}>↺</div>
      <div className="btn small" onClick={() => { rg.say(LEVELS[lvl].say); showHelp = 3; }}>❓</div>
      <div className="btn flip" onClick={() => flip()}>
        <div className="flip-disc" style={{ backgroundColor: q > 0 ? RED : BLUE }}>{q > 0 ? "N" : "S"}</div>
        <div className="flip-text">🔄 {rg.t("Käännä", "Flip", "Girar")}</div>
      </div>
    </div>
  );
}

function Intro() {
  const L = LEVELS[lvl];
  return (
    <div className="overlay">
      <div className="card">
        <div className="card-icon">{L.icon}</div>
        <div className="card-title">{rg.t(L.name)}</div>
        <div className="card-text">{rg.t(L.task)}</div>
        <div className="howto">
          <div className="howto-item"><div className="mini-disc" style={{ backgroundColor: RED }}>N</div><div className="howto-text">👆 {rg.t("vetää", "pulls", "atrae")}</div></div>
          <div className="howto-item"><div className="howto-text">🔄 {rg.t("punainen / sininen", "red / blue", "rojo / azul")}</div></div>
        </div>
        {clock > 0.4 ? <div className="go">{rg.t("Napauta ja aloita!", "Tap to start!", "¡Toca para empezar!")}</div> : null}
      </div>
    </div>
  );
}

// "Mikä tarttuu?": what stuck and what did not, with the materials
function Sorted() {
  const L = LEVELS[lvl];
  const yes: string[] = [], no: string[] = [];
  for (const s of L.items) {
    const k = KINDS[s.k];
    const label = (k.emoji || (s.k === "naula" ? "📍" : s.k === "palikka" ? "🟫" : s.k === "lasi" ? "🔵" : "⚪")) + " " + rg.t(k.mat);
    if (k.magnetic) { if (yes.indexOf(label) < 0) yes.push(label); } else if (no.indexOf(label) < 0) no.push(label);
  }
  return (
    <div className="sorted">
      <div className="sort-col yes"><div className="sort-head">🧲 ✅</div>{yes.map((s) => <div className="sort-item">{s}</div>)}</div>
      <div className="sort-col no"><div className="sort-head">🧲 ❌</div>{no.map((s) => <div className="sort-item">{s}</div>)}</div>
    </div>
  );
}

function Done() {
  const L = LEVELS[lvl];
  const s = [];
  for (let i = 0; i < 3; i++) s.push(<div className="star" style={{ opacity: i < lastStars ? 1 : 0.25 }}>⭐</div>);
  return (
    <div className="overlay">
      <div className="card">
        <div className="stars">{s}</div>
        <div className="card-title">{rg.t("Opit:", "You learned:", "Aprendiste:")}</div>
        <div className="card-learn">{rg.t(L.learn)}</div>
        {lvl === 1 ? Sorted() : null}
        {lvl === 3 ? <div className="poles"><div className="mini-disc" style={{ backgroundColor: RED }}>N</div><div className="pole-sign">↔</div><div className="mini-disc" style={{ backgroundColor: RED }}>N</div><div className="pole-gap" /><div className="mini-disc" style={{ backgroundColor: RED }}>N</div><div className="pole-sign">→←</div><div className="mini-disc" style={{ backgroundColor: BLUE }}>S</div></div> : null}
        <div className="row">
          <div className="btn small" onClick={() => { startLevel(lvl); }}>↺</div>
          <div className="btn small" onClick={() => { mode = "menu"; rg.sound("click"); }}>☰</div>
          {lvl + 1 < LEVELS.length ? <div className="btn next" onClick={() => next()}>▶</div> : null}
        </div>
      </div>
    </div>
  );
}

function Menu() {
  const tiles = LEVELS.map((L, i) => {
    const open = unlocked(i);
    const st = [];
    for (let k = 0; k < 3; k++) st.push(<div className="tile-star" style={{ opacity: k < stars[i] ? 1 : 0.25 }}>⭐</div>);
    return (
      <div className={open ? "tile" : "tile locked"} onClick={() => { if (open) { rg.sound("click"); startLevel(i); } else rg.sound("wrong"); }}>
        <div className="tile-num">{i + 1}</div>
        <div className="tile-icon">{open ? L.icon : "🔒"}</div>
        <div className="tile-name">{rg.t(L.name)}</div>
        <div className="tile-stars">{st}</div>
      </div>
    );
  });
  const wobble = Math.sin(t * 2) * 6;
  return (
    <div className="menu">
      <div className="menu-head">
        <div className="menu-magnet" style={{ transform: "rotate(" + wobble.toFixed(1) + "deg)" }}>🧲</div>
        <div className="menu-title">{rg.t("Magneettipaja", "Magnet Workshop", "Taller de imanes")}</div>
        <div className="menu-sub">{rg.t("Vedä, työnnä ja kuljeta", "Pull, push and carry", "Atrae, empuja y lleva")}</div>
      </div>
      <div className="grid">{tiles}</div>
    </div>
  );
}

function view() {
  if (mode === "menu") return <div className="screen">{Menu()}</div>;
  return (
    <div className="screen">
      {Board()}
      {Hud()}
      {Bar()}
      {mode === "play" && (clock < 4 || showHelp > 0) && !wd.hand.on ? <div className="tip">👆 {rg.t("Pidä sormi ruudulla ja liikuta", "Hold your finger down and move", "Mantén el dedo y muévelo")}</div> : null}
      {mode === "intro" ? Intro() : null}
      {mode === "done" ? Done() : null}
    </div>
  );
}
