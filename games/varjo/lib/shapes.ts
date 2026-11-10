// Varjopalat: the pieces, the figures and the geometry that checks them.
// Units: a small triangle's legs are 2. Every figure is drawn on whole
// numbers and every piece in it is turned by whole quarter turns (pieces
// turn 90° at a time in the game), so a figure can be made exactly.

export type Pt = number[];          // [x, y], y down
export type Poly = Pt[];

// the pieces as the game first makes them
export const SHAPES: { [k: string]: Poly } = {
  S: [[0, 0], [2, 0], [0, 2]],            // small triangle
  M: [[0, 0], [4, 0], [2, 2]],            // middle triangle
  L: [[0, 0], [4, 0], [0, 4]],            // big triangle
  Q: [[0, 0], [2, 0], [2, 2], [0, 2]],    // square
  P: [[0, 0], [2, 0], [4, 2], [2, 2]],    // parallelogram
};
export const KINDS = ["L", "M", "P", "Q", "S"];

export const COLORS: { [k: string]: string[] } = {
  // fill, edge
  S: ["#ffd166", "#e09f1f"], M: ["#06d6a0", "#03936d"], L: ["#ef476f", "#b8264b"],
  Q: ["#4cc9f0", "#1d8fb8"], P: ["#b388eb", "#7d4fc0"],
};

export type Figure = { id: string; fi: string; en: string; es: string; icon: string; polys: Poly[] };

const T = (a: Pt, b: Pt, c: Pt): Poly => [a, b, c];
const Sq = (x: number, y: number): Poly => [[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2]];

// Each figure: its name, an emoji for the menu, its pieces as polygons.
export const FIGURES: Figure[] = [
  { id: "timantti", fi: "Timantti", en: "Diamond", es: "Diamante", icon: "💎", polys: [
    T([0, 2], [4, 2], [2, 0]), T([0, 2], [4, 2], [2, 4])] },
  { id: "nuoli", fi: "Nuoli", en: "Arrow", es: "Flecha", icon: "➡️", polys: [
    Sq(0, 1), Sq(2, 1), T([4, 0], [4, 4], [6, 2])] },
  { id: "talo", fi: "Talo", en: "House", es: "Casa", icon: "🏠", polys: [
    T([0, 4], [4, 4], [2, 2]), T([0, 4], [4, 4], [0, 8]), T([4, 4], [4, 8], [0, 8])] },
  { id: "vene", fi: "Vene", en: "Boat", es: "Barco", icon: "⛵", polys: [
    T([2, 0], [2, 4], [6, 4]), T([0, 4], [2, 4], [2, 6]), Sq(2, 4), T([4, 4], [6, 4], [4, 6])] },
  { id: "kala", fi: "Kala", en: "Fish", es: "Pez", icon: "🐟", polys: [
    T([0, 2], [4, 2], [2, 0]), T([0, 2], [4, 2], [2, 4]), T([4, 2], [6, 0], [6, 2]), T([4, 2], [6, 2], [6, 4])] },
  { id: "jaatelo", fi: "Jäätelö", en: "Ice cream", es: "Helado", icon: "🍦", polys: [
    T([0, 2], [4, 2], [2, 0]), Sq(0, 2), Sq(2, 2), T([0, 4], [4, 4], [2, 6])] },
  { id: "sydan", fi: "Sydän", en: "Heart", es: "Corazón", icon: "❤️", polys: [
    T([0, 2], [4, 2], [2, 0]), T([4, 2], [8, 2], [6, 0]), T([0, 2], [4, 2], [4, 6]), T([4, 2], [8, 2], [4, 6])] },
  { id: "perhonen", fi: "Perhonen", en: "Butterfly", es: "Mariposa", icon: "🦋", polys: [
    T([0, 0], [0, 4], [4, 4]), T([8, 0], [8, 4], [4, 4]), T([2, 4], [4, 4], [2, 6]), T([4, 4], [6, 4], [6, 6])] },
  { id: "kuusi", fi: "Kuusi", en: "Fir tree", es: "Abeto", icon: "🌲", polys: [
    T([2, 2], [6, 2], [4, 0]), T([0, 6], [4, 6], [4, 2]), T([4, 2], [4, 6], [8, 6]), Sq(3, 6)] },
  { id: "kilpikonna", fi: "Kilpikonna", en: "Turtle", es: "Tortuga", icon: "🐢", polys: [
    T([2, 6], [6, 6], [6, 2]), T([6, 2], [6, 6], [10, 6]), T([10, 6], [12, 6], [12, 4]),
    T([2, 6], [4, 6], [2, 8]), T([8, 6], [10, 6], [10, 8]), T([0, 6], [2, 6], [2, 4])] },
  { id: "raketti", fi: "Raketti", en: "Rocket", es: "Cohete", icon: "🚀", polys: [
    T([2, 2], [6, 2], [4, 0]), T([2, 2], [6, 2], [2, 6]), T([6, 2], [6, 6], [2, 6]),
    T([2, 6], [2, 8], [0, 8]), T([6, 6], [6, 8], [8, 8]), T([2, 6], [6, 6], [4, 8])] },
  { id: "robotti", fi: "Robotti", en: "Robot", es: "Robot", icon: "🤖", polys: [
    Sq(3, 0), T([2, 2], [6, 2], [2, 6]), T([6, 2], [6, 6], [2, 6]),
    T([2, 2], [2, 4], [0, 4]), T([6, 2], [6, 4], [8, 4]), T([2, 6], [4, 6], [2, 8]), T([4, 6], [6, 6], [6, 8])] },
  { id: "kissa", fi: "Kissa", en: "Cat", es: "Gato", icon: "🐱", polys: [
    T([2, 2], [2, 0], [4, 2]), T([6, 2], [6, 0], [4, 2]), Sq(2, 2), Sq(4, 2),
    T([4, 4], [4, 8], [0, 8]), T([4, 4], [4, 8], [8, 8]), [[10, 6], [12, 6], [10, 8], [8, 8]]] },
];

