// Omenalinjasto's rules without pictures, so tests/omenalinja.ts can check them.
//
// The child builds the filter's rule from parts: each row is
//   property  (väri, koko, paino)
//   operator  (on / ei ole for a colour; suurempi kuin / pienempi kuin for size and weight)
//   value     (a colour, or the thing to compare with: cherry, tennis ball, melon, pumpkin)
// and the rows are joined with "ja": a thing goes on only when every row holds.
// The boss's order for a challenge is written the same way, so the order is
// also a right rule (other right rules are fine too: the boss judges what comes
// out, not the rule).

export type Item = { kind: string; color: string; cm: number; g: number };
export type Cond = { p: string; op: string; v: string };   // "" = not chosen yet
export type Rule = Cond[];

// what the measures are compared with
export const SIZE: any = { kirsikka: 2, tennis: 7, meloni: 25 };        // cm
export const WEIGHT: any = { kirsikka: 8, tennis: 58, kurpitsa: 4000 }; // g
export const COLORS = ["punainen", "vihrea", "keltainen"];

// the challenges, concrete first: colour you see, size you see next to a
// reference, weight only the scale shows, then two rows at once, then "ei"
export const LEVEL_IDS = ["vari", "koko", "paino", "ja", "ei"];

// the properties a challenge offers (the ones learned so far), and the most rows
export function propsFor(level: number): string[] {
  if (level === 0) return ["vari"];
  if (level === 1) return ["vari", "koko"];
  return ["vari", "koko", "paino"];
}
export function maxRows(level: number): number { return level === 0 ? 1 : level === 1 ? 2 : 3; }
export function opsFor(p: string, level: number): string[] {
  if (p === "vari") return level >= 4 ? ["on", "ei"] : ["on"];
  return ["yli", "alle"];
}
export function valuesFor(p: string): string[] {
  if (p === "vari") return COLORS;
  if (p === "koko") return ["kirsikka", "tennis", "meloni"];
  return ["kirsikka", "tennis", "kurpitsa"];
}

export function complete(c: Cond): boolean { return c.p !== "" && c.op !== "" && c.v !== ""; }

// does the thing pass one row?
export function holds(it: Item, c: Cond): boolean {
  if (c.p === "vari") return c.op === "on" ? it.color === c.v : it.color !== c.v;
  const m = c.p === "koko" ? it.cm : it.g, ref = c.p === "koko" ? SIZE[c.v] : WEIGHT[c.v];
  return c.op === "yli" ? m > ref : m < ref;
}

// the first row the thing fails (its index), -1 if it goes on
export function check(it: Item, r: Rule): number {
  for (let i = 0; i < r.length; i++) if (complete(r[i]) && !holds(it, r[i])) return i;
  return -1;
}

// ---- the boss's orders -----------------------------------------------------------------

export type Order = { id: string; conds: Rule; dest: string; colors: string[]; small: boolean; extra: string[] };
const C = (p: string, op: string, v: string): Cond => ({ p, op, v });
const RGY = ["punainen", "vihrea", "keltainen"];
// dest is where the good things go: kauppa 🛒 or mehu 🧃
export const ORDERS: Order[][] = [
  [
    { id: "vari_punainen", conds: [C("vari", "on", "punainen")], dest: "kauppa", colors: ["punainen", "vihrea"], small: false, extra: [] },
    { id: "vari_vihrea", conds: [C("vari", "on", "vihrea")], dest: "kauppa", colors: RGY, small: false, extra: [] },
    { id: "vari_keltainen", conds: [C("vari", "on", "keltainen")], dest: "kauppa", colors: RGY, small: false, extra: [] },
  ],
  [
    { id: "koko_iso", conds: [C("koko", "yli", "tennis")], dest: "kauppa", colors: ["punainen", "vihrea"], small: true, extra: [] },
    { id: "koko_pieni", conds: [C("koko", "alle", "tennis")], dest: "mehu", colors: ["punainen", "vihrea"], small: true, extra: [] },
    { id: "koko_kirsikka", conds: [C("koko", "yli", "kirsikka"), C("koko", "alle", "tennis")], dest: "mehu", colors: ["punainen", "vihrea"], small: true, extra: ["kirsikka"] },
  ],
  [
    { id: "paino_pallo", conds: [C("paino", "yli", "tennis")], dest: "kauppa", colors: ["punainen"], small: false, extra: ["pallo"] },
    { id: "paino_kurpitsa", conds: [C("paino", "alle", "kurpitsa")], dest: "kauppa", colors: ["punainen", "vihrea"], small: false, extra: ["kurpitsa"] },
    { id: "paino_molemmat", conds: [C("paino", "yli", "tennis"), C("paino", "alle", "kurpitsa")], dest: "kauppa", colors: ["punainen", "vihrea"], small: false, extra: ["pallo", "kurpitsa"] },
  ],
  [
    { id: "ja_punainen_iso", conds: [C("vari", "on", "punainen"), C("koko", "yli", "tennis")], dest: "kauppa", colors: RGY, small: true, extra: [] },
    { id: "ja_vihrea_pieni", conds: [C("vari", "on", "vihrea"), C("koko", "alle", "tennis")], dest: "mehu", colors: RGY, small: true, extra: [] },
    { id: "ja_punainen_aito", conds: [C("vari", "on", "punainen"), C("paino", "yli", "tennis")], dest: "kauppa", colors: RGY, small: false, extra: ["pallo"] },
  ],
  [
    { id: "ei_vihrea", conds: [C("vari", "ei", "vihrea")], dest: "kauppa", colors: RGY, small: false, extra: [] },
    { id: "ei_punainen", conds: [C("vari", "ei", "punainen")], dest: "mehu", colors: RGY, small: false, extra: [] },
    { id: "ei_vihrea_iso", conds: [C("vari", "ei", "vihrea"), C("koko", "yli", "tennis")], dest: "kauppa", colors: RGY, small: true, extra: [] },
  ],
];

