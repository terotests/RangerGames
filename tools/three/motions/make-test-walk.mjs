// A procedural walk as joint positions (metres, y up, facing +z): test input
// for retarget.mjs until real motion data (a recorded video through
// TrainingAnalyzer, Quaternius CC0, ACCAD CC BY) is in place.
// node tools/three/motions/make-test-walk.mjs > tools/three/motions/test-walk.json
const T = 1.1, fps = 30, frames = [];
const sin = Math.sin, cos = Math.cos, TAU = 2 * Math.PI;
const leg = (hip, a, kneeBend) => {   // thigh swing a (forward +), knee bend
  const L1 = 0.44, L2 = 0.42;
  const knee = [hip[0], hip[1] - L1 * cos(a), hip[2] + L1 * sin(a)];
  const b = a - kneeBend;
  const ankle = [knee[0], knee[1] - L2 * cos(b), knee[2] + L2 * sin(b)];
  const toe = [ankle[0], ankle[1] - 0.06, ankle[2] + 0.14];
  return [knee, ankle, toe];
};
for (let i = 0; i <= T * fps; i++) {
  const t = i / fps, p = (t / T) * TAU;
  const bob = 0.025 * cos(2 * p), sway = 0.045 * sin(p - Math.PI / 4);   // the pelvis shifts over the leg taking the weight
  const hm = [sway, 0.95 + bob, 0];
  const twist = 0.12 * sin(p);
  const J = {};
  // the pelvis tilts with the walk's phases (art/references/walk-phases-back.png,
  // walk-front-hip-high.png): at contact the forward leg's hip is already
  // higher, the tilt peaks at "down" as that leg takes the weight, and at
  // passing the lifted leg's side still hangs lower; the shoulder line tilts
  // the other way and turns against the pelvis
  const tilt = 0.016 * sin(p - Math.PI / 4);
  J.hipL = [hm[0] + 0.09 * cos(twist), hm[1] + tilt, hm[2] - 0.09 * sin(twist)];
  J.hipR = [hm[0] - 0.09 * cos(twist), hm[1] - tilt, hm[2] + 0.09 * sin(twist)];
  for (const [s, ph] of [["L", 0], ["R", Math.PI]]) {
    const q = p + ph;
    const a = 0.42 * sin(q), kb = 0.08 + 0.55 * Math.max(0, sin(q + 1.2)) ** 2;
    const [k, an, to] = leg(J["hip" + s], a, kb);
    J["knee" + s] = k; J["ankle" + s] = an; J["toe" + s] = to;
  }
  const sm = [hm[0] * 0.5, hm[1] + 0.52, 0.01];
  J.shoulderL = [sm[0] + 0.19 * cos(-1.3 * twist), sm[1] - 1.45 * tilt, sm[2] - 0.19 * sin(-1.3 * twist)];
  J.shoulderR = [sm[0] - 0.19 * cos(-1.3 * twist), sm[1] + 1.45 * tilt, sm[2] + 0.19 * sin(-1.3 * twist)];
  for (const [s, ph] of [["L", Math.PI], ["R", 0]]) {
    const sh = J["shoulder" + s], a = 0.35 * sin(p + ph), e = 0.25 + 0.15 * Math.max(0, sin(p + ph));
    const el = [sh[0], sh[1] - 0.28 * cos(a), sh[2] + 0.28 * sin(a)];
    const wr = [el[0], el[1] - 0.25 * cos(a + e), el[2] + 0.25 * sin(a + e)];
    J["elbow" + s] = el; J["wrist" + s] = wr;
  }
  J.earL = [sm[0] + 0.07, sm[1] + 0.2, 0.0]; J.earR = [sm[0] - 0.07, sm[1] + 0.2, 0.0];
  J.nose = [sm[0], sm[1] + 0.18, 0.11];
  frames.push({ t: +t.toFixed(4), J });
}
console.log(JSON.stringify({ source: "procedural test walk (tools/three/motions/make-test-walk.mjs)", frames }));
