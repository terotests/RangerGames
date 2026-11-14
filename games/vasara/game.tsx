// Vasara: hammer and nails, seen from the side, for 5-year-olds. Levels:
//   1 Naulaa        tap a nail and the hammer hits it; a few hits each
//   2 Osu keskelle  the raised hammer sways over the nail; tap when it is
//                   right above the head, or the nail bends (tap it and the
//                   pliers straighten it)
//   3 Pihdit        a nail on its own falls over: hold it with the pliers
//                   first (fingers stay safe), then hit; last step: put the
//                   nails on their marks first
//   4 Linnunpönttö  every question nails one more part of a birdhouse
import { K, Level, setup, step, start, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, turn, rect, ngon } from "lib/kit";

type Nail = { x: number; h: number; bent: number; fixT: number; held: boolean; fallen: number; placed: boolean; px: number; py: number };
const MAXH = 74;
const WOOD = "#d39150", WOOD2 = "#b5733a";

function picHammer(x: number, y: number, s: number, a: number) {
  const out: any[] = [];
  out.push(Box(x - 40 * s, y + 26 * s, 80 * s, 18 * s, WOOD, 4));
  out.push(Poly(rect(x - 3 * s, y - 4 * s, 6 * s, 30 * s), "#adb5bd"));
  out.push(Poly(rect(x - 12 * s, y - 8 * s, 24 * s, 5 * s), "#6c757d"));
  const piv = [x + 50 * s, y - 30 * s];
  out.push(Poly(turn(rect(piv[0] - 62 * s, piv[1] - 5 * s, 62 * s, 10 * s), piv[0], piv[1], a), "#8d5524"));
  out.push(Poly(turn(rect(piv[0] - 74 * s, piv[1] - 22 * s, 20 * s, 34 * s), piv[0], piv[1], a), "#495057"));
  return out;
}
const LEVELS: Level[] = [
  { name: rg.t("Naulaa", "Hammer", "Martillo"), color: "#f77f00", say: "rk_v_naulaa", pic: (x, y, s) => picHammer(x, y, s, 0.2) },
  { name: rg.t("Osu keskelle", "Hit the middle", "Al centro"), color: "#e63946", say: "rk_v_osu", pic: (x, y, s) => picHammer(x, y, s, 0.5).concat([Line([[x - 30 * s, y - 50 * s], [x + 30 * s, y - 50 * s]], "#ffffff", 4)]) },
  { name: rg.t("Pihdit", "Pliers", "Alicates"), color: "#2a9d8f", say: "rk_v_pihdit", pic: (x, y, s) => Pliers(x + 4 * s, y + 4 * s, s * 0.9, true).concat([Box(x - 40 * s, y + 26 * s, 80 * s, 18 * s, WOOD, 4)]) },
  { name: rg.t("Linnunpönttö", "Birdhouse", "Pajarera"), color: "#7b2cbf", say: "rk_v_ponto", pic: (x, y, s) => House(x, y + 6 * s, s * 0.55, 6) },
];

let nails: Nail[] = [];
let hits = 3;             // hits to drive a nail in
let target = -1;          // the nail the hammer goes for
let swingT = -10;         // when the hammer came down
let swingX = 0;           // where it came down
let sway = 0;             // the timing level: the hammer's offset now
let pliers = { x: 60, y: 560, on: -1 };
let grab = "";
let grabNail = -1;
let hintT = -10;
let BY = 420;             // the board's top
let part = 0;             // the birdhouse: parts done

function instruct() {
  if (K.level === 2 && nails.some((n) => !n.placed)) rg.say("rk_v_vie_naula");
  else if (K.level === 2 && pliers.on < 0 && nails.some((n) => n.h > MAXH * 0.55)) rg.say("rk_v_pihdit");
  else rg.say(K.level === 1 ? "rk_v_osu" : K.level === 3 ? "rk_v_ponto" : "rk_v_naulaa");
}

