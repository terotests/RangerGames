// SPDX-License-Identifier: AGPL-3.0-or-later
//! VR (rg.xr): the eyes the 3D scene is drawn for, the 2D view as a panel
//! floating in front of the player, and the hand controllers.
//!
//! Two kinds of VR:
//!
//! - `stereo`: the phone (or tablet) in a cardboard-style viewer. The engine
//!   draws the 3D scene twice, side by side, turned by the phone's own
//!   rotation sensor (rg.sensor "orient"). Works on every host that draws
//!   the 3D with GL (gl3d or rg_gl): no host changes.
//! - `vr`: a headset (Meta Quest: OpenXR in the Android host, WebXR in the
//!   Quest browser). The host tells the engine every frame where the eyes
//!   and the controllers are (`Engine::xr_input`), then asks for each eye's
//!   triangles (`Engine::xr_eye`) and draws them, the 2D view as a textured
//!   panel and the controllers' rays over it.
//!
//! Spaces: the host's poses are in its tracking space (metres, y up, -z the
//! way the player first looked). Recentring takes off the head's position
//! and turn at that moment, so after it the head is at 0 looking down -z.
//! The game's own camera (`<perspectiveCamera>` or rg.three "camera") is the
//! rig: where the head is in the game's world, and (rig "yaw") which way is
//! ahead. `scale` is game units per metre.

use rg_core::json::{self, member, Json};

pub type V3 = [f64; 3];
/// a rotation as x, y, z, w
pub type Q = [f64; 4];

/// eye units per tangent: an eye's view is (tl + tr) * K wide
pub const K: f64 = 1000.0;

