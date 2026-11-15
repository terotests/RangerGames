// Omenalinjasto: apples come along a production line and a robot filter
// decides which go on to the slicer and which go to the bin. The child
// writes the filter's rule; the rule is shown as code. Then the line runs,
// the boss looks at what came out and says how it went, and the child goes
// back to fix the filter (the same batch again, like a test). Levels:
//   1 Käsin      the child is the filter: ✅ on or 🗑️ off for each apple
//   2 Väri       the first rule: jos väri = punainen → eteenpäin, muuten → pois
//   3 Madot      both colours are needed (red to the shop, green to jam),
//                but no worms: two conditions
//   4 Paino      too small apples are faulty and a pumpkin jams the slicer:
//                heavier than a tennis ball, lighter than a pumpkin
//   5 Kaikki     a shoe and a banana got on the line too: only apples
// While the line runs, the row of the rule that stops an item lights up
// red, so the child sees where the line noticed it.
import { K, Level, setup, step, win, miss, update, back, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, star, Robot } from "lib/kit";
import { Item, Rule, VALUES, rowsFor, emptyRule, check, wanted, verdict, solution, batch, jams } from "lib/rules";

const LEVELS: Level[] = [
  { name: rg.t("Käsin", "By hand", "A mano"), color: "#e63946", say: "ol_l1", pic: (x, y, s) => AppleArt(x - 22 * s, y + 6 * s, 20 * s, true, false).concat([<div className="emoji" style={{ left: x + 2 * s, top: y - 16 * s, width: 44 * s, height: 44 * s, fontSize: Math.round(30 * s) }}>👆</div>]) },
  { name: rg.t("Väri", "Colour", "Color"), color: "#2a9d8f", say: "ol_l2", pic: (x, y, s) => AppleArt(x - 22 * s, y + 6 * s, 18 * s, true, false).concat(AppleArt(x + 22 * s, y + 6 * s, 18 * s, false, false)) },
  { name: rg.t("Madot", "Worms", "Gusanos"), color: "#8338ec", say: "ol_l3", pic: (x, y, s) => AppleArt(x, y + 6 * s, 24 * s, true, true) },
  { name: rg.t("Paino", "Weight", "Peso"), color: "#f77f00", say: "ol_l4", pic: (x, y, s) => [<div className="emoji" style={{ left: x - 40 * s, top: y - 22 * s, width: 80 * s, height: 50 * s, fontSize: Math.round(30 * s) }}>🎾 🎃</div>] },
  { name: rg.t("Kaikki", "Everything", "Todo"), color: "#3a86ff", say: "ol_l5", pic: (x, y, s) => [<div className="emoji" style={{ left: x - 46 * s, top: y - 22 * s, width: 92 * s, height: 50 * s, fontSize: Math.round(28 * s) }}>👟 🍌</div>] },
];

// ---- layout ---------------------------------------------------------------------
const BY = 272;                        // the belt's top
const FX = 66;                         // the filter: the control panel that checks
const CX = 140;                        // the claw that takes the rejected things off
function SX() { return width - 128; }  // the slicer
function EX() { return width - 14; }   // the end of the belt
const BIN_Y = BY + 34;

// ---- state ----------------------------------------------------------------------
type Thing = { it: Item; x: number; y: number; vy: number; state: string; sliced: boolean; why: string; to: string };
let items: Item[] = [];               // the batch: the same on a retry
let things: Thing[] = [];
let rule: Rule = emptyRule();
let goalRed = true;
let noWorms = false;
let phase = "edit";                   // edit | run | boss
let spawned = 0;
let speed = 70;
let jamT = -10;
let flash = { row: "", ok: true, t: -10 };
let bossT = -10;
let bossSay = "";
let counts: any = {};
let hintT = -10;
let hintRow = "";
let code = false;                      // show the rule as real code
let waiting = -1;                      // level 1: the thing waiting at the filter

// ---- pictures ----------------------------------------------------------------------

