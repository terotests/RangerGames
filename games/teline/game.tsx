// SPDX-License-Identifier: AGPL-3.0-or-later
// Telinekiipeily (Scaffold Scramble): a climbing game. Ported from
// terotests/componentengine, playground/src/evg/games/scaffold.tsx.
//
// Grumble the crane-bot has rolled up the night-shift scaffold and a kitten
// is stuck on the beam above him. He keeps rolling cable spools down the
// girders. Help Pip the builder climb up to the kitten.
//
// The phone version: the 640×480 scaffold sits at the top of a tall screen
// and big buttons under it walk (◀ ▶), climb (▲ ▼) and jump. A tap on the
// scaffold jumps too. Arrow keys and Space work on a keyboard.
// Easier than the arcade original, for children: five builders, slower
// spools, ladders are easy to grab, and the bonus running out costs nothing.
// A wrench smashes spools for a few seconds (no climbing then).

type Girder = { x0: number; x1: number; yL: number; yR: number };
type Ladder = { x: number; lo: number; hi: number; broken: boolean };
type Spool = { g: number; x: number; y: number; dir: number; fall: boolean; vy: number;
  down: number; checked: number; jumped: boolean; spin: number };
type Mode = "title" | "play" | "dying" | "cleared" | "over";
type Btn = { id: string; x: number; y: number; w: number; h: number; label: string };

const W = 640;
const FY = 64;   // the scaffold's top on the screen
const R = 9;     // spool radius (for hits; drawn a little larger)
const THROW_X = 142; // where Grumble puts a spool down
const LIVES = 5;

// girders from the bottom (0) to Grumble's (5); the kitten's perch is 6
const G: Girder[] = [
  { x0: 0, x1: 640, yL: 462, yR: 450 },
  { x0: 0, x1: 596, yL: 376, yR: 390 },
  { x0: 44, x1: 640, yL: 306, yR: 292 },
  { x0: 0, x1: 596, yL: 220, yR: 234 },
  { x0: 44, x1: 640, yL: 150, yR: 136 },
  { x0: 0, x1: 430, yL: 86, yR: 86 },
  { x0: 250, x1: 340, yL: 46, yR: 46 },
];
// the direction a spool rolls on each girder (downhill)
const ROLL = [-1, 1, -1, 1, -1, 1, 0];

const L: Ladder[] = [
  { x: 520, lo: 0, hi: 1, broken: false },
  { x: 250, lo: 0, hi: 1, broken: true },
  { x: 110, lo: 1, hi: 2, broken: false },
  { x: 330, lo: 1, hi: 2, broken: true },
  { x: 470, lo: 2, hi: 3, broken: false },
  { x: 220, lo: 2, hi: 3, broken: false },
  { x: 150, lo: 3, hi: 4, broken: false },
  { x: 380, lo: 3, hi: 4, broken: true },
  { x: 390, lo: 4, hi: 5, broken: false },
  { x: 310, lo: 5, hi: 6, broken: false },
];

// the buttons under the scaffold
const BY = FY + 480 + 130;
const BTNS: Btn[] = [
  { id: "left", x: 16, y: BY + 150, w: 180, h: 190, label: "◀" },
  { id: "right", x: 212, y: BY + 150, w: 180, h: 190, label: "▶" },
  { id: "up", x: 436, y: BY, w: 188, h: 150, label: "▲" },
  { id: "jump", x: 420, y: BY + 166, w: 204, h: 160, label: "" },
  { id: "down", x: 436, y: BY + 342, w: 188, h: 150, label: "▼" },
];

function sy(g: number, x: number): number {
  const q = G[g];
  const t = Math.max(0, Math.min(1, (x - q.x0) / (q.x1 - q.x0)));
  return q.yL + (q.yR - q.yL) * t;
}

// ---- state ------------------------------------------------------------------

let mode: Mode = "title";
let score = 0;
let best = 0;
let newBest = false;
let lives = LIVES;
let level = 1;
let bonus = 5000;
let bonusClock = 0;
let clock = 0;
let modeClock = 0;

