// Lamppulabra: build a series circuit from batteries and resistors so that
// the lamp glows just right. The physics is Ohm's law: the batteries' voltages
// add up (U), the resistors and the lamp's own 6 Ω add up (R), the current is
// I = U / R and the lamp's power P = I² · 6 Ω. 6 W is full brightness; over
// 12 W the filament melts and the lamp burns out. An empty slot is a plain
// wire, and the switch opens and closes the circuit.

type Mode = "menu" | "play" | "help";
type Part = { kind: "bat" | "res"; val: number };
type Task = { name: string; text: string; bats: number[]; ress: number[]; lo: number; hi: number };
type Puff = { x: number; y: number; t: number; vx: number };

const RL = 6;          // the lamp's resistance, Ω
const PFULL = 6;       // the lamp's full power, W (6 V, 1 A)
const BURN = 2;        // brightness (P / PFULL) at which it burns out
const SCALE = 2.2;     // the brightness bar's range

const TASKS: Task[] = [
  { name: rg.t("1. Sytytä lamppu", "1. Light the lamp", "1. Enciende la bombilla"),
    text: rg.t("Laita paristo paikalleen ja käännä kytkin päälle.", "Put the battery in and turn the switch on.", "Pon la pila y enciende el interruptor."),
    bats: [4.5], ress: [], lo: 0.05, hi: BURN },
  { name: rg.t("2. Kirkkaammin", "2. Brighter", "2. Más brillante"),
    text: rg.t("Saa lamppu palamaan kirkkaasti: 80–130 %.", "Make the lamp shine brightly: 80–130 %.", "Haz que brille mucho: 80–130 %."),
    bats: [1.5, 1.5, 4.5], ress: [], lo: 0.8, hi: 1.3 },
  { name: rg.t("3. Yövalo", "3. Night light", "3. Luz de noche"),
    text: rg.t("Iso paristo, mutta yövaloksi riittää himmeä valo: 5–25 %.", "A big battery, but a night light only needs a dim glow: 5–25 %.", "Una pila grande, pero basta una luz tenue: 5–25 %."),
    bats: [9], ress: [5, 10, 20], lo: 0.05, hi: 0.25 },
  { name: rg.t("4. Älä polta lamppua", "4. Don't burn it out", "4. No la quemes"),
    text: rg.t("Kaksi 9 V paristoa! Kirkas valo (80–130 %), mutta lamppu ei saa palaa.", "Two 9 V batteries! Bright light (80–130 %) without burning the lamp.", "¡Dos pilas de 9 V! Luz brillante (80–130 %) sin quemar la bombilla."),
    bats: [9, 9], ress: [2, 5, 10], lo: 0.8, hi: 1.3 },
  { name: rg.t("5. Täsmälleen", "5. Exactly right", "5. Justo"),
    text: rg.t("Juuri sopiva valo: 90–110 %. Keksitkö monta tapaa?", "Just the right light: 90–110 %. Can you find many ways?", "La luz justa: 90–110 %. ¿Encuentras varias formas?"),
    bats: [1.5, 4.5, 9], ress: [2, 5, 10, 20], lo: 0.9, hi: 1.1 },
];
const FREE: Task = { name: rg.t("Vapaa kokeilu", "Free play", "Juego libre"),
  text: rg.t("Kokeile mitä tahansa. Mitä isompi vastus, sitä himmeämpi valo.", "Try anything. The bigger the resistance, the dimmer the light.", "Prueba lo que quieras. Más resistencia, menos luz."),
  bats: [1.5, 1.5, 4.5, 9, 9], ress: [2, 5, 10, 10, 20], lo: -1, hi: -1 };

// the circuit loop (the wires) and its slots
const L = 28, R = 300, T = 120, B = 276;
const SY = (T + B) / 2;            // the switch, on the left edge
const LY = (T + B) / 2;            // the lamp, on the right edge
const SLOT_X = [96, 166, 236];
const PERIM = 2 * (R - L) + 2 * (B - T);

let mode: Mode = "menu";
let task = 0;                      // index in TASKS, or -1 = free play
let parts: Part[] = [];
let bat = [-1, -1, -1];            // part index in each battery slot
let res = [-1, -1, -1];            // part index in each resistor slot
let on = false;
let burnt = false;
let burnI = 0;                     // the current that burnt the lamp
let hold = 0;                      // seconds in the target band
let solved = false;
let warned = false;
let lit = false;
let flow = 0;                      // the moving charges' offset along the loop
let t = 0;
let note = "";
let noteT = -10;
let puffs: Puff[] = [];
let done: boolean[] = [false, false, false, false, false];

