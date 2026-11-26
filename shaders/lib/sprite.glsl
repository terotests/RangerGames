// A soft round particle: q the quad's local coordinate (-1..1), gaussian
// falloff that reaches ~0 at the edge, so overlapping sprites blend without
// hard squares. With premultiplied alpha, `add` mixes plain alpha (0) and
// added light (1): o = vec4(rgb * a, a * (1.0 - add)).
float softSprite(vec2 q) {
  float d = dot(q, q);
  return d >= 1.0 ? 0.0 : exp(-4.0 * d) * (1.0 - d);
}
vec4 spriteColor(vec3 rgb, float a, float add) {
  return vec4(rgb * a, a * (1.0 - add));
}
