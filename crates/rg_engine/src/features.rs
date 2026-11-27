// SPDX-License-Identifier: AGPL-3.0-or-later
//! Character features drawn as 2D art on skeleton bones: each feature is its
//! own small part of the engine (an eye, whiskers, a mouth, …) with its own
//! parameters, so that the same eye serves a cat, a wolf and a dog with
//! different numbers. A feature lives in the plane of its bone (x right, y
//! up, z towards the viewer, metres), follows the bone (a blink scales the
//! bone, a look turns it), and gives back:
//!
//! - fills: flat colour shapes, drawn unlit, back to front;
//! - strokes: brush strokes (Catmull-Rom control points with a width at
//!   each), drawn by fiber.rs `brush_ribbon` with sharp tips;
//! - guides: named curves for what goes over the character (clothes and
//!   their folds read where a feature's edges and landmarks are).
//!
//! A glTF node (a bone) carries its features in `extras.features`:
//! `[{ "type": "eye", "at": [x, y, z], "side": 1, … }]`.

use rg_core::json::Json;

pub type P2 = [f32; 2];

pub struct Fill {
    pub pts: Vec<P2>,
    /// linear colour
    pub col: [f32; 3],
}

pub struct Stroke {
    pub pts: Vec<P2>,
    pub w: Vec<f32>,
    pub col: [f32; 3],
}

/// A named curve for clothes and other layers (in the bone's plane).
pub struct Guide {
    pub name: &'static str,
    pub pts: Vec<P2>,
}

#[derive(Default)]
pub struct Art {
    pub fills: Vec<Fill>,
    pub strokes: Vec<Stroke>,
    pub guides: Vec<Guide>,
}

/// The art of one feature from its JSON description; offset to its `at`.
pub fn art(f: &Json) -> Option<(Art, [f32; 3])> {
    let at = vec3(&f.get("at"), [0.0; 3]);
    match f.get("type").as_str().as_str() {
        "eye" => Some((Eye::from_json(f).art(), at)),
        "nose" => Some((Nose::from_json(f).art(), at)),
        "mouth" => Some((Mouth::from_json(f).art(), at)),
        "whiskers" => Some((Whiskers::from_json(f).art(), at)),
        "arcs" => Some((arcs(f), at)),
        "earring" => Some((earring(f), at)),
        _ => None,
    }
}

// ---------------------------------------------------------------- the eye

/// An eye: an almond between an upper and a lower lid curve (Catmull-Rom
/// through control points, in units of the eye's half width, inner corner
/// at x = -1, outer at +1), an iris with a darker top, a slit or round pupil,
/// a glint, a lash line along the upper lid that swells and flicks out past
/// the outer corner, and a thin lower lid line. `side` -1 mirrors it (the
/// other eye). `open` (0..1) closes the lids onto the line between the
/// corners; a closed eye is just its lash line.
pub struct Eye {
    pub half: f32,
    pub side: f32,
    pub upper: Vec<P2>,
    pub lower: Vec<P2>,
    pub iris: P2,
    pub iris_r: f32,
    pub iris_col: [f32; 3],
    pub iris_top: [f32; 3],
    pub pupil: [f32; 2],
    pub pupil_col: [f32; 3],
    pub glint: [f32; 3],
    pub lash: Vec<f32>,
    pub flick: Vec<P2>,
    pub lash_col: [f32; 3],
    /// the lower lid line's width along the lower curve (outer → inner corner)
    pub lid: Vec<f32>,
    /// the white of the eye; None: the iris fills the almond (a cat's)
    pub sclera: Option<[f32; 3]>,
    /// the dark arc round the iris where it meets the white (width in half widths; 0: none)
    pub iris_line: f32,
    /// the lid crease: an arc running parallel to the upper lid, `gap` above
    /// it, drawn over parts of it ([from, to] along the lid, 0..1; a gap
    /// between parts is where the brush lifted), `width` at its fullest
    pub crease: Option<(f32, Vec<[f32; 2]>, f32)>,
    pub open: f32,
}

/// points on a circular arc from a to b that bulges by `sag` (to the left of
/// a→b when positive), `n` spans: the even curvature of one brush sweep
pub fn arc(a: P2, b: P2, sag: f32, n: usize) -> Vec<P2> {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let c = (dx * dx + dy * dy).sqrt().max(1e-6);
    let nrm = [-dy / c, dx / c];
    if sag.abs() < 1e-5 { return (0..=n).map(|i| { let t = i as f32 / n as f32; [a[0] + dx * t, a[1] + dy * t] }).collect(); }
    // radius and centre from chord c and sagitta s
    let r = (c * c / 4.0 + sag * sag) / (2.0 * sag.abs());
    let m = [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0];
    let k = (r - sag.abs()) * sag.signum();
    let ctr = [m[0] - nrm[0] * k, m[1] - nrm[1] * k];
    let a0 = (a[1] - ctr[1]).atan2(a[0] - ctr[0]);
    let mut a1 = (b[1] - ctr[1]).atan2(b[0] - ctr[0]);
    // go the way that passes the bulge
    let tau = std::f32::consts::TAU;
    let mid = (m[1] + nrm[1] * sag - ctr[1]).atan2(m[0] + nrm[0] * sag - ctr[0]);
    let within = |s: f32, e: f32, x: f32| { let (e, x) = ((e - s).rem_euclid(tau), (x - s).rem_euclid(tau)); x <= e };
    if !within(a0, a1, mid) { a1 = a0 - (a0 - a1).rem_euclid(tau); } else { a1 = a0 + (a1 - a0).rem_euclid(tau); }
    (0..=n).map(|i| { let t = a0 + (a1 - a0) * i as f32 / n as f32; [ctr[0] + r * t.cos(), ctr[1] + r * t.sin()] }).collect()
}

