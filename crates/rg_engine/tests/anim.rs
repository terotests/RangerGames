// The animations a game gets (js/anim.js on rg_core::anim): run natively on
// the engine's clock, the values on the game's objects before its tick.
use rg_engine::Engine;

fn engine(script: &str) -> Engine {
    let mut e = Engine::new();
    e.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 100 }"#);
    e.vfs.add_text("/games/t/game.tsx", script);
    e.vfs.add_text("/games/t/style.css", ".s { width: 200px; height: 100px; } .b { width: 20px; height: 20px; }");
    e.resize(400.0, 400.0);
    e
}

fn wav(ms: usize) -> Vec<u8> {
    let data = 22050 * 2 * ms / 1000;
    let mut b = Vec::new();
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&((36 + data) as u32).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&22050u32.to_le_bytes());
    b.extend_from_slice(&44100u32.to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&(data as u32).to_le_bytes());
    b.extend(std::iter::repeat(0u8).take(data));
    b
}

fn texts(e: &Engine) -> Vec<String> {
    e.draw.strings.clone()
}

#[test]
fn animate_moves_an_object_on_the_clock() {
    let mut e = engine(
        r#"
        const ball = { x: 0, y: 0 };
        let a = null, done = 0;
        function tick(dt) {
          if (!a) { a = rg.animate(ball, [{ x: 0 }, { x: 100 }], { duration: 1000, fill: "forwards" }); a.onfinish = () => { done++; }; }
        }
        function view() { return <div className="s">{"x=" + Math.round(ball.x) + " s=" + (a ? a.playState : "") + " d=" + done}</div>; }
        "#,
    );
    e.start("t").unwrap();
    // 60 Hz vsync times: the animation starts at the first frame's tick
    let p = 1000.0 / 60.0;
    let mut t = 0.0;
    e.frame_at(t, p).unwrap();
    for _ in 0..30 {
        t += p;
        e.frame_at(t, p).unwrap();
    }
    // 30 frames after the start: half way (values apply before the tick, the view shows them)
    assert!(texts(&e).iter().any(|s| s.starts_with("x=50")), "{:?}", texts(&e));
    for _ in 0..40 {
        t += p;
        e.frame_at(t, p).unwrap();
    }
    assert!(texts(&e).iter().any(|s| s == "x=100 s=finished d=1"), "{:?}", texts(&e));
}

#[test]
fn element_style_and_sequence_with_speech() {
    let mut e = engine(
        r##"
        const story = { k: 0 };
        let log = [];
        let seq = null;
        function tick() {
          if (!seq) {
            rg.animate("#b", { opacity: [0, 1] }, 400);
            seq = rg.sequence()
              .say("hei")
              .to(story, { k: 10, duration: 500 }, "<")
              .hold("vastaus", { timeout: 0 })
              .call(() => log.push("ohi"));
          }
        }
        function onPointerDown() { seq.cancel("vastaus"); }
        function view() { return <div className="s"><div id="b" className="b"/>{"k=" + Math.round(story.k) + " " + log.join(",") + " h=" + seq.holding}</div>; }
        "##,
    );
    e.vfs.add("/games/_voice/fi/hei.wav", wav(300));
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    let mut cmds = Vec::new();
    for _ in 0..40 {
        e.frame(1000.0 / 60.0).unwrap();
        cmds.extend(e.take_host_commands());
    }
    // the clip was started by the sequence, its length read from the file
    assert!(cmds.iter().any(|c| c.kind == "sound" && c.name == "/games/_voice/fi/hei.wav"), "{:?}", cmds.iter().map(|c| c.kind.clone() + " " + &c.name).collect::<Vec<_>>());
    // the tween ran with it; the hold waits for the answer
    assert!(texts(&e).iter().any(|s| s == "k=10  h=true"), "{:?}", texts(&e));
    // the element's opacity came from the animation (400 ms: done, no fill: back to none)
    e.pointer(0, 1, 100.0, 150.0);
    e.pointer(2, 1, 100.0, 150.0);
    e.frame(1000.0 / 60.0).unwrap();
    e.frame(1000.0 / 60.0).unwrap();
    assert!(texts(&e).iter().any(|s| s == "k=10 ohi h=false"), "{:?}", texts(&e));
}

#[test]
fn the_frame_clock_is_whole_display_frames() {
    let mut e = engine(
        r#"
        let steps = [];
        function tick(dt) { if (steps.length < 50) steps.push(Math.round(rg.frame.dt * 100) / 100); }
        function view() { return <div className="s">{steps.slice(10, 16).join(" ")}</div>; }
        "#,
    );
    e.start("t").unwrap();
    // jittery vsync times on a 90 Hz screen, frames of one or two vsyncs
    let p = 1000.0 / 90.0;
    let mut t = 1000.0;
    for i in 0..40 {
        t += if i % 3 == 0 { 2.0 * p } else { p } + if i % 2 == 0 { 0.9 } else { -0.9 };
        e.frame_at(t, p).unwrap();
    }
    let s = texts(&e).into_iter().find(|s| s.contains(' ')).unwrap();
    for w in s.split(' ') {
        let v: f64 = w.parse().unwrap();
        let n = (v / p).round();
        assert!((v - n * p).abs() < 0.01, "{}", s);
    }
}
