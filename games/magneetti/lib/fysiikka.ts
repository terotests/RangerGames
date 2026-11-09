// Magneettipaja's physics: a small 2D rigid-body engine with magnets.
//
// A body is a rigid set of circles (position, angle, velocity, spin) that
// collides with the board's walls (rectangles), pegs (circles) and the other
// bodies, with restitution and friction impulses at the contact point, so a
// bar magnet hit at one end turns. The table's friction is a damping of the
// velocity and the spin.
//
// Magnetism: a pole is a point charge, q > 0 red (north), q < 0 blue
// (south). Two poles push (same colour) or pull (different colours) with a
// softened 1/r² force. Iron and steel (`iron` > 0) have no poles of their
// own; a pole near them magnetises them, so they are pulled towards either
// colour (a softened 1/r³ force, stronger the stronger the pole). Non-
// magnetic bodies feel nothing. A body's poles and iron sit at points of the
// body, so the forces also turn it (a bar magnet turns its blue end towards
// a red pole). The hand's magnet works from under the board: it is a pole,
// not a body, and it does not collide. A magnet pulling a body down onto the
// board also presses it against the board, so the pull adds friction: a held
// steel ball follows the magnet instead of circling it.

export type Circle = { x: number; y: number; r: number };
export type Pole = { x: number; y: number; q: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type Body = {
  id: number;
  kind: string;
  x: number; y: number; a: number;
  vx: number; vy: number; w: number;
  inv: number; invI: number;
  shapes: Circle[];
  poles: Pole[];
  iron: number;          // how strongly a pole magnetises it (0 = not magnetic)
  drag: number;          // table friction, 1/s
  spinDrag: number;
  e: number;             // restitution
  mu: number;            // friction at contacts
  fixed: boolean;        // fastened to the board (still a magnet, never moves)
  gone: boolean;         // taken out of the world (collected)
  fx: number; fy: number; t: number;  // force and torque of this step
  hold: number;          // the extra friction of a magnet's pull this step, 1/s
  pull: number;          // how strongly the hand pulls it now (for sounds and hints)
  push: number;          // how strongly the hand pushes it now
  hitSpeed: number;      // the hardest impact this frame
};

export type Hand = { x: number; y: number; q: number; on: boolean };

export type World = {
  bodies: Body[];
  walls: Rect[];
  pegs: Circle[];
  hand: Hand;
};

// strengths, tuned for a 360 px wide board: the hand holds a steel ball from
// about 120 px and a ball can follow it at about 200 px/s
export const SOFT = 28;            // softening: no infinite force at a pole
const SOFT2 = SOFT * SOFT;
export const K_POLE = 3.2e6;       // pole - pole
export const K_IRON = 1.6e8;       // pole - iron
const RANGE = 260;                 // beyond this no force (keeps far bodies still)
const HOLD = 0.0045;               // pull → extra friction
const HOLD_MAX = 30;
const MAX_SPEED = 1100;
const STEP = 1 / 240;

let nextId = 1;

export function makeBody(kind: string, x: number, y: number, a: number, mass: number, shapes: Circle[]): Body {
  // moment of inertia of the circles about the centre (each a disc)
  let I = 0;
  const m = mass / shapes.length;
  for (const s of shapes) I += m * (s.r * s.r / 2 + s.x * s.x + s.y * s.y);
  return {
    id: nextId++, kind, x, y, a, vx: 0, vy: 0, w: 0,
    inv: 1 / mass, invI: 1 / I, shapes, poles: [], iron: 0,
    drag: 2.5, spinDrag: 3, e: 0.35, mu: 0.3, fixed: false, gone: false,
    fx: 0, fy: 0, t: 0, hold: 0, pull: 0, push: 0, hitSpeed: 0
  };
}

export function fasten(b: Body): Body {
  b.fixed = true;
  b.inv = 0;
  b.invI = 0;
  return b;
}

export function newWorld(): World {
  return { bodies: [], walls: [], pegs: [], hand: { x: 0, y: 0, q: 1, on: false } };
}

// a body-local point in the world
export function toWorld(b: Body, lx: number, ly: number): number[] {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  return [b.x + lx * c - ly * s, b.y + lx * s + ly * c];
}

function addForce(b: Body, px: number, py: number, fx: number, fy: number) {
  if (b.fixed) return;
  b.fx += fx;
  b.fy += fy;
  b.t += (px - b.x) * fy - (py - b.y) * fx;
}

// the force on a pole q1 at (x1, y1) from a pole q2 at (x2, y2)
function poleForce(x1: number, y1: number, q1: number, x2: number, y2: number, q2: number): number[] {
  const dx = x1 - x2, dy = y1 - y2;
  const r2 = dx * dx + dy * dy;
  if (r2 > RANGE * RANGE) return [0, 0];
  const d = r2 + SOFT2;
  const k = K_POLE * q1 * q2 / (d * Math.sqrt(d)) * fade(r2);
  return [dx * k, dy * k];
}

// the force on iron (strength chi) at (x1, y1) from a pole q at (x2, y2): always towards the pole
function ironForce(x1: number, y1: number, chi: number, x2: number, y2: number, q: number): number[] {
  const dx = x1 - x2, dy = y1 - y2;
  const r2 = dx * dx + dy * dy;
  if (r2 > RANGE * RANGE) return [0, 0];
  const d = r2 + SOFT2;
  const k = -K_IRON * chi * q * q / (d * d) * fade(r2);
  return [dx * k, dy * k];
}

// the force goes smoothly to nothing at RANGE
function fade(r2: number): number {
  const u = r2 / (RANGE * RANGE);
  return u < 0.5 ? 1 : 1 - (u - 0.5) * 2;
}

// the field's strength (for drawing): how strongly a pole q at (px, py) acts at a distance r
export function strengthAt(r: number): number {
  const d = r * r + SOFT2;
  return SOFT2 / d;
}

function forces(wd: World) {
  const bs = wd.bodies;
  for (const b of bs) { b.fx = 0; b.fy = 0; b.t = 0; b.hold = 0; b.pull = 0; b.push = 0; }
  const h = wd.hand;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.gone) continue;
    // the hand's pole
    if (h.on && !b.fixed) {
      let hx = 0, hy = 0;
      for (const p of b.poles) {
        const w = toWorld(b, p.x, p.y);
        const f = poleForce(w[0], w[1], p.q, h.x, h.y, h.q);
        addForce(b, w[0], w[1], f[0], f[1]);
        hx += f[0]; hy += f[1];
      }
      if (b.iron > 0) {
        const n = b.shapes.length;
        for (const s of b.shapes) {
          const w = toWorld(b, s.x, s.y);
          const f = ironForce(w[0], w[1], b.iron / n, h.x, h.y, h.q);
          addForce(b, w[0], w[1], f[0], f[1]);
          hx += f[0]; hy += f[1];
        }
      }
      const mag = Math.sqrt(hx * hx + hy * hy) * b.inv;
      const towards = (h.x - b.x) * hx + (h.y - b.y) * hy > 0;
      if (towards) { b.pull = mag; b.hold += Math.min(HOLD_MAX, mag * HOLD); } else b.push = mag;
    }
    // the other bodies' poles and iron
    for (let j = i + 1; j < bs.length; j++) {
      const c = bs[j];
      if (c.gone || (b.fixed && c.fixed)) continue;
      if (b.poles.length === 0 && c.poles.length === 0) continue;
      for (const p of b.poles) {
        const pw = toWorld(b, p.x, p.y);
        for (const o of c.poles) {
          const ow = toWorld(c, o.x, o.y);
          const f = poleForce(pw[0], pw[1], p.q, ow[0], ow[1], o.q);
          addForce(b, pw[0], pw[1], f[0], f[1]);
          addForce(c, ow[0], ow[1], -f[0], -f[1]);
        }
        if (c.iron > 0) ironPair(c, b, pw, p.q);
      }
      if (b.iron > 0) for (const o of c.poles) ironPair(b, c, toWorld(c, o.x, o.y), o.q);
    }
  }
}

