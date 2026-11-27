// SPDX-License-Identifier: AGPL-3.0-or-later
//! The one clock every game's frames, animations and timed sounds run on.
//!
//! A host gives each frame the display's vsync time (Android's Choreographer
//! frame time, the browser's requestAnimationFrame time) and, when it knows
//! it, the display's frame period. [`FrameClock`] turns those into the step
//! the frame shows: always a whole number of display frames, with the part
//! of a frame left over carried to the next step, so the steps follow the
//! pictures as the display shows them and the game's time never drifts from
//! the wall clock (music and speech play in real time). A pause longer than
//! [`MAX_STEP_MS`] is cut to it and the cut time counted in `lost`.
//!
//! A host that gives only the time since the last frame (an older host)
//! uses [`FrameClock::frame_dt`]: the same carry, the period estimated from
//! the steps themselves.
//!
//! [`Clock`] is a named time scale on top of it (a game's simulation time
//! at ×60, slow motion): its rate can glide to a new value in a set time,
//! on a linear or a logarithmic scale, and it can be paused.

use ranger::prelude::*;

/// The longest step a frame takes (ms); a longer pause is cut to it.
pub const MAX_STEP_MS: f64 = 100.0;

pub struct FrameClock {
    /// the display's frame (ms), given or estimated
    pub period: f64,
    /// whether the host gave the period (else it is estimated)
    pub period_given: bool,
    /// the time of the frame now being made, as the display will show it (ms
    /// from the clock's start): the sum of the steps
    pub now: f64,
    /// this frame's step (ms): a whole number of display frames
    pub dt: f64,
    /// display frames this step covers
    pub frames: i64,
    /// time cut from long pauses since the start (ms)
    pub lost: f64,
    /// the time cut from this frame's step (ms)
    pub lost_now: f64,
    /// frames made since the start
    pub count: i64,
    /// the part of a display frame not yet given to a step (ms, may be negative)
    carry: f64,
    /// the last vsync time the host gave (ms), < 0 before the first
    last_vsync: f64,
    /// the shortest recent gap between frames, for the estimate (ms)
    est_min: f64,
    /// frames since est_min was renewed
    est_age: i64,
    /// a running mean of the gaps close to est_min (ms)
    est_mean: f64,
}

impl FrameClock {
    pub fn new() -> FrameClock {
        FrameClock {
            period: 1000.0 / 60.0,
            period_given: false,
            now: 0.0,
            dt: 0.0,
            frames: 0,
            lost: 0.0,
            lost_now: 0.0,
            count: 0,
            carry: 0.0,
            last_vsync: -1.0,
            est_min: 1.0e9,
            est_age: 0,
            est_mean: 1000.0 / 60.0,
        }
    }

    /// Starts again from 0 (a new game), keeping the period.
    pub fn reset(&mut self) {
        self.now = 0.0;
        self.dt = 0.0;
        self.frames = 0;
        self.lost = 0.0;
        self.lost_now = 0.0;
        self.count = 0;
        self.carry = 0.0;
        self.last_vsync = -1.0;
    }

    /// The host's vsync time for this frame (ms, any origin) and the
    /// display's frame period (ms, 0 when not known). Returns the step (ms).
    pub fn frame_vsync(&mut self, vsync_ms: f64, period_ms: f64) -> f64 {
        if period_ms > 2.0 && period_ms < 100.0 {
            self.period = period_ms;
            self.period_given = true;
        }
        if self.last_vsync < 0.0 {
            self.last_vsync = vsync_ms;
            return self.step(self.period);
        }
        let gap = vsync_ms - self.last_vsync;
        self.last_vsync = vsync_ms;
        self.step(gap)
    }

    /// The time since the last frame (ms), from a host without vsync times.
    pub fn frame_dt(&mut self, dt_ms: f64) -> f64 {
        self.step(dt_ms)
    }

    fn estimate(&mut self, gap: f64) {
        if self.period_given || gap < 4.0 || gap > 70.0 {
            return;
        }
        self.est_age = self.est_age + 1;
        if gap < self.est_min * 0.9 || self.est_age > 240 {
            // a shorter gap than any seen lately (or a stale minimum): the
            // display is faster than thought, or changed
            self.est_min = gap;
            self.est_age = 0;
            self.est_mean = gap;
        } else if gap < self.est_min * 1.15 {
            if gap < self.est_min {
                self.est_min = gap;
            }
            self.est_mean = self.est_mean + (gap - self.est_mean) * 0.05;
        }
        self.period = self.est_mean;
    }

