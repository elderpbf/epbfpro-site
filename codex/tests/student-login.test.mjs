// codex/trilha/js/student-login.js — the Trail login flow (RED first).
// The flow controller is pure logic over an injected facade + session, so the
// whole state machine (email -> sent -> verify -> profile/authenticated) is
// unit-tested here; the modal DOM that renders it is verified on staging.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const login = await import('../trilha/js/student-login.js');
const {
  validateEmail, nextStateAfterVerify, gate, createLoginFlow, flowOptsFrom,
  CONTROLLER, CONTROLLER_CNPJ, CONTROLLER_CONTACT,
} = login;

// A fake session backed by a Map (mirrors student-session.js's surface).
function fakeSession() {
  const store = new Map();
  return {
    CONSENT_VERSION: '2026-06-16',
    _store: store,
    getToken: (c, t) => (store.has(c + '/' + t) ? store.get(c + '/' + t) : null),
    setToken: (c, t, tok) => store.set(c + '/' + t, tok),
    clearToken: (c, t) => { store.delete(c + '/' + t); },
    isLoggedIn: (c, t) => store.has(c + '/' + t),
  };
}

// A fake facade that records calls and returns the next canned response.
function fakeApi(responses) {
  const calls = [];
  const queue = { ...responses };
  const make = (name) => async (p) => { calls.push({ name, params: p }); return queue[name]; };
  return {
    calls,
    authRequest: make('authRequest'),
    authVerify: make('authVerify'),
    profileSave: make('profileSave'),
    sessionCheck: make('sessionCheck'),
  };
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

test('validateEmail normalizes valid input and rejects junk', () => {
  assert.equal(validateEmail('  Aluno@Exemplo.COM '), 'aluno@exemplo.com');
  assert.equal(validateEmail('a@b.co'), 'a@b.co');
  assert.equal(validateEmail('no-at-sign'), null);
  assert.equal(validateEmail('a@b'), null);          // no TLD dot
  assert.equal(validateEmail('a b@c.com'), null);    // space in local part
  assert.equal(validateEmail(''), null);
  assert.equal(validateEmail(null), null);
});

test('nextStateAfterVerify routes on ok + needs_profile', () => {
  assert.equal(nextStateAfterVerify({ ok: true, session_token: 'S', needs_profile: true }), 'profile');
  assert.equal(nextStateAfterVerify({ ok: true, session_token: 'S', needs_profile: false }), 'authenticated');
  assert.equal(nextStateAfterVerify({ error: 'token_used' }), 'error');
  assert.equal(nextStateAfterVerify({ ok: true }), 'error');   // missing session_token
  assert.equal(nextStateAfterVerify(null), 'error');
});

test('gate proceeds when logged in, opens login otherwise', () => {
  let proceeded = 0, opened = 0, captured = null;
  gate(true, (cont) => { opened++; captured = cont; }, () => proceeded++);
  assert.equal(proceeded, 1);
  assert.equal(opened, 0);

  proceeded = 0; opened = 0;
  gate(false, (cont) => { opened++; captured = cont; }, () => proceeded++);
  assert.equal(opened, 1);
  assert.equal(proceeded, 0);
  // openLogin receives the proceed continuation, so a successful login can resume.
  captured();
  assert.equal(proceeded, 1);
});

// ── Flow controller ──────────────────────────────────────────────────────────

let api, sess, flow;
beforeEach(() => {
  api = fakeApi({});
  sess = fakeSession();
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
});

test('a fresh flow with no token starts anonymous', () => {
  assert.equal(flow.state, 'anonymous');
  assert.equal(flow.isAuthenticated(), false);
});

test('a flow with an existing token starts authenticated', () => {
  sess.setToken('jfse', 'geral', 'SESS');
  const f = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  assert.equal(f.state, 'authenticated');
  assert.equal(f.isAuthenticated(), true);
});

test('requestLink rejects an invalid email without calling the facade', async () => {
  await flow.requestLink('nope');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'email_invalid');
  assert.equal(api.calls.length, 0);
});

