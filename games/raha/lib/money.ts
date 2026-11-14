// Rahakauppa: the money and the sums, without anything on the screen (so
// tests/raha.ts can check them). Amounts are whole cents everywhere.

export type Piece = { id: string; v: number; note: boolean; w: number; h: number };

// the real sizes: coins by their diameter (mm), notes by their width and
// height (mm); the game scales them for the screen
export const MONEY: Piece[] = [
  { id: "c5", v: 5, note: false, w: 21.25, h: 21.25 },
  { id: "c10", v: 10, note: false, w: 19.75, h: 19.75 },
  { id: "c20", v: 20, note: false, w: 22.25, h: 22.25 },
  { id: "c50", v: 50, note: false, w: 24.25, h: 24.25 },
  { id: "e1", v: 100, note: false, w: 23.25, h: 23.25 },
  { id: "e2", v: 200, note: false, w: 25.75, h: 25.75 },
  { id: "e5", v: 500, note: true, w: 120, h: 62 },
  { id: "e10", v: 1000, note: true, w: 127, h: 67 },
  { id: "e20", v: 2000, note: true, w: 133, h: 72 },
  { id: "e50", v: 5000, note: true, w: 140, h: 77 },
  { id: "e100", v: 10000, note: true, w: 147, h: 77 },
];

export function piece(v: number): Piece {
  for (const p of MONEY) if (p.v === v) return p;
  return MONEY[0];
}

export function total(list: number[]): number {
  let s = 0;
  for (const v of list) s += v;
  return s;
}

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n; }

// 7 €, 3,50 € (Finnish and Spanish) or €7, €3.50 (English); under a euro as cents
export function fmt(c: number, lang: string): string {
  const e = Math.floor(c / 100), s = c % 100;
  if (e === 0 && s > 0) return s + (lang === "en" ? " c" : lang === "es" ? " cts" : " snt");
  if (lang === "en") return "€" + e + (s ? "." + pad2(s) : "");
  return e + (s ? "," + pad2(s) : "") + "\u00a0€";
}

// the fewest pieces for an amount, from the values in `denoms`
export function fewest(c: number, denoms: number[]): number[] {
  const d = denoms.slice().sort((a, b) => b - a);
  const out: number[] = [];
  let left = c;
  for (const v of d) while (left >= v) { out.push(v); left -= v; }
  return left === 0 ? out : [];
}

// an amount as a random handful of pieces (not always the fewest: a 5 € can
// be 2 + 2 + 1), at most `max` pieces; `rnd` gives 0..1
export function handful(c: number, denoms: number[], max: number, rnd: () => number): number[] {
  for (let guard = 0; guard < 40; guard++) {
    const out: number[] = [];
    let left = c;
    while (left > 0 && out.length < max) {
      const fit = denoms.filter((v) => v <= left && fewest(left - v, denoms).length + out.length + 1 <= max);
      if (!fit.length) break;
      // mostly the bigger pieces, sometimes a smaller one
      fit.sort((a, b) => b - a);
      const i = rnd() < 0.65 ? 0 : Math.floor(rnd() * fit.length);
      out.push(fit[i]);
      left -= fit[i];
    }
    if (left === 0) return out.sort((a, b) => b - a);
  }
  return fewest(c, denoms);
}

// whether some `k` of the prices together cost at most `budget`, and whether
// some `k` cost more (so a task has a right answer and a wrong one)
export function cheapest(prices: number[], k: number): number {
  return total(prices.slice().sort((a, b) => a - b).slice(0, k));
}
export function dearest(prices: number[], k: number): number {
  return total(prices.slice().sort((a, b) => b - a).slice(0, k));
}
