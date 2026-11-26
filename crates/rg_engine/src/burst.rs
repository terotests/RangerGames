// SPDX-License-Identifier: AGPL-3.0-or-later
//! "burst" particles (rg.three add { shape: "burst" }): a cloud of up to
//! 20 000 sparks flung out from a point, falling under a point mass and/or a
//! uniform pull, slowed by drag, each living its own life and coloured from a
//! palette over it (white-hot → orange → dark red → grey). The game sets the
//! time since the burst (`set { id, time }`), so warp and scrubbing back work:
//! going back starts the run again from the same seed.
//!
//! The particles are simulated here (steps of at most `life max / 400`), and
//! drawn by scene3d.rs as tiny squares facing the eye, or with `streak` as
//! thin triangles along their motion (the head bright, the tail fading where
//! the host blends per corner): on the painter path one path a colour, on
//! the GL path see-through (added) triangles.
//!
//! Ejecta that fly far get smaller (`far`: the distance from the start at
//! which a spark is half its size), and a spark can break up (`split`: into
//! n pieces at a random point of `splitAt` of its life, flying apart at
//! `splitSpeed`, each smaller and dimmer).

use crate::scene3d::color;
use rg_core::json::Json;

type V3 = [f64; 3];

pub const MAX: usize = 20_000;

pub struct Burst {
    count: usize,
    speed: (f64, f64),
    /// the cone's axis (zero: every way), half angle in radians (π: a sphere)
    dir: V3,
    spread: f64,
    /// a velocity every particle has as well (the impactor's own)
    v0: V3,
    /// a point mass: (centre in the object's frame, GM, radius: particles
    /// that fall inside are gone)
    mass: Option<(V3, f64, f64)>,
    g: V3,
    drag: f64,
    life: (f64, f64),
    size: (f64, f64),
    /// the streak's length: where the spark was this long ago (0: squares)
    pub streak: f64,
    /// the distance from the start at which a spark is half its size (0: no shrinking)
    far: f64,
    /// pieces a spark breaks into, when (a share of its life), how fast they part
    split: usize,
    split_at: (f64, f64),
    split_speed: f64,
    palette: Vec<V3>,
    seed: u32,
    /// how bright the colours are (1: as given)
    pub bright: f64,
    /// look "glow": soft sprites on hosts that draw GPU splats (draw.rs `splats`, look 1),
    /// through a sprite() hook; else the squares and streaks
    pub glow: bool,
    /// material.shader: a game's sprite shader (rg.shader kind "sprite"); material.u as "a=1;b=2"
    pub shader: String,
    pub uniforms: String,
    // the run: positions and velocities in the object's frame at sim_t
    sim_t: f64,
    pos: Vec<V3>,
    vel: Vec<V3>,
    lives: Vec<f64>,
    dead: Vec<bool>,
    /// the time the game asked for
    pub time: f64,
}

fn num2(v: &Json, d: (f64, f64)) -> (f64, f64) {
    match v {
        Json::Arr(a) if a.len() >= 2 => (a[0].as_num(d.0), a[1].as_num(d.1)),
        Json::Num(n) => (*n, *n),
        _ => d,
    }
}

fn v3(v: &Json, d: V3) -> V3 {
    match v {
        Json::Arr(a) if a.len() >= 3 => [a[0].as_num(d[0]), a[1].as_num(d[1]), a[2].as_num(d[2])],
        _ => d,
    }
}

/// 32-bit hash → 0..1 (the same on every host)
fn rnd(i: u32, k: u32, seed: u32) -> f64 {
    let mut h = i.wrapping_mul(0x8da6_b343) ^ k.wrapping_mul(0xd816_3841) ^ seed.wrapping_mul(0xcb1a_b31f);
    h ^= h >> 16;
    h = h.wrapping_mul(0x7feb_352d);
    h ^= h >> 15;
    h = h.wrapping_mul(0x846c_a68b);
    h ^= h >> 16;
    (h >> 8) as f64 / 16_777_216.0
}

