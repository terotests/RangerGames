// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What every game script runs on: CErXes evaluates this before the game.
//
// The engine calls `__frame(json)` once per frame. The argument carries the
// view's size, the time since the last frame, the input state and the
// frame's input events (each pointer event with the id of the element EVG's
// hit test found under it). Handlers registered by the previous `view()`
// get their events, then the script's `tick(dt, input)` runs, then `view()`,
// and the element tree comes back as JSON together with the commands the
// game queued for the host (sounds, vibration, saves, the 3D scene):
//
//   { tree: { t: tag, id?, cls?, a?: {attr}, s?: {style}, c?: [child] }, cmds: [[kind, name, args]] }
//
// with a text child as a plain string. A function-valued `on…` prop is kept
// here under an id (the element's own `id`, or one made up), which is how a
// tap on the screen finds its way back to it. An element without handlers
// is serialized once and its JSON kept on the object, so a scene built once
// and returned again every frame costs nothing after the first frame.
var width = 360, height = 640;
var __handlers = {};
var __ids = 0;
var __cmds = [];
var __saved = {};
var __game = "";
var __dir = "/";
var __games = [];
var __input = { keys: {}, pointer: { x: 0, y: 0, down: false }, pointers: [], time: 0 };
var __downTarget = {};

var __LENGTH = { width: 1, height: 1, left: 1, top: 1, right: 1, bottom: 1, minWidth: 1, minHeight: 1,
  maxWidth: 1, maxHeight: 1, margin: 1, marginTop: 1, marginLeft: 1, marginRight: 1, marginBottom: 1,
  padding: 1, paddingTop: 1, paddingLeft: 1, paddingRight: 1, paddingBottom: 1, fontSize: 1,
  borderRadius: 1, borderWidth: 1, gap: 1, letterSpacing: 1, lineHeight: 0 };

var __seed = 12345;
var rg = {
  // sounds: a built-in effect's name ("jump", "coin", "click", "win",
  // "lose", "pop", "hit", "tick", "whoosh", "note") or a file in the game's
  // folder ("sounds/hop.wav"); opts: { volume, pitch, freq }
  sound: function (name, opts) { __cmds.push(["sound", String(name), opts === undefined ? null : opts]); },
  music: function (name, opts) { __cmds.push(["music", String(name), opts === undefined ? null : opts]); },
  stopMusic: function () { __cmds.push(["stop", "music", null]); },
  // a vibration in milliseconds, or a pattern [on, off, on, …]
  vibrate: function (ms) { __cmds.push(["vibrate", "", ms === undefined ? 30 : ms]); },
  save: function (key, value) {
    __saved[key] = value;
    __cmds.push(["save", String(key), value === undefined ? null : value]);
  },
  load: function (key, fallback) { return Object.prototype.hasOwnProperty.call(__saved, key) ? __saved[key] : fallback; },
  launch: function (id) { __cmds.push(["launch", String(id), null]); },
  exit: function () { __cmds.push(["launch", "", null]); },
  title: function (t) { __cmds.push(["title", String(t), null]); },
  // the 3D layer (three.js on the web): rg.three("add", { id, shape, … })
  three: function (op, args) { __cmds.push(["three", String(op), args === undefined ? null : args]); },
  // a path in the game's folder, for <img src>
  asset: function (path) { return path.charAt(0) === "/" ? path : __dir + "/" + path; },
  games: function () { return __games; },
  // seeded random numbers, the same on every platform
  seed: function (n) { __seed = (n | 0) % 2147483648; if (__seed < 0) __seed += 2147483648; },
  random: function () { __seed = (__seed * 1103515245 + 12345) % 2147483648; return __seed / 2147483648; },
  range: function (lo, hi) { return lo + Math.floor(rg.random() * (hi - lo + 1)); },
  pick: function (arr) { return arr[Math.floor(rg.random() * arr.length)]; },
  shuffle: function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rg.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  },
  clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  ease: {
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    back: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    bounce: function (t) {
      var n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
      if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
      t -= 2.625 / d; return n * t * t + 0.984375;
    }
  },
  // rectangles overlap: {x, y, w, h}
  hit: function (a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
};

