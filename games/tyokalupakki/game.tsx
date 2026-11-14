// Työkalupakki: the toolbox, for 5-year-olds. Levels:
//   1 Mikä työkalu?  a job is shown and said (a nail sticking up, a nut, a
//                    board to cut…): tap the tool for it in the open toolbox
//   2 Etsi työkalu   a tool's name is said: find it (learning the names)
//   3 Siivoa pakki   put the tools back in the box, each on its shadow
// The toolbox holds more tools at the higher steps (3, 5, 8).
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, turn, rect, ngon } from "lib/kit";

const TOOLS = ["vasara", "risti", "taltta", "avain", "saha", "pihdit", "puristin", "mitta", "vatupassi", "pora"];
// a job and the tool it needs
const JOBS = [
  { id: "naula", tool: "vasara" }, { id: "risti", tool: "risti" }, { id: "ura", tool: "taltta" }, { id: "mutteri", tool: "avain" },
  { id: "poikki", tool: "saha" }, { id: "lanka", tool: "pihdit" }, { id: "liima", tool: "puristin" }, { id: "mittaa", tool: "mitta" },
  { id: "hylly", tool: "vatupassi" }, { id: "reika", tool: "pora" },
];
const TRAY = "#ffe8c2";

const LEVELS: Level[] = [
  { name: rg.t("Mikä työkalu?", "Which tool?", "¿Qué herramienta?"), color: "#e63946", say: "rk_k_mika", pic: (x, y, s) => ToolPic("vasara", x - 6 * s, y - 14 * s, s * 0.7, false).concat(ToolPic("avain", x, y + 22 * s, s * 0.6, false)) },
  { name: rg.t("Etsi työkalu", "Find the tool", "Busca"), color: "#2a9d8f", say: "rk_k_etsi", pic: (x, y, s) => ToolPic("pihdit", x, y, s * 0.75, false) },
  { name: rg.t("Siivoa pakki", "Tidy the box", "Ordena la caja"), color: "#118ab2", say: "rk_k_siivoa", pic: (x, y, s) => ToolPic("saha", x, y - 12 * s, s * 0.6, true).concat(ToolPic("saha", x + 6 * s, y + 6 * s, s * 0.6, false)) },
];

let job = JOBS[0];
let want = "vasara";
let box: string[] = [];          // the tools in the box, slot by slot
let wrong: number[] = [];
let shake = -1, shakeT = -10;
let hintT = -10;
// tidying
type Loose = { tool: string; x: number; y: number; ox: number; oy: number; home: number; done: boolean };
let loose: Loose[] = [];
let grab = -1;

function rowH() { return Math.min(80, Math.floor((height - 330) / Math.max(2, Math.ceil(box.length / 2)))); }
function boxTop() { return height - 40 - Math.ceil(box.length / 2) * rowH() - 36; }
function slot(i: number) {
  const cols = 2, w = (width - 48) / cols, h = rowH();
  return { x: 24 + (i % cols) * w + w / 2, y: boxTop() + 36 + Math.floor(i / cols) * h + h / 2, w, h };
}

function instruct() {
  if (K.level === 0) rg.say(["rk_k_job_" + job.id, "rk_k_mika"]);
  else if (K.level === 1) rg.say(["rk_k_etsi", "rk_k_n_" + want]);
  else rg.say("rk_k_siivoa");
}

function next() {
  const s = step();
  wrong = [];
  hintT = -10;
  grab = -1;
  const n = [3, 5, 8][s];
  if (K.level === 0) {
    const old = job.id;
    job = rg.pick(JOBS);
    if (job.id === old) job = rg.pick(JOBS);
    want = job.tool;
  } else {
    const old = want;
    want = rg.pick(TOOLS);
    if (want === old) want = rg.pick(TOOLS);
  }
  let others = rg.shuffle(TOOLS.filter((t) => t !== want));
  // the two screwdrivers look alike: on the first step not both
  if (s === 0 && (want === "risti" || want === "taltta")) others = others.filter((t) => t !== "risti" && t !== "taltta");
  box = rg.shuffle([want].concat(others.slice(0, (K.level === 2 ? [3, 4, 6][s] : n) - 1)));
  if (K.level === 2) {
    const order = rg.shuffle(box.map((t, i) => i)), rows = Math.ceil(box.length / 2), gap = Math.max(50, (boxTop() - 60 - 150) / Math.max(1, rows - 1 || 1));
    loose = box.map((tool, i) => { const j = order[i], x = width * (0.27 + 0.46 * (j % 2)), y = 150 + Math.floor(j / 2) * Math.min(gap, 70); return { tool, x, y, ox: x, oy: y, home: i, done: false }; });
  }
  instruct();
}

