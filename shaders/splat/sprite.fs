#version 300 es
// Glowing sprites: each particle's quad through the sprite() hook (the
// engine's own: sprite.glsl; a game's: rg.shader kind "sprite"). The hook
// gives premultiplied colour and how much it covers what is behind: alpha 0
// is pure light added, 1 hides what is behind (smoke).
precision highp float;
precision highp int;
in vec2 lq;
in float tt;
flat in float sd;
uniform sampler2D pal;
uniform float npal, opac, rg_time;
out vec4 o;
// uv: the quad, -1..1 (the middle at 0); r: |uv|; temp: the particle's 0..1 (a burst: how far
// through its life); pal: the palette at temp; t: the run's time; seed: the particle's own 0..1
struct Sprite { vec2 uv; float r; float temp; vec3 pal; float t; float seed; };
#include "lib/noise.glsl"
#include "lib/heat.glsl"
#include "lib/light.glsl"
#include "lib/sprite.glsl"
#include "<hook>"
void main() {
  float r = length(lq);
  if (r >= 1.0) discard;
  vec3 c = texture(pal, vec2((tt * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;
  float seed = fract(sin(sd * 12.9898) * 43758.5453);
  vec4 s = sprite(Sprite(lq, r, tt, c, rg_time, seed));
  o = s * opac;
}
