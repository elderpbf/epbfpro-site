// engine/classpulse-discovery.js
// Shared helper for locating an active ClassPulse session.
// Used by tools/classpulse-display-embed and engine/sidebar-integration (4O badge).

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
