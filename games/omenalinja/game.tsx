// Omenalinjasto: things come along a production line and a robot filter
// decides which go on to the slicer and which the claw takes off. The child
// writes the filter's rule from parts (property, comparison, value), and the
// rule can also be shown as code. The line can be run, paused and stepped one
// thing at a time, and any thing can be tapped to see what the sensors measured
// and how each row of the rule judged it: debugging. At the end the boss looks
// at what came out, and the child fixes the rule and runs the same batch again.
//
// The game starts with the line running by itself while the parts are
// explained, then "Aloita". Each challenge has three orders from the boss:
//   1 Väri    the colour you see (red, then green, then yellow)
//   2 Koko    compared with a cherry, a tennis ball or a melon
//   3 Paino   foam balls look like apples, only the scale tells; pumpkins jam the slicer
//   4 Ja      two rows at once
//   5 Ei      "everything but the green ones" needs "ei ole"
import { K, Level, setup, step, start, win, miss, update, back, Header, Done, Sparks, Poly, Line, Circle, Box, PointAt, star } from "lib/kit";
import { Item, Cond, Rule, Order, ORDERS, SIZE, WEIGHT, propsFor, maxRows, opsFor, valuesFor, complete, holds, check, wanted, verdict, jams, judge, batch, apple } from "lib/rules";

const ICON: any = { vari: "🎨", koko: "📏", paino: "⚖️" };
const LEVELS: Level[] = [
  { name: rg.t("Väri", "Colour", "Color"), color: "#e63946", say: "ol_l1", pic: () => [] },
  { name: rg.t("Koko", "Size", "Tamaño"), color: "#2a9d8f", say: "ol_l2", pic: () => [] },
  { name: rg.t("Paino", "Weight", "Peso"), color: "#f77f00", say: "ol_l3", pic: () => [] },
  { name: rg.t("Ja", "And", "Y"), color: "#8338ec", say: "ol_l4", pic: () => [] },
  { name: rg.t("Ei", "Not", "No"), color: "#3a86ff", say: "ol_l5", pic: () => [] },
];
const LEVEL_ICON = ["🎨", "📏", "⚖️", "➕", "🚫"];

// ---- layout ---------------------------------------------------------------------
const BY = 272;                        // the belt's top
const FX = 66;                         // the filter: the control panel that checks
const CX = 140;                        // the claw that takes the rejected things off
function SX() { return width - 128; }  // the slicer
function EX() { return width - 14; }   // the end of the belt
const BIN_Y = BY + 34;

// ---- state ----------------------------------------------------------------------
type Thing = { it: Item; x: number; y: number; vy: number; state: string; sliced: boolean; why: string; row: number };
let items: Item[] = [];               // the batch: the same on a retry
let things: Thing[] = [];
let rule: Rule = [];
let order: Order = ORDERS[0][0];
let phase = "edit";                   // order (the boss tells) | edit | run | boss
let spawned = 0;
let speed = 70;
let jamT = -10;
let flash: any = { row: -1, ok: true, t: -10, th: null };
let bossT = -10;
let bossSay = "";
let counts: any = {};
let hintT = -10;
let hintRow = -1;                      // -2 = the "+ ja" button
let code = false;                      // show the rule as real code
let paused = false;
let stepping = false;                  // stop every thing at the filter
let insp: Thing | null = null;         // the thing being looked at
let picker: any = null;                // { row, part } while choosing a part of a row
let demo = false;                      // the start screen's line runs by itself
let introT = 0;
let introSaid = -1;
let cleared: number[] = rg.load("cleared", [0, 0, 0, 0, 0]);
let doneMarked = false;
const DEMO_RULE: Rule = [{ p: "vari", op: "on", v: "punainen" }];

// ---- pictures ----------------------------------------------------------------------

const COLOR: any = { punainen: ["#e63946", "#a4161a"], vihrea: ["#8ac926", "#5a8f17"], keltainen: ["#ffd23f", "#c9a227"], oranssi: ["#f77f00", "#b85c00"] };

function AppleArt(x: number, y: number, r: number, color: string): any[] {
  const out: any[] = [];
  const c = COLOR[color][0], d = COLOR[color][1];
  out.push(Circle(x - r * 0.3, y, r * 0.78, c));
  out.push(Circle(x + r * 0.3, y, r * 0.78, c));
  out.push(Circle(x, y + r * 0.12, r * 0.8, c));
  out.push(Circle(x - r * 0.38, y - r * 0.25, r * 0.22, "rgba(255,255,255,0.45)"));
  out.push(Line([[x, y - r * 0.55], [x + r * 0.1, y - r * 1.05]], "#6c584c", Math.max(2, r * 0.14)));
  out.push(Poly([[x + r * 0.1, y - r * 0.85], [x + r * 0.55, y - r * 1.1], [x + r * 0.5, y - r * 0.8]], "#2d6a4f"));
  out.push(Box(x - r * 0.05, y + r * 0.62, r * 0.1, r * 0.1, d, 1));
  return out;
}

