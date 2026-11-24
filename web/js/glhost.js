// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The page's side of crates/rg_gl (?gl=1): the WebGL2 calls the renderer
// imports as module "gl", and module "rghost": pictures uploaded from the
// loaded <img>s, text runs written with a 2D canvas, globes drawn by
// painter.js's sphere shader and uploaded as a texture. The engine then
// paints the whole frame (2D, globes, 3D) into one WebGL2 canvas.
(function (global) {
  "use strict";
  var dec = new TextDecoder();

  function GlHost(canvas, host) {
    this.host = host;
    this.canvas = canvas;
    this.gl = null;
    this.memory = null;
    this.objs = [null];
    this.free = [];
    try {
      this.gl = canvas.getContext("webgl2", { alpha: false, antialias: true, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    } catch (e) {
      this.gl = null;
    }
    this.ok = !!this.gl;
    this.textCanvas = document.createElement("canvas");
    this.textCtx = this.textCanvas.getContext("2d", { willReadFrequently: false });
    this.globeCanvas = document.createElement("canvas");
    this.globePainter = null;
    this.globeTex = 0;
    this.failed = {};
  }

  GlHost.prototype.put = function (o) {
    if (!o) return 0;
    var i = this.free.length ? this.free.pop() : this.objs.length;
    this.objs[i] = o;
    return i;
  };
  GlHost.prototype.get = function (i) { return this.objs[i] || null; };
  GlHost.prototype.str = function (p, n) { return n ? dec.decode(new Uint8Array(this.memory.buffer, p >>> 0, n)) : ""; };
  GlHost.prototype.bytes = function (p, n) { return new Uint8Array(this.memory.buffer, p >>> 0, n); };

  // the "gl" import module: crates/rg_gl/src/gl.rs (wasm32)
  GlHost.prototype.glImports = function () {
    var self = this;
    var g = function () { return self.gl; };
    return {
      create_shader: function (t) { return self.put(g().createShader(t)); },
      shader_source: function (s, p, n) { g().shaderSource(self.get(s), self.str(p, n)); },
      compile_shader: function (s) { g().compileShader(self.get(s)); },
      shader_ok: function (s) {
        var ok = g().getShaderParameter(self.get(s), g().COMPILE_STATUS);
        if (!ok) console.warn("rg_gl shader: " + g().getShaderInfoLog(self.get(s)));
        return ok ? 1 : 0;
      },
      create_program: function () { return self.put(g().createProgram()); },
      attach_shader: function (p, s) { g().attachShader(self.get(p), self.get(s)); },
      link_program: function (p) { g().linkProgram(self.get(p)); },
      program_ok: function (p) {
        var ok = g().getProgramParameter(self.get(p), g().LINK_STATUS);
        if (!ok) console.warn("rg_gl program: " + g().getProgramInfoLog(self.get(p)));
        return ok ? 1 : 0;
      },
      uniform_location: function (p, np, nn) {
        var l = g().getUniformLocation(self.get(p), self.str(np, nn));
        return l ? self.put(l) : -1;
      },
      use_program: function (p) { g().useProgram(self.get(p)); },
      uniform1i: function (l, v) { if (l >= 0) g().uniform1i(self.get(l), v); },
      uniform1f: function (l, v) { if (l >= 0) g().uniform1f(self.get(l), v); },
      uniform4f: function (l, a, b, c, d) { if (l >= 0) g().uniform4f(self.get(l), a, b, c, d); },
      create_buffer: function () { return self.put(g().createBuffer()); },
      bind_buffer: function (t, b) { g().bindBuffer(t, self.get(b)); },
      buffer_data: function (t, p, n, usage) { g().bufferData(t, self.bytes(p, n), usage); },
      create_vertex_array: function () { return self.put(g().createVertexArray()); },
      bind_vertex_array: function (a) { g().bindVertexArray(self.get(a)); },
      enable_attrib: function (i) { g().enableVertexAttribArray(i); },
      attrib_pointer: function (i, size, t, norm, stride, off) { g().vertexAttribPointer(i, size, t, !!norm, stride, off); },
      draw_elements: function (mode, count, off) { g().drawElements(mode, count, g().UNSIGNED_INT, off); },
      draw_arrays: function (mode, first, count) { g().drawArrays(mode, first, count); },
      create_texture: function () { return self.put(g().createTexture()); },
      delete_texture: function (t) { var o = self.get(t); if (o) { g().deleteTexture(o); self.objs[t] = null; self.free.push(t); } },
      bind_texture: function (t, tex) { g().bindTexture(t, self.get(tex)); },
      active_texture: function (u) { g().activeTexture(u); },
      tex_image: function (w, h, p, n) {
        var gl = g();
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, n ? self.bytes(p, n) : null);
      },
      tex_sub_image: function (x, y, w, h, p, n) {
        var gl = g();
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, self.bytes(p, n));
      },
      tex_parameter: function (p, v) { g().texParameteri(g().TEXTURE_2D, p, v); },
      pixel_store: function (p, v) { g().pixelStorei(p, v); },
      bind_framebuffer: function (f) { g().bindFramebuffer(g().FRAMEBUFFER, self.get(f)); },
      viewport: function (x, y, w, h) { g().viewport(x, y, w, h); },
      scissor: function (x, y, w, h) { g().scissor(x, y, w, h); },
      enable: function (c) { g().enable(c); },
      disable: function (c) { g().disable(c); },
      blend_func: function (s, d) { g().blendFunc(s, d); },
      clear_color: function (r, gg, b, a) { g().clearColor(r, gg, b, a); },
      clear_depth: function (d) { g().clearDepth(d); },
      clear_stencil: function (s) { g().clearStencil(s); },
      clear: function (m) { g().clear(m); },
      color_mask: function (on) { g().colorMask(!!on, !!on, !!on, !!on); },
      depth_mask: function (on) { g().depthMask(!!on); },
      depth_func: function (f) { g().depthFunc(f); },
      stencil_func: function (f, r, m) { g().stencilFunc(f, r, m); },
      stencil_op: function (a, b, c) { g().stencilOp(a, b, c); },
      stencil_op_separate: function (face, a, b, c) { g().stencilOpSeparate(face, a, b, c); },
      stencil_mask: function (m) { g().stencilMask(m); },
      get_error: function () { return g().getError(); }
    };
  };

  GlHost.prototype.font = function (fam, weight, italic, size) {
    var f = fam && fam !== "Noto Sans" ? (fam.indexOf(",") >= 0 ? fam + ", sans-serif" : '"' + fam.replace(/"/g, "") + '", Fredoka, sans-serif') : "Fredoka, sans-serif";
    return (italic ? "italic " : "") + (weight ? weight + " " : "") + size + "px " + f;
  };

  // the "rghost" import module: crates/rg_web/src/glabi.rs
  GlHost.prototype.hostImports = function () {
    var self = this;
    return {
      // uploads into the bound texture: w << 16 | h, -1 not loaded yet, -2 not a picture
      image: function (p, n) {
        var src = self.str(p, n), host = self.host;
        var img = host.images.get(src);
        if (!img) {
          if (host.imageState && host.imageState[src] === "error") return -2;
          if (!host.imageState || !host.imageState[src]) host.image(src);
          return -1;
        }
        var gl = self.gl;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        return ((w & 0x7fff) << 16) | (h & 0xffff);
      },
      text_measure: function (tp, tn, fp, fl, wp, wn, italic, size, spacing, out) {
        var ctx = self.textCtx;
        ctx.font = self.font(self.str(fp, fl), self.str(wp, wn), italic, size);
        if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
        var m = ctx.measureText(self.str(tp, tn));
        var o = new Float32Array(self.memory.buffer, out >>> 0, 3);
        var asc = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : size * 0.93;
        var desc = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : size * 0.23;
        o[0] = m.width; o[1] = -asc; o[2] = desc;
        return 1;
      },
      text_draw: function (tp, tn, fp, fl, wp, wn, italic, size, spacing, r, g, b, pad, x, y, w, h) {
        var c = self.textCanvas, ctx = self.textCtx;
        if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.font = self.font(self.str(fp, fl), self.str(wp, wn), italic, size);
        if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
        var text = self.str(tp, tn);
        var m = ctx.measureText(text);
        var asc = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : size * 0.93;
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, pad, pad + asc);
        var gl = self.gl;
        var px = ctx.getImageData(0, 0, w, h);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        return 1;
      },
      // painter.js's globes into a 2D canvas the size of their box, uploaded as a texture
      globes: function (from, to, px, out) {
        var host = self.host;
        // (the engine is busy painting: its stream's place was kept before)
        var nums = new Float32Array(self.memory.buffer, host.frameDraw[0], host.frameDraw[1]);
        var strings = host.frameStrings || [];
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var i = from; i < to; i += 23 + (nums[i + 22] | 0)) {
          if (nums[i + 3] <= 0 || nums[i + 4] <= 0) continue;
          x0 = Math.min(x0, nums[i + 1]); y0 = Math.min(y0, nums[i + 2]);
          x1 = Math.max(x1, nums[i + 1] + nums[i + 3]); y1 = Math.max(y1, nums[i + 2] + nums[i + 4]);
        }
        var v = host.view;
        // the game's area only
        x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, v.w); y1 = Math.min(y1, v.h);
        if (!(x1 > x0 && y1 > y0)) return 0;
        var cw = Math.max(1, Math.ceil((x1 - x0) * px)), ch = Math.max(1, Math.ceil((y1 - y0) * px));
        var c = self.globeCanvas;
        if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
        if (!self.globePainter) self.globePainter = new RgPainter(c, host.images);
        var sub = nums.slice(from, to);
        var dpr = host.dpr;
        self.globePainter.paint(sub, strings, { scale: v.scale, x: -x0 * v.scale, y: -y0 * v.scale, w: v.w, h: v.h }, dpr, null);
        var gl = self.gl;
        if (!self.globeTex) self.globeTex = self.put(gl.createTexture());
        gl.bindTexture(gl.TEXTURE_2D, self.get(self.globeTex));
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var o = new Float32Array(self.memory.buffer, out >>> 0, 8);
        o[0] = self.globeTex; o[1] = x0; o[2] = y0; o[3] = cw / px; o[4] = ch / px; o[5] = 1; o[6] = 1; o[7] = 0;
        return 1;
      }
    };
  };

  global.RgGlHost = GlHost;
})(window);
