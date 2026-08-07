// codex/tests/item-form-proto.test.mjs
// O protótipo da tela única de item (content/item-form-proto.js). TEMPORÁRIO: sai junto com o
// módulo quando a tela graduar para o item-form de verdade.
//
// Vale a pena testar uma coisa descartável porque o valor dela é ser CLICÁVEL: um erro que só
// aparece no terceiro clique desperdiça uma rodada inteira de olhada do Élder. Um host de
// mentira (sem jsdom, como o resto da suíte) exercita pintura e cliques.
//
// O QUE ESTE ARQUIVO NÃO PODE PROVAR: o arrastador. Ele depende de DOM de verdade (a alça é
// criada e posicionada por CSS), então aqui `querySelector` devolve null e o resizable nem é
// chamado. Verde aqui não é evidência de que a divisória arrasta; isso se testa arrastando.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '../content/item-form-proto.js';
import { MAX_INDENT } from '../js/item-list.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = read('../content/item-form-proto.js');
const css = read('../content/content.css');

const TYPES = [
  { slug: 'prompt', label: 'Prompt', icon: 'glyph:file' },
  { slug: 'arquivo', label: 'Arquivo', icon: 'glyph:file' },
  { slug: 'pasta', label: 'Pasta', icon: 'glyph:folder', family: 'bundle' },
];
const TAGS = [{ id: 1, label: 'audiência' }, { id: 2, label: 'magistrados' }];

function fakeHost() {
  let html = '';
  let handler = null;
  return {
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
    addEventListener(_, f) { handler = f; },
    removeEventListener() {},
    contains() { return true; },
    querySelector() { return null; },   // sem DOM: o arrastador não entra em cena
    click(dataset) { handler({ target: { closest: () => ({ dataset }) } }); },
  };
}
function mounted() {
  const host = fakeHost();
  mount(host, { types: TYPES, tags: TAGS });
  return host;
}
const rowCount = (h) => (h.innerHTML.match(/cdx-mem-row/g) || []).length;
// Os degraus desenhados, na ordem: quantas colunas de guia + cotovelo cada linha carrega.
const indents = (h) => h.innerHTML.split('cdx-mem-row').slice(1)
  .map((chunk) => (chunk.split('</li>')[0].match(/cdx-mem-guide|cdx-mem-elbow/g) || []).length);

test('a tela pinta, com o pacote de 6 degraus, e não vaza undefined', () => {
  const host = mounted();
  assert.ok(host.innerHTML.includes('cdx-editor'), 'usa o cdx-editor de verdade');
  assert.equal(rowCount(host), 6);
  assert.ok(host.innerHTML.includes('Anexo: Roteiro de Perguntas para Testemunhas'),
    'o degrau 5 está lá, que é onde o recuo aperta');
  assert.ok(!/undefined|NaN/.test(host.innerHTML));
});

// Élder 3a rodada: "you can drop a, b and c". Uma tela só, e as abas de comparação foram junto.
test('sobrou UMA tela: nada de candidatas nem de abas', () => {
  assert.ok(!/VARIANTS|proto-var|proto-tabs/.test(src), 'nenhum resto do comparador no módulo');
  assert.ok(!/cdx-proto-tabs|cdx-proto-lead/.test(css), 'nem no CSS');
  const host = mounted();
  assert.ok(!host.innerHTML.includes('data-proto-var'), 'nenhuma aba na tela');
});

// A regra 3 do modelo (CLAUDE.md): item que ganha companhia não vira pai, nasce um pacote que
// segura os dois. É o buraco que hoje não tem caminho nenhum na tela real.
test('dá para ver um item comum virando PACOTE, e voltar', () => {
  const host = mounted();
  host.click({ protoUndo: '1' });
  assert.equal(rowCount(host), 0, 'volta a ser item comum');
  assert.ok(host.innerHTML.includes('Cole aqui o conteúdo do item'), 'e a caixa vira de item');
  host.click({ protoAdd: 'pool' });
  assert.ok(host.innerHTML.includes('PACOTE'), 'o aviso da transformação aparece');
  assert.ok(host.innerHTML.includes('Prompt: Resumo Preparatório'), 'o próprio item entrou dentro');
});

// Élder: "d looks nice, but lacks the ->| controls".
test('as ações da lista existem, e agem sobre a linha SELECIONADA', () => {
  const host = mounted();
  assert.ok(host.innerHTML.includes('data-proto-act="in"'), 'o →| está na tela');
  assert.ok(/data-proto-act="in"[^>]*disabled/.test(host.innerHTML), 'sem seleção, desligado');
  host.click({ protoSel: '1' });
  assert.ok(host.innerHTML.includes('is-sel'), 'a linha fica marcada');
  const before = indents(host);
  host.click({ protoAct: 'out' });
  const after = indents(host);
  assert.ok(after[1] < before[1], '|← tira um degrau da selecionada');
  host.click({ protoSel: '1' });
  assert.ok(!host.innerHTML.includes('is-sel'), 'clicar de novo tira a seleção');
});

