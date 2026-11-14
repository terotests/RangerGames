// Pora: the drill, for 5-year-olds. Levels:
//   1 Oikea terä    pick the bit as thick as the wall plug
//   2 Kiinnitä terä put the bit in the chuck and turn the chuck tight; a
//                   loose bit wobbles (last step: pick the bit first)
//   3 Poraa         hold the button to drill and let go when the tape on the
//                   bit touches the wood (the tape trick for the right depth)
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, TurnArrow, PointAt, rect } from "lib/kit";

const BITS = [4, 6, 8, 10];   // mm
const MM = 3.2;               // px a mm, for the bits

const LEVELS: Level[] = [
  { name: rg.t("Oikea terä", "Right bit", "La broca"), color: "#118ab2", say: "rk_p_valitse", pic: (x, y, s) => Bit(x - 20 * s, y - 40 * s, 8, 80 * s, s).concat(Plug(x + 22 * s, y - 20 * s, 8, s)) },
  { name: rg.t("Kiinnitä terä", "Fit the bit", "Pon la broca"), color: "#f77f00", say: "rk_p_kiinnita", pic: (x, y, s) => Drill(x - 10 * s, y + 4 * s, s * 0.55, 0).concat(Bit(x - 10 * s, y + 4 * s, 6, 40 * s, s)) },
  { name: rg.t("Poraa", "Drill", "Taladra"), color: "#2a9d8f", say: "rk_p_poraa", pic: (x, y, s) => [Box(x - 50 * s, y + 20 * s, 100 * s, 20 * s, "#d39150", 4)].concat(Drill(x - 10 * s, y - 6 * s, s * 0.5, 0)).concat(Bit(x - 10 * s, y - 6 * s, 6, 30 * s, s)) },
];

let size = 6;
let choices: number[] = [];
let wrong: number[] = [];
let shake = -1, shakeT = -10;
let phase = "pick";       // "pick", "fit", "tighten", "drill", "end"
let bit = 6;
let bitPos = { x: 0, y: 0 };
let grab = "";
let tight = 0;            // turns of the chuck done
let lastA = 0;
let wobT = -10;
let hintT = -10;
let depth = 0, tape = 40, holding = false, dust: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
let tickAcc = 0;

function drillAt() { return { x: width / 2, y: Math.round(height * 0.42) }; }
function WY() { return Math.round(height * 0.62); }      // the wood's top (drilling)

function instruct() {
  if (phase === "pick") rg.say("rk_p_valitse");
  else if (phase === "fit") rg.say("rk_p_kiinnita");
  else if (phase === "tighten") rg.say("rk_p_kirista");
  else if (phase === "drill") rg.say("rk_p_poraa");
}

function next() {
  const s = step();
  wrong = [];
  hintT = -10;
  wobT = -10;
  grab = "";
  tight = 0;
  depth = 0;
  holding = false;
  dust = [];
  size = rg.pick(BITS);
  bit = size;
  if (K.level === 0 || (K.level === 1 && s === 2)) {
    const n = K.level === 0 ? [2, 3, 4][s] : 2;
    let pool = BITS.filter((b) => b !== size);
    if (K.level === 0 && s === 0) { const far = pool.filter((b) => Math.abs(b - size) >= 4); if (far.length) pool = far; }
    choices = rg.shuffle([size].concat(rg.shuffle(pool).slice(0, n - 1)));
    phase = "pick";
  } else if (K.level === 1) phase = "fit";
  else { phase = "drill"; tape = [30, 40, 50][rg.range(0, 2)]; }
  bitPos = { x: 70, y: height - 150 };
  instruct();
}

// ---- playing ----------------------------------------------------------------------
function pickBit(i: number) {
  if (phase !== "pick" || wrong.indexOf(i) >= 0) return;
  if (choices[i] === size) {
    if (K.level === 0) { win(width / 2, 300, ["rk_p_sopii"]); phase = "end"; return; }
    phase = "fit";
    rg.sound("pop");
    rg.say("rk_p_kiinnita");
    return;
  }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  const why = choices[i] < size ? "rk_p_liian_ohut" : "rk_p_liian_paksu";
  if (n >= 2) { hintT = K.t; rg.say([why, "rk_p_vihje_valitse"]); } else rg.say(why);
}

