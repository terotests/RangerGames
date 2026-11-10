// Pisteet ja laatikot (dots and boxes): draw one line between two dots on
// your turn. The one who closes a box gets it and draws again. Most boxes
// wins. With a friend, or against the phone (easy or hard). lib/rules.ts.

import { lineCount, hLine, vLine, boxesOf, drawn, play, phoneLine } from "lib/rules";

type Screen = "menu" | "game";
const SIZES = [3, 4, 5];
const ICON = ["", "🦊", "🐼"];

let screen: Screen = "menu";
let vsPhone = true;
let level = 2;
let si = 1;
let R = 4, C = 4;
let lines: number[] = [];
let boxes: number[] = [];
let boxClock: number[] = [];
let lastLine = -1;
let turn = 1;
let starts = 2;
let t = 0;
let phoneClock = 0;
let over = false;
let overClock = 0;
let toldRules = false;

function init() { si = rg.load("size", 1); level = rg.load("level", 2); }

function S() { return Math.floor(300 / C); }
function ox() { return Math.floor((width - S() * C) / 2); }
const OY = 176;
function dx(c: number) { return ox() + c * S(); }
function dy(r: number) { return OY + r * S(); }

function who(p: number) {
  if (vsPhone) return p === 1 ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return p === 1 ? rg.t("Kettu", "Fox", "Zorro") : rg.t("Panda", "Panda", "Panda");
}
function phoneTurn() { return vsPhone && turn === 2 && !over; }
function count(p: number) { let n = 0; for (const b of boxes) if (b === p) n++; return n; }

function newGame(phone: boolean) {
  vsPhone = phone;
  R = C = SIZES[si];
  lines = []; for (let i = 0; i < lineCount(R, C); i++) lines.push(0);
  boxes = []; boxClock = []; for (let i = 0; i < R * C; i++) { boxes.push(0); boxClock.push(0); }
  starts = 3 - starts; turn = starts; lastLine = -1; over = false; phoneClock = 0;
  screen = "game";
  rg.sound("click");
  const first = phone ? (turn === 1 ? "sinun_vuorosi" : "minun_vuoroni") : "";
  const ids = [];
  if (!toldRules) { toldRules = true; ids.push("pl_ohje"); }
  if (first) ids.push(first);
  if (ids.length) rg.say(ids);
}

function draw(l: number) {
  if (lines[l] || over) return;
  const closed = play(lines, boxes, R, C, l, turn);
  lastLine = l;
  if (closed.length) {
    for (const b of closed) {
      boxClock[b] = 0;
      rg.celebrate(dx(b % C) + S() / 2, dy(Math.floor(b / C)) + S() / 2, { count: 10, sound: false });
    }
    rg.sound("coin", { pitch: 1 + closed.length * 0.1 }); rg.vibrate(15);
  } else {
    rg.sound("pop", { pitch: turn === 1 ? 1 : 1.3, volume: 0.6 });
    turn = 3 - turn;
  }
  phoneClock = 0;
  let full = true; for (const x of lines) if (!x) full = false;
  if (full) finish();
}

function finish() {
  over = true; overClock = 0;
  const a = count(1), b = count(2);
  if (a === b) { rg.sound("wrong"); rg.say("tasapeli"); return; }
  if (vsPhone && b > a) { rg.sound("lose"); rg.say("puhelin_voitti"); return; }
  rg.celebrate(width / 2, OY + 150, { big: true });
  rg.say(vsPhone ? "voitit" : a > b ? "pl_kettu_voitti" : "pl_panda_voitti");
}

function tap(l: number) { if (phoneTurn()) return; draw(l); }

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  for (let i = 0; i < boxClock.length; i++) boxClock[i] += dt;
  if (over) { overClock += dt; return; }
  if (phoneTurn()) {
    phoneClock += dt;
    if (phoneClock > 0.7) draw(phoneLine(lines, boxes, R, C, level, rg.random));
  }
}

function onBack() { if (screen === "game") { screen = "menu"; rg.sound("click"); } else rg.exit(); }

function Pill(p: number) {
  const on = turn === p && !over;
  return <div className={on ? (p === 1 ? "pill on1" : "pill on2") : "pill"}>
    <div className="picon">{ICON[p]}</div>
    <div className="pname">{who(p)}</div><div className="pscore">{String(count(p))}</div>
  </div>;
}

function status() {
  if (over) {
    const a = count(1), b = count(2);
    if (a === b) return rg.t("Tasapeli!", "Draw!", "¡Empate!");
    const w = a > b ? 1 : 2;
    if (vsPhone) return w === 1 ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!");
    return rg.t(who(w) + " voitti! 🎉", who(w) + " won! 🎉", "¡Ganó " + who(w) + "! 🎉");
  }
  if (phoneTurn()) return rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono piensa…");
  return rg.t("Vuoro: ", "Turn: ", "Turno: ") + ICON[turn] + " " + who(turn);
}

