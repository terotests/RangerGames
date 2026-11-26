// The engine's water (scene3d.rs `Water`) per pixel, for mesh() hooks.
// Needs the rg_ water uniforms of mesh/mesh.fs.

// the sun's way under water: bent towards the vertical (Snell)
vec3 water_sun() {
  float h = length(rg_sun.xz);
  if (h < 1e-6) return vec3(0.0, 1.0, 0.0);
  float st = min(h / 1.333, 1.0);
  return vec3(rg_sun.x / h * st, sqrt(1.0 - st * st), rg_sun.z / h * st);
}

// light the water scatters into a ray from height y0 along unit d, dist long (up to the surface)
vec3 water_inscatter(float y0, vec3 d, float dist) {
  float depth = max(rg_surface - y0, 0.0);
  float smax = d.y > 1e-6 ? min(depth / d.y, dist) : dist;
  float cs = max(dot(d, water_sun()), 0.0);
  float c2 = cs * cs, c4 = c2 * c2, c8 = c4 * c4;
  float phase = 0.8 + 0.6 * c4 + 0.8 * c8 * c8 * c8;
  vec3 st = rg_absorb + rg_scatter;
  vec3 k = max(st - rg_absorb * d.y, vec3(1e-4));
  vec3 fill = 1.0 - exp(-k * min(smax, 1e5));
  return rg_wcolor * st / k * exp(-rg_absorb * depth) * fill * phase;
}

// what the eye sees of colour c at p (dimmed by the water between, plus its glow)
vec3 water_seen(vec3 c, vec3 p) {
  vec3 dv = p - rg_eye;
  float dist = length(dv);
  vec3 d = dist > 1e-6 ? dv / dist : vec3(0.0, 0.0, -1.0);
  return c * exp(-(rg_absorb + rg_scatter) * dist) + water_inscatter(rg_eye.y, d, dist);
}

// how much of each colour the light from above keeps at height y
vec3 water_down(float y) {
  return exp(-rg_absorb * max(rg_surface - y, 0.0));
}

// the turbulent-sine caustic net, 0..1 bright threads, one period a unit
float water_net(vec2 uv, float t) {
  const float TAU = 6.28318530718;
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = abs(1.17 - pow(c, 1.4));
  return min(pow(c, 8.0), 1.0);
}

// the caustics' light at p: about 1 on average, bright threads, softer and fainter deeper
float water_caustic(vec3 p) {
  if (rg_caustics <= 0.0) return 1.0;
  float depth = max(rg_surface - p.y, 0.0);
  float s = rg_cscale * (1.0 + depth * 0.04);
  float v = water_net(p.xz / s, rg_time * 0.6);
  float fade = rg_caustics * exp(-depth / 25.0);
  float pw = 0.5 + 0.5 * exp(-depth / 15.0);
  return 1.0 + fade * 3.5 * (pow(v, pw) - 0.92 * pow(0.15, pw));
}

// the water seen from height y0 along unit d to the end (or the calm surface)
vec3 water_backdrop(float y0, vec3 d);

// the surface seen from below at p along unit v with the wave normal n (out of the water)
vec3 water_surface(vec3 n, vec3 v, vec3 p) {
  if (n.y < 0.0) n = -n;
  float c = dot(v, n);
  vec3 r = normalize(v - n * 2.0 * max(c, 0.0));
  if (r.y > -0.02) r = normalize(vec3(r.x, -0.02, r.z));
  vec3 refl = water_inscatter(p.y - 0.01, r, 1e9);
  if (c <= 0.0) return refl;
  float n1 = 1.333;
  float si = sqrt(max(1.0 - c * c, 0.0));
  float sti = n1 * si;
  if (sti >= 1.0) return refl;
  float ct = sqrt(1.0 - sti * sti);
  float rs = (n1 * c - ct) / (n1 * c + ct);
  float rp = (n1 * ct - c) / (n1 * ct + c);
  float R = clamp((rs * rs + rp * rp) * 0.5, 0.0, 1.0);
  vec3 t = normalize(v * n1 + n * (ct - n1 * c));
  float s = max(dot(t, rg_sun), 0.0);
  float s2 = s * s, s4 = s2 * s2, s8 = s4 * s4, s24 = s8 * s8 * s8;
  float glare = pow(s, 150.0) * 6.0 + s24 * 0.9 + s4 * 0.15;
  vec3 sky = rg_sky * (0.45 + 0.3 * max(t.y, 0.0)) + rg_suncol * glare;
  return sky * (1.0 - R) + refl * R;
}

vec3 water_backdrop(float y0, vec3 d) {
  vec3 c = water_inscatter(y0, d, 1e9);
  if (d.y <= 1e-6) return c;
  float s = max(rg_surface - y0, 0.0) / d.y;
  vec3 p = vec3(d.x * s, rg_surface, d.z * s);
  return c + water_surface(vec3(0.0, 1.0, 0.0), d, p) * exp(-(rg_absorb + rg_scatter) * s);
}
