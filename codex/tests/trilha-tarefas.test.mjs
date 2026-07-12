// tests/trilha-tarefas.test.mjs
// Codex Trail · Tarefas tab (track-26 item 2). Unit-tests the DOM-free logic (aula
// grouping/labeling, count label, answer-text extraction) + source-contract assertions
// (self-registers a renderer, reaches the backend only through the facade, routes the new
// tab). The card DOM/click wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aulaLabel, countLabel, sortByAula, anyAulaHasMultiple, statusGroups, answerText } from '../trilha/js/tarefas.js';
import { resolveTab } from '../trilha/js/page.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── aulaLabel ────────────────────────────────────────────────────────────────
test('aulaLabel: known aula with a title', () => {
  assert.equal(aulaLabel(3, [{ aula_number: 3, title: 'Recursos' }]), 'Aula 3 · Recursos');
});
test('aulaLabel: known aula number with no title falls back to just the number', () => {
  assert.equal(aulaLabel(2, [{ aula_number: 2, title: '' }]), 'Aula 2');
});
test('aulaLabel: null (unbound) resolves to the "no aula" bucket', () => {
  assert.equal(aulaLabel(null, []), 'Outras tarefas');
});

// ── countLabel (singular/plural) ─────────────────────────────────────────────
test('countLabel: singular', () => assert.equal(countLabel(1), '1 tarefa'));
test('countLabel: plural', () => assert.equal(countLabel(3), '3 tarefas'));

// ── sortByAula (course order ascending, unbound last) ────────────────────────
test('sortByAula: ascending by aula, null (unbound) last', () => {
  const tarefas = [
    { item_id: 1, aula_number: 3 },
    { item_id: 2, aula_number: null },
    { item_id: 3, aula_number: 1 },
    { item_id: 4, aula_number: 2 },
  ];
  assert.deepEqual(sortByAula(tarefas).map((t) => t.item_id), [3, 4, 1, 2]);
});
test('sortByAula: returns a copy, does not mutate the input', () => {
  const tarefas = [{ item_id: 1, aula_number: 2 }, { item_id: 2, aula_number: 1 }];
  const out = sortByAula(tarefas);
  assert.notEqual(out, tarefas);
  assert.equal(tarefas[0].item_id, 1); // original order untouched
});

// ── anyAulaHasMultiple (the flat-vs-sections trigger) ────────────────────────
test('anyAulaHasMultiple: false when every aula has at most one tarefa', () => {
  assert.equal(anyAulaHasMultiple([{ aula_number: 1 }, { aula_number: 2 }, { aula_number: null }]), false);
});
test('anyAulaHasMultiple: true when some aula holds two', () => {
  assert.equal(anyAulaHasMultiple([{ aula_number: 1 }, { aula_number: 1 }, { aula_number: 2 }]), true);
});

// ── statusGroups (pending -> submitted -> reviewed, empty dropped, aula asc) ──
test('statusGroups: orders sections pending, enviada, corrigida and drops empties', () => {
  const tarefas = [
    { item_id: 1, aula_number: 2, state: 'corrigida' },
    { item_id: 2, aula_number: 1, state: 'a_enviar' },
    { item_id: 3, aula_number: 3, state: 'a_enviar' },
  ];
  const groups = statusGroups(tarefas);
  assert.deepEqual(groups.map((g) => g.status), ['a_enviar', 'corrigida']); // no 'enviada' section
  assert.deepEqual(groups[0].tarefas.map((t) => t.item_id), [2, 3]); // pending, aula ascending
});

// ── answerText ────────────────────────────────────────────────────────────────
test('answerText: a JSON string value unwraps to plain text', () => {
  assert.equal(answerText({ answer_json: '"minha resposta"' }), 'minha resposta');
});
test('answerText: a non-string JSON value stringifies', () => {
  assert.equal(answerText({ answer_json: '{"a":1}' }), '{"a":1}');
});
test('answerText: no submission -> empty', () => assert.equal(answerText(null), ''));

// ── resolveTab knows the tarefas tab ─────────────────────────────────────────
test('resolveTab: #tarefas -> tarefas', () => assert.equal(resolveTab('#tarefas'), 'tarefas'));

// ── source contract ─────────────────────────────────────────────────────────
test('tarefas.js self-registers a renderer and uses the facade only', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /registerRenderer\('tarefas'/, 'registers the tarefas renderer');
  assert.match(src, /from '\.\/api\.js'/, 'imports the Trail facade');
  assert.ok(!/callWorker|window\.WORKER_URL/.test(src), 'never calls the worker transport directly');
});
