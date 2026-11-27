// SPDX-License-Identifier: AGPL-3.0-or-later
//! The 3D world a game writes in its view with three.js's names, the way
//! React Three Fiber reads JSX (and M-Files' `<scene3d>` does):
//!
//! ```text
//! <scene3d>
//!   <color attach="background" args={["#87ceeb"]} />
//!   <fog attach="fog" args={["#87ceeb", 10, 40]} />
//!   <perspectiveCamera position={[0, 6, 8]} fov={50} lookAt={[0, 0, 0]} />
//!   <orbitControls target={[0, 0, 0]} minDistance={4} maxDistance={16} />   (runtime.js)
//!   <ambientLight intensity={0.5} />
//!   <directionalLight position={[3, 6, 4]} intensity={1.2} />
//!   <group position={[0, 0, 0]} rotation={[0, 0.5, 0]}>
//!     <mesh name="a1" position={[0, 0.1, 0]} onClick={(e) => pick(e.object.name)}>
//!       <boxGeometry args={[1, 0.2, 1]} />
//!       <meshStandardMaterial color="#f0d9b5" />
//!     </mesh>
//!     <primitive object={gltf.scene} position={[2, 0, 3]} scale={0.8} />
//!   </group>
//! </scene3d>
//! ```
//!
//! The runtime (js/runtime.js) serializes the `<scene3d>` subtree with its
//! props as they are (`{t, id?, a: {props}, c}`), a `<primitive>`'s object
//! as `{model, inst, anim: [[clip, time, weight]]}` (the state of its
//! THREE.AnimationMixer), and keeps the subtree out of the 2D layout. The
//! world draws it under the 2D view: as depth-tested triangles for a GL host
//! (scene3d.rs `tris`) or as sorted polygons into the draw stream.
//!
//! Geometries are RangerThree's (terotests/RangerThree, three.js's own
//! geometry code in Rust), so a `<sphereGeometry args={[1, 32, 16]} />` has
//! exactly three.js's vertices. glTF models, skins and clips are gltf.rs.
//! Colours follow three.js's colour management: material colours are sRGB,
//! lit in linear light, written out as sRGB.
//!
//! The world remembers the last frame's triangles, so that a point on the
//! screen finds the object under it (`raycast`): a tap on a mesh goes to
//! its onClick / onPointerDown / onPointerUp, as in React Three Fiber.

use crate::draw::DrawStream;
use crate::gltf::{self, Asset, M4, IDENTITY};
use rg_core::json::{self, member, Json};
use rg_core::vfs::{self, Vfs};
use std::collections::HashMap;
use std::rc::Rc;

type V3 = [f32; 3];

fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn dot(a: V3, b: V3) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
fn norm(a: V3) -> V3 {
    let l = dot(a, a).sqrt();
    if l < 1e-12 { [0.0, 0.0, 0.0] } else { [a[0] / l, a[1] / l, a[2] / l] }
}

fn to_linear(c: f32) -> f32 {
    if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
}
fn to_srgb_exact(c: f32) -> f32 {
    let c = c.clamp(0.0, 1.0);
    if c <= 0.0031308 { c * 12.92 } else { 1.055 * c.powf(1.0 / 2.4) - 0.055 }
}
// every lit corner is turned back to sRGB: a table with linear steps between
// its entries (well under one 8-bit step off) instead of a powf for each of
// three channels of tens of thousands of corners a frame
const SRGB_N: usize = 1024;
fn to_srgb(c: f32) -> f32 {
    static TABLE: std::sync::OnceLock<Vec<f32>> = std::sync::OnceLock::new();
    let t = TABLE.get_or_init(|| (0..=SRGB_N + 1).map(|i| to_srgb_exact(i as f32 / SRGB_N as f32)).collect());
    let x = c.clamp(0.0, 1.0) * SRGB_N as f32;
    // the first steps are steep: exact there
    if x < 4.0 {
        return to_srgb_exact(c);
    }
    let i = x as usize;
    let k = x - i as f32;
    t[i] + (t[i + 1] - t[i]) * k
}

/// three.js's named colours that games are most likely to use
fn named(s: &str) -> Option<u32> {
    Some(match s {
        "white" => 0xffffff, "black" => 0x000000, "red" => 0xff0000, "green" => 0x008000, "lime" => 0x00ff00,
        "blue" => 0x0000ff, "yellow" => 0xffff00, "orange" => 0xffa500, "purple" => 0x800080, "pink" => 0xffc0cb,
        "brown" => 0xa52a2a, "gray" | "grey" => 0x808080, "lightgray" | "lightgrey" => 0xd3d3d3, "darkgray" | "darkgrey" => 0xa9a9a9,
        "cyan" | "aqua" => 0x00ffff, "magenta" | "fuchsia" => 0xff00ff, "gold" => 0xffd700, "silver" => 0xc0c0c0,
        "skyblue" => 0x87ceeb, "hotpink" => 0xff69b4, "navy" => 0x000080, "teal" => 0x008080, "olive" => 0x808000,
        "maroon" => 0x800000, "coral" => 0xff7f50, "salmon" => 0xfa8072, "tomato" => 0xff6347, "orchid" => 0xda70d6,
        "beige" => 0xf5f5dc, "ivory" => 0xfffff0, "tan" => 0xd2b48c, "chocolate" => 0xd2691e, "crimson" => 0xdc143c,
        "forestgreen" => 0x228b22, "seagreen" => 0x2e8b57, "royalblue" => 0x4169e1, "steelblue" => 0x4682b4,
        "slategray" | "slategrey" => 0x708090, "wheat" => 0xf5deb3, "khaki" => 0xf0e68c, "indigo" => 0x4b0082,
        "violet" => 0xee82ee, "turquoise" => 0x40e0d0, "lavender" => 0xe6e6fa, "peru" => 0xcd853f, "sienna" => 0xa0522d,
        _ => return None,
    })
}

/// A colour prop (sRGB): "#rgb", "#rrggbb", a name, a number 0xrrggbb,
/// "rgb(r, g, b)", "hsl(h, s%, l%)" or [r, g, b] in 0…1; answered in linear light.
pub fn color(v: &Json, fallback: V3) -> V3 {
    let lin = |r: f32, g: f32, b: f32| [to_linear(r), to_linear(g), to_linear(b)];
    let hex = |n: u32| lin(((n >> 16) & 255) as f32 / 255.0, ((n >> 8) & 255) as f32 / 255.0, (n & 255) as f32 / 255.0);
    match v {
        Json::Num(n) => hex(*n as u32),
        Json::Arr(a) if a.len() >= 3 => lin(a[0].as_num(0.0) as f32, a[1].as_num(0.0) as f32, a[2].as_num(0.0) as f32),
        Json::Str(s) => {
            let s = s.trim().to_lowercase();
            if let Some(h) = s.strip_prefix('#') {
                let p = |t: &str| u32::from_str_radix(t, 16).unwrap_or(0);
                if h.len() == 3 {
                    let d: Vec<u32> = h.chars().map(|c| p(&c.to_string()) * 17).collect();
                    return hex((d[0] << 16) | (d[1] << 8) | d[2]);
                }
                if h.len() >= 6 {
                    return hex(p(&h[0..6]));
                }
                return fallback;
            }
            if let Some(n) = named(&s) {
                return hex(n);
            }
            let inner = |pre: &str| s.strip_prefix(pre).map(|r| r.trim_end_matches(')').split(',').map(|x| x.trim().trim_end_matches('%').parse::<f32>().unwrap_or(0.0)).collect::<Vec<f32>>());
            if let Some(p) = inner("rgb(").or_else(|| inner("rgba(")) {
                if p.len() >= 3 {
                    return lin(p[0] / 255.0, p[1] / 255.0, p[2] / 255.0);
                }
            }
            if let Some(p) = inner("hsl(").or_else(|| inner("hsla(")) {
                if p.len() >= 3 {
                    let (h, s, l) = ((p[0] / 360.0).rem_euclid(1.0), p[1] / 100.0, p[2] / 100.0);
                    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
                    let pp = 2.0 * l - q;
                    let ch = |mut t: f32| {
                        t = t.rem_euclid(1.0);
                        if t < 1.0 / 6.0 { pp + (q - pp) * 6.0 * t } else if t < 0.5 { q } else if t < 2.0 / 3.0 { pp + (q - pp) * 6.0 * (2.0 / 3.0 - t) } else { pp }
                    };
                    return lin(ch(h + 1.0 / 3.0), ch(h), ch(h - 1.0 / 3.0));
                }
            }
            fallback
        }
        _ => fallback,
    }
}

fn arr3(v: &Json) -> Option<V3> {
    match v {
        Json::Arr(a) if a.len() >= 3 => Some([a[0].as_num(0.0) as f32, a[1].as_num(0.0) as f32, a[2].as_num(0.0) as f32]),
        Json::Obj(_) => Some([v.get("x").as_num(0.0) as f32, v.get("y").as_num(0.0) as f32, v.get("z").as_num(0.0) as f32]),
        Json::Num(n) => Some([*n as f32; 3]),
        _ => None,
    }
}

/// a prop by name, without copying the props object
fn prop<'a>(a: &'a Json, key: &str) -> Option<&'a Json> {
    if let Json::Obj(ms) = a {
        for m in ms.iter() {
            if m.key == key {
                return Some(&m.value);
            }
        }
    }
    None
}

fn pnum(a: &Json, key: &str, d: f32) -> f32 {
    prop(a, key).map(|v| v.as_num(d as f64) as f32).unwrap_or(d)
}

/// Euler angles (radians) to a quaternion, in three.js's orders.
fn euler_quat(x: f32, y: f32, z: f32, order: &str) -> [f32; 4] {
    let (c1, c2, c3) = ((x / 2.0).cos(), (y / 2.0).cos(), (z / 2.0).cos());
    let (s1, s2, s3) = ((x / 2.0).sin(), (y / 2.0).sin(), (z / 2.0).sin());
    match order {
        "YXZ" => [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3],
        "ZXY" => [s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3],
        "ZYX" => [s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3],
        "YZX" => [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3],
        "XZY" => [s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3],
        _ => [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3],
    }
}

/// An object's local matrix from position / rotation / quaternion / scale and
/// their dashed forms (position-x, rotation-y, scale-z).
fn local_matrix(a: &Json) -> M4 {
    let mut t = prop(a, "position").and_then(arr3).unwrap_or([0.0; 3]);
    let mut e = [0.0f32; 3];
    let mut order = String::from("XYZ");
    if let Some(Json::Arr(r)) = prop(a, "rotation") {
        for k in 0..3 {
            e[k] = r.get(k).map(|v| v.as_num(0.0) as f32).unwrap_or(0.0);
        }
        if let Some(Json::Str(o)) = r.get(3) {
            order = o.clone();
        }
    }
    let mut s = match prop(a, "scale") { Some(v) => arr3(v).unwrap_or([1.0; 3]), None => [1.0; 3] };
    for (k, axis) in ["x", "y", "z"].iter().enumerate() {
        if let Some(v) = prop(a, &format!("position-{}", axis)) { t[k] = v.as_num(0.0) as f32; }
        if let Some(v) = prop(a, &format!("rotation-{}", axis)) { e[k] = v.as_num(0.0) as f32; }
        if let Some(v) = prop(a, &format!("scale-{}", axis)) { s[k] = v.as_num(1.0) as f32; }
    }
    let q = match prop(a, "quaternion") {
        Some(Json::Arr(v)) if v.len() >= 4 => [v[0].as_num(0.0) as f32, v[1].as_num(0.0) as f32, v[2].as_num(0.0) as f32, v[3].as_num(1.0) as f32],
        _ => euler_quat(e[0], e[1], e[2], &order),
    };
    gltf::compose(t, q, s)
}

/// A geometry as plain arrays (from RangerThree's BufferGeometry).
pub struct Geo {
    pub pos: Vec<V3>,
    pub nrm: Vec<V3>,
    pub tris: Vec<u32>,
}

fn args(a: &Json) -> Vec<f64> {
    match prop(a, "args") {
        Some(Json::Arr(v)) => v.iter().map(|x| match x { Json::Bool(b) => if *b { 1.0 } else { 0.0 }, _ => x.as_num(f64::NAN) }).collect(),
        _ => Vec::new(),
    }
}

