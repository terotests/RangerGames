// SPDX-License-Identifier: AGPL-3.0-or-later
//! "splats" (rg.three add { shape: "splats", src }): a baked particle run
//! (an SPH bake, file format .rgps v1) played back at the game's time and
//! drawn by the host as soft splats that melt into a liquid surface (draw.rs
//! kind 10).
//!
//! .rgps v1, little-endian: a 48-byte header ("RGPS", u32 version 1, u32 N
//! particles, u32 F frames, f32 dt seconds between frames, f32 posScale file
//! units an i16 step, f32 velScale file units/s an i8 step, f32 radius in file
//! units, f32 tMin, f32 tMax, two u32 0), N bytes of material, N bytes of
//! radius (r = radius × m / 64), zero padding to 4, then F frames of N × 10
//! bytes: x, y, z i16, vx, vy, vz i8, temperature u8 (0 = tMin, 255 = tMax).
//! A particle absent in a frame has x = y = z = -32768. Between frames the
//! places are Hermite curves through both frames' places and velocities.
//! A particle that comes or goes shrinks to nothing over the half step next
//! to its absent frame (Halley's coma: hundreds of splats popping in and out
//! at once every frame step of the bake read as a jerk every 0.2 s).

type V3 = [f64; 3];

pub struct Splats {
    data: Vec<u8>,
    n: usize,
    frames: usize,
    dt: f64,
    pos_scale: f64,
    vel_scale: f64,
    radius: f64,
    mats: usize,
    rads: usize,
    body: usize,
    /// the game's time, in the bake's seconds from frame 0
    pub time: f64,
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

fn f32_at(b: &[u8], i: usize) -> f64 {
    f32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as f64
}

impl Splats {
    /// The bake from the file's bytes, or None when they are not .rgps v1.
    pub fn new(data: Vec<u8>) -> Option<Splats> {
        if data.len() < 48 || &data[0..4] != b"RGPS" || u32_at(&data, 4) != 1 {
            return None;
        }
        let n = u32_at(&data, 8) as usize;
        let frames = u32_at(&data, 12) as usize;
        let mats = 48;
        let rads = mats + n;
        let body = (rads + n + 3) / 4 * 4;
        if n == 0 || frames == 0 || data.len() < body + frames * n * 10 {
            return None;
        }
        Some(Splats {
            n,
            frames,
            dt: f32_at(&data, 16).max(1e-9),
            pos_scale: f32_at(&data, 20),
            vel_scale: f32_at(&data, 24),
            radius: f32_at(&data, 28),
            mats,
            rads,
            body,
            data,
            time: 0.0,
        })
    }

    /// particle i of frame k: (place, velocity, temperature 0..1), None when absent
    fn at(&self, k: usize, i: usize) -> Option<(V3, V3, f64)> {
        let o = self.body + (k * self.n + i) * 10;
        let b = &self.data;
        let x = i16::from_le_bytes([b[o], b[o + 1]]);
        let y = i16::from_le_bytes([b[o + 2], b[o + 3]]);
        let z = i16::from_le_bytes([b[o + 4], b[o + 5]]);
        if x == i16::MIN && y == i16::MIN && z == i16::MIN {
            return None;
        }
        let s = self.pos_scale;
        let v = self.vel_scale;
        Some((
            [x as f64 * s, y as f64 * s, z as f64 * s],
            [b[o + 6] as i8 as f64 * v, b[o + 7] as i8 as f64 * v, b[o + 8] as i8 as f64 * v],
            b[o + 9] as f64 / 255.0,
        ))
    }

