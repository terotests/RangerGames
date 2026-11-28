// SPDX-License-Identifier: AGPL-3.0-or-later
//! rg_engine: the RangerGames engine.
//!
//! A game is a folder in the virtual resource directory (`/games/<id>/`):
//! `game.json` (its name, size and files), a TSX entry script and a
//! stylesheet, and whatever images and sounds it uses. The engine runs the
//! script in CErXes (a JavaScript / TypeScript / JSX engine written in
//! Ranger's Rust), lays out the JSX tree its `view()` returns with EVG and
//! the game's CSS, and writes the result as a draw stream the platform
//! paints. Sounds, vibration, saves and the 3D layer go to the platform as
//! host commands.
//!
//! ```text
//!  platform ──input──► Engine::frame ──► CErXes: tick(dt, input), view()
//!                                           │ element tree (JSON) + commands
//!                         EVG: cascade, layout, display list, hit test
//!  platform ◄──draw stream, host commands──┘
//! ```
//!
//! Each platform is a thin host around this: `rg_web` (WebAssembly, the
//! browser and the Android WebView shell) and `rg_cli` (headless, tests).

pub mod burst;
pub mod draw;
pub mod features;
pub mod fiber;
pub mod fluid;
pub mod globe;
pub mod gltf;
pub mod heights;
pub mod lod;
pub mod motion;
pub mod rig;
pub mod scene3d;
pub mod splats;
pub mod script;
pub mod ui;
pub mod xr;

use draw::DrawStream;
use rg_core::host::HostCommand;
use rg_core::input::{event_json, Input};
use rg_core::json::{self, member, quote, Json};
use rg_core::anim::Anims;
use rg_core::clock::FrameClock;
use rg_core::vfs::{self, Vfs};
use script::Script;
use ui::Ui;
use std::cell::RefCell;
use std::rc::Rc;

/// The script's synchronous questions to the engine (`__hostSync`): the 3D
/// world answers them (fiber.rs World::sync).
struct WorldSync {
    world: Rc<RefCell<fiber::World>>,
    /// the animations (a request starting with U+0002: rg.animate, rg.sequence …)
    anims: Rc<RefCell<Anims>>,
    /// the DOM backend's own requests (a request starting with U+0001:
    /// RangerDOM's style, DomBackend::host_sync)
    dom: Option<Box<dyn FnMut(&str) -> String>>,
}

impl cerxes::vm::HostSync for WorldSync {
    fn call(&mut self, request: &str) -> String {
        if request.starts_with('\u{1}') {
            return match self.dom.as_mut() {
                Some(f) => f(request),
                None => String::new(),
            };
        }
        if let Some(rest) = request.strip_prefix('\u{2}') {
            return match self.anims.try_borrow_mut() {
                Ok(mut a) => a.request(&json::parse(rest)).write(),
                Err(_) => "null".to_string(),
            };
        }
        match self.world.try_borrow_mut() {
            Ok(mut w) => w.sync(&json::parse(request)).write(),
            Err(_) => "null".to_string(),
        }
    }
}

/// Another way to lay out and draw the game's 2D view: the RangerDOM
/// renderer (crates/rg_web_dom, opt-in). The game's script then also has a
/// DOM (RangerDOM's webapi.js): the runtime puts each frame's element tree
/// into `document` (js/dom.js), the DOM's own CSS cascade styles it, and the
/// backend reads the page's render tree, lays it out and draws it.
pub trait DomBackend {
    /// The scripts the game's script engine runs before the runtime: the
    /// DOM itself, ready for a page of `w` x `h` (name, source).
    fn boot(&self, w: f64, h: f64) -> Vec<(String, String)>;
    /// A boot script compiled ahead (a CErXes unit as text, made from the
    /// same source), run in place of compiling it: None compiles it.
    fn unit(&self, _name: &str) -> Option<&'static str> {
        None
    }
    /// One frame, after `__frame` put the tree into the document: lays the
    /// page out and draws it into `out`. `eval` runs JS in the game's script;
    /// `image` gives a picture's natural size by its path in the virtual
    /// directory (PNG, JPEG, GIF), None when it is not there.
    fn render(&mut self, eval: &mut dyn FnMut(&str) -> String, image: &dyn Fn(&str) -> Option<(f64, f64)>, w: f64, h: f64, out: &mut DrawStream);
    /// The page's node under a point of the last frame ("" for none).
    fn node_at(&self, x: f64, y: f64) -> String;
    /// A new game: forget the last page.
    fn reset(&mut self);
    /// The last frame's times (ms): the page's render tree in JS, taking
    /// it in (EVG elements), layout, display list.
    fn timing(&self) -> [f64; 4] {
        [0.0; 4]
    }
    /// Frames drawn by the fast path and by the full path since the last call.
    fn frames(&mut self) -> (usize, usize) {
        (0, 0)
    }
    /// What answers the page's synchronous requests to the backend
    /// (`__hostSync` with a request starting with U+0001), for every game
    /// from now on.
    fn host_sync(&self) -> Option<Box<dyn FnMut(&str) -> String>> {
        None
    }
}

/// Milliseconds from some fixed time (0 on the web: no clock there).
#[cfg(not(target_arch = "wasm32"))]
pub fn now_ms() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}
#[cfg(target_arch = "wasm32")]
pub fn now_ms() -> f64 {
    0.0
}

/// Frame times summed over PERF_FRAMES frames, written to the log as one
/// line ("perf ..."; logcat on the phone): js (tick and view, and the
/// tree into the DOM), then the renderer's parts, boxes (rg.box) and the
/// whole frame, with its slowest.
pub const PERF_FRAMES: usize = 120;
#[derive(Default)]
pub struct Perf {
    pub sum: [f64; 7],
    pub max: f64,
    pub n: usize,
}

/// A picture's natural size from its header: PNG, GIF or JPEG.
pub fn image_size(b: &[u8]) -> Option<(f64, f64)> {
    let be16 = |i: usize| ((b[i] as u32) << 8 | b[i + 1] as u32) as f64;
    if b.len() >= 24 && b[0..8] == [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
        let be32 = |i: usize| u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as f64;
        return Some((be32(16), be32(20)));
    }
    if b.len() >= 10 && &b[0..3] == b"GIF" {
        return Some(((b[6] as u32 | (b[7] as u32) << 8) as f64, (b[8] as u32 | (b[9] as u32) << 8) as f64));
    }
    if b.len() >= 4 && b[0] == 0xff && b[1] == 0xd8 {
        let mut i = 2;
        while i + 9 < b.len() {
            if b[i] != 0xff {
                i += 1;
                continue;
            }
            let m = b[i + 1];
            // the start-of-frame markers carry the size
            if (0xc0..=0xcf).contains(&m) && m != 0xc4 && m != 0xc8 && m != 0xcc {
                return Some((be16(i + 7), be16(i + 5)));
            }
            i += 2 + be16(i + 2) as usize;
        }
    }
    None
}

/// Where the settings every game shares are kept (the language).
const SETTINGS: &str = "/save/_settings.json";
/// seconds of the fade in from black when a game starts
const FADE_IN: f64 = 0.35;

/// The least height (game units) a fixed-width game gets by default: the
/// smallest phone screen the games are made for, 360 × 640.
pub const MIN_HEIGHT: f64 = 640.0;

/// A game's `game.json`, with defaults filled in.
#[derive(Clone)]
pub struct GameInfo {
    pub id: String,
    pub dir: String,
    pub name: String,
    pub description: String,
    pub entry: String,
    pub style: String,
    /// the game's own coordinate size; 0 takes the screen's
    pub width: f64,
    pub height: f64,
    /// with a fixed width only: the least height the game is laid out for.
    /// A wide screen (a tablet, or one lying sideways) would leave less, so
    /// the game is then letterboxed at this height instead (0 = never)
    pub min_height: f64,
    pub icon: String,
    pub color: String,
    pub players: String,
    pub order: f64,
    pub hidden: bool,
    /// names in other languages: { "en": { "name", "description" }, "es": … }
    pub i18n: Json,
    /// whether the game talks unless the player turns it off (`"speech": false`
    /// in game.json: quiet unless turned on in the launcher's settings)
    pub speech: bool,
    /// the launcher's section: "aly", "kortit", "labra", "tutkimus", "opi",
    /// "seikkailu" (empty: the launcher decides)
    pub section: String,
    /// a picture for the launcher's tile, in the game's folder ("icon.png");
    /// `icon` (an emoji) is used where there is none
    pub image: String,
    /// a game installed from the download list (⚙️ → Lataa pelejä): the
    /// host's `_store.json` in its folder ({id, version, source, …});
    /// Null for the games the app came with
    pub store: Json,
    /// a downloaded game that stands in for a game the app came with
    /// (`"replaces": "mansepoli"` in game.json, e.g. the Sliqtly Games copy
    /// with Google TTS speech): when it is installed, that game leaves the
    /// list and this one takes its place (its order and section)
    pub replaces: String,
    /// a game the app came with that an installed download replaces: that
    /// game's id (the launcher shows one of the two, the player's choice or
    /// else the newer)
    pub replaced_by: String,
    /// when the game's files last changed (RFC 3339): a built-in game's last
    /// commit (`_built.json`, written by the build), a download's acceptance
    /// (`_store.json` "updated"); empty when unknown
    pub updated: String,
    /// game.json "xr": rg.xr.enter's options ({"mode": "vr", "scale": …,
    /// "panel": …}): on a headset the game starts in VR without asking
    /// (Null: flat until the game calls rg.xr.enter)
    pub xr: Json,
}

