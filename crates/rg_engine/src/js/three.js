// SPDX-License-Identifier: AGPL-3.0-or-later
//
// three.js's names for a game's 3D world, after runtime.js. Two halves, as
// in React Three Fiber (and M-Files' <scene3d>):
//
// * The world is JSX in the game's view(): <scene3d> with <mesh>,
//   <boxGeometry args>, <meshStandardMaterial color>, lights, a camera,
//   <primitive object={gltf.scene}> and <orbitControls>. The engine reads it
//   (crates/rg_engine/src/fiber.rs) and draws it under the 2D view. A tap on
//   a mesh calls its onClick / onPointerDown / onPointerUp with
//   { object: { name, id }, point, distance, normal, x, y }.
// * The `THREE` object (also `import * as THREE from "three"`) has what code
//   needs: GLTFLoader (also from "three/addons/loaders/GLTFLoader.js"),
//   AnimationMixer and AnimationAction with three.js's play / fadeIn /
//   crossFadeTo / setLoop / "finished" and "loop" events, Raycaster, Vector2,
//   Vector3, MathUtils, Clock and the constants (LoopOnce, DoubleSide, …).
//
// Models are parsed and posed in Rust (gltf.rs); here a model is a handle
// ({ __model: src, __inst }) and a mixer keeps three.js's action state,
// which goes to the engine with the <primitive> as [clip, time, weight].
// The engine answers synchronous questions (a model's clips, a raycast)
// through __hostSync.

var __scene3d = null;        // this frame's serialized <scene3d>
var __orbit = { cfg: null, seen: null, st: null, drag: null };
var __down3d = {};           // pointer -> the 3D handler id it went down on
var __modelInst = 0;

function __sync(req) {
  if (typeof __hostSync !== "function") return null;
  var t = __hostSync(JSON.stringify(req));
  try { return JSON.parse(t); } catch (e) { return null; }
}

// ---- serializing <scene3d> ----

function __ser3list(kids, out) {
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    if (Array.isArray(k)) { __ser3list(k, out); continue; }
    var e = __ser3(k);
    if (e) out.push(e);
  }
}

function __ser3(n) {
  if (n === null || n === undefined || typeof n !== "object" || typeof n.type !== "string") return null;
  var e = { t: n.type };
  var p = n.props || {};
  var a = {};
  for (var k in p) {
    var v = p[k];
    if (v === null || v === undefined || k === "key" || k === "children" || k === "ref") continue;
    if (typeof v === "function") {
      if (k.slice(0, 2) !== "on") continue;
      if (!e.id) e.id = p.id ? String(p.id) : "__h" + (__ids++);
      __handlers[e.id + ":" + k.slice(2).toLowerCase()] = v;
    } else if (k === "id") {
      e.id = String(v);
    } else if (k === "object" && v && v.__model) {
      a.object = { model: v.__model, inst: v.__inst, anim: v.__mixer ? v.__mixer.__state() : [] };
    } else if (v && typeof v === "object" && typeof v.toArray === "function") {
      a[k] = v.toArray();          // a Vector3, a Color…
    } else {
      a[k] = v;
    }
  }
  if (n.type === "orbitControls") __orbit.seen = a;
  if (n.type === "perspectiveCamera" && __orbit.cfg) {
    var st = __orbitState(a);
    a.position = __orbitEye(st);
    a.lookAt = st.target.slice();
    delete a.rotation; delete a.quaternion;
  }
  e.a = a;
  var kids = n.children || [];
  if (kids.length) { e.c = []; __ser3list(kids, e.c); }
  return e;
}

// ---- OrbitControls (drei's props): drag turns, two fingers or the wheel zoom ----

function __orbitState(cam) {
  var o = __orbit, c = o.cfg || {};
  if (!o.st) {
    var t = c.target || [0, 0, 0];
    var p = (cam && cam.position) || [0, 0, 5];
    var dx = p[0] - t[0], dy = p[1] - t[1], dz = p[2] - t[2];
    var r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 5;
    o.st = { target: [t[0], t[1], t[2]], radius: r, theta: Math.atan2(dx, dz), phi: Math.acos(Math.max(-1, Math.min(1, dy / r))) };
  }
  return o.st;
}

