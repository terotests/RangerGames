// SPDX-License-Identifier: AGPL-3.0-or-later
//! Input: the pointers (each touch, and the mouse as pointer 0), the keys
//! held, and the events since the last frame. Positions are in the game's
//! own coordinates; the host maps the screen to them.

use crate::json::{member, quote, Json, JsonMember};
use ranger::prelude::*;

#[derive(Clone)]
pub struct Pointer {
    pub id: int,
    pub x: double,
    pub y: double,
    pub down: bool,
}

/// One input event: `kind` is `pointerdown`, `pointermove`, `pointerup`,
/// `keydown`, `keyup`, `click`, `back` or `resize`.
#[derive(Clone)]
pub struct InputEvent {
    pub kind: string,
    pub key: string,
    pub pointer: int,
    pub x: double,
    pub y: double,
    /// the id of the element under the pointer, filled by the engine
    pub target: string,
}

pub struct Input {
    pub pointers: Vec<Pointer>,
    pub keys: Vec<string>,
    pub events: Vec<InputEvent>,
}

impl Input {
    pub fn new() -> Input {
        Input { pointers: Vec::new(), keys: Vec::new(), events: Vec::new() }
    }

    fn pointer_index(&self, id: int) -> i64 {
        for (i, p) in self.pointers.iter().enumerate() {
            if p.id == id {
                return i as i64;
            }
        }
        -1
    }

    pub fn pointer_down(&mut self, id: int, x: double, y: double) {
        let i = self.pointer_index(id);
        if i < 0 {
            self.pointers.push(Pointer { id: id, x: x, y: y, down: true });
        } else {
            let p = &mut self.pointers[i as usize];
            p.x = x;
            p.y = y;
            p.down = true;
        }
        self.events.push(event("pointerdown", "", id, x, y));
    }

    pub fn pointer_move(&mut self, id: int, x: double, y: double) {
        let i = self.pointer_index(id);
        if i < 0 {
            self.pointers.push(Pointer { id: id, x: x, y: y, down: false });
        } else {
            let p = &mut self.pointers[i as usize];
            p.x = x;
            p.y = y;
        }
    }

    pub fn pointer_up(&mut self, id: int, x: double, y: double) {
        let i = self.pointer_index(id);
        if i >= 0 {
            let p = &mut self.pointers[i as usize];
            p.x = x;
            p.y = y;
            p.down = false;
        }
        self.events.push(event("pointerup", "", id, x, y));
        // a touch that ends is gone; the mouse (id 0) stays where it is
        if id != 0 && i >= 0 {
            self.pointers.remove(i as usize);
        }
    }

    pub fn key_down(&mut self, key: &str) {
        let mut held = false;
        for k in self.keys.iter() {
            if k == key {
                held = true;
            }
        }
        if !held {
            self.keys.push(key.to_string());
        }
        self.events.push(event("keydown", key, 0, 0.0, 0.0));
    }

    pub fn key_up(&mut self, key: &str) {
        let mut i: i64 = -1;
        for (j, k) in self.keys.iter().enumerate() {
            if k == key {
                i = j as i64;
            }
        }
        if i >= 0 {
            self.keys.remove(i as usize);
        }
        self.events.push(event("keyup", key, 0, 0.0, 0.0));
    }

    pub fn push(&mut self, e: InputEvent) {
        self.events.push(e);
    }

    /// The frame's events, emptied for the next frame.
    pub fn take_events(&mut self) -> Vec<InputEvent> {
        let out = self.events.clone();
        self.events = Vec::new();
        out
    }

    /// The state as the script reads it: `{ keys: {k: true}, pointer: {x, y,
    /// down}, pointers: [{id, x, y, down}] }`.
    pub fn state_json(&self) -> string {
        let mut out = String::from("{\"keys\":{");
        for (i, k) in self.keys.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&quote(k));
            out.push_str(":true");
        }
        out.push_str("},\"pointer\":");
        let mut first = Pointer { id: 0, x: 0.0, y: 0.0, down: false };
        if self.pointers.len() > 0 {
            first = self.pointers[0].clone();
        }
        out.push_str(&pointer_json(&first).write());
        out.push_str(",\"pointers\":[");
        for (i, p) in self.pointers.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&pointer_json(p).write());
        }
        out.push_str("]}");
        out
    }
}

pub fn event(kind: &str, key: &str, pointer: int, x: double, y: double) -> InputEvent {
    InputEvent {
        kind: kind.to_string(),
        key: key.to_string(),
        pointer: pointer,
        x: x,
        y: y,
        target: String::new(),
    }
}

fn pointer_json(p: &Pointer) -> Json {
    let mut m: Vec<JsonMember> = Vec::new();
    m.push(member("id", Json::Num(p.id as f64)));
    m.push(member("x", Json::Num(p.x)));
    m.push(member("y", Json::Num(p.y)));
    m.push(member("down", Json::Bool(p.down)));
    Json::Obj(m)
}

pub fn event_json(e: &InputEvent) -> Json {
    let mut m: Vec<JsonMember> = Vec::new();
    m.push(member("type", Json::Str(e.kind.clone())));
    if !e.key.is_empty() {
        m.push(member("key", Json::Str(e.key.clone())));
    }
    m.push(member("pointer", Json::Num(e.pointer as f64)));
    m.push(member("x", Json::Num(e.x)));
    m.push(member("y", Json::Num(e.y)));
    if !e.target.is_empty() {
        m.push(member("id", Json::Str(e.target.clone())));
    }
    Json::Obj(m)
}