// px per cm on the line, so sizes can be compared by eye
const PX = 1.9;
function ThingArt(it: Item, x: number, y: number, s: number, sliced: boolean): any[] {
  const r = Math.max(3, it.cm * PX * s);
  if (it.kind === "omena") {
    if (!sliced) return AppleArt(x, y, r, it.color);
    const c = COLOR[it.color][0];
    return [Circle(x - r * 0.5, y, r * 0.7, c), Circle(x - r * 0.45, y, r * 0.55, "#fff3d6"), Circle(x + r * 0.5, y, r * 0.7, c), Circle(x + r * 0.45, y, r * 0.55, "#fff3d6")];
  }
  if (it.kind === "kirsikka") {
    const k = Math.max(3, r * 1.1);
    return [Line([[x - k * 0.6, y], [x + k * 0.2, y - k * 2.2], [x + k * 0.9, y]], "#6c584c", 2), Circle(x - k * 0.6, y, k, "#c1121f"), Circle(x + k * 0.9, y, k, "#c1121f"), Circle(x - k * 0.9, y - k * 0.3, k * 0.3, "rgba(255,255,255,0.5)")];
  }
  if (it.kind === "pallo") {
    // a foam ball: as red and big as an apple, but no stem and soft dimples
    const rr = r * 0.85;
    return [Circle(x, y, rr, "#e63946"), Circle(x - rr * 0.35, y - rr * 0.35, rr * 0.25, "rgba(255,255,255,0.45)"), Circle(x + rr * 0.3, y + rr * 0.2, rr * 0.12, "#c1121f"), Circle(x - rr * 0.1, y + rr * 0.45, rr * 0.1, "#c1121f"), Circle(x + rr * 0.45, y - rr * 0.25, rr * 0.1, "#c1121f")];
  }
  // a pumpkin: too big for the belt picture, so drawn a bit smaller than the scale says
  const f = Math.min(r * 0.7, 30 * s + 6);
  return [Circle(x - f * 0.45, y + f * 0.05, f * 0.7, "#e85d04"), Circle(x + f * 0.45, y + f * 0.05, f * 0.7, "#e85d04"), Circle(x, y, f * 0.75, "#f48c06"), Box(x - f * 0.1, y - f * 0.95, f * 0.2, f * 0.3, "#386641", 2)];
}

function Cross(x: number, y: number, r: number) {
  return [Line([[x - r, y - r], [x + r, y + r]], "#d62828", 4), Line([[x + r, y - r], [x - r, y + r]], "#d62828", 4)];
}
function Tick(x: number, y: number, r: number) {
  return [Line([[x - r, y], [x - r * 0.3, y + r * 0.7], [x + r, y - r * 0.7]], "#06d6a0", 4)];
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
    // a stack of boxes (shop) or bottles (juice) that grows
    const k = Math.min(6, n);
    for (let i = 0; i < Math.max(1, k); i++) {
      const bx = x - 16 + (i % 2) * 18, by = y + 30 - Math.floor(i / 2) * 15;
      if (kind === "kauppa") out.push(Box(bx - 8, by, 17, 14, i < k ? "#d4a373" : "rgba(212,163,115,0.3)", 2));
      else { out.push(Box(bx - 6, by + 2, 13, 12, i < k ? "#ffb703" : "rgba(255,183,3,0.3)", 4)); out.push(Box(bx - 3, by - 2, 6, 5, i < k ? MINT : "rgba(143,211,199,0.3)", 2)); }
    }
  }
  const label = kind === "pois" ? "🗑️" : kind === "kauppa" ? "🛒" : "🧃";
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
  out.push(Box(width - 60, 112, 14, BY - 200, TEAL, 7));
  out.push(Box(width - 92, BY - 96, 46, 14, TEAL, 7));
  const ty = 172;
  out.push(Box(10, ty, CX + 50, 5, TEAL, 2)); out.push(Box(10, ty + 13, CX + 50, 5, TEAL, 2));
  const pts: number[][] = [];
  for (let x = 10; x <= CX + 60; x += 14) pts.push([x, (x / 14) % 2 < 1 ? ty + 3 : ty + 15]);
  out.push(Line(pts, TEAL, 2));
  for (const lx of [30, width - 130, width - 24]) { out.push(Line([[lx, 112], [lx, 128]], TEAL, 2)); out.push(Poly([[lx - 8, 134], [lx + 8, 134], [lx + 4, 128], [lx - 4, 128]], TEAL)); out.push(Circle(lx, 136, 4, ORANGE)); }
  out.push(Box(0, BY + 80, width, 6, TEAL, 0));
  return out;
}

function props(): string[] { return demo ? ["vari", "koko", "paino"] : propsFor(K.level); }
function curRule(): Rule { return demo ? DEMO_RULE : rule; }
function dest(): string { return demo ? "kauppa" : order.dest; }

// the control panel: its screen says what the last check said, and a lamp
// for each sensor (colour camera, size gate, scale) lights while it measures
function Panel(x: number) {
  const out: any[] = [];
  const top = BY - 92;
  const bulbs = ["#9be564", PLUM, ORANGE];
  for (let i = 0; i < 3; i++) out.push(Box(x + (i - 1) * 16 - 5, top - 9, 10, 10, bulbs[i], 5));
  out.push(Box(x - 30, top, 60, 90, TEAL, 8));
  const fresh = (phase === "run" || demo) && K.t - flash.t < 0.6 || paused && insp && insp === flash.th;
  out.push(Box(x - 22, top + 8, 44, 26, fresh ? (flash.ok ? "#b7efc5" : "#ffb3c1") : MINT, 4));
  out.push(<div className="emoji" style={{ left: x - 22, top: top + 8, width: 44, height: 26, fontSize: 18 }}>{fresh ? (flash.ok ? "✓" : "✗") : "…"}</div>);
  const ps = props();
  ps.forEach((p, k) => {
    const sx = x - 28 + k * 19;
    out.push(Box(sx, top + 42, 18, 18, fresh ? "#ffd166" : "#4f6d78", 4));
    out.push(<div className="emoji" style={{ left: sx, top: top + 42, width: 18, height: 18, fontSize: 11 }}>{ICON[p]}</div>);
  });
  out.push(Box(x - 18, top + 70, 36, 10, MINT, 3));
  // the scale under the belt at the filter
  if (ps.indexOf("paino") >= 0) { out.push(Box(x - 20, BY + 22, 40, 8, "#4f6d78", 2)); out.push(Box(x - 4, BY + 30, 8, 10, "#4f6d78", 0)); }
  return out;
}

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
  const a = (phase === "run" || demo) && !paused && K.t - jamT > 2 ? K.t * 12 : 0;
  out.push(Poly(star(x, y - 46, 12, 4, 4, a), "#e9ecef"));
  out.push(Circle(x + 22, y - 62, 5, K.t - jamT < 2 ? "#d62828" : "#9be564"));
  if (K.t - jamT < 3) for (let k = 0; k < 4; k++) { const t = (K.t * 0.8 + k * 0.25) % 1; out.push(Circle(x - 10 + k * 7 + Math.sin(t * 6 + k) * 6, y - 110 - t * 50, 8 + t * 10, "rgba(108,117,125," + (0.6 - t * 0.5).toFixed(2) + ")")); }
  return out;
}

