// tests/trilha-tarefas.test.mjs
// Codex Trail · Tarefas tab (track-26 item 2). Unit-tests the DOM-free logic (aula
// grouping/labeling, count label, answer-text extraction) + source-contract assertions
// (self-registers a renderer, reaches the backend only through the facade, routes the new
// tab). The card DOM/click wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aulaLabel, countLabel, groupByAula, answerText } from '../trilha/js/tarefas.js';
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

// ── groupByAula (most recent aula first, unbound last) ───────────────────────
test('groupByAula: orders aula groups descending, null bucket last', () => {
  const tarefas = [
    { item_id: 1, aula_number: 1 },
    { item_id: 2, aula_number: 3 },
    { item_id: 3, aula_number: null },
    { item_id: 4, aula_number: 2 },
  ];
  const groups = groupByAula(tarefas);
  assert.deepEqual(groups.map((g) => g.aulaNumber), [3, 2, 1, null]);
});
test('groupByAula: keeps every tarefa for its aula group', () => {
  const tarefas = [{ item_id: 1, aula_number: 1 }, { item_id: 2, aula_number: 1 }];
  const groups = groupByAula(tarefas);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].tarefas.length, 2);
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
