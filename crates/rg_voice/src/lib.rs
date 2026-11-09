// SPDX-License-Identifier: AGPL-3.0-or-later
//! The games' voice: text → speech with CHIMERA (a physical model of the
//! airway, `crates/chimera`), rendered ahead of time into small WAV clips the
//! games play with `rg.say(id)`. Old phones only play them back.
//!
//! Three languages: Finnish (`fi.rs`, our own rules and timing), English
//! (CHIMERA's own English: CMUdict words from `voice/en/*.dict`, its letter-to-
//! sound rules for the rest, its Klatt timing and intonation) and Spanish
//! (`es.rs`, our rules, syllable timing like Finnish).

pub mod es;
pub mod fi;
pub mod piper;
pub mod prosody;

use chimera::anatomy::human::{BODY_CHILD, BODY_FEMALE, BODY_MALE, HumanBody};
use chimera::phonetics::english::EnglishG2P;
use chimera::phonetics::ipa::tokenize_ipa;
use chimera::phonetics::planner::{PhraseInput, PlanOptions, plan_phrases};
use chimera::phonetics::{Intonation, Segment};
use chimera::voice::human_voice::{HumanVoice, SourcePatch};

/// The rate CHIMERA renders at (its airway runs at twice this). 48 kHz as in
/// CHIMERA's own CLI and tests: the airway's grid follows the rate, and the
/// vowel and consonant tables were calibrated at it.
const FS_RENDER: f64 = 48000.0;
/// The clips' rate: half the render rate.
pub const FS_CLIP: u32 = 24000;

#[derive(Clone, Debug)]
pub struct Voice {
    /// "female", "male" or "child"
    pub body: String,
    /// speaking pitch (Hz)
    pub f0: f64,
    /// speaking rate (1 = CHIMERA's normal, <1 slower)
    pub rate: f64,
    /// pitch excursion on stressed syllables (fraction; None = CHIMERA's default 0.14)
    pub accent: Option<f64>,
    /// voice source settings (None = CHIMERA's defaults: breathiness 0.15,
    /// drift 5 (slow pitch wander, cents), roughness 0.1, tension 0.5, vibrato 0)
    pub breathiness: Option<f64>,
    pub drift: Option<f64>,
    pub roughness: Option<f64>,
    pub tension: Option<f64>,
    pub vibrato: Option<f64>,
}

impl Default for Voice {
    fn default() -> Self {
        Voice { body: "female".into(), f0: 215.0, rate: 0.9, accent: None, breathiness: None, drift: None, roughness: None, tension: None, vibrato: None }
    }
}

fn body(name: &str) -> HumanBody {
    match name {
        "male" => BODY_MALE,
        "child" => BODY_CHILD,
        _ => BODY_FEMALE,
    }
}

/// A language of the voice: what turns its text into CHIMERA's segments.
pub enum Lang {
    Fi,
    En(EnglishG2P, std::collections::HashSet<String>),
    Es,
}

impl Lang {
    /// "fi", "en" or "es" (anything else is Finnish). English loads the
    /// pronunciation lists `dicts` (CMUdict lines "word PHONES").
    pub fn new(code: &str, dicts: &[String]) -> Lang {
        match code {
            "en" => {
                let mut g = EnglishG2P::new();
                let mut text = String::new();
                let mut known = std::collections::HashSet::new();
                for d in dicts {
                    for line in d.lines() {
                        let line = line.trim();
                        if line.is_empty() || line.starts_with(";;;") || line.starts_with('#') {
                            continue;
                        }
                        // "word  PHONES" or "word\tPHONES"; "word(2)" variants are left out
                        let mut it = line.splitn(2, |c: char| c == ' ' || c == '\t');
                        let (Some(w), Some(ph)) = (it.next(), it.next()) else {
                            continue;
                        };
                        if w.contains('(') {
                            continue;
                        }
                        let ph = ph.split('#').next().unwrap_or("").trim();
                        text.push_str(&format!("{}\t{}\n", w.to_lowercase(), ph));
                        known.insert(w.to_lowercase());
                    }
                }
                g.load_dict(&text);
                Lang::En(g, known)
            }
            "es" => Lang::Es,
            _ => Lang::Fi,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Lang::Fi => "fi",
            Lang::En(..) => "en",
            Lang::Es => "es",
        }
    }

