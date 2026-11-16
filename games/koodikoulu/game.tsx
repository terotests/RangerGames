// Koodikoulu: the four words of programming for 7–9-year-olds. "Muistipaikka,
// operaattori, tietorakenne ja funktio: kun osaat nämä neljä, voit tehdä
// melkein mitä tahansa." Each level is one word, and each round brings in its
// kinds one at a time. The child always builds something and runs it (▶), and
// the robot does exactly what the program says, step by step:
//   1 Muistipaikka   boxes with a name hold a number, a word, or yes/no; the
//                    robot bakes the cake the boxes say (it remembers nothing itself)
//   2 Operaattori    a machine makes one value out of two: + - × for numbers,
//                    + glues words, > < = light a lamp, ja / tai open a door
//   3 Tietorakenne   a layered smoothie through a list (by number), a queue
//                    (first in, first out), a stack (last in, first out), and
//                    a lokerikko (drawers found by name)
//   4 Funktio        one recipe, many calls: a number machine, a yes/no
//                    machine, a two-step machine
//   5 Kaikki yhdessä a little program with a list, a counter (memory slot),
//                    an operator and a function, run line by line and then
//                    tested with a second basket
// Code is shown as text under the pictures, so the words and the code meet.
// The rules (and their test, tests/koodikoulu.ts) are in lib/logic.ts.
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Circle, Box, PointAt, Robot } from "lib/kit";
import { Val, Cake, CakeTask, OpTask, DsTask, FnTask, AllTask, Body, Prog, ANIMALS, FRUITS, WORDS, cakeTask, bake, cakeWrong, opTask, opResult, opMax, apply, dsTask, dsOk, wantOf, fnTask, fnRun, fnOk, fnName, allTask, allGoal, ALKU, OPS5, NS, LISA } from "lib/logic";

const C = { luku: "#3a86ff", teksti: "#06a77d", kylla: "#f77f00", rakenne: "#8338ec", funktio: "#ef476f", ink: "#1d3557" };
const TOP = 118;
function L(fi: string, en: string, es: string) { return rg.t(fi, en, es); }

// ---- small drawing helpers ---------------------------------------------------------------
function Tx(x: number, y: number, w: number, h: number, text: string, size: number, color?: string, left?: boolean) {
  return <div className={left ? "txl" : "tx"} style={{ left: x, top: y, width: w, height: h, fontSize: size, color: color || C.ink }}>{text}</div>;
}
function Em(x: number, y: number, e: string, size: number) {
  return <div className="emoji" style={{ left: x - size, top: y - size * 0.75, width: size * 2, height: size * 1.5, fontSize: size }}>{e}</div>;
}
function Hit(id: string, x: number, y: number, w: number, h: number, f: () => void) {
  return <div className="hit" id={id} onClick={() => f()} style={{ left: x, top: y, width: w, height: h }} />;
}
function Frame(x: number, y: number, w: number, h: number, bg: string, edge: string, r: number, bw?: number) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, backgroundColor: bg, borderRadius: r, borderWidth: bw || 3, borderColor: edge, borderStyle: "solid" }} />;
}
function Pad(id: string, x: number, y: number, w: number, h: number, label: string, color: string, f: () => void, size?: number) {
  return [
    <div className="pad" style={{ left: x, top: y, width: w, height: h, backgroundColor: color }} />,
    Tx(x, y, w, h, label, size || 24, "#ffffff"),
    Hit(id, x, y, w, h, f),
  ];
}
// a memory slot: a name tag on top, the type under the name, the value inside
function MemBox(x: number, y: number, w: number, h: number, name: string, type: string, color: string, state: string) {
  const bg = state === "bad" ? "#ffd6dc" : state === "hot" ? "#fff3b0" : state === "ok" ? "#d8f8e8" : "#ffffff";
  return [
    Frame(x, y + 16, w, h - 16, bg, state === "bad" ? "#d62828" : color, 12, 3),
    <div style={{ position: "absolute", left: x + 8, top: y, width: w - 16, height: 26, borderRadius: 13, backgroundColor: color }} />,
    Tx(x + 8, y, w - 16, 26, name, name.length > 10 ? 13 : 15, "#ffffff"),
    Tx(x, y + h - 20, w, 16, type, 11, color),
  ];
}
// a dark code strip with one line of text per entry
function Code(lines: string[], y: number, hot?: number) {
  const out: any[] = [Box(10, y, width - 20, lines.length * 20 + 12, "#1d3557", 10)];
  lines.forEach((l, i) => {
    if (hot === i) out.push(Box(14, y + 5 + i * 20, width - 28, 20, "#2f5d8a", 6));
    out.push(Tx(20, y + 6 + i * 20, width - 40, 20, l, 14, "#caf0f8", true));
  });
  return out;
}
function codeH(n: number) { return n * 20 + 12; }
function show(v: Val): string {
  if (v === null) return "?";
  if (typeof v === "boolean") return v ? L("kyllä", "yes", "sí") : L("ei", "no", "no");
  if (typeof v === "string") return '"' + v + '"';
  return String(v);
}
function Dots(x: number, y: number, w: number, n: number, color: string) {
  const out: any[] = [];
  if (n < 0 || n > 40) return out;
  const per = 8, r = Math.min(6, w / per / 2 - 1);
  for (let i = 0; i < n; i++) out.push(Circle(x + (i % per) * (r * 2 + 2) + r + (w - per * (r * 2 + 2)) / 2, y + Math.floor(i / per) * (r * 2 + 2) + r, r, color));
  return out;
}
function Lamp(x: number, y: number, r: number, on: boolean) {
  const out: any[] = [];
  if (on) out.push(Circle(x, y, r * 1.5, "rgba(255,209,102,0.45)"));
  out.push(Circle(x, y, r, on ? "#ffd166" : "#adb5bd", on ? "#e09f3e" : "#6c757d"));
  out.push(Box(x - r * 0.45, y + r * 0.8, r * 0.9, r * 0.6, "#6c757d", 3));
  return out;
}
function Door(x: number, y: number, w: number, h: number, open: boolean) {
  const out: any[] = [Box(x - 4, y - 4, w + 8, h + 4, "#6d4c41", 6)];
  out.push(Box(x, y, w, h, open ? "#fff3b0" : "#3e2723", 3));
  if (open) out.push(Poly([[x, y], [x + w * 0.3, y + h * 0.08], [x + w * 0.3, y + h * 0.92], [x, y + h]], "#a1887f"));
  else { out.push(Box(x + 3, y + 3, w - 6, h - 3, "#a1887f", 3)); out.push(Circle(x + w - 10, y + h / 2, 3, "#ffd166")); }
  return out;
}

// ---- flying tokens and the step-by-step runner -------------------------------------------------
type Fly = { x0: number; y0: number; x1: number; y1: number; t0: number; d: number; draw: (x: number, y: number) => any[] };
let flies: Fly[] = [];
function fly(x0: number, y0: number, x1: number, y1: number, d: number, draw: (x: number, y: number) => any[]) {
  flies.push({ x0, y0, x1, y1, t0: K.t, d, draw });
}
function Flies() {
  const out: any[] = [];
  for (const f of flies) {
    const k = Math.min(1, (K.t - f.t0) / f.d), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const arc = Math.sin(k * Math.PI) * 30;
    for (const n of f.draw(f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e - arc)) out.push(n);
  }
  return out;
}
let seq: (() => number)[] = [];
let seqT = 0;
let running = false;
function runSeq(steps: (() => number)[]) { seq = steps; seqT = 0.15; running = true; rg.sound("jump"); }
function stopRun() { seq = []; running = false; flies = []; }

let hintT = -10;
let mood = "ok";
let introSaid = false;
function hinted() { return K.t - hintT < 6; }
function failed(say: string[]) {
  mood = "dizzy";
  const n = miss();
  if (n >= 2) { hintT = K.t; rg.say(say.concat([HINT[K.level]])); } else rg.say(say);
}
const HINT = ["kk_m_vihje", "kk_o_vihje", "kk_d_vihje", "kk_f_vihje", "kk_k_vihje"];

// ======================================================================================
// 1 Muistipaikka: the cake
// ======================================================================================
let ct: CakeTask;
let cv: Cake = { candles: 0, name: -1, icing: false };
let made: Cake | null = null;
let madeSet: string[] = [];
let cwrong: string[] = [];
let chot = "";
let changed: any = {};
const BOXNAME: any = { kynttilat: () => L("kynttilät", "candles", "velas"), nimi: () => L("nimi", "name", "nombre"), kuorrute: () => L("kuorrute", "icing", "glaseado") };
const BOXTYPE: any = { kynttilat: () => L("luku", "number", "número"), nimi: () => L("teksti", "text", "texto"), kuorrute: () => L("kyllä / ei", "yes / no", "sí / no") };
const BOXC: any = { kynttilat: C.luku, nimi: C.teksti, kuorrute: C.kylla };

function cakeNext() {
  ct = cakeTask(() => rg.random(), K.question, step());
  cv = { candles: 0, name: -1, icing: false };
  made = null; madeSet = []; cwrong = []; chot = ""; changed = {};
  const q = K.question;
  rg.say(q === 0 ? ["kk_l1", "kk_m_luku"] : q === 2 ? ["kk_m_teksti"] : q === 4 ? ["kk_m_kylla"] : ["kk_m_taas"]);
}
function cakeEdit(k: string, f: () => void) {
  if (running || K.solved >= 0) return;
  made = null; madeSet = []; cwrong = []; mood = "ok";
  f();
  changed[k] = K.t;
  rg.sound("click"); rg.vibrate(10);
}
function cbY() { return height - 82 - codeH(ct.boxes.length) - 12 - 112; }
function cbX(i: number) { const n = ct.boxes.length, w = 104, gap = 10; return Math.floor((width - n * w - (n - 1) * gap) / 2) + i * (w + gap); }
function cakeXY() { return { x: width / 2 + 60, y: Math.min(cbY() - 40, 400) }; }

