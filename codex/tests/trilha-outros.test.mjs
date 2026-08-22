// Opção B (Élder 2026-07-09): "Outros materiais" on the public Trail is the 0 sentinel in
// the multi-aula bindings, so an item can live in a real aula AND in Outros at once. This
// pins the shared isOutrosItem predicate (used by both the Outros tab and its tab-count) and
// its back-compat with legacy no-aula releases (no data migration was run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOutrosItem } from '../trilha/js/utils.js';
import { readFileSync } from 'node:fs';

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

// ── the loose piles are ordered; the sequenced ones are not touched ─────────
// The Trail has two piles of loose material (a lesson's "Outros materiais" and the Outros tab)
// and two SEQUENCES (tarefas by `position`, the apostila by `set_position`). Elder asked for
// A-Z by type then by name on the piles only: *"this doesn't apply to content, the content is
// organised by their own order, it's correct right now"*.
const aulasSrc = readFileSync(new URL('../trilha/js/aulas.js', import.meta.url), 'utf8');
const flatSrc = readFileSync(new URL('../trilha/js/flat.js', import.meta.url), 'utf8');

test('both loose piles order through the SHARED comparator, so they cannot disagree', () => {
  for (const [name, src] of [['aulas.js', aulasSrc], ['flat.js', flatSrc]]) {
    assert.match(src, /import \{ sortByTypeThenTitle \} from '\.\.\/\.\.\/js\/item-list\.js'/, name + ' imports it');
    assert.match(src, /sortByTypeThenTitle\(/, name + ' uses it');
  }
});

test('the lesson pile no longer comes out in release order', () => {
  assert.ok(!/outrosItems[\s\S]{0,200}a\.position/.test(aulasSrc), 'the position sort is gone from the Outros pile');
});

test('the sequences keep their own order: tarefas by position, apostila by set_position', () => {
  assert.match(aulasSrc, /tarefaItems[\s\S]{0,200}\(a\.position \|\| 0\) - \(b\.position \|\| 0\)/, 'tarefas untouched');
  assert.match(aulasSrc, /apostilaItems[\s\S]{0,200}\(a\.set_position \|\| 0\) - \(b\.set_position \|\| 0\)/, 'apostila untouched');
  assert.match(flatSrc, /set_position/, 'the content tab still sorts by set_position');
  assert.ok(!/sortByTypeThenTitle\([^)]*apostila/i.test(flatSrc), 'content is never handed to the A-Z sort');
});
