// Tietokone: what is inside a phone or a computer, and where things run.
// For 5- and 8-year-olds, everything said aloud. Levels:
//   1 Mikä osa?       a job is shown and said ("what plays music?"): tap the part
//   2 Rakenna puhelin  drag the parts onto their shadows in an open phone;
//                      when it is whole, the screen lights up
//   3 Missä se pyörii? a thing is shown (a calculator, the weather tomorrow,
//                      a video from anywhere in the world…): does it run in
//                      the phone itself, or far away in a server hall, "the
//                      cloud"? The answer is explained aloud.
// Steps: more parts to choose from / to place, trickier things to place.
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, rect, ngon, Robot } from "lib/kit";

const PARTS = ["cpu", "ram", "ssd", "akku", "naytto", "kaiutin", "mikki", "kamera", "antenni"];
const JOB_EMOJI: any = { cpu: "🧠", ram: "📝", ssd: "📦", akku: "⚡", naytto: "👀", kaiutin: "🎵", mikki: "🗣️", kamera: "📸", antenni: "📶" };
const NAMES: any = {
  cpu: rg.t("suoritin", "processor", "procesador"), ram: rg.t("työmuisti", "memory", "memoria"), ssd: rg.t("tallennustila", "storage", "almacenamiento"),
  akku: rg.t("akku", "battery", "batería"), naytto: rg.t("näyttö", "screen", "pantalla"), kaiutin: rg.t("kaiutin", "speaker", "altavoz"),
  mikki: rg.t("mikrofoni", "microphone", "micrófono"), kamera: rg.t("kamera", "camera", "cámara"), antenni: rg.t("antenni", "antenna", "antena"),
};
// level 3: things, and whether they run in the phone ("p") or in the cloud ("c"); step 0 easy … 2 tricky
const THINGS = [
  { id: "laskin", e: "🔢", where: "p", step: 0 }, { id: "lamppu", e: "🔦", where: "p", step: 0 }, { id: "videot", e: "📺", where: "c", step: 0 },
  { id: "haku", e: "🔍", where: "c", step: 0 }, { id: "kello", e: "⏰", where: "p", step: 1 }, { id: "saa", e: "⛅", where: "c", step: 1 },
  { id: "piirros", e: "🎨", where: "p", step: 1 }, { id: "peli", e: "🎮", where: "p", step: 2 }, { id: "viesti", e: "💬", where: "c", step: 2 },
  { id: "tekoaly", e: "🤖", where: "c", step: 2 }, { id: "kuva", e: "📷", where: "p", step: 1 }, { id: "kartta", e: "🗺️", where: "c", step: 2 },
];

const LEVELS: Level[] = [
  { name: rg.t("Mikä osa?", "Which part?", "¿Qué pieza?"), color: "#3a86ff", say: "tk_t_mika", pic: (x, y, s) => PartPic("cpu", x, y, s * 0.9, false) },
  { name: rg.t("Rakenna puhelin", "Build a phone", "Arma un móvil"), color: "#06a77d", say: "tk_t_rakenna", pic: (x, y, s) => PhoneShell(x - 24 * s, y - 36 * s, 48 * s, 76 * s).concat(PartPic("akku", x, y + 14 * s, s * 0.3, false), PartPic("cpu", x, y - 16 * s, s * 0.28, false)) },
  { name: rg.t("Missä se pyörii?", "Where does it run?", "¿Dónde funciona?"), color: "#8338ec", say: "tk_t_missa", pic: (x, y, s) => PhoneShell(x - 50 * s, y - 26 * s, 30 * s, 52 * s).concat(Cloud(x + 22 * s, y + 2 * s, s * 0.42)) },
];

let want = "cpu";
let choices: string[] = [];
let wrong: number[] = [];
let hintT = -10;
let thing = THINGS[0];
let answered = "";
// building
type Loose = { part: string; x: number; y: number; ox: number; oy: number; done: boolean };
let loose: Loose[] = [];
let grab = -1;
let lightT = -10;

