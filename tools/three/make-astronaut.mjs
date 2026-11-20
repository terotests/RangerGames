#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The astronauts of games/marsiin as skinned, animated glTF binaries (our own
// models, drawn here in code: CC0 like the rest of our art):
//
//   node tools/three/make-astronaut.mjs   → games/marsiin/models/astro-*.glb, suit.glb
//
// A low-poly person in what the crew wears on board (a polo shirt, cargo
// trousers, socks), twelve bones (hips, chest, head, upper and lower arms
// and legs), every part on one bone. The clips are how people move without
// weight: Float is the "neutral body posture" everyone's body takes when it
// relaxes in orbit (arms up in front, knees and hips bent), Glide flies head
// first with the arms ahead, Push shoves off a handrail, Grab catches one.
// Work, Eat, Run (on the treadmill, held down by its harness), Lift (the
// squat machine), Sleep (in a sleeping bag, arms floating up), Wave, Look
// and Hold. suit.glb is an empty spacesuit (as they hang in the airlock).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mesh, writeGlb, qe, steps } from "./glb.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "games/marsiin/models");

const BONES = [
  ["root", -1, [0, 0, 0]],
  ["hips", 0, [0, 0.95, 0]],
  ["chest", 1, [0, 1.12, 0]],
  ["head", 2, [0, 1.48, 0]],
  ["uarm.L", 2, [0.2, 1.4, 0]],
  ["farm.L", 4, [0.215, 1.13, 0]],
  ["uarm.R", 2, [-0.2, 1.4, 0]],
  ["farm.R", 6, [-0.215, 1.13, 0]],
  ["thigh.L", 1, [0.095, 0.93, 0]],
  ["shin.L", 8, [0.1, 0.5, 0]],
  ["thigh.R", 1, [-0.095, 0.93, 0]],
  ["shin.R", 10, [-0.1, 0.5, 0]],
];
const B = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// a box whose cross-section narrows from (w0, d0) at y0 to (w1, d1) at y1
function tbox(m, x, z, y0, y1, w0, d0, w1, d1, col, bone, skip = "") {
  const lo = [[-w0, -d0], [w0, -d0], [w0, d0], [-w0, d0]].map(([a, b]) => [x + a / 2, y0, z + b / 2]);
  const hi = [[-w1, -d1], [w1, -d1], [w1, d1], [-w1, d1]].map(([a, b]) => [x + a / 2, y1, z + b / 2]);
  const c = [x, (y0 + y1) / 2, z];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const mid = [(lo[i][0] + lo[j][0]) / 2 - c[0], 0, (lo[i][2] + lo[j][2]) / 2 - c[2]];
    m.face(lo[i], lo[j], hi[j], hi[i], mid, col, bone);
  }
  if (!skip.includes("b")) m.poly(lo, [0, -1, 0], col, bone);
  if (!skip.includes("t")) m.poly(hi, [0, 1, 0], col, bone);
}

