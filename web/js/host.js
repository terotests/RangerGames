// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The web host: loads the engine (rg_web.wasm) and the games' pack into
// its virtual directory, feeds it the screen size, touches, mouse and keys,
// paints each frame's draw stream (painter.js) and does what the game asked
// for: sounds (audio.js), vibration, saves (localStorage), the 3D layer
// (three-bridge.js). The Android app has its own native host (android/).
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
    // fit(): the game's size in CSS pixels and how much the page zooms it
    // ({ w, h, zoom }); without it the game fills the window
    this.fit = opts.fit || null;
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
    // the engine's own 3D scene, depth-tested with WebGL (gl3d.js); without
    // WebGL the engine paints it into the draw stream as before
    // ?gl=1: the whole frame (2D, globes, 3D) painted by the engine with
    // WebGL2 (crates/rg_gl, glhost.js) into one canvas
    this.glhost = params.get("gl") === "1" && global.RgGlHost && opts.canvasGl ? new RgGlHost(opts.canvasGl, this) : null;
    if (this.glhost && !this.glhost.ok) this.glhost = null;
    this.gl3d = !this.glhost && global.RgGl3D && opts.canvasGl ? new RgGl3D(opts.canvasGl) : null;
    this.net = global.RgNet ? new RgNet(function (ev) { self.sendSensor("net", ev); }) : null;
  }

  Host.prototype.boot = function (wasmUrl, packUrl) {
    var self = this;
    var wasi = RgWasi.makeWasi(function (fd, line) { (fd === 2 ? console.warn : console.log)("[engine] " + line); });
    var small = this.status.querySelector("small");
    var get = function (url, size) {
      return self.download(url, size, function (u, l, t) { self.progress(small, "Ladataan…", u, l, t); });
    };
    var sizes = fetch("sizes.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return sizes.then(function (sz) {
      self.sizes = sz || {};
      return Promise.all([get(wasmUrl, sz[wasmUrl]), get(packUrl, sz[packUrl])]);
    }).then(function (both) {
      // the GL imports (crates/rg_gl): answered by glhost.js with ?gl=1, else nothing is called
      var none = new Proxy({}, { get: function () { return function () { return 0; }; } });
      var gh = self.glhost;
      return WebAssembly.instantiate(both[0], { wasi_snapshot_preview1: wasi.imports, gl: gh ? gh.glImports() : none, rghost: gh ? gh.hostImports() : none }).then(function (res) {
        self.x = res.instance.exports;
        wasi.setMemory(self.x.memory);
        if (gh) {
          gh.memory = self.x.memory;
          if (self.x.rg_gl_all) {
            self.x.rg_gl_all(1);
            gh.canvas.style.visibility = "visible";
          } else {
            self.glhost = null;
          }
        }
        if (self.x._initialize) self.x._initialize();
        var n = self.mountPack("/games", new Uint8Array(both[1]));
        if (n < 0) throw new Error("the games pack is not a pack");
        self.restoreSaves();
        self.x.rg_seed(Date.now() % 2147483647);
        // ?notex: planets drawn from their regions even where textures work
        if (self.x.rg_textures && global.RgPainter && global.RgPainter.canDrawSpheres && !params.has("notex") && global.RgPainter.canDrawSpheres()) {
          self.x.rg_textures(1);
          if (self.x.rg_detail && global.RgPainter.canDrawDetail && !params.has("nodetail")) self.x.rg_detail(1);
          if (self.x.rg_terrain && global.RgPainter.canDrawTerrain && !params.has("noterrain")) self.x.rg_terrain(1);
          if (self.x.rg_splats && global.RgPainter.canDrawSplats && !params.has("nosplats") && global.RgPainter.canDrawSplats()) self.x.rg_splats(1);
        }
        // ?nogl: the old painter-sorted 3D, for comparing
        if (self.gl3d && self.gl3d.ok && self.x.rg_gl3d && !params.has("nogl")) self.x.rg_gl3d(1);
        else self.gl3d = null;
        // rg.store: games installed from the download list, kept in IndexedDB
        if (self.x.rg_store && global.indexedDB) self.x.rg_store(1);
        return self.storeRestore().then(function () {
          self.attach();
          self.resize();
          var first = params.get("game") || (global.RG_PAGE && global.RG_PAGE.game) || "";
          self.status.style.display = "none";
          self.start(first);
          global.requestAnimationFrame(function (t) { self.loop(t); });
        });
      });
    });
  };

  // a file's bytes (ArrayBuffer), with onProgress(loaded, total) as they
  // come; total is the real size from sizes.json (build-web.sh), else
  // Content-Length (the compressed size when the server gzips)
  Host.prototype.download = function (url, size, onProgress) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ": " + r.status);
      var len = size || +r.headers.get("Content-Length") || 0;
      if (!r.body || !r.body.getReader) return r.arrayBuffer();
      var reader = r.body.getReader(), parts = [], got = 0;
      var pump = function () {
        return reader.read().then(function (c) {
          if (c.done) {
            var out = new Uint8Array(got), at = 0;
            for (var i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
            return out.buffer;
          }
          parts.push(c.value); got += c.value.length;
          if (onProgress) onProgress(url, got, len);
          return pump();
        });
      };
      return pump();
    });
  };

  // the loading screen's text: every file's bytes so far of their sizes
  Host.prototype.progress = function (small, label, url, got, len) {
    var p = this.loading || (this.loading = { got: {}, len: {} });
    p.got[url] = got; if (len) p.len[url] = len;
    var l = 0, t = 0, k;
    for (k in p.got) l += p.got[k];
    for (k in p.len) t += p.len[k];
    if (!small) return;
    var mb = function (n) { return (n / 1048576).toFixed(1).replace(".", ","); };
    small.textContent = t > 0 && l <= t
      ? label + " " + Math.floor(100 * l / t) + " %  (" + mb(l) + " / " + mb(t) + " Mt)"
      : label + " " + mb(l) + " Mt";
  };

  // a game's own pack (web: every game but the launcher is one, fetched when
  // it is first opened): the loading screen over the game until it is
  // mounted at /games/<id>, then the engine starts the game
  Host.prototype.loadPack = function (id, url) {
    var self = this, small = this.status.querySelector("small");
    this.loading = null;
    if (small) small.textContent = "Ladataan peliä…";
    this.status.style.display = "";
    this.download(url, (this.sizes || {})[url], function (u, l, t) { self.progress(small, "Ladataan peliä…", u, l, t); })
      .then(function (buf) {
        if (self.mountPack("/games/" + id, new Uint8Array(buf)) < 0) throw new Error(url + ": not a pack");
        return true;
      })
      .catch(function (e) { console.warn(e); return false; })
      .then(function (ok) {
        self.status.style.display = "none";
        var a = self.put(id);
        self.x.rg_pack_done(a[0], a[1], ok ? 1 : 0);
        self.free(a);
        self.afterCall();
        self.readView();
      });
  };

  // text or bytes into the module's memory: [ptr, len] (freed by the caller)
  Host.prototype.put = function (data) {
    var bytes = typeof data === "string" ? enc.encode(data) : data;
    var p = this.x.rg_alloc(bytes.length) >>> 0;   // wasm pointers past 2 GB come out negative
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes);
    return [p, bytes.length];
  };
  Host.prototype.free = function (pl) { this.x.rg_free(pl[0], pl[1]); };
  Host.prototype.text = function (ptr, len) {
    return len ? dec.decode(new Uint8Array(this.x.memory.buffer, ptr >>> 0, len)) : "";
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
    return new Uint8Array(this.x.memory.buffer, this.x.rg_result_ptr() >>> 0, this.x.rg_result_len()).slice();
  };

  Host.prototype.restoreSaves = function () {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("rg:/save/") === 0) {
          var a = this.put(k.slice(3)), b = this.put(localStorage.getItem(k) || "");
          this.x.rg_put(a[0], a[1], b[0], b[1]);
          this.free(a); this.free(b);
        } else if (k && k.indexOf("rgimg:/save/") === 0) {
          // a photo (rg.camera), kept as a data URL
          var bin = atob((localStorage.getItem(k) || "").split(",")[1] || ""), bytes = new Uint8Array(bin.length);
          for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          this.putFile(k.slice(6), bytes);
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
    var f = this.fit ? this.fit() : { w: global.innerWidth, h: global.innerHeight, zoom: 1 };
    var w = f.w, h = f.h;
    // a zoomed game (the desktop phone frame) draws at the zoomed resolution
    // so it stays sharp
    var dpr = Math.min(global.devicePixelRatio || 1, 2) * (f.zoom || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    if (this.gl3d && this.gl3d.canvas) { this.gl3d.canvas.style.width = w + "px"; this.gl3d.canvas.style.height = h + "px"; }
    if (this.glhost) {
      var gc = this.glhost.canvas;
      gc.width = Math.round(w * dpr);
      gc.height = Math.round(h * dpr);
      gc.style.width = w + "px";
      gc.style.height = h + "px";
    }
    this.x.rg_resize(w, h);
    this.readView();
    this.three.size = "";
  };

  Host.prototype.attach = function () {
    var self = this, c = this.canvas;
    global.addEventListener("resize", function () { self.resize(); });
    var pid = function (e) { return e.pointerType === "mouse" ? 0 : (e.pointerId % 1000) + 1; };
    // in the game's own pixels, also when the page zooms the canvas
    var at = function (e) {
      var r = c.getBoundingClientRect(), k = r.width ? c.offsetWidth / r.width : 1;
      return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
    };
    var unlock = function () { self.audio.unlock(); self.audio.resumeWanted(); };
    // which pointers are down: a release the canvas never heard (the mouse
    // let go outside the page or the playground's frame) is sent when the
    // next move shows no button held, so the game does not keep dragging
    var held = {}, last = {};
    c.addEventListener("pointerdown", function (e) {
      e.preventDefault(); unlock();
      try { c.setPointerCapture(e.pointerId); } catch (err) { }
      held[pid(e)] = true;
      var p = last[pid(e)] = at(e); self.x.rg_pointer(0, pid(e), p[0], p[1]);
    });
    var up = function (e) {
      var id = pid(e);
      if (!held[id]) return;
      held[id] = false;
      var p = e.clientX === undefined ? last[id] : at(e);
      self.x.rg_pointer(2, id, p[0], p[1]);
    };
    var move = function (e) {
      if (e.pointerType === "mouse" && held[0] && e.buttons === 0) { up(e); return; }
      var p = last[pid(e)] = at(e); self.x.rg_pointer(1, pid(e), p[0], p[1]);
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    // a mouse button let go outside the window, where the canvas hears nothing
    global.addEventListener("pointerup", function (e) { if (e.target !== c) up(e); });
    global.addEventListener("blur", function () { if (held[0]) up({ pointerType: "mouse" }); });
    // the mouse wheel and a touchpad's two-finger swipe: onWheel(dy, info)
    // in the game (the launcher scrolls with it), in the game's pixels
    c.addEventListener("wheel", function (e) {
      e.preventDefault();
      var k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? c.offsetHeight : 1;
      var p = at(e), v = self.view || { scale: 1, x: 0, y: 0 }, z = v.scale || 1;
      self.sendSensor("wheel", { dx: e.deltaX * k / z, dy: e.deltaY * k / z, x: (p[0] - v.x) / z, y: (p[1] - v.y) / z });
    }, { passive: false });
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

  // the clipboard: the Android shell's, else the browser's (or a hidden
  // text area where navigator.clipboard is missing)
  Host.prototype.copy = function (text) {
    if (global.RgAndroid && global.RgAndroid.copy) { global.RgAndroid.copy(text); return; }
    var old = function () {
      var t = document.createElement("textarea");
      t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (e) { }
      document.body.removeChild(t);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(old);
    else old();
  };

  Host.prototype.vibrate = function (v) {
    if (global.RgAndroid && global.RgAndroid.vibrate) {
      global.RgAndroid.vibrate(Array.isArray(v) ? JSON.stringify(v) : String(v));
    } else if (navigator.vibrate) {
      try { navigator.vibrate(v); } catch (e) { }
    }
  };

  // the phone's GPS and compass for rg.sensor (geolocation needs https or localhost)
  Host.prototype.sendSensor = function (name, data) {
    if (!this.x.rg_sensor) return;
    var a = this.put(name), b = this.put(JSON.stringify(data));
    this.x.rg_sensor(a[0], a[1], b[0], b[1]);
    this.free(a); this.free(b);
  };
  Host.prototype.sensor = function (name, on) {
    var self = this;
    if (name === "location" || name === "*") {
      if (on && this.geoWatch === undefined) {
        if (!navigator.geolocation) { this.sendSensor("error", { sensor: "location", reason: "unavailable" }); }
        else {
          this.geoWatch = navigator.geolocation.watchPosition(function (p) {
            var c = p.coords;
            self.sendSensor("location", { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy || 50,
              speed: c.speed == null ? -1 : c.speed, bearing: c.heading == null || isNaN(c.heading) ? -1 : c.heading,
              altitude: c.altitude || 0, time: p.timestamp });
          }, function (err) {
            self.sendSensor("error", { sensor: "location", reason: err.code === 1 ? "permission" : "unavailable" });
          }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
        }
      } else if (!on && this.geoWatch !== undefined) {
        navigator.geolocation.clearWatch(this.geoWatch);
        this.geoWatch = undefined;
      }
    }
    if (name === "orient" || name === "*") {
      // the phone's whole turn: rows = the screen's right, up and out-of-screen
      // axes in the world (x east, y north, z up), like the Android host sends
      if (on && !this.onTurn) {
        this.onTurn = function (e) {
          if (e.alpha == null || e.beta == null || e.gamma == null) return;
          var t = Date.now();
          if (self.lastTurnAt && t - self.lastTurnAt < 30) return;
          self.lastTurnAt = t;
          var d = Math.PI / 180, a = e.alpha * d, b = e.beta * d, g = e.gamma * d;
          var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
          // R = Rz(alpha) Rx(beta) Ry(gamma), world = R * device; columns = device axes
          var X = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg];
          var Y = [-sa * cb, ca * cb, sb];
          var Z = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg];
          var turn = (screen.orientation && screen.orientation.angle) || global.orientation || 0;
          turn = ((turn % 360) + 360) % 360;
          var neg = function (v) { return [-v[0], -v[1], -v[2]]; }, sx = X, sy = Y;
          if (turn === 90) { sx = Y; sy = neg(X); } else if (turn === 180) { sx = neg(X); sy = neg(Y); } else if (turn === 270) { sx = neg(Y); sy = X; }
          self.sendSensor("orient", { m: sx.concat(sy, Z) });
        };
        global.addEventListener("deviceorientation", this.onTurn);
      } else if (!on && this.onTurn) {
        global.removeEventListener("deviceorientation", this.onTurn);
        this.onTurn = null;
      }
    }
    if (name === "mic" || name === "*") this.mic(on);
    if (name === "heading" || name === "*") {
      if (on && !this.onOrient) {
        this.onOrient = function (e) {
          var deg = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null);
          if (deg == null) return;
          var t = Date.now();
          if (self.lastHeadingAt && t - self.lastHeadingAt < 80) return;
          self.lastHeadingAt = t;
          self.sendSensor("heading", { deg: deg });
        };
        global.addEventListener("deviceorientationabsolute", this.onOrient);
        global.addEventListener("deviceorientation", this.onOrient);
      } else if (!on && this.onOrient) {
        global.removeEventListener("deviceorientationabsolute", this.onOrient);
        global.removeEventListener("deviceorientation", this.onOrient);
        this.onOrient = null;
      }
    }
  };

  // rg.sensor("mic"): the microphone's loudness about 20 times a second, the
  // sound itself goes nowhere (no recording). getUserMedia needs https or
  // localhost; echo cancellation keeps the game's own speech out where it can.
  Host.prototype.mic = function (on) {
    var self = this;
    if (on && !this.micOn) {
      this.micOn = true;
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) { this.micOn = false; this.sendSensor("error", { sensor: "mic", reason: "unavailable" }); return; }
      md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
        if (!self.micOn) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        var AC = global.AudioContext || global.webkitAudioContext;
        var ctx = new AC();
        var src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        var buf = new Float32Array(an.fftSize);
        var timer = setInterval(function () {
          if (document.hidden) return;
          if (ctx.state === "suspended") ctx.resume();
          an.getFloatTimeDomainData(buf);
          var sum = 0;
          for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          var rms = Math.sqrt(sum / buf.length);
          var db = rms > 0.00001 ? 20 * Math.log(rms) / Math.LN10 : -100;
          self.sendSensor("mic", { db: Math.round(db * 10) / 10, talk: self.audio.busy() });
        }, 50);
        self.micStop = function () { clearInterval(timer); stream.getTracks().forEach(function (t) { t.stop(); }); try { ctx.close(); } catch (e) { } };
      }, function (err) {
        self.micOn = false;
        var name = err && err.name;
        self.sendSensor("error", { sensor: "mic", reason: name === "NotAllowedError" || name === "SecurityError" ? "permission" : "unavailable" });
      });
    } else if (!on && this.micOn) {
      this.micOn = false;
      if (this.micStop) { this.micStop(); this.micStop = null; }
    }
  };

  // rg.camera on the web: the file picker (a phone's browser offers the camera),
  // the picture scaled down like the Android host does, kept in localStorage
  Host.prototype.camera = function (id) {
    var self = this;
    var fail = function (reason) { self.sendSensor("photo", { id: id, ok: false, reason: reason }); };
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return fail("bad-id");
    var input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.setAttribute("capture", "environment");
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return fail("cancelled");
      var img = new Image();
      img.onload = function () {
        var jpeg = function (max, q, done) {
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/jpeg", q);
          var bin = atob(url.split(",")[1]), b = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
          done(b, url, c.width, c.height);
        };
        jpeg(960, 0.82, function (big, bigUrl, bw, bh) {
          jpeg(200, 0.8, function (thumb, thumbUrl) {
            var path = "/save/photos/" + id + ".jpg", tpath = "/save/photos/" + id + "_t.jpg";
            self.putFile(path, big); self.putFile(tpath, thumb);
            try { localStorage.setItem("rgimg:" + path, bigUrl); localStorage.setItem("rgimg:" + tpath, thumbUrl); } catch (e) { console.warn("photo not kept (storage full)"); }
            self.sendSensor("photo", { id: id, ok: true, path: path, thumb: tpath, w: bw, h: bh });
          });
        });
      };
      img.onerror = function () { fail("decode"); };
      img.src = URL.createObjectURL(f);
    };
    input.click();
  };
  // ------------------------------------------------------------ rg.store --
  // Downloadable games (the launcher's ⚙️ → Lataa pelejä), as the phone app
  // does them (android/…/Store.java): the list from Sliqtly Games, a game's
  // pack checked to hold only its own folder, mounted over /games and kept
  // in IndexedDB ("rg-store") for the next visit.
  var STORE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/, STORE_MAX = 66 * 1048576;

  Host.prototype.storeDb = function () {
    if (this.storeDbP) return this.storeDbP;
    this.storeDbP = new Promise(function (res) {
      try {
        var r = global.indexedDB.open("rg-store", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("packs"); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return this.storeDbP;
  };

  // one IndexedDB request on the packs: its result, null on failure
  Host.prototype.storeReq = function (mode, f) {
    return this.storeDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try {
          var r = f(db.transaction("packs", mode).objectStore("packs"));
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  };

  Host.prototype.storeRestore = function () {
    var self = this;
    this.storeIndex = {};
    if (!this.x.rg_store || !global.indexedDB) return Promise.resolve();
    return this.storeReq("readonly", function (st) { return st.getAll(); }).then(function (list) {
      (list || []).forEach(function (e) {
        if (!e || !e.meta || !e.bytes) return;
        if (self.mountPack("/games", new Uint8Array(e.bytes)) < 0) return;
        self.storeIndex[e.meta.id] = e.meta;
        self.storeNote(e.meta, false);
      });
    }).catch(function (e) { console.warn("store", e); });
  };

  function storeFolder(m) { return m.kind === "addon" ? m["extends"] + "/addons/" + m.id : m.id; }

  Host.prototype.storeNote = function (m, removed) {
    var n = { id: m.id, version: m.version, kind: m.kind, "extends": m["extends"] || "", source: m.source || "", updated: m.updated || "" };
    if (removed) n.removed = true;
    this.putFile("/games/" + storeFolder(m) + "/_store.json", enc.encode(JSON.stringify(n)));
  };

  Host.prototype.storeEvent = function (ev) { this.sendSensor("store", ev); };

  // why the bytes are not a pack of the folder `prefix` (null: they are)
  Host.storeCheck = function (b, prefix) {
    var pos = 0;
    function line() {
      var i = pos;
      while (i < b.length && b[i] !== 10) { if (i - pos > 4096) return null; i++; }
      if (i >= b.length) return null;
      var s = dec.decode(b.subarray(pos, i)); pos = i + 1; return s;
    }
    if (line() !== "RGPK1") return "not RGPK1";
    var count = parseInt(line(), 10);
    if (!(count >= 1 && count <= 100000)) return "file count";
    for (var k = 0; k < count; k++) {
      var p = line(), size = parseInt(line(), 10);
      if (p === null || p.indexOf(prefix) !== 0 || p.length === prefix.length) return "outside the folder: " + p;
      if (/\.\.|\/\/|\\|\u0000/.test(p) || /\/_store\.json$/.test(p)) return "bad path: " + p;
      if (!(size >= 0) || pos + size > b.length) return "ends inside " + p;
      pos += size;
    }
    return null;
  };

  Host.prototype.storeCommand = function (name, a) {
    var self = this;
    var err = function (id, reason, status) {
      var ev = { type: "error", reason: reason };
      if (id) ev.id = id;
      if (status) ev.status = status;
      self.storeEvent(ev);
    };
    if (name === "catalog") {
      fetch(a.url, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) { err(null, "http", r.status); return null; }
        return r.json().then(function (c) { self.storeEvent({ type: "catalog", games: (c && c.games) || [] }); });
      }).catch(function () { err(null, "offline"); });
      return;
    }
    if (name === "remove") {
      var m = this.storeIndex[a.id];
      if (!m) { err(a.id, "not-installed"); return; }
      this.storeNote(m, true);
      delete this.storeIndex[a.id];
      this.storeReq("readwrite", function (st) { return st["delete"](a.id); });
      this.storeEvent({ type: "removed", id: a.id });
      return;
    }
    if (name !== "install") return;
    var id = String(a.id || ""), kind = a.kind === "addon" ? "addon" : "game", ext = String(a["extends"] || "");
    if (!STORE_ID.test(id) || id === "launcher" || (kind === "addon" && !STORE_ID.test(ext)) || !/^https:\/\//.test(String(a.pack))) { err(id, "bad-pack"); return; }
    if (kind === "game" && !this.storeIndex[id] && this.readFile("/games/" + id + "/game.json")) { err(id, "taken"); return; }
    if (kind === "addon" && !this.readFile("/games/" + ext + "/game.json")) { err(id, "no-base"); return; }
    if ((+a.bytes || 0) > STORE_MAX) { err(id, "too-big"); return; }
    var meta = { id: id, version: +a.version || 1, kind: kind, "extends": ext, name: String(a.name || id), source: String(a.source || ""), updated: String(a.updated || "") };
    var told = 0;
    this.download(String(a.pack), +a.bytes || 0, function (u, got, total) {
      if (got - told >= 262144) { told = got; self.storeEvent({ type: "progress", id: id, done: got, total: total }); }
    }).then(function (buf) {
      var bytes = new Uint8Array(buf);
      if (bytes.length > STORE_MAX) { err(id, "too-big"); return; }
      var why = Host.storeCheck(bytes, storeFolder(meta) + "/");
      if (why || self.mountPack("/games", bytes) < 0) { console.warn("store " + id + ": " + why); err(id, "bad-pack"); return; }
      self.storeIndex[id] = meta;
      self.storeNote(meta, false);
      self.storeReq("readwrite", function (st) { return st.put({ meta: meta, bytes: buf }, id); });
      self.storeEvent({ type: "installed", id: id, version: meta.version });
    }).catch(function (e) {
      var m = /: (\d+)$/.exec(String(e && e.message));
      if (m) err(id, "http", +m[1]); else err(id, "offline");
    });
  };

  Host.prototype.putFile = function (path, bytes) {
    var a = this.put(path), b = this.put(bytes);
    this.x.rg_put(a[0], a[1], b[0], b[1]);
    this.free(a); this.free(b);
  };

  // the running game in the address (?game=id), so the address bar is a
  // direct link to it; not inside the playground's iframe (it does its own)
  Host.prototype.syncAddress = function () {
    if (global.top !== global || global.RG_PAGE || !global.history || !global.history.replaceState) return;
    try {
      var u = new URL(global.location.href);
      if (this.game) u.searchParams.set("game", this.game); else u.searchParams.delete("game");
      var h = u.href.replace(/=(&|$|#)/g, "$1");   // ?nogl, not ?nogl=
      if (h !== global.location.href) global.history.replaceState(null, "", h);
    } catch (e) { }
  };

  Host.prototype.command = function (kind, name, args) {
    switch (kind) {
      case "sound": this.audio.play(name, args); break;
      case "say": this.audio.say(args); break;
      case "music": this.audio.startMusic(name, args); break;
      case "stop": this.audio.stopMusic(args); break;
      case "soundctl": this.audio.control(name, args); break;
      case "vibrate": this.vibrate(args); break;
      case "copy": this.copy(String(args)); break;
      case "open": if (/^\/[^\/\\]/.test(String(args))) global.location.href = String(args); break;
      case "persist": try { localStorage.setItem("rg:" + name, typeof args === "string" ? args : JSON.stringify(args)); } catch (e) { } break;
      case "title":
        document.title = name ? name + " · RangerGames" : "RangerGames"; this.readView();
        this.game = typeof args === "string" ? args : "";
        this.syncAddress();
        break;
      case "three": this.three.command(name, args); break;
      case "pack": this.loadPack(name, String(args)); break;
      case "sensor": this.sensor(name, args !== false); break;
      case "net": if (this.net) this.net.command(name, args); break;
      case "store": this.storeCommand(name, args || {}); break;
      case "camera": this.camera(name); break;
      case "photo-delete": try { localStorage.removeItem("rgimg:/save/photos/" + name + ".jpg"); localStorage.removeItem("rgimg:/save/photos/" + name + "_t.jpg"); } catch (e) { } break;
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
    img.onerror = function () { self.imageState[src] = "error"; console.warn("image " + src + " did not load"); };
    if (bytes) {
      var type = /\.svg$/i.test(src) ? "image/svg+xml" : /\.jpe?g$/i.test(src) ? "image/jpeg" : /\.webp$/i.test(src) ? "image/webp" : "image/png";
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
    var nums = new Float32Array(x.memory.buffer, x.rg_draw_ptr() >>> 0, x.rg_draw_len());
    var strings = this.text(x.rg_strings_ptr(), x.rg_strings_len()).split("\u0000");
    // images the frame names that are not loaded yet
    for (var i = 0; i < nums.length;) {
      if ((nums[i] === 2 || nums[i] === 8) && nums[i + 18] >= 0) {
        var src = strings[nums[i + 18]];
        if (!this.images.has(src)) this.image(src);
        // a globe's second picture (city lights)
        if (nums[i] === 8 && nums[i + 19] >= 0) {
          var src2 = strings[nums[i + 19]];
          if (!this.images.has(src2)) this.image(src2);
        }
        // its height pictures "shading|shape"
        if (nums[i] === 8 && nums[i + 20] >= 0) {
          var hn = strings[nums[i + 20]].split("|");
          for (var hk = 0; hk < hn.length; hk++) if (hn[hk] && !this.images.has(hn[hk])) this.image(hn[hk]);
        }
        // its rings' pictures "colour|opacity" (slot 21, with 44 numbers)
        if (nums[i] === 8 && (nums[i + 22] | 0) >= 44 && nums[i + 23 + 42] > 0.5) {
          var rn = strings[nums[i + 21]].split("|");
          for (var rk = 0; rk < rn.length; rk++) if (rn[rk] && !this.images.has(rn[rk])) this.image(rn[rk]);
        }
      }
      i += 23 + (nums[i + 22] | 0);
    }
    this.three.render(this.view, this.dpr);
    if (this.glhost) {
      this.frameStrings = strings;
      this.frameDraw = [x.rg_draw_ptr() >>> 0, x.rg_draw_len()];
      var bg = this.background, br = parseInt(bg.slice(1, 3), 16) / 255, bgn = parseInt(bg.slice(3, 5), 16) / 255, bb = parseInt(bg.slice(5, 7), 16) / 255;
      if (!(br >= 0)) { br = 0; bgn = 0; bb = 0; }
      x.rg_gl_frame(this.glhost.canvas.width, this.glhost.canvas.height, this.dpr, br, bgn, bb);
      this.frameTime(t0, nums);
      return;
    }
    var gl = false;
    if (this.gl3d && this.gl3d.ok) gl = this.gl3d.render(new Float32Array(x.memory.buffer, x.rg_tris_ptr() >>> 0, x.rg_tris_len()), this.view, this.dpr, this.background);
    if (!this.painter) this.painter = new RgPainter(this.canvas, this.images);
    this.painter.paint(nums, strings, this.view, this.dpr, this.three.active || gl ? null : this.background);
    this.frameTime(t0, nums);
  };

  Host.prototype.frameTime = function (t0, nums) {
    var ms = performance.now() - t0;
    this.frameMs = this.frameMs * 0.95 + ms * 0.05;
    if (DEBUG && (this.frames++ % 15 === 0)) {
      this.debugEl.style.display = "block";
      this.debugEl.textContent = this.frameMs.toFixed(1) + " ms · " + (nums.length / 23 | 0) + " cmds";
    }
  };

  global.RgHost = Host;
})(window);
