// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Animations for every game, run natively by the engine (rg_core::anim) on
// its one clock, before the game's tick each frame. Times are milliseconds,
// as in the Web Animations standard these follow.
//
//   rg.animate(target, keyframes, options)    Element.animate(): a JS object
//       (its properties, "a.b" paths too) or "#id" (an element's style).
//       Keyframes and options as in the standard: [{x: 0}, {x: 100, easing}]
//       or {x: [0, 100], offset: [...]}; options a duration or { duration,
//       delay, endDelay, iterations (Infinity), iterationStart, direction,
//       fill, easing, playbackRate, clock, autoplay (false: paused) }.
//       Returns an Animation: play, pause, reverse, finish, cancel,
//       updatePlaybackRate, currentTime, playbackRate, playState, finished,
//       onfinish, oncancel.
//   rg.sequence(options)    a timeline of tweens, calls, sounds, speech,
//       music and pauses placed as GSAP places them ("<", ">", "+=500",
//       labels). A sound's or a hold's length comes when its file is in the
//       game's files (or by seq.resolve); until then the sequence waits at it,
//       at most its timeout; seq.cancel(name) ends a pause or a sound and the
//       rest moves up.
//   rg.clock(name, {rate, glide, log})    a time scale for animations and
//       sequences (a game's ×60 simulation), its rate gliding to a new one.
//   rg.spring(target, prop, options)    a damped spring to a target value.
//   rg.follow(value, target, halfLife)    x += (target - x) * k without the
//       frame rate in it: the gap halves every halfLife ms.
//   rg.frame    this frame's { now, dt, frames, period, lost } (ms): the step
//       is whole display frames, as the pictures are shown.

var __animT = [];          // target id -> object, or "#id" for an element
var __animStyle = {};      // element id -> its animated style this frame
var __animObjs = {};       // animation / sequence id -> its object
var __animSprings = {};    // spring id -> Spring
var __animEntries = {};    // sequence entry id -> { call } or { sound … }
var __animClocks = [];     // clock index -> Clock
var __animUid = 0;

rg.frame = { now: 0, dt: 0, frames: 0, period: 1000 / 60, lost: 0, count: 0 };

function __anReq(o) {
  if (typeof __hostSync !== "function") return null;
  var t = __hostSync("\u0002" + JSON.stringify(o));
  try { return JSON.parse(t); } catch (e) { return null; }
}

function __anTarget(t) {
  if (typeof t === "string") {
    var key = t.charAt(0) === "#" ? t : "#" + t;
    var i = __animT.indexOf(key);
    if (i >= 0) return i;
    __animT.push(key);
    return __animT.length - 1;
  }
  if (t === null || typeof t !== "object") throw new Error("rg.animate: the target is an object or \"#id\"");
  if (t.__rgA !== undefined && __animT[t.__rgA] === t) return t.__rgA;
  __animT.push(t);
  Object.defineProperty(t, "__rgA", { value: __animT.length - 1, enumerable: false, configurable: true, writable: true });
  return __animT.length - 1;
}

function __anGet(t, prop) {
  if (typeof t === "string") return undefined;
  var parts = String(prop).split("."), o = t;
  for (var i = 0; i < parts.length; i++) { if (o === null || o === undefined) return undefined; o = o[parts[i]]; }
  return o;
}

function __anSet(t, prop, v) {
  if (typeof t === "string") {
    var id = t.slice(1), s = __animStyle[id] || (__animStyle[id] = {});
    s[prop] = typeof v === "number" && __LENGTH[prop] ? v + "px" : String(v);
    return;
  }
  var parts = String(prop).split("."), o = t;
  for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] === null || typeof o[parts[i]] !== "object") return; o = o[parts[i]]; }
  var last = parts[parts.length - 1];
  // a list keeps its own array (a game may hold on to it)
  if (Array.isArray(v) && Array.isArray(o[last]) && o[last].length === v.length) { for (var k = 0; k < v.length; k++) o[last][k] = v[k]; }
  else o[last] = v;
}

function __anVal(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.slice();
  return String(v);
}

function __anClock(c) {
  if (c === undefined || c === null) return 0;
  if (typeof c === "object" && c.id !== undefined) return c.id;
  return c;
}

