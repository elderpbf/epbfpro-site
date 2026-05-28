'use strict';

// Acceptance tests for js/login-page.js (window.LoginPage).
// Bundle Q. Extracts the inline boot logic from backstage/index.html.
// Contract:
//   - LoginPage.init() decides whether to auto-skip to app or show login screen
//   - Does NOT call BS_GOOGLE.init() at boot (lazy Google policy)
//   - Auto-skips when localStorage.bs_pw_hash present (no sessionStorage flag required)
//   - Auto-skips when BS_GOOGLE.isAuthed() is true (Google connected)
//   - Otherwise shows login screen
//   - LoginPage.bind() attaches click/keydown handlers to existing #login-* elements
//   - Run: node backstage/js/login-page.test.js

const assert = require('node:assert/strict');
const path = require('node:path');
const dom = require('./__test-dom.cjs');

const MODULE_PATH = path.join(__dirname, 'login-page.js');

// ── Stubs ────────────────────────────────────────────────────────────────────

function makeBSGoogle(opts) {
  const o = opts || {};
  const calls = { init: 0, requestToken: [], signOut: 0 };
  const obj = {
    isAuthed: function () { return !!o.authed; },
    init: function () { calls.init++; return Promise.resolve(); },
    requestToken: function (params) {
      calls.requestToken.push(params || {});
      if (o.requestTokenThrows) return Promise.reject(new Error(o.requestTokenThrows));
      return Promise.resolve('fake-google-token');
    },
    signOut: function () { calls.signOut++; },
    getAccessToken: function () { return o.authed ? 'tok' : null; },
    getEmail: function () { return o.email || ''; },
  };
  obj.__calls = calls;
  return obj;
}

function makeCallWorker(responses) {
  const calls = [];
  const fn = async function (params) {
    calls.push(params);
    const r = responses[params.action];
    if (typeof r === 'function') return r(params);
    return r || { ok: true };
  };
  fn.calls = calls;
  return fn;
}

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    _data: data,
  };
}

function makeLoginDOM(doc) {
  // Build the minimal #screen-login / #screen-app pair plus the login form
  // controls so bind() has something to attach to.
  const root = doc.body;
  const html = `
    <div id="screen-login" hidden>
      <button id="login-google-btn"></button>
      <p id="login-error"></p>
      <button id="login-pw-toggle"></button>
      <div id="login-pw-section" hidden>
        <input id="login-pw" type="password">
        <button id="login-btn"></button>
      </div>
    </div>
    <div id="screen-app" hidden></div>
  `;
  root.innerHTML = html;
}

async function flush(n) { for (let i = 0; i < (n || 50); i++) await Promise.resolve(); }

function loadModule(extraGlobals) {
  return dom.loadInVM(MODULE_PATH, { extraGlobals: extraGlobals });
}

// Most tests build a fresh module load with the desired environment. Helper.
function bootEnv(env) {
  const e = env || {};
  const doc = dom.makeDocument();
  makeLoginDOM(doc);
  const ls = e.localStorage || makeStorage();
  const ss = e.sessionStorage || makeStorage();
  const bsGoogle = e.bsGoogle || makeBSGoogle({ authed: false });
  const cw = e.callWorker || makeCallWorker({});
  const hashPw = e.hashPw || (async (pw) => 'hash:' + pw);
  const t = e.t || ((k) => k);

  const extraGlobals = {
    document: doc,
    localStorage: ls,
    sessionStorage: ss,
    BS_GOOGLE: bsGoogle,
    callWorker: cw,
    hashPw: hashPw,
    t: t,
    location: { replace: function (u) { this._replaced = u; }, _replaced: null, pathname: '/backstage/', search: '', hash: '' },
  };
  const { ctx } = dom.loadInVM(MODULE_PATH, { extraGlobals });
  return { ctx, doc, ls, ss, bsGoogle, callWorker: cw, extraGlobals };
}

// ── Test harness ─────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Contract: module shape ───────────────────────────────────────────────────