function AppleArt(x: number, y: number, r: number, red: boolean, worm: boolean): any[] {
  const out: any[] = [];
  const c = red ? "#e63946" : "#8ac926", d = red ? "#a4161a" : "#5a8f17";
  out.push(Circle(x - r * 0.3, y, r * 0.78, c));
  out.push(Circle(x + r * 0.3, y, r * 0.78, c));
  out.push(Circle(x, y + r * 0.12, r * 0.8, c));
  out.push(Circle(x - r * 0.38, y - r * 0.25, r * 0.22, "rgba(255,255,255,0.45)"));
  out.push(Line([[x, y - r * 0.55], [x + r * 0.1, y - r * 1.05]], "#6c584c", Math.max(2, r * 0.14)));
  out.push(Poly([[x + r * 0.1, y - r * 0.85], [x + r * 0.55, y - r * 1.1], [x + r * 0.5, y - r * 0.8]], "#2d6a4f"));
  out.push(Box(x - r * 0.05, y + r * 0.62, r * 0.1, r * 0.1, d, 1));
  if (worm) {
    out.push(Circle(x + r * 0.35, y + r * 0.15, r * 0.2, "#6c584c"));
    out.push(Line([[x + r * 0.35, y + r * 0.15], [x + r * 0.7, y - r * 0.05], [x + r * 0.95, y + r * 0.2], [x + r * 1.15, y - r * 0.05]], "#f4978e", Math.max(3, r * 0.26)));
    out.push(Circle(x + r * 1.17, y - r * 0.07, r * 0.16, "#f08080"));
    out.push(Circle(x + r * 1.2, y - r * 0.1, Math.max(1, r * 0.05), "#3d405b"));
  }
  return out;
}

function ThingArt(it: Item, x: number, y: number, r: number, sliced: boolean): any[] {
  if (it.kind === "omena") {
    const rr = it.small ? r * 0.6 : r;
    if (!sliced) return AppleArt(x, y, rr, it.red, it.worm);
    // two halves with the white inside showing
    const c = it.red ? "#e63946" : "#8ac926";
    return [Circle(x - rr * 0.5, y, rr * 0.7, c), Circle(x - rr * 0.45, y, rr * 0.55, "#fff3d6"), Circle(x + rr * 0.5, y, rr * 0.7, c), Circle(x + rr * 0.45, y, rr * 0.55, "#fff3d6")];
  }
  const e = it.kind === "kenka" ? "👟" : it.kind === "banaani" ? "🍌" : "🎃";
  const f = it.kind === "kurpitsa" ? r * 2.3 : r * 1.7;
  return [<div className="emoji" style={{ left: x - f, top: y - f * 0.75, width: f * 2, height: f * 1.5, fontSize: Math.round(f * 1.1) }}>{e}</div>];
}

function Cross(x: number, y: number, r: number) {
  return [Line([[x - r, y - r], [x + r, y + r]], "#d62828", 4), Line([[x + r, y - r], [x - r, y + r]], "#d62828", 4)];
}

const TEAL = "#2f4b55", MINT = "#8fd3c7", ORANGE = "#f4a24a", PLUM = "#8e2a6b";

function Bin(x: number, y: number, w: number, kind: string, n: number) {
  const out: any[] = [];
  if (kind === "pois") {
    // a mine cart
    out.push(Poly([[x - w / 2, y + 4], [x + w / 2, y + 4], [x + w / 2 - 7, y + 36], [x - w / 2 + 7, y + 36]], TEAL));
    out.push(Box(x - w / 2 - 2, y, w + 4, 7, "#1f363e", 3));
    out.push(Circle(x - w / 4, y + 40, 6, "#1f363e")); out.push(Circle(x + w / 4, y + 40, 6, "#1f363e"));
    out.push(Circle(x - w / 4, y + 40, 2, MINT)); out.push(Circle(x + w / 4, y + 40, 2, MINT));
  } else {
    // a stack of boxes (shop) or jars (jam) that grows
    const k = Math.min(6, n);
    for (let i = 0; i < Math.max(1, k); i++) {
      const bx = x - 16 + (i % 2) * 18 - (i >= 2 && i < 4 ? 0 : 0), by = y + 30 - Math.floor(i / 2) * 15;
      if (kind === "kauppa") { out.push(Box(bx - 8, by, 17, 14, i < k ? "#d4a373" : "rgba(212,163,115,0.3)", 2)); if (i < k) out.push(<div className="tick" style={{ left: bx - 8, top: by, width: 17, height: 14 }}>✓</div>); }
      else { out.push(Box(bx - 7, by + 2, 15, 12, i < k ? MINT : "rgba(143,211,199,0.3)", 4)); out.push(Box(bx - 7, by, 15, 4, i < k ? ORANGE : "rgba(244,162,74,0.3)", 2)); }
    }
  }
  const label = kind === "pois" ? "🗑️" : kind === "kauppa" ? "🛒" : "🍯";
  out.push(<div className="emoji" style={{ left: x - 14, top: y + (kind === "pois" ? 8 : -10), width: 28, height: 22, fontSize: 15 }}>{label}</div>);
  if (n > 0) out.push(<div className="tiny" style={{ left: x - w / 2, top: y + 46, width: w, height: 16 }}>{String(n)}</div>);
  return out;
}