function cakeRun() {
  if (running || K.solved >= 0) return;
  made = { candles: 0, name: -1, icing: false }; madeSet = []; cwrong = []; mood = "ok";
  const steps: (() => number)[] = [];
  ct.boxes.forEach((k, i) => {
    steps.push(() => {
      chot = k;
      const p = cakeXY();
      const label = k === "kynttilat" ? String(cv.candles) : k === "nimi" ? (cv.name >= 0 ? ANIMALS[cv.name].w : '""') : show(cv.icing);
      fly(cbX(i) + 52, cbY() + 60, p.x, p.y - 20, 0.55, (x, y) => [Box(x - 34, y - 14, 68, 28, BOXC[k], 14), Tx(x - 34, y - 14, 68, 28, label, 15, "#ffffff")]);
      rg.say(k === "kynttilat" ? "kk_m_lue_kynttilat" : k === "nimi" ? "kk_m_lue_nimi" : "kk_m_lue_kuorrute");
      return 0.6;
    });
    steps.push(() => {
      flies = [];
      const b = bake(ct, cv);
      if (made) { if (k === "kynttilat") made.candles = b.candles; if (k === "nimi") made.name = b.name; if (k === "kuorrute") made.icing = b.icing; }
      madeSet.push(k);
      rg.sound("pop");
      return 0.7;
    });
  });
  steps.push(() => {
    chot = "";
    cwrong = cakeWrong(ct, cv);
    const p = cakeXY();
    if (!cwrong.length) { mood = "happy"; win(p.x, p.y - 30, ["kk_m_valmis"]); }
    else failed(["kk_m_vaara_" + cwrong[0]]);
    return 0;
  });
  runSeq(steps);
}

function CakeArt(x: number, y: number, s: number, c: Cake, showCandles: boolean, nameOn: boolean) {
  const out: any[] = [];
  const w = 120 * s, h = 54 * s;
  out.push(Box(x - w / 2 - 14 * s, y + h / 2 - 4 * s, w + 28 * s, 10 * s, "#ced4da", 5 * s));
  out.push(Box(x - w / 2, y - h / 2, w, h, "#d4a373", 10 * s));
  out.push(Box(x - w / 2, y + h * 0.05, w, 7 * s, "#e76f51", 3 * s));
  if (c.icing) {
    out.push(Box(x - w / 2 - 2 * s, y - h / 2 - 4 * s, w + 4 * s, 16 * s, "#fff0f6", 8 * s));
    for (let i = 0; i < 6; i++) out.push(Circle(x - w / 2 + 8 * s + i * (w - 16 * s) / 5, y - h / 2 + 12 * s, 5 * s, "#fff0f6"));
  }
  if (nameOn && c.name >= 0) out.push(Tx(x - w / 2, y + h * 0.12, w, h * 0.42, ANIMALS[c.name].w, Math.max(10, 15 * s), "#7f2704"));
  if (showCandles && c.candles > 0) {
    const n = Math.min(c.candles, 15), rows = n > 8 ? 2 : 1, per = Math.ceil(n / rows);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / per), col = i % per, cnt = row === rows - 1 ? n - per * (rows - 1) : per;
      const cx = x - (cnt - 1) * 12 * s / 2 + col * 12 * s, top = y - h / 2 - 22 * s - row * 9 * s + (rows > 1 && row === 0 ? 9 * s : 0);
      out.push(Box(cx - 2.5 * s, top, 5 * s, 20 * s, ["#4cc9f0", "#f72585", "#80ed99"][i % 3], 2 * s));
      out.push(Circle(cx, top - 4 * s, 3.6 * s, Math.sin(K.t * 9 + i) > 0 ? "#ffb703" : "#fb8500"));
    }
  }
  return out;
}

function CakePlay() {
  const out: any[] = [];
  for (const e of Header(L("Leivo tilauksen kakku", "Bake the ordered cake", "Hornea la tarta pedida"), () => cakeNext2(), () => hint())) out.push(e);
  // the order: the customer and a bubble with the cake they want
  const a = ANIMALS[ct.customer];
  out.push(Em(46, 170, a.e, 34));
  out.push(Tx(6, 200, 80, 22, a.w, 15, C.ink));
  out.push(Box(92, 122, width - 106, 132, "#ffffff", 18));
  out.push(Poly([[92, 170], [78, 182], [92, 190]], "#ffffff"));
  out.push(Tx(100, 126, 120, 18, L("Tilaus", "Order", "Pedido"), 13, "#6c757d", true));
  const big = step() >= 2;
  for (const e of CakeArt(92 + (width - 106) / 2 + (big ? -26 : 0), 202, 0.78, ct.order, !big, true)) out.push(e);
  if (big) { out.push(Em(width - 62, 170, "🕯️", 16)); out.push(Tx(width - 92, 186, 70, 34, ct.order.candles + " " + L("v.", "yrs", "años"), 22, C.ink)); }
  // the robot and the cake it makes
  const p = cakeXY();
  for (const e of Robot(68, p.y - 10, 0.62, "#4895ef", running ? 1 : -1, mood)) out.push(e);
  if (made) for (const e of CakeArt(p.x, p.y, 1, made, madeSet.indexOf("kynttilat") >= 0, true)) out.push(e);
  else { out.push(Box(p.x - 74, p.y + 23, 148, 10, "#ced4da", 5)); out.push(Tx(p.x - 80, p.y - 20, 160, 30, L("robotti lukee muistia", "the robot reads memory", "el robot lee la memoria"), 13, "#6c757d")); }
  // the memory slots
  const y = cbY();
  ct.boxes.forEach((k, i) => {
    const x = cbX(i), w = 104;
    const st = chot === k ? "hot" : cwrong.indexOf(k) >= 0 ? "bad" : K.solved >= 0 ? "ok" : "";
    for (const e of MemBox(x, y, w, 112, BOXNAME[k](), BOXTYPE[k](), BOXC[k], st)) out.push(e);
    const fresh = K.t - (changed[k] || -10) < 0.35;
    const sz = fresh ? 1.2 : 1;
    if (k === "kynttilat") {
      out.push(Tx(x, y + 26, w, 40, String(cv.candles), 34 * sz, C.luku));
      for (const e of Pad("kmin", x + 6, y + 64, 40, 30, "-", C.luku, () => cakeEdit(k, () => { cv.candles = Math.max(0, cv.candles - 1); }))) out.push(e);
      for (const e of Pad("kplus", x + w - 46, y + 64, 40, 30, "+", C.luku, () => cakeEdit(k, () => { cv.candles = Math.min(15, cv.candles + 1); }))) out.push(e);
    } else if (k === "nimi") {
      out.push(Tx(x, y + 30, w, 36, cv.name >= 0 ? '"' + ANIMALS[cv.name].w + '"' : '""', 19 * sz, C.teksti));
      out.push(Tx(x, y + 66, w, 24, L("napauta ↻", "tap ↻", "toca ↻"), 12, "#6c757d"));
      out.push(Hit("knimi", x, y, w, 112, () => cakeEdit(k, () => { cv.name = (cv.name + 2) % (ANIMALS.length + 1) - 1; if (cv.name >= 0) rg.say("kk_nimi_" + ANIMALS[cv.name].id); })));
    } else {
      out.push(Tx(x, y + 28, w, 40, (cv.icing ? "✔ " : "✖ ") + show(cv.icing), 22 * sz, cv.icing ? "#2d6a4f" : "#d62828"));
      out.push(Tx(x, y + 66, w, 24, L("napauta ↻", "tap ↻", "toca ↻"), 12, "#6c757d"));
      out.push(Hit("kkuor", x, y, w, 112, () => cakeEdit(k, () => { cv.icing = !cv.icing; rg.say(cv.icing ? "kk_kylla" : "kk_ei"); })));
    }
  });
  if (hinted() && K.solved < 0) {
    const wr = cakeWrong(ct, cv);
    if (wr.length) out.push(PointAt(cbX(ct.boxes.indexOf(wr[0])) + 52, y, "#f77f00"));
  }
  // the code
  const lines = ct.boxes.map((k) => BOXNAME[k]() + " = " + (k === "kynttilat" ? String(cv.candles) : k === "nimi" ? (cv.name >= 0 ? '"' + ANIMALS[cv.name].w + '"' : '""') : show(cv.icing)));
  for (const e of Code(lines, height - 82 - codeH(lines.length) - 6, ct.boxes.indexOf(chot))) out.push(e);
  return out;
}
function cakeNext2() { rg.say(["kk_l1"]); }

// ======================================================================================
// 2 Operaattori: the machine with two inputs
// ======================================================================================
let ot: OpTask;
let oop = "";
let oa: Val = 0, ob: Val = 0;
let oout: Val | undefined = undefined;
let ostate = "";
let oshake = -10;
const OPSAY: any = { "+": "kk_op_plus", "-": "kk_op_miinus", "×": "kk_op_kertaa", ">": "kk_op_suurempi", "<": "kk_op_pienempi", "=": "kk_op_yhta", ja: "kk_op_ja", tai: "kk_op_tai" };

