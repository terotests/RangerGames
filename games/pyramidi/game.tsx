// Pyramidi: pyramid solitaire. Two free cards that add up to the target
// go away together (10 with number cards 1–10, 13 with a real deck where
// J = 11, Q = 12 and K = 13 goes alone). A card is free when no card lies
// on it. The stock deals onto the waste pile; tap the empty stock to turn
// the waste over again. Every deal can be won. Rules: lib/rules.ts.

import { deal, isFree, findMove, rowOf, colOf, SIZE, Card } from "lib/rules";

type Screen = "menu" | "game";
type Fly = { c: Card; x: number; y: number; t: number };
type Snap = { gone: boolean[]; stock: Card[]; waste: Card[] };

const CW = 46, CH = 66, STEP = 49, ROWSTEP = 40;
const PT = 108;                      // the pyramid's top
const SUITS = ["♥", "♦", "♣", "♠"];

let screen: Screen = "menu";
let target = 10;
let pyr: Card[] = [];
let gone: boolean[] = [];
let stock: Card[] = [];
let waste: Card[] = [];
let sel = -2;                        // selected: pyramid index, -1 the waste, -2 none
let hint: number[] = [];
let hintClock = 0;
let flies: Fly[] = [];
let history: Snap[] = [];
let moves = 0;
let rounds = 1;
let t = 0;
let won = false;
let wonClock = 0;
let shake = 0;
let shakeAt = -3;
let toldRules: boolean[] = [false, false];

function init() { }

function newGame(tg: number) {
  target = tg;
  const d = deal(tg, rg.random);
  pyr = d.pyramid; stock = d.stock; waste = [];
  gone = []; for (let i = 0; i < SIZE; i++) gone.push(false);
  sel = -2; hint = []; flies = []; history = []; moves = 0; rounds = 1; won = false;
  screen = "game";
  rg.sound("whoosh");
  const k = tg === 10 ? 0 : 1;
  if (!toldRules[k]) { toldRules[k] = true; rg.say(tg === 10 ? "py_ohje10" : "py_ohje13"); }
}

function L() { return Math.floor((width - 7 * STEP + (STEP - CW)) / 2); }
function px(i: number) { const r = rowOf(i); return L() + (6 - r) * STEP / 2 + colOf(i) * STEP; }
function py(i: number) { return PT + rowOf(i) * ROWSTEP; }
const SY = PT + 6 * ROWSTEP + CH + 22;     // the stock row
const BCW = 64, BCH = 90;
function stockX() { return width / 2 - BCW - 14; }
function wasteX() { return width / 2 + 14; }

function snap() { history.push({ gone: gone.slice(), stock: stock.slice(), waste: waste.slice() }); if (history.length > 60) history.shift(); }

function undo() {
  const s = history.pop();
  if (!s) { rg.sound("wrong"); return; }
  gone = s.gone; stock = s.stock; waste = s.waste; sel = -2; hint = []; won = false;
  rg.sound("whoosh", { pitch: 0.8 });
}

function cardOf(k: number): Card { return k === -1 ? waste[waste.length - 1] : pyr[k]; }
function posOf(k: number): number[] { return k === -1 ? [wasteX(), SY] : [px(k), py(k)]; }

function removeCards(ks: number[]) {
  snap();
  for (const k of ks) {
    const p = posOf(k);
    flies.push({ c: cardOf(k), x: p[0], y: p[1], t: 0 });
  }
  for (const k of ks) if (k >= 0) gone[k] = true;
  if (ks.indexOf(-1) >= 0) waste.pop();
  moves++;
  sel = -2; hint = [];
  const p = posOf(ks[0]);
  rg.celebrate(p[0] + CW / 2, p[1] + CH / 2, { count: 12, sound: false });
  rg.sound("coin", { pitch: 1 + Math.min(moves, 20) * 0.02 });
  rg.vibrate(15);
  if (ks.length === 2) rg.say(["n" + cardOf(ks[0]).v, "plus", "n" + cardOf(ks[1]).v, "on", "n" + target]);
  else rg.say("n" + target);
  let left = 0; for (const g of gone) if (!g) left++;
  if (!left) { won = true; wonClock = 0; rg.sound("win"); rg.celebrate(width / 2, PT + 100, { big: true }); rg.say("loistavaa", { queue: true }); }
}