// the standard's timing dictionary for the engine (Infinity is no JSON number)
function __anTiming(o) {
  if (o === undefined || o === null) return { duration: 0 };
  if (typeof o === "number") return { duration: o };
  var t = {};
  var keys = ["delay", "endDelay", "duration", "iterationStart", "direction", "fill", "easing"];
  for (var i = 0; i < keys.length; i++) if (o[keys[i]] !== undefined) t[keys[i]] = o[keys[i]];
  if (t.duration === "auto") t.duration = 0;
  if (o.ease !== undefined && t.easing === undefined) t.easing = o.ease;
  if (o.iterations !== undefined) t.iterations = o.iterations === Infinity ? "Infinity" : o.iterations;
  return t;
}

// keyframes (either form of the standard) -> per property [{o, v, e}] with
// the computed offsets; a property without a keyframe at 0 or 1 gets the
// target's value there (the standard's implicit keyframes)
function __anProps(target, kf) {
  var list = [];
  if (Array.isArray(kf)) list = kf;
  else if (kf && typeof kf === "object") {
    var n = 0, k;
    for (k in kf) if (Array.isArray(kf[k]) && k !== "offset" && k !== "easing") n = Math.max(n, kf[k].length);
    for (var i = 0; i < n; i++) {
      var f = {};
      for (k in kf) {
        var v = kf[k];
        if (k === "offset" || k === "easing") { if (Array.isArray(v)) { if (i < v.length) f[k] = v[i]; } else if (k === "easing") f[k] = v; continue; }
        if (Array.isArray(v)) {
          // a property's values spread over the keyframes as the standard does
          if (v.length === n) f[k] = v[i];
          else if (v.length === 1 && i === n - 1) f[k] = v[0];
          else if (v.length > 1 && n > 1) { var j = i * (v.length - 1) / (n - 1); if (j === Math.floor(j)) f[k] = v[j]; }
        } else if (i === n - 1 || n === 0) f[k] = v;
      }
      list.push(f);
    }
    if (n === 0) { var one = {}; for (k in kf) if (k !== "offset" && k !== "easing") one[k] = kf[k]; list = [one]; }
  }
  // computed offsets over the whole list
  var offs = [], m = list.length;
  for (var a = 0; a < m; a++) offs.push(typeof list[a].offset === "number" ? list[a].offset : null);
  if (m > 1 && offs[0] === null) offs[0] = 0;
  if (m > 0 && offs[m - 1] === null) offs[m - 1] = 1;
  for (var b = 1; b < m - 1; b++) if (offs[b] === null) {
    var c = b; while (offs[c] === null) c++;
    for (var d = b; d < c; d++) offs[d] = offs[b - 1] + (offs[c] - offs[b - 1]) * (d - b + 1) / (c - b + 1);
    b = c;
  }
  var props = {}, order = [];
  for (var q = 0; q < m; q++) {
    for (var p in list[q]) {
      if (p === "offset" || p === "easing" || p === "composite") continue;
      if (!props[p]) { props[p] = []; order.push(p); }
      props[p].push({ o: offs[q], v: __anVal(list[q][p]), e: list[q].easing || "linear" });
    }
  }
  var out = [];
  for (var r = 0; r < order.length; r++) {
    var name = order[r], kfs = props[name], now = __anGet(target, name);
    var pr = { name: name, kfs: kfs };
    if (now !== undefined) {
      if (kfs[0].o > 0) kfs.unshift({ o: 0, v: __anVal(now), e: "linear" });
      if (kfs[kfs.length - 1].o < 1) kfs.push({ o: 1, v: __anVal(now), e: "linear" });
    }
    out.push(pr);
  }
  return out;
}

// ---- Animation -----------------------------------------------------------------

