#version 300 es
// Liquid splats, pass 2 with a hook: the same density picture as show.fs,
// shown by a `vec4 liquid(Fluid f)` function: the engine's own
// (splat/liquid.glsl) or a game's (rg.shader(name, { src, kind: "liquid" })).
// The hook returns the colour and its coverage, not premultiplied; the
// engine premultiplies and applies the object's opacity.
//
// Names the hook must not take: den, pal, texel, light, npal, gain, opac, uv,
// o, main, Fluid, liquid and anything starting rg_. A game's own uniforms are
// declared in its file (`uniform float u_heat;`) and set from the object's
// material: { shader, u: { heat: 0.8 } } (u_ + the name; 1 to 4 numbers).
// RG_YS: the density picture's v against the screen's up (web 1.0, Android -1.0).
precision highp float;
precision highp int;
#include "lib/noise.glsl"
#include "lib/heat.glsl"
#include "lib/light.glsl"
in vec2 uv;
uniform sampler2D den, pal;
uniform vec2 texel;
uniform vec3 light;
uniform float npal, gain, opac, rg_time;
out vec4 o;

struct Fluid {
  vec3 n;       // the surface's normal (screen x right, y up, z towards the eye)
  float thick;  // the density here: about 0.3 at the surface's edge, 1 and more inside
  float temp;   // mean temperature 0..1 (the bake's tMin..tMax)
  vec3 view;    // towards the eye (0, 0, 1)
  vec3 sun;     // towards the light, same axes as n
  float t;      // the run's time, seconds (rewinds with it)
  vec2 uv;      // place in the picture 0..1
  vec3 pal;     // the object's palette at temp
  float edge;   // 0 outside the surface, 1 inside, soft over the edge
};

float rg_D(vec2 t) { return texture(den, t).r / gain; }
// the density a little blurred, so the normal is smooth (a one-texel slope is noisy)
float rg_Db(vec2 t) {
  return 0.4 * rg_D(t) + 0.15 * (rg_D(t + vec2(texel.x, 0.0)) + rg_D(t - vec2(texel.x, 0.0)) + rg_D(t + vec2(0.0, texel.y)) + rg_D(t - vec2(0.0, texel.y)));
}

vec4 liquid(Fluid f);
#include "<hook>"

void main() {
  vec4 a = texture(den, uv);
  float d = a.r / gain;
  if (d < 0.02) discard;
  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);
  vec2 e = texel * 1.5;
  float gx = rg_Db(uv + vec2(e.x, 0.0)) - rg_Db(uv - vec2(e.x, 0.0));
  float gy = rg_Db(uv + vec2(0.0, e.y)) - rg_Db(uv - vec2(0.0, e.y));
  Fluid f;
  f.n = normalize(vec3(-gx * 2.0, -gy * 2.0 * RG_YS, 1.0));
  f.thick = d;
  f.temp = tm;
  f.view = vec3(0.0, 0.0, 1.0);
  f.sun = normalize(light * vec3(1.0, -1.0, 1.0));
  f.t = rg_time;
  f.uv = uv;
  f.pal = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;
  f.edge = smoothstep(0.3, 0.55, d);
  vec4 r = liquid(f);
  float al = clamp(r.a, 0.0, 1.0) * opac;
  o = vec4(max(r.rgb, vec3(0.0)) * al, al);
}
