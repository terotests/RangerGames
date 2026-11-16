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
fn to_srgb(c: f32) -> f32 {
    let c = c.clamp(0.0, 1.0);
    if c <= 0.0031308 { c * 12.92 } else { 1.055 * c.powf(1.0 / 2.4) - 0.055 }
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
    owner: u32,
    /// three.js's renderOrder: without a depth buffer (the painter) lower
    /// orders are drawn first, whatever their depth
    order: i32,
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
    near: f32,
    far: f32,
}

impl Cam {
    fn ray(&self, x: f32, y: f32) -> V3 {
        let dx = (x - self.w / 2.0) / self.focal;
        let dy = (self.h / 2.0 - y) / self.focal;
        norm([self.f[0] + self.r[0] * dx + self.u[0] * dy, self.f[1] + self.r[1] * dx + self.u[1] * dy, self.f[2] + self.r[2] * dx + self.u[2] * dy])
    }
}

pub struct World {
    pub active: bool,
    models: HashMap<String, Result<Rc<Asset>, String>>,
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
            geos: HashMap::new(),
            vfs: std::ptr::null(),
            dir: String::new(),
            cam: None,
            pick: Vec::new(),
            pick_owner: Vec::new(),
            owners: Vec::new(),
            drawn: 0,
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
    /// {op: "project", x, y, z} a world point on the screen.
    pub fn sync(&mut self, req: &Json) -> Json {
        match req.get("op").as_str().as_str() {
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
                        member("x", Json::Num((c.w / 2.0 + dot(d, c.r) / z * c.focal) as f64)),
                        member("y", Json::Num((c.h / 2.0 - dot(d, c.u) / z * c.focal) as f64)),
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
        let dir = cam.ray(x, y);
        let o = cam.eye;
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
            if d <= cam.near {
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
                let mut mat = Mat { color: [1.0; 3], emissive: [0.0; 3], kind: 0, side: 0, flat: false };
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
                    ctx.items.push(Item { pos, nrm, col, emissive: mat.emissive, tris, kind: mat.kind, double: mat.side == 2, flat: mat.flat, owner: ow, order });
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
                        let first = ctx.items.len();
                        model_items(&asset, &mix, &m, ow, tint, &mut ctx.items);
                        for it in ctx.items[first..].iter_mut() {
                            it.order = order;
                        }
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
        let cam = Cam { eye, r, u, f, focal, w, h, near, far };
        self.cam = Some(cam);
        self.owners = std::mem::take(&mut ctx.owners);
        self.pick.clear();
        self.pick_owner.clear();

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
        let lights = ctx.lights.clone();
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
        let mut drawn = 0;
        for it in ctx.items.iter() {
            // each corner in view space and lit once
            let view: Vec<V3> = it.pos.iter().map(|p| { let d = sub(*p, eye); [dot(d, r), dot(d, u), dot(d, f)] }).collect();
            let vcol: Vec<V3> = if it.flat { Vec::new() } else { (0..it.pos.len()).map(|i| shade(it.pos[i], it.nrm[i], it.col[i], it.emissive, it.kind)).collect() };
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
                let cols: [V3; 3] = if it.flat || back {
                    let n = if back { [-fnrm[0], -fnrm[1], -fnrm[2]] } else { fnrm };
                    let centre = [(a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0, (a[2] + b[2] + c[2]) / 3.0];
                    let k = shade(centre, n, it.col[ia], it.emissive, it.kind);
                    [k, k, k]
                } else {
                    [vcol[ia], vcol[ib], vcol[ic]]
                };
                // clip against the near plane: (view position, colour)
                let corners = [(va, cols[0]), (vb, cols[1]), (vc, cols[2])];
                let mut poly: Vec<(V3, V3)> = Vec::with_capacity(4);
                for i in 0..3 {
                    let (p, pc) = corners[i];
                    let (q, qc) = corners[(i + 1) % 3];
                    if p[2] >= near {
                        poly.push((p, pc));
                    }
                    if (p[2] >= near) != (q[2] >= near) {
                        let k = (near - p[2]) / (q[2] - p[2]);
                        let lerp = |x: V3, y: V3| [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
                        poly.push((lerp(p, q), lerp(pc, qc)));
                    }
                }
                if poly.len() < 3 {
                    continue;
                }
                let scr: Vec<(f32, f32, f32, V3)> = poly.iter().map(|(p, c)| (w / 2.0 + p[0] / p[2] * focal, h / 2.0 - p[1] / p[2] * focal, p[2], *c)).collect();
                let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
                for s in scr.iter() {
                    x0 = x0.min(s.0); x1 = x1.max(s.0); y0 = y0.min(s.1); y1 = y1.max(s.1);
                }
                self.pick.push([a, b, c]);
                self.pick_owner.push(it.owner);
                if x1 < 0.0 || y1 < 0.0 || x0 > w || y0 > h {
                    continue;
                }
                drawn += 1;
                if gl {
                    for k in 1..scr.len() - 1 {
                        for s in [scr[0], scr[k], scr[k + 1]].iter() {
                            tris.extend_from_slice(&[s.0, s.1, depth(s.2), s.3[0], s.3[1], s.3[2]]);
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
                    }
                    for c in cols.iter() {
                        cs = [cs[0] + c[0] / 3.0, cs[1] + c[1] / 3.0, cs[2] + c[2] / 3.0];
                    }
                    polys.push((it.order, zsum / scr.len() as f32, crate::scene3d::grow(pts), cs));
                }
            }
        }
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

/// A model's triangles in the world for a mix of clips, skinned where it has
/// a skin; `tint` multiplies its colours.
fn model_items(asset: &Asset, mix: &[(usize, f32, f32)], m: &M4, owner: u32, tint: Option<V3>, items: &mut Vec<Item>) {
    let pose = gltf::pose(asset, mix);
    let wm = gltf::world_matrices(asset, &pose);
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
            items.push(Item { pos, nrm, col, emissive: p.emissive, tris: p.tris.clone(), kind: 0, double: p.double, flat: false, owner, order: 0 });
        }
    }
}