const P = { x: 40, y: 0, g: 0, vx: 0, vy: 0, air: false, climb: -1, face: 1, walk: 0, wrench: 0 };
let spools: Spool[] = [];
let throwClock = 0;
let throwAnim = 0;
let wrenches: { g: number; x: number; taken: boolean }[] = [];
let popups: { x: number; y: number; text: string; t: number }[] = [];
let held: any = {};      // buttons held down this frame
let shown: any = {};     // the same, for drawing (tick clears held)

function init() {
  best = rg.load("best", 0);
  resetLevel();
}

function resetLevel() {
  P.x = 40; P.g = 0; P.y = sy(0, P.x + 8); P.vx = 0; P.vy = 0; P.air = false; P.climb = -1; P.face = 1; P.wrench = 0;
  spools = [];
  throwClock = 1.6;
  bonus = 5000;
  bonusClock = 0;
  wrenches = [{ g: 1, x: 60, taken: false }, { g: 3, x: 540, taken: false }];
  popups = [];
}

function newGame() {
  score = 0; lives = LIVES; level = 1; newBest = false;
  resetLevel();
  mode = "play";
  modeClock = 0;
  rg.sound("click");
  rg.music("happy", { volume: 0.6 });
}

function pop(x: number, y: number, text: string) {
  popups.push({ x, y, text, t: 0.8 });
}

function jump() {
  if (mode === "title") { newGame(); return; }
  if (mode === "over") { if (modeClock > 1) newGame(); return; }
  if (mode !== "play" || P.air || P.climb >= 0) return;
  P.air = true;
  P.vy = -235;
  P.vx = ((held.left ? -1 : 0) + (held.right ? 1 : 0)) * 110;
  rg.sound("jump", { volume: 0.6 });
}

function btnAt(x: number, y: number): string {
  for (const b of BTNS) {
    if (x >= b.x - 8 && x < b.x + b.w + 8 && y >= b.y - 8 && y < b.y + b.h + 8) return b.id;
  }
  return "";
}

function onPointerDown(x: number, y: number) {
  const b = btnAt(x, y);
  if (b === "jump" || (y >= FY && y < FY + 480) || mode !== "play") jump();
  else if (b) held[b] = true; // a tap shorter than a frame still moves a step
}

function onKeyDown(key: string) {
  if (key === " " || key === "Enter") jump();
}

function onBack() {
  if (mode === "title") rg.exit();
  else { mode = "title"; rg.stopMusic(); }
}

// ---- the frame --------------------------------------------------------------

function readInput() {
  const k = __input.keys;
  const h: any = {
    left: k["ArrowLeft"] || k["a"], right: k["ArrowRight"] || k["d"],
    up: k["ArrowUp"] || k["w"], down: k["ArrowDown"] || k["s"],
  };
  for (const p of __input.pointers) {
    if (!p.down) continue;
    const b = btnAt(p.x, p.y);
    if (b) h[b] = true;
  }
  // a quick tap from onPointerDown counts for this frame
  for (const id in held) if (held[id]) h[id] = true;
  held = h;
}

function tick(dt: number) {
  readInput();
  dt = Math.min(dt, 1 / 30);
  clock += dt;
  modeClock += dt;
  for (const p of popups) { p.t -= dt; p.y -= 30 * dt; }
  popups = popups.filter((p) => p.t > 0);
  if (mode === "dying") {
    if (modeClock > 1.4) {
      if (lives <= 0) gameOver();
      else { resetLevel(); mode = "play"; }
      modeClock = 0;
    }
    clearTaps();
    return;
  }
  if (mode === "cleared") {
    if (modeClock > 2.4) { level++; resetLevel(); mode = "play"; modeClock = 0; }
    clearTaps();
    return;
  }
  if (mode !== "play") { clearTaps(); return; }

  // the bonus runs down (to zero; that costs nothing here)
  bonusClock += dt;
  if (bonusClock >= 2) { bonusClock -= 2; bonus = Math.max(0, bonus - 100); }
  if (P.wrench > 0) P.wrench = Math.max(0, P.wrench - dt);

  movePlayer(dt, held.left, held.right, held.up, held.down);
  moveSpools(dt);
  grumble(dt);

  // wrenches
  for (const w of wrenches) {
    if (w.taken) continue;
    const wy = sy(w.g, w.x) - 26;
    if (P.climb < 0 && Math.abs(P.x + 8 - w.x) < 18 && P.y > wy && P.y - 30 < wy + 14) {
      w.taken = true;
      P.wrench = 7;
      pop(w.x, wy, rg.t("JAKOAVAIN!", "WRENCH!", "¡LLAVE!"));
      rg.sound("coin", { pitch: 1.3 });
      rg.vibrate(20);
    }
  }

  // the kitten
  if (P.g === 6 && P.climb < 0) {
    score += bonus;
    pop(P.x, P.y - 40, "+" + bonus);
    mode = "cleared";
    modeClock = 0;
    rg.celebrate(295, FY + 30, { big: true });
    rg.vibrate(60);
    rg.say(level === 1 ? "hienoa" : level === 2 ? "mahtavaa" : "loistavaa");
  }
  clearTaps();
}

