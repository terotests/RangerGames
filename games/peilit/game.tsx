// Valopeilit: light comes from the sun or a torch, and mirrors bring it to
// a flower, a solar panel, a cat that wants a sunny nap, a cold lizard or
// wet laundry – but never to the owl, who sleeps in the day. The angle of
// incidence is the angle of reflection: a mirror turns steplessly with the
// finger dragged around it (the light follows at any angle, traceFree), a tap
// turns it to the next 22.5° step, and the angle at the selected mirror is
// shown on the board.
// Optics: lib/optics.ts, levels: lib/levels.ts (checked by tools/peilit/solve.ts).

import { traceFree, parseMap, solved, incidenceOf, Cell, FreeTrace, FreeHit } from "lib/optics";
import { LEVELS } from "lib/levels";

// turns: the mirror's angle in steps of 22.5° (fractional when turned with the
// finger), m the same within 0–8
type Piece = Cell & { turns?: number; va?: number; born?: number };
type Drag = { kind: string; fromX: number; fromY: number; tray: boolean; x: number; y: number; sx: number; sy: number; moved: boolean;
  rot: boolean; turns0: number; m0: number };

const W = 7, H = 9;
const TOP = 58;

let mode = "menu";
let t = 0;
let lv = 0;
let rows: string[] = [];
let grid: (Piece | null)[][] = [];
let left: { [k: string]: number } = { mirror: 0, split: 0 };
let kind = "mirror";
let sel: number[] | null = null;
let drag: Drag | null = null;
let tr: FreeTrace = { segs: [], lit: [], owls: [], hits: [] };
let glow: { [k: string]: number } = {};
let goodClock = 0;
let won = false;
let wonClock = 0;
let stars = 0;
let hintOn = false;
let owlWoke = 0;
let best: { [k: string]: number } = {};
let C = 48, BX = 6, BY = TOP;

function init() {
  best = rg.load("stars", {}) || {};
  rg.title(rg.t("Valopeilit", "Mirror Light", "Espejos de luz"));
}

function layout() {
  C = Math.floor(Math.min((width - 12) / W, (height - TOP - 150) / H));
  BX = Math.floor((width - C * W) / 2);
  BY = TOP;
}

function start(i: number) {
  lv = i;
  const L = LEVELS[i];
  rows = L.map;
  grid = parseMap(rows) as (Piece | null)[][];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c && (c.k === "mirror" || c.k === "split")) { c.turns = c.m; c.va = (c.m || 0) * 22.5; }
  }
  left = { mirror: L.tray.mirror || 0, split: L.tray.split || 0 };
  kind = left.mirror ? "mirror" : "split";
  sel = null; drag = null; glow = {}; goodClock = 0; won = false; wonClock = 0; hintOn = false; owlWoke = 0;
  mode = "play";
  retrace();
  rg.sound("click");
  rg.say("peilit_tip" + (i + 1));
}

function retrace() {
  tr = traceFree(grid, W, H);
}

function placed(): number {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c && !c.fixed && (c.k === "mirror" || c.k === "split")) n++;
  }
  return n;
}

function canPlace(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < W && y < H && rows[y].charAt(x) === "." && !grid[y][x];
}

function cellAt(px: number, py: number): number[] | null {
  const x = Math.floor((px - BX) / C), y = Math.floor((py - BY) / C);
  if (px < BX || py < BY || x < 0 || y < 0 || x >= W || y >= H) return null;
  return [x, y];
}

function piece(x: number, y: number): Piece | null {
  const c = grid[y][x];
  return c && (c.k === "mirror" || c.k === "split") ? c : null;
}

function turn(x: number, y: number, by: number) {
  const c = piece(x, y);
  if (!c || c.lock) { if (c) { rg.sound("wrong"); rg.vibrate(20); } return; }
  // to the next whole step of 22.5° in that direction
  const now = c.turns || 0;
  c.turns = by > 0 ? Math.floor(now + 1e-6) + 1 : Math.ceil(now - 1e-6) - 1;
  c.m = ((c.turns % 8) + 8) % 8;
  sel = [x, y];
  rg.sound("tick", { pitch: 0.9 + c.m * 0.05 });
  rg.vibrate(8);
  retrace();
}

function put(x: number, y: number, k: string, m: number, turns?: number) {
  grid[y][x] = { k: k, m: m, turns: turns === undefined ? m : turns, va: (turns === undefined ? m : turns) * 22.5, born: t };
  sel = [x, y];
  retrace();
}

function takeBack(x: number, y: number) {
  const c = piece(x, y);
  if (!c || c.fixed) return;
  left[c.k]++;
  grid[y][x] = null;
  if (sel && sel[0] === x && sel[1] === y) sel = null;
  rg.sound("whoosh");
  retrace();
}

