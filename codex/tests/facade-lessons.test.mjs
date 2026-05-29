// Lessons facade methods map to the FROZEN Worker actions (read from
// classvault.js). Stubbed callWorker echoes the final payload.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

globalThis.callWorker = (payload) => payload;

test('codex-api exposes the lessons + supporting methods', () => {
  assert.equal(typeof api.lessons.getCodexView, 'function', 'lessons.getCodexView');
  assert.equal(typeof api.cohorts.listAllTurmas, 'function', 'cohorts.listAllTurmas');
  assert.equal(typeof api.cp.liveSession, 'function', 'cp.liveSession');
});

test('lessons facade maps to the frozen action strings', () => {
  const cases = [
    [() => api.lessons.getCodexView({ client_slug: 'a', turma_slug: 'b' }), 'cv_get_codex_view'],
    [() => api.cohorts.listAllTurmas(), 'ct_list_all_turmas'],
    [() => api.cp.liveSession(), 'cp_get_live_session'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('getCodexView passes the turma identity through', () => {
  const out = api.lessons.getCodexView({ client_slug: 'acme', turma_slug: 'a' });
  assert.equal(out.action, 'cv_get_codex_view');
  assert.equal(out.client_slug, 'acme');
  assert.equal(out.turma_slug, 'a');
});
