// Koodikoulu's tasks and rules without pictures, so tests/koodikoulu.ts can
// check them. Four words: muistipaikka, operaattori, tietorakenne, funktio,
// and a level that uses all four. Every task is judged by what the child's
// program does (the cake, the result, the smoothie, the calls, the counter),
// never by comparing with one stored answer, so any program that works is right.
export type Rnd = () => number;
export type Val = number | string | boolean | null;

function ri(r: Rnd, lo: number, hi: number): number { return lo + Math.floor(r() * (hi - lo + 1)); }
function pick(r: Rnd, a: any[]): any { return a[Math.floor(r() * a.length)]; }
export function shuffle(r: Rnd, a: any[]): any[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}

// ---- the animals (customers) and fruits ------------------------------------------------
export const ANIMALS = [
  { id: "kissa", w: "KISSA", e: "🐱" },
  { id: "koira", w: "KOIRA", e: "🐶" },
  { id: "pupu", w: "PUPU", e: "🐰" },
  { id: "karhu", w: "KARHU", e: "🐻" },
  { id: "hiiri", w: "HIIRI", e: "🐭" },
];
export const FRUITS = [
  { e: "🍓", c: "#e63946" },
  { e: "🍌", c: "#ffd166" },
  { e: "🍏", c: "#8ac926" },
  { e: "🍇", c: "#7b2cbf" },
  { e: "🍊", c: "#fb8500" },
  { e: "🥝", c: "#52b788" },
  { e: "🍒", c: "#9d0208" },
  { e: "🍋", c: "#f9e04b" },
];

// ---- operators -----------------------------------------------------------------------
// the operators are machines that make one value out of two; a machine that
// does not work for these values gives null (words cannot be taken away)
export function apply(op: string, a: Val, b: Val): Val {
  const nums = typeof a === "number" && typeof b === "number";
  const strs = typeof a === "string" && typeof b === "string";
  const bools = typeof a === "boolean" && typeof b === "boolean";
  if (op === "+") return nums ? (a as number) + (b as number) : strs ? (a as string) + (b as string) : null;
  if (op === "-") return nums ? (a as number) - (b as number) : null;
  if (op === "×") return nums ? (a as number) * (b as number) : null;
  if (op === ">") return nums ? (a as number) > (b as number) : null;
  if (op === "<") return nums ? (a as number) < (b as number) : null;
  if (op === "=") return nums || strs || bools ? a === b : null;
  if (op === "ja") return bools ? (a as boolean) && (b as boolean) : null;
  if (op === "tai") return bools ? (a as boolean) || (b as boolean) : null;
  return null;
}

// ---- 1 Muistipaikka: the robot bakes the cake the boxes say ----------------------------
export type Cake = { candles: number; name: number; icing: boolean };
export type CakeTask = { order: Cake; boxes: string[]; customer: number };

// the boxes come one kind at a time: a number, then a word, then yes/no
export function cakeBoxes(q: number): string[] {
  return q < 2 ? ["kynttilat"] : q < 4 ? ["kynttilat", "nimi"] : ["kynttilat", "nimi", "kuorrute"];
}
export function cakeTask(r: Rnd, q: number, step: number): CakeTask {
  const boxes = cakeBoxes(q);
  const customer = ri(r, 0, ANIMALS.length - 1);
  const lo = [1, 3, 6][step], hi = [5, 9, 12][step];
  return {
    customer, boxes,
    order: {
      candles: ri(r, lo, hi),
      name: boxes.indexOf("nimi") >= 0 ? customer : -1,
      icing: boxes.indexOf("kuorrute") >= 0 ? r() < 0.5 : false,
    },
  };
}
// the cake the robot bakes from the boxes (a box that is not there: nothing)
export function bake(t: CakeTask, v: Cake): Cake {
  return {
    candles: v.candles,
    name: t.boxes.indexOf("nimi") >= 0 ? v.name : -1,
    icing: t.boxes.indexOf("kuorrute") >= 0 ? v.icing : false,
  };
}
// the boxes whose value is not what the order wants
export function cakeWrong(t: CakeTask, v: Cake): string[] {
  const c = bake(t, v), out: string[] = [];
  if (c.candles !== t.order.candles) out.push("kynttilat");
  if (c.name !== t.order.name) out.push("nimi");
  if (c.icing !== t.order.icing) out.push("kuorrute");
  return out;
}

