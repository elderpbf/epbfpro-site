// codex/js/sp-time.js
// São Paulo wall clock <-> unix seconds, for the fields where Élder types a time that the Worker
// stores as an instant (the class reminder, 2026-10-16). The Worker's side is
// codex-api/src/lib/aula-reminder.js (spInstant): fixed UTC-3, Brazil has had no DST since 2019.
// The BROWSER's own timezone is deliberately ignored, so the form shows the same hour Élder will
// read in the student's e-mail wherever he happens to be.
const SP_OFFSET_SEC = -3 * 3600;

// PURE. Unix seconds -> 'YYYY-MM-DDTHH:MM' (the value of an <input type="datetime-local">), or ''.
export function spInputValue(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date((n + SP_OFFSET_SEC) * 1000).toISOString().slice(0, 16);
}

// PURE. 'YYYY-MM-DDTHH:MM' read as São Paulo -> unix seconds, or null for anything unreadable.
export function spInputToSec(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) - SP_OFFSET_SEC : null;
}
