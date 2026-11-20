// Robotti: programming for 5- and 8-year-olds. The robot is out of power:
// write it a program that takes it to the battery. Levels:
//   1 Askeleet  a sequence of arrows (tap the arrow buttons), then ▶ runs it
//   2 Toista    only a few boxes, but each box repeats its arrow: tapping the
//               same arrow again makes the box count up (→ ×3), so a path
//               with turns is "three right, two down": → ×3  ↓ ×2. The
//               number is big in the box and counts down as the robot walks.
//   3 Jos-niin  conditions: the robot walks on by itself, and on a coloured
//               floor tile it turns the way the rule of that colour says
// A crash is a "bug": the arrow that was running when the robot crashed
// turns red, and the robot stops there, so the child sees what to fix.
// The second miss shows the hint (footprints / the repeating pattern / the
// path after each colour). Steps make the paths longer.
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, rect, Arrow, Robot, Battery, DX, DY } from "lib/kit";

const COLS = 6, ROWS = 6;
const DIRSAY = ["tk_ylos", "tk_oikealle", "tk_alas", "tk_vasemmalle"];
const TILE = ["#ef476f", "#3a86ff", "#ffb703"];          // the colours of level 3
const ROBOT = "#4895ef";

const LEVELS: Level[] = [
  { name: rg.t("Askeleet", "Steps", "Pasos"), color: "#3a86ff", say: "tk_r_askeleet", pic: (x, y, s) => [Arrow(x - 30 * s, y + 8 * s, 18 * s, 1, "#ffffff"), Arrow(x + 6 * s, y + 8 * s, 18 * s, 1, "#ffffff"), Arrow(x + 40 * s, y + 8 * s, 18 * s, 2, "#ffffff")] },
  { name: rg.t("Toista", "Repeat", "Repite"), color: "#8338ec", say: "tk_r_toista", pic: (x, y, s) => [Arrow(x - 26 * s, y + 6 * s, 16 * s, 1, "#ffffff"), Arrow(x + 4 * s, y + 6 * s, 16 * s, 2, "#ffffff"), <div className="big" style={{ left: x + 20 * s, top: y - 12 * s, width: 50 * s, height: 36 * s, color: "#ffffff" }}>×3</div>] },
  { name: rg.t("Jos-niin", "If-then", "Si-entonces"), color: "#ef476f", say: "tk_r_jos", pic: (x, y, s) => [Box(x - 44 * s, y - 14 * s, 36 * s, 36 * s, TILE[2], 6 * s), Box(x - 44 * s, y - 14 * s, 36 * s, 6 * s, "#ffffff", 3 * s), Arrow(x + 26 * s, y + 4 * s, 18 * s, 0, "#ffffff")] },
];

// the board
let walls: boolean[] = [];
let colour: number[] = [];       // level 3: -1 or an index into TILE
let start = 0, goal = 0, startDir = 1;
let path: number[] = [];         // the hint path (cells)
// the program
let prog: number[] = [];
let slots = 8;
let cnt: number[] = [];          // level 2: how many times each box repeats its arrow
let moveSlot: number[] = [];     // the box each step comes from
const MAXCNT = 6;
let rules: number[] = [];        // level 3: colour -> direction, -1 unset
let used: number[] = [];         // level 3: the colours on this board
let sel = 0;                     // level 3: the rule card being set
// running
let running = false;
let moves: number[] = [];        // the directions, one per step (levels 1-2)
let mi = 0;                      // the step that runs now
let rx = 0, ry = 0, rdir = 1;    // the robot's cell and facing
let ax = 0, ay = 0;              // its drawn place (cells, animated)
let clock = 0;
let bug = -1;                    // the slot that crashed, -1 none
let mood = "ok";
let crashT = -10;
let hintT = -10;
let trail: number[] = [];

function cell(c: number) { return { x: c % COLS, y: Math.floor(c / COLS) }; }
function at(x: number, y: number) { return y * COLS + x; }
function inside(x: number, y: number) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
function cs() { return Math.floor(Math.min((width - 24) / COLS, (height - 120 - 262) / ROWS)); }
function gx() { return Math.floor((width - cs() * COLS) / 2); }
const GY = 118;
function cx(x: number) { return gx() + x * cs() + cs() / 2; }
function cy(y: number) { return GY + y * cs() + cs() / 2; }
function stripY() { return GY + cs() * ROWS + 10; }

