// Rahakauppa: the first steps with money for a 2nd grader. Our own drawn
// euro coins and notes (tools/raha/art.js) in their real colours and sizes.
//
//   Tunnista rahat   find the coin or note asked; then which pile is more
//   Laske rahat      how much money is on the table
//   Maksa tasan      pay a price exactly with coins and notes
//   Vaihtorahat      you keep the shop: give the customer the change
//   Kumpi halvempi?  compare prices; do my coins buy it?
//   Ostoslista       buy things so the money lasts, and say what is left
//
// Every level adapts like Laskupeli: three steps (to 10 €, to 50 €, to 100 €
// with cents); three right first tries in a row move a step up, two misses in
// a row a step down, and the step is saved. Everything asked is also said.
// Taps in a task go through `hits` (rectangles made by view()).

import { MONEY, piece, total, fmt, fewest, handful, cheapest, dearest } from "lib/money";

type Mode = "menu" | "play" | "done";
type Hit = { x: number; y: number; w: number; h: number; fn: () => void };
type Item = { e: string; lo: number; hi: number };
type Shelf = { e: string; p: number };
type Fly = { v: number; x0: number; y0: number; t0: number; back: boolean; x1: number; y1: number };

const LEVELS = [
  { name: rg.t("Tunnista rahat", "Know the money", "Conoce el dinero"), icon: "💶", color: "#e9a23b" },
  { name: rg.t("Laske rahat", "Count the money", "Cuenta el dinero"), icon: "🧮", color: "#2a9d8f" },
  { name: rg.t("Maksa tasan", "Pay exactly", "Paga exacto"), icon: "🛒", color: "#e76f51" },
  { name: rg.t("Vaihtorahat", "Give change", "El cambio"), icon: "🏪", color: "#7b5ea7" },
  { name: rg.t("Kumpi halvempi?", "Which is cheaper?", "¿Cuál es más barato?"), icon: "🏷️", color: "#3a86ff" },
  { name: rg.t("Ostoslista", "Shopping money", "La compra"), icon: "🧺", color: "#43aa8b" },
];
const ROUND = 8;
const STEPS = 3;
const LANG = rg.lang;

// shop things and what they can cost (euros)
const ITEMS: Item[] = [
  { e: "🍎", lo: 1, hi: 2 }, { e: "🍌", lo: 1, hi: 2 }, { e: "🥛", lo: 1, hi: 3 }, { e: "🍞", lo: 2, hi: 4 },
  { e: "🧃", lo: 1, hi: 3 }, { e: "🍦", lo: 2, hi: 5 }, { e: "🍪", lo: 2, hi: 4 }, { e: "🧀", lo: 3, hi: 7 },
  { e: "✏️", lo: 1, hi: 3 }, { e: "🍫", lo: 1, hi: 4 }, { e: "🎲", lo: 3, hi: 9 }, { e: "🖍️", lo: 3, hi: 8 },
  { e: "🌻", lo: 3, hi: 8 }, { e: "🍕", lo: 6, hi: 12 }, { e: "🚗", lo: 5, hi: 15 }, { e: "🎨", lo: 6, hi: 15 },
  { e: "🧤", lo: 5, hi: 15 }, { e: "🧩", lo: 8, hi: 20 }, { e: "🧢", lo: 8, hi: 20 }, { e: "⚽", lo: 10, hi: 25 },
  { e: "📚", lo: 10, hi: 25 }, { e: "🎸", lo: 15, hi: 40 }, { e: "🧸", lo: 12, hi: 30 }, { e: "🎧", lo: 20, hi: 60 },
  { e: "🎒", lo: 25, hi: 50 }, { e: "👟", lo: 30, hi: 70 }, { e: "🎮", lo: 30, hi: 60 }, { e: "🛹", lo: 40, hi: 90 },
];
const CUSTOMERS = ["🐻", "🐰", "🦊", "🐷", "🐸", "🐼", "🐨", "🦔"];

let mode: Mode = "menu";
let level = 0;
let t = 0;
let task = 0;
let right = 0;
let firstTry = true;
let solved = -1;
let best: number[] = [];
let steps: number[] = [];
let streak = 0;
let misses = 0;
let stepMsg = -10;
let stepUp = true;
let hits: Hit[] = [];
let shake = { k: "", t: -9 };
let fly: Fly[] = [];
let note = "";            // a short line under the task after a try ("Liikaa!", hint)
let noteT = -9;

// the task (fields used by its kind)
let kind = "";            // find | more | count | pay | change | changepick | compare | enough | shop
let ask = "";             // the question on the screen
let say: string[] = [];   // and said aloud
let pieces: number[] = [];       // find: four values; count/enough: the pile
let groups: number[][] = [];     // more: two piles
let answer = 0;                  // find/more/compare: index; count/changepick/shop: amount; enough: 1 yes 0 no
let choices: number[] = [];      // amounts to choose from
let price = 0;
let paid = 0;                    // change: what the customer gave
let item = "";
let who = "";
let denoms: number[] = [];       // pay/change: the coins and notes to use
let counter: number[] = [];      // what is on the counter
let showSum = true;
let pair: Shelf[] = [];          // compare: two things
let cheaper = true;              // compare: which one is asked
let shelf: Shelf[] = [];         // shop: things on the shelf
let budget = 0;
let need = 2;                    // shop: how many to buy
let picked: boolean[] = [];
let leftPhase = false;           // shop: bought, now how much is left

