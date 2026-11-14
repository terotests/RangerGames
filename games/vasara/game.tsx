// Vasara: hammer and nails, seen from the side, for 5-year-olds. Levels:
//   1 Naulaa        tap a nail and the hammer hits it; a few hits each
//   2 Osu keskelle  the raised hammer sways over the nail; tap when it is
//                   right above the head, or the nail bends (tap it and the
//                   pliers straighten it)
//   3 Pihdit        a nail on its own falls over: hold it with the pliers
//                   first (fingers stay safe), then hit; last step: put the
//                   nails on their marks first
//   4 Linnunpönttö  every question nails one more part of a birdhouse
//   5 Sorkkarauta   pull nails out: hook the crowbar's claw under a nail's
//                   head and push the handle down; the heel is the pivot, so
//                   the claw lifts the nail (later: drag the bar to each nail,
//                   long nails need two pulls)
//   6 Taltta        cut a notch between two pencil lines: put the chisel
//                   between the lines and hit its end with the hammer; each
//                   hit takes a slice (later: a wider notch, the chisel has to
//                   be moved, two notches and a tighter line)
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
  { name: rg.t("Sorkkarauta", "Crowbar", "Palanca"), color: "#c1121f", say: "rk_v_sorkka", pic: (x, y, s) => [Box(x - 50 * s, y + 26 * s, 100 * s, 18 * s, WOOD, 4)].concat(NailPic(x - 18 * s, y + 26 * s, 30 * s, 0, false), Crowbar(x - 18 * s, y, x - 4 * s, y + 26 * s, 0.8, s * 0.32)) },
  { name: rg.t("Taltta", "Chisel", "Formón"), color: "#457b9d", say: "rk_v_taltta", pic: (x, y, s) => [Box(x - 50 * s, y + 20 * s, 100 * s, 26 * s, WOOD, 4), Box(x - 12 * s, y + 20 * s, 24 * s, 12 * s, "#fff3d6", 0)].concat(Chisel(x, y + 20 * s, s * 0.5)) },
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
// the crowbar level: nails with `e` px still in the wood, and the bar
type Pull = { x: number; h: number; e: number; out: number; h0: number };
let pulls: Pull[] = [];
let bar = { x: 0, y: 0, on: -1, a: 0.45, a0: 0.45 };   // free bar's grip, hooked nail, handle angle
let barGrab = "";            // "move": carrying the bar, "lever": pushing the handle
let lifted = false;
const A0 = 0.42, A1 = 1.32;  // the handle: up, down on the board
// the chisel level: the wood in columns of COL px, cut[i] px deep; notches to cut
const COL = 6, CW = 30, DEEP = 30;     // column width, chisel blade width, notch depth
type Notch = { a: number; b: number };  // first and last+1 column
let cut: number[] = [];
let notches: Notch[] = [];
let chis = { x: 0, sx: 0, moved: false, grab: false };
let chips: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
let perHit = 10;

