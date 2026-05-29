// Tarefas (assignments + submissions) facade methods map to the FROZEN ct_*
// Worker actions (read from ct-admin.js). Stubbed callWorker echoes the payload.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

globalThis.callWorker = (payload) => payload;

test('content facade exposes the tarefa/submission methods', () => {
  for (const m of ['listItemTurmas', 'listSubmissions', 'deleteSubmission']) {
    assert.equal(typeof api.content[m], 'function', `content.${m} is a function`);
  }
});

test('tarefa/submission facade methods map to the frozen action strings', () => {
  const cases = [
    [() => api.content.listItemTurmas({ item_id: 1 }), 'ct_list_item_turmas'],
    [() => api.content.listSubmissions({ item_id: 1, client_slug: 'a', turma_slug: 'b' }), 'ct_list_submissions'],
    [() => api.content.deleteSubmission({ id: 9 }), 'ct_delete_submission'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('listSubmissions passes the item + turma identity through', () => {
  const out = api.content.listSubmissions({ item_id: 5, client_slug: 'acme', turma_slug: 'a' });
  assert.equal(out.action, 'ct_list_submissions');
  assert.equal(out.item_id, 5);
  assert.equal(out.client_slug, 'acme');
  assert.equal(out.turma_slug, 'a');
});
