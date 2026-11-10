// Reversi rules and the phone's moves. The board is 64 cells, index r*8+c,
// 0 empty, 1 dark, 2 light. Dark starts.

export const N = 8;
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

export function start(): number[] {
  const b: number[] = [];
  for (let i = 0; i < 64; i++) b.push(0);
  b[27] = 2; b[28] = 1; b[35] = 1; b[36] = 2;
  return b;
}

// the discs a move at i would turn over (empty when the move is not allowed)
export function flips(b: number[], i: number, p: number): number[] {
  if (b[i] !== 0) return [];
  const out: number[] = [];
  const o = 3 - p;
  const r0 = Math.floor(i / 8), c0 = i % 8;
  for (const d of DIRS) {
    const dr = d < -1 ? -1 : d > 1 ? 1 : 0;
    const dc = d === -9 || d === -1 || d === 7 ? -1 : d === -7 || d === 1 || d === 9 ? 1 : 0;
    let r = r0 + dr, c = c0 + dc;
    const line: number[] = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === o) { line.push(r * 8 + c); r += dr; c += dc; }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === p) for (const x of line) out.push(x);
  }
  return out;
}

export function moves(b: number[], p: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if (b[i] === 0 && flips(b, i, p).length) out.push(i);
  return out;
}

// plays a move in place, returns the turned discs
export function play(b: number[], i: number, p: number): number[] {
  const f = flips(b, i, p);
  b[i] = p;
  for (const x of f) b[x] = p;
  return f;
}

export function count(b: number[], p: number): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (b[i] === p) n++;
  return n;
}

// who plays next after p moved: the other one, p again if the other must pass, 0 when the game is over
export function next(b: number[], p: number): number {
  if (moves(b, 3 - p).length) return 3 - p;
  if (moves(b, p).length) return p;
  return 0;
}

// how good each square is: corners great, the squares next to them bad
const W = [
  100, -25, 10, 5, 5, 10, -25, 100,
  -25, -40, -2, -2, -2, -2, -40, -25,
  10, -2, 2, 1, 1, 2, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 2, 1, 1, 2, -2, 10,
  -25, -40, -2, -2, -2, -2, -40, -25,
  100, -25, 10, 5, 5, 10, -25, 100,
];

function evaluate(b: number[], p: number): number {
  const o = 3 - p;
  let s = 0, empty = 0;
  for (let i = 0; i < 64; i++) {
    if (b[i] === p) s += W[i]; else if (b[i] === o) s -= W[i]; else empty++;
  }
  if (empty < 12) s += (count(b, p) - count(b, o)) * 4;
  s += (moves(b, p).length - moves(b, o).length) * 5;
  return s;
}

let nodes = 0;
function search(b: number[], p: number, me: number, depth: number, alpha: number, beta: number): number {
  nodes++;
  const ms = moves(b, p);
  if (depth === 0) return evaluate(b, me);
  if (!ms.length) {
    if (!moves(b, 3 - p).length) {
      const d = count(b, me) - count(b, 3 - me);
      return d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0;
    }
    return search(b, 3 - p, me, depth - 1, alpha, beta);
  }
  if (p === me) {
    let best = -1e9;
    for (const m of ms) {
      const c = b.slice(); play(c, m, p);
      const v = search(c, 3 - p, me, depth - 1, alpha, beta);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = 1e9;
  for (const m of ms) {
    const c = b.slice(); play(c, m, p);
    const v = search(c, 3 - p, me, depth - 1, alpha, beta);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best;
}

// The phone's move. level 1: mostly the move that turns the most discs, sometimes
// random; 2: looks at square values one move ahead; 3: thinks 4 moves ahead.
export function phoneMove(b: number[], p: number, level: number, rnd: () => number): number {
  const ms = moves(b, p);
  if (!ms.length) return -1;
  if (level <= 1) {
    if (rnd() < 0.35) return ms[Math.floor(rnd() * ms.length)];
    let best = ms[0], bn = -1;
    for (const m of ms) { const n = flips(b, m, p).length + rnd() * 0.9; if (n > bn) { bn = n; best = m; } }
    return best;
  }
  const depth = level === 2 ? 1 : 3;
  nodes = 0;
  let best = ms[0], bv = -1e9;
  for (const m of ms) {
    const c = b.slice(); play(c, m, p);
    const v = search(c, 3 - p, p, depth - 1, -1e9, 1e9) + rnd() * (level === 2 ? 6 : 1);
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}

export function lastNodes() { return nodes; }

// The same thinking a step at a time, one candidate move per step, so the
// screen keeps moving on a slow phone: startThink, then stepThink() each
// frame until it returns the move (>= 0).
type Think = { b: number[]; p: number; level: number; ms: number[]; k: number; best: number; bv: number; rnd: () => number };
let th: Think | null = null;
export function startThink(b: number[], p: number, level: number, rnd: () => number) {
  th = { b: b.slice(), p, level, ms: moves(b, p), k: 0, best: -1, bv: -1e9, rnd };
  if (level <= 1 || th.ms.length <= 1) { th.best = phoneMove(b, p, level, rnd); th.k = th.ms.length; }
}
export function stepThink(): number {
  if (!th) return -1;
  const t = th;
  if (t.k < t.ms.length) {
    const m = t.ms[t.k++];
    const c = t.b.slice(); play(c, m, t.p);
    const v = search(c, 3 - t.p, t.p, (t.level === 2 ? 1 : 3) - 1, -1e9, 1e9) + t.rnd() * (t.level === 2 ? 6 : 1);
    if (v > t.bv) { t.bv = v; t.best = m; }
    return -1;
  }
  th = null;
  return t.best;
}