// ---- 2 Operaattori: a machine with two inputs -----------------------------------------
export const WORDS = [
  { a: "PALO", b: "AUTO", e: "🚒", id: "paloauto" },
  { a: "LUMI", b: "UKKO", e: "⛄", id: "lumiukko" },
  { a: "LENTO", b: "KONE", e: "✈️", id: "lentokone" },
  { a: "AURINKO", b: "KUKKA", e: "🌻", id: "auringonkukka" },
  { a: "KILPI", b: "KONNA", e: "🐢", id: "kilpikonna" },
  { a: "VESI", b: "MELONI", e: "🍉", id: "vesimeloni" },
  { a: "KIRJA", b: "HYLLY", e: "📚", id: "kirjahylly" },
  { a: "MANSIKKA", b: "KAKKU", e: "🍰", id: "mansikkakakku" },
];
// kinds: valitse (choose the operator), aseta (set B for a given operator),
// sanat (+ glues words), vertaa (a comparison lights the lamp), vertaaA (set A
// so the lamp lights), logiikka (ja / tai with two keys)
export type OpTask = { kind: string; a: Val; b: Val; op: string; goal: Val; palette: string[]; words: string[]; word: number };
export const OP_KINDS = ["valitse", "aseta", "sanat", "vertaa", "vertaaA", "logiikka"];

export function opTask(r: Rnd, q: number, step: number): OpTask {
  const kind = OP_KINDS[q % OP_KINDS.length];
  const max = [5, 10, 20][step];
  const calc = step >= 2 ? ["+", "-", "×"] : ["+", "-"];
  const t: OpTask = { kind, a: 0, b: 0, op: "", goal: 0, palette: [], words: [], word: -1 };
  if (kind === "valitse" || kind === "aseta") {
    t.palette = calc;
    for (let k = 0; k < 400; k++) {
      const op = pick(r, calc);
      const a = ri(r, op === "×" ? 2 : 1, op === "×" ? 5 : max), b = ri(r, op === "×" ? 2 : 1, op === "×" ? 4 : max);
      const g = apply(op, a, b) as number;
      if (g < 0 || g > max * 2) continue;
      // only one operator of the palette makes the goal
      if (calc.filter((o) => apply(o, a, b) === g).length !== 1) continue;
      t.a = a; t.b = kind === "aseta" ? 0 : b; t.op = kind === "aseta" ? op : ""; t.goal = g;
      if (kind === "aseta") t.palette = [op];
      return t;
    }
  }
  if (kind === "sanat") {
    const w = ri(r, 0, WORDS.length - 1);
    let other = ri(r, 0, WORDS.length - 1);
    if (other === w) other = (w + 1) % WORDS.length;
    t.word = w;
    t.words = shuffle(r, [WORDS[w].a, WORDS[w].b, r() < 0.5 ? WORDS[other].a : WORDS[other].b]);
    t.a = ""; t.b = ""; t.op = "+"; t.palette = ["+"];
    t.goal = WORDS[w].a + WORDS[w].b;
    return t;
  }
  if (kind === "vertaa" || kind === "vertaaA") {
    t.palette = kind === "vertaa" ? [">", "<", "="] : [pick(r, [">", "<"])];
    const a = ri(r, 1, max), b0 = ri(r, 1, max - 1);
    const b = b0 >= a ? b0 + 1 : b0;          // a and b differ
    if (kind === "vertaa") { t.a = a; t.b = b; t.goal = r() < 0.7; }
    else {
      t.op = t.palette[0];
      t.b = ri(r, 2, max - 1);
      // A starts where the lamp is dark
      t.a = t.op === ">" ? ri(r, 1, t.b as number) : ri(r, t.b as number, max);
      t.goal = true;
    }
    return t;
  }
  // logiikka: the keys differ, so ja and tai give different answers
  t.palette = ["ja", "tai"];
  t.a = r() < 0.5; t.b = !t.a;
  t.goal = r() < 0.5;
  return t;
}
// the machine's result for the child's choices
export function opResult(t: OpTask, op: string, a: Val, b: Val): Val {
  if (!op) return null;
  return apply(op, a, b);
}
export function opMax(t: OpTask, step: number): number { return [5, 10, 20][step] * (t.kind === "aseta" ? 2 : 1); }

// ---- 3 Tietorakenne: a layered smoothie through a list, a queue, a stack; a lokerikko of names
export const DS_KINDS = ["lista", "jono", "pino", "lokero", "jonopino", "lista"];
export type DsTask = { kind: string; recipe: number[]; shelf: number[]; pantry: number[]; animals: number[]; wants: number[]; drawers: number[]; serve: number[] };

