// SPDX-License-Identifier: AGPL-3.0-or-later
//! glTF 2.0 models (.glb, or .gltf with its buffers embedded or beside it),
//! read into what the 3D world (fiber.rs) draws: the node tree, the meshes'
//! triangles with their colours, skins (bones) and animation clips, and the
//! pose of a model for a mix of clips (three.js's AnimationMixer and
//! SkinnedMesh, done here in Rust so that an old phone keeps up).
//!
//! Supported: triangle primitives (also strips and fans), POSITION, NORMAL,
//! COLOR_0, JOINTS_0 / WEIGHTS_0, indices, materials' baseColorFactor,
//! emissiveFactor and doubleSided, node TRS or matrix, skins, and animation
//! channels for translation, rotation and scale with STEP, LINEAR and
//! CUBICSPLINE samplers. Textures are not drawn (the engine's 3D is coloured
//! per corner): a textured material shows its baseColorFactor.

use rg_core::json::{self, Json};

pub type M4 = [f32; 16];

pub const IDENTITY: M4 = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];

/// a * b, column-major (glTF's and three.js's order)
pub fn mat_mul(a: &M4, b: &M4) -> M4 {
    let mut o = [0.0f32; 16];
    for c in 0..4 {
        for r in 0..4 {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
    }
    o
}

/// The matrix of a translation, a rotation (quaternion x, y, z, w) and a scale.
pub fn compose(t: [f32; 3], q: [f32; 4], s: [f32; 3]) -> M4 {
    let (x, y, z, w) = (q[0], q[1], q[2], q[3]);
    let (x2, y2, z2) = (x + x, y + y, z + z);
    let (xx, xy, xz) = (x * x2, x * y2, x * z2);
    let (yy, yz, zz) = (y * y2, y * z2, z * z2);
    let (wx, wy, wz) = (w * x2, w * y2, w * z2);
    [
        (1.0 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0.0,
        (xy - wz) * s[1], (1.0 - (xx + zz)) * s[1], (yz + wx) * s[1], 0.0,
        (xz + wy) * s[2], (yz - wx) * s[2], (1.0 - (xx + yy)) * s[2], 0.0,
        t[0], t[1], t[2], 1.0,
    ]
}

/// Translation, rotation and scale out of an affine matrix.
pub fn decompose(m: &M4) -> ([f32; 3], [f32; 4], [f32; 3]) {
    let len = |a: usize| (m[a] * m[a] + m[a + 1] * m[a + 1] + m[a + 2] * m[a + 2]).sqrt();
    let mut sx = len(0);
    let (sy, sz) = (len(4), len(8));
    let det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    if det < 0.0 {
        sx = -sx;
    }
    let inv = |v: f32| if v.abs() < 1e-12 { 0.0 } else { 1.0 / v };
    let (ix, iy, iz) = (inv(sx), inv(sy), inv(sz));
    let r = [m[0] * ix, m[1] * ix, m[2] * ix, m[4] * iy, m[5] * iy, m[6] * iy, m[8] * iz, m[9] * iz, m[10] * iz];
    // rotation matrix (column-major r) to quaternion
    let (m11, m12, m13, m21, m22, m23, m31, m32, m33) = (r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]);
    let trace = m11 + m22 + m33;
    let q = if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]
    } else if m11 > m22 && m11 > m33 {
        let s = 2.0 * (1.0 + m11 - m22 - m33).sqrt();
        [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s]
    } else if m22 > m33 {
        let s = 2.0 * (1.0 + m22 - m11 - m33).sqrt();
        [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s]
    } else {
        let s = 2.0 * (1.0 + m33 - m11 - m22).sqrt();
        [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s]
    };
    ([m[12], m[13], m[14]], q, [sx, sy, sz])
}

pub fn transform_point(m: &M4, p: [f32; 3]) -> [f32; 3] {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
}

pub fn transform_dir(m: &M4, p: [f32; 3]) -> [f32; 3] {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
    ]
}

