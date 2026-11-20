#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The ship of games/marsiin: the International Space Station's pressurized
// modules with their real lengths and diameters, drawn in code as our own
// low-poly models (CC0), plus the station's outside, the stars, the Earth,
// Mars and the Sun.
//
//   node tools/three/make-iss.mjs
//     → games/marsiin/models/m-<module>.glb   inside of each module (lights baked in, unlit)
//       games/marsiin/models/hull.glb         the station from outside (truss, solar arrays)
//       games/marsiin/models/{sky,earth,mars,sun}.glb
//       games/marsiin/lib/station.ts          where the modules, hatches, free space and task spots are
//
// The planets' colours are sampled from web/textures/planets/{earth,mars}.jpg
// (Solar System Scope, CC BY 4.0) with python3 + Pillow.
//
// Axes (metres): x = the station's +X (forward, Harmony's end), y = up
// (zenith), z = starboard. Modules (lengths × diameters): Unity 5.47 × 4.57,
// Destiny 8.53 × 4.27, Harmony 7.2 × 4.4, Columbus 6.9 × 4.5, Kibo 11.2 × 4.4,
// Tranquility 6.7 × 4.48, Cupola 1.5 × 2.95, Leonardo 6.6 × 4.57, BEAM 4.0 ×
// 3.2, Quest 5.5 × 4.0, PMA-1 1.9, Zarya 12.6 × 4.1, Zvezda 13.1 × 4.15.
// Inside, the US, European and Japanese labs are a square of racks about
// 2.1 m across with lights on the slanted corners (the "standoffs"); hatches
// are 1.27 m squares (US) or 0.8 m (Russian).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Mesh, writeGlb, add, sub, mul, dot, cross, norm, rng } from "./glb.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GAME = path.join(ROOT, "games/marsiin");
const OUT = path.join(GAME, "models");

// ---- frames: o + p.x * x + p.y * y + p.z * z -------------------------------------
const Fr = (o, x, y, z) => ({ o, x, y, z });
const ap = (f, p) => add(f.o, add(mul(f.x, p[0]), add(mul(f.y, p[1]), mul(f.z, p[2]))));
const ad = (f, d) => add(mul(f.x, d[0]), add(mul(f.y, d[1]), mul(f.z, d[2])));
const inF = (f, g) => Fr(ap(f, g.o), ad(f, g.x), ad(f, g.y), ad(f, g.z));
const ID = Fr([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);

class Builder {
  constructor() { this.m = new Mesh(); this.stack = []; this.f = ID; this.sync(); }
  sync() { const f = this.f; this.m.xf = (p) => ap(f, p); }
  push(g) { this.stack.push(this.f); this.f = inF(this.f, g); this.sync(); }
  pop() { this.f = this.stack.pop(); this.sync(); }
  in(g, fn) { this.push(g); fn(); this.pop(); }
  emit(fn) { this.m.emit = true; fn(); this.m.emit = false; }
  world(p) { return ap(this.f, p); }
  wdir(d) { return ad(this.f, d); }
}

// ---- palettes ----------------------------------------------------------------------
const PAL = {
  us: { rack: 0xdcdad0, rack2: 0xd0cdc1, cham: 0xb3b9bf, rail: 0xa9b1ba, cone: 0xd8d8d1, cone2: 0xcacbc6, frame: 0x7e858c,
    bag: [0xeee8d6, 0xe2dac4, 0xf3f0e7, 0xd9d4c6], label: [0x2f6fd6, 0xd84a3a, 0xf2b630, 0x2f9e6a], panel: 0xc9ccd0, drawer: 0xb5b9be, dark: 0x2a2c30, foot: 0x3d6fb6 },
  eu: { rack: 0xd6dbe1, rack2: 0xc8ced6, cham: 0xaab4c0, rail: 0xa3aebb, cone: 0xd5dade, cone2: 0xc7cdd3, frame: 0x6f7a86,
    bag: [0xeceae0, 0xdfe3e6, 0xf2f2ec, 0xd5dbe0], label: [0x1c4f9c, 0x1c4f9c, 0xf2b630, 0x2f9e6a], panel: 0xc5ccd3, drawer: 0xb0b8c0, dark: 0x262a30, foot: 0x1c4f9c },
  jp: { rack: 0xe2e4df, rack2: 0xd5d8d2, cham: 0xb6bcb6, rail: 0xadb3ad, cone: 0xdfe1dc, cone2: 0xd1d4cf, frame: 0x7a817c,
    bag: [0xf0ece0, 0xe4e2d6, 0xf5f4ee, 0xdcdad0], label: [0xd94a3a, 0x2f6fd6, 0xd94a3a, 0x2f9e6a], panel: 0xcfd2cf, drawer: 0xbabdba, dark: 0x2a2c2a, foot: 0x3d6fb6 },
  ru: { rack: 0xd9d2a6, rack2: 0xcbcc9e, cham: 0xbfc7a2, rail: 0xebe5cc, cone: 0xd2cda6, cone2: 0xc4c49c, frame: 0x7c7a62,
    bag: [0xd8d8c2, 0xbcc6a4, 0xeae6d6, 0xc8c2a0], label: [0xd84a3a, 0x2f6fd6, 0xf2b630, 0xd84a3a], panel: 0xbab58e, drawer: 0xaaa580, dark: 0x2a2b26, foot: 0x6e5c48, deck: 0x6f5d4a },
  soft: { rack: 0xf2f0e9, rack2: 0xe9e6dc, cham: 0xe4e1d7, rail: 0xc8ccd0, cone: 0xeeece4, cone2: 0xe2dfd5, frame: 0x9a9a92,
    bag: [0xf0eadc, 0xe4dccb, 0xf6f4ee, 0xdcd6c8], label: [0x2f6fd6, 0xd84a3a, 0xf2b630, 0x2f9e6a], panel: 0xd0d0cb, drawer: 0xc0c0ba, dark: 0x2c2c2c, foot: 0x3d6fb6 },
};

// ---- small parts in "face space": x along the wall, y across it, z out of it (into the room)
function bag(b, P, rnd, x, y, w, h) {
  const d = 0.08 + rnd() * 0.08;
  const col = P.bag[Math.floor(rnd() * P.bag.length)];
  b.m.box([x, y, d / 2], [w, h, d], col, 0, "-z");
  b.m.box([x, y, d + 0.004], [w * 1.01, 0.022, 0.008], 0x9a9488, 0, "-z");                  // strap
  if (rnd() < 0.8) b.m.box([x + w * 0.22, y + h * 0.22, d + 0.005], [Math.min(0.12, w * 0.4), 0.06, 0.006], P.label[Math.floor(rnd() * P.label.length)], 0, "-z");
}
function rail(b, P, y, len = 0.72) {
  b.m.box([0, y, 0.075], [len, 0.032, 0.032], P.rail, 0, "-z");
  for (const s of [-1, 1]) b.m.box([s * (len / 2 - 0.05), y, 0.035], [0.035, 0.035, 0.06], P.rail, 0, "-z+z");
}
function screen(b, x, y, z, w, h, col) {
  b.m.box([x, y, z - 0.01], [w + 0.03, h + 0.03, 0.02], 0x1b1c1f, 0, "-z");
  b.emit(() => {
    b.m.quad([x - w / 2, y - h / 2, z + 0.002], [x + w / 2, y - h / 2, z + 0.002], [x + w / 2, y + h / 2, z + 0.002], [x - w / 2, y + h / 2, z + 0.002], col);
    // a lighter window on the screen
    b.m.quad([x - w * 0.38, y - h * 0.05, z + 0.004], [x + w * 0.1, y - h * 0.05, z + 0.004], [x + w * 0.1, y + h * 0.36, z + 0.004], [x - w * 0.38, y + h * 0.36, z + 0.004], 0xdff1ff);
  });
}
function laptop(b, x, y) {
  b.m.rod([x, y - 0.05, 0], [x, y - 0.05, 0.2], 0.018, 5, 0x55595f);
  b.m.box([x, y, 0.215], [0.34, 0.25, 0.022], 0x23252a);
  // the screen, hinged at the far edge and tilted towards the room
  b.in(Fr([x, y + 0.125, 0.226], [1, 0, 0], [0, 0.34, 0.94], [0, -0.94, 0.34]), () => {
    b.m.box([0, 0.125, 0.008], [0.34, 0.25, 0.016], 0x23252a);
    b.emit(() => {
      b.m.quad([-0.15, 0.02, 0.0175], [0.15, 0.02, 0.0175], [0.15, 0.23, 0.0175], [-0.15, 0.23, 0.0175], 0x4f8fd8);
      b.m.quad([-0.12, 0.12, 0.019], [0.02, 0.12, 0.019], [0.02, 0.21, 0.019], [-0.12, 0.21, 0.019], 0xe8f4ff);
    });
  });
}
function plate(b, col, x0 = -0.525, x1 = 0.525, y0 = -0.65, y1 = 0.65, z = 0) {
  b.m.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col);
}
// a wall with a square hole (half size q) in the middle; the hole's corners cut (an octagon)
function holed(b, col, x0, x1, y0, y1, q, z = 0, cut = 0.18) {
  const m = b.m;
  m.quad([x0, y0, z], [x1, y0, z], [x1, -q, z], [x0, -q, z], col);
  m.quad([x0, q, z], [x1, q, z], [x1, y1, z], [x0, y1, z], col);
  m.quad([x0, -q, z], [-q, -q, z], [-q, q, z], [x0, q, z], col);
  m.quad([q, -q, z], [x1, -q, z], [x1, q, z], [q, q, z], col);
  const c = q * cut * 2;
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) m.faceTri([sx * q, sy * q, z], [sx * (q - c), sy * q, z], [sx * q, sy * (q - c), z], [0, 0, 1], col);
}
// the hole's tunnel: from z0 to z1 (z1 < z0 goes out of the room), facing inside
function holeTunnel(b, col, q, z0, z1, cut = 0.18) {
  const c = q * cut * 2;
  const oct = [[q - c, q], [-(q - c), q], [-q, q - c], [-q, -(q - c)], [-(q - c), -q], [q - c, -q], [q, -(q - c)], [q, q - c]];
  for (let i = 0; i < 8; i++) {
    const a = oct[i], d = oct[(i + 1) % 8];
    const mid = [-(a[0] + d[0]) / 2, -(a[1] + d[1]) / 2, 0];
    b.m.face([a[0], a[1], z0], [d[0], d[1], z0], [d[0], d[1], z1], [a[0], a[1], z1], mid, i % 2 ? col : shadeHex(col, 0.93));
  }
}
function hatchRing(b, q, col) {
  const t = 0.05;
  b.m.box([0, q + t / 2, 0.02], [2 * q + 2 * t, t, 0.04], col, 0, "-z");
  b.m.box([0, -q - t / 2, 0.02], [2 * q + 2 * t, t, 0.04], col, 0, "-z");
  b.m.box([q + t / 2, 0, 0.02], [t, 2 * q, 0.04], col, 0, "-z");
  b.m.box([-q - t / 2, 0, 0.02], [t, 2 * q, 0.04], col, 0, "-z");
}
// a closed hatch filling a hole, at depth z (facing the room)
function hatchDoor(b, q, z, P, sign = 0xd84a3a) {
  const m = b.m;
  m.quad([-q, -q, z], [q, -q, z], [q, q, z], [-q, q, z], 0xb8bdc3);
  m.box([0, 0, z + 0.03], [q * 1.3, q * 1.3, 0.06], 0xc6cbd1, 0, "-z");
  m.box([0, -q * 0.35, z + 0.08], [q * 0.7, 0.05, 0.05], 0x4a4f55, 0, "-z");             // handle
  m.rod([0, q * 0.3, z + 0.065], [0, q * 0.3, z + 0.07], q * 0.2, 10, 0x2b3a55);       // little window
  b.emit(() => m.rod([0, q * 0.3, z + 0.07], [0, q * 0.3, z + 0.072], q * 0.15, 10, 0x0e1626));
  m.box([q * 0.45, -q * 0.05, z + 0.065], [q * 0.3, q * 0.18, 0.012], sign, 0, "-z");   // label
}
export function shadeHex(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), bb = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | bb;
}

