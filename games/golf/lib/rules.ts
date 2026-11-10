// Golf solitaire: 7 columns of 5 face-up cards, 17 cards in the stock, one
// on the waste. The bottom card of a column can go onto the waste when it is
// one higher or one lower. With `wrap`, K and A are neighbours too.

export type Card = { v: number; s: number };

export function deck(rnd: () => number): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let v = 1; v <= 13; v++) d.push({ v, s });
  for (let k = d.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const tmp = d[k]; d[k] = d[j]; d[j] = tmp; }
  return d;
}

export function fits(a: number, b: number, wrap: boolean): boolean {
  const d = Math.abs(a - b);
  return d === 1 || (wrap && d === 12);
}

export function dealGolf(rnd: () => number): { cols: Card[][]; stock: Card[]; waste: Card[] } {
  const d = deck(rnd);
  const cols: Card[][] = [];
  for (let c = 0; c < 7; c++) cols.push(d.splice(0, 5));
  const waste = [d.pop() as Card];
  return { cols, stock: d, waste };
}

export function playable(cols: Card[][], top: Card, wrap: boolean): number[] {
  const out: number[] = [];
  for (let c = 0; c < 7; c++) { const col = cols[c]; if (col.length && fits(col[col.length - 1].v, top.v, wrap)) out.push(c); }
  return out;
}
