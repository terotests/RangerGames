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
//!   air, airColor,               // with a texture: glowing air this many radii high (0.02 is
//!                                // ~130 km on the Earth), lit by the sun, brightest looking
//!                                // towards it past the rim (a sunrise); replaces `glow`'s layers
//!   scatter: true | gain | { gain, mie },  // the air lit after O'Neil (GPU Gems 2 ch. 16) instead of
//!                                // the glow: airColor is the Rayleigh colour (the Earth's blue,
//!                                // Mars' red-brown), mie the dust and haze against the Earth's (1);
//!                                // gain the sunlight's strength (1)
//!   lights, lightsGain,          // with a texture: a picture of city lights read on the night side
//!   relief,                      // with a texture: its brightness read as height tilts the
//!                                // ground for the sun, so hills and craters get shadows
//!   height, heightShape,         // with a texture: real heights, two equirectangular pictures with
//!                                // the height as (red × 256 + green) / 65535: a sharp one for the
//!                                // shading, a coarse one (e.g. 256 × 128) for the ground's shape
//!   heightMin, heightMax,        // the heights of 0 and 1 in them, in the same units as the
//!                                // planet's r (rg.three("planet")); kilometres in Solar Pilot
//!   heightDetail,                // made-up bumps on top, this high (same units; draw.rs `sphere`
//!                                // gives the formula, so a game can stand on them too)
//!   heightScale,                 // the bumps' coarsest size (same units, default r / 60)
//!   heightRelief,                // how much the sharp picture tilts the ground (default 1: true)
//!   heightCraters,               // made-up craters in the bumps: 0 none, 1 deep (a fifth of their width)
//!   regolith,                    // with real heights: close by small pits and lumps in the ground's shading, 0..2
//!                                // (made up, fixed to the place, finer as the eye comes nearer, down to millimetres)
//!   dust, glint, seaGlint,       // with a texture: light that changes with the eye, 0..1 (a headset's
//!                                // two eyes see it differently): dust, regolith's light (no darker
//!                                // limb, a bright halo opposite the sun); glint, close by grains that
//!                                // glitter towards the eye; seaGlint, the sun mirrored on the sea
//!   detail,                      // sharper pictures over parts of the map: [{ src, u0, v0, u1, v1,
//!                                // sun, shade (the picture's own light), height }]: height, a picture
//!                                // of the window's own heights (as `height`, from heightMin to
//!                                // heightMax) for the ground's shape and slopes close by
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

