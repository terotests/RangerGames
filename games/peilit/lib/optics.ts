// The light of Valopeilit on a grid: a beam runs from cell centre to cell
// centre in one of eight directions (0 = right, then 45° steps clockwise:
// 1 down-right, 2 down, 3 down-left, 4 left, 5 up-left, 6 up, 7 up-right).
// A mirror's line points at m × 22.5° (0 = flat, 2 = "\", 4 = upright,
// 6 = "/"), so the angle of incidence equals the angle of reflection when a
// beam going `d` leaves it going (m − d) mod 8. A half mirror ("split")
// reflects one beam and lets another through.

export type Cell = {
  k: string;          // "wall" "target" "owl" "src" "mirror" "split" "glass"
  t?: string;         // target: "flower" "panel" "cat" "lizard" "laundry" "sunflower"
  m?: number;         // mirror / half mirror: 0–7
  d?: number;         // source: its direction
  fixed?: boolean;    // part of the level: cannot be moved
  lock?: boolean;     // cannot be turned either
};

export type Hit = { x: number; y: number; din: number; dout: number };
export type Trace = { segs: number[][]; lit: string[]; owls: string[]; hits: Hit[] };

export const DX = [1, 1, 0, -1, -1, -1, 0, 1];
export const DY = [0, 1, 1, 1, 0, -1, -1, -1];

export function reflect(m: number, d: number): number {
  return (((m - d) % 8) + 8) % 8;
}

// every beam on the board: segments [x0, y0, x1, y1] in cells (a centre is
// at +0.5), the targets and owls the light reaches ("x,y") and where it
// turned at a mirror
export function trace(grid: (Cell | null)[][], W: number, H: number): Trace {
  const segs: number[][] = [];
  const lit: string[] = [];
  const owls: string[] = [];
  const hits: Hit[] = [];
  const seen: { [k: string]: boolean } = {};
  const queue: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c && c.k === "src") queue.push([x, y, c.d || 0]);
  }
  let steps = 0;
  while (queue.length && steps < 4000) {
    const b = queue.shift() as number[];
    let x = b[0], y = b[1];
    const d = b[2];
    const sx = x + 0.5, sy = y + 0.5;
    let ex = sx, ey = sy;
    while (steps < 4000) {
      steps++;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) { ex = x + 0.5 + DX[d] * 0.5; ey = y + 0.5 + DY[d] * 0.5; break; }
      x = nx; y = ny;
      const c = grid[y][x];
      if (!c || c.k === "glass") continue;
      if (c.k === "wall" || c.k === "src") { ex = x + 0.5 - DX[d] * 0.5; ey = y + 0.5 - DY[d] * 0.5; break; }
      ex = x + 0.5; ey = y + 0.5;
      const key = x + "," + y;
      if (c.k === "target") { if (lit.indexOf(key) < 0) lit.push(key); break; }
      if (c.k === "owl") { if (owls.indexOf(key) < 0) owls.push(key); break; }
      if (c.k === "mirror" || c.k === "split") {
        const nd = reflect(c.m || 0, d);
        hits.push({ x: x, y: y, din: d, dout: nd });
        const outs = c.k === "split" && nd !== d ? [nd, d] : [nd];
        for (const o of outs) {
          const vk = key + "," + o;
          if (!seen[vk]) { seen[vk] = true; queue.push([x, y, o]); }
        }
        break;
      }
    }
    segs.push([sx, sy, ex, ey]);
  }
  return { segs: segs, lit: lit, owls: owls, hits: hits };
}

// the angle of incidence (= the angle of reflection) at a mirror, in degrees
export function incidence(m: number, din: number): number {
  const normal = m * 22.5 + 90;
  let a = Math.abs(((din * 45 + 180 - normal) % 180 + 180) % 180);
  if (a > 90) a = 180 - a;
  return Math.round(a * 10) / 10;
}

// A level's map: one string per row.
//   .  empty floor (a mirror can go here)      #  stone wall (stops light)
//   ~  pond (light crosses it, no mirror)      0–7  a light source and its direction
//   F flower  U sunflower  P solar panel  C cat  L lizard  W laundry   (light these)
//   O owl (asleep: keep the light away)
//   a–h  a fixed mirror the player can turn, m = 0–7
//   i–p  a fixed mirror that cannot be turned, m = 0–7   s  a fixed half mirror (turnable)
export const TARGETS: { [ch: string]: string } = { F: "flower", U: "sunflower", P: "panel", C: "cat", L: "lizard", W: "laundry" };

export function parseMap(rows: string[]): (Cell | null)[][] {
  const g: (Cell | null)[][] = [];
  for (let y = 0; y < rows.length; y++) {
    const r: (Cell | null)[] = [];
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y].charAt(x);
      const code = ch.charCodeAt(0);
      let c: Cell | null = null;
      if (ch === "#") c = { k: "wall" };
      else if (ch === "~") c = { k: "glass" };
      else if (ch === "O") c = { k: "owl" };
      else if (ch === "s") c = { k: "split", m: 2, fixed: true };
      else if (TARGETS[ch]) c = { k: "target", t: TARGETS[ch] };
      else if (code >= 48 && code <= 55) c = { k: "src", d: code - 48 };
      else if (code >= 97 && code <= 104) c = { k: "mirror", m: code - 97, fixed: true };
      else if (code >= 105 && code <= 112) c = { k: "mirror", m: code - 105, fixed: true, lock: true };
      r.push(c);
    }
    g.push(r);
  }
  return g;
}

export function solved(grid: (Cell | null)[][], tr: Trace): boolean {
  if (tr.owls.length) return false;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    const c = grid[y][x];
    if (c && c.k === "target" && tr.lit.indexOf(x + "," + y) < 0) return false;
  }
  return true;
}