fn slerp(a: [f32; 4], b: [f32; 4], t: f32) -> [f32; 4] {
    let mut cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let mut b = b;
    if cos < 0.0 {
        cos = -cos;
        b = [-b[0], -b[1], -b[2], -b[3]];
    }
    let (ka, kb) = if cos > 0.9995 {
        (1.0 - t, t)
    } else {
        let th = cos.acos();
        let s = th.sin();
        (((1.0 - t) * th).sin() / s, (t * th).sin() / s)
    };
    let q = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb];
    let l = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();
    if l < 1e-9 { a } else { [q[0] / l, q[1] / l, q[2] / l, q[3] / l] }
}

#[derive(Clone)]
pub struct Node {
    pub name: String,
    pub children: Vec<usize>,
    pub parent: Option<usize>,
    pub mesh: Option<usize>,
    pub skin: Option<usize>,
    pub t: [f32; 3],
    pub r: [f32; 4],
    pub s: [f32; 3],
}

pub struct Primitive {
    pub pos: Vec<[f32; 3]>,
    pub nrm: Vec<[f32; 3]>,
    /// linear colour of each corner (vertex colour times the material's)
    pub col: Vec<[f32; 3]>,
    pub joints: Vec<[u16; 4]>,
    pub weights: Vec<[f32; 4]>,
    /// three indices a triangle
    pub tris: Vec<u32>,
    pub emissive: [f32; 3],
    pub double: bool,
}

pub struct Skin {
    pub joints: Vec<usize>,
    pub ibm: Vec<M4>,
}

pub struct Channel {
    pub node: usize,
    /// 0 translation, 1 rotation, 2 scale
    pub path: u8,
    /// 0 step, 1 linear, 2 cubic spline
    pub interp: u8,
    pub times: Vec<f32>,
    pub values: Vec<f32>,
}

pub struct Clip {
    pub name: String,
    pub duration: f32,
    pub channels: Vec<Channel>,
}

pub struct Asset {
    pub nodes: Vec<Node>,
    pub meshes: Vec<Vec<Primitive>>,
    pub skins: Vec<Skin>,
    pub clips: Vec<Clip>,
    /// the default scene's root nodes
    pub roots: Vec<usize>,
    /// how many triangles the model has (all meshes)
    pub triangles: usize,
}

fn le_u32(b: &[u8], at: usize) -> u32 {
    if at + 4 > b.len() {
        return 0;
    }
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

fn base64(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => continue,
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    out
}

fn f(j: &Json, k: &str) -> Json {
    j.get(k)
}

fn nums(j: &Json) -> Vec<f32> {
    j.items().iter().map(|v| v.as_num(0.0) as f32).collect()
}

struct Reader<'a> {
    doc: &'a Json,
    buffers: Vec<Vec<u8>>,
}