impl Eye {
    /// The eye as a small model first: the corners, each lid a circular arc
    /// through them (`upperSag`, `lowerSag`: how far each bulges, in half
    /// widths), the lash running on from the outer corner along the upper
    /// arc's tangent and turning by `flickTurn` degrees over `flickLength`.
    /// Its arcs are then drawn from this model, not traced.
    fn modelled(&mut self, j: &Json) {
        let c = j.get("corners").items();
        if c.len() != 2 { return; }
        let p = |x: &Json| { let n = nums(x); [n.first().copied().unwrap_or(0.0), n.get(1).copied().unwrap_or(0.0)] };
        let (ci, co) = (p(&c[0]), p(&c[1]));
        let us = j.get("upperSag").as_num(0.6) as f32;
        let ls = j.get("lowerSag").as_num(0.5) as f32;
        // upper: inner → outer, bulging up; lower: outer → inner, bulging down
        self.upper = arc(ci, co, us, 6);
        self.lower = arc(co, ci, ls, 6);
        let fl = j.get("flickLength").as_num(0.0) as f32;
        if fl > 0.0 {
            let n = self.upper.len();
            let (a, b) = (self.upper[n - 2], self.upper[n - 1]);
            let d = { let (x, y) = (b[0] - a[0], b[1] - a[1]); let l = (x * x + y * y).sqrt().max(1e-6); [x / l, y / l] };
            let turn = (j.get("flickTurn").as_num(20.0) as f32).to_radians();
            let mut q = b;
            let mut ang = d[1].atan2(d[0]);
            self.flick.clear();
            for _ in 0..2 {
                ang += turn / 2.0;
                q = [q[0] + ang.cos() * fl / 2.0, q[1] + ang.sin() * fl / 2.0];
                self.flick.push(q);
            }
        }
    }

    pub fn from_json(j: &Json) -> Eye {
        let mut e = Eye::from_json_raw(j);
        e.modelled(j);
        e
    }

    fn from_json_raw(j: &Json) -> Eye {
        let pts = |k: &str, d: &[P2]| -> Vec<P2> {
            let v: Vec<P2> = j.get(k).items().iter().map(|p| { let n = nums(p); [n.first().copied().unwrap_or(0.0), n.get(1).copied().unwrap_or(0.0)] }).collect();
            if v.len() >= 2 { v } else { d.to_vec() }
        };
        let num = |k: &str, d: f32| j.get(k).as_num(d as f64) as f32;
        let col = |k: &str, d: [f32; 3]| hex(&j.get(k).as_str()).unwrap_or(d);
        let lash = nums(&j.get("lash"));
        Eye {
            half: num("halfWidth", 0.02),
            side: if num("side", 1.0) < 0.0 { -1.0 } else { 1.0 },
            upper: pts("upper", &[[-1.0, -0.05], [-0.45, 0.62], [0.35, 0.66], [1.0, 0.28]]),
            lower: pts("lower", &[[1.0, 0.28], [0.45, -0.48], [-0.35, -0.56], [-1.0, -0.05]]),
            iris: { let n = nums(&j.get("iris")); [n.first().copied().unwrap_or(0.05), n.get(1).copied().unwrap_or(0.05)] },
            iris_r: num("irisRadius", 0.56),
            iris_col: col("irisColor", [0.85, 0.6, 0.05]),
            iris_top: col("irisTop", [0.6, 0.35, 0.02]),
            pupil: { let n = nums(&j.get("pupil")); [n.first().copied().unwrap_or(0.12), n.get(1).copied().unwrap_or(0.5)] },
            pupil_col: col("pupilColor", [0.01, 0.008, 0.015]),
            glint: { let n = nums(&j.get("glint")); [n.first().copied().unwrap_or(0.28), n.get(1).copied().unwrap_or(0.3), n.get(2).copied().unwrap_or(0.12)] },
            lash: if lash.len() >= 2 { lash } else { vec![0.03, 0.12, 0.2, 0.22, 0.18, 0.12, 0.05, 0.0] },
            flick: pts("flick", &[[1.22, 0.42], [1.42, 0.58]]),
            lash_col: col("lashColor", [0.02, 0.014, 0.03]),
            lid: { let v = nums(&j.get("lid")); if v.len() >= 2 { v } else { vec![0.0, 0.06, 0.06, 0.0] } },
            sclera: hex(&j.get("sclera").as_str()),
            iris_line: num("irisLine", 0.0),
            crease: {
                let c = j.get("crease");
                let parts: Vec<[f32; 2]> = c.get("parts").items().iter().map(|x| { let n = nums(x); [n.first().copied().unwrap_or(0.0), n.get(1).copied().unwrap_or(1.0)] }).collect();
                if parts.is_empty() { None } else { Some((c.get("gap").as_num(0.3) as f32, parts, c.get("width").as_num(0.05) as f32)) }
            },
            open: num("open", 1.0).clamp(0.0, 1.0),
        }
    }