// where each part sits in the open phone, as shares of the phone's box
const SLOT: any = {
  kamera: [0.28, 0.1], antenni: [0.72, 0.08], cpu: [0.32, 0.3], ram: [0.72, 0.3], ssd: [0.72, 0.47],
  akku: [0.36, 0.6], kaiutin: [0.28, 0.9], mikki: [0.72, 0.9], naytto: [0.72, 0.68],
};
function phoneBox() { const h = Math.min(400, height - 330), w = Math.min(200, h * 0.55); return { x: 18, y: 130, w, h }; }
function slotXY(p: string) { const b = phoneBox(); return [b.x + b.w * SLOT[p][0], b.y + b.h * SLOT[p][1]]; }
function partScale() { return phoneBox().w / 330; }

function instruct() {
  if (K.level === 0) rg.say("tk_t_job_" + want);
  else if (K.level === 1) rg.say("tk_t_rakenna");
  else rg.say(["tk_t_th_" + thing.id, "tk_t_missa"]);
}

function next() {
  const s = step();
  wrong = []; hintT = -10; answered = ""; grab = -1; lightT = -10; K.wait = 1.8;
  if (K.level === 0) {
    const old = want;
    want = rg.pick(PARTS);
    if (want === old) want = rg.pick(PARTS);
    const n = [3, 4, 6][s];
    choices = rg.shuffle([want].concat(rg.shuffle(PARTS.filter((p) => p !== want)).slice(0, n - 1)));
  } else if (K.level === 1) {
    const n = [3, 5, 8][s];
    const pick = rg.shuffle(PARTS.slice(0)).slice(0, n);
    const b = phoneBox();
    const spots: number[][] = [];
    const rx = b.x + b.w + 18, colW = width - rx - 10;
    for (let i = 0; i < 9; i++) spots.push(i < 5 ? [rx + colW / 2, b.y + 30 + i * Math.min(70, (b.h - 20) / 5)] : [40 + (i - 5) * 85, b.y + b.h + 50]);
    loose = PARTS.map((p) => ({ part: p, x: 0, y: 0, ox: 0, oy: 0, done: pick.indexOf(p) < 0 }));
    let k = 0;
    for (const l of rg.shuffle(loose.filter((q) => !q.done))) { const sp = spots[k++]; l.x = l.ox = sp[0]; l.y = l.oy = sp[1]; }
    for (const l of loose) if (l.done) { const xy = slotXY(l.part); l.x = xy[0]; l.y = xy[1]; }
  } else {
    const pool = THINGS.filter((t) => t.step <= s && (s === 0 || t.step >= s - 1));
    const old = thing.id;
    thing = rg.pick(pool);
    if (thing.id === old) thing = rg.pick(pool);
  }
  instruct();
}

function pick(i: number) {
  if (K.solved >= 0 || wrong.indexOf(i) >= 0) return;
  const p = choices[i];
  if (p === want) { win(width / 2, 300, ["tk_t_n_" + p]); return; }
  wrong.push(i);
  const n = miss();
  const say = ["tk_t_tama_on", "tk_t_n_" + p];
  if (n >= 2) { hintT = K.t; say.push("tk_t_vihje_" + want); }
  rg.say(say);
}

function answer(w: string) {
  if (K.solved >= 0) return;
  answered = w;
  if (w === thing.where) { win(width / 2, 260, ["tk_t_s_" + thing.id]); K.wait = 4.2; return; }
  const n = miss();
  if (n >= 2) hintT = K.t;
  rg.say(n >= 2 ? ["tk_t_ei_ihan", "tk_t_s_" + thing.id] : ["tk_t_ei_ihan", "kokeile_toista"]);
}

function onPointerDown(x: number, y: number) {
  if (K.mode !== "play" || K.level !== 1 || K.solved >= 0) return;
  const r = 34 * Math.max(1, partScale() * 1.6);
  for (let i = loose.length - 1; i >= 0; i--) {
    const l = loose[i];
    if (!l.done && Math.abs(x - l.x) < r + 8 && Math.abs(y - l.y) < r) { grab = i; rg.sound("click"); return; }
  }
}

