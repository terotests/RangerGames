// SPDX-License-Identifier: AGPL-3.0-or-later
//! Height pictures read on the CPU, for a game's physics: the same PNG files
//! the globe shades and shapes its ground with (16 bits as red * 256 +
//! green, 0..1 from heightMin to heightMax), so where the ship lands is the
//! ground that is drawn. A small PNG decoder (8-bit grey, RGB, RGBA, not
//! interlaced) with its own inflate.

/// A decoded height picture: w × h values 0..65535 (red * 256 + green).
pub struct HeightPic {
    pub w: usize,
    pub h: usize,
    pub v: Vec<u16>,
}

impl HeightPic {
    /// The height 0..1 at u, v (0..1 across the picture, pixel centres at
    /// (i + 0.5) / w), read bilinearly as the GPU reads it; clamped at the edges.
    pub fn at(&self, u: f64, v: f64) -> f64 {
        let x = u * self.w as f64 - 0.5;
        let y = v * self.h as f64 - 0.5;
        let x0 = x.floor();
        let y0 = y.floor();
        let ax = x - x0;
        let ay = y - y0;
        let cx = |i: f64| (i.max(0.0) as usize).min(self.w - 1);
        let cy = |j: f64| (j.max(0.0) as usize).min(self.h - 1);
        let (i0, i1, j0, j1) = (cx(x0), cx(x0 + 1.0), cy(y0), cy(y0 + 1.0));
        let g = |i: usize, j: usize| self.v[j * self.w + i] as f64;
        let top = g(i0, j0) * (1.0 - ax) + g(i1, j0) * ax;
        let bot = g(i0, j1) * (1.0 - ax) + g(i1, j1) * ax;
        (top * (1.0 - ay) + bot * ay) / 65535.0
    }
}

/// Decodes a PNG height picture; None when it is not one this reads.
pub fn decode_png(b: &[u8]) -> Option<HeightPic> {
    if b.len() < 33 || b[0..8] != [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
        return None;
    }
    let be32 = |i: usize| u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as usize;
    let (mut w, mut h, mut ch) = (0usize, 0usize, 0usize);
    let mut idat: Vec<u8> = Vec::new();
    let mut i = 8;
    while i + 8 <= b.len() {
        let len = be32(i);
        let kind = &b[i + 4..i + 8];
        let d = i + 8;
        if d + len > b.len() {
            return None;
        }
        match kind {
            b"IHDR" => {
                w = be32(d);
                h = be32(d + 4);
                let (depth, color, interlace) = (b[d + 8], b[d + 9], b[d + 12]);
                if depth != 8 || interlace != 0 {
                    return None;
                }
                ch = match color {
                    0 => 1,
                    2 => 3,
                    4 => 2,
                    6 => 4,
                    _ => return None,
                };
            }
            b"IDAT" => idat.extend_from_slice(&b[d..d + len]),
            b"IEND" => break,
            _ => {}
        }
        i = d + len + 4;
    }
    if w == 0 || h == 0 || ch == 0 || idat.len() < 2 {
        return None;
    }
    let stride = w * ch;
    let raw = inflate(&idat[2..], (stride + 1) * h)?;
    if raw.len() < (stride + 1) * h {
        return None;
    }
    // undo the filters, row by row
    let mut px = vec![0u8; stride * h];
    for y in 0..h {
        let f = raw[y * (stride + 1)];
        let src = &raw[y * (stride + 1) + 1..(y + 1) * (stride + 1)];
        for x in 0..stride {
            let a = if x >= ch { px[y * stride + x - ch] as i32 } else { 0 };
            let up = if y > 0 { px[(y - 1) * stride + x] as i32 } else { 0 };
            let c = if x >= ch && y > 0 { px[(y - 1) * stride + x - ch] as i32 } else { 0 };
            let pred = match f {
                0 => 0,
                1 => a,
                2 => up,
                3 => (a + up) / 2,
                4 => {
                    let p = a + up - c;
                    let (pa, pb, pc) = ((p - a).abs(), (p - up).abs(), (p - c).abs());
                    if pa <= pb && pa <= pc { a } else if pb <= pc { up } else { c }
                }
                _ => return None,
            };
            px[y * stride + x] = (src[x] as i32 + pred) as u8;
        }
    }
    let mut v = Vec::with_capacity(w * h);
    for k in 0..w * h {
        let r = px[k * ch] as u16;
        // grey: the one channel is the high byte; otherwise green is the low one
        let g = if ch >= 3 { px[k * ch + 1] as u16 } else { 0 };
        v.push(r * 256 + g);
    }
    Some(HeightPic { w, h, v })
}

struct Bits<'a> {
    b: &'a [u8],
    pos: usize,
    bit: u32,
    n: u32,
}

impl<'a> Bits<'a> {
    fn need(&mut self, k: u32) -> Option<()> {
        while self.n < k {
            if self.pos >= self.b.len() {
                return None;
            }
            self.bit |= (self.b[self.pos] as u32) << self.n;
            self.pos += 1;
            self.n += 8;
        }
        Some(())
    }
    fn get(&mut self, k: u32) -> Option<u32> {
        if k == 0 {
            return Some(0);
        }
        self.need(k)?;
        let v = self.bit & ((1u32 << k) - 1);
        self.bit >>= k;
        self.n -= k;
        Some(v)
    }
}

/// A canonical Huffman code: counts per length and the symbols in order.
struct Huff {
    count: [u16; 16],
    sym: Vec<u16>,
}

