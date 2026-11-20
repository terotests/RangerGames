// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Paints the engine's draw stream (crates/rg_engine/src/draw.rs) on a 2D
// canvas: EVG's display list, read as numbers, without JSON. The layout and
// every position is EVG's; this file only fills, strokes and writes text.
(function (global) {
  "use strict";
  var HEADER = 23;
  var KIND = { RECT: 0, BORDER: 1, IMAGE: 2, TEXT: 3, PUSH_CLIP: 4, POP_CLIP: 5, PATH: 6, STROKE: 7, SPHERE: 8 };
  // EVG measures with Noto Sans; the page draws with its own default stack
  var DEFAULT_FONT = '"Fredoka", "Nunito", "Noto Sans", "Trebuchet MS", sans-serif';

  function rgba(r, g, b, a) {
    return a >= 1 ? "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")"
      : "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a + ")";
  }

  function roundRect(ctx, x, y, w, h, tl, tr, br, bl) {
    var lim = Math.min(w, h) / 2;
    tl = Math.max(0, Math.min(tl, lim)); tr = Math.max(0, Math.min(tr, lim));
    br = Math.max(0, Math.min(br, lim)); bl = Math.max(0, Math.min(bl, lim));
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  function family(name) {
    if (!name || name === "Noto Sans") return DEFAULT_FONT;
    return name.indexOf(",") >= 0 ? name + ", sans-serif" : '"' + name.replace(/"/g, "") + '", ' + DEFAULT_FONT;
  }

  // Textured globes (draw kind 8, crates/rg_engine/src/draw.rs `sphere`): a
  // WebGL2 canvas off the page casts a ray through every pixel of the box,
  // reads the map picture where it meets the ball and is then drawn into the
  // 2D canvas, so the globe keeps its place in the painter's order.
  var SPHERE_VS = "#version 300 es\nin vec2 a; out vec2 uv; void main() { uv = a; gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }";
  var SPHERE_FS = "#version 300 es\nprecision highp float; in vec2 uv; out vec4 o;" +
    "uniform sampler2D tex; uniform vec3 eye, rgt, upv, fwd, sun; uniform vec4 box, win; uniform vec2 view; uniform float focal, night, lit, useWin;" +
    "void main() {" +
    "  vec2 px = box.xy + uv * box.zw;" +
    "  vec3 d = normalize(fwd * focal + rgt * (px.x - view.x * 0.5) - upv * (px.y - view.y * 0.5));" +
    "  float b = dot(eye, d); vec3 q = eye - b * d; float disc = 1.0 - dot(q, q);" +
    "  if (disc < 0.0 || -b < sqrt(disc)) discard;" +
    "  vec3 p = normalize(q - sqrt(disc) * d);" +
    "  float u = atan(p.y, p.x) / 6.2831853 + 0.5; float v = 0.5 - asin(clamp(p.z, -1.0, 1.0)) / 3.1415927;" +
    // the seam at longitude 180: take the derivatives of the u that does not jump there
    "  float u2 = fract(u + 0.5) - 0.5; vec2 du = vec2(dFdx(u), dFdy(u)); vec2 du2 = vec2(dFdx(u2), dFdy(u2));" +
    "  if (dot(du2, du2) < dot(du, du)) du = du2;" +
    "  vec2 dv = vec2(dFdx(v), dFdy(v));" +
    // a detail picture: only inside its window, the window stretched over the picture
    "  if (useWin > 0.5) {" +
    "    float uw = u; if (uw < win.x) uw += 1.0; else if (uw > win.z) uw -= 1.0;" +
    "    if (uw < win.x || uw > win.z || v < win.y || v > win.w) discard;" +
    "    vec2 k = 1.0 / (win.zw - win.xy); u = (uw - win.x) * k.x; v = (v - win.y) * k.y; du *= k.x; dv *= k.y;" +
    "  }" +
    "  vec3 c = textureGrad(tex, vec2(u, v), vec2(du.x, dv.x), vec2(du.y, dv.y)).rgb;" +
    "  if (lit > 0.5) { float s = dot(p, sun); c *= mix(1.0 - night, 1.0, smoothstep(-0.06, 0.3, s)) * (0.8 + 0.2 * max(s, 0.0)); }" +
    "  o = vec4(c, 1.0);" +
    "}";

  function Spheres() {
    this.ok = false;
    this.textures = new Map();
    var c = typeof document !== "undefined" ? document.createElement("canvas") : null;
    var gl = null;
    try { gl = c && c.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return;
    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, SPHERE_VS], [gl.FRAGMENT_SHADER, SPHERE_FS]].forEach(function (x) {
      var sh = gl.createShader(x[0]);
      gl.shaderSource(sh, x[1]);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("sphere shader: " + gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.canvas = c;
    this.gl = gl;
    this.prog = prog;
    this.u = {};
    var self = this;
    ["tex", "eye", "rgt", "upv", "fwd", "sun", "box", "view", "focal", "night", "lit", "win", "useWin"].forEach(function (n) { self.u[n] = gl.getUniformLocation(prog, n); });
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.ok = true;
  }

  Spheres.prototype.texture = function (src, img, clamp) {
    var t = this.textures.get(src);
    if (t) return t;
    var gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.set(src, t);
    return t;
  };

  // draws one sphere command into ctx (which has the game's transform);
  // p: the 20 extra numbers (24 with a detail window); px: device pixels per game unit
  Spheres.prototype.draw = function (ctx, img, src, x, y, w, h, p, px) {
    var gl = this.gl, c = this.canvas;
    var cw = Math.max(1, Math.min(4096, Math.round(w * px))), ch = Math.max(1, Math.min(4096, Math.round(h * px)));
    if (c.width < cw || c.height < ch || c.width > cw * 2 + 256 || c.height > ch * 2 + 256) { c.width = cw; c.height = ch; }
    gl.viewport(0, c.height - ch, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    var w4 = p.length >= 24;
    gl.bindTexture(gl.TEXTURE_2D, this.texture(src, img, w4));
    var u = this.u;
    gl.uniform1i(u.tex, 0);
    gl.uniform3f(u.eye, p[0], p[1], p[2]);
    gl.uniform3f(u.rgt, p[3], p[4], p[5]);
    gl.uniform3f(u.upv, p[6], p[7], p[8]);
    gl.uniform3f(u.fwd, p[9], p[10], p[11]);
    gl.uniform3f(u.sun, p[12], p[13], p[14]);
    gl.uniform1f(u.focal, p[15]);
    gl.uniform2f(u.view, p[16], p[17]);
    gl.uniform1f(u.night, p[18]);
    gl.uniform1f(u.lit, p[19]);
    gl.uniform1f(u.useWin, w4 ? 1 : 0);
    gl.uniform4f(u.win, w4 ? p[20] : 0, w4 ? p[21] : 0, w4 ? p[22] : 1, w4 ? p[23] : 1);
    gl.uniform4f(u.box, x, y, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    ctx.drawImage(c, 0, 0, cw, ch, x, y, w, h);
  };

  var spheres = null;
  // whether this browser can draw textured globes (the host tells the engine)
  function canDrawSpheres() {
    if (!spheres) spheres = new Spheres();
    return spheres.ok;
  }

  function Painter(canvas, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.images = images;
    this.widthCache = {};
    this.widthCacheSize = 0;
  }

  Painter.prototype.textWidth = function (font, text) {
    var key = font + "\u0001" + text;
    var w = this.widthCache[key];
    if (w === undefined) {
      if (this.widthCacheSize > 4000) { this.widthCache = {}; this.widthCacheSize = 0; }
      w = this.ctx.measureText(text).width;
      this.widthCache[key] = w;
      this.widthCacheSize++;
    }
    return w;
  };

  // nums: Float32Array of the stream; strings: the table
  Painter.prototype.paint = function (nums, strings, view, dpr, clear) {
    var ctx = this.ctx;
    var scale = view.scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clear === null) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    else { ctx.fillStyle = clear; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    ctx.setTransform(scale, 0, 0, scale, view.x * dpr, view.y * dpr);
    // the game's area clips everything (a letterboxed game stays in its box)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    ctx.clip();
    var clips = 0;
    var i = 0, n = nums.length;
    while (i < n) {
      var k = nums[i], x = nums[i + 1], y = nums[i + 2], w = nums[i + 3], h = nums[i + 4];
      var r = nums[i + 5], g = nums[i + 6], b = nums[i + 7], a = nums[i + 8];
      var tl = nums[i + 9], tr = nums[i + 10], br = nums[i + 11], bl = nums[i + 12];
      var t = nums[i + 13], rot = nums[i + 14], rox = nums[i + 15], roy = nums[i + 16];
      var flags = nums[i + 17] | 0;
      var s0 = nums[i + 18], s1 = nums[i + 19], s2 = nums[i + 20], ls = nums[i + 21];
      var nx = nums[i + 22] | 0;
      var e = i + HEADER;
      i = e + nx;
      // the extras
      var grad = null, shadow = null, crop = null, tile = null, ptsAt = -1;
      if (flags & 1) { grad = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3]]; e += 4; }
      if (flags & 4) { shadow = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3], nums[e + 4], nums[e + 5], nums[e + 6]]; e += 7; }
      if (flags & 64) { crop = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3]]; e += 4; }
      if (flags & 1024) { tile = [nums[e], nums[e + 1], nums[e + 2], nums[e + 3]]; e += 4; }
      if (k === KIND.PATH || k === KIND.STROKE) ptsAt = e;

      if (k === KIND.SPHERE) {
        var simg = s0 >= 0 ? this.images.get(strings[s0]) : null;
        if (simg && nx >= 20 && w > 0 && h > 0 && canDrawSpheres()) {
          spheres.draw(ctx, simg, strings[s0], x, y, w, h, nums.subarray(e, e + (nx >= 24 ? 24 : 20)), scale);
        }
        continue;
      }
      if (k === KIND.PUSH_CLIP) {
        ctx.save(); clips++;
        ctx.beginPath(); ctx.rect(x, y, Math.max(0, w), Math.max(0, h)); ctx.clip();
        continue;
      }
      if (k === KIND.POP_CLIP) {
        if (clips > 0) { ctx.restore(); clips--; }
        continue;
      }
      if (a <= 0 && !(flags & 1) && k !== KIND.IMAGE) continue;
      var rotated = rot !== 0;
      if (rotated) {
        var cx = (flags & 128) ? rox : x + w / 2;
        var cy = (flags & 128) ? roy : y + h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }
      if (k === KIND.RECT) {
        if (w > 0 && h > 0) {
          var fill = rgba(r, g, b, a);
          if (grad) {
            var lg = (flags & 2) ? ctx.createLinearGradient(x, y, x + w, y) : ctx.createLinearGradient(x, y, x, y + h);
            lg.addColorStop(0, fill);
            lg.addColorStop(1, rgba(grad[0], grad[1], grad[2], grad[3]));
            fill = lg;
          }
          if (shadow) {
            ctx.save();
            ctx.shadowColor = rgba(shadow[3], shadow[4], shadow[5], shadow[6]);
            ctx.shadowBlur = shadow[2] * scale;
            ctx.shadowOffsetX = shadow[0] * scale;
            ctx.shadowOffsetY = shadow[1] * scale;
          }
          ctx.fillStyle = fill;
          if (tl || tr || br || bl) { roundRect(ctx, x, y, w, h, tl, tr, br, bl); ctx.fill(); }
          else ctx.fillRect(x, y, w, h);
          if (shadow) ctx.restore();
        }
      } else if (k === KIND.BORDER) {
        var bt = t || 1;
        if (w > bt && h > bt) {
          ctx.strokeStyle = rgba(r, g, b, a);
          ctx.lineWidth = bt;
          roundRect(ctx, x + bt / 2, y + bt / 2, w - bt, h - bt,
            Math.max(0, tl - bt / 2), Math.max(0, tr - bt / 2), Math.max(0, br - bt / 2), Math.max(0, bl - bt / 2));
          ctx.stroke();
        }
      } else if (k === KIND.IMAGE) {
        var src = s0 >= 0 ? strings[s0] : "";
        var img = src ? this.images.get(src) : null;
        if (img && w > 0 && h > 0) {
          ctx.save();
          if (tl || tr || br || bl) { roundRect(ctx, x, y, w, h, tl, tr, br, bl); ctx.clip(); }
          if (flags & (8 | 16)) {
            ctx.translate(x + w / 2, y + h / 2);
            ctx.scale((flags & 8) ? -1 : 1, (flags & 16) ? -1 : 1);
            ctx.translate(-(x + w / 2), -(y + h / 2));
          }
          var iw = img.width, ih = img.height;
          if (tile) {
            for (var ty = tile[1]; ty < y + h; ty += tile[3]) for (var tx = tile[0]; tx < x + w; tx += tile[2]) ctx.drawImage(img, tx, ty, tile[2], tile[3]);
          } else if (crop) {
            ctx.drawImage(img, crop[0] * iw, crop[1] * ih, (crop[2] - crop[0]) * iw, (crop[3] - crop[1]) * ih, x, y, w, h);
          } else {
            // object-fit: cover, as EVG's other painters do
            var sc = Math.max(w / iw, h / ih), sw = w / sc, sh = h / sc;
            ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
          }
          ctx.restore();
        }
      } else if (k === KIND.TEXT) {
        var text = s0 >= 0 ? strings[s0] : "";
        if (text) {
          var weight = s2 >= 0 ? strings[s2] : "";
          var font = ((flags & 256) ? "italic " : "") + (weight ? weight + " " : "") + t + "px " + family(s1 >= 0 ? strings[s1] : "");
          ctx.font = font;
          ctx.fillStyle = rgba(r, g, b, a);
          ctx.textBaseline = "middle";
          // EVG measured the run with Noto Sans and placed it by that width;
          // the page's font is a little wider or narrower. Fit the run to its
          // width so left-aligned lines start where EVG put them (a centred
          // run left ragged edges); a big difference keeps the run's centre
          var tw = this.textWidth(font, text);
          var sx = w > 0 && tw > 0 ? w / tw : 1;
          var ty = y + h / 2 + t * 0.04;
          if (sx >= 0.8 && sx <= 1.25 && sx !== 1) {
            ctx.save();
            ctx.translate(x, ty);
            ctx.scale(sx, 1);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(text, x + (w > 0 ? (w - tw) / 2 : 0), ty);
          }
        }
      } else if (ptsAt >= 0 && nx > 0) {
        var np = nums[ptsAt] | 0;
        var pts = ptsAt + 1;
        var ne = nums[pts + np] | 0;
        var ends = pts + np + 1;
        ctx.beginPath();
        var at = 0;
        for (var ri = 0; ri < ne; ri++) {
          var end = nums[ends + ri] | 0;
          if (end - at >= 4) {
            ctx.moveTo(nums[pts + at], nums[pts + at + 1]);
            for (var pi = at + 2; pi + 1 < end; pi += 2) ctx.lineTo(nums[pts + pi], nums[pts + pi + 1]);
            if (k === KIND.PATH) ctx.closePath();
          }
          at = end;
        }
        if (k === KIND.PATH) {
          ctx.fillStyle = rgba(r, g, b, a);
          ctx.fill((flags & 32) ? "evenodd" : "nonzero");
        } else {
          ctx.strokeStyle = rgba(r, g, b, a);
          ctx.lineWidth = t || 1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }
      if (rotated) ctx.restore();
    }
    while (clips > 0) { ctx.restore(); clips--; }
    ctx.restore();
  };

  global.RgPainter = Painter;
  global.RgPainter.canDrawSpheres = canDrawSpheres;
  // sphere commands with a detail window (24 numbers) are understood
  global.RgPainter.canDrawDetail = canDrawSpheres;
})(window);
