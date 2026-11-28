// Motion retargeting: a human motion (joint positions per frame, from any
// source) onto a skeleton of make-cat.mjs's kind (bones with rest positions,
// rest rotations identity).
//
// Sources, each turned into frames of named joints in metres, y up, the
// figure facing +z, its left at +x:
//   fromMediaPipe(seq)  MediaPipe Pose landmarks (33 points), e.g. a
//                       TrainingAnalyzer export (pose_sequence_*.json)
//   fromBVH(text)       a BVH file (CMU, ACCAD and Mixamo-style joint names)
//
// The solver aims each bone along its joints (hips→shoulders for the trunk,
// shoulder→elbow→wrist, hip→knee→ankle for the limbs) and takes the twist
// from a second direction: the hip line, the shoulder line, the ears, and
// for the limbs the plane they bend in (the two-bone chain's IK plane), so a
// knee bends forward and an elbow back whatever the source's bone rolls are.
// The pelvis's height follows the source scaled by leg length.
//
//   import { fromBVH, retarget } from "./retarget.mjs";
//   const tracks = retarget(fromBVH(fs.readFileSync("walk.bvh", "utf8")), BONES);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mid = (a, b) => mul(add(a, b), 0.5);
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

// ---------------------------------------------------------------- quaternions [x, y, z, w]
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [p[0], p[1], p[2]]; };
function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((x) => -x); d = -d; }
  if (d > 0.9995) { const r = a.map((x, i) => x + (b[i] - x) * t); const l = Math.hypot(...r); return r.map((x) => x / l); }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((x, i) => (x * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s);
}
// rotation matrix (columns c0 c1 c2) → quaternion
function qmat(c0, c1, c2) {
  const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  const l = Math.hypot(...q); return q.map((x) => x / l);
}
// an orthonormal frame from a main direction d and a second direction s
function frame(d, s) {
  const a = norm(d);
  let b = sub(s, mul(a, dot(s, a)));
  if (len(b) < 1e-6) b = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
  b = norm(b);
  return [a, b, cross(a, b)];
}
// the rotation taking the rest frame (d0, s0) onto the target frame (d, s)
function align(d0, s0, d, s) {
  const [a0, b0, c0] = frame(d0, s0), [a, b, c] = frame(d, s);
  const qa = qmat(a, b, c), qb = qmat(a0, b0, c0);
  return qmul(qa, qinv(qb));
}

// ---------------------------------------------------------------- sources
// MediaPipe Pose: image x right, y down, z towards the camera negative; the
// subject's left is landmark 11, 13, … (on the image's right when facing it)
const MP = { nose: 0, earL: 7, earR: 8, shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16, indexL: 19, indexR: 20, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28, toeL: 31, toeR: 32 };
export function fromMediaPipe(seq, { height = 1.7 } = {}) {
  const frames = (seq.frames || seq).map((f) => {
    const L = (f.pose3D ? f.pose3D.landmarks : f.landmarks);
    const J = {};
    for (const [k, i] of Object.entries(MP)) { const p = L[i]; J[k] = [p.x, -p.y, -(p.z || 0)]; }
    return { t: f.timestamp ?? f.t, J };
  });
  // image units → metres: nose-to-ankle span of the tallest frame ≈ 0.9 of the height
  let span = 0;
  for (const f of frames) span = Math.max(span, f.J.nose[1] - Math.min(f.J.ankleL[1], f.J.ankleR[1]));
  const k = span > 0 ? (0.9 * height) / span : 1;
  for (const f of frames) for (const n in f.J) f.J[n] = mul(f.J[n], k);
  return frames;
}