impl<'a> Reader<'a> {
    /// An accessor's elements as floats (normalized integers become 0…1),
    /// `n` components each.
    fn floats(&self, index: usize) -> (Vec<f32>, usize) {
        let acc = self.doc.get("accessors").items().get(index).cloned().unwrap_or(Json::Null);
        let count = acc.get("count").as_num(0.0) as usize;
        let n = match acc.get("type").as_str().as_str() {
            "SCALAR" => 1,
            "VEC2" => 2,
            "VEC3" => 3,
            "VEC4" => 4,
            "MAT4" => 16,
            "MAT3" => 9,
            "MAT2" => 4,
            _ => 1,
        };
        let ct = acc.get("componentType").as_num(5126.0) as u32;
        let normalized = acc.get("normalized").as_bool();
        let csize = match ct {
            5120 | 5121 => 1,
            5122 | 5123 => 2,
            _ => 4,
        };
        let mut out = vec![0.0f32; count * n];
        let bv_i = acc.get("bufferView");
        if bv_i.is_null() {
            return (out, n);
        }
        let bv = self.doc.get("bufferViews").items().get(bv_i.as_num(0.0) as usize).cloned().unwrap_or(Json::Null);
        let buf = match self.buffers.get(bv.get("buffer").as_num(0.0) as usize) {
            Some(b) => b,
            None => return (out, n),
        };
        let start = bv.get("byteOffset").as_num(0.0) as usize + acc.get("byteOffset").as_num(0.0) as usize;
        let stride = { let s = bv.get("byteStride").as_num(0.0) as usize; if s == 0 { n * csize } else { s } };
        for i in 0..count {
            for c in 0..n {
                let at = start + i * stride + c * csize;
                if at + csize > buf.len() {
                    continue;
                }
                let v = match ct {
                    5120 => { let x = buf[at] as i8 as f32; if normalized { (x / 127.0).max(-1.0) } else { x } }
                    5121 => { let x = buf[at] as f32; if normalized { x / 255.0 } else { x } }
                    5122 => { let x = i16::from_le_bytes([buf[at], buf[at + 1]]) as f32; if normalized { (x / 32767.0).max(-1.0) } else { x } }
                    5123 => { let x = u16::from_le_bytes([buf[at], buf[at + 1]]) as f32; if normalized { x / 65535.0 } else { x } }
                    5125 => le_u32(buf, at) as f32,
                    _ => f32::from_le_bytes([buf[at], buf[at + 1], buf[at + 2], buf[at + 3]]),
                };
                out[i * n + c] = v;
            }
        }
        (out, n)
    }

    fn uints(&self, index: usize) -> Vec<u32> {
        let acc = self.doc.get("accessors").items().get(index).cloned().unwrap_or(Json::Null);
        let ct = acc.get("componentType").as_num(5125.0) as u32;
        if ct == 5125 {
            // 32-bit indices do not fit a float exactly: read them as integers
            let count = acc.get("count").as_num(0.0) as usize;
            let bv = self.doc.get("bufferViews").items().get(acc.get("bufferView").as_num(0.0) as usize).cloned().unwrap_or(Json::Null);
            let empty = Vec::new();
            let buf = self.buffers.get(bv.get("buffer").as_num(0.0) as usize).unwrap_or(&empty);
            let start = bv.get("byteOffset").as_num(0.0) as usize + acc.get("byteOffset").as_num(0.0) as usize;
            return (0..count).map(|i| le_u32(buf, start + i * 4)).collect();
        }
        self.floats(index).0.iter().map(|v| *v as u32).collect()
    }
}

fn to_linear(c: f32) -> f32 {
    if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
}

