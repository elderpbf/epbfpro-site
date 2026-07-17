// Nested grouping: band > section > row (track-41, Élder 2026-07-16 "lets teach it").
//
// The rail grouped ONE level, and Clientes/Turmas is a two-level tree: status band
// (ativos/futuros/inativos) > client group (exclusive accordion, avatar in the head) >
// turma rows. Neither 1-level mapping fit, so the rail learned the outer level rather
// than the screen getting flattened.
//
// Behavioural, against the real bodyHtml output. Two invariants matter most and are easy
// to break later: (1) a band is NOT a drop target, so nesting cannot disturb reorder,
// which lives on .cdx-rail-seclist; (2) the exclusive accordion's open section is the
// CONSUMER's state — the module must never hold a second copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeEl() {
  let html = '';
  return {
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
    parentNode: null,
  };
}

const { mountRail } = await import('../js/list-rail.js');

// Clientes-shaped fixture: 2 status bands, 3 clients, turmas under them.
const TURMAS = [
  { id: 't1', client: 'acme', name: 'Turma A' },
  { id: 't2', client: 'acme', name: 'Turma B' },
  { id: 't3', client: 'globex', name: 'Turma C' },
  { id: 't4', client: 'initech', name: 'Turma D' },
];
const CLIENTS = [
  { id: 'acme', title: 'Acme', status: 'ativos' },
  { id: 'globex', title: 'Globex', status: 'ativos' },
  { id: 'initech', title: 'Initech', status: 'inativos' },
];
const BANDS = [{ id: 'ativos', title: 'Ativos' }, { id: 'futuros', title: 'Futuros' }, { id: 'inativos', title: 'Inativos' }];

function build(over = {}) {
  const el = makeEl();
  const rail = mountRail(el, Object.assign({
    items: () => TURMAS,
    getId: (t) => t.id,
    renderRow: (t) => ({ main: t.name }),
    sections: Object.assign({
      of: (t) => t.client,
      list: () => CLIENTS,
      exclusive: true,
      openId: () => 'acme',
    }, over.sections || {}),
    bands: { of: (sec) => sec.status, list: () => BANDS },
  }, over.cfg || {}));
  rail.render();
  return { el, rail, html: el.innerHTML };
}

test('renders band > section > row, in the band list order', () => {
  const { html } = build();
  assert.match(html, /cdx-rail-band[^>]*data-band="ativos"/, 'the ativos band renders');
  assert.match(html, /cdx-rail-band[^>]*data-band="inativos"/, 'the inativos band renders');
  // Acme (ativos) must come before Initech (inativos), i.e. band order drives layout.
  assert.ok(html.indexOf('data-band="ativos"') < html.indexOf('data-band="inativos"'), 'bands follow list() order');
  assert.ok(html.indexOf('data-sec="acme"') < html.indexOf('data-sec="initech"'), 'sections sit inside their band');
});

test('an empty band is skipped, not rendered as a bare divider', () => {
  const { html } = build();
  assert.ok(!/data-band="futuros"/.test(html), 'no client is futuros, so that band does not render');
});

test('a band is NOT a drop target — the drag contract stays on .cdx-rail-seclist', () => {
  const { html } = build();
  assert.ok(!/data-band="[^"]*"[^>]*data-seclist/.test(html), 'bands never carry data-seclist');
  assert.match(html, /data-seclist="acme"/, 'the section list is still the drop container');
  assert.match(html, /data-seclist="initech"/, 'every section keeps its own drop container');
});

test('exclusive accordion: EXACTLY the openId() section is open, all others collapsed', () => {
  const { html } = build();   // openId() === 'acme'
  assert.match(html, /class="cdx-rail-sec is-open" data-sec="acme"/, 'acme (openId) is open');
  assert.match(html, /class="cdx-rail-sec is-collapsed" data-sec="globex"/, 'globex is collapsed');
  assert.match(html, /class="cdx-rail-sec is-collapsed" data-sec="initech"/, 'initech is collapsed');
  const opens = html.match(/cdx-rail-sec is-open/g) || [];
  assert.equal(opens.length, 1, 'accordion means exactly ONE open, never two');
});

