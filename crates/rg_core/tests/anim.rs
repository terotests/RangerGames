use rg_core::anim::{self, Anims};
use rg_core::clock::{Clock, FrameClock};
use rg_core::easing;
use rg_core::json::{self, Json};

fn near(a: f64, b: f64, eps: f64) -> bool {
    (a - b).abs() <= eps
}

#[test]
fn easing_css() {
    // CSS "ease" at 0.5 (as browsers give it)
    assert!(near(easing::parse("ease").at(0.5), 0.8024033877, 1e-5));
    assert!(near(easing::parse("ease-in-out").at(0.5), 0.5, 1e-6));
    assert!(near(easing::parse("cubic-bezier(0,0,1,1)").at(0.3), 0.3, 1e-6));
    assert_eq!(easing::parse("linear").at(0.25), 0.25);
    // steps
    assert_eq!(easing::parse("steps(4)").at(0.3), 0.25);
    assert_eq!(easing::parse("steps(4, jump-start)").at(0.3), 0.5);
    assert_eq!(easing::parse("steps(5, jump-none)").at(0.5), 0.5);
    assert_eq!(easing::parse("step-end").at(0.99), 0.0);
    assert_eq!(easing::parse("step-start").at(0.01), 1.0);
    // linear() with a percentage and a missing input
    let l = easing::parse("linear(0, 0.25 75%, 1)");
    assert!(near(l.at(0.75), 0.25, 1e-9));
    assert!(near(l.at(0.875), 0.625, 1e-9));
    let l2 = easing::parse("linear(0, 0.5, 1)");
    assert!(near(l2.at(0.25), 0.25, 1e-9));
    // Penner / GSAP names
    assert!(near(easing::parse("power1.in").at(0.5), 0.25, 1e-9));
    assert!(near(easing::parse("power2.out").at(0.5), 0.875, 1e-9));
    assert!(near(easing::parse("power1.inOut").at(0.25), 0.125, 1e-9));
    assert!(near(easing::parse("bounce.out").at(1.0), 1.0, 1e-9));
    assert!(easing::parse("back.out(2)").at(0.6) > 1.0);
    assert!(near(easing::parse("elastic.out").at(1.0), 1.0, 1e-9));
    assert!(near(easing::parse("sine.inOut").at(0.5), 0.5, 1e-9));
}

