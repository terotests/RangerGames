// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Smooth, seamless character meshes from shape primitives: the body is a
// signed distance field (round cones with an elliptical cross-section,
// ellipsoids, blended with a smooth minimum), turned into one closed surface
// by surface nets, the corners projected onto the field's zero surface and
// their normals taken from its gradient (so toon bands and ink lines run
// cleanly over it). Skin weights come from the bones the primitives name.
//
//   import { Field, mesh, skinWeights } from "./sdfmesh.mjs";
//   const f = new Field();
//   f.group("body", 0.04);                          // a group blends its own shapes with k = 0.04
//   f.cone("body", [0, 1, 0], [0, 1.3, 0], 0.12, 0.1, { w: [1.3, 0.8], bones: ["spine", "chest"] });
//   f.join("arm.L", "body", 0.015);                 // groups joined to each other with their own k
//   f.slab("*", c, u, v, poly, t, { cut: 0.004 });  // group "*": a cut through all groups
//   const m = mesh(f, { h: 0.006 });                // { P, N, I }
//   const { J, W } = skinWeights(f, m, BONES, SEGMENTS);
//
// Our own code after the textbook methods (Gibson's surface nets, Quilez's
// distance functions); nothing copied.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// polynomial smooth minimum (k = blend width; 0 = hard)
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
// smooth subtraction: a with b cut out
export function ssub(a, b, k) {
  if (k <= 0) return Math.max(a, -b);
  const h = Math.max(k - Math.abs(a + b), 0) / k;
  return Math.max(a, -b) + h * h * k * 0.25;
}

// an orthonormal frame round the axis d, its x as near `side` as it can be
function axisFrame(d, side) {
  const y = norm(d);
  let x = sub(side, mul(y, dot(side, y)));
  if (len(x) < 1e-6) x = Math.abs(y[0]) < 0.9 ? cross([1, 0, 0], y) : cross([0, 0, 1], y);
  x = norm(x);
  const z = cross(x, y);
  return [x, y, z];
}

// the round cone's distance (Quilez): a sphere of radius r1 at a, r2 at b, and
// the cone touching both; p in the cone's frame, axis along y from 0 to l
function roundCone(px, py, pz, r1, r2, l) {
  const q = Math.hypot(px, pz);
  const b = (r1 - r2) / l, a = Math.sqrt(Math.max(1 - b * b, 0));
  const k = q * -b + py * a;   // dot(q, vec2(-b, a))
  if (k < 0) return Math.hypot(q, py) - r1;
  if (k > a * l) return Math.hypot(q, py - l) - r2;
  return q * a + py * b - r1;
}