function Game() {
  const kids = [];
  const s = S();
  kids.push(<div className="top" style={{ left: 0, top: 56, width: width }}>{Pill(1)}{Pill(2)}</div>);
  kids.push(<div className={over ? "status sbig" : turn === 1 ? "status s1" : "status s2"} style={{ left: 0, top: 112, width: width }}>{status()}</div>);
  kids.push(<div className="paper" style={{ left: ox() - 18, top: OY - 18, width: s * C + 36, height: s * R + 36 }} />);
  // boxes
  for (let b = 0; b < R * C; b++) {
    if (!boxes[b]) continue;
    const k = Math.min(1, boxClock[b] / 0.25);
    const m = 4 + (1 - k) * s * 0.3;
    const x = dx(b % C), y = dy(Math.floor(b / C));
    kids.push(<div className={boxes[b] === 1 ? "box b1" : "box b2"} style={{ left: x + m, top: y + m, width: s - 2 * m, height: s - 2 * m }}>
      {k > 0.5 ? <div className="bicon" style={{ fontSize: Math.round(s * 0.45) }}>{ICON[boxes[b]]}</div> : null}
    </div>);
  }
  // lines
  const H = (R + 1) * C;
  for (let l = 0; l < lines.length; l++) {
    let x = 0, y = 0, w = 0, h = 0;
    if (l < H) { const r = Math.floor(l / C), c = l % C; x = dx(c); y = dy(r) - 4; w = s; h = 8; }
    else { const k = l - H, r = Math.floor(k / (C + 1)), c = k % (C + 1); x = dx(c) - 4; y = dy(r); w = 8; h = s; }
    if (lines[l]) {
      const cls = l === lastLine ? (lines[l] === 1 ? "line l1 last" : "line l2 last") : lines[l] === 1 ? "line l1" : "line l2";
      kids.push(<div className={cls} style={{ left: x, top: y, width: w, height: h }} />);
    } else if (!over && !phoneTurn()) {
      // a faint guide and a fat tap target
      kids.push(<div className="guide" style={{ left: x + (w > 8 ? 8 : 2), top: y + (h > 8 ? 8 : 2), width: w > 8 ? w - 16 : 4, height: h > 8 ? h - 16 : 4 }} />);
      const pad = Math.floor(s * 0.28);
      kids.push(<div className="tap" id={"l" + l} style={w > 8 ? { left: x + 8, top: y - pad + 4, width: w - 16, height: pad * 2 } : { left: x - pad + 4, top: y + 8, width: pad * 2, height: h - 16 }} onClick={() => tap(l)} />);
    }
  }
  for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) kids.push(<div className="dot" style={{ left: dx(c) - 7, top: dy(r) - 7 }} />);
  const by = OY + s * R + 34;
  if (!over) kids.push(<div className="btn mback small" id="menu" style={{ left: (width - 170) / 2, top: by }} onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>);
  if (over && overClock > 1) {
    kids.push(<div className="panel" style={{ left: (width - 280) / 2, top: OY + 40 }}>
      <div className="ptitle">{status()}</div>
      <div className="pcount">{ICON[1] + " " + count(1) + "    " + ICON[2] + " " + count(2)}</div>
      <div className="btn agn" id="again" onClick={() => newGame(vsPhone)}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div>
      <div className="btn mback pback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>);
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const chip = (i: number) => <div className={si === i ? "chip con" : "chip"} id={"size" + i} onClick={() => { si = i; rg.save("size", i); rg.sound("click"); }}>{SIZES[i] + "×" + SIZES[i]}</div>;
  const lv = (n: number, label: string) => <div className={level === n ? "chip con" : "chip"} id={"level" + n} onClick={() => { level = n; rg.save("level", n); rg.sound("click"); }}>{label}</div>;
  const k = Math.floor(t * 1.5) % 5;
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Pisteet ja laatikot", "Dots and Boxes", "Puntos y cajas")}</div>
      <div className="demo">
        <div className="dbox"><div className={k > 0 ? "dl dtop on" : "dl dtop"} /><div className="drow"><div className={k > 1 ? "dl dside on" : "dl dside"} /><div className="dmid">{k > 3 ? ICON[1] : ""}</div><div className={k > 2 ? "dl dside on" : "dl dside"} /></div><div className={k > 3 ? "dl dtop on" : "dl dtop"} /></div>
      </div>
      <div className="mhint">{rg.t("Sulje laatikko, niin saat sen ja uuden vuoron!", "Close a box to win it and play again!", "¡Cierra una caja y vuelve a jugar!")}</div>
      <div className="chips">{chip(0)}{chip(1)}{chip(2)}</div>
      <div className="chips">{lv(1, "🐣 " + rg.t("Helppo", "Easy", "Fácil"))}{lv(2, "🦉 " + rg.t("Vaikea", "Hard", "Difícil"))}</div>
      <div className="btn mbtn" id="vsphone" onClick={() => newGame(true)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn mbtn alt" id="vsfriend" onClick={() => newGame(false)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn mbtn mback" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() { return screen === "menu" ? Menu() : Game(); }
