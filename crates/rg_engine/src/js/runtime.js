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
var __voices = {};        // lang -> { clip id: true } (the clips of the other languages than Finnish)
var __launcher = false;
var __input = { keys: {}, pointer: { x: 0, y: 0, down: false }, pointers: [], time: 0 };
var __downTarget = {};
var __fx = [];            // celebration particles, drawn above the game
var __flash = 0;          // a full-screen glow after rg.celebrate, fading out
// The close button (an X in a corner) every game but the launcher gets. A
// game sets `rg.closeButton = "left"` to move it, or "none" to draw its own.
var __CLOSE = "__close";
var __FX_COLORS = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff", "#c77dff", "#f78c6b"];
var __FX_ICONS = ["⭐", "🌟", "✨", "⭐", "🎈", "🎉"];

var __LENGTH = { width: 1, height: 1, left: 1, top: 1, right: 1, bottom: 1, minWidth: 1, minHeight: 1,
  maxWidth: 1, maxHeight: 1, margin: 1, marginTop: 1, marginLeft: 1, marginRight: 1, marginBottom: 1,
  padding: 1, paddingTop: 1, paddingLeft: 1, paddingRight: 1, paddingBottom: 1, fontSize: 1,
  borderRadius: 1, borderWidth: 1, gap: 1, letterSpacing: 1, lineHeight: 0 };

// a word without its accents, for clip ids: "ä" → "a", "ó" → "o", "ñ" → "n"
var __ACCENTS = { "ä": "a", "ö": "o", "å": "a", "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n" };
function __plain(s) {
  var o = "";
  for (var i = 0; i < s.length; i++) { var c = s.charAt(i); o += __ACCENTS[c] || c; }
  return o;
}

