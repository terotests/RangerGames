// SPDX-License-Identifier: AGPL-3.0-or-later
//! Water and sand (rg.sim): a grid of cells simulated here in Rust, so a
//! slow phone only paints the result.
//!
//! - **Water** is a mass per cell that flows down, sideways and, when a cell
//!   is pressed fuller than 1 by the water above it, up (W. Shadow's
//!   compressible cellular water). The slight compression is the pressure:
//!   it makes water rise in the other arm of a U-tube until both surfaces
//!   are at the same height (communicating vessels).
//! - **Sand** is grains that fall (faster the longer they fall), slide down
//!   the sides of a pile, sink through water pushing the water up, and turn
//!   wet next to water (a wet grain slides less, so wet sand piles steeper).
//!   Running water wears it slowly: a grain the stream touches is carried
//!   downstream now and then (erosion); still water leaves it alone.
//! - **Wheels** (hyrrät) are blades that are walls for the water and sand.
//!   The weight of what lies on a blade and the push of water beside it
//!   turn the wheel; a turning blade scoops what it sweeps into.
//! - **Valves** are walls that open and close, **pipes** are tiles with a
//!   channel through them that turn (I, L, T and +), **sources** pour,
//!   **drains** swallow and count, and **zones** measure the water in them.
//!
//! Positions are in the game's pixels; the grid has `cell` pixels a cell.
//!
//! ```text
//! rg.sim("init",   { x, y, w, h, cell, background: [top, bottom], water, deep, sand })
//! rg.sim("rect",   { x, y, w, h, mat: "wall" | "mesh" | "empty" | "sand" | "water", color })
//! rg.sim("line",   { x0, y0, x1, y1, width, mat, color })
//! rg.sim("circle", { x, y, r, mat, color })
//! rg.sim("pour",   { x, y, r, mat: "water" | "sand", amount })   // amount 0..1 a cell
//! rg.sim("erase",  { x, y, r })               // water and sand only
//! rg.sim("wheel",  { id, x, y, r, blades, color })
//! rg.sim("valve",  { id, x, y, w, h, open, color })   // later calls: { id, open }
//! rg.sim("pipe",   { id, x, y, size, shape: "I" | "L" | "T" | "+", rot, color })
//! rg.sim("source", { id, x, y, w, mat, rate, on })   // rate: cells a second
//! rg.sim("drain",  { id, x, y, w, h })
//! rg.sim("zone",   { id, x, y, w, h })
//! rg.sim("remove", { id })  rg.sim("clearFluid")  rg.sim("clear")
//!
//! rg.simState = { wheels: { id: { angle, speed, turns } },
//!                 zones: { id: { water, sand, level } },     // level: px of water from the bottom
//!                 drains: { id: { water, sand } }, water, sand }
//! ```

use crate::draw::DrawStream;
use crate::scene3d::color;
use rg_core::json::{member, Json};

const EMPTY: u8 = 0;
const WALL: u8 = 1;
const SAND: u8 = 2;
/// a sieve: water goes through, sand does not
const MESH: u8 = 3;

const MAX_MASS: f32 = 1.0;
const MAX_COMPRESS: f32 = 0.01;
const MIN_FLOW: f32 = 0.005;
const MAX_SPEED: f32 = 1.0;
/// erosion: the current (smoothed flow, cells of water a step) below which
/// water does not move sand, and how fast it carries grains above that
const EROSION_START: f32 = 0.15;
const EROSION_RATE: f64 = 0.05;
/// what is left in a cell below this evaporates (no endless thin film)
const DRY: f32 = 0.002;
/// the simulation's step; frames run as many as their time needs (at most 3)
const TICK: f64 = 1.0 / 60.0;

type Rgb = [f64; 3];

struct Wheel {
    id: String,
    cx: f64,
    cy: f64,
    r: f64,
    blades: usize,
    angle: f64,
    speed: f64,
    turns: f64,
    cells: Vec<usize>,
    color: u8,
}

struct Valve {
    id: String,
    cells: Vec<usize>,
    open: bool,
    color: u8,
}

struct Pipe {
    id: String,
    cells: Vec<usize>,
}

struct Source {
    id: String,
    x0: usize,
    x1: usize,
    y: usize,
    sand: bool,
    rate: f64,
    on: bool,
    acc: f64,
}

struct Area {
    id: String,
    x0: usize,
    y0: usize,
    x1: usize,
    y1: usize,
    water: f64,
    sand: f64,
}

pub struct Sim {
    pub active: bool,
    w: usize,
    h: usize,
    cs: f64,
    ox: f64,
    oy: f64,
    mat: Vec<u8>,
    /// a wall's palette index; a grain's shade
    col: Vec<u8>,
    wet: Vec<u8>,
    /// a falling grain's speed in cells a step
    vel: Vec<u8>,
    blade: Vec<bool>,
    mass: Vec<f32>,
    next: Vec<f32>,
    /// how fast water moves through a cell, smoothed over a few steps:
    /// sideways (signed, + = right) and falling down; erosion reads them
    drift: Vec<f32>,
    fall: Vec<f32>,
    /// the pressure step's labels of water bodies
    label: Vec<u32>,
    palette: Vec<Rgb>,
    wheels: Vec<Wheel>,
    valves: Vec<Valve>,
    pipes: Vec<Pipe>,
    sources: Vec<Source>,
    drains: Vec<Area>,
    zones: Vec<Area>,
    seed: u32,
    tick: u64,
    acc: f64,
    background: Option<(Rgb, Rgb)>,
    water_rgb: Rgb,
    deep_rgb: Rgb,
    sand_rgb: Rgb,
    /// rects drawn in the last frame (tests, tuning)
    pub drawn: usize,
}

