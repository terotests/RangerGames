// Lamppulabra: a battery, a light switch, a resistor and a lamp on a light
// circuit board. At first the battery's and the resistor's places are empty
// and the switch is off, so the lamp stays dark. Drag a battery (AA 1.5 V,
// flat 4.5 V or 9 V) and a resistor (real colour code, the bigger the
// resistance the bigger the resistor) from the tray into the circuit and
// press the switch: the smaller the resistance, the brighter
// the lamp, and right at the limit the filament melts and the lamp pops.
//
// The physics is Ohm's law: I = U / (R + 6 Ω), the lamp's own resistance is
// 6 Ω and its power P = I² · 6 Ω. 6 W is full brightness; over 9 W it pops.
// The art is drawn by tools/lamppu/art.js.

type Puff = { x: number; y: number; t: number; vx: number };
type Bat = { v: number; img: string; w: number; h: number; plus: number[]; minus: number[]; name: string };

const RL = 6;          // the lamp's resistance, Ω
const PFULL = 6;       // full brightness, W
const BURN = 1.5;      // brightness (P / PFULL) at which the lamp pops
const BATS: Bat[] = [
  { v: 1.5, img: "bat_aa", w: 64, h: 20, plus: [62, 10], minus: [1, 10], name: "AA" },
  { v: 4.5, img: "bat_45", w: 46, h: 66, plus: [33.5, 12], minus: [16, 4.5], name: rg.t("litteä", "flat", "plana") },
  { v: 9, img: "bat_9", w: 30, h: 58, plus: [21, 4], minus: [10, 4.5], name: "PP3" },
];
const RESS = [1, 2.2, 4.7, 10, 22, 47, 100];
// resistor image sizes (game px at scale 1), from tools/lamppu/art.js
const RES_W = [42, 49, 56, 64, 71, 78, 86];
const RES_H = [12, 12.7, 13.7, 14.3, 15.3, 16, 17];

// the board and the circuit loop on it
const BY = 104;                    // board top
const L = 40, R = 320, T = BY + 84, B = BY + 246;
const BX = 180;                    // battery
const SWY = T + 82;                // light switch on the left wire
const RX = 116;                    // resistor on the bottom wire
const LX = 244;                    // lamp socket on the bottom wire
const BK = 1.15;                   // bulb scale
const GLOWY = B - 11 - Math.round(96 * BK) + 7 + Math.round(32 * BK); // centre of the bulb glass

// the three things to find, lit up when found
const GOALS = [
  { icon: "🌙", lo: 0.05, hi: 0.3, name: rg.t("Yövalo", "Night light", "Luz tenue") },
  { icon: "☀️", lo: 0.8, hi: 1.2, name: rg.t("Kirkas", "Bright", "Brillante") },
  { icon: "🔥", lo: 1.3, hi: BURN, name: rg.t("Melkein poks!", "Almost pop!", "¡Casi pum!") },
];

let bat = -1;          // index in BATS, -1 = no battery yet
let res = -1;          // index in RESS, -1 = no resistor yet
let swOn = false;      // the light switch
let burnt = false;
let burnI = 0;
let flow = 0;
let t = 0;
let puffs: Puff[] = [];
let found: boolean[] = [false, false, false];
let hold = [0, 0, 0];
let help = false;
let warned = false;

function init() {
  found = rg.load("found", found);
}

// ---- physics ---------------------------------------------------------------

function closed(): boolean { return bat >= 0 && res >= 0 && swOn && !burnt; }
function volts(): number { return bat >= 0 ? BATS[bat].v : 0; }
function ohms(): number { return res >= 0 ? RESS[res] : 0; }
function amps(): number { return closed() ? volts() / (RL + ohms()) : 0; }
function watts(): number { const i = amps(); return i * i * RL; }
function bright(): number { return watts() / PFULL; }

// ---- actions -----------------------------------------------------------------