impl GameInfo {
    pub fn from_json(id: &str, dir: &str, j: &Json) -> GameInfo {
        let s = |k: &str, d: &str| -> String {
            let v = j.get(k).as_str();
            if v.is_empty() {
                d.to_string()
            } else {
                v
            }
        };
        GameInfo {
            id: id.to_string(),
            dir: dir.to_string(),
            name: s("name", id),
            description: s("description", ""),
            entry: s("entry", "game.tsx"),
            style: s("style", "style.css"),
            width: j.get("width").as_num(0.0),
            height: j.get("height").as_num(0.0),
            min_height: j.get("minHeight").as_num(MIN_HEIGHT),
            icon: s("icon", ""),
            color: s("color", "#4f7cff"),
            players: s("players", "1"),
            order: j.get("order").as_num(100.0),
            hidden: j.get("hidden").as_bool(),
            i18n: j.get("i18n"),
            speech: !matches!(j.get("speech"), Json::Bool(false)),
            section: s("section", ""),
            image: s("image", ""),
            store: Json::Null,
            replaces: s("replaces", ""),
            replaced_by: String::new(),
            updated: String::new(),
            xr: j.get("xr"),
        }
    }

    pub fn to_json(&self) -> Json {
        json::obj(vec![
            member("id", Json::Str(self.id.clone())),
            member("name", Json::Str(self.name.clone())),
            member("description", Json::Str(self.description.clone())),
            member("icon", Json::Str(self.icon.clone())),
            member("color", Json::Str(self.color.clone())),
            member("players", Json::Str(self.players.clone())),
            member("i18n", self.i18n.clone()),
            member("speech", Json::Bool(self.speech)),
            member("section", Json::Str(self.section.clone())),
            member("image", Json::Str(if self.image.is_empty() { String::new() } else { format!("{}/{}", self.dir, self.image) })),
            member("store", self.store.clone()),
            member("replaces", Json::Str(self.replaces.clone())),
            member("replacedBy", Json::Str(self.replaced_by.clone())),
            member("updated", Json::Str(self.updated.clone())),
        ])
    }
}

pub struct Engine {
    pub vfs: Vfs,
    pub input: Input,
    pub ui: Ui,
    script: Option<Script>,
    pub game: Option<GameInfo>,
    /// the frame's picture
    pub draw: DrawStream,
    /// the frame's commands for the platform (sounds, vibration, …)
    pub commands: Vec<HostCommand>,
    /// the script's error, shown on the screen until a tap goes back
    pub error: String,
    /// console.log lines since the last frame
    pub log: Vec<String>,
    pub perf: Perf,
    /// the game the launcher command asked for, started after the frame
    pending: Option<String>,
    /// the game whose own pack the host is fetching (web: every game but the
    /// launcher is a separate pack, `/games/<id>/_pack.url` names its address)
    pub waiting_pack: Option<String>,
    /// dev reload: what the last game gave with rg.onHot, for the next start (rg.hot)
    hot: Json,
    /// (game id, rg.hot) of a reload that failed, for the next one
    hot_kept: (String, Json),
    /// the game that lists the others (`launcher`)
    pub launcher: String,
    /// an app of one game (/games/_app.json): `launcher` is that game
    pub app: bool,
    saved: Json,
    /// settings shared by every game (/save/_settings.json): the language
    settings: Json,
    pub screen_w: f64,
    pub screen_h: f64,
    /// screen = game * scale + offset
    pub scale: f64,
    pub off_x: f64,
    pub off_y: f64,
    time: f64,
    seed: i64,
    /// the one clock: each frame's step in whole display frames (rg_core::clock)
    pub clock: FrameClock,
    /// the game's animations, sequences and springs, run before its tick
    pub anims: Rc<RefCell<Anims>>,
    /// the game's 3D scene (rg.three), drawn under its 2D view
    pub scene: scene3d::Scene,
    /// the host draws the 3D scene itself with a depth buffer (WebGL / GLES):
    /// then the scene's triangles are in `scene.tris`, not in the draw stream
    pub gl3d: bool,
    /// the host paints the whole stream with GL (crates/rg_gl): 3D always as
    /// triangles, placed in the stream by layer commands (kind 9)
    pub gl_all: bool,
    /// the host can paint either way, GL or Canvas (rg.paints; the phone):
    /// the choice is setting "paint", read by the host
    pub paints: bool,
    /// seconds left of the fade in from black after a game starts (the
    /// launcher fades to black before it, so the change shows no jump)
    pub fade_in: f64,
    /// the host draws textured globes (draw kind 8): planets with a
    /// `texture` are sent as one sphere command instead of their regions
    pub textures: bool,
    /// the host installs games from the download list (rg.store: the
    /// "store" commands and sensor events)
    pub store: bool,
    /// the host draws a planet's `detail` pictures (a sphere command with a
    /// window, 24 numbers)
    pub detail: bool,
    /// the host draws real heights on a globe (a sphere command with 40
    /// numbers: the ground's shape close by); the game sees it as rg.terrain
    pub terrain: bool,
    /// the host draws baked particle runs as liquid splats (draw kind 10)
    pub splats: bool,
    /// the game's `<scene3d>`: three.js's names, read as React Three Fiber
    /// reads JSX (fiber.rs), drawn with the scene above
    pub world: Rc<RefCell<fiber::World>>,
    /// the game's water and sand (rg.sim), drawn over the 3D and under the 2D view
    pub fluid: fluid::Sim,
    /// rg.box: the ids the script asked to measure this frame, and the
    /// boxes of the ids asked last frame, laid out
    measure: Vec<String>,
    boxes: Json,
    /// the RangerDOM renderer, when the host has one (None: EVG directly)
    pub dom: Option<Box<dyn DomBackend>>,
    /// whether a host with the renderer uses it when the player has not
    /// chosen (settings "renderer": "dom" or "evg"): the web yes, the phone no
    pub dom_default: bool,
    /// whether the running game is drawn by the RangerDOM renderer
    dom_on: bool,
    /// VR (rg.xr, xr.rs): stereo on a phone, or a headset's eyes and controllers
    pub xr: xr::Xr,
    /// VR controllers' rays (tracking space) for trigger presses that missed
    /// the panel, by pointer id: their taps go into the 3D world
    xr_rays: Vec<(i64, xr::V3, xr::V3)>,
    /// pointers let go last frame (their rays are forgotten now)
    xr_ups: Vec<i64>,
    /// the keys the controllers hold down (xr_keys)
    xr_keys: Vec<&'static str>,
    /// the last eye drawn (`xr_eye`): the controllers' rays and cursor, and
    /// the panel's corners in clip space
    pub xr_over: Vec<f32>,
    pub xr_panel: Option<[[f32; 4]; 4]>,
    /// VR: an eye with planets, stars or particle runs is a whole draw stream
    /// (`xr_eye` makes it): this, with its triangles in `scene.tris`, and
    /// `xr_view` = its units' width and height and where the eye's own view
    /// is in them (x, y, w, h); None: the eye is `scene.tris` alone
    pub xr_draw: DrawStream,
    pub xr_view: Option<[f64; 6]>,
}

