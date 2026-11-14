// Sahat: saws and the circular saw's safety rules, for 5-year-olds. Levels:
//   1 Sahaa       drag the saw back and forth until the board is cut through
//   2 Oikea saha  which saw for the job: hand saw for a board, hacksaw for a
//                 metal pipe, bow saw for a branch, fret saw for a curved shape
//   3 Sirkkeli    a grown-up's machine: pick the safety gear (goggles, ear
//                 defenders, push stick; not a scarf or a teddy), start it,
//                 push the board with the push stick, stop it, and wait for
//                 the blade to stop before taking the piece
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, turn, rect, star, Button } from "lib/kit";

type Saw = "kasi" | "rauta" | "poka" | "lehti";
type Mat = "puu" | "metalli" | "oksa" | "kuvio";
const SAW_OF: any = { puu: "kasi", metalli: "rauta", oksa: "poka", kuvio: "lehti" };
const MATS: Mat[] = ["puu", "metalli", "oksa", "kuvio"];
type Gear = { id: string; icon: string; ok: boolean };
const GEAR: Gear[] = [
  { id: "lasit", icon: "🥽", ok: true }, { id: "korvat", icon: "🎧", ok: true }, { id: "kapula", icon: "", ok: true },
  { id: "huivi", icon: "🧣", ok: false }, { id: "nalle", icon: "🧸", ok: false }, { id: "jaatelo", icon: "🍦", ok: false },
];

const LEVELS: Level[] = [
  { name: rg.t("Sahaa", "Saw it", "Serrar"), color: "#e76f51", say: "rk_s_sahaa", pic: (x, y, s) => [Box(x - 50 * s, y, 100 * s, 26 * s, "#d39150", 4)].concat(SawPic("kasi", x + 10 * s, y - 4 * s, s * 0.45, 0)) },
  { name: rg.t("Oikea saha", "Right saw", "La sierra justa"), color: "#2a9d8f", say: "rk_s_valitse", pic: (x, y, s) => SawPic("rauta", x - 4 * s, y - 14 * s, s * 0.4, 0).concat(SawPic("poka", x, y + 26 * s, s * 0.4, 0)) },
  { name: rg.t("Sirkkeli", "Circular saw", "Sierra circular"), color: "#7b2cbf", say: "rk_s_suojaimet", pic: (x, y, s) => Blade(x, y + 14 * s, 34 * s, K.t * 2).concat([Box(x - 52 * s, y + 14 * s, 104 * s, 30 * s, "#adb5bd", 4)]) },
];

let mat: Mat = "puu";
let choices: Saw[] = [];
let wrong: number[] = [];
let shake = -1, shakeT = -10;
let phase = "saw";        // saws: "pick", "saw", "end"; circular saw: "gear", "start", "push", "stop", "wait", "take", "end"
let cut = 0;              // 0..1 how deep the cut is
let need = 1000;          // px of strokes for a cut
let off = 0;              // the saw's offset in the stroke
let grabX = 0, grab = false, lastX = 0;
let dust: { x: number; y: number; vy: number; t: number }[] = [];
let hintT = -10;
let fallT = -10;
// the circular saw
let gear: Gear[] = [];
let worn: string[] = [];
let spin = 0, speed = 0;  // the blade
let boardX = 0;           // the board's left end on the table
let stopT = -10;
let strokeDir = 0, strokes = 0;

function instruct() {
  if (phase === "pick") rg.say("rk_s_valitse");
  else if (phase === "saw") rg.say(K.level === 0 ? "rk_s_sahaa" : "rk_s_sahaa_nyt");
  else if (phase === "gear") rg.say("rk_s_suojaimet");
  else if (phase === "start") rg.say("rk_s_kaynnista");
  else if (phase === "push") rg.say("rk_s_tyonna");
  else if (phase === "stop") rg.say("rk_s_sammuta");
  else if (phase === "wait") rg.say("rk_s_odota");
  else if (phase === "take") rg.say("rk_s_ota");
}

