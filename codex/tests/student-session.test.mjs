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

// Tripwire: the Phase-1 login UI is intentionally hidden until the real
// access-control model lands. If someone flips this, the failure is the reminder
// to read the Trail access-control plan before shipping login to production.
test('LOGIN_ENABLED is off (login UI hidden pending the access-control redesign)', () => {
  assert.equal(ss.LOGIN_ENABLED, false);
});