function init() {
  done = rg.load("done", done);
}

function cur(): Task { return task < 0 ? FREE : TASKS[task]; }

function start(i: number) {
  task = i;
  const k = cur();
  parts = [];
  for (const v of k.bats) parts.push({ kind: "bat", val: v });
  for (const v of k.ress) parts.push({ kind: "res", val: v });
  bat = [-1, -1, -1];
  res = [-1, -1, -1];
  on = false; burnt = false; hold = 0; solved = false; warned = false; lit = false;
  puffs = [];
  mode = "play";
  rg.sound("click");
}

// ---- physics ---------------------------------------------------------------

function volts(): number { let v = 0; for (const i of bat) if (i >= 0) v += parts[i].val; return v; }
function ohms(): number { let r = 0; for (const i of res) if (i >= 0) r += parts[i].val; return r; }
function closed(): boolean { return on && !burnt && volts() > 0; }
function amps(): number { return closed() ? volts() / (RL + ohms()) : 0; }
function watts(): number { const i = amps(); return i * i * RL; }
function bright(): number { return watts() / PFULL; }

// ---- actions -----------------------------------------------------------------

function say(text: string) { note = text; noteT = t; }

function placed(i: number): boolean { return bat.indexOf(i) >= 0 || res.indexOf(i) >= 0; }

function put(i: number) {
  const p = parts[i];
  const slots = p.kind === "bat" ? bat : res;
  const free = slots.indexOf(-1);
  if (free < 0) {
    rg.sound("wrong");
    say(p.kind === "bat" ? rg.t("Paristopaikat ovat täynnä", "The battery slots are full", "No caben más pilas")
      : rg.t("Vastuspaikat ovat täynnä", "The resistor slots are full", "No caben más resistencias"));
    return;
  }
  slots[free] = i;
  rg.sound("pop");
  changed();
}

function take(slots: number[], s: number) {
  if (slots[s] < 0) {
    rg.sound("tick");
    say(rg.t("Tyhjä paikka on pelkkää johtoa", "An empty slot is just wire", "Un hueco vacío es solo cable"));
    return;
  }
  slots[s] = -1;
  rg.sound("click");
  changed();
}

function toggle() {
  on = !on;
  rg.sound(on ? "click" : "tick");
  rg.vibrate(15);
  changed();
}

function newLamp() {
  burnt = false;
  on = false;
  puffs = [];
  rg.sound("whoosh");
  say(rg.t("Uusi lamppu. Kokeile isompaa vastusta!", "A new lamp. Try a bigger resistance!", "Bombilla nueva. ¡Prueba más resistencia!"));
}

function clearAll() {
  bat = [-1, -1, -1];
  res = [-1, -1, -1];
  on = false;
  rg.sound("whoosh");
  changed();
}

// after every change: does the lamp light up, glow too bright or burn out?
function changed() {
  hold = 0;
  if (!closed()) { lit = false; warned = false; return; }
  const b = bright();
  if (b > BURN) {
    burnI = amps();
    burnt = true;
    lit = false;
    rg.sound("hit");
    rg.vibrate([40, 30, 80]);
    rg.say("lamppu_paloi");
    for (let k = 0; k < 14; k++) puffs.push({ x: R + (rg.random() - 0.5) * 20, y: LY - 10, t: -k * 0.08, vx: (rg.random() - 0.5) * 30 });
    return;
  }
  if (b > 1.3) {
    if (!warned) { warned = true; rg.say("liian_kirkas"); rg.vibrate(30); }
  } else warned = false;
  if (b >= 0.05 && !lit) { lit = true; if (b <= 1.3) rg.say(b < 0.4 ? "lamppu_himmea" : "lamppu_syttyi"); }
  if (b < 0.05) lit = false;
}

