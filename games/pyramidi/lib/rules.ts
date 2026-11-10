// Pyramid solitaire. 28 cards in 7 rows; a card is free when the two cards
// on it (the row below) are gone. Remove two free cards whose values add up
// to the target (10 with number cards 1–10, 13 with a full deck), or a
// card worth the target alone. The stock deals onto the waste; its top card
// is free too. Deals are made so that they can always be won (the stock can
// be turned over as many times as needed).

export type Card = { v: number; s: number };   // value, suit 0..3

export const ROWS = 7;
export const SIZE = 28;

export function rowOf(i: number): number { let r = 0; while ((r + 1) * (r + 2) / 2 <= i) r++; return r; }
export function colOf(i: number): number { const r = rowOf(i); return i - r * (r + 1) / 2; }
export function at(r: number, c: number): number { return r * (r + 1) / 2 + c; }

// the two cards lying on i (none for the bottom row)
export function children(i: number): number[] {
  const r = rowOf(i), c = colOf(i);
  if (r === ROWS - 1) return [];
  return [at(r + 1, c), at(r + 1, c + 1)];
}

export function isFree(gone: boolean[], i: number): boolean {
  if (gone[i]) return false;
  for (const k of children(i)) if (!gone[k]) return false;
  return true;
}

// A deal that can be won: the pyramid is taken apart in a random order, and
// each card gets a value that pairs it with the next free card, with a card
// of the stock, or (the target value) with nothing.
export function deal(target: number, rnd: () => number): { pyramid: Card[]; stock: Card[] } {
  const top = target === 10 ? 10 : 13;
  for (let attempt = 0; attempt < 200; attempt++) {
    const pool: number[] = [0];
    for (let v = 1; v <= top; v++) pool.push(4);
    const vals: number[] = [];
    for (let i = 0; i < SIZE; i++) vals.push(0);
    const reserved: number[] = [];
    // a random removal order
    const gone: boolean[] = []; for (let i = 0; i < SIZE; i++) gone.push(false);
    const order: number[] = [];
    while (order.length < SIZE) {
      const free: number[] = [];
      for (let i = 0; i < SIZE; i++) if (isFree(gone, i)) free.push(i);
      const k = free[Math.floor(rnd() * free.length)];
      gone[k] = true; order.push(k);
    }
    const pickPair = (): number => {
      const opts: number[] = [];
      for (let v = 1; v < target; v++) {
        const w = target - v;
        if (w > top) continue;
        if (v === w ? pool[v] >= 2 : pool[v] > 0 && pool[w] > 0) opts.push(v);
      }
      return opts.length ? opts[Math.floor(rnd() * opts.length)] : -1;
    };
    let ok = true;
    let i = 0;
    while (i < SIZE && ok) {
      const p = order[i];
      const q = i + 1 < SIZE ? order[i + 1] : -1;
      const together = q >= 0 && children(q).indexOf(p) < 0;
      const x = rnd();
      if (x < 0.12 && pool[target] > 0) { vals[p] = target; pool[target]--; i++; continue; }
      const v = pickPair();
      if (v < 0) { ok = false; break; }
      vals[p] = v; pool[v]--;
      if (together && x < 0.7) { vals[q] = target - v; pool[target - v]--; i += 2; }
      else { reserved.push(target - v); pool[target - v]--; i++; }
    }
    if (!ok) continue;
    const stockVals = reserved.slice();
    for (let v = 1; v <= top; v++) for (let k = 0; k < pool[v]; k++) stockVals.push(v);
    // shuffle the stock
    for (let k = stockVals.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const tmp = stockVals[k]; stockVals[k] = stockVals[j]; stockVals[j] = tmp; }
    // suits: each value's four cards get the four suits
    const used: number[][] = []; for (let v = 0; v <= top; v++) used.push([]);
    const suit = (v: number): number => { let s = Math.floor(rnd() * 4); while (used[v].indexOf(s) >= 0) s = (s + 1) % 4; used[v].push(s); return s; };
    return {
      pyramid: vals.map((v) => ({ v, s: suit(v) })),
      stock: stockVals.map((v) => ({ v, s: suit(v) })),
    };
  }
  throw new Error("no deal");
}

// a pair (or a single card) that can be removed now, for the hint button:
// indexes into the pyramid, or -1 for the waste's top card
export function findMove(pyr: Card[], gone: boolean[], waste: Card | null, target: number): number[] {
  const free: number[] = [];
  for (let i = 0; i < SIZE; i++) if (isFree(gone, i)) free.push(i);
  for (const i of free) if (pyr[i].v === target) return [i];
  if (waste && waste.v === target) return [-1];
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
    if (pyr[free[a]].v + pyr[free[b]].v === target) return [free[a], free[b]];
  }
  if (waste) for (const i of free) if (pyr[i].v + waste.v === target) return [i, -1];
  return [];
}
