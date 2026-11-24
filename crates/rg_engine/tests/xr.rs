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
