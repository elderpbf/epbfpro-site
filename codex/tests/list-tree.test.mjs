// The grouping engine (js/list-tree.js), tested as what it is: a pure function.
//
// It was extracted OUT of list-rail.js so a consumer whose look is frozen can use the module's
// logic without its pixels (Élder 2026-07-17: "não entendi pq o levels e o módulo não podem atuar
// por trás... a ideia toda do módulo é unificar"). That the extraction did not move the rail's
// markup is proven elsewhere, byte for byte, by list-rail-snapshot.test.mjs. THIS file tests the
// engine's own contract, with no DOM in sight — which is the point of having split it: the
// nesting rules used to be testable only through a stub DOM and a string of HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildTree } = await import('../js/list-tree.js');

const ids = (nodes) => nodes.map((n) => String(n.group.id));
const itemIds = (n) => n.items.map((i) => i.id);

// Lessons-shaped: section > subsection > row, where only SOME sections have a subsection.
const SECS = [{ id: 'llm', title: 'LLMs' }, { id: 'items', title: 'Items' }, { id: 'drive', title: 'Drive' }];
const SUBS = [
  { id: 'type:pdf', title: 'PDF', parent: 'items' },
  { id: 'type:doc', title: 'Doc', parent: 'items' },
  { id: 'folder:aula1', title: 'Aula 1', parent: 'drive' },
];
const ITEMS = [
  { id: 'i1', sec: 'llm', sub: null },
  { id: 'i2', sec: 'items', sub: 'type:pdf' },
  { id: 'i3', sec: 'items', sub: 'type:pdf' },
  { id: 'i4', sec: 'items', sub: 'type:doc' },
  { id: 'i5', sec: 'drive', sub: 'folder:aula1' },
];
const LEVELS = [
  { of: (it) => it.sec, list: () => SECS },
  { of: (it) => it.sub, list: () => SUBS },
];

test('an item lands in its DEEPEST named group, exactly once', () => {
  const { nodes } = buildTree(ITEMS, LEVELS);
  const items = nodes.find((n) => n.group.id === 'items');
  assert.deepEqual(itemIds(items), [], 'i2 named a sub-group, so it is NOT in items own row list');
  assert.deepEqual(ids(items.children), ['type:pdf', 'type:doc']);
  assert.deepEqual(itemIds(items.children[0]), ['i2', 'i3']);
  assert.deepEqual(itemIds(items.children[1]), ['i4']);
});

// The mismatch that stopped Lessons from using the module at all: `items`/`drive` are 3-level,
// their siblings hold rows directly. A fixed-depth engine needs a phantom sub-group for the
// 2-level ones, which the painter would then draw an extra caret for.
test('MIXED depth: a section holding rows directly, beside sections with sub-groups', () => {
  const { nodes } = buildTree(ITEMS, LEVELS);
  const llm = nodes.find((n) => n.group.id === 'llm');
  assert.deepEqual(itemIds(llm), ['i1'], 'llm holds its row directly');
  assert.deepEqual(llm.children, [], 'and no phantom sub-group was invented for it');
});

test('an item naming no known group comes back as loose, never silently dropped', () => {
  const { nodes, loose } = buildTree(
    ITEMS.concat([{ id: 'orphan', sec: 'nope', sub: null }, { id: 'nameless', sec: null, sub: null }]),
    LEVELS);
  assert.deepEqual(loose.map((i) => i.id), ['orphan', 'nameless']);
  assert.equal(nodes.length, 3, 'and the real groups are unaffected');
});

test('depth 4: the recursion is not secretly capped', () => {
  const { nodes } = buildTree([{ id: 'x', a: 'A', b: 'B', c: 'C', d: 'D' }], [
    { of: (i) => i.a, list: () => [{ id: 'A' }] },
    { of: (i) => i.b, list: () => [{ id: 'B', parent: 'A' }] },
    { of: (i) => i.c, list: () => [{ id: 'C', parent: 'B' }] },
    { of: (i) => i.d, list: () => [{ id: 'D', parent: 'C' }] },
  ]);
  const deep = nodes[0].children[0].children[0].children[0];
  assert.equal(deep.group.id, 'D');
  assert.deepEqual(itemIds(deep), ['x'], 'the row landed at the deepest level');
});

