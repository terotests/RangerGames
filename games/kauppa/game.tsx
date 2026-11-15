// Oma kauppa: a cookie shop for learning how a shop makes money. For 5- and
// 8-year-olds: everything is said aloud, the money is shown as coins, and
// the first three levels adapt in three steps (lib/kit). Levels:
//   1 Iso pussi    which way of buying the cookies is cheapest? The more you
//                  buy at once, the cheaper each cookie is
//   2 Hinta        you bought cookies: at which price do you get the most
//                  money? Cheap brings many buyers, dear brings more per cookie
//   3 Mainos       a poster costs money but brings more buyers: how many pay off?
//   4 Oma kauppa   six days of your own shop: buy bags (big ones are cheaper),
//                  set the price and the posters, open the shop and watch the
//                  people come. Save money for a bike (the goal is the step)
// The rules (and the puzzles' one right answer) are in lib/shop.ts, checked by
// tests/kauppa.ts.
import { K, Level, setup, step, win, miss, update, back, toMenu, start, Header, Menu, Done, Sparks, Poly, Line, Circle, Box, PointAt, star, burst } from "lib/kit";
import { bulkQuestion, BulkQ, priceQuestion, PriceQ, takings, sold, adQuestion, AdQ, adPeople, adIn, adProfit, BAGS, AD_COST, MAX_ADS, PRICES, START_MONEY, DAYS, GOALS, expected, runDay, Day } from "lib/shop";

const RED = "#d62828", GREEN = "#06a77d", INK = "#3d405b";
const SHIRTS = ["#ef476f", "#118ab2", "#06d6a0", "#ffd166", "#8338ec", "#f77f00", "#3a86ff", "#e76f51"];

const LEVELS: Level[] = [
  { name: rg.t("Iso pussi", "Big bag", "Bolsa grande"), color: "#f4a261", say: "ka_l_pussi", pic: (x, y, s) => Bag(x - 22 * s, y + 14 * s, 0.7 * s, 5).concat(Bag(x + 20 * s, y + 8 * s, 1.0 * s, 20)) },
  { name: rg.t("Hinta", "Price", "Precio"), color: "#2a9d8f", say: "ka_l_hinta", pic: (x, y, s) => Tag(x, y + 4 * s, 2, 1.3 * s, false) },
  { name: rg.t("Mainos", "Advert", "Anuncio"), color: "#e76f51", say: "ka_l_mainos", pic: (x, y, s) => Poster(x - 4 * s, y + 4 * s, 1.1 * s).concat(Person(x + 34 * s, y + 6 * s, 0.9 * s, SHIRTS[1], "happy")) },
  { name: rg.t("Oma kauppa", "My shop", "Mi tienda"), color: "#8338ec", say: "ka_l_kauppa", pic: (x, y, s) => MiniShop(x, y + 6 * s, s) },
];

// ---- pictures ----------------------------------------------------------------------

function CookieIcon(x: number, y: number, r: number) {
  const out: any[] = [Circle(x, y, r, "#d4a373", "#a26b3c")];
  if (r >= 6) {
    out.push(Circle(x - r * 0.35, y - r * 0.25, r * 0.17, "#5c3d2e"));
    out.push(Circle(x + r * 0.3, y - r * 0.05, r * 0.17, "#5c3d2e"));
    out.push(Circle(x - r * 0.05, y + r * 0.38, r * 0.17, "#5c3d2e"));
  }
  return out;
}

// a paper bag of `size` cookies, about 50 × 60 at s = 1, (x, y) its middle
function Bag(x: number, y: number, s: number, size: number) {
  if (size === 1) return CookieIcon(x, y, 13 * s);
  const w = 46 * s, h = 54 * s;
  const out: any[] = [
    Poly([[x - w / 2, y - h / 2 + 6 * s], [x + w / 2, y - h / 2 + 6 * s], [x + w / 2 + 3 * s, y + h / 2], [x - w / 2 - 3 * s, y + h / 2]], "#e9c46a", "#b08a2e", Math.max(1, 2 * s)),
    Poly([[x - w / 2, y - h / 2 + 6 * s], [x - w / 2 + 6 * s, y - h / 2], [x + w / 2 - 6 * s, y - h / 2], [x + w / 2, y - h / 2 + 6 * s]], "#d9b44a"),
  ];
  for (const e of CookieIcon(x, y - 6 * s, 12 * s)) out.push(e);
  out.push(<div className="bagnum" style={{ left: x - w / 2, top: y + 8 * s, width: w, height: 18 * s, fontSize: Math.round(15 * s) }}>{String(size)}</div>);
  return out;
}

// a price tag with `price` €, about 70 × 44 at s = 1
function Tag(x: number, y: number, price: number, s: number, on: boolean) {
  const w = 70 * s, h = 44 * s;
  return [
    Poly([[x - w / 2 + 14 * s, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2 + 14 * s, y + h / 2], [x - w / 2, y]], on ? "#ffd166" : "#ffffff", "#e09f3e", Math.max(2, 3 * s)),
    Circle(x - w / 2 + 12 * s, y, 4 * s, "#e09f3e"),
    <div className="tagnum" style={{ left: x - w / 2 + 14 * s, top: y - h / 2, width: w - 14 * s, height: h, fontSize: Math.round(22 * s) }}>{price + " €"}</div>,
  ];
}