// breadth-first: the shortest way from a to b around the walls, [] if none
function bfs(a: number, b: number): number[] {
  const prev: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) prev.push(-2);
  prev[a] = -1;
  const q = [a];
  while (q.length) {
    const c = q.shift() as number;
    if (c === b) break;
    const p = cell(c);
    for (let d = 0; d < 4; d++) {
      const nx = p.x + DX[d], ny = p.y + DY[d];
      if (!inside(nx, ny)) continue;
      const n = at(nx, ny);
      if (walls[n] || prev[n] !== -2) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[b] === -2) return [];
  const out = [b];
  let c = b;
  while (prev[c] >= 0) { c = prev[c]; out.unshift(c); }
  return out;
}

function turns(p: number[]): number {
  let n = 0;
  for (let i = 2; i < p.length; i++) {
    const a = cell(p[i - 2]), b = cell(p[i - 1]), c = cell(p[i]);
    if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) n++;
  }
  return n;
}

function clear() {
  walls = []; colour = [];
  for (let i = 0; i < COLS * ROWS; i++) { walls.push(false); colour.push(-1); }
}

// level 1: random walls, start and goal at a distance that fits the step
function makeSteps() {
  const s = step();
  const lo = [2, 3, 5][s], hi = [3, 5, 7][s], wallN = [3, 6, 9][s];
  for (let tries = 0; tries < 400; tries++) {
    clear();
    for (let i = 0; i < wallN; i++) walls[rg.range(0, COLS * ROWS - 1)] = true;
    start = rg.range(0, COLS * ROWS - 1); goal = rg.range(0, COLS * ROWS - 1);
    if (walls[start] || walls[goal] || start === goal) continue;
    const p = bfs(start, goal);
    if (p.length - 1 < lo || p.length - 1 > hi) continue;
    if (s > 0 && turns(p) < 1) continue;
    path = p;
    return;
  }
  clear(); start = at(0, 2); goal = at(3, 2); path = [start, at(1, 2), at(2, 2), goal];
}

// level 2: straight legs with turns between them, one box for each leg. A
// wall stands straight on after every turn, so one step too many is a crash
// in that box and not a walk off into nowhere.
function makeLoop() {
  const s = step();
  for (let tries = 0; tries < 800; tries++) {
    const legs = s === 0 ? rg.range(1, 2) : s === 1 ? rg.range(2, 3) : rg.range(3, 4);
    clear();
    let x = rg.range(0, COLS - 1), y = rg.range(0, ROWS - 1), d = rg.range(0, 3);
    const pts = [at(x, y)];
    const stops: number[] = [];
    let ok = true;
    for (let t = 0; t < legs && ok; t++) {
      const len = legs === 1 ? rg.range(3, 5) : rg.range(2, 4);
      for (let k = 0; k < len; k++) {
        x += DX[d]; y += DY[d];
        if (!inside(x, y) || pts.indexOf(at(x, y)) >= 0) { ok = false; break; }
        pts.push(at(x, y));
      }
      if (!ok) break;
      if (t < legs - 1) {
        if (inside(x + DX[d], y + DY[d])) stops.push(at(x + DX[d], y + DY[d]));
        d = rg.random() < 0.5 ? (d + 1) % 4 : (d + 3) % 4;
      }
    }
    if (!ok || stops.some((c) => pts.indexOf(c) >= 0)) continue;
    for (const c of stops) walls[c] = true;
    for (let i = 0; i < 3 + s; i++) { const w = rg.range(0, COLS * ROWS - 1); if (pts.indexOf(w) < 0) walls[w] = true; }
    path = pts; start = pts[0]; goal = pts[pts.length - 1];
    // the legs must be the only short way: no shortcut around a corner
    if (bfs(start, goal).length !== pts.length) continue;
    slots = legs;
    return;
  }
  clear(); path = [at(0, 2), at(1, 2), at(2, 2), at(3, 2)]; start = path[0]; goal = path[3]; slots = 1;
}

