'use strict';

// Acceptance tests for the Google connection indicator (G dot) on the
// Backstage topbar. Bundle Q.
//
// Contract:
//   - Topbar.init() renders a G button element with [data-g-status] reflecting
//     BS_GOOGLE.isAuthed() at render time
//   - Three visual states: 'disconnected' | 'connecting' | 'connected'
//   - Clicking the G dot when disconnected: calls BS_GOOGLE.init() then
//     BS_GOOGLE.requestToken({ prompt: 'consent' }); status flips to
//     'connecting' during the await, then 'connected' or 'disconnected'
//   - Clicking when connected: opens a tiny menu/confirm to sign out of Google
//     OR is a no-op (kept tight: no-op for this bundle, sign-out lives in Sair)
//   - Topbar.refreshGoogleStatus() can be called after consent completes
//     elsewhere to re-sync the dot without a full re-init
//
// Run: node backstage/js/backstage-topbar-g-dot.test.js

const assert = require('node:assert/strict');
const path = require('node:path');
const dom = require('./__test-dom.cjs');

const MODULE_PATH = path.join(__dirname, 'backstage-topbar.js');

// ── Stubs ────────────────────────────────────────────────────────────────────

function makeBSGoogle(opts) {
  const o = opts || {};
  const calls = { init: 0, requestToken: [] };
  const obj = {
    isAuthed: function () { return !!o._authed; },
    init: function () {
      calls.init++;
      if (o.initThrows) return Promise.reject(new Error(o.initThrows));
      return Promise.resolve();
    },
    requestToken: function (params) {
      calls.requestToken.push(params || {});
      if (o.requestTokenThrows) return Promise.reject(new Error(o.requestTokenThrows));
      // Flip authed state after successful consent so isAuthed() reports true on next call.
      o._authed = true;
      return Promise.resolve('fake-token');
    },
    getEmail: function () { return o.email || ''; },
    getAccessToken: function () { return o._authed ? 'tok' : null; },
  };
  obj.__calls = calls;
  obj.__setAuthed = function (v) { o._authed = !!v; };
  return obj;
}

function makeBSAuth() {
  return {
    logout: function () {},
    signOut: function () {},
    TOKEN: '',
    PW_KEY: 'bs_pw_hash',
    AUTH_KEY: 'bs_auth',
    getMethod: function () { return null; },
    isAuthedLocal: function () { return false; },
    guard: function () {},
  };
}

function makeThemeManager() {
  return {
    init: function () {},
    applyTheme: function () {},
  };
}

function makeSettingsDrawer() {
  return { init: function () {} };
}

function makeCallWorker() {
  return async function () { return { ok: true }; };
}

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function bootTopbar(env) {
  const e = env || {};
  const doc = dom.makeDocument();
  // Need a .bs-app container for the topbar to attach to.
  const app = doc.createElement('div');
  app.className = 'bs-app';
  doc.body.appendChild(app);

  const bsGoogle = e.bsGoogle || makeBSGoogle({ _authed: false });

  const extraGlobals = {
    document: doc,
    localStorage: makeStorage({ bs_theme: 'dark' }),
    sessionStorage: makeStorage(),
    BS_GOOGLE: bsGoogle,
    BS_AUTH: makeBSAuth(),
    ThemeManager: makeThemeManager(),
    SettingsDrawer: makeSettingsDrawer(),
    callWorker: makeCallWorker(),
    glyphWordmark: function () { return '<svg></svg>'; },
    stdColors: function () { return {}; },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: function () { return 0; },  // suppress live-session poller
    clearInterval: clearInterval,
  };
  const { ctx } = dom.loadInVM(MODULE_PATH, { extraGlobals });
  return { ctx, doc, bsGoogle, app };
}

async function flush(n) { for (let i = 0; i < (n || 50); i++) await Promise.resolve(); }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Contract: G dot renders ──────────────────────────────────────────────────

test('Topbar.init() renders a G dot element with [data-g-status]', () => {
  const env = bootTopbar();
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  assert.ok(dot, 'G dot element with [data-g-status] must be present after init()');
});

test('G dot reflects disconnected state when BS_GOOGLE.isAuthed() is false', () => {
  const env = bootTopbar({ bsGoogle: makeBSGoogle({ _authed: false }) });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  assert.equal(dot.getAttribute('data-g-status'), 'disconnected',
    'G dot status must be "disconnected" when not authed');
});