    pub fn art(&self) -> Art {
        let mut a = Art::default();
        let (h, s) = (self.half, self.side);
        let to = |p: P2| -> P2 { [p[0] * h * s, p[1] * h] };
        // the lids, closed by `open` onto the line between the corners
        let (c0, c1) = (self.upper[0], *self.upper.last().unwrap());
        let shut = |p: P2| -> P2 {
            let t = ((p[0] - c0[0]) / (c1[0] - c0[0]).abs().max(1e-6)).clamp(0.0, 1.0);
            let yc = c0[1] + (c1[1] - c0[1]) * t;
            [p[0], yc + (p[1] - yc) * self.open]
        };
        let up: Vec<P2> = catmull(&self.upper, 8).into_iter().map(shut).collect();
        let lo: Vec<P2> = catmull(&self.lower, 8).into_iter().map(shut).collect();
        let mut almond: Vec<P2> = up.clone();
        almond.extend_from_slice(&lo[1..lo.len() - 1]);
        if self.open > 0.04 {
            // iris, its darker top, pupil and glint, each cut to the almond
            let cut = |shape: Vec<P2>| clip_convex(&shape, &almond);
            let ir = circle(self.iris, self.iris_r, self.iris_r, 28);
            match self.sclera {
                Some(sc) => {
                    a.fills.push(Fill { pts: almond.iter().map(|p| to(*p)).collect(), col: sc });
                    let iv = cut(ir.clone());
                    if iv.len() >= 3 { a.fills.push(Fill { pts: iv.iter().map(|p| to(*p)).collect(), col: self.iris_col }); }
                }
                None => a.fills.push(Fill { pts: almond.iter().map(|p| to(*p)).collect(), col: self.iris_col }),
            }
            let top: Vec<P2> = cut(ir.clone()).into_iter().filter(|p| p[1] > self.iris[1] + self.iris_r * 0.15).collect();
            if top.len() >= 3 {
                // a band over the top of the iris (the lid's shadow)
                // the lid's shadow follows the lid: the strip under the upper lid
                // curve, as deep as `shadow` of the iris radius, cut to the iris
                let depth = self.iris_r * 0.55;
                let mut strip: Vec<P2> = up.iter().map(|p| [p[0], p[1] + 0.05]).collect();
                strip.extend(up.iter().rev().map(|p| [p[0], p[1] - depth]));
                let band = clip_poly_convex(&strip, &circle(self.iris, self.iris_r, self.iris_r, 28));
                if band.len() >= 3 { a.fills.push(Fill { pts: band.iter().map(|p| to(*p)).collect(), col: self.iris_top }); }
            }
            let pu = cut(circle(self.iris, self.pupil[0], self.pupil[1], 20));
            if pu.len() >= 3 { a.fills.push(Fill { pts: pu.iter().map(|p| to(*p)).collect(), col: self.pupil_col }); }
            let gl = cut(circle([self.glint[0], self.glint[1]], self.glint[2], self.glint[2], 12));
            if gl.len() >= 3 { a.fills.push(Fill { pts: gl.iter().map(|p| to(*p)).collect(), col: [1.0, 1.0, 1.0] }); }
            // the iris edge: the arc of the iris circle that lies inside the
            // almond, one brush stroke tapering where it runs under the lids
            if self.sclera.is_some() && self.iris_line > 0.0 {
                let n = 64;
                let ring = circle(self.iris, self.iris_r, self.iris_r, n);
                let hull = convex_hull(&almond);
                let inside: Vec<bool> = ring.iter().map(|p| point_in(&hull, *p)).collect();
                if let Some(start) = (0..n).find(|&i| !inside[i]) {
                    let (mut best, mut run): (Vec<P2>, Vec<P2>) = (Vec::new(), Vec::new());
                    for k in 1..=n {
                        let i = (start + k) % n;
                        if inside[i] { run.push(ring[i]); } else { if run.len() > best.len() { best = std::mem::take(&mut run); } run.clear(); }
                    }
                    if best.len() >= 3 {
                        // the arc starts on the lash and ends on the lower lid: run it
                        // one step past the almond at both ends, so it reaches them
                        let step = |a: P2, b: P2| [2.0 * a[0] - b[0], 2.0 * a[1] - b[1]];
                        let (f, l) = (step(best[0], best[1]), step(best[best.len() - 1], best[best.len() - 2]));
                        best.insert(0, f);
                        best.push(l);
                        let m = best.len();
                        let w: Vec<f32> = (0..m).map(|i| { let t = i as f32 / (m - 1) as f32; (0.75 + 0.25 * (std::f32::consts::PI * t).sin()) * self.iris_line * h }).collect();
                        a.strokes.push(Stroke { pts: best.iter().map(|p| to(*p)).collect(), w, col: self.lash_col });
                        a.guides.push(Guide { name: "iris-edge", pts: best.iter().map(|p| to(*p)).collect() });
                    }
                }
            }
            // the lower lid: a thin line under the outer part, lifting at both ends
            let lid: Vec<P2> = self.lower.iter().map(|p| shut(*p)).collect();
            let lw: Vec<f32> = (0..lid.len()).map(|i| sample(&self.lid, i as f32 / (lid.len() - 1).max(1) as f32) * h).collect();
            if lw.iter().any(|w| *w > 0.0) { a.strokes.push(Stroke { pts: lid.iter().map(|p| to(*p)).collect(), w: lw, col: self.lash_col }); }
        }
        // the lash line: along the upper lid and out into the flick
        let mut lp: Vec<P2> = self.upper.iter().map(|p| shut(*p)).collect();
        lp.extend(self.flick.iter().map(|p| shut(*p)));
        let lw: Vec<f32> = (0..lp.len()).map(|i| {
            let t = i as f32 / (lp.len() - 1).max(1) as f32;
            sample(&self.lash, t) * h
        }).collect();
        a.strokes.push(Stroke { pts: lp.iter().map(|p| to(*p)).collect(), w: lw, col: self.lash_col });
        // the crease: the upper lid's arc again, lifted off it along its normals
        if let Some((gap, parts, width)) = &self.crease {
            let fine = catmull(&self.upper, 12);
            let m = fine.len();
            let lifted: Vec<P2> = (0..m).map(|i| {
                let (a0, b0) = (fine[i.saturating_sub(1)], fine[(i + 1).min(m - 1)]);
                let (dx, dy) = (b0[0] - a0[0], b0[1] - a0[1]);
                let l = (dx * dx + dy * dy).sqrt().max(1e-6);
                [fine[i][0] - dy / l * gap, fine[i][1] + dx / l * gap]
            }).collect();
            for pr in parts {
                let (i0, i1) = (((pr[0].clamp(0.0, 1.0)) * (m - 1) as f32) as usize, ((pr[1].clamp(0.0, 1.0)) * (m - 1) as f32) as usize);
                if i1 < i0 + 2 { continue; }
                let seg: Vec<P2> = lifted[i0..=i1].iter().step_by(2).copied().collect();
                let k = seg.len();
                if k < 2 { continue; }
                let w: Vec<f32> = (0..k).map(|i| (std::f32::consts::PI * i as f32 / (k - 1) as f32).sin().powf(0.7) * width * h).collect();
                a.strokes.push(Stroke { pts: seg.iter().map(|p| to(*p)).collect(), w, col: self.lash_col });
            }
        }
        // guides: the eye's outline (masks, glasses, a hood's opening keep off it)
        a.guides.push(Guide { name: "eye", pts: almond.iter().map(|p| to(*p)).collect() });
        a
    }
}