function pick(i: number) {
  if (K.level === 2 || K.solved >= 0 || wrong.indexOf(i) >= 0) return;
  const t = box[i];
  if (t === want) { const p = slot(i); win(p.x, p.y, ["rk_k_n_" + t]); return; }
  wrong.push(i);
  shake = i; shakeT = K.t;
  const n = miss();
  const say = ["rk_k_tama_on", "rk_k_n_" + t];
  if (n >= 2) { hintT = K.t; say.push(K.level === 0 ? "rk_k_vihje_" + job.id : "rk_k_etsi", K.level === 0 ? "" : "rk_k_n_" + want); }
  rg.say(say);
}

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.level !== 2 || K.solved >= 0) return;
  for (let i = loose.length - 1; i >= 0; i--) {
    const l = loose[i];
    if (!l.done && Math.abs(x - l.x) < 60 && Math.abs(y - l.y) < 34) { grab = i; rg.sound("click"); return; }
  }
}

function drop() {
  if (grab < 0) return;
  const l = loose[grab];
  grab = -1;
  // the slot it was dropped on
  let at = -1;
  for (let i = 0; i < box.length; i++) { const p = slot(i); if (Math.abs(l.x - p.x) < p.w / 2 && Math.abs(l.y - p.y) < p.h / 2 + 6) at = i; }
  if (at < 0) { l.x = l.ox; l.y = l.oy; return; }
  if (box[at] === l.tool && !loose.some((q) => q.done && q.home === at)) {
    l.done = true;
    const p = slot(at);
    l.x = p.x; l.y = p.y;
    rg.sound("pop");
    if (loose.every((q) => q.done)) win(width / 2, boxTop() + 60, ["rk_k_valmis"]);
    else rg.say("rk_k_n_" + l.tool);
    return;
  }
  const n = miss();
  hintT = K.t;
  l.x = l.ox; l.y = l.oy;
  rg.say(n >= 2 ? ["rk_k_ei_mahdu", "rk_k_vihje_siivoa"] : "rk_k_ei_mahdu");
}

function onPointerUp() { drop(); }

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play" || grab < 0) return;
  const p = input && input.pointer;
  if (p && p.down) { loose[grab].x = p.x; loose[grab].y = p.y; } else drop();
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) rg.say("rk_k_vihje_" + job.id);
  else if (K.level === 1) rg.say(["rk_k_etsi", "rk_k_n_" + want]);
  else rg.say("rk_k_vihje_siivoa");
}

function onBack() { grab = -1; back(); }

