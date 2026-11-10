// Prisma's optics: node --experimental-strip-types tests/prisma.ts
import { trace, MATERIALS, turned, realIndex, clipPoly, circle, addLight } from "../games/prisma/lib/optics.ts";

let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) { failed++; console.log("FAIL", what); } else console.log("ok  ", what); };
const prism = (mat: string, rot = 0) => ({ cx: 112, cy: 236, s: 100, rot, mat: MATERIALS[mat] });
const dev = (mat: string, nm: number) => turned(trace(prism(mat), [], 48, 250, -12, nm, 360, 400));

ok(Math.abs(realIndex(MATERIALS.water, 589) - 1.333) < 0.002, "water n = 1.333 at 589 nm");
ok(Math.abs(realIndex(MATERIALS.glass, 589) - 1.517) < 0.002, "glass n = 1.517 at 589 nm");
ok(dev("glass", 680) < dev("glass", 589) && dev("glass", 589) < dev("glass", 420), "red bends least, violet most");
ok(dev("air", 589) < 0.1, "an empty prism does not bend light");
ok(dev("water", 589) > 15 && dev("water", 589) < dev("glass", 589), "glass bends more than water");
ok(Math.abs(dev("glass", 589) - 38.6) < 2.5, "glass prism turns yellow light ~39° (near minimum deviation)");
ok(dev("glass", 420) - dev("glass", 680) > 2 * (dev("water", 420) - dev("water", 680)) * 0.9, "glass spreads colours about twice as much as water");
{
  const r = trace(prism("glass", -25), [], 48, 250, -12, 589, 360, 400);
  ok(r.inside > 0, "at a steep angle the light reflects inside (total internal reflection)");
}
{
  const s = { x0: 300, y0: 200, x1: 300, y1: 400 };
  const r = trace(prism("glass"), [s], 48, 250, -12, 589, 360, 400);
  ok(!!r.hit && Math.abs(r.hit.x - 300) < 0.01, "a screen catches the light");
}
{
  const a = circle(0, 0, 10, 64), b = circle(10, 0, 10, 64);
  const lens = clipPoly(a, b);
  let area = 0;
  for (let i = 0; i < lens.length; i++) { const p = lens[i], q = lens[(i + 1) % lens.length]; area += p[0] * q[1] - q[0] * p[1]; }
  area = Math.abs(area) / 2;
  ok(Math.abs(area - 122.8) < 3, "overlap of two circles (lens area " + area.toFixed(1) + ")");
  ok(addLight([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).join() === "255,255,255", "red + green + blue = white");
  ok(addLight([0, 0, 0], [[1, 0, 0], [0, 1, 0]]).join() === "255,255,0", "red + green = yellow");
}
if (failed) { console.log(failed + " failed"); process.exit(1); }
console.log("all ok");