// ---------------------------------------------------------------- the nose

/// A nose: a rounded shape (Catmull-Rom loop through `shape`, in units of
/// its half width) filled with its colour, a brush outline whose width runs
/// along the loop (`outline`, a profile from the first point round to it
/// again; heavier under the nose, light on top), and a highlight.
pub struct Nose {
    pub half: f32,
    pub side: f32,
    pub shape: Vec<P2>,
    pub col: [f32; 3],
    pub outline: Vec<f32>,
    pub ink: [f32; 3],
    pub shine: [f32; 3],
    pub shine_col: Option<[f32; 3]>,
    /// nostrils: [t round the outline 0..1, length, depth] each (half domes on the outline)
    pub nostrils: Vec<[f32; 5]>,
}

impl Nose {
    pub fn from_json(j: &Json) -> Nose {
        let num = |k: &str, d: f32| j.get(k).as_num(d as f64) as f32;
        let o = nums(&j.get("outline"));
        let sh = nums(&j.get("shine"));
        Nose {
            half: num("halfWidth", 0.012),
            side: if num("side", 1.0) < 0.0 { -1.0 } else { 1.0 },
            shape: pts_of(j, "shape", &[[-1.0, 0.3], [0.0, 0.42], [1.0, 0.3], [0.2, -0.55], [-0.2, -0.55]]),
            col: hex(&j.get("color").as_str()).unwrap_or([0.8, 0.35, 0.4]),
            outline: if o.len() >= 2 { o } else { vec![0.04, 0.05, 0.12, 0.16, 0.12, 0.04] },
            ink: hex(&j.get("inkColor").as_str()).unwrap_or([0.02, 0.014, 0.03]),
            shine: if sh.len() >= 3 { [sh[0], sh[1], sh[2]] } else { [0.15, 0.1, 0.18] },
            shine_col: hex(&j.get("shineColor").as_str()),
            nostrils: j.get("nostrils").items().iter().map(|n| { let v = nums(n); [v.first().copied().unwrap_or(0.0), v.get(1).copied().unwrap_or(0.0), v.get(2).copied().unwrap_or(0.1), 0.0, 0.0] }).collect(),
        }
    }

