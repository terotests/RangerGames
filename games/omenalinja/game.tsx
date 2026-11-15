// Omenalinjasto: apples (and other things) run along a production line that
// never stops. The child drags measuring machines from the tray at the bottom
// onto the line and sets each one: what it compares and with what. A thing
// that a machine does not let through drops through a hatch to the waste
// cart; the rest are sliced and fall into the boss's crate. Every change
// shows at once on the running line.
//
//   🎨 colour camera   a light cone; the lens shows the colour it wants
//   📏 size gate       a flap hangs as low as the cherry / tennis ball / melon
//                      is tall: a bigger thing pushes it aside
//   ⚖️ scale           a balance with the cherry / tennis ball / pumpkin on
//                      the other pan: it tips to the heavier side
//
// The machines on the line are the rule ("jos … ja … → eteenpäin"), shown
// under the line as a sentence or as code. A full crate is taken away by the
// carrier robot; three clean crates in a row (and no good apples in the waste
// cart) fill the boss's order. The boss's face follows what lands in the
// crate. The line can be paused or slowed, and any thing can be tapped to see
// what the machines measured: debugging.
//
// The game starts with the line running by itself while its parts are
// explained, then "Aloita". The boss gives each order on a screen of its own.
// Challenges, concrete first (three orders each):
//   1 Väri   2 Koko   3 Paino (foam balls, pumpkins)   4 Ja (two machines)   5 Ei ("ei ole")
import { K, Level, setup, step, start, win, miss, update, back, burst, Header, Done, Sparks, Poly, Line, Circle, Box, PointAt, star, Robot } from "lib/kit";
import { Item, Cond, Rule, Order, ORDERS, SIZE, WEIGHT, propsFor, maxRows, opsFor, valuesFor, complete, holds, check, wanted, verdict, jams, judge, batch, apple } from "lib/rules";

const ICON: any = { vari: "🎨", koko: "📏", paino: "⚖️" };
const LEVELS: Level[] = [
  { name: rg.t("Väri", "Colour", "Color"), color: "#e63946", say: "ol_l1", pic: () => [] },
  { name: rg.t("Koko", "Size", "Tamaño"), color: "#2a9d8f", say: "ol_l2", pic: () => [] },
  { name: rg.t("Paino", "Weight", "Peso"), color: "#f77f00", say: "ol_l3", pic: () => [] },
  { name: rg.t("Ja", "And", "Y"), color: "#8338ec", say: "ol_l4", pic: () => [] },
  { name: rg.t("Ei", "Not", "No"), color: "#3a86ff", say: "ol_l5", pic: () => [] },
];
const LEVEL_ICON = ["🎨", "📏", "⚖️", "➕", "🚫"];

// ---- layout ---------------------------------------------------------------------
const BY = 290;                         // the belt's top
const TY = BY - 96;                     // the top of a machine
const LY = BY + 62;                     // the low belt that takes the waste to the cart
const BOX_Y = BY + 44;                  // the top of the crate and the cart
const CART_X = 36;
const PANEL_Y = 438;                    // the settings of the chosen machine
const TRAY_Y = 578;                     // the machines to drag
const TILE_W = 66, TILE_H = 68;
const FULL = 4;                         // things in a crate
const STARS = 3;                        // clean crates in a row for an order
const GAP: any = { kirsikka: 7, tennis: 24, meloni: 60 };   // how low the flap hangs above the belt
function slotX(i: number) { return 62 + i * 76; }
function SX() { return width - 82; }    // the slicer
function EX() { return width - 44; }    // the end of the belt
function crateX() { return width - 36; }

// ---- state ----------------------------------------------------------------------
type Station = { p: string; op: string; v: string; flashT: number; ok: boolean; dropT: number; swing: number; tilt: number };
type Thing = { it: Item; x: number; y: number; vy: number; state: string; sliced: boolean; next: number; by: number; old: boolean };
type Held = { it: Item; bad: boolean };
type Haul = { items: Held[]; t: number; dirty: boolean };

let slots: (Station | null)[] = [null, null, null];
let sel = -1;                          // the machine whose settings show
let order: Order = ORDERS[0][0];
let items: Item[] = [];                // the first batch of the order: the boss's examples
let queue: Item[] = [];
let things: Thing[] = [];
let last: Thing | null = null;         // the newest thing on the belt
let crate: Held[] = [];
let cart: Held[] = [];
let crateHaul: Haul = { items: [], t: -10, dirty: false };
let cartHaul: Haul = { items: [], t: -10, dirty: false };
let stars = 0;
let phase = "line";                    // order (the boss's own screen) | line
let speed = 60;
let paused = false;
let slow = false;
let jamT = -10;
let happyT = -10, sadT = -10, sayT = -10;
let hintT = -10;
let hint: any = null;                  // { slot } or { tray }
let code = false;                      // show the rule as real code
let insp: Thing | null = null;         // the thing being looked at
let demo = false;                      // the start screen's line runs by itself
let introT = 0;
let introSaid = -1;
let cleared: number[] = rg.load("cleared", [0, 0, 0, 0, 0]);
let doneMarked = false;
type Drag = { on: boolean; p: string; from: number; x0: number; y0: number; x: number; y: number; moved: boolean };
let drag: Drag = { on: false, p: "", from: -1, x0: 0, y0: 0, x: 0, y: 0, moved: false };

function nslots(): number { return demo ? 1 : maxRows(K.level); }
function props(): string[] { return demo ? ["vari"] : propsFor(K.level); }
function station(p: string): Station {
  const ops = opsFor(p, demo ? 0 : K.level);
  return { p, op: ops.length === 1 ? ops[0] : "", v: "", flashT: -10, ok: true, dropT: -10, swing: 0, tilt: 0 };
}
// the machines on the line as a rule, and the slot of each row
function ruleSlots(): number[] {
  const out: number[] = [];
  for (let i = 0; i < nslots(); i++) { const s = slots[i]; if (s && complete(s)) out.push(i); }
  return out;
}
function rule(): Rule { return ruleSlots().map((i) => slots[i] as Cond); }
function judged(): boolean { return !demo && K.solved < 0; }

// ---- pictures ----------------------------------------------------------------------

const COLOR: any = { punainen: ["#e63946", "#a4161a"], vihrea: ["#8ac926", "#5a8f17"], keltainen: ["#ffd23f", "#c9a227"], oranssi: ["#f77f00", "#b85c00"] };
const TEAL = "#2f4b55", DARK = "#1f363e", MINT = "#8fd3c7", ORANGE = "#f4a24a", PLUM = "#8e2a6b", STEEL = "#4f6d78";

function AppleArt(x: number, y: number, r: number, color: string): any[] {
  const out: any[] = [];
  const c = COLOR[color][0], d = COLOR[color][1];
  out.push(Circle(x - r * 0.3, y, r * 0.78, c));
  out.push(Circle(x + r * 0.3, y, r * 0.78, c));
  out.push(Circle(x, y + r * 0.12, r * 0.8, c));
  out.push(Circle(x - r * 0.38, y - r * 0.25, r * 0.22, "rgba(255,255,255,0.45)"));
  out.push(Line([[x, y - r * 0.55], [x + r * 0.1, y - r * 1.05]], "#6c584c", Math.max(2, r * 0.14)));
  out.push(Poly([[x + r * 0.1, y - r * 0.85], [x + r * 0.55, y - r * 1.1], [x + r * 0.5, y - r * 0.8]], "#2d6a4f"));
  out.push(Box(x - r * 0.05, y + r * 0.62, r * 0.1, r * 0.1, d, 1));
  return out;
}

