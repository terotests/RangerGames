// Vipuvaaka: a science game about the lever. A beam rests on a fulcrum and
// has four hooks on each side (distance 1–4 from the middle). Weights
// (1–5 kg) and a bucket of water hang from the hooks. Each side turns the
// beam with its torque, mass × distance; the beam tilts toward the side
// that turns harder and levels out when both sides are equal.
//
// The player balances it in three ways: by adding weights from the tray,
// by moving weights to another hook, and by pouring water into the bucket
// (1 litre = 1 kg). Arrows show each side's torque at the top, a red arrow
// under every hanging stack shows its weight, and the sums are written out
// ("2×3 = 6").

type Mode = "menu" | "play";
type Item = {
  id: number; kind: "w" | "b"; m: number; water: number; cap: number;
  peg: number;            // signed distance: left < 0 < right, 0 = in the tray
  tray: boolean;          // came from the tray (dropping it off the beam puts it back)
  locked: boolean;
  dx: number; dy: number; // the drag position (top left)
};
type Level = {
  kind: "add" | "move" | "water" | "mix" | "free";
  title: string[];
  hint: string[];
  items: { m?: number; at?: number; locked?: boolean; bucket?: boolean; cap?: number; water?: number }[];
};
type Box = { it: Item; x: number; y: number; w: number; h: number };

const U = 36;               // pixels per unit of distance on the beam
const BEAM = 2 * 4 * U + 34;
const MAX_ANG = 14;         // degrees
const POUR = 0.5;           // litres a second
const STEP = 0.1;           // litres: the water counts in tenths, a tap on Pour adds one
const COLORS = ["", "#8ecae6", "#219ebc", "#ffb703", "#fb8500", "#e63946"];
const KIND_ICON: { [k: string]: string } = { add: "➕", move: "↔️", water: "💧", mix: "🧩", free: "🎈" };

