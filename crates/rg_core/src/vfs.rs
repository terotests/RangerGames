// SPDX-License-Identifier: AGPL-3.0-or-later
//! The virtual resource directory.
//!
//! Everything a game reads comes from here: its script and stylesheet, its
//! images and sounds, the shared assets, and what it saved last time. The
//! tree is one namespace of absolute paths (`/games/jumper/game.tsx`),
//! filled by mounting packs under a prefix, as Sliqtly mounts a folder into
//! its interpreter's file system. `/save` is the only writable part: the
//! host persists what changed there (localStorage on the web,
//! SharedPreferences on Android, a file on a desktop) and mounts it again on
//! the next start.
//!
//! A pack is one file (`.rgpk`), so a game is one download:
//!
//! ```text
//! RGPK1\n
//! <file count>\n
//! <path>\n<byte count>\n<bytes>      (once per file, paths relative)
//! ```

use ranger::prelude::*;

#[derive(Clone)]
pub struct VfsFile {
    pub path: string,
    pub data: Vec<u8>,
}

pub struct Vfs {
    files: Vec<VfsFile>,
    index: Map<string, int>,
    /// paths under /save written since `take_dirty`
    dirty: Vec<string>,
    pub error: string,
}

/// `path` made absolute with `.` and `..` resolved and no trailing `/`.
pub fn normalize(path: &str) -> string {
    let mut parts: Vec<string> = Vec::new();
    for seg in path.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            parts.pop();
            continue;
        }
        parts.push(seg.to_string());
    }
    let mut out = String::new();
    for p in parts.iter() {
        out.push('/');
        out.push_str(p);
    }
    if out.is_empty() {
        out.push('/');
    }
    out
}

/// `rel` read against the directory `dir` (an absolute `rel` stays as it is).
pub fn join(dir: &str, rel: &str) -> string {
    if rel.starts_with("/") {
        return normalize(rel);
    }
    normalize(&format!("{}/{}", dir, rel))
}

/// The directory part of a path: `/a/b.txt` → `/a`.
pub fn dirname(path: &str) -> string {
    let p = normalize(path);
    let i = last_index(&p, 47);
    if i <= 0 {
        return "/".to_string();
    }
    p[0..(i as usize)].to_string()
}

/// The extension without the dot, lower case: `a/B.PNG` → `png`.
pub fn extension(path: &str) -> string {
    let name_start = last_index(path, 47) + 1;
    let name = path[(name_start as usize)..].to_string();
    let dot = last_index(&name, 46);
    if dot < 0 {
        return String::new();
    }
    name[((dot + 1) as usize)..].to_lowercase()
}

/// The MIME type a host hands a decoder for a file.
pub fn mime_type(path: &str) -> string {
    let ext = extension(path);
    let m = if ext == "png" {
        "image/png"
    } else if ext == "jpg" || ext == "jpeg" {
        "image/jpeg"
    } else if ext == "gif" {
        "image/gif"
    } else if ext == "webp" {
        "image/webp"
    } else if ext == "svg" {
        "image/svg+xml"
    } else if ext == "wav" {
        "audio/wav"
    } else if ext == "mp3" {
        "audio/mpeg"
    } else if ext == "ogg" {
        "audio/ogg"
    } else if ext == "json" {
        "application/json"
    } else if ext == "css" {
        "text/css"
    } else if ext == "glb" {
        "model/gltf-binary"
    } else {
        "application/octet-stream"
    };
    m.to_string()
}

impl Vfs {
    pub fn new() -> Vfs {
        Vfs { files: Vec::new(), index: Map::new(), dirty: Vec::new(), error: String::new() }
    }

    fn put(&mut self, path: &str, data: Vec<u8>) {
        let p = normalize(path);
        let at: i64 = match self.index.get(&p) {
            Some(i) => *i,
            None => -1,
        };
        if at >= 0 {
            self.files[at as usize].data = data;
        } else {
            self.index.insert(p.clone(), self.files.len() as i64);
            self.files.push(VfsFile { path: p, data: data });
        }
    }

    /// Adds a file (or replaces it), read-only for the game.
    pub fn add(&mut self, path: &str, data: Vec<u8>) {
        self.put(path, data);
    }

    pub fn add_text(&mut self, path: &str, text: &str) {
        self.put(path, text.as_bytes().to_vec());
    }

    pub fn exists(&self, path: &str) -> bool {
        self.index.contains_key(&normalize(path))
    }

    /// The file's bytes, empty when there is none.
    pub fn read(&self, path: &str) -> Vec<u8> {
        match self.index.get(&normalize(path)) {
            Some(i) => self.files[*i as usize].data.clone(),
            None => Vec::new(),
        }
    }

    pub fn read_text(&self, path: &str) -> string {
        let b = self.read(path);
        String::from_utf8_lossy(&b).to_string()
    }

    /// The size in bytes, -1 when there is no such file.
    pub fn size(&self, path: &str) -> int {
        match self.index.get(&normalize(path)) {
            Some(i) => self.files[*i as usize].data.len() as i64,
            None => -1,
        }
    }

