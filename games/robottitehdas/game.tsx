// Robottitehdas: a cookie factory run by robot helpers, for thinking about
// how work flows, how it is checked and how it gets better ("loop building"),
// how it scales and what it costs. Levels:
//   1 Kokoa linja   put the robots in order on the belt (mix, shape, bake,
//                   decorate, pack) and run it: a wrong order makes a funny
//                   wrong cookie, and the customer frowns
//   2 Tarkastaja    the robots make some bad cookies. Choose what the
//                   inspector checks (burnt? broken? no sprinkles?); a bad
//                   cookie goes back to the start on the return belt (the
//                   loop is closed) and only good ones reach the customer
//   3 Palaute       the inspector finds a mistake: send the note to the robot
//                   that made it. It learns, and the quality meter rises
//   4 Pullonkaula   the customers want many cookies today. Watch where the
//                   cookies pile up and put the helper robots there
//   5 Kauppa        each cookie costs 1 € to bake and sells for 3 €: how many
//                   to bake for the customers in the queue?
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, rect, star, ngon, Robot, Coin } from "lib/kit";
import { ORDER, lineFor, Cookie, raw, apply, good, makeSim, stepSim, best, simulate, profit, COST, PRICE, Sim } from "lib/sim";

const COLOR: any = { sekoitus: "#f4a261", muotti: "#e76f51", uuni: "#d62828", koriste: "#c77dff", paketti: "#2a9d8f", tarkastaja: "#3a86ff" };
const DEFECTS = ["palanut", "rikki", "tyhja", "mytty"];
const MAKER: any = { palanut: "uuni", rikki: "muotti", tyhja: "koriste", mytty: "sekoitus" };
const BELT = "#495057";

const LEVELS: Level[] = [
  { name: rg.t("Kokoa linja", "Build the line", "Monta la línea"), color: "#f4a261", say: "tk_f_kokoa", pic: (x, y, s) => Robot(x - 26 * s, y + 4 * s, s * 0.4, COLOR.sekoitus, -1, "ok").concat(Robot(x + 26 * s, y + 4 * s, s * 0.4, COLOR.uuni, -1, "ok")) },
  { name: rg.t("Tarkastaja", "Inspector", "Inspector"), color: "#3a86ff", say: "tk_f_tarkastaja", pic: (x, y, s) => Robot(x - 14 * s, y + 6 * s, s * 0.45, COLOR.tarkastaja, -1, "ok").concat(Lens(x + 24 * s, y - 4 * s, s * 0.9)) },
  { name: rg.t("Palaute", "Feedback", "Comentarios"), color: "#06a77d", say: "tk_f_palaute", pic: (x, y, s) => Meter(x - 34 * s, y + 24 * s, 68 * s, 46 * s, [0.3, 0.5, 0.7, 0.9]) },
  { name: rg.t("Pullonkaula", "Bottleneck", "Cuello de botella"), color: "#8338ec", say: "tk_f_pullonkaula", pic: (x, y, s) => { const o: any[] = []; for (let i = 0; i < 4; i++) for (const e of CookiePic(x - 8 * s + (i % 2) * 18 * s, y + 18 * s - Math.floor(i / 2) * 14 * s, 10 * s, done1())) o.push(e); return o.concat(Robot(x + 30 * s, y + 4 * s, s * 0.36, COLOR.uuni, -1, "sleep")); } },
  { name: rg.t("Kauppa", "Shop", "Tienda"), color: "#ffb703", say: "tk_f_kauppa", pic: (x, y, s) => Coin(x - 16 * s, y + 6 * s, 18 * s).concat(Coin(x + 14 * s, y - 2 * s, 18 * s), CookiePic(x + 4 * s, y + 26 * s, 14 * s, done1())) },
];

function done1(): Cookie { const c = raw(); c.mixed = true; c.shaped = true; c.baked = 1; c.deco = 1; return c; }

// ---- layout --------------------------------------------------------------------
const BY = 345;                       // the belt's top
function slotX(i: number, n: number) { const x0 = 44, x1 = width - 56; return n <= 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1); }

// ---- state ---------------------------------------------------------------------
let hintT = -10;
let phase = "set";                    // "set" | "run" | "end"
let clock = 0;
let say: string[] = [];
// level 1
let need: string[] = [];              // the right order
let slots: string[] = [];             // what the child put on the belt
let pool: string[] = [];              // robots still waiting
let item: Cookie = raw();
let itemX = 0, itemAt = -1;           // the cookie's x and the slot it is at (-1 moving)
let workT = 0;
let face = "";                        // the customer's face: "" | "yum" | "sad"
// level 2
type Item = { c: Cookie; x: number; lane: number; d: string };
let present: string[] = [];           // the defects this line makes
let options: string[] = [];
let chosen: string[] = [];
let trial: string[] = [];             // the trial batch: "" good or a defect
let items: Item[] = [];
let queued: string[] = [];
let delivered = 0, badOut = 0;
// level 3
let skill: any = {};
let crew: string[] = [];
let caught = "mytty";
let note = { t: -10, to: "" };
let history: number[] = [];
let shrug = "";
let shrugT = -10;
// level 4
let times: number[] = [];
let helpers: number[] = [];
let extra = 1;
let goal = 0;
let sim: Sim = makeSim([1], [1]);
let tried = false;
const DAY = 10, SPEED = 1.6;
// level 5
let customers: number[] = [];
let baked = 0;
let served = 0;

// ---- pictures -------------------------------------------------------------------

