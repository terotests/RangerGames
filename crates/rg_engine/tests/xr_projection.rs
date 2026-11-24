// VR projection checks by inverse projection: every point the engine puts
// into an eye's picture is turned back into a ray from that eye, and the ray
// must meet the thing that was drawn (a box's surface, the panel's corner, a
// planet's horizon). Covers the headset eyes' triangles, the panel's clip
// corners, the per-eye streams of a scene with planets (symmetric view) and
// how such a stream is mapped into the eye's own rectangle (xr_eye_view).
use rg_engine::xr::{Eye, K};
use rg_engine::Engine;

type V3 = [f64; 3];

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn mul(a: V3, k: f64) -> V3 {
    [a[0] * k, a[1] * k, a[2] * k]
}
fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn norm(a: V3) -> V3 {
    mul(a, 1.0 / dot(a, a).sqrt())
}

/// The ray through point (sx, sy) of an eye's picture (units: K a tangent,
/// y down): the inverse of sx = cx + x/z·K, sy = cy − y/z·K.
fn unproject(e: &Eye, sx: f64, sy: f64) -> (V3, V3) {
    let (cx, cy) = e.centre();
    let d = add(add(e.f, mul(e.r, (sx - cx) / K)), mul(e.u, (cy - sy) / K));
    (e.pos, norm(d))
}

/// How far a point is from a ray (the ray's part in front of its origin).
fn ray_distance(o: V3, d: V3, p: V3) -> f64 {
    let t = dot(sub(p, o), d).max(0.0);
    let q = add(o, mul(d, t));
    dot(sub(p, q), sub(p, q)).sqrt()
}

/// Whether a ray meets a box (min, max), grown by `eps`.
fn ray_hits_box(o: V3, d: V3, lo: V3, hi: V3, eps: f64) -> bool {
    let (mut t0, mut t1) = (0.0f64, f64::MAX);
    for k in 0..3 {
        let (a, b) = (lo[k] - eps, hi[k] + eps);
        if d[k].abs() < 1e-12 {
            if o[k] < a || o[k] > b {
                return false;
            }
            continue;
        }
        let (mut ta, mut tb) = ((a - o[k]) / d[k], (b - o[k]) / d[k]);
        if ta > tb {
            std::mem::swap(&mut ta, &mut tb);
        }
        t0 = t0.max(ta);
        t1 = t1.min(tb);
        if t0 > t1 {
            return false;
        }
    }
    true
}

fn qmul(a: [f64; 4], b: [f64; 4]) -> [f64; 4] {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}
fn qrot(q: [f64; 4], v: V3) -> V3 {
    let p = qmul(qmul(q, [v[0], v[1], v[2], 0.0]), [-q[0], -q[1], -q[2], q[3]]);
    [p[0], p[1], p[2]]
}

