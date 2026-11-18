// SPDX-License-Identifier: AGPL-3.0-or-later
//! The games with the RangerDOM renderer, without a screen (as rg_cli test):
//!
//!   domtest <games dir> [frames] [game…]
//!
//! Each game starts, gets taps over a grid of the screen and keys, and runs
//! `frames` frames (default 120); it fails when its script throws or nothing
//! is drawn. Prints the start time, the time of a frame and the draw
//! commands, and the same game's numbers with the engine's own EVG beside.
//!
//! For looking closer: DOMTEST_KINDS=1 counts the last frame's draw commands
//! by kind (DOMTEST_ORDER=1 lists them), DOMTEST_EVAL=<js> prints what the
//! JS gives in the game at the end, DOMTEST_STATS=1 the elements made and
//! changed each frame, RG_DOM_TIMING=1 the renderer's times, DOMTEST_SCROLL=1
//! drags a finger up and down (a scrolled page) in place of the taps,
//! DOMTEST_PRE=<js> runs in the game at the third frame (no taps then),
//! DOMTEST_SLOW=<ms> lists frames slower than that with the JS collections
//! run in them, DOMTEST_HEAP=<n> the live JS objects every n frames,
//! DOMTEST_CENSUS=1 the live JS objects by kind at the end.

use rg_core::vfs::Vfs;
use rg_engine::Engine;
use std::path::Path;
use std::time::Instant;

fn add_dir(vfs: &mut Vfs, root: &Path, dir: &Path, prefix: &str) {
    let mut entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return,
    };
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            add_dir(vfs, root, &p, prefix);
        } else if let Ok(data) = std::fs::read(&p) {
            let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            vfs.add(&format!("{}/{}", prefix, rel), data);
        }
    }
}

fn engine(games: &str, dom: bool) -> Engine {
    let mut e = if dom { rg_web_dom::new_engine() } else { Engine::new() };
    let root = Path::new(games);
    add_dir(&mut e.vfs, root, root, "/games");
    e.resize(360.0, 640.0);
    e
}

