// tests/notif-policy.test.mjs
// The notification dismissal-tier policy (js/notif-policy.js). Pins the ROLE-AWARE split:
// the same feed, the same bell, but a given item can be Acionável for one role and a mere
// glance for the other. Both directions are live now — the admin's 'tarefa_submission'
// (aluno enviou) and the student's 'tarefa_feedback' (professor respondeu) are mirrors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissalFor, DISMISS_OPEN, DISMISS_ACT } from '../js/notif-policy.js';

test('the tier tags are distinct string constants', () => {
  assert.equal(DISMISS_OPEN, 'open');
  assert.equal(DISMISS_ACT, 'act');
  assert.notEqual(DISMISS_OPEN, DISMISS_ACT);
});

test('admin tier split: submissions + new threads + pending students are ACT, replies + others are OPEN', () => {
  assert.equal(dismissalFor({ type: 'tarefa_submission' }, 'admin'), DISMISS_ACT);
  assert.equal(dismissalFor({ type: 'forum_post', kind: 'new_thread' }, 'admin'), DISMISS_ACT);
  assert.equal(dismissalFor({ type: 'student_pending' }, 'admin'), DISMISS_ACT);   // e-sino
  assert.equal(dismissalFor({ type: 'forum_post', kind: 'reply' }, 'admin'), DISMISS_OPEN);
  assert.equal(dismissalFor({ type: 'whatever' }, 'admin'), DISMISS_OPEN);
});

test('student forum activity stays dismiss-on-open (incl. new threads)', () => {
  const items = [
    { type: 'forum_post', kind: 'reply', mine: true },
    { type: 'forum_post', kind: 'new_thread', mine: false },
    { type: 'tarefa_submission' },      // the admin's row: not the student's problem
    { type: 'student_pending' },
    { type: 'whatever' },
    {},
  ];
  for (const role of ['student', undefined]) {
    for (const it of items) {
      assert.equal(dismissalFor(it, role), DISMISS_OPEN, `${JSON.stringify(it)} @ ${role}`);
    }
  }
});

// The mirror of the admin's 'tarefa_submission': the teacher answered/graded MY tarefa, so
// I must go read it. It has to survive bell-open, or the student glances once and it is gone.
test('student tier split: the teacher reply/nota on my tarefa is ACT', () => {
  assert.equal(dismissalFor({ type: 'tarefa_feedback' }, 'student'), DISMISS_ACT);
  assert.equal(dismissalFor({ type: 'tarefa_feedback' }, undefined), DISMISS_OPEN); // role-gated
  assert.equal(dismissalFor({ type: 'tarefa_feedback' }, 'admin'), DISMISS_OPEN);   // not the teacher's row
});
