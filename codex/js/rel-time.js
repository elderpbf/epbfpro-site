// codex/js/rel-time.js
// PT-BR time wording from a unix-seconds timestamp, in the two flavours the app needs:
// relTime() for coarse freshness ("há 2 h") and stampTime() for the exact moment
// ("23/06/2026 às 12h26"). Shared by both Fórum surfaces (the Trilha student board and
// the Codex moderation pane) and by the Tarefas card, so the wording stays identical
// wherever a time is shown.

// Coarse buckets only ("agora", "há N min/h/d"); never a precise clock. Pure +
// deterministic via the explicit `now` argument.
export function relTime(createdAt, now = Math.floor(Date.now() / 1000)) {
  const s = Math.max(0, now - (createdAt || 0));
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return 'há ' + m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return 'há ' + h + ' h';
  return 'há ' + Math.floor(h / 24) + ' d';
}

// The exact moment, PT-BR: "23/06/2026 às 12h26" (Élder 2026-07-15: every interaction says
// WHO and WHEN). Built from the Date parts by hand rather than toLocaleString: the format is
// fixed copy the app owns, and toLocaleString hands it to whatever locale data the device
// happens to ship, which is how "12h26" silently becomes "12:26 PM" on someone's phone.
// Renders in the READER's timezone, which is the one they can check against a clock.
export function stampTime(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  if (isNaN(d.getTime())) return '';
  const p = (n) => (n < 10 ? '0' : '') + n;
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' às ' + p(d.getHours()) + 'h' + p(d.getMinutes());
}
