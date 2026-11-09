// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The optional 3D layer: a game's rg.three(op, args) commands drive a
// three.js scene drawn under the 2D canvas, so EVG's HUD and buttons sit on
// top of the 3D view. three.js is loaded the first time a game asks for it.
//
//   rg.three("scene",  { background: "#87ceeb", fog: 0 })
//   rg.three("camera", { x, y, z, lookAt: [x, y, z], fov })
//   rg.three("light",  { id, type: "ambient" | "directional" | "point", color, intensity, x, y, z })
//   rg.three("add",    { id, shape: "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus",
//                        size: [..], color, x, y, z, rx, ry, rz, texture: "dice.png" })
//   rg.three("set",    { id, x, y, z, rx, ry, rz, sx, sy, sz, color, visible })
//   rg.three("remove", { id })
//   rg.three("clear")
(function (global) {
  "use strict";
  var THREE_URL = "https://unpkg.com/three@0.149.0/build/three.min.js";

  function Three3D(canvas, loadTexture) {
    this.canvas = canvas;
    this.loadTexture = loadTexture;
    this.queue = [];
    this.loading = false;
    this.ready = false;
    this.active = false;
    this.objects = {};
    this.lights = {};
  }

  Three3D.prototype.load = function () {
    var self = this;
    if (this.loading) return;
    this.loading = true;
    // the copy the build put beside the page (offline, Android), else the CDN
    var urls = ["vendor/three.min.js", global.RG_THREE_URL || THREE_URL];
    var tryNext = function () {
      var url = urls.shift();
      if (!url) { console.warn("three.js could not be loaded: the 3D layer is off"); return; }
      var s = document.createElement("script");
      s.src = url;
      s.onload = function () { self.init(); };
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  };

  Three3D.prototype.init = function () {
    var T = global.THREE;
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(0, 4, 8);
    this.camera.lookAt(0, 0, 0);
    var amb = new T.AmbientLight(0xffffff, 0.6);
    var dir = new T.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 6, 4);
    this.scene.add(amb); this.scene.add(dir);
    this.lights.ambient = amb; this.lights.sun = dir;
    this.ready = true;
    var q = this.queue; this.queue = [];
    for (var i = 0; i < q.length; i++) this.apply(q[i][0], q[i][1]);
  };

  Three3D.prototype.command = function (op, args) {
    if (op === "clear") { this.clear(); return; }
    this.active = true;
    this.canvas.style.display = "block";
    if (!this.ready) { this.queue.push([op, args]); this.load(); return; }
    this.apply(op, args || {});
  };

  Three3D.prototype.geometry = function (a) {
    var T = global.THREE, s = a.size || [];
    switch (a.shape) {
      case "sphere": return new T.SphereGeometry(s[0] || 0.5, 32, 16);
      case "cylinder": return new T.CylinderGeometry(s[0] || 0.5, s[1] === undefined ? (s[0] || 0.5) : s[1], s[2] || 1, 32);
      case "cone": return new T.ConeGeometry(s[0] || 0.5, s[1] || 1, 32);
      case "plane": return new T.PlaneGeometry(s[0] || 10, s[1] || 10);
      case "torus": return new T.TorusGeometry(s[0] || 0.5, s[1] || 0.2, 16, 48);
      default: return new T.BoxGeometry(s[0] || 1, s[1] === undefined ? (s[0] || 1) : s[1], s[2] === undefined ? (s[0] || 1) : s[2]);
    }
  };

  Three3D.prototype.place = function (o, a) {
    if (a.x !== undefined) o.position.x = a.x;
    if (a.y !== undefined) o.position.y = a.y;
    if (a.z !== undefined) o.position.z = a.z;
    if (a.rx !== undefined) o.rotation.x = a.rx;
    if (a.ry !== undefined) o.rotation.y = a.ry;
    if (a.rz !== undefined) o.rotation.z = a.rz;
    if (a.sx !== undefined) o.scale.x = a.sx;
    if (a.sy !== undefined) o.scale.y = a.sy;
    if (a.sz !== undefined) o.scale.z = a.sz;
    if (a.visible !== undefined) o.visible = !!a.visible;
    if (a.color !== undefined && o.material) o.material.color.set(a.color);
  };

  Three3D.prototype.apply = function (op, a) {
    var T = global.THREE;
    if (op === "scene") {
      this.scene.background = a.background ? new T.Color(a.background) : null;
      this.scene.fog = a.fog ? new T.Fog(a.background || 0xffffff, a.fog, a.fog * 4) : null;
    } else if (op === "camera") {
      if (a.fov) { this.camera.fov = a.fov; this.camera.updateProjectionMatrix(); }
      this.camera.position.set(a.x || 0, a.y || 0, a.z === undefined ? 8 : a.z);
      var l = a.lookAt || [0, 0, 0];
      this.camera.lookAt(l[0], l[1], l[2]);
    } else if (op === "light") {
      var id = a.id || "light";
      var light = this.lights[id];
      if (!light) {
        light = a.type === "ambient" ? new T.AmbientLight(0xffffff, 0.5) : a.type === "point" ? new T.PointLight(0xffffff, 1, 50) : new T.DirectionalLight(0xffffff, 0.8);
        this.lights[id] = light; this.scene.add(light);
      }
      if (a.color) light.color.set(a.color);
      if (a.intensity !== undefined) light.intensity = a.intensity;
      if (a.x !== undefined) light.position.set(a.x, a.y || 0, a.z || 0);
    } else if (op === "add") {
      if (this.objects[a.id]) this.apply("remove", a);
      var mat = new T.MeshStandardMaterial({ color: a.color || "#ffffff", roughness: a.roughness === undefined ? 0.6 : a.roughness, metalness: a.metalness || 0 });
      if (a.texture) { var tex = this.loadTexture(a.texture); if (tex) mat.map = tex; }
      var mesh = new T.Mesh(this.geometry(a), mat);
      this.place(mesh, a);
      this.objects[a.id] = mesh; this.scene.add(mesh);
    } else if (op === "set") {
      var o = this.objects[a.id];
      if (o) this.place(o, a);
    } else if (op === "remove") {
      var r = this.objects[a.id];
      if (r) { this.scene.remove(r); r.geometry.dispose(); r.material.dispose(); delete this.objects[a.id]; }
    }
  };

  Three3D.prototype.clear = function () {
    for (var id in this.objects) this.apply("remove", { id: id });
    this.active = false;
    this.canvas.style.display = "none";
  };

  Three3D.prototype.render = function (view, dpr) {
    if (!this.ready || !this.active) return;
    var c = this.canvas, w = Math.round(view.w * view.scale), h = Math.round(view.h * view.scale);
    if (this.size !== w + "x" + h) {
      this.size = w + "x" + h;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      c.style.left = view.x + "px"; c.style.top = view.y + "px";
      c.style.width = w + "px"; c.style.height = h + "px";
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  };

  global.RgThree = Three3D;
})(window);
