// SPDX-License-Identifier: AGPL-3.0-or-later
// Telinekiipeily (Scaffold Scramble): a climbing game. Ported from
// terotests/componentengine, playground/src/evg/games/scaffold.tsx.
//
// Grumble the crane-bot has rolled up the night-shift scaffold and a kitten
// is stuck on the beam above him. He keeps rolling cable spools down the
// girders. Help Pip the builder climb up to the kitten.
//
// The phone version is played with a finger: hold it on the scaffold and Pip
// walks there, and climbs the nearest ladder up or down when the finger is on
// another floor. Pip jumps over a spool rolling at him by himself; a tap on
// Pip or on the big bar at the bottom jumps too. Arrow keys and Space work on
// a keyboard.
// Easier than the arcade original, for children: five builders, slow spools,
// every ladder is whole, a lost builder comes back where he fell (with a
// moment of blinking safety), a spool never comes down a ladder Pip is on,
// and the bonus running out costs nothing. A wrench smashes spools for a few
// seconds.

type Girder = { x0: number; x1: number; yL: number; yR: number };
type Ladder = { x: number; lo: number; hi: number; broken: boolean };
type Spool = { g: number; x: number; y: number; dir: number; fall: boolean; vy: number;
  down: number; checked: number; jumped: boolean; spin: number };
type Mode = "title" | "play" | "dying" | "cleared" | "over";

const W = 640;
const FY = 64;   // the scaffold's top on the screen
const FH = 1040; // the scaffold's height
const JY = FY + FH + 14; // the jump bar
const JH = 1300 - JY - 14;
const R = 9;     // spool radius (for hits; drawn a little larger)
const THROW_X = 142; // where Grumble puts a spool down
const LIVES = 5;

// girders from the bottom (0) to Grumble's (5); the kitten's perch is 6
// (the arcade layout stretched to the phone's tall screen; the slopes are the
// same)
const G: Girder[] = [
  { x0: 0, x1: 640, yL: 966, yR: 954 },
  { x0: 0, x1: 596, yL: 793, yR: 807 },
  { x0: 44, x1: 640, yL: 647, yR: 633 },
  { x0: 0, x1: 596, yL: 473, yR: 487 },
  { x0: 44, x1: 640, yL: 327, yR: 313 },
  { x0: 0, x1: 430, yL: 170, yR: 170 },
  { x0: 250, x1: 340, yL: 90, yR: 90 },
];
// the direction a spool rolls on each girder (downhill)
const ROLL = [-1, 1, -1, 1, -1, 1, 0];