function opNext() {
  ot = opTask(() => rg.random(), K.question, step());
  oop = ot.op; oa = ot.a; ob = ot.b; oout = undefined; ostate = "";
  opSay();
}
function opSay() {
  const k = ot.kind;
  const intro = K.question === 0 ? ["kk_l2"] : [];
  if (k === "valitse") rg.say(intro.concat(["kk_o_valitse"]));
  else if (k === "aseta") rg.say(["kk_o_aseta"]);
  else if (k === "sanat") rg.say(["kk_o_sanat", "kk_s_" + WORDS[ot.word].id]);
  else if (k === "vertaa") rg.say(["kk_o_vertaa", ot.goal ? "kk_o_sytyta" : "kk_o_sammuta"]);
  else if (k === "vertaaA") rg.say(["kk_o_vertaa_a"]);
  else rg.say(["kk_o_logiikka", ot.goal ? "kk_o_auki" : "kk_o_kiinni"]);
}
function opEdit(f: () => void) {
  if (running || K.solved >= 0) return;
  oout = undefined; ostate = ""; mood = "ok";
  f();
  rg.sound("click"); rg.vibrate(10);
}
// places: the two inputs, the machine, the output, the goal
const OA = { x: 16, y: 128, w: 140, h: 104 };
function OB() { return { x: width - 156, y: 128, w: 140, h: 104 }; }
function OM() { return { x: width / 2 - 90, y: 262, w: 180, h: 84 }; }
function OO() { return { x: width / 2 - 100, y: 376, w: 120, h: 96 }; }
function OG() { return { x: width - 112, y: 376, w: 98, h: 96 }; }
function palY() { return height - 82 - codeH(1) - 12 - 66; }

function opRun() {
  if (running || K.solved >= 0) return;
  if (!oop || (ot.kind === "sanat" && (oa === "" || ob === ""))) { rg.sound("wrong"); rg.say("kk_kesken"); return; }
  oout = undefined; ostate = ""; mood = "ok";
  const m = OM(), b = OB();
  const tok = (v: Val, color: string) => (x: number, y: number) => [Box(x - 40, y - 15, 80, 30, color, 15), Tx(x - 40, y - 15, 80, 30, typeof v === "boolean" ? (v ? "🔑" : "–") : String(v), 15, "#ffffff")];
  runSeq([
    () => { fly(OA.x + 70, OA.y + 60, m.x + 50, m.y + 10, 0.5, tok(oa, typeof oa === "string" ? C.teksti : typeof oa === "boolean" ? C.kylla : C.luku)); rg.sound("tick"); return 0.5; },
    () => { fly(b.x + 70, b.y + 60, m.x + m.w - 50, m.y + 10, 0.5, tok(ob, typeof ob === "string" ? C.teksti : typeof ob === "boolean" ? C.kylla : C.luku)); rg.sound("tick"); return 0.55; },
    () => { flies = []; oshake = K.t; rg.sound("hit", { pitch: 1.4 }); rg.say(OPSAY[oop]); return 0.7; },
    () => {
      oout = opResult(ot, oop, oa, ob);
      rg.sound("pop");
      const o = OO();
      if (oout === null) { ostate = "err"; failed(["kk_o_ei_voi"]); }
      else if (oout === ot.goal) { ostate = "ok"; mood = "happy"; win(o.x + o.w / 2, o.y + 40, typeof ot.goal === "boolean" ? [] : []); }
      else { ostate = "bad"; failed(["kk_o_vaara"]); }
      return 0;
    },
  ]);
}

function ValView(x: number, y: number, w: number, h: number, v: Val, role: string) {
  const out: any[] = [];
  if (typeof v === "number") {
    out.push(Tx(x, y, w, 40, String(v), 32, C.luku));
    for (const e of Dots(x + 6, y + 42, w - 12, v, "#8ecae6")) out.push(e);
  } else if (typeof v === "string") {
    out.push(Tx(x, y + 6, w, 40, v === "" ? "?" : '"' + v + '"', v.length > 8 ? 15 : 20, C.teksti));
  } else if (typeof v === "boolean") {
    if (role === "key") { out.push(Em(x + w / 2, y + 26, v ? "🔑" : "✖", 22)); out.push(Tx(x, y + 48, w, 18, show(v), 14, C.kylla)); }
    else if (role === "door") { for (const e of Door(x + w / 2 - 18, y + 4, 36, 50, v)) out.push(e); out.push(Tx(x, y + 56, w, 18, v ? L("auki", "open", "abierta") : L("kiinni", "shut", "cerrada"), 14, C.kylla)); }
    else { for (const e of Lamp(x + w / 2, y + 26, 17, v)) out.push(e); out.push(Tx(x, y + 52, w, 18, show(v), 14, C.kylla)); }
  }
  return out;
}

function OpPlay() {
  const out: any[] = [];
  const k = ot.kind;
  const head = k === "valitse" ? L("Valitse operaattori", "Choose the operator", "Elige el operador")
    : k === "aseta" ? L("Aseta B niin, että tulee tavoite", "Set B to get the goal", "Pon B para lograr el objetivo")
    : k === "sanat" ? L("Tee sana kuvasta", "Make the word in the picture", "Forma la palabra del dibujo")
    : k === "vertaa" ? (ot.goal ? L("Sytytä lamppu", "Light the lamp", "Enciende la lámpara") : L("Lamppu pysyy pimeänä", "Keep the lamp dark", "Deja la lámpara apagada"))
    : k === "vertaaA" ? L("Muuta A:ta, sytytä lamppu", "Change A, light the lamp", "Cambia A, enciende la lámpara")
    : (ot.goal ? L("Saa ovi auki", "Open the door", "Abre la puerta") : L("Pidä ovi kiinni", "Keep the door shut", "Deja la puerta cerrada"));
  for (const e of Header(head, () => opSay(), () => hint())) out.push(e);
  const b = OB(), m = OM(), o = OO(), g = OG();
  const typeName = (v: Val) => typeof v === "number" ? L("luku", "number", "número") : typeof v === "string" ? L("teksti", "text", "texto") : L("kyllä / ei", "yes / no", "sí / no");
  const typeCol = (v: Val) => typeof v === "number" ? C.luku : typeof v === "string" ? C.teksti : C.kylla;
  const role = k === "logiikka" ? "key" : "";
  const nameA = k === "logiikka" ? L("avain1", "key1", "llave1") : "A", nameB = k === "logiikka" ? L("avain2", "key2", "llave2") : "B";
  // funnels from the inputs into the machine
  out.push(Poly([[OA.x + 40, OA.y + OA.h], [OA.x + 100, OA.y + OA.h], [m.x + 70, m.y + 4], [m.x + 30, m.y + 4]], "#bde0fe"));
  out.push(Poly([[b.x + 40, b.y + b.h], [b.x + 100, b.y + b.h], [m.x + m.w - 30, m.y + 4], [m.x + m.w - 70, m.y + 4]], "#bde0fe"));
  out.push(Poly([[m.x + m.w / 2 - 22, m.y + m.h - 4], [m.x + m.w / 2 + 22, m.y + m.h - 4], [o.x + o.w / 2 + 26, o.y + 18], [o.x + o.w / 2 - 26, o.y + 18]], "#bde0fe"));
  for (const e of MemBox(OA.x, OA.y, OA.w, OA.h, nameA, typeName(ot.a), typeCol(ot.a), "")) out.push(e);
  for (const e of MemBox(b.x, b.y, b.w, b.h, nameB, typeName(ot.b), typeCol(ot.b), "")) out.push(e);
  for (const e of ValView(OA.x, OA.y + 22, OA.w, 60, oa, role)) out.push(e);
  for (const e of ValView(b.x, b.y + 22, b.w, 60, ob, role)) out.push(e);
  if (k === "sanat") {
    if (oa !== "") out.push(Hit("wa", OA.x, OA.y, OA.w, OA.h, () => opEdit(() => { oa = ""; })));
    if (ob !== "") out.push(Hit("wb", b.x, b.y, b.w, b.h, () => opEdit(() => { ob = ""; })));
  }
  const max = opMax(ot, step());
  if (k === "aseta") {
    for (const e of Pad("bmin", b.x + b.w - 40, b.y + 26, 34, 30, "-", C.luku, () => opEdit(() => { ob = Math.max(0, (ob as number) - 1); }), 20)) out.push(e);
    for (const e of Pad("bplus", b.x + b.w - 40, b.y + 60, 34, 30, "+", C.luku, () => opEdit(() => { ob = Math.min(max, (ob as number) + 1); }), 20)) out.push(e);
  }
  if (k === "vertaaA") {
    for (const e of Pad("amin", OA.x + OA.w - 40, OA.y + 26, 34, 30, "-", C.luku, () => opEdit(() => { oa = Math.max(0, (oa as number) - 1); }), 20)) out.push(e);
    for (const e of Pad("aplus", OA.x + OA.w - 40, OA.y + 60, 34, 30, "+", C.luku, () => opEdit(() => { oa = Math.min(max, (oa as number) + 1); }), 20)) out.push(e);
  }
  // the machine and its operator window
  const sh = K.t - oshake < 0.6 ? Math.sin(K.t * 60) * 3 : 0;
  out.push(Box(m.x + sh, m.y, m.w, m.h, "#355070", 16));
  out.push(Box(m.x + 10 + sh, m.y + m.h - 14, m.w - 20, 6, "#6d597a", 3));
  out.push(Circle(m.x + m.w / 2 + sh, m.y + m.h / 2 - 4, 30, ostate === "err" ? "#ff8fa3" : "#ffffff", "#ffd166"));
  out.push(Tx(m.x + m.w / 2 - 30 + sh, m.y + m.h / 2 - 34, 60, 60, oop || "?", oop.length > 1 ? 20 : 34, C.ink));
  out.push(Tx(m.x + 6 + sh, m.y + 6, 50, 16, L("kone", "machine", "máquina"), 11, "#cdb4db", true));
  if (ostate === "err") out.push(Em(m.x + m.w - 20, m.y - 6, "💨", 18));
  // the output and the goal
  const outV = oout === undefined ? null : oout;
  for (const e of MemBox(o.x, o.y, o.w, o.h, L("tulos", "result", "resultado"), typeName(ot.goal), typeCol(ot.goal), ostate === "bad" || ostate === "err" ? "bad" : ostate === "ok" ? "ok" : "")) out.push(e);
  if (outV !== null) for (const e of ValView(o.x, o.y + 22, o.w, 60, outV, k === "logiikka" ? "door" : "")) out.push(e);
  else out.push(Tx(o.x, o.y + 30, o.w, 36, oout === null && ostate === "err" ? "✖" : "…", 26, "#adb5bd"));
  out.push(Frame(g.x, g.y + 16, g.w, g.h - 16, "#fffbe6", "#ffb703", 12, 3));
  out.push(Tx(g.x, g.y, g.w, 22, "🎯 " + L("tavoite", "goal", "objetivo"), 13, "#b5540a"));
  if (k === "sanat") out.push(Em(g.x + g.w / 2, g.y + 52, WORDS[ot.word].e, 26));
  else for (const e of ValView(g.x, g.y + 22, g.w, 60, ot.goal, k === "logiikka" ? "door" : "")) out.push(e);
  // the palette (or the word cards)
  const py = palY();
  if (k === "sanat") {
    const n = ot.words.length, w = Math.floor((width - 28 - (n - 1) * 8) / n);
    ot.words.forEach((wd, i) => {
      const x = 14 + i * (w + 8), used = oa === wd || ob === wd;
      out.push(<div className={used ? "card off" : "card"} style={{ left: x, top: py, width: w, height: 58 }} />);
      out.push(Tx(x, py, w, 58, wd, wd.length > 7 ? 15 : 18, C.teksti));
      if (!used) out.push(Hit("w" + i, x, py, w, 58, () => opEdit(() => { if (oa === "") oa = wd; else if (ob === "") ob = wd; })));
    });
  } else if (ot.palette.length > 1 || k === "valitse" || k === "vertaa" || k === "logiikka") {
    const n = ot.palette.length, w = Math.min(84, Math.floor((width - 28 - (n - 1) * 10) / n));
    const x0 = Math.floor((width - n * w - (n - 1) * 10) / 2);
    ot.palette.forEach((op, i) => {
      const x = x0 + i * (w + 10);
      for (const e of Pad("op" + i, x, py, w, 58, op, oop === op ? "#ffb703" : "#355070", () => opEdit(() => { oop = op; rg.say(OPSAY[op]); }), op.length > 1 ? 20 : 30)) out.push(e);
    });
  } else out.push(Tx(14, py, width - 28, 58, L("Operaattori on valmiina: ", "The operator is ready: ", "El operador está listo: ") + oop, 16, "#6c757d"));
  if (hinted() && K.solved < 0) {
    const okOps = ot.palette.filter((op) => opResult(ot, op, oa, ob) === ot.goal);
    if ((k === "valitse" || k === "vertaa" || k === "logiikka") && okOps.length) {
      const n = ot.palette.length, w = Math.min(84, Math.floor((width - 28 - (n - 1) * 10) / n)), x0 = Math.floor((width - n * w - (n - 1) * 10) / 2);
      out.push(PointAt(x0 + ot.palette.indexOf(okOps[0]) * (w + 10) + w / 2, py, "#f77f00"));
    } else if (k === "sanat") {
      const need = oa === "" ? WORDS[ot.word].a : WORDS[ot.word].b;
      const n = ot.words.length, w = Math.floor((width - 28 - (n - 1) * 8) / n);
      out.push(PointAt(14 + ot.words.indexOf(need) * (w + 8) + w / 2, py, "#f77f00"));
    } else if (k === "aseta" || k === "vertaaA") {
      out.push(PointAt((k === "aseta" ? b.x : OA.x) + 120, (k === "aseta" ? b.y : OA.y) + 24, "#f77f00"));
    }
  }
  // the code
  const lhs = k === "logiikka" ? L("ovi", "door", "puerta") : k === "vertaa" || k === "vertaaA" ? L("lamppu", "lamp", "lámpara") : k === "sanat" ? L("sana", "word", "palabra") : L("tulos", "result", "resultado");
  const sa = k === "logiikka" ? nameA : typeof oa === "string" ? (oa === "" ? "?" : '"' + oa + '"') : String(oa);
  const sb = k === "logiikka" ? nameB : typeof ob === "string" ? (ob === "" ? "?" : '"' + ob + '"') : String(ob);
  for (const e of Code([lhs + " = " + sa + " " + (oop || "?") + " " + sb], height - 82 - codeH(1) - 6)) out.push(e);
  return out;
}

