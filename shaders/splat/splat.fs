#version 300 es
// Each splat adds a soft round weight into the density picture
// (red: weight, green: weight x temperature), blended additively.
precision highp float;
in vec2 lq;
in float tt;
uniform float gain;
out vec4 o;
void main() {
  float d = dot(lq, lq);
  if (d > 1.0) discard;
  float w = exp(-4.0 * d) * gain;
  o = vec4(w, w * tt, 0.0, 0.0);
}
