// SPDX-License-Identifier: AGPL-3.0-or-later
//! Easing functions, read from the text a game writes, as in CSS:
//!
//! - CSS Easing Functions Level 2: `linear`, `ease`, `ease-in`, `ease-out`,
//!   `ease-in-out`, `cubic-bezier(x1, y1, x2, y2)`, `steps(n, jump-start |
//!   jump-end | jump-none | jump-both | start | end)`, `step-start`,
//!   `step-end` and `linear(0, 0.25 75%, 1)`. The cubic Bézier is solved as
//!   WebKit's UnitBezier does it (BSD licence, credited in CREDITS.md):
//!   Newton's method, then bisection.
//! - The named curves of Robert Penner's easing equations (BSD) as GSAP
//!   names them: `power0`…`power4` (`quad`, `cubic`, `quart`, `quint`,
//!   `strong`), `sine`, `expo`, `circ`, `back(overshoot)`,
//!   `elastic(amplitude, period)` and `bounce`, each with `.in`, `.out`
//!   (the default) or `.inOut`: `"power2.inOut"`, `"back.out(2)"`.
//!
//! The same text gives the same curve on every target, so a motion looks the
//! same on the phone and on the web.

use ranger::prelude::*;

pub const LINEAR: i64 = 0;
pub const BEZIER: i64 = 1;
pub const STEPS: i64 = 2;
pub const POINTS: i64 = 3;
pub const POWER: i64 = 4;
pub const SINE: i64 = 5;
pub const EXPO: i64 = 6;
pub const CIRC: i64 = 7;
pub const BACK: i64 = 8;
pub const ELASTIC: i64 = 9;
pub const BOUNCE: i64 = 10;

/// direction of a named curve
pub const IN: i64 = 0;
pub const OUT: i64 = 1;
pub const IN_OUT: i64 = 2;

#[derive(Clone)]
pub struct Easing {
    pub kind: i64,
    pub dir: i64,
    /// the curve's numbers: the Bézier's x1 y1 x2 y2, power's exponent,
    /// back's overshoot, elastic's amplitude and period
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    /// steps: how many, and where they jump (0 end, 1 start, 2 none, 3 both)
    pub n: i64,
    pub jump: i64,
    /// linear(): the points' inputs and outputs
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
}

fn base(kind: i64) -> Easing {
    Easing { kind: kind, dir: OUT, a: 0.0, b: 0.0, c: 0.0, d: 0.0, n: 1, jump: 0, xs: Vec::new(), ys: Vec::new() }
}

pub fn linear() -> Easing {
    base(LINEAR)
}

pub fn bezier(x1: f64, y1: f64, x2: f64, y2: f64) -> Easing {
    let mut e = base(BEZIER);
    e.a = x1.max(0.0).min(1.0);
    e.b = y1;
    e.c = x2.max(0.0).min(1.0);
    e.d = y2;
    e
}

/// The numbers inside the parentheses of `name(1, 2 50%)`, each argument's
/// words apart: "2 50%" gives [2, 0.5] (a percentage as a share).
fn args(text: &str) -> Vec<Vec<f64>> {
    let mut out: Vec<Vec<f64>> = Vec::new();
    let mut open = false;
    let mut cur: Vec<f64> = Vec::new();
    let mut word = String::new();
    for ch in text.chars() {
        if !open {
            if ch == '(' {
                open = true;
            }
            continue;
        }
        if ch == ',' || ch == ')' || ch == ' ' {
            if !word.is_empty() {
                cur.push(number(&word));
                word = String::new();
            }
            if ch == ',' || ch == ')' {
                out.push(cur.clone());
                cur = Vec::new();
            }
            if ch == ')' {
                break;
            }
            continue;
        }
        word.push(ch);
    }
    out
}