function fill(arr: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr && i < arr.length ? arr[i] : 0);
  return out;
}

function init() {
  best = fill(rg.load("best", []), LEVELS.length);
  steps = fill(rg.load("steps", []), LEVELS.length);
}

function r(lo: number, hi: number): number { return rg.range(lo, hi); }
function step(): number { return steps[level]; }
function money(c: number): string { return fmt(c, LANG); }

// ---- speech ----------------------------------------------------------------

const PRAISE = ["hyva", "hienoa", "mahtavaa", "oikein", "loistavaa", "jee", "taitava", "osaat"];
let praiseN = 0;
function praise() { praiseN++; return PRAISE[praiseN % PRAISE.length]; }
// "3 euroa 50 senttiä"
function amount(c: number): string[] {
  const e = Math.floor(c / 100), s = c % 100;
  const out: string[] = [];
  if (e > 0) { out.push(rg.sayId.number(e)); out.push(e === 1 ? "rh_euro" : "rh_euroa"); }
  if (s > 0) { out.push(rg.sayId.number(s)); out.push("rh_senttia"); }
  if (!out.length) out.push("n0", "rh_euroa");
  return out;
}
function instruct() { if (say.length) rg.say(say); }

// ---- tasks -----------------------------------------------------------------

// a price for a shop thing in euros, inside lo..hi (whole euros) or with cents
function priceOf(it: Item, lo: number, hi: number, cents: boolean): number {
  const a = Math.max(it.lo, lo), b = Math.min(it.hi, hi);
  let p = r(a, Math.max(a, b)) * 100;
  if (cents) p = Math.max(50, p - rg.pick([0, 10, 20, 50, 50, 60, 80, 90]));
  return p;
}
function itemsIn(lo: number, hi: number): Item[] {
  return ITEMS.filter((it) => it.hi >= lo && it.lo <= hi);
}
function range(): number[] { const s = step(); return s === 0 ? [1, 10] : s === 1 ? [5, 50] : [5, 99]; }

// four amounts: the right one and ones that are easy to mix up with it
function amountChoices(ans: number, near: number[]): number[] {
  const set = [ans];
  let guard = 0;
  while (set.length < 4 && guard < 200) {
    guard++;
    const o = ans + rg.pick(near) * (rg.random() < 0.5 ? -1 : 1);
    if (o >= 0 && set.indexOf(o) < 0) set.push(o);
  }
  return rg.shuffle(set);
}

function makeFind() {
  const s = step();
  if (s === 2) return makeMore();
  const pool = s === 0 ? [100, 200, 500, 1000, 2000, 5000] : MONEY.map((p) => p.v);
  const four = rg.shuffle(pool.slice()).slice(0, 4);
  answer = r(0, 3);
  pieces = four;
  kind = "find";
  ask = rg.t("Etsi ", "Find ", "Busca ") + money(four[answer]);
  say = ["rh_etsi"].concat(amount(four[answer]));
}

// which pile is more money: a big coin is not always worth more
function makeMore() {
  kind = "more";
  const tricks = [[50, 100], [20, 100], [5, 10], [50, 200], [200, 500], [100, 50]];
  if (rg.random() < 0.35) {
    const p = rg.pick(tricks);
    groups = rg.random() < 0.5 ? [[p[0]], [p[1]]] : [[p[1]], [p[0]]];
  } else {
    const d = [10, 20, 50, 100, 200, 500, 1000];
    let a: number[] = [], b: number[] = [];
    for (let g = 0; g < 50; g++) {
      a = []; b = [];
      for (let i = r(1, 3); i > 0; i--) a.push(rg.pick(d));
      for (let i = r(1, 3); i > 0; i--) b.push(rg.pick(d));
      if (total(a) !== total(b) && Math.abs(total(a) - total(b)) <= 500) break;
    }
    groups = [a.sort((x, y) => y - x), b.sort((x, y) => y - x)];
  }
  answer = total(groups[0]) > total(groups[1]) ? 0 : 1;
  ask = rg.t("Kummassa on enemmän rahaa?", "Which has more money?", "¿Dónde hay más dinero?");
  say = ["rh_enemman"];
}

function makeCount() {
  const s = step();
  kind = "count";
  let d = [100, 200, 500], c = r(3, 10) * 100, max = 4;
  if (s === 1) { d = [100, 200, 500, 1000, 2000]; c = r(8, 50) * 100; max = 5; }
  if (s === 2) { d = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]; c = r(10, 99) * 100 + rg.pick([0, 50, 50, 20, 70, 30, 80]); max = 7; }
  pieces = handful(c, d, max, rg.random);
  answer = total(pieces);
  choices = amountChoices(answer, s === 0 ? [100, 200, 100] : s === 1 ? [100, 500, 1000, 200] : [50, 100, 1000, 500, 20]);
  ask = rg.t("Paljonko rahaa on?", "How much money is there?", "¿Cuánto dinero hay?");
  say = ["rh_paljonko"];
}

