// Releases + apostila-set facade methods map to the FROZEN ct_* Worker actions
// (read from ct-admin.js). Stubbed callWorker echoes the final payload.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

globalThis.callWorker = (payload) => payload;

test('releases group exposes release/unrelease/setAula/turmaView', () => {
  assert.ok(api.releases, 'codex-api exports a `releases` group');
  for (const m of ['release', 'unrelease', 'setAula', 'turmaView']) {
    assert.equal(typeof api.releases[m], 'function', `releases.${m} is a function`);
  }
});

test('releases + set facade methods map to the frozen action strings', () => {
  const cases = [
    [() => api.releases.release({ item_id: 1 }),   'ct_release_item'],
    [() => api.releases.unrelease({ item_id: 1 }), 'ct_unrelease_item'],
    [() => api.releases.setAula({ item_id: 1, aula_number_or_null: 2 }), 'ct_set_release_aula'],
    [() => api.releases.turmaView({ token: 'x' }), 'ct_get_turma_view'],
    [() => api.content.listSets(),                 'ct_list_sets'],
    [() => api.content.getSet({ id: 7 }),          'ct_get_set'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('turmaView passes the turma identity + token through', () => {
  const out = api.releases.turmaView({ client_slug: 'acme', turma_slug: 'a', token: 'tok' });
  assert.equal(out.action, 'ct_get_turma_view');
  assert.equal(out.client_slug, 'acme');
  assert.equal(out.turma_slug, 'a');
  assert.equal(out.token, 'tok');
});