function next() {
  const s = step();
  BY = Math.round(height * 0.66);
  let n = 1;
  hits = 3;
  if (K.level === 0) { n = [2, 3, 4][s]; hits = [2, 3, 4][s]; }
  if (K.level === 1) { n = 1; hits = 3; }
  if (K.level === 2) { n = s === 2 ? 2 : 1; hits = 3; }
  if (K.level === 3) { n = 2; hits = [2, 3, 3][s]; part = K.question; }
  nails = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round(width * (i + 1) / (n + 1));
    nails.push({ x, h: MAXH, bent: 0, fixT: -10, held: false, fallen: -10, placed: !(K.level === 2 && s === 2), px: 40 + i * 30, py: height - 70 });
  }
  if (K.level === 2) pliers = { x: width - 70, y: height - 80, on: -1 };
  target = -1;
  swingT = -10;
  hintT = -10;
  grab = "";
  instruct();
}

// ---- the hammer ----------------------------------------------------------------
// the hammer's angle: raised 0.9, down 0
function hammerAngle(): number {
  const d = K.t - swingT;
  if (d < 0.1) return 0.9 * (1 - d / 0.1);
  if (d < 0.35) return 0.9 * ((d - 0.1) / 0.25);
  return 0.9;
}

function strike(i: number, x: number) {
  if (K.t - swingT < 0.35) return;
  target = i;
  swingX = x;
  swingT = K.t;
  rg.sound("whoosh", { volume: 0.4 });
}

// the moment the hammer meets the nail
function land() {
  const n = nails[target];
  if (!n) return;
  rg.sound("hit");
  rg.vibrate(30);
  if (K.level === 2 && !n.held && n.h > MAXH * 0.55) {
    n.fallen = K.t;
    const m = miss();
    hintT = K.t;
    rg.say(m >= 2 ? ["rk_v_kaatui", "rk_v_pihdit"] : "rk_v_kaatui");
    return;
  }
  if (K.level === 1) {
    const off = swingX - n.x;
    if (Math.abs(off) > tolerance()) {
      n.bent = off > 0 ? -0.55 : 0.55;
      const m = miss();
      hintT = K.t;
      rg.say(m >= 2 ? ["rk_v_vino", "rk_v_vihje_osu"] : "rk_v_vino");
      return;
    }
  }
  n.h = Math.max(0, n.h - MAXH / hits);
  if (n.held && n.h <= MAXH * 0.55) { n.held = false; pliers.on = -1; pliers.x = width - 70; pliers.y = height - 80; rg.say("rk_v_pysyy"); }
  if (n.h <= 0.5) {
    n.h = 0;
    rg.sound("pop");
    if (nails.every((q) => q.h <= 0.5)) {
      if (K.level === 3 && K.question === K.round - 1) win(width / 2, BY - 60, ["rk_v_valmis"]);
      else win(n.x, BY - 20);
    }
  }
}

function tolerance(): number { return [22, 16, 11][step()]; }

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0) return;
  // the pliers, or a nail to put on its mark
  if (K.level === 2) {
    if (Math.abs(x - pliers.x) < 50 && Math.abs(y - pliers.y) < 60 && pliers.on < 0) { grab = "pliers"; rg.sound("click"); return; }
    for (let i = 0; i < nails.length; i++) {
      const n = nails[i];
      if (!n.placed && Math.abs(x - n.px) < 30 && Math.abs(y - n.py) < 50) { grab = "nail"; grabNail = i; rg.sound("click"); return; }
    }
    if (nails.some((n) => !n.placed)) return;
  }
  if (y < 120) return;
  if (K.level === 1) {
    const n = nails[0];
    if (n.bent !== 0) { if (Math.abs(x - n.x) < 70 && y > BY - 120) { n.bent = 0; n.fixT = K.t; rg.sound("click"); } return; }
    strike(0, n.x + sway);
    return;
  }
  // the nearest nail still sticking out
  let best = -1, bd = 1e9;
  nails.forEach((n, i) => { const d = Math.abs(x - n.x); if (n.h > 0.5 && n.placed && d < bd && K.t - n.fallen > 1.3) { bd = d; best = i; } });
  if (best >= 0 && bd < 70 && y > BY - MAXH - 110) strike(best, nails[best].x);
}

