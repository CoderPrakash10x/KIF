// Minimal PWA service worker: cache the app shell, never cache API traffic (different origin / /api paths).
const CACHE = 'kif-rms-shell-v1';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(request).then(hit => hit || fetch(request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)); }
    return res;
  })));
});
