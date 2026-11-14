// Mittaus: measuring, for 5-year-olds. Levels:
//   1 Kumpi pidempi  tap the longer board (last step: the longest of three);
//                    later steps place the boards unevenly, and the hint
//                    slides them to the same starting line
//   2 Palikat        how many blocks long is the board? (answers with dots)
//   3 Viivoitin      drag the pencil to the number that is said, on a ruler
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, rect } from "lib/kit";

const WOODS = ["#d39150", "#e9c46a", "#c97c3d", "#f4a261"];
const BLOCK_C = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#7b2cbf"];

const LEVELS: Level[] = [
  { name: rg.t("Kumpi pidempi", "Which is longer", "¿Cuál es más largo?"), color: "#f77f00", say: "rk_m_pidempi", pic: (x, y, s) => [Box(x - 50 * s, y - 24 * s, 100 * s, 18 * s, WOODS[0], 4), Box(x - 50 * s, y + 6 * s, 64 * s, 18 * s, WOODS[1], 4)] },
  { name: rg.t("Palikat", "Blocks", "Bloques"), color: "#2a9d8f", say: "rk_m_palikat", pic: (x, y, s) => { const o = [Box(x - 50 * s, y - 24 * s, 100 * s, 16 * s, WOODS[0], 4)]; for (let i = 0; i < 5; i++) o.push(Box(x - 50 * s + i * 20 * s, y, 19 * s, 19 * s, BLOCK_C[i], 3)); return o; } },
  { name: rg.t("Viivoitin", "Ruler", "La regla"), color: "#118ab2", say: "rk_m_merkitse", pic: (x, y, s) => Ruler(x - 54 * s, y + 4 * s, 108 * s, 50, 10, false).concat(Pencil(x + 10 * s, y + 2 * s, s * 0.7)) },
];

type Board = { len: number; x: number; y: number; c: string; off: number };
let boards: Board[] = [];
let ans = 0;              // the right board, or the right number
let choices: number[] = [];
let wrong: number[] = [];
let shake = -1, shakeT = -10;
let hintT = -10;
let alignT = -10;         // the boards sliding to the same line
let span = 50;            // the ruler: 0..span cm
let target = 30;
let pen = 0;              // the pencil's place, cm
let grab = false;
let countT = -10;         // the hint counting the blocks

function instruct() {
  if (K.level === 0) rg.say(boards.length > 2 ? "rk_m_pisin" : "rk_m_pidempi");
  else if (K.level === 1) rg.say("rk_m_palikat");
  else rg.say(["rk_m_merkitse", rg.sayId.number(target)]);
}

function next() {
  const s = step();
  wrong = [];
  hintT = -10;
  alignT = -10;
  countT = -10;
  grab = false;
  if (K.level === 0) {
    const n = s === 2 ? 3 : 2;
    const base = 110 + rg.range(0, 40);
    const gaps = [[80, 110], [36, 56], [24, 36]][s];
    const lens: number[] = [];
    for (let i = 0; i < n; i++) lens.push(base + i * rg.range(gaps[0], gaps[1]) / (n > 2 ? 1.4 : 1));
    const sh = rg.shuffle(lens.map((l, i) => i));
    const cols = rg.shuffle(WOODS.slice());
    boards = sh.map((k, j) => ({ len: Math.min(width - 40, lens[k]), x: 20, y: 0, c: cols[j], off: s === 0 ? 0 : rg.range(0, 60) }));
    let m = 0;
    boards.forEach((b, i) => { if (b.len > boards[m].len) m = i; });
    ans = m;
  } else if (K.level === 1) {
    const max = [5, 8, 10][s], min = [2, 3, 4][s];
    ans = rg.range(min, max);
    const others = [ans - 1, ans + 1, ans + 2, ans - 2].filter((v) => v >= 1 && v <= 12);
    choices = rg.shuffle([ans].concat(rg.shuffle(others).slice(0, 2)));
  } else {
    span = s === 0 ? 50 : 100;
    const stepCm = s === 2 ? 5 : 10;
    target = rg.range(1, span / stepCm - 1) * stepCm;
    pen = 0;
  }
  instruct();
}

// ---- level 1: boards ----------------------------------------------------------
function boardY(i: number) { return 180 + i * 90; }
function boardX(b: Board) { const k = Math.min(1, Math.max(0, (K.t - alignT) / 0.6)); return 20 + b.off * (alignT > 0 ? 1 - k : 1); }

function pickBoard(i: number) {
  if (K.solved >= 0 || wrong.indexOf(i) >= 0) return;
  const b = boards[i];
  if (i === ans) { win(boardX(b) + b.len / 2, boardY(i)); return; }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  if (n >= 2 || boards.length === 2) { hintT = K.t; alignT = K.t; rg.say(["kokeile_toista", "rk_m_vihje_pidempi"]); }
  else rg.say("kokeile_toista");
}