// The bug this guards: if the module kept its own copy of "which section is open", a click
// would flip the class and win until the next render(), then snap back to the consumer's
// state. Proof it holds no copy: change ONLY openId() and re-render — the output must follow.
test('exclusive: the open section is the CONSUMER state, the module keeps no copy', () => {
  let openNow = 'acme';
  const el = makeEl();
  const rail = mountRail(el, {
    items: () => TURMAS,
    getId: (t) => t.id,
    renderRow: (t) => ({ main: t.name }),
    sections: { of: (t) => t.client, list: () => CLIENTS, exclusive: true, openId: () => openNow },
    bands: { of: (sec) => sec.status, list: () => BANDS },
  });
  rail.render();
  assert.match(el.innerHTML, /class="cdx-rail-sec is-open" data-sec="acme"/, 'follows openId at first render');
  openNow = 'globex';                      // only the consumer's truth changed
  rail.render();
  assert.match(el.innerHTML, /class="cdx-rail-sec is-open" data-sec="globex"/, 'follows openId after it changes');
  assert.match(el.innerHTML, /class="cdx-rail-sec is-collapsed" data-sec="acme"/, 'the previous one closed');
  assert.equal((el.innerHTML.match(/cdx-rail-sec is-open/g) || []).length, 1, 'still exactly one open');
});