function placeBat(i: number) {
  if (burnt) { rg.sound("tick"); return; }
  bat = i;
  rg.sound("pop", { pitch: 0.8 + i * 0.2 });
  rg.vibrate(15);
  changed();
}

function removeBat() {
  if (bat < 0 || burnt) return;
  bat = -1;
  rg.sound("whoosh", { pitch: 1.3 });
  changed();
}

function placeRes(i: number) {
  if (burnt) { rg.sound("tick"); return; }
  res = i;
  rg.sound("pop", { pitch: 1.3 });
  rg.vibrate(15);
  changed();
}

function removeRes() {
  if (res < 0 || burnt) return;
  res = -1;
  rg.sound("whoosh", { pitch: 1.5 });
  changed();
}

// ---- dragging parts between the tray and the circuit -------------------------
//
// A battery or a resistor is dragged from the tray at the bottom into its
// empty place in the circuit, or from the circuit back to the tray. Its place
// in the tray stays empty while it is in the circuit. A tap without moving
// does the same: a part in the tray jumps into the circuit, a part in the
// circuit jumps back.

type Drag = { on: boolean; kind: string; i: number; from: string; x0: number; y0: number; x: number; y: number; moved: boolean };
let drag: Drag = { on: false, kind: "", i: -1, from: "", x0: 0, y0: 0, x: 0, y: 0, moved: false };

const TRAY_Y = BY + 368;
const BT_W = 106, BT_H = 74;
const RT_W = 80, RT_H = 40;
function batTile(i: number): number[] { return [15 + i * (BT_W + 6), TRAY_Y, BT_W, BT_H]; }
function resTile(i: number): number[] {
  const row = i < 4 ? 0 : 1;
  const n = row ? 3 : 4, k = row ? i - 4 : i;
  const x0 = (360 - (n * RT_W + (n - 1) * 4)) / 2;
  return [x0 + k * (RT_W + 4), TRAY_Y + BT_H + 6 + row * (RT_H + 4), RT_W, RT_H];
}
function inRect(x: number, y: number, r: number[], pad: number): boolean {
  return x >= r[0] - pad && x <= r[0] + r[2] + pad && y >= r[1] - pad && y <= r[1] + r[3] + pad;
}
// the parts' places in the circuit
const BSLOT = [BX - 40, T - 66, 80, 80];
const RSLOT = [RX - 60, B - 22, 120, 44];

function onPointerDown(x: number, y: number) {
  if (help || burnt) return;
  let kind = "", i = -1, from = "";
  if (bat >= 0 && inRect(x, y, BSLOT, 4)) { kind = "bat"; i = bat; from = "circuit"; }
  else if (res >= 0 && inRect(x, y, RSLOT, 4)) { kind = "res"; i = res; from = "circuit"; }
  else {
    for (let k = 0; k < BATS.length; k++) if (k !== bat && inRect(x, y, batTile(k), 2)) { kind = "bat"; i = k; from = "tray"; }
    for (let k = 0; k < RESS.length; k++) if (k !== res && inRect(x, y, resTile(k), 2)) { kind = "res"; i = k; from = "tray"; }
  }
  if (i < 0) return;
  drag = { on: true, kind: kind, i: i, from: from, x0: x, y0: y, x: x, y: y, moved: false };
  rg.sound("click", { pitch: 1.4 });
}

function nearSlot(): boolean {
  const r = drag.kind === "bat" ? BSLOT : RSLOT;
  return inRect(drag.x, drag.y, r, 40);
}

function onPointerUp() {
  if (!drag.on) return;
  const d = drag;
  drag = { on: false, kind: "", i: -1, from: "", x0: 0, y0: 0, x: 0, y: 0, moved: false };
  const into = d.moved ? inRect(d.x, d.y, d.kind === "bat" ? BSLOT : RSLOT, 40) : d.from === "tray";
  if (d.kind === "bat") {
    if (into && d.from === "tray") placeBat(d.i);
    else if (!into && d.from === "circuit") removeBat();
    else if (into && d.from === "circuit") rg.sound("click");
    else rg.sound("whoosh", { pitch: 1.3 });
  } else {
    if (into && d.from === "tray") placeRes(d.i);
    else if (!into && d.from === "circuit") removeRes();
    else if (into && d.from === "circuit") rg.sound("click");
    else rg.sound("whoosh", { pitch: 1.5 });
  }
}