function reset() {
  const k = kind;
  start(lv);
  kind = left[k] ? k : kind;
}

// --- input ---------------------------------------------------------------

function onPointerDown(px: number, py: number) {
  if (mode !== "play" || won) return;
  const cell = cellAt(px, py);
  if (!cell) return;
  const [x, y] = cell;
  const c = piece(x, y);
  if (c) {
    drag = { kind: c.k, fromX: x, fromY: y, tray: false, x: px, y: py, sx: px, sy: py, moved: false, rot: false, turns0: c.turns || 0, m0: c.m || 0 };
    return;
  }
  if (canPlace(x, y)) {
    if (!left[kind]) { kind = left.mirror ? "mirror" : left.split ? "split" : kind; }
    if (!left[kind]) { rg.sound("wrong"); return; }
    left[kind]--;
    put(x, y, kind, 2);
    rg.sound("pop");
    rg.vibrate(12);
  }
}

function trayDown(k: string, info: any) {
  if (won || !left[k]) return;
  kind = k;
  drag = { kind: k, fromX: -1, fromY: -1, tray: true, x: info.x, y: info.y, sx: info.x, sy: info.y, moved: false, rot: false, turns0: 0, m0: 0 };
}

function onPointerUp(px: number, py: number) {
  const d = drag;
  drag = null;
  if (!d || mode !== "play" || won) return;
  const cell = cellAt(px, py);
  if (d.tray) {
    if (d.moved && cell && canPlace(cell[0], cell[1]) && left[d.kind]) {
      left[d.kind]--;
      put(cell[0], cell[1], d.kind, 2);
      rg.sound("pop"); rg.vibrate(12);
    }
    return;
  }
  const c = piece(d.fromX, d.fromY);
  if (!c) return;
  if (d.rot) { endRotate(c); return; }
  if (!d.moved || (cell && cell[0] === d.fromX && cell[1] === d.fromY)) { turn(d.fromX, d.fromY, 1); return; }
  if (c.fixed) { rg.sound("wrong"); return; }
  if (!cell) { takeBack(d.fromX, d.fromY); return; }
  if (canPlace(cell[0], cell[1])) {
    grid[d.fromY][d.fromX] = null;
    put(cell[0], cell[1], c.k, c.m || 0, c.turns);
    rg.sound("pop", { pitch: 1.2 });
  }
}

function onBack() {
  if (mode === "play") { mode = "menu"; rg.sound("click"); } else rg.exit();
}

function onKeyDown(key: string) {
  if (mode !== "play" || !sel) return;
  if (key === "ArrowRight" || key === "ArrowUp" || key === " ") turn(sel[0], sel[1], 1);
  if (key === "ArrowLeft" || key === "ArrowDown") turn(sel[0], sel[1], -1);
  if (key === "Delete" || key === "Backspace") takeBack(sel[0], sel[1]);
}

// --- turning with the finger -----------------------------------------------
// Pressing a mirror and moving the finger around it turns the mirror to point
// at the finger, steplessly, and the light follows at every angle. A finger
// that goes far from the mirror (more than ROT_R cells) carries the mirror to
// another square instead.

const ROT_R = 1.6;

function rotateDrag(d: Drag) {
  const c = piece(d.fromX, d.fromY);
  if (!c) return;
  const cx = BX + (d.fromX + 0.5) * C, cy = BY + (d.fromY + 0.5) * C;
  const dx = d.x - cx, dy = d.y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > ROT_R * C && !c.fixed) {
    // too far: this is a move, the mirror keeps the angle it had
    if (d.rot) { c.turns = d.turns0; c.m = d.m0; c.va = d.turns0 * 22.5; d.rot = false; retrace(); }
    d.moved = true;
    return;
  }
  if (c.lock) { if (!d.rot && r > C * 0.35) { d.rot = true; rg.sound("wrong"); rg.vibrate(20); } return; }
  if (r < C * 0.3 && !d.rot) return;
  if (r < C * 0.15) return;
  d.rot = true;
  d.moved = false;
  sel = [d.fromX, d.fromY];
  // a mirror is the same turned half a circle: take the angle nearest to now
  let a = Math.atan2(dy, dx) * 180 / Math.PI;
  const now = c.va === undefined ? (c.turns || 0) * 22.5 : c.va;
  while (a - now > 90) a -= 180;
  while (a - now < -90) a += 180;
  if (Math.abs(a - now) < 0.05) return;
  // a soft click every 22.5° passed, like a dial
  if (Math.floor(a / 22.5) !== Math.floor(now / 22.5)) { rg.sound("tick", { pitch: 0.9 + (((Math.round(a / 22.5) % 8) + 8) % 8) * 0.05, volume: 0.5 }); rg.vibrate(4); }
  c.va = a;
  c.turns = a / 22.5;
  c.m = ((c.turns % 8) + 8) % 8;
  retrace();
}

