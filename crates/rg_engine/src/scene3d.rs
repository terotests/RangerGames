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
//!                      water: { surface, color, absorb: [r, g, b], scatter, caustics, causticScale, time }
//!                                     // under water (see `Water`): light and distance take each
//!                                     // colour away at its own rate (red first), sunlight
//!                                     // ripples over the faces (caustics); water: false ends it
//! rg.three("camera", { x, y, z, lookAt: [x, y, z], fov, up: [x, y, z] })
//! rg.three("light",  { id, type: "ambient" | "directional" | "point", color, intensity, x, y, z, range })
//!                    type "env": a still surrounding that objects with env > 0 mirror
//!                    (a polished hull over a moon): x, y, z the way up, color the ground
//!                    below the horizon, sky the colour above it (black), intensity
//! rg.three("add",    { id, shape: "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "star"
//!                             | "prism" | "roof" | "dome"     // prism: size [length (x), height, width (z)], base at y 0;
//!                             | "mesh"         // verts: [x, y, z, ...], tris: [a, b, c, ...] (counter-
//!                                               // clockwise seen from outside), colors: a 0xrrggbb a
//!                                               // triangle (else `color`), glow: the triangles drawn
//!                                               // unlit; smooth: true lights a corner (normals and
//!                                               // colours averaged, GL); a ship from RangerSpaceshipBuilder
//!                             | "dust"         // as puffs with two numbers more a puff (seed, age 0…1):
//!                                               // a few lumps turning round it and drifting apart with age
//!                             | "puffs"        // soft round puffs facing the eye (smoke, a cloud):
//!                                               // set { puffs: [x, y, z, r, alpha, bright, …] }, six
//!                                               // numbers a puff, x y z from the object's place; each
//!                                               // is a few rings, fainter outwards; `color` × bright
//!                             | "burst"        // up to 20 000 sparks flung from x, y, z (burst.rs):
//!                                               // count, speed: [min, max], dir: [x, y, z] + spread
//!                                               // (half angle, radians; π or no dir: every way),
//!                                               // v: [x, y, z] added to all, g: [x, y, z] a pull,
//!                                               // gravity: { x, y, z, gm, r } a point mass (from the
//!                                               // object's place; inside r they are gone), drag,
//!                                               // life: [min, max] s, size: [start, end] (world),
//!                                               // palette: colours over a life, bright, seed;
//!                                               // streak: s (thin triangles along the motion, the
//!                                               // tail where it was s ago, fading), far: d (half
//!                                               // the size at d from the start), split: n,
//!                                               // splitAt: [min, max] (share of a life),
//!                                               // splitSpeed (sparks break into n pieces);
//!                                               // set { id, time } the seconds since it went off
//!                                               // (back in time runs it again), bright;
//!                                               // look: "glow" soft glowing sprites where the host
//!                                               // draws GPU splats (else the squares), material:
//!                                               // { shader, u } a game's sprite() (rg.shader kind
//!                                               // "sprite", shaders/README.md)
//!                             | "splats"       // a baked particle run (src: a .rgps, splats.rs): axes,
//!                                               // scale, palette (cold to hot), time; res (0.5: the
//!                                               // density picture's pixels a screen pixel, less is
//!                                               // cheaper), max (80: the biggest splat, px);
//!                                               // look: "liquid" (a lit surface) or "gas" (see-
//!                                               // through dust, density: 1.5 a splat)
//!                             | "heightfield",  // size [w (x), d (z), nx, nz], heights: (nx+1)*(nz+1) numbers,
//!                                               // row by row from -z; cells that are 0 at every corner are left out
//!                                                   // roof: the prism's two slopes only (an open gable roof);
//!                                                   // dome: a half sphere, size [r], its flat bottom at y 0
//!                      size: [..], color, x, y, z, rx, ry, rz, sx, sy, sz, detail, emissive, double,
//!                      layer,                            // -1: flat on the floor, drawn first
//!                      shiny,                            // 0..1: a glint of each light off the faces
//!                                                        // that turn it towards the camera
//!                      env,                              // 0..1: how much it mirrors the "env" light's
//!                                                        // ground and sky (polished metal)
//!                      opacity,                          // 0..1 (1): below 1 a see-through light, a flame
//!                      wy,                               // a turn round world y after rx, ry, rz
//!                      group })                          // objects of one group (a house) are sorted
//!                                                        // as one thing by the group's middle, and by
//!                                                        // layer only among themselves
//! rg.three("set",    { id, x, y, z, rx, ry, rz, wy, sx, sy, sz, color, visible, shiny, opacity,
//!                      heights,                          // a heightfield's new heights
//!                      puffs })                          // a "puffs" object's puffs (one call for all)
//! rg.three("remove", { id })
//! rg.three("clear")
//! rg.three("globe",  { regions, lon, lat, r, colors, … })   // a map globe, see globe.rs
//! rg.three("planet", { id, x, y, z, r, spin, tilt, glowing, remove,  // a globe in the scene, in
//!                      regions, ocean, land, colors, bands, … })      // perspective (globe.rs's options)
//!                      texture: "img/earth.jpg"   // a map of the surface (equirectangular,
//!                                                 // longitude -180…180, north up): hosts that
//!                                                 // can draw it (web, phone, screenshots) do,
//!                                                 // others draw the regions
//!                      flow: 1, flowTime: t       // the cloud bands drift: 1 = Jupiter's winds
//!                                                 // (0.3 for a calmer giant), t the planet's
//!                                                 // time in seconds (the game's clock, warp
//!                                                 // and all), set each frame
//!                      turbulence: 1              // the clouds morph (a rolling warp of the
//!                                                 // picture, EVG's smoke); default: as `flow`
//!                      material: { shader: "lava", u: { glow: 2 } }
//!                                                 // a game's surface shader (rg.shader kind
//!                                                 // "surface", shaders/README.md), t = flowTime
//!                      vortices: [{ lat, lon, r, ell, turns, depth }]
//!                                                 // storms turning in the clouds (at most 4):
//!                                                 // middle and radius in degrees, width /
//!                                                 // height, turns an hour of flowTime
//!                                                 // (+ counter-clockwise from outside), how
//!                                                 // much the middle turns (0..1)
//! rg.three("space",  { sun: [x, y, z], stars })   // the light of the planets; a sky of `stars` stars
//! ```
//!
//! Planets are drawn after the sky (and stars), far ones first, and before
//! the shapes, so a ship flying near a planet stays in front of it.
//!
//! With a GL host (`gl` set: WebGL on the web, GLES on Android) the scene goes
//! out as depth-tested triangles instead (`tris`, see `render`): every pixel
//! shows the nearest face, so parts never show through each other. The host
//! draws them under the 2D view. Scenes with a globe, planets or stars still
//! use the painter path below.
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

/// A material's `u` ({ heat: 0.8, tint: [1, 0.5, 0.2] }) as the draw stream
/// carries it: "heat=0.8;tint=1,0.5,0.2" (names of letters, digits and _,
/// 1 to 4 numbers; anything else is left out).
pub(crate) fn uniforms_text(u: &[rg_core::json::JsonMember]) -> String {
    let mut out = String::new();
    for m in u {
        let name = &m.key;
        if name.is_empty() || name.len() > 32 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            continue;
        }
        let nums: Vec<f64> = match &m.value {
            Json::Num(n) => vec![*n],
            Json::Bool(b) => vec![if *b { 1.0 } else { 0.0 }],
            Json::Arr(v) => v.iter().map(|x| x.as_num(0.0)).collect(),
            _ => continue,
        };
        if nums.is_empty() || nums.len() > 4 || !nums.iter().all(|n| n.is_finite()) {
            continue;
        }
        if !out.is_empty() {
            out.push(';');
        }
        out.push_str(name);
        out.push('=');
        out.push_str(&nums.iter().map(|n| format!("{}", *n as f32)).collect::<Vec<_>>().join(","));
    }
    out
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
    /// a colour a face ("mesh"); empty: the object's colour
    cols: Vec<V3>,
    /// the faces drawn unlit ("mesh"); empty: the object's `emissive`
    glow: Vec<bool>,
}

impl Mesh {
    fn plain(verts: Vec<V3>, faces: Vec<Vec<usize>>) -> Mesh {
        Mesh { verts, faces, cols: Vec::new(), glow: Vec::new() }
    }
    /// face `f`'s colour and whether it is unlit, given the object's
    fn face_paint(&self, f: usize, color: V3, emissive: bool) -> (V3, bool) {
        (*self.cols.get(f).unwrap_or(&color), emissive || *self.glow.get(f).unwrap_or(&false))
    }
}

