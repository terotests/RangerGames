// SPDX-License-Identifier: AGPL-3.0-or-later
//! The draw stream: EVG's display list as numbers and a string table, which
//! a platform paints without parsing JSON (the web host's canvas painter,
//! web/js/painter.js, reads exactly this).
//!
//! One command is 23 numbers, then its extra numbers:
//!
//! ```text
//!  0 kind      0 rect, 1 border, 2 image, 3 text, 4 push clip, 5 pop clip, 6 path, 7 stroke,
//!             8 sphere (a textured globe, see `DrawStream::sphere`),
//!             9 the 3D layer (x, y: floats from..to of the scene's triangles; only for gl_all)
//!  1 x  2 y  3 w  4 h
//!  5 r  6 g  7 b  8 a           colour, 0-255 and 0-1
//!  9-12 radii                   top-left, top-right, bottom-right, bottom-left
//! 13 thickness                  a border's or stroke's width; a text's font size
//! 14 rotate (degrees)  15-16 rotation origin
//! 17 flags                      1 gradient, 2 gradient across, 4 shadow, 8 flip x,
//!                               16 flip y, 32 even-odd, 64 crop, 128 rotation origin,
//!                               256 italic, 512 smooth, 1024 tile
//! 18 string: text or image src  19 string: font family  20 string: font weight
//! 21 letter spacing
//! 22 n: the extra numbers that follow
//! ```
//!
//! The extras, in this order, each when its flag is set: the gradient's far
//! colour (r, g, b, a); the shadow (x, y, blur, r, g, b, a); the crop
//! (x0, y0, x1, y1 as fractions of the image); the tile (x, y, w, h); and for
//! a path or stroke the points (count, x y …) and the ring ends (count, …).
//! Strings are indices into the frame's table, -1 for none.

use rg_evg::EVGDrawCmd;
use std::collections::HashMap;

/// Writes one EVG draw command into a DrawStream. A macro, not a function,
/// so it takes the EVGDrawCmd of any EVG build: the engine's (rg_evg) and the
/// newer one the RangerDOM renderer brings (crates/rg_web_dom).
#[macro_export]
macro_rules! draw_command {
    ($stream:expr, $cmd:expr) => {{
        let s: &mut $crate::draw::DrawStream = $stream;
        let c = $cmd;
        let mut flags: u32 = 0;
        let mut extra: Vec<f32> = Vec::new();
        if c.has_grad {
            flags |= 1;
            if c.grad_dir == 1 {
                flags |= 2;
            }
            extra.extend_from_slice(&[c.r2 as f32, c.g2 as f32, c.b2 as f32, c.a2 as f32]);
        }
        if c.has_shadow {
            flags |= 4;
            extra.extend_from_slice(&[
                c.shadow_x as f32,
                c.shadow_y as f32,
                c.shadow_blur as f32,
                c.shadow_r as f32,
                c.shadow_g as f32,
                c.shadow_b as f32,
                c.shadow_a as f32,
            ]);
        }
        if c.flip_h {
            flags |= 8;
        }
        if c.flip_v {
            flags |= 16;
        }
        if c.even_odd {
            flags |= 32;
        }
        if c.has_crop {
            flags |= 64;
            extra.extend_from_slice(&[
                c.crop_x as f32,
                c.crop_y as f32,
                (c.crop_x + c.crop_w) as f32,
                (c.crop_y + c.crop_h) as f32,
            ]);
        }
        if c.has_rot_origin {
            flags |= 128;
        }
        if c.text_align == "italic" {
            flags |= 256;
        }
        if c.smooth {
            flags |= 512;
        }
        if let Some(t) = &c.tile {
            flags |= 1024;
            let t = t.borrow();
            extra.extend_from_slice(&[t.x as f32, t.y as f32, t.w as f32, t.h as f32]);
        }
        if (c.kind == 6 || c.kind == 7) && !c.pts.is_empty() {
            extra.push(c.pts.len() as f32);
            for p in c.pts.iter() {
                extra.push(*p as f32);
            }
            if c.ring_ends.is_empty() {
                extra.push(1.0);
                extra.push(c.pts.len() as f32);
            } else {
                extra.push(c.ring_ends.len() as f32);
                for e in c.ring_ends.iter() {
                    extra.push(*e as f32);
                }
            }
        }
        let (tl, tr, br, bl) = if c.per_corner {
            (c.radius, c.radius_tr, c.radius_br, c.radius_bl)
        } else {
            (c.radius, c.radius, c.radius, c.radius)
        };
        let s0 = if c.kind == 2 { s.string(&c.src) } else { s.string(&c.text) };
        let s1 = s.string(&c.font_family);
        let s2 = s.string(&c.font_weight);
        let thickness = if c.kind == 3 { c.font_size } else { c.thickness };
        s.nums.extend_from_slice(&[
            c.kind as f32,
            c.x as f32,
            c.y as f32,
            c.w as f32,
            c.h as f32,
            c.r as f32,
            c.g as f32,
            c.b as f32,
            c.a as f32,
            tl as f32,
            tr as f32,
            br as f32,
            bl as f32,
            thickness as f32,
            c.rotate as f32,
            c.rot_origin_x as f32,
            c.rot_origin_y as f32,
            flags as f32,
            s0,
            s1,
            s2,
            c.letter_spacing as f32,
            extra.len() as f32,
        ]);
        s.nums.extend_from_slice(&extra);
        s.count += 1;
    }};
}

