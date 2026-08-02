// The search capability of js/list-rail.js (fase 2).
//
// The markup is frozen by list-rail-snapshot.test.mjs (shape "labs: search + filter chips").
// What is NOT visible in a snapshot, and is the whole reason the capability lives in the module
// instead of around it, is the REPAINT INVARIANT: a keystroke must never replace the element
// being typed into. content/items.js keeps its search box outside the rail precisely because it
// could not get that guarantee ("kept out of the re-rendered grid so typing never loses focus").
//
// A stub DOM cannot check "did the caret stay put", but it can check the thing that causes the
// caret to move: whether the container's innerHTML was replaced wholesale. If it was not, every
// element inside it — the input included — is the same node it was before the keystroke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEl } from './list-rail-shapes.mjs';

const { mountRail } = await import('../js/list-rail.js');

const LABS = [
  { key: 'k5',  title: 'Tokens',        summary: 'palavra nao e token' },
  { key: 'k6',  title: 'Embeddings',    summary: 'significado vira posicao' },
  { key: 'k20', title: 'Aposta na Citação', summary: 'alucinação jurídica' },
];

function baseCfg(over) {
  return Object.assign({
    items: () => LABS,
    getId: (l) => l.key,
    renderRow: (l) => ({ main: l.title }),
    selectedId: () => null,
    onSelect: () => {},
    search: { fields: (l) => [l.title, l.summary, l.key] },
  }, over || {});
}

// A node whose innerHTML writes are counted, so a test can tell "repainted" from "left alone".
function makeNode() {
  let html = '';
  let writes = 0;
  return {
    scrollTop: 0,
    set innerHTML(v) { html = v; writes += 1; },
    get innerHTML() { return html; },
    get writes() { return writes; },
  };
}

// A container that hands back real child nodes for the selectors renderAfterQuery() looks up,
// and counts its OWN innerHTML writes (one per full render()).
function makeContainer(children) {
  let html = '';
  let writes = 0;
  const listeners = {};
  return {
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener() {},
    querySelector: (sel) => children[sel] || null,
    querySelectorAll: () => [],
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 600 }),
    contains: () => true,
    parentNode: null,
    set innerHTML(v) { html = v; writes += 1; },
    get innerHTML() { return html; },
    get writes() { return writes; },
    fire(ev, e) { (listeners[ev] || []).forEach((fn) => fn(e)); },
  };
}

// The shape onInput() reads: e.target.closest('[data-rail-search]').value
function typeInto(container, text) {
  container.fire('input', {
    target: { value: text, closest: (sel) => (sel === '[data-rail-search]' ? { value: text } : null) },
  });
}

function mounted(over) {
  const body = makeNode();
  const filters = makeNode();
  const foot = makeNode();
  const el = makeContainer({ '.cdx-rail-body': body, '.cdx-rail-filters': filters, '.cdx-rail-foot': foot });
  const rail = mountRail(el, baseCfg(over));
  rail.render();
  return { rail, el, body, filters, foot };
}

// ── the repaint invariant ─────────────────────────────────────────────────────

test('a keystroke does NOT replace the container, so the input element survives', () => {
  const { el } = mounted();
  const afterRender = el.writes;
  typeInto(el, 'tok');
  assert.equal(el.writes, afterRender, 'the container was re-rendered wholesale on a keystroke');
});

test('a keystroke DOES repaint the body with the narrowed rows', () => {
  const { el, body } = mounted();
  typeInto(el, 'embeddings');
  assert.match(body.innerHTML, /Embeddings/);
  assert.doesNotMatch(body.innerHTML, /Tokens/);
});

test('a keystroke repaints the chips too, so their counts cannot contradict the body', () => {
  const { el, filters } = mounted({
    filter: {
      chips: (q) => [{ key: 'all', label: 'Todos', count: LABS.filter((l) => !q || l.title.toLowerCase().includes(q.toLowerCase())).length }],
      active: () => 'all',
      onFilter: () => {},
    },
  });
  const before = filters.writes;
  typeInto(el, 'tokens');
  assert.ok(filters.writes > before, 'the filter row was left stale');
  assert.match(filters.innerHTML, /Todos <span class="cdx-rail-chip-n">1<\/span>/);
});

test('a keystroke repaints the footer', () => {
  const { el, foot } = mounted({ footer: () => 'rodape' });
  const before = foot.writes;
  typeInto(el, 'x');
  assert.ok(foot.writes > before);
});

test('a new query scrolls the body back to the top (the old offset points at gone rows)', () => {
  const { el, body } = mounted();
  body.scrollTop = 400;
  typeInto(el, 'tok');
  assert.equal(body.scrollTop, 0);
});

test('a full render() still replaces the container and restores the typed value', () => {
  const { rail, el } = mounted();
  typeInto(el, 'tok');
  const before = el.writes;
  rail.render();
  assert.ok(el.writes > before, 'render() must still be a full repaint');
  assert.match(el.innerHTML, /value="tok"/, 'the query survives a data-mutation render');
});

// ── filtering ─────────────────────────────────────────────────────────────────

test('filters the rows by the query', () => {
  // Painted with no query: every row is there.
  const el = makeEl();
  mountRail(el, baseCfg()).render();
  assert.match(el.innerHTML, /Tokens/);
  // A query that hits nothing empties the BODY. Asserting on the container instead would test
  // the wrong thing and pass for the wrong reason: the container still holds the markup from
  // the last full render, which is precisely the invariant — a keystroke does not touch it.
  const { body } = (() => { const m = mounted(); typeInto(m.el, 'zzz'); return m; })();
  assert.doesNotMatch(body.innerHTML, /Tokens/);
});