function instruct() {
  if (K.level === 2 && nails.some((n) => !n.placed)) rg.say("rk_v_vie_naula");
  else if (K.level === 2 && pliers.on < 0 && nails.some((n) => n.h > MAXH * 0.55)) rg.say("rk_v_pihdit");
  else if (K.level === 4) rg.say(bar.on >= 0 ? "rk_v_paina" : "rk_v_sorkka");
  else if (K.level === 5) rg.say("rk_v_taltta");
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
  if (K.level === 4) {
    nails = [];
    const m = [1, 2, 3][s];
    pulls = [];
    for (let i = 0; i < m; i++) {
      const h = rg.range(18, 30), e = s === 0 ? 40 : rg.range(40, 72);
      pulls.push({ x: Math.round(width * (i + 1) / (m + 1)) - 16, h, e, out: -10, h0: h });
    }
    bar = { x: width - 130, y: height - 80, on: s === 0 ? 0 : -1, a: A0, a0: A0 };
    barGrab = "";
  }
  if (K.level === 5) {
    nails = [];
    const nc = Math.floor((width - 28) / COL);
    cut = new Array(nc).fill(0);
    const w = [CW, CW * 2 + COL * 2, CW + COL * 3][s];
    const cols = Math.round(w / COL);
    notches = [];
    const m = s === 2 ? 2 : 1;
    for (let i = 0; i < m; i++) {
      const c = Math.round(nc * (i + 1) / (m + 1)) - Math.floor(cols / 2) + rg.range(-3, 3);
      notches.push({ a: c, b: c + cols });
    }
    perHit = DEEP / [2, 3, 3][s];
    chis = { x: s === 0 ? colX(notches[0].a) + w / 2 : width - 60, sx: 0, moved: false, grab: false };
    chips = [];
  }
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
  if (K.level === 5) { chiselLand(); return; }
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
  if (K.level === 4) { barDown(x, y); return; }
  if (K.level === 5) { chiselDown(x, y); return; }
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

function onPointerUp() { drop(); barUp(); chiselUp(); }

// ---- the chisel ------------------------------------------------------------------------
function colX(i: number) { return 14 + i * COL; }
// the columns under the chisel's blade
function under(): number[] { const a = Math.round((chis.x - CW / 2 - 14) / COL); const r: number[] = []; for (let i = a; i < a + CW / COL; i++) if (i >= 0 && i < cut.length) r.push(i); return r; }
// the blade tip rests on the highest wood under it
function tipY() { const u = under(); let d = DEEP + 20; for (const i of u) d = Math.min(d, cut[i]); return BY + (u.length ? d : 0); }
function inNotch(i: number) { return notches.some((n) => i >= n.a && i < n.b); }
function chiselDown(x: number, y: number) {
  if (y < 120) return;
  const top = tipY() - 130;
  if (step() > 0 && Math.abs(x - chis.x) < 44 && y > top - 30 && y < BY + 10) { chis.grab = true; chis.sx = x; chis.moved = false; return; }
  if (step() === 0 || Math.abs(x - chis.x) < 70) strike(0, chis.x);
}
function chiselMove(x: number) {
  if (Math.abs(x - chis.sx) > 8) chis.moved = true;
  if (chis.moved) chis.x = Math.max(30, Math.min(width - 30, x));
}
function chiselUp() {
  if (!chis.grab) return;
  chis.grab = false;
  if (!chis.moved) { strike(0, chis.x); return; }
  // close to a notch: slide in between its lines
  const snap = [0, 20, 8][step()];
  for (const n of notches) {
    const l = colX(n.a) + CW / 2, r = colX(n.b) - CW / 2;
    if (chis.x > l - snap && chis.x < r + snap) { chis.x = Math.max(l, Math.min(r, chis.x)); rg.sound("click", { volume: 0.4 }); return; }
  }
}
function chiselLand() {
  const u = under();
  rg.sound("hit"); rg.vibrate(30);
  if (u.some((i) => !inNotch(i))) {
    const n = miss();
    hintT = K.t;
    rg.say(n >= 2 ? ["rk_v_viiva", "rk_v_vihje_taltta"] : "rk_v_viiva");
    return;
  }
  if (u.every((i) => cut[i] >= DEEP)) { rg.say("rk_v_siirra"); hintT = K.t; return; }
  const top = tipY() - BY;
  const d = Math.min(DEEP, top + perHit);
  for (const i of u) cut[i] = Math.max(cut[i], d);
  for (let k = 0; k < 7; k++) chips.push({ x: chis.x + rg.range(-14, 14), y: BY + top, vx: rg.range(-160, 160), vy: rg.range(-320, -140), t: K.t });
  const left = notches.some((n) => cut.slice(n.a, n.b).some((c) => c < DEEP));
  if (!left) { win(chis.x, BY - 60, ["rk_v_kolo"]); return; }
  if (u.every((i) => cut[i] >= DEEP) && step() > 0) rg.say("rk_v_siirra");
}

// ---- the crowbar ----------------------------------------------------------------------
const BAR_L = 200;
function heelOf(p: Pull) { return { x: p.x + 30, y: BY }; }
// the handle's end for a hooked bar
function handleEnd(p: Pull, a: number) { const h = heelOf(p); return { x: h.x + Math.sin(a) * BAR_L, y: h.y - Math.cos(a) * BAR_L }; }
function barDown(x: number, y: number) {
  if (bar.on >= 0) {
    const e = handleEnd(pulls[bar.on], bar.a);
    if (Math.hypot(x - e.x, y - e.y) < 90 || (x > pulls[bar.on].x && y < BY && y > e.y - 40)) { barGrab = "lever"; bar.a0 = bar.a; lifted = false; rg.sound("click", { volume: 0.4 }); return; }
    if (step() > 0 && Math.hypot(x - pulls[bar.on].x, y - (BY - pulls[bar.on].h)) < 60) { barGrab = "move"; bar.on = -1; bar.x = x; bar.y = y; return; }
    return;
  }
  if (Math.hypot(x - bar.x, y - bar.y) < 90) { barGrab = "move"; bar.x = x; bar.y = y; rg.sound("click", { volume: 0.4 }); }
}
function barMove(x: number, y: number) {
  if (barGrab === "move") { bar.x = x; bar.y = y; return; }
  if (barGrab === "lever" && bar.on >= 0) {
    const p = pulls[bar.on], h = heelOf(p);
    const a = Math.atan2(x - h.x, h.y - y);
    const na = Math.max(A0, Math.min(A1, a));
    // the claw lifts the nail as the handle goes down
    const lift = Math.max(0, (na - A0) / (A1 - A0)) * 42;
    const want = p.h0 + lift;
    const got = Math.min(want, p.h0 + p.e);
    if (Math.floor(got / 8) !== Math.floor(p.h / 8)) rg.sound("tick", { volume: 0.5 });
    p.h = got;
    bar.a = na;
    if (p.h >= p.h0 + p.e - 0.5 && p.out < 0) nailOut(bar.on);
  }
}
function nailOut(i: number) {
  const p = pulls[i];
  p.out = K.t;
  barGrab = "";
  rg.sound("pop"); rg.vibrate(30);
  bar.on = -1; bar.a = A0;
  const left = pulls.filter((q) => q.out < 0);
  if (left.length === 0) { win(p.x, BY - 60, ["rk_v_irti"]); return; }
  rg.say("rk_v_irti");
  if (step() === 0) bar.on = pulls.indexOf(left[0]);
  else { bar.x = p.x + 60; bar.y = BY - 60; }
}
function barUp() {
  if (barGrab === "lever" && bar.on >= 0) {
    const p = pulls[bar.on];
    // the nail stays up as far as it came; the handle springs back up
    p.e -= p.h - p.h0;
    p.h0 = p.h;
    bar.a = A0;
    if (p.h - p.h0 < 1 && bar.a0 === A0) {}
  }
  if (barGrab === "move") {
    // hook it if the claw (the bar's grip point) is at a nail's head
    let done = false;
    pulls.forEach((p, i) => {
      if (!done && p.out < 0 && Math.abs(bar.x - p.x) < 44 && Math.abs(bar.y - (BY - p.h)) < 60) { bar.on = i; bar.a = A0; done = true; rg.sound("pop"); rg.say("rk_v_paina"); }
    });
    if (!done) {
      const n = miss();
      hintT = K.t;
      rg.say(n >= 2 ? "rk_v_vihje_sorkka" : "kokeile_toista");
      bar.x = width - 130; bar.y = height - 80;
    }
  }
  barGrab = "";
}

function tick(dt: number, input: any) {
  const before = K.t - swingT;
  update(dt);
  if (K.mode !== "play") return;
  if (before < 0.1 && K.t - swingT >= 0.1) land();
  if (K.level === 1 && K.t - swingT > 0.35) sway = Math.sin(K.t * [1.8, 2.6, 3.6][step()]) * 54;
  if (K.level === 5) {
    if (chis.grab && input && input.pointer) { if (input.pointer.down) chiselMove(input.pointer.x); else chiselUp(); }
    for (const c of chips) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 900 * dt; }
    chips = chips.filter((c) => K.t - c.t < 1.2);
  }
  if (barGrab && input && input.pointer) {
    if (input.pointer.down) barMove(input.pointer.x, input.pointer.y); else barUp();
  }
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
  else if (K.level === 4) rg.say(bar.on >= 0 ? "rk_v_paina" : "rk_v_vihje_sorkka");
  else if (K.level === 5) rg.say("rk_v_vihje_taltta");
  else rg.say("rk_v_vihje_naulaa");
}