/// A triangle mesh from flat lists (`rg.three("add", { shape: "mesh" })`);
/// triangles that point past the corners are left out.
fn tri_mesh(a: &Json) -> Mesh {
    let v: Vec<f64> = a.get("verts").items().iter().map(|x| x.as_num(0.0)).collect();
    let verts: Vec<V3> = v.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
    let t: Vec<usize> = a.get("tris").items().iter().map(|x| x.as_num(0.0).max(0.0) as usize).collect();
    let cols_in = a.get("colors").items();
    let glow_in: Vec<usize> = a.get("glow").items().iter().map(|x| x.as_num(-1.0)).filter(|x| *x >= 0.0).map(|x| x as usize).collect();
    let fallback = color(&a.get("color"), [0.8, 0.8, 0.8]);
    let mut m = Mesh::plain(verts, Vec::new());
    for (i, c) in t.chunks_exact(3).enumerate() {
        if c.iter().any(|&k| k >= m.verts.len()) {
            continue;
        }
        m.faces.push(c.to_vec());
        if !cols_in.is_empty() {
            m.cols.push(cols_in.get(i).map(|x| color(x, fallback)).unwrap_or(fallback));
        }
        m.glow.push(glow_in.binary_search(&i).is_ok());
    }
    m
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
        "prism" | "roof" => {
            // a triangular prism along x (a gable roof): its base the rectangle at y = 0,
            // its ridge at y = size[1] over the middle (z = 0)
            let (w, h, d) = (s(0, 1.0) / 2.0, s(1, 0.5), s(2, 1.0) / 2.0);
            verts = vec![[-w, 0.0, d], [w, 0.0, d], [w, 0.0, -d], [-w, 0.0, -d], [-w, h, 0.0], [w, h, 0.0]];
            faces = vec![vec![0, 1, 5, 4], vec![2, 3, 4, 5]];
            if shape == "prism" {
                faces.extend(vec![vec![1, 2, 5], vec![3, 0, 4], vec![3, 2, 1, 0]]);
            }
        }
        "dome" => {
            // the upper half of a sphere, standing on its flat bottom at y = 0
            let r = s(0, 0.5);
            let seg = detail.max(6);
            let rings = (seg / 4).max(2);
            verts.push([0.0, r, 0.0]);
            for j in 1..=rings {
                let phi = j as f64 / rings as f64 * std::f64::consts::FRAC_PI_2;
                verts.extend(ring(r * phi.sin(), r * phi.cos(), seg, 0.0));
            }
            for i in 0..seg {
                let n = (i + 1) % seg;
                faces.push(vec![0, 1 + i, 1 + n]);
                for j in 0..rings - 1 {
                    let a = 1 + j * seg;
                    let b = a + seg;
                    faces.push(vec![a + i, b + i, b + n, a + n]);
                }
            }
            let last = 1 + (rings - 1) * seg;
            faces.push((0..seg).rev().map(|i| last + i).collect());
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
    Mesh::plain(verts, faces)
}

/// A grid of (nx+1)*(nz+1) heights over w × d, centred on the origin: two
/// triangles a cell, facing up; cells flat at 0 are left out (the floor shows).
fn heightfield(size: &[f64], heights: &[f64]) -> Mesh {
    let s = |i: usize, d: f64| size.get(i).copied().unwrap_or(d);
    let (w, d) = (s(0, 1.0), s(1, 1.0));
    let nx = (s(2, 8.0) as usize).clamp(1, 64);
    let nz = (s(3, 8.0) as usize).clamp(1, 64);
    let mut verts = Vec::with_capacity((nx + 1) * (nz + 1));
    for j in 0..=nz {
        for i in 0..=nx {
            let y = heights.get(j * (nx + 1) + i).copied().unwrap_or(0.0);
            verts.push([-w / 2.0 + w * i as f64 / nx as f64, y, -d / 2.0 + d * j as f64 / nz as f64]);
        }
    }
    let mut faces = Vec::new();
    for j in 0..nz {
        for i in 0..nx {
            let a = j * (nx + 1) + i;
            let (b, c, dd) = (a + 1, a + nx + 2, a + nx + 1);
            if [a, b, c, dd].iter().all(|&k| verts[k][1].abs() < 0.003) {
                continue;
            }
            // split along the diagonal that keeps the surface convex-ish
            if (verts[a][1] - verts[c][1]).abs() < (verts[b][1] - verts[dd][1]).abs() {
                faces.push(vec![a, dd, c]);
                faces.push(vec![a, c, b]);
            } else {
                faces.push(vec![a, dd, b]);
                faces.push(vec![b, dd, c]);
            }
        }
    }
    Mesh::plain(verts, faces)
}

fn label_shape(shape: &str) -> bool {
    shape == "label"
}

/// A label's text and look (shape "label": text, size in px, color,
/// opacity, align "center" | "left" | "right", dx/dy px from its place,
/// weight)
struct Label {
    text: String,
    size: f64,
    color: V3,
    opacity: f64,
    align: u8,
    dx: f64,
    dy: f64,
    weight: String,
}

impl Label {
    fn new(a: &Json) -> Label {
        let mut l = Label { text: String::new(), size: 14.0, color: [1.0; 3], opacity: 1.0, align: 0, dx: 0.0, dy: 0.0, weight: "600".into() };
        l.set(a);
        l
    }

    fn set(&mut self, a: &Json) {
        if !a.get("text").is_null() {
            self.text = a.get("text").as_str();
        }
        self.size = a.get("size").as_num(self.size).max(1.0);
        if !a.get("color").is_null() {
            self.color = color(&a.get("color"), self.color);
        }
        self.opacity = a.get("opacity").as_num(self.opacity).clamp(0.0, 1.0);
        match a.get("align").as_str().as_str() {
            "center" => self.align = 0,
            "left" => self.align = 1,
            "right" => self.align = 2,
            _ => {}
        }
        self.dx = a.get("dx").as_num(self.dx);
        self.dy = a.get("dy").as_num(self.dy);
        if !a.get("weight").is_null() {
            self.weight = a.get("weight").as_str();
        }
    }
}

/// An object's mesh from its "add" (or one `lod` entry, `parent` the
/// object's own: an entry without a shape takes the object's).
fn obj_mesh(a: &Json, shape: &str, size: &[f64], detail: Option<usize>) -> Mesh {
    if label_shape(shape) {
        Mesh::plain(Vec::new(), Vec::new())
    } else if shape == "heightfield" {
        let hs: Vec<f64> = a.get("heights").items().iter().map(|v| v.as_num(0.0)).collect();
        heightfield(size, &hs)
    } else if shape == "mesh" {
        tri_mesh(a)
    } else if shape == "puffs" || shape == "dust" || shape == "burst" || shape == "splats" {
        Mesh::plain(Vec::new(), Vec::new())
    } else {
        mesh(shape, size, detail.unwrap_or(a.get("detail").as_num(12.0) as usize))
    }
}

/// The shapes `detail: "auto"` makes coarser forms of (their detail is a
/// count of segments round): the segments and each form's limit on the
/// screen (units across), finest first.
const AUTO_DETAIL: [(usize, f64); 4] = [(48, f64::MAX), (24, 160.0), (12, 60.0), (6, 16.0)];

/// The object's forms of detail from its "add":
///
/// - `lod: [{ px: 40, shape: "mesh", verts, tris, colors }, { px: 8, shape: "box", size: [1] }, { px: 2, hide: true }]`:
///   each entry is a coarser form, drawn once the object is under `px`
///   units across on the screen (its bounding ball's diameter; units are
///   about CSS pixels); `hide: true` draws nothing (too small to see).
///   An entry without a shape takes the object's shape and size, so
///   `{ px: 30, detail: 8 }` is the same sphere with fewer segments.
/// - `detail: "auto"` on a sphere, cylinder or cone: 48, 24, 12 and 6
///   segments by its size.
/// - `lodMargin` (0.15): how far past a limit before the form changes.
fn lod_forms(o: &mut Obj, a: &Json, shape: &str, size: &[f64]) {
    let mut forms: Vec<Mesh> = Vec::new();
    let mut px: Vec<f64> = Vec::new();
    let auto = a.get("detail").as_str() == "auto" && matches!(shape, "sphere" | "cylinder" | "cone");
    if auto {
        for (i, (seg, lim)) in AUTO_DETAIL.iter().enumerate() {
            forms.push(mesh(shape, size, *seg));
            if i > 0 {
                px.push(*lim);
            }
        }
    } else {
        let entries = a.get("lod").items();
        if entries.is_empty() {
            return;
        }
        let mut steps: Vec<(f64, Mesh)> = Vec::new();
        for e in entries.iter() {
            let lim = e.get("px").as_num(0.0);
            if lim <= 0.0 {
                continue;
            }
            let m = if e.get("hide").as_bool() {
                Mesh::plain(Vec::new(), Vec::new())
            } else {
                let es = e.get("shape").as_str();
                let (sh, sz): (String, Vec<f64>) = if es.is_empty() {
                    (shape.to_string(), if e.get("size").is_null() { size.to_vec() } else { e.get("size").items().iter().map(|v| v.as_num(1.0)).collect() })
                } else {
                    (es, e.get("size").items().iter().map(|v| v.as_num(1.0)).collect())
                };
                obj_mesh(e, &sh, &sz, None)
            };
            steps.push((lim, m));
        }
        if steps.is_empty() {
            return;
        }
        steps.sort_by(|x, y| y.0.partial_cmp(&x.0).unwrap_or(std::cmp::Ordering::Equal));
        forms.push(std::mem::replace(&mut o.mesh, Mesh::plain(Vec::new(), Vec::new())));
        for (lim, m) in steps {
            px.push(lim);
            forms.push(m);
        }
    }
    o.lod_r = forms.iter().flat_map(|m| m.verts.iter()).map(|v| dot(*v, *v).sqrt()).fold(0.0, f64::max);
    // the finest form in use; its slot empty
    o.mesh = std::mem::replace(&mut forms[0], Mesh::plain(Vec::new(), Vec::new()));
    o.forms = forms;
    o.lod_px = px;
    o.lod_at = 0;
}

struct Obj {
    id: String,
    mesh: Mesh,
    /// shape "label": a name at `pos`, always facing the viewer and the same
    /// size on the screen (a planet's or a landmark's name; in VR each eye
    /// sees it at its place in the world)
    label: Option<Label>,
    /// a heightfield's size, kept for new heights
    hf: Option<Vec<f64>>,
    color: V3,
    pos: V3,
    rot: V3,
    scale: V3,
    visible: bool,
    emissive: bool,
    double: bool,
    /// 0..1: how strongly the lights glint off it (a polished hull)
    shiny: f64,
    /// 0..1: how much it mirrors the "env" lights (polished metal)
    env: f64,
    /// "mesh" with smooth: true: lit a corner, with each corner's normal the
    /// mean of its faces' and each corner's colour the mean of its faces', so
    /// that light bends round a rounded rock instead of showing flat facets
    /// (GL only; the painter draws it faceted)
    smooth: bool,
    /// the water's surface (rg.three add { surface: true }): its corners
    /// take `Water::surface_color` instead of being lit
    wsurf: bool,
    /// 1: solid; below 1 a see-through light (a flame, a glow): the painter
    /// blends it over what is behind, GL adds its colour times this
    opacity: f64,
    /// drawn before the higher layers whatever the depth: flat things on the
    /// floor (a road, a shadow) use -1 so that nothing standing on them sinks in
    layer: i32,
    /// a turn round world y applied after the object's own rx, ry, rz
    wy: f64,
    /// 0: none; objects of one group sort against others as one thing
    group: i32,
    /// a "puffs" object: x, y, z (from `pos`), radius, alpha, brightness a puff
    puffs: Vec<f64>,
    /// a "dust" object: its puffs have two numbers more, seed and age (0…1):
    /// each is a few lumps that turn round its centre and drift apart with age
    dust: bool,
    /// a "burst" object: its particles (burst.rs), placed from `pos`
    burst: Option<Box<crate::burst::Burst>>,
    /// a "splats" object: its baked run and how it lies in the world
    splats: Option<Box<SplatRun>>,
    /// Level of detail (lod.rs): the object's other forms, a coarser one each
    /// step (`lod: [{ px, shape, ... }]` or `detail: "auto"`). forms[i] is
    /// step i's mesh, except the step in use, whose mesh is `mesh` (its slot
    /// then holds an empty one). Empty: one form.
    forms: Vec<Mesh>,
    /// each coarser step's limit: step i + 1 is drawn below lod_px[i] units
    /// across on the screen (largest first)
    lod_px: Vec<f64>,
    /// the step in use
    lod_at: usize,
    /// the finest form's reach from its middle (before `scale`)
    lod_r: f64,
    /// how far past a limit the size must go before the step changes (0.15)
    lod_margin: f64,
}

/// A "splats" object's run (splats.rs): the file's x, y, z axes in the world,
/// file units to world units, colours over temperature (cold to hot).
struct SplatRun {
    run: crate::splats::Splats,
    axes: [V3; 3],
    scale: f64,
    palette: Vec<V3>,
    /// the density picture's pixels a screen pixel (0.5; less is cheaper and softer)
    res: f64,
    /// the biggest splat, screen pixels (80; less is cheaper close by)
    max: f64,
    /// look "gas": see-through dust (alpha 1 - exp(-density × thickness)),
    /// not a liquid surface
    gas: bool,
    /// how thick the gas is a splat (1.5)
    density: f64,
    /// material.shader: a game shader's name (rg.shader), "" for the engine's look
    shader: String,
    /// material.u: its uniforms as "name=1;tint=1,0.5,0.2" (u_ + name in the GLSL)
    uniforms: String,
}

impl SplatRun {
    fn new(run: crate::splats::Splats, a: &Json) -> SplatRun {
        let mut s = SplatRun { run, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], scale: 1.0, palette: Vec::new(), res: 0.5, max: 80.0, gas: false, density: 1.5, shader: String::new(), uniforms: String::new() };
        s.set(a);
        if s.palette.is_empty() {
            s.palette = vec![[0.25, 0.08, 0.05], [0.65, 0.12, 0.04], [1.0, 0.42, 0.08], [1.0, 0.72, 0.3], [1.0, 0.9, 0.6]];
        }
        s
    }

    fn set(&mut self, a: &Json) {
        let ax = a.get("axes").items();
        if ax.len() >= 3 {
            for k in 0..3 {
                let v = ax[k].items();
                if v.len() >= 3 {
                    self.axes[k] = [v[0].as_num(0.0), v[1].as_num(0.0), v[2].as_num(0.0)];
                }
            }
        }
        self.scale = a.get("scale").as_num(self.scale);
        if let Json::Arr(v) = a.get("palette") {
            if !v.is_empty() {
                self.palette = v.iter().map(|c| color(c, [1.0; 3])).collect();
            }
        }
        self.run.time = a.get("time").as_num(self.run.time);
        self.res = a.get("res").as_num(self.res).clamp(0.1, 1.0);
        self.max = a.get("max").as_num(self.max).clamp(1.0, 200.0);
        if let Json::Str(l) = a.get("look") {
            self.gas = l == "gas";
        }
        self.density = a.get("density").as_num(self.density).clamp(0.01, 50.0);
        let m = a.get("material");
        if let Json::Obj(_) = m {
            if let Json::Str(sh) = m.get("shader") {
                self.shader = sh.clone();
            }
            if let Json::Obj(u) = m.get("u") {
                self.uniforms = uniforms_text(&u);
            }
        }
    }

    /// a place in the file into the world, from the object's place
    fn world(&self, pos: V3, p: V3) -> V3 {
        let k = self.scale;
        let a = &self.axes;
        [
            pos[0] + k * (a[0][0] * p[0] + a[1][0] * p[1] + a[2][0] * p[2]),
            pos[1] + k * (a[0][1] * p[0] + a[1][1] * p[1] + a[2][1] * p[2]),
            pos[2] + k * (a[0][2] * p[0] + a[1][2] * p[1] + a[2][2] * p[2]),
        ]
    }
}

/// The rings of one puff: (radius share, alpha share). Inner rings over outer
/// ones make it soft at the edge; the shares differ a little so that the rings
/// never merge into one path (the painter joins faces of one colour and alpha).
const PUFF_RINGS: [(f64, f64); 4] = [(1.0, 0.22), (0.78, 0.26), (0.56, 0.3), (0.34, 0.34)];

/// A puff's rings on the screen: (corners, alpha share), outer first; empty when
/// it is behind the eye, too small or off the screen. v: the centre in view space.
fn puff_rings(v: V3, r: f64, focal: f64, w: f64, h: f64, near: f64) -> Vec<(Vec<f64>, f64)> {
    puff_rings_of(v, r, focal, w, h, near, &PUFF_RINGS)
}

/// A dust lump's two rings (alpha shares a little apart from PUFF_RINGS').
const DUST_RINGS: [(f64, f64); 2] = [(1.0, 0.41), (0.55, 0.57)];
const DUST_LUMPS: usize = 5;

/// A "dust" puff: DUST_LUMPS lumps round the centre (in the view plane), turned
/// by seed and age and drifting apart as it ages, each lump fading and shrinking:
/// a cloud of dust that breaks up and turns (Tero: Chicxulub's debris).
/// pf: x y z r alpha bright seed age; v: the centre in view space.
fn dust_rings(v: V3, pf: &[f64], focal: f64, w: f64, h: f64, near: f64) -> Vec<(Vec<f64>, f64)> {
    let (r, seed, age) = (pf[3], pf[6], pf[7].clamp(0.0, 1.0));
    let mut out = Vec::new();
    let spin = 1.0 + 2.5 * seed.fract();
    for j in 0..DUST_LUMPS {
        let hj = ((seed * 7.31 + j as f64 * 3.17).sin() * 43758.5453).fract().abs();
        let th = seed * std::f64::consts::TAU + j as f64 * std::f64::consts::TAU / DUST_LUMPS as f64 + age * spin * std::f64::consts::TAU;
        let d = r * (0.18 + 0.75 * age) * (0.6 + 0.6 * hj);
        let lr = r * (0.62 - 0.3 * age) * (0.75 + 0.5 * hj);
        let c = [v[0] + th.cos() * d, v[1] + th.sin() * d, v[2]];
        let fade = (1.0 - 0.55 * age) * (0.7 + 0.3 * hj);
        for (pts, k) in puff_rings_of(c, lr, focal, w, h, near, &DUST_RINGS) {
            out.push((pts, k * fade));
        }
    }
    out
}

fn puff_rings_of(v: V3, r: f64, focal: f64, w: f64, h: f64, near: f64, set: &[(f64, f64)]) -> Vec<(Vec<f64>, f64)> {
    if v[2] < near + r * 0.5 {
        return Vec::new();
    }
    let pr = r / v[2] * focal;
    let (cx, cy) = (w / 2.0 + v[0] / v[2] * focal, h / 2.0 - v[1] / v[2] * focal);
    if pr < 0.4 || cx + pr < 0.0 || cy + pr < 0.0 || cx - pr > w || cy - pr > h {
        return Vec::new();
    }
    let rings: &[(f64, f64)] = if pr < 3.0 { &set[set.len() / 2..set.len() / 2 + 1] } else { set };
    let sides = (8.0 + pr / 5.0).clamp(8.0, 20.0) as usize;
    rings.iter().map(|&(k, a)| {
        let mut pts = Vec::with_capacity(sides * 2);
        for i in 0..sides {
            let t = i as f64 / sides as f64 * std::f64::consts::TAU;
            pts.push(cx + t.cos() * pr * k);
            pts.push(cy + t.sin() * pr * k);
        }
        (pts, if pr < 3.0 { 0.8 } else { a })
    }).collect()
}

struct Light {
    id: String,
    kind: String,
    color: V3,
    intensity: f64,
    pos: V3,
    range: f64,
    /// "env": the colour above the horizon
    sky: V3,
    /// a point light made a spot: its way (unit) and the cosine of its half angle
    cone: Option<(V3, f64)>,
}

/// Under water (rg.three("scene", { water })): instead of the fog, what lies
/// `d` metres away keeps exp(-(absorb + scatter) d) of each colour and takes
/// the rest from `color` (the water's own glow), so red goes first and far
/// things turn blue-green. The light from above (directional and ambient)
/// has come down through the water: at depth `surface - y` it keeps
/// exp(-absorb depth) of each colour. Faces turned up to a directional
/// light get caustics: the bright net that the waves focus onto the
/// bottom, moving with `time`, `causticScale` metres across, `caustics`
/// strong (0…1), fainter and softer deeper down. All of it is in the light
/// the engine works out at a face or corner, so every host draws it.
#[derive(Clone, Copy)]
pub struct Water {
    pub surface: f64,
    pub color: V3,
    pub absorb: V3,
    pub scatter: f64,
    pub caustics: f64,
    pub scale: f64,
    pub time: f64,
    /// the sky above the surface as seen through it (Snell's window)
    pub sky: V3,
    /// the way to the sun in the air (unit; from the first directional light)
    pub sun: V3,
    pub sun_color: V3,
}

impl Water {
    fn from(a: &Json, old: Option<Water>) -> Water {
        let o = old.unwrap_or(Water { surface: 0.0, color: [0.05, 0.25, 0.32], absorb: [0.45, 0.07, 0.04], scatter: 0.06, caustics: 0.6, scale: 3.0, time: 0.0,
            sky: [0.75, 0.88, 1.0], sun: [0.0, 1.0, 0.0], sun_color: [1.0, 1.0, 1.0] });
        let absorb = match a.get("absorb") {
            Json::Arr(v) if v.len() >= 3 => [v[0].as_num(0.45), v[1].as_num(0.07), v[2].as_num(0.04)],
            _ => o.absorb,
        };
        Water {
            surface: a.get("surface").as_num(o.surface),
            // a colour as "#rrggbb", or [r, g, b] in 0…1 (light: may go past 1)
            color: match a.get("color") {
                Json::Null => o.color,
                Json::Arr(v) if v.len() >= 3 => [v[0].as_num(0.0), v[1].as_num(0.0), v[2].as_num(0.0)],
                c => color(&c, o.color),
            },
            absorb,
            scatter: a.get("scatter").as_num(o.scatter),
            caustics: a.get("caustics").as_num(o.caustics),
            scale: a.get("causticScale").as_num(o.scale).max(0.05),
            time: a.get("time").as_num(o.time),
            sky: if a.get("sky").is_null() { o.sky } else { color(&a.get("sky"), o.sky) },
            sun: o.sun,
            sun_color: o.sun_color,
        }
    }

