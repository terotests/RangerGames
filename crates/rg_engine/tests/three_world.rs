// The <scene3d> world (fiber.rs), glTF models (gltf.rs) and the THREE
// facade (js/three.js): a tap on a mesh reaches its onClick, a model loads
// with its clips, the mixer's crossfade and markers run, and the soldier of
// games/nappulasota poses and skins to finite numbers.
use rg_engine::gltf;
use rg_engine::Engine;

const SOLDIER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../games/nappulasota/models/sotilas-valkoinen.glb");

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