impl Burst {
    /// From the add command's options (see scene3d.rs's header).
    pub fn new(a: &Json) -> Burst {
        let palette: Vec<V3> = match a.get("palette") {
            Json::Arr(v) if !v.is_empty() => v.iter().map(|c| color(c, [1.0; 3])).collect(),
            _ => vec![[1.0, 1.0, 0.95], [1.0, 0.7, 0.25], [0.6, 0.12, 0.05], [0.25, 0.22, 0.2]],
        };
        let gr = a.get("gravity");
        let mass = if gr.is_null() {
            None
        } else {
            Some(([gr.get("x").as_num(0.0), gr.get("y").as_num(0.0), gr.get("z").as_num(0.0)], gr.get("gm").as_num(0.0), gr.get("r").as_num(0.0)))
        };
        let d = v3(&a.get("dir"), [0.0; 3]);
        let dl = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        let life = num2(&a.get("life"), (1.0, 2.0));
        let mut b = Burst {
            count: (a.get("count").as_num(2000.0).max(0.0) as usize).min(MAX),
            speed: num2(&a.get("speed"), (0.5, 1.0)),
            dir: if dl > 1e-9 { [d[0] / dl, d[1] / dl, d[2] / dl] } else { [0.0; 3] },
            spread: a.get("spread").as_num(std::f64::consts::PI).clamp(0.0, std::f64::consts::PI),
            v0: v3(&a.get("v"), [0.0; 3]),
            mass,
            g: v3(&a.get("g"), [0.0; 3]),
            drag: a.get("drag").as_num(0.0).max(0.0),
            life: (life.0.max(1e-3), life.1.max(life.0.max(1e-3))),
            size: num2(&a.get("size"), (0.02, 0.01)),
            streak: a.get("streak").as_num(0.0).max(0.0),
            far: a.get("far").as_num(0.0).max(0.0),
            split: (a.get("split").as_num(0.0).max(0.0) as usize).min(8),
            split_at: {
                let s = num2(&a.get("splitAt"), (0.3, 0.6));
                (s.0.clamp(0.0, 1.0), s.1.clamp(s.0.clamp(0.0, 1.0), 1.0))
            },
            split_speed: a.get("splitSpeed").as_num(0.0),
            palette,
            seed: a.get("seed").as_num(1.0) as u32,
            bright: a.get("bright").as_num(1.0).max(0.0),
            glow: false,
            shader: String::new(),
            uniforms: String::new(),
            sim_t: 0.0,
            pos: Vec::new(),
            vel: Vec::new(),
            lives: Vec::new(),
            dead: Vec::new(),
            time: a.get("time").as_num(0.0),
        };
        b.restart();
        b.set_look(a);
        b
    }

    /// look and material (add and set).
    pub fn set_look(&mut self, a: &Json) {
        if let Json::Str(l) = a.get("look") {
            self.glow = l == "glow";
        }
        let m = a.get("material");
        if let Json::Obj(_) = m {
            if let Json::Str(sh) = m.get("shader") {
                self.shader = sh.clone();
            }
            if let Json::Obj(u) = m.get("u") {
                self.uniforms = crate::scene3d::uniforms_text(&u);
            }
        }
    }

    /// The seconds since it went off, as far as the particles are run.
    pub fn sim_time(&self) -> f64 {
        self.sim_t
    }

    /// The colour over a life without `bright` (the glow's palette: temperature = the share of
    /// its life), n steps, the last fifth fading out.
    pub fn life_palette(&self, n: usize) -> Vec<V3> {
        (0..n)
            .map(|i| {
                let u = i as f64 / (n - 1).max(1) as f64;
                let c = self.colour(u);
                let fade = ((1.0 - u) / 0.2).min(1.0);
                [c[0] * fade, c[1] * fade, c[2] * fade]
            })
            .collect()
    }

    fn colour(&self, u: f64) -> V3 {
        let n = self.palette.len();
        let x = u * (n - 1) as f64;
        let k = (x.floor() as usize).min(n.saturating_sub(2));
        let fr = if n > 1 { x - k as f64 } else { 0.0 };
        let a = self.palette[k];
        let b = self.palette[(k + 1).min(n - 1)];
        [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr]
    }