export function dsTask(r: Rnd, q: number, step: number): DsTask {
  let kind = DS_KINDS[q % DS_KINDS.length];
  if (kind === "jonopino") kind = r() < 0.5 ? "jono" : "pino";
  const len = [3, 4, 5][step];
  const fr = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]);
  const t: DsTask = { kind, recipe: [], shelf: [], pantry: [], animals: [], wants: [], drawers: [], serve: [] };
  if (kind === "lista") {
    t.shelf = fr.slice(0, 6);
    t.recipe = shuffle(r, t.shelf).slice(0, len);
  } else if (kind === "jono" || kind === "pino") {
    t.recipe = fr.slice(0, len);
    t.pantry = shuffle(r, fr.slice(0, len + 1));
  } else {
    const n = Math.min(len, 4);
    t.animals = shuffle(r, [0, 1, 2, 3, 4]).slice(0, n);
    t.wants = fr.slice(0, n);
    t.pantry = shuffle(r, fr.slice(0, n + 1));
    t.drawers = shuffle(r, t.animals);
    // the animals come in another order than the drawers are in
    for (let k = 0; k < 20; k++) { t.serve = shuffle(r, t.animals); if (t.serve.join() !== t.drawers.join()) break; }
  }
  return t;
}
// the fruits in the order they go into the cup
export function dsOut(t: DsTask, prog: number[]): number[] {
  if (t.kind === "lista") return prog.map((i) => (i >= 1 && i <= t.shelf.length ? t.shelf[i - 1] : -1));
  if (t.kind === "jono") return prog.slice();
  if (t.kind === "pino") return prog.slice().reverse();
  return [];
}
export function dsOk(t: DsTask, prog: number[], drawerFruit: number[]): boolean {
  if (t.kind === "lokero") return t.animals.every((a, i) => drawerFruit[t.drawers.indexOf(a)] === t.wants[i]);
  return dsOut(t, prog).join() === t.recipe.join();
}
export function wantOf(t: DsTask, animal: number): number { return t.wants[t.animals.indexOf(animal)]; }

// ---- 4 Funktio: one recipe, many calls ---------------------------------------------------
// luku: palauta x op n; kysy: palauta x (> | <) n (yes/no); kaksi: palauta x op n op2 n2
export const FN_KINDS = ["luku", "luku", "kysy", "kysy", "kaksi", "kaksi"];
export type Body = { op: string; n: number; op2: string; n2: number };
export type FnTask = { kind: string; xs: number[]; want: Val[]; palette: string[]; palette2: string[]; sol: Body };

export function fnRun(b: Body, x: number, two: boolean): Val {
  const v = apply(b.op, x, b.n);
  if (!two) return v;
  return apply(b.op2, v, b.n2);
}
export function fnTask(r: Rnd, q: number, step: number): FnTask {
  const kind = FN_KINDS[q % FN_KINDS.length];
  const two = kind === "kaksi";
  for (let k = 0; k < 600; k++) {
    let sol: Body, palette: string[], palette2: string[] = [];
    if (kind === "luku") {
      palette = step >= 1 ? ["+", "-", "×"] : ["+", "×"];
      const op = pick(r, palette);
      sol = { op, n: op === "×" ? ri(r, 2, step >= 2 ? 5 : 3) : ri(r, 1, [3, 6, 9][step]), op2: "", n2: 0 };
    } else if (kind === "kysy") {
      palette = [">", "<"];
      sol = { op: pick(r, palette), n: ri(r, 2, [6, 8, 10][step]), op2: "", n2: 0 };
    } else {
      palette = ["+", "×"]; palette2 = ["+", "-"];
      sol = { op: pick(r, palette), n: ri(r, 2, 3), op2: pick(r, palette2), n2: ri(r, 1, [2, 3, 5][step]) };
      if (sol.op === "+" && sol.op2 === "+") continue;
    }
    const xs = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, kind === "kysy" ? 4 : 3);
    if (kind === "luku" && sol.op === "-") { if (xs.some((x) => x - sol.n < 0)) continue; }
    const want = xs.map((x) => fnRun(sol, x, two));
    if (want.some((w) => typeof w === "number" && (w < 0 || w > 40))) continue;
    if (kind === "kysy" && (want.every((w) => w) || want.every((w) => !w))) continue;
    // the first call alone should not settle it: two different bodies fit it
    return { kind, xs, want, palette, palette2, sol };
  }
  return { kind: "luku", xs: [1, 2, 3], want: [2, 4, 6], palette: ["+", "×"], palette2: [], sol: { op: "×", n: 2, op2: "", n2: 0 } };
}
export function fnResults(t: FnTask, b: Body): Val[] { return t.xs.map((x) => fnRun(b, x, t.kind === "kaksi")); }
export function fnOk(t: FnTask, b: Body): boolean { return fnResults(t, b).every((v, i) => v === t.want[i]); }
// a name that says what the function does (shown when it works)
export function fnName(b: Body, two: boolean): string {
  if (two) return "kone";
  if (b.op === "×") return b.n === 2 ? "tuplaa" : b.n === 3 ? "triplaa" : "kerro_" + b.n + ":llä";
  if (b.op === "+") return "lisää_" + b.n;
  if (b.op === "-") return "vähennä_" + b.n;
  if (b.op === ">") return "isompi_kuin_" + b.n;
  if (b.op === "<") return "pienempi_kuin_" + b.n;
  return "kone";
}