// px per cm on the line, so sizes can be compared by eye
const PX = 1.9;
// how far a thing reaches below its middle: it stands on the belt
function foot(it: Item): number {
  if (it.kind === "omena") return it.cm * PX * 0.92;
  if (it.kind === "kirsikka") return 3.2;
  if (it.kind === "pallo") return it.cm * PX * 0.85;
  return 31.5;
}
function ThingArt(it: Item, x: number, y: number, s: number, sliced: boolean): any[] {
  const r = it.cm * PX * s;
  if (it.kind === "omena") {
    if (!sliced) return AppleArt(x, y, r, it.color);
    const c = COLOR[it.color][0];
    return [Circle(x - r * 0.5, y, r * 0.7, c), Circle(x - r * 0.45, y, r * 0.55, "#fff3d6"), Circle(x + r * 0.5, y, r * 0.7, c), Circle(x + r * 0.45, y, r * 0.55, "#fff3d6")];
  }
  if (it.kind === "kirsikka") {
    const k = Math.max(2.5, 3.2 * s);
    return [Line([[x - k * 0.9, y], [x + k * 0.2, y - k * 2.6], [x + k * 0.9, y]], "#6c584c", 2), Circle(x - k * 0.9, y, k, "#c1121f"), Circle(x + k * 0.9, y, k, "#c1121f")];
  }
  if (it.kind === "pallo") {
    // a foam ball: as red and big as an apple, but no stem and soft dimples
    const rr = r * 0.85;
    return [Circle(x, y, rr, "#e63946"), Circle(x - rr * 0.35, y - rr * 0.35, rr * 0.25, "rgba(255,255,255,0.45)"), Circle(x + rr * 0.3, y + rr * 0.2, rr * 0.12, "#c1121f"), Circle(x - rr * 0.1, y + rr * 0.45, rr * 0.1, "#c1121f"), Circle(x + rr * 0.45, y - rr * 0.25, rr * 0.1, "#c1121f")];
  }
  // a pumpkin: the biggest thing the line can carry
  const f = 42 * s;
  return [Circle(x - f * 0.35, y + f * 0.05, f * 0.62, "#e85d04"), Circle(x + f * 0.35, y + f * 0.05, f * 0.62, "#e85d04"), Circle(x, y, f * 0.75, "#f48c06"), Box(x - f * 0.08, y - f * 0.92, f * 0.16, f * 0.24, "#386641", 2)];
}

function Cross(x: number, y: number, r: number) {
  return [Line([[x - r, y - r], [x + r, y + r]], "#d62828", 4), Line([[x + r, y - r], [x - r, y + r]], "#d62828", 4)];
}
function Tick(x: number, y: number, r: number) {
  return [Line([[x - r, y], [x - r * 0.3, y + r * 0.7], [x + r, y - r * 0.7]], "#06d6a0", 4)];
}

// the hall behind the line: arches, lamps, pipes
function Hall() {
  const out: any[] = [];
  out.push(<div style={{ position: "absolute", left: 0, top: 112, width, height: BY + 112 - 112, backgroundColor: "#e6eeeb" }} />);
  out.push(Circle(width * 0.22, BY - 6, 88, "#d3e6df"));
  out.push(Circle(width * 0.8, BY - 6, 84, "#d3e6df"));
  out.push(Box(0, BY + 20, width, 92, "#e6eeeb", 0));
  for (let k = 0; k < 6; k++) out.push(Box(14 + k * 62, 172 + (k % 2) * 46, 26, 12, "#d9e3e0", 3));
  for (const lx of [24, width / 2, width - 24]) { out.push(Line([[lx, 164], [lx, 174]], TEAL, 2)); out.push(Poly([[lx - 8, 180], [lx + 8, 180], [lx + 4, 174], [lx - 4, 174]], TEAL)); out.push(Circle(lx, 182, 4, ORANGE)); }
  out.push(Box(0, BY + 100, width, 6, TEAL, 0));
  return out;
}

function running(): boolean { return !paused && K.t - jamT > 1.6; }

function Belts() {
  const out: any[] = [];
  // the chute the things come from
  out.push(Poly([[0, BY - 60], [16, BY - 60], [26, BY - 2], [0, BY - 2]], TEAL));
  out.push(Box(4, BY - 2, EX() + 6, 24, ORANGE, 12));
  out.push(Box(6, BY, EX() + 2, 20, "#26333d", 10));
  const spin = K.t * speed / 9 * (slow ? 0.35 : 1);
  for (let x = 20; x < EX() + 4; x += 30) {
    out.push(Circle(x, BY + 10, 7, "#6b8a96"));
    out.push(Circle(x + Math.cos(running() ? spin : 0) * 3.5, BY + 10 + Math.sin(running() ? spin : 0) * 3.5, 2, "#e6eeeb"));
  }
  // the low belt under the hatches: the waste rolls left to the cart
  const lx = 62, lw = slotX(nslots() - 1) + 26 - lx;
  out.push(Box(lx, LY, lw, 10, "#26333d", 5));
  for (let x = lx + 8; x < lx + lw - 2; x += 18) out.push(Circle(x - (running() ? (K.t * 30) % 18 : 0) + 9, LY + 5, 2, "#6b8a96"));
  return out;
}

// a machine on the line (or in the hand): the head says its setting, the lamp
// what it thought of the last thing, and under the head the measuring shows
function StationArt(cx: number, top: number, st: Station, chosen: boolean): any[] {
  const out: any[] = [];
  const by = top + 96;
  const fresh = K.t - st.flashT < 0.6;
  out.push(Box(cx - 32, top + 26, 5, 70, TEAL, 2)); out.push(Box(cx + 27, top + 26, 5, 70, TEAL, 2));
  if (st.p === "vari") {
    const c = st.v ? COLOR[st.v][0] : "#adb5bd";
    out.push(Poly([[cx - 4, top + 46], [cx + 4, top + 46], [cx + 17, by], [cx - 17, by]], fresh ? "rgba(255,214,102,0.6)" : "rgba(255,214,102,0.28)"));
    out.push(Box(cx - 9, top + 28, 18, 12, DARK, 3));
    out.push(Circle(cx, top + 43, 7, DARK)); out.push(Circle(cx, top + 43, 5, c));
  } else if (st.p === "koko") {
    // the flap: its foot is as high above the belt as the reference is tall
    const L = 66 - (st.v ? GAP[st.v] : 30), a = st.swing * 1.1;
    const ex = cx + Math.sin(a) * L, ey = top + 30 + Math.cos(a) * L;
    out.push(Line([[cx, top + 30], [ex, ey]], ORANGE, 5));
    out.push(Circle(ex, ey, 4, "#c97d2e"));
    if (st.v) out.push(<div className="emoji" style={{ left: cx - 31, top: by - GAP[st.v] - 2 - (st.v === "meloni" ? -6 : 12), width: 14, height: 14, fontSize: 9 }}>{VICON[st.v]}</div>);
  } else {
    // the balance: the reference sits on the left pan, the thing pulls the right one
    const a = st.tilt * 0.38, px = cx, py = top + 44;
    const lx = px - Math.cos(a) * 20, ly = py - Math.sin(a) * 20, rx = px + Math.cos(a) * 20, ry = py + Math.sin(a) * 20;
    out.push(Line([[px, top + 28], [px, py]], DARK, 3));
    out.push(Line([[lx, ly], [rx, ry]], DARK, 4));
    out.push(Line([[lx, ly], [lx, ly + 12]], STEEL, 2)); out.push(Box(lx - 8, ly + 12, 16, 3, STEEL, 1));
    out.push(Line([[rx, ry], [rx, ry + 12]], STEEL, 2)); out.push(Box(rx - 8, ry + 12, 16, 3, STEEL, 1));
    if (st.v) out.push(<div className="emoji" style={{ left: lx - 8, top: ly - 1, width: 16, height: 14, fontSize: 10 }}>{VICON[st.v]}</div>);
    out.push(Box(cx - 17, by - 3, 34, 5, MINT, 2));
  }
  if (chosen) out.push(Box(cx - 36, top - 3, 72, 36, "#ffd166", 10));
  out.push(Box(cx - 33, top, 66, 30, TEAL, 8));
  const text = complete(st) ? ICON[st.p] + " " + OPICON[st.op] + " " + VICON[st.v] : ICON[st.p] + " ?";
  out.push(<div className={complete(st) || Math.sin(K.t * 6) > 0 ? "stlabel" : "stlabel ask"} style={{ left: cx - 33, top, width: 66, height: 30 }}>{text}</div>);
  out.push(Circle(cx + 27, top - 2, 6, DARK));
  out.push(Circle(cx + 27, top - 2, 4, fresh ? (st.ok ? "#06d6a0" : "#ef476f") : STEEL));
  return out;
}

