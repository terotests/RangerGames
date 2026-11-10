// Kymppiparit: number cards; two cards that add up to the target (5, 10, 15
// or 20) are a pair. "Find the pairs" has every card face up, against the
// clock; the memory games have them face down: alone, with a friend or
// against the phone. Every card shows its number and dots to count.

type Screen = "menu" | "game";
type C = { v: number; open: boolean; done: number; flip: number; shake: number };

const TARGETS = [5, 10, 15, 20];

let screen: Screen = "menu";
let mode = 0;          // 0 find (face up), 1 memory alone, 2 friend, 3 phone
let ti = 1;            // index into TARGETS
let cards: C[] = [];
let picked: number[] = [];
let turn = 1;
let score = [0, 0, 0];
let tries = 0;
let clock = 0;
let t = 0;
let waitClock = 0;
let phoneClock = 0;
let memory: number[] = [];
let over = false;
let overClock = 0;
let best: number[] = [0, 0, 0, 0];    // fastest find, seconds
let toldRules = false;

function init() { ti = rg.load("target", 1); best = rg.load("best", [0, 0, 0, 0]); }
function target() { return TARGETS[ti]; }

const N = 16;
function cw() { return 78; }
function ch() { return 96; }
function gx(i: number) { return Math.floor((width - (4 * cw() + 3 * 8)) / 2) + (i % 4) * (cw() + 8); }
function gy(i: number) { return (mode <= 1 ? 112 : 142) + Math.floor(i / 4) * (ch() + 8); }

function who(p: number) {
  if (mode === 3) return p === 1 ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return p === 1 ? rg.t("Pelaaja 1", "Player 1", "Jugador 1") : rg.t("Pelaaja 2", "Player 2", "Jugador 2");
}
function phoneTurn() { return mode === 3 && turn === 2 && !over; }
function faceDown() { return mode !== 0; }

function newGame(m: number) {
  mode = m;
  const T = target();
  const lo = T === 5 ? 0 : 1, hi = T === 5 ? 5 : T - 1;
  const vs: number[] = [];
  for (let p = 0; p < N / 2; p++) {
    const a = lo + Math.floor(rg.random() * (hi - lo + 1));
    vs.push(a); vs.push(T - a);
  }
  cards = rg.shuffle(vs).map((v: number) => ({ v, open: !faceDown(), done: 0, flip: 1, shake: 0 }));
  memory = cards.map(() => -1);
  picked = []; turn = 1; score = [0, 0, 0]; tries = 0; clock = 0; over = false; waitClock = 0; phoneClock = 0;
  screen = "game";
  rg.sound("whoosh");
  if (!toldRules) { toldRules = true; rg.say(["kp_ohje", "n" + T]); } else rg.say("n" + T);
}

function turnCard(i: number) {
  const c = cards[i];
  if (c.done || picked.length >= 2 || picked.indexOf(i) >= 0) return;
  if (faceDown()) { c.open = true; c.flip = 0; }
  picked.push(i);
  rg.sound("tick", { pitch: 1.2 });
  for (const j of picked) if (rg.random() < 0.6) memory[j] = cards[j].v;
  if (picked.length === 2) waitClock = 0;
}

function tap(i: number) {
  if (phoneTurn() || over) return;
  if (!faceDown() && picked.length === 1 && picked[0] === i) { picked = []; rg.sound("tick"); return; }
  turnCard(i);
}

function resolve() {
  const a = cards[picked[0]], b = cards[picked[1]];
  tries++;
  if (a.v + b.v === target()) {
    a.done = b.done = turn;
    score[turn]++;
    memory[picked[0]] = memory[picked[1]] = -1;
    rg.sound("coin"); rg.vibrate(15);
    rg.say(["n" + a.v, "plus", "n" + b.v, "on", "n" + target()]);
    rg.celebrate(gx(picked[1]) + cw() / 2, gy(picked[1]) + ch() / 2, { count: 14, sound: false });
    picked = [];
    let left = 0; for (const c of cards) if (!c.done) left++;
    if (!left) finish();
  } else {
    if (faceDown()) { a.open = b.open = false; a.flip = b.flip = 0; }
    else { b.shake = 0.35; rg.sound("wrong"); rg.vibrate(30); }
    picked = [];
    if (mode >= 2) { turn = 3 - turn; rg.sound("whoosh", { volume: 0.4 }); }
  }
  phoneClock = 0;
}

