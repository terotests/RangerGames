// SPDX-License-Identifier: AGPL-3.0-or-later
//! The draw stream: EVG's display list as numbers and a string table, which
//! a platform paints without parsing JSON (the web host's canvas painter,
//! web/js/painter.js, reads exactly this).
//!
//! One command is 23 numbers, then its extra numbers:
//!
//! ```text
//!  0 kind      0 rect, 1 border, 2 image, 3 text, 4 push clip, 5 pop clip, 6 path, 7 stroke
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
        let s0 = if c.kind == 2 { self.string(&c.src) } else { self.string(&c.text) };
        let s1 = self.string(&c.font_family);
        let s2 = self.string(&c.font_weight);
        let thickness = if c.kind == 3 { c.font_size } else { c.thickness };
        self.nums.extend_from_slice(&[
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
        self.nums.extend_from_slice(&extra);
        self.count += 1;
    }
}