    /// The phrases of `text` (or of `ipa`, IPA written by hand, phrases
    /// split at `|`), timed for the language.
    pub fn phrases(&self, text: &str, ipa: Option<&str>) -> Vec<PhraseInput> {
        if let Some(ipa) = ipa.filter(|s| !s.trim().is_empty()) {
            let q = text.trim_end().ends_with('?') && !wh_question(self, text);
            return ipa
                .split('|')
                .filter(|p| !p.trim().is_empty())
                .map(|p| {
                    let segs = tokenize_ipa(p.trim());
                    PhraseInput { segments: self.timing(segs), intonation: Some(self.intonation(q)), pause: Some(0.3) }
                })
                .collect();
        }
        match self {
            Lang::Fi => fi::to_phrases(text)
                .iter()
                .map(|p| PhraseInput {
                    segments: finnish_timing(tokenize_ipa(&p.ipa)),
                    // Finnish questions fall like statements (the question word or -ko/-kö
                    // carries the question); CHIMERA's English final rise sounds foreign
                    intonation: Some(Intonation::Statement),
                    pause: Some(0.3),
                })
                .collect(),
            Lang::Es => es::to_phrases(text)
                .iter()
                .map(|p| PhraseInput { segments: spanish_timing(tokenize_ipa(&p.ipa)), intonation: Some(if p.question { Intonation::Question } else { Intonation::Statement }), pause: Some(0.3) })
                .collect(),
            Lang::En(g, _) => g
                .to_phrases(text)
                .into_iter()
                .map(|p| {
                    // "Where is the key?" falls; only yes/no questions rise
                    let wh = p.words.first().is_some_and(|w| EN_WH.split(' ').any(|q| q == w));
                    let intonation = if p.intonation == Intonation::Question && wh { Intonation::Statement } else { p.intonation };
                    PhraseInput { segments: p.segments, intonation: Some(intonation), pause: Some(p.pause) }
                })
                .collect(),
        }
    }

    fn timing(&self, segs: Vec<Segment>) -> Vec<Segment> {
        match self {
            Lang::Fi => finnish_timing(segs),
            Lang::Es => spanish_timing(segs),
            Lang::En(..) => segs,
        }
    }

    fn intonation(&self, question: bool) -> Intonation {
        match self {
            Lang::Fi => Intonation::Statement,
            _ if question => Intonation::Question,
            _ => Intonation::Statement,
        }
    }

    /// The IPA said for `text`, phrases joined by " | ".
    pub fn ipa(&self, text: &str) -> String {
        match self {
            Lang::Fi => ipa(text),
            Lang::Es => es::to_phrases(text).iter().map(|p| format!("{}{}", p.ipa, if p.question { "?" } else { "" })).collect::<Vec<_>>().join(" | "),
            Lang::En(..) => self
                .phrases(text, None)
                .iter()
                .map(|p| {
                    let mut s = String::new();
                    for seg in &p.segments {
                        if seg.stress == Some(1) {
                            s.push('ˈ');
                        }
                        s.push_str(&seg.ipa);
                        if seg.word_end == Some(true) {
                            s.push(' ');
                        }
                    }
                    s.trim_end().to_string()
                })
                .collect::<Vec<_>>()
                .join(" | "),
        }
    }

    /// Words of `text` that the English lists do not have (said by CHIMERA's
    /// letter-to-sound rules, which often miss). Empty for other languages.
    pub fn unknown_words(&self, text: &str) -> Vec<String> {
        let Lang::En(_, known) = self else {
            return Vec::new();
        };
        let mut out: Vec<String> = Vec::new();
        for w in text.to_lowercase().split(|c: char| !(c.is_ascii_lowercase() || c == '\'')) {
            let w = w.trim_matches('\'');
            if !w.is_empty() && !w.chars().all(|c| c.is_ascii_digit()) && !known.contains(w) && !out.iter().any(|o| o == w) {
                out.push(w.to_string());
            }
        }
        out
    }
}