// BVH: hierarchy → forward kinematics → joint positions. Units are scaled to
// metres from the figure's standing height.
const BVH_NAMES = [
  ["hips", /^(hips|pelvis|root)$/i], ["spine", /^(spine|lowerback|spine1|spine_01)$/i], ["chest", /^(spine2|chest|upperchest|spine_03|spine_02|spine1)$/i],
  ["neck", /^neck(1|_01)?$/i], ["head", /^head$/i], ["headTop", /^(headtop_end|head_end|headend)$/i],
  ["shoulderL", /^(left(arm|upperarm)|l_?upperarm|lhumerus|upperarm_l)$/i], ["elbowL", /^(left(forearm|lowerarm)|l_?forearm|lradius|lowerarm_l)$/i], ["wristL", /^(lefthand|l_?hand|lwrist|hand_l)$/i],
  ["shoulderR", /^(right(arm|upperarm)|r_?upperarm|rhumerus|upperarm_r)$/i], ["elbowR", /^(right(forearm|lowerarm)|r_?forearm|rradius|lowerarm_r)$/i], ["wristR", /^(righthand|r_?hand|rwrist|hand_r)$/i],
  ["hipL", /^(left(upleg|thigh|hip)|l_?thigh|lfemur|thigh_l)$/i], ["kneeL", /^(left(leg|shin|knee)|l_?calf|ltibia|calf_l)$/i], ["ankleL", /^(leftfoot|l_?foot|lfoot|foot_l)$/i], ["toeL", /^(lefttoebase|lefttoe|l_?toe|ltoes|ball_l)$/i],
  ["hipR", /^(right(upleg|thigh|hip)|r_?thigh|rfemur|thigh_r)$/i], ["kneeR", /^(right(leg|shin|knee)|r_?calf|rtibia|calf_r)$/i], ["ankleR", /^(rightfoot|r_?foot|rfoot|foot_r)$/i], ["toeR", /^(righttoebase|righttoe|r_?toe|rtoes|ball_r)$/i],
];
const mapNames = (names) => { const map = {}; for (const [k, re] of BVH_NAMES) { const j = names.findIndex((n) => re.test(n.replace(/^.*[:|]/, ""))); if (j >= 0 && !(k in map)) map[k] = j; } return map; };

// glTF / GLB (e.g. Quaternius Universal Animation Library): the skeleton's
// nodes and one animation (by name or index) → joint positions per frame.
export function gltfAnimations(buf) {
  const { json } = readGlb(buf);
  return (json.animations || []).map((a, i) => a.name || "anim" + i);
}
function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) return { json: JSON.parse(buf.toString("utf8")), bin: null };
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const n = buf.readUInt32LE(o), t = buf.readUInt32LE(o + 4);
    const c = buf.subarray(o + 8, o + 8 + n);
    if (t === 0x4e4f534a) json = JSON.parse(c.toString("utf8")); else if (t === 0x004e4942) bin = c;
    o += 8 + n;
  }
  return { json, bin };
}
export function fromGLTF(buf, anim = 0, { height = 1.7, fps = 30 } = {}) {
  const { json, bin } = readGlb(buf);
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const nc = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || nc * 4, out = [];
    for (let k = 0; k < a.count; k++) { const e = []; for (let c = 0; c < nc; c++) e.push(bin.readFloatLE(off + k * stride + c * 4)); out.push(nc === 1 ? e[0] : e); }
    return out;
  };
  const A = typeof anim === "number" ? json.animations[anim] : json.animations.find((a) => a.name === anim);
  const nodes = json.nodes, parent = nodes.map(() => -1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const ch = A.channels.map((c) => { const sm = A.samplers[c.sampler]; return { node: c.target.node, path: c.target.path, t: acc(sm.input), v: acc(sm.output), step: sm.interpolation === "STEP" }; });
  const tEnd = Math.max(...ch.map((c) => c.t[c.t.length - 1]));
  const sample = (c, t) => {
    let k = 0; while (k + 1 < c.t.length && c.t[k + 1] <= t) k++;
    if (k + 1 >= c.t.length || c.step) return c.v[k];
    const u = (t - c.t[k]) / (c.t[k + 1] - c.t[k]);
    return c.path === "rotation" ? qslerp(c.v[k], c.v[k + 1], u) : lerp(c.v[k], c.v[k + 1], u);
  };
  const map = mapNames(nodes.map((n) => n.name || ""));
  const frames = [];
  const n = Math.max(1, Math.round(tEnd * fps));
  for (let f = 0; f <= n; f++) {
    const t = Math.min(tEnd, f / fps);
    const T = nodes.map((nd) => ({ p: nd.translation || [0, 0, 0], q: nd.rotation || [0, 0, 0, 1], s: nd.scale || [1, 1, 1] }));
    for (const c of ch) { const v = sample(c, t); if (c.path === "translation") T[c.node].p = v; else if (c.path === "rotation") T[c.node].q = v; else if (c.path === "scale") T[c.node].s = v; }
    const G = new Array(nodes.length);
    const world = (i) => {
      if (G[i]) return G[i];
      const L = T[i], P = parent[i] < 0 ? { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] } : world(parent[i]);
      const sp = [L.p[0] * P.s[0], L.p[1] * P.s[1], L.p[2] * P.s[2]];
      return (G[i] = { p: add(P.p, qrot(P.q, sp)), q: qmul(P.q, L.q), s: [P.s[0] * L.s[0], P.s[1] * L.s[1], P.s[2] * L.s[2]] });
    };
    const J = {};
    for (const k in map) J[k] = world(map[k]).p;
    frames.push({ t, J });
  }
  return normalise(frames, height);
}
// scale to metres from the standing height; turn the figure so its left (hip R → hip L) is +x
function normalise(frames, height, facing = null) {
  let top = -Infinity, bottom = Infinity;
  for (const p of Object.values(frames[0].J)) { top = Math.max(top, p[1]); bottom = Math.min(bottom, p[1]); }
  const k = height / ((top - bottom) * 1.06 || 1);
  let yaw = facing;
  if (yaw === null) { const s = sub(frames[0].J.hipL, frames[0].J.hipR); yaw = Math.atan2(-s[2], s[0]); }
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const fr of frames) for (const n in fr.J) { const p = fr.J[n]; fr.J[n] = mul([p[0] * c - p[2] * sn, p[1], p[0] * sn + p[2] * c], k); }
  return frames;
}