    pub fn art(&self) -> Art {
        let mut a = Art::default();
        let (h, s) = (self.half, self.side);
        let to = |p: P2| -> P2 { [p[0] * h * s, p[1] * h] };
        let mut ring = self.shape.clone();
        ring.push(self.shape[0]);
        // a closed Catmull-Rom loop: the neighbours wrap round
        let n = self.shape.len();
        let mut lp = Vec::new();
        for i in 0..n {
            let (p0, p1, p2, p3) = (self.shape[(i + n - 1) % n], self.shape[i], self.shape[(i + 1) % n], self.shape[(i + 2) % n]);
            lp.extend(catmull(&[p0, p1, p2, p3], 8)[8..16].iter().copied());
        }
        a.fills.push(Fill { pts: lp.iter().map(|p| to(*p)).collect(), col: self.col });
        if let Some(sc) = self.shine_col {
            let sh = clip_convex(&circle([self.shine[0], self.shine[1]], self.shine[2] * 1.4, self.shine[2], 12), &convex_hull(&lp));
            if sh.len() >= 3 { a.fills.push(Fill { pts: sh.iter().map(|p| to(*p)).collect(), col: sc }); }
        }
        // nostrils: half domes that sit on the outline and run along it —
        // [t (0..1 round the loop from the first point), length, depth] in
        // half widths; the flat side is the outline, the dome bulges inwards
        let cum: Vec<f32> = std::iter::once(0.0).chain(lp.windows(2).scan(0.0, |acc, w| { *acc += ((w[1][0] - w[0][0]).powi(2) + (w[1][1] - w[0][1]).powi(2)).sqrt(); Some(*acc) })).collect();
        let total = *cum.last().unwrap_or(&1.0);
        let ctr = lp.iter().fold([0.0, 0.0], |m, p| [m[0] + p[0] / lp.len() as f32, m[1] + p[1] / lp.len() as f32]);
        let at_len = |d: f32| -> P2 {
            let d = d.rem_euclid(total);
            let i = cum.iter().position(|&c| c >= d).unwrap_or(1).max(1);
            let t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]).max(1e-6);
            [lp[i - 1][0] + (lp[i][0] - lp[i - 1][0]) * t, lp[i - 1][1] + (lp[i][1] - lp[i - 1][1]) * t]
        };
        for n in &self.nostrils {
            let (t, len, depth) = (n[0], n[1], n[2]);
            let k = 10;
            let edge: Vec<P2> = (0..=k).map(|i| at_len((t + (i as f32 / k as f32 - 0.5) * len / total * total / total) * total)).collect();
            let mut dome = edge.clone();
            for i in (1..k).rev() {
                let e = edge[i];
                let s = (std::f32::consts::PI * i as f32 / k as f32).sin();
                let to_c = [ctr[0] - e[0], ctr[1] - e[1]];
                let l = (to_c[0] * to_c[0] + to_c[1] * to_c[1]).sqrt().max(1e-6);
                dome.push([e[0] + to_c[0] / l * depth * s, e[1] + to_c[1] / l * depth * s]);
            }
            a.fills.push(Fill { pts: dome.iter().map(|p| to(*p)).collect(), col: self.ink });
        }
        let w: Vec<f32> = (0..ring.len()).map(|i| sample(&self.outline, i as f32 / (ring.len() - 1) as f32) * h).collect();
        a.strokes.push(Stroke { pts: ring.iter().map(|p| to(*p)).collect(), w, col: self.ink });
        a.guides.push(Guide { name: "nose", pts: lp.iter().map(|p| to(*p)).collect() });
        // the lowest point: where the mouth line hangs from
        let tip = lp.iter().copied().fold([0.0, f32::MAX], |m, p| if p[1] < m[1] { p } else { m });
        a.guides.push(Guide { name: "nose-tip", pts: vec![to(tip)] });
        a
    }
}

// ---------------------------------------------------------------- the mouth

/// A mouth: brush strokes in units of its half width — the line down from
/// the nose (`philtrum`), the lip line out to each corner (`line`, through
/// the middle), and an optional chin line — each with its own width
/// profile, so the ends taper to points. `open` drops the middle of the
/// line into an open mouth (filled with `inside`).
pub struct Mouth {
    pub half: f32,
    pub side: f32,
    pub lines: Vec<(Vec<P2>, Vec<f32>)>,
    pub ink: [f32; 3],
}

