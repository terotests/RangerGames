// SPDX-License-Identifier: AGPL-3.0-or-later
//! The Android engine with the RangerDOM renderer: the JNI calls of
//! crates/rg_android (its jni.rs, included), with an engine that has the
//! renderer. The phone draws with RangerDOM unless the player picks EVG in
//! the menu's settings (settings "renderer").

/// The engine: RangerDOM by default, EVG when chosen.
fn new_engine() -> rg_engine::Engine {
    let mut e = rg_web_dom::new_engine();
    e.dom_default = true;
    e
}

include!("../../../rg_android/src/jni.rs");
