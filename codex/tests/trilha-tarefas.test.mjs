// tests/trilha-tarefas.test.mjs
// Codex Trail · Tarefas tab (track-26 item 2). Unit-tests the DOM-free logic (aula
// grouping/labeling, count label, answer-text extraction) + source-contract assertions
// (self-registers a renderer, reaches the backend only through the facade, routes the new
// tab). The card DOM/click wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aulaLabel, countLabel, sortByAula, anyAulaHasMultiple, statusGroups, answerText, isExpandable } from '../trilha/js/tarefas.js';
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

// The registry writes a PAYLOAD OBJECT, and stringifying it dumped raw JSON on the student's
// own screen (Élder saw {"text":"test"} where his answer should be). Live bug, fixed 2026-07-15.
test('answerText: a text-field payload renders the text, NOT the raw JSON', () => {
  assert.equal(answerText({ answer_json: '{"text":"minha resposta"}' }), 'minha resposta');
});
test('answerText: a plain JSON string still works (open/anonymous path predates the registry)', () => {
  assert.equal(answerText({ answer_json: '"resposta antiga"' }), 'resposta antiga');
});
test('answerText: an unknown payload shape still degrades to JSON rather than blowing up', () => {
  assert.equal(answerText({ answer_json: '{"rating":4}' }), '{"rating":4}');
});

// ── resolveTab knows the tarefas tab ─────────────────────────────────────────
test('resolveTab: #tarefas -> tarefas', () => assert.equal(resolveTab('#tarefas'), 'tarefas'));

// ── isExpandable (multiple deliveries, track-26 item 3) ──────────────────────
// A sent tarefa is normally a dead end. When the teacher opted THIS tarefa into multiple
// deliveries the card must open, so the student can re-read their answer and send another.
test('isExpandable: a sent tarefa stays closed on a single-delivery tarefa', () => {
  assert.equal(isExpandable({ state: 'enviada', allow_multi: false }), false);
});
test('isExpandable: a sent tarefa opens when multiple deliveries are on', () => {
  assert.equal(isExpandable({ state: 'enviada', allow_multi: true }), true);
});
test('isExpandable: a graded tarefa opens either way', () => {
  assert.equal(isExpandable({ state: 'corrigida', allow_multi: false }), true);
  assert.equal(isExpandable({ state: 'corrigida', allow_multi: true }), true);
});
test('isExpandable: an unsent tarefa never expands — that click submits', () => {
  assert.equal(isExpandable({ state: 'a_enviar', allow_multi: true }), false);
});

// ── source contract ─────────────────────────────────────────────────────────
test('the "send another" button is gated on allow_multi, never offered by default', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /if \(tarefa\.allow_multi\) \{[\s\S]*?data-tt-again/, '"enviar outra" only renders when the teacher opted in');
  assert.match(src, /stopPropagation/, 'the button must not toggle the card it sits in');
});

test('tarefas.js self-registers a renderer and uses the facade only', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /registerRenderer\('tarefas'/, 'registers the tarefas renderer');
  assert.match(src, /from '\.\/api\.js'/, 'imports the Trail facade');
  assert.ok(!/callWorker|window\.WORKER_URL/.test(src), 'never calls the worker transport directly');
});