function Slicer(x: number, y: number) {
  const out: any[] = [];
  const jam = K.t - jamT < 1.6;
  if (jam) x += Math.sin(K.t * 60) * 3;
  out.push(Poly([[x - 22, y - 86], [x + 22, y - 86], [x + 9, y - 68], [x - 9, y - 68]], ORANGE));
  out.push(Box(x - 26, y - 64, 52, 60, MINT, 8));
  out.push(Box(x - 26, y - 64, 52, 9, "#6fb8ab", 6));
  for (let k = 0; k < 5; k++) out.push(Poly([[x - 25 + k * 11, y - 14], [x - 19 + k * 11, y - 14], [x - 21 + k * 11, y - 5], [x - 27 + k * 11, y - 5]], DARK));
  out.push(Circle(x, y - 38, 14, TEAL));
  out.push(Poly(star(x, y - 38, 11, 4, 4, running() ? K.t * 12 * (slow ? 0.35 : 1) : 0), "#e9ecef"));
  out.push(Circle(x + 18, y - 52, 4, jam ? "#d62828" : "#9be564"));
  if (K.t - jamT < 2.4) for (let k = 0; k < 4; k++) { const t = (K.t * 0.8 + k * 0.25) % 1; out.push(Circle(x - 10 + k * 7 + Math.sin(t * 6 + k) * 6, y - 92 - t * 50, 8 + t * 10, "rgba(108,117,125," + (0.6 - t * 0.5).toFixed(2) + ")")); }
  return out;
}

// what is in a crate or the cart, small
function Inside(list: Held[], x: number, y: number): any[] {
  const out: any[] = [];
  list.forEach((h, i) => {
    const hx = x - 11 + (i % 2) * 22, hy = y + 28 - Math.floor(i / 2) * 15;
    if (h.bad) out.push(Circle(hx, hy, 10, "#ef476f"));
    for (const e of ThingArt(h.it, hx, hy, h.it.kind === "kurpitsa" ? 0.2 : 0.5, false)) out.push(e);
  });
  return out;
}

function Crate(x: number, y: number, list: Held[], mark: string): any[] {
  const out: any[] = [];
  for (const e of Inside(list, x, y)) out.push(e);
  out.push(Box(x - 27, y + 18, 54, 24, "#d4a373", 3));
  out.push(Box(x - 27, y + 18, 54, 4, "#b98b5e", 2));
  out.push(Box(x - 27, y + 29, 54, 3, "#b98b5e", 0));
  out.push(<div className="emoji" style={{ left: x - 12, top: y + 20, width: 24, height: 20, fontSize: 13 }}>{mark}</div>);
  return out;
}

function Cart(x: number, y: number, list: Held[]): any[] {
  const out: any[] = [];
  for (const e of Inside(list, x, y - 4)) out.push(e);
  out.push(Poly([[x - 26, y + 16], [x + 26, y + 16], [x + 20, y + 42], [x - 20, y + 42]], TEAL));
  out.push(Box(x - 28, y + 13, 56, 6, DARK, 3));
  out.push(Circle(x - 12, y + 46, 5, DARK)); out.push(Circle(x + 12, y + 46, 5, DARK));
  out.push(<div className="emoji" style={{ left: x - 12, top: y + 20, width: 24, height: 20, fontSize: 13 }}>🗑️</div>);
  return out;
}

// the crate and the cart, and the carrier robot that takes a full one away
function Boxes() {
  const out: any[] = [];
  const mark = demo || order.dest === "kauppa" ? "🛒" : "🧃";
  const ht = K.t - crateHaul.t;
  let off = 0, list = crate, sign = "";
  if (ht < 0.5) { off = ht / 0.5 * 100; list = crateHaul.items; sign = crateHaul.dirty ? "bad" : "ok"; }
  else if (ht < 1) off = (1 - ht) / 0.5 * 100;
  for (const e of Robot(crateX() - 46 + off, BOX_Y + 30, 0.34, "#3a86ff", 1, ht < 1 && !crateHaul.dirty ? "happy" : "")) out.push(e);
  for (const e of Crate(crateX() + off, BOX_Y, list, mark)) out.push(e);
  if (sign === "bad") for (const e of Cross(crateX() + off, BOX_Y + 6, 10)) out.push(e);
  if (sign === "ok") out.push(<div className="emoji" style={{ left: crateX() + off - 14, top: BOX_Y - 12 - ht * 40, width: 28, height: 28, fontSize: 20 }}>⭐</div>);
  const ct = K.t - cartHaul.t;
  let coff = 0, clist = cart;
  if (ct < 0.5) { coff = -ct / 0.5 * 90; clist = cartHaul.items; }
  else if (ct < 1) coff = -(1 - ct) / 0.5 * 90;
  for (const e of Cart(CART_X + coff, BOX_Y, clist)) out.push(e);
  if (ct < 0.5 && cartHaul.dirty) for (const e of Cross(CART_X + coff, BOX_Y + 4, 10)) out.push(e);
  return out;
}