function person(pal) {
  const m = new Mesh();
  const { shirt, trim, pants, skin, hair, sock, eye, patch } = pal;
  for (const [s, th, sh] of [[1, B["thigh.L"], B["shin.L"]], [-1, B["thigh.R"], B["shin.R"]]]) {
    m.box([0.1 * s, 0.045, 0.035], [0.1, 0.08, 0.24], sock, sh);                 // sock / soft shoe
    m.box([0.1 * s, 0.015, 0.035], [0.105, 0.03, 0.245], trim, sh);              // sole
    tbox(m, 0.1 * s, 0, 0.08, 0.5, 0.1, 0.11, 0.12, 0.13, pants, sh);            // shin
    tbox(m, 0.1 * s, 0, 0.49, 0.93, 0.13, 0.15, 0.16, 0.18, pants, th);          // thigh
    m.box([0.175 * s, 0.68, 0.0], [0.04, 0.14, 0.12], pants, th);                 // cargo pocket
    m.box([0.197 * s, 0.68, 0.0], [0.005, 0.03, 0.1], trim, th);                  // its flap
  }
  tbox(m, 0, 0, 0.86, 1.04, 0.33, 0.2, 0.34, 0.21, pants, B.hips);               // pelvis
  tbox(m, 0, 0, 1.02, 1.06, 0.35, 0.22, 0.35, 0.22, trim, B.hips, "bt");         // belt
  tbox(m, 0, 0, 1.04, 1.44, 0.33, 0.21, 0.4, 0.23, shirt, B.chest);              // torso
  m.box([0, 1.44, 0], [0.36, 0.04, 0.2], shirt, B.chest);                         // shoulders
  m.box([0, 1.41, 0.105], [0.14, 0.05, 0.03], trim, B.chest);                     // collar
  m.box([0.1, 1.3, 0.118], [0.08, 0.09, 0.01], patch, B.chest);                   // mission patch
  m.box([-0.1, 1.32, 0.118], [0.09, 0.025, 0.01], 0xf4f4f4, B.chest);             // name tag
  m.box([0, 1.2, 0.114], [0.012, 0.16, 0.01], trim, B.chest);                     // placket
  m.rod([0, 1.44, 0], [0, 1.52, 0.01], 0.048, 6, skin, B.head);                   // neck
  // head
  const hc = [0, 1.62, 0.01];
  m.ball(hc, 0.11, skin, B.head, 10, 6, 1.12);
  m.cap([hc[0], hc[1] + 0.012, hc[2] - 0.012], 0.118, hair, B.head, 10, 6, pal.long ? 4 : 3, 1.1, 1.05);
  if (pal.long) m.box([0, 1.56, -0.075], [0.2, 0.18, 0.06], hair, B.head);        // hair at the back
  for (const s of [1, -1]) {
    m.box([0.04 * s, 1.64, hc[2] + 0.1], [0.028, 0.03, 0.02], 0xffffff, B.head);  // eye white
    m.box([0.04 * s, 1.64, hc[2] + 0.108], [0.014, 0.02, 0.012], eye, B.head);    // pupil
    m.box([0.04 * s, 1.672, hc[2] + 0.1], [0.04, 0.008, 0.02], hair, B.head);     // brow
    m.box([0.11 * s, 1.62, hc[2]], [0.02, 0.05, 0.04], skin, B.head);             // ear
  }
  m.box([0, 1.61, hc[2] + 0.115], [0.025, 0.04, 0.03], skin, B.head);             // nose
  m.box([0, 1.575, hc[2] + 0.1], [0.05, 0.012, 0.02], 0xb5524a, B.head);          // mouth
  // arms
  for (const [s, ua, fa] of [[1, B["uarm.L"], B["farm.L"]], [-1, B["uarm.R"], B["farm.R"]]]) {
    tbox(m, 0.205 * s, 0, 1.26, 1.44, 0.12, 0.12, 0.12, 0.13, shirt, ua);         // sleeve
    tbox(m, 0.207 * s, 0, 1.11, 1.27, 0.085, 0.085, 0.095, 0.095, skin, ua, "t"); // upper arm
    if (s > 0) m.box([0.268, 1.37, 0], [0.01, 0.06, 0.06], patch, ua);            // flag patch
    tbox(m, 0.215 * s, 0, 0.9, 1.13, 0.07, 0.07, 0.085, 0.085, skin, fa);         // forearm
    m.box([0.215 * s, 1.0, 0], [0.075, 0.03, 0.075], pal.watch && s > 0 ? 0x222222 : skin, fa);
    m.ball([0.217 * s, 0.86, 0.01], 0.05, skin, fa, 6, 4, 1.2);                   // hand
  }
  return m;
}

function suit() {
  const m = new Mesh();
  const W = 0xf2f2ee, G = 0xc9c9c4, D = 0x555a60;
  for (const [s, th, sh] of [[1, B["thigh.L"], B["shin.L"]], [-1, B["thigh.R"], B["shin.R"]]]) {
    m.box([0.11 * s, 0.07, 0.04], [0.15, 0.14, 0.3], G, sh);                      // boot
    tbox(m, 0.11 * s, 0, 0.13, 0.5, 0.16, 0.17, 0.18, 0.19, W, sh);
    tbox(m, 0.11 * s, 0, 0.49, 0.93, 0.19, 0.2, 0.22, 0.23, W, th);
    m.box([0.11 * s, 0.5, 0], [0.2, 0.05, 0.21], G, sh);                           // knee joint
  }
  tbox(m, 0, 0, 0.84, 1.06, 0.42, 0.28, 0.44, 0.3, W, B.hips);
  tbox(m, 0, 0, 1.04, 1.46, 0.46, 0.32, 0.52, 0.34, W, B.chest);
  m.box([0, 1.22, 0.175], [0.3, 0.16, 0.06], G, B.chest);                         // chest controls
  for (let i = 0; i < 4; i++) m.box([-0.09 + i * 0.06, 1.22, 0.208], [0.03, 0.03, 0.01], [0xe63946, 0x2a9d8f, 0xffc93c, 0x457b9d][i], B.chest);
  m.box([0, 1.22, -0.29], [0.44, 0.56, 0.24], W, B.chest);                         // backpack
  m.box([0, 1.0, -0.4], [0.3, 0.06, 0.04], G, B.chest);
  m.box([0.2, 1.38, 0.12], [0.06, 0.06, 0.02], 0xe63946, B.chest);                // stripe (the commander's)
  m.ball([0, 1.66, 0.02], 0.19, W, B.head, 12, 7);                                 // helmet
  m.cap([0, 1.66, 0.07], 0.165, 0xc8962a, B.head, 12, 7, 4, 1, 1.0);               // gold visor (front)
  m.box([0, 1.48, 0], [0.34, 0.06, 0.3], G, B.head);                               // neck ring
  for (const [s, ua, fa] of [[1, B["uarm.L"], B["farm.L"]], [-1, B["uarm.R"], B["farm.R"]]]) {
    m.box([0.27 * s, 1.4, 0], [0.18, 0.16, 0.2], W, ua);                           // shoulder
    tbox(m, 0.27 * s, 0, 1.12, 1.36, 0.15, 0.15, 0.16, 0.16, W, ua);
    tbox(m, 0.275 * s, 0, 0.9, 1.13, 0.13, 0.13, 0.15, 0.15, W, fa);
    m.box([0.275 * s, 0.85, 0.01], [0.1, 0.11, 0.08], G, fa);                       // glove
  }
  return m;
}

