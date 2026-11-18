// SPDX-License-Identifier: AGPL-3.0-or-later
//! The RangerDOM renderer (rg_engine::DomBackend): the game's script has
//! RangerDOM's DOM (js/prelude.js, webapi.js, host.js) and puts its view into
//! `document` (rg_engine js/dom.js); here the page's render tree
//! (`__renderDelta()`, every box with its computed style) becomes EVG
//! elements (RangerDOM's DomPage, which keeps the elements and their layout
//! of what did not change), EVG lays them out, the boxes go back to the page
//! (`__layout`, for getBoundingClientRect and rg.box) and EVG's display list
//! is written into the engine's draw stream.

use rangerdom_view::DomPage;
use rangerevg::{EVGDisplayList, EVGDrawCmd, EVGElement, EVGHitTest, EVGLayout, EVGTextEngine};
use ranger::cell::RefCell;
use rg_engine::draw::DrawStream;
use rg_engine::DomBackend;
use std::rc::Rc;

const PRELUDE: &str = include_str!("../../../.deps/RangerDOM/js/prelude.js");
const WEBAPI: &str = include_str!("../../../.deps/RangerDOM/js/webapi.js");
const HOST: &str = include_str!("../../../.deps/RangerDOM/js/host.js");

/// The page the game's view goes into.
const PAGE: &str = "<!doctype html><html><head></head><body></body></html>";

/// The page's address: a picture `/games/x/a.png` is `<ORIGIN>/games/x/a.png` to it.
const ORIGIN: &str = "https://rangergames.local";

fn path_of(url: &str) -> String {
    match url.strip_prefix(ORIGIN) {
        Some(p) => p.to_string(),
        None => url.to_string(),
    }
}

fn quote(s: &str) -> String {
    rg_core::json::quote(s)
}

pub struct DomRender {
    page: DomPage,
    lay: Rc<RefCell<EVGLayout>>,
    root: Option<Rc<RefCell<EVGElement>>>,
    /// the last laid-out page's draw commands, drawn again while the page
    /// does not change
    cmds: Vec<Rc<RefCell<EVGDrawCmd>>>,
    size: (f64, f64),
    /// timings of the last frame (ms): render tree, layout, display list
    pub timing: [f64; 3],
}