var __seed = 12345;
var rg = {
  // sounds: a built-in effect's name ("jump", "coin", "click", "win",
  // "lose", "pop", "hit", "tick", "whoosh", "note") or a file in the game's
  // folder ("sounds/hop.wav"); opts: { volume, pitch, freq }
  sound: function (name, opts) { __cmds.push(["sound", String(name), opts === undefined ? null : opts]); },
  // speech: voice clips rendered by crates/rg_voice from voice/fi.json (Finnish)
  // and voice/<lang>/*.json (English "en", Spanish "es") into /games/_voice/<lang>.
  // rg.say("hyva"), or a list said one after another: rg.say(["valitse", "punainen"]).
  // The language: "en:apple" in the id, or opts.lang, or else rg.lang when the
  // game sets one (default Finnish). An id that language has no clip for is
  // said in Finnish, so a game can move to another language clip by clip.
  // A new say cuts the one playing unless opts.queue; opts: { volume, queue,
  // lang }. rg.say([]) or rg.stopSay() is quiet.
  say: function (ids, opts) {
    var list = [], a = Array.isArray(ids) ? ids : [ids];
    var lang = (opts && opts.lang) || rg.lang || "fi";
    for (var i = 0; i < a.length; i++) {
      if (a[i] === undefined || a[i] === null || a[i] === "") continue;
      var id = String(a[i]);
      list.push(id.charAt(0) === "/" ? id : rg.voiceFile(id, lang));
    }
    var o = { list: list };
    if (opts) for (var k in opts) if (k !== "lang") o[k] = opts[k];
    __cmds.push(["say", list.length ? list[0] : "", o]);
  },
  // the file of a clip: "apple" (in `lang`) or "en:apple"; Finnish when the
  // language has no such clip
  voiceFile: function (id, lang) {
    var c = id.indexOf(":");
    if (c > 0 && c < 4) { lang = id.slice(0, c); id = id.slice(c + 1); }
    if (lang && lang !== "fi" && !rg.hasVoice(id, lang)) lang = "fi";
    return "/games/_voice/" + (lang || "fi") + "/" + id + ".wav";
  },
  // whether `lang` ("en", "es") has a clip `id` (Finnish: always true)
  hasVoice: function (id, lang) {
    if (!lang || lang === "fi") return true;
    var v = __voices[lang];
    return !!(v && v[id]);
  },
  stopSay: function () { rg.say([]); },
  // the clip id of a number (0–20), a letter ("Ä" → "kirjain_ae", "Ñ" →
  // "kirjain_enye") or a word ("Ratón" → "sana_raton"), in any language
  sayId: {
    number: function (n) { return n >= 0 && n <= 20 ? "n" + Math.round(n) : ""; },
    letter: function (c) {
      var l = String(c).toLowerCase();
      return "kirjain_" + (l === "ä" ? "ae" : l === "ö" ? "oe" : l === "ñ" ? "enye" : __plain(l));
    },
    word: function (w) { return "sana_" + __plain(String(w).toLowerCase()).split(" ").join("_"); }
  },
  // The language every game uses: "fi", "en" or "es", chosen with the flags
  // in the launcher and kept for all games. rg.setLang("en") changes it.
  // rg.t("Valitse!", "Choose!", "¡Elige!") gives the text in the current
  // language (Finnish when the others are missing); rg.t({ fi, en, es }) too.
  lang: "fi",
  langs: ["fi", "en", "es"],
  flags: { fi: "🇫🇮", en: "🇬🇧", es: "🇪🇸" },
  setLang: function (l) {
    l = String(l);
    if (rg.langs.indexOf(l) < 0 || l === rg.lang) return;
    rg.lang = l;
    __cmds.push(["setting", "lang", l]);
  },
  t: function (fi, en, es) {
    if (fi !== null && typeof fi === "object") { var o = fi; fi = o.fi; en = o.en; es = o.es; }
    var v = rg.lang === "en" ? en : rg.lang === "es" ? es : fi;
    return v === undefined || v === null ? fi : v;
  },
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
  exit: function () { if (__launcher) rg.quit(); else __cmds.push(["launch", "", null]); },
  // closes the app (Android); the web page stays
  quit: function () { __cmds.push(["quit", "", null]); },
  // a phone sensor on or off: "location" (GPS; the game gets onLocation(fix)
  // with { lat, lon, accuracy, speed, bearing, altitude, time }) or
  // "heading" (the compass; onHeading(deg), 0 = the phone's top points north).
  // Failures come as onSensor("error", { sensor, reason }).
  // a photo with the phone's camera: it goes to the phone's photo folder and
  // a small copy to "/save/photos/<id>.jpg" (thumbnail "<id>_t.jpg", for
  // <img src>); then onPhoto({ id, ok, path, thumb, w, h, reason }). id: letters,
  // digits, - and _. rg.deletePhoto(id) forgets the copies (the gallery keeps it).
  camera: function (id) { __cmds.push(["camera", String(id), null]); },
  deletePhoto: function (id) { __cmds.push(["photo-delete", String(id), null]); },
  sensor: function (name, on) { __cmds.push(["sensor", String(name), on !== false]); },
  title: function (t) { __cmds.push(["title", String(t), null]); },
  // the 3D layer (three.js on the web): rg.three("add", { id, shape, … })
  three: function (op, args) { __cmds.push(["three", String(op), args === undefined ? null : args]); },
  // a path in the game's folder, for <img src>
  asset: function (path) { return path.charAt(0) === "/" ? path : __dir + "/" + path; },
  games: function () { return __games; },
  // seeded random numbers, the same on every platform
  // (rg_core's Rng: Park and Miller's minimal standard generator)
  seed: function (n) { __seed = Math.floor(n) % 2147483647; if (__seed < 0) __seed += 2147483647; if (__seed === 0) __seed = 1; },
  random: function () { __seed = (__seed * 48271) % 2147483647; return __seed / 2147483647; },
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
  // where the close button sits: "right" (the default), "left" or "none"
  closeButton: "right",
  // Celebration: stars and confetti burst from (x, y), the screen glows and
  // a cheerful sound plays. opts: { count, sound (false = silent), big }.
  // Made for success moments that a child who cannot read yet still sees.
  celebrate: function (x, y, opts) {
    opts = opts || {};
    if (x === undefined) { x = width / 2; y = height / 2; }
    var big = !!opts.big;
    var n = opts.count || (big ? 46 : 22);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (big ? 160 : 110) + Math.random() * (big ? 320 : 220);
      var icon = i % 3 === 0;
      __fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (big ? 260 : 160), t: 0,
        life: 1.1 + Math.random() * (big ? 0.9 : 0.5), rot: Math.random() * 360, vr: (Math.random() - 0.5) * 720,
        s: icon ? 18 + Math.random() * (big ? 26 : 14) : 6 + Math.random() * 7,
        icon: icon ? __FX_ICONS[i % __FX_ICONS.length] : "", c: __FX_COLORS[i % __FX_COLORS.length] });
    }
    if (big) {
      // confetti from the top edge as well
      for (var k = 0; k < 30; k++) __fx.push({ x: Math.random() * width, y: -20 - Math.random() * 120, vx: (Math.random() - 0.5) * 60,
        vy: 60 + Math.random() * 120, t: 0, life: 2.6, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 400,
        s: 7 + Math.random() * 6, icon: "", c: __FX_COLORS[k % __FX_COLORS.length], slow: true });
    }
    if (__fx.length > 220) __fx.splice(0, __fx.length - 220);
    __flash = big ? 0.5 : 0.25;
    if (opts.sound !== false) rg.sound(big ? "win" : "star");
    rg.vibrate(big ? [30, 40, 60] : 25);
  },
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
    else if (e.type === "sensor") {
      var data = null;
      try { data = JSON.parse(e.id || "null"); } catch (err) { data = null; }
      if (e.key === "location" && typeof onLocation === "function") onLocation(data);
      else if (e.key === "heading" && typeof onHeading === "function") onHeading(data && data.deg);
      else if (e.key === "photo" && typeof onPhoto === "function") onPhoto(data);
      else if (typeof onSensor === "function") onSensor(e.key, data);
    }
    else if (e.type === "back") { if (typeof onBack === "function") { onBack(); } else { rg.exit(); } }
    else if (e.type === "pointerdown") {
      __downTarget[e.pointer] = e.id;
      if (e.id === __CLOSE) continue;
      var hd = __handler(e.id, "pointerdown");
      if (hd) hd(info);
      else if (typeof onPointerDown === "function") onPointerDown(e.x, e.y, info);
    } else if (e.type === "pointerup") {
      if (e.id === __CLOSE) { if (__downTarget[e.pointer] === __CLOSE) __close(); __downTarget[e.pointer] = undefined; continue; }
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
  __fxStep(a.dt);
  var out = [];
  __ser(typeof view === "function" ? view() : null, out);
  var over = __overlay();
  var tree = out.length === 1 && over.length === 0 ? out[0] : { t: "div", s: { width: "100%", height: "100%" }, c: out.concat(over) };
  var cmds = __cmds;
  __cmds = [];
  return JSON.stringify({ tree: tree, cmds: cmds });
}

