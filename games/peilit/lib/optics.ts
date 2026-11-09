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

// The same light at any angle (the game: a mirror turns steplessly). A ray
// runs in cell units from the source's centre; a mirror is a segment through
// its cell's centre (length MIRROR_LEN, angle m × 22.5°, m may be fractional),
// a target, owl or source a circle, a wall a square a little smaller than its
// cell (so light passes diagonally between two walls touching at a corner,
// as in trace()). A ray running along a mirror passes it, as in trace().
export type FreeHit = { x: number; y: number; px: number; py: number; ix: number; iy: number; ox: number; oy: number };
export type FreeTrace = { segs: number[][]; lit: string[]; owls: string[]; hits: FreeHit[] };

export const MIRROR_LEN = 0.92;
const R_ROUND = 0.42;
const WALL_IN = 0.04;
const EPS = 1e-7;

export function traceFree(grid: (Cell | null)[][], W: number, H: number): FreeTrace {
  const segs: number[][] = [];
  const lit: string[] = [];
  const owls: string[] = [];
  const hits: FreeHit[] = [];
  // rays: x, y, dx, dy, the cell to ignore (where it starts) x, y
  const queue: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c && c.k === "src") { const a = (c.d || 0) * Math.PI / 4; queue.push([x + 0.5, y + 0.5, Math.cos(a), Math.sin(a), x, y]); }
  }
  let n = 0;
  while (queue.length && n < 120) {
    n++;
    const r = queue.shift() as number[];
    const ox = r[0], oy = r[1], dx = r[2], dy = r[3];
    // the board's edge
    let best = 1e9;
    if (dx > EPS) best = Math.min(best, (W - ox) / dx); else if (dx < -EPS) best = Math.min(best, -ox / dx);
    if (dy > EPS) best = Math.min(best, (H - oy) / dy); else if (dy < -EPS) best = Math.min(best, -oy / dy);
    let hx = -1, hy = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      if (!c || c.k === "glass" || (x === r[4] && y === r[5])) continue;
      const cx = x + 0.5, cy = y + 0.5;
      let tt = -1;
      if (c.k === "wall") {
        // slab test against the square
        let t0 = -1e9, t1 = 1e9;
        const lo = [x + WALL_IN, y + WALL_IN], hi = [x + 1 - WALL_IN, y + 1 - WALL_IN], o = [ox, oy], d = [dx, dy];
        let miss = false;
        for (let k = 0; k < 2; k++) {
          if (Math.abs(d[k]) < EPS) { if (o[k] < lo[k] || o[k] > hi[k]) miss = true; continue; }
          let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
          if (a > b) { const s = a; a = b; b = s; }
          if (a > t0) t0 = a;
          if (b < t1) t1 = b;
        }
        if (!miss && t0 <= t1 && t0 > EPS) tt = t0;
      } else if (c.k === "target" || c.k === "owl" || c.k === "src") {
        const fx = ox - cx, fy = oy - cy;
        const b = fx * dx + fy * dy, q = fx * fx + fy * fy - R_ROUND * R_ROUND;
        const disc = b * b - q;
        if (disc >= 0) { const s = -b - Math.sqrt(disc); if (s > EPS) tt = s; }
      } else if (c.k === "mirror" || c.k === "split") {
        const a = (c.m || 0) * Math.PI / 8;
        const ux = Math.cos(a), uy = Math.sin(a);
        const den = dx * uy - dy * ux;
        if (Math.abs(den) > 1e-9) {
          const wx = cx - ox, wy = cy - oy;
          const s = (wx * uy - wy * ux) / den;       // along the ray
          const u = (wx * dy - wy * dx) / den;       // along the mirror, from its centre
          if (s > EPS && Math.abs(u) <= MIRROR_LEN / 2) tt = s;
        }
      }
      if (tt > 0 && tt < best) { best = tt; hx = x; hy = y; }
    }
    const ex = ox + dx * best, ey = oy + dy * best;
    segs.push([ox, oy, ex, ey]);
    if (hx < 0) continue;
    const c = grid[hy][hx] as Cell;
    const key = hx + "," + hy;
    if (c.k === "target") { if (lit.indexOf(key) < 0) lit.push(key); continue; }
    if (c.k === "owl") { if (owls.indexOf(key) < 0) owls.push(key); continue; }
    if (c.k === "mirror" || c.k === "split") {
      const a = (c.m || 0) * Math.PI / 8;
      const nx = -Math.sin(a), ny = Math.cos(a);
      const dn = dx * nx + dy * ny;
      const rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny;
      hits.push({ x: hx, y: hy, px: ex, py: ey, ix: dx, iy: dy, ox: rx, oy: ry });
      queue.push([ex, ey, rx, ry, hx, hy]);
      if (c.k === "split") queue.push([ex, ey, dx, dy, hx, hy]);
    }
  }
  return { segs: segs, lit: lit, owls: owls, hits: hits };
}

// the angle of incidence at a hit, in degrees (0 = straight on)
export function incidenceOf(h: FreeHit): number {
  const c = -(h.ix * h.ox + h.iy * h.oy);           // cos of the angle between the two rays = cos(2i)
  return Math.acos(Math.min(1, Math.max(-1, c))) * 90 / Math.PI;
}
