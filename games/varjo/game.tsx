// Varjopalat: a shadow puzzle. A lamp casts the shadow of a figure on the
// wall; move the coloured pieces onto the shadow so that they make the same
// figure. Tap a piece to turn it a quarter turn, ⇋ mirrors it. About right is
// right: a piece let go near its place settles there, and the figure is done
// when every piece is near its place or the pieces fill the shadow some other
// way. Figures and the rule: lib/shapes.ts (tested in tests/varjo.ts).

import { FIGURES, COLORS, SHAPES, Poly, place, centre, bbox, inside, identify, settle, solved, matchSlots, cornerGap, TOL } from "lib/shapes";

type Piece = {
  kind: string; cx: number; cy: number; rot: number; flip: boolean;
  vx: number; vy: number; va: number; vf: number;   // what is drawn, eases to the above
  pop: number;                                      // a little bounce when it settles
};

const HEAD = 56, BAR = 70;

let mode = "menu";
let t = 0;
let lv = 0;
let slots: Poly[] = [];
let kinds: string[] = [];
let pieces: Piece[] = [];
let K = 30, OX = 0, OY = 0;            // screen = O + units * K
let wall = [0, 0, 0, 0];               // the lit wall: x, y, w, h (px)
let grab = -1;                         // the piece under the finger
let grabDX = 0, grabDY = 0, downX = 0, downY = 0, moved = false;
let sel = -1;                          // the piece the buttons turn
let hint = -1, hintClock = 0;
let won = false, wonClock = 0;
let done: { [k: string]: number } = {};
let told = false;
let laidFor = "";

function init() {
  done = rg.load("done", {});
}

// --- starting a figure -------------------------------------------------------

function start(i: number) {
  lv = i;
  const f = FIGURES[i];
  slots = f.polys;
  kinds = slots.map((p) => { const d = identify(p); return d ? d.kind : "S"; });
  pieces = [];
  for (const k of kinds) pieces.push({ kind: k, cx: 0, cy: 0, rot: 0, flip: false, vx: 0, vy: 0, va: 0, vf: 1, pop: 0 });
  rg.shuffle(pieces);
  for (const p of pieces) {
    p.rot = rg.range(0, 3);
    p.flip = rg.random() < 0.5;
    p.va = p.rot * 90; p.vf = p.flip ? -1 : 1;
  }
  grab = -1; sel = -1; hint = -1; won = false; wonClock = 0;
  mode = "play";
  laidFor = "";
  layout();
  rg.sound("click");
  if (!told) { rg.say("varjo_ohje"); told = true; }
}

// Fits the shadow on the wall and the pieces in the tray under it, all at
// the same scale (a piece must look as big as its place in the shadow).
function layout() {
  const key = lv + ":" + width + "x" + height;
  if (laidFor === key) return;
  const b = bbox(slots);
  const fw = b[2] - b[0], fh = b[3] - b[1];
  const wallH = Math.min(330, Math.round((height - HEAD - BAR) * 0.5));
  wall = [10, HEAD + 4, width - 20, wallH];
  K = Math.min((wall[2] - 40) / fw, (wall[3] - 40) / fh, 34);
  for (let tries = 0; tries < 12; tries++) {
    OX = wall[0] + (wall[2] - fw * K) / 2 - b[0] * K;
    OY = wall[1] + (wall[3] - fh * K) / 2 - b[1] * K;
    if (lay()) break;
    K *= 0.92;
  }
  laidFor = key;
}

// shelves of pieces under the wall, centred row by row; false = no room
function lay(): boolean {
  const top = wall[1] + wall[3] + 16, bottom = height - BAR - 8;
  const gap = 16, left = 12, right = width - 12;
  const rows: number[][] = [];     // piece indexes per row
  const ws: number[] = [], hs: number[] = [];
  let row: number[] = [], x = left;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const bb = bbox([place(p.kind, 0, 0, p.rot, p.flip)]);
    ws[i] = (bb[2] - bb[0]) * K; hs[i] = (bb[3] - bb[1]) * K;
    if (row.length && x + ws[i] > right) { rows.push(row); row = []; x = left; }
    row.push(i); x += ws[i] + gap;
  }
  if (row.length) rows.push(row);
  let total = 0;
  const rh: number[] = [];
  for (const r of rows) { let h = 0; for (const i of r) h = Math.max(h, hs[i]); rh.push(h); total += h; }
  total += gap * (rows.length - 1);
  if (total > bottom - top) return false;
  let y = top + (bottom - top - total) / 2;
  for (let n = 0; n < rows.length; n++) {
    let w = -gap;
    for (const i of rows[n]) w += ws[i] + gap;
    let xx = (width - w) / 2;
    for (const i of rows[n]) {
      const p = pieces[i];
      const sx = xx + ws[i] / 2, sy = y + rh[n] / 2;
      // the centre of the box is not the corner-average centre of a triangle
      const bb = bbox([place(p.kind, 0, 0, p.rot, p.flip)]);
      p.cx = (sx - OX) / K - (bb[0] + bb[2]) / 2;
      p.cy = (sy - OY) / K - (bb[1] + bb[3]) / 2;
      p.vx = p.cx; p.vy = p.cy;
      xx += ws[i] + gap;
    }
    y += rh[n] + gap;
  }
  return true;
}

