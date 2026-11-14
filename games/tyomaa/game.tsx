// Työmaa: the building site, for 5-year-olds. Levels:
//   1 Lapio        shovel as many loads of sand into the wheelbarrow as the
//                  dots show (counting); later steps end with ✓, so the child
//                  has to stop at the right number
//   2 Betonimylly  put cement, sand and water in the mixer as the picture
//                  recipe says, run it, and pour the concrete into the mould
//   3 Kaivuri      move the excavator's arm to dig sand into the truck: first
//                  by tapping, then with a lever, then lever and bucket button
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, turn, rect, ngon, Button } from "lib/kit";

const SAND = "#e9c46a", SAND2 = "#d4a84f";

function picDigger(x: number, y: number, s: number) {
  return Excavator(x - 10 * s, y + 30 * s, s * 0.45, -0.7, 0.3, false);
}
const LEVELS: Level[] = [
  { name: rg.t("Lapio", "Shovel", "La pala"), color: "#f4a100", say: "rk_t_lapio", pic: (x, y, s) => [Poly(Mound(x + 10 * s, y + 34 * s, 50 * s, 34 * s), SAND)].concat(Shovel(x - 20 * s, y + 10 * s, s * 0.8, true)) },
  { name: rg.t("Betonimylly", "Mixer", "Hormigonera"), color: "#6c757d", say: "rk_t_mylly", pic: (x, y, s) => Mixer(x, y + 6 * s, s * 0.55, K.t, 0, 0) },
  { name: rg.t("Kaivuri", "Digger", "Excavadora"), color: "#e76f51", say: "rk_t_kaivuri", pic: (x, y, s) => picDigger(x, y, s) },
];

let phase = "play";
let want = 3, have = 0;
let grab = "";
let hand = { x: 0, y: 0 };
let carrying = "";
let hintT = -10;
let flyT = -10;
// the mixer
type Ing = { id: string; want: number; have: number };
let recipe: Ing[] = [];
let mixT = -10, pourT = -10, drum = 0, bounce = { id: "", t: -10 };
// the digger
let boom = -1.6;          // the arm's angle (radians, screen: 0 right, -π/2 up, -π left)
let goal = -1.6;          // where a tap sends it
let curl = false;         // the bucket closed (holding sand)
let full = false;         // sand in the bucket
let loads = 0;
let auto = "";            // step 0: "dig" or "dump" going on
let autoT = 0;
let spill = -10;

function GY() { return Math.round(height * 0.68); }

function instruct() {
  if (K.level === 0) rg.say(["rk_t_lapio_n", rg.sayId.number(want), want === 1 ? "rk_t_lapiollinen" : "rk_t_lapiollista"]);
  else if (K.level === 1) rg.say(phase === "fill" ? "rk_t_mylly" : phase === "mix" ? "rk_t_kaynnista" : "rk_t_kaada");
  else rg.say(step() === 0 ? "rk_t_kaivuri" : step() === 1 ? "rk_t_vipu" : "rk_t_kauha");
}

function next() {
  const s = step();
  hintT = -10;
  grab = "";
  carrying = "";
  have = 0;
  if (K.level === 0) {
    const r = [[1, 3], [2, 5], [3, 7]][s];
    want = rg.range(r[0], r[1]);
    phase = "play";
  } else if (K.level === 1) {
    recipe = [
      { id: "sementti", want: s === 2 ? rg.range(1, 2) : 1, have: 0 },
      { id: "hiekka", want: [2, rg.range(2, 3), rg.range(3, 4)][s], have: 0 },
      { id: "vesi", want: s === 0 ? 1 : rg.range(1, 2), have: 0 },
    ];
    phase = "fill";
    mixT = -10; pourT = -10;
  } else {
    want = 3;
    loads = 0;
    boom = -1.6; goal = -1.6;
    curl = false; full = false;
    auto = "";
    phase = "play";
  }
  instruct();
}