// ======================================================================================
// 3 Tietorakenne: the layered smoothie and the lokerikko
// ======================================================================================
let dt: DsTask;
let dprog: number[] = [];       // lista: shelf numbers; jono / pino: the fruits put in
let dfill: number[] = [];       // lokero: the fruit in each drawer, -1 empty
let dsel = 0;
let cup: number[] = [];
let dq: number[] = [];          // what is still in the queue / stack while it runs
let dhot = -1;
let served: number[] = [];      // lokero: 1 right, 0 wrong, -1 not yet, per animal (t.animals order)
let dstate = "";

function dsNext() {
  dt = dsTask(() => rg.random(), K.question, step());
  dprog = []; cup = []; dq = []; dhot = -1; dstate = "";
  dfill = dt.drawers.map(() => -1); dsel = 0;
  served = dt.animals.map(() => -1);
  dsSay();
}
function dsSay() {
  const intro = K.question === 0 ? ["kk_l3"] : [];
  rg.say(intro.concat(["kk_d_" + dt.kind]));
}
function dsReset() { cup = []; dq = []; dhot = -1; dstate = ""; mood = "ok"; served = dt.animals.map(() => -1); }
function dsEdit(f: () => void) {
  if (running || K.solved >= 0) return;
  dsReset();
  f();
  rg.sound("click"); rg.vibrate(10);
}
function maxLen() { return dt.kind === "lista" ? dt.recipe.length + 2 : dt.recipe.length + 1; }
// places
function cupBox() { return { x: width - 104, y: 126, w: 84, h: 120 }; }
function shelfX(i: number) { const w = Math.floor((width - 28) / 6); return 14 + i * w; }
const SHELF_Y = 280;
function itemS() { return Math.min(42, Math.floor((palY2() - 300 - 30) / Math.max(1, maxLen()))); }
function tubeBottom() { return 300 + maxLen() * itemS() + 14; }
function beltX(i: number) { return width - 60 - i * 46; }
const BELT_Y = 312;
function palY2() { return height - 82 - codeH(1) - 12 - 62; }
function drawerXY(i: number) { const w = Math.floor((width - 38) / 2); return { x: 14 + (i % 2) * (w + 10), y: 290 + Math.floor(i / 2) * 82, w, h: 72 }; }

function CupArt(x: number, y: number, w: number, h: number, layers: number[], max: number) {
  const out: any[] = [];
  out.push(Poly([[x, y], [x + w, y], [x + w - 8, y + h], [x + 8, y + h]], "rgba(255,255,255,0.75)", "#8d99ae", 3));
  const lh = Math.min(26, (h - 10) / Math.max(1, max));
  layers.forEach((f, i) => {
    if (f < 0) return;
    const yy = y + h - 4 - (i + 1) * lh;
    out.push(Box(x + 10, yy, w - 20, lh - 2, FRUITS[f].c, 4));
    out.push(<div className="emoji" style={{ left: x + w / 2 - 12, top: yy - 2, width: 24, height: lh, fontSize: Math.min(16, lh - 6) }}>{FRUITS[f].e}</div>);
  });
  return out;
}