function RgAnimation(id) {
  this.id = id;
  this._t = 0;
  this._state = "running";
  this._rate = 1;
  this.onfinish = null;
  this.oncancel = null;
  var self = this;
  this._newPromise();
  __animObjs[id] = this;
}
RgAnimation.prototype._newPromise = function () {
  var self = this;
  if (typeof Promise === "function") this.finished = new Promise(function (ok) { self._ok = ok; });
  else this.finished = null;
};
RgAnimation.prototype._ctl = function (what, t) {
  var r = __anReq({ op: "ctl", id: this.id, do: what, t: t });
  if (r) { this._t = r.t; this._state = r.state; this._rate = r.rate; }
  return this;
};
RgAnimation.prototype.play = function () { if (this._state === "finished") this._newPromise(); return this._ctl("play"); };
RgAnimation.prototype.pause = function () { return this._ctl("pause"); };
RgAnimation.prototype.reverse = function () { if (this._state === "finished") this._newPromise(); return this._ctl("reverse"); };
RgAnimation.prototype.finish = function () { return this._ctl("finish"); };
RgAnimation.prototype.cancel = function () { return this._ctl("cancel"); };
RgAnimation.prototype.updatePlaybackRate = function (r) { return this._ctl("rate", r); };
// the standard's commitStyles: the values stay when the animation goes
RgAnimation.prototype.commitStyles = function () { return this; };
RgAnimation.prototype.remove = function () { this._ctl("remove"); delete __animObjs[this.id]; };
Object.defineProperty(RgAnimation.prototype, "currentTime", {
  get: function () { return this._state === "idle" ? null : this._t; },
  set: function (t) { this._ctl("seek", Number(t)); }
});
Object.defineProperty(RgAnimation.prototype, "playbackRate", {
  get: function () { return this._rate; },
  set: function (r) { this._ctl("rate", Number(r)); }
});
Object.defineProperty(RgAnimation.prototype, "playState", { get: function () { return this._state; } });
Object.defineProperty(RgAnimation.prototype, "pending", { get: function () { return false; } });

rg.animate = function (target, keyframes, options) {
  var tm = __anTiming(options);
  var o = typeof options === "object" && options ? options : {};
  var id = __anReq({ op: "anim", target: __anTarget(target), props: __anProps(target, keyframes), timing: tm,
    clock: __anClock(o.clock), paused: o.autoplay === false, rate: o.playbackRate });
  var a = new RgAnimation(id);
  if (o.playbackRate !== undefined) a._rate = o.playbackRate;
  if (o.autoplay === false) a._state = "paused";
  if (o.id !== undefined) a.animId = o.id;
  return a;
};

// ---- clocks ------------------------------------------------------------------------

function RgClock(info, name) { this.id = info.id; this.name = name; this._time = info.time; this._rate = info.rate; this._target = info.target; this._paused = false; }
RgClock.prototype.setRate = function (rate, opts) {
  var r = __anReq({ op: "clock", name: this.name, rate: rate, glide: opts && opts.glide || 0, log: !!(opts && opts.log) });
  if (r) { this._rate = r.rate; this._target = r.target; }
  return this;
};
RgClock.prototype.pause = function () { __anReq({ op: "clock", name: this.name, paused: true }); this._paused = true; return this; };
RgClock.prototype.play = function () { __anReq({ op: "clock", name: this.name, paused: false }); this._paused = false; return this; };
Object.defineProperty(RgClock.prototype, "currentTime", {
  get: function () { return this._time; },
  set: function (t) { var r = __anReq({ op: "clock", name: this.name, time: Number(t) }); if (r) this._time = r.time; }
});
Object.defineProperty(RgClock.prototype, "rate", { get: function () { return this._rate; }, set: function (r) { this.setRate(r); } });
Object.defineProperty(RgClock.prototype, "targetRate", { get: function () { return this._target; } });
Object.defineProperty(RgClock.prototype, "paused", { get: function () { return this._paused; } });

rg.clock = function (name, opts) {
  name = name === undefined || name === null ? "real" : String(name);
  var req = { op: "clock", name: name };
  if (opts && opts.rate !== undefined) { req.rate = opts.rate; req.glide = opts.glide || 0; req.log = !!opts.log; }
  if (opts && opts.paused !== undefined) req.paused = !!opts.paused;
  var info = __anReq(req) || { id: 0, time: 0, rate: 1, target: 1 };
  var c = __animClocks[info.id];
  if (!c) { c = new RgClock(info, name); __animClocks[info.id] = c; }
  else { c._rate = info.rate; c._target = info.target; }
  return c;
};

// ---- sequences -----------------------------------------------------------------------