test('requestLink sends a normalized email and moves to sent', async () => {
  api = fakeApi({ authRequest: { ok: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestLink('  Aluno@Exemplo.com ');
  assert.equal(api.calls[0].name, 'authRequest');
  assert.deepEqual(api.calls[0].params, { client_slug: 'jfse', turma_slug: 'geral', email: 'aluno@exemplo.com' });
  assert.equal(flow.state, 'sent');
  assert.equal(flow.error, null);
});

test('requestLink echoes the turma token (k) so the magic link can carry it', async () => {
  api = fakeApi({ authRequest: { ok: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral', k: 'KTOK' });
  await flow.requestLink('aluno@exemplo.com');
  assert.deepEqual(api.calls[0].params, { client_slug: 'jfse', turma_slug: 'geral', email: 'aluno@exemplo.com', k: 'KTOK' });
});

test('requestLink echoes the page origin so the magic link returns to this deployment', async () => {
  api = fakeApi({ authRequest: { ok: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral', k: 'KTOK', origin: 'https://staging.pensoia.com' });
  await flow.requestLink('aluno@exemplo.com');
  assert.deepEqual(api.calls[0].params, {
    client_slug: 'jfse', turma_slug: 'geral', email: 'aluno@exemplo.com', k: 'KTOK', origin: 'https://staging.pensoia.com',
  });
});

test('flowOptsFrom forwards client/turma/k/origin/api/session (guards the modal pass-through)', () => {
  const fakeApiObj = {}, fakeSessObj = {};
  const out = flowOptsFrom(
    { client: 'jfse', turma: 'geral', k: 'KTOK', api: fakeApiObj, session: fakeSessObj, onAuthenticated: () => {} },
    'https://staging.pensoia.com',
  );
  assert.equal(out.client, 'jfse');
  assert.equal(out.turma, 'geral');
  assert.equal(out.k, 'KTOK');               // the field whose drop broke the magic link
  assert.equal(out.origin, 'https://staging.pensoia.com');
  assert.equal(out.api, fakeApiObj);
  assert.equal(out.session, fakeSessObj);
});

test('requestLink captures a dev token when the worker returns one', async () => {
  api = fakeApi({ authRequest: { ok: true, dev_magic_token: 'DEVTOK' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestLink('aluno@exemplo.com');
  assert.equal(flow.devToken, 'DEVTOK');
});

test('requestLink surfaces a worker error and stays on email', async () => {
  api = fakeApi({ authRequest: { error: 'turma_not_found' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestLink('aluno@exemplo.com');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'turma_not_found');
});

test('verify success needing profile stores the token and shows profile', async () => {
  api = fakeApi({ authVerify: { ok: true, session_token: 'SESS', participant_id: 7, needs_profile: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.verify('MAGIC');
  assert.equal(api.calls[0].name, 'authVerify');
  assert.deepEqual(api.calls[0].params, { token: 'MAGIC' });
  assert.equal(sess.getToken('jfse', 'geral'), 'SESS');
  assert.equal(flow.participantId, 7);
  assert.equal(flow.state, 'profile');
});

test('verify success without needing profile goes straight to authenticated', async () => {
  api = fakeApi({ authVerify: { ok: true, session_token: 'SESS2', participant_id: 9, needs_profile: false } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.verify('MAGIC');
  assert.equal(sess.getToken('jfse', 'geral'), 'SESS2');
  assert.equal(flow.state, 'authenticated');
});

test('verify failure goes to error and stores no token', async () => {
  api = fakeApi({ authVerify: { error: 'token_expired' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.verify('MAGIC');
  assert.equal(flow.state, 'error');
  assert.equal(flow.error, 'token_expired');
  assert.equal(sess.getToken('jfse', 'geral'), null);
});

test('saveProfile requires consent before calling the facade', async () => {
  sess.setToken('jfse', 'geral', 'SESS');
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.saveProfile('Maria', false);
  assert.equal(flow.error, 'consent_required');
  assert.equal(api.calls.length, 0);
});

test('saveProfile sends the session token + consent version and authenticates', async () => {
  api = fakeApi({ profileSave: { ok: true } });
  sess.setToken('jfse', 'geral', 'SESS');
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.saveProfile('  Maria Silva ', true);
  assert.equal(api.calls[0].name, 'profileSave');
  assert.deepEqual(api.calls[0].params, {
    session_token: 'SESS',
    display_name: 'Maria Silva',
    consent: true,
    consent_version: '2026-06-16',
  });
  assert.equal(flow.state, 'authenticated');
});

test('saveProfile surfaces a worker error and stays on the profile step', async () => {
  // Reach 'profile' the real way (verify sets the token + the profile state), so
  // the error path's invariant is pinned exactly: a failed save keeps the student
  // on the consent/profile step, never silently flips them to authenticated.
  api = fakeApi({
    authVerify: { ok: true, session_token: 'SESS', participant_id: 1, needs_profile: true },
    profileSave: { error: 'invalid_session' },
  });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.verify('MAGIC');
  assert.equal(flow.state, 'profile');
  await flow.saveProfile('Maria', true);
  assert.equal(flow.error, 'invalid_session');
  assert.equal(flow.state, 'profile');
});

test('logout clears the token and returns to anonymous', () => {
  sess.setToken('jfse', 'geral', 'SESS');
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.logout();
  assert.equal(sess.getToken('jfse', 'geral'), null);
  assert.equal(flow.state, 'anonymous');
});

// ── LGPD controller constants ────────────────────────────────────────────────

test('exports the LGPD controller identity', () => {
  assert.equal(CONTROLLER, 'EPBF Soluções em Tecnologia Ltda');
  assert.equal(CONTROLLER_CNPJ, '65.254.064/0001-64');
  assert.equal(CONTROLLER_CONTACT, 'contato@pensoia.com');
});
