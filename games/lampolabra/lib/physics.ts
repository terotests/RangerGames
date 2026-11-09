// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A small 2D rigid-body engine for boxes: oriented boxes collide (separating
// axes, then the incident edge clipped against the reference face, so a box
// resting on another gets two contact points), contacts keep their impulses
// from frame to frame (warm starting, matched by the edges that made the
// point), and sequential impulses solve them with friction. That is the
// recipe of Erin Catto's Box2D Lite, written again here for the game
// engine: enough for towers that stand still and fall over believably.
//
// Units are the screen's: pixels, seconds, y grows downwards. Bodies sleep
// when they have been still for a while; anything that changes the world
// (a body added, removed, resized, pushed) wakes them with world.wake().
//
// A body with mass 0 is static; one with `kinematic` set moves with the
// velocity the game gives it and pushes the others without being pushed.

export type Body = {
  id: number;
  x: number; y: number; a: number;      // centre and angle (radians)
  vx: number; vy: number; w: number;    // velocity and angular velocity
  hw: number; hh: number;               // half width and half height
  mass: number; invM: number; I: number; invI: number;
  friction: number;
  kinematic: boolean;
  fx: number; fy: number; torque: number;
  still: number;                        // seconds spent nearly still
  asleep: boolean;
  dead: boolean;
  data: any;                            // the game's own object
};

type Contact = {
  x: number; y: number;                 // world position
  nx: number; ny: number;               // normal from body a to body b
  sep: number;
  key: number;                          // the edges that made the point
  pn: number; pt: number;               // accumulated impulses
  r1x: number; r1y: number; r2x: number; r2y: number;
  mn: number; mt: number; bias: number;
};

export type Arbiter = { a: Body; b: Body; cs: Contact[]; friction: number; seen: number };

export type World = {
  bodies: Body[];
  arbiters: { [k: string]: Arbiter };
  gravity: number;
  iterations: number;
  nextId: number;
  stamp: number;
  sleepOk: boolean;
};

export function newWorld(gravity: number): World {
  return { bodies: [], arbiters: {}, gravity, iterations: 8, nextId: 1, stamp: 0, sleepOk: true };
}

// density: mass per square pixel; 0 = static
export function addBox(world: World, x: number, y: number, w: number, h: number, density: number, data: any): Body {
  const b: Body = {
    id: world.nextId++, x, y, a: 0, vx: 0, vy: 0, w: 0, hw: w / 2, hh: h / 2,
    mass: 0, invM: 0, I: 0, invI: 0, friction: 0.5, kinematic: false,
    fx: 0, fy: 0, torque: 0, still: 0, asleep: false, dead: false, data,
  };
  setMass(b, density);
  world.bodies.push(b);
  return b;
}

export function setMass(b: Body, density: number) {
  if (density <= 0) { b.mass = 0; b.invM = 0; b.I = 0; b.invI = 0; return; }
  const w = b.hw * 2, h = b.hh * 2;
  b.mass = density * w * h;
  b.invM = 1 / b.mass;
  b.I = b.mass * (w * w + h * h) / 12;
  b.invI = 1 / b.I;
}

// a new size for a body (melting), keeping its density
export function resize(world: World, b: Body, w: number, h: number) {
  const density = b.mass > 0 ? b.mass / (b.hw * b.hh * 4) : 0;
  b.hw = w / 2; b.hh = h / 2;
  if (density > 0) setMass(b, density);
  wake(world);
}

export function remove(world: World, b: Body) {
  b.dead = true;
  wake(world);
}

export function wake(world: World) {
  for (const b of world.bodies) { b.asleep = false; b.still = 0; }
}

function key(a: Body, b: Body): string { return a.id < b.id ? a.id + "_" + b.id : b.id + "_" + a.id; }

// ---- collision -------------------------------------------------------------

// edge numbers of a box, for matching contact points between frames
const NO_EDGE = 0, EDGE1 = 1, EDGE2 = 2, EDGE3 = 3, EDGE4 = 4;