function finish() {
  over = true; overClock = 0;
  if (mode === 0) {
    const s = Math.round(clock);
    if (!best[ti] || s < best[ti]) { best[ti] = s; rg.save("best", best); }
  }
  if (mode <= 1) { rg.celebrate(width / 2, 300, { big: true }); rg.say("loistavaa", { queue: true }); return; }
  if (score[1] === score[2]) { rg.say("tasapeli", { queue: true }); return; }
  if (mode === 3 && score[2] > score[1]) { rg.sound("lose"); rg.say("puhelin_voitti", { queue: true }); return; }
  rg.celebrate(width / 2, 300, { big: true }); rg.say("voitit", { queue: true });
}

function phonePick(): number {
  const T = target();
  const known = (i: number) => memory[i] >= 0 && !cards[i].done && !cards[i].open;
  if (picked.length === 1) {
    const v = cards[picked[0]].v;
    for (let i = 0; i < N; i++) if (i !== picked[0] && known(i) && memory[i] + v === T) return i;
  } else {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (known(i) && known(j) && memory[i] + memory[j] === T) return i;
  }
  const unknown: number[] = [], any: number[] = [];
  for (let i = 0; i < N; i++) if (!cards[i].done && !cards[i].open) { any.push(i); if (memory[i] < 0) unknown.push(i); }
  const from = unknown.length ? unknown : any;
  return from[Math.floor(rg.random() * from.length)];
}

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  for (const c of cards) { if (c.flip < 1) c.flip = Math.min(1, c.flip + dt * 5); if (c.shake > 0) c.shake -= dt; }
  if (over) { overClock += dt; return; }
  if (screen === "game") clock += dt;
  if (picked.length === 2) {
    waitClock += dt;
    const ok = cards[picked[0]].v + cards[picked[1]].v === target();
    if (!faceDown() || waitClock > (ok ? 0.6 : 1.4)) resolve();
    return;
  }
  if (phoneTurn()) {
    phoneClock += dt;
    if (phoneClock > 0.8) { phoneClock = 0.2; turnCard(phonePick()); }
  }
}

function onBack() { if (screen === "game") { screen = "menu"; rg.sound("click"); } else rg.exit(); }

function Dots(v: number) {
  const frames = [];
  const nf = v > 10 ? 2 : 1;
  for (let f = 0; f < nf; f++) {
    const dots = [];
    for (let k = 0; k < 10; k++) dots.push(<div className={k < v - f * 10 ? (f === 0 ? "dot d1" : "dot d2") : "dot de"} />);
    frames.push(<div className="frame">{dots}</div>);
  }
  return <div className="frames">{frames}</div>;
}

function Card(i: number) {
  const c = cards[i];
  const faceUp = c.open || c.done > 0;
  const k = c.flip;
  const showFace = k < 0.5 ? !faceUp : faceUp;
  const ww = k >= 1 ? cw() : Math.max(4, cw() * Math.abs(1 - 2 * k));
  let x = gx(i) + (cw() - ww) / 2;
  if (c.shake > 0) x += Math.sin(c.shake * 60) * 5;
  const sel = picked.indexOf(i) >= 0;
  const st = { left: x, top: gy(i) - (sel && !faceDown() ? 6 : 0), width: ww, height: ch(), opacity: c.done && !faceDown() ? "0.25" : "1" };
  if (!showFace) return <div className="card back" id={"c" + i} style={st} onClick={() => tap(i)}><div className="backin"><div className="q">?</div></div></div>;
  const cls = c.done ? (c.done === 1 ? "card face f1" : "card face f2") : sel ? "card face fsel" : "card face";
  return <div className={cls} id={"c" + i} style={st} onClick={() => tap(i)}>
    {ww > 40 ? <div className="num">{String(c.v)}</div> : null}
    {ww > 60 ? Dots(c.v) : null}
  </div>;
}

