// node --experimental-strip-types tests/omenalinja.ts — for every order of the
// boss, the order itself as a rule passes every batch, leaving out any of its
// rows makes the boss complain in some batch (every row matters), the empty
// rule fails, and an order fits what its challenge offers.
import { ORDERS, judge, batch, propsFor, opsFor, maxRows, wanted } from "../games/omenalinja/lib/rules.ts";
let bad = 0, seed = 7;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
ORDERS.forEach((orders, level) => orders.forEach((o) => {
  const batches = [];
  for (let k = 0; k < 60; k++) batches.push(batch(o, k % 3, rnd));
  for (const b of batches) {
    const j = judge(b, o.conds, o);
    if (j) { console.log(o.id, "order fails:", j); bad++; break; }
    if (!b.some((it) => wanted(it, o)) || b.every((it) => wanted(it, o))) { console.log(o.id, "batch all good or all bad"); bad++; break; }
  }
  o.conds.forEach((c, i) => {
    const r = o.conds.filter((_, j) => j !== i);
    if (batches.every((b) => !judge(b, r, o))) { console.log(o.id, "row", i, "never matters"); bad++; }
    if (propsFor(level).indexOf(c.p) < 0 || opsFor(c.p, level).indexOf(c.op) < 0) { console.log(o.id, "row", i, "not offered"); bad++; }
  });
  if (o.conds.length > maxRows(level)) { console.log(o.id, "too many rows"); bad++; }
  if (batches.every((b) => !judge(b, [], o))) { console.log(o.id, "empty rule passes"); bad++; }
}));
// "ei" is needed on the ei level: no rule with only "on" rows passes ei_vihrea
const ei = ORDERS[4][0];
for (const v of ["punainen", "keltainen"]) {
  const b = batch(ei, 2, rnd);
  if (!judge(b, [{ p: "vari", op: "on", v }], ei)) { console.log("ei_vihrea solvable with on", v); bad++; }
}
console.log(bad ? bad + " problems" : "omenalinja ok");
process.exit(bad ? 1 : 0);