function drop() {
  if (grab < 0) return;
  const l = loose[grab];
  grab = -1;
  const xy = slotXY(l.part);
  if (Math.hypot(l.x - xy[0], l.y - xy[1]) < 40) {
    l.done = true; l.x = xy[0]; l.y = xy[1];
    rg.sound("pop"); rg.vibrate(20);
    if (loose.every((q) => q.done)) { lightT = K.t; win(phoneBox().x + phoneBox().w / 2, phoneBox().y + phoneBox().h / 2, ["tk_t_puhelin_valmis"]); }
    else rg.say("tk_t_n_" + l.part);
    return;
  }
  // dropped on another part's shadow: say what that place is for
  const b = phoneBox();
  if (l.x > b.x && l.x < b.x + b.w && l.y > b.y && l.y < b.y + b.h) {
    const n = miss();
    if (n >= 2) hintT = K.t;
    rg.say(n >= 2 ? ["tk_t_ei_mahdu", "tk_t_vihje_varjo"] : "tk_t_ei_mahdu");
  }
  l.x = l.ox; l.y = l.oy;
}

function onPointerUp() { drop(); }

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play" || K.level !== 1 || grab < 0) return;
  const p = input && input.pointer;
  if (p && p.down) { loose[grab].x = p.x; loose[grab].y = p.y; } else drop();
}

function hint() {
  hintT = K.t;
  rg.sound("click");
  if (K.level === 0) rg.say("tk_t_vihje_" + want);
  else if (K.level === 1) rg.say("tk_t_vihje_varjo");
  else rg.say(thing.where === "p" ? "tk_t_vihje_p" : "tk_t_vihje_c");
}

function onBack() { grab = -1; back(); }

// ---- pictures ---------------------------------------------------------------------

