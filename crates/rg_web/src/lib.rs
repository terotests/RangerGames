// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine as a WebAssembly module (wasm32-wasip1) behind a C ABI, for
//! the browser host (web/js/host.js) and the Android WebView shell.
//!
//!   rg_alloc(n) -> ptr / rg_free(ptr, n)  buffers the host writes text and bytes into
//!   rg_mount(prefix, plen, pack, len)     mounts a pack; the number of files, -1 when not a pack
//!   rg_put(path, plen, data, len)         adds one file (the saves the host kept)
//!   rg_start(id, len)                     starts a game ("" the launcher); 0 ok, 1 error
//!   rg_resize(w, h)                       the screen in CSS pixels
//!   rg_pointer(kind, id, x, y)            0 down, 1 move, 2 up; screen coordinates
//!   rg_key(down, key, len)                a key by its KeyboardEvent.key
//!   rg_frame(dt_ms)                       one frame; 0 ok, 1 the script threw
//!   rg_draw_ptr/len                       the frame's draw stream (f32s, crates/rg_engine/src/draw.rs)
//!   rg_strings_ptr/len                    its string table, NUL separated
//!   rg_cmds_ptr/len                       the frame's host commands as JSON
//!   rg_log_ptr/len                        console.log lines and errors since the last frame
//!   rg_view(i)                            0 scale, 1 x offset, 2 y offset, 3 game width, 4 game height
//!   rg_read(path, len)                    a file's bytes into the result (rg_result_ptr/len); its size or -1
//!   rg_games_ptr/len                      the games as JSON

use rg_core::host::commands_json;
use rg_core::json::Json;
use rg_engine::Engine;
use std::cell::RefCell;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static CMDS: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static LOG: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static STRINGS: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static RESULT: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static GAMES: RefCell<Vec<u8>> = RefCell::new(Vec::new());
}

fn with<R>(f: impl FnOnce(&mut Engine) -> R) -> R {
    ENGINE.with(|e| {
        let mut b = e.borrow_mut();
        if b.is_none() {
            *b = Some(Engine::new());
        }
        f(b.as_mut().unwrap())
    })
}

unsafe fn text(p: *const u8, n: usize) -> String {
    if n == 0 {
        return String::new();
    }
    String::from_utf8_lossy(std::slice::from_raw_parts(p, n)).into_owned()
}

unsafe fn bytes(p: *const u8, n: usize) -> Vec<u8> {
    if n == 0 {
        return Vec::new();
    }
    std::slice::from_raw_parts(p, n).to_vec()
}

fn publish(e: &mut Engine) {
    let cmds = e.take_host_commands();
    CMDS.with(|b| *b.borrow_mut() = commands_json(&cmds).into_bytes());
    let log = e.log.join("\n");
    e.log.clear();
    LOG.with(|b| *b.borrow_mut() = log.into_bytes());
    STRINGS.with(|b| *b.borrow_mut() = e.draw.strings_joined().into_bytes());
}

#[no_mangle]
pub extern "C" fn rg_alloc(n: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn rg_free(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}

#[no_mangle]
pub unsafe extern "C" fn rg_mount(pp: *const u8, pn: usize, dp: *const u8, dn: usize) -> i32 {
    let prefix = text(pp, pn);
    let data = bytes(dp, dn);
    with(|e| e.vfs.mount_pack(&prefix, &data) as i32)
}

#[no_mangle]
pub unsafe extern "C" fn rg_put(pp: *const u8, pn: usize, dp: *const u8, dn: usize) {
    let path = text(pp, pn);
    let data = bytes(dp, dn);
    with(|e| e.vfs.add(&path, data));
}

#[no_mangle]
pub unsafe extern "C" fn rg_start(p: *const u8, n: usize) -> i32 {
    let id = text(p, n);
    with(|e| {
        let r = e.start(&id);
        publish(e);
        if r.is_ok() {
            0
        } else {
            1
        }
    })
}

#[no_mangle]
pub extern "C" fn rg_resize(w: f64, h: f64) {
    with(|e| e.resize(w, h));
}

#[no_mangle]
pub extern "C" fn rg_seed(seed: f64) {
    with(|e| e.set_seed(seed as i64));
}

#[no_mangle]
pub extern "C" fn rg_pointer(kind: i32, id: i32, x: f64, y: f64) {
    with(|e| e.pointer(kind, id as i64, x, y));
}

#[no_mangle]
pub unsafe extern "C" fn rg_key(down: i32, p: *const u8, n: usize) {
    let key = text(p, n);
    with(|e| e.key(down != 0, &key));
}

/// A sensor reading (`Engine::sensor`): the name, then its JSON.
#[no_mangle]
pub unsafe extern "C" fn rg_sensor(np: *const u8, nn: usize, dp: *const u8, dn: usize) {
    let name = text(np, nn);
    let data = text(dp, dn);
    with(|e| e.sensor(&name, &data));
}

#[no_mangle]
pub extern "C" fn rg_frame(dt_ms: f64) -> i32 {
    with(|e| {
        let r = e.frame(dt_ms);
        publish(e);
        if r.is_ok() {
            0
        } else {
            1
        }
    })
}

#[no_mangle]
pub extern "C" fn rg_draw_ptr() -> *const f32 {
    with(|e| e.draw.nums.as_ptr())
}

#[no_mangle]
pub extern "C" fn rg_draw_len() -> usize {
    with(|e| e.draw.nums.len())
}

#[no_mangle]
pub extern "C" fn rg_view(i: i32) -> f64 {
    with(|e| match i {
        0 => e.scale,
        1 => e.off_x,
        2 => e.off_y,
        3 => e.ui.width,
        _ => e.ui.height,
    })
}

#[no_mangle]
pub unsafe extern "C" fn rg_read(p: *const u8, n: usize) -> i32 {
    let path = text(p, n);
    with(|e| {
        let size = e.vfs.size(&path);
        let data = e.vfs.read(&path);
        RESULT.with(|b| *b.borrow_mut() = data);
        size as i32
    })
}

#[no_mangle]
pub extern "C" fn rg_games() -> usize {
    with(|e| {
        let list: Vec<Json> = e.games().iter().map(|g| g.to_json()).collect();
        let text = Json::Arr(list).write();
        GAMES.with(|b| *b.borrow_mut() = text.into_bytes());
        GAMES.with(|b| b.borrow().len())
    })
}

macro_rules! buffer {
    ($ptr:ident, $len:ident, $cell:ident) => {
        #[no_mangle]
        pub extern "C" fn $ptr() -> *const u8 {
            $cell.with(|b| b.borrow().as_ptr())
        }
        #[no_mangle]
        pub extern "C" fn $len() -> usize {
            $cell.with(|b| b.borrow().len())
        }
    };
}

buffer!(rg_cmds_ptr, rg_cmds_len, CMDS);
buffer!(rg_log_ptr, rg_log_len, LOG);
buffer!(rg_strings_ptr, rg_strings_len, STRINGS);
buffer!(rg_result_ptr, rg_result_len, RESULT);
buffer!(rg_games_ptr, rg_games_len, GAMES);