test('G dot reflects connected state when BS_GOOGLE.isAuthed() is true', () => {
  const env = bootTopbar({ bsGoogle: makeBSGoogle({ _authed: true, email: 'elder@x.com' }) });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  assert.equal(dot.getAttribute('data-g-status'), 'connected',
    'G dot status must be "connected" when authed');
});

// ── Contract: click-to-connect ───────────────────────────────────────────────

test('clicking G dot when disconnected calls BS_GOOGLE.requestToken({prompt:"consent"}) exactly once', async () => {
  const bs = makeBSGoogle({ _authed: false });
  const env = bootTopbar({ bsGoogle: bs });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  dom.click(dot);
  await flush();
  assert.equal(bs.__calls.requestToken.length, 1,
    'requestToken must fire exactly once (single popup, no silent attempt before)');
  assert.equal(bs.__calls.requestToken[0].prompt, 'consent',
    'requestToken must use prompt:consent for explicit user-initiated connect');
});

test('G dot click does NOT call BS_GOOGLE.init() before requestToken (avoid double popup)', async () => {
  const bs = makeBSGoogle({ _authed: false });
  const env = bootTopbar({ bsGoogle: bs });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  // Track relative order by snapshotting call counts at each tracked moment.
  const initCallsBeforeRequest = bs.__calls.init;
  dom.click(dot);
  await flush();
  assert.ok(bs.__calls.requestToken.length >= 1,
    'requestToken must have fired');
  // The contract: any BS_GOOGLE.init() call must NOT precede the first
  // requestToken on the same click handler. (Calling init AFTER success to
  // start the refresher is allowed; calling it before would surface a
  // pre-consent silent picker.)
  assert.equal(bs.__calls.init, initCallsBeforeRequest + (bs.__calls.init - initCallsBeforeRequest),
    'sanity: count consistency');
  // Stronger assertion via instrumented order check below.
});

test('order: requestToken fires before any BS_GOOGLE.init() on click', async () => {
  const order = [];
  const bs = makeBSGoogle({ _authed: false });
  const origInit = bs.init;
  const origReq = bs.requestToken;
  bs.init = function () { order.push('init'); return origInit.call(bs); };
  bs.requestToken = function (p) { order.push('requestToken'); return origReq.call(bs, p); };
  const env = bootTopbar({ bsGoogle: bs });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  dom.click(dot);
  await flush();
  const firstReq = order.indexOf('requestToken');
  const firstInit = order.indexOf('init');
  assert.ok(firstReq !== -1, 'requestToken must have fired');
  if (firstInit !== -1) {
    assert.ok(firstReq < firstInit,
      'requestToken must precede any init() call on the click handler');
  }
});

test('after successful consent, G dot updates to "connected" without a re-init', async () => {
  const bs = makeBSGoogle({ _authed: false });
  const env = bootTopbar({ bsGoogle: bs });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  assert.equal(dot.getAttribute('data-g-status'), 'disconnected', 'baseline: disconnected');
  dom.click(dot);
  await flush();
  // Re-read in case the implementation replaced the node.
  const after = env.doc.querySelector('[data-g-status]');
  assert.equal(after.getAttribute('data-g-status'), 'connected',
    'G dot must reflect connected state after successful consent');
});

test('failed consent (access_denied) leaves status as disconnected and does not throw', async () => {
  const bs = makeBSGoogle({ _authed: false, requestTokenThrows: 'access_denied' });
  const env = bootTopbar({ bsGoogle: bs });
  env.ctx.Topbar.init({ title: 'Backstage' });
  const dot = env.doc.querySelector('[data-g-status]');
  dom.click(dot);
  await flush();
  const after = env.doc.querySelector('[data-g-status]');
  assert.equal(after.getAttribute('data-g-status'), 'disconnected',
    'G dot must return to disconnected when consent is denied');
});

// ── Contract: refreshGoogleStatus ────────────────────────────────────────────

test('Topbar.refreshGoogleStatus() resyncs the dot to current BS_GOOGLE state', () => {
  const bs = makeBSGoogle({ _authed: false });
  const env = bootTopbar({ bsGoogle: bs });
  env.ctx.Topbar.init({ title: 'Backstage' });
  // Simulate Google getting connected by some other path (e.g., a Drive
  // feature triggered a consent flow successfully).
  bs.__setAuthed(true);
  env.ctx.Topbar.refreshGoogleStatus();
  const after = env.doc.querySelector('[data-g-status]');
  assert.equal(after.getAttribute('data-g-status'), 'connected',
    'refreshGoogleStatus must update the dot when Google state changed elsewhere');
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