/// Reads a .glb or .gltf. `side` gives the bytes of a file named by a
/// relative uri (a .gltf's .bin), or None.
pub fn parse(bytes: &[u8], side: &dyn Fn(&str) -> Option<Vec<u8>>) -> Result<Asset, String> {
    let mut bin: Option<Vec<u8>> = None;
    let text: String;
    if bytes.len() >= 12 && &bytes[0..4] == b"glTF" {
        let total = (le_u32(bytes, 8) as usize).min(bytes.len());
        let mut at = 12;
        let mut js = String::new();
        while at + 8 <= total {
            let len = le_u32(bytes, at) as usize;
            let kind = le_u32(bytes, at + 4);
            let body = &bytes[(at + 8).min(total)..(at + 8 + len).min(total)];
            if kind == 0x4E4F534A {
                js = String::from_utf8_lossy(body).to_string();
            } else if kind == 0x004E4942 && bin.is_none() {
                bin = Some(body.to_vec());
            }
            at += 8 + len;
        }
        text = js;
    } else {
        text = String::from_utf8_lossy(bytes).to_string();
    }
    let doc = json::parse(&text);
    if !matches!(doc, Json::Obj(_)) || doc.get("asset").is_null() {
        return Err("not a glTF 2.0 file".into());
    }
    let mut buffers = Vec::new();
    for (i, b) in doc.get("buffers").items().iter().enumerate() {
        let uri = b.get("uri").as_str();
        if uri.is_empty() {
            buffers.push(if i == 0 { bin.take().unwrap_or_default() } else { Vec::new() });
        } else if let Some(p) = uri.find(";base64,") {
            buffers.push(base64(&uri[p + 8..]));
        } else {
            match side(&uri) {
                Some(v) => buffers.push(v),
                None => return Err(format!("the buffer {} is missing", uri)),
            }
        }
    }
    let rd = Reader { doc: &doc, buffers };

    // materials: (linear base colour, emissive, double sided)
    let mats: Vec<([f32; 4], [f32; 3], bool)> = doc.get("materials").items().iter().map(|m| {
        let pbr = f(m, "pbrMetallicRoughness");
        let bc = nums(&pbr.get("baseColorFactor"));
        let base = if bc.len() >= 3 { [bc[0], bc[1], bc[2], bc.get(3).copied().unwrap_or(1.0)] } else { [1.0, 1.0, 1.0, 1.0] };
        let em = nums(&m.get("emissiveFactor"));
        let emissive = if em.len() >= 3 { [em[0], em[1], em[2]] } else { [0.0; 3] };
        (base, emissive, m.get("doubleSided").as_bool())
    }).collect();

    let mut triangles = 0;
    let mut meshes = Vec::new();
    for m in doc.get("meshes").items().iter() {
        let mut prims = Vec::new();
        for p in m.get("primitives").items().iter() {
            let mode = p.get("mode").as_num(4.0) as u32;
            if mode != 4 && mode != 5 && mode != 6 {
                continue;
            }
            let at = p.get("attributes");
            let pi = at.get("POSITION");
            if pi.is_null() {
                continue;
            }
            let (pv, _) = rd.floats(pi.as_num(0.0) as usize);
            let count = pv.len() / 3;
            let pos: Vec<[f32; 3]> = (0..count).map(|i| [pv[i * 3], pv[i * 3 + 1], pv[i * 3 + 2]]).collect();
            let mut idx: Vec<u32> = if p.get("indices").is_null() { (0..count as u32).collect() } else { rd.uints(p.get("indices").as_num(0.0) as usize) };
            if mode == 5 {
                let mut t = Vec::new();
                for i in 2..idx.len() {
                    if i % 2 == 0 { t.extend_from_slice(&[idx[i - 2], idx[i - 1], idx[i]]); } else { t.extend_from_slice(&[idx[i - 1], idx[i - 2], idx[i]]); }
                }
                idx = t;
            } else if mode == 6 {
                let mut t = Vec::new();
                for i in 2..idx.len() {
                    t.extend_from_slice(&[idx[0], idx[i - 1], idx[i]]);
                }
                idx = t;
            }
            idx.truncate(idx.len() / 3 * 3);
            idx.retain(|&i| (i as usize) < count);
            idx.truncate(idx.len() / 3 * 3);
            let mut nrm: Vec<[f32; 3]> = Vec::new();
            if !at.get("NORMAL").is_null() {
                let (nv, _) = rd.floats(at.get("NORMAL").as_num(0.0) as usize);
                nrm = (0..count).map(|i| [nv.get(i * 3).copied().unwrap_or(0.0), nv.get(i * 3 + 1).copied().unwrap_or(1.0), nv.get(i * 3 + 2).copied().unwrap_or(0.0)]).collect();
            }
            if nrm.len() != count {
                // flat normals from the faces, as three.js's computeVertexNormals
                nrm = vec![[0.0; 3]; count];
                for t in idx.chunks(3) {
                    let (a, b, c) = (pos[t[0] as usize], pos[t[1] as usize], pos[t[2] as usize]);
                    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                    for &k in t {
                        let q = &mut nrm[k as usize];
                        q[0] += n[0]; q[1] += n[1]; q[2] += n[2];
                    }
                }
                for q in nrm.iter_mut() {
                    let l = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2]).sqrt().max(1e-9);
                    *q = [q[0] / l, q[1] / l, q[2] / l];
                }
            }
            let (base, emissive, double) = match p.get("material") {
                Json::Num(i) => mats.get(i as usize).copied().unwrap_or(([1.0; 4], [0.0; 3], false)),
                _ => ([1.0; 4], [0.0; 3], false),
            };
            let mut col = vec![[base[0], base[1], base[2]]; count];
            if !at.get("COLOR_0").is_null() {
                // vertex colours are linear already
                let (cv, n) = rd.floats(at.get("COLOR_0").as_num(0.0) as usize);
                for i in 0..count {
                    if i * n + 2 < cv.len() {
                        col[i] = [cv[i * n] * base[0], cv[i * n + 1] * base[1], cv[i * n + 2] * base[2]];
                    }
                }
            }
            let mut joints = Vec::new();
            let mut weights = Vec::new();
            if !at.get("JOINTS_0").is_null() && !at.get("WEIGHTS_0").is_null() {
                let (jv, _) = rd.floats(at.get("JOINTS_0").as_num(0.0) as usize);
                let (wv, _) = rd.floats(at.get("WEIGHTS_0").as_num(0.0) as usize);
                for i in 0..count {
                    let g = |v: &Vec<f32>, k: usize| v.get(i * 4 + k).copied().unwrap_or(0.0);
                    joints.push([g(&jv, 0) as u16, g(&jv, 1) as u16, g(&jv, 2) as u16, g(&jv, 3) as u16]);
                    let mut w = [g(&wv, 0), g(&wv, 1), g(&wv, 2), g(&wv, 3)];
                    let sum = w[0] + w[1] + w[2] + w[3];
                    if sum > 1e-6 {
                        for x in w.iter_mut() { *x /= sum; }
                    } else {
                        w = [1.0, 0.0, 0.0, 0.0];
                    }
                    weights.push(w);
                }
            }
            triangles += idx.len() / 3;
            prims.push(Primitive { pos, nrm, col, joints, weights, tris: idx, emissive, double });
        }
        meshes.push(prims);
    }

    let mut nodes: Vec<Node> = doc.get("nodes").items().iter().map(|n| {
        let mut t = [0.0f32; 3];
        let mut r = [0.0f32, 0.0, 0.0, 1.0];
        let mut s = [1.0f32; 3];
        let mv = nums(&n.get("matrix"));
        if mv.len() == 16 {
            let mut m = [0.0f32; 16];
            m.copy_from_slice(&mv);
            let d = decompose(&m);
            t = d.0; r = d.1; s = d.2;
        } else {
            let tv = nums(&n.get("translation"));
            if tv.len() == 3 { t = [tv[0], tv[1], tv[2]]; }
            let rv = nums(&n.get("rotation"));
            if rv.len() == 4 { r = [rv[0], rv[1], rv[2], rv[3]]; }
            let sv = nums(&n.get("scale"));
            if sv.len() == 3 { s = [sv[0], sv[1], sv[2]]; }
        }
        let opt = |v: Json| match v { Json::Num(x) => Some(x as usize), _ => None };
        Node {
            name: n.get("name").as_str(),
            children: n.get("children").items().iter().map(|c| c.as_num(0.0) as usize).collect(),
            parent: None,
            mesh: opt(n.get("mesh")),
            skin: opt(n.get("skin")),
            t, r, s,
        }
    }).collect();
    let count = nodes.len();
    for i in 0..count {
        let kids = nodes[i].children.clone();
        for c in kids {
            if c < count {
                nodes[c].parent = Some(i);
            }
        }
    }
    for n in nodes.iter_mut() {
        n.children.retain(|&c| c < count);
        if n.mesh.map(|m| m >= meshes.len()).unwrap_or(false) {
            n.mesh = None;
        }
    }

    let skins: Vec<Skin> = doc.get("skins").items().iter().map(|s| {
        let joints: Vec<usize> = s.get("joints").items().iter().map(|j| (j.as_num(0.0) as usize).min(count.saturating_sub(1))).collect();
        let ibm = if s.get("inverseBindMatrices").is_null() {
            vec![IDENTITY; joints.len()]
        } else {
            let (v, _) = rd.floats(s.get("inverseBindMatrices").as_num(0.0) as usize);
            (0..joints.len()).map(|i| {
                let mut m = IDENTITY;
                if (i + 1) * 16 <= v.len() {
                    m.copy_from_slice(&v[i * 16..i * 16 + 16]);
                }
                m
            }).collect()
        };
        Skin { joints, ibm }
    }).collect();
    for n in nodes.iter_mut() {
        if n.skin.map(|s| s >= skins.len()).unwrap_or(false) {
            n.skin = None;
        }
    }

    let mut clips = Vec::new();
    for (ai, a) in doc.get("animations").items().iter().enumerate() {
        let samplers = a.get("samplers").items();
        let mut channels = Vec::new();
        let mut duration = 0.0f32;
        for c in a.get("channels").items().iter() {
            let target = c.get("target");
            let node = match target.get("node") { Json::Num(x) => x as usize, _ => continue };
            if node >= count {
                continue;
            }
            let path = match target.get("path").as_str().as_str() { "translation" => 0, "rotation" => 1, "scale" => 2, _ => continue };
            let s = match samplers.get(c.get("sampler").as_num(0.0) as usize) { Some(s) => s, None => continue };
            let interp = match s.get("interpolation").as_str().as_str() { "STEP" => 0, "CUBICSPLINE" => 2, _ => 1 };
            let times = rd.floats(s.get("input").as_num(0.0) as usize).0;
            let values = rd.floats(s.get("output").as_num(0.0) as usize).0;
            if times.is_empty() {
                continue;
            }
            duration = duration.max(*times.last().unwrap());
            channels.push(Channel { node, path, interp, times, values });
        }
        let name = { let n = a.get("name").as_str(); if n.is_empty() { format!("Animation{}", ai) } else { n } };
        clips.push(Clip { name, duration, channels });
    }

    let scene_i = doc.get("scene").as_num(0.0) as usize;
    let mut roots: Vec<usize> = doc.get("scenes").items().get(scene_i).map(|s| s.get("nodes").items().iter().map(|n| n.as_num(0.0) as usize).filter(|&n| n < count).collect()).unwrap_or_default();
    if roots.is_empty() {
        roots = (0..count).filter(|&i| nodes[i].parent.is_none()).collect();
    }
    Ok(Asset { nodes, meshes, skins, clips, roots, triangles })
}

