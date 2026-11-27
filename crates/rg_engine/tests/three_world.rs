// The <scene3d> world (fiber.rs), glTF models (gltf.rs) and the THREE
// facade (js/three.js): a tap on a mesh reaches its onClick, a model loads
// with its clips, the mixer's crossfade and markers run, and the soldier of
// games/nappulasota poses and skins to finite numbers.
use rg_engine::gltf;
use rg_engine::Engine;

const SOLDIER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../games/nappulasota/models/wp.glb");

fn engine(script: &str) -> Engine {
    let mut e = Engine::new();
    e.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 200 }"#);
    e.vfs.add_text("/games/t/game.tsx", script);
    e.vfs.add_text("/games/t/style.css", ".s { width: 200px; height: 200px; }");
    e.vfs.add("/games/t/models/s.glb", std::fs::read(SOLDIER).unwrap());
    e.resize(200.0, 200.0);
    e
}

#[test]
fn the_soldier_has_its_clips_and_poses() {
    let a = gltf::parse(&std::fs::read(SOLDIER).unwrap(), &|_| None).unwrap();
    let names: Vec<&str> = a.clips.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, vec!["Idle", "Walk", "Attack", "Hit", "Death", "Victory"]);
    assert_eq!(a.skins.len(), 1);
    assert!(a.triangles > 300);
    let rest = gltf::world_matrices(&a, &gltf::pose(&a, &[]));
    let attack = gltf::world_matrices(&a, &gltf::pose(&a, &[(2, 0.4, 1.0)]));
    let arm = a.nodes.iter().position(|n| n.name == "arm.R").unwrap();
    // the sword arm is raised in the wind-up: its matrix turned
    assert!((rest[arm][5] - attack[arm][5]).abs() > 0.5, "{} vs {}", rest[arm][5], attack[arm][5]);
    // half Walk, half Idle: between the two
    let mixed = gltf::pose(&a, &[(0, 0.5, 0.5), (1, 0.2, 0.5)]);
    assert!(mixed.iter().all(|(t, r, s)| t.iter().chain(r.iter()).chain(s.iter()).all(|v| v.is_finite())));
}

