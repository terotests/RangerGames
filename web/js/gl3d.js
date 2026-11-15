// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The engine's 3D scene with a real depth buffer: the engine projects and
// lights every face (crates/rg_engine/src/scene3d.rs, render_gl) and hands
// over triangles, 6 floats a corner (x, y in the game's units, depth 0…1,
// r, g, b); this draws them with WebGL and depth testing on a canvas under
// the 2D one, so parts of the scene never show through each other.
(function (global) {
  "use strict";
  var VS = "attribute vec2 p; attribute float d; attribute vec3 c; uniform vec4 xf; varying vec3 v;" +
    "void main() { v = c; gl_Position = vec4(p.x * xf.x + xf.z, p.y * xf.y + xf.w, d * 2.0 - 1.0, 1.0); }";
  var FS = "precision mediump float; varying vec3 v; void main() { gl_FragColor = vec4(v, 1.0); }";

  function Gl3D(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.shown = false;
    if (!canvas) return;
    var gl = null;
    try { gl = canvas.getContext("webgl", { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
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
  }

  // tris: Float32Array (a view into the module's memory); view: the game's
  // place on the page; bg: the page colour round a letterboxed game
  Gl3D.prototype.render = function (tris, view, dpr, bg) {
    var c = this.canvas, gl = this.gl;
    if (!tris.length) {
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
    gl.useProgram(this.prog);
    gl.uniform4f(this.uXf, 2 * s / w, -2 * s / h, 2 * view.x * dpr / w - 1, 1 - 2 * view.y * dpr / h);
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