/// three.js's geometry `kind` (boxGeometry, …) for its constructor's args,
/// built by RangerThree; None for one it does not know.
fn build_geo(kind: &str, av: &[f64]) -> Option<Geo> {
    use rangerthree::geometries::polyhedron as ph;
    use rangerthree::geometries::primitives as pr;
    let g = |i: usize, d: f64| av.get(i).copied().filter(|v| v.is_finite()).unwrap_or(d);
    let tau = std::f64::consts::TAU;
    let pi = std::f64::consts::PI;
    let b = match kind {
        "boxGeometry" => pr::box_geometry(g(0, 1.0), g(1, 1.0), g(2, 1.0), g(3, 1.0), g(4, 1.0), g(5, 1.0)),
        "planeGeometry" => pr::plane_geometry(g(0, 1.0), g(1, 1.0), g(2, 1.0), g(3, 1.0)),
        "sphereGeometry" => pr::sphere_geometry(g(0, 1.0), g(1, 32.0), g(2, 16.0), g(3, 0.0), g(4, tau), g(5, 0.0), g(6, pi)),
        "cylinderGeometry" => pr::cylinder_geometry(g(0, 1.0), g(1, 1.0), g(2, 1.0), g(3, 32.0), g(4, 1.0), g(5, 0.0) != 0.0, g(6, 0.0), g(7, tau)),
        "coneGeometry" => pr::cone_geometry(g(0, 1.0), g(1, 1.0), g(2, 32.0), g(3, 1.0), g(4, 0.0) != 0.0, g(5, 0.0), g(6, tau)),
        "circleGeometry" => pr::circle_geometry(g(0, 1.0), g(1, 32.0), g(2, 0.0), g(3, tau)),
        "ringGeometry" => pr::ring_geometry(g(0, 0.5), g(1, 1.0), g(2, 32.0), g(3, 1.0), g(4, 0.0), g(5, tau)),
        "torusGeometry" => pr::torus_geometry(g(0, 1.0), g(1, 0.4), g(2, 12.0), g(3, 48.0), g(4, tau), g(5, 0.0), g(6, tau)),
        "torusKnotGeometry" => pr::torus_knot_geometry(g(0, 1.0), g(1, 0.4), g(2, 64.0), g(3, 8.0), g(4, 2.0), g(5, 3.0)),
        "capsuleGeometry" => pr::capsule_geometry(g(0, 1.0), g(1, 1.0), g(2, 4.0), g(3, 8.0), g(4, 1.0)),
        "tetrahedronGeometry" => ph::tetrahedron_geometry(g(0, 1.0), g(1, 0.0)),
        "octahedronGeometry" => ph::octahedron_geometry(g(0, 1.0), g(1, 0.0)),
        "icosahedronGeometry" => ph::icosahedron_geometry(g(0, 1.0), g(1, 0.0)),
        "dodecahedronGeometry" => ph::dodecahedron_geometry(g(0, 1.0), g(1, 0.0)),
        _ => return None,
    };
    let pos_a = b.get_attribute("position")?;
    let pos_a = pos_a.borrow();
    let n = pos_a.count as usize;
    let pos: Vec<V3> = (0..n).map(|i| [pos_a.get_x(i) as f32, pos_a.get_y(i) as f32, pos_a.get_z(i) as f32]).collect();
    let nrm: Vec<V3> = match b.get_attribute("normal") {
        Some(na) => { let na = na.borrow(); (0..n).map(|i| [na.get_x(i) as f32, na.get_y(i) as f32, na.get_z(i) as f32]).collect() }
        None => vec![[0.0, 1.0, 0.0]; n],
    };
    let tris: Vec<u32> = match b.get_index() {
        Some(ia) => { let ia = ia.borrow(); (0..ia.count as usize).map(|i| ia.get_x(i) as u32).filter(|&i| (i as usize) < n).collect() }
        None => (0..n as u32).collect(),
    };
    let mut tris = tris;
    tris.truncate(tris.len() / 3 * 3);
    Some(Geo { pos, nrm, tris })
}

#[derive(Clone, Copy)]
enum LightKind {
    Ambient,
    Directional,
    Point,
    Hemisphere,
}

#[derive(Clone, Copy)]
struct Light {
    kind: LightKind,
    color: V3,
    ground: V3,
    intensity: f32,
    /// directional: the direction towards the light; point: its position
    v: V3,
    distance: f32,
    decay: f32,
}

#[derive(Clone)]
struct Mat {
    color: V3,
    emissive: V3,
    /// 0 lit, 1 basic (unlit), 2 normal colours
    kind: u8,
    side: u8,
    flat: bool,
    toon: Option<Toon>,
}

/// Cel shading and an outline (`<meshToonMaterial>`, `toon` on a mesh's
/// material or on a `<primitive>`, and per part a glTF material's
/// `extras.toon`), as a toon shader's passes:
///
/// - **bands**: the key light's n·l cut into `n` bands at `edges`; band j is
///   lit by `levels[j]` of the key light over the flat fill (ambient and
///   hemisphere light, times `shadow`, the shadow's tint)
/// - **highlight** (specular): where n·h ≥ `spec`, `spec_col` × the key light
///   is added (metal, eyes, gems); 0: none
/// - **rim** (Fresnel): where 1 − n·v ≥ `rim`, `rim_col` is added; 0: none
/// - **outline**: `line` units wide (about CSS pixels, the same on the screen
///   at any distance) in `line_col`; 0: none
///
/// Every edge is cut through the triangles, so each piece is one flat
/// colour and the edges stay sharp however big the triangles are.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Toon {
    pub n: u8,
    pub edges: [f32; 3],
    pub levels: [f32; 4],
    pub shadow: V3,
    pub spec: f32,
    pub spec_col: V3,
    pub rim: f32,
    pub rim_col: V3,
    pub line: f32,
    pub line_col: V3,
    /// lit: false draws the colours flat (emissive glow) but keeps the outline
    pub lit: bool,
    /// ink lines (a comic's brush line on a 3D surface, see `ink_lines`):
    /// the contour drawn as brush strokes `ink` model units wide (0: none),
    /// thinner on the lit side and thicker in shadow by `ink_var`, in `ink_col`
    pub ink: f32,
    pub ink_var: f32,
    pub ink_col: V3,
}

impl Toon {
    pub const DEFAULT: Toon = Toon {
        n: 3, edges: [-0.05, 0.45, 2.0], levels: [0.0, 0.55, 1.0, 1.0], shadow: [1.0; 3],
        spec: 0.0, spec_col: [1.0; 3], rim: 0.0, rim_col: [0.5, 0.35, 1.0],
        line: 2.0, line_col: [0.012, 0.009, 0.02], lit: true,
        ink: 0.0, ink_var: 0.6, ink_col: [0.012, 0.009, 0.02],
    };

    /// `true`, a number (the number of bands) or an object (see `apply`);
    /// None for false / null.
    pub fn from_json(v: &Json) -> Option<Toon> {
        let mut t = Toon::DEFAULT;
        match v {
            Json::Bool(true) => {}
            Json::Num(k) => t = Toon::bands(*k as usize),
            Json::Obj(_) => t.apply(v),
            _ => return None,
        }
        Some(t)
    }

    /// Fields of `{ bands, edges, levels, shadowColor, specular,
    /// specularColor, rim, rimColor, outline, outlineColor, lit }` over these.
    pub fn apply(&mut self, v: &Json) {
        if let Some(k) = prop(v, "bands") {
            let b = Toon::bands(k.as_num(3.0) as usize);
            self.n = b.n;
            self.edges = b.edges;
            self.levels = b.levels;
        }
        if let Some(Json::Arr(e)) = prop(v, "edges") {
            let e: Vec<f32> = e.iter().take(3).map(|x| x.as_num(0.0) as f32).collect();
            self.n = (e.len() + 1) as u8;
            for (i, x) in e.iter().enumerate() { self.edges[i] = *x; }
        }
        if let Some(Json::Arr(l)) = prop(v, "levels") {
            for (i, x) in l.iter().take(4).enumerate() { self.levels[i] = x.as_num(1.0) as f32; }
        }
        let width = |o: &Json, d: f32| match o { Json::Bool(b) => if *b { d } else { 0.0 }, _ => o.as_num(d as f64).max(0.0) as f32 };
        if let Some(c) = prop(v, "shadowColor") { self.shadow = color(c, self.shadow); }
        if let Some(o) = prop(v, "specular") { self.spec = width(o, 0.96).min(1.0); }
        if let Some(c) = prop(v, "specularColor") { self.spec_col = color(c, self.spec_col); }
        if let Some(o) = prop(v, "rim") { self.rim = width(o, 0.6).min(1.0); }
        if let Some(c) = prop(v, "rimColor") { self.rim_col = color(c, self.rim_col); }
        if let Some(o) = prop(v, "outline") { self.line = width(o, 2.0); }
        if let Some(c) = prop(v, "outlineColor") { self.line_col = color(c, self.line_col); }
        if let Some(Json::Bool(b)) = prop(v, "lit") { self.lit = *b; }
        if let Some(o) = prop(v, "ink") { self.ink = width(o, 0.004); }
        if let Some(o) = prop(v, "inkVar") { self.ink_var = o.as_num(0.6) as f32; }
        if let Some(c) = prop(v, "inkColor") { self.ink_col = color(c, self.ink_col); }
    }

    /// n even bands from shadow to full light (2 to 4)
    pub fn bands(k: usize) -> Toon {
        let mut t = Toon::DEFAULT;
        match k.clamp(2, 4) {
            2 => { t.n = 2; t.edges = [0.1, 2.0, 2.0]; t.levels = [0.15, 1.0, 1.0, 1.0]; }
            4 => { t.n = 4; t.edges = [-0.05, 0.4, 0.9]; t.levels = [0.0, 0.5, 0.9, 1.2]; }
            _ => {}
        }
        t
    }

    /// the band n·l = `t` falls in
    pub fn band(&self, t: f32) -> usize {
        let mut j = 0;
        while j + 1 < self.n as usize && t >= self.edges[j] {
            j += 1;
        }
        j
    }

    fn hash<H: std::hash::Hasher>(&self, hs: &mut H) {
        use std::hash::Hash;
        self.n.hash(hs);
        self.lit.hash(hs);
        for v in self.edges.iter().chain(self.levels.iter()).chain(self.shadow.iter()).chain(self.spec_col.iter()).chain(self.rim_col.iter()).chain(self.line_col.iter()) { v.to_bits().hash(hs); }
        for v in [self.spec, self.rim, self.line, self.ink, self.ink_var] { v.to_bits().hash(hs); }
        for v in self.ink_col.iter() { v.to_bits().hash(hs); }
    }
}

/// A polygon cut by the toon pass's edges: corners in view space with
/// their n·l, n·h and 1 − n·v.
type ToonPoly = Vec<(V3, [f32; 3])>;

/// The part of `poly` where scalar `k` is at least `at` (`above`) or under it.
fn clip_scalar(poly: &[(V3, [f32; 3])], k: usize, at: f32, above: bool) -> ToonPoly {
    let inside = |t: f32| if above { t >= at } else { t < at };
    let mut out = Vec::with_capacity(poly.len() + 1);
    for i in 0..poly.len() {
        let (p, sp) = poly[i];
        let (q, sq) = poly[(i + 1) % poly.len()];
        if inside(sp[k]) {
            out.push((p, sp));
        }
        if inside(sp[k]) != inside(sq[k]) {
            let t = (at - sp[k]) / (sq[k] - sp[k]);
            let l = |a: f32, b: f32| a + (b - a) * t;
            out.push(([l(p[0], q[0]), l(p[1], q[1]), l(p[2], q[2])], [l(sp[0], sq[0]), l(sp[1], sq[1]), l(sp[2], sq[2])]));
        }
    }
    out
}

/// `poly` cut into pieces that each lie in one band, highlight and rim
/// region: (piece, (band, highlight, rim)). Each scalar is cut once and its
/// class is known from the cut (a cut corner sits on the edge itself).
fn toon_pieces(tn: &Toon, poly: ToonPoly, out: &mut Vec<(ToonPoly, (usize, bool, bool))>) {
    // split one polygon at `at` on scalar k: (below, above), either may be empty
    fn split(poly: ToonPoly, k: usize, at: f32) -> (ToonPoly, ToonPoly) {
        let (lo, hi) = poly.iter().fold((f32::MAX, f32::MIN), |m, c| (m.0.min(c.1[k]), m.1.max(c.1[k])));
        if hi < at {
            return (poly, Vec::new());
        }
        if lo >= at {
            return (Vec::new(), poly);
        }
        (clip_scalar(&poly, k, at, false), clip_scalar(&poly, k, at, true))
    }
    let mut bands: Vec<(ToonPoly, usize)> = Vec::new();
    let mut rest = poly;
    for j in 0..tn.n as usize {
        if j + 1 == tn.n as usize {
            bands.push((rest, j));
            break;
        }
        let (below, above) = split(rest, 0, tn.edges[j]);
        if below.len() >= 3 {
            bands.push((below, j));
        }
        if above.len() < 3 {
            break;
        }
        rest = above;
    }
    for (bp, j) in bands {
        if bp.len() < 3 {
            continue;
        }
        let specs = if tn.spec > 0.0 { let (a, b) = split(bp, 1, tn.spec); vec![(a, false), (b, true)] } else { vec![(bp, false)] };
        for (sp, sf) in specs {
            if sp.len() < 3 {
                continue;
            }
            let rims = if tn.rim > 0.0 { let (a, b) = split(sp, 2, tn.rim); vec![(a, false), (b, true)] } else { vec![(sp, false)] };
            for (rp, rf) in rims {
                if rp.len() >= 3 {
                    out.push((rp, (j, sf, rf)));
                }
            }
        }
    }
}


