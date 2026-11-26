// Noise for game and engine shaders. Hash-based (no textures), the same
// result on WebGL2 and GLES 3. Integer hashes need highp int, so the stage
// should say `precision highp int;` (GLES 3 fragment default is mediump).
//   hash1(p), hash2(p)      0..1 per cell
//   vnoise(p)               value noise, 2D and 3D, -1..1, smooth
//   fbm(p, octaves)         fractal sum of vnoise (octaves <= 8)
//   curl2(p), curl3(p)      divergence-free flow from noise (Bridson 2007):
//                           swirls without a simulation; advect with it

uint rg_hashu(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float hash1(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  return float(rg_hashu(q.x + rg_hashu(q.y))) * (1.0 / 4294967295.0);
}
float hash1(vec3 p) {
  uvec3 q = uvec3(ivec3(floor(p)) + 32768);
  return float(rg_hashu(q.x + rg_hashu(q.y + rg_hashu(q.z)))) * (1.0 / 4294967295.0);
}
vec2 hash2(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  uint h = rg_hashu(q.x + rg_hashu(q.y));
  return vec2(float(h), float(rg_hashu(h))) * (1.0 / 4294967295.0);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash1(i), b = hash1(i + vec2(1.0, 0.0)), c = hash1(i + vec2(0.0, 1.0)), d = hash1(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash1(i), n100 = hash1(i + vec3(1, 0, 0)), n010 = hash1(i + vec3(0, 1, 0)), n110 = hash1(i + vec3(1, 1, 0));
  float n001 = hash1(i + vec3(0, 0, 1)), n101 = hash1(i + vec3(1, 0, 1)), n011 = hash1(i + vec3(0, 1, 1)), n111 = hash1(i + vec3(1, 1, 1));
  float z0 = mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y);
  float z1 = mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y);
  return mix(z0, z1, u.z) * 2.0 - 1.0;
}

float fbm(vec2 p, int octaves) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5;
  }
  return s;
}
float fbm(vec3 p, int octaves) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p); p = p * 2.03 + vec3(17.1, 9.2, 4.7); a *= 0.5;
  }
  return s;
}

// 2D curl of a noise potential: v = (dN/dy, -dN/dx)
vec2 curl2(vec2 p) {
  const float e = 0.01;
  float nx = vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0));
  float ny = vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e));
  return vec2(ny, -nx) / (2.0 * e);
}
// 3D curl of a vector potential made of three offset noises
vec3 curl3(vec3 p) {
  const float e = 0.01;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 o1 = vec3(31.4, 0.0, 0.0), o2 = vec3(0.0, 47.9, 0.0);
  float p1y = vnoise(p + o1 + dy) - vnoise(p + o1 - dy), p1z = vnoise(p + o1 + dz) - vnoise(p + o1 - dz);
  float p2x = vnoise(p + o2 + dx) - vnoise(p + o2 - dx), p2z = vnoise(p + o2 + dz) - vnoise(p + o2 - dz);
  float p3x = vnoise(p + dx) - vnoise(p - dx), p3y = vnoise(p + dy) - vnoise(p - dy);
  return vec3(p3y - p2z, p1z - p3x, p2x - p1y) / (2.0 * e);
}
