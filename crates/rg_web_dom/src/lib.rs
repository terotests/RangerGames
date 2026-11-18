// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine as WebAssembly with the RangerDOM renderer: the same C ABI as
//! crates/rg_web (its abi.rs, included), with an engine whose 2D view goes
//! through RangerDOM (dom.rs). The web page loads rg_web_dom.wasm instead of
//! rg_web.wasm with `?dom=1`.

pub mod dom;

/// An engine with the RangerDOM renderer.
pub fn new_engine() -> rg_engine::Engine {
    let mut e = rg_engine::Engine::new();
    e.dom = Some(Box::new(dom::DomRender::new()));
    // the web draws with RangerDOM unless the player chose EVG
    e.dom_default = true;
    e
}

include!("../../rg_web/src/abi.rs");