impl Mouth {
    pub fn from_json(j: &Json) -> Mouth {
        let num = |k: &str, d: f32| j.get(k).as_num(d as f64) as f32;
        let mut lines = Vec::new();
        for l in j.get("strokes").items() {
            let pts = pts_of(&l, "pts", &[]);
            let w = nums(&l.get("w"));
            if pts.len() >= 2 { lines.push((pts, if w.len() >= 2 { w } else { vec![0.0, 0.05, 0.0] })); }
        }
        if lines.is_empty() {
            lines.push((vec![[0.0, 0.3], [0.0, 0.0]], vec![0.03, 0.05]));
            lines.push((vec![[-1.0, 0.15], [-0.5, -0.1], [0.0, 0.0], [0.5, -0.1], [1.0, 0.15]], vec![0.0, 0.05, 0.06, 0.05, 0.0]));
        }
        Mouth { half: num("halfWidth", 0.02), side: if num("side", 1.0) < 0.0 { -1.0 } else { 1.0 }, lines, ink: hex(&j.get("inkColor").as_str()).unwrap_or([0.02, 0.014, 0.03]) }
    }

    pub fn art(&self) -> Art {
        let mut a = Art::default();
        let (h, s) = (self.half, self.side);
        let to = |p: P2| -> P2 { [p[0] * h * s, p[1] * h] };
        for (pts, w) in &self.lines {
            let ws: Vec<f32> = (0..pts.len()).map(|i| sample(w, i as f32 / (pts.len() - 1).max(1) as f32) * h).collect();
            a.strokes.push(Stroke { pts: pts.iter().map(|p| to(*p)).collect(), w: ws, col: self.ink });
        }
        // guides: the lip line (a mask, a scarf over the mouth) and its corners
        if let Some((pts, _)) = self.lines.iter().max_by(|x, y| x.0.len().cmp(&y.0.len())) {
            a.guides.push(Guide { name: "mouth", pts: catmull(pts, 6).into_iter().map(to).collect() });
            a.guides.push(Guide { name: "mouth-corners", pts: vec![to(pts[0]), to(*pts.last().unwrap())] });
        }
        a
    }
}

// ---------------------------------------------------------------- whiskers

/// Whiskers: `count` long brush strokes from roots spread over the muzzle,
/// fanning out by `spread` degrees round `angle`, bending by `bend`, thick
/// at the root and running to a sharp point. `side` -1 mirrors them.
pub struct Whiskers {
    pub side: f32,
    pub root: P2,
    pub root_step: P2,
    pub count: usize,
    pub length: f32,
    pub angle: f32,
    pub spread: f32,
    pub bend: f32,
    pub width: f32,
    pub ink: [f32; 3],
}

impl Whiskers {
    pub fn from_json(j: &Json) -> Whiskers {
        let num = |k: &str, d: f32| j.get(k).as_num(d as f64) as f32;
        let r = nums(&j.get("root"));
        let rs = nums(&j.get("rootStep"));
        Whiskers {
            side: if num("side", 1.0) < 0.0 { -1.0 } else { 1.0 },
            root: if r.len() >= 2 { [r[0], r[1]] } else { [0.02, 0.0] },
            root_step: if rs.len() >= 2 { [rs[0], rs[1]] } else { [0.002, -0.004] },
            count: num("count", 3.0).max(1.0) as usize,
            length: num("length", 0.08),
            angle: num("angle", 5.0),
            spread: num("spread", 22.0),
            bend: num("bend", 0.12),
            width: num("width", 0.0025),
            ink: hex(&j.get("inkColor").as_str()).unwrap_or([0.02, 0.014, 0.03]),
        }
    }

    pub fn art(&self) -> Art {
        let mut a = Art::default();
        let s = self.side;
        let mut roots = Vec::new();
        for k in 0..self.count {
            let t = if self.count > 1 { k as f32 / (self.count - 1) as f32 - 0.5 } else { 0.0 };
            let ang = (self.angle - self.spread * t).to_radians();
            let r0 = [self.root[0] + self.root_step[0] * k as f32, self.root[1] + self.root_step[1] * k as f32];
            let d = [ang.cos(), ang.sin()];
            let nrm = [-d[1], d[0]];
            let l = self.length * (1.0 - 0.12 * (t.abs() * 2.0));
            // a slight arc: the middle pushed off the straight line, droop increasing outwards
            let pts: Vec<P2> = (0..4).map(|i| {
                let u = i as f32 / 3.0;
                let off = -self.bend * l * u * u;
                [(r0[0] + d[0] * l * u + nrm[0] * off) * s, r0[1] + d[1] * l * u + nrm[1] * off]
            }).collect();
            roots.push(pts[0]);
            a.strokes.push(Stroke { pts, w: vec![self.width * 0.7, self.width, self.width * 0.55, 0.0], col: self.ink });
        }
        a.guides.push(Guide { name: "whisker-roots", pts: roots });
        a
    }
}

// ---------------------------------------------------------------- arcs

