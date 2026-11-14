// Jakoavain: wrenches and nuts, seen from above, for 5-year-olds. Levels:
//   1 Säädä avain   turn the adjustable wrench's wheel until the jaws fit the
//                   nut (too wide slips, too narrow does not go on), then
//                   tighten with a few swings of the handle
//   2 Oikea avain   pick the open-end wrench whose mouth fits the nut
//   3 Kiinni, auki  tighten (clockwise) or loosen (counter-clockwise)
//
// A swing is a finger dragging the handle round the nut; after a sixth of a
// turn the wrench comes back for the next swing, as a real one has to.
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, TurnArrow, PointAt, turn, rect, ngon, Button } from "lib/kit";

const SIZES = [8, 10, 13, 17];          // mm
const PX = 5;                           // px a mm (the nut is drawn big)
const STROKE = Math.PI / 3;             // a swing

function picWrench(x: number, y: number, s: number, a: number, f: number) {
  const out: any[] = [];
  out.push(Poly(ngon(x - 40 * s, y, f / Math.sqrt(3) * s, 6, a), "#adb5bd", "#495057", 2));
  for (const e of Adjustable(x - 40 * s, y, f * s, f * s + 2, a, s)) out.push(e);
  return out;
}
const LEVELS: Level[] = [
  { name: rg.t("Säädä avain", "Adjust it", "Ajusta la llave"), color: "#118ab2", say: "rk_j_saada", pic: (x, y, s) => picWrench(x - 4 * s, y + 10 * s, s * 0.34, -0.5, 50) },
  { name: rg.t("Oikea avain", "Right wrench", "La llave justa"), color: "#2a9d8f", say: "rk_j_valitse", pic: (x, y, s) => OpenEnd(x - 24 * s, y + 30 * s, 10, -0.35, s * 0.34, false).concat(OpenEnd(x + 24 * s, y + 30 * s, 13, 0.35, s * 0.34, false)) },
  { name: rg.t("Kiinni, auki", "Tight, loose", "Apretar, aflojar"), color: "#f77f00", say: "rk_j_kirista", pic: (x, y, s) => picWrench(x - 4 * s, y + 4 * s, s * 0.34, 0, 50).concat(TurnArrow(x - 18 * s, y + 4 * s, 30 * s, 1, "#ffffff")) },
];

let size = 10;            // the nut, mm
let open = 60;            // the adjustable wrench's mouth, px
let phase = "adjust";     // "adjust", "pick", "turn", "end"
let dir = 1;
let strokes = 3, done = 0;
let wAng = 0;             // the wrench's angle in this swing
let nutAng = 0;
let backT = -10;          // the wrench coming back after a swing
let backFrom = 0;
let grab = "";
let lastA = 0, lastY = 0;
let wrongDeg = 0;
let hintT = -10;
let slipT = -10;
let choices: number[] = [];
let wrongCards: number[] = [];
let shakeCard = -1, shakeT = -10;
let fixed = 0;            // the open-end wrench in use (mm), 0: the adjustable one
let tickAcc = 0;

function C() { return { x: width * 0.32, y: height * 0.47 }; }
function flats(): number { return size * PX; }
function fits(): boolean { return fixed ? fixed === size : Math.abs(open - flats()) <= [7, 5, 3.5][step()]; }

function instruct() {
  if (phase === "adjust") rg.say("rk_j_saada");
  else if (phase === "pick") rg.say("rk_j_valitse");
  else rg.say(dir > 0 ? "rk_j_kirista" : "rk_j_avaa");
}

function next() {
  const s = step();
  dir = 1;
  done = 0;
  strokes = 3;
  wAng = 0;
  nutAng = rg.random() * 0.4;
  backT = -10;
  wrongDeg = 0;
  hintT = -10;
  slipT = -10;
  wrongCards = [];
  choices = [];
  fixed = 0;
  grab = "";
  const old = size;
  size = rg.pick(SIZES);
  if (size === old) size = rg.pick(SIZES);
  if (K.level === 0) {
    phase = "adjust";
    open = flats() + rg.pick([-1, 1]) * (18 + rg.random() * 20);
    open = Math.max(30, Math.min(100, open));
  } else if (K.level === 1) {
    phase = "pick";
    const n = [2, 3, 4][s];
    let pool = SIZES.filter((x) => x !== size);
    if (s === 0) pool = pool.filter((x) => Math.abs(x - size) >= 5);
    if (pool.length === 0) pool = SIZES.filter((x) => x !== size);
    choices = rg.shuffle([size].concat(rg.shuffle(pool).slice(0, n - 1)));
  } else {
    phase = "turn";
    open = flats();
    dir = s === 0 ? 1 : s === 1 ? -1 : rg.pick([1, -1]);
  }
  instruct();
}

