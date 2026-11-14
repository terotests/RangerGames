// Pora: the drill, for 5-year-olds. Levels:
//   1 Oikea terä    pick the bit as thick as the wall plug
//   2 Kiinnitä terä put the bit in the chuck and turn the chuck tight; a
//                   loose bit wobbles (last step: pick the bit first)
//   3 Poraa         hold the button to drill and let go when the tape on the
//                   bit touches the wood (the tape trick for the right depth)
//   4 Materiaali    wood, metal or concrete: pick the bit made for it (wood bit
//                   with a spike, gold metal bit, stone bit with a wide tip),
//                   then drill; concrete needs the hammer mode (last step)
//   5 Ruuvinväännin the cordless screwdriver: set the direction switch (in =
//                   clockwise, out = anticlockwise) and hold the trigger; last
//                   step: let go when the head touches the wood
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, TurnArrow, PointAt, rect } from "lib/kit";

const BITS = [4, 6, 8, 10];   // mm
const MM = 3.2;               // px a mm, for the bits

const LEVELS: Level[] = [
  { name: rg.t("Oikea terä", "Right bit", "La broca"), color: "#118ab2", say: "rk_p_valitse", pic: (x, y, s) => Bit(x - 20 * s, y - 40 * s, 8, 80 * s, s).concat(Plug(x + 22 * s, y - 20 * s, 8, s)) },
  { name: rg.t("Kiinnitä terä", "Fit the bit", "Pon la broca"), color: "#f77f00", say: "rk_p_kiinnita", pic: (x, y, s) => Drill(x - 10 * s, y + 4 * s, s * 0.55, 0).concat(Bit(x - 10 * s, y + 4 * s, 6, 40 * s, s)) },
  { name: rg.t("Poraa", "Drill", "Taladra"), color: "#2a9d8f", say: "rk_p_poraa", pic: (x, y, s) => [Box(x - 50 * s, y + 20 * s, 100 * s, 20 * s, "#d39150", 4)].concat(Drill(x - 10 * s, y - 6 * s, s * 0.5, 0)).concat(Bit(x - 10 * s, y - 6 * s, 6, 30 * s, s)) },
  { name: rg.t("Materiaali", "Material", "Material"), color: "#6c757d", say: "rk_p_materiaali", pic: (x, y, s) => MatBit("puu", x - 30 * s, y - 40 * s, 70 * s, s).concat(MatBit("metalli", x, y - 40 * s, 70 * s, s), MatBit("betoni", x + 30 * s, y - 40 * s, 70 * s, s)) },
  { name: rg.t("Ruuvinväännin", "Screwdriver", "Atornillador"), color: "#7b2cbf", say: "rk_p_ruuvaa_kiinni", pic: (x, y, s) => Drill(x - 14 * s, y - 4 * s, s * 0.5, 0).concat(DriverBit(x - 14 * s, y - 4 * s, 30 * s, s, 0), [Box(x - 50 * s, y + 30 * s, 100 * s, 16 * s, "#d39150", 4)]) },
];
const MATS = ["puu", "metalli", "betoni"];

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
let depth = 0, tape = 40, holding = false, dust: { x: number; y: number; vx: number; vy: number; t: number; c?: string }[] = [];
let tickAcc = 0;
// materials and the screwdriver
let mat = "puu";
let matChoices: string[] = [];
let hammer = false;          // the drill's hammer mode
let hole = 0;                // how deep the hole is, 0..1
let job = "in";              // the screwdriver: "in" or "out"
let dir = "in";              // the direction switch
let screwP = 0;              // the screw: 0 sticking out, 1 head on the wood (2 = sunk)
let spin = 0;
let wrongT = -10;

function drillAt() { return { x: width / 2, y: Math.round(height * 0.42) }; }
function WY() { return Math.round(height * 0.62); }      // the wood's top (drilling)