function buttonHit(x: number, y: number) { return Math.hypot(x - width / 2, y - (height - 80)) < 56; }

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0) return;
  const d = drillAt();
  if (phase === "fit" && Math.abs(x - bitPos.x) < 40 && Math.abs(y - bitPos.y) < 70) { grab = "bit"; rg.sound("click"); return; }
  if (phase === "tighten") {
    if (buttonHit(x, y)) { pressEarly(); return; }
    if (Math.hypot(x - d.x, y - (d.y - 20)) < 110) { grab = "chuck"; lastA = Math.atan2(y - (d.y - 20), x - d.x); }
    return;
  }
  if (phase === "drill" && buttonHit(x, y)) { holding = true; }
}

function pressEarly() {
  wobT = K.t;
  const n = miss();
  hintT = K.t;
  rg.say(n >= 2 ? ["rk_p_heiluu", "rk_p_kirista"] : "rk_p_heiluu");
}

function drop() {
  if (grab === "bit") {
    const d = drillAt();
    if (Math.abs(bitPos.x - d.x) < 50 && Math.abs(bitPos.y - d.y) < 70) { phase = "tighten"; rg.sound("pop"); rg.say("rk_p_kirista"); }
    else bitPos = { x: 70, y: height - 150 };
  }
  grab = "";
}

function release() {
  if (!holding) return;
  holding = false;
  const tol = [7, 5, 4][step()];
  if (depth < tape - tol) { if (depth > 3) rg.say("rk_p_syvemmalle"); return; }
  if (depth <= tape + tol) { phase = "end"; win(width / 2, WY(), ["rk_p_reika"]); return; }
  const n = miss();
  hintT = K.t;
  rg.say(n >= 2 ? ["rk_p_liian_syva", "rk_p_vihje_poraa"] : "rk_p_liian_syva");
  depth = 0;
}

function onPointerUp() { drop(); release(); }

function tick(dt: number, input: any) {
  update(dt);
  for (const q of dust) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * dt; }
  dust = dust.filter((q) => q.t < 0.9);
  if (K.mode !== "play") return;
  const p = input && input.pointer;
  if (grab === "bit" && p) { if (p.down) bitPos = { x: p.x, y: p.y }; else drop(); }
  if (grab === "chuck" && p) {
    if (!p.down) { grab = ""; return; }
    const d = drillAt();
    const a = Math.atan2(p.y - (d.y - 20), p.x - d.x);
    let da = a - lastA;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    lastA = a;
    if (Math.abs(da) < 1 && da > 0) {
      tight += da / (Math.PI * 2);
      tickAcc += da;
      if (tickAcc > 0.4) { tickAcc = 0; rg.sound("tick", { volume: 0.5 }); }
      if (tight >= 1) { grab = ""; phase = "end"; win(d.x, d.y, ["rk_p_kiinni"]); }
    }
  }
  if (phase === "drill") {
    if (holding && p && !p.down) release();
    if (holding) {
      depth += [34, 46, 60][step()] * dt;
      rg.vibrate(15);
      if (rg.random() < 0.6) dust.push({ x: width / 2, y: WY(), vx: (rg.random() - 0.5) * 160, vy: -60 - rg.random() * 80, t: 0 });
      if (rg.random() < 0.25) rg.sound("tick", { volume: 0.3, pitch: 1.6 });
      if (depth > 75) release();
    }
  }
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (phase === "pick") rg.say("rk_p_vihje_valitse");
  else if (phase === "drill") rg.say("rk_p_vihje_poraa");
  else instruct();
}

function onBack() { grab = ""; holding = false; back(); }