// ---- playing ----------------------------------------------------------------------
function tryFit() {
  if (phase !== "adjust") return;
  if (fits()) {
    open = flats();
    phase = "turn";
    rg.sound("pop");
    rg.say(["rk_j_sopii", dir > 0 ? "rk_j_kirista" : "rk_j_avaa"]);
    return;
  }
  slipT = K.t;
  const n = miss();
  const big = open > flats();
  if (n >= 2) { hintT = K.t; rg.say([big ? "rk_j_liian_iso" : "rk_j_liian_pieni", "rk_j_vihje_saada"]); }
  else rg.say(big ? "rk_j_liian_iso" : "rk_j_liian_pieni");
}

function pickCard(i: number) {
  if (phase !== "pick" || wrongCards.indexOf(i) >= 0) return;
  if (choices[i] === size) {
    fixed = size;
    phase = "turn";
    rg.sound("pop");
    rg.say(["rk_j_sopii", "rk_j_kirista"]);
    return;
  }
  wrongCards.push(i);
  shakeCard = i; shakeT = K.t;
  const n = miss();
  const big = choices[i] > size;
  if (n >= 2) { hintT = K.t; rg.say([big ? "rk_j_liian_iso" : "rk_j_liian_pieni", "rk_j_vihje_valitse"]); }
  else rg.say(big ? "rk_j_liian_iso" : "rk_j_liian_pieni");
}

function wheelPos() {
  const c = C(), R = flats() / Math.sqrt(3);
  return { x: c.x + R + 34, y: c.y + open / 2 + 30 };
}

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0) return;
  if (phase === "adjust") {
    const w = wheelPos();
    if (Math.abs(x - w.x) < 60 && Math.abs(y - w.y) < 70) { grab = "wheel"; lastY = y; rg.sound("click"); }
    return;
  }
  if (phase !== "turn" || K.t - backT < 0.3 || y < 120) return;
  const c = C();
  grab = "turn";
  lastA = Math.atan2(y - c.y, x - c.x);
}

function drag(x: number, y: number) {
  if (grab === "wheel") {
    const d = y - lastY;
    lastY = y;
    const before = Math.round(open / 3);
    open = Math.max(28, Math.min(105, open + d * 0.45));
    if (Math.round(open / 3) !== before) rg.sound("tick", { volume: 0.4 });
    return;
  }
  if (grab !== "turn") return;
  const c = C();
  const a = Math.atan2(y - c.y, x - c.x);
  let da = a - lastA;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  lastA = a;
  if (Math.abs(da) > 1) return;
  if (da * dir < 0) {
    wrongDeg += Math.abs(da) * 180 / Math.PI;
    if (wrongDeg > 60) {
      wrongDeg = 0;
      const n = miss();
      hintT = K.t;
      rg.say(n >= 2 ? ["rk_toiseen_suuntaan", dir > 0 ? "rk_vihje_myota" : "rk_vihje_vasta"] : "rk_toiseen_suuntaan");
    }
    return;
  }
  wAng += da;
  nutAng += da;
  tickAcc += Math.abs(da);
  if (tickAcc > 0.25) { tickAcc = 0; rg.sound("tick", { volume: 0.5 }); }
  if (Math.abs(wAng) >= STROKE) {
    done++;
    rg.vibrate(20);
    grab = "";
    if (done >= strokes) { phase = "end"; win(C().x, C().y, [dir > 0 ? "rk_j_kiinni" : "rk_j_auki"]); return; }
    backT = K.t;
    backFrom = wAng;
    rg.sound("click");
  }
}

function onPointerUp() { grab = ""; }

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  if (grab && input && input.pointer) { if (input.pointer.down) drag(input.pointer.x, input.pointer.y); else grab = ""; }
  if (K.t - backT < 0.3) wAng = backFrom * (1 - (K.t - backT) / 0.3);
  else if (backT > 0 && K.t - backT < 0.4) wAng = 0;
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (phase === "adjust") rg.say("rk_j_vihje_saada");
  else if (phase === "pick") rg.say("rk_j_vihje_valitse");
  else rg.say(dir > 0 ? "rk_vihje_myota" : "rk_vihje_vasta");
}

function onBack() { grab = ""; back(); }

