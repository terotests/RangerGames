// SPDX-License-Identifier: AGPL-3.0-or-later
//
// rg.net on the web: the browser's tabs (and the playground's phone frames)
// play together through a BroadcastChannel, the way two Android phones do
// over Bluetooth (android/…/Bluetooth.java). Both give the engine the same
// events ({type: "info" | "state" | "peers" | "open" | "leave" | "data"}, see
// rg.net in crates/rg_engine/src/js/runtime.js), so a two-phone game can be
// tried with two tabs on one computer.
(function (global) {
  "use strict";
  var CHANNEL = "rangergames-net";
  var PING_MS = 1500, DEAD_MS = 6000;

  function RgNet(emit) {
    this.emit = emit;           // emit(event): to the engine
    this.id = Math.random().toString(36).slice(2, 10);
    this.name = "Selain " + (1000 + Math.floor(Math.random() * 9000));
    this.mode = "off";
    this.game = "";
    this.links = {};            // id -> { id, name, seen }
    this.found = {};
    this.ch = null;
    var self = this;
    if (typeof BroadcastChannel !== "undefined") {
      this.ch = new BroadcastChannel(CHANNEL);
      this.ch.onmessage = function (e) { self.receive(e.data); };
      global.addEventListener("pagehide", function () { self.close(true); });
      setInterval(function () { self.ping(); }, PING_MS);
    }
  }

  RgNet.prototype.post = function (m) { m.from = this.id; if (this.ch) this.ch.postMessage(m); };
  RgNet.prototype.state = function (s, reason) {
    this.mode = s;
    this.emit(reason ? { type: "state", state: s, reason: reason } : { type: "state", state: s });
  };

  // a command from the game: ["net", op, args]
  RgNet.prototype.command = function (op, a) {
    a = a || {};
    if (op === "close") {
      this.close(false);
      this.emit({ type: "info", available: !!this.ch, kind: "web", name: this.name });
      return;
    }
    if (!this.ch) { this.state("error", "no-network"); return; }
    if (op === "host") {
      this.close(true);
      this.game = a.game || "";
      this.max = Math.max(1, Math.min(7, a.max || 7));
      this.hosting = true;
      this.state("hosting");
    } else if (op === "find") {
      this.close(true);
      this.game = a.game || "";
      this.found = {};
      this.state("searching");
      this.emit({ type: "peers", peers: [] });
      this.post({ k: "who", game: this.game });
    } else if (op === "join") {
      if (this.mode === "connected") return;
      this.game = a.game || this.game;
      this.state("connecting");
      this.post({ k: "join", to: a.id, name: this.name });
      var self = this, want = a.id;
      setTimeout(function () { if (self.mode === "connecting" && !self.links[want]) self.state("error", "connect-failed"); }, 4000);
    } else if (op === "send") {
      for (var id in this.links) if (!a.to || a.to === id) this.post({ k: "data", to: id, text: String(a.text) });
    }
  };

  RgNet.prototype.open = function (id, name) {
    this.links[id] = { id: id, name: name || "", seen: Date.now() };
    // a guest is connected; a host is when it is full
    if (this.mode !== "hosting" || Object.keys(this.links).length >= this.max) this.state("connected");
    this.emit({ type: "open", peer: { id: id, name: name || "" } });
  };

  RgNet.prototype.drop = function (id) {
    var l = this.links[id];
    if (!l) return;
    delete this.links[id];
    this.emit({ type: "leave", peer: { id: id, name: l.name } });
    // a guest whose host left is alone again; a host waits for others again
    if (this.hosting) { if (this.mode === "connected") this.state("hosting"); }
    else if (this.mode === "connected") this.state("off");
  };

  RgNet.prototype.close = function (quiet) {
    for (var id in this.links) this.post({ k: "bye", to: id });
    var was = this.mode;
    this.links = {};
    this.mode = "off";
    this.hosting = false;
    if (!quiet && was !== "off") this.emit({ type: "state", state: "off" });
  };

  RgNet.prototype.ping = function () {
    var now = Date.now();
    for (var id in this.links) {
      if (now - this.links[id].seen > DEAD_MS) { this.drop(id); continue; }
      this.post({ k: "ping", to: id });
    }
  };

  RgNet.prototype.receive = function (m) {
    if (!m || m.from === this.id) return;
    if (m.to && m.to !== this.id) return;
    var l = this.links[m.from];
    if (l) l.seen = Date.now();
    switch (m.k) {
      case "who":
        // a phone looking for a game: the host of the same game answers
        if (this.mode === "hosting" && m.game === this.game) this.post({ k: "here", to: m.from, name: this.name, game: this.game });
        break;
      case "here":
        if (this.mode !== "searching") break;
        this.found[m.from] = { id: m.from, name: m.name, paired: false };
        var list = [];
        for (var f in this.found) list.push(this.found[f]);
        this.emit({ type: "peers", peers: list });
        break;
      case "join":
        if (this.mode !== "hosting" || Object.keys(this.links).length >= this.max) { this.post({ k: "deny", to: m.from }); break; }
        this.post({ k: "accept", to: m.from, name: this.name });
        this.open(m.from, m.name);
        break;
      case "accept":
        if (this.mode === "connecting") this.open(m.from, m.name);
        break;
      case "deny":
        if (this.mode === "connecting") this.state("error", "busy");
        break;
      case "data":
        if (l) this.emit({ type: "data", from: m.from, text: m.text });
        break;
      case "bye":
        this.drop(m.from);
        break;
      default:
        break;
    }
  };

  global.RgNet = RgNet;
})(typeof window !== "undefined" ? window : this);
