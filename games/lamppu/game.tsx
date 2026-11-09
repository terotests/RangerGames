// Lamppulabra: one battery, one resistor and a lamp. Pick the battery and
// the resistor (with its real colour code) and watch the lamp: the smaller
// the resistance, the brighter it glows, and right at the limit the filament
// melts, the lamp pops and goes black.
//
// The physics is Ohm's law: I = U / (R + 6 Ω), the lamp's own resistance is
// 6 Ω and its power P = I² · 6 Ω. 6 W is full brightness; over 9 W it pops.

type Puff = { x: number; y: number; t: number; vx: number };

const RL = 6;          // the lamp's resistance, Ω
const PFULL = 6;       // full brightness, W
const BURN = 1.5;      // brightness (P / PFULL) at which the lamp pops
const BATS = [1.5, 4.5, 9];
const RESS = [1, 2.2, 4.7, 10, 22, 47, 100];

// the circuit loop
const L = 34, R = 300, T = 112, B = 268;
const LY = (T + B) / 2;
const BX = 150, RX = 150;
const PERIM = 2 * (R - L) + 2 * (B - T);

// the three things to find, lit up when found
const GOALS = [
  { icon: "🌙", lo: 0.05, hi: 0.3, name: rg.t("Himmeä yövalo", "Dim night light", "Luz tenue") },
  { icon: "☀️", lo: 0.8, hi: 1.2, name: rg.t("Kirkas valo", "Bright light", "Luz brillante") },
  { icon: "🔥", lo: 1.3, hi: BURN, name: rg.t("Melkein poksahti!", "Almost popped!", "¡Casi explota!") },
];

let bat = 1;           // index in BATS
let res = 3;           // index in RESS
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

function volts(): number { return BATS[bat]; }
function ohms(): number { return RESS[res]; }
function amps(): number { return burnt ? 0 : volts() / (RL + ohms()); }
function watts(): number { const i = amps(); return i * i * RL; }
function bright(): number { return watts() / PFULL; }

// ---- actions -----------------------------------------------------------------

function pickBat(i: number) {
  if (burnt) { rg.sound("tick"); return; }
  bat = i;
  rg.sound("pop", { pitch: 0.8 + i * 0.2 });
  changed();
}

function pickRes(i: number) {
  if (burnt) { rg.sound("tick"); return; }
  res = i;
  rg.sound("click");
  changed();
}

function newLamp() {
  burnt = false;
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
    for (let k = 0; k < 14; k++) puffs.push({ x: R + (rg.random() - 0.5) * 20, y: LY - 10, t: -k * 0.08, vx: (rg.random() - 0.5) * 30 });
    return;
  }
  if (b > 1.25) { if (!warned) { warned = true; rg.say("liian_kirkas"); rg.vibrate(30); } }
  else warned = false;
}

function tick(dt: number) {
  t += dt;
  flow = (flow + amps() * 110 * dt) % PERIM;
  for (const p of puffs) { p.t += dt; p.y -= 40 * dt; p.x += p.vx * dt; }
  puffs = puffs.filter((p) => p.t < 2.2);
  if (burnt) return;
  const b = bright();
  for (let k = 0; k < GOALS.length; k++) {
    if (found[k]) continue;
    if (b >= GOALS[k].lo && b <= GOALS[k].hi) {
      hold[k] += dt;
      if (hold[k] > 0.8) {
        found[k] = true;
        rg.save("found", found);
        rg.sound("win");
        rg.celebrate(R, LY, { big: found.every((f) => f) });
        rg.say(found.every((f) => f) ? "hienoa" : "lamppu_syttyi");
      }
    } else hold[k] = 0;
  }
}

function onBack() { if (help) help = false; else rg.exit(); }

