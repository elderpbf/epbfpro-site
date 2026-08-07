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

// ── 0050: recuo em vez de arvore ────────────────────────────────────────────
// Elder 2026-08-06: "o relacionamento pai-filho real so pertence ao bundle e seus itens. os
// itens dentro estao apenas indentados ou nao, para fins organizacionais".
import { guidesFromIndent, maxIndentFor, removeAt, MAX_INDENT } from '../js/item-list.js';
import { readFileSync } from 'node:fs';

// O teto e UM numero (Elder subiu de 3 pra 5 em 06/08: "why 3? go to 5 so we can test"). Estes
// dois travam o que quebrou de verdade: um `3` escrito a mao na trilha e um CSS com uma classe
// por nivel. Com qualquer um dos dois, subir o teto nao sobe o desenho -- o 4o e o 5o degrau
// aparecem com recuo ZERO e parece que o teto nao mudou.
test('a trilha nao escreve o teto a mao, importa o do motor', () => {
  const src = readFileSync(new URL('../trilha/js/projeto.js', import.meta.url), 'utf8');
  assert.ok(/MAX_INDENT.*from '\.\.\/\.\.\/js\/item-list\.js'/.test(src), 'importa o teto');
  assert.ok(!/Math\.min\(\s*\d/.test(src), 'nenhum teto numerico escrito a mao');
});

test('o CSS do degrau nao conhece o teto: uma regra so, com variavel', () => {
  const css = readFileSync(new URL('../trilha/css/cards.css', import.meta.url), 'utf8');
  assert.ok(!/\.cdx-tr-in-\d/.test(css), 'nada de uma classe por nivel');
  assert.ok(css.includes('var(--cdx-in, 0)'), 'o nivel chega por variavel');
  assert.ok(css.includes('--cdx-in-step: 10px'), 'o passo encolhe em tela estreita');
});

test('o teto padrao de maxIndentFor e o MAX_INDENT, nao um numero solto', () => {
  const rows = Array.from({ length: MAX_INDENT + 2 }, (_, i) => ({ indent: Math.min(i, MAX_INDENT) }));
  assert.equal(maxIndentFor(rows, rows.length - 1), MAX_INDENT, 'sem cap explicito, vale o teto');
});

test('guidesFromIndent: o ultimo do degrau corta o traco', () => {
  const r = guidesFromIndent([{ indent: 0 }, { indent: 1 }, { indent: 1 }, { indent: 0 }]);
  assert.deepEqual(r.map((x) => [x.depth, x.isLast]), [[0, false], [1, false], [1, true], [0, true]]);
});

test('guidesFromIndent: a coluna so leva traco se ainda vem alguem naquele degrau', () => {
  //  0  A
  //  1    B
  //  2      C     <- A ainda tem D abaixo, entao a coluna 0 leva traco
  //  0  D
  const r = guidesFromIndent([{ indent: 0 }, { indent: 1 }, { indent: 2 }, { indent: 0 }]);
  assert.deepEqual(r[2].guides, [true, false], 'coluna 0 continua (vem D), coluna 1 nao (B era o ultimo)');
});

test('maxIndentFor: nao se pula degrau, e o teto vale', () => {
  const rows = [{ indent: 0 }, { indent: 0 }];
  assert.equal(maxIndentFor(rows, 0), 0, 'o primeiro nunca recua');
  assert.equal(maxIndentFor(rows, 1), 1, 'no maximo um a mais que o de cima');
  assert.equal(maxIndentFor([{ indent: 3 }, { indent: 3 }], 1, 3), 3, 'o teto manda');
});

// A razao pela qual apagar ficou trivial: nada era filho de nada, entao nada e re-parenteado.
test('removeAt promove quem estava recuado sob o apagado', () => {
  const rows = [{ id: 1, indent: 0 }, { id: 2, indent: 1 }, { id: 3, indent: 2 }, { id: 4, indent: 0 }];
  assert.deepEqual(removeAt(rows, 0).map((r) => [r.id, r.indent]), [[2, 0], [3, 1], [4, 0]]);
});

test('removeAt nao mexe em quem ja estava no mesmo degrau ou acima', () => {
  const rows = [{ id: 1, indent: 0 }, { id: 2, indent: 0 }, { id: 3, indent: 1 }];
  assert.deepEqual(removeAt(rows, 0).map((r) => [r.id, r.indent]), [[2, 0], [3, 1]]);
});

// ── 07/08: o degrau move o BLOCO ────────────────────────────────────────────
// Elder: "um item so pode estar uma indentacao do item imediatamente acima; se eu tiro a
// indentacao do terceiro item, todos que vem depois que estao indentados nele devem perder
// indentacao igual".
import { shiftIndent, blockAt } from '../js/item-list.js';

const R = (...ind) => ind.map((indent, i) => ({ id: i + 1, indent }));
const IND = (rows) => rows.map((r) => r.indent);

test('blockAt pega a linha e tudo que esta mais fundo depois dela', () => {
  const rows = R(0, 1, 2, 1, 0);
  // Para no indice 3: degrau IGUAL e irmao, nao esta dentro. So degrau MAIOR entra no bloco.
  assert.deepEqual(blockAt(rows, 1), [1, 3]);
  assert.deepEqual(blockAt(rows, 0), [0, 4], 'o bloco de A vai ate antes do proximo degrau 0');
  assert.deepEqual(blockAt(rows, 4), [4, 5], 'o ultimo e um bloco de si mesmo');
});

test('tirar um degrau leva junto quem estava dentro, pelo mesmo tanto', () => {
  //  0 A / 1 B / 2 C / 2 D / 0 E   ->  tirar o degrau de B
  const rows = R(0, 1, 2, 2, 0);
  assert.deepEqual(IND(shiftIndent(rows, 1, -1)), [0, 0, 1, 1, 0]);
});

test('por um degrau tambem leva o bloco junto', () => {
  //  0 A / 0 B / 1 C   ->  B entra um degrau, e C, que estava dentro de B, vai junto
  const rows = R(0, 0, 1);
  assert.deepEqual(IND(shiftIndent(rows, 1, +1)), [0, 1, 2]);
});

// Um item que ja esta um degrau abaixo do de cima nao tem para onde entrar: entrar de novo
// pularia degrau. E a mesma regra do maxIndentFor, agora valendo para o bloco.
test('quem ja esta um degrau abaixo do de cima nao entra mais', () => {
  const rows = R(0, 1, 2, 0);
  assert.equal(shiftIndent(rows, 1, +1), rows, 'recusado, e devolve a mesma lista');
});

test('recusa o movimento inteiro em vez de aplicar pela metade', () => {
  // A linha movida caberia (1 -> 2), mas o filho dela ja esta no teto: entrar levaria o filho
  // para 6. Este e o caso que parece certo numa lista rasa e quebra numa funda.
  const rows = R(0, 1, MAX_INDENT);
  assert.equal(shiftIndent(rows, 1, +1), rows, 'devolve a MESMA lista, nada aplicado');
});

test('nao se pula degrau nem se sai de onde nao se esta', () => {
  const rows = R(0, 0, 0);
  assert.equal(shiftIndent(rows, 0, +1), rows, 'o primeiro nunca recua');
  assert.equal(shiftIndent(rows, 0, -1), rows, 'nem sai do degrau zero');
  assert.deepEqual(IND(shiftIndent(rows, 1, +1)), [0, 1, 0], 'um a mais que o de cima, pode');
  const dois = R(0, 0);
  assert.equal(shiftIndent(dois, 1, +2), dois, 'dois a mais, nao');
});

test('shiftIndent nao muta a lista que recebeu', () => {
  const rows = R(0, 1, 2);
  const out = shiftIndent(rows, 1, -1);
  assert.deepEqual(IND(rows), [0, 1, 2], 'a original fica intacta');
  assert.deepEqual(IND(out), [0, 0, 1]);
});