    fn restart(&mut self) {
        let n = self.count;
        self.pos = vec![[0.0; 3]; n];
        self.vel = Vec::with_capacity(n);
        self.lives = Vec::with_capacity(n);
        self.dead = vec![false; n];
        self.sim_t = 0.0;
        // two axes across the cone's axis
        let a = if self.dir == [0.0; 3] { [0.0, 1.0, 0.0] } else { self.dir };
        let t = if a[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
        let e1 = norm(cross(a, t));
        let e2 = cross(a, e1);
        let cmin = if self.dir == [0.0; 3] { -1.0 } else { self.spread.cos() };
        for i in 0..n {
            let i32_ = i as u32;
            let c = 1.0 - (1.0 - cmin) * rnd(i32_, 1, self.seed);
            let s = (1.0 - c * c).max(0.0).sqrt();
            let ph = std::f64::consts::TAU * rnd(i32_, 2, self.seed);
            let (sp, cp) = ph.sin_cos();
            let d = [a[0] * c + (e1[0] * cp + e2[0] * sp) * s, a[1] * c + (e1[1] * cp + e2[1] * sp) * s, a[2] * c + (e1[2] * cp + e2[2] * sp) * s];
            let v = self.speed.0 + (self.speed.1 - self.speed.0) * rnd(i32_, 3, self.seed);
            self.vel.push([d[0] * v + self.v0[0], d[1] * v + self.v0[1], d[2] * v + self.v0[2]]);
            self.lives.push(self.life.0 + (self.life.1 - self.life.0) * rnd(i32_, 4, self.seed));
        }
    }

    /// Runs the particles to `self.time` (from the start again when it went back).
    pub fn advance(&mut self) {
        let t = self.time.max(0.0);
        if t < self.sim_t {
            self.restart();
        }
        let span = t - self.sim_t;
        if span <= 0.0 {
            return;
        }
        // steps of at most life/400, but no more than 600 a frame (a jump
        // forward is run in coarser steps)
        let steps = ((span / (self.life.1 / 400.0)).ceil() as usize).clamp(1, 600);
        let dt = span / steps as f64;
        let damp = (-self.drag * dt).exp();
        for _ in 0..steps {
            let now = self.sim_t;
            for i in 0..self.count {
                if self.dead[i] || now > self.lives[i] {
                    continue;
                }
                let p = self.pos[i];
                let mut acc = self.g;
                if let Some((c, gm, r)) = self.mass {
                    let d = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
                    let r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
                    if r > 0.0 && r2 < r * r && now > 0.0 {
                        self.dead[i] = true;
                        continue;
                    }
                    let k = gm / (r2.max(1e-12) * r2.max(1e-12).sqrt());
                    acc = [acc[0] + d[0] * k, acc[1] + d[1] * k, acc[2] + d[2] * k];
                }
                let v = self.vel[i];
                let v = [(v[0] + acc[0] * dt) * damp, (v[1] + acc[1] * dt) * damp, (v[2] + acc[2] * dt) * damp];
                self.vel[i] = v;
                self.pos[i] = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
            }
            self.sim_t += dt;
        }
        self.sim_t = t;
    }

    /// The live particles: (place in the object's frame, size, colour).
    /// The sparks to draw now: (place, velocity, size, colour), a broken-up
    /// spark as its pieces.
    pub fn each(&self, mut f: impl FnMut(V3, V3, f64, V3)) {
        self.each_u(|p, v, size, c, _| f(p, v, size, c));
    }

    /// `each` with the share of its life (0..1) last.
    pub fn each_u(&self, mut f: impl FnMut(V3, V3, f64, V3, f64)) {
        let t = self.sim_t;
        let n = self.palette.len();
        for i in 0..self.count {
            if self.dead[i] || t > self.lives[i] {
                continue;
            }
            let u = (t / self.lives[i]).clamp(0.0, 1.0);
            let size = self.size.0 + (self.size.1 - self.size.0) * u;
            let x = u * (n - 1) as f64;
            let k = (x.floor() as usize).min(n.saturating_sub(2));
            let fr = if n > 1 { x - k as f64 } else { 0.0 };
            let a = self.palette[k];
            let b = self.palette[(k + 1).min(n - 1)];
            // fading out over the last fifth of its life
            let fade = ((1.0 - u) / 0.2).min(1.0) * self.bright;
            let mut c = [(a[0] + (b[0] - a[0]) * fr) * fade, (a[1] + (b[1] - a[1]) * fr) * fade, (a[2] + (b[2] - a[2]) * fr) * fade];
            let p = self.pos[i];
            let mut size = size;
            if self.far > 0.0 {
                let d = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
                size *= self.far / (self.far + d);
            }
            let v = self.vel[i];
            let i32_ = i as u32;
            let at = self.split_at.0 + (self.split_at.1 - self.split_at.0) * rnd(i32_, 5, self.seed);
            let ts = at * self.lives[i];
            if self.split < 2 || t <= ts {
                f(p, v, size, c, u);
                continue;
            }
            // broken up: n pieces flying apart from where the spark is, each
            // carrying a share of its light
            let n = self.split;
            let k = 1.0 / (n as f64).sqrt();
            c = [c[0] * k, c[1] * k, c[2] * k];
            let dt = t - ts;
            for j in 0..n {
                let jj = 16 + j as u32 * 3;
                let z = 2.0 * rnd(i32_, jj, self.seed) - 1.0;
                let s = (1.0 - z * z).max(0.0).sqrt();
                let ph = std::f64::consts::TAU * rnd(i32_, jj + 1, self.seed);
                let sp = self.split_speed * (0.5 + rnd(i32_, jj + 2, self.seed));
                let d = [s * ph.cos() * sp, s * ph.sin() * sp, z * sp];
                f([p[0] + d[0] * dt, p[1] + d[1] * dt, p[2] + d[2] * dt], [v[0] + d[0], v[1] + d[1], v[2] + d[2]], size * k, c, u);
            }
        }
    }
}

fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn norm(a: V3) -> V3 {
    let l = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
    if l < 1e-12 { a } else { [a[0] / l, a[1] / l, a[2] / l] }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sparks_break_up_and_far_ones_are_smaller() {
        let a = rg_core::json::parse(r#"{ "count": 20, "speed": [1, 1], "life": [10, 10], "split": 3, "splitAt": [0.2, 0.2],
            "splitSpeed": 0.5, "far": 1, "size": [0.1, 0.1] }"#);
        let mut b = Burst::new(&a);
        b.time = 1.0;
        b.advance();
        let mut n = 0;
        b.each(|_, _, s, _| {
            // 1 unit out with far 1: half the size
            assert!((s - 0.05).abs() < 1e-6, "{}", s);
            n += 1;
        });
        assert_eq!(n, 20);
        b.time = 3.0;
        b.advance();
        let mut n = 0;
        b.each(|_, _, _, _| n += 1);
        assert_eq!(n, 60, "each in 3 pieces after a fifth of its life");
    }

    #[test]
    fn same_seed_same_run_and_going_back_starts_again() {
        let a = rg_core::json::parse(r#"{ "count": 50, "speed": [1, 2], "g": [0, -1, 0], "life": [5, 5], "seed": 7 }"#);
        let mut b = Burst::new(&a);
        b.time = 1.0;
        b.advance();
        let mut first = Vec::new();
        b.each(|p, _, _, _| first.push(p));
        b.time = 3.0;
        b.advance();
        b.time = 1.0;
        b.advance();
        let mut again = Vec::new();
        b.each(|p, _, _, _| again.push(p));
        assert_eq!(first.len(), 50);
        for (x, y) in first.iter().zip(again.iter()) {
            for k in 0..3 {
                assert!((x[k] - y[k]).abs() < 1e-9);
            }
        }
        // speeds 1..2 for 1 s, falling ½ g t²: within 2.5 of the start
        assert!(first.iter().all(|p| (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt() < 2.6));
    }

    #[test]
    fn a_cone_flings_one_way_and_life_ends_them() {
        let a = rg_core::json::parse(r#"{ "count": 200, "speed": 1, "dir": [0, 1, 0], "spread": 0.2, "life": [1, 2] }"#);
        let mut b = Burst::new(&a);
        b.time = 0.5;
        b.advance();
        let mut n = 0;
        b.each(|p, _, _, _| {
            assert!(p[1] > 0.45);
            n += 1;
        });
        assert_eq!(n, 200);
        b.time = 2.5;
        b.advance();
        let mut left = 0;
        b.each(|_, _, _, _| left += 1);
        assert_eq!(left, 0);
    }

    #[test]
    fn a_point_mass_pulls_back_and_its_ground_takes_them() {
        // flung up slower than escape from a planet of radius 1: they come back down
        let a = rg_core::json::parse(r#"{ "count": 100, "speed": [0.5, 0.6], "dir": [0, 1, 0], "spread": 0.1, "v": [0, 0, 0],
            "gravity": { "x": 0, "y": -1.01, "z": 0, "gm": 1, "r": 1 }, "life": [20, 20] }"#);
        let mut b = Burst::new(&a);
        b.time = 15.0;
        b.advance();
        let mut left = 0;
        b.each(|_, _, _, _| left += 1);
        assert_eq!(left, 0);
    }
}
