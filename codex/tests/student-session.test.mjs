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

test('otherKnownTurmas excludes the currently open turma (the trocar-de-turma list)', () => {
  const known = [
    { client_slug: 'jfse', turma_slug: 'geral', turma_name: 'Geral' },
    { client_slug: 'acme', turma_slug: 't2', turma_name: 'Turma 2' },
  ];
  assert.deepEqual(ss.otherKnownTurmas(known, 'jfse', 'geral').map((e) => e.turma_slug), ['t2']);
  assert.deepEqual(ss.otherKnownTurmas(known, 'acme', 't2').map((e) => e.turma_slug), ['geral']);
  assert.deepEqual(ss.otherKnownTurmas(known, 'x', 'y').length, 2);  // none current -> all
  assert.deepEqual(ss.otherKnownTurmas(null, 'x', 'y'), []);
});

test('clearToken logs the student out', () => {
  ss.setToken('jfse', 'geral', 'X');
  ss.clearToken('jfse', 'geral');
  assert.equal(ss.getToken('jfse', 'geral'), null);
  assert.equal(ss.isLoggedIn('jfse', 'geral'), false);
});

test('extractEnrollToken reads et from a query string and a full URL, null when absent', () => {
  assert.equal(ss.extractEnrollToken('?et=QR123'), 'QR123');
  assert.equal(ss.extractEnrollToken('https://pensoia.com/trilha/jfse/geral?k=abc&et=QR9'), 'QR9');
  assert.equal(ss.extractEnrollToken('?k=abc'), null);
  assert.equal(ss.extractEnrollToken(''), null);
  assert.equal(ss.extractEnrollToken(null), null);
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

// Known-turmas registry — powers the /trilha "minhas turmas" hub (relaunch, no re-login).
test('known-turmas registry: empty by default, then upsert + read', () => {
  assert.deepEqual(ss.getKnownTurmas(), []);
  ss.rememberTurma({ client_slug: 'jfse', turma_slug: 'geral', client_name: 'JFSE', turma_name: 'Geral', token: 'KTOK' });
  assert.deepEqual(ss.getKnownTurmas(), [{ client_slug: 'jfse', turma_slug: 'geral', client_name: 'JFSE', turma_name: 'Geral', k: 'KTOK' }]);
});

test('rememberTurma is an upsert (no duplicate, most-recent first, token refreshed)', () => {
  ss.rememberTurma({ client_slug: 'a', turma_slug: 't1', token: 'k1' });
  ss.rememberTurma({ client_slug: 'b', turma_slug: 't2', token: 'k2' });
  ss.rememberTurma({ client_slug: 'a', turma_slug: 't1', token: 'k1b' });
  const list = ss.getKnownTurmas();
  assert.equal(list.length, 2);
  assert.equal(list[0].client_slug, 'a');
  assert.equal(list[0].k, 'k1b');
});

test('rememberTurma ignores entries without client/turma', () => {
  ss.rememberTurma({ client_slug: 'a' });
  ss.rememberTurma(null);
  assert.deepEqual(ss.getKnownTurmas(), []);
});

test('forgetTurma drops one turma (trocar de turma / revoked)', () => {
  ss.rememberTurma({ client_slug: 'a', turma_slug: 't1', token: 'k1' });
  ss.rememberTurma({ client_slug: 'b', turma_slug: 't2', token: 'k2' });
  ss.forgetTurma('a', 't1');
  const list = ss.getKnownTurmas();
  assert.equal(list.length, 1);
  assert.equal(list[0].client_slug, 'b');
});
