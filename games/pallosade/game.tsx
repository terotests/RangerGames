// Pallosade: two players drop white and yellow balls into an 8 × 8 grid.
// Four or more of one colour in a row (across, up or diagonally) blink,
// pop and give their owner points; the balls above fall down, which can
// make a new line (a combo). First to 5 points wins. With a friend on one
// phone, or against the phone. Rules and the phone's moves: lib/rules.ts.
// Before the first round a short intro shows one example board for each
// line direction, with a red pen ring drawn around the winning four.

import { COLS, ROWS, WIN, empty, landRow, findRuns, collapse, points, phoneMove } from "lib/rules";

type Phase = "menu" | "intro" | "aim" | "fall" | "blink" | "over";
type Ball = { id: number; c: number; r: number; y: number; vy: number; p: number; hit: boolean };
type Float = { x: number; y: number; t: number; text: string; p: number };

const CELL = 40, PAD = 8, BALL = 36;
const BW = COLS * CELL + PAD * 2, BH = ROWS * CELL + PAD * 2;
const AIM_Y = 150;                 // the row where the next ball waits
const BT = AIM_Y + CELL + 4;       // the board's top
const GRAV = 70;                   // rows / s²

let phase: Phase = "menu";
let vsPhone = true;
let g: number[] = empty();
let balls: Ball[] = [];
let ids = 0;
let turn = 1;                      // 1 white, 2 yellow
let starts = 1;
let aimCol = 3;
let score = [0, 0, 0];
let runs: { p: number; cells: number[] }[] = [];
let blinkCells: number[] = [];
let blinkClock = 0;
let combo = 0;
let floats: Float[] = [];
let t = 0;
let phoneClock = 0;
let overClock = 0;
let winner = 0;
let toldRules = false;
let introClock = 0;

// intro: one example board per line direction. Cells are [column, row, player]
// (row 0 = bottom); the first four are the winning line, the rest stand around.
type Scene = { fi: string; en: string; es: string; cells: number[][] };
const SCENES: Scene[] = [
  { fi: "Vaakaan", en: "Across", es: "En horizontal",
    cells: [[2, 0, 1], [3, 0, 1], [4, 0, 1], [5, 0, 1], [1, 0, 2], [6, 0, 2], [3, 1, 2], [4, 1, 2], [5, 1, 1]] },
  { fi: "Pystyyn", en: "Up", es: "En vertical",
    cells: [[5, 0, 2], [5, 1, 2], [5, 2, 2], [5, 3, 2], [4, 0, 1], [6, 0, 1], [4, 1, 1], [3, 0, 2], [6, 1, 2]] },
  { fi: "Vinoon ylös", en: "Diagonally up", es: "En diagonal hacia arriba",
    cells: [[1, 0, 1], [2, 1, 1], [3, 2, 1], [4, 3, 1], [2, 0, 2], [3, 0, 2], [3, 1, 1], [4, 0, 1], [4, 1, 2], [4, 2, 2], [5, 0, 2]] },
  { fi: "Vinoon alas", en: "Diagonally down", es: "En diagonal hacia abajo",
    cells: [[2, 3, 2], [3, 2, 2], [4, 1, 2], [5, 0, 2], [2, 0, 1], [2, 1, 2], [2, 2, 1], [3, 0, 1], [3, 1, 1], [4, 0, 1], [6, 0, 1], [1, 0, 2]] },
];
const SCENE_T = 2.8;               // seconds per example board
const POP_T = 0.06;                // one ball appears after another
const PEN_AT = 0.8, PEN_T = 0.7;   // when the pen starts and how long it draws

function boardLeft() { return Math.floor((width - BW) / 2); }
function ballX(c: number) { return boardLeft() + PAD + c * CELL + (CELL - BALL) / 2; }
function ballY(y: number) { return BT + PAD + (ROWS - 1 - y) * CELL + (CELL - BALL) / 2; }
function img(p: number, happy: boolean) { return rg.asset("img/" + (p === 1 ? "w" : "y") + (happy ? "h" : "") + ".png"); }

function who(p: number) {
  if (vsPhone) return p === 1 ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return p === 1 ? rg.t("Valkoinen", "White", "Blanco") : rg.t("Keltainen", "Yellow", "Amarillo");
}