// ---- clips: a pose (bone → [x, y, z] rotation, "hips@" → translation) of the phase 0…1 ----
const S = Math.sin, TAU = Math.PI * 2;
// the neutral body posture of weightlessness
const NBP = (k = 1) => ({
  "uarm.L": [-0.75 * k, 0, 0.28 * k], "uarm.R": [-0.75 * k, 0, -0.28 * k],
  "farm.L": [-0.85 * k, 0, 0], "farm.R": [-0.85 * k, 0, 0],
  "thigh.L": [-0.6 * k, 0, 0.06], "thigh.R": [-0.6 * k, 0, -0.06],
  "shin.L": [0.95 * k, 0, 0], "shin.R": [0.95 * k, 0, 0],
  chest: [0.1 * k, 0, 0], head: [0.12 * k, 0, 0],
});
const CLIPS = [
  ["Float", 4, true, (p) => {
    const w = S(p * TAU), v = S(p * TAU * 2 + 1);
    const o = NBP();
    o["uarm.L"][0] += 0.12 * w; o["uarm.R"][0] -= 0.1 * w;
    o["farm.L"][0] += 0.1 * v; o["farm.R"][0] -= 0.08 * v;
    o["shin.L"][0] += 0.08 * v; o["shin.R"][0] -= 0.06 * w;
    o.head = [0.12 + 0.05 * v, 0.25 * w, 0];
    o["hips@"] = [0, 0.015 * w, 0];
    return o;
  }],
  ["Glide", 2, true, (p) => {
    const w = S(p * TAU);
    return {
      "uarm.L": [-2.95, 0, 0.12], "uarm.R": [-2.95, 0, -0.12],
      "farm.L": [-0.12, 0, 0], "farm.R": [-0.12, 0, 0],
      "thigh.L": [0.05 + 0.1 * w, 0, 0.04], "thigh.R": [0.05 - 0.1 * w, 0, -0.04],
      "shin.L": [0.15 + 0.08 * w, 0, 0], "shin.R": [0.15 - 0.08 * w, 0, 0],
      chest: [-0.05, 0, 0], head: [-0.55, 0, 0],
    };
  }],
  ["Push", 0.7, false, (p) => {
    // arms come down from ahead to beside the hips as the hands shove
    const k = Math.min(1, p * 1.6), e = 1 - Math.pow(1 - k, 2);
    return {
      "uarm.L": [-1.3 + 1.6 * e, 0, 0.15], "uarm.R": [-1.3 + 1.6 * e, 0, -0.15],
      "farm.L": [-0.9 + 0.8 * e, 0, 0], "farm.R": [-0.9 + 0.8 * e, 0, 0],
      "thigh.L": [-0.5 + 0.55 * e, 0, 0.04], "thigh.R": [-0.5 + 0.55 * e, 0, -0.04],
      "shin.L": [0.9 - 0.8 * e, 0, 0], "shin.R": [0.9 - 0.8 * e, 0, 0],
      chest: [0.15 - 0.2 * e, 0, 0], head: [-0.2 * e, 0, 0],
    };
  }],
  ["Grab", 0.6, false, (p) => {
    const e = Math.min(1, p * 1.4);
    const o = NBP(1 - 0.4 * e);
    o["uarm.R"] = [-0.75 - 0.95 * e, 0, -0.28 + 0.15 * e];
    o["farm.R"] = [-0.85 + 0.6 * e, 0, 0];
    o.head = [0.12 - 0.2 * e, -0.2 * e, 0];
    return o;
  }],
  ["Hold", 1.5, true, (p) => {
    const w = S(p * TAU);
    return {
      "uarm.L": [-1.45, 0, 0.12], "uarm.R": [-1.55, 0, -0.12],
      "farm.L": [-0.35, 0, 0], "farm.R": [-0.3, 0, 0],
      "thigh.L": [0.15 + 0.05 * w, 0, 0.05], "thigh.R": [0.2 - 0.05 * w, 0, -0.05],
      "shin.L": [0.35, 0, 0], "shin.R": [0.3, 0, 0],
      chest: [0.05, 0, 0], head: [-0.2, 0, 0],
    };
  }],
  ["Work", 2, true, (p) => {
    const w = S(p * TAU * 2), v = S(p * TAU * 2 + 1.7);
    return {
      "uarm.L": [-0.45, 0, 0.12], "uarm.R": [-0.45, 0, -0.12],
      "farm.L": [-1.15 + 0.08 * w, 0.1, 0], "farm.R": [-1.15 + 0.08 * v, -0.1, 0],
      "thigh.L": [-0.35, 0, 0.05], "thigh.R": [-0.35, 0, -0.05],
      "shin.L": [0.55, 0, 0], "shin.R": [0.55, 0, 0],
      chest: [0.12, 0, 0], head: [0.32 + 0.04 * S(p * TAU), 0.1 * S(p * TAU), 0],
    };
  }],
  ["Eat", 3, true, (p) => {
    const k = (1 - Math.cos(p * TAU)) / 2;     // 0 → 1 → 0: the spoon to the mouth and back
    return {
      "uarm.L": [-0.6, 0, 0.2], "uarm.R": [-0.45 - 0.45 * k, 0, -0.25 + 0.1 * k],
      "farm.L": [-1.3, 0.3, 0], "farm.R": [-1.0 - 1.35 * k, -0.2 * k, 0],
      "thigh.L": [-0.5, 0, 0.06], "thigh.R": [-0.5, 0, -0.06],
      "shin.L": [0.85, 0, 0], "shin.R": [0.85, 0, 0],
      chest: [0.08, 0, 0], head: [0.15 - 0.1 * k, 0, 0],
    };
  }],
  ["Run", 0.72, true, (p) => {
    const w = S(p * TAU), c = Math.cos(p * TAU);
    return {
      "uarm.L": [-0.65 * w, 0, 0.12], "uarm.R": [0.65 * w, 0, -0.12],
      "farm.L": [-1.35, 0, 0], "farm.R": [-1.35, 0, 0],
      "thigh.L": [0.75 * w - 0.25, 0, 0.03], "thigh.R": [-0.75 * w - 0.25, 0, -0.03],
      "shin.L": [0.75 + 0.6 * c, 0, 0], "shin.R": [0.75 - 0.6 * c, 0, 0],
      chest: [0.15, 0.08 * w, 0], head: [-0.05, -0.06 * w, 0],
      "hips@": [0, 0.035 * Math.abs(c), 0],
    };
  }],
  ["Lift", 3.2, true, (p) => {
    const k = (1 - Math.cos(p * TAU)) / 2;     // 0 standing … 1 down in the squat
    return {
      "uarm.L": [-0.25, 0, 1.25], "uarm.R": [-0.25, 0, -1.25],
      "farm.L": [-1.9, 0, 0], "farm.R": [-1.9, 0, 0],
      "thigh.L": [-1.25 * k, 0, 0.08], "thigh.R": [-1.25 * k, 0, -0.08],
      "shin.L": [1.75 * k, 0, 0], "shin.R": [1.75 * k, 0, 0],
      chest: [0.35 * k, 0, 0], head: [-0.25 * k, 0, 0],
      "hips@": [0, -0.33 * k, -0.06 * k],
    };
  }],
  ["Sleep", 6, true, (p) => {
    const w = S(p * TAU);
    return {
      "uarm.L": [-1.15 + 0.06 * w, 0, 0.35], "uarm.R": [-1.15 - 0.05 * w, 0, -0.35],
      "farm.L": [-0.55, 0, 0], "farm.R": [-0.6, 0, 0],
      "thigh.L": [-0.2, 0, 0.04], "thigh.R": [-0.2, 0, -0.04],
      "shin.L": [0.3, 0, 0], "shin.R": [0.3, 0, 0],
      chest: [0.05 + 0.03 * w, 0, 0], head: [0.3, 0, 0.1],
    };
  }],
  ["Wave", 1.2, true, (p) => {
    const w = S(p * TAU);
    const o = NBP(0.7);
    o["uarm.R"] = [-0.2, 0, -2.55];
    o["farm.R"] = [0, 0, -0.35 * w - 0.1];
    o.head = [-0.05, -0.15, 0];
    return o;
  }],
  ["Look", 4, true, (p) => {
    const w = S(p * TAU), v = S(p * TAU * 0.5);
    return {
      "uarm.L": [-1.35, 0, 0.18], "uarm.R": [-1.35, 0, -0.18],
      "farm.L": [-0.45, 0, 0], "farm.R": [-0.45, 0, 0],
      "thigh.L": [-0.25, 0, 0.05], "thigh.R": [-0.25, 0, -0.05],
      "shin.L": [0.6, 0, 0], "shin.R": [0.6, 0, 0],
      chest: [0.1, 0, 0], head: [0.15 + 0.1 * w, 0.35 * v, 0],
    };
  }],
];