const EN_WH: &str = "where what who which how why when whose";
const ES_WH: [&str; 14] = ["dónde", "donde", "qué", "que", "quién", "cuál", "cómo", "como", "cuánto", "cuántos", "cuántas", "cuantos", "cuándo", "cuando"];

fn wh_question(lang: &Lang, text: &str) -> bool {
    let first = text.trim_start_matches(|c: char| !c.is_alphabetic()).split(|c: char| !c.is_alphabetic()).next().unwrap_or("").to_lowercase();
    match lang {
        Lang::En(..) => EN_WH.split(' ').any(|w| w == first),
        Lang::Es => ES_WH.iter().any(|w| *w == first),
        Lang::Fi => false,
    }
}

/// The IPA the Finnish voice says for `text`, phrases joined by " | ".
pub fn ipa(text: &str) -> String {
    fi::to_phrases(text)
        .iter()
        .map(|p| {
            let end = match p.kind {
                fi::Kind::Question => "?",
                fi::Kind::Exclaim => "!",
                fi::Kind::Continue => ",",
                fi::Kind::Statement => "",
            };
            format!("{}{}", p.ipa, end)
        })
        .collect::<Vec<_>>()
        .join(" | ")
}

/// Finnish `text` said by `voice`: mono samples at [`FS_CLIP`], trimmed,
/// peak 0.9. Empty when there is nothing to say.
pub fn say(text: &str, voice: &Voice) -> Vec<f32> {
    say_in(&Lang::Fi, text, None, voice)
}

/// `text` in `lang` (or the hand-written `ipa`) said by `voice`.
pub fn say_in(lang: &Lang, text: &str, ipa: Option<&str>, voice: &Voice) -> Vec<f32> {
    let o = plan_options(voice);
    match lang {
        Lang::Fi => {
            let phrases = fi_phrases(text, ipa);
            if phrases.is_empty() {
                return Vec::new();
            }
            let plan = prosody::plan(&phrases, &PlanOptions { t0: 0.15, ..o }, 0.3);
            let mut x = synth_raw(&plan, voice);
            silence(&mut x, &prosody::silences(&plan));
            finish(&x)
        }
        _ => {
            let inputs = lang.phrases(text, ipa);
            if inputs.is_empty() {
                return Vec::new();
            }
            synth(&plan_phrases(&inputs, &o), voice)
        }
    }
}

/// Finnish phrases timed, each with how it ends (hand-written IPA: phrases
/// split at `|`, the last one ending as the text does).
pub fn fi_phrases(text: &str, ipa: Option<&str>) -> Vec<(Vec<Segment>, fi::Kind)> {
    if let Some(ipa) = ipa.filter(|s| !s.trim().is_empty()) {
        let end = match text.trim_end().chars().last() {
            Some('?') => fi::Kind::Question,
            Some('!') => fi::Kind::Exclaim,
            _ => fi::Kind::Statement,
        };
        let parts: Vec<&str> = ipa.split('|').filter(|p| !p.trim().is_empty()).collect();
        let n = parts.len();
        return parts.into_iter().enumerate().map(|(i, p)| (finnish_timing(tokenize_ipa(p.trim())), if i + 1 == n { end } else { fi::Kind::Continue })).collect();
    }
    fi::to_phrases(text).iter().map(|p| (finnish_timing(tokenize_ipa(&p.ipa)), p.kind)).collect()
}

fn plan_options(voice: &Voice) -> PlanOptions {
    PlanOptions { body: voice.body.as_str().into(), t0: 0.05, f0: Some(voice.f0), rate: Some(voice.rate), accent: voice.accent, ..Default::default() }
}

fn synth(plan: &chimera::phonetics::Plan, voice: &Voice) -> Vec<f32> {
    finish(&synth_raw(plan, voice))
}

