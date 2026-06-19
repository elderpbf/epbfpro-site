// codex/js/rel-time.js
// Coarse PT-BR relative time from a unix-seconds timestamp. Shared by both Fórum
// surfaces (the Trilha student board and the Codex moderation pane) so the freshness
// wording stays identical. Buckets only ("agora", "há N min/h/d"); never a precise
// clock. Pure + deterministic via the explicit `now` argument.
export function relTime(createdAt, now = Math.floor(Date.now() / 1000)) {
  const s = Math.max(0, now - (createdAt || 0));
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return 'há ' + m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return 'há ' + h + ' h';
  return 'há ' + Math.floor(h / 24) + ' d';
}
