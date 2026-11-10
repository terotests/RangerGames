// Pallosade: two players drop white and yellow balls into an 8 × 8 grid.
// Four or more of one colour in a row (across, up or diagonally) blink,
// pop and give their owner points; the balls above fall down, which can
// make a new line (a combo). First to 5 points wins. With a friend on one
// phone, or against the phone. Rules and the phone's moves: lib/rules.ts.

import { COLS, ROWS, WIN, empty, landRow, findRuns, collapse, points, phoneMove } from "lib/rules";

type Phase = "menu" | "demo" | "aim" | "fall" | "blink" | "over";
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
let demoClock = 0;

// The demo before the game: three quick scenes show a line across, up and
// diagonally. Each scene: [fillers (yellow, already there)], [line cells],
// the line's colour, its label. Cells are [column, row], row 0 at the bottom.
const DEMO_SCENE = 1.9;
const DEMO = [
  { fill: [], line: [[2, 0], [3, 0], [4, 0], [5, 0]], p: 1, label: () => rg.t("Vaakaan ➡️", "Across ➡️", "En horizontal ➡️") },
  { fill: [], line: [[3, 0], [3, 1], [3, 2], [3, 3]], p: 2, label: () => rg.t("Pystyyn ⬆️", "Up ⬆️", "En vertical ⬆️") },
  { fill: [[3, 0], [4, 0], [4, 1], [5, 0], [5, 1], [5, 2]], line: [[2, 0], [3, 1], [4, 2], [5, 3]], p: 1, label: () => rg.t("Vinoon ↗️", "Diagonal ↗️", "En diagonal ↗️") },
];

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
  phase = "demo"; demoClock = 0;
  g = empty(); balls = []; floats = [];
  rg.say("pp_ohje");
  toldRules = true;
}

function endDemo() {
  if (phase !== "demo") return;
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
  rg.say(first, { queue: true });
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
  if (phase === "demo") {
    const before = Math.floor(demoClock / DEMO_SCENE * 2);
    demoClock += dt;
    const now = Math.floor(demoClock / DEMO_SCENE * 2);
    // a chime when each scene's line is complete
    if (now !== before && now % 2 === 1) { rg.sound("note", { pitch: 1.3 + now * 0.1 }); rg.vibrate(15); }
    if (demoClock >= DEMO_SCENE * DEMO.length + 0.3) newRound();
    return;
  }
  if (phase === "fall") { if (!moveBalls(dt)) settle(); }
  else if (phase === "blink") { blinkClock += dt; if (blinkClock > 0.9) pop(); }
  else if (phase === "aim" && phoneTurn()) {
    phoneClock += dt;
    if (phoneClock > 0.25 && phoneClock - dt <= 0.25) aimCol = phoneMove(g, 2, rg.random, 0.75);
    if (phoneClock > 0.75) drop(aimCol);
  } else if (phase === "over") overClock += dt;
}

function onBack() {
  if (phase === "menu") rg.exit(); else { phase = "menu"; rg.sound("click"); }
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
  if (phase === "demo") {
    const k = Math.min(DEMO.length - 1, Math.floor(demoClock / DEMO_SCENE));
    return DEMO[k].label();
  }
  if (phase === "blink") return rg.t("Neljä suorassa!", "Four in a row!", "¡Cuatro en línea!");
  if (phoneTurn()) return rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono está pensando…");
  return rg.t("Vuoro: ", "Turn: ", "Turno: ") + who(turn);
}

// one demo scene: the line's balls drop in one by one, then blink with a
// bar drawn through them in the line's direction
function DemoLayer(kids: any[]) {
  const k = Math.min(DEMO.length - 1, Math.floor(demoClock / DEMO_SCENE));
  const sc = DEMO[k];
  const st = demoClock - k * DEMO_SCENE;
  for (const f of sc.fill) kids.push(<img className="ball" src={img(2, false)} style={{ left: ballX(f[0]), top: ballY(f[1]), opacity: "0.55" }} />);
  const drop = 0.22;
  const done = st > drop * sc.line.length + 0.1;
  const on = Math.floor(st * 10) % 2 === 0;
  for (let i = 0; i < sc.line.length; i++) {
    const c = sc.line[i][0], r = sc.line[i][1];
    const u = (st - i * drop) / drop;
    if (u <= 0) continue;
    const y = u >= 1 ? r : rg.lerp(ROWS, r, u * u);
    if (done) kids.push(<div className={sc.p === 1 ? "glow gw" : "glow gy"} style={{ left: ballX(c) - 4, top: ballY(r) - 4, opacity: on ? "0.9" : "0.35" }} />);
    kids.push(<img className="ball" src={img(sc.p, done)} style={{ left: ballX(c), top: ballY(y) }} />);
  }
  if (done) {
    const a = sc.line[0], b = sc.line[sc.line.length - 1];
    const x0 = ballX(a[0]) + BALL / 2, y0 = ballY(a[1]) + BALL / 2, x1 = ballX(b[0]) + BALL / 2, y1 = ballY(b[1]) + BALL / 2;
    const len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) + BALL;
    const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    const grow = Math.min(1, (st - drop * sc.line.length - 0.1) / 0.25);
    kids.push(<div className="dbar" style={{ left: (x0 + x1) / 2 - len * grow / 2, top: (y0 + y1) / 2 - 5, width: len * grow, transform: "rotate(" + ang + "deg)" }} />);
  }
  // scene dots and the skip button
  const dots = [];
  for (let i = 0; i < DEMO.length; i++) dots.push(<div className={i === k ? "ddot don" : "ddot"} />);
  kids.push(<div className="ddots" style={{ left: 0, top: BT + BH + 6, width: width }}>{dots}</div>);
  kids.push(<div className="col" id="demo" style={{ left: 0, top: AIM_Y, width: width, height: BT + BH - AIM_Y }} onClick={endDemo} />);
  kids.push(<div className="btn back small" id="skip" style={{ left: (width - 170) / 2, top: BT + BH + 28 }} onClick={endDemo}>{rg.t("Pelaamaan ▶", "Play ▶", "Jugar ▶")}</div>);
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
  if (phase === "demo") DemoLayer(kids);
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
  if (phase !== "over" && phase !== "demo") {
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
  return phase === "menu" ? Menu() : Game();
}