function phoneTurn() { return vsPhone && turn === 2; }

function start(phone: boolean) {
  vsPhone = phone; score = [0, 0, 0]; starts = 1;
  rg.sound("click");
  phase = "intro"; introClock = 0;
  if (!toldRules) { toldRules = true; rg.say("pp_ohje"); }
}

function endIntro() {
  if (phase !== "intro") return;
  rg.sound("click");
  newRound();
}

function newRound() {
  g = empty(); balls = []; floats = []; runs = []; blinkCells = [];
  winner = 0; combo = 0;
  turn = starts; starts = 3 - starts;
  score = [0, 0, 0];
  aimCol = 3; phoneClock = 0;
  phase = "aim";
  const first = vsPhone ? (turn === 1 ? "sinun_vuorosi" : "minun_vuoroni") : (turn === 1 ? "pp_valkoinen_aloittaa" : "pp_keltainen_aloittaa");
  rg.say(first);
}

function drop(c: number) {
  if (phase !== "aim") return;
  const r = landRow(g, c);
  if (r < 0) { rg.sound("wrong"); return; }
  aimCol = c;
  g[c * ROWS + r] = turn;
  balls.push({ id: ++ids, c, r, y: ROWS, vy: 2, p: turn, hit: false });
  rg.sound("whoosh", { pitch: turn === 1 ? 1.2 : 1.5, volume: 0.5 });
  combo = 0;
  phase = "fall";
}

function tap(c: number) {
  if (phase !== "aim" || phoneTurn()) return;
  drop(c);
}

function moveBalls(dt: number): boolean {
  let moving = false;
  for (const b of balls) {
    if (b.y === b.r && b.vy === 0) continue;
    moving = true;
    b.vy += GRAV * dt;
    b.y -= b.vy * dt;
    if (b.y <= b.r) {
      b.y = b.r;
      if (!b.hit) {
        b.hit = true;
        rg.sound("pop", { pitch: b.p === 1 ? 1 : 1.3 });
        rg.vibrate(10);
      }
      b.vy = b.vy > 6 ? -b.vy * 0.28 : 0;
    }
  }
  return moving;
}

function ballAt(i: number): Ball | null {
  const c = Math.floor(i / ROWS), r = i % ROWS;
  for (const b of balls) if (b.c === c && b.r === r) return b;
  return null;
}

// balls have stopped: lines blink, or the turn ends
function settle() {
  runs = findRuns(g);
  if (runs.length) {
    blinkCells = [];
    for (const run of runs) for (const i of run.cells) blinkCells.push(i);
    blinkClock = 0;
    phase = "blink";
    rg.sound("note", { pitch: 1.5 });
    rg.vibrate([30, 30, 30]);
    return;
  }
  if (score[1] >= WIN || score[2] >= WIN) return gameOver(score[1] > score[2] ? 1 : 2);
  let full = true;
  for (let c = 0; c < COLS; c++) if (landRow(g, c) >= 0) full = false;
  if (full) return gameOver(score[1] === score[2] ? 0 : score[1] > score[2] ? 1 : 2);
  turn = 3 - turn;
  phoneClock = 0;
  phase = "aim";
}

function pop() {
  combo++;
  for (const run of runs) {
    const n = points(run) + (combo > 1 ? 1 : 0);
    score[run.p] += n;
    let sx = 0, sy = 0;
    for (const i of run.cells) { sx += ballX(Math.floor(i / ROWS)) + BALL / 2; sy += ballY(i % ROWS) + BALL / 2; }
    sx /= run.cells.length; sy /= run.cells.length;
    floats.push({ x: sx, y: sy, t: 0, text: "+" + n + (combo > 1 ? " COMBO!" : ""), p: run.p });
    rg.celebrate(sx, sy, { count: 16, sound: false });
  }
  rg.sound("coin", { pitch: 1 + combo * 0.15 });
  balls = balls.filter((b) => blinkCells.indexOf(b.c * ROWS + b.r) < 0);
  const moves = collapse(g, runs);
  for (const m of moves) {
    for (const b of balls) if (b.c === m[0] && b.r === m[1]) { b.r = m[2]; b.vy = 0; b.hit = false; break; }
  }
  blinkCells = []; runs = [];
  phase = "fall";
}