function next() {
  const s = step();
  wrong = [];
  hintT = -10;
  fallT = -10;
  cut = 0;
  off = 0;
  grab = false;
  dust = [];
  strokes = 0;
  if (K.level === 0) { mat = "puu"; need = [900, 1300, 1700][s]; phase = "saw"; }
  else if (K.level === 1) {
    const n = [2, 3, 4][s];
    mat = rg.pick(MATS);
    const others = rg.shuffle(MATS.filter((m) => m !== mat)).slice(0, n - 1);
    choices = rg.shuffle([mat].concat(others)).map((m) => SAW_OF[m]);
    need = 700;
    phase = "pick";
  } else {
    const ok = GEAR.filter((g) => g.ok), bad = rg.shuffle(GEAR.filter((g) => !g.ok));
    const useOk = s === 0 ? ok.slice(0, 2) : ok;
    gear = rg.shuffle(useOk.concat(bad.slice(0, s === 2 ? 3 : 2)));
    worn = [];
    speed = 0;
    boardX = 50;
    phase = "gear";
  }
  instruct();
}

// ---- sawing by hand ------------------------------------------------------------
function TY() { return Math.round(height * 0.5); }

function pickSaw(i: number) {
  if (phase !== "pick" || wrong.indexOf(i) >= 0) return;
  if (choices[i] === SAW_OF[mat]) { phase = "saw"; rg.sound("pop"); rg.say(["rk_s_sopii", "rk_s_sahaa_nyt"]); return; }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  if (n >= 2) { hintT = K.t; rg.say(["rk_s_ei_sovi", "rk_s_vihje_" + mat]); } else rg.say("rk_s_ei_sovi");
}

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.solved >= 0 || y < 120) return;
  if (phase === "saw") { grab = true; grabX = x - off; lastX = x; }
  if (phase === "push") {
    const sx = boardX - 30;
    if (Math.abs(x - sx) < 60 && Math.abs(y - (TY() - 30)) < 70) { grab = true; grabX = x - boardX; }
  }
}

function sawMove(x: number) {
  const dx = x - lastX;
  lastX = x;
  off = Math.max(-70, Math.min(70, x - grabX));
  if (Math.abs(dx) > 40) return;
  const d = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  if (d && d !== strokeDir) { strokeDir = d; strokes++; rg.sound("whoosh", { volume: 0.25, pitch: d > 0 ? 1.1 : 0.9 }); }
  cut = Math.min(1, cut + Math.abs(dx) / need);
  if (Math.abs(dx) > 2 && rg.random() < 0.5) dust.push({ x: width / 2 + (rg.random() - 0.5) * 10, y: TY() + cut * 40, vy: 30 + rg.random() * 60, t: 0 });
  if (cut >= 1) { grab = false; phase = "end"; fallT = K.t; rg.sound("hit"); win(width / 2, TY(), ["rk_s_poikki"]); }
}

// ---- the circular saw ------------------------------------------------------------
function bw() { return 120; }
function bladeX() { return width * 0.55; }

function pickGear(i: number) {
  if (phase !== "gear" || wrong.indexOf(i) >= 0 || worn.indexOf(gear[i].id) >= 0) return;
  const g = gear[i];
  if (g.ok) {
    worn.push(g.id);
    rg.sound("pop");
    rg.say("rk_s_g_" + g.id);
    if (gear.filter((q) => q.ok).every((q) => worn.indexOf(q.id) >= 0)) { phase = "start"; rg.say(["rk_s_g_" + g.id, "rk_s_kaynnista"]); }
    return;
  }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  const why = g.id === "huivi" ? "rk_s_huivi" : "rk_s_ei_tarvita";
  if (n >= 2) { hintT = K.t; rg.say([why, "rk_s_vihje_suojaimet"]); } else rg.say(why);
}

function pressStart() {
  if (phase !== "start") return;
  phase = "push";
  rg.sound("click");
  rg.say("rk_s_tyonna");
}

function pressStop() {
  if (phase !== "stop") return;
  phase = "wait";
  stopT = K.t;
  rg.sound("click");
  rg.say("rk_s_odota");
}

function takePiece() {
  if (phase === "wait") {
    const n = miss();
    hintT = K.t;
    rg.say(n >= 2 ? ["rk_s_odota", "rk_s_vihje_odota"] : "rk_s_odota");
    return;
  }
  if (phase === "take") { phase = "end"; fallT = K.t; win(bladeX() + 50, TY() - 20, ["rk_s_valmis"]); }
}

