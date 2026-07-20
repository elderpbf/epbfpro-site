// tests/notif-policy.test.mjs
// The notification dismissal-tier policy (js/notif-policy.js).
//
// THE TWO DEFINITIONS, pinned here so they are never blurred again (Élder 2026-07-19):
//   Dispensável ('open') — disappears on its OWN the moment the tray is OPENED.
//   Acionável   ('act')  — leaves ONLY via its × or a click on the notification itself,
//                          and then it goes to the history.
// There is no sub-rule inside 'act': every acionável clears those same two ways. (An earlier
// pass invented a "clears on read" split inside 'act'; it was wrong and these tests exist so
// it cannot come back.)
//
// Right now only ACIONÁVEIS are live (DISPENSAVEIS_ENABLED === false), so dismissalFor answers
// 'act' for everything. The per-type split is preserved in splitTierFor and tested here too,
// so it cannot rot while it is dormant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissalFor, splitTierFor, DISPENSAVEIS_ENABLED, DISMISS_OPEN, DISMISS_ACT } from '../js/notif-policy.js';

const EVERY_KIND = [
  { type: 'comunicado' },
  { type: 'tarefa_feedback' },
  { type: 'tarefa_submission' },
  { type: 'student_pending' },
  { type: 'forum_post', kind: 'new_thread' },
  { type: 'forum_post', kind: 'reply' },
  { type: 'whatever' },
  {},
];

test('the tier tags are distinct string constants', () => {
  assert.equal(DISMISS_OPEN, 'open');
  assert.equal(DISMISS_ACT, 'act');
  assert.notEqual(DISMISS_OPEN, DISMISS_ACT);
});

// The LIVE behaviour: one tier. Nothing may vanish merely because the tray was opened.
test('with Dispensáveis off, EVERY item is acionável', () => {
  assert.equal(DISPENSAVEIS_ENABLED, false);
  for (const role of ['student', 'admin', undefined]) {
    for (const it of EVERY_KIND) {
      assert.equal(dismissalFor(it, role), DISMISS_ACT, `${JSON.stringify(it)} @ ${role}`);
    }
  }
});

// The dormant map, kept alive: this is what comes back the day a glance-only source exists.
test('splitTierFor (dormant): admin — submissions + new threads + pending students are ACT', () => {
  assert.equal(splitTierFor({ type: 'tarefa_submission' }, 'admin'), DISMISS_ACT);
  assert.equal(splitTierFor({ type: 'forum_post', kind: 'new_thread' }, 'admin'), DISMISS_ACT);
  assert.equal(splitTierFor({ type: 'student_pending' }, 'admin'), DISMISS_ACT);   // e-sino
  assert.equal(splitTierFor({ type: 'forum_post', kind: 'reply' }, 'admin'), DISMISS_OPEN);
  assert.equal(splitTierFor({ type: 'whatever' }, 'admin'), DISMISS_OPEN);
});

test('splitTierFor (dormant): student — forum activity is a glance, the teacher reply is ACT', () => {
  assert.equal(splitTierFor({ type: 'forum_post', kind: 'reply', mine: true }, 'student'), DISMISS_OPEN);
  assert.equal(splitTierFor({ type: 'forum_post', kind: 'new_thread' }, 'student'), DISMISS_OPEN);
  assert.equal(splitTierFor({ type: 'tarefa_feedback' }, 'student'), DISMISS_ACT);
  assert.equal(splitTierFor({ type: 'tarefa_feedback' }, 'admin'), DISMISS_OPEN);  // not the teacher's row
});

// A comunicado is a MESSAGE: acionável for whoever receives it, in either mode.
test('splitTierFor (dormant): a comunicado is ACT for every role', () => {
  for (const role of ['student', 'admin', undefined]) {
    assert.equal(splitTierFor({ type: 'comunicado' }, role), DISMISS_ACT, `role ${role}`);
  }
});
