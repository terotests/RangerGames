// SPDX-License-Identifier: AGPL-3.0-or-later
//! Finnish on top of CHIMERA's planner. CHIMERA plans English: aspirated
//! /p t k/, English vowel qualities and an English "hat" melody. Its plan is
//! a list of gestures, so we keep its articulation and timing machinery and
//! change three things in the plan before it is rendered (CHIMERA itself
//! stays unchanged):
//!
//! 1. Stops are unaspirated, as in Finnish (VOT ~10–20 ms instead of ~50 ms),
//!    a velar closure next to a vowel is shorter (CHIMERA's slow tongue body
//!    otherwise swallows the short vowels of `kuka`, `kokeile`), and /h/ hands
//!    over to its vowel sooner.
//! 2. Vowels move to Finnish qualities: /ɑ/ further back, /æ/ more open (a
//!    real [æ], halfway to [a]), /u/ and /o/ further back and rounder, /ø/ a
//!    little more open. Each is a mix of CHIMERA's calibrated vowels, so the
//!    articulation stays within what the model was calibrated for.
//! 3. The melody is Finnish: every stressed (first) syllable of a word rises
//!    to a peak late in the syllable and falls over the next one; each accent
//!    is lower than the one before (downstep); the sentence ends in a fall to
//!    the low end of the voice. Questions fall too, from a higher start;
//!    exclamations have larger accents; a comma keeps the voice up.

use crate::fi::Kind;
use chimera::anatomy::human::{ArticPatch, BodyMix};
use chimera::control::score::{ControlKey, Gesture, Targets};
use chimera::phonetics::planner::{PlanOptions, plan_utterance, vowel_artic};
use chimera::phonetics::{Intonation, Plan, PlannedSegment, Segment};

/// A Finnish vowel (as fi.rs writes it) as a mix of CHIMERA's vowels.
/// Targets (female, Hz; Iivonen & Harnud 2005, Kuronen 2000):
/// ɑ 780/1300, æ 800/1850, e 500/2350, o 520/950, u 380/800, ø 500/1750.
fn mix(ipa: &str) -> Option<&'static [(&'static str, f64)]> {
    Some(match ipa {
        "ɑ" => &[("ɑ", 0.4), ("ɒ", 0.6)],
        "æ" => &[("æ", 0.4), ("a", 0.6)],
        "o" => &[("o", 0.85), ("u", 0.15)],
        "u" => &[("u", 1.0)],
        "ø" => &[("ø", 0.7), ("œ", 0.3)],
        _ => return None,
    })
}

/// Per-key adjustments after the mix (template cm / openings): /u/ and /o/
/// with the tongue body further back and the lips closer, as Finnish back
/// rounded vowels are (CHIMERA's /u/ is the fronted American one, F2 ~1100).
/// A child's mouth is smaller: half the shift (the full one closes its /u/).
fn adjust(ipa: &str, p: &mut ArticPatch, body: BodyMix) {
    use chimera::anatomy::human::ArticKey::*;
    let child = body.weights()[2].1;
    let scale = 1.0 - 0.5 * child;
    let shift = |p: &mut ArticPatch, k, d: f64| {
        if let Some(x) = p.get(k) {
            p.set(k, x + d * scale);
        }
    };
    match ipa {
        "u" => {
            shift(p, TbX, -0.1);
            shift(p, Jaw, 0.0);
            shift(p, LipAp, -0.05);
        }
        "o" => {
            shift(p, TbX, -0.3);
            shift(p, Jaw, -0.1);
            shift(p, LipAp, -0.08);
        }
        _ => {}
    }
}

/// The Finnish articulation of vowel `ipa` for `body`, or None (CHIMERA's own is used).
pub fn vowel(ipa: &str, body: BodyMix) -> Option<ArticPatch> {
    let parts = mix(ipa)?;
    let mut ps: Vec<(f64, ArticPatch)> = Vec::with_capacity(parts.len());
    for (v, w) in parts {
        ps.push((*w, vowel_artic(v, body)?));
    }
    let mut p = ArticPatch::blend(&ps);
    adjust(ipa, &mut p, body);
    Some(p)
}