test('groups keep their list order, and nesting follows `parent`', () => {
  const { nodes } = buildTree(ITEMS, LEVELS);
  assert.deepEqual(ids(nodes), ['llm', 'items', 'drive'], 'top level in list order');
  assert.deepEqual(ids(nodes.find((n) => n.group.id === 'drive').children), ['folder:aula1'],
    'a drive folder is not a child of items');
});

// ── hideWhenEmpty ────────────────────────────────────────────────────────────
test('hideWhenEmpty drops an empty group; without it the group stays', () => {
  const LIST = () => [{ id: 'cheio' }, { id: 'vazio' }];
  const it = [{ id: 'r', g: 'cheio' }];
  const on = buildTree(it, [{ of: (x) => x.g, list: LIST, hideWhenEmpty: true }]);
  assert.deepEqual(ids(on.nodes), ['cheio']);
  const off = buildTree(it, [{ of: (x) => x.g, list: LIST, hideWhenEmpty: false }]);
  assert.deepEqual(ids(off.nodes), ['cheio', 'vazio'], 'Clientes needs the empty client to render');
});

// Lessons needs BOTH in one level: `items` and `llm` always show, their seven siblings only when
// they have something. A per-level boolean cannot say that.
test('hideWhenEmpty as a PREDICATE: per-group, not per-level', () => {
  const { nodes } = buildTree([{ id: 'r', g: 'items' }], [{
    of: (x) => x.g,
    list: () => [{ id: 'items' }, { id: 'llm' }, { id: 'tarefas' }],
    hideWhenEmpty: (g) => g.id !== 'items' && g.id !== 'llm',
  }]);
  assert.deepEqual(ids(nodes), ['items', 'llm'], 'llm shows while empty; tarefas does not');
});

// "Empty" has to mean empty ALL THE WAY DOWN, or a parent whose children all vanished survives
// as an empty shell.
test('hideWhenEmpty: a parent whose children ALL vanished is empty too', () => {
  const { nodes } = buildTree([], [
    { of: () => null, list: () => [{ id: 'faixa' }], hideWhenEmpty: true },
    { of: (x) => x.g, list: () => [{ id: 'sec', parent: 'faixa' }], hideWhenEmpty: true },
  ]);
  assert.deepEqual(nodes, [], 'the band went with its only section');
});

test('hideWhenEmpty: a parent with no items of its own SURVIVES on a child that has some', () => {
  const { nodes } = buildTree([{ id: 'r', g: 'sec' }], [
    { of: () => null, list: () => [{ id: 'faixa' }], hideWhenEmpty: true },
    { of: (x) => x.g, list: () => [{ id: 'sec', parent: 'faixa' }], hideWhenEmpty: true },
  ]);
  assert.deepEqual(ids(nodes), ['faixa'], 'the band stays: its section has a row');
  assert.deepEqual(ids(nodes[0].children), ['sec']);
});

// ── degenerate inputs ────────────────────────────────────────────────────────
test('no levels = everything is loose; no items = no nodes but the groups still resolve', () => {
  const flat = buildTree([{ id: 'a' }, { id: 'b' }], []);
  assert.deepEqual(flat.loose.map((i) => i.id), ['a', 'b']);
  assert.deepEqual(flat.nodes, []);
  const empty = buildTree([], [{ of: (x) => x.g, list: () => [{ id: 'só' }] }]);
  assert.deepEqual(ids(empty.nodes), ['só'], 'without hideWhenEmpty an empty group is still a group');
});

test('ids are compared as strings (a numeric section id must still match)', () => {
  const { nodes, loose } = buildTree([{ id: 'r', g: 10 }], [{ of: (x) => x.g, list: () => [{ id: '10' }] }]);
  assert.deepEqual(loose, [], 'number 10 matched string "10"');
  assert.deepEqual(itemIds(nodes[0]), ['r']);
});

// The engine is pure: no consumer should be able to corrupt the next build by mutating what it
// got back (courses re-renders on every drop).
test('the returned lists are the engine\'s own, not the config\'s array', () => {
  const LIST = [{ id: 'a' }, { id: 'b' }];
  const { nodes } = buildTree([], [{ of: () => null, list: () => LIST }]);
  nodes.length = 0;
  assert.equal(LIST.length, 2, 'the caller\'s group list survived');
  assert.equal(buildTree([], [{ of: () => null, list: () => LIST }]).nodes.length, 2, 'and rebuilds fine');
});