function Boss(x: number, y: number, s: number, mood: string) {
  const out: any[] = [];
  const bob = mood === "happy" ? -Math.abs(Math.sin(K.t * 9)) * 4 * s : 0;
  y += bob;
  out.push(Box(x - 30 * s, y + 26 * s, 60 * s, 64 * s, "#343a40", 14 * s));
  out.push(Poly([[x - 6 * s, y + 28 * s], [x + 6 * s, y + 28 * s], [x + 4 * s, y + 62 * s], [x, y + 70 * s], [x - 4 * s, y + 62 * s]], "#d62828"));
  out.push(Poly([[x - 12 * s, y + 26 * s], [x, y + 36 * s], [x + 12 * s, y + 26 * s]], "#ffffff"));
  for (const e of BossHead(x, y, s, mood)) out.push(e);
  return out;
}
function BossHead(x: number, y: number, s: number, mood: string) {
  const out: any[] = [];
  out.push(Circle(x, y, 28 * s, "#e09f3e"));
  out.push(Circle(x, y, 26 * s, "#ffd6a5"));
  out.push(Box(x - 26 * s, y - 28 * s, 52 * s, 16 * s, "#6c584c", 8 * s));
  out.push(Circle(x - 9 * s, y - 2 * s, 7 * s, "#ffffff")); out.push(Circle(x + 9 * s, y - 2 * s, 7 * s, "#ffffff"));
  const look = mood === "sad" ? 1.5 * s : 0;
  out.push(Circle(x - 9 * s + look, y - 2 * s + look, 2.8 * s, "#3d405b")); out.push(Circle(x + 9 * s + look, y - 2 * s + look, 2.8 * s, "#3d405b"));
  if (mood === "happy") out.push(Poly([[x - 11 * s, y + 9 * s], [x + 11 * s, y + 9 * s], [x + 6 * s, y + 19 * s], [x - 6 * s, y + 19 * s]], "#ef476f"));
  else if (mood === "sad") {
    out.push(Line([[x - 9 * s, y + 17 * s], [x, y + 11 * s], [x + 9 * s, y + 17 * s]], "#3d405b", Math.max(2, 3 * s)));
    out.push(Line([[x - 15 * s, y - 13 * s], [x - 4 * s, y - 9 * s]], "#3d405b", Math.max(2, 3 * s)));
    out.push(Line([[x + 15 * s, y - 13 * s], [x + 4 * s, y - 9 * s]], "#3d405b", Math.max(2, 3 * s)));
  } else out.push(Line([[x - 9 * s, y + 11 * s], [x, y + 15 * s], [x + 9 * s, y + 11 * s]], "#3d405b", Math.max(2, 3 * s)));
  return out;
}
function mood(): string { return K.t - sadT < 2.5 ? "sad" : K.t - happyT < 1.2 || K.solved >= 0 ? "happy" : "ok"; }

// ---- the parts of a rule ----------------------------------------------------------------

const PNAME: any = { vari: rg.t("väri", "colour", "color"), koko: rg.t("koko", "size", "tamaño"), paino: rg.t("paino", "weight", "peso") };
const MNAME: any = { vari: rg.t("Värikamera", "Colour camera", "Cámara de color"), koko: rg.t("Mittaportti", "Size gate", "Puerta de medida"), paino: rg.t("Vaaka", "Scale", "Báscula") };
const OPNAME: any = { on: rg.t("on", "is", "es"), ei: rg.t("ei ole", "is not", "no es"), yli: rg.t("suurempi kuin", "more than", "más que"), alle: rg.t("pienempi kuin", "less than", "menos que") };
const VNAME: any = {
  punainen: rg.t("punainen", "red", "rojo"), vihrea: rg.t("vihreä", "green", "verde"), keltainen: rg.t("keltainen", "yellow", "amarillo"),
  kirsikka: rg.t("kirsikka", "cherry", "cereza"), tennis: rg.t("tennispallo", "tennis ball", "pelota"), meloni: rg.t("meloni", "melon", "melón"), kurpitsa: rg.t("kurpitsa", "pumpkin", "calabaza"),
};
const VICON: any = { punainen: "🔴", vihrea: "🟢", keltainen: "🟡", kirsikka: "🍒", tennis: "🎾", meloni: "🍉", kurpitsa: "🎃" };
const OPICON: any = { on: "=", ei: "≠", yli: ">", alle: "<" };
const CNAME: any = { kirsikka: "KIRSIKKA", tennis: "TENNISPALLO", meloni: "MELONI", kurpitsa: "KURPITSA" };

function refText(p: string, v: string): string {
  if (p === "koko") return SIZE[v] + " cm";
  if (p === "paino") return WEIGHT[v] >= 1000 ? WEIGHT[v] / 1000 + " kg" : WEIGHT[v] + " g";
  return "";
}
function measure(it: Item, p: string): string {
  if (p === "vari") return (VICON[it.color] || "🟠") + " " + (VNAME[it.color] || rg.t("oranssi", "orange", "naranja"));
  if (p === "koko") return it.cm.toFixed(1).replace(".0", "") + " cm";
  return it.g >= 1000 ? (it.g / 1000).toFixed(1) + " kg" : it.g + " g";
}
function condCode(c: Cond): string {
  if (c.p === "vari") return "o.vari " + (c.op === "on" ? "==" : "!=") + " \"" + c.v + "\"";
  return "o." + c.p + " " + OPICON[c.op] + " " + CNAME[c.v] + "." + c.p;
}
function condShort(c: Cond): string { return ICON[c.p] + " " + OPICON[c.op] + " " + VICON[c.v]; }

// ---- dragging machines between the tray and the line ----------------------------------------

function trayTile(k: number): number[] { return [12 + k * (TILE_W + 6), TRAY_Y, TILE_W, TILE_H]; }
function headRect(i: number): number[] { return [slotX(i) - 36, TY - 8, 72, 44]; }
function inRect(x: number, y: number, r: number[]): boolean { return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }
function canEdit(): boolean { return K.mode === "play" && phase === "line" && !demo && K.solved < 0; }

function onPointerDown(x: number, y: number) {
  if (!canEdit()) return;
  let p = "", from = -1;
  props().forEach((q, k) => { if (inRect(x, y, trayTile(k))) p = q; });
  if (!p) for (let i = 0; i < nslots(); i++) { const s = slots[i]; if (s && inRect(x, y, headRect(i))) { p = s.p; from = i; } }
  if (!p) return;
  drag = { on: true, p, from, x0: x, y0: y, x, y, moved: false };
  rg.sound("click", { pitch: 1.4 });
}

function overSlot(x: number, y: number): number {
  if (y < TY - 60 || y > BY + 70) return -1;
  let best = -1;
  for (let i = 0; i < nslots(); i++) if (Math.abs(x - slotX(i)) < 40) best = i;
  return best;
}

function place(i: number, st: Station) {
  slots[i] = st; sel = i; insp = null; code = false;
  edited();
  rg.sound("pop"); rg.vibrate(20);
  rg.say(complete(st) ? ["ol_c_" + st.p] : ["ol_c_" + st.p, "ol_k_valitse"]);
}

function onPointerUp() {
  if (!drag.on) return;
  const d = drag;
  drag = { on: false, p: "", from: -1, x0: 0, y0: 0, x: 0, y: 0, moved: false };
  if (!d.moved) {
    // a tap: a machine in the tray jumps to the first free place, one on the line is chosen
    if (d.from >= 0) { sel = sel === d.from ? -1 : d.from; insp = null; code = false; rg.say("ol_c_" + d.p); return; }
    let free = -1;
    for (let i = nslots() - 1; i >= 0; i--) if (!slots[i]) free = i;
    if (free < 0) { rg.sound("wrong"); return; }
    place(free, station(d.p));
    return;
  }
  const to = overSlot(d.x, d.y);
  if (d.from < 0) { if (to >= 0) place(to, station(d.p)); else rg.sound("whoosh", { pitch: 1.3 }); return; }
  const st = slots[d.from];
  edited();
  if (to < 0) { slots[d.from] = null; if (sel === d.from) sel = -1; rg.sound("whoosh"); return; }
  slots[d.from] = slots[to]; slots[to] = st; sel = to;
  rg.sound("pop");
}

function dragStep(input: any) {
  if (!drag.on) return;
  drag.x = input.pointer.x; drag.y = input.pointer.y;
  if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 8) drag.moved = true;
  if (!input.pointer.down) onPointerUp();
}

function choose(part: string, val: string) {
  const st = slots[sel];
  if (!st || !canEdit()) return;
  if (part === "op") st.op = val; else st.v = val;
  edited();
  rg.sound("click"); rg.vibrate(10);
  rg.say("ol_c_" + val);
}

function removeSel() {
  if (sel < 0 || !canEdit()) return;
  slots[sel] = null; sel = -1;
  edited();
  rg.sound("whoosh");
}