type CV = { x: number; y: number; in1: number; out1: number; in2: number; out2: number };

function cv(x: number, y: number, in2: number, out2: number): CV { return { x, y, in1: NO_EDGE, out1: NO_EDGE, in2, out2 }; }

function clip(vin: CV[], nx: number, ny: number, offset: number, edge: number): CV[] {
  const out: CV[] = [];
  const d0 = nx * vin[0].x + ny * vin[0].y - offset;
  const d1 = nx * vin[1].x + ny * vin[1].y - offset;
  if (d0 <= 0) out.push(vin[0]);
  if (d1 <= 0) out.push(vin[1]);
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    const p: CV = { x: vin[0].x + t * (vin[1].x - vin[0].x), y: vin[0].y + t * (vin[1].y - vin[0].y), in1: 0, out1: 0, in2: 0, out2: 0 };
    if (d0 > 0) { p.in1 = edge; p.out1 = vin[0].out1; p.in2 = NO_EDGE; p.out2 = vin[0].out2; }
    else { p.in1 = vin[1].in1; p.out1 = edge; p.in2 = vin[1].in2; p.out2 = NO_EDGE; }
    out.push(p);
  }
  return out;
}

// the edge of box (hx, hy, pos, rotation c/s) that faces most against n
function incident(hx: number, hy: number, px: number, py: number, c: number, s: number, nx: number, ny: number): CV[] {
  // n in the box's frame, negated
  const lx = -(c * nx + s * ny), ly = -(-s * nx + c * ny);
  let v: CV[];
  if (Math.abs(lx) > Math.abs(ly)) {
    if (lx > 0) v = [cv(hx, -hy, EDGE3, EDGE4), cv(hx, hy, EDGE4, EDGE1)];
    else v = [cv(-hx, hy, EDGE1, EDGE2), cv(-hx, -hy, EDGE2, EDGE3)];
  } else {
    if (ly > 0) v = [cv(hx, hy, EDGE4, EDGE1), cv(-hx, hy, EDGE1, EDGE2)];
    else v = [cv(-hx, -hy, EDGE2, EDGE3), cv(hx, -hy, EDGE3, EDGE4)];
  }
  for (const p of v) {
    const x = px + c * p.x - s * p.y, y = py + s * p.x + c * p.y;
    p.x = x; p.y = y;
  }
  return v;
}