export function wanted(it: Item, o: Order): boolean { return o.conds.every((c) => holds(it, c)); }

// anything but an apple jams the slicer if it is big and heavy (the pumpkin)
export function jams(it: Item): boolean { return it.kind === "kurpitsa"; }

// what went wrong with a thing, "" if nothing: jumi, then the property of the
// order's first row it breaks (vari, koko, paino), or hukka (a good thing thrown away)
export function verdict(it: Item, passed: boolean, o: Order): string {
  const w = wanted(it, o);
  if (passed === w) return "";
  if (!passed) return "hukka";
  if (jams(it)) return "jumi";
  for (const c of o.conds) if (!holds(it, c)) return c.p;
  return "hukka";
}

export const WORST = ["jumi", "paino", "koko", "vari", "hukka"];
// the boss's worst complaint about a batch run with the rule
export function judge(items: Item[], r: Rule, o: Order): string {
  const found: string[] = [];
  for (const it of items) {
    const v = verdict(it, check(it, r) < 0, o);
    if (v) found.push(v);
    if (v === "jumi") break;     // the line stops
  }
  for (const w of WORST) if (found.indexOf(w) >= 0) return w;
  return "";
}

// ---- things on the line ---------------------------------------------------------------

export function apple(color: string, small: boolean, k: number): Item {
  const cm = small ? 4.5 + k * 1.5 : 7.6 + k * 1.8;
  return { kind: "omena", color, cm: Math.round(cm * 10) / 10, g: Math.round(small ? 60 + k * 40 : 150 + k * 110) };
}
export function thing(kind: string, k: number): Item {
  if (kind === "kirsikka") return { kind, color: "punainen", cm: 2 - 0.4 + k * 0.3, g: 6 + Math.round(k * 2) };
  if (kind === "pallo") return { kind, color: "punainen", cm: Math.round((8 + k) * 10) / 10, g: 15 + Math.round(k * 10) };
  return { kind, color: "oranssi", cm: 30 + Math.round(k * 10), g: 4200 + Math.round(k * 1500) };
}

function random(o: Order, rnd: () => number): Item {
  const x = rnd();
  const ex = o.extra.length ? 0.32 : 0;
  if (x < ex) return thing(o.extra[Math.floor(rnd() * o.extra.length)], rnd());
  return apple(o.colors[Math.floor(rnd() * o.colors.length)], o.small && rnd() < 0.45, rnd());
}

// a batch of things on the line; step 0-2 makes it longer
export function batch(o: Order, step: number, rnd: () => number): Item[] {
  const n = [6, 8, 10][step];
  const out: Item[] = [];
  const find = (ok: (it: Item) => boolean) => { for (let k = 0; k < 400; k++) { const it = random(o, rnd); if (ok(it)) return it; } return null; };
  // something good, and for every row something that only that row stops,
  // so every row of the rule matters
  const good = find((it) => wanted(it, o));
  if (good) out.push(good);
  o.conds.forEach((c, i) => {
    const it = find((it) => !holds(it, c) && o.conds.every((d, j) => j === i || holds(it, d)));
    if (it) out.push(it);
  });
  // every colour, kind and size the order speaks of
  for (const k of o.extra) if (!out.some((it) => it.kind === k)) out.push(thing(k, rnd()));
  for (const c of o.colors) if (!out.some((it) => it.color === c)) out.push(apple(c, false, rnd()));
  if (o.small && !out.some((it) => it.kind === "omena" && it.cm < SIZE.tennis)) out.push(apple(o.colors[0], true, rnd()));
  if (o.small && !out.some((it) => it.kind === "omena" && it.cm > SIZE.tennis)) out.push(apple(o.colors[0], false, rnd()));
  while (out.length < n) {
    // about half good things
    const it = find((it) => wanted(it, o) === (rnd() < 0.5));
    out.push(it || random(o, rnd));
  }
  // shuffle, but never start with a jam
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  if (jams(out[0])) for (let i = 1; i < out.length; i++) if (!jams(out[i])) { const t = out[0]; out[0] = out[i]; out[i] = t; break; }
  return out;
}
