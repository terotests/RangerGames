// Times a game's frames in the engine (3D included), without the screen:
// cargo run --release -p rg_engine --example bench3d -- <game> [gl] ["x,y@frame;…" taps]   (NF=frames)
// HOLD="x,y@frame" puts a second finger down there and keeps it down (a held button)
use rg_engine::Engine;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let id = a.get(1).cloned().unwrap_or("nappulasota".into());
    let gl = a.get(2).map(|s| s == "gl").unwrap_or(false);
    let mut e = Engine::new();
    let dir = format!("games/{}", id);
    for ent in walk(std::path::Path::new(&dir)) {
        let rel = ent.strip_prefix("games").unwrap().to_string_lossy().replace('\\', "/");
        e.vfs.add(&format!("/games{}", if rel.starts_with('/') { rel.clone() } else { format!("/{}", rel) }), std::fs::read(&ent).unwrap());
    }
    e.gl3d = gl;
    e.resize(360.0, 640.0);
    let ts = std::time::Instant::now();
    e.start(&id).unwrap();
    println!("start {:.1} ms", ts.elapsed().as_secs_f64() * 1000.0);
    let taps: Vec<(f64, f64, usize)> = a.get(3).map(|s| s.split(';').filter(|x| !x.is_empty()).map(|t| { let (xy, f) = t.split_once('@').unwrap(); let (x, y) = xy.split_once(',').unwrap(); (x.parse().unwrap(), y.parse().unwrap(), f.parse().unwrap()) }).collect()).unwrap_or_default();
    let mut times = vec![];
    let nf: usize = std::env::var("NF").ok().and_then(|x| x.parse().ok()).unwrap_or(600);
    let hold: Option<(f64, f64, usize)> = std::env::var("HOLD").ok().map(|t| { let (xy, f) = t.split_once('@').unwrap(); let (x, y) = xy.split_once(',').unwrap(); (x.parse().unwrap(), y.parse().unwrap(), f.parse().unwrap()) });
    for f in 0..nf {
        if let Some((x, y, hf)) = hold { if hf == f { e.pointer(0, 2, x, y); } }
        for &(x, y, tf) in &taps { if tf == f { e.pointer(0, 1, x, y); } if tf + 1 == f { e.pointer(2, 1, x, y); } }
        let t0 = std::time::Instant::now();
        e.frame(16.0).unwrap();
        times.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    let avg = |s: &[f64]| s.iter().sum::<f64>() / s.len() as f64;
    println!("first 100: {:.2} ms, 100-600: {:.2} ms, max {:.2}, drawn {}", avg(&times[..100]), avg(&times[100.min(nf - 1)..]), times.iter().cloned().fold(0.0, f64::max), e.world.borrow().drawn);
    for l in e.log.iter().rev().take(5) { println!("log: {}", l); }
}

fn walk(d: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = vec![];
    for e in std::fs::read_dir(d).unwrap().flatten() {
        let p = e.path();
        if p.is_dir() { out.extend(walk(&p)); } else { out.push(p); }
    }
    out
}
