// Haamujahti: a first-person walk through a candy castle. Shoot the floating
// ghosts with magic stars (they burst into sparkles), open the locked doors
// by answering a sum, find the green star door to the next floor, and on the
// last floor face the Mörkö, who takes many stars. The view is a ray caster:
// one thin wall slice per column, laid out by EVG like any other element.
//
// Map tiles: # stone, P pink, T teal (walls), D a door with a sum, E the
// exit, @ the start, g a ghost, M the Mörkö, . floor.

type Ghost = { x: number; y: number; hp: number; boss: boolean; hit: number; dead: number; bob: number; hurt: number };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };
type Ray = { d: number; tile: string; side: number; u: number };
type Mode = "title" | "play" | "quiz" | "floor" | "over" | "won";

const LEVELS: string[][] = [
  [
    "##########",
    "#@..#....#",
    "#.#.#.##.#",
    "#.#...#g.#",
    "#.###.#.##",
    "#...g.#..#",
    "###.####D#",
    "#g.......#",
    "#.#####..#",
    "#..g...#E#",
    "##########",
  ],
  [
    "PPPPPPPPPPPP",
    "P@...P.....P",
    "P.PP.P.PPP.P",
    "P.P..g...P.P",
    "P.P.PPPP.PgP",
    "P...P..D.P.P",
    "PPP.P.PP.P.P",
    "Pg..P..g...P",
    "P.PPPP.PPPDP",
    "P....g.P..EP",
    "PPPPPPPPPPPP",
  ],
  [
    "TTTTTTTTTTTTT",
    "T@..T...g...T",
    "T.T.T.TTTTT.T",
    "T.T...T...T.T",
    "T.TTTDT.g.T.T",
    "Tg..T.....D.T",
    "TTT.TTTTTTT.T",
    "T.....g.....T",
    "T.TTTTTTTDTTT",
    "T...........T",
    "T.....M.....T",
    "T...........T",
    "TTTTTTTTTTTET",
  ],
];

const FOV = 1.05;
const COLS = 72;
const PANEL = 190;
const MOVE = 2.3;
const TURN = 2.2;

let mode: Mode = "title";
let t = 0;
let modeClock = 0;
let level = 0;
let map: string[][] = [];
let px = 1.5, py = 1.5, pa = 0;
let hearts = 3;
let safe = 0;
let ghosts: Ghost[] = [];
let sparks: Spark[] = [];
let shotClock = 9;
let shotHit = false;
let bossDown = false;
let stars = 0;
let best = 0;
let door = { x: 0, y: 0 };
let quiz = { a: 0, b: 0, op: "+", answer: 0, options: [0, 0, 0], wrong: -1, wrongClock: 0 };
let rays: Ray[] = [];
let wantFire = false;
let walkClock = 0;

function init() {
  best = rg.load("best", 0);
  loadLevel(0);
}

function loadLevel(n: number) {
  level = n;
  map = LEVELS[n].map((row) => row.split(""));
  ghosts = [];
  sparks = [];
  bossDown = false;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const c = map[y][x];
      if (c === "@") { px = x + 0.5; py = y + 0.5; map[y][x] = "."; }
      else if (c === "g") { ghosts.push(makeGhost(x, y, false)); map[y][x] = "."; }
      else if (c === "M") { ghosts.push(makeGhost(x, y, true)); map[y][x] = "."; }
    }
  }
  // face the first open direction
  pa = 0;
  if (solid(px + 1, py)) pa = Math.PI / 2;
  if (solid(px + 1, py) && solid(px, py + 1)) pa = Math.PI;
}

function makeGhost(x: number, y: number, boss: boolean): Ghost {
  return { x: x + 0.5, y: y + 0.5, hp: boss ? 10 : 1, boss, hit: 0, dead: 0, bob: rg.random() * 6, hurt: 0 };
}