// A regra do recuo é IMPORTADA da lista de verdade; reimplementar aqui faria o protótipo mentir
// sobre o que é possível.
test('o recuo obedece à regra real: não se pula degrau, e o teto vale', () => {
  assert.match(src, /from\s+'\.\.\/js\/item-list\.js'/, 'importa maxIndentFor/removeAt/MAX_INDENT');
  assert.ok(!/const\s+MAX_INDENT\s*=/.test(src), 'não redeclara o teto');
  const host = mounted();
  host.click({ protoSel: '0' });
  assert.ok(/data-proto-act="in"[^>]*disabled/.test(host.innerHTML), 'o primeiro nunca recua');
  assert.ok(/data-proto-act="out"[^>]*disabled/.test(host.innerHTML), 'nem sai de onde não está');
  assert.equal(MAX_INDENT, 5, 'o teto que a tela respeita é o do motor');
});

// Achado da análise do fluxo: a caixinha falava de uma seleção que não existia em lugar nenhum.
test('"só existe dentro deste pacote" tem sujeito: fica desligada sem seleção', () => {
  const host = mounted();
  assert.ok(host.innerHTML.includes('selecione um item para marcar'), 'sem seleção, explica');
  host.click({ protoSel: '2' });
  assert.ok(host.innerHTML.includes('este item só existe dentro deste pacote'), 'com seleção, age');
});

// Achado da análise do fluxo: um PACOTE não é um arquivo, então a descrição dele não pode
// oferecer "usar como arquivo para baixar" -- sairia um pacote que também é anexo, que não
// existe no modelo.
test('a descrição do PACOTE não oferece virar arquivo; a de um item comum sim', () => {
  const host = mounted();
  assert.ok(!host.innerHTML.includes('usar como arquivo para baixar'), 'pacote: não oferece');
  host.click({ protoUndo: '1' });
  assert.ok(host.innerHTML.includes('usar como arquivo para baixar'), 'item comum: oferece');
});

test('editar um membro troca só a esquerda, e a migalha diz onde você está', () => {
  const host = mounted();
  host.click({ protoSel: '2' });
  host.click({ protoAct: 'edit' });
  assert.ok(host.innerHTML.includes('cdx-proto-crumb'), 'a migalha aparece');
  assert.ok(host.innerHTML.includes('Modelo: Relatório Preparatório CRIMINAL'), 'abriu o membro');
  assert.equal(rowCount(host), 6, 'a lista da direita continua inteira');
  host.click({ protoEdit: 'root' });
  assert.ok(host.innerHTML.includes('Pacote: Preparação'), 'volta para o pacote');
});

// Tirar do pacote PROMOVE quem estava recuado sob o item, que é o que torna apagar trivial no
// modelo (não há re-parentear porque não há parentesco entre itens).
test('tirar um item promove quem estava recuado sob ele', () => {
  const host = mounted();
  host.click({ protoSel: '0' });
  const before = indents(host);
  host.click({ protoAct: 'rm' });
  const after = indents(host);
  assert.equal(rowCount(host), 5);
  assert.ok(after[0] < before[1], 'quem estava recuado sob o removido subiu um degrau');
});

// Élder: "os 2 painéis precisam ter um arrastador, o painel da esquerda ficou minúsculo".
// O que dá para provar sem DOM: que usa o módulo compartilhado, que a grade declara a coluna
// que a alça enxerga, e que ele é REINSTALADO a cada pintura.
test('o arrastador é o compartilhado, a grade o alimenta, e ele sobrevive à repintura', () => {
  assert.match(src, /from\s+'\.\.\/js\/resizable\.js'/, 'usa js/resizable.js');
  assert.ok(!/mousemove|mousedown/.test(src), 'nenhum código de arraste próprio');
  assert.ok(src.indexOf('mountResizer()') < src.indexOf('function mountResizer'),
    'paint() chama mountResizer, ou seja, a cada pintura');
  assert.match(css, /\.cdx-proto-two\s*\{[^}]*position:\s*relative/, 'a grade é relative');
  assert.match(css, /grid-template-columns:\s*var\(--cdx-rz-w/, 'a 1a coluna monta no --cdx-rz-w');
});

// A escala tem que ficar PRESA no protótipo: um arquivo descartável não pode reestilizar o
// admin inteiro pelas costas.
test('a escala de fonte é declarada em .cdx-proto, nunca no :root', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = bare.slice(bare.indexOf('.cdx-proto {'), bare.indexOf('.cdx-proto .cdx-editor-title'));
  for (const v of ['--p-xs', '--p-sm', '--p-md', '--p-lg']) {
    assert.ok(block.includes(v), v + ' declarado no bloco do protótipo');
    assert.ok(!new RegExp(':root[^}]*' + v).test(bare), v + ' NÃO vaza para o :root');
  }
});

// Um protótipo que chama o Worker deixa de ser protótipo e vira risco: ele desenha, e só.
test('o protótipo não toca no backend nem inventa classe fora do padrão cdx-', () => {
  assert.ok(!/codex-api|callWorker|fetch\s*\(/.test(src), 'nenhuma chamada ao backend');
  assert.ok(!/class="(?!cdx-)/.test(src.replace(/class="[^"]*cdx-[^"]*"/g, '')), 'só classes cdx-');
  assert.ok(!/[—]|--\s/.test(src.replace(/&#\d+;/g, '')), 'sem travessão nem duplo hífen');
});
