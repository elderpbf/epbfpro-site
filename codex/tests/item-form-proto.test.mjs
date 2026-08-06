// codex/tests/item-form-proto.test.mjs
// O protótipo das 4 candidatas da tela única (content/item-form-proto.js). TEMPORÁRIO: sai
// junto com o módulo quando uma delas graduar.
//
// Vale a pena testar uma coisa descartável porque o valor dele é ser CLICÁVEL: um erro de
// digitação que só aparece ao clicar na terceira aba desperdiça uma rodada inteira de olhada do
// Élder. Um host de mentira (sem jsdom, como o resto da suíte) exercita pintura e cliques.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount, VARIANTS } from '../content/item-form-proto.js';

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

// A regra 3 do modelo (CLAUDE.md) acontecendo na tela: item que ganha companhia não vira pai,
// nasce um pacote que segura os dois. É o buraco que hoje não tem caminho nenhum, então é o que
// a candidata A existe para mostrar.
test('A: adicionar o primeiro item transforma o item em PACOTE e o guarda dentro', () => {
  const host = mounted('a');
  assert.ok(!host.innerHTML.includes('virou um <b>PACOTE</b>'), 'começa como item comum');
  host.click({ protoAdd: 'pool' });
  assert.ok(host.innerHTML.includes('PACOTE'), 'o aviso da transformação aparece');
  assert.ok(host.innerHTML.includes('Prompt: Resumo Preparatório'), 'o próprio item entrou dentro');
  host.click({ protoUndo: '1' });
  assert.ok(!host.innerHTML.includes('cdx-proto-banner'), 'desfazer volta a ser item comum');
});

test('B: o garfo aparece só na criação, e o interruptor troca sem sair da tela', () => {
  const host = mounted('b');
  assert.ok(host.innerHTML.includes('cdx-proto-fork'), 'abre perguntando');
  assert.ok(!host.innerHTML.includes('data-proto-pack'), 'sem interruptor antes de responder');
  host.click({ protoFork: '1' });
  assert.ok(!host.innerHTML.includes('cdx-proto-fork'), 'a pergunta some depois de respondida');
  assert.ok(host.innerHTML.includes('data-proto-pack'), 'o interruptor assume no cabeçalho');
  host.click({ protoPack: '0' });
  assert.ok(host.innerHTML.includes('CONTEÚDO'), 'volta a ser item sem reabrir o garfo');
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

// O recuo de 5 degraus com títulos longos é O caso que o Élder precisa julgar no telefone.
test('o protótipo mostra os 6 degraus (0 a 5) com os títulos longos de verdade', () => {
  const host = mounted('c');
  const rows = host.innerHTML.match(/cdx-mem-row/g) || [];
  assert.equal(rows.length, 6);
  assert.ok(host.innerHTML.includes('Anexo: Roteiro de Perguntas para Testemunhas'), 'o degrau 5 está lá');
});

// Um protótipo que chama o Worker deixa de ser protótipo e vira risco: ele desenha, e só.
test('o protótipo não toca no backend nem inventa classe fora do padrão cdx-', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../content/item-form-proto.js', import.meta.url)), 'utf8');
  assert.ok(!/codex-api|callWorker|fetch\s*\(/.test(src), 'nenhuma chamada ao backend');
  assert.ok(!/class="(?!cdx-)/.test(src.replace(/class="[^"]*cdx-[^"]*"/g, '')), 'só classes cdx-');
  assert.ok(!/[—]|--\s/.test(src.replace(/&#\d+;/g, '')), 'sem travessão nem duplo hífen');
});