function endRotate(c: Piece) {
  if (c.lock) return;
  // stays where the finger left it; only within 1.5° of a whole step it
  // settles on the step (so the exact angles of the levels are easy to hit)
  const a = c.va === undefined ? (c.turns || 0) * 22.5 : c.va;
  const step = Math.round(a / 22.5) * 22.5;
  c.turns = (Math.abs(a - step) < 1.5 ? step : a) / 22.5;
  c.m = ((c.turns % 8) + 8) % 8;
  retrace();
}

// --- time ----------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  layout();
  if (mode !== "play") return;
  if (drag && input.pointer.down) {
    drag.x = input.pointer.x; drag.y = input.pointer.y;
    if (drag.tray) { if (Math.abs(drag.x - drag.sx) + Math.abs(drag.y - drag.sy) > 12) drag.moved = true; }
    else if (Math.abs(drag.x - drag.sx) + Math.abs(drag.y - drag.sy) > 6 || drag.rot) rotateDrag(drag);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (!c) continue;
    if ((c.k === "mirror" || c.k === "split") && !(drag && drag.rot && drag.fromX === x && drag.fromY === y)) {
      const to = (c.turns || 0) * 22.5;
      c.va = (c.va === undefined ? to : c.va) + (to - (c.va === undefined ? to : c.va)) * Math.min(1, dt * 16);
    }
    if (c.k === "target" || c.k === "owl") {
      const key = x + "," + y;
      const on = c.k === "owl" ? tr.owls.indexOf(key) >= 0 : tr.lit.indexOf(key) >= 0;
      const before = glow[key] || 0;
      const g = rg.clamp(before + (on ? dt * 1.6 : -dt * 1.2), 0, 1);
      glow[key] = g;
      if (on && before < 0.5 && g >= 0.5) {
        if (c.k === "owl") { rg.sound("hit"); rg.vibrate([40, 30, 40]); rg.say("peilit_pollo"); owlWoke = 1.5; }
        else rg.sound("star", { pitch: 0.9 + rg.random() * 0.3 });
      }
    }
  }
  if (owlWoke > 0) owlWoke -= dt;
  if (won) { wonClock += dt; return; }
  if (solved(grid, tr)) {
    goodClock += dt;
    if (goodClock > 1.1) win();
  } else goodClock = 0;
}

function win() {
  won = true; wonClock = 0; sel = null; drag = null;
  const par = LEVELS[lv].par || 0;
  const n = placed();
  stars = n <= par ? 3 : n === par + 1 ? 2 : 1;
  const k = String(lv);
  if (!best[k] || best[k] < stars) { best[k] = stars; rg.save("stars", best); }
  rg.sound("win");
  rg.vibrate([50, 40, 90]);
  rg.celebrate(width / 2, BY + C * H * 0.4, { big: stars === 3 });
  rg.say(rg.pick(["hienoa", "mahtavaa", "loistavaa", "taitava"]));
}

// --- drawing -------------------------------------------------------------

// 22.5 → "22,5°" (Finnish, Spanish) / "22.5°"; whole degrees without decimals
function deg(a: number): string {
  // 22.5 stays 22.5, other angles in whole degrees
  const r = Math.abs(a * 2 - Math.round(a * 2)) < 0.05 ? Math.round(a * 2) / 2 : Math.round(a);
  const s = r % 1 ? r.toFixed(1) : String(Math.round(r));
  return (rg.lang === "en" ? s : s.split(".").join(",")) + "°";
}

function px(v: number) { return Math.round(v * C * 10) / 10; }

function beamPath(): string {
  let d = "";
  for (const s of tr.segs) d += "M " + px(s[0]) + " " + px(s[1]) + " L " + px(s[2]) + " " + px(s[3]) + " ";
  return d;
}

function Beams() {
  if (!tr.segs.length) return [];
  const d = beamPath();
  const vb = "0 0 " + C * W + " " + C * H;
  const full = { position: "absolute", left: 0, top: 0, width: C * W, height: C * H };
  const pulse = 0.8 + Math.sin(t * 5) * 0.2;
  const out: any[] = [
    <path d={d} stroke={"rgba(255,214,90," + (0.28 * pulse).toFixed(2) + ")"} strokeWidth={String(Math.round(C * 0.42))} fill="none" viewBox={vb} style={full} />,
    <path d={d} stroke="rgba(255,200,40,0.85)" strokeWidth="6" fill="none" viewBox={vb} style={full} />,
    <path d={d} stroke="#fffbe6" strokeWidth="2.5" fill="none" viewBox={vb} style={full} />,
  ];
  // sparkles running along the light
  let n = 0;
  const gap = C * 0.9;
  for (const s of tr.segs) {
    const x0 = s[0] * C, y0 = s[1] * C, x1 = s[2] * C, y1 = s[3] * C;
    const len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    if (len < 2) continue;
    for (let p = (t * C * 2.4) % gap; p < len && n < 70; p += gap, n++) {
      const k = p / len;
      out.push(<div className="spark" style={{ left: Math.round(x0 + (x1 - x0) * k - 3), top: Math.round(y0 + (y1 - y0) * k - 3) }} />);
    }
  }
  return out;
}