// a magnet's pole (at pw, on body m) magnetises the iron body fe: both are pulled
function ironPair(fe: Body, m: Body, pw: number[], q: number) {
  const n = fe.shapes.length;
  let tx = 0, ty = 0;
  for (const s of fe.shapes) {
    const w = toWorld(fe, s.x, s.y);
    const f = ironForce(w[0], w[1], fe.iron / n, pw[0], pw[1], q);
    addForce(fe, w[0], w[1], f[0], f[1]);
    addForce(m, pw[0], pw[1], -f[0], -f[1]);
    tx += f[0]; ty += f[1];
  }
  const mag = Math.sqrt(tx * tx + ty * ty);
  fe.hold += Math.min(HOLD_MAX, mag * fe.inv * HOLD);
  if (!m.fixed) m.hold += Math.min(HOLD_MAX, mag * m.inv * HOLD);
}

function integrate(wd: World, dt: number) {
  for (const b of wd.bodies) {
    if (b.gone || b.fixed) continue;
    b.vx += b.fx * b.inv * dt;
    b.vy += b.fy * b.inv * dt;
    b.w += b.t * b.invI * dt;
    const k = Math.exp(-(b.drag + b.hold) * dt);
    b.vx *= k; b.vy *= k;
    b.w *= Math.exp(-(b.spinDrag + b.hold) * dt);
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
    if (b.w > 30) b.w = 30; else if (b.w < -30) b.w = -30;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.w * dt;
  }
}