function gameOver(p: number) {
  winner = p; phase = "over"; overClock = 0;
  if (p === 0) { rg.sound("wrong"); rg.say("tasapeli"); return; }
  if (vsPhone && p === 2) { rg.sound("lose"); rg.say("puhelin_voitti"); }
  else { rg.celebrate(width / 2, BT + BH / 2, { big: true }); rg.say(vsPhone ? "voitit" : p === 1 ? "pp_valkoinen_voitti" : "pp_keltainen_voitti"); }
}

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  for (const f of floats) f.t += dt;
  floats = floats.filter((f) => f.t < 1.4);
  if (phase === "fall") { if (!moveBalls(dt)) settle(); }
  else if (phase === "blink") { blinkClock += dt; if (blinkClock > 0.9) pop(); }
  else if (phase === "aim" && phoneTurn()) {
    phoneClock += dt;
    if (phoneClock > 0.25 && phoneClock - dt <= 0.25) aimCol = phoneMove(g, 2, rg.random, 0.75);
    if (phoneClock > 0.75) drop(aimCol);
  } else if (phase === "over") overClock += dt;
  else if (phase === "intro") {
    const before = introClock;
    introClock += dt;
    const k = Math.floor(introClock / SCENE_T), at = introClock - k * SCENE_T;
    if (k >= SCENES.length) { newRound(); return; }
    if (at >= PEN_AT && before - k * SCENE_T < PEN_AT) rg.sound("whoosh", { pitch: 0.8, volume: 0.4 });
    if (at >= PEN_AT + PEN_T && before - k * SCENE_T < PEN_AT + PEN_T) rg.sound("note", { pitch: 1.5 });
  }
}

function onBack() {
  if (phase === "menu") rg.exit();
  else if (phase === "intro") endIntro(); else { phase = "menu"; rg.sound("click"); }
}