impl Engine {
    pub fn new() -> Engine {
        Engine {
            vfs: Vfs::new(),
            input: Input::new(),
            ui: Ui::new(),
            script: None,
            game: None,
            draw: DrawStream::new(),
            scene: scene3d::Scene::new(),
            gl3d: false,
            gl_all: false,
            paints: false,
            fade_in: 0.0,
            textures: false,
            store: false,
            detail: false,
            terrain: false,
            splats: false,
            world: Rc::new(RefCell::new(fiber::World::new())),
            fluid: fluid::Sim::new(),
            measure: Vec::new(),
            boxes: Json::Obj(Vec::new()),
            dom: None,
            dom_default: false,
            dom_on: false,
            xr: xr::Xr::new(),
            xr_rays: Vec::new(),
            xr_ups: Vec::new(),
            xr_keys: Vec::new(),
            xr_over: Vec::new(),
            xr_panel: None,
            xr_draw: DrawStream::new(),
            xr_view: None,
            commands: Vec::new(),
            error: String::new(),
            log: Vec::new(),
            perf: Perf::default(),
            pending: None,
            waiting_pack: None,
            hot: Json::Null,
            hot_kept: (String::new(), Json::Null),
            launcher: "launcher".to_string(),
            app: false,
            saved: Json::Obj(Vec::new()),
            settings: Json::Obj(Vec::new()),
            screen_w: 360.0,
            screen_h: 640.0,
            scale: 1.0,
            off_x: 0.0,
            off_y: 0.0,
            time: 0.0,
            seed: 1,
            clock: FrameClock::new(),
            anims: Rc::new(RefCell::new(Anims::new())),
        }
    }

    pub fn set_seed(&mut self, seed: i64) {
        self.seed = seed;
    }

    /// An app made of one game (scripts/build-android.sh RG_APP_START=<id>
    /// writes /games/_app.json {"start": id}): that game is the app's first
    /// and only screen, in the launcher's place (Back closes the app, no ✕).
    fn app_start(&mut self) {
        let j = json::parse(&self.vfs.read_text("/games/_app.json"));
        let id = j.get("start").as_str();
        if !id.is_empty() && self.vfs.exists(&format!("/games/{}/game.json", id)) {
            self.launcher = id;
            self.app = true;
        }
    }

    /// Whether the launcher game is there to go back to (a pack made for
    /// one game from a link may leave it out).
    pub fn has_launcher(&self) -> bool {
        self.vfs.exists(&format!("/games/{}/game.json", self.launcher))
    }

    /// The games under /games, in their `order`, then by name.
    pub fn games(&self) -> Vec<GameInfo> {
        let mut out: Vec<GameInfo> = Vec::new();
        for name in self.vfs.list("/games") {
            if !name.ends_with('/') {
                continue;
            }
            let id = name.trim_end_matches('/').to_string();
            let dir = format!("/games/{}", id);
            let manifest = format!("{}/game.json", dir);
            if !self.vfs.exists(&manifest) {
                continue;
            }
            let j = json::parse(&self.vfs.read_text(&manifest));
            let mut info = GameInfo::from_json(&id, &dir, &j);
            let built = format!("{}/_built.json", dir);
            if self.vfs.exists(&built) {
                info.updated = json::parse(&self.vfs.read_text(&built)).get("updated").as_str();
            }
            // a downloaded game: the host's note of it; one the player
            // removed is gone from the list now, its files at the next start
            let note = format!("{}/_store.json", dir);
            if self.vfs.exists(&note) {
                let st = json::parse(&self.vfs.read_text(&note));
                if st.get("removed").as_bool() {
                    continue;
                }
                let up = st.get("updated").as_str();
                if !up.is_empty() {
                    info.updated = up;
                }
                info.store = st;
            }
            out.push(info);
        }
        // an installed download that replaces a game the app came with takes
        // that game's order and section; the old one is marked (replaced_by)
        // and the launcher shows one of the two
        for i in 0..out.len() {
            if out[i].store.is_null() || out[i].replaces.is_empty() || out[i].replaces == out[i].id {
                continue;
            }
            let r = out[i].replaces.clone();
            let id = out[i].id.clone();
            if let Some(k) = out.iter().position(|g| g.id == r && g.store.is_null()) {
                out[i].order = out[k].order;
                if out[i].section.is_empty() {
                    out[i].section = out[k].section.clone();
                }
                out[k].replaced_by = id;
            }
        }
        out.sort_by(|a, b| {
            a.order.partial_cmp(&b.order).unwrap_or(std::cmp::Ordering::Equal).then(a.name.cmp(&b.name))
        });
        out
    }

    fn game_info(&self, id: &str) -> Option<GameInfo> {
        for g in self.games() {
            if g.id == id {
                return Some(g);
            }
        }
        None
    }

    /// Sets the screen size (CSS pixels on the web) and fits the game in it.
    pub fn resize(&mut self, w: f64, h: f64) {
        self.screen_w = w.max(1.0);
        self.screen_h = h.max(1.0);
        self.fit();
    }

    fn fit(&mut self) {
        let (sw, sh) = (self.screen_w, self.screen_h);
        let (gw, gh, min_h) = match &self.game {
            Some(g) => (g.width, g.height, g.min_height),
            None => (0.0, 0.0, 0.0),
        };
        if gw > 0.0 && gh > 0.0 {
            // a fixed size, letterboxed
            self.scale = (sw / gw).min(sh / gh);
            self.ui.width = gw;
            self.ui.height = gh;
        } else if gw > 0.0 {
            // a fixed width, the height the screen's shape gives
            self.scale = sw / gw;
            self.ui.width = gw;
            self.ui.height = (sh / self.scale).floor();
            if min_h > 0.0 && self.ui.height < min_h {
                // too wide for the game (a tablet): full height, bars at the sides
                self.scale = sh / min_h;
                self.ui.height = min_h;
            }
        } else {
            self.scale = 1.0;
            self.ui.width = sw;
            self.ui.height = sh;
        }
        self.off_x = ((sw - self.ui.width * self.scale) / 2.0).floor();
        self.off_y = ((sh - self.ui.height * self.scale) / 2.0).floor();
    }

    /// A screen point in the game's coordinates.
    pub fn to_game(&self, x: f64, y: f64) -> (f64, f64) {
        ((x - self.off_x) / self.scale, (y - self.off_y) / self.scale)
    }

    /// kind 0 down, 1 move, 2 up; screen coordinates.
    pub fn pointer(&mut self, kind: i32, id: i64, x: f64, y: f64) {
        let (gx, gy) = self.to_game(x, y);
        match kind {
            0 => self.input.pointer_down(id, gx, gy),
            1 => self.input.pointer_move(id, gx, gy),
            _ => self.input.pointer_up(id, gx, gy),
        }
    }

    pub fn key(&mut self, down: bool, key: &str) {
        if key == "Escape" || key == "Back" || key == "BrowserBack" {
            if down {
                self.input.push(rg_core::input::event("back", key, 0, 0.0, 0.0));
            }
            return;
        }
        if down {
            self.input.key_down(key);
        } else {
            self.input.key_up(key);
        }
    }

    /// A phone sensor's reading for the game: `name` is `location` (data
    /// `{lat, lon, accuracy, speed, bearing, altitude, time}`, accuracy in
    /// metres, bearing in degrees from north or -1) or `heading` (`{deg}`,
    /// where the top of the phone points, degrees from north), `orient`
    /// (`{m: [9]}`, the screen's right, up and out-of-screen axes as rows in
    /// the world: z up; on Android x/y are a fixed horizontal pair that need
    /// not point east/north, because orient uses the gyro-based game rotation
    /// vector for a steady turn; up to 60 a second), or `error`
    /// (`{sensor, reason}`). The game asks for one with `rg.sensor(name, true)`
    /// and gets it in `onLocation(fix)` / `onHeading(deg)` / `onSensor(name, data)`.
    pub fn sensor(&mut self, name: &str, data: &str) {
        if name == "orient" && self.xr.mode == xr::Mode::Stereo {
            self.xr.orient(&json::parse(data).get("m"));
        }
        let mut e = rg_core::input::event("sensor", name, 0, 0.0, 0.0);
        e.target = data.to_string();
        // rg.store: the host installed or removed a game; the event carries
        // the games as they are now, for rg.games()
        if name == "store" {
            if let Json::Obj(mut members) = json::parse(data) {
                members.push(member("_games", self.games_json()));
                e.target = Json::Obj(members).write();
            }
        }
        self.input.push(e);
    }

    fn games_json(&self) -> Json {
        let mut items = Vec::new();
        for g in self.games() {
            if !g.hidden && g.id != self.launcher {
                items.push(g.to_json());
            }
        }
        Json::Arr(items)
    }