// the hall behind the line: arches, a truss with lamps, pipes
function Hall() {
  const out: any[] = [];
  out.push(<div style={{ position: "absolute", left: 0, top: 112, width, height: BY + 84 - 112, backgroundColor: "#e6eeeb" }} />);
  out.push(Circle(width * 0.22, BY - 6, 88, "#d3e6df"));
  out.push(Circle(width * 0.8, BY - 6, 84, "#d3e6df"));
  out.push(Box(0, BY + 20, width, 64, "#e6eeeb", 0));
  for (let k = 0; k < 6; k++) out.push(Box(14 + k * 62, 120 + (k % 2) * 30, 26, 12, "#d9e3e0", 3));
  // the pipe down to the slicer
  out.push(Box(width - 60, 112, 14, BY - 200, TEAL, 7));
  out.push(Box(width - 92, BY - 96, 46, 14, TEAL, 7));
  // the truss the claw runs on
  const ty = 172;
  out.push(Box(10, ty, CX + 50, 5, TEAL, 2)); out.push(Box(10, ty + 13, CX + 50, 5, TEAL, 2));
  const pts: number[][] = [];
  for (let x = 10; x <= CX + 60; x += 14) pts.push([x, (x / 14) % 2 < 1 ? ty + 3 : ty + 15]);
  out.push(Line(pts, TEAL, 2));
  // lamps
  for (const lx of [30, width - 130, width - 24]) { out.push(Line([[lx, 112], [lx, 128]], TEAL, 2)); out.push(Poly([[lx - 8, 134], [lx + 8, 134], [lx + 4, 128], [lx - 4, 128]], TEAL)); out.push(Circle(lx, 136, 4, ORANGE)); }
  // the floor
  out.push(Box(0, BY + 80, width, 6, TEAL, 0));
  return out;
}

// the control panel that checks each thing against the rule
function Panel(x: number) {
  const out: any[] = [];
  const top = BY - 92;
  const bulbs = ["#9be564", PLUM, ORANGE];
  for (let i = 0; i < 3; i++) out.push(Box(x + (i - 1) * 16 - 5, top - 9, 10, 10, bulbs[i], 5));
  out.push(Box(x - 30, top, 60, 90, TEAL, 8));
  // the screen: what the last check said
  const fresh = phase === "run" && K.t - flash.t < 0.6;
  out.push(Box(x - 22, top + 8, 44, 26, fresh ? (flash.ok ? "#b7efc5" : "#ffb3c1") : MINT, 4));
  out.push(<div className="emoji" style={{ left: x - 22, top: top + 8, width: 44, height: 26, fontSize: 18 }}>{fresh ? (flash.ok ? "✓" : "✗") : waiting >= 0 ? "?" : "…"}</div>);
  for (let k = 0; k < 6; k++) { const on = phase === "run" && Math.sin(K.t * 5 + k * 1.3) > 0; out.push(Circle(x - 15 + (k % 3) * 15, top + 46 + Math.floor(k / 3) * 12, 4, on ? (k % 2 ? ORANGE : PLUM) : "#4f6d78")); }
  out.push(Box(x - 18, top + 70, 36, 10, MINT, 3));
  return out;
}

// the claw on the truss; it holds a rejected thing while it carries it
function Claw(t: Thing | null) {
  const out: any[] = [];
  const x = CX, y = t ? t.y - 22 : BY - 78;
  out.push(Box(x - 12, 168, 24, 14, "#1f363e", 4));
  out.push(Line([[x, 182], [x, y - 8]], "#1f363e", 4));
  out.push(Box(x - 9, y - 12, 18, 12, "#1f363e", 3));
  const open = t ? 6 : 12;
  out.push(Line([[x - 6, y - 2], [x - open - 4, y + 10], [x - open + 2, y + 22]], "#4f6d78", 4));
  out.push(Line([[x + 6, y - 2], [x + open + 4, y + 10], [x + open - 2, y + 22]], "#4f6d78", 4));
  out.push(Circle(x, y - 6, 3, ORANGE));
  return out;
}