function tile(x: number, y: number): string {
  const r = map[Math.floor(y)];
  if (!r) return "#";
  const c = r[Math.floor(x)];
  return c === undefined ? "#" : c;
}

function solid(x: number, y: number): boolean {
  return tile(x, y) !== ".";
}

// ---- the ray caster --------------------------------------------------------

function cast(angle: number): Ray {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = Math.abs(1 / (dx === 0 ? 1e-9 : dx));
  const ddy = Math.abs(1 / (dy === 0 ? 1e-9 : dy));
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let tx = dx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
  let ty = dy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
  let side = 0;
  for (let i = 0; i < 40; i++) {
    if (tx < ty) { tx += ddx; mx += sx; side = 0; }
    else { ty += ddy; my += sy; side = 1; }
    const c = tile(mx + 0.5, my + 0.5);
    if (c !== ".") {
      const d = side === 0 ? tx - ddx : ty - ddy;
      let u = side === 0 ? py + d * dy : px + d * dx;
      u = u - Math.floor(u);
      return { d: Math.max(0.05, d), tile: c, side, u };
    }
  }
  return { d: 40, tile: "#", side: 0, u: 0 };
}

function castAll() {
  rays = [];
  for (let i = 0; i < COLS; i++) {
    const a = pa + FOV * ((i + 0.5) / COLS - 0.5);
    const r = cast(a);
    r.d = r.d * Math.cos(a - pa);
    rays.push(r);
  }
}

// ---- playing -----------------------------------------------------------------

function held(): { f: number; turn: number } {
  let f = 0, turn = 0;
  const k = __input.keys;
  if (k["ArrowUp"] || k["w"]) f += 1;
  if (k["ArrowDown"] || k["s"]) f -= 1;
  if (k["ArrowLeft"] || k["a"]) turn -= 1;
  if (k["ArrowRight"] || k["d"]) turn += 1;
  const top = height - PANEL;
  for (const p of __input.pointers) {
    if (!p.down || p.y < top || p.x > 200) continue;
    const b = pad(p.x, p.y);
    if (b === "up") f += 1;
    else if (b === "down") f -= 1;
    else if (b === "left") turn -= 1;
    else if (b === "right") turn += 1;
  }
  return { f: rg.clamp(f, -1, 1), turn: rg.clamp(turn, -1, 1) };
}

