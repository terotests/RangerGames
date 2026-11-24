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
    // the sounds a game controls by handle (rg.stopSound …), see startSource
    this.playing = {};
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
  Audio.prototype.tone = function (type, f0, f1, len, vol, at, dest) {
    var c = this.ctx, t = (at || c.currentTime);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + len + 0.02);
  };

  Audio.prototype.noise = function (len, vol, f0, f1, at, dest) {
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
    s.connect(f); f.connect(g); g.connect(dest || this.master);
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
    this.fxAt = Date.now();
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
    this.playFile(name, vol, pitch, !!(opts && opts.loop), !!(opts && opts.radio), !!(opts && opts.queue), opts, opts && opts.h, opts && opts.fade);
  };

  // a radio voice: a squelch of static, the voice through a narrow band
  // with a little grit, a hiss under it and a click at the end
  // returns how long the whole call takes (from `t`, the voice starts 0.26 s in)
  Audio.prototype.radioChain = function (s, vol, t, dest) {
    var c = this.ctx, len = s.buffer.duration / (s.playbackRate.value || 1);
    var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 420;
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2900;
    var pk = c.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 1700; pk.gain.value = 6;
    var ws = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i * 2 / (n - 1) - 1; curve[i] = Math.tanh(2.6 * x) / Math.tanh(2.6); }
    ws.curve = curve;
    var g = c.createGain(); g.gain.value = vol;
    dest = dest || this.master;
    s.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(ws); ws.connect(g); g.connect(dest);
    this.noise(0.28, 0.5 * vol, 2600, 1400, t, dest);
    this.noise(len + 0.3, 0.06 * vol, 2200, 1800, t + 0.05, dest);
    this.tone("square", 1450, 1450, 0.05, 0.08 * vol, t + 0.3 + len, dest);
    this.noise(0.12, 0.35 * vol, 2400, 900, t + 0.32 + len, dest);
    return 0.45 + len;
  };

  // queue: the sound waits until the queued sounds before it have ended (a
  // spoken line after a spoken line); radio: played as a radio call
  // fx (rg.sound's options): lowpass / highpass (Hz) filter the sound,
  // static (0..1) lays a hiss under it
  Audio.prototype.fxChain = function (s, vol, t, fx, dest) {
    var c = this.ctx, node = s;
    if (fx.highpass) { var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = fx.highpass; node.connect(hp); node = hp; }
    if (fx.lowpass) { var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = fx.lowpass; node.connect(lp); node = lp; }
    var g = c.createGain(); g.gain.value = vol;
    dest = dest || this.master;
    node.connect(g); g.connect(dest);
    if (fx.static > 0) this.noise(s.buffer.duration / (s.playbackRate.value || 1) + 0.1, Math.min(1, fx.static) * 0.25 * vol, 2400, 1600, t, dest);
  };

  // A sound with a handle (h) is kept in this.playing until it ends or is
  // stopped: { h, vol, buf, pitch, loop, radio, fx, out (its own gain, the
  // handle's volume and fades), s (the source playing), t0 (ctx time of its
  // position 0), off (seconds in, while paused), paused, level }
  Audio.prototype.startSource = function (e, at, off) {
    var c = this.ctx, s = c.createBufferSource(), self = this, p = e.pitch || 1;
    off = off || 0;
    if (e.loop && e.buf.duration > 0) off = off % e.buf.duration;
    s.buffer = e.buf; s.loop = !!e.loop; s.playbackRate.value = p;
    var len = (e.buf.duration - off) / p;
    if (e.radio && !e.loop) {
      len = this.radioChain(s, e.vol, at, e.out);
      s.start(at + 0.26);
    } else if (e.fx && !e.loop && (e.fx.lowpass || e.fx.highpass || e.fx.static > 0)) {
      this.fxChain(s, e.vol, at, e.fx, e.out); s.start(at, off);
    } else {
      var g = c.createGain(); g.gain.value = e.vol;
      s.connect(g); g.connect(e.out); s.start(at, off);
    }
    e.s = s; e.t0 = at - off / p;
    s.onended = function () {
      if (e.s !== s) return;
      e.s = null;
      if (e.h && self.playing[e.h] === e && !e.paused) delete self.playing[e.h];
    };
    return len;
  };

  Audio.prototype.playFile = function (path, vol, pitch, loop, radio, queue, fx, h, fade) {
    var self = this;
    // the handle is known before the file is decoded: a stop, pause or
    // volume asked for meanwhile applies when it starts
    if (h) this.playing[h] = { h: h, vol: vol, base: vol };
    var go = function (buf) {
      var e = h ? self.playing[h] : { vol: vol };
      if (!e) return null;   // stopped before it could start
      if (!buf || !self.ready()) { if (h) delete self.playing[h]; return null; }
      e.buf = buf; e.pitch = pitch || 1; e.loop = !!loop; e.radio = radio; e.fx = fx;
      e.out = self.ctx.createGain(); e.out.connect(self.master);
      var now = self.ctx.currentTime;
      var at = queue && !loop ? Math.max(now, self.queueEnd || 0) : now;
      var lvl = e.level === undefined ? 1 : e.level;
      if (fade > 0) { e.out.gain.setValueAtTime(0, at); e.out.gain.linearRampToValueAtTime(lvl, at + fade); }
      else e.out.gain.value = lvl;
      if (e.paused) { e.off = 0; return null; }
      var len = self.startSource(e, at, 0);
      if (queue && !loop) self.queueEnd = at + len + 0.15;
      return e.s;
    };
    var have = this.buffers[path];
    if (have === undefined && /\.wav$/i.test(path)) {
      have = this.buffer(path);
      if (have === undefined && this.fetching && this.fetching[path]) {
        // fetched from the server: played when it comes, if soon enough
        var asked = Date.now();
        this.fetching[path].then(function () { if (Date.now() - asked < 1500) go(self.buffers[path]); });
        return null;
      }
      if (!have) { delete this.buffers[path]; have = undefined; }
    }
    if (have) return go(have);
    if (have === null) return null;
    var bytes = this.readFile(path);
    if (!bytes) { this.buffers[path] = null; return null; }
    this.buffers[path] = null;
    var copy = bytes.slice().buffer;
    this.ctx.decodeAudioData(copy, function (buf) { self.buffers[path] = buf; go(buf); },
      function () { self.buffers[path] = null; if (h) delete self.playing[h]; });
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
  // A host whose pack leaves out other .wav files too sets remoteURL(path)
  // to the address of such a file ("" or null: not on the server).
  Audio.prototype.remoteURL = null;
  Audio.prototype.remote = function (path) {
    if (!/\.wav$/i.test(path)) return false;
    this.fetching = this.fetching || {};
    if (this.fetching[path]) return true;
    var url = /^\/games\/_voice\/./.test(path) ? path.slice(1) : this.remoteURL ? this.remoteURL(path) : null;
    if (!url) return false;
    var self = this;
    this.fetching[path] = fetch(url).then(function (r) {
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

  // the page itself makes a sound (speech, or an effect in the last 0.6 s):
  // rg.sensor("mic") tells the game, so it does not hear its own voice
  Audio.prototype.busy = function () {
    return !!(this.speaking || this.waitingFor || (this.speech && this.speech.length) || (this.fxAt && Date.now() - this.fxAt < 600));
  };

  // music: a tune of TUNES or a sound file, looping unless opts.loop is
  // false; opts.h its handle, opts.fade seconds up from silence
  Audio.prototype.startMusic = function (name, opts) {
    this.stopMusic();
    if (!this.ready()) { this.wanted = [name, opts]; return; }
    var tune = TUNES[name];
    var vol = opts && opts.volume !== undefined ? opts.volume : 1;
    var h = (opts && opts.h) || 0, fade = (opts && opts.fade) || 0;
    if (!tune) {
      // a file: a sound like rg.sound's, under the music's handle
      if (!h) h = "m";
      this.playFile(name, vol * 0.6, 1, !(opts && opts.loop === false), false, false, null, h, fade);
      if (this.playing[h]) this.playing[h].base = vol;
      this.music = { h: h };
      return;
    }
    var c = this.ctx, out = c.createGain();
    out.connect(this.master);
    if (fade > 0) { out.gain.setValueAtTime(0, c.currentTime); out.gain.linearRampToValueAtTime(1, c.currentTime + fade); }
    var m = { h: h, tune: true, out: out, vol: vol, paused: false };
    var self = this, beat = 60 / tune.bpm, step = 0, next = c.currentTime + 0.05;
    var once = opts && opts.loop === false;
    m.timer = setInterval(function () {
      if (!self.ready()) return;
      if (m.paused) { next = Math.max(next, self.ctx.currentTime + 0.05); return; }
      while (next < self.ctx.currentTime + 0.3) {
        if (once && step >= tune.notes.length) { if (self.music === m) self.stopMusic(); return; }
        var n = tune.notes[step % tune.notes.length];
        if (n[0]) self.tone(tune.wave, midi(n[0]), midi(n[0]), n[1] * beat * 0.9, tune.vol * m.vol, next, out);
        next += n[1] * beat;
        step++;
      }
    }, 100);
    this.music = m;
  };

  // opts.fade: seconds down to silence first
  Audio.prototype.stopMusic = function (opts) {
    this.wanted = null;
    var m = this.music;
    if (!m) return;
    this.music = null;
    if (!m.tune) { this.stopOne(this.playing[m.h], opts && opts.fade); return; }
    var c = this.ctx, fade = opts && opts.fade > 0 && c ? opts.fade : 0;
    var end = function () { clearInterval(m.timer); try { m.out.disconnect(); } catch (e) { } };
    if (!fade) { end(); return; }
    m.out.gain.cancelScheduledValues(c.currentTime);
    m.out.gain.setValueAtTime(m.out.gain.value, c.currentTime);
    m.out.gain.linearRampToValueAtTime(0, c.currentTime + fade);
    setTimeout(end, fade * 1000 + 50);
  };

  // a sound of this.playing stops (in `fade` seconds) and is let go
  Audio.prototype.stopOne = function (e, fade) {
    if (!e) return;
    if (e.h && this.playing[e.h] === e) delete this.playing[e.h];
    var s = e.s;
    e.s = null;
    if (!s) return;
    var c = this.ctx;
    if (fade > 0 && e.out) {
      var t = c.currentTime;
      e.out.gain.cancelScheduledValues(t);
      e.out.gain.setValueAtTime(e.out.gain.value, t);
      e.out.gain.linearRampToValueAtTime(0, t + fade);
      try { s.stop(t + fade); } catch (x) { }
    } else {
      try { s.stop(); } catch (x) { }
    }
  };

  // rg.stopSound, rg.soundVolume, rg.pauseSound, rg.resumeSound:
  // o = { h (0: every sound and the music), fade, volume }
  Audio.prototype.control = function (op, o) {
    var h = (o && o.h) || 0, fade = o && o.fade > 0 ? o.fade : 0, self = this;
    var m = this.music, tuneHit = m && m.tune && (!h || m.h === h);
    var list = [];
    if (h) { if (this.playing[h]) list.push(this.playing[h]); }
    else for (var k in this.playing) list.push(this.playing[k]);
    if (op === "stop") {
      if (!h) this.wanted = null;
      if (m && (!h || m.h === h)) this.stopMusic({ fade: fade });
      list.forEach(function (e) { self.stopOne(e, fade); });
      return;
    }
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    if (op === "volume") {
      var v = Math.max(0, Number(o.volume) || 0);
      if (tuneHit) m.vol = v;
      list.forEach(function (e) {
        e.level = e.base > 0 ? v / e.base : 1;
        if (!e.out) return;
        e.out.gain.cancelScheduledValues(t);
        e.out.gain.setValueAtTime(e.out.gain.value, t);
        if (fade) e.out.gain.linearRampToValueAtTime(e.level, t + fade); else e.out.gain.setValueAtTime(e.level, t);
      });
    } else if (op === "pause") {
      if (tuneHit) m.paused = true;
      list.forEach(function (e) {
        if (e.paused) return;
        e.paused = true;
        if (!e.s) return;
        e.off = Math.max(0, (t - e.t0) * (e.pitch || 1));
        var s = e.s; e.s = null;
        try { s.stop(); } catch (x) { }
      });
    } else if (op === "resume") {
      if (tuneHit) m.paused = false;
      list.forEach(function (e) {
        if (!e.paused) return;
        e.paused = false;
        if (e.buf && !e.s && self.ready()) {
          if (!e.loop && e.off >= e.buf.duration) { delete self.playing[e.h]; return; }
          self.startSource(e, t, e.off || 0);
        }
      });
    }
  };

  // music asked for before the first touch starts with it
  Audio.prototype.resumeWanted = function () {
    if (this.wanted && this.ready()) { var w = this.wanted; this.wanted = null; this.startMusic(w[0], w[1]); }
  };

  global.RgAudio = Audio;
})(window);