/// Zeroes the stretches `spans` (s) of `x`, with 10 ms fades at their edges.
fn silence(x: &mut [f32], spans: &[(f64, f64)]) {
    let fs = FS_CLIP as f64;
    let fade = (0.01 * fs) as usize;
    for &(a, b) in spans {
        let (i, j) = (((a * fs) as usize).min(x.len()), ((b * fs) as usize).min(x.len()));
        if j <= i {
            continue;
        }
        for k in i..j {
            // fade out over the first 10 ms (not at the clip's start) and in over the last 10 ms
            let out = if i > 0 && k < i + fade { 1.0 - (k - i) as f32 / fade as f32 } else { 0.0 };
            let inn = if j < x.len() && k + fade >= j { 1.0 - (j - k) as f32 / fade as f32 } else { 0.0 };
            x[k] *= out.max(inn);
        }
    }
}

/// The Finnish plan of `text` (for measurements: `examples/fi_lab.rs`).
pub fn plan_fi(text: &str, voice: &Voice) -> chimera::phonetics::Plan {
    prosody::plan(&fi_phrases(text, None), &PlanOptions { t0: 0.15, ..plan_options(voice) }, 0.3)
}

/// `plan` rendered at [`FS_CLIP`], untrimmed (time 0 = the plan's time 0).
pub fn synth_raw(plan: &chimera::phonetics::Plan, voice: &Voice) -> Vec<f32> {
    let mut v = HumanVoice::new(FS_RENDER, body(&voice.body), 2);
    v.set_source(&SourcePatch {
        f0: Some(voice.f0),
        breathiness: voice.breathiness,
        drift: voice.drift,
        roughness: voice.roughness,
        tension: voice.tension,
        vibrato_depth: voice.vibrato,
        ..Default::default()
    });
    v.schedule(&plan.gestures);
    let total = (FS_RENDER * (plan.end + 0.3)).round() as usize;
    let mut out = vec![0f32; total];
    for block in out.chunks_mut(128) {
        v.render(block);
    }
    halve(&out)
}

/// Spanish segment durations (s, before the rate). Spanish is syllable-timed
/// like Finnish but has no long sounds: every vowel keeps its full quality,
/// the stressed one is a little longer, the phrase's last vowel longer still;
/// the tap [ɾ] is very short and the trill [r] long.
fn spanish_timing(mut segs: Vec<Segment>) -> Vec<Segment> {
    let n = segs.len();
    let vowel: Vec<bool> = segs.iter().map(|s| is_v(&s.ipa) || s.ipa == "a").collect();
    let last_vowel = (0..n).rev().find(|&i| vowel[i]);
    let mut word_start = true;
    for i in 0..n {
        if segs[i].ipa == "_" {
            word_start = true;
            continue;
        }
        let d = if vowel[i] {
            let mut d = if segs[i].stress == Some(1) { 0.105 } else { 0.075 };
            if Some(i) == last_vowel {
                d *= 1.4;
            }
            d
        } else {
            let mut d: f64 = match segs[i].ipa.as_str() {
                "p" | "t" | "k" | "b" | "d" | "g" => 0.07,
                "β" | "ð" | "ɣ" => 0.05,
                "s" | "f" | "θ" | "x" => 0.09,
                "tʃ" => 0.12,
                "ɾ" => 0.03,
                "r" => 0.1,
                "j" | "w" => 0.045,
                "m" | "n" | "ŋ" | "ɲ" | "l" | "ʝ" => 0.06,
                _ => 0.055,
            };
            if word_start {
                d *= 1.1;
            }
            d
        };
        segs[i].dur = Some(d);
        word_start = segs[i].word_end == Some(true);
    }
    segs
}

fn is_v(ipa: &str) -> bool {
    ipa.chars().count() == 1 && "iyueoøæɑa".contains(ipa)
}

