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
pub mod fluid;
pub mod globe;
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

/// Where the settings every game shares are kept (the language).
const SETTINGS: &str = "/save/_settings.json";

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
            icon: s("icon", ""),
            color: s("color", "#4f7cff"),
            players: s("players", "1"),
            order: j.get("order").as_num(100.0),
            hidden: j.get("hidden").as_bool(),
            i18n: j.get("i18n"),
            speech: !matches!(j.get("speech"), Json::Bool(false)),
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
    /// the game the launcher command asked for, started after the frame
    pending: Option<String>,
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
    /// the game's water and sand (rg.sim), drawn over the 3D and under the 2D view
    pub fluid: fluid::Sim,
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
            fluid: fluid::Sim::new(),
            commands: Vec::new(),
            error: String::new(),
            log: Vec::new(),
            pending: None,
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
            out.push(GameInfo::from_json(&id, &dir, &j));
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
        let (gw, gh) = match &self.game {
            Some(g) => (g.width, g.height),
            None => (0.0, 0.0),
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
    pub fn start(&mut self, id: &str) -> Result<(), String> {
        let id = if id.is_empty() { self.launcher.clone() } else { id.to_string() };
        self.scene = scene3d::Scene::new();
        self.fluid = fluid::Sim::new();
        // the last game's sensors off (GPS uses the battery)
        self.commands.push(HostCommand { kind: "sensor".into(), name: "*".into(), args: Json::Bool(false) });
        self.commands.push(HostCommand { kind: "stop".into(), name: "music".into(), args: Json::Null });
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
        if let Err(e) = s.eval(script::RUNTIME, "runtime.js") {
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
        ]);
        let r = s.call("__start", arg.write());
        self.log.extend(s.take_output());
        match r {
            Ok(text) => {
                let cmds = json::parse(&text);
                self.script = Some(s);
                self.take_commands(&cmds);
                self.commands.push(HostCommand { kind: "title".into(), name: info.name.clone(), args: Json::Null });
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
            if leave && self.game.as_ref().map(|g| g.id != self.launcher).unwrap_or(true) {
                self.pending = Some(String::new());
            }
            self.render_error();
            self.launch_pending();
            return if self.error.is_empty() { Ok(()) } else { Err(self.error.clone()) };
        }
        let mut evs = Vec::new();
        for e in events.iter_mut() {
            if e.kind == "pointerdown" || e.kind == "pointerup" {
                e.target = self.ui.id_at(e.x, e.y);
            }
            evs.push(event_json(e));
        }
        let arg = json::obj(vec![
            member("w", Json::Num(self.ui.width)),
            member("h", Json::Num(self.ui.height)),
            member("dt", Json::Num(dt)),
            member("time", Json::Num(self.time)),
            member("input", json::parse(&self.input.state_json())),
            member("events", Json::Arr(evs)),
            member("sim", self.fluid.state()),
        ]);
        let r = self.script.as_mut().unwrap().call("__frame", arg.write());
        let out = self.script.as_mut().unwrap().take_output();
        self.log.extend(out);
        match r {
            Ok(text) => {
                let reply = json::parse(&text);
                self.take_commands(&reply.get("cmds"));
                let tree = reply.get("tree");
                self.fluid.step(dt);
                self.scene.render(&mut self.draw, self.ui.width, self.ui.height);
                self.fluid.render(&mut self.draw, self.ui.width, self.ui.height);
                self.ui.render(&tree, &mut self.draw);
                self.launch_pending();
                Ok(())
            }
            Err(e) => {
                self.error = e.clone();
                self.log.push(e.clone());
                self.render_error();
                Err(e)
            }
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

    /// Takes the frame's commands for the platform.
    pub fn take_host_commands(&mut self) -> Vec<HostCommand> {
        std::mem::take(&mut self.commands)
    }
}