const L = (fi: string, en: string, es: string) => [fi, en, es];
const LEVELS: Level[] = [
  { kind: "add", title: L("Sama paino, sama matka", "Same weight, same distance", "Mismo peso, misma distancia"),
    hint: L("Ripusta 2 kg yhtä kauas keskeltä kuin toinen 2 kg.", "Hang the 2 kg as far from the middle as the other 2 kg.", "Cuelga los 2 kg tan lejos del centro como los otros 2 kg."),
    items: [{ m: 2, at: -2, locked: true }, { m: 2 }] },
  { kind: "add", title: L("Raskas lähemmäs", "Heavy goes closer", "Lo pesado, más cerca"),
    hint: L("Vasen vääntää 2 × 3 = 6. Millä etäisyydellä 3 kg vääntää myös 6?", "The left turns with 2 × 3 = 6. At what distance does 3 kg also make 6?", "La izquierda gira con 2 × 3 = 6. ¿A qué distancia 3 kg también hace 6?"),
    items: [{ m: 2, at: -3, locked: true }, { m: 3 }] },
  { kind: "move", title: L("Siirrä punnusta", "Move the weight", "Mueve la pesa"),
    hint: L("Kevyt punnus vääntää enemmän, kun se on kauempana. 4 × 1 = 1 × ?", "A light weight turns more when it is farther out. 4 × 1 = 1 × ?", "Una pesa ligera gira más cuanto más lejos está. 4 × 1 = 1 × ?"),
    items: [{ m: 4, at: -1, locked: true }, { m: 1, at: 1 }] },
  { kind: "move", title: L("Löydä oikea koukku", "Find the right hook", "Encuentra el gancho"),
    hint: L("3 × 2 = 6. Mihin 2 kg pitää siirtää, että se vääntää 6?", "3 × 2 = 6. Where must the 2 kg go to make 6?", "3 × 2 = 6. ¿Dónde deben ir los 2 kg para hacer 6?"),
    items: [{ m: 3, at: -2, locked: true }, { m: 2, at: 1 }] },
  { kind: "water", title: L("Kaada vettä", "Pour water", "Echa agua"),
    hint: L("Litra vettä painaa kilon. Vasen vääntää 4 × 3 = 12. Ämpäri on kohdassa 4.", "A litre of water weighs a kilo. The left makes 4 × 3 = 12. The bucket is at 4.", "Un litro de agua pesa un kilo. La izquierda hace 4 × 3 = 12. El cubo está en 4."),
    items: [{ m: 4, at: -3, locked: true }, { bucket: true, at: 4, cap: 5, locked: true }] },
  { kind: "move", title: L("Iso ja pieni", "Big and small", "Grande y pequeño"),
    hint: L("3 kg kaukana (3 × 4 = 12) voi olla yhtä vahva kuin 4 kg lähellä.", "3 kg far out (3 × 4 = 12) can be as strong as 4 kg close in.", "3 kg lejos (3 × 4 = 12) puede ser tan fuerte como 4 kg cerca."),
    items: [{ m: 3, at: -4, locked: true }, { m: 4, at: 1 }] },
  { kind: "water", title: L("Vesi vasemmalle", "Water on the left", "Agua a la izquierda"),
    hint: L("Oikea: 5 × 2 = 10. Vasen: 1 × 4 = 4. Paljonko vettä ämpäri kohdassa 3 tarvitsee?", "Right: 5 × 2 = 10. Left: 1 × 4 = 4. How much water does the bucket at 3 need?", "Derecha: 5 × 2 = 10. Izquierda: 1 × 4 = 4. ¿Cuánta agua necesita el cubo en 3?"),
    items: [{ m: 1, at: -4, locked: true }, { m: 5, at: 2, locked: true }, { bucket: true, at: -3, cap: 5, locked: true }] },
  { kind: "add", title: L("Monta punnusta", "Several weights", "Varias pesas"),
    hint: L("Vasen vääntää 5 × 2 = 10. Punnukset samalla puolella lasketaan yhteen.", "The left makes 5 × 2 = 10. Weights on the same side add up.", "La izquierda hace 5 × 2 = 10. Las pesas del mismo lado se suman."),
    items: [{ m: 5, at: -2, locked: true }, { m: 2 }, { m: 1 }, { m: 1 }] },
  { kind: "add", title: L("Kaksi vasemmalla", "Two on the left", "Dos a la izquierda"),
    hint: L("Vasen: 2 × 4 + 1 × 1 = 9. Mihin 3 kg ripustetaan?", "Left: 2 × 4 + 1 × 1 = 9. Where does the 3 kg go?", "Izquierda: 2 × 4 + 1 × 1 = 9. ¿Dónde va la de 3 kg?"),
    items: [{ m: 2, at: -4, locked: true }, { m: 1, at: -1, locked: true }, { m: 3 }] },
  { kind: "mix", title: L("Punnus ja vesi", "Weight and water", "Pesa y agua"),
    hint: L("Vasen vääntää 3 × 3 = 9. Siirrä punnusta ja kaada vettä, monta ratkaisua käy.", "The left makes 3 × 3 = 9. Move the weight and pour water: many answers work.", "La izquierda hace 3 × 3 = 9. Mueve la pesa y echa agua: hay muchas soluciones."),
    items: [{ m: 3, at: -3, locked: true }, { m: 1, at: 1 }, { bucket: true, at: 4, cap: 5, locked: true }] },
  { kind: "add", title: L("Raskas sarja", "Heavyweight", "Peso pesado"),
    hint: L("5 × 4 = 20. Kokeile 4 kg ja 2 kg eri koukuissa.", "5 × 4 = 20. Try the 4 kg and the 2 kg on different hooks.", "5 × 4 = 20. Prueba la de 4 kg y la de 2 kg en ganchos distintos."),
    items: [{ m: 5, at: -4, locked: true }, { m: 4 }, { m: 2 }, { m: 1 }] },
  { kind: "free", title: L("Vapaa leikki", "Free play", "Juego libre"),
    hint: L("Kokeile vapaasti: ripusta punnuksia ja ämpäri minne haluat.", "Play freely: hang the weights and the bucket wherever you like.", "Juega libremente: cuelga las pesas y el cubo donde quieras."),
    items: [{ m: 1 }, { m: 2 }, { m: 3 }, { m: 4 }, { m: 5 }, { bucket: true, cap: 5 }] },
];