function drop() {
  if (grab === "pliers") {
    let done = false;
    nails.forEach((n, i) => {
      if (!done && n.placed && n.h > 0.5 && Math.abs(pliers.x - n.x) < 50 && Math.abs(pliers.y - (BY - n.h / 2)) < 70) {
        n.held = true; pliers.on = i; done = true; rg.sound("pop"); rg.say("rk_v_naulaa");
      }
    });
    if (!done) { pliers.x = width - 70; pliers.y = height - 80; }
  }
  if (grab === "nail") {
    const n = nails[grabNail];
    if (Math.abs(n.px - n.x) < 40 && Math.abs(n.py - (BY - 30)) < 60) { n.placed = true; rg.sound("pop"); if (nails.every((q) => q.placed)) instruct(); }
    else { n.px = 40 + grabNail * 30; n.py = height - 70; }
  }
  grab = "";
}

function onPointerUp() { drop(); }

function tick(dt: number, input: any) {
  const before = K.t - swingT;
  update(dt);
  if (K.mode !== "play") return;
  if (before < 0.1 && K.t - swingT >= 0.1) land();
  if (K.level === 1 && K.t - swingT > 0.35) sway = Math.sin(K.t * [1.8, 2.6, 3.6][step()]) * 54;
  if (grab && input && input.pointer) {
    if (input.pointer.down) {
      if (grab === "pliers") { pliers.x = input.pointer.x; pliers.y = input.pointer.y; }
      if (grab === "nail") { nails[grabNail].px = input.pointer.x; nails[grabNail].py = input.pointer.y; }
    } else drop();
  }
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 1) rg.say("rk_v_vihje_osu");
  else if (K.level === 2 && nails.some((n) => !n.placed)) rg.say("rk_v_vie_naula");
  else if (K.level === 2) rg.say("rk_v_pihdit");
  else rg.say("rk_v_vihje_naulaa");
}

function onBack() { grab = ""; back(); }

// ---- drawing ----------------------------------------------------------------------
function NailPic(x: number, base: number, h: number, bent: number, lying: boolean) {
  const out: any[] = [];
  const L = Math.max(0, h);
  let shaft = [[x - 3, base - L], [x + 3, base - L], [x + 3, base], [x - 3, base]];
  let head = rect(x - 13, base - L - 6, 26, 6);
  if (lying) {
    shaft = [[x, base - 6], [x + MAXH, base - 3], [x + MAXH, base - 9]].concat([[x, base - 12]]);
    head = rect(x - 6, base - 20, 6, 22);
  } else if (bent) {
    // the top part bends over
    const kx = x, ky = base - L * 0.45;
    shaft = [[x - 3, ky], [x + 3, ky], [x + 3, base], [x - 3, base]];
    const top = turn([[kx - 3, ky - L * 0.55], [kx + 3, ky - L * 0.55], [kx + 3, ky], [kx - 3, ky]], kx, ky, bent);
    out.push(Poly(top, "#adb5bd", "#6c757d", 1.5));
    head = turn(rect(kx - 13, ky - L * 0.55 - 6, 26, 6), kx, ky, bent);
  }
  out.push(Poly(shaft, "#adb5bd", "#6c757d", 1.5));
  out.push(Poly(head, "#868e96", "#495057", 1.5));
  return out;
}

function Hammer(nx: number, top: number, a: number, side: number) {
  // side 1: the hand to the right of the nail; -1: to the left
  const px = nx + 118 * side, py = top - 12;
  const rot = (pts: number[][]) => turn(pts.map((q) => [px + (q[0] - px) * side, q[1]]), px, py, a * side).map((q) => q);
  const handle = rot(rect(px - 112, py - 6, 116, 12));
  const head = rot(rect(px - 132, py - 40, 28, 52));
  const claw = rot([[px - 132, py - 40], [px - 104, py - 40], [px - 96, py - 62], [px - 112, py - 52]]);
  return [Poly(handle, "#8d5524", "#5c3a17", 2), Poly(claw, "#495057"), Poly(head, "#6c757d", "#343a40", 2), Poly(rot(rect(px - 132, py + 6, 28, 6)), "#343a40")];
}

