// codex/trilha/js/student-login.js — the Trail login flow (OTP).
// The flow controller is pure logic over an injected facade + session, so the
// whole state machine (email -> code -> verify -> profile/authenticated, or the
// turma-agnostic hub) is unit-tested here; the renderers that drive it (the wall,
// the modal, the entry page) are thin and verified on staging.
//
// E-mail auth is a 4-letter OTP code (the magic link is retired): requestCode mints
// the code worker-side, verifyCode exchanges (email, code) for a session PER TURMA
// the address belongs to. One verify remembers every turma on this device.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const login = await import('../trilha/js/student-login.js');
const {
  validateEmail, nextStateForTurma, pickTurma, gate, createLoginFlow, flowOptsFrom,
  CONTROLLER, CONTROLLER_CNPJ, CONTROLLER_CONTACT,
} = login;

// A fake session backed by a Map (mirrors student-session.js's surface).
function fakeSession() {
  const store = new Map();
  const remembered = [];
  return {
    CONSENT_VERSION: '2026-06-16',
    _store: store,
    _remembered: remembered,
    getToken: (c, t) => (store.has(c + '/' + t) ? store.get(c + '/' + t) : null),
    setToken: (c, t, tok) => store.set(c + '/' + t, tok),
    clearToken: (c, t) => { store.delete(c + '/' + t); },
    isLoggedIn: (c, t) => store.has(c + '/' + t),
    rememberTurma: (e) => remembered.push(e),
  };
}

// A fake facade that records calls and returns the next canned response.
function fakeApi(responses) {
  const calls = [];
  const queue = { ...responses };
  const make = (name) => async (p) => { calls.push({ name, params: p }); return queue[name]; };
  return {
    calls,
    otpRequest: make('otpRequest'),
    otpVerify: make('otpVerify'),
    profileSave: make('profileSave'),
    sessionCheck: make('sessionCheck'),
    enrollJoin: make('enrollJoin'),
    simpleEnroll: make('simpleEnroll'),
    logout: make('logout'),
  };
}