    /// The voice clips of the other languages than Finnish: { "en": [ids], … }
    /// from /games/_voice/<lang>/index.json (rg_voice writes it), so that
    /// rg.say can fall back to Finnish for a clip a language does not have.
    fn voices_json(&self) -> Json {
        let mut members = Vec::new();
        for name in self.vfs.list("/games/_voice") {
            if !name.ends_with('/') || name == "fi/" {
                continue;
            }
            let lang = name.trim_end_matches('/').to_string();
            let index = json::parse(&self.vfs.read_text(&format!("/games/_voice/{}index.json", name)));
            if matches!(index, Json::Arr(_)) {
                members.push(member(&lang, index));
            }
        }
        Json::Obj(members)
    }

    /// Starts the game `id` ("" for the launcher). Err with the reason when
    /// it cannot start; the error is also shown on the screen.
    /// The running game's stylesheet read again from the VFS (a host that
    /// changed style.css with put): the game keeps running and its state.
    pub fn restyle(&mut self) -> bool {
        let info = match &self.game {
            Some(g) => g.clone(),
            None => return false,
        };
        let css_path = vfs::join(&info.dir, &info.style);
        self.ui.set_stylesheet(&self.vfs.read_text(&css_path));
        for e in self.ui.css_errors.clone() {
            self.log.push(format!("{}: {}", css_path, e));
        }
        true
    }

    /// Dev reload: the running game started again from the VFS (a host put
    /// new files there). What the game gives with rg.onHot goes to the new
    /// start as rg.hot; a game that gives nothing starts fresh (its saves stay).
    pub fn reload(&mut self) -> Result<(), String> {
        let id = match &self.game {
            Some(g) if g.id != self.launcher => g.id.clone(),
            _ => String::new(),
        };
        let hot = match self.script.as_mut().map(|s| s.call("__hotSave", String::new())) {
            Some(Ok(text)) => json::parse(&text),
            Some(Err(e)) => {
                self.log.push(format!("rg.onHot: {}", e));
                Json::Null
            }
            // the last reload failed (a typo): what the game gave before it
            None if self.hot_kept.0 == id => self.hot_kept.1.clone(),
            None => Json::Null,
        };
        self.hot = hot.clone();
        let r = self.start(&id);
        self.hot = Json::Null;
        self.hot_kept = if r.is_err() { (id, hot) } else { (String::new(), Json::Null) };
        r
    }

    /// Dev: the host put these files (VFS paths) again. 2 the running game
    /// was started again (its scripts, game.json or texts changed), 1 only its
    /// style.css changed and was read again (the game keeps running), 0 the
    /// running game does not use them as code (pictures, sounds, other games:
    /// the host forgets its decoded copies).
    pub fn dev_changed(&mut self, paths: &[String]) -> i32 {
        let info = match &self.game {
            Some(g) => g.clone(),
            None => return 0,
        };
        let prefix = format!("{}/", info.dir.trim_end_matches('/'));
        let style = vfs::join(&info.dir, &info.style);
        let mut css = false;
        let mut code = false;
        for p in paths {
            // the launcher lists every game: a new or changed game.json shows there
            let lists = info.id == self.launcher && p.ends_with("/game.json");
            if !p.starts_with(&prefix) && !lists {
                continue;
            }
            if *p == style {
                css = true;
                continue;
            }
            match vfs::extension(p).as_str() {
                "ts" | "tsx" | "js" | "jsx" | "json" | "txt" | "css" => code = true,
                _ => {}
            }
        }
        if code || (self.error.len() > 0 && css) {
            let _ = self.reload();
            2
        } else if css {
            self.restyle();
            1
        } else {
            0
        }
    }

    pub fn start(&mut self, id: &str) -> Result<(), String> {
        self.app_start();
        let id = if id.is_empty() { self.launcher.clone() } else { id.to_string() };
        self.scene = scene3d::Scene::new();
        *self.world.borrow_mut() = fiber::World::new();
        self.fluid = fluid::Sim::new();
        self.measure = Vec::new();
        self.boxes = Json::Obj(Vec::new());
        // the last game's sensors off (GPS uses the battery)
        self.commands.push(HostCommand { kind: "sensor".into(), name: "*".into(), args: Json::Bool(false) });
        self.commands.push(HostCommand { kind: "stop".into(), name: "music".into(), args: Json::Null });
        // and its sounds (rg.sound's long files, loops)
        self.commands.push(HostCommand { kind: "soundctl".into(), name: "stop".into(), args: Json::Obj(vec![member("h", Json::Num(0.0))]) });
        // rg.net: the links to other phones stay up from game to game; the
        // host tells the new game what it can do and which links are up
        // ({type: "info"}), and the game says to them where it is
        self.commands.push(HostCommand { kind: "net".into(), name: "info".into(), args: Json::Null });
        // the last game's VR: the next game starts flat (a headset app keeps its panel)
        self.xr_leave();
        self.xr.events.clear();
        self.error = String::new();
        self.script = None;
        self.input = Input::new();
        let info = match self.game_info(&id) {
            Some(g) => g,
            None => return self.fail(format!("no game '{}' in /games", id)),
        };
        self.game = Some(info.clone());
        self.fit();
        self.xr_auto();
        self.time = 0.0;
        self.clock.reset();
        self.anims.borrow_mut().reset();
        self.waiting_pack = None;
        // the game's files are a pack of their own that is not here yet: the
        // host fetches it, mounts it at the game's folder and calls
        // pack_done, which starts the game
        let marker = vfs::join(&info.dir, "_pack.url");
        if self.vfs.exists(&marker) && !self.vfs.exists(&vfs::join(&info.dir, &info.entry)) {
            let url = self.vfs.read_text(&marker).trim().to_string();
            self.waiting_pack = Some(id.clone());
            self.commands.push(HostCommand { kind: "pack".into(), name: id.clone(), args: Json::Str(url) });
            return Ok(());
        }
        let css_path = vfs::join(&info.dir, &info.style);
        self.ui.set_stylesheet(&self.vfs.read_text(&css_path));
        for e in self.ui.css_errors.clone() {
            self.log.push(format!("{}: {}", css_path, e));
        }
        let save_path = format!("/save/{}.json", info.id);
        self.saved = json::parse(&self.vfs.read_text(&save_path));
        if !matches!(self.saved, Json::Obj(_)) {
            self.saved = Json::Obj(Vec::new());
        }
        self.settings = json::parse(&self.vfs.read_text(SETTINGS));
        if !matches!(self.settings, Json::Obj(_)) {
            self.settings = Json::Obj(Vec::new());
        }
        let mut s = Script::new();
        let dom_sync = match self.dom.as_ref() {
            Some(d) => d.host_sync(),
            None => None,
        };
        s.vm.vm.set_host_sync(Box::new(WorldSync { world: self.world.clone(), anims: self.anims.clone(), dom: dom_sync }));
        self.world.borrow_mut().dir = info.dir.clone();
        self.scene.dir = info.dir.clone();
        self.lend_files(true);
        let r = self.start_script(s, &info);
        self.lend_files(false);
        r
    }

    /// Lets the 3D world read the game's files (models) while the engine is
    /// in a call that does not touch them otherwise; `false` takes them back.
    fn lend_files(&mut self, on: bool) {
        self.world.borrow_mut().vfs = if on { &self.vfs as *const Vfs } else { std::ptr::null() };
    }