    /// Writes a file under /save; anywhere else is refused (false).
    pub fn write(&mut self, path: &str, data: Vec<u8>) -> bool {
        let p = normalize(path);
        if !(p.starts_with("/save/")) {
            self.error = format!("{} is read-only: a game writes under /save", p);
            return false;
        }
        self.put(&p, data);
        let mut known = false;
        for d in self.dirty.iter() {
            if *d == p {
                known = true;
            }
        }
        if !known {
            self.dirty.push(p);
        }
        true
    }

    pub fn write_text(&mut self, path: &str, text: &str) -> bool {
        self.write(path, text.as_bytes().to_vec())
    }

    /// The /save paths written since the last call.
    pub fn take_dirty(&mut self) -> Vec<string> {
        let out = self.dirty.clone();
        self.dirty = Vec::new();
        out
    }

    /// Every file path under `dir` (any depth), in the order added.
    pub fn walk(&self, dir: &str) -> Vec<string> {
        let d = normalize(dir);
        let mut prefix = d.clone();
        if !prefix.ends_with("/") {
            prefix.push('/');
        }
        let mut out: Vec<string> = Vec::new();
        for f in self.files.iter() {
            if f.path.starts_with(prefix.as_str()) {
                out.push(f.path.clone());
            }
        }
        out
    }

    /// The names directly in `dir`: files, and directories with a `/` after
    /// the name.
    pub fn list(&self, dir: &str) -> Vec<string> {
        let d = normalize(dir);
        let mut prefix = d.clone();
        if !prefix.ends_with("/") {
            prefix.push('/');
        }
        let skip = prefix.as_bytes().len();
        let mut out: Vec<string> = Vec::new();
        for f in self.files.iter() {
            if !f.path.starts_with(prefix.as_str()) {
                continue;
            }
            let rest = f.path[skip..].to_string();
            let slash = first_index(&rest, 47);
            let name = if slash < 0 { rest.clone() } else { format!("{}/", &rest[0..(slash as usize)]) };
            let mut seen = false;
            for n in out.iter() {
                if *n == name {
                    seen = true;
                }
            }
            if !seen {
                out.push(name);
            }
        }
        out
    }

    /// Mounts a pack's files under `prefix`; answers how many, -1 when the
    /// bytes are not a pack (`error` says why).
    pub fn mount_pack(&mut self, prefix: &str, pack: &Vec<u8>) -> int {
        let mut pos: i64 = 0;
        let magic = read_line(pack, &mut pos);
        if magic != "RGPK1" {
            self.error = "not an RGPK1 pack".to_string();
            return -1;
        }
        let count = parse_int(&read_line(pack, &mut pos));
        let total = pack.len() as i64;
        let mut n: i64 = 0;
        while n < count {
            let path = read_line(pack, &mut pos);
            let size = parse_int(&read_line(pack, &mut pos));
            if size < 0 || pos + size > total {
                self.error = format!("the pack ends inside {}", path);
                return -1;
            }
            let data = pack[(pos as usize)..((pos + size) as usize)].to_vec();
            pos += size;
            self.put(&join(prefix, &path), data);
            n += 1;
        }
        count
    }

    /// The files under `dir` as a pack, paths relative to `dir` (what the
    /// host keeps of /save, and what the pack tool writes).
    pub fn pack(&self, dir: &str) -> Vec<u8> {
        let d = normalize(dir);
        let paths = self.walk(&d);
        let skip = if d == "/" { 1 } else { d.as_bytes().len() + 1 };
        let mut out: Vec<u8> = Vec::new();
        let mut head = format!("RGPK1\n{}\n", paths.len());
        for p in paths.iter() {
            let data = self.read(p);
            head.push_str(&format!("{}\n{}\n", &p[skip..], data.len()));
            out.extend_from_slice(head.as_bytes());
            out.extend_from_slice(&data);
            head = String::new();
        }
        if paths.len() == 0 {
            out.extend_from_slice(head.as_bytes());
        }
        out
    }
}

/// The byte offset of the last byte `b` in `s`, -1 when there is none.
fn last_index(s: &str, b: u8) -> i64 {
    let bytes = s.as_bytes();
    let mut i = bytes.len() as i64 - 1;
    while i >= 0 {
        if bytes[i as usize] == b {
            return i;
        }
        i -= 1;
    }
    -1
}

/// The byte offset of the first byte `b` in `s`, -1 when there is none.
fn first_index(s: &str, b: u8) -> i64 {
    let bytes = s.as_bytes();
    let mut i: i64 = 0;
    while i < bytes.len() as i64 {
        if bytes[i as usize] == b {
            return i;
        }
        i += 1;
    }
    -1
}

fn read_line(b: &Vec<u8>, pos: &mut i64) -> string {
    let start = *pos;
    let total = b.len() as i64;
    while *pos < total && b[*pos as usize] != 10 {
        *pos += 1;
    }
    let line = String::from_utf8_lossy(&b[(start as usize)..(*pos as usize)]).to_string();
    if *pos < total {
        *pos += 1;
    }
    line
}

fn parse_int(s: &str) -> int {
    match s.trim().parse::<i64>() {
        Ok(n) => n,
        Err(_) => -1,
    }
}