// --- the pieces --------------------------------------------------------------

function logical(p: Piece): Poly { return place(p.kind, p.cx, p.cy, p.rot, p.flip); }

// what is drawn: the shape mirrored by vf and turned va degrees, in px
function drawn(p: Piece): Poly {
  const s = SHAPES[p.kind];
  const c = centre(s);
  const r = p.va * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
  const sc = 1 + p.pop * 0.08;
  return s.map((v) => {
    const x = (v[0] - c[0]) * p.vf * sc, y = (v[1] - c[1]) * sc;
    return [OX + (p.vx + x * co - y * si) * K, OY + (p.vy + x * si + y * co) * K];
  });
}

// the piece under a finger at (px, py): topmost first, and a finger just
// beside a thin corner still counts
function pieceAt(px: number, py: number): number {
  const ux = (px - OX) / K, uy = (py - OY) / K;
  for (let i = pieces.length - 1; i >= 0; i--) if (inside(logical(pieces[i]), ux, uy)) return i;
  let best = -1, bd = 14 / K;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const d = edgeDist(logical(pieces[i]), ux, uy);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function edgeDist(p: Poly, x: number, y: number): number {
  let best = 1e9;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const k = rg.clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    const ex = a[0] + dx * k - x, ey = a[1] + dy * k - y;
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
  }
  return best;
}

// a piece on top of the others keeps its place on top
function toTop(i: number): number {
  const p = pieces[i];
  pieces.splice(i, 1);
  pieces.push(p);
  return pieces.length - 1;
}

function onSlot(p: Piece): boolean {
  const q = logical(p);
  for (let j = 0; j < slots.length; j++) if (kinds[j] === p.kind && cornerGap(q, slots[j]) < 0.01) return true;
  return false;
}

function turn(i: number, by: number) {
  if (i < 0 || won) return;
  const p = pieces[i];
  p.rot += by;
  rg.sound("tick", { pitch: 1 + (((p.rot % 4) + 4) % 4) * 0.08 });
  rg.vibrate(6);
  afterMove(i, false);
}

function mirror(i: number) {
  if (i < 0 || won) return;
  const p = pieces[i];
  p.flip = !p.flip;
  rg.sound("tick", { pitch: 0.8 });
  rg.vibrate(6);
  afterMove(i, false);
}

// a turned or dropped piece settles on its place if it is near, then the
// whole figure is checked
function afterMove(i: number, dropped: boolean) {
  const p = pieces[i];
  const was = onSlot(p);
  const c = settle(slots, kinds, p.kind, p.cx, p.cy, p.rot, p.flip);
  p.cx = c[0]; p.cy = c[1];
  keepOnScreen(p);
  if (onSlot(p) && (dropped || !was)) { p.pop = 1; rg.sound("pop", { pitch: 1.1 + rg.random() * 0.2 }); rg.vibrate(15); }
  hint = -1;
  if (solved(slots, pieces.map(logical))) win();
}

function keepOnScreen(p: Piece) {
  const b = bbox([logical(p)]);
  const minX = (4 - OX) / K, maxX = (width - 4 - OX) / K, minY = (HEAD - OY) / K, maxY = (height - BAR - OY) / K;
  if (b[0] < minX) p.cx += minX - b[0];
  if (b[2] > maxX) p.cx -= b[2] - maxX;
  if (b[1] < minY) p.cy += minY - b[1];
  if (b[3] > maxY) p.cy -= b[3] - maxY;
}

function win() {
  won = true; wonClock = 0; grab = -1; sel = -1;
  // every piece goes exactly onto its place
  const m = matchSlots(slots, pieces.map(logical), TOL);
  if (m) for (let i = 0; i < pieces.length; i++) {
    const c = centre(slots[m[i]]);
    pieces[i].cx = c[0]; pieces[i].cy = c[1];
  }
  done[FIGURES[lv].id] = 1;
  rg.save("done", done);
  rg.sound("win");
  rg.vibrate([50, 40, 90]);
  rg.celebrate(wall[0] + wall[2] / 2, wall[1] + wall[3] / 2, { big: true });
  rg.say(["varjo_" + FIGURES[lv].id, lv === FIGURES.length - 1 ? "varjo_kaikki" : rg.pick(["hienoa", "mahtavaa", "loistavaa", "taitava"])]);
}

