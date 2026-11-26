#version 300 es
// Liquid splats, pass 1 (draw.rs `splats`, kind 10): one instanced quad per
// splat. s = (x, y, radius, temperature) in game units; xf maps them to clip.
layout(location=0) in vec2 q;
layout(location=1) in vec4 s;
uniform vec4 xf;
out vec2 lq;
out float tt;
void main() {
  lq = q; tt = s.w;
  vec2 p = s.xy + q * s.z * 1.6;
  gl_Position = vec4(p * xf.xy + xf.zw, 0.0, 1.0);
}
