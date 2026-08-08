// codex/tests/item-list.test.mjs
// The shared engine for the item list (js/item-list.js) and the editor tree guides.
//
// Exists because Elder caught the duplication (2026-08-05): "na lista de itens do projeto, deve ser
// que nem a lista de liberacoes (nao duplique)... a gente deve ter apenas uma lista de itens e
// cada local que utiliza so faz os filtros necessarios". What these tests lock down is the part
// that CANNOT diverge between the two screens: order by type, accent folding in search, and the
// drawing of the connector lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupByType, sectionsByType, matchesQuery, flattenTree, idsInTree, selectableItems,
} from '../js/item-list.js';
import { guideHtml } from '../content/item-members.js';

const TYPES = [{ slug: 'prompt', label: 'Prompt' }, { slug: 'arquivo', label: 'Arquivo' }];

test('groupByType respects the ct_types registry order', () => {
  const g = groupByType([{ id: 1, type: 'arquivo' }, { id: 2, type: 'prompt' }], TYPES);
  assert.deepEqual(g.map((x) => x.type), ['prompt', 'arquivo']);
});

// A type outside the registry must not DISAPPEAR: it would vanish from the list, from the
// screen that would fix it.
test('unknown type falls to the end, but does not disappear', () => {
  const g = groupByType([{ id: 1, type: 'zzz' }, { id: 2, type: 'prompt' }], TYPES);
  assert.deepEqual(g.map((x) => x.type), ['prompt', 'zzz']);
});

test('sectionsByType delivers label, icon, and count per section', () => {
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

// The SAME folding used everywhere else in Codex: it's what makes "peticao" find "Peticao".
test('matchesQuery folds accents on both sides', () => {
  assert.ok(matchesQuery({ title: 'Modelo de Petição' }, 'peticao'));
  assert.ok(matchesQuery({ title: 'Modelo de Peticao' }, 'petição'));
  assert.ok(matchesQuery({ title: 'Qualquer' }, ''), 'empty search filters nothing');
  assert.ok(!matchesQuery({ title: 'Modelo' }, 'zzz'));
});

test('flattenTree numbers the depth and marks the last sibling', () => {
  const rows = flattenTree([
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
    { id: 2 },
  ]);
  assert.deepEqual(rows.map((r) => [r.item.id, r.depth, r.isLast]), [
    [1, 0, false], [11, 1, false], [12, 1, true], [2, 0, true],
  ]);
});

// The part only the tree has: an ancestor's column carries a vertical line IF that ancestor
// still has a sibling further below. Without this the line keeps going past the last child,
// which is the classic bug in text trees.
test('guides mark only the ancestors that still have a sibling below', () => {
  const rows = flattenTree([
    { id: 1, children: [{ id: 11, children: [{ id: 111 }] }] },
    { id: 2, children: [{ id: 21, children: [{ id: 211 }] }] },
  ]);
  const neto1 = rows.find((r) => r.item.id === 111);
  const neto2 = rows.find((r) => r.item.id === 211);
  // 1 still has 2 below -> its column carries a line; 2 is the last -> it doesn't.
  assert.deepEqual(neto1.guides, [true, false]);
  assert.deepEqual(neto2.guides, [false, false]);
});

test('guideHtml draws one column per level and cuts the vertical on the last', () => {
  assert.equal(guideHtml([], false, 0), '', 'the root has no guide');
  const mid = guideHtml([true], false, 2);
  assert.equal((mid.match(/cdx-mem-guide/g) || []).length, 1);
  assert.ok(mid.includes('is-line'), 'the ancestor with a sibling below carries a line');
  assert.ok(!mid.includes('is-last'));
  assert.ok(guideHtml([false], true, 2).includes('is-last'), 'the last sibling cuts the vertical');
});

test('idsInTree picks up any depth', () => {
  const ids = idsInTree([{ id: 1, children: [{ id: 11, children: [{ id: 111 }] }] }]);
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 11, 111]);
});

