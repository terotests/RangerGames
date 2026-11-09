// SPDX-License-Identifier: AGPL-3.0-or-later
//! rg_core: the portable core of the RangerGames engine.
//!
//! A strict Rust module in Ranger's subset (Ranger's
//! docs/plans/PLAN_RUST_SYNTAX.md): the same source builds with cargo and
//! with `rgrc` into Ranger's other targets, so a host written in another
//! language (Kotlin on Android, C++ on a Raspberry Pi, JavaScript) can take
//! this part as it is.
//!
//! What is here has no platform in it:
//!
//! - `vfs`: the virtual resource directory a game reads its script,
//!   stylesheet, images and sounds from (mounts, packs, a writable `/save`)
//! - `json`: the JSON reader and writer the engine and the host talk in
//! - `input`: pointers (touch and mouse), keys and the events of one frame
//! - `host`: what a game asks of the host: sounds, vibration, saves, 3D
//! - `rng`: a seeded random number generator that answers the same on every
//!   target

#[allow(unused_imports)]
use ranger::prelude::*;

pub mod host;
pub mod input;
pub mod json;
pub mod rng;
pub mod vfs;