/// Arcs: the brush's basic mark, on their own — named brush strokes (points
/// in metres in the bone's plane, a width at each, a colour each, ink when
/// none) for the long lines of a figure that belong to no smaller feature:
/// a head's outline, a crease, a lock of hair. Each is also a guide by its
/// name.
pub fn arcs(j: &Json) -> Art {
    let mut a = Art::default();
    let ink = hex(&j.get("inkColor").as_str()).unwrap_or([0.02, 0.014, 0.03]);
    for l in j.get("arcs").items() {
        let pts = pts_of(&l, "pts", &[]);
        let w = nums(&l.get("w"));
        if pts.len() < 2 || w.len() != pts.len() { continue; }
        let col = hex(&l.get("color").as_str()).unwrap_or(ink);
        a.strokes.push(Stroke { pts: pts.clone(), w, col });
        let name: &'static str = match l.get("name").as_str().as_str() { "head-right" => "head-outline", "hair-lock" => "hair", _ => "arc" };
        a.guides.push(Guide { name, pts });
    }
    a
}

// ---------------------------------------------------------------- earring

/// An earring: a ball and gems hanging under it, each gem a four-point
/// diamond [top, right, bottom, left] lit on its left half, all outlined
/// with a brush line that comes to points at the gems' tips. Its own
/// feature so a character can wear it or not, in any colour.
pub fn earring(j: &Json) -> Art {
    let mut a = Art::default();
    let ink = hex(&j.get("inkColor").as_str()).unwrap_or([0.02, 0.014, 0.03]);
    let light = hex(&j.get("color").as_str()).unwrap_or([0.87, 0.52, 0.12]);
    let dark = hex(&j.get("shade").as_str()).unwrap_or([0.7, 0.36, 0.05]);
    let ow = j.get("outline").as_num(0.002) as f32;
    let b = nums(&j.get("ball"));
    if b.len() >= 3 {
        let ring = circle([b[0], b[1]], b[2], b[2], 20);
        a.fills.push(Fill { pts: ring.clone(), col: light });
        let hi = circle([b[0] - b[2] * 0.3, b[1] + b[2] * 0.3], b[2] * 0.35, b[2] * 0.3, 10);
        a.fills.push(Fill { pts: hi, col: [1.0, 0.85, 0.55] });
        let mut o = ring.clone(); o.push(ring[0]);
        let n = o.len();
        a.strokes.push(Stroke { pts: o, w: vec![ow; n], col: ink });
    }
    for g in j.get("gems").items() {
        let q = pts_of(&g, "pts", &[]);
        if q.len() != 4 { continue; }
        let (t, r, bt, l) = (q[0], q[1], q[2], q[3]);
        a.fills.push(Fill { pts: vec![t, r, bt, l], col: dark });
        a.fills.push(Fill { pts: vec![t, [(t[0] + bt[0]) / 2.0, (t[1] + bt[1]) / 2.0], bt, l], col: light });
        // outline: from the top tip round to the bottom tip, pointed at both
        // (straight edges: each its own stroke, swelling to the side corner)
        for side in [r, l] {
            a.strokes.push(Stroke { pts: vec![t, side], w: vec![0.0, ow * 1.2], col: ink });
            a.strokes.push(Stroke { pts: vec![side, bt], w: vec![ow * 1.2, 0.0], col: ink });
        }
        a.guides.push(Guide { name: "earring", pts: vec![t, r, bt, l] });
    }
    a
}