// ---- the parts of a rule ----------------------------------------------------------------

const PNAME: any = { vari: rg.t("väri", "colour", "color"), koko: rg.t("koko", "size", "tamaño"), paino: rg.t("paino", "weight", "peso") };
const OPNAME: any = { on: rg.t("on", "is", "es"), ei: rg.t("ei ole", "is not", "no es"), yli: rg.t("suurempi kuin", "more than", "más que"), alle: rg.t("pienempi kuin", "less than", "menos que") };
const VNAME: any = {
  punainen: "🔴 " + rg.t("punainen", "red", "rojo"), vihrea: "🟢 " + rg.t("vihreä", "green", "verde"), keltainen: "🟡 " + rg.t("keltainen", "yellow", "amarillo"),
  kirsikka: "🍒 " + rg.t("kirsikka", "cherry", "cereza"), tennis: "🎾 " + rg.t("tennispallo", "tennis ball", "pelota"), meloni: "🍉 " + rg.t("meloni", "melon", "melón"), kurpitsa: "🎃 " + rg.t("kurpitsa", "pumpkin", "calabaza"),
};
const VICON: any = { punainen: "🔴", vihrea: "🟢", keltainen: "🟡", kirsikka: "🍒", tennis: "🎾", meloni: "🍉", kurpitsa: "🎃" };
const OPICON: any = { on: "=", ei: "≠", yli: ">", alle: "<" };
const CNAME: any = { kirsikka: "KIRSIKKA", tennis: "TENNISPALLO", meloni: "MELONI", kurpitsa: "KURPITSA" };

function refText(p: string, v: string): string {
  if (p === "koko") return SIZE[v] + " cm";
  if (p === "paino") return WEIGHT[v] >= 1000 ? WEIGHT[v] / 1000 + " kg" : WEIGHT[v] + " g";
  return "";
}
function measure(it: Item, p: string): string {
  if (p === "vari") return VNAME[it.color] || "🟠 " + rg.t("oranssi", "orange", "naranja");
  if (p === "koko") return it.cm.toFixed(1).replace(".0", "") + " cm";
  return it.g >= 1000 ? (it.g / 1000).toFixed(1) + " kg" : it.g + " g";
}
function condCode(c: Cond): string {
  if (c.p === "vari") return "o.vari " + (c.op === "on" ? "==" : "!=") + " \"" + c.v + "\"";
  return "o." + c.p + " " + OPICON[c.op] + " " + CNAME[c.v] + "." + c.p;
}
function condShort(c: Cond): string {
  return ICON[c.p] + " " + OPICON[c.op] + " " + VICON[c.v] + (c.p === "vari" ? "" : " " + refText(c.p, c.v));
}

function editable(): boolean { return (phase === "edit" || phase === "boss") && K.solved < 0; }

function openPicker(row: number, part: string) {
  if (!editable()) return;
  if (part !== "p" && rule[row].p === "") part = "p";
  picker = { row, part };
  rg.sound("click");
  rg.say(part === "p" ? "ol_k_mika" : part === "op" ? "ol_k_miten" : "ol_k_mihin");
}

function pick(val: string) {
  const c = rule[picker.row];
  rg.sound("click"); rg.vibrate(10);
  if (picker.part === "p") {
    if (c.p !== val) { c.p = val; const ops = opsFor(val, K.level); c.op = ops.length === 1 ? ops[0] : ""; c.v = ""; }
  } else if (picker.part === "op") c.op = val;
  else c.v = val;
  rg.say("ol_c_" + val);
  if (phase === "boss") phase = "edit";
  // go on to the next empty part of the row
  picker = c.op === "" ? { row: picker.row, part: "op" } : c.v === "" ? { row: picker.row, part: "v" } : null;
}

function addRow() {
  if (!editable() || rule.length >= maxRows(K.level)) return;
  rule.push({ p: "", op: "", v: "" });
  rg.sound("pop");
  openPicker(rule.length - 1, "p");
}

function delRow(i: number) {
  if (!editable()) return;
  rule.splice(i, 1);
  if (!rule.length) rule.push({ p: "", op: "", v: "" });
  rg.sound("whoosh");
  if (phase === "boss") phase = "edit";
}