// ---- the line ---------------------------------------------------------------------------

function sayOrder() {
  const say = K.question === 0 ? ["ol_l" + (K.level + 1), "ol_o_" + order.id] : ["ol_o_" + order.id];
  if (K.level === 0 && K.question === 0) say.push("ol_tavoite");
  rg.say(say);
}

function clearLine() {
  things = []; last = null; crate = []; cart = []; stars = 0; jamT = -10; paused = false; insp = null;
  crateHaul = { items: [], t: -10, dirty: false }; cartHaul = { items: [], t: -10, dirty: false };
  happyT = -10; sadT = -10; hintT = -10; drag.on = false;
}

function next() {
  const s = step();
  demo = false;
  order = ORDERS[K.level][K.question % 3];
  items = batch(order, 0, () => rg.random());
  queue = items.slice();
  speed = [52, 62, 72][s];
  // the machines stay on the line from order to order: they are changed, not rebuilt
  if (K.question === 0) { slots = [null, null, null]; sel = -1; slow = false; }
  K.wait = 3.2; code = false; doneMarked = false;
  clearLine();
  edits = 0; orderT = K.t;
  phase = "order";
  sayOrder();
}

function demoBatch(): Item[] {
  const out: Item[] = [];
  for (let k = 0; k < 6; k++) out.push(apple(rg.pick(["punainen", "punainen", "vihrea", "keltainen"]), rg.random() < 0.3, rg.random()));
  return out;
}

function complain(worst: string, by: number) {
  stars = 0; sadT = K.t;
  // before the child has touched the machines the boss only frowns
  if (!edits) { rg.sound("wrong"); if (K.t - sayT > 14) { sayT = K.t; rg.say(["ol_pomo_" + worst, "ol_k_raahaa"]); } return; }
  const n = miss();
  if (K.t - sayT < 6) return;
  sayT = K.t;
  const say = ["ol_pomo_" + worst];
  if (n >= 2) { setHint(worst, by); say.push("ol_v_" + worst); }
  rg.say(say);
}

// where to point for a complaint: the machine about that property, or the tray
function setHint(worst: string, by: number) {
  hintT = K.t;
  if (worst === "hukka") {
    if (by < 0) { const it = items.find((it) => wanted(it, order) && check(it, rule()) >= 0); if (it) by = ruleSlots()[check(it, rule())]; }
    hint = by >= 0 ? { slot: by } : null;
    return;
  }
  const p = worst === "jumi" ? "paino" : worst;
  for (let i = 0; i < nslots(); i++) { const s = slots[i]; if (s && s.p === p) { hint = { slot: i }; return; } }
  hint = { tray: Math.max(0, props().indexOf(p)) };
}

function worstOf(list: Held[]): string {
  const found = list.filter((h) => h.bad).map((h) => verdict(h.it, true, order));
  for (const w of ["paino", "koko", "vari"]) if (found.indexOf(w) >= 0) return w;
  return "vari";
}

function haulCrate() {
  const dirty = crate.some((h) => h.bad);
  crateHaul = { items: crate, t: K.t, dirty };
  crate = [];
  if (!judged()) { rg.sound("coin", { pitch: 1.2 }); return; }
  if (dirty) { complain(worstOf(crateHaul.items), -1); return; }
  stars++; happyT = K.t;
  rg.sound("coin"); rg.vibrate(30);
  burst(width - 86 + stars * 22, 140, 10);
  if (stars < STARS) return;
  // the order is filled if no good apples lie in the waste cart either
  if (cart.some((h) => h.bad)) { haulCart(); return; }
  win(width / 2, 220, ["ol_pomo_hyva"]);
}

function haulCart() {
  const dirty = cart.some((h) => h.bad);
  cartHaul = { items: cart, t: K.t, dirty };
  cart = [];
  rg.sound("whoosh", { pitch: 0.8 });
  if (judged() && dirty) complain("hukka", lastWaste);
}
let lastWaste = -1;                    // the machine that last dropped a good apple
let edits = 0;                         // changes to the machines during this order
let orderT = 0;

// the machines changed: what is already on its way was sorted by the old
// rule, so the boss does not count it
function edited() {
  edits++;
  for (const t of things) t.old = true;
  for (const h of crate) h.bad = false;
  for (const h of cart) h.bad = false;
}

function sim(dt: number) {
  if (demo) introT += dt;
  if (K.mode !== (demo ? "menu" : "play") || (!demo && phase !== "line")) return;
  if (paused) return;
  if (jamT > 0 && K.t - jamT >= 1.6) { things = things.filter((t) => t.state !== "jam"); jamT = -10; }
  if (jamT > 0) return;
  if (slow) dt *= 0.35;
  // the next thing comes when the one before has made room
  if (!queue.length) queue = demo ? demoBatch() : batch(order, 0, () => rg.random());
  const gap = (last ? foot(last.it) : 0) + foot(queue[0]) + 34;
  if (!last || last.x > -24 + gap) {
    const it = queue.shift() as Item;
    last = { it, x: -24, y: BY - foot(it), vy: 0, state: "belt", sliced: false, next: 0, by: -1, old: false };
    things.push(last);
  }
  for (const t of things) {
    if (t.state === "belt") {
      t.x += speed * dt;
      t.y = BY - foot(t.it) + Math.sin(t.x * 0.21) * 0.8;
      while (t.next < nslots() && t.x >= slotX(t.next)) {
        const st = slots[t.next];
        if (st && complete(st)) {
          st.ok = holds(t.it, st); st.flashT = K.t;
          if (!st.ok) { t.state = "drop"; t.by = t.next; t.x = slotX(t.next); t.vy = 0; st.dropT = K.t; rg.sound("pop", { pitch: 0.8 }); break; }
          rg.sound("tick", { pitch: 1 + t.next * 0.15 });
        }
        t.next++;
      }
      if (t.state !== "belt") continue;
      if (!t.sliced && t.x >= SX()) {
        if (jams(t.it)) { jamT = K.t; t.state = "jam"; rg.sound("hit", { pitch: 0.6 }); rg.vibrate(200); if (judged() && !t.old) complain("jumi", -1); return; }
        t.sliced = true; rg.sound("hit", { pitch: 1.1 + rg.random() * 0.3 });
      }
      if (t.x >= EX()) { t.state = "fall"; t.vy = -90; }
    } else if (t.state === "drop") {
      t.vy += 900 * dt; t.y += t.vy * dt;
      if (t.y >= LY - foot(t.it)) { t.y = LY - foot(t.it); t.state = "low"; }
    } else if (t.state === "low") {
      t.x -= 120 * dt;
      if (t.x <= CART_X + 6) {
        t.state = "gone";
        const bad = judged() && !t.old && wanted(t.it, order);
        if (bad) { lastWaste = t.by; sadT = K.t; rg.sound("wrong"); } else rg.sound("pop", { pitch: 0.6 });
        cart.push({ it: t.it, bad });
        if (cart.length >= FULL) haulCart();
      }
    } else if (t.state === "fall") {
      t.vy += 900 * dt; t.y += t.vy * dt;
      t.x = Math.min(crateX(), t.x + 60 * dt);
      if (t.y > BOX_Y + 14) {
        t.state = "gone";
        const bad = judged() && !t.old && !wanted(t.it, order);
        if (bad) { sadT = K.t; rg.sound("wrong"); } else { if (judged()) happyT = K.t; rg.sound("pop", { pitch: 1.3 }); }
        crate.push({ it: t.it, bad });
        if (crate.length >= FULL) haulCrate();
      }
    }
  }
  things = things.filter((t) => t.state !== "gone");
  // the flaps and the balances follow the thing under them
  for (let i = 0; i < nslots(); i++) {
    const st = slots[i];
    if (!st) continue;
    let swing = 0, tilt = 0;
    for (const t of things) {
      if (t.state !== "belt") continue;
      const d = Math.abs(t.x - slotX(i)), reach = foot(t.it) + 8;
      if (st.p === "koko" && st.v && d < reach && t.it.cm > SIZE[st.v]) swing = Math.max(swing, 1 - d / reach);
      if (st.p === "paino" && st.v && d < 18) tilt = t.it.g > WEIGHT[st.v] ? 1 : -1;
    }
    const k = Math.min(1, dt * 14);
    st.swing += (swing - st.swing) * k; st.tilt += (tilt - st.tilt) * k;
  }
}