let mode: Mode = "menu";
let level = 0;
let items: Item[] = [];
let ang = 0, vel = 0;       // the beam's angle (degrees, clockwise) and its speed
let t = 0;
let drag: Item | null = null;
let offX = 0, offY = 0;
let pouring = 0;            // 1 pour, -1 drain
let pourT = 0;              // how long the button has been held
let steady = 0;             // how long the beam has been balanced
let solved = false;
let showHint = false;
let done: boolean[] = [];

function tr(a: string[]) { return rg.t(a[0], a[1], a[2]); }
function speak(id: string | string[]) {
  const ids = Array.isArray(id) ? id : [id];
  for (const x of ids) if (!rg.hasVoice(x, rg.lang)) return;
  rg.say(ids);
}

function init() {
  done = rg.load("done", []);
}

function cx() { return width / 2; }
function cy() { return Math.max(250, Math.round(height * 0.4)); }
function trayY() { return height - 148; }

function startLevel(i: number) {
  level = i;
  mode = "play";
  const lv = LEVELS[i];
  items = lv.items.map((d, k) => ({
    id: k, kind: d.bucket ? "b" : "w", m: d.m || 0, water: d.water || 0, cap: d.cap || 5,
    peg: d.at || 0, tray: !d.at, locked: !!d.locked, dx: 0, dy: 0,
  }) as Item);
  ang = 0; vel = 0; drag = null; pouring = 0; steady = 0; solved = false; showHint = false;
  rg.sound("click");
  const k = lv.kind;
  speak(k === "move" ? "vv_siirra" : k === "water" || k === "mix" ? "vv_kaada" : k === "free" ? "vv_vapaa" : "vv_lisaa");
}

function mass(it: Item) { return it.kind === "b" ? Math.round(it.water / STEP) * STEP : it.m; }
function sideTorque(side: number) {
  let s = 0;
  for (const it of items) if (it.peg * side > 0) s += mass(it) * Math.abs(it.peg);
  return s;
}
function tol() { return 0.01; }

function hook(d: number) {
  const a = ang * Math.PI / 180;
  return { x: cx() + d * U * Math.cos(a), y: cy() + d * U * Math.sin(a) };
}
function size(it: Item) {
  if (it.kind === "b") return { w: 46, h: 52 };
  const s = 26 + it.m * 5;
  return { w: s, h: s };
}

// where everything is drawn this frame: the stacks under the hooks, the
// tray row and the dragged item
function layout(): Box[] {
  const out: Box[] = [];
  for (let d = -4; d <= 4; d++) {
    if (d === 0) continue;
    const h = hook(d);
    let y = h.y + 18;
    for (const it of items) {
      if (it.peg !== d || it === drag) continue;
      const s = size(it);
      if (it.kind === "b") y += 10;       // the handle
      out.push({ it, x: h.x - s.w / 2, y, w: s.w, h: s.h });
      y += s.h + 8 + (it.kind === "b" ? 16 : 0);   // the litres under a bucket
    }
  }
  const tray = items.filter((it) => it.peg === 0 && it !== drag);
  let tw = 0;
  for (const it of tray) tw += size(it).w + 12;
  let x = cx() - (tw - 12) / 2;
  for (const it of tray) {
    const s = size(it);
    out.push({ it, x, y: trayY() + 34 - s.h / 2, w: s.w, h: s.h });
    x += s.w + 12;
  }
  if (drag) { const s = size(drag); out.push({ it: drag, x: drag.dx, y: drag.dy, w: s.w, h: s.h }); }
  return out;
}

function onPointerDown(x: number, y: number, info: any) {
  if (info && info.id) return;   // a button
  if (mode !== "play" || solved || drag) return;
  const boxes = layout();
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b.it.locked) continue;
    if (x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8) {
      drag = b.it;
      offX = x - b.x; offY = y - b.y;
      drag.dx = b.x; drag.dy = b.y;
      rg.sound("pop", { volume: 0.4 });
      return;
    }
  }
}

function press(dir: number) {
  if (solved) return;
  const bucket = items.find((it) => it.kind === "b");
  if (!bucket) return;
  pouring = dir; pourT = 0;
  bucket.water = rg.clamp(Math.round(bucket.water / STEP) * STEP + dir * STEP, 0, bucket.cap);
  rg.sound("pop", { volume: 0.3, pitch: dir > 0 ? 1.2 : 0.8 });
}

