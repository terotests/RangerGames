// Sulje laatikko (shut the box): roll two dice and shut open numbers that
// add up to the roll, e.g. 8 = 5 + 3. When nothing adds up, the round ends
// and the numbers left open count as points: fewer is better, and shutting
// them all wins at once. Alone (beat your best), or a friend / the phone
// plays a round after you and the smaller score wins. lib/rules.ts.

import { combos, openSum, oneDieOk, bestCombo } from "lib/rules";

type Screen = "menu" | "game";
type Phase = "roll" | "rolling" | "choose" | "stuck" | "over";

let screen: Screen = "menu";
let mode = 0;              // 0 alone, 1 friend, 2 phone
let open: boolean[] = [];
let sel: number[] = [];
let dice = [1, 1];
let nDice = 2;
let phase: Phase = "roll";
let clock = 0;
let player = 1;
let scores = [-1, -1, -1];
let shake = 0;
let flaps: number[] = [];  // per tile: how far it has flipped shut, 0..1
let t = 0;
let phoneClock = 0;
let phonePlan: number[] = [];
let best = -1;
let toldRules = false;

function init() { best = rg.load("best", -1); }

function roll() { return nDice === 1 ? dice[0] : dice[0] + dice[1]; }
function selSum() { let s = 0; for (const n of sel) s += n; return s; }
function who(p: number) {
  if (mode === 2) return p === 1 ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return p === 1 ? rg.t("Pelaaja 1", "Player 1", "Jugador 1") : rg.t("Pelaaja 2", "Player 2", "Jugador 2");
}
function phoneTurn() { return mode === 2 && player === 2; }

function resetBox() {
  open = [false]; flaps = [0];
  for (let n = 1; n <= 9; n++) { open.push(true); flaps.push(0); }
  sel = []; phase = "roll"; phoneClock = 0;
}

function newGame(m: number) {
  mode = m; player = 1; scores = [-1, -1, -1];
  resetBox();
  screen = "game";
  rg.sound("click");
  if (!toldRules) { toldRules = true; rg.say("sl_ohje"); }
}

function doRoll(n: number) {
  if (phase !== "roll") return;
  nDice = n;
  phase = "rolling"; clock = 0;
  rg.sound("whoosh"); rg.vibrate([10, 30, 10]);
}

function finishRoll() {
  dice = [1 + Math.floor(rg.random() * 6), 1 + Math.floor(rg.random() * 6)];
  sel = [];
  rg.sound("hit");
  rg.say("n" + roll());
  if (!combos(open, roll()).length) { phase = "stuck"; clock = 0; rg.sound("wrong"); return; }
  phase = "choose";
  phonePlan = phoneTurn() ? bestCombo(open, roll()) : [];
  phoneClock = 0;
}

function tapTile(n: number) {
  if (phase !== "choose" || phoneTurn() || !open[n]) return;
  toggle(n);
}

function toggle(n: number) {
  const k = sel.indexOf(n);
  if (k >= 0) { sel.splice(k, 1); rg.sound("tick"); return; }
  sel.push(n);
  const s = selSum();
  rg.sound("tick", { pitch: 1.3 });
  if (s > roll()) { shake = 0.35; rg.sound("wrong"); rg.vibrate(30); sel = []; return; }
  if (s === roll()) {
    // the sum aloud: 5 plus 3 is 8
    if (sel.length > 1) { const ids = []; for (let i = 0; i < sel.length; i++) { if (i) ids.push("plus"); ids.push("n" + sel[i]); } ids.push("on"); ids.push("n" + s); rg.say(ids); }
    for (const x of sel) open[x] = false;
    sel = [];
    rg.sound("coin"); rg.vibrate(15);
    if (openSum(open) === 0) { roundOver(); return; }
    phase = "roll";
    phoneClock = 0;
  }
}

