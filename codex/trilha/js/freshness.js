// codex/trilha/js/freshness.js
// 5-day NOVO window from ct_releases.released_at (epoch seconds or ISO), shipped
// inline in the turma payload. Pure derivation, no server round-trip; `now` is
// injectable for deterministic tests.
const WINDOW_DAYS = 5;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

function toMs(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v * 1000;
  const ms = Date.parse(v);
  return isFinite(ms) ? ms : 0;
}

export function isFresh(item, now) {
  const ts = toMs(item && item.released_at);
  if (!ts) return false;
  const current = now == null ? Date.now() : now;
  return (current - ts) < WINDOW_MS;
}

export function countFreshIn(items, now) {
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const it of items) if (isFresh(it, now)) n++;
  return n;
}