// an impulse at the contact point (px, py), normal (nx, ny) pointing from b2 to b1
function resolve(b1: Body, b2: Body | null, px: number, py: number, nx: number, ny: number, pen: number) {
  const r1x = px - b1.x, r1y = py - b1.y;
  let vx = b1.vx - b1.w * r1y, vy = b1.vy + b1.w * r1x;
  let r2x = 0, r2y = 0, inv2 = 0, invI2 = 0;
  if (b2) {
    r2x = px - b2.x; r2y = py - b2.y;
    vx -= b2.vx - b2.w * r2y;
    vy -= b2.vy + b2.w * r2x;
    inv2 = b2.inv; invI2 = b2.invI;
  }
  const invSum = b1.inv + inv2;
  if (invSum === 0) return;
  // push apart
  const corr = Math.max(0, pen - 0.3) * 0.8 / invSum;
  b1.x += nx * corr * b1.inv; b1.y += ny * corr * b1.inv;
  if (b2) { b2.x -= nx * corr * inv2; b2.y -= ny * corr * inv2; }
  const vn = vx * nx + vy * ny;
  if (vn >= 0) return;
  const rn1 = r1x * ny - r1y * nx, rn2 = r2x * ny - r2y * nx;
  const e = -vn < 30 ? 0 : (b2 ? Math.min(b1.e, b2.e) : b1.e);
  const den = invSum + b1.invI * rn1 * rn1 + invI2 * rn2 * rn2;
  const j = -(1 + e) * vn / den;
  applyImpulse(b1, b2, r1x, r1y, r2x, r2y, nx * j, ny * j);
  if (-vn > b1.hitSpeed) b1.hitSpeed = -vn;
  if (b2 && -vn > b2.hitSpeed) b2.hitSpeed = -vn;
  // friction along the contact
  let tx = vx - vn * nx, ty = vy - vn * ny;
  const tl = Math.sqrt(tx * tx + ty * ty);
  if (tl < 1e-6) return;
  tx /= tl; ty /= tl;
  const rt1 = r1x * ty - r1y * tx, rt2 = r2x * ty - r2y * tx;
  const dent = invSum + b1.invI * rt1 * rt1 + invI2 * rt2 * rt2;
  let jt = -tl / dent;
  const mu = b2 ? (b1.mu + b2.mu) / 2 : b1.mu;
  if (jt < -mu * j) jt = -mu * j;
  applyImpulse(b1, b2, r1x, r1y, r2x, r2y, tx * jt, ty * jt);
}

