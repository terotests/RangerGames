#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The sounds of games/marsiin, synthesized here (our own, CC0):
//   node tools/three/make-iss-sounds.mjs → games/marsiin/sounds/{hum,hiss,alarm,engine}.wav
// hum: the fans that keep the air moving (a seamless loop; the station is
// never quiet), hiss: air escaping through a leak, alarm: the caution tone,
// engine: the rumble of a burn through the structure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "games/marsiin/sounds");
const SR = 22050;
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };

function wav(file, s) {
  const n = s.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, file), b);
  console.log(file, (b.length / 1024).toFixed(0), "KB");
}
// a one-pole low pass run around a loop twice, so its end meets its start
function lowLoop(x, a) {
  const y = new Float32Array(x.length);
  let v = 0;
  for (let k = 0; k < 2; k++) for (let i = 0; i < x.length; i++) { v += a * (x[i] - v); y[i] = v; }
  return y;
}
fs.mkdirSync(OUT, { recursive: true });
{
  const n = SR * 6;
  const w = Float32Array.from({ length: n }, () => rnd());
  const a = lowLoop(lowLoop(w, 0.08), 0.12), b = lowLoop(w, 0.5);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // whole cycles in 6 s, so the loop has no seam
    s[i] = a[i] * 2.2 + (b[i] - a[i]) * 0.12 + Math.sin(2 * Math.PI * 120 * t) * 0.025 + Math.sin(2 * Math.PI * 240 * t) * 0.01 + Math.sin(2 * Math.PI * 97 * t) * 0.012 * (1 + Math.sin(2 * Math.PI * t / 3));
  }
  let mx = 0; for (const v of s) mx = Math.max(mx, Math.abs(v));
  wav("hum.wav", s.map((v) => v / mx * 0.35));
}
{
  const n = Math.round(SR * 0.8);
  let p = 0;
  const s = Float32Array.from({ length: n }, (_, i) => { const x = rnd(); const h = x - p; p = x; const e = Math.min(1, i / 800, (n - i) / 3000); return h * 0.35 * e; });
  wav("hiss.wav", s);
}
{
  const n = Math.round(SR * 1.3);
  const s = Float32Array.from({ length: n }, (_, i) => {
    const t = i / SR, k = Math.floor(t / 0.32);
    const f = k % 2 ? 660 : 880, on = (t % 0.32) < 0.24 && k < 4;
    const e = on ? Math.min(1, (t % 0.32) * 200, (0.24 - (t % 0.32)) * 200) : 0;
    return (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 3 * t) * 0.25) * 0.35 * e;
  });
  wav("alarm.wav", s);
}
{
  const n = Math.round(SR * 1.8);
  const w = Float32Array.from({ length: n }, () => rnd());
  const lo = lowLoop(lowLoop(w, 0.02), 0.04);
  const s = new Float32Array(n);
  let mx = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; s[i] = lo[i] * 4 + Math.sin(2 * Math.PI * 38 * t + Math.sin(t * 7) * 0.5) * 0.25; mx = Math.max(mx, Math.abs(s[i])); }
  wav("engine.wav", s.map((v, i) => v / mx * 0.7 * Math.min(1, i / 2000, (n - i) / 4000)));
}