// ---- racks (face space: x along the module, y across the wall, z into the room) -----
const RACK = {
  stow(b, P, rnd) {
    plate(b, P.rack2);
    const cols = rnd() < 0.5 ? 2 : 3, rows = 3;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (rnd() < 0.12) continue;
      const w = 1.0 / cols, h = 1.24 / rows;
      bag(b, P, rnd, -0.5 + w * (i + 0.5), -0.62 + h * (j + 0.5), w - 0.04, h - 0.05);
    }
  },
  exp(b, P, rnd) {
    plate(b, P.panel);
    for (let j = 0; j < 3; j++) {
      const y = -0.45 + j * 0.32;
      b.m.box([-0.18, y, 0.02], [0.56, 0.26, 0.04], P.drawer, 0, "-z");
      b.m.box([-0.18, y - 0.08, 0.05], [0.2, 0.025, 0.025], 0x2e3136, 0, "-z");
    }
    screen(b, 0.3, 0.3, 0.03, 0.26, 0.18, rnd() < 0.5 ? 0x3fbf7f : 0x4aa3ff);
    for (let k = 0; k < 3; k++) b.m.box([0.22 + k * 0.08, 0.02, 0.03], [0.04, 0.04, 0.05], [0xd84a3a, 0xf2b630, 0x2f9e6a][k], 0, "-z");
    b.m.box([0.3, -0.35, 0.03], [0.3, 0.4, 0.06], P.rack, 0, "-z");
  },
  laptop(b, P, rnd) {
    RACK.stow(b, P, rnd);
    laptop(b, 0.05, -0.1);
  },
  eclss(b, P, rnd) {
    plate(b, P.panel);
    for (let k = 0; k < 3; k++) b.m.rod([-0.4 + k * 0.12, -0.6, 0.05], [-0.4 + k * 0.12, 0.6, 0.05], 0.025, 6, [0xd7dade, 0x6aa6d8, 0xd7dade][k]);
    b.m.box([0.2, 0.25, 0.03], [0.5, 0.5, 0.06], P.drawer, 0, "-z");
    b.m.rod([0.2, 0.25, 0.06], [0.2, 0.25, 0.07], 0.17, 12, 0x3a3d42);                       // fan grille
    for (let k = -2; k <= 2; k++) b.m.box([0.2 + k * 0.06, 0.25, 0.075], [0.015, 0.3, 0.01], 0x6b6f75, 0, "-z");
    for (let k = 0; k < 2; k++) b.m.rod([0.05 + k * 0.25, -0.3, 0.04], [0.05 + k * 0.25, -0.3, 0.06], 0.06, 10, 0xf2f2f2);
    b.m.box([0.2, -0.45, 0.06], [0.45, 0.2, 0.12], 0x4f86c6, 0, "-z");                      // a water bag
  },
  glove(b, P, rnd) {
    plate(b, P.panel);
    b.m.box([0, 0.05, 0.2], [0.85, 0.7, 0.4], 0x8e959c, 0, "-z");
    b.emit(() => b.m.quad([-0.38, -0.12, 0.401], [0.38, -0.12, 0.401], [0.38, 0.36, 0.401], [-0.38, 0.36, 0.401], 0x37556e));
    for (const s of [-1, 1]) b.m.rod([s * 0.2, -0.22, 0.25], [s * 0.2, -0.22, 0.405], 0.07, 10, 0x1d1f22);
    screen(b, 0.32, -0.5, 0.02, 0.18, 0.1, 0x3fbf7f);
  },
  freezer(b, P, rnd) {
    plate(b, 0xf0f0ee);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      b.m.box([-0.25 + i * 0.5, -0.3 + j * 0.62, 0.02], [0.46, 0.56, 0.04], 0xe7e8ea, 0, "-z");
      b.m.box([-0.25 + i * 0.5, -0.3 + j * 0.62 + 0.2, 0.05], [0.25, 0.03, 0.03], 0x3a3d42, 0, "-z");
    }
    screen(b, 0, 0.02, 0.045, 0.12, 0.06, 0x7fe0ff);
  },
  veggie(b, P, rnd) {
    plate(b, P.panel);
    b.m.box([0, 0, 0.17], [0.7, 0.55, 0.34], 0xd9dce0, 0, "-z", 0xd9dce0);
    b.emit(() => {
      b.m.quad([-0.33, -0.25, 0.341], [0.33, -0.25, 0.341], [0.33, 0.25, 0.341], [-0.33, 0.25, 0.341], 0x5a2a4a);
      b.m.box([0, 0.24, 0.3], [0.62, 0.04, 0.06], 0xff5ad8, 0, "");
    });
    // lettuce under the pink light
    for (let k = 0; k < 6; k++) {
      const x = -0.22 + (k % 3) * 0.22, y = -0.12 + Math.floor(k / 3) * 0.2;
      b.m.box([x, y - 0.08, 0.36], [0.12, 0.05, 0.05], 0x7a5a3a);
      b.m.ball([x, y, 0.4], 0.075, k % 2 ? 0x5fbf4a : 0x7ad35a, 0, 6, 4);
    }
  },
  window(b, P, rnd) {
    const q = 0.26;
    holed(b, P.panel, -0.525, 0.525, -0.65, 0.65, q, 0, 0.2);
    holeTunnel(b, 0x5d636a, q, 0, -0.45, 0.2);
    hatchRing(b, q, P.frame);
    b.m.box([0.38, 0, 0.05], [0.12, 0.5, 0.1], P.drawer, 0, "-z");
  },
  cq(b, P, rnd) {
    plate(b, P.rack2);
    b.m.box([0, 0, 0.025], [0.92, 1.18, 0.05], 0xd6ccb0, 0, "-z");                          // the door
    for (let k = 0; k < 3; k++) b.m.box([0, -0.4 + k * 0.4, 0.052], [0.9, 0.012, 0.008], 0xbfb495, 0, "-z");
    b.m.box([0.32, 0, 0.065], [0.04, 0.22, 0.04], 0x4a4f55, 0, "-z");                       // handle
    b.m.box([-0.2, 0.42, 0.055], [0.22, 0.12, 0.01], 0xf4f4f4, 0, "-z");                    // name card
    b.m.box([-0.2, -0.42, 0.055], [0.3, 0.12, 0.01], 0x55595f, 0, "-z");                    // vent
  },
  // the player's crew quarters: open, a sleeping bag inside
  cqopen(b, P, rnd) {
    const hx = 0.45, hy = 0.6, D = 0.78;
    const m = b.m;
    m.quad([-0.525, -0.65, 0], [0.525, -0.65, 0], [0.525, -hy, 0], [-0.525, -hy, 0], P.rack2);
    m.quad([-0.525, hy, 0], [0.525, hy, 0], [0.525, 0.65, 0], [-0.525, 0.65, 0], P.rack2);
    m.quad([-0.525, -hy, 0], [-hx, -hy, 0], [-hx, hy, 0], [-0.525, hy, 0], P.rack2);
    m.quad([hx, -hy, 0], [0.525, -hy, 0], [0.525, hy, 0], [hx, hy, 0], P.rack2);
    const Y = 1.0;     // the recess is taller than its door, behind the corner panels
    m.quad([-hx, -Y, -D], [hx, -Y, -D], [hx, Y, -D], [-hx, Y, -D], 0xd9d2bf);
    m.face([-hx, -Y, 0], [-hx, Y, 0], [-hx, Y, -D], [-hx, -Y, -D], [1, 0, 0], 0xcfc8b4);
    m.face([hx, -Y, 0], [hx, Y, 0], [hx, Y, -D], [hx, -Y, -D], [-1, 0, 0], 0xcfc8b4);
    m.face([-hx, Y, 0], [hx, Y, 0], [hx, Y, -D], [-hx, Y, -D], [0, -1, 0], 0xc4bda9);
    m.face([-hx, -Y, 0], [hx, -Y, 0], [hx, -Y, -D], [-hx, -Y, -D], [0, 1, 0], 0xc4bda9);
    m.box([0, -0.05, -D + 0.07], [0.62, 1.55, 0.14], 0x3d6fb6, 0, "-z");                    // sleeping bag
    m.box([0, 0.55, -D + 0.15], [0.3, 0.16, 0.06], 0xf2f2f2, 0, "-z");                      // pillow strap
    b.emit(() => m.quad([-0.3, Y - 0.001, -0.5], [0.3, Y - 0.001, -0.5], [0.3, Y - 0.001, -0.3], [-0.3, Y - 0.001, -0.3], 0xfff6dc));
    m.box([0.3, -0.75, -D + 0.04], [0.12, 0.18, 0.08], 0xf2b630, 0, "-z");                  // a photo of home
    m.box([-0.32, 0.2, -D + 0.04], [0.14, 0.1, 0.06], 0xd84a3a, 0, "-z");
  },
  toilet(b, P, rnd) {
    plate(b, P.panel);
    for (let k = 0; k < 9; k++) b.m.box([-0.44 + k * 0.11, 0.0, 0.07 + (k % 2) * 0.03], [0.1, 1.2, 0.04], k % 2 ? 0x8fb7d9 : 0x7ea8cc, 0, "-z");
    b.m.rod([0.5, 0.2, 0.15], [0.3, -0.2, 0.25], 0.03, 6, 0xf2b630);
  },
  panelru(b, P, rnd) {
    plate(b, P.rack);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.m.box([-0.25 + i * 0.5, -0.31 + j * 0.62, 0.012], [0.47, 0.58, 0.024], j ? P.rack : P.rack2, 0, "-z");
    if (rnd() < 0.5) bag(b, P, rnd, -0.2, 0.25, 0.4, 0.35);
    if (rnd() < 0.5) bag(b, P, rnd, 0.25, -0.3, 0.35, 0.3);
    if (rnd() < 0.3) b.m.box([0.3, 0.35, 0.04], [0.16, 0.22, 0.02], [0xd84a3a, 0x2f6fd6, 0xf2b630][Math.floor(rnd() * 3)], 0, "-z");
  },
  soft(b, P, rnd) {
    plate(b, P.rack);
    for (let k = 0; k < 4; k++) b.m.box([-0.39 + k * 0.26, 0, 0.012], [0.02, 1.25, 0.02], 0xd8d4c8, 0, "-z");
    if (rnd() < 0.7) bag(b, P, rnd, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.5, 0.45, 0.4);
  },
};

