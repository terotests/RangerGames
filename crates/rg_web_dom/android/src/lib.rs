// SPDX-License-Identifier: AGPL-3.0-or-later
//! The Android engine with the RangerDOM renderer as a choice: the JNI
//! calls of crates/rg_android (its jni.rs, included), with an engine that
//! has the renderer. The phone draws with EVG unless the player picks
//! RangerDOM in the menu's settings (settings "renderer").

/// The engine: EVG by default, RangerDOM when chosen.
fn new_engine() -> rg_engine::Engine {
    let mut e = rg_web_dom::new_engine();
    e.dom_default = false;
    e
}

include!("../../../rg_android/src/jni.rs");