// ---- the tools, drawn about (x, y), about 120 × 50 at scale 1 ----------------------
function ToolPic(t: string, x: number, y: number, s: number, shadow: boolean) {
  const out: any[] = [];
  const C = (c: string) => shadow ? "rgba(61,64,91,0.22)" : c;
  const P = (pts: number[][], c: string, e?: string) => out.push(shadow ? Poly(pts, C(c)) : e ? Poly(pts, c, e, 1.5) : Poly(pts, c));
  const R = (x0: number, y0: number, w: number, h: number) => rect(x + x0 * s, y + y0 * s, w * s, h * s);
  const B = (x0: number, y0: number, w: number, h: number, c: string, r: number) => out.push(Box(x + x0 * s, y + y0 * s, w * s, h * s, C(c), r * s));
  if (t === "vasara") {
    P(R(-40, -5, 96, 10), "#8d5524", "#5c3a17");
    B(10, -7, 46, 14, "#ffd166", 6);
    P([[x - 52 * s, y - 22 * s], [x - 30 * s, y - 22 * s], [x - 30 * s, y + 18 * s], [x - 52 * s, y + 18 * s]], "#6c757d", "#343a40");
    P([[x - 52 * s, y - 22 * s], [x - 62 * s, y - 30 * s], [x - 58 * s, y - 18 * s]], "#6c757d");
  } else if (t === "risti" || t === "taltta") {
    const c = t === "risti" ? "#f4a100" : "#e63946";
    if (t === "risti") P([[x - 58 * s, y], [x - 48 * s, y - 4 * s], [x - 48 * s, y + 4 * s]], "#5c636a");
    else P([[x - 58 * s, y - 6 * s], [x - 48 * s, y - 3 * s], [x - 48 * s, y + 3 * s], [x - 58 * s, y + 6 * s]], "#5c636a");
    P(R(-48, -3, 46, 6), "#adb5bd");
    P([[x - 2 * s, y - 12 * s], [x + 18 * s, y - 15 * s], [x + 34 * s, y - 10 * s], [x + 56 * s, y - 14 * s], [x + 60 * s, y], [x + 56 * s, y + 14 * s], [x + 34 * s, y + 10 * s], [x + 18 * s, y + 15 * s], [x - 2 * s, y + 12 * s]], "#2b2d42");
    B(20, -5, 30, 10, c, 5);
  } else if (t === "avain") {
    P(R(-40, -6, 80, 12), "#ced4da", "#6c757d");
    for (const sx of [-1, 1]) {
      const cx = x + sx * 46 * s;
      out.push(shadow ? Poly(ngon(cx, y, 18 * s, 16, 0), C("#000")) : Poly(ngon(cx, y, 18 * s, 16, 0), "#ced4da", "#6c757d", 1.5));
      if (!shadow) out.push(Poly(rect(cx + (sx > 0 ? -2 : -20) * s, y - 8 * s, 22 * s, 16 * s), TRAY));
    }
  } else if (t === "saha") {
    P([[x - 60 * s, y - 2 * s], [x + 20 * s, y - 20 * s], [x + 20 * s, y + 12 * s], [x - 60 * s, y + 8 * s]], "#ced4da", "#6c757d");
    P([[x + 18 * s, y - 24 * s], [x + 58 * s, y - 26 * s], [x + 60 * s, y + 16 * s], [x + 18 * s, y + 16 * s]], "#e63946", "#9d0208");
    if (!shadow) out.push(Poly(R(28, -14, 20, 18), TRAY));
  } else if (t === "pihdit") {
    P([[x - 56 * s, y - 4 * s], [x - 20 * s, y - 8 * s], [x - 10 * s, y], [x - 20 * s, y + 8 * s], [x - 56 * s, y + 4 * s]], "#6c757d", "#343a40");
    P([[x - 10 * s, y - 4 * s], [x + 56 * s, y - 20 * s], [x + 58 * s, y - 12 * s], [x - 6 * s, y + 2 * s]], "#e63946", "#9d0208");
    P([[x - 10 * s, y + 4 * s], [x + 56 * s, y + 20 * s], [x + 58 * s, y + 12 * s], [x - 6 * s, y - 2 * s]], "#d62828", "#9d0208");
    if (!shadow) out.push(Circle(x - 10 * s, y, 4 * s, "#343a40"));
  } else if (t === "puristin") {
    P([[x - 40 * s, y - 24 * s], [x + 30 * s, y - 24 * s], [x + 30 * s, y + 24 * s], [x + 8 * s, y + 24 * s], [x + 8 * s, y + 12 * s], [x + 18 * s, y + 12 * s], [x + 18 * s, y - 12 * s], [x - 28 * s, y - 12 * s], [x - 28 * s, y + 4 * s], [x - 40 * s, y + 4 * s]], "#118ab2", "#073b4c");
    P(R(-38, 4, 8, 22), "#adb5bd");
    P(R(-54, 24, 40, 6), "#495057");
  } else if (t === "mitta") {
    B(-30, -24, 48, 48, "#ffd166", 12);
    out.push(Circle(x - 6 * s, y, 12 * s, C("#343a40")));
    P(R(18, 12, 44, 10), "#fff3b0", "#b5540a");
    if (!shadow) for (let i = 0; i < 5; i++) out.push(Line([[x + (22 + i * 9) * s, y + 12 * s], [x + (22 + i * 9) * s, y + 17 * s]], "#3d405b", 1.5));
  } else if (t === "vatupassi") {
    B(-60, -9, 120, 18, "#06d6a0", 4);
    B(-14, -6, 28, 12, "#fefae0", 6);
    if (!shadow) out.push(Circle(x + 2 * s, y, 4 * s, "#a7c957"));
  } else if (t === "pora") {
    P(R(-48, -6, 26, 12), "#adb5bd");
    P(R(-22, -10, 14, 20), "#343a40");
    P([[x - 8 * s, y - 20 * s], [x + 50 * s, y - 20 * s], [x + 50 * s, y + 2 * s], [x - 8 * s, y + 2 * s]], "#f77f00", "#b5540a");
    P([[x + 20 * s, y + 2 * s], [x + 40 * s, y + 2 * s], [x + 44 * s, y + 26 * s], [x + 24 * s, y + 26 * s]], "#343a40");
    P(R(18, 24, 32, 10), "#118ab2");
  }
  return out;
}