fn targets(p: &ArticPatch) -> Targets {
    let mut t = Targets::default();
    for (k, x) in p.iter() {
        t.set(k, x);
    }
    t
}

const VOWELS: [&str; 8] = ["i", "y", "u", "e", "ø", "o", "æ", "ɑ"];

/// Finnish phrases planned from `o.t0`, each with its own breath and melody;
/// `pause` after every phrase that ends a sentence, a shorter one after a comma.
pub fn plan(phrases: &[(Vec<Segment>, Kind)], o: &PlanOptions, pause: f64) -> Plan {
    let mut all = Plan { gestures: Vec::new(), segments: Vec::new(), end: o.t0 };
    let rate = o.rate.unwrap_or(1.0);
    let f0 = o.f0.unwrap_or(210.0);
    let accent = o.accent.unwrap_or(0.2);
    let mut t = o.t0;
    for (n, (segs, kind)) in phrases.iter().enumerate() {
        let p = plan_utterance(segs, &PlanOptions { t0: t, intonation: Some(Intonation::Statement), ..o.clone() });
        let first = n == 0;
        // the segment whose acoustic start is `t` (a consonant gesture starts `early` before it)
        let seg_at = |t: f64| p.segments.iter().position(|s| (s.t0 - t).abs() < 0.003);
        let first_seg = p.segments.first();
        let initial_stop = first_seg.is_some_and(|s| s.kind == "stop" && matches!(s.ipa.as_str(), "p" | "t" | "k"));
        let initial_consonant = first_seg.is_some_and(|s| s.kind != "vowel");
        for mut g in p.gestures {
            let label = g.label.map(|l| l.as_str().to_string()).unwrap_or_default();
            if label == "pitch" {
                continue;
            }
            if g.strength == 40.0 && matches!(label.as_str(), "k" | "g" | "ŋ") {
                // a velar closure after a vowel forms 25 ms later and opens 15 ms sooner: the
                // dorsum's slow approach and release otherwise swallow a short vowel next to it
                // (CHIMERA's [kuka] lost its /u/ by ~12 dB; with Finnish /u o/ further back, ~30)
                let after_vowel = seg_at(g.t0 + 0.024).is_some_and(|i| i > 0 && p.segments[i - 1].kind == "vowel");
                if after_vowel {
                    g.t0 += 0.025;
                }
                g.t1 -= 0.015;
            }
            if initial_consonant && label == first_seg.unwrap().ipa && g.t0 <= first_seg.unwrap().t0 + 0.001 {
                // the phrase's first consonant moves into place well before the voice starts:
                // the tongue's travel makes a thump in the airway model, which falls in the
                // silence that `silences` cuts out
                g.t0 -= 0.08;
                g.ramp_in = 0.11;
            }
            if label == "aspiration" {
                if g.targets.get(ControlKey::ABDUCTION).unwrap_or(0.0) > 0.3 {
                    // the planner's English aspiration (VOT 50 ms) → Finnish unaspirated
                    g.targets.set(ControlKey::ABDUCTION, 0.22);
                    g.t1 -= (0.05 / rate - 0.012) * 0.4;
                    g.ramp_out = 0.02;
                }
                // the folds close as the stop opens, so the vowel is voiced from its start (VOT ~15 ms)
                g.t1 -= 0.02;
            }
            if label == "h" {
                // Finnish /h/ hands over to the vowel quickly
                g.t1 -= 0.02;
                g.ramp_out = 0.025;
            }
            if label == "breath" && initial_stop {
                // the pressure builds behind the first closure instead of voicing a vowel before it
                let s0 = first_seg.unwrap().t0;
                g.t0 = g.t0.max(s0 + 0.01);
            }
            if g.strength == 1.0 && VOWELS.contains(&label.as_str()) {
                if let Some(v) = vowel(&label, o.body) {
                    g.targets = targets(&v);
                }
            }
            all.gestures.push(g);
        }
        all.gestures.extend(melody(&p.segments, *kind, f0, accent, first));
        all.segments.extend(p.segments);
        all.end = p.end;
        t = p.end + if *kind == Kind::Continue { pause * 0.6 } else { pause };
    }
    all
}