// ---- the shapes of a module (local: x along it, y up, z the side) -------------------
const H = 1.05, C = 0.4;     // the racks' faces 2.1 m apart, corner panels 0.4 m

function octPts(Hh, Cc) {
  return [[Hh, -(Hh - Cc)], [Hh, Hh - Cc], [Hh - Cc, Hh], [-(Hh - Cc), Hh], [-Hh, Hh - Cc], [-Hh, -(Hh - Cc)], [-(Hh - Cc), -Hh], [Hh - Cc, -Hh]];
}
function sqPts(q) {
  return [[q, -q], [q, q], [q, q], [-q, q], [-q, q], [-q, -q], [-q, -q], [q, -q]];
}
const FACES = {
  top: { n: [0, -1, 0], c: (s, Hh) => [s, Hh, 0] },
  bottom: { n: [0, 1, 0], c: (s, Hh) => [s, -Hh, 0] },
  left: { n: [0, 0, 1], c: (s, Hh) => [s, 0, -Hh] },
  right: { n: [0, 0, -1], c: (s, Hh) => [s, 0, Hh] },
};
function faceFrame(name, s, Hh) {
  const fd = FACES[name], S = [1, 0, 0];
  return Fr(fd.c(s, Hh), S, cross(fd.n, S), fd.n);
}
// a ring between two outlines (lists of [y, z]) at x0 and x1, facing the axis
function loft(b, x0, A, x1, Bp, cols) {
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    const p = [[x0, A[i][0], A[i][1]], [x0, A[j][0], A[j][1]], [x1, Bp[j][0], Bp[j][1]], [x1, Bp[i][0], Bp[i][1]]];
    const mid = [0, -(A[i][0] + A[j][0] + Bp[i][0] + Bp[j][0]) / 4, -(A[i][1] + A[j][1] + Bp[i][1] + Bp[j][1]) / 4];
    if (x0 === x1) { mid[0] = cols.dir; mid[1] = 0; mid[2] = 0; }
    const col = cols.c[i % cols.c.length];
    const sameB = Bp[i][0] === Bp[j][0] && Bp[i][1] === Bp[j][1];
    const sameA = A[i][0] === A[j][0] && A[i][1] === A[j][1];
    if (sameB && sameA) continue;
    if (sameB) b.m.faceTri(p[0], p[1], p[2], mid, col);
    else if (sameA) b.m.faceTri(p[0], p[2], p[3], mid, col);
    else b.m.face(p[0], p[1], p[2], p[3], mid, col);
  }
}

