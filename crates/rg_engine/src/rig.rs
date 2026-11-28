// SPDX-License-Identifier: AGPL-3.0-or-later
//! What a game does to a model's skeleton on top of its clips: turns added to
//! bones (a look, an ear's twitch, a head turned towards something) and
//! two-bone IK (a leg reaching a foot target, an arm reaching a point). Both
//! run on the pose the clips give, so they work over any animation.
//!
//! A `<primitive>` takes them as props: `bones={{ "ear.L": [x, y, z] }}`
//! (radians, XYZ order, after the clips' rotation; three more numbers move the
//! bone, metres in its parent) and
//! `ik={[{ chain: ["thigh.L", "shin.L", "foot.L"], target: [x, y, z], pole: [x, y, z], weight: 1 }]}`
//! (the target and pole in the model's own space; the end bone keeps the turn
//! it had, so a planted foot stays flat). With `plant: true` the target is
//! where the clips have the end bone, moved by `target`: the feet stay put
//! while the game lowers the hips (a crouch).

use crate::gltf::{self, Asset, M4};

pub type V3 = [f32; 3];
pub type Q = [f32; 4];
pub type Pose = Vec<([f32; 3], [f32; 4], [f32; 3])>;

fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
fn mul(a: V3, k: f32) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
fn dot(a: V3, b: V3) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
fn len(a: V3) -> f32 { dot(a, a).sqrt() }
fn unit(a: V3) -> V3 { let l = len(a); if l < 1e-9 { [0.0, 0.0, 0.0] } else { mul(a, 1.0 / l) } }

/// a · b (b first, then a), quaternions as x, y, z, w
pub fn qmul(a: Q, b: Q) -> Q {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}
pub fn conj(q: Q) -> Q { [-q[0], -q[1], -q[2], q[3]] }
pub fn qnorm(q: Q) -> Q { let l = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt(); if l < 1e-9 { [0.0, 0.0, 0.0, 1.0] } else { [q[0] / l, q[1] / l, q[2] / l, q[3] / l] } }

/// three.js's Euler 'XYZ' as a quaternion
pub fn euler(x: f32, y: f32, z: f32) -> Q {
    let (c1, s1) = ((x / 2.0).cos(), (x / 2.0).sin());
    let (c2, s2) = ((y / 2.0).cos(), (y / 2.0).sin());
    let (c3, s3) = ((z / 2.0).cos(), (z / 2.0).sin());
    [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]
}

/// the shortest turn from direction a to direction b
pub fn from_to(a: V3, b: V3) -> Q {
    let (a, b) = (unit(a), unit(b));
    let d = dot(a, b);
    if d < -0.999999 {
        let mut ax = cross([1.0, 0.0, 0.0], a);
        if len(ax) < 1e-6 { ax = cross([0.0, 1.0, 0.0], a); }
        let ax = unit(ax);
        return [ax[0], ax[1], ax[2], 0.0];
    }
    let c = cross(a, b);
    qnorm([c[0], c[1], c[2], 1.0 + d])
}

fn pos(m: &M4) -> V3 { [m[12], m[13], m[14]] }
fn rot(m: &M4) -> Q { gltf::decompose(m).1 }

/// Turns added to bones after the clips (each bone's local rotation times its
/// turn), and moves added to their local positions (a crouch: the hips down).
pub fn add_turns(pose: &mut Pose, turns: &[(usize, Q, V3)]) {
    for &(i, q, t) in turns.iter() {
        if let Some(p) = pose.get_mut(i) { p.1 = qnorm(qmul(p.1, q)); p.0 = add(p.0, t); }
    }
}

#[derive(Clone, Debug)]
pub struct Ik {
    pub chain: [usize; 3],
    pub target: V3,
    pub pole: Option<V3>,
    pub weight: f32,
    /// the target is where the clips put the end bone, plus `target` (a planted
    /// foot stays where the walk or the stance has it while the game moves the hips)
    pub plant: bool,
}

