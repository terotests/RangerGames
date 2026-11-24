// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine as a native library for the Android app (NDK, JNI): the same
//! calls as rg_web's C ABI, as the static methods of `fi.rangergames.Engine`.
//! The app paints the draw stream on an Android Canvas itself, so it needs
//! no WebView and no WebAssembly and runs on old phones as well.
//!
//!   mount(prefix, pack)      mounts a pack; the number of files, -1 when not a pack
//!   put(path, data)          adds one file (the saves the app kept)
//!   start(id)                starts a game ("" the launcher); 0 ok, 1 error
//!   resize(w, h)             the screen in dp
//!   seed(s)                  the random seed
//!   pointer(kind, id, x, y)  0 down, 1 move, 2 up; screen coordinates in dp
//!   key(down, key)           a key by its KeyboardEvent.key name ("Back", "ArrowLeft" …)
//!   frame(dt_ms)             one frame; 0 ok, 1 the script threw
//!   draw()                   the frame's draw stream (crates/rg_engine/src/draw.rs)
//!   gl3d(on)                 the app draws the 3D scene with GLES (depth-tested)
//!   tris()                   then the frame's 3D triangles (scene3d.rs `tris`)
//!   strings()                its string table, NUL separated
//!   commands()               the host commands of the last call, as JSON
//!   log()                    console.log lines and errors since the last call
//!   view(i)                  0 scale, 1 x offset, 2 y offset, 3 game width, 4 game height
//!   read(path)               a file of the virtual directory, null when there is none

/// The engine the app runs: EVG lays out the view (crates/rg_web_dom/android
/// makes one that can also draw with RangerDOM).
fn new_engine() -> rg_engine::Engine {
    rg_engine::Engine::new()
}

include!("jni.rs");
include!("xr_android.rs");
