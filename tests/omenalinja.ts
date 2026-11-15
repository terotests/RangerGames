// node --experimental-strip-types tests/omenalinja.ts — on every level the
// right rule passes every batch, and leaving out any of its rows (or setting
// the wrong colour) makes the boss complain in some batch: every row matters.
import { judge, solution, batch, rowsFor, emptyRule } from "../games/omenalinja/lib/rules.ts";
let bad = 0, seed = 7;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
for (let level = 1; level <= 4; level++) for (const goalRed of level === 1 ? [true, false] : [true]) {
  const sol: any = solution(level, goalRed);
  const batches = [];
  for (let k = 0; k < 60; k++) batches.push(batch(level, k % 3, rnd));
  for (const b of batches) { const j = judge(b, sol, level, goalRed, false); if (j) { console.log("level", level, "solution fails:", j); bad++; break; } }
  for (const row of rowsFor(level)) {
    if (!sol[row]) continue;
    const r: any = Object.assign({}, sol); r[row] = 0;
    if (batches.every((b) => !judge(b, r, level, goalRed, false))) { console.log("level", level, "row", row, "never matters"); bad++; }
  }
  if (batches.every((b) => !judge(b, emptyRule(), level, goalRed, false))) { console.log("level", level, "empty rule passes"); bad++; }
}
// by hand (level 0): the batch has both colours, and worms on the higher steps
for (let s = 0; s < 3; s++) { const b = batch(0, s, rnd); if (!b.some((i) => i.red) || !b.some((i) => !i.red) || (s > 0 && !b.some((i) => i.worm))) { console.log("level 0 batch", s); bad++; } }
console.log(bad ? bad + " problems" : "omenalinja ok");
process.exit(bad ? 1 : 0);