// the job, drawn big in the card at the top
function JobPic(id: string, x: number, y: number) {
  const out: any[] = [];
  const wood = (w: number) => out.push(Box(x - w / 2, y + 10, w, 34, "#d39150", 5));
  if (id === "naula") { wood(200); out.push(Box(x - 3, y - 40, 6, 50, "#adb5bd")); out.push(Box(x - 14, y - 46, 28, 7, "#6c757d", 2)); }
  if (id === "risti" || id === "ura") {
    wood(200);
    out.push(Poly(ngon(x, y + 4, 30, 24, 0).map((p) => [p[0], y + 4 + (p[1] - y - 4) * 0.4]), "#ced4da", "#6c757d", 2));
    out.push(Circle(x + 80, y - 30, 30, "#1d1d1d"));
    if (id === "ura") out.push(Box(x + 58, y - 34, 44, 8, "#ffffff", 2));
    else { out.push(Box(x + 58, y - 34, 44, 8, "#ffffff", 2)); out.push(Box(x + 76, y - 52, 8, 44, "#ffffff", 2)); }
    out.push(Poly([[x - 18, y + 2], [x + 18, y + 6], [x + 18, y + 1], [x - 18, y - 3]], "#343a40"));
    if (id === "risti") out.push(Poly([[x - 4, y - 6], [x + 4, y - 5], [x + 4, y + 14], [x - 4, y + 13]], "#343a40"));
  }
  if (id === "mutteri") { out.push(Box(x - 10, y - 50, 20, 100, "#adb5bd", 3)); out.push(Poly(ngon(x, y, 30, 6, 0), "#ced4da", "#495057", 3)); out.push(Circle(x, y, 10, "#868e96")); }
  if (id === "poikki") { wood(240); for (let i = 0; i < 4; i++) out.push(Box(x - 2, y + 4 + i * 11, 4, 7, "#3d405b")); }
  if (id === "lanka") out.push(Line([[x - 90, y + 20], [x - 30, y + 20], [x - 10, y - 10], [x + 40, y - 10], [x + 60, y + 30], [x + 90, y + 30]], "#adb5bd", 5));
  if (id === "liima") { out.push(Box(x - 100, y - 10, 200, 22, "#d39150", 4)); out.push(Box(x - 100, y + 16, 200, 22, "#e9c46a", 4)); for (let i = 0; i < 5; i++) out.push(Circle(x - 70 + i * 35, y + 14, 5, "#ffffff")); }
  if (id === "mittaa") { wood(220); out.push(Line([[x - 110, y - 10], [x + 110, y - 10]], "#e63946", 3)); out.push(Poly([[x - 110, y - 10], [x - 96, y - 18], [x - 96, y - 2]], "#e63946")); out.push(Poly([[x + 110, y - 10], [x + 96, y - 18], [x + 96, y - 2]], "#e63946")); out.push(<div className="big" style={{ left: x - 30, top: y - 56, width: 60 }}>?</div>); }
  if (id === "hylly") { out.push(Box(x - 110, y - 50, 220, 100, "#e9ecef", 4)); out.push(Poly(turn(rect(x - 80, y - 6, 160, 14), x, y, -0.12), "#d39150", "#8d5524", 2)); }
  if (id === "reika") { out.push(Box(x - 110, y - 50, 220, 100, "#e9ecef", 4)); out.push(Line([[x - 12, y - 12], [x + 12, y + 12]], "#e63946", 5)); out.push(Line([[x + 12, y - 12], [x - 12, y + 12]], "#e63946", 5)); }
  return out;
}

