// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The web host: loads the engine (rg_web.wasm) and the games' pack into
// its virtual directory, feeds it the screen size, touches, mouse and keys,
// paints each frame's draw stream (painter.js) and does what the game asked
// for: sounds (audio.js), vibration, saves (localStorage), the 3D layer
// (three-bridge.js). The same page runs inside the Android shell's WebView,
// which adds window.RgAndroid for vibration and the back button.
(function (global) {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var params = new URLSearchParams(global.location.search);
  var DEBUG = params.has("debug");

  function Host(opts) {
    this.canvas = opts.canvas;
    this.canvas3d = opts.canvas3d;
    this.status = opts.status;
    this.debugEl = opts.debug;
    this.images = new Map();
    this.imageState = {};
    this.view = { scale: 1, x: 0, y: 0, w: 360, h: 640 };
    this.last = 0;
    this.frames = 0;
    this.frameMs = 0;
    this.background = "#000000";
    var self = this;
    this.audio = new RgAudio(function (p) { return self.readFile(p); });
    this.three = new RgThree(this.canvas3d, function (p) { return self.texture(p); });
  }

  Host.prototype.boot = function (wasmUrl, packUrl) {
    var self = this;
    var wasi = RgWasi.makeWasi(function (fd, line) { (fd === 2 ? console.warn : console.log)("[engine] " + line); });
    var fetchWasm = fetch(wasmUrl).then(function (r) { if (!r.ok) throw new Error(wasmUrl + ": " + r.status); return r.arrayBuffer(); });
    var fetchPack = fetch(packUrl).then(function (r) { if (!r.ok) throw new Error(packUrl + ": " + r.status); return r.arrayBuffer(); });
    return Promise.all([fetchWasm, fetchPack]).then(function (both) {
      return WebAssembly.instantiate(both[0], { wasi_snapshot_preview1: wasi.imports }).then(function (res) {
        self.x = res.instance.exports;
        wasi.setMemory(self.x.memory);
        if (self.x._initialize) self.x._initialize();
        var n = self.mountPack("/games", new Uint8Array(both[1]));
        if (n < 0) throw new Error("the games pack is not a pack");
        self.restoreSaves();
        self.x.rg_seed(Date.now() % 2147483647);
        self.attach();
        self.resize();
        var first = params.get("game") || "";
        self.start(first);
        self.status.style.display = "none";
        global.requestAnimationFrame(function (t) { self.loop(t); });
      });
    });
  };

  // text or bytes into the module's memory: [ptr, len] (freed by the caller)
  Host.prototype.put = function (data) {
    var bytes = typeof data === "string" ? enc.encode(data) : data;
    var p = this.x.rg_alloc(bytes.length);
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes);
    return [p, bytes.length];
  };
  Host.prototype.free = function (pl) { this.x.rg_free(pl[0], pl[1]); };
  Host.prototype.text = function (ptr, len) {
    return len ? dec.decode(new Uint8Array(this.x.memory.buffer, ptr, len)) : "";
  };

  Host.prototype.mountPack = function (prefix, bytes) {
    var a = this.put(prefix), b = this.put(bytes);
    var n = this.x.rg_mount(a[0], a[1], b[0], b[1]);
    this.free(a); this.free(b);
    return n;
  };

  Host.prototype.readFile = function (path) {
    var a = this.put(path);
    var n = this.x.rg_read(a[0], a[1]);
    this.free(a);
    if (n < 0) return null;
    return new Uint8Array(this.x.memory.buffer, this.x.rg_result_ptr(), this.x.rg_result_len()).slice();
  };

  Host.prototype.restoreSaves = function () {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("rg:/save/") === 0) {
          var a = this.put(k.slice(3)), b = this.put(localStorage.getItem(k) || "");
          this.x.rg_put(a[0], a[1], b[0], b[1]);
          this.free(a); this.free(b);
        }
      }
    } catch (e) { /* no storage: games start fresh */ }
  };

  Host.prototype.start = function (id) {
    var a = this.put(id);
    this.x.rg_start(a[0], a[1]);
    this.free(a);
    this.afterCall();
    this.readView();
  };

  Host.prototype.readView = function () {
    var x = this.x;
    this.view = { scale: x.rg_view(0), x: x.rg_view(1), y: x.rg_view(2), w: x.rg_view(3), h: x.rg_view(4) };
  };

  Host.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = global.innerWidth, h = global.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.x.rg_resize(w, h);
    this.readView();
    this.three.size = "";
  };

  Host.prototype.attach = function () {
    var self = this, c = this.canvas;
    global.addEventListener("resize", function () { self.resize(); });
    var pid = function (e) { return e.pointerType === "mouse" ? 0 : (e.pointerId % 1000) + 1; };
    var at = function (e) { var r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    var unlock = function () { self.audio.unlock(); self.audio.resumeWanted(); };
    c.addEventListener("pointerdown", function (e) {
      e.preventDefault(); unlock();
      try { c.setPointerCapture(e.pointerId); } catch (err) { }
      var p = at(e); self.x.rg_pointer(0, pid(e), p[0], p[1]);
    });
    c.addEventListener("pointermove", function (e) { var p = at(e); self.x.rg_pointer(1, pid(e), p[0], p[1]); });
    var up = function (e) { var p = at(e); self.x.rg_pointer(2, pid(e), p[0], p[1]); };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    var key = function (down) {
      return function (e) {
        if (e.repeat) return;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Backspace"].indexOf(e.key) >= 0) e.preventDefault();
        unlock();
        var a = self.put(e.key);
        self.x.rg_key(down ? 1 : 0, a[0], a[1]);
        self.free(a);
      };
    };
    global.addEventListener("keydown", key(true));
    global.addEventListener("keyup", key(false));
    // the Android shell's back button
    global.rgBack = function () { var a = self.put("Back"); self.x.rg_key(1, a[0], a[1]); self.free(a); return true; };
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && self.audio.ctx) self.audio.ctx.suspend();
      else if (self.audio.ctx) self.audio.ctx.resume();
    });
  };

  Host.prototype.afterCall = function () {
    var x = this.x;
    var log = this.text(x.rg_log_ptr(), x.rg_log_len());
    if (log) console.log(log);
    var cmds = this.text(x.rg_cmds_ptr(), x.rg_cmds_len());
    if (cmds && cmds !== "[]") {
      var list = JSON.parse(cmds);
      for (var i = 0; i < list.length; i++) this.command(list[i][0], list[i][1], list[i][2]);
    }
  };

  Host.prototype.vibrate = function (v) {
    if (global.RgAndroid && global.RgAndroid.vibrate) {
      global.RgAndroid.vibrate(Array.isArray(v) ? JSON.stringify(v) : String(v));
    } else if (navigator.vibrate) {
      try { navigator.vibrate(v); } catch (e) { }
    }
  };

  Host.prototype.command = function (kind, name, args) {
    switch (kind) {
      case "sound": this.audio.play(name, args); break;
      case "music": this.audio.startMusic(name, args); break;
      case "stop": this.audio.stopMusic(); break;
      case "vibrate": this.vibrate(args); break;
      case "persist": try { localStorage.setItem("rg:" + name, typeof args === "string" ? args : JSON.stringify(args)); } catch (e) { } break;
      case "title": document.title = name ? name + " · RangerGames" : "RangerGames"; this.readView(); break;
      case "three": this.three.command(name, args); break;
      case "quit": if (global.RgAndroid && global.RgAndroid.quit) global.RgAndroid.quit(); break;
      default: break;
    }
  };

  // an image of the virtual directory (or a URL), loaded once
  Host.prototype.image = function (src) {
    var self = this;
    if (this.imageState[src]) return;
    this.imageState[src] = "loading";
    var bytes = src.charAt(0) === "/" ? this.readFile(src) : null;
    var img = new Image();
    img.onload = function () { self.images.set(src, img); };
    img.onerror = function () { console.warn("image " + src + " did not load"); };
    if (bytes) {
      var type = /\.svg$/i.test(src) ? "image/svg+xml" : /\.jpe?g$/i.test(src) ? "image/jpeg" : "image/png";
      img.src = URL.createObjectURL(new Blob([bytes], { type: type }));
    } else {
      img.src = src;
    }
  };

  Host.prototype.texture = function (src) {
    if (!global.THREE) return null;
    var bytes = this.readFile(src.charAt(0) === "/" ? src : src);
    var url = bytes ? URL.createObjectURL(new Blob([bytes])) : src;
    return new global.THREE.TextureLoader().load(url);
  };

  Host.prototype.loop = function (t) {
    var self = this;
    global.requestAnimationFrame(function (n) { self.loop(n); });
    var dt = this.last ? t - this.last : 16.7;
    this.last = t;
    var t0 = performance.now();
    var x = this.x;
    x.rg_frame(dt);
    this.afterCall();
    this.readView();
    var nums = new Float32Array(x.memory.buffer, x.rg_draw_ptr(), x.rg_draw_len());
    var strings = this.text(x.rg_strings_ptr(), x.rg_strings_len()).split("\u0000");
    // images the frame names that are not loaded yet
    for (var i = 0; i < nums.length;) {
      if (nums[i] === 2 && nums[i + 18] >= 0) {
        var src = strings[nums[i + 18]];
        if (!this.images.has(src)) this.image(src);
      }
      i += 23 + (nums[i + 22] | 0);
    }
    this.three.render(this.view, this.dpr);
    if (!this.painter) this.painter = new RgPainter(this.canvas, this.images);
    this.painter.paint(nums, strings, this.view, this.dpr, this.three.active ? null : this.background);
    var ms = performance.now() - t0;
    this.frameMs = this.frameMs * 0.95 + ms * 0.05;
    if (DEBUG && (this.frames++ % 15 === 0)) {
      this.debugEl.style.display = "block";
      this.debugEl.textContent = this.frameMs.toFixed(1) + " ms · " + (nums.length / 23 | 0) + " cmds";
    }
  };

  global.RgHost = Host;
})(window);