function clearTaps() { shown = held; held = {}; }

function gameOver() {
  mode = "over";
  rg.stopMusic();
  if (score > best) { best = score; newBest = true; rg.save("best", best); rg.celebrate(W / 2, FY + 200, { big: true, sound: false }); }
  rg.sound("lose");
  rg.say(newBest ? "uusi_ennatys" : "voi_ei");
}

function die() {
  if (mode !== "play") return;
  pop(P.x - 6, P.y - 44, rg.t("AU!", "OUCH!", "¡AY!"));
  lives--;
  mode = "dying";
  modeClock = 0;
  rg.sound("hit");
  rg.vibrate([60, 40, 120]);
  if (lives > 0) rg.say(lives === 1 ? "ei_haittaa" : "hups");
}

// a ladder within easy reach: children's thumbs are not pixel-exact
function ladderAt(g: number, goingUp: boolean): Ladder | null {
  let bestL: Ladder | null = null;
  let bestD = 18;
  for (const l of L) {
    if (l.broken) continue;
    const d = Math.abs(P.x + 8 - l.x);
    if ((goingUp ? l.lo : l.hi) === g && d < bestD) { bestL = l; bestD = d; }
  }
  return bestL;
}

function movePlayer(dt: number, left: boolean, right: boolean, up: boolean, down: boolean) {
  if (P.climb >= 0) {
    const l = L[P.climb];
    const top = sy(l.hi, l.x), bottom = sy(l.lo, l.x);
    if (up) { P.y -= 80 * dt; P.walk += dt * 8; }
    if (down) { P.y += 80 * dt; P.walk += dt * 8; }
    if (P.y <= top) { P.y = top; P.g = l.hi; P.climb = -1; }
    else if (P.y >= bottom) { P.y = bottom; P.g = l.lo; P.climb = -1; }
    return;
  }
  if (!P.air) {
    // onto a ladder (not while carrying the wrench)
    if (P.wrench <= 0 && (up || down)) {
      const l = ladderAt(P.g, up);
      if (l) { P.climb = L.indexOf(l); P.x = l.x - 8; return; }
    }
    P.vx = 0;
    if (left) { P.vx = -95; P.face = -1; }
    if (right) { P.vx = 95; P.face = 1; }
    if (P.vx !== 0) P.walk += dt * 10;
    P.x += P.vx * dt;
    P.x = Math.max(G[P.g].x0, Math.min(G[P.g].x1 - 16, P.x));
    P.y = sy(P.g, P.x + 8);
  } else {
    P.x += P.vx * dt;
    P.x = Math.max(G[P.g].x0, Math.min(G[P.g].x1 - 16, P.x));
    P.vy += 700 * dt;
    P.y += P.vy * dt;
    const floor = sy(P.g, P.x + 8);
    if (P.vy > 0 && P.y >= floor) { P.y = floor; P.air = false; P.vy = 0; }
  }
}