// The old guard blocked a group inside a group. Elder rejected it ("o erro e criar
// superficies nao flexiveis de cara"); what remains is just cycle prevention.
test('selectableItems blocks only the item itself and its ancestors', () => {
  const all = [{ id: 1, type: 'projeto' }, { id: 2, type: 'prompt' }, { id: 3, type: 'projeto' }];
  assert.deepEqual(selectableItems(all, 1, []).map((i) => i.id), [2, 3],
    'another group stays selectable');
  assert.deepEqual(selectableItems(all, 2, [3]).map((i) => i.id), [1],
    'the ancestor is excluded, otherwise it forms a loop');
});

// ── 0050: indent instead of tree ────────────────────────────────────────────
// Elder 2026-08-06: "o relacionamento pai-filho real so pertence ao bundle e seus itens. os
// itens dentro estao apenas indentados ou nao, para fins organizacionais".
import { guidesFromIndent, maxIndentFor, removeAt, MAX_INDENT } from '../js/item-list.js';
import { readFileSync } from 'node:fs';

// The ceiling is ONE number (Elder raised it from 3 to 5 on 06/08: "why 3? go to 5 so we can
// test"). These two lock down what actually broke: a `3` hardcoded in the trilha, and a CSS
// with a class per level. With either of those, raising the ceiling doesn't raise the drawing,
// the 4th and 5th steps show up with ZERO indent and it looks like the ceiling never changed.
test('the trilha does not hardcode the ceiling, it imports it from the engine', () => {
  const src = readFileSync(new URL('../trilha/js/projeto.js', import.meta.url), 'utf8');
  assert.ok(/MAX_INDENT.*from '\.\.\/\.\.\/js\/item-list\.js'/.test(src), 'imports the ceiling');
  assert.ok(!/Math\.min\(\s*\d/.test(src), 'no hardcoded numeric ceiling');
});

test('the step CSS does not know the ceiling: a single rule, with a variable', () => {
  const css = readFileSync(new URL('../trilha/css/cards.css', import.meta.url), 'utf8');
  assert.ok(!/\.cdx-tr-in-\d/.test(css), 'no class per level');
  assert.ok(css.includes('var(--cdx-in, 0)'), 'the level arrives via variable');
  assert.ok(css.includes('--cdx-in-step: 10px'), 'the step shrinks on narrow screens');
});

test('maxIndentFor default ceiling is MAX_INDENT, not a loose number', () => {
  const rows = Array.from({ length: MAX_INDENT + 2 }, (_, i) => ({ indent: Math.min(i, MAX_INDENT) }));
  assert.equal(maxIndentFor(rows, rows.length - 1), MAX_INDENT, 'with no explicit cap, the ceiling applies');
});

test('guidesFromIndent: the last of the step cuts the line', () => {
  const r = guidesFromIndent([{ indent: 0 }, { indent: 1 }, { indent: 1 }, { indent: 0 }]);
  assert.deepEqual(r.map((x) => [x.depth, x.isLast]), [[0, false], [1, false], [1, true], [0, true]]);
});

test('guidesFromIndent: the column only carries a line if someone still comes at that step', () => {
  //  0  A
  //  1    B
  //  2      C     <- A still has D below, so column 0 carries a line
  //  0  D
  const r = guidesFromIndent([{ indent: 0 }, { indent: 1 }, { indent: 2 }, { indent: 0 }]);
  assert.deepEqual(r[2].guides, [true, false], 'column 0 continues (D is coming), column 1 does not (B was the last)');
});

test('maxIndentFor: no step can be skipped, and the ceiling applies', () => {
  const rows = [{ indent: 0 }, { indent: 0 }];
  assert.equal(maxIndentFor(rows, 0), 0, 'the first never indents');
  assert.equal(maxIndentFor(rows, 1), 1, 'at most one more than the row above');
  assert.equal(maxIndentFor([{ indent: 3 }, { indent: 3 }], 1, 3), 3, 'the ceiling rules');
});

// The reason deleting became trivial: nothing was a child of anything, so nothing gets re-parented.
test('removeAt promotes whoever was indented under the deleted row', () => {
  const rows = [{ id: 1, indent: 0 }, { id: 2, indent: 1 }, { id: 3, indent: 2 }, { id: 4, indent: 0 }];
  assert.deepEqual(removeAt(rows, 0).map((r) => [r.id, r.indent]), [[2, 0], [3, 1], [4, 0]]);
});

test('removeAt does not touch rows already at the same step or above', () => {
  const rows = [{ id: 1, indent: 0 }, { id: 2, indent: 0 }, { id: 3, indent: 1 }];
  assert.deepEqual(removeAt(rows, 0).map((r) => [r.id, r.indent]), [[2, 0], [3, 1]]);
});

// ── 07/08: the step moves the BLOCK ────────────────────────────────────────────
// Elder: "um item so pode estar uma indentacao do item imediatamente acima; se eu tiro a
// indentacao do terceiro item, todos que vem depois que estao indentados nele devem perder
// indentacao igual".
import { shiftIndent, blockAt } from '../js/item-list.js';

const R = (...ind) => ind.map((indent, i) => ({ id: i + 1, indent }));
const IND = (rows) => rows.map((r) => r.indent);

test('blockAt picks the row and everything deeper after it', () => {
  const rows = R(0, 1, 2, 1, 0);
  // Stops at index 3: an EQUAL step is a sibling, not inside. Only a GREATER step enters the block.
  assert.deepEqual(blockAt(rows, 1), [1, 3]);
  assert.deepEqual(blockAt(rows, 0), [0, 4], "A's block runs up to before the next step-0 row");
  assert.deepEqual(blockAt(rows, 4), [4, 5], 'the last row is a block of itself');
});

test('removing a step level takes along whoever was inside, by the same amount', () => {
  //  0 A / 1 B / 2 C / 2 D / 0 E   ->  remove B's step
  const rows = R(0, 1, 2, 2, 0);
  assert.deepEqual(IND(shiftIndent(rows, 1, -1)), [0, 0, 1, 1, 0]);
});

test('indenting by one step also takes the block along', () => {
  //  0 A / 0 B / 1 C   ->  B enters one step, and C, which was inside B, goes along
  const rows = R(0, 0, 1);
  assert.deepEqual(IND(shiftIndent(rows, 1, +1)), [0, 1, 2]);
});

// A row already one step below the one above has nowhere to go: indenting again would skip a
// step. Same rule as maxIndentFor, now applied to the block.
test('a row already one step below the one above cannot indent further', () => {
  const rows = R(0, 1, 2, 0);
  assert.equal(shiftIndent(rows, 1, +1), rows, 'rejected, returns the same list');
});

test('rejects the whole move instead of applying it halfway', () => {
  // The moved row would fit (1 -> 2), but its child is already at the ceiling: entering would
  // push the child to 6. This is the case that looks fine in a shallow list and breaks in a deep one.
  const rows = R(0, 1, MAX_INDENT);
  assert.equal(shiftIndent(rows, 1, +1), rows, 'returns the SAME list, nothing applied');
});

test('no step can be skipped, nor can a row leave a step it is not at', () => {
  const rows = R(0, 0, 0);
  assert.equal(shiftIndent(rows, 0, +1), rows, 'the first never indents');
  assert.equal(shiftIndent(rows, 0, -1), rows, 'nor does it leave step zero');
  assert.deepEqual(IND(shiftIndent(rows, 1, +1)), [0, 1, 0], 'one more than the row above is allowed');
  const dois = R(0, 0);
  assert.equal(shiftIndent(dois, 1, +2), dois, 'two more is not');
});

test('shiftIndent does not mutate the list it received', () => {
  const rows = R(0, 1, 2);
  const out = shiftIndent(rows, 1, -1);
  assert.deepEqual(IND(rows), [0, 1, 2], 'the original stays intact');
  assert.deepEqual(IND(out), [0, 0, 1]);
});
