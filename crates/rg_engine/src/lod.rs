// SPDX-License-Identifier: AGPL-3.0-or-later
//! Level of detail: how much of a thing is drawn, chosen every frame by how
//! big it is on the screen, and drawn live in that form (no kept pictures).
//!
//! Two kinds:
//!
//! - Steps (`pick`): a 3D object's meshes (scene3d `lod`), one of a few
//!   forms. A step changes only when the size has passed the step's limit
//!   by a margin (hysteresis), so an object at the limit does not flick
//!   between two forms from frame to frame.
//! - Continuous (`globe_level`): a globe's shading (globes are cast a ray a
//!   pixel, so they have no triangles to drop). The level is a number that
//!   follows the size smoothly, and the shader fades each costly part out
//!   over a range of it (globe.fs `lod`), so nothing pops in or out.

/// The size on the screen (game units, about CSS pixels) of a ball of
/// radius `r` whose middle is `dist` from the eye, seen with `focal`
/// (units a radian at the middle of the screen): its diameter. Closer than
/// its radius (the eye inside it): f64::MAX.
pub fn screen_size(r: f64, dist: f64, focal: f64) -> f64 {
    if r <= 0.0 {
        return 0.0;
    }
    if dist <= r {
        return f64::MAX;
    }
    // the angle the ball takes, as a tangent: exact for a ball at the middle of the view
    let s = r / dist;
    2.0 * focal * s / (1.0 - s * s).sqrt()
}

/// The step for `size` (each step's limit in `limits`, largest first: step
/// i + 1 is used below limits[i]) given the step drawn last frame, with
/// `margin` (0.1: 10 %) on either side of each limit.
pub fn pick(size: f64, limits: &[f64], last: usize, margin: f64) -> usize {
    let mut want = 0;
    for (i, l) in limits.iter().enumerate() {
        if size < *l {
            want = i + 1;
        }
    }
    let last = last.min(limits.len());
    if want == last {
        return last;
    }
    // coarser: only once the size is under the limit by the margin
    // finer: only once it is over the limit by the margin
    let mut step = last;
    while step < want && size < limits[step] * (1.0 - margin) {
        step += 1;
    }
    while step > want && size > limits[step - 1] * (1.0 + margin) {
        step -= 1;
    }
    step
}

/// A globe's radius on the screen (game units) at which it is drawn in full;
/// each halving of the size adds 1 to the level.
pub const GLOBE_FULL: f64 = 96.0;
/// The highest globe level (6 units of radius and less).
pub const GLOBE_MAX: f64 = 4.0;

/// A globe's level for its radius on the screen (game units): 0 at
/// `GLOBE_FULL` and over, 1 at half of it, up to `GLOBE_MAX`.
pub fn globe_level(radius: f64) -> f64 {
    if radius <= 0.0 {
        return GLOBE_MAX;
    }
    (GLOBE_FULL / radius).log2().clamp(0.0, GLOBE_MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_size_on_the_screen_halves_with_twice_the_distance_far_off() {
        let a = screen_size(1.0, 100.0, 500.0);
        let b = screen_size(1.0, 200.0, 500.0);
        assert!((a / b - 2.0).abs() < 1e-3, "{a} {b}");
        assert_eq!(screen_size(1.0, 0.5, 500.0), f64::MAX);
        assert_eq!(screen_size(0.0, 5.0, 500.0), 0.0);
    }

    #[test]
    fn a_step_changes_only_past_its_margin() {
        let limits = [100.0, 30.0, 5.0];
        assert_eq!(pick(150.0, &limits, 0, 0.1), 0);
        // just under the first limit: still the finest
        assert_eq!(pick(95.0, &limits, 0, 0.1), 0);
        // under it by more than 10 %: the next
        assert_eq!(pick(85.0, &limits, 0, 0.1), 1);
        // back up just over it: stays
        assert_eq!(pick(105.0, &limits, 1, 0.1), 1);
        assert_eq!(pick(115.0, &limits, 1, 0.1), 0);
        // a big jump goes through every step at once
        assert_eq!(pick(1.0, &limits, 0, 0.1), 3);
        assert_eq!(pick(500.0, &limits, 3, 0.1), 0);
        // a size between: the nearest step that its margins allow
        assert_eq!(pick(29.0, &limits, 0, 0.1), 1);
        assert_eq!(pick(4.0, &limits, 1, 0.1), 3);
        // no limits: always the one form
        assert_eq!(pick(1.0, &[], 0, 0.1), 0);
    }

    #[test]
    fn a_step_does_not_flick_at_its_limit() {
        let limits = [50.0];
        let mut s = 0;
        let mut changes = 0;
        for i in 0..200 {
            // the size wobbling 5 % round the limit
            let size = 50.0 * (1.0 + 0.05 * (i as f64 * 0.7).sin());
            let n = pick(size, &limits, s, 0.1);
            if n != s {
                changes += 1;
            }
            s = n;
        }
        assert_eq!(changes, 0);
    }

    #[test]
    fn the_globe_level_follows_the_size_smoothly() {
        assert_eq!(globe_level(200.0), 0.0);
        assert_eq!(globe_level(GLOBE_FULL), 0.0);
        assert!((globe_level(GLOBE_FULL / 2.0) - 1.0).abs() < 1e-9);
        assert!((globe_level(GLOBE_FULL / 8.0) - 3.0).abs() < 1e-9);
        assert_eq!(globe_level(1.0), GLOBE_MAX);
        // no jumps: a 1 % smaller ball is at most a little higher
        let mut r = 200.0;
        let mut last = globe_level(r);
        while r > 2.0 {
            r *= 0.99;
            let l = globe_level(r);
            assert!(l - last < 0.02 && l >= last);
            last = l;
        }
    }
}