/// With real heights, an eye closer than this (in radii above the ball) sees
/// the ground's shape: rays cast against it, mountains on the horizon.
const TERRAIN_NEAR: f64 = 0.06;

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
    /// a map of the whole surface (an equirectangular picture in the game's
    /// files, longitude -180…180 left to right, north up): drawn by the host
    /// when it can (`render_3d`'s `textures`), else the regions are drawn
    texture: String,
    /// sharper pictures over parts of the map: (path, [u0, v0, u1, v1]) in
    /// the map's own 0…1 coordinates (u east from longitude -180, v south
    /// from the north pole), drawn over `texture` where the host can
    /// the sharper pictures: their path, window u0 v0 u1 v1 and their own sun
    /// [azimuth (radians, from east towards north), brightness per unit of slope
    /// towards it (0: none)] for reading slopes from the picture close by
    /// the sharper pictures: (picture, window u0 v0 u1 v1, its own sun [azimuth, shade], its heights or "")
    detail: Vec<(String, [f64; 4], [f64; 2], String)>,
    /// the host can draw `detail` (a sphere command with a window)
    pub detail_ok: bool,
    /// the host can draw `height` (a sphere command with 40 numbers)
    pub terrain_ok: bool,
    /// glowing air round a textured ball: its height in radii and colour
    air: f64,
    /// the air lit after O'Neil: the sunlight's strength (0: the older glow) and the dust (Mie, the Earth = 1)
    scatter: f64,
    scatter_mie: f64,
    /// rings in the ball's equator plane, drawn by the host's ball shader
    /// (draw.rs `sphere`, 44 numbers): "colour|opacity" pictures (a strip,
    /// inner edge on the left) and the inner and outer edge in radii
    rings: String,
    ring_in: f64,
    ring_out: f64,
    /// the cloud bands drift (a gas giant): `flow` times Jupiter's winds
    /// (east and west jets by latitude, up to ~150 m/s), at `flow_time`
    /// seconds of the planet's time (the game's clock, warp and all)
    flow: f64,
    flow_time: f64,
    /// storms turning in the clouds (at most 4): latitude, longitude and
    /// radius (degrees), width / height, turns an hour of `flow_time`
    /// (+ counter-clockwise seen from outside), how much the middle turns (0..1)
    vortices: Vec<[f64; 6]>,
    /// a glowing hot cap (Solar Pilot: the heat spreading from a giant impact):
    /// lat, lon (degrees), radius, soft edge (degrees), gain; gain 0 = none
    hot: [f64; 5],
    /// a star's own surface drawn by the shader (Solar Pilot: the Sun close up): granules' count across
    /// a radius, limb darkening (0..1), on (1) or off (0); with `star_spots`: lat, lon, the umbra's
    /// radius (degrees), up to 8
    star: [f64; 3],
    star_spots: Vec<[f64; 3]>,
    /// the clouds morph (a gas giant): their picture read through a slowly
    /// rolling warp (EVG's smoke), 0 still; None: as much as `flow`
    turbulence: Option<f64>,
    air_color: V3,
    /// city lights on the night side of a textured ball, and how bright
    lights: String,
    lights_gain: f64,
    /// how much the texture's brightness tilts the ground (bump shading)
    relief: f64,
    /// real heights: the sharp picture for the shading, the coarse one for the shape
    height: String,
    height_shape: String,
    /// heights of 0 and 1 in the pictures, the bumps' height and coarsest size
    /// (the planet's units), how much the sharp picture tilts the ground
    height_min: f64,
    height_max: f64,
    height_detail: f64,
    height_scale: f64,
    height_relief: f64,
    height_craters: f64,
    // the light that changes with the eye (draw.rs `sphere` 76-78): dust, the grains' glints, the sea's glint (0..1)
    dust: f64,
    glint: f64,
    sea_glint: f64,
    /// close by, made-up small pits in the shading (draw.rs `sphere` 124), 0..2
    regolith: f64,
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
    /// The drift of the cloud bands as the shader takes it: how far (in
    /// the picture's widths) the fastest band moves in one cycle, and where
    /// in the cycle the planet's time is. Two readings half a cycle apart are
    /// cross-faded, so the bands never smear however long it runs.
    fn flow_params(&self) -> Option<(f64, f64)> {
        if self.flow <= 0.0 {
            return None;
        }
        // Jupiter: 150 m/s round 2π · 71 492 km, in picture widths a second
        let rate = self.flow * 150.0 / (std::f64::consts::TAU * 7.1492e7);
        let amp = 0.012;
        let cycle = amp / rate;
        Some((amp, (self.flow_time / cycle).rem_euclid(1.0)))
    }

    /// The morphing clouds and storms as the shader takes them (the
    /// 72-number form, after the flow's 48): the storms' count, where in
    /// their cycle the time is, how much the clouds morph and the morph's
    /// time; then for each storm the picture's u, v of its middle, its radius
    /// (radians), width / height and how far its middle turns in one cycle
    /// (radians). As with the bands, two readings half a cycle apart are
    /// cross-faded: a cycle is as long as the fastest storm takes to turn
    /// 0.5 radians.
    fn vortex_params(&self) -> Option<[f64; 24]> {
        let fastest = self.vortices.iter().map(|v| (v[4] * v[5]).abs()).fold(0.0f64, f64::max);
        let turb = self.turbulence.unwrap_or(self.flow.min(1.0));
        if fastest <= 0.0 && turb <= 0.0 {
            return None;
        }
        let tau = std::f64::consts::TAU;
        let cycle = if fastest > 0.0 { 0.5 / (fastest * tau / 3600.0) } else { 1.0 };
        let mut p = [0.0; 24];
        p[0] = if fastest > 0.0 { self.vortices.len() as f64 } else { 0.0 };
        p[1] = (self.flow_time / cycle).rem_euclid(1.0);
        p[2] = turb;
        // the morph's time: one unit in 6 hours of the planet's time (an eddy
        // changes shape in about a day), round after 4096 units (~3 years)
        p[3] = (self.flow_time / 21600.0).rem_euclid(4096.0);
        for (i, v) in self.vortices.iter().enumerate() {
            let k = 4 + i * 5;
            p[k] = (v[1] / 360.0 + 0.5).rem_euclid(1.0);
            p[k + 1] = 0.5 - v[0] / 180.0;
            p[k + 2] = v[2].to_radians();
            p[k + 3] = v[3];
            p[k + 4] = v[4] * v[5] * tau / 3600.0 * cycle;
        }
        Some(p)
    }

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
            texture: String::new(),
            detail: Vec::new(),
            detail_ok: false,
            terrain_ok: false,
            drawn: 0,
            air: 0.0,
            scatter: 0.0,
            scatter_mie: 1.0,
            rings: String::new(),
            ring_in: 0.0,
            ring_out: 0.0,
            flow: 0.0,
            flow_time: 0.0,
            vortices: Vec::new(),
            hot: [0.0; 5],
            star: [300.0, 0.6, 0.0],
            star_spots: Vec::new(),
            turbulence: None,
            air_color: [0.35, 0.6, 1.0],
            lights: String::new(),
            lights_gain: 1.0,
            relief: 0.0,
            height: String::new(),
            height_shape: String::new(),
            height_min: 0.0,
            height_max: 0.0,
            height_detail: 0.0,
            height_scale: 0.0,
            height_relief: 1.0,
            height_craters: 0.0,
            dust: 0.0,
            glint: 0.0,
            sea_glint: 0.0,
            regolith: 0.0,
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
        if let Json::Str(t) = a.get("texture") {
            self.texture = t;
        }
        self.air = a.get("air").as_num(self.air).clamp(0.0, 0.5);
        match a.get("scatter") {
            Json::Bool(b) => self.scatter = if b { 1.0 } else { 0.0 },
            Json::Num(g) => self.scatter = g.clamp(0.0, 20.0),
            Json::Obj(_) => {
                let o = a.get("scatter");
                self.scatter = o.get("gain").as_num(1.0).clamp(0.0, 20.0);
                self.scatter_mie = o.get("mie").as_num(1.0).clamp(0.0, 50.0);
            }
            _ => {}
        }
        // rings: { src: "colour.png|opacity.png", inner, outer } (radii); false: none
        match a.get("rings") {
            Json::Bool(false) => self.rings.clear(),
            Json::Obj(_) => {
                let r = a.get("rings");
                self.rings = r.get("src").as_str().to_string();
                self.ring_in = r.get("inner").as_num(1.2).max(1.0);
                self.ring_out = r.get("outer").as_num(2.3).max(self.ring_in + 1e-3);
            }
            _ => {}
        }
        // flow: k (1 = Jupiter's winds, 0 = still), flowTime: the planet's time in seconds
        self.flow = a.get("flow").as_num(self.flow).max(0.0);
        self.flow_time = a.get("flowTime").as_num(self.flow_time);
        // turbulence: k (1 = Jupiter's), null: as much as flow
        match a.get("turbulence") {
            Json::Null => {}
            v => self.turbulence = Some(v.as_num(0.0).clamp(0.0, 4.0)),
        }
        // hot: { lat, lon, r, soft, gain } (degrees): a glowing molten cap of radius r round the place,
        // lit by its own heat (also on the night side); false or gain 0: none
        match a.get("hot") {
            Json::Bool(false) => self.hot = [0.0; 5],
            Json::Obj(_) => {
                let h = a.get("hot");
                self.hot = [
                    h.get("lat").as_num(0.0).clamp(-90.0, 90.0),
                    h.get("lon").as_num(0.0),
                    h.get("r").as_num(10.0).clamp(0.0, 180.0),
                    h.get("soft").as_num(8.0).clamp(0.1, 90.0),
                    h.get("gain").as_num(1.0).clamp(0.0, 4.0),
                ];
            }
            _ => {}
        }
        // star: { gran, limb, spots: [{ lat, lon, r }] } (degrees): a star's surface drawn by the shader (granules,
        // limb darkening, sunspots with their umbra, filaments and the Wilson depression), moving with `flowTime`;
        // false: none
        match a.get("star") {
            Json::Bool(false) => self.star[2] = 0.0,
            Json::Obj(_) => {
                let h = a.get("star");
                self.star[0] = h.get("gran").as_num(self.star[0]).clamp(1.0, 5000.0);
                self.star[1] = h.get("limb").as_num(self.star[1]).clamp(0.0, 1.0);
                self.star[2] = 1.0;
                if let Json::Arr(v) = h.get("spots") {
                    self.star_spots = v
                        .iter()
                        .take(8)
                        .map(|x| [x.get("lat").as_num(0.0).clamp(-90.0, 90.0), x.get("lon").as_num(0.0), x.get("r").as_num(1.0).clamp(0.01, 30.0)])
                        .collect();
                }
            }
            _ => {}
        }
        // vortices: [{ lat, lon, r, ell, turns, depth }] (degrees, turns an hour); [] none
        if let Json::Arr(v) = a.get("vortices") {
            self.vortices = v
                .iter()
                .take(4)
                .map(|o| {
                    [
                        o.get("lat").as_num(0.0).clamp(-85.0, 85.0),
                        o.get("lon").as_num(0.0),
                        o.get("r").as_num(10.0).clamp(0.1, 90.0),
                        o.get("ell").as_num(1.0).clamp(0.2, 5.0),
                        o.get("turns").as_num(0.0),
                        o.get("depth").as_num(1.0).clamp(0.0, 1.0),
                    ]
                })
                .collect();
        }
        if !a.get("airColor").is_null() {
            self.air_color = color(&a.get("airColor"), self.air_color);
        }
        if let Json::Str(t) = a.get("lights") {
            self.lights = t;
        }
        self.lights_gain = a.get("lightsGain").as_num(self.lights_gain);
        self.relief = a.get("relief").as_num(self.relief);
        if let Json::Str(t) = a.get("height") {
            self.height = t;
        }
        if let Json::Str(t) = a.get("heightShape") {
            self.height_shape = t;
        }
        self.height_min = a.get("heightMin").as_num(self.height_min);
        self.height_max = a.get("heightMax").as_num(self.height_max);
        self.height_detail = a.get("heightDetail").as_num(self.height_detail).max(0.0);
        self.height_scale = a.get("heightScale").as_num(self.height_scale).max(0.0);
        self.height_relief = a.get("heightRelief").as_num(self.height_relief);
        self.height_craters = a.get("heightCraters").as_num(self.height_craters).max(0.0);
        self.dust = a.get("dust").as_num(self.dust).clamp(0.0, 1.0);
        self.glint = a.get("glint").as_num(self.glint).clamp(0.0, 1.0);
        self.sea_glint = a.get("seaGlint").as_num(self.sea_glint).clamp(0.0, 1.0);
        self.regolith = a.get("regolith").as_num(self.regolith).clamp(0.0, 2.0);
        if let Json::Arr(v) = a.get("detail") {
            self.detail = v.iter().take(8).filter_map(|d| {
                let src = d.get("src").as_str();
                let w = [d.get("u0").as_num(0.0), d.get("v0").as_num(0.0), d.get("u1").as_num(1.0), d.get("v1").as_num(1.0)];
                let sun = [d.get("sun").as_num(0.0).to_radians(), d.get("shade").as_num(0.0).max(0.0)];
                // its own heights (16 bits as red * 256 + green, from heightMin to heightMax): close by the
                // ground's shape and slopes inside the window come from them
                let hs = d.get("height").as_str();
                if src.is_empty() || w[2] <= w[0] || w[3] <= w[1] { None } else { Some((src, w, sun, hs)) }
            }).collect();
        }
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