function RuleCard(y: number) {
  const out: any[] = [];
  const lh = 44, n = rule.length;
  const h = n * lh + 102;
  out.push(<div className="card" style={{ left: 12, top: y, width: width - 24, height: h, backgroundColor: "#1d3557" }} />);
  const lit = phase === "run" && (K.t - flash.t < 0.7 || paused && insp === flash.th) ? flash : null;
  const by = y + 10 + n * lh;
  out.push(<div className="pad" id="code" onClick={() => { code = !code; picker = null; rg.sound("click"); }} style={{ left: width - 70, top: by, width: 50, height: 30, backgroundColor: code ? "#ffd166" : "#457b9d" }}><div className="tiny" style={{ left: 0, top: 6, width: 50, height: 18, color: code ? "#1d3557" : "#ffffff" }}>{"</>"}</div></div>);
  if (code) {
    const conds = rule.filter((c) => complete(c)).map(condCode);
    const lines = ["function suodatin(o) {", "  if (" + (conds.length ? conds.join(" &&\n      ") : "true") + ")", "    return ETEENPAIN", "  return POIS", "}"];
    let ly = y + 8;
    for (const l of lines) for (const part of l.split("\n")) {
      let sp = 0;
      while (part.charAt(sp) === " ") sp++;
      out.push(<div className="codeline" style={{ left: 22 + sp * 7, top: ly, width: width - 44 - sp * 7, height: 20 }}>{part.substring(sp)}</div>);
      ly += 20;
    }
    return out;
  }
  const x0 = 50, x1 = width - 50, gap = 4, tw = x1 - x0 - gap * 2;
  const w0 = Math.floor(tw * 0.29), w1 = Math.floor(tw * 0.36), w2 = tw - w0 - w1;
  rule.forEach((c, i) => {
    const ry = y + 10 + i * lh;
    const red = lit && lit.row === i;
    out.push(<div className="kw" style={{ left: 18, top: ry + 8, width: 32, height: 24 }}>{i === 0 ? rg.t("jos", "if", "si") : rg.t("ja", "and", "y")}</div>);
    const tok = (part: string, x: number, w: number, text: string) => {
      const sel = picker && picker.row === i && picker.part === part;
      const cls = red ? "chip bad" : sel ? "chip sel" : text === "?" ? "chip ask" : "chip on";
      out.push(<div className={cls} id={"t" + i + part} onClick={() => openPicker(i, part)} style={{ left: x, top: ry, width: w, height: lh - 6 }}><div className={text.length > 10 ? "chiptext small" : "chiptext"}>{text}</div></div>);
    };
    tok("p", x0, w0, c.p ? ICON[c.p] + " " + PNAME[c.p] : "?");
    tok("op", x0 + w0 + gap, w1, c.op ? OPNAME[c.op] : "?");
    tok("v", x0 + w0 + w1 + gap * 2, w2, c.v ? VNAME[c.v] : "?");
    if (n > 1 || complete(c)) out.push(<div className="pad" id={"del" + i} onClick={() => delRow(i)} style={{ left: x1 + 4, top: ry + 5, width: 28, height: 28, backgroundColor: "#457b9d" }}><div className="tiny" style={{ left: 0, top: 4, width: 28, height: 20, color: "#ffffff" }}>✕</div></div>);
    if (K.t - hintT < 6 && hintRow === i) {
      const k = !complete(c) ? (c.p === "" ? 0 : c.op === "" ? 1 : 2) : 0;
      out.push(PointAt(x0 + [w0 / 2, w0 + w1 / 2, w0 + w1 + w2 / 2][k], ry + 4, "#ffd166"));
    }
  });
  if (n < maxRows(K.level)) {
    out.push(<div className="pad" id="add" onClick={() => addRow()} style={{ left: 50, top: by, width: 110, height: 30, backgroundColor: "#457b9d" }}><div className="tiny" style={{ left: 0, top: 6, width: 110, height: 18, color: "#ffffff" }}>{"+ " + rg.t("ja …", "and …", "y …")}</div></div>);
    if (K.t - hintT < 6 && hintRow === -2) out.push(PointAt(105, by, "#ffd166"));
  }
  const ay = by + 36;
  const pass = lit && lit.ok;
  out.push(<div className={pass ? "kw ok" : "kw"} style={{ left: 30, top: ay, width: width - 60, height: 26 }}>{"→ " + rg.t("eteenpäin ✅", "go on ✅", "adelante ✅")}</div>);
  out.push(<div className={lit && !lit.ok ? "kw no" : "kw"} style={{ left: 30, top: ay + 28, width: width - 60, height: 26 }}>{rg.t("muuten → pois 🗑️", "else → off 🗑️", "si no → fuera 🗑️")}</div>);
  return out;
}

// the choices for one part of a row, just above the row
function Picker() {
  if (!picker) return [];
  const out: any[] = [];
  const c = rule[picker.row];
  const opts = picker.part === "p" ? propsFor(K.level) : picker.part === "op" ? opsFor(c.p, K.level) : valuesFor(c.p);
  out.push(<div className="hit" id="pkclose" onClick={() => { picker = null; }} style={{ left: 0, top: 0, width, height }} />);
  const py = BY + 10 + picker.row * 44;
  out.push(<div className="card" style={{ left: 12, top: py, width: width - 24, height: 88, backgroundColor: "#fff8e1" }} />);
  const n = opts.length, w = Math.floor((width - 40 - (n - 1) * 8) / n);
  opts.forEach((o, k) => {
    const x = 20 + k * (w + 8);
    const on = picker.part === "p" ? c.p === o : picker.part === "op" ? c.op === o : c.v === o;
    const big = picker.part === "p" ? ICON[o] : picker.part === "op" ? OPICON[o] : VICON[o];
    const label = picker.part === "p" ? PNAME[o] : picker.part === "op" ? OPNAME[o] : VNAME[o].substring(VNAME[o].indexOf(" ") + 1);
    out.push(<div className="opt" id={"o" + o} onClick={() => pick(o)} style={{ left: x, top: py + 8, width: w, height: 72, backgroundColor: on ? "#ffd166" : "#ffffff" }}>
      <div className="optbig">{big}</div>
      <div className="optlabel">{label}</div>
      {picker.part === "v" && c.p !== "vari" ? <div className="optref">{refText(c.p, o)}</div> : null}
    </div>);
  });
  return out;
}

