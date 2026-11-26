// SPDX-License-Identifier: AGPL-3.0-or-later
// Compiles every built-in shader stage (shaders/, assembled by rg_cli as the
// hosts get them) in WebGL2, headless Chromium (Playwright): web and Android
// (RG_YS=-1.0) defines both. GLES 3 on the phone takes the same GLSL ES 3.00.
// usage: node tests/shaders-compile.mjs   (cargo builds rg_cli first)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [];
for (const defs of ["RG_YS=1.0;RG_DEPTH=1", "RG_YS=-1.0"]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rgsh-"));
  const out = execFileSync("cargo", ["run", "-q", "--release", "-p", "rg_cli", "--", "shaders", dir, defs], { cwd: root, encoding: "utf8" });
  for (const f of out.trim().split("\n")) files.push({ name: path.relative(dir, f) + " [" + defs + "]", vs: f.endsWith(".vs"), src: fs.readFileSync(f, "utf8") });
}
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
const res = await page.evaluate((files) => {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return [{ name: "webgl2", log: "no WebGL2" }];
  return files.map((f) => {
    const sh = gl.createShader(f.vs ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
    gl.shaderSource(sh, f.src); gl.compileShader(sh);
    return { name: f.name, log: gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? "" : gl.getShaderInfoLog(sh) };
  });
}, files);
await browser.close();
let bad = 0;
for (const r of res) {
  console.log((r.log ? "FAIL " : "ok   ") + r.name + (r.log ? "\n" + r.log : ""));
  if (r.log) bad++;
}
process.exit(bad ? 1 : 0);