function onPointerUp(x: number, y: number) {
  const b = items.find((it) => it.kind === "b");
  if (b && pouring !== 0) b.water = Math.round(b.water / STEP) * STEP;
  pouring = 0;
  if (!drag) return;
  const it = drag;
  drag = null;
  const s = size(it);
  const mx = it.dx + s.w / 2, top = it.dy;
  let best = 0, bd = 1e9;
  for (let d = -4; d <= 4; d++) {
    if (d === 0) continue;
    const h = hook(d);
    const dist = Math.abs(mx - h.x);
    if (dist < U * 0.6 && top > h.y - 90 && top < h.y + 190 && dist < bd) { bd = dist; best = d; }
  }
  if (best !== 0) {
    if (best !== it.peg) { it.peg = best; rg.sound("tick"); rg.vibrate(15); }
  } else if (it.tray) {
    if (it.peg !== 0) rg.sound("whoosh", { volume: 0.4 });
    it.peg = 0;
  }
  // a weight that started on the beam goes back to its hook
}

function tick(dt: number, input: any) {
  t += dt;
  if (mode !== "play") return;
  if (drag) {
    drag.dx = input.pointer.x - offX;
    drag.dy = input.pointer.y - offY;
  }
  const bucket = items.find((it) => it.kind === "b");
  if (bucket && pouring !== 0 && !solved) {
    pourT += dt;
    // a tap gives one step; holding the button pours on after a moment
    if (pourT > 0.35) bucket.water = rg.clamp(bucket.water + pouring * POUR * dt, 0, bucket.cap);
    if ((pouring > 0 && bucket.water >= bucket.cap) || (pouring < 0 && bucket.water <= 0)) pouring = 0;
  }
  const net = sideTorque(1) - sideTorque(-1);
  const balanced = Math.abs(net) <= tol();
  const target = balanced ? 0 : Math.sign(net) * Math.min(MAX_ANG, 3 + Math.abs(net) * 1.6);
  vel += ((target - ang) * 40 - vel * 6) * dt;
  ang += vel * dt;
  if (ang > MAX_ANG) { ang = MAX_ANG; vel = 0; }
  if (ang < -MAX_ANG) { ang = -MAX_ANG; vel = 0; }

  const lv = LEVELS[level];
  const loaded = sideTorque(1) > 0 && sideTorque(-1) > 0;
  if (lv.kind !== "free" && !solved && balanced && loaded && !drag && pouring === 0) {
    steady += dt;
    if (steady > 0.5) win();
  } else steady = 0;
}

function win() {
  solved = true;
  if (!done[level]) { done[level] = true; rg.save("done", done); }
  rg.celebrate(cx(), cy() - 30, { big: level === LEVELS.length - 2 });
  speak(["vv_tasapaino"]);
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; drag = null; pouring = 0; rg.sound("click"); }
}

// ---- drawing ----

function fmt(v: number) {
  const r = Math.round(v * 10) / 10;
  return Math.abs(r - Math.round(r)) < 0.001 ? String(Math.round(r)) : r.toFixed(1);
}

function hArrow(x: number, y: number, len: number, dir: number, color: string) {
  if (len < 2) return null;
  const head = 18;
  const shaft = Math.max(0, len - head * 0.6);
  return [
    <div className="abs" style={{ left: dir > 0 ? x : x - shaft, top: y - 5, width: shaft, height: 10, backgroundColor: color, borderRadius: 3 }} />,
    <div className="abs" style={{ left: x + dir * (len - head * 0.7) - head / 2, top: y - head / 2, width: head, height: head, backgroundColor: color, transform: "rotate(45deg)", borderRadius: 2 }} />,
  ];
}

function vArrow(x: number, y: number, len: number, color: string) {
  const head = 14;
  const shaft = Math.max(0, len - head * 0.6);
  return [
    <div className="abs" style={{ left: x - 3, top: y, width: 6, height: shaft, backgroundColor: color, borderRadius: 2 }} />,
    <div className="abs" style={{ left: x - head / 2, top: y + len - head * 0.7 - head / 2, width: head, height: head, backgroundColor: color, transform: "rotate(45deg)", borderRadius: 2 }} />,
  ];
}