function dragStep(input: any) {
  if (!drag.on) return;
  drag.x = input.pointer.x;
  drag.y = input.pointer.y;
  if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 8) drag.moved = true;
  if (!input.pointer.down) onPointerUp();
}

function toggleSwitch() {
  swOn = !swOn;
  rg.sound("click", { pitch: swOn ? 1.2 : 0.8 });
  rg.vibrate(20);
  changed();
}

function newLamp() {
  burnt = false;
  swOn = false;
  puffs = [];
  rg.sound("whoosh");
  changed();
}

function changed() {
  hold = [0, 0, 0];
  const b = bright();
  if (b > BURN) {
    burnI = amps();
    burnt = true;
    rg.sound("hit");
    rg.vibrate([40, 30, 80]);
    rg.say("lamppu_paloi");
    for (let k = 0; k < 14; k++) puffs.push({ x: LX + (rg.random() - 0.5) * 20, y: GLOWY - 10, t: -k * 0.08, vx: (rg.random() - 0.5) * 30 });
    return;
  }
  if (b > 1.25) { if (!warned) { warned = true; rg.say("liian_kirkas"); rg.vibrate(30); } }
  else warned = false;
}

function tick(dt: number, input: any) {
  t += dt;
  dragStep(input);
  flow += amps() * 110 * dt;
  for (const p of puffs) { p.t += dt; p.y -= 40 * dt; p.x += p.vx * dt; }
  puffs = puffs.filter((p) => p.t < 2.2);
  if (!closed()) return;
  const b = bright();
  for (let k = 0; k < GOALS.length; k++) {
    if (found[k]) continue;
    if (b >= GOALS[k].lo && b <= GOALS[k].hi) {
      hold[k] += dt;
      if (hold[k] > 0.8) {
        found[k] = true;
        rg.save("found", found);
        rg.sound("win");
        rg.celebrate(LX, GLOWY, { big: found.every((f) => f) });
        rg.say(found.every((f) => f) ? "hienoa" : "lamppu_syttyi");
      }
    } else hold[k] = 0;
  }
}

function onBack() { if (help) help = false; else rg.exit(); }

function onKeyDown(key: string) {
  if (key === "ArrowRight") placeRes(Math.min(RESS.length - 1, res + 1));
  if (key === "ArrowLeft") { if (res > 0) placeRes(res - 1); else removeRes(); }
  if (key === "ArrowUp") placeBat(Math.min(BATS.length - 1, bat + 1));
  if (key === "ArrowDown") { if (bat > 0) placeBat(bat - 1); else removeBat(); }
  if (key === " " || key === "Enter") toggleSwitch();
}

// ---- drawing -----------------------------------------------------------------

function fmt(n: number, d: number): string {
  const s = n.toFixed(d);
  return rg.lang === "fi" ? s.split(".").join(",") : s;
}
function num(n: number): string { return fmt(n, n % 1 ? 1 : 0); }

function img(name: string): string { return rg.asset("img/" + name + ".png"); }
function resImg(i: number): string { return img("res_" + String(RESS[i]).split(".").join("_")); }