function __orbitClamp(st) {
  var c = __orbit.cfg || {};
  var minP = c.minPolarAngle !== undefined ? c.minPolarAngle : 0, maxP = c.maxPolarAngle !== undefined ? c.maxPolarAngle : Math.PI;
  st.phi = Math.max(Math.max(minP, 0.0001), Math.min(Math.min(maxP, Math.PI - 0.0001), st.phi));
  if (c.minAzimuthAngle !== undefined) st.theta = Math.max(c.minAzimuthAngle, st.theta);
  if (c.maxAzimuthAngle !== undefined) st.theta = Math.min(c.maxAzimuthAngle, st.theta);
  st.radius = Math.max(c.minDistance || 0.01, Math.min(c.maxDistance || 1e9, st.radius));
}

function __orbitEye(st) {
  var s = Math.sin(st.phi);
  return [st.target[0] + st.radius * s * Math.sin(st.theta), st.target[1] + st.radius * Math.cos(st.phi), st.target[2] + st.radius * s * Math.cos(st.theta)];
}

// a finger that went down on no 2D handler may turn the camera
function __orbitDown(e) {
  var c = __orbit.cfg;
  if (!c || c.enabled === false) return;
  var d = __orbit.drag;
  if (!d) __orbit.drag = { ids: [e.pointer], x: e.x, y: e.y, moved: false, dist: 0 };
  else if (d.ids.indexOf(e.pointer) < 0) { d.ids.push(e.pointer); d.dist = 0; }
}

// answers whether that finger's touch was a drag (not a tap)
function __orbitUp(e) {
  var d = __orbit.drag;
  if (!d) return false;
  var i = d.ids.indexOf(e.pointer);
  if (i < 0) return false;
  d.ids.splice(i, 1);
  var moved = d.moved;
  if (!d.ids.length) __orbit.drag = null;
  else { d.dist = 0; var p = __pointerById(d.ids[0]); if (p) { d.x = p.x; d.y = p.y; } }
  return moved;
}

function __pointerById(id) {
  var ps = __input.pointers || [];
  for (var i = 0; i < ps.length; i++) if (ps[i].id === id && ps[i].down) return ps[i];
  return null;
}

function __orbitFrame(dt) {
  var o = __orbit, c = o.cfg;
  if (!c) { o.drag = null; return; }
  var st = o.st;
  if (!st) return;
  var d = o.drag;
  var rs = c.rotateSpeed !== undefined ? c.rotateSpeed : 1;
  if (d) {
    var p0 = __pointerById(d.ids[0]), p1 = d.ids.length > 1 ? __pointerById(d.ids[1]) : null;
    if (!p0) { o.drag = null; }
    else if (p1 && c.enableZoom !== false) {
      var dist = Math.sqrt((p0.x - p1.x) * (p0.x - p1.x) + (p0.y - p1.y) * (p0.y - p1.y));
      if (d.dist > 0 && dist > 0) { st.radius *= d.dist / dist; d.moved = true; }
      d.dist = dist;
    } else if (c.enableRotate !== false) {
      var dx = p0.x - d.x, dy = p0.y - d.y;
      if (!d.moved && dx * dx + dy * dy > 64) d.moved = true;
      if (d.moved) {
        st.theta -= 2 * Math.PI * dx / height * rs;
        st.phi -= 2 * Math.PI * dy / height * rs;
        d.x = p0.x; d.y = p0.y;
      }
    }
  }
  if (c.autoRotate && !d) st.theta += 2 * Math.PI / 60 * (c.autoRotateSpeed !== undefined ? c.autoRotateSpeed : 2) / 60 * dt * 60 * (c.autoRotateSpeed < 0 ? 1 : 1);
  __orbitClamp(st);
}

function __orbitWheel(dy) {
  var c = __orbit.cfg;
  if (!c || c.enableZoom === false || !__orbit.st) return false;
  var k = Math.pow(0.95, c.zoomSpeed !== undefined ? c.zoomSpeed : 1);
  __orbit.st.radius *= dy > 0 ? 1 / k : k;
  __orbitClamp(__orbit.st);
  return true;
}

// ---- 3D taps ----

function __hitEvent(h, e) {
  return { object: { name: h.name, id: h.id }, point: new THREE.Vector3(h.point[0], h.point[1], h.point[2]),
    distance: h.distance, normal: new THREE.Vector3(h.normal[0], h.normal[1], h.normal[2]),
    x: e.x, y: e.y, pointer: e.pointer, stopPropagation: function () {} };
}

