// engine/classpulse-discovery.js
// Shared helper for locating an active ClassPulse session.
// Used by tools/classpulse-display-embed and engine/sidebar-integration.

const WORKER_URL = 'https://backstage-api.pensoia.workers.dev';

export async function findHostedSession(preferSlug) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list_sessions' }),
  });
  const data = await res.json();
  const sessions = (data && data.sessions) || [];
  const open = sessions.filter(s => s.status === 'open');
  if (open.length === 0) return null;
  if (preferSlug) {
    const match = open.find(s => s.presentation_slug === preferSlug);
    if (match) return match;
  }
  open.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return open[0];
}

// ---------------------------------------------------------------------------
// Subscriber registry: single shared poller, multiple listeners.
// ---------------------------------------------------------------------------

const _subscribers = new Map();
let _subCounter = 0;
let _pollTimer = null;
let _lastSession = null; // null = no session (initial assumption before first poll)

function _getPreferSlug() {
  for (const { slug } of _subscribers.values()) {
    if (slug) return slug;
  }
  return null;
}

function _notifyAll(session) {
  for (const { callback } of _subscribers.values()) {
    try { callback(session); } catch (_) {}
  }
}

function _schedulePoll(session) {
  if (_subscribers.size === 0) return;
  _pollTimer = setTimeout(_runPoll, session ? 10000 : 30000);
}

async function _runPoll() {
  _pollTimer = null;
  if (_subscribers.size === 0) return;
  try {
    const session = await findHostedSession(_getPreferSlug());
    const changed = _lastSession === null
      ? session !== null
      : session === null || _lastSession.code !== session.code;
    if (changed) {
      _lastSession = session;
      _notifyAll(session);
    }
    _schedulePoll(session);
  } catch (_) {
    _schedulePoll(null);
  }
}

// Subscribe to hosted-session state changes. Returns an unsubscribe function.
// Callback fires immediately with the cached state, then on each state transition.
// A single HTTP poller is shared across all subscribers.
export function subscribeHostedSession(slug, callback) {
  const id = ++_subCounter;
  _subscribers.set(id, { slug, callback });

  // Immediate callback with cached state (null before first poll)
  try { callback(_lastSession); } catch (_) {}

  // Start poller on first subscriber
  if (_subscribers.size === 1 && _pollTimer === null) {
    _pollTimer = setTimeout(_runPoll, 0);
  }

  return function unsubscribe() {
    _subscribers.delete(id);
    if (_subscribers.size === 0 && _pollTimer !== null) {
      clearTimeout(_pollTimer);
      _pollTimer = null;
    }
  };
}