export function fromBVH(text, { height = 1.7, facing = null } = {}) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  const stack = [];
  while (tok[i] !== "MOTION") {
    const t = tok[i++];
    if (t === "ROOT" || t === "JOINT" || t === "End") {
      const name = t === "End" ? (joints[stack[stack.length - 1]].name + "_End") : tok[i++];
      if (t === "End") i++;   // "Site"
      joints.push({ name, parent: stack.length ? stack[stack.length - 1] : -1, off: [0, 0, 0], ch: [] });
    } else if (t === "{") stack.push(joints.length - 1);
    else if (t === "}") stack.pop();
    else if (t === "OFFSET") { joints[joints.length - 1].off = [+tok[i++], +tok[i++], +tok[i++]]; }
    else if (t === "CHANNELS") { const n = +tok[i++]; for (let k = 0; k < n; k++) joints[joints.length - 1].ch.push(tok[i++]); }
  }
  i++;
  const nf = +tok[i + 1]; i += 2;
  const dt = +tok[i + 2]; i += 3;
  const deg = Math.PI / 180;
  const axisQ = (ax, a) => { const s = Math.sin(a / 2); return ax === "X" ? [s, 0, 0, Math.cos(a / 2)] : ax === "Y" ? [0, s, 0, Math.cos(a / 2)] : [0, 0, s, Math.cos(a / 2)]; };
  const map = mapNames(joints.map((J) => J.name));
  const frames = [];
  for (let f = 0; f < nf; f++) {
    const G = [];
    for (let j = 0; j < joints.length; j++) {
      const J = joints[j];
      let pos = J.off.slice(), q = [0, 0, 0, 1];
      for (const c of J.ch) {
        const v = +tok[i++];
        if (c.endsWith("position")) pos[{ X: 0, Y: 1, Z: 2 }[c[0]]] = v;
        else q = qmul(q, axisQ(c[0], v * deg));   // channels apply in the order listed (intrinsic)
      }
      if (J.parent < 0) G.push({ p: pos, q });
      else { const P = G[J.parent]; G.push({ p: add(P.p, qrot(P.q, pos)), q: qmul(P.q, q) }); }
    }
    const Jn = {};
    for (const k in map) Jn[k] = G[map[k]].p;
    frames.push({ t: f * dt, J: Jn });
  }
  return normalise(frames, height, facing);
}