function Pill(p: number) {
  const on = turn === p && !over;
  return <div className={on ? (p === 1 ? "pill on1" : "pill on2") : "pill"}>
    <div className="pname">{who(p)}</div><div className="pscore">{String(score[p])}</div>
  </div>;
}

function status() {
  if (over) {
    if (mode === 0) return rg.t("Valmis! " + Math.round(clock) + " s", "Done! " + Math.round(clock) + " s", "¡Listo! " + Math.round(clock) + " s");
    if (mode === 1) return rg.t("Valmis! " + tries + " yritystä", "Done! " + tries + " tries", "¡Listo! " + tries + " intentos");
    if (score[1] === score[2]) return rg.t("Tasapeli!", "Draw!", "¡Empate!");
    const w = score[1] > score[2] ? 1 : 2;
    if (mode === 3) return w === 1 ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!");
    return rg.t(who(w) + " voitti! 🎉", who(w) + " won! 🎉", "¡Ganó " + who(w) + "! 🎉");
  }
  if (mode === 0) return "⏱ " + Math.floor(clock) + " s" + (best[ti] ? rg.t("   ennätys " + best[ti] + " s", "   best " + best[ti] + " s", "   récord " + best[ti] + " s") : "");
  if (mode === 1) return rg.t("Yrityksiä: ", "Tries: ", "Intentos: ") + tries;
  return rg.t("Vuoro: ", "Turn: ", "Turno: ") + who(turn);
}

function Game() {
  const kids = [];
  kids.push(<div className="goal" style={{ left: 14, top: 14 }}>{"= " + target()}</div>);
  if (mode >= 2) kids.push(<div className="top" style={{ left: 0, top: 56, width: width }}>{Pill(1)}{Pill(2)}</div>);
  kids.push(<div className={over ? "status sbig" : "status"} style={{ left: 0, top: mode <= 1 ? 66 : 106, width: width }}>{status()}</div>);
  for (let i = 0; i < N; i++) kids.push(Card(i));
  if (over && overClock > 1) {
    kids.push(<div className="panel" style={{ left: (width - 280) / 2, top: 200 }}>
      <div className="ptitle">{status()}</div>
      <div className="btn agn" id="again" onClick={() => newGame(mode)}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div>
      <div className="btn mback pback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>);
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const chip = (i: number) => <div className={ti === i ? "chip con" : "chip"} id={"t" + i} onClick={() => { ti = i; rg.save("target", i); rg.sound("click"); rg.say("n" + TARGETS[i]); }}>{String(TARGETS[i])}</div>;
  const T = target();
  const a = 1 + Math.floor(t / 1.6) % (T - 1);
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Kymppiparit", "Pairs to Ten", "Parejas de diez")}</div>
      <div className="demo">
        <div className="mcard"><div className="mnum">{String(a)}</div></div>
        <div className="plus">+</div>
        <div className="mcard"><div className="mnum">{String(T - a)}</div></div>
        <div className="plus">{"= " + T}</div>
      </div>
      <div className="chips"><div className="clabel">{rg.t("Summa:", "Sum:", "Suma:")}</div>{chip(0)}{chip(1)}{chip(2)}{chip(3)}</div>
      <div className="btn mbtn" id="find" onClick={() => newGame(0)}>👀 {rg.t("Etsi parit", "Find the pairs", "Busca parejas")}</div>
      <div className="btn mbtn alt3" id="memory" onClick={() => newGame(1)}>🙈 {rg.t("Muistipeli yksin", "Memory alone", "Memoria solo")}</div>
      <div className="btn mbtn alt" id="vsphone" onClick={() => newGame(3)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn mbtn alt2" id="vsfriend" onClick={() => newGame(2)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn mbtn mback" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() { return screen === "menu" ? Menu() : Game(); }