// an advert poster on a stand, about 50 × 70 at s = 1
function Poster(x: number, y: number, s: number) {
  const out: any[] = [
    Line([[x - 14 * s, y + 10 * s], [x - 20 * s, y + 36 * s]], "#6c584c", Math.max(2, 4 * s)),
    Line([[x + 14 * s, y + 10 * s], [x + 20 * s, y + 36 * s]], "#6c584c", Math.max(2, 4 * s)),
    Box(x - 24 * s, y - 32 * s, 48 * s, 46 * s, "#ffffff", 4 * s),
    Box(x - 24 * s, y - 32 * s, 48 * s, 12 * s, "#e63946", 4 * s),
  ];
  for (const e of CookieIcon(x, y - 2 * s, 10 * s)) out.push(e);
  out.push(Poly(star(x + 15 * s, y - 14 * s, 7 * s, 3.5 * s, 5, -Math.PI / 2), "#ffd166"));
  return out;
}

// a person: head at (x, y), shirt colour, mood "" | "happy" | "sad"
function Person(x: number, y: number, s: number, shirt: string, mood: string) {
  const out: any[] = [Box(x - 11 * s, y + 7 * s, 22 * s, 18 * s, shirt, 9 * s), Circle(x, y, 9 * s, "#ffd6a5")];
  if (s >= 0.7) {
    out.push(Circle(x - 3.2 * s, y - 1.5 * s, 1.4 * s, INK));
    out.push(Circle(x + 3.2 * s, y - 1.5 * s, 1.4 * s, INK));
    if (mood === "sad") out.push(Line([[x - 3.5 * s, y + 5 * s], [x, y + 3 * s], [x + 3.5 * s, y + 5 * s]], INK, Math.max(1, 1.6 * s)));
    else if (mood === "happy") out.push(Poly([[x - 4 * s, y + 2.5 * s], [x + 4 * s, y + 2.5 * s], [x + 2 * s, y + 5.5 * s], [x - 2 * s, y + 5.5 * s]], "#ef476f"));
    else out.push(Box(x - 2.5 * s, y + 3.5 * s, 5 * s, 1.4 * s, INK, 1));
  }
  return out;
}

function MyCoin(x: number, y: number, r: number, out: boolean) {
  return [Circle(x, y, r, out ? "#ffb3c1" : "#ffd166", out ? RED : "#e09f3e"),
    <div className={out ? "coinmark out" : "coinmark"} style={{ left: x - r, top: y - r * 0.9, width: r * 2, height: r * 1.8, fontSize: Math.round(r * 1.2) }}>€</div>];
}
// n coins in rows of `per`, the first row's first coin at (x, y)
function Coins(x: number, y: number, n: number, r: number, per: number, outC: boolean) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) for (const e of MyCoin(x + (i % per) * r * 2.1, y + Math.floor(i / per) * r * 2.1, r, outC)) out.push(e);
  return out;
}
// n coins centred on x
function CoinsC(cx: number, y: number, n: number, r: number, per: number, outC: boolean) {
  const cols = Math.min(n, per);
  return Coins(cx - (cols - 1) * r * 1.05, y, n, r, per, outC);
}

function People(cx: number, y: number, n: number, s: number, per: number, moodOf: (i: number) => string) {
  const out: any[] = [];
  const cols = Math.min(n, per), dx = 22 * s;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per);
    for (const e of Person(cx - (cols - 1) * dx / 2 + (i % per) * dx, y + row * 30 * s, s, SHIRTS[i % SHIRTS.length], moodOf(i))) out.push(e);
  }
  return out;
}

function MiniShop(x: number, y: number, s: number) {
  const w = 90 * s, h = 64 * s;
  const out: any[] = [Box(x - w / 2, y - h / 2, w, h, "#fff1e6", 4 * s)];
  for (let i = 0; i < 6; i++) out.push(Box(x - w / 2 + i * w / 6, y - h / 2 - 8 * s, w / 6, 18 * s, i % 2 ? "#ffffff" : "#e63946", 2 * s));
  out.push(Box(x - w / 2 + 8 * s, y - 2 * s, 36 * s, 26 * s, "#a8dadc", 3 * s));
  for (const e of CookieIcon(x - w / 2 + 26 * s, y + 11 * s, 7 * s)) out.push(e);
  out.push(Box(x + 12 * s, y - 6 * s, 22 * s, 38 * s, "#8d5524", 3 * s));
  return out;
}

// ---- state --------------------------------------------------------------------------
let hintT = -10;
let tried: boolean[] = [];        // options the child already tapped (their money is shown)
let picked = -1;
let bq: BulkQ = { need: 10, options: [], answer: 0 };
let pq: PriceQ = { stock: 10, cost: 5, people: [], answer: 0 };
let aq: AdQ = { price: 1, base: 1, adds: [], cost: 2, stock: 30, answer: 0 };

function rnd() { return rg.random(); }
function euro(n: number) { return n === 1 ? "ka_euro" : "ka_euroa"; }
function num(n: number) { return rg.sayId.number(Math.abs(n)); }
function solved() { return K.solved >= 0; }

// a tap on an option of levels 1-3: right wins, the first miss says "try
// again", the second gives the hint (the pointer shows the right one)
function choose(i: number, answer: number, x: number, y: number, say: string[]) {
  if (solved()) return;
  picked = i;
  if (i === answer) { tried[i] = true; win(x, y, say); return; }
  if (!tried[i]) { tried[i] = true; }
  const k = miss();
  if (k >= 2) { hintT = K.t; hint(); } else rg.say("kokeile_toista");
}

