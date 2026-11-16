#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Writes the toy soldier of games/nappulasota as skinned, animated glTF
// binaries (our own model, drawn here in code: CC0 like the rest of our art):
//
//   node tools/three/make-soldier.mjs   → games/nappulasota/models/sotilas-{valkoinen,musta}.glb
//
// A low-poly toy soldier with a helmet, a wooden sword and a round shield,
// flat shaded, coloured per corner (COLOR_0). Eight bones (root, hips,
// chest, head, two arms, two legs); every part follows one bone. Clips:
// Idle, Walk, Attack (the sword lands at 0.5 s), Hit, Death and Victory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "games/nappulasota/models");

// ---- bones: name, parent, rest position in the model ----
const BONES = [
  ["root", -1, [0, 0, 0]],
  ["hips", 0, [0, 0.45, 0]],
  ["chest", 1, [0, 0.75, 0]],
  ["head", 2, [0, 1.1, 0]],
  ["arm.L", 2, [0.29, 1.02, 0]],
  ["arm.R", 2, [-0.29, 1.02, 0]],
  ["leg.L", 1, [0.12, 0.45, 0]],
  ["leg.R", 1, [-0.12, 0.45, 0]],
];
const B = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ---- geometry: flat-shaded parts, each on one bone ----
const P = [], N = [], C = [], J = [], I = [];
function lin(hex) {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
}
function tri(a, b, c, col, bone) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  n = n.map((x) => x / l);
  const base = P.length / 3;
  for (const p of [a, b, c]) { P.push(...p); N.push(...n); C.push(...lin(col)); J.push(bone, 0, 0, 0); }
  I.push(base, base + 1, base + 2);
}
function quad(a, b, c, d, col, bone) { tri(a, b, c, col, bone); tri(a, c, d, col, bone); }
// a box centred at c
function box(c, s, col, bone) {
  const [x, y, z] = c, [w, h, d] = s.map((v) => v / 2);
  const v = (sx, sy, sz) => [x + sx * w, y + sy * h, z + sz * d];
  quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), col, bone);
  quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), col, bone);
  quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), col, bone);
  quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), col, bone);
  quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1), col, bone);
  quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), col, bone);
}
// a frustum along y from y0 to y1 (radii r0, r1), seg sides, centred at x, z
function frustum(x, z, y0, y1, r0, r1, seg, col, bone, caps = true) {
  const ring = (y, r) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * Math.PI * 2; return [x + Math.sin(a) * r, y, z + Math.cos(a) * r]; });
  const lo = ring(y0, r0), hi = ring(y1, r1);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    if (r1 > 0) quad(lo[i], lo[j], hi[j], hi[i], col, bone); else tri(lo[i], lo[j], hi[i], col, bone);
    if (caps) {
      tri([x, y0, z], lo[j], lo[i], col, bone);
      if (r1 > 0) tri([x, y1, z], hi[i], hi[j], col, bone);
    }
  }
}
// a low-poly ball
function ball(c, r, col, bone, seg = 8, rings = 5) {
  const pt = (i, j) => { const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2; return [c[0] + Math.sin(th) * Math.sin(ph) * r, c[1] + Math.cos(th) * r, c[2] + Math.sin(th) * Math.cos(ph) * r]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
    if (j === 0) tri(a, cc, d, col, bone); else if (j === rings - 1) tri(a, b, d, col, bone); else quad(a, d, cc, b, col, bone);
  }
}
// a disc facing +z (a shield), thickness t
function disc(c, r, t, seg, col, rim, bone) {
  const ring = (z) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * Math.PI * 2; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, z]; });
  const f = ring(c[2] + t / 2), b = ring(c[2] - t / 2);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    tri([c[0], c[1], c[2] + t / 2], f[i], f[j], col, bone);
    tri([c[0], c[1], c[2] - t / 2], b[j], b[i], rim, bone);
    quad(b[i], b[j], f[j], f[i], rim, bone);
  }
}