function dsRun() {
  if (running || K.solved >= 0) return;
  if (dt.kind === "lokero" ? dfill.some((f) => f < 0) : !dprog.length) { rg.sound("wrong"); rg.say("kk_kesken"); return; }
  dsReset();
  const steps: (() => number)[] = [];
  const cb = cupBox();
  if (dt.kind === "lista") {
    dprog.forEach((idx) => {
      steps.push(() => {
        dhot = idx - 1;
        const f = dt.shelf[idx - 1];
        fly(shelfX(idx - 1) + 27, SHELF_Y + 30, cb.x + cb.w / 2, cb.y + 20, 0.5, (x, y) => [Em(x, y, FRUITS[f].e, 18)]);
        rg.sound("tick");
        return 0.55;
      });
      steps.push(() => { flies = []; cup.push(dt.shelf[idx - 1]); rg.sound("pop"); return 0.25; });
    });
  } else if (dt.kind === "jono" || dt.kind === "pino") {
    dq = dprog.slice();
    dprog.forEach(() => {
      steps.push(() => {
        const s = itemS();
        const f = dt.kind === "jono" ? dq[0] : dq[dq.length - 1];
        const from = dt.kind === "jono" ? { x: beltX(0), y: BELT_Y } : { x: width / 2, y: tubeBottom() - 14 - (dq.length - 0.5) * s };
        if (dt.kind === "jono") dq.shift(); else dq.pop();
        fly(from.x, from.y, cb.x + cb.w / 2, cb.y + 20, 0.5, (x, y) => [Em(x, y, FRUITS[f].e, 18)]);
        dhot = f;
        rg.sound("tick");
        return 0.55;
      });
      steps.push(() => { flies = []; cup.push(dhot); rg.sound("pop"); return 0.25; });
    });
  } else {
    dt.serve.forEach((an) => {
      steps.push(() => {
        const di = dt.drawers.indexOf(an), d = drawerXY(di), ai = dt.animals.indexOf(an);
        dhot = di;
        const f = dfill[di];
        const ax = animalX(ai);
        fly(d.x + d.w - 30, d.y + 36, ax, 200, 0.55, (x, y) => [Em(x, y, FRUITS[f].e, 18)]);
        rg.say("kk_nimi_" + ANIMALS[an].id);
        return 0.6;
      });
      steps.push(() => {
        flies = [];
        const di = dt.drawers.indexOf(an), ai = dt.animals.indexOf(an);
        const ok = dfill[di] === wantOf(dt, an);
        served[ai] = ok ? 1 : 0;
        rg.sound(ok ? "pop" : "wrong");
        return 0.45;
      });
    });
  }
  steps.push(() => {
    dhot = -1;
    if (dsOk(dt, dprog, dfill)) { dstate = "ok"; mood = "happy"; win(cb.x + cb.w / 2, cb.y + 40, [dt.kind === "lokero" ? "kk_d_valmis_lokero" : "kk_d_valmis"]); }
    else {
      dstate = "bad";
      const pinoSame = dt.kind === "pino" && dprog.join() === dt.recipe.join();
      failed([dt.kind === "lokero" ? "kk_d_vaara_lokero" : pinoSame ? "kk_d_vaara_pino" : "kk_d_vaara"]);
    }
    return 0;
  });
  runSeq(steps);
}
function animalX(i: number) { const n = dt.animals.length, w = Math.floor((width - 28) / n); return 14 + i * w + w / 2; }

function DsPlay() {
  const out: any[] = [];
  const k = dt.kind;
  const head = k === "lista" ? L("Lista: hae numerolla", "List: get by number", "Lista: coge por número")
    : k === "jono" ? L("Jono: ensimmäinen ensin ulos", "Queue: first in, first out", "Cola: primero, primero fuera")
    : k === "pino" ? L("Pino: viimeinen ensin ulos", "Stack: last in, first out", "Pila: último, primero fuera")
    : L("Lokerikko: hae nimellä", "Drawers: get by name", "Cajones: coge por nombre");
  for (const e of Header(head, () => dsSay(), () => hint())) out.push(e);
  const cb = cupBox();
  if (k !== "lokero") {
    // the recipe cup and the real cup
    out.push(Tx(14, 122, 100, 18, L("Resepti", "Recipe", "Receta"), 13, "#6c757d"));
    for (const e of CupArt(22, 142, 84, 104, dt.recipe, dt.recipe.length + 1)) out.push(e);
    out.push(Tx(cb.x, 122, cb.w, 18, L("Muki", "Cup", "Vaso"), 13, "#6c757d"));
    for (const e of CupArt(cb.x, cb.y + 16, cb.w, cb.h - 12, cup, dt.recipe.length + 1)) out.push(e);
    for (const e of Robot(width / 2, 196, 0.5, "#4895ef", running ? 1 : -1, mood)) out.push(e);
    if (dstate === "bad") out.push(Tx(cb.x - 20, cb.y + cb.h + 6, cb.w + 40, 18, L("eri järjestys", "wrong order", "otro orden"), 13, "#d62828"));
  } else {
    // the animals and what each one likes
    dt.animals.forEach((an, i) => {
      const x = animalX(i);
      const bg = served[i] === 1 ? "#d8f8e8" : served[i] === 0 ? "#ffd6dc" : "#ffffff";
      out.push(Box(x - 38, 124, 76, 120, bg, 16));
      out.push(Em(x, 160, ANIMALS[an].e, 26));
      out.push(Tx(x - 38, 184, 76, 16, ANIMALS[an].w, 12, C.ink));
      out.push(Tx(x - 38, 204, 76, 34, "💭" + FRUITS[dt.wants[i]].e, 20, C.ink));
      if (served[i] >= 0) out.push(Tx(x + 14, 124, 24, 24, served[i] ? "✔" : "✖", 18, served[i] ? "#2d6a4f" : "#d62828"));
    });
  }
  const py = palY2();
  if (k === "lista") {
    out.push(Tx(14, SHELF_Y - 24, 160, 20, L("lista hylly", "list shelf", "lista estante"), 13, C.rakenne, true));
    for (let i = 0; i < 6; i++) {
      const x = shelfX(i), w = Math.floor((width - 28) / 6);
      out.push(Box(x + 2, SHELF_Y, w - 4, 54, dhot === i ? "#fff3b0" : "#ffffff", 10));
      out.push(Em(x + w / 2, SHELF_Y + 28, FRUITS[dt.shelf[i]].e, 18));
      out.push(Box(x + 2, SHELF_Y + 56, w - 4, 6, "#8d6e63", 3));
      out.push(Tx(x, SHELF_Y + 62, w, 20, String(i + 1), 16, C.rakenne));
    }
    // the program: the numbers asked for
    const n = maxLen(), sw = Math.min(46, Math.floor((width - 28) / n));
    const x0 = Math.floor((width - n * sw) / 2), y = SHELF_Y + 112;
    out.push(Tx(14, y - 22, 200, 20, L("ohjelma: hae paikat", "program: get places", "programa: coge sitios"), 13, C.ink, true));
    for (let i = 0; i < n; i++) {
      out.push(<div className="slot" style={{ left: x0 + i * sw + 2, top: y, width: sw - 4, height: 44, backgroundColor: i < dprog.length ? "#e9d8fd" : "rgba(255,255,255,0.6)" }} />);
      if (i < dprog.length) out.push(Tx(x0 + i * sw, y, sw, 44, String(dprog[i]), 22, C.rakenne));
    }
    // the number pad
    const w = Math.floor((width - 28 - 6 * 6) / 7);
    for (let i = 0; i < 6; i++) for (const e of Pad("n" + (i + 1), 14 + i * (w + 6), py, w, 56, String(i + 1), C.rakenne, () => dsEdit(() => { if (dprog.length < maxLen()) { dprog.push(i + 1); rg.say(rg.sayId.number(i + 1)); } else rg.sound("wrong"); }), 24)) out.push(e);
    for (const e of Pad("undo", 14 + 6 * (w + 6), py, w, 56, "⌫", "#9a8c98", () => dsEdit(() => { dprog.pop(); }), 22)) out.push(e);
    if (hinted() && K.solved < 0 && dprog.length < dt.recipe.length) out.push(PointAt(14 + dt.shelf.indexOf(dt.recipe[dprog.length]) * (w + 6) + w / 2, py, "#f77f00"));
  } else if (k === "jono") {
    const items = running ? dq : dprog;
    out.push(Box(14, BELT_Y + 22, width - 28, 14, "#495057", 7));
    for (let i = 0; i < 12; i++) out.push(Box(20 + ((i * 30 + K.t * (running ? 60 : 0)) % (width - 40)), BELT_Y + 27, 12, 4, "#adb5bd", 2));
    out.push(Tx(14, BELT_Y + 40, 120, 18, "← " + L("perä: sisään", "back: in", "final: entra"), 13, C.rakenne, true));
    out.push(Tx(width - 150, BELT_Y + 40, 136, 18, L("edessä: ulos", "front: out", "delante: sale") + " →", 13, C.rakenne));
    items.forEach((f, i) => { out.push(Box(beltX(i) - 20, BELT_Y - 20, 40, 40, "#ffffff", 10)); out.push(Em(beltX(i), BELT_Y, FRUITS[f].e, 18)); });
    out.push(Poly([[width - 30, BELT_Y - 30], [width - 16, BELT_Y - 30], [cb.x + cb.w / 2 + 6, cb.y + cb.h + 4], [cb.x + cb.w / 2 - 6, cb.y + cb.h + 4]], "rgba(131,56,236,0.25)"));
    for (const e of Pantry(py)) out.push(e);
  } else if (k === "pino") {
    const items = running ? dq : dprog, s = itemS(), tb = tubeBottom();
    const tx = width / 2 - s / 2 - 10;
    out.push(Frame(tx, 300, s + 20, tb - 300, "rgba(255,255,255,0.5)", C.rakenne, 10, 3));
    out.push(Tx(tx - 120, 300, 112, 34, "↓↑ " + L("päältä sisään ja ulos", "in and out at the top", "entra y sale por arriba"), 12, C.rakenne));
    items.forEach((f, i) => { const y = tb - 14 - (i + 1) * s; out.push(Box(tx + 10, y + 1, s, s - 2, "#ffffff", 8)); out.push(Em(width / 2, y + s / 2, FRUITS[f].e, Math.min(18, s * 0.45))); });
    out.push(Tx(tx + s + 26, tb - 30, 90, 18, L("pohja", "bottom", "fondo"), 12, "#6c757d", true));
    for (const e of Pantry(py)) out.push(e);
  } else {
    dt.drawers.forEach((an, i) => {
      const d = drawerXY(i);
      out.push(Box(d.x, d.y, d.w, d.h, dhot === i ? "#fff3b0" : dsel === i && !running ? "#e9d8fd" : "#ffffff", 12));
      out.push(Box(d.x, d.y, 56, d.h, C.rakenne, 12));
      out.push(Em(d.x + 28, d.y + 30, ANIMALS[an].e, 18));
      out.push(Tx(d.x, d.y + 48, 56, 18, ANIMALS[an].w, 10, "#ffffff"));
      out.push(Box(d.x + d.w - 46, d.y + 32, 24, 6, "#adb5bd", 3));
      if (dfill[i] >= 0) out.push(Em(d.x + 56 + (d.w - 56) / 2, d.y + 34, FRUITS[dfill[i]].e, 20));
      out.push(Hit("dr" + i, d.x, d.y, d.w, d.h, () => { if (!running && K.solved < 0) { dsel = i; rg.sound("click"); rg.say("kk_nimi_" + ANIMALS[an].id); } }));
    });
    for (const e of Pantry(py)) out.push(e);
  }
  // the code
  const fr = (a: number[]) => "[" + a.map((f) => FRUITS[f].e).join(", ") + "]";
  const line = k === "lista" ? L("hae", "get", "coge") + " " + (dprog.length ? dprog.map((i) => L("hylly", "shelf", "estante") + "[" + i + "]").join(", ") : "…")
    : k === "jono" ? L("jono", "queue", "cola") + " = " + fr(dprog)
    : k === "pino" ? L("pino", "stack", "pila") + " = " + fr(dprog)
    : (dfill[dsel] >= 0 ? L("ruoka", "food", "comida") + '["' + ANIMALS[dt.drawers[dsel]].w + '"] = ' + FRUITS[dfill[dsel]].e : L("ruoka", "food", "comida") + '["' + ANIMALS[dt.drawers[dsel]].w + '"] = ?');
  for (const e of Code([line], height - 82 - codeH(1) - 6)) out.push(e);
  return out;
}
// the fruit buttons: tap = put in (jono: at the back, pino: on top, lokero: into the chosen drawer)
function Pantry(py: number) {
  const out: any[] = [];
  const n = dt.pantry.length + 1, w = Math.min(56, Math.floor((width - 28 - (n - 1) * 6) / n));
  const x0 = Math.floor((width - n * w - (n - 1) * 6) / 2);
  dt.pantry.forEach((f, i) => {
    const x = x0 + i * (w + 6);
    out.push(<div className="pad" style={{ left: x, top: py, width: w, height: 56, backgroundColor: "#ffffff" }} />);
    out.push(Em(x + w / 2, py + 28, FRUITS[f].e, 20));
    out.push(Hit("f" + i, x, py, w, 56, () => dsEdit(() => {
      if (dt.kind === "lokero") {
        dfill[dsel] = f;
        for (let k = 1; k <= dfill.length; k++) { const j = (dsel + k) % dfill.length; if (dfill[j] < 0) { dsel = j; break; } }
      } else if (dprog.length < maxLen()) dprog.push(f);
      else rg.sound("wrong");
    })));
  });
  const ux = x0 + dt.pantry.length * (w + 6);
  for (const e of Pad("undo", ux, py, w, 56, "⌫", "#9a8c98", () => dsEdit(() => { if (dt.kind === "lokero") dfill[dsel] = -1; else dprog.pop(); }), 22)) out.push(e);
  if (hinted() && K.solved < 0) {
    let need = -1;
    if (dt.kind === "jono" && dprog.length < dt.recipe.length) need = dt.recipe[dprog.length];
    if (dt.kind === "pino" && dprog.length < dt.recipe.length) need = dt.recipe[dt.recipe.length - 1 - dprog.length];
    if (dt.kind === "lokero") need = wantOf(dt, dt.drawers[dsel]);
    if (need >= 0) out.push(PointAt(x0 + dt.pantry.indexOf(need) * (w + 6) + w / 2, py, "#f77f00"));
  }
  return out;
}

