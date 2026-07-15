// tests/trilha-tarefas.test.mjs
// Codex Trail · Tarefas tab (track-26 item 2). Unit-tests the DOM-free logic (aula
// grouping/labeling, count label, answer-text extraction) + source-contract assertions
// (self-registers a renderer, reaches the backend only through the facade, routes the new
// tab). The card DOM/click wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aulaLabel, countLabel, sortByAula, anyAulaHasMultiple, statusGroups, answerText, isExpandable, tarefaKind, canSend, deliveries } from '../trilha/js/tarefas.js';
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

// ── tarefaKind / canSend / isExpandable (semantica do Élder, 2026-07-15) ─────
// A tag descreve O QUE O ALUNO FEZ, e so isso. A fala do professor e MENSAGEM, nao estado da
// entrega: foi misturar as duas que tornou "Corrigida"/"Respondida" impossivel de nomear
// ("respondida por quem?").
const feita = (extra) => Object.assign({ item_id: 1, submissions: [{ answer_json: '"x"' }] }, extra || {});

test('tarefaKind: sem envio -> nao_respondida', () => {
  assert.equal(tarefaKind({ item_id: 1, submissions: [] }), 'nao_respondida');
});
test('tarefaKind: enviou e o professor fechou -> respondida', () => {
  assert.equal(tarefaKind(feita({ allow_multi: false })), 'respondida');
});
test('tarefaKind: enviou e pode de novo -> de_novo', () => {
  assert.equal(tarefaKind(feita({ allow_multi: true })), 'de_novo');
});
test('tarefaKind: a MENSAGEM do professor NAO mexe na tag da entrega', () => {
  assert.equal(tarefaKind(feita({ allow_multi: false, has_instructor_message: true })), 'respondida');
  assert.equal(tarefaKind(feita({ allow_multi: true, has_instructor_message: true })), 'de_novo');
});

test('canSend: da pra enviar quando falta responder ou quando pode de novo', () => {
  assert.equal(canSend({ item_id: 1, submissions: [] }), true);        // primeira resposta
  assert.equal(canSend(feita({ allow_multi: true })), true);           // responder de novo
  assert.equal(canSend(feita({ allow_multi: false })), false);         // fechada
});

// O cartao entregue SEMPRE abre. Amarrar isso ao allow_multi (como ficou por um momento)
// escondia a propria resposta do professor assim que ele fechava a tarefa: o avesso do certo.
test('isExpandable: qualquer tarefa entregue abre, mesmo sem multipla entrega', () => {
  assert.equal(isExpandable(feita({ allow_multi: false })), true);
});
test('isExpandable: entregue com multipla entrega tambem abre', () => {
  assert.equal(isExpandable(feita({ allow_multi: true })), true);
});
test('isExpandable: sem entrega nao abre (nao ha o que ler)', () => {
  assert.equal(isExpandable({ item_id: 1, submissions: [] }), false);
});

// A aba tem que renderizar certo mesmo contra um Worker que ainda nao foi promovido.
test('deliveries: cai pro `submission` singular quando o worker e antigo', () => {
  assert.deepEqual(deliveries({ submission: { answer_json: '"a"' } }), [{ answer_json: '"a"' }]);
  assert.deepEqual(deliveries({ submissions: [], submission: null }), []);
});
test('deliveries: prefere a lista quando o worker manda', () => {
  assert.equal(deliveries({ submissions: [{ answer_json: '"n"' }, { answer_json: '"v"' }] }).length, 2);
});

// ── source contract ─────────────────────────────────────────────────────────
test('a tag E o botao: nao existe mais botao separado de "enviar outra"', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.ok(!/data-tt-again/.test(src), 'o botao de baixo morreu; a tag em cima envia');
  assert.match(src, /data-tt-send/, 'a tag e quem envia');
  assert.match(src, /stopPropagation/, 'enviar nao pode fechar o cartao');
});
test('os glifos vem do banco, nenhum svg inventado no cartao', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/glyphs\.js'/, 'importa o banco de glifos');
  assert.ok(!/<svg/i.test(src), 'nenhum SVG solto no modulo do cartao');
});
test('a nota de plumbing e a sub-legenda de espera sumiram', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.ok(!/gate_note/.test(src), 'a nota de plumbing morreu');
  assert.ok(!/sub_sent|sub_graded|subHtml/.test(src), '"aguardando correção do professor" morreu');
});

test('tarefas.js self-registers a renderer and uses the facade only', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /registerRenderer\('tarefas'/, 'registers the tarefas renderer');
  assert.match(src, /from '\.\/api\.js'/, 'imports the Trail facade');
  assert.ok(!/callWorker|window\.WORKER_URL/.test(src), 'never calls the worker transport directly');
});
