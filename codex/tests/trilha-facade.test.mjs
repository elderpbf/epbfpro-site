// codex/trilha/js/api.js — the Trail facade. Every PUBLIC action the Trail
// consumes must map to the correct FROZEN Worker action string and pass params
// straight through. callWorker is stubbed to echo the final payload (same seam
// the admin facade tests use), so we read back the action + params.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.callWorker = (payload) => payload;
const { trail } = await import('../trilha/js/api.js');

test('trail facade exposes every public method', () => {
  const expected = [
    'validateCert', 'turmaView', 'itemPublic', 'submitTarefa',
    'activeForTurma', 'sessionState', 'submitAnswer', 'studentInbox', 'submitStudentQ',
  ];
  for (const m of expected) {
    assert.equal(typeof trail[m], 'function', `trail.${m} is a function`);
  }
});

test('trail facade maps each method to its frozen action string', () => {
  const cases = [
    [() => trail.validateCert({ code: 'X' }),            'cert_validate'],
    [() => trail.turmaView({}),                           'ct_get_turma_view'],
    [() => trail.itemPublic({ item_id: 1 }),             'ct_get_item_public'],
    [() => trail.submitTarefa({ item_id: 1 }),           'ct_submit_tarefa'],
    [() => trail.activeForTurma({}),                      'cp_get_active_for_turma'],
    [() => trail.sessionState({ code: 'ABCD' }),         'get_session_state'],
    [() => trail.submitAnswer({ question_id: 1 }),       'submit_answer'],
    [() => trail.studentInbox({ session_code: 'ABCD' }), 'cp_student_inbox'],
    [() => trail.submitStudentQ({ text: 'oi' }),         'submit_student_question'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('trail facade passes params through unchanged (answer payloads)', () => {
  const idx = trail.submitAnswer({ question_id: 7, session_code: 'AB', student_name: 'Maria', answer_index: 2 });
  assert.equal(idx.action, 'submit_answer');
  assert.equal(idx.question_id, 7);
  assert.equal(idx.answer_index, 2);
  assert.equal(idx.student_name, 'Maria');

  const multi = trail.submitAnswer({ question_id: 7, answer_indices: [0, 3] });
  assert.deepEqual(multi.answer_indices, [0, 3]);

  const val = trail.submitAnswer({ question_id: 7, answer_value: '42' });
  assert.equal(val.answer_value, '42');

  const tarefa = trail.submitTarefa({ item_id: 9, answer_type: 'text', answer_json: '{"text":"x"}' });
  assert.equal(tarefa.action, 'ct_submit_tarefa');
  assert.equal(tarefa.answer_type, 'text');
  assert.equal(tarefa.answer_json, '{"text":"x"}');
});