/// Two-bone IK: the root and middle bones of the chain turn so that the end
/// bone's origin reaches the target (or as near as the bones reach), bending
/// in the plane the chain already bends in, or towards the pole. The end keeps
/// its turn in the model. `wm` (each node's matrix in the model) is updated.
pub fn two_bone(asset: &Asset, pose: &mut Pose, wm: &mut Vec<M4>, ik: &Ik) {
    let [a, b, c] = ik.chain;
    if a >= wm.len() || b >= wm.len() || c >= wm.len() || ik.weight <= 0.0 { return; }
    let (pa, pb, pc) = (pos(&wm[a]), pos(&wm[b]), pos(&wm[c]));
    let rc0 = rot(&wm[c]);
    let (l1, l2) = (len(sub(pb, pa)), len(sub(pc, pb)));
    if l1 < 1e-6 || l2 < 1e-6 { return; }
    let target = add(pc, mul(sub(ik.target, pc), ik.weight.min(1.0)));
    let at = sub(target, pa);
    let dist = len(at).clamp((l1 - l2).abs() + 1e-4, l1 + l2 - 1e-4);
    let dir = unit(at);
    if len(dir) < 0.5 { return; }
    // the side the middle joint goes to
    let hint = match ik.pole { Some(p) => sub(p, pa), None => sub(pb, pa) };
    let mut side = sub(hint, mul(dir, dot(hint, dir)));
    if len(side) < 1e-5 {
        let n = cross(sub(pb, pa), sub(pc, pb));
        side = cross(n, dir);
    }
    let side = unit(side);
    let cos_a = ((l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist)).clamp(-1.0, 1.0);
    let sin_a = (1.0 - cos_a * cos_a).sqrt();
    let knee = add(pa, mul(add(mul(dir, cos_a), mul(side, sin_a)), l1));
    // the root bone: turned in the model so its child sits at the knee
    let parent_rot = |wm: &Vec<M4>, i: usize| asset.nodes[i].parent.map(|p| rot(&wm[p])).unwrap_or([0.0, 0.0, 0.0, 1.0]);
    let qa = from_to(sub(pb, pa), sub(knee, pa));
    pose[a].1 = qnorm(qmul(conj(parent_rot(wm, a)), qmul(qa, rot(&wm[a]))));
    *wm = gltf::world_matrices(asset, pose);
    let (pb, pc) = (pos(&wm[b]), pos(&wm[c]));
    let qb = from_to(sub(pc, pb), sub(target, pb));
    pose[b].1 = qnorm(qmul(conj(parent_rot(wm, b)), qmul(qb, rot(&wm[b]))));
    *wm = gltf::world_matrices(asset, pose);
    // the end keeps its turn in the model (a planted foot stays flat)
    pose[c].1 = qnorm(qmul(conj(parent_rot(wm, c)), rc0));
    *wm = gltf::world_matrices(asset, pose);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rotate(q: Q, v: V3) -> V3 { let p = qmul(qmul(q, [v[0], v[1], v[2], 0.0]), conj(q)); [p[0], p[1], p[2]] }
    #[test]
    fn from_to_turns_a_onto_b() {
        let q = from_to([1.0, 0.0, 0.0], [0.0, 1.0, 1.0]);
        let r = rotate(q, [2.0, 0.0, 0.0]);
        assert!((r[0]).abs() < 1e-5 && (r[1] - 2f32.sqrt()).abs() < 1e-5 && (r[2] - 2f32.sqrt()).abs() < 1e-5, "{:?}", r);
    }
    #[test]
    fn euler_matches_three_xyz() {
        // three.js: new Quaternion().setFromEuler(new Euler(0.3, -0.5, 0.2, 'XYZ'))
        let q = euler(0.3, -0.5, 0.2);
        let want = [0.119647, -0.257859, 0.058857, 0.956937];
        for k in 0..4 { assert!((q[k] - want[k]).abs() < 2e-4, "{:?}", q); }
    }
}