function onKeyDown(key: string) {
  if (key === "ArrowRight") pickRes(Math.min(RESS.length - 1, res + 1));
  if (key === "ArrowLeft") pickRes(Math.max(0, res - 1));
  if (key === "ArrowUp") pickBat(Math.min(BATS.length - 1, bat + 1));
  if (key === "ArrowDown") pickBat(Math.max(0, bat - 1));
}

// ---- drawing -----------------------------------------------------------------

function fmt(n: number, d: number): string {
  const s = n.toFixed(d);
  return rg.lang === "fi" ? s.split(".").join(",") : s;
}
function num(n: number): string { return fmt(n, n % 1 ? 1 : 0); }

function hex2(n: number): string { const s = Math.round(rg.clamp(n, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }
function mix(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + hex2(pa[0] + (pb[0] - pa[0]) * k) + hex2(pa[1] + (pb[1] - pa[1]) * k) + hex2(pa[2] + (pb[2] - pa[2]) * k);
}

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

function batLook(v: number) {
  if (v < 2) return { w: 46, body: "#f77f00", end: "#2b2d42", text: "#ffffff" };
  if (v < 5) return { w: 52, body: "#3a86ff", end: "#1d3557", text: "#ffffff" };
  return { w: 58, body: "#2b2d42", end: "#e63946", text: "#ffd166" };
}

function BatView(v: number) {
  const k = batLook(v);
  return (
    <div className="bat" style={{ width: k.w + 6 }}>
      <div className="batbody" style={{ width: k.w, backgroundColor: k.body }}>
        <div className="batend" style={{ backgroundColor: k.end }} />
        <div className="batlabel" style={{ color: k.text }}>{num(v) + " V"}</div>
      </div>
      <div className="batnub" />
    </div>
  );
}

function ResView(ohm: number, big: boolean) {
  const c = bands(ohm);
  return (
    <div className="resw">
      <div className={big ? "res big" : "res"}>
        <div className="band" style={{ backgroundColor: c[0] }} />
        <div className="band" style={{ backgroundColor: c[1] }} />
        <div className="band" style={{ backgroundColor: c[2] }} />
        <div className="gap" />
        <div className="band" style={{ backgroundColor: c[3] }} />
      </div>
      <div className="reslabel">{num(ohm) + " Ω"}</div>
    </div>
  );
}

function wire(x: number, y: number, w: number, h: number, hot: boolean) {
  return <div className={hot ? "wire hot" : "wire"} style={{ left: x - 3, top: y - 3, width: w + 6, height: h + 6 }} />;
}

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
  if (burnt) return [];
  const out = [];
  const n = 24;
  for (let k = 0; k < n; k++) {
    const p = along((flow + (k * PERIM) / n) % PERIM);
    out.push(<div className="charge" style={{ left: p[0] - 4, top: p[1] - 4 }} />);
  }
  return out;
}

function Lamp() {
  const b = bright();
  const out = [];
  const fl = b > 1.25 ? 0.7 + 0.3 * Math.abs(Math.sin(t * 37)) : 1;
  if (!burnt && b > 0.01) {
    const g = Math.min(b, BURN) / BURN;
    const rings = [[190, 0.10], [128, 0.18], [80, 0.32]];
    for (const r of rings) {
      const d = r[0] * (0.45 + 0.55 * g);
      out.push(<div className="glow" style={{ left: R - d / 2, top: LY - 8 - d / 2, width: d, height: d, borderRadius: d / 2,
        opacity: Math.min(1, Math.min(b, 1.4) * r[1] * 2.4) * fl }} />);
    }
  }
  const k = rg.clamp(b / 1.4, 0, 1);
  const glass = burnt ? "#1b1b1b" : mix("#dde6ee", "#fff6c2", k);
  const fil = burnt ? "#000000" : b < 0.01 ? "#5c5c5c" : b < 0.3 ? mix("#7a1f1f", "#ff7b00", b / 0.3) : mix("#ff9f1c", "#ffffff", rg.clamp((b - 0.3) / 0.9, 0, 1));
  out.push(<div className="bulb" style={{ left: R - 30, top: LY - 40, backgroundColor: glass }}>
    <div className={burnt ? "filament broken" : "filament"} style={{ borderColor: fil }} />
  </div>);
  out.push(<div className="lbase" style={{ left: R - 13, top: LY + 18 }}><div className="thread" /><div className="thread" /></div>);
  if (burnt) out.push(<div className="crack" style={{ left: R - 16, top: LY - 36 }}>💥</div>);
  for (const p of puffs) {
    if (p.t < 0) continue;
    const s = 14 + p.t * 18;
    out.push(<div className="puff" style={{ left: p.x - s / 2, top: p.y - s / 2, width: s, height: s, borderRadius: s / 2, opacity: Math.max(0, 0.6 - p.t * 0.27) }} />);
  }
  return out;
}

function Board() {
  const hot = !burnt;
  const b = bright();
  return [
    <div className="board" style={{ left: 8, top: T - 40, width: 344, height: B - T + 76 }} />,
    <div className="roomlight" style={{ left: 8, top: T - 40, width: 344, height: B - T + 76, opacity: burnt ? 0 : Math.min(b, 1.5) * 0.22 }} />,
    wire(L, T, R - L, 0, hot),
    wire(L, B, R - L, 0, hot),
    wire(R, T, 0, B - T, hot),
    wire(L, T, 0, B - T, hot),
    Charges(),
    <div className="placed" style={{ left: BX - 34, top: T - 22 }}>{BatView(volts())}</div>,
    <div className="placed big" style={{ left: RX - 44, top: B - 22 }}>{ResView(ohms(), true)}</div>,
    Lamp(),
  ];
}

function Meter() {
  const u = volts(), r = ohms(), i = amps(), b = bright();
  let status = "";
  let sc = "status";
  if (burnt) { status = rg.t("Poks! Lamppu paloi: ", "Pop! The lamp burnt out: ", "¡Pum! Se quemó: ") + fmt(burnI, 2) + " A " + rg.t("oli liikaa.", "was too much.", "fue demasiado."); sc = "status bad"; }
  else if (b < 0.05) status = rg.t("Virta on niin pieni, ettei lamppu hehku.", "So little current that the lamp doesn't glow.", "Tan poca corriente que no brilla.");
  else if (b < 0.4) status = rg.t("Lamppu palaa himmeästi.", "The lamp glows dimly.", "La bombilla brilla poco.");
  else if (b < 0.8) status = rg.t("Lamppu palaa melko kirkkaasti.", "The lamp is fairly bright.", "Brilla bastante.");
  else if (b <= 1.25) status = rg.t("Lamppu palaa kirkkaasti.", "The lamp shines brightly.", "Brilla mucho.");
  else { status = rg.t("Varo! Ihan rajalla, lamppu kuumenee.", "Careful! Right at the limit, the lamp is getting hot.", "¡Cuidado! Al límite, se calienta."); sc = "status warn"; }
  const BW = 316;
  const x = (v: number) => Math.round((rg.clamp(v, 0, 1.7) / 1.7) * BW);
  return (
    <div className="meter" style={{ left: 10, top: B + 46 }}>
      <div className="row"><div className="mv">{"⚡ I = " + num(u) + " V / (" + num(r) + " Ω + 6 Ω) = " + fmt(i, 2) + " A"}</div></div>
      <div className="bar">
        <div className="danger" style={{ left: x(BURN), width: BW - x(BURN) }} />
        <div className="fill" style={{ width: burnt ? 0 : x(b), backgroundColor: b > 1.25 ? "#e63946" : "#ffb703" }} />
        <div className="tick" style={{ left: x(1) - 1 }} />
      </div>
      <div className={sc}>{status}</div>
    </div>
  );
}

function Pickers() {
  const top = B + 150;
  if (burnt) {
    return <div className="buttons" style={{ top: top + 20 }}>
      <div className="btn red" id="newlamp" onClick={() => newLamp()}>{rg.t("🔧 Uusi lamppu", "🔧 New lamp", "🔧 Bombilla nueva")}</div>
    </div>;
  }
  return (
    <div className="pickers" style={{ left: 8, top: top }}>
      <div className="prow">
        {BATS.map((v, i) => <div className={i === bat ? "pick on" : "pick"} id={"b" + i} onClick={() => pickBat(i)}>{BatView(v)}</div>)}
      </div>
      <div className="prow">
        {RESS.map((v, i) => <div className={i === res ? "pick r on" : "pick r"} id={"r" + i} onClick={() => pickRes(i)}>{ResView(v, false)}</div>)}
      </div>
    </div>
  );
}

function Head() {
  return (
    <div className="head">
      <div className="tname">💡 {rg.t("Lamppulabra", "Lamp Lab", "Lab de la bombilla")}</div>
      <div className="ttext">{rg.t("Valitse paristo ja vastus. Mitä pienempi vastus, sitä kirkkaampi valo!", "Pick a battery and a resistor. The smaller the resistance, the brighter the light!", "Elige pila y resistencia. ¡Menos resistencia, más luz!")}</div>
      <div className="goals">
        {GOALS.map((g, k) => <div className={found[k] ? "goal on" : "goal"}><div className="gicon">{g.icon}</div><div className="gname">{g.name}</div></div>)}
        <div className="goal helpb" id="help" onClick={() => { help = !help; rg.sound("click"); }}><div className="gicon">❓</div></div>
      </div>
    </div>
  );
}

function Help() {
  const lines = [
    rg.t("🔋 Paristo antaa jännitteen U voltteina (V). Isompi paristo työntää enemmän virtaa.",
      "🔋 The battery gives a voltage V in volts (V). A bigger battery pushes more current.",
      "🔋 La pila da un voltaje en voltios (V). Más voltaje empuja más corriente."),
    rg.t("〰️ Vastus vastustaa virtaa. Se mitataan ohmeina (Ω). Lampussa on oma 6 Ω vastus.",
      "〰️ A resistor resists the current, measured in ohms (Ω). The lamp has 6 Ω of its own.",
      "〰️ La resistencia frena la corriente, en ohmios (Ω). La bombilla tiene 6 Ω propios."),
    rg.t("🎨 Värikoodi: kaksi ensimmäistä raitaa ovat numerot, kolmas kertoo nollat (kulta = pilkku yhden numeron jälkeen), viimeinen kultainen raita on tarkkuus ±5 %. Ruskea–musta–musta = 10 Ω.",
      "🎨 Colour code: the first two bands are digits, the third tells the zeros (gold = a decimal point after one digit), the last gold band is the ±5 % tolerance. Brown–black–black = 10 Ω.",
      "🎨 Código de colores: las dos primeras bandas son cifras, la tercera los ceros (oro = coma tras una cifra), la última dorada es la tolerancia ±5 %. Marrón–negro–negro = 10 Ω."),
    rg.t("⚡ Ohmin laki: I = U / R. Kun lampun teho nousee yli 9 W, hehkulanka sulaa ja lamppu poksahtaa.",
      "⚡ Ohm's law: I = V / R. When the lamp's power goes over 9 W, the filament melts and the lamp pops.",
      "⚡ Ley de Ohm: I = V / R. Con más de 9 W el filamento se funde y la bombilla explota."),
    rg.t("Nyt vastus: ", "This resistor: ", "Esta resistencia: ") + bandWords(ohms()) + " = " + num(ohms()) + " Ω",
  ];
  return (
    <div className="root menu">
      <div className="title small" style={{ marginTop: 30 }}>{rg.t("Miten se toimii?", "How does it work?", "¿Cómo funciona?")}</div>
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
      {Pickers()}
    </div>
  );
}
