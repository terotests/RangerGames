// node --experimental-strip-types tests/pyramidi.ts — every deal must be winnable
import { deal, isFree, SIZE, children } from "../games/pyramidi/lib/rules.ts";
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// a solver: pyramid pairs, pairs with any stock card (stock can be cycled forever)
function solvable(pyr: number[], stock: number[], target: number): boolean {
  const memo = new Set<string>();
  const gone = pyr.map(() => false);
  const st = stock.slice();
  function go(left: number): boolean {
    if (left === 0) return true;
    const key = gone.map((g) => (g ? 1 : 0)).join("") + "|" + st.slice().sort((a, b) => a - b).join(",");
    if (memo.has(key)) return false; memo.add(key);
    const free: number[] = [];
    for (let i = 0; i < SIZE; i++) if (isFree(gone, i)) free.push(i);
    for (const i of free) {
      if (pyr[i] === target) { gone[i] = true; if (go(left - 1)) return true; gone[i] = false; }
      for (const j of free) if (j > i && pyr[i] + pyr[j] === target) { gone[i] = gone[j] = true; if (go(left - 2)) return true; gone[i] = gone[j] = false; }
      const k = st.indexOf(target - pyr[i]);
      if (k >= 0) { st.splice(k, 1); gone[i] = true; if (go(left - 1)) return true; gone[i] = false; st.splice(k, 0, target - pyr[i]); }
    }
    return false;
  }
  return go(SIZE);
}
let bad = 0;
for (const target of [10, 13]) for (let n = 0; n < 200; n++) {
  const d = deal(target, rnd);
  if (d.pyramid.length !== 28 || d.stock.length !== (target === 10 ? 12 : 24)) { console.log("size", d.stock.length); bad++; }
  const counts: Record<number, number> = {};
  for (const c of d.pyramid.concat(d.stock)) counts[c.v] = (counts[c.v] || 0) + 1;
  if (Object.values(counts).some((x) => x !== 4)) { console.log("counts", counts); bad++; }
  if (!solvable(d.pyramid.map((c) => c.v), d.stock.map((c) => c.v), target)) { bad++; console.log("unsolvable", target); }
}
console.log(bad ? "FAILED " + bad : "ok"); if (bad) process.exit(1);