function Boss(x: number, y: number, happy: boolean) {
  const out: any[] = [];
  out.push(Box(x - 30, y + 26, 60, 64, "#343a40", 14));
  out.push(Poly([[x - 6, y + 28], [x + 6, y + 28], [x + 4, y + 62], [x, y + 70], [x - 4, y + 62]], "#d62828"));
  out.push(Poly([[x - 12, y + 26], [x, y + 36], [x + 12, y + 26]], "#ffffff"));
  out.push(Circle(x, y, 28, "#e09f3e"));
  out.push(Circle(x, y, 26, "#ffd6a5"));
  out.push(Box(x - 26, y - 28, 52, 16, "#6c584c", 8));
  out.push(Circle(x - 9, y - 2, 7, "#ffffff", "#3d405b")); out.push(Circle(x + 9, y - 2, 7, "#ffffff", "#3d405b"));
  out.push(Circle(x - 9, y - 2, 2.5, "#3d405b")); out.push(Circle(x + 9, y - 2, 2.5, "#3d405b"));
  if (happy) out.push(Poly([[x - 10, y + 10], [x + 10, y + 10], [x + 6, y + 17], [x - 6, y + 17]], "#ef476f"));
  else out.push(Line([[x - 9, y + 16], [x, y + 11], [x + 9, y + 16]], "#3d405b", 3));
  return out;
}

// the slicer: an orange hopper on a mint machine with hazard stripes
function Slicer(x: number, y: number) {
  const out: any[] = [];
  const shake = K.t - jamT < 2 ? Math.sin(K.t * 60) * 3 : 0;
  x += shake;
  out.push(Poly([[x - 26, y - 104], [x + 26, y - 104], [x + 10, y - 82], [x - 10, y - 82]], ORANGE));
  out.push(Box(x - 6, y - 84, 12, 8, "#c97d2e", 2));
  out.push(Box(x - 32, y - 76, 64, 70, MINT, 8));
  out.push(Box(x - 32, y - 76, 64, 10, "#6fb8ab", 6));
  for (let k = 0; k < 6; k++) out.push(Poly([[x - 30 + k * 11, y - 18], [x - 24 + k * 11, y - 18], [x - 30 + k * 11 + 4, y - 8], [x - 36 + k * 11 + 4, y - 8]], "#1f363e"));
  out.push(Box(x - 32, y - 18, 64, 10, "rgba(244,162,74,0.55)", 0));
  out.push(Circle(x, y - 46, 15, TEAL));
  const a = phase === "run" && K.t - jamT > 2 ? K.t * 12 : 0;
  out.push(Poly(star(x, y - 46, 12, 4, 4, a), "#e9ecef"));
  out.push(Circle(x + 22, y - 62, 5, K.t - jamT < 2 ? "#d62828" : "#9be564"));
  if (K.t - jamT < 3) for (let k = 0; k < 4; k++) { const t = (K.t * 0.8 + k * 0.25) % 1; out.push(Circle(x - 10 + k * 7 + Math.sin(t * 6 + k) * 6, y - 110 - t * 50, 8 + t * 10, "rgba(108,117,125," + (0.6 - t * 0.5).toFixed(2) + ")")); }
  return out;
}

// ---- the rule as code ------------------------------------------------------------------

const NAME: any = {
  vari: [rg.t("väri: mikä vain", "colour: any", "color: cualquiera"), rg.t("väri = punainen", "colour = red", "color = rojo"), rg.t("väri = vihreä", "colour = green", "color = verde")],
  mato: [rg.t("mato: ei väliä", "worm: any", "gusano: da igual"), rg.t("ei matoa", "no worm", "sin gusano")],
  yli: [rg.t("paino > –", "weight > –", "peso > –"), rg.t("paino > 🍒", "weight > 🍒", "peso > 🍒"), rg.t("paino > 🎾", "weight > 🎾", "peso > 🎾")],
  alle: [rg.t("paino < –", "weight < –", "peso < –"), rg.t("paino < 🎾", "weight < 🎾", "peso < 🎾"), rg.t("paino < 🎃", "weight < 🎃", "peso < 🎃")],
  omena: [rg.t("mikä tahansa", "anything", "cualquier cosa"), rg.t("on omena", "is an apple", "es una manzana")],
};
const CODE: any = {
  vari: ["", "o.vari == \"punainen\"", "o.vari == \"vihrea\""], mato: ["", "!o.mato"],
  yli: ["", "o.paino > KIRSIKKA", "o.paino > TENNISPALLO"], alle: ["", "o.paino < TENNISPALLO", "o.paino < KURPITSA"], omena: ["", "o.onOmena"],
};
const SAYVAL: any = {
  vari: ["ol_c_mika", "ol_c_punainen", "ol_c_vihrea"], mato: ["ol_c_ei_valia", "ol_c_eimatoa"],
  yli: ["ol_c_ei", "ol_c_yli_kirsikka", "ol_c_yli_tennis"], alle: ["ol_c_ei", "ol_c_alle_tennis", "ol_c_alle_kurpitsa"], omena: ["ol_c_mika_tahansa", "ol_c_omena"],
};

