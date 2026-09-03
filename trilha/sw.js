// trilha/sw.js  (served at /trilha/sw.js, scope /trilha/)
// Two jobs: (1) make the Trilha reliably installable — Chrome fires `beforeinstallprompt`
// only when a service worker with a fetch handler is present; (2) receive Web Push
// (track-44 Etapa B) and turn a push event into a system notification. Neither job caches
// the app shell: every request still goes to the network, so a deploy still reaches the
// student on the next load (matching the no-cache _headers model; a caching SW would risk
// serving a stale trilha). The only offline touch is a tiny fallback page for navigations,
// so opening offline isn't the browser error page.
const OFFLINE_HTML =
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Sem conexão</title></head>' +
  '<body style="font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;' +
  'align-items:center;justify-content:center;background:#0f2f2a;color:#f0fdfa;text-align:center">' +
  '<div style="padding:2rem"><h1 style="margin:0 0 .5rem">Sem conexão</h1>' +
  '<p style="opacity:.8;margin:0 0 1.25rem">Verifique sua internet e tente de novo.</p>' +
  // A BUTTON, because the old page only said "reabra a trilha quando a internet voltar" and left
  // the person with nothing to press. On a phone that means knowing to pull-to-refresh, and this
  // page is what a student sees at the exact moment they are least willing to work it out.
  '<button onclick="location.reload()" style="font:inherit;font-weight:600;padding:.7rem 1.4rem;' +
  'border:0;border-radius:999px;background:#f0fdfa;color:#0f2f2a;cursor:pointer">Tentar de novo</button>' +
  '</div></body></html>';

// ONE retry before declaring the internet gone. A navigation fetch rejects on any transport
// hiccup, and a single one used to put a full-page "Sem conexão" in front of somebody whose
// connection was fine: Élder hit it opening the trilha from an e-mail link, and a plain refresh
// fixed it (2026-09-02). That is the same failure the trail's own loader already rides out
// (trilha/js/page.js fetchTurmaViewResilient, "fail-open, o soluço"), and the service worker was
// the one layer still treating the first failure as final.
//
// Deliberately ONE retry and a short pause: this runs before anything is on screen, so a longer
// ladder would just be a blank tab. Genuinely offline still lands on the page above, one second
// later than it used to.
function navigateWithRetry(req) {
  return fetch(req).catch(() => new Promise((r) => setTimeout(r, 900)).then(() => fetch(req)));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Navigations: network-first with an offline fallback (never a cached shell).
  if (req.mode === 'navigate') {
    event.respondWith(
      navigateWithRetry(req).catch(() => new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    );
    return;
  }
  // Everything else: no respondWith -> the browser does its normal network fetch (no cache).
});

// track-44 Etapa B: push notifications. PAYLOAD CONTRACT (keep in sync with the worker's
// codex-api/src/channels/push.js, which is the only thing that ever sends a push here):
//   { title, body, data: { url } }        (data.url may be null — a broadcast with no
//                                           specific deeplink; the click handler below falls
//                                           back to /trilha/ in that case)
// A malformed/missing payload still shows SOMETHING generic rather than silently dropping
// the push (the OS already woke the app for this event; showing nothing looks like a bug).
const APP_ICON = '/codex/trilha/icons/app-icon-192.png';
// `badge` is NOT `icon`: Android renders the status-bar badge from the ALPHA CHANNEL ALONE,
// tinting whatever is opaque. Passing the full-colour app icon there makes the whole square
// opaque, so the status bar showed a blank white square (Élder, Android, 2026-07-26). This
// one is the monochrome silhouette rasterised from icons/glyph.svg. iOS ignores badge.
const NOTIF_BADGE = '/codex/trilha/icons/notif-badge-96.png';

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }
  const title = payload.title || 'PensoIA';
  const options = {
    body: payload.body || '',
    icon: APP_ICON,
    badge: NOTIF_BADGE,
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an already-open Trilha tab if one exists (navigating it to the deeplink), else open
// a new one. includeUncontrolled matters: a tab opened before this SW activated would
// otherwise be invisible to clients.matchAll().
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/trilha/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/trilha') && 'focus' in client) {
          if (url && 'navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