function moveSpools(dt: number) {
  const speed = Math.min(150, 78 + level * 12);
  for (const s of spools) {
    s.spin += dt * speed * s.dir / R;
    if (s.down > 0) {
      // going down a ladder
      s.y += 80 * dt;
      const floor = sy(s.down - 1, s.x) - R;
      if (s.y >= floor) { s.g = s.down - 1; s.down = 0; s.dir = ROLL[s.g]; s.y = floor; }
    } else if (s.fall) {
      s.vy += 700 * dt;
      s.y += s.vy * dt;
      if (s.g >= 0) {
        const floor = sy(s.g, s.x) - R;
        if (s.y >= floor) { s.y = floor; s.fall = false; s.vy = 0; s.dir = ROLL[s.g]; }
      }
    } else {
      s.x += s.dir * speed * dt;
      const q = G[s.g];
      if (s.x < q.x0 - 2 || s.x > q.x1 + 2) {
        s.fall = true;
        s.vy = 0;
        s.g = s.g - 1; // the girder below, or -1 off the bottom
      } else {
        s.y = sy(s.g, s.x) - R;
        // a ladder down: decided once per ladder
        for (const l of L) {
          if (l.hi === s.g && !l.broken && Math.abs(s.x - l.x) < 3 && s.checked !== L.indexOf(l)) {
            s.checked = L.indexOf(l);
            if (rg.random() < Math.min(0.45, 0.15 + level * 0.05)) { s.down = s.g; s.x = l.x; }
          }
        }
      }
    }
    // the player (a forgiving box)
    const px = P.x + 8, py = P.y - 12;
    const dx = s.x - px, dy = s.y - py;
    if (mode === "play" && Math.abs(dx) < R + 4 && Math.abs(dy) < R + 8) {
      if (P.wrench > 0 && P.climb < 0) {
        s.y = 9999;
        score += 300;
        pop(s.x, sy(Math.max(s.g, 0), s.x) - 20, "300");
        rg.sound("hit", { pitch: 1.5, volume: 0.6 });
      } else {
        die();
      }
    }
    // jumped over
    if (P.air && !s.jumped && Math.abs(dx) < 12 && s.y > P.y && s.y - P.y < 50 && s.g === P.g) {
      s.jumped = true;
      score += 100;
      pop(px, P.y - 30, "100");
      rg.sound("coin", { volume: 0.5 });
    }
  }
  spools = spools.filter((s) => s.y < 600 && s.x > -40);
}

function grumble(dt: number) {
  throwAnim = Math.max(0, throwAnim - dt);
  throwClock -= dt;
  if (throwClock <= 0) {
    throwClock = Math.max(1.6, 3.2 - level * 0.25) + rg.random() * 1.2;
    throwAnim = 0.4;
    spools.push({ g: 5, x: THROW_X, y: sy(5, THROW_X) - R, dir: 1, fall: false, vy: 0, down: 0, checked: -1, jumped: false, spin: 0 });
  }
}

// ---- view -------------------------------------------------------------------

function pad(n: number, w: number) {
  let s = String(n);
  while (s.length < w) s = "0" + s;
  return s;
}

// a little pseudo-random sequence, so the stars and windows are the same
// every time the scene is built
let seed = 7;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed % 10000) / 10000;
}

// The sky, the city, the girders and the ladders never change: built once,
// and kept small (few stars and windows, long girder pieces): every box costs
// layout time on an old phone.
let scene: any = null;

function Sky() {
  const out: any[] = [<div className="sky" />];
  for (let i = 0; i < 12; i++) {
    const big = rnd() < 0.25;
    out.push(<div className={big ? "star bigstar" : "star"} style={{ left: Math.floor(rnd() * 630), top: Math.floor(30 + rnd() * 260) }} />);
  }
  out.push(<div className="moon-glow" style={{ left: 452, top: 26 }} />);
  out.push(<div className="moon" style={{ left: 466, top: 40 }} />);
  out.push(<div className="crater" style={{ left: 478, top: 50, width: 8, height: 8 }} />);
  out.push(<div className="crater" style={{ left: 492, top: 64, width: 6, height: 6 }} />);
  return out;
}

// the city behind the scaffold: towers with a few lit windows
function City() {
  const out: any[] = [];
  const towers = [[0, 360, 70], [64, 330, 54], [112, 390, 80], [186, 300, 46], [226, 350, 74], [296, 320, 60],
    [352, 372, 84], [430, 286, 52], [478, 340, 70], [544, 310, 50], [590, 360, 50]];
  for (const [x, top, w] of towers) {
    out.push(<div className="tower" style={{ left: x, top, width: w, height: 480 - top }} />);
    for (let y = top + 10; y < 470; y += 16) {
      for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (rnd() < 0.07) out.push(<div className={rnd() < 0.3 ? "win warm" : "win"} style={{ left: wx, top: y }} />);
      }
    }
  }
  return out;
}