/// "0.25", "75%" (0.75), "-1"; 0 for anything else.
pub fn number(w: &str) -> f64 {
    let mut t = w.trim().to_string();
    let mut pct = false;
    if t.ends_with('%') {
        pct = true;
        let mut s = String::new();
        let cs: Vec<char> = t.chars().collect();
        let mut i = 0;
        while i + 1 < cs.len() {
            s.push(cs[i]);
            i = i + 1;
        }
        t = s;
    }
    let v = match t.parse::<f64>() {
        Ok(x) => x,
        Err(_) => 0.0,
    };
    if pct {
        v / 100.0
    } else {
        v
    }
}

/// The word before any "(" (lower case, no spaces).
fn head(text: &str) -> string {
    let mut s = String::new();
    for ch in text.chars() {
        if ch == '(' {
            break;
        }
        if ch != ' ' {
            s.push(ch);
        }
    }
    to_lowercase(&s)
}

/// Reads an easing; an unknown text is `linear`.
pub fn parse(text: &str) -> Easing {
    let h = head(text);
    if h == "" || h == "linear" && !text.contains("(") || h == "none" || h == "power0" {
        return linear();
    }
    if h == "ease" {
        return bezier(0.25, 0.1, 0.25, 1.0);
    }
    if h == "ease-in" {
        return bezier(0.42, 0.0, 1.0, 1.0);
    }
    if h == "ease-out" {
        return bezier(0.0, 0.0, 0.58, 1.0);
    }
    if h == "ease-in-out" {
        return bezier(0.42, 0.0, 0.58, 1.0);
    }
    if h == "cubic-bezier" {
        let a = args(text);
        if a.len() == 4 && a[0].len() == 1 && a[1].len() == 1 && a[2].len() == 1 && a[3].len() == 1 {
            return bezier(a[0][0], a[1][0], a[2][0], a[3][0]);
        }
        return linear();
    }
    if h == "step-start" {
        let mut e = base(STEPS);
        e.n = 1;
        e.jump = 1;
        return e;
    }
    if h == "step-end" {
        let mut e = base(STEPS);
        e.n = 1;
        e.jump = 0;
        return e;
    }
    if h == "steps" {
        let mut e = base(STEPS);
        let a = args(text);
        if a.len() > 0 && a[0].len() > 0 {
            e.n = a[0][0].floor() as i64;
        }
        if e.n < 1 {
            e.n = 1;
        }
        // the position is a word, not a number: read it from the text
        let low = to_lowercase(text);
        if low.contains("jump-start") || low.contains(",start") || low.contains(", start") {
            e.jump = 1;
        } else if low.contains("jump-none") {
            e.jump = 2;
            if e.n < 2 {
                e.n = 2;
            }
        } else if low.contains("jump-both") {
            e.jump = 3;
        }
        return e;
    }
    if h == "linear" {
        return points(&args(text));
    }
    // GSAP's names: "power2.inOut", "back.out(1.7)", "sine.in"
    let mut name = String::new();
    let mut dir = String::new();
    let mut dot = false;
    for ch in h.chars() {
        if ch == '.' {
            dot = true;
            continue;
        }
        if dot {
            dir.push(ch);
        } else {
            name.push(ch);
        }
    }
    let mut e = base(LINEAR);
    e.dir = if dir == "in" { IN } else if dir == "inout" { IN_OUT } else { OUT };
    let a = args(text);
    let p0 = if a.len() > 0 && a[0].len() > 0 { a[0][0] } else { -1.0 };
    let p1 = if a.len() > 1 && a[1].len() > 0 { a[1][0] } else { -1.0 };
    if name == "power1" || name == "quad" || name == "out" || name == "inout" {
        // ("out" and "inOut" are rg.ease's old names)
        e.kind = POWER;
        e.a = 2.0;
        if name == "inout" {
            e.dir = IN_OUT;
        }
    } else if name == "power2" || name == "cubic" {
        e.kind = POWER;
        e.a = 3.0;
    } else if name == "power3" || name == "quart" {
        e.kind = POWER;
        e.a = 4.0;
    } else if name == "power4" || name == "quint" || name == "strong" {
        e.kind = POWER;
        e.a = 5.0;
    } else if name == "sine" {
        e.kind = SINE;
    } else if name == "expo" {
        e.kind = EXPO;
    } else if name == "circ" {
        e.kind = CIRC;
    } else if name == "back" {
        e.kind = BACK;
        e.a = if p0 >= 0.0 { p0 } else { 1.70158 };
    } else if name == "elastic" {
        e.kind = ELASTIC;
        e.a = if p0 >= 1.0 { p0 } else { 1.0 };
        e.b = if p1 > 0.0 { p1 } else { 0.3 };
    } else if name == "bounce" {
        e.kind = BOUNCE;
    }
    e
}