class Module {
  constructor(id, style, len, frame) {
    this.id = id; this.style = style; this.len = len; this.F = frame;
    this.b = new Builder(); this.b.push(frame);
    this.P = PAL[style]; this.rnd = rng(id.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    this.lights = []; this.free = []; this.cam = []; this.spots = {}; this.ports = []; this.windows = [];
    this.bound = [];
  }
  light(p, i = 0.4, r = 1.3) { this.lights.push({ p: this.b.world(p), i, r }); }
  freeBox(x0, x1, hy, hz, cy = 0, cz = 0) {
    const a = this.b.world([x0, cy - hy, cz - hz]), c = this.b.world([x1, cy + hy, cz + hz]);
    this.free.push([...a.map((v, k) => Math.min(v, c[k])), ...a.map((v, k) => Math.max(v, c[k]))].map((v) => Math.round(v * 1000) / 1000));
  }
  spot(id, p, up, fwd, extra = {}) { this.spots[id] = { m: this.id, p: r3(this.b.world(p)), up: r3(this.b.wdir(up)), fwd: r3(this.b.wdir(fwd)), ...extra }; }

  tunnel(x0, x1, q, cut = 0.18) {
    this.b.in(Fr([0, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]), () => {
      // in this frame the tunnel goes along -z: z = -x
      holeTunnel(this.b, this.P.frame, q, -x0, -x1, cut);
    });
    this.freeBox(Math.min(x0, x1) - 0.05, Math.max(x0, x1) + 0.05, q - 0.24, q - 0.24);
  }
  // a flat end wall at x facing dir (+1: faces +x), with an open hole, a closed hatch or nothing
  bulkhead(x, dir, hh, q, kind, sign) {
    const fr = dir > 0 ? Fr([x, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0]) : Fr([x, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
    this.b.in(fr, () => {
      if (kind === "wall") plate(this.b, this.P.cone, -hh, hh, -hh, hh);
      else {
        holed(this.b, this.P.cone, -hh, hh, -hh, hh, q);
        hatchRing(this.b, q, this.P.frame);
        if (kind === "closed") { holeTunnel(this.b, this.P.frame, q, 0, -0.12); hatchDoor(this.b, q, -0.12, this.P, sign); }
      }
      // bags around the hatch
      const rnd = this.rnd;
      if (hh - q > 0.35) for (const [x, y] of [[-(q + hh) / 2, (q + hh) / 2], [(q + hh) / 2, -(q + hh) / 2], [(q + hh) / 2, (q + hh) / 2]]) if (rnd() < 0.8) bag(this.b, this.P, rnd, x, y, hh - q - 0.12, hh - q - 0.12);
    });
  }
  cone(x0, x1, A, Bp) {
    const P = this.P;
    loft(this.b, x0, A, x1, Bp, { c: [P.cone, P.cone2] });
    const qa = Math.min(...A.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1])))), qb = Math.min(...Bp.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1]))));
    this.freeBox(x0, x1, Math.min(qa, qb) - 0.24, Math.min(qa, qb) - 0.24);
  }
  // racks: slots of 1.05 m from x0, each { top, bottom, left, right } a rack kind
  racks(x0, slots, Hh = H, Cc = C, opts = {}) {
    const P = this.P, b = this.b, rnd = this.rnd;
    const x1 = x0 + slots.length * 1.05;
    // corner panels and the light strips on the upper ones
    for (const [sy, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = [sy * Hh, sz * (Hh - Cc)], c = [sy * (Hh - Cc), sz * Hh];
      b.m.face([x0, a[0], a[1]], [x1, a[0], a[1]], [x1, c[0], c[1]], [x0, c[0], c[1]], [0, -sy, -sz], P.cham);
      if (sy > 0 && !opts.dim) {
        const n = norm([0, -sy, -sz]);
        const L = (k) => [a[0] + (c[0] - a[0]) * k + n[1] * 0.012, a[1] + (c[1] - a[1]) * k + n[2] * 0.012];
        const p0 = L(0.3), p1 = L(0.7);
        for (let k = 0; k < slots.length; k++) {
          const s0 = x0 + k * 1.05 + 0.15, s1 = s0 + 0.75;
          b.emit(() => b.m.face([s0, p0[0], p0[1]], [s1, p0[0], p0[1]], [s1, p1[0], p1[1]], [s0, p1[0], p1[1]], [0, -sy, -sz], 0xfffbf0));
          this.light([s0 + 0.375, sy * (Hh - Cc / 2) - sy * 0.15, sz * (Hh - Cc / 2) - sz * 0.15], 0.42, 1.25);
        }
      } else if (sy < 0) {
        // cables and a strap along the lower corners
        const k = 0.5, pp = [a[0] + (c[0] - a[0]) * k - sy * 0.03, a[1] + (c[1] - a[1]) * k - sz * 0.03];
        b.m.rod([x0 + 0.05, pp[0], pp[1]], [x1 - 0.05, pp[0], pp[1]], 0.02, 4, 0x3a3d42, 0, false);
      }
    }
    // dark seams between the racks
    for (let k = 0; k <= slots.length; k++) for (const f of ["top", "bottom", "left", "right"]) {
      b.in(faceFrame(f, x0 + k * 1.05, Hh), () => b.m.box([0, 0, 0.004], [0.03, 2 * (Hh - Cc), 0.008], 0x5a5e63, 0, "-z"));
    }
    slots.forEach((slot, k) => {
      const sc = x0 + k * 1.05 + 0.525;
      for (const f of ["top", "bottom", "left", "right"]) {
        const kind = slot[f] || "stow";
        b.in(faceFrame(f, sc, Hh), () => {
          const kk = kind.split(":")[0];
          (RACK[kk] || RACK.stow)(b, P, rnd);
          if (kk !== "cqopen" && kk !== "window" && !opts.norail) rail(b, P, (f === "bottom" ? -1 : 1) * (Hh - Cc - 0.08) * ((k % 2) ? 1 : -1));
          if (f === "bottom" && opts.feet !== false && rnd() < 0.6) b.m.box([0.2 - rnd() * 0.4, (rnd() - 0.5) * 0.6, 0.05], [0.28, 0.06, 0.1], P.foot, 0, "-z");
        });
        if (kind === "cqopen" || kind === "window") this.windowAt(kind, f, sc, Hh);
      }
    });
    this.freeBox(x0 - 0.05, x1 + 0.05, Hh - 0.36, Hh - 0.36);
    this.cam.push([x0, x1, Hh - 0.12]);
    return x1;
  }
  windowAt(kind, f, sc, Hh) {
    const fr = faceFrame(f, sc, Hh);
    const p = ap(this.F, ap(fr, [0, 0, 0])), n = ad(this.F, fr.z);
    if (kind === "window") this.windows.push({ p: r3(p), n: r3(n) });
  }
  // a node: an open room (half size N) from x0 to x1 with hatches in the middle of its walls
  node(x0, x1, N, ports) {
    const P = this.P, b = this.b, rnd = this.rnd;
    const xc = (x0 + x1) / 2, L = x1 - x0;
    for (const f of ["top", "bottom", "left", "right"]) {
      const port = ports[f];
      b.in(faceFrame(f, xc, N), () => {
        const q = port ? port.q : 0.64;
        if (port) {
          holed(b, P.cone, -L / 2, L / 2, -N, N, q);
          hatchRing(b, q, P.frame);
          if (port.kind === "open") {
            b.in(Fr([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]), () => holeTunnel(b, P.frame, q, 0, -(port.d - N)));
          } else {
            holeTunnel(b, P.frame, q, 0, -0.14);
            hatchDoor(b, q, -0.14, P, port.sign);
          }
        } else plate(b, P.cone, -L / 2, L / 2, -N, N);
        // stowage around
        for (const sx of [-1, 1]) {
          const w = (L / 2 - q) - 0.1;
          if (w > 0.2) for (const sy of [-1, 0, 1]) if (rnd() < 0.75) bag(b, P, rnd, sx * (q + 0.05 + w / 2), sy * (N * 0.6), w, N * 0.5);
        }
        if (f === "top") for (const s of [-1, 1]) b.emit(() => b.m.quad([-L / 2 + 0.2, s * (N - 0.12) - 0.07, 0.01], [L / 2 - 0.2, s * (N - 0.12) - 0.07, 0.01], [L / 2 - 0.2, s * (N - 0.12) + 0.07, 0.01], [-L / 2 + 0.2, s * (N - 0.12) + 0.07, 0.01], 0xfffbf0));
        if (f === "top" || f === "bottom") rail(b, P, (N - 0.2) * (f === "top" ? 1 : -1), Math.min(1.2, L - 0.3));
      });
      if (port && port.kind === "open") {
        // the free way out through the hatch
        const fr = faceFrame(f, xc, N);
        const lo = ap(fr, [-(port.q - 0.24), -(port.q - 0.24), 0.2]), hi = ap(fr, [port.q - 0.24, port.q - 0.24, -(port.d - N) - 0.05]);
        const a = this.b.world(lo), c = this.b.world(hi);
        this.free.push([...a.map((v, k) => Math.min(v, c[k])), ...a.map((v, k) => Math.max(v, c[k]))].map((v) => Math.round(v * 1000) / 1000));
      }
    }
    for (let x = x0 + 0.5; x < x1 - 0.2; x += 1.2) for (const s of [-1, 1]) this.light([x, N - 0.25, s * (N - 0.35)], 0.4, 1.4);
    this.freeBox(x0 - 0.15, x1 + 0.15, N - 0.36, N - 0.36);
    this.cam.push([x0, x1, N - 0.12]);
  }
  // the step from a rack square up to a node's room (at x, the room on the dir side)
  step(x, Hh, Cc, N, dir) {
    loft(this.b, x, octPts(Hh, Cc), x, sqPts(N).map((v, i) => [Math.sign(v[0]) * N, Math.sign(v[1]) * N]), { c: [this.P.cone], dir });
  }
  finish() {
    this.b.pop();
    bake(this.b.m, this.lights);
    return this.b.m;
  }
}

// the lights baked into the colours: a little light everywhere, more from above,
// and each lamp (Lambert with a soft fall-off)
function bake(m, lights, amb = 0.34) {
  const P = m.P, C = m.C, N = m.N;
  for (let t = 0; t < m.I.length / 3; t++) {
    if (m.E[t]) continue;
    const i0 = m.I[t * 3];
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) c[a] += P[m.I[t * 3 + k] * 3 + a] / 3;
    const n = [N[i0 * 3], N[i0 * 3 + 1], N[i0 * 3 + 2]];
    let l = amb + 0.12 * (0.5 + 0.5 * n[1]);
    for (const L of lights) {
      const d = sub(L.p, c);
      const dist = Math.hypot(d[0], d[1], d[2]);
      if (dist > L.r * 5) continue;
      const lam = Math.max(0, dot(n, d) / (dist || 1));
      l += L.i * lam / (1 + (dist / L.r) * (dist / L.r));
    }
    l = Math.min(1.05, l);
    const tint = [l * 1.0, l * 0.98, l * 0.93];
    for (let k = 0; k < 3; k++) { const v = m.I[t * 3 + k]; for (let a = 0; a < 3; a++) C[v * 3 + a] = Math.min(1, C[v * 3 + a] * tint[a]); }
  }
}

RACK.plain = (b, P) => plate(b, P.panel === undefined ? P.rack : P.rack);
RACK.cqru = (b, P, rnd) => {
  plate(b, P.rack2);
  b.m.box([0, 0, 0.03], [0.9, 1.2, 0.06], 0xbfb98f, 0, "-z");
  b.m.rod([-0.2, 0.3, 0.06], [-0.2, 0.3, 0.07], 0.09, 10, 0x2b3a55);                      // the cabin's little window
  b.m.box([0.32, 0, 0.075], [0.04, 0.2, 0.04], 0x4a4f55, 0, "-z");
};

