// SPDX-License-Identifier: AGPL-3.0-or-later
//! Animations, run natively on the engine's one clock, the same for every
//! game and on every target.
//!
//! The model is the W3C Web Animations standard (Level 1): an [`Anim`] is a
//! keyframe effect with its timing (delay, endDelay, duration, iterations,
//! iterationStart, direction, fill, easing) played by an animation on a
//! timeline (here a [`Clock`]): play, pause, reverse, finish, cancel,
//! currentTime, playbackRate, the play states idle / running / paused /
//! finished, as the standard computes them. Keyframes have offsets (missing
//! ones spread evenly, as the standard spreads them), a per-keyframe easing,
//! and values that are numbers, lists of numbers, colours or any text with
//! numbers in it ("translate(10px, 20px) scale(1.5)"), interpolated number
//! by number when two values have the same shape and switched half-way
//! otherwise, as CSS does.
//!
//! A [`Seq`] is a timeline of entries placed as GSAP's timeline places them
//! ("<" with the previous one, ">" after it, "+=500" after the end, labels):
//! tweens, calls, sounds (speech, music, effects), fixed pauses and labels.
//! A sound or pause whose length is not known yet (a clip still loading)
//! holds the sequence at its start until it is known, or until its timeout,
//! and an entry can be cancelled, which pulls the entries after it forward:
//! the "fixed pauses that load or are cancelled" a story with speech needs.
//! The sequence tells the game when each sound starts, with the delay from
//! this frame to its exact start and the offset into it, so the host can
//! start it on time; pausing, seeking or cancelling the sequence pauses or
//! stops its sounds.
//!
//! A [`Spring`] moves a value (or a list of them) towards a target as a
//! damped spring, solved exactly for each step (the same at 30 and 90 frames
//! a second). [`follow`] is the frame-rate-independent form of
//! `x += (target - x) * k`.
//!
//! All times are milliseconds, as in the standard.

use crate::clock::Clock;
use crate::easing::{self, Easing};
use crate::json::{self, member, Json, JsonMember};
use ranger::prelude::*;

/// "infinite"
pub const INF: f64 = 1.0e300;

pub const IDLE: i64 = 0;
pub const RUNNING: i64 = 1;
pub const PAUSED: i64 = 2;
pub const FINISHED: i64 = 3;

pub const FILL_NONE: i64 = 0;
pub const FILL_FORWARDS: i64 = 1;
pub const FILL_BACKWARDS: i64 = 2;
pub const FILL_BOTH: i64 = 3;

pub const DIR_NORMAL: i64 = 0;
pub const DIR_REVERSE: i64 = 1;
pub const DIR_ALTERNATE: i64 = 2;
pub const DIR_ALTERNATE_REVERSE: i64 = 3;

pub const TWEEN: i64 = 0;
pub const CALL: i64 = 1;
pub const SOUND: i64 = 2;
pub const GAP: i64 = 3;
pub const LABEL: i64 = 4;

/// `x += (target - x) * k` for a step of `dt` ms, independent of the frame
/// rate: the gap halves every `half_life` ms.
pub fn follow(x: f64, target: f64, half_life: f64, dt: f64) -> f64 {
    if half_life <= 0.0 {
        return target;
    }
    target + (x - target) * (2.0 as f64).powf(0.0 - dt / half_life)
}

// ---- values ----------------------------------------------------------------

pub const V_NUM: i64 = 0;
pub const V_LIST: i64 = 1;
pub const V_TEXT: i64 = 2;
pub const V_COLOR: i64 = 3;

/// A keyframe's value: a number, a list of numbers, a colour (r, g, b, a) or
/// a text with numbers in it (the text between them in `parts`).
#[derive(Clone)]
pub struct Value {
    pub kind: i64,
    pub nums: Vec<f64>,
    pub parts: Vec<string>,
}

fn is_digit(c: char) -> bool {
    c >= '0' && c <= '9'
}

fn hex_digit(c: char) -> i64 {
    if c >= '0' && c <= '9' {
        return (c as i64) - ('0' as i64);
    }
    if c >= 'a' && c <= 'f' {
        return (c as i64) - ('a' as i64) + 10;
    }
    if c >= 'A' && c <= 'F' {
        return (c as i64) - ('A' as i64) + 10;
    }
    -1
}

fn num_value(x: f64) -> Value {
    let mut nums: Vec<f64> = Vec::new();
    nums.push(x);
    Value { kind: V_NUM, nums: nums, parts: Vec::new() }
}

/// "#rgb", "#rgba", "#rrggbb", "#rrggbbaa": r, g, b (0..255) and a (0..1).
fn hex_color(cs: &Vec<char>) -> Vec<f64> {
    let mut d: Vec<i64> = Vec::new();
    let mut i = 1;
    while i < cs.len() {
        let h = hex_digit(cs[i]);
        if h < 0 {
            return Vec::new();
        }
        d.push(h);
        i = i + 1;
    }
    let mut out: Vec<f64> = Vec::new();
    if d.len() == 3 || d.len() == 4 {
        for x in d.iter() {
            out.push((*x * 17) as f64);
        }
    } else if d.len() == 6 || d.len() == 8 {
        let mut k = 0;
        while k < d.len() {
            out.push((d[k] * 16 + d[k + 1]) as f64);
            k = k + 2;
        }
    } else {
        return Vec::new();
    }
    if out.len() == 3 {
        out.push(1.0);
    } else {
        out[3] = out[3] / 255.0;
    }
    out
}

fn text_value(s: &str) -> Value {
    let cs: Vec<char> = s.trim().chars().collect();
    if cs.len() > 0 && cs[0] == '#' {
        let c = hex_color(&cs);
        if c.len() == 4 {
            return Value { kind: V_COLOR, nums: c, parts: Vec::new() };
        }
    }
    // the numbers and the text between them
    let mut nums: Vec<f64> = Vec::new();
    let mut parts: Vec<string> = Vec::new();
    let mut text = String::new();
    let mut i = 0;
    let n = cs.len();
    while i < n {
        let c = cs[i];
        let starts_num = is_digit(c)
            || (c == '.' && i + 1 < n && is_digit(cs[i + 1]))
            || (c == '-' && i + 1 < n && (is_digit(cs[i + 1]) || cs[i + 1] == '.') && (i == 0 || !(is_digit(cs[i - 1]) || cs[i - 1].is_alphabetic())));
        // a number inside a word ("h1", "rotate3d") stays text
        let in_word = i > 0 && (cs[i - 1].is_alphabetic() || cs[i - 1] == '_') && c != '-';
        if starts_num && !in_word {
            let mut w = String::new();
            w.push(c);
            i = i + 1;
            let mut e = false;
            while i < n {
                let d = cs[i];
                if is_digit(d) || d == '.' {
                    w.push(d);
                } else if (d == 'e' || d == 'E') && !e && i + 1 < n && (is_digit(cs[i + 1]) || cs[i + 1] == '-') {
                    e = true;
                    w.push(d);
                } else if d == '-' && e && (cs[i - 1] == 'e' || cs[i - 1] == 'E') {
                    w.push(d);
                } else {
                    break;
                }
                i = i + 1;
            }
            parts.push(text);
            text = String::new();
            nums.push(easing::number(&w));
        } else {
            text.push(c);
            i = i + 1;
        }
    }
    parts.push(text);
    // rgb(1, 2, 3) / rgba(1, 2, 3, 0.5) is a colour
    if (nums.len() == 3 || nums.len() == 4) && (parts[0] == "rgb(" || parts[0] == "rgba(") {
        let mut c = nums.clone();
        if c.len() == 3 {
            c.push(1.0);
        }
        return Value { kind: V_COLOR, nums: c, parts: Vec::new() };
    }
    Value { kind: V_TEXT, nums: nums, parts: parts }
}

