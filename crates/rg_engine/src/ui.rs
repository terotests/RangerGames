// SPDX-License-Identifier: AGPL-3.0-or-later
//! The game's element tree laid out by EVG and flattened to the draw stream.
//!
//! The script's `view()` returns a JSX tree; the runtime serializes it
//! (`{ t, id?, cls?, a?, s?, c? }`), and here it becomes `EVGElement`s:
//! the stylesheet (the engine's base sheet and the game's `style.css`) is
//! cascaded over it, EVG lays it out at the game's size, and its display
//! list is written as the draw stream the platform paints (`draw.rs`).

use crate::draw::DrawStream;
use rg_core::json::Json;
use rg_evg::*;
// ranger's cell: EVG's own (std's RefCell unless a build turns on shared-cell)
use ranger::cell::RefCell;
use std::rc::Rc;

/// The engine's own rules, before the game's.
pub const BASE_CSS: &str = "
.text { }
";

const TEXT_TAGS: [&str; 12] = ["span", "text", "p", "b", "i", "label", "h1", "h2", "h3", "h4", "small", "strong"];

/// The tag of a text run made from a string child (`<div>Hi {name}</div>`).
const TEXT_RUN: &str = "#text";

/// Gives each line of wrapped text the width of its own ink. EVG places a
/// broken line at its start (already moved for `text-align`) but sizes it
/// to the whole box, and the painters keep a run's centre (they may measure
/// a font a little differently than EVG did), so a left-aligned paragraph
/// came out centred line by line.
fn fit_text_runs(cmds: &[Rc<RefCell<EVGDrawCmd>>], te: &Rc<RefCell<EVGTextEngine>>) {
    for c in cmds.iter() {
        let mut c = c.borrow_mut();
        if c.kind != 3 || c.text.is_empty() {
            continue;
        }
        let m = EVGTextEngine::measure_run_spaced(te, &c.text, &c.font_family, c.font_size, c.letter_spacing);
        let w = m.borrow().width;
        if w > 0.0 && w < c.w {
            c.w = w;
        }
    }
}

/// Gives each text run the font size its box will inherit. EVG settles
/// inherited font sizes while it lays out, after it has measured a width-less
/// box by its content, so a box sized `30px` that fits its text measured that
/// text at the default 14px and was too narrow for it. A run gets the size
/// it would have inherited (when the cascade gave it none) before layout.
fn settle_font_sizes(el: &Rc<RefCell<EVGElement>>, inherited: Option<Rc<RefCell<EVGUnit>>>) {
    let own = el.borrow().font_size.clone();
    let own_set = own.as_ref().map(|u| u.borrow().is_set).unwrap_or(false);
    let here = if own_set { own } else { inherited.clone() };
    if !own_set && el.borrow().tag_name == TEXT_RUN {
        if let Some(u) = &inherited {
            el.borrow_mut().font_size = Some(u.clone());
        }
    }
    let kids = el.borrow().children.clone();
    for c in kids.iter() {
        settle_font_sizes(c, here.clone());
    }
}

/// `text-align` inherits, as in CSS: EVG reads it only on the element that
/// holds the text, and a box's words are a run of their own, so a centred
/// box drew its paragraph from the left (the painters' centring of each
/// line hid it until fit_text_runs).
fn settle_text_align(el: &Rc<RefCell<EVGElement>>, inherited: &str) {
    let own = el.borrow().text_align.clone();
    let here = match own.as_str() {
        "" => inherited.to_string(),
        "start" | "justify" => "left".to_string(),
        "end" => "right".to_string(),
        _ => own,
    };
    el.borrow_mut().text_align = here.clone();
    let kids = el.borrow().children.clone();
    for c in kids.iter() {
        settle_text_align(c, &here);
    }
}

