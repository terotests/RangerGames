// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The RangerDOM renderer's side in the game's script (only when the host
// chose it, Engine::dom): the script also has a DOM, RangerDOM's webapi.js,
// run before the runtime. Each frame the element tree the runtime made from
// view() ({ t, id?, cls?, a?, s?, c? }, a text child as a string) is put
// into document.body: the elements of the last frame are kept and changed,
// so the page's render tree changes only where the view did. The DOM's own
// CSS cascade styles them (the game's style.css, with the engine's defaults
// first, so a box is a flex column as in EVG), and the backend lays the
// render tree out with EVG (crates/rg_web_dom).
//
//   __rgDom.start(css)   the game's stylesheet
//   __rgDom.apply(tree)  one frame's tree into the document
//   __rgDom.target(n)    the id with handlers at or above the page's node n
//   __rgDom.boxes(ids)   rg.box: { id: {x, y, w, h} } from the laid-out page
var __rgDom = (function () {
  // EVG's defaults as CSS: every box is a flex column, placed in its parent
  // (position: absolute is from the parent), with no margins of its own;
  // a border is drawn when it has a width
  var BASE = "html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }\n" +
    "body { font-family: 'Noto Sans'; font-size: 14px; color: #000000; line-height: normal; }\n" +
    "body * { box-sizing: border-box; position: relative; flex-shrink: 0; border-style: solid; border-width: 0; margin: 0; padding: 0; }\n" +
    "div, img { display: flex; flex-direction: column; }\n" +
    "svg { display: block; overflow: visible; }\n" +
    "span, p, label, small, h1, h2, h3, h4 { display: block; font-size: inherit; font-weight: inherit; }\n" +
    "b, strong { display: block; font-weight: 700; }\n" +
    "i { display: block; font-style: italic; }\n";
  var TAG = { text: "span", image: "img" };
  var KNOWN = { div: 1, span: 1, p: 1, b: 1, i: 1, label: 1, h1: 1, h2: 1, h3: 1, h4: 1, small: 1, strong: 1, img: 1 };

  // EVG's shadow-color / shadow-offset-x / -y / shadow-radius as box-shadow
  function shadows(css) {
    return String(css).replace(/\{([^{}]*)\}/g, function (all, body) {
      if (body.indexOf("shadow-") < 0) return all;
      var sh = { color: "", x: "0px", y: "0px", r: "0px" };
      var rest = body.replace(/(^|;)\s*shadow-(color|offset-x|offset-y|radius)\s*:\s*([^;]*)/g, function (m, pre, k, v) {
        v = v.trim();
        if (k === "color") sh.color = v; else if (k === "offset-x") sh.x = v; else if (k === "offset-y") sh.y = v; else sh.r = v;
        return pre;
      });
      if (!sh.color) return "{" + rest + "}";
      return "{" + rest + "; box-shadow: " + sh.x + " " + sh.y + " " + sh.r + " " + sh.color + ";}";
    });
  }

  function kebab(k) {
    if (k.indexOf("-") >= 0) return k;
    return k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
  }
  // the view's style as { css-name: value }, EVG's shadow-* as box-shadow
  function styleMap(s) {
    var out = {}, sh = null;
    if (!s) return out;
    for (var k in s) {
      var n = kebab(k);
      if (n.slice(0, 7) === "shadow-") { sh = sh || {}; sh[n] = s[k]; continue; }
      out[n] = String(s[k]);
    }
    if (sh && sh["shadow-color"]) out["box-shadow"] = (sh["shadow-offset-x"] || "0px") + " " + (sh["shadow-offset-y"] || "0px") + " " + (sh["shadow-radius"] || "0px") + " " + sh["shadow-color"];
    return out;
  }

  // only the properties that changed go to el.style, one by one: RangerDOM
  // then styles only that element again with what it had (a moving box's
  // left/top or a scrolled page's margin each frame), where a whole style
  // attribute restyled it and what is under it from the start
  function setStyle(el, was, s) {
    var now = styleMap(s), old = was.st || {}, chg = [], whole = false, k, j;
    for (k in old) if (!(k in now)) whole = true;
    for (k in now) {
      if (old[k] === now[k]) continue;
      if (!(k in old) || now[k].indexOf("!") >= 0) whole = true;
      chg.push(k);
    }
    was.st = now;
    if (!chg.length && !whole) return;
    stats.changed++;
    // (a shorthand next to its own longhands, e.g. border and border-color,
    // keeps their order only when written whole)
    for (j = 0; j < chg.length && !whole; j++) for (k in now) if (k !== chg[j] && k.indexOf(chg[j] + "-") === 0) whole = true;
    if (whole) {
      var parts = [];
      for (k in now) parts.push(k + ": " + now[k]);
      if (parts.length) el.setAttribute("style", parts.join("; ")); else el.removeAttribute("style");
      return;
    }
    for (j = 0; j < chg.length; j++) el.style.setProperty(chg[j], now[chg[j]]);
  }

  function tagOf(t) {
    t = TAG[t] || t || "div";
    return KNOWN[t] ? t : "div";
  }

  var stats = { made: 0, changed: 0 };
  var FAST_ON = true;
  var SVG = "http://www.w3.org/2000/svg";
  // EVG's <path d fill stroke strokeWidth viewBox> is a box with a vector
  // shape in it: here a box with an <svg> and its <path> in it
  var PATH_ATTRS = { d: "d", fill: "fill", stroke: "stroke", strokeWidth: "stroke-width", "stroke-width": "stroke-width", fillRule: "fill-rule", opacity: "opacity" };
  function pathAttrs(el, a) {
    var svg = el.firstChild, p = svg.firstChild, vb = a.viewBox || a.viewbox || "";
    if (el.__rg.vb !== vb) {
      if (vb) svg.setAttribute("viewBox", vb); else svg.removeAttribute("viewBox");
      el.__rg.vb = vb;
    }
    for (var k in PATH_ATTRS) {
      var v = a[k];
      if (v === undefined) { if (k === "fill") v = "none"; else continue; }
      if (p.getAttribute(PATH_ATTRS[k]) !== v) p.setAttribute(PATH_ATTRS[k], v);
    }
  }

  function make(n) {
    stats.made++;
    if (typeof n === "string") return document.createTextNode(n);
    if (n.t === "path") {
      // (in a box of its own: RangerDOM paints a positioned box over its
      // in-flow siblings, an <svg> as a picture in its parent's flow)
      var box = document.createElement("div");
      var svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("style", "position: absolute; left: 0px; top: 0px; width: 100%; height: 100%;");
      svg.appendChild(document.createElementNS(SVG, "path"));
      box.appendChild(svg);
      box.__rg = { t: "path" };
      update(box, n);
      return box;
    }
    var el = document.createElement(tagOf(n.t));
    el.__rg = { t: n.t };
    update(el, n);
    return el;
  }

  function update(el, n) {
    var was = el.__rg;
    was.pos = undefined;
    var cls = n.cls || "";
    if (was.cls !== cls) { if (cls) el.setAttribute("class", cls); else el.removeAttribute("class"); was.cls = cls; stats.changed++; }
    var id = n.id || "";
    if (was.id !== id) {
      if (id) el.setAttribute("id", id); else el.removeAttribute("id");
      el.__rgid = id;
      was.id = id;
    }
    setStyle(el, was, n.s);
    was.sraw = n.s;
    if (was.t === "path") { pathAttrs(el, n.a || {}); was.a = n.a || {}; return; }
    var a = n.a || {}, old = was.a || {};
    for (var k in old) if (!(k in a)) el.removeAttribute(k);
    for (var k2 in a) if (old[k2] !== a[k2]) el.setAttribute(k2, a[k2]);
    was.a = a;
    kids(el, n.c || []);
  }


  // ---- the fast path ---------------------------------------------------
  // A frame whose tree differs from the last only in inline values that
  // place or size a box, or paint it (`FAST`), on elements already there,
  // need not go through the DOM: the changes go to the renderer as patches
  // ([node, name, value]) that it writes on the EVG elements it laid out
  // last (EVGRetain), and into the document only when a frame next takes
  // the full path (`flush`). What can be patched so is narrow: a property
  // DomView copies to the element as it is.
  var FAST_ABS = { left: 1, top: 1, right: 1, bottom: 1, width: 1, height: 1 };
  var FAST_FLEX = { "margin-top": 1, "margin-left": 1, "margin-right": 1, "margin-bottom": 1, width: 1, height: 1 };
  var pending = [], lastFast = "";
  function posOf(el) {
    var w = el.__rg;
    if (w.pos === undefined) {
      var cs = getComputedStyle(el), p = el.parentNode;
      w.pos = String(cs.position || "");
      w.pflex = !!(p && p.nodeType === 1 && /flex/.test(String(getComputedStyle(p).display || "")));
      w.tf = String(cs.transform || "none") !== "none";
    }
    return w;
  }
  function fastProp(el, k, a, b) {
    if (a === undefined || b === undefined) return false;
    if (/!|%|calc|var\(|auto|em|vw|vh/.test(a + b)) return false;
    var w = posOf(el);
    // a transform from one to another on an absolute box (paint only)
    if (k === "transform") return w.pos === "absolute" && w.tf && a !== "none" && b !== "none";
    if (w.tf && w.pos !== "absolute") return false;
    // (a picture's other side follows its natural size, which DomView works out)
    if ((k === "width" || k === "height") && el.localName === "img") return false;
    if (FAST_ABS[k] && w.pos === "absolute") return true;
    if (k === "border-radius" && w.pos === "absolute") return true;
    // paint only: a colour that shows to another, an opacity under 1 and
    // over 0 to another (no stacking context made or lost)
    if (k === "background-color") return shows(a) && shows(b);
    if (k === "opacity") { var x = +a, y = +b; return x > 0.001 && x < 1 && y > 0.001 && y < 1; }
    if (FAST_FLEX[k] && w.pflex && w.pos !== "absolute") return true;
    return false;
  }
  function shows(c) {
    c = String(c).replace(/\s/g, "").toLowerCase();
    if (c === "transparent" || c === "none" || c === "") return false;
    var m = /^(rgba|hsla)\(.*,([^,]*)\)$/.exec(c);
    if (m && !(+m[2] > 0.999)) return false;
    if (/^#([0-9a-f]{4}|[0-9a-f]{8})$/.test(c)) return false;
    return true;
  }
  var raws = [];
  function sameRaw(a, b) {
    if (a === b) return true;
    if (!a || !b) return !a && !b;
    var n = 0, k;
    for (k in b) { if (a[k] !== b[k]) return false; n++; }
    for (k in a) n--;
    return n === 0;
  }
  // whether `n` can be had from `el` by patches alone (pushed to `out`)
  function fastDiff(el, n, out) {
    if (!same(el, n)) return false;
    if (typeof n === "string") {
      if (el.data === n) return true;
      // (a text of its own in its element: the text run DomView made of it)
      if (el.parentNode.childNodes.length !== 1 || !n.length || !el.data.length) return false;
      out.push([el, "#text", n]);
      return true;
    }
    var w = el.__rg;
    if ((n.cls || "") !== w.cls || (n.id || "") !== w.id) return false;
    var a = n.a || {}, old = w.a || {}, k;
    for (k in old) if (old[k] !== a[k]) return false;
    for (k in a) if (!(k in old)) return false;
    // (the view's style object as it was last time: most are)
    if (!sameRaw(w.sraw, n.s)) {
      var now = styleMap(n.s), st = w.st || {};
      for (k in st) if (!(k in now)) return false;
      for (k in now) {
        if (st[k] === now[k]) continue;
        if (!fastProp(el, k, st[k], now[k])) return false;
        out.push([el, k, now[k]]);
      }
      raws.push(w, n.s);
    }
    // (a path's box: its shape the same, the <svg> in it is ours)
    if (w.t === "path") return true;
    var list = n.c || [], have = el.childNodes;
    if (list.length !== have.length) return false;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (typeof c === "number") c = String(c);
      if (!fastDiff(have[i], c, out)) return false;
    }
    return true;
  }
  // a length as the DOM computes it: px to three decimals
  function px3(v) {
    if (String(v).indexOf("px") < 0) return String(v);
    return String(v).replace(/-?\d*\.?\d+(e[-+]?\d+)?/gi, function (n) { return String(Math.round(+n * 1000) / 1000); });
  }
  // the patches of the fast path into the document
  function flush() {
    if (!pending.length) return;
    var p = pending;
    pending = [];
    for (var i = 0; i < p.length; i++) p[i][0].style.setProperty(p[i][1], p[i][2]);
  }

  function same(node, n) {
    if (typeof n === "string") return node.nodeType === 3;
    return node.nodeType === 1 && node.__rg && node.__rg.t === n.t;
  }

  function kids(el, list) {
    var have = el.childNodes;
    for (var i = 0; i < list.length; i++) {
      var n = list[i], cur = have[i];
      if (typeof n === "number") n = String(n);
      if (cur && same(cur, n)) {
        if (typeof n === "string") { if (cur.data !== n) cur.data = n; }
        else update(cur, n);
      } else if (cur) {
        el.replaceChild(make(n), cur);
      } else {
        el.appendChild(make(n));
      }
    }
    while (el.childNodes.length > list.length) el.removeChild(el.lastChild);
  }

  return {
    start: function (css) {
      __addStyle(BASE + shadows(css || ""));
      document.body.textContent = "";
    },
    // elements made and changed since the last call (a test's)
    stats: function () { var o = JSON.stringify(stats); stats = { made: 0, changed: 0 }; return o; },
    apply: function (tree) {
      lastFast = "";
      var top = document.body.firstChild, out = [];
      raws = [];
      if (FAST_ON && tree && top && top.nodeType === 1 && fastDiff(top, tree, out)) {
        var ps = [];
        for (var i = 0; i < out.length; i++) {
          var p = out[i];
          if (p[1] === "#text") { p[0].data = p[2]; ps.push([String(p[0].__id), p[1], p[2]]); continue; }
          p[0].__rg.st[p[1]] = p[2];
          pending.push(p);
          ps.push([String(p[0].__id), p[1], px3(p[2])]);
        }
        for (var r = 0; r < raws.length; r += 2) raws[r].sraw = raws[r + 1];
        lastFast = JSON.stringify(ps);
        return;
      }
      flush();
      kids(document.body, tree ? [tree] : []);
    },
    // the last frame's patches ("[]": nothing changed) or "" for the full path
    fast: function () { return lastFast; },
    flush: flush,
    // nodes: the page's nodes under the finger, topmost first ("n,n,...");
    // the first element with an id (what EVG's hit test gives), or else
    // the id at or above the topmost node
    target: function (nodes) {
      if (!nodes) return "";
      var ids = String(nodes).split(","), want = {}, at = {}, i;
      for (i = 0; i < ids.length; i++) want[ids[i]] = 1;
      (function walk(n) {
        if (want[String(n.__id)]) at[String(n.__id)] = n;
        var c = n.childNodes;
        for (var k = 0; k < c.length; k++) walk(c[k]);
      })(document.body);
      for (i = 0; i < ids.length; i++) { var e = at[ids[i]]; if (e && e.__rgid) return e.__rgid; }
      var n = at[ids[0]];
      while (n && n !== document.body) {
        if (n.__rgid) return n.__rgid;
        n = n.parentNode;
      }
      return "";
    },
    // the laid-out page as Ui::tree gives it (tools: Games' inspect_game):
    // { t, id?, cls?, x, y, w, h, text?, c? }
    tree: function () {
      function r(v) { return Math.round(v * 10) / 10; }
      function node(el) {
        var b = el.getBoundingClientRect();
        var o = { t: el.__rg ? el.__rg.t : el.localName };
        if (el.__rgid) o.id = el.__rgid;
        if (el.__rg && el.__rg.cls) o.cls = el.__rg.cls;
        o.x = r(b.left); o.y = r(b.top); o.w = r(b.width); o.h = r(b.height);
        var text = "", kids = [];
        for (var i = 0; i < el.childNodes.length; i++) {
          var c = el.childNodes[i];
          if (c.nodeType === 3) text += c.data;
          else if (c.nodeType === 1 && c.__rg && getComputedStyle(c).display !== "none") kids.push(node(c));
        }
        if (text) o.text = text;
        if (kids.length) o.c = kids;
        return o;
      }
      var root = document.body.firstChild;
      return JSON.stringify(root && root.nodeType === 1 ? node(root) : null);
    },
    boxes: function (ids) {
      var out = {};
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        out[ids[i]] = { x: r.left, y: r.top, w: r.width, h: r.height };
      }
      return JSON.stringify(out);
    }
  };
})();