// the arrow pad: which button is under (x, y)
function pad(x: number, y: number): string {
  const cx = 100, cy = height - PANEL / 2;
  const dx = x - cx, dy = y - cy;
  if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return "";
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function tryMove(nx: number, ny: number) {
  const r = 0.22;
  const wantX = nx + (nx > px ? r : -r);
  const wantY = ny + (ny > py ? r : -r);
  const cx = tile(wantX, py), cy = tile(px, wantY);
  if (cx === ".") px = nx;
  else bump(cx, Math.floor(wantX), Math.floor(py));
  if (cy === ".") py = ny;
  else bump(cy, Math.floor(px), Math.floor(wantY));
}

function bump(c: string, x: number, y: number) {
  if (mode !== "play") return;
  if (c === "D") openQuiz(x, y);
  else if (c === "E") {
    if (level === LEVELS.length - 1 && !bossDown) return;
    nextFloor();
  }
}

function openQuiz(x: number, y: number) {
  door = { x, y };
  const hard = level;
  let a = rg.range(1, 5 + hard * 2), b = rg.range(1, 4 + hard * 2);
  let op = "+";
  if (hard > 0 && rg.random() < 0.4) {
    op = "-";
    if (b > a) { const s = a; a = b; b = s; }
  }
  const answer = op === "+" ? a + b : a - b;
  const opts = [answer];
  while (opts.length < 3) {
    const o = answer + rg.pick([-3, -2, -1, 1, 2, 3]);
    if (o >= 0 && opts.indexOf(o) < 0) opts.push(o);
  }
  quiz = { a, b, op, answer, options: rg.shuffle(opts), wrong: -1, wrongClock: 0 };
  mode = "quiz";
  modeClock = 0;
  rg.sound("tick");
}

function answer(i: number) {
  if (mode !== "quiz") return;
  if (quiz.options[i] === quiz.answer) {
    map[door.y][door.x] = ".";
    stars += 5;
    mode = "play";
    rg.sound("win");
    rg.vibrate(30);
  } else {
    quiz.wrong = i;
    quiz.wrongClock = 0.6;
    rg.sound("wrong");
    rg.vibrate(60);
  }
}

function nextFloor() {
  rg.sound("win");
  rg.vibrate([60, 40, 120]);
  rg.stopMusic();
  if (level === LEVELS.length - 1) {
    mode = "won";
    modeClock = 0;
    if (stars > best) { best = stars; rg.save("best", best); }
  } else {
    mode = "floor";
    modeClock = 0;
  }
}

function fire() {
  if (mode !== "play" || shotClock < 0.28) return;
  shotClock = 0;
  shotHit = false;
  rg.sound("pop", { pitch: 1.4, volume: 0.6 });
  // the nearest ghost in the middle of the view, not behind a wall
  let target: Ghost | null = null;
  let near = 99;
  const mid = rays[Math.floor(COLS / 2)];
  for (const g of ghosts) {
    if (g.dead) continue;
    const s = seen(g);
    if (!s) continue;
    const half = (g.boss ? 0.55 : 0.32) / s.d;
    if (Math.abs(s.a) < half + 0.03 && s.d < near && (!mid || s.d < mid.d + 0.3)) { near = s.d; target = g; }
  }
  if (target) {
    shotHit = true;
    target.hp -= 1;
    target.hurt = 0.25;
    if (target.hp <= 0) {
      target.dead = 0.01;
      stars += target.boss ? 50 : 10;
      burst(target, target.boss ? 40 : 14);
      rg.sound(target.boss ? "win" : "star");
      rg.vibrate(target.boss ? [100, 60, 100, 60, 300] : 20);
      if (target.boss) bossDown = true;
    } else {
      rg.sound("hit", { volume: 0.5 });
      rg.vibrate(15);
    }
  }
}

// where a ghost is seen: its angle from the view's centre and distance
function seen(g: Ghost): { a: number; d: number } | null {
  const dx = g.x - px, dy = g.y - py;
  const dist = Math.sqrt(dx * dx + dy * dy);
  let a = Math.atan2(dy, dx) - pa;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  if (Math.abs(a) > FOV / 2 + 0.4 || dist < 0.15) return null;
  return { a, d: dist * Math.cos(a) };
}

function burst(g: Ghost, n: number) {
  const colors = ["#ffd166", "#ffffff", "#9bf6ff", "#ffadad", "#caffbf"];
  for (let i = 0; i < n; i++) {
    sparks.push({ x: 0, y: 0, vx: (rg.random() - 0.5) * 260, vy: -rg.random() * 220 - 40, t: 0, c: rg.pick(colors) });
  }
}

function tick(dt: number) {
  t += dt;
  modeClock += dt;
  shotClock += dt;
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 400 * dt; }
  sparks = sparks.filter((s) => s.t < 0.9);
  if (quiz.wrongClock > 0) quiz.wrongClock -= dt;
  if (mode === "play") play(dt);
  castAll();
}