function applyImpulse(b1: Body, b2: Body | null, r1x: number, r1y: number, r2x: number, r2y: number, jx: number, jy: number) {
  b1.vx += jx * b1.inv; b1.vy += jy * b1.inv;
  b1.w += (r1x * jy - r1y * jx) * b1.invI;
  if (b2) {
    b2.vx -= jx * b2.inv; b2.vy -= jy * b2.inv;
    b2.w -= (r2x * jy - r2y * jx) * b2.invI;
  }
}

function collide(wd: World) {
  const bs = wd.bodies;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.gone) continue;
    if (!b.fixed) {
      for (const s of b.shapes) {
        const c = toWorld(b, s.x, s.y);
        for (const r of wd.walls) circleRect(b, c[0], c[1], s.r, r);
        for (const p of wd.pegs) {
          const dx = c[0] - p.x, dy = c[1] - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < s.r + p.r && d > 1e-6) resolve(b, null, p.x + dx / d * p.r, p.y + dy / d * p.r, dx / d, dy / d, s.r + p.r - d);
        }
      }
    }
    for (let j = i + 1; j < bs.length; j++) {
      const o = bs[j];
      if (o.gone || (b.fixed && o.fixed)) continue;
      // bounding check first
      const dx0 = b.x - o.x, dy0 = b.y - o.y;
      if (dx0 * dx0 + dy0 * dy0 > 120 * 120) continue;
      for (const s of b.shapes) {
        const c = toWorld(b, s.x, s.y);
        for (const t of o.shapes) {
          const e = toWorld(o, t.x, t.y);
          const dx = c[0] - e[0], dy = c[1] - e[1];
          const d = Math.sqrt(dx * dx + dy * dy);
          const rr = s.r + t.r;
          if (d < rr && d > 1e-6) {
            const nx = dx / d, ny = dy / d;
            resolve(b, o, e[0] + nx * t.r, e[1] + ny * t.r, nx, ny, rr - d);
          }
        }
      }
    }
  }
}

function circleRect(b: Body, cx: number, cy: number, r: number, w: Rect) {
  const qx = cx < w.x ? w.x : cx > w.x + w.w ? w.x + w.w : cx;
  const qy = cy < w.y ? w.y : cy > w.y + w.h ? w.y + w.h : cy;
  let dx = cx - qx, dy = cy - qy;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d >= r) return;
  if (d > 1e-6) { resolve(b, null, qx, qy, dx / d, dy / d, r - d); return; }
  // the centre is inside the rectangle: out the nearest side
  const l = cx - w.x, rt = w.x + w.w - cx, t = cy - w.y, bt = w.y + w.h - cy;
  const m = Math.min(l, rt, t, bt);
  if (m === l) resolve(b, null, w.x, cy, -1, 0, l + r);
  else if (m === rt) resolve(b, null, w.x + w.w, cy, 1, 0, rt + r);
  else if (m === t) resolve(b, null, cx, w.y, 0, -1, t + r);
  else resolve(b, null, cx, w.y + w.h, 0, 1, bt + r);
}

// advances the world by dt seconds in small fixed steps
export function step(wd: World, dt: number) {
  for (const b of wd.bodies) b.hitSpeed = 0;
  let n = Math.ceil(Math.min(dt, 1 / 20) / STEP);
  if (n < 1) n = 1;
  const h = Math.min(dt, 1 / 20) / n;
  for (let i = 0; i < n; i++) {
    forces(wd);
    integrate(wd, h);
    collide(wd);
    collide(wd);
  }
}

export function speed(b: Body): number {
  return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
}