function tick(dt: number, input: any) {
  update(dt);
  for (const d of dust) { d.t += dt; d.y += d.vy * dt; d.vy += 300 * dt; }
  dust = dust.filter((d) => d.t < 1);
  if (K.mode !== "play") return;
  if (K.level === 2) {
    const want = phase === "push" || phase === "stop" ? 14 : 0;
    if (phase === "wait") speed = Math.max(0, 14 * (1 - (K.t - stopT) / 2.6));
    else speed += (want - speed) * Math.min(1, dt * 3);
    spin += speed * dt;
    if (phase === "wait" && speed <= 0.01) { phase = "take"; rg.say("rk_s_ota"); }
    if (speed > 1 && rg.random() < 0.3) rg.sound("tick", { volume: 0.15, pitch: 2 });
  }
  if (grab && input && input.pointer) {
    if (!input.pointer.down) { grab = false; return; }
    if (phase === "saw") sawMove(input.pointer.x);
    if (phase === "push") {
      boardX = Math.max(boardX, Math.min(width - bw() - 20, input.pointer.x - grabX));
      if (boardX + 10 > bladeX() && rg.random() < 0.6) dust.push({ x: bladeX() - 20, y: TY() - 4, vy: -40 - rg.random() * 60, t: 0 });
      if (boardX > bladeX() - 30) { boardX = bladeX() - 30; }
      if (boardX >= bladeX() - 30) { grab = false; phase = "stop"; rg.say("rk_s_sammuta"); }
    }
  }
}

function onPointerUp() { grab = false; }

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (phase === "pick") rg.say("rk_s_vihje_" + mat);
  else if (phase === "saw") rg.say("rk_s_vihje_sahaa");
  else if (phase === "gear") rg.say("rk_s_vihje_suojaimet");
  else if (phase === "wait") rg.say("rk_s_vihje_odota");
  else instruct();
}

function onBack() { grab = false; back(); }

// ---- drawing ----------------------------------------------------------------------
function teeth(x0: number, x1: number, y: number, n: number, h: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; out.push([x, y]); if (i < n) out.push([x + (x1 - x0) / n / 2, y + h]); }
  return out;
}

// a saw, its blade's middle at (x, y), lying flat, scale s
function SawPic(k: Saw, x: number, y: number, s: number, a: number) {
  const T = (pts: number[][]) => turn(pts, x, y, a);
  const out: any[] = [];
  if (k === "kasi") {
    out.push(Poly(T([[x - 110 * s, y - 6 * s], [x + 60 * s, y - 34 * s], [x + 60 * s, y + 4 * s]].concat(teeth(x + 60 * s, x - 110 * s, y + 4 * s, 18, 7 * s).slice(1))), "#ced4da", "#6c757d", 1.5));
    out.push(Poly(T([[x + 56 * s, y - 40 * s], [x + 110 * s, y - 44 * s], [x + 116 * s, y + 10 * s], [x + 56 * s, y + 10 * s]]), "#8d5524", "#5c3a17", 2));
    out.push(Poly(T(rect(x + 74 * s, y - 26 * s, 26 * s, 22 * s)), "#fff3d6"));
  } else if (k === "rauta") {
    out.push(Poly(T([[x - 90 * s, y], [x - 90 * s, y - 50 * s], [x + 80 * s, y - 50 * s], [x + 80 * s, y], [x + 70 * s, y], [x + 70 * s, y - 40 * s], [x - 80 * s, y - 40 * s], [x - 80 * s, y]]), "#118ab2", "#073b4c", 1.5));
    out.push(Poly(T(teeth(x - 88 * s, x + 78 * s, y, 30, 3 * s).concat([[x + 78 * s, y - 5 * s], [x - 88 * s, y - 5 * s]])), "#adb5bd"));
    out.push(Poly(T(rect(x + 80 * s, y - 14 * s, 40 * s, 22 * s)), "#073b4c"));
  } else if (k === "poka") {
    const arc: number[][] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, ang = Math.PI * t; arc.push([x - 100 * s * Math.cos(ang), y - 60 * s * Math.sin(ang)]); }
    const inner = arc.map((p) => [x + (p[0] - x) * 0.9, y + (p[1] - y) * 0.82]).reverse();
    out.push(Poly(T(arc.concat(inner)), "#f77f00", "#b5540a", 1.5));
    out.push(Poly(T(teeth(x - 96 * s, x + 96 * s, y, 22, 5 * s).concat([[x + 96 * s, y - 5 * s], [x - 96 * s, y - 5 * s]])), "#adb5bd"));
  } else {
    out.push(Poly(T([[x - 70 * s, y], [x - 70 * s, y - 80 * s], [x + 70 * s, y - 80 * s], [x + 70 * s, y], [x + 62 * s, y], [x + 62 * s, y - 72 * s], [x - 62 * s, y - 72 * s], [x - 62 * s, y]]), "#e63946", "#9d0208", 1.5));
    out.push(Line(T([[x - 66 * s, y - 2 * s], [x + 66 * s, y - 2 * s]]), "#495057", 2));
    out.push(Poly(T(rect(x + 66 * s, y - 10 * s, 14 * s, 50 * s)), "#8d5524"));
  }
  return out;
}