// ---- 1: shovel --------------------------------------------------------------------
function pilePos() { return { x: width - 90, y: GY() }; }
function barrowPos() { return { x: 100, y: GY() - 10 }; }

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0 || y < 120) return;
  if (K.level === 0) {
    const p = pilePos();
    if (Math.abs(x - p.x) < 90 && y > p.y - 90 && y < p.y + 20) { grab = "shovel"; carrying = "hiekka"; hand = { x, y }; rg.sound("whoosh", { volume: 0.3 }); }
    return;
  }
  if (K.level === 1 && phase === "fill") {
    recipe.forEach((r, i) => {
      const s = srcPos(i);
      if (Math.abs(x - s.x) < 44 && Math.abs(y - s.y) < 44) { grab = "ing"; carrying = r.id; hand = { x, y }; rg.sound("click"); }
    });
    return;
  }
  if (K.level === 2) {
    if (step() === 0) { tapDigger(x, y); return; }
    if (y > height - 110 && y < height - 40) { grab = "lever"; lever(x); }
  }
}

function dropShovel() {
  const b = barrowPos();
  if (Math.abs(hand.x - b.x) < 90 && Math.abs(hand.y - b.y) < 80) {
    have++;
    flyT = K.t;
    rg.sound("pop");
    rg.say(rg.sayId.number(have));
    if (have === want && step() === 0) win(b.x, b.y - 30, ["rk_t_valmis"]);
    else if (have > want && step() === 0) have = want;
  } else rg.sound("click");
}

function ready() {
  if (K.level !== 0 || K.solved >= 0) return;
  if (have === want) { win(barrowPos().x, barrowPos().y - 30, ["rk_t_valmis"]); return; }
  const n = miss();
  hintT = K.t;
  const why = have < want ? "rk_t_viela" : "rk_t_liikaa";
  if (have > want) have = want;
  rg.say(n >= 2 ? [why, "rk_t_vihje_lapio", rg.sayId.number(want)] : why);
}

// ---- 2: mixer ------------------------------------------------------------------------
function mixerPos() { return { x: width / 2 + 40, y: GY() - 90 }; }
function srcPos(i: number) { return { x: 50 + i * 0 , y: 170 + i * 92 }; }

function dropIng() {
  const m = mixerPos();
  if (Math.hypot(hand.x - m.x, hand.y - m.y) > 90) { rg.sound("click"); return; }
  const r = recipe.filter((q) => q.id === carrying)[0];
  if (r.have >= r.want) {
    bounce = { id: r.id, t: K.t };
    const n = miss();
    hintT = K.t;
    rg.say(n >= 2 ? ["rk_t_riittaa", "rk_t_vihje_mylly"] : "rk_t_riittaa");
    return;
  }
  r.have++;
  rg.sound(r.id === "vesi" ? "pop" : "hit", { volume: 0.6 });
  rg.say(rg.sayId.number(r.have));
  if (recipe.every((q) => q.have >= q.want)) { phase = "mix"; rg.say("rk_t_kaynnista"); }
}

function startMix() {
  if (phase !== "mix") return;
  phase = "mixing";
  mixT = K.t;
  rg.sound("whoosh");
}

function pour() {
  if (phase !== "pour") return;
  phase = "pouring";
  pourT = K.t;
  rg.sound("whoosh");
}

// ---- 3: digger ------------------------------------------------------------------------
const BOOM_L = 120, STICK_L = 70;
function base() { return { x: width / 2, y: GY() - 70 }; }
function tip(a: number) {
  const b = base();
  const ex = b.x + Math.cos(a) * BOOM_L, ey = b.y + Math.sin(a) * BOOM_L;
  const sa = a + (a > -Math.PI / 2 ? 1.25 : -1.25);
  return { x: ex + Math.cos(sa) * STICK_L, y: ey + Math.sin(sa) * STICK_L, ex, ey };
}
const PILE_A = -0.35, TRUCK_A = -2.75;
function atPile() { return Math.abs(boom - PILE_A) < 0.25; }
function atTruck() { return Math.abs(boom - TRUCK_A) < 0.3; }

function tapDigger(x: number, y: number) {
  if (auto) return;
  if (x > width / 2 && !full) { auto = "dig"; autoT = K.t; goal = PILE_A; rg.sound("click"); }
  else if (x < width / 2 && full) { auto = "dump"; autoT = K.t; goal = TRUCK_A; rg.sound("click"); }
  else if (x < width / 2 && !full) { const n = miss(); hintT = K.t; rg.say(n >= 2 ? ["rk_t_tyhja", "rk_t_vihje_kaivuri"] : "rk_t_tyhja"); }
  else { hintT = K.t; rg.say("rk_t_vie_autoon"); }
}