export class Field {
  constructor() {
    this.prims = [];
    this.groups = new Map();   // name → { k, neg: k for its cuts }
    this.joins = [];           // [group, k] in order: the first is the base
  }
  group(name, k = 0.02) { this.cells = null; this.groups.set(name, { k }); if (!this.joins.find((j) => j[0] === name)) this.joins.push([name, 0]); return this; }
  // how a group joins what came before it (smooth union with k)
  join(name, _to, k) { this.cells = null; const j = this.joins.find((x) => x[0] === name); if (j) j[1] = k; else this.joins.push([name, k]); return this; }
  _add(p) { if (p.group !== "*" && !this.groups.has(p.group)) this.group(p.group); p.i = this.prims.length; this.prims.push(p); this.cells = null; return p; }
  // a round cone from a (radius ra) to b (radius rb). Options:
  //   w: [wx, wz]  the cross-section's widths as factors (an ellipse), x towards `side`
  //   side         the cross-section's x direction (default the model's x)
  //   bones        the bones its corners may follow (skin weights)
  //   cut: k       a cut (subtracted from its group with blend k)
  cone(group, a, b, ra, rb, o = {}) {
    const d = sub(b, a), l = len(d) || 1e-6;
    const [x, y, z] = axisFrame(d, o.side || [1, 0, 0]);
    const w = o.w || [1, 1];
    const s = Math.min(w[0], w[1], 1);
    const r = Math.max(ra, rb) * Math.max(w[0], w[1], 1);
    const lo = [0, 1, 2].map((i) => Math.min(a[i], b[i]) - r), hi = [0, 1, 2].map((i) => Math.max(a[i], b[i]) + r);
    return this._add({ kind: 0, group, a, b, ra, rb, l, x, y, z, iw: [1 / w[0], 1 / w[1]], s, lo, hi, bones: o.bones || [], cut: o.cut, name: o.name });
  }
  // an ellipsoid at c with radii r (in its frame: x = side, y = up, z = cross)
  ell(group, c, r, o = {}) {
    const [x, y, z] = axisFrame(o.up || [0, 1, 0], o.side || [1, 0, 0]);
    const m = Math.max(...r);
    return this._add({ kind: 1, group, c, r, x, y, z, lo: c.map((v) => v - m), hi: c.map((v) => v + m), bones: o.bones || [], cut: o.cut, name: o.name });
  }
  // a tube through the centre line `pts` with an elliptical section that changes
  // smoothly along it: half widths rx[i] (towards `side`) and rz[i] (across) at
  // each point, a Catmull-Rom curve between them (no ridges where pieces meet);
  // rounded ends. One primitive a piece; bones(i) gives piece i's bones.
  tube(group, pts, rx, rz, o = {}) {
    const n = pts.length;
    const out = [];
    for (let i = 0; i + 1 < n; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = sub(b, a), l = len(d) || 1e-6;
      const [x, y, z] = axisFrame(d, o.side || [1, 0, 0]);
      const at = (arr, k) => arr[Math.max(0, Math.min(n - 1, k))];
      const R = [rx, rz].map((arr) => [at(arr, i - 1), arr[i], arr[i + 1], at(arr, i + 2)]);
      const m = Math.max(...R[0], ...R[1]);
      const lo = [0, 1, 2].map((k) => Math.min(a[k], b[k]) - m), hi = [0, 1, 2].map((k) => Math.max(a[k], b[k]) + m);
      out.push(this._add({ kind: 3, group, a, l, x, y, z, R, lo, hi, bones: o.bones ? o.bones(i) : [], cut: o.cut, name: o.name }));
    }
    return out;
  }
  // a rounded slab: the 2D outline `poly` ([u, v] points, convex or not) in the plane
  // through c spanned by u and v, `t` thick, its edges rounded by `t`/2 (ears, fins)
  slab(group, c, u, v, poly, t, o = {}) {
    u = norm(u); v = norm(v);
    const n = norm(cross(u, v));
    const pts = poly.map((q) => add(c, add(mul(u, q[0]), mul(v, q[1]))));
    const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])) - t * 2), hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])) + t * 2);
    return this._add({ kind: 2, group, c, u, v, n, poly, t, bend: o.bend || 0, lo, hi, bones: o.bones || [], cut: o.cut, name: o.name });
  }
  prim(p, q) {
    if (p.kind === 0) {
      const d = sub(q, p.a);
      const px = dot(d, p.x) * p.iw[0], py = dot(d, p.y), pz = dot(d, p.z) * p.iw[1];
      return roundCone(px, py, pz, p.ra, p.rb, p.l) * p.s;
    }
    if (p.kind === 1) {
      // Quilez's ellipsoid bound: k0 * (k0 - 1) / k1
      const d = sub(q, p.c);
      const x = dot(d, p.x), y = dot(d, p.y), z = dot(d, p.z);
      const k0 = Math.hypot(x / p.r[0], y / p.r[1], z / p.r[2]);
      const k1 = Math.hypot(x / (p.r[0] * p.r[0]), y / (p.r[1] * p.r[1]), z / (p.r[2] * p.r[2]));
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(...p.r);
    }
    if (p.kind === 3) {
      const d = sub(q, p.a);
      const px = dot(d, p.x), py = dot(d, p.y), pz = dot(d, p.z);
      // each piece has rounded ends (an ellipsoid the size of its section), so a bend has no gap
      const t = Math.max(0, Math.min(1, py / p.l));
      const cr = (v) => { const [a, b, c, e] = v; const t2 = t * t, t3 = t2 * t; return Math.max(1e-4, 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3)); };
      const rx = cr(p.R[0]), rz = cr(p.R[1]);
      const over = py < 0 ? py : py > p.l ? py - p.l : 0;
      const rm = Math.min(rx, rz);
      return (Math.hypot(px / rx, over / rm, pz / rz) - 1) * rm;
    }
    // slab: distance to the 2D outline in its plane, rounded by the thickness
    const d = sub(q, p.c);
    const pu = dot(d, p.u), pv = dot(d, p.v);
    let pn = dot(d, p.n);
    if (p.bend) pn -= p.bend * (pu * pu + pv * pv);   // a cupped slab (an ear's hollow)
    const e = polyDist(p.poly, pu, pv);
    const half = p.t * 0.5;
    const dx = Math.max(e, 0), dz = Math.max(Math.abs(pn) - half, 0);
    return Math.hypot(dx, dz) + Math.min(Math.max(e, Math.abs(pn) - half), 0);
  }
  // the spatial index: a coarse grid of cells, each with the primitives that can reach it
  index(cell = 0.04) {
    let maxK = 0;
    for (const g of this.groups.values()) maxK = Math.max(maxK, g.k);
    for (const j of this.joins) maxK = Math.max(maxK, j[1]);
    const pad = maxK + cell;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of this.prims) if (!p.cut) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i]); hi[i] = Math.max(hi[i], p.hi[i]); }
    this.lo = lo.map((v) => v - pad); this.hi = hi.map((v) => v + pad);
    this.cell = cell;
    this.dims = [0, 1, 2].map((i) => Math.ceil((this.hi[i] - this.lo[i]) / cell) + 1);
    const [nx, ny, nz] = this.dims;
    this.cells = new Array(nx * ny * nz);
    for (const p of this.prims) {
      const a = [0, 1, 2].map((i) => Math.max(0, Math.floor((p.lo[i] - pad - this.lo[i]) / cell)));
      const b = [0, 1, 2].map((i) => Math.min(this.dims[i] - 1, Math.floor((p.hi[i] + pad - this.lo[i]) / cell)));
      for (let k = a[2]; k <= b[2]; k++) for (let j = a[1]; j <= b[1]; j++) for (let i = a[0]; i <= b[0]; i++) {
        const c = (k * ny + j) * nx + i;
        (this.cells[c] || (this.cells[c] = [])).push(p);
      }
    }
    this.gi = new Map([...this.joins].map((j, i) => [j[0], i]));
    this.gk = this.joins.map((j) => this.groups.get(j[0])?.k ?? 0.02);
    return this;
  }
  // the field at q (and, if `who` is given, each primitive's own distance there)
  eval(q, who) {
    if (!this.cells) this.index();
    const c = [0, 1, 2].map((i) => Math.floor((q[i] - this.lo[i]) / this.cell));
    if (c.some((v, i) => v < 0 || v >= this.dims[i])) return this.cell;
    const list = this.cells[(c[2] * this.dims[1] + c[1]) * this.dims[0] + c[0]];
    if (!list) return this.cell;
    const n = this.joins.length;
    const gv = new Array(n).fill(Infinity);
    const cuts = [];
    for (const p of list) {
      const d = this.prim(p, q);
      if (who) who.push([p, d]);
      if (p.cut !== undefined) { cuts.push([p, d]); continue; }
      const g = this.gi.get(p.group);
      gv[g] = gv[g] === Infinity ? d : smin(gv[g], d, this.gk[g]);
    }
    for (const [p, d] of cuts) { if (p.group === "*") continue; const g = this.gi.get(p.group); if (gv[g] !== Infinity) gv[g] = ssub(gv[g], d, p.cut); }
    let v = Infinity;
    for (let g = 0; g < n; g++) {
      if (gv[g] === Infinity) continue;
      v = v === Infinity ? gv[g] : smin(v, gv[g], this.joins[g][1]);
    }
    // cuts through everything (group "*"), e.g. the gap that keeps the legs apart
    for (const [p, d] of cuts) if (p.group === "*" && v !== Infinity) v = ssub(v, d, p.cut);
    return v === Infinity ? this.cell : v;
  }
  grad(q, e = 5e-4) {
    const f = (dx, dy, dz) => this.eval([q[0] + dx, q[1] + dy, q[2] + dz]);
    return norm([f(e, 0, 0) - f(-e, 0, 0), f(0, e, 0) - f(0, -e, 0), f(0, 0, e) - f(0, 0, -e)]);
  }
}