function Material(m: Mat, x0: number, x1: number, y: number, cutAt: number, depth: number, fall: number) {
  const out: any[] = [];
  const h = m === "metalli" ? 30 : m === "oksa" ? 34 : m === "kuvio" ? 14 : 44;
  const c = m === "metalli" ? "#adb5bd" : m === "oksa" ? "#8d5524" : m === "kuvio" ? "#f4d58d" : "#d39150";
  const piece = (a: number, b: number, dy: number, rot: number) => {
    const pts = turn(rect(a, y + dy, b - a, h), a, y + dy, rot);
    out.push(Poly(pts, c, "rgba(0,0,0,0.25)", 1.5));
    if (m === "metalli") out.push(Poly(turn(rect(a, y + dy + 6, b - a, 6), a, y + dy, rot), "#e9ecef"));
    if (m === "oksa") out.push(Poly(turn(rect(a, y + dy + 10, b - a, 4), a, y + dy, rot), "#5c3a17"));
  };
  if (fall > 0) { piece(x0, cutAt, 0, 0); piece(cutAt + 3, x1, fall * 120, fall * 0.4); }
  else piece(x0, x1, 0, 0);
  if (m === "kuvio") {
    // the curved line to follow
    const pts: number[][] = [];
    for (let i = 0; i <= 12; i++) pts.push([cutAt + Math.sin(i / 12 * Math.PI * 2) * 6, y - 40 + i * 6]);
  }
  if (fall <= 0) {
    out.push(Line([[cutAt, y - 6], [cutAt, y + h + 6]], "#3d405b", 2));
    if (depth > 0) out.push(Box(cutAt - 2, y, 4, h * depth, "#3d2b1f"));
  }
  return { out, h };
}

function Trestles(y: number) {
  return [Poly([[40, y + 80], [60, y], [80, y], [100, y + 80]], "#6c757d"), Poly([[width - 100, y + 80], [width - 80, y], [width - 60, y], [width - 40, y + 80]], "#6c757d"), Box(0, y + 80, width, height - y - 80, "#8d99ae")];
}

function Cards() {
  const n = choices.length, cw = Math.min(150, (width - 30) / Math.min(n, 2) - 10), ch = 70;
  const out: any[] = [];
  choices.forEach((k, i) => {
    const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
    const col = i % 2, row = Math.floor(i / 2);
    const rowN = Math.min(2, n - row * 2);
    const x = width / 2 - (rowN * (cw + 10) - 10) / 2 + col * (cw + 10) + sh, y = height - 175 + row * (ch + 10);
    out.push(<div className={wrong.indexOf(i) >= 0 ? "card off" : "card"} style={{ left: x, top: y, width: cw, height: ch }} />);
    for (const e of SawPic(k, x + cw / 2 - 8, y + ch / 2 + 14, 0.5, 0)) out.push(e);
    out.push(<div className="hit" id={"saw" + i} onClick={() => pickSaw(i)} style={{ left: x, top: y, width: cw, height: ch }} />);
  });
  return out;
}