pub fn value_of(j: &Json) -> Value {
    match j {
        Json::Num(x) => num_value(*x),
        Json::Bool(b) => num_value(if *b { 1.0 } else { 0.0 }),
        Json::Str(s) => text_value(s),
        Json::Arr(items) => {
            let mut nums: Vec<f64> = Vec::new();
            for it in items.iter() {
                nums.push(it.as_num(0.0));
            }
            Value { kind: V_LIST, nums: nums, parts: Vec::new() }
        }
        _ => num_value(0.0),
    }
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

pub fn value_json(v: &Value) -> Json {
    if v.kind == V_NUM {
        return Json::Num(if v.nums.len() > 0 { v.nums[0] } else { 0.0 });
    }
    if v.kind == V_LIST {
        let mut a: Vec<Json> = Vec::new();
        for x in v.nums.iter() {
            a.push(Json::Num(*x));
        }
        return Json::Arr(a);
    }
    if v.kind == V_COLOR {
        let r = v.nums[0].round().max(0.0).min(255.0);
        let g = v.nums[1].round().max(0.0).min(255.0);
        let b = v.nums[2].round().max(0.0).min(255.0);
        let a = round3(v.nums[3].max(0.0).min(1.0));
        if a >= 1.0 {
            return Json::Str(format!("rgb({}, {}, {})", r as i64, g as i64, b as i64));
        }
        return Json::Str(format!("rgba({}, {}, {}, {})", r as i64, g as i64, b as i64, json::num(a)));
    }
    let mut s = String::new();
    let mut i = 0;
    while i < v.parts.len() {
        s.push_str(&v.parts[i]);
        if i < v.nums.len() {
            s.push_str(&json::num(round3(v.nums[i])));
        }
        i = i + 1;
    }
    Json::Str(s)
}

fn same_shape(a: &Value, b: &Value) -> bool {
    if a.kind != b.kind || a.nums.len() != b.nums.len() {
        return false;
    }
    if a.kind == V_TEXT {
        if a.parts.len() != b.parts.len() {
            return false;
        }
        let mut i = 0;
        while i < a.parts.len() {
            if a.parts[i] != b.parts[i] {
                return false;
            }
            i = i + 1;
        }
    }
    true
}

/// a → b at `k` (0..1, may overshoot); different shapes switch at 0.5.
pub fn mix(a: &Value, b: &Value, k: f64) -> Value {
    if !same_shape(a, b) {
        return if k < 0.5 { a.clone() } else { b.clone() };
    }
    let mut out = a.clone();
    let mut i = 0;
    while i < a.nums.len() {
        out.nums[i] = a.nums[i] + (b.nums[i] - a.nums[i]) * k;
        i = i + 1;
    }
    out
}

// ---- timing (Web Animations §4.8–4.11) --------------------------------------

#[derive(Clone)]
pub struct Timing {
    pub delay: f64,
    pub end_delay: f64,
    pub duration: f64,
    pub iterations: f64,
    pub iteration_start: f64,
    pub direction: i64,
    pub fill: i64,
    pub easing: Easing,
}

pub fn timing() -> Timing {
    Timing { delay: 0.0, end_delay: 0.0, duration: 0.0, iterations: 1.0, iteration_start: 0.0, direction: DIR_NORMAL, fill: FILL_NONE, easing: easing::linear() }
}

/// Reads { delay, endDelay, duration, iterations ("Infinity" or a big
/// number), iterationStart, direction, fill, easing }; a plain number is the
/// duration, as in Element.animate().
pub fn timing_of(j: &Json, fill_default: i64) -> Timing {
    let mut t = timing();
    t.fill = fill_default;
    match j {
        Json::Num(x) => {
            t.duration = x.max(0.0);
            return t;
        }
        _ => {}
    }
    t.delay = j.get("delay").as_num(0.0);
    t.end_delay = j.get("endDelay").as_num(0.0);
    t.duration = j.get("duration").as_num(0.0).max(0.0);
    let it = j.get("iterations");
    t.iterations = match it {
        Json::Str(s) => {
            if s == "Infinity" || s == "infinite" {
                INF
            } else {
                easing::number(&s).max(0.0)
            }
        }
        Json::Num(x) => {
            if x >= 1.0e15 {
                INF
            } else {
                x.max(0.0)
            }
        }
        _ => 1.0,
    };
    t.iteration_start = j.get("iterationStart").as_num(0.0).max(0.0);
    let d = j.get("direction").as_str();
    t.direction = if d == "reverse" {
        DIR_REVERSE
    } else if d == "alternate" {
        DIR_ALTERNATE
    } else if d == "alternate-reverse" {
        DIR_ALTERNATE_REVERSE
    } else {
        DIR_NORMAL
    };
    let f = j.get("fill").as_str();
    if f == "none" {
        t.fill = FILL_NONE;
    } else if f == "forwards" {
        t.fill = FILL_FORWARDS;
    } else if f == "backwards" {
        t.fill = FILL_BACKWARDS;
    } else if f == "both" {
        t.fill = FILL_BOTH;
    }
    let e = j.get("easing").as_str();
    if e != "" {
        t.easing = easing::parse(&e);
    }
    t
}

impl Timing {
    pub fn active_duration(&self) -> f64 {
        if self.duration <= 0.0 || self.iterations <= 0.0 {
            return 0.0;
        }
        if self.iterations >= INF {
            return INF;
        }
        self.duration * self.iterations
    }

    pub fn end_time(&self) -> f64 {
        let a = self.active_duration();
        if a >= INF {
            return INF;
        }
        (self.delay + a + self.end_delay).max(0.0)
    }
}

/// What the timing gives at a local time.
pub struct Computed {
    /// the effect shows (in its active phase, or filling)
    pub on: bool,
    /// the eased progress (may leave 0..1 with an overshooting easing)
    pub progress: f64,
    pub iteration: f64,
    /// 0 before, 1 active, 2 after
    pub phase: i64,
}

/// The standard's calculation for local time `t` played at a rate whose
/// sign is `backwards` (true for a negative playback rate).
pub fn compute(tm: &Timing, t: f64, backwards: bool) -> Computed {
    let active = tm.active_duration();
    let end = tm.end_time();
    let before_end = tm.delay.min(end).max(0.0);
    let active_end = if active >= INF { INF } else { (tm.delay + active).min(end).max(0.0) };
    let phase = if t < before_end || (backwards && t == before_end) {
        0
    } else if t > active_end || (!backwards && t == active_end && active < INF) {
        2
    } else {
        1
    };
    let mut on = true;
    let mut at = 0.0;
    if phase == 0 {
        if tm.fill == FILL_BACKWARDS || tm.fill == FILL_BOTH {
            at = (t - tm.delay).max(0.0);
        } else {
            on = false;
        }
    } else if phase == 1 {
        at = t - tm.delay;
    } else {
        if tm.fill == FILL_FORWARDS || tm.fill == FILL_BOTH {
            at = (t - tm.delay).min(active).max(0.0);
        } else {
            on = false;
        }
    }
    if !on {
        return Computed { on: false, progress: 0.0, iteration: 0.0, phase: phase };
    }
    let overall = if tm.duration <= 0.0 {
        if phase == 0 {
            tm.iteration_start
        } else {
            tm.iteration_start + if tm.iterations >= INF { 1.0 } else { tm.iterations }
        }
    } else {
        at / tm.duration + tm.iteration_start
    };
    let mut simple = overall - overall.floor();
    if overall >= INF {
        simple = tm.iteration_start - tm.iteration_start.floor();
    }
    if simple == 0.0 && (phase == 1 || phase == 2) && at == active && tm.iterations != 0.0 && overall != 0.0 {
        simple = 1.0;
    }
    let iteration = if phase == 2 && tm.iterations >= INF {
        INF
    } else if simple == 1.0 {
        overall.floor() - 1.0
    } else {
        overall.floor()
    };
    let odd = (iteration - 2.0 * (iteration / 2.0).floor()) == 1.0;
    let forwards = if tm.direction == DIR_NORMAL {
        true
    } else if tm.direction == DIR_REVERSE {
        false
    } else if tm.direction == DIR_ALTERNATE {
        !odd
    } else {
        odd
    };
    let directed = if forwards { simple } else { 1.0 - simple };
    Computed { on: true, progress: tm.easing.at(directed), iteration: iteration, phase: phase }
}

// ---- keyframes ---------------------------------------------------------------

#[derive(Clone)]
pub struct Kf {
    pub offset: f64,
    pub has_offset: bool,
    pub value: Value,
    pub easing: Easing,
}

/// One animated property and its keyframes (offsets computed).
#[derive(Clone)]
pub struct Prop {
    pub name: string,
    pub kfs: Vec<Kf>,
    /// a "to" property: its first keyframe is filled in from what goes before
    pub to: bool,
}

/// The standard's computed offsets: the first 0, the last 1, the missing
/// ones spread evenly between their neighbours.
fn spread(kfs: &mut Vec<Kf>) {
    let n = kfs.len();
    if n == 0 {
        return;
    }
    if n == 1 {
        if !kfs[0].has_offset {
            kfs[0].offset = 1.0;
        }
        return;
    }
    if !kfs[0].has_offset {
        kfs[0].offset = 0.0;
    }
    if !kfs[n - 1].has_offset {
        kfs[n - 1].offset = 1.0;
    }
    let mut i = 1;
    while i < n - 1 {
        if !kfs[i].has_offset {
            let mut j = i;
            while j < n - 1 && !kfs[j].has_offset {
                j = j + 1;
            }
            let a = kfs[i - 1].offset;
            let b = kfs[j].offset;
            let steps = (j - i + 1) as f64;
            let mut k = i;
            while k < j {
                kfs[k].offset = a + (b - a) * ((k - i + 1) as f64) / steps;
                k = k + 1;
            }
            i = j;
        }
        i = i + 1;
    }
}

/// Reads [{ name, kfs: [{ o, v, e }], to, from }]: o the offset (null for
/// none), v the value, e the easing to the next keyframe. `from` is the
/// value the property has now, the start of a lone keyframe or a "to".
pub fn props_of(j: &Json) -> Vec<Prop> {
    let mut out: Vec<Prop> = Vec::new();
    for p in j.items().iter() {
        let mut kfs: Vec<Kf> = Vec::new();
        for k in p.get("kfs").items().iter() {
            let o = k.get("o");
            let has = match o {
                Json::Num(_) => true,
                _ => false,
            };
            let e = k.get("e").as_str();
            kfs.push(Kf { offset: o.as_num(0.0), has_offset: has, value: value_of(&k.get("v")), easing: easing::parse(&e) });
        }
        let to = p.get("to").as_bool();
        // a lone keyframe (or a "to"): the property's value now is the start
        if (kfs.len() == 1 || to) && p.has("from") {
            kfs.insert(0, Kf { offset: 0.0, has_offset: true, value: value_of(&p.get("from")), easing: easing::linear() });
        }
        if kfs.len() == 0 {
            continue;
        }
        spread(&mut kfs);
        out.push(Prop { name: p.get("name").as_str(), kfs: kfs, to: to });
    }
    out
}

/// The property's value at progress `p`.
pub fn sample(p: &Prop, at: f64) -> Value {
    let n = p.kfs.len();
    if n == 1 {
        return p.kfs[0].value.clone();
    }
    // the pair around `at`; outside 0..1 the first or the last pair goes on
    let mut i = 0;
    while i + 2 < n && at >= p.kfs[i + 1].offset {
        i = i + 1;
    }
    // keyframes at the same offset: the later one wins from there on
    while i + 2 < n && p.kfs[i + 1].offset == p.kfs[i].offset {
        i = i + 1;
    }
    let a = &p.kfs[i];
    let b = &p.kfs[i + 1];
    let span = b.offset - a.offset;
    let k = if span > 0.0 { (at - a.offset) / span } else if at < a.offset { 0.0 } else { 1.0 };
    mix(&a.value, &b.value, a.easing.at(k))
}

// ---- playing (Web Animations §4.4) -------------------------------------------

/// How an animation (or a sequence) plays on its clock.
#[derive(Clone)]
pub struct Player {
    pub start: f64,
    pub has_start: bool,
    pub hold: f64,
    pub has_hold: bool,
    pub rate: f64,
    pub state: i64,
}

fn player() -> Player {
    Player { start: 0.0, has_start: false, hold: 0.0, has_hold: false, rate: 1.0, state: IDLE }
}

impl Player {
    pub fn resolved(&self) -> bool {
        self.has_hold || self.has_start
    }

    /// The current time on a clock at `tl` (0 when idle).
    pub fn current(&self, tl: f64) -> f64 {
        if self.has_hold {
            return self.hold;
        }
        if self.has_start {
            return (tl - self.start) * self.rate;
        }
        0.0
    }

    fn run_from(&mut self, tl: f64, t: f64) {
        if self.rate == 0.0 {
            self.hold = t;
            self.has_hold = true;
            self.start = tl;
            self.has_start = true;
        } else {
            self.start = tl - t / self.rate;
            self.has_start = true;
            self.has_hold = false;
        }
        self.state = RUNNING;
    }

    pub fn play(&mut self, tl: f64, end: f64) {
        let res = self.resolved();
        let ct = self.current(tl);
        let mut t = ct;
        if self.rate > 0.0 && (!res || ct < 0.0 || ct >= end) {
            t = 0.0;
        } else if self.rate < 0.0 && (!res || ct <= 0.0 || ct > end) {
            t = if end >= INF { 0.0 } else { end };
        } else if !res {
            t = 0.0;
        }
        self.run_from(tl, t);
    }

    pub fn pause(&mut self, tl: f64, end: f64) {
        if self.state == PAUSED {
            return;
        }
        let t = if self.resolved() {
            self.current(tl)
        } else if self.rate >= 0.0 {
            0.0
        } else if end >= INF {
            0.0
        } else {
            end
        };
        self.hold = t;
        self.has_hold = true;
        self.has_start = false;
        self.state = PAUSED;
    }

    pub fn seek(&mut self, tl: f64, t: f64) {
        if self.state == PAUSED || self.state == IDLE {
            self.hold = t;
            self.has_hold = true;
            self.has_start = false;
            self.state = PAUSED;
        } else {
            self.run_from(tl, t);
        }
    }

    pub fn set_rate(&mut self, tl: f64, r: f64) {
        let t = self.current(tl);
        self.rate = r;
        if self.state == RUNNING || self.state == FINISHED {
            self.run_from(tl, t);
        }
    }

    pub fn finish(&mut self, tl: f64, end: f64) {
        if self.rate == 0.0 || (self.rate > 0.0 && end >= INF) {
            return;
        }
        let t = if self.rate > 0.0 { end } else { 0.0 };
        self.start = tl - t / self.rate;
        self.has_start = true;
        self.hold = t;
        self.has_hold = true;
        self.state = FINISHED;
    }

    pub fn cancel(&mut self) {
        self.has_start = false;
        self.has_hold = false;
        self.state = IDLE;
    }

    /// The finished check of a frame; true when it finished now.
    pub fn update(&mut self, tl: f64, end: f64) -> bool {
        if self.state != RUNNING || self.rate == 0.0 {
            return false;
        }
        let ct = self.current(tl);
        if self.rate > 0.0 && end < INF && ct >= end {
            self.hold = end;
            self.has_hold = true;
            self.state = FINISHED;
            return true;
        }
        if self.rate < 0.0 && ct <= 0.0 {
            self.hold = 0.0;
            self.has_hold = true;
            self.state = FINISHED;
            return true;
        }
        false
    }
}

/// Element.animate(): keyframes on a target, played on a clock.
pub struct Anim {
    pub id: i64,
    pub clock: i64,
    pub target: i64,
    pub props: Vec<Prop>,
    pub timing: Timing,
    pub player: Player,
    pub removed: bool,
}

// ---- sequences ----------------------------------------------------------------

#[derive(Clone)]
pub struct Entry {
    pub id: i64,
    pub kind: i64,
    /// a label's name, or the entry's own name for cancel / resolve
    pub name: string,
    /// where it goes: "", "<", ">", "+=500", "<-200", "label", "label+=300", "1200"
    pub pos: string,
    /// the start the position gives, and the shift a late load added (ms)
    pub start: f64,
    pub shift: f64,
    /// its length (a tween's end time), known or not yet
    pub dur: f64,
    pub known: bool,
    /// an unknown length holds the sequence at the start (a clip loading)
    pub wait: bool,
    /// how long to hold at most (ms, 0 = for good); then it is cancelled
    pub timeout: f64,
    pub waited: f64,
    /// a sound that plays on until the sequence stops (music)
    pub open: bool,
    pub removed: bool,
    pub target: i64,
    pub props: Vec<Prop>,
    pub timing: Timing,
    /// per property: the first tween of that property (fills backwards)
    pub first: Vec<bool>,
    /// a sound: the file and the host's options
    pub path: string,
    pub opts: Json,
    /// the sound has been started (and is paused)
    pub playing: bool,
    pub paused: bool,
}

fn n_entries(s: &Seq) -> usize {
    s.entries.len()
}

fn entry(id: i64, kind: i64) -> Entry {
    Entry {
        id: id,
        kind: kind,
        name: String::new(),
        pos: String::new(),
        start: 0.0,
        shift: 0.0,
        dur: 0.0,
        known: true,
        wait: true,
        timeout: 0.0,
        waited: 0.0,
        open: false,
        removed: false,
        target: -1,
        props: Vec::new(),
        timing: timing(),
        first: Vec::new(),
        path: String::new(),
        opts: Json::Null,
        playing: false,
        paused: false,
    }
}

pub struct Seq {
    pub id: i64,
    pub clock: i64,
    pub player: Player,
    pub entries: Vec<Entry>,
    /// its length: the end of the last entry (ms)
    pub end: f64,
    /// last frame's time, for what the play head passed
    pub last: f64,
    /// waiting at an entry whose length is not known yet
    pub holding: bool,
    pub removed: bool,
    /// seeked since the last frame: sounds start again from the new place,
    /// calls passed by the jump are not made
    pub seeked: bool,
}

/// One event for the game: kind ("finish", "cancel", "call", "sound",
/// "soundstop", "soundpause", "soundresume", "timeout", "rest"), the
/// animation / sequence / spring id, the entry id, and two numbers (a sound:
/// the delay to its start and the offset into it, ms).
pub struct Event {
    pub kind: string,
    pub id: i64,
    pub entry: i64,
    pub a: f64,
    pub b: f64,
}

/// A spring's value(s) moving to a target.
pub struct Spring {
    pub id: i64,
    pub clock: i64,
    pub target: i64,
    pub prop: string,
    pub list: bool,
    pub x: Vec<f64>,
    pub v: Vec<f64>,
    pub to: Vec<f64>,
    pub stiffness: f64,
    pub damping: f64,
    pub mass: f64,
    pub rest_delta: f64,
    pub rest_speed: f64,
    pub resting: bool,
    pub removed: bool,
}

/// One coordinate of a damped spring after `t` seconds: (position, speed),
/// the position measured from the target. Solved exactly for each case.
pub fn spring_step(x0: f64, v0: f64, k: f64, c: f64, m: f64, t: f64) -> Vec<f64> {
    let w0 = (k / m).sqrt();
    let z = c / (2.0 * (k * m).sqrt());
    let mut out: Vec<f64> = Vec::new();
    if z < 1.0 {
        let wd = w0 * (1.0 - z * z).sqrt();
        let e = (0.0 - z * w0 * t).exp();
        let cs = (wd * t).cos();
        let sn = (wd * t).sin();
        let b = (v0 + z * w0 * x0) / wd;
        let x = e * (x0 * cs + b * sn);
        let v = 0.0 - z * w0 * x + e * (0.0 - x0 * wd * sn + b * wd * cs);
        out.push(x);
        out.push(v);
    } else if z == 1.0 {
        let e = (0.0 - w0 * t).exp();
        let b = v0 + w0 * x0;
        out.push(e * (x0 + b * t));
        out.push(e * (b - w0 * (x0 + b * t)));
    } else {
        let s = (z * z - 1.0).sqrt();
        let r1 = 0.0 - w0 * (z - s);
        let r2 = 0.0 - w0 * (z + s);
        let c1 = (v0 - r2 * x0) / (r1 - r2);
        let c2 = x0 - c1;
        let e1 = (r1 * t).exp();
        let e2 = (r2 * t).exp();
        out.push(c1 * e1 + c2 * e2);
        out.push(c1 * r1 * e1 + c2 * r2 * e2);
    }
    out
}

// ---- the world ------------------------------------------------------------------

/// Every clock, animation, sequence and spring of the running game.
pub struct Anims {
    pub clocks: Vec<Clock>,
    pub anims: Vec<Anim>,
    pub seqs: Vec<Seq>,
    pub springs: Vec<Spring>,
    pub events: Vec<Event>,
    next: i64,
    /// the last frame's step (ms of real time)
    pub dt: f64,
}

fn nums_of(j: &Json) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    match j {
        Json::Arr(items) => {
            for it in items.iter() {
                out.push(it.as_num(0.0));
            }
        }
        _ => out.push(j.as_num(0.0)),
    }
    out
}

