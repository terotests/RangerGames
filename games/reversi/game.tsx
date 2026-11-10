// Reversi: put a disc so that the other player's discs are left between it
// and your own disc, and they turn to your colour. The one with more discs
// when the board is full wins. With a friend or against the phone (three
// levels). Rules and the phone's thinking: lib/rules.ts.

import { start, flips, moves, play, next, count, startThink, stepThink } from "lib/rules";

type Screen = "menu" | "level" | "game";
type Flip = { i: number; delay: number; t: number; from: number };

const CELL = 40, PAD = 8;
const BW = CELL * 8 + PAD * 2;
const BT = 158;

let screen: Screen = "menu";
let vsPhone = true;
let level = 2;
let b: number[] = start();
let turn = 1;              // 1 dark, 2 light; 0 when over
let human = 2;             // vs the phone: the human plays dark
let last = -1;
let flipping: Flip[] = [];
let hints = true;
let t = 0;
let thinkClock = 0;
let thinking = false;
let passMsg = 0;           // seconds left on "no moves" banner
let passWho = 0;
let overClock = 0;
let toldRules = false;
let bump: number[] = [0, 0, 0];

function init() { level = rg.load("level", 2); hints = rg.load("hints", true); }

function L() { return Math.floor((width - BW) / 2); }
function cx(i: number) { return L() + PAD + (i % 8) * CELL; }
function cy(i: number) { return BT + PAD + Math.floor(i / 8) * CELL; }

function who(p: number) {
  if (vsPhone) return p === human ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return p === 1 ? rg.t("Musta", "Black", "Negro") : rg.t("Valkoinen", "White", "Blanco");
}
function phoneTurn() { return vsPhone && turn !== 0 && turn !== human; }

function newGame(phone: boolean) {
  vsPhone = phone;
  b = start(); turn = 1; last = -1; flipping = []; thinking = false; passMsg = 0; overClock = 0;
  if (phone) human = human === 1 ? 2 : 1;   // take turns starting
  else human = 1;
  screen = "game";
  rg.sound("click");
  const first = phone ? (turn === human ? "sinun_vuorosi" : "minun_vuoroni") : "rv_musta_aloittaa";
  if (!toldRules) { toldRules = true; rg.say(["rv_ohje", first]); } else rg.say(first);
}

function busy() { for (const f of flipping) if (f.t < f.delay + 0.36) return true; return false; }

function place(i: number) {
  const f = flips(b, i, turn);
  if (!f.length) return;
  const p = turn;
  play(b, i, p);
  last = i;
  const r0 = Math.floor(i / 8), c0 = i % 8;
  flipping = f.map((x) => ({ i: x, from: 3 - p, t: 0, delay: 0.07 * Math.max(Math.abs(Math.floor(x / 8) - r0), Math.abs(x % 8 - c0)) }));
  rg.sound("pop", { pitch: p === 1 ? 0.9 : 1.2 });
  rg.vibrate(12);
  if (f.length >= 5) { rg.celebrate(cx(i) + CELL / 2, cy(i) + CELL / 2, { count: 10, sound: false }); }
  bump[p] = 0.4;
  const n = next(b, p);
  if (n === 0) { turn = 0; overClock = 0; endSounds(); return; }
  if (n === p) { passWho = 3 - p; passMsg = 2.2; rg.say("rv_ohitus"); }
  turn = n;
  thinkClock = 0; thinking = false;
}

function endSounds() {
  const d = count(b, 1) - count(b, 2);
  const w = d > 0 ? 1 : d < 0 ? 2 : 0;
  if (!w) { rg.sound("wrong"); rg.say("tasapeli"); return; }
  if (vsPhone && w !== human) { rg.sound("lose"); rg.say("puhelin_voitti"); return; }
  rg.celebrate(width / 2, BT + BW / 2, { big: true });
  rg.say(vsPhone ? "voitit" : w === 1 ? "rv_musta_voitti" : "rv_valkoinen_voitti");
}