/// A thing to draw: its corners in the world and their linear colours.
struct Item {
    pos: Vec<V3>,
    nrm: Vec<V3>,
    col: Vec<V3>,
    emissive: V3,
    tris: Vec<u32>,
    /// 0 lit, 1 unlit, 2 normal colours
    kind: u8,
    double: bool,
    flat: bool,
    /// cel shading and outline (None: three.js's light)
    toon: Option<Toon>,
    owner: u32,
    /// three.js's renderOrder: without a depth buffer (the painter) lower
    /// orders are drawn first, whatever their depth
    order: i32,
    /// a glTF model drawn later from its pose (pos etc. are empty then);
    /// `key` tells the same model, pose and place from frame to frame
    model: Option<Rc<ModelInst>>,
    key: u64,
    /// a brush stroke: `pos` are its Catmull-Rom control points and these
    /// their widths (model units), drawn as a ribbon (see `brush_ribbon`)
    brush: Option<Rc<Vec<f32>>>,
}

struct ModelInst {
    asset: Rc<Asset>,
    mix: Vec<(usize, f32, f32)>,
    m: M4,
    tint: Option<V3>,
    toon: Option<Toon>,
    /// what the game does on top of the clips (rig.rs): turns added to bones,
    /// two-bone IK, and the point the eyes look at (world)
    turns: Vec<(usize, [f32; 4])>,
    ik: Vec<crate::rig::Ik>,
    look: Option<V3>,
}

/// One model's drawing kept for the next frame: if nothing about it or the
/// view changed (a piece standing still), it is copied, not posed, skinned,
/// lit and projected again.
struct Kept {
    frame: u64,
    tris: Vec<f32>,
    pick: Vec<[V3; 3]>,
    drawn: usize,
}

#[derive(Clone, Copy)]
struct Cam {
    eye: V3,
    r: V3,
    u: V3,
    f: V3,
    focal: f32,
    w: f32,
    h: f32,
    /// the point straight ahead on the screen (w / 2, h / 2 but in VR)
    cx: f32,
    cy: f32,
    near: f32,
    far: f32,
}

impl Cam {
    fn ray(&self, x: f32, y: f32) -> V3 {
        let dx = (x - self.cx) / self.focal;
        let dy = (self.cy - y) / self.focal;
        norm([self.f[0] + self.r[0] * dx + self.u[0] * dy, self.f[1] + self.r[1] * dx + self.u[1] * dy, self.f[2] + self.r[2] * dx + self.u[2] * dy])
    }
}

pub struct World {
    pub active: bool,
    models: HashMap<String, Result<Rc<Asset>, String>>,
    /// height pictures read for the script (op "height"), None when not readable
    heights: HashMap<String, Option<crate::heights::HeightPic>>,
    geos: HashMap<String, Rc<Geo>>,
    /// set by the engine around script calls and the render: the files and
    /// the game's folder, for models (only read while they are valid)
    pub vfs: *const Vfs,
    pub dir: String,
    // the last frame, for raycast
    cam: Option<Cam>,
    pick: Vec<[V3; 3]>,
    pick_owner: Vec<u32>,
    /// (handler id of the object or the nearest ancestor that has one, name)
    owners: Vec<(String, String)>,
    /// triangles drawn in the last frame
    pub drawn: usize,
    kept: HashMap<u64, Kept>,
    /// VR in a headset: the frame walks the tree but draws only per eye (`render_eye`)
    pub eyes_only: bool,
    /// the last frame's walked tree, for the eyes
    last: Option<Ctx>,
    /// the game camera (the VR rig): position, right, up, forward, near, far
    rig: Option<(V3, V3, V3, V3, f32, f32)>,
}

struct Ctx {
    lights: Vec<Light>,
    items: Vec<Item>,
    cam: Option<(M4, Json)>,
    background: Option<V3>,
    fog: Option<(V3, f32, f32)>,
    owners: Vec<(String, String)>,
}

impl World {
    pub fn new() -> World {
        World {
            active: false,
            models: HashMap::new(),
            heights: HashMap::new(),
            geos: HashMap::new(),
            vfs: std::ptr::null(),
            dir: String::new(),
            cam: None,
            pick: Vec::new(),
            pick_owner: Vec::new(),
            owners: Vec::new(),
            drawn: 0,
            kept: HashMap::new(),
            eyes_only: false,
            last: None,
            rig: None,
        }
    }

    /// The model at `src` (in the game's folder, or an absolute /games path).
    pub fn model(&mut self, src: &str) -> Result<Rc<Asset>, String> {
        if let Some(m) = self.models.get(src) {
            return m.clone();
        }
        if self.vfs.is_null() {
            return Err("no files".into());
        }
        // SAFETY: the engine points `vfs` at its own Vfs only while it is
        // borrowed for this call (Engine::frame / start) and clears it after.
        let fs: &Vfs = unsafe { &*self.vfs };
        let path = if src.starts_with('/') { src.to_string() } else { vfs::join(&self.dir, src) };
        let bytes = fs.read(&path);
        let r = if bytes.is_empty() {
            Err(format!("{} not found", path))
        } else {
            let base = vfs::dirname(&path);
            let side = |uri: &str| -> Option<Vec<u8>> {
                let b = fs.read(&vfs::join(&base, uri));
                if b.is_empty() { None } else { Some(b) }
            };
            gltf::parse(&bytes, &side).map(Rc::new)
        };
        self.models.insert(src.to_string(), r.clone());
        r
    }

    /// Answers a synchronous request from the script (`__hostSync`), JSON in
    /// and out: {op: "gltf", src} the model's clips and node names;
    /// {op: "raycast", x, y, all} what is under a point of the screen;
    /// {op: "project", x, y, z} a world point on the screen;
    /// {op: "height", src, u, v} a height picture's value 0..1 at u, v (null
    /// when the picture is missing or not a PNG this reads).
    pub fn sync(&mut self, req: &Json) -> Json {
        match req.get("op").as_str().as_str() {
            "height" => {
                let src = req.get("src").as_str();
                if !self.heights.contains_key(src.as_str()) {
                    let pic = if self.vfs.is_null() {
                        None
                    } else {
                        // SAFETY: as in model(): the engine's Vfs, borrowed for this call
                        let fs: &Vfs = unsafe { &*self.vfs };
                        let path = if src.starts_with('/') { src.to_string() } else { vfs::join(&self.dir, &src) };
                        crate::heights::decode_png(&fs.read(&path))
                    };
                    if pic.is_none() && self.vfs.is_null() {
                        return Json::Null;
                    }
                    self.heights.insert(src.to_string(), pic);
                }
                match self.heights.get(src.as_str()) {
                    Some(Some(p)) => Json::Num(p.at(req.get("u").as_num(0.0), req.get("v").as_num(0.0))),
                    _ => Json::Null,
                }
            }
            "gltf" => match self.model(&req.get("src").as_str()) {
                Ok(a) => json::obj(vec![
                    member("animations", Json::Arr(a.clips.iter().map(|c| json::obj(vec![
                        member("name", Json::Str(c.name.clone())),
                        member("duration", Json::Num(c.duration as f64)),
                    ])).collect())),
                    member("nodes", Json::Arr(a.nodes.iter().map(|n| Json::Str(n.name.clone())).collect())),
                    member("triangles", Json::Num(a.triangles as f64)),
                ]),
                Err(e) => json::obj(vec![member("error", Json::Str(e))]),
            },
            "raycast" => {
                let hits = self.raycast(req.get("x").as_num(0.0) as f32, req.get("y").as_num(0.0) as f32);
                if req.get("all").as_bool() { Json::Arr(hits) } else { hits.into_iter().next().unwrap_or(Json::Null) }
            }
            "project" => match self.cam {
                Some(c) => {
                    let p = [req.get("x").as_num(0.0) as f32, req.get("y").as_num(0.0) as f32, req.get("z").as_num(0.0) as f32];
                    let d = sub(p, c.eye);
                    let z = dot(d, c.f);
                    if z <= c.near {
                        return Json::Null;
                    }
                    json::obj(vec![
                        member("x", Json::Num((c.cx + dot(d, c.r) / z * c.focal) as f64)),
                        member("y", Json::Num((c.cy - dot(d, c.u) / z * c.focal) as f64)),
                        member("depth", Json::Num(z as f64)),
                    ])
                }
                None => Json::Null,
            },
            _ => Json::Null,
        }
    }

    /// The objects under a point of the screen (game units), nearest first,
    /// as three.js's intersections: {id, name, distance, point, normal}.
    pub fn raycast(&self, x: f32, y: f32) -> Vec<Json> {
        let cam = match self.cam { Some(c) => c, None => return Vec::new() };
        self.hits(cam.eye, cam.ray(x, y), cam.near)
    }

    fn hits(&self, o: V3, dir: V3, near: f32) -> Vec<Json> {
        let mut best: Vec<(f32, usize, V3)> = Vec::new();
        for (i, t) in self.pick.iter().enumerate() {
            // Möller–Trumbore
            let e1 = sub(t[1], t[0]);
            let e2 = sub(t[2], t[0]);
            let p = cross(dir, e2);
            let det = dot(e1, p);
            if det.abs() < 1e-9 {
                continue;
            }
            let inv = 1.0 / det;
            let s = sub(o, t[0]);
            let u = dot(s, p) * inv;
            if !(0.0..=1.0).contains(&u) {
                continue;
            }
            let q = cross(s, e1);
            let v = dot(dir, q) * inv;
            if v < 0.0 || u + v > 1.0 {
                continue;
            }
            let d = dot(e2, q) * inv;
            if d <= near {
                continue;
            }
            let mut n = norm(cross(e1, e2));
            if dot(n, dir) > 0.0 {
                n = [-n[0], -n[1], -n[2]];
            }
            best.push((d, i, n));
        }
        best.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        let mut out = Vec::new();
        let mut seen: Vec<u32> = Vec::new();
        for (d, i, n) in best {
            let ow = self.pick_owner[i];
            if seen.contains(&ow) {
                continue;
            }
            seen.push(ow);
            let (id, name) = self.owners.get(ow as usize).cloned().unwrap_or_default();
            let pt = [o[0] + dir[0] * d, o[1] + dir[1] * d, o[2] + dir[2] * d];
            let v3 = |v: V3| Json::Arr(vec![Json::Num(v[0] as f64), Json::Num(v[1] as f64), Json::Num(v[2] as f64)]);
            out.push(json::obj(vec![
                member("id", Json::Str(id)),
                member("name", Json::Str(name)),
                member("distance", Json::Num(d as f64)),
                member("point", v3(pt)),
                member("normal", v3(n)),
            ]));
        }
        out
    }

    fn geo(&mut self, kind: &str, a: &Json) -> Option<Rc<Geo>> {
        let av = args(a);
        let key = format!("{}{:?}", kind, av);
        if let Some(g) = self.geos.get(&key) {
            return Some(g.clone());
        }
        let g = Rc::new(build_geo(kind, &av)?);
        if self.geos.len() > 256 {
            self.geos.clear();
        }
        self.geos.insert(key, g.clone());
        Some(g)
    }