function Girders() {
  const out: any[] = [];
  G.forEach((q, gi) => {
    for (let x = q.x0; x < q.x1; x += 100) {
      const w = Math.min(100, q.x1 - x);
      out.push(<div className={gi === 6 ? "perch" : "girder"} style={{ left: x, top: sy(gi, x + w / 2), width: w, height: 10 }} />);
    }
  });
  return out;
}

function Ladders() {
  const out: any[] = [];
  for (const l of L) {
    const top = sy(l.hi, l.x) + 10, bottom = sy(l.lo, l.x);
    const segs = l.broken ? [[top, top + 14], [bottom - 14, bottom]] : [[top, bottom]];
    for (const [a, b] of segs) {
      out.push(<div className="rail" style={{ left: l.x - 10, top: a, height: b - a }} />);
      out.push(<div className="rail" style={{ left: l.x + 7, top: a, height: b - a }} />);
      for (let y = a + 4; y < b - 1; y += 12) out.push(<div className="rung" style={{ left: l.x - 8, top: y }} />);
    }
  }
  return out;
}

// a stack of spare cable spools, Grumble's supply
function Stack() {
  const top = sy(5, 10) - 20;
  return [[0, top], [20, top], [10, top - 19]].map(([x, y]) => (
    <div className="spool" style={{ left: x, top: y }}>
      <div className="spool-spoke" />
      <div className="spool-hub" />
    </div>
  ));
}

// Pip the builder: a hard hat, red overalls, boots. From behind on a ladder.
function Hero() {
  const flash = mode === "dying" && Math.floor(modeClock * 10) % 2 === 0;
  const step = Math.floor(P.walk) % 2;
  const climbing = P.climb >= 0;
  const right = P.face > 0;
  const swing = P.vx !== 0 || climbing ? step : 0;
  const hold = P.wrench > 0;
  const up = Math.floor(clock * 8) % 2;
  return (
    <div className="hero" style={{ left: P.x - 2, top: P.y - 30 }}>
      {hold ? <div className="power" style={{ left: -8, top: -6, opacity: 0.25 + 0.2 * up }} /> : null}
      <div className="hero-boot" style={{ left: 3, top: swing ? 25 : 26 }} />
      <div className="hero-boot" style={{ left: 11, top: swing ? 26 : 25 }} />
      <div className="hero-arm" style={{ left: 0, top: climbing ? (step ? 8 : 12) : (swing ? 15 : 14) }} />
      <div className="hero-arm" style={{ left: 16, top: climbing ? (step ? 12 : 8) : (swing ? 14 : 15) }} />
      <div className={flash ? "hero-body hurt" : "hero-body"} />
      <div className="hero-strap" style={{ left: 7 }} />
      <div className="hero-strap" style={{ left: 11 }} />
      <div className={climbing ? "hero-face back" : "hero-face"} />
      {!climbing ? <div className="hero-eye" style={{ left: right ? 11 : 6 }} /> : null}
      {!climbing ? <div className="hero-cheek" style={{ left: right ? 13 : 5 }} /> : null}
      <div className="hero-hat" />
      <div className="hero-brim" style={{ left: climbing ? 3 : right ? 8 : 2 }} />
      {hold ? <div className="wrench-held" style={{ left: right ? 17 : -9, top: up ? 4 : 10, transform: up ? "rotate(-40deg)" : "rotate(20deg)" }} /> : null}
    </div>
  );
}

