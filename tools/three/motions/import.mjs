// Turn a motion clip (glTF/GLB animation or BVH) into the joint-position JSON
// that make-cat.mjs retargets (tools/three/motions/<name>.json).
//   node tools/three/motions/import.mjs <file.glb|file.bvh> [animation name] <out name> [source note]
// Sources (TradeFrontier art/motion): Quaternius Universal Animation Library
// (CC0), ACCAD motion capture (CC BY 3.0: credit in CREDITS.md).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fromBVH, fromGLTF } from "../retarget.mjs";
const args = process.argv.slice(2);
const file = args[0];
const isBVH = file.endsWith(".bvh");
const anim = isBVH ? null : args[1];
const out = isBVH ? args[1] : args[2];
const note = isBVH ? args[2] : args[3];
const frames = isBVH ? fromBVH(fs.readFileSync(file, "utf8")) : fromGLTF(fs.readFileSync(file), anim);
const r = (v) => Math.round(v * 1000) / 1000;
const json = { source: note || path.basename(file) + (anim ? " / " + anim : ""), frames: frames.map((f) => ({ t: r(f.t), J: Object.fromEntries(Object.entries(f.J).map(([k, p]) => [k, p.map(r)])) })) };
const dst = path.join(path.dirname(fileURLToPath(import.meta.url)), out + ".json");
fs.writeFileSync(dst, JSON.stringify(json));
console.log(dst, frames.length, "frames", Object.keys(frames[0].J).join(","));
