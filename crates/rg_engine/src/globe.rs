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
//!   roll,                        // the compass bearing that points up on the screen (default 0)
//!   r, x, y,                     // radius and centre in pixels (default: fits the view, centred)
//!   ocean, land, border, borderWidth, grid, glow, rim,   // colours ("" or false: none)
//!   colors: { idOrGroup: colour | null },               // fills, merged into the earlier ones
//!   shade,                       // 0..1, how much darker the land is towards the rim (default 0.3)
//!   bands: [[lat0, lat1, colour], …] | false,          // land colours by latitude (seasons, snow)
//!   sun: [lon, lat] | false,     // the point where the sun is overhead: night falls on the far side
//!   night,                       // 0..1, how dark the night side is (default 0.6)
//!   cell,                        // with a sun: cut the land also into strips this many degrees
//!                                // of longitude wide, so that each strip is lit by its own sun angle
//!   peaks: [[lon, lat, size], …] | false,  // mountains: cones lit by the sun, casting shadows
//!   peakSize, peakSnow,          // a peak's base radius in degrees (default 1.2); the colour of
//!                                // its snowy top (size >= 2 always has one, smaller ones in snow bands)
//!   outline: [idOrGroup, colour, width] | false,   // one region's border drawn over the others
//!   visible })
//! ```
//!
//! An id's colour wins over the latitude bands, which win over the group's
//! colour, which wins over `land`. Several regions may share an id (a country
//! in two continents). With bands, a region is cut along the band edges once
//! when the bands change, so a game should send new bands only when they do.

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

/// Rings on the unit sphere and the cap that holds them.
struct Part {
    rings: Vec<Vec<V3>>,
    /// the cap that holds the part: its middle and the cosine of its radius
    mid: V3,
    reach: f64,
    /// the latitude band it was cut to (None: the whole region)
    band: Option<usize>,
}

impl Part {
    fn new(rings: Vec<Vec<V3>>, band: Option<usize>) -> Part {
        let mut sum = [0.0, 0.0, 0.0];
        for ring in rings.iter() {
            for p in ring.iter() {
                sum = [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]];
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
        Part { rings, mid, reach, band }
    }
}

struct Region {
    id: String,
    group: String,
    /// the rings in degrees [lon, lat], for cutting into bands
    ll: Vec<Vec<[f64; 2]>>,
    whole: Part,
    banded: Vec<Part>,
    /// longitude strips without bands (for a region with its own colour)
    cells: Vec<Part>,
}

/// Cuts rings into strips of longitude `cell` degrees wide (all of it when 0).
fn strips(rings: &[Vec<[f64; 2]>], cell: f64, band: Option<usize>, out: &mut Vec<Part>) {
    if cell <= 0.0 {
        let r: Vec<Vec<V3>> = rings.iter().filter(|r| r.len() >= 3).map(|r| to_sphere(r)).collect();
        if !r.is_empty() {
            out.push(Part::new(r, band));
        }
        return;
    }
    let (mut lo, mut hi) = (f64::MAX, f64::MIN);
    for ring in rings.iter() {
        for p in ring.iter() {
            lo = lo.min(p[0]);
            hi = hi.max(p[0]);
        }
    }
    let mut x = (lo / cell).floor() * cell;
    while x < hi {
        let mut rs: Vec<Vec<V3>> = Vec::new();
        for ring in rings.iter() {
            let mut r = ring.clone();
            if x > lo {
                r = cut_axis(&r, 0, x, true);
            }
            if x + cell < hi && r.len() >= 3 {
                r = cut_axis(&r, 0, x + cell, false);
            }
            if r.len() >= 3 {
                rs.push(to_sphere(&r));
            }
        }
        if !rs.is_empty() {
            out.push(Part::new(rs, band));
        }
        x += cell;
    }
}

/// Points closer than this many degrees, so that long straight edges (a
/// border along a parallel, a band edge) bend with the globe.
const STEP: f64 = 2.0;

fn densify(ring: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let n = ring.len();
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let a = ring[i];
        let b = ring[(i + 1) % n];
        out.push(a);
        let d = (b[0] - a[0]).abs().max((b[1] - a[1]).abs());
        if d > STEP && d < 300.0 {
            let k = (d / STEP).ceil() as usize;
            for s in 1..k {
                let t = s as f64 / k as f64;
                out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
        }
    }
    out
}

/// The part of a ring at latitudes `lat >= v` (above) or `lat <= v`.
fn cut(ring: &[[f64; 2]], v: f64, above: bool) -> Vec<[f64; 2]> {
    cut_axis(ring, 1, v, above)
}

/// The part of a ring where coordinate `axis` (0 lon, 1 lat) is >= v (above) or <= v.
fn cut_axis(ring: &[[f64; 2]], axis: usize, v: f64, above: bool) -> Vec<[f64; 2]> {
    let o = 1 - axis;
    let inside = |p: &[f64; 2]| if above { p[axis] >= v } else { p[axis] <= v };
    let n = ring.len();
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let a = ring[i];
        let b = ring[(i + 1) % n];
        let (ia, ib) = (inside(&a), inside(&b));
        if ia {
            out.push(a);
        }
        if ia != ib {
            let t = (v - a[axis]) / (b[axis] - a[axis]);
            let mut q = [0.0, 0.0];
            q[axis] = v;
            q[o] = a[o] + (b[o] - a[o]) * t;
            out.push(q);
        }
    }
    out
}

