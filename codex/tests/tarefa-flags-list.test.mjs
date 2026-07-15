// Os toggles da tarefa chegam JUNTO com a lista, nao de carona no cartao aberto.
//
// O bug que o Élder relatou duas vezes ("preciso dar 2 cliques", "volta desmarcado depois de
// recarregar"): _flags so era preenchido pelo _loadSubmissions, que so roda no cartao
// SELECIONADO. No hub da aula todo cartao fechado desenhava os quatro toggles desligados, fosse
// qual fosse a verdade no banco, e o primeiro clique mandava LIGAR o que ja estava ligado. Dai
// os dois cliques: o primeiro era um no-op que so consertava a mentira da tela.
//
// Um toggle que mente sobre o estado e pior que um toggle que nao existe, porque o professor
// confia nele: ele nao sabe que precisa abrir o cartao antes de acreditar no que le.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = () => read('../content/tarefas.js');

test('a acao passa pela fachada, como todo o resto', () => {
  assert.match(read('../js/codex-api.js'),
    /listTarefaFlags: \(p\) => call\('ct_list_tarefa_flags', p\)/);
});

// O coracao do conserto: as flags entram na MESMA carga da lista, nao numa segunda viagem por
// cartao. Se voltar a depender do cartao aberto, este teste cai.
test('as flags sao carregadas junto com a lista de tarefas', () => {
  const s = src();
  const load = s.slice(s.indexOf('cohortsApi.listTurmas('), s.indexOf('function _updateSubmissionCount'));
  assert.match(load, /api\.listTarefaFlags\(\{ client_slug: clientSlug, turma_slug: turmaSlug \}\)/,
    'a chamada entra no Promise.all da lista');
  assert.match(load, /_flags = \(results\[2\] && results\[2\]\.flags\) \|\| \{\}/,
    'e o resultado popula _flags ANTES de qualquer render');
});

// A ordem importa: se _flags fosse preenchido depois do _renderLockedPane, o primeiro desenho
// ainda sairia mentindo e so um segundo render consertaria.
test('_flags e preenchido ANTES do primeiro desenho dos cartoes', () => {
  const s = src();
  const load = s.slice(s.indexOf('}).then((results) => {'));
  const iFlags = load.indexOf('_flags = (results[2]');
  const iRender = load.indexOf('_renderLockedPane()');
  assert.ok(iFlags !== -1 && iRender !== -1, 'os dois existem');
  assert.ok(iFlags < iRender, 'as flags chegam antes do render, nao depois');
});

// _flags e estado DA TURMA. Sem zerar, os toggles da turma que saiu pintariam os cartoes da
// proxima durante toda a janela do load.
test('_flags morre junto com _submissions ao trocar de turma', () => {
  const s = src();
  assert.match(s, /_submissions = \{\};\s*\n\s*_flags = \{\};/,
    'zerado na troca de turma e no unmount');
  const zeros = [...s.matchAll(/_flags = \{\};/g)];
  assert.ok(zeros.length >= 2, 'nos dois lugares onde _submissions zera, nao so num');
});

// O default nao pode ser {}: _lockedCardHtml lia `_flags[item.id] || {}` e {} nao tem as quatro
// chaves, entao TUDO saia undefined -> desmarcado. _noFlags() ao menos diz explicitamente
// "quatro desligados", que e o default honesto pra uma tarefa sem release.
test('o default e _noFlags(), nao um objeto vazio', () => {
  const s = src();
  const card = s.slice(s.indexOf('function _lockedCardHtml'), s.indexOf('function _lockedCardHtml') + 600);
  assert.match(card, /_flags\[item\.id\] \|\| _noFlags\(\)/);
  assert.ok(!/_flags\[item\.id\] \|\| \{\}/.test(s), 'o `|| {}` velho nao voltou');
});

// _noFlags tem que ter as QUATRO chaves: uma chave faltando volta a ser undefined -> desmarcado,
// que e exatamente a forma do bug original.
test('_noFlags cobre os quatro toggles, inclusive o anonimo', () => {
  const s = src();
  const nf = s.slice(s.indexOf('const _noFlags'), s.indexOf('const _noFlags') + 200);
  for (const k of ['reply_enabled', 'grade_enabled', 'allow_multi', 'allow_anon']) {
    assert.match(nf, new RegExp(k + ':\\s*false'), k + ' tem default explicito');
  }
});
