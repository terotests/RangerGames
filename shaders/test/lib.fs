#version 300 es
// Compile test: uses every library function once (rg_shader's tests and
// tests/shaders-compile.mjs build it; nothing draws with it).
precision highp float;
precision highp int;
#include "lib/noise.glsl"
#include "lib/heat.glsl"
#include "lib/light.glsl"
#include "lib/sprite.glsl"
in vec2 uv;
out vec4 o;
void main() {
  vec3 p = vec3(uv * 8.0, 0.5);
  float n = vnoise(uv * 4.0) + vnoise(p) + fbm(uv, 4) + fbm(p, 3) + hash1(uv) + hash1(p) + hash2(uv).x;
  vec2 c2 = curl2(uv * 3.0);
  vec3 c3 = curl3(p);
  vec3 nrm = normalize(vec3(c2, 1.0) + c3 * 0.01);
  float f = fresnel(nrm, vec3(0.0, 0.0, 1.0)) + toksvigPower(32.0, nrm) * 0.001 + aaStep(0.5, uv.x);
  vec4 s = spriteColor(heat(n * 0.5 + 0.5), softSprite(uv * 2.0 - 1.0), 0.5);
  o = s + vec4(f * 0.01);
}