function collide(A: Body, B: Body): Contact[] {
  const cA = Math.cos(A.a), sA = Math.sin(A.a), cB = Math.cos(B.a), sB = Math.sin(B.a);
  // rotation matrices: columns (c, s) and (-s, c)
  const dpx = B.x - A.x, dpy = B.y - A.y;
  const dAx = cA * dpx + sA * dpy, dAy = -sA * dpx + cA * dpy;
  const dBx = cB * dpx + sB * dpy, dBy = -sB * dpx + cB * dpy;
  // C = RotA^T * RotB
  const c11 = cA * cB + sA * sB, c12 = -cA * sB + sA * cB;
  const c21 = -sA * cB + cA * sB, c22 = sA * sB + cA * cB;
  const a11 = Math.abs(c11), a12 = Math.abs(c12), a21 = Math.abs(c21), a22 = Math.abs(c22);
  const faceAx = Math.abs(dAx) - A.hw - (a11 * B.hw + a12 * B.hh);
  const faceAy = Math.abs(dAy) - A.hh - (a21 * B.hw + a22 * B.hh);
  if (faceAx > 0 || faceAy > 0) return [];
  const faceBx = Math.abs(dBx) - (a11 * A.hw + a21 * A.hh) - B.hw;
  const faceBy = Math.abs(dBy) - (a12 * A.hw + a22 * A.hh) - B.hh;
  if (faceBx > 0 || faceBy > 0) return [];

  let axis = 0;
  let sep = faceAx;
  let nx = dAx > 0 ? cA : -cA, ny = dAx > 0 ? sA : -sA;
  const rel = 0.95, abs = 0.01;
  if (faceAy > rel * sep + abs * A.hh) { axis = 1; sep = faceAy; nx = dAy > 0 ? -sA : sA; ny = dAy > 0 ? cA : -cA; }
  if (faceBx > rel * sep + abs * B.hw) { axis = 2; sep = faceBx; nx = dBx > 0 ? cB : -cB; ny = dBx > 0 ? sB : -sB; }
  if (faceBy > rel * sep + abs * B.hh) { axis = 3; sep = faceBy; nx = dBy > 0 ? -sB : sB; ny = dBy > 0 ? cB : -cB; }

  let fnx = 0, fny = 0, front = 0, snx = 0, sny = 0, negSide = 0, posSide = 0, negEdge = 0, posEdge = 0;
  let inc: CV[];
  if (axis === 0) {
    fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + A.hw;
    snx = -sA; sny = cA; const side = A.x * snx + A.y * sny;
    negSide = -side + A.hh; posSide = side + A.hh; negEdge = EDGE3; posEdge = EDGE1;
    inc = incident(B.hw, B.hh, B.x, B.y, cB, sB, fnx, fny);
  } else if (axis === 1) {
    fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + A.hh;
    snx = cA; sny = sA; const side = A.x * snx + A.y * sny;
    negSide = -side + A.hw; posSide = side + A.hw; negEdge = EDGE2; posEdge = EDGE4;
    inc = incident(B.hw, B.hh, B.x, B.y, cB, sB, fnx, fny);
  } else if (axis === 2) {
    fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + B.hw;
    snx = -sB; sny = cB; const side = B.x * snx + B.y * sny;
    negSide = -side + B.hh; posSide = side + B.hh; negEdge = EDGE3; posEdge = EDGE1;
    inc = incident(A.hw, A.hh, A.x, A.y, cA, sA, fnx, fny);
  } else {
    fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + B.hh;
    snx = cB; sny = sB; const side = B.x * snx + B.y * sny;
    negSide = -side + B.hw; posSide = side + B.hw; negEdge = EDGE2; posEdge = EDGE4;
    inc = incident(A.hw, A.hh, A.x, A.y, cA, sA, fnx, fny);
  }
  const p1 = clip(inc, -snx, -sny, negSide, negEdge);
  if (p1.length < 2) return [];
  const p2 = clip(p1, snx, sny, posSide, posEdge);
  if (p2.length < 2) return [];
  const out: Contact[] = [];
  for (let i = 0; i < 2; i++) {
    const p = p2[i];
    const s = fnx * p.x + fny * p.y - front;
    if (s > 0) continue;
    let in1 = p.in1, out1 = p.out1, in2 = p.in2, out2 = p.out2;
    if (axis >= 2) { const t1 = in1; in1 = in2; in2 = t1; const t2 = out1; out1 = out2; out2 = t2; }
    out.push({
      x: p.x - s * fnx, y: p.y - s * fny, nx, ny, sep: s,
      key: in1 + out1 * 8 + in2 * 64 + out2 * 512,
      pn: 0, pt: 0, r1x: 0, r1y: 0, r2x: 0, r2y: 0, mn: 0, mt: 0, bias: 0,
    });
  }
  return out;
}

// ---- stepping --------------------------------------------------------------

function overlapAabb(A: Body, B: Body): boolean {
  const ca = Math.abs(Math.cos(A.a)), sa = Math.abs(Math.sin(A.a));
  const cb = Math.abs(Math.cos(B.a)), sb = Math.abs(Math.sin(B.a));
  const ax = ca * A.hw + sa * A.hh + 1, ay = sa * A.hw + ca * A.hh + 1;
  const bx = cb * B.hw + sb * B.hh + 1, by = sb * B.hw + cb * B.hh + 1;
  return Math.abs(A.x - B.x) <= ax + bx && Math.abs(A.y - B.y) <= ay + by;
}

function movable(b: Body): boolean { return b.invM > 0; }

const SLOP = 0.6;       // pixels a box may sink into another before it is pushed out
const BIAS = 0.2;
const MAX_BIAS = 240;   // pixels per second

