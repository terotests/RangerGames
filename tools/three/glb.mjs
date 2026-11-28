// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A small glTF 2.0 binary writer and a flat-shaded mesh builder for models
// drawn in code (our own art, CC0). Used by make-astronaut.mjs and
// make-iss.mjs; make-soldier.mjs has an older copy of the same writer.
//
//   const m = new Mesh();
//   m.box([0, 1, 0], [1, 2, 1], 0xffcc00, bone);
//   fs.writeFileSync("x.glb", writeGlb({ meshes: [{ name: "x", mesh: m, unlit: true }] }));
//
// Colours are sRGB hex numbers; they are stored per corner (COLOR_0) in
// linear light. `mesh.shade(p, n)` (optional) gives a light factor for a
// face at p with normal n: that is how make-iss.mjs bakes the cabin lights
// into an unlit model (KHR_materials_unlit, which the engine draws as is).

export function lin(hex) {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
}
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// a seeded random number generator (the same model every run)
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class Mesh {
  constructor() {
    this.P = []; this.N = []; this.C = []; this.J = []; this.I = [];
    this.E = [];            // per triangle: 1 = drawn while emit was on
    this.shade = null;      // (p, n) => light factor (number or [r, g, b])
    this.xf = null;         // (p) => p in the model (a frame for building in local coordinates)
    this.xn = null;         // (n) => n in the model
    this.emit = false;      // while true, faces are not shaded (light panels, screens)
  }
  get tris() { return this.I.length / 3; }
  tri(a, b, c, col, bone = 0) {
    if (this.xf) { a = this.xf(a); b = this.xf(b); c = this.xf(c); }
    const n = norm(cross(sub(b, a), sub(c, a)));
    if (!isFinite(n[0]) || (n[0] === 0 && n[1] === 0 && n[2] === 0)) return;
    let k = lin(col);
    if (this.shade && !this.emit) {
      const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const f = this.shade(centre, n);
      k = typeof f === "number" ? k.map((v) => v * f) : k.map((v, i) => v * f[i]);
    }
    const base = this.P.length / 3;
    for (const p of [a, b, c]) { this.P.push(...p); this.N.push(...n); this.C.push(...k); this.J.push(bone, 0, 0, 0); }
    this.I.push(base, base + 1, base + 2);
    this.E.push(this.emit ? 1 : 0);
  }
  quad(a, b, c, d, col, bone) { this.tri(a, b, c, col, bone); this.tri(a, c, d, col, bone); }
  // a quad turned so that its front looks along `dir` (in the same frame as its corners)
  face(a, b, c, d, dir, col, bone) {
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, dir) < 0) this.quad(d, c, b, a, col, bone); else this.quad(a, b, c, d, col, bone);
  }
  faceTri(a, b, c, dir, col, bone) {
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, dir) < 0) this.tri(c, b, a, col, bone); else this.tri(a, b, c, col, bone);
  }
  // a polygon (convex, corners in order) facing `dir`
  poly(pts, dir, col, bone) {
    for (let i = 1; i + 1 < pts.length; i++) this.faceTri(pts[0], pts[i], pts[i + 1], dir, col, bone);
  }
  // an axis-aligned box centred at c with sizes s; `skip` = faces left out ("-x", "+y", …)
  box(c, s, col, bone = 0, skip = "", sideCol) {
    const [x, y, z] = c, [w, h, d] = s.map((v) => v / 2);
    const v = (sx, sy, sz) => [x + sx * w, y + sy * h, z + sz * d];
    const sc = sideCol === undefined ? col : sideCol;
    if (!skip.includes("+z")) this.quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), col, bone);
    if (!skip.includes("-z")) this.quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), col, bone);
    if (!skip.includes("+x")) this.quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), sc, bone);
    if (!skip.includes("-x")) this.quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), sc, bone);
    if (!skip.includes("+y")) this.quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1), sc, bone);
    if (!skip.includes("-y")) this.quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), sc, bone);
  }
  // a frustum along y from y0 to y1 (radii r0, r1), seg sides, centred at x, z
  frustum(x, z, y0, y1, r0, r1, seg, col, bone = 0, caps = true, phase = 0) {
    const ring = (y, r) => Array.from({ length: seg }, (_, i) => { const a = ((i + phase) / seg) * Math.PI * 2; return [x + Math.sin(a) * r, y, z + Math.cos(a) * r]; });
    const lo = ring(y0, r0), hi = ring(y1, r1);
    const up = y1 > y0;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const q = up ? [lo[i], lo[j], hi[j], hi[i]] : [hi[i], hi[j], lo[j], lo[i]];
      if (r1 > 0 && r0 > 0) this.quad(q[0], q[1], q[2], q[3], col, bone);
      else if (r1 > 0) this.tri(up ? [x, y0, z] : hi[i], up ? hi[j] : [x, y0, z], up ? hi[i] : hi[j], col, bone);
      else this.tri(lo[i], lo[j], [x, y1, z], col, bone);
      if (caps) {
        if (r0 > 0) this.faceTri([x, y0, z], lo[j], lo[i], [0, up ? -1 : 1, 0], col, bone);
        if (r1 > 0) this.faceTri([x, y1, z], hi[i], hi[j], [0, up ? 1 : -1, 0], col, bone);
      }
    }
  }
  // a cylinder between two points (any direction), radius r, seg sides
  rod(a, b, r, seg, col, bone = 0, caps = true, r1) {
    const ax = norm(sub(b, a));
    const t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), v = cross(ax, u);
    const rb = r1 === undefined ? r : r1;
    const ring = (p, rr) => Array.from({ length: seg }, (_, i) => { const an = (i / seg) * Math.PI * 2; return add(p, add(mul(u, Math.cos(an) * rr), mul(v, Math.sin(an) * rr))); });
    const A = ring(a, r), B = ring(b, rb);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const mid = mul(add(add(A[i], A[j]), add(B[i], B[j])), 0.25);
      const out = sub(mid, mul(add(a, b), 0.5));
      this.face(A[i], A[j], B[j], B[i], out, col, bone);
      if (caps) {
        this.faceTri(a, A[i], A[j], mul(ax, -1), col, bone);
        this.faceTri(b, B[i], B[j], ax, col, bone);
      }
    }
  }
  // a low-poly ball
  ball(c, r, col, bone = 0, seg = 8, rings = 5, sy = 1) {
    const pt = (i, j) => { const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2; return [c[0] + Math.sin(th) * Math.sin(ph) * r, c[1] + Math.cos(th) * r * sy, c[2] + Math.sin(th) * Math.cos(ph) * r]; };
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (j === 0) this.tri(a, cc, d, col, bone); else if (j === rings - 1) this.tri(a, b, d, col, bone); else this.quad(a, d, cc, b, col, bone);
    }
  }
  // a part of a ball: rings from j0 to j1 of `rings` (0 = top)
  cap(c, r, col, bone, seg, rings, j1, sy = 1, sz = 1) {
    const pt = (i, j) => { const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2; return [c[0] + Math.sin(th) * Math.sin(ph) * r, c[1] + Math.cos(th) * r * sy, c[2] + Math.sin(th) * Math.cos(ph) * r * sz]; };
    for (let j = 0; j < j1; j++) for (let i = 0; i < seg; i++) {
      const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (j === 0) this.tri(a, cc, d, col, bone); else this.quad(a, d, cc, b, col, bone);
    }
  }
}

