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
use std::cell::RefCell;
use std::rc::Rc;

/// The engine's own rules, before the game's.
pub const BASE_CSS: &str = "
.text { }
";

const TEXT_TAGS: [&str; 12] = ["span", "text", "p", "b", "i", "label", "h1", "h2", "h3", "h4", "small", "strong"];

pub struct Ui {
    sheet: Rc<RefCell<EVGStyleSheet>>,
    root: Option<Rc<RefCell<EVGElement>>>,
    pub css_errors: Vec<String>,
    pub width: f64,
    pub height: f64,
    pub last_commands: i64,
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
        EVGElement::set_attribute(&t, "className", "text".to_string());
        t.borrow_mut().text_content = s.clone();
        return t;
    }
    if let Json::Num(_) = node {
        let t = element("span");
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

impl Ui {
    pub fn new() -> Ui {
        let sheet = Rc::new(RefCell::new(EVGStyleSheet::new()));
        EVGStyleSheet::parse(&sheet, BASE_CSS);
        Ui { sheet, root: None, css_errors: Vec::new(), width: 360.0, height: 640.0, last_commands: 0 }
    }

    /// The game's stylesheet (parsed once, not every frame).
    pub fn set_stylesheet(&mut self, css: &str) {
        let sheet = Rc::new(RefCell::new(EVGStyleSheet::new()));
        let text = format!("{}\n{}", BASE_CSS, css);
        EVGStyleSheet::parse(&sheet, &text);
        self.css_errors = sheet.borrow().errors.clone();
        self.sheet = sheet;
    }

    /// One frame: cascade, layout, display list, into `out`.
    pub fn render(&mut self, tree: &Json, out: &mut DrawStream) {
        let root = build(tree);
        let (w, h) = (self.width, self.height);
        EVGStyleSheet::set_viewport(&self.sheet, w, h, true);
        EVGStyleSheet::apply_tree(&self.sheet, &root, "");
        let lay = Rc::new(RefCell::new(EVGLayout::new()));
        EVGLayout::set_page_size(&lay, w, h);
        EVGLayout::layout(&lay, root.clone());
        let dl = Rc::new(RefCell::new(EVGDisplayList::new()));
        EVGDisplayList::set_text_engine(&dl, EVGLayout::get_text_engine(&lay));
        EVGDisplayList::build(&dl, root.clone());
        self.last_commands = EVGDisplayList::count(&dl);
        let cmds = dl.borrow().cmds.clone();
        for c in cmds.iter() {
            out.command(&c.borrow());
        }
        self.root = Some(root);
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