// a hand-drawn ring around the segment a..b (board coordinates), as an SVG
// path; k (0..1) is how much of it the pen has drawn. It goes a little past
// its start so the ends overlap like a real pen stroke.
function penRing(ax: number, ay: number, bx: number, by: number, k: number): string {
  const R = 24, len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  const ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
  const per = 2 * len + 2 * Math.PI * R, total = per * 1.12, N = 90;
  const n = Math.max(2, Math.floor(N * k));
  let d = "";
  for (let i = 0; i <= n; i++) {
    const s = (i / N) * total, m = s % per;
    const w = 1 + 0.07 * Math.sin(s * 0.045 + 1) + 0.04 * Math.sin(s * 0.11);  // a slightly shaky hand
    const grow = 1 + 0.09 * (s / total);                                          // the overlap passes outside
    let x = 0, y = 0;
    if (m < len) { x = ax + ux * m - nx * R * w * grow; y = ay + uy * m - ny * R * w * grow; }
    else if (m < len + Math.PI * R) {
      const a = (m - len) / R;
      x = bx + (-nx * Math.cos(a) + ux * Math.sin(a)) * R * w * grow;
      y = by + (-ny * Math.cos(a) + uy * Math.sin(a)) * R * w * grow;
    } else if (m < 2 * len + Math.PI * R) {
      const q = m - len - Math.PI * R;
      x = bx - ux * q + nx * R * w * grow; y = by - uy * q + ny * R * w * grow;
    } else {
      const a = (m - 2 * len - Math.PI * R) / R;
      x = ax + (nx * Math.cos(a) - ux * Math.sin(a)) * R * w * grow;
      y = ay + (ny * Math.cos(a) - uy * Math.sin(a)) * R * w * grow;
    }
    d += (i === 0 ? "M " : " L ") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
}

function Intro() {
  const kids = [];
  const L = boardLeft();
  const k = Math.min(SCENES.length - 1, Math.floor(introClock / SCENE_T));
  const at = introClock - k * SCENE_T;
  const sc = SCENES[k];
  kids.push(<div className="ititle" style={{ left: 0, top: 58, width: width }}>{rg.t("Näin saat pisteen!", "This is how you score!", "¡Así se gana un punto!")}</div>);
  const steps = [];
  for (let i = 0; i < SCENES.length; i++) steps.push(<div className={i === k ? "istep ion" : i < k ? "istep idone" : "istep"} />);
  kids.push(<div className="isteps" style={{ left: 0, top: 96, width: width }}>{steps}</div>);
  const done = at >= PEN_AT + PEN_T;
  kids.push(<div className={done ? "status ilabel" : "status sw"} style={{ left: 0, top: 114, width: width }}>{rg.t(sc.fi, sc.en, sc.es)}</div>);
  const holes = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    holes.push(<div className="hole" style={{ left: PAD + c * CELL + 3, top: PAD + (ROWS - 1 - r) * CELL + 3 }} />);
  }
  kids.push(<div className="frame" style={{ left: L, top: BT, width: BW, height: BH }}>{holes}</div>);
  // the balls pop in one by one, the line's own four last
  const order = [];
  for (let i = 4; i < sc.cells.length; i++) order.push(sc.cells[i]);
  for (let i = 0; i < 4; i++) order.push(sc.cells[i]);
  for (let i = 0; i < order.length; i++) {
    const a = at - i * POP_T;
    if (a <= 0) continue;
    const cl = order[i], win = i >= order.length - 4;
    const s = BALL * Math.min(1, 0.4 + a * 6);
    kids.push(<img className="ball" src={img(cl[2], win && done)} style={{ left: ballX(cl[0]) + (BALL - s) / 2, top: ballY(cl[1]) + (BALL - s) / 2, width: s, height: s, opacity: win || !done ? "1" : "0.55" }} />);
  }
  // the red pen ring
  if (at > PEN_AT) {
    const a = sc.cells[0], b = sc.cells[3];
    const cx = (c: number) => L + PAD + c * CELL + CELL / 2;
    const cy = (r: number) => BT + PAD + (ROWS - 1 - r) * CELL + CELL / 2;
    const d = penRing(cx(a[0]), cy(a[1]), cx(b[0]), cy(b[1]), Math.min(1, (at - PEN_AT) / PEN_T));
    const vb = "0 0 " + width + " " + height;
    kids.push(<path d={d} stroke="rgba(120,0,0,0.45)" strokeWidth="7" fill="none" viewBox={vb} style={{ position: "absolute", left: 0, top: 2, width: width, height: height }} />);
    kids.push(<path d={d} stroke="#ff2b2b" strokeWidth="5" fill="none" viewBox={vb} style={{ position: "absolute", left: 0, top: 0, width: width, height: height }} />);
  }
  kids.push(<div className="btn back small" id="skip" style={{ left: (width - 170) / 2, top: BT + BH + 14 }} onClick={() => endIntro()}>{rg.t("Aloita ▶", "Start ▶", "Empezar ▶")}</div>);
  return <div className="screen">{kids}</div>;
}

function ScorePill(p: number) {
  const dots = [];
  for (let k = 0; k < WIN; k++) dots.push(<div className={k < score[p] ? (p === 1 ? "dot dw" : "dot dy") : "dot"} />);
  const on = (phase === "aim" || phase === "fall" || phase === "blink") && turn === p;
  return (
    <div className={on ? (p === 1 ? "pill pon pw" : "pill pon py") : "pill"}>
      <img className="pillball" src={img(p, on)} />
      <div className="pillcol">
        <div className="pname">{who(p)}</div>
        <div className="dots">{dots}</div>
      </div>
      <div className="pscore">{String(score[p])}</div>
    </div>
  );
}

function statusText() {
  if (phase === "over") {
    if (!winner) return rg.t("Tasapeli!", "Draw!", "¡Empate!");
    if (vsPhone) return winner === 1 ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!");
    return rg.t(who(winner) + " voitti! 🎉", who(winner) + " won! 🎉", "¡Ganó " + who(winner) + "! 🎉");
  }
  if (phase === "blink") return rg.t("Neljä suorassa!", "Four in a row!", "¡Cuatro en línea!");
  if (phoneTurn()) return rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono está pensando…");
  return rg.t("Vuoro: ", "Turn: ", "Turno: ") + who(turn);
}