// level 3: a path with turns; every turn tile is coloured by the way it turns
function makeIf() {
  const s = step();
  const nTurns = [1, 2, 3][s] + (s === 2 && rg.random() < 0.5 ? 1 : 0);
  for (let tries = 0; tries < 600; tries++) {
    clear();
    let x = 0, y = rg.range(0, ROWS - 1), d = 1;
    const pts = [at(x, y)];
    const turnAt: number[] = [], turnDir: number[] = [];
    let ok = true;
    for (let t = 0; t <= nTurns && ok; t++) {
      const len = rg.range(1, 3);
      for (let k = 0; k < len; k++) {
        x += DX[d]; y += DY[d];
        if (!inside(x, y) || pts.indexOf(at(x, y)) >= 0) { ok = false; break; }
        pts.push(at(x, y));
      }
      if (!ok || t === nTurns) break;
      const nd = rg.random() < 0.5 ? (d + 1) % 4 : (d + 3) % 4;
      turnAt.push(at(x, y)); turnDir.push(nd);
      d = nd;
    }
    if (!ok) continue;
    // the robot must not walk off the path straight past the end into nothing: fine, the goal stops it
    const dirs: number[] = [];
    for (const nd of turnDir) if (dirs.indexOf(nd) < 0) dirs.push(nd);
    if (s === 1 && dirs.length < 2) continue;
    if (s === 2 && dirs.length < 2) continue;
    if (dirs.length > TILE.length) continue;
    const cols = rg.shuffle([0, 1, 2]);
    turnAt.forEach((c, i) => { colour[c] = cols[dirs.indexOf(turnDir[i])]; });
    used = dirs.map((q, i) => cols[i]);
    used.sort((a, b) => a - b);
    path = pts; start = pts[0]; goal = pts[pts.length - 1]; startDir = 1;
    // a few walls away from the path
    for (let i = 0; i < 4 + s * 2; i++) { const w = rg.range(0, COLS * ROWS - 1); if (pts.indexOf(w) < 0) walls[w] = true; }
    rules = [-1, -1, -1];
    sel = used[0];
    return;
  }
}

function instruct() {
  rg.say(["tk_r_askeleet", "tk_r_toista", "tk_r_jos"][K.level]);
}

function next() {
  prog = []; cnt = []; bug = -1; mood = "ok"; running = false; hintT = -10; trail = [];
  slots = 8;
  if (K.level === 0) makeSteps();
  else if (K.level === 1) makeLoop();
  else makeIf();
  const p = cell(start);
  rx = p.x; ry = p.y; ax = rx; ay = ry; rdir = K.level === 2 ? startDir : 1;
  instruct();
}

function reset() {
  const p = cell(start);
  rx = p.x; ry = p.y; ax = rx; ay = ry; rdir = K.level === 2 ? startDir : 1;
  running = false; bug = -1; mood = "ok"; trail = [];
}

function add(d: number) {
  if (running || K.solved >= 0) return;
  if (bug >= 0 || mood !== "ok") reset();
  const last = prog.length - 1;
  if (K.level === 1 && last >= 0 && prog[last] === d) {
    // the same arrow again: the box counts up
    if (cnt[last] >= MAXCNT) { rg.sound("wrong"); return; }
    cnt[last]++;
    rg.sound("click", { pitch: 1 + cnt[last] * 0.08 }); rg.vibrate(10);
    rg.say(rg.sayId.number(cnt[last]));
    return;
  }
  if (prog.length >= slots) { rg.sound("wrong"); rg.say("tk_r_taynna"); return; }
  prog.push(d); cnt.push(1);
  rg.sound("click"); rg.vibrate(10);
  rg.say(DIRSAY[d]);
}

function undo() {
  if (running || K.solved >= 0) return;
  reset();
  if (!prog.length) return;
  const last = prog.length - 1;
  if (K.level === 1 && cnt[last] > 1) cnt[last]--;
  else { prog.pop(); cnt.pop(); }
  rg.sound("pop");
}

function setRule(d: number) {
  if (running || K.solved >= 0) return;
  if (mood !== "ok") reset();
  rules[sel] = d;
  rg.sound("click"); rg.vibrate(10);
  rg.say(DIRSAY[d]);
  // on to the next colour that has no rule yet
  for (const c of used) if (rules[c] < 0) { sel = c; return; }
}

