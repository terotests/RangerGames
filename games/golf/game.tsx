// Golf-pasianssi: move the bottom card of a column onto the pile when it is
// one higher or one lower (7 on 6 or 8). When nothing fits, turn a new card
// from the stock. Clear all columns, or leave as few cards as you can.
// In the easy game K and A are neighbours as well. lib/rules.ts.

import { dealGolf, fits, playable, Card } from "lib/rules";

type Screen = "menu" | "game";
type Fly = { c: Card; x: number; y: number; t: number };

const CW = 46, CH = 66, STEP = 49, OVER = 32;
const TOP = 104;
const SUITS = ["♥", "♦", "♣", "♠"];

let screen: Screen = "menu";
let wrap = true;
let cols: Card[][] = [];
let stock: Card[] = [];
let waste: Card[] = [];
let history: { cols: Card[][]; stock: Card[]; waste: Card[]; streak: number }[] = [];
let flies: Fly[] = [];
let streak = 0;
let hint: number = -9;
let hintClock = 0;
let shakeCol = -1;
let shake = 0;
let over = false;
let overClock = 0;
let t = 0;
let best: number[] = [-1, -1];
let toldRules = false;

function init() { best = rg.load("best", [-1, -1]); }

function L() { return Math.floor((width - (6 * STEP + CW)) / 2); }
function cx(c: number) { return L() + c * STEP; }
function cy(k: number) { return TOP + k * OVER; }
const PY = TOP + 4 * OVER + CH + 40;
const BW = 70, BH = 98;
function stockX() { return width / 2 - BW - 16; }
function wasteX() { return width / 2 + 16; }

function left() { let n = 0; for (const c of cols) n += c.length; return n; }
function top(): Card { return waste[waste.length - 1]; }

function newGame(w: boolean) {
  wrap = w;
  const d = dealGolf(rg.random);
  cols = d.cols; stock = d.stock; waste = d.waste;
  history = []; flies = []; streak = 0; over = false; hint = -9;
  screen = "game";
  rg.sound("whoosh");
  if (!toldRules) { toldRules = true; rg.say("gp_ohje"); }
}

function snap() { history.push({ cols: cols.map((c) => c.slice()), stock: stock.slice(), waste: waste.slice(), streak }); if (history.length > 80) history.shift(); }
function undo() {
  const s = history.pop();
  if (!s || over) { rg.sound("wrong"); return; }
  cols = s.cols; stock = s.stock; waste = s.waste; streak = s.streak; hint = -9;
  rg.sound("whoosh", { pitch: 0.8 });
}

function tapCol(c: number) {
  if (over) return;
  const col = cols[c];
  if (!col.length) return;
  const card = col[col.length - 1];
  if (!fits(card.v, top().v, wrap)) { rg.sound("wrong"); rg.vibrate(30); shakeCol = c; shake = 0.35; return; }
  snap();
  col.pop();
  flies.push({ c: card, x: cx(c), y: cy(col.length), t: 0 });
  waste.push(card);
  streak++;
  hint = -9;
  rg.sound("coin", { pitch: 1 + Math.min(streak, 12) * 0.05 });
  rg.vibrate(12);
  if (streak >= 5 && streak % 5 === 0) { rg.celebrate(wasteX() + BW / 2, PY, { count: 14, sound: false }); rg.say("hienoa"); }
  checkEnd();
}

function tapStock() {
  if (over || !stock.length) return;
  snap();
  waste.push(stock.pop() as Card);
  streak = 0; hint = -9;
  rg.sound("whoosh", { pitch: 1.4, volume: 0.6 });
  checkEnd();
}

function checkEnd() {
  if (left() === 0 || (!stock.length && !playable(cols, top(), wrap).length)) {
    over = true; overClock = 0;
    const n = left(), k = wrap ? 0 : 1;
    if (best[k] < 0 || n < best[k]) { best[k] = n; rg.save("best", best); }
    if (n === 0) { rg.sound("win"); rg.celebrate(width / 2, 200, { big: true }); rg.say("loistavaa"); }
    else if (n <= 5) { rg.celebrate(width / 2, 200, { count: 20 }); rg.say("hienoa"); }
    else rg.sound("tick");
  }
}

function showHint() {
  const p = playable(cols, top(), wrap);
  hint = p.length ? p[0] : -1;    // -1: take from the stock
  hintClock = 2.5;
  rg.sound("star");
}

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  for (const f of flies) f.t += dt;
  flies = flies.filter((f) => f.t < 0.3);
  if (shake > 0) shake -= dt;
  if (hintClock > 0) { hintClock -= dt; if (hintClock <= 0) hint = -9; }
  if (over) overClock += dt;
}

function onBack() { if (screen === "game") { screen = "menu"; rg.sound("click"); } else rg.exit(); }

function rank(v: number) { return v === 1 ? "A" : v === 11 ? "J" : v === 12 ? "Q" : v === 13 ? "K" : String(v); }

function Face(c: Card, x: number, y: number, w: number, h: number, cls: string, id: string, onTap: (() => void) | null, op: number) {
  const red = c.s < 2, big = w > 60;
  const kids = [
    <div className={red ? (big ? "num bnum red" : "num red") : (big ? "num bnum blk" : "num blk")}>{rank(c.v)}</div>,
    <div className={red ? (big ? "suit bsuit red" : "suit red") : (big ? "suit bsuit blk" : "suit blk")}>{SUITS[c.s]}</div>,
  ];
  const st = { left: x, top: y, width: w, height: h, opacity: String(op) };
  return onTap ? <div className={"card " + cls} id={id} style={st} onClick={onTap}>{kids}</div> : <div className={"card " + cls} style={st}>{kids}</div>;
}

