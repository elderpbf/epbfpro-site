// codex/trilha/js/student-session.js — the Trail's student-identity state (RED).
// Persistent, per-turma session token in localStorage (Elder's call: no forced
// re-login, the token lives until logout or loss), the magic-link URL token
// extraction, and the consent version. Pure logic, tested here by stubbing
// localStorage; the login modal DOM is verified in the browser.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => { store.delete(k); },
};

const ss = await import('../trilha/js/student-session.js');

beforeEach(() => store.clear());

test('stores and reads a per-turma session token', () => {
  assert.equal(ss.isLoggedIn('jfse', 'geral'), false);
  ss.setToken('jfse', 'geral', 'SESS123');
  assert.equal(ss.getToken('jfse', 'geral'), 'SESS123');
  assert.equal(ss.isLoggedIn('jfse', 'geral'), true);
});

test('the session is scoped per turma', () => {
  ss.setToken('jfse', 'turma-a', 'A');
  assert.equal(ss.getToken('jfse', 'turma-a'), 'A');
  assert.equal(ss.getToken('jfse', 'turma-b'), null);
  assert.equal(ss.isLoggedIn('jfse', 'turma-b'), false);
});

test('clearToken logs the student out', () => {
  ss.setToken('jfse', 'geral', 'X');
  ss.clearToken('jfse', 'geral');
  assert.equal(ss.getToken('jfse', 'geral'), null);
  assert.equal(ss.isLoggedIn('jfse', 'geral'), false);
});

test('extractMagicToken reads lt from a bare query string', () => {
  assert.equal(ss.extractMagicToken('?lt=abc123'), 'abc123');
});

test('extractMagicToken reads lt from a full entrar URL', () => {
  assert.equal(ss.extractMagicToken('https://pensoia.com/trilha/jfse/geral/entrar?lt=xyz789&x=1'), 'xyz789');
});

test('extractMagicToken returns null when lt is absent or the input is empty', () => {
  assert.equal(ss.extractMagicToken('?foo=1'), null);
  assert.equal(ss.extractMagicToken(''), null);
  assert.equal(ss.extractMagicToken(null), null);
});

test('CONSENT_VERSION is a stable non-empty string', () => {
  assert.equal(typeof ss.CONSENT_VERSION, 'string');
  assert.ok(ss.CONSENT_VERSION.length > 0);
});

test('stores, reads, and clears a per-turma device-presence grant', () => {
  assert.equal(ss.getPresence('jfse', 'geral'), null);
  ss.setPresence('jfse', 'geral', 'PGRANT');
  assert.equal(ss.getPresence('jfse', 'geral'), 'PGRANT');
  assert.equal(ss.getPresence('jfse', 'outra'), null); // scoped per turma
  ss.clearPresence('jfse', 'geral');
  assert.equal(ss.getPresence('jfse', 'geral'), null);
});

// The access-control model has landed (Phase 7: server-side content gating + a/c/b/d
// approval + the Alunos admin), so the student-login UI is enabled. It stays inert
// per turma until an instructor gates a turma (access_gated=1); open turmas unchanged.
test('LOGIN_ENABLED is on (access-control model shipped)', () => {
  assert.equal(ss.LOGIN_ENABLED, true);
});