function pick(k: number) {
  if (won) return;
  if (k >= 0 && !isFree(gone, k)) { rg.sound("wrong"); shake = 0.3; shakeAt = k; return; }
  if (k === -1 && !waste.length) return;
  const c = cardOf(k);
  if (c.v === target) { removeCards([k]); return; }
  if (sel === -2 || sel === k) { sel = sel === k ? -2 : k; rg.sound("tick"); return; }
  const o = cardOf(sel);
  if (o.v + c.v === target) { const a = sel; removeCards([a, k]); return; }
  rg.sound("wrong"); rg.vibrate(30);
  shake = 0.3; shakeAt = k;
  sel = k;
}

function draw() {
  if (won) return;
  snap();
  sel = sel === -1 ? -2 : sel;
  if (stock.length) { waste.push(stock.pop() as Card); rg.sound("whoosh", { pitch: 1.4, volume: 0.5 }); }
  else if (waste.length) { stock = waste.slice().reverse(); waste = []; rounds++; rg.sound("whoosh", { pitch: 0.7 }); }
  else history.pop();
  hint = [];
}

// is there anything left to do at all (stock and waste cards included)?
function stuck(): boolean {
  if (findMove(pyr, gone, waste.length ? waste[waste.length - 1] : null, target).length) return false;
  const all = stock.concat(waste);
  for (const c of all) {
    if (c.v === target) return false;
    for (let i = 0; i < SIZE; i++) if (isFree(gone, i) && pyr[i].v + c.v === target) return false;
  }
  return true;
}

function showHint() {
  const m = findMove(pyr, gone, waste.length ? waste[waste.length - 1] : null, target);
  if (m.length) { hint = m; hintClock = 2.5; rg.sound("star"); return; }
  hint = [-3]; hintClock = 2.5; rg.sound("tick");      // -3: the stock
}

function tick(dt: number) {
  t += dt;
  if (dt > 0.05) dt = 0.05;
  for (const f of flies) f.t += dt;
  flies = flies.filter((f) => f.t < 0.6);
  if (shake > 0) shake -= dt;
  if (hintClock > 0) { hintClock -= dt; if (hintClock <= 0) hint = []; }
  if (won) wonClock += dt;
}

function onBack() { if (screen === "game") { screen = "menu"; rg.sound("click"); } else rg.exit(); }

function rank(v: number): string {
  if (target === 10) return String(v);
  return v === 1 ? "A" : v === 11 ? "J" : v === 12 ? "Q" : v === 13 ? "K" : String(v);
}

// a card face: the value big, and in the 10-game a ten-frame of dots to count
function Face(c: Card, x: number, y: number, w: number, h: number, cls: string, id: string, onTap: (() => void) | null, extra: any) {
  const red = c.s < 2;
  const kids = [];
  const big = w > 50;
  if (target === 10) {
    kids.push(<div className={red ? (big ? "num bnum red" : "num red") : (big ? "num bnum blk" : "num blk")}>{String(c.v)}</div>);
    const dots = [];
    if (cls !== "covered") for (let k = 0; k < 10; k++) dots.push(<div className={k < c.v ? (red ? "dot dr" : "dot db") : "dot de"} />);
    kids.push(<div className={big ? "frame10 bframe" : "frame10"}>{dots}</div>);
  } else {
    kids.push(<div className={red ? (big ? "num bnum red" : "num red") : (big ? "num bnum blk" : "num blk")}>{rank(c.v)}</div>);
    kids.push(<div className={red ? (big ? "suit bsuit red" : "suit red") : (big ? "suit bsuit blk" : "suit blk")}>{SUITS[c.s]}</div>);
    if (c.v > 10 || c.v === 1) kids.push(<div className="val">{"=" + c.v}</div>);
  }
  const st: any = { left: x, top: y, width: w, height: h };
  if (extra) for (const k in extra) st[k] = extra[k];
  return onTap ? <div className={"card " + cls} id={id} style={st} onClick={onTap}>{kids}</div>
    : <div className={"card " + cls} style={st}>{kids}</div>;
}