function run() {
  if (running || K.solved >= 0) return;
  reset();
  if (K.level < 2 && !prog.length) { rg.sound("wrong"); instruct(); return; }
  moves = []; moveSlot = [];
  if (K.level < 2) prog.forEach((d, i) => { for (let r = 0; r < (K.level === 1 ? cnt[i] : 1); r++) { moves.push(d); moveSlot.push(i); } });
  mi = 0; clock = 0.25; running = true;
  trail = [start];
  rg.sound("jump");
}

function crash(slot: number) {
  running = false; bug = slot; mood = "dizzy"; crashT = K.t;
  rg.sound("hit"); rg.vibrate(80);
  const n = miss();
  const c = K.level === 2 ? "tk_r_tormasi_jos" : "tk_r_tormasi";
  if (n >= 2) { hintT = K.t; rg.say([c, hintSay()]); } else rg.say(c);
}

function stuck(say: string) {
  running = false; mood = "sleep";
  const n = miss();
  if (n >= 2) { hintT = K.t; rg.say([say, hintSay()]); } else rg.say(say);
}

function hintSay(): string { return ["tk_r_vihje_askeleet", "tk_r_vihje_toista", "tk_r_vihje_jos"][K.level]; }

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0 && path.length > 1) {
    const a = cell(path[0]), b = cell(path[1]);
    let d = 0;
    for (let k = 0; k < 4; k++) if (DX[k] === b.x - a.x && DY[k] === b.y - a.y) d = k;
    rg.say([hintSay(), DIRSAY[d]]);
  } else rg.say(hintSay());
}

// one step of the running program
function stepRobot() {
  if (K.level === 2) {
    const c = colour[at(rx, ry)];
    if (c >= 0 && rules[c] >= 0) rdir = rules[c];
    if (trail.length > 40) { stuck("tk_r_ikuinen"); return; }
  } else {
    if (mi >= moves.length) { stuck("tk_r_ei_perille"); return; }
    rdir = moves[mi];
  }
  const nx = rx + DX[rdir], ny = ry + DY[rdir];
  const slot = K.level === 2 ? -1 : moveSlot[mi];
  if (!inside(nx, ny) || walls[at(nx, ny)]) {
    // bump half way into the wall
    ax = rx + DX[rdir] * 0.3; ay = ry + DY[rdir] * 0.3;
    crash(slot);
    return;
  }
  rx = nx; ry = ny; mi++;
  trail.push(at(rx, ry));
  rg.sound("tick");
  if (at(rx, ry) === goal) {
    running = false; mood = "happy";
    win(cx(rx), cy(ry), ["tk_r_perilla"]);
  }
}

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  // the drawn robot glides to its cell
  if (mood !== "dizzy") { ax += (rx - ax) * Math.min(1, dt * 14); ay += (ry - ay) * Math.min(1, dt * 14); }
  if (!running) return;
  clock -= dt;
  if (clock <= 0) { clock = 0.38; stepRobot(); }
}

function onBack() { running = false; back(); }

// ---- drawing ------------------------------------------------------------------