// a cookie (or what came out of the robots) about 2r wide
function CookiePic(x: number, y: number, r: number, c: Cookie): any[] {
  const out: any[] = [];
  if (c.flour || !c.mixed) {
    // a pile of flour (and an egg)
    out.push(Poly([[x - r, y + r * 0.6], [x - r * 0.4, y - r * 0.5], [x + r * 0.3, y - r * 0.6], [x + r, y + r * 0.6]], "#f8f9fa", "#ced4da", 1));
    if (!c.flour) out.push(Circle(x + r * 0.5, y + r * 0.1, r * 0.35, "#fff3d6", "#e9c46a"));
    if (c.baked === 2) out.push(Poly([[x - r, y + r * 0.6], [x - r * 0.4, y - r * 0.2], [x + r, y + r * 0.6]], "#6c584c"));
    if (c.boxed) out.push(Box(x - r * 1.1, y - r * 0.1, r * 2.2, r * 1.0, "#e9c46a", 3));
    return out;
  }
  const dough = c.baked === 2 ? "#3d2c24" : c.baked === 1 ? "#d4a373" : "#f1dca7";
  const edge = c.baked === 2 ? "#1b1210" : c.baked === 1 ? "#a26b3c" : "#d9bd7b";
  if (c.lumpy) {
    out.push(Poly(ngon(x, y, r, 7, 0.3).map((p, i) => [x + (p[0] - x) * (i % 2 ? 0.7 : 1.05), y + (p[1] - y) * (i % 2 ? 0.75 : 1)]), dough, edge, 2));
    out.push(Circle(x - r * 0.3, y - r * 0.2, r * 0.2, "#ffffff"));
  } else if (c.shaped) {
    const pts = star(x, y, r, r * 0.55, 5, -Math.PI / 2);
    if (c.broken) out.push(Poly(pts.slice(0, 7).concat([[x, y]]), dough, edge, 2));
    else out.push(Poly(pts, dough, edge, 2));
  } else {
    if (c.broken) out.push(Poly(ngon(x, y, r, 14, 0).slice(0, 8).concat([[x + r * 0.2, y], [x - r * 0.1, y + r * 0.3]]), dough, edge, 2));
    else out.push(Circle(x, y, r, dough, edge));
  }
  if (c.deco === 1 && !c.broken) {
    const cols = ["#ef476f", "#06d6a0", "#ffd166", "#118ab2", "#ffffff"];
    for (let i = 0; i < (r < 16 ? 3 : 6); i++) { const a = i * (r < 16 ? 2.1 : 1.05) + 0.4, rr = r * (0.25 + (i % 3) * 0.17); out.push(Box(x + Math.cos(a) * rr - r * 0.08, y + Math.sin(a) * rr - r * 0.08, r * 0.17, r * 0.17, cols[i % 5], 2)); }
  } else if (c.deco === 2) {
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.2; out.push(Circle(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, r * 0.18, "#6d597a")); }
  }
  if (c.boxed) {
    out.push(Box(x - r * 1.15, y - r * 0.05, r * 2.3, r * 1.15, "#e9c46a", 3));
    out.push(Box(x - r * 0.12, y - r * 0.05, r * 0.24, r * 1.15, "#e63946", 1));
  }
  return out;
}

// the station's sign above a robot: what it does
function Sign(st: string, x: number, y: number, s: number): any[] {
  const out: any[] = [Circle(x, y, 17 * s, "#ffffff", COLOR[st])];
  if (st === "sekoitus") { out.push(Poly([[x - 11 * s, y - 2 * s], [x + 11 * s, y - 2 * s], [x + 7 * s, y + 9 * s], [x - 7 * s, y + 9 * s]], "#adb5bd")); out.push(Line([[x + 2 * s, y + 2 * s], [x + 9 * s, y - 12 * s]], "#6c757d", Math.max(2, 3 * s))); }
  else if (st === "muotti") out.push(Poly(star(x, y + 1 * s, 12 * s, 6 * s, 5, -Math.PI / 2), "#ffffff", "#e76f51", Math.max(2, 3 * s)));
  else if (st === "uuni") { out.push(Box(x - 11 * s, y - 10 * s, 22 * s, 20 * s, "#495057", 3 * s)); out.push(Box(x - 7 * s, y - 5 * s, 14 * s, 10 * s, Math.sin(K.t * 6) > 0 ? "#f77f00" : "#ffb703", 2 * s)); }
  else if (st === "koriste") { out.push(Box(x - 6 * s, y - 10 * s, 12 * s, 18 * s, "#c77dff", 3 * s)); for (let i = 0; i < 3; i++) out.push(Box(x - 9 * s + i * 7 * s, y + 10 * s, 3 * s, 3 * s, ["#ef476f", "#06d6a0", "#ffd166"][i], 1)); }
  else if (st === "paketti") { out.push(Box(x - 10 * s, y - 8 * s, 20 * s, 16 * s, "#e9c46a", 2 * s)); out.push(Box(x - 2 * s, y - 8 * s, 4 * s, 16 * s, "#e63946", 1)); }
  else if (st === "tarkastaja") for (const e of Lens(x, y, s * 0.7)) out.push(e);
  return out;
}

function Lens(x: number, y: number, s: number) {
  return [Line([[x + 8 * s, y + 8 * s], [x + 18 * s, y + 18 * s]], "#6c584c", Math.max(3, 6 * s)), Circle(x, y, 12 * s, "rgba(202,240,248,0.8)", "#3d405b")];
}