function inspect(t: Thing) {
  insp = t; paused = true; code = false;
  rg.sound("click");
}

function togglePause() {
  paused = !paused;
  if (!paused) insp = null;
  rg.sound("click");
}

// the hint is about the symptom: what would go wrong with the things that come
function giveHint() {
  rg.sound("click");
  if (phase === "order") { sayOrder(); return; }
  for (let i = 0; i < nslots(); i++) { const s = slots[i]; if (s && !complete(s)) { hint = { slot: i }; hintT = K.t; sel = i; insp = null; rg.say("ol_v_kesken"); return; } }
  const worst = judge(items, rule(), order);
  if (!worst) { hint = null; rg.say("ol_v_valmis"); return; }
  setHint(worst, -1);
  rg.say("ol_v_" + worst);
}

function onBack() {
  if (insp) { insp = null; paused = false; return; }
  back();
}

// ---- screens -----------------------------------------------------------------------------

// what the boss wants, shown with things from the order's first batch: a good
// one ✓, and one each that the order's rows stop ✗
function examples(): { it: Item; ok: boolean }[] {
  const out: { it: Item; ok: boolean }[] = [];
  const good = items.find((it) => wanted(it, order));
  if (good) out.push({ it: good, ok: true });
  for (const c of order.conds) { const it = items.find((it) => !holds(it, c) && out.every((e) => e.it !== it)); if (it) out.push({ it, ok: false }); }
  return out;
}

function StarRow(x: number, y: number, s: number) {
  const out: any[] = [];
  for (let i = 0; i < STARS; i++) {
    if (i < stars || K.solved >= 0) out.push(<div className="emoji" style={{ left: x + i * 22 * s, top: y - 11 * s, width: 22 * s, height: 22 * s, fontSize: Math.round(17 * s) }}>⭐</div>);
    else out.push(Circle(x + i * 22 * s + 11 * s, y, 7 * s, "#ced4da"));
  }
  return out;
}

// the band over the line: the boss watching, what he wants, and the clean crates so far
function Goal() {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 8, top: 116, width: width - 16, height: 48 }} />);
  for (const e of BossHead(36, 141, 0.72, mood())) out.push(e);
  let x = 82;
  for (const e of examples()) {
    for (const el of ThingArt(e.it, x, 142, e.it.kind === "kurpitsa" ? 0.4 : 0.75, false)) out.push(el);
    for (const el of e.ok ? Tick(x + 13, 152, 6) : Cross(x + 13, 152, 6)) out.push(el);
    x += 46;
  }
  for (const e of StarRow(width - 82, 140, 1)) out.push(e);
  out.push(<div className="hit" id="goal" onClick={() => sayOrder()} style={{ left: 8, top: 116, width: width - 16, height: 48 }} />);
  return out;
}

function LineView() {
  const out: any[] = [];
  for (const e of Hall()) out.push(e);
  for (const e of Belts()) out.push(e);
  const dragging = drag.on && drag.moved;
  const over = dragging ? overSlot(drag.x, drag.y) : -1;
  for (let i = 0; i < nslots(); i++) {
    const st = slots[i], cx = slotX(i);
    if (st && K.t - st.dropT < 0.45) out.push(Box(cx - 14, BY, 28, 20, "#0d1b22", 3));
    if (st && !(dragging && drag.from === i)) { for (const e of StationArt(cx, TY, st, sel === i && !demo)) out.push(e); continue; }
    // a free place for a machine
    const glow = dragging ? (over === i ? "rgba(255,209,102,0.85)" : "rgba(255,209,102," + (0.3 + 0.2 * Math.sin(K.t * 6)).toFixed(2) + ")") : "rgba(47,75,85,0.13)";
    out.push(Box(cx - 33, TY, 66, 30, glow, 8));
    out.push(Box(cx - 32, TY + 26, 5, 70, glow, 2)); out.push(Box(cx + 27, TY + 26, 5, 70, glow, 2));
    if (!demo) out.push(<div className="stlabel plus" style={{ left: cx - 33, top: TY, width: 66, height: 30 }}>+</div>);
  }
  things.forEach((t, i) => {
    if (t.state === "jam") return;
    if (insp === t) out.push(Circle(t.x, t.y, foot(t.it) + 7, "rgba(255,209,102,0.7)"));
    for (const e of ThingArt(t.it, t.x, t.y, 1, t.sliced)) out.push(e);
  });
  // the slicer is in front: a thing goes in whole and comes out in halves
  for (const e of Slicer(SX(), BY)) out.push(e);
  for (const t of things) if (t.state === "jam") for (const e of ThingArt(t.it, SX(), BY - 100 + Math.sin(K.t * 40) * 2, 0.7, false)) out.push(e);
  for (const e of Boxes()) out.push(e);
  // tapping a thing on the belt stops the line and shows what the machines think of it
  if (!demo && K.solved < 0) things.forEach((t, i) => {
    if (t.state !== "belt" || t.x > SX() - 24) return;
    out.push(<div className="hit" id={"th" + i} onClick={() => inspect(t)} style={{ left: t.x - 20, top: BY - 46, width: 40, height: 50 }} />);
  });
  return out;
}

// the machines as a sentence: this is the rule the line follows
function RuleStrip(y: number) {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 8, top: y, width: width - 16, height: 38, backgroundColor: "#1d3557" }} />);
  let x = 16;
  let n = 0;
  for (let i = 0; i < nslots(); i++) {
    const st = slots[i];
    if (!st) continue;
    const word = n === 0 ? rg.t("jos", "if", "si") : rg.t("ja", "and", "y");
    out.push(<div className="kw" style={{ left: x, top: y + 7, width: 28, height: 24 }}>{word}</div>);
    x += n === 0 ? 30 : 22;
    const bad = K.t - st.flashT < 0.6 && !st.ok;
    out.push(<div className={bad ? "chip bad" : sel === i ? "chip sel" : complete(st) ? "chip on" : "chip ask"} style={{ left: x, top: y + 5, width: 62, height: 28 }}><div className="chiptext small">{complete(st) ? condShort(st) : ICON[st.p] + " ?"}</div></div>);
    x += 66;
    n++;
  }
  if (!n) out.push(<div className="kw dim" style={{ left: 16, top: y + 7, width: width - 90, height: 24 }}>{rg.t("ei mittareita: kaikki menee läpi", "no machines: everything goes through", "sin máquinas: todo pasa")}</div>);
  else out.push(<div className="kw" style={{ left: x, top: y + 7, width: 46, height: 24 }}>{"→ 📦"}</div>);
  if (!demo) out.push(<div className="pad" id="code" onClick={() => { code = !code; insp = null; rg.sound("click"); }} style={{ left: width - 60, top: y + 5, width: 46, height: 28, backgroundColor: code ? "#ffd166" : "#457b9d" }}><div className="tiny" style={{ left: 0, top: 5, width: 46, height: 18, color: code ? "#1d3557" : "#ffffff" }}>{"</>"}</div></div>);
  return out;
}