// the torque meter: one arrow per side from the middle, longer = turns harder
function Meter() {
  const left = sideTorque(-1), right = sideTorque(1);
  const scale = Math.min(7, 130 / Math.max(14, left, right));
  const y = 112;
  const out: any[] = [];
  out.push(<div className="meterbg abs" style={{ left: 8, top: y - 30, width: width - 16, height: 62 }} />);
  for (let k = 2; k * scale < 150; k += 2) {
    out.push(<div className="tickmark abs" style={{ left: cx() - k * scale - 1, top: y + 10 }} />);
    out.push(<div className="tickmark abs" style={{ left: cx() + k * scale - 1, top: y + 10 }} />);
  }
  out.push(hArrow(cx() - 2, y, left * scale, -1, "#3a86ff"));
  out.push(hArrow(cx() + 2, y, right * scale, 1, "#ef476f"));
  out.push(<div className="abs pivotdot" style={{ left: cx() - 3, top: y - 14 }} />);
  out.push(<div className="abs tval" style={{ left: 16, top: y - 28, color: "#3a86ff" }}>{fmt(left)}</div>);
  out.push(<div className="abs tval" style={{ left: width - 76, top: y - 28, width: 60, color: "#ef476f", textAlign: "right" }}>{fmt(right)}</div>);
  out.push(<div className="abs mlabel" style={{ left: cx() - 60, top: y - 28, width: 120 }}>{rg.t("vääntö", "torque", "momento")}</div>);
  return out;
}

function terms(side: number) {
  const parts: string[] = [];
  const list = items.filter((it) => it.peg * side > 0 && mass(it) > 0).sort((a, b) => Math.abs(a.peg) - Math.abs(b.peg));
  for (const it of list) parts.push(fmt(mass(it)) + "×" + Math.abs(it.peg));
  return parts.length ? parts.join(" + ") + " = " + fmt(sideTorque(side)) : "0";
}

function Formula() {
  const left = sideTorque(-1), right = sideTorque(1);
  const bal = Math.abs(right - left) <= tol();
  const sign = bal ? "=" : left > right ? ">" : "<";
  return (
    <div className="formula abs" style={{ left: 8, top: 150, width: width - 16 }}>
      <div className="fside" style={{ color: "#3a86ff" }}>{terms(-1)}</div>
      <div className={bal ? "fsign ok" : "fsign"}>{sign}</div>
      <div className="fside" style={{ color: "#ef476f" }}>{terms(1)}</div>
    </div>
  );
}

function Beam() {
  const out: any[] = [];
  const X = cx(), Y = cy();
  // the stand
  out.push(<div className="abs post" style={{ left: X - 7, top: Y + 20, height: trayY() - Y - 34 }} />);
  out.push(<div className="abs fulcrum" style={{ left: X - 15, top: Y + 4, transform: "rotate(45deg)" }} />);
  out.push(<div className="abs stand" style={{ left: X - 40, top: trayY() - 18 }} />);
  // the beam with its hooks and distances; it turns around its middle
  const marks: any[] = [];
  for (let d = -4; d <= 4; d++) {
    const px = BEAM / 2 + d * U;
    if (d === 0) { marks.push(<div className="abs axle" style={{ left: px - 6, top: 1 }} />); continue; }
    marks.push(<div className="abs pegnum" style={{ left: px - 10, top: -1 }}>{Math.abs(d)}</div>);
  }
  out.push(<div className="abs beam" style={{ left: X - BEAM / 2, top: Y - 8, width: BEAM, transform: "rotate(" + ang.toFixed(1) + "deg)" }}>{marks}</div>);
  for (let d = -4; d <= 4; d++) {
    if (d === 0) continue;
    const h = hook(d);
    out.push(<div className="abs hook" style={{ left: h.x - 4, top: h.y + 6 }} />);
  }
  return out;
}