function Game() {
  const kids = [];
  let left = 0; for (const g of gone) if (!g) left++;
  kids.push(<div className="head" style={{ left: 0, top: 58, width: width }}>
    <div className="goal">{target === 10 ? rg.t("Summa 10", "Make 10", "Suma 10") : rg.t("Summa 13", "Make 13", "Suma 13")}</div>
    <div className="info">{"🔺 " + left + "   ↻ " + rounds}</div>
  </div>);
  for (let i = 0; i < SIZE; i++) {
    if (gone[i]) continue;
    const free = isFree(gone, i);
    let x = px(i), y = py(i);
    if (shake > 0 && shakeAt === i) x += Math.sin(shake * 60) * 4;
    const on = sel === i, hinted = hint.indexOf(i) >= 0 && Math.floor(t * 4) % 2 === 0;
    if (on) y -= 6;
    kids.push(Face(pyr[i], x, y, CW, CH, on ? "sel" : hinted ? "hinted" : free ? "free" : "covered", "p" + i, () => pick(i), null));
  }
  // stock and waste
  if (stock.length) {
    const hinted = hint.indexOf(-3) >= 0 && Math.floor(t * 4) % 2 === 0;
    kids.push(<div className={hinted ? "back hinted" : "back"} id="stock" style={{ left: stockX(), top: SY }} onClick={() => draw()}>
      <div className="backin"><div className="backtxt">{String(stock.length)}</div></div>
    </div>);
  } else {
    kids.push(<div className="empty" id="stock" style={{ left: stockX(), top: SY }} onClick={() => draw()}><div className="again">↻</div></div>);
  }
  if (waste.length) {
    if (waste.length > 1) kids.push(Face(waste[waste.length - 2], wasteX() + 4, SY + 3, BCW, BCH, "free", "", null, null));
    const on = sel === -1, hinted = hint.indexOf(-1) >= 0 && Math.floor(t * 4) % 2 === 0;
    let x = wasteX();
    if (shake > 0 && shakeAt === -1) x += Math.sin(shake * 60) * 4;
    kids.push(Face(waste[waste.length - 1], x, on ? SY - 6 : SY, BCW, BCH, on ? "sel" : hinted ? "hinted" : "free", "waste", () => pick(-1), null));
  } else kids.push(<div className="empty" style={{ left: wasteX(), top: SY }} />);
  for (const f of flies) {
    const k = f.t / 0.6;
    kids.push(Face(f.c, f.x + (width + 40 - f.x) * k * k, f.y - 80 * k, CW, CH, "free", "", null, { opacity: String(1 - k) }));
  }
  const by = SY + BCH + 18;
  if (!won) {
    const st = stuck();
    if (st) kids.push(<div className="stuck" style={{ left: 20, top: SY - 26, width: width - 40 }}>{rg.t("Ei enää pareja. Peru tai aloita alusta.", "No pairs left. Undo or start again.", "No quedan parejas. Deshaz o empieza otra vez.")}</div>);
    kids.push(<div className="row" style={{ left: 0, top: by, width: width }}>
      <div className="sbtn sback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>←</div>
      <div className="sbtn sundo" id="undo" onClick={() => undo()}>{"↶ " + rg.t("Peru", "Undo", "Deshacer")}</div>
      <div className="sbtn shint" id="hint" onClick={() => showHint()}>{"💡 " + rg.t("Vihje", "Hint", "Pista")}</div>
    </div>);
  }
  if (won && wonClock > 1) {
    kids.push(
      <div className="panel" style={{ left: (width - 280) / 2, top: PT + 40 }}>
        <div className="ptitle">{rg.t("Pyramidi purettu! 🎉", "Pyramid cleared! 🎉", "¡Pirámide resuelta! 🎉")}</div>
        <div className="pinfo">{rg.t("Siirtoja: ", "Moves: ", "Jugadas: ") + moves}</div>
        <div className="btn agn" id="again" onClick={() => newGame(target)}>{rg.t("Uusi peli", "New game", "Nuevo juego")}</div>
        <div className="btn mback pback" id="menu" onClick={() => { screen = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
      </div>
    );
  }
  return <div className="screen">{kids}</div>;
}

function Menu() {
  const demo = [];
  const vals = [3, 7, 5, 5];
  for (let k = 0; k < 4; k++) {
    target = 10;
    demo.push(<div style={{ width: CW + 6, height: CH + 8, marginTop: 6 + Math.sin(t * 2.5 + k) * 6, marginLeft: 4, marginRight: 4 }}>{Face({ v: vals[k], s: k }, 0, 0, CW + 6, CH + 8, "free", "", null, null)}</div>);
  }
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Pyramidi", "Pyramid", "Pirámide")}</div>
      <div className="demo">{demo}</div>
      <div className="mhint">{rg.t("Etsi kaksi korttia, jotka ovat yhteensä 10 tai 13. Pura koko pyramidi!", "Find two cards that make 10 or 13. Clear the whole pyramid!", "Busca dos cartas que sumen 10 o 13. ¡Deshaz la pirámide!")}</div>
      <div className="btn mbtn" id="p10" onClick={() => newGame(10)}>🔟 {rg.t("Kymppipyramidi", "Make 10", "Suma 10")}</div>
      <div className="btn mbtn alt" id="p13" onClick={() => newGame(13)}>🃏 {rg.t("Korttipyramidi (13)", "Card pyramid (13)", "Pirámide (13)")}</div>
      <div className="btn mbtn mback" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() { return screen === "menu" ? Menu() : Game(); }