function SourceView(c: Cell, x: number, y: number) {
  const ang = (c.d || 0) * 45;
  const sun = y === 0 || x === 0 || y === H - 1 || x === W - 1;
  return (
    <div className="cell" style={{ left: x * C, top: y * C, width: C, height: C }}>
      <div className="lamp" style={{ left: 3, top: 3, width: C - 6, height: C - 6, borderRadius: (C - 6) / 2, transform: "rotate(" + ang + "deg)" }}>
        <div className="nozzle" style={{ width: Math.round(C * 0.3), height: Math.round(C * 0.3), left: C - 6 - Math.round(C * 0.2), top: Math.round((C - 6) / 2 - C * 0.15) }} />
      </div>
      <div className="lampicon" style={{ left: 0, top: 0, width: C, height: C, fontSize: Math.round(C * 0.5) }}>{sun ? "☀️" : "🔦"}</div>
    </div>
  );
}

const SPRITES: { [k: string]: string[] } = {
  flower: ["🌱", "🌷"], sunflower: ["🌻", "🌻"], panel: ["", ""], cat: ["😾", "😺"], lizard: ["🦎", "🦎"], laundry: ["👕", "👕"], owl: ["🦉", "🦉"],
};

function TargetView(c: Cell, x: number, y: number) {
  const key = x + "," + y;
  const g = glow[key] || 0;
  const on = g >= 0.5;
  const fs = Math.round(C * 0.62);
  const kids: any[] = [];
  const kindT = c.k === "owl" ? "owl" : c.t || "flower";
  let tf = "";
  let op = 1;
  let icon = SPRITES[kindT][on ? 1 : 0];
  if (kindT === "flower") { const s = 0.75 + g * 0.45; tf = "scale(" + s.toFixed(2) + ") rotate(" + Math.round(Math.sin(t * 2 + x) * (on ? 8 : 3)) + "deg)"; }
  else if (kindT === "sunflower") { tf = "rotate(" + Math.round(-40 * (1 - g) + Math.sin(t * 2) * 4 * g) + "deg)"; op = 0.55 + 0.45 * g; }
  else if (kindT === "cat") {
    if (g > 0.95) { icon = "😽"; kids.push(<div className="zz" style={{ left: C * 0.55, top: C * 0.05 - ((t * 14) % 14), opacity: 1 - ((t * 0.9) % 1) }}>💤</div>); }
    else if (!on) tf = "translateX(" + (Math.sin(t * 40) > 0 ? 1 : -1) + "px)";
  }
  else if (kindT === "lizard") { op = 0.5 + 0.5 * g; tf = on ? "rotate(" + Math.round(Math.sin(t * 14) * 12) + "deg)" : "rotate(-90deg)"; if (!on) kids.push(<div className="cold" style={{ left: C * 0.58, top: 0 }}>❄️</div>); }
  else if (kindT === "laundry") {
    tf = "rotate(" + Math.round(Math.sin(t * 3 + y) * (4 + 8 * g)) + "deg)";
    if (!on) kids.push(<div className="drip" style={{ left: C * 0.42, top: C * 0.62 + ((t * 18) % 12), opacity: 1 - ((t * 1.5) % 1) }}>💧</div>);
    else if (g > 0.95) kids.push(<div className="cold" style={{ left: C * 0.6, top: 0 }}>✨</div>);
  }
  else if (kindT === "owl") {
    if (on) { tf = "rotate(" + Math.round(Math.sin(t * 30) * 10) + "deg)"; kids.push(<div className="bang" style={{ left: C * 0.62, top: -2 }}>❗</div>); }
    else kids.push(<div className="zz" style={{ left: C * 0.55, top: C * 0.05 - ((t * 10) % 12), opacity: 1 - ((t * 0.7) % 1) }}>💤</div>);
  }
  let body: any;
  if (kindT === "panel") {
    body = (
      <div className="panel" style={{ left: Math.round(C * 0.11), top: Math.round(C * 0.16), width: Math.round(C * 0.78), height: Math.round(C * 0.62), borderColor: on ? "#ffd166" : "#adb5bd" }}>
        <div className="prow"><div className="pcell" /><div className="pcell" /><div className="pcell" /></div>
        <div className="prow"><div className="pcell" /><div className="pcell" /><div className="pcell" /></div>
      </div>
    );
    kids.push(<div className="charge" style={{ left: C * 0.12, top: C * 0.84, width: Math.round(C * 0.76 * g), height: 4 }} />);
    if (g > 0.95) kids.push(<div className="bolt" style={{ left: C * 0.6, top: -4 - Math.abs(Math.sin(t * 6)) * 4 }}>⚡</div>);
  } else body = <div className="sprite" style={{ left: 0, top: 0, width: C, height: C, fontSize: fs, transform: tf, opacity: op.toFixed(2) }}>{icon}</div>;
  const bg = kindT === "owl" ? (on ? "rgba(239,71,111,0.55)" : "rgba(43,45,66,0.35)") : on ? "rgba(255,214,90," + (0.35 + 0.25 * Math.sin(t * 4)).toFixed(2) + ")" : "rgba(255,255,255,0.18)";
  return (
    <div className="cell" style={{ left: x * C, top: y * C, width: C, height: C }}>
      <div className="tbase" style={{ left: 3, top: 3, width: C - 6, height: C - 6, borderRadius: (C - 6) / 2, backgroundColor: bg }} />
      {body}
      {kids}
    </div>
  );
}