// bones: [[name, parent index, rest position in the model, extras?], …] (extras: e.g. { features: [...] }, engine features.rs)
// clips: [[name, [[bone index, "rotation"|"translation", times, values], …]], …]
// meshes: [{ name, mesh, unlit, double, skinned, extras }]
export function writeGlb({ meshes, bones = null, clips = [], generator = "RangerGames tools/three" }) {
  const chunks = [];
  let offset = 0;
  const views = [], accessors = [];
  function view(buf, target) {
    while (offset % 4) { chunks.push(Buffer.alloc(1)); offset++; }
    const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, ...(target ? { target } : {}) });
    chunks.push(b); offset += b.length;
    return views.length - 1;
  }
  function acc(arr, type, ct, target, minmax) {
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[ct];
    const a = new T(arr);
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const o = { bufferView: view(a, target), componentType: ct, count: arr.length / n, type };
    if (minmax) {
      const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const k = i % n; if (arr[i] < mn[k]) mn[k] = arr[i]; if (arr[i] > mx[k]) mx[k] = arr[i]; }
      o.min = mn; o.max = mx;
    }
    accessors.push(o);
    return accessors.length - 1;
  }
  const nodes = [];
  const materials = [];
  const gMeshes = [];
  let skins;
  const rootNodes = [];
  if (bones) {
    bones.forEach((b, i) => {
      const p = b[1] >= 0 ? bones[b[1]][2] : [0, 0, 0];
      const kids = bones.map((c, k) => (c[1] === i ? k : -1)).filter((k) => k >= 0);
      nodes.push({ name: b[0], translation: b[2].map((x, k) => +(x - p[k]).toFixed(5)), ...(kids.length ? { children: kids } : {}), ...(b[3] ? { extras: b[3] } : {}) });
    });
    rootNodes.push(0);
    const ibm = bones.flatMap((b) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b[2][0], -b[2][1], -b[2][2], 1]);
    skins = [{ joints: bones.map((_, i) => i), inverseBindMatrices: acc(ibm, "MAT4", 5126), skeleton: 0 }];
  }
  for (const m of meshes) {
    let g = m.mesh;
    if (!g.I.length) continue;
    // compact (unlit, not skinned): corners with the same place and colour are
    // shared and the normals left out (an unlit model needs none)
    if (m.compact) g = compact(g);
    const attributes = {
      POSITION: acc(g.P, "VEC3", 5126, 34962, true),
      ...(m.compact ? {} : { NORMAL: acc(g.N, "VEC3", 5126, 34962) }),
      COLOR_0: acc(g.C, "VEC3", 5126, 34962),
    };
    if (bones && m.skinned !== false) {
      // a mesh may give its own weights (W, four a corner); otherwise one bone a corner
      let W = g.W && g.W.length === g.J.length ? g.W : null;
      if (!W) { W = []; for (let i = 0; i < g.J.length / 4; i++) W.push(1, 0, 0, 0); }
      attributes.JOINTS_0 = acc(g.J, "VEC4", 5123, 34962);
      attributes.WEIGHTS_0 = acc(W, "VEC4", 5126, 34962);
    }
    const big = g.P.length / 3 > 65535;
    const indices = acc(g.I, "SCALAR", big ? 5125 : 5123, 34963);
    const mat = { name: m.name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } };
    if (m.unlit) mat.extensions = { KHR_materials_unlit: {} };
    if (m.double) mat.doubleSided = true;
    if (m.extras) mat.extras = m.extras;   // e.g. { toon: {...} }: the engine's per-part toon settings
    materials.push(mat);
    gMeshes.push({ name: m.name, primitives: [{ attributes, indices, material: materials.length - 1 }] });
    const node = { name: m.name, mesh: gMeshes.length - 1 };
    if (bones && m.skinned !== false) node.skin = 0;
    nodes.push(node);
    rootNodes.push(nodes.length - 1);
  }
  const animations = clips.map(([name, tracks]) => {
    const samplers = [], channels = [];
    for (const [node, p, times, values] of tracks) {
      samplers.push({ input: acc(times, "SCALAR", 5126, undefined, true), output: acc(values, p === "rotation" ? "VEC4" : "VEC3", 5126), interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node, path: p } });
    }
    return { name, samplers, channels };
  });
  const doc = {
    asset: { version: "2.0", generator, copyright: "CC0 1.0 (RangerGames)" },
    scene: 0,
    scenes: [{ nodes: rootNodes }],
    nodes,
    meshes: gMeshes,
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: 0 }],
  };
  if (materials.some((m) => m.extensions)) doc.extensionsUsed = ["KHR_materials_unlit"];
  if (skins) doc.skins = skins;
  if (animations.length) doc.animations = animations;
  let bin = Buffer.concat(chunks);
  while (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(1)]);
  doc.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(doc));
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(" ")]);
  const head = Buffer.alloc(12);
  head.write("glTF", 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

function compact(g) {
  const out = { P: [], C: [], I: [], J: [], N: [] };
  const seen = new Map();
  const q = (x) => Math.round(x * 4096);
  for (let i = 0; i < g.I.length; i++) {
    const v = g.I[i];
    const key = [g.P[v * 3], g.P[v * 3 + 1], g.P[v * 3 + 2]].map((x) => Math.round(x * 2000)).join(",") + "|" + [g.C[v * 3], g.C[v * 3 + 1], g.C[v * 3 + 2]].map(q).join(",");
    let k = seen.get(key);
    if (k === undefined) {
      k = out.P.length / 3;
      seen.set(key, k);
      out.P.push(g.P[v * 3], g.P[v * 3 + 1], g.P[v * 3 + 2]);
      out.C.push(g.C[v * 3], g.C[v * 3 + 1], g.C[v * 3 + 2]);
    }
    out.I.push(k);
  }
  return out;
}

// animation helpers (quaternions for rotations about one axis)
export const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
export const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
export const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
// x then y then z (three.js "XYZ" Euler order) as one quaternion
export function qe(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
export const steps = (n, d) => Array.from({ length: n + 1 }, (_, i) => +(i * d / n).toFixed(4));