function Pliers(x: number, y: number, s: number, open: boolean) {
  const o = open ? 0.18 : 0.05;
  const out: any[] = [];
  const arm = (sgn: number) => turn([[x - 4 * s, y - 46 * s], [x + 4 * s, y - 46 * s], [x + 6 * s, y], [x + 8 * s, y + 44 * s], [x - 2 * s, y + 44 * s], [x - 6 * s, y]], x, y, sgn * o);
  out.push(Poly(arm(1), "#495057"));
  out.push(Poly(arm(-1), "#6c757d"));
  out.push(Poly(turn(rect(x - 5 * s, y + 14 * s, 12 * s, 32 * s), x, y, o), "#e63946"));
  out.push(Poly(turn(rect(x - 7 * s, y + 14 * s, 12 * s, 32 * s), x, y, -o), "#e63946"));
  out.push(Circle(x, y, 5 * s, "#343a40"));
  return out;
}

// the birdhouse with `n` parts done, about (x, y)
function House(x: number, y: number, s: number, n: number) {
  const out: any[] = [];
  const W = 120 * s, H = 110 * s;
  if (n < 6) out.push(Poly([[x - W / 2 - 18 * s, y - H / 2 + 6 * s], [x, y - H / 2 - 54 * s], [x + W / 2 + 18 * s, y - H / 2 + 6 * s], [x + W / 2 + 8 * s, y + H / 2 + 12 * s], [x - W / 2 - 8 * s, y + H / 2 + 12 * s]], "rgba(255,255,255,0.55)", "rgba(181,115,58,0.5)", 2));
  if (n > 0) out.push(Poly(rect(x - W / 2, y - H / 2, W, H), "#e9c46a", "#b5733a", 2));                      // back
  if (n > 1) out.push(Poly(rect(x - W / 2 - 8 * s, y + H / 2, W + 16 * s, 12 * s), WOOD, "#8d5524", 2));    // floor
  if (n > 2) out.push(Poly(rect(x - W / 2 - 8 * s, y - H / 2, 12 * s, H), WOOD2, "#8d5524", 2));             // left
  if (n > 3) out.push(Poly(rect(x + W / 2 - 4 * s, y - H / 2, 12 * s, H), WOOD2, "#8d5524", 2));             // right
  if (n > 4) out.push(Poly([[x - W / 2 - 18 * s, y - H / 2 + 6 * s], [x, y - H / 2 - 54 * s], [x + 6 * s, y - H / 2 - 44 * s], [x - W / 2 - 8 * s, y - H / 2 + 16 * s]], "#e63946", "#9d0208", 2));
  if (n > 5) out.push(Poly([[x + W / 2 + 18 * s, y - H / 2 + 6 * s], [x, y - H / 2 - 54 * s], [x - 6 * s, y - H / 2 - 44 * s], [x + W / 2 + 8 * s, y - H / 2 + 16 * s]], "#d62828", "#9d0208", 2));
  if (n > 0) out.push(Circle(x, y - 10 * s, 18 * s, "#3d2b1f"));
  if (n > 3) out.push(Box(x - 3 * s, y + 18 * s, 6 * s, 20 * s, "#8d5524", 2));
  return out;
}

function Board() {
  const out: any[] = [];
  out.push(Box(14, BY, width - 28, 64, WOOD, 6));
  out.push(Line([[24, BY + 22], [width * 0.45, BY + 18], [width - 24, BY + 24]], WOOD2, 2));
  out.push(Line([[24, BY + 44], [width * 0.6, BY + 48], [width - 24, BY + 42]], WOOD2, 2));
  out.push(Box(0, BY + 64, width, height - BY - 64, "#8d99ae"));
  return out;
}