function cycle(row: string) {
  if (phase === "run" || K.solved >= 0) return;
  const r: any = rule;
  r[row] = (r[row] + 1) % VALUES[row];
  rg.sound("click"); rg.vibrate(10);
  rg.say(SAYVAL[row][r[row]]);
  if (phase === "boss") phase = "edit";
}

function RuleCard(y: number) {
  const out: any[] = [];
  const rows = rowsFor(K.level), lh = rows.length > 4 ? 35 : 40;
  const h = rows.length * lh + 82;
  out.push(<div className="card" style={{ left: 12, top: y, width: width - 24, height: h, backgroundColor: "#1d3557" }} />);
  out.push(<div className="pad" id="code" onClick={() => { code = !code; rg.sound("click"); }} style={{ left: width - 64, top: y + 6, width: 44, height: 28, backgroundColor: code ? "#ffd166" : "#457b9d" }}><div className="tiny" style={{ left: 0, top: 5, width: 44, height: 18, color: code ? "#1d3557" : "#ffffff" }}>{"</>"}</div></div>);
  const lit = phase === "run" && K.t - flash.t < 0.7 ? flash : null;
  if (code) {
    const conds = rows.filter((r) => (rule as any)[r] > 0).map((r) => CODE[r][(rule as any)[r]]);
    const lines = ["function suodatin(o) {", "  if (" + (conds.length ? conds.join(" &&\n      ") : "true") + ")", "    return ETEENPAIN", "  return POIS", "}"];
    let ly = y + 10;
    for (const l of lines) for (const part of l.split("\n")) {
      let sp = 0;
      while (part.charAt(sp) === " ") sp++;
      out.push(<div className="codeline" style={{ left: 22 + sp * 8, top: ly, width: width - 60 - sp * 8, height: 20 }}>{part.substring(sp)}</div>);
      ly += 20;
    }
    return out;
  }
  rows.forEach((row, i) => {
    const ry = y + 10 + i * lh;
    const v = (rule as any)[row];
    const red = lit && lit.row === row && !lit.ok;
    out.push(<div className="kw" style={{ left: 20, top: ry + 6, width: 40, height: 24 }}>{i === 0 ? rg.t("jos", "if", "si") : rg.t("ja", "and", "y")}</div>);
    out.push(<div className={red ? "chip bad" : v > 0 ? "chip on" : "chip"} id={"r" + row} onClick={() => cycle(row)} style={{ left: 64, top: ry, width: width - 140, height: lh - 6 }}><div className="chiptext">{NAME[row][v]}</div></div>);
    if (row === "vari" && v > 0) out.push(Circle(width - 92, ry + 17, 9, v === 1 ? "#e63946" : "#8ac926"));
    if (row === "mato" && v > 0) for (const e of Cross(width - 92, ry + 17, 8)) out.push(e);
    if (K.t - hintT < 6 && hintRow === row) out.push(PointAt(width - 60, ry + 4, "#ffd166"));
  });
  const ay = y + 10 + rows.length * lh;
  const pass = lit && lit.ok;
  out.push(<div className={pass ? "kw ok" : "kw"} style={{ left: 30, top: ay + 4, width: width - 60, height: 26 }}>{"→ " + rg.t("eteenpäin ✅", "go on ✅", "adelante ✅")}</div>);
  out.push(<div className={lit && !lit.ok ? "kw no" : "kw"} style={{ left: 30, top: ay + 32, width: width - 60, height: 26 }}>{rg.t("muuten → pois 🗑️", "else → bin 🗑️", "si no → fuera 🗑️")}</div>);
  return out;
}

// ---- the line ---------------------------------------------------------------------------

function goalSay(): string[] {
  if (K.level === 0) return [noWorms ? "ol_l1_mato" : "ol_l1"];
  if (K.level === 1) return ["ol_l2", goalRed ? "ol_goal_red" : "ol_goal_green"];
  return [["", "", "ol_l3", "ol_l4", "ol_l5"][K.level]];
}