pub const HEADER: usize = 23;

pub struct DrawStream {
    pub nums: Vec<f32>,
    pub strings: Vec<String>,
    index: HashMap<String, i32>,
    pub count: usize,
}

impl DrawStream {
    pub fn new() -> DrawStream {
        DrawStream { nums: Vec::with_capacity(4096), strings: Vec::new(), index: HashMap::new(), count: 0 }
    }

    pub fn clear(&mut self) {
        self.nums.clear();
        self.strings.clear();
        self.index.clear();
        self.count = 0;
    }

    pub fn string(&mut self, s: &str) -> f32 {
        if s.is_empty() {
            return -1.0;
        }
        if let Some(i) = self.index.get(s) {
            return *i as f32;
        }
        let i = self.strings.len() as i32;
        self.strings.push(s.to_string());
        self.index.insert(s.to_string(), i);
        i as f32
    }

    /// The table as one text, the strings separated by NUL.
    pub fn strings_joined(&self) -> String {
        self.strings.join("\u{0}")
    }

    pub fn command(&mut self, c: &EVGDrawCmd) {
        crate::draw_command!(self, c);
    }

    /// A command of the engine's own (the 3D layer): a rect (kind 0, with a
    /// top-to-bottom gradient when `far` is given) or a filled path (kind 6)
    /// of one ring. Colours are 0..1 channels.
    pub fn raw(&mut self, kind: u32, x: f64, y: f64, w: f64, h: f64, rgb: [f64; 3], far: Option<[f64; 3]>, pts: &[f32]) {
        let ends = [pts.len() as f32];
        self.emit(kind, x, y, w, h, rgb, far, pts, if pts.is_empty() { &[] } else { &ends });
    }

    /// Where the 3D scene's triangles go in the stream's order (kind 9, for a
    /// host that draws everything with GL): floats `from..to` of the tris.
    pub fn layer3d(&mut self, from: usize, to: usize) {
        if to > from {
            self.raw(9, from as f64, to as f64, 0.0, 0.0, [0.0; 3], None, &[]);
        }
    }

    /// A filled path of several rings (`ends`: where each ring's numbers end).
    pub fn raw_rings(&mut self, rgb: [f64; 3], pts: &[f32], ends: &[f32]) {
        self.emit(6, 0.0, 0.0, 0.0, 0.0, rgb, None, pts, ends);
    }

