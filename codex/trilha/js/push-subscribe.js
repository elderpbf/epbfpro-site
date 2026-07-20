// codex/trilha/js/push-subscribe.js
// track-44 Etapa B — the student's push SUBSCRIPTION lifecycle: capability detection,
// permission + PushManager.subscribe() (and the reverse, unsubscribe()), all through the
// same dependency-injection style as notif-channels.js's openNotifChannels (fetchPrefs/
// savePref) — the imperative browser calls are injected as callbacks, so this module never
// reaches into ../../js/codex-api.js directly (the facade owns that, per the module contract).
//
// Reused, not reimplemented (per the standing "always build reusable" rule): isStandalone /
// isIosSafari come straight from install-prompt.js, which already carries the iOS/standalone
// detection this module needs for the "Safari only delivers push once installed" reality.
//
// PURE parts are exported and unit-pinned (codex/tests/trilha-push-subscribe.test.mjs):
// urlBase64ToUint8Array, bufferToBase64Url, isPushSupported, pushAvailability. The imperative
// subscribePush/unsubscribePush glue (Notification.requestPermission, ServiceWorkerRegistration,
// PushManager) is browser-only and verified on staging, same precedent as install-prompt.js's
// registerSW/render.
import { isStandalone, isIosSafari } from './install-prompt.js';

// PURE. VAPID public keys travel as a base64url string; PushManager.subscribe() wants raw
// bytes as the applicationServerKey. Standard conversion (RFC 4648 §5 alphabet, padded back
// to a multiple of 4 before atob).
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// PURE. The reverse direction: PushSubscription.getKey('p256dh'/'auth') returns an
// ArrayBuffer; the worker's ct_push_subscribe wants base64url text (the same shape the
// browser itself uses for `endpoint`-adjacent values).
export function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PURE. Does this browser even expose the APIs push needs? (Independent of iOS's extra
// "must be installed" rule, checked separately below.)
export function isPushSupported(win, nav) {
  if (!win || !nav) return false;
  return !!(nav.serviceWorker && win.PushManager && win.Notification);
}

// PURE. { capable, needsInstall } — the ONE predicate notif-channels.js's `pushAvailable` /
// `pushNeedsInstall` opts derive from.
//
// Deliberately NOT "capable only once already subscribed": a disabled cell can never be
// toggled, so gating capability on prior subscription would make the push column permanently
// dead (the only way to subscribe is toggling a cell that toggling requires already having
// done). `capable` reflects the DEVICE, not the current subscription state; the subscribe
// flow itself runs on the first toggle-on (see notif-channels.js's push branch).
//
// iOS Safari is a special case (Apple's actual limit, not a bug to work around): push is
// delivered ONLY when the PWA is installed to the Home Screen. Off Home Screen, the APIs may
// even exist but silently never fire — so it is reported as `needsInstall`, not `capable`,
// and the UI must say so rather than offer a switch that quietly does nothing.
export function pushAvailability(win, nav) {
  win = win || (typeof window !== 'undefined' ? window : undefined);
  nav = nav || (win && win.navigator) || (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!isPushSupported(win, nav)) return { capable: false, needsInstall: false };
  if (isIosSafari(nav) && !isStandalone(win)) return { capable: false, needsInstall: true };
  return { capable: true, needsInstall: false };
}

// Ask permission (if not already granted) and subscribe THIS device, then hand the
// subscription to the caller's `saveSubscription` (the facade call). Idempotent: calling
// this on an already-subscribed device just re-returns/re-saves the same subscription
// (browsers do not mint a second one for the same applicationServerKey), so notif-channels.js
// can call it unconditionally on every push-cell toggle-on.
//   opts.getVapidKey()        -> Promise<{ ok, key }>   (the facade's ct_push_vapid_key call)
//   opts.saveSubscription(s)  -> Promise<{ ok }>         (the facade's ct_push_subscribe call)
// Returns { ok:true } | { ok:false, reason:'unsupported'|'needs_install'|'denied'|'error', detail? }.
export async function subscribePush(opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  const nav = win && win.navigator;
  const avail = pushAvailability(win, nav);
  if (!avail.capable) return { ok: false, reason: avail.needsInstall ? 'needs_install' : 'unsupported' };
  try {
    const vapidRes = await Promise.resolve(opts.getVapidKey && opts.getVapidKey());
    const vapidKey = vapidRes && vapidRes.key;
    if (!vapidKey) return { ok: false, reason: 'error', detail: new Error('vapid_key_unavailable') };

    const permission = win.Notification.permission === 'granted'
      ? 'granted'
      : await win.Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    const reg = await nav.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const p256dh = bufferToBase64Url(sub.getKey('p256dh'));
    const auth = bufferToBase64Url(sub.getKey('auth'));
    const device = String((nav.userAgent || '')).slice(0, 200);

    const saveRes = await Promise.resolve(
      opts.saveSubscription && opts.saveSubscription({ endpoint: sub.endpoint, p256dh, auth, device })
    );
    if (saveRes && saveRes.ok === false) {
      return { ok: false, reason: 'error', detail: new Error(saveRes.error || 'save_failed') };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', detail: e };
  }
}

// Does THIS device already hold a live PushSubscription? Read-only, no permission prompt.
// notif-channels.js uses this to decide what the push cells should DISPLAY (see its
// displayPrefs): a stored pref of push:true (comunicado's default) must never render as a
// checked, enabled cell before this device has actually subscribed — that would be a switch
// that shows ON while delivering nothing, exactly what this module exists to prevent.
export async function isSubscribed(opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  try {
    if (!win || !win.navigator || !win.navigator.serviceWorker) return false;
    const reg = await win.navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (_) {
    return false; // undecidable reads as "not subscribed" -- the safe (never-lie) default
  }
}

// The reverse: unsubscribe THIS device (browser-level PushSubscription.unsubscribe()) and
// tell the worker to drop the row (opts.removeSubscription, the facade's ct_push_unsubscribe
// call). A device that was never subscribed is a clean no-op ({ ok:true }), matching the
// worker action's own idempotence.
export async function unsubscribePush(opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  try {
    const reg = await win.navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await Promise.resolve(opts.removeSubscription && opts.removeSubscription({ endpoint }));
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e };
  }
}
