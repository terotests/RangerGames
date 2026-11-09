// SPDX-License-Identifier: AGPL-3.0-or-later
//! A globe for map games: country (or any region) outlines in longitude and
//! latitude, drawn as an orthographic globe into the draw stream as filled
//! and stroked paths. The projection, the clipping at the horizon and the
//! culling happen here in Rust, so a slow phone only paints polygons; the
//! game sends the outlines once and then only where the globe is looking.
//!
//! ```text
//! rg.three("globe", {
//!   regions: [[id, group, [lon, lat, lon, lat, …], [ …another ring ]], …],  // once; replaces the data
//!   scale,                       // the ring numbers are degrees × scale (default 1)
//!   lon, lat,                    // the point of the globe facing the viewer
//!   r, x, y,                     // radius and centre in pixels (default: fits the view, centred)
//!   ocean, land, border, borderWidth, grid, glow, rim,   // colours ("" or false: none)
//!   colors: { idOrGroup: colour | null },               // fills, merged into the earlier ones
//!   shade,                       // 0..1, how much darker the land is towards the rim (default 0.3)
//!   visible })
//! ```
//!
//! An id's colour wins over its group's, which wins over `land`. Several
//! regions may share an id (a country in two continents).

use crate::draw::DrawStream;
use crate::scene3d::color;
use rg_core::json::Json;
use std::collections::HashMap;

type V3 = [f64; 3];