    fn walk(&mut self, n: &Json, parent: &M4, owner: (&str, &str), order: i32, ctx: &mut Ctx) {
        let t = match prop(n, "t") { Some(Json::Str(s)) => s.clone(), _ => return };
        let empty = Json::Obj(Vec::new());
        let none = Json::Arr(Vec::new());
        let a = match prop(n, "a") { Some(v @ Json::Obj(_)) => v, _ => &empty };
        if matches!(prop(a, "visible"), Some(Json::Bool(false))) {
            return;
        }
        let kids = match prop(n, "c") { Some(v @ Json::Arr(_)) => v, _ => &none };
        match t.as_str() {
            "color" => {
                if prop(a, "attach").map(|v| v.as_str()) == Some("background".into()) {
                    if let Some(Json::Arr(v)) = prop(a, "args") {
                        if let Some(c) = v.first() { ctx.background = Some(color(c, [0.0; 3])); }
                    }
                }
                return;
            }
            "fog" => {
                if let Some(Json::Arr(v)) = prop(a, "args") {
                    if v.len() >= 3 {
                        ctx.fog = Some((color(&v[0], [1.0; 3]), v[1].as_num(1.0) as f32, v[2].as_num(1000.0) as f32));
                    }
                }
                return;
            }
            "perspectiveCamera" => {
                if ctx.cam.is_none() || prop(a, "makeDefault").map(|v| v.as_bool()).unwrap_or(false) {
                    ctx.cam = Some((gltf::mat_mul(parent, &local_matrix(a)), a.clone()));
                }
                return;
            }
            "ambientLight" | "directionalLight" | "pointLight" | "hemisphereLight" | "spotLight" => {
                let av = match prop(a, "args") { Some(Json::Arr(v)) => v.clone(), _ => Vec::new() };
                let hemi = t == "hemisphereLight";
                let c = prop(a, if hemi { "skyColor" } else { "color" }).or(av.first()).map(|v| color(v, [1.0; 3])).unwrap_or([1.0; 3]);
                let ground = prop(a, "groundColor").or(if hemi { av.get(1) } else { None }).map(|v| color(v, [1.0; 3])).unwrap_or([1.0; 3]);
                let intensity = prop(a, "intensity").or(av.get(if hemi { 2 } else { 1 })).map(|v| v.as_num(1.0) as f32).unwrap_or(1.0);
                let m = gltf::mat_mul(parent, &local_matrix(a));
                let p = [m[12], m[13], m[14]];
                let kind = match t.as_str() {
                    "ambientLight" => LightKind::Ambient,
                    "directionalLight" => LightKind::Directional,
                    "hemisphereLight" => LightKind::Hemisphere,
                    _ => LightKind::Point,
                };
                let target = prop(a, "target").and_then(arr3).unwrap_or([0.0; 3]);
                let v = match kind {
                    LightKind::Directional => norm(sub(p, target)),
                    LightKind::Hemisphere => {
                        // three.js's default: from above
                        let d = norm(p);
                        if dot(d, d) < 0.5 { [0.0, 1.0, 0.0] } else { d }
                    }
                    _ => p,
                };
                let distance = prop(a, "distance").or(av.get(2)).map(|v| v.as_num(0.0) as f32).unwrap_or(0.0);
                let decay = prop(a, "decay").or(av.get(3)).map(|v| v.as_num(2.0) as f32).unwrap_or(2.0);
                ctx.lights.push(Light { kind, color: c, ground, intensity, v, distance, decay });
                return;
            }
            _ => {}
        }
        let id = n.get("id").as_str();
        let name = prop(a, "name").map(|v| v.as_str()).unwrap_or_default();
        let own_id = if id.is_empty() { owner.0.to_string() } else { id };
        let own_name = if name.is_empty() { owner.1.to_string() } else { name };
        let m = gltf::mat_mul(parent, &local_matrix(a));
        let order = prop(a, "renderOrder").map(|v| v.as_num(0.0) as i32).unwrap_or(order);
        match t.as_str() {
            "mesh" => {
                let mut geo: Option<Rc<Geo>> = None;
                let mut mat = Mat { color: [1.0; 3], emissive: [0.0; 3], kind: 0, side: 0, flat: false, toon: None };
                for c in kids.items().iter() {
                    let ct = c.get("t").as_str();
                    let ca = prop(c, "a").cloned().unwrap_or(Json::Null);
                    if ct.ends_with("Geometry") {
                        geo = self.geo(&ct, &ca);
                    } else if ct.ends_with("Material") {
                        mat.color = prop(&ca, "color").map(|v| color(v, [1.0; 3])).unwrap_or([1.0; 3]);
                        mat.emissive = prop(&ca, "emissive").map(|v| color(v, [0.0; 3])).unwrap_or([0.0; 3]);
                        let ei = pnum(&ca, "emissiveIntensity", 1.0);
                        mat.emissive = [mat.emissive[0] * ei, mat.emissive[1] * ei, mat.emissive[2] * ei];
                        mat.kind = match ct.as_str() { "meshBasicMaterial" => 1, "meshNormalMaterial" => 2, _ => 0 };
                        mat.side = pnum(&ca, "side", 0.0) as u8;
                        mat.flat = prop(&ca, "flatShading").map(|v| v.as_bool()).unwrap_or(false);
                        mat.toon = match prop(&ca, "toon") {
                            Some(v) => Toon::from_json(v),
                            None if ct == "meshToonMaterial" => Toon::from_json(&ca).map(|t| if prop(&ca, "outline").is_none() { Toon { line: 0.0, ..t } } else { t }),
                            None => None,
                        };
                    }
                }
                if geo.is_none() {
                    // a mesh without a geometry is three.js's default: a 1 × 1 × 1 box
                    geo = self.geo("boxGeometry", &Json::Obj(Vec::new()));
                }
                if let Some(g) = geo {
                    let ow = ctx.owners.len() as u32;
                    ctx.owners.push((own_id.clone(), own_name.clone()));
                    let mut pos = Vec::with_capacity(g.pos.len());
                    let mut nrm = Vec::with_capacity(g.pos.len());
                    for i in 0..g.pos.len() {
                        pos.push(gltf::transform_point(&m, g.pos[i]));
                        nrm.push(norm(gltf::transform_dir(&m, g.nrm[i])));
                    }
                    // a negative scale turns the faces inside out (as three.js flips them)
                    let det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
                    let tris = if det < 0.0 && mat.side != 2 {
                        g.tris.chunks(3).flat_map(|t| [t[0], t[2], t[1]]).collect()
                    } else {
                        g.tris.clone()
                    };
                    let col = vec![mat.color; pos.len()];
                    let tris = if mat.side == 1 { tris.chunks(3).flat_map(|t| [t[0], t[2], t[1]]).collect() } else { tris };
                    ctx.items.push(Item { pos, nrm, col, emissive: mat.emissive, tris, kind: mat.kind, double: mat.side == 2, flat: mat.flat, toon: mat.toon, owner: ow, order, model: None, key: 0, brush: None });
                }
            }
            "primitive" => {
                if let Some(obj) = prop(a, "object") {
                    let src = obj.get("model").as_str();
                    if let Ok(asset) = self.model(&src) {
                        let mix: Vec<(usize, f32, f32)> = obj.get("anim").items().iter().map(|e| {
                            let v = e.items();
                            (v.first().map(|x| x.as_num(0.0)).unwrap_or(0.0) as usize, v.get(1).map(|x| x.as_num(0.0)).unwrap_or(0.0) as f32, v.get(2).map(|x| x.as_num(1.0)).unwrap_or(1.0) as f32)
                        }).collect();
                        let ow = ctx.owners.len() as u32;
                        ctx.owners.push((own_id.clone(), own_name.clone()));
                        let tint = prop(a, "color").map(|v| color(v, [1.0; 3]));
                        let toon = prop(a, "toon").and_then(Toon::from_json);
                        let mut hs = std::collections::hash_map::DefaultHasher::new();
                        use std::hash::{Hash, Hasher};
                        src.hash(&mut hs);
                        ow.hash(&mut hs);
                        for (c, t, wgt) in mix.iter() { c.hash(&mut hs); t.to_bits().hash(&mut hs); wgt.to_bits().hash(&mut hs); }
                        for v in m.iter() { v.to_bits().hash(&mut hs); }
                        if let Some(t) = tint { for v in t.iter() { v.to_bits().hash(&mut hs); } }
                        if let Some(t) = toon { t.hash(&mut hs); }
                        // the game's turns, IK and look (rig.rs), by bone name
                        let bone = |n: &str| asset.nodes.iter().position(|x| x.name == n);
                        let v3 = |j: &Json| -> Option<V3> { let v = j.items(); if v.len() >= 3 { Some([v[0].as_num(0.0) as f32, v[1].as_num(0.0) as f32, v[2].as_num(0.0) as f32]) } else { None } };
                        let turns: Vec<(usize, [f32; 4])> = prop(a, "bones").map(|b| b.members().iter().filter_map(|mb| {
                            let e = v3(&mb.value)?;
                            Some((bone(&mb.key)?, crate::rig::euler(e[0], e[1], e[2])))
                        }).collect()).unwrap_or_default();
                        let ik: Vec<crate::rig::Ik> = prop(a, "ik").map(|l| l.items().iter().filter_map(|e| {
                            let ch: Vec<usize> = e.get("chain").items().iter().filter_map(|n| bone(&n.as_str())).collect();
                            if ch.len() != 3 { return None; }
                            Some(crate::rig::Ik { chain: [ch[0], ch[1], ch[2]], target: v3(&e.get("target"))?, pole: v3(&e.get("pole")), weight: e.get("weight").as_num(1.0) as f32 })
                        }).collect()).unwrap_or_default();
                        let look = prop(a, "look").and_then(|j| v3(j));
                        for (i, q) in turns.iter() { i.hash(&mut hs); for v in q.iter() { v.to_bits().hash(&mut hs); } }
                        for k in ik.iter() { k.chain.hash(&mut hs); for v in k.target.iter() { v.to_bits().hash(&mut hs); } k.weight.to_bits().hash(&mut hs); }
                        if let Some(l) = look { for v in l.iter() { v.to_bits().hash(&mut hs); } }
                        ctx.items.push(Item { pos: Vec::new(), nrm: Vec::new(), col: Vec::new(), emissive: [0.0; 3], tris: Vec::new(), kind: 0, double: false, flat: false, toon, owner: ow, order,
                            model: Some(Rc::new(ModelInst { asset, mix, m, tint, toon, turns, ik, look })), key: hs.finish(), brush: None });
                    }
                }
            }
            _ => {}
        }
        if let Json::Arr(kv) = kids {
            for c in kv.iter() {
                self.walk(c, &m, (&own_id, &own_name), order, ctx);
            }
        }
    }

    /// Draws the `<scene3d>` tree (Null: none this frame). With `gl` the
    /// triangles are appended to `tris` (scene3d.rs's format); otherwise
    /// they go into `out` as sorted polygons.
    pub fn render(&mut self, tree: &Json, w: f64, h: f64, gl: bool, out: &mut DrawStream, tris: &mut Vec<f32>) {
        self.drawn = 0;
        if !matches!(tree, Json::Obj(_)) {
            self.active = false;
            self.cam = None;
            self.last = None;
            self.rig = None;
            self.pick.clear();
            self.pick_owner.clear();
            self.owners.clear();
            return;
        }
        self.active = true;
        let (w, h) = (w as f32, h as f32);
        let mut ctx = Ctx { lights: Vec::new(), items: Vec::new(), cam: None, background: None, fog: None, owners: Vec::new() };
        let a = tree.get("a");
        if let Some(bg) = prop(&a, "background") {
            ctx.background = Some(color(bg, [0.0; 3]));
        }
        for c in tree.get("c").items().iter() {
            self.walk(c, &IDENTITY, ("", ""), 0, &mut ctx);
        }
        // the camera: React Three Fiber's default is fov 75 at [0, 0, 5]
        let (cm, ca) = ctx.cam.clone().unwrap_or((gltf::compose([0.0, 0.0, 5.0], [0.0, 0.0, 0.0, 1.0], [1.0; 3]), Json::Obj(Vec::new())));
        let eye = [cm[12], cm[13], cm[14]];
        let mut f = norm([-cm[8], -cm[9], -cm[10]]);
        let mut up = norm([cm[4], cm[5], cm[6]]);
        if let Some(Json::Arr(u)) = prop(&ca, "up") {
            if u.len() >= 3 { up = norm([u[0].as_num(0.0) as f32, u[1].as_num(1.0) as f32, u[2].as_num(0.0) as f32]); }
        }
        if let Some(look) = prop(&ca, "lookAt").and_then(arr3) {
            let d = norm(sub(look, eye));
            if dot(d, d) > 0.5 {
                f = d;
                if prop(&ca, "up").is_none() { up = [0.0, 1.0, 0.0]; }
            }
        }
        let mut r = norm(cross(f, up));
        if dot(r, r) < 0.5 {
            r = norm(cross(f, [0.0, 0.0, -1.0]));
        }
        let u = cross(r, f);
        let fov = pnum(&ca, "fov", 75.0);
        let focal = (h / 2.0) / (fov.to_radians() / 2.0).tan();
        let near = pnum(&ca, "near", 0.1).max(0.01);
        let far = pnum(&ca, "far", 1000.0);
        let cam = Cam { eye, r, u, f, focal, w, h, cx: w / 2.0, cy: h / 2.0, near, far };
        self.owners = std::mem::take(&mut ctx.owners);
        self.rig = Some((eye, r, u, f, near, far));
        if self.eyes_only {
            self.last = Some(ctx);
            return;
        }
        self.draw_view(&ctx, cam, gl, true, out, tris);
        self.last = Some(ctx);
    }