// ---- level 2: blocks ------------------------------------------------------------
function unit() { return Math.min(44, Math.floor((width - 40) / [5, 8, 10][step()])); }

function pickNum(i: number) {
  if (K.solved >= 0 || wrong.indexOf(i) >= 0) return;
  if (choices[i] === ans) { win(width / 2, 260, [rg.sayId.number(ans)]); return; }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  if (n >= 2) { hint(); } else rg.say("kokeile_toista");
}

// ---- level 3: the ruler -------------------------------------------------------------
function RX() { return 26; }
function RW() { return width - 52; }
function cmX(cm: number) { return RX() + RW() * cm / span; }
const RY = 300;

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.level !== 2 || K.solved >= 0) return;
  if (Math.abs(x - cmX(pen)) < 50 && y > RY - 120 && y < RY + 80) { grab = true; rg.sound("click"); }
}

function release() {
  if (!grab) return;
  grab = false;
  const tol = [3, 3, 2][step()];
  if (Math.abs(pen - target) <= tol) {
    pen = target;
    win(cmX(pen), RY, [rg.sayId.number(target)]);
    return;
  }
  const n = miss();
  hintT = K.t;
  const say = [pen < target ? "rk_m_pidemmalle" : "rk_m_takaisin"];
  if (n >= 2) say.push("rk_m_vihje_merkitse", rg.sayId.number(target));
  rg.say(say);
}

function onPointerUp() { release(); }

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play") return;
  if (grab && input && input.pointer) {
    if (input.pointer.down) {
      const cm = Math.max(0, Math.min(span, (input.pointer.x - RX()) / RW() * span));
      if (Math.round(cm) !== Math.round(pen) && Math.round(cm) % 5 === 0) rg.sound("tick", { volume: 0.4 });
      pen = cm;
    } else release();
  }
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) { alignT = K.t; rg.say("rk_m_vihje_pidempi"); }
  else if (K.level === 1) {
    countT = K.t;
    const ids = ["rk_m_vihje_palikat"];
    for (let i = 1; i <= ans; i++) ids.push(rg.sayId.number(i));
    rg.say(ids);
  } else rg.say(["rk_m_vihje_merkitse", rg.sayId.number(target)]);
}

function onBack() { grab = false; back(); }

// ---- drawing -----------------------------------------------------------------------
function Plank(x: number, y: number, w: number, h: number, c: string) {
  return [Box(x, y, w, h, c, 5), Line([[x + 8, y + h * 0.35], [x + w * 0.5, y + h * 0.3], [x + w - 8, y + h * 0.4]], "rgba(0,0,0,0.15)", 2), Line([[x + 8, y + h * 0.7], [x + w - 8, y + h * 0.66]], "rgba(0,0,0,0.12)", 2)];
}

function Ruler(x: number, y: number, w: number, sp: number, every: number, big: boolean) {
  const out: any[] = [Box(x, y, w, big ? 56 : 22, "#ffd166", 4)];
  const pts = (cm: number) => x + w * cm / sp;
  for (let cm = 0; cm <= sp; cm++) {
    if (!big && cm % 5) continue;
    const h = cm % 10 === 0 ? (big ? 22 : 10) : cm % 5 === 0 ? (big ? 14 : 6) : (big ? 7 : 0);
    if (h) out.push(Box(pts(cm) - (cm % 10 === 0 ? 1.5 : 0.75), y, cm % 10 === 0 ? 3 : 1.5, h, "#3d405b"));
  }
  if (big) for (let cm = 0; cm <= sp; cm += every) {
    const fs = sp > 50 ? 13 : 17;
    out.push(<div className="label" style={{ left: pts(cm) - 16, top: y + 26, width: 32, fontSize: fs }}>{String(cm)}</div>);
  }
  return out;
}

function Pencil(x: number, y: number, s: number) {
  // a pencil standing with its point at (x, y)
  return [
    Poly([[x, y], [x - 7 * s, y - 16 * s], [x + 7 * s, y - 16 * s]], "#f1c27d"),
    Poly([[x, y], [x - 2.5 * s, y - 6 * s], [x + 2.5 * s, y - 6 * s]], "#343a40"),
    Poly(rect(x - 7 * s, y - 66 * s, 14 * s, 50 * s), "#f77f00", "#b5540a", 1.5),
    Poly(rect(x - 7 * s, y - 76 * s, 14 * s, 10 * s), "#ef476f"),
  ];
}

function Dots(n: number, x: number, y: number) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push(Circle(x - (Math.min(n, 5) - 1) * 6 + (i % 5) * 12, y + Math.floor(i / 5) * 12, 4.5, "#ffffff"));
  return out;
}