fn state_name(s: i64) -> string {
    if s == RUNNING {
        "running".to_string()
    } else if s == PAUSED {
        "paused".to_string()
    } else if s == FINISHED {
        "finished".to_string()
    } else {
        "idle".to_string()
    }
}

fn ok_id(id: i64) -> Json {
    Json::Num(id as f64)
}

/// Where a position puts an entry, given the sequence's end so far, the
/// previous entry's start and end, and the labels.
fn place(pos: &str, end: f64, prev_start: f64, prev_end: f64, names: &Vec<string>, times: &Vec<f64>) -> f64 {
    let p = pos.trim().to_string();
    if p == "" {
        return end;
    }
    let cs: Vec<char> = p.chars().collect();
    let c0 = cs[0];
    if c0 == '<' || c0 == '>' {
        let base = if c0 == '<' { prev_start } else { prev_end };
        let mut rest = String::new();
        let mut i = 1;
        while i < cs.len() {
            rest.push(cs[i]);
            i = i + 1;
        }
        return base + rel(&rest);
    }
    if p.starts_with("+=") || p.starts_with("-=") {
        return end + rel(&p);
    }
    if is_digit(c0) || c0 == '.' || (c0 == '-' && cs.len() > 1) {
        return easing::number(&p);
    }
    // a label, maybe with "+=x" / "-=x"
    let mut name = String::new();
    let mut tail = String::new();
    let mut in_tail = false;
    let mut i = 0;
    while i < cs.len() {
        if !in_tail && i + 1 < cs.len() && (cs[i] == '+' || cs[i] == '-') && cs[i + 1] == '=' {
            in_tail = true;
        }
        if in_tail {
            tail.push(cs[i]);
        } else {
            name.push(cs[i]);
        }
        i = i + 1;
    }
    let mut k = names.len();
    while k > 0 {
        k = k - 1;
        if names[k] == name {
            return times[k] + rel(&tail);
        }
    }
    end + rel(&tail)
}