function MirrorView(c: Piece, x: number, y: number, ghost?: boolean, px0?: number, py0?: number) {
  const isSel = !ghost && sel && sel[0] === x && sel[1] === y;
  const born = c.born === undefined ? 1 : Math.min(1, (t - c.born) / 0.2);
  const s = ghost ? 1 : rg.ease.back(born);
  const len = Math.round(C * 0.92 * s);
  const th = Math.max(6, Math.round(C * 0.15));
  const left0 = px0 === undefined ? x * C : px0 - C / 2;
  const top0 = py0 === undefined ? y * C : py0 - C / 2;
  const ang = (c.va === undefined ? (c.m || 0) * 22.5 : c.va).toFixed(1);
  return (
    <div className="cell" style={{ left: left0, top: top0, width: C, height: C, opacity: ghost ? (0.45 + 0.3 * Math.sin(t * 6)).toFixed(2) : "1" }}>
      {isSel ? <div className="selring" style={{ left: 2, top: 2, width: C - 4, height: C - 4, borderRadius: (C - 4) / 2 }} /> : null}
      <div className={"bar " + c.k} style={{ left: (C - len) / 2, top: (C - th) / 2, width: len, height: th, transform: "rotate(" + ang + "deg)" }}>
        <div className="shine" style={{ left: len * 0.15, top: 1, width: len * 0.5, height: 2 }} />
      </div>
      {c.fixed ? <div className={c.lock ? "pin lock" : "pin"} style={{ width: 12, height: 12, borderRadius: 6, left: C / 2 - 6, top: C / 2 - 6 }} /> : null}
    </div>
  );
}

function selHit(): FreeHit | null {
  if (!sel) return null;
  for (const h of tr.hits) if (h.x === sel[0] && h.y === sel[1]) return h;
  return null;
}

// the angle at the selected mirror: its normal at the point the light hits
// and the two equal angles
function AngleView() {
  const h = selHit();
  if (!h) return [];
  const a = incidenceOf(h);
  const cx = h.px * C, cy = h.py * C;
  // the normal on the side the light comes from: along out − in
  let nx = h.ox - h.ix, ny = h.oy - h.iy;
  const nl = Math.sqrt(nx * nx + ny * ny);
  if (nl < 1e-6) return [];
  nx /= nl; ny /= nl;
  let d = "";
  const L = C * 0.85;
  for (let k = 0; k < 5; k++) {
    const a0 = (k * 2) / 10, a1 = (k * 2 + 1) / 10;
    d += "M " + (cx + nx * L * a0).toFixed(1) + " " + (cy + ny * L * a0).toFixed(1) + " L " + (cx + nx * L * a1).toFixed(1) + " " + (cy + ny * L * a1).toFixed(1) + " ";
  }
  const vb = "0 0 " + C * W + " " + C * H;
  const out: any[] = [<path d={d} stroke="#ffffff" strokeWidth="2" fill="none" viewBox={vb} style={{ position: "absolute", left: 0, top: 0, width: C * W, height: C * H }} />];
  if (a > 0.5) {
    const label = deg(a);
    const spots = [[-h.ix + nx, -h.iy + ny], [h.ox + nx, h.oy + ny]];
    for (const s of spots) {
      const l = Math.sqrt(s[0] * s[0] + s[1] * s[1]) || 1;
      const lx = cx + (s[0] / l) * C * 0.95, ly = cy + (s[1] / l) * C * 0.95;
      out.push(<div className="deg" style={{ left: Math.round(lx - 22), top: Math.round(ly - 11) }}>{label}</div>);
    }
  }
  return out;
}

