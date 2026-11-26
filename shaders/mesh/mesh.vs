#version 300 es
// A mesh drawn through a game's mesh() hook (rg.shader kind "mesh"): the
// engine projects and lights each corner (scene3d.rs `mtris`) and hands over
// where it is on the screen and in the world. z (the view depth) makes the
// world values interpolate in perspective; the depth is the engine's own, as
// the other 3D triangles have it.
layout(location = 0) in vec4 pz;     // x, y (the game's units), depth 0..1, view depth
layout(location = 1) in vec3 wp;     // world position
layout(location = 2) in vec3 wn;     // world normal (towards the eye's side)
layout(location = 3) in vec3 col;    // the engine's colour: lit, fogged
layout(location = 4) in vec3 base;   // the object's own colour
layout(location = 5) in vec3 amb;    // the light that is not the sun (ambient, lamps), already through the water
layout(location = 6) in vec3 sun;    // the sun's light on the face (n . l), through the water, without caustics
uniform vec4 xf;
out vec3 v_p; out vec3 v_n; out vec3 v_col; out vec3 v_base; out vec3 v_amb; out vec3 v_sun;
void main() {
  v_p = wp; v_n = wn; v_col = col; v_base = base; v_amb = amb; v_sun = sun;
  float z = max(pz.w, 1e-4);
  gl_Position = vec4((pz.xy * xf.xy + xf.zw) * z, (pz.z * 2.0 - 1.0) * z, z);
}
