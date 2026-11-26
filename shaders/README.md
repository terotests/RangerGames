# shaders/

The engine's GLSL, one source for every host. Each file here is a built-in of
`crates/rg_shader` (its build.rs lists the folder, so a new file needs no code
change). Hosts ask the engine for a stage by its path and get one finished
GLSL ES 3.00 source:

- web: `web/js/host.js` → `rg_shader` export of rg_web → `RgPainter.setShaderSource`
- Android and Quest: `Engine.shader(path, defines)` (JNI, rg_android)

WebGL2 and GLES 3 take the same GLSL ES 3.00, so the text is the same on both.
What differs between hosts is passed as a define, not written twice:

| Define | Web | Android | Meaning |
|---|---|---|---|
| `RG_YS` | `1.0` | `-1.0` | the density picture's v against the screen's up (splats) |

## Files

- `*.vs`, `*.fs`: a program stage. The first line is `#version 300 es`; the
  host's defines are put right after it.
- `lib/*.glsl`: library functions, taken in with `#include "lib/noise.glsl"`
  (each file once per stage). No `#version`, no `main`.
  - `lib/noise.glsl`: `hash1`, `hash2`, `vnoise`, `fbm`, `curl2`, `curl3`
    (needs `precision highp int;`)
  - `lib/heat.glsl`: `heat(t)`, black-body colour for anything hot
  - `lib/light.glsl`: `fresnel`, `toksvigPower`, `aaStep`
  - `lib/sprite.glsl`: `softSprite`, `spriteColor`
- `splat/`: liquid and gas splats (draw kind 10), used by painter.js and GlSplats.java
- `test/lib.fs`: uses every library function, only compiled by the tests

## Tests

    cargo test -p rg_shader            # every stage assembles, includes resolve, error lines map back
    node tests/shaders-compile.mjs     # every stage compiles in WebGL2 (headless Chromium), both hosts' defines

## Later

- `SPHERE_FS` still lives in `web/js/painter.js` (scripts/sphere-shader.mjs
  copies it for Android); it moves here next, split into library files.
- Game shaders (`rg.shader("magma", { src: "shaders/magma.glsl", kind: "liquid" })`):
  a game's file goes through the same assembler (`rg_shader::assemble` with
  a lookup into the game's files), wrapped by an engine stage that calls the
  game's hook function. Built-ins win over a game file of the same path.
- When a second project (RangerThree, MFilesAPI) needs the library, `lib/`
  moves to RangerThree; the paths stay the same.