export function step(world: World, dt: number) {
  world.stamp++;
  const stamp = world.stamp;
  const inv = dt > 0 ? 1 / dt : 0;
  world.bodies = world.bodies.filter((b) => !b.dead);
  const bs = world.bodies;

  // contacts: every pair that touches and has someone awake to move
  for (let i = 0; i < bs.length; i++) {
    const A = bs[i];
    for (let j = i + 1; j < bs.length; j++) {
      const B = bs[j];
      if (!movable(A) && !movable(B)) continue;
      const aStill = A.kinematic ? false : !movable(A) || A.asleep;
      const bStill = B.kinematic ? false : !movable(B) || B.asleep;
      if (aStill && bStill) continue;
      if (!overlapAabb(A, B)) continue;
      const cs = collide(A, B);
      if (!cs.length) continue;
      // a sleeper touched by something awake wakes up (the whole pile
      // follows over the next steps, so nothing rests on a sleeper)
      if (A.asleep && !bStill) { A.asleep = false; A.still = 0; }
      if (B.asleep && !aStill) { B.asleep = false; B.still = 0; }
      const k = key(A, B);
      const old = world.arbiters[k];
      const first = A.id < B.id ? A : B, second = A.id < B.id ? B : A;
      // collide() ran with (A, B); the arbiter keeps the lower id first
      if (first !== A) for (const c of cs) { c.nx = -c.nx; c.ny = -c.ny; }
      if (old) {
        for (const c of cs) {
          for (const o of old.cs) if (o.key === c.key) { c.pn = o.pn; c.pt = o.pt; break; }
        }
        old.cs = cs; old.seen = stamp;
      } else {
        world.arbiters[k] = { a: first, b: second, cs, friction: Math.sqrt(first.friction * second.friction), seen: stamp };
      }
    }
  }
  for (const k in world.arbiters) {
    const ar = world.arbiters[k];
    if (ar.seen !== stamp || ar.a.dead || ar.b.dead) delete world.arbiters[k];
  }

  // forces
  for (const b of bs) {
    if (!movable(b) || b.asleep) { b.fx = 0; b.fy = 0; b.torque = 0; continue; }
    b.vx += dt * b.invM * b.fx;
    b.vy += dt * (world.gravity + b.invM * b.fy);
    b.w += dt * b.invI * b.torque;
    b.fx = 0; b.fy = 0; b.torque = 0;
  }

  const ars: Arbiter[] = [];
  for (const k in world.arbiters) ars.push(world.arbiters[k]);

  // pre-step: effective masses, bias, warm start
  for (const ar of ars) {
    const A = ar.a, B = ar.b;
    for (const c of ar.cs) {
      c.r1x = c.x - A.x; c.r1y = c.y - A.y;
      c.r2x = c.x - B.x; c.r2y = c.y - B.y;
      const rn1 = c.r1x * c.nx + c.r1y * c.ny, rn2 = c.r2x * c.nx + c.r2y * c.ny;
      const kn = A.invM + B.invM + A.invI * (c.r1x * c.r1x + c.r1y * c.r1y - rn1 * rn1) + B.invI * (c.r2x * c.r2x + c.r2y * c.r2y - rn2 * rn2);
      c.mn = kn > 0 ? 1 / kn : 0;
      const tx = c.ny, ty = -c.nx;
      const rt1 = c.r1x * tx + c.r1y * ty, rt2 = c.r2x * tx + c.r2y * ty;
      const kt = A.invM + B.invM + A.invI * (c.r1x * c.r1x + c.r1y * c.r1y - rt1 * rt1) + B.invI * (c.r2x * c.r2x + c.r2y * c.r2y - rt2 * rt2);
      c.mt = kt > 0 ? 1 / kt : 0;
      c.bias = Math.min(MAX_BIAS, -BIAS * inv * Math.min(0, c.sep + SLOP));
      const px = c.pn * c.nx + c.pt * tx, py = c.pn * c.ny + c.pt * ty;
      A.vx -= A.invM * px; A.vy -= A.invM * py; A.w -= A.invI * (c.r1x * py - c.r1y * px);
      B.vx += B.invM * px; B.vy += B.invM * py; B.w += B.invI * (c.r2x * py - c.r2y * px);
    }
  }

  for (let it = 0; it < world.iterations; it++) {
    for (const ar of ars) {
      const A = ar.a, B = ar.b;
      for (const c of ar.cs) {
        let dvx = B.vx - B.w * c.r2y - A.vx + A.w * c.r1y;
        let dvy = B.vy + B.w * c.r2x - A.vy - A.w * c.r1x;
        const vn = dvx * c.nx + dvy * c.ny;
        let dpn = c.mn * (-vn + c.bias);
        const pn0 = c.pn;
        c.pn = Math.max(pn0 + dpn, 0);
        dpn = c.pn - pn0;
        let px = dpn * c.nx, py = dpn * c.ny;
        A.vx -= A.invM * px; A.vy -= A.invM * py; A.w -= A.invI * (c.r1x * py - c.r1y * px);
        B.vx += B.invM * px; B.vy += B.invM * py; B.w += B.invI * (c.r2x * py - c.r2y * px);

        dvx = B.vx - B.w * c.r2y - A.vx + A.w * c.r1y;
        dvy = B.vy + B.w * c.r2x - A.vy - A.w * c.r1x;
        const tx = c.ny, ty = -c.nx;
        const vt = dvx * tx + dvy * ty;
        let dpt = c.mt * -vt;
        const maxPt = ar.friction * c.pn;
        const pt0 = c.pt;
        c.pt = Math.max(-maxPt, Math.min(maxPt, pt0 + dpt));
        dpt = c.pt - pt0;
        px = dpt * tx; py = dpt * ty;
        A.vx -= A.invM * px; A.vy -= A.invM * py; A.w -= A.invI * (c.r1x * py - c.r1y * px);
        B.vx += B.invM * px; B.vy += B.invM * py; B.w += B.invI * (c.r2x * py - c.r2y * px);
      }
    }
  }

  // move, and put still bodies to sleep
  for (const b of bs) {
    if (b.kinematic) { b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; continue; }
    if (!movable(b) || b.asleep) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
    if (world.sleepOk && Math.abs(b.vx) + Math.abs(b.vy) < 6 && Math.abs(b.w) < 0.08) {
      b.still += dt;
      if (b.still > 1.0) { b.asleep = true; b.vx = 0; b.vy = 0; b.w = 0; }
    } else b.still = 0;
  }
}

