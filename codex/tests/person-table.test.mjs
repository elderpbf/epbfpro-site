// cohorts/person-table.js — THE people-table assembly both admin surfaces mount (track-42).
//
// Élder 2026-07-16: "acabamos de fazer todo esse trabalho só para ter mais trabalho para consertar."
// The pieces (list, toolbar, filter, editor) were already shared, but the GLUE was copied — that is
// what let the remove modal and the action gating drift between Usuários and the dossiê. These tests
// pin the two things that must not regress: the ONE gating/apply function (actionTargets), and that
// the paint + selection + toolbar are wired ONCE here, not re-implemented per surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { actionTargets } from '../cohorts/person-table.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const person = (rows) => ({ id: 1, rows });

test('actionTargets fans out only over the rows an action applies to (global scope)', () => {
  const p = person([
    { participant_id: 10, access_status: 'pending', email_verified: 0 },
    { participant_id: 11, access_status: 'approved', email_verified: 1 },
  ]);
  assert.deepEqual(actionTargets(p, 'approve'), [10]);    // only the pending row
  assert.deepEqual(actionTargets(p, 'validate'), [10]);   // only the unvalidated row
  assert.deepEqual(actionTargets(p, 'remove'), [10, 11]); // remove is every row
});

test('unblock touches only denied rows — the split that would have diverged (advisor)', () => {
  // The dossiê used to gate on the row's DOM data-status (all-or-nothing for a multi-row person),
  // the roster on this fan-out. In turma scope a person carries ONE row, so the same function
  // reduces to "does this row match", and the two scopes can no longer disagree.
  const p = person([
    { participant_id: 20, access_status: 'denied', email_verified: 1 },
    { participant_id: 21, access_status: 'approved', email_verified: 1 },
  ]);
  assert.deepEqual(actionTargets(p, 'unblock'), [20]);
  assert.deepEqual(actionTargets({ id: 2, rows: [{ participant_id: 20, access_status: 'denied' }] }, 'unblock'), [20]);
  assert.deepEqual(actionTargets({ id: 2, rows: [{ participant_id: 21, access_status: 'approved' }] }, 'unblock'), []);
});

test('an unknown action targets nothing — no dead toolbar button can act', () => {
  assert.deepEqual(actionTargets(person([{ participant_id: 1, access_status: 'pending' }]), 'nope'), []);
  assert.deepEqual(actionTargets({ id: 1 }, 'approve'), []);   // no rows -> nothing
});

test('the table is THE assembly both surfaces mount — paint + selection wired ONCE', () => {
  const tableJs = read('../cohorts/person-table.js');
  const studentsJs = read('../cohorts/students.js');
  const cohortsJs = read('../cohorts/cohorts.js');
  // The list, toolbar and selection are wired here.
  assert.match(tableJs, /wireSelection\(/);
  assert.match(tableJs, /personListHtml\(/);
  assert.match(tableJs, /toolbarHtml\(/);
  // Neither surface wires them itself any more — they only mount the table and pass parameters.
  for (const src of [studentsJs, cohortsJs]) {
    assert.doesNotMatch(src, /wireSelection\(/);
    assert.doesNotMatch(src, /personListHtml\(/);
    assert.doesNotMatch(src, /toolbarHtml\(/);
    assert.match(src, /createPersonTable\(/);
  }
});