// ======================================================================================
// 4 Funktio: one recipe, many calls
// ======================================================================================
let ft: FnTask;
let fb: Body = { op: "", n: 0, op2: "", n2: 0 };
let fres: Val[] = [];
let fdone: boolean[] = [];
let fhot = -1;
let fspin = -10;

function fnNext() {
  ft = fnTask(() => rg.random(), K.question, step());
  fb = { op: "", n: 0, op2: "", n2: 0 };
  fres = ft.xs.map(() => null); fdone = ft.xs.map(() => false); fhot = -1;
  fnSay();
}
function fnSay() {
  const intro = K.question === 0 ? ["kk_l4"] : [];
  rg.say(intro.concat(["kk_f_" + ft.kind]));
}
function fnEdit(f: () => void) {
  if (running || K.solved >= 0) return;
  fdone = ft.xs.map(() => false); fhot = -1; mood = "ok";
  f();
  rg.sound("click"); rg.vibrate(10);
}
const FM = { y: 124, h: 108 };
function frowY(r: number) { return FM.y + FM.h + 12 + r * 66; }
function callY(i: number) { const rows = ft.kind === "kaksi" ? 2 : 1; return frowY(rows) + 8 + i * 50; }
function two() { return ft.kind === "kaksi"; }

function fnRunAll() {
  if (running || K.solved >= 0) return;
  if (!fb.op || (two() && !fb.op2)) { rg.sound("wrong"); rg.say("kk_kesken"); return; }
  fdone = ft.xs.map(() => false); mood = "ok";
  const steps: (() => number)[] = [];
  ft.xs.forEach((x, i) => {
    steps.push(() => {
      fhot = i;
      fly(78, callY(i) + 22, width / 2, FM.y + 60, 0.45, (px, py) => [Box(px - 20, py - 15, 40, 30, C.luku, 15), Tx(px - 20, py - 15, 40, 30, String(x), 15, "#ffffff")]);
      rg.sound("tick");
      return 0.5;
    });
    steps.push(() => {
      flies = []; fspin = K.t; rg.sound("hit", { pitch: 1.5 });
      const v = fnRun(fb, x, two());
      fly(width / 2, FM.y + 80, width - 120, callY(i) + 22, 0.45, (px, py) => [Box(px - 24, py - 15, 48, 30, typeof v === "boolean" ? C.kylla : C.luku, 15), Tx(px - 24, py - 15, 48, 30, typeof v === "boolean" ? (v ? "✔" : "✖") : show(v), 15, "#ffffff")]);
      return 0.5;
    });
    steps.push(() => {
      flies = [];
      fres[i] = fnRun(fb, x, two()); fdone[i] = true;
      rg.sound(fres[i] === ft.want[i] ? "pop" : "wrong");
      return 0.35;
    });
  });
  steps.push(() => {
    fhot = -1;
    if (fnOk(ft, fb)) { mood = "happy"; win(width / 2, FM.y + 50, ["kk_f_valmis"]); }
    else failed(["kk_f_vaara"]);
    return 0;
  });
  runSeq(steps);
}

function FnPlay() {
  const out: any[] = [];
  const head = ft.kind === "luku" ? L("Tee kone kaikille", "Make one machine for all", "Haz una máquina para todos")
    : ft.kind === "kysy" ? L("Kone vastaa kyllä tai ei", "The machine says yes or no", "La máquina dice sí o no")
    : L("Kaksi vaihetta", "Two steps", "Dos pasos");
  for (const e of Header(head, () => fnSay(), () => hint())) out.push(e);
  // the machine: its name, input x, the recipe
  const sp = K.t - fspin < 0.5 ? Math.sin(K.t * 50) * 2 : 0;
  const name = K.solved >= 0 ? fnName(fb, two()) : L("kone", "machine", "máquina");
  out.push(Box(14 + sp, FM.y, width - 28, FM.h, C.funktio, 18));
  out.push(Tx(26 + sp, FM.y + 6, width - 52, 24, L("funktio ", "function ", "función ") + name + "(x)", 18, "#ffffff", true));
  out.push(Em(width - 40 + sp, FM.y + 18, "⚙️", 16));
  out.push(Box(26 + sp, FM.y + 38, width - 52, 58, "#ffffff", 12));
  const chips: string[] = [L("palauta", "return", "devuelve"), "x", fb.op || "?", String(fb.n)];
  if (two()) { chips.push(fb.op2 || "?"); chips.push(String(fb.n2)); }
  const cw = two() ? 38 : 48;
  let cx = 36 + sp;
  chips.forEach((c, i) => {
    const w = i === 0 ? 74 : cw;
    if (i >= 2) out.push(Box(cx, FM.y + 48, w - 6, 38, i % 2 === 0 ? "#ffe8a3" : "#dbeafe", 8));
    out.push(Tx(cx, FM.y + 48, w - 6, 38, c, i === 0 ? 16 : 22, i === 0 ? C.funktio : C.ink));
    cx += w;
  });
  // the controls: one row per step of the recipe
  const rows = two() ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const y = frowY(r), pal = r === 0 ? ft.palette : ft.palette2;
    const cur = r === 0 ? fb.op : fb.op2;
    const w = 50;
    if (two()) out.push(Tx(4, y, 18, 54, String(r + 1) + ".", 15, C.funktio));
    pal.forEach((op, i) => {
      for (const e of Pad("fop" + r + i, 22 + i * (w + 6), y, w, 54, op, cur === op ? "#ffb703" : "#355070", () => fnEdit(() => { if (r === 0) fb.op = op; else fb.op2 = op; rg.say(OPSAY[op]); }), 26)) out.push(e);
    });
    const nx = width - 150;
    const nv = r === 0 ? fb.n : fb.n2;
    for (const e of Pad("fnm" + r, nx, y, 40, 54, "-", C.luku, () => fnEdit(() => { if (r === 0) fb.n = Math.max(0, fb.n - 1); else fb.n2 = Math.max(0, fb.n2 - 1); }))) out.push(e);
    out.push(Box(nx + 44, y, 50, 54, "#ffffff", 12));
    out.push(Tx(nx + 44, y, 50, 54, String(nv), 26, C.luku));
    for (const e of Pad("fnp" + r, nx + 98, y, 40, 54, "+", C.luku, () => fnEdit(() => { if (r === 0) fb.n = Math.min(10, fb.n + 1); else fb.n2 = Math.min(10, fb.n2 + 1); }))) out.push(e);
  }
  // the calls: who brings what, and what they want back
  ft.xs.forEach((x, i) => {
    const y = callY(i);
    const ok = fdone[i] && fres[i] === ft.want[i], bad = fdone[i] && !ok;
    out.push(Box(14, y, width - 28, 44, fhot === i ? "#fff3b0" : ok ? "#d8f8e8" : bad ? "#ffd6dc" : "rgba(255,255,255,0.7)", 12));
    out.push(Em(38, y + 22, ANIMALS[i % ANIMALS.length].e, 16));
    out.push(Tx(58, y + 4, 40, 36, String(x), 22, C.luku));
    out.push(Tx(96, y + 4, 90, 36, "→ " + name.slice(0, 8) + "() →", 12, C.funktio));
    const r = fdone[i] ? fres[i] : null;
    out.push(Box(width - 150, y + 6, 54, 32, "#ffffff", 8));
    out.push(Tx(width - 150, y + 6, 54, 32, fdone[i] ? (typeof r === "boolean" ? (r ? "✔" : "✖") : show(r)) : "", 18, typeof r === "boolean" ? (r ? "#2d6a4f" : "#d62828") : C.ink));
    const w = ft.want[i];
    out.push(Tx(width - 92, y + 4, 74, 18, L("haluaa", "wants", "quiere"), 11, "#6c757d"));
    out.push(Tx(width - 92, y + 18, 74, 24, typeof w === "boolean" ? (w ? "✔ " + show(true) : "✖ " + show(false)) : String(w), typeof w === "boolean" ? 14 : 20, typeof w === "boolean" ? (w ? "#2d6a4f" : "#d62828") : C.ink));
  });
  if (hinted() && K.solved < 0) {
    const s = ft.sol;
    if (fb.op !== s.op) out.push(PointAt(22 + ft.palette.indexOf(s.op) * 56 + 25, frowY(0), "#f77f00"));
    else if (fb.n !== s.n) out.push(PointAt(width - 150 + (fb.n < s.n ? 118 : 20), frowY(0), "#f77f00"));
    else if (two() && fb.op2 !== s.op2) out.push(PointAt(22 + ft.palette2.indexOf(s.op2) * 56 + 25, frowY(1), "#f77f00"));
    else if (two() && fb.n2 !== s.n2) out.push(PointAt(width - 150 + (fb.n2 < s.n2 ? 118 : 20), frowY(1), "#f77f00"));
  }
  const body = "x " + (fb.op || "?") + " " + fb.n + (two() ? " " + (fb.op2 || "?") + " " + fb.n2 : "");
  for (const e of Code([L("funktio ", "function ", "función ") + name + "(x) { " + L("palauta ", "return ", "devuelve ") + body + " }"], height - 82 - codeH(1) - 6)) out.push(e);
  return out;
}

