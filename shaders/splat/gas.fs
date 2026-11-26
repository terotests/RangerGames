#version 300 es
// See-through gas (look "gas"): alpha 1 - exp(-k x weight), no surface; lit by
// how the sun lies to the eye (light.z: towards the eye), shadowed by the gas
// between it and the sun (sampled towards the light on the screen), thin gas
// against the sun scatters it forward, the hot part glows of itself.
// RG_YS: the density picture's v against the screen's up (web 1.0, Android -1.0).
precision highp float;
in vec2 uv;
uniform sampler2D den, pal;
uniform vec2 texel;
uniform vec3 light;
uniform float npal, gain, opac, kd;
out vec4 o;
float D(vec2 t) { return texture(den, t).r / gain; }
void main() {
  vec4 a = texture(den, uv);
  float d = a.r / gain;
  if (d < 0.004) discard;
  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);
  vec3 c = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;
  vec3 l = normalize(light * vec3(1.0, -1.0, 1.0));
  vec2 s = vec2(l.x, l.y * RG_YS) * texel;
  // soft: the density blurred a little (4 taps round it)
  float db = 0.5 * d + 0.125 * (D(uv + vec2(texel.x, 0.0)) + D(uv - vec2(texel.x, 0.0)) + D(uv + vec2(0.0, texel.y)) + D(uv - vec2(0.0, texel.y)));
  float al = 1.0 - exp(-kd * db);
  float occ = D(uv + s * 4.0) + D(uv + s * 12.0) + D(uv + s * 28.0);
  float lit = exp(-kd * 0.12 * occ);
  float front = 0.5 + 0.5 * l.z, back = max(-l.z, 0.0);
  float dif = 0.25 + 0.75 * lit * mix(0.4, 1.0, front);
  float fwd = back * back * (1.0 - al) * lit * 1.6;
  float glow = smoothstep(0.35, 0.9, tm);
  vec3 col = mix(c * (dif + fwd), c * 1.25, glow);
  float oa = al * opac;
  o = vec4(col * oa, oa);
}