function lever(x: number) {
  const k = Math.max(0, Math.min(1, (x - 40) / (width - 80)));
  goal = TRUCK_A + (PILE_A - TRUCK_A) * k;
}

function bucket() {
  if (K.level !== 2 || step() < 2 || K.solved >= 0) return;
  if (!curl) {
    curl = true;
    if (atPile()) { full = true; rg.sound("hit"); rg.say("rk_t_kauha_taynna"); }
    else rg.sound("click");
    return;
  }
  curl = false;
  if (full && atTruck()) { dumped(); return; }
  if (full) {
    full = false;
    spill = K.t;
    const n = miss();
    hintT = K.t;
    rg.say(n >= 2 ? ["rk_t_valui", "rk_t_vihje_kaivuri"] : "rk_t_valui");
  } else rg.sound("click");
}

function dumped() {
  full = false;
  loads++;
  flyT = K.t;
  rg.sound("pop");
  rg.say(rg.sayId.number(loads));
  if (loads >= want) win(70, GY() - 60, ["rk_t_auto_taynna"]);
}

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  const p = input && input.pointer;
  if (grab && p) {
    if (p.down) { hand = { x: p.x, y: p.y }; if (grab === "lever") lever(p.x); }
    else { if (grab === "shovel") dropShovel(); if (grab === "ing") dropIng(); grab = ""; carrying = ""; }
  }
  if (K.level === 1) {
    if (phase === "mixing") { drum += dt * 6; if (K.t - mixT > 2.2) { phase = "pour"; rg.say("rk_t_kaada"); } }
    if (phase === "pouring" && K.t - pourT > 1.6) { phase = "end"; win(width / 2 - 60, GY() + 20, ["rk_t_betoni_valmis"]); }
  }
  if (K.level === 2) {
    const sp = 2.2 * dt;
    boom += Math.max(-sp, Math.min(sp, goal - boom));
    if (step() === 0 && auto) {
      if (auto === "dig" && Math.abs(boom - goal) < 0.02) { if (!curl) { curl = true; full = true; rg.sound("hit"); autoT = K.t; } else if (K.t - autoT > 0.4) { goal = -1.6; auto = ""; } }
      if (auto === "dump" && Math.abs(boom - goal) < 0.02) { curl = false; dumped(); auto = ""; goal = -1.6; }
    }
    if (step() === 1) {
      if (!full && atPile()) { curl = true; full = true; rg.sound("hit"); }
      if (full && atTruck()) { curl = false; dumped(); }
      if (!full && !atPile()) curl = false;
    }
  }
}

function onPointerUp() {
  if (grab === "shovel") dropShovel();
  if (grab === "ing") dropIng();
  grab = "";
  carrying = "";
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) rg.say(["rk_t_vihje_lapio", rg.sayId.number(want)]);
  else if (K.level === 1) rg.say(phase === "fill" ? "rk_t_vihje_mylly" : phase === "mix" ? "rk_t_kaynnista" : "rk_t_kaada");
  else rg.say("rk_t_vihje_kaivuri");
}

function onBack() { grab = ""; back(); }

// ---- drawing ------------------------------------------------------------------------
function Mound(cx: number, by: number, w: number, h: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([cx - w + 2 * w * t, by - Math.sin(t * Math.PI) * h]); }
  return pts;
}

function Shovel(x: number, y: number, s: number, sand: boolean) {
  // the blade at (x, y), the handle up to the right
  const out: any[] = [Line([[x + 6 * s, y - 8 * s], [x + 60 * s, y - 70 * s]], "#8d5524", 6 * s)];
  out.push(Poly([[x - 18 * s, y - 6 * s], [x + 14 * s, y - 14 * s], [x + 18 * s, y + 12 * s], [x - 2 * s, y + 24 * s], [x - 18 * s, y + 14 * s]], "#6c757d", "#343a40", 1.5));
  if (sand) out.push(Poly(Mound(x, y - 6 * s, 18 * s, 12 * s), SAND));
  out.push(Line([[x + 54 * s, y - 76 * s], [x + 68 * s, y - 64 * s]], "#343a40", 6 * s));
  return out;
}

