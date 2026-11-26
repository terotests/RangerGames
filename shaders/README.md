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
| `RG_DEPTH` | `1` | (none) | the globe ray's length as the depth (the web's detail windows; the phone's mesh has its own) |

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
- `globe/globe.fs`: textured globes (draw kind 8), ray cast per pixel, with the `surface()` hook
  (`globe/surface.glsl` the engine's own); painter.js `Spheres` and
  GlSphere.java (its mesh vertex shader is made from this file's declarations: keep
  `in vec2 uv;`, `in vec3 wpos;`, `out vec4 o;` and `void main()` written as they are)
- `splat/`: liquid and gas splats (draw kind 10), used by painter.js and GlSplats.java;
  `splat/liquid.fs` wraps a `liquid()` hook, `splat/liquid.glsl` is the engine's own
- `test/lib.fs`: uses every library function, only compiled by the tests

## Tests

    cargo test -p rg_shader            # every stage assembles, includes resolve, error lines map back
    node tests/shaders-compile.mjs     # every stage compiles in WebGL2 (headless Chromium), both hosts' defines

## A game's own shader

A game can bring GLSL of its own for a hook the engine offers. The game's file
has only functions (no `#version`, no `main`); the engine wraps it in the
kind's stage, so VR eyes, depth, the density passes and the fallbacks stay the
engine's. It works the same on the web (Sliqtly Games too), Android and Quest,
and a change needs no new APK.

```ts
rg.shader("magma", { src: "shaders/magma.glsl", kind: "liquid" });
rg.three("add", { id: "m", shape: "splats", src: "theia.rgps",
  material: { shader: "magma", u: { glow: 1.6, crust: 0.5 } } });
```

```glsl
// shaders/magma.glsl in the game's folder
uniform float u_glow;     // material.u.glow (u_ + the name, 1 to 4 numbers)
uniform float u_crust;
vec4 liquid(Fluid f) {
  float n = fbm(vec3(f.uv * 18.0, f.t * 0.3), 4);
  float crust = smoothstep(0.1, 0.5, n + u_crust - f.temp);
  vec3 hot = heat(f.temp * 1.1) * u_glow;
  vec3 rock = vec3(0.12, 0.09, 0.08) * (0.4 + 0.6 * max(dot(f.n, f.sun), 0.0));
  vec3 c = mix(hot, rock, crust) + fresnel(f.n, f.view) * 0.5 * hot;
  return vec4(c, f.edge);   // colour and coverage, not premultiplied
}
```

| Kind | Hook | Used by | Stage, default |
|---|---|---|---|
| `liquid` | `vec4 liquid(Fluid f)` | `shape: "splats"` (not `look: "gas"`) | `splat/liquid.fs`, `splat/liquid.glsl` |
| `surface` | `vec3 surface(Surface s)` | `rg.three("planet", { texture, material })` | `globe/globe.fs`, `globe/surface.glsl` |

`Fluid`: `n` normal, `thick` density, `temp` 0..1, `view`, `sun`, `t` the
run's time (rewinds with it), `uv`, `pal` the object's palette at `temp`,
`edge` the surface's soft coverage. The library (`noise`, `heat`, `light`) is
already included; a game file may `#include` its own files and library files.

`Surface`: `p` the point on the ball (unit, the planet's own frame, z its
pole), `n` its shading normal, `uv` the map's (u, v), `col` the colour the
engine drew there (lit, before the city lights and the air), `sun`, `view`,
`t` the planet's `flowTime`, `light` the sunlight on the slope (0..1), `day`
the sun's height there (below 0 at night). The hook returns the colour. It
runs on the textured globes (web, phone, Quest), in detail windows and the
phone's mesh close by too; the globe's own function names (`ground`, `ring`,
`lonlat`, ...) are taken.

```ts
rg.shader("lava", { src: "shaders/lava.glsl", kind: "surface" });
rg.three("planet", { id: "m", texture: "img/mars.jpg", flowTime: t,
  material: { shader: "lava", u: { glow: 2.2, tint: [0.35, 0.3, 0.3] } } });
```

```glsl
uniform float u_glow;
uniform vec3 u_tint;
vec3 surface(Surface s) {
  float n = fbm(s.p * 3.0 + vec3(0.0, 0.0, s.t * 0.05), 5);
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(n));
  return s.col * u_tint * (1.0 - crack * 0.8) + heat(0.55 + 0.45 * crack) * u_glow * crack;
}
```

- A game file cannot replace a built-in path (`lib/...`).
- Reserved names: `liquid`: `den`, `pal`, `texel`, `light`, `npal`, `gain`, `opac`,
  `uv`, `o`, `main`, `Fluid`, `liquid`; `surface`: the uniforms and functions of
  `globe/globe.fs`, `Surface`, `surface`; both: anything starting `rg_`.
- A file that does not assemble (missing include, unknown kind, `#version`)
  is told in the game's log when `rg.shader` runs; one that does not compile
  on the device is told in the game's log in the game file's own lines
  (`shaders/magma.glsl:5: ...`), and the engine's own look is drawn.
- Calling `rg.shader` again with a changed file gives a new key; the hosts
  compile it again.
- Where a host has no GPU splats (the Sliqtly screenshot tool, old phones on
  Canvas) the engine's added squares are drawn as before.

## Later

- `globe/globe.fs` split into library files (its noise, rings, air).
- More kinds: `sprite()` / `update()` for particles, `gas()`, `mesh()`.
- When a second project (RangerThree, MFilesAPI) needs the library, `lib/`
  moves to RangerThree; the paths stay the same.
