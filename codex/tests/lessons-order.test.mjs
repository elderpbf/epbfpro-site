// The two orders a Lessons drag rewrites (Élder 2026-07-17, "pode inserir drag tb"):
// the sidebar's section order and the favourites list.
//
// Both are stored client-side and both show a SUBSET of what they store, which is where the
// bugs are. The drag hands back what the DOM shows; a naive write would then delete
// everything that was off-screen at the time. These tests pin that it does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../lessons/lesson-model.js');

function fakeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    _raw: (k) => map.get(k),
  };
}

// ── applyVisibleOrder ────────────────────────────────────────────────────────
test('applyVisibleOrder: the visible ones refill their own slots, hidden ones do not move', () => {
  // b and d are off-screen. The visible a,c,e are dragged into e,c,a.
  const out = m.applyVisibleOrder(['a', 'b', 'c', 'd', 'e'], ['e', 'c', 'a']);
  assert.deepEqual(out, ['e', 'b', 'c', 'd', 'a'], 'b stays at 1 and d stays at 3');
});

test('applyVisibleOrder: nothing is dropped, invented or duplicated', () => {
  const full = ['preset', 'favorites', 'llm', 'items', 'tarefas'];
  const out = m.applyVisibleOrder(full, ['items', 'llm']);
  assert.deepEqual(out.slice().sort(), full.slice().sort(), 'same members, no loss');
  assert.equal(new Set(out).size, out.length, 'no duplicates');
});

test('applyVisibleOrder: an id that is not in the full list is ignored, not appended', () => {
  assert.deepEqual(m.applyVisibleOrder(['a', 'b'], ['b', 'zz', 'a']), ['b', 'a']);
});

// ── makeSectionOrder ─────────────────────────────────────────────────────────
test('makeSectionOrder: nothing stored = the order Élder designed (the screen does not move)', () => {
  const o = m.makeSectionOrder(fakeStorage());
  assert.deepEqual(o.get(), m.LESSON_SECTION_ORDER);
});

test('makeSectionOrder: a drag persists, and reads back', () => {
  const s = fakeStorage();
  const o = m.makeSectionOrder(s);
  o.set(['items', 'llm']);   // only these two were on screen; items dragged above llm
  const got = m.makeSectionOrder(s).get();
  assert.ok(got.indexOf('items') < got.indexOf('llm'), 'items now precedes llm');
  assert.deepEqual(got.slice().sort(), m.LESSON_SECTION_ORDER.slice().sort(), 'still every section');
});

// The one that bites: `tarefas` renders only when the turma HAS tarefas. Drag with none, and
// a naive "write what the DOM says" drops tarefas from the preference for good.
test('makeSectionOrder: a section that was off-screen during the drag keeps its slot', () => {
  const s = fakeStorage();
  const o = m.makeSectionOrder(s);
  const before = o.get().indexOf('tarefas');
  o.set(['llm', 'items']);   // tarefas is empty this turma, so it was never on screen
  assert.equal(o.get().indexOf('tarefas'), before, 'tarefas did not move');
  assert.ok(o.get().includes('tarefas'), 'and did not vanish');
});

test('makeSectionOrder: a section added to Codex LATER shows up for an admin with a stored order', () => {
  // A preference written before 'labs' existed.
  const s = fakeStorage({ cv_section_order_v1: JSON.stringify(['items', 'llm', 'favorites']) });
  const got = m.makeSectionOrder(s).get();
  assert.ok(got.includes('labs'), 'labs is not silently dropped for having no stored slot');
  assert.deepEqual(got.slice(0, 3), ['items', 'llm', 'favorites'], 'the stored part is honoured first');
  assert.deepEqual(got.slice().sort(), m.LESSON_SECTION_ORDER.slice().sort(), 'and the list is whole');
});

test('makeSectionOrder: junk in storage falls back instead of throwing', () => {
  assert.deepEqual(m.makeSectionOrder(fakeStorage({ cv_section_order_v1: '{not json' })).get(), m.LESSON_SECTION_ORDER);
  assert.deepEqual(m.makeSectionOrder(fakeStorage({ cv_section_order_v1: '"a string"' })).get(), m.LESSON_SECTION_ORDER);
  assert.deepEqual(m.makeSectionOrder(fakeStorage({ cv_section_order_v1: '["nope","items"]' })).get()[0], 'items');
});

// ── makeFavorites: order ─────────────────────────────────────────────────────
test('makeFavorites: all() keeps the stored order (it is what the section renders)', () => {
  const s = fakeStorage({ cv_favorites_v1: JSON.stringify(['9', '3', '7']) });
  assert.deepEqual(m.makeFavorites(s).all(), ['9', '3', '7']);
});

test('makeFavorites: toggle still appends / removes, and reorder persists', () => {
  const s = fakeStorage();
  const f = m.makeFavorites(s);
  f.toggle('1'); f.toggle('2'); f.toggle('3');
  assert.deepEqual(f.all(), ['1', '2', '3'], 'appended in star order');
  f.reorder(['3', '1', '2']);
  assert.deepEqual(m.makeFavorites(s).all(), ['3', '1', '2'], 'the new order survives a reload');
  f.toggle('1');
  assert.deepEqual(f.all(), ['3', '2'], 'unstarring still removes, order intact');
});

// A starred lab lives in the favourites list but never renders in the Favoritos section (it is
// not a vault row). One drag must not unstar it.
test('makeFavorites: reorder keeps a favourite that the section does not render', () => {
  const s = fakeStorage({ cv_favorites_v1: JSON.stringify(['1', 'lab:regex', '2']) });
  const f = m.makeFavorites(s);
  f.reorder(['2', '1']);   // the section only showed the two vault rows
  assert.ok(f.all().includes('lab:regex'), 'the lab is still starred');
  assert.deepEqual(f.all(), ['2', 'lab:regex', '1'], 'and it held its slot');
});

test('makeFavorites: a duplicated id in storage is read once', () => {
  const s = fakeStorage({ cv_favorites_v1: JSON.stringify(['1', '1', '2']) });
  assert.deepEqual(m.makeFavorites(s).all(), ['1', '2']);
});
