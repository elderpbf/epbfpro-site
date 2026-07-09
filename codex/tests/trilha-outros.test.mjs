// Opção B (Élder 2026-07-09): "Outros materiais" on the public Trail is the 0 sentinel in
// the multi-aula bindings, so an item can live in a real aula AND in Outros at once. This
// pins the shared isOutrosItem predicate (used by both the Outros tab and its tab-count) and
// its back-compat with legacy no-aula releases (no data migration was run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOutrosItem } from '../trilha/js/utils.js';

test('isOutrosItem: 0 sentinel and legacy no-aula both count; real-aula-only does not', () => {
  // Pinned to Outros only ([0]) -> Outros.
  assert.equal(isOutrosItem({ aula_number: null, aula_numbers: [0], set_id: null, type: 'link' }), true);
  // In aula 5 AND Outros ([0,5]) -> STILL Outros (shows in both places).
  assert.equal(isOutrosItem({ aula_number: 5, aula_numbers: [0, 5], set_id: null, type: 'link' }), true);
  // Legacy release with no aula binding at all -> Outros (back-compat, no migration).
  assert.equal(isOutrosItem({ aula_number: null, aula_numbers: [], set_id: null, type: 'link' }), true);
  // Bound to a real aula only ([5]) -> NOT Outros.
  assert.equal(isOutrosItem({ aula_number: 5, aula_numbers: [5], set_id: null, type: 'link' }), false);
});

test('isOutrosItem: apostila (set_id) and tarefas are never Outros, even if unbound', () => {
  assert.equal(isOutrosItem({ aula_number: null, aula_numbers: [0], set_id: 3, type: 'conteudo' }), false, 'apostila item excluded');
  assert.equal(isOutrosItem({ aula_number: null, aula_numbers: [], set_id: null, type: 'tarefa' }), false, 'tarefa excluded');
  assert.equal(isOutrosItem(null), false, 'null is safe');
});
