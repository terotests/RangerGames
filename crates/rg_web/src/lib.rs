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
//!   rg_gl3d(on)                           the page draws the 3D scene with WebGL (depth-tested)
//!   rg_tris_ptr/len                       then the frame's 3D triangles (f32s, scene3d.rs `tris`)
//!   rg_strings_ptr/len                    its string table, NUL separated
//!   rg_cmds_ptr/len                       the frame's host commands as JSON
//!   rg_log_ptr/len                        console.log lines and errors since the last frame
//!   rg_view(i)                            0 scale, 1 x offset, 2 y offset, 3 game width, 4 game height
//!   rg_read(path, len)                    a file's bytes into the result (rg_result_ptr/len); its size or -1
//!   rg_games_ptr/len                      the games as JSON
//!   rg_eval(src, len)                     runs JS in the game's script; its value (or error) into the result; 0 ok, 1 error
//!   rg_tree()                             the last frame's laid-out element tree as JSON into the result; its length
//!   rg_dev_changed(paths, len)            dev reload (web/js/dev.js): files put again; 2 restarted, 1 restyled, 0 nothing
//!   rg_gl_forget(path, len)               dev reload: a changed picture's GL texture uploaded again

/// The engine the module runs: EVG lays out the view (crates/rg_web_dom
/// makes one with the RangerDOM renderer instead).
fn new_engine() -> Engine {
    Engine::new()
}

include!("abi.rs");
include!("glabi.rs");