// a station: the sign, the robot and its place on the belt
function Station(st: string, x: number, s: number, mood: string): any[] {
  return Standing(st, x, BY - 14, s, mood);
}
// a robot whose feet are at y, with its sign above
function Standing(st: string, x: number, y: number, s: number, mood: string): any[] {
  const cy = y - 54 * s;
  return Robot(x, cy, s, COLOR[st], -1, mood).concat(Sign(st, x, cy - 69 * s - 21, 0.95));
}

function Belt(x0: number, x1: number, y: number) {
  const out: any[] = [Box(x0, y, x1 - x0, 22, BELT, 11)];
  const off = phase === "run" ? (K.t * 60) % 24 : 0;
  for (let x = x0 + 12 + off; x < x1 - 10; x += 24) out.push(Box(x, y + 8, 10, 6, "#6c757d", 3));
  out.push(Circle(x0 + 11, y + 11, 9, "#adb5bd")); out.push(Circle(x1 - 11, y + 11, 9, "#adb5bd"));
  return out;
}

function Customer(x: number, y: number, f: string) {
  // the edge as a bigger circle underneath (a border would push the face off centre)
  const out: any[] = [Circle(x, y, 24, "#e09f3e"), Circle(x, y, 21, "#ffd6a5")];
  out.push(Box(x - 22, y - 24, 44, 12, "#6a4c93", 6));
  out.push(Circle(x - 7, y - 3, 3, "#3d405b")); out.push(Circle(x + 7, y - 3, 3, "#3d405b"));
  if (f === "sad") out.push(Line([[x - 8, y + 12], [x, y + 8], [x + 8, y + 12]], "#3d405b", 3));
  else if (f === "yum") out.push(Poly([[x - 9, y + 6], [x + 9, y + 6], [x + 5, y + 13], [x - 5, y + 13]], "#ef476f"));
  else out.push(Box(x - 6, y + 8, 12, 3, "#3d405b", 2));
  return out;
}

// a bar chart of quality, values 0…1
function Meter(x: number, y: number, w: number, h: number, vals: number[]) {
  const out: any[] = [Box(x, y - h, w, h, "#ffffff", 8)];
  const n = Math.max(6, vals.length), bw = (w - 8) / n;
  vals.forEach((v, i) => { const bh = Math.max(3, (h - 10) * v); out.push(Box(x + 4 + i * bw + 1, y - 5 - bh, bw - 2, bh, v > 0.8 ? "#06d6a0" : v > 0.5 ? "#ffd166" : "#ef476f", 2)); });
  return out;
}

function Stars(x: number, y: number, n: number) {
  const out: any[] = [];
  for (let i = 0; i < 3; i++) out.push(Poly(star(x - 14 + i * 14, y, 7, 3, 5, -Math.PI / 2), i < n ? "#ffd166" : "rgba(0,0,0,0.15)"));
  return out;
}

// ---- level 1: build the line ------------------------------------------------------

function next1() {
  const n = [3, 4, 5][step()];
  need = lineFor(n);
  slots = need.map(() => "");
  pool = rg.shuffle(need.slice(0));
  if (pool.join() === need.join()) pool = rg.shuffle(need.slice(0));
  phase = "set"; face = ""; item = raw(); itemX = 18; itemAt = -1;
}

function poolXY(i: number) { const w = Math.min(70, (width - 20) / need.length); return [width / 2 - (need.length - 1) * w / 2 + i * w, BY + 150]; }

function tapPool(i: number) {
  if (phase === "run" || K.solved >= 0) return;
  const free = slots.indexOf("");
  if (free < 0) return;
  slots[free] = pool[i];
  rg.say("tk_f_n_" + pool[i]);
  pool.splice(i, 1);
  face = ""; item = raw(); itemX = 18;
  rg.sound("pop"); rg.vibrate(15);
}

function tapSlot(i: number) {
  if (phase === "run" || K.solved >= 0 || !slots[i]) return;
  pool.push(slots[i]);
  slots[i] = "";
  face = ""; item = raw(); itemX = 18;
  rg.sound("click");
}

function run1() {
  if (phase === "run" || K.solved >= 0) return;
  if (slots.indexOf("") >= 0) { rg.sound("wrong"); rg.say("tk_f_tayta"); hintT = K.t; return; }
  phase = "run"; item = raw(); itemX = 18; itemAt = -1; face = "";
  rg.sound("whoosh");
}

function tick1(dt: number) {
  if (phase !== "run") return;
  const n = slots.length;
  if (itemAt >= 0) {
    workT -= dt;
    if (workT <= 0) { itemAt = -1; itemX += 2; }
    return;
  }
  itemX += 90 * dt;
  for (let i = 0; i < n; i++) {
    const sx = slotX(i, n + 1);
    if (itemX >= sx && itemX - 90 * dt < sx) {
      itemAt = i; itemX = sx; workT = 0.6;
      apply(item, slots[i]);
      rg.sound(slots[i] === "uuni" ? "whoosh" : "tick");
      return;
    }
  }
  if (itemX >= slotX(n, n + 1)) {
    phase = "end";
    if (good(item, n)) { face = "yum"; win(slotX(n, n + 1), BY - 20, ["tk_f_herkullinen"]); return; }
    face = "sad";
    const k = miss();
    let first = 0;
    while (first < n && slots[first] === need[first]) first++;
    if (k >= 2) { hintT = K.t; rg.say(["tk_f_ei_hyva", "tk_f_vihje_" + need[first]]); } else rg.say(["tk_f_ei_hyva", "tk_f_mieti"]);
  }
}