impl Channel {
    /// The channel's value at time `t` (3 or 4 numbers).
    fn sample(&self, t: f32) -> [f32; 4] {
        let n = if self.path == 1 { 4 } else { 3 };
        let k = self.times.len();
        // CUBICSPLINE keeps (in tangent, value, out tangent) per key
        let stride = if self.interp == 2 { n * 3 } else { n };
        let off = if self.interp == 2 { n } else { 0 };
        let get = |key: usize, part: usize| -> [f32; 4] {
            let mut o = [0.0f32; 4];
            let base = key * stride + part;
            for c in 0..n {
                o[c] = self.values.get(base + c).copied().unwrap_or(0.0);
            }
            o
        };
        if t <= self.times[0] || k == 1 {
            return get(0, off);
        }
        if t >= self.times[k - 1] {
            return get(k - 1, off);
        }
        // the key before t
        let (mut lo, mut hi) = (0usize, k - 1);
        while hi - lo > 1 {
            let mid = (lo + hi) / 2;
            if self.times[mid] <= t { lo = mid; } else { hi = mid; }
        }
        let (t0, t1) = (self.times[lo], self.times[hi]);
        let dt = (t1 - t0).max(1e-9);
        let u = ((t - t0) / dt).clamp(0.0, 1.0);
        match self.interp {
            0 => get(lo, 0),
            2 => {
                let (p0, m0) = (get(lo, n), get(lo, 2 * n));
                let (p1, m1) = (get(hi, n), get(hi, 0));
                let (u2, u3) = (u * u, u * u * u);
                let (h00, h10, h01, h11) = (2.0 * u3 - 3.0 * u2 + 1.0, u3 - 2.0 * u2 + u, -2.0 * u3 + 3.0 * u2, u3 - u2);
                let mut o = [0.0f32; 4];
                for c in 0..n {
                    o[c] = h00 * p0[c] + h10 * dt * m0[c] + h01 * p1[c] + h11 * dt * m1[c];
                }
                if n == 4 {
                    let l = (o[0] * o[0] + o[1] * o[1] + o[2] * o[2] + o[3] * o[3]).sqrt().max(1e-9);
                    for c in 0..4 { o[c] /= l; }
                }
                o
            }
            _ => {
                let (a, b) = (get(lo, 0), get(hi, 0));
                if n == 4 {
                    slerp(a, b, u)
                } else {
                    [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 0.0]
                }
            }
        }
    }
}