/// "+=300" 300, "-=300" -300, "200" 200, "-200" -200, "" 0
fn rel(s: &str) -> f64 {
    let t = s.trim().to_string();
    if t == "" {
        return 0.0;
    }
    let cs: Vec<char> = t.chars().collect();
    if cs.len() > 1 && cs[1] == '=' {
        let mut r = String::new();
        let mut i = 2;
        while i < cs.len() {
            r.push(cs[i]);
            i = i + 1;
        }
        let v = easing::number(&r);
        return if cs[0] == '-' { 0.0 - v } else { v };
    }
    easing::number(&t)
}

impl Anims {
    pub fn new() -> Anims {
        let mut clocks: Vec<Clock> = Vec::new();
        clocks.push(Clock::new("real", 1.0));
        Anims { clocks: clocks, anims: Vec::new(), seqs: Vec::new(), springs: Vec::new(), events: Vec::new(), next: 1, dt: 0.0 }
    }

    /// A new game: everything goes.
    pub fn reset(&mut self) {
        self.clocks = Vec::new();
        self.clocks.push(Clock::new("real", 1.0));
        self.anims = Vec::new();
        self.seqs = Vec::new();
        self.springs = Vec::new();
        self.events = Vec::new();
    }

    fn new_id(&mut self) -> i64 {
        let id = self.next;
        self.next = self.next + 1;
        id
    }