function Barrow(x: number, y: number, n: number) {
  const out: any[] = [];
  const f = Math.min(1, n / 8);
  out.push(Circle(x + 40, y + 34, 16, "#343a40"));
  out.push(Line([[x - 50, y + 8], [x - 90, y - 4]], "#8d5524", 7));
  out.push(Line([[x - 40, y + 20], [x - 46, y + 44]], "#495057", 5));
  if (n > 0) out.push(Poly(Mound(x, y - 30, 56 * (0.5 + f / 2), 8 + 24 * f), SAND));
  out.push(Poly([[x - 60, y - 34], [x + 62, y - 34], [x + 44, y + 20], [x - 44, y + 20]], "#2a9d8f", "#1b6b62", 2));
  return out;
}

function Ingredient(id: string, x: number, y: number, s: number) {
  if (id === "sementti") return [Poly([[x - 26 * s, y - 30 * s], [x + 26 * s, y - 30 * s], [x + 30 * s, y + 30 * s], [x - 30 * s, y + 30 * s]], "#adb5bd", "#495057", 2), <div className="label" style={{ left: x - 30 * s, top: y - 10 * s, width: 60 * s, fontSize: 13 * s }}>CEM</div>];
  if (id === "hiekka") return [Poly(Mound(x, y + 26 * s, 34 * s, 40 * s), SAND, SAND2, 2)];
  return [Poly([[x - 24 * s, y - 24 * s], [x + 24 * s, y - 24 * s], [x + 18 * s, y + 28 * s], [x - 18 * s, y + 28 * s]], "#118ab2", "#073b4c", 2), Poly(rect(x - 22 * s, y - 24 * s, 44 * s, 10 * s), "#8ecae6")];
}

function Mixer(x: number, y: number, s: number, rot: number, tilt: number, fill: number) {
  const out: any[] = [];
  out.push(Poly([[x - 50 * s, y + 70 * s], [x - 30 * s, y + 10 * s], [x + 30 * s, y + 10 * s], [x + 50 * s, y + 70 * s], [x + 40 * s, y + 70 * s], [x, y + 20 * s], [x - 40 * s, y + 70 * s]], "#495057"));
  out.push(Circle(x - 44 * s, y + 74 * s, 10 * s, "#343a40"));
  const drumPts = turn([[x - 40 * s, y - 40 * s], [x + 20 * s, y - 56 * s], [x + 56 * s, y - 30 * s], [x + 56 * s, y + 20 * s], [x + 20 * s, y + 40 * s], [x - 40 * s, y + 26 * s]], x, y, -tilt);
  out.push(Poly(drumPts, "#f77f00", "#b5540a", 2));
  for (let i = 0; i < 3; i++) {
    const k = ((rot * 0.5 + i / 3) % 1);
    const xx = x - 30 * s + k * 80 * s;
    out.push(Line(turn([[xx, y - 46 * s + k * 10 * s], [xx + 8 * s, y + 30 * s - k * 6 * s]], x, y, -tilt), "#ffd166", 4 * s));
  }
  const mouth = turn([[x + 56 * s, y - 30 * s], [x + 70 * s, y - 24 * s], [x + 70 * s, y + 14 * s], [x + 56 * s, y + 20 * s]], x, y, -tilt);
  out.push(Poly(mouth, "#343a40"));
  if (fill > 0) out.push(Poly(turn(rect(x + 58 * s, y - 20 * s, 10 * s, 30 * s * fill), x, y, -tilt), "#8d99ae"));
  return out;
}

