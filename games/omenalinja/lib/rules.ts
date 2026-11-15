// Omenalinjasto's rules without pictures, so tests/omenalinja.ts can check them.

export type Item = { kind: string; red: boolean; worm: boolean; small: boolean; g: number };
// the rule the child builds: 0 = no rule on that row
//   vari  1 red, 2 green      mato 1 no worm      omena 1 apples only
//   yli   heavier than 1 cherry, 2 tennis ball
//   alle  lighter than 1 tennis ball, 2 pumpkin
export type Rule = { omena: number; vari: number; mato: number; yli: number; alle: number };
export const ROWS = ["omena", "vari", "mato", "yli", "alle"];
export const REF: any = { kirsikka: 8, tennis: 58, kurpitsa: 4000 };
const YLI = [0, REF.kirsikka, REF.tennis];
const ALLE = [0, REF.tennis, REF.kurpitsa];
export const VALUES: any = { omena: 2, vari: 3, mato: 2, yli: 3, alle: 3 };

// the rows a level shows (level 0 is sorting by hand)
export function rowsFor(level: number): string[] {
  if (level <= 1) return ["vari"];
  if (level === 2) return ["vari", "mato"];
  if (level === 3) return ["vari", "mato", "yli", "alle"];
  return ["omena", "vari", "mato", "yli", "alle"];
}

export function emptyRule(): Rule { return { omena: 0, vari: 0, mato: 0, yli: 0, alle: 0 }; }

export function apple(red: boolean, worm: boolean, small: boolean, g: number): Item { return { kind: "omena", red, worm, small, g: small ? 35 + g * 10 : 140 + g * 60 }; }
export function thing(kind: string): Item { return { kind, red: false, worm: false, small: false, g: kind === "kurpitsa" ? REF.kurpitsa : kind === "kenka" ? 350 : 120 }; }

// the first row of the rule the item fails, "" if it goes on
export function check(it: Item, r: Rule, rows: string[]): string {
  for (const row of rows) {
    if (row === "omena" && r.omena === 1 && it.kind !== "omena") return row;
    if (row === "vari" && r.vari === 1 && !(it.kind === "omena" && it.red)) return row;
    if (row === "vari" && r.vari === 2 && !(it.kind === "omena" && !it.red)) return row;
    if (row === "mato" && r.mato === 1 && it.worm) return row;
    if (row === "yli" && r.yli > 0 && !(it.g > YLI[r.yli])) return row;
    if (row === "alle" && r.alle > 0 && !(it.g < ALLE[r.alle])) return row;
  }
  return "";
}

// what the boss wants from the line on a level; goalRed for levels 0-1
export function wanted(it: Item, level: number, goalRed: boolean, noWorms: boolean): boolean {
  if (level <= 1) return it.kind === "omena" && it.red === goalRed && !(noWorms && it.worm);
  if (level === 2) return it.kind === "omena" && !it.worm;
  return it.kind === "omena" && !it.worm && !it.small;
}

// anything but an apple jams the slicer
export function jams(it: Item): boolean { return it.kind !== "omena"; }

// what went wrong with an item, "" if nothing: jumi, mato, pieni, vari, hukka
export function verdict(it: Item, passed: boolean, level: number, goalRed: boolean, noWorms: boolean): string {
  const w = wanted(it, level, goalRed, noWorms);
  if (passed === w) return "";
  if (!passed) return "hukka";
  if (jams(it)) return "jumi";
  if (it.worm) return "mato";
  if (it.small) return "pieni";
  return "vari";
}

// the boss's worst complaint about a batch run with the rule (order of importance)
export const WORST = ["jumi", "mato", "pieni", "vari", "hukka"];
export function judge(items: Item[], r: Rule, level: number, goalRed: boolean, noWorms: boolean): string {
  const rows = rowsFor(level);
  const found: string[] = [];
  for (const it of items) {
    const passed = check(it, r, rows) === "";
    const v = verdict(it, passed, level, goalRed, noWorms);
    if (v) found.push(v);
    if (v === "jumi") break;     // the line stops
  }
  for (const w of WORST) if (found.indexOf(w) >= 0) return w;
  return "";
}

// the rule that is right for a level (the hint points at the first row that differs)
export function solution(level: number, goalRed: boolean): Rule {
  const r = emptyRule();
  if (level <= 1) { r.vari = goalRed ? 1 : 2; return r; }
  r.mato = 1;
  if (level >= 3) { r.yli = 2; r.alle = 2; }
  // "on omena" also stops the pumpkin, so the upper weight row is not needed then
  if (level >= 4) { r.omena = 1; r.alle = 0; }
  return r;
}

// a batch of things on the line; step 0-2 makes it longer and more mixed
export function batch(level: number, step: number, rnd: () => number): Item[] {
  const n = [6, 8, 10][step];
  const out: Item[] = [];
  const add = (it: Item) => out.push(it);
  // the things a level must contain, so every row of its rule matters
  add(apple(true, false, false, rnd())); add(apple(false, false, false, rnd()));
  if (level === 0 && step > 0 || level >= 2) add(apple(rnd() < 0.5, true, false, rnd()));
  if (level >= 3) { add(apple(rnd() < 0.5, false, true, rnd())); add(thing("kurpitsa")); }
  if (level >= 4) { add(thing("kenka")); add(thing("banaani")); }
  while (out.length < n) {
    const k = rnd();
    const worm = (level === 0 && step > 0 || level >= 2) && rnd() < 0.25;
    const small = level >= 3 && rnd() < 0.2;
    add(apple(k < 0.5, worm, small && !worm, rnd()));
  }
  // shuffle, but never start with a jam
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  if (jams(out[0])) for (let i = 1; i < out.length; i++) if (!jams(out[i])) { const t = out[0]; out[0] = out[i]; out[i] = t; break; }
  return out;
}
