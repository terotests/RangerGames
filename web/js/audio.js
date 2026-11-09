// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sounds for the games: built-in effects synthesized with WebAudio (no
// files to download, so they work offline on the phone), little looping
// tunes, and sound files from the game's folder in the engine's virtual
// directory (decoded once, then kept).
(function (global) {
  "use strict";
  var AC = global.AudioContext || global.webkitAudioContext;

  function Audio(readFile) {
    this.ctx = null;
    this.master = null;
    this.readFile = readFile;
    this.buffers = {};
    this.music = null;
    this.muted = false;
  }

  Audio.prototype.unlock = function () {
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  };

  Audio.prototype.ready = function () {
    return this.ctx && this.ctx.state === "running" && !this.muted;
  };

  // one note: type, frequency from f0 to f1, length, volume
  Audio.prototype.tone = function (type, f0, f1, len, vol, at) {
    var c = this.ctx, t = (at || c.currentTime);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + len + 0.02);
  };

  Audio.prototype.noise = function (len, vol, f0, f1, at) {
    var c = this.ctx, t = (at || c.currentTime);
    var n = Math.floor(c.sampleRate * len);
    var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = c.createBufferSource(); s.buffer = buf;
    var f = c.createBiquadFilter(); f.type = "bandpass";
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + len);
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + len);
  };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  var EFFECTS = {
    jump: function (a, p) { a.tone("square", 260 * p, 720 * p, 0.16, 0.18); },
    coin: function (a, p) { var t = a.ctx.currentTime; a.tone("square", 988 * p, 988 * p, 0.08, 0.14, t); a.tone("square", 1319 * p, 1319 * p, 0.22, 0.14, t + 0.07); },
    click: function (a, p) { a.tone("triangle", 1200 * p, 900 * p, 0.04, 0.2); },
    tick: function (a, p) { a.tone("sine", 2000 * p, 2000 * p, 0.025, 0.12); },
    pop: function (a, p) { a.tone("sine", 700 * p, 180 * p, 0.12, 0.3); },
    hit: function (a, p) { a.noise(0.18, 0.5, 900 * p, 200 * p); a.tone("square", 160 * p, 60 * p, 0.15, 0.15); },
    lose: function (a, p) { var t = a.ctx.currentTime; [392, 349, 311, 262].forEach(function (f, i) { a.tone("sawtooth", f * p, f * p * 0.97, 0.22, 0.1, t + i * 0.18); }); },
    win: function (a, p) { var t = a.ctx.currentTime; [523, 659, 784, 1047].forEach(function (f, i) { a.tone("triangle", f * p, f * p, i === 3 ? 0.45 : 0.16, 0.22, t + i * 0.11); }); },
    whoosh: function (a, p) { a.noise(0.3, 0.35, 300 * p, 2400 * p); },
    star: function (a, p) { var t = a.ctx.currentTime; [1319, 1568, 2093].forEach(function (f, i) { a.tone("sine", f * p, f * p, 0.18, 0.12, t + i * 0.06); }); },
    wrong: function (a, p) { var t = a.ctx.currentTime; a.tone("square", 220 * p, 200 * p, 0.14, 0.12, t); a.tone("square", 180 * p, 160 * p, 0.22, 0.12, t + 0.14); },
    note: function (a, p, o) {
      var f = o && o.freq ? o.freq : midi(o && o.note !== undefined ? o.note : 60);
      a.tone((o && o.wave) || "triangle", f * p, f * p, (o && o.len) || 0.3, 0.25);
    }
  };

  // little loops: [midi note or 0 for a rest, beats]
  var TUNES = {
    happy: { bpm: 132, wave: "square", vol: 0.05, notes: [[72, 1], [76, 1], [79, 1], [76, 1], [77, 1], [74, 1], [71, 2], [72, 1], [76, 1], [79, 1], [84, 1], [83, 2], [79, 2]] },
    calm: { bpm: 84, wave: "triangle", vol: 0.08, notes: [[60, 2], [64, 2], [67, 2], [64, 2], [62, 2], [65, 2], [69, 2], [65, 2]] },
    chase: { bpm: 160, wave: "square", vol: 0.04, notes: [[64, 1], [64, 1], [67, 1], [64, 1], [62, 1], [60, 1], [62, 2], [64, 1], [67, 1], [69, 1], [67, 1], [64, 2], [0, 2]] }
  };

  Audio.prototype.play = function (name, opts) {
    if (!this.ready()) return;
    var vol = opts && opts.volume !== undefined ? opts.volume : 1;
    var pitch = opts && opts.pitch ? opts.pitch : 1;
    var fx = EFFECTS[name];
    if (fx) {
      var saved = this.master.gain.value;
      if (vol !== 1) this.master.gain.value = saved * vol;
      fx(this, pitch, opts);
      if (vol !== 1) this.master.gain.value = saved;
      return;
    }
    this.playFile(name, vol, pitch, false);
  };

  Audio.prototype.playFile = function (path, vol, pitch, loop) {
    var self = this;
    var go = function (buf) {
      if (!buf || !self.ready()) return null;
      var s = self.ctx.createBufferSource();
      s.buffer = buf; s.loop = !!loop; s.playbackRate.value = pitch || 1;
      var g = self.ctx.createGain(); g.gain.value = vol;
      s.connect(g); g.connect(self.master); s.start();
      return s;
    };
    var have = this.buffers[path];
    if (have === undefined && /\.wav$/i.test(path)) {
      have = this.buffer(path);
      if (!have) { delete this.buffers[path]; have = undefined; }
    }
    if (have) return go(have);
    if (have === null) return null;
    var bytes = this.readFile(path);
    if (!bytes) { this.buffers[path] = null; return null; }
    this.buffers[path] = null;
    var copy = bytes.slice().buffer;
    this.ctx.decodeAudioData(copy, function (buf) { self.buffers[path] = buf; if (loop) self.startMusic(path, { volume: vol }); else go(buf); },
      function () { self.buffers[path] = null; });
    return null;
  };

  // A WAV file (16-bit or 8-bit PCM, or 8-bit μ-law as the voice clips are)
  // straight into an AudioBuffer: synchronous, and no codec questions.
  function mulaw(u) {
    u = ~u & 0xff;
    var t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
    return ((u & 0x80) ? 0x84 - t : t - 0x84) / 32768;
  }
  Audio.prototype.decodeWav = function (b) {
    if (!b || b.length < 44 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== "RIFF") return null;
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var fmt = 0, ch = 1, rate = 22050, bits = 16, at = 12;
    while (at + 8 <= b.length) {
      var id = String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]), size = dv.getUint32(at + 4, true);
      if (id === "fmt ") { fmt = dv.getUint16(at + 8, true); ch = dv.getUint16(at + 10, true); rate = dv.getUint32(at + 12, true); bits = dv.getUint16(at + 22, true); }
      if (id === "data") {
        var bytes = Math.min(size, b.length - at - 8), step = bits / 8, n = Math.floor(bytes / step / ch);
        if (!n || !(fmt === 1 || fmt === 7)) return null;
        var buf = this.ctx.createBuffer(1, n, rate), d = buf.getChannelData(0), p = at + 8;
        for (var i = 0; i < n; i++, p += step * ch) {
          d[i] = fmt === 7 ? mulaw(b[p]) : bits === 16 ? dv.getInt16(p, true) / 32768 : (b[p] - 128) / 128;
        }
        return buf;
      }
      at += 8 + size + (size & 1);
    }
    return null;
  };

  Audio.prototype.buffer = function (path) {
    if (this.buffers[path] !== undefined) return this.buffers[path];
    var bytes = this.readFile(path);
    if (!bytes && this.remote(path)) return undefined;   // being fetched
    var buf = this.decodeWav(bytes);
    this.buffers[path] = buf;
    return buf;
  };

  // The web build keeps the voice clips out of the games pack (they are most
  // of its size): a clip is fetched from beside the page the first time it is
  // needed. Returns true while the fetch is on, then the clip is in buffers.
  Audio.prototype.remote = function (path) {
    if (!/^\/games\/_voice\/.+\.wav$/.test(path)) return false;
    this.fetching = this.fetching || {};
    if (this.fetching[path]) return true;
    var self = this;
    this.fetching[path] = fetch(path.slice(1)).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      self.buffers[path] = self.ctx ? self.decodeWav(new Uint8Array(ab)) : null;
    }).catch(function () {
      self.buffers[path] = null;
    }).then(function () {
      delete self.fetching[path];
      if (self.waitingFor === path) { self.waitingFor = null; self.sayNext(); }
    });
    return true;
  };

  // speech: a list of clips one after another; a new list cuts the old one
  // unless opts.queue
  Audio.prototype.say = function (opts) {
    var list = (opts && opts.list) || [];
    if (!(opts && opts.queue)) {
      this.speech = []; this.waitingFor = null;
      if (this.speaking) { try { this.speaking.onended = null; this.speaking.stop(); } catch (e) { } this.speaking = null; }
    }
    if (!this.ready()) return;
    this.speechVol = opts && opts.volume !== undefined ? opts.volume : 1;
    this.speech = (this.speech || []).concat(list);
    // start fetching every clip of the list at once (web build)
    for (var i = 0; i < this.speech.length; i++) this.buffer(this.speech[i]);
    if (!this.speaking && !this.waitingFor) this.sayNext();
  };

  Audio.prototype.sayNext = function () {
    var self = this;
    this.speaking = null;
    this.waitingFor = null;
    while (this.speech && this.speech.length) {
      var buf = this.buffer(this.speech[0]);
      if (buf === undefined) { this.waitingFor = this.speech[0]; return; }   // still downloading
      this.speech.shift();
      if (!buf) continue;
      var s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = buf;
      g.gain.value = 1.6 * this.speechVol;
      s.connect(g); g.connect(this.master);
      s.onended = function () { if (self.speaking === s) self.sayNext(); };
      s.start(this.ctx.currentTime + 0.02);
      this.speaking = s;
      return;
    }
  };

  Audio.prototype.startMusic = function (name, opts) {
    this.stopMusic();
    if (!this.ready()) { this.wanted = [name, opts]; return; }
    var tune = TUNES[name];
    var vol = opts && opts.volume !== undefined ? opts.volume : 1;
    if (!tune) { this.music = { source: this.playFile(name, vol * 0.6, 1, true) }; return; }
    var self = this, beat = 60 / tune.bpm, step = 0, next = this.ctx.currentTime + 0.05;
    var timer = setInterval(function () {
      if (!self.ready()) return;
      while (next < self.ctx.currentTime + 0.3) {
        var n = tune.notes[step % tune.notes.length];
        if (n[0]) self.tone(tune.wave, midi(n[0]), midi(n[0]), n[1] * beat * 0.9, tune.vol * vol, next);
        next += n[1] * beat;
        step++;
      }
    }, 100);
    this.music = { timer: timer };
  };

  Audio.prototype.stopMusic = function () {
    this.wanted = null;
    if (!this.music) return;
    if (this.music.timer) clearInterval(this.music.timer);
    if (this.music.source) { try { this.music.source.stop(); } catch (e) { } }
    this.music = null;
  };

  // music asked for before the first touch starts with it
  Audio.prototype.resumeWanted = function () {
    if (this.wanted && this.ready()) { var w = this.wanted; this.wanted = null; this.startMusic(w[0], w[1]); }
  };

  global.RgAudio = Audio;
})(window);