function Toolbox() {
  const out: any[] = [];
  const top = boxTop(), rows = Math.ceil(box.length / 2), bottom = slot(box.length - 1).y + slot(0).h / 2 + 14;
  out.push(Poly([[18, top + 10], [40, top - 26], [width - 40, top - 26], [width - 18, top + 10]], "#c1121f", "#780000", 2));      // the lid, open
  out.push(Box(10, top + 10, width - 20, bottom - top, "#e63946", 14));
  out.push(Box(20, top + 24, width - 40, bottom - top - 22, TRAY, 10));
  out.push(Box(width / 2 - 30, top - 34, 60, 12, "#343a40", 6));                                                             // the handle
  for (let i = 0; i < box.length; i++) {
    const p = slot(i);
    const sh = shake === i ? Math.sin((K.t - shakeT) * 50) * 8 * Math.max(0, 1 - (K.t - shakeT) / 0.4) : 0;
    out.push(Box(p.x - p.w / 2 + 4, p.y - p.h / 2 + 3, p.w - 8, p.h - 6, wrong.indexOf(i) >= 0 ? "rgba(0,0,0,0.06)" : K.solved >= 0 && box[i] === want && K.level < 2 ? "#c9f7e4" : "rgba(255,255,255,0.55)", 8));
    const sc = Math.min(1, (p.w - 16) / 130, (p.h - 6) / 56);
    if (K.level === 2) for (const e of ToolPic(box[i], p.x, p.y, sc, true)) out.push(e);
    else if (wrong.indexOf(i) < 0) for (const e of ToolPic(box[i], p.x + sh, p.y, sc, false)) out.push(e);
    else for (const e of ToolPic(box[i], p.x, p.y, sc, true)) out.push(e);
    if (K.level < 2) out.push(<div className="hit" id={"t" + i} onClick={() => pick(i)} style={{ left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h }} />);
    if (K.level < 2 && K.t - hintT < 5 && box[i] === want) out.push(PointAt(p.x, p.y - p.h / 2 + 4, "#f77f00"));
  }
  return out;
}

function Play() {
  const out: any[] = [];
  const text = K.level === 0 ? rg.t("Mikä työkalu tähän?", "Which tool for this?", "¿Qué herramienta?")
    : K.level === 1 ? rg.t("Etsi: ", "Find: ", "Busca: ") + NAMES[want]
    : rg.t("Laita työkalut paikoilleen", "Put the tools back", "Guarda las herramientas");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  if (K.level === 0) {
    const ch = Math.min(150, boxTop() - 40 - 122), y = 122 + ch / 2;
    out.push(<div className="card" style={{ left: 30, top: y - ch / 2, width: width - 60, height: ch }} />);
    for (const e of JobPic(job.id, width / 2, y)) out.push(e);
  }
  for (const e of Toolbox()) out.push(e);
  if (K.level === 2) {
    loose.forEach((l, i) => {
      if (l.done) { const p = slot(l.home); for (const e of ToolPic(l.tool, l.x, l.y, Math.min(1, (p.w - 16) / 130, (p.h - 6) / 56), false)) out.push(e); }
    });
    loose.forEach((l, i) => { if (!l.done) for (const e of ToolPic(l.tool, l.x, l.y, grab === i ? 0.95 : 0.8, false)) out.push(e); });
    if (K.t - hintT < 5) {
      const l = loose.filter((q) => !q.done)[0];
      if (l) { const p = slot(l.home); out.push(PointAt(p.x, p.y - 10, "#f77f00")); }
    }
  }
  return <div className="screen">{out}</div>;
}

const NAMES: any = {
  vasara: rg.t("vasara", "hammer", "martillo"), risti: rg.t("ristipäämeisseli", "cross screwdriver", "destornillador de estrella"),
  taltta: rg.t("talttameisseli", "flat screwdriver", "destornillador plano"), avain: rg.t("kiintoavain", "spanner", "llave fija"),
  saha: rg.t("saha", "saw", "sierra"), pihdit: rg.t("pihdit", "pliers", "alicates"), puristin: rg.t("ruuvipuristin", "clamp", "sargento"),
  mitta: rg.t("rullamitta", "tape measure", "metro"), vatupassi: rg.t("vatupassi", "spirit level", "nivel"), pora: rg.t("porakone", "drill", "taladro"),
};

setup(rg.t("Työkalupakki", "Toolbox", "Caja de herramientas"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu([]);
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
