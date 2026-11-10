// node --experimental-strip-types tests/varjo.ts — every figure is made of
// real pieces that don't overlap, each figure's exact answer passes the
// check, a slightly sloppy one passes too and a wrong one does not.
import { FIGURES, identify, area, place, coverage, solved, settle } from "../games/varjo/lib/shapes.ts";
let bad = 0;
for (const f of FIGURES) {
  const ids = f.polys.map(identify);
  if (ids.some((x) => !x)) { console.log(f.id, "has a polygon that is no piece"); bad++; continue; }
  const sum = f.polys.reduce((a, p) => a + area(p), 0);
  const exact = ids.map((x) => place(x!.kind, x!.cx, x!.cy, x!.rot, x!.flip));
  const c = coverage(f.polys, exact, 0.1);
  // overlapping pieces would cover less than their summed area
  const filled = c.cover * sum;
  if (Math.abs(filled - sum) > 0.02 * sum || c.spill > 0.01) { console.log(f.id, "exact", c); bad++; }
  const sloppy = ids.map((x, i) => place(x!.kind, x!.cx + (i % 2 ? 0.25 : -0.2), x!.cy + (i % 3 ? 0.2 : -0.15), x!.rot, x!.flip));
  if (!solved(f.polys, exact)) { console.log(f.id, "exact answer fails"); bad++; }
  if (!solved(f.polys, sloppy)) { console.log(f.id, "sloppy answer fails"); bad++; }
  // a sloppy piece settles exactly on its slot
  const kinds = ids.map((x) => x!.kind);
  ids.forEach((x, i) => { const c = settle(f.polys, kinds, x!.kind, x!.cx + 0.6, x!.cy - 0.5, x!.rot, x!.flip); if (Math.hypot(c[0] - x!.cx, c[1] - x!.cy) > 1e-6) { console.log(f.id, "no settle", i); bad++; } });
  // a piece turned wrong (not the same shape after the turn) is not right
  ids.forEach((x, i) => {
    const turned = ids.map((y, j) => place(y!.kind, y!.cx, y!.cy, y!.rot + (j === i ? 1 : 0), y!.flip));
    if (x!.kind !== "Q" && solved(f.polys, turned)) { console.log(f.id, "piece", i, x!.kind, "turned wrong passes"); bad++; }
  });
  const s = coverage(f.polys, sloppy, 0.1);
  const wrong = ids.map((x, i) => place(x!.kind, x!.cx + (i === 0 ? 2 : 0), x!.cy, x!.rot, x!.flip));
  if (solved(f.polys, wrong)) { console.log(f.id, "a misplaced piece passes"); bad++; }
  for (let i = 0; i < ids.length; i++) {
    const w2 = ids.map((x, j) => place(x!.kind, x!.cx + (j === i ? 1.2 : 0), x!.cy + (j === i ? 1 : 0), x!.rot, x!.flip));
    if (solved(f.polys, w2)) { console.log(f.id, "piece", i, "off by 1.5 passes"); bad++; }
  }
  console.log(f.id.padEnd(11), f.polys.length, "pieces", ids.map((x) => x!.kind).join(""), "sloppy", s.cover.toFixed(2), s.spill.toFixed(2));
}
console.log(bad ? "FAILED " + bad : "ok"); if (bad) process.exit(1);
// the house's square from its two big triangles the other way round is right too
{
  const f = FIGURES.find((x) => x.id === "talo")!;
  const other = [f.polys[0], [[0, 4], [4, 4], [4, 8]], [[0, 4], [0, 8], [4, 8]]];
  if (!solved(f.polys, other)) { console.log("talo: the other way round fails"); process.exit(1); }
  console.log("talo other way ok");
}