fn unit(lon: f64, lat: f64) -> V3 {
    let (slo, clo) = lon.to_radians().sin_cos();
    let (sla, cla) = lat.to_radians().sin_cos();
    [cla * clo, cla * slo, sla]
}
fn dot(a: V3, b: V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

struct Region {
    id: String,
    group: String,
    rings: Vec<Vec<V3>>,
    /// the cap that holds the region: its middle and the cosine of its radius
    mid: V3,
    reach: f64,
}

pub struct Globe {
    regions: Vec<Region>,
    colors: HashMap<String, Option<V3>>,
    lon: f64,
    lat: f64,
    r: f64,
    x: Option<f64>,
    y: Option<f64>,
    ocean: Option<V3>,
    land: V3,
    border: Option<V3>,
    border_width: f64,
    grid: Option<V3>,
    glow: Option<V3>,
    rim: Option<V3>,
    shade: f64,
    visible: bool,
    lines: Vec<Vec<V3>>,
    /// regions drawn in the last frame
    pub drawn: usize,
}

fn opt_color(v: &Json, old: Option<V3>) -> Option<V3> {
    match v {
        Json::Null => old,
        Json::Bool(false) => None,
        Json::Str(s) if s.is_empty() => None,
        _ => Some(color(v, [0.5; 3])),
    }
}

impl Globe {
    pub fn new() -> Globe {
        // the lines of longitude and latitude every 30 degrees
        let mut lines: Vec<Vec<V3>> = Vec::new();
        for i in 0..12 {
            let lon = -180.0 + i as f64 * 30.0;
            lines.push((0..=32).map(|k| unit(lon, -80.0 + k as f64 * 5.0)).collect());
        }
        for lat in [-60.0, -30.0, 0.0, 30.0, 60.0] {
            lines.push((0..=72).map(|k| unit(-180.0 + k as f64 * 5.0, lat)).collect());
        }
        Globe {
            regions: Vec::new(),
            colors: HashMap::new(),
            lon: 0.0,
            lat: 0.0,
            r: 0.0,
            x: None,
            y: None,
            ocean: Some([0.18, 0.5, 0.78]),
            land: [0.55, 0.78, 0.4],
            border: Some([1.0, 1.0, 1.0]),
            border_width: 1.0,
            grid: Some([1.0, 1.0, 1.0]),
            glow: Some([0.6, 0.85, 1.0]),
            rim: None,
            shade: 0.3,
            visible: true,
            lines,
            drawn: 0,
        }
    }

    pub fn command(&mut self, a: &Json) {
        let regions = a.get("regions");
        if !regions.is_null() {
            let scale = a.get("scale").as_num(1.0);
            let scale = if scale == 0.0 { 1.0 } else { scale };
            self.regions.clear();
            for r in regions.items() {
                let parts = r.items();
                if parts.len() < 3 {
                    continue;
                }
                let mut rings: Vec<Vec<V3>> = Vec::new();
                let mut sum = [0.0, 0.0, 0.0];
                for ring in parts[2..].iter() {
                    let n = ring.items();
                    let mut pts: Vec<V3> = Vec::with_capacity(n.len() / 2);
                    let mut k = 0;
                    while k + 1 < n.len() {
                        let p = unit(n[k].as_num(0.0) / scale, n[k + 1].as_num(0.0) / scale);
                        sum = [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]];
                        pts.push(p);
                        k += 2;
                    }
                    if pts.len() >= 3 {
                        rings.push(pts);
                    }
                }
                let l = dot(sum, sum).sqrt();
                let mid = if l > 1e-9 { [sum[0] / l, sum[1] / l, sum[2] / l] } else { [1.0, 0.0, 0.0] };
                let mut reach: f64 = 1.0;
                for ring in rings.iter() {
                    for p in ring.iter() {
                        reach = reach.min(dot(*p, mid));
                    }
                }
                self.regions.push(Region { id: parts[0].as_str(), group: parts[1].as_str(), rings, mid, reach });
            }
        }
        self.lon = a.get("lon").as_num(self.lon);
        self.lat = a.get("lat").as_num(self.lat);
        self.r = a.get("r").as_num(self.r);
        if !a.get("x").is_null() {
            self.x = Some(a.get("x").as_num(0.0));
        }
        if !a.get("y").is_null() {
            self.y = Some(a.get("y").as_num(0.0));
        }
        self.ocean = opt_color(&a.get("ocean"), self.ocean);
        if !a.get("land").is_null() {
            self.land = color(&a.get("land"), self.land);
        }
        self.border = opt_color(&a.get("border"), self.border);
        self.border_width = a.get("borderWidth").as_num(self.border_width);
        self.grid = opt_color(&a.get("grid"), self.grid);
        self.glow = opt_color(&a.get("glow"), self.glow);
        self.rim = opt_color(&a.get("rim"), self.rim);
        self.shade = a.get("shade").as_num(self.shade);
        if let Json::Bool(v) = a.get("visible") {
            self.visible = v;
        }
        for m in a.get("colors").members() {
            if m.value.is_null() {
                self.colors.remove(&m.key);
            } else {
                self.colors.insert(m.key.clone(), Some(color(&m.value, self.land)));
            }
        }
    }

    fn fill_of(&self, r: &Region) -> V3 {
        if let Some(Some(c)) = self.colors.get(&r.id) {
            return *c;
        }
        if let Some(Some(c)) = self.colors.get(&r.group) {
            return *c;
        }
        self.land
    }

    pub fn render(&mut self, out: &mut DrawStream, w: f64, h: f64) {
        self.drawn = 0;
        if !self.visible {
            return;
        }
        let rad = if self.r > 0.0 { self.r } else { w.min(h) * 0.42 };
        let cx = self.x.unwrap_or(w / 2.0);
        let cy = self.y.unwrap_or(h / 2.0);
        let (slo, clo) = self.lon.to_radians().sin_cos();
        let (sla, cla) = self.lat.to_radians().sin_cos();
        let east = [-slo, clo, 0.0];
        let north = [-sla * clo, -sla * slo, cla];
        let toward = [cla * clo, cla * slo, sla];
        let view = |p: &V3| -> V3 { [dot(*p, east), dot(*p, north), dot(*p, toward)] };
        let px = |x: f64, y: f64| -> [f32; 2] { [(cx + x * rad) as f32, (cy - y * rad) as f32] };
        let circle = |r: f64, n: usize| -> Vec<f32> {
            let mut v = Vec::with_capacity(n * 2);
            for i in 0..n {
                let a = i as f64 / n as f64 * std::f64::consts::TAU;
                v.push((cx + a.cos() * r) as f32);
                v.push((cy + a.sin() * r) as f32);
            }
            v
        };
        // how far the screen reaches, in the globe's units, for culling
        let corner = ((w / 2.0).powi(2) + (h / 2.0).powi(2)).sqrt() / rad;

        if let Some(g) = self.glow {
            for (k, a) in [(1.07, 0.18), (1.035, 0.3)] {
                let c = circle(rad * k, 72);
                out.rings(6, g, a, 0.0, &c, &[c.len() as f32]);
            }
        }
        if let Some(o) = self.ocean {
            let c = circle(rad, 96);
            out.rings(6, o, 1.0, 0.0, &c, &[c.len() as f32]);
            // a lighter middle, so the ball looks round
            let light = [o[0] + (1.0 - o[0]) * 0.12, o[1] + (1.0 - o[1]) * 0.12, o[2] + (1.0 - o[2]) * 0.12];
            let c2 = circle(rad * 0.82, 72);
            out.rings(6, light, 0.5, 0.0, &c2, &[c2.len() as f32]);
        }
        if let Some(g) = self.grid {
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            for line in self.lines.iter() {
                let mut open = false;
                for p in line.iter() {
                    let v = view(p);
                    if v[2] > 0.02 {
                        let q = px(v[0], v[1]);
                        pts.push(q[0]);
                        pts.push(q[1]);
                        open = true;
                    } else if open {
                        ends.push(pts.len() as f32);
                        open = false;
                    }
                }
                if open {
                    ends.push(pts.len() as f32);
                }
            }
            out.rings(7, g, 0.18, 1.0, &pts, &ends);
        }

        // the land, clipped at the horizon
        let cos_view = if corner >= 1.0 { 0.0 } else { (1.0 - corner * corner).sqrt() };
        let mut fills: Vec<(V3, Vec<f32>, Vec<f32>)> = Vec::new();
        let mut bpts: Vec<f32> = Vec::new();
        let mut bends: Vec<f32> = Vec::new();
        for reg in self.regions.iter() {
            // the region's cap against the visible part of the globe
            let d = dot(reg.mid, toward).clamp(-1.0, 1.0);
            let ang = d.acos();
            let reach = reg.reach.clamp(-1.0, 1.0).acos();
            let seen = cos_view.clamp(-1.0, 1.0).acos().min(std::f64::consts::FRAC_PI_2);
            if ang - reach > seen + 0.01 {
                continue;
            }
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            let mut zsum = 0.0;
            let mut zn = 0.0;
            for ring in reg.rings.iter() {
                let start = pts.len();
                let vs: Vec<V3> = ring.iter().map(|p| view(p)).collect();
                clip_ring(&vs, &mut pts, &px);
                if pts.len() - start >= 6 {
                    ends.push(pts.len() as f32);
                    for v in vs.iter() {
                        if v[2] > 0.0 {
                            zsum += v[2];
                            zn += 1.0;
                        }
                    }
                } else {
                    pts.truncate(start);
                }
            }
            if ends.is_empty() {
                continue;
            }
            let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            for k in (0..pts.len()).step_by(2) {
                x0 = x0.min(pts[k]); x1 = x1.max(pts[k]);
                y0 = y0.min(pts[k + 1]); y1 = y1.max(pts[k + 1]);
            }
            if x1 < 0.0 || y1 < 0.0 || x0 > w as f32 || y0 > h as f32 {
                continue;
            }
            let z = if zn > 0.0 { zsum / zn } else { 0.0 };
            let base = self.fill_of(reg);
            // in a few steps, so that neighbours share a colour and go out as one path
            let zq = (z.clamp(0.0, 1.0) * 5.0).round() / 5.0;
            let k = 1.0 - self.shade * (1.0 - zq);
            let c = [base[0] * k, base[1] * k, base[2] * k];
            if self.border.is_some() {
                let off = bpts.len() as f32;
                bpts.extend_from_slice(&pts);
                for e in ends.iter() {
                    bends.push(off + e);
                }
            }
            fills.push((c, pts, ends));
            self.drawn += 1;
        }
        // regions of one colour go out as one path (they never overlap, so the order is free)
        fills.sort_by(|a, b| {
            let ka = ((a.0[0] * 255.0) as i32, (a.0[1] * 255.0) as i32, (a.0[2] * 255.0) as i32);
            let kb = ((b.0[0] * 255.0) as i32, (b.0[1] * 255.0) as i32, (b.0[2] * 255.0) as i32);
            ka.cmp(&kb)
        });
        let mut i = 0;
        while i < fills.len() {
            let c = fills[i].0;
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            let mut j = i;
            while j < fills.len() && close(fills[j].0, c) && j - i < 64 {
                let off = pts.len() as f32;
                pts.extend_from_slice(&fills[j].1);
                for e in fills[j].2.iter() {
                    ends.push(off + e);
                }
                j += 1;
            }
            out.rings(6, c, 1.0, 0.0, &pts, &ends);
            i = j;
        }
        if let Some(b) = self.border {
            out.rings(7, b, 0.85, self.border_width, &bpts, &bends);
        }
        if let Some(rc) = self.rim {
            let mut c = circle(rad, 96);
            c.push(c[0]);
            c.push(c[1]);
            out.rings(7, rc, 0.6, 2.0, &c, &[c.len() as f32]);
        }
    }
}