// the contacts of a body this step: [other body, number of points]
export function touching(world: World, b: Body): Body[] {
  const out: Body[] = [];
  for (const k in world.arbiters) {
    const ar = world.arbiters[k];
    if (ar.a === b) out.push(ar.b);
    else if (ar.b === b) out.push(ar.a);
  }
  return out;
}

// whether a world point is inside a body
export function inside(b: Body, x: number, y: number, pad: number): boolean {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  const dx = x - b.x, dy = y - b.y;
  const lx = c * dx + s * dy, ly = -s * dx + c * dy;
  return Math.abs(lx) <= b.hw + pad && Math.abs(ly) <= b.hh + pad;
}

// the point of a body nearest to (x, y)
export function nearest(b: Body, x: number, y: number): number[] {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  const dx = x - b.x, dy = y - b.y;
  let lx = c * dx + s * dy, ly = -s * dx + c * dy;
  lx = Math.max(-b.hw, Math.min(b.hw, lx));
  ly = Math.max(-b.hh, Math.min(b.hh, ly));
  return [b.x + c * lx - s * ly, b.y + s * lx + c * ly];
}

// half the size of the body's bounding box: [half width, half height]
export function extent(b: Body): number[] {
  const c = Math.abs(Math.cos(b.a)), s = Math.abs(Math.sin(b.a));
  return [c * b.hw + s * b.hh, s * b.hw + c * b.hh];
}