// ---- the line ---------------------------------------------------------------------------

function sayOrder() { rg.say(K.question === 0 ? ["ol_l" + (K.level + 1), "ol_o_" + order.id] : ["ol_o_" + order.id]); }

function next() {
  const s = step();
  demo = false;
  order = ORDERS[K.level][K.question % 3];
  items = batch(order, s, () => rg.random());
  speed = [62, 74, 88][s];
  // the rule stays from order to order on a challenge, so it is changed, not rewritten
  if (K.question === 0) rule = [{ p: "", op: "", v: "" }];
  hintT = -10; K.wait = 3.4; picker = null; code = false; doneMarked = false;
  reset();
  phase = "order"; bossT = K.t;
  sayOrder();
}

function reset() {
  things = []; spawned = 0; jamT = -10; paused = false; insp = null;
  counts = { pois: 0, kauppa: 0, mehu: 0 };
}

function incomplete(): number {
  for (let i = 0; i < rule.length; i++) if (!complete(rule[i])) return i;
  return -1;
}

function run(step1: boolean) {
  if (K.solved >= 0) return;
  if (phase === "run") {
    // while running: ▶ pauses and goes on, 👣 goes on to the next thing at the filter
    if (step1) { stepping = true; paused = false; insp = null; }
    else if (paused) { paused = false; stepping = false; insp = null; }
    else paused = true;
    rg.sound("click");
    return;
  }
  picker = null;
  const bad = incomplete();
  if (bad >= 0) { hintRow = bad; hintT = K.t; rg.say("ol_v_kesken"); rg.sound("wrong"); return; }
  reset();
  phase = "run"; stepping = step1;
  rg.sound("whoosh");
}

function inspect(t: Thing) {
  insp = t;
  if (phase === "run") paused = true;
  rg.sound("click");
}

function sim(dt: number) {
  if (demo) { introT += dt; if (K.mode !== "menu") return; }
  else if (K.mode !== "play" || phase !== "run") return;
  if (paused) return;
  if (K.t - jamT < 2.2) return;
  if (jamT > 0) { finish(); return; }
  if (demo && spawned >= items.length) { items = demoBatch(); spawned = 0; }
  const room = things.every((t) => t.state !== "belt" || t.x > 58);
  if (spawned < items.length && room) { things.push({ it: items[spawned], x: -20, y: BY - 18, vy: 0, state: "belt", sliced: false, why: "", row: -1 }); spawned++; }
  for (const t of things) {
    if (t.state === "belt" || t.state === "on" || t.state === "reject") {
      const before = t.x;
      t.x += speed * dt;
      if (t.state === "belt" && before < FX && t.x >= FX) {
        t.x = FX;
        const row = check(t.it, curRule());
        t.row = row;
        flash = { row, ok: row < 0, t: K.t, th: t };
        t.state = row < 0 ? "on" : "reject";
        rg.sound(row < 0 ? "tick" : "wrong");
        if (stepping && !demo) { paused = true; insp = t; rg.say(row < 0 ? "ol_eteen" : "ol_pois"); return; }
      }
      if (t.state === "reject" && before < CX && t.x >= CX) { t.x = CX; t.state = "grab"; t.vy = 0; rg.sound("click"); continue; }
      if (t.state === "on" && before < SX() && t.x >= SX()) {
        if (jams(t.it)) { jamT = K.t; t.x = SX(); t.state = "jam"; rg.sound("hit"); rg.vibrate(200); return; }
        t.sliced = true; rg.sound("hit");
      }
      if (t.state === "on" && t.x >= EX()) { t.state = "fall"; t.vy = 0; }
    } else if (t.state === "grab") {
      // vy is the claw's clock: up off the belt, then down in front of it into the cart
      t.vy += dt;
      const a = t.vy;
      if (a < 0.3) t.y = BY - 18 - a / 0.3 * 46;
      else if (a < 0.75) t.y = BY - 64 + (a - 0.3) / 0.45 * (BIN_Y + 12 - BY + 64);
      else { counts.pois++; t.state = "inbin"; rg.sound("pop"); }
    } else if (t.state === "fall") {
      t.vy += 900 * dt; t.y += t.vy * dt;
      t.x = Math.max(binX(), t.x - 140 * dt);
      if (t.y > BIN_Y + 10) { counts[dest()]++; t.state = "out"; }
    }
  }
  if (demo) { things = things.filter((t) => t.state !== "inbin" && t.state !== "out"); if (counts.pois > 9) counts = { pois: 0, kauppa: 0, mehu: 0 }; return; }
  if (spawned >= items.length && things.every((t) => t.state === "inbin" || t.state === "out")) finish();
}

function binX() { return width - 60; }

function demoBatch(): Item[] {
  const out: Item[] = [];
  for (let k = 0; k < 6; k++) out.push(apple(rg.pick(["punainen", "punainen", "vihrea", "keltainen"]), rg.random() < 0.3, rg.random()));
  return out;
}

// where to point for a complaint: the row about that property, or "+ ja"
function rowFor(worst: string, list: Item[]): number {
  if (worst === "hukka") {
    const it = list.find((it) => wanted(it, order) && check(it, rule) >= 0);
    return it ? check(it, rule) : -1;
  }
  const p = worst === "jumi" ? "paino" : worst;
  const i = rule.findIndex((c) => c.p === p);
  if (i >= 0) return i;
  return rule.length < maxRows(K.level) ? -2 : 0;
}