function Board() {
  const out: any[] = [];
  const c = cs(), x0 = gx();
  out.push(Box(x0 - 6, GY - 6, c * COLS + 12, c * ROWS + 12, "#1d4e89", 14));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const i = at(x, y);
    const px = x0 + x * c, py = GY + y * c;
    out.push(Box(px + 2, py + 2, c - 4, c - 4, (x + y) % 2 ? "#dbeafe" : "#eef5ff", 6));
    if (colour[i] >= 0) out.push(Box(px + 4, py + 4, c - 8, c - 8, TILE[colour[i]], 6));
    if (walls[i]) {
      out.push(Box(px + 3, py + 5, c - 6, c - 8, "#6c757d", 8));
      out.push(Box(px + 3, py + 3, c - 6, c - 12, "#adb5bd", 8));
      out.push(Box(px + 9, py + 9, c * 0.3, 5, "#dee2e6", 3));
    }
  }
  // footprints of the hint
  if (K.t - hintT < 6 && K.level === 0) {
    for (let k = 1; k < path.length; k++) { const p = cell(path[k]); out.push(Circle(cx(p.x), cy(p.y), c * 0.12, "rgba(255,183,3,0.9)")); }
  }
  // level 2 hint: the steps of each leg are counted on the floor
  if (K.t - hintT < 8 && K.level === 1) {
    let n = 0;
    for (let k = 1; k < path.length; k++) {
      const a = cell(path[k - 1]), p = cell(path[k]);
      if (k > 1) { const b = cell(path[k - 2]); if (a.x - b.x !== p.x - a.x || a.y - b.y !== p.y - a.y) n = 0; }
      n++;
      out.push(Circle(cx(p.x), cy(p.y), c * 0.24, "rgba(131,56,236,0.85)"));
      out.push(<div className="num" style={{ left: cx(p.x) - 14, top: cy(p.y) - 14, width: 28, height: 28, color: "#ffffff", fontSize: 18 }}>{String(n)}</div>);
    }
  }
  // level 3 hint: the way out of each coloured tile
  if (K.t - hintT < 6 && K.level === 2) {
    for (let k = 1; k < path.length - 1; k++) {
      if (colour[path[k]] < 0) continue;
      const a = cell(path[k]), b = cell(path[k + 1]);
      let d = 0;
      for (let q = 0; q < 4; q++) if (DX[q] === b.x - a.x && DY[q] === b.y - a.y) d = q;
      out.push(Arrow(cx(a.x), cy(a.y), c * 0.3, d, "rgba(255,255,255,0.95)"));
    }
  }
  // the robot's trail
  for (const t of trail) { const p = cell(t); out.push(Circle(cx(p.x), cy(p.y), 4, "rgba(72,149,239,0.6)")); }
  const g = cell(goal);
  if (!(K.solved >= 0)) for (const e of Battery(cx(g.x), cy(g.y), c / 80)) out.push(e);
  for (const e of Robot(gx() + ax * c + c / 2, GY + ay * c + c / 2 + c * 0.06, c / 130, ROBOT, rdir, mood)) out.push(e);
  if (mood === "dizzy" && K.t - crashT < 1.5) {
    for (let k = 0; k < 3; k++) { const a = K.t * 5 + k * 2.1; out.push(<div className="emoji" style={{ left: gx() + ax * c + c / 2 + Math.cos(a) * c * 0.4 - 10, top: GY + ay * c + Math.sin(a) * c * 0.15 - 14, width: 20, height: 20, fontSize: 16 }}>⭐</div>); }
  }
  return out;
}

// the program strip: one slot per arrow; the slot that runs glows, a bug is red.
// On level 2 a slot is a box with its arrow and a big ×n, and a dot for each
// step: the dots fill as the robot walks them.
function Strip() {
  const out: any[] = [];
  const y = stripY(), h = 54;
  const n = slots, loop = K.level === 1;
  const w = loop ? Math.min(82, Math.floor((width - 40) / n)) : Math.min(46, Math.floor((width - 40) / n));
  const total = n * w;
  const x = Math.floor((width - total) / 2);
  out.push(Box(x - 8, y - 4, total + 16, h + 8, loop ? "#8338ec" : "#1d4e89", 14));
  const now = running && K.level < 2 && mi < moveSlot.length ? moveSlot[mi] : -1;
  for (let i = 0; i < n; i++) {
    const cls = bug === i ? "slot bad" : now === i ? "slot now" : "slot";
    out.push(<div className={cls} style={{ left: x + i * w + 2, top: y + 3, width: w - 4, height: h - 6 }} />);
    if (i >= prog.length) continue;
    const col = bug === i ? "#d62828" : loop ? "#8338ec" : "#3a86ff";
    if (!loop) { out.push(Arrow(x + i * w + w / 2, y + h / 2, Math.min(16, w * 0.36), prog[i], col)); continue; }
    out.push(Arrow(x + i * w + w * 0.27, y + 21, 14, prog[i], col));
    out.push(<div className="big" style={{ left: x + i * w + w * 0.44, top: y + 2, width: w * 0.52, height: 38, color: col, fontSize: 26 }}>{"×" + cnt[i]}</div>);
    // a dot for each step of the box; the ones walked are filled
    let done = 0;
    if (running || bug >= 0 || mood !== "ok") for (let k = 0; k < mi && k < moveSlot.length; k++) if (moveSlot[k] === i) done++;
    const dw = Math.min(10, (w - 14) / cnt[i]);
    for (let k = 0; k < cnt[i]; k++) out.push(Circle(x + i * w + w / 2 - (cnt[i] - 1) * dw / 2 + k * dw, y + 44, 3, k < done ? col : "rgba(131,56,236,0.25)"));
  }
  if (loop && K.t - hintT < 6 && prog.length < slots && prog.length === 0) out.push(PointAt(x + w / 2, y + 4, "#f77f00"));
  return out;
}