// ---------------------------------------------------------------- the solver
// bones: [[name, parent, rest position], …] (make-cat.mjs BONES, after its
// proportion remap). Returns writeGlb tracks.
export function retarget(frames, bones, { fps = 30, loop = false, inPlace = true, spread = null, bend = null } = {}) {
  const B = Object.fromEntries(bones.map((b, i) => [b[0], i]));
  const R = (n) => bones[B[n]][2];
  const restDir = (a, b) => sub(R(b), R(a));
  // the source's derived points
  const derive = (J) => {
    const hm = mid(J.hipL, J.hipR), sm = mid(J.shoulderL, J.shoulderR);
    const headC = J.earL ? mid(J.earL, J.earR) : (J.head || add(sm, mul(norm(sub(sm, hm)), 0.25)));
    return { ...J, hm, sm, headC, chestP: J.chest || lerp(hm, sm, 0.6) };
  };
  let F = frames.map((f) => ({ t: f.t, J: derive(f.J) }));
  // styling: the ankles drawn toward the body's middle line to the wanted
  // spread (the toes with them, the knees half way), and a knee brought forward
  if (spread != null || bend) {
    let s0 = 0;
    for (const { J } of F) s0 += Math.abs(J.ankleL[0] - J.ankleR[0]);
    const k = spread != null ? spread / (s0 / F.length || 1) : 1;
    F = F.map(({ t, J }) => {
      const N = { ...J };
      for (const sd of ["L", "R"]) {
        const dx = (J["ankle" + sd][0] - J.hm[0]) * (k - 1);
        const mv = (n, f, dz = 0) => { if (J[n + sd]) N[n + sd] = [J[n + sd][0] + dx * f, J[n + sd][1], J[n + sd][2] + dz]; };
        mv("ankle", 1); mv("toe", 1); mv("knee", 0.5, bend && bend[sd] ? bend[sd] : 0);
      }
      return { t, J: derive(N) };
    });
  }
  // leg length → the pelvis height scale
  const legSrc = len(sub(F[0].J.kneeL, F[0].J.hipL)) + len(sub(F[0].J.ankleL, F[0].J.kneeL));
  const legCat = len(restDir("thigh.L", "shin.L")) + len(restDir("shin.L", "foot.L"));
  const sc = legCat / (legSrc || 1);
  let ground = Infinity;
  for (const f of F) ground = Math.min(ground, f.J.ankleL[1], f.J.ankleR[1]);
  const catAnkle = R("foot.L")[1];
  const h0 = F[0].J.hm;
  const X = [1, 0, 0], Z = [0, 0, 1];

  // the clip's average neck direction in the ribcage frame (see the neck below)
  let neckMean = [0, 0, 0];
  for (const { J } of F) {
    const gC = align(X, [0, 1, 0], sub(J.shoulderL, J.shoulderR), sub(J.sm, J.chestP));
    neckMean = add(neckMean, norm(qrot(qinv(gC), sub(J.headTop || J.headC, J.neck || J.sm))));
  }
  neckMean = norm(neckMean);
  const out = { rot: {}, hipsT: [] };
  const names = ["hips", "spine", "chest", "neck", "head", "uarm.L", "farm.L", "hand.L", "uarm.R", "farm.R", "hand.R", "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R"];
  for (const n of names) out.rot[n] = [];
  for (const { J } of F) {
    const G = {};
    const local = (n, g) => { const p = bones[B[n]][1]; const gp = G[bones[p][0]] || [0, 0, 0, 1]; G[n] = g; out.rot[n].push(qmul(qinv(gp), g)); };
    const keep = (n) => { const p = bones[B[n]][1]; G[n] = G[bones[p][0]] || [0, 0, 0, 1]; };   // a bone that follows its parent
    const hipS = sub(J.hipL, J.hipR), shS = sub(J.shoulderL, J.shoulderR), up = sub(J.sm, J.hm);
    // the pelvis and the ribcage take their tilt from the hip and shoulder
    // lines (primary), their lean from the trunk (secondary): with the trunk
    // primary the lines' tilt would be projected away
    const gH = align(X, [0, 1, 0], hipS, up);
    const gC = align(X, [0, 1, 0], shS, sub(J.sm, J.chestP));
    local("hips", gH);
    local("spine", qslerp(gH, gC, 0.5));
    local("chest", gC);
    // neck and head. Source skeletons carry their own built-in neck lean
    // (Quaternius: head joint far ahead of the shoulders), which copied
    // as-is pitches the cat's head down into the collar. Without a face
    // (ears + nose) only the head's movement around the clip's average
    // neck direction is kept: half to the neck, half to the head.
    const headS = J.earL ? sub(J.earL, J.earR) : shS;
    if (J.nose && J.earL) {
      local("neck", qslerp(gC, align([0, 1, 0], X, sub(J.headC, J.sm), headS), 0.5));
      local("head", align(Z, X, sub(J.nose, J.headC), headS));
    } else {
      const dl = norm(qrot(qinv(gC), sub(J.headTop || J.headC, J.neck || J.sm)));
      const v = cross(neckMean, dl), w = 1 + dot(neckMean, dl);
      const qN = w < 1e-6 ? [0, 0, 0, 1] : (() => { const l = Math.hypot(v[0], v[1], v[2], w); return [v[0] / l, v[1] / l, v[2] / l, w / l]; })();
      const half = qslerp([0, 0, 0, 1], qN, 0.5);
      local("neck", qmul(gC, half));
      local("head", qmul(G.neck, half));
    }
    for (const s of ["L", "R"]) {
      keep("shoulder." + s);
      // arm: the elbow bends the forearm forward (its bend axis is -x at rest)
      const sh = J["shoulder" + s], el = J["elbow" + s], wr = J["wrist" + s];
      let bendA = cross(sub(el, sh), sub(wr, el));
      if (len(bendA) < 1e-4 * len(sub(el, sh)) ** 2) bendA = qrot(G["shoulder." + s], [-1, 0, 0]);
      const gU = align(restDir("uarm." + s, "farm." + s), [-1, 0, 0], sub(el, sh), bendA);
      local("uarm." + s, gU);
      const gF = align(restDir("farm." + s, "hand." + s), [-1, 0, 0], sub(wr, el), bendA);
      local("farm." + s, gF);
      const ix = J["index" + s];
      if (ix) local("hand." + s, align([0, -1, 0], [-1, 0, 0], sub(ix, wr), bendA)); else local("hand." + s, gF);
      // leg: the knee bends the shin back (bend axis +x at rest)
      const hp = J["hip" + s], kn = J["knee" + s], an = J["ankle" + s];
      let bendL = cross(sub(kn, hp), sub(an, kn));
      if (len(bendL) < 1e-4 * len(sub(kn, hp)) ** 2) bendL = qrot(gH, [1, 0, 0]);
      local("thigh." + s, align(restDir("thigh." + s, "shin." + s), [1, 0, 0], sub(kn, hp), bendL));
      const gS = align(restDir("shin." + s, "foot." + s), [1, 0, 0], sub(an, kn), bendL);
      local("shin." + s, gS);
      const to = J["toe" + s];
      if (to) local("foot." + s, align(Z, [1, 0, 0], sub(to, an), bendL)); else local("foot." + s, gS);
    }
    // the pelvis: sideways and forward from the first frame, its height from the ground, scaled
    const d = mul(sub(J.hm, h0), sc);
    const hy = catAnkle + (J.hm[1] - ground) * sc;
    const hr = R("hips");
    out.hipsT.push([hr[0] + d[0], hy, hr[2] + d[2]]);
  }
  // in place: the source's travel (a straight line from the first frame's
  // pelvis to the last's) is taken out, the sway and bob stay
  if (inPlace && out.hipsT.length > 1) {
    const a = out.hipsT[0], b = out.hipsT[out.hipsT.length - 1], n1 = out.hipsT.length - 1;
    out.hipsT = out.hipsT.map((p, i) => [p[0] - (b[0] - a[0]) * i / n1, p[1], p[2] - (b[2] - a[2]) * i / n1]);
  }
  // resample to fps
  const t0 = F[0].t, t1 = F[F.length - 1].t;
  const n = Math.max(1, Math.round((t1 - t0) * fps));
  const times = Array.from({ length: n + 1 }, (_, i) => +(i / fps).toFixed(4));
  const at = (arr, t, f) => {
    const x = t + t0;
    let k = 0;
    while (k + 1 < F.length - 1 && F[k + 1].t <= x) k++;
    const u = Math.min(1, Math.max(0, (x - F[k].t) / ((F[k + 1] || F[k]).t - F[k].t || 1)));
    return f(arr[k], arr[Math.min(k + 1, arr.length - 1)], u);
  };
  const tracks = [];
  for (const nm of names) tracks.push([B[nm], "rotation", times, times.flatMap((t) => at(out.rot[nm], t, qslerp))]);
  tracks.push([B.hips, "translation", times, times.flatMap((t) => at(out.hipsT, t, lerp))]);
  if (loop) for (const tr of tracks) { const k = tr[0] === B.hips && tr[1] === "translation" ? 3 : 4; tr[3].splice(-k, k, ...tr[3].slice(0, k)); }
  return tracks;
}