// the standard resistor colour code: two digits, a multiplier and a gold
// tolerance band (±5 %). 0 black, 1 brown, 2 red, 3 orange, 4 yellow,
// 5 green, 6 blue, 7 violet, 8 grey, 9 white; multiplier gold = × 0,1
const BAND = ["#1b1b1b", "#7f4f24", "#d62828", "#f77f00", "#ffd60a", "#2a9d8f", "#3a86ff", "#7b2cbf", "#8d99ae", "#ffffff"];
const GOLD = "#d4a017";
function bands(ohm: number): string[] {
  if (ohm < 10) return [BAND[Math.floor(ohm)], BAND[Math.round((ohm * 10) % 10)], GOLD, GOLD];
  const s = String(Math.round(ohm));
  return [BAND[+s.charAt(0)], BAND[+s.charAt(1)], BAND[s.length - 2], GOLD];
}
const BAND_NAME = [
  rg.t("musta", "black", "negro"), rg.t("ruskea", "brown", "marrón"), rg.t("punainen", "red", "rojo"), rg.t("oranssi", "orange", "naranja"),
  rg.t("keltainen", "yellow", "amarillo"), rg.t("vihreä", "green", "verde"), rg.t("sininen", "blue", "azul"), rg.t("violetti", "violet", "violeta"),
  rg.t("harmaa", "grey", "gris"), rg.t("valkoinen", "white", "blanco"),
];
function bandWords(ohm: number): string {
  const c = bands(ohm);
  const name = (col: string) => col === GOLD ? rg.t("kulta", "gold", "oro") : BAND_NAME[BAND.indexOf(col)];
  return name(c[0]) + " – " + name(c[1]) + " – " + name(c[2]);
}

// where the battery's image and terminals are on the board
function batPlace(i: number) {
  const k = BATS[i];
  const x = BX - k.w / 2;
  const y = k.h < 30 ? T - k.h / 2 : T + 8 - k.h; // AA lies on the wire, the others stand on the board
  return { x, y, plus: [x + k.plus[0], y + k.plus[1]], minus: [x + k.minus[0], y + k.minus[1]] };
}

// the wire loop as a polyline, from the battery's plus round to its minus
function loop(): number[][] {
  if (bat < 0) return [[BX + 32, T], [R, T], [R, B], [L, B], [L, T], [BX - 32, T]];
  const p = batPlace(bat);
  const k = BATS[bat];
  if (k.h < 30) return [p.plus, [R, T], [R, B], [L, B], [L, T], p.minus];
  const top = Math.min(p.plus[1], p.minus[1]) - 12;
  const xa = p.x - 12, xb = p.x + k.w + 12;
  return [p.plus, [p.plus[0], top], [xb, top], [xb, T], [R, T], [R, B], [L, B], [L, T], [xa, T], [xa, top], [p.minus[0], top], p.minus];
}

function seg(a: number[], b: number[], hot: boolean) {
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return <div className={hot ? "wire hot" : "wire"} style={{ left: x - 3, top: y - 3, width: Math.abs(a[0] - b[0]) + 6, height: Math.abs(a[1] - b[1]) + 6 }} />;
}

function Wires() {
  const pts = loop();
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (res < 0 && a[1] === B && b[1] === B) {
      // no resistor: the bottom wire is open, with clips waiting for one
      out.push(seg(a, [RX + 46, B], false));
      out.push(seg([RX - 46, B], b, false));
      out.push(<div className="clip open" style={{ left: RX + 41, top: B - 5 }} />);
      out.push(<div className="clip open" style={{ left: RX - 51, top: B - 5 }} />);
    } else out.push(seg(a, b, closed()));
  }
  // crocodile clips on the battery terminals, or open ones waiting for a battery
  const ends = [pts[0], pts[pts.length - 1]];
  for (const e of ends) {
    if (bat >= 0 && BATS[bat].h < 30) out.push(<div className="clip" style={{ left: e[0] - 4, top: e[1] - 5 }} />);
    else if (bat >= 0) out.push(<div className="clip" style={{ left: e[0] - 4, top: e[1] - 8 }} />);
    else out.push(<div className="clip open" style={{ left: e[0] - 5, top: e[1] - 5 }} />);
  }
  // the charges moving round when the circuit is closed
  if (closed()) {
    let len = 0;
    const lens = [];
    for (let k = 1; k < pts.length; k++) { const d = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]); lens.push(d); len += d; }
    const gap = 26;
    const n = Math.floor(len / gap);
    for (let j = 0; j < n; j++) {
      let s = (flow + j * gap) % len;
      let k = 0;
      while (k < lens.length - 1 && s > lens[k]) { s -= lens[k]; k++; }
      const a = pts[k], b = pts[k + 1], f = lens[k] ? s / lens[k] : 0;
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      out.push(<div className="charge" style={{ left: x - 4, top: y - 4 }} />);
    }
  }
  return out;
}