    fn step(&mut self, gap_in: f64) -> f64 {
        let mut gap = gap_in;
        if !(gap >= 0.0) {
            gap = 0.0;
        }
        self.estimate(gap);
        self.count = self.count + 1;
        self.lost_now = 0.0;
        let p = self.period;
        let mut have = gap + self.carry;
        if have > MAX_STEP_MS + p {
            // a long pause (a stall, the app in the background): cut, counted
            self.lost_now = have - MAX_STEP_MS;
            self.lost = self.lost + self.lost_now;
            have = MAX_STEP_MS;
        }
        let mut n = (have / p + 0.5).floor() as i64;
        if n < 1 && gap > 0.0 {
            // a picture came: it shows at least one display frame later
            n = 1;
        }
        if n < 0 {
            n = 0;
        }
        let dt = (n as f64) * p;
        self.carry = have - dt;
        // the carry stays within a frame either way, so one odd gap is not
        // paid back over many frames
        if self.carry > p {
            self.carry = p;
        }
        if self.carry < 0.0 - p {
            self.carry = 0.0 - p;
        }
        self.frames = n;
        self.dt = dt;
        self.now = self.now + dt;
        dt
    }
}

/// A named time scale: `time` moves by the frame's step × `rate`.
pub struct Clock {
    pub name: string,
    /// its time (ms)
    pub time: f64,
    /// its rate now
    pub rate: f64,
    pub paused: bool,
    /// the glide: from rate `from` to `to` over `glide` ms of real time, done `done` ms
    from: f64,
    to: f64,
    glide: f64,
    done: f64,
    /// the glide on a logarithmic scale (×1 → ×10 → ×100 evenly in time)
    log: bool,
}

impl Clock {
    pub fn new(name: &str, rate: f64) -> Clock {
        Clock { name: name.to_string(), time: 0.0, rate: rate, paused: false, from: rate, to: rate, glide: 0.0, done: 0.0, log: false }
    }

    /// The rate to reach in `glide` ms (0: at once), `log` on a logarithmic scale.
    pub fn set_rate(&mut self, rate: f64, glide: f64, log: bool) {
        if glide <= 0.0 {
            self.rate = rate;
            self.from = rate;
            self.to = rate;
            self.glide = 0.0;
            self.done = 0.0;
            return;
        }
        self.from = self.rate;
        self.to = rate;
        self.glide = glide;
        self.done = 0.0;
        // a log glide needs both ends on the same side of 0
        self.log = log && self.from * rate > 0.0;
    }

    /// The rate the glide is heading for.
    pub fn target_rate(&self) -> f64 {
        self.to
    }

    fn rate_at(&self, done: f64) -> f64 {
        if self.glide <= 0.0 || done >= self.glide {
            return self.to;
        }
        let k0 = done / self.glide;
        // smooth start and end (CSS ease-in-out's shape)
        let k = k0 * k0 * (3.0 - 2.0 * k0);
        if self.log {
            let s = if self.to < 0.0 { -1.0 } else { 1.0 };
            let a = (self.from * s).ln();
            let b = (self.to * s).ln();
            return s * (a + (b - a) * k).exp();
        }
        self.from + (self.to - self.from) * k
    }

    /// Moves by a real step of `dt` ms; returns how far its time moved (ms).
    pub fn advance(&mut self, dt: f64) -> f64 {
        if self.paused {
            return 0.0;
        }
        let mut moved = dt * self.rate;
        if self.glide > 0.0 && self.done < self.glide {
            // the rate's mean over the step (Simpson's rule), so a glide moves
            // the time the same at 30 or 90 frames a second
            let r0 = self.rate_at(self.done);
            let r1 = self.rate_at(self.done + dt * 0.5);
            let r2 = self.rate_at(self.done + dt);
            moved = dt * (r0 + 4.0 * r1 + r2) / 6.0;
            self.done = self.done + dt;
            self.rate = r2;
            if self.done >= self.glide {
                self.glide = 0.0;
                self.rate = self.to;
            }
        }
        self.time = self.time + moved;
        moved
    }
}