// a part about 120 × 90 at s = 1, or its grey shadow
function PartPic(p: string, x: number, y: number, s: number, shadow: boolean): any[] {
  const out: any[] = [];
  const C = (c: string) => shadow ? "rgba(29,78,137,0.22)" : c;
  if (p === "cpu") {
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 13 * s;
      out.push(Box(x + o - 2 * s, y - 44 * s, 5 * s, 10 * s, C("#c9a227"), 1)); out.push(Box(x + o - 2 * s, y + 34 * s, 5 * s, 10 * s, C("#c9a227"), 1));
      out.push(Box(x - 44 * s, y + o - 2 * s, 10 * s, 5 * s, C("#c9a227"), 1)); out.push(Box(x + 34 * s, y + o - 2 * s, 10 * s, 5 * s, C("#c9a227"), 1));
    }
    out.push(Box(x - 36 * s, y - 36 * s, 72 * s, 72 * s, C("#343a40"), 8 * s));
    out.push(Box(x - 22 * s, y - 22 * s, 44 * s, 44 * s, C("#adb5bd"), 5 * s));
    if (!shadow) { out.push(Circle(x - 26 * s, y - 26 * s, 3 * s, "#ffd166")); out.push(Line([[x - 12 * s, y], [x + 12 * s, y]], "#6c757d", Math.max(1, 3 * s))); out.push(Line([[x, y - 12 * s], [x, y + 12 * s]], "#6c757d", Math.max(1, 3 * s))); }
  } else if (p === "ram") {
    out.push(Box(x - 54 * s, y - 20 * s, 108 * s, 40 * s, C("#2a9d8f"), 4 * s));
    for (let i = 0; i < 4; i++) out.push(Box(x - 46 * s + i * 24 * s, y - 13 * s, 18 * s, 18 * s, C("#1d3557"), 2 * s));
    for (let i = 0; i < 12; i++) out.push(Box(x - 50 * s + i * 8.6 * s, y + 13 * s, 5 * s, 7 * s, C("#e9c46a"), 1));
  } else if (p === "ssd") {
    out.push(Box(x - 34 * s, y - 42 * s, 68 * s, 84 * s, C("#5a189a"), 8 * s));
    out.push(Box(x - 24 * s, y - 30 * s, 48 * s, 30 * s, C("#e0aaff"), 4 * s));
    out.push(Box(x - 24 * s, y + 24 * s, 48 * s, 10 * s, C("#e9c46a"), 2 * s));
  } else if (p === "akku") {
    out.push(Box(x - 40 * s, y - 50 * s, 80 * s, 100 * s, C("#06a77d"), 10 * s));
    out.push(Box(x - 40 * s, y + 10 * s, 80 * s, 40 * s, C("#048a68"), 10 * s));
    if (!shadow) out.push(Poly([[x + 6 * s, y - 34 * s], [x - 16 * s, y + 4 * s], [x - 2 * s, y + 4 * s], [x - 8 * s, y + 34 * s], [x + 16 * s, y - 4 * s], [x + 2 * s, y - 4 * s]], "#ffd166", "#3d405b", 1));
  } else if (p === "naytto") {
    out.push(Box(x - 40 * s, y - 30 * s, 80 * s, 60 * s, C("#1d3557"), 6 * s));
    out.push(Box(x - 34 * s, y - 24 * s, 68 * s, 48 * s, C("#4cc9f0"), 3 * s));
    if (!shadow) { out.push(Circle(x - 14 * s, y - 6 * s, 5 * s, "#ffffff")); out.push(Circle(x + 14 * s, y - 6 * s, 5 * s, "#ffffff")); out.push(Box(x - 12 * s, y + 8 * s, 24 * s, 4 * s, "#ffffff", 2 * s)); }
  } else if (p === "kaiutin") {
    out.push(Circle(x, y, 36 * s, C("#495057")));
    out.push(Circle(x, y, 24 * s, C("#212529")));
    if (!shadow) out.push(Circle(x, y, 9 * s, "#adb5bd"));
  } else if (p === "mikki") {
    out.push(Box(x - 14 * s, y - 40 * s, 28 * s, 46 * s, C("#6c757d"), 14 * s));
    out.push(Line([[x - 24 * s, y - 8 * s], [x - 22 * s, y + 10 * s], [x, y + 20 * s], [x + 22 * s, y + 10 * s], [x + 24 * s, y - 8 * s]], C("#343a40"), Math.max(2, 4 * s)));
    out.push(Box(x - 3 * s, y + 18 * s, 6 * s, 18 * s, C("#343a40"), 2));
    out.push(Box(x - 16 * s, y + 34 * s, 32 * s, 6 * s, C("#343a40"), 3 * s));
  } else if (p === "kamera") {
    out.push(Box(x - 30 * s, y - 30 * s, 60 * s, 60 * s, C("#212529"), 14 * s));
    out.push(Circle(x, y, 20 * s, C("#495057")));
    if (!shadow) { out.push(Circle(x, y, 12 * s, "#3a0ca3")); out.push(Circle(x - 5 * s, y - 5 * s, 4 * s, "#ffffff")); }
  } else if (p === "antenni") {
    out.push(Box(x - 4 * s, y - 10 * s, 8 * s, 44 * s, C("#6c757d"), 3 * s));
    out.push(Circle(x, y - 14 * s, 7 * s, C("#ef476f")));
    for (let k = 1; k <= 3; k++) {
      const r = (10 + k * 10) * s, pts: number[][] = [];
      for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 - 0.7 + 1.4 * i / 8; pts.push([x + Math.cos(a) * r, y - 14 * s + Math.sin(a) * r]); }
      out.push(Line(pts, C("#ef476f"), Math.max(2, 3 * s)));
    }
  }
  return out;
}

// an open phone, seen from the back with the cover off
function PhoneShell(x: number, y: number, w: number, h: number) {
  return [Box(x - 6, y - 6, w + 12, h + 12, "#1d3557", 22), Box(x, y, w, h, "#457b9d", 16), Box(x + 6, y + 6, w - 12, h - 12, "#a8dadc", 12)];
}

// the cloud: a server hall with racks of blinking lights under a cloud, about 150 wide at s = 1
function Cloud(x: number, y: number, s: number) {
  const out: any[] = [];
  for (const c of [[-40, -38, 30], [0, -52, 38], [42, -36, 28]]) out.push(Circle(x + c[0] * s, y + c[1] * s, c[2] * s, "#cfe2f7"));
  out.push(Box(x - 64 * s, y - 34 * s, 128 * s, 24 * s, "#cfe2f7", 12 * s));
  out.push(Box(x - 70 * s, y - 6 * s, 140 * s, 70 * s, "#343a40", 8 * s));
  for (let r = 0; r < 4; r++) {
    const rx = x - 62 * s + r * 32 * s;
    out.push(Box(rx, y + 2 * s, 26 * s, 56 * s, "#212529", 3 * s));
    for (let k = 0; k < 5; k++) {
      const on = Math.sin(K.t * (3 + r) + k * 1.7) > 0;
      out.push(Box(rx + 4 * s, y + 7 * s + k * 10 * s, 18 * s, 5 * s, on ? (k % 2 ? "#06d6a0" : "#4cc9f0") : "#495057", 1));
    }
  }
  return out;
}