    fn start_script(&mut self, mut s: Script, info: &GameInfo) -> Result<(), String> {
        let chosen = self.settings.get("renderer").as_str();
        self.dom_on = self.dom.is_some() && (chosen == "dom" || (chosen != "evg" && self.dom_default));
        let on = self.dom_on;
        if let Some(d) = self.dom.as_mut().filter(|_| on) {
            d.reset();
            for (name, src) in d.boot(self.ui.width, self.ui.height) {
                let ran = match d.unit(&name) {
                    Some(u) => s.run_unit(u, &src, &name),
                    None => s.eval(&src, &name),
                };
                if let Err(e) = ran {
                    return self.fail(e);
                }
            }
        }
        if let Err(e) = s.eval(script::RUNTIME, "runtime.js") {
            return self.fail(e);
        }
        if self.dom_on {
            if let Err(e) = s.eval(script::DOM, "dom.js") {
                return self.fail(e);
            }
            let css = self.vfs.read_text(&vfs::join(&info.dir, &info.style));
            if let Err(e) = s.eval(&format!("__rgDom.start({});", quote(&css)), "dom.js") {
                return self.fail(e);
            }
        }
        if let Err(e) = s.eval(script::THREE, "three.js") {
            return self.fail(e);
        }
        if let Err(e) = s.eval(script::ANIM, "anim.js") {
            return self.fail(e);
        }
        if let Err(e) = s.eval(&format!("__settings({});", self.settings.write()), "settings.js") {
            return self.fail(e);
        }
        // dev reload: what the game gave with rg.onHot, before its code runs
        if !matches!(self.hot, Json::Null) {
            if let Err(e) = s.eval(&format!("rg.hot = {};", self.hot.write()), "hot.js") {
                return self.fail(e);
            }
        }
        // the game's other script files, as modules it can import by their
        // path without the extension ("lib/util") or relatively
        let entry_path = vfs::join(&info.dir, &info.entry);
        let skip = info.dir.len() + 1;
        let mut defs = String::new();
        for p in self.vfs.walk(&info.dir) {
            let ext = vfs::extension(&p);
            if p == entry_path || !(ext == "ts" || ext == "tsx" || ext == "js" || ext == "jsx") {
                continue;
            }
            let rel = &p[skip..];
            let name = &rel[..rel.len() - ext.len() - 1];
            defs.push_str(&format!(
                "defineSourceModule({}, {}, {});\n",
                quote(name),
                quote(&self.vfs.read_text(&p)),
                quote(&p)
            ));
        }
        if !defs.is_empty() {
            if let Err(e) = s.eval(&defs, "modules.js") {
                return self.fail(e);
            }
        }
        let src = self.vfs.read_text(&entry_path);
        if src.is_empty() {
            return self.fail(format!("{} is missing or empty", entry_path));
        }
        if let Err(e) = s.eval(&src, &entry_path) {
            self.log.extend(s.take_output());
            return self.fail(e);
        }
        let arg = json::obj(vec![
            member("w", Json::Num(self.ui.width)),
            member("h", Json::Num(self.ui.height)),
            member("game", Json::Str(info.id.clone())),
            member("dir", Json::Str(info.dir.clone())),
            member("saved", self.saved.clone()),
            member("settings", self.settings.clone()),
            member("games", self.games_json()),
            member("voices", self.voices_json()),
            member("seed", Json::Num(self.seed as f64)),
            member("launcher", Json::Bool(info.id == self.launcher)),
            // an app of one game: its ✕ closes the app
            member("app", Json::Bool(self.app && info.id == self.launcher)),
            member("speech", Json::Bool(info.speech)),
            // the renderers this host has, and the one drawing (rg.renderer)
            member("renderers", Json::Arr(if self.dom.is_some() { vec![Json::Str("evg".into()), Json::Str("dom".into())] } else { vec![Json::Str("evg".into())] })),
            member("renderer", Json::Str(if self.dom_on { "dom".into() } else { "evg".into() })),
            // how the host paints (rg.paint) and whether it can do both
            member("paints", Json::Arr(if self.paints { vec![Json::Str("gl".into()), Json::Str("canvas".into())] } else { vec![] })),
            member("paint", Json::Str(if self.gl_all { "gl".into() } else { "canvas".into() })),
            // false when there is no launcher to go back to (a game played
            // alone from a link): no close button, exit stays in the game
            member("menu", Json::Bool(self.has_launcher())),
            member("store", Json::Bool(self.store)),
            member("terrain", Json::Bool(self.terrain)),
            // the host draws detail windows (rg.detail): with rg.terrain, also their own heights
            member("detail", Json::Bool(self.detail)),
        ]);
        let r = s.call("__start", arg.write());
        self.log.extend(s.take_output());
        match r {
            Ok(text) => {
                let cmds = json::parse(&text);
                self.script = Some(s);
                self.take_commands(&cmds);
                // args: the game's id ("" for the launcher), for hosts that put it in the address (web ?game=)
                let id = if info.id == self.launcher { String::new() } else { info.id.clone() };
                self.commands.push(HostCommand { kind: "title".into(), name: info.name.clone(), args: Json::Str(id) });
                Ok(())
            }
            Err(e) => self.fail(e),
        }
    }

    fn fail(&mut self, e: String) -> Result<(), String> {
        self.error = e.clone();
        self.log.push(e.clone());
        Err(e)
    }

    /// The host's VR frame (before `frame`): the eyes, the head and the
    /// controllers in its tracking space, or an event. See xr.rs `Xr::input`.
    pub fn xr_input(&mut self, data: &str) {
        let aspect = if self.ui.width > 0.0 { self.ui.height / self.ui.width } else { 1.0 };
        let was = self.xr.always;
        self.xr.input(&json::parse(data), aspect);
        // the headset told of itself after the game started (the Quest app
        // starts OpenXR after booting the game)
        if self.xr.always && !was {
            self.xr_auto();
        }
    }

    /// game.json "xr": on a headset the game goes into VR without asking
    fn xr_auto(&mut self) {
        let opts = match self.game.as_ref().map(|g| g.xr.clone()) {
            Some(o @ Json::Obj(_)) => o,
            _ => return,
        };
        if self.xr.always && self.xr.mode == xr::Mode::Off {
            self.xr_command("enter", &opts);
        }
    }

    /// The headset's eyes: how many the host gave this frame.
    pub fn xr_eyes(&self) -> usize {
        if self.xr.headset() { self.xr.views.len() } else { 0 }
    }

    /// Eye `i`'s picture size in units (the host maps it to the eye's viewport).
    pub fn xr_eye_size(&self, i: usize) -> (f64, f64) {
        self.xr.eye_local(i).map(|e| e.size()).unwrap_or((1.0, 1.0))
    }

    /// Draws headset eye `i` (after `frame`): the 3D world's triangles into
    /// `scene.tris` (or an empty room when the game is not in VR), the
    /// controllers' rays into `xr_over`, the panel's corners into `xr_panel`.
    /// Units are the eye's (`xr_eye_size`); the host draws the triangles, the
    /// panel (the frame's draw stream as a texture) and then `xr_over`.
    pub fn xr_eye(&mut self, i: usize) -> bool {
        self.scene.tris.clear();
        self.xr_over.clear();
        self.xr_panel = None;
        self.xr_view = None;
        if self.xr.eye_local(i).is_none() {
            return false;
        }
        if self.xr.immersive() && self.scene.needs_stream() {
            // planets and stars are drawn by the host from a stream: one for
            // this eye, with a symmetric view around it
            let (p, r, u, f) = self.scene.rig();
            if let Some(e) = self.xr.eye(i, p, r, u, f) {
                let s = e.symmetric();
                self.xr_draw.clear();
                self.scene.render_eye_stream(s, &mut self.xr_draw);
                let rig = self.world.borrow().rig();
                if let Some(we) = rig.and_then(|(p, r, u, f)| self.xr.eye(i, p, r, u, f)) {
                    let t0 = self.scene.tris.len();
                    self.world.borrow_mut().render_eye(&we.symmetric(), i == 0, &mut self.scene.tris);
                    self.xr_draw.layer3d(t0, self.scene.tris.len());
                }
                let (w, h) = s.size();
                let v = e.in_symmetric();
                self.xr_view = Some([w, h, v[0], v[1], v[2], v[3]]);
            }
        } else if self.xr.immersive() {
            if self.scene.active {
                let (p, r, u, f) = self.scene.rig();
                if let Some(e) = self.xr.eye(i, p, r, u, f) {
                    self.scene.render_eye(e);
                }
            }
            let rig = self.world.borrow().rig();
            if let Some((p, r, u, f)) = rig {
                if let Some(e) = self.xr.eye(i, p, r, u, f) {
                    self.world.borrow_mut().render_eye(&e, i == 0, &mut self.scene.tris);
                }
            }
            if !self.scene.active && rig.is_none() {
                self.xr.room_tris(i, &mut self.scene.tris);
            }
        } else {
            self.xr.room_tris(i, &mut self.scene.tris);
        }
        self.xr_panel = self.xr.panel_clip(i);
        self.xr.pointer_tris(i, &mut self.xr_over);
        true
    }

    /// For an eye drawn from `xr_draw` into a rectangle of `pw` pixels wide:
    /// the stream's view as the GL painter wants it, at 1 pixel a "dp":
    /// scale, x and y offset (pixels), the stream's width and height (units).
    pub fn xr_eye_view(&self, pw: i32) -> Option<[f32; 5]> {
        let v = self.xr_view?;
        let s = pw.max(1) as f64 / v[4].max(1e-6);
        Some([s as f32, (-v[2] * s) as f32, (-v[3] * s) as f32, v[0] as f32, v[1] as f32])
    }