// ---- drawing -----------------------------------------------------------------------
// the adjustable wrench about the nut at (cx, cy): mouth `o` px, `f` the nut's
// width, turned by `a`, scale s (handle length)
function Adjustable(cx: number, cy: number, f: number, o: number, a: number, k: number) {
  const R = f / Math.sqrt(3);
  const shift = o < f - 1 ? (f - o) * 0.6 + 26 * k : 0;          // too narrow: it sits beside the nut
  const X = (v: number) => cx + v + shift;
  const T = (pts: number[][]) => turn(pts, cx, cy, a);
  const out: any[] = [];
  const top = cy - o / 2, bot = cy + o / 2;
  const head = [[X(R + 6 * k), top - 26 * k], [X(R + 64 * k), top - 18 * k], [X(R + 70 * k), bot + 40 * k], [X(R + 6 * k), bot + 40 * k]];
  out.push(Poly(T(head), "#ced4da", "#495057", 2));
  out.push(Poly(T([[X(R + 50 * k), cy - 13 * k], [X(R + 240 * k), cy - 10 * k], [X(R + 248 * k), cy], [X(R + 240 * k), cy + 10 * k], [X(R + 50 * k), cy + 13 * k]]), "#ced4da", "#495057", 2));
  out.push(Poly(T(rect(X(R + 90 * k), cy - 4 * k, 120 * k, 8 * k)), "#adb5bd"));
  out.push(Poly(T([[X(-R - 8 * k), top - 24 * k], [X(R + 10 * k), top - 26 * k], [X(R + 10 * k), top], [X(-R - 8 * k), top]]), "#dee2e6", "#495057", 2));  // fixed jaw
  out.push(Poly(T([[X(-R - 6 * k), bot], [X(R + 10 * k), bot], [X(R + 10 * k), bot + 22 * k], [X(-R - 2 * k), bot + 18 * k]]), "#e9ecef", "#495057", 2));  // moving jaw
  // the worm wheel with its ridges
  const wx = X(R + 26 * k), wy = bot + 22 * k;
  out.push(Poly(T(rect(wx - 14 * k, wy, 28 * k, 16 * k)), "#868e96", "#343a40", 1.5));
  for (let i = 0; i < 5; i++) {
    const yy = wy + ((i * 4 + open * 1.3) % 16) * k;
    out.push(Line(T([[wx - 14 * k, yy], [wx + 14 * k, yy]]), "#343a40", 1.5));
  }
  return out;
}

// an open-end wrench for `mm` with its mouth at (x, y), turned by a
function OpenEnd(x: number, y: number, mm: number, a: number, s: number, onNut: boolean) {
  const o = mm * PX * s, R = o / Math.sqrt(3);
  const T = (pts: number[][]) => turn(pts, x, y, a - Math.PI / 2 * (onNut ? 0 : 1));
  const out: any[] = [];
  const jaw = 16 * s + o * 0.25;
  out.push(Poly(T([[x - R - 4 * s, y - o / 2 - jaw], [x + R + 18 * s, y - o / 2 - jaw], [x + R + 30 * s, y], [x + R + 18 * s, y + o / 2 + jaw], [x - R - 4 * s, y + o / 2 + jaw], [x - R - 4 * s, y + o / 2], [x + R + 4 * s, y + o / 2], [x + R + 4 * s, y - o / 2], [x - R - 4 * s, y - o / 2]]), "#ced4da", "#495057", 2));
  out.push(Poly(T([[x + R + 26 * s, y - 9 * s], [x + R + 160 * s, y - 7 * s], [x + R + 160 * s, y + 7 * s], [x + R + 26 * s, y + 9 * s]]), "#ced4da", "#495057", 2));
  return out;
}

function Nut(cx: number, cy: number) {
  const f = flats(), R = f / Math.sqrt(3);
  const out: any[] = [];
  out.push(Circle(cx, cy, R + 14, "#6c757d"));                                           // the washer
  out.push(Poly(ngon(cx, cy, R, 6, nutAng), "#adb5bd", "#343a40", 3));
  out.push(Circle(cx, cy, f * 0.28, "#868e96", "#495057"));                              // the bolt's end
  out.push(Circle(cx + Math.cos(nutAng) * R * 0.66, cy + Math.sin(nutAng) * R * 0.66, 4, "#e63946"));
  return out;
}

