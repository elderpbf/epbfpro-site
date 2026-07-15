// tests/trilha-tarefas.test.mjs
// Codex Trail · Tarefas tab (track-26 item 2). Unit-tests the DOM-free logic (aula
// grouping/labeling, count label, answer-text extraction) + source-contract assertions
// (self-registers a renderer, reaches the backend only through the facade, routes the new
// tab). The card DOM/click wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aulaLabel, countLabel, sortByAula, anyAulaHasMultiple, statusGroups, answerText, isExpandable, tarefaKind, canSend, deliveries, fill, deliveryWho } from '../trilha/js/tarefas.js';
import { resolveTab } from '../trilha/js/page.js';
import { stampTime } from '../js/rel-time.js';

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

// ── assinatura + carimbo de cada interacao (Élder 2026-07-15) ───────────────
test('deliveryWho: assinada com o nome de quem entregou', () => {
  assert.equal(deliveryWho({ student_name: 'Ana Prado' }), 'Ana Prado');
});
test('deliveryWho: entrega anonima diz Anonimo, NAO o nome da sessao', () => {
  // O nome falta porque o aluno escolheu; a ausencia e o fato, nao um buraco pra tapar.
  assert.equal(deliveryWho({ student_name: null }), 'Anônimo');
  assert.equal(deliveryWho({}), 'Anônimo');
  assert.equal(deliveryWho(null), 'Anônimo');
});

test('fill: troca os placeholders da frase', () => {
  assert.equal(fill('de {who} em {when}', { who: 'Ana', when: '23/06/2026 às 12h26' }),
    'de Ana em 23/06/2026 às 12h26');
});
test('fill: um {token} sem valor fica como esta, nao vira "undefined"', () => {
  assert.equal(fill('de {who} em {when}', { who: 'Ana' }), 'de Ana em {when}');
});
test('fill: um nome com $& NAO e reinjetado pelo String.replace', () => {
  // O motivo de fill() usar funcao replacer em vez de string: '$&' na substituicao string
  // significa "o trecho casado", e o nome do aluno viraria "{who}" na tela.
  assert.equal(fill('de {who} em x', { who: 'A$&B' }), 'de A$&B em x');
});

test('stampTime: o momento exato, formato PT-BR fechado', () => {
  const d = new Date(2026, 5, 23, 12, 26, 0);            // 23/06/2026 12h26, hora local
  assert.equal(stampTime(Math.floor(d.getTime() / 1000)), '23/06/2026 às 12h26');
});
test('stampTime: zero-pad em dia/mes/hora/minuto', () => {
  const d = new Date(2026, 0, 5, 9, 7, 0);               // 05/01/2026 09h07
  assert.equal(stampTime(Math.floor(d.getTime() / 1000)), '05/01/2026 às 09h07');
});
test('stampTime: sem timestamp -> vazio, nunca "Invalid Date" na cara do aluno', () => {
  assert.equal(stampTime(null), '');
  assert.equal(stampTime(0), '');
  assert.equal(stampTime(undefined), '');
});

// ── source contract ─────────────────────────────────────────────────────────
test('toda interacao do cartao e assinada e carimbada', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/rel-time\.js'/, 'o carimbo vem do modulo compartilhado');
  assert.ok(!/toLocaleString/.test(src), 'o cartao nao formata data por conta propria');
  assert.match(src, /tarefas\.by_at/, 'a entrega diz de quem e de quando');
  assert.match(src, /tarefas\.msg_by_at/, 'a mensagem do professor tambem');
  assert.match(src, /who: t\('tarefas\.instructor'\)/, 'o professor assina como Instrutor');
});
test('o botao diz o VERBO, nao o estado', () => {
  const pt = read('../trilha/i18n.js');
  assert.match(pt, /'tarefas\.badge_unanswered':\s*'Responder'/, 'o rotulo do botao e a acao');
  // O estado nao sumiu: ele mora no cabecalho da secao, que e o lugar de um estado.
  assert.match(pt, /'tarefas\.section_pending':\s*'Não respondidas'/, 'o estado fica na secao');
});
test('o glifo vem DEPOIS do texto no botao', () => {
  const src = read('../trilha/js/tarefas.js');
  const inner = /const inner = '<span>' \+ esc\(t\(def\.label\)\) \+ '<\/span>' \+ icon;/;
  assert.match(src, inner, 'le-se o verbo, depois ve-se o aviao');
});
test('o chevron abre o CARTAO: vem antes do conteudo e centralizado', () => {
  const src = read('../trilha/js/tarefas.js');
  const top = src.slice(src.indexOf("'<div class=\"cdx-tt-top\"'"));
  assert.ok(top.indexOf('chevron +') < top.indexOf('cdx-tt-info'), 'chevron a esquerda do conteudo');
  assert.match(src, /cdx-tt-chev--none/, 'o slot vazio segura o alinhamento do titulo');
  const css = read('../trilha/css/tarefas.css');
  assert.match(css, /\.cdx-tt-chev\s*\{[^}]*align-self:\s*center/, 'centralizado na vertical');
});
test('o botao de acao volta pra linha do titulo', () => {
  const src = read('../trilha/js/tarefas.js');
  // badgeHtml e irmao do bloco do titulo dentro do .cdx-tt-top, nao mais filho de .cdx-tt-tags
  // (que agora carrega SO a tag de mensagem, e essa sim mora embaixo do titulo).
  const top = src.slice(src.indexOf("'<div class=\"cdx-tt-top\"'"), src.indexOf('function wireList'));
  assert.ok(top.indexOf('cdx-tt-info') < top.indexOf('badgeHtml(tarefa)'), 'a acao fecha a linha do titulo');
  assert.match(top, /cdx-tt-tags">' \+ msg \+/, 'so a tag de mensagem fica na linha de baixo');
  assert.ok(!/tags">' \+ msgBadgeHtml\(tarefa\) \+ badgeHtml/.test(src), 'a acao saiu da linha de baixo');
});
test('texto longo vira janela: o clamp e o compartilhado, medido, nao chutado', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/clamp\.js'/, 'usa o clamp compartilhado');
  assert.match(src, /wireClamps\(_root, '\[data-tt-text\]'\)/, 'clampa as respostas');
  const clamp = read('../js/clamp.js');
  assert.match(clamp, /scrollHeight <= el\.clientHeight/, 'mede o transbordo de verdade');
  assert.ok(!/length >|charAt|substring/.test(clamp), 'nao chuta pelo numero de caracteres');
});
test('o CSS do texto da entrega nao ficou orfao', () => {
  // O wrapper que escopava estas regras morreu junto com o subHtml, e a regra escopada nele
  // deixou o texto da entrega SEM pre-wrap: as quebras de linha que o aluno digitou sumiam.
  // Os comentarios saem antes da checagem, senao o teste casa com a propria explicacao.
  const css = read('../trilha/css/tarefas.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const js = read('../trilha/js/tarefas.js');
  assert.ok(!/\.cdx-tt-field/.test(css), 'nenhuma regra presa a um seletor que nao existe mais');
  assert.ok(!/cdx-tt-field/.test(js), 'e o seletor de fato nao e mais emitido');
  assert.match(css, /^\.cdx-tt-fv\s*\{[^}]*white-space:\s*pre-wrap/m, 'o texto respeita as quebras');
});

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