function Game() {
  const kids = [];
  const k = wrap ? 0 : 1;
  kids.push(<div className="head" style={{ left: 0, top: 58, width: width }}>
    <div className="goal">{"🃏 " + left()}</div>
    <div className="info">{best[k] >= 0 ? rg.t("Ennätys ", "Best ", "Récord ") + best[k] : ""}</div>
  </div>);
  const p = playable(cols, top(), wrap);
  for (let c = 0; c < 7; c++) {
    const col = cols[c];
    let x = cx(c);
    if (shake > 0 && shakeCol === c) x += Math.sin(shake * 60) * 4;
    if (!col.length) kids.push(<div className="slot" style={{ left: x, top: cy(0), width: CW, height: CH }} />);
    for (let i = 0; i < col.length; i++) {
      const last = i === col.length - 1;
      const hinted = last && hint === c && Math.floor(t * 4) % 2 === 0;
      kids.push(Face(col[i], x, cy(i), CW, CH, last ? (hinted ? "hinted" : p.indexOf(c) >= 0 && hint === -9 && false ? "fit" : "free") : "under", "", null, 1));
    }
    // one tall tap target per column
    kids.push(<div className="tapcol" id={"col" + c} style={{ left: x, top: cy(0), width: CW, height: Math.max(1, col.length - 1) * OVER + CH }} onClick={() => tapCol(c)} />);
  }
  // stock and waste
  const sh = hint === -1 && Math.floor(t * 4) % 2 === 0;
  if (stock.length) kids.push(<div className={sh ? "back hinted" : "back"} id="stock" style={{ left: stockX(), top: PY }} onClick={() => tapStock()}><div className="backin"><div className="backtxt">{String(stock.length)}</div></div></div>);
  else kids.push(<div className="empty" style={{ left: stockX(), top: PY }} />);
  if (waste.length > 1) kids.push(Face(waste[waste.length - 2], wasteX() + 3, PY + 3, BW, BH, "free", "", null, 1));
  const flying = flies.length > 0;
  if (!flying || waste.length > 1) kids.push(Face(flying ? waste[waste.length - 2] : top(), wasteX(), PY, BW, BH, "free", "waste", null, 1));
  for (const f of flies) { const q = f.t / 0.3; kids.push(Face(f.c, f.x + (wasteX() - f.x) * q, f.y + (PY - f.y) * q, CW + (BW - CW) * q, CH + (BH - CH) * q, "free", "", null, 1)); }
  if (streak >= 2) kids.push(<div className="streak" style={{ left: wasteX() + BW + 6, top: PY + 30 }}>{"×" + streak}</div>);
  const by = PY + BH + 20;
  if (!over) kids.push(<div className="row" style={{ left: 0, top: by, width: width }}>
    <div className="sbtn sback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>←</div>
    <div className="sbtn sundo" id="undo" onClick={() => undo()}>{"↶ " + rg.t("Peru", "Undo", "Deshacer")}</div>
    <div className="sbtn shint" id="hint" onClick={() => showHint()}>{"💡 " + rg.t("Vihje", "Hint", "Pista")}</div>
  </div>);
  if (over && overClock > 1) {
    const n = left();
    kids.push(<div className="panel" style={{ left: (width - 280) / 2, top: TOP + 40 }}>
      <div className="ptitle">{n === 0 ? rg.t("Kaikki kortit! 🎉", "All cards! 🎉", "¡Todas las cartas! 🎉") : rg.t("Kortteja jäi " + n, n + " cards left", "Quedan " + n + " cartas")}</div>
      <div className="btn agn" id="again" onClick={() => newGame(wrap)}>{rg.t("Uusi peli", "New game", "Nuevo juego")}</div>
      <div className="btn mback pback" id="undo2" onClick={() => { over = false; undo(); }}>{"↶ " + rg.t("Peru siirto", "Undo move", "Deshacer")}</div>
      <div className="btn mback pback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>);
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const v = 4 + Math.floor(t * 1.2) % 3;
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Golf-pasianssi", "Golf Solitaire", "Solitario Golf")}</div>
      <div className="demo">
        <div style={{ width: 60, height: 84, marginRight: 10, marginTop: 14 }}>{Face({ v: v - 1, s: 2 }, 0, 0, 58, 82, "free", "", null, 1)}</div>
        <div style={{ width: 60, height: 84, marginRight: 10 }}>{Face({ v: v, s: 0 }, 0, 0, 58, 82, "free", "", null, 1)}</div>
        <div style={{ width: 60, height: 84, marginTop: 14 }}>{Face({ v: v + 1, s: 3 }, 0, 0, 58, 82, "free", "", null, 1)}</div>
      </div>
      <div className="mhint">{rg.t("Siirrä pakkaan kortti, joka on yhden suurempi tai pienempi. Tyhjennä pöytä!", "Move a card that is one higher or lower. Clear the table!", "Mueve una carta uno más alta o más baja. ¡Vacía la mesa!")}</div>
      <div className="btn mbtn" id="easy" onClick={() => newGame(true)}>🐣 {rg.t("Helppo (K ja A käy)", "Easy (K–A wraps)", "Fácil (K y A valen)")}</div>
      <div className="btn mbtn alt" id="hard" onClick={() => newGame(false)}>🦉 {rg.t("Oikeat säännöt", "Real rules", "Reglas reales")}</div>
      <div className="btn mbtn mback" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() { return screen === "menu" ? Menu() : Game(); }
