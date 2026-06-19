// codex/trilha/js/access.js — pure access-mode derivation (Phase 7). These pin the
// mapping from the worker's turma-view `access` block to the Trail UI mode, so the
// DOM handlers stay a thin shell over a tested decision. The branches are tested
// independently of LOGIN_ENABLED (access.js takes no view of the master switch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessState, isContentGated, isWall, gateAction } from '../trilha/js/access.js';

test('non-gated (or absent) -> open', () => {
  assert.equal(accessState(null), 'open');
  assert.equal(accessState(undefined), 'open');
  assert.equal(accessState({ gated: false, mode: 'inline', status: 'approved' }), 'open');
});

test('gated + approved -> approved, regardless of mode', () => {
  assert.equal(accessState({ gated: true, mode: 'inline', status: 'approved' }), 'approved');
  assert.equal(accessState({ gated: true, mode: 'upfront', status: 'approved' }), 'approved');
});

test('gated inline + unapproved -> inline-gated (anonymous or pending)', () => {
  assert.equal(accessState({ gated: true, mode: 'inline', status: 'anonymous' }), 'inline-gated');
  assert.equal(accessState({ gated: true, mode: 'inline', status: 'pending' }), 'inline-gated');
});

test('gated upfront + unapproved -> upfront-gated', () => {
  assert.equal(accessState({ gated: true, mode: 'upfront', status: 'anonymous' }), 'upfront-gated');
  assert.equal(accessState({ gated: true, mode: 'upfront', status: 'pending' }), 'upfront-gated');
});

test('isContentGated: true while gated+unapproved, false once open/approved', () => {
  assert.equal(isContentGated({ gated: true, mode: 'inline', status: 'anonymous' }), true);
  assert.equal(isContentGated({ gated: true, mode: 'upfront', status: 'pending' }), true);
  assert.equal(isContentGated({ gated: true, mode: 'inline', status: 'approved' }), false);
  assert.equal(isContentGated({ gated: false, mode: 'inline', status: 'approved' }), false);
  assert.equal(isContentGated(null), false);
});

test('isWall: only an unapproved upfront turma', () => {
  assert.equal(isWall({ gated: true, mode: 'upfront', status: 'anonymous' }), true);
  assert.equal(isWall({ gated: true, mode: 'inline', status: 'anonymous' }), false);
  assert.equal(isWall({ gated: true, mode: 'upfront', status: 'approved' }), false);
  assert.equal(isWall(null), false);
});

test('gateAction: none when open/approved, login when anonymous, pending when pending', () => {
  assert.equal(gateAction(null), 'none');
  assert.equal(gateAction({ gated: false, status: 'approved' }), 'none');
  assert.equal(gateAction({ gated: true, mode: 'inline', status: 'approved' }), 'none');
  assert.equal(gateAction({ gated: true, mode: 'inline', status: 'anonymous' }), 'login');
  assert.equal(gateAction({ gated: true, mode: 'inline', status: 'pending' }), 'pending');
  assert.equal(gateAction({ gated: true, mode: 'upfront', status: 'pending' }), 'pending');
});