// ---- 5 Kaikki yhdessä: a list, a memory slot, an operator and a function ----------------
// laske: laskuri = alku; jokaiselle x listassa: jos onko_F(x): laskuri = laskuri op n
// summa: summa = alku; jokaiselle x listassa: summa = summa op (hinta[x] | 1)
export type Prog = { alku: number; op: string; n: number; fn: number; lisa: string };
export type AllTask = { kind: string; lists: number[][]; kinds: number[]; target: number; prices: number[]; open: string[]; sol: Prog };
export const ALL_KINDS = ["laske", "summa", "laske", "summa", "laske", "summa"];
export const ALKU = [0, 1, 2, 3];
export const OPS5 = ["+", "-", "×"];
export const NS = [1, 2, 3];
export const LISA = ["hinta[x]", "1"];

export function allTask(r: Rnd, q: number, step: number): AllTask {
  const kind = ALL_KINDS[q % ALL_KINDS.length];
  const kinds = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 3);
  const target = kinds[ri(r, 0, 2)];
  const prices = [0, 0, 0, 0, 0, 0, 0, 0];
  const pv = shuffle(r, [1, 2, 3]);
  kinds.forEach((k, i) => { prices[k] = pv[i]; });
  const lists: number[][] = [];
  for (let n = 0; n < 2; n++) {
    for (let tries = 0; tries < 50; tries++) {
      const len = kind === "laske" ? ri(r, 5, 6) : ri(r, 3, 4);
      const l: number[] = [];
      for (let i = 0; i < len; i++) l.push(pick(r, kinds));
      const c = l.filter((x) => x === target).length;
      // the target is in both baskets, and the two answers differ
      if (kind === "laske" && (c < 1 || c === len)) continue;
      if (kind === "summa" && !l.some((x) => prices[x] > 1)) continue;
      if (n === 1 && evalProg(kind, l, solOf(kind, target), prices).value === evalProg(kind, lists[0], solOf(kind, target), prices).value) continue;
      lists.push(l);
      break;
    }
    if (lists.length <= n) lists.push(lists[0].slice(0, lists[0].length - 1));
  }
  // which parts the child fills in: more of them on the higher steps
  const open = kind === "laske"
    ? [["n"], ["alku", "op"], ["alku", "op", "n", "fn"]][step]
    : [["op"], ["alku", "op"], ["alku", "op", "lisa"]][step];
  return { kind, lists, kinds, target, prices, open, sol: solOf(kind, target) };
}
export function solOf(kind: string, target: number): Prog {
  return { alku: 0, op: "+", n: 1, fn: target, lisa: "hinta[x]" };
}
// the counter's value after each line that changes it, and the end value
export function evalProg(kind: string, list: number[], p: Prog, prices: number[]): { trace: number[]; value: number } {
  let v = p.alku;
  const trace: number[] = [];
  for (const x of list) {
    if (kind === "laske") {
      if (x === p.fn) v = apply(p.op, v, p.n) as number;
    } else {
      v = apply(p.op, v, p.lisa === "1" ? 1 : prices[x]) as number;
    }
    trace.push(v);
  }
  return { trace, value: v };
}
export function allGoal(t: AllTask, i: number): number { return evalProg(t.kind, t.lists[i], t.sol, t.prices).value; }
export function allOk(t: AllTask, p: Prog): boolean {
  return t.lists.every((l, i) => evalProg(t.kind, l, p, t.prices).value === allGoal(t, i));
}
