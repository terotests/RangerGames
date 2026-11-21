// SPDX-License-Identifier: AGPL-3.0-or-later
//! The RangerDOM renderer (rg_engine::DomBackend): the game's script has
//! RangerDOM's DOM (js/prelude.js, webapi.js, host.js) and puts its view into
//! `document` (rg_engine js/dom.js); here the page's render tree
//! (`__renderDelta()`, every box with its computed style) becomes EVG
//! elements (RangerDOM's DomPage, which keeps the elements and their layout
//! of what did not change), EVG lays them out, the boxes go back to the page
//! (`__layout`, for getBoundingClientRect and rg.box) and EVG's display list
//! is written into the engine's draw stream.

use rangerdom_style::DomStyle;
use rangerdom_view::{DomPage, DomPaint};
use rangerevg::{EVGDisplayList, EVGDrawCmd, EVGElement, EVGHitTest, EVGLayout, EVGRetain, EVGTextEngine};
use std::collections::HashMap;
use ranger::cell::RefCell;
use rg_engine::draw::DrawStream;
use rg_engine::DomBackend;
use std::rc::Rc;

const PRELUDE: &str = include_str!("../../../.deps/RangerDOM/js/prelude.js");
const WEBAPI: &str = include_str!("../../../.deps/RangerDOM/js/webapi.js");
/// webapi.js compiled at build time (build.rs), "" when it did not compile
const WEBAPI_UNIT: &str = include_str!(concat!(env!("OUT_DIR"), "/webapi.unit"));
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
    /// the laid-out page's elements by the DOM node they show (the
    /// outermost one), for js/dom.js's patches
    nodes: HashMap<String, Rc<RefCell<EVGElement>>>,
    /// frames drawn by patches, and by the full path
    pub fast_frames: usize,
    pub full_frames: usize,
    /// timings of the last frame (ms): render tree, layout, display list
    pub timing: [f64; 4],
    /// the page's elements and rule matching for webapi.js (RangerDOM's
    /// style in Rust, through __hostSync); one for every game
    style: Rc<std::cell::RefCell<DomStyle>>,
}

impl DomRender {
    pub fn new() -> DomRender {
        DomRender {
            page: DomPage::new(),
            lay: Rc::new(RefCell::new(EVGLayout::new())),
            root: None,
            cmds: Vec::new(),
            size: (0.0, 0.0),
            nodes: HashMap::new(),
            fast_frames: 0,
            full_frames: 0,
            timing: [0.0; 4],
            style: Rc::new(std::cell::RefCell::new(DomStyle::new())),
        }
    }
}

use rg_engine::now_ms as now;

fn map_nodes(el: &Rc<RefCell<EVGElement>>, out: &mut HashMap<String, Rc<RefCell<EVGElement>>>) {
    let id = el.borrow().id.clone();
    if !id.is_empty() {
        let n = DomPage::nodeOf(&id);
        if !n.is_empty() && !out.contains_key(&n) {
            out.insert(n, el.clone());
        }
    }
    let kids = el.borrow().children.clone();
    for k in kids.iter() {
        map_nodes(k, out);
    }
}

fn moves_only(name: &str) -> bool {
    matches!(name, "left" | "top" | "right" | "bottom" | "margin-top" | "margin-left" | "margin-right" | "margin-bottom")
}

/// EVGRetain.keepBeside, but an element of `shallow` (only moved) is laid
/// out again with what is in it kept
fn keep_beside(el: &Rc<RefCell<EVGElement>>, deep: &[Rc<RefCell<EVGElement>>], shallow: &[Rc<RefCell<EVGElement>>]) -> bool {
    if deep.iter().any(|d| Rc::ptr_eq(d, el)) {
        EVGRetain::not_kept(el);
        return true;
    }
    let me = shallow.iter().any(|d| Rc::ptr_eq(d, el));
    let mut d = false;
    let kids = el.borrow().children.clone();
    for k in kids.iter() {
        if keep_beside(k, deep, shallow) {
            d = true;
        }
    }
    if me {
        el.borrow_mut().keep_layout = false;
        el.borrow_mut().layout_clean = false;
        return true;
    }
    let abs = {
        let b = el.borrow();
        b.is_absolute || b.position == "absolute" || b.position == "fixed" || b.position == "sticky"
    };
    el.borrow_mut().keep_layout = !abs;
    el.borrow_mut().layout_clean = !d;
    d
}

/// js/dom.js's patches ([["node", "name", "value"], ...]) as triples
fn patches_of(text: &str) -> Option<Vec<(String, String, String)>> {
    let j = rg_core::json::parse(text);
    let mut out = Vec::new();
    match &j {
        rg_core::json::Json::Arr(a) => {
            for p in a.iter() {
                match p {
                    rg_core::json::Json::Arr(t) if t.len() == 3 => out.push((t[0].as_str(), t[1].as_str(), t[2].as_str())),
                    _ => return None,
                }
            }
        }
        _ => return None,
    }
    Some(out)
}