function RgSequence(id) {
  RgAnimation.call(this, id);
  this._end = 0;
  this._holding = false;
  this.last = 0;
  this.ontimeout = null;
}
RgSequence.prototype = Object.create(RgAnimation.prototype);
RgSequence.prototype.constructor = RgSequence;
RgSequence.prototype._add = function (o) {
  o.op = "add";
  o.seq = this.id;
  var id = __anReq(o);
  this.last = id;
  if (this._state === "finished") this._newPromise();
  return id;
};
// GSAP's to(): props may carry duration / ease / delay, or timing apart
function __anSplit(props, timing) {
  var vals = {}, tm = __anTiming(timing === undefined ? 0 : timing);
  for (var k in props) {
    if (k === "duration" || k === "ease" || k === "easing" || k === "delay" || k === "iterations" || k === "direction") {
      if (k === "ease") tm.easing = props[k];
      else if (k === "iterations") tm.iterations = props[k] === Infinity ? "Infinity" : props[k];
      else tm[k] = props[k];
    } else vals[k] = props[k];
  }
  return { vals: vals, tm: tm };
}
RgSequence.prototype.to = function (target, props, timing, pos) {
  if (typeof timing === "string") { pos = timing; timing = undefined; }
  var s = __anSplit(props, timing), list = [];
  for (var k in s.vals) {
    var now = __anGet(target, k);
    list.push({ name: k, to: true, from: __anVal(now === undefined ? s.vals[k] : now), kfs: [{ o: 1, v: __anVal(s.vals[k]) }] });
  }
  this._add({ kind: "tween", target: __anTarget(target), props: list, timing: s.tm, pos: pos === undefined ? "" : pos });
  return this;
};
RgSequence.prototype.fromTo = function (target, from, to, timing, pos) {
  if (typeof timing === "string") { pos = timing; timing = undefined; }
  var s = __anSplit(to, timing), list = [];
  for (var k in s.vals) list.push({ name: k, kfs: [{ o: 0, v: __anVal(from[k] === undefined ? __anGet(target, k) : from[k]) }, { o: 1, v: __anVal(s.vals[k]) }] });
  this._add({ kind: "tween", target: __anTarget(target), props: list, timing: s.tm, pos: pos === undefined ? "" : pos });
  return this;
};
RgSequence.prototype.from = function (target, from, timing, pos) {
  if (typeof timing === "string") { pos = timing; timing = undefined; }
  var s = __anSplit(from, timing), to = {};
  for (var k in s.vals) to[k] = __anGet(target, k);
  for (var t in s.tm) to[t === "easing" ? "ease" : t] = s.tm[t];
  return this.fromTo(target, s.vals, to, undefined, pos);
};
// a whole keyframe animation (the standard's keyframes and timing) as an entry
RgSequence.prototype.animate = function (target, keyframes, timing, pos) {
  this._add({ kind: "tween", target: __anTarget(target), props: __anProps(target, keyframes), timing: __anTiming(timing), pos: pos === undefined ? "" : pos });
  return this;
};
RgSequence.prototype.call = function (fn, pos) {
  var id = this._add({ kind: "call", pos: pos === undefined ? "" : pos });
  __animEntries[id] = { call: fn, seq: this.id };
  return this;
};
RgSequence.prototype.label = function (name, pos) { this._add({ kind: "label", name: String(name), pos: pos === undefined ? "" : pos }); return this; };
// a fixed pause of ms, or with no ms one that waits until resolve() or cancel()
// (or its timeout): opts { name, timeout }
RgSequence.prototype.gap = function (ms, opts, pos) {
  if (typeof opts === "string") { pos = opts; opts = undefined; }
  var o = { kind: "gap", name: opts && opts.name || "", pos: pos === undefined ? "" : pos };
  if (typeof ms === "number") o.dur = ms; else o.wait = true;
  if (opts && opts.timeout) o.timeout = opts.timeout;
  this._add(o);
  return this;
};
RgSequence.prototype.hold = function (name, opts, pos) { return this.gap(null, Object.assign({ name: name }, opts || {}), pos); };
function __anSoundEntry(seq, kind, file, opts, pos) {
  if (typeof opts === "string") { pos = opts; opts = undefined; }
  opts = opts || {};
  var path = kind === "say" ? rg.voiceFile(String(file), opts.lang || rg.lang || "fi") : __file(file);
  var builtin = path.indexOf("/") < 0;
  var o = { kind: "sound", path: path, name: opts.name || "", pos: pos === undefined ? "" : pos };
  if (opts.dur !== undefined) o.dur = opts.dur;
  else if (builtin) o.dur = 0;
  if (kind === "music" && opts.dur === undefined) o.open = true;
  if (opts.wait === false) o.wait = false;
  // a clip that never comes does not hold the story for good
  o.timeout = opts.timeout === undefined ? 10000 : opts.timeout;
  // the length from the file is played at `pitch` (faster or slower), and
  // `pad` ms of the host's own around it (a radio call's static, 450 ms on the web)
  o.opts = { rate: opts.pitch > 0 ? opts.pitch : 1, pad: opts.pad > 0 ? opts.pad : 0 };
  var host = {};
  for (var k in opts) if (k !== "dur" && k !== "wait" && k !== "timeout" && k !== "name" && k !== "lang" && k !== "pad") host[k] = opts[k];
  var id = seq._add(o);
  __animEntries[id] = { sound: kind, path: path, opts: host, seq: seq.id, h: 0, silent: kind === "say" && !rg.speechOn() };
  return seq;
}
RgSequence.prototype.sound = function (file, opts, pos) { return __anSoundEntry(this, "sound", file, opts, pos); };
RgSequence.prototype.say = function (id, opts, pos) { return __anSoundEntry(this, "say", id, opts, pos); };
RgSequence.prototype.music = function (file, opts, pos) { return __anSoundEntry(this, "music", file, opts, pos); };
RgSequence.prototype.cancel = function (name) {
  if (name === undefined) return RgAnimation.prototype.cancel.call(this);
  __anReq({ op: "entry", seq: this.id, entry: name, do: "cancel" });
  return this;
};
RgSequence.prototype.resolve = function (name, ms) { __anReq({ op: "entry", seq: this.id, entry: name, do: "resolve", dur: ms || 0 }); return this; };
RgSequence.prototype.seek = function (t) { return this._ctl("seek", Number(t)); };
RgSequence.prototype.kill = function () { this._ctl("remove"); delete __animObjs[this.id]; };
Object.defineProperty(RgSequence.prototype, "duration", { get: function () { return this._end; } });
Object.defineProperty(RgSequence.prototype, "holding", { get: function () { return this._holding; } });