// the waiting robots are drawn in their own box under the belt
function Pool1() {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 10, top: BY + 50, width: width - 20, height: 150 }} />);
  pool.forEach((st, i) => {
    const xy = poolXY(i), s = 0.5;
    for (const e of Standing(st, xy[0], xy[1] + 30, s, "ok")) out.push(e);
    out.push(<div className="hit" id={"p" + i} onClick={() => tapPool(i)} style={{ left: xy[0] - 32, top: xy[1] - 72, width: 64, height: 110 }} />);
  });
  if (K.t - hintT < 5 && K.solved < 0) {
    let free = -1;
    for (let i = slots.length - 1; i >= 0; i--) if (slots[i] !== need[i]) free = i;
    if (free >= 0) {
      if (slots[free]) out.push(PointAt(slotX(free, slots.length + 1), BY - 124, "#ef476f"));
      else { const j = pool.indexOf(need[free]); if (j >= 0) { const xy = poolXY(j); out.push(PointAt(xy[0], xy[1] - 72, "#f77f00")); } }
    }
  }
  return out;
}

function Play1() {
  const out: any[] = [];
  const n = slots.length, s = 0.5;
  for (const e of Belt(4, width - 4, BY)) out.push(e);
  for (let i = 0; i < n; i++) {
    const x = slotX(i, n + 1);
    out.push(<div className="slot" style={{ left: x - 28, top: BY - 120, width: 56, height: 114 }} />);
    if (slots[i]) {
      for (const e of Station(slots[i], x, s, phase === "run" && itemAt === i ? "happy" : "ok")) out.push(e);
      out.push(<div className="hit" id={"s" + i} onClick={() => tapSlot(i)} style={{ left: x - 28, top: BY - 120, width: 56, height: 114 }} />);
    } else out.push(<div className="num" style={{ left: x - 28, top: BY - 80, width: 56, height: 30, color: "#9fb6cf" }}>{String(i + 1)}</div>);
  }
  for (const e of Customer(slotX(n, n + 1), BY - 60, face)) out.push(e);
  if (phase !== "set") for (const e of CookiePic(itemX, BY - 6, 16, item)) out.push(e);
  for (const e of Pool1()) out.push(e);
  out.push(RunButton(() => run1()));
  return out;
}

// ---- level 2: the inspector ---------------------------------------------------------

function defective(d: string): Cookie {
  const c = done1();
  if (d === "palanut") c.baked = 2;
  else if (d === "rikki") c.broken = true;
  else if (d === "tyhja") c.deco = 0;
  else if (d === "mytty") { c.lumpy = true; c.shaped = false; }
  return c;
}

function next2() {
  const s = step();
  options = s === 0 ? rg.shuffle(DEFECTS.slice(0, 2)) : rg.shuffle(DEFECTS.slice(0));
  present = rg.shuffle(options.slice(0)).slice(0, s === 2 ? 2 : 1);
  chosen = [];
  trial = rg.shuffle(present.concat(present.length === 1 ? [present[0], "", "", ""] : ["", "", ""]));
  phase = "set"; items = []; delivered = 0; badOut = 0; face = "";
}

function toggle(d: string) {
  if (phase === "run" || K.solved >= 0) return;
  const i = chosen.indexOf(d);
  if (i >= 0) chosen.splice(i, 1);
  else { chosen.push(d); if (chosen.length > present.length) chosen.shift(); rg.say("tk_f_d_" + d); }
  rg.sound("click"); rg.vibrate(10);
  face = "";
}

function run2() {
  if (phase === "run" || K.solved >= 0) return;
  if (chosen.length < present.length) { rg.sound("wrong"); rg.say("tk_f_valitse_tarkastus"); hintT = K.t; return; }
  phase = "run"; delivered = 0; badOut = 0; face = "";
  queued = rg.shuffle(present.concat(present, ["", "", "", ""])).slice(0, 6);
  items = [];
  rg.sound("whoosh");
}

function tick2(dt: number) {
  if (phase !== "run") return;
  const ix = slotX(4, 6), cx = slotX(5, 6);
  // feed a new cookie when the start is clear
  const clear = items.every((it) => it.lane !== 0 || it.x > 70);
  if (queued.length && clear) { const d = queued.shift() as string; items.push({ c: d ? defective(d) : done1(), x: 10, lane: 0, d }); }
  for (const it of items) {
    if (it.lane === 0) {
      const before = it.x;
      it.x += 80 * dt;
      if (before < ix && it.x >= ix) {
        if (it.d && chosen.indexOf(it.d) >= 0) { it.lane = 1; rg.sound("pop"); }
        else rg.sound("tick");
      }
      if (it.x >= cx) { it.lane = 3; if (it.d) { badOut++; face = "sad"; rg.sound("wrong"); } else { delivered++; face = "yum"; rg.sound("coin"); } }
    } else if (it.lane === 1) {
      it.x -= 110 * dt;
      if (it.x < 10) { it.lane = 2; queued.unshift(""); }  // made again, properly
    }
  }
  items = items.filter((it) => it.lane < 2);
  if (!items.length && !queued.length) {
    phase = "end";
    if (badOut === 0) { win(cx, BY - 50, ["tk_f_vain_hyvia"]); return; }
    const k = miss();
    if (k >= 2) { hintT = K.t; rg.say(["tk_f_huono_paasi", "tk_f_vihje_tarkastus"]); } else rg.say("tk_f_huono_paasi");
  }
}