function soldier(pal) {
  P.length = N.length = C.length = J.length = I.length = 0;
  const { coat, trim, skin, metal, wood, boot, eye } = pal;
  // legs and boots
  for (const [s, bone] of [[1, B["leg.L"]], [-1, B["leg.R"]]]) {
    box([0.12 * s, 0.27, 0], [0.13, 0.36, 0.14], trim, bone);
    box([0.12 * s, 0.05, 0.03], [0.15, 0.1, 0.22], boot, bone);
  }
  // coat skirt and body
  frustum(0, 0, 0.42, 0.66, 0.27, 0.21, 8, coat, B.hips);
  frustum(0, 0, 0.64, 1.02, 0.21, 0.19, 8, coat, B.chest);
  frustum(0, 0, 0.62, 0.68, 0.225, 0.225, 8, trim, B.hips, false);           // belt
  box([0, 0.65, 0.215], [0.08, 0.07, 0.03], metal, B.hips);                    // buckle
  box([0, 0.86, 0.19], [0.05, 0.3, 0.03], trim, B.chest);                      // buttons strip
  frustum(0, 0, 1.0, 1.06, 0.2, 0.12, 8, trim, B.chest);                       // collar
  // head, helmet, plume, eyes, nose
  ball([0, 1.22, 0], 0.16, skin, B.head);
  frustum(0, 0, 1.27, 1.42, 0.185, 0.07, 8, metal, B.head);
  frustum(0, 0, 1.26, 1.29, 0.2, 0.2, 8, trim, B.head, false);
  box([0, 1.5, -0.02], [0.05, 0.12, 0.16], pal.plume, B.head);
  box([0.055, 1.24, 0.15], [0.035, 0.045, 0.02], eye, B.head);
  box([-0.055, 1.24, 0.15], [0.035, 0.045, 0.02], eye, B.head);
  box([0, 1.2, 0.165], [0.03, 0.04, 0.03], skin, B.head);
  // arms (hanging from the shoulders) and hands
  for (const [s, bone] of [[1, B["arm.L"]], [-1, B["arm.R"]]]) {
    box([0.3 * s, 0.86, 0], [0.1, 0.34, 0.11], coat, bone);
    box([0.3 * s, 1.0, 0], [0.13, 0.07, 0.13], trim, bone);                   // epaulette
    ball([0.3 * s, 0.66, 0.01], 0.06, skin, bone, 6, 4);
  }
  // the sword in the right hand, pointing forward
  box([-0.3, 0.66, 0.06], [0.035, 0.035, 0.12], wood, B["arm.R"]);           // grip
  box([-0.3, 0.66, 0.13], [0.16, 0.04, 0.03], metal, B["arm.R"]);            // guard
  box([-0.3, 0.66, 0.42], [0.06, 0.02, 0.56], pal.blade, B["arm.R"]);         // blade
  // the shield on the left arm
  disc([0.39, 0.8, 0.02], 0.17, 0.04, 10, pal.shield, trim, B["arm.L"]);
  box([0.39, 0.8, 0.045], [0.05, 0.2, 0.02], trim, B["arm.L"]);
  box([0.39, 0.8, 0.045], [0.2, 0.05, 0.02], trim, B["arm.L"]);
}

// ---- animation clips: [bone, path, times, values] ----
const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const T = (bone, v) => BONES[B[bone]][2].map((x, i) => x - (BONES[B[bone]][1] >= 0 ? BONES[BONES[B[bone]][1]][2][i] : 0) + v[i]);
function rot(bone, times, angles, axis = qx) { return [B[bone], "rotation", times, angles.flatMap((a) => axis(a))]; }
function pos(bone, times, offs) { return [B[bone], "translation", times, offs.flatMap((o) => T(bone, o))]; }
const steps = (n, d) => Array.from({ length: n + 1 }, (_, i) => +(i * d / n).toFixed(4));