test('LoginPage is exposed globally with init() and bind()', () => {
  const env = bootEnv();
  assert.ok(env.ctx.LoginPage, 'window.LoginPage must be defined');
  assert.equal(typeof env.ctx.LoginPage.init, 'function', 'init() must be a function');
  assert.equal(typeof env.ctx.LoginPage.bind, 'function', 'bind() must be a function');
});

// ── Contract: lazy Google (the core Q change) ────────────────────────────────

test('init() does NOT call BS_GOOGLE.init() at boot (lazy Google policy)', async () => {
  const bs = makeBSGoogle({ authed: false });
  const env = bootEnv({ bsGoogle: bs });
  await env.ctx.LoginPage.init();
  assert.equal(bs.__calls.init, 0,
    'BS_GOOGLE.init() must not be called at boot; Google is opt-in');
});

test('init() does NOT trigger any GIS network activity when token is absent', async () => {
  const bs = makeBSGoogle({ authed: false });
  const env = bootEnv({ bsGoogle: bs });
  await env.ctx.LoginPage.init();
  assert.equal(bs.__calls.requestToken.length, 0,
    'No silent token request at boot; requestToken is opt-in only');
});

// ── Contract: auto-skip when password hash present ───────────────────────────

test('init() auto-skips to app when localStorage.bs_pw_hash is set (no sessionStorage required)', async () => {
  const ls = makeStorage({ bs_pw_hash: 'persisted-hash' });
  const ss = makeStorage();  // empty sessionStorage
  const env = bootEnv({ localStorage: ls, sessionStorage: ss });
  await env.ctx.LoginPage.init();
  const loginScreen = env.doc.getElementById('screen-login');
  const appScreen = env.doc.getElementById('screen-app');
  assert.ok(loginScreen.hidden, 'login screen must be hidden after auto-skip');
  assert.ok(!appScreen.hidden, 'app screen must be visible after auto-skip');
});

test('init() auto-skips to app when BS_GOOGLE.isAuthed() is true', async () => {
  const bs = makeBSGoogle({ authed: true, email: 'elder@x.com' });
  const env = bootEnv({ bsGoogle: bs });
  await env.ctx.LoginPage.init();
  const loginScreen = env.doc.getElementById('screen-login');
  const appScreen = env.doc.getElementById('screen-app');
  assert.ok(loginScreen.hidden, 'login screen must be hidden when Google is authed');
  assert.ok(!appScreen.hidden, 'app screen must be visible when Google is authed');
});

test('init() shows login screen when neither auth path is present', async () => {
  const env = bootEnv();
  await env.ctx.LoginPage.init();
  const loginScreen = env.doc.getElementById('screen-login');
  const appScreen = env.doc.getElementById('screen-app');
  assert.ok(!loginScreen.hidden, 'login screen must be visible when not authed');
  assert.ok(appScreen.hidden, 'app screen must be hidden when not authed');
});

// ── Contract: password sign-in path ──────────────────────────────────────────

test('bind() wires #login-btn click to validate_auth then stores hash and shows app', async () => {
  const cw = makeCallWorker({ validate_auth: { ok: true } });
  const ls = makeStorage();
  const ss = makeStorage();
  const env = bootEnv({ callWorker: cw, localStorage: ls, sessionStorage: ss });
  env.ctx.LoginPage.bind();
  env.doc.getElementById('login-pw').value = 'mypass';
  dom.click(env.doc.getElementById('login-btn'));
  await flush();
  // validate_auth was called with the hash
  const callArgs = cw.calls.find((c) => c.action === 'validate_auth');
  assert.ok(callArgs, 'validate_auth must be called');
  assert.equal(callArgs.auth_token, 'hash:mypass');
  // Hash persisted to localStorage
  assert.equal(ls.getItem('bs_pw_hash'), 'hash:mypass',
    'bs_pw_hash must persist to localStorage on success');
  // App is shown
  assert.ok(!env.doc.getElementById('screen-app').hidden,
    'app screen must be shown after successful password sign-in');
});

