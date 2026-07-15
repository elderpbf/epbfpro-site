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

// This is THE action list: every surface (turma panel + Alunos roster) renders exactly this, so an
// action added here reaches both. Adding one in only one place is what left "validar" missing.
test('toolbarActions: gated offers the full set (incl. validate); open access offers remove only', () => {
  assert.deepEqual(toolbarActions(true), ['approve', 'block', 'unblock', 'validate', 'remove']);
  assert.deepEqual(toolbarActions(false), ['remove'], 'no approve/validate when approval is meaningless');
});

const r = (status, verified = 0) => ({ status, verified: !!verified });

test('actionEnabled: an action is live only when EVERY selected row permits it', () => {
  // approve: all pending
  assert.equal(actionEnabled('approve', [r('pending'), r('pending')]), true);
  assert.equal(actionEnabled('approve', [r('pending'), r('approved')]), false, 'a mostly-approved selection must not offer Aprovar');
  // block: nothing already denied
  assert.equal(actionEnabled('block', [r('pending'), r('approved')]), true);
  assert.equal(actionEnabled('block', [r('approved'), r('denied')]), false);
  // unblock: all denied
  assert.equal(actionEnabled('unblock', [r('denied'), r('denied')]), true);
  assert.equal(actionEnabled('unblock', [r('denied'), r('pending')]), false);
  // validate: only rows whose e-mail is not confirmed yet
  assert.equal(actionEnabled('validate', [r('approved', 0), r('pending', 0)]), true);
  assert.equal(actionEnabled('validate', [r('approved', 0), r('approved', 1)]), false, 'already-validated in the selection = not offered');
  // remove: always, given a selection
  assert.equal(actionEnabled('remove', [r('pending'), r('approved'), r('denied')]), true);
  // empty selection: nothing is live
  for (const a of ['approve', 'block', 'unblock', 'validate', 'remove']) {
    assert.equal(actionEnabled(a, []), false, a + ' disabled with no selection');
  }
});

test('actionTargetStatus: maps an action to the status it sets (null = does not re-status)', () => {
  assert.equal(actionTargetStatus('approve'), 'approved');
  assert.equal(actionTargetStatus('block'), 'denied');
  assert.equal(actionTargetStatus('unblock'), 'pending');
  assert.equal(actionTargetStatus('remove'), null, 'remove deletes');
  assert.equal(actionTargetStatus('validate'), null, 'validate flips email_verified, not the status');
});

test('ACTION_RULES carries only backend-wired actions (no dead toolbar buttons)', () => {
  assert.ok('validate' in ACTION_RULES, 'validate is wired now (ct_set_email_verified shipped)');
  assert.ok(!('revoke' in ACTION_RULES), 'revoke token is still not wired');
});
