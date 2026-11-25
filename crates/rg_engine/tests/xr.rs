// VR (rg.xr, xr.rs): stereo draws the scene twice side by side, each half
// cut to itself; a headset's eyes get their own triangles and the panel; a
// controller's trigger on the panel taps the 2D view, and one pointed at a
// mesh reaches its onClick.
use rg_engine::Engine;

const GAME: &str = r##"
    let log = [];
    let started = false;
    function onXR(e) { log.push(e.type + (e.button ? ":" + e.button : "") + (e.mode ? ":" + e.mode : "")); }
    function hit(name) { log.push("click:" + name); }
    function view() {
      return <div class="s">
        <scene3d>
          <color attach="background" args={["#223344"]} />
          <perspectiveCamera position={[0, 1.6, 4]} fov={60} lookAt={[0, 1.6, 0]} />
          <ambientLight intensity={1} />
          <mesh name="box" position={[0, 1.6, 0]} onClick={() => hit("box")}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="red" />
          </mesh>
        </scene3d>
        <div id="btn" class="b" onClick={() => log.push("button")}>VR</div>
      </div>;
    }
    function tick() { rg.save("log", log.join(",")); }
"##;

fn engine() -> Engine {
    let mut e = Engine::new();
    e.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 200 }"#);
    e.vfs.add_text("/games/t/game.tsx", GAME);
    e.vfs.add_text("/games/t/style.css", ".s { width: 200px; height: 200px; } .b { position: absolute; left: 0px; top: 0px; width: 200px; height: 200px; }");
    e.resize(200.0, 200.0);
    e
}

fn log(e: &mut Engine) -> String {
    e.eval("rg.load('log', '')").unwrap_or_default()
}

