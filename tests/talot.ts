// node --experimental-strip-types tests/talot.ts — every model house is made of
// parts that exist, and every part on every kind of walls builds a 3D house and
// a picture with finite numbers and unique object ids.
import { CATS, OPTIONS, HOUSES, PAINTS, objects, front, extent, slots, tallness, visible, copy } from "../games/talot/lib/house.ts";
let bad = 0;
const fin = (v: number) => typeof v === "number" && isFinite(v);
for (const h of HOUSES) for (const c of CATS) if (OPTIONS[c].indexOf(h[c]) < 0) { console.log(h.id, "has no", c, h[c]); bad++; }
let n = 0, maxObjs = 0;
for (const w of OPTIONS.walls) for (const c of CATS) for (const v of OPTIONS[c]) {
  const s = copy(HOUSES[1]);
  s.walls = w; s[c] = v; if (c === "walls") s.walls = v;
  const objs = objects(s, CATS, "h", 0);
  const ids = new Set(objs.map((o) => o.id));
  if (ids.size !== objs.length) { console.log(w, c, v, "duplicate ids"); bad++; }
  for (const o of objs) if (![o.x, o.y, o.z, o.rx, o.ry, o.rz].every(fin) || !o.size.every(fin)) { console.log(w, c, v, "NaN in", o.id); bad++; break; }
  for (const p of front(s, CATS, 100, 200, 20, true)) if (!p.pts.every((q) => fin(q[0]) && fin(q[1]))) { console.log(w, c, v, "NaN in the picture"); bad++; break; }
  if (!extent(s).every(fin) || !fin(tallness(s))) { console.log(w, c, v, "bad extent"); bad++; }
  maxObjs = Math.max(maxObjs, objs.length);
  n++;
}
// a thing on the front wall shows from the front and hides from behind
{
  const objs = objects(HOUSES[1], CATS, "h", 0).filter((o) => o.face === 0);
  if (!objs.length || !objs.every((o) => visible(o, [1, 3, 9])) || objs.some((o) => visible(o, [1, 3, -9]))) { console.log("front wall culling"); bad++; }
}
// the windows of a tall house are on every floor, never on the door
{
  const s = copy(HOUSES[2]);
  const front0 = slots(s).filter((q) => q.ry === 0);
  if (front0.some((q) => Math.abs(q.x) < 0.01 && q.y < 1.0)) { console.log("a window on the door"); bad++; }
  if (new Set(front0.map((q) => q.y.toFixed(2))).size !== 4) { console.log("flats should have 4 floors of windows"); bad++; }
}
if (PAINTS.length !== 8) { console.log("8 paints fit the tray"); bad++; }
console.log(n, "houses built, up to", maxObjs, "objects");
console.log(bad ? "FAILED " + bad : "ok"); if (bad) process.exit(1);
