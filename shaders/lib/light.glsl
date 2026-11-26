// Lighting helpers shared by the engine and game shaders.
//   fresnel(n, v)             Schlick, 0.04 face-on
//   toksvigPower(p, n)        a specular power widened by the normal's
//                             change across the pixel (fwidth), so a glint
//                             smaller than a pixel spreads and dims instead
//                             of flickering (PHONG_FS #218 does the same)
//   aaStep(edge, x)           a step anti-aliased over one pixel

float fresnel(vec3 n, vec3 v) {
  float c = 1.0 - clamp(dot(normalize(n), normalize(v)), 0.0, 1.0);
  float c2 = c * c;
  return 0.04 + 0.96 * c2 * c2 * c;
}

float toksvigPower(float p, vec3 n) {
  float var = dot(fwidth(n), fwidth(n));
  return p / (1.0 + p * var);
}

float aaStep(float edge, float x) {
  float w = max(fwidth(x), 1e-6);
  return clamp((x - edge) / w + 0.5, 0.0, 1.0);
}