function onBack() { grab = ""; barGrab = ""; chis.grab = false; back(); }

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

// a crowbar: the claw's tip at (cx, cy) under a nail head, the heel on the board at
// (hx, hy), the handle going up from the heel at angle a (0 = straight up)
function Crowbar(cx: number, cy: number, hx: number, hy: number, a: number, s: number) {
  const L = BAR_L * s;
  const ex = hx + Math.sin(a) * L, ey = hy - Math.cos(a) * L;
  const knee = [hx - 4 * s, hy - 8 * s];
  return [
    Line([[cx - 6 * s, cy + 2 * s], [cx + 4 * s, cy + 6 * s], knee, [hx + 2 * s, hy - 2 * s]], "#9d0208", 10 * s),
    Line([[hx, hy - 4 * s], [ex, ey]], "#c1121f", 12 * s),
    Line([[hx + Math.sin(a) * L * 0.75, hy - Math.cos(a) * L * 0.75], [ex, ey]], "#212529", 14 * s),
    Poly([[cx - 12 * s, cy - 2 * s], [cx - 2 * s, cy - 4 * s], [cx - 2 * s, cy + 6 * s]], "#343a40"),
  ];
}
// a chisel standing on its blade tip at (x, y): a steel blade with the bevel on
// the right, a yellow handle and a steel cap on top
function Chisel(x: number, y: number, s: number) {
  const w = CW * s;
  return [
    Poly([[x - w / 2, y - 64 * s], [x + w / 2, y - 64 * s], [x + w / 2, y - 14 * s], [x - w / 2 + 3 * s, y], [x - w / 2, y]], "#ced4da", "#495057", 2 * s),
    Poly([[x + w / 2, y - 14 * s], [x - w / 2 + 3 * s, y], [x + w / 2 - 6 * s, y - 14 * s]], "#adb5bd"),
    Poly(rect(x - 5 * s, y - 80 * s, 10 * s, 18 * s), "#868e96", "#495057", 1.5 * s),
    Poly([[x - 10 * s, y - 80 * s], [x + 10 * s, y - 80 * s], [x + 12 * s, y - 124 * s], [x - 12 * s, y - 124 * s]], "#ffb703", "#b07d00", 2 * s),
    Poly(rect(x - 11 * s, y - 132 * s, 22 * s, 8 * s), "#6c757d", "#343a40", 1.5 * s),
  ];
}