// ---- THREE ----

var THREE = (function () {
  function Vector2(x, y) { this.x = x || 0; this.y = y || 0; this.isVector2 = true; }
  Vector2.prototype = {
    set: function (x, y) { this.x = x; this.y = y; return this; },
    copy: function (v) { this.x = v.x; this.y = v.y; return this; },
    clone: function () { return new Vector2(this.x, this.y); },
    toArray: function () { return [this.x, this.y]; }
  };

  function Vector3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this.isVector3 = true; }
  Vector3.prototype = {
    set: function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    setScalar: function (s) { this.x = this.y = this.z = s; return this; },
    copy: function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    clone: function () { return new Vector3(this.x, this.y, this.z); },
    add: function (v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; },
    sub: function (v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
    addVectors: function (a, b) { return this.set(a.x + b.x, a.y + b.y, a.z + b.z); },
    subVectors: function (a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); },
    addScaledVector: function (v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
    multiplyScalar: function (s) { this.x *= s; this.y *= s; this.z *= s; return this; },
    divideScalar: function (s) { return this.multiplyScalar(1 / s); },
    negate: function () { return this.multiplyScalar(-1); },
    dot: function (v) { return this.x * v.x + this.y * v.y + this.z * v.z; },
    cross: function (v) { var x = this.x, y = this.y, z = this.z; return this.set(y * v.z - z * v.y, z * v.x - x * v.z, x * v.y - y * v.x); },
    lengthSq: function () { return this.x * this.x + this.y * this.y + this.z * this.z; },
    length: function () { return Math.sqrt(this.lengthSq()); },
    normalize: function () { return this.divideScalar(this.length() || 1); },
    setLength: function (l) { return this.normalize().multiplyScalar(l); },
    distanceTo: function (v) { return Math.sqrt(this.distanceToSquared(v)); },
    distanceToSquared: function (v) { var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; },
    lerp: function (v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; },
    lerpVectors: function (a, b, t) { return this.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); },
    equals: function (v) { return v.x === this.x && v.y === this.y && v.z === this.z; },
    toArray: function () { return [this.x, this.y, this.z]; },
    fromArray: function (a, o) { o = o || 0; return this.set(a[o], a[o + 1], a[o + 2]); }
  };

  var MathUtils = {
    DEG2RAD: Math.PI / 180, RAD2DEG: 180 / Math.PI,
    degToRad: function (d) { return d * Math.PI / 180; },
    radToDeg: function (r) { return r * 180 / Math.PI; },
    clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); },
    lerp: function (a, b, t) { return (1 - t) * a + t * b; },
    inverseLerp: function (a, b, v) { return a !== b ? (v - a) / (b - a) : 0; },
    damp: function (a, b, l, dt) { return MathUtils.lerp(a, b, 1 - Math.exp(-l * dt)); },
    smoothstep: function (x, a, b) { if (x <= a) return 0; if (x >= b) return 1; x = (x - a) / (b - a); return x * x * (3 - 2 * x); },
    euclideanModulo: function (n, m) { return ((n % m) + m) % m; },
    randFloat: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  };

  function Clock(autoStart) { this.autoStart = autoStart !== false; this.startTime = 0; this.oldTime = 0; this.elapsedTime = 0; this.running = false; }
  Clock.prototype = {
    start: function () { this.startTime = this.oldTime = __input.time; this.elapsedTime = 0; this.running = true; },
    stop: function () { this.getElapsedTime(); this.running = false; },
    getElapsedTime: function () { this.getDelta(); return this.elapsedTime; },
    getDelta: function () {
      var d = 0;
      if (this.autoStart && !this.running) { this.start(); return 0; }
      if (this.running) { var t = __input.time; d = t - this.oldTime; this.oldTime = t; this.elapsedTime += d; }
      return d;
    }
  };

  // ---- glTF ----

  function AnimationClip(name, duration, index) { this.name = name; this.duration = duration; this.tracks = []; this.__i = index; this.uuid = "clip" + index; }
  AnimationClip.findByName = function (list, name) {
    var clips = Array.isArray(list) ? list : (list && list.animations) || [];
    for (var i = 0; i < clips.length; i++) if (clips[i].name === name) return clips[i];
    return null;
  };

  // a model in the world: put it in the view with <primitive object={model} />
  function Model(src, info) {
    this.__model = src; this.__inst = ++__modelInst; this.__info = info;
    this.isObject3D = true; this.type = "Group"; this.name = "";
    this.animations = info.clips;
  }
  // another copy of the model, with its own animation (SkeletonUtils.clone in three.js)
  Model.prototype.clone = function () { var m = new Model(this.__model, this.__info); m.name = this.name; return m; };
  Model.prototype.getObjectByName = function (name) { return this.__info.nodes.indexOf(name) >= 0 ? { name: name, isObject3D: true } : undefined; };
  Model.prototype.traverse = function (fn) { fn(this); };

  function loadInfo(url) {
    var r = __sync({ op: "gltf", src: String(url) });
    if (!r) throw new Error("GLTFLoader: the engine gave no answer for " + url);
    if (r.error) throw new Error("GLTFLoader: " + r.error);
    var clips = [];
    for (var i = 0; i < r.animations.length; i++) clips.push(new AnimationClip(r.animations[i].name, r.animations[i].duration, i));
    return { clips: clips, nodes: r.nodes || [], triangles: r.triangles };
  }

  function GLTFLoader() { this.path = ""; }
  GLTFLoader.prototype = {
    setPath: function (p) { this.path = p || ""; return this; },
    // the model is read at once (it is in the game's folder); onLoad(gltf) is called before load returns
    load: function (url, onLoad, onProgress, onError) {
      var gltf;
      try { gltf = this.loadSync(url); } catch (err) { if (onError) { onError(err); return; } throw err; }
      if (onProgress) onProgress({ loaded: 1, total: 1 });
      if (onLoad) onLoad(gltf);
      return gltf;
    },
    loadAsync: function (url) { var self = this; return new Promise(function (ok, fail) { try { ok(self.loadSync(url)); } catch (e) { fail(e); } }); },
    // RangerGames: the gltf without a callback
    loadSync: function (url) {
      var src = this.path + url;
      var info = loadInfo(src);
      var scene = new Model(src, info);
      return { scene: scene, scenes: [scene], animations: info.clips, cameras: [], asset: { version: "2.0" }, parser: null, userData: {} };
    }
  };

  // ---- animation: three.js's AnimationMixer and AnimationAction ----

  var LoopOnce = 2200, LoopRepeat = 2201, LoopPingPong = 2202;

  function AnimationAction(mixer, clip) {
    this._mixer = mixer; this._clip = clip;
    this.loop = LoopRepeat; this.repetitions = Infinity; this.clampWhenFinished = false;
    this.enabled = true; this.paused = false; this.time = 0; this.timeScale = 1; this.weight = 1;
    this.zeroSlopeAtStart = true; this.zeroSlopeAtEnd = true;
    this._running = false; this._loopCount = -1; this._fade = null; this._markers = [];
  }
  AnimationAction.prototype = {
    play: function () { this._running = true; if (this._mixer._actions.indexOf(this) < 0) this._mixer._actions.push(this); return this; },
    stop: function () { this._running = false; this.reset(); return this; },
    reset: function () { this.paused = false; this.enabled = true; this.time = 0; this._loopCount = -1; this._fade = null; return this; },
    isRunning: function () { return this.enabled && !this.paused && this.timeScale !== 0 && this._running; },
    isScheduled: function () { return this._running; },
    setLoop: function (mode, reps) { this.loop = mode; this.repetitions = reps === undefined ? Infinity : reps; return this; },
    setEffectiveWeight: function (w) { this.weight = w; this._fade = null; return this; },
    getEffectiveWeight: function () { return this.enabled ? this.weight * this._fadeValue() : 0; },
    setEffectiveTimeScale: function (s) { this.timeScale = s; return this; },
    getEffectiveTimeScale: function () { return this.timeScale; },
    setDuration: function (d) { this.timeScale = this._clip.duration / d; return this; },
    syncWith: function (a) { this.time = a.time; this.timeScale = a.timeScale; return this; },
    halt: function (d) { return this.fadeOut(d); },
    fadeIn: function (d) { return this._schedule(d, 0, 1); },
    fadeOut: function (d) { return this._schedule(d, 1, 0); },
    crossFadeFrom: function (other, d) { other.fadeOut(d); this.fadeIn(d); return this; },
    crossFadeTo: function (other, d) { other.fadeIn(d); this.fadeOut(d); return this; },
    stopFading: function () { this._fade = null; return this; },
    getMixer: function () { return this._mixer; },
    getClip: function () { return this._clip; },
    getRoot: function () { return this._mixer._root; },
    // RangerGames: a named moment of the clip; the mixer sends
    // { type: "marker", action, name, time } when the action plays past it
    addMarker: function (name, time) { this._markers.push({ name: String(name), time: +time }); return this; },
    _schedule: function (d, from, to) {
      this._fade = { start: this._mixer.time, dur: Math.max(d, 1e-6), from: from, to: to };
      return this;
    },
    _fadeValue: function () {
      var f = this._fade;
      if (!f) return 1;
      var k = Math.min(1, Math.max(0, (this._mixer.time - f.start) / f.dur));
      return f.from + (f.to - f.from) * k;
    },
    // advance by dt (after mixer.time moved on); three.js's _updateTime
    _update: function (dt) {
      var m = this._mixer;
      if (this._fade && m.time - this._fade.start >= this._fade.dur) {
        var end = this._fade.to;
        this._fade = null;
        if (end === 0) { this.enabled = false; this.weight = this.weight; this._fadedOut = true; }
      }
      if (!this.enabled || this.paused || !this._running) return;
      var dur = this._clip.duration;
      var before = this.time;
      var t = this.time + dt * this.timeScale * m.timeScale;
      var finished = false, looped = 0;
      if (dur <= 0) { this.time = 0; return; }
      if (this.loop === LoopOnce) {
        if (this._loopCount === -1) this._loopCount = 0;
        if (t >= dur) { t = dur; finished = 1; } else if (t < 0) { t = 0; finished = -1; }
      } else {
        if (this._loopCount === -1) this._loopCount = 0;
        var pingpong = this.loop === LoopPingPong;
        if (t >= dur || t < 0) {
          var loops = Math.floor(t / dur);
          t -= dur * loops;
          this._loopCount += Math.abs(loops);
          var left = this.repetitions - this._loopCount;
          if (left <= 0) {
            t = dt > 0 ? dur : 0;
            finished = dt > 0 ? 1 : -1;
          } else {
            looped = loops;
          }
        }
        this._pp = pingpong && (this._loopCount & 1) === 1;
      }
      this.time = t;
      // markers passed this step (forwards, or across the loop's end)
      for (var i = 0; i < this._markers.length; i++) {
        var mk = this._markers[i];
        var hit = looped > 0 ? (mk.time > before || mk.time <= t) : (before < mk.time && mk.time <= t) || (before === 0 && mk.time === 0 && t > 0);
        if (hit) m._events.push({ type: "marker", action: this, name: mk.name, time: mk.time });
      }
      if (looped) m._events.push({ type: "loop", action: this, loopDelta: looped });
      if (finished) {
        if (this.clampWhenFinished) this.paused = true; else this.enabled = false;
        this._running = this.clampWhenFinished;
        m._events.push({ type: "finished", action: this, direction: finished });
      }
    },
    // the clip time the pose is sampled at
    _sampleTime: function () { return this._pp ? this._clip.duration - this.time : this.time; }
  };

  function AnimationMixer(root) {
    this._root = root; this._actions = []; this._cache = {}; this._listeners = {}; this._events = [];
    this.time = 0; this.timeScale = 1;
    if (root && root.__model) root.__mixer = this;
  }
  AnimationMixer.prototype = {
    clipAction: function (clip) {
      if (typeof clip === "string") clip = AnimationClip.findByName(this._root ? this._root.animations : [], clip);
      if (!clip) return null;
      var a = this._cache[clip.__i];
      if (!a) { a = new AnimationAction(this, clip); this._cache[clip.__i] = a; }
      return a;
    },
    existingAction: function (clip) {
      if (typeof clip === "string") clip = AnimationClip.findByName(this._root ? this._root.animations : [], clip);
      return clip ? this._cache[clip.__i] || null : null;
    },
    stopAllAction: function () { for (var i = 0; i < this._actions.length; i++) this._actions[i].stop(); return this; },
    getRoot: function () { return this._root; },
    setTime: function (t) { this.time = 0; for (var i = 0; i < this._actions.length; i++) this._actions[i].time = 0; return this.update(t / this.timeScale); },
    update: function (dt) {
      this.time += dt * this.timeScale;
      for (var i = 0; i < this._actions.length; i++) this._actions[i]._update(dt);
      var ev = this._events;
      this._events = [];
      for (var j = 0; j < ev.length; j++) this.dispatchEvent(ev[j]);
      return this;
    },
    addEventListener: function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) { var l = this._listeners[type]; if (l) { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    hasEventListener: function (type, fn) { var l = this._listeners[type]; return !!l && l.indexOf(fn) >= 0; },
    dispatchEvent: function (e) { e.target = this; var l = (this._listeners[e.type] || []).slice(); for (var i = 0; i < l.length; i++) l[i].call(this, e); },
    // [[clip index, time, weight]] for the engine
    __state: function () {
      var out = [];
      for (var i = 0; i < this._actions.length; i++) {
        var a = this._actions[i];
        if (!a._running && !a.paused) continue;
        var w = a.getEffectiveWeight();
        if (w > 0.0001) out.push([a._clip.__i, a._sampleTime(), w]);
      }
      return out;
    }
  };

  // ---- Raycaster: setFromCamera(pointer in -1…1, camera), intersectObjects ----

  function Raycaster() { this._x = 0; this._y = 0; this.near = 0; this.far = Infinity; }
  Raycaster.prototype = {
    // the camera is the world's camera; `pointer` is in normalized device coordinates
    setFromCamera: function (pointer) { this._x = (pointer.x + 1) / 2 * width; this._y = (1 - pointer.y) / 2 * height; return this; },
    // RangerGames: from a point of the screen in the game's units
    setFromScreen: function (x, y) { this._x = x; this._y = y; return this; },
    intersectObjects: function (objects) {
      var hits = __sync({ op: "raycast", x: this._x, y: this._y, all: true }) || [];
      var names = null;
      if (objects && objects.length) { names = {}; for (var i = 0; i < objects.length; i++) names[typeof objects[i] === "string" ? objects[i] : objects[i].name] = true; }
      var out = [];
      for (var j = 0; j < hits.length; j++) {
        var h = hits[j];
        if (h.distance < this.near || h.distance > this.far) continue;
        if (names && !names[h.name]) continue;
        out.push({ distance: h.distance, point: new Vector3(h.point[0], h.point[1], h.point[2]), object: { name: h.name, id: h.id },
          face: { normal: new Vector3(h.normal[0], h.normal[1], h.normal[2]) } });
      }
      return out;
    },
    intersectObject: function (o) { return this.intersectObjects(o ? [o] : null); }
  };

  return {
    REVISION: "rg", Vector2: Vector2, Vector3: Vector3, MathUtils: MathUtils, Clock: Clock,
    GLTFLoader: GLTFLoader, AnimationClip: AnimationClip, AnimationMixer: AnimationMixer, AnimationAction: AnimationAction,
    Raycaster: Raycaster,
    LoopOnce: LoopOnce, LoopRepeat: LoopRepeat, LoopPingPong: LoopPingPong,
    FrontSide: 0, BackSide: 1, DoubleSide: 2
  };
})();