// ---- the modules -----------------------------------------------------------------------
const US_Q = 0.64, RU_Q = 0.44, GAP = 0.2;
const OCT = octPts(H, C);
const SQ = (q) => sqPts(q);
const frameFor = (start, axis) => {
  const A = axis;
  const U = Math.abs(A[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
  return Fr(start, A, U, cross(A, U));
};
const modules = [];
const hatches = [];
function mod(id, style, len, start, axis, build) {
  const M = new Module(id, style, len, frameFor(start, axis));
  M.start = start; M.axis = axis;
  build(M);
  modules.push(M);
  return M;
}
// a port of M at local point p going along local dir: the child starts at the port's plane
function portStart(M, p, dir) { return r3(ap(M.F, p)).map((v, i) => v + 0); }
function link(a, b, p) { hatches.push({ a, b, p: r3(p) }); }

// Unity (Node 1): 5.47 m, six hatches
const unity = mod("unity", "us", 5.47, [-2.735, 0, 0], [1, 0, 0], (M) => {
  const N = 1.2;
  M.tunnel(-GAP, 0.4, US_Q);
  M.bulkhead(0.4, 1, N, US_Q, "open");
  M.node(0.4, 5.07, N, {
    left: { kind: "open", q: US_Q, d: 2.285 + GAP },       // -z: Tranquility
    right: { kind: "open", q: US_Q, d: 2.285 + GAP },      // +z: Quest
    top: { kind: "closed", q: US_Q, sign: 0xd84a3a },      // the truss (Z1)
    bottom: { kind: "closed", q: US_Q, sign: 0xf2b630 },   // a cargo ship's berth
  });
  M.bulkhead(5.07, -1, N, US_Q, "open");
  M.tunnel(5.07, 5.47 + GAP, US_Q);
  M.spot("unity", [2.735, -0.85, 0], [0, 1, 0], [0, 0, 1]);
});
// Destiny (US Lab): 8.53 m, 24 racks
const destiny = mod("destiny", "us", 8.53, [2.735 + GAP, 0, 0], [1, 0, 0], (M) => {
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.95, SQ(US_Q), OCT);
  const x1 = M.racks(0.95, [
    { top: "exp", bottom: "stow", left: "eclss:cdra", right: "laptop" },
    { top: "stow", bottom: "exp", left: "glove", right: "freezer" },
    { top: "laptop", bottom: "window", left: "exp", right: "stow" },
    { top: "exp", bottom: "stow", left: "eclss", right: "exp" },
    { top: "stow", bottom: "exp", left: "laptop", right: "glove" },
    { top: "exp", bottom: "stow", left: "stow", right: "freezer" },
  ]);
  M.cone(x1, x1 + 0.65, OCT, SQ(US_Q));
  M.tunnel(x1 + 0.65, 8.53 + GAP, US_Q);
  M.spot("cdra", [0.95 + 0.525, -0.85, -0.5], [0, 1, 0], [0, 0, -1]);
  M.spot("earthcall", [0.95 + 0.525, -0.85, 0.48], [0, 1, 0], [0, 0, 1]);
  M.spot("glovebox", [0.95 + 1.05 + 0.525, -0.85, -0.3], [0, 1, 0], [0, 0, -1]);
  M.spot("destwindow", [0.95 + 2.1 + 0.525 - 0.85, -0.55, 0], [1, 0, 0], [0, -1, 0]);
  M.spot("npc_destiny", [0.95 + 4.2 + 0.525, -0.85, -0.5], [0, 1, 0], [0, 0, -1]);
});
// Harmony (Node 2): 7.2 m, four crew quarters, the labs' hatches
const harmonyStart = 2.735 + GAP + 8.53 + GAP;
const harmony = mod("harmony", "us", 7.2, [harmonyStart, 0, 0], [1, 0, 0], (M) => {
  const N = 1.2;
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.9, SQ(US_Q), OCT);
  const x1 = M.racks(0.9, [
    { top: "cq", bottom: "cq", left: "cq", right: "cqopen" },
    { top: "stow", bottom: "exp", left: "stow", right: "eclss" },
    { top: "exp", bottom: "stow", left: "laptop", right: "stow" },
  ]);
  M.step(x1, H, C, N, 1);
  M.node(x1, 6.75, N, {
    right: { kind: "open", q: US_Q, d: 2.2 + GAP },        // +z: Columbus
    left: { kind: "open", q: US_Q, d: 2.2 + GAP },         // -z: Kibo
    top: { kind: "closed", q: US_Q, sign: 0x2f6fd6 },      // docking port (IDA-3)
    bottom: { kind: "closed", q: US_Q, sign: 0xf2b630 },
  });
  M.bulkhead(6.75, -1, N, US_Q, "closed", 0x2f6fd6);      // the return capsule's hatch (IDA-2)
  M.spot("sleep", [0.9 + 0.525, -0.9, 1.45], [0, 1, 0], [0, 0, -1]);
  M.spot("bed_front", [0.9 + 0.525, -0.85, 0.3], [0, 1, 0], [0, 0, 1]);
  M.spot("npc_harmony", [5.3, -0.85, 0.3], [0, 1, 0], [-1, 0, 0]);
  M.hubX = x1 + (6.75 - x1) / 2;
});
const hubX = harmonyStart + harmony.hubX;
// Columbus (ESA): 6.9 m
const columbus = mod("columbus", "eu", 6.9, [hubX, 0, 2.2 + GAP], [0, 0, 1], (M) => {
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.9, SQ(US_Q), OCT);
  const x1 = M.racks(0.9, [
    { top: "exp", bottom: "stow", left: "exp", right: "laptop" },
    { top: "stow", bottom: "exp", left: "veggie", right: "freezer" },
    { top: "exp", bottom: "stow", left: "glove", right: "exp" },
    { top: "laptop", bottom: "exp", left: "stow", right: "eclss" },
    { top: "stow", bottom: "stow", left: "exp", right: "stow" },
  ]);
  M.cone(x1, 6.6, OCT, SQ(0.75));
  M.bulkhead(6.6, -1, 0.75, 0.4, "wall");
  M.spot("plants", [0.9 + 1.05 + 0.525, -0.85, -0.25], [0, 1, 0], [0, 0, -1]);
  M.spot("npc_columbus", [0.9 + 3.15 + 0.525, -0.85, 0.5], [0, 1, 0], [0, 0, 1]);
});
// Kibo (JEM pressurized module): 11.2 m, two windows at its end
const kibo = mod("kibo", "jp", 11.2, [hubX, 0, -(2.2 + GAP)], [0, 0, -1], (M) => {
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.9, SQ(US_Q), OCT);
  const kinds = ["exp", "stow", "laptop", "freezer", "glove", "eclss"];
  const slots = [];
  for (let k = 0; k < 9; k++) slots.push({ top: kinds[k % 6], bottom: k === 4 ? "window" : kinds[(k + 2) % 6], left: kinds[(k + 4) % 6], right: kinds[(k + 1) % 6] });
  slots[6].left = "laptop";
  const x1 = M.racks(0.9, slots);
  M.cone(x1, 10.9, OCT, SQ(0.5));
  M.bulkhead(10.9, -1, 0.5, 0.36, "closed", 0xd94a3a);   // the small airlock for experiments
  M.spot("crystals", [0.9 + 6.3 + 0.525, -0.85, -0.5], [0, 1, 0], [0, 0, -1]);
  M.spot("kibowindow", [0.9 + 4.2 + 0.525 - 0.85, -0.55, 0], [1, 0, 0], [0, -1, 0]);
  M.spot("npc_kibo", [0.9 + 2.1 + 0.525, -0.85, 0.5], [0, 1, 0], [0, 0, 1]);
});
// Tranquility (Node 3): 6.7 m, life support, the treadmill, the squat machine, the toilet, the Cupola
const tranqStart = [0, 0, -(2.285 + GAP)];
const tranquility = mod("tranquility", "us", 6.7, tranqStart, [0, 0, -1], (M) => {
  const N = 1.2;
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.9, SQ(US_Q), OCT);
  const x1 = M.racks(0.9, [
    { top: "eclss", bottom: "stow", left: "toilet", right: "eclss:wrs" },
    { top: "stow", bottom: "plain", left: "plain", right: "eclss" },
    { top: "stow", bottom: "plain", left: "stow", right: "exp" },
  ], H, C, { feet: false });
  M.step(x1, H, C, N, 1);
  M.node(x1, 6.35, N, {
    right: { kind: "open", q: US_Q, d: 2.24 + GAP },       // +x: Leonardo
    left: { kind: "open", q: US_Q, d: 2.24 + GAP },        // -x: BEAM
    bottom: { kind: "open", q: US_Q, d: 2.24 + GAP },      // nadir: the Cupola
    top: { kind: "closed", q: US_Q, sign: 0xd84a3a },
  });
  M.bulkhead(6.35, -1, N, US_Q, "closed", 0xd84a3a);
  M.hubX = x1 + (6.35 - x1) / 2;
  // the treadmill (T2) on the wall: the runner's feet on the left wall
  const b = M.b;
  b.in(faceFrame("left", 0.9 + 1.05 + 0.525, H), () => {
    b.m.box([0, 0, 0.07], [0.98, 0.62, 0.14], 0x55595f, 0, "-z");
    b.m.box([0, 0, 0.145], [0.92, 0.5, 0.01], 0x1d1e20, 0, "-z");                      // the belt
    for (const s of [-1, 1]) b.m.box([0, s * 0.3, 0.2], [0.9, 0.04, 0.12], 0x9aa0a6, 0, "-z");
    screen(b, 0.4, 0.5, 0.05, 0.16, 0.1, 0x3fbf7f);
  });
  // the squat machine (ARED) on the deck of the third bay
  b.in(faceFrame("bottom", 0.9 + 2.1 + 0.525, H), () => {
    b.m.box([0, 0, 0.05], [0.9, 0.9, 0.1], 0x7d838a, 0, "-z");
    for (const s of [-1, 1]) {
      b.m.rod([s * 0.42, 0.42, 0.1], [s * 0.42, 0.42, 1.3], 0.035, 6, 0xb8bec4);
      b.m.rod([s * 0.38, -0.3, 0.1], [s * 0.38, -0.3, 0.55], 0.12, 8, 0x3a3d42);         // the vacuum cylinders
    }
    b.m.rod([-0.6, 0.0, 1.35], [0.6, 0.0, 1.35], 0.03, 6, 0x2a2c30);                     // the bar
    b.m.rod([-0.42, 0.42, 1.3], [-0.42, 0.0, 1.35], 0.03, 5, 0xb8bec4);
    b.m.rod([0.42, 0.42, 1.3], [0.42, 0.0, 1.35], 0.03, 5, 0xb8bec4);
  });
  M.spot("treadmill", [0.9 + 1.05 + 0.525, 0, -H + 0.15], [0, 0, 1], [1, 0, 0]);
  M.spot("ared", [0.9 + 2.1 + 0.525, -H + 0.1, 0], [0, 1, 0], [-1, 0, 0]);
  M.spot("water", [0.9 + 0.525, -0.85, 0.5], [0, 1, 0], [0, 0, 1]);
  M.spot("toilet", [0.9 + 0.525, -0.85, -0.5], [0, 1, 0], [0, 0, -1]);
});
const tranqHub = [0, 0, tranqStart[2] - tranquility.hubX];
// Cupola: 1.5 m high, 2.95 m wide, seven windows (the middle one 80 cm)
const cupola = mod("cupola", "us", 1.5, [tranqHub[0], -(2.24 + GAP), tranqHub[2]], [0, -1, 0], (M) => {
  const b = M.b, P = M.P;
  M.tunnel(0, 0.4, 0.62);
  // the floor ring from the hatch out to the windows' base, facing into the dome
  const R0 = 1.3, R1 = 0.62, x0 = 0.45, x1 = 1.3;
  const hex = (r, x, k) => { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; return [x, Math.cos(a) * r, Math.sin(a) * r]; };
  for (let k = 0; k < 6; k++) {
    const sq = (kk) => { const a = (kk / 6) * Math.PI * 2 + Math.PI / 6; const c = Math.cos(a), s = Math.sin(a); const m = 0.62 / Math.max(Math.abs(c), Math.abs(s)); return [x0 - 0.05, c * m, s * m]; };
    b.m.face(sq(k), sq(k + 1), hex(R0, x0, k + 1), hex(R0, x0, k), [1, 0, 0], 0xb9bec4);
    b.m.face([0.4, ...sq(k).slice(1)], [0.4, ...sq(k + 1).slice(1)], sq(k + 1), sq(k), [0, -(sq(k)[1] + sq(k + 1)[1]), -(sq(k)[2] + sq(k + 1)[2])], 0xa9aeb4);
    // a side window: a frame around a smaller trapezoid hole
    const A = hex(R0, x0, k), Bq = hex(R0, x0, k + 1), Cq = hex(R1, x1, k + 1), D = hex(R1, x1, k);
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    const cen = mul(add(add(A, Bq), add(Cq, D)), 0.25);
    const ins = [A, Bq, Cq, D].map((p) => lerp(p, cen, 0.22));
    const inward = [0.3, -cen[1], -cen[2]];
    const fr = [A, Bq, Cq, D];
    for (let e = 0; e < 4; e++) b.m.face(fr[e], fr[(e + 1) % 4], ins[(e + 1) % 4], ins[e], inward, e % 2 ? 0xc7ccd2 : 0xb3b8be);
    // the window's thickness
    const outd = norm([-0.3, cen[1], cen[2]]);
    for (let e = 0; e < 4; e++) {
      const p = ins[e], q = ins[(e + 1) % 4];
      b.m.face(p, q, add(q, mul(outd, 0.08)), add(p, mul(outd, 0.08)), sub(cen, mul(add(p, q), 0.5)), 0x6b7178);
    }
    M.windows.push({ p: r3(b.world(cen)), n: r3(b.wdir(norm(inward))) });
    // the top ring between the hexagon and the round middle window
    const rw = 0.4;
    const c1 = (kk) => { const a = (kk / 6) * Math.PI * 2 + Math.PI / 6; return [x1 + 0.02, Math.cos(a) * rw, Math.sin(a) * rw]; };
    b.m.face(D, Cq, c1(k + 1), c1(k), [-1, 0, 0], 0xc0c5cb);
  }
  // the middle window's rim
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2, rw = 0.4;
    const p = (a, x) => [x, Math.cos(a) * rw * 0.97, Math.sin(a) * rw * 0.97];
    b.m.face(p(a0, 1.32), p(a1, 1.32), p(a1, 1.42), p(a0, 1.42), [0, -Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2)], 0x6b7178);
  }
  M.windows.push({ p: r3(b.world([1.35, 0, 0])), n: r3(b.wdir([-1, 0, 0])) });
  // the robotic workstation: two laptops and hand controllers on the floor ring
  b.in(Fr([0.45, 0.95, 0], [0, -1, 0], [0, 0, 1], [1, 0, 0]), () => { laptop(b, -0.25, 0); laptop(b, 0.25, 0); });
  b.m.box([0.5, -0.9, 0.3], [0.1, 0.12, 0.1], 0x2a2c30);
  b.m.box([0.5, -0.9, -0.3], [0.1, 0.12, 0.1], 0x2a2c30);
  M.light([0.9, 0, 0], 0.5, 1.4);
  M.light([1.6, 0, 0], 0.9, 1.5);     // the planet's light through the windows
  M.freeBox(0.05, 0.75, 0.6, 0.6);
  M.freeBox(0.4, 0.95, 0.75, 0.75);
  M.cam.push([0, 1.0, 0.9]);
  M.spot("cupola", [-0.45, 0, 0], [1, 0, 0], [0, 1, 0]);
});
// Leonardo (Permanent Multipurpose Module): 6.6 m of stowage
mod("leonardo", "us", 6.6, [2.24 + GAP, 0, tranqHub[2]], [1, 0, 0], (M) => {
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.9, SQ(US_Q), OCT);
  const slots = [];
  for (let k = 0; k < 5; k++) slots.push({ top: "stow", bottom: k === 2 ? "freezer" : "stow", left: "stow", right: k === 1 ? "exp" : "stow" });
  const x1 = M.racks(0.9, slots);
  M.cone(x1, 6.35, OCT, SQ(0.7));
  M.bulkhead(6.35, -1, 0.7, 0.4, "wall");
  M.spot("food", [0.9 + 2.1 + 0.525, -0.85, 0.5], [0, 1, 0], [0, 0, 1]);
});
// BEAM (Bigelow Expandable Activity Module): 4 m long, soft walls
mod("beam", "soft", 4.0, [-(2.24 + GAP), 0, tranqHub[2]], [-1, 0, 0], (M) => {
  M.tunnel(0, 0.35, 0.5);
  M.cone(0.35, 0.8, SQ(0.5), octPts(1.2, 0.5));
  const x1 = M.racks(0.8, [{ top: "soft", bottom: "soft", left: "soft", right: "soft" }, { top: "soft", bottom: "soft", left: "soft", right: "soft" }], 1.2, 0.5, { norail: true });
  M.cone(x1, 3.75, octPts(1.2, 0.5), SQ(0.6));
  M.bulkhead(3.75, -1, 0.6, 0.4, "wall");
  M.spot("beam", [2.0, -0.85, 0.5], [0, 1, 0], [0, 0, 1]);
});
// Quest (the US airlock): the equipment lock with spacesuits, the crew lock
mod("quest", "us", 5.5, [0, 0, 2.285 + GAP], [0, 0, 1], (M) => {
  M.tunnel(0, 0.3, US_Q);
  M.cone(0.3, 0.8, SQ(US_Q), octPts(1.1, 0.42));
  const x1 = M.racks(0.8, [
    { top: "stow", bottom: "exp", left: "plain", right: "plain" },
    { top: "laptop", bottom: "stow", left: "eclss", right: "stow" },
  ], 1.1, 0.42);
  M.cone(x1, 3.2, octPts(1.1, 0.42), SQ(0.5));
  M.tunnel(3.2, 3.4, 0.5);
  M.cone(3.4, 3.5, SQ(0.5), octPts(0.85, 0.3));
  M.racks(3.5, [{ top: "plain", bottom: "plain", left: "plain", right: "plain" }], 0.85, 0.3, { norail: false, feet: false });
  M.cone(4.55, 5.0, octPts(0.85, 0.3), SQ(0.5));
  M.bulkhead(5.0, -1, 0.5, 0.42, "closed", 0xd84a3a);     // the hatch to space: keep shut
  M.spot("suits", [0.8 + 0.525, -0.85, 0.28], [0, 1, 0], [0, 0, -1]);
  M.spot("suit1", [0.8 + 0.525, -0.95, -0.72], [0, 1, 0], [0, 0, 1]);
  M.spot("suit2", [0.8 + 0.525, -0.95, 0.72], [0, 1, 0], [0, 0, -1]);
});
// PMA-1: the bent cone between the US and Russian sides
const pmaStart = [-2.735 - GAP, 0, 0];
mod("pma1", "us", 1.9, pmaStart, [-1, 0, 0], (M) => {
  M.cone(0, 1.9, SQ(US_Q), SQ(RU_Q));
  M.freeBox(0, 2.0, RU_Q - 0.22, RU_Q - 0.22);
  M.cone(1.9, 1.9 + 0.1, SQ(RU_Q), SQ(RU_Q));
  // a few bags strapped in the cone
  const b = M.b;
  for (const [x, f] of [[0.6, "top"], [1.1, "left"], [0.8, "right"]]) b.in(faceFrame(f, x, 0.6), () => bag(b, M.P, M.rnd, 0, 0, 0.32, 0.3));
  M.light([0.95, 0.35, 0], 0.35, 1.0);
});
// Zarya (FGB): 12.6 m, Russian-built, stowage
const zaryaStart = [pmaStart[0] - 2.0, 0, 0];
mod("zarya", "ru", 12.6, zaryaStart, [-1, 0, 0], (M) => {
  const N = 1.0, h = 1.15, c = 0.42;
  M.tunnel(0, 0.35, RU_Q, 0.3);
  M.bulkhead(0.35, 1, N, RU_Q, "open");
  M.node(0.35, 2.3, N, { bottom: { kind: "closed", q: RU_Q, sign: 0xd84a3a } });
  M.step(2.3, h, c, N, -1);
  const slots = [];
  for (let k = 0; k < 9; k++) slots.push({ top: "panelru", bottom: k === 3 ? "stow" : "panelru", left: k % 3 === 1 ? "stow" : "panelru", right: k % 4 === 2 ? "laptop" : "panelru" });
  const x1 = M.racks(2.3, slots, h, c);
  M.cone(x1, x1 + 0.6, octPts(h, c), SQ(RU_Q));
  M.tunnel(x1 + 0.6, 12.6 + GAP, RU_Q, 0.3);
  M.spot("zaryabags", [2.3 + 4.2 + 0.525, -0.85, 0.5], [0, 1, 0], [0, 0, 1]);
});
// Zvezda (the service module): 13.1 m, the galley table, two cabins, the aft hatch
const zvezdaStart = [zaryaStart[0] - 12.6 - GAP, 0, 0];
mod("zvezda", "ru", 13.1, zvezdaStart, [-1, 0, 0], (M) => {
  const b = M.b, P = M.P;
  const N = 1.0;
  M.tunnel(0, 0.35, RU_Q, 0.3);
  M.bulkhead(0.35, 1, N, RU_Q, "open");
  M.node(0.35, 2.3, N, { top: { kind: "closed", q: RU_Q, sign: 0xd84a3a }, bottom: { kind: "closed", q: RU_Q, sign: 0xd84a3a } });
  M.bulkhead(2.3, -1, N, RU_Q, "open");
  M.tunnel(2.3, 2.6, RU_Q, 0.3);
  // the narrow part: the control desk and laptops
  const hs = 0.98, cs = 0.36;
  M.cone(2.6, 2.75, SQ(RU_Q), octPts(hs, cs));
  M.racks(2.75, [
    { top: "panelru", bottom: "panelru", left: "laptop", right: "laptop" },
    { top: "panelru", bottom: "panelru", left: "panelru", right: "exp" },
    { top: "panelru", bottom: "panelru", left: "panelru", right: "panelru" },
  ], hs, cs);
  // the wide part
  const hw = 1.2, cw = 0.45;
  M.cone(5.9, 6.5, octPts(hs, cs), octPts(hw, cw));
  M.racks(6.5, [
    { top: "panelru", bottom: "panelru", left: "panelru", right: "panelru" },
    { top: "panelru", bottom: "plain", left: "panelru", right: "panelru" },
    { top: "panelru", bottom: "window", left: "stow", right: "toilet" },
    { top: "panelru", bottom: "panelru", left: "cqru", right: "cqru" },
  ], hw, cw, { feet: false });
  // the galley table in the middle of the deck, with food tins and the water dispenser
  b.in(faceFrame("bottom", 6.5 + 1.05 + 0.525, hw), () => {
    b.m.box([0, 0, 0.25], [0.12, 0.12, 0.5], 0x8a8a80, 0, "-z");
    b.m.box([0, 0, 0.53], [0.95, 0.6, 0.06], 0xd9d2b4, 0, "", 0xb8b296);
    for (let k = 0; k < 5; k++) b.m.rod([-0.3 + k * 0.15, (k % 2) * 0.15 - 0.05, 0.56], [-0.3 + k * 0.15, (k % 2) * 0.15 - 0.05, 0.62], 0.04, 6, [0xc9a84a, 0xd84a3a, 0xc9a84a, 0x2f9e6a, 0xc9a84a][k]);
    b.m.box([0.32, -0.18, 0.6], [0.14, 0.1, 0.08], 0xf2f2f2, 0, "-z");                   // a food bag
  });
  b.in(faceFrame("left", 6.5 + 1.05 + 0.525, hw), () => {
    b.m.box([0.2, -0.3, 0.12], [0.3, 0.4, 0.24], 0xd0d0cc, 0, "-z");                    // water dispenser
    b.m.rod([0.2, -0.5, 0.2], [0.2, -0.62, 0.2], 0.015, 5, 0x3a6fb6);
  });
  M.cone(10.7, 11.2, octPts(hw, cw), SQ(0.6));
  M.tunnel(11.2, 12.7, 0.6, 0.3);
  M.bulkhead(12.7, -1, 0.6, RU_Q, "closed", 0xf2b630);   // the cargo ship's hatch
  M.spot("galley", [6.5 + 1.05 + 0.525 + 0.6, -hw + 0.12, 0], [0, 1, 0], [-1, 0, 0]);
  M.spot("galley2", [6.5 + 1.05 + 0.525 - 0.62, -hw + 0.12, 0.1], [0, 1, 0], [1, 0, 0]);
  M.spot("galley3", [6.5 + 1.05 + 0.525, -hw + 0.12, 0.6], [0, 1, 0], [0, 0, -1]);
  M.spot("zvezdadesk", [2.75 + 0.525, -0.8, -0.45], [0, 1, 0], [0, 0, -1]);
  M.spot("shelter", [10.2, -1.05, 0], [0, 1, 0], [1, 0, 0]);
  M.spot("zvezdawindow", [6.5 + 2.1 + 0.525 - 0.85, -0.65, 0], [1, 0, 0], [0, -1, 0]);
});

