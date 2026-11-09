// Valopeilit: light comes from the sun or a torch, and mirrors bring it to
// a flower, a solar panel, a cat that wants a sunny nap, a cold lizard or
// wet laundry – but never to the owl, who sleeps in the day. The angle of
// incidence is the angle of reflection: a tapped mirror turns 22.5°, and
// the angle at the selected mirror is shown on the board.
// Optics: lib/optics.ts, levels: lib/levels.ts (checked by tools/peilit/solve.ts).

import { trace, parseMap, solved, incidence, Cell, Trace } from "lib/optics";
import { LEVELS } from "lib/levels";

type Piece = Cell & { turns?: number; va?: number; born?: number };
type Drag = { kind: string; fromX: number; fromY: number; tray: boolean; x: number; y: number; sx: number; sy: number; moved: boolean };

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
let tr: Trace = { segs: [], lit: [], owls: [], hits: [] };
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
  tr = trace(grid, W, H);
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
  c.turns = (c.turns || 0) + by;
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
    drag = { kind: c.k, fromX: x, fromY: y, tray: false, x: px, y: py, sx: px, sy: py, moved: false };
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
  drag = { kind: k, fromX: -1, fromY: -1, tray: true, x: info.x, y: info.y, sx: info.x, sy: info.y, moved: false };
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

