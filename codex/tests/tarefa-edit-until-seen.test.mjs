// Editar depois de enviado, ENQUANTO A OUTRA PARTE NAO VIU (track-26 item 3, migration 0037).
//
// Élder 2026-07-15: "o professor e aluno devem poder editar a mensagem depois de enviada se a
// outra parte nao viu ainda" + "pense e escolha a forma mais obvia do que seria ver".
//
// VISTO = a outra parte ABRIU A TELA onde a mensagem aparece: o aluno expandiu o cartao, o
// instrutor abriu o painel de respostas. Quem decide e o SERVIDOR (can_edit / reply_seen_at);
// aqui prova-se que as duas telas OBEDECEM em vez de rederivar a regra por conta propria, e que
// o carimbo sai de um EVENTO de abertura, nunca de uma leitura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identityConfig } from '../trilha/js/tarefa-submit-modal.js';
import { findDelivery } from '../trilha/js/tarefas.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── O modal em modo edicao ───────────────────────────────────────────────────

// A caixa nao esta propondo nada aqui: esta mostrando o que a entrega E. Vir desmarcada sobre uma
// entrega anonima identificaria quem escolheu nao aparecer, so por salvar uma virgula, e um nome
// nao volta pra dentro do anonimato depois de aparecer.
test('editando uma entrega ANONIMA, a caixa vem marcada: e o estado dela, nao uma proposta', () => {
  const c = identityConfig('Ana', true, true);
  assert.equal(c.showAnonCheckbox, true);
  assert.equal(c.anonChecked, true);
});
test('editando uma entrega IDENTIFICADA, a caixa vem desmarcada', () => {
  assert.equal(identityConfig('Ana', true, false).anonChecked, false);
});
// A tarefa manda: se ela nao aceita anonimo, nao ha caixa nenhuma pra marcar, e o envio recusaria.
test('numa tarefa que exige identificacao nao ha caixa, nem editando uma linha antiga anonima', () => {
  const c = identityConfig('Ana', false, true);
  assert.equal(c.showAnonCheckbox, false);
  assert.equal(c.anonChecked, false);
});
// Enviar (sem editing) segue como antes: NUNCA pre-marcada.
test('enviando, a caixa continua nunca vindo marcada', () => {
  assert.equal(identityConfig('Ana', true).anonChecked, false);
  assert.equal(identityConfig('', true).anonChecked, false);
});

test('o modal edita pelo ct_edit_submission, nao reenvia', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  // Reenviar seria uma SEGUNDA entrega, e numa tarefa de entrega unica levaria already_submitted.
  assert.match(src, /if \(editing\) \{\s*await trail\.editTarefa\(/, 'editando -> editTarefa');
  assert.match(src, /id: editing\.id/, 'na MESMA linha');
});
test('o modal explica a trava em vez de dizer "erro"', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /code === 'already_seen'/);
});
// Editar comeca do que foi enviado: campo vazio obrigaria a redigitar tudo pra trocar uma frase.
test('o campo volta preenchido, e quem desempacota o payload e o registry', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /initial: parseAnswer\(editing\.answer_json\)/);
  assert.match(src, /import \{ getField, parseAnswer \} from '\.\.\/\.\.\/js\/tarefa-fields\.js'/,
    'a forma do payload mora no registry, nao duplicada aqui');
});

// ── A aba do aluno ───────────────────────────────────────────────────────────

test('findDelivery acha a entrega pelo id DELA, nao pelo da tarefa', () => {
  const tarefas = [
    { item_id: 1, submissions: [{ id: 10 }, { id: 11 }] },
    { item_id: 2, submissions: [{ id: 20 }] },
  ];
  assert.equal(findDelivery(tarefas, 11).sub.id, 11);
  assert.equal(findDelivery(tarefas, 11).tarefa.item_id, 1);
  assert.equal(findDelivery(tarefas, 20).tarefa.item_id, 2);
  assert.equal(findDelivery(tarefas, 999), null);
  assert.equal(findDelivery(null, 1), null);
});

// O servidor decide. Se a aba rederivasse a regra, o botao apareceria numa entrega que o envio
// recusa e o aluno digitaria de novo pra levar erro no fim.
test('o botao de editar segue o can_edit do servidor', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /if \(sub\.can_edit\)/);
  assert.ok(!/answer_seen_at/.test(src), 'a aba nao le a coluna crua nem recalcula a regra');
});