// signed distance to a 2D polygon (negative inside)
function polyDist(poly, x, y) {
  let d = Infinity, s = 1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    const qx = wx - ex * t, qy = wy - ey * t;
    d = Math.min(d, qx * qx + qy * qy);
    const c1 = y >= ay, c2 = y < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

// Surface nets: one corner in each grid cell the surface passes, at the mean
// of its edges' crossings, then moved onto the surface; a quad round each
// crossed grid edge (split into two triangles along the shorter diagonal).
// Options: h (grid step), box ([lo, hi], default the field's bounds), project
// (steps onto the surface), smooth (Taubin passes before projecting).
export function mesh(field, { h = 0.006, box = null, project = 3, smooth = 1 } = {}) {
  if (!field.cells) field.index();
  const lo = box ? box[0] : field.lo, hi = box ? box[1] : field.hi;
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    V[id(i, j, k)] = (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) ? h : field.eval([lo[0] + i * h, lo[1] + j * h, lo[2] + k * h]);
  }
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const P = [];
  const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let s = [0, 0, 0], n = 0;
    for (const e of E) {
      const a = V[id(i + e[0], j + e[1], k + e[2])], b = V[id(i + e[3], j + e[4], k + e[5])];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      s = add(s, [i + e[0] + (e[3] - e[0]) * t, j + e[1] + (e[4] - e[1]) * t, k + e[2] + (e[5] - e[2]) * t]);
      n++;
    }
    if (!n) continue;
    cellV[cid(i, j, k)] = P.length;
    P.push([lo[0] + s[0] / n * h, lo[1] + s[1] / n * h, lo[2] + s[2] / n * h]);
  }
  const Q = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = V[id(i, j, k)];
    // edges along x, y, z from this grid point
    const ax = [[1, 0, 0, [[0, -1, -1], [0, 0, -1], [0, 0, 0], [0, -1, 0]]], [0, 1, 0, [[-1, 0, -1], [-1, 0, 0], [0, 0, 0], [0, 0, -1]]], [0, 0, 1, [[-1, -1, 0], [0, -1, 0], [0, 0, 0], [-1, 0, 0]]]];
    for (const [dx, dy, dz, cs] of ax) {
      if (i + dx >= nx || j + dy >= ny || k + dz >= nz) continue;
      const v1 = V[id(i + dx, j + dy, k + dz)];
      if ((v0 < 0) === (v1 < 0)) continue;
      const q = cs.map(([a, b, c]) => cellV[cid(i + a, j + b, k + c)]);
      if (q.some((x) => x < 0)) continue;
      Q.push(v0 < 0 ? q : [q[3], q[2], q[1], q[0]]);
    }
  }
  // Taubin smoothing (shrink-free) on the corners' ring neighbours
  const nb = P.map(() => new Set());
  for (const q of Q) for (let t = 0; t < 4; t++) { nb[q[t]].add(q[(t + 1) % 4]); nb[q[(t + 1) % 4]].add(q[t]); }
  for (let pass = 0; pass < smooth; pass++) {
    for (const lam of [0.5, -0.53]) {
      const D = P.map((p, v) => { let s = [0, 0, 0]; for (const u of nb[v]) s = add(s, P[u]); return nb[v].size ? mul(sub(mul(s, 1 / nb[v].size), p), lam) : [0, 0, 0]; });
      for (let v = 0; v < P.length; v++) P[v] = add(P[v], D[v]);
    }
  }
  for (let s = 0; s < project; s++) {
    for (let v = 0; v < P.length; v++) { const d = field.eval(P[v]); if (Math.abs(d) > 1e-6) P[v] = sub(P[v], mul(field.grad(P[v]), d)); }
  }
  const N = P.map((p) => field.grad(p));
  const I = [];
  for (const q of Q) {
    const d02 = len(sub(P[q[0]], P[q[2]])), d13 = len(sub(P[q[1]], P[q[3]]));
    if (d02 < d13) I.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    else I.push(q[0], q[1], q[3], q[1], q[2], q[3]);
  }
  return { P, N, I };
}