const CLIPS = [
  ["Idle", [
    pos("hips", steps(4, 2), [[0, 0, 0], [0, -0.015, 0], [0, 0, 0], [0, -0.015, 0], [0, 0, 0]]),
    rot("chest", steps(4, 2), [0, 0.03, 0, 0.03, 0]),
    rot("head", steps(4, 2), [0, 0.15, 0, -0.15, 0], qy),
    rot("arm.L", steps(2, 2), [0.05, -0.05, 0.05]),
    rot("arm.R", steps(2, 2), [-0.05, 0.05, -0.05]),
  ]],
  ["Walk", [
    rot("leg.L", steps(4, 0.8), [0.55, 0, -0.55, 0, 0.55]),
    rot("leg.R", steps(4, 0.8), [-0.55, 0, 0.55, 0, -0.55]),
    rot("arm.L", steps(4, 0.8), [-0.45, 0, 0.45, 0, -0.45]),
    rot("arm.R", steps(4, 0.8), [0.25, 0, -0.25, 0, 0.25]),
    pos("hips", steps(4, 0.8), [[0, 0, 0], [0, 0.04, 0], [0, 0, 0], [0, 0.04, 0], [0, 0, 0]]),
    rot("chest", steps(4, 0.8), [0.06, 0.03, 0.06, 0.03, 0.06]),
  ]],
  ["Attack", [
    // wind up overhead, chop down at 0.5 s, recover
    rot("arm.R", [0, 0.3, 0.42, 0.5, 0.75, 1.0], [0, -2.6, -2.7, -0.5, -0.6, 0]),
    rot("chest", [0, 0.3, 0.5, 0.75, 1.0], [0, -0.15, 0.3, 0.25, 0]),
    rot("arm.L", [0, 0.3, 0.5, 1.0], [0, -0.6, -0.3, 0]),
    pos("hips", [0, 0.3, 0.5, 0.75, 1.0], [[0, 0, 0], [0, 0, -0.05], [0, -0.05, 0.12], [0, -0.03, 0.08], [0, 0, 0]]),
    rot("leg.L", [0, 0.5, 1.0], [0, -0.4, 0]),
    rot("leg.R", [0, 0.5, 1.0], [0, 0.3, 0]),
  ]],
  ["Hit", [
    rot("chest", [0, 0.12, 0.5], [0, 0.45, 0]),
    rot("head", [0, 0.12, 0.5], [0, 0.3, 0]),
    pos("hips", [0, 0.12, 0.5], [[0, 0, 0], [0, -0.03, -0.12], [0, 0, 0]]),
    rot("arm.L", [0, 0.12, 0.5], [0, -0.8, 0]),
    rot("arm.R", [0, 0.12, 0.5], [0, 0.5, 0]),
  ]],
  ["Death", [
    // a spin, then falls backwards flat on the board
    rot("root", [0, 0.3, 0.9, 1.2], [0, 0.1, -1.5, -1.57]),
    rot("chest", [0, 0.3, 1.2], [0, 0.5, 0.2]),
    rot("head", [0, 0.6, 1.2], [0, 0.5, 0.6], qy),
    rot("arm.L", [0, 0.4, 1.2], [0, -1.2, -2.6]),
    rot("arm.R", [0, 0.4, 1.2], [0, -1.0, -2.8]),
    rot("leg.L", [0, 0.6, 1.2], [0, -0.3, -0.2]),
  ]],
  ["Victory", [
    pos("hips", steps(4, 1.0), [[0, 0, 0], [0, 0.25, 0], [0, 0, 0], [0, 0.25, 0], [0, 0, 0]]),
    rot("arm.R", steps(2, 1.0), [-2.9, -2.6, -2.9]),
    rot("arm.L", steps(2, 1.0), [0, -0.3, 0], qz),
    rot("leg.L", steps(4, 1.0), [0, -0.4, 0, -0.4, 0]),
    rot("leg.R", steps(4, 1.0), [0, -0.4, 0, -0.4, 0]),
    rot("head", steps(2, 1.0), [-0.2, 0.1, -0.2]),
  ]],
];