function instruct() { rg.say(goalSay()); }

function next() {
  const s = step();
  goalRed = K.level !== 1 || rg.random() < 0.5;
  noWorms = K.level === 0 && s > 0;
  items = batch(K.level, s, () => rg.random());
  speed = [62, 74, 88][s];
  // the rule stays from batch to batch on a level; a new level starts empty
  if (K.question === 0) rule = emptyRule();
  hintT = -10; K.wait = 3.4;
  reset();
  instruct();
}

function reset() {
  things = []; spawned = 0; phase = "edit"; jamT = -10; bossT = -10; waiting = -1;
  counts = { pois: 0, kauppa: 0, hillo: 0 };
}

function run() {
  if (phase === "run" || K.solved >= 0) return;
  reset();
  phase = "run";
  rg.sound("whoosh");
}

function decide(t: Thing, pass: boolean) {
  t.state = pass ? "on" : "reject";
  rg.sound(pass ? "tick" : "wrong");
}

// level 1: the child's tap
function manual(pass: boolean) {
  if (phase !== "run" || waiting < 0) return;
  const t = things[waiting];
  waiting = -1;
  flash = { row: "", ok: pass, t: K.t };
  rg.say(pass ? "ol_eteen" : "ol_pois");
  decide(t, pass);
}

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode !== "play" || phase !== "run") return;
  if (K.t - jamT < 2.2) return;                       // jammed: the line has stopped
  if (jamT > 0) { finish(); return; }
  // a new thing on the belt when there is room
  const room = things.every((t) => t.state !== "belt" || t.x > 58);
  if (spawned < items.length && room && waiting < 0) { things.push({ it: items[spawned], x: -20, y: BY - 18, vy: 0, state: "belt", sliced: false, why: "", to: "" }); spawned++; }
  const rows = rowsFor(K.level);
  for (let i = 0; i < things.length; i++) {
    const t = things[i];
    if (t.state === "belt" || t.state === "on" || t.state === "reject") {
      if (waiting >= 0 && t.state === "belt") continue;   // the line waits for the child
      const before = t.x;
      t.x += speed * dt;
      if (t.state === "belt" && before < FX && t.x >= FX) {
        t.x = FX;
        if (K.level === 0) { waiting = i; continue; }
        const row = check(t.it, rule, rows);
        flash = { row, ok: row === "", t: K.t };
        decide(t, row === "");
      }
      if (t.state === "reject" && before < CX && t.x >= CX) { t.x = CX; t.state = "grab"; t.vy = 0; rg.sound("click"); continue; }
      if (t.state === "on" && before < SX() && t.x >= SX()) {
        if (jams(t.it)) { jamT = K.t; t.x = SX(); t.state = "jam"; rg.sound("hit"); rg.vibrate(200); return; }
        t.sliced = true; rg.sound("hit");
      }
      if (t.state === "on" && t.x >= EX()) {
        t.state = "fall"; t.vy = 0;
        t.to = K.level >= 2 ? (t.it.red ? "kauppa" : "hillo") : (goalRed ? "kauppa" : "hillo");
      }
    } else if (t.state === "grab") {
      // vy is the claw's clock: up off the belt, then down in front of it into the cart
      t.vy += dt;
      const a = t.vy;
      if (a < 0.3) t.y = BY - 18 - a / 0.3 * 46;
      else if (a < 0.75) t.y = BY - 64 + (a - 0.3) / 0.45 * (BIN_Y + 12 - BY + 64);
      else { counts.pois++; t.state = "inbin"; rg.sound("pop"); }
    } else if (t.state === "fall") {
      t.vy += 900 * dt; t.y += t.vy * dt;
      if (t.state === "fall") t.x = Math.max(binX(t.to), t.x - 140 * dt);
      if (t.y > BIN_Y + 10) { counts[t.to]++; t.state = "out"; }
    }
  }
  if (spawned >= items.length && things.every((t) => t.state === "inbin" || t.state === "out")) finish();
}

function binX(to: string) { return to === "kauppa" ? width - 92 : width - 36; }