/// The stretches of `plan` that should be silent (s): before the first
/// phrase and in the pauses between phrases, where only the airway's
/// transients (a tongue moving into place, the end of a breath) would sound.
/// A phrase starting with a consonant keeps 25 ms before it, one starting
/// with a vowel 40 ms (its voice starts as the breath does).
pub fn silences(plan: &Plan) -> Vec<(f64, f64)> {
    let keep = |s: &PlannedSegment| if s.kind == "vowel" { 0.04 } else { 0.025 };
    let mut out = Vec::new();
    let Some(first) = plan.segments.first() else {
        return out;
    };
    out.push((0.0, (first.t0 - keep(first)).max(0.0)));
    for w in plan.segments.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        if b.t0 - a.t1 > 0.15 {
            // the breath ends ~0.1 s after the last segment
            let from = a.t1 + 0.1;
            let to = b.t0 - keep(b);
            if to > from {
                out.push((from, to));
            }
        }
    }
    out
}

/// A point of the pitch contour: (time s, Hz).
type Pt = (f64, f64);

/// The pitch contour of one phrase, as short F0 gestures every 15 ms.
fn melody(segs: &[PlannedSegment], kind: Kind, f0: f64, accent: f64, first_phrase: bool) -> Vec<Gesture> {
    let pts = contour(segs, kind, f0, accent, first_phrase);
    let mut out = Vec::new();
    if pts.is_empty() {
        return out;
    }
    let (a, b) = (pts[0].0 - 0.05, pts[pts.len() - 1].0 + 0.08);
    const STEP: f64 = 0.015;
    let mut t = a;
    while t < b {
        let hz = at(&pts, t + STEP / 2.0);
        out.push(Gesture::new(t, t + STEP, 0.008, 0.008, 1.0, Targets::default().with(ControlKey::F0, hz)).label("pitch"));
        t += STEP;
    }
    out
}

/// The contour's value at `t` (linear between points, level outside them).
fn at(pts: &[Pt], t: f64) -> f64 {
    if t <= pts[0].0 {
        return pts[0].1;
    }
    for w in pts.windows(2) {
        if t <= w[1].0 {
            let f = if w[1].0 > w[0].0 { (t - w[0].0) / (w[1].0 - w[0].0) } else { 1.0 };
            return w[0].1 + f * (w[1].1 - w[0].1);
        }
    }
    pts[pts.len() - 1].1
}