// ---- drawing -------------------------------------------------------------------------
// a bit hanging from (x, y), `mm` thick, `len` long, with the tape `tapeAt` px up from its tip
function Bit(x: number, y: number, mm: number, len: number, s: number, tapeAt?: number, wob?: number) {
  const w = mm * MM * s, out: any[] = [];
  const a = wob || 0;
  const pts = [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + len - w * 0.8], [x, y + len], [x - w / 2, y + len - w * 0.8]].map((q) => [x + (q[0] - x) * Math.cos(a) - (q[1] - y) * Math.sin(a), y + (q[0] - x) * Math.sin(a) + (q[1] - y) * Math.cos(a)]);
  out.push(Poly(pts, "#adb5bd", "#495057", 1.5));
  if (!a) for (let yy = y + 10 * s; yy < y + len - w; yy += 9 * s) out.push(Line([[x - w / 2, yy], [x + w / 2, yy + 5 * s]], "#6c757d", 1.5));
  if (tapeAt !== undefined) out.push(Box(x - w / 2 - 2, y + len - tapeAt - 6, w + 4, 12, "#ef476f", 2));
  return out;
}

function Plug(x: number, y: number, mm: number, s: number) {
  const w = mm * MM * s, h = 46 * s;
  const out: any[] = [Poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2 - 1, y + h], [x - w / 2 + 1, y + h]], "#06d6a0", "#047857", 1.5)];
  for (let i = 1; i < 5; i++) out.push(Line([[x - w / 2, y + i * h / 5], [x + w / 2, y + i * h / 5]], "#047857", 1));
  out.push(Box(x - w / 2 - 3 * s, y - 4 * s, w + 6 * s, 5 * s, "#047857", 2));
  return out;
}

// the drill, pointing down, the chuck's mouth at (x, y)
function Drill(x: number, y: number, s: number, shake: number) {
  const dx = shake;
  const out: any[] = [];
  out.push(Poly(rect(x - 16 * s + dx, y - 44 * s, 32 * s, 44 * s), "#343a40"));                        // chuck
  for (let i = 0; i < 4; i++) out.push(Line([[x - 16 * s + dx, y - (8 + i * 10) * s], [x + 16 * s + dx, y - (8 + i * 10) * s]], "#6c757d", 2));
  out.push(Poly([[x - 40 * s + dx, y - 110 * s], [x + 110 * s + dx, y - 110 * s], [x + 110 * s + dx, y - 44 * s], [x - 40 * s + dx, y - 44 * s]], "#f77f00", "#b5540a", 2));   // body
  out.push(Poly([[x + 50 * s + dx, y - 44 * s], [x + 90 * s + dx, y - 44 * s], [x + 96 * s + dx, y + 40 * s], [x + 58 * s + dx, y + 40 * s]], "#343a40"));                    // handle
  out.push(Poly(rect(x + 44 * s + dx, y + 40 * s, 64 * s, 28 * s), "#118ab2", "#073b4c", 2));         // battery
  out.push(Poly(rect(x + 40 * s + dx, y - 40 * s, 10 * s, 18 * s), "#e63946"));                        // trigger
  return out;
}

function Cards() {
  const n = choices.length, cw = 70, ch = 150;
  const x0 = width / 2 - (n * (cw + 10) - 10) / 2, y = height - ch - 16;
  const out: any[] = [];
  choices.forEach((mm, i) => {
    const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
    const x = x0 + i * (cw + 10) + sh;
    out.push(<div className={wrong.indexOf(i) >= 0 ? "card off" : K.solved >= 0 && mm === size ? "card ok" : "card"} style={{ left: x, top: y, width: cw, height: ch }} />);
    for (const e of Bit(x + cw / 2, y + 14, mm, ch - 54, 1)) out.push(e);
    out.push(<div className="label" style={{ left: x, top: y + ch - 28, width: cw }}>{mm + " mm"}</div>);
    out.push(<div className="hit" id={"bit" + i} onClick={() => pickBit(i)} style={{ left: x, top: y, width: cw, height: ch }} />);
  });
  return out;
}