function Blade(cx: number, cy: number, r: number, a: number) {
  return [Poly(star(cx, cy, r, r * 0.86, 18, a), "#ced4da", "#6c757d", 1.5), Circle(cx, cy, r * 0.3, "#495057")];
}

function HandSaw() {
  const out: any[] = [];
  const ty = TY();
  for (const e of Trestles(ty + 20)) out.push(e);
  const f = phase === "end" ? Math.min(1, (K.t - fallT) / 0.6) : 0;
  const m = Material(mat, 20, width - 20, ty, width / 2, cut, f);
  for (const e of m.out) out.push(e);
  if (phase === "saw" || (phase === "end" && f < 0.3)) {
    const k = mat === "puu" ? "kasi" : SAW_OF[mat];
    for (const e of SawPic(k, width / 2 + off - 20, ty + m.h * cut - 2, 0.9, 0)) out.push(e);
  }
  for (const d of dust) out.push(Box(d.x, d.y, 4, 4, "#e9c46a", 1));
  if (phase === "saw") {
    out.push(Box(40, height - 34, width - 80, 14, "rgba(0,0,0,0.12)", 7));
    out.push(Box(40, height - 34, Math.max(14, (width - 80) * cut), 14, "#06d6a0", 7));
    if (cut === 0 || K.t - hintT < 5) {
      const bx = width / 2 + Math.sin(K.t * 3) * 60;
      out.push(PointAt(bx, ty + 140, "#f77f00"));
      out.push(<div className="label" style={{ left: 20, top: ty + 150, width: width - 40 }}>{rg.t("↔ Vedä edestakaisin", "↔ Drag back and forth", "↔ Arrastra adelante y atrás")}</div>);
    }
  }
  return out;
}