rg.sequence = function (opts) {
  opts = opts || {};
  var id = __anReq({ op: "seq", clock: __anClock(opts.clock), paused: !!opts.paused, rate: opts.playbackRate });
  var s = new RgSequence(id);
  if (opts.paused) s._state = "paused";
  if (opts.onfinish) s.onfinish = opts.onfinish;
  return s;
};

// ---- springs -------------------------------------------------------------------------

function RgSpring(id, value) { this.id = id; this.value = value; this.velocity = Array.isArray(value) ? value.map(function () { return 0; }) : 0; this.resting = false; this.onrest = null; __animSprings[id] = this; }
RgSpring.prototype.to = function (v) { __anReq({ op: "springto", id: this.id, to: v }); this.resting = false; return this; };
RgSpring.prototype.jump = function (v) { __anReq({ op: "springto", id: this.id, value: v, to: v, velocity: Array.isArray(v) ? v.map(function () { return 0; }) : 0 }); this.value = v; return this; };
RgSpring.prototype.push = function (vel) { __anReq({ op: "springto", id: this.id, velocity: vel }); this.resting = false; return this; };
RgSpring.prototype.stop = function () { __anReq({ op: "ctl", id: this.id, do: "remove" }); delete __animSprings[this.id]; };
Object.defineProperty(RgSpring.prototype, "target", { set: function (v) { this.to(v); } });

// rg.spring(target, "x", { to, stiffness, damping, mass, velocity, restDelta,
// restSpeed, clock }) or rg.spring({ value, to, … }) read as spring.value
rg.spring = function (target, prop, opts) {
  if (prop === undefined && target && typeof target === "object" && !Array.isArray(target) && target.value !== undefined) { opts = target; target = null; }
  opts = opts || {};
  var value = target ? __anVal(__anGet(target, prop)) : __anVal(opts.value);
  var req = { op: "spring", value: value, to: opts.to === undefined ? value : opts.to, clock: __anClock(opts.clock) };
  var keys = ["stiffness", "damping", "mass", "velocity", "restDelta", "restSpeed"];
  for (var i = 0; i < keys.length; i++) if (opts[keys[i]] !== undefined) req[keys[i]] = opts[keys[i]];
  if (target) { req.target = __anTarget(target); req.prop = String(prop); }
  return new RgSpring(__anReq(req), value);
};