// ---- the station from outside: hulls, the truss, solar arrays, radiators -------------
function hull() {
  const m = new Mesh();
  const W = 0xe9e9e4, W2 = 0xe0e0da, W3 = 0xc8c8c0;
  const cyl = (a, bb, r, seg = 16, cols = [W, W2]) => {
    const ax = norm(sub(bb, a));
    const t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), v = cross(ax, u);
    const len = Math.hypot(...sub(bb, a));
    const rings = Math.max(1, Math.round(len / 1.4));
    for (let j = 0; j < rings; j++) {
      const p0 = add(a, mul(ax, (len * j) / rings)), p1 = add(a, mul(ax, (len * (j + 1)) / rings));
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const q = (p, an) => add(p, add(mul(u, Math.cos(an) * r), mul(v, Math.sin(an) * r)));
        const out = add(mul(u, Math.cos((a0 + a1) / 2)), mul(v, Math.sin((a0 + a1) / 2)));
        m.face(q(p0, a0), q(p0, a1), q(p1, a1), q(p1, a0), out, cols[(i + j) % cols.length]);
      }
    }
    // end caps (cones)
    for (const [p, s] of [[a, -1], [bb, 1]]) {
      const tip = add(p, mul(ax, s * r * 0.35));
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const q = (an) => add(p, add(mul(u, Math.cos(an) * r), mul(v, Math.sin(an) * r)));
        m.faceTri(q(a0), q(a1), tip, add(mul(ax, s), mul(add(mul(u, Math.cos(a0)), mul(v, Math.sin(a0))), 0.5)), W3);
      }
    }
  };
  for (const M of modules) {
    if (M.id === "cupola" || M.id === "pma1") continue;
    const R = { unity: 2.285, destiny: 2.135, harmony: 2.2, columbus: 2.25, kibo: 2.2, tranquility: 2.24, leonardo: 2.285, beam: 1.6, quest: 2.0, zarya: 2.05, zvezda: 2.07 }[M.id] || 2;
    const a = M.start, bb = add(M.start, mul(M.axis, M.len));
    if (M.id === "zvezda") {
      cyl(a, add(a, mul(M.axis, 2.3)), 1.3);
      cyl(add(a, mul(M.axis, 2.3)), add(a, mul(M.axis, 6.0)), 1.45);
      cyl(add(a, mul(M.axis, 6.4)), add(a, mul(M.axis, 11.2)), 2.07);
      cyl(add(a, mul(M.axis, 11.2)), bb, 1.0, 12);
    } else if (M.id === "quest") {
      cyl(a, add(a, mul(M.axis, 3.3)), 2.0);
      cyl(add(a, mul(M.axis, 3.3)), bb, 1.0, 12);
    } else cyl(a, bb, R);
  }
  // PMA-1 and the Cupola
  cyl(pmaStart, add(pmaStart, [-2.0, 0, 0]), 1.0, 12);
  {
    const c0 = cupola.start;
    cyl(c0, add(c0, [0, -0.5, 0]), 1.3, 12);
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + Math.PI / 6, a1 = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      const P = (r, y, a) => [c0[0] + Math.cos(a) * r, c0[1] + y, c0[2] + Math.sin(a) * r];
      const A = P(1.48, -0.5, a0), Bq = P(1.48, -0.5, a1), Cq = P(0.75, -1.45, a1), D = P(0.75, -1.45, a0);
      const out = [Math.cos((a0 + a1) / 2), -0.8, Math.sin((a0 + a1) / 2)];
      m.face(A, Bq, Cq, D, out, 0xc9ccd0);
      const cen = mul(add(add(A, Bq), add(Cq, D)), 0.25);
      const ins = [A, Bq, Cq, D].map((p) => add(p, mul(sub(cen, p), 0.25)));
      m.face(...ins.map((p) => add(p, mul(norm(out), 0.01))), out, 0x1a2a40);
      m.faceTri(D, Cq, [c0[0], c0[1] - 1.5, c0[2]], [0, -1, 0], 0xc9ccd0);
    }
  }
  // the truss across the top of Destiny (along z), 109 m, with radiators and solar arrays
  const ty = 3.6, tx = 7.2;
  m.box([tx, ty, 0], [4.5, 1.6, 100], 0xb9bcc0, 0, "", 0xa7aaae);
  m.box([tx, ty - 1.4, 0], [1.2, 1.4, 1.2], 0xb9bcc0);
  for (const z of [-14, -9, 9, 14]) m.box([tx, ty + 6, z], [0.3, 11, 3.4], 0xf4f4f0, 0, "", 0xe0e0dc);   // radiators
  for (const zs of [-1, 1]) for (const zc of [34, 46]) {
    const z = zs * zc;
    m.box([tx, ty, z], [5, 2.2, 3], 0x9a9da2);
    for (const xs of [-1, 1]) {
      const x0 = tx + xs * 2.6, x1 = tx + xs * 34;
      for (const off of [-3.3, 3.3]) {
        const za = z + off - 2.6, zb = z + off + 2.6;
        // the blanket: dark blue cells in front (up), golden at the back
        m.face([x0, ty, za], [x1, ty, za], [x1, ty, zb], [x0, ty, zb], [0, 1, 0], 0x23305e);
        m.face([x0, ty - 0.02, za], [x1, ty - 0.02, za], [x1, ty - 0.02, zb], [x0, ty - 0.02, zb], [0, -1, 0], 0xb07a34);
        for (let k = 1; k < 8; k++) {
          const xk = x0 + (x1 - x0) * k / 8;
          m.face([xk - xs * 0.08, ty + 0.01, za], [xk + xs * 0.08, ty + 0.01, za], [xk + xs * 0.08, ty + 0.01, zb], [xk - xs * 0.08, ty + 0.01, zb], [0, 1, 0], 0x6b6f78);
        }
      }
      m.box([(x0 + x1) / 2, ty, z], [Math.abs(x1 - x0), 0.25, 0.25], 0x8e9196);           // the mast
    }
  }
  return m;
}

