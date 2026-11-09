// Pallosade's rules: node --experimental-strip-types tests/pallosade.ts
import { COLS, ROWS, empty, landRow, findRuns, collapse, points, phoneMove } from "../games/pallosade/lib/rules.ts";

let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) { failed++; console.log("FAIL", what); } else console.log("ok  ", what); };
const drop = (g: number[], c: number, p: number) => { const r = landRow(g, c); g[c * ROWS + r] = p; return r; };

{ // across
  const g = empty();
  for (let c = 0; c < 4; c++) drop(g, c, 1);
  const runs = findRuns(g);
  ok(runs.length === 1 && runs[0].p === 1 && runs[0].cells.length === 4 && points(runs[0]) === 1, "four across = 1 point");
}
{ // up, and five gives 2
  const g = empty();
  for (let k = 0; k < 5; k++) drop(g, 2, 2);
  const runs = findRuns(g);
  ok(runs.length === 1 && points(runs[0]) === 2, "five up = 2 points");
}
{ // diagonal, and the balls above fall
  const g = empty();
  // staircase: column c has c fillers (yellow) then a white
  for (let c = 0; c < 4; c++) { for (let k = 0; k < c; k++) drop(g, c, 2); drop(g, c, 1); }
  drop(g, 0, 2); // something above the bottom white
  const runs = findRuns(g);
  ok(runs.length === 1 && runs[0].p === 1, "diagonal found");
  const moves = collapse(g, runs);
  ok(g[0 * ROWS + 0] === 2 && g[0 * ROWS + 1] === 0, "ball above fell down");
  ok(moves.length === 1 && moves[0][1] === 1 && moves[0][2] === 0, "fall reported");
}
{ // three are no line
  const g = empty();
  for (let c = 0; c < 3; c++) drop(g, c, 1);
  ok(findRuns(g).length === 0, "three is not a line");
}
{ // the phone takes its line and blocks
  const g = empty();
  for (let c = 0; c < 3; c++) drop(g, c, 2);
  ok(phoneMove(g, 2, Math.random, 1) === 3, "phone completes its line");
  const h = empty();
  for (let c = 4; c < 7; c++) drop(h, c, 1);
  const m = phoneMove(h, 2, Math.random, 1);
  ok(m === 3 || m === 7, "phone blocks (" + m + ")");
}
{ // random games end without errors
  for (let n = 0; n < 200; n++) {
    const g = empty();
    let p = 1;
    for (let k = 0; k < 300; k++) {
      const c = phoneMove(g, p, Math.random, 0.7);
      if (c < 0) break;
      drop(g, c, p);
      let runs = findRuns(g);
      while (runs.length) { collapse(g, runs); runs = findRuns(g); }
      p = 3 - p;
    }
  }
  ok(true, "200 phone-vs-phone games");
}
if (failed) { console.log(failed + " failed"); process.exit(1); }
