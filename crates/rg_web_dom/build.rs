// SPDX-License-Identifier: AGPL-3.0-or-later
//! RangerDOM's webapi.js compiled once, here, into a CErXes unit (the
//! engine's compiled script as text, cerxes::unit::encode): a game start
//! reads it back and runs it instead of parsing and compiling 15 000 lines
//! each time (natively 64 ms -> 18 ms of a start). An empty file when it
//! does not compile; the start then compiles the source as before.
use std::path::Path;

fn main() {
    let src_path = "../../.deps/RangerDOM/js/webapi.js";
    println!("cargo:rerun-if-changed={}", src_path);
    println!("cargo:rerun-if-changed=build.rs");
    let src = std::fs::read_to_string(src_path).unwrap_or_default();
    let mut e = cerxes::Engine::new();
    let u = e.compile(&src);
    let text = if e.error.is_empty() && u.entry >= 0 { cerxes::unit::encode(&u, &src) } else { String::new() };
    let out = std::env::var("OUT_DIR").unwrap();
    std::fs::write(Path::new(&out).join("webapi.unit"), text).unwrap();
}
