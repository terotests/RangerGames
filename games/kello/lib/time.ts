// Kello: the times, their words in Finnish, English and Spanish, the hands'
// angles and the wrong answers that look right. No rg here, so tests/kello.ts
// and tools/kello/gen-voice.ts can use it with node.
//
// A time is { h: 1–12, m: 0, 15, 30 or 45 } on a 12-hour face. Finnish says a
// half and a quarter to by the NEXT hour: 3.30 is "puoli neljä", 3.45
// "varttia vaille neljä". That is the thing children trip on, so the hour
// hand is drawn where it really is (half way to four at 3.30) and the wrong
// answers include "puoli kolme" for 3.30.

export type Time = { h: number; m: number };
export type Lang = "fi" | "en" | "es";

const FI = ["", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän", "kymmenen", "yksitoista", "kaksitoista"];
const EN = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const ES = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];

export const MINUTES = [0, 15, 30, 45];

export function nextHour(h: number): number { return h === 12 ? 1 : h + 1; }
export function prevHour(h: number): number { return h === 1 ? 12 : h - 1; }
export function same(a: Time, b: Time): boolean { return a.h === b.h && a.m === b.m; }

// the words on a button: "puoli neljä", "quarter to four", "las cuatro menos cuarto"
export function words(t: Time, lang: Lang): string {
  const n = nextHour(t.h);
  if (lang === "en") {
    if (t.m === 0) return EN[t.h] + " o'clock";
    if (t.m === 15) return "quarter past " + EN[t.h];
    if (t.m === 30) return "half past " + EN[t.h];
    return "quarter to " + EN[n];
  }
  if (lang === "es") {
    const la = (h: number) => (h === 1 ? "la " : "las ") + ES[h];
    if (t.m === 0) return la(t.h) + " en punto";
    if (t.m === 15) return la(t.h) + " y cuarto";
    if (t.m === 30) return la(t.h) + " y media";
    return la(n) + " menos cuarto";
  }
  if (t.m === 0) return "tasan " + FI[t.h];
  if (t.m === 15) return "varttia yli " + FI[t.h];
  if (t.m === 30) return "puoli " + FI[n];
  return "varttia vaille " + FI[n];
}

// the spoken sentence: "Kello on puoli neljä."
export function sentence(t: Time, lang: Lang): string {
  const w = words(t, lang);
  if (lang === "en") return "It's " + w + ".";
  if (lang === "es") return (t.m === 45 ? (nextHour(t.h) === 1 ? "Es " : "Son ") : (t.h === 1 ? "Es " : "Son ")) + w + ".";
  return "Kello on " + w + ".";
}

// digits the Finnish way (3.30) or the English and Spanish way (3:30)
export function digits(t: Time, lang: Lang): string {
  return t.h + (lang === "fi" ? "." : ":") + (t.m < 10 ? "0" : "") + t.m;
}

// the clip id of rg.say for a time: kel_t_3_30
export function clip(t: Time): string { return "kel_t_" + t.h + "_" + t.m; }

// the hands in degrees clockwise from 12; the hour hand moves on with the minutes
export function minuteAngle(m: number): number { return m * 6; }
export function hourAngle(h: number, m: number): number { return ((h % 12) + m / 60) * 30; }

// every time on the face
export function allTimes(): Time[] {
  const out: Time[] = [];
  for (let h = 1; h <= 12; h++) for (const m of MINUTES) out.push({ h, m });
  return out;
}

// wrong answers that look right, best first, for the right time t:
//   - "puoli kolme" for 3.30 (the half read by the hour just passed)
//   - "varttia vaille kolme" for 3.45, yli for vaille and vaille for yli
//   - the hands swapped (3.00 read as 12.15)
//   - the hour next to it, the other halves and quarters
// `kinds` limits the minutes the answers may have (only full hours on the
// first level).
export function confusions(t: Time, kinds: number[]): Time[] {
  const c: Time[] = [];
  const add = (x: Time) => { if (kinds.indexOf(x.m) >= 0 && !same(x, t) && !c.some((y) => same(y, x))) c.push(x); };
  const n = nextHour(t.h), p = prevHour(t.h);
  if (t.m === 30) { add({ h: p, m: 30 }); add({ h: t.h, m: 0 }); add({ h: n, m: 0 }); add({ h: t.h, m: 15 }); add({ h: t.h, m: 45 }); }
  if (t.m === 45) { add({ h: p, m: 45 }); add({ h: n, m: 15 }); add({ h: t.h, m: 15 }); add({ h: n, m: 0 }); add({ h: t.h, m: 30 }); }
  if (t.m === 15) { add({ h: p, m: 45 }); add({ h: t.h, m: 45 }); add({ h: n, m: 15 }); add({ h: t.h, m: 30 }); add({ h: t.h, m: 0 }); }
  // the hands swapped: the minute hand read as the hour and the other way round
  const sw = swapped(t);
  if (sw) add(sw);
  // full hours: the hours next to it and the face read mirrored (3 for 9)
  if (t.m === 0) { add({ h: p, m: 0 }); add({ h: n, m: 0 }); add({ h: t.h === 12 ? 6 : t.h === 6 ? 12 : 12 - t.h, m: 0 }); add({ h: t.h, m: 30 }); add({ h: prevHour(p), m: 30 }); }
  add({ h: nextHour(n), m: t.m });
  add({ h: p, m: t.m }); add({ h: n, m: t.m });
  return c;
}

// the time a child reads when the short and the long hand are mixed up, if
// that lands on a quarter (3.00 → 12.15, 6.00 → 12.30, 9.00 → 12.45)
export function swapped(t: Time): Time | null {
  const hourAt = Math.round(t.m / 5) === 0 ? 12 : Math.round(t.m / 5);
  const minAt = (t.h % 12) * 5;
  if (minAt % 15 !== 0) return null;
  return { h: hourAt, m: minAt };
}

// far-off answers for the easiest step: different hours, nothing tricky
export function farOff(t: Time, kinds: number[], rnd: () => number): Time[] {
  const out: Time[] = [];
  let guard = 0;
  while (out.length < 6 && guard++ < 200) {
    const x = { h: 1 + Math.floor(rnd() * 12), m: kinds[Math.floor(rnd() * kinds.length)] };
    const d = Math.abs(x.h - t.h);
    if (Math.min(d, 12 - d) >= 2 && !out.some((y) => same(y, x)) && !same(x, t)) out.push(x);
  }
  return out;
}

// ---- turning the hands ------------------------------------------------------

// the angle (degrees clockwise from 12) of a point seen from the centre
export function angleOf(dx: number, dy: number): number {
  let a = Math.atan2(dx, -dy) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

// the long hand dragged to angle a: minutes snapped to five, and the hour moved
// on (or back) when the long hand goes past 12 like the gears of a real clock
export function dragMinute(h: number, m: number, a: number): Time {
  let nm = Math.round(a / 30) * 5;
  if (nm >= 60) nm = 0;
  let nh = h;
  if (m >= 40 && nm <= 20) nh = nextHour(h);
  else if (m <= 20 && nm >= 40) nh = prevHour(h);
  return { h: nh, m: nm };
}

// the short hand dragged to angle a: the hour it points into, keeping the minutes
export function dragHour(m: number, a: number): number {
  const raw = a / 30 - m / 60;
  let h = Math.round(raw);
  h = ((h % 12) + 12) % 12;
  return h === 0 ? 12 : h;
}