function play(dt: number) {
  const h = held();
  pa += h.turn * TURN * dt;
  if (h.f !== 0) {
    walkClock += dt;
    tryMove(px + Math.cos(pa) * h.f * MOVE * dt, py + Math.sin(pa) * h.f * MOVE * dt);
  }
  if (wantFire) { wantFire = false; fire(); }
  safe = Math.max(0, safe - dt);
  for (const g of ghosts) {
    g.bob += dt * 3;
    g.hurt = Math.max(0, g.hurt - dt);
    if (g.dead) { g.dead += dt; continue; }
    const dx = px - g.x, dy = py - g.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // ghosts drift toward you when they are near; the Mörkö always does
    const reach = g.boss ? 9 : 4.5;
    if (d < reach && d > 0.4) {
      const sp = (g.boss ? 0.55 : 0.75) * dt;
      const nx = g.x + dx / d * sp, ny = g.y + dy / d * sp;
      if (!solid(nx, g.y)) g.x = nx;
      if (!solid(g.x, ny)) g.y = ny;
    }
    if (d < (g.boss ? 0.8 : 0.5) && safe <= 0) {
      hearts -= 1;
      safe = 1.6;
      rg.sound("hit");
      rg.vibrate(150);
      // the ghost floats back a little
      g.x -= dx / d * 0.8;
      g.y -= dy / d * 0.8;
      if (solid(g.x, g.y)) { g.x += dx / d * 0.8; g.y += dy / d * 0.8; }
      if (hearts <= 0) {
        mode = "over";
        modeClock = 0;
        rg.stopMusic();
        rg.sound("lose");
        rg.vibrate([80, 60, 200]);
      }
    }
  }
  ghosts = ghosts.filter((g) => g.dead < 1);
}

function start() {
  hearts = 3;
  stars = level === 0 ? 0 : stars;
  safe = 0;
  loadLevel(level);
  mode = "play";
  modeClock = 0;
  rg.sound("click");
  rg.music(level === LEVELS.length - 1 ? "chase" : "calm", { volume: 0.6 });
}

function onPointerDown(x: number, y: number) {
  if (mode === "title") { level = 0; stars = 0; start(); return; }
  if (mode === "floor" && modeClock > 0.8) { level += 1; start(); return; }
  if (mode === "over" && modeClock > 0.8) { start(); return; }
  if (mode === "won" && modeClock > 1.2) { mode = "title"; modeClock = 0; return; }
  if (mode === "play" && y > height - PANEL && x > 220) wantFire = true;
}

function onKeyDown(key: string) {
  if (key === " " || key === "Enter") {
    if (mode === "play") wantFire = true;
    else if (mode !== "quiz") onPointerDown(0, 0);
  }
  if (mode === "quiz" && (key === "1" || key === "2" || key === "3")) answer(Number(key) - 1);
}

function onBack() {
  if (mode === "quiz") { mode = "play"; return; }
  if (mode === "play") { mode = "title"; rg.stopMusic(); } else rg.exit();
}

// ---- drawing -----------------------------------------------------------------

const WALL: { [k: string]: number[] } = {
  "#": [150, 140, 200],
  P: [240, 140, 190],
  T: [80, 190, 190],
  D: [190, 120, 60],
  E: [70, 210, 120],
};

function shade(c: number[], k: number): string {
  // toward the castle's dark violet in the distance
  const f = [30, 20, 60];
  return "rgb(" + Math.round(f[0] + (c[0] - f[0]) * k) + "," + Math.round(f[1] + (c[1] - f[1]) * k) + "," + Math.round(f[2] + (c[2] - f[2]) * k) + ")";
}

function Walls(vh: number) {
  const cw = width / COLS;
  const out: any[] = [];
  for (let i = 0; i < COLS; i++) {
    const r = rays[i];
    if (!r) continue;
    const h = Math.min(vh * 3, (width * 0.9) / r.d);
    let k = Math.max(0.12, 1 - r.d / 9) * (r.side === 1 ? 0.8 : 1);
    // the stones' edges and the door's planks
    if (r.tile === "D" && (r.u < 0.06 || r.u > 0.94 || Math.abs(r.u - 0.5) < 0.03)) k *= 0.6;
    else if (r.tile !== "D" && r.tile !== "E" && (r.u < 0.04 || r.u > 0.96)) k *= 0.75;
    if (r.tile === "E" && level === LEVELS.length - 1 && !bossDown) k *= 0.35;
    const c = WALL[r.tile] || WALL["#"];
    out.push(<div className="col" style={{ left: i * cw, top: vh / 2 - h / 2, width: cw + 0.6, height: h, backgroundColor: shade(c, k) }} />);
  }
  return out;
}