    /// The game camera (the VR rig): position, right, up, forward.
    pub fn rig(&self) -> Option<([f64; 3], [f64; 3], [f64; 3], [f64; 3])> {
        let d = |v: V3| [v[0] as f64, v[1] as f64, v[2] as f64];
        self.rig.map(|(e, r, u, f, _, _)| (d(e), d(r), d(u), d(f)))
    }

    /// The last frame's world for one VR eye: its triangles into `tris` (the
    /// eye's units, `Eye::size`). The first eye's are what rays pick.
    pub fn render_eye(&mut self, eye: &crate::xr::Eye, first: bool, tris: &mut Vec<f32>) {
        let (near, far) = match self.rig { Some((_, _, _, _, n, f)) => (n, f), None => return };
        let ctx = match self.last.take() { Some(c) => c, None => return };
        let g = |v: [f64; 3]| [v[0] as f32, v[1] as f32, v[2] as f32];
        let (w, h) = eye.size();
        let (cx, cy) = eye.centre();
        let cam = Cam { eye: g(eye.pos), r: g(eye.r), u: g(eye.u), f: g(eye.f), focal: crate::xr::K as f32, w: w as f32, h: h as f32, cx: cx as f32, cy: cy as f32, near, far };
        let mut out = DrawStream::new();
        if first {
            self.draw_view(&ctx, cam, true, false, &mut out, tris);
        } else {
            // the second eye picks nothing (the first eye's picks stay)
            let (pick, owners) = (std::mem::take(&mut self.pick), std::mem::take(&mut self.pick_owner));
            let c0 = self.cam;
            self.draw_view(&ctx, cam, true, false, &mut out, tris);
            self.pick = pick;
            self.pick_owner = owners;
            self.cam = c0;
        }
        self.last = Some(ctx);
    }

    /// The objects a ray of the world meets, nearest first (as `raycast`).
    pub fn raycast_ray(&self, o: [f64; 3], d: [f64; 3]) -> Vec<Json> {
        let g = |v: [f64; 3]| [v[0] as f32, v[1] as f32, v[2] as f32];
        let near = self.rig.map(|r| r.4).unwrap_or(0.01);
        self.hits(g(o), norm(g(d)), near.min(0.01))
    }