// Grumble: a big crane-bot on treads, with a cab for a head and a boom arm.
// Now and then his lamp flashes and he honks; when he puts a spool down the
// boom swings up with the spool on its hook.
function Grumble() {
  const throwing = throwAnim > 0;
  const honking = !throwing && clock % 7 > 5.6;
  const beat = Math.floor(clock * 7) % 2;
  const blink = !throwing && Math.floor(clock * 3) % 11 === 0;
  const look = throwing ? 2 : Math.floor(clock / 2) % 3 - 1;
  const cross = throwing || honking;
  const cheer = mode === "dying";
  const lampOn = cross ? beat === 1 : cheer;
  const roll = Math.floor(clock * 6) % 2;
  return (
    <div className="crane" style={{ left: 30, top: sy(5, 60) - 86 + (honking && beat ? 1 : 0) }}>
      <div className="crane-tread" />
      {[8, 26, 44, 62, 80].map((x) => <div className="crane-wheel" style={{ left: x + (roll ? 1 : 0) }} />)}
      <div className="crane-body" />
      <div className="crane-stripe" />
      <div className="crane-bolt" style={{ left: 22, top: 48 }} />
      <div className="crane-bolt" style={{ left: 84, top: 48 }} />
      <div className="crane-boom" style={{ left: 86, top: throwing ? 14 : 34, transform: throwing ? "rotate(-35deg)" : "rotate(10deg)" }} />
      <div className="crane-cable" style={{ left: 108, top: throwing ? 4 : 38 }} />
      {throwing ? <div className="spool held" style={{ left: 99, top: 14 }}>
        <div className="spool-spoke" style={{ transform: "rotate(90deg)" }} />
        <div className="spool-hub" />
      </div> : <div className="crane-hook" style={{ left: 104, top: 50 }} />}
      <div className="crane-arm" style={{ left: 2, top: cheer ? 26 : 34 }} />
      <div className="crane-claw" style={{ left: 0, top: cheer ? 22 : 56 }} />
      <div className="crane-cab" />
      <div className="crane-screen" />
      <div className={blink ? "crane-eye shut" : "crane-eye"} style={{ left: 40 + look }} />
      <div className={blink ? "crane-eye shut" : "crane-eye"} style={{ left: 58 + look }} />
      {cross ? <div className="crane-brow" style={{ left: 38, transform: "rotate(15deg)" }} /> : null}
      {cross ? <div className="crane-brow" style={{ left: 56, transform: "rotate(-15deg)" }} /> : null}
      <div className={cross || cheer ? "crane-grille open" : "crane-grille"} />
      <div className="crane-antenna" />
      <div className={lampOn ? "crane-lamp on" : "crane-lamp"} />
      {honking ? <div className="roar-text" style={{ left: 96, top: 2 }}>TÖÖT!</div> : null}
      {cheer ? <div className="roar-text" style={{ left: 96, top: 2 }}>PIIP PIIP!</div> : null}
    </div>
  );
}

function Spools() {
  return spools.map((s) => (
    <div className="spool" style={{ left: s.x - 10, top: s.y - 10 }}>
      <div className="spool-spoke" style={{ transform: "rotate(" + Math.round((s.spin * 57.3) % 360) + "deg)" }} />
      <div className="spool-hub" />
    </div>
  ));
}

function Kitten() {
  const blink = Math.floor(clock * 2) % 6 === 0;
  const wag = Math.floor(clock * 3) % 2;
  const help = rg.t("apua!", "help!", "¡ayuda!");
  return (
    <div className="kitten" style={{ left: 280, top: 20 }}>
      <div className="kitten-tail" style={{ left: wag ? 19 : 20, top: wag ? 9 : 10, transform: wag ? "rotate(20deg)" : "rotate(-10deg)" }} />
      <div className="kitten-body" />
      <div className="kitten-ear" style={{ left: 2 }} />
      <div className="kitten-ear" style={{ left: 11 }} />
      <div className="kitten-head" />
      <div className="kitten-stripe" />
      <div className={blink ? "kitten-eye closed" : "kitten-eye"} style={{ left: 5 }} />
      <div className={blink ? "kitten-eye closed" : "kitten-eye"} style={{ left: 12 }} />
      <div className="kitten-nose" />
      {Math.floor(clock) % 4 < 2 && mode !== "cleared" ? (
        <div className="bubble" style={{ left: -52, top: -14 }}><div className="bubble-text">{help}</div></div>
      ) : null}
      {mode === "cleared" ? <div className="bubble" style={{ left: -52, top: -14 }}><div className="bubble-text">{rg.t("kehr!", "purr!", "¡rrr!")}</div></div> : null}
    </div>
  );
}

function Wrench(props: { x: number; y: number }) {
  const glow = 0.18 + 0.12 * Math.sin(clock * 6);
  return (
    <div className="wrench" style={{ left: props.x - 12, top: props.y }}>
      <div className="wrench-glow" style={{ opacity: glow }} />
      <div className="wrench-handle" style={{ transform: "rotate(35deg)" }} />
      <div className="wrench-head" />
    </div>
  );
}