    /// stereo: both eyes side by side into `scene.tris`, in game units
    fn stereo_tris(&mut self) {
        let (gw, gh) = (self.ui.width, self.ui.height);
        let mut acc: Vec<f32> = Vec::new();
        let mut tmp: Vec<f32> = Vec::new();
        for i in 0..2 {
            let rect = [i as f64 * gw / 2.0, 0.0, gw / 2.0, gh];
            if self.scene.active {
                let (p, r, u, f) = self.scene.rig();
                if let Some(e) = self.xr.eye(i, p, r, u, f) {
                    self.scene.render_eye(e);
                    let (ew, eh) = e.size();
                    xr::place_tris(&self.scene.tris, ew, eh, rect, &mut acc);
                }
            }
            let rig = self.world.borrow().rig();
            if let Some((p, r, u, f)) = rig {
                if let Some(e) = self.xr.eye(i, p, r, u, f) {
                    tmp.clear();
                    self.world.borrow_mut().render_eye(&e, i == 0, &mut tmp);
                    let (ew, eh) = e.size();
                    xr::place_tris(&tmp, ew, eh, rect, &mut acc);
                }
            }
        }
        self.scene.tris = acc;
    }

    /// Before the game's frame: the controllers' triggers as taps on the
    /// panel (game units) or rays into the 3D world.
    fn xr_step(&mut self) {
        let ups = std::mem::take(&mut self.xr_ups);
        self.xr_rays.retain(|r| !ups.contains(&r.0));
        self.xr.step(self.ui.width, self.ui.height);
        // a controller's B / Y is the phone's Back (onBack, else rg.exit)
        let backs = self.xr.events.iter().filter(|e| {
            e.get("type").as_str() == "button" && e.get("button").as_str() == "b" && e.get("down").as_bool()
        }).count();
        for _ in 0..backs {
            self.input.push(rg_core::input::event("back", "Back", 0, 0.0, 0.0));
        }
        self.xr_keys();
        let pointers = std::mem::take(&mut self.xr.pointers);
        for p in pointers.iter() {
            // a press that missed the panel stays a world ray until it is let go
            if p.kind == 0 {
                self.xr_rays.retain(|r| r.0 != p.id);
                if p.at.is_none() {
                    self.xr_rays.push((p.id, p.ray.0, p.ray.1));
                }
            }
            let in_world = self.xr_rays.iter().any(|r| r.0 == p.id);
            let (x, y) = if in_world { (-1.0e5, -1.0e5) } else { p.at.unwrap_or((-1.0e5, -1.0e5)) };
            match p.kind {
                0 => self.input.pointer_down(p.id, x, y),
                1 => self.input.pointer_move(p.id, x, y),
                _ => self.input.pointer_up(p.id, x, y),
            }
        }
        // an up event still needs its ray this frame: forgotten next frame
        self.xr_ups = pointers.iter().filter(|p| p.kind == 2).map(|p| p.id).collect();
    }

    /// The controllers as keys, for games made for phones and keyboards: a
    /// stick is the arrow keys, A / X, the grip and the trigger pointed away
    /// from the panel are Space (on the panel the trigger taps; B / Y is Back).
    fn xr_keys(&mut self) {
        let mut want: Vec<&'static str> = Vec::new();
        if self.xr.headset() {
            for (i, h) in self.xr.hands.iter().enumerate() {
                let held = |k: &str| self.xr_keys.contains(&k);
                // the trigger pointed away from the panel is Space too (thrust)
                let off_panel = self.xr.hits.get(i).map(|x| x.is_none()).unwrap_or(true);
                let on = |v: f64, k: &str| v > 0.5 || (held(k) && v > 0.35);
                let [x, y] = h.stick;
                for (v, k) in [(-x, "ArrowLeft"), (x, "ArrowRight"), (y, "ArrowUp"), (-y, "ArrowDown")] {
                    if on(v, k) && !want.contains(&k) {
                        want.push(k);
                    }
                }
                if (on(h.buttons[3], " ") || on(h.buttons[1], " ") || (off_panel && on(h.buttons[0], " "))) && !want.contains(&" ") {
                    want.push(" ");
                }
            }
        }
        for k in self.xr_keys.clone() {
            if !want.contains(&k) {
                self.input.key_up(k);
            }
        }
        for k in want.iter() {
            if !self.xr_keys.contains(k) {
                self.input.key_down(k);
            }
        }
        self.xr_keys = want;
    }

    fn xr_state(&self) -> Json {
        let rig = self.world.borrow().rig().or_else(|| if self.scene.active { Some(self.scene.rig()) } else { None });
        self.xr.state(rig)
    }

    /// Leaves VR (a game ends): the phone's sensor and the host's session off.
    fn xr_leave(&mut self) {
        if self.xr.mode == xr::Mode::Off {
            return;
        }
        let mode = self.xr.mode;
        self.xr.exit();
        self.xr_rays.clear();
        if mode == xr::Mode::Stereo {
            self.commands.push(HostCommand { kind: "sensor".into(), name: "orient".into(), args: Json::Bool(false) });
        } else if !self.xr.always {
            self.commands.push(HostCommand { kind: "xr".into(), name: "exit".into(), args: Json::Null });
        }
    }

    /// rg.xr's commands: enter, exit, recenter, set, pulse.
    fn xr_command(&mut self, name: &str, a: &Json) {
        match name {
            "enter" => {
                let mode = a.get("mode").as_str();
                if self.xr.mode != xr::Mode::Off {
                    self.xr_leave();
                }
                if mode == "stereo" {
                    self.xr.enter("stereo", a);
                    self.commands.push(HostCommand { kind: "sensor".into(), name: "orient".into(), args: Json::Bool(true) });
                } else if self.xr.always {
                    self.xr.enter("vr", a);
                } else if self.xr.vr_ok {
                    self.xr.enter("vr", a);
                    self.commands.push(HostCommand { kind: "xr".into(), name: "enter".into(), args: a.clone() });
                } else {
                    self.xr.events.push(json::obj(vec![member("type", Json::Str("error".into())), member("reason", Json::Str("unsupported".into()))]));
                }
            }
            "exit" => self.xr_leave(),
            "recenter" => self.xr.recentre_now(),
            "set" => self.xr.options(a),
            "pulse" => {
                if self.xr.headset() {
                    self.commands.push(HostCommand { kind: "xr".into(), name: "pulse".into(), args: a.clone() });
                }
            }
            _ => {}
        }
    }

    fn take_commands(&mut self, cmds: &Json) {
        for c in cmds.items() {
            let cmd = HostCommand::from_json(&c);
            if cmd.kind == "launch" {
                self.pending = Some(cmd.name.clone());
                continue;
            }
            if cmd.kind == "sim" {
                self.fluid.command(&cmd.name, &cmd.args);
                continue;
            }
            if cmd.kind == "measure" {
                if !self.measure.contains(&cmd.name) {
                    self.measure.push(cmd.name.clone());
                }
                continue;
            }
            if cmd.kind == "shader" {
                // rg.shader(name, { src, kind }): the game's GLSL read here, where the files are
                let src = cmd.args.get("src").as_str();
                let kind = cmd.args.get("kind").as_str();
                let dir = self.scene.dir.clone();
                let vfs = &self.vfs;
                let read = |p: &str| -> Option<String> {
                    let path = if p.starts_with('/') { p.to_string() } else { vfs::join(&dir, p) };
                    if vfs.exists(&path) {
                        Some(String::from_utf8_lossy(&vfs.read(&path)).into_owned())
                    } else {
                        None
                    }
                };
                match rg_shader::register_game(&cmd.name, if kind.is_empty() { "liquid" } else { &kind }, &src, &read) {
                    Ok(key) => self.scene.set_shader(&cmd.name, &key),
                    Err(e) => {
                        self.scene.set_shader(&cmd.name, "");
                        self.log.push(e);
                    }
                }
                continue;
            }
            if cmd.kind == "three" {
                // a baked particle run: its file read here, where the files are
                if cmd.name == "add" && cmd.args.get("shape").as_str() == "splats" {
                    let src = cmd.args.get("src").as_str();
                    let path = if src.starts_with('/') { src } else { vfs::join(&self.scene.dir, &src) };
                    self.scene.splat_bytes = if self.vfs.exists(&path) { Some(self.vfs.read(&path)) } else { None };
                }
                // a baked mesh file (a mesh's `src`), read here too
                if cmd.name == "add" && cmd.args.get("shape").as_str() == "mesh" && !cmd.args.get("src").is_null() {
                    let src = cmd.args.get("src").as_str();
                    let path = if src.starts_with('/') { src } else { vfs::join(&self.scene.dir, &src) };
                    self.scene.mesh_bytes = if self.vfs.exists(&path) { Some(self.vfs.read(&path)) } else { None };
                }
                self.scene.command(&cmd.name, &cmd.args);
                continue;
            }
            if cmd.kind == "save" {
                self.save(&cmd.name, cmd.args.clone());
                continue;
            }
            if cmd.kind == "setting" {
                self.set_setting(&cmd.name, cmd.args.clone());
                continue;
            }
            if cmd.kind == "xr" {
                self.xr_command(&cmd.name, &cmd.args);
                continue;
            }
            self.commands.push(cmd);
        }
    }

