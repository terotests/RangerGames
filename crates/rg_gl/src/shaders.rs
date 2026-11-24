// SPDX-License-Identifier: AGPL-3.0-or-later
//! The renderer's shaders, GLSL ES 3.00 (OpenGL ES 3.0 and WebGL2 alike).

/// Every 2D shape: one vertex format, the kind of fill in `vParam.x`.
pub const SHAPE_VS: &str = "#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aLocal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec2 aHalf;
layout(location = 4) in vec4 aRadii;
layout(location = 5) in vec2 aParam;
layout(location = 6) in vec4 aColor;
uniform vec4 xf;
out vec2 vLocal;
out vec2 vUv;
out vec4 vColor;
flat out vec2 vHalf;
flat out vec4 vRadii;
flat out vec2 vParam;
void main() {
  vLocal = aLocal; vUv = aUv; vColor = aColor; vHalf = aHalf; vRadii = aRadii; vParam = aParam;
  gl_Position = vec4(aPos * xf.xy + xf.zw, 0.0, 1.0);
}";

/// Kinds (vParam.x): 0 plain colour, 1 rounded box, 2 rounded box's border
/// (vParam.y its width), 3 a box's soft shadow (vParam.y sigma), 4 a picture
/// (premultiplied) times the colour, cut to the rounded box when vParam.y is 1.
/// Distances are in the game's units; `aa` is one device pixel in them.
pub const SHAPE_FS: &str = "#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vUv;
in vec4 vColor;
flat in vec2 vHalf;
flat in vec4 vRadii;
flat in vec2 vParam;
uniform sampler2D tex;
uniform float aa;
out vec4 o;
float box(vec2 p, vec2 b, vec4 r) {
  float rr = p.x > 0.0 ? (p.y > 0.0 ? r.z : r.y) : (p.y > 0.0 ? r.w : r.x);
  vec2 q = abs(p) - b + rr;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rr;
}
float gauss(float x, float s) { return exp(-(x * x) / (2.0 * s * s)) / (2.5066283 * s); }
vec2 erf2(vec2 x) {
  vec2 s = sign(x), a = abs(x);
  x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  x *= x;
  return s - s / (x * x);
}
float shadowX(float x, float y, float s, float c, vec2 hs) {
  float d = min(hs.y - c - abs(y), 0.0);
  float curved = hs.x - c + sqrt(max(0.0, c * c - d * d));
  vec2 i = 0.5 + 0.5 * erf2((x + vec2(-curved, curved)) * (0.7071068 / s));
  return i.y - i.x;
}
float shadow(vec2 p, vec2 hs, float s, float c) {
  float lo = p.y - hs.y, hi = p.y + hs.y;
  float st = clamp(-3.0 * s, lo, hi), en = clamp(3.0 * s, lo, hi);
  float step = (en - st) / 4.0, y = st + step * 0.5, v = 0.0;
  for (int i = 0; i < 4; i++) { v += shadowX(p.x, p.y - y, s, c, hs) * gauss(y, s) * step; y += step; }
  return v;
}
void main() {
  int m = int(vParam.x + 0.5);
  if (m == 0) { o = vColor; return; }
  if (m == 1) { o = vColor * clamp(0.5 - box(vLocal, vHalf, vRadii) / aa, 0.0, 1.0); return; }
  if (m == 2) {
    float d = box(vLocal, vHalf, vRadii);
    o = vColor * clamp(0.5 - d / aa, 0.0, 1.0) * clamp(0.5 + (d + vParam.y) / aa, 0.0, 1.0);
    return;
  }
  if (m == 3) {
    float c = min(max(max(vRadii.x, vRadii.y), max(vRadii.z, vRadii.w)), min(vHalf.x, vHalf.y));
    o = vColor * clamp(shadow(vLocal, vHalf, max(vParam.y, 0.5 * aa), c), 0.0, 1.0);
    return;
  }
  vec4 t = texture(tex, vUv) * vColor;
  if (vParam.y > 0.5) t *= clamp(0.5 - box(vLocal, vHalf, vRadii) / aa, 0.0, 1.0);
  o = t;
}";

/// The 3D scene's triangles as the engine hands them over (scene3d.rs
/// `tris`): x, y in the game's units, depth 0…1, r, g, b.
pub const TRIS_VS: &str = "#version 300 es
layout(location = 0) in vec2 p;
layout(location = 1) in float d;
layout(location = 2) in vec3 c;
uniform vec4 xf;
out vec4 v;
// see-through faces (an engine's flame) come last with depth + 2 and their
// colour already times their opacity: drawn at depth - 2, alpha 0, so their
// light adds under premultiplied blending; solid faces have alpha 1
void main() { float g = step(1.5, d); v = vec4(c, 1.0 - g); gl_Position = vec4(p * xf.xy + xf.zw, (d - 2.0 * g) * 2.0 - 1.0, 1.0); }";

pub const TRIS_FS: &str = "#version 300 es
precision mediump float;
in vec4 v;
out vec4 o;
void main() { o = v; }";

/// VR: the 2D view's panel, its corners already in clip space (x, y, z, w:
/// the GPU interpolates the picture in perspective); premultiplied.
pub const PANEL_VS: &str = "#version 300 es
layout(location = 0) in vec4 p;
layout(location = 1) in vec2 uv;
out vec2 t;
void main() { t = uv; gl_Position = vec4(p.xy, 0.0, p.w); }";

pub const PANEL_FS: &str = "#version 300 es
precision mediump float;
uniform sampler2D tex;
in vec2 t;
out vec4 o;
void main() { o = texture(tex, t); }";