function makePay() {
  const s = step();
  kind = "pay";
  const rg2 = range();
  const it = rg.pick(itemsIn(s === 0 ? 1 : 8, rg2[1]));
  item = it.e;
  price = priceOf(it, s === 0 ? 1 : 8, rg2[1], s === 2);
  denoms = s === 0 ? [100, 200, 500] : s === 1 ? [100, 200, 500, 1000, 2000] : [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  counter = [];
  showSum = s === 0;
  ask = rg.t("Maksa tasan ", "Pay exactly ", "Paga exacto ") + money(price);
  say = ["rh_maksaa"].concat(amount(price), ["rh_maksa"]);
}

function makeChange() {
  const s = step();
  const it = rg.pick(itemsIn(1, s === 1 ? 45 : 9));
  item = it.e;
  who = rg.pick(CUSTOMERS);
  if (s === 0) { price = priceOf(it, 1, 9, false); paid = 1000; }
  else if (s === 1) { price = priceOf(it, 3, 45, false); paid = price < 1800 ? 2000 : 5000; }
  else { price = priceOf(it, 1, 9, true); paid = rg.pick([1000, 1000, 2000]); if (price < 100) price += 100; }
  const ch = paid - price;
  if (s === 0) {
    kind = "changepick";
    answer = ch;
    choices = amountChoices(ch, [100, 200, 100, 300]);
  } else {
    kind = "change";
    denoms = s === 1 ? [100, 200, 500, 1000, 2000] : [10, 20, 50, 100, 200, 500];
    counter = [];
    showSum = false;
  }
  const q = kind === "change";
  ask = rg.t("Hinta " + money(price) + ". Asiakas antaa " + money(paid) + ". " + (q ? "Anna vaihtorahat." : "Paljonko takaisin?"),
    "Price " + money(price) + ". The customer gives " + money(paid) + ". " + (q ? "Give the change." : "How much change?"),
    "Precio " + money(price) + ". El cliente da " + money(paid) + ". " + (q ? "Dale el cambio." : "¿Cuánto le devuelves?"));
  say = ["rh_maksaa"].concat(amount(price), ["rh_asiakas"], amount(paid), [kind === "change" ? "rh_anna" : "rh_takaisin"]);
}

function makeCompare() {
  const s = step();
  if (s === 2 && rg.random() < 0.5) return makeEnough();
  kind = "compare";
  let a = 0, b = 0;
  const its = rg.shuffle(itemsIn(1, s === 0 ? 20 : 99).slice());
  if (s === 0) { a = r(1, 20); do { b = r(1, 20); } while (Math.abs(a - b) < 3); a *= 100; b *= 100; }
  else if (s === 1) {
    // close prices, sometimes the digits swapped: 45 € and 54 €
    a = r(12, 98);
    b = rg.random() < 0.4 && a % 10 !== Math.floor(a / 10) && a % 10 > 0 ? (a % 10) * 10 + Math.floor(a / 10) : a + rg.pick([-9, -5, -3, -1, 1, 3, 5, 9]);
    if (b < 1 || b === a) b = a + 2;
    a *= 100; b *= 100;
  } else {
    // cents: 3,50 € and 3,05 €, 12,90 € and 13,10 €
    const e = r(1, 15);
    a = e * 100 + rg.pick([50, 90, 5, 20]);
    b = rg.random() < 0.5 ? e * 100 + rg.pick([5, 15, 45, 95]) : (e + 1) * 100 + rg.pick([0, 10, 5]);
    if (a === b) b += 10;
  }
  pair = [{ e: its[0].e, p: a }, { e: its[1].e, p: b }];
  cheaper = rg.random() < 0.6;
  answer = (a < b) === cheaper ? 0 : 1;
  ask = cheaper ? rg.t("Kumpi on halvempi?", "Which is cheaper?", "¿Cuál es más barato?") : rg.t("Kumpi on kalliimpi?", "Which costs more?", "¿Cuál es más caro?");
  say = [cheaper ? "rh_halvempi" : "rh_kalliimpi"];
}

// do the coins in my purse buy it?
function makeEnough() {
  kind = "enough";
  const have = r(3, 20) * 100 + rg.pick([0, 50, 20]);
  pieces = handful(have, [10, 20, 50, 100, 200, 500, 1000], 6, rg.random);
  const diff = rg.pick([-300, -150, -50, -20, 20, 50, 150, 300]);
  price = Math.max(50, have + diff);
  const e = Math.max(1, Math.round(price / 100));
  const fit = itemsIn(e, e);
  item = (fit.length ? rg.pick(fit) : rg.pick(ITEMS)).e;
  answer = price <= have ? 1 : 0;
  ask = rg.t("Maksaa " + money(price) + ". Riittävätkö rahasi?", "It costs " + money(price) + ". Do you have enough?", "Cuesta " + money(price) + ". ¿Te llega?");
  say = ["rh_maksaa"].concat(amount(price), ["rh_riittaako"]);
}

function makeShop() {
  const s = step();
  kind = "shop";
  leftPhase = false;
  budget = s === 0 ? 1000 : s === 1 ? rg.pick([2000, 3000, 5000]) : rg.pick([5000, 10000]);
  need = s === 0 ? 2 : 3;
  const hi = budget / 100;
  for (let g = 0; g < 200; g++) {
    const its = rg.shuffle(itemsIn(1, Math.min(hi, s === 0 ? 9 : hi)).slice()).slice(0, 6);
    if (its.length < 6) continue;
    shelf = its.map((it) => ({ e: it.e, p: priceOf(it, 1, Math.floor(hi * 0.7), false) }));
    const ps = shelf.map((x) => x.p);
    // there is a way to buy them, but not every way works
    if (cheapest(ps, need) <= budget && dearest(ps, need) > budget) break;
  }
  picked = shelf.map(() => false);
  ask = rg.t("Sinulla on " + money(budget) + ". Osta " + need + " tavaraa.", "You have " + money(budget) + ". Buy " + need + " things.", "Tienes " + money(budget) + ". Compra " + need + " cosas.");
  say = ["rh_sinulla"].concat(amount(budget), [need === 2 ? "rh_osta2" : "rh_osta3"]);
}

function next() {
  firstTry = true;
  solved = -1;
  fly = [];
  note = "";
  if (level === 0) makeFind();
  else if (level === 1) makeCount();
  else if (level === 2) makePay();
  else if (level === 3) makeChange();
  else if (level === 4) makeCompare();
  else makeShop();
  instruct();
}

function startLevel(i: number) {
  level = i;
  task = 0;
  right = 0;
  streak = 0;
  misses = 0;
  stepMsg = -10;
  mode = "play";
  rg.sound("click");
  next();
}

function setStep(d: number) {
  const s = Math.max(0, Math.min(STEPS - 1, steps[level] + d));
  if (s === steps[level]) return;
  steps[level] = s;
  rg.save("steps", steps);
  stepMsg = t;
  stepUp = d > 0;
  streak = 0;
  misses = 0;
}

function good(x: number, y: number, extra: string[]) {
  solved = t;
  if (firstTry) { right++; streak++; misses = 0; }
  rg.celebrate(x, y, { sound: false });
  rg.sound(firstTry ? "star" : "coin");
  rg.vibrate(25);
  rg.say(extra.concat([praise()]));
  if (streak >= 3) setStep(1);
}

function bad(k: string, sayId: string, line: string) {
  if (firstTry) { misses++; streak = 0; if (misses >= 2) setStep(-1); }
  firstTry = false;
  shake = { k, t };
  rg.sound("wrong");
  rg.vibrate(60);
  rg.say(sayId);
  note = line;
  noteT = t;
}

// ---- answers ---------------------------------------------------------------

function pickIndex(i: number, x: number, y: number) {
  if (solved >= 0) return;
  if (i === answer) good(x, y, kind === "find" ? amount(pieces[answer]) : []);
  else bad("i" + i, "kokeile_toista", "");
}

function pickAmount(i: number, x: number, y: number) {
  if (solved >= 0) return;
  if (choices[i] === answer) {
    if (kind === "shop") { solved = t; good(x, y, amount(answer)); return; }
    good(x, y, amount(answer));
  } else bad("c" + i, "kokeile_toista", kind === "changepick" ? rg.t(money(price) + " + ? = " + money(paid), money(price) + " + ? = " + money(paid), money(price) + " + ? = " + money(paid)) : "");
}

function pickYesNo(yes: boolean, x: number, y: number) {
  if (solved >= 0) return;
  if ((yes ? 1 : 0) === answer) good(x, y, [yes ? "rh_riittaa" : "rh_ei_riita"]);
  else bad(yes ? "yes" : "no", "kokeile_toista", rg.t("Laske rahasi: ", "Count your money: ", "Cuenta tu dinero: ") + money(total(pieces)));
}

// pay / change: put a coin on the counter, take one back, and hand it over
function put(v: number, x: number, y: number) {
  if (solved >= 0 || counter.length >= 14) return;
  counter.push(v);
  const to = slot(counter.length - 1);
  fly.push({ v, x0: x, y0: y, x1: to[0], y1: to[1], t0: t, back: false });
  rg.sound("coin", { volume: 0.5, pitch: piece(v).note ? 0.7 : 1.2 });
}
function takeBack(i: number) {
  if (solved >= 0) return;
  counter.splice(i, 1);
  rg.sound("click");
}
function handOver() {
  if (solved >= 0) return;
  const want = kind === "pay" ? price : paid - price;
  const have = total(counter);
  if (have === want) {
    good(width / 2, counterY() + 60, kind === "change" ? ["rh_kiitos"] : amount(want));
  } else if (have > want) {
    showSum = true;
    bad("ok", "rh_liikaa", rg.t("Liikaa! Ota pois ", "Too much! Take back ", "¡Demasiado! Quita ") + money(have - want));
  } else {
    showSum = true;
    bad("ok", "rh_puuttuu", rg.t("Vielä puuttuu ", "Still missing ", "Faltan ") + money(want - have));
  }
}

function pickShelf(i: number) {
  if (solved >= 0 || leftPhase) return;
  if (picked[i]) { picked[i] = false; rg.sound("click"); return; }
  if (picked.filter((x) => x).length >= need) { rg.sound("wrong"); return; }
  picked[i] = true;
  rg.sound("pop");
}
function buy() {
  if (solved >= 0 || leftPhase) return;
  const n = picked.filter((x) => x).length;
  if (n < need) { rg.say(need === 2 ? "rh_osta2" : "rh_osta3"); shake = { k: "ok", t }; return; }
  const sum = total(shelf.filter((x, i) => picked[i]).map((x) => x.p));
  if (sum > budget) { bad("ok", "rh_ei_riita", rg.t("Yhteensä " + money(sum) + ". Rahat eivät riitä!", "Total " + money(sum) + ". Not enough money!", "Total " + money(sum) + ". ¡No te llega!")); return; }
  // bought: now how much money is left?
  leftPhase = true;
  answer = budget - sum;
  choices = amountChoices(answer, step() === 0 ? [100, 200, 100] : [100, 1000, 500, 200]);
  rg.sound("coin");
  ask = rg.t("Yhteensä " + money(sum) + ". Paljonko rahaa jää?", "Total " + money(sum) + ". How much is left?", "Total " + money(sum) + ". ¿Cuánto te queda?");
  say = ["rh_jaa"];
  instruct();
}

// ---- frame -----------------------------------------------------------------

function tick(dt: number) {
  t += dt;
  if (mode === "play" && solved >= 0 && t - solved > 1.6) {
    task++;
    if (task >= ROUND) finish();
    else next();
  }
}

function finish() {
  mode = "done";
  if (right > best[level]) { best[level] = right; rg.save("best", best); }
  if (right * 2 >= ROUND) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
  rg.say(right >= 2 ? [right >= 7 ? "mahtavaa" : right >= 4 ? "hienoa" : "hyvin_meni", "sait", rg.sayId.number(right), "tahtea"] : ["hyvin_meni"]);
}

function onPointerDown(x: number, y: number) {
  if (mode !== "play") return;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.fn(); return; }
  }
}