// ---- glTF writer ----
function glb() {
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
    const T = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array }[ct];
    const a = new T(arr);
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const o = { bufferView: view(a, target), componentType: ct, count: arr.length / n, type };
    if (minmax) {
      o.min = Array.from({ length: n }, (_, k) => Math.min(...arr.filter((_, i) => i % n === k)));
      o.max = Array.from({ length: n }, (_, k) => Math.max(...arr.filter((_, i) => i % n === k)));
    }
    accessors.push(o);
    return accessors.length - 1;
  }
  const W = [];
  for (let i = 0; i < J.length / 4; i++) W.push(1, 0, 0, 0);
  const attributes = {
    POSITION: acc(P, "VEC3", 5126, 34962, true),
    NORMAL: acc(N, "VEC3", 5126, 34962),
    COLOR_0: acc(C, "VEC3", 5126, 34962),
    JOINTS_0: acc(J, "VEC4", 5123, 34962),
    WEIGHTS_0: acc(W, "VEC4", 5126, 34962),
  };
  const indices = acc(I, "SCALAR", 5123, 34963);
  // joints: no rotation at rest, so the inverse bind is minus the position
  const ibm = BONES.flatMap((b) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b[2][0], -b[2][1], -b[2][2], 1]);
  const ibmAcc = acc(ibm, "MAT4", 5126);
  const nodes = BONES.map((b, i) => {
    const p = b[1] >= 0 ? BONES[b[1]][2] : [0, 0, 0];
    const kids = BONES.map((c, k) => (c[1] === i ? k : -1)).filter((k) => k >= 0);
    return { name: b[0], translation: b[2].map((x, k) => +(x - p[k]).toFixed(5)), ...(kids.length ? { children: kids } : {}) };
  });
  nodes.push({ name: "Soldier", mesh: 0, skin: 0 });
  const animations = CLIPS.map(([name, tracks]) => {
    const samplers = [], channels = [];
    for (const [node, p, times, values] of tracks) {
      samplers.push({ input: acc(times, "SCALAR", 5126, undefined, true), output: acc(values, p === "rotation" ? "VEC4" : "VEC3", 5126), interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node, path: p } });
    }
    return { name, samplers, channels };
  });
  const doc = {
    asset: { version: "2.0", generator: "RangerGames tools/three/make-soldier.mjs", copyright: "CC0 1.0 (RangerGames)" },
    scene: 0,
    scenes: [{ nodes: [0, BONES.length] }],
    nodes,
    meshes: [{ name: "Soldier", primitives: [{ attributes, indices, material: 0 }] }],
    materials: [{ name: "toy", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    skins: [{ joints: BONES.map((_, i) => i), inverseBindMatrices: ibmAcc, skeleton: 0 }],
    animations,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: 0 }],
  };
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

const PALETTES = {
  valkoinen: { coat: 0xf2efe6, trim: 0x3a6ea5, skin: 0xf1c27d, metal: 0xc9ced6, wood: 0x8b5a2b, boot: 0x2b2b2b, eye: 0x1d1d1d, plume: 0x4f9dff, blade: 0xe8ecf2, shield: 0x4f9dff },
  musta: { coat: 0x2f2f38, trim: 0xb8322a, skin: 0xe0ac69, metal: 0x8d939c, wood: 0x6b4423, boot: 0x141414, eye: 0x101010, plume: 0xe63946, blade: 0xd5d9e0, shield: 0xe63946 },
};
fs.mkdirSync(OUT, { recursive: true });
for (const [name, pal] of Object.entries(PALETTES)) {
  soldier(pal);
  const file = path.join(OUT, `sotilas-${name}.glb`);
  fs.writeFileSync(file, glb());
  console.log(file, I.length / 3, "triangles", fs.statSync(file).size, "bytes");
}