test('password sign-in failure shows error and does NOT persist hash', async () => {
  const cw = makeCallWorker({ validate_auth: { ok: false } });
  const ls = makeStorage();
  const env = bootEnv({ callWorker: cw, localStorage: ls });
  env.ctx.LoginPage.bind();
  env.doc.getElementById('login-pw').value = 'wrong';
  dom.click(env.doc.getElementById('login-btn'));
  await flush();
  assert.equal(ls.getItem('bs_pw_hash'), null,
    'bs_pw_hash must not be set on failed auth');
  assert.ok(env.doc.getElementById('login-error').textContent,
    'error message must be shown');
});

// ── Contract: Google sign-in path (still works, just no longer auto-attempted) ─

test('bind() wires #login-google-btn click to BS_GOOGLE.requestToken({prompt:"consent"})', async () => {
  const bs = makeBSGoogle({ authed: false });
  const env = bootEnv({ bsGoogle: bs });
  env.ctx.LoginPage.bind();
  dom.click(env.doc.getElementById('login-google-btn'));
  await flush();
  assert.equal(bs.__calls.requestToken.length, 1,
    'BS_GOOGLE.requestToken must be called exactly once');
  assert.equal(bs.__calls.requestToken[0].prompt, 'consent',
    'requestToken must be called with prompt:consent for explicit sign-in');
});

test('Google sign-in success shows app screen', async () => {
  const bs = makeBSGoogle({ authed: false });
  const env = bootEnv({ bsGoogle: bs });
  env.ctx.LoginPage.bind();
  dom.click(env.doc.getElementById('login-google-btn'));
  await flush();
  assert.ok(!env.doc.getElementById('screen-app').hidden,
    'app screen must be shown after successful Google sign-in');
});

test('Google sign-in failure shows error message', async () => {
  const bs = makeBSGoogle({ authed: false, requestTokenThrows: 'access_denied' });
  const env = bootEnv({ bsGoogle: bs });
  env.ctx.LoginPage.bind();
  dom.click(env.doc.getElementById('login-google-btn'));
  await flush();
  const err = env.doc.getElementById('login-error');
  assert.ok(err.textContent && err.textContent.length > 0,
    'error message must be shown on Google sign-in failure');
});

// ── Contract: password-section toggle ────────────────────────────────────────

test('clicking #login-pw-toggle reveals the password section', () => {
  const env = bootEnv();
  env.ctx.LoginPage.bind();
  const section = env.doc.getElementById('login-pw-section');
  assert.ok(section.hidden, 'password section starts hidden');
  dom.click(env.doc.getElementById('login-pw-toggle'));
  assert.ok(!section.hidden, 'password section is visible after toggle');
});

// ── Contract: showApp honors bs_auth_return safely ───────────────────────────

test('showApp redirects when sessionStorage.bs_auth_return is set to a same-origin path', async () => {
  const ss = makeStorage({ bs_auth_return: '/backstage/classpulse/' });
  const ls = makeStorage({ bs_pw_hash: 'h' });
  const env = bootEnv({ sessionStorage: ss, localStorage: ls });
  await env.ctx.LoginPage.init();
  await flush();
  assert.equal(env.extraGlobals.location._replaced, '/backstage/classpulse/',
    'showApp must redirect to bs_auth_return');
  assert.equal(ss.getItem('bs_auth_return'), null,
    'bs_auth_return must be cleared after redirect');
});

test('showApp ignores protocol-relative bs_auth_return (open-redirect defense)', async () => {
  const ss = makeStorage({ bs_auth_return: '//evil.com/' });
  const ls = makeStorage({ bs_pw_hash: 'h' });
  const env = bootEnv({ sessionStorage: ss, localStorage: ls });
  await env.ctx.LoginPage.init();
  await flush();
  assert.equal(env.extraGlobals.location._replaced, null,
    'showApp must not honor //evil.com style URLs');
});

// ── Run ──────────────────────────────────────────────────────────────────────

(async function run() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS ' + t.name);
      passed++;
    } catch (e) {
      console.error('FAIL ' + t.name + '\n  ' + (e.message || e));
      failed++;
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