// the boss comes to look at what came out
function finish() {
  phase = "boss"; bossT = K.t;
  // only the things that were decided count (after a jam the rest never got there)
  let worst = "";
  const found: string[] = [];
  for (const t of things) {
    if (t.state !== "inbin" && t.state !== "out" && t.state !== "jam") continue;
    const v = verdict(t.it, t.state !== "inbin", K.level, goalRed, noWorms);
    t.why = v;
    if (v) found.push(v);
  }
  for (const w of ["jumi", "mato", "pieni", "vari", "hukka"]) if (!worst && found.indexOf(w) >= 0) worst = w;
  bossSay = worst;
  if (!worst) { win(width / 2, 180, ["ol_pomo_hyva"]); return; }
  const n = miss();
  const say = ["ol_pomo_" + worst];
  if (n >= 2 && K.level > 0) {
    const sol: any = solution(K.level, goalRed);
    hintRow = "";
    for (const row of rowsFor(K.level)) if (!hintRow && (rule as any)[row] !== sol[row]) hintRow = row;
    if (hintRow) { hintT = K.t + 3; say.push(hintSay()); }
  } else if (n >= 2) { hintT = K.t + 3; say.push("ol_v_k1"); }
  say.push("ol_korjaa");
  rg.say(say);
}

function hintSay(): string {
  const sol: any = solution(K.level, goalRed);
  if (hintRow === "vari") return sol.vari === 1 ? "ol_v_vari_red" : sol.vari === 2 ? "ol_v_vari_green" : "ol_v_vari_any";
  return "ol_v_" + hintRow;
}

function hint() {
  rg.sound("click");
  if (K.level === 0) { hintT = K.t; rg.say(noWorms ? "ol_l1_mato" : "ol_v_k1"); return; }
  const sol: any = solution(K.level, goalRed);
  hintRow = "";
  for (const row of rowsFor(K.level)) if (!hintRow && (rule as any)[row] !== sol[row]) hintRow = row;
  hintT = K.t;
  if (hintRow) rg.say(hintSay()); else rg.say("ol_v_valmis");
}

function onBack() { phase = "edit"; back(); }

// ---- screens -----------------------------------------------------------------------------

function Goal() {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 12, top: 116, width: width - 24, height: 48 }} />);
  out.push(<div className="tiny" style={{ left: 16, top: 120, width: 70, height: 40 }}>{rg.t("Pomo haluaa:", "Boss wants:", "El jefe quiere:")}</div>);
  let x = 104;
  const put = (f: (x: number) => any[], no: boolean) => { for (const e of f(x)) out.push(e); if (no) for (const e of Cross(x, 140, 13)) out.push(e); x += 44; };
  if (K.level <= 1) { put((x) => AppleArt(x, 142, 14, goalRed, false), false); put((x) => AppleArt(x, 142, 14, !goalRed, false), true); if (noWorms) put((x) => AppleArt(x - 4, 142, 12, true, true), true); }
  else {
    put((x) => AppleArt(x, 142, 13, true, false), false); put((x) => AppleArt(x, 142, 13, false, false), false); put((x) => AppleArt(x - 4, 142, 12, true, true), true);
    if (K.level >= 3) { put((x) => AppleArt(x, 144, 8, true, false), true); put((x) => ThingArt({ kind: "kurpitsa", red: false, worm: false, small: false, g: 0 }, x, 142, 7, false), true); }
    if (K.level >= 4) { put((x) => ThingArt({ kind: "kenka", red: false, worm: false, small: false, g: 0 }, x, 142, 8, false), true); }
  }
  return out;
}

function LineView() {
  const out: any[] = [];
  for (const e of Hall()) out.push(e);
  // the belt: orange-edged, on rollers
  out.push(Box(4, BY - 2, width - 8, 24, ORANGE, 12));
  out.push(Box(6, BY, width - 12, 20, "#26333d", 10));
  const spin = phase === "run" && K.t - jamT > 2.2 ? K.t * speed / 9 : 0;
  for (let x = 20; x < width - 14; x += 30) {
    out.push(Circle(x, BY + 10, 7, "#6b8a96"));
    out.push(Circle(x + Math.cos(spin) * 3.5, BY + 10 + Math.sin(spin) * 3.5, 2, "#e6eeeb"));
  }
  // the bins on the floor
  for (const e of Bin(CX, BIN_Y, 50, "pois", counts.pois || 0)) out.push(e);
  if (K.level >= 2 || goalRed) for (const e of Bin(binX("kauppa"), BIN_Y, 48, "kauppa", counts.kauppa || 0)) out.push(e);
  if (K.level >= 2 || !goalRed) for (const e of Bin(binX("hillo"), BIN_Y, 48, "hillo", counts.hillo || 0)) out.push(e);
  for (const e of Slicer(SX(), BY)) out.push(e);
  out.push(<div className="tag" style={{ left: SX() - 40, top: BY - 77, width: 80, height: 14 }}>{rg.t("leikkuri", "slicer", "cortadora")}</div>);
  // the panel behind the belt where things are checked
  for (const e of Panel(FX)) out.push(e);
  out.push(<div className="tag" style={{ left: FX - 40, top: BY - 23, width: 80, height: 16 }}>{rg.t("suodatin", "filter", "filtro")}</div>);
  // the things on the belt (and falling into the boxes)
  let held: Thing | null = null;
  for (const t of things) {
    if (t.state === "inbin" || t.state === "out") continue;
    if (t.state === "grab") held = t;
    for (const e of ThingArt(t.it, t.x, t.y, 15, t.sliced)) out.push(e);
  }
  for (const e of Claw(held)) out.push(e);
  if (held) for (const e of ThingArt(held.it, held.x, held.y, 15, false)) out.push(e);
  return out;
}