// the boss comes to look at what came out
function finish() {
  phase = "boss"; bossT = K.t; paused = false; stepping = false; insp = null;
  const found: string[] = [];
  for (const t of things) {
    if (t.state !== "inbin" && t.state !== "out" && t.state !== "jam") continue;
    t.why = verdict(t.it, t.state !== "inbin", order);
    if (t.why) found.push(t.why);
  }
  let worst = "";
  for (const w of ["jumi", "paino", "koko", "vari", "hukka"]) if (!worst && found.indexOf(w) >= 0) worst = w;
  bossSay = worst;
  if (!worst) { win(width / 2, 180, ["ol_pomo_hyva"]); return; }
  const n = miss();
  const say = ["ol_pomo_" + worst];
  if (n >= 2) { hintRow = rowFor(worst, items); hintT = K.t + 3; say.push("ol_v_" + worst); }
  say.push("ol_korjaa");
  rg.say(say);
}

// the hint is about the symptom: what would go wrong with this batch
function hint() {
  rg.sound("click");
  if (phase === "order") { sayOrder(); return; }
  const bad = incomplete();
  hintT = K.t;
  if (bad >= 0) { hintRow = bad; rg.say("ol_v_kesken"); return; }
  const worst = judge(items, rule, order);
  if (!worst) { hintRow = -1; rg.say("ol_v_valmis"); return; }
  hintRow = rowFor(worst, items);
  rg.say("ol_v_" + worst);
}

function onBack() {
  if (picker) { picker = null; return; }
  if (insp) { insp = null; return; }
  phase = "edit"; back();
}

// ---- screens -----------------------------------------------------------------------------

// what the boss wants, shown with things from this batch: a good one ✓, and
// one each that the order's rows stop ✗
function examples(): { it: Item; ok: boolean }[] {
  const out: { it: Item; ok: boolean }[] = [];
  const good = items.find((it) => wanted(it, order));
  if (good) out.push({ it: good, ok: true });
  for (const c of order.conds) { const it = items.find((it) => !holds(it, c) && out.every((e) => e.it !== it)); if (it) out.push({ it, ok: false }); }
  return out;
}

function Goal() {
  const out: any[] = [];
  out.push(<div className="card" style={{ left: 12, top: 116, width: width - 24, height: 48 }} />);
  out.push(<div className="tiny" style={{ left: 16, top: 120, width: 70, height: 40 }}>{rg.t("Pomo haluaa:", "Boss wants:", "El jefe quiere:")}</div>);
  let x = 106;
  for (const e of examples()) {
    for (const el of ThingArt(e.it, x, 142, 0.75, false)) out.push(el);
    for (const el of e.ok ? Tick(x + 12, 152, 6) : Cross(x + 12, 152, 6)) out.push(el);
    x += 48;
  }
  out.push(<div className="emoji" style={{ left: width - 56, top: 124, width: 36, height: 32, fontSize: 22 }}>{order.dest === "kauppa" ? "🛒" : "🧃"}</div>);
  out.push(<div className="hit" id="goal" onClick={() => sayOrder()} style={{ left: 12, top: 116, width: width - 24, height: 48 }} />);
  return out;
}

function LineView() {
  const out: any[] = [];
  for (const e of Hall()) out.push(e);
  out.push(Box(4, BY - 2, width - 8, 24, ORANGE, 12));
  out.push(Box(6, BY, width - 12, 20, "#26333d", 10));
  const spin = (phase === "run" || demo) && !paused && K.t - jamT > 2.2 ? K.t * speed / 9 : 0;
  for (let x = 20; x < width - 14; x += 30) {
    out.push(Circle(x, BY + 10, 7, "#6b8a96"));
    out.push(Circle(x + Math.cos(spin) * 3.5, BY + 10 + Math.sin(spin) * 3.5, 2, "#e6eeeb"));
  }
  for (const e of Bin(CX, BIN_Y, 50, "pois", counts.pois || 0)) out.push(e);
  for (const e of Bin(binX(), BIN_Y, 48, dest(), counts[dest()] || 0)) out.push(e);
  for (const e of Slicer(SX(), BY)) out.push(e);
  out.push(<div className="tag" style={{ left: SX() - 40, top: BY - 77, width: 80, height: 14 }}>{rg.t("leikkuri", "slicer", "cortadora")}</div>);
  for (const e of Panel(FX)) out.push(e);
  out.push(<div className="tag" style={{ left: FX - 40, top: BY - 23, width: 80, height: 16 }}>{rg.t("suodatin", "filter", "filtro")}</div>);
  let held: any = null;
  for (const t of things) {
    if (t.state === "inbin" || t.state === "out") continue;
    if (t.state === "grab") { held = t; continue; }
    for (const e of ThingArt(t.it, t.x, t.y, 1, t.sliced)) out.push(e);
    if (insp === t) out.push(Circle(t.x, t.y + 22, 4, "#ffd166"));
  }
  for (const e of Claw(held)) out.push(e);
  if (held) for (const e of ThingArt(held.it, held.x, held.y, 1, false)) out.push(e);
  // tapping a thing on the line shows what the filter thinks of it
  if (!demo) things.forEach((t, i) => {
    if (t.state === "inbin" || t.state === "out") return;
    out.push(<div className="hit" id={"th" + i} onClick={() => inspect(t)} style={{ left: t.x - 20, top: t.y - 24, width: 40, height: 44 }} />);
  });
  return out;
}