// under the rule: the thing being looked at, the code, or the chosen machine's settings
function Panel(y: number) {
  const out: any[] = [];
  const h = 132;
  if (insp) {
    const t = insp;
    out.push(<div className="card" style={{ left: 8, top: y, width: width - 16, height: h, backgroundColor: "#fffdf5" }} />);
    for (const e of ThingArt(t.it, 42, y + 52, t.it.kind === "kurpitsa" ? 0.6 : Math.min(1.6, 26 / (t.it.cm * PX)), false)) out.push(e);
    props().forEach((p, k) => out.push(<div className="mtext" style={{ left: 80, top: y + 10 + k * 26, width: 112, height: 24 }}>{ICON[p] + " " + measure(t.it, p)}</div>));
    let fail = false, k = 0;
    for (let i = 0; i < nslots(); i++) {
      const st = slots[i];
      if (!st || !complete(st)) continue;
      const ok = holds(t.it, st);
      out.push(<div className={fail ? "etext off" : ok ? "etext" : "etext bad"} style={{ left: 196, top: y + 10 + k * 26, width: width - 250, height: 24 }}>{condShort(st) + (fail ? "" : ok ? " ✓" : " ✗")}</div>);
      if (!ok) fail = true;
      k++;
    }
    out.push(<div className={fail ? "etext res no" : "etext res"} style={{ left: 196, top: y + 14 + Math.max(1, k) * 26, width: width - 210, height: 24 }}>{fail ? "→ 🗑️ " + rg.t("pois", "off", "fuera") : "→ 📦 " + rg.t("eteenpäin", "go on", "adelante")}</div>);
    const w = wanted(t.it, order);
    out.push(<div className="mtext" style={{ left: 20, top: y + h - 30, width: 170, height: 24 }}>{rg.t("Pomo: ", "Boss: ", "Jefe: ") + (w ? "👍" : "👎")}</div>);
    out.push(<div className="pad" id="iclose" onClick={() => togglePause()} style={{ left: width - 50, top: y + 8, width: 34, height: 34, backgroundColor: "#06d6a0" }}><div className="tiny" style={{ left: 0, top: 7, width: 34, height: 20, color: "#ffffff" }}>▶</div></div>);
    return out;
  }
  if (code) {
    out.push(<div className="card" style={{ left: 8, top: y, width: width - 16, height: h, backgroundColor: "#1d3557" }} />);
    const conds = rule().map(condCode);
    const lines = ["function suodatin(o) {", "  if (" + (conds.length ? conds.join(" &&\n      ") : "true") + ")", "    return ETEENPAIN", "  return POIS", "}"];
    let ly = y + 8;
    for (const l of lines) for (const part of l.split("\n")) {
      let sp = 0;
      while (part.charAt(sp) === " ") sp++;
      out.push(<div className="codeline" style={{ left: 20 + sp * 7, top: ly, width: width - 40 - sp * 7, height: 18 }}>{part.substring(sp)}</div>);
      ly += 18;
    }
    return out;
  }
  const st = sel >= 0 ? slots[sel] : null;
  if (!st) {
    const none = slots.every((s) => !s);
    out.push(<div className="help" style={{ left: 8, top: y + 30, width: width - 16, height: 60 }}>{none ? rg.t("👇 Raahaa mittari linjalle", "👇 Drag a machine onto the line", "👇 Arrastra una máquina a la línea") : rg.t("👆 Napauta mittaria ja säädä sitä", "👆 Tap a machine to set it", "👆 Toca una máquina para ajustarla")}</div>);
    return out;
  }
  out.push(<div className="card" style={{ left: 8, top: y, width: width - 16, height: h, backgroundColor: "#fff8e1" }} />);
  out.push(<div className="ptitle" style={{ left: 18, top: y + 4, width: 200, height: 22 }}>{ICON[st.p] + " " + MNAME[st.p] + ": " + PNAME[st.p]}</div>);
  out.push(<div className="pad" id="rm" onClick={() => removeSel()} style={{ left: width - 50, top: y + 4, width: 34, height: 24, backgroundColor: "#adb5bd" }}><div className="tiny" style={{ left: 0, top: 3, width: 34, height: 18, color: "#ffffff" }}>✕</div></div>);
  const ops = opsFor(st.p, K.level), vals = valuesFor(st.p);
  const ow = Math.floor((width - 36 - (ops.length - 1) * 8) / ops.length);
  // with only one way to compare (a colour "is"), the choice is just the value
  const one = ops.length === 1, vy = one ? y + 34 : y + 76, vh = one ? 88 : 50;
  if (!one) ops.forEach((o, k) => {
    out.push(<div className="opt row" id={"op" + o} onClick={() => choose("op", o)} style={{ left: 18 + k * (ow + 8), top: y + 30, width: ow, height: 40, backgroundColor: st.op === o ? "#ffd166" : "#ffffff" }}>
      <div className="optbig">{OPICON[o]}</div><div className="optlabel pad6">{OPNAME[o]}</div>
    </div>);
  });
  const vw = Math.floor((width - 36 - (vals.length - 1) * 8) / vals.length);
  vals.forEach((v, k) => {
    out.push(<div className="opt" id={"v" + v} onClick={() => choose("v", v)} style={{ left: 18 + k * (vw + 8), top: vy, width: vw, height: vh, backgroundColor: st.v === v ? "#ffd166" : "#ffffff" }}>
      <div className={one ? "optbig" : "optmid"}>{VICON[v]}</div>
      <div className="optlabel">{VNAME[v] + (st.p === "vari" ? "" : "  " + refText(st.p, v))}</div>
    </div>);
  });
  if (K.t - hintT < 6 && hint && hint.slot === sel && !complete(st)) out.push(PointAt(st.op === "" ? 18 + ow / 2 : 18 + vw / 2, st.op === "" ? y + 34 : vy + 4, "#f77f00"));
  return out;
}

function Tray() {
  const out: any[] = [];
  props().forEach((p, k) => {
    const r = trayTile(k);
    out.push(<div className="opt" style={{ left: r[0], top: r[1], width: r[2], height: r[3], backgroundColor: "#ffffff" }}>
      <div className="optbig">{ICON[p]}</div><div className="optlabel">{MNAME[p]}</div>
    </div>);
  });
  out.push(<div className="pad" id="pause" onClick={() => togglePause()} style={{ left: width - 124, top: TRAY_Y + 6, width: 52, height: 56, backgroundColor: paused ? "#06d6a0" : "#ffb703" }}><div className="padtext">{paused ? "▶" : "⏸"}</div></div>);
  out.push(<div className="pad" id="slow" onClick={() => { slow = !slow; rg.sound("click", { pitch: slow ? 0.7 : 1.3 }); }} style={{ left: width - 64, top: TRAY_Y + 6, width: 52, height: 56, backgroundColor: slow ? "#118ab2" : "#c6dcf2" }}><div className="padtext">🐢</div></div>);
  if (K.t - hintT < 6 && hint && hint.tray >= 0) { const r = trayTile(hint.tray); out.push(PointAt(r[0] + r[2] / 2, r[1] + 4, "#f77f00")); }
  return out;
}