function roundOver() {
  const s = openSum(open);
  scores[player] = s;
  if (s === 0) { rg.celebrate(width / 2, 260, { big: true }); rg.sound("win"); rg.say("sl_suljettu"); }
  if (mode === 0) {
    if (best < 0 || s < best) { best = s; rg.save("best", best); }
    phase = "over"; clock = 0; return;
  }
  if (player === 1 && s > 0) { phase = "stuck"; clock = 0; return; }   // the other player's turn after the banner
  phase = "over"; clock = 0;
  const a = scores[1], b = scores[2] < 0 ? 999 : scores[2];
  if (s === 0 && player === 1) { rg.say(mode === 2 ? "voitit" : "sl_pelaaja1_voitti", { queue: true }); return; }
  if (a === b) rg.say("tasapeli");
  else if (mode === 2 && b < a) { rg.sound("lose"); rg.say("puhelin_voitti"); }
  else { rg.celebrate(width / 2, 260, { big: true }); rg.say(mode === 2 ? "voitit" : a < b ? "sl_pelaaja1_voitti" : "sl_pelaaja2_voitti"); }
}

function nextAfterStuck() {
  if (scores[player] < 0) { roundOver(); if (phase === "over") return; }
  if (mode !== 0 && player === 1) {
    player = 2; resetBox();
    rg.say(mode === 2 ? "minun_vuoroni" : "sl_pelaaja2_vuoro");
  }
}

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  if (shake > 0) shake -= dt;
  for (let n = 1; n <= 9; n++) {
    const goal = open[n] ? 0 : 1;
    flaps[n] += (goal - flaps[n]) * Math.min(1, dt * 12);
  }
  clock += dt;
  if (phase === "rolling") {
    if (clock < 0.7) { if (Math.floor(clock * 20) !== Math.floor((clock - dt) * 20)) dice = [1 + Math.floor(rg.random() * 6), 1 + Math.floor(rg.random() * 6)]; }
    else finishRoll();
    return;
  }
  if (phase === "stuck") {
    if (clock > 2.2 && (mode !== 0 || scores[player] < 0)) {
      if (mode === 0) { roundOver(); return; }
      nextAfterStuck();
    }
    return;
  }
  if (phoneTurn()) {
    phoneClock += dt;
    if (phase === "roll" && phoneClock > 0.8) doRoll(oneDieOk(open) && openSum(open) <= 6 ? 1 : 2);
    else if (phase === "choose" && phoneClock > 0.7 && phonePlan.length) { const n = phonePlan.shift() as number; phoneClock = 0.2; toggle(n); }
  }
}

function onBack() { if (screen === "game") { screen = "menu"; rg.sound("click"); } else rg.exit(); }

const PIPS: number[][] = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
function Die(v: number, x: number, y: number, s: number) {
  const pips = [];
  for (let k = 0; k < 9; k++) pips.push(<div className={PIPS[v].indexOf(k) >= 0 ? "pip" : "pip nopip"} style={{ width: s * 0.18, height: s * 0.18, borderRadius: s * 0.09, margin: s * 0.04 }} />);
  return <div className="die" style={{ left: x, top: y, width: s, height: s, padding: s * 0.08 }}>{pips}</div>;
}

function Tile(n: number) {
  const k = flaps[n];
  const tw = 96, th = 74;
  const col = (n - 1) % 3, row = Math.floor((n - 1) / 3);
  let x = Math.floor((width - 3 * tw - 2 * 10) / 2) + col * (tw + 10);
  const y = 214 + row * (th + 12);
  const on = sel.indexOf(n) >= 0;
  if (shake > 0 && open[n]) x += Math.sin(shake * 60) * 3;
  const h = th * (1 - 0.65 * k);
  return <div className={!open[n] ? "tile shut" : on ? "tile tsel" : "tile"} id={"t" + n}
    style={{ left: x, top: y + (th - h), width: tw, height: h }} onClick={() => tapTile(n)}>
    <div className={k > 0.5 ? "tnum tsmall" : "tnum"}>{String(n)}</div>
  </div>;
}

function status() {
  if (phase === "over") {
    if (mode === 0) return scores[1] === 0 ? rg.t("Laatikko suljettu! 🎉", "Box shut! 🎉", "¡Caja cerrada! 🎉") : rg.t("Pisteet: ", "Points: ", "Puntos: ") + scores[1];
    const a = scores[1], b = scores[2] < 0 ? 999 : scores[2];
    if (a === b) return rg.t("Tasapeli!", "Draw!", "¡Empate!");
    const w = a < b ? 1 : 2;
    if (mode === 2) return w === 1 ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!");
    return rg.t(who(w) + " voitti! 🎉", who(w) + " won! 🎉", "¡Ganó " + who(w) + "! 🎉");
  }
  if (phase === "stuck") return rg.t("Ei käy! Pisteet: ", "No way! Points: ", "¡No se puede! Puntos: ") + openSum(open);
  if (phase === "choose") {
    const s = selSum();
    return sel.length ? sel.join(" + ") + " = " + s + (s < roll() ? "  …" + roll() : "") : rg.t("Valitse numerot, yhteensä ", "Pick numbers that make ", "Elige números que sumen ") + roll();
  }
  if (phase === "rolling") return "🎲 …";
  return rg.t("Heitä noppaa!", "Roll the dice!", "¡Tira los dados!");
}