function ItemView(b: Box) {
  const it = b.it;
  const out: any[] = [];
  const lift = it === drag ? 1 : 0;
  if (it.kind === "w") {
    out.push(
      <div className={lift ? "weight abs lift" : "weight abs"} style={{ left: b.x, top: b.y, width: b.w, height: b.h, backgroundColor: COLORS[it.m] }}>
        <div className="wnum" style={{ fontSize: 12 + it.m * 2 }}>{it.m}</div>
        <div className="wkg">kg</div>
        {it.locked ? <div className="lock abs" style={{ left: b.w - 12, top: -8 }}>🔒</div> : null}
      </div>
    );
  } else {
    const inner = b.h - 8;
    const wh = Math.round(inner * it.water / it.cap);
    out.push(
      <div className={lift ? "bucket abs lift" : "bucket abs"} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
        <div className="water abs" style={{ left: 3, top: 4 + inner - wh, width: b.w - 12, height: wh }} />
        <div className="blabel abs" style={{ left: 0, top: b.h + 2, width: b.w }}>{fmt(mass(it))} l</div>
      </div>
    );
    out.push(<div className="abs handle" style={{ left: b.x + 6, top: b.y - 10, width: b.w - 12 }} />);
  }
  return out;
}

// the tap above the bucket: press it (or Pour) and water runs while you hold
function Tap(b: Box) {
  const out: any[] = [];
  const cx = b.x + b.w / 2;
  const ty = Math.max(70, b.y - 74);
  const on = pouring > 0;
  out.push(<div className="abs pipe" style={{ left: cx + 12, top: ty - 30, height: 34 }} />);
  out.push(<div className="abs pipe h" style={{ left: cx - 8, top: ty, width: 38 }} />);
  out.push(<div className="abs spout" style={{ left: cx - 8, top: ty + 6 }} />);
  out.push(<div className="abs valve" style={{ left: cx + 4, top: ty - 16, transform: on ? "rotate(90deg)" : "rotate(0deg)" }} />);
  if (on) {
    const top = ty + 18, bottom = b.y + 6 + (b.h - 8) * (1 - b.it.water / b.it.cap);
    out.push(<div className="abs stream" style={{ left: cx - 5, top: top, height: Math.max(4, bottom - top) }} />);
    for (let k = 0; k < 3; k++) {
      const f = (t * 3 + k / 3) % 1;
      out.push(<div className="abs drop" style={{ left: cx - 7 + (k - 1) * 5, top: top + f * Math.max(4, bottom - top - 6), opacity: 0.9 }} />);
    }
  }
  // a big touch area over the whole tap
  out.push(<div className="abs taphit" id="tap" onPointerDown={() => press(1)} style={{ left: cx - 30, top: ty - 34, width: 70, height: 62 }} />);
  return out;
}

function Scene() {
  const boxes = layout();
  const out: any[] = [];
  // strings from the hooks, then the items, then the weight arrows
  const stacks: { [d: string]: { x: number; bottom: number; m: number } } = {};
  for (const b of boxes) {
    const p = b.it.peg;
    if (p === 0 || b.it === drag) continue;
    const s = stacks[p];
    const top = b.y - (b.it.kind === "b" ? 10 : 0);
    const x = b.x + b.w / 2;
    const from = s ? s.bottom : hook(p).y + 10;
    out.push(<div className="abs rope" style={{ left: x - 1, top: from, height: Math.max(0, top - from + 2) }} />);
    const bottom = b.y + b.h + (b.it.kind === "b" ? 16 : 0);
    if (!s) stacks[p] = { x, bottom, m: mass(b.it) };
    else { s.bottom = bottom; s.m += mass(b.it); }
  }
  for (const b of boxes) out.push(ItemView(b));
  for (const d in stacks) {
    const s = stacks[d];
    if (s.m > 0) out.push(vArrow(s.x, s.bottom + 4, 16 + s.m * 8, "#d62828"));
  }
  // pouring
  const bucket = boxes.find((b) => b.it.kind === "b");
  if (bucket && !solved && bucket.it !== drag) out.push(Tap(bucket));
  if (bucket && pouring < 0 && bucket.it.water > 0) {
    for (let k = 0; k < 3; k++) {
      const f = (t * 2 + k / 3) % 1;
      out.push(<div className="abs drop" style={{ left: bucket.x + bucket.w / 2 - 3, top: bucket.y + bucket.h + 22 + f * 40, opacity: 1 - f }} />);
    }
  }
  return out;
}

