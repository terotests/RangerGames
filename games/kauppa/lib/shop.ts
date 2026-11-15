// The shop's rules without pictures, so tests/kauppa.ts can check them. The
// random numbers come from the caller (rg.random in the game, a seeded
// generator in the test).
type Rnd = () => number;
function range(r: Rnd, lo: number, hi: number) { return lo + Math.floor(r() * (hi - lo + 1)); }
function shuffle<T>(r: Rnd, a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
  return b;
}
// the index of the biggest value, or -1 when two share it
function uniqueMax(v: number[]): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  for (let i = 0; i < v.length; i++) if (i !== best && v[i] === v[best]) return -1;
  return best;
}
function uniqueMin(v: number[]): number { return uniqueMax(v.map((x) => -x)); }

// ---- level 1: the big bag is cheaper --------------------------------------------
// An option is some bags of one size: count × (size cookies for price €).
export type BagBuy = { size: number; count: number; price: number; total: number };
export type BulkQ = { need: number; options: BagBuy[]; answer: number };

function buy(need: number, size: number, price: number): BagBuy { const count = need / size; return { size, count, price, total: count * price }; }

export function bulkQuestion(step: number, r: Rnd): BulkQ {
  for (;;) {
    let need = 10, opts: BagBuy[] = [];
    if (step === 0) {
      // ten cookies: two small bags or one big one (1 € coins are shown)
      const s = range(r, 3, 5), b = 2 * s - range(r, 1, 3);
      opts = [buy(10, 5, s), buy(10, 10, b)];
    } else if (step === 1) {
      // twelve: singles, pairs of six or one bag of twelve
      need = 12;
      const p6 = range(r, 4, 5), p12 = 2 * p6 - range(r, 1, 3);
      opts = [buy(12, 1, 1), buy(12, 6, p6), buy(12, 12, p12)];
    } else {
      // twenty: the prices as numbers only, so the child multiplies
      need = 20;
      const p5 = range(r, 3, 4), p10 = 2 * p5 - range(r, 1, 2), p20 = 2 * p10 - range(r, 1, 3);
      opts = [buy(20, 2, 1), buy(20, 5, p5), buy(20, 10, p10), buy(20, 20, p20)];
      // only three of the four fit on the screen: drop one of the dear ones (never the big bag)
      opts.splice(range(r, 0, 1), 1);
    }
    opts = shuffle(r, opts);
    const answer = uniqueMin(opts.map((o) => o.total));
    if (answer >= 0 && opts[answer].size === Math.max(...opts.map((o) => o.size))) return { need, options: opts, answer };
  }
}

// ---- level 2: the price -------------------------------------------------------------
// You bought `stock` cookies for `cost` €. At price i + 1 €, people[i] people come;
// each buys one while there are cookies left.
export type PriceQ = { stock: number; cost: number; people: number[]; answer: number };

export function sold(people: number, stock: number) { return Math.min(people, stock); }
export function takings(q: PriceQ, i: number) { return sold(q.people[i], q.stock) * (i + 1); }

export function priceQuestion(step: number, r: Rnd): PriceQ {
  for (;;) {
    const n = step === 2 ? 4 : 3;
    const people: number[] = [];
    let top = step === 0 ? range(r, 5, 8) : step === 1 ? range(r, 6, 9) : range(r, 9, 12);
    for (let i = 0; i < n; i++) { people.push(top); top = Math.max(i === n - 2 ? 1 : 0, top - range(r, 1, step === 0 ? 4 : 5)); }
    // step 2: fewer cookies than the cheapest price would bring people
    const stock = step === 2 ? range(r, people[1], people[0] - 1) : 10;
    const cost = step === 2 ? Math.round(stock * 0.6) : step === 1 ? range(r, 4, 6) : range(r, 3, 5);
    const q: PriceQ = { stock, cost, people, answer: -1 };
    let down = people[n - 1] >= 1;
    for (let i = 1; i < n; i++) if (people[i] >= people[i - 1]) down = false;
    if (!down) continue;
    const t = people.map((_, i) => takings(q, i));
    q.answer = uniqueMax(t);
    // the answer must win clearly (by 2 € or more), and not always the same price
    if (q.answer < 0) continue;
    const second = Math.max(...t.filter((_, i) => i !== q.answer));
    if (t[q.answer] - second < 2) continue;
    if (step > 0 && q.answer === 0 && r() < 0.5) continue;      // the cheapest is right less often
    return q;
  }
}

