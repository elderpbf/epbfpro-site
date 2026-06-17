// codex/trilha/js/student-session.js
// The Trail's student-identity state. Phase 1: a persistent, per-turma session
// token in localStorage (Elder's call: no forced re-login, the token lives until
// the student logs out or loses it), the magic-link URL token extraction, and the
// consent version. Pure logic only; the login modal DOM lives separately. The
// session token is opaque and server-revocable, so "forever on the client" is
// safe: a revoked token simply fails its next student_session_check.

// Bump when the LGPD consent notice text changes, so saved consent is re-prompted.
export const CONSENT_VERSION = '2026-06-16';

// Master switch for the student-login UI. OFF in production: the Phase-1 magic-link
// login is built but intentionally hidden while the real access-control model
// (server-side content gating + presence/window trust + an approval queue) is
// designed. Flipping this true re-surfaces the header pill, the tarefa gate, and
// the ?lt= return. Do NOT enable before that model lands.
export const LOGIN_ENABLED = false;

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

// Pull the magic-link token (?lt=<token>) out of the entrar URL or a bare query
// string. Returns null when absent.
export function extractMagicToken(input) {
  if (!input) return null;
  const q = input.indexOf('?') !== -1 ? input.slice(input.indexOf('?') + 1) : input;
  const v = new URLSearchParams(q).get('lt');
  return v || null;
}