// Appends n's serialized form to out; answers whether it registered a handler.
function __ser(n, out) {
  if (n === null || n === undefined || n === true || n === false) return false;
  if (Array.isArray(n)) {
    var any = false;
    for (var i = 0; i < n.length; i++) if (__ser(n[i], out)) any = true;
    return any;
  }
  if (typeof n !== "object") { out.push(String(n)); return false; }
  if (typeof n.type !== "string") return false;
  if (n.__s !== undefined) { out.push(n.__s); return false; }
  var handlers = false;
  var e = { t: n.type };
  var p = n.props || {};
  for (var k in p) {
    var v = p[k];
    if (v === null || v === undefined || v === false || k === "key" || k === "children") continue;
    if (typeof v === "function") {
      if (k.slice(0, 2) !== "on") continue;
      if (!e.id) e.id = p.id ? String(p.id) : "__h" + (__ids++);
      __handlers[e.id + ":" + k.slice(2).toLowerCase()] = v;
      handlers = true;
    } else if (k === "className" || k === "class") {
      e.cls = String(v);
    } else if (k === "id") {
      e.id = String(v);
    } else if (k === "style" && typeof v === "object") {
      var s = {};
      for (var sk in v) {
        var sv = v[sk];
        if (sv === null || sv === undefined || sv === false) continue;
        s[sk] = typeof sv === "number" && __LENGTH[sk] ? sv + "px" : String(sv);
      }
      e.s = s;
    } else {
      if (!e.a) e.a = {};
      e.a[k] = String(v);
    }
  }
  var kids = n.children || [];
  if (kids.length) {
    e.c = [];
    for (var j = 0; j < kids.length; j++) if (__ser(kids[j], e.c)) handlers = true;
  }
  if (!handlers) Object.defineProperty(n, "__s", { value: e, enumerable: false });
  out.push(e);
  return handlers;
}

function __handler(id, type) {
  return id ? __handlers[id + ":" + type] : undefined;
}

function __frame(arg) {
  var a = JSON.parse(arg);
  width = a.w;
  height = a.h;
  __input.keys = a.input.keys;
  __input.pointer = a.input.pointer;
  __input.pointers = a.input.pointers;
  __input.time = a.time;
  var ev = a.events;
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i];
    var info = { x: e.x, y: e.y, id: e.id, pointer: e.pointer };
    if (e.type === "keydown") { if (typeof onKeyDown === "function") onKeyDown(e.key, __input); }
    else if (e.type === "keyup") { if (typeof onKeyUp === "function") onKeyUp(e.key, __input); }
    else if (e.type === "back") { if (typeof onBack === "function") { onBack(); } else { rg.exit(); } }
    else if (e.type === "pointerdown") {
      __downTarget[e.pointer] = e.id;
      var hd = __handler(e.id, "pointerdown");
      if (hd) hd(info);
      else if (typeof onPointerDown === "function") onPointerDown(e.x, e.y, info);
    } else if (e.type === "pointerup") {
      var hu = __handler(e.id, "pointerup");
      if (hu) hu(info);
      else if (typeof onPointerUp === "function") onPointerUp(e.x, e.y, info);
      // a tap: down and up on the same element
      if (e.id && __downTarget[e.pointer] === e.id) {
        var hc = __handler(e.id, "click");
        if (hc) hc(info);
      }
      __downTarget[e.pointer] = undefined;
    }
  }
  if (typeof tick === "function") tick(a.dt, __input);
  __handlers = {};
  __ids = 0;
  var out = [];
  __ser(typeof view === "function" ? view() : null, out);
  var cmds = __cmds;
  __cmds = [];
  return JSON.stringify({ tree: out.length === 1 ? out[0] : { t: "div", c: out }, cmds: cmds });
}

function __start(arg) {
  var a = JSON.parse(arg);
  width = a.w;
  height = a.h;
  __game = a.game;
  __dir = a.dir;
  __saved = a.saved || {};
  __games = a.games || [];
  rg.seed(a.seed || 1);
  if (typeof init === "function") init();
  var cmds = __cmds;
  __cmds = [];
  return JSON.stringify(cmds);
}