function __close() {
  rg.sound("click");
  if (typeof onClose === "function") { if (onClose() === false) return; }
  rg.exit();
}

function __fxStep(dt) {
  if (__flash > 0) __flash = Math.max(0, __flash - dt);
  if (!__fx.length) return;
  var keep = [];
  for (var i = 0; i < __fx.length; i++) {
    var p = __fx[i];
    p.t += dt;
    if (p.t >= p.life) continue;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.slow) p.vx += Math.sin(p.t * 4 + p.rot) * 30 * dt; else { p.vy += 520 * dt; p.vx *= 1 - dt * 0.8; }
    keep.push(p);
  }
  __fx = keep;
}

// what the engine draws above the game: the celebration and the close button
function __overlay() {
  var o = [];
  if (__flash > 0) o.push({ t: "div", s: { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%",
    backgroundColor: "#fff6c2", opacity: String(__flash * 0.6) } });
  for (var i = 0; i < __fx.length; i++) {
    var p = __fx[i];
    var fade = p.t > p.life - 0.35 ? (p.life - p.t) / 0.35 : 1;
    if (p.icon) o.push({ t: "div", s: { position: "absolute", left: (p.x - p.s / 2) + "px", top: (p.y - p.s / 2) + "px",
      fontSize: p.s + "px", opacity: String(fade), transform: "rotate(" + Math.round(p.rot) + "deg)" }, c: [p.icon] });
    else o.push({ t: "div", s: { position: "absolute", left: (p.x - p.s / 2) + "px", top: (p.y - p.s / 4) + "px",
      width: p.s + "px", height: (p.s / 2) + "px", borderRadius: "2px", backgroundColor: p.c, opacity: String(fade),
      transform: "rotate(" + Math.round(p.rot) + "deg)" } });
  }
  if (!__launcher && rg.closeButton !== "none") {
    var left = rg.closeButton === "left";
    var pos = { position: "absolute", top: "8px", width: "40px", height: "40px", borderRadius: "20px",
      backgroundColor: "rgba(0,0,0,0.35)", borderWidth: "2px", borderColor: "rgba(255,255,255,0.85)",
      alignItems: "center", justifyContent: "center" };
    if (left) pos.left = "8px"; else pos.left = (width - 48) + "px";
    o.push({ t: "div", id: __CLOSE, s: pos, c: [{ t: "div", s: { fontSize: "22px", fontWeight: "700", color: "#ffffff" }, c: ["✕"] }] });
  }
  return o;
}

// the settings (the language) before the game's own script runs, so its
// top-level constants can use rg.t and rg.lang
function __settings(st) {
  st = st || {};
  rg.lang = rg.langs.indexOf(st.lang) >= 0 ? st.lang : "fi";
}

function __start(arg) {
  var a = JSON.parse(arg);
  width = a.w;
  height = a.h;
  __game = a.game;
  __dir = a.dir;
  __saved = a.saved || {};
  __settings(a.settings);
  __games = a.games || [];
  __voices = {};
  var vs = a.voices || {};
  for (var vl in vs) { var m = {}; for (var vi = 0; vi < vs[vl].length; vi++) m[vs[vl][vi]] = true; __voices[vl] = m; }
  __launcher = !!a.launcher;
  rg.seed(a.seed || 1);
  if (typeof init === "function") init();
  var cmds = __cmds;
  __cmds = [];
  return JSON.stringify(cmds);
}