    /// Keeps `key` in the settings every game shares (rg.setLang) and asks
    /// the platform to persist them.
    fn set_setting(&mut self, key: &str, value: Json) {
        let mut members = self.settings.members();
        members.retain(|m| m.key != key);
        members.push(member(key, value));
        self.settings = Json::Obj(members);
        let text = self.settings.write();
        self.vfs.write_text(SETTINGS, &text);
        self.commands.push(HostCommand { kind: "persist".into(), name: SETTINGS.into(), args: Json::Str(text) });
        // another renderer: the game starts again with it
        if key == "renderer" {
            if let Some(g) = &self.game {
                self.pending = Some(if g.id == self.launcher { String::new() } else { g.id.clone() });
            }
        }
    }

    /// Keeps `key` in the game's save file and asks the platform to persist it.
    fn save(&mut self, key: &str, value: Json) {
        let mut members = self.saved.members();
        let mut found = false;
        for m in members.iter_mut() {
            if m.key == key {
                m.value = value.clone();
                found = true;
            }
        }
        if !found {
            members.push(member(key, value));
        }
        self.saved = Json::Obj(members);
        if let Some(g) = &self.game {
            let path = format!("/save/{}.json", g.id);
            let text = self.saved.write();
            self.vfs.write_text(&path, &text);
            self.commands.push(HostCommand { kind: "persist".into(), name: path, args: Json::Str(text) });
        }
    }

    /// One frame of `dt` milliseconds: the input since the last frame goes to
    /// the script, its view is laid out into `draw`, its requests into
    /// `commands`. Err when the script threw (its error is on the screen).
    pub fn frame(&mut self, dt_ms: f64) -> Result<(), String> {
        let step = self.clock.frame_dt(dt_ms);
        self.run_frame(step)
    }

    /// One frame from the display's vsync time (ms, any origin) and its frame
    /// period (ms, 0 when the host does not know it): the step is whole
    /// display frames, the rest carried (rg_core::clock::FrameClock).
    pub fn frame_at(&mut self, vsync_ms: f64, period_ms: f64) -> Result<(), String> {
        let step = self.clock.frame_vsync(vsync_ms, period_ms);
        self.run_frame(step)
    }

    /// The animations' frame: sound lengths now known, every clock and
    /// animation moved by `step` ms; None when the game has none.
    fn anim_frame(&mut self, step: f64) -> Option<Json> {
        let mut a = self.anims.borrow_mut();
        for u in a.unknown_sounds() {
            let it = u.items();
            let path = it[2].as_str();
            if self.vfs.exists(&path) {
                if let Some(ms) = motion::audio_ms(&self.vfs.read(&path)) {
                    a.sound_length(it[0].as_num(0.0) as i64, it[1].as_num(0.0) as i64, ms);
                }
            }
        }
        let values = a.advance(step);
        if a.anims.is_empty() && a.seqs.is_empty() && a.springs.is_empty() && a.clocks.len() == 1 && a.events.is_empty() {
            return None;
        }
        Some(a.frame_json(values))
    }