// the thing being looked at: what the sensors say and how each row judges it
function Inspector() {
  const t = insp;
  if (!t) return [];
  const out: any[] = [];
  const y0 = 114, h = 132;
  out.push(<div className="card" style={{ left: 8, top: y0, width: width - 16, height: h, backgroundColor: "#fffdf5" }} />);
  for (const e of ThingArt(t.it, 40, y0 + 50, Math.min(1.6, 26 / (t.it.cm * PX)), false)) out.push(e);
  props().forEach((p, k) => {
    out.push(<div className="mtext" style={{ left: 74, top: y0 + 8 + k * 24, width: 112, height: 22 }}>{ICON[p] + " " + measure(t.it, p)}</div>);
  });
  const r = curRule();
  let fail = -1;
  r.forEach((c, i) => {
    if (!complete(c)) return;
    const after = fail >= 0;              // the filter stopped looking already
    const ok = holds(t.it, c);
    if (!ok && fail < 0) fail = i;
    out.push(<div className={after ? "etext off" : ok ? "etext" : "etext bad"} style={{ left: 186, top: y0 + 8 + i * 24, width: width - 230, height: 22 }}>{condShort(c) + (after ? "" : ok ? " ✓" : " ✗")}</div>);
  });
  const ly = y0 + 8 + Math.max(1, r.length) * 24 + 4;
  out.push(<div className={fail < 0 ? "etext res" : "etext res no"} style={{ left: 186, top: ly, width: width - 200, height: 24 }}>{fail < 0 ? "→ ✅ " + rg.t("eteenpäin", "go on", "adelante") : "→ 🗑️ " + rg.t("pois", "off", "fuera")}</div>);
  if (t.why) out.push(<div className="etext bad" style={{ left: 20, top: y0 + h - 28, width: width - 40, height: 22 }}>{t.why === "hukka" ? rg.t("😟 Pomo olisi halunnut tämän", "😟 The boss wanted this one", "😟 El jefe quería esta") : rg.t("😟 Tämän ei olisi pitänyt mennä läpi", "😟 This should not have gone through", "😟 Esta no debía pasar")}</div>);
  out.push(<div className="pad" id="iclose" onClick={() => { insp = null; rg.sound("click"); }} style={{ left: width - 44, top: y0 + 6, width: 30, height: 30, backgroundColor: "#adb5bd" }}><div className="tiny" style={{ left: 0, top: 5, width: 30, height: 20, color: "#ffffff" }}>✕</div></div>);
  return out;
}

// the boss: first telling the order, then judging what came out
function BossView() {
  const out: any[] = [];
  const a = Math.min(1, (K.t - bossT) * 3);
  out.push(<div style={{ position: "absolute", left: 0, top: 112, width, height: BY - 40, backgroundColor: "rgba(255,255,255," + (0.88 * a).toFixed(2) + ")" }} />);
  const bx = -40 + 100 * a;
  for (const e of Boss(bx, 170, phase === "order" || !bossSay)) out.push(e);
  out.push(<div className="bubble" style={{ left: 104, top: 120, width: width - 116, height: 132 }} />);
  if (phase === "order") {
    // the order as pictures: the good thing goes to the shop, the others are taken off
    examples().forEach((e, i) => {
      const x = 134 + (i % 3) * 64, y = 160;
      for (const el of ThingArt(e.it, x, y, 1.1, false)) out.push(el);
      for (const el of e.ok ? Tick(x + 16, y + 20, 8) : Cross(x + 16, y + 20, 8)) out.push(el);
    });
    out.push(<div className="tiny" style={{ left: 112, top: 208, width: width - 132, height: 36 }}>{"✓ → " + (order.dest === "kauppa" ? "🛒" : "🧃") + "     ✗ → 🗑️"}</div>);
    out.push(<div className="pad" id="ok" onClick={() => { phase = "edit"; rg.sound("click"); }} style={{ left: width / 2 - 70, top: BY - 12, width: 140, height: 44, backgroundColor: "#06d6a0" }}><div className="padtext">👍</div></div>);
    return out;
  }
  const bad = things.filter((t) => t.why);
  if (!bad.length) out.push(<div className="big" style={{ left: 104, top: 140, width: width - 116, height: 90 }}>👍 ✨</div>);
  bad.slice(0, 6).forEach((t, i) => {
    const x = 134 + (i % 3) * 64, y = 156 + Math.floor(i / 3) * 52;
    for (const e of ThingArt(t.it, x, y, 0.9, false)) out.push(e);
    out.push(<div className="emoji" style={{ left: x + 8, top: y - 4, width: 26, height: 24, fontSize: 16 }}>{t.why === "hukka" ? "🗑️" : t.why === "jumi" ? "💥" : "❗"}</div>);
    out.push(<div className="hit" id={"bad" + i} onClick={() => inspect(t)} style={{ left: x - 24, top: y - 24, width: 50, height: 48 }} />);
  });
  return out;
}

function Controls() {
  const out: any[] = [];
  if (K.solved >= 0 || phase === "order") return out;
  const y = height - 66, w2 = 96, w1 = width - 36 - w2;
  let label = "▶ " + rg.t("Aja", "Run", "Marcha");
  if (phase === "run") label = paused ? "▶ " + rg.t("Jatka", "Go on", "Sigue") : "⏸ " + rg.t("Tauko", "Pause", "Pausa");
  else if (phase === "boss") label = "▶ " + rg.t("Uudestaan", "Again", "Otra vez");
  out.push(<div className="pad" id="run" onClick={() => run(false)} style={{ left: 12, top: y, width: w1, height: 54, backgroundColor: phase === "run" && !paused ? "#ffb703" : "#06d6a0" }}><div className="padtext">{label}</div></div>);
  out.push(<div className="pad" id="step" onClick={() => run(true)} style={{ left: 24 + w1, top: y, width: w2, height: 54, backgroundColor: "#118ab2" }}><div className="padtext">👣</div></div>);
  return out;
}