impl DomRender {
    /// The fast path: the patches of js/dom.js written on the elements laid
    /// out last (EVGRetain), the layout run only on the path to them. False
    /// when one has no element here: the full path then.
    fn patch(&mut self, eval: &mut dyn FnMut(&str) -> String, ps: &[(String, String, String)], w: f64, h: f64) -> bool {
        let root = match &self.root {
            Some(r) => r.clone(),
            None => return false,
        };
        let mut els = Vec::new();
        for (n, name, _) in ps.iter() {
            match self.nodes.get(n) {
                // (an <svg>'s markup goes only on the picture DomView drew)
                Some(el) if name == "svg" && el.borrow().tag_name != "svg" => return false,
                Some(el) => els.push(el.clone()),
                None => return false,
            }
        }
        if ps.is_empty() {
            return true;
        }
        let mut layout = false;
        for (i, (_, name, value)) in ps.iter().enumerate() {
            if name == "#text" {
                EVGRetain::patch_text(&els[i], value.clone());
                layout = true;
            } else if name == "svg" {
                // (paint only: the <svg> fills its path's box)
                DomPaint::patchSvg(&els[i], value);
            } else if EVGRetain::paint_only(name) {
                EVGRetain::patch(&els[i], name, value);
            } else {
                EVGRetain::patch_layout(&els[i], name, value);
                layout = true;
            }
        }
        EVGLayout::set_page_size(&self.lay, w, h);
        if layout {
            // (an element only moved, by a margin or an offset, keeps the
            // layout of what is in it: its subtree moves with it)
            let mut deep = Vec::new();
            let mut shallow = Vec::new();
            for (i, (_, name, _)) in ps.iter().enumerate() {
                if EVGRetain::paint_only(name) || name == "svg" {
                    continue;
                }
                if moves_only(name) {
                    shallow.push(els[i].clone());
                } else {
                    deep.push(els[i].clone());
                }
            }
            shallow.retain(|e| !deep.iter().any(|d| Rc::ptr_eq(d, e)));
            keep_beside(&root, &deep, &shallow);
            EVGLayout::layout(&self.lay, root.clone());
        } else {
            EVGRetain::paint_frame(&self.lay, &root);
        }
        self.page.laidOut();
        let boxes = self.page.settle();
        if !boxes.is_empty() {
            eval(&format!("__layout({})", quote(&format!("{{\"boxes\":{}}}", boxes))));
        }
        self.list(&root);
        true
    }

    /// the display list of the laid-out page into `cmds`
    fn list(&mut self, root: &Rc<RefCell<EVGElement>>) {
        let dl = Rc::new(RefCell::new(EVGDisplayList::new()));
        EVGDisplayList::set_fragments(&dl, false);
        EVGDisplayList::set_text_engine(&dl, EVGLayout::get_text_engine(&self.lay));
        EVGDisplayList::build(&dl, root.clone());
        self.cmds = dl.borrow().cmds.clone();
        let te = EVGLayout::get_text_engine(&self.lay);
        for c in self.cmds.iter() {
            let src = c.borrow().src.clone();
            if c.borrow().kind == 2 && src.starts_with(ORIGIN) {
                c.borrow_mut().src = path_of(&src);
            }
            // a text run placed in a wider line box (centred or right
            // aligned text): the painters centre a run in its w, so w is
            // the run's own width, as EVG gives it
            if c.borrow().kind == 3 {
                let (text, fam, size, sp, w) = {
                    let b = c.borrow();
                    (b.text.clone(), b.font_family.clone(), b.font_size, b.letter_spacing, b.w)
                };
                let rw = EVGTextEngine::measure_run_spaced(&te, &text, &fam, size, sp).borrow().width
                    + rg_engine::ui::bmp_emoji_extra(&text, size);
                if rw > 0.0 && rw < w - 0.5 {
                    c.borrow_mut().w = rw;
                }
            }
        }
    }

    fn stream(&self) -> DrawStream {
        let mut d = DrawStream::new();
        for c in self.cmds.iter() {
            rg_engine::draw_command!(&mut d, &*c.borrow());
        }
        d
    }
}

