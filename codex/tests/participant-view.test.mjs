// Pure-logic tests for the dossier "Participantes" list (B+C2). These test the REAL
// decisions the running app makes — gating, status grouping/order, and which bulk
// actions are live for a selection — not a render snapshot. The render + DOM wiring
// live in cohorts.js; the mount itself is guarded by modules.test.mjs Test 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApprovalGated,
  groupParticipantsByStatus,
  sortByName,
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

test('groupParticipantsByStatus: pending→approved→denied, non-empty only, name-sorted', () => {
  const ps = [
    { id: 1, name: 'Zelia', access_status: 'approved' },
    { id: 2, name: 'Bruno', access_status: 'pending' },
    { id: 3, name: 'Ana',   access_status: 'approved' },
    { id: 4, name: 'Caio',  access_status: 'denied' },
    { id: 5, name: 'Alda' }, // no status -> pending
  ];
  const groups = groupParticipantsByStatus(ps);
  assert.deepEqual(groups.map((g) => g.status), ['pending', 'approved', 'denied'], 'section order');
  assert.deepEqual(groups[0].rows.map((p) => p.name), ['Alda', 'Bruno'], 'pending name-sorted (blank status counts as pending)');
  assert.deepEqual(groups[1].rows.map((p) => p.name), ['Ana', 'Zelia'], 'approved name-sorted');
  assert.deepEqual(groups[2].rows.map((p) => p.name), ['Caio']);
});

test('groupParticipantsByStatus: empty sections are dropped', () => {
  const groups = groupParticipantsByStatus([
    { id: 1, name: 'X', access_status: 'approved' },
    { id: 2, name: 'Y', access_status: 'approved' },
  ]);
  assert.deepEqual(groups.map((g) => g.status), ['approved'], 'only the non-empty section survives');
});

test('sortByName: flat name-sorted roster (the non-gated view)', () => {
  const ps = [{ id: 1, name: 'Bia' }, { id: 2, name: 'Ada' }, { id: 3, display_name: 'Caio' }];
  assert.deepEqual(sortByName(ps).map((p) => p.display_name || p.name), ['Ada', 'Bia', 'Caio']);
  // does not mutate the input
  assert.deepEqual(ps.map((p) => p.id), [1, 2, 3], 'input order preserved');
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

test('actionEnabled: validate is live only for approved rows not yet e-mail-validated', () => {
  assert.equal(actionEnabled('validate', [{ status: 'approved', verified: false }]), true, 'approved + unvalidated');
  assert.equal(actionEnabled('validate', [{ status: 'approved', verified: true }]), false, 'already validated');
  assert.equal(actionEnabled('validate', [{ status: 'pending', verified: false }]), false, 'pending is not validatable on this axis');
  assert.equal(actionEnabled('validate', [
    { status: 'approved', verified: false },
    { status: 'approved', verified: true },
  ]), false, 'off if ANY selected row is already validated');
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