// the same angle of a mirror (half a turn is the same mirror), in steps
function sameAngle(m1: number, m2: number): boolean {
  const d = (((m1 - m2) % 8) + 8) % 8;
  return d < 0.07 || d > 8 - 0.07;
}

function hintPiece(): any {
  if (!hintOn) return null;
  for (const hp of LEVELS[lv].hint || []) {
    const [x, y, k, m] = hp;
    const c = grid[y][x];
    if (c && c.k === k && sameAngle(c.m || 0, m)) continue;
    return { x: x, y: y, k: k, m: m };
  }
  return null;
}

// a stone drawn with boxes (the rock emoji is too new for many phones)
function Stone(x: number, y: number) {
  const w = Math.round(C * 0.7), h = Math.round(C * 0.52);
  const tilt = ((x * 7 + y * 3) % 5) * 6 - 12;
  return (
    <div className="stone" style={{ width: w, height: h, borderRadius: Math.round(h * 0.48), transform: "rotate(" + tilt + "deg)" }}>
      <div className="stonehi" style={{ left: Math.round(w * 0.18), top: Math.round(h * 0.16), width: Math.round(w * 0.36), height: Math.round(h * 0.26), borderRadius: Math.round(h * 0.13) }} />
    </div>
  );
}

function Board() {
  const tiles: any[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y].charAt(x);
    let cls = (x + y) % 2 ? "tile a" : "tile b";
    if (ch === "#") cls = "tile wall";
    else if (ch === "~") cls = "tile pond";
    if (drag && drag.moved && canPlace(x, y)) { const cc = cellAt(drag.x, drag.y); if (cc && cc[0] === x && cc[1] === y) cls += " drop"; }
    tiles.push(<div className={cls} style={{ left: x * C + 1, top: y * C + 1, width: C - 2, height: C - 2 }}>{ch === "#" ? Stone(x, y) : null}</div>);
  }
  const things: any[] = [];
  const mirrors: any[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (!c) continue;
    if (c.k === "src") things.push(SourceView(c, x, y));
    else if (c.k === "target" || c.k === "owl") things.push(TargetView(c, x, y));
    else if (c.k === "mirror" || c.k === "split") {
      if (drag && drag.moved && !drag.tray && drag.fromX === x && drag.fromY === y && !c.fixed) continue;
      mirrors.push(MirrorView(c, x, y));
    }
  }
  const hp = hintPiece();
  if (hp) mirrors.push(MirrorView({ k: hp.k, m: hp.m }, hp.x, hp.y, true));
  let flying: any = null;
  if (drag && drag.moved) {
    const c = drag.tray ? { k: drag.kind, m: 2 } : piece(drag.fromX, drag.fromY);
    if (c && !c.fixed) flying = MirrorView(c, -1, -1, true, drag.x - BX, drag.y - BY);
  }
  return (
    <div className="board" style={{ left: BX - 4, top: BY - 4, width: C * W + 8, height: C * H + 8 }}>
      <div className="inner" style={{ left: 4, top: 4, width: C * W, height: C * H }}>
        {tiles}
        {Beams()}
        {things}
        {mirrors}
        {AngleView()}
        {flying}
      </div>
    </div>
  );
}

function info(): string {
  if (owlWoke > 0) return rg.t("Hups! Pöllö heräsi. Pidä valo poissa siitä.", "Oops! The owl woke up. Keep the light away.", "¡Uy! El búho se despertó. Aleja la luz.");
  if (sel) {
    const c = piece(sel[0], sel[1]);
    const h = selHit();
    if (c && h) {
      const a = incidenceOf(h);
      if (a < 0.5) return rg.t("Valo osuu suoraan ja palaa takaisin.", "The light hits straight on and comes back.", "La luz llega de frente y vuelve.");
      return rg.t("Tulokulma " + deg(a) + " = heijastuskulma " + deg(a), "Angle in " + deg(a) + " = angle out " + deg(a), "Ángulo de entrada " + deg(a) + " = ángulo de salida " + deg(a));
    }
  }
  return rg.t(LEVELS[lv].tip);
}

function TrayItem(k: string) {
  const n = left[k];
  const on = kind === k && n > 0;
  return (
    <div className={"titem" + (on ? " on" : "") + (n ? "" : " off")} id={"tray_" + k} onPointerDown={(i: any) => trayDown(k, i)} onClick={() => { if (left[k]) { kind = k; rg.sound("click"); } }}>
      <div className="ticon"><div className={"bar " + k} style={{ left: 3, top: 14, width: 34, height: 8, transform: "rotate(-30deg)" }} /></div>
      <div className="tlabel">{k === "mirror" ? rg.t("Peili", "Mirror", "Espejo") : rg.t("Puolipeili", "Half mirror", "Semiespejo")}</div>
      <div className="tcount">×{n}</div>
    </div>
  );
}