function Controls() {
  const lv = LEVELS[level];
  const bucket = items.find((it) => it.kind === "b");
  const y = height - 58;
  const btns: any[] = [];
  if (bucket) {
    btns.push(<div className={pouring > 0 ? "btn pour on" : "btn pour"} id="pour" onPointerDown={() => press(1)}>🚰 {rg.t("Hana", "Tap", "Grifo")}</div>);
    btns.push(<div className={pouring < 0 ? "btn drain on" : "btn drain"} id="drain" onPointerDown={() => press(-1)}>⬇️ {rg.t("Valuta", "Drain", "Vaciar")}</div>);
  }
  btns.push(<div className="btn small" id="hint" onClick={() => { showHint = !showHint; rg.sound("click"); if (showHint) speak("vv_kauemmas"); }}>💡</div>);
  btns.push(<div className="btn small" id="reset" onClick={() => startLevel(level)}>↺</div>);
  return [
    lv.kind === "free" || items.some((it) => it.tray) ? <div className="tray abs" style={{ left: 10, top: trayY(), width: width - 20 }} /> : null,
    <div className="controls abs" style={{ left: 0, top: y, width }}>{btns}</div>,
  ];
}

function Header() {
  const lv = LEVELS[level];
  return [
    <div className="abs head" style={{ left: 50, top: 6, width: width - 100 }}>
      <div className="lvnum">{level + 1}/{LEVELS.length}</div>
      <div className="lvtitle">{KIND_ICON[lv.kind]} {tr(lv.title)}</div>
    </div>,
  ];
}

function HintCard() {
  if (!showHint || solved) return null;
  const lv = LEVELS[level];
  return (
    <div className="hint abs" id="hintcard" onClick={() => { showHint = false; }} style={{ left: 16, top: 78, width: width - 32 }}>
      <div className="hinttext">{tr(lv.hint)}</div>
      <div className="hintrule">{rg.t("vääntö = paino × etäisyys", "torque = weight × distance", "momento = peso × distancia")}</div>
    </div>
  );
}

function SolvedCard() {
  if (!solved) return null;
  const last = level >= LEVELS.length - 1;
  return (
    <div className="solved abs" style={{ left: 30, top: height - 236, width: width - 60 }}>
      <div className="stitle">⚖️ {rg.t("Tasapainossa!", "Balanced!", "¡Equilibrada!")}</div>
      <div className="sline">{fmt(sideTorque(-1))} = {fmt(sideTorque(1))}</div>
      <div className="row">
        <div className="btn small" id="again" onClick={() => startLevel(level)}>↺</div>
        <div className="btn next" id="next" onClick={() => { if (last) { mode = "menu"; rg.sound("click"); } else startLevel(level + 1); }}>
          {last ? rg.t("Valikkoon", "Menu", "Menú") : rg.t("Seuraava →", "Next →", "Siguiente →")}
        </div>
      </div>
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2) * 7;
  return (
    <div className="screen">
      <div className="title">{rg.t("Vipuvaaka", "Lever Scale", "Balanza")}</div>
      <div className="menubeam" style={{ transform: "rotate(" + bob.toFixed(1) + "deg)" }}>
        <div className="mrow">
          <div className="mw" style={{ marginLeft: 46, backgroundColor: COLORS[4] }}>4</div>
          <div className="mw small" style={{ marginRight: 0, backgroundColor: COLORS[2] }}>2</div>
        </div>
        <div className="mbar" />
      </div>
      <div className="mstand" />
      <div className="lead">{rg.t("Tasapainota vaaka! Kaukana oleva punnus vääntää enemmän.", "Balance the scale! A weight farther out turns harder.", "¡Equilibra la balanza! Una pesa más lejos gira más.")}</div>
      <div className="rule">{rg.t("vääntö = paino × etäisyys", "torque = weight × distance", "momento = peso × distancia")}</div>
      <div className="grid">
        {LEVELS.map((lv, i) => (
          <div className={done[i] ? "lv ok" : "lv"} id={"lv" + i} onClick={() => startLevel(i)}>
            <div className="lvn">{i + 1}</div>
            <div className="lvi">{done[i] ? "⭐" : KIND_ICON[lv.kind]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function view() {
  if (mode === "menu") return <div className="root">{Menu()}</div>;
  return (
    <div className="root">
      {Header()}
      {Meter()}
      {Formula()}
      {Controls()}
      {Beam()}
      {Scene()}
      {HintCard()}
      {SolvedCard()}
    </div>
  );
}