#[test]
fn stereo_draws_each_eye_in_its_half() {
    let mut e = engine();
    e.gl3d = true;
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    let mono = e.scene.tris.len();
    assert!(mono > 0);
    e.eval("rg.xr.enter('stereo', { fov: 80 })").unwrap();
    e.frame(16.0).unwrap();
    let cmds = e.take_host_commands();
    assert!(cmds.iter().any(|c| c.kind == "sensor" && c.name == "orient"), "the phone's turn is asked for");
    // the phone held level in landscape, looking north: screen right = east,
    // up = up, out of the screen = south
    e.sensor("orient", r#"{"m":[1,0,0, 0,0,1, 0,-1,0]}"#);
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    assert!(log(&mut e).contains("start:stereo"), "{}", log(&mut e));
    let t = &e.scene.tris;
    assert!(!t.is_empty() && t.len() % 18 == 0);
    let mut left = 0;
    let mut right = 0;
    for tri in t.chunks_exact(18) {
        let xs = [tri[0], tri[6], tri[12]];
        let all_left = xs.iter().all(|&x| x <= 100.001);
        let all_right = xs.iter().all(|&x| x >= 99.999);
        assert!(all_left || all_right, "a triangle across the middle: {:?}", xs);
        if all_left { left += 1; } else { right += 1; }
    }
    assert!(left > 0 && right > 0, "{} {}", left, right);
    e.eval("rg.xr.exit()").unwrap();
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    assert!(log(&mut e).contains("end:stereo"));
    assert_eq!(e.scene.tris.len(), mono, "back to one picture");
}

const VIEWS: &str = r#""views":[{"p":[-0.03,1.6,0],"q":[0,0,0,1],"t":[1,1,1,1]},{"p":[0.03,1.6,0],"q":[0,0,0,1],"t":[1,1,1,1]}],"head":{"p":[0,1.6,0],"q":[0,0,0,1]}"#;

fn hands(trigger: f64, aim_q: &str, aim_p: &str) -> String {
    format!(r#"{{{}, "hands":[{{"side":"right","aim":{{"p":{},"q":{}}},"buttons":[{},0,0,0,0,0],"stick":[0,0]}}]}}"#, VIEWS, aim_p, aim_q, trigger)
}

#[test]
fn a_headset_draws_eyes_and_its_triggers_tap() {
    let mut e = engine();
    e.gl3d = true;
    e.gl_all = true;
    e.xr_input(r#"{"event":"caps","vr":true,"always":true}"#);
    e.start("t").unwrap();
    // the headset on, the game not in VR: a panel in an empty room
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.2,1.4,-0.2]"));
    e.frame(16.0).unwrap();
    assert_eq!(e.xr_eyes(), 2);
    assert!(e.xr_eye(0));
    assert!(e.xr_panel.is_some(), "the panel is in front");
    assert!(!e.scene.tris.is_empty(), "the room");
    assert!(!e.xr_over.is_empty(), "the controller's ray");
    // the trigger on the panel: a tap on the 2D view
    e.xr_input(&hands(1.0, "[0,0,0,1]", "[0.0,1.45,-0.2]"));
    e.frame(16.0).unwrap();
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.45,-0.2]"));
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    assert!(log(&mut e).contains("button"), "{}", log(&mut e));
    // into VR: the world around, the panel off
    e.eval("rg.xr.enter('vr', { panel: false })").unwrap();
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    e.frame(16.0).unwrap();
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    e.frame(16.0).unwrap();
    assert!(log(&mut e).contains("start:vr"), "{}", log(&mut e));
    assert!(e.xr_eye(0));
    assert!(e.xr_panel.is_none());
    let (w, h) = e.xr_eye_size(0);
    // the box straight ahead (the camera looks at it): triangles at the middle
    let t = &e.scene.tris;
    let centre = t.chunks_exact(6).any(|c| (c[0] as f64 - w / 2.0).abs() < w * 0.2 && (c[1] as f64 - h / 2.0).abs() < h * 0.2 && c[2] < 1.0);
    assert!(centre, "the box in the eye");
    assert!(e.xr_eye(1));
    // the right controller points at the box: the trigger clicks it
    e.xr_input(&hands(1.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    e.frame(16.0).unwrap();
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    assert!(log(&mut e).contains("click:box"), "{}", log(&mut e));
    assert!(log(&mut e).contains("button:trigger"));
}

// planets and stars (rg.three "planet", "space"): in a headset each eye is a
// draw stream of its own, with a symmetric view around the eye's
const SPACE: &str = r##"
    let log = [];
    function onXR(e) { log.push(e.type); }
    rg.three("camera", { x: 0, y: 0, z: 10, lookAt: [0, 0, 0], fov: 60 });
    rg.three("space", { sun: [100, 0, 100], stars: 300 });
    rg.three("planet", { id: "p", x: 0, y: 0, z: 0, r: 2, ocean: "#2255aa", land: "#44aa44" });
    rg.three("add", { id: "ship", shape: "box", size: [0.5, 0.5, 0.5], x: 0, y: 0, z: 6, color: "#ff0000" });
    function view() { return <div class="s"></div>; }
    function tick() { rg.save("log", log.join(",")); }
"##;

#[test]
fn a_headset_draws_planets_and_stars_from_each_eyes_stream() {
    let mut e = Engine::new();
    e.vfs.add_text("/games/s/game.json", r#"{ "name": "S", "width": 200, "height": 200 }"#);
    e.vfs.add_text("/games/s/game.tsx", SPACE);
    e.vfs.add_text("/games/s/style.css", ".s { width: 200px; height: 200px; }");
    e.resize(200.0, 200.0);
    e.gl3d = true;
    e.gl_all = true;
    e.xr_input(r#"{"event":"caps","vr":true,"always":true}"#);
    e.start("s").unwrap();
    // asymmetric eyes, as a headset's are
    let views = r#""views":[{"p":[-0.03,1.6,0],"q":[0,0,0,1],"t":[1.0,0.8,1.0,1.2]},{"p":[0.03,1.6,0],"q":[0,0,0,1],"t":[0.8,1.0,1.0,1.2]}],"head":{"p":[0,1.6,0],"q":[0,0,0,1]},"hands":[]"#;
    e.xr_input(&format!("{{{}}}", views));
    e.frame(16.0).unwrap();
    e.eval("rg.xr.enter('vr', { panel: false })").unwrap();
    for _ in 0..2 {
        e.xr_input(&format!("{{{}}}", views));
        e.frame(16.0).unwrap();
    }
    assert!(log(&mut e).contains("start"), "{}", log(&mut e));
    assert!(e.xr_eye(0));
    let v = e.xr_view.expect("a stream for the eye");
    // the symmetric view: 2 x 1.2 tangents wide and high; the eye 1.8 x 2.2 in it
    assert!((v[0] - 2000.0).abs() < 1e-6 && (v[1] - 2400.0).abs() < 1e-6, "{:?}", v);
    assert!((v[2] - 0.0).abs() < 1e-6 && (v[3] - 200.0).abs() < 1e-6 && (v[4] - 1800.0).abs() < 1e-6 && (v[5] - 2200.0).abs() < 1e-6, "{:?}", v);
    let left = e.xr_draw.nums.clone();
    assert!(left.len() > 100, "the stars and the planet: {}", left.len());
    assert!(!e.scene.tris.is_empty(), "the ship as triangles");
    let gv = e.xr_eye_view(900).unwrap();
    assert!((gv[0] - 0.5).abs() < 1e-6 && gv[1].abs() < 1e-6 && (gv[2] + 100.0).abs() < 1e-3, "{:?}", gv);
    assert!(e.xr_eye(1));
    assert!(e.xr_view.is_some());
    assert_ne!(left, e.xr_draw.nums, "each eye sees from its own place");
    // stereo 0: both eyes at the head (their symmetric views are the same)
    e.eval("rg.xr.set({ stereo: 0 })").unwrap();
    e.xr_input(&format!("{{{}}}", views));
    e.frame(16.0).unwrap();
    assert!(e.xr_eye(0));
    let flat = e.xr_draw.nums.clone();
    assert!(e.xr_eye(1));
    assert_eq!(flat, e.xr_draw.nums, "no parallax with stereo 0");
    // out of VR the eyes have no stream: the panel in the room
    e.eval("rg.xr.exit()").unwrap();
    e.xr_input(&format!("{{{}}}", views));
    e.frame(16.0).unwrap();
    e.xr_input(&format!("{{{}}}", views));
    e.frame(16.0).unwrap();
    assert!(e.xr_eye(0));
    assert!(e.xr_view.is_none());
}

#[test]
fn an_app_of_one_game_opens_it_in_vr_on_a_headset() {
    // scripts/build-android.sh RG_APP_START=t: /games/_app.json names the
    // game, which then stands in the launcher's place; its game.json "xr"
    // takes it into VR at once on a headset
    let mut e = Engine::new();
    e.vfs.add_text("/games/_app.json", r#"{"start":"t"}"#);
    e.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 200, "xr": { "mode": "vr", "panel": false } }"#);
    e.vfs.add_text("/games/t/game.tsx", GAME);
    e.vfs.add_text("/games/t/style.css", ".s { width: 200px; height: 200px; }");
    e.resize(200.0, 200.0);
    e.gl3d = true;
    e.gl_all = true;
    e.xr_input(r#"{"event":"caps","vr":true,"always":true}"#);
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    e.start("").unwrap();
    assert!(e.has_launcher(), "the app's game is its launcher");
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    assert!(log(&mut e).contains("start:vr"), "{}", log(&mut e));
    assert!(e.xr_panel.is_none(), "the world around, no panel");
    // the stick is the arrow keys, the grip Space
    let st = hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]").replace("[0,0,0,0,0,0]", "[0,1,0,0,0,0]").replace("\"stick\":[0,0]", "\"stick\":[-0.9,0.8]");
    e.xr_input(&st);
    e.frame(16.0).unwrap();
    let k = e.eval("JSON.stringify(__input.keys)").unwrap_or_default();
    assert!(k.contains("ArrowLeft") && k.contains("ArrowUp") && k.contains("\" \""), "{}", k);
    e.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    e.frame(16.0).unwrap();
    let k = e.eval("JSON.stringify(__input.keys)").unwrap_or_default();
    assert!(!k.contains("ArrowLeft") || k.contains("\"ArrowLeft\":false"), "{}", k);
    // the ✕ is there (it closes the app)
    assert!(e.ui.id_at(190.0, 20.0).contains("close"), "{}", e.ui.id_at(190.0, 20.0));
    // the controller's B is Back, which closes the app (no launcher behind it)
    let b = hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]").replace("[0,0,0,0,0,0]", "[0,0,0,0,1,0]");
    e.xr_input(&b);
    e.frame(16.0).unwrap();
    assert!(e.take_host_commands().iter().any(|c| c.kind == "quit"));

    // the Quest app: OpenXR starts after the game has (caps comes late)
    let mut q = Engine::new();
    q.vfs.add_text("/games/_app.json", r#"{"start":"t"}"#);
    q.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 200, "xr": { "mode": "vr" } }"#);
    q.vfs.add_text("/games/t/game.tsx", GAME);
    q.vfs.add_text("/games/t/style.css", "");
    q.resize(200.0, 200.0);
    q.start("").unwrap();
    q.frame(16.0).unwrap();
    q.xr_input(r#"{"event":"caps","vr":true,"always":true}"#);
    q.xr_input(&hands(0.0, "[0,0,0,1]", "[0.0,1.6,0.0]"));
    q.frame(16.0).unwrap();
    q.frame(16.0).unwrap();
    assert!(log(&mut q).contains("start:vr"), "{}", log(&mut q));

    // a flat phone: the same game starts flat
    let mut f = Engine::new();
    f.vfs.add_text("/games/_app.json", r#"{"start":"t"}"#);
    f.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "xr": { "mode": "vr" } }"#);
    f.vfs.add_text("/games/t/game.tsx", GAME);
    f.vfs.add_text("/games/t/style.css", "");
    f.resize(200.0, 200.0);
    f.start("").unwrap();
    f.frame(16.0).unwrap();
    f.frame(16.0).unwrap();
    assert!(!log(&mut f).contains("start"), "{}", log(&mut f));
}