// rg.raycast(x, y): what is under a point of the screen (game units):
// { id, name, distance, point: [x, y, z], normal } or null; rg.project([x, y, z]):
// where a world point is on the screen ({ x, y, depth } or null)
rg.raycast = function (x, y, all) { return __sync({ op: "raycast", x: x, y: y, all: !!all }); };
// rg.height(src, u, v): a height picture's value 0..1 at u, v (0..1 across it), read as the globe's
// ground reads it (PNG, red * 256 + green), for physics on the drawn ground; null when it can't be read
rg.height = function (src, u, v) { return __sync({ op: "height", src: src, u: u, v: v }); };
rg.project = function (p) { var v = Array.isArray(p) ? p : [p.x, p.y, p.z]; return __sync({ op: "project", x: v[0], y: v[1], z: v[2] }); };
// the orbit camera: { target, radius, theta, phi } (null before it is seen); reset() starts it again from the camera's props
rg.orbit = { state: function () { return __orbit.st; }, reset: function () { __orbit.st = null; } };

if (typeof defineModule === "function") {
  defineModule("three", THREE);
  var __gltfMod = { GLTFLoader: THREE.GLTFLoader };
  defineModule("three/addons/loaders/GLTFLoader.js", __gltfMod);
  defineModule("three/examples/jsm/loaders/GLTFLoader.js", __gltfMod);
  defineModule("three/addons/loaders/GLTFLoader", __gltfMod);
}