function toMenu() { mode = "menu"; rg.stopSay(); rg.sound("click"); }
function onBack() { if (mode === "menu") rg.exit(); else toMenu(); }

// ---- drawing ---------------------------------------------------------------

function hit(x: number, y: number, w: number, h: number, fn: () => void) { hits.push({ x, y, w, h, fn }); }

function wob(k: string): number {
  if (shake.k !== k) return 0;
  const e = Math.max(0, 1 - (t - shake.t) / 0.45);
  return Math.sin((t - shake.t) * 45) * 9 * e;
}

// a coin or note at its real size times `k` (coins by mm * 2.3, notes by mm * 0.95)
function size(v: number, k: number): number[] {
  const p = piece(v);
  const s = p.note ? 0.95 : 2.3;
  return [p.w * s * k, p.h * s * k];
}
function Money(v: number, cx: number, cy: number, k: number, extra?: any) {
  const sz = size(v, k);
  const st: any = { left: cx - sz[0] / 2, top: cy - sz[1] / 2, width: sz[0], height: sz[1] };
  if (extra) for (const key in extra) st[key] = extra[key];
  return <img className="abs" src={rg.asset("img/" + piece(v).id + ".png")} style={st} />;
}

function counterY(): number { return 188; }
function counterH(): number { return height - 432; }