function Cards() {
  const n = choices.length, cw = Math.min(80, (width - 30) / n - 8), ch = 150;
  const x0 = width / 2 - (n * (cw + 8) - 8) / 2, y = height - ch - 16;
  const out: any[] = [];
  choices.forEach((mm, i) => {
    const sh = shakeCard === i ? Math.sin((K.t - shakeT) * 50) * 10 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
    const x = x0 + i * (cw + 8) + sh;
    out.push(<div className={wrongCards.indexOf(i) >= 0 ? "card off" : "card"} style={{ left: x, top: y, width: cw, height: ch }} />);
    for (const e of OpenEnd(x + cw / 2, y + ch - 62, mm, 0, 0.5, false)) out.push(e);
    out.push(<div className="label" style={{ left: x, top: y + ch - 26, width: cw }}>{mm + " mm"}</div>);
    out.push(<div className="hit" id={"card" + i} onClick={() => pickCard(i)} style={{ left: x, top: y, width: cw, height: ch }} />);
  });
  return out;
}

function Play() {
  const c = C();
  const out: any[] = [];
  const text = phase === "adjust" ? rg.t("Säädä avain mutterin kokoiseksi", "Make the wrench fit the nut", "Ajusta la llave a la tuerca")
    : phase === "pick" ? rg.t("Mikä avain sopii?", "Which wrench fits?", "¿Qué llave encaja?")
    : dir > 0 ? rg.t("Kiristä mutteri", "Tighten the nut", "Aprieta la tuerca") : rg.t("Avaa mutteri", "Loosen the nut", "Afloja la tuerca");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  out.push(Box(0, c.y - 110, width, 220, "#8d99ae"));
  for (const e of Nut(c.x, c.y)) out.push(e);
  if (phase !== "pick") out.push(<div className="label" style={{ left: c.x - 40, top: c.y + flats() / 1.7 + 20, width: 80 }}>{size + " mm"}</div>);
  const hinting = K.t - hintT < 5;
  if (phase === "adjust" || (phase !== "pick" && !fixed)) {
    const wob = K.t - slipT < 0.6 ? Math.sin((K.t - slipT) * 40) * 0.15 * (1 - (K.t - slipT) / 0.6) : 0;
    for (const e of Adjustable(c.x, c.y, flats(), open, wAng + wob, 1)) out.push(e);
  }
  if (fixed) for (const e of OpenEnd(c.x, c.y, fixed, wAng, 1, true)) out.push(e);
  if (phase === "adjust") {
    const w = wheelPos();
    const up = open > flats();
    if (hinting || step() === 0) {
      // which way to turn the wheel, and the nut's width as two lines
      const yy = w.y + 8 + (up ? -1 : 1) * (40 + Math.abs(Math.sin(K.t * 4)) * 10);
      out.push(Poly(up ? [[w.x, yy - 16], [w.x - 14, yy + 4], [w.x + 14, yy + 4]] : [[w.x, yy + 16], [w.x - 14, yy - 4], [w.x + 14, yy - 4]], "#f77f00", "#ffffff", 2));
    }
    if (hinting) {
      out.push(Line([[c.x - 60, c.y - flats() / 2], [c.x + 60, c.y - flats() / 2]], "#06d6a0", 3));
      out.push(Line([[c.x - 60, c.y + flats() / 2], [c.x + 60, c.y + flats() / 2]], "#06d6a0", 3));
    }
    if (K.question === 0 && K.misses === 0) out.push(<div className="label" style={{ left: 20, top: height - 150, width: width - 40 }}>{rg.t("Vedä rullaa ylös tai alas", "Drag the wheel up or down", "Arrastra la rueda arriba o abajo")}</div>);
    out.push(Button("ready", rg.t("Kokeile ✓", "Try ✓", "Probar ✓"), width / 2 - 100, height - 100, 200, "#06d6a0", () => tryFit()));
  }
  if (phase === "pick") for (const e of Cards()) out.push(e);
  if (phase === "turn") {
    if (hinting || (K.level === 2 && step() < 2) || (K.question === 0 && done === 0)) for (const e of TurnArrow(c.x, c.y, flats() / 1.7 + 40, dir, "rgba(247,127,0,0.85)")) out.push(e);
    if (done === 0 && K.t - backT > 0.4) {
      const a = wAng + dir * 0.5, hx = c.x + Math.cos(a) * (flats() / 1.5 + 150), hy = c.y + Math.sin(a) * (flats() / 1.5 + 150);
      out.push(PointAt(Math.min(width - 24, hx), hy - 10, "#f77f00"));
    }
    // the swings: a dot each
    for (let i = 0; i < strokes; i++) out.push(Circle(width / 2 - (strokes - 1) * 18 + i * 36, height - 60, 12, i < done ? "#06d6a0" : "rgba(0,0,0,0.15)"));
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Jakoavain", "Wrench", "Llave inglesa"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