function clipTracks(dur, loop, fn) {
  const n = Math.max(8, Math.round(dur * 6));
  const times = steps(n, dur);
  const poses = times.map((t, i) => fn(loop ? (i % n) / n : i / n));
  const tracks = [];
  for (const [name, , rest] of BONES) {
    if (name === "root") continue;
    const bi = B[name];
    tracks.push([bi, "rotation", times, poses.flatMap((o) => { const r = o[name] || [0, 0, 0]; return qe(r[0], r[1], r[2]); })]);
    if (name === "hips") {
      const pr = BONES[bi][1] >= 0 ? BONES[BONES[bi][1]][2] : [0, 0, 0];
      tracks.push([bi, "translation", times, poses.flatMap((o) => { const d = o["hips@"] || [0, 0, 0]; return rest.map((x, k) => x - pr[k] + d[k]); })]);
    }
  }
  return tracks;
}
const clips = CLIPS.map(([name, dur, loop, fn]) => [name, clipTracks(dur, loop, fn)]);

// the crew: shirt colours tell them apart (no real people)
const CREW = {
  "astro-blue": { shirt: 0x2f6fd6, trim: 0x1d2a44, pants: 0x3b4252, skin: 0xf1c7a0, hair: 0x5a3a22, sock: 0x2b2b2b, eye: 0x2a4a7a, patch: 0xffc93c, watch: true },
  "astro-red": { shirt: 0xd84a3a, trim: 0x3a1d1d, pants: 0x5b5446, skin: 0xc68a5e, hair: 0x1b1b1b, sock: 0x444444, eye: 0x2a1a10, patch: 0x7bd3ff, long: true },
  "astro-green": { shirt: 0x2f9e6a, trim: 0x173b2a, pants: 0x2f3640, skin: 0xe9b98f, hair: 0xd8b25a, sock: 0x303030, eye: 0x3a6a3a, patch: 0xffffff, long: true, watch: true },
  "astro-yellow": { shirt: 0xf2b630, trim: 0x4a3510, pants: 0x3b4252, skin: 0x8d5a3b, hair: 0x141414, sock: 0x2a2a2a, eye: 0x1a1a1a, patch: 0x2f6fd6 },
};
fs.mkdirSync(OUT, { recursive: true });
for (const [name, pal] of Object.entries(CREW)) {
  const m = person(pal);
  const file = path.join(OUT, name + ".glb");
  fs.writeFileSync(file, writeGlb({ meshes: [{ name, mesh: m }], bones: BONES, clips, generator: "RangerGames tools/three/make-astronaut.mjs" }));
  console.log(file, m.tris, "triangles", fs.statSync(file).size, "bytes");
}
{
  const m = suit();
  const file = path.join(OUT, "suit.glb");
  const pose = [["Hang", clipTracks(4, true, (p) => ({ ...NBP(0.35), head: [0.05, 0, 0], "hips@": [0, 0.01 * S(p * TAU), 0] }))]];
  fs.writeFileSync(file, writeGlb({ meshes: [{ name: "suit", mesh: m }], bones: BONES, clips: pose, generator: "RangerGames tools/three/make-astronaut.mjs" }));
  console.log(file, m.tris, "triangles", fs.statSync(file).size, "bytes");
}
