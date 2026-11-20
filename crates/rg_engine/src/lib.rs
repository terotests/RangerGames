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

pub mod draw;
pub mod fiber;
pub mod fluid;
pub mod globe;
pub mod gltf;
pub mod scene3d;
pub mod script;
pub mod ui;

use draw::DrawStream;
use rg_core::host::HostCommand;
use rg_core::input::{event_json, Input};
use rg_core::json::{self, member, quote, Json};
use rg_core::vfs::{self, Vfs};
use script::Script;
use ui::Ui;
use std::cell::RefCell;
use std::rc::Rc;

/// The script's synchronous questions to the engine (`__hostSync`): the 3D
/// world answers them (fiber.rs World::sync).
struct WorldSync {
    world: Rc<RefCell<fiber::World>>,
}

impl cerxes::vm::HostSync for WorldSync {
    fn call(&mut self, request: &str) -> String {
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
    /// the game that lists the others (`launcher`)
    pub launcher: String,
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
    /// the game's 3D scene (rg.three), drawn under its 2D view
    pub scene: scene3d::Scene,
    /// the host draws the 3D scene itself with a depth buffer (WebGL / GLES):
    /// then the scene's triangles are in `scene.tris`, not in the draw stream
    pub gl3d: bool,
    /// the host draws textured globes (draw kind 8): planets with a
    /// `texture` are sent as one sphere command instead of their regions
    pub textures: bool,
    /// the host installs games from the download list (rg.store: the
    /// "store" commands and sensor events)
    pub store: bool,
    /// the host draws a planet's `detail` pictures (a sphere command with a
    /// window, 24 numbers)
    pub detail: bool,
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
            textures: false,
            store: false,
            detail: false,
            world: Rc::new(RefCell::new(fiber::World::new())),
            fluid: fluid::Sim::new(),
            measure: Vec::new(),
            boxes: Json::Obj(Vec::new()),
            dom: None,
            dom_default: false,
            dom_on: false,
            commands: Vec::new(),
            error: String::new(),
            log: Vec::new(),
            perf: Perf::default(),
            pending: None,
            waiting_pack: None,
            launcher: "launcher".to_string(),
            saved: Json::Obj(Vec::new()),
            settings: Json::Obj(Vec::new()),
            screen_w: 360.0,
            screen_h: 640.0,
            scale: 1.0,
            off_x: 0.0,
            off_y: 0.0,
            time: 0.0,
            seed: 1,
        }
    }

    pub fn set_seed(&mut self, seed: i64) {
        self.seed = seed;
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
            // a downloaded game: the host's note of it; one the player
            // removed is gone from the list now, its files at the next start
            let note = format!("{}/_store.json", dir);
            if self.vfs.exists(&note) {
                let st = json::parse(&self.vfs.read_text(&note));
                if st.get("removed").as_bool() {
                    continue;
                }
                info.store = st;
            }
            out.push(info);
        }
        // an installed download that replaces a game the app came with takes
        // that game's place: its order and section, and the old one leaves
        let mut gone: Vec<String> = Vec::new();
        for i in 0..out.len() {
            if out[i].store.is_null() || out[i].replaces.is_empty() || out[i].replaces == out[i].id {
                continue;
            }
            let r = out[i].replaces.clone();
            if let Some(old) = out.iter().find(|g| g.id == r && g.store.is_null()).cloned() {
                out[i].order = old.order;
                if out[i].section.is_empty() {
                    out[i].section = old.section.clone();
                }
                gone.push(r);
            }
        }
        out.retain(|g| !(g.store.is_null() && gone.contains(&g.id)));
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
    /// where the top of the phone points, degrees from north), or `error`
    /// (`{sensor, reason}`). The game asks for one with `rg.sensor(name, true)`
    /// and gets it in `onLocation(fix)` / `onHeading(deg)` / `onSensor(name, data)`.
    pub fn sensor(&mut self, name: &str, data: &str) {
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

    pub fn start(&mut self, id: &str) -> Result<(), String> {
        let id = if id.is_empty() { self.launcher.clone() } else { id.to_string() };
        self.scene = scene3d::Scene::new();
        *self.world.borrow_mut() = fiber::World::new();
        self.fluid = fluid::Sim::new();
        self.measure = Vec::new();
        self.boxes = Json::Obj(Vec::new());
        // the last game's sensors off (GPS uses the battery)
        self.commands.push(HostCommand { kind: "sensor".into(), name: "*".into(), args: Json::Bool(false) });
        self.commands.push(HostCommand { kind: "stop".into(), name: "music".into(), args: Json::Null });
        // rg.net: the links to other phones stay up from game to game; the
        // host tells the new game what it can do and which links are up
        // ({type: "info"}), and the game says to them where it is
        self.commands.push(HostCommand { kind: "net".into(), name: "info".into(), args: Json::Null });
        self.error = String::new();
        self.script = None;
        self.input = Input::new();
        let info = match self.game_info(&id) {
            Some(g) => g,
            None => return self.fail(format!("no game '{}' in /games", id)),
        };
        self.game = Some(info.clone());
        self.fit();
        self.time = 0.0;
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
        s.vm.vm.set_host_sync(Box::new(WorldSync { world: self.world.clone() }));
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
        if let Err(e) = s.eval(&format!("__settings({});", self.settings.write()), "settings.js") {
            return self.fail(e);
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
            member("speech", Json::Bool(info.speech)),
            // the renderers this host has, and the one drawing (rg.renderer)
            member("renderers", Json::Arr(if self.dom.is_some() { vec![Json::Str("evg".into()), Json::Str("dom".into())] } else { vec![Json::Str("evg".into())] })),
            member("renderer", Json::Str(if self.dom_on { "dom".into() } else { "evg".into() })),
            // false when there is no launcher to go back to (a game played
            // alone from a link): no close button, exit stays in the game
            member("menu", Json::Bool(self.has_launcher())),
            member("store", Json::Bool(self.store)),
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
            if cmd.kind == "three" {
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
        self.draw.clear();
        let dt = (dt_ms / 1000.0).clamp(0.0, 0.1);
        self.time += dt;
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
            // what the 3D world has under the finger (React Three Fiber's events)
            if tap && world_on {
                if let Some(hit) = self.world.borrow().raycast(e.x as f32, e.y as f32).into_iter().next() {
                    if let Json::Obj(m) = &mut j {
                        m.push(member("hit", hit));
                    }
                }
            }
            evs.push(j);
        }
        let arg = json::obj(vec![
            member("w", Json::Num(self.ui.width)),
            member("h", Json::Num(self.ui.height)),
            member("dt", Json::Num(dt)),
            member("time", Json::Num(self.time)),
            member("input", json::parse(&self.input.state_json())),
            member("events", Json::Arr(evs)),
            member("sim", self.fluid.state()),
            member("boxes", self.boxes.clone()),
        ]);
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
                self.scene.textures = self.textures;
                self.scene.detail = self.detail;
                self.scene.render(&mut self.draw, self.ui.width, self.ui.height);
                self.world.borrow_mut().render(&reply.get("scene3d"), self.ui.width, self.ui.height, self.gl3d, &mut self.draw, &mut self.scene.tris);
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