function Play2() {
  const out: any[] = [];
  const s = 0.46;
  // what the customers got yesterday
  out.push(<div className="card" style={{ left: 10, top: 118, width: width - 20, height: 62 }} />);
  out.push(<div className="tiny" style={{ left: 14, top: 120, width: 70, height: 56 }}>{rg.t("Eilen:", "Yesterday:", "Ayer:")}</div>);
  trial.forEach((d, i) => {
    const x = 96 + i * ((width - 120) / trial.length);
    for (const e of CookiePic(x, 146, 15, d ? defective(d) : done1())) out.push(e);
    out.push(<div className="emoji" style={{ left: x + 6, top: 152, width: 22, height: 22, fontSize: 15 }}>{d ? "😟" : "😋"}</div>);
  });
  for (const e of Belt(4, width - 4, BY)) out.push(e);
  // the return belt under it: the loop
  out.push(Box(4, BY + 34, slotX(4, 6) + 20, 14, "#adb5bd", 7));
  out.push(Line([[slotX(4, 6), BY + 22], [slotX(4, 6), BY + 40]], "#adb5bd", 4));
  out.push(Poly([[8, BY + 41], [22, BY + 31], [22, BY + 51]], "#3a86ff"));
  out.push(<div className="tiny" style={{ left: 30, top: BY + 50, width: 120, height: 18, color: "#3a86ff" }}>{rg.t("↺ takaisin alkuun", "↺ back to start", "↺ vuelve al inicio")}</div>);
  const line = ["sekoitus", "muotti", "uuni", "koriste"];
  line.forEach((st, i) => { for (const e of Station(st, slotX(i, 6), s, "ok")) out.push(e); });
  for (const e of Station("tarkastaja", slotX(4, 6), s, phase === "run" ? "happy" : "ok")) out.push(e);
  for (const e of Customer(slotX(5, 6), BY - 60, face)) out.push(e);
  for (const it of items) for (const e of CookiePic(it.x, it.lane === 0 ? BY - 6 : BY + 34, 13, it.c)) out.push(e);
  if (phase !== "set") out.push(<div className="num" style={{ left: slotX(5, 6) - 30, top: BY - 112, width: 60, height: 26 }}>{"😋 " + delivered}</div>);
  // what the inspector checks
  const n = options.length, w = Math.min(150, (width - 30) / Math.min(n, 2) - 10), h = 64;
  out.push(<div className="tiny" style={{ left: 0, top: BY + 72, width, height: 20 }}>{rg.t("Tarkastaja hylkää:", "The inspector rejects:", "El inspector rechaza:") + "  " + (present.length > 1 ? "🔍🔍" : "🔍")}</div>);
  options.forEach((d, i) => {
    const x = width / 2 - (Math.min(n, 2) * (w + 10) - 10) / 2 + (i % 2) * (w + 10), y = BY + 96 + Math.floor(i / 2) * (h + 8);
    const on = chosen.indexOf(d) >= 0;
    out.push(<div className={on ? "card sel" : "card"} id={"d" + d} onClick={() => toggle(d)} style={{ left: x, top: y, width: w, height: h }} />);
    for (const e of CookiePic(x + 34, y + h / 2, 18, defective(d))) out.push(e);
    out.push(<div className="tiny" style={{ left: x + 56, top: y + 6, width: w - 60, height: h - 12 }}>{DNAME[d]}</div>);
    if (on) out.push(<div className="emoji" style={{ left: x + w - 30, top: y - 6, width: 28, height: 28, fontSize: 20 }}>🔍</div>);
    if (K.t - hintT < 5 && present.indexOf(d) >= 0 && !on) out.push(PointAt(x + 34, y + 6, "#f77f00"));
  });
  out.push(RunButton(() => run2()));
  return out;
}

const DNAME: any = {
  palanut: rg.t("palanut", "burnt", "quemada"), rikki: rg.t("rikki", "broken", "rota"),
  tyhja: rg.t("ei koristeita", "no sprinkles", "sin adornos"), mytty: rg.t("möykky", "lumpy", "grumosa"),
};

// ---- level 3: feedback --------------------------------------------------------------

function next3() {
  const s = step();
  if (K.question === 0) {
    crew = s === 0 ? ["sekoitus", "muotti", "uuni"] : ["sekoitus", "muotti", "uuni", "koriste"];
    skill = {};
    for (const st of crew) skill[st] = s === 2 ? 0 : rg.range(0, 1);
    history = [quality()];
  }
  const weak = crew.filter((st) => skill[st] < 3);
  const who = rg.pick(weak.length ? weak : crew);
  caught = Object.keys(MAKER).filter((d) => MAKER[d] === who)[0];
  phase = "set"; shrug = ""; note = { t: -10, to: "" };
}

function quality() {
  let sum = 0;
  for (const st of crew) sum += skill[st];
  return sum / (crew.length * 3);
}

function tapCrew(st: string) {
  if (K.solved >= 0) return;
  if (MAKER[caught] === st) {
    note = { t: K.t, to: st };
    skill[st] = Math.min(3, skill[st] + (K.question >= K.round - 2 ? 3 : 1));
    // in the last questions everyone has learned
    if (K.question === K.round - 1) for (const c of crew) skill[c] = 3;
    history.push(quality());
    win(slotX(crew.indexOf(st), crew.length + 1), BY - 90, ["tk_f_oppi"]);
    return;
  }
  shrug = st; shrugT = K.t;
  const k = miss();
  if (k >= 2) { hintT = K.t; rg.say(["tk_f_en_mina", "tk_f_vihje_" + caught]); } else rg.say("tk_f_en_mina");
}