// where the n:th thing on the counter lies: notes fanned on the left, coins in rows
function slot(n: number): number[] {
  const notes = counter.filter((v) => piece(v).note).length;
  const v = counter[n];
  if (piece(v).note) {
    let i = 0;
    for (let j = 0; j < n; j++) if (piece(counter[j]).note) i++;
    return [80 + (i % 5) * 14, counterY() + 50 + (i % 5) * 18 + Math.floor(i / 5) * 8];
  }
  let i = 0;
  for (let j = 0; j < n; j++) if (!piece(counter[j]).note) i++;
  const x0 = notes > 0 ? 196 : 60, cols = notes > 0 ? 3 : 5;
  return [x0 + (i % cols) * 50, counterY() + 40 + Math.floor(i / cols) * 52];
}

function Head() {
  const dots = [];
  for (let i = 0; i < ROUND; i++) dots.push(<div className={i < task ? "dotdone" : i === task ? "dotnow" : "dot"} />);
  const s = step();
  const bars = [];
  for (let i = 0; i < STEPS; i++) bars.push(<div className={i <= s ? "sbaron" : "sbar"} style={{ height: 8 + i * 6 }} />);
  const fresh = t - stepMsg < 1.6;
  return (
    <div className="head">
      <div className="progress">{dots}<div className="steps">{bars}</div>{fresh ? <div className={stepUp ? "stepup" : "stepdown"}>{stepUp ? "▲" : "▼"}</div> : null}</div>
      <div className="ask" id="ask" onClick={() => instruct()}>🔊 {ask}</div>
    </div>
  );
}

function Note() {
  if (!note || t - noteT > 6) return null;
  const y = kind === "pay" || kind === "change" ? counterY() + counterH() - 90 : kind === "shop" ? 120 : height - 236;
  return <div className="abs note" style={{ left: 20, top: y, width: 320 }}>{note}</div>;
}

