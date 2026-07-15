// codex/js/notif-bus.js
// The notification feed's client-side bus. ONE place, both bells (Codex topbar + Trilha).
//
// WHY THIS EXISTS (Élder 2026-07-14): the bell used to buy its own Worker request — one on
// mount, plus one on EVERY window focus. A student flipping tabs spent a request per flip,
// and every one of those counts against the account's Workers limit. Worse, it was still
// stale: with the page open and focused, a professor's reply arrived only if you refreshed
// by hand.
//
// So the feed now rides on requests that were ALREADY going out. The transport
// (worker-call.js) tags an outbound call with _notif:1, the dispatcher attaches the feed to
// that same response, and the transport publishes it here. Net: FEWER requests than before
// (the mount call disappears — the page's own turmaView carries it) and FRESHER than before
// (every action refreshes the bell, not just a focus).
//
// The honest limit: this is not push. It is exact-cost-zero freshness whenever the page does
// anything, and no worse than before when it does nothing. Real push would mean polling
// (more requests — the opposite of the ask) or a persistent connection (Durable Objects).
//
// The throttle is here, not in the callers, so BOTH the piggyback and the focus fallback
// share ONE budget: whatever asks first wins the window, and nothing else asks until it
// closes. Pure + injectable clock, so it is unit-tested.

export const ASK_INTERVAL_MS = 45000;

let _latest = null;      // last envelope seen, so a bell created later paints immediately
let _lastAsk = 0;
const _subs = new Set();

// True when the window has elapsed. Callers that act on it MUST markAsked() so a burst of
// parallel calls doesn't each attach a feed (the admin feed sweeps every turma — attaching
// it to a whole page-load fan-out would trade request count for D1 reads, which is not a win).
export function shouldAsk(now = Date.now()) {
  return (now - _lastAsk) >= ASK_INTERVAL_MS;
}

export function markAsked(now = Date.now()) { _lastAsk = now; }

// The transport calls this whenever a response carried an envelope.
export function publish(notif) {
  if (!notif) return;
  _latest = notif;
  for (const cb of _subs) {
    try { cb(notif); } catch (_) { /* one bad subscriber must not break the rest */ }
  }
}

export function latest() { return _latest; }

export function subscribe(cb) {
  if (typeof cb !== 'function') return () => {};
  _subs.add(cb);
  return () => _subs.delete(cb);
}

// Test seam only.
export function _reset() { _latest = null; _lastAsk = 0; _subs.clear(); }
