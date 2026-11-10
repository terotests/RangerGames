// node --experimental-strip-types tests/suljelaatikko.ts
import { combos, bestCombo, openSum, oneDieOk } from "../games/suljelaatikko/lib/rules.ts";
let ok = true; const check = (c: boolean, m: string) => { if (!c) { ok = false; console.log("FAIL", m); } };
const all = [false, true, true, true, true, true, true, true, true, true];
check(combos(all, 3).length === 2, "3 = 3 or 1+2");
check(JSON.stringify(bestCombo(all, 10)) === "[1,9]", "10 -> 1+9 " + JSON.stringify(bestCombo(all, 10)));
check(openSum(all) === 45 && !oneDieOk(all), "sum");
const few = [false, true, false, false, false, false, false, false, false, false];
check(combos(few, 4).length === 0, "stuck");
console.log(ok ? "ok" : "FAILED"); if (!ok) process.exit(1);
