// SPDX-License-Identifier: AGPL-3.0-or-later
// The globe shader of web/js/painter.js (SPHERE_FS, GLSL ES 3.00) as a file
// for the phone (android/.../GlSphere.java reads assets/shaders/sphere.fs),
// so both draw globes with the same code.
// usage: node scripts/sphere-shader.mjs <out.fs>
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(new URL("../web/js/painter.js", import.meta.url), "utf8");
const m = src.match(/var SPHERE_FS = ([\s\S]*?");\n/);
if (!m) throw new Error("SPHERE_FS not found in web/js/painter.js");
const fsText = Function("return " + m[1])();
if (!fsText.startsWith("#version 300 es")) throw new Error("SPHERE_FS is not GLSL ES 3.00");
const out = process.argv[2];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, fsText.replace(/; /g, ";\n"));
console.log(out + ": " + fsText.length + " chars");