// 💡 the first place that has no piece on it lights up, and the piece that
// belongs there wiggles
function showHint() {
  if (won) return;
  const polys = pieces.map(logical);
  for (let j = 0; j < slots.length; j++) {
    let taken = false;
    for (const q of polys) if (cornerGap(q, slots[j]) < 0.01) taken = true;
    if (taken) continue;
    hint = j; hintClock = 0;
    rg.sound("star");
    rg.say("varjo_vihje");
    return;
  }
}

// --- input -------------------------------------------------------------------

function onPointerDown(px: number, py: number) {
  if (mode !== "play" || won) return;
  if (py < HEAD || py > height - BAR) return;     // the buttons
  const i = pieceAt(px, py);
  if (i < 0) { sel = -1; return; }
  grab = toTop(i);
  sel = grab;
  const p = pieces[grab];
  grabDX = p.cx - (px - OX) / K; grabDY = p.cy - (py - OY) / K;
  downX = px; downY = py; moved = false;
  rg.sound("click", { volume: 0.4 });
}

function onPointerUp(px: number, py: number) {
  if (grab < 0) return;
  const i = grab;
  grab = -1;
  if (!moved) { turn(i, 1); return; }
  afterMove(i, true);
}

function onBack() {
  if (mode === "play") { mode = "menu"; rg.sound("click"); } else rg.exit();
}

function onKeyDown(key: string) {
  if (mode !== "play") return;
  if (key === "ArrowRight" || key === " ") turn(sel, 1);
  if (key === "ArrowLeft") turn(sel, -1);
  if (key === "m" || key === "ArrowUp" || key === "ArrowDown") mirror(sel);
}

// --- time --------------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  if (mode !== "play") return;
  layout();
  if (grab >= 0 && input.pointer.down) {
    const px = input.pointer.x, py = input.pointer.y;
    if (!moved && Math.abs(px - downX) + Math.abs(py - downY) > 10) moved = true;
    if (moved) {
      const p = pieces[grab];
      p.cx = (px - OX) / K + grabDX; p.cy = (py - OY) / K + grabDY;
      p.vx = p.cx; p.vy = p.cy;
    }
  }
  const e = Math.min(1, dt * 16);
  for (const p of pieces) {
    p.vx += (p.cx - p.vx) * e; p.vy += (p.cy - p.vy) * e;
    p.va += (p.rot * 90 - p.va) * e;
    p.vf += ((p.flip ? -1 : 1) - p.vf) * e;
    if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 4);
  }
  if (hint >= 0) { hintClock += dt; if (hintClock > 3) hint = -1; }
  if (won) wonClock += dt;
}

// --- drawing -----------------------------------------------------------------

function d(p: Poly): string {
  let s = "";
  for (let i = 0; i < p.length; i++) s += (i ? " L " : "M ") + p[i][0].toFixed(1) + " " + p[i][1].toFixed(1);
  return s + " Z";
}

function toPx(p: Poly): Poly { return p.map((v) => [OX + v[0] * K, OY + v[1] * K]); }

function mix(a: number[], b: number[], k: number): string {
  return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * k) + "," + Math.round(a[1] + (b[1] - a[1]) * k) + "," + Math.round(a[2] + (b[2] - a[2]) * k) + ")";
}

function full() { return { position: "absolute", left: 0, top: 0, width: width, height: height }; }

function Shadow() {
  const out: any[] = [];
  const vb = "0 0 " + width + " " + height;
  // the shadow fades away when the figure is done, and the pieces stay
  // (solid, so no seams show where two places meet: the seams would tell the answer)
  const col = won ? mix([61, 64, 91], [250, 240, 222], Math.min(1, wonClock * 1.2)) : "#3d405b";
  for (const s of slots) out.push(<path d={d(toPx(s))} fill={col} stroke={col} strokeWidth="2" viewBox={vb} style={full()} />);
  if (hint >= 0) {
    const on = Math.floor(hintClock * 4) % 2 === 0;
    const c = COLORS[kinds[hint]];
    out.push(<path d={d(toPx(slots[hint]))} fill={on ? c[0] : "rgba(255,255,255,0.25)"} stroke="#ffffff" strokeWidth="3" viewBox={vb} style={full()} />);
  }
  return out;
}

function Pieces() {
  const out: any[] = [];
  const vb = "0 0 " + width + " " + height;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const c = COLORS[p.kind];
    const poly = drawn(p);
    const lifted = i === grab && moved;
    if (lifted) {
      // a soft shadow under a lifted piece
      out.push(<path d={d(poly.map((v) => [v[0] + 5, v[1] + 7]))} fill="rgba(0,0,0,0.25)" viewBox={vb} style={full()} />);
    }
    const wiggle = hint >= 0 && kinds[hint] === p.kind && !onSlot(p);
    out.push(<path d={d(poly)} fill={c[0]} stroke={i === sel || wiggle && Math.floor(hintClock * 4) % 2 === 0 ? "#ffffff" : c[1]} strokeWidth={i === sel ? "4" : "2.5"} viewBox={vb} style={full()} />);
  }
  return out;
}