function Play() {
  const out: any[] = [];
  const text = phase === "order" ? rg.t("Pomo kertoo", "The boss says", "El jefe dice") : rg.t("Kirjoita suodattimen sääntö", "Write the filter's rule", "Escribe la regla del filtro");
  for (const e of Header(text, () => sayOrder(), () => hint())) out.push(e);
  for (const e of LineView()) out.push(e);
  for (const e of Goal()) out.push(e);
  if (phase === "order" || phase === "boss" && !insp) for (const e of BossView()) out.push(e);
  for (const e of Inspector()) out.push(e);
  for (const e of RuleCard(BY + 98)) out.push(e);
  for (const e of Controls()) out.push(e);
  for (const e of Picker()) out.push(e);
  return <div className="screen">{out}</div>;
}

// ---- the start: the line runs by itself while its parts are explained -----------------------

const INTRO = [
  { t: 0, say: "ol_i1", x: () => 30, y: BY - 30, text: rg.t("Omenat tulevat hihnaa pitkin.", "Apples come along the belt.", "Las manzanas llegan por la cinta.") },
  { t: 4.5, say: "ol_i2", x: () => FX, y: BY - 104, text: rg.t("Suodatin mittaa värin, koon ja painon.", "The filter measures colour, size and weight.", "El filtro mide color, tamaño y peso.") },
  { t: 10, say: "ol_i3", x: () => width / 2, y: BY + 104, text: rg.t("Sääntö päättää: eteenpäin vai pois.", "The rule decides: on or off.", "La regla decide: adelante o fuera.") },
  { t: 15, say: "ol_i4", x: () => CX, y: 168, text: rg.t("Koura nostaa pois hylätyt.", "The claw takes the rejected ones off.", "La garra quita las rechazadas.") },
  { t: 19.5, say: "ol_i5", x: () => SX(), y: BY - 104, text: rg.t("Leikkuri pilkkoo omenat. Sinä teet säännön!", "The slicer cuts the apples. You make the rule!", "La cortadora corta las manzanas. ¡Tú haces la regla!") },
];

function startDemo() {
  demo = true; introT = 0; introSaid = -1; things = []; spawned = 0; items = demoBatch(); speed = 60; phase = "edit";
  counts = { pois: 0, kauppa: 0, mehu: 0 }; paused = false; insp = null; jamT = -10; flash = { row: -1, ok: true, t: -10, th: null };
}

function firstOpen(): number { for (let i = 0; i < LEVELS.length; i++) if (!cleared[i]) return i; return 0; }

function Intro() {
  if (!demo) startDemo();
  const out: any[] = [];
  out.push(<div className="titlebox" style={{ left: 0, top: 18, width }}><div className="title">{rg.t("Omenalinjasto", "Apple line", "Línea de manzanas")}</div></div>);
  out.push(<div className="hintbtn" id="exit" onClick={() => rg.exit()} style={{ left: 10, top: 14 }}>←</div>);
  for (const e of LineView()) out.push(e);
  // the caption that goes with the part being explained
  let k = 0;
  for (let i = 0; i < INTRO.length; i++) if (introT >= INTRO[i].t) k = i;
  const seg = INTRO[k];
  if (introSaid !== k) { introSaid = k; rg.say(seg.say); }
  out.push(<div className="bubble" style={{ left: 16, top: 66, width: width - 32, height: 44 }}><div className="ctext">{seg.text}</div></div>);
  // the demo's rule, so the words above have a picture
  const ry = BY + 98;
  out.push(<div className="card" style={{ left: 12, top: ry, width: width - 24, height: 92, backgroundColor: "#1d3557" }} />);
  out.push(<div className="kw" style={{ left: 22, top: ry + 14, width: 36, height: 24 }}>{rg.t("jos", "if", "si")}</div>);
  const lit = K.t - flash.t < 0.7;
  out.push(<div className={lit && !flash.ok ? "chip bad" : "chip on"} style={{ left: 60, top: ry + 8, width: width - 96, height: 36 }}><div className="chiptext">{"🎨 " + PNAME.vari + " " + OPNAME.on + " " + VNAME.punainen}</div></div>);
  out.push(<div className={lit && flash.ok ? "kw ok" : "kw"} style={{ left: 30, top: ry + 54, width: width - 60, height: 26 }}>{"→ " + rg.t("eteenpäin ✅   muuten 🗑️", "go on ✅   else 🗑️", "adelante ✅   si no 🗑️")}</div>);
  out.push(PointAt(seg.x(), seg.y, "#ffd166"));
  // start, and the challenges done so far
  const open = firstOpen();
  out.push(<div className="pad" id="start" onClick={() => start(open)} style={{ left: 40, top: height - 150, width: width - 80, height: 64, backgroundColor: "#06d6a0" }}><div className="padtext">{"▶ " + rg.t("Aloita", "Start", "Empezar")}</div></div>);
  const n = LEVELS.length, dw = 56, x0 = width / 2 - (n * dw) / 2;
  for (let i = 0; i < n; i++) {
    const can = i <= open || cleared[i] || (i > 0 && cleared[i - 1]);
    const x = x0 + i * dw;
    out.push(<div className="pad" id={"lv" + i} onClick={() => { if (can) start(i); }} style={{ left: x + 4, top: height - 74, width: dw - 8, height: 46, backgroundColor: cleared[i] ? "#06d6a0" : i === open ? "#3a86ff" : "#c6dcf2" }}><div className="lvicon">{LEVEL_ICON[i]}</div></div>);
  }
  return <div className="screen">{out}</div>;
}

setup(rg.t("Omenalinjasto", "Apple line", "Línea de manzanas"), LEVELS, 3, next);

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode === "done" && !doneMarked) { doneMarked = true; cleared[K.level] = 1; rg.save("cleared", cleared); }
  if (K.mode !== "menu" && demo) demo = false;
  sim(dt);
}

function view() {
  let body;
  if (K.mode === "menu") body = Intro();
  else if (K.mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
