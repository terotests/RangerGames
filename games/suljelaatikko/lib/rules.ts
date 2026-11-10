// Shut the box: tiles 1..9. Roll the dice, shut open tiles that add up to
// the roll. When no tiles add up to it, the round ends; the open tiles'
// sum is the score (lower is better, 0 = the box is shut).

// every way to make `sum` from the open tiles (open[n] for n = 1..9)
export function combos(open: boolean[], sum: number): number[][] {
  const out: number[][] = [];
  const go = (from: number, left: number, acc: number[]) => {
    if (left === 0) { out.push(acc.slice()); return; }
    for (let n = from; n <= 9 && n <= left; n++) if (open[n]) { acc.push(n); go(n + 1, left - n, acc); acc.pop(); }
  };
  go(1, sum, []);
  return out;
}

export function openSum(open: boolean[]): number { let s = 0; for (let n = 1; n <= 9; n++) if (open[n]) s += n; return s; }

// one die is allowed when 7, 8 and 9 are shut
export function oneDieOk(open: boolean[]): boolean { return !open[7] && !open[8] && !open[9]; }

// the phone's choice: the fewest tiles, then the biggest ones
export function bestCombo(open: boolean[], sum: number): number[] {
  const cs = combos(open, sum);
  if (!cs.length) return [];
  cs.sort((a, b) => a.length - b.length || Math.max(...b) - Math.max(...a));
  return cs[0];
}