function Play3() {
  const out: any[] = [];
  const n = crew.length, s = 0.5;
  // the inspector shows what it caught
  out.push(<div className="bubble" style={{ left: 16, top: 122, width: 180, height: 96 }} />);
  for (const e of CookiePic(70, 170, 30, defective(caught))) out.push(e);
  out.push(<div className="tiny" style={{ left: 110, top: 130, width: 92, height: 80 }}>{DNAME[caught] + "!"}</div>);
  for (const e of Meter(width - 150, 218, 134, 96, history)) out.push(e);
  out.push(<div className="tiny" style={{ left: width - 150, top: 124, width: 134, height: 16 }}>{rg.t("Laatu", "Quality", "Calidad")}</div>);
  for (const e of Belt(4, width - 4, BY)) out.push(e);
  crew.forEach((st, i) => {
    const x = slotX(i, n + 1);
    const mood = note.to === st && K.t - note.t < 2.5 ? "happy" : shrug === st && K.t - shrugT < 1.5 ? "sleep" : "ok";
    for (const e of Station(st, x, s, mood)) out.push(e);
    for (const e of Stars(x, BY + 40, skill[st])) out.push(e);
    out.push(<div className="hit" id={"c" + st} onClick={() => tapCrew(st)} style={{ left: x - 30, top: BY - 140, width: 60, height: 190 }} />);
    if (K.t - hintT < 5 && MAKER[caught] === st) out.push(PointAt(x, BY - 150, "#f77f00"));
    if (shrug === st && K.t - shrugT < 1.5) out.push(<div className="emoji" style={{ left: x - 16, top: BY - 170, width: 32, height: 30, fontSize: 24 }}>🤷</div>);
  });
  for (const e of Station("tarkastaja", slotX(n, n + 1), s, "ok")) out.push(e);
  // the note flies to the robot
  if (note.to && K.t - note.t < 1.2) {
    const a = (K.t - note.t) / 1.2, tx = slotX(crew.indexOf(note.to), n + 1), ty = BY - 70, fx = slotX(n, n + 1), fy = BY - 90;
    const x = fx + (tx - fx) * a, y = fy + (ty - fy) * a - Math.sin(a * Math.PI) * 60;
    out.push(Box(x - 12, y - 14, 24, 28, "#ffffff", 3)); out.push(Line([[x - 7, y - 6], [x + 7, y - 6]], "#adb5bd", 2)); out.push(Line([[x - 7, y + 1], [x + 7, y + 1]], "#adb5bd", 2));
  }
  out.push(<div className="card" style={{ left: 16, top: BY + 70, width: width - 32, height: 84 }} />);
  out.push(<div className="tiny" style={{ left: 24, top: BY + 76, width: width - 48, height: 72 }}>{rg.t("Kuka robotti teki tämän virheen? Napauta sitä, niin se saa palautteen ja oppii.", "Which robot made this mistake? Tap it: it gets the feedback and learns.", "¿Qué robot cometió el error? Tócalo: recibe el comentario y aprende.")}</div>);
  return out;
}

// ---- level 4: the bottleneck -----------------------------------------------------------

function next4() {
  const s = step();
  if (s === 0) { times = rg.pick([[1, 2, 1], [1, 1, 2]]); extra = 1; }
  else if (s === 1) { times = rg.pick([[1, 1, 3, 1], [1, 3, 1, 1]]); extra = 2; }
  else { times = rg.pick([[1, 2, 1, 2], [1, 2, 2, 1]]); extra = 2; }
  helpers = times.map(() => 0);
  goal = best(times, extra, DAY).out;
  sim = makeSim(times, helpers.map((h) => 1 + h));
  phase = "set"; tried = false; face = "";
}

function names4() { return times.length === 3 ? ["sekoitus", "uuni", "paketti"] : ["sekoitus", "muotti", "uuni", "paketti"]; }
function left4() { let u = 0; for (const h of helpers) u += h; return extra - u; }

function addHelper(i: number, d: number) {
  if (phase === "run" || K.solved >= 0) return;
  if (d > 0 && left4() <= 0) { rg.sound("wrong"); rg.say("tk_f_ei_enempaa"); return; }
  if (d < 0 && helpers[i] <= 0) return;
  helpers[i] += d;
  rg.sound(d > 0 ? "pop" : "click"); rg.vibrate(15);
  sim = makeSim(times, helpers.map((h) => 1 + h)); phase = "set";
}

function run4() {
  if (phase === "run" || K.solved >= 0) return;
  sim = makeSim(times, helpers.map((h) => 1 + h));
  phase = "run"; face = "";
  rg.sound("whoosh");
}

function tick4(dt: number) {
  if (phase !== "run") return;
  const before = sim.out;
  stepSim(sim, Math.min(dt * SPEED, DAY - sim.t));
  if (sim.out > before) rg.sound("coin");
  if (sim.t >= DAY - 1e-6) {
    phase = "end";
    if (sim.out >= goal) { face = "yum"; win(slotX(times.length, times.length + 1), BY - 60, ["tk_f_kaikki_saivat"]); return; }
    face = "sad";
    // the first run with no helpers is a look, not a miss
    if (!tried && left4() === extra) { tried = true; hintT = K.t; rg.say("tk_f_katso_jono"); return; }
    tried = true;
    const k = miss();
    if (k >= 2) { hintT = K.t; rg.say(["tk_f_liian_vahan", "tk_f_vihje_jono"]); } else rg.say("tk_f_liian_vahan");
  }
}