function Game() {
  const kids = [];
  const head = mode === 0
    ? rg.t("Pisteet: ", "Points: ", "Puntos: ") + openSum(open) + (best >= 0 ? rg.t("   ennätys ", "   best ", "   récord ") + best : "")
    : who(player) + (scores[1] >= 0 && player === 2 ? rg.t("   (" + who(1) + ": " + scores[1] + ")", "   (" + who(1) + ": " + scores[1] + ")", "   (" + who(1) + ": " + scores[1] + ")") : "");
  kids.push(<div className="head" style={{ left: 0, top: 60, width: width }}>{head}</div>);
  kids.push(<div className={phase === "over" ? "status sbig" : "status"} style={{ left: 0, top: 100, width: width }}>{status()}</div>);
  kids.push(<div className="box" style={{ left: (width - 330) / 2, top: 196, width: 330, height: 284 }} />);
  for (let n = 1; n <= 9; n++) kids.push(Tile(n));
  // the dice
  const ds = 70, dyy = 150;
  if (phase !== "roll") {
    const wob = phase === "rolling" ? Math.sin(clock * 40) * 6 : 0;
    if (nDice === 2) { kids.push(Die(dice[0], width / 2 - ds - 12, dyy + 350 + wob, ds)); kids.push(Die(dice[1], width / 2 + 12, dyy + 350 - wob, ds)); }
    else kids.push(Die(dice[0], width / 2 - ds / 2, dyy + 350 + wob, ds));
  }
  if (phase === "choose" || phase === "rolling") kids.push(<div className="sum" style={{ left: 0, top: dyy + 428, width: width }}>{phase === "choose" ? "= " + roll() : ""}</div>);
  if (phase === "roll" && !phoneTurn()) {
    const one = oneDieOk(open);
    kids.push(<div className="row" style={{ left: 0, top: dyy + 350, width: width }}>
      <div className="btn rbtn" id="roll" onClick={() => doRoll(2)}>🎲🎲 {rg.t("Heitä", "Roll", "Tirar")}</div>
      {one ? <div className="btn rbtn one" id="roll1" onClick={() => doRoll(1)}>🎲 {rg.t("Yksi", "One", "Uno")}</div> : null}
    </div>);
  }
  if (phase === "over" && clock > 1) {
    kids.push(<div className="panel" style={{ left: (width - 280) / 2, top: 230 }}>
      <div className="ptitle">{status()}</div>
      {mode !== 0 ? <div className="pinfo">{who(1) + ": " + scores[1] + "   " + who(2) + ": " + (scores[2] < 0 ? "–" : scores[2])}</div> : null}
      <div className="btn agn" id="again" onClick={() => newGame(mode)}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div>
      <div className="btn mback pback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>);
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const a = 1 + Math.floor(t * 1.3) % 6, b = 1 + Math.floor(t * 1.3 + 3) % 6;
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Sulje laatikko", "Shut the Box", "Cierra la caja")}</div>
      <div className="demo"><div style={{ width: 64, height: 64, marginRight: 24 }}>{Die(a, 0, 0, 64)}</div><div style={{ width: 64, height: 64 }}>{Die(b, 0, 0, 64)}</div></div>
      <div className="mhint">{rg.t("Heitä nopat ja sulje numerot, jotka ovat yhteensä yhtä paljon. Sulje kaikki!", "Roll the dice and shut numbers that add up to the roll. Shut them all!", "Tira los dados y cierra números que sumen lo mismo. ¡Ciérralos todos!")}</div>
      <div className="btn mbtn" id="alone" onClick={() => newGame(0)}>🙂 {rg.t("Yksin", "Alone", "Solo")}</div>
      <div className="btn mbtn alt" id="vsphone" onClick={() => newGame(2)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn mbtn alt2" id="vsfriend" onClick={() => newGame(1)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn mbtn mback" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() { return screen === "menu" ? Menu() : Game(); }
