// Questions facade group (host/admin plane): each method maps to the correct
// FROZEN Worker action string and passes params straight through. Plus the
// assetUrl() helper that makes codex-api.js the single backend seam (action
// calls AND asset URLs). callWorker is stubbed to echo the final payload so we
// can read back the action.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

// Stub the window global the facade calls. The facade references `callWorker`
// as a bare global, so it resolves to globalThis.callWorker at call time.
globalThis.callWorker = (payload) => payload;

test('questions facade exposes the host/admin methods', () => {
  assert.ok(api.questions, 'codex-api exports a `questions` group');
  const expected = [
    'listSessions', 'createSession', 'closeSession', 'reopenSession',
    'launchQuestion', 'closeQuestion', 'deleteSessionQuestion', 'setVisibility', 'sessionState',
    'listSets', 'getQuestions', 'addQuestion', 'addQuestionsBulk',
    'updateQuestion', 'deleteQuestion', 'updateSet', 'deleteSet',
    'reorder', 'search',
    'toggleQa', 'listStudentQuestions', 'updateStudentQuestion',
    'pinStudentQuestion', 'unpinStudentQuestion', 'promoteStudentQuestion',
    'deleteStudentQuestion',
    'sessionStats', 'globalStats', 'deleteAnswer', 'deleteSession',
  ];
  for (const m of expected) {
    assert.equal(typeof api.questions[m], 'function', `questions.${m} is a function`);
  }
});

test('questions facade maps methods to the frozen action strings', () => {
  const q = api.questions;
  const cases = [
    [() => q.listSessions(),                          'list_sessions'],
    [() => q.createSession({ title: 'T' }),           'create_session'],
    [() => q.closeSession({ code: 'AAAA' }),          'close_session'],
    [() => q.reopenSession({ code: 'AAAA' }),         'reopen_session'],
    [() => q.launchQuestion({ session_code: 'AAAA', text: 'q', options: [] }), 'launch_question'],
    [() => q.closeQuestion({ id: 'q1' }),             'close_question'],
    [() => q.deleteSessionQuestion({ id: 'q1' }),     'delete_session_question'],
    [() => q.setVisibility({ id: 'q1', session_code: 'AAAA', show_results: true }), 'set_question_visibility'],
    [() => q.sessionState({ code: 'AAAA' }),          'get_session_state'],
    [() => q.listSets(),                              'list_question_sets'],
    [() => q.getQuestions({ list_name: 'L' }),        'get_questions'],
    [() => q.addQuestion({ list_name: 'L', question: 'x' }), 'add_question'],
    [() => q.addQuestionsBulk({ list_name: 'L', questions: [] }), 'add_questions_bulk'],
    [() => q.updateQuestion({ list_name: 'L', original_question: 'a', question: 'b' }), 'update_question'],
    [() => q.deleteQuestion({ list_name: 'L', question: 'x' }), 'delete_question'],
    [() => q.updateSet({ original_name: 'a', new_name: 'b' }), 'update_question_set'],
    [() => q.deleteSet({ list_name: 'L' }),           'delete_question_set'],
    [() => q.reorder({ list_name: 'L', ordered_ids: [1] }), 'reorder_questions'],
    [() => q.search({ q: 'ab' }),                     'search_questions'],
    [() => q.toggleQa({ code: 'AAAA', enabled: true }), 'toggle_qa'],
    [() => q.listStudentQuestions({ session_code: 'AAAA' }), 'list_student_questions'],
    [() => q.updateStudentQuestion({ id: 1, status: 'answered' }), 'update_student_question'],
    [() => q.pinStudentQuestion({ id: 1, session_code: 'AAAA' }), 'pin_student_question'],
    [() => q.unpinStudentQuestion({ session_code: 'AAAA' }), 'unpin_student_question'],
    [() => q.promoteStudentQuestion({ session_code: 'AAAA', id: 1 }), 'promote_student_question'],
    [() => q.deleteStudentQuestion({ id: 1 }),        'delete_student_question'],
    [() => q.sessionStats({ code: 'AAAA' }),          'session_stats'],
    [() => q.globalStats({}),                         'global_stats'],
    [() => q.deleteAnswer({ answer_id: 1 }),          'delete_answer'],
    [() => q.deleteSession({ code: 'AAAA' }),         'delete_session'],
    // student plane, kept on the facade for the live banner
    [() => q.activeForCohort({ client_slug: 'c', turma_slug: 't' }), 'cp_get_active_for_turma'],
  ];
  for (const [fn, action] of cases) {
    const out = fn();
    assert.equal(out.action, action, `maps to ${action}`);
  }
});

test('questions facade passes params through unchanged', () => {
  const out = api.questions.launchQuestion({ session_code: 'AAAA', text: 'q', options: ['a', 'b'], type: 'mc' });
  assert.equal(out.action, 'launch_question');
  assert.equal(out.session_code, 'AAAA');
  assert.deepEqual(out.options, ['a', 'b']);
  assert.equal(out.type, 'mc');
});

test('assetUrl mints a backend asset URL through the facade (single seam)', () => {
  globalThis.window = globalThis.window || {};
  globalThis.window.WORKER_URL = 'https://api.example';
  assert.equal(api.assetUrl('/r2/icons/x.png'), 'https://api.example/r2/icons/x.png');
  // tolerant of empty base + empty path
  globalThis.window.WORKER_URL = '';
  assert.equal(api.assetUrl('/r2/x'), '/r2/x');
  assert.equal(api.assetUrl(), '');
});