/// The pose (each node's local translation, rotation, scale) for a mix of
/// clips: (clip index, time, weight). As three.js's PropertyMixer: each
/// property is the weighted mix of the clips that animate it, and where the
/// weights add up to less than 1 the rest is the model's own (rest) pose.
pub fn pose(asset: &Asset, mix: &[(usize, f32, f32)]) -> Vec<([f32; 3], [f32; 4], [f32; 3])> {
    let count = asset.nodes.len();
    // accumulated value and weight a node and property
    let mut acc: Vec<[([f32; 4], f32); 3]> = vec![[([0.0; 4], 0.0); 3]; count];
    for &(ci, time, weight) in mix.iter() {
        if weight <= 0.0 {
            continue;
        }
        let clip = match asset.clips.get(ci) { Some(c) => c, None => continue };
        for ch in clip.channels.iter() {
            let v = ch.sample(time);
            let slot = &mut acc[ch.node][ch.path as usize];
            if slot.1 == 0.0 {
                *slot = (v, weight);
            } else {
                let total = slot.1 + weight;
                let k = weight / total;
                slot.0 = if ch.path == 1 {
                    slerp(slot.0, v, k)
                } else {
                    [slot.0[0] + (v[0] - slot.0[0]) * k, slot.0[1] + (v[1] - slot.0[1]) * k, slot.0[2] + (v[2] - slot.0[2]) * k, 0.0]
                };
                slot.1 = total;
            }
        }
    }
    (0..count).map(|i| {
        let n = &asset.nodes[i];
        let a = &acc[i];
        let mix3 = |slot: &([f32; 4], f32), rest: [f32; 3]| -> [f32; 3] {
            if slot.1 <= 0.0 { return rest; }
            let k = slot.1.min(1.0);
            [rest[0] + (slot.0[0] - rest[0]) * k, rest[1] + (slot.0[1] - rest[1]) * k, rest[2] + (slot.0[2] - rest[2]) * k]
        };
        let r = if a[1].1 <= 0.0 { n.r } else if a[1].1 >= 1.0 { a[1].0 } else { slerp(n.r, a[1].0, a[1].1) };
        (mix3(&a[0], n.t), r, mix3(&a[2], n.s))
    }).collect()
}

/// Each node's matrix in the model's space for a pose.
pub fn world_matrices(asset: &Asset, pose: &[([f32; 3], [f32; 4], [f32; 3])]) -> Vec<M4> {
    let mut out = vec![IDENTITY; asset.nodes.len()];
    let mut stack: Vec<(usize, M4)> = asset.roots.iter().map(|&r| (r, IDENTITY)).collect();
    let mut seen = vec![false; asset.nodes.len()];
    while let Some((i, parent)) = stack.pop() {
        if seen[i] {
            continue;
        }
        seen[i] = true;
        let (t, r, s) = pose[i];
        let m = mat_mul(&parent, &compose(t, r, s));
        out[i] = m;
        for &c in asset.nodes[i].children.iter() {
            stack.push((c, m));
        }
    }
    out
}