fn lerp3(a: Rgb, b: Rgb, t: f64) -> Rgb {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

fn shade(c: Rgb, k: f64) -> Rgb {
    [(c[0] * k).min(1.0), (c[1] * k).min(1.0), (c[2] * k).min(1.0)]
}

fn pack(c: Rgb) -> u32 {
    let q = |v: f64| ((v.clamp(0.0, 1.0) * 255.0).round() as u32) & 255;
    1 << 24 | q(c[0]) << 16 | q(c[1]) << 8 | q(c[2])
}

fn unpack(k: u32) -> Rgb {
    [((k >> 16) & 255) as f64 / 255.0, ((k >> 8) & 255) as f64 / 255.0, (k & 255) as f64 / 255.0]
}

/// The water a cell holds when `total` is shared between it and the cell
/// below: the lower one holds a little more (it is pressed).
fn stable(total: f32) -> f32 {
    if total <= MAX_MASS {
        MAX_MASS
    } else if total < 2.0 * MAX_MASS + MAX_COMPRESS {
        (MAX_MASS * MAX_MASS + total * MAX_COMPRESS) / (MAX_MASS + MAX_COMPRESS)
    } else {
        (total + MAX_COMPRESS) / 2.0
    }
}

impl Sim {
    pub fn new() -> Sim {
        Sim {
            active: false,
            w: 0,
            h: 0,
            cs: 3.0,
            ox: 0.0,
            oy: 0.0,
            mat: Vec::new(),
            col: Vec::new(),
            wet: Vec::new(),
            vel: Vec::new(),
            blade: Vec::new(),
            mass: Vec::new(),
            next: Vec::new(),
            drift: Vec::new(),
            fall: Vec::new(),
            label: Vec::new(),
            palette: vec![[0.35, 0.38, 0.45]],
            wheels: Vec::new(),
            valves: Vec::new(),
            pipes: Vec::new(),
            sources: Vec::new(),
            drains: Vec::new(),
            zones: Vec::new(),
            seed: 12345,
            tick: 0,
            acc: 0.0,
            background: None,
            water_rgb: [0.27, 0.62, 0.95],
            deep_rgb: [0.06, 0.25, 0.62],
            sand_rgb: [0.91, 0.77, 0.45],
            drawn: 0,
        }
    }

    fn rand(&mut self) -> u32 {
        // xorshift: the same on every platform, so tests see the same thing
        let mut x = self.seed;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.seed = x;
        x
    }

    fn chance(&mut self, p: f64) -> bool {
        (self.rand() % 10000) as f64 / 10000.0 < p
    }

    /// Can water be in cell `i`?
    fn wet_ok(&self, i: usize) -> bool {
        self.mat[i] == EMPTY || self.mat[i] == MESH
    }

    fn cell_x(&self, px: f64) -> i64 {
        ((px - self.ox) / self.cs).floor() as i64
    }

    fn cell_y(&self, py: f64) -> i64 {
        ((py - self.oy) / self.cs).floor() as i64
    }

    fn idx(&self, x: i64, y: i64) -> Option<usize> {
        if x < 0 || y < 0 || x >= self.w as i64 || y >= self.h as i64 {
            None
        } else {
            Some(y as usize * self.w + x as usize)
        }
    }

    fn palette_index(&mut self, v: &Json) -> u8 {
        if v.is_null() {
            return 0;
        }
        let c = color(v, self.palette[0]);
        for (i, p) in self.palette.iter().enumerate() {
            if pack(*p) == pack(c) {
                return i as u8;
            }
        }
        if self.palette.len() >= 255 {
            return 0;
        }
        self.palette.push(c);
        (self.palette.len() - 1) as u8
    }

    /// Cell `i` becomes a wall: its water and sand move to a free neighbour
    /// (towards `prefer` first, a cell offset), or are lost when there is none.
    fn solidify(&mut self, i: usize, prefer: Option<(i64, i64)>, color: u8) {
        let w = self.w as i64;
        let (x, y) = ((i % self.w) as i64, (i / self.w) as i64);
        let mut order: Vec<(i64, i64)> = Vec::with_capacity(5);
        if let Some(p) = prefer {
            order.push(p);
        }
        order.extend_from_slice(&[(0, -1), (-1, 0), (1, 0), (0, 1)]);
        let had_sand = self.mat[i] == SAND;
        let m = self.mass[i];
        if had_sand || m > 0.0 {
            for (dx, dy) in order {
                if let Some(j) = self.idx(x + dx, y + dy) {
                    if self.mat[j] != EMPTY {
                        continue;
                    }
                    if had_sand {
                        if self.mass[j] > 0.5 {
                            continue;
                        }
                        self.mat[j] = SAND;
                        self.col[j] = self.col[i];
                        self.wet[j] = self.wet[i];
                        self.vel[j] = 0;
                        self.mass[i] += self.mass[j];
                        self.mass[j] = 0.0;
                        break;
                    } else {
                        self.mass[j] += m;
                        self.mass[i] = 0.0;
                        break;
                    }
                }
            }
            let _ = w;
        }
        self.mat[i] = WALL;
        self.col[i] = color;
        self.mass[i] = 0.0;
        self.wet[i] = 0;
    }

    fn set_cell(&mut self, i: usize, mat: &str, color: u8) {
        if self.blade[i] {
            return;
        }
        match mat {
            "wall" => self.solidify(i, None, color),
            "mesh" => {
                if self.mat[i] == SAND {
                    self.mat[i] = EMPTY;
                }
                self.mat[i] = MESH;
                self.col[i] = color;
                self.wet[i] = 0;
            }
            "sand" => {
                if self.mat[i] == EMPTY {
                    self.mat[i] = SAND;
                    self.col[i] = (self.rand() % 4) as u8;
                    self.wet[i] = 0;
                    self.vel[i] = 0;
                    self.mass[i] = 0.0;
                }
            }
            "water" => {
                if self.mat[i] == EMPTY {
                    self.mass[i] = self.mass[i].max(1.0);
                }
            }
            _ => {
                self.mat[i] = EMPTY;
                self.mass[i] = 0.0;
                self.wet[i] = 0;
            }
        }
    }

    fn cells_rect(&self, x: f64, y: f64, w: f64, h: f64) -> Vec<usize> {
        let mut out = Vec::new();
        let (x0, y0) = (self.cell_x(x), self.cell_y(y));
        let (x1, y1) = (self.cell_x(x + w - 0.01), self.cell_y(y + h - 0.01));
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                if let Some(i) = self.idx(cx, cy) {
                    out.push(i);
                }
            }
        }
        out
    }

    fn cells_disc(&self, x: f64, y: f64, r: f64) -> Vec<usize> {
        let mut out = Vec::new();
        let rc = r / self.cs;
        let (cx, cy) = ((x - self.ox) / self.cs, (y - self.oy) / self.cs);
        let n = rc.ceil() as i64 + 1;
        for dy in -n..=n {
            for dx in -n..=n {
                let px = cx.floor() as i64 + dx;
                let py = cy.floor() as i64 + dy;
                let ddx = px as f64 + 0.5 - cx;
                let ddy = py as f64 + 0.5 - cy;
                if ddx * ddx + ddy * ddy <= rc * rc + 0.25 {
                    if let Some(i) = self.idx(px, py) {
                        out.push(i);
                    }
                }
            }
        }
        out
    }

    fn cells_line(&self, x0: f64, y0: f64, x1: f64, y1: f64, width: f64) -> Vec<usize> {
        let mut out = Vec::new();
        let len = ((x1 - x0).powi(2) + (y1 - y0).powi(2)).sqrt();
        let steps = (len / (self.cs * 0.5)).ceil().max(1.0) as usize;
        let r = (width / 2.0).max(self.cs * 0.5);
        for s in 0..=steps {
            let t = s as f64 / steps as f64;
            for i in self.cells_disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r) {
                out.push(i);
            }
        }
        out.sort_unstable();
        out.dedup();
        out
    }

    fn area(&self, a: &Json) -> Area {
        let x = a.get("x").as_num(0.0);
        let y = a.get("y").as_num(0.0);
        let w = a.get("w").as_num(self.cs);
        let h = a.get("h").as_num(self.cs);
        let cl = |v: i64, n: usize| v.clamp(0, n as i64 - 1) as usize;
        Area {
            id: a.get("id").as_str(),
            x0: cl(self.cell_x(x), self.w),
            y0: cl(self.cell_y(y), self.h),
            x1: cl(self.cell_x(x + w - 0.01), self.w),
            y1: cl(self.cell_y(y + h - 0.01), self.h),
            water: 0.0,
            sand: 0.0,
        }
    }

    fn remove(&mut self, id: &str) {
        if let Some(k) = self.wheels.iter().position(|w| w.id == id) {
            let wh = self.wheels.remove(k);
            for i in wh.cells {
                self.blade[i] = false;
                self.mat[i] = EMPTY;
            }
        }
        if let Some(k) = self.valves.iter().position(|v| v.id == id) {
            let v = self.valves.remove(k);
            for i in v.cells {
                self.mat[i] = EMPTY;
            }
        }
        if let Some(k) = self.pipes.iter().position(|p| p.id == id) {
            let p = self.pipes.remove(k);
            for i in p.cells {
                self.mat[i] = EMPTY;
            }
        }
        self.sources.retain(|s| s.id != id);
        self.drains.retain(|s| s.id != id);
        self.zones.retain(|s| s.id != id);
    }

    pub fn command(&mut self, op: &str, a: &Json) {
        if op == "init" {
            let cs = a.get("cell").as_num(3.0).max(1.0);
            let w = a.get("w").as_num(360.0);
            let h = a.get("h").as_num(640.0);
            self.cs = cs;
            self.ox = a.get("x").as_num(0.0);
            self.oy = a.get("y").as_num(0.0);
            self.w = ((w / cs).floor() as usize).clamp(2, 1000);
            self.h = ((h / cs).floor() as usize).clamp(2, 1000);
            let n = self.w * self.h;
            self.mat = vec![EMPTY; n];
            self.col = vec![0; n];
            self.wet = vec![0; n];
            self.vel = vec![0; n];
            self.blade = vec![false; n];
            self.mass = vec![0.0; n];
            self.next = vec![0.0; n];
            self.drift = vec![0.0; n];
            self.fall = vec![0.0; n];
            self.palette = vec![[0.35, 0.38, 0.45]];
            self.wheels.clear();
            self.valves.clear();
            self.pipes.clear();
            self.sources.clear();
            self.drains.clear();
            self.zones.clear();
            self.tick = 0;
            self.acc = 0.0;
            self.seed = 12345;
            let bg = a.get("background").items();
            self.background = if bg.len() >= 2 {
                Some((color(&bg[0], [1.0; 3]), color(&bg[1], [1.0; 3])))
            } else if !a.get("background").is_null() {
                let c = color(&a.get("background"), [1.0; 3]);
                Some((c, c))
            } else {
                None
            };
            self.water_rgb = color(&a.get("water"), [0.27, 0.62, 0.95]);
            self.deep_rgb = color(&a.get("deep"), [0.06, 0.25, 0.62]);
            self.sand_rgb = color(&a.get("sand"), [0.91, 0.77, 0.45]);
            self.active = true;
            return;
        }
        if op == "clear" {
            self.active = false;
            self.w = 0;
            self.h = 0;
            self.mat.clear();
            self.mass.clear();
            self.wheels.clear();
            self.valves.clear();
            self.pipes.clear();
            self.sources.clear();
            self.drains.clear();
            self.zones.clear();
            return;
        }
        if !self.active {
            return;
        }
        let mat = a.get("mat").as_str();
        match op {
            "clearFluid" => {
                for i in 0..self.mat.len() {
                    self.mass[i] = 0.0;
                    if self.mat[i] == SAND {
                        self.mat[i] = EMPTY;
                    }
                }
                for d in self.drains.iter_mut() {
                    d.water = 0.0;
                    d.sand = 0.0;
                }
            }
            "rect" => {
                let c = self.palette_index(&a.get("color"));
                let cells = self.cells_rect(a.get("x").as_num(0.0), a.get("y").as_num(0.0), a.get("w").as_num(0.0), a.get("h").as_num(0.0));
                for i in cells {
                    self.set_cell(i, &mat, c);
                }
            }
            "line" => {
                let c = self.palette_index(&a.get("color"));
                let cells = self.cells_line(
                    a.get("x0").as_num(0.0),
                    a.get("y0").as_num(0.0),
                    a.get("x1").as_num(0.0),
                    a.get("y1").as_num(0.0),
                    a.get("width").as_num(self.cs),
                );
                for i in cells {
                    self.set_cell(i, &mat, c);
                }
            }
            "circle" => {
                let c = self.palette_index(&a.get("color"));
                let cells = self.cells_disc(a.get("x").as_num(0.0), a.get("y").as_num(0.0), a.get("r").as_num(0.0));
                for i in cells {
                    self.set_cell(i, &mat, c);
                }
            }
            "pour" => {
                let amount = a.get("amount").as_num(0.5);
                let cells = self.cells_disc(a.get("x").as_num(0.0), a.get("y").as_num(0.0), a.get("r").as_num(self.cs * 2.0));
                for i in cells {
                    if self.mat[i] != EMPTY {
                        continue;
                    }
                    if mat == "sand" {
                        if self.mass[i] < 0.5 && self.chance(amount) {
                            self.set_cell(i, "sand", 0);
                        }
                    } else if self.mass[i] < 1.0 {
                        self.mass[i] = (self.mass[i] + amount as f32).min(1.0);
                    }
                }
            }
            "erase" => {
                let cells = self.cells_disc(a.get("x").as_num(0.0), a.get("y").as_num(0.0), a.get("r").as_num(self.cs * 2.0));
                for i in cells {
                    self.mass[i] = 0.0;
                    if self.mat[i] == SAND {
                        self.mat[i] = EMPTY;
                    }
                }
            }
            "wheel" => {
                let id = a.get("id").as_str();
                self.remove(&id);
                let color = self.palette_index(&a.get("color"));
                self.wheels.push(Wheel {
                    id,
                    cx: (a.get("x").as_num(0.0) - self.ox) / self.cs,
                    cy: (a.get("y").as_num(0.0) - self.oy) / self.cs,
                    r: (a.get("r").as_num(30.0) / self.cs).max(3.0),
                    blades: (a.get("blades").as_num(6.0) as usize).clamp(2, 16),
                    angle: a.get("angle").as_num(0.0),
                    speed: 0.0,
                    turns: 0.0,
                    cells: Vec::new(),
                    color,
                });
                let k = self.wheels.len() - 1;
                self.place_wheel(k);
            }
            "valve" => {
                let id = a.get("id").as_str();
                let open = a.get("open").as_bool();
                if let Some(k) = self.valves.iter().position(|v| v.id == id) {
                    self.set_valve(k, open);
                } else {
                    let color = self.palette_index(&a.get("color"));
                    let cells = self.cells_rect(a.get("x").as_num(0.0), a.get("y").as_num(0.0), a.get("w").as_num(0.0), a.get("h").as_num(0.0));
                    self.valves.push(Valve { id, cells, open: !open, color });
                    let k = self.valves.len() - 1;
                    self.set_valve(k, open);
                }
            }
            "pipe" => self.pipe(a),
            "source" => {
                let id = a.get("id").as_str();
                if let Some(s) = self.sources.iter_mut().find(|s| s.id == id) {
                    if a.has("on") {
                        s.on = a.get("on").as_bool();
                    }
                    if a.has("rate") {
                        s.rate = a.get("rate").as_num(s.rate);
                    }
                    if a.has("mat") {
                        s.sand = mat == "sand";
                    }
                    if !a.has("x") {
                        return;
                    }
                }
                self.sources.retain(|s| s.id != id);
                let ar = self.area(&json_area(a, self.cs));
                self.sources.push(Source {
                    id,
                    x0: ar.x0,
                    x1: ar.x1,
                    y: ar.y0,
                    sand: mat == "sand",
                    rate: a.get("rate").as_num(30.0),
                    on: !a.has("on") || a.get("on").as_bool(),
                    acc: 0.0,
                });
            }
            "drain" => {
                let ar = self.area(a);
                self.drains.retain(|d| d.id != ar.id);
                self.drains.push(ar);
            }
            "zone" => {
                let ar = self.area(a);
                self.zones.retain(|d| d.id != ar.id);
                self.zones.push(ar);
            }
            "remove" => {
                let id = a.get("id").as_str();
                self.remove(&id);
            }
            _ => {}
        }
    }

    fn set_valve(&mut self, k: usize, open: bool) {
        if self.valves[k].open == open {
            return;
        }
        self.valves[k].open = open;
        let cells = self.valves[k].cells.clone();
        let color = self.valves[k].color;
        for i in cells {
            if self.blade[i] {
                continue;
            }
            if open {
                if self.mat[i] == WALL {
                    self.mat[i] = EMPTY;
                }
            } else {
                self.solidify(i, None, color);
            }
        }
    }

    /// A pipe tile: walls around a channel that opens on some of its four
    /// sides. The same id again turns or changes it; water in the way moves.
    fn pipe(&mut self, a: &Json) {
        let id = a.get("id").as_str();
        let color = self.palette_index(&a.get("color"));
        let old: Vec<usize> = self.pipes.iter().find(|p| p.id == id).map(|p| p.cells.clone()).unwrap_or_default();
        self.pipes.retain(|p| p.id != id);
        let size = a.get("size").as_num(self.cs * 12.0);
        let n = ((size / self.cs).round() as i64).max(5);
        let x0 = self.cell_x(a.get("x").as_num(0.0));
        let y0 = self.cell_y(a.get("y").as_num(0.0));
        // open sides: N E S W, turned clockwise `rot` quarter turns
        let base: [bool; 4] = match a.get("shape").as_str().as_str() {
            "L" => [true, true, false, false],
            "T" => [false, true, true, true],
            "+" => [true, true, true, true],
            "-" => [false, true, false, true],
            _ => [true, false, true, false],
        };
        let rot = ((a.get("rot").as_num(0.0).round() as i64 % 4) + 4) % 4;
        let mut open = [false; 4];
        for s in 0..4 {
            open[((s as i64 + rot) % 4) as usize] = base[s];
        }
        let t = ((a.get("thick").as_num(self.cs * 2.0) / self.cs).round() as i64).max(1);
        // the channel: a middle square and arms to the open sides
        let c0 = (n - (n / 2)) / 2;
        let c1 = c0 + n / 2 - 1;
        let channel = |x: i64, y: i64| -> bool {
            let mid_x = x >= c0 && x <= c1;
            let mid_y = y >= c0 && y <= c1;
            (mid_x && mid_y)
                || (open[0] && mid_x && y <= c1)
                || (open[2] && mid_x && y >= c0)
                || (open[3] && mid_y && x <= c1)
                || (open[1] && mid_y && x >= c0)
        };
        // the cells it had become free first (a turn moves the walls)
        for i in old.iter() {
            if self.mat[*i] == WALL && !self.blade[*i] {
                self.mat[*i] = EMPTY;
            }
        }
        let mut cells = Vec::new();
        for y in 0..n {
            for x in 0..n {
                if channel(x, y) {
                    continue;
                }
                let mut near = false;
                for dy in -t..=t {
                    for dx in -t..=t {
                        let (px, py) = (x + dx, y + dy);
                        if px >= 0 && py >= 0 && px < n && py < n && channel(px, py) {
                            near = true;
                        }
                    }
                }
                if near {
                    if let Some(i) = self.idx(x0 + x, y0 + y) {
                        if self.blade[i] {
                            continue;
                        }
                        // water in the way goes towards the channel's middle
                        let mx = if x < c0 { 1 } else if x > c1 { -1 } else { 0 };
                        let my = if y < c0 { 1 } else if y > c1 { -1 } else { 0 };
                        self.solidify(i, Some((mx, my)), color);
                        cells.push(i);
                    }
                }
            }
        }
        self.pipes.push(Pipe { id, cells });
    }

    /// The wheel's hub and blades at its angle become walls; cells a blade
    /// moves into push their water and sand on in the turning direction.
    fn place_wheel(&mut self, k: usize) {
        let (cx, cy, r, blades, angle, speed, color) = {
            let wh = &self.wheels[k];
            (wh.cx, wh.cy, wh.r, wh.blades, wh.angle, wh.speed, wh.color)
        };
        let hub = (r * 0.28).max(1.5);
        let mut cells: Vec<usize> = Vec::new();
        let mut t = 0.0;
        while t <= r {
            for b in 0..blades {
                let a = angle + b as f64 * std::f64::consts::TAU / blades as f64;
                let (s, c) = a.sin_cos();
                let x = (cx + c * t).floor() as i64;
                let y = (cy + s * t).floor() as i64;
                if let Some(i) = self.idx(x, y) {
                    cells.push(i);
                }
            }
            t += 0.5;
        }
        let hr = hub.ceil() as i64;
        for dy in -hr..=hr {
            for dx in -hr..=hr {
                if (dx * dx + dy * dy) as f64 <= hub * hub {
                    if let Some(i) = self.idx(cx.floor() as i64 + dx, cy.floor() as i64 + dy) {
                        cells.push(i);
                    }
                }
            }
        }
        cells.sort_unstable();
        cells.dedup();
        let old = std::mem::take(&mut self.wheels[k].cells);
        for i in old.iter() {
            if cells.binary_search(i).is_err() {
                self.blade[*i] = false;
                self.mat[*i] = EMPTY;
            }
        }
        let dir = if speed >= 0.0 { 1.0 } else { -1.0 };
        for i in cells.iter() {
            if old.binary_search(i).is_ok() {
                continue;
            }
            if self.mat[*i] == WALL && !self.blade[*i] {
                // a fixed wall wins; the blade goes through it
                continue;
            }
            let dx = (*i % self.w) as f64 + 0.5 - cx;
            let dy = (*i / self.w) as f64 + 0.5 - cy;
            let tx = (-dy * dir).signum() as i64 * if (-dy).abs() > dx.abs() * 0.4 { 1 } else { 0 };
            let ty = (dx * dir).signum() as i64 * if dx.abs() > dy.abs() * 0.4 { 1 } else { 0 };
            self.solidify(*i, Some((tx, ty)), color);
            self.blade[*i] = true;
        }
        let mut keep = Vec::with_capacity(cells.len());
        for i in cells {
            if self.blade[i] {
                keep.push(i);
            }
        }
        self.wheels[k].cells = keep;
    }

    fn turn_wheels(&mut self) {
        let w = self.w;
        for k in 0..self.wheels.len() {
            let (cx, cy, r, blades) = {
                let wh = &self.wheels[k];
                (wh.cx, wh.cy, wh.r, wh.blades)
            };
            let mut torque = 0.0;
            for &i in self.wheels[k].cells.iter() {
                let x = i % w;
                let y = i / w;
                let dx = x as f64 + 0.5 - cx;
                let dy = y as f64 + 0.5 - cy;
                // the weight on the blade (water or sand on top of it)
                if y > 0 {
                    let u = i - w;
                    if !self.blade[u] {
                        let load = if self.mat[u] == SAND { 1.3 } else if self.mat[u] == EMPTY { self.mass[u].min(1.2) as f64 } else { 0.0 };
                        torque += dx * load;
                    }
                }
                // the push of water beside it (more water on one side)
                if x > 0 && x + 1 < w {
                    let ml = if self.mat[i - 1] == EMPTY { self.mass[i - 1] as f64 } else { 0.0 };
                    let mr = if self.mat[i + 1] == EMPTY { self.mass[i + 1] as f64 } else { 0.0 };
                    torque += -dy * (ml - mr) * 0.6;
                }
            }
            let wh = &mut self.wheels[k];
            let inertia = blades as f64 * r * r * 0.35 + 20.0;
            let max = 0.9 / r / TICK;
            wh.speed += torque / inertia * 9.0 * TICK;
            wh.speed -= wh.speed * 1.4 * TICK;
            if wh.speed.abs() < 0.02 && torque.abs() < 0.5 {
                wh.speed = 0.0;
            }
            wh.speed = wh.speed.clamp(-max, max);
            wh.angle += wh.speed * TICK;
            wh.turns += (wh.speed * TICK).abs() / std::f64::consts::TAU;
            self.place_wheel(k);
        }
    }

    fn pour_sources(&mut self) {
        for k in 0..self.sources.len() {
            if !self.sources[k].on {
                continue;
            }
            let (x0, x1, y, sand, rate) = {
                let s = &self.sources[k];
                (s.x0, s.x1, s.y, s.sand, s.rate)
            };
            self.sources[k].acc += rate * TICK;
            let mut budget = self.sources[k].acc;
            let mut x = x0;
            let span = x1 - x0 + 1;
            let start = (self.rand() as usize) % span;
            for j in 0..span {
                if budget < 0.05 {
                    break;
                }
                x = x0 + (start + j) % span;
                let i = y * self.w + x;
                if self.mat[i] != EMPTY {
                    continue;
                }
                if sand {
                    if budget >= 1.0 && self.mass[i] < 0.5 {
                        self.set_cell(i, "sand", 0);
                        self.vel[i] = 1;
                        budget -= 1.0;
                    }
                } else {
                    let add = (1.0 - self.mass[i]).max(0.0).min(budget as f32);
                    self.mass[i] += add;
                    budget -= add as f64;
                }
            }
            let _ = x;
            // what did not fit waits (a little: a blocked tap does not store a sea)
            self.sources[k].acc = budget.min(rate * TICK * 2.0);
        }
    }

    fn flow_water(&mut self) {
        let (w, h) = (self.w, self.h);
        self.next.copy_from_slice(&self.mass);
        let left_first = self.tick % 2 == 0;
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                if !self.wet_ok(i) {
                    continue;
                }
                let m = self.mass[i];
                if m <= 0.0 {
                    continue;
                }
                let mut rem = m;
                // down
                if y + 1 < h && self.wet_ok(i + w) {
                    let b = i + w;
                    let mut flow = stable(rem + self.mass[b]) - self.mass[b];
                    if flow > MIN_FLOW {
                        flow *= 0.5;
                    }
                    flow = flow.clamp(0.0, MAX_SPEED.min(rem));
                    self.next[i] -= flow;
                    self.next[b] += flow;
                    self.fall[b] += flow;
                    rem -= flow;
                }
                if rem <= 0.0 {
                    continue;
                }
                // falling water does not spread: only water that rests on
                // something (a wall, sand, fuller water) flows sideways
                if y + 1 < h && self.wet_ok(i + w) && self.mass[i + w] + (m - rem) < 0.9 {
                    continue;
                }
                for side in 0..2 {
                    let go_left = (side == 0) == left_first;
                    let j = if go_left {
                        if x == 0 { continue; }
                        i - 1
                    } else {
                        if x + 1 >= w { continue; }
                        i + 1
                    };
                    if !self.wet_ok(j) {
                        continue;
                    }
                    let flow = ((m - self.mass[j]) / 4.0).clamp(0.0, rem);
                    self.next[i] -= flow;
                    self.next[j] += flow;
                    let f = if go_left { -flow } else { flow };
                    self.drift[i] += f;
                    self.drift[j] += f;
                    rem -= flow;
                    if rem <= 0.0 {
                        break;
                    }
                }
                if rem <= 0.0 {
                    continue;
                }
                // up: only when pressed
                if y > 0 && self.wet_ok(i - w) {
                    let u = i - w;
                    let mut flow = rem - stable(rem + self.mass[u]);
                    if flow > MIN_FLOW {
                        flow *= 0.5;
                    }
                    flow = flow.clamp(0.0, MAX_SPEED.min(rem));
                    self.next[i] -= flow;
                    self.next[u] += flow;
                }
            }
        }
        std::mem::swap(&mut self.mass, &mut self.next);
        // a crumb on the floor or in the air dries; one on top of water stays
        // (it is the water being pressed up, and goes back down)
        let n = self.mass.len();
        for i in 0..n {
            let m = self.mass[i];
            if m > 0.0 && m < DRY {
                let b = i + w;
                if b >= n || !self.wet_ok(b) || self.mass[b] < 0.5 {
                    self.mass[i] = 0.0;
                }
            }
        }
    }

    /// Pressure: water in a body of full cells pushes out of every opening
    /// that is lower than the body's highest surface. The cellular flow
    /// alone carries that push only a cell a step; here a body moves water
    /// from its top to its lowest openings at once (as Dwarf Fortress does),
    /// so a U-tube's arms level out in seconds, not minutes.
    fn pressure(&mut self) {
        let (w, h) = (self.w, self.h);
        let n = w * h;
        const FULL: f32 = 0.95;
        if self.label.len() != n {
            self.label = vec![0; n];
        }
        for v in self.label.iter_mut() {
            *v = 0;
        }
        let mut stack: Vec<usize> = Vec::new();
        let mut body: Vec<usize> = Vec::new();
        let mut outlets: Vec<usize> = Vec::new();
        let mut next_label: u32 = 0;
        for start in 0..n {
            if self.label[start] != 0 || !self.wet_ok(start) || self.mass[start] < FULL {
                continue;
            }
            next_label += 1;
            let lab = next_label;
            body.clear();
            outlets.clear();
            stack.push(start);
            self.label[start] = lab;
            let mut top = h;
            while let Some(i) = stack.pop() {
                body.push(i);
                let (x, y) = (i % w, i / w);
                if y < top {
                    top = y;
                }
                let look = |j: usize, stack: &mut Vec<usize>, outlets: &mut Vec<usize>, label: &mut Vec<u32>| {
                    if (self.mat[j] != EMPTY && self.mat[j] != MESH) || label[j] == lab {
                        return;
                    }
                    if self.mass[j] >= FULL {
                        label[j] = lab;
                        stack.push(j);
                    } else if label[j] != lab + 1_000_000 {
                        label[j] = lab + 1_000_000;
                        outlets.push(j);
                    }
                };
                if x > 0 { look(i - 1, &mut stack, &mut outlets, &mut self.label); }
                if x + 1 < w { look(i + 1, &mut stack, &mut outlets, &mut self.label); }
                if y > 0 { look(i - w, &mut stack, &mut outlets, &mut self.label); }
                if y + 1 < h { look(i + w, &mut stack, &mut outlets, &mut self.label); }
            }
            // outlets: open cells next to the body at least two rows below its
            // top that rest on something (not air beside a falling stream)
            {
                let (mat, mass) = (&self.mat, &self.mass);
                outlets.retain(|&j| {
                    let b = j + w;
                    j / w > top + 1 && (b >= n || (mat[b] != EMPTY && mat[b] != MESH) || mass[b] >= FULL)
                });
            }
            if outlets.is_empty() || body.len() < 4 {
                continue;
            }
            // the lowest first
            outlets.sort_unstable_by(|a, b| (b / w).cmp(&(a / w)));
            let mut tops: Vec<usize> = body.iter().cloned().filter(|i| i / w == top).collect();
            if tops.is_empty() {
                continue;
            }
            // a wide body pushes harder: how much moves in a step
            let budget = ((body.len() as f32).sqrt() * 0.25).clamp(1.0, 10.0);
            let mut moved = 0.0f32;
            let mut k = 0usize;
            let mut t = (self.rand() as usize) % tops.len();
            while moved < budget && k < outlets.len() && !tops.is_empty() {
                let o = outlets[k];
                if o / w <= top + 1 {
                    break;
                }
                let room = (1.0 - self.mass[o]).max(0.0);
                if room < 0.05 {
                    k += 1;
                    continue;
                }
                t %= tops.len();
                let src = tops[t];
                // take from the surface above the top cell first, then the cell
                let mut take = room.min(0.5).min(budget - moved);
                let mut got = 0.0f32;
                if src >= w && self.wet_ok(src - w) && self.mass[src - w] > 0.0 {
                    let a = self.mass[src - w].min(take);
                    self.mass[src - w] -= a;
                    got += a;
                    take -= a;
                }
                if take > 0.0 {
                    let a = (self.mass[src] - 0.3).max(0.0).min(take);
                    self.mass[src] -= a;
                    got += a;
                }
                if got <= 0.0 {
                    tops.remove(t);
                    continue;
                }
                self.mass[o] += got;
                moved += got;
                if self.mass[src] < FULL {
                    tops.remove(t);
                } else {
                    t += 1;
                }
                if self.mass[o] >= 0.95 {
                    k += 1;
                }
            }
        }
    }

    fn fall_sand(&mut self) {
        let (w, h) = (self.w, self.h);
        if h < 2 {
            return;
        }
        let stamp = (self.tick % 250) as u8 + 1;
        let mut moved = vec![0u8; 0];
        moved.resize(w * h, 0);
        for y in (0..h - 1).rev() {
            let ltr = self.rand() % 2 == 0;
            for k in 0..w {
                let x = if ltr { k } else { w - 1 - k };
                let i = y * w + x;
                if self.mat[i] != SAND || moved[i] == stamp {
                    continue;
                }
                // wet next to water (and drink a little of it)
                if self.wet[i] == 0 {
                    for j in [i.wrapping_sub(1), i + 1, i + w, i.wrapping_sub(w)] {
                        if j < w * h && self.mat[j] == EMPTY && self.mass[j] > 0.2 {
                            self.wet[i] = 1;
                            self.mass[j] -= 0.05;
                            break;
                        }
                    }
                }
                let mut cur = i;
                let mut cy = y;
                let mut v = self.vel[i].max(1);
                let mut fell = false;
                // straight down, up to its speed (one cell in water)
                let mut steps = v;
                while steps > 0 && cy + 1 < h {
                    let b = cur + w;
                    if self.mat[b] != EMPTY {
                        break;
                    }
                    let in_water = self.mass[b] > 0.3;
                    if in_water && (fell || !self.chance(0.55)) {
                        break;
                    }
                    self.swap_grain(cur, b);
                    cur = b;
                    cy += 1;
                    fell = true;
                    steps -= 1;
                    if in_water {
                        break;
                    }
                }
                if fell {
                    v = (v + 1).min(5);
                    if self.mass[cur] > 0.3 {
                        v = 1;
                    }
                    self.vel[cur] = v;
                    moved[cur] = stamp;
                    continue;
                }
                self.vel[cur] = 0;
                // running water wears the pile: a grain it touches is
                // carried off now and then, downstream (slowly: a few
                // percent a step even in a fast stream)
                if let Some(to) = self.erode(cur, x, cy) {
                    self.swap_grain(cur, to);
                    moved[to] = stamp;
                    continue;
                }
                // slide down the side of the pile
                if cy + 1 < h {
                    let slip = if self.wet[cur] != 0 { 0.12 } else { 0.9 };
                    if !self.chance(slip) {
                        continue;
                    }
                    let first: i64 = if self.rand() % 2 == 0 { -1 } else { 1 };
                    for d in [first, -first] {
                        let nx = x as i64 + d;
                        if nx < 0 || nx >= w as i64 {
                            continue;
                        }
                        let side = (cur as i64 + d) as usize;
                        let diag = side + w;
                        if self.mat[side] == EMPTY && self.mat[diag] == EMPTY && self.mass[side] < 0.9 {
                            self.swap_grain(cur, diag);
                            moved[diag] = stamp;
                            break;
                        }
                    }
                }
            }
        }
    }

    /// Whether running water carries the grain at `i` (x, y) off this step,
    /// and where: the side cell the water runs to (water falling on it
    /// splashes it to either side). Still water does nothing.
    fn erode(&mut self, i: usize, x: usize, y: usize) -> Option<usize> {
        let w = self.w;
        let water = |s: &Sim, j: usize| s.mat[j] == EMPTY && s.mass[j] > 0.25;
        let mut drift = 0.0f32;
        let mut fall = 0.0f32;
        let mut n = 0;
        let mut look = |j: usize, s: &Sim| {
            if water(s, j) {
                drift += s.drift[j];
                fall = fall.max(s.fall[j]);
                n += 1;
            }
        };
        if x > 0 { look(i - 1, self); }
        if x + 1 < w { look(i + 1, self); }
        if y > 0 { look(i - w, self); }
        if n == 0 {
            return None;
        }
        // the stream's strength: sideways current, and water falling on it
        let s = (drift.abs() - EROSION_START).max(0.0) + (fall - EROSION_START * 2.0).max(0.0) * 0.5;
        if s <= 0.0 {
            return None;
        }
        let p = (s as f64 * EROSION_RATE).min(0.08);
        if !self.chance(p) {
            return None;
        }
        let dir: i64 = if drift > 0.0 { 1 } else if drift < 0.0 { -1 } else if self.rand() % 2 == 0 { 1 } else { -1 };
        let nx = x as i64 + dir;
        if nx >= 0 && nx < w as i64 {
            let side = (i as i64 + dir) as usize;
            if water(self, side) {
                return Some(side);
            }
            // a grain on top of the pile: lifted into the stream over it
            if y > 0 && water(self, side - w) && water(self, i - w) {
                return Some(side - w);
            }
        }
        // water falling straight on it splashes it to either side
        let back = x as i64 - dir;
        if fall > drift.abs() && back >= 0 && back < w as i64 {
            let side = (i as i64 - dir) as usize;
            if water(self, side) {
                return Some(side);
            }
        }
        None
    }

    /// A grain moves from `a` into the free cell `b`; b's water goes to a.
    fn swap_grain(&mut self, a: usize, b: usize) {
        self.mat[b] = SAND;
        self.col[b] = self.col[a];
        self.wet[b] = self.wet[a];
        self.mass[a] += self.mass[b];
        self.mass[b] = 0.0;
        self.mat[a] = EMPTY;
        self.wet[a] = 0;
        self.vel[a] = 0;
    }

    fn drain(&mut self) {
        let w = self.w;
        for k in 0..self.drains.len() {
            let (x0, y0, x1, y1) = {
                let d = &self.drains[k];
                (d.x0, d.y0, d.x1, d.y1)
            };
            let mut water = 0.0;
            let mut sand = 0.0;
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let i = y * w + x;
                    if self.mat[i] == SAND {
                        self.mat[i] = EMPTY;
                        sand += 1.0;
                    }
                    if self.wet_ok(i) {
                        water += self.mass[i] as f64;
                        self.mass[i] = 0.0;
                    }
                }
            }
            self.drains[k].water += water;
            self.drains[k].sand += sand;
        }
    }

    /// Runs the simulation for `dt` seconds (in steps of 1/60 s).
    pub fn step(&mut self, dt: f64) {
        if !self.active {
            return;
        }
        self.acc = (self.acc + dt).min(TICK * 3.0);
        while self.acc >= TICK * 0.999 {
            self.acc -= TICK;
            self.tick += 1;
            self.pour_sources();
            self.turn_wheels();
            for k in 0..self.drift.len() {
                self.drift[k] *= 0.8;
                self.fall[k] *= 0.8;
            }
            self.fall_sand();
            for _ in 0..4 {
                self.flow_water();
            }
            self.pressure();
            self.drain();
        }
    }

    /// The water (cells of it) and sand in a part of the grid, and how high
    /// the water stands in it: each row adds its fullness times a cell.
    fn measure(&self, z: &Area) -> (f64, f64, f64) {
        let w = self.w;
        let (mut water, mut sand, mut level) = (0.0, 0.0, 0.0);
        for y in z.y0..=z.y1 {
            let (mut row, mut room) = (0.0f64, 0.0f64);
            for x in z.x0..=z.x1 {
                let i = y * w + x;
                if self.mat[i] == SAND {
                    sand += 1.0;
                } else if self.wet_ok(i) {
                    let m = self.mass[i] as f64;
                    water += m;
                    row += m.min(1.0);
                    room += 1.0;
                }
            }
            if room > 0.0 {
                level += (row / room).min(1.0);
            }
        }
        (water, sand, level * self.cs)
    }

    pub fn state(&self) -> Json {
        if !self.active {
            return Json::Null;
        }
        let r2 = |v: f64| Json::Num((v * 100.0).round() / 100.0);
        let wheels = self
            .wheels
            .iter()
            .map(|wh| member(&wh.id, Json::Obj(vec![member("angle", r2(wh.angle)), member("speed", r2(wh.speed)), member("turns", r2(wh.turns))])))
            .collect();
        let zones = self
            .zones
            .iter()
            .map(|z| {
                let (water, sand, level) = self.measure(z);
                member(&z.id, Json::Obj(vec![member("water", r2(water)), member("sand", r2(sand)), member("level", r2(level))]))
            })
            .collect();
        let drains = self.drains.iter().map(|d| member(&d.id, Json::Obj(vec![member("water", r2(d.water)), member("sand", r2(d.sand))]))).collect();
        let mut water = 0.0f64;
        let mut sand = 0.0f64;
        for i in 0..self.mat.len() {
            if self.mat[i] == SAND {
                sand += 1.0;
            } else {
                water += self.mass[i] as f64;
            }
        }
        Json::Obj(vec![
            member("wheels", Json::Obj(wheels)),
            member("zones", Json::Obj(zones)),
            member("drains", Json::Obj(drains)),
            member("water", r2(water)),
            member("sand", r2(sand)),
        ])
    }

    /// Deeper water is darker (`depth`: water cells above it in its column,
    /// in bands so that rows merge into few rects); falling water lighter.
    fn water_color(&self, depth: usize, falling: bool) -> Rgb {
        if falling {
            return lerp3(self.water_rgb, [1.0, 1.0, 1.0], 0.3);
        }
        let band = (depth as f64 * self.cs / 24.0).floor().min(6.0);
        lerp3(self.water_rgb, self.deep_rgb, band / 6.0)
    }

    /// Draws the grid into `out`: runs of cells of one colour as one rect.
    pub fn render(&mut self, out: &mut DrawStream, view_w: f64, view_h: f64) {
        self.drawn = 0;
        if !self.active {
            return;
        }
        if let Some((top, bottom)) = self.background {
            out.raw(0, 0.0, 0.0, view_w, view_h, top, if pack(top) == pack(bottom) { None } else { Some(bottom) }, &[]);
        }
        let (w, h, cs) = (self.w, self.h, self.cs);
        let sand_shades = [shade(self.sand_rgb, 1.0), shade(self.sand_rgb, 0.93), shade(self.sand_rgb, 1.06), shade(self.sand_rgb, 0.86)];
        let wet_shades = [shade(self.sand_rgb, 0.68), shade(self.sand_rgb, 0.63), shade(self.sand_rgb, 0.72), shade(self.sand_rgb, 0.6)];
        let wall_keys: Vec<u32> = self.palette.iter().map(|c| pack(*c)).collect();
        let mut depth = vec![0usize; w];
        for y in 0..h {
            let mut run_key = 0u32;
            let mut run_x = 0usize;
            let py = self.oy + y as f64 * cs;
            for x in 0..=w {
                let mut key = 0u32;
                if x < w {
                    let i = y * w + x;
                    if !self.wet_ok(i) {
                        depth[x] = 0;
                    }
                    match self.mat[i] {
                        MESH if self.mass[i] <= 0.03 => {
                            if (x + y) % 2 == 0 {
                                key = wall_keys[self.col[i] as usize % wall_keys.len()];
                            }
                        }
                        WALL => {
                            if !self.blade[i] {
                                key = wall_keys[self.col[i] as usize % wall_keys.len()];
                            }
                        }
                        SAND => {
                            let s = (self.col[i] & 3) as usize;
                            key = pack(if self.wet[i] != 0 { wet_shades[s] } else { sand_shades[s] });
                        }
                        _ => {
                            let m = self.mass[i];
                            if m > 0.5 {
                                depth[x] += 1;
                            } else {
                                depth[x] = 0;
                            }
                            if m > 0.03 {
                                let above_water = y > 0 && self.mat[i - w] == EMPTY && self.mass[i - w] > 0.03;
                                let below_free = y + 1 < h && self.mat[i + w] == EMPTY && self.mass[i + w] < 0.9;
                                if m < 0.9 && !above_water && !below_free {
                                    // the surface: a partly full cell, filled from the bottom
                                    let fh = (m as f64).max(0.15) * cs;
                                    let c = self.water_color(0, false);
                                    out.raw(0, self.ox + x as f64 * cs, py + cs - fh, cs + 0.4, fh, c, None, &[]);
                                    self.drawn += 1;
                                } else {
                                    key = pack(self.water_color(depth[x], below_free && m < 0.7));
                                }
                            }
                        }
                    }
                }
                if key != run_key {
                    if run_key != 0 {
                        out.raw(0, self.ox + run_x as f64 * cs, py, (x - run_x) as f64 * cs + 0.4, cs + 0.4, unpack(run_key), None, &[]);
                        self.drawn += 1;
                    }
                    run_key = key;
                    run_x = x;
                }
            }
        }
        // the wheels: blades from the hub, a rim, the hub
        for wh in self.wheels.iter() {
            let c = self.palette[wh.color as usize % self.palette.len()];
            let cx = self.ox + wh.cx * cs;
            let cy = self.oy + wh.cy * cs;
            let r = wh.r * cs;
            let mut pts: Vec<f32> = Vec::new();
            let mut ends: Vec<f32> = Vec::new();
            for b in 0..wh.blades {
                let a = wh.angle + b as f64 * std::f64::consts::TAU / wh.blades as f64;
                let (s, co) = a.sin_cos();
                pts.extend_from_slice(&[cx as f32, cy as f32, (cx + co * r) as f32, (cy + s * r) as f32]);
                ends.push(pts.len() as f32);
            }
            out.rings(7, c, 1.0, cs * 1.3, &pts, &ends);
            let ring = |rad: f64| -> Vec<f32> {
                let mut p = Vec::with_capacity(48);
                for k in 0..24 {
                    let a = k as f64 / 24.0 * std::f64::consts::TAU;
                    p.push((cx + a.cos() * rad) as f32);
                    p.push((cy + a.sin() * rad) as f32);
                }
                p
            };
            let hub = ring((wh.r * 0.28).max(1.5) * cs);
            out.rings(6, shade(c, 0.8), 1.0, 0.0, &hub, &[hub.len() as f32]);
            let dot = ring(cs * 0.8);
            out.rings(6, [0.95, 0.85, 0.3], 1.0, 0.0, &dot, &[dot.len() as f32]);
            self.drawn += 4;
        }
    }
}