    fn clock_time(&self, c: i64) -> f64 {
        if c >= 0 && (c as usize) < self.clocks.len() {
            return self.clocks[c as usize].time;
        }
        self.clocks[0].time
    }

    fn clock_index(&self, j: &Json) -> i64 {
        match j {
            Json::Num(x) => {
                let c = *x as i64;
                if c >= 0 && (c as usize) < self.clocks.len() {
                    return c;
                }
                0
            }
            Json::Str(s) => {
                for (i, c) in self.clocks.iter().enumerate() {
                    if c.name == *s {
                        return i as i64;
                    }
                }
                0
            }
            _ => 0,
        }
    }

    fn anim_index(&self, id: i64) -> i64 {
        for (i, a) in self.anims.iter().enumerate() {
            if a.id == id && !a.removed {
                return i as i64;
            }
        }
        -1
    }

    fn seq_index(&self, id: i64) -> i64 {
        for (i, s) in self.seqs.iter().enumerate() {
            if s.id == id && !s.removed {
                return i as i64;
            }
        }
        -1
    }

    fn spring_index(&self, id: i64) -> i64 {
        for (i, s) in self.springs.iter().enumerate() {
            if s.id == id && !s.removed {
                return i as i64;
            }
        }
        -1
    }

    fn event(&mut self, kind: &str, id: i64, entry: i64, a: f64, b: f64) {
        self.events.push(Event { kind: kind.to_string(), id: id, entry: entry, a: a, b: b });
    }

    /// A request from the game (JSON, `op` names it); the answer is JSON.
    pub fn request(&mut self, r: &Json) -> Json {
        let op = r.get("op").as_str();
        if op == "anim" {
            return self.make_anim(r);
        }
        if op == "ctl" {
            return self.control(r);
        }
        if op == "get" {
            return self.info(r.get("id").as_num(0.0) as i64);
        }
        if op == "clock" {
            return self.make_clock(r);
        }
        if op == "seq" {
            return self.make_seq(r);
        }
        if op == "add" {
            return self.add_entry(r);
        }
        if op == "entry" {
            return self.entry_ctl(r);
        }
        if op == "spring" {
            return self.make_spring(r);
        }
        if op == "springto" {
            return self.spring_to(r);
        }
        Json::Null
    }

    fn make_anim(&mut self, r: &Json) -> Json {
        let id = self.new_id();
        let clock = self.clock_index(&r.get("clock"));
        let tm = timing_of(&r.get("timing"), FILL_NONE);
        let mut p = player();
        let tl = self.clock_time(clock);
        let end = tm.end_time();
        if r.get("paused").as_bool() {
            p.pause(tl, end);
        } else {
            p.play(tl, end);
        }
        if r.has("rate") {
            p.set_rate(tl, r.get("rate").as_num(1.0));
        }
        self.anims.push(Anim { id: id, clock: clock, target: r.get("target").as_num(-1.0) as i64, props: props_of(&r.get("props")), timing: tm, player: p, removed: false });
        ok_id(id)
    }

    fn make_clock(&mut self, r: &Json) -> Json {
        let name = r.get("name").as_str();
        let mut idx = -1;
        for (i, c) in self.clocks.iter().enumerate() {
            if c.name == name {
                idx = i as i64;
            }
        }
        if idx < 0 {
            self.clocks.push(Clock::new(&name, 1.0));
            idx = (self.clocks.len() - 1) as i64;
        }
        let c = &mut self.clocks[idx as usize];
        if r.has("rate") {
            c.set_rate(r.get("rate").as_num(1.0), r.get("glide").as_num(0.0), r.get("log").as_bool());
        }
        if r.has("paused") {
            c.paused = r.get("paused").as_bool();
        }
        if r.has("time") {
            c.time = r.get("time").as_num(0.0);
        }
        json::obj(vec![member("id", Json::Num(idx as f64)), member("time", Json::Num(c.time)), member("rate", Json::Num(c.rate)), member("target", Json::Num(c.target_rate()))])
    }

    fn make_seq(&mut self, r: &Json) -> Json {
        let id = self.new_id();
        let clock = self.clock_index(&r.get("clock"));
        let mut p = player();
        if r.has("rate") {
            p.rate = r.get("rate").as_num(1.0);
        }
        let tl = self.clock_time(clock);
        if r.get("paused").as_bool() {
            p.pause(tl, INF);
        } else {
            p.run_from(tl, 0.0);
        }
        self.seqs.push(Seq { id: id, clock: clock, player: p, entries: Vec::new(), end: 0.0, last: -0.001, holding: false, removed: false, seeked: false });
        ok_id(id)
    }

    fn add_entry(&mut self, r: &Json) -> Json {
        let si = self.seq_index(r.get("seq").as_num(0.0) as i64);
        if si < 0 {
            return Json::Null;
        }
        let id = self.new_id();
        let k = r.get("kind").as_str();
        let kind = if k == "tween" {
            TWEEN
        } else if k == "call" {
            CALL
        } else if k == "sound" {
            SOUND
        } else if k == "label" {
            LABEL
        } else {
            GAP
        };
        let mut e = entry(id, kind);
        e.name = r.get("name").as_str();
        e.pos = match r.get("pos") {
            Json::Num(x) => json::num(x),
            Json::Str(s) => s,
            _ => String::new(),
        };
        if kind == TWEEN {
            e.target = r.get("target").as_num(-1.0) as i64;
            e.props = props_of(&r.get("props"));
            e.timing = timing_of(&r.get("timing"), FILL_BOTH);
            e.timing.delay = 0.0;
            e.dur = e.timing.end_time();
            if e.dur >= INF {
                e.dur = 0.0;
                e.open = true;
            }
        }
        if kind == GAP || kind == SOUND {
            if r.has("dur") {
                e.dur = r.get("dur").as_num(0.0).max(0.0);
                e.known = true;
            } else {
                e.known = kind == GAP && !r.has("wait");
            }
            e.wait = !r.has("wait") || r.get("wait").as_bool();
            e.timeout = r.get("timeout").as_num(0.0);
            e.open = r.get("open").as_bool();
            if e.open {
                e.known = true;
            }
        }
        if kind == SOUND {
            e.path = r.get("path").as_str();
            e.opts = r.get("opts");
        }
        let s = &mut self.seqs[si as usize];
        s.entries.push(e);
        self.layout(si as usize);
        ok_id(id)
    }

    fn find_entry(&self, si: usize, r: &Json) -> i64 {
        let s = &self.seqs[si];
        let key = r.get("entry");
        for (i, e) in s.entries.iter().enumerate() {
            if e.removed {
                continue;
            }
            let hit = match &key {
                Json::Num(x) => e.id == *x as i64,
                Json::Str(n) => e.name == *n,
                _ => false,
            };
            if hit {
                return i as i64;
            }
        }
        -1
    }

    fn entry_ctl(&mut self, r: &Json) -> Json {
        let si = self.seq_index(r.get("seq").as_num(0.0) as i64);
        if si < 0 {
            return Json::Bool(false);
        }
        let ei = self.find_entry(si as usize, r);
        if ei < 0 {
            return Json::Bool(false);
        }
        let what = r.get("do").as_str();
        if what == "cancel" {
            self.cancel_entry(si as usize, ei as usize, "cancel");
        } else if what == "resolve" {
            let s = &mut self.seqs[si as usize];
            let e = &mut s.entries[ei as usize];
            e.dur = r.get("dur").as_num(0.0).max(0.0);
            e.known = true;
            self.layout(si as usize);
        }
        Json::Bool(true)
    }

