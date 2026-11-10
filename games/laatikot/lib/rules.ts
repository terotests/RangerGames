// Dots and boxes on an R × C grid of boxes. Lines are numbered: first the
// horizontal ones (R+1 rows of C), then the vertical ones (R rows of C+1).

export function lineCount(R: number, C: number) { return (R + 1) * C + R * (C + 1); }
export function hLine(R: number, C: number, r: number, c: number) { return r * C + c; }
export function vLine(R: number, C: number, r: number, c: number) { return (R + 1) * C + r * (C + 1) + c; }

export function sides(R: number, C: number, b: number): number[] {
  const r = Math.floor(b / C), c = b % C;
  return [hLine(R, C, r, c), hLine(R, C, r + 1, c), vLine(R, C, r, c), vLine(R, C, r, c + 1)];
}

// the boxes a line belongs to (one or two)
export function boxesOf(R: number, C: number, l: number): number[] {
  const out: number[] = [];
  const H = (R + 1) * C;
  if (l < H) {
    const r = Math.floor(l / C), c = l % C;
    if (r > 0) out.push((r - 1) * C + c);
    if (r < R) out.push(r * C + c);
  } else {
    const k = l - H, r = Math.floor(k / (C + 1)), c = k % (C + 1);
    if (c > 0) out.push(r * C + c - 1);
    if (c < C) out.push(r * C + c);
  }
  return out;
}

export function drawn(lines: number[], R: number, C: number, b: number): number {
  let n = 0;
  for (const s of sides(R, C, b)) if (lines[s]) n++;
  return n;
}

// draws line l for player p; returns the boxes it closed (they get p)
export function play(lines: number[], boxes: number[], R: number, C: number, l: number, p: number): number[] {
  lines[l] = p;
  const closed: number[] = [];
  for (const b of boxesOf(R, C, l)) if (!boxes[b] && drawn(lines, R, C, b) === 4) { boxes[b] = p; closed.push(b); }
  return closed;
}

// how many boxes the other player could take in a row after line l
function giveaway(lines: number[], boxes: number[], R: number, C: number, l: number): number {
  const L = lines.slice(), B = boxes.slice();
  play(L, B, R, C, l, 9);
  let n = 0;
  for (;;) {
    let took = false;
    for (let b = 0; b < R * C; b++) {
      if (B[b] || drawn(L, R, C, b) !== 3) continue;
      for (const s of sides(R, C, b)) if (!L[s]) { n += play(L, B, R, C, s, 8).length; took = true; break; }
    }
    if (!took) return n;
  }
}

// The phone's line. Level 1 misses boxes now and then and does not look ahead;
// level 2 takes every box, never hands over a third side when it can avoid it,
// and otherwise gives away the shortest chain.
export function phoneLine(lines: number[], boxes: number[], R: number, C: number, level: number, rnd: () => number): number {
  const free: number[] = [];
  for (let l = 0; l < lines.length; l++) if (!lines[l]) free.push(l);
  const closes = (l: number) => { for (const b of boxesOf(R, C, l)) if (drawn(lines, R, C, b) === 3) return true; return false; };
  const risky = (l: number) => { for (const b of boxesOf(R, C, l)) if (drawn(lines, R, C, b) === 2) return true; return false; };
  const pick = (a: number[]) => a[Math.floor(rnd() * a.length)];
  const take = free.filter(closes);
  if (take.length && (level >= 2 || rnd() < 0.7)) return pick(take);
  const safe = free.filter((l) => !closes(l) && !risky(l));
  if (safe.length) return pick(safe);
  if (level < 2) return pick(free);
  let best = free[0], bn = 1e9;
  for (const l of free) { const n = giveaway(lines, boxes, R, C, l) + rnd() * 0.5; if (n < bn) { bn = n; best = l; } }
  return best;
}