rg.follow = function (x, target, halfLife, dt) {
  var step = dt === undefined ? rg.frame.dt : dt;
  if (!(halfLife > 0)) return Array.isArray(target) ? target.slice() : target;
  var k = Math.pow(2, -step / halfLife);
  if (Array.isArray(x)) { var o = []; for (var i = 0; i < x.length; i++) o.push(target[i] + (x[i] - target[i]) * k); return o; }
  return target + (x - target) * k;
};

// ---- the frame ---------------------------------------------------------------------------

function __anSound(ev) {
  var e = __animEntries[ev[2]];
  if (!e || !e.sound) return;
  var kind = ev[0];
  if (kind === "sound") {
    if (e.silent) return;
    var o = {};
    for (var k in e.opts) o[k] = e.opts[k];
    if (ev[3] > 0) o.delay = ev[3] / 1000;
    if (ev[4] > 0) o.offset = ev[4] / 1000 * (o.pitch > 0 ? o.pitch : 1);   // into the file
    e.h = e.sound === "music" ? rg.music(e.path, o) : rg.sound(e.path, o);
  } else if (kind === "soundstop") { if (e.h) rg.stopSound(e.h, { fade: e.opts.fadeOut === undefined ? 0.03 : e.opts.fadeOut }); e.h = 0; }
  else if (kind === "soundpause") { if (e.h) rg.pauseSound(e.h); }
  else if (kind === "soundresume") { if (e.h) rg.resumeSound(e.h); }
}

function __anFire(o, name, arg) {
  var f = o && o[name];
  if (typeof f === "function") { try { f.call(o, arg); } catch (err) { console.log("animation " + name + ": " + err); } }
}

function __animFrame(a) {
  if (a.clock) rg.frame = a.clock;
  __animStyle = {};
  var an = a.anim;
  if (!an) return;
  var i, o = an.o || [];
  for (i = 0; i < o.length; i++) { var t = __animT[o[i][0]]; if (t !== undefined) __anSet(t, o[i][1], o[i][2]); }
  var st = an.s || [], names = ["idle", "running", "paused", "finished"];
  for (i = 0; i < st.length; i++) {
    var ob = __animObjs[st[i][0]];
    if (!ob) continue;
    ob._t = st[i][1]; ob._state = names[st[i][2]] || "idle"; ob._rate = st[i][3];
    if (st[i].length > 4) { ob._end = st[i][4]; ob._holding = st[i][5]; }
  }
  var sp = an.sp || [];
  for (i = 0; i < sp.length; i++) {
    var s = __animSprings[sp[i][0]];
    if (!s) continue;
    var list = Array.isArray(s.value);
    s.value = list ? sp[i][1] : sp[i][1][0];
    s.velocity = list ? sp[i][2] : sp[i][2][0];
    s.resting = sp[i][3];
  }
  var cl = an.c || [];
  for (i = 0; i < cl.length; i++) { var c = __animClocks[i]; if (c) { c._time = cl[i][0]; c._rate = cl[i][1]; c._paused = cl[i][2]; } }
  var ev = an.e || [];
  for (i = 0; i < ev.length; i++) {
    var e = ev[i], k = e[0];
    if (k === "call") { var en = __animEntries[e[2]]; if (en && typeof en.call === "function") { try { en.call(); } catch (err) { console.log("sequence call: " + err); } } }
    else if (k === "sound" || k === "soundstop" || k === "soundpause" || k === "soundresume") __anSound(e);
    else if (k === "finish") { var f = __animObjs[e[1]]; if (f) { f._state = "finished"; __anFire(f, "onfinish", f); if (f._ok) { f._ok(f); f._ok = null; } } }
    else if (k === "cancel") { var cobj = __animObjs[e[1]]; if (cobj) { if (e[2]) __anFire(cobj, "oncancelentry", e[2]); else __anFire(cobj, "oncancel", cobj); } }
    else if (k === "timeout") { var tobj = __animObjs[e[1]]; __anFire(tobj, "ontimeout", e[2]); }
    else if (k === "rest") { var r = __animSprings[e[1]]; if (r) __anFire(r, "onrest", r); }
  }
}
