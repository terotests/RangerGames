// SPDX-License-Identifier: AGPL-3.0-or-later
//! rg_cli: the engine without a screen.
//!
//!   rg_cli pack <dir> <out.rgpk>          a folder as a pack (for the web and Android hosts)
//!   rg_cli run <games dir> <game> [frames] [--tap x,y@frame]… [--key k@frame]…
//!                                         runs a game headless and prints what it drew
//!   rg_cli test <games dir> [frames]      runs every game with taps all over the screen;
//!                                         fails when a script throws

use rg_core::vfs::Vfs;
use rg_engine::Engine;
use std::path::Path;

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

fn engine_for(games: &str) -> Engine {
    let mut e = Engine::new();
    let root = Path::new(games);
    add_dir(&mut e.vfs, root, root, "/games");
    e.resize(360.0, 640.0);
    e
}

fn print_log(e: &mut Engine) {
    for l in e.log.drain(..) {
        println!("  log: {}", l);
    }
}

fn run(args: &[String]) -> i32 {
    if args.len() < 2 {
        eprintln!("rg_cli run <games dir> <game> [frames]");
        return 2;
    }
    let mut e = engine_for(&args[0]);
    let mut frames = 60;
    let mut taps: Vec<(f64, f64, usize)> = Vec::new();
    let mut keys: Vec<(String, usize)> = Vec::new();
    let mut i = 2;
    while i < args.len() {
        if args[i] == "--tap" && i + 1 < args.len() {
            let (xy, f) = args[i + 1].split_once('@').unwrap_or((&args[i + 1], "1"));
            let (x, y) = xy.split_once(',').unwrap_or(("0", "0"));
            taps.push((x.parse().unwrap_or(0.0), y.parse().unwrap_or(0.0), f.parse().unwrap_or(1)));
            i += 2;
        } else if args[i] == "--key" && i + 1 < args.len() {
            let (k, f) = args[i + 1].split_once('@').unwrap_or((&args[i + 1], "1"));
            keys.push((k.to_string(), f.parse().unwrap_or(1)));
            i += 2;
        } else {
            frames = args[i].parse().unwrap_or(60);
            i += 1;
        }
    }
    if let Err(err) = e.start(&args[1]) {
        print_log(&mut e);
        eprintln!("start: {}", err);
        return 1;
    }
    let t0 = std::time::Instant::now();
    let mut status = 0;
    for f in 1..=frames {
        for (x, y, at) in taps.iter() {
            if *at == f {
                let (sx, sy) = (x * e.scale + e.off_x, y * e.scale + e.off_y);
                e.pointer(0, 1, sx, sy);
                e.pointer(2, 1, sx, sy);
            }
        }
        for (k, at) in keys.iter() {
            if *at == f {
                e.key(true, k);
            }
            if *at + 6 == f {
                e.key(false, k);
            }
        }
        if let Err(err) = e.frame(1000.0 / 60.0) {
            eprintln!("frame {}: {}", f, err);
            status = 1;
            break;
        }
        for c in e.take_host_commands() {
            println!("  frame {}: {} {} {}", f, c.kind, c.name, c.args.write());
        }
        print_log(&mut e);
    }
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    let g = e.game.clone().map(|g| g.id).unwrap_or_default();
    println!(
        "{}: {} frames, {:.2} ms a frame, last frame {} draw commands, {} strings",
        g,
        frames,
        ms / frames as f64,
        e.draw.count,
        e.draw.strings.len()
    );
    if std::env::var("RG_DUMP").is_ok() {
        println!("{}", e.draw.strings.join(" | "));
    }
    status
}

fn test(args: &[String]) -> i32 {
    if args.is_empty() {
        eprintln!("rg_cli test <games dir> [frames]");
        return 2;
    }
    let frames: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(240);
    let probe = engine_for(&args[0]);
    let mut failed = 0;
    let games = probe.games();
    for g in games.iter() {
        let mut e = engine_for(&args[0]);
        let t0 = std::time::Instant::now();
        let mut ok = e.start(&g.id).is_ok();
        let mut why = e.error.clone();
        let mut drawn = 0;
        let mut f = 0;
        while ok && f < frames {
            f += 1;
            // taps over a grid of the screen, and the arrow keys and space
            if f % 7 == 0 {
                let k = f / 7;
                let x = ((k * 37) % 10) as f64 / 10.0 * e.ui.width + 18.0;
                let y = ((k * 53) % 10) as f64 / 10.0 * e.ui.height + 18.0;
                let (sx, sy) = (x * e.scale + e.off_x, y * e.scale + e.off_y);
                e.pointer(0, 1, sx, sy);
                e.pointer(2, 1, sx, sy);
            }
            if f % 11 == 0 {
                let key = ["ArrowLeft", "ArrowRight", "ArrowUp", " ", "Enter"][(f / 11) % 5];
                e.key(true, key);
                e.key(false, key);
            }
            if let Err(err) = e.frame(1000.0 / 60.0) {
                ok = false;
                why = err;
            }
            // a test stays in the game it tests
            if e.game.as_ref().map(|x| x.id != g.id).unwrap_or(true) {
                let _ = e.start(&g.id);
            }
            drawn = drawn.max(e.draw.count);
            e.take_host_commands();
            e.log.clear();
        }
        let ms = t0.elapsed().as_secs_f64() * 1000.0 / (f.max(1)) as f64;
        if ok && drawn > 0 {
            println!("ok    {:<14} {} frames, {:.2} ms a frame, up to {} draw commands", g.id, f, ms, drawn);
        } else {
            failed += 1;
            println!("FAIL  {:<14} {}", g.id, if why.is_empty() { "nothing drawn".to_string() } else { why });
        }
    }
    println!("{} games, {} failed", games.len(), failed);
    if failed > 0 || games.is_empty() {
        1
    } else {
        0
    }
}

fn pack(args: &[String]) -> i32 {
    if args.len() < 2 {
        eprintln!("rg_cli pack <dir> <out.rgpk>");
        return 2;
    }
    let mut vfs = Vfs::new();
    let root = Path::new(&args[0]);
    add_dir(&mut vfs, root, root, "/p");
    let bytes = vfs.pack("/p");
    if let Err(e) = std::fs::write(&args[1], &bytes) {
        eprintln!("{}: {}", args[1], e);
        return 1;
    }
    println!("{}: {} files, {} bytes", args[1], vfs.walk("/p").len(), bytes.len());
    0
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = match args.first().map(|s| s.as_str()) {
        Some("pack") => pack(&args[1..]),
        Some("run") => run(&args[1..]),
        Some("test") => test(&args[1..]),
        _ => {
            eprintln!("rg_cli pack | run | test  (see the source's header)");
            2
        }
    };
    std::process::exit(code);
}