// a pill with an amount (the answers of count, change and shop)
function AmountChoices(out: any[], y: number) {
  for (let i = 0; i < choices.length; i++) {
    const x = i % 2 === 0 ? 24 : 186, yy = y + Math.floor(i / 2) * 72;
    const ok = solved >= 0 && choices[i] === answer;
    out.push(<div className={ok ? "abs pill pillok" : "abs pill"} style={{ left: x + wob("c" + i), top: yy }}>{money(choices[i])}</div>);
    hit(x, yy, 150, 60, () => pickAmount(i, x + 75, yy + 30));
  }
}

function PlayFind(out: any[]) {
  const top = 150, cw = 160, ch = (height - top - 60) / 2 - 10;
  for (let i = 0; i < 4; i++) {
    const x = i % 2 === 0 ? 16 : 184, y = top + Math.floor(i / 2) * (ch + 14);
    const ok = solved >= 0 && i === answer;
    out.push(<div className={ok ? "abs tile tileok" : "abs tile"} style={{ left: x + wob("i" + i), top: y, width: cw, height: ch }} />);
    const k = piece(pieces[i]).note ? 1 : 1.25;
    out.push(Money(pieces[i], x + cw / 2 + wob("i" + i), y + ch / 2, k));
    hit(x, y, cw, ch, () => pickIndex(i, x + cw / 2, y + ch / 2));
  }
}

function Pile(out: any[], list: number[], x0: number, y0: number, w: number, k: number) {
  // notes overlapping in a row, coins in rows under them
  const notes = list.filter((v) => piece(v).note), coins = list.filter((v) => !piece(v).note);
  let y = y0;
  if (notes.length) {
    const nw = size(notes[0], k)[0];
    const gap = Math.min(nw + 6, (w - nw) / Math.max(1, notes.length - 1));
    const span = nw + gap * (notes.length - 1);
    for (let i = 0; i < notes.length; i++) out.push(Money(notes[i], x0 + (w - span) / 2 + nw / 2 + i * gap, y + 40 * k, k, { transform: "rotate(" + ((i - notes.length / 2) * 3).toFixed(1) + "deg)" }));
    y += 90 * k;
  }
  const per = Math.max(1, Math.floor(w / (64 * k)));
  for (let i = 0; i < coins.length; i++) {
    const row = Math.floor(i / per), inRow = Math.min(per, coins.length - row * per);
    out.push(Money(coins[i], x0 + w / 2 + ((i % per) - (inRow - 1) / 2) * 64 * k, y + 32 * k + row * 66 * k, k));
  }
}

function pileHeight(list: number[], w: number, k: number): number {
  const notes = list.filter((v) => piece(v).note).length, coins = list.length - notes;
  const per = Math.max(1, Math.floor(w / (64 * k)));
  return (notes ? 90 * k : 0) + Math.ceil(coins / per) * 66 * k;
}

function PlayMore(out: any[]) {
  const top = 160, ch = height - 260;
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? 12 : 184, w = 164;
    const ok = solved >= 0 && i === answer;
    out.push(<div className={ok ? "abs tile tileok" : "abs tile"} style={{ left: x + wob("i" + i), top, width: w, height: ch }} />);
    const g = groups[i];
    // a pile: pieces under each other
    const kOf = (v: number) => piece(v).note ? (g.length > 2 ? 0.8 : 0.95) : (g.length > 2 ? 1.1 : 1.4);
    let gh = 0;
    for (const v of g) gh += size(v, kOf(v))[1] + 12;
    let y = top + Math.max(16, (ch - 50 - gh) / 2);
    for (let j = 0; j < g.length; j++) {
      const k = kOf(g[j]);
      const sz = size(g[j], k);
      out.push(Money(g[j], x + w / 2 + wob("i" + i), y + sz[1] / 2, k));
      y += sz[1] + 12;
    }
    if (solved >= 0) out.push(<div className="abs sumtag" style={{ left: x, top: top + ch - 44, width: w }}>{money(total(g))}</div>);
    hit(x, top, w, ch, () => pickIndex(i, x + w / 2, top + ch / 2));
  }
}

function PlayCount(out: any[]) {
  const s = step(), top = 120, h = height - 312;
  out.push(<div className="abs table" style={{ left: 10, top, width: 340, height: h }} />);
  const k = s === 0 ? 1.3 : s === 1 ? 1.05 : 0.9;
  const ph = pileHeight(pieces, 320, k);
  Pile(out, pieces, 20, top + Math.max(10, (h - ph) / 2), 320, k);
  AmountChoices(out, height - 170);
}

// the denominations under the counter: two rows of buttons
function Purse(out: any[]) {
  const n = denoms.length, cols = n > 6 ? 5 : n > 3 ? 3 : 3;
  const rows = Math.ceil(n / cols), cw = 340 / cols, chh = 64;
  const y0 = height - 96 - rows * chh;
  out.push(<div className="abs purse" style={{ left: 6, top: y0 - 8, width: 348, height: rows * chh + 14 }} />);
  for (let i = 0; i < n; i++) {
    const v = denoms[i];
    const cx = 10 + cw * (i % cols) + cw / 2, cy = y0 + chh * Math.floor(i / cols) + chh / 2;
    const p = piece(v);
    const k = p.note ? Math.min(0.62, (cw - 8) / (p.w * 0.95)) : n > 6 ? 0.95 : 1.15;
    out.push(Money(v, cx, cy, k));
    hit(cx - cw / 2, cy - chh / 2, cw, chh, () => put(v, cx, cy));
  }
  // hand it over
  const by = height - 82;
  out.push(<div className="abs okbtn" style={{ left: 60 + wob("ok"), top: by }}>{kind === "pay" ? rg.t("✔ Maksa", "✔ Pay", "✔ Pagar") : rg.t("✔ Anna", "✔ Give", "✔ Dar")}</div>);
  hit(60, by, 240, 60, () => handOver());
}

