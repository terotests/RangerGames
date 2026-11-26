#version 300 es
precision highp float; precision highp int; in vec2 uv; in vec3 wpos; out vec4 o;
uniform sampler2D tex, ltex, htex, gtex, dtex; uniform vec3 eye, rgt, upv, fwd, sun, airc; uniform vec4 box, win; uniform vec2 view;
uniform float focal, night, lit, useWin, air, lgain, useL, relief;
// real heights (draw.rs `sphere`, 40 numbers): low, high, the bumps' amplitude, near, shading tilt, the bumps' lattice
uniform float useH, hlo, hhi, hamp, nearM, hrel, hfreq, crat, mapAz, mapK, useHole, lite, useD; uniform vec4 hole;
// RG_DEPTH (the web's windows with their own heights, drawn together): the ray's length as the depth, so the
// nearest ground of all the windows shows (a phone's mesh has its own depth: there it is left out)
#ifdef RG_DEPTH
#define DEPTH(t) gl_FragDepth = clamp(log2(max(t, 1e-9) * 1e6) / 26.0, 0.0, 1.0)
#else
#define DEPTH(t)
#endif
// meshM (a phone's GPU, android GlSphere): 1 = the ground close by as a mesh (wpos: the point on it, in radii),
// 2 = only the air round it (drawn first); 0 = as here, a ray cast for each pixel
uniform float meshM;
// the eye's remainder (draw.rs `sphere` 116-118: the eye minus its 32-bit 0-2), |eye|² - 1 (the host, in 64 bits), and the
// light that changes with the eye (120 dust, 121 grains' glints, 122 the sea's glint)
uniform vec3 eyeL; uniform float eyeK, dust, glint, seaG;
// rings in the equator plane (draw.rs `sphere`, 44 numbers): pictures of their colour and opacity across, edges in radii
uniform sampler2D rctex, ratex; uniform float useR, rIn, rOut;
// a gas giant's cloud bands drifting (48 numbers): flowA how far the fastest band goes in a cycle (picture
// widths), flowPh where in the cycle; jet(lat) the east (+) and west (-) winds by latitude, after Jupiter's:
// a fast equator, jets every ~15 degrees, quiet near the poles
uniform float flowA, flowPh;
float jet(float lat) { return (0.55 * cos(lat * 24.0) + 0.6 * exp(-lat * lat * 60.0) - 0.1) * (1.0 - smoothstep(1.0, 1.3, abs(lat))); }
// the clouds morphing and their storms turning (72 numbers, globe.rs vortex_params): vinfo = (storms, where in
// their cycle, how much the clouds morph, the morph's time), vtx[i] = (u, v, radius in radians, width / height),
// vamp[i] how far its middle turns in a cycle (radians)
uniform vec4 vinfo; uniform vec4 vtx[4]; uniform float vamp[4];
// a glowing hot cap (80 numbers, globe.rs `hot`): hot = (its middle on the ball, radius in radians),
// hotk = (soft edge in radians, gain); lit by its own heat
uniform vec4 hot; uniform vec2 hotk;
// a star's own surface (116 numbers, globe.rs `star`): star = (spots, time, granules across a radius, limb
// darkening), spots[i] = (the spot's middle on the ball, its umbra's radius in radians)
uniform vec4 star; uniform vec4 spots[8];
// the morph is EVG's smoke: noise read at a place two other noises have moved (domain warping), on the ball
// (no seam), stretched along the bands, the two warps out of step so that it rolls instead of breathing
float vh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vh(i), vh(i + vec3(1.0, 0.0, 0.0)), f.x), mix(vh(i + vec3(0.0, 1.0, 0.0)), vh(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(vh(i + vec3(0.0, 0.0, 1.0)), vh(i + vec3(1.0, 0.0, 1.0)), f.x), mix(vh(i + vec3(0.0, 1.0, 1.0)), vh(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
float vf(vec3 x) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vn(x); x = x * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
// where the picture is read for a place (u, v; p on the ball): the morph's warp, mostly along the bands
vec2 morph(vec2 st, vec3 p) { if (vinfo.z <= 0.0) return st; float t = vinfo.w;
  vec3 q = p * vec3(5.0, 5.0, 14.0);
  vec3 w1 = vec3(vf(q + vec3(0.0, 0.0, t * 0.31)), vf(q + vec3(5.2, 1.3, -t * 0.23)), vf(q + vec3(2.1, 7.7, t * 0.17)));
  float dx = vf(q + 2.2 * w1 + vec3(1.7, 9.2, t * 0.5)) - 0.44, dy = vf(q + 2.2 * w1 + vec3(8.3, 2.8, -t * 0.4)) - 0.44;
  float cl = max(sqrt(1.0 - p.z * p.z), 0.2);
  return st + vec2(dx * 0.016 / cl, dy * 0.006) * vinfo.z; }
// a storm turns what is read inside it: by an angle that grows to the middle (ph: this reading's place in the
// cycle, -0.5..0.5), on its ellipse; tw: how much of the place is inside a storm
vec2 storms(vec2 st, float ph, out float tw) { tw = 0.0;
  for (int i = 0; i < 4; i++) { if (float(i) >= vinfo.x) break; vec4 V = vtx[i];
    float cl = max(cos((0.5 - V.y) * 3.1415927), 0.05), dl = st.x - V.x; dl -= floor(dl + 0.5);
    vec2 d = vec2(dl * 6.2831853 * cl / V.w, (V.y - st.y) * 3.1415927) / V.z; float r2 = dot(d, d);
    if (r2 >= 1.0) continue; float pr = (1.0 - r2) * (1.0 - r2); tw = max(tw, pr);
    float a = -vamp[i] * ph * pr, cs = cos(a), sn = sin(a); d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
    st = vec2(V.x + d.x * V.z * V.w / (6.2831853 * cl), V.y - d.y * V.z / 3.1415927); }
  return st; }
// the glowing air seen along the ray: a = how much, col = its light. lo: the
// ray's lowest point (on the ground for a ray that hits); len: its path in the air
vec4 airGlow(vec3 d, vec3 lo, float alt, float len, bool hit) {
  float up = dot(normalize(lo), sun);
  float day = smoothstep(-0.28, 0.12, up);
// looking towards the sun past the rim: forward scattering, a white burst at sunrise
  float fw = pow(max(dot(d, sun), 0.0), 10.0) * smoothstep(-0.45, 0.02, up);
  float dusk = smoothstep(-0.3, -0.02, up) * (1.0 - smoothstep(0.0, 0.25, up));
// thinning smoothly to nothing at the top, and a soft (not clipped) build-up
// towards the rim: a gradient, no hard ring
  float dens = exp(-alt * 3.5) * (1.0 - alt) * (1.0 - alt);
  float depth = dens * len / (air * 2.0);
  float a = 1.0 - exp(-depth * (0.38 * day + 2.6 * fw + 0.25 * dusk));
  vec3 col = airc * (0.7 + 0.6 * day) + vec3(1.0, 0.96, 0.9) * fw * 3.0 + vec3(1.0, 0.55, 0.3) * dusk * 0.8;
  return vec4(col, a);
}
float lum(vec2 t) { vec3 c = texture(tex, t).rgb; return dot(c, vec3(0.3, 0.5, 0.2)); }
// the map's brightness at the unit direction q, read at the level for the size eps (radians); under a detail window
// the window's picture
// s > 1: the picture itself s times smaller, turned and mirrored (no seams), for the detail finer than its pixels
float lumAt(vec3 q, float eps, float more, float s) { vec2 t = vec2(atan(q.y, q.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(q.z, -1.0, 1.0)) / 3.1415927);
  float span = 1.0;
  if (useWin > 0.5) { if (t.x < win.x) t.x += 1.0; else if (t.x > win.z) t.x -= 1.0; span = win.z - win.x; t = (t - win.xy) / (win.zw - win.xy); }
  if (s > 1.0) { t = abs(fract((mat2(0.8, 0.6, -0.6, 0.8) * t * s + vec2(0.37, 0.71)) * 0.5) * 2.0 - 1.0); }
  float ta = 6.2831853 * span / float(textureSize(tex, 0).x);
  return dot(textureLod(tex, t, max(0.0, log2(eps * s / ta)) + more).rgb, vec3(0.3, 0.5, 0.2)); }
vec2 lonlat(vec3 p) { return vec2(atan(p.y, p.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(p.z, -1.0, 1.0)) / 3.1415927); }
// the made-up bumps: value noise on the integer lattice, the hash of 32-bit integers (the same in every host and the game)
uint hsh(ivec3 c) { uint h = (uint(c.x) * 0x8da6b343u) ^ (uint(c.y) * 0xd8163841u) ^ (uint(c.z) * 0xcb1ab31fu);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u; return h; }
float hv(ivec3 c) { return float(hsh(c) >> 8u) / 16777215.0; }
// value noise with its gradient (x: 0..1, yzw: d/dx), for the made-up rocks close by
vec4 vnd(vec3 x) { ivec3 i = ivec3(floor(x)); vec3 f = x - floor(x); vec3 u = f * f * f * (f * (6.0 * f - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hv(i), b = hv(i + ivec3(1, 0, 0)), c = hv(i + ivec3(0, 1, 0)), d = hv(i + ivec3(1, 1, 0));
  float e = hv(i + ivec3(0, 0, 1)), g = hv(i + ivec3(1, 0, 1)), h = hv(i + ivec3(0, 1, 1)), k = hv(i + ivec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + h, k6 = a - b - e + g, k7 = -a + b + c - d + e - g - h + k;
  return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y)); }
float vnoise(vec3 x) { vec3 f = floor(x); ivec3 c = ivec3(f); vec3 t = x - f; t = t * t * (3.0 - 2.0 * t);
  float a = mix(hv(c), hv(c + ivec3(1, 0, 0)), t.x), b = mix(hv(c + ivec3(0, 1, 0)), hv(c + ivec3(1, 1, 0)), t.x);
  float e = mix(hv(c + ivec3(0, 0, 1)), hv(c + ivec3(1, 0, 1)), t.x), g = mix(hv(c + ivec3(0, 1, 1)), hv(c + ivec3(1, 1, 1)), t.x);
  return mix(mix(a, b, t.y), mix(e, g, t.y), t.z); }
// three octaves of value noise, 0..1 (the hot cap's swirling heat)
float hfb(vec3 x) { return (vnoise(x) * 0.5 + vnoise(x * 2.03) * 0.25 + vnoise(x * 4.11) * 0.125) / 0.875; }
// the granules: cellular noise, the nearest two cell points (F1, F2) of the 27 cells round x
vec2 cells(vec3 x) { vec3 i = floor(x), f = x - i; float d1 = 8.0, d2 = 8.0;
  for (int k = 0; k < 27; k++) { ivec3 o = ivec3(k % 3 - 1, (k / 3) % 3 - 1, k / 9 - 1); uint h = hsh(ivec3(i) + o);
    vec3 r = vec3(o) + vec3(float(h & 255u), float((h >> 8u) & 255u), float((h >> 16u) & 255u)) / 255.0 * 0.8 + 0.1 - f;
    float dd = dot(r, r); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; }
  return sqrt(vec2(d1, d2)); }
// a star's surface at p (seen along d, a pixel fp radians): light, rising granules with dark lanes between
// (each size only where it is a few pixels across, else its mean), darker and redder towards the limb (the
// eye sees higher, cooler gas there), and the sunspots: a dark umbra with bright dots, a penumbra of
// radial filaments with bright heads, ragged edges, and the Wilson depression (the spot is a dip: seen at a
// slant, its wall on the disc's middle side hides, so the umbra moves that way and that side's penumbra narrows)
vec3 starSurf(vec3 c, vec3 p, vec3 d, float fp) { float mu = clamp(dot(p, -d), 0.0, 1.0), tm = star.y;
  float g = 1.0; float ga = 1.0 / star.z;
  float w1 = smoothstep(2.0, 6.0, ga / fp), w0 = smoothstep(2.0, 6.0, 6.0 * ga / fp);
  vec3 wq = vec3(vnoise(p * star.z * 0.5 + vec3(0.0, 0.0, tm * 0.011)), vnoise(p * star.z * 0.5 + vec3(5.2, 1.3, tm * 0.009)), 0.0) - 0.5;
// (the map's own blotches calmed where the granules show: they are the light's real texture)
  c = mix(c, vec3(1.0, 0.78, 0.4), 0.3 + 0.4 * w1);
  if (w1 > 0.0) { vec3 x = p * star.z + wq * 1.6 + vec3(0.0, 0.0, tm * 0.004); vec2 f = cells(x); float aa = fp * star.z;
    float lane = smoothstep(0.0, 0.24 + aa, f.y - f.x), core = 1.0 - f.x * f.x;
    float gr = mix(0.5, 0.7 + 0.34 * core + 0.18 * (vnoise(x * 2.7) - 0.5) + 0.16 * (vnoise(x * 0.7) - 0.5), lane); g = mix(0.92, gr, w1 * (0.55 + 0.45 * mu)); }
  if (w0 > 0.0) g *= mix(1.0, 0.86 + 0.28 * vnoise(p * star.z / 6.0 + vec3(tm * 0.002)), w0);
  float sh = 1.0, pmx = 0.0; vec3 tint = vec3(1.0); float fac = 0.0;
  for (int i = 0; i < 8; i++) { if (float(i) >= star.x) break; vec3 cs = spots[i].xyz; float ru = spots[i].w, rp = ru * 2.3;
    float ca = dot(p, cs); if (ca < cos(min(rp * 2.6, 1.5))) continue;
    vec3 e1 = normalize(cross(abs(cs.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), cs)), e2 = cross(cs, e1);
    vec3 vt = p - cs * ca; vec2 xy = vec2(dot(vt, e1), dot(vt, e2));
// the Wilson depression: towards the foot of the eye (the disc's middle), more at a slant
    vec3 ev = normalize(eye); vec3 tv = ev - cs * dot(ev, cs); vec2 wo = vec2(dot(tv, e1), dot(tv, e2)) * 0.45 * ru;
    float r = length(xy), th = atan(xy.y, xy.x), sd = float(i) * 7.31;
    vec3 ang = vec3(cos(th), sin(th), sd);
    float ruE = ru * (0.78 + 0.4 * vnoise(ang * 2.2) + 0.12 * vnoise(ang * 7.0)), rpE = rp * (0.82 + 0.3 * vnoise(ang * 1.7 + 3.1) + 0.08 * vnoise(ang * 9.0));
    float ru2 = length(xy - wo), soft = max(fp, ru * 0.05);
    float um = 1.0 - smoothstep(ruE - soft, ruE + soft, ru2), rw = r - 0.35 * dot(xy / max(r, 1e-9), wo), pm = 1.0 - smoothstep(rpE * 1.14 - 1.5 * soft, rpE * 1.14 + 1.5 * soft, rw);
    if (pm <= 0.0) { fac += (1.0 - mu) * exp(-pow((r - rpE) / rpE, 2.0) * 1.5); continue; }
// filaments: noise stretched along the radius, about 70 round the spot, slowly flowing out (Evershed);
// only where they are a couple of pixels wide, else their mean
    float s = clamp((r - ruE) / max(rpE - ruE, 1e-9), 0.0, 1.0), K = 70.0;
    float fw = smoothstep(1.5, 4.0, 6.2831853 * r / K / fp);
    float fl = vnoise(vec3(th * K / 6.2831853 * 1.0, s * 2.2 - tm * 0.01, sd)) * 0.65 + vnoise(vec3(th * K / 3.14159 , s * 4.0, sd + 2.0)) * 0.35;
    fl = mix(0.5, smoothstep(0.38, 0.68, fl), fw);
// finer threads close by (about 230 round the spot)
    float fw2 = smoothstep(1.5, 4.0, 6.2831853 * r / (K * 3.3) / fp);
    if (fw2 > 0.0) fl = mix(fl, fl * (0.55 + 0.9 * smoothstep(0.25, 0.8, 1.0 - abs(2.0 * vnoise(vec3(th * K * 3.3 / 6.2831853, s * 6.0 - tm * 0.02, sd + 5.0)) - 1.0))), fw2);
// the outer edge ragged: the filaments reach out between the granules
    float re = rpE * (0.86 + 0.28 * fl); pm = min(pm, 1.0 - smoothstep(re - 1.5 * soft, re + 1.5 * soft, rw));
    float pb = 0.36 + 0.46 * fl + 0.28 * fl * exp(-s * 5.0) * fw;
// the umbra: dark, deep red, with bright umbral dots where they can be seen
    float dw = smoothstep(1.5, 4.0, ru * 0.08 / fp); float dots = pow(vnoise(p / (ru * 0.07) + vec3(sd)), 6.0) * 1.6 * dw;
    float ub = 0.07 + 0.05 * vnoise(p / (ru * 0.3) + vec3(sd)) + 0.2 * dots;
    float b = mix(pb, ub, um); sh = min(sh, mix(1.0, b, pm)); pmx = max(pmx, pm);
    tint = mix(tint, mix(vec3(1.0, 0.72, 0.48), vec3(0.95, 0.42, 0.22), um), pm); }
  float ld = 1.0 - star.w * (1.0 - pow(mu, 0.8));
  vec3 lc = mix(vec3(1.0, 0.62, 0.32), vec3(1.0), smoothstep(0.0, 0.7, mu));
  return c * mix(g, 1.0, pmx) * ld * lc * sh * tint * (1.0 + 0.35 * min(fac, 1.0)); }
// craters: at most one in each lattice cell, inside it (so only the point's own cell is read)
float crater(vec3 p, float f, int o) { vec3 x = p * f + vec3(0.37, 0.61, 0.19) * float(o & 1); vec3 fc = floor(x); ivec3 c = ivec3(fc);
  uint h = hsh(ivec3(c.x + 1000 * (o + 1), c.y, c.z)); if ((h & 255u) >= 170u) return 0.0;
  uint g = hsh(ivec3(c.x, c.y + 7919, c.z + 31 * o));
  vec3 j = vec3(float((h >> 8u) & 255u), float((h >> 16u) & 255u), float((g >> 8u) & 255u)) / 255.0 * 0.5 + 0.25;
  float rr = 0.08 + 0.1 * float(g & 255u) / 255.0; float dd = length(x - fc - j) / rr;
  if (dd >= 1.4) return 0.0;
  float k = rr / f; float b = dd < 1.0 ? 0.4 * (dd * dd - 1.0) + 0.08 * smoothstep(0.6, 1.0, dd) : 0.08 * (1.0 - smoothstep(1.0, 1.4, dd));
  return b * k; }
// the made-up bumps: five octaves of value noise and craters of three sizes (draw.rs `sphere`); n > 5: finer ones too (only for the shading)
// (n may be fractional: the last octave then counts by its fraction, so that the finer ones fade in by the pixel's
// size instead of turning on at a distance, a line that swept over the ground as the ship moved)
float bumpsF(vec3 p, float n) { if (hamp <= 0.0) return 0.0; float s = 0.0, a = 1.0, f = hfreq;
  for (int k = 0; k < 9; k++) { float w = clamp(n - float(k), 0.0, 1.0); if (w <= 0.0) break; s += w * a * (2.0 * vnoise(p * f) - 1.0); a *= 0.48; f *= 2.03; }
  float cr = 0.0; if (crat > 0.0) { float cf = hfreq * 0.9; float nc = n >= 5.0 ? n - 2.0 : max(n - 2.0, 1.0);
    for (int k = 0; k < 7; k++) { float w = clamp(nc - float(k), 0.0, 1.0); if (w <= 0.0) break; cr += w * (crater(p, cf, 2 * k) + crater(p, cf, 2 * k + 1)); cf *= 2.7; } }
  return s * hamp + cr * crat; }
float bumps(vec3 p, int n) { return bumpsF(p, float(n)); }
// how many octaves of bumps are at least sz (radii) long, from 5 up to 8, fractional
float octsF(float sz) { return 5.0 + clamp(log2(1.0 / (hfreq * pow(2.03, 5.0) * sz)) / log2(2.03) + 1.0, 0.0, 3.0); }
float dec(vec4 c) { return (c.r * 65280.0 + c.g * 255.0) / 65535.0; }
// the ground's radius at unit direction p: the coarse shape picture plus n octaves of bumps
// the shape read bilinearly by hand, like the game reads it: GPUs' own filtering weighs the texels in 1/256 steps,
// and those small terraces cast false shadows when the sun is low
float shape(vec2 t) { ivec2 sz = textureSize(gtex, 0); vec2 x = t * vec2(sz) - 0.5; vec2 f = floor(x); vec2 a = x - f;
  int i0 = int(f.x) % sz.x; if (i0 < 0) i0 += sz.x; int i1 = (i0 + 1) % sz.x;
  int j0 = clamp(int(f.y), 0, sz.y - 1), j1 = clamp(int(f.y) + 1, 0, sz.y - 1);
  float top = mix(dec(texelFetch(gtex, ivec2(i0, j0), 0)), dec(texelFetch(gtex, ivec2(i1, j0), 0)), a.x);
  float bot = mix(dec(texelFetch(gtex, ivec2(i0, j1), 0)), dec(texelFetch(gtex, ivec2(i1, j1), 0)), a.x);
  return mix(top, bot, a.y); }
// how many octaves of bumps are bigger than sz (radii): the smaller ones don't change what a ray meets
int octs(float sz) { if (hamp <= 0.0) return 0; int n = 0; float a = hamp * 1.5; for (int k = 0; k < 5; k++) { if (a < sz || (lite > 0.5 && n >= 3)) break; n++; a *= 0.48; } return n; }
// a detail window's own heights (dtex, useD): inside the window they are the ground's height, up to its
// edge (the next window's heights go on from there, the same ground; a fade would sink the ground towards
// the ball's coarse shape along every seam); xy: the window's u v, z: 1 inside (rg.height reads them alike)
vec3 winAt(vec2 t) { float uw = t.x; if (uw < win.x) uw += 1.0; else if (uw > win.z) uw -= 1.0;
  vec2 w = vec2((uw - win.x) / (win.z - win.x), (t.y - win.y) / (win.w - win.y));
  return vec3(w, w.x >= 0.0 && w.x <= 1.0 && w.y >= 0.0 && w.y <= 1.0 ? 1.0 : 0.0); }
// outside the window (the other windows' ground, each drawn by its own command) the ground is left out
// (the lowest height): rays and shadows pass over it, instead of meeting the ball's coarse shape there,
// which stands higher or lower than the real ground and left holes along the seams
float coarseH(vec3 p) { vec2 t = lonlat(p);
// (a phone's mesh: its corners just outside the window take the window's edge, its triangles there are cut
// off at the window's edge, and the left out ground would have pulled them down)
  if (useD > 0.5 && useWin > 0.5) { vec3 w = winAt(t); return w.z > 0.0 || meshM > 0.5 ? (hhi - hlo) * dec(textureLod(dtex, clamp(w.xy, 0.0, 1.0), 0.0)) : 0.0; }
  return (hhi - hlo) * shape(t); }
float ground(vec3 p, int n) { return 1.0 + hlo + coarseH(p) + bumps(p, n); }
float groundH(vec3 p, int n) { return hlo + coarseH(p) + bumps(p, n); }
float groundF(vec3 p, float n) { return 1.0 + hlo + coarseH(p) + bumpsF(p, n); }
// octs, fractional (the phone's mesh: its corners' heights change smoothly as they slide over the ground)
float octsAF(float sz) { if (hamp <= 0.0) return 0.0; return clamp(log(hamp * 1.5 / max(sz, 1e-9)) / log(1.0 / 0.48) + 1.0, 0.0, lite > 0.5 ? 3.0 : 5.0); }
// the height read for the shading: the sharp picture (at a level for the size eps) plus the bumps
float shadeH(vec3 p, float lod) { vec2 t = lonlat(p); bool dw = useD > 0.5 && useWin > 0.5;
  float lh = dw ? max(0.0, lod + log2(float(textureSize(htex, 0).x) * (win.z - win.x) / float(textureSize(dtex, 0).x))) : lod;
  float h = (hhi - hlo) * dec(textureLod(htex, t, lh));
  if (dw) { vec3 w = winAt(t); if (w.z > 0.0) h = mix(h, (hhi - hlo) * dec(textureLod(dtex, w.xy, lod)), w.z); }
  return h; }
// casts the ray against the ground's shape; t: where it meets it
// the height over the unit ball of the point eye + y (y from the eye's 32 bits, its remainder eyeL in it), without
// eye's 1: in 32 bits a point near the ground is only to about 6e-8 radii (10 cm on the Moon), so two eyes 6 cm
// apart were up to 15 cm apart, or together, and the ground's depth swam in a headset
float altY(vec3 y) { float m = eyeK + 2.0 * dot(eye, y) + dot(y, y); return m / (sqrt(max(1.0 + m, 0.0)) + 1.0); }
bool march(vec3 d, float pix, out float t) {
  float ao = hhi + 2.0 * hamp + 0.05 * crat / hfreq, ai = hlo - 2.0 * hamp - 0.25 * crat / hfreq;
  float bq = dot(eye, d) + dot(eyeL, d), ek = eyeK + 2.0 * dot(eye, eyeL) + dot(eyeL, eyeL); float ds = bq * bq - ek + ao * (2.0 + ao);
  t = 0.0; if (ds < 0.0) return false;
  float t0 = max(0.0, -bq - sqrt(ds)), t1 = -bq + sqrt(ds);
  float di = bq * bq - ek + ai * (2.0 + ai); if (di > 0.0 && -bq - sqrt(di) > 0.0) t1 = min(t1, -bq - sqrt(di));
  if (t1 <= t0) return false;
  float tp = t0; t = t0; bool hit = false;
// lite (a phone's GPU): at most 56 steps, then where the ray is (only far off, at the horizon)
  for (int i = 0; i < 160; i++) {
    if (lite > 0.5 && i >= 56) { hit = true; tp = t; break; }
    vec3 y = eyeL + d * t; float a = altY(y); float f = a - groundH((eye + y) / (1.0 + a), octs(t * pix));
    if (f < 0.0) { hit = true; break; }
    if (f < t * pix * 0.3) { hit = true; tp = t; break; }
    tp = t; t += max(f * 0.7, t * pix * 0.8);
    if (t > t1) return false;
  }
  if (!hit) return false;
// between the last point above and the first below, with all the bumps
  float a = tp, b = t;
  for (int i = 0; i < 7; i++) { if (lite > 0.5 && i >= 4) break; float m = (a + b) * 0.5; vec3 y = eyeL + d * m; float h = altY(y);
    if (h - groundH((eye + y) / (1.0 + h), octs(m * pix * 0.5)) < 0.0) b = m; else a = m; }
  t = b; return true;
}
// how much sun reaches the ground point x (radii from the centre): a ray towards the sun against the ground's shape,
// soft at the edges
float sunRay(vec3 x, float sz) {
  float k = 1.0, t = max(sz * 4.0, 2e-6);
  for (int i = 0; i < 24; i++) { if (lite > 0.5 && i >= 10) break; vec3 y = x + sun * t; float r = length(y); if (r > 1.0 + hhi + 2.0 * hamp + 0.05 * crat / hfreq) break;
    float h = r - ground(y / r, octs(t * 0.1)); k = min(k, 10.0 * h / t); if (k < 0.0) return 0.0; t *= 1.35; }
  return clamp(k, 0.0, 1.0);
}
// the rings' opacity at rr radii from the middle (for shadows: the coarse picture)
float ringA(float rr, float lod) { if (rr <= rIn || rr >= rOut) return 0.0; return textureLod(ratex, vec2((rr - rIn) / (rOut - rIn), 0.5), lod).r; }
// where the ray meets the rings (tr: how far, -1 if not) and what it sees there, premultiplied: far off the
// pictures, close by (a pixel under ~1 km of ring) specks, the lumps of ice they are made of, on a lattice of
// cells a few pixels wide (two sizes blended by the distance, so they do not pop)
vec4 ring(vec3 d, float pix, out float tr) { tr = -1.0;
  if (useR < 0.5 || abs(d.z) < 1e-7) return vec4(0.0); float t = -eye.z / d.z; if (t <= 0.0) return vec4(0.0);
  vec3 p = eye + d * t; float rr = length(p.xy); if (rr <= rIn || rr >= rOut) return vec4(0.0); tr = t;
  float f = t * pix, u = (rr - rIn) / (rOut - rIn), texel = (rOut - rIn) / float(textureSize(ratex, 0).x);
  float lod = max(0.0, log2(f / max(abs(d.z / length(d)), 0.03) / texel));
  vec3 col = textureLod(rctex, vec2(u, 0.5), lod).rgb; float a = textureLod(ratex, vec2(u, 0.5), lod).r;
// lit from the side the eye is on, or from behind (light through the ice, weaker where it is thick)
  float side = sign(sun.z) == sign(eye.z) ? 0.55 + 0.45 * sqrt(abs(sun.z)) : 0.3 * (1.0 - 0.6 * a);
  float ps = dot(p, sun); float sh = ps < 0.0 ? smoothstep(0.98, 1.02, length(p - sun * ps)) : 1.0;
  float lt = lit > 0.5 ? side * mix(0.12, 1.0, sh) : 1.0;
  float dust = 1.0 - smoothstep(1.5e-5, 1.2e-4, f);
// looking towards the Sun through the rings (Cassini's backlit pictures): the thin, dusty parts
// (the Cassini division, the outer edge) light up by forward scattering, the thick B ring stays dark
  float fsc = lit > 0.5 && sign(sun.z) != sign(eye.z) ? pow(max(0.0, dot(normalize(d), sun)), 6.0) * sh : 0.0;
  vec3 glow = mix(col, vec3(0.92, 0.9, 1.0), 0.6) * fsc * 3.2 * a * (1.0 - a) * (1.0 - a);
  vec4 res = vec4((col * lt * a + glow) * (1.0 - dust), a * (1.0 - dust));
  if (dust > 0.0) { float L = log2(max(f, 1e-7) * 5.0); float l0 = floor(L), fr = L - l0; float sp = 0.0;
    float a0 = textureLod(ratex, vec2(u, 0.5), 0.0).r;
    for (int k = 0; k < 2; k++) { float cs = exp2(l0 + float(k)); vec2 g = p.xy / cs; vec2 c = floor(g);
      uint h = hsh(ivec3(int(c.x), int(c.y), int(l0) + k + 4099)); vec2 j = vec2(float(h & 1023u), float((h >> 10u) & 1023u)) / 1023.0;
      if (float((h >> 20u) & 1023u) / 1023.0 < a0 * 1.2) { float dd = length((g - c - j) * cs) / f;
        sp += (k == 0 ? 1.0 - fr : fr) * (1.0 - smoothstep(0.25, 1.4, dd)) * (0.45 + 0.55 * float((h >> 4u) & 15u) / 15.0); } }
    sp = clamp(sp, 0.0, 1.0) * dust; vec3 sc = mix(col, vec3(1.0), 0.35) * lt * 1.5;
    res = vec4(min(sc, vec3(1.0)) * sp, sp) + res * (1.0 - sp); }
  return res; }
// the grains' glints (draw.rs `sphere` 121): the ground's grains, on cells a few pixels wide (two sizes blended by the
// pixel's size, as the rings' specks), each a small facet tilted at random; one shines where its normal is the half
// way hw between the sun and the eye, so each eye sees its own (in a headset the ground glitters like real dust or
// snow). The cells are counted from the eye's 32 bits split at 1/1024 radii (exact) plus y: the same grains from
// both eyes and every frame, to 1e-10 radii
float grains(vec3 y, vec3 n, vec3 hw, float fpt) { float Lf = log2(max(fpt, 1e-12)); float L0 = clamp(floor(Lf), -30.0, -11.0);
  float fr = Lf - L0 >= 1.0 || Lf < -30.0 ? 0.0 : Lf - L0; vec3 ch = floor(eye * 1024.0) / 1024.0, cl = eye - ch; float sp = 0.0;
  for (int k = 0; k < 2; k++) { float l = L0 + float(k), cs = exp2(l); vec3 r = (cl + y) / cs, fl = floor(r);
    uvec3 a = uvec3(ivec3(ch * 1024.0)) * uint(1 << int(-l - 10.0)) + uvec3(ivec3(fl));
    uint h = hsh(ivec3(a) + ivec3(0, 0, int(l) * 7919)), h2 = hsh(ivec3(a.yzx) + ivec3(31, 17, int(l)));
    vec3 j = vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 1023.0;
    vec3 rn = vec3(float(h2 & 1023u), float((h2 >> 10u) & 1023u), float((h2 >> 20u) & 1023u)) / 511.5 - 1.0;
    vec3 nf = normalize(n + 1.2 * rn); if (dot(nf, n) < 0.0) nf = reflect(nf, n); vec3 q = r - fl - j; q -= n * dot(q, n); float dd = length(q) * cs / fpt;
    sp += (k == 0 ? 1.0 - fr : fr) * (1.0 - smoothstep(0.25, 0.9, dd)) * pow(max(dot(nf, hw), 0.0), 150.0); }
  return sp; }
void main() {
  vec2 px = box.xy + uv * box.zw;
  bool mesh = meshM > 0.5 && meshM < 1.5;
  vec3 d = mesh ? normalize(wpos - eye) : normalize(fwd * focal + rgt * (px.x - view.x * 0.5) - upv * (px.y - view.y * 0.5));
  float b = dot(eye, d); vec3 q = eye - b * d; float q2 = dot(q, q); float disc = 1.0 - q2;
  bool terr = useH > 0.5 && nearM > 0.5; float pix = 1.0 / focal; float th = 0.0;
  float tr = -1.0; vec4 rg = (!terr && !mesh && meshM < 0.5) ? ring(d, pix, tr) : vec4(0.0);
// the smooth ball's edge covers a pixel in part: how much (0..1) from how far past the rim the ray passes, in
// pixels. Without it the rim moved in whole (picture) pixels: a far planet's edge crept and jumped back as it
// came nearer, a wobble the eye sees
  float qd = sqrt(q2) - 1.0; float cover = clamp(0.5 - qd / max(fwidth(qd), 1e-7), 0.0, 1.0);
  bool soft = !terr && !mesh && meshM < 0.5 && useWin < 0.5;
// a detail window close by: test the window on the smooth ball first (with a margin for mountains), so that only
// the pixels it may cover cast the long ray
  if (terr && useWin > 0.5 && !mesh) { vec3 pw = normalize(disc >= 0.0 ? eye + d * (-b - sqrt(disc)) : q); vec2 w0 = lonlat(pw);
    float mg = 0.004 + 0.5 * max(hhi - hlo, 0.0); float uw = w0.x; if (uw < win.x - mg) uw += 1.0; else if (uw > win.z + mg) uw -= 1.0;
    if (uw < win.x - mg || uw > win.z + mg || w0.y < win.y - mg || w0.y > win.w + mg) discard; }
// the whole ball close by: the windows drawn after it cover the hole, so only around it (a wide margin for
// mountains seen from the side) the long ray is cast
// (the mesh: exactly the hole, it has the true point)
  if (terr && useHole > 0.5 && meshM < 1.5) { vec3 pw = mesh ? normalize(wpos) : normalize(disc >= 0.0 ? eye + d * (-b - sqrt(disc)) : q); vec2 w0 = lonlat(pw);
    float mg = mesh ? 0.0 : 3.0 * (0.004 + 0.5 * max(hhi - hlo, 0.0)); float uw = w0.x; if (uw < hole.x) uw += 1.0; else if (uw > hole.z) uw -= 1.0;
    if (uw > hole.x + mg && uw < hole.z - mg && w0.y > hole.y + mg && w0.y < hole.w - mg && dot(pw, normalize(eye)) > 0.995004) discard; }
  if (mesh) th = length(wpos - eye);
// the mesh's corners slide over the ground as the eye moves and its flat triangles miss the true ground a little:
// seen at a slant the picture slid to and fro on rough ground ("flowed"); two steps along the ray to the true ground
// (only at a slant, where it shows, and one step with the three largest octaves: two full ones cost 4-5 ms on a tablet)
  if (mesh && terr) { vec3 x = eye + d * th; float r = length(x); float ci0 = -dot(d, x / r);
    if (ci0 < 0.4) th += clamp((r - groundF(x / r, min(octsAF(th * pix), 3.0))) / max(ci0, 0.05), -0.05 * th, 0.05 * th) * (1.0 - smoothstep(0.25, 0.4, ci0)); }
  bool hit = meshM > 1.5 ? false : mesh ? true : terr ? march(d, pix, th) : soft ? (cover > 0.0 && -b > 0.0) : (disc >= 0.0 && -b >= sqrt(max(disc, 0.0)));
  if (!hit) {
    float R = 1.0 + air; vec4 ga = vec4(0.0);
    if (!(air <= 0.0 || useWin > 0.5 || q2 >= R * R || -b < 0.0)) { float hq = sqrt(q2);
      vec4 g = airGlow(d, q, max(hq - 1.0, 0.0) / air, 2.0 * sqrt(R * R - q2), false); ga = vec4(min(g.rgb, vec3(1.0)) * g.a, g.a); }
// past the ball: the rings (in front of the air, a thin shell)
    ga = rg + ga * (1.0 - rg.a);
    if (ga.a < 0.003) discard;
    DEPTH(1e3); o = ga; return;
  }
  if (!terr) th = -b - sqrt(max(disc, 0.0));
  vec3 p = normalize(eye + (eyeL + d * th));
  vec2 uvw = lonlat(p); float u = uvw.x, v = uvw.y;
// the seam at longitude 180: take the derivatives of the u that does not jump there
  float u2 = fract(u + 0.5) - 0.5; vec2 du = vec2(dFdx(u), dFdy(u)); vec2 du2 = vec2(dFdx(u2), dFdy(u2));
  if (dot(du2, du2) < dot(du, du)) du = du2;
  vec2 dv = vec2(dFdx(v), dFdy(v));
// over real ground a pixel's size on it, in radians (its derivatives jump at the mountains' edges)
// close by, a pixel seen at a slant (towards the horizon) covers more ground along the ray: its size grows by
// 1 / cos of the angle, so the pictures and slopes are read at that size and do not turn into noise there
// (the picture by the whole stretch, up to 8 times; its slopes by its square root, up to 2.5: a wider reach turns the
// picture's broad light and dark into false slopes)
  float fp = max(th * pix, 1e-7), fpa = fp; float ci = max(dot(-d, p), 0.0);
  float fpt = fp; if (terr) { fpt = fp / max(ci, 0.03); fpa = fp / max(ci, 0.125); fp = mix(fpa, fp / max(sqrt(ci), 0.4), smoothstep(0.08, 0.35, ci)); }
  if (terr) { float k = fpa / 6.2831853 / max(0.05, sqrt(1.0 - p.z * p.z)); du = vec2(k, 0.0); dv = vec2(0.0, fpa / 3.1415927); }
// a detail picture: only inside its window, the window stretched over the picture
  if (useWin > 0.5) {
    float uw = u; if (uw < win.x) uw += 1.0; else if (uw > win.z) uw -= 1.0;
    if (uw < win.x || uw > win.z || v < win.y || v > win.w) discard;
    vec2 k = 1.0 / (win.zw - win.xy); u = (uw - win.x) * k.x; v = (v - win.y) * k.y; du *= k.x; dv *= k.y;
  }
  vec3 c = textureGrad(tex, vec2(u, v), vec2(du.x, dv.x), vec2(du.y, dv.y)).rgb;
// the bands drift: the picture read twice, half a cycle apart, each moved by its band's wind (an angle: the
// wind over the latitude's circle), and cross-faded so neither is seen while it jumps back
  if ((flowA > 0.0 || vinfo.z > 0.0 || vinfo.x > 0.5) && useWin < 0.5) {
    vec2 st = morph(vec2(u, v), p), gx = vec2(du.x, dv.x), gy = vec2(du.y, dv.y);
    float lat = (0.5 - st.y) * 3.1415927, s = flowA * jet(lat) / max(cos(lat), 0.25);
    float p1 = flowPh, p2 = fract(flowPh + 0.5), w1 = 1.0 - abs(2.0 * p1 - 1.0);
// inside a storm: each of its two readings (half its cycle apart) read with the bands' two
    float tw, tw2; float q1 = vinfo.y, q2 = fract(q1 + 0.5), wq = 1.0 - abs(2.0 * q1 - 1.0);
    vec2 sa = storms(st, q1 - 0.5, tw), sb = storms(st, q2 - 0.5, tw2);
    c = textureGrad(tex, vec2(sa.x - s * (p1 - 0.5), sa.y), gx, gy).rgb * w1 + textureGrad(tex, vec2(sa.x - s * (p2 - 0.5), sa.y), gx, gy).rgb * (1.0 - w1);
    if (tw > 0.0) { vec3 cb = textureGrad(tex, vec2(sb.x - s * (p1 - 0.5), sb.y), gx, gy).rgb * w1 + textureGrad(tex, vec2(sb.x - s * (p2 - 0.5), sb.y), gx, gy).rgb * (1.0 - w1);
      c = c * wq + cb * (1.0 - wq); } }
  vec3 n = p;
  vec3 east = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-6, 0.0, 0.0)); vec3 north = cross(p, east);
// far off (not close by) the heights add no slopes: the picture alone, as it is (the slopes fade in close by)
// wr: the slopes fade in from 0.06 to 0.03 radii up (with them the picture's own baked light is taken out)
  if (useH > 0.5 && terr) { float wr = 1.0 - smoothstep(0.03, 0.06, length(eye) - 1.0);
// real heights: their slope east and north tilts the normal (the sharp picture at the pixel's size, the bumps close by)
    float ta = 6.2831853 / float(textureSize(htex, 0).x); if (useD > 0.5 && useWin > 0.5) ta = 6.2831853 * (win.z - win.x) / float(textureSize(dtex, 0).x);
    float eps = max(fp, ta * 0.5);
    float lod = max(0.0, log2(max(eps, fpt * 0.7) / ta)); float nb = 0.0;
// close by also the finer bumps, down to about three pixels across
    if (terr && lite < 0.5) nb = octsF(max(fp * 3.0, fpt * 1.5));
    float gx = (shadeH(normalize(p + east * eps), lod) - shadeH(normalize(p - east * eps), lod)) / (2.0 * eps);
    float gy = (shadeH(normalize(p + north * eps), lod) - shadeH(normalize(p - north * eps), lod)) / (2.0 * eps);
    vec3 tl = hrel * (gx * east + gy * north);
// the bumps at the pixel's own size, at their true slope
    if (nb > 0.0) { float eb = max(fp, 1e-7); float b0 = bumpsF(p, nb);
      tl += (bumpsF(normalize(p + east * eb), nb) - b0) / eb * east + (bumpsF(normalize(p + north * eb), nb) - b0) / eb * north; }
// close by, a sharper picture's own small slopes: its brightness against its blur is the slope towards its own sun
// (draw.rs `sphere` 31, 39); its baked light is taken out of the colour, the game's sun lights the slopes
// finer than the detail pictures' pixels (2 pi / 16384 radians): made-up rocks and crags, seeded by the place
// itself (value noise of the point, three sizes, the finest ridged), the same wherever the eye comes from and
// without seams; each size fades in once it is a few screen pixels long (and out towards the horizon)
    if (terr && wr > 0.0) { vec3 g = vec3(0.0); float lw = 7.67e-4; mat3 rk = mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6);
      for (int k = 0; k < 3; k++) { float w = smoothstep(1.0, 2.0, log2(lw / max(fpt, 1e-9)));
        if (w > 0.0) { vec4 q = vnd(rk * (p / lw) + vec3(17.3 * float(k), 5.1, 0.0)); vec3 dq = 2.0 * (q.yzw * rk);
          if (k == 2) { float m = 2.0 * q.x - 1.0; dq *= -m * inversesqrt(m * m + 0.03); }
          g += w * (0.025 + 0.015 * float(k)) * dq; }
        lw /= 3.0; rk = rk * mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6); }
      tl += g - p * dot(g, p); }
    if (terr && mapK > 0.0) { float l0 = lumAt(p, fpt, 0.0, 1.0), lb = lumAt(p, fpt, 3.0, 1.0); float sl = clamp((l0 - lb) / mapK, -1.5, 1.5);
      float ee = useWin > 0.5 ? smoothstep(0.0, 0.06, min(min(u, 1.0 - u), min(v, 1.0 - v))) : 1.0; sl *= ee;
      tl += sl * (cos(mapAz) * east + sin(mapAz) * north); c *= mix(1.0, clamp(lb / max(l0, 0.02), 0.5, 2.0), wr * ee); }
// the phone's lite ground: the bumps and craters as fine as on a computer (down to about three pixels
// across), but their slope only towards the sun: the height here and one step towards it (two reads, as in a
// Shadertoy height shader), not a whole normal (three); without it the lite ground close by was flat
    if (terr && lite > 0.5 && lite < 1.5 && wr > 0.0) { float nl = octsF(max(fp * 3.0, fpt * 1.5));
      vec3 st = sun - p * dot(sun, p); float sl = length(st);
      if (sl > 1e-4) { st /= sl; float e = max(fp, 1e-8); tl += (bumpsF(normalize(p + st * e), nl) - bumpsF(p, nl)) / e * st; } }
    n = normalize(p - tl * wr);
  } else if (relief != 0.0 && useH < 0.5) {
// relief: the picture's brightness as height tilts the normal for the sun
    vec2 ts = 1.0 / vec2(textureSize(tex, 0)); float clat = max(0.05, sqrt(1.0 - p.z * p.z));
    float hx = (lum(vec2(u + ts.x, v)) - lum(vec2(u - ts.x, v))) / (2.0 * ts.x * 6.2831853 * clat);
    float hy = (lum(vec2(u, v - ts.y)) - lum(vec2(u, v + ts.y))) / (2.0 * ts.y * 3.1415927);
    n = normalize(p - relief * (hx * east + hy * north));
  }
  float s = dot(p, sun); float kl = 0.0;
  if (lit > 0.5 && useH > 0.5) {
// real heights: the slope against the ground's own (flat) light, and close by the shadows of the hills
    float sn = dot(n, sun); float k = smoothstep(-0.04, terr ? 0.22 : 0.3, s) * clamp(sn / max(s, 0.06), 0.0, 1.6);
// (the mesh's point lies on its flat triangles: the sun's ray starts from the true ground there)
    if (terr && k > 0.0 && sn > 0.0) k *= sunRay(mesh ? p * (ground(p, octs(th * pix * 0.5)) + fp * 0.5) : eye + (eyeL + d * th), fp);
    kl = k;
// close by on the day side the shadows are not black: the sunlit ground round them lights them a little
// (about a fifth), and the slopes still show in it (the shadows of the coarse heights were blurry black patches)
    if (terr) k = max(k, 0.2 * smoothstep(-0.04, 0.22, s) * clamp(1.0 + 3.0 * (dot(n, p) - 1.0) + 0.6 * dot(n - p * dot(n, p), sun), 0.3, 1.3));
    c *= mix(1.0 - night, 1.0, min(k, 1.25));
  } else if (lit > 0.5) { float sn = dot(n, sun); float k = smoothstep(-0.06, 0.3, s); if (relief != 0.0) k *= smoothstep(-0.25, 0.2, sn) * (0.55 + 0.45 * smoothstep(0.0, 0.6, sn / max(s, 0.05)));
    c *= mix(1.0 - night, 1.0, k) * (0.8 + 0.2 * max(sn, 0.0)); kl = k; }
// the light that changes with where the eye is (draw.rs `sphere` 120-122), so that a headset's two eyes see the
// ground a little differently, as real ground: ve towards the eye, hw half way between the sun and ve
  vec3 ve = -d, hw = normalize(sun + ve);
// dust (the Moon's regolith): Lommel-Seeliger against Lambert (no darker limb; a slope turned from the eye is not
// darker), and the opposition surge: round the point opposite the sun (the shadow of the eye's head) the ground
// shines, its grains' shadows hidden behind them (Hapke, its width h = 0.05); 1 at a phase angle of 30 degrees
  if (lit > 0.5 && dust > 0.0) { float mu0 = max(dot(n, sun), 0.0), mu = max(dot(n, ve), 0.03), ls = clamp((max(s, 0.03) + max(dot(p, ve), 0.03)) / (mu0 + mu + 1e-3), 0.5, 2.5);
    float ca = clamp(dot(ve, sun), -1.0, 1.0), ta = sqrt(max(1.0 - ca, 0.0) / max(1.0 + ca, 1e-6)), B = (1.0 + 1.0 / (1.0 + ta / 0.05)) / (1.0 + 1.0 / (1.0 + 0.268 / 0.05));
    c *= mix(1.0, ls * B, dust * smoothstep(-0.04, 0.1, s)); }
// the sea's glint: the sun mirrored on the water (the picture's dark blue), a sharp spot and a wide sheen of waves
  if (lit > 0.5 && seaG > 0.0 && kl > 0.0) { float nh = max(dot(n, hw), 0.0);
    float wet = smoothstep(0.03, 0.12, c.b - max(c.r, c.g * 0.85)) * (1.0 - smoothstep(0.35, 0.6, c.r + c.g));
    c += vec3(1.0, 0.93, 0.8) * seaG * wet * min(kl, 1.0) * (pow(nh, 250.0) * 2.5 + pow(nh, 30.0) * 0.2); }
// the grains' glints, close by (up to about 1e-4 radii away)
  if (lit > 0.5 && glint > 0.0 && terr && kl > 0.0 && th < 1e-4) c += vec3(1.5, 1.45, 1.35) * glint * min(kl, 1.0) * grains(eyeL + d * th, n, hw, fpt) * (1.0 - smoothstep(3e-5, 1e-4, th));
// close by, a band about 10 pixels on each side of the smooth ball's horizon line fades to black (the edge
// against the black sky shows no pixel steps, cheaper than multisampling), and the ground far off dims a little
  if (terr) { float e = length(eye), dh = sqrt(max(e * e - 1.0, 1e-9)), ah = asin(min(1.0 / e, 1.0)), a = acos(clamp(-dot(d, eye) / e, -1.0, 1.0)), w = 10.0 * pix;
    c *= (1.0 - smoothstep(ah - w, ah, a) * (1.0 - smoothstep(ah, ah + w, a))) * (1.0 - 0.5 * smoothstep(0.5 * dh, 1.5 * dh, th)); }
// the rings' shadow on the ball
  if (useR > 0.5 && lit > 0.5 && abs(sun.z) > 1e-4) { float ts = -p.z / sun.z; if (ts > 0.0) c *= 1.0 - 0.9 * ringA(length((p + sun * ts).xy), 0.5); }
  if (star.z > 0.0 && useWin < 0.5) c = starSurf(c, p, d, fp);
// the hot cap: molten rock glowing by its own heat (the same by day and by night). v60 (Tero: the seam
// between the Earth and Theia should melt together, red and yellow mixed like a hot gas, yellow rising
// from the ground like veins or a volcano): the heat is turbulent noise (domain-warped, so it swirls)
// added to the distance from the middle, mapped through dark red, orange, yellow and white-hot, and the
// cap's edge breaks up with it; past the edge, glowing cracks run out into the cold ground
  if (hotk.y > 0.0 && useWin < 0.5) { float ha = acos(clamp(dot(p, hot.xyz), -1.0, 1.0));
    float hw = 1.0 - smoothstep(hot.w - hotk.x, hot.w, ha), hx = 1.0 - smoothstep(hot.w - hotk.x, hot.w + 0.8 * hotk.x + 0.05, ha);
    if (hx > 0.0) { float hl = lum(vec2(u, v)); vec3 q = p * 5.0;
      vec2 wq = vec2(hfb(q + vec3(1.7, 9.2, 3.1)), hfb(q + vec3(8.3, 2.8, 5.4))) - 0.5;
      float n = hfb(q * 1.7 + vec3(wq * 2.4, wq.x - wq.y));
      float rv = 1.0 - abs(2.0 * vnoise(p * 15.0 + vec3(wq.yx * 3.0, wq.x * 2.0)) - 1.0), vein = rv * rv * rv * rv; vein *= vein;
      float h = clamp(hw * 0.82 + (n - 0.5) * 1.15 + 0.25 * hl * hw + vein * 0.8 * hx * (1.0 - 0.5 * hw), 0.0, 1.5);
      vec3 g = mix(vec3(0.42, 0.05, 0.02), vec3(0.86, 0.22, 0.04), smoothstep(0.0, 0.35, h));
      g = mix(g, vec3(1.0, 0.55, 0.12), smoothstep(0.28, 0.62, h)); g = mix(g, vec3(1.0, 0.84, 0.4), smoothstep(0.58, 0.95, h));
      g = mix(g, vec3(1.0, 0.96, 0.82), smoothstep(0.95, 1.35, h)) + vec3(1.0, 0.86, 0.55) * 0.7 * exp(-ha / (0.18 * hot.w + 0.03));
      g += vec3(1.0, 0.68, 0.24) * 0.5 * hw * (1.0 - hw) * 4.0 * (1.0 - step(3.0, hot.w));
      float ca = clamp(hw * (0.7 + 0.6 * n) + vein * hx * (1.0 - hw) * 1.2, 0.0, 1.0);
      c = mix(c, g * hotk.y, ca); } }
// city lights on the night side (the map read at the point itself, also under a detail window)
  if (useL > 0.5 && lit > 0.5) {
    vec3 L = texture(ltex, lonlat(p)).rgb; c += L * vec3(1.0, 0.88, 0.65) * lgain * (1.0 - smoothstep(-0.12, 0.06, s));
  }
// the air in front of the ground: thicker towards the rim
  if (air > 0.0 && useWin < 0.5) {
    float R = 1.0 + air; float t0 = -b - sqrt(max(R * R - q2, 0.0));
    vec4 g = airGlow(d, p, 0.0, max(th - max(t0, 0.0), 0.0), true);
    c = mix(c, g.rgb, g.a * 0.85);
  }
// a sharper picture fades in as it comes closer (0.85 to 0.55 radii away), so that it does not jump in over
// the ball's own picture when the game changes the pictures; and, close by too, round the point under the eye
// (0.10 to 0.18 radians): the game's pieces reach at least that far, so their outer edge (and their finer
// slopes) never show against the ball's own picture; the ball's hole is only inside 0.10 radians
  float fa = useWin > 0.5 ? (terr ? 1.0 : 1.0 - smoothstep(0.55, 0.85, th)) * (1.0 - smoothstep(0.10, 0.18, acos(clamp(dot(p, normalize(eye)), -1.0, 1.0)))) : 1.0;
  if (soft) fa *= cover;
  if (fa <= 0.0) discard;
  DEPTH(th); o = vec4(min(c, vec3(1.0)) * fa, fa);
// the part of an edge pixel the ball leaves: the air behind it
  if (soft && cover < 1.0 && air > 0.0) { float R = 1.0 + air; vec4 g = airGlow(d, q, max(sqrt(q2) - 1.0, 0.0) / air, 2.0 * sqrt(max(R * R - q2, 0.0)), false);
    o += vec4(min(g.rgb, vec3(1.0)) * g.a, g.a) * (1.0 - cover); }
// the rings in front of the ball (behind it they are hidden); at the edge the part the ball leaves sees them too
  if (tr > 0.0 && (tr < th || cover < 1.0)) { float k = tr < th ? 1.0 : 1.0 - cover; o = rg * k + o * (1.0 - rg.a * k); }
}