impl Huff {
    fn new(lens: &[u8]) -> Huff {
        let mut count = [0u16; 16];
        for &l in lens {
            count[l as usize] += 1;
        }
        count[0] = 0;
        let mut offs = [0u16; 16];
        for l in 1..16 {
            offs[l] = offs[l - 1] + count[l - 1];
        }
        let mut sym = vec![0u16; lens.len()];
        for (s, &l) in lens.iter().enumerate() {
            if l != 0 {
                sym[offs[l as usize] as usize] = s as u16;
                offs[l as usize] += 1;
            }
        }
        Huff { count, sym }
    }
    fn decode(&self, bits: &mut Bits) -> Option<u16> {
        let (mut code, mut first, mut index) = (0i32, 0i32, 0i32);
        for l in 1..16 {
            code |= bits.get(1)? as i32;
            let c = self.count[l] as i32;
            if code - c < first {
                return self.sym.get((index + (code - first)) as usize).copied();
            }
            index += c;
            first += c;
            first <<= 1;
            code <<= 1;
        }
        None
    }
}

const LBASE: [u16; 29] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT: [u8; 29] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE: [u16; 30] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT: [u8; 30] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/// Inflates a raw DEFLATE stream (RFC 1951); `hint`: the expected size.
pub fn inflate(data: &[u8], hint: usize) -> Option<Vec<u8>> {
    let mut out: Vec<u8> = Vec::with_capacity(hint);
    let mut bits = Bits { b: data, pos: 0, bit: 0, n: 0 };
    loop {
        let last = bits.get(1)?;
        let kind = bits.get(2)?;
        match kind {
            0 => {
                bits.bit = 0;
                bits.n = 0;
                if bits.pos + 4 > data.len() {
                    return None;
                }
                let len = data[bits.pos] as usize | (data[bits.pos + 1] as usize) << 8;
                bits.pos += 4;
                if bits.pos + len > data.len() {
                    return None;
                }
                out.extend_from_slice(&data[bits.pos..bits.pos + len]);
                bits.pos += len;
            }
            1 | 2 => {
                let (lit, dist) = if kind == 1 {
                    let mut l = [0u8; 288];
                    for (i, x) in l.iter_mut().enumerate() {
                        *x = if i < 144 { 8 } else if i < 256 { 9 } else if i < 280 { 7 } else { 8 };
                    }
                    (Huff::new(&l), Huff::new(&[5u8; 30]))
                } else {
                    let hlit = bits.get(5)? as usize + 257;
                    let hdist = bits.get(5)? as usize + 1;
                    let hclen = bits.get(4)? as usize + 4;
                    const ORD: [usize; 19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
                    let mut cl = [0u8; 19];
                    for &o in ORD.iter().take(hclen) {
                        cl[o] = bits.get(3)? as u8;
                    }
                    let ch = Huff::new(&cl);
                    let mut lens = vec![0u8; hlit + hdist];
                    let mut i = 0;
                    while i < hlit + hdist {
                        let s = ch.decode(&mut bits)?;
                        let (val, rep) = match s {
                            0..=15 => (s as u8, 1),
                            16 => (if i > 0 { lens[i - 1] } else { return None }, 3 + bits.get(2)? as usize),
                            17 => (0, 3 + bits.get(3)? as usize),
                            _ => (0, 11 + bits.get(7)? as usize),
                        };
                        if i + rep > lens.len() {
                            return None;
                        }
                        for _ in 0..rep {
                            lens[i] = val;
                            i += 1;
                        }
                    }
                    (Huff::new(&lens[..hlit]), Huff::new(&lens[hlit..]))
                };
                loop {
                    let s = lit.decode(&mut bits)? as usize;
                    if s < 256 {
                        out.push(s as u8);
                    } else if s == 256 {
                        break;
                    } else {
                        let k = s - 257;
                        if k >= 29 {
                            return None;
                        }
                        let len = LBASE[k] as usize + bits.get(LEXT[k] as u32)? as usize;
                        let ds = dist.decode(&mut bits)? as usize;
                        if ds >= 30 {
                            return None;
                        }
                        let d = DBASE[ds] as usize + bits.get(DEXT[ds] as u32)? as usize;
                        if d > out.len() {
                            return None;
                        }
                        let start = out.len() - d;
                        for j in 0..len {
                            let c = out[start + j];
                            out.push(c);
                        }
                    }
                }
            }
            _ => return None,
        }
        if last == 1 {
            break;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stored_block_inflates_to_itself() {
        // final stored block "hi"
        let d = [0x01, 0x02, 0x00, 0xfd, 0xff, b'h', b'i'];
        assert_eq!(inflate(&d, 2).unwrap(), b"hi");
    }

    #[test]
    fn a_fixed_huffman_block_inflates() {
        // zlib.compress(b"aaaaaaaaaa")[2:-4]: a literal and a back reference
        let d = [0x4b, 0x4c, 0x84, 0x01, 0x00];
        assert_eq!(inflate(&d, 10).unwrap(), b"aaaaaaaaaa");
    }

    #[test]
    fn a_height_png_reads_back_its_values() {
        let b = include_bytes!("../tests/height4x2.png");
        let p = decode_png(b).unwrap();
        assert_eq!((p.w, p.h), (4, 2));
        // made with red * 256 + green = 0, 1000, 30000, 65535 / row 2: 512, 256, 128, 64
        assert_eq!(p.v, vec![0, 1000, 30000, 65535, 512, 256, 128, 64]);
        assert!((p.at(0.125, 0.25) - 0.0).abs() < 1e-9);
        assert!((p.at(0.875, 0.25) - 1.0).abs() < 1e-9);
        // halfway between the first two pixels of row 1
        assert!((p.at(0.25, 0.25) - 500.0 / 65535.0).abs() < 1e-9);
    }
}
