// Pallosade's rules: an 8 × 8 grid where balls fall to the lowest free
// cell of a column. Four or more of one colour in a row (across, up or
// diagonally) make a line: its balls are removed, the balls above them
// fall down, and the line's owner scores 1 point (+1 for each ball over
// four). g[c * ROWS + r] is 0 (empty), 1 (white) or 2 (yellow); r = 0 is
// the bottom row.

export const COLS = 8, ROWS = 8;
export const WIN = 5;

export type Run = { p: number; cells: number[] };

export function empty(): number[] {
  const g: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) g.push(0);
  return g;
}

export function at(g: number[], c: number, r: number): number {
  return c < 0 || c >= COLS || r < 0 || r >= ROWS ? 0 : g[c * ROWS + r];
}

// the row a ball dropped into column c lands on, or -1 if it is full
export function landRow(g: number[], c: number): number {
  for (let r = 0; r < ROWS; r++) if (!g[c * ROWS + r]) return r;
  return -1;
}

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

// every line of four or more on the board
export function findRuns(g: number[]): Run[] {
  const runs: Run[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const p = at(g, c, r);
      if (!p) continue;
      for (const d of DIRS) {
        if (at(g, c - d[0], r - d[1]) === p) continue; // not the start of this run
        const cells: number[] = [];
        let x = c, y = r;
        while (at(g, x, y) === p) { cells.push(x * ROWS + y); x += d[0]; y += d[1]; }
        if (cells.length >= 4) runs.push({ p, cells });
      }
    }
  }
  return runs;
}

export function points(run: Run): number { return run.cells.length - 3; }

// removes the runs' balls and lets the balls above fall; answers, for each
// ball that moved, [column, fromRow, toRow]
export function collapse(g: number[], runs: Run[]): number[][] {
  for (const run of runs) for (const i of run.cells) g[i] = 0;
  const moves: number[][] = [];
  for (let c = 0; c < COLS; c++) {
    let to = 0;
    for (let r = 0; r < ROWS; r++) {
      const p = g[c * ROWS + r];
      if (!p) continue;
      if (r !== to) { g[c * ROWS + to] = p; g[c * ROWS + r] = 0; moves.push([c, r, to]); }
      to++;
    }
  }
  return moves;
}

// longest run of p through (c, r) if p were there
function longest(g: number[], c: number, r: number, p: number): number {
  let best = 0;
  for (const d of DIRS) {
    let n = 1;
    for (let k = 1; at(g, c + d[0] * k, r + d[1] * k) === p; k++) n++;
    for (let k = 1; at(g, c - d[0] * k, r - d[1] * k) === p; k++) n++;
    if (n > best) best = n;
  }
  return best;
}

// The phone's move for player p. It takes a line when it can, blocks the
// other player's line (not always: rnd() < block, so a child can win),
// avoids giving the other player a line on top of its ball, and otherwise
// builds next to its own balls, preferring the middle.
export function phoneMove(g: number[], p: number, rnd: () => number, block: number): number {
  const o = 3 - p;
  const blocks = rnd() < block;
  let best = -1, bestScore = -1e9;
  for (let c = 0; c < COLS; c++) {
    const r = landRow(g, c);
    if (r < 0) continue;
    let s = 0;
    const mine = longest(g, c, r, p);
    const theirs = longest(g, c, r, o);
    if (mine >= 4) s += 1000 + mine * 10;
    if (blocks && theirs >= 4) s += 500;
    if (r + 1 < ROWS) {
      g[c * ROWS + r] = p;
      if (longest(g, c, r + 1, o) >= 4) s -= 300;
      g[c * ROWS + r] = 0;
    }
    s += mine * mine * 4 + theirs * 3;
    s += 6 - Math.abs(c - (COLS - 1) / 2) * 1.5;
    s += rnd() * 6;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}