pub struct Ui {
    sheet: Rc<RefCell<EVGStyleSheet>>,
    root: Option<Rc<RefCell<EVGElement>>>,
    pub css_errors: Vec<String>,
    pub width: f64,
    pub height: f64,
    pub last_commands: i64,
    // the last frame's tree (as text, with the size) and its draw commands:
    // a frame whose tree is the same is not laid out again
    last_key: String,
    last_cmds: Vec<Rc<RefCell<EVGDrawCmd>>>,
    // the last frame's tree and its layout: a frame whose tree differs from
    // it only in inline paint properties (EVGRetain's tier 1: a sprite's
    // transform, a tile's background) is patched onto the laid-out elements
    // and drawn without a new tree, cascade or layout
    last_tree: Option<Json>,
    last_lay: Option<Rc<RefCell<EVGLayout>>>,
    /// frames drawn by the paint-only path (for tests and benches)
    pub paint_frames: i64,
    /// false: every changed frame takes the full path (a check's reference)
    pub retain: bool,
    /// a check's: each paint-only frame is drawn the full way too, and
    /// `check_bad` counts the frames whose draw streams differ
    pub check: bool,
    pub check_bad: i64,
}

fn is_text_tag(t: &str) -> bool {
    for x in TEXT_TAGS.iter() {
        if *x == t {
            return true;
        }
    }
    false
}

fn element(tag: &str) -> Rc<RefCell<EVGElement>> {
    let el = if is_text_tag(tag) {
        EVGElement::create_span()
    } else if tag == "img" || tag == "image" {
        EVGElement::create_img()
    } else if tag == "path" {
        EVGElement::create_path()
    } else {
        EVGElement::create_div()
    };
    el.borrow_mut().tag_name = tag.to_string();
    // "" until the cascade sets it, so settle_text_align can tell an
    // inherited alignment from EVG's default "left"
    el.borrow_mut().text_align = String::new();
    // boxes are flex containers, as in the CSS a game author knows: a box
    // without a width fits its content in a row or under align-items
    if !is_text_tag(tag) {
        el.borrow_mut().display = "flex".to_string();
    }
    el
}

fn set_inline(el: &Rc<RefCell<EVGElement>>, name: &str, value: String) {
    EVGElement::set_attribute(el, name, value);
    EVGElement::mark_inline(el, name);
}

/// A serialized tree node as an EVGElement.
pub fn build(node: &Json) -> Rc<RefCell<EVGElement>> {
    if let Json::Str(s) = node {
        let t = element("span");
        t.borrow_mut().tag_name = TEXT_RUN.to_string();
        EVGElement::set_attribute(&t, "className", "text".to_string());
        t.borrow_mut().text_content = s.clone();
        return t;
    }
    if let Json::Num(_) = node {
        let t = element("span");
        t.borrow_mut().tag_name = TEXT_RUN.to_string();
        EVGElement::set_attribute(&t, "className", "text".to_string());
        t.borrow_mut().text_content = node.as_str();
        return t;
    }
    let tag = node.get("t").as_str();
    let el = element(if tag.is_empty() { "div" } else { tag.as_str() });
    let cls = node.get("cls");
    if !cls.is_null() {
        EVGElement::set_attribute(&el, "className", cls.as_str());
    }
    let id = node.get("id");
    if !id.is_null() {
        EVGElement::set_attribute(&el, "id", id.as_str());
    }
    for m in node.get("a").members() {
        EVGElement::set_attribute(&el, &m.key, m.value.as_str());
    }
    for m in node.get("s").members() {
        set_inline(&el, &m.key, m.value.as_str());
    }
    let kids = node.get("c").items();
    if is_text_tag(&tag) {
        let mut text = String::new();
        for c in kids.iter() {
            match c {
                Json::Str(s) => text.push_str(s),
                Json::Num(_) => text.push_str(&c.as_str()),
                _ => {}
            }
        }
        el.borrow_mut().text_content = text;
        for c in kids.iter() {
            if let Json::Obj(_) = c {
                EVGElement::add_child(&el, build(c));
            }
        }
    } else {
        // consecutive text children ("Score: ", {n}) are one text run
        let mut run = String::new();
        let mut in_run = false;
        for c in kids.iter() {
            match c {
                Json::Str(_) | Json::Num(_) => {
                    run.push_str(&c.as_str());
                    in_run = true;
                }
                _ => {
                    if in_run {
                        EVGElement::add_child(&el, build(&Json::Str(std::mem::take(&mut run))));
                        in_run = false;
                    }
                    EVGElement::add_child(&el, build(c));
                }
            }
        }
        if in_run {
            EVGElement::add_child(&el, build(&Json::Str(run)));
        }
    }
    el
}