// a sign on a door or the exit, seen like a ghost, behind the walls in front of it
function Signs(vh: number) {
  const out: any[] = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const c = map[y][x];
      if (c !== "D" && c !== "E") continue;
      const g = { x: x + 0.5, y: y + 0.5 } as Ghost;
      const s = seen(g);
      if (!s || s.d > 7) continue;
      const sx = width / 2 + (s.a / FOV) * width;
      const col = rays[Math.floor(rg.clamp(sx / width * COLS, 0, COLS - 1))];
      if (col && col.d < s.d - 0.75) continue;
      const size = Math.min(160, (width * 0.38) / Math.max(0.3, s.d - 0.5));
      out.push(
        <div className={c === "D" ? "sign quest" : "sign exit"} style={{ left: sx - size / 2, top: vh / 2 - size / 2, width: size, height: size, borderRadius: size / 2, fontSize: size * 0.6 }}>
          {c === "D" ? "?" : "★"}
        </div>
      );
    }
  }
  return out;
}

function GhostView(g: Ghost, vh: number) {
  const s = seen(g);
  if (!s || s.d < 0.2) return null;
  const sx = width / 2 + (s.a / FOV) * width;
  const col = rays[Math.floor(rg.clamp(sx / width * COLS, 0, COLS - 1))];
  if (col && col.d < s.d - 0.2) return null;
  const size = Math.min(vh * 1.4, (width * (g.boss ? 1.0 : 0.56)) / s.d);
  const bob = Math.sin(g.bob) * size * 0.06;
  const fade = g.dead ? 1 - g.dead : 1;
  const w = size * (g.boss ? 0.95 : 0.58);
  const top = vh / 2 - size * (g.boss ? 0.45 : 0.4) + bob;
  if (g.boss) return Morko(sx, top, w, size, g, fade);
  const body = g.hurt > 0 ? "#ffd6e0" : "#f7f7ff";
  return (
    <div className="ghost" style={{ left: sx - w / 2, top: top, width: w, height: size, opacity: fade * 0.95 }}>
      <div className="gbody" style={{ width: w, height: size * 0.8, borderRadius: w / 2, backgroundColor: body }} />
      <div className="gfoot" style={{ left: 0, top: size * 0.66, width: w / 3, height: size * 0.24, borderRadius: w / 6, backgroundColor: body }} />
      <div className="gfoot" style={{ left: w / 3, top: size * 0.7 + Math.sin(g.bob * 2) * size * 0.03, width: w / 3, height: size * 0.24, borderRadius: w / 6, backgroundColor: body }} />
      <div className="gfoot" style={{ left: w * 2 / 3, top: size * 0.66, width: w / 3, height: size * 0.24, borderRadius: w / 6, backgroundColor: body }} />
      <div className="geye" style={{ left: w * 0.24, top: size * 0.25, width: w * 0.16, height: size * 0.14, borderRadius: w * 0.08 }} />
      <div className="geye" style={{ left: w * 0.6, top: size * 0.25, width: w * 0.16, height: size * 0.14, borderRadius: w * 0.08 }} />
      <div className="gmouth" style={{ left: w * 0.38, top: size * 0.46, width: w * 0.24, height: size * 0.12, borderRadius: w * 0.12 }} />
    </div>
  );
}

