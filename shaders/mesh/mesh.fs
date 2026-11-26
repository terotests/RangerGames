#version 300 es
// Meshes through the mesh() hook (the engine's own: mesh.glsl; a game's:
// rg.shader kind "mesh"). The hook gets the pixel's place in the world and
// what the engine worked out at the corners, and returns the colour seen
// (alpha is ignored: meshes are solid). Under water `lib/water.glsl` has the
// engine's water as functions: the fog by the way, the surface seen from
// below, caustics.
precision highp float;
precision highp int;
in vec3 v_p; in vec3 v_n; in vec3 v_col; in vec3 v_base; in vec3 v_amb; in vec3 v_sun;
uniform vec3 rg_eye;
// the water's time (rg.three scene { water: { time } }: the caustics and waves move by it), else 0
uniform float rg_time;
// the scene's water (rg.three scene { water }), rg_water 0 when there is none
uniform float rg_water, rg_surface, rg_scatter, rg_caustics, rg_cscale;
uniform vec3 rg_wcolor, rg_absorb, rg_sun, rg_suncol, rg_sky;
out vec4 o;
// p: the pixel in the world; n: its normal (unit, towards the eye's side); col: the engine's
// colour (lit at the corners, fogged); base: the object's colour; amb: light that is not the
// sun; sun: the sun's light on it without caustics; eye; view: unit, eye to p; t: rg_time
struct Mesh { vec3 p; vec3 n; vec3 col; vec3 base; vec3 amb; vec3 sun; vec3 eye; vec3 view; float t; };
#include "lib/noise.glsl"
#include "lib/light.glsl"
#include "lib/water.glsl"
#include "<hook>"
void main() {
  vec3 n = normalize(v_n);
  vec3 v = normalize(v_p - rg_eye);
  vec4 c = mesh(Mesh(v_p, n, v_col, v_base, v_amb, v_sun, rg_eye, v, rg_time));
  o = vec4(c.rgb, 1.0);
}