function tap(i: number) {
  if (turn === 0 || phoneTurn() || busy()) return;
  if (!flips(b, i, turn).length) { rg.sound("wrong"); rg.vibrate(30); return; }
  place(i);
}

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  for (const f of flipping) f.t += dt;
  if (!busy()) flipping = [];
  if (passMsg > 0) passMsg -= dt;
  for (let p = 1; p <= 2; p++) if (bump[p] > 0) bump[p] -= dt;
  if (turn === 0) { overClock += dt; return; }
  if (screen === "game" && phoneTurn() && !busy()) {
    thinkClock += dt;
    if (thinkClock < 0.45) return;
    if (!thinking) { thinking = true; startThink(b, turn, level, rg.random); return; }
    const m = stepThink();
    if (m >= 0) { thinking = false; place(m); }
  }
}

function onBack() {
  if (screen === "game" || screen === "level") { screen = "menu"; rg.sound("click"); } else rg.exit();
}

// a disc: the colour it shows, and how wide it is mid-flip
function Disc(i: number, p: number, w: number) {
  const s = 34;
  return <div className={p === 1 ? "disc dark" : "disc light"} style={{ left: cx(i) + 3 + (s - w) / 2, top: cy(i) + 3, width: w, height: s }}>
    {w > 20 ? <div className={p === 1 ? "shine sd" : "shine sl"} /> : null}
  </div>;
}

function Pill(p: number) {
  const on = turn === p;
  const n = count(b, p);
  const big = bump[p] > 0 ? 1 + bump[p] * 0.5 : 1;
  return (
    <div className={on ? "pill pon" : "pill"}>
      <div className={p === 1 ? "pdisc dark" : "pdisc light"} />
      <div className="pname">{who(p)}</div>
      <div className="pscore" style={{ fontSize: Math.round(26 * big) }}>{String(n)}</div>
    </div>
  );
}

function status() {
  if (turn === 0) {
    const d = count(b, 1) - count(b, 2);
    if (!d) return rg.t("Tasapeli!", "Draw!", "¡Empate!");
    const w = d > 0 ? 1 : 2;
    if (vsPhone) return w === human ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!");
    return rg.t(who(w) + " voitti! 🎉", who(w) + " won! 🎉", "¡Ganó " + who(w) + "! 🎉");
  }
  if (passMsg > 0) return rg.t(who(passWho) + ": ei siirtoja!", who(passWho) + ": no moves!", who(passWho) + ": ¡sin jugadas!");
  if (phoneTurn()) return rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono piensa…");
  return rg.t("Vuoro: ", "Turn: ", "Turno: ") + who(turn);
}