function Morko(sx: number, top: number, w: number, size: number, g: Ghost, fade: number) {
  const fur = g.hurt > 0 ? "#b5179e" : "#5a189a";
  const tufts: any[] = [];
  for (let i = 0; i < 7; i++) {
    const tw = w / 5;
    tufts.push(<div className="tuft" style={{ left: i * (w - tw) / 6, top: -tw * 0.4 + Math.sin(g.bob + i) * tw * 0.12, width: tw, height: tw, borderRadius: tw / 2, backgroundColor: fur }} />);
  }
  return (
    <div className="ghost" style={{ left: sx - w / 2, top: top, width: w, height: size, opacity: fade }}>
      {tufts}
      <div className="gbody" style={{ width: w, height: size * 0.95, borderRadius: w * 0.3, backgroundColor: fur }} />
      <div className="horn" style={{ left: w * 0.12, top: -size * 0.12, width: w * 0.12, height: size * 0.18, borderRadius: w * 0.06 }} />
      <div className="horn" style={{ left: w * 0.76, top: -size * 0.12, width: w * 0.12, height: size * 0.18, borderRadius: w * 0.06 }} />
      <div className="meye" style={{ left: w * 0.2, top: size * 0.2, width: w * 0.22, height: w * 0.22, borderRadius: w * 0.11 }}>
        <div className="pupil" style={{ left: w * 0.06, top: w * 0.07, width: w * 0.09, height: w * 0.09, borderRadius: w * 0.045 }} />
      </div>
      <div className="meye" style={{ left: w * 0.58, top: size * 0.2, width: w * 0.22, height: w * 0.22, borderRadius: w * 0.11 }}>
        <div className="pupil" style={{ left: w * 0.06, top: w * 0.07, width: w * 0.09, height: w * 0.09, borderRadius: w * 0.045 }} />
      </div>
      <div className="mmouth" style={{ left: w * 0.25, top: size * 0.52, width: w * 0.5, height: size * 0.14, borderRadius: size * 0.07 }}>
        <div className="tooth" style={{ left: w * 0.08, width: w * 0.08, height: size * 0.06 }} />
        <div className="tooth" style={{ left: w * 0.34, width: w * 0.08, height: size * 0.06 }} />
      </div>
    </div>
  );
}

function Shot(vh: number) {
  if (shotClock > 0.35) return null;
  const k = shotClock / 0.35;
  const s = 46 * (1 - k) + 10;
  const y = vh - 30 - (vh / 2 - 30) * rg.ease.out(k);
  return <div className="shot" style={{ left: width / 2 - s / 2, top: y - s / 2, width: s, height: s, borderRadius: s / 2, fontSize: s * 0.9 }}>★</div>;
}

function Sparks(vh: number) {
  return sparks.map((s) => <div className="spark" style={{ left: width / 2 + s.x, top: vh / 2 + s.y, opacity: 1 - s.t / 0.9, backgroundColor: s.c }} />);
}

function Scene() {
  const vh = height - PANEL;
  const order = ghosts.slice().sort((a, b) => {
    const da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
    const db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
    return db - da;
  });
  const sway = Math.sin(walkClock * 9) * 3;
  return (
    <div className="scene" style={{ height: vh }}>
      <div className="ceiling" style={{ height: vh / 2 }} />
      <div className="floor" style={{ top: vh / 2, height: vh / 2 }} />
      {Walls(vh)}
      {Signs(vh)}
      {order.map((g) => GhostView(g, vh))}
      {Sparks(vh)}
      {Shot(vh)}
      <div className="cross" style={{ left: width / 2 - 6, top: vh / 2 - 6 }} />
      <div className="wand" style={{ left: width / 2 + 40, top: vh - 70 + sway + (shotClock < 0.15 ? 10 : 0) }}>
        <div className="wandtip" />
      </div>
      {safe > 0 && Math.floor(safe * 8) % 2 === 0 ? <div className="ouch" style={{ height: vh }} /> : null}
      {Hud()}
    </div>
  );
}