    /// An entry cancelled: one under way ends now, one ahead goes; the
    /// entries after it move up.
    fn cancel_entry(&mut self, si: usize, ei: usize, why: &str) {
        let sid = self.seqs[si].id;
        let tl = self.clock_time(self.seqs[si].clock);
        let ct = self.seqs[si].player.current(tl);
        let eid = self.seqs[si].entries[ei].id;
        let was_playing = self.seqs[si].entries[ei].playing && self.seqs[si].entries[ei].kind == SOUND;
        {
            let e = &mut self.seqs[si].entries[ei];
            let st = e.start + e.shift;
            if e.kind != TWEEN && ct > st && (!e.known || e.open || ct < st + e.dur) {
                e.dur = ct - st;
                e.known = true;
                e.open = false;
            } else {
                e.removed = true;
            }
            e.playing = false;
        }
        if was_playing {
            self.event("soundstop", sid, eid, 0.0, 0.0);
        }
        self.event(why, sid, eid, 0.0, 0.0);
        self.layout(si);
    }

    /// Places every entry again: positions, the sequence's length, the "to"
    /// tweens' start values and which tweens fill backwards.
    fn layout(&mut self, si: usize) {
        let s = &mut self.seqs[si];
        let mut end = 0.0;
        let mut prev_start = 0.0;
        let mut prev_end = 0.0;
        let mut names: Vec<string> = Vec::new();
        let mut times: Vec<f64> = Vec::new();
        let n = s.entries.len();
        let mut i = 0;
        while i < n {
            if s.entries[i].removed {
                i = i + 1;
                continue;
            }
            let at = place(&s.entries[i].pos, end, prev_start, prev_end, &names, &times).max(0.0);
            s.entries[i].start = at;
            let st = at + s.entries[i].shift;
            if s.entries[i].kind == LABEL {
                names.push(s.entries[i].name.clone());
                times.push(st);
                i = i + 1;
                continue;
            }
            let d = if s.entries[i].known && !s.entries[i].open { s.entries[i].dur } else { 0.0 };
            prev_start = st;
            prev_end = st + d;
            if prev_end > end {
                end = prev_end;
            }
            i = i + 1;
        }
        s.end = end;
        // the tweens: "to" values from the tween before, the first ones fill backwards
        i = 0;
        while i < n {
            if s.entries[i].removed || s.entries[i].kind != TWEEN {
                i = i + 1;
                continue;
            }
            let st = s.entries[i].start + s.entries[i].shift;
            let tgt = s.entries[i].target;
            let mut firsts: Vec<bool> = Vec::new();
            let mut pi = 0;
            while pi < s.entries[i].props.len() {
                let name = s.entries[i].props[pi].name.clone();
                let mut first = true;
                let mut best = -1.0;
                let mut from = Value { kind: V_NUM, nums: Vec::new(), parts: Vec::new() };
                let mut have = false;
                let mut j = 0;
                while j < n {
                    let o = &s.entries[j];
                    if j == i || o.removed || o.kind != TWEEN || o.target != tgt {
                        j = j + 1;
                        continue;
                    }
                    let ost = o.start + o.shift;
                    let mut has = -1;
                    for (k, p) in o.props.iter().enumerate() {
                        if p.name == name {
                            has = k as i64;
                        }
                    }
                    if has < 0 {
                        j = j + 1;
                        continue;
                    }
                    if ost < st || (ost == st && j < i) {
                        first = false;
                    }
                    let oend = ost + o.dur;
                    if oend <= st + 0.000001 && (oend > best || (oend == best && !have) || oend == best) && j < n {
                        best = oend;
                        let c = compute(&o.timing, o.dur, false);
                        from = sample(&o.props[has as usize], if c.on { c.progress } else { 1.0 });
                        have = true;
                    }
                    j = j + 1;
                }
                firsts.push(first);
                if have && s.entries[i].props[pi].to && s.entries[i].props[pi].kfs.len() > 1 {
                    s.entries[i].props[pi].kfs[0].value = from;
                }
                pi = pi + 1;
            }
            s.entries[i].first = firsts;
            i = i + 1;
        }
    }

    fn control(&mut self, r: &Json) -> Json {
        let id = r.get("id").as_num(0.0) as i64;
        let what = r.get("do").as_str();
        let t = r.get("t").as_num(0.0);
        let ai = self.anim_index(id);
        if ai >= 0 {
            let tl = self.clock_time(self.anims[ai as usize].clock);
            let end = self.anims[ai as usize].timing.end_time();
            let mut cancelled = false;
            {
                let a = &mut self.anims[ai as usize];
                if what == "play" {
                    a.player.play(tl, end);
                } else if what == "pause" {
                    a.player.pause(tl, end);
                } else if what == "reverse" {
                    let r0 = a.player.rate;
                    a.player.set_rate(tl, 0.0 - r0);
                    a.player.play(tl, end);
                } else if what == "finish" {
                    a.player.finish(tl, end);
                } else if what == "cancel" {
                    a.player.cancel();
                    cancelled = true;
                } else if what == "seek" {
                    a.player.seek(tl, t);
                } else if what == "rate" {
                    a.player.set_rate(tl, t);
                } else if what == "remove" {
                    a.removed = true;
                } else if what == "timing" {
                    a.timing = timing_of(&r.get("timing"), a.timing.fill);
                }
            }
            if cancelled {
                self.event("cancel", id, 0, 0.0, 0.0);
            }
            return self.info(id);
        }
        let si = self.seq_index(id);
        if si >= 0 {
            let s0 = si as usize;
            let tl = self.clock_time(self.seqs[s0].clock);
            let end = self.seqs[s0].end;
            if what == "play" {
                self.seqs[s0].player.play(tl, end);
            } else if what == "pause" {
                self.seqs[s0].player.pause(tl, end);
            } else if what == "reverse" {
                let r0 = self.seqs[s0].player.rate;
                self.seqs[s0].player.set_rate(tl, 0.0 - r0);
                self.seqs[s0].player.play(tl, end);
            } else if what == "seek" {
                self.seqs[s0].player.seek(tl, t);
                self.seqs[s0].seeked = true;
            } else if what == "rate" {
                self.seqs[s0].player.set_rate(tl, t);
            } else if what == "finish" {
                self.seqs[s0].player.finish(tl, end);
            } else if what == "cancel" || what == "remove" {
                self.stop_sounds(s0);
                self.seqs[s0].player.cancel();
                if what == "remove" {
                    self.seqs[s0].removed = true;
                }
                self.event("cancel", id, 0, 0.0, 0.0);
            }
            return self.info(id);
        }
        let pi = self.spring_index(id);
        if pi >= 0 && what == "remove" {
            self.springs[pi as usize].removed = true;
        }
        Json::Null
    }

    fn stop_sounds(&mut self, si: usize) {
        let sid = self.seqs[si].id;
        let mut stops: Vec<i64> = Vec::new();
        for e in self.seqs[si].entries.iter_mut() {
            if e.playing && e.kind == SOUND {
                e.playing = false;
                e.paused = false;
                stops.push(e.id);
            }
        }
        for x in stops.iter() {
            self.event("soundstop", sid, *x, 0.0, 0.0);
        }
    }

    /// { t (current time), state, rate, end } of an animation or a sequence.
    pub fn info(&self, id: i64) -> Json {
        let ai = self.anim_index(id);
        if ai >= 0 {
            let a = &self.anims[ai as usize];
            let tl = self.clock_time(a.clock);
            return json::obj(vec![
                member("t", Json::Num(a.player.current(tl))),
                member("state", Json::Str(state_name(a.player.state))),
                member("rate", Json::Num(a.player.rate)),
                member("end", Json::Num(a.timing.end_time())),
            ]);
        }
        let si = self.seq_index(id);
        if si >= 0 {
            let s = &self.seqs[si as usize];
            let tl = self.clock_time(s.clock);
            return json::obj(vec![
                member("t", Json::Num(s.player.current(tl))),
                member("state", Json::Str(state_name(s.player.state))),
                member("rate", Json::Num(s.player.rate)),
                member("end", Json::Num(s.end)),
                member("holding", Json::Bool(s.holding)),
            ]);
        }
        Json::Null
    }