function Battery() {
  if (bat < 0) {
    const hot = drag.on && drag.kind === "bat" && nearSlot();
    return [
      <div className={hot ? "slot hot" : "slot"} id="slot" style={{ left: BX - 30, top: T - 58 }}>
        <div className="slotplus">🔋</div>
        <div className="slottext">{rg.t("Ei paristoa", "No battery", "Sin pila")}</div>
      </div>,
    ];
  }
  if (drag.on && drag.kind === "bat" && drag.from === "circuit") return [];
  const k = BATS[bat], p = batPlace(bat);
  return [
    <img className="part" id="battery" src={img(k.img)} style={{ left: p.x, top: p.y, width: k.w, height: k.h }} />,
  ];
}

function Switch() {
  const out = [];
  out.push(<img className="part" id="switch" src={img(swOn ? "switch_on" : "switch_off")} style={{ left: L - 23, top: SWY - 27, width: 46, height: 54 }} onClick={() => toggleSwitch()} />);
  out.push(<div className={swOn ? "swlabel on" : "swlabel"} style={{ left: L + 28, top: SWY - 11 }}>{swOn ? rg.t("PÄÄLLÄ", "ON", "SÍ") : rg.t("POIS", "OFF", "NO")}</div>);
  return out;
}

function Resistor() {
  if (res < 0 || (drag.on && drag.kind === "res" && drag.from === "circuit")) {
    const hot = drag.on && drag.kind === "res" && nearSlot();
    return [
      <div className={hot ? "rslot hot" : "rslot"} style={{ left: RX - 38, top: B - 13 }}><div className="slottext">{rg.t("Ei vastusta", "No resistor", "Sin resistencia")}</div></div>,
    ];
  }
  const s = 1.6;
  const w = RES_W[res] * s, h = RES_H[res] * s;
  return [
    <img className="part" src={resImg(res)} style={{ left: RX - w / 2, top: B - h / 2, width: w, height: h }} />,
    <div className="partlabel" style={{ left: RX - 30, top: B + 12 }}>{num(ohms()) + " Ω"}</div>,
  ];
}

function Lamp() {
  const b = bright();
  const out = [];
  const fl = b > 1.25 ? 0.7 + 0.3 * Math.abs(Math.sin(t * 37)) : 1;
  if (b > 0.01) {
    const g = Math.min(b, BURN) / BURN;
    const rings = [[210, 0.16], [140, 0.26], [88, 0.4]];
    for (const r of rings) {
      const d = r[0] * (0.45 + 0.55 * g);
      out.push(<div className="glow" style={{ left: LX - d / 2, top: GLOWY - d / 2, width: d, height: d, borderRadius: d / 2,
        opacity: Math.min(1, Math.min(b, 1.4) * r[1] * 2.4) * fl }} />);
    }
  }
  const bw = 60 * BK, bh = 96 * BK;
  const bx = LX - bw / 2, by = B - 11 - bh + 7;
  out.push(<img className="part" id="lamp" src={img(burnt ? "bulb_burnt" : "bulb_off")} style={{ left: bx, top: by, width: bw, height: bh }} onClick={() => { if (burnt) newLamp(); }} />);
  if (b > 0.01) out.push(<img className="part" src={img("bulb_on")} style={{ left: bx, top: by, width: bw, height: bh, opacity: Math.min(1, 0.25 + b * 0.9) * fl }} />);
  out.push(<img className="part" src={img("socket")} style={{ left: LX - 32, top: B - 11, width: 64, height: 22 }} />);
  if (burnt) out.push(<div className="crack" style={{ left: LX + 14, top: by - 6 }}>💥</div>);
  for (const p of puffs) {
    if (p.t < 0) continue;
    const s = 14 + p.t * 18;
    out.push(<div className="puff" style={{ left: p.x - s / 2, top: p.y - s / 2, width: s, height: s, borderRadius: s / 2, opacity: Math.max(0, 0.6 - p.t * 0.27) }} />);
  }
  return out;
}