/// CSS linear(): each argument an output and 0–2 input percentages.
fn points(a: &Vec<Vec<f64>>) -> Easing {
    let mut e = base(POINTS);
    let mut xs: Vec<f64> = Vec::new();
    let mut ys: Vec<f64> = Vec::new();
    let mut known: Vec<bool> = Vec::new();
    for p in a.iter() {
        if p.len() == 0 {
            continue;
        }
        if p.len() == 1 {
            ys.push(p[0]);
            xs.push(0.0);
            known.push(false);
        } else {
            ys.push(p[0]);
            xs.push(p[1]);
            known.push(true);
            if p.len() > 2 {
                ys.push(p[0]);
                xs.push(p[2]);
                known.push(true);
            }
        }
    }
    let n = ys.len();
    if n < 2 {
        return linear();
    }
    if !known[0] {
        xs[0] = 0.0;
        known[0] = true;
    }
    if !known[n - 1] {
        xs[n - 1] = 1.0;
        known[n - 1] = true;
    }
    // an input below an earlier one is raised to it
    let mut hi = xs[0];
    let mut i = 1;
    while i < n {
        if known[i] {
            if xs[i] < hi {
                xs[i] = hi;
            }
            hi = xs[i];
        }
        i = i + 1;
    }
    // runs of missing inputs spread evenly between their known ends
    i = 1;
    while i < n {
        if !known[i] {
            let mut j = i;
            while !known[j] {
                j = j + 1;
            }
            let x0 = xs[i - 1];
            let x1 = xs[j];
            let steps = (j - i + 1) as f64;
            let mut k = i;
            while k < j {
                xs[k] = x0 + (x1 - x0) * ((k - i + 1) as f64) / steps;
                known[k] = true;
                k = k + 1;
            }
            i = j;
        }
        i = i + 1;
    }
    e.xs = xs;
    e.ys = ys;
    e
}

fn bounce_out(t: f64) -> f64 {
    let n = 7.5625;
    let d = 2.75;
    if t < 1.0 / d {
        n * t * t
    } else if t < 2.0 / d {
        let u = t - 1.5 / d;
        n * u * u + 0.75
    } else if t < 2.5 / d {
        let u = t - 2.25 / d;
        n * u * u + 0.9375
    } else {
        let u = t - 2.625 / d;
        n * u * u + 0.984375
    }
}

impl Easing {
    /// The named curve's "in" shape.
    fn ease_in(&self, t: f64) -> f64 {
        let pi = 3.141592653589793;
        if self.kind == POWER {
            return t.powf(self.a);
        }
        if self.kind == SINE {
            return 1.0 - (t * pi / 2.0).cos();
        }
        if self.kind == EXPO {
            if t <= 0.0 {
                return 0.0;
            }
            return (2.0 as f64).powf(10.0 * (t - 1.0));
        }
        if self.kind == CIRC {
            let u = 1.0 - t * t;
            return 1.0 - (if u > 0.0 { u } else { 0.0 }).sqrt();
        }
        if self.kind == BACK {
            let c1 = self.a;
            return (c1 + 1.0) * t * t * t - c1 * t * t;
        }
        if self.kind == ELASTIC {
            if t <= 0.0 || t >= 1.0 {
                return t;
            }
            let amp = self.a;
            let per = self.b;
            let s = per / (2.0 * pi) * (1.0 / amp).asin();
            return 0.0 - amp * (2.0 as f64).powf(10.0 * (t - 1.0)) * ((t - 1.0 - s) * 2.0 * pi / per).sin();
        }
        if self.kind == BOUNCE {
            return 1.0 - bounce_out(1.0 - t);
        }
        t
    }

