/* Number Forest: project-scoped offline shell, illustrations and played voices. */
'use strict';

const VERSION = '0.7.1';
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'number-forest:' + SCOPE.pathname + ':';
const CACHES = Object.freeze({
  shell: PREFIX + VERSION + ':shell',
  art: PREFIX + VERSION + ':art',
  audio: PREFIX + VERSION + ':audio'
});
const SHELL = [
  'index.html',
  'styles/main.css', 'styles/playful.css', 'styles/badges.css', 'styles/formulas.css', 'styles/assessment.css',
  'src/core.js', 'src/assessment.js', 'src/formulas.js', 'src/views.js', 'src/feedback.js', 'src/audio.js',
  'src/effects.js', 'src/badge-art.js', 'src/speech.js',
  'src/home-motion.js', 'src/cache.js', 'src/app.js',
  'assets/voice/manifest.js'
];
const ART = [
  'assets/acorn.svg', 'assets/forest.svg', 'assets/forest-glade.svg',
  'assets/badges/bonds.svg', 'assets/badges/arithmetic.svg',
  'assets/badges/groups.svg', 'assets/badges/sharing.svg',
  'assets/badges/clock.svg', 'assets/badges/reverse.svg',
  'assets/playful/hero.svg', 'assets/playful/bonds.svg',
  'assets/playful/arithmetic.svg', 'assets/playful/groups.svg',
  'assets/playful/sharing.svg', 'assets/playful/clock.svg',
  'assets/playful/buddy.svg', 'assets/playful/buddy-happy.svg',
  'assets/playful/buddy-thinking.svg'
];
const INDEX = new URL('index.html', SCOPE).href;
const SHELL_SET = new Set(SHELL);
const ART_SET = new Set(ART);

function relativePath(url) {
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return null;
  let relative;
  try { relative = decodeURIComponent(url.pathname.slice(SCOPE.pathname.length)); }
  catch (_) { return null; }
  if (relative.split('/').some(part => part === '.local' || part === '.git' || part === '..')) return null;
  return relative;
}

function kindOf(url) {
  const path = relativePath(url);
  if (path === null) return null;
  if (path === '' || path === 'index.html') return 'document';
  if (path === 'version.json') return 'version';
  if (path === 'assets/voice/manifest.js') return 'manifest';
  if (SHELL_SET.has(path)) return 'shell';
  if (ART_SET.has(path)) return 'art';
  if (/^assets\/voice\/[a-zA-Z0-9_./-]+\.(mp3|m4a|aac|ogg|wav|webm)$/i.test(path)) return 'audio';
  return null;
}

function keyOf(url) {
  const key = new URL(url);
  key.hash = '';
  // A deployed HTML version shares its own precache entries. Other versions
  // retain separate keys, so a fresh HTML response cannot receive older JS.
  if (key.searchParams.get('v') === VERSION) key.searchParams.delete('v');
  return key.href;
}

function cacheable(response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return false;
  return !response.url || relativePath(new URL(response.url)) !== null;
}

function audioResponse(response) {
  return cacheable(response) && /^audio\//i.test(response.headers.get('Content-Type') || '');
}

async function remember(cache, key, response) {
  if (!cacheable(response)) return;
  try { await cache.put(key, response.clone()); }
  catch (_) { /* A full storage quota must not interrupt the game or playback. */ }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch every required file before changing the caches. A missing release
    // resource fails installation and leaves the previous active worker intact.
    const entries = await Promise.all([...SHELL, ...ART].map(async path => {
      const url = new URL(path, SCOPE).href;
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!cacheable(response)) throw new Error('Offline asset unavailable: ' + path);
      // Drain a clone now. Holding many unread HTTP/1 response streams until
      // Promise.all settles can exhaust the host connection pool during install.
      await response.clone().arrayBuffer();
      return { path, url, response };
    }));
    const shell = await caches.open(CACHES.shell);
    const art = await caches.open(CACHES.art);
    await Promise.all(entries.map(entry =>
      (ART_SET.has(entry.path) ? art : shell).put(entry.url, entry.response)
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set(Object.values(CACHES));
    await Promise.all((await caches.keys()).filter(name => name.startsWith(PREFIX) && !keep.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHES.shell);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(request, { cache: 'no-store', signal: controller.signal });
    if (cacheable(response)) {
      await remember(cache, key, response);
      return response;
    }
    const saved = await cache.match(key);
    return saved || response;
  } catch (_) {
    const saved = await cache.match(key);
    return saved || new Response('This page is not available offline yet.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } finally { clearTimeout(timeout); }
}

async function staleWhileRevalidate(event, cacheName, key) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(key);
  const fresh = fetch(event.request).then(async response => {
    await remember(cache, key, response);
    return response;
  }).catch(() => null);
  event.waitUntil(fresh.then(() => {}));
  if (saved) return saved;
  return await fresh || new Response('This resource is not available offline yet.', { status: 503 });
}

async function byteRange(response, range) {
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (match && (match[1] || match[2])) {
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = suffix > 0 ? Math.max(0, size - suffix) : size;
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size, 'Accept-Ranges': 'bytes' } });
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(body.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

async function voice(request, key) {
  const cache = await caches.open(CACHES.audio);
  const range = request.headers.get('Range');
  let response = await cache.match(key);
  if (!response) {
    // Safari may request a small range before any full-file request. Fetch the
    // complete file once so later playback and ranges work without a network.
    const headers = new Headers(request.headers);
    headers.delete('Range');
    headers.delete('If-Range');
    try {
      response = await fetch(new Request(request, { headers }));
      if (audioResponse(response)) await remember(cache, key, response);
    } catch (_) {
      return new Response('This voice has not been downloaded yet.', { status: 503 });
    }
  }
  // Never treat a partial upstream response as a complete cached audio file.
  if (range && audioResponse(response)) return byteRange(response, range);
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const kind = kindOf(url);
  if (!kind) return;
  if (kind === 'document') event.respondWith(networkFirst(request, INDEX));
  else if (kind === 'version' || kind === 'manifest') event.respondWith(networkFirst(request, keyOf(url)));
  else if (kind === 'audio') event.respondWith(voice(request, keyOf(url)));
  else event.respondWith(staleWhileRevalidate(event, CACHES[kind], keyOf(url)));
});