function Hud() {
  const left = ghosts.filter((g) => !g.dead && !g.boss).length;
  const boss = ghosts.find((g) => g.boss && !g.dead);
  const h: string[] = [];
  for (let i = 0; i < 3; i++) h.push(i < hearts ? "❤️" : "🖤");
  return (
    <div className="hud">
      <div className="pill">{h.join("")}</div>
      <div className="pill">👻 {left}</div>
      <div className="pill">⭐ {stars}</div>
      {boss ? <div className="bossbar"><div className="bosshp" style={{ width: 200 * boss.hp / 10 }} /></div> : null}
    </div>
  );
}

function Panel() {
  const cy = PANEL / 2;
  const h = held();
  const btn = (name: string, x: number, y: number, label: string, on: boolean) =>
    <div className={on ? "arrow on" : "arrow"} style={{ left: x - 28, top: y - 28 }}>{label}</div>;
  return (
    <div className="panel" style={{ top: height - PANEL, height: PANEL }}>
      {btn("up", 100, cy - 54, "▲", h.f > 0)}
      {btn("down", 100, cy + 54, "▼", h.f < 0)}
      {btn("left", 46, cy, "◀", h.turn < 0)}
      {btn("right", 154, cy, "▶", h.turn > 0)}
      <div className={shotClock < 0.15 ? "fire on" : "fire"} style={{ top: cy - 56 }}>★</div>
    </div>
  );
}

function Quiz() {
  return (
    <div className="overlay">
      <div className="qcard">
        <div className="qtitle">Lukittu ovi!</div>
        <div className="qhint">Laske, niin ovi aukeaa</div>
        <div className="qsum">{quiz.a + " " + quiz.op + " " + quiz.b + " = ?"}</div>
        <div className="choices">
          {quiz.options.map((o, i) => (
            <div className={quiz.wrong === i && quiz.wrongClock > 0 ? "choice bad" : "choice"} id={"q" + i} onClick={() => answer(i)}>{"" + o}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Title() {
  const bob = Math.sin(t * 2.5) * 8;
  return (
    <div className="overlay dark">
      <div className="ticon" style={{ marginTop: bob }}>👻</div>
      <div className="big">Haamujahti</div>
      <div className="hint">Ammu haamut tähdillä ★</div>
      <div className="hint">Avaa ovet laskemalla ja etsi vihreä tähtiovi</div>
      <div className="hint">Viimeisessä kerroksessa odottaa Mörkö!</div>
      <div className="go">Napauta ja aloita!</div>
      {best > 0 ? <div className="hint">Ennätys: ⭐ {best}</div> : null}
    </div>
  );
}

function Floor() {
  return (
    <div className="overlay dark">
      <div className="big">Kerros {level + 1} läpi!</div>
      <div className="result">⭐ {stars}</div>
      {level + 1 === LEVELS.length - 1 ? <div className="hint">Seuraavassa kerroksessa on Mörkö…</div> : null}
      {modeClock > 0.8 ? <div className="go">Napauta: seuraava kerros</div> : null}
    </div>
  );
}

function Over() {
  return (
    <div className="overlay dark">
      <div className="big">Hups!</div>
      <div className="hint">Haamut saivat sinut kiinni</div>
      {modeClock > 0.8 ? <div className="go">Napauta ja yritä uudestaan</div> : null}
    </div>
  );
}

function Won() {
  return (
    <div className="overlay dark">
      <div className="ticon">🏆</div>
      <div className="big">Voitit Mörön!</div>
      <div className="result">⭐ {stars}</div>
      {stars >= best ? <div className="record">Uusi ennätys! 🎉</div> : <div className="hint">Ennätys: ⭐ {best}</div>}
      {modeClock > 1.2 ? <div className="go">Napauta</div> : null}
    </div>
  );
}

function view() {
  return (
    <div className="screen">
      {Scene()}
      {Panel()}
      {mode === "quiz" ? Quiz() : null}
      {mode === "title" ? Title() : null}
      {mode === "floor" ? Floor() : null}
      {mode === "over" ? Over() : null}
      {mode === "won" ? Won() : null}
    </div>
  );
}
