// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The few WASI calls the engine's wasm32-wasip1 build makes in a page: the
// clock, random numbers, stdout/stderr (to the console) and exit. No files,
// arguments or environment. Written without BigInt so that an old Android
// WebView runs it.
(function (global) {
  "use strict";
  function makeWasi(onOutput) {
    var memory = null;
    var decoder = new TextDecoder();
    var pending = { 1: "", 2: "" };
    function view() { return new DataView(memory.buffer); }
    function bytes() { return new Uint8Array(memory.buffer); }
    function put64(ptr, value) {
      var v = view();
      var lo = value % 4294967296;
      var hi = Math.floor(value / 4294967296);
      v.setUint32(ptr, lo >>> 0, true);
      v.setUint32(ptr + 4, hi >>> 0, true);
    }
    var imports = {
      fd_write: function (fd, iovs, iovsLen, nwritten) {
        if (fd !== 1 && fd !== 2) return 8;
        var v = view(), total = 0, text = "";
        for (var i = 0; i < iovsLen; i++) {
          var ptr = v.getUint32(iovs + i * 8, true);
          var len = v.getUint32(iovs + i * 8 + 4, true);
          text += decoder.decode(bytes().subarray(ptr, ptr + len));
          total += len;
        }
        pending[fd] += text;
        var nl;
        while ((nl = pending[fd].indexOf("\n")) >= 0) {
          onOutput(fd, pending[fd].slice(0, nl));
          pending[fd] = pending[fd].slice(nl + 1);
        }
        v.setUint32(nwritten, total, true);
        return 0;
      },
      clock_time_get: function (id, _precision, out) {
        var ms = id === 0 ? Date.now() : performance.now();
        put64(out, Math.round(ms * 1e6));
        return 0;
      },
      clock_res_get: function (_id, out) { put64(out, 1000); return 0; },
      random_get: function (buf, len) {
        var b = bytes().subarray(buf, buf + len);
        if (global.crypto && global.crypto.getRandomValues) {
          for (var i = 0; i < len; i += 65536) global.crypto.getRandomValues(b.subarray(i, Math.min(len, i + 65536)));
        } else {
          for (var j = 0; j < len; j++) b[j] = Math.floor(Math.random() * 256);
        }
        return 0;
      },
      environ_sizes_get: function (count, size) { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
      environ_get: function () { return 0; },
      args_sizes_get: function (count, size) { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
      args_get: function () { return 0; },
      proc_exit: function (code) { throw new Error("wasm exit " + code); },
      sched_yield: function () { return 0; }
    };
    return {
      imports: imports,
      setMemory: function (m) { memory = m; }
    };
  }
  global.RgWasi = { makeWasi: makeWasi };
})(window);