    /// A filled (`kind` 6) or stroked (7) path of several rings, with an
    /// opacity and, for a stroke, a line width.
    pub fn rings(&mut self, kind: u32, rgb: [f64; 3], alpha: f64, width: f64, pts: &[f32], ends: &[f32]) {
        if pts.is_empty() {
            return;
        }
        let mut extra: Vec<f32> = Vec::with_capacity(pts.len() + ends.len() + 2);
        extra.push(pts.len() as f32);
        extra.extend_from_slice(pts);
        extra.push(ends.len() as f32);
        extra.extend_from_slice(ends);
        self.nums.extend_from_slice(&[
            kind as f32, 0.0, 0.0, 0.0, 0.0,
            (rgb[0] * 255.0) as f32, (rgb[1] * 255.0) as f32, (rgb[2] * 255.0) as f32, alpha as f32,
            0.0, 0.0, 0.0, 0.0, width as f32, 0.0, 0.0, 0.0, 0.0, -1.0, -1.0, -1.0, 0.0, extra.len() as f32,
        ]);
        self.nums.extend_from_slice(&extra);
        self.count += 1;
    }

    /// A textured sphere (kind 8): the host fills the box x, y, w, h with a
    /// ball of radius 1 seen from a camera, its colours from the picture `src`
    /// (equirectangular: longitude -180…180 across, latitude 90…-90 down).
    /// The extra numbers, all in the ball's own frame (z: the north pole,
    /// x: longitude 0, y: longitude 90):
    ///
    /// ```text
    ///  0-2 eye   3-5 right   6-8 up   9-11 forward   12-14 sun direction
    /// 15 focal (pixels)  16-17 the view's width and height
    /// 18 night (how dark the night side is, 0…1)  19 lit (0: no shading)
    /// ```
    ///
    /// A pixel (px, py) looks along forward × focal + right × (px - width/2)
    /// - up × (py - height/2); where that ray meets the ball the picture is
    /// read at the point's longitude and latitude, and lit by
    /// 1 - night × (1 - max(0, normal · sun)). Pixels that miss the ball stay
    /// as they were. A host that does not know kind 8 skips it.
    ///
    /// With 32 numbers (`sphere_air`) there is more, and a host that knows only
    /// 20 or 24 reads the first 24 (the window then is the whole map):
    ///
    /// ```text
    /// 20-23 window u0 v0 u1 v1   24 use the window (1) or not (0)
    /// 25 air: the height of the glowing air, in radii (0: none); drawn round
    ///    the ball too, so the box takes it in
    /// 26-28 the air's colour (0…1)   29 city lights' strength (the second
    ///    picture, string 2, read on the night side)
    /// 30 relief: how much the picture's brightness, read as height, tilts
    ///    the ground for the sun (0: none)   31 unused, except with 40 numbers
    ///    and a window: the picture's own sun (see 39)
    /// ```
    ///
    /// With 40 numbers the ball has real heights (`sphere_terrain`): string 3
    /// names two pictures, "shading|shape", both equirectangular with the
    /// height coded as (red × 256 + green) / 65535 between a low and a high:
    /// the sharp one only tilts the ground for the sun, the coarse one (read
    /// bilinearly, texel centres at (i + ½) / width) gives the ground its shape.
    ///
    /// ```text
    /// 32 low  33 high: the heights of 0 and 1 in the pictures, in radii (so the
    ///    ground at unit direction p is at 1 + low + (high - low) × shape(p)
    ///    + detail(p))
    /// 34 detail: the amplitude of the made-up bumps added on top, in radii
    /// 35 near (1): the eye is close, cast the rays against the ground's
    ///    shape (mountains on the horizon); 0: a smooth ball, only shaded
    /// 36 how much the shading picture tilts the ground (1: true slopes)
    /// 37 the bumps' scale: lattice cells per radius of the coarsest of them
    /// 38 craters: how deep the made-up craters are (0: none, 1: as deep as a
    ///    fifth of their width)
    /// 39 with a window (a sharper picture): how much brighter the picture is
    ///    per unit of slope towards the direction 31 (radians from east towards
    ///    north; 0: don't read slopes from it). Close by, the host may read the
    ///    ground's small slopes from the picture's brightness: slope along 31 =
    ///    (brightness - its blur) / this, and light them by the game's own sun
    /// ```
    ///
    /// With 40 numbers, near (35) and no window (24 = 0), 20-23 that are not
    /// 0 0 1 1 are a hole: the windows drawn after this ball cover it (u may
    /// run below 0 or past 1), so the host may skip the ground there, and
    /// cast rays only around it (a margin for the parallax of mountains).
    ///
    /// The bumps (the same in every host and in the game's own physics,
    /// web/js/painter.js `bumps` is the reference): with f = scale,
    /// detail(p) = amplitude × Σ(o = 0…4) 0.48^o × (2 × noise(p × f × 2.03^o)
    /// - 1) + craters × Σ(o = 0…2) (crater(p, 0.9 f × 2.7^o, 2o) +
    /// crater(p, 0.9 f × 2.7^o, 2o + 1)). noise is a value noise on the
    /// integer lattice, smoothstep between the corners, each corner
    /// hash(x, y, z) of 32-bit integers: h = x·0x8da6b343 ^ y·0xd8163841 ^
    /// z·0xcb1ab31f; h ^= h >> 16; h ·= 0x7feb352d; h ^= h >> 15;
    /// h ·= 0x846ca68b; h ^= h >> 16; value (h >> 8) / 16777215. A crater
    /// lies inside one lattice cell (of the lattice shifted by (0.37, 0.61,
    /// 0.19) for odd layers); hosts may add finer octaves to the shading only.
    pub fn sphere(&mut self, x: f64, y: f64, w: f64, h: f64, src: &str, params: &[f32]) {
        self.sphere_terrain(x, y, w, h, src, "", "", params);
    }