// --- time ----------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  layout();
  if (mode !== "play") return;
  if (drag && input.pointer.down) {
    drag.x = input.pointer.x; drag.y = input.pointer.y;
    if (Math.abs(drag.x - drag.sx) + Math.abs(drag.y - drag.sy) > 12) drag.moved = true;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (!c) continue;
    if (c.k === "mirror" || c.k === "split") {
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
  const r = Math.round(a * 10) / 10;
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

// the angle at the selected mirror: its normal and the two equal angles
function AngleView() {
  if (!sel) return [];
  const c = piece(sel[0], sel[1]);
  if (!c) return [];
  let h: any = null;
  for (const x of tr.hits) if (x.x === sel[0] && x.y === sel[1] && x.dout !== x.din) { h = x; break; }
  if (!h) return [];
  const a = incidence(c.m || 0, h.din);
  const cx = (sel[0] + 0.5) * C, cy = (sel[1] + 0.5) * C;
  const nAng = ((c.m || 0) * 22.5 + 90) * Math.PI / 180;
  // the normal on the side the light comes from
  const back = (h.din * 45 + 180) * Math.PI / 180;
  let nx = Math.cos(nAng), ny = Math.sin(nAng);
  if (nx * Math.cos(back) + ny * Math.sin(back) < 0) { nx = -nx; ny = -ny; }
  let d = "";
  const L = C * 0.85;
  for (let k = 0; k < 5; k++) {
    const a0 = (k * 2) / 10, a1 = (k * 2 + 1) / 10;
    d += "M " + (cx + nx * L * a0).toFixed(1) + " " + (cy + ny * L * a0).toFixed(1) + " L " + (cx + nx * L * a1).toFixed(1) + " " + (cy + ny * L * a1).toFixed(1) + " ";
  }
  const vb = "0 0 " + C * W + " " + C * H;
  const out: any[] = [<path d={d} stroke="#ffffff" strokeWidth="2" fill="none" viewBox={vb} style={{ position: "absolute", left: 0, top: 0, width: C * W, height: C * H }} />];
  if (a > 0.5) {
    const outA = h.dout * 45 * Math.PI / 180;
    const label = deg(a);
    const spots = [[Math.cos(back) + nx, Math.sin(back) + ny], [Math.cos(outA) + nx, Math.sin(outA) + ny]];
    for (const s of spots) {
      const l = Math.sqrt(s[0] * s[0] + s[1] * s[1]) || 1;
      const lx = cx + (s[0] / l) * C * 0.95, ly = cy + (s[1] / l) * C * 0.95;
      out.push(<div className="deg" style={{ left: Math.round(lx - 22), top: Math.round(ly - 11) }}>{label}</div>);
    }
  }
  return out;
}

function hintPiece(): any {
  if (!hintOn) return null;
  for (const hp of LEVELS[lv].hint || []) {
    const [x, y, k, m] = hp;
    const c = grid[y][x];
    if (c && c.k === k && c.m === m) continue;
    return { x: x, y: y, k: k, m: m };
  }
  return null;
}

function Board() {
  const tiles: any[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y].charAt(x);
    let cls = (x + y) % 2 ? "tile a" : "tile b";
    if (ch === "#") cls = "tile wall";
    else if (ch === "~") cls = "tile pond";
    if (drag && drag.moved && canPlace(x, y)) { const cc = cellAt(drag.x, drag.y); if (cc && cc[0] === x && cc[1] === y) cls += " drop"; }
    tiles.push(<div className={cls} style={{ left: x * C + 1, top: y * C + 1, width: C - 2, height: C - 2 }}>{ch === "#" ? <div className="rock" style={{ fontSize: Math.round(C * 0.55) }}>🪨</div> : null}</div>);
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
    for (const h of tr.hits) if (c && h.x === sel[0] && h.y === sel[1] && h.dout !== h.din) {
      const a = incidence(c.m || 0, h.din);
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
    tools.push(<div className="tool" id="rotl" onClick={() => sel && turn(sel[0], sel[1], -1)}>⟲</div>);
    tools.push(<div className="tool" id="rotr" onClick={() => sel && turn(sel[0], sel[1], 1)}>⟳</div>);
    if (!sc.fixed) tools.push(<div className="tool" id="remove" onClick={() => sel && takeBack(sel[0], sel[1])}>↩</div>);
  }
  tools.push(<div className={hintOn ? "tool hint on" : "tool hint"} id="hint" onClick={() => { hintOn = !hintOn; rg.sound("click"); }}>💡</div>);
  tools.push(<div className="tool" id="reset" onClick={() => reset()}>↺</div>);
  const y0 = BY + C * H + 8;
  return (
    <div className="dock" style={{ top: y0, width: width }}>
      <div className="info">{info()}</div>
      <div className="row">{items}</div>
      <div className="row">{tools}</div>
    </div>
  );
}

function starText(n: number) {
  let s = "";
  for (let i = 0; i < 3; i++) s += i < n ? "⭐" : "☆";
  return s;
}

function WonCard() {
  if (!won || wonClock < 0.6) return null;
  const k = Math.min(1, (wonClock - 0.6) / 0.3);
  const last = lv >= LEVELS.length - 1;
  return (
    <div className="wonwrap" style={{ top: height - 210 + (1 - rg.ease.out(k)) * 220, width: width }}>
      <div className="won">
        <div className="wtitle">{last ? rg.t("Kaikki valaistu! 🎉", "All lit up! 🎉", "¡Todo iluminado! 🎉") : rg.t("Valoa riitti! 🎉", "Light for all! 🎉", "¡Luz para todos! 🎉")}</div>
        <div className="wstars">{starText(stars)}</div>
        <div className="wsub">{stars < 3 ? rg.t("Onnistuu vähemmälläkin: " + (LEVELS[lv].par || 0) + " kpl", "Can be done with fewer: " + (LEVELS[lv].par || 0), "Se puede con menos: " + (LEVELS[lv].par || 0)) : rg.t("Vähin mahdollinen määrä peilejä!", "The fewest mirrors possible!", "¡El mínimo de espejos!")}</div>
        <div className="wrow">
          <div className="wbtn alt" id="again" onClick={() => start(lv)}>↺</div>
          <div className="wbtn alt" id="tomenu" onClick={() => { mode = "menu"; rg.sound("click"); }}>☰</div>
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
        <div className="hbtn" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}>☰</div>
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
        <div className="lstars">{b ? starText(b) : " "}</div>
      </div>
    );
  }
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Valopeilit", "Mirror Light", "Espejos de luz")}</div>
      <div className="subtitle">{rg.t("Ohjaa valo peileillä perille", "Guide the light with mirrors", "Guía la luz con espejos")}</div>
      {MenuBeam()}
      <div className="grid">{cards}</div>
      <div className="mhelp">{rg.t("Napauta peiliä: se kääntyy. Vedä: se siirtyy.", "Tap a mirror to turn it, drag to move it.", "Toca un espejo para girarlo, arrástralo para moverlo.")}</div>
    </div>
  );
}

function view() {
  return mode === "menu" ? Menu() : Play();
}