function Counter(out: any[]) {
  const y = counterY(), h = counterH();
  out.push(<div className="abs table" style={{ left: 10, top: y, width: 340, height: h }} />);
  // flying pieces land on their slot; the counter shows the rest
  const landing: number[] = [];
  for (const f of fly) if (t - f.t0 < 0.25) landing.push(f.v);
  for (let i = 0; i < counter.length; i++) {
    const s = slot(i);
    const p = piece(counter[i]);
    const k = p.note ? 0.75 : 0.9;
    const sz = size(counter[i], k);
    out.push(Money(counter[i], s[0], s[1], k));
    hit(s[0] - sz[0] / 2, s[1] - sz[1] / 2, sz[0], sz[1], () => takeBack(i));
  }
  for (const f of fly) {
    const e = (t - f.t0) / 0.25;
    if (e >= 1) continue;
    out.push(Money(f.v, f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e, 0.9));
  }
  if (showSum) out.push(<div className="abs sumtag" style={{ left: 10, top: y + h - 40, width: 340 }}>{rg.t("Tiskillä ", "On the counter ", "En el mostrador ") + money(total(counter))}</div>);
  if (!counter.length) out.push(<div className="abs hint" style={{ left: 10, top: y + h / 2 - 14, width: 340 }}>{rg.t("Napauta rahaa alhaalta 👇", "Tap the money below 👇", "Toca el dinero de abajo 👇")}</div>);
}

function PlayPay(out: any[]) {
  // the thing and its price tag
  out.push(<div className="abs bigitem" style={{ left: 40, top: 114 }}>{item}</div>);
  out.push(<div className="abs tag" style={{ left: 120, top: 124 }}>{money(price)}</div>);
  Counter(out);
  Purse(out);
}

function PlayChange(out: any[]) {
  out.push(<div className="abs bigitem" style={{ left: 18, top: 114 }}>{who}</div>);
  out.push(<div className="abs bubble" style={{ left: 92, top: 122 }}>{item} {money(price)}</div>);
  if (kind === "changepick") {
    // the note the customer pays with, on the counter
    out.push(<div className="abs table" style={{ left: 10, top: 186, width: 340, height: height - 396 }} />);
    out.push(Money(paid, 180, 186 + (height - 396) / 2, 1.3, { transform: "rotate(" + (-4).toFixed(1) + "deg)" }));
    AmountChoices(out, height - 170);
    return;
  }
  out.push(Money(paid, 300, 148, 0.5, { transform: "rotate(" + (8).toFixed(1) + "deg)" }));
  Counter(out);
  Purse(out);
}

function PriceCard(out: any[], i: number, s: Shelf, x: number, y: number, w: number, h: number, ok: boolean) {
  out.push(<div className={ok ? "abs tile tileok" : "abs tile"} style={{ left: x + wob("i" + i), top: y, width: w, height: h }} />);
  out.push(<div className="abs cardemoji" style={{ left: x + wob("i" + i), top: y + h * 0.18, width: w }}>{s.e}</div>);
  out.push(<div className="abs tag" style={{ left: x + w / 2 - 60 + wob("i" + i), top: y + h - 70 }}>{money(s.p)}</div>);
}

function PlayCompare(out: any[]) {
  if (kind === "enough") {
    out.push(<div className="abs bigitem" style={{ left: 40, top: 114 }}>{item}</div>);
    out.push(<div className="abs tag" style={{ left: 120, top: 124 }}>{money(price)}</div>);
    out.push(<div className="abs table" style={{ left: 10, top: 186, width: 340, height: height - 386 }} />);
    out.push(<div className="abs hint" style={{ left: 10, top: 194, width: 340 }}>{rg.t("Sinun rahasi", "Your money", "Tu dinero")}</div>);
    Pile(out, pieces, 20, 228, 320, 0.9);
    const y = height - 150;
    const okY = solved >= 0 && answer === 1, okN = solved >= 0 && answer === 0;
    out.push(<div className={okY ? "abs yes pillok" : "abs yes"} style={{ left: 24 + wob("yes"), top: y }}>{rg.t("✔ Riittää", "✔ Enough", "✔ Me llega")}</div>);
    out.push(<div className={okN ? "abs no pillok" : "abs no"} style={{ left: 186 + wob("no"), top: y }}>{rg.t("✖ Ei riitä", "✖ Not enough", "✖ No me llega")}</div>);
    hit(24, y, 150, 80, () => pickYesNo(true, 99, y + 40));
    hit(186, y, 150, 80, () => pickYesNo(false, 261, y + 40));
    return;
  }
  const top = 170, h = Math.min(320, height - 300);
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? 14 : 186;
    PriceCard(out, i, pair[i], x, top, 160, h, solved >= 0 && i === answer);
    hit(x, top, 160, h, () => pickIndex(i, x + 80, top + h / 2));
  }
}