    /// `sphere` with the second picture (city lights on the night side).
    #[allow(clippy::too_many_arguments)]
    pub fn sphere_air(&mut self, x: f64, y: f64, w: f64, h: f64, src: &str, lights: &str, params: &[f32]) {
        self.sphere_terrain(x, y, w, h, src, lights, "", params);
    }

    /// `sphere_air` with the height pictures ("shading|shape", string 3).
    #[allow(clippy::too_many_arguments)]
    pub fn sphere_terrain(&mut self, x: f64, y: f64, w: f64, h: f64, src: &str, lights: &str, heights: &str, params: &[f32]) {
        let s = self.string(src);
        let l = if lights.is_empty() { -1.0 } else { self.string(lights) };
        let hs = if heights.is_empty() { -1.0 } else { self.string(heights) };
        self.nums.extend_from_slice(&[
            8.0, x as f32, y as f32, w as f32, h as f32,
            255.0, 255.0, 255.0, 1.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, s, l, hs, 0.0, params.len() as f32,
        ]);
        self.nums.extend_from_slice(params);
        self.count += 1;
    }

    fn emit(&mut self, kind: u32, x: f64, y: f64, w: f64, h: f64, rgb: [f64; 3], far: Option<[f64; 3]>, pts: &[f32], ends: &[f32]) {
        let mut flags = 0u32;
        let mut extra: Vec<f32> = Vec::new();
        if let Some(c) = far {
            flags |= 1;
            extra.extend_from_slice(&[(c[0] * 255.0) as f32, (c[1] * 255.0) as f32, (c[2] * 255.0) as f32, 1.0]);
        }
        if kind == 6 && !pts.is_empty() {
            extra.push(pts.len() as f32);
            extra.extend_from_slice(pts);
            extra.push(ends.len() as f32);
            extra.extend_from_slice(ends);
        }
        self.nums.extend_from_slice(&[
            kind as f32, x as f32, y as f32, w as f32, h as f32,
            (rgb[0] * 255.0) as f32, (rgb[1] * 255.0) as f32, (rgb[2] * 255.0) as f32, 1.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, flags as f32, -1.0, -1.0, -1.0, 0.0, extra.len() as f32,
        ]);
        self.nums.extend_from_slice(&extra);
        self.count += 1;
    }
}