// ======================================================================================
// 5 Kaikki yhdessä: a list, a counter, an operator and a function
// ======================================================================================
let at: AllTask;
let ap: Prog = { alku: -1, op: "", n: -1, fn: -1, lisa: "" };
let abasket = 0;
let aptr = -1;
let aline = -1;
let amem: number | null = null;
let amemT = -10;
let aresult: number[] = [];      // per basket: 1 right, 0 wrong, -1 not run

function allNext() {
  at = allTask(() => rg.random(), K.question, step());
  const s = at.sol;
  ap = { alku: at.open.indexOf("alku") >= 0 ? -1 : s.alku, op: at.open.indexOf("op") >= 0 ? "" : s.op, n: at.open.indexOf("n") >= 0 ? -1 : s.n, fn: at.open.indexOf("fn") >= 0 ? -1 : s.fn, lisa: at.open.indexOf("lisa") >= 0 ? "" : s.lisa };
  abasket = 0; aptr = -1; aline = -1; amem = null; aresult = [-1, -1];
  allSay();
}
function allSay() {
  const intro = K.question === 0 ? ["kk_l5"] : [];
  rg.say(intro.concat([at.kind === "laske" ? "kk_k_laske" : "kk_k_summa"]));
}
function allEdit(f: () => void) {
  if (running || K.solved >= 0) return;
  abasket = 0; aptr = -1; aline = -1; amem = null; aresult = [-1, -1]; mood = "ok";
  f();
  rg.sound("click"); rg.vibrate(10);
}
function cycle(arr: any[], cur: any): any { const i = arr.indexOf(cur); return arr[(i + 1) % arr.length]; }
function memName() { return at.kind === "laske" ? L("laskuri", "counter", "contador") : L("summa", "total", "total"); }
const PROG_Y = 268;

function allRun() {
  if (running || K.solved >= 0) return;
  if (ap.alku < 0 || !ap.op || ap.n < 0 || ap.fn < 0 || !ap.lisa) { rg.sound("wrong"); rg.say("kk_kesken"); return; }
  aresult = [-1, -1]; mood = "ok";
  const steps: (() => number)[] = [];
  const D = 0.36;
  [0, 1].forEach((b) => {
    if (b === 1) steps.push(() => { abasket = 1; aptr = -1; aline = -1; amem = null; rg.say("kk_k_testi"); return 2.2; });
    steps.push(() => { aline = 0; amem = ap.alku; amemT = K.t; rg.sound("tick"); return D * 1.4; });
    at.lists[b].forEach((x, i) => {
      steps.push(() => { aptr = i; aline = 1; rg.sound("tick"); return D; });
      if (at.kind === "laske") {
        steps.push(() => { aline = 2; return D; });
        if (x === ap.fn) steps.push(() => { aline = 3; amem = apply(ap.op, amem, ap.n) as number; amemT = K.t; rg.sound("pop"); return D * 1.4; });
      } else steps.push(() => { aline = 2; amem = apply(ap.op, amem, ap.lisa === "1" ? 1 : at.prices[x]) as number; amemT = K.t; rg.sound("pop"); return D * 1.4; });
    });
    steps.push(() => {
      aptr = -1; aline = -1;
      const ok = amem === allGoal(at, b);
      aresult[b] = ok ? 1 : 0;
      if (!ok) { seq = []; failed([b === 0 ? "kk_k_vaara" : "kk_k_vaara_testi"]); return 0; }
      if (b === 1) { mood = "happy"; win(width / 2, PROG_Y, ["kk_k_valmis"]); }
      else rg.sound("coin");
      return 0.6;
    });
  });
  runSeq(steps);
}

function Chip(id: string, x: number, y: number, w: number, label: string, open: boolean, set: boolean, f: () => void) {
  const out: any[] = [];
  if (open) out.push(<div style={{ position: "absolute", left: x, top: y, width: w, height: 30, borderRadius: 8, backgroundColor: set ? "#ffe8a3" : "#fff3b0", borderWidth: 2, borderColor: "#ffb703", borderStyle: "solid" }} />);
  else out.push(Box(x, y, w, 30, "#2f5d8a", 8));
  out.push(Tx(x, y, w, 30, label, 16, open ? C.ink : "#caf0f8"));
  if (open) out.push(Hit(id, x, y, w, 30, f));
  return out;
}