#[test]
fn timing_standard() {
    let t = anim::timing_of(&json::parse(r#"{"duration":1000,"iterations":3,"direction":"alternate","fill":"forwards"}"#), anim::FILL_NONE);
    assert_eq!(t.active_duration(), 3000.0);
    let c = anim::compute(&t, 250.0, false);
    assert!(c.on && near(c.progress, 0.25, 1e-9) && c.iteration == 0.0);
    let c = anim::compute(&t, 1250.0, false);
    assert!(near(c.progress, 0.75, 1e-9) && c.iteration == 1.0);
    // after the end, filling forwards: the last iteration's end (odd count: forwards)
    let c = anim::compute(&t, 5000.0, false);
    assert!(c.on && c.phase == 2 && near(c.progress, 1.0, 1e-9) && c.iteration == 2.0);
    // no fill: nothing after the end, nothing before a delay
    let t2 = anim::timing_of(&json::parse(r#"{"duration":500,"delay":100}"#), anim::FILL_NONE);
    assert!(!anim::compute(&t2, 50.0, false).on);
    assert!(!anim::compute(&t2, 700.0, false).on);
    assert!(anim::compute(&t2, 100.0, false).on);
}

#[test]
fn values_mix() {
    let a = anim::value_of(&Json::Str("translate(0px, 10px) scale(1)".to_string()));
    let b = anim::value_of(&Json::Str("translate(100px, -10px) scale(2)".to_string()));
    let m = anim::value_json(&anim::mix(&a, &b, 0.5));
    assert_eq!(m.as_str(), "translate(50px, 0px) scale(1.5)");
    let c1 = anim::value_of(&Json::Str("#ff0000".to_string()));
    let c2 = anim::value_of(&Json::Str("rgb(0, 0, 255)".to_string()));
    assert_eq!(anim::value_json(&anim::mix(&c1, &c2, 0.5)).as_str(), "rgb(128, 0, 128)");
    // different shapes switch half-way
    let x = anim::value_of(&Json::Str("block".to_string()));
    let y = anim::value_of(&Json::Str("none".to_string()));
    assert_eq!(anim::value_json(&anim::mix(&x, &y, 0.4)).as_str(), "block");
    assert_eq!(anim::value_json(&anim::mix(&x, &y, 0.6)).as_str(), "none");
}

fn out_num(out: &Vec<Json>, prop: &str) -> f64 {
    let mut v = f64::NAN;
    for o in out.iter() {
        let it = o.items();
        if it[1].as_str() == prop {
            v = it[2].as_num(f64::NAN);
        }
    }
    v
}

#[test]
fn element_animate() {
    let mut w = Anims::new();
    let id = w.request(&json::parse(r#"{"op":"anim","target":1,"props":[{"name":"x","kfs":[{"o":null,"v":0},{"o":null,"v":100}]}],"timing":{"duration":1000,"easing":"linear"}}"#)).as_num(0.0) as i64;
    let out = w.advance(250.0);
    assert!(near(out_num(&out, "x"), 25.0, 1e-9));
    w.request(&json::parse(&format!(r#"{{"op":"ctl","id":{},"do":"pause"}}"#, id)));
    let out = w.advance(500.0);
    assert!(near(out_num(&out, "x"), 25.0, 1e-9));
    w.request(&json::parse(&format!(r#"{{"op":"ctl","id":{},"do":"play"}}"#, id)));
    let out = w.advance(750.0);
    // finished, no fill: the effect no longer applies
    assert!(out_num(&out, "x").is_nan());
    let f = w.frame_json(out);
    assert!(f.write().contains("\"finish\""));
    // reverse from the end
    w.request(&json::parse(&format!(r#"{{"op":"ctl","id":{},"do":"reverse"}}"#, id)));
    let out = w.advance(100.0);
    assert!(near(out_num(&out, "x"), 90.0, 1e-9));
}

#[test]
fn frame_rate_independent() {
    // the same animation sampled at 30 and at 90 frames a second agrees at the same time
    let mk = |w: &mut Anims| {
        w.request(&json::parse(r#"{"op":"anim","target":1,"props":[{"name":"x","kfs":[{"v":0},{"v":1}]}],"timing":{"duration":900,"easing":"ease-in-out","fill":"forwards"}}"#));
    };
    let mut a = Anims::new();
    let mut b = Anims::new();
    mk(&mut a);
    mk(&mut b);
    let mut va = 0.0;
    let mut vb = 0.0;
    for _ in 0..15 {
        va = out_num(&a.advance(1000.0 / 30.0), "x");
    }
    for _ in 0..45 {
        vb = out_num(&b.advance(1000.0 / 90.0), "x");
    }
    assert!(near(va, vb, 1e-9));
    // springs too: solved exactly per step
    let mut s1 = Anims::new();
    let mut s2 = Anims::new();
    let sp = r#"{"op":"spring","target":2,"prop":"y","value":0,"to":100,"stiffness":170,"damping":12}"#;
    s1.request(&json::parse(sp));
    s2.request(&json::parse(sp));
    let mut y1 = 0.0;
    let mut y2 = 0.0;
    for _ in 0..12 {
        y1 = out_num(&s1.advance(1000.0 / 30.0), "y");
    }
    for _ in 0..36 {
        y2 = out_num(&s2.advance(1000.0 / 90.0), "y");
    }
    assert!(near(y1, y2, 1e-6), "{} {}", y1, y2);
    assert!(near(anim::follow(0.0, 100.0, 100.0, 100.0), 50.0, 1e-9));
    let mut f = 0.0;
    for _ in 0..10 {
        f = anim::follow(f, 100.0, 100.0, 10.0);
    }
    assert!(near(f, 50.0, 1e-9));
}

fn events(w: &mut Anims) -> Vec<Json> {
    let f = w.frame_json(Vec::new());
    f.get("e").items()
}

#[test]
fn sequence_positions_and_sounds() {
    let mut w = Anims::new();
    let s = w.request(&json::parse(r#"{"op":"seq"}"#)).as_num(0.0) as i64;
    let add = |w: &mut Anims, j: String| w.request(&json::parse(&j)).as_num(0.0) as i64;
    let t1 = add(&mut w, format!(r#"{{"op":"add","seq":{},"kind":"tween","target":1,"props":[{{"name":"x","to":true,"from":0,"kfs":[{{"v":100}}]}}],"timing":{{"duration":1000}}}}"#, s));
    let t2 = add(&mut w, format!(r#"{{"op":"add","seq":{},"kind":"tween","target":1,"props":[{{"name":"x","to":true,"from":0,"kfs":[{{"v":200}}]}}],"timing":{{"duration":1000}}}}"#, s));
    let snd = add(&mut w, format!(r#"{{"op":"add","seq":{},"kind":"sound","path":"/a.wav","pos":"<"}}"#, s));
    let gap = add(&mut w, format!(r#"{{"op":"add","seq":{},"kind":"gap","dur":5000,"name":"tauko"}}"#, s));
    let call = add(&mut w, format!(r#"{{"op":"add","seq":{},"kind":"call"}}"#, s));
    assert!(t1 > 0 && t2 > 0 && gap > 0);
    // the sound (with the second tween, at 1000) has no length yet: the
    // sequence waits at 1000, the first tween at its end
    let out = w.advance(1500.0);
    assert!(near(out_num(&out, "x"), 100.0, 1e-9), "{}", out_num(&out, "x"));
    events(&mut w);
    let info = w.info(s);
    assert!(info.get("holding").as_bool());
    let held = info.get("t").as_num(0.0);
    w.advance(500.0);
    assert!(near(w.info(s).get("t").as_num(0.0), held, 1e-9));
    assert_eq!(w.unknown_sounds().len(), 1);
    // it loads: 800 ms long
    w.sound_length(s, snd, 800.0);
    // the frame after: the sound starts from its beginning, then on
    w.advance(16.0);
    let ev = events(&mut w);
    assert!(ev.iter().any(|e| e.items()[0].as_str() == "sound" && e.items()[2].as_num(0.0) as i64 == snd && e.items()[4].as_num(1.0) == 0.0));
    let out = w.advance(500.0);
    // the second "to" starts from the first one's end
    assert!(near(out_num(&out, "x"), 150.0, 1e-9), "{}", out_num(&out, "x"));
    // the gap is cancelled while under way: the call comes at once after it
    w.advance(2000.0);
    w.request(&json::parse(&format!(r#"{{"op":"entry","seq":{},"entry":"tauko","do":"cancel"}}"#, s)));
    w.advance(16.0);
    let ev = events(&mut w);
    assert!(ev.iter().any(|e| e.items()[0].as_str() == "call" && e.items()[2].as_num(0.0) as i64 == call), "{:?}", ev.iter().map(|e| e.write()).collect::<Vec<_>>());
}

#[test]
fn sequence_timeout_and_pause() {
    let mut w = Anims::new();
    let s = w.request(&json::parse(r#"{"op":"seq"}"#)).as_num(0.0) as i64;
    let a = w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"sound","path":"/missing.wav","timeout":300}}"#, s))).as_num(0.0) as i64;
    let b = w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"sound","path":"/b.wav","dur":1000}}"#, s))).as_num(0.0) as i64;
    w.advance(16.0);
    assert!(w.info(s).get("holding").as_bool());
    for _ in 0..25 {
        w.advance(16.0);
    }
    w.advance(16.0);
    let ev = events(&mut w);
    assert!(ev.iter().any(|e| e.items()[0].as_str() == "timeout" && e.items()[2].as_num(0.0) as i64 == a));
    assert!(ev.iter().any(|e| e.items()[0].as_str() == "sound" && e.items()[2].as_num(0.0) as i64 == b));
    w.request(&json::parse(&format!(r#"{{"op":"ctl","id":{},"do":"pause"}}"#, s)));
    w.advance(16.0);
    let ev = events(&mut w);
    assert!(ev.iter().any(|e| e.items()[0].as_str() == "soundpause"));
    w.request(&json::parse(&format!(r#"{{"op":"ctl","id":{},"do":"play"}}"#, s)));
    w.advance(16.0);
    let ev = events(&mut w);
    assert!(ev.iter().any(|e| e.items()[0].as_str() == "soundresume"));
    w.request(&json::parse(&format!(r#"{{"op":"ctl","id":{},"do":"seek","t":100}}"#, s)));
    w.advance(16.0);
    let ev = events(&mut w);
    let kinds: Vec<String> = ev.iter().map(|e| e.items()[0].as_str()).collect();
    assert!(kinds.contains(&"soundstop".to_string()) && kinds.contains(&"sound".to_string()), "{:?}", kinds);
}

#[test]
fn frame_clock_carry() {
    // a 60 Hz display, frames of ~20 ms of work (shown every one or two vsyncs)
    let mut c = FrameClock::new();
    let p = 1000.0 / 60.0;
    let mut t = 0.0;
    let mut sum = 0.0;
    c.frame_vsync(t, p);
    for i in 0..600 {
        t += if i % 3 == 0 { 2.0 * p } else { p } + if i % 2 == 0 { 0.7 } else { -0.7 };
        let dt = c.frame_vsync(t, p);
        // always whole display frames
        let n = (dt / p).round();
        assert!(near(dt, n * p, 1e-9));
        sum += dt;
    }
    // and no drift from the wall clock
    assert!((sum - t).abs() < p, "{} {}", sum, t);
    // a stall is cut and counted
    let before = c.lost;
    t += 900.0;
    let dt = c.frame_vsync(t, p);
    assert!(dt <= anim::INF && dt <= 101.0 && c.lost > before + 700.0);
    // without the period: estimated from the steps
    let mut e = FrameClock::new();
    let mut tt = 0.0;
    for i in 0..300 {
        tt += if i % 4 == 0 { 22.2 } else { 11.1 };
        e.frame_dt(if i % 4 == 0 { 22.2 } else { 11.1 });
    }
    assert!(near(e.period, 11.1, 0.2), "{}", e.period);
    let _ = tt;
}

#[test]
fn clock_glide() {
    let mut c = Clock::new("sim", 1.0);
    c.set_rate(100.0, 1000.0, true);
    let mut a = Clock::new("sim", 1.0);
    a.set_rate(100.0, 1000.0, true);
    for _ in 0..30 {
        c.advance(1000.0 / 30.0);
    }
    for _ in 0..90 {
        a.advance(1000.0 / 90.0);
    }
    assert!(near(c.rate, 100.0, 1e-9));
    assert!((c.time - a.time).abs() / a.time < 0.01, "{} {}", c.time, a.time);
}

/// The scenario tests/rg_core_js.cjs runs on Ranger's JavaScript: the same
/// frames must come out (printed with --nocapture to compare).
pub fn parity_frames() -> Vec<String> {
    let mut w = Anims::new();
    w.request(&json::parse(r##"{"op":"anim","target":1,"props":[{"name":"x","kfs":[{"v":"#000000"},{"v":"#ff0000"}]}],"timing":{"duration":1000}}"##));
    w.request(&json::parse(r##"{"op":"anim","target":1,"props":[{"name":"y","kfs":[{"v":"translate(0px, 10px)"},{"v":"translate(100px, -10px)"}]}],"timing":{"duration":1000,"easing":"ease"}}"##));
    w.request(&json::parse(r#"{"op":"spring","target":2,"prop":"z","value":0,"to":100,"stiffness":170,"damping":12}"#));
    let s = w.request(&json::parse(r#"{"op":"seq"}"#)).as_num(0.0) as i64;
    w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"sound","path":"/a.wav"}}"#, s)));
    w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"gap","dur":300,"name":"g"}}"#, s)));
    w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"call"}}"#, s)));
    let mut lines = Vec::new();
    let mut out = Vec::new();
    for _ in 0..30 {
        out = w.advance(1000.0 / 60.0);
    }
    lines.push(w.frame_json(out).write());
    w.sound_length(s, 5, 200.0);
    let mut out = Vec::new();
    for _ in 0..40 {
        out = w.advance(1000.0 / 60.0);
    }
    lines.push(w.frame_json(out).write());
    lines
}

#[test]
fn parity_print() {
    for l in parity_frames() {
        println!("PARITY {}", l);
    }
}

#[test]
fn sound_length_with_pitch_and_pad() {
    // a radio call: the clip played at pitch 0.8, 450 ms of static and click round it
    let mut w = Anims::new();
    let s = w.request(&json::parse(r#"{"op":"seq"}"#)).as_num(0.0) as i64;
    let a = w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"sound","path":"/r.wav","opts":{{"rate":0.8,"pad":450}}}}"#, s))).as_num(0.0) as i64;
    w.request(&json::parse(&format!(r#"{{"op":"add","seq":{},"kind":"call"}}"#, s)));
    w.sound_length(s, a, 800.0);
    w.advance(16.0);
    assert!(near(w.info(s).get("end").as_num(0.0), 1450.0, 1e-9), "{}", w.info(s).write());
}