/// The inline style of a tree node as EVGRetain compares it: names and values.
fn inline_of(node: &Json) -> (Vec<String>, Vec<String>) {
    let mut names = Vec::new();
    let mut vals = Vec::new();
    if let Json::Obj(ms) = node {
        for m in ms.iter() {
            if m.key == "s" {
                if let Json::Obj(ss) = &m.value {
                    for x in ss.iter() {
                        names.push(x.key.clone());
                        vals.push(x.value.as_str());
                    }
                }
            }
        }
    }
    (names, vals)
}

/// Whether `new` is `old` with only inline paint properties changed or
/// added (EVGRetain's tier 1 or 0), the patches for the laid-out element
/// `el` (built from `old`) and those under it gathered in `patches`.
/// Anything else (another tag, class, id, attribute, text or child; a
/// property that can move a box; an inline property taken away, under which
/// the sheet's value would show again) is false: the full path.
fn paint_diff(old: &Json, new: &Json, el: &Rc<RefCell<EVGElement>>, patches: &mut Vec<(Rc<RefCell<EVGElement>>, String, String)>) -> bool {
    match (old, new) {
        (Json::Obj(om), Json::Obj(nm)) => {
            // every member but the inline style and the children the same
            let mut ok_keys = 0;
            for m in nm.iter() {
                if m.key == "s" || m.key == "c" {
                    continue;
                }
                let mut found = false;
                for o in om.iter() {
                    if o.key == m.key {
                        if !json_eq(&o.value, &m.value) {
                            return false;
                        }
                        found = true;
                    }
                }
                if !found {
                    return false;
                }
                ok_keys += 1;
            }
            if om.iter().filter(|o| o.key != "s" && o.key != "c").count() != ok_keys {
                return false;
            }
            let (on, ov) = inline_of(old);
            let (nn, nv) = inline_of(new);
            for n in on.iter() {
                if !nn.contains(n) {
                    return false;
                }
            }
            let tier = EVGRetain::tier_of(&on, &ov, &nn, &nv);
            if tier == 2 {
                return false;
            }
            if tier == 1 {
                for i in 0..nn.len() {
                    let same = on.iter().position(|x| *x == nn[i]).map(|j| ov[j] == nv[i]).unwrap_or(false);
                    if !same {
                        patches.push((el.clone(), nn[i].clone(), nv[i].clone()));
                    }
                }
            }
            let none = Json::Null;
            let ok = om.iter().find(|m| m.key == "c").map(|m| &m.value).unwrap_or(&none);
            let nk = nm.iter().find(|m| m.key == "c").map(|m| &m.value).unwrap_or(&none);
            let (ok, nk) = match (ok, nk) {
                (Json::Arr(a), Json::Arr(b)) => (a, b),
                (Json::Null, Json::Null) => return true,
                _ => return false,
            };
            if ok.len() != nk.len() {
                return false;
            }
            // the children as build() made them: string runs are one text
            // element (or the text of a text tag), each object one element
            let text_tag = match om.iter().find(|m| m.key == "t") { Some(m) => match &m.value { Json::Str(t) => is_text_tag(t), _ => false }, None => false };
            let kids = el.borrow().children.clone();
            let mut at = 0usize;
            let mut in_run = false;
            for i in 0..ok.len() {
                let (a, b) = (&ok[i], &nk[i]);
                match (a, b) {
                    (Json::Obj(_), Json::Obj(_)) => {
                        if in_run {
                            at += 1;
                            in_run = false;
                        }
                        if at >= kids.len() || !paint_diff(a, b, &kids[at], patches) {
                            return false;
                        }
                        at += 1;
                    }
                    (Json::Obj(_), _) | (_, Json::Obj(_)) => return false,
                    _ => {
                        if a.as_str() != b.as_str() {
                            return false;
                        }
                        if !text_tag {
                            in_run = true;
                        }
                    }
                }
            }
            true
        }
        _ => json_eq(old, new),
    }
}