/// A source's area from its x, y and width (one cell high).
fn json_area(a: &Json, cs: f64) -> Json {
    Json::Obj(vec![
        member("id", a.get("id")),
        member("x", a.get("x")),
        member("y", a.get("y")),
        member("w", Json::Num(a.get("w").as_num(cs))),
        member("h", Json::Num(cs)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use rg_core::json::parse;

    fn sim(cmds: &[(&str, &str)]) -> Sim {
        let mut s = Sim::new();
        for (op, a) in cmds {
            s.command(op, &parse(a));
        }
        s
    }

    fn run(s: &mut Sim, seconds: f64) {
        let n = (seconds * 60.0) as usize;
        for _ in 0..n {
            s.step(TICK);
        }
    }

    #[test]
    fn water_is_kept_and_settles() {
        let mut s = sim(&[
            ("init", r#"{"w":60,"h":60,"cell":2}"#),
            ("rect", r#"{"x":10,"y":4,"w":10,"h":10,"mat":"water"}"#),
        ]);
        let before = s.state().get("water").as_num(0.0);
        run(&mut s, 6.0);
        let after = s.state().get("water").as_num(0.0);
        assert!((before - after).abs() / before < 0.03, "water {} -> {}", before, after);
        // it has fallen to the floor: nothing in the top half
        let top: f32 = s.mass[..s.w * s.h / 2].iter().sum();
        assert!(top < 0.5, "top {}", top);
    }

    #[test]
    fn communicating_vessels_level_out() {
        // a U: two columns joined at the bottom, water poured into the left one
        let mut s = sim(&[
            ("init", r#"{"w":40,"h":80,"cell":1}"#),
            ("rect", r#"{"x":0,"y":0,"w":40,"h":80,"mat":"wall"}"#),
            ("rect", r#"{"x":4,"y":4,"w":8,"h":72,"mat":"empty"}"#),
            ("rect", r#"{"x":28,"y":4,"w":8,"h":72,"mat":"empty"}"#),
            ("rect", r#"{"x":4,"y":70,"w":32,"h":6,"mat":"empty"}"#),
            ("rect", r#"{"x":4,"y":10,"w":8,"h":60,"mat":"water"}"#),
            ("zone", r#"{"id":"a","x":4,"y":4,"w":8,"h":66}"#),
            ("zone", r#"{"id":"b","x":28,"y":4,"w":8,"h":66}"#),
        ]);
        for k in 0..2 {
            run(&mut s, 4.0);
            let st = s.state();
            eprintln!("{}s a {} b {} total {}", (k + 1) * 4, st.get("zones").get("a").get("level").as_num(0.0), st.get("zones").get("b").get("level").as_num(0.0), st.get("water").as_num(0.0));
        }
        let st = s.state();
        let a = st.get("zones").get("a").get("level").as_num(0.0);
        let b = st.get("zones").get("b").get("level").as_num(0.0);
        assert!(a > 10.0 && b > 10.0, "a {} b {}", a, b);
        assert!((a - b).abs() < 3.0, "a {} b {}", a, b);
    }

    #[test]
    fn sand_sinks_and_piles() {
        let mut s = sim(&[
            ("init", r#"{"w":60,"h":60,"cell":1}"#),
            ("rect", r#"{"x":0,"y":40,"w":60,"h":20,"mat":"water"}"#),
            ("rect", r#"{"x":25,"y":0,"w":10,"h":10,"mat":"sand"}"#),
        ]);
        run(&mut s, 8.0);
        // the sand is at the bottom and the water stands above it
        let w = s.w;
        let bottom_sand = (0..w).filter(|x| s.mat[59 * w + x] == SAND).count();
        assert!(bottom_sand > 5, "{}", bottom_sand);
        let st = s.state();
        assert_eq!(st.get("sand").as_num(0.0), 100.0);
        // a pile, not a column: wider than the 10 it fell as
        assert!(bottom_sand > 10, "{}", bottom_sand);
    }

    fn sand_mean_x(s: &Sim) -> f64 {
        let (mut cx, mut n) = (0.0, 0.0);
        for i in 0..s.mat.len() {
            if s.mat[i] == SAND {
                cx += (i % s.w) as f64;
                n += 1.0;
            }
        }
        cx / n
    }

    #[test]
    fn running_water_wears_sand_slowly() {
        // a stream down a slope runs over a sand pile and carries it downstream
        let mut s = sim(&[
            ("init", r#"{"w":120,"h":80,"cell":1}"#),
            ("line", r#"{"x0":0,"y0":40,"x1":100,"y1":57,"width":3,"mat":"wall"}"#),
            ("rect", r#"{"x":60,"y":38,"w":14,"h":10,"mat":"sand"}"#),
            ("source", r#"{"id":"s","x":4,"y":2,"w":6,"rate":40}"#),
            ("drain", r#"{"id":"d","x":0,"y":76,"w":120,"h":4}"#),
        ]);
        run(&mut s, 1.0);
        let x0 = sand_mean_x(&s);
        run(&mut s, 4.0);
        // slowly: not much in the first seconds
        let x1 = sand_mean_x(&s);
        assert!(x1 - x0 < 2.0, "{} -> {}", x0, x1);
        run(&mut s, 30.0);
        let x2 = sand_mean_x(&s);
        assert!(x2 - x0 > 3.0, "{} -> {}", x0, x2);
        assert_eq!(s.state().get("sand").as_num(0.0), 140.0);
    }

    #[test]
    fn still_water_leaves_sand_alone() {
        let mut s = sim(&[
            ("init", r#"{"w":60,"h":60,"cell":1}"#),
            ("rect", r#"{"x":10,"y":50,"w":40,"h":4,"mat":"wall"}"#),
            ("rect", r#"{"x":10,"y":20,"w":4,"h":30,"mat":"wall"}"#),
            ("rect", r#"{"x":46,"y":20,"w":4,"h":30,"mat":"wall"}"#),
            ("rect", r#"{"x":24,"y":44,"w":10,"h":6,"mat":"sand"}"#),
        ]);
        run(&mut s, 2.0);
        s.command("rect", &parse(r#"{"x":14,"y":26,"w":32,"h":10,"mat":"water"}"#));
        run(&mut s, 4.0);
        let before: Vec<u8> = s.mat.clone();
        run(&mut s, 10.0);
        let changed = (0..s.mat.len()).filter(|&i| (before[i] == SAND) != (s.mat[i] == SAND)).count();
        assert!(changed <= 4, "{} cells changed", changed);
    }

    #[test]
    fn falling_water_turns_a_wheel() {
        let mut s = sim(&[
            ("init", r#"{"w":80,"h":80,"cell":1}"#),
            ("wheel", r#"{"id":"w","x":40,"y":40,"r":14}"#),
            ("source", r#"{"id":"s","x":44,"y":2,"w":6,"rate":40}"#),
            ("drain", r#"{"id":"d","x":0,"y":76,"w":80,"h":4}"#),
        ]);
        run(&mut s, 5.0);
        let st = s.state();
        let turns = st.get("wheels").get("w").get("turns").as_num(0.0);
        let speed = st.get("wheels").get("w").get("speed").as_num(0.0);
        assert!(turns > 0.1, "turns {}", turns);
        // water falls on the right side: clockwise on the screen (positive)
        assert!(speed > 0.0, "speed {}", speed);
    }

    #[test]
    fn a_closed_valve_holds_and_an_open_one_lets_through() {
        let mut s = sim(&[
            ("init", r#"{"w":20,"h":40,"cell":1}"#),
            ("valve", r#"{"id":"v","x":0,"y":20,"w":20,"h":2,"open":false}"#),
            ("rect", r#"{"x":0,"y":5,"w":20,"h":10,"mat":"water"}"#),
            ("zone", r#"{"id":"low","x":0,"y":22,"w":20,"h":18}"#),
        ]);
        run(&mut s, 3.0);
        assert!(s.state().get("zones").get("low").get("water").as_num(0.0) < 0.1);
        s.command("valve", &parse(r#"{"id":"v","open":true}"#));
        run(&mut s, 5.0);
        assert!(s.state().get("zones").get("low").get("water").as_num(0.0) > 150.0);
    }

    #[test]
    fn a_mesh_lets_water_through_but_not_sand() {
        let mut s = sim(&[
            ("init", r#"{"w":20,"h":40,"cell":1}"#),
            ("rect", r#"{"x":0,"y":20,"w":20,"h":1,"mat":"mesh"}"#),
            ("rect", r#"{"x":0,"y":2,"w":20,"h":4,"mat":"water"}"#),
            ("rect", r#"{"x":5,"y":8,"w":10,"h":4,"mat":"sand"}"#),
            ("zone", r#"{"id":"low","x":0,"y":21,"w":20,"h":19}"#),
        ]);
        run(&mut s, 6.0);
        let low = s.state().get("zones").get("low");
        assert!(low.get("water").as_num(0.0) > 60.0, "{}", low.get("water").as_num(0.0));
        assert_eq!(low.get("sand").as_num(0.0), 0.0);
    }

    #[test]
    fn a_pipe_turns() {
        let mut s = sim(&[("init", r#"{"w":40,"h":40,"cell":1}"#), ("pipe", r#"{"id":"p","x":0,"y":0,"size":12,"shape":"I","rot":0}"#)]);
        let walls0: Vec<usize> = (0..s.mat.len()).filter(|i| s.mat[*i] == WALL).collect();
        s.command("pipe", &parse(r#"{"id":"p","x":0,"y":0,"size":12,"shape":"I","rot":1}"#));
        let walls1: Vec<usize> = (0..s.mat.len()).filter(|i| s.mat[*i] == WALL).collect();
        assert!(!walls0.is_empty());
        assert_eq!(walls0.len(), walls1.len());
        assert_ne!(walls0, walls1);
        // a vertical pipe: the top middle is open, its left and right are walls
        let s2 = sim(&[("init", r#"{"w":40,"h":40,"cell":1}"#), ("pipe", r#"{"id":"p","x":0,"y":0,"size":12,"shape":"I","rot":0}"#)]);
        assert_eq!(s2.mat[6], EMPTY);
        assert_eq!(s2.mat[1], WALL);
    }
}