function Phone(x: number, y: number, s: number) {
  return [Box(x - 32 * s, y - 56 * s, 64 * s, 112 * s, "#1d3557", 12 * s), Box(x - 27 * s, y - 46 * s, 54 * s, 88 * s, "#4cc9f0", 4 * s), Circle(x, y + 49 * s, 4 * s, "#adb5bd")];
}

// ---- screens ----------------------------------------------------------------------

function Pick() {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 40, top: 122, width: width - 80, height: 110 }} />);
  out.push(<div className="emoji" style={{ left: 40, top: 128, width: width - 80, height: 96, fontSize: 64 }}>{JOB_EMOJI[want]}</div>);
  const n = choices.length, cols = n <= 4 ? 2 : 3;
  const tw = (width - 30 - (cols - 1) * 10) / cols, rows = Math.ceil(n / cols);
  const th = Math.min(150, (height - 260 - 30) / rows - 10);
  choices.forEach((p, i) => {
    const x = 15 + (i % cols) * (tw + 10), y = 250 + Math.floor(i / cols) * (th + 10);
    const cls = wrong.indexOf(i) >= 0 ? "card off" : K.solved >= 0 && p === want ? "card ok" : "card";
    out.push(<div className={cls} style={{ left: x, top: y, width: tw, height: th }} />);
    for (const e of PartPic(p, x + tw / 2, y + th / 2 - 10, Math.min(tw / 140, th / 130), false)) out.push(e);
    if (wrong.indexOf(i) >= 0 || K.solved >= 0) out.push(<div className="label" style={{ left: x, top: y + th - 26, width: tw, height: 22 }}>{NAMES[p]}</div>);
    out.push(<div className="hit" id={"p" + i} onClick={() => pick(i)} style={{ left: x, top: y, width: tw, height: th }} />);
    if (K.t - hintT < 5 && p === want) out.push(PointAt(x + tw / 2, y + 6, "#f77f00"));
  });
  return out;
}

function Build() {
  const out: any[] = [];
  const b = phoneBox(), sc = partScale();
  for (const e of PhoneShell(b.x, b.y, b.w, b.h)) out.push(e);
  for (const l of loose) { const xy = slotXY(l.part); for (const e of PartPic(l.part, xy[0], xy[1], sc, true)) out.push(e); }
  for (const l of loose) if (l.done) for (const e of PartPic(l.part, l.x, l.y, sc, false)) out.push(e);
  // wires between the parts that are in, to the processor
  const cpu = loose.filter((l) => l.part === "cpu")[0];
  if (cpu && cpu.done) for (const l of loose) if (l.done && l.part !== "cpu") { const a = slotXY("cpu"), c = slotXY(l.part); out.push(Line([[a[0], a[1]], [c[0], a[1]], [c[0], c[1]]], "rgba(255,183,3,0.55)", 2)); }
  loose.forEach((l, i) => { if (!l.done) for (const e of PartPic(l.part, l.x, l.y, grab === i ? sc * 1.3 : sc * 1.15, false)) out.push(e); });
  if (K.t - hintT < 5) { const l = loose.filter((q) => !q.done)[0]; if (l) { const xy = slotXY(l.part); out.push(PointAt(xy[0], xy[1] - 10, "#f77f00")); out.push(PointAt(l.x, l.y - 24, "#3a86ff")); } }
  // whole: turned round, the screen lights up and smiles
  if (lightT > 0) {
    const a = Math.min(1, (K.t - lightT) * 2);
    out.push(<div style={{ position: "absolute", left: b.x - 6, top: b.y - 6, width: b.w + 12, height: b.h + 12, borderRadius: 22, backgroundColor: "#1d3557", opacity: a }} />);
    out.push(<div style={{ position: "absolute", left: b.x + 8, top: b.y + 14, width: b.w - 16, height: b.h - 40, borderRadius: 8, backgroundColor: "#4cc9f0", opacity: a }} />);
    if (a >= 1) for (const e of Robot(b.x + b.w / 2, b.y + b.h / 2, b.w / 200, "#4895ef", -1, "happy")) out.push(e);
  }
  return out;
}