    /// The particles at `self.time`: (place in file units, radius in file
    /// units, temperature 0..1, material).
    pub fn each(&self, mut f: impl FnMut(V3, f64, f64, u8)) {
        let x = (self.time / self.dt).max(0.0);
        let last = self.frames - 1;
        let k = (x.floor() as usize).min(last);
        let s = if k >= last { 0.0 } else { x - k as f64 };
        let (h00, h10, h01, h11) = (2.0 * s * s * s - 3.0 * s * s + 1.0, s * s * s - 2.0 * s * s + s, -2.0 * s * s * s + 3.0 * s * s, s * s * s - s * s);
        let dt = self.dt;
        for i in 0..self.n {
            let a = self.at(k, i);
            let b = if s > 0.0 { self.at(k + 1, i) } else { None };
            let (p, t, g) = match (a, b) {
                (Some((p0, v0, t0)), Some((p1, v1, t1))) => {
                    let mut p = [0.0; 3];
                    for c in 0..3 {
                        p[c] = h00 * p0[c] + h10 * dt * v0[c] + h01 * p1[c] + h11 * dt * v1[c];
                    }
                    (p, t0 + (t1 - t0) * s, 1.0)
                }
                (Some((p0, v0, t0)), None) if s < 0.5 => ([p0[0] + v0[0] * s * dt, p0[1] + v0[1] * s * dt, p0[2] + v0[2] * s * dt], t0, 1.0 - 2.0 * s),
                (None, Some((p1, v1, t1))) if s >= 0.5 => {
                    let back = (1.0 - s) * dt;
                    ([p1[0] - v1[0] * back, p1[1] - v1[1] * back, p1[2] - v1[2] * back], t1, 2.0 * s - 1.0)
                }
                _ => continue,
            };
            if g < 0.02 {
                continue;
            }
            let r = g * self.radius * self.data[self.rads + i] as f64 / 64.0;
            f(p, r, t, self.data[self.mats + i]);
        }
    }
}

#[cfg(test)]
pub(crate) fn test_file(n: usize, frames: usize, dt: f32, place: impl Fn(usize, usize) -> ([i16; 3], [i8; 3], u8)) -> Vec<u8> {
    let mut b = Vec::new();
    b.extend_from_slice(b"RGPS");
    for v in [1u32, n as u32, frames as u32] {
        b.extend_from_slice(&v.to_le_bytes());
    }
    for v in [dt, 0.01f32, 0.01, 0.05, 1000.0, 3000.0] {
        b.extend_from_slice(&v.to_le_bytes());
    }
    b.extend_from_slice(&[0u8; 8]);
    b.extend(std::iter::repeat(0u8).take(n));
    b.extend(std::iter::repeat(64u8).take(n));
    while b.len() % 4 != 0 {
        b.push(0);
    }
    for k in 0..frames {
        for i in 0..n {
            let (p, v, t) = place(k, i);
            for c in p {
                b.extend_from_slice(&c.to_le_bytes());
            }
            for c in v {
                b.push(c as u8);
            }
            b.push(t);
        }
    }
    b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plays_back_between_frames_and_leaves_out_the_absent() {
        // particle 0 moves along x at 1 unit/s (100 steps a frame of 1 s, velocity 1 = 100 i8 steps of 0.01);
        // particle 1 is absent in frame 1
        let f = test_file(2, 2, 1.0, |k, i| {
            if i == 1 && k == 1 { ([i16::MIN; 3], [0; 3], 0) } else { ([(k * 100) as i16, 0, 0], [100, 0, 0], if k == 0 { 255 } else { 0 }) }
        });
        let mut s = Splats::new(f).expect("rgps");
        s.time = 0.5;
        let mut got = Vec::new();
        s.each(|p, r, t, _| got.push((p, r, t)));
        // particle 1 is gone past the half of the way to its absent frame
        assert_eq!(got.len(), 1);
        assert!((got[0].0[0] - 0.5).abs() < 1e-6, "{:?}", got[0]);
        assert!((got[0].1 - 0.05).abs() < 1e-9);
        assert!((got[0].2 - 0.5).abs() < 1e-6);
        // past the last frame: the last frame
        s.time = 9.0;
        let mut n = 0;
        s.each(|p, _, _, _| {
            assert!((p[0] - 1.0).abs() < 1e-6);
            n += 1;
        });
        assert_eq!(n, 1);
        assert!(Splats::new(b"RGPX".to_vec()).is_none());
    }

    #[test]
    fn a_particle_that_comes_or_goes_shrinks_instead_of_popping() {
        // particle 0 is absent in frame 1 (goes), particle 1 absent in frame 0 (comes)
        let f = test_file(2, 2, 1.0, |k, i| if (i == 0 && k == 1) || (i == 1 && k == 0) { ([i16::MIN; 3], [0; 3], 0) } else { ([0, 0, 0], [0; 3], 0) });
        let mut s = Splats::new(f).expect("rgps");
        let r_at = |s: &Splats, want: usize| {
            let mut r = None;
            let mut n = 0;
            s.each(|_, rr, _, _| {
                if n == want { r = Some(rr); }
                n += 1;
            });
            r
        };
        s.time = 0.0;
        assert!((r_at(&s, 0).unwrap() - 0.05).abs() < 1e-9);
        s.time = 0.25;
        assert!((r_at(&s, 0).unwrap() - 0.025).abs() < 1e-9, "half way to gone: half size");
        s.time = 0.75;
        assert!((r_at(&s, 0).unwrap() - 0.025).abs() < 1e-9, "half way from coming: half size");
        s.time = 0.999;
        assert!((r_at(&s, 0).unwrap() - 0.05).abs() < 1e-3);
    }
}