fn close(a: V3, b: V3) -> bool {
    (a[0] - b[0]).abs() < 0.02 && (a[1] - b[1]).abs() < 0.02 && (a[2] - b[2]).abs() < 0.02
}

/// One ring in view space (z toward the viewer) as screen points, cut at the
/// horizon: where it goes round the back, it follows the rim instead.
fn clip_ring(vs: &[V3], out: &mut Vec<f32>, px: &dyn Fn(f64, f64) -> [f32; 2]) {
    let n = vs.len();
    if vs.iter().all(|v| v[2] < 0.0) {
        return;
    }
    let push = |out: &mut Vec<f32>, x: f64, y: f64| {
        let q = px(x, y);
        out.push(q[0]);
        out.push(q[1]);
    };
    let arc = |out: &mut Vec<f32>, from: f64, to: f64| {
        let mut d = to - from;
        while d > std::f64::consts::PI { d -= std::f64::consts::TAU; }
        while d < -std::f64::consts::PI { d += std::f64::consts::TAU; }
        let steps = (d.abs() / 0.1).ceil() as usize;
        for s in 1..steps {
            let a = from + d * s as f64 / steps as f64;
            let q = px(a.cos(), a.sin());
            out.push(q[0]);
            out.push(q[1]);
        }
    };
    let start = out.len();
    let mut exit: Option<f64> = None;
    let mut first_entry: Option<f64> = None;
    for i in 0..n {
        let a = vs[i];
        let b = vs[(i + 1) % n];
        if a[2] >= 0.0 {
            push(out, a[0], a[1]);
        }
        if (a[2] >= 0.0) != (b[2] >= 0.0) {
            let t = a[2] / (a[2] - b[2]);
            let x = a[0] + (b[0] - a[0]) * t;
            let y = a[1] + (b[1] - a[1]) * t;
            let ang = y.atan2(x);
            if a[2] >= 0.0 {
                push(out, ang.cos(), ang.sin());
                exit = Some(ang);
            } else {
                if let Some(e) = exit.take() {
                    arc(out, e, ang);
                } else if first_entry.is_none() {
                    first_entry = Some(ang);
                }
                push(out, ang.cos(), ang.sin());
            }
        }
    }
    if let (Some(e), Some(f)) = (exit, first_entry) {
        arc(out, e, f);
    }
    if out.len() - start < 6 {
        out.truncate(start);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(lon: f64, lat: f64) -> String {
        format!("[{},{},{},{},{},{},{},{}]", lon - 5.0, lat - 5.0, lon + 5.0, lat - 5.0, lon + 5.0, lat + 5.0, lon - 5.0, lat + 5.0)
    }

    #[test]
    fn draws_the_facing_side_only() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r#"{{"regions":[["A","x",{}],["B","x",{}]],"lon":0,"lat":0,"r":100,"grid":false,"glow":false}}"#, square(0.0, 0.0), square(180.0, 0.0)));
        g.command(&a);
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(g.drawn, 1);
        g.command(&rg_core::json::parse(r#"{"lon":60}"#));
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(g.drawn, 1);
        // both half round the back: clipped at the rim, still drawn
        g.command(&rg_core::json::parse(r#"{"lon":90}"#));
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(g.drawn, 2);
        g.command(&rg_core::json::parse(r#"{"lon":90,"visible":false}"#));
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(g.drawn, 0);
    }
}