/// Finnish segment durations (s, before the rate), replacing CHIMERA's
/// English (Klatt) rules, which shorten unstressed and non-final vowels hard
/// and so blur the Finnish short/long contrast. Finnish is close to
/// syllable-timed: short vowels stay full in every syllable, a long sound is
/// about twice a short one, the vowel after a short stressed syllable
/// (CV.CV, `ka-la`) is half-long, and the phrase's last syllable is a little
/// longer. `ː` from the tokenizer (a `dur` already set) marks a long sound.
fn finnish_timing(mut segs: Vec<Segment>) -> Vec<Segment> {
    let n = segs.len();
    let long: Vec<bool> = segs.iter().map(|s| s.dur.is_some()).collect();
    let vowel: Vec<bool> = segs.iter().map(|s| is_v(&s.ipa)).collect();
    let last_vowel = (0..n).rev().find(|&i| vowel[i]);
    let mut word_start = true;
    // the word's syllable count so far (by vowel nuclei), and whether its first syllable was light (CV)
    let mut nucleus = 0;
    let mut first_light = false;
    for i in 0..n {
        if segs[i].ipa == "_" {
            word_start = true;
            continue;
        }
        if word_start {
            nucleus = 0;
            first_light = false;
        }
        let next_v = i + 1 < n && vowel[i + 1];
        let prev_v = i > 0 && vowel[i - 1] && !word_start;
        let d = if vowel[i] {
            if !prev_v {
                nucleus += 1;
            }
            let mut d = if long[i] {
                if nucleus == 1 { 0.165 } else { 0.145 }
            } else if prev_v {
                0.07 // second half of a diphthong (ai, ie, uo …)
            } else if next_v {
                0.08
            } else if nucleus == 1 {
                0.085
            } else if nucleus == 2 && first_light {
                0.105 // half-long after a short stressed syllable
            } else {
                0.08
            };
            if nucleus == 1 && !long[i] && !next_v {
                // a light first syllable: the vowel is short and the next consonant is single
                let k = i + 1;
                first_light = k < n && !vowel[k] && !long[k] && !(k + 1 < n && !vowel[k + 1] && segs[k + 1].ipa != "_" && segs[k].word_end != Some(true));
            }
            if Some(i) == last_vowel {
                d *= 1.35;
            }
            d
        } else {
            let c = segs[i].ipa.as_str();
            let (short, gem) = match c {
                "p" | "t" | "k" | "b" | "d" | "g" => (0.07, 0.165),
                "s" | "f" | "ʃ" => (0.095, 0.175),
                "ts" => (0.13, 0.18),
                "h" => (0.06, 0.12),
                "r" => (0.065, 0.13),
                "m" | "n" | "ŋ" | "l" => (0.06, 0.125),
                _ => (0.055, 0.11),
            };
            let mut d = if long[i] { gem } else { short };
            if word_start {
                d *= 1.1;
            }
            d
        };
        segs[i].dur = Some(d);
        word_start = segs[i].word_end == Some(true);
    }
    segs
}

/// 48 kHz → 24 kHz: a windowed-sinc low-pass at 10.5 kHz, every second sample.
fn halve(x: &[f32]) -> Vec<f32> {
    const N: usize = 63;
    let fc = 10500.0 / FS_RENDER;
    let mut h = [0f64; N];
    let mut sum = 0.0;
    for (k, hk) in h.iter_mut().enumerate() {
        let m = k as f64 - (N as f64 - 1.0) / 2.0;
        let sinc = if m == 0.0 { 2.0 * fc } else { (2.0 * std::f64::consts::PI * fc * m).sin() / (std::f64::consts::PI * m) };
        let a = 2.0 * std::f64::consts::PI * k as f64 / (N as f64 - 1.0);
        let w = 0.42 - 0.5 * a.cos() + 0.08 * (2.0 * a).cos();
        *hk = sinc * w;
        sum += *hk;
    }
    let mut out = Vec::with_capacity(x.len() / 2 + 1);
    let mut i = 0;
    while i < x.len() {
        let mut acc = 0.0;
        for (k, hk) in h.iter().enumerate() {
            let j = i as isize + k as isize - (N as isize - 1) / 2;
            if j >= 0 && (j as usize) < x.len() {
                acc += hk / sum * x[j as usize] as f64;
            }
        }
        out.push(acc as f32);
        i += 2;
    }
    out
}

/// Silence trimmed (40 ms kept before, 80 ms after), peak to 0.9, 5 ms fades.
fn finish(x: &[f32]) -> Vec<f32> {
    finish_at(x, FS_CLIP)
}

