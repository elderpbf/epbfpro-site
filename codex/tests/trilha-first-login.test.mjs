// The first login of a student the instructor approved but who has never entered.
//
// THE DEFECT, live for students until 2026-08-11 and found by driving the real flow rather than
// by reading. A participant with consent_at IS NULL is exactly what "approved but never logged in"
// looks like. They type the CORRECT code, the server answers `needs_profile`, student-login.js
// moves the flow to 'profile' — and entrar.js's settle() had no branch for that state, so it fell
// through to a BLANK e-mail form. No error, nothing explained, and the single-use code already
// burnt. Trying again mints a new code every time until the hourly cap turns it into
// `rate_limited`, so a first-time student could be locked out of their own first login without
// ever seeing a message.
//
// The fallback even carried a comment asserting the state could not happen ("needName can't
// happen for an enrolled e-mail"). It could, and it did. That is why these assertions are about
// the STATE MACHINE being total rather than about one screen: the hole was a missing case, and a
// missing case is invisible until somebody stands in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const entrar = read('../trilha/js/entrar.js');
const flow = read('../trilha/js/student-login.js');
const pt = read('../trilha/i18n.js');

test('every state the login flow can reach has a branch on the entry page', () => {
  // The states are read from the flow itself, not from a list kept by hand here: a list would go
  // stale the next time a state is added, which is the failure this test exists to prevent.
  const states = new Set();
  for (const m of flow.matchAll(/(?:this\.state|state)\s*=\s*'([a-zA-Z]+)'/g)) states.add(m[1]);
  for (const m of flow.matchAll(/\?\s*'([a-zA-Z]+)'\s*:\s*'([a-zA-Z]+)'/g)) { states.add(m[1]); states.add(m[2]); }
  assert.ok(states.size >= 5, 'the flow should expose several states, found: ' + [...states].join(','));

  const settle = entrar.slice(entrar.indexOf('function settle()'), entrar.indexOf('function renderForm'));
  // The flow module serves THREE surfaces (this page, the login modal, the wall card), so not
  // every state it can express is reachable here. The ones that are not are listed WITH A REASON,
  // and the list is short on purpose: "it cannot happen" is exactly the claim that was false about
  // 'profile', so each entry has to earn its place.
  const NOT_ON_THIS_PAGE = {
    email: 'the fallback itself: this IS the e-mail form',
    anonymous: 'same, before anything is typed',
    error: 'rendered inline by each step, not as a screen',
    // entrar.js always sends require_enrolled, so the server never answers needs_name here: this
    // page only serves addresses that are already in a turma.
    needName: 'entrar always requests with require_enrolled, so needs_name is never returned',
    verifying: 'transient inside an awaited call; no frame is painted in it',
    hub: 'the multi-turma hub belongs to the modal, this page has its own Continuar banner',
  };
  const needsBranch = [...states].filter((s) => !(s in NOT_ON_THIS_PAGE));
  const missing = needsBranch.filter((s) => settle.indexOf("'" + s + "'") === -1);
  assert.deepEqual(missing, [], 'these states fall through to a blank form with no explanation');
  // And whatever the list above gets wrong is no longer SILENT: the fallback logs an unrecognised
  // state to the debug pill, so the next hole announces itself instead of looking like a reset.
  assert.ok(/unhandled login state/.test(entrar), 'the fallback must report a state it does not know');
});

test('the profile state renders name + consent, not the e-mail form', () => {
  assert.ok(/flow\.state === 'profile'/.test(entrar), 'settle routes the profile state');
  assert.ok(/renderProfileStep/.test(entrar));
  assert.ok(/flow\.saveProfile\(/.test(entrar), 'and it goes through the shared saveProfile');
  assert.ok(/consentNoticeHtml\(\)/.test(entrar),
    'the consent NOTICE is the shared one; two notices that could disagree is not worth having');
});

test('a refused profile says why instead of re-rendering silently', () => {
  assert.ok(/profileErrorText/.test(entrar));
  for (const k of ['login.consent_required', 'login.name_required']) {
    assert.ok(entrar.indexOf(k) !== -1, k + ' must be shown');
    assert.ok(pt.indexOf("'" + k + "'") !== -1, k + ' must exist in the dictionary');
  }
});

test('the locked code gets advice that can actually work', () => {
  // After five wrong guesses the code locks and even the CORRECT one is refused. The generic
  // "try again" was the one thing the student must not do.
  assert.ok(/'too_many_attempts'/.test(entrar), 'the reason is mapped');
  assert.ok(entrar.indexOf('login.too_many_attempts') !== -1);
  assert.ok(pt.indexOf("'login.too_many_attempts'") !== -1);
  const msg = pt.match(/'login\.too_many_attempts':\s*'([^']+)'/);
  assert.ok(msg && /novo código/i.test(msg[1]), 'it must tell them to ask for a NEW code: ' + (msg && msg[1]));
});