// distance from p to the segment ab
function segDist(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(p, add(a, mul(ab, t))));
}

// Skin weights: the bones a corner may follow are those of the primitives
// near it (within `reach` of the nearest); among them each bone's weight
// falls off with the corner's distance to the bone's segment (power `pw`),
// four strongest kept; then `relax` passes average them over the mesh.
//   segs: { bone: [a, b] } each bone's segment in the rest pose
// allow(p, bone): optional filter, e.g. to keep a left bone off the right leg
// where two parts lie closer than `reach` (feet side by side)
export function skinWeights(field, m, boneIndex, segs, { reach = 0.025, pw = 4, relax = 2, allow = null } = {}) {
  const n = m.P.length;
  const WS = [];
  for (let v = 0; v < n; v++) {
    const who = [];
    field.eval(m.P[v], who);
    const solid = who.filter(([p]) => p.cut === undefined && p.bones.length);
    if (!solid.length) {
      // no primitive reported here (e.g. on a cut's face): the nearest bone segment
      let bb = null, bd = Infinity;
      for (const b in segs) { const d = segDist(m.P[v], segs[b][0], segs[b][1]); if (d < bd) { bd = d; bb = b; } }
      WS.push(new Map([[bb != null ? boneIndex[bb] : 0, 1]])); continue;
    }
    const dmin = Math.min(...solid.map((x) => x[1]));
    const cand = new Set();
    for (const [p, d] of solid) if (d <= dmin + reach) for (const b of p.bones) if (!allow || allow(m.P[v], b)) cand.add(b);
    const w = new Map();
    for (const b of cand) {
      const s = segs[b];
      if (!s) continue;
      const d = segDist(m.P[v], s[0], s[1]);
      w.set(boneIndex[b], 1 / Math.pow(d + 0.01, pw));
    }
    WS.push(w);
  }
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < m.I.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.I[t + e], b = m.I[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  const normal = (w) => { let s = 0; for (const x of w.values()) s += x; const r = new Map(); for (const [k, x] of w) r.set(k, x / (s || 1)); return r; };
  let cur = WS.map(normal);
  for (let r = 0; r < relax; r++) {
    cur = cur.map((w, v) => {
      const o = new Map(w);
      for (const [k, x] of o) o.set(k, x * 2);
      for (const u of nb[v]) for (const [k, x] of cur[u]) o.set(k, (o.get(k) || 0) + x);
      return normal(o);
    });
  }
  const J = [], W = [];
  for (const w of cur) {
    const top = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = top.reduce((a, x) => a + x[1], 0) || 1;
    while (top.length < 4) top.push([0, 0]);
    for (const [k] of top) J.push(k);
    for (const [, x] of top) W.push(x / s);
  }
  return { J, W };
}

// a mesh as glb.mjs takes it: flat arrays, one colour (sRGB linear triple) or a
// colour a corner from fn(p, n)
export function toPart(m, col, skin) {
  const P = [], N = [], C = [];
  for (let v = 0; v < m.P.length; v++) {
    P.push(...m.P[v]); N.push(...m.N[v]);
    C.push(...(typeof col === "function" ? col(m.P[v], m.N[v], v) : col));
  }
  return { P, N, C, I: m.I.slice(), J: skin ? skin.J : [], W: skin ? skin.W : [] };
}
