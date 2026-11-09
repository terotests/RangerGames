// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline play: the page, the engine and the games pack are kept after the
// first visit; a new build replaces them (network first, cache as fallback).
var CACHE = "rangergames-v1";
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () { return caches.match(e.request); }));
});