function Tools() {
  const L = LEVELS[lv];
  const items: any[] = [];
  if (L.tray.mirror) items.push(TrayItem("mirror"));
  if (L.tray.split) items.push(TrayItem("split"));
  const sc = sel ? piece(sel[0], sel[1]) : null;
  const tools: any[] = [];
  if (sc && !sc.lock) {
    tools.push(<div className="tool" id="rotl" onClick={() => sel && turn(sel[0], sel[1], -1)}>{Icon("rotl", 26)}</div>);
    tools.push(<div className="tool" id="rotr" onClick={() => sel && turn(sel[0], sel[1], 1)}>{Icon("rotr", 26)}</div>);
    if (!sc.fixed) tools.push(<div className="tool" id="remove" onClick={() => sel && takeBack(sel[0], sel[1])}>{Icon("tray", 26)}</div>);
  }
  tools.push(<div className={hintOn ? "tool hint on" : "tool hint"} id="hint" onClick={() => { hintOn = !hintOn; rg.sound("click"); }}>💡</div>);
  tools.push(<div className="tool" id="reset" onClick={() => reset()}>{Icon("reset", 26)}</div>);
  const y0 = BY + C * H + 8;
  return (
    <div className="dock" style={{ top: y0, width: width }}>
      <div className="info">{info()}</div>
      <div className="row">{items}</div>
      <div className="row">{tools}</div>
    </div>
  );
}

function Stars(n: number, size: number) {
  const out: any[] = [];
  for (let i = 0; i < 3; i++) out.push(<div style={{ fontSize: size, opacity: i < n ? "1" : "0.25" }}>⭐</div>);
  return <div className="stars">{out}</div>;
}

// the buttons' symbols drawn as lines (arrow and box-drawing characters are
// missing from many phone fonts)
function arc(cx: number, cy: number, r: number, a0: number, a1: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= 16; i++) { const a = (a0 + (a1 - a0) * i / 16) * Math.PI / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

function line(pts: number[][]): string {
  let d = "";
  for (let i = 0; i < pts.length; i++) d += (i ? " L " : "M ") + pts[i][0].toFixed(2) + " " + pts[i][1].toFixed(2);
  return d;
}

// a filled arrow head at p pointing along angle a (degrees)
function head(p: number[], a: number, s: number): string {
  const r = a * Math.PI / 180, b = 2.5;
  const tip = [p[0] + Math.cos(r) * s, p[1] + Math.sin(r) * s];
  const l = [p[0] + Math.cos(r + b) * s * 0.8, p[1] + Math.sin(r + b) * s * 0.8];
  const q = [p[0] + Math.cos(r - b) * s * 0.8, p[1] + Math.sin(r - b) * s * 0.8];
  return line([tip, l, q]) + " Z";
}

function Icon(name: string, size: number) {
  const vb = "0 0 24 24";
  const st = { width: size, height: size };
  if (name === "menu") {
    return (
      <div style={{ width: size, height: size, flexDirection: "column", justifyContent: "space-around", paddingTop: 3, paddingBottom: 3 }}>
        <div className="mline" /><div className="mline" /><div className="mline" />
      </div>
    );
  }
  let d = "", f = "";
  if (name === "rotl" || name === "rotr" || name === "reset") {
    const pts = name === "rotr" ? arc(12, 12, 7.5, 200, 400) : name === "rotl" ? arc(12, 12, 7.5, 340, 140) : arc(12, 12, 7.5, -60, 230);
    d = line(pts);
    const e = pts[pts.length - 1], p = pts[pts.length - 2];
    f = head(e, Math.atan2(e[1] - p[1], e[0] - p[0]) * 180 / Math.PI, 7);
  } else if (name === "tray") {
    d = "M 12 3 L 12 14 M 4 16 L 4 20 L 20 20 L 20 16";
    f = head([12, 14], 90, 5.5);
  }
  return (
    <div style={st}>
      <path d={d} stroke="#ffffff" strokeWidth="2.6" fill="none" viewBox={vb} style={{ position: "absolute", left: 0, top: 0, width: size, height: size }} />
      <path d={f} fill="#ffffff" viewBox={vb} style={{ position: "absolute", left: 0, top: 0, width: size, height: size }} />
    </div>
  );
}

function WonCard() {
  if (!won || wonClock < 0.6) return null;
  const k = Math.min(1, (wonClock - 0.6) / 0.3);
  const last = lv >= LEVELS.length - 1;
  return (
    <div className="wonwrap" style={{ top: height - 210 + (1 - rg.ease.out(k)) * 220, width: width }}>
      <div className="won">
        <div className="wtitle">{last ? rg.t("Kaikki valaistu! 🎉", "All lit up! 🎉", "¡Todo iluminado! 🎉") : rg.t("Valoa riitti! 🎉", "Light for all! 🎉", "¡Luz para todos! 🎉")}</div>
        {Stars(stars, 30)}
        <div className="wsub">{stars < 3 ? rg.t("Onnistuu vähemmälläkin: " + (LEVELS[lv].par || 0) + " kpl", "Can be done with fewer: " + (LEVELS[lv].par || 0), "Se puede con menos: " + (LEVELS[lv].par || 0)) : rg.t("Vähillä peileillä, hienoa!", "With few mirrors, great!", "¡Con pocos espejos, genial!")}</div>
        <div className="wrow">
          <div className="wbtn alt" id="again" onClick={() => start(lv)}>{Icon("reset", 26)}</div>
          <div className="wbtn alt" id="tomenu" onClick={() => { mode = "menu"; rg.sound("click"); }}>{Icon("menu", 22)}</div>
          {last ? null : <div className="wbtn next" id="next" onClick={() => start(lv + 1)}>{rg.t("Seuraava ▶", "Next ▶", "Siguiente ▶")}</div>}
        </div>
      </div>
    </div>
  );
}

function Play() {
  const L = LEVELS[lv];
  return (
    <div className="screen">
      <div className="head" style={{ width: width }}>
        <div className="hbtn" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}>{Icon("menu", 22)}</div>
        <div className="htext">
          <div className="hnum">{rg.t("Taso", "Level", "Nivel")} {lv + 1}/{LEVELS.length}</div>
          <div className="hname">{rg.t(L.name)}</div>
        </div>
      </div>
      {Board()}
      {Tools()}
      {WonCard()}
    </div>
  );
}