test('renderHead lets the consumer own the head guts (Clientes needs an avatar there)', () => {
  const { html } = build({
    sections: { renderHead: (sec, count) => ({ main: '<img class="ava"> ' + sec.title + ' (' + count + ')', act: '<button>+</button>' }) },
  });
  assert.match(html, /<img class="ava"> Acme \(2\)/, 'custom head html is used verbatim, with the row count');
  assert.match(html, /cdx-rail-sec-acts"><button>\+<\/button>/, 'custom head actions render');
  assert.match(html, /cdx-rail-sec-caret/, 'the module still owns the caret + head shell');
});

test('bands are ignored without sections (they group sections, nothing else)', () => {
  const el = makeEl();
  const rail = mountRail(el, {
    items: () => TURMAS,
    getId: (t) => t.id,
    renderRow: (t) => ({ main: t.name }),
    bands: { of: () => 'ativos', list: () => BANDS },
  });
  rail.render();
  assert.ok(!/cdx-rail-band/.test(el.innerHTML), 'no sections means no bands');
  assert.match(el.innerHTML, /data-seclist="__flat"/, 'it stays the flat list');
});

// rowClass: state that must live on the row ELEMENT, which renderRow's inner html cannot
// reach. Clientes paints the turma phase as the row's own left border and dims archived ones.
test('rowClass stamps consumer classes on the row element, alongside is-on', () => {
  const { html } = build({
    cfg: {
      selectedId: () => 't1',
      rowClass: (t) => (t.id === 't1' ? 'cdx-ph-live' : 'cdx-ph-done is-archived'),
    },
  });
  assert.match(html, /class="cdx-rail-row is-on cdx-ph-live" data-id="t1"/, 'selected row keeps is-on AND the extra');
  assert.match(html, /class="cdx-rail-row cdx-ph-done is-archived" data-id="t2"/, 'unselected row gets only the extra');
});

test('rowClass is optional: without it the row class is unchanged', () => {
  const { html } = build();
  assert.match(html, /class="cdx-rail-row" data-id="t1"/, 'no trailing space, no stray class');
});

// A client with no turmas yet still has to say so. The text goes INSIDE .cdx-rail-seclist so
// the section stays a drop container — putting it outside would break cross-section drag.
test('an empty section shows emptyText; a filled one never does', () => {
  const EMPTY_CLIENT = CLIENTS.concat([{ id: 'vazio', title: 'Vazio', status: 'ativos' }]);
  const el = makeEl();
  const rail = mountRail(el, {
    items: () => TURMAS,
    getId: (t) => t.id,
    renderRow: (t) => ({ main: t.name }),
    sections: { of: (t) => t.client, list: () => EMPTY_CLIENT, emptyText: 'Nenhuma turma cadastrada.' },
    bands: { of: (sec) => sec.status, list: () => BANDS },
  });
  rail.render();
  const h = el.innerHTML;
  assert.match(h, /data-seclist="vazio"><div class="cdx-rail-secempty">Nenhuma turma cadastrada\.<\/div>/,
    'the client with no turmas says so');
  assert.equal((h.match(/cdx-rail-secempty/g) || []).length, 1, 'only the empty section shows it');
  assert.match(h, /data-seclist="acme">/, 'the filled sections still hold their rows');
  assert.ok(!/data-seclist="acme"><div class="cdx-rail-secempty"/.test(h), 'a filled section never shows it');
});

// The bug: bodyHtml used to take the empty path on "no items", so a screen with clients but
// no turmas yet showed "Nenhum cliente" over a list that HAS clients.
test('no items but sections exist: the sections render, not the empty line', () => {
  const el = makeEl();
  const rail = mountRail(el, {
    items: () => [],
    getId: (t) => t.id,
    renderRow: (t) => ({ main: t.name }),
    emptyText: 'Nenhum cliente.',
    sections: { of: (t) => t.client, list: () => CLIENTS, emptyText: 'Nenhuma turma cadastrada.' },
    bands: { of: (sec) => sec.status, list: () => BANDS },
  });
  rail.render();
  assert.ok(!/cdx-rail-empty/.test(el.innerHTML), 'the whole-list empty line must NOT win');
  assert.match(el.innerHTML, /data-sec="acme"/, 'the clients are still listed');
  assert.equal((el.innerHTML.match(/cdx-rail-secempty/g) || []).length, 3, 'each says it has no turmas');
});

test('genuinely nothing (no items, no sections) still shows the empty line', () => {
  const el = makeEl();
  const rail = mountRail(el, { items: () => [], getId: (t) => t.id, emptyText: 'Nenhum cliente.' });
  rail.render();
  assert.match(el.innerHTML, /<div class="cdx-rail-empty">Nenhum cliente\.<\/div>/);
});

// The mobile drawer closes when you pick "a primary item", and the topbar decides that with a
// selector list it holds by class name. cohorts' bespoke row carried [data-turma-slug] and the
// list named it; migrating to mountRail retired that attribute, so the selector silently matched
// NOTHING and a phone tap updated the dossiê behind a drawer that stayed open.
//
// Two REAL artefacts, compared: the class the rail actually emits, and the selector the topbar
// actually uses. String-matching either one alone is what let this through the first time.
test('the mobile drawer closes on a rail row pick: the topbar selector matches a REAL rail row', () => {
  const { html } = build();
  const rowClasses = /<div class="(cdx-rail-row[^"]*)"/.exec(html);
  assert.ok(rowClasses, 'the rail emits a row');
  const classList = rowClasses[1].split(/\s+/);

  const topbar = readFileSync(join(root, 'js/codex-topbar.js'), 'utf8');
  const decl = /const DRAWER_PICK_SEL = '([^']+)'/.exec(topbar);
  assert.ok(decl, 'codex-topbar declares DRAWER_PICK_SEL');
  const matches = decl[1].split(',').map((s) => s.trim())
    .some((s) => s.startsWith('.') && classList.includes(s.slice(1)));
  assert.ok(matches, 'a rail row must match the drawer pick selector; it is ' + decl[1]);

  // ...and it must be the selector the handler actually consults.
  assert.match(topbar, /e\.target\.closest\(DRAWER_PICK_SEL\)/);
});

test('the 8 migrated rails are untouched: no bands + no exclusive still renders 1 level', () => {
  const el = makeEl();
  const rail = mountRail(el, {
    items: () => TURMAS,
    getId: (t) => t.id,
    renderRow: (t) => ({ main: t.name }),
    sections: { of: (t) => t.client, list: () => CLIENTS },
  });
  rail.render();
  assert.ok(!/cdx-rail-band/.test(el.innerHTML), 'no bands rendered');
  assert.match(el.innerHTML, /data-sec="acme"/, 'plain sections still render');
  assert.match(el.innerHTML, /data-seclist="acme"/, 'drop containers intact');
});