// a bobbing finger showing what to do next
function Hint() {
  if (burnt) return [];
  const bob = Math.abs(Math.sin(t * 4)) * 8;
  if (drag.on) return [];
  if (bat < 0) return [<div className="hand" style={{ left: 86, top: TRAY_Y + 46 + bob }}>👆</div>];
  if (res < 0) return [<div className="hand" style={{ left: resTile(3)[0] + 40, top: resTile(3)[1] + 20 + bob }}>👆</div>];
  if (!swOn) return [<div className="hand" style={{ left: L + 6 + bob, top: SWY + 8 }}>👈</div>];
  return [];
}

function Board() {
  const b = bright();
  return [
    <img className="board" src={img("board")} style={{ left: 8, top: BY, width: 344, height: 272 }} />,
    <div className="roomlight" style={{ left: 8, top: BY, width: 344, height: 272, opacity: Math.min(b, 1.5) * 0.16 }} />,
    Wires(),
    Resistor(),
    Lamp(),
    Battery(),
    Switch(),
  ];
}

function Meter() {
  const u = volts(), r = ohms(), i = amps(), b = bright();
  let status = "";
  let sc = "status";
  if (burnt) { status = rg.t("Poks! Lamppu paloi: ", "Pop! The lamp burnt out: ", "¡Pum! Se quemó: ") + fmt(burnI, 2) + " A " + rg.t("oli liikaa.", "was too much.", "fue demasiado."); sc = "status bad"; }
  else if (bat < 0) status = rg.t("Ei paristoa, ei valoa. Vedä paristo piiriin.", "No battery, no light. Drag a battery into the circuit.", "Sin pila no hay luz. Arrastra una pila.");
  else if (res < 0) status = rg.t("Vedä vastus sen paikalle piirissä.", "Drag a resistor to its place in the circuit.", "Arrastra una resistencia a su sitio.");
  else if (!swOn) status = rg.t("Kytkin on pois päältä. Paina valokytkintä!", "The switch is off. Press the light switch!", "El interruptor está apagado. ¡Púlsalo!");
  else if (b < 0.05) status = rg.t("Virta on niin pieni, ettei lamppu hehku.", "So little current that the lamp doesn't glow.", "Tan poca corriente que no brilla.");
  else if (b < 0.4) status = rg.t("Lamppu palaa himmeästi.", "The lamp glows dimly.", "La bombilla brilla poco.");
  else if (b < 0.8) status = rg.t("Lamppu palaa melko kirkkaasti.", "The lamp is fairly bright.", "Brilla bastante.");
  else if (b <= 1.25) status = rg.t("Lamppu palaa kirkkaasti.", "The lamp shines brightly.", "Brilla mucho.");
  else { status = rg.t("Varo! Ihan rajalla, lamppu kuumenee.", "Careful! Right at the limit, the lamp is getting hot.", "¡Cuidado! Al límite, se calienta."); sc = "status warn"; }
  const formula = closed()
    ? "⚡ I = " + num(u) + " V / (" + num(r) + " Ω + 6 Ω) = " + fmt(i, 2) + " A"
    : burnt ? rg.t("⚡ Lamppu on rikki: virtaa ei kulje, I = 0 A", "⚡ The lamp is broken: no current, I = 0 A", "⚡ Bombilla rota: I = 0 A")
    : rg.t("⚡ Piiri on auki: virtaa ei kulje, I = 0 A", "⚡ The circuit is open: no current, I = 0 A", "⚡ Circuito abierto: I = 0 A");
  const BW = 316;
  const x = (v: number) => Math.round((rg.clamp(v, 0, 1.7) / 1.7) * BW);
  return (
    <div className="meter" style={{ left: 10, top: BY + 278 }}>
      <div className="row"><div className="mv">{formula}</div></div>
      <div className="bar">
        <div className="danger" style={{ left: x(BURN), width: BW - x(BURN) }} />
        <div className="fill" style={{ width: closed() ? x(b) : 0, backgroundColor: b > 1.25 ? "#e63946" : "#ffb703" }} />
        <div className="tick" style={{ left: x(1) - 1 }} />
      </div>
      <div className={sc}>{status}</div>
    </div>
  );
}

