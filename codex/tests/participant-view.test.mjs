// Pure-logic tests for the dossier "Participantes" list (B+C2). These test the REAL
// decisions the running app makes — gating, status grouping/order, and which bulk
// actions are live for a selection — not a render snapshot. The render + DOM wiring
// live in cohorts.js; the mount itself is guarded by modules.test.mjs Test 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApprovalGated,
  toolbarActions,
  actionEnabled,
  actionTargetStatus,
  ACTION_RULES,
} from '../cohorts/participant-view.js';

test('isApprovalGated: approval only matters with a certificate or restricted access', () => {
  assert.equal(isApprovalGated({ certificates_enabled: 1 }), true, 'certificate gates');
  assert.equal(isApprovalGated({ access_gated: 1 }), true, 'restricted access gates');
  assert.equal(isApprovalGated({ certificates_enabled: 1, access_gated: 1 }), true);
  assert.equal(isApprovalGated({ certificates_enabled: 0, access_gated: 0 }), false, 'open access = no gate');
  assert.equal(isApprovalGated({}), false);
  assert.equal(isApprovalGated(null), false, 'no turma = not gated');
});

test('toolbarActions: gated offers the full set incl. validate; open access offers remove only', () => {
  assert.deepEqual(toolbarActions(true), ['approve', 'validate', 'block', 'unblock', 'remove']);
  assert.deepEqual(toolbarActions(false), ['remove'], 'no approve/block when approval is meaningless');
});

// Each selected row is { status, verified }; string shorthand fills status only
// (verified undefined = not validated), which the status-axis actions don't read.
const rows = (...specs) => specs.map((s) => (typeof s === 'string' ? { status: s } : s));

test('actionEnabled: an action is live only when EVERY selected row permits it', () => {
  // approve: all pending
  assert.equal(actionEnabled('approve', rows('pending', 'pending')), true);
  assert.equal(actionEnabled('approve', rows('pending', 'approved')), false);
  // block: nothing already denied
  assert.equal(actionEnabled('block', rows('pending', 'approved')), true);
  assert.equal(actionEnabled('block', rows('approved', 'denied')), false);
  // unblock: all denied
  assert.equal(actionEnabled('unblock', rows('denied', 'denied')), true);
  assert.equal(actionEnabled('unblock', rows('denied', 'pending')), false);
  // remove: always, given a selection
  assert.equal(actionEnabled('remove', rows('pending', 'approved', 'denied')), true);
  // empty selection: nothing is live
  for (const a of ['approve', 'validate', 'block', 'unblock', 'remove']) {
    assert.equal(actionEnabled(a, []), false, a + ' disabled with no selection');
  }
  // unknown action never enables
  assert.equal(actionEnabled('nope', rows('pending')), false, 'unknown action stays off');
});

test('actionEnabled: validate reads the validation axis ALONE, never approval', () => {
  // Élder, settling it on the track-29/track-28a2 merge (2026-07-15): "validation and approval are
  // different and independent things." track-29 shipped `approved && !verified`; that coupling is
  // gone. A pending person really can be validated — enrolling outside the window validates the
  // e-mail while approval waits — and it grants them nothing, it only decides how long their access
  // will last once approval comes (access.md §Os 3 conceitos).
  assert.equal(actionEnabled('validate', [{ status: 'approved', verified: false }]), true, 'approved + unvalidated');
  assert.equal(actionEnabled('validate', [{ status: 'pending', verified: false }]), true, 'PENDING + unvalidated: the two axes are independent');
  assert.equal(actionEnabled('validate', [{ status: 'denied', verified: false }]), true, 'blocked + unvalidated: still its own axis');
  assert.equal(actionEnabled('validate', [{ status: 'approved', verified: true }]), false, 'already validated');
  assert.equal(actionEnabled('validate', [{ status: 'pending', verified: true }]), false, 'already validated, whatever the approval');
  assert.equal(actionEnabled('validate', [
    { status: 'pending', verified: false },
    { status: 'approved', verified: false },
  ]), true, 'mixed approvals are irrelevant — both still owe the proof');
  assert.equal(actionEnabled('validate', [
    { status: 'approved', verified: false },
    { status: 'approved', verified: true },
  ]), false, 'off if ANY selected row is already validated (it would be a no-op for that one)');
});

test('actionTargetStatus: maps an action to the status it sets (null = no re-status)', () => {
  assert.equal(actionTargetStatus('approve'), 'approved');
  assert.equal(actionTargetStatus('block'), 'denied');
  assert.equal(actionTargetStatus('unblock'), 'pending');
  assert.equal(actionTargetStatus('remove'), null);
  assert.equal(actionTargetStatus('validate'), null, 'validate flips the validation axis, not the status');
});

test('ACTION_RULES: validate is wired (track-29); revoke is still not (no dead buttons)', () => {
  assert.ok('validate' in ACTION_RULES, 'validate access is now wired');
  assert.ok(!('revoke' in ACTION_RULES), 'revoke token is not wired');
});