fn point_in(poly: &[P2], p: P2) -> bool {
    let mut c = false;
    for i in 0..poly.len() {
        let (a, b) = (poly[i], poly[(i + 1) % poly.len()]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < a[0] + (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) { c = !c; }
    }
    c
}

fn pts_of(j: &Json, k: &str, d: &[P2]) -> Vec<P2> {
    let v: Vec<P2> = j.get(k).items().iter().map(|p| { let n = nums(p); [n.first().copied().unwrap_or(0.0), n.get(1).copied().unwrap_or(0.0)] }).collect();
    if v.len() >= 2 { v } else { d.to_vec() }
}

/// the convex hull of the points (counter-clockwise; monotone chain)
fn convex_hull(p: &[P2]) -> Vec<P2> {
    let mut v = p.to_vec();
    v.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap().then(a[1].partial_cmp(&b[1]).unwrap()));
    let crs = |o: P2, a: P2, b: P2| (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    let mut h: Vec<P2> = Vec::new();
    for pass in 0..2 {
        let start = h.len();
        let it: Box<dyn Iterator<Item = &P2>> = if pass == 0 { Box::new(v.iter()) } else { Box::new(v.iter().rev()) };
        for &q in it {
            while h.len() >= start + 2 && crs(h[h.len() - 2], h[h.len() - 1], q) <= 0.0 { h.pop(); }
            h.push(q);
        }
        h.pop();
    }
    h
}

// ---------------------------------------------------------------- helpers

fn nums(j: &Json) -> Vec<f32> {
    j.items().iter().map(|x| x.as_num(0.0) as f32).collect()
}

fn vec3(j: &Json, d: [f32; 3]) -> [f32; 3] {
    let n = nums(j);
    if n.len() >= 3 { [n[0], n[1], n[2]] } else { d }
}

/// "#rrggbb" (sRGB) as a linear colour
pub fn hex(s: &str) -> Option<[f32; 3]> {
    let s = s.trim_start_matches('#');
    if s.len() != 6 { return None; }
    let v = u32::from_str_radix(s, 16).ok()?;
    let lin = |c: u32| { let x = c as f32 / 255.0; if x <= 0.04045 { x / 12.92 } else { ((x + 0.055) / 1.055).powf(2.4) } };
    Some([lin(v >> 16 & 255), lin(v >> 8 & 255), lin(v & 255)])
}

/// a profile (values at even steps over 0..1) at t, linearly between
fn sample(v: &[f32], t: f32) -> f32 {
    if v.is_empty() { return 0.0; }
    let x = t.clamp(0.0, 1.0) * (v.len() - 1) as f32;
    let i = (x as usize).min(v.len() - 1);
    let j = (i + 1).min(v.len() - 1);
    v[i] + (v[j] - v[i]) * (x - i as f32)
}

/// a Catmull-Rom curve through the points, `n` steps a span (the ends included)
pub fn catmull(p: &[P2], n: usize) -> Vec<P2> {
    let mut out = Vec::new();
    for i in 0..p.len().saturating_sub(1) {
        let (p0, p1, p2, p3) = (p[i.saturating_sub(1)], p[i], p[i + 1], p[(i + 2).min(p.len() - 1)]);
        for k in 0..n {
            let t = k as f32 / n as f32;
            let (t2, t3) = (t * t, t * t * t);
            let cr = |a: f32, b: f32, c: f32, d: f32| 0.5 * (2.0 * b + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3);
            out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
        }
    }
    if let Some(l) = p.last() { out.push(*l); }
    out
}

fn circle(c: P2, rx: f32, ry: f32, n: usize) -> Vec<P2> {
    (0..n).map(|i| { let a = i as f32 / n as f32 * std::f32::consts::TAU; [c[0] + a.cos() * rx, c[1] + a.sin() * ry] }).collect()
}

fn area(p: &[P2]) -> f32 {
    let mut s = 0.0;
    for i in 0..p.len() { let (a, b) = (p[i], p[(i + 1) % p.len()]); s += a[0] * b[1] - b[0] * a[1]; }
    s * 0.5
}

/// a (possibly concave) polygon cut to a convex one; the same clipping,
/// named for where the subject may be concave
fn clip_poly_convex(subject: &[P2], clip: &[P2]) -> Vec<P2> { clip_convex(subject, clip) }

/// a polygon cut to a convex one (Sutherland-Hodgman)
pub fn clip_convex(subject: &[P2], clip: &[P2]) -> Vec<P2> {
    let mut c = clip.to_vec();
    if area(&c) < 0.0 { c.reverse(); }
    let mut out = subject.to_vec();
    for i in 0..c.len() {
        if out.is_empty() { break; }
        let (a, b) = (c[i], c[(i + 1) % c.len()]);
        let inside = |p: P2| (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0.0;
        let inp = std::mem::take(&mut out);
        for k in 0..inp.len() {
            let (p, q) = (inp[k], inp[(k + 1) % inp.len()]);
            let (ip, iq) = (inside(p), inside(q));
            if ip { out.push(p); }
            if ip != iq {
                let (d1, d2) = ([q[0] - p[0], q[1] - p[1]], [b[0] - a[0], b[1] - a[1]]);
                let den = d1[0] * d2[1] - d1[1] * d2[0];
                if den.abs() > 1e-12 {
                    let t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den;
                    out.push([p[0] + d1[0] * t, p[1] + d1[1] * t]);
                }
            }
        }
    }
    out
}

/// triangles of a simple polygon (ear clipping), as index triples
pub fn triangulate(p: &[P2]) -> Vec<[usize; 3]> {
    let mut idx: Vec<usize> = (0..p.len()).collect();
    if area(p) < 0.0 { idx.reverse(); }
    let crs = |a: P2, b: P2, c: P2| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let mut out = Vec::new();
    let mut guard = 0;
    while idx.len() > 3 && guard < 10000 {
        guard += 1;
        let mut cut = false;
        for i in 0..idx.len() {
            let (ia, ib, ic) = (idx[(i + idx.len() - 1) % idx.len()], idx[i], idx[(i + 1) % idx.len()]);
            let (a, b, c) = (p[ia], p[ib], p[ic]);
            if crs(a, b, c) <= 1e-12 { continue; }
            if idx.iter().any(|&j| j != ia && j != ib && j != ic && crs(a, b, p[j]) >= 0.0 && crs(b, c, p[j]) >= 0.0 && crs(c, a, p[j]) >= 0.0) { continue; }
            out.push([ia, ib, ic]);
            idx.remove(i);
            cut = true;
            break;
        }
        if !cut { break; }
    }
    if idx.len() == 3 { out.push([idx[0], idx[1], idx[2]]); }
    out
}
