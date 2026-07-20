// Roteiro facade (track-46 fatia 2): each method maps to the correct Worker
// action string from the frozen contract (manifest/tasks/track-46.md) and passes
// params straight through. callWorker is stubbed to echo the final payload,
// mirroring facade-courses.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

globalThis.callWorker = (payload) => payload;

test('codex-api exports a `roteiro` group with the 4 fatia-2 methods', () => {
  assert.ok(api.roteiro, 'codex-api exports a `roteiro` group');
  for (const m of ['getAula', 'setAula', 'listCourseBases', 'saveCourseBase']) {
    assert.equal(typeof api.roteiro[m], 'function', `roteiro.${m} is a function`);
  }
});

test('roteiro methods map to the exact frozen action strings from the contract', () => {
  const r = api.roteiro;
  const cases = [
    [() => r.getAula({ id: 42 }),                                                  'ct_get_aula_roteiro'],
    [() => r.setAula({ id: 42, roteiro_json: '{"blocos":[]}', roteiro_base_number: 1 }), 'ct_set_aula_roteiro'],
    [() => r.listCourseBases({ course_id: 7 }),                                    'ct_list_course_roteiros'],
    [() => r.saveCourseBase({ course_id: 7, aula_number: 2, roteiro_json: '{"blocos":[]}' }), 'ct_save_course_roteiro'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('getAula/setAula pass id + roteiro fields through unchanged', () => {
  const out = api.roteiro.setAula({ id: 5, roteiro_json: '{"blocos":[]}', roteiro_base_number: null });
  assert.equal(out.id, 5);
  assert.equal(out.roteiro_json, '{"blocos":[]}');
  assert.equal(out.roteiro_base_number, null);
});

test('listCourseBases/saveCourseBase pass course_id + aula_number through unchanged', () => {
  const listOut = api.roteiro.listCourseBases({ course_id: 9 });
  assert.equal(listOut.course_id, 9);
  const saveOut = api.roteiro.saveCourseBase({ course_id: 9, aula_number: 3, roteiro_json: '{"blocos":[]}' });
  assert.equal(saveOut.course_id, 9);
  assert.equal(saveOut.aula_number, 3);
});