function Excavator(x: number, gy: number, s: number, a: number, cl: number, sand: boolean) {
  // x, gy: the tracks' middle on the ground; a: the arm's angle; cl: bucket closed 0..1
  const out: any[] = [];
  const bx = x, by = gy - 70 * s;
  out.push(Box(x - 70 * s, gy - 26 * s, 140 * s, 26 * s, "#343a40", 13 * s));
  for (let i = 0; i < 5; i++) out.push(Circle(x - 52 * s + i * 26 * s, gy - 13 * s, 7 * s, "#6c757d"));
  out.push(Poly(rect(x - 56 * s, gy - 66 * s, 112 * s, 40 * s), "#ffb703", "#b5540a", 2));
  out.push(Poly(rect(x - 50 * s, gy - 110 * s, 52 * s, 46 * s), "#ffb703", "#b5540a", 2));
  out.push(Poly(rect(x - 44 * s, gy - 104 * s, 40 * s, 26 * s), "#8ecae6"));
  // the arm
  const ex = bx + Math.cos(a) * BOOM_L * s, ey = by + Math.sin(a) * BOOM_L * s;
  const sa = a + (a > -Math.PI / 2 ? 1.25 : -1.25);
  const tx = ex + Math.cos(sa) * STICK_L * s, ty = ey + Math.sin(sa) * STICK_L * s;
  out.push(Line([[bx, by], [ex, ey]], "#f4a100", 14 * s));
  out.push(Line([[ex, ey], [tx, ty]], "#e09f00", 10 * s));
  out.push(Circle(ex, ey, 6 * s, "#343a40"));
  // the bucket: a scoop that turns open or closed
  const side = a > -Math.PI / 2 ? 1 : -1;
  const ba = sa + side * (0.4 + cl * 1.6);
  const bucket = turn([[tx, ty], [tx + 30 * s, ty - 4 * s], [tx + 34 * s, ty + 22 * s], [tx + 6 * s, ty + 30 * s]], tx, ty, ba - Math.PI / 2 * side);
  out.push(Poly(bucket, "#495057", "#212529", 1.5));
  if (sand) out.push(Circle((bucket[1][0] + bucket[3][0]) / 2, (bucket[1][1] + bucket[3][1]) / 2, 12 * s, SAND));
  return out;
}

function Truck(x: number, gy: number, n: number) {
  const out: any[] = [];
  out.push(Circle(x - 40, gy - 14, 14, "#343a40"));
  out.push(Circle(x + 40, gy - 14, 14, "#343a40"));
  if (n > 0) out.push(Poly(Mound(x - 10, gy - 70, 46, 6 + n * 9), SAND));
  out.push(Poly(rect(x - 70, gy - 70, 110, 44), "#e63946", "#9d0208", 2));
  out.push(Poly(rect(x + 40, gy - 76, 34, 50), "#e63946", "#9d0208", 2));
  out.push(Poly(rect(x + 46, gy - 70, 22, 18), "#8ecae6"));
  return out;
}

