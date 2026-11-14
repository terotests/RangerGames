// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine's own 3D layer: a small three.js-style scene of low-poly
//! shapes, drawn as flat-shaded polygons into the same draw stream as the
//! 2D view, under it. Being plain polygons it needs no WebGL or GPU API, so
//! it draws the same on the web canvas, the native Android canvas and a
//! Raspberry Pi. A game drives it with `rg.three(op, args)`:
//!
//! ```text
//! rg.three("scene",  { background: "#87ceeb" | ["#top", "#bottom"], fog: [near, far], fogColor,
//!                      ground: { y, color } })            // an endless floor at height y
//! rg.three("camera", { x, y, z, lookAt: [x, y, z], fov, up: [x, y, z] })
//! rg.three("light",  { id, type: "ambient" | "directional" | "point", color, intensity, x, y, z, range })
//! rg.three("add",    { id, shape: "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "star",
//!                      size: [..], color, x, y, z, rx, ry, rz, sx, sy, sz, detail, emissive, double,
//!                      layer })                          // -1: flat on the floor, drawn first
//! rg.three("set",    { id, x, y, z, rx, ry, rz, sx, sy, sz, color, visible })
//! rg.three("remove", { id })
//! rg.three("clear")
//! rg.three("globe",  { regions, lon, lat, r, colors, … })   // a map globe, see globe.rs
//! rg.three("planet", { id, x, y, z, r, spin, tilt, glowing, remove,  // a globe in the scene, in
//!                      regions, ocean, land, colors, bands, … })      // perspective (globe.rs's options)
//! rg.three("space",  { sun: [x, y, z], stars })   // the light of the planets; a sky of `stars` stars
//! ```
//!
//! Planets are drawn after the sky (and stars), far ones first, and before
//! the shapes, so a ship flying near a planet stays in front of it.
//!
//! Faces are sorted far to near (painter's algorithm) and the ones facing
//! away are skipped, so solid convex shapes look right; a big flat floor is
//! the `ground` of the scene rather than one huge face that would sort badly.

use crate::draw::DrawStream;
use rg_core::json::Json;

type V3 = [f64; 3];

fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
fn mul(a: V3, k: f64) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
fn dot(a: V3, b: V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
fn norm(a: V3) -> V3 {
    let l = dot(a, a).sqrt();
    if l < 1e-12 { [0.0, 0.0, 0.0] } else { mul(a, 1.0 / l) }
}

/// "#rgb", "#rrggbb", a number 0xrrggbb, or "rgb(r,g,b)" as 0..1 channels.
pub fn color(v: &Json, fallback: V3) -> V3 {
    if let Json::Num(n) = v {
        let n = *n as i64;
        return [((n >> 16) & 255) as f64 / 255.0, ((n >> 8) & 255) as f64 / 255.0, (n & 255) as f64 / 255.0];
    }
    let s = v.as_str();
    let s = s.trim();
    if let Some(h) = s.strip_prefix('#') {
        let hex = |t: &str| i64::from_str_radix(t, 16).unwrap_or(0) as f64;
        if h.len() == 3 {
            let d: Vec<String> = h.chars().map(|c| format!("{}{}", c, c)).collect();
            return [hex(&d[0]) / 255.0, hex(&d[1]) / 255.0, hex(&d[2]) / 255.0];
        }
        if h.len() >= 6 {
            return [hex(&h[0..2]) / 255.0, hex(&h[2..4]) / 255.0, hex(&h[4..6]) / 255.0];
        }
    }
    if let Some(inner) = s.strip_prefix("rgb(").or_else(|| s.strip_prefix("rgba(")) {
        let p: Vec<f64> = inner.trim_end_matches(')').split(',').map(|x| x.trim().parse::<f64>().unwrap_or(0.0)).collect();
        if p.len() >= 3 {
            return [p[0] / 255.0, p[1] / 255.0, p[2] / 255.0];
        }
    }
    fallback
}

struct Mesh {
    verts: Vec<V3>,
    faces: Vec<Vec<usize>>,
}

fn ring(r: f64, y: f64, n: usize, phase: f64) -> Vec<V3> {
    (0..n).map(|i| {
        let a = phase + i as f64 / n as f64 * std::f64::consts::TAU;
        [a.cos() * r, y, -a.sin() * r]
    }).collect()
}

fn mesh(shape: &str, size: &[f64], detail: usize) -> Mesh {
    let s = |i: usize, d: f64| size.get(i).copied().unwrap_or(d);
    let mut verts: Vec<V3> = Vec::new();
    let mut faces: Vec<Vec<usize>> = Vec::new();
    match shape {
        "sphere" => {
            let r = s(0, 0.5);
            let seg = detail.max(6);
            let rings = (seg / 2).max(4);
            verts.push([0.0, r, 0.0]);
            for j in 1..rings {
                let phi = j as f64 / rings as f64 * std::f64::consts::PI;
                verts.extend(ring(r * phi.sin(), r * phi.cos(), seg, 0.0));
            }
            verts.push([0.0, -r, 0.0]);
            let bottom = verts.len() - 1;
            for i in 0..seg {
                let n = (i + 1) % seg;
                faces.push(vec![0, 1 + i, 1 + n]);
                for j in 0..rings - 2 {
                    let a = 1 + j * seg;
                    let b = a + seg;
                    faces.push(vec![a + i, b + i, b + n, a + n]);
                }
                let a = 1 + (rings - 2) * seg;
                faces.push(vec![a + i, bottom, a + n]);
            }
        }
        "cylinder" | "cone" => {
            let (rt, rb, h) = if shape == "cone" { (0.0, s(0, 0.5), s(1, 1.0)) } else { (s(0, 0.5), s(1, s(0, 0.5)), s(2, 1.0)) };
            let seg = detail.max(5);
            if rt > 0.0 {
                verts.extend(ring(rt, h / 2.0, seg, 0.0));
            } else {
                verts.push([0.0, h / 2.0, 0.0]);
            }
            let base = verts.len();
            verts.extend(ring(rb, -h / 2.0, seg, 0.0));
            for i in 0..seg {
                let n = (i + 1) % seg;
                if rt > 0.0 {
                    faces.push(vec![i, base + i, base + n, n]);
                } else {
                    faces.push(vec![0, base + i, base + n]);
                }
            }
            if rt > 0.0 {
                faces.push((0..seg).collect());
            }
            faces.push((0..seg).rev().map(|i| base + i).collect());
        }
        "plane" => {
            let (w, d) = (s(0, 10.0) / 2.0, s(1, 10.0) / 2.0);
            verts = vec![[-w, -d, 0.0], [w, -d, 0.0], [w, d, 0.0], [-w, d, 0.0]];
            faces.push(vec![0, 1, 2, 3]);
        }
        "torus" => {
            let (big, small) = (s(0, 0.5), s(1, 0.2));
            let seg = detail.max(8);
            let tube = (seg / 2).max(4);
            for i in 0..seg {
                let a = i as f64 / seg as f64 * std::f64::consts::TAU;
                for j in 0..tube {
                    let b = j as f64 / tube as f64 * std::f64::consts::TAU;
                    let r = big + small * b.cos();
                    verts.push([r * a.cos(), r * a.sin(), small * b.sin()]);
                }
            }
            for i in 0..seg {
                let ni = (i + 1) % seg;
                for j in 0..tube {
                    let nj = (j + 1) % tube;
                    faces.push(vec![i * tube + j, ni * tube + j, ni * tube + nj, i * tube + nj]);
                }
            }
        }
        "star" => {
            // a star, flat in the XY plane, `size[1]` thick; `size[2]` points (5), `size[3]` inner radius share (0.45)
            let (r, d) = (s(0, 0.5), s(1, 0.2) / 2.0);
            let k = (s(2, 5.0).round() as usize).clamp(3, 12);
            let inner = s(3, 0.45);
            let pts: Vec<(f64, f64)> = (0..2 * k).map(|i| {
                let a = std::f64::consts::FRAC_PI_2 + i as f64 * std::f64::consts::PI / k as f64;
                let rr = if i % 2 == 0 { r } else { r * inner };
                (a.cos() * rr, a.sin() * rr)
            }).collect();
            verts.push([0.0, 0.0, d * 1.6]);
            verts.push([0.0, 0.0, -d * 1.6]);
            for p in pts.iter() {
                verts.push([p.0, p.1, 0.0]);
            }
            // two shallow pyramids: front and back
            for i in 0..2 * k {
                let n = (i + 1) % (2 * k);
                faces.push(vec![0, 2 + i, 2 + n]);
                faces.push(vec![1, 2 + n, 2 + i]);
            }
        }
        _ => {
            // box
            let (w, h, d) = (s(0, 1.0) / 2.0, s(1, s(0, 1.0)) / 2.0, s(2, s(0, 1.0)) / 2.0);
            verts = vec![
                [-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d],
                [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
            ];
            faces = vec![
                vec![0, 1, 2, 3], vec![5, 4, 7, 6], vec![1, 5, 6, 2],
                vec![4, 0, 3, 7], vec![3, 2, 6, 7], vec![4, 5, 1, 0],
            ];
        }
    }
    Mesh { verts, faces }
}

struct Obj {
    id: String,
    mesh: Mesh,
    color: V3,
    pos: V3,
    rot: V3,
    scale: V3,
    visible: bool,
    emissive: bool,
    double: bool,
    /// drawn before the higher layers whatever the depth: flat things on the
    /// floor (a road, a shadow) use -1 so that nothing standing on them sinks in
    layer: i32,
}

struct Light {
    id: String,
    kind: String,
    color: V3,
    intensity: f64,
    pos: V3,
    range: f64,
}

pub struct Scene {
    pub active: bool,
    objs: Vec<Obj>,
    lights: Vec<Light>,
    sky: Option<(V3, V3)>,
    fog: Option<(f64, f64)>,
    fog_color: V3,
    ground: Option<(f64, V3)>,
    cam: V3,
    look: V3,
    /// the camera's up (default world up): a ship can roll over
    up: V3,
    fov: f64,
    /// polygons drawn in the last frame
    pub drawn: usize,
    /// a globe of map outlines (rg.three("globe", …)), drawn over the sky
    pub globe: Option<crate::globe::Globe>,
    planets: Vec<Planet>,
    sun: Option<V3>,
    stars: Vec<(V3, f64)>,
}

/// A globe placed in the scene (rg.three("planet", …)).
struct Planet {
    id: String,
    globe: crate::globe::Globe,
    pos: V3,
    r: f64,
    spin: f64,
    tilt: f64,
    glowing: bool,
}

impl Planet {
    /// The world directions of the globe's own x, y and z: its north pole is
    /// world up (tilted by `tilt` round z), and it turns by `spin` round its pole.
    fn axes(&self) -> [V3; 3] {
        let (ss, cs) = self.spin.sin_cos();
        let (st, ct) = self.tilt.sin_cos();
        // untilted: own z (north) = world y; own x, y in the world's x-z plane
        let x0 = [cs, 0.0, -ss];
        let y0 = [-ss, 0.0, -cs];
        let z0 = [0.0, 1.0, 0.0];
        let tilt = |v: V3| -> V3 { [v[0] * ct - v[1] * st, v[0] * st + v[1] * ct, v[2]] };
        [tilt(x0), tilt(y0), tilt(z0)]
    }
}

struct Poly {
    layer: i32,
    depth: f64,
    pts: Vec<f32>,
    rgb: V3,
}

fn get3(a: &Json, keys: [&str; 3], d: V3) -> V3 {
    [a.get(keys[0]).as_num(d[0]), a.get(keys[1]).as_num(d[1]), a.get(keys[2]).as_num(d[2])]
}

impl Scene {
    pub fn new() -> Scene {
        let mut s = Scene {
            active: false,
            objs: Vec::new(),
            lights: Vec::new(),
            sky: None,
            fog: None,
            fog_color: [1.0, 1.0, 1.0],
            ground: None,
            cam: [0.0, 4.0, 8.0],
            look: [0.0, 0.0, 0.0],
            up: [0.0, 1.0, 0.0],
            fov: 50.0,
            drawn: 0,
            globe: None,
            planets: Vec::new(),
            sun: None,
            stars: Vec::new(),
        };
        s.default_lights();
        s
    }

    fn default_lights(&mut self) {
        self.lights = vec![
            Light { id: "ambient".into(), kind: "ambient".into(), color: [1.0, 1.0, 1.0], intensity: 0.55, pos: [0.0; 3], range: 0.0 },
            Light { id: "sun".into(), kind: "directional".into(), color: [1.0, 1.0, 1.0], intensity: 0.75, pos: [3.0, 6.0, 4.0], range: 0.0 },
        ];
    }

    pub fn command(&mut self, op: &str, a: &Json) {
        match op {
            "clear" => {
                *self = Scene::new();
                return;
            }
            "scene" => {
                let bg = a.get("background");
                if let Json::Arr(v) = &bg {
                    if v.len() >= 2 {
                        self.sky = Some((color(&v[0], [0.5; 3]), color(&v[1], [0.8; 3])));
                    }
                } else if !bg.is_null() {
                    let c = color(&bg, [0.5; 3]);
                    self.sky = Some((c, c));
                }
                let fog = a.get("fog");
                if let Json::Arr(v) = &fog {
                    if v.len() >= 2 {
                        self.fog = Some((v[0].as_num(10.0), v[1].as_num(50.0)));
                    }
                } else if let Json::Num(n) = fog {
                    self.fog = if n > 0.0 { Some((n * 0.3, n)) } else { None };
                }
                if !a.get("fogColor").is_null() {
                    self.fog_color = color(&a.get("fogColor"), [1.0; 3]);
                } else if let Some((_, b)) = self.sky {
                    self.fog_color = b;
                }
                let g = a.get("ground");
                if g.is_null() {
                } else if let Json::Bool(false) = g {
                    self.ground = None;
                } else {
                    self.ground = Some((g.get("y").as_num(0.0), color(&g.get("color"), [0.4, 0.7, 0.3])));
                }
            }
            "camera" => {
                self.cam = get3(a, ["x", "y", "z"], self.cam);
                if let Json::Arr(v) = a.get("lookAt") {
                    if v.len() >= 3 {
                        self.look = [v[0].as_num(0.0), v[1].as_num(0.0), v[2].as_num(0.0)];
                    }
                }
                if let Json::Arr(v) = a.get("up") {
                    if v.len() >= 3 {
                        let up = norm([v[0].as_num(0.0), v[1].as_num(1.0), v[2].as_num(0.0)]);
                        if dot(up, up) > 0.5 {
                            self.up = up;
                        }
                    }
                }
                self.fov = a.get("fov").as_num(self.fov);
            }
            "light" => {
                let id = a.get("id").as_str();
                let kind = { let k = a.get("type").as_str(); if k.is_empty() { "point".to_string() } else { k } };
                let l = Light {
                    id: id.clone(),
                    kind,
                    color: color(&a.get("color"), [1.0; 3]),
                    intensity: a.get("intensity").as_num(1.0),
                    pos: get3(a, ["x", "y", "z"], [0.0, 5.0, 0.0]),
                    range: a.get("range").as_num(10.0),
                };
                if let Some(old) = self.lights.iter_mut().find(|x| x.id == id) {
                    *old = l;
                } else {
                    self.lights.push(l);
                }
            }
            "add" => {
                self.active = true;
                let id = a.get("id").as_str();
                let size: Vec<f64> = a.get("size").items().iter().map(|v| v.as_num(1.0)).collect();
                let shape = a.get("shape").as_str();
                let o = Obj {
                    id: id.clone(),
                    mesh: mesh(&shape, &size, a.get("detail").as_num(12.0) as usize),
                    color: color(&a.get("color"), [0.8, 0.8, 0.8]),
                    pos: get3(a, ["x", "y", "z"], [0.0; 3]),
                    rot: get3(a, ["rx", "ry", "rz"], [0.0; 3]),
                    scale: get3(a, ["sx", "sy", "sz"], [1.0; 3]),
                    visible: !matches!(a.get("visible"), Json::Bool(false)),
                    emissive: a.get("emissive").as_bool(),
                    double: a.get("double").as_bool() || shape == "plane",
                    layer: a.get("layer").as_num(0.0) as i32,
                };
                self.objs.retain(|x| x.id != id || id.is_empty());
                self.objs.push(o);
            }
            "set" => {
                let id = a.get("id").as_str();
                if let Some(o) = self.objs.iter_mut().find(|x| x.id == id) {
                    o.pos = get3(a, ["x", "y", "z"], o.pos);
                    o.rot = get3(a, ["rx", "ry", "rz"], o.rot);
                    o.scale = get3(a, ["sx", "sy", "sz"], o.scale);
                    if !a.get("color").is_null() {
                        o.color = color(&a.get("color"), o.color);
                    }
                    if let Json::Bool(v) = a.get("visible") {
                        o.visible = v;
                    }
                }
            }
            "remove" => {
                let id = a.get("id").as_str();
                self.objs.retain(|x| x.id != id);
            }
            "planet" => {
                self.active = true;
                let id = a.get("id").as_str();
                if a.get("remove").as_bool() {
                    self.planets.retain(|p| p.id != id);
                    return;
                }
                let i = match self.planets.iter().position(|p| p.id == id) {
                    Some(i) => i,
                    None => {
                        let mut g = crate::globe::Globe::new();
                        // planets: no map grid, no borders, no glow unless asked for
                        g.command(&rg_core::json::parse(r#"{"grid":false,"border":false,"glow":false,"night":0.85}"#));
                        self.planets.push(Planet { id: id.clone(), globe: g, pos: [0.0; 3], r: 1.0, spin: 0.0, tilt: 0.0, glowing: false });
                        self.planets.len() - 1
                    }
                };
                let p = &mut self.planets[i];
                p.pos = get3(a, ["x", "y", "z"], p.pos);
                p.r = a.get("r").as_num(p.r);
                p.spin = a.get("spin").as_num(p.spin);
                p.tilt = a.get("tilt").as_num(p.tilt);
                if let Json::Bool(v) = a.get("glowing") {
                    p.glowing = v;
                }
                p.globe.command(a);
            }
            "space" => {
                self.active = true;
                if let Json::Arr(v) = a.get("sun") {
                    if v.len() >= 3 {
                        self.sun = Some([v[0].as_num(0.0), v[1].as_num(0.0), v[2].as_num(0.0)]);
                    }
                }
                let n = a.get("stars");
                if !n.is_null() {
                    let n = n.as_num(0.0).max(0.0) as usize;
                    let mut seed: u32 = 7;
                    let mut rnd = || {
                        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                        (seed >> 8) as f64 / 16777216.0
                    };
                    self.stars = (0..n).map(|_| {
                        let z = rnd() * 2.0 - 1.0;
                        let t = rnd() * std::f64::consts::TAU;
                        let s = (1.0 - z * z).sqrt();
                        let b = rnd();
                        ([s * t.cos(), z, s * t.sin()], b * b)
                    }).collect();
                }
            }
            "globe" => {
                self.active = true;
                self.globe.get_or_insert_with(crate::globe::Globe::new).command(a);
            }
            _ => {}
        }
        if op == "scene" || op == "camera" || op == "light" {
            self.active = true;
        }
    }

    fn shade(&self, n: V3, centre: V3, base: V3) -> V3 {
        let mut light = [0.0, 0.0, 0.0];
        for l in self.lights.iter() {
            let k = match l.kind.as_str() {
                "ambient" => l.intensity,
                "directional" => dot(n, norm(l.pos)).max(0.0) * l.intensity,
                _ => {
                    let d = sub(l.pos, centre);
                    let dist = dot(d, d).sqrt();
                    let fall = (1.0 - dist / l.range.max(0.01)).max(0.0);
                    dot(n, norm(d)).max(0.0) * l.intensity * fall * fall
                }
            };
            light = add(light, mul(l.color, k));
        }
        [base[0] * light[0], base[1] * light[1], base[2] * light[2]]
    }

    fn fogged(&self, c: V3, dist: f64) -> V3 {
        match self.fog {
            Some((near, far)) if far > near => {
                let k = ((dist - near) / (far - near)).clamp(0.0, 1.0);
                add(mul(c, 1.0 - k), mul(self.fog_color, k))
            }
            _ => c,
        }
    }

    /// Draws the scene into `out` for a view of `w` x `h`.
    pub fn render(&mut self, out: &mut DrawStream, w: f64, h: f64) {
        self.drawn = 0;
        if !self.active {
            return;
        }
        if let Some((top, bottom)) = self.sky {
            out.raw(0, 0.0, 0.0, w, h, top, Some(bottom), &[]);
        }
        if let Some(g) = self.globe.as_mut() {
            g.render(out, w, h);
        }
        let f = norm(sub(self.look, self.cam));
        let mut r = norm(cross(f, self.up));
        if dot(r, r) < 0.5 {
            r = norm(cross(f, [1.0, 0.0, 0.0]));
            if dot(r, r) < 0.5 {
                r = [1.0, 0.0, 0.0];
            }
        }
        let u = cross(r, f);
        let focal = (h / 2.0) / (self.fov.to_radians() / 2.0).tan();
        let near = 0.05;
        if !self.stars.is_empty() {
            // tiny squares, in three brightnesses, each as one path
            let mut groups: [(Vec<f32>, Vec<f32>); 3] = [(Vec::new(), Vec::new()), (Vec::new(), Vec::new()), (Vec::new(), Vec::new())];
            for (d, b) in self.stars.iter() {
                let z = dot(*d, f);
                if z < 0.05 {
                    continue;
                }
                let x = w / 2.0 + dot(*d, r) / z * focal;
                let y = h / 2.0 - dot(*d, u) / z * focal;
                if x < 0.0 || y < 0.0 || x > w || y > h {
                    continue;
                }
                let k = if *b > 0.6 { 2 } else if *b > 0.2 { 1 } else { 0 };
                let s = (0.6 + 0.5 * k as f64) as f32;
                let (x, y) = (x as f32, y as f32);
                let g = &mut groups[k];
                g.0.extend_from_slice(&[x - s, y - s, x + s, y - s, x + s, y + s, x - s, y + s]);
                g.1.push(g.0.len() as f32);
            }
            for (k, g) in groups.iter().enumerate() {
                if !g.1.is_empty() {
                    let c = [[0.55, 0.6, 0.75], [0.8, 0.82, 0.9], [1.0, 1.0, 1.0]][k];
                    out.rings(6, c, 1.0, 0.0, &g.0, &g.1);
                }
            }
        }
        if !self.planets.is_empty() {
            let cam3 = crate::globe::Cam3 { eye: self.cam, right: r, up: u, fwd: f, focal, w, h, near: near * 0.2 };
            let mut order: Vec<(f64, usize)> = self.planets.iter().enumerate().map(|(i, p)| {
                let d = sub(p.pos, self.cam);
                (dot(d, d).sqrt() - p.r, i)
            }).collect();
            order.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
            let sun = self.sun;
            for (_, i) in order {
                let p = &mut self.planets[i];
                let place = crate::globe::Place3 { centre: p.pos, radius: p.r, axes: p.axes() };
                p.globe.render_3d(out, &cam3, &place, sun, p.glowing);
            }
        }
        let cam = self.cam;
        let to_view = |p: V3| -> V3 {
            let d = sub(p, cam);
            [dot(d, r), dot(d, u), dot(d, f)]
        };
        let project = |v: &[V3]| -> Vec<f32> {
            // clip against the near plane, then project
            let mut clipped: Vec<V3> = Vec::with_capacity(v.len() + 2);
            for i in 0..v.len() {
                let a = v[i];
                let b = v[(i + 1) % v.len()];
                if a[2] >= near {
                    clipped.push(a);
                }
                if (a[2] >= near) != (b[2] >= near) {
                    let t = (near - a[2]) / (b[2] - a[2]);
                    clipped.push(add(a, mul(sub(b, a), t)));
                }
            }
            let mut pts = Vec::with_capacity(clipped.len() * 2);
            for p in clipped.iter() {
                pts.push((w / 2.0 + p[0] / p[2] * focal) as f32);
                pts.push((h / 2.0 - p[1] / p[2] * focal) as f32);
            }
            pts
        };

        // the endless floor: a big square under the camera, fogged in bands
        if let Some((gy, gc)) = self.ground {
            let reach = self.fog.map(|f| f.1).unwrap_or(200.0).max(20.0);
            let bands = if self.fog.is_some() { 6 } else { 1 };
            let cx = cam[0];
            let cz = cam[2];
            for b in (0..bands).rev() {
                let r0 = reach * (b as f64) / bands as f64;
                let r1 = reach * (b + 1) as f64 / bands as f64 * if b + 1 == bands { 3.0 } else { 1.0 };
                let shade = self.shade([0.0, 1.0, 0.0], [cx, gy, cz], gc);
                let c = self.fogged(shade, (r0 + r1) / 2.0);
                let quad = [[cx - r1, gy, cz - r1], [cx + r1, gy, cz - r1], [cx + r1, gy, cz + r1], [cx - r1, gy, cz + r1]];
                let v: Vec<V3> = quad.iter().map(|p| to_view(*p)).collect();
                let pts = project(&v);
                if pts.len() >= 6 {
                    out.raw(6, 0.0, 0.0, 0.0, 0.0, c, None, &pts);
                }
            }
        }

        let mut polys: Vec<Poly> = Vec::new();
        for o in self.objs.iter() {
            if !o.visible {
                continue;
            }
            let (sx, cx) = o.rot[0].sin_cos();
            let (sy, cy) = o.rot[1].sin_cos();
            let (sz, cz) = o.rot[2].sin_cos();
            // three.js's XYZ order: v' = Rx * Ry * Rz * (scale * v)
            let world: Vec<V3> = o.mesh.verts.iter().map(|v| {
                let p = [v[0] * o.scale[0], v[1] * o.scale[1], v[2] * o.scale[2]];
                let p = [p[0] * cz - p[1] * sz, p[0] * sz + p[1] * cz, p[2]];
                let p = [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy];
                let p = [p[0], p[1] * cx - p[2] * sx, p[1] * sx + p[2] * cx];
                add(p, o.pos)
            }).collect();
            for face in o.mesh.faces.iter() {
                let a = world[face[0]];
                let b = world[face[1]];
                let c = world[face[face.len() - 1]];
                let mut n = norm(cross(sub(b, a), sub(c, a)));
                let mut centre = [0.0, 0.0, 0.0];
                for &i in face.iter() {
                    centre = add(centre, world[i]);
                }
                centre = mul(centre, 1.0 / face.len() as f64);
                let towards = sub(centre, cam);
                if dot(n, towards) > 0.0 {
                    if !o.double {
                        continue;
                    }
                    n = mul(n, -1.0);
                }
                let view: Vec<V3> = face.iter().map(|&i| to_view(world[i])).collect();
                if view.iter().all(|p| p[2] < near) {
                    continue;
                }
                let pts = project(&view);
                if pts.len() < 6 {
                    continue;
                }
                // off screen
                let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
                for k in (0..pts.len()).step_by(2) {
                    x0 = x0.min(pts[k]); x1 = x1.max(pts[k]);
                    y0 = y0.min(pts[k + 1]); y1 = y1.max(pts[k + 1]);
                }
                if x1 < 0.0 || y1 < 0.0 || x0 > w as f32 || y0 > h as f32 {
                    continue;
                }
                let lit = if o.emissive { o.color } else { self.shade(n, centre, o.color) };
                let dist = dot(towards, towards).sqrt();
                let depth = view.iter().map(|p| p[2]).sum::<f64>() / view.len() as f64;
                polys.push(Poly { layer: o.layer, depth, pts: grow(pts), rgb: self.fogged(lit, dist) });
            }
        }
        polys.sort_by(|a, b| a.layer.cmp(&b.layer).then(b.depth.partial_cmp(&a.depth).unwrap_or(std::cmp::Ordering::Equal)));
        // neighbouring faces of one colour go out as one path of several rings
        let mut i = 0;
        while i < polys.len() {
            let rgb = q(polys[i].rgb);
            let mut j = i;
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            while j < polys.len() && q(polys[j].rgb) == rgb && j - i < 24 {
                pts.extend_from_slice(&polys[j].pts);
                ends.push(pts.len() as f32);
                j += 1;
            }
            out.raw_rings(rgb_f(rgb), &pts, &ends);
            self.drawn += j - i;
            i = j;
        }
    }
}

/// The colour quantized to 0..255 channels, so that close shades merge.
fn q(c: V3) -> [u8; 3] {
    [(c[0].clamp(0.0, 1.0) * 255.0).round() as u8, (c[1].clamp(0.0, 1.0) * 255.0).round() as u8, (c[2].clamp(0.0, 1.0) * 255.0).round() as u8]
}
fn rgb_f(c: [u8; 3]) -> V3 { [c[0] as f64 / 255.0, c[1] as f64 / 255.0, c[2] as f64 / 255.0] }

/// Pushes a polygon's corners half a pixel out from its centre, so that the
/// anti-aliased edges of two neighbouring faces overlap instead of leaving a
/// hairline of background between them.
fn grow(pts: Vec<f32>) -> Vec<f32> {
    let n = (pts.len() / 2) as f32;
    let (mut cx, mut cy) = (0.0f32, 0.0f32);
    for k in (0..pts.len()).step_by(2) {
        cx += pts[k];
        cy += pts[k + 1];
    }
    cx /= n;
    cy /= n;
    let mut out = pts.clone();
    for k in (0..pts.len()).step_by(2) {
        let dx = pts[k] - cx;
        let dy = pts[k + 1] - cy;
        let l = (dx * dx + dy * dy).sqrt();
        if l > 0.01 {
            out[k] += dx / l * 0.6;
            out[k + 1] += dy / l * 0.6;
        }
    }
    out
}