/// [`finish`] for samples at `rate` (Hz).
pub fn finish_at(x: &[f32], rate: u32) -> Vec<f32> {
    let peak = x.iter().fold(0f32, |m, s| m.max(s.abs()));
    if peak <= 0.0 {
        return Vec::new();
    }
    let gate = peak * 0.02;
    let first = x.iter().position(|s| s.abs() > gate).unwrap_or(0);
    let last = x.iter().rposition(|s| s.abs() > gate).unwrap_or(x.len() - 1);
    let fs = rate as usize;
    let a = first.saturating_sub(fs * 40 / 1000);
    let b = (last + fs * 80 / 1000).min(x.len());
    let g = 0.9 / peak;
    let mut out: Vec<f32> = x[a..b].iter().map(|s| s * g).collect();
    let fade = (fs * 5 / 1000).min(out.len() / 2);
    let n = out.len();
    for i in 0..fade {
        let f = i as f32 / fade as f32;
        out[i] *= f;
        out[n - 1 - i] *= f;
    }
    out
}

/// 16-bit mono PCM WAV.
pub fn wav(samples: &[f32], rate: u32) -> Vec<u8> {
    let data = samples.len() as u32 * 2;
    let mut b = Vec::with_capacity(44 + data as usize);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + data).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&rate.to_le_bytes());
    b.extend_from_slice(&(rate * 2).to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data.to_le_bytes());
    for s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        b.extend_from_slice(&v.to_le_bytes());
    }
    b
}

/// G.711 μ-law of one sample (−1…1).
fn mulaw(s: f32) -> u8 {
    const BIAS: i32 = 0x84;
    let mut x = (s.clamp(-1.0, 1.0) * 32767.0).round() as i32;
    let sign = if x < 0 {
        x = -x;
        0x80
    } else {
        0
    };
    x = (x + BIAS).min(32635 + BIAS);
    let mut exp = 7;
    let mut mask = 0x4000;
    while exp > 0 && x & mask == 0 {
        exp -= 1;
        mask >>= 1;
    }
    let mant = (x >> (exp + 3)) & 0x0f;
    !(sign | (exp << 4) | mant) as u8
}

/// 8-bit μ-law mono WAV (format 7): half the size of 16-bit PCM, telephone
/// quality, which is plenty for speech. The hosts decode it themselves
/// (web/js/audio.js, android Sound.java).
pub fn wav_mulaw(samples: &[f32], rate: u32) -> Vec<u8> {
    let data = samples.len() as u32;
    let pad = data & 1;
    let mut b = Vec::with_capacity(58 + data as usize + 1);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(50 + data + pad).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&18u32.to_le_bytes());
    b.extend_from_slice(&7u16.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&rate.to_le_bytes());
    b.extend_from_slice(&rate.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&8u16.to_le_bytes());
    b.extend_from_slice(&0u16.to_le_bytes());
    b.extend_from_slice(b"fact");
    b.extend_from_slice(&4u32.to_le_bytes());
    b.extend_from_slice(&data.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data.to_le_bytes());
    for s in samples {
        b.push(mulaw(*s));
    }
    if pad == 1 {
        b.push(0);
    }
    b
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unmulaw(u: u8) -> f32 {
        let u = !u;
        let t = ((((u & 0x0f) as i32) << 3) + 0x84) << ((u & 0x70) >> 4);
        (if u & 0x80 != 0 { 0x84 - t } else { t - 0x84 }) as f32 / 32768.0
    }

    #[test]
    fn mulaw_round_trip() {
        for i in -100..=100 {
            let s = i as f32 / 100.0;
            let back = unmulaw(mulaw(s));
            assert!((back - s).abs() <= 0.02 + s.abs() * 0.04, "{s} -> {back}");
        }
        assert_eq!(mulaw(0.0), 0xff);
    }

    #[test]
    fn says_something() {
        let pcm = say("Hyvä!", &Voice::default());
        let secs = pcm.len() as f64 / FS_CLIP as f64;
        assert!(secs > 0.3 && secs < 1.5, "{secs} s");
        let peak = pcm.iter().fold(0f32, |m, s| m.max(s.abs()));
        assert!((peak - 0.9).abs() < 0.01);
    }
}