    fn steps(&self, t: f64) -> f64 {
        let n = self.n as f64;
        let mut cur = (t * n).floor();
        if self.jump == 1 || self.jump == 3 {
            cur = cur + 1.0;
        }
        if t >= 0.0 && cur < 0.0 {
            cur = 0.0;
        }
        let jumps = if self.jump == 2 { n - 1.0 } else if self.jump == 3 { n + 1.0 } else { n };
        if t <= 1.0 && cur > jumps {
            cur = jumps;
        }
        cur / jumps
    }

    fn points_at(&self, t: f64) -> f64 {
        let n = self.xs.len();
        // the segment that holds t; past either end the end segment goes on
        let mut i = 0;
        while i + 2 < n && t >= self.xs[i + 1] {
            i = i + 1;
        }
        let x0 = self.xs[i];
        let x1 = self.xs[i + 1];
        let y0 = self.ys[i];
        let y1 = self.ys[i + 1];
        if x1 <= x0 {
            return if t < x0 { y0 } else { y1 };
        }
        y0 + (y1 - y0) * (t - x0) / (x1 - x0)
    }

    fn bezier_at(&self, x: f64) -> f64 {
        let cx = 3.0 * self.a;
        let bx = 3.0 * (self.c - self.a) - cx;
        let ax = 1.0 - cx - bx;
        let cy = 3.0 * self.b;
        let by = 3.0 * (self.d - self.b) - cy;
        let ay = 1.0 - cy - by;
        // solve x(t) = x: Newton's method first, bisection when it fails
        let mut t = x;
        let mut found = false;
        let mut i = 0;
        while i < 8 {
            let xe = ((ax * t + bx) * t + cx) * t - x;
            if xe.abs() < 1.0e-7 {
                found = true;
                break;
            }
            let dx = (3.0 * ax * t + 2.0 * bx) * t + cx;
            if dx.abs() < 1.0e-6 {
                break;
            }
            t = t - xe / dx;
            i = i + 1;
        }
        if !found {
            let mut lo = 0.0;
            let mut hi = 1.0;
            t = x;
            let mut k = 0;
            while k < 60 {
                let xv = ((ax * t + bx) * t + cx) * t;
                if (xv - x).abs() < 1.0e-7 {
                    break;
                }
                if x > xv {
                    lo = t;
                } else {
                    hi = t;
                }
                t = (lo + hi) * 0.5;
                k = k + 1;
            }
        }
        ((ay * t + by) * t + cy) * t
    }

    /// The curve at progress `t` (usually 0..1; outside it the CSS rules).
    pub fn at(&self, t: f64) -> f64 {
        if self.kind == LINEAR {
            return t;
        }
        if self.kind == BEZIER {
            if t <= 0.0 {
                return if self.a > 0.0 { t * self.b / self.a } else { 0.0 };
            }
            if t >= 1.0 {
                return if self.c < 1.0 { 1.0 + (t - 1.0) * (self.d - 1.0) / (self.c - 1.0) } else { 1.0 };
            }
            return self.bezier_at(t);
        }
        if self.kind == STEPS {
            return self.steps(t);
        }
        if self.kind == POINTS {
            return self.points_at(t);
        }
        let u = if t < 0.0 { 0.0 } else if t > 1.0 { 1.0 } else { t };
        if self.dir == IN {
            return self.ease_in(u);
        }
        if self.dir == OUT {
            return 1.0 - self.ease_in(1.0 - u);
        }
        if u < 0.5 {
            self.ease_in(u * 2.0) * 0.5
        } else {
            1.0 - self.ease_in((1.0 - u) * 2.0) * 0.5
        }
    }
}
