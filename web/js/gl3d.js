// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The engine's 3D scene with a real depth buffer: the engine projects and
// lights every face (crates/rg_engine/src/scene3d.rs, render_gl) and hands
// over triangles, 6 floats a corner (x, y in the game's units, depth 0…1,
// r, g, b); this draws them with WebGL and depth testing on a canvas under
// the 2D one, so parts of the scene never show through each other.
//
// On WebGL2 it also draws meshes through a game's mesh() hook (rg.shader
// kind "mesh"): the engine's `mtris` (22 floats a corner, scene3d.rs) with
// shaders/mesh/mesh.vs and the hook's mesh/mesh.fs from rg_shader, before
// the triangles, so the depth sorts them.
(function (global) {
  "use strict";
  // depth 2…3: a see-through face (a flame), its colour added over what is behind (alpha 0 under premultiplied
  // blending; the engine sends them last, far ones first)
  var VS = "attribute vec2 p; attribute float d; attribute vec3 c; uniform vec4 xf; varying vec4 v;" +
    "void main() { float g = step(1.5, d); v = vec4(c, 1.0 - g); gl_Position = vec4(p.x * xf.x + xf.z, p.y * xf.y + xf.w, (d - 2.0 * g) * 2.0 - 1.0, 1.0); }";
  var FS = "precision mediump float; varying vec4 v; void main() { gl_FragColor = v; }";

  function Gl3D(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.shown = false;
    if (!canvas) return;
    var gl = null;
    var attrs = { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: false };
    try { gl = canvas.getContext("webgl2", attrs); } catch (e) { gl = null; }
    this.webgl2 = !!gl;
    if (!gl) { try { gl = canvas.getContext("webgl", attrs); } catch (e) { gl = null; } }
    if (!gl) return;
    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]].forEach(function (s) {
      var sh = gl.createShader(s[0]);
      gl.shaderSource(sh, s[1]);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.gl = gl;
    this.prog = prog;
    this.aP = gl.getAttribLocation(prog, "p");
    this.aD = gl.getAttribLocation(prog, "d");
    this.aC = gl.getAttribLocation(prog, "c");
    this.uXf = gl.getUniformLocation(prog, "xf");
    this.buf = gl.createBuffer();
    this.ok = true;
    // mesh() hooks (WebGL2): programs by key ("" the engine's own; null: it did not compile)
    this.mprogs = {};
    this.mbuf = null;
    this.source = null;
  }

  var ENV = [["rg_eye", 3], ["rg_time", 1], ["rg_water", 1], ["rg_surface", 1], ["rg_wcolor", 3], ["rg_absorb", 3],
    ["rg_scatter", 1], ["rg_sun", 3], ["rg_suncol", 3], ["rg_sky", 3], ["rg_caustics", 1], ["rg_cscale", 1]];

  // source(path, defines): a stage's GLSL from the engine (rg_shader), or null; explain(path, defines, log)
  Gl3D.prototype.setShaderSource = function (source, explain) {
    this.source = source;
    this.explain = explain;
    this.mprogs = {};
  };

  Gl3D.prototype.meshProg = function (key) {
    if (key in this.mprogs) return this.mprogs[key];
    var gl = this.gl, path = key ? "game:" + key : "mesh/mesh.fs", made = null;
    var vs = this.source && this.source("mesh/mesh.vs", ""), fs = this.source && this.source(path, "");
    if (vs && fs) {
      var prog = gl.createProgram(), ok = true, self = this;
      [[gl.VERTEX_SHADER, vs, "mesh/mesh.vs"], [gl.FRAGMENT_SHADER, fs, path]].forEach(function (s) {
        var sh = gl.createShader(s[0]);
        gl.shaderSource(sh, s[1]);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          ok = false;
          var log = gl.getShaderInfoLog(sh) || "";
          console.warn(self.explain ? self.explain(s[2], "", log) : log);
        }
        gl.attachShader(prog, sh);
      });
      if (ok) gl.linkProgram(prog);
      if (ok && gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        made = { prog: prog, xf: gl.getUniformLocation(prog, "xf"), env: ENV.map(function (e) { return gl.getUniformLocation(prog, e[0]); }), u: {} };
      }
    }
    this.mprogs[key] = made;
    return made;
  };

  function uniform(gl, l, v) {
    if (!l) return;
    if (v.length === 1) gl.uniform1f(l, v[0]);
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
    else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
  }

  // m: { tris: Float32Array, env: Float32Array, batches: [[key, uniforms, first, count]] }
  Gl3D.prototype.drawMeshes = function (m, xf) {
    var gl = this.gl;
    if (!this.webgl2 || !m || m.tris.length < 66 || !m.batches.length) return;
    if (!this.mbuf) {
      this.mbuf = gl.createBuffer();
      this.mvao = gl.createVertexArray();
      gl.bindVertexArray(this.mvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.mbuf);
      [[0, 4, 0], [1, 3, 16], [2, 3, 28], [3, 3, 40], [4, 3, 52], [5, 3, 64], [6, 3, 76]].forEach(function (a) {
        gl.enableVertexAttribArray(a[0]);
        gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 88, a[2]);
      });
    }
    gl.bindVertexArray(this.mvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mbuf);
    gl.bufferData(gl.ARRAY_BUFFER, m.tris, gl.STREAM_DRAW);
    var corners = Math.floor(m.tris.length / 22);
    for (var i = 0; i < m.batches.length; i++) {
      var b = m.batches[i], p = this.meshProg(b[0]);
      if (!p) p = this.meshProg("");
      if (!p) continue;
      var count = Math.min(b[3], corners - b[2]);
      if (count <= 0) continue;
      gl.useProgram(p.prog);
      gl.uniform4f(p.xf, xf[0], xf[1], xf[2], xf[3]);
      for (var e = 0, at = 0; e < ENV.length; at += ENV[e][1], e++) {
        if (at + ENV[e][1] <= m.env.length) uniform(gl, p.env[e], m.env.subarray(at, at + ENV[e][1]));
      }
      if (b[1]) b[1].split(";").forEach(function (kv) {
        var k = kv.split("=");
        if (k.length !== 2 || !k[0]) return;
        if (!(k[0] in p.u)) p.u[k[0]] = gl.getUniformLocation(p.prog, "u_" + k[0]);
        var v = k[1].split(",").map(Number);
        if (v.length >= 1 && v.length <= 4 && v.every(isFinite)) uniform(gl, p.u[k[0]], v);
      });
      gl.drawArrays(gl.TRIANGLES, b[2], count);
    }
    gl.bindVertexArray(null);
  };

  // tris: Float32Array (a view into the module's memory); view: the game's
  // place on the page; bg: the page colour round a letterboxed game
  Gl3D.prototype.render = function (tris, view, dpr, bg, meshes) {
    var c = this.canvas, gl = this.gl;
    if (!tris.length && !(meshes && meshes.tris.length)) {
      if (this.shown) { c.style.visibility = "hidden"; this.shown = false; }
      return false;
    }
    var w = Math.round(parseFloat(c.style.width || "0") * dpr), h = Math.round(parseFloat(c.style.height || "0") * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    if (!this.shown) { c.style.visibility = "visible"; this.shown = true; }
    gl.viewport(0, 0, w, h);
    gl.disable(gl.SCISSOR_TEST);
    var k = parseInt((bg || "#000000").slice(1), 16) || 0;
    gl.clearColor((k >> 16 & 255) / 255, (k >> 8 & 255) / 255, (k & 255) / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // the game's box only (as the 2D painter clips)
    var s = view.scale * dpr;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.round(view.x * dpr), Math.round(h - (view.y + view.h * view.scale) * dpr), Math.round(view.w * s), Math.round(view.h * s));
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var xf = [2 * s / w, -2 * s / h, 2 * view.x * dpr / w - 1, 1 - 2 * view.y * dpr / h];
    this.drawMeshes(meshes, xf);
    gl.useProgram(this.prog);
    gl.uniform4f(this.uXf, xf[0], xf[1], xf[2], xf[3]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, tris, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.aP);
    gl.enableVertexAttribArray(this.aD);
    gl.enableVertexAttribArray(this.aC);
    gl.vertexAttribPointer(this.aP, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(this.aD, 1, gl.FLOAT, false, 24, 8);
    gl.vertexAttribPointer(this.aC, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, tris.length / 6);
    return true;
  };

  global.RgGl3D = Gl3D;
})(typeof window !== "undefined" ? window : this);
