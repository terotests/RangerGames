// node --experimental-strip-types tests/kello.ts — the clock's words, hands,
// wrong answers and turning rules.
import { allTimes, words, sentence, confusions, farOff, same, swapped, hourAngle, minuteAngle, angleOf, dragMinute, dragHour } from "../games/kello/lib/time.ts";
let bad = 0;
const eq = (a: unknown, b: unknown, what: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log("FAIL", what, JSON.stringify(a), "!=", JSON.stringify(b)); bad++; } };

eq(words({ h: 3, m: 0 }, "fi"), "tasan kolme", "fi 3.00");
eq(words({ h: 3, m: 30 }, "fi"), "puoli neljä", "fi 3.30 by the next hour");
eq(words({ h: 12, m: 30 }, "fi"), "puoli yksi", "fi 12.30");
eq(words({ h: 3, m: 15 }, "fi"), "varttia yli kolme", "fi 3.15");
eq(words({ h: 3, m: 45 }, "fi"), "varttia vaille neljä", "fi 3.45");
eq(words({ h: 3, m: 30 }, "en"), "half past three", "en 3:30");
eq(words({ h: 12, m: 45 }, "en"), "quarter to one", "en 12:45");
eq(sentence({ h: 12, m: 45 }, "es"), "Es la una menos cuarto.", "es 12:45");
eq(sentence({ h: 1, m: 15 }, "es"), "Es la una y cuarto.", "es 1:15");
eq(sentence({ h: 4, m: 30 }, "es"), "Son las cuatro y media.", "es 4:30");
eq(hourAngle(3, 30), 105, "hour hand half way to four");
eq(minuteAngle(45), 270, "minute hand at nine");
eq(swapped({ h: 3, m: 0 }), { h: 12, m: 15 }, "3.00 swapped");
eq(Math.round(angleOf(1, 0)), 90, "right is 90");
eq(Math.round(angleOf(0, 1)), 180, "down is 180");

// every time: unique words, confusions never the answer and of the allowed kinds
for (const lang of ["fi", "en", "es"] as const) {
  const all = allTimes().map((t) => words(t, lang));
  if (new Set(all).size !== all.length) { console.log("FAIL duplicate words", lang); bad++; }
}
let r = 1;
const rnd = () => { r = (r * 48271) % 2147483647; return r / 2147483647; };
for (const t of allTimes()) {
  for (const kinds of [[0], [0, 30], [0, 15, 30, 45]]) {
    if (kinds.indexOf(t.m) < 0) continue;
    const c = confusions(t, kinds), f = farOff(t, kinds, rnd);
    for (const x of c.concat(f)) {
      if (same(x, t) || kinds.indexOf(x.m) < 0 || x.h < 1 || x.h > 12) { console.log("FAIL bad wrong answer", t, x, kinds); bad++; }
    }
    if (c.length < 3 || f.length < 2) { console.log("FAIL too few wrong answers", t, kinds, c.length, f.length); bad++; }
  }
}
eq(confusions({ h: 3, m: 30 }, [0, 15, 30, 45])[0], { h: 2, m: 30 }, "3.30 is first confused with puoli kolme");

// turning: the long hand past 12 moves the hour on and back
eq(dragMinute(3, 50, 10), { h: 4, m: 0 }, "past 12 forwards");
eq(dragMinute(4, 5, 330), { h: 3, m: 55 }, "past 12 backwards");
eq(dragMinute(12, 45, 5), { h: 1, m: 0 }, "12 → 1");
eq(dragMinute(3, 0, 182), { h: 3, m: 30 }, "to the half");
eq(dragHour(30, hourAngle(3, 30)), 3, "short hand half way keeps 3");
eq(dragHour(0, 359), 12, "short hand at 12");
eq(dragHour(45, hourAngle(7, 45) + 8), 7, "short hand near 8 at 7.45 is 7");
console.log(bad ? "FAILED " + bad : "ok"); if (bad) process.exit(1);
