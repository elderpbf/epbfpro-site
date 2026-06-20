// codex/trilha/js/student-session.js
// The Trail's student-identity state. Phase 1: a persistent, per-turma session
// token in localStorage (Elder's call: no forced re-login on the device), the
// magic-link URL token extraction, and the consent version. Pure logic only; the
// login modal DOM lives separately. The session token is opaque, server-revocable,
// and EXPIRES 7 days after it is minted (server-side, SESSION_TTL_SECONDS): a
// revoked/expired token simply fails its next student_session_check and re-logs in.

// Bump when the LGPD consent notice text changes, so saved consent is re-prompted.
export const CONSENT_VERSION = '2026-06-16';

// Master switch for the student-login UI. ON: the access-control model has landed
// (Phase 7 — server-side content gating + a/c/b/d approval + the Alunos admin), so
// the login pill, tarefa gate, inline/upfront gates and the ?lt= return are live.
// All of it is inert PER TURMA until an instructor sets access_gated=1; open turmas
// behave exactly as before (no login UI, anonymous tarefa submit).
export const LOGIN_ENABLED = true;

const PREFIX = 'cdx_student_';

function _key(client, turma) {
  return PREFIX + (client || '') + '_' + (turma || '');
}

function _ls() {
  return (typeof localStorage !== 'undefined') ? localStorage : null;
}

export function getToken(client, turma) {
  const ls = _ls();
  return ls ? ls.getItem(_key(client, turma)) : null;
}

export function setToken(client, turma, token) {
  const ls = _ls();
  if (ls) ls.setItem(_key(client, turma), token);
}

export function clearToken(client, turma) {
  const ls = _ls();
  if (ls) ls.removeItem(_key(client, turma));
}

export function isLoggedIn(client, turma) {
  return !!getToken(client, turma);
}

// Device-presence grant (Phase 7, signal b). Stored per turma, earned when the
// device opens the Trail during an open live session (student_presence_claim) and
// offered to student_auth_verify so an off-window login still auto-approves. The
// grant is server-issued + single-use; this is just where the device keeps it.
const PRESENCE_PREFIX = 'cdx_presence_';

function _pkey(client, turma) {
  return PRESENCE_PREFIX + (client || '') + '_' + (turma || '');
}

export function getPresence(client, turma) {
  const ls = _ls();
  return ls ? ls.getItem(_pkey(client, turma)) : null;
}

export function setPresence(client, turma, token) {
  const ls = _ls();
  if (ls) ls.setItem(_pkey(client, turma), token);
}

export function clearPresence(client, turma) {
  const ls = _ls();
  if (ls) ls.removeItem(_pkey(client, turma));
}

// "Minhas turmas" registry: the turmas this device has signed into, so /trilha can
// list them (the inline hub) and relaunch each WITHOUT re-login. It stores the public
// turma token (k) — the SAME shareable token already in the turma URL, not the secret
// session token — alongside the display names, so a launch link can be rebuilt offline.
const KNOWN_KEY = 'cdx_known_turmas';

export function getKnownTurmas() {
  const ls = _ls();
  if (!ls) return [];
  try {
    const arr = JSON.parse(ls.getItem(KNOWN_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

// Upsert a turma (most-recent-first), keyed by client_slug + turma_slug. Accepts the
// OTP-verify entry shape ({ client_slug, turma_slug, client_name, turma_name, token }).
export function rememberTurma(entry) {
  if (!entry || !entry.client_slug || !entry.turma_slug) return;
  const ls = _ls();
  if (!ls) return;
  const rest = getKnownTurmas().filter((e) => !(e.client_slug === entry.client_slug && e.turma_slug === entry.turma_slug));
  const row = {
    client_slug: entry.client_slug,
    turma_slug: entry.turma_slug,
    client_name: entry.client_name || '',
    turma_name: entry.turma_name || '',
    k: entry.k || entry.token || '',
  };
  try { ls.setItem(KNOWN_KEY, JSON.stringify([row].concat(rest))); } catch (_) {}
}

export function forgetTurma(client, turma) {
  const ls = _ls();
  if (!ls) return;
  const rest = getKnownTurmas().filter((e) => !(e.client_slug === client && e.turma_slug === turma));
  try { ls.setItem(KNOWN_KEY, JSON.stringify(rest)); } catch (_) {}
}

// PURE. The device's known turmas EXCEPT the one currently open — the "trocar de turma"
// list in the student settings box (registry order, most-recent-first).
export function otherKnownTurmas(known, client, turma) {
  return (Array.isArray(known) ? known : []).filter(
    (e) => e && !(e.client_slug === client && e.turma_slug === turma)
  );
}

// Pull the magic-link token (?lt=<token>) out of the entrar URL or a bare query
// string. Returns null when absent.
export function extractMagicToken(input) {
  if (!input) return null;
  const q = input.indexOf('?') !== -1 ? input.slice(input.indexOf('?') + 1) : input;
  const v = new URLSearchParams(q).get('lt');
  return v || null;
}

// Pull the QR enrollment token (?et=<token>) out of the URL or a bare query string.
// The in-class QR carries it; presence is claimed and the frictionless join offered.
// Returns null when absent.
export function extractEnrollToken(input) {
  if (!input) return null;
  const q = input.indexOf('?') !== -1 ? input.slice(input.indexOf('?') + 1) : input;
  const v = new URLSearchParams(q).get('et');
  return v || null;
}