function Where() {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 40, top: 122, width: width - 80, height: 120 }} />);
  out.push(<div className="emoji" style={{ left: 40, top: 126, width: width - 80, height: 80, fontSize: 60 }}>{thing.e}</div>);
  out.push(<div className="label" style={{ left: 40, top: 206, width: width - 80, height: 30 }}>{THING_NAME[thing.id]}</div>);
  const y = 270, h = Math.min(260, height - y - 40), w = (width - 40) / 2;
  const opts = [{ id: "p", x: 14, color: "#3a86ff", name: rg.t("Puhelimessa", "In the phone", "En el móvil") }, { id: "c", x: 26 + w, color: "#8338ec", name: rg.t("Pilvessä", "In the cloud", "En la nube") }];
  for (const o of opts) {
    const cls = answered && o.id === answered && o.id !== thing.where ? "card off" : K.solved >= 0 && o.id === thing.where ? "card ok" : "card";
    out.push(<div className={cls} style={{ left: o.x, top: y, width: w, height: h }} />);
    if (o.id === "p") for (const e of Phone(o.x + w / 2, y + h / 2 - 16, Math.min(1.4, h / 170))) out.push(e);
    else for (const e of Cloud(o.x + w / 2, y + h / 2 + 4, Math.min(0.95, w / 160))) out.push(e);
    out.push(<div className="label" style={{ left: o.x, top: y + h - 34, width: w, height: 26, color: o.color }}>{o.name}</div>);
    out.push(<div className="hit" id={"w" + o.id} onClick={() => answer(o.id)} style={{ left: o.x, top: y, width: w, height: h }} />);
    if (K.t - hintT < 5 && o.id === thing.where) out.push(PointAt(o.x + w / 2, y + 6, "#f77f00"));
  }
  // the thing flies to where it runs
  if (K.solved >= 0) {
    const a = Math.min(1, (K.t - K.solved) * 1.5), o = thing.where === "p" ? opts[0] : opts[1];
    const tx = o.x + w / 2, ty = y + h / 2 - 20;
    out.push(<div className="emoji" style={{ left: width / 2 + (tx - width / 2) * a - 30, top: 166 + (ty - 166) * a - 30, width: 60, height: 60, fontSize: 44 }}>{thing.e}</div>);
  }
  return out;
}

const THING_NAME: any = {
  laskin: rg.t("Laskin", "Calculator", "Calculadora"), lamppu: rg.t("Taskulamppu", "Torch", "Linterna"), videot: rg.t("Videot koko maailmasta", "Videos from all over the world", "Vídeos de todo el mundo"),
  haku: rg.t("Haku netistä", "Searching the internet", "Buscar en internet"), kello: rg.t("Herätyskello", "Alarm clock", "Despertador"), saa: rg.t("Huomisen sää", "Tomorrow's weather", "El tiempo de mañana"),
  piirros: rg.t("Piirustusohjelma", "Drawing app", "App de dibujo"), peli: rg.t("Tämä peli", "This game", "Este juego"), viesti: rg.t("Viesti kaverille", "A message to a friend", "Un mensaje a un amigo"),
  tekoaly: rg.t("Iso tekoäly", "A big AI", "Una IA grande"), kuva: rg.t("Valokuvan ottaminen", "Taking a photo", "Hacer una foto"), kartta: rg.t("Reittiohjeet ja ruuhkat", "Directions and traffic jams", "Rutas y atascos"),
};

function Play() {
  const out: any[] = [];
  const text = K.level === 0 ? rg.t("Mikä osa tekee tämän?", "Which part does this?", "¿Qué pieza hace esto?")
    : K.level === 1 ? rg.t("Laita osat paikoilleen", "Put the parts in place", "Pon las piezas en su sitio")
    : rg.t("Missä tämä pyörii?", "Where does this run?", "¿Dónde funciona esto?");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  const body = K.level === 0 ? Pick() : K.level === 1 ? Build() : Where();
  for (const e of body) out.push(e);
  return <div className="screen">{out}</div>;
}

setup(rg.t("Tietokone", "Computer", "Ordenador"), LEVELS, 6, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu(PartPic("cpu", 40, 40, 0.38, false));
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