    /// The water itself seen from height y0 along the unit way d, as far as
    /// the light goes (or up to the surface): sunlight scattered into the
    /// ray all along it. The light at height y is exp(-absorb (surface - y))
    /// of the light just under the surface, and the ray loses
    /// exp(-(absorb + scatter) s) over s metres, so the sum along the ray is
    /// color * σt / k * (1 - exp(-k s_max)) with k = σt - absorb * d.y: up
    /// it brightens towards the surface, down it goes dark, and the deeper
    /// the eye the darker and bluer all of it. `color` is the water's glow
    /// looking level just under the surface. A little forward scattering
    /// round the sun's way under water.
    pub fn backdrop(&self, y0: f64, d: V3) -> V3 {
        let c = self.inscatter(y0, d, f64::INFINITY);
        if d[1] <= 1e-6 {
            return c;
        }
        // a way up meets the (calm) surface: what is seen there, dimmed by the water between
        let depth = (self.surface - y0).max(0.0);
        let s = depth / d[1];
        let p = [d[0] * s, self.surface, d[2] * s];
        let sc = self.surface_seen([0.0, 1.0, 0.0], d, p);
        let mut o = c;
        for i in 0..3 {
            o[i] += sc[i] * (-(self.absorb[i] + self.scatter) * s).exp();
        }
        o
    }

    /// The light scattered into a ray `dist` long (see `backdrop`).
    fn inscatter(&self, y0: f64, d: V3, dist: f64) -> V3 {
        let depth = (self.surface - y0).max(0.0);
        let smax = if d[1] > 1e-6 { (depth / d[1]).min(dist) } else { dist };
        let sw = self.sun_water();
        let cs = dot(d, sw).max(0.0);
        let phase = 0.8 + 0.6 * cs.powi(4) + 0.8 * cs.powi(24);
        let mut o = [0.0; 3];
        for i in 0..3 {
            let st = self.absorb[i] + self.scatter;
            let k = (st - self.absorb[i] * d[1]).max(1e-4);
            let fill = if smax.is_finite() { 1.0 - (-k * smax).exp() } else { 1.0 };
            o[i] = self.color[i] * st / k * (-self.absorb[i] * depth).exp() * fill * phase;
        }
        o
    }

    /// The sun's way under water: bent down towards the vertical (Snell).
    fn sun_water(&self) -> V3 {
        let s = self.sun;
        let h = (s[0] * s[0] + s[2] * s[2]).sqrt();
        if h < 1e-6 {
            return [0.0, 1.0, 0.0];
        }
        let sin_t = (h / 1.333).min(1.0);
        let cos_t = (1.0 - sin_t * sin_t).sqrt();
        [s[0] / h * sin_t, cos_t, s[2] / h * sin_t]
    }

    /// The surface seen from below at p, from the eye, with the wave's
    /// normal n (unit, out of the water): inside Snell's window (about 49°
    /// from the normal) the sky and the sun come through, bent, less what
    /// the surface mirrors (Fresnel); outside it the surface is a mirror of
    /// the water below (total internal reflection). Each wave tilts its
    /// own window, which makes the bright and dark net of a real surface.
    pub fn surface_color(&self, n: V3, p: V3, eye: V3) -> V3 {
        self.surface_seen(n, norm(sub(p, eye)), p)
    }

    /// `surface_color` for the unit way v from the eye.
    fn surface_seen(&self, n: V3, v: V3, p: V3) -> V3 {
        let n = if n[1] < 0.0 { mul(n, -1.0) } else { n };
        let c = dot(v, n);
        let refl = |c: f64| -> V3 {
            let r = norm(sub(v, mul(n, 2.0 * c)));
            let r = if r[1] > -0.02 { norm([r[0], -0.02, r[2]]) } else { r };
            self.backdrop(p[1] - 0.01, r)
        };
        if c <= 0.0 {
            return refl(c.max(0.0));
        }
        let (n1, n2) = (1.333, 1.0);
        let sin_i = (1.0 - c * c).max(0.0).sqrt();
        let sin_t = n1 / n2 * sin_i;
        if sin_t >= 1.0 {
            return refl(c);
        }
        let cos_t = (1.0 - sin_t * sin_t).sqrt();
        let rs = (n1 * c - n2 * cos_t) / (n1 * c + n2 * cos_t);
        let rp = (n1 * cos_t - n2 * c) / (n1 * cos_t + n2 * c);
        let r = ((rs * rs + rp * rp) / 2.0).clamp(0.0, 1.0);
        let eta = n1 / n2;
        // the way out into the air
        let t = norm(add(mul(v, eta), mul(n, cos_t - eta * c)));
        let s = dot(t, self.sun).max(0.0);
        // the sun and its glow: soft enough that a corner-lit wave keeps it round
        let glare = s.powi(150) * 6.0 + s.powi(24) * 0.9 + s.powi(4) * 0.15;
        let sky = add(mul(self.sky, 0.45 + 0.3 * t[1].max(0.0)), mul(self.sun_color, glare));
        add(mul(sky, 1.0 - r), mul(refl(c), r))
    }

    /// How much of each colour the light from above keeps at height y.
    fn down(&self, y: f64) -> V3 {
        let d = (self.surface - y).max(0.0);
        [(-self.absorb[0] * d).exp(), (-self.absorb[1] * d).exp(), (-self.absorb[2] * d).exp()]
    }

    /// What an eye at height y0 sees of colour `c` `dist` away along the
    /// unit way d: c dimmed by the water between, plus the light the water
    /// scatters into that stretch (see `backdrop`).
    fn seen(&self, c: V3, dist: f64, y0: f64, d: V3) -> V3 {
        let add_in = self.inscatter(y0, d, dist.max(0.0));
        let mut o = [0.0; 3];
        for i in 0..3 {
            let k = (-(self.absorb[i] + self.scatter) * dist.max(0.0)).exp();
            o[i] = c[i] * k + add_in[i];
        }
        o
    }

    /// The caustics' light at (x, z), y deep: about 1 on average, bright
    /// threads up to ~3 and dim cells between, fading towards 1 deeper down.
    pub fn caustic(&self, x: f64, y: f64, z: f64) -> f64 {
        if self.caustics <= 0.0 {
            return 1.0;
        }
        let depth = (self.surface - y).max(0.0);
        // the net grows and blurs with depth (the waves' lenses focus less)
        let s = self.scale * (1.0 + depth * 0.04);
        let v = caustic_net(x / s, z / s, self.time * 0.6);
        let fade = self.caustics * (-depth / 25.0).exp();
        // deeper the threads soften (a power below 1); minus the net's mean
        // there, so the floor is as bright on average as without caustics
        let p = 0.5 + 0.5 * (-depth / 15.0).exp();
        1.0 + fade * 3.5 * (v.powf(p) - 0.92 * 0.15f64.powf(p))
    }
}

/// A tiling net of bright threads 0…1 (the well-known turbulent sine
/// iteration for water caustics), one period across a unit.
pub fn caustic_net(u: f64, v: f64, t: f64) -> f64 {
    const TAU: f64 = std::f64::consts::TAU;
    let px = (u * TAU).rem_euclid(TAU) - 250.0;
    let py = (v * TAU).rem_euclid(TAU) - 250.0;
    let (mut ix, mut iy) = (px, py);
    let mut c = 1.0;
    let inten = 0.005;
    for n in 0..4 {
        let tt = t * (1.0 - 3.5 / (n as f64 + 1.0));
        let nx = px + (tt - ix).cos() + (tt + iy).sin();
        let ny = py + (tt - iy).sin() + (tt + ix).cos();
        ix = nx;
        iy = ny;
        let a = px / ((ix + tt).sin() / inten);
        let b = py / ((iy + tt).cos() / inten);
        c += 1.0 / (a * a + b * b).sqrt().max(1e-6);
    }
    c /= 4.0;
    let c = (1.17 - c.powf(1.4)).abs();
    c.powi(8).min(1.0)
}

pub struct Scene {
    pub active: bool,
    pub water: Option<Water>,
    /// the eye the frame is drawn from (for the water's way-dependent fog)
    fog_eye: std::cell::Cell<V3>,
    /// the first directional light's way and colour (the water's sun)
    sun_of_light: Option<(V3, V3)>,
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
    /// the host draws depth-tested triangles (set by the engine every frame)
    pub gl: bool,
    /// the host draws the whole stream with GL (rg_gl): the scene's objects
    /// are triangles even with globes and stars, and a layer command (kind 9)
    /// in the stream says where they go
    pub unified: bool,
    /// the host draws textured globes itself (draw kind 8, draw.rs `sphere`)
    pub textures: bool,
    /// the host draws a sphere command only inside a window (a planet's
    /// `detail` pictures)
    pub detail: bool,
    /// the host draws real heights (globe.rs `height`)
    pub terrain: bool,
    /// the game's folder (textures are given in it)
    pub dir: String,
    /// the host draws liquid splats (draw kind 10; set by the engine every frame)
    pub splats_ok: bool,
    /// the bytes of the "splats" file the next add reads (lib.rs reads them)
    pub splat_bytes: Option<Vec<u8>>,
    /// the game's shaders (rg.shader): name and rg_shader key ("" when it failed)
    shaders: Vec<(String, String)>,
    /// the last frame's triangles when `gl`: 6 floats a corner, x, y (the
    /// game's units, as the draw stream), depth 0 (near) … 1 (far), r, g, b (0…1).
    /// See-through faces (`opacity` below 1) come last, far ones first, with
    /// depth + 2 (2…3) and their colour already times the opacity: the host
    /// draws them at depth - 2, adding their colour (alpha 0 under premultiplied
    /// blending); a host that does not know this clips them away.
    /// Empty when the scene is off or drawn with the painter.
    pub tris: Vec<f32>,
    /// VR: the eye the triangles are drawn for (xr.rs), else the game camera
    pub eye: Option<crate::xr::Eye>,
    /// VR in a headset: the frame's own picture of the scene is not drawn
    /// (each eye's is, by `render_eye`)
    pub eyes_only: bool,
    /// Smooth lit meshes for per-pixel (Phong) light, only for a host that
    /// draws everything with GL (`unified`): 18 floats a corner, x, y, depth
    /// (as `tris`), the face's own colour r, g, b, the light that is the same
    /// everywhere on the face (ambient and point lights, worked out at the
    /// corner) r, g, b, the normal x, y, z and the way to the camera x, y, z
    /// (world, unit), shiny, fog 0…1, 0. The host adds the directional lights
    /// of `plights` a pixel (Blinn-Phong, power 24, as `shade_shiny`).
    pub ptris: Vec<f32>,
    /// the directional lights for `ptris` (at most 4), 8 floats each: the way
    /// to the light x, y, z (unit), intensity, colour r, g, b, the glint's
    /// strength (intensity, at most 1.5); then the fog's colour r, g, b and 0
    /// as the last 4 floats
    pub plights: Vec<f32>,
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
    /// material.shader: a game shader's name (rg.shader, kind "surface"), "" for the engine's look
    shader: String,
    /// material.u as "name=1;tint=1,0.5,0.2" (u_ + name in the GLSL)
    uniforms: String,
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

/// A burst spark on the screen (eye space `vh`, and `vt` where it was a
/// streak ago): four corners (x, y) with how much of its colour each carries,
/// and how bright it is. A square, or along its motion a thin kite: the tip
/// ahead, the head's sides, the tail (0: it fades out to there). A spark
/// smaller than half a pixel stays half a pixel and is dimmer by its area;
/// a long streak is dimmer, as a moving light is spread over its path.
/// None: off the screen.
fn spark_shape(vh: V3, vt: Option<V3>, size: f64, focal: f64, w: f64, h: f64, near: f64) -> Option<([[f64; 2]; 4], [f64; 4], f64)> {
    let mut px = size * focal / vh[2];
    let mut bright = 1.0;
    if px < 0.5 {
        bright = (px / 0.5) * (px / 0.5);
        px = 0.5;
    }
    let px = px.min(40.0);
    let x = w / 2.0 + vh[0] / vh[2] * focal;
    let y = h / 2.0 - vh[1] / vh[2] * focal;
    if let Some(t) = vt.filter(|t| t[2] >= near) {
        let tx = w / 2.0 + t[0] / t[2] * focal;
        let ty = h / 2.0 - t[1] / t[2] * focal;
        let (dx, dy) = (x - tx, y - ty);
        let l = (dx * dx + dy * dy).sqrt();
        if l > 1.5 * px {
            let (nx, ny) = (dx / l, dy / l);
            let (l, tx, ty) = if l > 400.0 { (400.0, x - nx * 400.0, y - ny * 400.0) } else { (l, tx, ty) };
            if (x.max(tx) < -px) || (y.max(ty) < -px) || (x.min(tx) > w + px) || (y.min(ty) > h + px) {
                return None;
            }
            let (qx, qy) = (-ny * px, nx * px);
            let pts = [[x + nx * px, y + ny * px], [x + qx, y + qy], [tx, ty], [x - qx, y - qy]];
            return Some((pts, [1.0, 1.0, 0.0, 1.0], bright * (3.0 * px / l).sqrt().min(1.0)));
        }
    }
    if x < -px || y < -px || x > w + px || y > h + px {
        return None;
    }
    Some(([[x - px, y - px], [x + px, y - px], [x + px, y + px], [x - px, y + px]], [1.0; 4], bright))
}

/// A burst particle's colour bucket: 5 bits a channel (the painter draws one
/// path a bucket).
fn burst_key(c: V3) -> u32 {
    let q = |x: f64| ((x.clamp(0.0, 1.0) * 31.0).round()) as u32;
    q(c[0]) << 10 | q(c[1]) << 5 | q(c[2])
}

/// A point (view space, the eye at 0) behind one of the planets' balls.
fn hidden(v: V3, discs: &[(V3, f64)]) -> bool {
    let l = dot(v, v).sqrt();
    if l <= 0.0 {
        return false;
    }
    let dir = mul(v, 1.0 / l);
    discs.iter().any(|(c, r)| {
        let t = dot(*c, dir);
        let d2 = dot(*c, *c) - t * t;
        d2 < r * r && t > 0.0 && t - (r * r - d2).sqrt() < l
    })
}

struct Poly {
    /// the sort key: (outer layer, outer depth, group, layer, depth); a poly
    /// of no group has its own layer and depth as the outer ones
    olayer: i32,
    odepth: f64,
    group: i32,
    layer: i32,
    depth: f64,
    pts: Vec<f32>,
    rgb: V3,
    /// 1 solid, less: see-through (Obj `opacity`)
    alpha: f64,
    /// several rings in `pts` (their ends, as DrawStream's), or empty: one
    ends: Vec<f32>,
    /// its colour added to what is under it (burst sparks)
    added: bool,
}

fn get3(a: &Json, keys: [&str; 3], d: V3) -> V3 {
    [a.get(keys[0]).as_num(d[0]), a.get(keys[1]).as_num(d[1]), a.get(keys[2]).as_num(d[2])]
}

impl Scene {
    pub fn new() -> Scene {
        let mut s = Scene {
            active: false,
            water: None,
            fog_eye: std::cell::Cell::new([0.0; 3]),
            sun_of_light: None,
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
            gl: false,
            unified: false,
            ptris: Vec::new(),
            plights: Vec::new(),
            textures: false,
            detail: false,
            terrain: false,
            dir: String::new(),
            splats_ok: false,
            splat_bytes: None,
            shaders: Vec::new(),
            tris: Vec::new(),
            eye: None,
            eyes_only: false,
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
            Light { id: "ambient".into(), kind: "ambient".into(), color: [1.0, 1.0, 1.0], intensity: 0.55, pos: [0.0; 3], range: 0.0, sky: [0.0; 3], cone: None },
            Light { id: "sun".into(), kind: "directional".into(), color: [1.0, 1.0, 1.0], intensity: 0.75, pos: [3.0, 6.0, 4.0], range: 0.0, sky: [0.0; 3], cone: None },
        ];
    }