fn to_sphere(ring: &[[f64; 2]]) -> Vec<V3> {
    densify(ring).iter().map(|p| unit(p[0], p[1])).collect()
}

/// A small circle round `c` (at most a quarter turn), as a ring.
fn cap_ring(c: V3, radius_deg: f64, n: usize) -> Vec<V3> {
    let helper = if c[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
    let cross = |a: V3, b: V3| -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };
    let u = cross(c, helper);
    let l = dot(u, u).sqrt();
    let u = [u[0] / l, u[1] / l, u[2] / l];
    let w = cross(c, u);
    let (sr, cr) = radius_deg.to_radians().sin_cos();
    (0..n)
        .map(|i| {
            let (st, ct) = (i as f64 / n as f64 * std::f64::consts::TAU).sin_cos();
            [cr * c[0] + sr * (ct * u[0] + st * w[0]), cr * c[1] + sr * (ct * u[1] + st * w[1]), cr * c[2] + sr * (ct * u[2] + st * w[2])]
        })
        .collect()
}

pub struct Globe {
    regions: Vec<Region>,
    colors: HashMap<String, Option<V3>>,
    lon: f64,
    lat: f64,
    /// the compass bearing that points up on the screen (0: north up)
    roll: f64,
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
    bands: Vec<(f64, f64, V3)>,
    sun: Option<V3>,
    night: f64,
    cell: f64,
    peaks: Vec<(V3, f64)>,
    peak_size: f64,
    peak_snow: V3,
    lines: Vec<Vec<V3>>,
    /// one region (id or group) outlined over the others: (key, colour, width)
    outline: Option<(String, V3, f64)>,
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
            roll: 0.0,
            r: 0.0,
            x: None,
            y: None,
            ocean: Some([0.18, 0.5, 0.78]),
            land: [0.55, 0.78, 0.4],
            border: Some([1.0, 1.0, 1.0]),
            border_width: 1.0,
            outline: None,
            grid: Some([1.0, 1.0, 1.0]),
            glow: Some([0.6, 0.85, 1.0]),
            rim: None,
            shade: 0.3,
            visible: true,
            bands: Vec::new(),
            sun: None,
            night: 0.6,
            cell: 0.0,
            peaks: Vec::new(),
            peak_size: 1.2,
            peak_snow: [0.95, 0.97, 1.0],
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
                let mut ll: Vec<Vec<[f64; 2]>> = Vec::new();
                for ring in parts[2..].iter() {
                    let n = ring.items();
                    let mut pts: Vec<[f64; 2]> = Vec::with_capacity(n.len() / 2);
                    let mut k = 0;
                    while k + 1 < n.len() {
                        pts.push([n[k].as_num(0.0) / scale, n[k + 1].as_num(0.0) / scale]);
                        k += 2;
                    }
                    if pts.len() >= 3 {
                        ll.push(pts);
                    }
                }
                let whole = Part::new(ll.iter().map(|r| to_sphere(r)).collect(), None);
                self.regions.push(Region { id: parts[0].as_str(), group: parts[1].as_str(), ll, whole, banded: Vec::new(), cells: Vec::new() });
            }
            self.cut_bands();
        }
        let bands = a.get("bands");
        if !bands.is_null() {
            self.bands.clear();
            for b in bands.items() {
                let v = b.items();
                if v.len() >= 3 {
                    self.bands.push((v[0].as_num(0.0), v[1].as_num(0.0), color(&v[2], self.land)));
                }
            }
            self.cut_bands();
        }
        let sun = a.get("sun");
        if !sun.is_null() {
            let v = sun.items();
            self.sun = if v.len() >= 2 { Some(unit(v[0].as_num(0.0), v[1].as_num(0.0))) } else { None };
        }
        self.night = a.get("night").as_num(self.night);
        let cell = a.get("cell");
        if !cell.is_null() && cell.as_num(0.0) != self.cell {
            self.cell = cell.as_num(0.0).max(0.0);
            self.cut_bands();
        }
        let peaks = a.get("peaks");
        if !peaks.is_null() {
            self.peaks.clear();
            for p in peaks.items() {
                let v = p.items();
                if v.len() >= 2 {
                    let size = if v.len() >= 3 { v[2].as_num(1.0) } else { 1.0 };
                    self.peaks.push((unit(v[0].as_num(0.0), v[1].as_num(0.0)), size));
                }
            }
        }
        self.peak_size = a.get("peakSize").as_num(self.peak_size);
        if !a.get("peakSnow").is_null() {
            self.peak_snow = color(&a.get("peakSnow"), self.peak_snow);
        }
        self.lon = a.get("lon").as_num(self.lon);
        self.lat = a.get("lat").as_num(self.lat);
        self.roll = a.get("roll").as_num(self.roll);
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
        match a.get("outline") {
            Json::Null => {}
            Json::Arr(v) if !v.is_empty() => {
                let key = v[0].as_str().to_string();
                let c = color(v.get(1).unwrap_or(&Json::Null), [1.0, 0.82, 0.4]);
                let wd = v.get(2).map(|x| x.as_num(3.0)).unwrap_or(3.0);
                self.outline = Some((key, c, wd));
            }
            _ => self.outline = None,
        }
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

    /// Cuts every region along the band edges (only where a band edge crosses
    /// it) and into longitude strips when `cell` is set.
    fn cut_bands(&mut self) {
        let bands = self.bands.clone();
        let cell = self.cell;
        for reg in self.regions.iter_mut() {
            reg.banded.clear();
            reg.cells.clear();
            if cell > 0.0 {
                strips(&reg.ll, cell, None, &mut reg.cells);
            }
            if bands.is_empty() {
                continue;
            }
            let (mut lo, mut hi) = (f64::MAX, f64::MIN);
            for ring in reg.ll.iter() {
                for p in ring.iter() {
                    lo = lo.min(p[1]);
                    hi = hi.max(p[1]);
                }
            }
            for (bi, b) in bands.iter().enumerate() {
                let (b0, b1) = (b.0.min(b.1), b.0.max(b.1));
                if b1 <= lo || b0 >= hi {
                    continue;
                }
                let mut rings: Vec<Vec<[f64; 2]>> = Vec::new();
                for ring in reg.ll.iter() {
                    let mut r = ring.clone();
                    if b0 > lo {
                        r = cut(&r, b0, true);
                    }
                    if b1 < hi && r.len() >= 3 {
                        r = cut(&r, b1, false);
                    }
                    if r.len() >= 3 {
                        rings.push(r);
                    }
                }
                if !rings.is_empty() {
                    strips(&rings, cell, Some(bi), &mut reg.banded);
                }
            }
        }
    }

    /// The band colour at a latitude, if any.
    fn band_at(&self, lat: f64) -> Option<V3> {
        for b in self.bands.iter() {
            if lat >= b.0.min(b.1) && lat < b.0.max(b.1) {
                return Some(b.2);
            }
        }
        None
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

    /// Mountains as cones: their faces lit by the sun, their shadows on the ground.
    /// `vis`: whether a peak at this point of the unit sphere faces the viewer;
    /// `pt`: a point on or above the unit sphere on the screen (None: behind the eye).
    fn render_peaks(&self, out: &mut DrawStream, vis: &dyn Fn(&V3) -> bool, pt: &dyn Fn(&V3) -> Option<[f32; 2]>) {
        if self.peaks.is_empty() {
            return;
        }
        const N: usize = 8;
        let rock = [0.55, 0.5, 0.45];
        let mut faces: Vec<(V3, Vec<f32>)> = Vec::new();
        let mut shadow: Vec<f32> = Vec::new();
        let mut sends: Vec<f32> = Vec::new();
        for &(c, size) in self.peaks.iter() {
            if !vis(&c) {
                continue;
            }
            // the local frame: east, north, up
            let up = c;
            let hz = (up[0] * up[0] + up[1] * up[1]).sqrt().max(1e-9);
            let east = [-up[1] / hz, up[0] / hz, 0.0];
            let north = [-up[2] * east[1], up[2] * east[0], up[0] * east[1] - up[1] * east[0]];
            let r = self.peak_size.to_radians() * (0.7 + 0.3 * size);
            let height = r * (0.9 + 0.35 * size);
            let behind = std::cell::Cell::new(false);
            let at = |de: f64, dn: f64, du: f64| -> [f32; 2] {
                let p = [
                    up[0] * (1.0 + du) + east[0] * de + north[0] * dn,
                    up[1] * (1.0 + du) + east[1] * de + north[1] * dn,
                    up[2] * (1.0 + du) + east[2] * de + north[2] * dn,
                ];
                match pt(&p) {
                    Some(q) => q,
                    None => {
                        behind.set(true);
                        [0.0, 0.0]
                    }
                }
            };
            // the sun in the local frame
            let sl = self.sun.map(|s| [dot(s, east), dot(s, north), dot(s, up)]);
            let lit = |n: V3| -> f64 {
                match sl {
                    Some(s) => {
                        if s[2] <= 0.0 {
                            0.45
                        } else {
                            0.45 + 0.7 * (n[0] * s[0] + n[1] * s[1] + n[2] * s[2]).max(0.0)
                        }
                    }
                    None => 0.45 + 0.6 * (-0.5 * n[0] + 0.5 * n[1] + 0.7 * n[2]).max(0.0),
                }
            };
            // the shadow: from the sides of the base to the tip's shadow, away from the sun
            if let Some(s) = sl {
                if s[2] > 0.05 {
                    let hl = (s[0] * s[0] + s[1] * s[1]).sqrt().max(1e-6);
                    let (dx, dy) = (-s[0] / hl, -s[1] / hl);
                    let len = (height * hl / s[2]).min(r * 5.0);
                    let tip = at(dx * len, dy * len, 0.0);
                    let a = at(-dy * r, dx * r, 0.0);
                    let b = at(dy * r, -dx * r, 0.0);
                    if !behind.get() {
                        shadow.extend_from_slice(&[a[0], a[1], tip[0], tip[1], b[0], b[1]]);
                        sends.push(shadow.len() as f32);
                    }
                }
            }
            let lat = up[2].clamp(-1.0, 1.0).asin().to_degrees();
            let ground = self.band_at(lat).unwrap_or(self.land);
            let snowy = size >= 2.0 || close(ground, self.peak_snow);
            let apex = at(0.0, 0.0, height);
            let cap = 0.45;
            let first = faces.len();
            for i in 0..N {
                let a0 = i as f64 / N as f64 * std::f64::consts::TAU;
                let a1 = (i + 1) as f64 / N as f64 * std::f64::consts::TAU;
                let am = (a0 + a1) / 2.0;
                let nl = (height * height + r * r).sqrt();
                let n = [am.sin() * height / nl, am.cos() * height / nl, r / nl];
                let k = (lit(n) * 6.0).round() / 6.0;
                let p0 = at(a0.sin() * r, a0.cos() * r, 0.0);
                let p1 = at(a1.sin() * r, a1.cos() * r, 0.0);
                let q0 = at(a0.sin() * r * cap, a0.cos() * r * cap, height * (1.0 - cap));
                let q1 = at(a1.sin() * r * cap, a1.cos() * r * cap, height * (1.0 - cap));
                let low = if close(ground, self.peak_snow) { ground } else { [ground[0] * 0.55 + rock[0] * 0.45, ground[1] * 0.55 + rock[1] * 0.45, ground[2] * 0.55 + rock[2] * 0.45] };
                let top = if snowy { self.peak_snow } else { rock };
                let sh = |c: V3| [(c[0] * k).min(1.0), (c[1] * k).min(1.0), (c[2] * k).min(1.0)];
                faces.push((sh(low), vec![p0[0], p0[1], p1[0], p1[1], q1[0], q1[1], q0[0], q0[1]]));
                faces.push((sh(top), vec![q0[0], q0[1], q1[0], q1[1], apex[0], apex[1]]));
            }
            if behind.get() {
                faces.truncate(first);
            }
        }
        if !shadow.is_empty() {
            out.rings(6, [0.05, 0.08, 0.15], 0.28, 0.0, &shadow, &sends);
        }
        // faces of one colour go out as one path; the back faces first does not matter
        // much from above, so they are grouped by colour only
        faces.sort_by(|a, b| {
            let ka = ((a.0[0] * 255.0) as i32, (a.0[1] * 255.0) as i32, (a.0[2] * 255.0) as i32);
            let kb = ((b.0[0] * 255.0) as i32, (b.0[1] * 255.0) as i32, (b.0[2] * 255.0) as i32);
            ka.cmp(&kb)
        });
        let mut i = 0;
        while i < faces.len() {
            let c = faces[i].0;
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            while i < faces.len() && close(faces[i].0, c) && ends.len() < 128 {
                pts.extend_from_slice(&faces[i].1);
                ends.push(pts.len() as f32);
                i += 1;
            }
            out.rings(6, c, 1.0, 0.0, &pts, &ends);
        }
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
        let (e0, n0) = ([-slo, clo, 0.0], [-sla * clo, -sla * slo, cla]);
        // the screen's right and up: north and east turned by the roll
        let (sr, cr) = self.roll.to_radians().sin_cos();
        let east = [cr * e0[0] - sr * n0[0], cr * e0[1] - sr * n0[1], cr * e0[2] - sr * n0[2]];
        let north = [cr * n0[0] + sr * e0[0], cr * n0[1] + sr * e0[1], cr * n0[2] + sr * e0[2]];
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
            // a lighter middle, so the ball looks round (with a sun, the sun lights it)
            let light = [o[0] + (1.0 - o[0]) * 0.12, o[1] + (1.0 - o[1]) * 0.12, o[2] + (1.0 - o[2]) * 0.12];
            if self.sun.is_none() {
                let c2 = circle(rad * 0.82, 72);
                out.rings(6, light, 0.5, 0.0, &c2, &[c2.len() as f32]);
            }
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
        let seen = cos_view.clamp(-1.0, 1.0).acos().min(std::f64::consts::FRAC_PI_2);
        for reg in self.regions.iter() {
            let own = matches!(self.colors.get(&reg.id), Some(Some(_)));
            let use_bands = !own && !reg.banded.is_empty();
            let base = self.fill_of(reg);
            let mut drew = false;
            let parts: Vec<&Part> = if use_bands {
                reg.banded.iter().collect()
            } else if !reg.cells.is_empty() {
                reg.cells.iter().collect()
            } else {
                vec![&reg.whole]
            };
            for part in parts {
                let c0 = match part.band {
                    Some(b) => self.bands[b].2,
                    None => base,
                };
                if let Some((c, pts, ends)) = project_part(part, c0, self.shade, self.sun, toward, seen, w, h, &view, &px) {
                    fills.push((c, pts, ends));
                    drew = true;
                }
            }
            if !drew {
                continue;
            }
            self.drawn += 1;
            if self.border.is_some() {
                // the borders follow the whole region, not the band cuts
                if let Some((_, pts, ends)) = project_part(&reg.whole, base, 0.0, None, toward, seen, w, h, &view, &px) {
                    let off = bpts.len() as f32;
                    bpts.extend_from_slice(&pts);
                    for e in ends.iter() {
                        bends.push(off + e);
                    }
                }
            }
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
        if let Some((key, oc, ow)) = self.outline.clone() {
            let mut opts: Vec<f32> = Vec::new();
            let mut oends: Vec<f32> = Vec::new();
            for reg in self.regions.iter().filter(|r| r.id == key || r.group == key) {
                if let Some((_, pts, ends)) = project_part(&reg.whole, oc, 0.0, None, toward, seen, w, h, &view, &px) {
                    let off = opts.len() as f32;
                    opts.extend_from_slice(&pts);
                    for e in ends.iter() {
                        oends.push(off + e);
                    }
                }
            }
            if !opts.is_empty() {
                out.rings(7, oc, 1.0, ow, &opts, &oends);
            }
        }
        self.render_peaks(out, &|c: &V3| dot(*c, toward) >= 0.08, &|p: &V3| {
            let v = view(p);
            Some(px(v[0], v[1]))
        });
        if let Some(sun) = self.sun {
            // a soft terminator: a few caps round the point opposite the sun, and a glow under it
            let anti = [-sun[0], -sun[1], -sun[2]];
            let mut layer = |c: V3, deg: f64, rgb: V3, alpha: f64| {
                let ring: Vec<V3> = cap_ring(c, deg, 96).iter().map(|p| view(p)).collect();
                let mut pts: Vec<f32> = Vec::new();
                clip_ring(&ring, &mut pts, &px);
                if pts.len() >= 6 {
                    out.rings(6, rgb, alpha, 0.0, &pts, &[pts.len() as f32]);
                }
            };
            let dark = [0.0, 0.02, 0.1];
            let n = self.night.clamp(0.0, 1.0);
            // alphas that stack up to `night` in the middle
            let step = 1.0 - (1.0 - n).powf(1.0 / 5.0);
            for deg in [89.5, 87.0, 84.0, 80.0, 75.0] {
                layer(anti, deg, dark, step);
            }
            for deg in [70.0, 50.0, 30.0] {
                layer(sun, deg, [1.0, 0.97, 0.82], 0.06);
            }
        }
        if let Some(rc) = self.rim {
            let mut c = circle(rad, 96);
            c.push(c[0]);
            c.push(c[1]);
            out.rings(7, rc, 0.6, 2.0, &c, &[c.len() as f32]);
        }
    }
}

/// A perspective camera for globes placed in the 3D scene (planets): where
/// the eye is, its right, up and forward axes, and the screen.
pub struct Cam3 {
    pub eye: V3,
    pub right: V3,
    pub up: V3,
    pub fwd: V3,
    pub focal: f64,
    pub w: f64,
    pub h: f64,
    pub near: f64,
}

impl Cam3 {
    fn view(&self, p: V3) -> V3 {
        let d = [p[0] - self.eye[0], p[1] - self.eye[1], p[2] - self.eye[2]];
        [dot(d, self.right), dot(d, self.up), dot(d, self.fwd)]
    }
    fn screen(&self, v: V3) -> [f32; 2] {
        [(self.w / 2.0 + v[0] / v[2] * self.focal) as f32, (self.h / 2.0 - v[1] / v[2] * self.focal) as f32]
    }
}

/// Where a globe stands in the scene: its centre, radius and the world
/// directions of its own x, y and z (z: the north pole).
pub struct Place3 {
    pub centre: V3,
    pub radius: f64,
    pub axes: [V3; 3],
}

impl Place3 {
    /// A point of the globe's own frame (the unit sphere is the surface) in the world.
    fn world(&self, p: &V3) -> V3 {
        let a = &self.axes;
        let r = self.radius;
        [
            self.centre[0] + r * (a[0][0] * p[0] + a[1][0] * p[1] + a[2][0] * p[2]),
            self.centre[1] + r * (a[0][1] * p[0] + a[1][1] * p[1] + a[2][1] * p[2]),
            self.centre[2] + r * (a[0][2] * p[0] + a[1][2] * p[1] + a[2][2] * p[2]),
        ]
    }
    /// A world direction in the globe's own frame.
    fn local(&self, d: V3) -> V3 {
        [dot(d, self.axes[0]), dot(d, self.axes[1]), dot(d, self.axes[2])]
    }
}

/// The part of the unit sphere the eye sees: the cap round `e` (towards the
/// eye) down to the horizon at `dot(p, e) = c0`, with `x`, `y` across it.
struct Cap {
    e: V3,
    c0: f64,
    s0: f64,
    x: V3,
    y: V3,
}

impl Cap {
    fn new(e: V3, c0: f64) -> Cap {
        let helper = if e[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
        let cr = |a: V3, b: V3| -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };
        let x = cr(e, helper);
        let l = dot(x, x).sqrt();
        let x = [x[0] / l, x[1] / l, x[2] / l];
        let y = cr(e, x);
        Cap { e, c0, s0: (1.0 - c0 * c0).max(0.0).sqrt(), x, y }
    }
    /// The point of the horizon at angle `a`.
    fn rim(&self, a: f64) -> V3 {
        let (s, c) = a.sin_cos();
        let k = self.s0;
        [
            self.c0 * self.e[0] + k * (c * self.x[0] + s * self.y[0]),
            self.c0 * self.e[1] + k * (c * self.x[1] + s * self.y[1]),
            self.c0 * self.e[2] + k * (c * self.x[2] + s * self.y[2]),
        ]
    }
    fn angle(&self, p: V3) -> f64 { dot(p, self.y).atan2(dot(p, self.x)) }
    /// One ring of the unit sphere cut to the cap: where it goes round the
    /// back, it follows the horizon instead (as `clip_ring` does for the flat globe).
    fn clip(&self, ring: &[V3]) -> Vec<V3> {
        let n = ring.len();
        let mut out: Vec<V3> = Vec::with_capacity(n + 8);
        let side = |p: &V3| dot(*p, self.e) - self.c0;
        if ring.iter().all(|p| side(p) < 0.0) {
            return out;
        }
        let arc = |out: &mut Vec<V3>, from: f64, to: f64| {
            let mut d = to - from;
            while d > std::f64::consts::PI { d -= std::f64::consts::TAU; }
            while d < -std::f64::consts::PI { d += std::f64::consts::TAU; }
            let steps = (d.abs() / 0.08).ceil() as usize;
            for s in 1..steps {
                out.push(self.rim(from + d * s as f64 / steps as f64));
            }
        };
        let mut exit: Option<f64> = None;
        let mut first_entry: Option<f64> = None;
        for i in 0..n {
            let a = ring[i];
            let b = ring[(i + 1) % n];
            let (sa, sb) = (side(&a), side(&b));
            if sa >= 0.0 {
                out.push(a);
            }
            if (sa >= 0.0) != (sb >= 0.0) {
                let t = sa / (sa - sb);
                let p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
                let ang = self.angle(p);
                if sa >= 0.0 {
                    out.push(self.rim(ang));
                    exit = Some(ang);
                } else {
                    if let Some(e) = exit.take() {
                        arc(&mut out, e, ang);
                    } else if first_entry.is_none() {
                        first_entry = Some(ang);
                    }
                    out.push(self.rim(ang));
                }
            }
        }
        if let (Some(e), Some(f)) = (exit, first_entry) {
            arc(&mut out, e, f);
        }
        out
    }
    /// The whole horizon as a ring.
    fn horizon(&self, n: usize) -> Vec<V3> {
        (0..n).map(|i| self.rim(i as f64 / n as f64 * std::f64::consts::TAU)).collect()
    }
}

/// A ring of world points on the screen: cut at the camera's near plane,
/// then projected (appended to `out`; false when nothing is left).
fn project_world(cam: &Cam3, ring: &[V3], out: &mut Vec<f32>) -> bool {
    let vs: Vec<V3> = ring.iter().map(|p| cam.view(*p)).collect();
    let n = vs.len();
    if n < 3 || vs.iter().all(|v| v[2] < cam.near) {
        return false;
    }
    let start = out.len();
    let near = cam.near;
    for i in 0..n {
        let a = vs[i];
        let b = vs[(i + 1) % n];
        if a[2] >= near {
            let q = cam.screen(a);
            out.push(q[0]);
            out.push(q[1]);
        }
        if (a[2] >= near) != (b[2] >= near) {
            let t = (near - a[2]) / (b[2] - a[2]);
            let q = cam.screen([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
            out.push(q[0]);
            out.push(q[1]);
        }
    }
    if out.len() - start < 6 {
        out.truncate(start);
        return false;
    }
    true
}

fn off_screen(pts: &[f32], w: f64, h: f64) -> bool {
    let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for k in (0..pts.len()).step_by(2) {
        x0 = x0.min(pts[k]);
        x1 = x1.max(pts[k]);
        y0 = y0.min(pts[k + 1]);
        y1 = y1.max(pts[k + 1]);
    }
    x1 < 0.0 || y1 < 0.0 || x0 > w as f32 || y0 > h as f32
}

impl Globe {
    /// Draws the globe as a ball in the 3D scene, in perspective: `place`
    /// says where, `sun` is the world position of the light (None: the
    /// globe's own `sun`), and `glowing` makes it a light itself (a star:
    /// no shading, no night). The rest (regions, bands, peaks, colours) is
    /// the same as for the flat globe.
    pub fn render_3d(&mut self, out: &mut DrawStream, cam: &Cam3, place: &Place3, sun: Option<V3>, glowing: bool) {
        self.drawn = 0;
        if !self.visible {
            return;
        }
        let to_eye = [cam.eye[0] - place.centre[0], cam.eye[1] - place.centre[1], cam.eye[2] - place.centre[2]];
        let dist = dot(to_eye, to_eye).sqrt();
        if dist <= place.radius * 1.0001 {
            return;
        }
        let e = place.local([to_eye[0] / dist, to_eye[1] / dist, to_eye[2] / dist]);
        let cap = Cap::new(e, place.radius / dist);
        let (w, h) = (cam.w, cam.h);
        // the light in the globe's own frame
        let sun_local = if glowing {
            None
        } else {
            match sun {
                Some(s) => {
                    let d = [s[0] - place.centre[0], s[1] - place.centre[1], s[2] - place.centre[2]];
                    let l = dot(d, d).sqrt().max(1e-9);
                    Some(place.local([d[0] / l, d[1] / l, d[2] / l]))
                }
                None => self.sun,
            }
        };
        let fill = |out: &mut DrawStream, ring: &[V3], rgb: V3, alpha: f64| {
            let world: Vec<V3> = ring.iter().map(|p| place.world(p)).collect();
            let mut pts: Vec<f32> = Vec::new();
            if project_world(cam, &world, &mut pts) && !off_screen(&pts, w, h) {
                out.rings(6, rgb, alpha, 0.0, &pts, &[pts.len() as f32]);
            }
        };

        // the air round it: horizons of a slightly bigger ball
        if let Some(g) = self.glow {
            let layers: &[(f64, f64)] = if glowing { &[(1.5, 0.08), (1.22, 0.14), (1.08, 0.3)] } else { &[(1.07, 0.18), (1.035, 0.3)] };
            for &(k, a) in layers.iter() {
                let rr = place.radius * k;
                if dist <= rr * 1.001 {
                    continue;
                }
                let gc = Cap::new(e, rr / dist);
                let ring: Vec<V3> = gc.horizon(96).iter().map(|p| [p[0] * k, p[1] * k, p[2] * k]).collect();
                fill(out, &ring, g, a);
            }
        }
        if let Some(o) = self.ocean {
            fill(out, &cap.horizon(128), o, 1.0);
        }

        // the land: parts in the order given (later ones over earlier ones, so a
        // crater can lie on a sea), neighbours of one colour as one path
        let seen = cap.c0.clamp(-1.0, 1.0).acos();
        let mut pts: Vec<f32> = Vec::new();
        let mut ends: Vec<f32> = Vec::new();
        let mut cur: Option<V3> = None;
        let mut bpts: Vec<f32> = Vec::new();
        let mut bends: Vec<f32> = Vec::new();
        let flush = |out: &mut DrawStream, c: Option<V3>, pts: &mut Vec<f32>, ends: &mut Vec<f32>| {
            if let Some(c) = c {
                if !ends.is_empty() {
                    out.rings(6, c, 1.0, 0.0, pts, ends);
                }
            }
            pts.clear();
            ends.clear();
        };
        let shade_of = |part: &Part, base: V3| -> V3 {
            let k = match sun_local {
                Some(s) => {
                    let lit = dot(part.mid, s).max(0.0).powf(0.7);
                    0.5 + 0.5 * (lit * 8.0).round() / 8.0
                }
                None => 1.0,
            };
            [base[0] * k, base[1] * k, base[2] * k]
        };
        let rings_of = |part: &Part, into: &mut Vec<f32>, ends: &mut Vec<f32>| -> bool {
            let ang = dot(part.mid, cap.e).clamp(-1.0, 1.0).acos();
            let reach = part.reach.clamp(-1.0, 1.0).acos();
            if ang - reach > seen + 0.01 {
                return false;
            }
            let start = into.len();
            let mut any = false;
            for ring in part.rings.iter() {
                let cut = cap.clip(ring);
                if cut.len() < 3 {
                    continue;
                }
                let world: Vec<V3> = cut.iter().map(|p| place.world(p)).collect();
                let at = into.len();
                if project_world(cam, &world, into) {
                    ends.push(into.len() as f32);
                    any = true;
                } else {
                    into.truncate(at);
                }
            }
            if any && off_screen(&into[start..], w, h) {
                into.truncate(start);
                while let Some(&last) = ends.last() {
                    if last as usize > start { ends.pop(); } else { break; }
                }
                return false;
            }
            any
        };
        for reg in self.regions.iter() {
            let own = matches!(self.colors.get(&reg.id), Some(Some(_)));
            let use_bands = !own && !reg.banded.is_empty();
            let base = self.fill_of(reg);
            let parts: Vec<&Part> = if use_bands {
                reg.banded.iter().collect()
            } else if !reg.cells.is_empty() && sun_local.is_some() {
                reg.cells.iter().collect()
            } else {
                vec![&reg.whole]
            };
            let mut drew = false;
            for part in parts {
                let c0 = match part.band {
                    Some(b) => self.bands[b].2,
                    None => base,
                };
                let c = shade_of(part, c0);
                if let Some(old) = cur {
                    if !close(old, c) || ends.len() >= 64 {
                        flush(out, cur, &mut pts, &mut ends);
                    }
                }
                cur = Some(c);
                if rings_of(part, &mut pts, &mut ends) {
                    drew = true;
                }
            }
            if drew {
                self.drawn += 1;
                if self.border.is_some() {
                    rings_of(&reg.whole, &mut bpts, &mut bends);
                }
            }
        }
        flush(out, cur, &mut pts, &mut ends);
        if let Some(b) = self.border {
            if !bends.is_empty() {
                out.rings(7, b, 0.85, self.border_width, &bpts, &bends);
            }
        }
        // mountains
        let saved = self.sun;
        self.sun = sun_local;
        let c_vis = cap.c0 + 0.02;
        self.render_peaks(out, &|c: &V3| dot(*c, cap.e) >= c_vis, &|p: &V3| {
            let v = cam.view(place.world(p));
            if v[2] < cam.near { None } else { Some(cam.screen(v)) }
        });
        self.sun = saved;
        // night and day
        if let Some(s) = sun_local {
            let anti = [-s[0], -s[1], -s[2]];
            let dark = [0.0, 0.01, 0.04];
            let n = self.night.clamp(0.0, 1.0);
            let step = 1.0 - (1.0 - n).powf(1.0 / 5.0);
            for deg in [89.5, 87.0, 84.0, 80.0, 75.0] {
                let ring = cap.clip(&cap_ring(anti, deg, 96));
                if ring.len() >= 3 {
                    fill(out, &ring, dark, step);
                }
            }
            for deg in [80.0, 66.0, 52.0, 38.0, 24.0] {
                let ring = cap.clip(&cap_ring(s, deg, 96));
                if ring.len() >= 3 {
                    fill(out, &ring, [1.0, 0.97, 0.82], 0.025);
                }
            }
        }
        if let Some(rc) = self.rim {
            let world: Vec<V3> = cap.horizon(128).iter().map(|p| place.world(p)).collect();
            let mut pts: Vec<f32> = Vec::new();
            if project_world(cam, &world, &mut pts) {
                pts.push(pts[0]);
                pts.push(pts[1]);
                out.rings(7, rc, 0.6, 2.0, &pts, &[pts.len() as f32]);
            }
        }
    }
}

/// One part on the screen: its shaded colour and its clipped rings, or None
/// when it is round the back or off the screen.
#[allow(clippy::too_many_arguments)]
fn project_part(
    part: &Part, base: V3, shade: f64, sun: Option<V3>, toward: V3, seen: f64, w: f64, h: f64,
    view: &dyn Fn(&V3) -> V3, px: &dyn Fn(f64, f64) -> [f32; 2],
) -> Option<(V3, Vec<f32>, Vec<f32>)> {
    let d = dot(part.mid, toward).clamp(-1.0, 1.0);
    let ang = d.acos();
    let reach = part.reach.clamp(-1.0, 1.0).acos();
    if ang - reach > seen + 0.01 {
        return None;
    }
    let mut pts: Vec<f32> = Vec::new();
    let mut ends: Vec<f32> = Vec::new();
    let mut zsum = 0.0;
    let mut zn = 0.0;
    for ring in part.rings.iter() {
        let start = pts.len();
        let vs: Vec<V3> = ring.iter().map(|p| view(p)).collect();
        clip_ring(&vs, &mut pts, px);
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
        return None;
    }
    let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for k in (0..pts.len()).step_by(2) {
        x0 = x0.min(pts[k]);
        x1 = x1.max(pts[k]);
        y0 = y0.min(pts[k + 1]);
        y1 = y1.max(pts[k + 1]);
    }
    if x1 < 0.0 || y1 < 0.0 || x0 > w as f32 || y0 > h as f32 {
        return None;
    }
    let z = if zn > 0.0 { zsum / zn } else { 0.0 };
    // in a few steps, so that neighbours share a colour and go out as one path
    let zq = (z.clamp(0.0, 1.0) * 5.0).round() / 5.0;
    let k = match sun {
        // lit by the sun: the higher it stands, the brighter (in steps, see above)
        Some(s) => {
            let e = dot(part.mid, s).max(0.0).powf(0.7);
            let eq = (e * 8.0).round() / 8.0;
            0.5 + 0.5 * eq
        }
        None => 1.0 - shade * (1.0 - zq),
    };
    Some(([base[0] * k, base[1] * k, base[2] * k], pts, ends))
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

    fn cam_at(eye: V3, fwd: V3) -> Cam3 {
        // up is world z unless looking along it
        let up0 = if fwd[2].abs() > 0.9 { [0.0, 1.0, 0.0] } else { [0.0, 0.0, 1.0] };
        let r = [fwd[1] * up0[2] - fwd[2] * up0[1], fwd[2] * up0[0] - fwd[0] * up0[2], fwd[0] * up0[1] - fwd[1] * up0[0]];
        let l = dot(r, r).sqrt();
        let r = [r[0] / l, r[1] / l, r[2] / l];
        let u = [r[1] * fwd[2] - r[2] * fwd[1], r[2] * fwd[0] - r[0] * fwd[2], r[0] * fwd[1] - r[1] * fwd[0]];
        Cam3 { eye, right: r, up: u, fwd, focal: 300.0, w: 400.0, h: 400.0, near: 0.01 }
    }

    #[test]
    fn a_planet_in_perspective() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r#"{{"regions":[["A","x",{}],["B","x",{}]],"grid":false,"glow":false,"border":false}}"#, square(0.0, 0.0), square(180.0, 0.0)));
        g.command(&a);
        let place = Place3 { centre: [0.0; 3], radius: 1.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let mut out = DrawStream::new();
        // from afar, facing A
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false);
        assert_eq!(g.drawn, 1);
        // looking away: nothing
        let before = out.count;
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false);
        assert_eq!(g.drawn, 0);
        assert_eq!(out.count, before);
        // just above A, looking down and looking along the ground: A is under the eye
        g.render_3d(&mut out, &cam_at([1.05, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false);
        assert_eq!(g.drawn, 1);
        g.render_3d(&mut out, &cam_at([1.05, 0.0, 0.0], [0.0, 1.0, 0.0]), &place, None, false);
        assert_eq!(g.drawn, 1);
        // from the far side, B
        g.render_3d(&mut out, &cam_at([-3.0, 0.0, 0.0], [1.0, 0.0, 0.0]), &place, None, false);
        assert_eq!(g.drawn, 1);
    }

    #[test]
    fn outlines_one_region() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r#"{{"regions":[["A","x",{}],["B","x",{}]],"lon":0,"lat":0,"r":100,"grid":false,"glow":false}}"#, square(0.0, 0.0), square(10.0, 0.0)));
        g.command(&a);
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        let plain = out.count;
        g.command(&rg_core::json::parse(r##"{"outline":["A","#ffd166",4]}"##));
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(out.count, plain + 1);
        g.command(&rg_core::json::parse(r#"{"outline":false}"#));
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(out.count, plain);
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

    #[test]
    fn bands_cut_a_region_and_the_night_falls() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r##"{{"regions":[["A","x",{}]],"lon":0,"lat":0,"r":100,"grid":false,"glow":false,"border":false,"ocean":false,
            "bands":[[-90,0,"#ffffff"],[0,90,"#00ff00"]]}}"##, square(0.0, 0.0)));
        g.command(&a);
        assert_eq!(g.regions[0].banded.len(), 2);
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(out.count, 2);
        // an id colour wins over the bands: one fill
        g.command(&rg_core::json::parse(r##"{"colors":{"A":"#ff0000"}}"##));
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(out.count, 1);
        // the sun behind the globe: five night layers, no glow in sight
        g.command(&rg_core::json::parse(r#"{"sun":[180,0]}"#));
        let mut out = DrawStream::new();
        g.render(&mut out, 400.0, 400.0);
        assert_eq!(out.count, 6);
        g.command(&rg_core::json::parse(r#"{"sun":false,"bands":false}"#));
        assert!(g.sun.is_none() && g.bands.is_empty());
    }
}