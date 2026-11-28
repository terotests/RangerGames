// a probe (not a test of record): how many of a drawing's fills triangulate badly
#[test]
#[ignore]
fn probe_drawing_triangulation() {
    let path = std::env::var("PROBE").unwrap_or_default();
    let text = match std::fs::read_to_string(&path) { Ok(t) => t, Err(_) => return };
    let j = rg_core::json::parse(&text);
    for f in j.get("features").items() {
        let mut bad = 0; let mut n = 0;
        let mut f2 = f.clone();
        let _ = &mut f2;
        let art = rg_engine::features::drawing(&f);
        for (k, fl) in art.fills.iter().enumerate() {
            n += 1;
            let t = rg_engine::features::triangulate(&fl.pts);
            let area: f32 = { let p = &fl.pts; let m = p.len(); (0..m).map(|i| p[i][0] * p[(i + 1) % m][1] - p[(i + 1) % m][0] * p[i][1]).sum::<f32>().abs() / 2.0 };
            let ta: f32 = t.iter().map(|t| { let (a, b, c) = (fl.pts[t[0]], fl.pts[t[1]], fl.pts[t[2]]); ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).abs() / 2.0 }).sum();
            if (ta - area).abs() > 0.02 * area + 1.0 { bad += 1; if bad < 4 { println!("  {} fill {} pts {} tris {} area {:.0} tri-area {:.0}", f.get("name").as_str(), k, fl.pts.len(), t.len(), area, ta); } }
        }
        println!("{}: {} of {} fills off", f.get("name").as_str(), bad, n);
    }
}