    /// Draws the walked tree for one camera: triangles into `tris` (GL) or
    /// sorted polygons into `out`; picks for raycasts. `keep`: kept models'
    /// triangles may be reused (a still camera).
    fn draw_view(&mut self, ctx: &Ctx, cam: Cam, gl: bool, keep: bool, out: &mut DrawStream, tris: &mut Vec<f32>) {
        self.cam = Some(cam);
        self.pick.clear();
        self.pick_owner.clear();
        let Cam { eye, r, u, f, focal, w, h, cx, cy, near, far } = cam;

        // background
        if let Some(bg) = ctx.background {
            let c = [to_srgb(bg[0]), to_srgb(bg[1]), to_srgb(bg[2])];
            if gl {
                for &(x, y) in [(0.0, 0.0), (w, 0.0), (w, h), (0.0, 0.0), (w, h), (0.0, h)].iter() {
                    tris.extend_from_slice(&[x, y, 1.0, c[0], c[1], c[2]]);
                }
            } else {
                out.raw(0, 0.0, 0.0, w as f64, h as f64, [c[0] as f64, c[1] as f64, c[2] as f64], None, &[]);
            }
        }

        const DN: f32 = 0.2;
        const DF: f32 = 2000.0;
        let depth = |z: f32| ((1.0 / DN - 1.0 / z.max(DN)) / (1.0 / DN - 1.0 / DF)).clamp(0.0, 1.0);
        let lights = &ctx.lights;
        let fog = ctx.fog;
        let shade = |p: V3, n: V3, base: V3, em: V3, kind: u8| -> V3 {
            let lit = match kind {
                1 => base,
                2 => [n[0] * 0.5 + 0.5, n[1] * 0.5 + 0.5, n[2] * 0.5 + 0.5].map(to_linear),
                _ => {
                    let mut l = [0.0f32; 3];
                    for li in lights.iter() {
                        let k: V3 = match li.kind {
                            LightKind::Ambient => [li.color[0] * li.intensity, li.color[1] * li.intensity, li.color[2] * li.intensity],
                            LightKind::Directional => { let d = dot(n, li.v).max(0.0) * li.intensity; [li.color[0] * d, li.color[1] * d, li.color[2] * d] }
                            LightKind::Hemisphere => {
                                let t = dot(n, li.v) * 0.5 + 0.5;
                                let c = [li.ground[0] + (li.color[0] - li.ground[0]) * t, li.ground[1] + (li.color[1] - li.ground[1]) * t, li.ground[2] + (li.color[2] - li.ground[2]) * t];
                                [c[0] * li.intensity, c[1] * li.intensity, c[2] * li.intensity]
                            }
                            LightKind::Point => {
                                let d = sub(li.v, p);
                                let dist = dot(d, d).sqrt().max(1e-4);
                                let mut fall = 1.0 / dist.powf(li.decay).max(0.01);
                                if li.distance > 0.0 {
                                    let x = (1.0 - (dist / li.distance).powi(4)).clamp(0.0, 1.0);
                                    fall *= x * x;
                                }
                                let k = dot(n, [d[0] / dist, d[1] / dist, d[2] / dist]).max(0.0) * li.intensity * fall;
                                [li.color[0] * k, li.color[1] * k, li.color[2] * k]
                            }
                        };
                        l = [l[0] + k[0], l[1] + k[1], l[2] + k[2]];
                    }
                    [base[0] * l[0] + em[0], base[1] * l[1] + em[1], base[2] * l[2] + em[2]]
                }
            };
            let mut c = lit;
            if let Some((fc, fnear, ffar)) = fog {
                let dz = sub(p, eye);
                let dist = dot(dz, dz).sqrt();
                let k = ((dist - fnear) / (ffar - fnear).max(1e-4)).clamp(0.0, 1.0);
                c = [c[0] + (fc[0] - c[0]) * k, c[1] + (fc[1] - c[1]) * k, c[2] + (fc[2] - c[2]) * k];
            }
            [to_srgb(c[0]), to_srgb(c[1]), to_srgb(c[2])]
        };
        // painter polygons: (depth, corners x y, colour)
        let mut polys: Vec<(i32, f32, Vec<f32>, V3)> = Vec::new();
        // toon materials: the strongest directional light is the key, cut
        // into bands; ambient and hemisphere light are a flat fill under it
        let key: Option<(V3, V3)> = lights.iter().filter(|l| matches!(l.kind, LightKind::Directional))
            .max_by(|a, b| a.intensity.partial_cmp(&b.intensity).unwrap_or(std::cmp::Ordering::Equal))
            .map(|l| (l.v, [l.color[0] * l.intensity, l.color[1] * l.intensity, l.color[2] * l.intensity]));
        let fill: V3 = lights.iter().fold([0.0f32; 3], |s, l| match l.kind {
            LightKind::Ambient => [s[0] + l.color[0] * l.intensity, s[1] + l.color[1] * l.intensity, s[2] + l.color[2] * l.intensity],
            LightKind::Hemisphere => {
                let k = l.intensity * 0.5;
                [s[0] + (l.color[0] + l.ground[0]) * k, s[1] + (l.color[1] + l.ground[1]) * k, s[2] + (l.color[2] + l.ground[2]) * k]
            }
            _ => s,
        });
        let toon_col = |tn: &Toon, p: V3, base: V3, em: V3, cls: (usize, bool, bool)| -> V3 {
            let kc = key.map(|k| k.1).unwrap_or([0.0; 3]);
            let level = tn.levels[cls.0];
            let mut c = [0.0f32; 3];
            for i in 0..3 {
                c[i] = base[i] * (fill[i] * tn.shadow[i] + kc[i] * level) + em[i];
                if cls.1 {
                    c[i] += tn.spec_col[i] * kc[i];
                }
                if cls.2 {
                    c[i] += tn.rim_col[i];
                }
            }
            if let Some((fc, fnear, ffar)) = fog {
                let dz = sub(p, eye);
                let k = ((dot(dz, dz).sqrt() - fnear) / (ffar - fnear).max(1e-4)).clamp(0.0, 1.0);
                c = [c[0] + (fc[0] - c[0]) * k, c[1] + (fc[1] - c[1]) * k, c[2] + (fc[2] - c[2]) * k];
            }
            [to_srgb(c[0]), to_srgb(c[1]), to_srgb(c[2])]
        };
        // one polygon in view space (a colour a corner, at most 6 corners):
        // clipped against the near plane, projected and put into tris (GL)
        // or polys (the painter); false when it is off the screen
        let put = |pv: &[V3], pc: &[V3], order: i32, tris: &mut Vec<f32>, polys: &mut Vec<(i32, f32, Vec<f32>, V3)>| -> bool {
            let mut poly: [(V3, V3); 8] = [([0.0; 3], [0.0; 3]); 8];
            let mut np = 0;
            let m = pv.len().min(6);
            for i in 0..m {
                let (p, pcol) = (pv[i], pc[i]);
                let (q, qcol) = (pv[(i + 1) % m], pc[(i + 1) % m]);
                if p[2] >= near {
                    poly[np] = (p, pcol);
                    np += 1;
                }
                if (p[2] >= near) != (q[2] >= near) {
                    let k = (near - p[2]) / (q[2] - p[2]);
                    let lerp = |x: V3, y: V3| [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
                    poly[np] = (lerp(p, q), lerp(pcol, qcol));
                    np += 1;
                }
            }
            if np < 3 {
                return false;
            }
            let mut scr: [(f32, f32, f32, V3); 8] = [(0.0, 0.0, 0.0, [0.0; 3]); 8];
            for i in 0..np {
                let (p, c) = poly[i];
                scr[i] = (cx + p[0] / p[2] * focal, cy - p[1] / p[2] * focal, p[2], c);
            }
            let scr = &scr[..np];
            let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            for s in scr.iter() {
                x0 = x0.min(s.0); x1 = x1.max(s.0); y0 = y0.min(s.1); y1 = y1.max(s.1);
            }
            if x1 < 0.0 || y1 < 0.0 || x0 > w || y0 > h {
                return false;
            }
            if gl {
                // renderOrder 1000 and up: an overlay (a construction sketch over
                // the figure), drawn in front of everything, in its own depth order
                let over = order >= 1000;
                for k in 1..scr.len() - 1 {
                    for s in [scr[0], scr[k], scr[k + 1]].iter() {
                        let d = if over { depth(s.2) * 0.001 } else { depth(s.2) };
                        tris.extend_from_slice(&[s.0, s.1, d, s.3[0], s.3[1], s.3[2]]);
                    }
                }
            } else {
                let mut pts = Vec::with_capacity(scr.len() * 2);
                let mut zsum = 0.0;
                let mut cs = [0.0f32; 3];
                for s in scr.iter() {
                    pts.push(s.0);
                    pts.push(s.1);
                    zsum += s.2;
                    cs = [cs[0] + s.3[0], cs[1] + s.3[1], cs[2] + s.3[2]];
                }
                let k = 1.0 / scr.len() as f32;
                polys.push((order, zsum * k, crate::scene3d::grow(pts), [cs[0] * k, cs[1] * k, cs[2] * k]));
            }
            true
        };
        // one item's triangles: into tris (GL) or polys (the painter), and pick
        let draw = |it: &Item, tris: &mut Vec<f32>, polys: &mut Vec<(i32, f32, Vec<f32>, V3)>, pick: &mut Vec<[V3; 3]>, pick_owner: &mut Vec<u32>| -> usize {
            let mut n = 0;
            // each corner in view space and lit once
            let view: Vec<V3> = it.pos.iter().map(|p| { let d = sub(*p, eye); [dot(d, r), dot(d, u), dot(d, f)] }).collect();
            if let Some(ws) = &it.brush {
                let c = it.col[0];
                let col = [to_srgb(c[0]), to_srgb(c[1]), to_srgb(c[2])];
                for q in brush_ribbon(&view, ws, focal, near, cx, cy) {
                    if put(&q, &[col; 4], it.order, tris, polys) {
                        n += 1;
                    }
                }
                return n;
            }
            // corners are lit when a front face first needs them: about half
            // of a model's faces look away and are never lit
            let toon = it.toon.filter(|t| it.kind == 0 && t.lit);
            let mut vcol: Vec<V3> = if it.flat || toon.is_some() { Vec::new() } else { vec![[-1.0; 3]; it.pos.len()] };
            for t in it.tris.chunks(3) {
                let (ia, ib, ic) = (t[0] as usize, t[1] as usize, t[2] as usize);
                let (a, b, c) = (it.pos[ia], it.pos[ib], it.pos[ic]);
                let fnrm = norm(cross(sub(b, a), sub(c, a)));
                let towards = sub(a, eye);
                let back = dot(fnrm, towards) > 0.0;
                if back && !it.double {
                    continue;
                }
                let (va, vb, vc) = (view[ia], view[ib], view[ic]);
                if va[2] < near && vb[2] < near && vc[2] < near {
                    continue;
                }
                if va[2] > far && vb[2] > far && vc[2] > far {
                    continue;
                }
                pick.push([a, b, c]);
                pick_owner.push(it.owner);
                if let Some(tn) = toon {
                    // cel shading: the key light's n·l at each corner, the
                    // triangle cut along the bands' edges, each piece one flat colour
                    let nv = if it.flat || back {
                        let fl = if back { [-fnrm[0], -fnrm[1], -fnrm[2]] } else { fnrm };
                        [fl, fl, fl]
                    } else {
                        [it.nrm[ia], it.nrm[ib], it.nrm[ic]]
                    };
                    let kd = key.map(|k| k.0).unwrap_or([0.0, 1.0, 0.0]);
                    let corner = |i: usize, nn: V3| -> [f32; 3] {
                        let v = norm(sub(eye, it.pos[i]));
                        let hv = norm([kd[0] + v[0], kd[1] + v[1], kd[2] + v[2]]);
                        [dot(nn, kd), dot(nn, hv), 1.0 - dot(nn, v).max(0.0)]
                    };
                    let tri: ToonPoly = vec![(va, corner(ia, nv[0])), (vb, corner(ib, nv[1])), (vc, corner(ic, nv[2]))];
                    let base = { let (x, y, z) = (it.col[ia], it.col[ib], it.col[ic]); [(x[0] + y[0] + z[0]) / 3.0, (x[1] + y[1] + z[1]) / 3.0, (x[2] + y[2] + z[2]) / 3.0] };
                    let centre = [(a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0, (a[2] + b[2] + c[2]) / 3.0];
                    let mut pieces = Vec::new();
                    toon_pieces(&tn, tri, &mut pieces);
                    let mut any = false;
                    for (piece, cls) in pieces.iter() {
                        let col = toon_col(&tn, centre, base, it.emissive, *cls);
                        let pv: Vec<V3> = piece.iter().map(|q| q.0).collect();
                        any |= put(&pv, &vec![col; pv.len()], it.order, tris, polys);
                    }
                    if any {
                        n += 1;
                    }
                    continue;
                }
                let cols: [V3; 3] = if it.flat || back {
                    let nn = if back { [-fnrm[0], -fnrm[1], -fnrm[2]] } else { fnrm };
                    let centre = [(a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0, (a[2] + b[2] + c[2]) / 3.0];
                    let k = shade(centre, nn, it.col[ia], it.emissive, it.kind);
                    [k, k, k]
                } else {
                    for &i in [ia, ib, ic].iter() {
                        if vcol[i][0] < 0.0 {
                            vcol[i] = shade(it.pos[i], it.nrm[i], it.col[i], it.emissive, it.kind);
                        }
                    }
                    [vcol[ia], vcol[ib], vcol[ic]]
                };
                if put(&[va, vb, vc], &cols, it.order, tris, polys) {
                    n += 1;
                }
            }
            // the outline (inverted hull): the corners pushed out along their
            // normals by `line` units on the screen, and only the faces that
            // then look away drawn, in the line colour, behind the surface:
            // what shows round the edge of the shape is the line
            if let Some(tn) = it.toon.filter(|t| t.line > 0.0) {
                let lc = [to_srgb(tn.line_col[0]), to_srgb(tn.line_col[1]), to_srgb(tn.line_col[2])];
                let hull: Vec<V3> = it.pos.iter().zip(view.iter()).zip(it.nrm.iter()).map(|((p, v), nn)| {
                    let off = tn.line * v[2].max(near) / focal;
                    [p[0] + nn[0] * off, p[1] + nn[1] * off, p[2] + nn[2] * off]
                }).collect();
                for t in it.tris.chunks(3) {
                    let (ia, ib, ic) = (t[0] as usize, t[1] as usize, t[2] as usize);
                    let (a, b, c) = (hull[ia], hull[ib], hull[ic]);
                    if dot(cross(sub(b, a), sub(c, a)), sub(a, eye)) <= 0.0 {
                        continue;
                    }
                    let tv = |p: V3| { let d = sub(p, eye); [dot(d, r), dot(d, u), dot(d, f)] };
                    let (va, vb, vc) = (tv(a), tv(b), tv(c));
                    if (va[2] < near && vb[2] < near && vc[2] < near) || (va[2] > far && vb[2] > far && vc[2] > far) {
                        continue;
                    }
                    put(&[va, vb, vc], &[lc; 3], it.order, tris, polys);
                }
            }
            n
        };
        // what the view and the lights are this frame: a kept model is good while they stay
        let frame_key = {
            use std::hash::{Hash, Hasher};
            let mut hs = std::collections::hash_map::DefaultHasher::new();
            for v in eye.iter().chain(r.iter()).chain(u.iter()).chain(f.iter()) { v.to_bits().hash(&mut hs); }
            for v in [focal, w, h, near, far] { v.to_bits().hash(&mut hs); }
            for li in lights.iter() {
                for v in li.color.iter().chain(li.ground.iter()).chain(li.v.iter()) { v.to_bits().hash(&mut hs); }
                for v in [li.intensity, li.decay, li.distance] { v.to_bits().hash(&mut hs); }
            }
            if let Some((fc, a, b)) = fog { for v in fc.iter() { v.to_bits().hash(&mut hs); } a.to_bits().hash(&mut hs); b.to_bits().hash(&mut hs); }
            hs.finish()
        };
        // the view's sides as cones around the camera: a sphere (centre and
        // radius in the model, placed by m) is in view unless it is wholly
        // behind, beyond `far` or outside a side
        let (tx, ty) = (cx.max(w - cx) / focal, cy.max(h - cy) / focal);
        let (kx, ky) = ((1.0 + tx * tx).sqrt(), (1.0 + ty * ty).sqrt());
        let in_view = |b: &([f32; 3], f32), m: &M4| -> bool {
            if b.1 <= 0.0 {
                return true;
            }
            let c = gltf::transform_point(m, b.0);
            let sc = (m[0] * m[0] + m[1] * m[1] + m[2] * m[2]).max(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]).max(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]).sqrt();
            let rad = b.1 * sc;
            let d = sub(c, eye);
            let (x, y, z) = (dot(d, r), dot(d, u), dot(d, f));
            if z + rad < near || z - rad > far {
                return false;
            }
            !(x - rad * kx > tx * z || x + rad * kx < -tx * z || y - rad * ky > ty * z || y + rad * ky < -ty * z)
        };
        let mut kept = std::mem::take(&mut self.kept);
        let mut kept_now: HashMap<u64, Kept> = HashMap::new();
        let mut pick = std::mem::take(&mut self.pick);
        let mut pick_owner = std::mem::take(&mut self.pick_owner);
        let mut drawn = 0;
        for it in ctx.items.iter() {
            let mi = match &it.model {
                Some(mi) => mi,
                None => {
                    drawn += draw(it, tris, &mut polys, &mut pick, &mut pick_owner);
                    continue;
                }
            };
            // a model wholly outside the view is not posed or drawn (nor picked)
            if !in_view(&mi.asset.bound, &mi.m) {
                continue;
            }
            if gl && keep {
                if let Some(k) = kept.remove(&it.key) {
                    if k.frame == frame_key {
                        tris.extend_from_slice(&k.tris);
                        for p in k.pick.iter() {
                            pick.push(*p);
                            pick_owner.push(it.owner);
                        }
                        drawn += k.drawn;
                        kept_now.insert(it.key, k);
                        continue;
                    }
                }
            }
            let mut sub = Vec::new();
            model_items(mi, eye, key.map(|k| k.0), it.owner, &mut sub);
            let (t0, p0, d0) = (tris.len(), pick.len(), drawn);
            for s in sub.iter_mut() {
                s.order = it.order;
                drawn += draw(s, tris, &mut polys, &mut pick, &mut pick_owner);
            }
            if gl && keep {
                kept_now.insert(it.key, Kept { frame: frame_key, tris: tris[t0..].to_vec(), pick: pick[p0..].to_vec(), drawn: drawn - d0 });
            }
        }
        if keep {
            self.kept = kept_now;
        } else {
            self.kept = kept;
        }
        self.pick = pick;
        self.pick_owner = pick_owner;
        if !gl {
            polys.sort_by(|a, b| a.0.cmp(&b.0).then(b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)));
            let mut i = 0;
            while i < polys.len() {
                let key = crate::scene3d::q([polys[i].3[0] as f64, polys[i].3[1] as f64, polys[i].3[2] as f64]);
                let mut j = i;
                let mut pts: Vec<f32> = Vec::new();
                let mut ends: Vec<f32> = Vec::new();
                while j < polys.len() && crate::scene3d::q([polys[j].3[0] as f64, polys[j].3[1] as f64, polys[j].3[2] as f64]) == key && j - i < 24 {
                    pts.extend_from_slice(&polys[j].2);
                    ends.push(pts.len() as f32);
                    j += 1;
                }
                out.raw_rings(crate::scene3d::rgb_f(key), &pts, &ends);
                i = j;
            }
        }
        self.drawn = drawn;
    }
}

/// A brush stroke as quads in view space. The control points (view space)
/// are projected; a Catmull-Rom curve runs through them on the screen, cut
/// into steps a few pixels long, so it stays smooth at any size; its width
/// (model units, so it scales with the drawing) goes linearly between the
/// points' widths. Each step is a quad across the curve; widths of 0 at the
/// ends make the sharp tips of a brush.
fn brush_ribbon(view: &[V3], ws: &[f32], focal: f32, near: f32, cx: f32, cy: f32) -> Vec<[V3; 4]> {
    let mut out = Vec::new();
    let n = view.len();
    if n < 2 || view.iter().any(|v| v[2] < near) {
        return out;
    }
    // screen x, y; depth; width in pixels
    let sp: Vec<(f32, f32, f32, f32)> = view.iter().zip(ws.iter()).map(|(v, w)| (cx + v[0] / v[2] * focal, cy - v[1] / v[2] * focal, v[2], w * focal / v[2])).collect();
    let mut samples: Vec<(f32, f32, f32, f32)> = Vec::new();
    for i in 0..n - 1 {
        let p0 = sp[i.saturating_sub(1)];
        let (p1, p2) = (sp[i], sp[i + 1]);
        let p3 = sp[(i + 2).min(n - 1)];
        let len = ((p2.0 - p1.0).powi(2) + (p2.1 - p1.1).powi(2)).sqrt();
        let steps = ((len / 3.0).ceil() as usize).clamp(1, 32);
        for k in 0..steps {
            let t = k as f32 / steps as f32;
            let (t2, t3) = (t * t, t * t * t);
            let cr = |a: f32, b: f32, c: f32, d: f32| 0.5 * (2.0 * b + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3);
            samples.push((cr(p0.0, p1.0, p2.0, p3.0), cr(p0.1, p1.1, p2.1, p3.1), p1.2 + (p2.2 - p1.2) * t, p1.3 + (p2.3 - p1.3) * t));
        }
    }
    samples.push(sp[n - 1]);
    let m = samples.len();
    let un = |x: f32, y: f32, z: f32| -> V3 { [(x - cx) * z / focal, (cy - y) * z / focal, z] };
    let side = |i: usize| -> (V3, V3) {
        let a = samples[i.saturating_sub(1)];
        let b = samples[(i + 1).min(m - 1)];
        let (mut tx, mut ty) = (b.0 - a.0, b.1 - a.1);
        let l = (tx * tx + ty * ty).sqrt().max(1e-6);
        tx /= l;
        ty /= l;
        let s = samples[i];
        let h = s.3 * 0.5;
        (un(s.0 - ty * h, s.1 + tx * h, s.2), un(s.0 + ty * h, s.1 - tx * h, s.2))
    };
    let mut prev = side(0);
    for i in 1..m {
        let cur = side(i);
        out.push([prev.0, prev.1, cur.1, cur.0]);
        prev = cur;
    }
    out
}