function TableSaw() {
  const out: any[] = [];
  const ty = TY(), bx = bladeX();
  // the worn gear on the grown-up's list at the top
  if (phase === "gear") {
    const n = gear.length, cw = 96, ch = 86;
    gear.forEach((g, i) => {
      const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
      const col = i % 3, row = Math.floor(i / 3);
      const x = width / 2 - (3 * (cw + 10) - 10) / 2 + col * (cw + 10) + sh, y = 140 + row * (ch + 12);
      const on = worn.indexOf(g.id) >= 0;
      out.push(<div className={wrong.indexOf(i) >= 0 ? "card off" : on ? "card ok" : "card"} style={{ left: x, top: y, width: cw, height: ch }} />);
      if (g.icon) out.push(<div className="big" style={{ left: x, top: y + 18, width: cw, fontSize: 40 }}>{g.icon}</div>);
      else for (const e of Stick(x + 20, y + 40, 0.5)) out.push(e);
      if (on) out.push(<div className="label" style={{ left: x + cw - 30, top: y + 4, width: 26, color: "#06a77d" }}>✓</div>);
      out.push(<div className="hit" id={"g" + i} onClick={() => pickGear(i)} style={{ left: x, top: y, width: cw, height: ch }} />);
    });
    if (K.t - hintT < 5 || step() === 0) {
      const left = gear.findIndex((g) => g.ok && worn.indexOf(g.id) < 0);
      if (left >= 0) { const col = left % 3, row = Math.floor(left / 3); out.push(PointAt(width / 2 - 158 + col * 106 + 48, 140 + row * 98 + 6, "#f77f00")); }
    }
  } else {
    // what is worn
    const ws = worn.map((id) => GEAR.filter((g) => g.id === id)[0]);
    ws.forEach((g, i) => { if (g.icon) out.push(<div className="big" style={{ left: 20 + i * 52, top: 126, width: 50, fontSize: 32 }}>{g.icon}</div>); });
  }
  // the table and the blade
  for (const e of Blade(bx, ty + 10, 46, spin)) out.push(e);
  out.push(Box(0, ty + 10, width, 26, "#adb5bd"));
  out.push(Box(0, ty + 36, width, height - ty - 36, "#6c757d"));
  out.push(Poly([[bx - 50, ty - 40], [bx + 50, ty - 40], [bx + 50, ty - 30], [bx - 50, ty - 30]], "rgba(255,209,102,0.85)"));   // the blade guard
  if (phase !== "gear") {
    const f = phase === "end" ? Math.min(1, (K.t - fallT) / 0.5) : 0;
    const cutDone = phase !== "push" && phase !== "start";
    if (cutDone) {
      out.push(Box(boardX, ty - 20, bx - boardX - 2, 30, "#d39150", 3));
      out.push(Box(bx + 2 + f * 60, ty - 20 - f * 80, boardX + bw() - bx - 2, 30, "#d39150", 3));
      if (phase === "take" || phase === "wait") out.push(<div className="hit" id="piece" onClick={() => takePiece()} style={{ left: bx, top: ty - 60, width: boardX + bw() - bx + 20, height: 90 }} />);
      if (phase === "take") out.push(PointAt(bx + 40, ty - 26, "#06d6a0"));
    } else {
      out.push(Box(boardX, ty - 20, bw(), 30, "#d39150", 3));
      for (const e of Stick(boardX - 4, ty - 26, 1, true)) out.push(e);
      if (phase === "push" && !grab) out.push(PointAt(boardX - 40, ty - 60, "#f77f00"));
    }
    for (const d of dust) out.push(Box(d.x, d.y, 4, 4, "#e9c46a", 1));
    const startOn = phase === "start", stopOn = phase === "stop";
    out.push(<div className="btn" id="go" onClick={() => pressStart()} style={{ left: 30, top: height - 96, width: 130, backgroundColor: startOn ? "#06d6a0" : "#9be3c8" }}><div className="btext">▶</div></div>);
    out.push(<div className="btn" id="stop" onClick={() => pressStop()} style={{ left: width - 160, top: height - 96, width: 130, backgroundColor: stopOn ? "#e63946" : "#f2a7ad" }}><div className="btext">■</div></div>);
    if (startOn) out.push(PointAt(95, height - 100, "#06d6a0"));
    if (stopOn) out.push(PointAt(width - 95, height - 100, "#e63946"));
    if (phase === "wait") out.push(<div className="label" style={{ left: 20, top: ty + 60, width: width - 40, color: "#ffffff", fontSize: 22 }}>{rg.t("Odota… terä pyörii", "Wait… the blade is turning", "Espera… la hoja gira")}</div>);
  }
  return out;
}

// the push stick, its notch at (x, y)
function Stick(x: number, y: number, s: number, flip?: boolean) {
  const pts = [[x, y], [x + 14 * s, y], [x + 14 * s, y + 10 * s], [x + 100 * s, y - 50 * s], [x + 112 * s, y - 38 * s], [x + 20 * s, y + 26 * s], [x, y + 26 * s]];
  return [Poly(flip ? pts.map((q) => [2 * x - q[0], q[1]]) : pts, "#ffd166", "#b5540a", 2)];
}

function Play() {
  const out: any[] = [];
  const text = phase === "pick" ? rg.t("Millä sahalla?", "Which saw?", "¿Qué sierra?")
    : phase === "saw" || (phase === "end" && K.level < 2) ? rg.t("Sahaa poikki", "Saw it through", "Córtalo")
    : phase === "gear" ? rg.t("Valitse suojavarusteet", "Pick the safety gear", "Elige la protección")
    : phase === "start" ? rg.t("Käynnistä ▶", "Start ▶", "Arranca ▶")
    : phase === "push" ? rg.t("Työnnä työntökapulalla", "Push with the push stick", "Empuja con el empujador")
    : phase === "stop" ? rg.t("Sammuta ■", "Stop ■", "Para ■")
    : phase === "wait" ? rg.t("Odota, että terä pysähtyy", "Wait for the blade to stop", "Espera a que pare")
    : rg.t("Ota pala", "Take the piece", "Coge la pieza");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  if (K.level === 2) for (const e of TableSaw()) out.push(e);
  else {
    for (const e of HandSaw()) out.push(e);
    if (phase === "pick") for (const e of Cards()) out.push(e);
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Sahat", "Saws", "Sierras"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