/// A ball that needs no drawing: wholly behind the camera, wholly off the
/// screen (with room for its air), or under half a pixel across, where a ball
/// drawn from its regions still cost ~34 draw calls (Solar Pilot's 27 small
/// bodies cost ~8 ms a frame on the tablet, all far away and invisible).
/// `dist` is the eye's distance from the centre, already over the radius.
fn globe_unseen(cam: &Cam3, place: &Place3, dist: f64) -> bool {
    let v = cam.view(place.centre);
    let r = place.radius;
    if v[2] < -r {
        return true;
    }
    // within a couple of radii the edge can reach round the camera: draw
    if v[2] <= r * 1.2 {
        return false;
    }
    let px = cam.focal * r / dist;
    if px < 0.5 {
        return true;
    }
    // off the screen: only for a small ball, whose outline stays near a circle
    if r / dist > 0.1 {
        return false;
    }
    let s = cam.screen(v);
    let m = px * 1.6 + 2.0;
    (s[0] as f64) < -m || (s[0] as f64) > cam.w + m || (s[1] as f64) < -m || (s[1] as f64) > cam.h + m
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

impl Globe {
    /// The surface as one sphere command (kind 8) the host fills from the
    /// texture: the disc's box on the screen and the camera in the globe's
    /// own frame, the radius 1 (see draw.rs `sphere`).
    fn render_textured(&mut self, out: &mut DrawStream, cam: &Cam3, place: &Place3, cap: &Cap, to_eye: V3, sun_local: Option<V3>) {
        let (w, h) = (cam.w, cam.h);
        // all of it behind the camera: nothing to draw
        let reach = if self.rings.is_empty() { 1.0 } else { self.ring_out };
        if -dot(to_eye, cam.fwd) < -place.radius * reach {
            return;
        }
        let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
        let mut whole = false;
        // the air round the ball is drawn in the same box: the horizon of the
        // bigger ball (or the ball's own when the eye is inside the air)
        let ka = 1.0 + self.air;
        let dist = dot(to_eye, to_eye).sqrt();
        let air_cap = if self.air > 0.0 && dist > place.radius * ka * 1.001 {
            let e1 = place.local([to_eye[0] / dist, to_eye[1] / dist, to_eye[2] / dist]);
            Some(Cap::new(e1, place.radius * ka / dist))
        } else {
            None
        };
        if self.air > 0.0 && air_cap.is_none() {
            whole = true;
        }
        // close over real ground: mountains can stand above the smooth ball's
        // horizon, and the rays are cast against the ground's shape
        let terrain = self.has_terrain();
        let near = terrain && dist < place.radius * (1.0 + TERRAIN_NEAR);
        if near {
            whole = true;
        }
        let rim: Vec<V3> = match &air_cap {
            Some(c) => c.horizon(48).iter().map(|p| [p[0] * ka, p[1] * ka, p[2] * ka]).collect(),
            None => cap.horizon(48),
        };
        // the rings reach past the ball: their outer edge in the box too
        let rings = !self.rings.is_empty();
        let ring_rim: Vec<V3> = if rings {
            (0..64).map(|i| {
                let a = i as f64 / 64.0 * std::f64::consts::TAU;
                [a.cos() * self.ring_out, a.sin() * self.ring_out, 0.0]
            }).collect()
        } else {
            Vec::new()
        };
        if rings && dist < place.radius * self.ring_out * 1.05 {
            whole = true;
        }
        for p in rim.iter().chain(ring_rim.iter()) {
            if whole {
                break;
            }
            let v = cam.view(place.world(p));
            if v[2] < cam.near {
                whole = true;
                break;
            }
            let s = cam.screen(v);
            x0 = x0.min(s[0] as f64);
            y0 = y0.min(s[1] as f64);
            x1 = x1.max(s[0] as f64);
            y1 = y1.max(s[1] as f64);
        }
        if whole {
            // the horizon goes behind the camera: the disc can fill the view
            x0 = 0.0;
            y0 = 0.0;
            x1 = w;
            y1 = h;
        } else {
            // the horizon ring is a polygon: a little margin for the round edge
            let m = 1.0 + (x1 - x0).max(y1 - y0) * 0.01;
            x0 = (x0 - m).max(0.0);
            y0 = (y0 - m).max(0.0);
            x1 = (x1 + m).min(w);
            y1 = (y1 + m).min(h);
        }
        if x1 - x0 < 0.5 || y1 - y0 < 0.5 {
            return;
        }
        let k = 1.0 / place.radius;
        let e = place.local(to_eye);
        let e = [e[0] * k, e[1] * k, e[2] * k];
        let r = place.local(cam.right);
        let u = place.local(cam.up);
        let f = place.local(cam.fwd);
        let (s, lit) = match sun_local {
            Some(s) => (s, 1.0),
            None => ([0.0, 0.0, 1.0], 0.0),
        };
        let params = [
            e[0], e[1], e[2], r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2], s[0], s[1], s[2],
            cam.focal, w, h, self.night.clamp(0.0, 1.0), lit,
        ];
        let mut params: Vec<f32> = params.iter().map(|v| *v as f32).collect();
        let flow = self.flow_params();
        let vort = self.vortex_params();
        // the 124-number form (draw.rs `sphere`): close over real ground the eye's remainder past its 32 bits (two
        // eyes 6 cm apart are then 6 cm apart on the Moon too), and the light that changes with the eye
        let view_light = self.dust > 0.0 || self.glint > 0.0 || self.sea_glint > 0.0;
        let scatter = self.air > 0.0 && self.scatter > 0.0;
        // the 128-number form: [124] the regolith's pits (only close over real ground, with the eye's remainder)
        let w128 = terrain && near && self.regolith > 0.0;
        let w124 = (terrain && near) || view_light || scatter || w128;
        let tail: [f32; 8] = [
            (e[0] - params[0] as f64) as f32, (e[1] - params[1] as f64) as f32, (e[2] - params[2] as f64) as f32,
            if scatter { self.scatter as f32 } else { 0.0 },
            self.dust as f32, self.glint as f32, self.sea_glint as f32, self.scatter_mie as f32,
        ];
        let extra = self.air > 0.0 || !self.lights.is_empty() || self.relief != 0.0 || terrain || rings || flow.is_some() || vort.is_some() || (self.hot[4] > 0.0 && self.hot[2] > 0.0) || self.star[2] > 0.0 || w124;
        // the 32-number form: [20..24] the window (here the whole map), then the air,
        // the city lights and the relief (draw.rs `sphere`)
        let more = |win: [f64; 4], use_win: f64, air: f64| -> Vec<f32> {
            let c = self.air_color;
            [win[0], win[1], win[2], win[3], use_win, air, c[0], c[1], c[2], self.lights_gain, self.relief, 0.0]
                .iter().map(|v| *v as f32).collect()
        };
        // the 40-number form: the heights (draw.rs `sphere`)
        let heights = if terrain { format!("{}|{}", self.height, self.height_shape) } else { String::new() };
        let rr = place.radius.max(1e-9);
        let scale = if self.height_scale > 0.0 { self.height_scale } else { rr / 60.0 };
        let hparams: Vec<f32> = [
            self.height_min / rr, self.height_max / rr, self.height_detail / rr, if near { 1.0 } else { 0.0 },
            self.height_relief, rr / scale, self.height_craters, 0.0,
        ].iter().map(|v| *v as f32).collect();
        if extra {
            // close over real ground, the sharper pictures' windows together (when they make one rectangle) are a
            // hole the whole ball leaves to them: its long rays are cast only around and outside it
            let hole = if terrain && near && self.detail_ok { detail_union(&self.detail) } else { None };
            params.extend(more(hole.unwrap_or([0.0, 0.0, 1.0, 1.0]), 0.0, self.air));
            if terrain {
                params.extend_from_slice(&hparams);
            } else if rings || flow.is_some() || vort.is_some() {
                params.extend_from_slice(&[0.0; 8]);
            }
            if rings {
                // the 44-number form: the rings (draw.rs `sphere`)
                params.extend_from_slice(&[self.ring_in as f32, self.ring_out as f32, 1.0, 0.0]);
            } else if flow.is_some() || vort.is_some() {
                params.extend_from_slice(&[0.0; 4]);
            }
            if let Some((amp, phase)) = flow {
                // the 48-number form: the cloud bands' drift (draw.rs `sphere`)
                params.extend_from_slice(&[amp as f32, phase as f32, 0.0, 0.0]);
            } else if vort.is_some() {
                params.extend_from_slice(&[0.0; 4]);
            }
            if let Some(v) = vort {
                // the 72-number form: the storms (draw.rs `sphere`)
                params.extend(v.iter().map(|x| *x as f32));
            }
            if self.hot[4] > 0.0 && self.hot[2] > 0.0 {
                // the 80-number form: the hot cap (the forms before it as zeros where unused: no heights
                // without their pictures, no rings, no drift, no storms), its middle as the shader's ball point
                params.resize(72, 0.0);
                let c = unit(self.hot[1], self.hot[0]);
                params.extend_from_slice(&[
                    c[0] as f32, c[1] as f32, c[2] as f32, self.hot[2].to_radians() as f32,
                    self.hot[3].to_radians() as f32, self.hot[4] as f32, 0.0, 0.0,
                ]);
            }
            if self.star[2] > 0.0 {
                // the 116-number form: a star's surface: (spots, time, granules across a radius, limb darkening),
                // then 8 × (the spot's middle on the ball, its umbra's radius in radians); unused forms as zeros
                params.resize(80, 0.0);
                let n = self.star_spots.len();
                params.extend_from_slice(&[n as f32, (self.flow_time.rem_euclid(4096.0)) as f32, self.star[0] as f32, self.star[1] as f32]);
                for i in 0..8 {
                    if let Some(sp) = self.star_spots.get(i) {
                        let c = unit(sp[1], sp[0]);
                        params.extend_from_slice(&[c[0] as f32, c[1] as f32, c[2] as f32, sp[2].to_radians() as f32]);
                    } else {
                        params.extend_from_slice(&[0.0, 0.0, 1.0, 0.0]);
                    }
                }
            }
            if w124 {
                // the 124-number form: the eye's remainder and the light (the forms before it as zeros where unused)
                params.resize(116, 0.0);
                params.extend_from_slice(&tail);
            }
            if w128 {
                params.extend_from_slice(&[self.regolith as f32, 0.0, 0.0, 0.0]);
            }
        }
        out.sphere_rings(x0, y0, x1 - x0, y1 - y0, &self.texture, &self.lights, &heights, if rings { &self.rings } else { "" }, &params);
        params.truncate(20);
        self.drawn = 1;
        if !self.detail_ok {
            return;
        }
        // the sharper pictures: the same ball once more for each, drawn by
        // the host only inside its window, in the box its part of the
        // surface takes on the screen
        let near_c0 = (cap.c0.clamp(-1.0, 1.0).acos() + (2.0 * (self.terrain_high() / rr).max(0.0)).sqrt() + 0.02).min(std::f64::consts::PI).cos();
        for (src, win, wsun, dh) in self.detail.iter() {
            let n = 8;
            let (mut a0, mut b0, mut a1, mut b1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
            let mut seen = false;
            let mut near = false;
            for i in 0..=n {
                for j in 0..=n {
                    let u = win[0] + (win[2] - win[0]) * i as f64 / n as f64;
                    let v = win[1] + (win[3] - win[1]) * j as f64 / n as f64;
                    let lon = (u - 0.5) * std::f64::consts::TAU;
                    let lat = (0.5 - v) * std::f64::consts::PI;
                    let p = [lat.cos() * lon.cos(), lat.cos() * lon.sin(), lat.sin()];
                    // close over real ground, mountains past the smooth horizon too
                    if dot(p, cap.e) >= cap.c0 || (near && dot(p, cap.e) >= near_c0) {
                        seen = true;
                    }
                    let q = cam.view(place.world(&p));
                    if q[2] < cam.near {
                        near = true;
                        continue;
                    }
                    let s = cam.screen(q);
                    a0 = a0.min(s[0] as f64);
                    b0 = b0.min(s[1] as f64);
                    a1 = a1.max(s[0] as f64);
                    b1 = b1.max(s[1] as f64);
                }
            }
            if !seen {
                continue;
            }
            let (px0, py0, px1, py1) = if near {
                (x0, y0, x1, y1)
            } else {
                // a margin for the edges between the points
                let m = 2.0 + (a1 - a0).max(b1 - b0) * 0.08;
                ((a0 - m).max(x0), (b0 - m).max(y0), (a1 + m).min(x1), (b1 + m).min(y1))
            };
            if px1 - px0 < 0.5 || py1 - py0 < 0.5 {
                continue;
            }
            let mut p = params.clone();
            if extra {
                // the air is drawn once, with the whole ball
                p.extend(more(*win, 1.0, 0.0));
                if terrain {
                    p.extend_from_slice(&hparams);
                    // the picture's own sun, for reading slopes from it close by
                    p[31] = wsun[0] as f32;
                    p[39] = wsun[1] as f32;
                }
            } else {
                p.extend(win.iter().map(|v| *v as f32));
            }
            if w124 {
                // the eye's remainder and the light (the rings, bands, storms, hot cap and star are the whole ball's)
                p.resize(116, 0.0);
                p.extend_from_slice(&tail);
            }
            if w128 {
                p.extend_from_slice(&[self.regolith as f32, 0.0, 0.0, 0.0]);
            }
            // the window's own heights: a third name, "shading|shape|window heights"
            let wh = if terrain && !dh.is_empty() { format!("{}|{}", heights, dh) } else { heights.clone() };
            out.sphere_terrain(px0, py0, px1 - px0, py1 - py0, src, &self.lights, &wh, &p);
        }
    }
}

/// The detail windows together, when they cover one rectangle of the map (u may run past 0 or 1 across the date line).
fn detail_union(detail: &[(String, [f64; 4], [f64; 2], String)]) -> Option<[f64; 4]> {
    let first = detail.first()?.1;
    let (mut a0, mut b0, mut a1, mut b1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    let mut area = 0.0;
    for (_, w, _, _) in detail.iter() {
        let mut sh = 0.0;
        if w[0] - first[0] > 0.5 {
            sh = -1.0;
        } else if w[0] - first[0] < -0.5 {
            sh = 1.0;
        }
        a0 = a0.min(w[0] + sh);
        a1 = a1.max(w[2] + sh);
        b0 = b0.min(w[1]);
        b1 = b1.max(w[3]);
        area += (w[2] - w[0]) * (w[3] - w[1]);
    }
    let whole = (a1 - a0) * (b1 - b0);
    if whole <= 0.0 || (area - whole).abs() > whole * 1e-6 || a1 - a0 >= 1.0 {
        return None;
    }
    Some([a0, b0, a1, b1])
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
    /// Real heights to draw: a map, both height pictures and a range.
    fn has_terrain(&self) -> bool {
        self.terrain_ok && !self.texture.is_empty() && !self.height.is_empty() && !self.height_shape.is_empty() && self.height_max > self.height_min
    }
    /// The lowest and highest the ground can be over the ball's radius (planet units).
    fn terrain_low(&self) -> f64 {
        let scale = if self.height_scale > 0.0 { self.height_scale } else { 1.0 };
        self.height_min - 2.0 * self.height_detail - 0.25 * self.height_craters * scale
    }
    fn terrain_high(&self) -> f64 {
        self.height_max + 2.0 * self.height_detail
    }
    /// Makes a texture path given in the game's folder absolute.
    pub fn texture_in(&mut self, dir: &str) {
        if !self.texture.is_empty() && !self.texture.starts_with('/') && !dir.is_empty() {
            self.texture = rg_core::vfs::join(dir, &self.texture);
        }
        if !self.lights.is_empty() && !self.lights.starts_with('/') && !dir.is_empty() {
            self.lights = rg_core::vfs::join(dir, &self.lights);
        }
        if !self.height.is_empty() && !self.height.starts_with('/') && !dir.is_empty() {
            self.height = rg_core::vfs::join(dir, &self.height);
        }
        if !self.height_shape.is_empty() && !self.height_shape.starts_with('/') && !dir.is_empty() {
            self.height_shape = rg_core::vfs::join(dir, &self.height_shape);
        }
        if !self.rings.is_empty() && !dir.is_empty() {
            // "colour|opacity": each in the game's folder
            self.rings = self.rings.split('|').map(|r| if r.starts_with('/') || r.is_empty() { r.to_string() } else { rg_core::vfs::join(dir, r) })
                .collect::<Vec<_>>().join("|");
        }
        if !dir.is_empty() {
            for d in self.detail.iter_mut() {
                if !d.0.starts_with('/') {
                    d.0 = rg_core::vfs::join(dir, &d.0);
                }
                if !d.3.is_empty() && !d.3.starts_with('/') {
                    d.3 = rg_core::vfs::join(dir, &d.3);
                }
            }
        }
    }

    /// The planet's own time (flowTime, the game's clock), for a game's surface shader.
    pub fn flow_time(&self) -> f64 {
        self.flow_time
    }

    pub fn render_3d(&mut self, out: &mut DrawStream, cam: &Cam3, place: &Place3, sun: Option<V3>, glowing: bool, textures: bool) {
        self.drawn = 0;
        if !self.visible {
            return;
        }
        let to_eye = [cam.eye[0] - place.centre[0], cam.eye[1] - place.centre[1], cam.eye[2] - place.centre[2]];
        // inside (or a hair over) the ball: nothing to see of it; only a little
        // over, so a camera a few metres above the ground still sees the ground
        let dist = dot(to_eye, to_eye).sqrt();
        // with real heights the ground can be below the ball's radius (a deep crater)
        let terrain = textures && !glowing && self.has_terrain();
        let floor = if terrain { (1.0 + self.terrain_low() / place.radius).min(1.000_000_5) } else { 1.000_000_5 };
        if dist <= place.radius * floor {
            return;
        }
        if !glowing && globe_unseen(cam, place, dist) {
            return;
        }
        let e = place.local([to_eye[0] / dist, to_eye[1] / dist, to_eye[2] / dist]);
        let cap = Cap::new(e, (place.radius / dist).min(0.999_999_9));
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

        // the air round it: horizons of a slightly bigger ball, only for a ball
        // drawn from its regions (or a star): a textured ball has its air in
        // the sphere's own smooth glow (`air`), or none (the flat rings showed
        // as hard steps round the Moon and Mars)
        let textured = textures && !self.texture.is_empty() && !glowing;
        if let (Some(g), false) = (self.glow, textured) {
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
        if textures && !self.texture.is_empty() {
            self.render_textured(out, cam, place, &cap, to_eye, sun_local);
            return;
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
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, false);
        assert_eq!(g.drawn, 1);
        // looking away: nothing
        let before = out.count;
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, false);
        assert_eq!(g.drawn, 0);
        assert_eq!(out.count, before);
        // just above A, looking down and looking along the ground: A is under the eye
        g.render_3d(&mut out, &cam_at([1.05, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, false);
        assert_eq!(g.drawn, 1);
        g.render_3d(&mut out, &cam_at([1.05, 0.0, 0.0], [0.0, 1.0, 0.0]), &place, None, false, false);
        assert_eq!(g.drawn, 1);
        // from the far side, B
        g.render_3d(&mut out, &cam_at([-3.0, 0.0, 0.0], [1.0, 0.0, 0.0]), &place, None, false, false);
        assert_eq!(g.drawn, 1);
    }

    #[test]
    fn a_far_tiny_or_off_screen_ball_draws_nothing() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r##"{{"regions":[["A","x",{}]],"grid":false,"glow":false,"border":false,"ocean":"#204060"}}"##, square(0.0, 0.0)));
        g.command(&a);
        let place = Place3 { centre: [0.0; 3], radius: 1.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        // 300 px focal: at 1000 radii the ball is 0.3 px across its radius: nothing
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([1000.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, false);
        assert_eq!(out.count, 0);
        // at 100 radii (3 px) it is drawn
        g.render_3d(&mut out, &cam_at([100.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, false);
        assert!(out.count > 0);
        // at 100 radii but well to the side of the view: nothing
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([100.0, 200.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, false);
        assert_eq!(out.count, 0);
        // a glowing ball (a star) far away is still drawn
        let mut out = DrawStream::new();
        g.command(&rg_core::json::parse(r##"{"glow":"#ffffff"}"##));
        g.render_3d(&mut out, &cam_at([1000.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, true, false);
        assert!(out.count > 0);
    }

    #[test]
    fn a_hot_cap_is_the_80_number_form() {
        // the sphere command (kind 8) and its numbers after the 23-number head
        fn sphere(out: &DrawStream) -> (usize, Vec<f32>) {
            let n = &out.nums;
            let i = (0..n.len().saturating_sub(23)).find(|&i| n[i] == 8.0 && [20.0, 24.0, 32.0, 80.0].contains(&n[i + 22]) && n[i + 18] >= 0.0).unwrap();
            let c = n[i + 22] as usize;
            (c, n[i + 23..i + 23 + c].to_vec())
        }
        let mut g = Globe::new();
        g.command(&rg_core::json::parse(r#"{"texture":"/p.jpg","grid":false,"border":false}"#));
        let place = Place3 { centre: [0.0; 3], radius: 1.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, true);
        assert_eq!(sphere(&out).0, 20);
        // a cap round lat 0, lon 90 (the ball's +y), 30 degrees across, soft 10, gain 1.5
        g.command(&rg_core::json::parse(r#"{"hot":{"lat":0,"lon":90,"r":30,"soft":10,"gain":1.5}}"#));
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, true);
        let (c, p) = sphere(&out);
        assert_eq!(c, 80);
        assert!(p[72].abs() < 1e-6 && (p[73] - 1.0).abs() < 1e-6 && p[74].abs() < 1e-6);
        assert!((p[75] - 30f32.to_radians()).abs() < 1e-6 && (p[76] - 10f32.to_radians()).abs() < 1e-6 && p[77] == 1.5);
        // the unused forms between are zeros: no rings, no drift, no storms
        assert!(p[42] == 0.0 && p[44] == 0.0 && p[48] == 0.0 && p[50] == 0.0);
        // false: back to the plain ball
        g.command(&rg_core::json::parse(r#"{"hot":false}"#));
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, false, true);
        assert_eq!(sphere(&out).0, 20);
    }

    #[test]
    fn a_star_is_the_116_number_form_with_its_spots() {
        fn sphere(out: &DrawStream) -> (usize, Vec<f32>) {
            let n = &out.nums;
            let i = (0..n.len().saturating_sub(23)).find(|&i| n[i] == 8.0 && [20.0, 24.0, 32.0, 80.0, 116.0].contains(&n[i + 22]) && n[i + 18] >= 0.0).unwrap();
            let c = n[i + 22] as usize;
            (c, n[i + 23..i + 23 + c].to_vec())
        }
        let mut g = Globe::new();
        g.command(&rg_core::json::parse(r#"{"texture":"/sun.jpg","grid":false,"border":false,"flowTime":12}"#));
        let place = Place3 { centre: [0.0; 3], radius: 1.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        g.command(&rg_core::json::parse(r#"{"star":{"gran":400,"limb":0.5,"spots":[{"lat":0,"lon":90,"r":2},{"lat":90,"lon":0,"r":1}]}}"#));
        let mut out = DrawStream::new();
        // drawn as a light itself (a star): no sun, still the shader's ball
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, true, true);
        let (c, p) = sphere(&out);
        assert_eq!(c, 116);
        assert_eq!(p[19], 0.0);
        assert!(p[80] == 2.0 && p[81] == 12.0 && p[82] == 400.0 && p[83] == 0.5);
        assert!(p[84].abs() < 1e-6 && (p[85] - 1.0).abs() < 1e-6 && (p[87] - 2f32.to_radians()).abs() < 1e-6);
        assert!((p[90] - 1.0).abs() < 1e-6 && p[95] == 0.0);
        // the hot cap's numbers between stay zero (off)
        assert!(p[77] == 0.0);
        g.command(&rg_core::json::parse(r#"{"star":false}"#));
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, None, true, true);
        assert_eq!(sphere(&out).0, 20);
    }

    #[test]
    fn detail_pictures_are_extra_sphere_commands_with_a_window() {
        let mut g = Globe::new();
        // windows round longitude 180 (u 0, facing -x) and round longitude 0 (u 0.5, facing +x)
        let a = rg_core::json::parse(r#"{"texture":"img/moon.jpg","grid":false,"glow":false,"border":false,
            "detail":[{"src":"img/d/0_3.jpg","u0":0.45,"v0":0.4,"u1":0.55,"v1":0.6},{"src":"img/d/9.jpg","u0":0.0,"v0":0.4,"u1":0.05,"v1":0.6}]}"#);
        g.command(&a);
        g.texture_in("/games/x");
        let place = Place3 { centre: [0.0; 3], radius: 2.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let cam = cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]);
        // a host that does not know windows: only the map
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam, &place, None, false, true);
        assert_eq!(out.count, 1);
        // with windows: the map and the picture that faces the eye, in a smaller box
        g.detail_ok = true;
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam, &place, None, false, true);
        assert_eq!(out.count, 2);
        let n = &out.nums;
        let k = 23 + n[22] as usize;
        assert_eq!(n[k], 8.0);
        assert_eq!(out.strings[n[k + 18] as usize], "/games/x/img/d/0_3.jpg");
        assert_eq!(n[k + 22], 24.0);
        assert_eq!(&n[k + 23 + 20..k + 23 + 24], &[0.45, 0.4, 0.55, 0.6]);
        assert!(n[k + 3] < n[3] * 0.6 && n[k + 4] < n[4] * 0.8, "{:?} {:?}", &n[1..5], &n[k + 1..k + 5]);
        // an empty list takes them away
        g.command(&rg_core::json::parse(r#"{"detail":[]}"#));
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam, &place, None, false, true);
        assert_eq!(out.count, 1);
    }

    #[test]
    fn rings_go_with_the_ball_as_44_numbers_and_widen_its_box() {
        let mut g = Globe::new();
        g.command(&rg_core::json::parse(r#"{"texture":"img/saturn.jpg","grid":false,"glow":false,"border":false,
            "rings":{"src":"img/rc.png|img/ra.png","inner":1.27,"outer":2.42}}"#));
        g.texture_in("/games/sp");
        let place = Place3 { centre: [0.0; 3], radius: 1.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([0.0, 0.0, 12.0], [0.0, 0.0, -1.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        assert_eq!(out.count, 1);
        let n = &out.nums;
        assert_eq!(n[22], 44.0);
        assert_eq!(&n[23 + 40..23 + 43], &[1.27f32, 2.42, 1.0]);
        assert_eq!(out.strings[n[21] as usize], "/games/sp/img/rc.png|/games/sp/img/ra.png");
        // seen from above the pole the box takes in the whole ring: 300 * 2.42 / 12 ≈ 60 px each side
        assert!(n[3] > 2.0 * 300.0 * 2.3 / 12.0, "{:?}", &n[1..5]);
    }

    #[test]
    fn a_textured_planet_is_one_sphere_command() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r#"{{"regions":[["A","x",{}]],"texture":"img/earth.jpg","grid":false,"glow":false,"border":false}}"#, square(0.0, 0.0)));
        g.command(&a);
        let place = Place3 { centre: [0.0; 3], radius: 2.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        // a host without textures: the regions
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, false);
        assert!(out.nums.iter().step_by(1).next() == Some(&6.0));
        // with textures: one kind 8 round the disc in the middle of the view
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        assert_eq!(out.count, 1);
        let n = &out.nums;
        assert_eq!(n[0], 8.0);
        assert_eq!(out.strings[n[18] as usize], "img/earth.jpg");
        // the disc: angular radius asin(2/6), on the screen 300 * tan(that) = 106 px round 200
        let half = 300.0 * (2.0f64 / 6.0).asin().tan();
        assert!((n[1] as f64 - (200.0 - half)).abs() < 4.0 && (n[3] as f64 - 2.0 * half).abs() < 8.0, "{:?}", &n[1..5]);
        assert_eq!(n[22], 20.0);
        // the eye in the ball's frame (radius 1) and the sun lights it
        assert_eq!(&n[23..26], &[3.0, 0.0, 0.0]);
        assert_eq!(n[23 + 19], 1.0);
        // just above the ground: the whole view
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([2.05, 0.0, 0.0], [0.0, 1.0, 0.0]), &place, None, false, true);
        assert_eq!(&out.nums[1..5], &[0.0, 0.0, 400.0, 400.0]);
        // behind the camera: nothing
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [1.0, 0.0, 0.0]), &place, None, false, true);
        assert_eq!(out.count, 0);
    }

    #[test]
    fn real_heights_are_40_numbers_and_the_pictures_as_string_3() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r##"{{"regions":[["A","x",{}]],"texture":"img/moon.jpg","grid":false,"border":false,"glow":false,
            "height":"img/moon-height.png","heightShape":"img/moon-shape.png","heightMin":-0.1,"heightMax":0.2,
            "heightDetail":0.004,"heightScale":0.05,"heightCraters":1}}"##, square(0.0, 0.0)));
        g.command(&a);
        g.texture_in("/games/x");
        let place = Place3 { centre: [0.0; 3], radius: 2.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        // a host that cannot draw them: the 20-number form as before
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        assert_eq!(out.nums[22], 20.0);
        g.terrain_ok = true;
        // far: the heights only shade (near = 0)
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        let n = &out.nums;
        assert_eq!(n[22], 40.0);
        assert_eq!(out.strings[n[20] as usize], "/games/x/img/moon-height.png|/games/x/img/moon-shape.png");
        let p = &n[23..63];
        assert!((p[32] + 0.05).abs() < 1e-6 && (p[33] - 0.1).abs() < 1e-6 && (p[34] - 0.002).abs() < 1e-6, "{:?}", &p[32..40]);
        assert_eq!(p[35], 0.0);
        assert!((p[37] - 40.0).abs() < 1e-4 && p[38] == 1.0);
        // close by, below the ball's radius (a deep crater): still drawn, near, the whole view
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([1.995, 0.0, 0.0], [0.0, 1.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        assert_eq!(out.count, 1);
        let n = &out.nums;
        assert_eq!(n[23 + 35], 1.0);
        assert_eq!((n[1], n[2]), (0.0, 0.0));
    }

    // a headset's two eyes 6.4 cm apart over the Moon (radius 1737.4 km, the game's units km): the 32-bit eye of a
    // sphere command is only to ~6e-8 radii (10 cm), so close by the 124-number form carries the remainder; with it
    // the eyes are 6.4 cm apart to a micrometre, and the shader's height of a point over the ball (painter.js altY,
    // here in 32 bits as on the GPU) keeps the difference between the eyes
    #[test]
    fn close_by_the_eye_is_exact_past_its_32_bits_and_the_view_light_is_sent() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(r##"{"texture":"img/moon.jpg","grid":false,"border":false,"glow":false,
            "height":"img/moon-height.png","heightShape":"img/moon-shape.png","heightMin":-9,"heightMax":10.7,
            "dust":0.8,"glint":0.5,"seaGlint":0.25,
            "detail":[{"src":"img/d/0_3.jpg","u0":0.0,"v0":0.0,"u1":1.0,"v1":1.0}]}"##);
        g.command(&a);
        g.texture_in("/games/x");
        g.terrain_ok = true;
        g.detail_ok = true;
        let rr = 1737.4;
        let place = Place3 { centre: [0.0; 3], radius: rr, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        // 2 m over the ground at an odd place, looking along it; the eyes 6.4 cm apart along the camera's right
        let up = [0.48, -0.6, 0.64];
        let fwd = { let f = [0.6, 0.8, 0.0]; let k = dot(f, up); let v = [f[0] - up[0] * k, f[1] - up[1] * k, f[2] - up[2] * k]; let l = dot(v, v).sqrt(); [v[0] / l, v[1] / l, v[2] / l] };
        let head = [up[0] * (rr + 0.002), up[1] * (rr + 0.002), up[2] * (rr + 0.002)];
        let mut eyes = Vec::new();
        let mut cams = Vec::new();
        for s in [-1.0, 1.0] {
            let mut c = cam_at(head, fwd);
            for i in 0..3 {
                c.eye[i] += c.right[i] * 0.000032 * s;
            }
            let mut out = DrawStream::new();
            g.render_3d(&mut out, &c, &place, Some([0.3, 0.2, 0.9]), false, true);
            let n = out.nums.clone();
            // every command (the ball and its window) has the 124 numbers
            let mut i = 0;
            let mut ps = Vec::new();
            while i < n.len() {
                let k = n[i + 22] as usize;
                if n[i] == 8.0 {
                    ps.push(n[i + 23..i + 23 + k].to_vec());
                }
                i += 23 + k;
            }
            assert_eq!(ps.len(), 2, "the ball and its window");
            for p in &ps {
                assert_eq!(p.len(), 124);
                assert!((p[120] - 0.8).abs() < 1e-6 && (p[121] - 0.5).abs() < 1e-6 && (p[122] - 0.25).abs() < 1e-6, "{:?}", &p[116..124]);
            }
            assert_eq!(ps[1][24], 1.0, "the window is still a window");
            eyes.push(ps[0].clone());
            cams.push(c);
        }
        let exact = |p: &Vec<f32>| -> V3 { [p[0] as f64 + p[116] as f64, p[1] as f64 + p[117] as f64, p[2] as f64 + p[118] as f64] };
        let sep = |a: V3, b: V3| -> f64 { let d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; dot(d, d).sqrt() * rr * 1e5 };
        let truth = 6.4;
        let with = sep(exact(&eyes[0]), exact(&eyes[1]));
        assert!((with - truth).abs() < 1e-4, "the eyes {} cm apart", with);
        for (p, c) in eyes.iter().zip(cams.iter()) {
            let e = exact(p);
            for i in 0..3 {
                assert!((e[i] - c.eye[i] / rr).abs() < 1e-12, "{} {}", e[i], c.eye[i] / rr);
            }
        }
        // the shader's sums in 32 bits: a point 3 m ahead along the ray through the middle, its height over the ball
        // (painter.js altY), from each eye, against the true one
        let alt32 = |p: &Vec<f32>, d: [f32; 3], t: f32| -> f64 {
            let eye = [p[0], p[1], p[2]];
            let ek = (p[0] as f64 * p[0] as f64 + p[1] as f64 * p[1] as f64 + p[2] as f64 * p[2] as f64 - 1.0) as f32;
            let y = [p[116] + d[0] * t, p[117] + d[1] * t, p[118] + d[2] * t];
            let m = ek + 2.0 * (eye[0] * y[0] + eye[1] * y[1] + eye[2] * y[2]) + (y[0] * y[0] + y[1] * y[1] + y[2] * y[2]);
            (m / ((1.0 + m).max(0.0).sqrt() + 1.0)) as f64
        };
        let old32 = |p: &Vec<f32>, d: [f32; 3], t: f32| -> f64 {
            let x = [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
            ((x[0] * x[0] + x[1] * x[1] + x[2] * x[2]).sqrt() - 1.0) as f64
        };
        let t = 0.003 / rr;
        let mut worst_new: f64 = 0.0;
        let mut worst_old: f64 = 0.0;
        for (p, c) in eyes.iter().zip(cams.iter()) {
            // a little down from ahead, as a ray to the ground
            let d = { let v = [c.fwd[0] - c.up[0] * 0.3, c.fwd[1] - c.up[1] * 0.3, c.fwd[2] - c.up[2] * 0.3]; let l = dot(v, v).sqrt(); [v[0] / l, v[1] / l, v[2] / l] };
            let x = [c.eye[0] / rr + d[0] * t, c.eye[1] / rr + d[1] * t, c.eye[2] / rr + d[2] * t];
            let truth = dot(x, x).sqrt() - 1.0;
            let df = [d[0] as f32, d[1] as f32, d[2] as f32];
            worst_new = worst_new.max((alt32(p, df, t as f32) - truth).abs() * rr * 1e5);
            worst_old = worst_old.max((old32(p, df, t as f32) - truth).abs() * rr * 1e5);
        }
        assert!(worst_new < 0.05, "the height off by {} cm", worst_new);
        assert!(worst_old > 1.0, "the 32-bit sum was off by {} cm (the test would not tell)", worst_old);
        // far off, without the light options: as before (no 124 numbers)
        let mut g2 = Globe::new();
        g2.command(&rg_core::json::parse(r##"{"texture":"img/moon.jpg","grid":false,"border":false,"glow":false,
            "height":"img/moon-height.png","heightShape":"img/moon-shape.png","heightMin":-9,"heightMax":10.7}"##));
        g2.texture_in("/games/x");
        g2.terrain_ok = true;
        let mut out = DrawStream::new();
        g2.render_3d(&mut out, &cam_at([rr * 3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([1.0, 0.0, 0.0]), false, true);
        assert_eq!(out.nums[22], 40.0);
    }

    // the regolith's pits: close over real ground the ball and each window get 128 numbers, [124] the strength;
    // far off nothing is added
    #[test]
    fn close_by_the_regolith_goes_in_the_128_number_form() {
        let mut g = Globe::new();
        g.command(&rg_core::json::parse(r##"{"texture":"img/moon.jpg","grid":false,"border":false,"glow":false,
            "height":"img/moon-height.png","heightShape":"img/moon-shape.png","heightMin":-9,"heightMax":10.7,"regolith":0.7,
            "detail":[{"src":"img/d/0_3.jpg","u0":0.0,"v0":0.0,"u1":1.0,"v1":1.0}]}"##));
        g.texture_in("/games/x");
        g.terrain_ok = true;
        g.detail_ok = true;
        let rr = 1737.4;
        let place = Place3 { centre: [0.0; 3], radius: rr, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let mut sizes = |eye: V3, fwd: V3| -> Vec<Vec<f32>> {
            let mut out = DrawStream::new();
            g.render_3d(&mut out, &cam_at(eye, fwd), &place, Some([0.3, 0.2, 0.9]), false, true);
            let n = out.nums;
            let (mut i, mut ps) = (0, Vec::new());
            while i < n.len() {
                let k = n[i + 22] as usize;
                if n[i] == 8.0 {
                    ps.push(n[i + 23..i + 23 + k].to_vec());
                }
                i += 23 + k;
            }
            ps
        };
        let near = sizes([0.0, 0.0, rr + 0.002], [1.0, 0.0, 0.0]);
        assert_eq!(near.len(), 2, "the ball and its window");
        for p in &near {
            assert_eq!(p.len(), 128);
            assert!((p[124] - 0.7).abs() < 1e-6);
        }
        let far = sizes([rr * 3.0, 0.0, 0.0], [-1.0, 0.0, 0.0]);
        assert!(far.iter().all(|p| p.len() < 128));
    }

    #[test]
    fn a_detail_window_with_its_own_heights_names_them_third() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(r##"{"texture":"img/moon.jpg","grid":false,"border":false,"glow":false,
            "height":"img/moon-height.png","heightShape":"img/moon-shape.png","heightMin":-0.1,"heightMax":0.2,
            "detail":[{"src":"img/d/0_3.jpg","u0":0.45,"v0":0.4,"u1":0.55,"v1":0.6,"height":"img/h/0_3.webp"},
                      {"src":"img/d/1_3.jpg","u0":0.55,"v0":0.4,"u1":0.65,"v1":0.6}]}"##);
        g.command(&a);
        g.texture_in("/games/x");
        g.terrain_ok = true;
        g.detail_ok = true;
        let place = Place3 { centre: [0.0; 3], radius: 2.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        let names: Vec<&str> = out.strings.iter().map(|s| s.as_str()).filter(|s| s.contains('|')).collect();
        assert!(names.contains(&"/games/x/img/moon-height.png|/games/x/img/moon-shape.png|/games/x/img/h/0_3.webp"), "{:?}", names);
        assert!(names.contains(&"/games/x/img/moon-height.png|/games/x/img/moon-shape.png"), "{:?}", names);
    }

    #[test]
    fn a_textured_planet_with_air_and_lights() {
        let mut g = Globe::new();
        let a = rg_core::json::parse(&format!(r##"{{"regions":[["A","x",{}]],"texture":"img/earth.jpg","grid":false,"border":false,
            "air":0.1,"airColor":"#4f8fff","lights":"img/night.jpg","lightsGain":1.5,"relief":0.2}}"##, square(0.0, 0.0)));
        g.command(&a);
        g.texture_in("/games/x");
        let place = Place3 { centre: [0.0; 3], radius: 2.0, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] };
        let mut out = DrawStream::new();
        g.render_3d(&mut out, &cam_at([6.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), &place, Some([10.0, 0.0, 0.0]), false, true);
        // one sphere command (the air is in it, not glow rings): 32 numbers, the lights as string 2
        assert_eq!(out.count, 1);
        let n = &out.nums;
        assert_eq!(n[0], 8.0);
        assert_eq!(out.strings[n[19] as usize], "/games/x/img/night.jpg");
        assert_eq!(n[22], 32.0);
        let p = &n[23..55];
        assert_eq!(&p[20..25], &[0.0, 0.0, 1.0, 1.0, 0.0]);
        assert!((p[25] - 0.1).abs() < 1e-6 && (p[29] - 1.5).abs() < 1e-6 && (p[30] - 0.2).abs() < 1e-6);
        // the box takes in the air: wider than the disc alone
        let half = 300.0 * (2.0f64 / 6.0).asin().tan();
        assert!((n[3] as f64) > 2.0 * half + 10.0, "{:?}", &n[1..5]);
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