// --- geometry ---------------------------------------------------------------

export function area(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a) / 2;
}

export function bbox(ps: Poly[]): number[] {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of ps) for (const v of p) { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); }
  return [x0, y0, x1, y1];
}

export function inside(p: Poly, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// a piece's corners: its shape flipped (mirror left-right), turned `rot`
// quarter turns clockwise around the shape's centre, then moved so that the
// centre is at (cx, cy)
export function place(kind: string, cx: number, cy: number, rot: number, flip: boolean): Poly {
  const s = SHAPES[kind];
  const c = centre(s);
  const r = ((rot % 4) + 4) % 4;
  return s.map((v) => {
    let x = v[0] - c[0], y = v[1] - c[1];
    if (flip) x = -x;
    for (let i = 0; i < r; i++) { const nx = -y; y = x; x = nx; }
    return [cx + x, cy + y];
  });
}

export function centre(p: Poly): Pt {
  let x = 0, y = 0;
  for (const v of p) { x += v[0]; y += v[1]; }
  return [x / p.length, y / p.length];
}

// how far apart two polygons' corners are as sets (the worst corner of
// either one to its nearest corner on the other); 0 = the same polygon
export function cornerGap(a: Poly, b: Poly): number {
  if (a.length !== b.length) return 1e9;
  let worst = 0;
  for (const u of a) {
    let best = 1e9;
    for (const v of b) best = Math.min(best, Math.sqrt((u[0] - v[0]) * (u[0] - v[0]) + (u[1] - v[1]) * (u[1] - v[1])));
    worst = Math.max(worst, best);
  }
  return worst;
}

// which piece a figure's polygon is, and how it lies: the kind, centre,
// quarter turns and flip that make `place` give the same polygon
export function identify(p: Poly): { kind: string; cx: number; cy: number; rot: number; flip: boolean } | null {
  const c = centre(p);
  for (const k of KINDS) {
    if (SHAPES[k].length !== p.length || Math.abs(area(SHAPES[k]) - area(p)) > 1e-6) continue;
    for (let f = 0; f < 2; f++) for (let r = 0; r < 4; r++) {
      if (cornerGap(place(k, c[0], c[1], r, f === 1), p) < 1e-6) return { kind: k, cx: c[0], cy: c[1], rot: r, flip: f === 1 };
    }
  }
  return null;
}

// How well the pieces cover the shadow, sampled on a grid of `step` units:
// cover = share of the shadow under some piece, spill = piece area outside
// the shadow as a share of the shadow's area.
export function coverage(shadow: Poly[], pieces: Poly[], step: number): { cover: number; spill: number } {
  const b = bbox(shadow.concat(pieces));
  let inS = 0, covered = 0, spill = 0;
  for (let y = b[1] + step / 2; y < b[3]; y += step) for (let x = b[0] + step / 2; x < b[2]; x += step) {
    let s = false, p = false;
    for (const q of shadow) if (inside(q, x, y)) { s = true; break; }
    for (const q of pieces) if (inside(q, x, y)) { p = true; break; }
    if (s) { inS++; if (p) covered++; } else if (p) spill++;
  }
  return { cover: inS ? covered / inS : 0, spill: inS ? spill / inS : 1 };
}

// Pairs every piece with a slot of the figure (pieces of one kind can swap)
// so that each lies within `tol` units of its slot, corner for corner.
// Returns the slot index of each piece, or null.
export function matchSlots(slots: Poly[], pieces: Poly[], tol: number): number[] | null {
  const used = slots.map(() => false);
  const got = pieces.map(() => -1);
  function go(i: number): boolean {
    if (i === pieces.length) return true;
    for (let j = 0; j < slots.length; j++) {
      if (used[j] || cornerGap(pieces[i], slots[j]) > tol) continue;
      used[j] = true; got[i] = j;
      if (go(i + 1)) return true;
      used[j] = false;
    }
    return false;
  }
  return pieces.length === slots.length && go(0) ? got : null;
}

// The game's own rule, "about right is right": every piece near its slot
// (TOL units, a small triangle's leg is 2), or the pieces fill the shadow
// some other way (two big triangles make the square either way round).
export const TOL = 0.9, COVER_OK = 0.96, SPILL_OK = 0.04;
// the area of piece p that lies outside the shadow, sampled
function outside(shadow: Poly[], p: Poly, step: number): number {
  const b = bbox([p]);
  let n = 0;
  for (let y = b[1] + step / 2; y < b[3]; y += step) for (let x = b[0] + step / 2; x < b[2]; x += step) {
    if (!inside(p, x, y)) continue;
    let s = false;
    for (const q of shadow) if (inside(q, x, y)) { s = true; break; }
    if (!s) n++;
  }
  return n * step * step;
}
export function solved(slots: Poly[], pieces: Poly[]): boolean {
  if (matchSlots(slots, pieces, TOL)) return true;
  const c = coverage(slots, pieces, 0.2);
  if (c.cover < COVER_OK || c.spill > SPILL_OK) return false;
  // and no piece sticks out much on its own (a small one turned wrong would
  // hardly show in the totals)
  for (const p of pieces) if (outside(slots, p, 0.2) > 0.08 * area(p)) return false;
  return true;
}

// Where a dropped piece settles: on a slot of its own kind and turn if one is
// within TOL, else with its corners on the nearest whole-number points (if
// that is a short move), else where it was. Returns the new centre.
export function settle(slots: Poly[], kinds: string[], kind: string, cx: number, cy: number, rot: number, flip: boolean): Pt {
  const p = place(kind, cx, cy, rot, flip);
  let best = -1, bg = TOL;
  for (let j = 0; j < slots.length; j++) {
    if (kinds[j] !== kind) continue;
    const g = cornerGap(p, slots[j]);
    if (g <= bg) { bg = g; best = j; }
  }
  if (best >= 0) { const c = centre(slots[best]); return [c[0], c[1]]; }
  const dx = Math.round(p[0][0]) - p[0][0], dy = Math.round(p[0][1]) - p[0][1];
  if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) return [cx + dx, cy + dy];
  return [cx, cy];
}
