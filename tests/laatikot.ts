// node --experimental-strip-types tests/laatikot.ts
import { lineCount, play, phoneLine, sides, boxesOf } from "../games/laatikot/lib/rules.ts";
let ok = true; const check = (c: boolean, m: string) => { if (!c) { ok = false; console.log("FAIL", m); } };
const R = 4, C = 4;
check(lineCount(R, C) === 40, "40 lines");
for (let b = 0; b < R * C; b++) for (const s of sides(R, C, b)) check(boxesOf(R, C, s).indexOf(b) >= 0, "side/box " + b + " " + s);
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let hardWins = 0;
for (let g = 0; g < 20; g++) {
  const lines = new Array(lineCount(R, C)).fill(0), boxes = new Array(R * C).fill(0);
  let p = g % 2 + 1, n = 0;
  while (n < lines.length) {
    const l = phoneLine(lines, boxes, R, C, p === 1 ? 2 : 1, rnd);
    check(!lines[l], "free line"); n++;
    if (!play(lines, boxes, R, C, l, p).length) p = 3 - p;
  }
  check(boxes.every((x) => x), "all boxes owned");
  if (boxes.filter((x) => x === 1).length > 8) hardWins++;
}
console.log("hard wins", hardWins, "/ 20"); check(hardWins >= 14, "hard should beat easy");
console.log(ok ? "ok" : "FAILED"); if (!ok) process.exit(1);