function PlayShop(out: any[]) {
  const cols = 3, cw = 108, ch = leftPhase ? 92 : 128, x0 = 13, y0 = 150;
  for (let i = 0; i < shelf.length; i++) {
    const x = x0 + (i % cols) * (cw + 3), y = y0 + Math.floor(i / cols) * (ch + 8);
    const sel = picked[i];
    if (leftPhase && !sel) continue;
    out.push(<div className={sel ? "abs shelf shelfon" : "abs shelf"} style={{ left: x, top: y, width: cw, height: ch }} />);
    out.push(<div className="abs shelfemoji" style={{ left: x, top: y + 10, width: cw }}>{shelf[i].e}</div>);
    out.push(<div className="abs smalltag" style={{ left: x + 8, top: y + ch - 40, width: cw - 16 }}>{money(shelf[i].p)}</div>);
    if (sel) out.push(<div className="abs check" style={{ left: x + cw - 30, top: y + 4 }}>✔</div>);
    hit(x, y, cw, ch, () => pickShelf(i));
  }
  // the basket: what the picked things cost and the money there is
  const sum = total(shelf.filter((x, i) => picked[i]).map((x) => x.p));
  const n = picked.filter((x) => x).length;
  const by = y0 + 2 * (ch + 8) + 6;
  if (!leftPhase) {
    const over = sum > budget;
    const frac = Math.min(1, sum / budget);
    out.push(<div className="abs budget" style={{ left: 20, top: by, width: 320 }} />);
    out.push(<div className={over ? "abs budgetfill over" : "abs budgetfill"} style={{ left: 20, top: by, width: Math.max(8, 320 * frac) }} />);
    out.push(<div className="abs budgettext" style={{ left: 20, top: by + 6, width: 320 }}>🧺 {money(sum)} / {money(budget)}  ({n}/{need})</div>);
    // the money the child has, as notes
    const have = fewest(budget, [1000, 2000, 5000, 10000]);
    for (let i = 0; i < have.length; i++) out.push(Money(have[i], 180 + (i - (have.length - 1) / 2) * 50, by + 100, 0.6, { transform: "rotate(" + ((i - 0.5) * 6).toFixed(1) + "deg)" }));
    const y = height - 82;
    out.push(<div className={n === need ? "abs okbtn" : "abs okbtn okoff"} style={{ left: 60 + wob("ok"), top: y }}>{rg.t("🛒 Osta", "🛒 Buy", "🛒 Comprar")}</div>);
    hit(60, y, 240, 60, () => buy());
  } else {
    out.push(<div className="abs budgettext" style={{ left: 20, top: by - 4, width: 320 }}>{money(budget)} − {money(sum)} = {solved >= 0 ? money(answer) : "?"}</div>);
    AmountChoices(out, height - 170);
  }
}

function Play() {
  hits = [];
  const out: any[] = [];
  if (kind === "find") PlayFind(out);
  else if (kind === "more") PlayMore(out);
  else if (kind === "count") PlayCount(out);
  else if (kind === "pay") PlayPay(out);
  else if (kind === "change" || kind === "changepick") PlayChange(out);
  else if (kind === "compare" || kind === "enough") PlayCompare(out);
  else PlayShop(out);
  return (
    <div className="screen">
      {Head()}
      {out}
      {Note()}
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 4;
  const coins = [200, 100, 50, 20];
  const deco = coins.map((v, i) => Money(v, 90 + i * 60, 118 + Math.sin(t * 3 + i) * 4, 0.9));
  return (
    <div className="screen col">
      <div className="title" style={{ marginTop: 22 + bob }}>{rg.t("Rahakauppa", "Money Shop", "La tienda")}</div>
      <div className="spacer" />
      {deco}
      {LEVELS.map((L, i) => (
        <div className="level" id={"lv" + i} onClick={() => startLevel(i)} style={{ backgroundColor: L.color }}>
          <div className="lvname">{L.icon} {L.name}</div>
          <div className="lvbest">{(best[i] > 0 ? "⭐ " + best[i] + "/" + ROUND : "") + (steps[i] > 0 ? "  " + ["▮", "▮▮", "▮▮▮"][steps[i]] : "")}</div>
        </div>
      ))}
      <div className="level back" id="exit" onClick={() => rg.exit()}><div className="lvname">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>
    </div>
  );
}

function Done() {
  const stars = [];
  for (let i = 0; i < ROUND; i++) stars.push(<div className={i < right ? "bigstar" : "bigstaroff"}>⭐</div>);
  return (
    <div className="screen col">
      <div className="title" style={{ marginTop: 80 }}>{right >= 7 ? rg.t("Mahtavaa!", "Awesome!", "¡Fantástico!") : right >= 4 ? rg.t("Hienoa!", "Great!", "¡Genial!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="stars">{stars}</div>
      <div className="lead">{right} / {ROUND} {rg.t("heti oikein", "right first time", "a la primera")}</div>
      <div className="level" id="again" onClick={() => startLevel(level)} style={{ backgroundColor: LEVELS[level].color }}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="level back" id="menu" onClick={() => toMenu()}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else body = Play();
  return <div className="root">{body}</div>;
}
