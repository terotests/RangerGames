// Black-body colour for hot things: heat(t), t 0..1 from dull red (~800 K)
// through orange and yellow to white (~6500 K); above 1 it keeps brightening
// (a value for bloom). One palette for the hot lid, magma, splats, sparks and
// the Sun, so "hot" looks the same everywhere.
vec3 heat(float t) {
  float x = clamp(t, 0.0, 1.0);
  vec3 c = vec3(
    smoothstep(0.0, 0.35, x),
    smoothstep(0.18, 0.75, x) * 0.92,
    smoothstep(0.5, 1.0, x) * 0.85);
  c = c * c * (3.0 - 2.0 * c);          // a softer knee
  float lum = 0.15 + 0.85 * x;          // dim red, bright white
  return c * lum * (1.0 + max(t - 1.0, 0.0) * 2.0);
}
