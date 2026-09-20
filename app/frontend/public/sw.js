const CACHE = "unipool-shell-v2.4.0";
const SHELL = [
  "/",
  "/campus",
  "/people",
  "/circles",
  "/circles/personal",
  "/notifications",
  "/my-trips",
  "/safety",
  "/manifest.webmanifest",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("unipool-shell-") && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => Promise.all([cache.put(url.pathname, copy), cache.put("/", res.clone())]));
      return res;
    }).catch(async () => {
      const exact = await caches.match(url.pathname);
      return exact || await caches.match("/") || Response.error();
    }));
    return;
  }

  event.respondWith(caches.match(req).then((cached) => {
    const fresh = fetch(req).then((res) => { if (res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone())); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});

self.addEventListener("push", (event) => {
  let data = { title: "UniPool", body: "You have a new update.", url: "/" };
  try { if (event.data) data = event.data.json(); } catch {}
  const options = { body: data.body, icon: "/favicon.ico", badge: "/favicon.ico", data: { url: data.url || "/" } };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
    for (const client of windowClients) { if ("focus" in client) { client.navigate(url); return client.focus(); } }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