function BossView() {
  const out: any[] = [];
  const a = Math.min(1, (K.t - bossT) * 3);
  out.push(<div style={{ position: "absolute", left: 0, top: 112, width, height: BY - 40, backgroundColor: "rgba(255,255,255," + (0.85 * a).toFixed(2) + ")" }} />);
  const bx = -40 + 100 * a;
  for (const e of Boss(bx, 170, !bossSay)) out.push(e);
  out.push(<div className="bubble" style={{ left: 104, top: 124, width: width - 116, height: 128 }} />);
  // what came out: the things that went wrong, marked
  const bad = things.filter((t) => t.why);
  if (!bad.length) out.push(<div className="big" style={{ left: 104, top: 140, width: width - 116, height: 90 }}>👍 ✨</div>);
  bad.slice(0, 6).forEach((t, i) => {
    const x = 132 + (i % 3) * 66, y = 160 + Math.floor(i / 3) * 52;
    for (const e of ThingArt(t.it, x, y, 13, false)) out.push(e);
    out.push(<div className="emoji" style={{ left: x + 8, top: y - 4, width: 26, height: 24, fontSize: 16 }}>{t.why === "hukka" ? "🗑️" : "❗"}</div>);
  });
  return out;
}

function ManualPads(y: number) {
  const out: any[] = [];
  const w = (width - 44) / 2, on = phase === "run" && waiting >= 0;
  out.push(<div className="pad" id="yes" onClick={() => manual(true)} style={{ left: 16, top: y, width: w, height: 110, backgroundColor: on ? "#06d6a0" : "#b7e4c7" }}><div className="padbig">✅</div><div className="padlabel">{rg.t("Eteenpäin", "Go on", "Adelante")}</div></div>);
  out.push(<div className="pad" id="no" onClick={() => manual(false)} style={{ left: 28 + w, top: y, width: w, height: 110, backgroundColor: on ? "#ef476f" : "#f4c2cc" }}><div className="padbig">🗑️</div><div className="padlabel">{rg.t("Pois", "Bin", "Fuera")}</div></div>);
  if (K.t - hintT < 5 && on) { const it = things[waiting].it; const yes = wanted(it, 0, goalRed, noWorms); out.push(PointAt(yes ? 16 + w / 2 : 28 + w * 1.5, y, "#f77f00")); }
  return out;
}

function Play() {
  const out: any[] = [];
  const text = K.level === 0 ? rg.t("Sinä olet suodatin", "You are the filter", "Tú eres el filtro") : rg.t("Kirjoita suodattimen sääntö", "Write the filter's rule", "Escribe la regla del filtro");
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  for (const e of LineView()) out.push(e);
  for (const e of Goal()) out.push(e);
  if (phase === "boss") for (const e of BossView()) out.push(e);
  if (K.level === 0) for (const e of ManualPads(BY + 110)) out.push(e);
  else for (const e of RuleCard(BY + 98)) out.push(e);
  const label = phase === "run" ? "…" : phase === "boss" && K.solved < 0 ? rg.t("▶ Kokeile uudestaan", "▶ Try again", "▶ Otra vez") : "▶";
  if (K.level > 0 || phase !== "run") out.push(<div className="pad" id="run" onClick={() => run()} style={{ left: 30, top: height - 70, width: width - 60, height: 56, backgroundColor: phase === "run" ? "#adb5bd" : "#06d6a0" }}><div className="padtext">{label}</div></div>);
  return <div className="screen">{out}</div>;
}

setup(rg.t("Omenalinjasto", "Apple line", "Línea de manzanas"), LEVELS, 3, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu(AppleArt(40, 44, 18, true, false));
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
