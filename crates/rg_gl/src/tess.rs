// SPDX-License-Identifier: AGPL-3.0-or-later
//! Paths and strokes to triangles (points as x, y pairs in the game's units).

/// Whether the ring (x, y pairs) is convex (and not degenerate).
pub fn convex(pts: &[f32]) -> bool {
    let n = pts.len() / 2;
    if n < 3 {
        return false;
    }
    let mut sign = 0.0f32;
    for i in 0..n {
        let (ax, ay) = (pts[i * 2], pts[i * 2 + 1]);
        let (bx, by) = (pts[(i + 1) % n * 2], pts[(i + 1) % n * 2 + 1]);
        let (cx, cy) = (pts[(i + 2) % n * 2], pts[(i + 2) % n * 2 + 1]);
        let z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
        if z.abs() < 1e-9 {
            continue;
        }
        if sign == 0.0 {
            sign = z.signum();
        } else if z.signum() != sign {
            return false;
        }
    }
    sign != 0.0
}

/// A stroke of width `w` along the points (closed: back to the first) with
/// round joins and caps, as triangles (x, y per corner). `seg`: the pieces
/// of a whole round end.
pub fn stroke(pts: &[f32], closed: bool, w: f32, seg: usize, out: &mut Vec<f32>) {
    let n = pts.len() / 2;
    if n == 0 || w <= 0.0 {
        return;
    }
    let r = w / 2.0;
    let disc = |out: &mut Vec<f32>, x: f32, y: f32| {
        for k in 0..seg {
            let a0 = k as f32 / seg as f32 * std::f32::consts::TAU;
            let a1 = (k + 1) as f32 / seg as f32 * std::f32::consts::TAU;
            out.extend_from_slice(&[x, y, x + r * a0.cos(), y + r * a0.sin(), x + r * a1.cos(), y + r * a1.sin()]);
        }
    };
    if n == 1 {
        disc(out, pts[0], pts[1]);
        return;
    }
    let count = if closed { n } else { n - 1 };
    for i in 0..count {
        let (ax, ay) = (pts[i * 2], pts[i * 2 + 1]);
        let j = (i + 1) % n;
        let (bx, by) = (pts[j * 2], pts[j * 2 + 1]);
        let (dx, dy) = (bx - ax, by - ay);
        let l = (dx * dx + dy * dy).sqrt();
        if l < 1e-6 {
            continue;
        }
        let (nx, ny) = (-dy / l * r, dx / l * r);
        out.extend_from_slice(&[ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny]);
        out.extend_from_slice(&[ax + nx, ay + ny, bx - nx, by - ny, ax - nx, ay - ny]);
    }
    // round joins and ends: a disc at every point
    for i in 0..n {
        disc(out, pts[i * 2], pts[i * 2 + 1]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convex_or_not() {
        assert!(convex(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]));
        assert!(convex(&[0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 10.0, 0.0]));
        // an arrow head (a dent)
        assert!(!convex(&[0.0, 0.0, 10.0, 5.0, 0.0, 10.0, 3.0, 5.0]));
        assert!(!convex(&[0.0, 0.0, 1.0, 1.0]));
    }

    #[test]
    fn a_stroke_covers_its_segment() {
        let mut out = Vec::new();
        stroke(&[0.0, 0.0, 10.0, 0.0], false, 2.0, 8, &mut out);
        // one quad (2 triangles) and two round ends of 8 pieces
        assert_eq!(out.len(), (2 + 16) * 6);
        let ymax = out.iter().skip(1).step_by(2).cloned().fold(f32::MIN, f32::max);
        assert!((ymax - 1.0).abs() < 1e-5);
    }
}