/// The same JSON value, without writing either out.
fn json_eq(a: &Json, b: &Json) -> bool {
    match (a, b) {
        (Json::Null, Json::Null) => true,
        (Json::Bool(x), Json::Bool(y)) => x == y,
        (Json::Num(x), Json::Num(y)) => x == y,
        (Json::Str(x), Json::Str(y)) => x == y,
        (Json::Arr(x), Json::Arr(y)) => x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| json_eq(p, q)),
        (Json::Obj(x), Json::Obj(y)) => x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| p.key == q.key && json_eq(&p.value, &q.value)),
        _ => false,
    }
}

impl Ui {
    pub fn new() -> Ui {
        let sheet = Rc::new(RefCell::new(EVGStyleSheet::new()));
        EVGStyleSheet::parse(&sheet, BASE_CSS);
        Ui { sheet, root: None, css_errors: Vec::new(), width: 360.0, height: 640.0, last_commands: 0, last_key: String::new(), last_cmds: Vec::new(), last_tree: None, last_lay: None, paint_frames: 0, retain: true, check: false, check_bad: 0 }
    }

    /// The game's stylesheet (parsed once, not every frame).
    pub fn set_stylesheet(&mut self, css: &str) {
        let sheet = Rc::new(RefCell::new(EVGStyleSheet::new()));
        let text = format!("{}\n{}", BASE_CSS, css);
        EVGStyleSheet::parse(&sheet, &text);
        self.css_errors = sheet.borrow().errors.clone();
        self.sheet = sheet;
        self.last_key.clear();
        self.last_tree = None;
    }

    /// One frame: cascade, layout, display list, into `out`.
    pub fn render(&mut self, tree: &Json, out: &mut DrawStream) {
        let (w, h) = (self.width, self.height);
        // most frames of a game that waits for a tap draw the same tree:
        // the same layout, so the commands are written again as they were
        let key = format!("{}x{}|{}", w, h, tree.write());
        if self.root.is_some() && key == self.last_key {
            for c in self.last_cmds.iter() {
                out.command(&c.borrow());
            }
            return;
        }
        // tier 1: only inline paint properties changed since the last frame
        if self.retain && self.last_key.starts_with(&format!("{}x{}|", w, h)) {
            if let (Some(old), Some(root), Some(lay)) = (self.last_tree.as_ref(), self.root.clone(), self.last_lay.clone()) {
                let mut patches: Vec<(Rc<RefCell<EVGElement>>, String, String)> = Vec::new();
                if paint_diff(old, tree, &root, &mut patches) {
                    for (el, name, value) in patches.iter() {
                        EVGRetain::patch(el, name, value);
                    }
                    EVGRetain::paint_frame(&lay, &root);
                    if self.check {
                        let mut a = DrawStream::new();
                        self.draw(&root, &lay, &mut a);
                        let fresh = build(tree);
                        EVGStyleSheet::set_viewport(&self.sheet, w, h, true);
                        EVGStyleSheet::apply_tree(&self.sheet, &fresh, "");
                        settle_font_sizes(&fresh, None);
                        settle_text_align(&fresh, "left");
                        let fl = Rc::new(RefCell::new(EVGLayout::new()));
                        EVGLayout::set_page_size(&fl, w, h);
                        EVGLayout::layout(&fl, fresh.clone());
                        let mut b = DrawStream::new();
                        self.draw(&fresh, &fl, &mut b);
                        if a.nums != b.nums || a.strings != b.strings {
                            self.check_bad += 1;
                        }
                    }
                    self.draw(&root, &lay, out);
                    self.paint_frames += 1;
                    self.last_tree = Some(tree.clone());
                    self.last_key = key;
                    return;
                }
            }
        }
        let root = build(tree);
        EVGStyleSheet::set_viewport(&self.sheet, w, h, true);
        EVGStyleSheet::apply_tree(&self.sheet, &root, "");
        settle_font_sizes(&root, None);
        settle_text_align(&root, "left");
        let lay = Rc::new(RefCell::new(EVGLayout::new()));
        EVGLayout::set_page_size(&lay, w, h);
        EVGLayout::layout(&lay, root.clone());
        self.draw(&root, &lay, out);
        self.root = Some(root);
        self.last_key = key;
        self.last_tree = Some(tree.clone());
        self.last_lay = Some(lay);
    }