function Game() {
  const kids = [];
  const L = boardLeft();
  kids.push(<div className="top" style={{ left: 0, top: 58, width: width }}>{ScorePill(1)}{ScorePill(2)}</div>);
  kids.push(<div className={phase === "over" ? "status sbig" : turn === 1 ? "status sw" : "status sy"} style={{ left: 0, top: 114, width: width }}>{statusText()}</div>);
  // the board and its holes
  const holes = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    holes.push(<div className="hole" style={{ left: PAD + c * CELL + 3, top: PAD + (ROWS - 1 - r) * CELL + 3 }} />);
  }
  kids.push(<div className="frame" style={{ left: L, top: BT, width: BW, height: BH }}>{holes}</div>);
  // the next ball, waiting above the column
  if (phase === "aim") {
    const bob = Math.sin(t * 4) * 3;
    kids.push(<div className={turn === 1 ? "arrow aw" : "arrow ay"} style={{ left: ballX(aimCol) + BALL / 2 - 7, top: AIM_Y - 16 + bob }} />);
    kids.push(<img className="ball" src={img(turn, false)} style={{ left: ballX(aimCol), top: AIM_Y + (CELL - BALL) / 2 + bob }} />);
  }
  // the balls
  for (const b of balls) {
    const i = b.c * ROWS + b.r;
    const blinking = phase === "blink" && blinkCells.indexOf(i) >= 0;
    if (blinking) {
      const on = Math.floor(blinkClock * 10) % 2 === 0;
      const s = BALL * (1 + 0.18 * Math.sin(blinkClock * 20));
      kids.push(<div className={b.p === 1 ? "glow gw" : "glow gy"} style={{ left: ballX(b.c) - 4, top: ballY(b.y) - 4, opacity: on ? "0.9" : "0.3" }} />);
      kids.push(<img className="ball" src={img(b.p, true)} style={{ left: ballX(b.c) + (BALL - s) / 2, top: ballY(b.y) + (BALL - s) / 2, width: s, height: s, opacity: on ? "1" : "0.45" }} />);
    } else {
      kids.push(<img className="ball" src={img(b.p, false)} style={{ left: ballX(b.c), top: ballY(b.y) }} />);
    }
  }
  for (const f of floats) {
    const k = f.t / 1.4;
    kids.push(<div className={f.p === 1 ? "float fw" : "float fy"} style={{ left: f.x - 70, top: f.y - 50 - k * 50, opacity: String(1 - k * k) }}>{f.text}</div>);
  }
  // tap targets: each column from the waiting row to the bottom
  if (phase === "aim" && !phoneTurn()) {
    for (let c = 0; c < COLS; c++) {
      kids.push(<div className="col" id={"col" + c} style={{ left: L + PAD + c * CELL, top: AIM_Y, height: BT + BH - AIM_Y }} onClick={() => tap(c)} />);
    }
  }
  if (phase === "over" && overClock > 0.8) {
    kids.push(
      <div className="panel" style={{ left: (width - 280) / 2, top: BT + 70 }}>
        <img className="panelball" src={img(winner || 1, true)} />
        <div className="ptitle">{statusText()}</div>
        <div className="btn again" id="again" onClick={() => { rg.sound("click"); newRound(); }}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div>
        <div className="btn back pback" id="menu" onClick={() => { phase = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
      </div>
    );
  }
  if (phase !== "over") {
    kids.push(<div className="btn back small" id="menu" style={{ left: (width - 170) / 2, top: BT + BH + 14 }} onClick={() => { phase = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>);
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const demo = [];
  for (let k = 0; k < 4; k++) {
    const y = Math.sin(t * 3 + k * 0.8) * 8;
    demo.push(<img className="demoball" src={img(k % 2 === 0 ? 1 : 2, Math.floor(t * 1.5) % 4 === k)} style={{ marginTop: 10 + y }} />);
  }
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Pallosade", "Ball Rain", "Lluvia de bolas")}</div>
      <div className="demo">{demo}</div>
      <div className="hint">{rg.t("Neljä samaa suoraan = piste. Ensin 5 pistettä voittaa!", "Four in a row = a point. First to 5 wins!", "Cuatro en línea = un punto. ¡Gana quien llegue a 5!")}</div>
      <div className="btn mbtn" id="vsphone" onClick={() => start(true)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn mbtn alt" id="vsfriend" onClick={() => start(false)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn mbtn back" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() {
  return phase === "menu" ? Menu() : phase === "intro" ? Intro() : Game();
}