function Play() {
  const out: any[] = [];
  const text = phase === "pick" ? rg.t("Mikä terä sopii tulppaan?", "Which bit fits the plug?", "¿Qué broca para el taco?")
    : phase === "fit" ? rg.t("Vie terä istukkaan", "Put the bit in the chuck", "Pon la broca en el portabrocas")
    : phase === "tighten" ? rg.t("Kiristä istukka", "Tighten the chuck", "Aprieta el portabrocas")
    : K.level === 2 ? rg.t("Poraa teippiin asti", "Drill down to the tape", "Taladra hasta la cinta")
    : rg.t("Hienoa!", "Great!", "¡Genial!");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  const hinting = K.t - hintT < 5;
  const d = drillAt();
  if (phase === "pick" || (K.level === 0)) {
    // the plug, big, in the wall
    const px = width / 2, py = 170;
    out.push(Box(px - 90, py - 20, 180, 120, "#e9ecef", 8));
    for (const e of Plug(px, py, size, 1.6)) out.push(e);
    if (hinting) {
      const w = size * MM * 1.6;
      out.push(Line([[px - w / 2, py - 30], [px - w / 2, height - 40]], "rgba(6,214,160,0.7)", 2));
      out.push(Line([[px + w / 2, py - 30], [px + w / 2, height - 40]], "rgba(6,214,160,0.7)", 2));
    }
    if (phase === "pick") for (const e of Cards()) out.push(e);
  }
  if (K.level === 1 && phase !== "pick") {
    const wob = phase === "tighten" && K.t - wobT < 1 ? Math.sin((K.t - wobT) * 30) * 0.25 * (1 - (K.t - wobT)) : 0;
    for (const e of Drill(d.x, d.y, 1, 0)) out.push(e);
    if (phase === "fit") {
      out.push(Circle(d.x, d.y + 30, 26 + Math.sin(K.t * 5) * 4, "rgba(247,127,0,0.25)"));
      for (const e of Bit(bitPos.x, bitPos.y - 50, bit, 110, 1)) out.push(e);
      if (!grab) out.push(PointAt(bitPos.x, bitPos.y - 60, "#f77f00"));
    } else {
      for (const e of Bit(d.x, d.y - 6, bit, 110, 1, undefined, wob)) out.push(e);
      // the chuck's ring turns
      out.push(Circle(d.x + Math.cos(tight * Math.PI * 2) * 12, d.y - 22, 4, "#ffd166"));
      if (phase === "tighten") for (const e of TurnArrow(d.x, d.y - 22, 70, 1, "rgba(247,127,0,0.85)")) out.push(e);
      if (phase === "tighten") {
        out.push(Box(40, height - 170, width - 80, 12, "rgba(0,0,0,0.12)", 6));
        out.push(Box(40, height - 170, Math.max(12, (width - 80) * Math.min(1, tight)), 12, "#06d6a0", 6));
        out.push(<div className="btn" id="trigger" style={{ left: width / 2 - 50, top: height - 130, width: 100, height: 100, borderRadius: 50, backgroundColor: "#9be3c8" }}><div className="btext">▶</div></div>);
      }
    }
  }
  if (K.level === 2) {
    const wy = WY();
    out.push(Box(10, wy, width - 20, 70, "#d39150", 6));
    out.push(Line([[20, wy + 24], [width - 20, wy + 20]], "#b5733a", 2));
    const len = 110, top = wy - len + depth;
    for (const e of Drill(width / 2, top, 0.9, holding ? Math.sin(K.t * 60) * 1.5 : 0)) out.push(e);
    for (const e of Bit(width / 2, top, 6, len, 1, tape)) out.push(e);
    // the wood again over the bit, with the hole drilled so far
    out.push(Box(10, wy, width - 20, 70, "#d39150", 6));
    out.push(Line([[20, wy + 24], [width - 20, wy + 20]], "#b5733a", 2));
    if (depth > 0) out.push(Box(width / 2 - 10, wy, 20, Math.min(66, depth), "#5c3a17", 3));
    for (const q of dust) out.push(Box(q.x, q.y, 4, 4, "#e9c46a", 1));
    if (hinting) out.push(Line([[width / 2 - 60, wy], [width / 2 + 60, wy]], "#ef476f", 3));
    out.push(<div className="btn" id="trigger" style={{ left: width / 2 - 56, top: height - 136, width: 112, height: 112, borderRadius: 56, backgroundColor: holding ? "#06d6a0" : "#2a9d8f" }}><div className="btext">{holding ? "●" : "▶"}</div></div>);
    if (K.question === 0 && depth === 0) out.push(<div className="label" style={{ left: 20, top: height - 170, width: width - 40 }}>{rg.t("Pidä nappia pohjassa", "Hold the button down", "Mantén pulsado el botón")}</div>);
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Porakone", "Drill", "Taladro"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
