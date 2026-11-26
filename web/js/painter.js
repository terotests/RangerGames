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
  var SPHERE_VS = "#version 300 es\nin vec2 a; out vec2 uv; out vec3 wpos; void main() { uv = a; wpos = vec3(0.0); gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }";
  // The globe shader is shaders/globe/globe.fs (assembled by rg_shader, the same source the
  // Android app uses); RG_DEPTH: the ray's length is the depth (the web's detail windows).

  function Spheres() {
    this.ok = false;
    this.textures = new Map();
    var c = typeof document !== "undefined" ? document.createElement("canvas") : null;
    var gl = null;
    try { gl = c && c.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return;
    var fsrc = shaderSource ? shaderSource("globe/globe.fs", "RG_DEPTH=1") : null;
    if (!fsrc) return;
    this.canvas = c;
    this.gl = gl;
    var base = this.link(fsrc, function (why) { console.warn("sphere shader: " + why); });
    if (!base) return;
    this.base = base;
    this.prog = base.prog;
    this.u = base.u;
    this.games = {};
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ok = true;
  }

  var SPHERE_U = ["tex", "ltex", "eye", "rgt", "upv", "fwd", "sun", "airc", "box", "view", "focal", "night", "lit", "win", "useWin", "air", "lgain", "useL", "relief", "htex", "gtex", "useH", "hlo", "hhi", "hamp", "nearM", "hrel", "hfreq", "crat", "mapAz", "mapK", "useHole", "hole", "dtex", "useD", "rctex", "ratex", "useR", "rIn", "rOut", "flowA", "flowPh", "vinfo", "vtx", "vamp", "hot", "hotk", "star", "spots", "eyeL", "eyeK", "dust", "glint", "seaG", "scat", "smie", "rg_time"];
  // a globe stage's program ({ prog, u: its uniforms' locations }), or null (why(log) told)
  Spheres.prototype.link = function (fsrc, why) {
    var gl = this.gl, prog = gl.createProgram(), ok = true;
    [[gl.VERTEX_SHADER, SPHERE_VS], [gl.FRAGMENT_SHADER, fsrc]].forEach(function (x) {
      var sh = gl.createShader(x[0]);
      gl.shaderSource(sh, x[1]);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { ok = false; why(gl.getShaderInfoLog(sh) || ""); }
      gl.attachShader(prog, sh);
    });
    if (!ok) return null;
    gl.bindAttribLocation(prog, 0, "a");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { why(gl.getProgramInfoLog(prog) || "link"); return null; }
    var u = {};
    SPHERE_U.forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
    return { prog: prog, u: u };
  };
  // a game's surface shader (rg.shader kind "surface") built once by key; null when it does not compile
  // (told in the game's log, and the engine's own look is drawn)
  Spheres.prototype.game = function (key) {
    if (key in this.games) return this.games[key];
    var path = "game:" + key, fs = shaderSource ? shaderSource(path, "RG_DEPTH=1") : null;
    var g = fs ? this.link(fs, function (why) { console.warn(shaderExplain ? shaderExplain(path, "RG_DEPTH=1", why) : why); }) : null;
    var name = key.split("#")[0];
    for (var k in this.games) if (k.split("#")[0] === name) { if (this.games[k]) this.gl.deleteProgram(this.games[k].prog); delete this.games[k]; }
    this.games[key] = g;
    return g;
  };

  Spheres.prototype.texture = function (src, img, clamp, flat) {
    var t = this.textures.get(src);
    if (t) return t;
    var gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    // flat: no smaller levels (the ground's shape is read bilinearly, as the game reads it)
    if (!flat) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, flat ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.set(src, t);
    return t;
  };

  // draws one sphere command into ctx (which has the game's transform);
  // p: the 20 extra numbers (24 with a detail window); px: device pixels per game unit
  // hs: the height pictures [shading, shape] and their names, when loaded; [4], [5]: a detail window's own
  // heights and their name, when it has them
  // the windows that have their own heights are drawn together into one picture (begin, draw…, end), each
  // into its part of it, with the rays' lengths as depth: where one window's ground hides another's, the
  // nearer shows (drawn one by one, the later one covered the other, or the seams had holes)
  Spheres.prototype.begin = function (x, y, w, h, px) {
    var gl = this.gl, c = this.canvas, k = px * 0.6;
    var cw = Math.max(1, Math.min(4096, Math.round(w * k))), ch = Math.max(1, Math.min(4096, Math.round(h * k)));
    if (c.width < cw || c.height < ch || c.width > cw * 2 + 256 || c.height > ch * 2 + 256) { c.width = cw; c.height = ch; }
    gl.viewport(0, c.height - ch, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    this.group = { x: x, y: y, w: w, h: h, k: cw / w, cw: cw, ch: ch };
  };
  Spheres.prototype.end = function (ctx) {
    var g = this.group;
    this.group = null;
    this.gl.disable(this.gl.DEPTH_TEST);
    ctx.drawImage(this.canvas, 0, 0, g.cw, g.ch, g.x, g.y, g.w, g.h);
  };

  // rs: the rings' pictures [colour, opacity, their names] (44 numbers), when loaded
  // key, unis, time: a game's surface shader (draw.rs spheres_shader), its uniforms and the planet's time
  Spheres.prototype.draw = function (ctx, img, src, x, y, w, h, p, px, limg, lsrc, hs, rs, key, unis, time) {
    var gl = this.gl, c = this.canvas, gr = this.group;
    var pg = (key && this.game(key)) || this.base;
    this.prog = pg.prog;
    this.u = pg.u;
    // close over real ground every pixel casts a long ray: fewer of them, drawn bigger
    var ks = p.length >= 40 && hs && p[35] > 0.5 ? 0.6 : 1;
    var cw = Math.max(1, Math.min(4096, Math.round(w * px * ks))), ch = Math.max(1, Math.min(4096, Math.round(h * px * ks)));
    if (gr) {
      // its part of the group's picture, in whole pixels; the box the pixels cover, so the rays meet
      var vx = Math.round((x - gr.x) * gr.k), vy = Math.round((y - gr.y) * gr.k);
      cw = Math.max(1, Math.round((x + w - gr.x) * gr.k) - vx); ch = Math.max(1, Math.round((y + h - gr.y) * gr.k) - vy);
      gl.viewport(vx, c.height - vy - ch, cw, ch);
      x = gr.x + vx / gr.k; y = gr.y + vy / gr.k; w = cw / gr.k; h = ch / gr.k;
    } else {
      if (c.width < cw || c.height < ch || c.width > cw * 2 + 256 || c.height > ch * 2 + 256) { c.width = cw; c.height = ch; }
      gl.viewport(0, c.height - ch, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.prog);
    if (pg !== this.base) { gl.uniform1f(pg.u.rg_time, time || 0); setUniforms(gl, pg.prog, unis); }
    gl.activeTexture(gl.TEXTURE0);
    var w32 = p.length >= 32;
    var w4 = w32 ? p[24] > 0.5 : p.length >= 24;
    gl.bindTexture(gl.TEXTURE_2D, this.texture(src, img, w4));
    var u = this.u;
    gl.uniform1i(u.tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    if (limg) gl.bindTexture(gl.TEXTURE_2D, this.texture(lsrc, limg, false));
    gl.uniform1i(u.ltex, 1);
    gl.uniform1f(u.useL, limg ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.air, w32 ? p[25] : 0);
    gl.uniform3f(u.airc, w32 ? p[26] : 0, w32 ? p[27] : 0, w32 ? p[28] : 0);
    gl.uniform1f(u.lgain, w32 ? p[29] : 0);
    gl.uniform1f(u.relief, w32 ? p[30] : 0);
    var w40 = p.length >= 40 && hs;
    gl.activeTexture(gl.TEXTURE2);
    if (w40) gl.bindTexture(gl.TEXTURE_2D, this.texture(hs[2], hs[0], false));
    gl.uniform1i(u.htex, 2);
    gl.activeTexture(gl.TEXTURE3);
    if (w40) gl.bindTexture(gl.TEXTURE_2D, this.texture(hs[3], hs[1], false, true));
    gl.uniform1i(u.gtex, 3);
    var wd = w40 && w4 && hs.length > 4;
    gl.activeTexture(gl.TEXTURE4);
    if (wd) gl.bindTexture(gl.TEXTURE_2D, this.texture(hs[5], hs[4], true));
    gl.uniform1i(u.dtex, 4);
    gl.uniform1f(u.useD, wd ? 1 : 0);
    var wr = p.length >= 44 && p[42] > 0.5 && rs;
    gl.activeTexture(gl.TEXTURE5);
    if (wr) gl.bindTexture(gl.TEXTURE_2D, this.texture(rs[2], rs[0], true, false));
    gl.uniform1i(u.rctex, 5);
    gl.activeTexture(gl.TEXTURE6);
    if (wr) gl.bindTexture(gl.TEXTURE_2D, this.texture(rs[3], rs[1], true, false));
    gl.uniform1i(u.ratex, 6);
    gl.uniform1f(u.useR, wr ? 1 : 0);
    gl.uniform1f(u.rIn, wr ? p[40] : 0);
    gl.uniform1f(u.rOut, wr ? p[41] : 1);
    var wf = p.length >= 48 && !w4;
    gl.uniform1f(u.flowA, wf ? p[44] : 0);
    gl.uniform1f(u.flowPh, wf ? p[45] : 0);
    // the clouds morphing and their storms (72 numbers)
    var wv = p.length >= 72 && !w4;
    gl.uniform4f(u.vinfo, wv ? p[48] : 0, wv ? p[49] : 0, wv ? p[50] : 0, wv ? p[51] : 0);
    if (wv) {
      var vt = new Float32Array(16), va = new Float32Array(4);
      for (var vi = 0; vi < 4; vi++) { for (var vj = 0; vj < 4; vj++) vt[vi * 4 + vj] = p[52 + vi * 5 + vj]; va[vi] = p[56 + vi * 5]; }
      gl.uniform4fv(u.vtx, vt);
      gl.uniform1fv(u.vamp, va);
    }
    // the hot cap (124 numbers)
    var wh = p.length >= 80 && !w4;
    gl.uniform4f(u.hot, wh ? p[72] : 0, wh ? p[73] : 0, wh ? p[74] : 1, wh ? p[75] : 0);
    gl.uniform2f(u.hotk, wh ? p[76] : 0, wh ? p[77] : 0);
    // a star's surface (116 numbers)
    var ws = p.length >= 116 && !w4;
    gl.uniform4f(u.star, ws ? p[80] : 0, ws ? p[81] : 0, ws ? p[82] : 0, ws ? p[83] : 0);
    if (ws) gl.uniform4fv(u.spots, new Float32Array(Array.prototype.slice.call(p, 84, 116)));
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.useH, w40 ? 1 : 0);
    gl.uniform1f(u.hlo, w40 ? p[32] : 0);
    gl.uniform1f(u.hhi, w40 ? p[33] : 0);
    gl.uniform1f(u.hamp, w40 ? p[34] : 0);
    gl.uniform1f(u.nearM, w40 ? p[35] : 0);
    gl.uniform1f(u.hrel, w40 ? p[36] : 0);
    gl.uniform1f(u.hfreq, w40 ? p[37] : 1);
    gl.uniform1f(u.crat, w40 ? p[38] : 0);
    gl.uniform1f(u.mapAz, w40 && w4 ? p[31] : 0);
    gl.uniform1f(u.mapK, w40 && w4 ? p[39] : 0);
    var ho = w40 && !w4 && p[35] > 0.5 && (p[20] !== 0 || p[21] !== 0 || p[22] !== 1 || p[23] !== 1);
    gl.uniform1f(u.useHole, ho ? 1 : 0);
    gl.uniform4f(u.hole, ho ? p[20] : 0, ho ? p[21] : 0, ho ? p[22] : 0, ho ? p[23] : 0);
    gl.uniform3f(u.eye, p[0], p[1], p[2]);
    // the eye's remainder and the light that changes with the eye (124 numbers), |eye|² - 1 here in 64 bits
    var w124 = p.length >= 124;
    gl.uniform3f(u.eyeL, w124 ? p[116] : 0, w124 ? p[117] : 0, w124 ? p[118] : 0);
    gl.uniform1f(u.eyeK, p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - 1);
    gl.uniform1f(u.dust, w124 ? p[120] : 0);
    gl.uniform1f(u.glint, w124 ? p[121] : 0);
    gl.uniform1f(u.seaG, w124 ? p[122] : 0);
    // the air lit after O'Neil (shaders/lib/scatter.glsl): the sun's strength (0: the glow) and the dust
    gl.uniform1f(u.scat, w124 ? p[119] : 0);
    gl.uniform1f(u.smie, w124 ? p[123] : 1);
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
    if (!gr) ctx.drawImage(c, 0, 0, cw, ch, x, y, w, h);
  };

  var spheres = null;
  // whether this browser can draw textured globes (the host tells the engine)
  function canDrawSpheres() {
    if (!spheres) spheres = new Spheres();
    return spheres.ok;
  }

  // Liquid splats (draw.rs `splats`, kind 10): a baked particle run. Each splat adds a soft round
  // weight into a density picture (red: weight, green: weight × temperature), half the canvas's
  // pixels; then where the density is thick enough it shows as a liquid surface: the mean
  // temperature picks the colour, the density's slope makes a normal that the light shades and
  // glints off, and the thin edge fades out. Drawn into a picture of its own, then into the canvas.
  // The shaders come from the engine (shaders/splat/*.vs, *.fs in the repository, assembled by
  // rg_shader; host.js sets shaderSource), the same source the Android app uses. RG_YS 1: the
  // density picture's v runs with the screen's up here (the phone's runs against it).
  var shaderSource = null, shaderExplain = null;
  function splatSrc(path) {
    var s = shaderSource ? shaderSource(path, "RG_YS=1.0") : null;
    if (!s) throw new Error("shader " + path + " missing");
    return s;
  }

  function Splats() {
    this.ok = false;
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) return;
      this.canvas = c; this.gl = gl;
      this.f16 = !!gl.getExtension("EXT_color_buffer_float");
      var mk = function (vs, fs) {
        var p = gl.createProgram();
        [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (x) {
          var sh = gl.createShader(x[0]); gl.shaderSource(sh, x[1]); gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("splat shader: " + gl.getShaderInfoLog(sh));
          gl.attachShader(p, sh);
        });
        gl.linkProgram(p);
        return p;
      };
      this.add = mk(splatSrc("splat/splat.vs"), splatSrc("splat/splat.fs"));
      this.show = mk(splatSrc("splat/show.vs"), splatSrc("splat/show.fs"));
      this.gas = mk(splatSrc("splat/show.vs"), splatSrc("splat/gas.fs"));
      this.sprite = mk(splatSrc("splat/sprite.vs"), splatSrc("splat/sprite.fs"));
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.inst = gl.createBuffer();
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
      this.den = gl.createTexture(); this.fbo = gl.createFramebuffer(); this.dw = 0; this.dh = 0;
      this.pal = gl.createTexture();
      this.ok = true;
    } catch (e) { this.ok = false; }
  }

  // ex: the extras (palette, light, splats); w, h: the box in game units; px: device pixels a unit;
  // res: the density's pixels a pixel; gas: more than 0 for see-through gas (its density a splat)
  // A game's liquid shader (rg.shader, draw.rs splats_shader): the stage "game:<key>" compiled
  // once; null (and the error in the game's log, in its own lines) when it does not compile,
  // and the engine's own look is drawn instead.
  // vs: the vertex stage (show.vs for a liquid, sprite.vs for glowing sprites)
  Splats.prototype.gameProgram = function (key, vs) {
    if (!this.games) this.games = {};
    if (key in this.games) return this.games[key];
    var gl = this.gl, path = "game:" + key, prog = null;
    var fs = shaderSource ? shaderSource(path, "RG_YS=1.0") : null;
    if (fs) {
      var p = gl.createProgram(), ok = true;
      [[gl.VERTEX_SHADER, splatSrc(vs || "splat/show.vs")], [gl.FRAGMENT_SHADER, fs]].forEach(function (x) {
        var sh = gl.createShader(x[0]); gl.shaderSource(sh, x[1]); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          ok = false;
          var why = gl.getShaderInfoLog(sh) || "";
          console.warn(shaderExplain ? shaderExplain(path, "RG_YS=1.0", why) : why);
        }
        gl.attachShader(p, sh);
      });
      if (ok) {
        gl.linkProgram(p);
        if (gl.getProgramParameter(p, gl.LINK_STATUS)) prog = p;
        else console.warn(shaderExplain ? shaderExplain(path, "RG_YS=1.0", gl.getProgramInfoLog(p) || "link") : "link");
      }
    }
    // a changed file comes with a new key: forget the old ones of the same name
    var name = key.split("#")[0];
    for (var k in this.games) if (k.split("#")[0] === name) { if (this.games[k]) gl.deleteProgram(this.games[k]); delete this.games[k]; }
    this.games[key] = prog;
    return prog;
  };

  // uniforms "heat=0.8;tint=1,0.5,0.2" into u_heat, u_tint (1 to 4 floats)
  function setUniforms(gl, prog, text) {
    if (!text) return;
    text.split(";").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i <= 0) return;
      var loc = gl.getUniformLocation(prog, "u_" + kv.slice(0, i));
      if (!loc) return;
      var v = kv.slice(i + 1).split(",").map(Number);
      if (v.length === 1) gl.uniform1f(loc, v[0]);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    });
  }

  // time, key, unis: a game shader's (draw.rs splats_shader: header slot 11, strings 0 and 1)
  // glow: header slot 12 (draw.rs splats_glow): glowing sprites through the sprite() hook
  // the palette (np colours from ex[1]) as a strip in this.pal
  Splats.prototype.palette = function (ex, np) {
    var gl = this.gl, pb = new Uint8Array(np * 4);
    for (var i = 0; i < np; i++) { pb[i * 4] = ex[1 + i * 3] * 255; pb[i * 4 + 1] = ex[2 + i * 3] * 255; pb[i * 4 + 2] = ex[3 + i * 3] * 255; pb[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, np, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pb);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  };
  // glowing sprites (look "glow"): each splat's quad through the sprite() hook straight into the
  // picture, premultiplied (alpha 0: light added, as the burst's sparks)
  Splats.prototype.glow = function (ctx, ex, np, pts, m, w, h, cw, ch, opac, time, key, unis) {
    var gl = this.gl, c = this.canvas;
    this.palette(ex, np);
    var game = key ? this.gameProgram(key, "splat/sprite.vs") : null;
    var sp = game || this.sprite;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(sp);
    gl.uniform1f(gl.getUniformLocation(sp, "rg_time"), time || 0);
    if (game) setUniforms(gl, sp, unis);
    gl.uniform4f(gl.getUniformLocation(sp, "xf"), 2 / w, -2 / h, -1, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(gl.getUniformLocation(sp, "pal"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(gl.getUniformLocation(sp, "npal"), np);
    gl.uniform1f(gl.getUniformLocation(sp, "opac"), opac);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STREAM_DRAW);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    ctx.drawImage(c, 0, 0, cw, ch, 0, 0, w, h);
  };
  Splats.prototype.draw = function (ctx, ex, w, h, px, opac, res, gas, time, key, unis, glow) {
    var gl = this.gl, c = this.canvas;
    var np = ex[0] | 0, at = 1 + np * 3;
    var light = [ex[at], ex[at + 1], ex[at + 2]], m = ex[at + 3] | 0, pts = ex.subarray(at + 4, at + 4 + m * 4);
    var k = px * (res > 0 ? res : 0.5);
    var cw = Math.max(1, Math.min(2048, Math.round(w * k))), ch = Math.max(1, Math.min(2048, Math.round(h * k)));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    if (glow > 0.5) { this.glow(ctx, ex, np, pts, m, w, h, cw, ch, opac, time, key, unis); return; }
    if (this.dw !== cw || this.dh !== ch) {
      gl.bindTexture(gl.TEXTURE_2D, this.den);
      if (this.f16) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, cw, ch, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.den, 0);
      this.dw = cw; this.dh = ch;
    }
    // without float pictures the weights are kept small (8 bits fill up at 1)
    var gain = this.f16 ? 1.0 : 0.25;
    // the palette as a strip
    var pb = new Uint8Array(np * 4);
    for (var i = 0; i < np; i++) { pb[i * 4] = ex[1 + i * 3] * 255; pb[i * 4 + 1] = ex[2 + i * 3] * 255; pb[i * 4 + 2] = ex[3 + i * 3] * 255; pb[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, np, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pb);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // 1: the weights added up
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.add);
    // game units to clip space (y down)
    gl.uniform4f(gl.getUniformLocation(this.add, "xf"), 2 / w, -2 / h, -1, 1);
    gl.uniform1f(gl.getUniformLocation(this.add, "gain"), gain);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STREAM_DRAW);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
    // 2: the surface into the picture
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    var game = gas > 0 || !key ? null : this.gameProgram(key);
    var sp = gas > 0 ? this.gas : (game || this.show);
    gl.useProgram(sp);
    if (game) {
      gl.uniform1f(gl.getUniformLocation(sp, "rg_time"), time || 0);
      setUniforms(gl, sp, unis);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.den);
    gl.uniform1i(gl.getUniformLocation(sp, "den"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(gl.getUniformLocation(sp, "pal"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(gl.getUniformLocation(sp, "texel"), 1 / cw, 1 / ch);
    gl.uniform3f(gl.getUniformLocation(sp, "light"), light[0], light[1], light[2]);
    gl.uniform1f(gl.getUniformLocation(sp, "npal"), np);
    gl.uniform1f(gl.getUniformLocation(sp, "gain"), gain);
    gl.uniform1f(gl.getUniformLocation(sp, "opac"), opac);
    if (gas > 0) gl.uniform1f(gl.getUniformLocation(sp, "kd"), gas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    ctx.drawImage(c, 0, 0, cw, ch, 0, 0, w, h);
  };
  var splats = null;
  function canDrawSplats() {
    if (!splats) splats = new Splats();
    return splats.ok;
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
    if (spheres && spheres.group) { spheres.group = null; spheres.gl.disable(spheres.gl.DEPTH_TEST); }
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
          var limg = s1 >= 0 ? this.images.get(strings[s1]) : null;
          // the height pictures "shading|shape" (string 3), once both are loaded
          var hs = null;
          if (s2 >= 0 && nx >= 40) {
            var hn = strings[s2].split("|"), hi = this.images.get(hn[0]), gi = this.images.get(hn[1]);
            if (hi && gi) hs = [hi, gi, hn[0], hn[1]];
            // "shading|shape|window heights": the window's own heights, once loaded (until then the ball's)
            var di = hs && hn.length > 2 ? this.images.get(hn[2]) : null;
            if (di) hs.push(di, hn[2]);
          }
          var sp = nums.subarray(e, e + (nx >= 124 ? 124 : nx >= 116 ? 116 : nx >= 80 ? 80 : nx >= 72 ? 72 : nx >= 48 ? 48 : nx >= 44 ? 44 : nx >= 40 ? 40 : nx >= 32 ? 32 : nx >= 24 ? 24 : 20));
          // the rings' pictures "colour|opacity" (string 4, slot 21), once both are loaded
          var rs = null;
          if (nx >= 44 && nums[e + 42] > 0.5 && ls >= 0) {
            var rn = strings[ls].split("|"), rci = this.images.get(rn[0]), rai = this.images.get(rn[1] || rn[0]);
            if (rci && rai) rs = [rci, rai, rn[0], rn[1] || rn[0]];
          }
          // a window close by with its own heights: it and the ones right after it are drawn together
          if (!spheres.group && hs && hs.length > 4 && sp[24] > 0.5 && sp[35] > 0.5) {
            var gx0 = x, gy0 = y, gx1 = x + w, gy1 = y + h, gn = 1;
            for (var gi2 = i; gi2 < n; gn++) {
              var gnx = nums[gi2 + 22] | 0, gs2 = nums[gi2 + 20];
              if (nums[gi2] !== KIND.SPHERE || gnx < 40 || nums[gi2 + 17] !== 0 || gs2 < 0 || strings[gs2].split("|").length < 3) break;
              var gp = gi2 + HEADER;
              if (nums[gp + 24] <= 0.5 || nums[gp + 35] <= 0.5) break;
              gx0 = Math.min(gx0, nums[gi2 + 1]); gy0 = Math.min(gy0, nums[gi2 + 2]);
              gx1 = Math.max(gx1, nums[gi2 + 1] + nums[gi2 + 3]); gy1 = Math.max(gy1, nums[gi2 + 2] + nums[gi2 + 4]);
              gi2 = gp + gnx;
            }
            spheres.begin(gx0, gy0, gx1 - gx0, gy1 - gy0, scale);
            spheres.groupLeft = gn;
          }
          // a game's surface shader: slots 9, 10 its key's and uniforms' strings + 1, 11 the planet's time
          spheres.draw(ctx, simg, strings[s0], x, y, w, h, sp, scale, limg, s1 >= 0 ? strings[s1] : "", hs, rs, tl >= 1 ? strings[tl - 1] : "", tr >= 1 ? strings[tr - 1] : "", br);
        }
        // the group's last window drawn (or skipped): the picture into the canvas
        if (spheres && spheres.group && --spheres.groupLeft <= 0) spheres.end(ctx);
        continue;
      }
      if (k === 10) {
        if (nx > 4 && w > 0 && h > 0 && canDrawSplats()) splats.draw(ctx, nums.subarray(e, e + nx), w, h, scale, a, tl, tr, br, s0 >= 0 ? strings[s0] : "", s1 >= 0 ? strings[s1] : "", bl);
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
          if (flags & 2048) ctx.globalCompositeOperation = "lighter";
          ctx.fill((flags & 32) ? "evenodd" : "nonzero");
          if (flags & 2048) ctx.globalCompositeOperation = "source-over";
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
  global.RgPainter.canDrawSplats = canDrawSplats;
  // f(path, defines) -> GLSL source or null: the engine's built-in shaders (host.js, rg_shader)
  // explain(path, defines, log) -> the log in the source's own lines (and into the game's log)
  global.RgPainter.setShaderSource = function (f, explain) { shaderSource = f; shaderExplain = explain || null; };
  // sphere commands with a detail window (24 numbers) are understood
  global.RgPainter.canDrawDetail = canDrawSpheres;
  // and real heights (40 numbers: the ground's shape, made-up bumps)
  global.RgPainter.canDrawTerrain = canDrawSpheres;
})(window);