// Fechar o cartao nao desve nada, entao so a transicao de ABERTURA carimba.
test('so ABRIR o cartao marca a mensagem como vista', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /_openId = \(_openId === id\) \? null : id;\s*\n\s*if \(_openId === id\) markReplySeen\(tarefa\);/);
});
// Sem mensagem nao ha o que ver; e sem sessao nao ha quem esteja vendo.
test('markReplySeen so dispara quando ha mensagem e sessao', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /if \(!tarefa \|\| !tarefa\.has_instructor_message \|\| !state\.sessionToken\) return;/);
});
// Dispara e segue: o cartao abre na hora. Falhar aqui so deixa o professor editando por mais um
// instante uma mensagem ja lida, o que e infinitamente mais barato que travar a abertura.
test('ver nao bloqueia a abertura do cartao', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /Promise\.resolve\(trail\.markReplySeen\(/);
  assert.match(src, /\.catch\(\(\) =>/);
});

// ── O painel do professor ────────────────────────────────────────────────────

// Uma LEITURA que carimba e uma armadilha, e aqui e uma com data marcada: o _removeFromTurma ja
// le a lista sem mostrar nada pra ninguem, e o conserto pendente do bug dos checkboxes quer
// carregar as respostas junto com a lista. No dia em que entrasse, abrir a aba trancaria a turma
// inteira sem ninguem ter aberto nada. O evento e "abriu", entao quem chama e quem abre.
test('o carimbo do professor sai da ABERTURA do painel, nunca do _loadSubmissions', () => {
  const src = read('../content/tarefas.js');
  const load = src.slice(src.indexOf('function _loadSubmissions'), src.indexOf('function _renderSubmissions'));
  assert.ok(load.indexOf('markAnswersSeen') === -1, '_loadSubmissions NAO carimba: ler nao e abrir');
  assert.match(src, /_loadSubmissions\(id\);\s*\n\s*_markAnswersSeen\(id\);/, 'abrir o cartao carimba');
  assert.match(src, /_markAnswersSeen\(_focusItemId\);/, 'o deep-link ja abre o painel: tambem carimba');
});
test('a acao passa pela fachada, como todo o resto', () => {
  assert.match(read('../js/codex-api.js'), /markAnswersSeen: \(p\) => call\('ct_mark_answers_seen', p\)/);
  const trail = read('../trilha/js/api.js');
  assert.match(trail, /editTarefa:\s*\(p\) => call\('ct_edit_submission', p\)/);
  assert.match(trail, /markReplySeen:\s*\(p\) => call\('ct_mark_reply_seen', p\)/);
});

// Trava desenhada, nao escondida: sumir com o campo faria o professor achar que a resposta dele
// nao foi salva. O texto fica legivel, o motivo fica escrito do lado.
test('depois que o aluno le, os campos travam e o motivo aparece', () => {
  const src = read('../content/tarefas.js');
  assert.match(src, /const _msgSeen = \(s\) => !!s\.reply_seen_at;/);
  assert.match(src, /seen \? ' disabled' : ''/);
  assert.match(src, /_msgSeen\(s\)\s*\n?\s*\? '<p class="cdx-resp-seen">'/);
});
// A nota sai no MESMO bloco da resposta na tela do aluno: e a mesma mensagem. Travar uma e
// deixar a outra aberta seria uma distincao que so existe na tabela.
test('a nota trava junto com a resposta', () => {
  const src = read('../content/tarefas.js');
  const grade = src.slice(src.indexOf('function _gradeBlockHtml'), src.indexOf('function _toggleFlag'));
  assert.match(grade, /const seen = _msgSeen\(s\);/);
  assert.match(grade, /seen \? ' disabled' : ''/);
});
// A trava chega pela rede quando o aluno abriu a tarefa DEPOIS que o painel pintou. O painel esta
// mentindo neste segundo: quem tem que mudar e ele, nao o professor que precisa adivinhar.
test('levar a trava recarrega o painel em vez de so reclamar', () => {
  const src = read('../content/tarefas.js');
  assert.match(src, /err\.data\.error === 'already_seen'/);
  const fn = src.slice(src.indexOf('function _saveMsgFailed'));
  assert.match(fn.slice(0, 400), /_loadSubmissions\(itemId\);/);
});