    pub fn command(&mut self, op: &str, a: &Json) {
        match op {
            "clear" => {
                let dir = std::mem::take(&mut self.dir);
                *self = Scene::new();
                self.dir = dir;
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
                match a.get("water") {
                    Json::Null => {}
                    Json::Bool(false) => self.water = None,
                    w => self.water = Some(Water::from(&w, self.water)),
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
                if a.get("type").as_str() == "directional" && !self.lights.iter().any(|l| l.kind == "directional" && l.id != id) {
                    self.sun_of_light = Some((norm(get3(a, ["x", "y", "z"], [0.0, 5.0, 0.0])), color(&a.get("color"), [1.0; 3])));
                }
                let kind = { let k = a.get("type").as_str(); if k.is_empty() { "point".to_string() } else { k } };
                let l = Light {
                    id: id.clone(),
                    kind,
                    color: color(&a.get("color"), [1.0; 3]),
                    intensity: a.get("intensity").as_num(1.0),
                    pos: get3(a, ["x", "y", "z"], [0.0, 5.0, 0.0]),
                    range: a.get("range").as_num(10.0),
                    sky: color(&a.get("sky"), [0.0; 3]),
                    cone: match a.get("dir") {
                        Json::Arr(v) if v.len() >= 3 => Some((norm([v[0].as_num(0.0), v[1].as_num(0.0), v[2].as_num(-1.0)]), a.get("cone").as_num(0.5).cos())),
                        _ => None,
                    },
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
                let label = if shape == "label" { Some(Label::new(a)) } else { None };
                let hf = shape == "heightfield";
                let o = Obj {
                    id: id.clone(),
                    label,
                    mesh: obj_mesh(a, &shape, &size, None),
                    hf: if hf { Some(size.clone()) } else { None },
                    color: color(&a.get("color"), [0.8, 0.8, 0.8]),
                    pos: get3(a, ["x", "y", "z"], [0.0; 3]),
                    rot: get3(a, ["rx", "ry", "rz"], [0.0; 3]),
                    scale: get3(a, ["sx", "sy", "sz"], [1.0; 3]),
                    visible: !matches!(a.get("visible"), Json::Bool(false)),
                    emissive: a.get("emissive").as_bool(),
                    double: a.get("double").as_bool() || shape == "plane",
                    shiny: a.get("shiny").as_num(0.0).clamp(0.0, 1.0),
                    env: a.get("env").as_num(0.0).clamp(0.0, 1.0),
                    smooth: a.get("smooth").as_bool() || a.get("surface").as_bool(),
                    wsurf: a.get("surface").as_bool(),
                    opacity: a.get("opacity").as_num(1.0).clamp(0.0, 1.0),
                    layer: a.get("layer").as_num(0.0) as i32,
                    wy: a.get("wy").as_num(0.0),
                    group: a.get("group").as_num(0.0) as i32,
                    puffs: a.get("puffs").items().iter().map(|v| v.as_num(0.0)).collect(),
                    dust: shape == "dust",
                    burst: if shape == "burst" { Some(Box::new(crate::burst::Burst::new(a))) } else { None },
                    splats: if shape == "splats" {
                        self.splat_bytes.take().and_then(crate::splats::Splats::new).map(|r| Box::new(SplatRun::new(r, a)))
                    } else {
                        None
                    },
                    forms: Vec::new(),
                    lod_px: Vec::new(),
                    lod_at: 0,
                    lod_r: 0.0,
                    lod_margin: a.get("lodMargin").as_num(0.15).clamp(0.0, 0.9),
                };
                let mut o = o;
                lod_forms(&mut o, a, &shape, &size);
                self.objs.retain(|x| x.id != id || id.is_empty());
                self.objs.push(o);
            }
            "set" => {
                let id = a.get("id").as_str();
                if let Some(o) = self.objs.iter_mut().find(|x| x.id == id) {
                    o.pos = get3(a, ["x", "y", "z"], o.pos);
                    o.rot = get3(a, ["rx", "ry", "rz"], o.rot);
                    o.wy = a.get("wy").as_num(o.wy);
                    o.scale = get3(a, ["sx", "sy", "sz"], o.scale);
                    if !a.get("color").is_null() {
                        o.color = color(&a.get("color"), o.color);
                    }
                    if let Json::Bool(v) = a.get("visible") {
                        o.visible = v;
                    }
                    if !a.get("shiny").is_null() {
                        o.shiny = a.get("shiny").as_num(0.0).clamp(0.0, 1.0);
                    }
                    if !a.get("env").is_null() {
                        o.env = a.get("env").as_num(0.0).clamp(0.0, 1.0);
                    }
                    if !a.get("opacity").is_null() {
                        o.opacity = a.get("opacity").as_num(1.0).clamp(0.0, 1.0);
                    }
                    if !a.get("puffs").is_null() {
                        o.puffs = a.get("puffs").items().iter().map(|v| v.as_num(0.0)).collect();
                    }
                    if let Some(sp) = o.splats.as_mut() {
                        sp.set(a);
                    }
                    if let Some(l) = o.label.as_mut() {
                        l.set(a);
                    }
                    if let Some(b) = o.burst.as_mut() {
                        b.time = a.get("time").as_num(b.time);
                        b.bright = a.get("bright").as_num(b.bright).max(0.0);
                        b.set_look(a);
                    }
                    if let Some(size) = &o.hf {
                        if !a.get("heights").is_null() {
                            let hs: Vec<f64> = a.get("heights").items().iter().map(|v| v.as_num(0.0)).collect();
                            o.mesh = heightfield(size, &hs);
                        }
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
                        self.planets.push(Planet { id: id.clone(), globe: g, pos: [0.0; 3], r: 1.0, spin: 0.0, tilt: 0.0, glowing: false, shader: String::new(), uniforms: String::new() });
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
                let m = a.get("material");
                if let Json::Obj(_) = m {
                    if let Json::Str(sh) = m.get("shader") {
                        p.shader = sh.clone();
                    }
                    if let Json::Obj(u) = m.get("u") {
                        p.uniforms = uniforms_text(&u);
                    }
                }
                p.globe.command(a);
                p.globe.texture_in(&self.dir);
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
        if let (Some(w), Some((d, c))) = (self.water.as_mut(), self.sun_of_light) {
            w.sun = d;
            w.sun_color = c;
        }
    }

    fn shade(&self, n: V3, centre: V3, base: V3) -> V3 {
        self.shade_shiny(n, centre, base, 0.0, centre, 0.0)
    }

    /// What a mirror with the normal n shows towards the eye (unit, to the
    /// camera) of the "env" lights: the ground below their horizon, the sky
    /// above it, with a soft edge
    fn env_light(&self, n: V3, eye: V3) -> V3 {
        let mut c = [0.0, 0.0, 0.0];
        for l in self.lights.iter().filter(|l| l.kind == "env") {
            let r = sub(mul(n, 2.0 * dot(n, eye)), eye);
            let t = dot(r, norm(l.pos));
            let x = ((0.08 - t) / 0.2).clamp(0.0, 1.0);
            let g = x * x * (3.0 - 2.0 * x);
            c = add(c, mul(add(mul(l.sky, 1.0 - g), mul(l.color, g)), l.intensity));
        }
        c
    }

    /// `shade` with a glint: each directional or point light adds white of
    /// its colour where the face's normal is near the half-way direction
    /// between the light and the camera (Blinn-Phong, one value per face)
    fn shade_shiny(&self, n: V3, centre: V3, base: V3, shiny: f64, cam: V3, env: f64) -> V3 {
        let mut light = [0.0, 0.0, 0.0];
        let mut glint = [0.0, 0.0, 0.0];
        let eye = norm(sub(cam, centre));
        // under water the light from above has lost colour on its way down
        let (down, net) = match &self.water {
            Some(w) => (w.down(centre[1]), w.caustic(centre[0], centre[1], centre[2])),
            None => ([1.0; 3], 1.0),
        };
        for l in self.lights.iter() {
            let k = match l.kind.as_str() {
                "ambient" => l.intensity,
                "env" => 0.0,
                "directional" => dot(n, norm(l.pos)).max(0.0) * l.intensity * net,
                _ => {
                    let d = sub(l.pos, centre);
                    let dist = dot(d, d).sqrt();
                    let fall = (1.0 - dist / l.range.max(0.01)).max(0.0);
                    // a spot (cone: `x, y, z` the place, `dir` and `cone` set) lights only ahead
                    let spot = match l.cone {
                        Some((dir, cos_out)) => {
                            let c = dot(mul(norm(d), -1.0), dir);
                            ((c - cos_out) / (1.0 - cos_out).max(1e-3) * 2.5).clamp(0.0, 1.0)
                        }
                        None => 1.0,
                    };
                    dot(n, norm(d)).max(0.0) * l.intensity * fall * fall * spot
                }
            };
            let lc = if l.kind != "ambient" && l.kind != "directional" && l.kind != "env" && self.water.is_some() {
                // under water a lamp's light loses colour on its way (red first)
                let w = self.water.as_ref().unwrap();
                let d = sub(l.pos, centre);
                let dist = dot(d, d).sqrt();
                [l.color[0] * (-w.absorb[0] * dist).exp(), l.color[1] * (-w.absorb[1] * dist).exp(), l.color[2] * (-w.absorb[2] * dist).exp()]
            } else if l.kind == "ambient" || l.kind == "directional" { [l.color[0] * down[0], l.color[1] * down[1], l.color[2] * down[2]] } else { l.color };
            light = add(light, mul(lc, k));
            if shiny > 0.0 && l.kind != "ambient" && l.kind != "env" && k > 0.0 {
                let to = if l.kind == "directional" { norm(l.pos) } else { norm(sub(l.pos, centre)) };
                let h = norm(add(to, eye));
                let s = dot(n, h).max(0.0).powi(24) * shiny * l.intensity.min(1.5);
                glint = add(glint, mul(l.color, s));
            }
        }
        if env > 0.0 {
            light = add(light, mul(self.env_light(n, eye), env));
        }
        [base[0] * light[0] + glint[0], base[1] * light[1] + glint[1], base[2] * light[2] + glint[2]]
    }

    /// The part of `shade` that the host's per-pixel light leaves out: the
    /// ambient and the point lights (no glint), times nothing yet
    fn rest_light(&self, n: V3, at: V3) -> V3 {
        let mut light = [0.0, 0.0, 0.0];
        for l in self.lights.iter() {
            let k = match l.kind.as_str() {
                "ambient" => l.intensity,
                "directional" | "env" => 0.0,
                _ => {
                    let d = sub(l.pos, at);
                    let dist = dot(d, d).sqrt();
                    let fall = (1.0 - dist / l.range.max(0.01)).max(0.0);
                    dot(n, norm(d)).max(0.0) * l.intensity * fall * fall
                }
            };
            light = add(light, mul(l.color, k));
        }
        light
    }

    /// How much of the fog's colour a point `dist` away takes (0…1).
    fn fog_k(&self, dist: f64) -> f64 {
        if let Some(w) = &self.water {
            return 1.0 - (-(w.absorb[1] + w.scatter) * dist.max(0.0)).exp();
        }
        match self.fog {
            Some((near, far)) if far > near => ((dist - near) / (far - near)).clamp(0.0, 1.0),
            _ => 0.0,
        }
    }

    /// `fogged` for a point p (under water the fog depends on the way).
    fn fogged_at(&self, c: V3, p: V3) -> V3 {
        let e = self.fog_eye.get();
        let d = sub(p, e);
        let dist = dot(d, d).sqrt();
        match &self.water {
            Some(w) => w.seen(c, dist, e[1], if dist > 1e-9 { mul(d, 1.0 / dist) } else { [0.0, 0.0, -1.0] }),
            None => self.fogged(c, dist),
        }
    }

    fn fogged(&self, c: V3, dist: f64) -> V3 {
        if let Some(w) = &self.water {
            // no point given: as if level
            let e = self.fog_eye.get();
            return w.seen(c, dist, e[1], [0.0, 0.0, -1.0]);
        }
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
        self.tris.clear();
        self.ptris.clear();
        self.plights.clear();
        if !self.active {
            return;
        }
        for o in self.objs.iter_mut() {
            if let Some(b) = o.burst.as_mut() {
                b.advance();
            }
        }
        self.pick_lods(w, h);
        if self.eyes_only {
            return;
        }
        self.draw_view(out, w, h);
    }

    /// Whether a VR eye needs its own draw stream (`render_eye_stream`):
    /// planets, stars or baked particle runs, which the host draws.
    pub fn needs_stream(&self) -> bool {
        self.active && (!self.planets.is_empty() || !self.stars.is_empty() || self.objs.iter().any(|o| (o.splats.is_some() || o.label.is_some()) && o.visible))
    }

    /// One VR eye as a whole draw stream into `out` (the sky, planets, stars,
    /// particle runs, and the shapes as triangles in `tris`), for an eye with
    /// a symmetric view (`Eye::symmetric`): its units are `eye.size()`.
    pub fn render_eye_stream(&mut self, eye: crate::xr::Eye, out: &mut DrawStream) {
        self.tris.clear();
        if !self.active {
            return;
        }
        let (w, h) = eye.size();
        self.eye = Some(eye);
        self.draw_view(out, w, h);
        self.eye = None;
    }

    /// The scene into `out` from the camera (or `eye`), `w` x `h` units,
    /// the labels on top.
    fn draw_view(&mut self, out: &mut DrawStream, w: f64, h: f64) {
        self.draw_shapes(out, w, h);
        self.draw_labels(out, w, h);
    }

    /// The labels (shape "label") where their places fall in the view.
    fn draw_labels(&self, out: &mut DrawStream, w: f64, h: f64) {
        let (eye, r, u, f, focal, cx, cy) = self.view_basis(w, h);
        // an eye's units are finer than a phone's: the same angle on the screen
        let k = if self.eye.is_some() { 1.4 } else { 1.0 };
        for o in self.objs.iter() {
            let l = match o.label.as_ref() {
                Some(l) if o.visible && !l.text.is_empty() => l,
                _ => continue,
            };
            let d = sub(o.pos, eye);
            let z = dot(d, f);
            if z <= 0.0 {
                continue;
            }
            let x = cx + dot(d, r) / z * focal;
            let y = cy - dot(d, u) / z * focal;
            let size = l.size * k;
            let tw = size * 0.6 * l.text.chars().count() as f64;
            let (x, y) = (x + l.dx * k, y + l.dy * k);
            let left = match l.align { 0 => x - tw / 2.0, 1 => x, _ => x - tw };
            if left > w || left + tw < 0.0 || y - size > h || y + size < 0.0 {
                continue;
            }
            out.text(left, y - size * 0.6, tw, size * 1.2, l.color, l.opacity * o.opacity, size, &l.text, &l.weight);
        }
    }

    /// The scene without the labels.
    fn draw_shapes(&mut self, out: &mut DrawStream, w: f64, h: f64) {
        if self.gl && self.globe.is_none() && self.planets.is_empty() && self.stars.is_empty() {
            self.render_gl(w, h, true);
            if self.unified {
                out.scene_layer3d(0, self.tris.len(), !self.ptris.is_empty());
            }
            self.render_splats(out, w, h);
            return;
        }
        if let Some((top, bottom)) = self.sky {
            out.raw(0, 0.0, 0.0, w, h, top, Some(bottom), &[]);
        }
        // (the map globe is flat on the screen: not in VR)
        if let Some(g) = self.globe.as_mut().filter(|_| self.eye.is_none()) {
            g.render(out, w, h);
        }
        // the camera, or a VR eye (symmetric there: its middle is w/2, h/2)
        let (eye, r, u, f, focal, _, _) = self.view_basis(w, h);
        self.fog_eye.set(eye);
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
            let cam3 = crate::globe::Cam3 { eye, right: r, up: u, fwd: f, focal, w, h, near: near * 0.2 };
            let mut order: Vec<(f64, usize)> = self.planets.iter().enumerate().map(|(i, p)| {
                let d = sub(p.pos, eye);
                (dot(d, d).sqrt() - p.r, i)
            }).collect();
            order.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
            let sun = self.sun;
            for (_, i) in order {
                let key = self.shader_key(&self.planets[i].shader).to_string();
                let p = &mut self.planets[i];
                let place = crate::globe::Place3 { centre: p.pos, radius: p.r, axes: p.axes() };
                p.globe.detail_ok = self.detail;
                p.globe.terrain_ok = self.terrain;
                let at = out.nums.len();
                p.globe.render_3d(out, &cam3, &place, sun, p.glowing, self.textures);
                if !key.is_empty() {
                    out.spheres_shader(at, &key, &p.uniforms, p.globe.flow_time());
                }
            }
        }
        if self.gl && self.unified {
            // the objects in front of the sky, the globes and the stars, depth-tested
            self.render_gl(w, h, false);
            out.scene_layer3d(0, self.tris.len(), !self.ptris.is_empty());
            self.render_splats(out, w, h);
            return;
        }
        let cam = eye;
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

        // the middle of each group, as the mean depth of its objects
        let mut groups: Vec<(i32, f64, f64)> = Vec::new();
        for o in self.objs.iter() {
            if o.group != 0 && o.visible {
                let z = to_view(o.pos)[2];
                match groups.iter_mut().find(|g| g.0 == o.group) {
                    Some(g) => { g.1 += z; g.2 += 1.0; }
                    None => groups.push((o.group, z, 1.0)),
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
            let (sw, cw) = o.wy.sin_cos();
            let gdepth = groups.iter().find(|g| g.0 == o.group).map(|g| g.1 / g.2);
            // three.js's XYZ order: v' = Rx * Ry * Rz * (scale * v), then the world turn wy
            let world: Vec<V3> = o.mesh.verts.iter().map(|v| {
                let p = [v[0] * o.scale[0], v[1] * o.scale[1], v[2] * o.scale[2]];
                let p = [p[0] * cz - p[1] * sz, p[0] * sz + p[1] * cz, p[2]];
                let p = [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy];
                let p = [p[0], p[1] * cx - p[2] * sx, p[1] * sx + p[2] * cx];
                let p = if o.wy != 0.0 { [p[0] * cw + p[2] * sw, p[1], -p[0] * sw + p[2] * cw] } else { p };
                add(p, o.pos)
            }).collect();
            if o.opacity <= 0.0 {
                continue;
            }
            for pf in o.puffs.chunks_exact(if o.dust { 8 } else { 6 }) {
                let c = add(o.pos, [pf[0], pf[1], pf[2]]);
                let v = to_view(c);
                let rgb = self.fogged_at(mul(o.color, pf[5]), c);
                let rings = if o.dust { dust_rings(v, pf, focal, w, h, near) } else { puff_rings(v, pf[3], focal, w, h, near) };
                for (pts, k) in rings {
                    let alpha = (pf[4] * k * o.opacity).clamp(0.0, 0.999);
                    if alpha < 0.004 {
                        continue;
                    }
                    let pts: Vec<f32> = pts.iter().map(|x| *x as f32).collect();
                    let (olayer, odepth, group) = match gdepth { Some(g) => (0, g, o.group), None => (o.layer, v[2], 0) };
                    polys.push(Poly { olayer, odepth, group, layer: o.layer, depth: v[2], pts, rgb, alpha, ends: Vec::new(), added: false });
                }
            }
            // burst particles: tiny squares, one path a colour (hidden behind the planets)
            // (look "glow" on a host with GPU splats: soft sprites, render_splats)
            if let Some(b) = o.burst.as_ref().filter(|b| !(b.glow && self.splats_ok)) {
                let discs: Vec<(V3, f64)> = self.planets.iter().map(|p| (to_view(p.pos), p.r)).collect();
                let mut buckets: Vec<(u32, V3, Vec<f32>, Vec<f32>)> = Vec::new();
                let streak = b.streak;
                b.each(|lp, lv, size, c| {
                    let wp = add(o.pos, lp);
                    let v = to_view(wp);
                    if v[2] < near || hidden(v, &discs) {
                        return;
                    }
                    let vt = if streak > 0.0 { Some(to_view(sub(wp, mul(lv, streak)))) } else { None };
                    let (pts, wts, k) = match spark_shape(v, vt, size, focal, w, h, near) {
                        Some(s) => s,
                        None => return,
                    };
                    // one colour a path: a streak's fading tail as half its light
                    let k = if wts[2] < 0.5 { k * 0.6 } else { k };
                    let rgb = mul(self.fogged_at(c, wp), k);
                    let key = burst_key(rgb);
                    let k = match buckets.iter().position(|e| e.0 == key) {
                        Some(k) => k,
                        None => {
                            buckets.push((key, rgb, Vec::new(), Vec::new()));
                            buckets.len() - 1
                        }
                    };
                    let e = &mut buckets[k];
                    for p in pts.iter() {
                        e.2.extend_from_slice(&[p[0] as f32, p[1] as f32]);
                    }
                    e.3.push(e.2.len() as f32);
                });
                let z = to_view(o.pos)[2];
                let alpha = (o.opacity * 0.999).clamp(0.0, 0.999);
                for (_, rgb, pts, ends) in buckets {
                    let (olayer, odepth, group) = match gdepth { Some(g) => (0, g, o.group), None => (o.layer, z, 0) };
                    polys.push(Poly { olayer, odepth, group, layer: o.layer, depth: z, pts, rgb, alpha, ends, added: true });
                }
            }
            for (fi, face) in o.mesh.faces.iter().enumerate() {
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
                let (fc, unlit) = o.mesh.face_paint(fi, o.color, o.emissive);
                let lit = if unlit { fc } else { self.shade_shiny(n, centre, fc, o.shiny, cam, o.env) };
                let dist = dot(towards, towards).sqrt();
                let depth = view.iter().map(|p| p[2]).sum::<f64>() / view.len() as f64;
                let (olayer, odepth, group) = match gdepth { Some(g) => (0, g, o.group), None => (o.layer, depth, 0) };
                polys.push(Poly { olayer, odepth, group, layer: o.layer, depth, pts: grow(pts), rgb: self.fogged_at(lit, centre), alpha: o.opacity, ends: Vec::new(), added: false });
            }
        }
        let far = |a: f64, b: f64| b.partial_cmp(&a).unwrap_or(std::cmp::Ordering::Equal);
        polys.sort_by(|a, b| a.olayer.cmp(&b.olayer).then(far(a.odepth, b.odepth)).then(a.group.cmp(&b.group))
            .then(a.layer.cmp(&b.layer)).then(far(a.depth, b.depth)));
        // neighbouring faces of one colour go out as one path of several rings
        let mut i = 0;
        while i < polys.len() {
            let rgb = q(polys[i].rgb);
            let alpha = polys[i].alpha;
            if polys[i].added {
                out.rings_added(rgb_f(rgb), alpha, &polys[i].pts, &polys[i].ends);
                self.drawn += 1;
                i += 1;
                continue;
            }
            let mut j = i;
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            while j < polys.len() && q(polys[j].rgb) == rgb && polys[j].alpha == alpha && !polys[j].added && (j - i < 24 || !polys[j].ends.is_empty()) {
                let base = pts.len() as f32;
                pts.extend_from_slice(&polys[j].pts);
                if polys[j].ends.is_empty() {
                    ends.push(pts.len() as f32);
                } else {
                    ends.extend(polys[j].ends.iter().map(|e| base + e));
                }
                j += 1;
            }
            if alpha < 1.0 {
                out.rings(6, rgb_f(rgb), alpha, 0.0, &pts, &ends);
            } else {
                out.raw_rings(rgb_f(rgb), &pts, &ends);
            }
            self.drawn += j - i;
            i = j;
        }
        self.render_splats(out, w, h);
    }

    /// A game shader's key (rg.shader), or "" (lib.rs).
    pub fn set_shader(&mut self, name: &str, key: &str) {
        self.shaders.retain(|s| s.0 != name);
        self.shaders.push((name.to_string(), key.to_string()));
    }

    fn shader_key(&self, name: &str) -> &str {
        if name.is_empty() {
            return "";
        }
        self.shaders.iter().find(|s| s.0 == name).map(|s| s.1.as_str()).unwrap_or("")
    }

    /// Baked particle runs, over the shapes: liquid splats (kind 10), or
    /// added squares where the host cannot draw them.
    fn render_splats(&self, out: &mut DrawStream, w: f64, h: f64) {
        let glow = |o: &Obj| o.burst.as_ref().is_some_and(|b| b.glow) && self.splats_ok;
        if !self.objs.iter().any(|o| (o.splats.is_some() || glow(o)) && o.visible) {
            return;
        }
        // the camera, or a VR eye (symmetric: its middle is w/2, h/2)
        let (cam, r, u, f, focal, _, _) = self.view_basis(w, h);
        let near = 0.05;
        let to_view = |p: V3| -> V3 {
            let d = sub(p, cam);
            [dot(d, r), dot(d, u), dot(d, f)]
        };
        for o in self.objs.iter() {
            // a burst's sparks as glowing sprites (look "glow")
            if let (Some(b), true) = (o.burst.as_ref(), glow(o) && o.visible && o.opacity > 0.0) {
                let discs: Vec<(V3, f64)> = self.planets.iter().map(|p| (to_view(p.pos), p.r)).collect();
                let mut pts: Vec<f32> = Vec::new();
                b.each_u(|lp, _, size, _, u| {
                    let v = to_view(add(o.pos, lp));
                    if v[2] < near || hidden(v, &discs) {
                        return;
                    }
                    let px = (size * 1.6 * focal / v[2]).clamp(0.5, 200.0);
                    let x = w / 2.0 + v[0] / v[2] * focal;
                    let y = h / 2.0 - v[1] / v[2] * focal;
                    if x < -px || y < -px || x > w + px || y > h + px {
                        return;
                    }
                    pts.extend_from_slice(&[x as f32, y as f32, px as f32, u as f32]);
                });
                let pal = b.life_palette(32);
                let key = self.shader_key(&b.shader);
                if let Some(at) = out.splats(w, h, o.opacity * b.bright, 0.5, 0.0, &pal, [0.0, 0.0, 1.0], &pts) {
                    out.splats_glow(at);
                    if !key.is_empty() {
                        out.splats_shader(at, key, &b.uniforms, b.sim_time());
                    }
                }
                continue;
            }
            let sp = match (&o.splats, o.visible) {
                (Some(sp), true) => sp,
                _ => continue,
            };
            let discs: Vec<(V3, f64)> = self.planets.iter().map(|p| (to_view(p.pos), p.r)).collect();
            let mut pts: Vec<f32> = Vec::new();
            let pal = &sp.palette;
            let mut squares: Vec<(u32, V3, Vec<f32>, Vec<f32>)> = Vec::new();
            sp.run.each(|p, r, t, _| {
                let v = to_view(sp.world(o.pos, p));
                if v[2] < near || hidden(v, &discs) {
                    return;
                }
                let px = (r * sp.scale * focal / v[2]).clamp(0.4, sp.max);
                let x = w / 2.0 + v[0] / v[2] * focal;
                let y = h / 2.0 - v[1] / v[2] * focal;
                if x < -px || y < -px || x > w + px || y > h + px {
                    return;
                }
                if self.splats_ok {
                    pts.extend_from_slice(&[x as f32, y as f32, px as f32, t as f32]);
                    return;
                }
                let xq = t * (pal.len() - 1) as f64;
                let k = (xq.floor() as usize).min(pal.len().saturating_sub(2));
                let fr = xq - k as f64;
                let a = pal[k];
                let b = pal[(k + 1).min(pal.len() - 1)];
                let c = [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr];
                let key = burst_key(c);
                let i = match squares.iter().position(|e| e.0 == key) {
                    Some(i) => i,
                    None => {
                        squares.push((key, c, Vec::new(), Vec::new()));
                        squares.len() - 1
                    }
                };
                let e = &mut squares[i];
                let q = (px * 0.7) as f32;
                let (x, y) = (x as f32, y as f32);
                e.2.extend_from_slice(&[x - q, y - q, x + q, y - q, x + q, y + q, x - q, y + q]);
                e.3.push(e.2.len() as f32);
            });
            if self.splats_ok {
                let c = sp.world(o.pos, [0.0; 3]);
                let l = match self.sun {
                    Some(s) => norm(sub(s, c)),
                    None => norm(sub(cam, c)),
                };
                let key = if sp.gas { "" } else { self.shader_key(&sp.shader) };
                let at = out.splats(w, h, o.opacity, sp.res, if sp.gas { sp.density } else { 0.0 }, pal, [dot(l, r), -dot(l, u), -dot(l, f)], &pts);
                if let (Some(at), false) = (at, key.is_empty()) {
                    out.splats_shader(at, key, &sp.uniforms, sp.run.time);
                }
            } else {
                for (_, c, p, e) in squares {
                    out.rings_added(c, (o.opacity * 0.6).min(0.999), &p, &e);
                }
            }
        }
    }

    /// The camera: position, right, up, forward, focal length and the point
    /// straight ahead on the screen. In VR (`eye` set) the eye's.
    /// Each object with forms of detail (lod.rs) in the form its size on the
    /// screen calls for, seen from the game camera (a headset's two eyes see
    /// the same form). Drawn live every frame in that form.
    fn pick_lods(&mut self, w: f64, h: f64) {
        if !self.objs.iter().any(|o| !o.lod_px.is_empty()) {
            return;
        }
        let (cam, _, _, _) = self.rig();
        let focal = if self.eye.is_some() { crate::xr::K } else { (h.max(1.0) / 2.0) / (self.fov.to_radians() / 2.0).tan() };
        let _ = w;
        for o in self.objs.iter_mut() {
            if o.lod_px.is_empty() {
                continue;
            }
            let d = sub(o.pos, cam);
            let k = o.scale[0].abs().max(o.scale[1].abs()).max(o.scale[2].abs());
            let size = crate::lod::screen_size(o.lod_r * k, dot(d, d).sqrt(), focal);
            let step = crate::lod::pick(size, &o.lod_px, o.lod_at, o.lod_margin);
            if step != o.lod_at {
                // the form in use back to its slot, the new one out of its slot
                std::mem::swap(&mut o.mesh, &mut o.forms[o.lod_at]);
                std::mem::swap(&mut o.mesh, &mut o.forms[step]);
                o.lod_at = step;
            }
        }
    }

    /// The step of detail object `id` is drawn in (0: its finest form), if it has forms.
    pub fn lod_step(&self, id: &str) -> Option<usize> {
        self.objs.iter().find(|o| o.id == id && !o.lod_px.is_empty()).map(|o| o.lod_at)
    }

    fn view_basis(&self, w: f64, h: f64) -> (V3, V3, V3, V3, f64, f64, f64) {
        if let Some(e) = self.eye {
            let (cx, cy) = e.centre();
            return (e.pos, e.r, e.u, e.f, crate::xr::K, cx, cy);
        }
        let (cam, r, u, f) = self.rig();
        let focal = (h / 2.0) / (self.fov.to_radians() / 2.0).tan();
        (cam, r, u, f, focal, w / 2.0, h / 2.0)
    }

    /// The game camera (the VR rig): position, right, up, forward.
    pub fn rig(&self) -> (V3, V3, V3, V3) {
        let f = norm(sub(self.look, self.cam));
        let mut r = norm(cross(f, self.up));
        if dot(r, r) < 0.5 {
            r = norm(cross(f, [1.0, 0.0, 0.0]));
            if dot(r, r) < 0.5 {
                r = [1.0, 0.0, 0.0];
            }
        }
        let u = cross(r, f);
        (self.cam, r, u, f)
    }

    /// The scene's triangles for one VR eye (into `tris`, in the eye's units,
    /// `Eye::size`). A scene with planets or stars needs a whole stream
    /// instead (`needs_stream`, `render_eye_stream`).
    pub fn render_eye(&mut self, eye: crate::xr::Eye) {
        self.tris.clear();
        if !self.active || self.globe.is_some() || !self.planets.is_empty() || !self.stars.is_empty() {
            return;
        }
        let (w, h) = eye.size();
        self.eye = Some(eye);
        self.render_gl(w, h, true);
        self.eye = None;
    }

    /// The scene as depth-tested triangles into `self.tris` (see `tris`).
    /// The sky and the floor are the background (depth 1, drawn in order); the
    /// shapes get their real depth, as 1/z so that it is right everywhere on a
    /// face. A higher `layer` is pulled a hair nearer, so that a thing lying on a
    /// face (a window on a wall) wins over the face rather than flickering.
    fn render_gl(&mut self, w: f64, h: f64, with_sky: bool) {
        let mut tris: Vec<f32> = Vec::new();
        let mut ptris: Vec<f32> = Vec::new();
        // (a VR eye takes only triangles: its smooth meshes are lit at the corners)
        let phong = self.unified && self.eye.is_none() && self.water.is_none();
        let mut plights: Vec<f32> = Vec::new();
        if phong {
            for l in self.lights.iter().filter(|l| l.kind == "directional").take(4) {
                let d = norm(l.pos);
                let c = l.color;
                plights.extend_from_slice(&[d[0] as f32, d[1] as f32, d[2] as f32, l.intensity as f32, c[0] as f32, c[1] as f32, c[2] as f32, l.intensity.min(1.5) as f32]);
            }
            let f = self.fog_color;
            plights.extend_from_slice(&[f[0] as f32, f[1] as f32, f[2] as f32, 0.0]);
        }
        let push = |tris: &mut Vec<f32>, x: f64, y: f64, d: f64, c: V3| {
            tris.extend_from_slice(&[x as f32, y as f32, d as f32, c[0] as f32, c[1] as f32, c[2] as f32]);
        };
        let (cam, r, u, f, focal, cx, cy) = self.view_basis(w, h);
        self.fog_eye.set(cam);
        if let (Some(wt), true) = (self.water, with_sky) {
            // under water the background is the water itself, by the way each
            // point of the screen looks (up bright, down dark): a grid of cells
            let (nx, ny) = (12usize, 12usize);
            let dir = |x: f64, y: f64| norm(add(add(f, mul(r, (x - cx) / focal)), mul(u, (cy - y) / focal)));
            let mut grid: Vec<V3> = Vec::with_capacity((nx + 1) * (ny + 1));
            for j in 0..=ny {
                for i in 0..=nx {
                    grid.push(wt.backdrop(cam[1], dir(w * i as f64 / nx as f64, h * j as f64 / ny as f64)));
                }
            }
            for j in 0..ny {
                for i in 0..nx {
                    let k = |ii: usize, jj: usize| (w * ii as f64 / nx as f64, h * jj as f64 / ny as f64, grid[jj * (nx + 1) + ii]);
                    for &(ii, jj) in [(i, j), (i + 1, j), (i + 1, j + 1), (i, j), (i + 1, j + 1), (i, j + 1)].iter() {
                        let (x, y, c) = k(ii, jj);
                        push(&mut tris, x, y, 1.0, c);
                    }
                }
            }
        } else if let Some((top, bottom)) = self.sky.filter(|_| with_sky) {
            // in VR the gradient goes by how high each corner looks, not by the screen
            let sky_at = |x: f64, y: f64, c: V3| -> V3 {
                match self.eye {
                    Some(e) => {
                        let (ex, ey) = e.centre();
                        let d = norm(add(add(e.f, mul(e.r, (x - ex) / crate::xr::K)), mul(e.u, (ey - y) / crate::xr::K)));
                        let k = (d[1] * 0.5 + 0.5).clamp(0.0, 1.0);
                        add(mul(bottom, 1.0 - k), mul(top, k))
                    }
                    None => c,
                }
            };
            for &(x, y, c) in [(0.0, 0.0, top), (w, 0.0, top), (w, h, bottom), (0.0, 0.0, top), (w, h, bottom), (0.0, h, bottom)].iter() {
                push(&mut tris, x, y, 1.0, sky_at(x, y, c));
            }
        }
        let near = 0.05;
        let to_view = |p: V3| -> V3 {
            let d = sub(p, cam);
            [dot(d, r), dot(d, u), dot(d, f)]
        };
        // the objects' corners in the world, once
        let worlds: Vec<Vec<V3>> = self.objs.iter().map(|o| {
            if !o.visible || o.opacity <= 0.0 {
                return Vec::new();
            }
            let (sx, cx) = o.rot[0].sin_cos();
            let (sy, cy) = o.rot[1].sin_cos();
            let (sz, cz) = o.rot[2].sin_cos();
            let (sw, cw) = o.wy.sin_cos();
            o.mesh.verts.iter().map(|v| {
                let p = [v[0] * o.scale[0], v[1] * o.scale[1], v[2] * o.scale[2]];
                let p = [p[0] * cz - p[1] * sz, p[0] * sz + p[1] * cz, p[2]];
                let p = [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy];
                let p = [p[0], p[1] * cx - p[2] * sx, p[1] * sx + p[2] * cx];
                let p = if o.wy != 0.0 { [p[0] * cw + p[2] * sw, p[1], -p[0] * sw + p[2] * cw] } else { p };
                add(p, o.pos)
            }).collect()
        }).collect();
        // depth: 1/z between DN and DF, fitted to the shapes in view so that
        // the whole depth buffer goes to them: a small ship close to the eye
        // (Solar Pilot: 0.04 units at 0.1-0.3) was all closer than a fixed
        // 0.2 = all depth 0, and its parts drew in painter order
        let (mut zmin, mut zmax) = (f64::MAX, 0.0f64);
        for wv in worlds.iter() {
            for p in wv.iter() {
                let z = to_view(*p)[2];
                if z >= near {
                    zmin = zmin.min(z);
                    zmax = zmax.max(z);
                }
            }
        }
        let (dn, df) = if zmin <= zmax { let dn = (zmin * 0.9).max(near); (dn, (zmax * 1.1).max(dn * 1.01)) } else { (0.2, 2000.0) };
        let depth = |z: f64| ((1.0 / dn - 1.0 / z.max(dn)) / (1.0 / dn - 1.0 / df)).clamp(0.0, 1.0);
        // clip against the near plane, project; corners as (x, y, view z)
        let project = |v: &[V3]| -> Vec<V3> {
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
            clipped.iter().map(|p| [cx + p[0] / p[2] * focal, cy - p[1] / p[2] * focal, p[2]]).collect()
        };
        let fan = |tris: &mut Vec<f32>, pts: &[V3], d: &dyn Fn(f64) -> f64, c: V3| {
            for k in 1..pts.len().saturating_sub(1) {
                for p in [pts[0], pts[k], pts[k + 1]].iter() {
                    tris.extend_from_slice(&[p[0] as f32, p[1] as f32, d(p[2]) as f32, c[0] as f32, c[1] as f32, c[2] as f32]);
                }
            }
        };
        if let Some((gy, gc)) = self.ground {
            let reach = self.fog.map(|f| f.1).unwrap_or(200.0).max(20.0);
            let bands = if self.fog.is_some() { 6 } else { 1 };
            let (cx, cz) = (cam[0], cam[2]);
            for b in (0..bands).rev() {
                let r0 = reach * (b as f64) / bands as f64;
                let r1 = reach * (b + 1) as f64 / bands as f64 * if b + 1 == bands { 3.0 } else { 1.0 };
                let shade = self.shade([0.0, 1.0, 0.0], [cx, gy, cz], gc);
                let c = self.fogged_at(shade, [cx + (r0 + r1) / 2.0, gy, cz]);
                let quad = [[cx - r1, gy, cz - r1], [cx + r1, gy, cz - r1], [cx + r1, gy, cz + r1], [cx - r1, gy, cz + r1]];
                let v: Vec<V3> = quad.iter().map(|p| to_view(*p)).collect();
                fan(&mut tris, &project(&v), &|_| 1.0, c);
            }
        }
        let mut drawn = 0;
        let mut glow: Vec<(f64, Vec<V3>, V3)> = Vec::new();
        // burst sparks: added triangles, a colour a corner (no order needed)
        let mut sparks: Vec<f32> = Vec::new();
        for (o, world) in self.objs.iter().zip(worlds.iter()) {
            if !o.visible {
                continue;
            }
            // (about one step of a 16-bit depth buffer a layer, so that a
            // decoration stays in front of its wall there too)
            let bias = o.layer.max(0) as f64 * 1.2e-5;
            let d = |z: f64| (depth(z) - bias).max(0.0);
            if o.opacity <= 0.0 {
                continue;
            }
            // puffs: see-through rings, added like the other see-through faces
            for pf in o.puffs.chunks_exact(if o.dust { 8 } else { 6 }) {
                let c = add(o.pos, [pf[0], pf[1], pf[2]]);
                let v = to_view(c);
                let rgb = self.fogged_at(mul(o.color, pf[5]), c);
                let rings = if o.dust { dust_rings(v, pf, focal, cx * 2.0, cy * 2.0, near) } else { puff_rings(v, pf[3], focal, cx * 2.0, cy * 2.0, near) };
                for (pts, k) in rings {
                    let a = (pf[4] * k * o.opacity).clamp(0.0, 1.0);
                    let dz = d(v[2]) + 2.0;
                    let corners: Vec<V3> = pts.chunks_exact(2).map(|p| [p[0], p[1], dz]).collect();
                    glow.push((v[2], corners, mul(rgb, a)));
                }
            }
            // burst particles: see-through quads, added like the puffs (glow: render_splats)
            if let Some(b) = o.burst.as_ref().filter(|b| !(b.glow && self.splats_ok)) {
                let discs: Vec<(V3, f64)> = self.planets.iter().map(|p| (to_view(p.pos), p.r)).collect();
                let streak = b.streak;
                b.each(|lp, lv, size, c| {
                    let wp = add(o.pos, lp);
                    let v = to_view(wp);
                    if v[2] < near || hidden(v, &discs) {
                        return;
                    }
                    let vt = if streak > 0.0 { Some(to_view(sub(wp, mul(lv, streak)))) } else { None };
                    let (pts, wts, k) = match spark_shape(v, vt, size, focal, cx * 2.0, cy * 2.0, near) {
                        Some(s) => s,
                        None => return,
                    };
                    let dz = (d(v[2]) + 2.0) as f32;
                    let rgb = mul(self.fogged_at(c, wp), o.opacity * k);
                    for &i in [0usize, 1, 2, 0, 2, 3].iter() {
                        let (p, m) = (pts[i], wts[i]);
                        sparks.extend_from_slice(&[p[0] as f32, p[1] as f32, dz, (rgb[0] * m) as f32, (rgb[1] * m) as f32, (rgb[2] * m) as f32]);
                    }
                });
            }
            // smooth meshes: a normal and a colour a corner, the area-weighted
            // mean of the faces round it (the colours: plain mean)
            let (vn, vc): (Vec<V3>, Vec<V3>) = if o.smooth && !o.mesh.faces.is_empty() {
                let mut vn = vec![[0.0; 3]; world.len()];
                let mut vc = vec![[0.0; 3]; world.len()];
                let mut cnt = vec![0.0f64; world.len()];
                for (fi, face) in o.mesh.faces.iter().enumerate() {
                    let a = world[face[0]];
                    let n = cross(sub(world[face[1]], a), sub(world[face[face.len() - 1]], a));
                    let (fc, _) = o.mesh.face_paint(fi, o.color, o.emissive);
                    for &i in face.iter() {
                        vn[i] = add(vn[i], n);
                        vc[i] = add(vc[i], fc);
                        cnt[i] += 1.0;
                    }
                }
                for i in 0..world.len() {
                    vn[i] = norm(vn[i]);
                    if cnt[i] > 0.0 {
                        vc[i] = mul(vc[i], 1.0 / cnt[i]);
                    }
                }
                (vn, vc)
            } else {
                (Vec::new(), Vec::new())
            };
            // a smooth corner's light is the same for every face round it (shiny
            // glints aside, which use the corner too): worked out once
            let mut vlit: Vec<Option<V3>> = vec![None; vn.len()];
            for (fi, face) in o.mesh.faces.iter().enumerate() {
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
                if pts.len() < 3 {
                    continue;
                }
                let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
                for p in pts.iter() {
                    x0 = x0.min(p[0]); x1 = x1.max(p[0]);
                    y0 = y0.min(p[1]); y1 = y1.max(p[1]);
                }
                if x1 < 0.0 || y1 < 0.0 || x0 > w || y0 > h {
                    continue;
                }
                let (fc, unlit) = o.mesh.face_paint(fi, o.color, o.emissive);
                let dist = dot(towards, towards).sqrt();
                if !vn.is_empty() && !unlit && o.opacity >= 1.0 && pts.len() == face.len() && view.iter().all(|p| p[2] >= near) {
                    // a colour a corner; the back of a double mesh turns its normals round
                    let flip = if dot(norm(cross(sub(b, a), sub(c, a))), towards) > 0.0 { -1.0 } else { 1.0 };
                    if phong {
                        // per-pixel light (see `ptris`): what a corner needs for it
                        let corner: Vec<[f32; 15]> = face.iter().map(|&i| {
                            let n = mul(vn[i], flip);
                            let e = norm(sub(cam, world[i]));
                            // the mirrored surroundings a corner (polished metal, see `env_light`)
                            let r = if o.env > 0.0 { add(self.rest_light(n, world[i]), mul(self.env_light(n, e), o.env)) } else { self.rest_light(n, world[i]) };
                            let fk = self.fog_k(dot(sub(world[i], cam), sub(world[i], cam)).sqrt());
                            [vc[i][0] as f32, vc[i][1] as f32, vc[i][2] as f32, r[0] as f32, r[1] as f32, r[2] as f32,
                             n[0] as f32, n[1] as f32, n[2] as f32, e[0] as f32, e[1] as f32, e[2] as f32, o.shiny as f32, fk as f32, 0.0]
                        }).collect();
                        for k in 1..pts.len() - 1 {
                            for &j in [0, k, k + 1].iter() {
                                let p = pts[j];
                                ptris.extend_from_slice(&[p[0] as f32, p[1] as f32, d(p[2]) as f32]);
                                ptris.extend_from_slice(&corner[j][..15]);
                            }
                        }
                        drawn += 1;
                        continue;
                    }
                    let cols: Vec<V3> = face.iter().map(|&i| {
                        if o.wsurf {
                            if let Some(wt) = &self.water {
                                if vlit[i].is_none() {
                                    vlit[i] = Some(self.fogged_at(wt.surface_color(vn[i], world[i], cam), world[i]));
                                }
                                return vlit[i].unwrap();
                            }
                        }
                        let lit = if flip > 0.0 {
                            match vlit[i] {
                                Some(c) => c,
                                None => {
                                    let c = self.shade_shiny(vn[i], world[i], vc[i], o.shiny, cam, o.env);
                                    vlit[i] = Some(c);
                                    c
                                }
                            }
                        } else {
                            self.shade_shiny(mul(vn[i], flip), world[i], vc[i], o.shiny, cam, o.env)
                        };
                        self.fogged_at(lit, world[i])
                    }).collect();
                    for k in 1..pts.len() - 1 {
                        for &j in [0, k, k + 1].iter() {
                            let p = pts[j];
                            let cc = cols[j];
                            tris.extend_from_slice(&[p[0] as f32, p[1] as f32, d(p[2]) as f32, cc[0] as f32, cc[1] as f32, cc[2] as f32]);
                        }
                    }
                    drawn += 1;
                    continue;
                }
                let lit = if unlit { fc } else { self.shade_shiny(n, centre, fc, o.shiny, cam, o.env) };
                let c = self.fogged_at(lit, centre);
                if o.opacity < 1.0 {
                    // see-through: added over what is behind, after the solid
                    // faces and far ones first (see `tris`)
                    let z = pts.iter().map(|p| p[2]).sum::<f64>() / pts.len() as f64;
                    let k = o.opacity;
                    let dd: Vec<V3> = pts.iter().map(|p| [p[0], p[1], d(p[2]) + 2.0]).collect();
                    glow.push((z, dd, [c[0] * k, c[1] * k, c[2] * k]));
                } else {
                    fan(&mut tris, &pts, &d, c);
                }
                drawn += 1;
            }
        }
        glow.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        for (_, pts, c) in glow.iter() {
            fan(&mut tris, pts, &|z| z, *c);
        }
        tris.extend_from_slice(&sparks);
        self.drawn = drawn;
        self.tris = tris;
        self.ptris = ptris;
        self.plights = plights;
    }
}

/// The colour quantized to 0..255 channels, so that close shades merge.
pub(crate) fn q(c: V3) -> [u8; 3] {
    [(c[0].clamp(0.0, 1.0) * 255.0).round() as u8, (c[1].clamp(0.0, 1.0) * 255.0).round() as u8, (c[2].clamp(0.0, 1.0) * 255.0).round() as u8]
}
pub(crate) fn rgb_f(c: [u8; 3]) -> V3 { [c[0] as f64 / 255.0, c[1] as f64 / 255.0, c[2] as f64 / 255.0] }

/// Pushes a polygon's corners half a pixel out from its centre, so that the
/// anti-aliased edges of two neighbouring faces overlap instead of leaving a
/// hairline of background between them.
pub(crate) fn grow(pts: Vec<f32>) -> Vec<f32> {
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

#[cfg(test)]
mod mesh_tests {
    use super::*;

    fn faces_at(sc: &mut Scene, z: f64) -> (usize, usize) {
        sc.command("camera", &rg_core::json::parse(&format!(r#"{{ "x": 0, "y": 0, "z": {z}, "lookAt": [0, 0, 0] }}"#)));
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let o = sc.objs.iter().find(|o| o.id == "s").unwrap();
        (o.lod_at, o.mesh.faces.len())
    }

    #[test]
    fn an_auto_detail_sphere_has_fewer_segments_far_off() {
        let mut sc = Scene::new();
        sc.command("add", &rg_core::json::parse(r#"{ "id": "s", "shape": "sphere", "size": [1], "detail": "auto" }"#));
        let (s0, f0) = faces_at(&mut sc, 2.0);
        let (s1, f1) = faces_at(&mut sc, 20.0);
        let (s3, f3) = faces_at(&mut sc, 400.0);
        assert_eq!(s0, 0);
        assert!(s1 > s0 && f1 < f0, "{s1} {f1} {f0}");
        assert_eq!(s3, 3);
        assert!(f3 < f1);
        // back close: the finest again, with all its faces
        assert_eq!(faces_at(&mut sc, 2.0), (s0, f0));
    }

    #[test]
    fn lod_entries_replace_the_mesh_by_size_and_hide_it_when_tiny() {
        let mut sc = Scene::new();
        sc.command("add", &rg_core::json::parse(r#"{ "id": "s", "shape": "sphere", "size": [1], "detail": 32,
            "lod": [{ "px": 3, "hide": true }, { "px": 60, "shape": "box", "size": [1] }] }"#));
        assert_eq!(sc.lod_step("s"), Some(0));
        // 1 unit wide at 3 units: big, the sphere
        let (a, fa) = faces_at(&mut sc, 3.0);
        assert_eq!(a, 0);
        assert!(fa > 100);
        // far: the box (6 faces)
        assert_eq!(faces_at(&mut sc, 30.0), (1, 6));
        // very far: nothing
        assert_eq!(faces_at(&mut sc, 2000.0), (2, 0));
    }

    #[test]
    fn a_form_holds_at_its_limit() {
        let mut sc = Scene::new();
        sc.command("add", &rg_core::json::parse(r#"{ "id": "s", "shape": "sphere", "size": [1], "lod": [{ "px": 60, "detail": 6 }] }"#));
        // the distance where it is 60 units across (focal 400 / 2 / tan(fov / 2))
        let mut z = 3.0;
        while { let (st, _) = faces_at(&mut sc, z); st == 0 } { z *= 1.01; }
        let edge = z;
        // just inside the limit again: still the coarse one (the margin)
        assert_eq!(faces_at(&mut sc, edge * 0.95).0, 1);
        assert_eq!(faces_at(&mut sc, edge * 0.7).0, 0);
    }

    #[test]
    fn a_mesh_keeps_a_colour_and_glow_a_face() {
        let a = rg_core::json::parse(r##"{ "shape": "mesh", "color": "#808080",
            "verts": [0,0,0, 1,0,0, 0,1,0, 0,0,1],
            "tris": [0,1,2, 0,2,3, 0,1,9],
            "colors": [16711680, "#00ff00"], "glow": [1] }"##);
        let m = tri_mesh(&a);
        // the third triangle points past the corners
        assert_eq!(m.faces.len(), 2);
        let grey = [0.5, 0.5, 0.5];
        assert_eq!(m.face_paint(0, grey, false), ([1.0, 0.0, 0.0], false));
        assert_eq!(m.face_paint(1, grey, false), ([0.0, 1.0, 0.0], true));
        // plain shapes take the object's paint
        let b = mesh("box", &[1.0], 1);
        assert_eq!(b.face_paint(0, grey, true), (grey, true));
    }

    #[test]
    fn a_mirroring_face_shows_the_ground_below_the_horizon_and_the_sky_above() {
        let mut sc = Scene::new();
        sc.command("light", &rg_core::json::parse(r#"{ "id": "ambient", "type": "ambient", "intensity": 0 }"#));
        sc.command("light", &rg_core::json::parse(r#"{ "id": "sun", "type": "directional", "intensity": 0 }"#));
        sc.command("light", &rg_core::json::parse(r##"{ "id": "e", "type": "env", "x": 0, "y": 1, "z": 0, "color": "#ffffff", "sky": "#000000", "intensity": 1 }"##));
        let grey = [0.5, 0.5, 0.5];
        // a wall facing the camera, tilted down: the eye's ray mirrors to the ground
        let down = norm([0.0, -0.5, 1.0]);
        let g = sc.shade_shiny(down, [0.0; 3], grey, 0.0, [0.0, 0.0, 10.0], 1.0);
        assert!(g[0] > 0.45, "{:?}", g);
        // tilted up: it mirrors the black sky
        let up = norm([0.0, 0.5, 1.0]);
        let s = sc.shade_shiny(up, [0.0; 3], grey, 0.0, [0.0, 0.0, 10.0], 1.0);
        assert!(s[0] < 0.01, "{:?}", s);
        // without env the env light adds nothing (and is no point light)
        let none = sc.shade_shiny(down, [0.0; 3], grey, 0.0, [0.0, 0.0, 10.0], 0.0);
        assert_eq!(none, [0.0, 0.0, 0.0]);
    }

    #[test]
    fn a_shiny_face_glints_where_it_mirrors_the_light_to_the_camera() {
        let mut sc = Scene::new();
        sc.command("light", &rg_core::json::parse(r#"{ "id": "a", "type": "ambient", "intensity": 0 }"#));
        sc.command("light", &rg_core::json::parse(r#"{ "id": "s", "type": "directional", "x": 0, "y": 1, "z": 1, "intensity": 1 }"#));
        let grey = [0.5, 0.5, 0.5];
        let up = [0.0, 1.0, 0.0];
        let dull = sc.shade_shiny(up, [0.0; 3], grey, 0.0, [0.0, 10.0, -10.0], 0.0);
        // the camera opposite the light: the face mirrors the light into it
        let lit = sc.shade_shiny(up, [0.0; 3], grey, 1.0, [0.0, 10.0, -10.0], 0.0);
        // the camera beside the light: no glint
        let off = sc.shade_shiny(up, [0.0; 3], grey, 1.0, [0.0, 10.0, 10.0], 0.0);
        assert!(lit[0] > dull[0] + 0.5, "{:?} {:?}", lit, dull);
        assert!((off[0] - dull[0]).abs() < 0.02, "{:?} {:?}", off, dull);
        assert_eq!(sc.shade(up, [0.0; 3], grey), dull);
    }

    #[test]
    fn a_smooth_mesh_is_lit_a_corner_in_gl() {
        // a ridge of two faces; the light from the right side
        let corners = |smooth: bool| -> Vec<[f32; 3]> {
            let mut sc = Scene::new();
            sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
            sc.command("light", &rg_core::json::parse(r#"{ "id": "sun", "type": "directional", "x": 1, "y": 0, "z": 1, "intensity": 1 }"#));
            let m = format!(r##"{{ "id": "ridge", "shape": "mesh", "color": "#ffffff", "smooth": {},
                "verts": [-1,0,0, 0,-1,1, 0,1,1, 1,0,0], "tris": [0,1,2, 2,1,3] }}"##, smooth);
            sc.command("add", &rg_core::json::parse(&m));
            sc.gl = true;
            sc.render(&mut DrawStream::new(), 400.0, 400.0);
            assert!(sc.tris.len() >= 36);
            (0..3).map(|i| [sc.tris[i * 6 + 3], sc.tris[i * 6 + 4], sc.tris[i * 6 + 5]]).collect()
        };
        let flat = corners(false);
        assert!(flat[0] == flat[1] && flat[1] == flat[2], "{:?}", flat);
        let smooth = corners(true);
        assert!(smooth[0] != smooth[1], "{:?}", smooth);
    }

    #[test]
    fn a_smooth_mesh_goes_to_the_per_pixel_light_on_an_all_gl_host() {
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.command("light", &rg_core::json::parse(r#"{ "id": "amb", "type": "ambient", "intensity": 0.2 }"#));
        sc.command("light", &rg_core::json::parse(r#"{ "id": "sun", "type": "directional", "x": 1, "y": 0, "z": 1, "intensity": 0.9 }"#));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "ridge", "shape": "mesh", "color": "#ff8000", "smooth": true, "shiny": 0.5,
            "verts": [-1,0,0, 0,-1,1, 0,1,1, 1,0,0], "tris": [0,1,2, 2,1,3] }"##));
        sc.gl = true;
        sc.unified = true;
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        // two triangles, 18 floats a corner, none in the plain triangles
        assert_eq!(sc.ptris.len(), 2 * 3 * 18);
        assert!(sc.tris.is_empty());
        let c = &sc.ptris[..18];
        // the face's own colour, the ambient as the rest, a unit normal and eye, shiny
        assert!((c[3] - 1.0).abs() < 1e-3 && (c[4] - 0.502).abs() < 0.01 && c[5].abs() < 1e-3, "{:?}", c);
        let amb = sc.rest_light([0.0, 0.0, 1.0], [0.0; 3]);
        assert!((c[6] as f64 - amb[0]).abs() < 1e-3 && c[6] == c[7] && c[7] == c[8], "{:?} {:?}", c, amb);
        assert!(((c[9] * c[9] + c[10] * c[10] + c[11] * c[11]) - 1.0).abs() < 1e-3);
        assert!((c[15] - 0.5).abs() < 1e-6);
        // one directional light (way, intensity, colour, glint) and the fog colour
        assert_eq!(sc.plights.len(), 12);
        assert!((sc.plights[3] - 0.9).abs() < 1e-6 && (sc.plights[7] - 0.9).abs() < 1e-6);
        // the layer is there although the plain triangles are empty (w 1)
        assert!(out.nums.chunks(23).any(|h| h[0] == 9.0 && h[3] == 1.0));
        // a host that is not all GL keeps the corners' light
        sc.unified = false;
        sc.render(&mut DrawStream::new(), 400.0, 400.0);
        assert!(sc.ptris.is_empty() && sc.tris.len() == 36);
    }

    #[test]
    fn a_see_through_object_is_added_last_in_gl_and_blended_by_the_painter() {
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "flame", "shape": "box", "size": [1], "z": 1, "color": "#4060ff", "emissive": true, "opacity": 0.5 }"##));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "hull", "shape": "box", "size": [2], "color": "#ffffff", "emissive": true }"##));
        // (through render: the GL form when the host draws depth-tested triangles)
        sc.gl = true;
        sc.render(&mut DrawStream::new(), 400.0, 400.0);
        let t = &sc.tris;
        assert!(t.len() > 36);
        // the solid hull first (depth 0..1), then the flame (2..3) at half its colour
        let first_glow = (0..t.len() / 6).find(|i| t[i * 6 + 2] >= 2.0).unwrap();
        assert!((first_glow..t.len() / 6).all(|i| t[i * 6 + 2] >= 2.0 && t[i * 6 + 2] <= 3.0));
        assert!((0..first_glow).all(|i| t[i * 6 + 2] <= 1.0 && t[i * 6 + 3] > 0.99));
        assert!((t[first_glow * 6 + 5] - 0.5).abs() < 0.01, "{}", t[first_glow * 6 + 5]);
        // the painter: the flame as a path with opacity 0.5
        sc.gl = false;
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        assert!(out.nums.windows(9).any(|w| w[0] == 6.0 && w[8] == 0.5), "no see-through path");
        // opacity 0: not drawn
        sc.command("set", &rg_core::json::parse(r#"{ "id": "flame", "opacity": 0 }"#));
        sc.gl = true;
        sc.render(&mut DrawStream::new(), 400.0, 400.0);
        assert!(sc.tris.chunks(6).all(|c| c[2] <= 1.0));
    }

    #[test]
    fn dust_breaks_up_into_turning_lumps() {
        let mut sc = Scene::new();
        sc.command("add", &rg_core::json::parse(r##"{ "id": "d", "shape": "dust", "color": "#806040" }"##));
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        // the lumps' rings in view space, straight from dust_rings
        let centres = |age: f64| -> Vec<(f64, f64)> {
            dust_rings([0.0, 0.0, 10.0], &[0.0, 0.0, 0.0, 1.0, 0.8, 1.0, 0.3, age], 400.0, 400.0, 400.0, 0.1).iter().map(|(pts, _)| {
                let n = (pts.len() / 2) as f64;
                let (mut x, mut y) = (0.0, 0.0);
                for p in pts.chunks_exact(2) { x += p[0]; y += p[1]; }
                (x / n, y / n)
            }).collect()
        };
        let young = centres(0.0);
        let old = centres(1.0);
        // five lumps of two rings each
        assert_eq!(young.len(), 10);
        // older: the lumps lie farther from the centre (it breaks up)
        let spread = |v: &Vec<(f64, f64)>| v.iter().map(|p| ((p.0 - 200.0).powi(2) + (p.1 - 200.0).powi(2)).sqrt()).sum::<f64>();
        assert!(spread(&old) > spread(&young) * 1.5, "{} {}", spread(&old), spread(&young));
        // painted as see-through paths
        sc.command("set", &rg_core::json::parse(r#"{ "id": "d", "puffs": [0, 0, 0, 1, 0.8, 1, 0.3, 0.5] }"#));
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let n = out.nums.windows(9).filter(|w| w[0] == 6.0 && w[8] > 0.0 && w[8] < 1.0).count();
        assert_eq!(n, 10);
    }

    #[test]
    fn splats_play_a_baked_run_as_one_liquid_command() {
        // 50 particles in a row along file x, 0.1 apart (10 i16 steps of 0.01), still
        let f = crate::splats::test_file(50, 2, 1.0, |_, i| ([(i as i16 - 25) * 10, 0, 0], [0; 3], 200));
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.splat_bytes = Some(f.clone());
        // the file's x along world y
        sc.command("add", &rg_core::json::parse(r#"{ "id": "s", "shape": "splats", "src": "x.rgps", "axes": [[0, 1, 0], [1, 0, 0], [0, 0, 1]], "scale": 1 }"#));
        sc.splats_ok = true;
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        // one kind 10 command: 5 palette colours, light, 50 splats in a column
        let k = out.nums.iter().position(|v| *v == 10.0).expect("kind 10");
        let ex = &out.nums[k + 23..];
        assert_eq!(ex[0], 5.0);
        let at = 1 + 5 * 3;
        assert_eq!(ex[at + 3], 50.0);
        let pts = &ex[at + 4..at + 4 + 200];
        assert!(pts.chunks(4).all(|p| (p[0] - 200.0).abs() < 0.01 && (p[3] - 200.0 / 255.0).abs() < 1e-3));
        let ys: Vec<f32> = pts.chunks(4).map(|p| p[1]).collect();
        assert!(ys[0] > ys[49], "file x runs up the screen");
        assert_eq!(out.nums[k + 10], 0.0, "liquid by default");
        // look "gas": its density in header slot 10, cheaper res in slot 9
        sc.command("set", &rg_core::json::parse(r#"{ "id": "s", "look": "gas", "density": 2, "res": 0.35 }"#));
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let k = out.nums.iter().position(|v| *v == 10.0).expect("kind 10");
        assert_eq!(out.nums[k + 10], 2.0);
        assert!((out.nums[k + 9] - 0.35).abs() < 1e-6);
        // a host without splats: added squares
        sc.splats_ok = false;
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        assert!(!out.nums.contains(&10.0) || out.nums.windows(23).all(|w| w[0] != 10.0 || w[17] != 0.0));
        assert!(out.count > 0);
    }

    #[test]
    fn splats_with_a_game_shader_name_its_key_uniforms_and_time() {
        let f = crate::splats::test_file(20, 2, 1.0, |_, i| ([(i as i16 - 10) * 10, 0, 0], [0; 3], 200));
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.splat_bytes = Some(f);
        sc.command("add", &rg_core::json::parse(r#"{ "id": "s", "shape": "splats", "src": "x.rgps", "time": 0.25,
            "material": { "shader": "magma", "u": { "heat": 0.8, "tint": [1, 0.5, 0.25], "bad name": 1, "s": "x" } } }"#));
        sc.splats_ok = true;
        // not registered yet: the engine's own look
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let k = out.nums.iter().position(|v| *v == 10.0).expect("kind 10");
        assert_eq!(out.nums[k + 18], -1.0);
        sc.set_shader("magma", "magma#abc");
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let k = out.nums.iter().position(|v| *v == 10.0).expect("kind 10");
        assert_eq!(out.strings[out.nums[k + 18] as usize], "magma#abc");
        assert_eq!(out.strings[out.nums[k + 19] as usize], "heat=0.8;tint=1,0.5,0.25");
        assert!((out.nums[k + 11] - 0.25).abs() < 1e-6);
        // gas keeps the engine's look
        sc.command("set", &rg_core::json::parse(r#"{ "id": "s", "look": "gas" }"#));
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let k = out.nums.iter().position(|v| *v == 10.0).expect("kind 10");
        assert_eq!(out.nums[k + 18], -1.0);
    }

    #[test]
    fn a_planet_with_a_game_surface_shader_names_it_in_its_sphere_commands() {
        let mut sc = Scene::new();
        sc.textures = true;
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 4, "lookAt": [0, 0, 0] }"#));
        sc.command("planet", &rg_core::json::parse(r#"{ "id": "m", "r": 1, "regions": [], "texture": "img/m.jpg", "flowTime": 4100.5,
            "material": { "shader": "lava", "u": { "glow": 2, "tint": [0.3, 0.2, 0.2] } } }"#));
        let sphere = |out: &DrawStream| {
            let mut i = 0;
            while out.nums[i] != 8.0 {
                i += crate::draw::HEADER + out.nums[i + 22] as usize;
            }
            i
        };
        // not registered: the engine's look (slot 9 is 0)
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        assert_eq!(out.nums[sphere(&out) + 9], 0.0);
        sc.set_shader("lava", "lava#abc");
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        let k = sphere(&out);
        assert_eq!(out.strings[out.nums[k + 9] as usize - 1], "lava#abc");
        assert_eq!(out.strings[out.nums[k + 10] as usize - 1], "glow=2;tint=0.3,0.2,0.2");
        assert!((out.nums[k + 11] - 4.5).abs() < 1e-3, "{}", out.nums[k + 11]);
    }

    #[test]
    fn a_glowing_burst_is_sprites_where_the_host_draws_splats() {
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.command("add", &rg_core::json::parse(r#"{ "id": "b", "shape": "burst", "count": 200, "speed": 1, "life": [3, 3], "look": "glow",
            "material": { "shader": "spark", "u": { "hot": 2 } } }"#));
        sc.command("set", &rg_core::json::parse(r#"{ "id": "b", "time": 1 }"#));
        sc.set_shader("spark", "spark#abc");
        // no GPU splats: the squares as before
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        assert!(!out.nums.is_empty() && out.nums[0] != 10.0);
        sc.splats_ok = true;
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        assert_eq!(out.count, 1);
        assert_eq!(out.nums[0], 10.0);
        assert_eq!(out.nums[12], 1.0);
        assert_eq!(out.strings[out.nums[18] as usize], "spark#abc");
        assert_eq!(out.strings[out.nums[19] as usize], "hot=2");
        assert!((out.nums[11] - 1.0).abs() < 1e-6);
        // 32 palette colours, the light, then 200 sprites of 4 numbers
        let e = crate::draw::HEADER;
        assert_eq!(out.nums[e], 32.0);
        assert_eq!(out.nums[e + 1 + 32 * 3 + 3], 200.0);
    }

    #[test]
    fn a_burst_draws_a_path_a_colour_and_hides_behind_planets() {
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "b", "shape": "burst", "count": 3000, "speed": [1, 2], "life": [3, 3],
            "size": 0.02, "palette": ["#ffffff", "#ff8000"] }"##));
        sc.command("set", &rg_core::json::parse(r#"{ "id": "b", "time": 1 }"#));
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        // 3000 squares in a handful of paths (one a colour)
        assert!(out.count > 0 && out.count < 40, "{} commands", out.count);
        let mut gl = Scene::new();
        gl.gl = true;
        gl.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        gl.command("add", &rg_core::json::parse(r##"{ "id": "b", "shape": "burst", "count": 100, "speed": 1, "life": [3, 3] }"##));
        gl.command("set", &rg_core::json::parse(r#"{ "id": "b", "time": 1 }"#));
        gl.render(&mut DrawStream::new(), 400.0, 400.0);
        // see-through quads (two triangles each), depth 2..3
        assert_eq!(gl.tris.len(), 100 * 6 * 6);
        assert!(gl.tris.chunks(6).all(|c| c[2] >= 2.0 && c[2] <= 3.0));
        // streaks: kites along the motion, the tail corner dark (it fades out there)
        let mut st = Scene::new();
        st.gl = true;
        st.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        st.command("add", &rg_core::json::parse(r##"{ "id": "b", "shape": "burst", "count": 50, "speed": 2, "dir": [1, 0, 0], "spread": 0.1,
            "life": [3, 3], "streak": 0.5, "palette": ["#ffffff"] }"##));
        st.command("set", &rg_core::json::parse(r#"{ "id": "b", "time": 1 }"#));
        st.render(&mut DrawStream::new(), 400.0, 400.0);
        assert_eq!(st.tris.len(), 50 * 6 * 6);
        let dark = st.tris.chunks(6).filter(|c| c[3] == 0.0 && c[4] == 0.0 && c[5] == 0.0).count();
        assert_eq!(dark, 50 * 2, "each streak's tail corner twice (two triangles)");
        // a planet between the eye and the burst hides it
        assert!(hidden([0.0, 0.0, 10.0], &[([0.0, 0.0, 5.0], 1.0)]));
        assert!(!hidden([3.0, 0.0, 10.0], &[([0.0, 0.0, 5.0], 1.0)]));
        assert!(!hidden([0.0, 0.0, 3.0], &[([0.0, 0.0, 5.0], 1.0)]));
    }

    #[test]
    fn puffs_are_soft_rings_facing_the_eye_set_in_one_call() {
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 10, "lookAt": [0, 0, 0] }"#));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "smoke", "shape": "puffs", "color": "#ffffff" }"##));
        // two puffs: a big one in the middle, a tiny far one; one behind the eye
        sc.command("set", &rg_core::json::parse(r#"{ "id": "smoke", "puffs": [0, 0, 0, 1, 0.8, 1, 0, 0, -400, 0.5, 0.8, 1, 0, 0, 20, 1, 0.8, 1] }"#));
        let mut out = DrawStream::new();
        sc.render(&mut out, 400.0, 400.0);
        // the painter: see-through paths, the big puff as four rings of
        // different alpha (never merged), the tiny one as one ring
        let alphas: Vec<f32> = out.nums.windows(9).filter(|w| w[0] == 6.0 && w[8] > 0.0 && w[8] < 1.0).map(|w| w[8]).collect();
        assert_eq!(alphas.len(), 5, "{:?}", alphas);
        // GL: see-through triangles only (depth 2..3)
        sc.gl = true;
        sc.render(&mut DrawStream::new(), 400.0, 400.0);
        assert!(!sc.tris.is_empty() && sc.tris.chunks(6).all(|c| c[2] >= 2.0 && c[2] <= 3.0));
        // an empty list hides them
        sc.command("set", &rg_core::json::parse(r#"{ "id": "smoke", "puffs": [] }"#));
        sc.render(&mut DrawStream::new(), 400.0, 400.0);
        assert!(sc.tris.is_empty());
    }

    #[test]
    fn a_small_ship_close_to_the_eye_gets_the_whole_depth_range() {
        // Solar Pilot: parts 0.04 units big at 0.1-0.3 from the eye were all
        // closer than the old fixed near depth (0.2), so all at depth 0
        let mut sc = Scene::new();
        sc.command("camera", &rg_core::json::parse(r#"{ "x": 0, "y": 0, "z": 0.15, "lookAt": [0, 0, 0] }"#));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "front", "shape": "box", "size": [0.01], "z": 0.02, "color": "#ffd040", "emissive": true }"##));
        sc.command("add", &rg_core::json::parse(r##"{ "id": "back", "shape": "box", "size": [0.04], "color": "#ffffff", "emissive": true }"##));
        sc.gl = true;
        sc.render(&mut DrawStream::new(), 400.0, 400.0);
        let t = &sc.tris;
        let gold: Vec<f32> = t.chunks(6).filter(|c| c[5] < 0.5).map(|c| c[2]).collect();
        let white: Vec<f32> = t.chunks(6).filter(|c| c[5] > 0.9).map(|c| c[2]).collect();
        assert!(!gold.is_empty() && !white.is_empty());
        let gmax = gold.iter().cloned().fold(0.0f32, f32::max);
        let wmin = white.iter().cloned().fold(1.0f32, f32::min);
        // the front box is nearer than the back box's front face, by many 16-bit steps
        assert!(gmax < wmin, "{} {}", gmax, wmin);
        assert!(wmin - gmax > 50.0 / 65536.0, "{} {}", gmax, wmin);
    }

    #[test]
    fn water_takes_red_first_and_ripples() {
        let mut sc = Scene::new();
        sc.command("scene", &rg_core::json::parse(r##"{ "water": { "surface": 0, "color": "#0d4050", "caustics": 0.8, "time": 1.3 } }"##));
        sc.command("light", &rg_core::json::parse(r##"{ "id": "sun", "type": "directional", "y": 1, "intensity": 1 }"##));
        let w = sc.water.unwrap();
        // far away a white wall is the water's colour; near it is still white-ish
        let far = sc.fogged([1.0; 3], 200.0);
        let near = sc.fogged([1.0; 3], 0.5);
        let level = w.backdrop(0.0, [0.0, 0.0, -1.0]);
        for i in 0..3 { assert!((far[i] - level[i]).abs() < 0.01, "{:?} {:?}", far, level); }
        // the water looks bright up, dark down, and darker and bluer deeper
        let up = w.backdrop(-5.0, [0.0, 1.0, 0.0]);
        let dn = w.backdrop(-5.0, [0.0, -1.0, 0.0]);
        let deep = w.backdrop(-40.0, [0.0, 0.0, -1.0]);
        assert!(up[1] > dn[1] * 2.0, "{:?} {:?}", up, dn);
        assert!(deep[1] < level[1] * 0.2 && deep[2] / deep[1] > level[2] / level[1], "{:?} {:?}", deep, level);
        // the surface from below: straight up through Snell's window it is bright
        // (the sky), at a slant beyond ~49° it mirrors the dark water below
        let through = w.surface_color([0.0, 1.0, 0.0], [0.0, 0.0, -1.0], [0.0, -5.0, 0.0]);
        let mirror = w.surface_color([0.0, 1.0, 0.0], [10.0, 0.0, 0.0], [0.0, -5.0, 0.0]);
        assert!(through[1] > mirror[1] * 3.0, "{:?} {:?}", through, mirror);
        assert!(near[0] > 0.7 && near[2] > 0.9, "{:?}", near);
        // 10 m down a white floor has lost far more red than blue
        let deep = sc.shade([0.0, 1.0, 0.0], [0.3, -10.0, 0.7], [1.0; 3]);
        assert!(deep[0] < deep[2] * 0.15, "{:?}", deep);
        // the caustics vary over the floor, averaging about the plain light
        let (mut lo, mut hi, mut sum) = (f64::MAX, 0.0f64, 0.0);
        let n = 4000;
        for i in 0..n {
            let x = (i % 63) as f64 * 0.137;
            let z = (i / 63) as f64 * 0.211;
            let c = w.caustic(x, -2.0, z);
            lo = lo.min(c); hi = hi.max(c); sum += c;
        }
        assert!(hi > 1.8 && lo < 0.8, "{} {}", lo, hi);
        let mean = sum / n as f64;
        assert!(mean > 0.7 && mean < 1.4, "{}", mean);
        // water: false ends it
        sc.command("scene", &rg_core::json::parse(r##"{ "water": false }"##));
        assert!(sc.water.is_none());
    }
}
