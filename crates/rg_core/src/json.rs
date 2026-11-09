// SPDX-License-Identifier: AGPL-3.0-or-later
//! A small JSON reader and writer. The engine reads the element tree the
//! game script returns with it, the host's input and the games' `game.json`.

use ranger::prelude::*;

#[derive(Clone, Debug)]
pub enum Json {
    Null,
    Bool(bool),
    Num(double),
    Str(string),
    Arr(Vec<Json>),
    Obj(Vec<JsonMember>),
}

#[derive(Clone, Debug)]
pub struct JsonMember {
    pub key: string,
    pub value: Json,
}

impl Json {
    /// The member `key` of an object, or `Json::Null`.
    pub fn get(&self, key: &str) -> Json {
        match self {
            Json::Obj(members) => {
                for m in members.iter() {
                    if m.key == key {
                        return m.value.clone();
                    }
                }
                Json::Null
            }
            _ => Json::Null,
        }
    }

    pub fn has(&self, key: &str) -> bool {
        match self {
            Json::Obj(members) => {
                for m in members.iter() {
                    if m.key == key {
                        return true;
                    }
                }
                false
            }
            _ => false,
        }
    }

    pub fn is_null(&self) -> bool {
        match self {
            Json::Null => true,
            _ => false,
        }
    }

    pub fn as_str(&self) -> string {
        match self {
            Json::Str(s) => s.clone(),
            Json::Num(n) => format!("{}", n),
            Json::Bool(b) => {
                if *b {
                    "true".to_string()
                } else {
                    "false".to_string()
                }
            }
            _ => "".to_string(),
        }
    }

    pub fn as_num(&self, fallback: double) -> double {
        match self {
            Json::Num(n) => *n,
            _ => fallback,
        }
    }

    pub fn as_bool(&self) -> bool {
        match self {
            Json::Bool(b) => *b,
            Json::Num(n) => *n != 0.0,
            _ => false,
        }
    }

    /// The items of an array (none for anything else).
    pub fn items(&self) -> Vec<Json> {
        match self {
            Json::Arr(items) => items.clone(),
            _ => Vec::new(),
        }
    }

    /// The members of an object (none for anything else).
    pub fn members(&self) -> Vec<JsonMember> {
        match self {
            Json::Obj(members) => members.clone(),
            _ => Vec::new(),
        }
    }

    pub fn write(&self) -> string {
        let mut out = String::new();
        write_into(self, &mut out);
        out
    }
}

/// `s` as a JSON string literal.
pub fn quote(s: &str) -> string {
    let mut out = String::from("\"");
    for c in s.chars() {
        let code = c as i64;
        if c == '"' {
            out.push_str("\\\"");
        } else if c == '\\' {
            out.push_str("\\\\");
        } else if c == '\n' {
            out.push_str("\\n");
        } else if c == '\r' {
            out.push_str("\\r");
        } else if c == '\t' {
            out.push_str("\\t");
        } else if code < 32 {
            out.push_str(&format!("\\u{:04x}", code));
        } else {
            out.push(c);
        }
    }
    out.push('"');
    out
}

/// A number the way JavaScript prints it for the values a game uses:
/// integers without a fraction.
pub fn num(n: double) -> string {
    if n == n.floor() && n.abs() < 1.0e15 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

fn write_into(v: &Json, out: &mut String) {
    match v {
        Json::Null => out.push_str("null"),
        Json::Bool(b) => {
            if *b {
                out.push_str("true");
            } else {
                out.push_str("false");
            }
        }
        Json::Num(n) => out.push_str(&num(*n)),
        Json::Str(s) => out.push_str(&quote(s)),
        Json::Arr(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_into(item, out);
            }
            out.push(']');
        }
        Json::Obj(members) => {
            out.push('{');
            for (i, m) in members.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&quote(&m.key));
                out.push(':');
                write_into(&m.value, out);
            }
            out.push('}');
        }
    }
}

/// Parses `text`. A syntax error answers `Json::Null` and sets `error`.
pub struct JsonReader {
    bytes: Vec<u8>,
    pos: i64,
    pub error: string,
}

impl JsonReader {
    pub fn new(text: &str) -> JsonReader {
        JsonReader { bytes: text.as_bytes().to_vec(), pos: 0, error: String::new() }
    }

    fn size(&self) -> i64 {
        self.bytes.len() as i64
    }

    fn peek(&self) -> i64 {
        if self.pos < self.size() {
            self.bytes[self.pos as usize] as i64
        } else {
            -1
        }
    }

