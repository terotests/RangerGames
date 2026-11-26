// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Dev reload on the web page (?dev=1, or ?dev=http://127.0.0.1:<port>): the
// files saved on the computer (scripts/dev-server.mjs) go into the running
// engine. Scripts start the game again, style.css restyles it in place,
// pictures and sounds are loaded again. The engine's log goes to the
// server's terminal too. Same protocol as the Android app (DevLink.java);
// docs/dev-reload.md.
(function (global) {
  "use strict";
  var params = new URLSearchParams(global.location.search);
  var want = params.get("dev");
  if (want === null) return;
  var base = want === "" || want === "1" ? "http://127.0.0.1:8787" : want.replace(/\/$/, "");
  // only a server on this computer (or the page's own host): a link must not
  // bring someone else's code into the page
  try {
    var u = new URL(base);
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) && u.hostname !== global.location.hostname) {
      console.warn("dev: " + base + " is not on this computer, dev reload off");
      return;
    }
  } catch (e) {
    console.warn("dev: bad address " + base);
    return;
  }
  var enc = new TextEncoder();
  var since = 0;
  var told = false;
  var logs = [];

  function host() {
    var h = global.rgHost;
    return h && h.x ? h : null;
  }

  function sendLogs() {
    if (!logs.length) return;
    var body = logs.join("\n");
    logs = [];
    fetch(base + "/dev/log?from=web", { method: "POST", body: body }).catch(function () { });
  }

  function hookLog(h) {
    if (h.onLog) return;
    h.onLog = function (log) {
      logs.push(log);
      setTimeout(sendLogs, 0);
    };
  }

  function apply(h, got) {
    var paths = [];
    for (var i = 0; i < got.length; i++) {
      var p = got[i][0];
      var a = h.put(p), b = h.put(got[i][1]);
      h.x.rg_put(a[0], a[1], b[0], b[1]);
      h.free(a); h.free(b);
      // the page's decoded copies: loaded again when next drawn or played
      h.images.delete(p);
      delete h.imageState[p];
      if (h.audio && h.audio.buffers) delete h.audio.buffers[p];
      if (h.x.rg_gl_forget) { var g = h.put(p); h.x.rg_gl_forget(g[0], g[1]); h.free(g); }
      paths.push(p);
    }
    var t0 = performance.now();
    var l = h.put(enc.encode(paths.join("\n")));
    var r = h.x.rg_dev_changed ? h.x.rg_dev_changed(l[0], l[1]) : -1;
    h.free(l);
    h.afterCall();
    h.readView();
    var what = r === 2 ? "game started again" : r === 1 ? "restyled" : r === 0 ? "put" : "put (engine without rg_dev_changed)";
    logs.push("dev: " + got.length + " file" + (got.length === 1 ? "" : "s") + ", " + what + " (" + Math.round(performance.now() - t0) + " ms)");
    sendLogs();
  }

  function poll() {
    var h = host();
    if (!h) { setTimeout(poll, 300); return; }
    hookLog(h);
    fetch(base + "/dev/changes?wait=1&since=" + since, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (ch) {
        if (!told) { console.log("dev: connected to " + base); told = true; }
        return Promise.all(ch.files.map(function (f) {
          return fetch(base + "/f/" + f.p.split("/").map(encodeURIComponent).join("/"), { cache: "no-store" })
            .then(function (r) { if (!r.ok) throw new Error(f.p + ": " + r.status); return r.arrayBuffer(); })
            .then(function (b) { return ["/games/" + f.p, new Uint8Array(b)]; });
        })).then(function (got) {
          if (got.length) apply(h, got);
          since = ch.v;
          poll();
        });
      })
      .catch(function (e) {
        if (told) console.warn("dev: server gone", e);
        told = false;
        setTimeout(poll, 2000);
      });
  }
  poll();
})(this);