// ---- the sky: stars as tiny triangles on a sphere of radius 1 (scaled in the game) --
function sky() {
  const m = new Mesh();
  const rnd = rng(1234);
  m.emit = true;
  for (let i = 0; i < 900; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const p = [r * Math.cos(th), u, r * Math.sin(th)];
    const mag = Math.pow(rnd(), 3);
    const s = 0.0012 + mag * 0.0028;
    const t = Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const a = norm(cross(p, t)), bb = cross(p, a);
    const c = add(p, [0, 0, 0]);
    const tint = rnd();
    const col = tint < 0.15 ? 0xffd9b0 : tint < 0.3 ? 0xcfe0ff : 0xffffff;
    const k = 0.45 + mag * 0.55;
    const cc = shadeHex(col, k);
    m.faceTri(add(c, mul(a, s)), add(c, mul(add(mul(a, -0.5), mul(bb, 0.87)), s)), add(c, mul(add(mul(a, -0.5), mul(bb, -0.87)), s)), mul(p, -1), cc);
  }
  // the Milky Way: a faint band of more, smaller stars
  for (let i = 0; i < 700; i++) {
    const th = rnd() * Math.PI * 2, w = (rnd() - 0.5) * 0.25;
    const p0 = [Math.cos(th), w, Math.sin(th)];
    const tilt = 1.05;
    const p = norm([p0[0], p0[1] * Math.cos(tilt) - p0[2] * Math.sin(tilt), p0[1] * Math.sin(tilt) + p0[2] * Math.cos(tilt)]);
    const s = 0.001 + rnd() * 0.0012;
    const t = Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const a = norm(cross(p, t)), bb = cross(p, a);
    m.faceTri(add(p, mul(a, s)), add(p, mul(add(mul(a, -0.5), mul(bb, 0.87)), s)), add(p, mul(add(mul(a, -0.5), mul(bb, -0.87)), s)), mul(p, -1), shadeHex(0xdfe6ff, 0.35 + rnd() * 0.3));
  }
  return m;
}