#[test]
fn a_tap_on_a_mesh_reaches_its_onclick() {
    let mut e = engine(r##"
        let taps = [];
        function view() {
          return <div class="s">
            <scene3d>
              <perspectiveCamera position={[0, 0, 5]} fov={50} />
              <ambientLight intensity={1} />
              <mesh name="left" position={[-1.2, 0, 0]} onClick={(ev) => taps.push(ev.object.name + ":" + ev.point.z.toFixed(1))}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="red" />
              </mesh>
              <mesh name="right" position={[1.2, 0, 0]} onClick={() => taps.push("right")}>
                <sphereGeometry args={[0.5, 16, 8]} />
                <meshBasicMaterial color="#00ff00" />
              </mesh>
            </scene3d>
            <div>{taps.join(",")}</div>
          </div>;
        }
        function tick() { if (taps.length) rg.save("taps", taps.join(",")); }
    "##);
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    assert!(e.world.borrow().active);
    assert!(e.world.borrow().drawn > 10);
    // the left box is left of the middle; its front face is at z 0.5
    let hit = e.world.borrow().raycast(60.0, 100.0);
    assert_eq!(hit.len(), 1);
    assert_eq!(hit[0].get("name").as_str(), "left");
    assert!(e.world.borrow().raycast(100.0, 20.0).is_empty());
    e.pointer(0, 1, 60.0, 100.0);
    e.pointer(2, 1, 60.0, 100.0);
    e.frame(16.0).unwrap();
    e.pointer(0, 1, 145.0, 100.0);
    e.pointer(2, 1, 145.0, 100.0);
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    let saved = e.vfs.read_text("/save/t.json");
    assert!(saved.contains("left:0.5,right"), "{}", saved);
}

#[test]
fn a_gltf_model_plays_crossfades_and_markers() {
    let mut e = engine(r##"
        import * as THREE from "three";
        import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
        const gltf = new GLTFLoader().loadSync("models/s.glb");
        const model = gltf.scene;
        const mixer = new THREE.AnimationMixer(model);
        const walk = mixer.clipAction("Walk");
        const attack = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Attack"));
        attack.setLoop(THREE.LoopOnce, 1);
        attack.clampWhenFinished = true;
        attack.addMarker("hit", 0.5);
        const log = [];
        mixer.addEventListener("marker", (ev) => log.push("marker:" + ev.name));
        mixer.addEventListener("finished", (ev) => log.push("finished:" + ev.action.getClip().name));
        walk.play();
        let t = 0, started = false, w = [];
        function tick(dt) {
          t += dt;
          if (t > 0.3 && !started) { started = true; attack.reset().play(); attack.crossFadeFrom(walk, 0.2); }
          mixer.update(dt);
          if (started && w.length < 1 && t > 0.4) w.push(walk.getEffectiveWeight().toFixed(2), attack.getEffectiveWeight().toFixed(2));
          rg.save("log", gltf.animations.length + " " + log.join(",") + " " + w.join("/"));
        }
        function view() {
          return <div class="s"><scene3d>
            <perspectiveCamera position={[0, 1, 3]} lookAt={[0, 0.7, 0]} />
            <directionalLight position={[1, 2, 3]} />
            <primitive name="soldier" object={model} onClick={() => {}} />
          </scene3d></div>;
        }
    "##);
    e.start("t").unwrap();
    for _ in 0..120 {
        e.frame(16.0).unwrap();
    }
    let saved = e.vfs.read_text("/save/t.json");
    // 6 clips; the marker fires once, then the clip finishes; the fade is half way at 0.1 s of 0.2 s
    assert!(saved.contains("6 marker:hit,finished:Attack"), "{}", saved);
    assert!(saved.contains(" 0.4") || saved.contains(" 0.5"), "the fade: {}", saved);
    eprintln!("{}", saved);
    // the model is drawn and can be tapped (its middle)
    let hit = e.world.borrow().raycast(100.0, 110.0);
    assert_eq!(hit.first().map(|h| h.get("name").as_str()), Some("soldier".to_string()));
}

// Nappulasota's puzzles, checked in the engine itself (CErXes, as the phone
// runs them): each has a mate in the moves it says and none in fewer, and
// the hint finds a move of such a mate.
#[test]
fn nappulasota_puzzles_mate_as_they_say() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../games/nappulasota/lib/");
    let mut e = Engine::new();
    e.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 200 }"#);
    e.vfs.add("/games/t/lib/chess.ts", std::fs::read(format!("{}chess.ts", dir)).unwrap());
    e.vfs.add("/games/t/lib/puzzles.ts", std::fs::read(format!("{}puzzles.ts", dir)).unwrap());
    e.vfs.add_text("/games/t/style.css", "");
    e.vfs.add_text("/games/t/game.tsx", r##"
        import { newGame, play, status } from "lib/chess";
        import { PUZZLES, mateIn, solution } from "lib/puzzles";
        let done = false;
        function tick() {
          if (done) return;
          done = true;
          const bad = [];
          PUZZLES.forEach((p, i) => {
            const g = newGame(p.fen);
            if (!mateIn(g, p.n) || (p.n > 1 && mateIn(g, p.n - 1))) bad.push(i);
            if (p.n === 1) { play(g, solution(g, 1)); if (status(g) !== "mate") bad.push("hint" + i); }
          });
          rg.save("r", PUZZLES.length + " bad:" + bad.join(","));
        }
        function view() { return <div />; }
    "##);
    e.resize(200.0, 200.0);
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    let saved = e.vfs.read_text("/save/t.json");
    assert!(saved.contains("14 bad:\""), "{}", saved);
}

#[test]
fn the_script_reads_a_height_picture() {
    let mut e = engine(r##"
        function view() { return <div class="s"></div>; }
        function tick() {
          const a = rg.height("img/h.png", 0.125, 0.25), b = rg.height("img/h.png", 0.875, 0.25), c = rg.height("img/none.png", 0.5, 0.5);
          rg.save("h", [a, b.toFixed(3), c].join(","));
        }
    "##);
    e.vfs.add("/games/t/img/h.png", include_bytes!("height4x2.png").to_vec());
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    e.frame(16.0).unwrap();
    let saved = e.vfs.read_text("/save/t.json");
    assert!(saved.contains("0,1.000,"), "{}", saved);
}

// Toon shading (fiber.rs `Toon`): a sphere lit by one directional light is
// drawn in a few flat colours (its bands), not a smooth ramp, and with an
// outline in the outline colour round it; the same sphere without toon has
// many shades.
fn sphere_colours(toon: &str) -> (std::collections::HashSet<[u8; 3]>, usize) {
    let mut e = engine(&format!(r##"
        function view() {{
          return <div class="s"><scene3d>
            <color attach="background" args={{["#ffffff"]}} />
            <perspectiveCamera position={{[0, 0, 4]}} fov={{50}} />
            <ambientLight intensity={{0.4}} />
            <directionalLight position={{[2, 3, 4]}} intensity={{1}} />
            <mesh name="ball">
              <sphereGeometry args={{[1, 32, 16]}} />
              <meshStandardMaterial color="#8060c0" {} />
            </mesh>
          </scene3d></div>;
        }}
    "##, toon));
    e.gl3d = true;
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    let tris = &e.scene.tris;
    let mut cols = std::collections::HashSet::new();
    let mut dark = 0;
    for c in tris.chunks_exact(6) {
        let k = [(c[3] * 255.0).round() as u8, (c[4] * 255.0).round() as u8, (c[5] * 255.0).round() as u8];
        if k == [255, 255, 255] {
            continue; // the background
        }
        if k[0] < 40 && k[1] < 40 && k[2] < 50 {
            dark += 1;
        } else {
            cols.insert(k);
        }
    }
    (cols, dark)
}

#[test]
fn toon_shading_draws_flat_bands_and_an_outline() {
    let (plain, plain_dark) = sphere_colours("");
    let (toon, dark) = sphere_colours(r#"toon={{ bands: 3, outline: 2 }}"#);
    assert!(plain.len() > 40, "a lit sphere has many shades: {}", plain.len());
    assert_eq!(plain_dark, 0);
    assert!(toon.len() <= 3, "three bands: {:?}", toon);
    assert!(dark > 30, "the outline's corners: {}", dark);
    // rim light and a highlight are bands of their own
    let (more, _) = sphere_colours(r##"toon={{ bands: 2, rim: 0.7, rimColor: "#604080", specular: 0.95, outline: 0 }}"##);
    assert!(more.len() >= 3 && more.len() <= 8, "2 bands × highlight × rim: {:?}", more);
}

#[test]
fn toon_settings_read_from_json() {
    use rg_core::json;
    use rg_engine::fiber::Toon;
    let t = Toon::from_json(&json::parse(r#"{ "bands": 4, "outline": 3, "specular": true, "rim": 0.5 }"#)).unwrap();
    assert_eq!(t.n, 4);
    assert_eq!(t.line, 3.0);
    assert!((t.spec - 0.96).abs() < 1e-6 && (t.rim - 0.5).abs() < 1e-6);
    assert_eq!(t.band(-1.0), 0);
    assert_eq!(t.band(1.0), 3);
    assert!(Toon::from_json(&json::Json::Bool(false)).is_none());
    // a glTF part's extras.toon over the model's settings
    let mut m = Toon::from_json(&json::Json::Bool(true)).unwrap();
    m.apply(&json::parse(r#"{ "lit": false, "outline": 0 }"#));
    assert!(!m.lit && m.line == 0.0 && m.n == 3);
}

// The Character Studio's cat (games/hahmostudio; built by Trade Frontier's characters/cat/make-cat.mjs):
// its clip groups are there and its parts carry their toon settings.
#[test]
fn the_cat_has_its_clip_groups_and_toon_parts() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../games/hahmostudio/models/cat.glb");
    // the model is built from Trade Frontier's private character data: not here in CI
    let Ok(bytes) = std::fs::read(path) else { eprintln!("no {}: skipped", path); return; };
    let a = gltf::parse(&bytes, &|_| None).unwrap();
    let names: Vec<&str> = a.clips.iter().map(|c| c.name.as_str()).collect();
    for n in ["Idle", "Wave", "Explain", "Think", "Talk", "Blink", "Tail", "FaceSmile"] {
        assert!(names.contains(&n), "{} in {:?}", n, names);
    }
    let parts: Vec<&gltf::Primitive> = a.meshes.iter().flatten().collect();
    assert!(parts.iter().all(|p| !p.toon.is_null()));
    assert!(parts.iter().any(|p| matches!(p.toon.get("lit"), rg_core::json::Json::Bool(false))), "the face's ink");
    let pose = gltf::pose(&a, &[(0, 1.0, 1.0), (names.iter().position(|n| *n == "Talk").unwrap(), 0.3, 1.0)]);
    assert!(pose.iter().all(|(t, r, s)| t.iter().chain(r.iter()).chain(s.iter()).all(|v| v.is_finite())));
}

#[test]
fn the_eye_feature_draws_an_almond_iris_pupil_and_lash() {
    let j = rg_core::json::parse(r##"{ "type": "eye", "at": [0, 0, 0.01], "halfWidth": 0.02, "side": -1, "sclera": "#f1ebe2" }"##);
    let (art, at) = rg_engine::features::art(&j).expect("an eye");
    assert_eq!(at, [0.0, 0.0, 0.01]);
    // sclera, iris, the iris's dark top, pupil (the glint is cut to nothing at 0 size only)
    assert!(art.fills.len() >= 4, "fills: {}", art.fills.len());
    // the lash (with its flick) and the lower lid
    assert_eq!(art.strokes.len(), 2);
    let lash = &art.strokes[1];
    assert_eq!(lash.pts.len(), lash.w.len());
    assert!(lash.w.iter().cloned().fold(0.0f32, f32::max) > 0.003, "the lash swells");
    assert!(*lash.w.last().unwrap() < 1e-4, "and ends in a point");
    // mirrored: the outer corner is on the left
    assert!(art.guides[0].pts.iter().map(|p| p[0]).fold(0.0f32, f32::min) < -0.019);
    // closed: only the lash line
    let shut = rg_core::json::parse(r##"{ "type": "eye", "open": 0 }"##);
    let (art, _) = rg_engine::features::art(&shut).unwrap();
    assert!(art.fills.is_empty());
    assert_eq!(art.strokes.len(), 1);
}