function Play() {
  const out: any[] = [];
  const text = K.level === 0 ? (boards.length > 2 ? rg.t("Mikä lauta on pisin?", "Which board is longest?", "¿Cuál es la más larga?") : rg.t("Kumpi lauta on pidempi?", "Which board is longer?", "¿Cuál es más larga?"))
    : K.level === 1 ? rg.t("Montako palikkaa pitkä?", "How many blocks long?", "¿Cuántos bloques mide?")
    : rg.t("Vedä kynä kohtaan ", "Drag the pencil to ", "Lleva el lápiz al ") + target;
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  const hinting = K.t - hintT < 6;
  if (K.level === 0) {
    if (alignT > 0) out.push(Line([[20, 150], [20, boardY(boards.length - 1) + 60]], "#e63946", 3));
    boards.forEach((b, i) => {
      const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
      const x = boardX(b) + sh, y = boardY(i);
      for (const e of Plank(x, y, b.len, 46, b.c)) out.push(e);
      if (alignT > 0 && K.t - alignT > 0.6) out.push(Line([[x + b.len, y - 10], [x + b.len, y + 56]], "rgba(61,64,91,0.4)", 2));
      if (wrong.indexOf(i) >= 0) out.push(Box(x, y, b.len, 46, "rgba(255,255,255,0.55)", 5));
      out.push(<div className="hit" id={"b" + i} onClick={() => pickBoard(i)} style={{ left: x - 10, top: y - 18, width: b.len + 20, height: 82 }} />);
    });
  }
  if (K.level === 1) {
    const u = unit(), x0 = width / 2 - ans * u / 2, y = 200;
    for (const e of Plank(x0, y, ans * u, 40, WOODS[0])) out.push(e);
    const s = step();
    for (let i = 0; i < ans; i++) {
      const lit = countT > 0 && K.t - countT > 1.4 + i * 0.7;
      if (s < 2 || lit || K.solved >= 0) out.push(Box(x0 + i * u + 1, y + 50, u - 2, u - 2, BLOCK_C[i % BLOCK_C.length], 4));
      else out.push(Box(x0 + i * u + 1, y + 50, u - 2, u - 2, "rgba(0,0,0,0.08)", 4));
      if (lit) out.push(<div className="label" style={{ left: x0 + i * u, top: y + 54 + u, width: u }}>{String(i + 1)}</div>);
    }
    if (s === 2 && countT < 0 && K.solved < 0) {
      // only a row of blocks beside it, to compare
      for (let i = 0; i < 12 && 20 + (i + 1) * u <= width - 20; i++) out.push(Box(20 + i * u + 1, y + 130, u - 2, u - 2, BLOCK_C[i % BLOCK_C.length], 4));
    }
    const n = choices.length, bw = 92;
    choices.forEach((v, i) => {
      const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
      const x = width / 2 - (n * (bw + 10) - 10) / 2 + i * (bw + 10) + sh, yy = height - 150;
      const ok = K.solved >= 0 && v === ans;
      out.push(<div className={wrong.indexOf(i) >= 0 ? "card off" : ok ? "card ok" : "card"} style={{ left: x, top: yy, width: bw, height: 110, backgroundColor: ok ? "#06d6a0" : "#6a4c93" }} />);
      out.push(<div className="big" style={{ left: x, top: yy + 10, width: bw, color: "#ffffff" }}>{String(v)}</div>);
      for (const e of Dots(v, x + bw / 2, yy + 66)) out.push(e);
      out.push(<div className="hit" id={"n" + i} onClick={() => pickNum(i)} style={{ left: x, top: yy, width: bw, height: 110 }} />);
    });
  }
  if (K.level === 2) {
    const every = 10;
    for (const e of Plank(RX() - 6, RY - 70, RW() + 12, 50, WOODS[1])) out.push(e);
    for (const e of Ruler(RX(), RY, RW(), span, every, true)) out.push(e);
    if (hinting) {
      const tx = cmX(target);
      out.push(Circle(tx, RY + 38, 18, "rgba(6,214,160,0.45)"));
      out.push(Line([[tx, RY - 80], [tx, RY]], "rgba(6,214,160,0.8)", 3));
    }
    const px = cmX(pen);
    out.push(Line([[px, RY - 20], [px, RY + 4]], "#e63946", 3));
    for (const e of Pencil(px, RY - 20, 1)) out.push(e);
    if (!grab && K.solved < 0 && pen === 0) out.push(PointAt(px + 26, RY - 70, "#f77f00"));
    out.push(<div className="big" style={{ left: width / 2 - 60, top: RY + 110, width: 120 }}>{String(Math.round(pen))}</div>);
    if (K.question === 0 && K.misses === 0) out.push(<div className="label" style={{ left: 20, top: RY + 170, width: width - 40 }}>{rg.t("Vedä kynää sormella", "Drag the pencil", "Arrastra el lápiz")}</div>);
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Mittaus", "Measuring", "Medir"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