function instruct() {
  if (K.level === 3) { if (phase === "mpick") rg.say(["rk_p_valitse_mat", "rk_p_" + mat + "_x"]); else if (phase === "mdrill") rg.say(mat === "betoni" && step() === 2 && !hammer ? "rk_p_isku" : "rk_p_poraa_reika"); return; }
  if (K.level === 4) { rg.say(job === "in" ? "rk_p_ruuvaa_kiinni" : "rk_p_ruuvaa_auki"); return; }
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
  if (K.level === 3) {
    mat = rg.pick(s === 2 ? MATS : MATS.slice(0, s === 0 ? 2 : 3));
    if (s === 2 && rg.range(0, 1)) mat = "betoni";
    const others = MATS.filter((m) => m !== mat);
    matChoices = rg.shuffle([mat].concat(rg.shuffle(others).slice(0, s === 0 ? 1 : 2)));
    hammer = false; hole = 0; phase = "mpick";
    instruct();
    return;
  }
  if (K.level === 4) {
    job = s === 0 ? "in" : rg.pick(["in", "out"]);
    dir = s === 0 ? "in" : rg.pick(["in", "out"]);
    screwP = job === "in" ? 0 : 1;
    phase = "screw"; spin = 0; wrongT = -10;
    instruct();
    return;
  }
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

// ---- 4: the right bit for the material ---------------------------------------------------
function pickMat(i: number) {
  if (phase !== "mpick" || wrong.indexOf(i) >= 0 || K.solved >= 0) return;
  if (matChoices[i] === mat) {
    phase = "mdrill"; hole = 0; rg.sound("pop");
    if (mat === "betoni" && step() === 2) rg.say("rk_p_isku"); else rg.say("rk_p_poraa_reika");
    return;
  }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  if (n >= 2) { hintT = K.t; rg.say(["rk_p_vaara_tera", "rk_p_vihje_mat"]); } else rg.say("rk_p_vaara_tera");
}
function matSpeed() {
  if (mat === "betoni" && step() === 2 && !hammer) return 0.03;
  return mat === "puu" ? 0.55 : mat === "metalli" ? 0.32 : 0.28;
}
// ---- 5: the screwdriver ----------------------------------------------------------------------
function screwRelease() {
  if (!holding) return;
  holding = false;
  if (K.level !== 4 || K.solved >= 0) return;
  if (dir !== job) { const n = miss(); hintT = K.t; rg.say(n >= 2 ? ["rk_p_suunta", "rk_p_vihje_suunta"] : "rk_p_suunta"); return; }
  if (job === "in" && step() === 2) {
    if (screwP >= 0.93 && screwP <= 1.06) { screwP = 1; win(width / 2, WY(), ["rk_p_ruuvi_kiinni"]); return; }
    if (screwP > 1.06) { const n = miss(); hintT = K.t; rg.say(n >= 2 ? ["rk_p_liian_pitkaan", "rk_p_vihje_ruuvi"] : "rk_p_liian_pitkaan"); screwP = 0.5; }
  }
}

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
  if (phase === "mdrill") {
    if (step() === 2 && mat === "betoni" && Math.hypot(x - (width - 60), y - (height - 80)) < 44) { hammer = !hammer; rg.sound("click"); return; }
    if (buttonHit(x, y)) holding = true;
  }
  if (phase === "screw") {
    if (step() > 0 && Math.hypot(x - 60, y - (height - 80)) < 44) { dir = dir === "in" ? "out" : "in"; rg.sound("click"); return; }
    if (buttonHit(x, y)) holding = true;
  }
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

function onPointerUp() { drop(); if (K.level === 4) screwRelease(); else if (K.level === 3) holding = false; else release(); }

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
  if (phase === "mdrill") {
    if (holding && p && !p.down) holding = false;
    if (holding) {
      hole = Math.min(1, hole + matSpeed() * dt);
      rg.vibrate(mat === "betoni" && hammer ? 30 : 15);
      const c = mat === "puu" ? "#e9c46a" : mat === "metalli" ? "#ced4da" : "#adb5bd";
      if (rg.random() < 0.7) dust.push({ x: width / 2 - 70, y: WY() - 10, vx: -40 - rg.random() * 120, vy: (rg.random() - 0.7) * 160, t: 0, c });
      if (rg.random() < 0.3) rg.sound(mat === "betoni" && hammer ? "hit" : "tick", { volume: 0.3, pitch: mat === "metalli" ? 2.2 : mat === "betoni" ? 0.7 : 1.5 });
      if (mat === "betoni" && step() === 2 && !hammer && K.t - wrongT > 3) { wrongT = K.t; rg.say("rk_p_isku"); hintT = K.t; }
      if (hole >= 1) { holding = false; phase = "end"; win(width / 2 - 80, WY() - 10, ["rk_p_reika"]); }
    }
  }
  if (phase === "screw") {
    if (holding && p && !p.down) screwRelease();
    if (holding) {
      const sp = dir === "in" ? 1 : -1;
      spin += sp * dt * 14;
      rg.vibrate(10);
      if (rg.random() < 0.35) rg.sound("tick", { volume: 0.25, pitch: 1.2 });
      if (dir === job) {
        screwP += (job === "in" ? 1 : -1) * [0.45, 0.5, 0.42][step()] * dt;
        if (job === "out" && screwP <= 0) { screwP = 0; holding = false; win(width / 2, WY() - 60, ["rk_p_ruuvi_irti"]); }
        if (job === "in" && step() < 2 && screwP >= 1) { screwP = 1; holding = false; win(width / 2, WY(), ["rk_p_ruuvi_kiinni"]); }
        if (job === "in" && screwP > 1.25) screwRelease();
      }
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
  if (K.level === 3) rg.say(phase === "mpick" ? "rk_p_vihje_mat" : mat === "betoni" && step() === 2 && !hammer ? "rk_p_isku" : "rk_p_poraa_reika");
  else if (K.level === 4) rg.say(dir !== job ? "rk_p_vihje_suunta" : step() === 2 && job === "in" ? "rk_p_vihje_ruuvi" : "rk_p_vihje_suunta");
  else if (phase === "pick") rg.say("rk_p_vihje_valitse");
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

// a bit for a material, hanging from (x, y), `len` long: wood = a sharp middle spike and two
// spurs, metal = gold with a pointed tip, concrete (stone) = grey with a wide flat tip
function MatBit(m: string, x: number, y: number, len: number, s: number) {
  const w = 18 * s, out: any[] = [];
  const col = m === "puu" ? "#8ecae6" : m === "metalli" ? "#e0a526" : "#adb5bd";
  const edge = m === "puu" ? "#219ebc" : m === "metalli" ? "#9c6b00" : "#495057";
  const end = y + len - 18 * s;
  out.push(Poly(rect(x - w / 2, y, w, end - y), col, edge, 1.5));
  for (let yy = y + 14 * s; yy < end - 6 * s; yy += 11 * s) out.push(Line([[x - w / 2, yy], [x + w / 2, yy + 7 * s]], edge, 2));
  if (m === "puu") {
    out.push(Poly([[x - w / 2, end], [x + w / 2, end], [x + w / 2, end + 8 * s], [x + w / 2 - 3 * s, end + 4 * s], [x + 2 * s, end + 4 * s], [x, end + 18 * s], [x - 2 * s, end + 4 * s], [x - w / 2 + 3 * s, end + 4 * s], [x - w / 2, end + 8 * s]], col, edge, 1.5));
  } else if (m === "metalli") {
    out.push(Poly([[x - w / 2, end], [x + w / 2, end], [x, end + 14 * s]], col, edge, 1.5));
  } else {
    out.push(Poly([[x - w / 2 - 6 * s, end - 4 * s], [x + w / 2 + 6 * s, end - 4 * s], [x + w / 2 + 6 * s, end + 6 * s], [x, end + 16 * s], [x - w / 2 - 6 * s, end + 6 * s]], "#6c757d", "#343a40", 1.5));
  }
  return out;
}
// a material sample: wood, a metal plate or a concrete block
function Material(m: string, x: number, y: number, w: number, h: number) {
  const out: any[] = [];
  if (m === "puu") {
    out.push(Box(x, y, w, h, "#d39150", 6));
    for (let i = 1; i < 4; i++) out.push(Line([[x + 8, y + h * i / 4], [x + w * 0.5, y + h * i / 4 - 4], [x + w - 8, y + h * i / 4 + 2]], "#b5733a", 2));
  } else if (m === "metalli") {
    out.push(Box(x, y, w, h, "#adb5bd", 4));
    out.push(Box(x + 4, y + 4, w - 8, h * 0.3, "rgba(255,255,255,0.35)", 3));
    for (const cx of [x + 12, x + w - 12]) for (const cy of [y + 12, y + h - 12]) out.push(Circle(cx, cy, 4, "#6c757d"));
  } else {
    out.push(Box(x, y, w, h, "#8d99ae", 2));
    for (let i = 0; i < 14; i++) out.push(Circle(x + 10 + ((i * 37) % (w - 20)), y + 10 + ((i * 53) % (h - 20)), 2 + (i % 3), "#6c757d"));
  }
  return out;
}
function MatName(m: string) { return m === "puu" ? rg.t("Puu", "Wood", "Madera") : m === "metalli" ? rg.t("Metalli", "Metal", "Metal") : rg.t("Betoni", "Concrete", "Hormigón"); }
// the screwdriver bit in the chuck: a cross tip
function DriverBit(x: number, y: number, len: number, s: number, rot: number) {
  const out: any[] = [Poly(rect(x - 5 * s, y, 10 * s, len), "#adb5bd", "#495057", 1.5)];
  const k = Math.cos(rot * 2);
  out.push(Poly([[x - 5 * s, y + len], [x + 5 * s, y + len], [x + 1.5 * s, y + len + 9 * s], [x - 1.5 * s, y + len + 9 * s]], "#868e96", "#343a40", 1));
  out.push(Line([[x - 4 * s * k, y + 6 * s], [x + 4 * s * k, y + len - 4 * s]], "#6c757d", 2));
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
  const text = K.level === 3 ? (phase === "mpick" ? rg.t("Mikä terä sopii?", "Which bit fits?", "¿Qué broca sirve?") : rg.t("Poraa reikä", "Drill the hole", "Haz el agujero"))
    : K.level === 4 ? (job === "in" ? rg.t("Ruuvaa ruuvi kiinni", "Drive the screw in", "Atornilla") : rg.t("Irrota ruuvi", "Take the screw out", "Saca el tornillo"))
    : phase === "pick" ? rg.t("Mikä terä sopii tulppaan?", "Which bit fits the plug?", "¿Qué broca para el taco?")
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
  if (K.level === 3) PlayMat(out, hinting);
  if (K.level === 4) PlayScrew(out, hinting);
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

function PlayMat(out: any[], hinting: boolean) {
  const wy = WY();
  if (phase === "mpick" || (phase === "end" && hole < 1)) {
    for (const e of Material(mat, width / 2 - 110, 150, 220, 110)) out.push(e);
    out.push(<div className="label" style={{ left: width / 2 - 110, top: 268, width: 220 }}>{MatName(mat)}</div>);
    const n = matChoices.length, cw = 86, ch = 170;
    const x0 = width / 2 - (n * (cw + 10) - 10) / 2, y = height - ch - 20;
    matChoices.forEach((m, i) => {
      const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
      const x = x0 + i * (cw + 10) + sh;
      out.push(<div className={wrong.indexOf(i) >= 0 ? "card off" : "card"} style={{ left: x, top: y, width: cw, height: ch }} />);
      for (const e of MatBit(m, x + cw / 2, y + 16, ch - 40, 1.4)) out.push(e);
      if (hinting && m === mat) out.push(Circle(x + cw / 2, y + ch - 20, 18, "rgba(6,214,160,0.35)", "#06d6a0"));
      out.push(<div className="hit" id={"mb" + i} onClick={() => pickMat(i)} style={{ left: x, top: y, width: cw, height: ch }} />);
    });
    return;
  }
  // drilling into the side of the material, the drill lying on its side
  const mx = width / 2 - 80, mw = 150;
  for (const e of Material(mat, mx - mw, wy - 120, mw, 200)) out.push(e);
  const depthPx = hole * 60;
  if (hole > 0) out.push(Box(mx - depthPx, wy - 22, depthPx, 24, "#2b2d31", 3));
  // the bit and drill, pointing left at the material
  const bx = mx - depthPx + 6;
  out.push(Poly([[bx, wy - 10], [bx + 14, wy - 18], [bx + 120, wy - 18], [bx + 120, wy - 2], [bx + 14, wy - 2]], mat === "metalli" ? "#e0a526" : mat === "puu" ? "#8ecae6" : "#adb5bd", "#495057", 1.5));
  const dx = bx + 120 + (holding ? Math.sin(K.t * 60) * 1.5 : 0);
  out.push(Poly(rect(dx, wy - 26, 36, 32), "#343a40"));
  out.push(Poly(rect(dx + 36, wy - 40, 120, 56), "#f77f00", "#b5540a", 2));
  out.push(Poly([[dx + 90, wy + 16], [dx + 124, wy + 16], [dx + 130, wy + 90], [dx + 98, wy + 90]], "#343a40"));
  for (const q of dust) out.push(Box(q.x, q.y, 4, 4, q.c || "#e9c46a", 1));
  // progress
  out.push(Box(40, 150, width - 80, 14, "rgba(0,0,0,0.12)", 7));
  out.push(Box(40, 150, Math.max(14, (width - 80) * hole), 14, "#06d6a0", 7));
  out.push(<div className="btn" id="trigger" style={{ left: width / 2 - 56, top: height - 136, width: 112, height: 112, borderRadius: 56, backgroundColor: holding ? "#06d6a0" : "#2a9d8f" }}><div className="btext">{holding ? "●" : "▶"}</div></div>);
  if (step() === 2 && mat === "betoni") {
    out.push(<div className="btn" id="hammer" style={{ left: width - 104, top: height - 124, width: 88, height: 88, borderRadius: 44, backgroundColor: hammer ? "#ffd166" : "#dee2e6" }}><div className="btext">🔨</div></div>);
    if (!hammer && (hinting || holding)) out.push(PointAt(width - 60, height - 134, "#f77f00"));
  }
}

function PlayScrew(out: any[], hinting: boolean) {
  const wy = WY();
  out.push(Box(10, wy, width - 20, 80, "#d39150", 6));
  out.push(Line([[20, wy + 26], [width - 20, wy + 22]], "#b5733a", 2));
  const SL = 70, cx = width / 2;
  const above = Math.max(-8, (1 - screwP) * SL);
  const headY = wy - above;
  // the screw: thread under the head, the part in the wood hidden
  const vis = Math.max(0, above);
  if (vis > 0) {
    out.push(Poly(rect(cx - 5, headY, 10, vis), "#adb5bd", "#6c757d", 1));
    for (let yy = headY + 4 + ((spin * 3) % 6 + 6) % 6; yy < wy - 2; yy += 6) out.push(Line([[cx - 6, yy], [cx + 6, yy + 3]], "#6c757d", 2));
  }
  out.push(Poly([[cx - 15, headY - 6], [cx + 15, headY - 6], [cx + 12, headY], [cx - 12, headY]], screwP > 1.06 ? "#495057" : "#868e96", "#495057", 1.5));
  if (screwP > 1.06) out.push(Poly([[cx - 22, wy], [cx + 22, wy], [cx + 14, wy + 6], [cx - 14, wy + 6]], "#8d5524"));
  // the screwdriver on the head
  const top = headY - 6 - 40;
  for (const e of Drill(cx, top, 0.9, holding ? Math.sin(K.t * 50) * 1 : 0)) out.push(e);
  for (const e of DriverBit(cx, top, 34, 1, spin)) out.push(e);
  // the turning arrow while held
  if (holding) for (const e of TurnArrow(cx, headY - 20, 46, dir === "in" ? 1 : -1, dir === job ? "rgba(6,214,160,0.8)" : "rgba(230,57,70,0.8)")) out.push(e);
  // the direction switch
  if (step() > 0) {
    out.push(<div className="btn" id="dir" style={{ left: 16, top: height - 124, width: 88, height: 88, borderRadius: 44, backgroundColor: dir === "in" ? "#06d6a0" : "#ffd166" }}><div className="btext">{dir === "in" ? "↻" : "↺"}</div></div>);
    out.push(<div className="label" style={{ left: 6, top: height - 34, width: 108, fontSize: 13 }}>{dir === "in" ? rg.t("kiinni", "in", "dentro") : rg.t("irti", "out", "fuera")}</div>);
    if (dir !== job && (hinting || K.question === 0)) out.push(PointAt(60, height - 134, "#f77f00"));
  }
  if (step() === 2 && job === "in" && hinting) out.push(Line([[cx - 50, wy], [cx + 50, wy]], "#ef476f", 3));
  out.push(<div className="btn" id="trigger" style={{ left: width / 2 - 56, top: height - 136, width: 112, height: 112, borderRadius: 56, backgroundColor: holding ? "#06d6a0" : "#7b2cbf" }}><div className="btext">{holding ? "●" : "▶"}</div></div>);
}

setup(rg.t("Porakone", "Drill", "Taladro"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