function Play() {
  const out: any[] = [];
  const gy = GY();
  const text = K.level === 0 ? rg.t("Lapioi ", "Shovel ", "Echa ") + want + rg.t(" lapiollista", " loads", " paladas")
    : K.level === 1 ? (phase === "fill" ? rg.t("Tee betonia", "Make concrete", "Haz hormigón") : phase === "mix" || phase === "mixing" ? rg.t("Käynnistä mylly ▶", "Start the mixer ▶", "Arranca ▶") : rg.t("Kaada muottiin", "Pour into the mould", "Vierte en el molde"))
    : rg.t("Täytä auto hiekalla", "Fill the truck with sand", "Llena el camión de arena");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  out.push(Box(0, gy, width, height - gy, "#a7c957"));
  out.push(Box(0, gy, width, 10, "#6a994e"));
  const hinting = K.t - hintT < 5;
  if (K.level === 0) {
    const p = pilePos(), b = barrowPos();
    out.push(Poly(Mound(p.x, p.y, 90, 80), SAND, SAND2, 2));
    for (const e of Barrow(b.x, b.y, have)) out.push(e);
    // the dots: how many loads
    for (let i = 0; i < want; i++) out.push(Circle(width / 2 - (want - 1) * 17 + i * 34, 150, 13, i < have ? "#06d6a0" : "#ffffff", "#2a9d8f"));
    if (grab === "shovel") for (const e of Shovel(hand.x, hand.y, 1, true)) out.push(e);
    else for (const e of Shovel(p.x - 20, p.y - 60, 1, false)) out.push(e);
    if (!grab && have === 0 && (K.question === 0 || hinting)) out.push(PointAt(p.x - 10, p.y - 90, "#f77f00"));
    if (grab) out.push(PointAt(b.x, b.y - 70, "#06d6a0"));
    if (step() > 0) out.push(Button("ready", "✓", width / 2 - 60, height - 90, 120, "#06d6a0", () => ready()));
    out.push(<div className="big" style={{ left: b.x - 40, top: gy + 40, width: 80 }}>{String(have)}</div>);
  }
  if (K.level === 1) {
    const m = mixerPos();
    // the mould
    const pf = phase === "pouring" ? Math.min(1, (K.t - pourT) / 1.4) : phase === "end" ? 1 : 0;
    out.push(Poly(rect(m.x - 170, gy - 10, 110, 40), "#8d5524"));
    if (pf > 0) out.push(Box(m.x - 164, gy + 26 - 30 * pf, 98, 30 * pf, "#8d99ae", 2));
    if (phase === "pouring") out.push(Line([[m.x - 90, gy - 60], [m.x - 110, gy + 20 - 30 * pf]], "#8d99ae", 8));
    const tilt = phase === "pouring" || phase === "end" ? Math.min(1.1, (K.t - pourT) * 2) : 0;
    for (const e of Mixer(m.x, m.y, 1, drum, -tilt, 0)) out.push(e);
    // the recipe: each ingredient, its dots, and the place to drag it from
    recipe.forEach((r, i) => {
      const s = srcPos(i);
      const bx = bounce.id === r.id ? Math.sin((K.t - bounce.t) * 40) * 8 * Math.max(0, 1 - (K.t - bounce.t) / 0.5) : 0;
      out.push(<div className="card" style={{ left: 8, top: s.y - 44, width: 96, height: 86 }} />);
      if (!(grab === "ing" && carrying === r.id)) for (const e of Ingredient(r.id, s.x + bx, s.y - 6, 0.8)) out.push(e);
      for (let k = 0; k < r.want; k++) out.push(Circle(26 + k * 18, s.y + 30, 7, k < r.have ? "#06d6a0" : "#dee2e6", "#2a9d8f"));
      if (hinting && r.have < r.want && phase === "fill") out.push(PointAt(s.x + 40, s.y - 20, "#f77f00"));
    });
    if (grab === "ing") for (const e of Ingredient(carrying, hand.x, hand.y, 0.8)) out.push(e);
    if (phase === "mix") { out.push(Button("go", "▶", width / 2 - 60, height - 90, 120, "#06d6a0", () => startMix())); out.push(PointAt(width / 2, height - 96, "#06d6a0")); }
    if (phase === "pour") { out.push(Button("pour", rg.t("Kaada", "Pour", "Vierte"), width / 2 - 70, height - 90, 140, "#f77f00", () => pour())); out.push(PointAt(width / 2, height - 96, "#f77f00")); }
    if (K.question === 0 && phase === "fill" && recipe.every((q) => q.have === 0)) out.push(<div className="label" style={{ left: 110, top: height - 70, width: width - 130 }}>{rg.t("Vedä myllyyn", "Drag into the mixer", "Arrastra a la hormigonera")}</div>);
  }
  if (K.level === 2) {
    out.push(Poly(Mound(width - 50, gy, 70, 70), SAND, SAND2, 2));
    for (const e of Truck(62, gy + 6, loads)) out.push(e);
    const cl = curl ? 1 : 0;
    for (const e of Excavator(width / 2 + 24, gy + 6, 0.85, boom, cl, full)) out.push(e);
    if (K.t - spill < 1) { const t = tip(boom); out.push(Poly(Mound(t.x, gy, 20, 10), SAND)); }
    for (let i = 0; i < want; i++) out.push(Circle(width / 2 - (want - 1) * 17 + i * 34, 150, 13, i < loads ? "#06d6a0" : "#ffffff", "#e76f51"));
    if (step() === 0) {
      if (!auto && (K.question === 0 || hinting)) out.push(full ? PointAt(70, gy - 90, "#06d6a0") : PointAt(width - 50, gy - 80, "#f77f00"));
    } else {
      // the lever: left = the truck, right = the sand
      const k = (boom - TRUCK_A) / (PILE_A - TRUCK_A);
      out.push(Box(40, height - 86, width - 80, 22, "rgba(0,0,0,0.18)", 11));
      out.push(<div className="label" style={{ left: 10, top: height - 116, width: 60 }}>🚚</div>);
      out.push(<div className="label" style={{ left: width - 70, top: height - 116, width: 60 }}>⛰️</div>);
      out.push(Circle(40 + (width - 80) * Math.max(0, Math.min(1, k)), height - 75, 26, "#e76f51", "#ffffff"));
      if (step() === 2) out.push(Button("bucket", curl ? rg.t("Kauha auki", "Open", "Abrir") : rg.t("Kauha kiinni", "Scoop", "Cerrar"), width / 2 - 90, 186, 180, curl ? "#118ab2" : "#e76f51", () => bucket()));
      if (hinting) out.push(full ? PointAt(60, height - 100, "#06d6a0") : PointAt(width - 60, height - 100, "#f77f00"));
    }
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Työmaa", "Building site", "La obra"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
