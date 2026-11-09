//! Measurements of the Finnish voice (development aid):
//!   cargo run --release --example fi_lab -- vowels       formants of steady vowels
//!   cargo run --release --example fi_lab -- pitch "Hyvä!"  the pitch track, every 20 ms
use chimera::analysis::lpc::{FormantOpts, estimate_formants};
use chimera::analysis::pitch::{YinOpts, yin_pitch};
use rg_voice::{FS_CLIP, Lang, Voice, plan_fi, say_in, synth_raw};

fn voice() -> Voice {
    Voice { body: "female".into(), f0: 225.0, rate: 0.9, accent: Some(0.25), breathiness: Some(0.28), drift: Some(10.0), roughness: Some(0.05), tension: Some(0.42), vibrato: None }
}

/// 24 kHz → 8 kHz (windowed-sinc low-pass at 3.6 kHz), for LPC of F1–F2.
fn to8k(x: &[f32]) -> Vec<f32> {
    const N: usize = 61;
    let fc = 3600.0 / FS_CLIP as f64;
    let h: Vec<f64> = (0..N)
        .map(|k| {
            let m = k as f64 - 30.0;
            let s = if m == 0.0 { 2.0 * fc } else { (2.0 * std::f64::consts::PI * fc * m).sin() / (std::f64::consts::PI * m) };
            s * (0.54 - 0.46 * (2.0 * std::f64::consts::PI * k as f64 / 60.0).cos())
        })
        .collect();
    let mut out = Vec::new();
    let mut i = 30;
    while i + 30 < x.len() {
        out.push(h.iter().enumerate().map(|(k, hk)| hk * x[i + k - 30] as f64).sum::<f64>() as f32);
        i += 3;
    }
    out
}

fn formants(x: &[f32]) -> Vec<f64> {
    // 40 ms frames of the clip's middle third at 8 kHz, median per formant
    let x = &to8k(x)[..];
    let n = x.len();
    let fs = 8000.0;
    let w = (0.04 * fs) as usize;
    let mut all: Vec<Vec<f64>> = vec![Vec::new(); 3];
    let mut i = n / 3;
    while i + w < 2 * n / 3 {
        let fr: Vec<f64> = x[i..i + w].iter().map(|s| *s as f64).collect();
        let f = estimate_formants(&fr, fs, FormantOpts { order: Some(10), max_bw: Some(300.0), min_freq: Some(200.0), ..Default::default() });
        if std::env::var("POLES").is_ok() && i == n / 2 - (n / 2 - n / 3) % (w / 2) {
            eprintln!("{:?}", f.iter().map(|x| (x.freq as i32, x.bw as i32)).collect::<Vec<_>>());
        }
        for k in 0..3 {
            if let Some(fk) = f.get(k) {
                all[k].push(fk.freq);
            }
        }
        i += w / 2;
    }
    all.iter_mut()
        .map(|v| {
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            if v.is_empty() { 0.0 } else { v[v.len() / 2] }
        })
        .collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut v = voice();
    match args.get(1).map(String::as_str) {
        Some("vowels") => {
            v.rate = 0.35;
            v.drift = Some(0.0);
            v.f0 = 100.0;
            v.breathiness = Some(0.1);
            let lang = if args.get(2).is_some_and(|a| a == "orig") { Lang::Es } else { Lang::Fi };
            for ipa in ["i", "y", "u", "e", "ø", "o", "æ", "ɑ"] {
                let x = say_in(&lang, "", Some(&format!("ˈ{ipa}ː")), &v);
                let f = formants(&x);
                println!("{ipa}  F1 {:5.0}  F2 {:5.0}  F3 {:5.0}", f[0], f[1], f[2]);
            }
        }
        Some("pitch") => {
            let text = args.get(2).cloned().unwrap_or("Hyvä!".into());
            let x = say_in(&Lang::Fi, &text, None, &v);
            let fs = FS_CLIP as f64;
            let w = (0.03 * fs) as usize;
            let hop = (0.02 * fs) as usize;
            let mut i = 0;
            let mut line = String::new();
            while i + w < x.len() {
                let fr: Vec<f64> = x[i..i + w].iter().map(|s| *s as f64).collect();
                let p = yin_pitch(&fr, fs, YinOpts { min_f0: Some(80.0), max_f0: Some(500.0), threshold: Some(0.2) });
                line.push_str(&if p.f0 > 0.0 { format!("{:.0} ", p.f0) } else { "- ".into() });
                i += hop;
            }
            println!("{}", line);
        }
        Some("seg") => {
            // every planned segment with its level (dB re the loudest vowel)
            let text = args.get(2).cloned().unwrap_or("Kokeile.".into());
            let plan = plan_fi(&text, &v);
            let x = synth_raw(&plan, &v);
            let fs = FS_CLIP as f64;
            let rms = |a: f64, b: f64| {
                let (i, j) = (((a * fs) as usize).min(x.len()), ((b * fs) as usize).min(x.len()));
                if j <= i {
                    return -120.0;
                }
                let e: f64 = x[i..j].iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / (j - i) as f64;
                10.0 * e.max(1e-12).log10()
            };
            let top = plan.segments.iter().filter(|s| s.kind == "vowel").map(|s| rms(s.t0, s.t1)).fold(-120.0, f64::max);
            for s in &plan.segments {
                print!("{}:{:.0}{} ", s.ipa, rms(s.t0, s.t1) - top, if s.kind == "vowel" { "" } else { "c" });
            }
            println!();
            if std::env::var("FRAMES").is_ok() {
                let mut t = 0.0;
                while t < plan.end + 0.1 {
                    let seg = plan.segments.iter().find(|s| s.t0 <= t && t < s.t1).map(|s| s.ipa.as_str()).unwrap_or(".");
                    print!("{:.2}{}{:.0} ", t, seg, rms(t, t + 0.01) - top);
                    t += 0.01;
                }
                println!();
            }
        }
        Some("dump") => dump(args.get(2).map(String::as_str).unwrap_or("Kuka.")),
        _ => eprintln!("vowels | pitch <text> | seg <text>"),
    }
}
#[allow(dead_code)]
fn dump(text: &str) {
    let plan = plan_fi(text, &voice());
    for g in plan.gestures.iter().filter(|g| g.t0 < 0.2) {
        let l = g.label.map(|l| l.as_str().to_string()).unwrap_or_default();
        if l != "pitch" {
            println!("{l} {:.3}-{:.3} r{:.3}/{:.3} s{}", g.t0, g.t1, g.ramp_in, g.ramp_out, g.strength);
        }
    }
    for s in plan.segments.iter().take(3) {
        println!("{} {} {:.3}", s.ipa, s.kind, s.t0);
    }
}