// ---- level 3: adverts ---------------------------------------------------------------
// The price is `price` €, `base` people come without adverts, poster k brings
// adds[k] more (fewer for each new one), a poster costs `cost` €, and only
// `stock` cookies are left. Options: 0 … adds.length posters.
export type AdQ = { price: number; base: number; adds: number[]; cost: number; stock: number; answer: number };

export function adPeople(q: AdQ, n: number) { let p = q.base; for (let k = 0; k < n; k++) p += q.adds[k]; return p; }
export function adIn(q: AdQ, n: number) { return sold(adPeople(q, n), q.stock) * q.price; }
export function adProfit(q: AdQ, n: number) { return adIn(q, n) - n * q.cost; }

export function adQuestion(step: number, r: Rnd): AdQ {
  for (;;) {
    const n = step === 0 ? 1 : step === 1 ? 2 : 3;
    const price = range(r, 1, 3);
    const base = range(r, 1, 4);
    const adds: number[] = [];
    let a = range(r, 2, 5);
    for (let k = 0; k < n; k++) { adds.push(a); a = Math.max(1, a - range(r, 1, 3)); }
    const cost = range(r, 2, step === 0 ? 5 : 6);
    const stock = step === 2 ? range(r, base + adds[0], base + adds[0] + adds[1] + 1) : 30;
    const q: AdQ = { price, base, adds, cost, stock, answer: -1 };
    const p: number[] = [];
    for (let k = 0; k <= n; k++) p.push(adProfit(q, k));
    q.answer = uniqueMax(p);
    if (q.answer < 0) continue;
    const second = Math.max(...p.filter((_, i) => i !== q.answer));
    if (p[q.answer] - second < 2) continue;
    // step 0: "no adverts" should be right about a third of the time
    if (step === 0 && q.answer === 1 && r() < 0.75) continue;
    if (step > 0 && q.answer === n && r() < 0.5) continue;
    return q;
  }
}

// ---- level 4: your own shop -----------------------------------------------------------
export const BAGS = [{ size: 5, price: 5 }, { size: 10, price: 8 }, { size: 20, price: 12 }];
export const AD_COST = 2;
export const MAX_ADS = 3;
export const PRICES = [1, 2, 3, 4];
export const START_MONEY = 10;
export const DAYS = 6;
export const GOALS = [30, 45, 60];
const PASSERS = 10, PER_AD = 5;
const APPEAL = [0, 0.9, 0.6, 0.35, 0.1];     // the share of passers-by who come in, by price

// how many people come in on an average day: the shop shows this as a row of faces
export function expected(price: number, ads: number) { return Math.round((PASSERS + PER_AD * ads) * APPEAL[price]); }
// how many come in today: the average give or take one
export function visitors(price: number, ads: number, r: Rnd) {
  const e = (PASSERS + PER_AD * ads) * APPEAL[price];
  return Math.max(0, Math.round(e + (r() - 0.5) * 2.2));
}

export type Day = { price: number; ads: number; bought: number; spent: number; came: number; sold: number; takings: number; profit: number };
// one day: money and stock before, what was bought (cookies, €), the price and adverts
export function runDay(stock: number, bought: number, spent: number, price: number, ads: number, r: Rnd): Day {
  const came = visitors(price, ads, r);
  const s = Math.min(came, stock);
  return { price, ads, bought, spent, came, sold: s, takings: s * price, profit: s * price - spent - ads * AD_COST };
}
