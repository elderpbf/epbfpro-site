// trilha/sw.js  (served at /trilha/sw.js, scope /trilha/)
// Minimal service worker whose ONLY job is to make the Trilha reliably installable:
// Chrome fires `beforeinstallprompt` only when a service worker with a fetch handler is
// present. It deliberately does NOT cache the app shell, every request goes to the
// network, so a deploy still reaches the student on the next load (matching the no-cache
// _headers model; a caching SW would risk serving a stale trilha). The only offline touch
// is a tiny fallback page for navigations, so opening offline isn't the browser error page.
const OFFLINE_HTML =
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Sem conexão</title></head>' +
  '<body style="font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;' +
  'align-items:center;justify-content:center;background:#0f2f2a;color:#f0fdfa;text-align:center">' +
  '<div style="padding:2rem"><h1 style="margin:0 0 .5rem">Sem conexão</h1>' +
  '<p style="opacity:.8;margin:0">Reabra a trilha quando a internet voltar.</p></div></body></html>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Navigations: network-first with an offline fallback (never a cached shell).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    );
    return;
  }
  // Everything else: no respondWith -> the browser does its normal network fetch (no cache).
});