    fn make_spring(&mut self, r: &Json) -> Json {
        let id = self.new_id();
        let x = nums_of(&r.get("value"));
        let to = if r.has("to") { nums_of(&r.get("to")) } else { x.clone() };
        let mut v = if r.has("velocity") { nums_of(&r.get("velocity")) } else { Vec::new() };
        while v.len() < x.len() {
            v.push(0.0);
        }
        let list = match r.get("value") {
            Json::Arr(_) => true,
            _ => false,
        };
        self.springs.push(Spring {
            id: id,
            clock: self.clock_index(&r.get("clock")),
            target: r.get("target").as_num(-1.0) as i64,
            prop: r.get("prop").as_str(),
            list: list,
            x: x,
            v: v,
            to: to,
            stiffness: r.get("stiffness").as_num(100.0).max(0.001),
            damping: r.get("damping").as_num(10.0).max(0.0),
            mass: r.get("mass").as_num(1.0).max(0.001),
            rest_delta: r.get("restDelta").as_num(0.01),
            rest_speed: r.get("restSpeed").as_num(0.01),
            resting: false,
            removed: false,
        });
        ok_id(id)
    }

    fn spring_to(&mut self, r: &Json) -> Json {
        let pi = self.spring_index(r.get("id").as_num(0.0) as i64);
        if pi < 0 {
            return Json::Null;
        }
        let s = &mut self.springs[pi as usize];
        if r.has("to") {
            s.to = nums_of(&r.get("to"));
        }
        if r.has("value") {
            s.x = nums_of(&r.get("value"));
        }
        if r.has("velocity") {
            s.v = nums_of(&r.get("velocity"));
        }
        while s.v.len() < s.x.len() {
            s.v.push(0.0);
        }
        while s.to.len() < s.x.len() {
            s.to.push(0.0);
        }
        s.resting = false;
        Json::Bool(true)
    }

    /// One frame: the clocks move by `dt` ms of real time, then every
    /// animation, sequence and spring; `out` gets [target, prop, value] for
    /// each value to set, in the order they apply (a later one wins).
    pub fn advance(&mut self, dt: f64) -> Vec<Json> {
        self.dt = dt;
        let mut moved: Vec<f64> = Vec::new();
        for c in self.clocks.iter_mut() {
            moved.push(c.advance(dt));
        }
        let mut out: Vec<Json> = Vec::new();
        // animations and sequences in the order they were made
        let mut ai = 0;
        let mut si = 0;
        while ai < self.anims.len() || si < self.seqs.len() {
            let take_anim = si >= self.seqs.len() || (ai < self.anims.len() && self.anims[ai].id < self.seqs[si].id);
            if take_anim {
                self.anim_frame(ai, &mut out);
                ai = ai + 1;
            } else {
                self.seq_frame(si, &moved, &mut out);
                si = si + 1;
            }
        }
        let mut k = 0;
        while k < self.springs.len() {
            self.spring_frame(k, &moved, &mut out);
            k = k + 1;
        }
        self.sweep();
        out
    }

    fn anim_frame(&mut self, i: usize, out: &mut Vec<Json>) {
        if self.anims[i].removed {
            return;
        }
        let tl = self.clock_time(self.anims[i].clock);
        let end = self.anims[i].timing.end_time();
        let id = self.anims[i].id;
        if self.anims[i].player.update(tl, end) {
            self.event("finish", id, 0, 0.0, 0.0);
        }
        let a = &self.anims[i];
        if a.player.state == IDLE || a.target < 0 {
            return;
        }
        let t = a.player.current(tl);
        let c = compute(&a.timing, t, a.player.rate < 0.0);
        if !c.on {
            return;
        }
        for p in a.props.iter() {
            out.push(Json::Arr(vec![Json::Num(a.target as f64), Json::Str(p.name.clone()), value_json(&sample(p, c.progress))]));
        }
    }

    fn seq_frame(&mut self, i: usize, moved: &Vec<f64>, out: &mut Vec<Json>) {
        if self.seqs[i].removed {
            return;
        }
        let clock = self.seqs[i].clock;
        let tl = self.clock_time(clock);
        let step = if clock >= 0 && (clock as usize) < moved.len() { moved[clock as usize] } else { self.dt };
        let sid = self.seqs[i].id;
        let mut ct = self.seqs[i].player.current(tl);
        let running = self.seqs[i].player.state == RUNNING;
        let rate = self.seqs[i].player.rate;
        // an entry of unknown length ahead: wait at its start
        let was_holding = self.seqs[i].holding;
        self.seqs[i].holding = false;
        // what waits behind the hold: the entries after it from its start on
        let mut held_from = INF;
        let mut held_index = n_entries(&self.seqs[i]);
        if running && rate > 0.0 {
            let mut hold = -1;
            let mut hold_at = INF;
            for (k, e) in self.seqs[i].entries.iter().enumerate() {
                let st = e.start + e.shift;
                if !e.removed && !e.known && e.wait && st <= ct && st < hold_at {
                    hold = k as i64;
                    hold_at = st;
                }
            }
            if hold >= 0 {
                let h = hold as usize;
                let last = self.seqs[i].last;
                let mut at = hold_at;
                if last > at {
                    // put after the play head had passed it: it starts where the head is
                    self.seqs[i].entries[h].shift = self.seqs[i].entries[h].shift + (last - at);
                    at = last;
                    self.layout(i);
                }
                self.seqs[i].player.seek(tl, at);
                ct = at;
                self.seqs[i].holding = true;
                held_from = at;
                held_index = h;
                let w = self.seqs[i].entries[h].waited + self.dt;
                self.seqs[i].entries[h].waited = w;
                let to = self.seqs[i].entries[h].timeout;
                if to > 0.0 && w >= to {
                    self.cancel_entry(i, h, "timeout");
                }
            }
        }
        if was_holding && !self.seqs[i].holding && running {
            // what it waited for came: it starts from there, not a step on
            let at = self.seqs[i].last;
            self.seqs[i].player.seek(tl, at);
            ct = at;
        }
        let end = self.seqs[i].end;
        if !self.seqs[i].holding && self.seqs[i].player.update(tl, end) {
            self.event("finish", sid, 0, 0.0, 0.0);
            ct = self.seqs[i].player.current(tl);
        }
        let state = self.seqs[i].player.state;
        let last = self.seqs[i].last;
        let expect = last + step * rate;
        let jumped = self.seqs[i].seeked || ((ct - expect).abs() > 50.0_f64.max(step.abs() * rate.abs() * 1.5) && state != PAUSED && !self.seqs[i].holding);
        self.seqs[i].seeked = false;
        let playing = state == RUNNING;
        let ahead = (step * rate).abs();
        let n = self.seqs[i].entries.len();
        let mut k = 0;
        while k < n {
            let e = self.seqs[i].entries[k].clone();
            if e.removed || e.kind == LABEL {
                k = k + 1;
                continue;
            }
            let st = e.start + e.shift;
            let blocked = self.seqs[i].holding && k > held_index && st >= held_from - 0.000001;
            if blocked && e.kind != TWEEN {
                k = k + 1;
                continue;
            }
            if e.kind == CALL {
                // `playing` marks a call made (the play head is past it); going
                // back before it makes it again on the way forwards
                let past = if rate >= 0.0 { st <= ct } else { st >= ct };
                if past && !e.playing {
                    if !jumped && (playing || state == FINISHED) {
                        self.event("call", sid, e.id, 0.0, 0.0);
                    }
                    self.seqs[i].entries[k].playing = true;
                } else if !past && e.playing {
                    self.seqs[i].entries[k].playing = false;
                }
            } else if e.kind == SOUND {
                let len = if e.open || !e.known { INF } else { e.dur };
                let inside = st <= ct + ahead && ct < st + len;
                let want = inside && playing && rate > 0.0 && !self.seqs[i].holding || (inside && self.seqs[i].holding && e.playing && e.known);
                if e.playing && jumped {
                    self.event("soundstop", sid, e.id, 0.0, 0.0);
                    self.seqs[i].entries[k].playing = false;
                    self.seqs[i].entries[k].paused = false;
                }
                let is_on = self.seqs[i].entries[k].playing;
                if want && !is_on && e.known {
                    let delay = if st > ct && rate > 0.0 { (st - ct) / rate } else { 0.0 };
                    let off = if ct > st { ct - st } else { 0.0 };
                    self.event("sound", sid, e.id, delay, off);
                    self.seqs[i].entries[k].playing = true;
                    self.seqs[i].entries[k].paused = false;
                } else if is_on && state == PAUSED && !e.paused {
                    self.event("soundpause", sid, e.id, 0.0, 0.0);
                    self.seqs[i].entries[k].paused = true;
                } else if is_on && e.paused && playing {
                    self.event("soundresume", sid, e.id, 0.0, 0.0);
                    self.seqs[i].entries[k].paused = false;
                } else if is_on && !inside && state != PAUSED {
                    // out of its time: ended on its own going forwards, stopped otherwise
                    if !(ct >= st + len && rate > 0.0 && !jumped) {
                        self.event("soundstop", sid, e.id, 0.0, 0.0);
                    }
                    self.seqs[i].entries[k].playing = false;
                } else if is_on && (state == IDLE || rate <= 0.0) {
                    self.event("soundstop", sid, e.id, 0.0, 0.0);
                    self.seqs[i].entries[k].playing = false;
                }
            } else if e.kind == TWEEN && e.target >= 0 && state != IDLE {
                let c = compute(&e.timing, ct - st, rate < 0.0);
                if c.on {
                    for (pi, p) in e.props.iter().enumerate() {
                        let first = pi < e.first.len() && e.first[pi];
                        if c.phase == 0 && !first {
                            continue;
                        }
                        out.push(Json::Arr(vec![Json::Num(e.target as f64), Json::Str(p.name.clone()), value_json(&sample(p, c.progress))]));
                    }
                }
            }
            k = k + 1;
        }
        self.seqs[i].last = ct;
    }