// ---- planets: an icosphere coloured from the map, lit from +x (baked: the game turns
// the model so that its +x looks at the Sun) ---------------------------------------------
function texture(name) {
  const py = `
import json,sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB').resize((256,128), Image.BILINEAR)
print(json.dumps(list(im.getdata())))`;
  const out = execFileSync("python3", ["-I", "-c", py, path.join(ROOT, "web/textures/planets", name + ".jpg")], { maxBuffer: 1 << 26 }).toString();
  return JSON.parse(out);
}
function icosphere(sub_) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub_; s++) {
    const cache = {};
    const mid = (a, b) => { const k = a < b ? a + "_" + b : b + "_" + a; if (cache[k] === undefined) { v.push(norm(mul(add(v[a], v[b]), 0.5))); cache[k] = v.length - 1; } return cache[k]; };
    const nf = [];
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return { v, f };
}
function planet(name, opts) {
  const tex = texture(name);
  const { v, f } = icosphere(opts.sub);
  const m = new Mesh();
  m.emit = true;
  const L = [1, 0, 0];
  for (const [a, b, c] of f) {
    const cen = norm(add(add(v[a], v[b]), v[c]));
    // the map: longitude around y, latitude from y (the planet's axis is y)
    const lon = Math.atan2(cen[2], cen[0]), lat = Math.asin(cen[1]);
    const u = ((lon / (Math.PI * 2)) + 0.5) % 1, w = 0.5 - lat / Math.PI;
    const px = tex[Math.min(127, Math.floor(w * 128)) * 256 + Math.min(255, Math.floor(u * 256))];
    let col = [px[0] / 255, px[1] / 255, px[2] / 255];
    const lam = dot(cen, L);
    const day = Math.max(0, Math.min(1, lam * 1.2 + 0.08));
    let k = 0.025 + 0.975 * Math.pow(day, 0.75);
    // the edge of the disc is a little brighter in the air (Earth) / the dust (Mars)
    col = col.map((x, i) => Math.min(1, x * k + opts.air[i] * Math.pow(Math.max(0, day), 0.6) * 0.12));
    const hex = (Math.round(col[0] * 255) << 16) | (Math.round(col[1] * 255) << 8) | Math.round(col[2] * 255);
    m.tri(v[a], v[b], v[c], hex);
  }
  return m;
}
function sun() {
  const m = new Mesh();
  m.emit = true;
  const { v, f } = icosphere(2);
  for (const [a, b, c] of f) m.tri(v[a], v[b], v[c], 0xfff8e6);
  // a glow: a flat ring facing +x... (the game turns it to face the ship)
  for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
    m.face([0, Math.cos(a0) * 1.05, Math.sin(a0) * 1.05], [0, Math.cos(a0) * 2.4, Math.sin(a0) * 2.4], [0, Math.cos(a1) * 2.4, Math.sin(a1) * 2.4], [0, Math.cos(a1) * 1.05, Math.sin(a1) * 1.05], [1, 0, 0], 0x8a7a52);
  }
  return m;
}

// ---- write everything ------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const gen = "RangerGames tools/three/make-iss.mjs";
let total = 0;
const info = [];
for (const M of modules) {
  const m = M.finish();
  const file = path.join(OUT, "m-" + M.id + ".glb");
  fs.writeFileSync(file, writeGlb({ meshes: [{ name: M.id, mesh: m, unlit: true, compact: true }], generator: gen }));
  total += m.tris;
  console.log(path.relative(ROOT, file), m.tris, "triangles", (fs.statSync(file).size / 1024).toFixed(0), "KB");
}
console.log("inside, all modules:", total, "triangles");
for (const [name, m, unlit] of [["hull", hull(), false], ["sky", sky(), true], ["sun", sun(), true],
  ["earth", planet("earth", { sub: 4, air: [0.35, 0.55, 1.0] }), true], ["mars", planet("mars", { sub: 4, air: [0.9, 0.55, 0.35] }), true]]) {
  const file = path.join(OUT, name + ".glb");
  fs.writeFileSync(file, writeGlb({ meshes: [{ name, mesh: m, unlit, compact: unlit }], generator: gen }));
  console.log(path.relative(ROOT, file), m.tris, "triangles", (fs.statSync(file).size / 1024).toFixed(0), "KB");
}

// hatches between modules: where two modules' free boxes meet
const adj = {};
for (const M of modules) adj[M.id] = [];
const ov = (a, b) => a[0] < b[3] && b[0] < a[3] && a[1] < b[4] && b[1] < a[4] && a[2] < b[5] && b[2] < a[5];
for (let i = 0; i < modules.length; i++) for (let j = i + 1; j < modules.length; j++) {
  for (const a of modules[i].free) for (const bx of modules[j].free) {
    if (ov(a, bx)) {
      const p = [0, 1, 2].map((k) => (Math.max(a[k], bx[k]) + Math.min(a[k + 3], bx[k + 3])) / 2);
      if (!adj[modules[i].id].includes(modules[j].id)) {
        adj[modules[i].id].push(modules[j].id); adj[modules[j].id].push(modules[i].id);
        hatches.push({ a: modules[i].id, b: modules[j].id, p: r3(p) });
      }
    }
  }
}
const spots = {};
for (const M of modules) Object.assign(spots, M.spots);
const ts = `// Generated by tools/three/make-iss.mjs: do not edit by hand (run it again).
// Where the ship's modules are (metres; x forward, y up, z starboard).

// each module: the box around its inside, its axis, where it starts, its length
export const MODULES: { id: string; box: number[]; axis: number[]; start: number[]; len: number }[] = ${JSON.stringify(modules.map((M) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of M.free) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], f[k]); hi[k] = Math.max(hi[k], f[k + 3]); }
  return { id: M.id, box: r3([...lo, ...hi]), axis: M.axis, start: r3(M.start), len: M.len };
}))};

// where the body's centre may be: [x0, y0, z0, x1, y1, z1, module index]
export const FREE: number[][] = ${JSON.stringify(modules.flatMap((M, i) => M.free.map((f) => [...f, i])))};

// hatches between modules (a, b) and their middle
export const HATCHES: { a: string; b: string; p: number[] }[] = ${JSON.stringify(hatches)};

// windows: a point on the glass and the way into the room
export const WINDOWS: { m: string; p: number[]; n: number[] }[] = ${JSON.stringify(modules.flatMap((M) => M.windows.map((w) => ({ m: M.id, ...w }))))};

// places where things are done: the feet's place, up and forward
export const SPOTS: { [id: string]: { m: string; p: number[]; up: number[]; fwd: number[] } } = ${JSON.stringify(spots, null, 0)};
`;
fs.mkdirSync(path.join(GAME, "lib"), { recursive: true });
fs.writeFileSync(path.join(GAME, "lib/station.ts"), ts);
console.log("lib/station.ts:", modules.length, "modules,", hatches.length, "hatches,", Object.keys(spots).length, "spots");
