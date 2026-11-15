// node --experimental-strip-types tests/robottitehdas.ts — the factory's rules:
// only the right order makes a good cookie, and in every bottleneck puzzle
// the helpers must go to the slow stations (every other placement makes less).
import { lineFor, runLine, good, simulate, best, profit } from "../games/robottitehdas/lib/sim.ts";
let bad = 0;
function perms(a: string[]): string[][] { if (a.length <= 1) return [a]; const out: string[][] = []; a.forEach((x, i) => { for (const p of perms(a.slice(0, i).concat(a.slice(i + 1)))) out.push([x].concat(p)); }); return out; }
for (const n of [3, 4, 5]) {
  const need = lineFor(n);
  for (const p of perms(need)) {
    const ok = good(runLine(p), n), right = p.join() === need.join();
    if (ok !== right) { console.log("order", p.join(), "good =", ok); bad++; }
  }
}
const puzzles: [number[], number][] = [[[1, 2, 1], 1], [[1, 1, 2], 1], [[1, 1, 3, 1], 2], [[1, 3, 1, 1], 2], [[1, 2, 1, 2], 2], [[1, 2, 2, 1], 2]];
for (const [t, extra] of puzzles) {
  const b = best(t, extra, 10);
  const none = simulate(t, t.map(() => 1), 10).out;
  if (none >= b.out) { console.log(t.join(), "no helpers is as good"); bad++; }
  const rec = (i: number, left: number, w: number[]) => {
    if (i === t.length - 1) { const ww = w.concat([1 + left]); const r = simulate(t, ww, 10).out; if (r >= b.out && ww.join() !== b.workers.join()) { console.log(t.join(), "also wins:", ww.join()); bad++; } return; }
    for (let k = 0; k <= left; k++) rec(i + 1, left - k, w.concat([1 + k]));
  };
  rec(0, extra, []);
}
for (let d = 1; d < 10; d++) for (let b = 0; b <= 12; b++) if (b !== d && profit(b, d) >= profit(d, d)) { console.log("profit", b, d); bad++; }
console.log(bad ? bad + " problems" : "robottitehdas ok");
process.exit(bad ? 1 : 0);