    fn skip_ws(&mut self) {
        while self.pos < self.size() {
            let c = self.peek();
            if c == 32 || c == 9 || c == 10 || c == 13 {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn fail(&mut self, msg: &str) -> Json {
        if self.error.is_empty() {
            self.error = format!("{} at {}", msg, self.pos);
        }
        Json::Null
    }

    pub fn parse(&mut self) -> Json {
        let v = self.value();
        self.skip_ws();
        if self.error.is_empty() && self.pos < self.size() {
            return self.fail("trailing text");
        }
        v
    }

    fn value(&mut self) -> Json {
        self.skip_ws();
        let c = self.peek();
        if c == 123 {
            return self.object();
        }
        if c == 91 {
            return self.array();
        }
        if c == 34 {
            let s = self.string_lit();
            return Json::Str(s);
        }
        if c == 116 {
            return self.word("true", Json::Bool(true));
        }
        if c == 102 {
            return self.word("false", Json::Bool(false));
        }
        if c == 110 {
            return self.word("null", Json::Null);
        }
        if c == 45 || (c >= 48 && c <= 57) {
            return self.number();
        }
        self.fail("unexpected character")
    }

    fn word(&mut self, w: &str, v: Json) -> Json {
        let wb = w.as_bytes();
        let n = wb.len() as i64;
        if self.pos + n > self.size() {
            return self.fail("unexpected end");
        }
        let mut i: i64 = 0;
        while i < n {
            if self.bytes[(self.pos + i) as usize] != wb[i as usize] {
                return self.fail("unknown word");
            }
            i += 1;
        }
        self.pos += n;
        v
    }

    fn number(&mut self) -> Json {
        let start = self.pos;
        while self.pos < self.size() {
            let c = self.peek();
            if (c >= 48 && c <= 57) || c == 45 || c == 43 || c == 46 || c == 101 || c == 69 {
                self.pos += 1;
            } else {
                break;
            }
        }
        let text = String::from_utf8_lossy(&self.bytes[(start as usize)..(self.pos as usize)]).to_string();
        match text.parse::<f64>() {
            Ok(n) => Json::Num(n),
            Err(_) => self.fail("bad number"),
        }
    }

    fn hex4(&mut self) -> i64 {
        let mut v: i64 = 0;
        let mut i = 0;
        while i < 4 {
            let c = self.peek();
            self.pos += 1;
            let d: i64 = if c >= 48 && c <= 57 {
                c - 48
            } else if c >= 97 && c <= 102 {
                c - 87
            } else if c >= 65 && c <= 70 {
                c - 55
            } else {
                0
            };
            v = v * 16 + d;
            i += 1;
        }
        v
    }

    fn string_lit(&mut self) -> string {
        // the opening quote
        self.pos += 1;
        let mut out: Vec<u8> = Vec::new();
        let mut done = false;
        while self.pos < self.size() {
            let c = self.peek();
            if c == 34 {
                self.pos += 1;
                done = true;
                break;
            }
            if c == 92 {
                self.pos += 1;
                let e = self.peek();
                self.pos += 1;
                if e == 110 {
                    out.push(10);
                } else if e == 116 {
                    out.push(9);
                } else if e == 114 {
                    out.push(13);
                } else if e == 98 {
                    out.push(8);
                } else if e == 102 {
                    out.push(12);
                } else if e == 117 {
                    let mut cp = self.hex4();
                    // a surrogate pair
                    if cp >= 0xD800 && cp < 0xDC00 && self.peek() == 92 {
                        self.pos += 2;
                        let lo = self.hex4();
                        cp = 0x10000 + ((cp - 0xD800) * 1024) + (lo - 0xDC00);
                    }
                    let enc = utf8_bytes(cp);
                    out.extend_from_slice(&enc);
                } else {
                    out.push(e as u8);
                }
                continue;
            }
            out.push(c as u8);
            self.pos += 1;
        }
        if !done {
            self.fail("unterminated string");
        }
        String::from_utf8_lossy(&out).to_string()
    }

    fn array(&mut self) -> Json {
        self.pos += 1;
        let mut items: Vec<Json> = Vec::new();
        self.skip_ws();
        if self.peek() == 93 {
            self.pos += 1;
            return Json::Arr(items);
        }
        loop {
            let v = self.value();
            if !self.error.is_empty() {
                return Json::Null;
            }
            items.push(v);
            self.skip_ws();
            let c = self.peek();
            self.pos += 1;
            if c == 44 {
                continue;
            }
            if c == 93 {
                break;
            }
            return self.fail("expected , or ]");
        }
        Json::Arr(items)
    }

    fn object(&mut self) -> Json {
        self.pos += 1;
        let mut members: Vec<JsonMember> = Vec::new();
        self.skip_ws();
        if self.peek() == 125 {
            self.pos += 1;
            return Json::Obj(members);
        }
        loop {
            self.skip_ws();
            if self.peek() != 34 {
                return self.fail("expected a key");
            }
            let key = self.string_lit();
            self.skip_ws();
            if self.peek() != 58 {
                return self.fail("expected :");
            }
            self.pos += 1;
            let v = self.value();
            if !self.error.is_empty() {
                return Json::Null;
            }
            members.push(JsonMember { key: key, value: v });
            self.skip_ws();
            let c = self.peek();
            self.pos += 1;
            if c == 44 {
                continue;
            }
            if c == 125 {
                break;
            }
            return self.fail("expected , or }");
        }
        Json::Obj(members)
    }
}

/// The UTF-8 bytes of the code point `cp`.
fn utf8_bytes(cp: i64) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    if cp < 0x80 {
        out.push(cp as u8);
    } else if cp < 0x800 {
        out.push((0xC0 | (cp >> 6)) as u8);
        out.push((0x80 | (cp & 0x3F)) as u8);
    } else if cp < 0x10000 {
        out.push((0xE0 | (cp >> 12)) as u8);
        out.push((0x80 | ((cp >> 6) & 0x3F)) as u8);
        out.push((0x80 | (cp & 0x3F)) as u8);
    } else {
        out.push((0xF0 | (cp >> 18)) as u8);
        out.push((0x80 | ((cp >> 12) & 0x3F)) as u8);
        out.push((0x80 | ((cp >> 6) & 0x3F)) as u8);
        out.push((0x80 | (cp & 0x3F)) as u8);
    }
    out
}

/// Parses `text`, answering `Json::Null` for anything that is not JSON.
pub fn parse(text: &str) -> Json {
    let mut r = JsonReader::new(text);
    r.parse()
}

/// An object from key / value pairs, for building replies.
pub fn obj(members: Vec<JsonMember>) -> Json {
    Json::Obj(members)
}

pub fn member(key: &str, value: Json) -> JsonMember {
    JsonMember { key: key.to_string(), value: value }
}