// every ladder is whole here (the arcade's broken ones fooled children)
const L: Ladder[] = [
  { x: 520, lo: 0, hi: 1, broken: false },
  { x: 250, lo: 0, hi: 1, broken: false },
  { x: 110, lo: 1, hi: 2, broken: false },
  { x: 330, lo: 1, hi: 2, broken: false },
  { x: 470, lo: 2, hi: 3, broken: false },
  { x: 220, lo: 2, hi: 3, broken: false },
  { x: 150, lo: 3, hi: 4, broken: false },
  { x: 380, lo: 3, hi: 4, broken: false },
  { x: 390, lo: 4, hi: 5, broken: false },
  { x: 310, lo: 5, hi: 6, broken: false },
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

const P = { x: 40, y: 0, g: 0, vx: 0, vy: 0, air: false, climb: -1, face: 1, walk: 0, wrench: 0, safe: 0 };
let spools: Spool[] = [];
let throwClock = 0;
let throwAnim = 0;
let wrenches: { g: number; x: number; taken: boolean }[] = [];
let popups: { x: number; y: number; text: string; t: number }[] = [];
let keys: any = {};      // arrow keys held this frame
let goal: any = null;    // where the finger wants Pip to go (field coordinates), or null
let fingerDown = false;  // a finger is on the scaffold
let jumpLit = 0;         // the jump bar glows for a moment after a press
let respawnG = 0, respawnX = 40;

function init() {
  best = rg.load("best", 0);
  resetLevel();
}

function placeHero(g: number, x: number) {
  P.g = g; P.x = Math.max(G[g].x0, Math.min(G[g].x1 - 16, x)); P.y = sy(g, P.x + 8);
  P.vx = 0; P.vy = 0; P.air = false; P.climb = -1;
}

function resetLevel() {
  placeHero(0, 40);
  P.face = 1; P.wrench = 0; P.safe = 0;
  spools = [];
  throwClock = 2.4;
  bonus = 5000;
  bonusClock = 0;
  wrenches = [{ g: 1, x: 60, taken: false }, { g: 3, x: 540, taken: false }];
  popups = [];
  goal = null;
}

// from the title: level 1; after a game over the same level goes on
function newGame(again: boolean) {
  score = 0; lives = LIVES; newBest = false;
  if (!again) level = 1;
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
  if (mode === "title") { newGame(false); return; }
  if (mode === "over") { if (modeClock > 1) newGame(true); return; }
  if (mode !== "play" || P.air || P.climb >= 0) return;
  P.air = true;
  P.vy = -235;
  P.vx = Math.sign(P.vx) * 110;
  rg.sound("jump", { volume: 0.6 });
}

function inField(y: number) { return y >= FY && y < FY + FH; }

function onPointerDown(x: number, y: number) {
  if (mode !== "play") { jump(); return; }
  if (y >= FY + FH) { jumpLit = 0.25; jump(); return; }
  if (!inField(y)) return;
  // a tap on Pip jumps; anywhere else is where to go
  const fy = y - FY;
  if (Math.abs(x - (P.x + 8)) < 40 && Math.abs(fy - (P.y - 15)) < 44 && P.climb < 0) { jumpLit = 0.25; jump(); return; }
  goal = { x, y: fy };
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
  keys = {
    left: k["ArrowLeft"] || k["a"], right: k["ArrowRight"] || k["d"],
    up: k["ArrowUp"] || k["w"], down: k["ArrowDown"] || k["s"],
  };
  if (keys.left || keys.right || keys.up || keys.down) goal = null;
  fingerDown = false;
  for (const p of __input.pointers) {
    if (!p.down || !inField(p.y)) continue;
    // a finger held on Pip (a jump) does not walk him
    const fy = p.y - FY;
    if (Math.abs(p.x - (P.x + 8)) < 40 && Math.abs(fy - (P.y - 15)) < 44) continue;
    fingerDown = true;
    goal = { x: p.x, y: fy };
  }
}

// the floor a point on the scaffold belongs to: the girder under it
function floorAt(x: number, y: number): number {
  if (y < sy(6, 295) + 16) return 6;
  let f = 0;
  for (let g = 1; g <= 5; g++) if (y < sy(g, x) + 16) f = g;
  return f;
}

// The finger as arrow keys: walk to the finger on the same floor, otherwise
// to the best ladder towards its floor and up or down it.
function steer(): any {
  const c: any = { left: false, right: false, up: false, down: false };
  if (!goal || P.air) return c;
  const want = floorAt(goal.x, goal.y);
  const px = P.x + 8;
  if (P.climb >= 0) {
    if (want >= L[P.climb].hi) c.up = true; else c.down = true;
    return c;
  }
  let tx = goal.x;
  if (want !== P.g) {
    const up = want > P.g;
    let bestL: Ladder | null = null;
    let bestD = 1e9;
    for (const l of L) {
      if ((up ? l.lo : l.hi) !== P.g) continue;
      const d = Math.abs(l.x - px) + 0.5 * Math.abs(l.x - goal.x);
      if (d < bestD) { bestD = d; bestL = l; }
    }
    if (!bestL) return c;
    if (Math.abs(bestL.x - px) < 8) { if (up) c.up = true; else c.down = true; return c; }
    tx = bestL.x;
  } else if (Math.abs(tx - px) < 8) {
    if (!fingerDown) goal = null;
    return c;
  }
  if (tx < px) c.left = true; else c.right = true;
  return c;
}

function tick(dt: number) {
  readInput();
  dt = Math.min(dt, 1 / 30);
  clock += dt;
  modeClock += dt;
  jumpLit = Math.max(0, jumpLit - dt);
  for (const p of popups) { p.t -= dt; p.y -= 30 * dt; }
  popups = popups.filter((p) => p.t > 0);
  if (mode === "dying") {
    if (modeClock > 1.2) {
      if (lives <= 0) gameOver();
      else respawn();
      modeClock = 0;
    }
    return;
  }
  if (mode === "cleared") {
    if (modeClock > 2.4) { level++; resetLevel(); mode = "play"; modeClock = 0; }
    return;
  }
  if (mode !== "play") return;

  // the bonus runs down (to zero; that costs nothing here)
  bonusClock += dt;
  if (bonusClock >= 2) { bonusClock -= 2; bonus = Math.max(0, bonus - 100); }
  if (P.wrench > 0) P.wrench = Math.max(0, P.wrench - dt);
  if (P.safe > 0) P.safe = Math.max(0, P.safe - dt);

  const s = steer();
  movePlayer(dt, keys.left || s.left, keys.right || s.right, keys.up || s.up, keys.down || s.down);
  autoJump();
  moveSpools(dt);
  grumble(dt);

  // wrenches
  for (const w of wrenches) {
    if (w.taken) continue;
    const wy = sy(w.g, w.x) - 26;
    if (P.climb < 0 && Math.abs(P.x + 8 - w.x) < 22 && P.y > wy && P.y - 30 < wy + 14) {
      w.taken = true;
      P.wrench = 8;
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
    goal = null;
    if (lives < 7) lives++; // a new builder for every kitten saved
    rg.celebrate(295, FY + 70, { big: true });
    rg.vibrate(60);
    rg.say(level === 1 ? "hienoa" : level === 2 ? "mahtavaa" : "loistavaa");
  }
}

function gameOver() {
  mode = "over";
  goal = null;
  rg.stopMusic();
  if (score > best) { best = score; newBest = true; rg.save("best", best); rg.celebrate(W / 2, FY + 400, { big: true, sound: false }); }
  rg.sound("lose");
  rg.say(newBest ? "uusi_ennatys" : "voi_ei");
}

function die() {
  if (mode !== "play" || P.safe > 0) return;
  pop(P.x - 6, P.y - 44, rg.t("AU!", "OUCH!", "¡AY!"));
  lives--;
  mode = "dying";
  modeClock = 0;
  // back where he fell: at the foot of the ladder he was on, or on his girder
  if (P.climb >= 0) { respawnG = L[P.climb].lo; respawnX = L[P.climb].x - 8; }
  else { respawnG = P.g; respawnX = P.x; }
  rg.sound("hit");
  rg.vibrate([60, 40, 120]);
  if (lives > 0) rg.say(lives === 1 ? "ei_haittaa" : "hups");
}

function respawn() {
  placeHero(respawnG, respawnX);
  P.safe = 2.5;
  goal = null;
  // the spools close by roll away
  const py = P.y;
  spools = spools.filter((s) => Math.abs(s.x - P.x) > 150 || Math.abs(s.y - py) > 120);
  mode = "play";
}

// a ladder within easy reach: children's thumbs are not pixel-exact
function ladderAt(g: number, goingUp: boolean): Ladder | null {
  let bestL: Ladder | null = null;
  let bestD = 28;
  for (const l of L) {
    if (l.broken) continue;
    const d = Math.abs(P.x + 8 - l.x);
    if ((goingUp ? l.lo : l.hi) === g && d < bestD) { bestL = l; bestD = d; }
  }
  return bestL;
}

const CLIMB = 170;

function movePlayer(dt: number, left: boolean, right: boolean, up: boolean, down: boolean) {
  if (P.climb >= 0) {
    const l = L[P.climb];
    const top = sy(l.hi, l.x), bottom = sy(l.lo, l.x);
    if (up) { P.y -= CLIMB * dt; P.walk += dt * 10; }
    if (down) { P.y += CLIMB * dt; P.walk += dt * 10; }
    if (P.y <= top) { P.y = top; P.g = l.hi; P.climb = -1; }
    else if (P.y >= bottom) { P.y = bottom; P.g = l.lo; P.climb = -1; }
    return;
  }
  if (!P.air) {
    if (up || down) {
      const l = ladderAt(P.g, up);
      if (l) { P.climb = L.indexOf(l); P.x = l.x - 8; P.vx = 0; return; }
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

function spoolSpeed() { return Math.min(110, 64 + level * 8); }

// Pip hops over a spool rolling at him on his own girder, just in time
function autoJump() {
  if (P.air || P.climb >= 0 || mode !== "play") return;
  const px = P.x + 8;
  for (const s of spools) {
    if (s.fall || s.down > 0 || s.g !== P.g) continue;
    const dx = s.x - px;
    const closing = -Math.sign(dx) * s.dir * spoolSpeed() + Math.sign(dx) * P.vx;
    if (closing <= 0) continue;
    const t = (Math.abs(dx) - 13) / closing;
    if (t > 0 && t < 0.2) { jump(); return; }
  }
}

function moveSpools(dt: number) {
  const speed = spoolSpeed();
  for (const s of spools) {
    s.spin += dt * speed * s.dir / R;
    if (s.down > 0) {
      // going down a ladder
      s.y += 140 * dt;
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
        // a ladder down: decided once per ladder, never the one Pip is on
        for (let i = 0; i < L.length; i++) {
          const l = L[i];
          if (l.hi === s.g && Math.abs(s.x - l.x) < 3 && s.checked !== i) {
            s.checked = i;
            if (P.climb !== i && rg.random() < Math.min(0.35, 0.1 + level * 0.05)) { s.down = s.g; s.x = l.x; }
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
  spools = spools.filter((s) => s.y < FH + 100 && s.x > -40);
}

function grumble(dt: number) {
  throwAnim = Math.max(0, throwAnim - dt);
  throwClock -= dt;
  if (throwClock <= 0) {
    throwClock = Math.max(2.2, 4 - level * 0.25) + rg.random() * 1.5;
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
  for (let i = 0; i < 18; i++) {
    const big = rnd() < 0.25;
    out.push(<div className={big ? "star bigstar" : "star"} style={{ left: Math.floor(rnd() * 630), top: Math.floor(30 + rnd() * 560) }} />);
  }
  out.push(<div className="moon-glow" style={{ left: 452, top: 26 }} />);
  out.push(<div className="moon" style={{ left: 466, top: 40 }} />);
  out.push(<div className="crater" style={{ left: 478, top: 50, width: 8, height: 8 }} />);
  out.push(<div className="crater" style={{ left: 492, top: 64, width: 6, height: 6 }} />);
  return out;
}

// the city behind the scaffold: towers with a few lit windows
const GROUND = 978; // the street under the scaffold

function City() {
  const out: any[] = [];
  const towers = [[0, 780, 70], [64, 715, 54], [112, 845, 80], [186, 650, 46], [226, 760, 74], [296, 695, 60],
    [352, 805, 84], [430, 620, 52], [478, 735, 70], [544, 670, 50], [590, 780, 50]];
  for (const [x, top, w] of towers) {
    out.push(<div className="tower" style={{ left: x, top, width: w, height: GROUND - top }} />);
    for (let y = top + 10; y < GROUND - 10; y += 16) {
      for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (rnd() < 0.05) out.push(<div className={rnd() < 0.3 ? "win warm" : "win"} style={{ left: wx, top: y }} />);
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
  const flash = (mode === "dying" && Math.floor(modeClock * 10) % 2 === 0);
  if (P.safe > 0 && Math.floor(P.safe * 8) % 2 === 0) return null; // blinking: safe for a moment
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
    <div className="banner" style={{ left: W / 2 - 220, top: 360 }}>
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
      <div className="street" style={{ top: GROUND }} />
      <div className="kerb" style={{ top: GROUND }} />
    </div>
  );
}

// the jump bar under the scaffold
function JumpBar() {
  const on = jumpLit > 0 || (mode === "play" && P.air);
  return (
    <div className={on ? "btn btn-jump pressed" : "btn btn-jump"} style={{ left: 16, top: JY, width: W - 32, height: JH }}>
      <div className="btn-text jump-text">{rg.t("HYPPY", "JUMP", "SALTA")}</div>
    </div>
  );
}

// where the finger sent Pip
function Goal() {
  if (!goal || mode !== "play") return null;
  const f = floorAt(goal.x, goal.y);
  const gx = Math.max(G[f].x0 + 8, Math.min(G[f].x1 - 8, goal.x));
  return <div className="goal" style={{ left: gx - 14, top: sy(f, gx) - 10 }} />;
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
        {Goal()}
        {Spools()}
        {mode !== "title" ? Hero() : null}
        {popups.map((p) => <div className="popup" style={{ left: p.x - 12, top: p.y }}>{p.text}</div>)}
        {mode === "title" ? Banner({ title: rg.t("TELINEKIIPEILY", "SCAFFOLD SCRAMBLE", "ESCALADA"), lines: [
          rg.t("Nosturirobotti vierittää kaapelikeloja!", "Grumble the crane-bot is rolling spools!", "¡El robot grúa lanza bobinas!"),
          rg.t("Kiipeä kissanpennun luo.", "Climb up to the kitten.", "Sube hasta el gatito."),
          rg.t("Kosketa paikkaa, jonne haluat mennä.", "Touch where you want to go.", "Toca donde quieres ir."),
          rg.t("Napauta ja aloita!", "Tap to start!", "¡Toca para empezar!")] }) : null}
        {mode === "cleared" ? Banner({ title: rg.t("KISSA PELASTETTU!", "KITTEN SAVED!", "¡GATITO A SALVO!"), lines: [
          "Bonus " + bonus, rg.t("Seuraavaksi taso ", "Next: level ", "Siguiente: nivel ") + (level + 1)] }) : null}
        {mode === "over" ? Banner({ title: rg.t("PELI PÄÄTTYI", "GAME OVER", "FIN DEL JUEGO"), lines: [
          rg.t("Pisteet ", "Score ", "Puntos ") + score + (newBest ? "  🎉" : ""),
          modeClock > 1 ? rg.t("Napauta ja jatka tasolta ", "Tap to go on from level ", "Toca para seguir en el nivel ") + level : " "] }) : null}
      </div>
      <div className="pad" style={{ top: FY + FH }} />
      {JumpBar()}
    </div>
  );
}