/// The Finnish contour of a phrase's vowels.
///
/// Words are found by their stressed first vowel. Each accented word: low
/// start, a peak at ~70 % of the first syllable's vowel (later in a long
/// one), a fall over the second syllable toward the next word's start.
/// Accent sizes step down word by word. The last word of a statement,
/// exclamation or question falls on to the floor (0.78 × f0) by the end of
/// its last vowel; a phrase before a comma stays level near f0.
fn contour(segs: &[PlannedSegment], kind: Kind, f0: f64, accent: f64, first_phrase: bool) -> Vec<Pt> {
    let vowels: Vec<&PlannedSegment> = segs.iter().filter(|s| s.kind == "vowel").collect();
    if vowels.is_empty() {
        return Vec::new();
    }
    let t_start = segs[0].t0;
    let t_end = vowels[vowels.len() - 1].t1;
    let span = (t_end - t_start).max(0.2);
    // word groups: indices into `vowels` where a stressed vowel starts a word
    let mut groups: Vec<Vec<usize>> = Vec::new();
    for (i, v) in vowels.iter().enumerate() {
        if v.stress == Some(1) || groups.is_empty() {
            groups.push(vec![i]);
        } else {
            groups.last_mut().unwrap().push(i);
        }
    }
    let (acc, top, floor) = match kind {
        Kind::Exclaim => (accent * 1.45, 1.0, 0.76),
        Kind::Question => (accent * 1.1, 1.06, 0.8),
        Kind::Statement => (accent, 1.0, 0.78),
        Kind::Continue => (accent * 0.9, 1.0, 0.95),
    };
    // a later phrase of the sentence starts a little lower
    let top = if first_phrase { top } else { top * 0.96 };
    let base = |t: f64| f0 * top * (1.0 - 0.07 * ((t - t_start) / span).clamp(0.0, 1.0));
    let ng = groups.len();
    let mut pts: Vec<Pt> = Vec::new();
    for (g, idx) in groups.iter().enumerate() {
        let last_group = g == ng - 1;
        let stressed = vowels[idx[0]].stress == Some(1);
        // downstep: 1, 0.78, 0.64 … ; the final accent of a falling phrase a little smaller still
        let mut d = (1.0 - 0.22 * g as f64).max(0.45);
        if last_group && ng > 1 && kind != Kind::Continue {
            d *= 0.85;
        }
        let v0 = vowels[idx[0]];
        let len0 = v0.t1 - v0.t0;
        let peak_t = v0.t0 + len0 * if len0 > 0.13 { 0.55 } else { 0.7 };
        let h = if stressed { base(peak_t) * (1.0 + acc * d) } else { base(peak_t) * (1.0 + acc * 0.1) };
        let onset = base(v0.t0) * (1.0 + acc * d * 0.25);
        // syllable nuclei of the word (a vowel right after a vowel is the same syllable)
        let syl: Vec<usize> = idx.iter().copied().filter(|&i| i == idx[0] || vowels[i].t0 > vowels[i - 1].t1 + 1e-6).collect();
        let w_end = vowels[*idx.last().unwrap()].t1;
        if stressed {
            pts.push((v0.t0, onset));
            pts.push((peak_t, h));
        } else {
            pts.push((v0.t0, h));
        }
        if last_group && kind != Kind::Continue {
            if syl.len() == 1 && idx.len() == 1 {
                // one short syllable ("Hei!", "Nyt!"): peak early, the fall inside the vowel
                pts.pop();
                pts.push((v0.t0 + len0 * 0.3, h));
            }
            pts.push((w_end, f0 * floor));
        } else if last_group {
            // before a comma: down a little, then level
            let mid = if syl.len() > 1 { vowels[syl[1]].t0 } else { (peak_t + w_end) / 2.0 };
            pts.push((mid, base(mid) * (1.0 + acc * d * 0.3)));
            pts.push((w_end, base(w_end) * (1.0 + acc * 0.15)));
        } else {
            // the fall over the second syllable, toward the next word's low start
            let next_t = vowels[groups[g + 1][0]].t0;
            let fall_t = if syl.len() > 1 { vowels[syl[1]].t1 } else { (w_end + next_t) / 2.0 };
            pts.push((fall_t.min(next_t - 0.01).max(peak_t + 0.01), base(fall_t) * (1.0 + acc * d * 0.2)));
        }
    }
    pts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    pts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(t0: f64, t1: f64, stress: u8, kind: &str) -> PlannedSegment {
        PlannedSegment { ipa: "ɑ".into(), t0, t1, stress: Some(stress), kind: kind.into() }
    }

    #[test]
    fn statement_falls_to_the_floor() {
        // two words of two syllables
        let s = vec![seg(0.0, 0.1, 1, "vowel"), seg(0.15, 0.25, 0, "vowel"), seg(0.3, 0.4, 1, "vowel"), seg(0.45, 0.6, 0, "vowel")];
        let p = contour(&s, Kind::Statement, 200.0, 0.25, true);
        let peak1 = p.iter().filter(|x| x.0 < 0.15).map(|x| x.1).fold(0.0, f64::max);
        let peak2 = p.iter().filter(|x| x.0 >= 0.3 && x.0 < 0.45).map(|x| x.1).fold(0.0, f64::max);
        assert!(peak1 > peak2 && peak2 > 200.0, "{p:?}");
        assert!((p.last().unwrap().1 - 156.0).abs() < 1.0, "{p:?}");
    }

    #[test]
    fn vowels_mix() {
        let b: BodyMix = "female".into();
        assert!(vowel("ɑ", b).is_some());
        assert!(vowel("i", b).is_none());
    }
}