// One turma entry, the shape student_otp_verify returns per participation.
function turmaEntry(over = {}) {
  return Object.assign({
    client_slug: 'jfse', turma_slug: 'geral', client_name: 'JFSE', turma_name: 'Geral',
    token: 'KTOK', session_token: 'SESS', participant_id: 7, needs_profile: false,
    access: { gated: true, status: 'approved', via: 'roster' },
  }, over);
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

test('nextStateForTurma routes on the bound turma entry', () => {
  assert.equal(nextStateForTurma({ needs_profile: true }), 'profile');
  assert.equal(nextStateForTurma({ needs_profile: false }), 'authenticated');
  assert.equal(nextStateForTurma(null), 'error');     // bound turma absent from the list
});

test('pickTurma finds the matching (client, turma) entry, else null', () => {
  const list = [turmaEntry({ turma_slug: 'a' }), turmaEntry({ turma_slug: 'geral' })];
  assert.equal(pickTurma(list, 'jfse', 'geral').turma_slug, 'geral');
  assert.equal(pickTurma(list, 'jfse', 'nope'), null);
  assert.equal(pickTurma(null, 'jfse', 'geral'), null);
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

test('requestCode rejects an invalid email without calling the facade', async () => {
  await flow.requestCode('nope');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'email_invalid');
  assert.equal(api.calls.length, 0);
});

test('requestCode (bound/wall) sends the turma context so the code is always issued', async () => {
  api = fakeApi({ otpRequest: { ok: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestCode('  Aluno@Exemplo.com ');
  assert.equal(api.calls[0].name, 'otpRequest');
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', client_slug: 'jfse', turma_slug: 'geral' });
  assert.equal(flow.state, 'code');
  assert.equal(flow.email, 'aluno@exemplo.com');
  assert.equal(flow.error, null);
});

test('requestCode (unbound/entry) sets require_enrolled so an un-enrolled e-mail is rejected before any code', async () => {
  api = fakeApi({ otpRequest: { ok: true } });
  flow = createLoginFlow({ api, session: sess }); // no client/turma -> the turma-agnostic /trilha entry
  await flow.requestCode('aluno@exemplo.com');
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', require_enrolled: true });
});

test('requestCode surfaces email_not_enrolled and stays on email (no code step)', async () => {
  api = fakeApi({ otpRequest: { error: 'email_not_enrolled' } });
  flow = createLoginFlow({ api, session: sess }); // entry page
  await flow.requestCode('ninguem@exemplo.com');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'email_not_enrolled');
});

// callWorker (the real transport) THROWS on an { error } response; a bare await would
// hang the "Enviando..." button. The flow must normalize the throw, not reject.
test('requestCode normalizes a THROWN worker error so the UI never hangs', async () => {
  const throwingApi = { otpRequest: async () => { const e = new Error('boom'); e.data = { error: 'email_not_enrolled' }; throw e; } };
  flow = createLoginFlow({ api: throwingApi, session: sess }); // entry page
  await flow.requestCode('ninguem@exemplo.com');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'email_not_enrolled');
});

test('requestCode captures a dev code when the worker returns one (staging)', async () => {
  api = fakeApi({ otpRequest: { ok: true, dev_otp_code: 'WXYZ' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestCode('aluno@exemplo.com');
  assert.equal(flow.devCode, 'WXYZ');
});

test('requestCode surfaces a worker error and stays on email', async () => {
  api = fakeApi({ otpRequest: { error: 'email_required' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestCode('aluno@exemplo.com');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'email_required');
});

// Save-on-submit: the wall passes the typed name so the worker persists the REAL name (not
// the e-mail placeholder) the instant the code is requested.
test('requestCode (bound/wall) forwards the typed name when given', async () => {
  api = fakeApi({ otpRequest: { ok: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.requestCode('aluno@exemplo.com', { name: '  Ana Maria  ' });
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', name: 'Ana Maria', client_slug: 'jfse', turma_slug: 'geral' });
});

// Simple-enroll login (turma flag ON): name + e-mail register + grant access on the spot,
// no code round-trip. Same surface as the wall, so the "Entrar" pill modal reuses it.
test('simpleEnroll registers + stores the session and goes authenticated', async () => {
  api = fakeApi({ simpleEnroll: { ok: true, session_token: 'SS', participant_id: 9, needs_profile: false } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.simpleEnroll('aluno@exemplo.com', 'Ana');
  assert.equal(api.calls[0].name, 'simpleEnroll');
  assert.deepEqual(api.calls[0].params, { client_slug: 'jfse', turma_slug: 'geral', email: 'aluno@exemplo.com', name: 'Ana' });
  assert.equal(sess.getToken('jfse', 'geral'), 'SS');
  assert.equal(flow.participantId, 9);
  assert.equal(flow.state, 'authenticated');
});

test('simpleEnroll needing profile routes to the profile step', async () => {
  api = fakeApi({ simpleEnroll: { ok: true, session_token: 'SS', participant_id: 9, needs_profile: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.simpleEnroll('aluno@exemplo.com', 'Ana');
  assert.equal(flow.state, 'profile');
});

test('simpleEnroll rejects an invalid e-mail without calling the facade', async () => {
  api = fakeApi({ simpleEnroll: { ok: true } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  await flow.simpleEnroll('nope', 'Ana');
  assert.equal(flow.state, 'email');
  assert.equal(flow.error, 'email_invalid');
  assert.equal(api.calls.length, 0);
});

test('verifyCode (bound turma) needing profile stores the session and shows profile', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [turmaEntry({ needs_profile: true })] } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.equal(api.calls[0].name, 'otpVerify');
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', code: 'abcd', client_slug: 'jfse', turma_slug: 'geral' });
  assert.equal(sess.getToken('jfse', 'geral'), 'SESS');
  assert.equal(flow.participantId, 7);
  assert.equal(flow.state, 'profile');
});

test('verifyCode (bound turma) not needing profile goes straight to authenticated', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [turmaEntry({ session_token: 'SESS2', needs_profile: false })] } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.equal(sess.getToken('jfse', 'geral'), 'SESS2');
  assert.equal(flow.state, 'authenticated');
});

test('verifyCode remembers EVERY returned turma on this device (localStorage-first hub)', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [
    turmaEntry({ client_slug: 'jfse', turma_slug: 'geral', session_token: 'S1' }),
    turmaEntry({ client_slug: 'acme', turma_slug: 't2', session_token: 'S2' }),
  ] } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.equal(sess.getToken('jfse', 'geral'), 'S1');
  assert.equal(sess.getToken('acme', 't2'), 'S2');   // a second turma's session is stored too
});

test('verifyCode remembers every returned turma (the /trilha hub registry)', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [
    turmaEntry({ client_slug: 'jfse', turma_slug: 'geral' }),
    turmaEntry({ client_slug: 'acme', turma_slug: 't2' }),
  ] } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.equal(sess._remembered.length, 2);
  assert.equal(sess._remembered[0].turma_slug, 'geral');
  assert.equal(sess._remembered[1].turma_slug, 't2');
});

test('verifyCode unbound (entry page) lands on the hub with the turma list', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [turmaEntry({ turma_slug: 'a' }), turmaEntry({ turma_slug: 'b' })] } });
  flow = createLoginFlow({ api, session: sess });   // no client/turma: turma-agnostic
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', code: 'abcd' });
  assert.equal(flow.state, 'hub');
  assert.equal(flow.turmas.length, 2);
});

test('verifyCode forwards the device-presence grant as presence_token (signal b)', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [turmaEntry()] } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral', presence: 'PGRANT' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', code: 'abcd', client_slug: 'jfse', turma_slug: 'geral', presence_token: 'PGRANT' });
});

// The wall captures ?et= and passes it as enrollToken; verify forwards it as `et` so the
// worker approves via the inscription window (signal a) — entered with the class código
// = approved on sign-up, not pending.
test('verifyCode forwards the enrollment token as et (signal a, inscription window)', async () => {
  api = fakeApi({ otpVerify: { ok: true, turmas: [turmaEntry()] } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral', enrollToken: 'ETOK' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.deepEqual(api.calls[0].params, { email: 'aluno@exemplo.com', code: 'abcd', client_slug: 'jfse', turma_slug: 'geral', et: 'ETOK' });
});

test('verifyCode failure goes back to the code step and stores no token', async () => {
  api = fakeApi({ otpVerify: { error: 'code_expired' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
  assert.equal(flow.state, 'code');
  assert.equal(flow.error, 'code_expired');
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
  api = fakeApi({
    otpVerify: { ok: true, turmas: [turmaEntry({ needs_profile: true })] },
    profileSave: { error: 'invalid_session' },
  });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral' });
  flow.email = 'aluno@exemplo.com';
  await flow.verifyCode('abcd');
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

// ── flowOptsFrom pass-through (guards the renderer -> controller wiring) ───────

test('flowOptsFrom forwards client/turma/k/origin/api/session', () => {
  const fakeApiObj = {}, fakeSessObj = {};
  const out = flowOptsFrom(
    { client: 'jfse', turma: 'geral', k: 'KTOK', api: fakeApiObj, session: fakeSessObj, onAuthenticated: () => {} },
    'https://staging.pensoia.com',
  );
  assert.equal(out.client, 'jfse');
  assert.equal(out.turma, 'geral');
  assert.equal(out.k, 'KTOK');
  assert.equal(out.origin, 'https://staging.pensoia.com');
  assert.equal(out.api, fakeApiObj);
  assert.equal(out.session, fakeSessObj);
});

test('flowOptsFrom forwards the presence grant', () => {
  const out = flowOptsFrom({ client: 'jfse', turma: 'geral', k: 'K', presence: 'PGRANT' }, 'https://staging.pensoia.com');
  assert.equal(out.presence, 'PGRANT');
});

// Direct-access in-class join (opt-in turma, no email round-trip). The worker gates
// it on the turma's direct_access flag; kept until the access-model collapse.
test('flowOptsFrom forwards the enrollToken (direct-access pass-through)', () => {
  const out = flowOptsFrom({ client: 'jfse', turma: 'geral', k: 'K', enrollToken: 'ETOK' }, 'https://staging.pensoia.com');
  assert.equal(out.enrollToken, 'ETOK');
});

test('enrollJoin mints an approved session on a live window and stores the token', async () => {
  api = fakeApi({ enrollJoin: { ok: true, session_token: 'ENSESS', participant_id: 3, needs_profile: false } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral', enrollToken: 'ETOK' });
  await flow.enrollJoin('  Ana@Test.com ', '  Ana  ');
  assert.equal(api.calls[0].name, 'enrollJoin');
  assert.deepEqual(api.calls[0].params, { client_slug: 'jfse', turma_slug: 'geral', et: 'ETOK', email: 'ana@test.com', name: 'Ana' });
  assert.equal(sess.getToken('jfse', 'geral'), 'ENSESS');
  assert.equal(flow.state, 'authenticated');
});

test('enrollJoin surfaces a closed/disabled error and stores no token', async () => {
  api = fakeApi({ enrollJoin: { error: 'direct_access_disabled' } });
  flow = createLoginFlow({ api, session: sess, client: 'jfse', turma: 'geral', enrollToken: 'ETOK' });
  await flow.enrollJoin('ana@test.com');
  assert.equal(flow.error, 'direct_access_disabled');
  assert.equal(sess.getToken('jfse', 'geral'), null);
});

// ── LGPD controller constants ────────────────────────────────────────────────

test('exports the LGPD controller identity', () => {
  assert.equal(CONTROLLER, 'EPBF Soluções em Tecnologia Ltda');
  assert.equal(CONTROLLER_CNPJ, '65.254.064/0001-64');
  assert.equal(CONTROLLER_CONTACT, 'contato@pensoia.com');
});