    /// The display list of a laid-out tree, into `out`.
    fn draw(&mut self, root: &Rc<RefCell<EVGElement>>, lay: &Rc<RefCell<EVGLayout>>, out: &mut DrawStream) {
        let dl = Rc::new(RefCell::new(EVGDisplayList::new()));
        let te = EVGLayout::get_text_engine(lay);
        EVGDisplayList::set_text_engine(&dl, te.clone());
        EVGDisplayList::build(&dl, root.clone());
        self.last_commands = EVGDisplayList::count(&dl);
        let cmds = dl.borrow().cmds.clone();
        fit_text_runs(&cmds, &te);
        for c in cmds.iter() {
            out.command(&c.borrow());
        }
        self.last_cmds = cmds;
    }

    /// The laid-out boxes of the last frame's elements whose id is in `ids`:
    /// `{ id: {x, y, w, h} }` in game pixels (rg.box).
    pub fn boxes(&self, ids: &[String]) -> Json {
        let mut out = Vec::new();
        if let Some(root) = &self.root {
            if !ids.is_empty() {
                collect_boxes(root, ids, &mut out);
            }
        }
        Json::Obj(out)
    }

    /// The last frame's laid-out tree, for tools that look at a game from
    /// outside (Games' inspect_game): `{ t, id?, cls?, x, y, w, h, text?, c? }`
    /// in game pixels; boxes with `display: none` are left out.
    pub fn tree(&self) -> Json {
        match &self.root {
            Some(root) => tree_node(root),
            None => Json::Null,
        }
    }

    /// The id of the topmost element with an id under the point, or "".
    pub fn id_at(&self, x: f64, y: f64) -> String {
        match &self.root {
            Some(root) => {
                let ht = Rc::new(RefCell::new(EVGHitTest::new()));
                EVGHitTest::id_at(&ht, root.clone(), x, y)
            }
            None => String::new(),
        }
    }
}

fn tree_node(el: &Rc<RefCell<EVGElement>>) -> Json {
    use rg_core::json::member;
    let e = el.borrow();
    let r = |v: f64| Json::Num((v * 10.0).round() / 10.0);
    let mut m = vec![member("t", Json::Str(e.tag_name.clone()))];
    if !e.id.is_empty() {
        m.push(member("id", Json::Str(e.id.clone())));
    }
    if !e.class_name.is_empty() && e.tag_name != TEXT_RUN {
        m.push(member("cls", Json::Str(e.class_name.clone())));
    }
    m.push(member("x", r(e.calculated_x)));
    m.push(member("y", r(e.calculated_y)));
    m.push(member("w", r(e.calculated_width)));
    m.push(member("h", r(e.calculated_height)));
    if !e.text_content.is_empty() {
        m.push(member("text", Json::Str(e.text_content.clone())));
    }
    let kids: Vec<Json> = e.children.iter().filter(|c| c.borrow().display != "none").map(tree_node).collect();
    if !kids.is_empty() {
        m.push(member("c", Json::Arr(kids)));
    }
    Json::Obj(m)
}

fn collect_boxes(el: &Rc<RefCell<EVGElement>>, ids: &[String], out: &mut Vec<rg_core::json::JsonMember>) {
    let e = el.borrow();
    if !e.id.is_empty() && ids.iter().any(|i| *i == e.id) {
        out.push(rg_core::json::member(
            &e.id,
            rg_core::json::obj(vec![
                rg_core::json::member("x", Json::Num(e.calculated_x)),
                rg_core::json::member("y", Json::Num(e.calculated_y)),
                rg_core::json::member("w", Json::Num(e.calculated_width)),
                rg_core::json::member("h", Json::Num(e.calculated_height)),
            ]),
        ));
    }
    for c in e.children.iter() {
        collect_boxes(c, ids, out);
    }
}
