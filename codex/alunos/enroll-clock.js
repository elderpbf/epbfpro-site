// codex/alunos/enroll-clock.js
// Pure clock helpers for the QR enrollment countdown. The remaining time is anchored to
// the SERVER expiry plus a measured server/client offset, so it reflects the real window
// even if the admin's clock is skewed, and the card re-validates against the server on a
// cadence so it can never become a silent, drifting client-only timer. Unit-tested; the
// DOM that drives them (alunos.js) is verified on staging.

// Offset (seconds) to add to a client clock to estimate the server clock, measured once
// at fetch from ct_get_enrollment's `now`.
export function clockOffset(serverNow, clientNowSec) {
  return (serverNow || 0) - (clientNowSec || 0);
}

// Seconds left in the window, never negative. clientNowSec is the live local clock; the
// offset corrects it to server time so the countdown matches the authoritative expiry.
export function remainingSec(expiresAt, serverOffset, clientNowSec) {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - (clientNowSec + (serverOffset || 0)));
}

// Compact remaining label for the QR button: 1h34 / 34min / 45s.
export function fmtRemain(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + 'h' + String(m).padStart(2, '0');
  if (m > 0) return m + 'min';
  return s + 's';
}

// The QR's join URL: the trail link carrying the public turma token (k) and the
// enrollment pass (et). Scanning it lands the student on the trail in enroll mode.
export function enrollUrl(origin, client, turma, k, et) {
  const base = origin || 'https://pensoia.com';
  return base + '/trilha/' + client + '/' + turma + '?k=' + encodeURIComponent(k || '') + '&et=' + encodeURIComponent(et || '');
}
