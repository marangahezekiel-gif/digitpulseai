"use strict";
// Keeps the app opening when the connection drops. It only stores the site's own page and icons.
// Anything under /api (payments, keys, login) and every other website always goes straight to the network.
const CACHE = "dpai-shell-v1";
const SHELL = ["/", "/icon.svg", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/") || u.pathname === "/admin" || u.pathname === "/sw.js") return;
  // Network first, so a new version of the site always shows up; the saved copy is only the fallback.
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok && (r.mode === "navigate" || SHELL.includes(u.pathname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(r.mode === "navigate" ? "/" : r, copy));
        }
        return res;
      })
      .catch(() => caches.match(r.mode === "navigate" ? "/" : r).then((m) => m || Response.error()))
  );
});
