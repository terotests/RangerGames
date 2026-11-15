// node --experimental-strip-types tests/kauppa.ts — the shop's puzzles always
// have one clear answer that varies, and in the own-shop level good play
// reaches the goals while selling cheap without adverts does not.
import { bulkQuestion, priceQuestion, takings, adQuestion, adProfit, BAGS, AD_COST, START_MONEY, DAYS, GOALS, PRICES, MAX_ADS, runDay, expected } from "../games/kauppa/lib/shop.ts";
let seed = 7;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
let bad = 0;
const fail = (m: string) => { if (bad < 20) console.log(m); bad++; };

for (let s = 0; s < 3; s++) {
  const answers: Record<string, number> = {};
  for (let i = 0; i < 2000; i++) {
    const q = bulkQuestion(s, rnd);
    for (const o of q.options) if (o.size * o.count !== q.need || o.total !== o.count * o.price) fail("bulk sum " + JSON.stringify(o));
    const tot = q.options.map((o) => o.total);
    if (tot.filter((t) => t === tot[q.answer]).length !== 1 || Math.min(...tot) !== tot[q.answer]) fail("bulk answer " + JSON.stringify(q));
    if (Math.max(...tot) > 20) fail("bulk too many coins " + JSON.stringify(q));
  }
  for (let i = 0; i < 2000; i++) {
    const q = priceQuestion(s, rnd);
    const t = q.people.map((_, k) => takings(q, k));
    if (t.some((x, k) => k !== q.answer && x >= t[q.answer] - 1)) fail("price answer " + JSON.stringify(q));
    for (let k = 1; k < q.people.length; k++) if (q.people[k] >= q.people[k - 1]) fail("price people " + q.people.join());
    answers["p" + q.answer] = (answers["p" + q.answer] || 0) + 1;
  }
  for (let i = 0; i < 2000; i++) {
    const q = adQuestion(s, rnd);
    const p = [0, 1, 2, 3].slice(0, q.adds.length + 1).map((k) => adProfit(q, k));
    if (p.some((x, k) => k !== q.answer && x >= p[q.answer] - 1)) fail("ad answer " + JSON.stringify(q));
    answers["a" + q.answer] = (answers["a" + q.answer] || 0) + 1;
  }
  console.log("step", s, JSON.stringify(answers));
  for (const k of Object.keys(answers)) if (answers[k] < 150) fail("step " + s + " answer " + k + " too rare: " + answers[k]);
}

// the own shop: a player who always uses the same price, adverts and the
// biggest bag they can afford (keeping money for the adverts)
function play(price: number, ads: number, bigBags: boolean): number {
  let money = START_MONEY, stock = 0;
  for (let d = 0; d < DAYS; d++) {
    const want = expected(price, ads) + 1;
    let bought = 0, spent = 0;
    const order = bigBags ? [2, 1, 0] : [0];
    for (const b of order) while (stock + bought < want && money - spent - BAGS[b].price >= ads * AD_COST) { bought += BAGS[b].size; spent += BAGS[b].price; }
    const a = Math.min(ads, Math.floor((money - spent) / AD_COST));
    const day = runDay(stock + bought, bought, spent, price, a, rnd);
    money += day.profit;
    stock += bought - day.sold;
  }
  return money;
}
const avg = (f: () => number) => { let s = 0; for (let i = 0; i < 400; i++) s += f(); return s / 400; };
let bestMoney = 0, bestWay = "";
for (const p of PRICES) for (let a = 0; a <= MAX_ADS; a++) {
  const m = avg(() => play(p, a, true));
  if (m > bestMoney) { bestMoney = m; bestWay = p + " € " + a + " ads"; }
}
const naive = avg(() => play(1, 0, false));
const dear = avg(() => play(4, 0, true));
console.log("own shop: best", bestWay, bestMoney.toFixed(1), "€, cheap without ads", naive.toFixed(1), "€, 4 € without ads", dear.toFixed(1), "€");
if (bestMoney < GOALS[2]) fail("the top goal cannot be reached");
if (naive >= GOALS[0]) fail("selling at 1 € without adverts reaches the first goal");
if (dear >= GOALS[0]) fail("selling at 4 € without adverts reaches the first goal");
if (avg(() => play(2, 0, true)) < GOALS[0]) fail("a sensible price without adverts misses the first goal");
console.log(bad ? bad + " problems" : "kauppa ok");
process.exit(bad ? 1 : 0);
