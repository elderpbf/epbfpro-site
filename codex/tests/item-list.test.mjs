// codex/tests/item-list.test.mjs
// O motor compartilhado da lista de itens (js/item-list.js) e as guias da arvore do editor.
//
// Existe porque Elder pegou a duplicacao (2026-08-05): "na lista de itens do projeto, deve ser
// que nem a lista de liberacoes (nao duplique)... a gente deve ter apenas uma lista de itens e
// cada local que utiliza so faz os filtros necessarios". O que estes testes travam e a parte
// que NAO pode divergir entre as duas telas: ordem por tipo, dobra de acento na busca, e o
// desenho das linhas de ligacao.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupByType, sectionsByType, matchesQuery, flattenTree, idsInTree, selectableItems,
} from '../js/item-list.js';
import { guideHtml } from '../content/item-members.js';

const TYPES = [{ slug: 'prompt', label: 'Prompt' }, { slug: 'arquivo', label: 'Arquivo' }];

test('groupByType respeita a ordem do registro ct_types', () => {
  const g = groupByType([{ id: 1, type: 'arquivo' }, { id: 2, type: 'prompt' }], TYPES);
  assert.deepEqual(g.map((x) => x.type), ['prompt', 'arquivo']);
});

// Um tipo fora do registro nao pode SUMIR: some da lista, some da tela que consertaria ele.
test('tipo desconhecido cai no fim, mas nao desaparece', () => {
  const g = groupByType([{ id: 1, type: 'zzz' }, { id: 2, type: 'prompt' }], TYPES);
  assert.deepEqual(g.map((x) => x.type), ['prompt', 'zzz']);
});

test('sectionsByType entrega rotulo, icone e contagem por secao', () => {
  const s = sectionsByType([{ id: 1, type: 'prompt' }, { id: 2, type: 'prompt' }], {
    types: TYPES,
    labelOf: (slug) => slug.toUpperCase(),
    iconOf: () => 'glyph:file',
  });
  assert.equal(s.length, 1);
  assert.equal(s[0].label, 'PROMPT');
  assert.equal(s[0].icon, 'glyph:file');
  assert.equal(s[0].count, 2);
  assert.equal(s[0].key, 'type-prompt');
});

// A MESMA dobra do resto do Codex: e o que faz "peticao" achar "Peticao".
test('matchesQuery dobra acento nos dois lados', () => {
  assert.ok(matchesQuery({ title: 'Modelo de Petição' }, 'peticao'));
  assert.ok(matchesQuery({ title: 'Modelo de Peticao' }, 'petição'));
  assert.ok(matchesQuery({ title: 'Qualquer' }, ''), 'busca vazia nao filtra nada');
  assert.ok(!matchesQuery({ title: 'Modelo' }, 'zzz'));
});

test('flattenTree numera a profundidade e marca o ultimo irmao', () => {
  const rows = flattenTree([
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
    { id: 2 },
  ]);
  assert.deepEqual(rows.map((r) => [r.item.id, r.depth, r.isLast]), [
    [1, 0, false], [11, 1, false], [12, 1, true], [2, 0, true],
  ]);
});

// A parte que so a arvore tem: a coluna de um ancestral leva traco vertical SE aquele
// ancestral ainda tem irmao abaixo. Sem isso o traco continua descendo embaixo do ultimo
// filho, que e o defeito classico de arvore em texto.
test('guides marcam so os ancestrais que ainda tem irmao abaixo', () => {
  const rows = flattenTree([
    { id: 1, children: [{ id: 11, children: [{ id: 111 }] }] },
    { id: 2, children: [{ id: 21, children: [{ id: 211 }] }] },
  ]);
  const neto1 = rows.find((r) => r.item.id === 111);
  const neto2 = rows.find((r) => r.item.id === 211);
  // 1 ainda tem o 2 abaixo -> a coluna dele leva traco; 2 e o ultimo -> nao leva.
  assert.deepEqual(neto1.guides, [true, false]);
  assert.deepEqual(neto2.guides, [false, false]);
});

test('guideHtml desenha uma coluna por nivel e corta o vertical no ultimo', () => {
  assert.equal(guideHtml([], false, 0), '', 'a raiz nao tem guia');
  const mid = guideHtml([true], false, 2);
  assert.equal((mid.match(/cdx-mem-guide/g) || []).length, 1);
  assert.ok(mid.includes('is-line'), 'o ancestral com irmao abaixo leva traco');
  assert.ok(!mid.includes('is-last'));
  assert.ok(guideHtml([false], true, 2).includes('is-last'), 'o ultimo irmao corta o vertical');
});

test('idsInTree pega qualquer profundidade', () => {
  const ids = idsInTree([{ id: 1, children: [{ id: 11, children: [{ id: 111 }] }] }]);
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 11, 111]);
});

// A guarda antiga barrava agrupador dentro de agrupador. Elder derrubou ("o erro e criar
// superficies nao flexiveis de cara"); o que resta e so ciclo.
test('selectableItems barra so o proprio item e os ancestrais dele', () => {
  const all = [{ id: 1, type: 'projeto' }, { id: 2, type: 'prompt' }, { id: 3, type: 'projeto' }];
  assert.deepEqual(selectableItems(all, 1, []).map((i) => i.id), [2, 3],
    'outro agrupador continua escolhivel');
  assert.deepEqual(selectableItems(all, 2, [3]).map((i) => i.id), [1],
    'o ancestral fica de fora, senao vira laco');
});