fn add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn mul(a: V3, k: f64) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
fn dot(a: V3, b: V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
fn norm(a: V3) -> V3 {
    let l = dot(a, a).sqrt();
    if l > 1e-12 { mul(a, 1.0 / l) } else { [0.0; 3] }
}

/// v turned by q
pub fn rotate(q: Q, v: V3) -> V3 {
    let u = [q[0], q[1], q[2]];
    let t = mul(cross(u, v), 2.0);
    add(add(v, mul(t, q[3])), cross(u, t))
}

pub fn qmul(a: Q, b: Q) -> Q {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}

/// a turn of `a` radians round y
fn qyaw(a: f64) -> Q {
    let (s, c) = (a / 2.0).sin_cos();
    [0.0, s, 0.0, c]
}

/// The rotation whose x, y, z axes are the columns given (orthonormal).
pub fn q_from_axes(x: V3, y: V3, z: V3) -> Q {
    let (m00, m11, m22) = (x[0], y[1], z[2]);
    let tr = m00 + m11 + m22;
    let q = if tr > 0.0 {
        let s = (tr + 1.0).sqrt() * 2.0;
        [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, 0.25 * s]
    } else if m00 > m11 && m00 > m22 {
        let s = (1.0 + m00 - m11 - m22).sqrt() * 2.0;
        [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]
    } else if m11 > m22 {
        let s = (1.0 + m11 - m00 - m22).sqrt() * 2.0;
        [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s]
    } else {
        let s = (1.0 + m22 - m00 - m11).sqrt() * 2.0;
        [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s]
    };
    let l = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt().max(1e-12);
    [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/// The heading of a rotation's forward (-z), radians round y (0: -z).
fn yaw_of(q: Q) -> f64 {
    let f = rotate(q, [0.0, 0.0, -1.0]);
    if f[0].abs() + f[2].abs() < 1e-6 {
        // looking straight up or down: the top of the head says ahead
        let u = rotate(q, [0.0, 1.0, 0.0]);
        let s = if f[1] < 0.0 { 1.0 } else { -1.0 };
        return (-u[0] * s).atan2(-u[2] * s);
    }
    (-f[0]).atan2(-f[2])
}

#[derive(Clone, Copy, Debug)]
pub struct Pose {
    pub p: V3,
    pub q: Q,
}

impl Pose {
    pub const ID: Pose = Pose { p: [0.0; 3], q: [0.0, 0.0, 0.0, 1.0] };
}

/// One eye: where it is and how wide it sees (tangents left, right, up, down).
#[derive(Clone, Copy, Debug)]
pub struct View {
    pub pose: Pose,
    pub tan: [f64; 4],
}

/// One eye in a world, as the renderers want it: position, right, up and
/// forward axes, and the tangents. The eye's picture is `size()` units, the
/// point straight ahead at `centre()`, `K` units per tangent.
#[derive(Clone, Copy, Debug)]
pub struct Eye {
    pub pos: V3,
    pub r: V3,
    pub u: V3,
    pub f: V3,
    pub tan: [f64; 4],
}

impl Eye {
    pub fn size(&self) -> (f64, f64) {
        (K * (self.tan[0] + self.tan[1]), K * (self.tan[2] + self.tan[3]))
    }
    pub fn centre(&self) -> (f64, f64) {
        (K * self.tan[0], K * self.tan[2])
    }
    /// The same eye with a symmetric view that covers this one (for drawing
    /// that puts the middle of the view at w/2, h/2: planets, stars).
    pub fn symmetric(&self) -> Eye {
        let (x, y) = (self.tan[0].max(self.tan[1]), self.tan[2].max(self.tan[3]));
        Eye { tan: [x, x, y, y], ..*self }
    }
    /// Where this eye's view is in its symmetric one's units: x, y, w, h.
    pub fn in_symmetric(&self) -> [f64; 4] {
        let s = self.symmetric();
        let (w, h) = self.size();
        [K * (s.tan[0] - self.tan[0]), K * (s.tan[2] - self.tan[2]), w, h]
    }
}

#[derive(Clone, Debug, Default)]
pub struct Hand {
    /// "left" or "right"
    pub side: String,
    /// the pointing ray's pose (forward = -z) and the grip's
    pub aim: Option<Pose>,
    pub grip: Option<Pose>,
    /// trigger, squeeze, stick press, a / x, b / y, menu (0…1)
    pub buttons: [f64; 6],
    pub stick: [f64; 2],
}

const BUTTONS: [&str; 6] = ["trigger", "squeeze", "stick", "a", "b", "menu"];

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Mode {
    Off,
    Stereo,
    Vr,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Rig {
    /// ahead = the game camera's heading, up = world up (default: no tilted horizon)
    Yaw,
    /// the game camera's whole turn (a cockpit that rolls)
    Full,
    /// the world's own axes (the camera's position only)
    Fixed,
}

/// The 2D view as a panel in the tracking space.
#[derive(Clone, Copy, Debug)]
pub struct Panel {
    pub visible: bool,
    /// metres from the head, its longer side in metres, its centre's height below the eyes
    pub distance: f64,
    pub size: f64,
    pub drop: f64,
    /// turns to stay in front of the player when they look far away
    pub follow: bool,
    /// its heading (radians round y, 0 = -z) and centre
    pub yaw: f64,
    pub centre: V3,
    /// the game's height / width
    pub aspect: f64,
}

impl Panel {
    fn axes(&self) -> (V3, V3, V3) {
        let (s, c) = self.yaw.sin_cos();
        let right = [c, 0.0, -s];
        // (yaw 0: the panel ahead on -z, its right +x, facing +z)
        let up = [0.0, 1.0, 0.0];
        let towards = [s, 0.0, c]; // from the panel to the player
        (right, up, towards)
    }
    pub fn width(&self) -> f64 {
        if self.aspect > 1.0 { self.size / self.aspect } else { self.size }
    }
    pub fn height(&self) -> f64 {
        self.width() * self.aspect
    }
    /// corners: top left, top right, bottom right, bottom left
    pub fn corners(&self) -> [V3; 4] {
        let (r, u, _) = self.axes();
        let (hw, hh) = (self.width() / 2.0, self.height() / 2.0);
        let c = self.centre;
        [
            add(add(c, mul(r, -hw)), mul(u, hh)),
            add(add(c, mul(r, hw)), mul(u, hh)),
            add(add(c, mul(r, hw)), mul(u, -hh)),
            add(add(c, mul(r, -hw)), mul(u, -hh)),
        ]
    }
    /// Where a ray meets the panel: (distance, u, v), u and v 0…1 from its top left.
    pub fn hit(&self, o: V3, d: V3) -> Option<(f64, f64, f64)> {
        if !self.visible {
            return None;
        }
        let (r, u, n) = self.axes();
        let den = dot(d, n);
        if den > -1e-6 {
            return None;
        }
        let t = dot(sub(self.centre, o), n) / den;
        if t <= 0.0 {
            return None;
        }
        let p = sub(add(o, mul(d, t)), self.centre);
        let a = dot(p, r) / self.width() + 0.5;
        let b = 0.5 - dot(p, u) / self.height();
        if (0.0..=1.0).contains(&a) && (0.0..=1.0).contains(&b) {
            Some((t, a, b))
        } else {
            None
        }
    }
}

/// A pointer event for the game's 2D view or its 3D world.
#[derive(Clone, Debug)]
pub struct PointerEv {
    /// 0 down, 1 move, 2 up
    pub kind: i32,
    pub id: i64,
    /// on the panel: game units; else None (the ray goes into the world)
    pub at: Option<(f64, f64)>,
    /// the ray in the tracking space (recentred)
    pub ray: (V3, V3),
}

pub struct Xr {
    /// what the game asked for
    pub mode: Mode,
    /// the host can show a headset session (WebXR immersive-vr / OpenXR)
    pub vr_ok: bool,
    /// the host draws everything in a headset all the time (the Quest app):
    /// the 2D view is a panel even when the game did not ask for VR
    pub always: bool,
    /// the headset session is running (the host's views come every frame)
    pub running: bool,
    pub views: Vec<View>,
    pub head: Pose,
    pub hands: Vec<Hand>,
    pub scale: f64,
    pub rig: Rig,
    pub panel: Panel,
    /// recentring: the head's turn and position taken off
    yaw0: f64,
    p0: V3,
    recentre: bool,
    /// stereo: the phone's rotation (rows: screen right, up, out; x east, y north, z up)
    orient: Option<[f64; 9]>,
    /// stereo: the vertical field of view (degrees) and the eyes' distance (metres)
    pub fov: f64,
    pub ipd: f64,
    /// how far apart the eyes are against the real ones (1; 0: flat, both at
    /// the head; more: a huge world looks like a model), with `scale`
    pub stereo: f64,
    /// buttons held last frame, per hand
    held: Vec<[bool; 6]>,
    /// the game's events (onXR)
    pub events: Vec<Json>,
    /// pointer events from the triggers, for the engine's input
    pub pointers: Vec<PointerEv>,
    /// per hand: where its ray meets the panel (distance, u, v)
    pub hits: Vec<Option<(f64, f64, f64)>>,
}

impl Default for Xr {
    fn default() -> Xr {
        Xr::new()
    }
}

fn v3j(v: V3) -> Json {
    Json::Arr(vec![Json::Num(v[0]), Json::Num(v[1]), Json::Num(v[2])])
}
fn qj(q: Q) -> Json {
    Json::Arr(vec![Json::Num(q[0]), Json::Num(q[1]), Json::Num(q[2]), Json::Num(q[3])])
}
fn jv3(j: &Json, d: V3) -> V3 {
    match j {
        Json::Arr(a) if a.len() >= 3 => [a[0].as_num(d[0]), a[1].as_num(d[1]), a[2].as_num(d[2])],
        _ => d,
    }
}
fn jq(j: &Json) -> Q {
    match j {
        Json::Arr(a) if a.len() >= 4 => {
            let q = [a[0].as_num(0.0), a[1].as_num(0.0), a[2].as_num(0.0), a[3].as_num(1.0)];
            let l = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();
            if l > 1e-9 { [q[0] / l, q[1] / l, q[2] / l, q[3] / l] } else { [0.0, 0.0, 0.0, 1.0] }
        }
        _ => [0.0, 0.0, 0.0, 1.0],
    }
}
fn jpose(j: &Json) -> Option<Pose> {
    if j.is_null() {
        return None;
    }
    Some(Pose { p: jv3(&j.get("p"), [0.0; 3]), q: jq(&j.get("q")) })
}

impl Xr {
    pub fn new() -> Xr {
        Xr {
            mode: Mode::Off,
            vr_ok: false,
            always: false,
            running: false,
            views: Vec::new(),
            head: Pose::ID,
            hands: Vec::new(),
            scale: 1.0,
            rig: Rig::Yaw,
            panel: Panel { visible: true, distance: 1.3, size: 1.0, drop: 0.1, follow: true, yaw: 0.0, centre: [0.0, -0.15, -1.4], aspect: 16.0 / 9.0 },
            yaw0: 0.0,
            p0: [0.0; 3],
            recentre: true,
            orient: None,
            fov: 90.0,
            ipd: 0.063,
            stereo: 1.0,
            held: Vec::new(),
            events: Vec::new(),
            pointers: Vec::new(),
            hits: Vec::new(),
        }
    }

    /// The game's options (rg.xr.enter / rg.xr.set): scale, rig, panel, fov, ipd.
    pub fn options(&mut self, o: &Json) {
        let s = o.get("scale").as_num(self.scale);
        if s > 0.0 && s.is_finite() {
            self.scale = s;
        }
        match o.get("rig").as_str().as_str() {
            "yaw" => self.rig = Rig::Yaw,
            "full" => self.rig = Rig::Full,
            "fixed" | "none" => self.rig = Rig::Fixed,
            _ => {}
        }
        let f = o.get("fov").as_num(self.fov);
        if f > 20.0 && f < 170.0 {
            self.fov = f;
        }
        let i = o.get("ipd").as_num(self.ipd);
        if (0.0..0.2).contains(&i) {
            self.ipd = i;
        }
        let k = o.get("stereo").as_num(self.stereo);
        if (0.0..=1000.0).contains(&k) {
            self.stereo = k;
        }
        let p = o.get("panel");
        match &p {
            Json::Bool(b) => self.panel.visible = *b,
            Json::Obj(_) => {
                if let Json::Bool(b) = p.get("visible") {
                    self.panel.visible = b;
                }
                if let Json::Bool(b) = p.get("follow") {
                    self.panel.follow = b;
                }
                let d = p.get("distance").as_num(self.panel.distance);
                let sz = p.get("size").as_num(self.panel.size);
                let dr = p.get("drop").as_num(self.panel.drop);
                if d > 0.2 && d < 50.0 {
                    self.panel.distance = d;
                }
                if sz > 0.05 && sz < 50.0 {
                    self.panel.size = sz;
                }
                if dr.is_finite() {
                    self.panel.drop = dr;
                }
                self.place_panel(self.head_r());
            }
            _ => {}
        }
    }

    /// rg.xr.enter(mode, opts)
    pub fn enter(&mut self, mode: &str, o: &Json) {
        // each enter starts from the defaults (an earlier game's or mode's options do not stay)
        let d = Xr::new();
        self.scale = d.scale;
        self.rig = d.rig;
        self.fov = d.fov;
        self.ipd = d.ipd;
        self.stereo = d.stereo;
        let aspect = self.panel.aspect;
        self.panel = d.panel;
        self.panel.aspect = aspect;
        self.options(o);
        self.mode = match mode {
            "stereo" => Mode::Stereo,
            _ => Mode::Vr,
        };
        self.recentre = true;
        if self.mode == Mode::Stereo {
            self.running = true;
            self.events.push(json::obj(vec![member("type", Json::Str("start".into())), member("mode", Json::Str("stereo".into()))]));
        } else if self.always && !self.views.is_empty() {
            // the headset is on already (the Quest app): the world around at once
            self.running = true;
            self.events.push(json::obj(vec![member("type", Json::Str("start".into())), member("mode", Json::Str("vr".into()))]));
        }
    }

    pub fn exit(&mut self) {
        if self.mode == Mode::Off {
            return;
        }
        let was = self.mode;
        self.mode = Mode::Off;
        if !self.always {
            self.running = false;
        }
        self.orient = None;
        self.events.push(json::obj(vec![
            member("type", Json::Str("end".into())),
            member("mode", Json::Str(if was == Mode::Stereo { "stereo" } else { "vr" }.into())),
        ]));
    }

    pub fn recentre_now(&mut self) {
        self.recentre = true;
    }

    /// The phone's rotation for stereo (rg.sensor "orient").
    pub fn orient(&mut self, m: &Json) {
        if let Json::Arr(a) = m {
            if a.len() == 9 {
                let mut v = [0.0; 9];
                for (i, x) in a.iter().enumerate() {
                    v[i] = x.as_num(0.0);
                }
                self.orient = Some(v);
            }
        }
    }

    /// The 3D scene is drawn per eye (by the engine or the host), not as one picture.
    pub fn eyes_on(&self) -> bool {
        self.running && self.mode != Mode::Off && (self.mode == Mode::Stereo || !self.views.is_empty())
    }

    /// The host draws the frame in a headset (the 2D view on a panel).
    pub fn headset(&self) -> bool {
        (self.always || (self.mode == Mode::Vr && self.running)) && !self.views.is_empty()
    }

    /// The world around the player (not only a panel in an empty room).
    pub fn immersive(&self) -> bool {
        self.mode == Mode::Vr && self.running && !self.views.is_empty()
    }

    /// The head's rotation after recentring.
    fn head_r(&self) -> Pose {
        self.local(self.head)
    }

    /// A tracking-space pose with the recentring taken off.
    pub fn local(&self, p: Pose) -> Pose {
        let back = qyaw(-self.yaw0);
        Pose { p: rotate(back, sub(p.p, self.p0)), q: qmul(back, p.q) }
    }

    fn place_panel(&mut self, head: Pose) {
        let yaw = yaw_of(head.q);
        self.panel.yaw = yaw;
        let ahead = [-yaw.sin(), 0.0, -yaw.cos()];
        self.panel.centre = add(add(head.p, mul(ahead, self.panel.distance)), [0.0, -self.panel.drop, 0.0]);
    }

    /// The host's frame (Engine::xr_input): {views: [{p, q, t: [l, r, u, d]}],
    /// head: {p, q}, hands: [{side, aim: {p, q}, grip, buttons: [6], stick: [2]}]}
    /// or an event {event: "start" | "end" | "error" | "caps", ...}.
    pub fn input(&mut self, j: &Json, aspect: f64) {
        self.panel.aspect = if aspect > 0.0 && aspect.is_finite() { aspect } else { self.panel.aspect };
        match j.get("event").as_str().as_str() {
            "caps" => {
                self.vr_ok = j.get("vr").as_bool();
                self.always = j.get("always").as_bool();
                return;
            }
            "start" => {
                self.running = true;
                self.recentre = true;
                if self.mode != Mode::Off || !self.always {
                    self.events.push(json::obj(vec![member("type", Json::Str("start".into())), member("mode", Json::Str("vr".into()))]));
                }
                return;
            }
            "end" => {
                self.views.clear();
                self.hands.clear();
                if self.mode == Mode::Vr {
                    self.mode = Mode::Off;
                    self.events.push(json::obj(vec![member("type", Json::Str("end".into())), member("mode", Json::Str("vr".into()))]));
                }
                self.running = false;
                return;
            }
            "error" => {
                if self.mode == Mode::Vr {
                    self.mode = Mode::Off;
                }
                self.running = false;
                self.events.push(json::obj(vec![member("type", Json::Str("error".into())), member("reason", j.get("reason"))]));
                return;
            }
            _ => {}
        }
        self.views = j.get("views").items().iter().map(|v| {
            let t = v.get("t");
            let tt = |i: usize, d: f64| match &t { Json::Arr(a) if a.len() == 4 => a[i].as_num(d).abs().clamp(0.05, 6.0), _ => d };
            View { pose: jpose(v).unwrap_or(Pose::ID), tan: [tt(0, 1.0), tt(1, 1.0), tt(2, 1.0), tt(3, 1.0)] }
        }).collect();
        self.head = jpose(&j.get("head")).unwrap_or_else(|| {
            // the eyes' middle
            if self.views.len() >= 2 {
                Pose { p: mul(add(self.views[0].pose.p, self.views[1].pose.p), 0.5), q: self.views[0].pose.q }
            } else {
                self.views.first().map(|v| v.pose).unwrap_or(Pose::ID)
            }
        });
        self.hands = j.get("hands").items().iter().map(|h| {
            let mut out = Hand { side: h.get("side").as_str(), aim: jpose(&h.get("aim")), grip: jpose(&h.get("grip")), ..Default::default() };
            for (i, b) in h.get("buttons").items().iter().enumerate().take(6) {
                out.buttons[i] = b.as_num(0.0);
            }
            for (i, a) in h.get("stick").items().iter().enumerate().take(2) {
                out.stick[i] = a.as_num(0.0);
            }
            out
        }).collect();
        if !self.views.is_empty() && !self.running && self.always {
            self.running = true;
            // entered before the headset's first frame: the world around from now
            if self.mode == Mode::Vr {
                self.recentre = true;
                self.events.push(json::obj(vec![member("type", Json::Str("start".into())), member("mode", Json::Str("vr".into()))]));
            }
        }
    }

    /// Before the game's frame: recentring, the panel, the buttons' events
    /// and the triggers as pointers on the panel (game units: `gw` × `gh`).
    pub fn step(&mut self, gw: f64, gh: f64) {
        self.pointers.clear();
        if self.mode == Mode::Stereo {
            self.stereo_views(gw, gh);
        }
        if self.views.is_empty() {
            return;
        }
        if self.recentre {
            self.recentre = false;
            self.yaw0 = yaw_of(self.head.q);
            self.p0 = self.head.p;
            let h = self.head_r();
            self.place_panel(h);
        }
        let head = self.head_r();
        if self.panel.follow && self.headset() {
            // the panel turns after the player when they look well away from it
            let want = yaw_of(head.q);
            let mut d = want - self.panel.yaw;
            while d > std::f64::consts::PI { d -= 2.0 * std::f64::consts::PI; }
            while d < -std::f64::consts::PI { d += 2.0 * std::f64::consts::PI; }
            if d.abs() > 0.9 {
                let y = self.panel.yaw + d * 0.08;
                let mut h2 = head;
                h2.q = qyaw(y);
                self.place_panel(h2);
            }
        }
        if self.held.len() != self.hands.len() {
            self.held = vec![[false; 6]; self.hands.len()];
        }
        self.hits = vec![None; self.hands.len()];
        let mut events = Vec::new();
        for (i, h) in self.hands.iter().enumerate() {
            let ray = match h.aim.map(|a| self.local(a)) {
                Some(a) => (a.p, rotate(a.q, [0.0, 0.0, -1.0])),
                None => continue,
            };
            let hit = self.panel.hit(ray.0, ray.1);
            self.hits[i] = hit;
            let id = 9000 + i as i64;
            let at = hit.map(|(_, u, v)| (u * gw, v * gh));
            for (b, name) in BUTTONS.iter().enumerate() {
                let down = h.buttons[b] > 0.55 || (self.held[i][b] && h.buttons[b] > 0.35);
                if down != self.held[i][b] {
                    events.push(json::obj(vec![
                        member("type", Json::Str("button".into())),
                        member("hand", Json::Str(h.side.clone())),
                        member("button", Json::Str((*name).into())),
                        member("down", Json::Bool(down)),
                    ]));
                    if b == 0 {
                        self.pointers.push(PointerEv { kind: if down { 0 } else { 2 }, id, at, ray });
                    }
                    self.held[i][b] = down;
                } else if b == 0 && down {
                    self.pointers.push(PointerEv { kind: 1, id, at, ray });
                }
            }
        }
        self.events.extend(events);
    }

    /// stereo: two eyes from the phone's rotation, each half the screen
    fn stereo_views(&mut self, gw: f64, gh: f64) {
        // phone axes (east, north, up rows) into the tracking space (x east, y up, z south)
        let conv = |x: f64, y: f64, z: f64| -> V3 { [x, z, -y] };
        let q = match self.orient {
            Some(m) => {
                let r = norm(conv(m[0], m[1], m[2]));
                let u = norm(conv(m[3], m[4], m[5]));
                let b = norm(conv(m[6], m[7], m[8]));
                q_from_axes(r, u, b)
            }
            None => [0.0, 0.0, 0.0, 1.0],
        };
        let half_w = (gw / 2.0).max(1.0);
        let tu = (self.fov.to_radians() / 2.0).tan();
        let tl = tu * half_w / gh.max(1.0);
        let r = rotate(q, [1.0, 0.0, 0.0]);
        self.head = Pose { p: [0.0; 3], q };
        self.views = [-1.0, 1.0].iter().map(|s| View { pose: Pose { p: mul(r, s * self.ipd / 2.0), q }, tan: [tl, tl, tu, tu] }).collect();
    }

    /// Eye `i` in a world whose camera (the rig) is at `pos` with axes r, u, f.
    pub fn eye(&self, i: usize, pos: V3, r: V3, u: V3, f: V3) -> Option<Eye> {
        let v = self.views.get(i)?;
        let mut l = self.local(v.pose);
        if self.stereo != 1.0 {
            // the eye's place from the head's, its offset times `stereo`
            let h = self.local(self.head).p;
            l.p = add(h, mul(sub(l.p, h), self.stereo));
        }
        let (rr, ru, rb) = self.rig_axes(r, u, f);
        let to_world = |d: V3| add(add(mul(rr, d[0]), mul(ru, d[1])), mul(rb, d[2]));
        let p = add(pos, mul(to_world(l.p), self.scale));
        Some(Eye {
            pos: p,
            r: to_world(rotate(l.q, [1.0, 0.0, 0.0])),
            u: to_world(rotate(l.q, [0.0, 1.0, 0.0])),
            f: to_world(rotate(l.q, [0.0, 0.0, -1.0])),
            tan: v.tan,
        })
    }

    /// Eye `i` in the tracking space itself (the panel, rays, the room).
    pub fn eye_local(&self, i: usize) -> Option<Eye> {
        let v = self.views.get(i)?;
        let l = self.local(v.pose);
        Some(Eye { pos: l.p, r: rotate(l.q, [1.0, 0.0, 0.0]), u: rotate(l.q, [0.0, 1.0, 0.0]), f: rotate(l.q, [0.0, 0.0, -1.0]), tan: v.tan })
    }

    /// The rig's right, up and back (tracking +x, +y, +z in the world).
    fn rig_axes(&self, r: V3, u: V3, f: V3) -> (V3, V3, V3) {
        match self.rig {
            Rig::Full => (r, u, mul(f, -1.0)),
            Rig::Fixed => ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]),
            Rig::Yaw => {
                let mut h = [f[0], 0.0, f[2]];
                if dot(h, h) < 1e-6 {
                    // the camera looks straight down (or up): its top is ahead
                    h = if f[1] < 0.0 { [u[0], 0.0, u[2]] } else { [-u[0], 0.0, -u[2]] };
                }
                let h = norm(h);
                let h = if dot(h, h) < 0.5 { [0.0, 0.0, -1.0] } else { h };
                let right = cross(h, [0.0, 1.0, 0.0]);
                (right, [0.0, 1.0, 0.0], mul(h, -1.0))
            }
        }
    }

    /// A ray of the tracking space in a world (rig as in `eye`).
    pub fn ray_world(&self, ray: (V3, V3), pos: V3, r: V3, u: V3, f: V3) -> (V3, V3) {
        let (rr, ru, rb) = self.rig_axes(r, u, f);
        let to_world = |d: V3| add(add(mul(rr, d[0]), mul(ru, d[1])), mul(rb, d[2]));
        (add(pos, mul(to_world(ray.0), self.scale)), norm(to_world(ray.1)))
    }

    /// For the game (rg.xr): mode, head, hands (rays in the world given).
    pub fn state(&self, rig: Option<(V3, V3, V3, V3)>) -> Json {
        let head = self.head_r();
        let hands: Vec<Json> = self.hands.iter().enumerate().map(|(i, h)| {
            let mut m = vec![member("hand", Json::Str(h.side.clone()))];
            if let Some(a) = h.aim.map(|a| self.local(a)) {
                m.push(member("position", v3j(a.p)));
                m.push(member("quaternion", qj(a.q)));
                let ray = (a.p, rotate(a.q, [0.0, 0.0, -1.0]));
                let (o, d) = match rig {
                    Some((p, r, u, f)) => self.ray_world(ray, p, r, u, f),
                    None => ray,
                };
                m.push(member("ray", json::obj(vec![member("origin", v3j(o)), member("direction", v3j(d))])));
            }
            if let Some(g) = h.grip.map(|g| self.local(g)) {
                m.push(member("grip", json::obj(vec![member("position", v3j(g.p)), member("quaternion", qj(g.q))])));
            }
            for (b, name) in BUTTONS.iter().enumerate() {
                m.push(member(name, Json::Num(h.buttons[b])));
            }
            m.push(member("stick", Json::Arr(vec![Json::Num(h.stick[0]), Json::Num(h.stick[1])])));
            m.push(member("onPanel", Json::Bool(self.hits.get(i).map(|h| h.is_some()).unwrap_or(false))));
            json::obj(m)
        }).collect();
        json::obj(vec![
            member("mode", Json::Str(match self.mode { Mode::Off => "", Mode::Stereo => "stereo", Mode::Vr => "vr" }.into())),
            member("running", Json::Bool(self.eyes_on() || self.headset())),
            member("vr", Json::Bool(self.vr_ok || self.always)),
            member("headset", Json::Bool(self.headset())),
            member("head", json::obj(vec![member("position", v3j(head.p)), member("quaternion", qj(head.q))])),
            member("hands", Json::Arr(hands)),
            member("events", Json::Arr(self.events.clone())),
        ])
    }

    /// The panel's corners for eye `i` as clip-space points (x, y, z, w),
    /// in the order top left, top right, bottom right, bottom left; None
    /// when hidden or wholly behind the eye.
    pub fn panel_clip(&self, i: usize) -> Option<[[f32; 4]; 4]> {
        if !self.panel.visible {
            return None;
        }
        let e = self.eye_local(i)?;
        let (w, h) = e.size();
        let (cx, cy) = e.centre();
        let mut out = [[0.0f32; 4]; 4];
        let mut any = false;
        for (k, c) in self.panel.corners().iter().enumerate() {
            let d = sub(*c, e.pos);
            let (x, y, z) = (dot(d, e.r), dot(d, e.u), dot(d, e.f));
            // screen units: sx = cx + x / z * K, ndc = sx / w * 2 - 1; times z
            // (homogeneous, so the GPU interpolates the picture in perspective)
            let (hx, hy) = ((cx * 2.0 / w - 1.0) * z + x * 2.0 * K / w, (1.0 - cy * 2.0 / h) * z + y * 2.0 * K / h);
            if z > 0.01 {
                any = true;
            }
            out[k] = [hx as f32, hy as f32, 0.0, z as f32];
        }
        if any { Some(out) } else { None }
    }

    /// The controllers' rays and the cursor on the panel for eye `i`, as
    /// triangles in the eye's units (6 floats a corner, depth 0): drawn over
    /// everything.
    pub fn pointer_tris(&self, i: usize, out: &mut Vec<f32>) {
        let e = match self.eye_local(i) {
            Some(e) => e,
            None => return,
        };
        let (cx, cy) = e.centre();
        let near = 0.02;
        let proj = |p: V3| -> Option<(f64, f64, f64)> {
            let d = sub(p, e.pos);
            let z = dot(d, e.f);
            if z < near {
                return None;
            }
            Some((cx + dot(d, e.r) / z * K, cy - dot(d, e.u) / z * K, z))
        };
        let mut quad = |a: V3, b: V3, side: V3, c0: V3, c1: V3| {
            let pts = [sub(a, side), add(a, side), add(b, side), sub(b, side)];
            let pr: Vec<Option<(f64, f64, f64)>> = pts.iter().map(|p| proj(*p)).collect();
            if pr.iter().any(|p| p.is_none()) {
                return;
            }
            let s: Vec<(f64, f64, f64)> = pr.into_iter().map(|p| p.unwrap()).collect();
            let cols = [c0, c0, c1, c1];
            for &k in [0usize, 1, 2, 0, 2, 3].iter() {
                out.extend_from_slice(&[s[k].0 as f32, s[k].1 as f32, 0.0, cols[k][0] as f32, cols[k][1] as f32, cols[k][2] as f32]);
            }
        };
        for (hi, h) in self.hands.iter().enumerate() {
            let a = match h.aim.map(|a| self.local(a)) {
                Some(a) => a,
                None => continue,
            };
            let dir = rotate(a.q, [0.0, 0.0, -1.0]);
            let hit = self.hits.get(hi).cloned().flatten();
            let len = hit.map(|h| h.0).unwrap_or(1.5);
            let start = add(a.p, mul(dir, 0.05));
            let end = add(a.p, mul(dir, len));
            // the ray's width across the line of sight
            let side = mul(norm(cross(dir, sub(start, e.pos))), 0.0025);
            let pressed = h.buttons[0] > 0.55;
            let c0 = if pressed { [1.0, 0.85, 0.3] } else { [0.6, 0.85, 1.0] };
            let c1 = if hit.is_some() { c0 } else { [0.05, 0.08, 0.15] };
            quad(start, end, side, c0, c1);
            if let Some((t, _, _)) = hit {
                // the cursor: a small square on the panel, facing the player
                let (r, u, n) = self.panel.axes();
                let p = add(add(a.p, mul(dir, t)), mul(n, 0.003));
                let s = if pressed { 0.012 } else { 0.016 };
                let col = if pressed { [1.0, 0.85, 0.3] } else { [1.0, 1.0, 1.0] };
                quad(add(p, mul(u, s)), sub(p, mul(u, s)), mul(r, s), col, col);
            }
        }
    }

    /// An empty room (the panel's surroundings when the game has no 3D): a
    /// floor of rings under the player, as triangles in eye `i`'s units.
    pub fn room_tris(&self, i: usize, out: &mut Vec<f32>) {
        let e = match self.eye_local(i) {
            Some(e) => e,
            None => return,
        };
        let (w, h) = e.size();
        let (cx, cy) = e.centre();
        let near = 0.05;
        // sky: a gradient by how high each corner of the view looks
        let corner = |sx: f64, sy: f64| -> V3 {
            let d = norm(add(add(e.f, mul(e.r, (sx - cx) / K)), mul(e.u, (cy - sy) / K)));
            let k = (d[1] * 0.5 + 0.5).clamp(0.0, 1.0);
            let top = [0.10, 0.14, 0.28];
            let low = [0.30, 0.34, 0.45];
            add(mul(low, 1.0 - k), mul(top, k))
        };
        for &(x, y) in [(0.0, 0.0), (w, 0.0), (w, h), (0.0, 0.0), (w, h), (0.0, h)].iter() {
            let c = corner(x, y);
            out.extend_from_slice(&[x as f32, y as f32, 1.0, c[0] as f32, c[1] as f32, c[2] as f32]);
        }
        // the floor 1.6 m under the eyes at recentring: rings of tiles
        let floor = -1.6;
        let proj = |p: V3| -> V3 {
            let d = sub(p, e.pos);
            [dot(d, e.r), dot(d, e.u), dot(d, e.f)]
        };
        let rings = 10;
        let segs = 32;
        for ri in 0..rings {
            let r0 = 0.6 * ri as f64;
            let r1 = 0.6 * (ri + 1) as f64;
            for si in 0..segs {
                let a0 = si as f64 / segs as f64 * std::f64::consts::TAU;
                let a1 = (si + 1) as f64 / segs as f64 * std::f64::consts::TAU;
                let pts = [[r0 * a0.cos(), floor, r0 * a0.sin()], [r1 * a0.cos(), floor, r1 * a0.sin()], [r1 * a1.cos(), floor, r1 * a1.sin()], [r0 * a1.cos(), floor, r0 * a1.sin()]];
                let v: Vec<V3> = pts.iter().map(|p| proj(*p)).collect();
                // near-plane clip
                let mut poly: Vec<V3> = Vec::new();
                for k in 0..4 {
                    let a = v[k];
                    let b = v[(k + 1) % 4];
                    if a[2] >= near {
                        poly.push(a);
                    }
                    if (a[2] >= near) != (b[2] >= near) {
                        let t = (near - a[2]) / (b[2] - a[2]);
                        poly.push(add(a, mul(sub(b, a), t)));
                    }
                }
                if poly.len() < 3 {
                    continue;
                }
                let checker = (ri + si) % 2 == 0;
                let fade = 1.0 - ri as f64 / rings as f64;
                let base = if checker { [0.22, 0.25, 0.32] } else { [0.18, 0.21, 0.27] };
                let c = add(mul(base, 0.5 + 0.5 * fade), mul([0.30, 0.34, 0.45], 0.5 - 0.5 * fade));
                let s: Vec<(f64, f64, f64)> = poly.iter().map(|p| (cx + p[0] / p[2] * K, cy - p[1] / p[2] * K, p[2])).collect();
                for k in 1..s.len() - 1 {
                    for p in [s[0], s[k], s[k + 1]].iter() {
                        // 1/z depth over 0.05…100 m
                        let d = ((1.0 / near - 1.0 / p.2) / (1.0 / near - 1.0 / 100.0)).clamp(0.0, 0.999);
                        out.extend_from_slice(&[p.0 as f32, p.1 as f32, d as f32, c[0] as f32, c[1] as f32, c[2] as f32]);
                    }
                }
            }
        }
    }
}

/// Triangles drawn for an eye of `ew` × `eh` units, moved into the screen
/// rectangle `rect` (x, y, w, h, game units) and cut to it. Depth (1/z) and
/// colour are straight in screen space, so the cut keeps both right.
pub fn place_tris(src: &[f32], ew: f64, eh: f64, rect: [f64; 4], out: &mut Vec<f32>) {
    let (sx, sy) = (rect[2] / ew, rect[3] / eh);
    let (x0, y0, x1, y1) = (rect[0] as f32, rect[1] as f32, (rect[0] + rect[2]) as f32, (rect[1] + rect[3]) as f32);
    let mut poly: Vec<[f32; 6]> = Vec::with_capacity(9);
    let mut tmp: Vec<[f32; 6]> = Vec::with_capacity(9);
    for t in src.chunks_exact(18) {
        poly.clear();
        for k in 0..3 {
            let c = &t[k * 6..k * 6 + 6];
            poly.push([rect[0] as f32 + c[0] * sx as f32, rect[1] as f32 + c[1] * sy as f32, c[2], c[3], c[4], c[5]]);
        }
        let inside = poly.iter().all(|p| p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1);
        if !inside {
            // cut against each side: (axis, limit, keep greater)
            for &(ax, lim, ge) in [(0usize, x0, true), (0, x1, false), (1, y0, true), (1, y1, false)].iter() {
                tmp.clear();
                let n = poly.len();
                for k in 0..n {
                    let a = poly[k];
                    let b = poly[(k + 1) % n];
                    let ina = if ge { a[ax] >= lim } else { a[ax] <= lim };
                    let inb = if ge { b[ax] >= lim } else { b[ax] <= lim };
                    if ina {
                        tmp.push(a);
                    }
                    if ina != inb {
                        let f = (lim - a[ax]) / (b[ax] - a[ax]);
                        let mut p = [0.0f32; 6];
                        for j in 0..6 {
                            p[j] = a[j] + (b[j] - a[j]) * f;
                        }
                        tmp.push(p);
                    }
                }
                std::mem::swap(&mut poly, &mut tmp);
                if poly.len() < 3 {
                    break;
                }
            }
            if poly.len() < 3 {
                continue;
            }
        }
        for k in 1..poly.len() - 1 {
            out.extend_from_slice(&poly[0]);
            out.extend_from_slice(&poly[k]);
            out.extend_from_slice(&poly[k + 1]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: V3, b: V3) -> bool {
        (a[0] - b[0]).abs() < 1e-6 && (a[1] - b[1]).abs() < 1e-6 && (a[2] - b[2]).abs() < 1e-6
    }

    #[test]
    fn axes_and_back() {
        let q = qmul(qyaw(0.7), [0.2f64.sin(), 0.0, 0.0, 0.2f64.cos()]);
        let x = rotate(q, [1.0, 0.0, 0.0]);
        let y = rotate(q, [0.0, 1.0, 0.0]);
        let z = rotate(q, [0.0, 0.0, 1.0]);
        let q2 = q_from_axes(x, y, z);
        assert!(close(rotate(q2, [0.3, -0.2, 0.9]), rotate(q, [0.3, -0.2, 0.9])));
        assert!((yaw_of(q) - 0.7).abs() < 1e-9);
    }

    #[test]
    fn recentred_head_looks_down_the_rig() {
        let mut x = Xr::new();
        x.enter("vr", &Json::Null);
        // the player stands 2 m to the side, turned 90° left
        let q = qyaw(std::f64::consts::FRAC_PI_2);
        let j = json::parse(&format!(
            r#"{{"views":[{{"p":[2,1.6,0],"q":[0,{s},0,{c}],"t":[1,1,1,1]}}],"head":{{"p":[2,1.6,0],"q":[0,{s},0,{c}]}}}}"#,
            s = q[1], c = q[3]
        ));
        x.input(&j, 1.0);
        x.running = true;
        x.step(100.0, 100.0);
        // the game camera at (0, 5, 10) looking at the origin: the eye is at the
        // camera, looking the camera's heading (-z), level
        let e = x.eye(0, [0.0, 5.0, 10.0], [1.0, 0.0, 0.0], [0.0, 0.8, 0.6], [0.0, -0.6, -0.8]).unwrap();
        assert!(close(e.pos, [0.0, 5.0, 10.0]), "{:?}", e.pos);
        assert!(close(e.f, [0.0, 0.0, -1.0]), "{:?}", e.f);
        // the panel is ahead of the recentred head
        let (t, u, v) = x.panel.hit([0.0, 0.0, 0.0], [0.0, -0.1, -1.0]).unwrap();
        assert!(t > 1.0 && (u - 0.5).abs() < 0.05 && v > 0.3 && v < 0.7, "{} {} {}", t, u, v);
    }

    #[test]
    fn a_trigger_on_the_panel_is_a_tap() {
        let mut x = Xr::new();
        x.always = true;
        let j = json::parse(r#"{"views":[{"p":[0,1.6,0],"q":[0,0,0,1],"t":[1,1,1,1]}],
            "hands":[{"side":"right","aim":{"p":[0.2,1.45,-0.2],"q":[0,0,0,1]},"buttons":[1,0,0,0,0,0]}]}"#);
        x.input(&j, 1.0);
        x.step(360.0, 360.0);
        assert_eq!(x.pointers.len(), 1);
        let p = &x.pointers[0];
        assert_eq!(p.kind, 0);
        let (gx, gy) = p.at.unwrap();
        assert!(gx > 180.0 && gx < 360.0 && gy > 0.0 && gy < 360.0, "{} {}", gx, gy);
        assert!(x.events.iter().any(|e| e.get("button").as_str() == "trigger"));
    }

    #[test]
    fn placed_tris_are_cut_to_their_half() {
        // one triangle across the whole eye, into the left half of 200 × 100
        let src = [-50.0f32, 50.0, 0.5, 1.0, 0.0, 0.0, 150.0, 0.0, 0.5, 1.0, 0.0, 0.0, 150.0, 100.0, 0.5, 1.0, 0.0, 0.0];
        let mut out = Vec::new();
        place_tris(&src, 100.0, 100.0, [0.0, 0.0, 100.0, 100.0], &mut out);
        assert!(!out.is_empty() && out.len() % 18 == 0);
        for c in out.chunks_exact(6) {
            assert!(c[0] >= -1e-4 && c[0] <= 100.0001 && c[1] >= -1e-4 && c[1] <= 100.0001, "{:?}", c);
        }
    }
}
