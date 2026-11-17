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
  function styleText(s) {
    if (!s) return "";
    var parts = [], sh = null;
    for (var k in s) {
      var n = kebab(k);
      if (n.slice(0, 7) === "shadow-") { sh = sh || {}; sh[n] = s[k]; continue; }
      parts.push(n + ": " + s[k]);
    }
    if (sh && sh["shadow-color"]) parts.push("box-shadow: " + (sh["shadow-offset-x"] || "0px") + " " + (sh["shadow-offset-y"] || "0px") + " " + (sh["shadow-radius"] || "0px") + " " + sh["shadow-color"]);
    return parts.join("; ");
  }

  function tagOf(t) {
    t = TAG[t] || t || "div";
    return KNOWN[t] ? t : "div";
  }

  var stats = { made: 0, changed: 0 };
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
    var cls = n.cls || "";
    if (was.cls !== cls) { if (cls) el.setAttribute("class", cls); else el.removeAttribute("class"); was.cls = cls; stats.changed++; }
    var id = n.id || "";
    if (was.id !== id) {
      if (id) el.setAttribute("id", id); else el.removeAttribute("id");
      el.__rgid = id;
      was.id = id;
    }
    var st = styleText(n.s);
    if (was.st !== st) { el.setAttribute("style", st); was.st = st; stats.changed++; }
    if (was.t === "path") { pathAttrs(el, n.a || {}); return; }
    var a = n.a || {}, old = was.a || {};
    for (var k in old) if (!(k in a)) el.removeAttribute(k);
    for (var k2 in a) if (old[k2] !== a[k2]) el.setAttribute(k2, a[k2]);
    was.a = a;
    kids(el, n.c || []);
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

  function find(n, id) {
    if (String(n.__id) === id) return n;
    var c = n.childNodes;
    for (var i = 0; i < c.length; i++) { var f = find(c[i], id); if (f) return f; }
    return null;
  }

  return {
    start: function (css) {
      __addStyle(BASE + shadows(css || ""));
      document.body.textContent = "";
    },
    // elements made and changed since the last call (a test's)
    stats: function () { var o = JSON.stringify(stats); stats = { made: 0, changed: 0 }; return o; },
    apply: function (tree) {
      kids(document.body, tree ? [tree] : []);
    },
    target: function (node) {
      if (!node) return "";
      var n = find(document.body, String(node));
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