function Play4() {
  const out: any[] = [];
  const nm = names4(), n = nm.length;
  for (const e of Belt(4, width - 4, BY)) out.push(e);
  // the flour pile the first robot takes from
  out.push(Poly([[2, BY], [14, BY - 22], [30, BY - 26], [40, BY]], "#f8f9fa", "#ced4da", 1));
  nm.forEach((st, i) => {
    const x = slotX(i, n + 1);
    const busy = sim.busy[i] ? sim.busy[i].filter((b) => b >= 0).length : 0;
    const s = 0.44;
    for (const e of Standing(st, x, BY - 14, s, phase === "run" && busy ? "happy" : "ok")) out.push(e);
    // helpers: small robots beside
    for (let k = 0; k < helpers[i]; k++) for (const e of Robot(x + 22, BY - 24 - k * 30, 0.22, COLOR[st], -1, phase === "run" ? "happy" : "ok")) out.push(e);
    // the pile waiting in front of the station
    const q = sim.queue[i] || 0;
    for (let k = 0; k < Math.min(q, 12); k++) out.push(Circle(x - 30 + (k % 2) * 10, BY - 6 - Math.floor(k / 2) * 11, 7, "#f1dca7", "#c9a227"));
    if (q > 2) out.push(<div className="num" style={{ left: x - 46, top: BY - 96, width: 32, height: 24, color: "#d62828" }}>{String(q)}</div>);
    // + and − for helpers
    out.push(<div className="pad" id={"h" + i} onClick={() => addHelper(i, 1)} style={{ left: x - 30, top: BY + 34, width: 30, height: 34, backgroundColor: "#06d6a0" }}><div className="tiny" style={{ left: 0, top: 4, width: 28, height: 22, color: "#ffffff" }}>+</div></div>);
    out.push(<div className="pad" id={"m" + i} onClick={() => addHelper(i, -1)} style={{ left: x + 4, top: BY + 34, width: 30, height: 34, backgroundColor: "#9a8c98" }}><div className="tiny" style={{ left: 0, top: 4, width: 28, height: 22, color: "#ffffff" }}>−</div></div>);
    if (K.t - hintT < 5 && times[i] > 1 && left4() > 0) out.push(PointAt(x - 16, BY + 34, "#f77f00"));
  });
  for (const e of Customer(slotX(n, n + 1), BY - 60, face)) out.push(e);
  // goal and clock
  out.push(<div className="card" style={{ left: 16, top: 122, width: width - 32, height: 70 }} />);
  for (let k = 0; k < goal; k++) { const c = done1(); c.boxed = k < sim.out; for (const e of CookiePic(36 + k * Math.min(38, (width - 80) / goal), 150, 12, c)) out.push(e); }
  out.push(<div className="tiny" style={{ left: 20, top: 168, width: width - 110, height: 18 }}>{(phase === "run" ? "⏱ " + Math.ceil(DAY - sim.t) + "  " : "") + rg.t("Apurobotteja: ", "Helper robots: ", "Robots ayudantes: ") + left4()}</div>);
  for (let k = 0; k < left4(); k++) for (const e of Robot(width - 40 - k * 30, 176, 0.2, "#adb5bd", -1, "ok")) out.push(e);
  out.push(RunButton(() => run4()));
  return out;
}

// ---- level 5: the shop -----------------------------------------------------------------

function demand() { let d = 0; for (const c of customers) d += c; return d; }

function next5() {
  const s = step();
  const n = s === 0 ? rg.range(3, 5) : rg.range(3, 4);
  customers = [];
  for (let i = 0; i < n; i++) customers.push(s === 0 ? 1 : rg.range(1, s === 1 ? 2 : 3));
  baked = 0; served = 0; phase = "set"; face = "";
}

function bake(d: number) {
  if (phase === "run" || K.solved >= 0) return;
  baked = rg.clamp(baked + d, 0, 12);
  served = 0; phase = "set";
  rg.sound(d > 0 ? "pop" : "click");
  rg.say(rg.sayId.number(baked));
}

function run5() {
  if (phase === "run" || K.solved >= 0) return;
  if (baked === 0) { rg.sound("wrong"); rg.say("tk_f_leivo_ensin"); return; }
  phase = "run"; served = 0; clock = 0.6;
  rg.sound("whoosh");
}

function tick5(dt: number) {
  if (phase !== "run") return;
  clock -= dt;
  if (clock > 0) return;
  clock = 0.45;
  if (served < Math.min(baked, demand())) { served++; rg.sound("coin"); return; }
  phase = "end";
  const p = profit(baked, demand()), top = profit(demand(), demand());
  if (p >= top) { win(width / 2, 200, ["tk_f_voitto", rg.sayId.number(p), "tk_f_euroa"]); return; }
  const k = miss();
  const why = baked < demand() ? "tk_f_liian_vahan_kekseja" : "tk_f_liikaa_kekseja";
  if (k >= 2) { hintT = K.t; rg.say([why, "tk_f_vihje_kauppa"]); } else rg.say(why);
}