// the bar lying free, its claw at (x, y)
function FreeBar(x: number, y: number) {
  return Crowbar(x, y, x + 18, y + 16, 1.15, 0.8);
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
    : K.level === 5 ? rg.t("Tee kolo taltalla", "Cut a notch with the chisel", "Haz una muesca con el formón")
    : K.level === 4 ? (bar.on >= 0 ? rg.t("Paina vartta alas", "Push the handle down", "Baja el mango") : rg.t("Vie sorkka naulaan", "Hook the nail", "Engancha el clavo"))
    : rg.t("Lyö naulat puuhun", "Hammer the nails in", "Clava los clavos");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  if (K.level === 3) for (const e of House(width / 2, 210, 0.75, part + (K.solved >= 0 ? 1 : 0))) out.push(e);
  for (const e of Board()) out.push(e);
  if (K.level === 4) { PlayBar(out); return <div className="screen">{out}</div>; }
  if (K.level === 5) { PlayChisel(out); return <div className="screen">{out}</div>; }
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

function PlayBar(out: any[]) {
  const hinting = K.t - hintT < 5;
  // a tin for the nails that came out
  out.push(Poly([[20, BY - 60], [70, BY - 60], [66, BY], [24, BY]], "#adb5bd", "#6c757d", 2));
  const done = pulls.filter((p) => p.out >= 0 && K.t - p.out > 0.6).length;
  for (let i = 0; i < done; i++) out.push(Line([[30 + i * 9, BY - 52], [38 + i * 9, BY - 70]], "#868e96", 4));
  pulls.forEach((p, i) => {
    if (p.out >= 0) {
      const k = Math.min(1, (K.t - p.out) / 0.6);
      if (k < 1) {
        const x = p.x + (45 - p.x) * k, y = BY - p.h - Math.sin(k * Math.PI) * 120 - (BY - 60 - (BY - p.h)) * 0 + (60 - p.h) * k * 0;
        for (const e of NailPic(x, y + p.h, p.h, 0, false)) out.push(e);
      }
      return;
    }
    // the hole's dark ring and the nail
    for (const e of NailPic(p.x, BY, p.h, 0, false)) out.push(e);
    if (step() > 0 && bar.on < 0 && (K.question === 0 || hinting) && barGrab === "move") out.push(Circle(p.x, BY - p.h, 26, "rgba(6,214,160,0.3)", "#06d6a0"));
  });
  if (bar.on >= 0) {
    const p = pulls[bar.on], h = heelOf(p);
    for (const e of Crowbar(p.x - 2, BY - p.h + 3, h.x, h.y, bar.a, 1)) out.push(e);
    const e = handleEnd(p, bar.a);
    if (barGrab !== "lever" && K.solved < 0 && (K.question === 0 || hinting || step() === 0)) {
      out.push(Circle(e.x, e.y, 22, "rgba(247,127,0,0.3)", "#f77f00"));
      out.push(Line([[e.x + 10, e.y + 30], [e.x + 50, e.y + 120]], "#f77f00", 8));
      out.push(Poly([[e.x + 60, e.y + 142], [e.x + 34, e.y + 124], [e.x + 62, e.y + 108]], "#f77f00"));
    }
  } else {
    for (const e of FreeBar(bar.x, bar.y)) out.push(e);
    if (barGrab !== "move" && K.solved < 0 && (K.question === 0 || hinting)) out.push(PointAt(bar.x + 20, bar.y - 40, "#f77f00"));
  }
}

function PlayChisel(out: any[]) {
  const hinting = K.t - hintT < 5;
  // the cut wood: light inside the notch, column by column (runs of equal depth)
  let i = 0;
  while (i < cut.length) {
    if (cut[i] <= 0) { i++; continue; }
    let j = i;
    while (j < cut.length && cut[j] === cut[i]) j++;
    out.push(Box(colX(i), BY, (j - i) * COL, cut[i], "#fff3d6", 0));
    out.push(Line([[colX(i), BY + cut[i]], [colX(j), BY + cut[i]]], WOOD2, 2));
    i = j;
  }
  // pencil lines on the face and the depth line
  for (const n of notches) {
    const l = colX(n.a), r = colX(n.b);
    out.push(Line([[l, BY - 16], [l, BY + DEEP]], "#343a40", 2));
    out.push(Line([[r, BY - 16], [r, BY + DEEP]], "#343a40", 2));
    out.push(Line([[l, BY + DEEP], [r, BY + DEEP]], "rgba(52,58,64,0.55)", 2));
    const todo = cut.slice(n.a, n.b).some((c) => c < DEEP);
    if (todo && (hinting || (K.question === 0 && step() > 0 && !chis.grab && K.misses > 0))) out.push(Box(l, BY - 4, r - l, DEEP + 4, "rgba(6,214,160,0.3)", 2));
  }
  for (const c of chips) out.push(Poly([[c.x, c.y], [c.x + 7, c.y - 2], [c.x + 5, c.y + 3]], "#e9c46a", WOOD2, 1));
  // the chisel is held up a little between blows, so the lines and the cut show
  const d = K.t - swingT;
  const lift = chis.grab ? 40 : d < 0.1 ? 36 * (1 - d / 0.1) : d < 0.4 ? 0 : d < 0.6 ? 36 * (d - 0.4) / 0.2 : 36;
  const ty = tipY() - (K.solved >= 0 ? 36 : lift);
  for (const e of Chisel(chis.x, ty, 1)) out.push(e);
  if (K.solved < 0) for (const e of Hammer(chis.x, ty - 132, hammerAngle(), chis.x > width * 0.62 ? -1 : 1)) out.push(e);
  if (K.solved < 0 && !chis.grab && K.question === 0 && K.misses === 0) {
    if (step() > 0 && under().some((q) => !inNotch(q))) out.push(PointAt(chis.x, ty - 180, "#f77f00"));
    else if (step() === 0) out.push(PointAt(chis.x, ty - 200, "#f77f00"));
  }
}

setup(rg.t("Vasara", "Hammer", "Martillo"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