// the layout of the option cards: n cards one under the other between y0 and y1
function cardBox(i: number, n: number) {
  const y0 = 172, y1 = height - 20, gap = 10;
  const h = Math.min(190, (y1 - y0 - gap * (n - 1)) / n);
  return { x: 14, y: y0 + i * (h + gap), w: width - 28, h };
}
// n columns side by side
function colBox(i: number, n: number, y0: number, y1: number) {
  const gap = 8, w = (width - 24 - gap * (n - 1)) / n;
  return { x: 12 + i * (w + gap), y: y0, w, h: y1 - y0 };
}
function cardClass(i: number, answer: number) {
  if (solved() && i === answer) return "card ok";
  if (tried[i] && i !== answer) return "card bad";
  return "card";
}

// ---- level 1: the big bag ------------------------------------------------------------

function next1() { bq = bulkQuestion(step(), rnd); }

function say1() { return ["ka_tarvitset", num(bq.need), "ka_keksia", "ka_mika_halvin"]; }

function Play1() {
  const out: any[] = [];
  const n = bq.options.length, coins = step() < 2;
  // what is needed: "10 cookies"
  out.push(<div className="card" style={{ left: 14, top: 120, width: width - 28, height: 42 }} />);
  for (let k = 0; k < Math.min(bq.need, 10); k++) for (const e of CookieIcon(34 + k * 21, 141, 9)) out.push(e);
  out.push(<div className="mid" style={{ left: width - 100, top: 125, width: 80, height: 32 }}>{"= " + bq.need}</div>);
  bq.options.forEach((o, i) => {
    const b = cardBox(i, n);
    out.push(<div className={cardClass(i, bq.answer)} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
    // the bags on the left
    const cy = b.y + b.h / 2, s = Math.min(1.25, b.h / 110);
    if (o.size === 1) {
      // loose cookies in rows of 6
      for (let k = 0; k < o.count; k++) for (const e of CookieIcon(b.x + 20 + (k % 6) * 19, cy - 12 + Math.floor(k / 6) * 22, 8)) out.push(e);
    } else if (o.count <= 3) {
      const bs = s * (o.size >= 10 ? 1.1 : 0.85);
      for (let k = 0; k < o.count; k++) for (const e of Bag(b.x + 20 + 26 * bs + k * 52 * bs, cy - 4, bs, o.size)) out.push(e);
    } else {
      for (const e of Bag(b.x + 36, cy - 4, s * 0.75, o.size)) out.push(e);
      out.push(<div className="mid" style={{ left: b.x + 60, top: cy - 20, width: 56, height: 32 }}>{"× " + o.count}</div>);
    }
    // the price on the right: coins, or "2 × 4 €" at step 3
    const rx = b.x + b.w * 0.5, rw = b.w * 0.5 - 10;
    if (coins) {
      const r = 12, per = 5;
      const rows = Math.ceil(o.total / per);
      for (const e of Coins(rx + r, cy - (rows - 1) * r * 1.05 - (solved() || tried[i] ? 10 : 0), o.total, r, per, false)) out.push(e);
    } else {
      out.push(<div className="mid" style={{ left: rx, top: cy - 30, width: rw, height: 32 }}>{(o.count > 1 ? o.count + " × " : "") + o.price + " €"}</div>);
    }
    if (solved() || tried[i]) out.push(<div className="sum" style={{ left: rx, top: b.y + b.h - 34, width: rw, height: 28 }}>{"= " + o.total + " €"}</div>);
    out.push(<div className="hit" id={"o" + i} onClick={() => choose(i, bq.answer, b.x + b.w * 0.75, cy, ["ka_iso_halvempi"])} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
  });
  if (K.t - hintT < 5 && !solved()) { const b = cardBox(bq.answer, n); out.push(PointAt(b.x + b.w * 0.75, b.y + 14, "#f77f00")); }
  return out;
}

// ---- level 2: the price ----------------------------------------------------------------

function next2() { pq = priceQuestion(step(), rnd); }

function say2() { return ["ka_ostit", num(pq.stock), "ka_keksia", "ka_ne_maksoivat", num(pq.cost), euro(pq.cost), "ka_mika_hinta"]; }

function win2(i: number) {
  const n = pq.people.length;
  const why = i === 0 ? "ka_halpa_kannatti" : i === n - 1 ? "ka_kallis_kannatti" : "ka_keski_kannatti";
  return ["sait", num(takings(pq, i)), euro(takings(pq, i)), why];
}

// the bought cookies and what they cost, at the top
function Bought(y: number, stock: number, cost: number) {
  const out: any[] = [<div className="card" style={{ left: 14, top: y, width: width - 28, height: 50 }} />];
  for (const e of Bag(44, y + 25, 0.62, stock)) out.push(e);
  out.push(<div className="mid" style={{ left: 70, top: y + 9, width: 120, height: 32 }}>{stock + " " + rg.t("keksiä", "cookies", "galletas")}</div>);
  out.push(<div className="mid" style={{ left: width - 130, top: y + 9, width: 100, height: 32, color: RED }}>{"−" + cost + " €"}</div>);
  return out;
}

function Play2() {
  const out: any[] = Bought(120, pq.stock, pq.cost);
  const n = pq.people.length, show = step() === 0;
  const y0 = 182, y1 = height - 20;
  for (let i = 0; i < n; i++) {
    const b = colBox(i, n, y0, y1), cx = b.x + b.w / 2;
    out.push(<div className={cardClass(i, pq.answer)} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
    for (const e of Tag(cx, b.y + 30, i + 1, Math.min(1, b.w / 80), picked === i)) out.push(e);
    // the people who come at this price (those left without a cookie are sad once it is shown)
    const pc = pq.people[i], per = 3, s = n === 4 ? 1.0 : 1.2;
    const open = show || solved() || tried[i];
    for (const e of People(cx, b.y + 80, pc, s, per, (k) => (open && k >= pq.stock ? "sad" : open ? "happy" : ""))) out.push(e);
    const py = b.y + 80 + Math.ceil(pc / per) * 30 * s;
    out.push(<div className="tiny" style={{ left: b.x, top: py - 4, width: b.w, height: 18 }}>{String(pc)}</div>);
    // what they pay
    const t = takings(pq, i), r = n === 4 ? 7 : 9;
    if (open) for (const e of CoinsC(cx, py + 30, t, r, 5, false)) out.push(e);
    const sy = py + 30 + Math.ceil(t / 5) * r * 2.1;
    if (solved() || tried[i]) out.push(<div className="sum" style={{ left: b.x, top: sy, width: b.w, height: 30 }}>{t + " €"}</div>);
    out.push(<div className="hit" id={"o" + i} onClick={() => choose(i, pq.answer, cx, b.y + 30, win2(i))} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
  }
  if (K.t - hintT < 5 && !solved()) { const b = colBox(pq.answer, n, y0, y1); out.push(PointAt(b.x + b.w / 2, b.y + 6, "#f77f00")); }
  return out;
}

// ---- level 3: adverts -------------------------------------------------------------------

function next3() { aq = adQuestion(step(), rnd); }

function say3() {
  return ["ka_hinta_on", num(aq.price), euro(aq.price), "ka_mainos_maksaa", num(aq.cost), euro(aq.cost), aq.adds.length === 1 ? "ka_kannattaako" : "ka_montako_mainosta"];
}

function win3(i: number) { return [i === 0 ? "ka_mainos_ei_kannata" : "ka_mainos_kannattaa"]; }

function Play3() {
  const out: any[] = [];
  // the price of a cookie, the poster's price, and the cookies left (step 3)
  out.push(<div className="card" style={{ left: 14, top: 120, width: width - 28, height: 50 }} />);
  for (const e of CookieIcon(38, 145, 12)) out.push(e);
  out.push(<div className="mid" style={{ left: 54, top: 129, width: 70, height: 32 }}>{aq.price + " €"}</div>);
  for (const e of Poster(width / 2 + 6, 152, 0.5)) out.push(e);
  out.push(<div className="mid" style={{ left: width / 2 + 22, top: 129, width: 70, height: 32, color: RED }}>{aq.cost + " €"}</div>);
  if (aq.stock < 30) { for (const e of Bag(width - 60, 145, 0.55, aq.stock)) out.push(e); }
  const n = aq.adds.length + 1, show = step() === 0;
  const y0 = 182, y1 = height - 20;
  for (let i = 0; i < n; i++) {
    const b = colBox(i, n, y0, y1), cx = b.x + b.w / 2;
    out.push(<div className={cardClass(i, aq.answer)} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
    // the posters (or a crossed-out one) and what they cost
    if (i === 0) {
      for (const e of Poster(cx, b.y + 44, 0.7)) out.push(e);
      out.push(Line([[cx - 24, b.y + 14], [cx + 24, b.y + 62]], RED, 5));
    } else for (let k = 0; k < i; k++) for (const e of Poster(cx + (k - (i - 1) / 2) * Math.min(26, b.w / i), b.y + 44, 0.6)) out.push(e);
    const open = show || solved() || tried[i];
    const cr = n >= 4 ? 6.5 : n === 3 ? 8 : 12;
    let y = b.y + 78;
    if (i > 0) {
      if (open) { for (const e of CoinsC(cx, y + 8, i * aq.cost, cr, 5, true)) out.push(e); y += Math.ceil(i * aq.cost / 5) * cr * 2.1 + 6; }
      else { out.push(<div className="tiny" style={{ left: b.x, top: y, width: b.w, height: 18, color: RED }}>{"−" + i * aq.cost + " €"}</div>); y += 22; }
    } else y += 6;
    // the people: the ones the posters brought in another colour
    const pc = adPeople(aq, i), per = n >= 3 ? 3 : 4, s = n >= 4 ? 0.75 : n === 3 ? 0.95 : 1.4;
    for (let k = 0; k < pc; k++) {
      const cols = Math.min(pc, per), dx = 22 * s;
      const px = cx - (cols - 1) * dx / 2 + (k % per) * dx, py = y + 14 + Math.floor(k / per) * 30 * s;
      for (const e of Person(px, py, s, k < aq.base ? "#adb5bd" : SHIRTS[k % SHIRTS.length], open && k >= aq.stock ? "sad" : open ? "happy" : "")) out.push(e);
    }
    y += 14 + Math.ceil(pc / per) * 30 * s;
    out.push(<div className="tiny" style={{ left: b.x, top: y - 6, width: b.w, height: 18 }}>{String(pc)}</div>);
    y += 22;
    const t = adIn(aq, i);
    if (open) for (const e of CoinsC(cx, y, t, cr, 5, false)) out.push(e);
    y += Math.ceil(t / 5) * cr * 2.1;
    if (solved() || tried[i]) out.push(<div className="sum" style={{ left: b.x, top: y, width: b.w, height: 30 }}>{"= " + adProfit(aq, i) + " €"}</div>);
    out.push(<div className="hit" id={"o" + i} onClick={() => choose(i, aq.answer, cx, b.y + 40, win3(i))} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
  }
  if (K.t - hintT < 5 && !solved()) { const b = colBox(aq.answer, n, y0, y1); out.push(PointAt(b.x + b.w / 2, b.y + 6, "#f77f00")); }
  return out;
}

// ---- level 4: your own shop -----------------------------------------------------------------

type Walker = { x: number; color: string; comes: boolean; state: string; t: number; delay: number };
let money = START_MONEY;       // in the wallet at the start of the day
let stock = 0;                 // cookies in the shop
let price = 2, ads = 0;
let buys: number[] = [];       // today's bags (indices into BAGS), so the last can be undone
let phase = "set";             // "set" | "run" | "end"
let day: Day | null = null;
let walkers: Walker[] = [];
let soldNow = 0, turnedAway = 0;
let goalSaid = false;
let total = 0, doneGoal = 0;   // money at the end and the goal it was played for (the done screen)

const SY = 116;                // the shop picture's top
function shopH() { return Math.max(150, Math.min(190, height - 530)); }
function walkY() { return SY + shopH() - 26; }
const DOOR = 250;

function goal() { return GOALS[step()]; }
function bagCost() { let c = 0; for (const b of buys) c += BAGS[b].price; return c; }
function bagCookies() { let c = 0; for (const b of buys) c += BAGS[b].size; return c; }
function avail() { return money - bagCost() - ads * AD_COST; }

function next4() {
  if (K.question === 0) { money = START_MONEY; stock = 0; price = 2; ads = 0; goalSaid = false; }
  buys = []; phase = "set"; day = null; walkers = []; soldNow = 0; turnedAway = 0;
}

function say4() {
  if (K.question === 0) return ["ka_oma_alku", "ka_saasta", num(goal()), "ka_euroa_pyoraan", "ka_ohje"];
  return ["ka_paiva", num(K.question + 1)];
}

function buyBag(b: number) {
  if (phase !== "set") return;
  if (avail() < BAGS[b].price) { rg.sound("wrong"); rg.vibrate(40); rg.say("ka_ei_rahaa"); return; }
  buys.push(b);
  rg.sound("coin"); rg.vibrate(15);
  rg.say([num(stock + bagCookies()), "ka_keksia"]);
}
function undoBag() {
  if (phase !== "set" || !buys.length) return;
  buys.pop(); rg.sound("click");
}
function setPrice(p: number) {
  if (phase !== "set") return;
  price = p; rg.sound("pop");
  rg.say([num(p), euro(p)]);
}
function setAds(d: number) {
  if (phase !== "set") return;
  if (d > 0 && (ads >= MAX_ADS || avail() < AD_COST)) { rg.sound("wrong"); rg.say(ads >= MAX_ADS ? "ka_ei_enempaa" : "ka_ei_rahaa"); return; }
  if (d < 0 && ads === 0) return;
  ads += d; rg.sound(d > 0 ? "pop" : "click");
  rg.say([num(ads), ads === 1 ? "ka_mainos" : "ka_mainosta"]);
}

function open4() {
  if (phase !== "set") return;
  const have = stock + bagCookies();
  if (have === 0) { rg.sound("wrong"); rg.say("ka_osta_ensin"); hintT = K.t; return; }
  day = runDay(have, bagCookies(), bagCost(), price, ads, rnd);
  // the street: everyone who passes by, and among them the ones who come in
  const passers = Math.max(day.came, 10 + 5 * ads);
  const comes: boolean[] = [];
  for (let i = 0; i < passers; i++) comes.push(i < day.came);
  const order = rg.shuffle(comes);
  walkers = order.map((c, i) => ({ x: -20, color: rg.pick(SHIRTS), comes: c, state: "walk", t: 0, delay: i * Math.max(0.22, 3.6 / passers) + rg.random() * 0.12 }));
  stock = have; soldNow = 0; turnedAway = 0;
  phase = "run"; rg.sound("whoosh");
  rg.say("ka_auki");
}

function tick4(dt: number) {
  if (phase !== "run" || !day) return;
  let busy = false;
  for (const w of walkers) {
    if (w.delay > 0) { w.delay -= dt; busy = true; continue; }
    w.t += dt;
    if (w.state === "walk") {
      const was = w.x;
      w.x += 125 * dt;
      if (w.comes && was < DOOR && w.x >= DOOR) {
        w.x = DOOR;
        if (stock > 0) { w.state = "in"; w.t = 0; stock--; soldNow++; rg.sound("coin"); burst(DOOR, walkY() - 40, 5); }
        else { w.state = "sad"; w.t = 0; turnedAway++; rg.sound("wrong"); }
      }
    } else if (w.state === "in") { if (w.t > 0.5) w.state = "gone"; }
    else if (w.state === "sad") { if (w.t > 0.5) w.state = "walk2"; }
    else if (w.state === "walk2") w.x += 125 * dt;
    if (w.state !== "gone" && w.x < width + 30) busy = true;
  }
  if (!busy) endDay();
}

function endDay() {
  if (!day) return;
  phase = "end";
  money += day.profit;
  const left = stock;
  const say: string[] = ["ka_myit", num(day.sold), "ka_keksia"];
  if (day.profit > 0) say.push("ka_voittoa", num(day.profit), euro(day.profit));
  else if (day.profit < 0) say.push("ka_tappiota", num(day.profit), euro(-day.profit));
  else say.push("ka_nolla");
  if (turnedAway > 0) say.push("ka_loppui");
  else if (day.price >= 3 && day.ads === 0) say.push("ka_kallis");
  else if (day.price === 1) say.push("ka_halpa");
  else if (left > 0) say.push("ka_jai");
  if (!goalSaid && money >= goal()) { goalSaid = true; say.push("ka_tavoite_ok"); rg.celebrate(width / 2, 200, { big: true }); }
  else if (day.profit > 0) { rg.celebrate(width / 2, SY + 40, { sound: false }); rg.sound("star"); }
  rg.say(say);
}

function nextDay() {
  if (phase !== "end") return;
  rg.sound("click");
  K.question++;
  if (K.question >= DAYS) { finish(); return; }
  next4();
  rg.say(say4());
}

function finish() {
  total = money;
  doneGoal = goal();
  K.mode = "done";
  const best = rg.load("bestMoney", 0);
  if (total > best) rg.save("bestMoney", total);
  // the goal is the step: reached → a bigger goal next time, far off → a smaller one
  const s = step();
  const ns = total >= goal() ? Math.min(2, s + 1) : total < goal() * 0.6 ? Math.max(0, s - 1) : s;
  const reached = total >= goal();
  if (ns !== s) { K.steps[K.level] = ns; rg.save("steps", K.steps); }
  K.best[K.level] = Math.max(K.best[K.level], reached ? 3 : total >= goal() * 0.6 ? 2 : 1);
  rg.save("best", K.best);
  if (reached) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
  rg.say(["ka_sinulla_on", num(total), euro(total), reached ? "ka_tavoite_ok" : "ka_tavoite_ei"]);
}

// the shop and the street
function Shop() {
  const out: any[] = [];
  const h = shopH(), top = SY, gy = top + h - 14;
  out.push(Box(8, top, width - 16, h, "#cfe8ff", 16));
  // the building
  const bx = 70, bw = width - 140, by = top + 44;
  out.push(Box(bx, by, bw, gy - by, "#fff1e6", 0));
  for (let i = 0; i < 8; i++) out.push(Box(bx - 8 + i * (bw + 16) / 8, by - 18, (bw + 16) / 8, 26, i % 2 ? "#ffffff" : "#e63946", 4));
  out.push(<div className="shopname" style={{ left: bx, top: top + 4, width: bw, height: 22 }}>{rg.t("KEKSIKAUPPA", "COOKIE SHOP", "GALLETAS")}</div>);
  // the window with the cookies in stock
  const wx = bx + 12, wy = by + 20, ww = DOOR - 22 - wx, wh = gy - wy - 26;
  out.push(Box(wx, wy, ww, wh, "#a8dadc", 6));
  const shown = Math.min(stock + (phase === "set" ? bagCookies() : 0), 12);
  for (let k = 0; k < shown; k++) for (const e of CookieIcon(wx + 14 + (k % 6) * ((ww - 28) / 5), wy + wh - 14 - Math.floor(k / 6) * 18, 7)) out.push(e);
  // the price sign in the window
  for (const e of Tag(wx + ww / 2, wy + 18, price, 0.62, true)) out.push(e);
  // the door
  out.push(Box(DOOR - 18, by + 18, 36, gy - by - 18, "#8d5524", 4));
  out.push(Circle(DOOR + 10, (by + gy) / 2 + 6, 3, "#ffd166"));
  // the pavement and the posters by the street
  out.push(Box(8, gy, width - 16, 14, "#adb5bd", 4));
  const px = [36, width - 36, 36];
  for (let k = 0; k < ads; k++) for (const e of Poster(px[k], gy - 40 - (k === 2 ? 56 : 0), k === 2 ? 0.6 : 0.75)) out.push(e);
  // before opening: the people who would come today wait on the pavement
  // (the price and the adverts change the crowd)
  if (phase === "set") {
    const e = expected(price, ads), s = e > 12 ? 0.6 : 0.8, sp = Math.min(22, (width - 40) / Math.max(1, e));
    for (let k = 0; k < e; k++) for (const q of Person(24 + k * sp, walkY() - 10, s, SHIRTS[k % SHIRTS.length], "happy")) out.push(q);
    out.push(<div className="hit" id="crowd" onClick={() => rg.say(["ka_nain_moni", num(e)])} style={{ left: 8, top: walkY() - 30, width: width - 16, height: 40 }} />);
  }
  // the people on the street
  for (const w of walkers) {
    if (w.delay > 0 || w.state === "gone" || w.x > width + 20) continue;
    const s = 0.9, y = walkY() - 10;
    if (w.state === "in") { const k = Math.min(1, w.t / 0.5); for (const e of Person(DOOR, y - k * 18, s * (1 - k * 0.4), w.color, "happy")) out.push(e); }
    else for (const e of Person(w.x, y + Math.abs(Math.sin(w.x / 9)) * -2, s, w.color, w.state === "sad" || w.state === "walk2" ? (w.comes ? "sad" : "") : "")) out.push(e);
  }
  return out;
}

// the wallet, the cookies and the bike goal
function Status(y: number) {
  const out: any[] = [];
  const m = phase === "end" ? money : avail();
  for (const e of MyCoin(30, y + 16, 13, false)) out.push(e);
  out.push(<div className="mid left" style={{ left: 48, top: y, width: 70, height: 32 }}>{m + " €"}</div>);
  for (const e of CookieIcon(132, y + 16, 11)) out.push(e);
  out.push(<div className="mid left" style={{ left: 148, top: y, width: 50, height: 32 }}>{String(phase === "set" ? stock + bagCookies() : stock)}</div>);
  // the goal: a bar that fills up towards the bike
  const gx = 200, gw = width - gx - 54;
  out.push(Box(gx, y + 9, gw, 14, "#ffffff", 7));
  out.push(Box(gx, y + 9, Math.max(6, gw * Math.min(1, m / goal())), 14, m >= goal() ? GREEN : "#ffd166", 7));
  out.push(<div className="emoji" style={{ left: width - 52, top: y - 2, width: 40, height: 36, fontSize: 26 }}>🚲</div>);
  out.push(<div className="tiny" style={{ left: gx, top: y + 24, width: gw, height: 16 }}>{goal() + " €"}</div>);
  return out;
}

function Setup4(y0: number) {
  const out: any[] = [];
  let y = y0;
  // buy: three bags
  out.push(<div className="rowlabel" style={{ left: 14, top: y, width: 200, height: 20 }}>{rg.t("Osta keksejä", "Buy cookies", "Compra galletas")}</div>);
  if (buys.length) out.push(<div className="pad small" id="undo" onClick={() => undoBag()} style={{ left: width - 64, top: y - 4, width: 50, height: 30, backgroundColor: "#9a8c98" }}><div className="padtext small">↩</div></div>);
  y += 20;
  const bw = (width - 28 - 16) / 3;
  BAGS.forEach((b, i) => {
    const x = 14 + i * (bw + 8), ok = avail() >= b.price;
    out.push(<div className={ok ? "card" : "card off"} style={{ left: x, top: y, width: bw, height: 70 }} />);
    for (const e of Bag(x + 30, y + 35, 0.55 + i * 0.12, b.size)) out.push(e);
    out.push(<div className="mid" style={{ left: x + 52, top: y + 8, width: bw - 56, height: 26, color: RED }}>{b.price + " €"}</div>);
    out.push(<div className="tiny" style={{ left: x + 52, top: y + 38, width: bw - 56, height: 18 }}>{(b.price / b.size).toFixed(1).replace(".", ",") + " €/🍪"}</div>);
    out.push(<div className="hit" id={"bag" + i} onClick={() => buyBag(i)} style={{ left: x, top: y, width: bw, height: 70 }} />);
  });
  y += 76;
  // price: four tags
  out.push(<div className="rowlabel" style={{ left: 14, top: y, width: 200, height: 20 }}>{rg.t("Hinta", "Price", "Precio")}</div>);
  y += 20;
  const tw = (width - 28 - 24) / 4;
  PRICES.forEach((p, i) => {
    const x = 14 + i * (tw + 8);
    for (const e of Tag(x + tw / 2, y + 24, p, Math.min(1, tw / 74), p === price)) out.push(e);
    out.push(<div className="hit" id={"price" + p} onClick={() => setPrice(p)} style={{ left: x, top: y, width: tw, height: 48 }} />);
  });
  y += 52;
  // adverts: − posters +
  out.push(<div className="rowlabel" style={{ left: 14, top: y, width: 220, height: 20 }}>{rg.t("Mainokset", "Adverts", "Anuncios") + "  " + AD_COST + " € / " + rg.t("kpl", "each", "c/u")}</div>);
  y += 22;
  out.push(<div className="pad" id="adless" onClick={() => setAds(-1)} style={{ left: 14, top: y, width: 60, height: 50, backgroundColor: "#9a8c98" }}><div className="padtext">−</div></div>);
  out.push(<div className="card" style={{ left: 82, top: y, width: width - 164, height: 50 }} />);
  if (ads === 0) out.push(<div className="tiny" style={{ left: 82, top: y + 16, width: width - 164, height: 18 }}>0</div>);
  for (let k = 0; k < ads; k++) for (const e of Poster(width / 2 + (k - (ads - 1) / 2) * 44, y + 26, 0.5)) out.push(e);
  out.push(<div className="pad" id="admore" onClick={() => setAds(1)} style={{ left: width - 74, top: y, width: 60, height: 50, backgroundColor: "#e76f51" }}><div className="padtext">+</div></div>);
  return out;
}

function Result4(y: number) {
  const out: any[] = [];
  if (!day) return out;
  const h = 150;
  out.push(<div className="card" style={{ left: 14, top: y, width: width - 28, height: h }} />);
  const line = (k: number, label: string, v: string, c: string) => {
    out.push(<div className="mid left" style={{ left: 28, top: y + 8 + k * 30, width: width - 150, height: 28 }}>{label}</div>);
    out.push(<div className="mid right" style={{ left: width - 130, top: y + 8 + k * 30, width: 100, height: 28, color: c }}>{v}</div>);
  };
  line(0, "🍪 " + day.sold + " × " + day.price + " €", "+" + day.takings + " €", GREEN);
  line(1, "🛍️ " + rg.t("ostot", "bags", "compras"), (day.spent ? "−" : "") + day.spent + " €", day.spent ? RED : INK);
  line(2, "📢 " + rg.t("mainokset", "adverts", "anuncios"), (day.ads ? "−" : "") + day.ads * AD_COST + " €", day.ads ? RED : INK);
  out.push(Box(28, y + 102, width - 56, 2, "#e3e8ef"));
  line(3.6, rg.t("Päivän tulos", "Today", "Hoy"), (day.profit > 0 ? "+" : "") + day.profit + " €", day.profit >= 0 ? GREEN : RED);
  if (turnedAway > 0) out.push(<div className="tiny" style={{ left: 14, top: y + h + 4, width: width - 28, height: 18, color: RED }}>{turnedAway + " " + rg.t("jäi ilman keksiä", "got no cookie", "sin galleta")}</div>);
  return out;
}

function Play4() {
  const out: any[] = Shop();
  const y = SY + shopH() + 8;
  for (const e of Status(y)) out.push(e);
  if (phase === "set") {
    for (const e of Setup4(y + 44)) out.push(e);
    out.push(<div className="pad" id="run" onClick={() => open4()} style={{ left: 40, top: height - 70, width: width - 80, height: 56, backgroundColor: "#06d6a0" }}><div className="padtext">{rg.t("Avaa kauppa ▶", "Open the shop ▶", "Abrir ▶")}</div></div>);
    if (K.t - hintT < 5) out.push(PointAt(width / 2, y + 66, "#f77f00"));
  } else {
    out.push(<div className="card" style={{ left: 14, top: y + 48, width: width - 28, height: 50 }} />);
    for (const e of CookieIcon(40, y + 73, 12)) out.push(e);
    out.push(<div className="mid left" style={{ left: 60, top: y + 57, width: 140, height: 32 }}>{rg.t("myyty", "sold", "vendidas") + " " + soldNow}</div>);
    out.push(<div className="mid right" style={{ left: width - 140, top: y + 57, width: 110, height: 32, color: GREEN }}>{"+" + soldNow * price + " €"}</div>);
    if (phase === "end") {
      for (const e of Result4(y + 108)) out.push(e);
      const last = K.question >= DAYS - 1;
      out.push(<div className="pad" id="next" onClick={() => nextDay()} style={{ left: 40, top: height - 70, width: width - 80, height: 56, backgroundColor: "#3a86ff" }}><div className="padtext">{last ? rg.t("Valmis ▶", "Done ▶", "Listo ▶") : rg.t("Seuraava päivä ▶", "Next day ▶", "Día siguiente ▶")}</div></div>);
    }
  }
  return out;
}

function Done4() {
  const reached = total >= doneGoal;
  return (
    <div className="screen flow">
      <div className="dtitle" style={{ marginTop: 70 }}>{reached ? rg.t("Hurraa!", "Hooray!", "¡Hurra!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="bigline">{"💰 " + total + " €"}</div>
      <div className="bike">🚲</div>
      <div className="lead">{reached ? rg.t("Säästit pyörään!", "You saved for the bike!", "¡Ahorraste para la bici!") : rg.t("Pyörä maksaa ", "The bike costs ", "La bici cuesta ") + doneGoal + " €"}</div>
      <div className="level flowbtn" id="again" onClick={() => start(K.level)} style={{ backgroundColor: LEVELS[3].color }}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="level back flowbtn" id="menu" onClick={() => toMenu()}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

// ---- shared ------------------------------------------------------------------------------------

function instruct() { rg.say([say1, say2, say3, say4][K.level]()); }

function next() {
  hintT = -10; tried = []; picked = -1;
  K.wait = K.level === 0 ? 3.2 : 4.2;
  [next1, next2, next3, next4][K.level]();
  instruct();
}

function hint() {
  hintT = K.t;
  const s = step();
  if (K.level === 0) rg.say(s < 2 ? "ka_vihje_kolikot" : "ka_vihje_kerro");
  else if (K.level === 1) rg.say(s === 0 ? "ka_vihje_pino" : s === 1 ? "ka_vihje_hinta" : ["ka_vihje_hinta", "ka_vihje_loppuu"]);
  else if (K.level === 2) rg.say(s === 0 ? "ka_vihje_mainos" : "ka_vihje_mainos_laske");
  else rg.say(stock + bagCookies() === 0 ? "ka_osta_ensin" : "ka_vihje_kauppa");
}

function tick(dt: number, input: any) {
  update(dt);
  if (K.mode === "play" && K.level === 3) tick4(dt);
}

function onBack() { phase = "set"; walkers = []; back(); }

function Play() {
  const out: any[] = [];
  const s = step();
  const text = [rg.t("Mikä on halvin?", "Which is cheapest?", "¿Cuál es más barato?"), rg.t("Millä hinnalla eniten rahaa?", "Which price makes most money?", "¿Qué precio da más dinero?"),
    s === 0 ? rg.t("Kannattaako mainostaa?", "Is an advert worth it?", "¿Vale la pena anunciar?") : rg.t("Montako mainosta kannattaa?", "How many adverts pay off?", "¿Cuántos anuncios valen la pena?"),
    rg.t("Päivä ", "Day ", "Día ") + (K.question + 1) + " / " + DAYS][K.level];
  for (const e of Header(text, () => instruct(), () => hint())) out.push(e);
  const body = [Play1, Play2, Play3, Play4][K.level]();
  for (const e of body) out.push(e);
  return <div className="screen">{out}</div>;
}

setup(rg.t("Oma kauppa", "My shop", "Mi tienda"), LEVELS, DAYS, next);

function view() {
  let body;
  if (K.mode === "menu") body = Menu(MiniShop(46, 62, 0.5));
  else if (K.mode === "done") body = K.level === 3 ? Done4() : Done();
  else body = Play();
  return <div className="root">{body}{Sparks()}</div>;
}