function Rules() {
  const out: any[] = [];
  const y = stripY() - 2, n = used.length, w = 92;
  const x0 = Math.floor((width - n * (w + 10) + 10) / 2);
  used.forEach((c, i) => {
    const x = x0 + i * (w + 10);
    out.push(<div className={sel === c ? "card sel" : "card"} id={"rule" + c} onClick={() => { if (!running) { sel = c; rg.sound("click"); } }} style={{ left: x, top: y, width: w, height: 60 }} />);
    out.push(Box(x + 8, y + 12, 34, 34, TILE[c], 6));
    if (rules[c] >= 0) out.push(Arrow(x + 66, y + 30, 16, rules[c], "#3a86ff"));
    else out.push(<div className="big" style={{ left: x + 48, top: y + 10, width: 36, height: 40, color: "#adb5bd" }}>?</div>);
  });
  if (K.t - hintT < 5) for (const c of used) if (rules[c] < 0) { const i = used.indexOf(c); out.push(PointAt(x0 + i * (w + 10) + w / 2, y, "#f77f00")); break; }
  return out;
}

function Pads() {
  const out: any[] = [];
  const y = stripY() + 70, pw = Math.min(70, (width - 60) / 4), gap = 10;
  const x0 = Math.floor((width - 4 * pw - 3 * gap) / 2);
  const order = [3, 0, 2, 1];   // ← ↑ ↓ →
  order.forEach((d, i) => {
    const x = x0 + i * (pw + gap);
    out.push(<div className="pad" id={"dir" + d} onClick={() => { if (K.level === 2) setRule(d); else add(d); }} style={{ left: x, top: y, width: pw, height: 62, backgroundColor: "#3a86ff" }} />);
    out.push(Arrow(x + pw / 2, y + 31, 20, d, "#ffffff"));
  });
  const y2 = y + 74;
  if (K.level < 2) {
    out.push(<div className="pad" id="undo" onClick={() => undo()} style={{ left: x0, top: y2, width: pw * 1.5, height: 56, backgroundColor: "#9a8c98" }}><div className="padtext">⌫</div></div>);
  }
  const rw = 4 * pw + 3 * gap - (K.level < 2 ? pw * 1.5 + gap : 0);
  const rx0 = x0 + 4 * pw + 3 * gap - rw;
  out.push(<div className="pad" id="run" onClick={() => run()} style={{ left: rx0, top: y2, width: rw, height: 56, backgroundColor: running ? "#adb5bd" : "#06d6a0" }}><div className="padtext">{running ? "…" : "▶"}</div></div>);
  if (K.t - hintT < 5 && K.level === 0 && path.length > 1 && prog.length === 0) {
    const a = cell(path[0]), b = cell(path[1]);
    let d = 0;
    for (let k = 0; k < 4; k++) if (DX[k] === b.x - a.x && DY[k] === b.y - a.y) d = k;
    out.push(PointAt(x0 + order.indexOf(d) * (pw + gap) + pw / 2, y, "#f77f00"));
  }
  return out;
}

function Play() {
  const out: any[] = [];
  const text = K.level === 0 ? rg.t("Vie robotti akulle", "Take the robot to the battery", "Lleva el robot a la batería")
    : K.level === 1 ? rg.t("Laske askeleet: nuoli × luku", "Count the steps: arrow × number", "Cuenta los pasos: flecha × número")
    : rg.t("Väri = suunta", "Colour = direction", "Color = dirección");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  for (const e of Board()) out.push(e);
  if (K.level === 2) for (const e of Rules()) out.push(e);
  else for (const e of Strip()) out.push(e);
  for (const e of Pads()) out.push(e);
  return <div className="screen">{out}</div>;
}

setup(rg.t("Robotti", "Robot", "Robot"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu(Robot(width - 52, 60, 0.42, ROBOT, -1, "happy"));
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
