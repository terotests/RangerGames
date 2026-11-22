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
  var SPHERE_VS = "#version 300 es\nin vec2 a; out vec2 uv; void main() { uv = a; gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }";
  var SPHERE_FS = "#version 300 es\nprecision highp float; precision highp int; in vec2 uv; out vec4 o;" +
    "uniform sampler2D tex, ltex, htex, gtex; uniform vec3 eye, rgt, upv, fwd, sun, airc; uniform vec4 box, win; uniform vec2 view;" +
    "uniform float focal, night, lit, useWin, air, lgain, useL, relief;" +
    // real heights (draw.rs `sphere`, 40 numbers): low, high, the bumps' amplitude, near, shading tilt, the bumps' lattice
    "uniform float useH, hlo, hhi, hamp, nearM, hrel, hfreq, crat, mapAz, mapK;" +
    // the glowing air seen along the ray: a = how much, col = its light. lo: the
    // ray's lowest point (on the ground for a ray that hits); len: its path in the air
    "vec4 airGlow(vec3 d, vec3 lo, float alt, float len, bool hit) {" +
    "  float up = dot(normalize(lo), sun);" +
    "  float day = smoothstep(-0.28, 0.12, up);" +
    // looking towards the sun past the rim: forward scattering, a white burst at sunrise
    "  float fw = pow(max(dot(d, sun), 0.0), 10.0) * smoothstep(-0.45, 0.02, up);" +
    "  float dusk = smoothstep(-0.3, -0.02, up) * (1.0 - smoothstep(0.0, 0.25, up));" +
    "  float dens = exp(-alt * 4.5) * (1.0 - alt);" +
    "  float depth = dens * len / (air * 2.0);" +
    "  float a = clamp(depth * (0.55 * day + 2.6 * fw + 0.25 * dusk), 0.0, 1.0);" +
    "  vec3 col = airc * (0.7 + 0.6 * day) + vec3(1.0, 0.96, 0.9) * fw * 3.0 + vec3(1.0, 0.55, 0.3) * dusk * 0.8;" +
    "  return vec4(col, a);" +
    "}" +
    "float lum(vec2 t) { vec3 c = texture(tex, t).rgb; return dot(c, vec3(0.3, 0.5, 0.2)); }" +
    // the map's brightness at the unit direction q, read at the level for the size eps (radians); under a detail window
    // the window's picture
    "float lumAt(vec3 q, float eps, float more) { vec2 t = vec2(atan(q.y, q.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(q.z, -1.0, 1.0)) / 3.1415927);" +
    "  float span = 1.0;" +
    "  if (useWin > 0.5) { if (t.x < win.x) t.x += 1.0; else if (t.x > win.z) t.x -= 1.0; span = win.z - win.x; t = (t - win.xy) / (win.zw - win.xy); }" +
    "  float ta = 6.2831853 * span / float(textureSize(tex, 0).x);" +
    "  return dot(textureLod(tex, t, max(0.0, log2(eps / ta)) + more).rgb, vec3(0.3, 0.5, 0.2)); }" +
    "vec2 lonlat(vec3 p) { return vec2(atan(p.y, p.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(p.z, -1.0, 1.0)) / 3.1415927); }" +
    // the made-up bumps: value noise on the integer lattice, the hash of 32-bit integers (the same in every host and the game)
    "uint hsh(ivec3 c) { uint h = (uint(c.x) * 0x8da6b343u) ^ (uint(c.y) * 0xd8163841u) ^ (uint(c.z) * 0xcb1ab31fu);" +
    "  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u; return h; }" +
    "float hv(ivec3 c) { return float(hsh(c) >> 8u) / 16777215.0; }" +
    "float vnoise(vec3 x) { vec3 f = floor(x); ivec3 c = ivec3(f); vec3 t = x - f; t = t * t * (3.0 - 2.0 * t);" +
    "  float a = mix(hv(c), hv(c + ivec3(1, 0, 0)), t.x), b = mix(hv(c + ivec3(0, 1, 0)), hv(c + ivec3(1, 1, 0)), t.x);" +
    "  float e = mix(hv(c + ivec3(0, 0, 1)), hv(c + ivec3(1, 0, 1)), t.x), g = mix(hv(c + ivec3(0, 1, 1)), hv(c + ivec3(1, 1, 1)), t.x);" +
    "  return mix(mix(a, b, t.y), mix(e, g, t.y), t.z); }" +
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
    "float bumps(vec3 p, int n) { if (hamp <= 0.0) return 0.0; float s = 0.0, a = 1.0, f = hfreq;" +
    "  for (int k = 0; k < 9; k++) { if (k >= n) break; s += a * (2.0 * vnoise(p * f) - 1.0); a *= 0.48; f *= 2.03; }" +
    "  float cr = 0.0; if (crat > 0.0) { float cf = hfreq * 0.9; int nc = n >= 5 ? n - 2 : max(n - 2, 1);" +
    "    for (int k = 0; k < 7; k++) { if (k >= nc) break; cr += crater(p, cf, 2 * k) + crater(p, cf, 2 * k + 1); cf *= 2.7; } }" +
    "  return s * hamp + cr * crat; }" +
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
    "float ground(vec3 p, int n) { return 1.0 + hlo + (hhi - hlo) * shape(lonlat(p)) + bumps(p, n); }" +
    // the height read for the shading: the sharp picture (at a level for the size eps) plus the bumps
    "float shadeH(vec3 p, float lod) { return (hhi - hlo) * dec(textureLod(htex, lonlat(p), lod)); }" +
    // casts the ray against the ground's shape; t: where it meets it
    "bool march(vec3 d, float pix, out float t) {" +
    "  float Ro = 1.0 + hhi + 2.0 * hamp + 0.05 * crat / hfreq, Ri = 1.0 + hlo - 2.0 * hamp - 0.25 * crat / hfreq;" +
    "  float bq = dot(eye, d), ee = dot(eye, eye); float ds = bq * bq - ee + Ro * Ro;" +
    "  t = 0.0; if (ds < 0.0) return false;" +
    "  float t0 = max(0.0, -bq - sqrt(ds)), t1 = -bq + sqrt(ds);" +
    "  float di = bq * bq - ee + Ri * Ri; if (di > 0.0 && -bq - sqrt(di) > 0.0) t1 = min(t1, -bq - sqrt(di));" +
    "  if (t1 <= t0) return false;" +
    "  float tp = t0; t = t0; bool hit = false;" +
    "  for (int i = 0; i < 160; i++) {" +
    "    vec3 x = eye + d * t; float r = length(x); float f = r - ground(x / r, 3);" +
    "    if (f < 0.0) { hit = true; break; }" +
    "    if (f < t * pix * 0.3) { hit = true; tp = t; break; }" +
    "    tp = t; t += max(f * 0.55, t * pix * 0.4);" +
    "    if (t > t1) return false;" +
    "  }" +
    "  if (!hit) return false;" +
    // between the last point above and the first below, with all the bumps
    "  float a = tp, b = t;" +
    "  for (int i = 0; i < 7; i++) { float m = (a + b) * 0.5; vec3 x = eye + d * m; float r = length(x);" +
    "    if (r - ground(x / r, 5) < 0.0) b = m; else a = m; }" +
    "  t = b; return true;" +
    "}" +
    // how much sun reaches the ground point x (radii from the centre): a ray towards the sun against the ground's shape,
    // soft at the edges
    "float sunRay(vec3 x, float sz) {" +
    "  float k = 1.0, t = max(sz * 4.0, 2e-6);" +
    "  for (int i = 0; i < 24; i++) { vec3 y = x + sun * t; float r = length(y); if (r > 1.0 + hhi + 2.0 * hamp + 0.05 * crat / hfreq) break;" +
    "    float h = r - ground(y / r, 3); k = min(k, 10.0 * h / t); if (k < 0.0) return 0.0; t *= 1.35; }" +
    "  return clamp(k, 0.0, 1.0);" +
    "}" +
    "void main() {" +
    "  vec2 px = box.xy + uv * box.zw;" +
    "  vec3 d = normalize(fwd * focal + rgt * (px.x - view.x * 0.5) - upv * (px.y - view.y * 0.5));" +
    "  float b = dot(eye, d); vec3 q = eye - b * d; float q2 = dot(q, q); float disc = 1.0 - q2;" +
    "  bool terr = useH > 0.5 && nearM > 0.5; float pix = 1.0 / focal; float th = 0.0;" +
    // a detail window close by: test the window on the smooth ball first (with a margin for mountains), so that only
    // the pixels it may cover cast the long ray
    "  if (terr && useWin > 0.5) { vec3 pw = normalize(disc >= 0.0 ? eye + d * (-b - sqrt(disc)) : q); vec2 w0 = lonlat(pw);" +
    "    float mg = 0.004 + 0.5 * max(hhi - hlo, 0.0); float uw = w0.x; if (uw < win.x - mg) uw += 1.0; else if (uw > win.z + mg) uw -= 1.0;" +
    "    if (uw < win.x - mg || uw > win.z + mg || w0.y < win.y - mg || w0.y > win.w + mg) discard; }" +
    "  bool hit = terr ? march(d, pix, th) : (disc >= 0.0 && -b >= sqrt(max(disc, 0.0)));" +
    "  if (!hit) {" +
    "    float R = 1.0 + air;" +
    "    if (air <= 0.0 || useWin > 0.5 || q2 >= R * R || -b < 0.0) discard;" +
    "    float hq = sqrt(q2);" +
    "    vec4 g = airGlow(d, q, max(hq - 1.0, 0.0) / air, 2.0 * sqrt(R * R - q2), false);" +
    "    if (g.a < 0.003) discard;" +
    "    o = vec4(min(g.rgb, vec3(1.0)) * g.a, g.a); return;" +
    "  }" +
    "  if (!terr) th = -b - sqrt(max(disc, 0.0));" +
    "  vec3 p = normalize(eye + d * th);" +
    "  vec2 uvw = lonlat(p); float u = uvw.x, v = uvw.y;" +
    // the seam at longitude 180: take the derivatives of the u that does not jump there
    "  float u2 = fract(u + 0.5) - 0.5; vec2 du = vec2(dFdx(u), dFdy(u)); vec2 du2 = vec2(dFdx(u2), dFdy(u2));" +
    "  if (dot(du2, du2) < dot(du, du)) du = du2;" +
    "  vec2 dv = vec2(dFdx(v), dFdy(v));" +
    // over real ground a pixel's size on it, in radians (its derivatives jump at the mountains' edges)
    "  float fp = max(th * pix, 1e-7);" +
    "  if (terr) { float k = fp / 6.2831853 / max(0.05, sqrt(1.0 - p.z * p.z)); du = vec2(k, 0.0); dv = vec2(0.0, fp / 3.1415927); }" +
    // a detail picture: only inside its window, the window stretched over the picture
    "  if (useWin > 0.5) {" +
    "    float uw = u; if (uw < win.x) uw += 1.0; else if (uw > win.z) uw -= 1.0;" +
    "    if (uw < win.x || uw > win.z || v < win.y || v > win.w) discard;" +
    "    vec2 k = 1.0 / (win.zw - win.xy); u = (uw - win.x) * k.x; v = (v - win.y) * k.y; du *= k.x; dv *= k.y;" +
    "  }" +
    "  vec3 c = textureGrad(tex, vec2(u, v), vec2(du.x, dv.x), vec2(du.y, dv.y)).rgb;" +
    "  vec3 n = p;" +
    "  vec3 east = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-6, 0.0, 0.0)); vec3 north = cross(p, east);" +
    "  if (useH > 0.5) {" +
    // real heights: their slope east and north tilts the normal (the sharp picture at the pixel's size, the bumps close by)
    "    float ta = 6.2831853 / float(textureSize(htex, 0).x); float eps = max(fp, ta * 0.5);" +
    "    float lod = max(0.0, log2(eps / ta)); int nb = 0;" +
    // close by also the finer bumps, down to about three pixels across
    "    if (terr) { nb = 5; float wl = 1.0 / (hfreq * pow(2.03, 5.0)); for (int k = 0; k < 3; k++) { if (wl < fp * 3.0) break; nb++; wl /= 2.03; } }" +
    "    float gx = (shadeH(normalize(p + east * eps), lod) - shadeH(normalize(p - east * eps), lod)) / (2.0 * eps);" +
    "    float gy = (shadeH(normalize(p + north * eps), lod) - shadeH(normalize(p - north * eps), lod)) / (2.0 * eps);" +
    "    vec3 tl = hrel * (gx * east + gy * north);" +
    // the bumps at the pixel's own size, at their true slope
    "    if (nb > 0) { float eb = max(fp, 1e-7); float b0 = bumps(p, nb);" +
    "      tl += (bumps(normalize(p + east * eb), nb) - b0) / eb * east + (bumps(normalize(p + north * eb), nb) - b0) / eb * north; }" +
    // close by, a sharper picture's own small slopes: its brightness against its blur is the slope towards its own sun
    // (draw.rs `sphere` 31, 39); its baked light is taken out of the colour, the game's sun lights the slopes
    "    if (terr && mapK > 0.0) { float l0 = lumAt(p, fp, 0.0), lb = lumAt(p, fp, 3.0); float sl = clamp((l0 - lb) / mapK, -1.5, 1.5);" +
    "      tl += sl * (cos(mapAz) * east + sin(mapAz) * north); c *= clamp(lb / max(l0, 0.02), 0.5, 2.0); }" +
    "    n = normalize(p - tl);" +
    "  } else if (relief != 0.0) {" +
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
    "    if (terr && k > 0.0 && sn > 0.0) k *= sunRay(eye + d * th, fp);" +
    "    c *= mix(1.0 - night, 1.0, min(k, 1.25));" +
    "  } else if (lit > 0.5) { float sn = dot(n, sun); float k = smoothstep(-0.06, 0.3, s); if (relief != 0.0) k *= smoothstep(-0.25, 0.2, sn) * (0.55 + 0.45 * smoothstep(0.0, 0.6, sn / max(s, 0.05)));" +
    "    c *= mix(1.0 - night, 1.0, k) * (0.8 + 0.2 * max(sn, 0.0)); }" +
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
    "  o = vec4(min(c, vec3(1.0)), 1.0);" +
    "}";

  function Spheres() {
    this.ok = false;
    this.textures = new Map();
    var c = typeof document !== "undefined" ? document.createElement("canvas") : null;
    var gl = null;
    try { gl = c && c.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return;
    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, SPHERE_VS], [gl.FRAGMENT_SHADER, SPHERE_FS]].forEach(function (x) {
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
    ["tex", "ltex", "eye", "rgt", "upv", "fwd", "sun", "airc", "box", "view", "focal", "night", "lit", "win", "useWin", "air", "lgain", "useL", "relief", "htex", "gtex", "useH", "hlo", "hhi", "hamp", "nearM", "hrel", "hfreq", "crat", "mapAz", "mapK"].forEach(function (n) { self.u[n] = gl.getUniformLocation(prog, n); });
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
  // hs: the height pictures [shading, shape] and their names, when loaded
  Spheres.prototype.draw = function (ctx, img, src, x, y, w, h, p, px, limg, lsrc, hs) {
    var gl = this.gl, c = this.canvas;
    // close over real ground every pixel casts a long ray: fewer of them, drawn bigger
    var ks = p.length >= 40 && hs && p[35] > 0.5 ? 0.6 : 1;
    var cw = Math.max(1, Math.min(4096, Math.round(w * px * ks))), ch = Math.max(1, Math.min(4096, Math.round(h * px * ks)));
    if (c.width < cw || c.height < ch || c.width > cw * 2 + 256 || c.height > ch * 2 + 256) { c.width = cw; c.height = ch; }
    gl.viewport(0, c.height - ch, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    ctx.drawImage(c, 0, 0, cw, ch, x, y, w, h);
  };

  var spheres = null;
  // whether this browser can draw textured globes (the host tells the engine)
  function canDrawSpheres() {
    if (!spheres) spheres = new Spheres();
    return spheres.ok;
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
          }
          spheres.draw(ctx, simg, strings[s0], x, y, w, h, nums.subarray(e, e + (nx >= 40 ? 40 : nx >= 32 ? 32 : nx >= 24 ? 24 : 20)), scale, limg, s1 >= 0 ? strings[s1] : "", hs);
        }
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
          ctx.fill((flags & 32) ? "evenodd" : "nonzero");
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
  // sphere commands with a detail window (24 numbers) are understood
  global.RgPainter.canDrawDetail = canDrawSpheres;
  // and real heights (40 numbers: the ground's shape, made-up bumps)
  global.RgPainter.canDrawTerrain = canDrawSpheres;
})(window);