function Hud() {
  const hearts: any[] = [];
  for (let i = 0; i < lives; i++) hearts.push(<div className="life" />);
  return (
    <div className="hud">
      <div className="hud-col">
        <div className="hud-label">{rg.t("PISTEET", "SCORE", "PUNTOS")}</div>
        <div className="hud-value">{pad(score, 6)}</div>
      </div>
      <div className="hud-col">
        <div className="hud-label">{rg.t("ENNÄTYS", "BEST", "RÉCORD")}</div>
        <div className="hud-value">{pad(Math.max(best, score), 6)}</div>
      </div>
      <div className="bonus-box">
        <div className="hud-label">BONUS</div>
        <div className={bonus <= 1000 ? "bonus-value low" : "bonus-value"}>{pad(bonus, 4)}</div>
      </div>
      <div className="lives">{hearts}</div>
      <div className="hud-level">{rg.t("Taso ", "Level ", "Nivel ") + level}</div>
    </div>
  );
}

function Banner(props: { title: string; lines: string[] }) {
  return (
    <div className="banner" style={{ left: W / 2 - 220, top: 120 }}>
      <div className="banner-title">{props.title}</div>
      {props.lines.map((l, i) => <div className={i === props.lines.length - 1 ? "banner-line go" : "banner-line"}>{l}</div>)}
    </div>
  );
}

function Scene() {
  seed = 7;
  return (
    <div className="scene">
      {Sky()}
      {City()}
      {Girders()}
      {Ladders()}
      {Stack()}
    </div>
  );
}

function Button(b: Btn) {
  const on = !!shown[b.id] || (b.id === "jump" && mode === "play" && P.air);
  const cls = "btn " + (b.id === "jump" ? "btn-jump" : "btn-dir") + (on ? " pressed" : "");
  const text = b.id === "jump" ? rg.t("HYPPY", "JUMP", "SALTA") : b.label;
  return (
    <div className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
      <div className={b.id === "jump" ? "btn-text jump-text" : "btn-text"}>{text}</div>
    </div>
  );
}

function view() {
  if (!scene) scene = Scene();
  return (
    <div className="screen">
      {Hud()}
      <div className="field" style={{ top: FY }}>
        {scene}
        {Grumble()}
        {Kitten()}
        {wrenches.filter((w) => !w.taken).map((w) => Wrench({ x: w.x, y: sy(w.g, w.x) - 30 + Math.sin(clock * 4) * 2 }))}
        {Spools()}
        {mode !== "title" ? Hero() : null}
        {popups.map((p) => <div className="popup" style={{ left: p.x - 12, top: p.y }}>{p.text}</div>)}
        {mode === "title" ? Banner({ title: rg.t("TELINEKIIPEILY", "SCAFFOLD SCRAMBLE", "ESCALADA"), lines: [
          rg.t("Nosturirobotti vierittää kaapelikeloja!", "Grumble the crane-bot is rolling spools!", "¡El robot grúa lanza bobinas!"),
          rg.t("Kiipeä kissanpennun luo ja hyppää kelojen yli.", "Climb up to the kitten and jump the spools.", "Sube hasta el gatito y salta las bobinas."),
          rg.t("Napauta ja aloita!", "Tap to start!", "¡Toca para empezar!")] }) : null}
        {mode === "cleared" ? Banner({ title: rg.t("KISSA PELASTETTU!", "KITTEN SAVED!", "¡GATITO A SALVO!"), lines: [
          "Bonus " + bonus, rg.t("Seuraavaksi taso ", "Next: level ", "Siguiente: nivel ") + (level + 1)] }) : null}
        {mode === "over" ? Banner({ title: rg.t("PELI PÄÄTTYI", "GAME OVER", "FIN DEL JUEGO"), lines: [
          rg.t("Pisteet ", "Score ", "Puntos ") + score + (newBest ? "  🎉" : ""),
          modeClock > 1 ? rg.t("Napauta ja pelaa uudestaan", "Tap to play again", "Toca para jugar otra vez") : " "] }) : null}
      </div>
      <div className="pad" style={{ top: FY + 480 }} />
      {BTNS.map((b) => Button(b))}
    </div>
  );
}