function AllPlay() {
  const out: any[] = [];
  for (const e of Header(at.kind === "laske" ? L("Korjaa laskuri-ohjelma", "Fix the counting program", "Arregla el programa contador") : L("Korjaa kassaohjelma", "Fix the till program", "Arregla el programa de caja"), () => allSay(), () => hint())) out.push(e);
  // the basket (a list)
  const list = at.lists[abasket];
  out.push(Tx(14, 120, 200, 18, L("lista ", "list ", "lista ") + (abasket === 0 ? L("kori1", "basket1", "cesta1") : L("kori2 (testi)", "basket2 (test)", "cesta2 (prueba)")), 13, C.rakenne, true));
  const n = list.length, iw = Math.min(46, Math.floor((width - 28) / n));
  const x0 = 14;
  list.forEach((f, i) => {
    out.push(Box(x0 + i * iw + 2, 140, iw - 4, 44, aptr === i ? "#fff3b0" : "#ffffff", 10));
    out.push(Em(x0 + i * iw + iw / 2, 162, FRUITS[f].e, 16));
  });
  if (aptr >= 0) out.push(Tx(x0 + aptr * iw, 184, iw, 16, "x ↑", 12, C.funktio));
  // the goal and (summa) the prices in a lokerikko
  const gx = x0 + n * iw + 10;
  out.push(Frame(gx, 140, width - gx - 14, 44, "#fffbe6", "#ffb703", 10, 2));
  out.push(Tx(gx, 140, width - gx - 14, 44, (at.kind === "laske" ? L("Montako ", "How many ", "Cuántas ") + FRUITS[at.target].e + "? " : "") + "🎯 " + allGoal(at, abasket), at.kind === "laske" ? 15 : 20, "#b5540a"));
  if (at.kind === "summa") {
    out.push(Tx(14, 204, 120, 20, L("lokerikko hinta:", "drawers price:", "cajones precio:"), 13, C.rakenne, true));
    at.kinds.forEach((f, i) => {
      const x = 130 + i * 74;
      out.push(Box(x, 200, 68, 30, "#ffffff", 8));
      out.push(Box(x, 200, 30, 30, C.rakenne, 8));
      out.push(Em(x + 15, 215, FRUITS[f].e, 12));
      out.push(Tx(x + 30, 200, 38, 30, String(at.prices[f]), 18, C.ink));
    });
  }
  // the program
  const lines = at.kind === "laske" ? 4 : 3, lh = 44;
  out.push(Box(10, PROG_Y, width - 20, lines * lh + 12, "#1d3557", 12));
  if (aline >= 0) out.push(Box(14, PROG_Y + 6 + aline * lh, width - 28, lh - 4, "#2f5d8a", 8));
  const ly = (i: number) => PROG_Y + 6 + i * lh + 5;
  const op = (i: number) => at.open.indexOf(["alku", "op", "n", "fn", "lisa"][i]) >= 0;
  const mn = memName();
  out.push(Tx(20, ly(0), 100, 30, mn + " =", 16, "#caf0f8", true));
  for (const e of Chip("alku", 120, ly(0), 44, ap.alku < 0 ? "?" : String(ap.alku), op(0), ap.alku >= 0, () => allEdit(() => { ap.alku = ap.alku < 0 ? 0 : cycle(ALKU, ap.alku); rg.say(rg.sayId.number(ap.alku)); }))) out.push(e);
  out.push(Tx(20, ly(1), width - 40, 30, L("jokaiselle x listassa:", "for each x in the list:", "para cada x en la lista:"), 16, "#caf0f8", true));
  if (at.kind === "laske") {
    out.push(Tx(36, ly(2), 120, 30, L("jos onko_", "if is_", "si es_"), 16, "#caf0f8", true));
    for (const e of Chip("fn", 116, ly(2), 44, ap.fn < 0 ? "?" : FRUITS[ap.fn].e, op(3), ap.fn >= 0, () => allEdit(() => { ap.fn = ap.fn < 0 ? at.kinds[0] : cycle(at.kinds, ap.fn); }))) out.push(e);
    out.push(Tx(164, ly(2), 60, 30, "(x):", 16, "#caf0f8", true));
    out.push(Tx(52, ly(3), 150, 30, mn + " = " + mn, 15, "#caf0f8", true));
    for (const e of Chip("op", 200, ly(3), 40, ap.op || "?", op(1), !!ap.op, () => allEdit(() => { ap.op = ap.op ? cycle(OPS5, ap.op) : OPS5[0]; rg.say(OPSAY[ap.op]); }))) out.push(e);
    for (const e of Chip("n", 246, ly(3), 40, ap.n < 0 ? "?" : String(ap.n), op(2), ap.n >= 0, () => allEdit(() => { ap.n = ap.n < 0 ? NS[0] : cycle(NS, ap.n); rg.say(rg.sayId.number(ap.n)); }))) out.push(e);
  } else {
    out.push(Tx(36, ly(2), 130, 30, mn + " = " + mn, 15, "#caf0f8", true));
    for (const e of Chip("op", 156, ly(2), 40, ap.op || "?", op(1), !!ap.op, () => allEdit(() => { ap.op = ap.op ? cycle(OPS5, ap.op) : OPS5[0]; rg.say(OPSAY[ap.op]); }))) out.push(e);
    for (const e of Chip("lisa", 202, ly(2), 100, ap.lisa ? (ap.lisa === "1" ? "1" : L("hinta[x]", "price[x]", "precio[x]")) : "?", op(4), !!ap.lisa, () => allEdit(() => { ap.lisa = ap.lisa ? cycle(LISA, ap.lisa) : LISA[0]; }))) out.push(e);
  }
  // the memory slot
  const my = PROG_Y + lines * lh + 24;
  const fresh = K.t - amemT < 0.35;
  for (const e of MemBox(width / 2 - 70, my, 140, 92, mn, L("luku", "number", "número"), C.luku, aresult[abasket] === 0 ? "bad" : aresult[abasket] === 1 ? "ok" : "")) out.push(e);
  out.push(Tx(width / 2 - 70, my + 22, 140, 50, amem === null ? "…" : String(amem), fresh ? 40 : 34, C.luku));
  if (aresult[0] === 1) out.push(Tx(14, my + 30, width / 2 - 90, 24, "✔ " + L("kori1", "basket1", "cesta1"), 14, "#2d6a4f"));
  if (aresult[1] >= 0) out.push(Tx(width / 2 + 76, my + 30, width / 2 - 90, 24, (aresult[1] ? "✔ " : "✖ ") + L("kori2", "basket2", "cesta2"), 14, aresult[1] ? "#2d6a4f" : "#d62828"));
  if (hinted() && K.solved < 0) {
    const s = at.sol;
    let px = -1, py = 0;
    if (op(0) && ap.alku !== s.alku) { px = 142; py = ly(0); }
    else if (at.kind === "laske" && op(3) && ap.fn !== s.fn) { px = 138; py = ly(2); }
    else if (op(1) && ap.op !== s.op) { px = at.kind === "laske" ? 220 : 176; py = ly(at.kind === "laske" ? 3 : 2); }
    else if (at.kind === "laske" && op(2) && ap.n !== s.n) { px = 266; py = ly(3); }
    else if (at.kind === "summa" && op(4) && ap.lisa !== s.lisa) { px = 252; py = ly(2); }
    if (px >= 0) out.push(PointAt(px, py, "#f77f00"));
  }
  return out;
}

// ======================================================================================
// the game around the levels
// ======================================================================================
function hint() {
  hintT = K.t;
  rg.sound("click");
  rg.say(HINT[K.level]);
}

const LEVELS: Level[] = [
  { name: L("Muistipaikka", "Memory slot", "Memoria"), color: C.luku, say: "kk_l1", pic: (x, y, s) => [Frame(x - 34 * s, y - 18 * s, 68 * s, 50 * s, "#ffffff", "#1d3557", 10 * s, 2), Box(x - 26 * s, y - 30 * s, 52 * s, 20 * s, "#1d3557", 10 * s), Tx(x - 34 * s, y - 16 * s, 68 * s, 46 * s, "3", 30 * s, C.luku)] },
  { name: L("Operaattori", "Operator", "Operador"), color: "#355070", say: "kk_l2", pic: (x, y, s) => [Circle(x, y, 32 * s, "#ffffff", "#ffd166"), Tx(x - 30 * s, y - 30 * s, 60 * s, 60 * s, "+", 40 * s, C.ink)] },
  { name: L("Tietorakenne", "Data structure", "Estructura"), color: C.rakenne, say: "kk_l3", pic: (x, y, s) => [Box(x - 30 * s, y + 6 * s, 60 * s, 20 * s, FRUITS[0].c, 5 * s), Box(x - 30 * s, y - 16 * s, 60 * s, 20 * s, FRUITS[1].c, 5 * s), Box(x - 30 * s, y - 38 * s, 60 * s, 20 * s, FRUITS[2].c, 5 * s)] },
  { name: L("Funktio", "Function", "Función"), color: C.funktio, say: "kk_l4", pic: (x, y, s) => [Box(x - 40 * s, y - 26 * s, 80 * s, 50 * s, "#ffffff", 10 * s), Tx(x - 40 * s, y - 26 * s, 80 * s, 50 * s, "f(x)", 24 * s, C.funktio)] },
  { name: L("Kaikki yhdessä", "All together", "Todo junto"), color: "#06a77d", say: "kk_l5", pic: (x, y, s) => [Tx(x - 50 * s, y - 34 * s, 100 * s, 60 * s, "📦➕📚⚙️", 18 * s, "#ffffff")] },
];

function next() {
  stopRun(); mood = "ok"; hintT = -10;
  if (K.level === 0) cakeNext();
  else if (K.level === 1) opNext();
  else if (K.level === 2) dsNext();
  else if (K.level === 3) fnNext();
  else allNext();
}

setup(L("Koodikoulu", "Code School", "Escuela de código"), LEVELS, 6, next);

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode === "menu" && !introSaid && K.t > 0.6) { introSaid = true; rg.say("kk_intro"); }
  if (K.mode !== "play") { if (running) stopRun(); return; }
  flies = flies.filter((f) => K.t - f.t0 < f.d + 0.05);
  if (!running) return;
  seqT -= dt;
  while (running && seqT <= 0) {
    if (!seq.length) { running = false; break; }
    const f = seq.shift() as () => number;
    seqT += f();
  }
}

function onBack() { stopRun(); back(); }

function runTap() {
  if (K.level === 0) cakeRun();
  else if (K.level === 1) opRun();
  else if (K.level === 2) dsRun();
  else if (K.level === 3) fnRunAll();
  else allRun();
}

function Play() {
  const out: any[] = [];
  const body = K.level === 0 ? CakePlay() : K.level === 1 ? OpPlay() : K.level === 2 ? DsPlay() : K.level === 3 ? FnPlay() : AllPlay();
  for (const e of body) out.push(e);
  for (const e of Flies()) out.push(e);
  // ▶ runs the program
  const y = height - 72;
  out.push(<div className="pad" style={{ left: 14, top: y, width: width - 28, height: 58, backgroundColor: running ? "#adb5bd" : K.solved >= 0 ? "#06d6a0" : "#06a77d" }} />);
  out.push(Tx(14, y, width - 28, 58, running ? "…" : "▶ " + L("Käynnistä", "Run", "Ejecutar"), 24, "#ffffff"));
  out.push(Hit("run", 14, y, width - 28, 58, () => runTap()));
  return <div className="screen">{out}</div>;
}

function MenuDeco() {
  return [Tx(10, 64, width - 20, 44, L("muistipaikka · operaattori · tietorakenne · funktio", "memory slot · operator · data structure · function", "memoria · operador · estructura · función"), 13, "#1d4e89")];
}

function view() {
  let body;
  if (K.mode === "menu") body = Menu(MenuDeco());
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