/// Ink lines: a comic artist's brush line drawn on a 3D surface. The
/// contour is where the surface turns from facing the eye to facing away:
/// n·v is worked out at the corners and its zero found inside the
/// triangles (a smooth curve, not the jagged edges between faces), the
/// crossings chained into strokes and evened out. Each stroke is a brush
/// stroke (see `brush_ribbon`): `ink` wide, thicker where the surface turns
/// away from the key light and thinner where the light falls (`ink_var`),
/// tapered to points at open ends; set a little towards the eye so that the
/// surface it outlines does not cover it. Inner contours (an arm in front of
/// the body, a cheek's edge) come out the same way; what is behind another
/// surface is hidden by the depth test.
fn ink_lines(pos: &[V3], nrm: &[V3], tris: &[u32], eye: V3, light: Option<V3>, tn: &Toon) -> Vec<(Vec<V3>, Vec<f32>)> {
    let n = pos.len();
    let mut out = Vec::new();
    if n == 0 || tris.len() < 3 {
        return out;
    }
    // corners at the same place are one (a flat-shaded or seamed mesh has a
    // corner a face there): their normals averaged, their edges shared
    let mut weld: HashMap<[i32; 3], u32> = HashMap::new();
    let mut wid = vec![0u32; n];
    let mut wn: Vec<V3> = Vec::new();
    let mut wp: Vec<V3> = Vec::new();
    for i in 0..n {
        let k = [(pos[i][0] * 1e4).round() as i32, (pos[i][1] * 1e4).round() as i32, (pos[i][2] * 1e4).round() as i32];
        let id = *weld.entry(k).or_insert_with(|| { wn.push([0.0; 3]); wp.push(pos[i]); (wn.len() - 1) as u32 });
        wid[i] = id;
        let s = &mut wn[id as usize];
        *s = [s[0] + nrm[i][0], s[1] + nrm[i][1], s[2] + nrm[i][2]];
    }
    let (pos, nrm): (&[V3], Vec<V3>) = (&wp, wn.iter().map(|v| norm(*v)).collect());
    let tris: Vec<u32> = tris.iter().map(|&t| wid[t as usize]).collect();
    let n = pos.len();
    let g: Vec<f32> = (0..n).map(|i| dot(nrm[i], norm(sub(eye, pos[i])))).collect();
    // one point where n·v = 0 on each crossed edge, and its neighbours along the contour
    let mut at: HashMap<(u32, u32), usize> = HashMap::new();
    let mut pts: Vec<(V3, V3)> = Vec::new();
    let mut nb: Vec<[usize; 2]> = Vec::new();
    let mut deg: Vec<u8> = Vec::new();
    const NONE: usize = usize::MAX;
    for t in tris.chunks_exact(3) {
        let mut cr = [NONE; 2];
        let mut k = 0;
        for e in 0..3 {
            let (a, b) = (t[e], t[(e + 1) % 3]);
            let (ga, gb) = (g[a as usize], g[b as usize]);
            if (ga < 0.0) == (gb < 0.0) {
                continue;
            }
            let key = if a < b { (a, b) } else { (b, a) };
            let id = *at.entry(key).or_insert_with(|| {
                let s = ga / (ga - gb);
                let (pa, pb) = (pos[a as usize], pos[b as usize]);
                let (na, nb_) = (nrm[a as usize], nrm[b as usize]);
                let lp = |x: V3, y: V3| [x[0] + (y[0] - x[0]) * s, x[1] + (y[1] - x[1]) * s, x[2] + (y[2] - x[2]) * s];
                pts.push((lp(pa, pb), norm(lp(na, nb_))));
                nb.push([NONE; 2]);
                deg.push(0);
                pts.len() - 1
            });
            if k < 2 {
                cr[k] = id;
                k += 1;
            }
        }
        if k == 2 && cr[0] != cr[1] {
            for (x, y) in [(cr[0], cr[1]), (cr[1], cr[0])] {
                if deg[x] < 2 {
                    nb[x][deg[x] as usize] = y;
                    deg[x] += 1;
                }
            }
        }
    }
    // chains: from the open ends first, then the closed loops
    let mut seen = vec![false; pts.len()];
    let mut chains: Vec<(Vec<usize>, bool)> = Vec::new();
    for pass in 0..2 {
        for s0 in 0..pts.len() {
            if seen[s0] || (pass == 0 && deg[s0] != 1) {
                continue;
            }
            let mut c = vec![s0];
            seen[s0] = true;
            let mut cur = s0;
            loop {
                let next = nb[cur].iter().copied().find(|&x| x != NONE && !seen[x]);
                match next {
                    Some(x) => { seen[x] = true; c.push(x); cur = x; }
                    None => break,
                }
            }
            let closed = pass == 1 && c.len() > 2 && nb[cur].contains(&s0);
            chains.push((c, closed));
        }
    }
    let w0 = tn.ink;
    for (c, closed) in chains {
        let mut p: Vec<V3> = c.iter().map(|&i| pts[i].0).collect();
        let q: Vec<V3> = c.iter().map(|&i| pts[i].1).collect();
        let m = p.len();
        if m < 3 {
            continue;
        }
        // evened out (twice: the crossings zigzag a little from face to face)
        for _ in 0..2 {
            let prev = p.clone();
            for i in 0..m {
                if !closed && (i == 0 || i == m - 1) {
                    continue;
                }
                let (a, b) = (prev[(i + m - 1) % m], prev[(i + 1) % m]);
                p[i] = [(a[0] + b[0]) * 0.25 + prev[i][0] * 0.5, (a[1] + b[1]) * 0.25 + prev[i][1] * 0.5, (a[2] + b[2]) * 0.25 + prev[i][2] * 0.5];
            }
        }
        // length along the stroke; short bits are noise
        let mut s = vec![0.0f32; m];
        for i in 1..m {
            let d = sub(p[i], p[i - 1]);
            s[i] = s[i - 1] + dot(d, d).sqrt();
        }
        let total = s[m - 1];
        if total < w0 * 5.0 {
            continue;
        }
        // control points about 1.5 widths apart (the ribbon's curve runs through them)
        let step = w0 * 1.5;
        let mut keep = vec![0usize];
        for i in 1..m - 1 {
            if s[i] - s[*keep.last().unwrap()] >= step {
                keep.push(i);
            }
        }
        keep.push(m - 1);
        if closed {
            keep.push(0);
        }
        let taper = (total * 0.3).min(w0 * 14.0);
        let mut cp = Vec::with_capacity(keep.len());
        let mut ws = Vec::with_capacity(keep.len());
        for (k, &i) in keep.iter().enumerate() {
            let lam = light.map(|l| dot(q[i], l)).unwrap_or(0.0);
            let mut wv = w0 * (1.0 - tn.ink_var * lam).clamp(0.3, 1.8);
            if !closed {
                let e = s[i].min(total - s[i]);
                let x = (e / taper).clamp(0.0, 1.0);
                wv *= x * x * (3.0 - 2.0 * x) * 0.9 + if k == 0 || k == keep.len() - 1 { 0.0 } else { 0.1 };
            }
            let to = norm(sub(eye, p[i]));
            let off = w0 * 2.5;
            cp.push([p[i][0] + to[0] * off, p[i][1] + to[1] * off, p[i][2] + to[2] * off]);
            ws.push(wv);
        }
        out.push((cp, ws));
    }
    out
}

/// A feature's art made ready to draw: its fills' triangles, and for a
/// drawing with depth each point's depth (features.rs `Depth`).
struct FeatArt {
    art: crate::features::Art,
    at: [f32; 3],
    tris: Vec<Vec<u32>>,
    rot: [f32; 4],
    fz: Vec<Vec<f32>>,
    sz: Vec<Vec<f32>>,
    /// each point's share of the bone's own turn (Depth `pin`); empty: all of it
    fw: Vec<Vec<f32>>,
    sw: Vec<Vec<f32>>,
    depth: bool,
    /// the turn of the head (degrees about the bone's up, + towards the
    /// bone's +x) the drawing shows: a feature's views are drawings of it from
    /// other angles, and the nearest one is drawn
    yaw: f32,
    /// the look: how far the iris moves (metres, x and y) and the convex
    /// shape it stays in
    gaze: Option<([f32; 2], Vec<[f32; 2]>)>,
}

thread_local! {
    /// a feature's art and its fills' triangles, made once per feature (keyed
    /// by where its JSON lives, which is the loaded model's and does not move)
    static FEATURE_ART: std::cell::RefCell<std::collections::HashMap<usize, Rc<FeatArt>>> = std::cell::RefCell::new(std::collections::HashMap::new());
}

/// `f` is the feature or one of its views (which take what they leave out from the feature)
fn feature_art(f: &rg_core::json::Json, base: &rg_core::json::Json) -> Option<Rc<FeatArt>> {
    let key = f as *const rg_core::json::Json as usize;
    if let Some(hit) = FEATURE_ART.with(|c| c.borrow().get(&key).cloned()) {
        return Some(hit);
    }
    let get = |k: &str| { let v = f.get(k); if v.is_null() { base.get(k) } else { v } };
    let (art, _) = if std::ptr::eq(f, base) { crate::features::art(f)? } else { (crate::features::drawing(f), [0.0; 3]) };
    let at = { let v: Vec<f32> = base.get("at").items().iter().map(|x| x.as_num(0.0) as f32).collect(); if v.len() == 3 { [v[0], v[1], v[2]] } else { [0.0; 3] } };
    let tris = art.fills.iter().map(|fl| crate::features::triangulate(&fl.pts).into_iter().flat_map(|t| [t[0] as u32, t[1] as u32, t[2] as u32]).collect()).collect();
    // the plane the feature is drawn in, turned from the bone's by `rot` (a quaternion x, y, z, w)
    let r: Vec<f32> = get("rot").items().iter().map(|v| v.as_num(0.0) as f32).collect();
    let rot = if r.len() == 4 { [r[0], r[1], r[2], r[3]] } else { [0.0, 0.0, 0.0, 1.0] };
    let dj = get("depth");
    let dep = crate::features::Depth::from_json(&dj);
    let (fz, sz) = match &dep {
        Some(d) => (art.fills.iter().map(|fl| fl.pts.iter().map(|p| d.z(*p)).collect()).collect(), art.strokes.iter().map(|st| st.pts.iter().map(|p| d.z(*p)).collect()).collect()),
        None => (Vec::new(), Vec::new()),
    };
    let (fw, sw) = match &dep {
        Some(d) if d.pin.is_some() => (art.fills.iter().map(|fl| fl.pts.iter().map(|p| d.weight(*p)).collect()).collect(), art.strokes.iter().map(|st| st.pts.iter().map(|p| d.weight(*p)).collect()).collect()),
        _ => (Vec::new(), Vec::new()),
    };
    let gj = get("gaze");
    let gaze = if gj.is_null() { None } else {
        let rg: Vec<f32> = gj.get("range").items().iter().map(|x| x.as_num(0.0) as f32).collect();
        let clip: Vec<[f32; 2]> = gj.get("clip").items().iter().map(|p| { let v = p.items(); [v.first().map(|x| x.as_num(0.0)).unwrap_or(0.0) as f32, v.get(1).map(|x| x.as_num(0.0)).unwrap_or(0.0) as f32] }).collect();
        Some(([rg.first().copied().unwrap_or(0.0), rg.get(1).copied().unwrap_or(0.0)], clip))
    };
    let v = Rc::new(FeatArt { art, at, tris, rot, fz, sz, fw, sw, depth: dep.is_some(), yaw: f.get("yaw").as_num(0.0) as f32, gaze });
    FEATURE_ART.with(|c| c.borrow_mut().insert(key, v.clone()));
    Some(v)
}