    fn spring_frame(&mut self, i: usize, moved: &Vec<f64>, out: &mut Vec<Json>) {
        if self.springs[i].removed {
            return;
        }
        let c = self.springs[i].clock;
        let step = if c >= 0 && (c as usize) < moved.len() { moved[c as usize] } else { self.dt };
        let id = self.springs[i].id;
        let mut rested = false;
        {
            let s = &mut self.springs[i];
            if !s.resting && step > 0.0 {
                let t = step / 1000.0;
                let mut still = true;
                let mut d = 0;
                while d < s.x.len() {
                    let goal = if d < s.to.len() { s.to[d] } else { 0.0 };
                    let r = spring_step(s.x[d] - goal, s.v[d], s.stiffness, s.damping, s.mass, t);
                    s.x[d] = goal + r[0];
                    s.v[d] = r[1];
                    if r[0].abs() > s.rest_delta || r[1].abs() > s.rest_speed {
                        still = false;
                    }
                    d = d + 1;
                }
                if still {
                    let mut d2 = 0;
                    while d2 < s.x.len() {
                        s.x[d2] = if d2 < s.to.len() { s.to[d2] } else { 0.0 };
                        s.v[d2] = 0.0;
                        d2 = d2 + 1;
                    }
                    s.resting = true;
                    rested = true;
                }
            }
        }
        if rested {
            self.event("rest", id, 0, 0.0, 0.0);
        }
        let s = &self.springs[i];
        if s.target >= 0 && s.prop != "" {
            let v = if s.list {
                Value { kind: V_LIST, nums: s.x.clone(), parts: Vec::new() }
            } else {
                num_value(if s.x.len() > 0 { s.x[0] } else { 0.0 })
            };
            out.push(Json::Arr(vec![Json::Num(s.target as f64), Json::Str(s.prop.clone()), value_json(&v)]));
        }
    }

    /// Removed things leave the lists.
    fn sweep(&mut self) {
        let mut i = self.anims.len();
        while i > 0 {
            i = i - 1;
            if self.anims[i].removed {
                self.anims.remove(i);
            }
        }
        i = self.seqs.len();
        while i > 0 {
            i = i - 1;
            if self.seqs[i].removed {
                self.seqs.remove(i);
            }
        }
        i = self.springs.len();
        while i > 0 {
            i = i - 1;
            if self.springs[i].removed {
                self.springs.remove(i);
            }
        }
    }

    /// Sound entries whose length is not known yet: [seq id, entry id, path].
    pub fn unknown_sounds(&self) -> Vec<Json> {
        let mut out: Vec<Json> = Vec::new();
        for s in self.seqs.iter() {
            for e in s.entries.iter() {
                if !e.removed && e.kind == SOUND && !e.known && e.path != "" {
                    out.push(Json::Arr(vec![Json::Num(s.id as f64), Json::Num(e.id as f64), Json::Str(e.path.clone())]));
                }
            }
        }
        out
    }

    /// A sound entry's length, now known (ms).
    pub fn sound_length(&mut self, seq: i64, entry: i64, dur: f64) {
        let si = self.seq_index(seq);
        if si < 0 {
            return;
        }
        let mut hit = false;
        for e in self.seqs[si as usize].entries.iter_mut() {
            if e.id == entry && !e.known {
                // played faster or slower (pitch), and the host's own frame
                // round it (a radio call's static and click)
                let rate = e.opts.get("rate").as_num(1.0);
                let pad = e.opts.get("pad").as_num(0.0);
                let r = if rate > 0.01 { rate } else { 1.0 };
                e.dur = (dur / r + pad).max(0.0);
                e.known = true;
                hit = true;
            }
        }
        if hit {
            self.layout(si as usize);
        }
    }

    /// The frame's state for the game: the events since the last frame
    /// (taken), the animations' and sequences' times and states, the springs'
    /// values and the clocks.
    pub fn frame_json(&mut self, values: Vec<Json>) -> Json {
        let mut ev: Vec<Json> = Vec::new();
        for e in self.events.iter() {
            ev.push(Json::Arr(vec![Json::Str(e.kind.clone()), Json::Num(e.id as f64), Json::Num(e.entry as f64), Json::Num(e.a), Json::Num(e.b)]));
        }
        self.events = Vec::new();
        let mut st: Vec<Json> = Vec::new();
        for a in self.anims.iter() {
            let tl = self.clock_time(a.clock);
            st.push(Json::Arr(vec![Json::Num(a.id as f64), Json::Num(a.player.current(tl)), Json::Num(a.player.state as f64), Json::Num(a.player.rate)]));
        }
        for s in self.seqs.iter() {
            let tl = self.clock_time(s.clock);
            st.push(Json::Arr(vec![Json::Num(s.id as f64), Json::Num(s.player.current(tl)), Json::Num(s.player.state as f64), Json::Num(s.player.rate), Json::Num(s.end), Json::Bool(s.holding)]));
        }
        let mut sp: Vec<Json> = Vec::new();
        for s in self.springs.iter() {
            let mut xs: Vec<Json> = Vec::new();
            for x in s.x.iter() {
                xs.push(Json::Num(*x));
            }
            let mut vs: Vec<Json> = Vec::new();
            for x in s.v.iter() {
                vs.push(Json::Num(*x));
            }
            sp.push(Json::Arr(vec![Json::Num(s.id as f64), Json::Arr(xs), Json::Arr(vs), Json::Bool(s.resting)]));
        }
        let mut cl: Vec<Json> = Vec::new();
        for c in self.clocks.iter() {
            cl.push(Json::Arr(vec![Json::Num(c.time), Json::Num(c.rate), Json::Bool(c.paused)]));
        }
        let mut m: Vec<JsonMember> = Vec::new();
        m.push(member("o", Json::Arr(values)));
        if ev.len() > 0 {
            m.push(member("e", Json::Arr(ev)));
        }
        if st.len() > 0 {
            m.push(member("s", Json::Arr(st)));
        }
        if sp.len() > 0 {
            m.push(member("sp", Json::Arr(sp)));
        }
        m.push(member("c", Json::Arr(cl)));
        json::obj(m)
    }
}
