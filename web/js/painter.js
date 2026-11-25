// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Paints the engine's draw stream (crates/rg_engine/src/draw.rs) on a 2D
// canvas: EVG's display list, read as numbers, without JSON. The layout and
// every position is EVG's; this file only fills, strokes and writes text.
(function (global) {
  "use strict";
  var HEADER = 23;
  var KIND = { RECT: 0, BORDER: 1, IMAGE: 2, TEXT: 3, PUSH_CLIP: 4, POP_CLIP: 5, PATH: 6, STROKE: 7, SPHERE: 8 };
  // EVG measures with Noto Sans; the page draws with its own default stack
  var DEFAULT_FONT = '"Fredoka", "Nunito", "Noto Sans", "Trebuchet MS", sans-serif';

  function rgba(r, g, b, a) {
    return a >= 1 ? "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")"
      : "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a + ")";
  }

  function roundRect(ctx, x, y, w, h, tl, tr, br, bl) {
    var lim = Math.min(w, h) / 2;
    tl = Math.max(0, Math.min(tl, lim)); tr = Math.max(0, Math.min(tr, lim));
    br = Math.max(0, Math.min(br, lim)); bl = Math.max(0, Math.min(bl, lim));
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  function family(name) {
    if (!name || name === "Noto Sans") return DEFAULT_FONT;
    return name.indexOf(",") >= 0 ? name + ", sans-serif" : '"' + name.replace(/"/g, "") + '", ' + DEFAULT_FONT;
  }

  // Textured globes (draw kind 8, crates/rg_engine/src/draw.rs `sphere`): a
  // WebGL2 canvas off the page casts a ray through every pixel of the box,
  // reads the map picture where it meets the ball and is then drawn into the
  // 2D canvas, so the globe keeps its place in the painter's order.
  var SPHERE_VS = "#version 300 es\nin vec2 a; out vec2 uv; out vec3 wpos; void main() { uv = a; wpos = vec3(0.0); gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }";
  var SPHERE_FS = "#version 300 es\nprecision highp float; precision highp int; in vec2 uv; in vec3 wpos; out vec4 o;" +
    "uniform sampler2D tex, ltex, htex, gtex, dtex; uniform vec3 eye, rgt, upv, fwd, sun, airc; uniform vec4 box, win; uniform vec2 view;" +
    "uniform float focal, night, lit, useWin, air, lgain, useL, relief;" +
    // real heights (draw.rs `sphere`, 40 numbers): low, high, the bumps' amplitude, near, shading tilt, the bumps' lattice
    "uniform float useH, hlo, hhi, hamp, nearM, hrel, hfreq, crat, mapAz, mapK, useHole, lite, useD; uniform vec4 hole;" +
    // RG_DEPTH (the web's windows with their own heights, drawn together): the ray's length as the depth, so the
    // nearest ground of all the windows shows (a phone's mesh has its own depth: there it is left out)
    "\n#ifdef RG_DEPTH\n#define DEPTH(t) gl_FragDepth = clamp(log2(max(t, 1e-9) * 1e6) / 26.0, 0.0, 1.0)\n#else\n#define DEPTH(t)\n#endif\n" +
    // meshM (a phone's GPU, android GlSphere): 1 = the ground close by as a mesh (wpos: the point on it, in radii),
    // 2 = only the air round it (drawn first); 0 = as here, a ray cast for each pixel
    "uniform float meshM;" +
    // rings in the equator plane (draw.rs `sphere`, 44 numbers): pictures of their colour and opacity across, edges in radii
    "uniform sampler2D rctex, ratex; uniform float useR, rIn, rOut;" +
    // a gas giant's cloud bands drifting (48 numbers): flowA how far the fastest band goes in a cycle (picture
    // widths), flowPh where in the cycle; jet(lat) the east (+) and west (-) winds by latitude, after Jupiter's:
    // a fast equator, jets every ~15 degrees, quiet near the poles
    "uniform float flowA, flowPh;" +
    "float jet(float lat) { return (0.55 * cos(lat * 24.0) + 0.6 * exp(-lat * lat * 60.0) - 0.1) * (1.0 - smoothstep(1.0, 1.3, abs(lat))); }" +
    // the clouds morphing and their storms turning (72 numbers, globe.rs vortex_params): vinfo = (storms, where in
    // their cycle, how much the clouds morph, the morph's time), vtx[i] = (u, v, radius in radians, width / height),
    // vamp[i] how far its middle turns in a cycle (radians)
    "uniform vec4 vinfo; uniform vec4 vtx[4]; uniform float vamp[4];" +
    // a glowing hot cap (80 numbers, globe.rs `hot`): hot = (its middle on the ball, radius in radians),
    // hotk = (soft edge in radians, gain); lit by its own heat
    "uniform vec4 hot; uniform vec2 hotk;" +
    // the morph is EVG's smoke: noise read at a place two other noises have moved (domain warping), on the ball
    // (no seam), stretched along the bands, the two warps out of step so that it rolls instead of breathing
    "float vh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }" +
    "float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);" +
    "  return mix(mix(mix(vh(i), vh(i + vec3(1.0, 0.0, 0.0)), f.x), mix(vh(i + vec3(0.0, 1.0, 0.0)), vh(i + vec3(1.0, 1.0, 0.0)), f.x), f.y)," +
    "    mix(mix(vh(i + vec3(0.0, 0.0, 1.0)), vh(i + vec3(1.0, 0.0, 1.0)), f.x), mix(vh(i + vec3(0.0, 1.0, 1.0)), vh(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }" +
    "float vf(vec3 x) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vn(x); x = x * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }" +
    // where the picture is read for a place (u, v; p on the ball): the morph's warp, mostly along the bands
    "vec2 morph(vec2 st, vec3 p) { if (vinfo.z <= 0.0) return st; float t = vinfo.w;" +
    "  vec3 q = p * vec3(5.0, 5.0, 14.0);" +
    "  vec3 w1 = vec3(vf(q + vec3(0.0, 0.0, t * 0.31)), vf(q + vec3(5.2, 1.3, -t * 0.23)), vf(q + vec3(2.1, 7.7, t * 0.17)));" +
    "  float dx = vf(q + 2.2 * w1 + vec3(1.7, 9.2, t * 0.5)) - 0.44, dy = vf(q + 2.2 * w1 + vec3(8.3, 2.8, -t * 0.4)) - 0.44;" +
    "  float cl = max(sqrt(1.0 - p.z * p.z), 0.2);" +
    "  return st + vec2(dx * 0.016 / cl, dy * 0.006) * vinfo.z; }" +
    // a storm turns what is read inside it: by an angle that grows to the middle (ph: this reading's place in the
    // cycle, -0.5..0.5), on its ellipse; tw: how much of the place is inside a storm
    "vec2 storms(vec2 st, float ph, out float tw) { tw = 0.0;" +
    "  for (int i = 0; i < 4; i++) { if (float(i) >= vinfo.x) break; vec4 V = vtx[i];" +
    "    float cl = max(cos((0.5 - V.y) * 3.1415927), 0.05), dl = st.x - V.x; dl -= floor(dl + 0.5);" +
    "    vec2 d = vec2(dl * 6.2831853 * cl / V.w, (V.y - st.y) * 3.1415927) / V.z; float r2 = dot(d, d);" +
    "    if (r2 >= 1.0) continue; float pr = (1.0 - r2) * (1.0 - r2); tw = max(tw, pr);" +
    "    float a = -vamp[i] * ph * pr, cs = cos(a), sn = sin(a); d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);" +
    "    st = vec2(V.x + d.x * V.z * V.w / (6.2831853 * cl), V.y - d.y * V.z / 3.1415927); }" +
    "  return st; }" +
    // the glowing air seen along the ray: a = how much, col = its light. lo: the
    // ray's lowest point (on the ground for a ray that hits); len: its path in the air
    "vec4 airGlow(vec3 d, vec3 lo, float alt, float len, bool hit) {" +
    "  float up = dot(normalize(lo), sun);" +
    "  float day = smoothstep(-0.28, 0.12, up);" +
    // looking towards the sun past the rim: forward scattering, a white burst at sunrise
    "  float fw = pow(max(dot(d, sun), 0.0), 10.0) * smoothstep(-0.45, 0.02, up);" +
    "  float dusk = smoothstep(-0.3, -0.02, up) * (1.0 - smoothstep(0.0, 0.25, up));" +
    // thinning smoothly to nothing at the top, and a soft (not clipped) build-up
    // towards the rim: a gradient, no hard ring
    "  float dens = exp(-alt * 3.5) * (1.0 - alt) * (1.0 - alt);" +
    "  float depth = dens * len / (air * 2.0);" +
    "  float a = 1.0 - exp(-depth * (0.38 * day + 2.6 * fw + 0.25 * dusk));" +
    "  vec3 col = airc * (0.7 + 0.6 * day) + vec3(1.0, 0.96, 0.9) * fw * 3.0 + vec3(1.0, 0.55, 0.3) * dusk * 0.8;" +
    "  return vec4(col, a);" +
    "}" +
    "float lum(vec2 t) { vec3 c = texture(tex, t).rgb; return dot(c, vec3(0.3, 0.5, 0.2)); }" +
    // the map's brightness at the unit direction q, read at the level for the size eps (radians); under a detail window
    // the window's picture
    // s > 1: the picture itself s times smaller, turned and mirrored (no seams), for the detail finer than its pixels
    "float lumAt(vec3 q, float eps, float more, float s) { vec2 t = vec2(atan(q.y, q.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(q.z, -1.0, 1.0)) / 3.1415927);" +
    "  float span = 1.0;" +
    "  if (useWin > 0.5) { if (t.x < win.x) t.x += 1.0; else if (t.x > win.z) t.x -= 1.0; span = win.z - win.x; t = (t - win.xy) / (win.zw - win.xy); }" +
    "  if (s > 1.0) { t = abs(fract((mat2(0.8, 0.6, -0.6, 0.8) * t * s + vec2(0.37, 0.71)) * 0.5) * 2.0 - 1.0); }" +
    "  float ta = 6.2831853 * span / float(textureSize(tex, 0).x);" +
    "  return dot(textureLod(tex, t, max(0.0, log2(eps * s / ta)) + more).rgb, vec3(0.3, 0.5, 0.2)); }" +
    "vec2 lonlat(vec3 p) { return vec2(atan(p.y, p.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(p.z, -1.0, 1.0)) / 3.1415927); }" +
    // the made-up bumps: value noise on the integer lattice, the hash of 32-bit integers (the same in every host and the game)
    "uint hsh(ivec3 c) { uint h = (uint(c.x) * 0x8da6b343u) ^ (uint(c.y) * 0xd8163841u) ^ (uint(c.z) * 0xcb1ab31fu);" +
    "  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u; return h; }" +
    "float hv(ivec3 c) { return float(hsh(c) >> 8u) / 16777215.0; }" +
    // value noise with its gradient (x: 0..1, yzw: d/dx), for the made-up rocks close by
    "vec4 vnd(vec3 x) { ivec3 i = ivec3(floor(x)); vec3 f = x - floor(x); vec3 u = f * f * f * (f * (6.0 * f - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);" +
    "  float a = hv(i), b = hv(i + ivec3(1, 0, 0)), c = hv(i + ivec3(0, 1, 0)), d = hv(i + ivec3(1, 1, 0));" +
    "  float e = hv(i + ivec3(0, 0, 1)), g = hv(i + ivec3(1, 0, 1)), h = hv(i + ivec3(0, 1, 1)), k = hv(i + ivec3(1, 1, 1));" +
    "  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + h, k6 = a - b - e + g, k7 = -a + b + c - d + e - g - h + k;" +
    "  return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z," +
    "    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y)); }" +
    "float vnoise(vec3 x) { vec3 f = floor(x); ivec3 c = ivec3(f); vec3 t = x - f; t = t * t * (3.0 - 2.0 * t);" +
    "  float a = mix(hv(c), hv(c + ivec3(1, 0, 0)), t.x), b = mix(hv(c + ivec3(0, 1, 0)), hv(c + ivec3(1, 1, 0)), t.x);" +
    "  float e = mix(hv(c + ivec3(0, 0, 1)), hv(c + ivec3(1, 0, 1)), t.x), g = mix(hv(c + ivec3(0, 1, 1)), hv(c + ivec3(1, 1, 1)), t.x);" +
    "  return mix(mix(a, b, t.y), mix(e, g, t.y), t.z); }" +
    // three octaves of value noise, 0..1 (the hot cap's swirling heat)
    "float hfb(vec3 x) { return (vnoise(x) * 0.5 + vnoise(x * 2.03) * 0.25 + vnoise(x * 4.11) * 0.125) / 0.875; }" +
    // craters: at most one in each lattice cell, inside it (so only the point's own cell is read)
    "float crater(vec3 p, float f, int o) { vec3 x = p * f + vec3(0.37, 0.61, 0.19) * float(o & 1); vec3 fc = floor(x); ivec3 c = ivec3(fc);" +
    "  uint h = hsh(ivec3(c.x + 1000 * (o + 1), c.y, c.z)); if ((h & 255u) >= 170u) return 0.0;" +
    "  uint g = hsh(ivec3(c.x, c.y + 7919, c.z + 31 * o));" +
    "  vec3 j = vec3(float((h >> 8u) & 255u), float((h >> 16u) & 255u), float((g >> 8u) & 255u)) / 255.0 * 0.5 + 0.25;" +
    "  float rr = 0.08 + 0.1 * float(g & 255u) / 255.0; float dd = length(x - fc - j) / rr;" +
    "  if (dd >= 1.4) return 0.0;" +
    "  float k = rr / f; float b = dd < 1.0 ? 0.4 * (dd * dd - 1.0) + 0.08 * smoothstep(0.6, 1.0, dd) : 0.08 * (1.0 - smoothstep(1.0, 1.4, dd));" +
    "  return b * k; }" +
    // the made-up bumps: five octaves of value noise and craters of three sizes (draw.rs `sphere`); n > 5: finer ones too (only for the shading)
    // (n may be fractional: the last octave then counts by its fraction, so that the finer ones fade in by the pixel's
    // size instead of turning on at a distance, a line that swept over the ground as the ship moved)
    "float bumpsF(vec3 p, float n) { if (hamp <= 0.0) return 0.0; float s = 0.0, a = 1.0, f = hfreq;" +
    "  for (int k = 0; k < 9; k++) { float w = clamp(n - float(k), 0.0, 1.0); if (w <= 0.0) break; s += w * a * (2.0 * vnoise(p * f) - 1.0); a *= 0.48; f *= 2.03; }" +
    "  float cr = 0.0; if (crat > 0.0) { float cf = hfreq * 0.9; float nc = n >= 5.0 ? n - 2.0 : max(n - 2.0, 1.0);" +
    "    for (int k = 0; k < 7; k++) { float w = clamp(nc - float(k), 0.0, 1.0); if (w <= 0.0) break; cr += w * (crater(p, cf, 2 * k) + crater(p, cf, 2 * k + 1)); cf *= 2.7; } }" +
    "  return s * hamp + cr * crat; }" +
    "float bumps(vec3 p, int n) { return bumpsF(p, float(n)); }" +
    // how many octaves of bumps are at least sz (radii) long, from 5 up to 8, fractional
    "float octsF(float sz) { return 5.0 + clamp(log2(1.0 / (hfreq * pow(2.03, 5.0) * sz)) / log2(2.03) + 1.0, 0.0, 3.0); }" +
    "float dec(vec4 c) { return (c.r * 65280.0 + c.g * 255.0) / 65535.0; }" +
    // the ground's radius at unit direction p: the coarse shape picture plus n octaves of bumps
    // the shape read bilinearly by hand, like the game reads it: GPUs' own filtering weighs the texels in 1/256 steps,
    // and those small terraces cast false shadows when the sun is low
    "float shape(vec2 t) { ivec2 sz = textureSize(gtex, 0); vec2 x = t * vec2(sz) - 0.5; vec2 f = floor(x); vec2 a = x - f;" +
    "  int i0 = int(f.x) % sz.x; if (i0 < 0) i0 += sz.x; int i1 = (i0 + 1) % sz.x;" +
    "  int j0 = clamp(int(f.y), 0, sz.y - 1), j1 = clamp(int(f.y) + 1, 0, sz.y - 1);" +
    "  float top = mix(dec(texelFetch(gtex, ivec2(i0, j0), 0)), dec(texelFetch(gtex, ivec2(i1, j0), 0)), a.x);" +
    "  float bot = mix(dec(texelFetch(gtex, ivec2(i0, j1), 0)), dec(texelFetch(gtex, ivec2(i1, j1), 0)), a.x);" +
    "  return mix(top, bot, a.y); }" +
    // how many octaves of bumps are bigger than sz (radii): the smaller ones don't change what a ray meets
    "int octs(float sz) { if (hamp <= 0.0) return 0; int n = 0; float a = hamp * 1.5; for (int k = 0; k < 5; k++) { if (a < sz || (lite > 0.5 && n >= 3)) break; n++; a *= 0.48; } return n; }" +
    // a detail window's own heights (dtex, useD): inside the window they are the ground's height, up to its
    // edge (the next window's heights go on from there, the same ground; a fade would sink the ground towards
    // the ball's coarse shape along every seam); xy: the window's u v, z: 1 inside (rg.height reads them alike)
    "vec3 winAt(vec2 t) { float uw = t.x; if (uw < win.x) uw += 1.0; else if (uw > win.z) uw -= 1.0;" +
    "  vec2 w = vec2((uw - win.x) / (win.z - win.x), (t.y - win.y) / (win.w - win.y));" +
    "  return vec3(w, w.x >= 0.0 && w.x <= 1.0 && w.y >= 0.0 && w.y <= 1.0 ? 1.0 : 0.0); }" +
    // outside the window (the other windows' ground, each drawn by its own command) the ground is left out
    // (the lowest height): rays and shadows pass over it, instead of meeting the ball's coarse shape there,
    // which stands higher or lower than the real ground and left holes along the seams
    "float coarseH(vec3 p) { vec2 t = lonlat(p);" +
    // (a phone's mesh: its corners just outside the window take the window's edge, its triangles there are cut
    // off at the window's edge, and the left out ground would have pulled them down)
    "  if (useD > 0.5 && useWin > 0.5) { vec3 w = winAt(t); return w.z > 0.0 || meshM > 0.5 ? (hhi - hlo) * dec(textureLod(dtex, clamp(w.xy, 0.0, 1.0), 0.0)) : 0.0; }" +
    "  return (hhi - hlo) * shape(t); }" +
    "float ground(vec3 p, int n) { return 1.0 + hlo + coarseH(p) + bumps(p, n); }" +
    "float groundF(vec3 p, float n) { return 1.0 + hlo + coarseH(p) + bumpsF(p, n); }" +
    // octs, fractional (the phone's mesh: its corners' heights change smoothly as they slide over the ground)
    "float octsAF(float sz) { if (hamp <= 0.0) return 0.0; return clamp(log(hamp * 1.5 / max(sz, 1e-9)) / log(1.0 / 0.48) + 1.0, 0.0, lite > 0.5 ? 3.0 : 5.0); }" +
    // the height read for the shading: the sharp picture (at a level for the size eps) plus the bumps
    "float shadeH(vec3 p, float lod) { vec2 t = lonlat(p); bool dw = useD > 0.5 && useWin > 0.5;" +
    "  float lh = dw ? max(0.0, lod + log2(float(textureSize(htex, 0).x) * (win.z - win.x) / float(textureSize(dtex, 0).x))) : lod;" +
    "  float h = (hhi - hlo) * dec(textureLod(htex, t, lh));" +
    "  if (dw) { vec3 w = winAt(t); if (w.z > 0.0) h = mix(h, (hhi - hlo) * dec(textureLod(dtex, w.xy, lod)), w.z); }" +
    "  return h; }" +
    // casts the ray against the ground's shape; t: where it meets it
    "bool march(vec3 d, float pix, out float t) {" +
    "  float Ro = 1.0 + hhi + 2.0 * hamp + 0.05 * crat / hfreq, Ri = 1.0 + hlo - 2.0 * hamp - 0.25 * crat / hfreq;" +
    "  float bq = dot(eye, d), ee = dot(eye, eye); float ds = bq * bq - ee + Ro * Ro;" +
    "  t = 0.0; if (ds < 0.0) return false;" +
    "  float t0 = max(0.0, -bq - sqrt(ds)), t1 = -bq + sqrt(ds);" +
    "  float di = bq * bq - ee + Ri * Ri; if (di > 0.0 && -bq - sqrt(di) > 0.0) t1 = min(t1, -bq - sqrt(di));" +
    "  if (t1 <= t0) return false;" +
    "  float tp = t0; t = t0; bool hit = false;" +
    // lite (a phone's GPU): at most 56 steps, then where the ray is (only far off, at the horizon)
    "  for (int i = 0; i < 160; i++) {" +
    "    if (lite > 0.5 && i >= 56) { hit = true; tp = t; break; }" +
    "    vec3 x = eye + d * t; float r = length(x); float f = r - ground(x / r, octs(t * pix));" +
    "    if (f < 0.0) { hit = true; break; }" +
    "    if (f < t * pix * 0.3) { hit = true; tp = t; break; }" +
    "    tp = t; t += max(f * 0.7, t * pix * 0.8);" +
    "    if (t > t1) return false;" +
    "  }" +
    "  if (!hit) return false;" +
    // between the last point above and the first below, with all the bumps
    "  float a = tp, b = t;" +
    "  for (int i = 0; i < 7; i++) { if (lite > 0.5 && i >= 4) break; float m = (a + b) * 0.5; vec3 x = eye + d * m; float r = length(x);" +
    "    if (r - ground(x / r, octs(m * pix * 0.5)) < 0.0) b = m; else a = m; }" +
    "  t = b; return true;" +
    "}" +
    // how much sun reaches the ground point x (radii from the centre): a ray towards the sun against the ground's shape,
    // soft at the edges
    "float sunRay(vec3 x, float sz) {" +
    "  float k = 1.0, t = max(sz * 4.0, 2e-6);" +
    "  for (int i = 0; i < 24; i++) { if (lite > 0.5 && i >= 10) break; vec3 y = x + sun * t; float r = length(y); if (r > 1.0 + hhi + 2.0 * hamp + 0.05 * crat / hfreq) break;" +
    "    float h = r - ground(y / r, octs(t * 0.1)); k = min(k, 10.0 * h / t); if (k < 0.0) return 0.0; t *= 1.35; }" +
    "  return clamp(k, 0.0, 1.0);" +
    "}" +
    // the rings' opacity at rr radii from the middle (for shadows: the coarse picture)
    "float ringA(float rr, float lod) { if (rr <= rIn || rr >= rOut) return 0.0; return textureLod(ratex, vec2((rr - rIn) / (rOut - rIn), 0.5), lod).r; }" +
    // where the ray meets the rings (tr: how far, -1 if not) and what it sees there, premultiplied: far off the
    // pictures, close by (a pixel under ~1 km of ring) specks, the lumps of ice they are made of, on a lattice of
    // cells a few pixels wide (two sizes blended by the distance, so they do not pop)
    "vec4 ring(vec3 d, float pix, out float tr) { tr = -1.0;" +
    "  if (useR < 0.5 || abs(d.z) < 1e-7) return vec4(0.0); float t = -eye.z / d.z; if (t <= 0.0) return vec4(0.0);" +
    "  vec3 p = eye + d * t; float rr = length(p.xy); if (rr <= rIn || rr >= rOut) return vec4(0.0); tr = t;" +
    "  float f = t * pix, u = (rr - rIn) / (rOut - rIn), texel = (rOut - rIn) / float(textureSize(ratex, 0).x);" +
    "  float lod = max(0.0, log2(f / max(abs(d.z / length(d)), 0.03) / texel));" +
    "  vec3 col = textureLod(rctex, vec2(u, 0.5), lod).rgb; float a = textureLod(ratex, vec2(u, 0.5), lod).r;" +
    // lit from the side the eye is on, or from behind (light through the ice, weaker where it is thick)
    "  float side = sign(sun.z) == sign(eye.z) ? 0.55 + 0.45 * sqrt(abs(sun.z)) : 0.3 * (1.0 - 0.6 * a);" +
    "  float ps = dot(p, sun); float sh = ps < 0.0 ? smoothstep(0.98, 1.02, length(p - sun * ps)) : 1.0;" +
    "  float lt = lit > 0.5 ? side * mix(0.12, 1.0, sh) : 1.0;" +
    "  float dust = 1.0 - smoothstep(1.5e-5, 1.2e-4, f);" +
    // looking towards the Sun through the rings (Cassini's backlit pictures): the thin, dusty parts
    // (the Cassini division, the outer edge) light up by forward scattering, the thick B ring stays dark
    "  float fsc = lit > 0.5 && sign(sun.z) != sign(eye.z) ? pow(max(0.0, dot(normalize(d), sun)), 6.0) * sh : 0.0;" +
    "  vec3 glow = mix(col, vec3(0.92, 0.9, 1.0), 0.6) * fsc * 3.2 * a * (1.0 - a) * (1.0 - a);" +
    "  vec4 res = vec4((col * lt * a + glow) * (1.0 - dust), a * (1.0 - dust));" +
    "  if (dust > 0.0) { float L = log2(max(f, 1e-7) * 5.0); float l0 = floor(L), fr = L - l0; float sp = 0.0;" +
    "    float a0 = textureLod(ratex, vec2(u, 0.5), 0.0).r;" +
    "    for (int k = 0; k < 2; k++) { float cs = exp2(l0 + float(k)); vec2 g = p.xy / cs; vec2 c = floor(g);" +
    "      uint h = hsh(ivec3(int(c.x), int(c.y), int(l0) + k + 4099)); vec2 j = vec2(float(h & 1023u), float((h >> 10u) & 1023u)) / 1023.0;" +
    "      if (float((h >> 20u) & 1023u) / 1023.0 < a0 * 1.2) { float dd = length((g - c - j) * cs) / f;" +
    "        sp += (k == 0 ? 1.0 - fr : fr) * (1.0 - smoothstep(0.25, 1.4, dd)) * (0.45 + 0.55 * float((h >> 4u) & 15u) / 15.0); } }" +
    "    sp = clamp(sp, 0.0, 1.0) * dust; vec3 sc = mix(col, vec3(1.0), 0.35) * lt * 1.5;" +
    "    res = vec4(min(sc, vec3(1.0)) * sp, sp) + res * (1.0 - sp); }" +
    "  return res; }" +
    "void main() {" +
    "  vec2 px = box.xy + uv * box.zw;" +
    "  bool mesh = meshM > 0.5 && meshM < 1.5;" +
    "  vec3 d = mesh ? normalize(wpos - eye) : normalize(fwd * focal + rgt * (px.x - view.x * 0.5) - upv * (px.y - view.y * 0.5));" +
    "  float b = dot(eye, d); vec3 q = eye - b * d; float q2 = dot(q, q); float disc = 1.0 - q2;" +
    "  bool terr = useH > 0.5 && nearM > 0.5; float pix = 1.0 / focal; float th = 0.0;" +
    "  float tr = -1.0; vec4 rg = (!terr && !mesh && meshM < 0.5) ? ring(d, pix, tr) : vec4(0.0);" +
    // the smooth ball's edge covers a pixel in part: how much (0..1) from how far past the rim the ray passes, in
    // pixels. Without it the rim moved in whole (picture) pixels: a far planet's edge crept and jumped back as it
    // came nearer, a wobble the eye sees
    "  float qd = sqrt(q2) - 1.0; float cover = clamp(0.5 - qd / max(fwidth(qd), 1e-7), 0.0, 1.0);" +
    "  bool soft = !terr && !mesh && meshM < 0.5 && useWin < 0.5;" +
    // a detail window close by: test the window on the smooth ball first (with a margin for mountains), so that only
    // the pixels it may cover cast the long ray
    "  if (terr && useWin > 0.5 && !mesh) { vec3 pw = normalize(disc >= 0.0 ? eye + d * (-b - sqrt(disc)) : q); vec2 w0 = lonlat(pw);" +
    "    float mg = 0.004 + 0.5 * max(hhi - hlo, 0.0); float uw = w0.x; if (uw < win.x - mg) uw += 1.0; else if (uw > win.z + mg) uw -= 1.0;" +
    "    if (uw < win.x - mg || uw > win.z + mg || w0.y < win.y - mg || w0.y > win.w + mg) discard; }" +
    // the whole ball close by: the windows drawn after it cover the hole, so only around it (a wide margin for
    // mountains seen from the side) the long ray is cast
    // (the mesh: exactly the hole, it has the true point)
    "  if (terr && useHole > 0.5 && meshM < 1.5) { vec3 pw = mesh ? normalize(wpos) : normalize(disc >= 0.0 ? eye + d * (-b - sqrt(disc)) : q); vec2 w0 = lonlat(pw);" +
    "    float mg = mesh ? 0.0 : 3.0 * (0.004 + 0.5 * max(hhi - hlo, 0.0)); float uw = w0.x; if (uw < hole.x) uw += 1.0; else if (uw > hole.z) uw -= 1.0;" +
    "    if (uw > hole.x + mg && uw < hole.z - mg && w0.y > hole.y + mg && w0.y < hole.w - mg && dot(pw, normalize(eye)) > 0.995004) discard; }" +
    "  if (mesh) th = length(wpos - eye);" +
    // the mesh's corners slide over the ground as the eye moves and its flat triangles miss the true ground a little:
    // seen at a slant the picture slid to and fro on rough ground ("flowed"); two steps along the ray to the true ground
    // (only at a slant, where it shows, and one step with the three largest octaves: two full ones cost 4-5 ms on a tablet)
    "  if (mesh && terr) { vec3 x = eye + d * th; float r = length(x); float ci0 = -dot(d, x / r);" +
    "    if (ci0 < 0.4) th += clamp((r - groundF(x / r, min(octsAF(th * pix), 3.0))) / max(ci0, 0.05), -0.05 * th, 0.05 * th) * (1.0 - smoothstep(0.25, 0.4, ci0)); }" +
    "  bool hit = meshM > 1.5 ? false : mesh ? true : terr ? march(d, pix, th) : soft ? (cover > 0.0 && -b > 0.0) : (disc >= 0.0 && -b >= sqrt(max(disc, 0.0)));" +
    "  if (!hit) {" +
    "    float R = 1.0 + air; vec4 ga = vec4(0.0);" +
    "    if (!(air <= 0.0 || useWin > 0.5 || q2 >= R * R || -b < 0.0)) { float hq = sqrt(q2);" +
    "      vec4 g = airGlow(d, q, max(hq - 1.0, 0.0) / air, 2.0 * sqrt(R * R - q2), false); ga = vec4(min(g.rgb, vec3(1.0)) * g.a, g.a); }" +
    // past the ball: the rings (in front of the air, a thin shell)
    "    ga = rg + ga * (1.0 - rg.a);" +
    "    if (ga.a < 0.003) discard;" +
    "    DEPTH(1e3); o = ga; return;" +
    "  }" +
    "  if (!terr) th = -b - sqrt(max(disc, 0.0));" +
    "  vec3 p = normalize(eye + d * th);" +
    "  vec2 uvw = lonlat(p); float u = uvw.x, v = uvw.y;" +
    // the seam at longitude 180: take the derivatives of the u that does not jump there
    "  float u2 = fract(u + 0.5) - 0.5; vec2 du = vec2(dFdx(u), dFdy(u)); vec2 du2 = vec2(dFdx(u2), dFdy(u2));" +
    "  if (dot(du2, du2) < dot(du, du)) du = du2;" +
    "  vec2 dv = vec2(dFdx(v), dFdy(v));" +
    // over real ground a pixel's size on it, in radians (its derivatives jump at the mountains' edges)
    // close by, a pixel seen at a slant (towards the horizon) covers more ground along the ray: its size grows by
    // 1 / cos of the angle, so the pictures and slopes are read at that size and do not turn into noise there
    // (the picture by the whole stretch, up to 8 times; its slopes by its square root, up to 2.5: a wider reach turns the
    // picture's broad light and dark into false slopes)
    "  float fp = max(th * pix, 1e-7), fpa = fp; float ci = max(dot(-d, p), 0.0);" +
    "  float fpt = fp; if (terr) { fpt = fp / max(ci, 0.03); fpa = fp / max(ci, 0.125); fp = mix(fpa, fp / max(sqrt(ci), 0.4), smoothstep(0.08, 0.35, ci)); }" +
    "  if (terr) { float k = fpa / 6.2831853 / max(0.05, sqrt(1.0 - p.z * p.z)); du = vec2(k, 0.0); dv = vec2(0.0, fpa / 3.1415927); }" +
    // a detail picture: only inside its window, the window stretched over the picture
    "  if (useWin > 0.5) {" +
    "    float uw = u; if (uw < win.x) uw += 1.0; else if (uw > win.z) uw -= 1.0;" +
    "    if (uw < win.x || uw > win.z || v < win.y || v > win.w) discard;" +
    "    vec2 k = 1.0 / (win.zw - win.xy); u = (uw - win.x) * k.x; v = (v - win.y) * k.y; du *= k.x; dv *= k.y;" +
    "  }" +
    "  vec3 c = textureGrad(tex, vec2(u, v), vec2(du.x, dv.x), vec2(du.y, dv.y)).rgb;" +
    // the bands drift: the picture read twice, half a cycle apart, each moved by its band's wind (an angle: the
    // wind over the latitude's circle), and cross-faded so neither is seen while it jumps back
    "  if ((flowA > 0.0 || vinfo.z > 0.0 || vinfo.x > 0.5) && useWin < 0.5) {" +
    "    vec2 st = morph(vec2(u, v), p), gx = vec2(du.x, dv.x), gy = vec2(du.y, dv.y);" +
    "    float lat = (0.5 - st.y) * 3.1415927, s = flowA * jet(lat) / max(cos(lat), 0.25);" +
    "    float p1 = flowPh, p2 = fract(flowPh + 0.5), w1 = 1.0 - abs(2.0 * p1 - 1.0);" +
    // inside a storm: each of its two readings (half its cycle apart) read with the bands' two
    "    float tw, tw2; float q1 = vinfo.y, q2 = fract(q1 + 0.5), wq = 1.0 - abs(2.0 * q1 - 1.0);" +
    "    vec2 sa = storms(st, q1 - 0.5, tw), sb = storms(st, q2 - 0.5, tw2);" +
    "    c = textureGrad(tex, vec2(sa.x - s * (p1 - 0.5), sa.y), gx, gy).rgb * w1 + textureGrad(tex, vec2(sa.x - s * (p2 - 0.5), sa.y), gx, gy).rgb * (1.0 - w1);" +
    "    if (tw > 0.0) { vec3 cb = textureGrad(tex, vec2(sb.x - s * (p1 - 0.5), sb.y), gx, gy).rgb * w1 + textureGrad(tex, vec2(sb.x - s * (p2 - 0.5), sb.y), gx, gy).rgb * (1.0 - w1);" +
    "      c = c * wq + cb * (1.0 - wq); } }" +
    "  vec3 n = p;" +
    "  vec3 east = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-6, 0.0, 0.0)); vec3 north = cross(p, east);" +
    // far off (not close by) the heights add no slopes: the picture alone, as it is (the slopes fade in close by)
    // wr: the slopes fade in from 0.06 to 0.03 radii up (with them the picture's own baked light is taken out)
    "  if (useH > 0.5 && terr) { float wr = 1.0 - smoothstep(0.03, 0.06, length(eye) - 1.0);" +
    // real heights: their slope east and north tilts the normal (the sharp picture at the pixel's size, the bumps close by)
    "    float ta = 6.2831853 / float(textureSize(htex, 0).x); if (useD > 0.5 && useWin > 0.5) ta = 6.2831853 * (win.z - win.x) / float(textureSize(dtex, 0).x);" +
    "    float eps = max(fp, ta * 0.5);" +
    "    float lod = max(0.0, log2(max(eps, fpt * 0.7) / ta)); float nb = 0.0;" +
    // close by also the finer bumps, down to about three pixels across
    "    if (terr && lite < 0.5) nb = octsF(max(fp * 3.0, fpt * 1.5));" +
    "    float gx = (shadeH(normalize(p + east * eps), lod) - shadeH(normalize(p - east * eps), lod)) / (2.0 * eps);" +
    "    float gy = (shadeH(normalize(p + north * eps), lod) - shadeH(normalize(p - north * eps), lod)) / (2.0 * eps);" +
    "    vec3 tl = hrel * (gx * east + gy * north);" +
    // the bumps at the pixel's own size, at their true slope
    "    if (nb > 0.0) { float eb = max(fp, 1e-7); float b0 = bumpsF(p, nb);" +
    "      tl += (bumpsF(normalize(p + east * eb), nb) - b0) / eb * east + (bumpsF(normalize(p + north * eb), nb) - b0) / eb * north; }" +
    // close by, a sharper picture's own small slopes: its brightness against its blur is the slope towards its own sun
    // (draw.rs `sphere` 31, 39); its baked light is taken out of the colour, the game's sun lights the slopes
    // finer than the detail pictures' pixels (2 pi / 16384 radians): made-up rocks and crags, seeded by the place
    // itself (value noise of the point, three sizes, the finest ridged), the same wherever the eye comes from and
    // without seams; each size fades in once it is a few screen pixels long (and out towards the horizon)
    "    if (terr && wr > 0.0) { vec3 g = vec3(0.0); float lw = 7.67e-4; mat3 rk = mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6);" +
    "      for (int k = 0; k < 3; k++) { float w = smoothstep(1.0, 2.0, log2(lw / max(fpt, 1e-9)));" +
    "        if (w > 0.0) { vec4 q = vnd(rk * (p / lw) + vec3(17.3 * float(k), 5.1, 0.0)); vec3 dq = 2.0 * (q.yzw * rk);" +
    "          if (k == 2) { float m = 2.0 * q.x - 1.0; dq *= -m * inversesqrt(m * m + 0.03); }" +
    "          g += w * (0.025 + 0.015 * float(k)) * dq; }" +
    "        lw /= 3.0; rk = rk * mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6); }" +
    "      tl += g - p * dot(g, p); }" +
    "    if (terr && mapK > 0.0) { float l0 = lumAt(p, fpt, 0.0, 1.0), lb = lumAt(p, fpt, 3.0, 1.0); float sl = clamp((l0 - lb) / mapK, -1.5, 1.5);" +
    "      float ee = useWin > 0.5 ? smoothstep(0.0, 0.06, min(min(u, 1.0 - u), min(v, 1.0 - v))) : 1.0; sl *= ee;" +
    "      tl += sl * (cos(mapAz) * east + sin(mapAz) * north); c *= mix(1.0, clamp(lb / max(l0, 0.02), 0.5, 2.0), wr * ee); }" +
    // the phone's lite ground: the bumps and craters as fine as on a computer (down to about three pixels
    // across), but their slope only towards the sun: the height here and one step towards it (two reads, as in a
    // Shadertoy height shader), not a whole normal (three); without it the lite ground close by was flat
    "    if (terr && lite > 0.5 && lite < 1.5 && wr > 0.0) { float nl = octsF(max(fp * 3.0, fpt * 1.5));" +
    "      vec3 st = sun - p * dot(sun, p); float sl = length(st);" +
    "      if (sl > 1e-4) { st /= sl; float e = max(fp, 1e-8); tl += (bumpsF(normalize(p + st * e), nl) - bumpsF(p, nl)) / e * st; } }" +
    "    n = normalize(p - tl * wr);" +
    "  } else if (relief != 0.0 && useH < 0.5) {" +
    // relief: the picture's brightness as height tilts the normal for the sun
    "    vec2 ts = 1.0 / vec2(textureSize(tex, 0)); float clat = max(0.05, sqrt(1.0 - p.z * p.z));" +
    "    float hx = (lum(vec2(u + ts.x, v)) - lum(vec2(u - ts.x, v))) / (2.0 * ts.x * 6.2831853 * clat);" +
    "    float hy = (lum(vec2(u, v - ts.y)) - lum(vec2(u, v + ts.y))) / (2.0 * ts.y * 3.1415927);" +
    "    n = normalize(p - relief * (hx * east + hy * north));" +
    "  }" +
    "  float s = dot(p, sun);" +
    "  if (lit > 0.5 && useH > 0.5) {" +
    // real heights: the slope against the ground's own (flat) light, and close by the shadows of the hills
    "    float sn = dot(n, sun); float k = smoothstep(-0.04, terr ? 0.22 : 0.3, s) * clamp(sn / max(s, 0.06), 0.0, 1.6);" +
    // (the mesh's point lies on its flat triangles: the sun's ray starts from the true ground there)
    "    if (terr && k > 0.0 && sn > 0.0) k *= sunRay(mesh ? p * (ground(p, octs(th * pix * 0.5)) + fp * 0.5) : eye + d * th, fp);" +
    // close by on the day side the shadows are not black: the sunlit ground round them lights them a little
    // (about a fifth), and the slopes still show in it (the shadows of the coarse heights were blurry black patches)
    "    if (terr) k = max(k, 0.2 * smoothstep(-0.04, 0.22, s) * clamp(1.0 + 3.0 * (dot(n, p) - 1.0) + 0.6 * dot(n - p * dot(n, p), sun), 0.3, 1.3));" +
    "    c *= mix(1.0 - night, 1.0, min(k, 1.25));" +
    "  } else if (lit > 0.5) { float sn = dot(n, sun); float k = smoothstep(-0.06, 0.3, s); if (relief != 0.0) k *= smoothstep(-0.25, 0.2, sn) * (0.55 + 0.45 * smoothstep(0.0, 0.6, sn / max(s, 0.05)));" +
    "    c *= mix(1.0 - night, 1.0, k) * (0.8 + 0.2 * max(sn, 0.0)); }" +
    // close by, a band about 10 pixels on each side of the smooth ball's horizon line fades to black (the edge
    // against the black sky shows no pixel steps, cheaper than multisampling), and the ground far off dims a little
    "  if (terr) { float e = length(eye), dh = sqrt(max(e * e - 1.0, 1e-9)), ah = asin(min(1.0 / e, 1.0)), a = acos(clamp(-dot(d, eye) / e, -1.0, 1.0)), w = 10.0 * pix;" +
    "    c *= (1.0 - smoothstep(ah - w, ah, a) * (1.0 - smoothstep(ah, ah + w, a))) * (1.0 - 0.5 * smoothstep(0.5 * dh, 1.5 * dh, th)); }" +
    // the rings' shadow on the ball
    "  if (useR > 0.5 && lit > 0.5 && abs(sun.z) > 1e-4) { float ts = -p.z / sun.z; if (ts > 0.0) c *= 1.0 - 0.9 * ringA(length((p + sun * ts).xy), 0.5); }" +
    // the hot cap: molten rock glowing by its own heat (the same by day and by night). v60 (Tero: the seam
    // between the Earth and Theia should melt together, red and yellow mixed like a hot gas, yellow rising
    // from the ground like veins or a volcano): the heat is turbulent noise (domain-warped, so it swirls)
    // added to the distance from the middle, mapped through dark red, orange, yellow and white-hot, and the
    // cap's edge breaks up with it; past the edge, glowing cracks run out into the cold ground
    "  if (hotk.y > 0.0 && useWin < 0.5) { float ha = acos(clamp(dot(p, hot.xyz), -1.0, 1.0));" +
    "    float hw = 1.0 - smoothstep(hot.w - hotk.x, hot.w, ha), hx = 1.0 - smoothstep(hot.w - hotk.x, hot.w + 0.8 * hotk.x + 0.05, ha);" +
    "    if (hx > 0.0) { float hl = lum(vec2(u, v)); vec3 q = p * 5.0;" +
    "      vec2 wq = vec2(hfb(q + vec3(1.7, 9.2, 3.1)), hfb(q + vec3(8.3, 2.8, 5.4))) - 0.5;" +
    "      float n = hfb(q * 1.7 + vec3(wq * 2.4, wq.x - wq.y));" +
    "      float rv = 1.0 - abs(2.0 * vnoise(p * 15.0 + vec3(wq.yx * 3.0, wq.x * 2.0)) - 1.0), vein = rv * rv * rv * rv; vein *= vein;" +
    "      float h = clamp(hw * 0.82 + (n - 0.5) * 1.15 + 0.25 * hl * hw + vein * 0.8 * hx * (1.0 - 0.5 * hw), 0.0, 1.5);" +
    "      vec3 g = mix(vec3(0.42, 0.05, 0.02), vec3(0.86, 0.22, 0.04), smoothstep(0.0, 0.35, h));" +
    "      g = mix(g, vec3(1.0, 0.55, 0.12), smoothstep(0.28, 0.62, h)); g = mix(g, vec3(1.0, 0.84, 0.4), smoothstep(0.58, 0.95, h));" +
    "      g = mix(g, vec3(1.0, 0.96, 0.82), smoothstep(0.95, 1.35, h)) + vec3(1.0, 0.86, 0.55) * 0.7 * exp(-ha / (0.18 * hot.w + 0.03));" +
    "      g += vec3(1.0, 0.68, 0.24) * 0.5 * hw * (1.0 - hw) * 4.0 * (1.0 - step(3.0, hot.w));" +
    "      float ca = clamp(hw * (0.7 + 0.6 * n) + vein * hx * (1.0 - hw) * 1.2, 0.0, 1.0);" +
    "      c = mix(c, g * hotk.y, ca); } }" +
    // city lights on the night side (the map read at the point itself, also under a detail window)
    "  if (useL > 0.5 && lit > 0.5) {" +
    "    vec3 L = texture(ltex, lonlat(p)).rgb; c += L * vec3(1.0, 0.88, 0.65) * lgain * (1.0 - smoothstep(-0.12, 0.06, s));" +
    "  }" +
    // the air in front of the ground: thicker towards the rim
    "  if (air > 0.0 && useWin < 0.5) {" +
    "    float R = 1.0 + air; float t0 = -b - sqrt(max(R * R - q2, 0.0));" +
    "    vec4 g = airGlow(d, p, 0.0, max(th - max(t0, 0.0), 0.0), true);" +
    "    c = mix(c, g.rgb, g.a * 0.85);" +
    "  }" +
    // a sharper picture fades in as it comes closer (0.85 to 0.55 radii away), so that it does not jump in over
    // the ball's own picture when the game changes the pictures; and, close by too, round the point under the eye
    // (0.10 to 0.18 radians): the game's pieces reach at least that far, so their outer edge (and their finer
    // slopes) never show against the ball's own picture; the ball's hole is only inside 0.10 radians
    "  float fa = useWin > 0.5 ? (terr ? 1.0 : 1.0 - smoothstep(0.55, 0.85, th)) * (1.0 - smoothstep(0.10, 0.18, acos(clamp(dot(p, normalize(eye)), -1.0, 1.0)))) : 1.0;" +
    "  if (soft) fa *= cover;" +
    "  if (fa <= 0.0) discard;" +
    "  DEPTH(th); o = vec4(min(c, vec3(1.0)) * fa, fa);" +
    // the part of an edge pixel the ball leaves: the air behind it
    "  if (soft && cover < 1.0 && air > 0.0) { float R = 1.0 + air; vec4 g = airGlow(d, q, max(sqrt(q2) - 1.0, 0.0) / air, 2.0 * sqrt(max(R * R - q2, 0.0)), false);" +
    "    o += vec4(min(g.rgb, vec3(1.0)) * g.a, g.a) * (1.0 - cover); }" +
    // the rings in front of the ball (behind it they are hidden); at the edge the part the ball leaves sees them too
    "  if (tr > 0.0 && (tr < th || cover < 1.0)) { float k = tr < th ? 1.0 : 1.0 - cover; o = rg * k + o * (1.0 - rg.a * k); }" +
    "}";

  function Spheres() {
    this.ok = false;
    this.textures = new Map();
    var c = typeof document !== "undefined" ? document.createElement("canvas") : null;
    var gl = null;
    try { gl = c && c.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return;
    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, SPHERE_VS], [gl.FRAGMENT_SHADER, SPHERE_FS.replace("#version 300 es\n", "#version 300 es\n#define RG_DEPTH\n")]].forEach(function (x) {
      var sh = gl.createShader(x[0]);
      gl.shaderSource(sh, x[1]);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("sphere shader: " + gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.canvas = c;
    this.gl = gl;
    this.prog = prog;
    this.u = {};
    var self = this;
    ["tex", "ltex", "eye", "rgt", "upv", "fwd", "sun", "airc", "box", "view", "focal", "night", "lit", "win", "useWin", "air", "lgain", "useL", "relief", "htex", "gtex", "useH", "hlo", "hhi", "hamp", "nearM", "hrel", "hfreq", "crat", "mapAz", "mapK", "useHole", "hole", "dtex", "useD", "rctex", "ratex", "useR", "rIn", "rOut", "flowA", "flowPh", "vinfo", "vtx", "vamp", "hot", "hotk"].forEach(function (n) { self.u[n] = gl.getUniformLocation(prog, n); });
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.ok = true;
  }

  Spheres.prototype.texture = function (src, img, clamp, flat) {
    var t = this.textures.get(src);
    if (t) return t;
    var gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    // flat: no smaller levels (the ground's shape is read bilinearly, as the game reads it)
    if (!flat) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, flat ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.set(src, t);
    return t;
  };

  // draws one sphere command into ctx (which has the game's transform);
  // p: the 20 extra numbers (24 with a detail window); px: device pixels per game unit
  // hs: the height pictures [shading, shape] and their names, when loaded; [4], [5]: a detail window's own
  // heights and their name, when it has them
  // the windows that have their own heights are drawn together into one picture (begin, draw…, end), each
  // into its part of it, with the rays' lengths as depth: where one window's ground hides another's, the
  // nearer shows (drawn one by one, the later one covered the other, or the seams had holes)
  Spheres.prototype.begin = function (x, y, w, h, px) {
    var gl = this.gl, c = this.canvas, k = px * 0.6;
    var cw = Math.max(1, Math.min(4096, Math.round(w * k))), ch = Math.max(1, Math.min(4096, Math.round(h * k)));
    if (c.width < cw || c.height < ch || c.width > cw * 2 + 256 || c.height > ch * 2 + 256) { c.width = cw; c.height = ch; }
    gl.viewport(0, c.height - ch, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    this.group = { x: x, y: y, w: w, h: h, k: cw / w, cw: cw, ch: ch };
  };
  Spheres.prototype.end = function (ctx) {
    var g = this.group;
    this.group = null;
    this.gl.disable(this.gl.DEPTH_TEST);
    ctx.drawImage(this.canvas, 0, 0, g.cw, g.ch, g.x, g.y, g.w, g.h);
  };

  // rs: the rings' pictures [colour, opacity, their names] (44 numbers), when loaded
  Spheres.prototype.draw = function (ctx, img, src, x, y, w, h, p, px, limg, lsrc, hs, rs) {
    var gl = this.gl, c = this.canvas, gr = this.group;
    // close over real ground every pixel casts a long ray: fewer of them, drawn bigger
    var ks = p.length >= 40 && hs && p[35] > 0.5 ? 0.6 : 1;
    var cw = Math.max(1, Math.min(4096, Math.round(w * px * ks))), ch = Math.max(1, Math.min(4096, Math.round(h * px * ks)));
    if (gr) {
      // its part of the group's picture, in whole pixels; the box the pixels cover, so the rays meet
      var vx = Math.round((x - gr.x) * gr.k), vy = Math.round((y - gr.y) * gr.k);
      cw = Math.max(1, Math.round((x + w - gr.x) * gr.k) - vx); ch = Math.max(1, Math.round((y + h - gr.y) * gr.k) - vy);
      gl.viewport(vx, c.height - vy - ch, cw, ch);
      x = gr.x + vx / gr.k; y = gr.y + vy / gr.k; w = cw / gr.k; h = ch / gr.k;
    } else {
      if (c.width < cw || c.height < ch || c.width > cw * 2 + 256 || c.height > ch * 2 + 256) { c.width = cw; c.height = ch; }
      gl.viewport(0, c.height - ch, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    var w32 = p.length >= 32;
    var w4 = w32 ? p[24] > 0.5 : p.length >= 24;
    gl.bindTexture(gl.TEXTURE_2D, this.texture(src, img, w4));
    var u = this.u;
    gl.uniform1i(u.tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    if (limg) gl.bindTexture(gl.TEXTURE_2D, this.texture(lsrc, limg, false));
    gl.uniform1i(u.ltex, 1);
    gl.uniform1f(u.useL, limg ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.air, w32 ? p[25] : 0);
    gl.uniform3f(u.airc, w32 ? p[26] : 0, w32 ? p[27] : 0, w32 ? p[28] : 0);
    gl.uniform1f(u.lgain, w32 ? p[29] : 0);
    gl.uniform1f(u.relief, w32 ? p[30] : 0);
    var w40 = p.length >= 40 && hs;
    gl.activeTexture(gl.TEXTURE2);
    if (w40) gl.bindTexture(gl.TEXTURE_2D, this.texture(hs[2], hs[0], false));
    gl.uniform1i(u.htex, 2);
    gl.activeTexture(gl.TEXTURE3);
    if (w40) gl.bindTexture(gl.TEXTURE_2D, this.texture(hs[3], hs[1], false, true));
    gl.uniform1i(u.gtex, 3);
    var wd = w40 && w4 && hs.length > 4;
    gl.activeTexture(gl.TEXTURE4);
    if (wd) gl.bindTexture(gl.TEXTURE_2D, this.texture(hs[5], hs[4], true));
    gl.uniform1i(u.dtex, 4);
    gl.uniform1f(u.useD, wd ? 1 : 0);
    var wr = p.length >= 44 && p[42] > 0.5 && rs;
    gl.activeTexture(gl.TEXTURE5);
    if (wr) gl.bindTexture(gl.TEXTURE_2D, this.texture(rs[2], rs[0], true, false));
    gl.uniform1i(u.rctex, 5);
    gl.activeTexture(gl.TEXTURE6);
    if (wr) gl.bindTexture(gl.TEXTURE_2D, this.texture(rs[3], rs[1], true, false));
    gl.uniform1i(u.ratex, 6);
    gl.uniform1f(u.useR, wr ? 1 : 0);
    gl.uniform1f(u.rIn, wr ? p[40] : 0);
    gl.uniform1f(u.rOut, wr ? p[41] : 1);
    var wf = p.length >= 48 && !w4;
    gl.uniform1f(u.flowA, wf ? p[44] : 0);
    gl.uniform1f(u.flowPh, wf ? p[45] : 0);
    // the clouds morphing and their storms (72 numbers)
    var wv = p.length >= 72 && !w4;
    gl.uniform4f(u.vinfo, wv ? p[48] : 0, wv ? p[49] : 0, wv ? p[50] : 0, wv ? p[51] : 0);
    if (wv) {
      var vt = new Float32Array(16), va = new Float32Array(4);
      for (var vi = 0; vi < 4; vi++) { for (var vj = 0; vj < 4; vj++) vt[vi * 4 + vj] = p[52 + vi * 5 + vj]; va[vi] = p[56 + vi * 5]; }
      gl.uniform4fv(u.vtx, vt);
      gl.uniform1fv(u.vamp, va);
    }
    // the hot cap (80 numbers)
    var wh = p.length >= 80 && !w4;
    gl.uniform4f(u.hot, wh ? p[72] : 0, wh ? p[73] : 0, wh ? p[74] : 1, wh ? p[75] : 0);
    gl.uniform2f(u.hotk, wh ? p[76] : 0, wh ? p[77] : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.useH, w40 ? 1 : 0);
    gl.uniform1f(u.hlo, w40 ? p[32] : 0);
    gl.uniform1f(u.hhi, w40 ? p[33] : 0);
    gl.uniform1f(u.hamp, w40 ? p[34] : 0);
    gl.uniform1f(u.nearM, w40 ? p[35] : 0);
    gl.uniform1f(u.hrel, w40 ? p[36] : 0);
    gl.uniform1f(u.hfreq, w40 ? p[37] : 1);
    gl.uniform1f(u.crat, w40 ? p[38] : 0);
    gl.uniform1f(u.mapAz, w40 && w4 ? p[31] : 0);
    gl.uniform1f(u.mapK, w40 && w4 ? p[39] : 0);
    var ho = w40 && !w4 && p[35] > 0.5 && (p[20] !== 0 || p[21] !== 0 || p[22] !== 1 || p[23] !== 1);
    gl.uniform1f(u.useHole, ho ? 1 : 0);
    gl.uniform4f(u.hole, ho ? p[20] : 0, ho ? p[21] : 0, ho ? p[22] : 0, ho ? p[23] : 0);
    gl.uniform3f(u.eye, p[0], p[1], p[2]);
    gl.uniform3f(u.rgt, p[3], p[4], p[5]);
    gl.uniform3f(u.upv, p[6], p[7], p[8]);
    gl.uniform3f(u.fwd, p[9], p[10], p[11]);
    gl.uniform3f(u.sun, p[12], p[13], p[14]);
    gl.uniform1f(u.focal, p[15]);
    gl.uniform2f(u.view, p[16], p[17]);
    gl.uniform1f(u.night, p[18]);
    gl.uniform1f(u.lit, p[19]);
    gl.uniform1f(u.useWin, w4 ? 1 : 0);
    gl.uniform4f(u.win, w4 ? p[20] : 0, w4 ? p[21] : 0, w4 ? p[22] : 1, w4 ? p[23] : 1);
    gl.uniform4f(u.box, x, y, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!gr) ctx.drawImage(c, 0, 0, cw, ch, x, y, w, h);
  };

  var spheres = null;
  // whether this browser can draw textured globes (the host tells the engine)
  function canDrawSpheres() {
    if (!spheres) spheres = new Spheres();
    return spheres.ok;
  }

  // Liquid splats (draw.rs `splats`, kind 10): a baked particle run. Each splat adds a soft round
  // weight into a density picture (red: weight, green: weight × temperature), half the canvas's
  // pixels; then where the density is thick enough it shows as a liquid surface: the mean
  // temperature picks the colour, the density's slope makes a normal that the light shades and
  // glints off, and the thin edge fades out. Drawn into a picture of its own, then into the canvas.
  var SPLAT_VS = "#version 300 es\nlayout(location=0) in vec2 q; layout(location=1) in vec4 s; uniform vec4 xf; out vec2 lq; out float tt;" +
    "void main() { lq = q; tt = s.w; vec2 p = s.xy + q * s.z * 1.6; gl_Position = vec4(p * xf.xy + xf.zw, 0.0, 1.0); }";
  var SPLAT_FS = "#version 300 es\nprecision highp float; in vec2 lq; in float tt; uniform float gain; out vec4 o;" +
    "void main() { float d = dot(lq, lq); if (d > 1.0) discard; float w = exp(-4.0 * d) * gain; o = vec4(w, w * tt, 0.0, 0.0); }";
  var SHOW_VS = "#version 300 es\nlayout(location=0) in vec2 q; out vec2 uv; void main() { uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }";
  var SHOW_FS = "#version 300 es\nprecision highp float; in vec2 uv; uniform sampler2D den, pal; uniform vec2 texel; uniform vec3 light; uniform float npal, gain, opac; out vec4 o;" +
    "float D(vec2 t) { return texture(den, t).r / gain; }" +
    "void main() { vec4 a = texture(den, uv); float d = a.r / gain; if (d < 0.02) discard;" +
    "  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);" +
    "  vec3 c = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;" +
    // the surface: where the density passes 0.35; its slope a normal (screen y down in the picture: flipped)
    "  float gx = D(uv + vec2(texel.x, 0.0)) - D(uv - vec2(texel.x, 0.0)), gy = D(uv + vec2(0.0, texel.y)) - D(uv - vec2(0.0, texel.y));" +
    "  vec3 n = normalize(vec3(-gx * 3.0, -gy * 3.0, 1.0)); vec3 l = normalize(light * vec3(1.0, -1.0, 1.0));" +
    "  float dif = 0.45 + 0.55 * max(dot(n, l), 0.0), spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.5;" +
    // hot magma glows of itself (less shading), cold rock is lit
    "  float glow = smoothstep(0.35, 0.9, tm); vec3 col = c * mix(dif, 1.0, glow * 0.7) + spec * mix(vec3(1.0), c, 0.4);" +
    "  float body = smoothstep(0.3, 0.55, d), halo = smoothstep(0.02, 0.3, d) * 0.35 * (0.3 + glow);" +
    "  float al = max(body, halo) * opac; o = vec4(mix(c * (0.6 + glow), col, body) * al, al); }";

  // see-through gas (look "gas"): alpha 1 - exp(-k × weight), no surface; lit by how the sun
  // lies to the eye (light.z: towards the eye), shadowed by the gas between it and the sun
  // (sampled towards the light on the screen), thin gas against the sun scatters it forward,
  // the hot part glows of itself. YS: the picture's v against the screen's up (painter: 1).
  var gasFs = function (ys) {
    return "#version 300 es\nprecision highp float; in vec2 uv; uniform sampler2D den, pal; uniform vec2 texel; uniform vec3 light; uniform float npal, gain, opac, kd; out vec4 o;" +
      "float D(vec2 t) { return texture(den, t).r / gain; }" +
      "void main() { vec4 a = texture(den, uv); float d = a.r / gain; if (d < 0.004) discard;" +
      "  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);" +
      "  vec3 c = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;" +
      "  vec3 l = normalize(light * vec3(1.0, -1.0, 1.0)); vec2 s = vec2(l.x, l.y * " + ys + ") * texel;" +
      // soft: the density blurred a little (4 taps round it)
      "  float db = 0.5 * d + 0.125 * (D(uv + vec2(texel.x, 0.0)) + D(uv - vec2(texel.x, 0.0)) + D(uv + vec2(0.0, texel.y)) + D(uv - vec2(0.0, texel.y)));" +
      "  float al = 1.0 - exp(-kd * db);" +
      "  float occ = D(uv + s * 4.0) + D(uv + s * 12.0) + D(uv + s * 28.0);" +
      "  float lit = exp(-kd * 0.12 * occ);" +
      "  float front = 0.5 + 0.5 * l.z, back = max(-l.z, 0.0);" +
      "  float dif = 0.25 + 0.75 * lit * mix(0.4, 1.0, front);" +
      "  float fwd = back * back * (1.0 - al) * lit * 1.6;" +
      "  float glow = smoothstep(0.35, 0.9, tm);" +
      "  vec3 col = mix(c * (dif + fwd), c * 1.25, glow);" +
      "  float oa = al * opac; o = vec4(col * oa, oa); }";
  };
  var GAS_FS = gasFs("1.0");

  function Splats() {
    this.ok = false;
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) return;
      this.canvas = c; this.gl = gl;
      this.f16 = !!gl.getExtension("EXT_color_buffer_float");
      var mk = function (vs, fs) {
        var p = gl.createProgram();
        [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (x) {
          var sh = gl.createShader(x[0]); gl.shaderSource(sh, x[1]); gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("splat shader: " + gl.getShaderInfoLog(sh));
          gl.attachShader(p, sh);
        });
        gl.linkProgram(p);
        return p;
      };
      this.add = mk(SPLAT_VS, SPLAT_FS);
      this.show = mk(SHOW_VS, SHOW_FS);
      this.gas = mk(SHOW_VS, GAS_FS);
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.inst = gl.createBuffer();
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
      this.den = gl.createTexture(); this.fbo = gl.createFramebuffer(); this.dw = 0; this.dh = 0;
      this.pal = gl.createTexture();
      this.ok = true;
    } catch (e) { this.ok = false; }
  }

  // ex: the extras (palette, light, splats); w, h: the box in game units; px: device pixels a unit;
  // res: the density's pixels a pixel; gas: more than 0 for see-through gas (its density a splat)
  Splats.prototype.draw = function (ctx, ex, w, h, px, opac, res, gas) {
    var gl = this.gl, c = this.canvas;
    var np = ex[0] | 0, at = 1 + np * 3;
    var light = [ex[at], ex[at + 1], ex[at + 2]], m = ex[at + 3] | 0, pts = ex.subarray(at + 4, at + 4 + m * 4);
    var k = px * (res > 0 ? res : 0.5);
    var cw = Math.max(1, Math.min(2048, Math.round(w * k))), ch = Math.max(1, Math.min(2048, Math.round(h * k)));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    if (this.dw !== cw || this.dh !== ch) {
      gl.bindTexture(gl.TEXTURE_2D, this.den);
      if (this.f16) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, cw, ch, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.den, 0);
      this.dw = cw; this.dh = ch;
    }
    // without float pictures the weights are kept small (8 bits fill up at 1)
    var gain = this.f16 ? 1.0 : 0.25;
    // the palette as a strip
    var pb = new Uint8Array(np * 4);
    for (var i = 0; i < np; i++) { pb[i * 4] = ex[1 + i * 3] * 255; pb[i * 4 + 1] = ex[2 + i * 3] * 255; pb[i * 4 + 2] = ex[3 + i * 3] * 255; pb[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, np, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pb);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // 1: the weights added up
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.add);
    // game units to clip space (y down)
    gl.uniform4f(gl.getUniformLocation(this.add, "xf"), 2 / w, -2 / h, -1, 1);
    gl.uniform1f(gl.getUniformLocation(this.add, "gain"), gain);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STREAM_DRAW);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
    // 2: the surface into the picture
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    var sp = gas > 0 ? this.gas : this.show;
    gl.useProgram(sp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.den);
    gl.uniform1i(gl.getUniformLocation(sp, "den"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(gl.getUniformLocation(sp, "pal"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(gl.getUniformLocation(sp, "texel"), 1 / cw, 1 / ch);
    gl.uniform3f(gl.getUniformLocation(sp, "light"), light[0], light[1], light[2]);
    gl.uniform1f(gl.getUniformLocation(sp, "npal"), np);
    gl.uniform1f(gl.getUniformLocation(sp, "gain"), gain);
    gl.uniform1f(gl.getUniformLocation(sp, "opac"), opac);
    if (gas > 0) gl.uniform1f(gl.getUniformLocation(sp, "kd"), gas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    ctx.drawImage(c, 0, 0, cw, ch, 0, 0, w, h);
  };
  var splats = null;
  function canDrawSplats() {
    if (!splats) splats = new Splats();
    return splats.ok;
  }

  function Painter(canvas, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.images = images;
    this.widthCache = {};
    this.widthCacheSize = 0;
  }

  Painter.prototype.textWidth = function (font, text) {
    var key = font + "\u0001" + text;
    var w = this.widthCache[key];
    if (w === undefined) {
      if (this.widthCacheSize > 4000) { this.widthCache = {}; this.widthCacheSize = 0; }
      w = this.ctx.measureText(text).width;
      this.widthCache[key] = w;
      this.widthCacheSize++;
    }
    return w;
  };

  // nums: Float32Array of the stream; strings: the table
  Painter.prototype.paint = function (nums, strings, view, dpr, clear) {
    var ctx = this.ctx;
    var scale = view.scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clear === null) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    else { ctx.fillStyle = clear; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    ctx.setTransform(scale, 0, 0, scale, view.x * dpr, view.y * dpr);
    // the game's area clips everything (a letterboxed game stays in its box)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    ctx.clip();
    var clips = 0;
    if (spheres && spheres.group) { spheres.group = null; spheres.gl.disable(spheres.gl.DEPTH_TEST); }
    var i = 0, n = nums.length;
    while (i < n) {
      var k = nums[i], x = nums[i + 1], y = nums[i + 2], w = nums[i + 3], h = nums[i + 4];
      var r = nums[i + 5], g = nums[i + 6], b = nums[i + 7], a = nums[i + 8];
      var tl = nums[i + 9], tr = nums[i + 10], br = nums[i + 11], bl = nums[i + 12];
      var t = nums[i + 13], rot = nums[i + 14], rox = nums[i + 15], roy = nums[i + 16];
      var flags = nums[i + 17] | 0;
      var s0 = nums[i + 18], s1 = nums[i + 19], s2 = nums[i + 20], ls = nums[i + 21];
      var nx = nums[i + 22] | 0;
      var e = i + HEADER;
      i = e + nx;
      // the extras
      var grad = null, shadow = null, crop = null, tile = null, ptsAt = -1;
      if (flags & 1) { grad = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3]]; e += 4; }
      if (flags & 4) { shadow = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3], nums[e + 4], nums[e + 5], nums[e + 6]]; e += 7; }
      if (flags & 64) { crop = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3]]; e += 4; }
      if (flags & 1024) { tile = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3]]; e += 4; }
      if (k === KIND.PATH || k === KIND.STROKE) ptsAt = e;

      if (k === KIND.SPHERE) {
        var simg = s0 >= 0 ? this.images.get(strings[s0]) : null;
        if (simg && nx >= 20 && w > 0 && h > 0 && canDrawSpheres()) {
          var limg = s1 >= 0 ? this.images.get(strings[s1]) : null;
          // the height pictures "shading|shape" (string 3), once both are loaded
          var hs = null;
          if (s2 >= 0 && nx >= 40) {
            var hn = strings[s2].split("|"), hi = this.images.get(hn[0]), gi = this.images.get(hn[1]);
            if (hi && gi) hs = [hi, gi, hn[0], hn[1]];
            // "shading|shape|window heights": the window's own heights, once loaded (until then the ball's)
            var di = hs && hn.length > 2 ? this.images.get(hn[2]) : null;
            if (di) hs.push(di, hn[2]);
          }
          var sp = nums.subarray(e, e + (nx >= 80 ? 80 : nx >= 72 ? 72 : nx >= 48 ? 48 : nx >= 44 ? 44 : nx >= 40 ? 40 : nx >= 32 ? 32 : nx >= 24 ? 24 : 20));
          // the rings' pictures "colour|opacity" (string 4, slot 21), once both are loaded
          var rs = null;
          if (nx >= 44 && nums[e + 42] > 0.5 && ls >= 0) {
            var rn = strings[ls].split("|"), rci = this.images.get(rn[0]), rai = this.images.get(rn[1] || rn[0]);
            if (rci && rai) rs = [rci, rai, rn[0], rn[1] || rn[0]];
          }
          // a window close by with its own heights: it and the ones right after it are drawn together
          if (!spheres.group && hs && hs.length > 4 && sp[24] > 0.5 && sp[35] > 0.5) {
            var gx0 = x, gy0 = y, gx1 = x + w, gy1 = y + h, gn = 1;
            for (var gi2 = i; gi2 < n; gn++) {
              var gnx = nums[gi2 + 22] | 0, gs2 = nums[gi2 + 20];
              if (nums[gi2] !== KIND.SPHERE || gnx < 40 || nums[gi2 + 17] !== 0 || gs2 < 0 || strings[gs2].split("|").length < 3) break;
              var gp = gi2 + HEADER;
              if (nums[gp + 24] <= 0.5 || nums[gp + 35] <= 0.5) break;
              gx0 = Math.min(gx0, nums[gi2 + 1]); gy0 = Math.min(gy0, nums[gi2 + 2]);
              gx1 = Math.max(gx1, nums[gi2 + 1] + nums[gi2 + 3]); gy1 = Math.max(gy1, nums[gi2 + 2] + nums[gi2 + 4]);
              gi2 = gp + gnx;
            }
            spheres.begin(gx0, gy0, gx1 - gx0, gy1 - gy0, scale);
            spheres.groupLeft = gn;
          }
          spheres.draw(ctx, simg, strings[s0], x, y, w, h, sp, scale, limg, s1 >= 0 ? strings[s1] : "", hs, rs);
        }
        // the group's last window drawn (or skipped): the picture into the canvas
        if (spheres && spheres.group && --spheres.groupLeft <= 0) spheres.end(ctx);
        continue;
      }
      if (k === 10) {
        if (nx > 4 && w > 0 && h > 0 && canDrawSplats()) splats.draw(ctx, nums.subarray(e, e + nx), w, h, scale, a, tl, tr);
        continue;
      }
      if (k === KIND.PUSH_CLIP) {
        ctx.save(); clips++;
        ctx.beginPath(); ctx.rect(x, y, Math.max(0, w), Math.max(0, h)); ctx.clip();
        continue;
      }
      if (k === KIND.POP_CLIP) {
        if (clips > 0) { ctx.restore(); clips--; }
        continue;
      }
      if (a <= 0 && !(flags & 1) && k !== KIND.IMAGE) continue;
      var rotated = rot !== 0;
      if (rotated) {
        var cx = (flags & 128) ? rox : x + w / 2;
        var cy = (flags & 128) ? roy : y + h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }
      if (k === KIND.RECT) {
        if (w > 0 && h > 0) {
          var fill = rgba(r, g, b, a);
          if (grad) {
            var lg = (flags & 2) ? ctx.createLinearGradient(x, y, x + w, y) : ctx.createLinearGradient(x, y, x, y + h);
            lg.addColorStop(0, fill);
            lg.addColorStop(1, rgba(grad[0], grad[1], grad[2], grad[3]));
            fill = lg;
          }
          if (shadow) {
            ctx.save();
            ctx.shadowColor = rgba(shadow[3], shadow[4], shadow[5], shadow[6]);
            ctx.shadowBlur = shadow[2] * scale;
            ctx.shadowOffsetX = shadow[0] * scale;
            ctx.shadowOffsetY = shadow[1] * scale;
          }
          ctx.fillStyle = fill;
          if (tl || tr || br || bl) { roundRect(ctx, x, y, w, h, tl, tr, br, bl); ctx.fill(); }
          else ctx.fillRect(x, y, w, h);
          if (shadow) ctx.restore();
        }
      } else if (k === KIND.BORDER) {
        var bt = t || 1;
        if (w > bt && h > bt) {
          ctx.strokeStyle = rgba(r, g, b, a);
          ctx.lineWidth = bt;
          roundRect(ctx, x + bt / 2, y + bt / 2, w - bt, h - bt,
            Math.max(0, tl - bt / 2), Math.max(0, tr - bt / 2), Math.max(0, br - bt / 2), Math.max(0, bl - bt / 2));
          ctx.stroke();
        }
      } else if (k === KIND.IMAGE) {
        var src = s0 >= 0 ? strings[s0] : "";
        var img = src ? this.images.get(src) : null;
        if (img && w > 0 && h > 0) {
          ctx.save();
          if (tl || tr || br || bl) { roundRect(ctx, x, y, w, h, tl, tr, br, bl); ctx.clip(); }
          if (flags & (8 | 16)) {
            ctx.translate(x + w / 2, y + h / 2);
            ctx.scale((flags & 8) ? -1 : 1, (flags & 16) ? -1 : 1);
            ctx.translate(-(x + w / 2), -(y + h / 2));
          }
          var iw = img.width, ih = img.height;
          if (tile) {
            for (var ty = tile[1]; ty < y + h; ty += tile[3]) for (var tx = tile[0]; tx < x + w; tx += tile[2]) ctx.drawImage(img, tx, ty, tile[2], tile[3]);
          } else if (crop) {
            ctx.drawImage(img, crop[0] * iw, crop[1] * ih, (crop[2] - crop[0]) * iw, (crop[3] - crop[1]) * ih, x, y, w, h);
          } else {
            // object-fit: cover, as EVG's other painters do
            var sc = Math.max(w / iw, h / ih), sw = w / sc, sh = h / sc;
            ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
          }
          ctx.restore();
        }
      } else if (k === KIND.TEXT) {
        var text = s0 >= 0 ? strings[s0] : "";
        if (text) {
          var weight = s2 >= 0 ? strings[s2] : "";
          var font = ((flags & 256) ? "italic " : "") + (weight ? weight + " " : "") + t + "px " + family(s1 >= 0 ? strings[s1] : "");
          ctx.font = font;
          ctx.fillStyle = rgba(r, g, b, a);
          ctx.textBaseline = "middle";
          // EVG measured the run with Noto Sans and placed it by that width;
          // the page's font is a little wider or narrower. Fit the run to its
          // width so left-aligned lines start where EVG put them (a centred
          // run left ragged edges); a big difference keeps the run's centre
          var tw = this.textWidth(font, text);
          var sx = w > 0 && tw > 0 ? w / tw : 1;
          var ty = y + h / 2 + t * 0.04;
          if (sx >= 0.8 && sx <= 1.25 && sx !== 1) {
            ctx.save();
            ctx.translate(x, ty);
            ctx.scale(sx, 1);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(text, x + (w > 0 ? (w - tw) / 2 : 0), ty);
          }
        }
      } else if (ptsAt >= 0 && nx > 0) {
        var np = nums[ptsAt] | 0;
        var pts = ptsAt + 1;
        var ne = nums[pts + np] | 0;
        var ends = pts + np + 1;
        ctx.beginPath();
        var at = 0;
        for (var ri = 0; ri < ne; ri++) {
          var end = nums[ends + ri] | 0;
          if (end - at >= 4) {
            ctx.moveTo(nums[pts + at], nums[pts + at + 1]);
            for (var pi = at + 2; pi + 1 < end; pi += 2) ctx.lineTo(nums[pts + pi], nums[pts + pi + 1]);
            if (k === KIND.PATH) ctx.closePath();
          }
          at = end;
        }
        if (k === KIND.PATH) {
          ctx.fillStyle = rgba(r, g, b, a);
          if (flags & 2048) ctx.globalCompositeOperation = "lighter";
          ctx.fill((flags & 32) ? "evenodd" : "nonzero");
          if (flags & 2048) ctx.globalCompositeOperation = "source-over";
        } else {
          ctx.strokeStyle = rgba(r, g, b, a);
          ctx.lineWidth = t || 1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }
      if (rotated) ctx.restore();
    }
    while (clips > 0) { ctx.restore(); clips--; }
    ctx.restore();
  };

  global.RgPainter = Painter;
  global.RgPainter.canDrawSpheres = canDrawSpheres;
  global.RgPainter.canDrawSplats = canDrawSplats;
  // sphere commands with a detail window (24 numbers) are understood
  global.RgPainter.canDrawDetail = canDrawSpheres;
  // and real heights (40 numbers: the ground's shape, made-up bumps)
  global.RgPainter.canDrawTerrain = canDrawSpheres;
})(window);
