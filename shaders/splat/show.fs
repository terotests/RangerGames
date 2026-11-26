#version 300 es
// Liquid splats, pass 2: where the density is thick enough it shows as a
// liquid surface. The mean temperature picks the colour from the palette,
// the density's slope makes a normal that the light shades and glints off,
// and the thin edge fades out.
// RG_YS: the density picture's v against the screen's up (web 1.0, Android -1.0).
precision highp float;
in vec2 uv;
uniform sampler2D den, pal;
uniform vec2 texel;
uniform vec3 light;
uniform float npal, gain, opac;
out vec4 o;
float D(vec2 t) { return texture(den, t).r / gain; }
void main() {
  vec4 a = texture(den, uv);
  float d = a.r / gain;
  if (d < 0.02) discard;
  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);
  vec3 c = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;
  // the surface: where the density passes 0.35; its slope a normal
  float gx = D(uv + vec2(texel.x, 0.0)) - D(uv - vec2(texel.x, 0.0));
  float gy = D(uv + vec2(0.0, texel.y)) - D(uv - vec2(0.0, texel.y));
  vec3 n = normalize(vec3(-gx * 3.0, -gy * 3.0 * RG_YS, 1.0));
  vec3 l = normalize(light * vec3(1.0, -1.0, 1.0));
  float dif = 0.45 + 0.55 * max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.5;
  // hot magma glows of itself (less shading), cold rock is lit
  float glow = smoothstep(0.35, 0.9, tm);
  vec3 col = c * mix(dif, 1.0, glow * 0.7) + spec * mix(vec3(1.0), c, 0.4);
  float body = smoothstep(0.3, 0.55, d), halo = smoothstep(0.02, 0.3, d) * 0.35 * (0.3 + glow);
  float al = max(body, halo) * opac;
  o = vec4(mix(c * (0.6 + glow), col, body) * al, al);
}
