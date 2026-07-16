// Editar a entrega ATE O INSTRUTOR RESPONDER (track-26 item 3).
//
// Élder 2026-07-15: "eu sempre posso editar E o aluno pode editar ate eu responder e pronto;
// nada de abrir pagina e bloquear tudo, nada disso" + "nao ha motivo de travar nota com mensagem;
// sao coisas independentes" + "a nota nao e mensagem do professor, mensagem e so mensagem".
//
// A porta e A RESPOSTA, nao o ato de olhar: nenhuma tela tranca ninguem por ter sido aberta, e
// quem decide e o servidor (can_edit), nao estas abas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identityConfig } from '../trilha/js/tarefa-submit-modal.js';
import { findDelivery } from '../trilha/js/tarefas.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── Nada tranca por ser aberto ───────────────────────────────────────────────

// "Nada de abrir pagina e bloquear tudo, nada disso" (Élder). Abrir uma tela nao pode ter
// consequencia nenhuma. Se um dia alguem repuser um carimbo de "vi", estes testes caem.
test('nenhuma tela carimba "eu vi": abrir nao muda nada', () => {
  for (const [nome, rel] of [['aba do aluno', '../trilha/js/tarefas.js'], ['painel do professor', '../content/tarefas.js']]) {
    assert.ok(!/markReplySeen|markAnswersSeen|_seen_at/.test(read(rel)), nome + ' nao carimba nada');
  }
  assert.ok(!/mark_(answers|reply)_seen/.test(read('../trilha/js/api.js')), 'a fachada do aluno tambem nao');
  assert.ok(!/mark_(answers|reply)_seen/.test(read('../js/codex-api.js')), 'nem a do admin');
});

// "Eu sempre posso editar" (Élder): o professor e dono do que escreveu, e uma nota "pode
// precisar ser ajustada depois". Nenhum campo do painel dele fica cinza por decisao de ninguem.
test('o painel do professor nunca trava a resposta nem a nota', () => {
  const src = read('../content/tarefas.js');
  const bloco = src.slice(src.indexOf('function _replyBlockHtml'), src.indexOf('function _toggleFlag'));
  assert.ok(!/disabled/.test(bloco), 'nada de campo desabilitado');
  assert.match(bloco, /cdx-resp-reply-send/, 'o botao de responder existe sempre');
  assert.match(bloco, /cdx-resp-grade-save/, 'o de salvar a nota tambem');
});

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
// A tarefa manda: se ela nao aceita anonimo, nao ha caixa nenhuma, e o envio recusaria.
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
  assert.match(src, /code === 'already_replied'/);
  assert.ok(!/already_seen/.test(src), 'o codigo velho morreu junto com a regra velha');
});
// Editar comeca do que foi enviado: campo vazio obrigaria a redigitar tudo pra trocar uma frase.
test('o campo volta preenchido, e quem desempacota o payload e o registry', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /initial: parseAnswer\(editing\.answer_json\)/);
  assert.match(src, /import \{ getField, parseAnswer \} from '\.\.\/\.\.\/js\/tarefa-fields\.js'/,
    'a forma do payload mora no registry, nao duplicada aqui');
});

// Bug ANTIGO, achado pelo playtest desta feature: o <div> do modal e o <button> de enviar tinham
// a MESMA classe, e o querySelector casava com o div primeiro (ordem do documento). O "botao" era
// o modal inteiro: tocar em qualquer lugar dele enviava, o textContent = 'Enviando...' apagava o
// modal e deixava so a palavra na tela, e o .disabled = true nao fazia nada (div nao tem
// disabled). Estava vivo no envio, em producao. O js/frame-trail.js ja tinha o 'button.' como
// contorno, que era o fossil do bug.
test('a classe do botao de enviar e SO do botao', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  // (?![-\w]) e nao \b: o \b depois de "submit" casaria com o hifen de tr-tarefa-submit-modal e
  // de tr-tarefa-submit-backdrop, que sao classes DIFERENTES e legitimas.
  const classes = [...src.matchAll(/class="([^"]*\btr-tarefa-submit(?![-\w])[^"]*)"/g)].map((m) => m[1]);
  assert.equal(classes.length, 1, 'so um elemento carrega a classe: ' + JSON.stringify(classes));
  assert.match(src, /<button[^>]*class="[^"]*\btr-tarefa-submit(?![-\w])/, 'e ele e o <button>');
  assert.match(src, /bd\.querySelector\('button\.tr-tarefa-submit'\)/, 'e a busca exige o button');
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
// recusa e o aluno digitaria tudo de novo pra levar erro no fim.
test('o botao de editar segue o can_edit do servidor', () => {
  assert.match(read('../trilha/js/tarefas.js'), /if \(sub\.can_edit\)/);
});

// "A nota nao e mensagem do professor, mensagem e so mensagem" (Élder). Dentro do bloco da
// mensagem, uma entrega so com nota desenhava um "Mensagem do Instrutor em ..." que nao continha
// mensagem nenhuma: so um numero.
test('a nota fica FORA do bloco da mensagem, com rotulo proprio', () => {
  const src = read('../trilha/js/tarefas.js');
  const del = src.slice(src.indexOf('function deliveryHtml'), src.indexOf('function bodyHtml'));
  assert.match(del, /if \(sub\.instructor_reply\) \{/, 'o bloco da mensagem so existe se HA mensagem');
  const reply = del.slice(del.indexOf('if (sub.instructor_reply) {'), del.indexOf('if (sub.grade) {'));
  assert.ok(!/grade/.test(reply), 'e a nota nao mora dentro dele');
  assert.match(del, /tarefas\.grade_label/, 'solta, a nota carrega o proprio rotulo');
});
