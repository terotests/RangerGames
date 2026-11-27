// Renders a glTF model through the engine's own 3D pipeline (fiber.rs: skinning,
// toon bands, outlines, brush strokes, ink lines) into a picture, without a
// window or a browser: the engine's GL triangle stream is rasterised here with
// a depth buffer and 3x3 supersampling. For checking characters from many
// angles against their references.
//
//   cargo run --release -p rg_engine --example render3d -- model.glb out.ppm \
//       [yaw=0] [clip=] [t=0] [w=600] [h=900] [dist=3.9] [ty=0.95] [fov=34] [toon=json] [pitch=0] [bones=json]
//
// key=value arguments after the two paths; yaw turns the camera round the
// model (degrees, 0 = in front, 90 = the model's left side).
use rg_engine::Engine;
use std::collections::HashMap;

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 2 {
        eprintln!("render3d model.glb out.ppm [key=value ...]");
        std::process::exit(2);
    }
    let kv: HashMap<String, String> = a[2..].iter().filter_map(|s| s.split_once('=').map(|(k, v)| (k.to_string(), v.to_string()))).collect();
    let g = |k: &str, d: &str| kv.get(k).cloned().unwrap_or_else(|| d.to_string());
    let num = |k: &str, d: f64| kv.get(k).and_then(|s| s.parse().ok()).unwrap_or(d);
    let (w, h) = (num("w", 600.0), num("h", 900.0));
    let ss = num("ss", 3.0) as usize;
    let yaw = num("yaw", 0.0).to_radians();
    let pitch = num("pitch", 0.0).to_radians();
    let dist = num("dist", 3.9);
    let ty = num("ty", 0.95);
    let cy = num("cy", ty);
    let (ex, ez) = (dist * yaw.sin() * pitch.cos(), dist * yaw.cos() * pitch.cos());
    let ey = cy + dist * pitch.sin();
    let toon = g("toon", r##"{ bands: 3, outline: 2.0, outlineColor: "#1d1528", shadowColor: "#9c8cc0", rim: 0.6, rimColor: "#4e3f66" }"##);
    let clip = g("clip", "");
    let t = num("t", 0.0);
    let bg = g("bg", "#efeaf7");
    // turns added to bones over the clip (rig.rs), as the game's `bones` prop: { name: [x, y, z] }
    let bones = g("bones", "{}");
    // the light: given in the world, or (default) up and to the left of the camera
    let light = kv.get("light").cloned().unwrap_or_else(|| {
        let (s, c) = (yaw.sin(), yaw.cos());
        let (lx, ly, lz) = (-2.0, 3.5, 3.0);
        format!("[{}, {}, {}]", lx * c + lz * s, ly, -lx * s + lz * c)
    });
    let script = format!(r##"
import * as THREE from "three";
import {{ GLTFLoader }} from "three/addons/loaders/GLTFLoader.js";
const gltf = new GLTFLoader().loadSync("models/m.glb");
const obj = gltf.scene;
const mixer = new THREE.AnimationMixer(obj);
const clip = gltf.animations.find((c) => c.name === "{clip}");
if (clip) {{ mixer.clipAction(clip).play(); mixer.update({t}); }}
function view() {{
  return <div class="s"><scene3d>
    <color attach="background" args={{["{bg}"]}} />
    <perspectiveCamera position={{[{ex}, {ey}, {ez}]}} fov={{{fov}}} lookAt={{[0, {ty}, 0]}} />
    <hemisphereLight args={{["#ffffff", "#b9a8d8", 0.55]}} />
    <directionalLight position={{{light}}} intensity={{1.15}} />
    <primitive name="m" object={{obj}} position={{[0, 0, 0]}} toon={{{toon}}} bones={{{bones}}} />
  </scene3d></div>;
}}
"##, fov = num("fov", 34.0));
    let (sw, sh) = (w * ss as f64, h * ss as f64);
    let mut e = Engine::new();
    e.vfs.add_text("/games/t/game.json", &format!(r#"{{ "name": "T", "width": {}, "height": {} }}"#, sw, sh));
    e.vfs.add_text("/games/t/game.tsx", &script);
    e.vfs.add_text("/games/t/style.css", &format!(".s {{ width: {}px; height: {}px; }}", sw, sh));
    e.vfs.add("/games/t/models/m.glb", std::fs::read(&a[0]).expect("model"));
    e.resize(sw, sh);
    e.gl3d = true;
    e.start("t").expect("start");
    e.frame(16.0).expect("frame");
    let tris = &e.scene.tris;
    let (iw, ih) = (sw as usize, sh as usize);
    let mut col = vec![[0f32; 3]; iw * ih];
    let mut zb = vec![f32::INFINITY; iw * ih];
    for t in tris.chunks_exact(18) {
        let v = |k: usize| (t[k * 6], t[k * 6 + 1], t[k * 6 + 2], [t[k * 6 + 3], t[k * 6 + 4], t[k * 6 + 5]]);
        let (p0, p1, p2) = (v(0), v(1), v(2));
        let area = (p1.0 - p0.0) * (p2.1 - p0.1) - (p2.0 - p0.0) * (p1.1 - p0.1);
        if area.abs() < 1e-9 { continue; }
        let x0 = p0.0.min(p1.0).min(p2.0).floor().max(0.0) as usize;
        let x1 = (p0.0.max(p1.0).max(p2.0).ceil() as usize).min(iw.saturating_sub(1));
        let y0 = p0.1.min(p1.1).min(p2.1).floor().max(0.0) as usize;
        let y1 = (p0.1.max(p1.1).max(p2.1).ceil() as usize).min(ih.saturating_sub(1));
        if x0 > x1 || y0 > y1 { continue; }
        for y in y0..=y1 {
            for x in x0..=x1 {
                let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
                let w0 = ((p1.0 - px) * (p2.1 - py) - (p2.0 - px) * (p1.1 - py)) / area;
                let w1 = ((p2.0 - px) * (p0.1 - py) - (p0.0 - px) * (p2.1 - py)) / area;
                let w2 = 1.0 - w0 - w1;
                if w0 < 0.0 || w1 < 0.0 || w2 < 0.0 { continue; }
                let z = w0 * p0.2 + w1 * p1.2 + w2 * p2.2;
                let i = y * iw + x;
                if z <= zb[i] {
                    zb[i] = z;
                    col[i] = [0, 1, 2].map(|c| w0 * p0.3[c] + w1 * p1.3[c] + w2 * p2.3[c]);
                }
            }
        }
    }
    let (ow, oh) = (w as usize, h as usize);
    let mut out = format!("P6\n{} {}\n255\n", ow, oh).into_bytes();
    for y in 0..oh {
        for x in 0..ow {
            let mut s = [0f32; 3];
            for dy in 0..ss { for dx in 0..ss { let c = col[(y * ss + dy) * iw + x * ss + dx]; for k in 0..3 { s[k] += c[k]; } } }
            for k in 0..3 { out.push(((s[k] / (ss * ss) as f32).clamp(0.0, 1.0) * 255.0).round() as u8); }
        }
    }
    std::fs::write(&a[1], out).expect("write");
    eprintln!("{}: {} triangles drawn", a[1], tris.len() / 18);
}
