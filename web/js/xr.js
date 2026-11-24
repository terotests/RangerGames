// SPDX-License-Identifier: AGPL-3.0-or-later
//
// VR on the web (rg.xr "vr"): a WebXR immersive-vr session (the Meta Quest
// browser, or a desktop browser with a headset or the WebXR emulator). Every
// frame the eyes' poses and fields of view and the controllers go to the
// engine (rg_xr_input), the engine runs the game's frame, the 2D view is
// painted into the panel's texture (rg_xr_panel) and each eye into WebXR's
// framebuffer (rg_xr_eye). Needs the WebGL2 painter (glhost.js).
// See crates/rg_engine/src/xr.rs and docs/vr.md.
(function (global) {
  "use strict";

  function Xr(host) {
    this.host = host;
    this.session = null;
    this.ref = null;
    this.layer = null;
    this.fb = 0;
    this.fbObj = undefined;
    this.last = 0;
  }

  Xr.prototype.send = function (data) {
    var x = this.host.x;
    if (!x || !x.rg_xr_input) return;
    var a = this.host.put(JSON.stringify(data));
    x.rg_xr_input(a[0], a[1]);
    this.host.free(a);
  };

  // tells the engine whether this browser can show a headset session
  Xr.prototype.caps = function () {
    var self = this;
    if (!this.host.glhost || !navigator.xr || !navigator.xr.isSessionSupported) return;
    navigator.xr.isSessionSupported("immersive-vr").then(function (ok) {
      if (ok) self.send({ event: "caps", vr: true });
    }).catch(function () { });
  };

  Xr.prototype.start = function () {
    var self = this, host = this.host;
    if (this.session) return;
    if (!navigator.xr || !host.glhost) { this.send({ event: "error", reason: "unsupported" }); return; }
    var gl = host.glhost.gl;
    navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] }).then(function (s) {
      self.session = s;
      s.addEventListener("end", function () { self.ended(); });
      var ready = gl.makeXRCompatible ? gl.makeXRCompatible() : Promise.resolve();
      return ready.then(function () {
        self.layer = new global.XRWebGLLayer(s, gl, { antialias: true, depth: true, stencil: false, alpha: false });
        s.updateRenderState({ baseLayer: self.layer });
        return s.requestReferenceSpace("local-floor").catch(function () { return s.requestReferenceSpace("local"); });
      }).then(function (ref) {
        self.ref = ref;
        self.last = 0;
        self.send({ event: "start" });
        s.requestAnimationFrame(function (t, f) { self.frame(t, f); });
      });
    }).catch(function (err) {
      self.session = null;
      self.send({ event: "error", reason: String((err && err.name) || err) });
    });
  };

  Xr.prototype.end = function () {
    if (this.session) this.session.end().catch(function () { });
  };

  Xr.prototype.ended = function () {
    this.session = null;
    this.ref = null;
    this.layer = null;
    this.fbObj = undefined;
    this.send({ event: "end" });
    // back to the page's own frames
    this.host.resumeLoop();
  };

  // a controller's buzz (rg.xr.pulse)
  Xr.prototype.pulse = function (a) {
    if (!this.session) return;
    a = a || {};
    var srcs = this.session.inputSources || [];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (a.hand && a.hand !== "both" && s.handedness !== a.hand) continue;
      var gp = s.gamepad;
      if (!gp) continue;
      var k = Math.max(0, Math.min(1, a.strength === undefined ? 0.6 : a.strength)), ms = Math.max(1, Math.min(2000, a.ms || 60));
      try {
        if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) gp.hapticActuators[0].pulse(k, ms);
        else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) gp.vibrationActuator.playEffect("dual-rumble", { duration: ms, strongMagnitude: k, weakMagnitude: k });
      } catch (e) { }
    }
  };

  function pose(p) {
    if (!p) return null;
    var t = p.transform, a = t.position, o = t.orientation;
    return { p: [a.x, a.y, a.z], q: [o.x, o.y, o.z, o.w] };
  }

  // a projection matrix's tangents: left, right, up, down
  function tans(m) {
    var lr = 2 / m[0], ud = 2 / m[5];
    return [lr * (1 - m[8]) / 2, lr * (1 + m[8]) / 2, ud * (1 + m[9]) / 2, ud * (1 - m[9]) / 2];
  }

  Xr.prototype.frame = function (t, frame) {
    var self = this, host = this.host, s = this.session;
    if (!s) return;
    s.requestAnimationFrame(function (t2, f2) { self.frame(t2, f2); });
    var vp = frame.getViewerPose(this.ref);
    if (!vp) return;
    var views = [];
    for (var i = 0; i < vp.views.length; i++) {
      var v = vp.views[i], p = pose(v);
      p.t = tans(v.projectionMatrix);
      views.push(p);
    }
    var hands = [];
    var srcs = s.inputSources || [];
    for (var k = 0; k < srcs.length; k++) {
      var src = srcs[k];
      if (src.handedness !== "left" && src.handedness !== "right") continue;
      var h = { side: src.handedness, aim: pose(frame.getPose(src.targetRaySpace, this.ref)), grip: src.gripSpace ? pose(frame.getPose(src.gripSpace, this.ref)) : null, buttons: [0, 0, 0, 0, 0, 0], stick: [0, 0] };
      var gp = src.gamepad;
      if (gp) {
        // xr-standard: 0 trigger, 1 squeeze, 3 stick press, 4 A / X, 5 B / Y
        var map = [0, 1, 3, 4, 5, 6];
        for (var b = 0; b < 6; b++) { var bt = gp.buttons[map[b]]; h.buttons[b] = bt ? (bt.value || (bt.pressed ? 1 : 0)) : 0; }
        if (gp.axes && gp.axes.length >= 4) h.stick = [gp.axes[2], gp.axes[3]];
        else if (gp.axes && gp.axes.length >= 2) h.stick = [gp.axes[0], gp.axes[1]];
      }
      hands.push(h);
    }
    this.send({ views: views, head: pose(vp), hands: hands });
    var dt = this.last ? t - this.last : 11.1;
    this.last = t;
    host.xrFrame(dt);
    // the game may have left VR in its frame
    if (!this.session || !this.layer) return;
    var x = host.x, layer = this.layer;
    // the panel: the game's 2D view, about 2.5 pixels a game unit
    var gw = host.view.w || 360, gh = host.view.h || 640;
    var k2 = Math.min(2.5, 2048 / Math.max(gw, gh));
    x.rg_xr_panel(Math.round(gw * k2), Math.round(gh * k2));
    // WebXR's framebuffer as a handle of glhost.js (null: the canvas's own)
    if (this.fbObj !== layer.framebuffer) {
      this.fbObj = layer.framebuffer;
      this.fb = layer.framebuffer ? host.glhost.put(layer.framebuffer) : 0;
    }
    var bg = host.background || "#000000";
    var r = parseInt(bg.slice(1, 3), 16) / 255, g = parseInt(bg.slice(3, 5), 16) / 255, bb = parseInt(bg.slice(5, 7), 16) / 255;
    if (!(r >= 0)) { r = 0; g = 0; bb = 0; }
    var n = x.rg_xr_eyes();
    for (var e = 0; e < n && e < vp.views.length; e++) {
      var port = layer.getViewport(vp.views[e]);
      x.rg_xr_eye(e, this.fb, port.x, port.y, port.width, port.height, r, g, bb);
    }
  };

  global.RgXr = Xr;
})(window);