function batImg(i: number, x: number, y: number, s: number) {
  const k = BATS[i];
  return <img className="part" src={img(k.img)} style={{ left: x - k.w * s / 2, top: y - k.h * s / 2, width: k.w * s, height: k.h * s }} />;
}
function resPart(i: number, x: number, y: number, s: number) {
  return <img className="part" src={resImg(i)} style={{ left: x - RES_W[i] * s / 2, top: y - RES_H[i] * s / 2, width: RES_W[i] * s, height: RES_H[i] * s }} />;
}

function Tray() {
  if (burnt) {
    return [<div className="buttons" style={{ top: TRAY_Y + 30 }}>
      <div className="btn red" id="newlamp" onClick={() => newLamp()}>{rg.t("🔧 Uusi lamppu", "🔧 New lamp", "🔧 Bombilla nueva")}</div>
    </div>];
  }
  const out = [];
  for (let i = 0; i < BATS.length; i++) {
    const r = batTile(i), k = BATS[i];
    const gone = i === bat || (drag.on && drag.kind === "bat" && drag.i === i);
    out.push(<div className={gone ? "tile empty" : "tile"} style={{ left: r[0], top: r[1], width: r[2], height: r[3] }} />);
    if (!gone) out.push(batImg(i, r[0] + r[2] / 2, r[1] + 29, k.h > 30 ? 46 / k.h : 1));
    out.push(<div className="tlabel" style={{ left: r[0], top: r[1] + r[3] - 18, width: r[2] }}><div className="tltext">{num(k.v) + " V · " + k.name}</div></div>);
  }
  for (let i = 0; i < RESS.length; i++) {
    const r = resTile(i);
    const gone = i === res || (drag.on && drag.kind === "res" && drag.i === i);
    out.push(<div className={gone ? "tile empty" : "tile"} style={{ left: r[0], top: r[1], width: r[2], height: r[3] }} />);
    if (!gone) out.push(resPart(i, r[0] + r[2] / 2, r[1] + 13, 0.88));
    out.push(<div className="tlabel" style={{ left: r[0], top: r[1] + r[3] - 16, width: r[2] }}><div className="tltext">{num(RESS[i]) + " Ω"}</div></div>);
  }
  return out;
}

// the part under the finger, drawn at its size in the circuit
function Dragged() {
  if (!drag.on) return [];
  if (drag.kind === "bat") return [batImg(drag.i, drag.x, drag.y - 20, 1.1)];
  return [resPart(drag.i, drag.x, drag.y - 16, 1.7)];
}