impl DomRender {
    pub fn new() -> DomRender {
        DomRender {
            page: DomPage::new(),
            lay: Rc::new(RefCell::new(EVGLayout::new())),
            root: None,
            cmds: Vec::new(),
            size: (0.0, 0.0),
            timing: [0.0; 3],
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn now() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}
#[cfg(target_arch = "wasm32")]
fn now() -> f64 {
    0.0
}

impl DomBackend for DomRender {
    fn boot(&self, w: f64, h: f64) -> Vec<(String, String)> {
        vec![
            // the engine's console (log lines to the host) outlives the
            // realm's, which would keep them in the page's outbox
            ("dom-pre.js".to_string(), "var __rgConsole = console;".to_string()),
            ("prelude.js".to_string(), PRELUDE.to_string()),
            ("webapi.js".to_string(), WEBAPI.to_string()),
            ("host.js".to_string(), HOST.to_string()),
            (
                "dom-page.js".to_string(),
                format!(
                    "__page({}, {}); __layout({{viewport: [{}, {}]}}); __deltaRender(true); console = __rgConsole; window.console = __rgConsole;",
                    quote(PAGE),
                    quote(&format!("{}/", ORIGIN)),
                    w,
                    h
                ),
            ),
        ]
    }

    fn reset(&mut self) {
        *self = DomRender::new();
    }

    fn render(&mut self, eval: &mut dyn FnMut(&str) -> String, image: &dyn Fn(&str) -> Option<(f64, f64)>, w: f64, h: f64, out: &mut DrawStream) {
        let t0 = now();
        if self.size != (w, h) {
            self.size = (w, h);
            eval(&format!("__layout({{viewport: [{}, {}]}})", w, h));
            self.page.setSize(w, h);
        }
        let delta = eval("__renderDelta()");
        let te = now();
        let dlen = delta.len();
        let mut r = self.page.take(delta);
        #[cfg(not(target_arch = "wasm32"))]
        if std::env::var("RG_DOM_TIMING").is_ok() { eprintln!("dom: __renderDelta {:.2} ms, take {:.2} ms, {} bytes", te - t0, now() - te, dlen); }
        if r < 0 {
            r = self.page.take(eval("__renderDelta(1)"));
        }
        // the game's pictures: the page names them by URL on its own origin,
        // the virtual directory has them by path
        if r >= 0 {
            let wanted = self.page.wanted();
            if !wanted.is_empty() {
                for u in wanted.iter() {
                    let (iw, ih) = image(&path_of(u)).unwrap_or((0.0, 0.0));
                    self.page.setImageSize(u.clone(), iw, ih);
                }
                if self.page.rebuild() {
                    r = 1;
                }
            }
        }
        let t1 = now();
        let mut t2 = t1;
        if r > 0 || self.root.is_none() {
            let root = self.page.view();
            EVGLayout::set_page_size(&self.lay, w, h);
            EVGLayout::layout(&self.lay, root.clone());
            self.page.laidOut();
            let boxes = self.page.settle();
            if !boxes.is_empty() {
                eval(&format!("__layout({})", quote(&format!("{{\"boxes\":{}}}", boxes))));
            }
            t2 = now();
            let dl = Rc::new(RefCell::new(EVGDisplayList::new()));
            EVGDisplayList::set_fragments(&dl, false);
            EVGDisplayList::set_text_engine(&dl, EVGLayout::get_text_engine(&self.lay));
            EVGDisplayList::build(&dl, root.clone());
            self.cmds = dl.borrow().cmds.clone();
            fit_text_runs(&self.cmds, &EVGLayout::get_text_engine(&self.lay));
            for c in self.cmds.iter() {
                let src = c.borrow().src.clone();
                if c.borrow().kind == 2 && src.starts_with(ORIGIN) {
                    c.borrow_mut().src = path_of(&src);
                }
            }
            self.root = Some(root);
        }
        let t3 = now();
        self.timing = [t1 - t0, t2 - t1, t3 - t2];
        #[cfg(not(target_arch = "wasm32"))]
        if std::env::var("RG_DOM_TIMING").is_ok() {
            eprintln!("dom: render tree {:.2} ms, layout {:.2} ms, display list {:.2} ms ({})", self.timing[0], self.timing[1], self.timing[2], r);
        }
        for c in self.cmds.iter() {
            rg_engine::draw_command!(out, &*c.borrow());
        }
    }

    /// the page's nodes under (x, y), the topmost first, as "n,n,...":
    /// js/dom.js takes the first with an id, as EVG's id_at does (a box
    /// with no id over a button lets the tap through to it)
    fn node_at(&self, x: f64, y: f64) -> String {
        let root = match &self.root {
            Some(r) => r,
            None => return String::new(),
        };
        let ht = Rc::new(RefCell::new(EVGHitTest::new()));
        let list = EVGHitTest::paint_order_at(&ht, root.clone(), x, y);
        let mut out: Vec<String> = Vec::new();
        for el in list.iter().rev() {
            let id = el.borrow().id.clone();
            if id.is_empty() || !EVGHitTest::contains_point(el, x, y) {
                continue;
            }
            let n = DomPage::nodeOf(&id);
            if !n.is_empty() && !out.contains(&n) {
                out.push(n);
            }
        }
        out.join(",")
    }
}

/// Each text run sized to its own ink, as rg_engine's EVG path does
/// (ui.rs fit_text_runs): the painters keep a run's centre, so a run as wide
/// as its box drew left-aligned text centred.
fn fit_text_runs(cmds: &[Rc<RefCell<EVGDrawCmd>>], te: &Rc<RefCell<EVGTextEngine>>) {
    for c in cmds.iter() {
        let mut c = c.borrow_mut();
        if c.kind != 3 || c.text.is_empty() {
            continue;
        }
        let m = EVGTextEngine::measure_run_spaced(te, &c.text, &c.font_family, c.font_size, c.letter_spacing);
        let w = m.borrow().width + rg_engine::ui::bmp_emoji_extra(&c.text, c.font_size);
        if w > 0.0 && w < c.w {
            c.w = w;
        }
    }
}