function Game() {
  const kids = [];
  const l = L();
  kids.push(<div className="top" style={{ left: 0, top: 56, width: width }}>{Pill(1)}{Pill(2)}</div>);
  kids.push(<div className={turn === 0 ? "status sbig" : "status"} style={{ left: 0, top: 116, width: width }}>{status()}</div>);
  const cells = [];
  for (let i = 0; i < 64; i++) {
    cells.push(<div className={(Math.floor(i / 8) + i) % 2 === 0 ? "cell c1" : "cell c2"} style={{ left: PAD + (i % 8) * CELL, top: PAD + Math.floor(i / 8) * CELL }} />);
  }
  kids.push(<div className="frame" style={{ left: l, top: BT, width: BW, height: BW }}>{cells}</div>);
  // the legal moves
  const canTap = turn !== 0 && !phoneTurn() && !busy();
  if (canTap && hints) {
    const pulse = 0.55 + 0.25 * Math.sin(t * 5);
    for (const m of moves(b, turn)) {
      kids.push(<div className={turn === 1 ? "hint hd" : "hint hl"} style={{ left: cx(m) + 13, top: cy(m) + 13, opacity: String(pulse) }} />);
    }
  }
  if (last >= 0) kids.push(<div className="last" style={{ left: cx(last) + 1, top: cy(last) + 1 }} />);
  for (let i = 0; i < 64; i++) {
    if (!b[i]) continue;
    let p = b[i], w = 34;
    for (const f of flipping) if (f.i === i) {
      const k = (f.t - f.delay) / 0.36;
      if (k < 0) p = f.from;
      else if (k < 0.5) { p = f.from; w = 34 * (1 - k * 2); }
      else if (k < 1) w = 34 * (k * 2 - 1);
      if (w < 2) w = 2;
    }
    if (i === last && flipping.length) {
      const k = Math.min(1, flipping[0].t / 0.15);
      w = 34 * (0.6 + 0.4 * k);
      kids.push(<div className={p === 1 ? "disc dark" : "disc light"} style={{ left: cx(i) + 3 + (34 - w) / 2, top: cy(i) + 3 + (34 - w) / 2, width: w, height: w }} />);
      continue;
    }
    kids.push(Disc(i, p, w));
  }
  if (canTap) {
    for (let i = 0; i < 64; i++) kids.push(<div className="tapcell" id={"c" + i} style={{ left: cx(i), top: cy(i) }} onClick={() => tap(i)} />);
  }
  const by = BT + BW + 14;
  if (turn !== 0) {
    kids.push(<div className="row" style={{ left: 0, top: by, width: width }}>
      <div className="btn back small" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
      <div className={hints ? "btn small2 hon" : "btn small2 hoff"} id="hints" onClick={() => { hints = !hints; rg.save("hints", hints); rg.sound("click"); }}>{hints ? "💡 " + rg.t("Vihjeet", "Hints", "Pistas") : "💡 " + rg.t("Ei vihjeitä", "No hints", "Sin pistas")}</div>
    </div>);
  }
  if (turn === 0 && overClock > 1.0) {
    kids.push(
      <div className="panel" style={{ left: (width - 280) / 2, top: BT + 60 }}>
        <div className="ptitle">{status()}</div>
        <div className="pcount">{"⚫ " + count(b, 1) + "   ⚪ " + count(b, 2)}</div>
        <div className="btn again" id="again" onClick={() => newGame(vsPhone)}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div>
        <div className="btn back pback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
      </div>
    );
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const demo = [];
  const k = Math.floor(t * 1.2) % 4;
  for (let j = 0; j < 4; j++) {
    const p = (j + k) % 2 === 0 ? 1 : 2;
    demo.push(<div className={p === 1 ? "mdisc dark" : "mdisc light"} style={{ marginTop: 10 + Math.sin(t * 3 + j) * 6 }}><div className={p === 1 ? "mshine sd" : "mshine sl"} /></div>);
  }
  return (
    <div className="screen menu">
      <div className="title">Reversi</div>
      <div className="demo">{demo}</div>
      <div className="mhint">{rg.t("Saarra kaverin nappulat, niin ne kääntyvät sinun värisiksi!", "Trap the other discs between yours and they turn to your colour!", "¡Atrapa las fichas del rival entre las tuyas y cambian de color!")}</div>
      <div className="btn mbtn" id="vsphone" onClick={() => { screen = "level"; rg.sound("click"); }}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn mbtn alt" id="vsfriend" onClick={() => newGame(false)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn mbtn back" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function LevelMenu() {
  const lv = (n: number, icon: string, name: string, cls: string) => (
    <div className={"btn mbtn " + cls} id={"level" + n} onClick={() => { level = n; rg.save("level", n); newGame(true); }}>{icon + " " + name}</div>
  );
  return (
    <div className="screen menu">
      <div className="subtitle">{rg.t("Kuinka vaikea?", "How hard?", "¿Qué tan difícil?")}</div>
      {lv(1, "🐣", rg.t("Helppo", "Easy", "Fácil"), "easy")}
      {lv(2, "🦊", rg.t("Keskitaso", "Medium", "Medio"), "medium")}
      {lv(3, "🦉", rg.t("Vaikea", "Hard", "Difícil"), "hard")}
      <div className="btn mbtn back" id="back" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}

function view() {
  if (screen === "menu") return Menu();
  if (screen === "level") return LevelMenu();
  return Game();
}