    fn run_frame(&mut self, step: f64) -> Result<(), String> {
        self.draw.clear();
        let dt = step / 1000.0;
        self.time += dt;
        // a host's compile errors of game shaders (rg_shader::explain) into the game's log
        for m in rg_shader::take_errors() {
            self.log.push(m);
        }
        self.xr_step();
        let mut events = self.input.take_events();
        if !self.error.is_empty() || self.script.is_none() {
            // a tap or Back on the error screen goes to the launcher
            let mut leave = false;
            for e in events.iter() {
                if e.kind == "pointerup" || e.kind == "back" {
                    leave = true;
                }
            }
            if leave && self.has_launcher() && self.game.as_ref().map(|g| g.id != self.launcher).unwrap_or(true) {
                self.pending = Some(String::new());
            }
            self.render_error();
            self.launch_pending();
            return if self.error.is_empty() { Ok(()) } else { Err(self.error.clone()) };
        }
        let mut evs = Vec::new();
        let world_on = self.world.borrow().active;
        let dom_on = self.dom_on;
        for e in events.iter_mut() {
            let tap = e.kind == "pointerdown" || e.kind == "pointerup";
            if tap {
                e.target = match self.dom.as_ref().filter(|_| dom_on) {
                    // the page's node: js/dom.js finds the element with a handler
                    Some(d) => format!("#dom:{}", d.node_at(e.x, e.y)),
                    None => self.ui.id_at(e.x, e.y),
                };
            }
            let mut j = event_json(e);
            // what the 3D world has under the finger (React Three Fiber's events),
            // or a VR controller's ray that missed the panel
            let ray = self.xr_rays.iter().find(|r| r.0 == e.pointer).map(|r| (r.1, r.2));
            if tap && world_on {
                let w = self.world.borrow();
                let hits = match (ray, w.rig()) {
                    (Some(ray), Some((p, r, u, f))) => {
                        let (o, d) = self.xr.ray_world(ray, p, r, u, f);
                        w.raycast_ray(o, d)
                    }
                    (Some(_), None) => Vec::new(),
                    _ => w.raycast(e.x as f32, e.y as f32),
                };
                if let Some(hit) = hits.into_iter().next() {
                    if let Json::Obj(m) = &mut j {
                        m.push(member("hit", hit));
                    }
                }
            }
            evs.push(j);
        }
        let anim = self.anim_frame(step);
        let arg = json::obj(vec![
            member("w", Json::Num(self.ui.width)),
            member("h", Json::Num(self.ui.height)),
            member("dt", Json::Num(dt)),
            member("time", Json::Num(self.time)),
            member("clock", motion::clock_json(&self.clock)),
            member("anim", anim.unwrap_or(Json::Null)),
            member("input", json::parse(&self.input.state_json())),
            member("events", Json::Arr(evs)),
            member("sim", self.fluid.state()),
            member("boxes", self.boxes.clone()),
            member("xr", self.xr_state()),
        ]);
        self.xr.events.clear();
        self.lend_files(true);
        let p0 = now_ms();
        let r = self.script.as_mut().unwrap().call("__frame", arg.write());
        let p1 = now_ms();
        let out = self.script.as_mut().unwrap().take_output();
        self.log.extend(out);
        match r {
            Ok(text) => {
                let reply = json::parse(&text);
                self.take_commands(&reply.get("cmds"));
                let tree = reply.get("tree");
                self.fluid.step(dt);
                self.scene.gl = self.gl3d;
                self.scene.unified = self.gl3d && self.gl_all;
                self.scene.textures = self.textures;
                self.scene.detail = self.detail;
                self.scene.terrain = self.terrain;
                self.scene.splats_ok = self.splats;
                // VR: the 3D is drawn per eye (stereo here, a headset's by xr_eye)
                let stereo = self.xr.mode == xr::Mode::Stereo && self.xr.eyes_on() && self.gl3d;
                let eyes = stereo || self.xr.immersive();
                self.scene.eyes_only = eyes;
                self.world.borrow_mut().eyes_only = eyes;
                self.scene.split_through = !reply.get("scene3d").is_null();
                self.scene.render(&mut self.draw, self.ui.width, self.ui.height);
                let t0 = self.scene.tris.len();
                self.world.borrow_mut().render(&reply.get("scene3d"), self.ui.width, self.ui.height, self.gl3d, &mut self.draw, &mut self.scene.tris);
                // The rg.three scene's see-through faces (a light beam, a flame: depth 2…3,
                // the last of its triangles) go after the JSX world's faces: the host adds
                // their colour to what is drawn before them, so a beam in front of a
                // <primitive> lights it instead of hiding it. (Not for a host that draws
                // the two as layers of their own, by ranges of the triangles.)
                if self.gl3d && !self.gl_all && t0 > 0 && self.scene.tris.len() > t0 {
                    let from = self.scene.through_from().min(t0);
                    let through: Vec<f32> = self.scene.tris.drain(from..t0).collect();
                    self.scene.tris.extend(through);
                }
                if stereo {
                    self.stereo_tris();
                }
                if self.gl3d && self.gl_all {
                    self.draw.layer3d(t0, self.scene.tris.len());
                    // (by layers: the scene's see-through triangles as a layer after the world's)
                    if self.scene.split_through {
                        let from = self.scene.through_from().min(t0);
                        self.draw.layer3d(from, t0);
                    }
                }
                self.lend_files(false);
                self.fluid.render(&mut self.draw, self.ui.width, self.ui.height);
                let ids = std::mem::take(&mut self.measure);
                let mut parts = [p1 - p0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
                if let Some(d) = self.dom.as_mut().filter(|_| dom_on) {
                    let script = self.script.as_mut().unwrap();
                    let mut eval = |src: &str| script.eval(src, "dom.js").unwrap_or_default();
                    let vfs = &self.vfs;
                    let image = |path: &str| image_size(&vfs.read(path));
                    d.render(&mut eval, &image, self.ui.width, self.ui.height, &mut self.draw);
                    let t = d.timing();
                    parts[1..5].copy_from_slice(&t);
                    let pb = now_ms();
                    let asked = Json::Arr(ids.iter().map(|i| Json::Str(i.clone())).collect());
                    self.boxes = json::parse(&eval(&format!("__rgDom.boxes({})", asked.write())));
                    parts[5] = now_ms() - pb;
                    self.log.extend(script.take_output());
                } else {
                    let pl = now_ms();
                    self.ui.render(&tree, &mut self.draw);
                    let pb = now_ms();
                    self.boxes = self.ui.boxes(&ids);
                    parts[3] = pb - pl;
                    parts[5] = now_ms() - pb;
                }
                // a game just started: black over it, fading out
                if self.fade_in > 0.0 {
                    let o = (self.fade_in / FADE_IN).clamp(0.0, 1.0);
                    let (w, h) = (self.ui.width as f32, self.ui.height as f32);
                    self.draw.rings(6, [0.0; 3], o * o * (3.0 - 2.0 * o), 0.0, &[0.0, 0.0, w, 0.0, w, h, 0.0, h], &[8.0]);
                    self.fade_in -= dt;
                }
                parts[6] = now_ms() - p0;
                self.perf_frame(parts);
                self.launch_pending();
                Ok(())
            }
            Err(e) => {
                self.lend_files(false);
                self.error = e.clone();
                self.log.push(e.clone());
                self.render_error();
                Err(e)
            }
        }
    }

    /// One frame's times into the sums; every PERF_FRAMES frames their
    /// averages go to the log
    fn perf_frame(&mut self, parts: [f64; 7]) {
        if parts[6] <= 0.0 {
            return;
        }
        let p = &mut self.perf;
        for i in 0..7 {
            p.sum[i] += parts[i];
        }
        p.max = p.max.max(parts[6]);
        p.n += 1;
        if p.n < PERF_FRAMES {
            return;
        }
        let n = p.n as f64;
        let (sum, max) = (p.sum, p.max);
        let a = |i: usize| sum[i] / n;
        let id = self.game.as_ref().map(|g| g.id.clone()).unwrap_or_default();
        let line = if self.dom_on {
            let (fast, full) = self.dom.as_mut().map(|d| d.frames()).unwrap_or((0, 0));
            format!("perf {} dom: frame {:.1} ms (max {:.1}): js {:.1}, page {:.1}, take {:.1}, layout {:.1}, list {:.1}, boxes {:.1}; fast {} full {}", id, a(6), max, a(0), a(1), a(2), a(3), a(4), a(5), fast, full)
        } else {
            format!("perf {} evg: frame {:.1} ms (max {:.1}): js {:.1}, layout+draw {:.1}, boxes {:.1}", id, a(6), max, a(0), a(3), a(5))
        };
        self.perf = Perf::default();
        self.log.push(line);
    }

    /// The host fetched (`ok`) or failed to fetch the pack of game `id` that
    /// `start` asked for. Starts it, unless another game was asked for since.
    pub fn pack_done(&mut self, id: &str, ok: bool) -> Result<(), String> {
        if self.waiting_pack.as_deref() != Some(id) {
            return Ok(());
        }
        self.waiting_pack = None;
        if ok {
            self.start(id)
        } else {
            self.fail(format!("Pelin '{}' lataus ei onnistunut. Tarkista verkkoyhteys.", id))
        }
    }

    fn launch_pending(&mut self) {
        if let Some(id) = self.pending.take() {
            let _ = self.start(&id);
            self.fade_in = FADE_IN;
        }
    }

    /// The script's error on the screen, in the engine's own colours.
    fn render_error(&mut self) {
        if self.error.is_empty() {
            return;
        }
        let msg = self.error.clone();
        let tree = json::parse(&format!(
            "{{\"t\":\"div\",\"s\":{{\"width\":\"100%\",\"height\":\"100%\",\"background-color\":\"#2b1630\",\"padding\":\"16px\"}},\"c\":[\
             {{\"t\":\"div\",\"s\":{{\"font-size\":\"22px\",\"color\":\"#ffd166\",\"margin-bottom\":\"12px\"}},\"c\":[\"Oops!\"]}},\
             {{\"t\":\"div\",\"s\":{{\"font-size\":\"14px\",\"color\":\"#ffffff\"}},\"c\":[{}]}},\
             {{\"t\":\"div\",\"s\":{{\"font-size\":\"13px\",\"color\":\"#b9a7c9\",\"margin-top\":\"16px\"}},\"c\":[\"Tap to go back\"]}}]}}",
            quote(&msg)
        ));
        // a plain sheet: the game's own may be what is broken
        let mut plain = Ui::new();
        plain.width = self.ui.width;
        plain.height = self.ui.height;
        self.draw.clear();
        plain.render(&tree, &mut self.draw);
    }

    /// the game's JS heap: (collections run so far, live objects)
    pub fn js_heap(&self) -> (i64, i64) {
        match &self.script {
            Some(s) => (s.vm.gc_runs() as i64, s.vm.heap_size() as i64),
            None => (0, 0),
        }
    }

    /// a whole JS collection now (a test's): (ms it took, live objects after)
    pub fn js_collect(&mut self) -> (f64, i64) {
        match &mut self.script {
            Some(s) => {
                let t = now_ms();
                s.vm.vm.collect();
                (now_ms() - t, s.vm.heap_size() as i64)
            }
            None => (0.0, 0),
        }
    }

    /// the live JS objects by kind and first property names, most first (a test's)
    pub fn js_census(&mut self, top: usize) -> Vec<(usize, String)> {
        let mut out: Vec<(usize, String)> = Vec::new();
        if let Some(s) = &mut self.script {
            let vm = &mut s.vm.vm;
            vm.collect();
            let mut m: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
            for o in vm.objs.iter() {
                if o.free {
                    continue;
                }
                let mut k = format!("c{}", o.class);
                if o.shape >= 0 && (o.shape as usize) < vm.shapes.len() {
                    let sh = &vm.shapes[o.shape as usize];
                    let h = &vm.shapes[sh.kref as usize];
                    let n = (sh.nkeys as usize).min(h.keys.len()).min(6);
                    for i in 0..n {
                        k.push(' ');
                        k.push_str(&vm.atom_str(h.keys[i]));
                    }
                }
                *m.entry(k).or_insert(0) += 1;
            }
            out = m.into_iter().map(|(k, v)| (v, k)).collect();
            out.sort_by(|a, b| b.0.cmp(&a.0));
            out.truncate(top);
        }
        out
    }

    /// Runs `src` in the running game's script (its top-level names are in
    /// scope) and answers what it evaluates to as text: for tools that look
    /// into a game from outside (Games' inspect_game). What it logs goes to
    /// `log`.
    pub fn eval(&mut self, src: &str) -> Result<String, String> {
        let s = match self.script.as_mut() {
            Some(s) => s,
            None => return Err("no game is running".to_string()),
        };
        let r = s.eval(src, "inspect.js");
        let out = s.take_output();
        self.log.extend(out);
        r
    }

    /// The last frame's laid-out element tree (Ui::tree's form), from the
    /// RangerDOM page when that renderer draws the view.
    pub fn tree(&mut self) -> Json {
        if self.dom_on {
            if let Some(s) = self.script.as_mut() {
                return json::parse(&s.eval("__rgDom.tree()", "dom.js").unwrap_or_default());
            }
        }
        self.ui.tree()
    }

    /// Takes the frame's commands for the platform.
    pub fn take_host_commands(&mut self) -> Vec<HostCommand> {
        std::mem::take(&mut self.commands)
    }
}