function Play() {
  const out: any[] = [];
  const text = K.level === 1 ? rg.t("Osu naulan kantaan", "Hit the nail head", "Golpea la cabeza del clavo")
    : K.level === 2 && nails.some((n) => !n.placed) ? rg.t("Vie naula merkkiin", "Put the nail on the mark", "Pon el clavo en la marca")
    : K.level === 2 && pliers.on < 0 && nails.some((n) => n.h > MAXH * 0.55) ? rg.t("Pidä naulaa pihdeillä", "Hold the nail with the pliers", "Sujeta el clavo con los alicates")
    : K.level === 3 ? rg.t("Rakenna linnunpönttö", "Build a birdhouse", "Construye una pajarera")
    : rg.t("Lyö naulat puuhun", "Hammer the nails in", "Clava los clavos");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  if (K.level === 3) for (const e of House(width / 2, 210, 0.75, part + (K.solved >= 0 ? 1 : 0))) out.push(e);
  for (const e of Board()) out.push(e);
  const hinting = K.t - hintT < 5;
  nails.forEach((n, i) => {
    if (!n.placed) {
      out.push(Poly([[n.x - 12, BY - 12], [n.x + 12, BY + 12]].concat([[n.x + 12, BY - 12], [n.x - 12, BY + 12]]), "rgba(230,57,70,0.0)"));
      out.push(Line([[n.x - 12, BY - 12], [n.x + 12, BY + 12]], "#e63946", 5));
      out.push(Line([[n.x + 12, BY - 12], [n.x - 12, BY + 12]], "#e63946", 5));
      if (grabNail !== i || grab !== "nail") out.push(PointAt(n.px, n.py - 40, "#f77f00"));
      for (const e of NailPic(n.px, n.py + 30, MAXH * 0.8, 0, false)) out.push(e);
      return;
    }
    const lying = K.t - n.fallen < 1.3;
    if (n.h <= 0.5) { out.push(Poly(rect(n.x - 13, BY - 5, 26, 5), "#868e96", "#495057", 1.5)); return; }
    if (K.level === 1 && hinting && n.bent === 0) out.push(Box(n.x - tolerance(), BY - MAXH - 70, tolerance() * 2, 60, "rgba(6,214,160,0.35)", 6));
    for (const e of NailPic(n.x, BY, n.h, n.bent, lying)) out.push(e);
    if (n.bent !== 0) out.push(PointAt(n.x, BY - n.h - 30, "#2a9d8f"));
    if (K.t - n.fixT < 0.6) for (const e of Pliers(n.x + 18, BY - n.h * 0.6, 0.8, false)) out.push(e);
  });
  // the pliers
  if (K.level === 2 && nails.every((n) => n.placed)) {
    const held = pliers.on >= 0 ? nails[pliers.on] : null;
    const px = held ? held.x + 26 : pliers.x, py = held ? BY - held.h * 0.55 : pliers.y;
    for (const e of Pliers(px, py, 1, !held)) out.push(e);
    if (!held && grab !== "pliers" && nails.some((n) => n.h > MAXH * 0.55) && (step() === 0 || hinting)) out.push(PointAt(pliers.x, pliers.y - 50, "#f77f00"));
  }
  // the hammer, over its nail (or swaying on the timing level)
  const live = nails.filter((n) => n.placed && n.h > 0.5);
  if (live.length || K.solved >= 0) {
    let n = target >= 0 && nails[target] && K.t - swingT < 0.6 ? nails[target] : live[0] || nails[nails.length - 1];
    let hx = K.level === 1 ? (K.t - swingT < 0.35 ? swingX : n.x + sway) : n.x;
    const side = hx > width * 0.62 ? -1 : 1;
    for (const e of Hammer(hx, BY - n.h - 6, hammerAngle(), side)) out.push(e);
  }
  if (K.level !== 1 && step() === 0 && K.misses === 0 && live.length && nails.every((q) => q.placed) && !(K.level === 2 && pliers.on < 0 && live[0].h > MAXH * 0.55))
    out.push(PointAt(live[0].x, BY - live[0].h - 70, "#f77f00"));
  return <div className="screen">{out}</div>;
}

setup(rg.t("Vasara", "Hammer", "Martillo"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
