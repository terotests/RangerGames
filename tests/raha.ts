// node --experimental-strip-types tests/raha.ts — the money sums of Rahakauppa:
// every random handful adds up, the fewest pieces are right, prices print right.
import { MONEY, fmt, fewest, handful, total, cheapest, dearest } from "../games/raha/lib/money.ts";
let bad = 0;
const ok = (c: boolean, msg: string) => { if (!c) { console.log("FAIL", msg); bad++; } };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const sets = [[100, 200, 500], [100, 200, 500, 1000, 2000], [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]];
for (const d of sets) {
  for (let c = 10; c <= 10000; c += 10) {
    if (c % d[0] !== 0) continue;
    const f = fewest(c, d);
    ok(total(f) === c, "fewest " + c);
    const h = handful(c, d, 8, rnd);
    ok(total(h) === c && h.length <= Math.max(8, f.length), "handful " + c + " " + h);
    ok(h.every((v) => d.indexOf(v) >= 0), "handful pieces " + c);
  }
}
ok(fewest(880, [10, 20, 50, 100, 200, 500]).join() === "500,200,100,50,20,10", "fewest 8,80");
ok(fmt(350, "fi") === "3,50\u00a0€" && fmt(350, "en") === "€3.50" && fmt(700, "es") === "7\u00a0€" && fmt(50, "fi") === "50 snt", "fmt");
ok(cheapest([500, 100, 300], 2) === 400 && dearest([500, 100, 300], 2) === 800, "cheapest/dearest");
ok(MONEY.length === 11, "money");
console.log(bad ? "FAILED " + bad : "ok");
if (bad) process.exit(1);