/// A model's triangles in the world for a mix of clips, skinned where it has
/// a skin; `tint` multiplies its colours.
fn model_items(mi: &ModelInst, eye: V3, light: Option<V3>, owner: u32, items: &mut Vec<Item>) {
    let (asset, m, tint, toon) = (&*mi.asset, &mi.m, mi.tint, mi.toon);
    let mut pose = gltf::pose(asset, &mi.mix);
    crate::rig::add_turns(&mut pose, &mi.turns);
    let mut wm = gltf::world_matrices(asset, &pose);
    for k in mi.ik.iter() { crate::rig::two_bone(asset, &mut pose, &mut wm, k); }
    // each skin's joint matrices: world(joint) * inverse bind
    let joints: Vec<Vec<M4>> = asset.skins.iter().map(|s| s.joints.iter().zip(s.ibm.iter()).map(|(&j, ibm)| gltf::mat_mul(m, &gltf::mat_mul(&wm[j], ibm))).collect()).collect();
    for (ni, node) in asset.nodes.iter().enumerate() {
        let mi = match node.mesh { Some(x) => x, None => continue };
        let full = gltf::mat_mul(m, &wm[ni]);
        for p in asset.meshes[mi].iter() {
            let n = p.pos.len();
            let mut pos = Vec::with_capacity(n);
            let mut nrm = Vec::with_capacity(n);
            let skin = node.skin.and_then(|s| joints.get(s)).filter(|_| p.joints.len() == n);
            match skin {
                Some(js) => {
                    for i in 0..n {
                        let (jv, wv) = (p.joints[i], p.weights[i]);
                        let mut sp = [0.0f32; 3];
                        let mut sn = [0.0f32; 3];
                        for k in 0..4 {
                            let wk = wv[k];
                            if wk <= 0.0 {
                                continue;
                            }
                            let jm = match js.get(jv[k] as usize) { Some(x) => x, None => continue };
                            let q = gltf::transform_point(jm, p.pos[i]);
                            let qn = gltf::transform_dir(jm, p.nrm[i]);
                            sp = [sp[0] + q[0] * wk, sp[1] + q[1] * wk, sp[2] + q[2] * wk];
                            sn = [sn[0] + qn[0] * wk, sn[1] + qn[1] * wk, sn[2] + qn[2] * wk];
                        }
                        pos.push(sp);
                        nrm.push(norm(sn));
                    }
                }
                None => {
                    for i in 0..n {
                        pos.push(gltf::transform_point(&full, p.pos[i]));
                        nrm.push(norm(gltf::transform_dir(&full, p.nrm[i])));
                    }
                }
            }
            let col = match tint { Some(t) => p.col.iter().map(|c| [c[0] * t[0], c[1] * t[1], c[2] * t[2]]).collect(), None => p.col.clone() };
            // a part's own material settings (extras.toon) over the model's
            let toon = toon.map(|mut t| { if !p.toon.is_null() { t.apply(&p.toon); } t });
            let kind = if p.unlit || toon.map(|t| !t.lit).unwrap_or(false) { 1 } else { 0 };
            let brush = if p.brush.is_null() { None } else {
                let w: Vec<f32> = p.brush.get("w").items().iter().map(|x| x.as_num(0.0) as f32).collect();
                if w.len() == n && n >= 2 { Some(Rc::new(w)) } else { None }
            };
            let toon = if brush.is_some() { None } else { toon };
            if let Some(tn) = toon.filter(|t| t.ink > 0.0) {
                for (pts, ws) in ink_lines(&pos, &nrm, &p.tris, eye, light, &tn) {
                    let n = pts.len();
                    items.push(Item { nrm: vec![[0.0, 0.0, 1.0]; n], col: vec![tn.ink_col; n], pos: pts, emissive: [0.0; 3], tris: Vec::new(), kind: 1, double: false, flat: true, toon: None, owner, order: 0, model: None, key: 0, brush: Some(Rc::new(ws)) });
                }
            }
            items.push(Item { pos, nrm, col, emissive: p.emissive, tris: p.tris.clone(), kind, double: p.double, flat: false, toon, owner, order: 0, model: None, key: 0, brush });
        }
    }
    // the bones' 2D features (eyes, …): drawn in each bone's plane, in front, layer by layer
    for (ni, node) in asset.nodes.iter().enumerate() {
        if node.features.is_null() {
            continue;
        }
        let full = gltf::mat_mul(m, &wm[ni]);
        // the bone where its parent has it but not turned itself (for a drawing's pinned points)
        let still = match node.parent { Some(pi) => gltf::mat_mul(m, &gltf::mat_mul(&wm[pi], &gltf::compose(node.t, node.r, node.s))), None => full };
        // the features by reference (the model's own JSON: no copy a frame, and
        // a fixed place to key their cached art by)
        let feats: &[rg_core::json::Json] = match &node.features { rg_core::json::Json::Arr(v) => v, _ => &[] };
        for f in feats.iter() {
            let base = match feature_art(f, f) { Some(x) => x, None => continue };
            // the anchor, the bone's up and forward, and the way to the camera
            let o = gltf::transform_point(&full, base.at);
            let to_eye = norm(sub(eye, o));
            // a drawing with depth is flattened along the model's forward: at rest it
            // is the drawing as drawn, and a bone's turn moves its points by depth
            let model_fwd = norm(gltf::transform_dir(m, [0.0, 0.0, 1.0]));
            // the view drawn: the one nearest the head's turn from the camera
            let mut cached = base.clone();
            let views = f.get("views");
            if base.depth && !views.items().is_empty() {
                let up = norm(gltf::transform_dir(&full, [0.0, 1.0, 0.0]));
                let fw = norm(gltf::transform_dir(&full, [0.0, 0.0, 1.0]));
                let flat = |v: V3| norm(sub(v, [up[0] * dot(v, up), up[1] * dot(v, up), up[2] * dot(v, up)]));
                let (a, b) = (flat(to_eye), flat(fw));
                let yaw = dot(cross(a, b), up).atan2(dot(a, b)).to_degrees();
                let mut best = (yaw - base.yaw).abs();
                if let rg_core::json::Json::Arr(vs) = &views {
                    for v in vs.iter() {
                        if let Some(c) = feature_art(v, f) {
                            let d = (yaw - c.yaw).abs();
                            if d < best { best = d; cached = c; }
                        }
                    }
                }
            }
            let (art, at, fill_tris, rot) = (&cached.art, cached.at, &cached.tris, cached.rot);
            let mut layer = 0.0f32;
            // how far each layer sits in front of the one under it (a drawing with
            // hundreds of layers takes a smaller step)
            let step = f.get("layerStep").as_num(0.00005) as f32;
            // a view drawn at another turn of the head is turned back by it, so that
            // the bone's turn less the view's is what moves its points
            let (vc, vs) = ((-cached.yaw).to_radians().cos(), (-cached.yaw).to_radians().sin());
            let turn = |v: V3| -> V3 {
                let v = [v[0] * vc + v[2] * vs, v[1], -v[0] * vs + v[2] * vc];
                // v rotated by the quaternion rot
                let (qx, qy, qz, qw) = (rot[0], rot[1], rot[2], rot[3]);
                let t = [2.0 * (qy * v[2] - qz * v[1]), 2.0 * (qz * v[0] - qx * v[2]), 2.0 * (qx * v[1] - qy * v[0])];
                [v[0] + qw * t[0] + (qy * t[2] - qz * t[1]), v[1] + qw * t[1] + (qz * t[0] - qx * t[2]), v[2] + qw * t[2] + (qx * t[1] - qy * t[0])]
            };
            let depth = cached.depth;
            // with depth: each point where the turned 3D thing has it, then moved
            // along the way to the camera onto the plane through the anchor
            // (where it is on the screen stays), plus its layer's step towards
            // the camera; without: in the bone's plane, layer over layer
            let place = |p: [f32; 2], zd: f32, zl: f32, wt: f32| -> V3 {
                if depth {
                    let q = turn([p[0], p[1], zd]);
                    let lp = [at[0] + q[0], at[1] + q[1], at[2] + q[2]];
                    let w = gltf::transform_point(&full, lp);
                    let w = if wt >= 1.0 { w } else { let s0 = gltf::transform_point(&still, lp); [s0[0] + (w[0] - s0[0]) * wt, s0[1] + (w[1] - s0[1]) * wt, s0[2] + (w[2] - s0[2]) * wt] };
                    let d = dot(sub(w, o), model_fwd) - zl;
                    [w[0] - model_fwd[0] * d, w[1] - model_fwd[1] * d, w[2] - model_fwd[2] * d]
                } else {
                    let q = turn([p[0], p[1], zl]);
                    gltf::transform_point(&full, [at[0] + q[0], at[1] + q[1], at[2] + q[2]])
                }
            };
            let fwd = if depth { model_fwd } else { norm(gltf::transform_dir(&full, turn([0.0, 0.0, 1.0]))) };
            // the look: the iris's shift (in the drawing's plane) towards where the
            // eyes look, from where they look at rest (the camera)
            let shift = match (&cached.gaze, mi.look) {
                (Some((range, _)), Some(look)) => {
                    let rt = norm(gltf::transform_dir(&full, turn([1.0, 0.0, 0.0])));
                    let up = norm(gltf::transform_dir(&full, turn([0.0, 1.0, 0.0])));
                    let fw = norm(gltf::transform_dir(&full, turn([0.0, 0.0, 1.0])));
                    let ang = |d: V3| { let d = norm(d); [dot(d, rt).atan2(dot(d, fw).max(0.05)), dot(d, up).atan2(dot(d, fw).max(0.05))] };
                    let (t, c) = (ang(sub(look, o)), ang(sub(eye, o)));
                    [range[0] * ((t[0] - c[0]).clamp(-1.2, 1.2)).sin(), range[1] * ((t[1] - c[1]).clamp(-1.2, 1.2)).sin()]
                }
                _ => [0.0, 0.0],
            };
            let moved = shift[0] != 0.0 || shift[1] != 0.0;
            for (k, (fl, tris)) in art.fills.iter().zip(fill_tris.iter()).enumerate() {
                layer += 1.0;
                let z = layer * step;
                let zs = cached.fz.get(k);
                let zd = |i: usize| zs.and_then(|v| v.get(i)).copied().unwrap_or(0.0);
                let ws = cached.fw.get(k);
                let wt = |i: usize| ws.and_then(|v| v.get(i)).copied().unwrap_or(1.0);
                let (pos, tris): (Vec<V3>, Vec<u32>) = if moved && art.gaze_fills.get(k).copied().unwrap_or(false) {
                    // the iris moved, kept inside the eye's shape
                    let pts: Vec<[f32; 2]> = fl.pts.iter().map(|p| [p[0] + shift[0], p[1] + shift[1]]).collect();
                    let clip = cached.gaze.as_ref().map(|g| &g.1);
                    let pts = match clip { Some(c) if c.len() >= 3 => crate::features::clip_convex(&pts, c), _ => pts };
                    if pts.len() < 3 { continue; }
                    let t = crate::features::triangulate(&pts).into_iter().flat_map(|t| [t[0] as u32, t[1] as u32, t[2] as u32]).collect();
                    (pts.iter().map(|p| place(*p, zd(0), z, wt(0))).collect(), t)
                } else {
                    (fl.pts.iter().enumerate().map(|(i, p)| place(*p, zd(i), z, wt(i))).collect(), tris.clone())
                };
                let col = match tint { Some(t) => [fl.col[0] * t[0], fl.col[1] * t[1], fl.col[2] * t[2]], None => fl.col };
                items.push(Item { nrm: vec![fwd; pos.len()], col: vec![col; pos.len()], pos, emissive: [0.0; 3], tris, kind: 1, double: false, flat: true, toon: None, owner, order: 0, model: None, key: 0, brush: None });
            }
            for (k, st) in art.strokes.iter().enumerate() {
                layer += 1.0;
                let z = layer * step;
                let zs = cached.sz.get(k);
                let ws = cached.sw.get(k);
                let g = moved && art.gaze_strokes.get(k).copied().unwrap_or(false);
                let pos: Vec<V3> = st.pts.iter().enumerate().map(|(i, p)| {
                    let p = if g { [p[0] + shift[0], p[1] + shift[1]] } else { *p };
                    place(p, zs.and_then(|v| v.get(i)).copied().unwrap_or(0.0), z, ws.and_then(|v| v.get(i)).copied().unwrap_or(1.0))
                }).collect();
                if pos.len() < 2 { continue; }
                items.push(Item { nrm: vec![fwd; pos.len()], col: vec![st.col; pos.len()], pos, emissive: [0.0; 3], tris: Vec::new(), kind: 1, double: false, flat: true, toon: None, owner, order: 0, model: None, key: 0, brush: Some(Rc::new(st.w.clone())) });
            }
        }
    }
}