/// RangerDOM's style in Rust (DomStyle) on: off with RG_DOM_RSX=0
fn rsx_on() -> bool {
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::var("RG_DOM_RSX").map(|v| v != "0").unwrap_or(true)
    }
    #[cfg(target_arch = "wasm32")]
    {
        true
    }
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
                    "__page({}, {}); __layout({{viewport: [{}, {}]}}); __deltaRender(true); {}console = __rgConsole; window.console = __rgConsole;",
                    quote(PAGE),
                    quote(&format!("{}/", ORIGIN)),
                    w,
                    h,
                    if rsx_on() { "__webdom.rsx(true); " } else { "" }
                ),
            ),
        ]
    }

    fn unit(&self, name: &str) -> Option<&'static str> {
        if name == "webapi.js" && !WEBAPI_UNIT.is_empty() { Some(WEBAPI_UNIT) } else { None }
    }

    fn reset(&mut self) {
        let style = self.style.clone();
        *self = DomRender::new();
        self.style = style;
    }

    fn host_sync(&self) -> Option<Box<dyn FnMut(&str) -> String>> {
        let s = self.style.clone();
        Some(Box::new(move |r: &str| if DomStyle::mine(r) { s.borrow_mut().call(r) } else { String::new() }))
    }

    fn render(&mut self, eval: &mut dyn FnMut(&str) -> String, image: &dyn Fn(&str) -> Option<(f64, f64)>, w: f64, h: f64, out: &mut DrawStream) {
        let t0 = now();
        let fast = eval("__rgDom.fast()");
        if !fast.is_empty() && self.size == (w, h) && fast_on() {
            if let Some(ps) = patches_of(&fast) {
                if self.patch(eval, &ps, w, h) {
                    self.fast_frames += 1;
                    let t1 = now();
                    self.timing = [0.0, 0.0, t1 - t0, 0.0];
                    #[cfg(not(target_arch = "wasm32"))]
                    if std::env::var("RG_DOM_TIMING").is_ok() { eprintln!("dom: fast {} patches, {} bytes, {:.2} ms", ps.len(), fast.len(), t1 - t0); }
                    #[cfg(not(target_arch = "wasm32"))]
                    if !ps.is_empty() && std::env::var("RG_DOMCHECK").is_ok() {
                        let a = self.stream();
                        eval("__rgDom.flush()");
                        self.full(eval, image, w, h);
                        let b = self.stream();
                        if a.nums != b.nums || a.strings != b.strings {
                            let i = a.nums.iter().zip(b.nums.iter()).position(|(x, y)| x != y).unwrap_or(a.nums.len().min(b.nums.len()));
                            let lo = i.saturating_sub(4);
                            eprintln!("DOMCHECK differs at {} (len {} / {}, strings {}): fast {:?} full {:?} after {:?}", i, a.nums.len(), b.nums.len(), a.strings == b.strings, &a.nums[lo..(i + 6).min(a.nums.len())], &b.nums[lo..(i + 6).min(b.nums.len())], &ps[..ps.len().min(3)]);
                        } else {
                            eprintln!("DOMCHECK same ({} patches)", ps.len());
                        }
                    }
                    for c in self.cmds.iter() {
                        rg_engine::draw_command!(out, &*c.borrow());
                    }
                    return;
                }
            }
        }
        eval("__rgDom.flush()");
        self.full(eval, image, w, h);
        for c in self.cmds.iter() {
            rg_engine::draw_command!(out, &*c.borrow());
        }
    }

    fn timing(&self) -> [f64; 4] {
        self.timing
    }

    fn frames(&mut self) -> (usize, usize) {
        let f = (self.fast_frames, self.full_frames);
        self.fast_frames = 0;
        self.full_frames = 0;
        f
    }

    /// the page's nodes under (x, y), the topmost first, as "n,n,...":
    /// js/dom.js takes the first with an id, as EVG's id_at does (a box
    /// with no id over a button lets the tap through to it)
    fn node_at(&self, x: f64, y: f64) -> String {
        node_at(&self.root, x, y)
    }
}

impl DomRender {
    /// The full path: the page's render tree (what changed), the elements
    /// built again where it did, the layout and the display list.
    fn full(&mut self, eval: &mut dyn FnMut(&str) -> String, image: &dyn Fn(&str) -> Option<(f64, f64)>, w: f64, h: f64) {
        self.full_frames += 1;
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
            self.list(&root);
            self.nodes.clear();
            map_nodes(&root, &mut self.nodes);
            self.root = Some(root);
        }
        let t3 = now();
        self.timing = [te - t0, t1 - te, t2 - t1, t3 - t2];
        #[cfg(not(target_arch = "wasm32"))]
        if std::env::var("RG_DOM_TIMING").is_ok() {
            eprintln!("dom: page {:.2} ms, take {:.2} ms, layout {:.2} ms, display list {:.2} ms ({})", self.timing[0], self.timing[1], self.timing[2], self.timing[3], r);
        }
    }
}

/// whether js/dom.js's patches are drawn without the DOM (RG_DOMFULL
/// turns it off natively)
fn fast_on() -> bool {
    #[cfg(not(target_arch = "wasm32"))]
    if std::env::var("RG_DOMFULL").is_ok() {
        return false;
    }
    true
}

fn node_at(root: &Option<Rc<RefCell<EVGElement>>>, x: f64, y: f64) -> String {
    {
        let root = match root {
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