// the machine in the hand
function DragGhost() {
  if (!drag.on || !drag.moved) return [];
  const st = drag.from >= 0 && slots[drag.from] ? (slots[drag.from] as Station) : station(drag.p);
  const over = overSlot(drag.x, drag.y);
  if (over >= 0) return StationArt(slotX(over), TY, st, true);
  return StationArt(drag.x, drag.y - 70, st, false);
}

function Play() {
  const out: any[] = [];
  for (const e of Header(rg.t("Täytä pomon laatikot", "Fill the boss's crates", "Llena las cajas del jefe"), () => sayOrder(), () => giveHint())) out.push(e);
  for (const e of LineView()) out.push(e);
  for (const e of Goal()) out.push(e);
  if (K.t - hintT < 6 && hint && hint.slot >= 0 && sel !== hint.slot) out.push(PointAt(slotX(hint.slot), TY - 2, "#f77f00"));
  for (const e of RuleStrip(396)) out.push(e);
  for (const e of Panel(PANEL_Y)) out.push(e);
  for (const e of Tray()) out.push(e);
  for (const e of DragGhost()) out.push(e);
  return <div className="screen">{out}</div>;
}

// the boss gives the order on a screen of his own
function OrderScreen() {
  const out: any[] = [];
  for (const e of Header(rg.t("Pomo kertoo", "The boss says", "El jefe dice"), () => sayOrder(), null)) out.push(e);
  out.push(<div style={{ position: "absolute", left: 0, top: 112, width, height: height - 112, backgroundColor: "#e6eeeb" }} />);
  out.push(Circle(width * 0.3, 420, 150, "#d3e6df"));
  out.push(Box(0, 420, width, height - 420, "#d3e6df", 0));
  const talk = Math.sin(K.t * 9) > 0 && K.t % 3 < 2;
  for (const e of Boss(84, 330, 1.7, talk ? "happy" : "ok")) out.push(e);
  out.push(<div className="bubble" style={{ left: 150, top: 150, width: width - 164, height: 196 }} />);
  out.push(Poly([[152, 270], [128, 290], [152, 296]], "#ffffff"));
  const ex = examples();
  ex.forEach((e, i) => {
    const x = 188 + (i % 2) * 86 + (ex.length === 1 ? 43 : 0), y = 196 + Math.floor(i / 2) * 76;
    for (const el of ThingArt(e.it, x, y, e.it.kind === "kurpitsa" ? 0.6 : 1.25, false)) out.push(el);
    for (const el of e.ok ? Tick(x + 26, y + 20, 10) : Cross(x + 26, y + 20, 9)) out.push(el);
  });
  // three crates to fill
  for (let i = 0; i < STARS; i++) for (const e of Crate(176 + i * 60, 500, [], order.dest === "kauppa" ? "🛒" : "🧃")) out.push(e);
  for (let i = 0; i < STARS; i++) out.push(<div className="emoji" style={{ left: 162 + i * 60, top: 484, width: 28, height: 28, fontSize: 20 }}>⭐</div>);
  out.push(<div className="pad" id="ok" onClick={() => { phase = "line"; rg.sound("click"); if (slots.every((s) => !s)) rg.say("ol_k_raahaa"); }} style={{ left: 50, top: height - 130, width: width - 100, height: 68, backgroundColor: "#06d6a0" }}><div className="padtext">{"👍 " + rg.t("Selvä!", "Got it!", "¡Vale!")}</div></div>);
  return <div className="screen">{out}</div>;
}

// ---- the start: the line runs by itself while its parts are explained -----------------------

const INTRO = [
  { t: 0, say: "ol_i1", x: () => 34, y: BY - 34, text: rg.t("Omenat tulevat hihnaa pitkin.", "Apples come along the belt.", "Las manzanas llegan por la cinta.") },
  { t: 4.5, say: "ol_i2", x: () => slotX(0), y: TY - 2, text: rg.t("Mittari katsoo jokaisen omenan.", "A machine looks at every apple.", "Una máquina mira cada manzana.") },
  { t: 9.5, say: "ol_i3", x: () => 100, y: LY - 6, text: rg.t("Väärät putoavat luukusta pois.", "The wrong ones drop through the hatch.", "Las que no valen caen por la trampilla.") },
  { t: 14, say: "ol_i4", x: () => SX(), y: BY - 90, text: rg.t("Leikkuri pilkkoo, ja laatikko täyttyy.", "The slicer cuts, and the crate fills.", "La cortadora corta y la caja se llena.") },
  { t: 19, say: "ol_i5", x: () => width / 2, y: height - 150, text: rg.t("Sinä päätät, mitä mittarit päästävät läpi!", "You decide what the machines let through!", "¡Tú decides qué dejan pasar las máquinas!") },
];

function startDemo() {
  demo = true; introT = 0; introSaid = -1; speed = 60; slow = false; queue = demoBatch();
  clearLine();
  const st = station("vari"); st.v = "punainen";
  slots = [st, null, null]; sel = -1;
}

function firstOpen(): number { for (let i = 0; i < LEVELS.length; i++) if (!cleared[i]) return i; return 0; }

function Intro() {
  if (!demo) startDemo();
  const out: any[] = [];
  out.push(<div className="titlebox" style={{ left: 0, top: 18, width }}><div className="title">{rg.t("Omenalinjasto", "Apple line", "Línea de manzanas")}</div></div>);
  out.push(<div className="hintbtn" id="exit" onClick={() => rg.exit()} style={{ left: 10, top: 14 }}>←</div>);
  for (const e of LineView()) out.push(e);
  let k = 0;
  for (let i = 0; i < INTRO.length; i++) if (introT >= INTRO[i].t) k = i;
  const seg = INTRO[k];
  if (introSaid !== k) { introSaid = k; rg.say(seg.say); }
  out.push(<div className="bubble" style={{ left: 12, top: 116, width: width - 24, height: 46 }}><div className="ctext">{seg.text}</div></div>);
  for (const e of RuleStrip(410)) out.push(e);
  const open = firstOpen();
  out.push(<div className="pad" id="start" onClick={() => start(open)} style={{ left: 40, top: height - 150, width: width - 80, height: 64, backgroundColor: "#06d6a0" }}><div className="padtext">{"▶ " + rg.t("Aloita", "Start", "Empezar")}</div></div>);
  const n = LEVELS.length, dw = 56, x0 = width / 2 - (n * dw) / 2;
  for (let i = 0; i < n; i++) {
    const can = i <= open || cleared[i] || (i > 0 && cleared[i - 1]);
    out.push(<div className="pad" id={"lv" + i} onClick={() => { if (can) start(i); }} style={{ left: x0 + i * dw + 4, top: height - 74, width: dw - 8, height: 46, backgroundColor: cleared[i] ? "#06d6a0" : i === open ? "#3a86ff" : "#c6dcf2" }}><div className="lvicon">{LEVEL_ICON[i]}</div></div>);
  }
  out.push(PointAt(seg.x(), seg.y, "#f77f00"));
  return <div className="screen">{out}</div>;
}

setup(rg.t("Omenalinjasto", "Apple line", "Línea de manzanas"), LEVELS, 3, next);

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode === "done" && !doneMarked) { doneMarked = true; cleared[K.level] = 1; rg.save("cleared", cleared); }
  if (K.mode !== "menu" && demo) demo = false;
  if (canEdit()) dragStep(input); else drag.on = false;
  sim(dt);
}

function view() {
  let body;
  if (K.mode === "menu") body = Intro();
  else if (K.mode === "done") body = Done();
  else body = phase === "order" ? OrderScreen() : Play();
  return <div className="root">{body}{Sparks()}</div>;
}
