// node --experimental-strip-types tests/reversi.ts
import { start, moves, play, next, count, phoneMove, lastNodes } from "../games/reversi/lib/rules.ts";
let ok = true;
const check = (c: boolean, m: string) => { if (!c) { ok = false; console.log("FAIL", m); } };
const b = start();
check(moves(b, 1).join() === "19,26,37,44", "opening moves " + moves(b, 1).join());
play(b, 19, 1);
check(count(b, 1) === 4 && count(b, 2) === 1, "after d3");
// play full games phone vs phone, levels against each other
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function game(l1: number, l2: number) {
  const g = start(); let p = 1, guard = 0; let maxNodes = 0;
  while (p && guard++ < 100) {
    const m = phoneMove(g, p, p === 1 ? l1 : l2, rnd);
    check(m >= 0, "a move exists"); play(g, m, p); maxNodes = Math.max(maxNodes, lastNodes()); p = next(g, p);
  }
  return [count(g, 1) - count(g, 2), maxNodes];
}
let wins = 0;
for (let k = 0; k < 6; k++) { const [d] = game(3, 1); if (d > 0) wins++; }
for (let k = 0; k < 6; k++) { const [d] = game(1, 3); if (d < 0) wins++; }
console.log("hard beats easy", wins, "/ 12");
check(wins >= 9, "hard should beat easy");
const [, mx] = game(3, 3);
console.log("hard max nodes", mx);
console.log(ok ? "ok" : "FAILED"); if (!ok) process.exit(1);