function Head() {
  return (
    <div className="head">
      <div className="tname">💡 {rg.t("Lamppulabra", "Lamp Lab", "Lab de la bombilla")}</div>
      <div className="ttext">{rg.t("Vedä paristo ja vastus piiriin ja paina kytkintä. Mitä pienempi vastus, sitä kirkkaampi valo!", "Drag a battery and a resistor into the circuit and press the switch. The smaller the resistance, the brighter the light!", "Arrastra una pila y una resistencia al circuito y pulsa el interruptor. ¡Menos resistencia, más luz!")}</div>
      <div className="goals">
        {GOALS.map((g, k) => <div className={found[k] ? "goal on" : "goal"}><div className="gicon">{g.icon}</div><div className={found[k] ? "gname on" : "gname"}>{g.name}</div></div>)}
        <div className="goal helpb" id="help" onClick={() => { help = !help; rg.sound("click"); }}><div className="gicon">❓</div></div>
      </div>
    </div>
  );
}

function Help() {
  const lines = [
    rg.t("🔋 Paristo antaa jännitteen U voltteina (V). Isompi paristo työntää enemmän virtaa. Ilman paristoa ei tule valoa.",
      "🔋 The battery gives a voltage V in volts (V). A bigger battery pushes more current. No battery, no light.",
      "🔋 La pila da un voltaje en voltios (V). Más voltaje empuja más corriente. Sin pila no hay luz."),
    rg.t("🔘 Valokytkin avaa ja sulkee piirin. Kun piiri on auki, virta ei kulje.",
      "🔘 The light switch opens and closes the circuit. When it is open, no current flows.",
      "🔘 El interruptor abre y cierra el circuito. Abierto, no pasa corriente."),
    rg.t("〰️ Vastus vastustaa virtaa. Se mitataan ohmeina (Ω). Mitä isompi vastus, sitä vähemmän virtaa. Lampussa on oma 6 Ω vastus.",
      "〰️ A resistor resists the current, measured in ohms (Ω). The bigger the resistor, the less current. The lamp has 6 Ω of its own.",
      "〰️ La resistencia frena la corriente, en ohmios (Ω). Cuanto más grande, menos corriente. La bombilla tiene 6 Ω propios."),
    rg.t("🎨 Värikoodi: kaksi ensimmäistä raitaa ovat numerot, kolmas kertoo nollat (kulta = pilkku yhden numeron jälkeen), viimeinen kultainen raita on tarkkuus ±5 %. Ruskea–musta–musta = 10 Ω.",
      "🎨 Colour code: the first two bands are digits, the third tells the zeros (gold = a decimal point after one digit), the last gold band is the ±5 % tolerance. Brown–black–black = 10 Ω.",
      "🎨 Código de colores: las dos primeras bandas son cifras, la tercera los ceros (oro = coma tras una cifra), la última dorada es la tolerancia ±5 %. Marrón–negro–negro = 10 Ω."),
    rg.t("⚡ Ohmin laki: I = U / R. Kun lampun teho nousee yli 9 W, hehkulanka sulaa ja lamppu poksahtaa.",
      "⚡ Ohm's law: I = V / R. When the lamp's power goes over 9 W, the filament melts and the lamp pops.",
      "⚡ Ley de Ohm: I = V / R. Con más de 9 W el filamento se funde y la bombilla explota."),
    res >= 0 ? rg.t("Nyt vastus: ", "This resistor: ", "Esta resistencia: ") + bandWords(ohms()) + " = " + num(ohms()) + " Ω"
      : rg.t("Ruskea–musta–musta = 10 Ω, punainen–punainen–kulta = 2,2 Ω.", "Brown–black–black = 10 Ω, red–red–gold = 2.2 Ω.", "Marrón–negro–negro = 10 Ω, rojo–rojo–oro = 2,2 Ω."),
  ];
  return (
    <div className="root menu">
      <div className="title" style={{ marginTop: 30 }}>{rg.t("Miten se toimii?", "How does it work?", "¿Cómo funciona?")}</div>
      {lines.map((s) => <div className="helpline">{s}</div>)}
      <div className="level back" id="back" onClick={() => { help = false; rg.sound("click"); }}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  if (help) return Help();
  return (
    <div className="root">
      {Head()}
      {Board()}
      {Meter()}
      {Tray()}
      {Hint()}
      {Dragged()}
    </div>
  );
}
