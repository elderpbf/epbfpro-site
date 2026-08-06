// codex/tests/item-form-proto.test.mjs
// O protótipo das 4 candidatas da tela única (content/item-form-proto.js). TEMPORÁRIO: sai
// junto com o módulo quando uma delas graduar.
//
// Vale a pena testar uma coisa descartável porque o valor dela é ser CLICÁVEL: um erro que só
// aparece ao clicar na terceira aba desperdiça uma rodada inteira de olhada do Élder. Um host
// de mentira (sem jsdom, como o resto da suíte) exercita pintura e cliques.
//
// O QUE ESTE ARQUIVO NÃO PODE PROVAR: o arrastador. Ele depende de DOM de verdade (a alça é
// criada e posicionada por CSS), então aqui `querySelector` devolve null e o resizable nem é
// chamado. Verde aqui não é evidência de que a divisória arrasta; isso se testa arrastando.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount, VARIANTS } from '../content/item-form-proto.js';

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
function mounted(variant) {
  const host = fakeHost();
  mount(host, { variant, types: TYPES, tags: TAGS });
  return host;
}

test('as quatro candidatas pintam, e nenhuma vaza undefined', () => {
  assert.equal(VARIANTS.length, 4);
  for (const v of VARIANTS) {
    const host = mounted(v.key);
    assert.ok(host.innerHTML.includes('cdx-editor'), v.key + ' usa o cdx-editor de verdade');
    assert.ok(!/undefined|NaN/.test(host.innerHTML), v.key + ' sem undefined na tela');
  }
});

// Élder: "a versão A por exemplo eu não consigo ver a indentação porque você não preencheu".
// Comparar era o objetivo, e abrir uma delas vazia matava a comparação.
test('as quatro abrem com o MESMO pacote de 6 degraus, para poderem ser comparadas', () => {
  for (const v of VARIANTS) {
    const host = mounted(v.key);
    const rows = host.innerHTML.match(/cdx-mem-row/g) || [];
    assert.equal(rows.length, 6, v.key + ' abre com os 6 membros');
    assert.ok(host.innerHTML.includes('Anexo: Roteiro de Perguntas para Testemunhas'),
      v.key + ' mostra o degrau 5, que é onde o recuo aperta');
  }
});

// A regra 3 do modelo (CLAUDE.md) acontecendo na tela: item que ganha companhia não vira pai,
// nasce um pacote que segura os dois. É o buraco que hoje não tem caminho nenhum.
test('A e D: dá para ver um item comum virando PACOTE, e voltar', () => {
  for (const v of ['a', 'd']) {
    const host = mounted(v);
    host.click({ protoUndo: '1' });
    assert.ok(!(host.innerHTML.match(/cdx-mem-row/g) || []).length, v + ' volta a ser item comum');
    host.click({ protoAdd: 'pool' });
    assert.ok(host.innerHTML.includes('PACOTE'), v + ' o aviso da transformação aparece');
    assert.ok(host.innerHTML.includes('Prompt: Resumo Preparatório'), v + ' o próprio item entrou dentro');
  }
});

// Élder matou o garfo: "são 2 telas quando eu falei que só seria uma, e se eu mudar de ideia
// depois a escolha já passou". O que sobra da B é o interruptor, vivo desde o primeiro quadro.
test('B: nenhuma tela de escolha, e o interruptor existe desde o primeiro quadro', () => {
  assert.ok(!/proto-fork|forkcard/.test(src), 'o garfo saiu do código, não só da tela');
  const host = mounted('b');
  assert.ok(host.innerHTML.includes('data-proto-pack'), 'o interruptor já está lá');
  host.click({ protoPack: '0' });
  assert.ok(host.innerHTML.includes('CONTEÚDO'), 'vira item sem passar por tela nenhuma');
  host.click({ protoPack: '1' });
  assert.ok((host.innerHTML.match(/cdx-mem-row/g) || []).length === 6, 'e volta a ser pacote');
});

test('C e D: editar um membro troca só a coluna da esquerda, e a migalha diz onde você está', () => {
  for (const v of ['c', 'd']) {
    const host = mounted(v);
    assert.ok(host.innerHTML.includes('cdx-proto-two'), v + ' tem as duas colunas');
    host.click({ protoEdit: '2' });
    assert.ok(host.innerHTML.includes('cdx-proto-crumb'), v + ' mostra a migalha');
    assert.ok(host.innerHTML.includes('Modelo: Relatório Preparatório CRIMINAL'), v + ' abriu o membro');
    host.click({ protoEdit: 'root' });
    assert.ok(host.innerHTML.includes('Pacote: Preparação'), v + ' volta para o pacote');
  }
});

// Élder: "os 2 painéis precisam ter um arrastador, o painel da esquerda ficou minúsculo".
// O que dá para provar sem DOM: que ele usa o módulo compartilhado (e não código de arraste
// novo), que a grade declara a coluna que a alça enxerga, e que ele é REINSTALADO a cada
// pintura -- sem isso a alça some no primeiro clique, porque paint() reescreve o innerHTML.
test('o arrastador é o compartilhado, a grade o alimenta, e ele sobrevive à repintura', () => {
  assert.match(src, /from\s+'\.\.\/js\/resizable\.js'/, 'usa js/resizable.js');
  assert.ok(!/mousemove|mousedown/.test(src), 'nenhum código de arraste próprio');
  assert.ok(/mountResizer\(\);?\s*\n\s*\}/.test(src) && src.indexOf('mountResizer()') < src.indexOf('function mountResizer'),
    'paint() chama mountResizer antes de a função ser declarada, ou seja, a cada pintura');
  assert.match(css, /\.cdx-proto-two\s*\{[^}]*position:\s*relative/, 'a grade é relative');
  assert.match(css, /grid-template-columns:\s*var\(--cdx-rz-w/, 'a 1a coluna monta no --cdx-rz-w');
});

// A escala tem que ficar PRESA no protótipo: um arquivo descartável não pode reestilizar o
// admin inteiro pelas costas.
test('a escala de fonte é declarada em .cdx-proto, nunca no :root', () => {
  // Sem comentários: o próprio comentário do bloco cita ":root" para dizer que NÃO usa, e um
  // teste que lê comentário testa a prosa em vez do CSS.
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