test('the query ignores accents (js/text-search.js reaches the rail too)', () => {
  const { el, body } = mounted();
  typeInto(el, 'citacao');
  assert.match(body.innerHTML, /Citação/);
});

test('a search matches any of the declared fields, not just the title', () => {
  const { el, body } = mounted();
  typeInto(el, 'k20');                     // the key
  assert.match(body.innerHTML, /Citação/);
  typeInto(el, 'posicao');                 // the summary, unaccented
  assert.match(body.innerHTML, /Embeddings/);
});

test('a blank query shows everything again', () => {
  const { el, body } = mounted();
  typeInto(el, 'tokens');
  typeInto(el, '');
  for (const l of LABS) assert.match(body.innerHTML, new RegExp(l.title.slice(0, 6)));
});

test('a whitespace-only query is treated as blank, not as a search for a space', () => {
  const { el, body } = mounted();
  typeInto(el, '   ');
  assert.match(body.innerHTML, /Tokens/);
  assert.match(body.innerHTML, /Embeddings/);
});

// ── the query is the rail's, and the consumer can read it ────────────────────

test('rail.query() reports the live query', () => {
  const { rail, el } = mounted();
  assert.equal(rail.query(), '');
  typeInto(el, 'tok');
  assert.equal(rail.query(), 'tok');
});

test('search.onChange fires with the new query', () => {
  const seen = [];
  const { el } = mounted({ search: { fields: (l) => [l.title], onChange: (q) => seen.push(q) } });
  typeInto(el, 'to');
  typeInto(el, 'tok');
  assert.deepEqual(seen, ['to', 'tok']);
});

// ── empty states during a search ─────────────────────────────────────────────

test('a query with no hits shows the empty state, and it receives the query', () => {
  const seen = [];
  const { el, body } = mounted({ emptyText: (q) => { seen.push(q); return 'nada para ' + q; } });
  typeInto(el, 'zzz');
  assert.match(body.innerHTML, /nada para zzz/);
  assert.ok(seen.includes('zzz'));
});

test('emptyHtml also receives the query', () => {
  const { el, body } = mounted({ emptyHtml: (q) => '<i>' + q + '</i>' });
  typeInto(el, 'zzz');
  assert.match(body.innerHTML, /<i>zzz<\/i>/);
});

test('a group that keeps no row disappears during a search, and reappears when it clears', () => {
  const grouped = {
    items: () => LABS,
    getId: (l) => l.key,
    renderRow: (l) => ({ main: l.title }),
    sections: {
      of: (l) => (l.key === 'k20' ? 'aluc' : 'base'),
      list: () => [{ id: 'base', title: 'Fundamentos' }, { id: 'aluc', title: 'Alucinação' }],
    },
  };
  const { el, body } = mounted(grouped);
  typeInto(el, 'tokens');
  assert.doesNotMatch(body.innerHTML, /Alucina/, 'an empty group stayed on screen during a search');
  assert.match(body.innerHTML, /Fundamentos/);
  typeInto(el, '');
  assert.match(body.innerHTML, /Alucina/, 'the group did not come back when the search cleared');
});

test('with NO search active, an empty group still shows (the pre-search contract is untouched)', () => {
  const el = makeEl();
  mountRail(el, {
    items: () => [],
    getId: (x) => x.id,
    renderRow: () => ({ main: '' }),
    sections: { of: () => 'a', list: () => [{ id: 'a', title: 'Cliente sem turma' }], emptyText: 'nenhuma turma' },
  }).render();
  assert.match(el.innerHTML, /Cliente sem turma/);
  assert.match(el.innerHTML, /nenhuma turma/);
});

// ── the capability is inert when not configured ──────────────────────────────

test('no search config emits no search row and no input', () => {
  const el = makeEl();
  mountRail(el, {
    items: () => LABS, getId: (l) => l.key, renderRow: (l) => ({ main: l.title }),
  }).render();
  assert.doesNotMatch(el.innerHTML, /cdx-rail-search/);
  assert.doesNotMatch(el.innerHTML, /data-rail-search/);
});

test('rail.query() is empty for a rail with no search', () => {
  const el = makeEl();
  const rail = mountRail(el, { items: () => LABS, getId: (l) => l.key, renderRow: () => ({ main: '' }) });
  rail.render();
  assert.equal(rail.query(), '');
});

// ── chips: the array form still works ────────────────────────────────────────

test('filter.chips still accepts a plain array (the original contract)', () => {
  const el = makeEl();
  mountRail(el, {
    items: () => LABS, getId: (l) => l.key, renderRow: (l) => ({ main: l.title }),
    filter: { chips: [{ key: 'all', label: 'Todos', count: 3 }], active: () => 'all', onFilter: () => {} },
  }).render();
  assert.match(el.innerHTML, /data-rail-filter="all"/);
  assert.match(el.innerHTML, /Todos <span class="cdx-rail-chip-n">3<\/span>/);
});

test('filter.chips as a function receives the live query', () => {
  const seen = [];
  const { el } = mounted({
    filter: { chips: (q) => { seen.push(q); return [{ key: 'all', label: 'Todos' }]; }, active: () => 'all', onFilter: () => {} },
  });
  typeInto(el, 'tok');
  assert.ok(seen.includes('tok'));
});
