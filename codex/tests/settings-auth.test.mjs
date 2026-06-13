// codex/js/settings-auth.js — the AUTH component injected into the Settings
// drawer. Tests the section descriptors and their behavior over a getElementById
// stub + stubbed auth globals: Google connect/disconnect + render states, and the
// password-change flow (validation, the change_password call, the error path).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const byId = new Map();
function makeEl(id) {
  const L = {};
  const e = {
    id: id || '', value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, style: {},
    addEventListener(t2, fn) { (L[t2] = L[t2] || []).push(fn); },
    dispatch(t2, ev) { let r; (L[t2] || []).slice().forEach((fn) => { r = fn.call(e, ev || {}); }); return r; },
    focus() {},
  };
  return e;
}
function reg(id) { const e = makeEl(id); byId.set(id, e); return e; }
globalThis.document = { getElementById: (id) => byId.get(id) || null };
globalThis.setTimeout = () => 0; // the pw success-clear timer: no-op, no lingering timers

const auth = await import('../js/settings-auth.js');

// ── Descriptor shapes ─────────────────────────────────────────────────────────
test('googleSection returns a Conta Google descriptor with init + open hooks', () => {
  const s = auth.googleSection();
  assert.equal(s.id, 'sd-google');
  assert.equal(s.title, 'Conta Google');
  assert.match(s.content, /id="sd-google-action"/);
  assert.match(s.content, /id="sd-google-state"/);
  assert.equal(typeof s.onInit, 'function');
  assert.equal(typeof s.onOpen, 'function');
});

test('passwordSection returns a Segurança descriptor with an init hook', () => {
  const s = auth.passwordSection();
  assert.equal(s.id, 'sd-security');
  assert.equal(s.title, 'Segurança');
  assert.match(s.content, /id="sd-pw-save"/);
  assert.match(s.content, /id="sd-show-pw-form"/);
  assert.equal(typeof s.onInit, 'function');
  assert.equal(s.onOpen, undefined, 'password section has no onOpen');
});

// ── Google account ────────────────────────────────────────────────────────────
test('Google section renders the connected state with the email (escaped)', () => {
  const state = reg('sd-google-state');
  const btn = reg('sd-google-action');
  globalThis.BS_GOOGLE = { isAuthed: () => true, getEmail: () => 'a<b>@x.com' };
  auth.googleSection().onInit();
  assert.match(state.innerHTML, /Conectado/);
  assert.match(state.innerHTML, /a&lt;b&gt;@x\.com/, 'email html-escaped');
  assert.equal(btn.textContent, 'Desconectar');
});

test('Google section renders the disconnected state', () => {
  const state = reg('sd-google-state');
  const btn = reg('sd-google-action');
  globalThis.BS_GOOGLE = { isAuthed: () => false };
  auth.googleSection().onInit();
  assert.match(state.innerHTML, /Não conectado/);
  assert.equal(btn.textContent, 'Conectar Google');
});

test('clicking when connected signs out', () => {
  reg('sd-google-state');
  const btn = reg('sd-google-action');
  let signedOut = false;
  globalThis.BS_GOOGLE = { isAuthed: () => true, getEmail: () => '', signOut: () => { signedOut = true; } };
  auth.googleSection().onInit();
  btn.dispatch('click', {});
  assert.equal(signedOut, true);
});

test('clicking when disconnected requests a token then re-inits', async () => {
  reg('sd-google-state');
  const btn = reg('sd-google-action');
  let tokenReq = null; let inited = false;
  globalThis.BS_GOOGLE = {
    isAuthed: () => false,
    requestToken: async (o) => { tokenReq = o; },
    init: () => { inited = true; },
  };
  auth.googleSection().onInit();
  await btn.dispatch('click', {});
  assert.deepEqual(tokenReq, { prompt: 'consent' });
  assert.equal(inited, true);
});

