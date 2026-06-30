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

// Fatia 6: tarefa bank sections + Fatia 7: reveal toggle (rides cohorts.updateTurmaMeta).
test('tarefa-section facade methods map to the new action strings', () => {
  const cases = [
    [() => api.content.listTarefaSections({}), 'ct_list_tarefa_sections'],
    [() => api.content.createTarefaSection({ name: 'X' }), 'ct_create_tarefa_section'],
    [() => api.content.renameTarefaSection({ id: 1, name: 'Y' }), 'ct_rename_tarefa_section'],
    [() => api.content.reorderTarefaSections({ order: [2, 1] }), 'ct_reorder_tarefa_sections'],
    [() => api.content.deleteTarefaSection({ id: 1 }), 'ct_delete_tarefa_section'],
    [() => api.content.setItemSection({ item_id: 1, section_id: 2, position: 0 }), 'ct_set_item_section'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('setItemSection carries item, section, and position through', () => {
  const out = api.content.setItemSection({ item_id: 7, section_id: 3, position: 2 });
  assert.equal(out.action, 'ct_set_item_section');
  assert.equal(out.item_id, 7);
  assert.equal(out.section_id, 3);
  assert.equal(out.position, 2);
});

test('reveal toggle flows through cohorts.updateTurmaMeta (no new action needed)', () => {
  const out = api.cohorts.updateTurmaMeta({ client_slug: 'a', slug: 'b', reveal_on_completion: 1 });
  assert.equal(out.action, 'ct_update_turma_meta');
  assert.equal(out.reveal_on_completion, 1);
});