function Btn(id: string, label: string, on: boolean, fn: () => void) {
  return <div className={"bbtn" + (on ? "" : " off")} id={id} onClick={() => { if (on) fn(); }}>{label}</div>;
}

function Bar() {
  const has = sel >= 0 && !won;
  return (
    <div className="bar" style={{ top: height - BAR, width: width, height: BAR }}>
      {Btn("rotl", "↺", has, () => turn(sel, -1))}
      {Btn("rotr", "↻", has, () => turn(sel, 1))}
      {Btn("flip", "⇋", has, () => mirror(sel))}
      {Btn("hint", "💡", !won, showHint)}
    </div>
  );
}

function WonCard() {
  if (!won || wonClock < 1.2) return null;
  const k = Math.min(1, (wonClock - 1.2) / 0.3);
  const last = lv >= FIGURES.length - 1;
  const f = FIGURES[lv];
  return (
    <div className="wonwrap" style={{ top: height - 190 + (1 - rg.ease.out(k)) * 200, width: width }}>
      <div className="won">
        <div className="wtitle">{f.icon + " " + rg.t(f.fi, f.en, f.es) + "!"}</div>
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
  const f = FIGURES[lv];
  return (
    <div className="screen">
      <div className="wall" style={{ left: wall[0], top: wall[1], width: wall[2], height: wall[3] }} />
      <div className="lamp" style={{ left: wall[0] + wall[2] / 2 - 15, top: wall[1] - 6 }}>💡</div>
      {Shadow()}
      {Pieces()}
      <div className="head" style={{ width: width }}>
        <div className="hbtn" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}>☰</div>
        <div className="htext">
          <div className="hnum">{(lv + 1) + " / " + FIGURES.length}</div>
          <div className="hname">{won ? f.icon + " " + rg.t(f.fi, f.en, f.es) : rg.t("Mikä tästä tulee?", "What will it be?", "¿Qué será?")}</div>
        </div>
      </div>
      {Bar()}
      {WonCard()}
    </div>
  );
}

// a figure's shadow in a menu card
function Mini(i: number, size: number) {
  const f = FIGURES[i];
  const b = bbox(f.polys);
  const k = Math.min(size / (b[2] - b[0]), size / (b[3] - b[1]));
  const ox = (size - (b[2] - b[0]) * k) / 2 - b[0] * k, oy = (size - (b[3] - b[1]) * k) / 2 - b[1] * k;
  const vb = "0 0 " + size + " " + size;
  const ok = done[f.id];
  const out: any[] = [];
  for (let j = 0; j < f.polys.length; j++) {
    const p = f.polys[j];
    const kind = ok ? identify(p) : null;
    const col = kind ? COLORS[kind.kind][0] : "#3d405b";
    out.push(<path d={d(p.map((v) => [ox + v[0] * k, oy + v[1] * k]))} fill={col} stroke={col} strokeWidth="1" viewBox={vb} style={{ position: "absolute", left: 0, top: 0, width: size, height: size }} />);
  }
  return <div style={{ width: size, height: size }}>{out}</div>;
}

function Menu() {
  const cards: any[] = [];
  let next = 0;
  while (next < FIGURES.length && done[FIGURES[next].id]) next++;
  for (let i = 0; i < FIGURES.length; i++) {
    const f = FIGURES[i];
    const isNext = i === next;
    cards.push(
      <div className={"lvl" + (done[f.id] ? " done" : "") + (isNext ? " next" : "")} id={"lvl" + (i + 1)} onClick={() => start(i)}
        style={isNext ? { borderColor: Math.floor(t * 2) % 2 ? "#ffffff" : "#ffd166" } : {}}>
        {Mini(i, 54)}
        <div className="lname">{done[f.id] ? rg.t(f.fi, f.en, f.es) : f.polys.length + " " + rg.t("palaa", "pieces", "piezas")}</div>
      </div>
    );
  }
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Varjopalat", "Shadow Pieces", "Piezas de sombra")}</div>
      <div className="subtitle">{rg.t("Laita palat varjon päälle", "Put the pieces on the shadow", "Pon las piezas sobre la sombra")}</div>
      <div className="grid">{cards}</div>
      <div className="mhelp">{rg.t("Vedä pala varjoon. Napauta: kääntyy. ⇋ peilaa.", "Drag a piece to the shadow. Tap: it turns. ⇋ mirrors.", "Arrastra una pieza a la sombra. Toca: gira. ⇋ refleja.")}</div>
    </div>
  );
}

function view() {
  return mode === "menu" ? Menu() : Play();
}