/// (ok, why, start ms, ms a frame, most draw commands)
fn play(games: &str, id: &str, frames: usize, dom: bool) -> (bool, String, f64, f64, usize) {
    let mut e = engine(games, dom);
    let t0 = Instant::now();
    let mut ok = e.start(id).is_ok();
    let start_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let mut why = e.error.clone();
    let mut drawn = 0;
    let t1 = Instant::now();
    let mut f = 0;
    while ok && f < frames {
        f += 1;
        let drag = std::env::var("DOMTEST_SCROLL").is_ok();
        let pre = std::env::var("DOMTEST_PRE").is_ok();
        if f == 3 {
            if let Ok(src) = std::env::var("DOMTEST_PRE") {
                let _ = e.eval(&src);
            }
        }
        if drag {
            // a finger drags the page up and down, 40 frames each way
            let k = (f - 1) % 80;
            let y = if k < 40 { 560.0 - k as f64 * 10.0 } else { 160.0 + (k - 40) as f64 * 10.0 };
            let (sx, sy) = (180.0 * e.scale + e.off_x, y * e.scale + e.off_y);
            e.pointer(if f == 1 { 0 } else { 1 }, 1, sx, sy);
        }
        if !drag && !pre && f % 7 == 0 {
            let k = f / 7;
            let x = ((k * 37) % 10) as f64 / 10.0 * e.ui.width + 18.0;
            let y = ((k * 53) % 10) as f64 / 10.0 * e.ui.height + 18.0;
            let (sx, sy) = (x * e.scale + e.off_x, y * e.scale + e.off_y);
            e.pointer(0, 1, sx, sy);
            e.pointer(2, 1, sx, sy);
        }
        if !drag && !pre && f % 11 == 0 {
            let key = ["ArrowLeft", "ArrowRight", "ArrowUp", " ", "Enter"][(f / 11) % 5];
            e.key(true, key);
            e.key(false, key);
        }
        let (g0, _) = e.js_heap();
        let tf = Instant::now();
        let res = e.frame(1000.0 / 60.0);
        if let Ok(lim) = std::env::var("DOMTEST_SLOW") {
            let ms = tf.elapsed().as_secs_f64() * 1000.0;
            if ms >= lim.parse::<f64>().unwrap_or(20.0) {
                let (g1, live) = e.js_heap();
                println!("    slow frame {}: {:.1} ms, gc runs +{}, live objects {}", f, ms, g1 - g0, live);
            }
        }
        if let Ok(every) = std::env::var("DOMTEST_HEAP") {
            if f % every.parse::<usize>().unwrap_or(100).max(1) == 0 {
                let (g, heap) = e.js_heap();
                let (ms, live) = e.js_collect();
                println!("    {} frame {}: heap {} objects, {} live after a {:.1} ms collection, gc runs {}", if dom { "dom" } else { "evg" }, f, heap, live, ms, g);
            }
        }
        if let Err(err) = res {
            ok = false;
            why = err;
        }
        if e.game.as_ref().map(|x| x.id != id).unwrap_or(true) {
            let _ = e.start(id);
        }
        drawn = drawn.max(e.draw.count);
        if dom && std::env::var("DOMTEST_STATS").is_ok() {
            println!("    frame {}: {}", f, e.eval("__rgDom.stats()").unwrap_or_default());
        }
        e.take_host_commands();
        if std::env::var("DOMTEST_LOG").is_ok() {
            for l in e.log.iter() {
                println!("    log: {}", l);
            }
        }
        e.log.clear();
    }
    if std::env::var("DOMTEST_CENSUS").is_ok() {
        for (n, k) in e.js_census(25) {
            println!("    {} {:>7} {}", if dom { "dom" } else { "evg" }, n, k);
        }
    }
    if std::env::var("DOMTEST_KINDS").is_ok() {
        let mut i = 0;
        let mut kinds = std::collections::BTreeMap::new();
        while i + rg_engine::draw::HEADER <= e.draw.nums.len() {
            let n = &e.draw.nums[i..];
            let k = n[0] as i32;
            *kinds.entry(k).or_insert(0) += 1;
            if std::env::var("DOMTEST_ORDER").is_ok() { println!("  #{} kind {} at {},{} {}x{} rgb {} {} {}", kinds.values().sum::<i32>(), k, n[1], n[2], n[3], n[4], n[5], n[6], n[7]); }
            i += rg_engine::draw::HEADER + n[22] as usize;
        }
        println!("  {} kinds {:?}", if dom { "dom" } else { "evg" }, kinds);
    }
    if dom {
        if let Ok(src) = std::env::var("DOMTEST_EVAL") {
            println!("{}", e.eval(&src).unwrap_or_else(|x| x));
        }
    }
    let ms = t1.elapsed().as_secs_f64() * 1000.0 / (f.max(1)) as f64;
    (ok && drawn > 0, if why.is_empty() && drawn == 0 { "nothing drawn".into() } else { why }, start_ms, ms, drawn)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("domtest <games dir> [frames] [game…]");
        std::process::exit(2);
    }
    let games = &args[0];
    let frames: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(120);
    let mut ids: Vec<String> = args.iter().skip(2).cloned().collect();
    if ids.is_empty() {
        ids = engine(games, false).games().iter().map(|g| g.id.clone()).collect();
    }
    let mut failed = 0;
    println!("{:<14} {:>9} {:>9} {:>6}   {:>9} {:>9} {:>6}", "game", "dom start", "dom frame", "cmds", "evg start", "evg frame", "cmds");
    for id in ids.iter() {
        let (ok, why, s, ms, n) = play(games, id, frames, true);
        let (_, _, s2, ms2, n2) = play(games, id, frames, false);
        if ok {
            println!("{:<14} {:>7.0}ms {:>7.2}ms {:>6}   {:>7.0}ms {:>7.2}ms {:>6}", id, s, ms, n, s2, ms2, n2);
        } else {
            failed += 1;
            println!("FAIL {:<14} {}", id, why);
        }
    }
    println!("{} games, {} failed with the RangerDOM renderer", ids.len(), failed);
    std::process::exit(if failed > 0 { 1 } else { 0 });
}