function tick(dt: number) {
  t += dt;
  flow = (flow + amps() * 110 * dt) % PERIM;
  for (const p of puffs) { p.t += dt; p.y -= 40 * dt; p.x += p.vx * dt; }
  puffs = puffs.filter((p) => p.t < 2.2);
  const k = cur();
  if (mode === "play" && !solved && k.lo >= 0 && closed()) {
    const b = bright();
    if (b >= k.lo && b <= k.hi) {
      hold += dt;
      if (hold > 1.0) {
        solved = true;
        done[task] = true;
        rg.save("done", done);
        rg.celebrate(R, LY, { big: task === TASKS.length - 1 });
        rg.say("hienoa");
      }
    } else hold = 0;
  }
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; rg.sound("click"); }
}

function onKeyDown(key: string) {
  if (mode !== "play") return;
  if (key === " " || key === "Enter") toggle();
}

// ---- drawing -----------------------------------------------------------------

function fmt(n: number, d: number): string {
  const s = n.toFixed(d);
  return rg.lang === "fi" ? s.split(".").join(",") : s;
}

function hex2(n: number): string { const s = Math.round(rg.clamp(n, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }
function mix(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + hex2(pa[0] + (pb[0] - pa[0]) * k) + hex2(pa[1] + (pb[1] - pa[1]) * k) + hex2(pa[2] + (pb[2] - pa[2]) * k);
}

const BAND = ["#1b1b1b", "#7f4f24", "#d62828", "#f77f00", "#ffd60a", "#2a9d8f", "#3a86ff", "#7b2cbf", "#8d99ae", "#ffffff"];
const GOLD = "#d4a017";
function bands(ohm: number): string[] {
  if (ohm < 10) return [BAND[Math.floor(ohm)], BAND[Math.round((ohm * 10) % 10)], GOLD];
  const s = String(Math.round(ohm));
  return [BAND[+s.charAt(0)], BAND[+s.charAt(1)], BAND[s.length - 2]];
}

function batLook(v: number) {
  if (v < 2) return { w: 48, body: "#f77f00", end: "#2b2d42", text: "#ffffff" };
  if (v < 5) return { w: 50, body: "#3a86ff", end: "#1d3557", text: "#ffffff" };
  return { w: 54, body: "#2b2d42", end: "#e63946", text: "#ffd166" };
}

function volt(v: number): string { return fmt(v, v % 1 ? 1 : 0) + " V"; }

// a battery or a resistor, drawn at its natural size (positioned by the parent)
function PartView(p: Part) {
  if (p.kind === "bat") {
    const k = batLook(p.val);
    return (
      <div className="bat" style={{ width: k.w + 6 }}>
        <div className="batbody" style={{ width: k.w, backgroundColor: k.body }}>
          <div className="batend" style={{ backgroundColor: k.end }} />
          <div className="batlabel" style={{ color: k.text }}>{volt(p.val)}</div>
        </div>
        <div className="batnub" />
      </div>
    );
  }
  const c = bands(p.val);
  return (
    <div className="resw">
      <div className="res">
        <div className="band" style={{ backgroundColor: c[0] }} />
        <div className="band" style={{ backgroundColor: c[1] }} />
        <div className="band" style={{ backgroundColor: c[2] }} />
      </div>
      <div className="reslabel">{p.val + " Ω"}</div>
    </div>
  );
}

function wire(x: number, y: number, w: number, h: number, hot: boolean) {
  return <div className={hot ? "wire hot" : "wire"} style={{ left: x - 3, top: y - 3, width: w + 6, height: h + 6 }} />;
}

// a point at distance s along the loop, clockwise from the top-left corner
function along(s: number): number[] {
  const w = R - L, h = B - T;
  if (s < w) return [L + s, T];
  s -= w;
  if (s < h) return [R, T + s];
  s -= h;
  if (s < w) return [R - s, B];
  s -= w;
  return [L, B - s];
}

function Charges() {
  if (!closed()) return [];
  const out = [];
  const n = 26;
  for (let k = 0; k < n; k++) {
    const p = along((flow + (k * PERIM) / n) % PERIM);
    out.push(<div className="charge" style={{ left: p[0] - 4, top: p[1] - 4 }} />);
  }
  return out;
}

function Slots(slots: number[], y: number, kind: string) {
  return slots.map((pi, s) => {
    const x = SLOT_X[s];
    if (pi < 0) {
      return <div className="slot" id={kind + "s" + s} onClick={() => take(slots, s)} style={{ left: x - 30, top: y - 20 }}>
        <div className="slotplus">+</div></div>;
    }
    return (
      <div className="placed" id={kind + "s" + s} onClick={() => take(slots, s)} style={{ left: x - 34, top: y - 22 }}>
        {PartView(parts[pi])}
      </div>
    );
  });
}

function Switch() {
  const lever = on
    ? <div className="lever on" style={{ left: L - 4, top: SY - 22 }} />
    : <div className="lever" style={{ left: L + 8, top: SY - 26, transform: "rotate(35deg)" }} />;
  return [
    <div className="contact" style={{ left: L - 6, top: SY - 28 }} />,
    <div className="contact" style={{ left: L - 6, top: SY + 16 }} />,
    lever,
    <div className={on ? "swlabel on" : "swlabel"} style={{ left: L + 22, top: SY - 12 }}>{on ? rg.t("PÄÄLLÄ", "ON", "ON") : rg.t("POIS", "OFF", "OFF")}</div>,
    <div className="swhit" id="switch" onClick={() => toggle()} style={{ left: L - 26, top: SY - 40 }} />,
  ];
}

function Lamp() {
  const b = bright();
  const out = [];
  const fl = b > 1.3 ? 0.7 + 0.3 * Math.abs(Math.sin(t * 37)) : 1;
  if (!burnt && b > 0.01) {
    const g = Math.min(b, BURN) / BURN;
    const rings = [[180, 0.10], [120, 0.18], [76, 0.32]];
    for (const r of rings) {
      const d = r[0] * (0.45 + 0.55 * g);
      out.push(<div className="glow" style={{ left: R - d / 2, top: LY - 8 - d / 2, width: d, height: d, borderRadius: d / 2,
        opacity: Math.min(1, Math.min(b, 1.4) * r[1] * 2.4) * fl }} />);
    }
  }
  const k = rg.clamp(b / 1.4, 0, 1);
  const glass = burnt ? "#6c757d" : mix("#dde6ee", "#fff6c2", k);
  const fil = burnt ? "#2b2d42" : b < 0.01 ? "#5c5c5c" : b < 0.3 ? mix("#7a1f1f", "#ff7b00", b / 0.3) : mix("#ff9f1c", "#ffffff", rg.clamp((b - 0.3) / 0.9, 0, 1));
  out.push(<div className="bulb" style={{ left: R - 26, top: LY - 34, backgroundColor: glass }}>
    <div className={burnt ? "filament broken" : "filament"} style={{ borderColor: fil }} />
  </div>);
  out.push(<div className="lbase" style={{ left: R - 13, top: LY + 14 }}><div className="thread" /><div className="thread" /></div>);
  if (burnt) out.push(<div className="crack" style={{ left: R - 14, top: LY - 30 }}>💥</div>);
  for (const p of puffs) {
    if (p.t < 0) continue;
    const s = 14 + p.t * 18;
    out.push(<div className="puff" style={{ left: p.x - s / 2, top: p.y - s / 2, width: s, height: s, borderRadius: s / 2, opacity: Math.max(0, 0.6 - p.t * 0.27) }} />);
  }
  return out;
}

function Board() {
  const hot = closed();
  const b = bright();
  return [
    <div className="board" style={{ left: 8, top: T - 34, width: 344, height: B - T + 66 }} />,
    <div className="roomlight" style={{ left: 8, top: T - 34, width: 344, height: B - T + 66, opacity: burnt ? 0 : Math.min(b, 1.5) * 0.22 }} />,
    wire(L, T, R - L, 0, hot),
    wire(L, B, R - L, 0, hot),
    wire(R, T, 0, B - T, hot),
    wire(L, T, 0, SY - 22 - T, hot),
    wire(L, SY + 22, 0, B - SY - 22, hot),
    Charges(),
    Slots(bat, T, "b"),
    Slots(res, B, "r"),
    Switch(),
    Lamp(),
  ];
}

function Meter() {
  const k = cur();
  const u = volts(), rx = ohms(), rt = RL + rx;
  const i = amps(), p = watts(), b = bright();
  const U = rg.t("U", "V", "V");
  const top = B + 40;
  let status = "";
  let sc = "status";
  if (burnt) { status = rg.t("Lamppu paloi! ", "Burnt out! ", "¡Se quemó! ") + fmt(burnI, 2) + " A, " + fmt(burnI * burnI * RL, 0) + rg.t(" W on liikaa.", " W is too much.", " W es demasiado."); sc = "status bad"; }
  else if (u === 0) status = rg.t("Piirissä ei ole paristoa.", "There is no battery in the circuit.", "No hay pila en el circuito.");
  else if (!on) status = rg.t("Kytkin on auki: virta ei kulje.", "The switch is open: no current.", "El interruptor está abierto.");
  else if (b < 0.05) status = rg.t("Virta on niin pieni, ettei lamppu hehku.", "So little current that the lamp doesn't glow.", "Tan poca corriente que no brilla.");
  else if (b < 0.4) status = rg.t("Lamppu palaa himmeästi.", "The lamp glows dimly.", "La bombilla brilla poco.");
  else if (b < 0.8) status = rg.t("Lamppu palaa melko kirkkaasti.", "The lamp is fairly bright.", "Brilla bastante.");
  else if (b <= 1.3) status = rg.t("Lamppu palaa kirkkaasti.", "The lamp shines brightly.", "Brilla mucho.");
  else { status = rg.t("Liian kirkas! Lamppu kuumenee.", "Too bright! The lamp is getting hot.", "¡Demasiado! Se calienta."); sc = "status warn"; }
  if (solved) { status = rg.t("⭐ Onnistui!", "⭐ Well done!", "⭐ ¡Lo lograste!"); sc = "status good"; }
  else if (t - noteT < 2.2) status = note;
  const BW = 316;
  const x = (v: number) => Math.round((rg.clamp(v, 0, SCALE) / SCALE) * BW);
  return (
    <div className="meter" style={{ left: 10, top: top }}>
      <div className="row">
        <div className="mv">{"🔋 " + U + " = " + volt(u)}</div>
        <div className="mv">{"R = " + RL + (rx > 0 ? " + " + rx : "") + " = " + rt + " Ω"}</div>
      </div>
      <div className="row"><div className="mv">{"⚡ I = " + U + " / R = " + (closed() ? fmt(i, 2) : "0") + " A"}</div></div>
      <div className="row"><div className="mv">{"💡 P = I² · " + RL + " Ω = " + fmt(p, 1) + " W"}</div></div>
      <div className="bar">
        {k.lo >= 0 ? <div className="target" style={{ left: x(k.lo), width: x(k.hi) - x(k.lo) }} /> : null}
        <div className="danger" style={{ left: x(BURN), width: BW - x(BURN) }} />
        <div className="fill" style={{ width: burnt ? 0 : x(b), backgroundColor: b > 1.3 ? "#e63946" : "#ffb703" }} />
        <div className="tick" style={{ left: x(1) - 1 }} />
      </div>
      <div className="row scale">
        <div className="sl" style={{ left: 0 }}>0 %</div>
        <div className="sl" style={{ left: x(1) - 18 }}>100 %</div>
        <div className="sl" style={{ left: x(BURN) - 16 }}>💥</div>
      </div>
      <div className={sc}>{status}</div>
    </div>
  );
}

function Tray() {
  const top = B + 202;
  const tiles = [];
  for (let i = 0; i < parts.length; i++) {
    if (placed(i)) continue;
    tiles.push(<div className="tile" id={"p" + i} onClick={() => put(i)}>{PartView(parts[i])}</div>);
  }
  if (!burnt && !solved && (volts() > 0 || ohms() > 0))
    tiles.push(<div className="tile clear" id="clear" onClick={() => clearAll()}><div className="cleartext">{rg.t("🗑 Tyhjennä", "🗑 Clear", "🗑 Vaciar")}</div></div>);
  return (
    <div className="tray" style={{ left: 10, top: top }}>
      <div className="traytitle">{tiles.length ? rg.t("Osat – napauta laittaaksesi piiriin", "Parts – tap to add", "Piezas – toca para añadir") : rg.t("Kaikki osat ovat piirissä", "All parts are in the circuit", "Todas las piezas están puestas")}</div>
      <div className="tiles">{tiles}</div>
    </div>
  );
}

function Buttons() {
  const out = [];
  if (burnt) out.push(<div className="btn red" id="newlamp" onClick={() => newLamp()}>{rg.t("🔧 Uusi lamppu", "🔧 New lamp", "🔧 Bombilla nueva")}</div>);
  else if (solved && task >= 0 && task < TASKS.length - 1) out.push(<div className="btn green" id="next" onClick={() => start(task + 1)}>{rg.t("Seuraava ➜", "Next ➜", "Siguiente ➜")}</div>);
  else if (solved) out.push(<div className="btn green" id="menu2" onClick={() => { mode = "menu"; rg.sound("click"); }}>{rg.t("Valikkoon", "Menu", "Menú")}</div>);
  return <div className="buttons" style={{ top: height - 66 }}>{out}</div>;
}

function Play() {
  const k = cur();
  return (
    <div className="root">
      <div className="head">
        <div className="tname">{k.name}</div>
        <div className="ttext">{k.text}</div>
      </div>
      {Board()}
      {Meter()}
      {Tray()}
      {Buttons()}
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2.2) * 5;
  return (
    <div className="root menu">
      <div className="title" style={{ marginTop: 34 + bob }}>💡 {rg.t("Lamppulabra", "Lamp Lab", "Lab de la bombilla")}</div>
      <div className="lead">{rg.t("Paristot, vastukset ja lamppu", "Batteries, resistors and a lamp", "Pilas, resistencias y bombilla")}</div>
      {TASKS.map((k, i) => (
        <div className="level" id={"t" + i} onClick={() => start(i)}>
          <div className="lvname">{k.name + (done[i] ? "  ⭐" : "")}</div>
        </div>
      ))}
      <div className="level free" id="free" onClick={() => start(-1)}><div className="lvname">🔬 {FREE.name}</div></div>
      <div className="level helpb" id="help" onClick={() => { mode = "help"; rg.sound("click"); }}><div className="lvname">❓ {rg.t("Miten se toimii?", "How does it work?", "¿Cómo funciona?")}</div></div>
    </div>
  );
}

function Help() {
  const lines = [
    rg.t("🔋 Paristo antaa jännitteen U. Se mitataan voltteina (V). Peräkkäin kytkettyjen paristojen jännitteet lasketaan yhteen.",
      "🔋 A battery gives a voltage V, measured in volts (V). Batteries in a row add up.",
      "🔋 La pila da un voltaje V, en voltios (V). Las pilas en fila se suman."),
    rg.t("〰️ Vastus vastustaa virtaa. Se mitataan ohmeina (Ω). Lampussakin on oma 6 Ω vastus, ja kaikki vastukset lasketaan yhteen.",
      "〰️ A resistor resists the current, measured in ohms (Ω). The lamp has 6 Ω of its own, and all resistances add up.",
      "〰️ La resistencia frena la corriente, en ohmios (Ω). La bombilla tiene 6 Ω propios; todo se suma."),
    rg.t("⚡ Ohmin laki: virta I = U / R (ampeereina, A). Isompi paristo = enemmän virtaa, isompi vastus = vähemmän virtaa.",
      "⚡ Ohm's law: current I = V / R (amperes, A). Bigger battery = more current, bigger resistance = less current.",
      "⚡ Ley de Ohm: I = V / R (amperios, A). Más pila = más corriente, más resistencia = menos."),
    rg.t("💡 Lampun teho P = I² · R kertoo, kuinka kirkkaasti se palaa. 6 W on täysi kirkkaus (100 %). Yli 12 W:lla hehkulanka sulaa ja lamppu palaa poikki.",
      "💡 The lamp's power P = I² · R tells how bright it is. 6 W is full brightness (100 %). Over 12 W the filament melts and the lamp burns out.",
      "💡 La potencia P = I² · R dice cuánto brilla. 6 W es el 100 %. Con más de 12 W el filamento se funde."),
    rg.t("Tyhjä paikka piirissä on pelkkää johtoa. Kytkimestä virta kytketään päälle ja pois.",
      "An empty slot is just wire. The switch turns the current on and off.",
      "Un hueco vacío es solo cable. El interruptor enciende y apaga."),
  ];
  return (
    <div className="root menu">
      <div className="title small" style={{ marginTop: 30 }}>{rg.t("Miten se toimii?", "How does it work?", "¿Cómo funciona?")}</div>
      {lines.map((s) => <div className="helpline">{s}</div>)}
      <div className="level back" id="back" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  if (mode === "help") return Help();
  if (mode === "menu") return Menu();
  return Play();
}