function Play5() {
  const out: any[] = [];
  const d = demand();
  // prices: making a cookie costs, selling one earns
  const half = (width - 32) / 2;
  out.push(<div className="card" style={{ left: 16, top: 120, width: width - 32, height: 64 }} />);
  out.push(Box(16 + half - 1, 130, 2, 44, "#e3e8ef"));
  for (const e of CookiePic(16 + half * 0.3, 146, 14, done1())) out.push(e);
  out.push(<div className="num" style={{ left: 16 + half * 0.45, top: 132, width: half * 0.5, height: 28, color: "#d62828" }}>{"−" + COST + " €"}</div>);
  out.push(<div className="tiny" style={{ left: 16, top: 162, width: half, height: 18 }}>{rg.t("leipominen", "baking", "hornear")}</div>);
  for (const e of CookiePic(16 + half * 1.3, 146, 14, done1())) out.push(e);
  out.push(<div className="num" style={{ left: 16 + half * 1.45, top: 132, width: half * 0.5, height: 28, color: "#06a77d" }}>{"+" + PRICE + " €"}</div>);
  out.push(<div className="tiny" style={{ left: 16 + half, top: 162, width: half, height: 18 }}>{rg.t("myynti", "selling", "venta")}</div>);
  // the queue of customers, centred, each with a bubble of the cookies they want
  let given = served;
  const n = customers.length, sp = Math.min(76, (width - 32) / n), x0 = width / 2 - (n - 1) * sp / 2;
  customers.forEach((want, i) => {
    const x = x0 + i * sp, y = 262;
    const got = Math.min(want, Math.max(0, given));
    given -= want;
    const f = phase === "end" ? (got >= want ? "yum" : "sad") : got >= want ? "yum" : "";
    const bw = Math.max(36, want * 16 + 12);
    out.push(<div className="bubble" style={{ left: x - bw / 2, top: y - 74, width: bw, height: 30 }} />);
    out.push(Poly([[x - 6, y - 45], [x + 6, y - 45], [x, y - 37]], "#ffffff"));
    for (let k = 0; k < want; k++) for (const e of CookiePic(x - (want - 1) * 8 + k * 16, y - 59, 7, done1())) out.push(e);
    for (const e of Customer(x, y, f)) out.push(e);
  });
  // the tray of baked cookies
  out.push(<div className="card" style={{ left: 16, top: 300, width: width - 32, height: 100 }} />);
  for (let k = served; k < baked; k++) for (const e of CookiePic(40 + (k % 8) * 38, 330 + Math.floor(k / 8) * 36, 14, done1())) out.push(e);
  // − baked +
  out.push(<div className="pad" id="less" onClick={() => bake(-1)} style={{ left: 40, top: 414, width: 70, height: 60, backgroundColor: "#9a8c98" }}><div className="padtext">−</div></div>);
  out.push(<div className="big" style={{ left: 120, top: 414, width: width - 240, height: 60 }}>{String(baked)}</div>);
  out.push(<div className="pad" id="more" onClick={() => bake(1)} style={{ left: width - 110, top: 414, width: 70, height: 60, backgroundColor: "#06d6a0" }}><div className="padtext">+</div></div>);
  if (K.t - hintT < 5) out.push(PointAt(baked < d ? width - 75 : 75, 414, "#f77f00"));
  // the money of the day
  if (phase !== "set") {
    const p = PRICE * served - COST * baked;
    out.push(<div className="card" style={{ left: 16, top: 484, width: width - 32, height: 56 }} />);
    out.push(<div className="num" style={{ left: 16, top: 496, width: width - 32, height: 30, color: p >= 0 ? "#06a77d" : "#d62828" }}>{"+" + PRICE * served + " €  −" + COST * baked + " €  =  " + p + " €"}</div>);
  }
  out.push(RunButton(() => run5()));
  return out;
}

// ---- shared ----------------------------------------------------------------------------

function RunButton(f: () => void) {
  const y = height - 76;
  return <div className="pad" id="run" onClick={() => f()} style={{ left: 40, top: y, width: width - 80, height: 58, backgroundColor: phase === "run" ? "#adb5bd" : "#06d6a0" }}><div className="padtext">{phase === "run" ? "…" : "▶"}</div></div>;
}

function instruct() {
  rg.say(["tk_f_kokoa", "tk_f_tarkastaja", "tk_f_palaute", "tk_f_pullonkaula", "tk_f_kauppa"][K.level]);
}

function next() {
  hintT = -10; K.wait = 2.2;
  [next1, next2, next3, next4, next5][K.level]();
  instruct();
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) { let f = 0; while (f < need.length && slots[f] === need[f]) f++; rg.say("tk_f_vihje_" + need[Math.min(f, need.length - 1)]); }
  else if (K.level === 1) rg.say("tk_f_vihje_tarkastus");
  else if (K.level === 2) rg.say("tk_f_vihje_" + caught);
  else if (K.level === 3) rg.say("tk_f_vihje_jono");
  else rg.say("tk_f_vihje_kauppa");
}

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  if (K.level === 0) tick1(dt);
  else if (K.level === 1) tick2(dt);
  else if (K.level === 3) tick4(dt);
  else if (K.level === 4) tick5(dt);
}

function onBack() { phase = "set"; back(); }

function Play() {
  const out: any[] = [];
  const text = [rg.t("Laita robotit järjestykseen", "Put the robots in order", "Ordena los robots"), rg.t("Mitä tarkastaja katsoo?", "What does the inspector check?", "¿Qué revisa el inspector?"),
    rg.t("Kuka teki virheen?", "Who made the mistake?", "¿Quién se equivocó?"), rg.t("Missä keksit jonottavat?", "Where do the cookies pile up?", "¿Dónde se amontonan?"),
    rg.t("Montako keksiä leivotaan?", "How many cookies to bake?", "¿Cuántas galletas hornear?")][K.level];
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  const body = [Play1, Play2, Play3, Play4, Play5][K.level]();
  for (const e of body) out.push(e);
  return <div className="screen">{out}</div>;
}

setup(rg.t("Robottitehdas", "Robot factory", "Fábrica de robots"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu(Robot(36, 46, 0.32, COLOR.uuni, -1, "happy"));
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
