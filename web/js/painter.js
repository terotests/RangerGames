// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Paints the engine's draw stream (crates/rg_engine/src/draw.rs) on a 2D
// canvas: EVG's display list, read as numbers, without JSON. The layout and
// every position is EVG's; this file only fills, strokes and writes text.
(function (global) {
  "use strict";
  var HEADER = 23;
  var KIND = { RECT: 0, BORDER: 1, IMAGE: 2, TEXT: 3, PUSH_CLIP: 4, POP_CLIP: 5, PATH: 6, STROKE: 7 };
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
          // EVG placed the run by its own font metrics: keep the run's centre
          var tw = this.textWidth(font, text);
          var dx = w > 0 ? (w - tw) / 2 : 0;
          ctx.fillText(text, x + dx, y + h / 2 + t * 0.04);
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
})(window);