// ── Password change ───────────────────────────────────────────────────────────
function setupPw() {
  reg('sd-show-pw-form');
  const form = reg('sd-pw-form'); form.hidden = true;
  const cur = reg('sd-pw-current');
  const nw = reg('sd-pw-new');
  const cf = reg('sd-pw-confirm');
  const err = reg('sd-pw-error');
  const save = reg('sd-pw-save');
  auth.passwordSection().onInit();
  return { form, cur, nw, cf, err, save };
}

test('the "Alterar senha" button reveals the form', () => {
  const f = setupPw();
  byId.get('sd-show-pw-form').dispatch('click', {});
  assert.equal(f.form.hidden, false);
});

test('rejects a password shorter than 6 chars without calling the worker', async () => {
  let calls = 0;
  globalThis.callWorker = async () => { calls++; return {}; };
  const f = setupPw();
  f.cur.value = 'old'; f.nw.value = '123'; f.cf.value = '123';
  await f.save.dispatch('click', {});
  assert.equal(f.err.textContent, 'A senha deve ter pelo menos 6 caracteres.');
  assert.equal(calls, 0, 'worker not called');
});

test('rejects mismatched confirmation', async () => {
  let calls = 0;
  globalThis.callWorker = async () => { calls++; return {}; };
  const f = setupPw();
  f.cur.value = 'old'; f.nw.value = 'abcdef'; f.cf.value = 'abcdeX';
  await f.save.dispatch('click', {});
  assert.equal(f.err.textContent, 'As senhas não coincidem.');
  assert.equal(calls, 0);
});

test('happy path hashes both, calls change_password, persists the new hash, clears fields', async () => {
  const sent = [];
  globalThis.callWorker = async (p) => { sent.push(p); return { ok: true }; };
  globalThis.BS_AUTH = { PW_KEY: 'bs_pw_hash' };
  const lsCalls = [];
  globalThis.localStorage = { setItem: (k, v) => lsCalls.push([k, v]), getItem: () => null };
  const f = setupPw();
  f.cur.value = 'old'; f.nw.value = 'secret1'; f.cf.value = 'secret1';
  await f.save.dispatch('click', {});
  // hashPw is the Codex-vendored SHA-256; recompute via the same function.
  const expCur = await auth.hashPw('old');
  const expNew = await auth.hashPw('secret1');
  assert.deepEqual(sent[0], { action: 'change_password', auth_token: expCur, new_hash: expNew });
  assert.match(expCur, /^[0-9a-f]{64}$/, 'auth_token is a SHA-256 hex digest');
  assert.notEqual(expCur, expNew, 'current and new hash differ');
  assert.deepEqual(lsCalls[0], ['bs_pw_hash', expNew]);
  assert.equal(f.cur.value, ''); assert.equal(f.nw.value, ''); assert.equal(f.cf.value, '');
  assert.equal(f.err.textContent, 'Senha alterada com sucesso.');
});

test('falls back to bs_pw_hash when BS_AUTH is absent', async () => {
  globalThis.callWorker = async () => ({ ok: true });
  globalThis.BS_AUTH = undefined;
  const lsCalls = [];
  globalThis.localStorage = { setItem: (k, v) => lsCalls.push([k, v]), getItem: () => null };
  const f = setupPw();
  f.cur.value = 'old'; f.nw.value = 'secret1'; f.cf.value = 'secret1';
  await f.save.dispatch('click', {});
  assert.equal(lsCalls[0][0], 'bs_pw_hash');
});

test('surfaces a wrong-current-password error when the worker rejects', async () => {
  globalThis.callWorker = async () => { throw new Error('401'); };
  globalThis.BS_AUTH = { PW_KEY: 'bs_pw_hash' };
  globalThis.localStorage = { setItem: () => {}, getItem: () => null };
  const f = setupPw();
  f.cur.value = 'wrong'; f.nw.value = 'secret1'; f.cf.value = 'secret1';
  await f.save.dispatch('click', {});
  assert.equal(f.err.textContent, 'Senha atual incorreta.');
});