const LEVEL_ICONS: { [k: string]: string } = { F: "🌷", U: "🌻", P: "🔋", C: "🐱", L: "🦎", W: "👕", O: "🦉" };

function levelIcons(i: number): string {
  let s = "";
  const seen: { [k: string]: boolean } = {};
  for (const r of LEVELS[i].map) for (let x = 0; x < r.length; x++) {
    const ch = r.charAt(x);
    if (LEVEL_ICONS[ch] && !seen[ch] && s.length < 8) { seen[ch] = true; s += LEVEL_ICONS[ch]; }
  }
  return s;
}

function MenuBeam() {
  // a little beam bouncing between two mirrors under the title
  const w = 300, h = 70;
  const k = (Math.sin(t * 1.4) + 1) / 2;
  const mx = 40 + k * 220;
  const d = "M 0 12 L " + mx.toFixed(1) + " 12 L " + mx.toFixed(1) + " 58 L 300 58";
  return (
    <div className="mbeam" style={{ width: w, height: h }}>
      <path d={d} stroke="rgba(255,214,90,0.35)" strokeWidth="14" fill="none" viewBox={"0 0 " + w + " " + h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h }} />
      <path d={d} stroke="#fffbe6" strokeWidth="3" fill="none" viewBox={"0 0 " + w + " " + h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h }} />
      <div className="bar mirror" style={{ position: "absolute", left: mx - 18, top: 9, width: 36, height: 7, transform: "rotate(45deg)" }} />
      <div className="bar mirror" style={{ position: "absolute", left: mx - 18, top: 55, width: 36, height: 7, transform: "rotate(45deg)" }} />
      <div className="mflower" style={{ left: w - 30, top: 36 }}>{Math.floor(t) % 2 ? "🌷" : "🌸"}</div>
    </div>
  );
}

function Menu() {
  const cards: any[] = [];
  let next = 0;
  while (next < LEVELS.length && best[String(next)]) next++;
  for (let i = 0; i < LEVELS.length; i++) {
    const b = best[String(i)] || 0;
    const isNext = i === next;
    cards.push(
      <div className={"lvl" + (b ? " done" : "") + (isNext ? " next" : "")} id={"lvl" + (i + 1)} onClick={() => start(i)}
        style={isNext ? { borderColor: Math.floor(t * 2) % 2 ? "#ffffff" : "#ffd166" } : {}}>
        <div className="lnum">{i + 1}</div>
        <div className="licons">{levelIcons(i)}</div>
        <div className="lstars">{b ? Stars(b, 13) : null}</div>
      </div>
    );
  }
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Valopeilit", "Mirror Light", "Espejos de luz")}</div>
      <div className="subtitle">{rg.t("Ohjaa valo peileillä perille", "Guide the light with mirrors", "Guía la luz con espejos")}</div>
      {MenuBeam()}
      <div className="grid">{cards}</div>
      <div className="mhelp">{rg.t("Pyöritä peiliä sormella, se kääntyy portaattomasti. Vedä kauas: siirtyy.", "Circle a mirror to turn it. Drag far to move it.", "Gira el espejo con el dedo. Arrástralo lejos para moverlo.")}</div>
    </div>
  );
}

function view() {
  return mode === "menu" ? Menu() : Play();
}
