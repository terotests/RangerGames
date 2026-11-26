#version 300 es
// Glowing sprites (draw.rs `splats` with look "glow", header slot 12 = 1): one
// instanced quad per particle, drawn straight into the picture, added up.
// s = (x, y, radius, temperature) in game units; xf maps them to clip.
layout(location=0) in vec2 q;
layout(location=1) in vec4 s;
uniform vec4 xf;
out vec2 lq;
out float tt;
flat out float sd;
void main() {
  lq = q; tt = s.w; sd = float(gl_InstanceID);
  vec2 p = s.xy + q * s.z;
  gl_Position = vec4(p * xf.xy + xf.zw, 0.0, 1.0);
}