/// A headset frame: the head at 1.6 m turned by `q`, eyes 64 mm apart,
/// asymmetric fields of view (as a headset's are).
fn frame(q: [f64; 4]) -> String {
    let side = qrot(q, [0.032, 0.0, 0.0]);
    let eye = |s: f64, t: &str| format!(r#"{{"p":[{},{},{}],"q":[{},{},{},{}],"t":{}}}"#, side[0] * s, 1.6 + side[1] * s, side[2] * s, q[0], q[1], q[2], q[3], t);
    format!(
        r#"{{"views":[{},{}],"head":{{"p":[0,1.6,0],"q":[{},{},{},{}]}},"hands":[]}}"#,
        eye(-1.0, "[1.0,0.85,0.95,1.15]"),
        eye(1.0, "[0.85,1.0,0.95,1.15]"),
        q[0], q[1], q[2], q[3]
    )
}

/// The head turned: yaw (left +), pitch (up +), roll.
fn turn(yaw: f64, pitch: f64, roll: f64) -> [f64; 4] {
    let y = [0.0, (yaw / 2.0).sin(), 0.0, (yaw / 2.0).cos()];
    let p = [(pitch / 2.0).sin(), 0.0, 0.0, (pitch / 2.0).cos()];
    let r = [0.0, 0.0, (roll / 2.0).sin(), (roll / 2.0).cos()];
    qmul(qmul(y, p), r)
}

const BOX_LO: V3 = [-0.6, -0.3, 5.5];
const BOX_HI: V3 = [0.4, 0.5, 6.3];

fn game(planets: bool) -> String {
    format!(
        r##"
    rg.three("camera", {{ x: 0, y: 0, z: 10, lookAt: [0, 0, 0], fov: 60 }});
    {}
    rg.three("add", {{ id: "b", shape: "box", size: [1.0, 0.8, 0.8], x: -0.1, y: 0.1, z: 5.9, color: "#ff0000" }});
    function view() {{ return <div class="s"></div>; }}
"##,
        if planets {
            r##"rg.three("space", { sun: [100, 20, 50], stars: 400 });
    rg.three("planet", { id: "p", x: 3, y: 1, z: -20, r: 4, ocean: "#2255aa" });"##
        } else {
            ""
        }
    )
}

/// A game in a headset, in VR, the head turned by `q` (after recentring straight ahead).
fn engine(planets: bool, q: [f64; 4]) -> Engine {
    let mut e = Engine::new();
    e.vfs.add_text("/games/p/game.json", r#"{ "name": "P", "width": 200, "height": 300 }"#);
    e.vfs.add_text("/games/p/game.tsx", &game(planets));
    e.vfs.add_text("/games/p/style.css", ".s { width: 200px; height: 300px; }");
    e.resize(200.0, 300.0);
    e.gl3d = true;
    e.gl_all = true;
    e.xr_input(r#"{"event":"caps","vr":true,"always":true}"#);
    e.start("p").unwrap();
    let ahead = frame([0.0, 0.0, 0.0, 1.0]);
    e.xr_input(&ahead);
    e.frame(16.0).unwrap();
    e.eval("rg.xr.enter('vr')").unwrap();
    for _ in 0..2 {
        e.xr_input(&ahead);
        e.frame(16.0).unwrap();
    }
    e.xr_input(&frame(q));
    e.frame(16.0).unwrap();
    e
}

/// Eye `i` in the world, as the engine places it.
fn world_eye(e: &Engine, i: usize) -> Eye {
    let (p, r, u, f) = e.scene.rig();
    e.xr.eye(i, p, r, u, f).unwrap()
}

const TURNS: [(f64, f64, f64); 4] = [(0.0, 0.0, 0.0), (0.15, -0.1, 0.0), (-0.12, 0.08, 0.2), (0.05, 0.12, -0.15)];

#[test]
fn every_box_corner_in_an_eye_leads_back_to_the_box() {
    for &(y, p, r) in TURNS.iter() {
        let mut e = engine(false, turn(y, p, r));
        for i in 0..2 {
            assert!(e.xr_eye(i));
            assert!(e.xr_view.is_none(), "no planets: triangles only");
            let eye = world_eye(&e, i);
            let (w, h) = e.xr_eye_size(i);
            assert!((w - eye.size().0).abs() < 1e-9 && (h - eye.size().1).abs() < 1e-9);
            let mut n = 0;
            for v in e.scene.tris.chunks_exact(6) {
                // the box's red faces (the room's sky and floor are not drawn in VR scenes)
                if v[3] < 0.2 || v[4] > 0.3 {
                    continue;
                }
                let (o, d) = unproject(&eye, v[0] as f64, v[1] as f64);
                assert!(ray_hits_box(o, d, BOX_LO, BOX_HI, 1e-4), "turn {:?} eye {}: ({}, {}) misses the box", (y, p, r), i, v[0], v[1]);
                n += 1;
            }
            assert!(n >= 6, "the box is in eye {} ({} corners)", i, n);
        }
    }
}

#[test]
fn the_panels_clip_corners_lead_back_to_its_corners() {
    for &(y, p, r) in TURNS.iter() {
        let e = engine(false, turn(y, p, r));
        let corners = e.xr.panel.corners();
        for i in 0..2 {
            let clip = e.xr.panel_clip(i).expect("the panel in front");
            let eye = e.xr.eye_local(i).unwrap();
            let (w, h) = eye.size();
            for (k, c) in clip.iter().enumerate() {
                let (nx, ny) = (c[0] as f64 / c[3] as f64, c[1] as f64 / c[3] as f64);
                let (sx, sy) = ((nx + 1.0) / 2.0 * w, (1.0 - ny) / 2.0 * h);
                let (o, d) = unproject(&eye, sx, sy);
                let miss = ray_distance(o, d, corners[k]);
                assert!(miss < 1e-5, "turn {:?} eye {} corner {}: {} m off", (y, p, r), i, k, miss);
            }
        }
    }
}

/// The filled paths of one colour in a stream (kind 6): their points.
fn paths(nums: &[f32], rgb: [f32; 3]) -> Vec<Vec<(f64, f64)>> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 23 <= nums.len() {
        let n = nums[i + 22].max(0.0) as usize;
        let next = i + 23 + n;
        if nums[i] as i32 == 6 && n > 0 && (0..3).all(|k| (nums[i + 5 + k] - rgb[k]).abs() < 1.0) {
            let pn = nums[i + 23] as usize;
            let pts = &nums[i + 24..i + 24 + pn];
            out.push(pts.chunks_exact(2).map(|p| (p[0] as f64, p[1] as f64)).collect());
        }
        i = next;
    }
    out
}

#[test]
fn a_planets_horizon_and_the_ship_lead_back_from_each_eyes_stream() {
    let centre: V3 = [3.0, 1.0, -20.0];
    let radius = 4.0;
    let ocean = [0x22 as f32, 0x55 as f32, 0xaa as f32];
    for &(y, p, r) in TURNS.iter() {
        let mut e = engine(true, turn(y, p, r));
        let mut stars: Vec<Vec<f32>> = Vec::new();
        for i in 0..2 {
            assert!(e.xr_eye(i));
            let v = e.xr_view.expect("a stream for planets");
            let real = world_eye(&e, i);
            let sym = real.symmetric();
            assert!((v[0] - sym.size().0).abs() < 1e-9 && (v[1] - sym.size().1).abs() < 1e-9);
            // the planet's horizon: each point's ray just touches the ball
            let horizon = paths(&e.xr_draw.nums, ocean);
            assert!(!horizon.is_empty(), "turn {:?} eye {}: the planet", (y, p, r), i);
            for pt in horizon.iter().flatten() {
                let (o, d) = unproject(&sym, pt.0, pt.1);
                let miss = ray_distance(o, d, centre);
                assert!((miss - radius).abs() < radius * 1e-4, "turn {:?} eye {}: horizon ray {} from the centre, radius {}", (y, p, r), i, miss, radius);
            }
            // the ship's triangles, in the symmetric view and mapped into the eye's own rectangle
            let pw = 1000;
            let gv = e.xr_eye_view(pw).unwrap();
            let s_real = pw as f64 / real.size().0;
            let mut n = 0;
            for t in e.scene.tris.chunks_exact(6) {
                if t[3] < 0.2 || t[4] > 0.3 {
                    continue;
                }
                let (o, d) = unproject(&sym, t[0] as f64, t[1] as f64);
                assert!(ray_hits_box(o, d, BOX_LO, BOX_HI, 1e-4), "turn {:?} eye {}: symmetric ({}, {}) misses the box", (y, p, r), i, t[0], t[1]);
                // the painter: pixel = scale · unit + offset; back in the eye's own units
                let (px, py) = (gv[0] as f64 * t[0] as f64 + gv[1] as f64, gv[0] as f64 * t[1] as f64 + gv[2] as f64);
                let (o, d) = unproject(&real, px / s_real, py / s_real);
                assert!(ray_hits_box(o, d, BOX_LO, BOX_HI, 1e-4), "turn {:?} eye {}: mapped ({}, {}) misses the box", (y, p, r), i, px, py);
                n += 1;
            }
            assert!(n >= 6, "the ship in eye {}", i);
            // the stars: far away, so both eyes (same turn, same symmetric view) draw them alike
            let mut st = Vec::new();
            for c in [[0.55f32, 0.6, 0.75], [0.8, 0.82, 0.9], [1.0, 1.0, 1.0]] {
                for pth in paths(&e.xr_draw.nums, [c[0] * 255.0, c[1] * 255.0, c[2] * 255.0]) {
                    st.extend(pth.iter().flat_map(|q| [q.0 as f32, q.1 as f32]));
                }
            }
            assert!(!st.is_empty(), "stars in eye {}", i);
            stars.push(st);
        }
        assert_eq!(stars[0], stars[1], "turn {:?}: the stars have no parallax", (y, p, r));
    }
}
