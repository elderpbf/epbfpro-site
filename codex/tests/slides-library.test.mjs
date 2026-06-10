// slides-library.test.mjs — 4c.1 template library (detached copies).
// The library is ONE backend presentation (reserved slug __library__, a reserved
// engine tag so it never shows in the deck list) whose deck-JSON `slides[]` array
// stores reusable slide templates. Covers the service (save/list/remove against a
// mock facade), the two menu helpers (templateMenu + addSlideMenu gating), and the
// source-text wiring contracts (facade-only, injected ctx.library, detached clone).
// Zero-dependency, DOM-free; pure-logic + assert-by-source-text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLibrary, LIBRARY_SLUG, LIBRARY_ENGINE } from '../content/slides/adapters/library.js';
import { addSlideMenu, templateMenu } from '../content/slides/js/edit/menus.js';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

// A mock of the codex-api slides facade: records the register/save calls and
// holds one presentation row + its R2 JSON, like the real backend would.
function mockFacade() {
  const calls = { register: [], save: [], list: 0, get: 0 };
  let row = null;   // the registered presentation row (null until register)
  let data = null;  // the R2 deck JSON (null until first save)
  return {
    calls,
    facade: {
      async list() { calls.list++; return { presentations: row ? [row] : [] }; },
      async getDeck() { calls.get++; return { data }; },
      async saveDeck({ data: d }) { calls.save.push(d); data = d; return { ok: true }; },
      async register({ slug, title, engine }) {
        calls.register.push({ slug, title, engine });
        row = { slug, title, engine };
        return { ok: true };
      },
    },
  };
}

/* ---------- service: save ---------- */
test('save() registers the library container once, under a NON-deck engine tag', async () => {
  const m = mockFacade();
  const lib = createLibrary({ facade: m.facade });
  await lib.save({ id: 'a', layout: 'cards', slots: {} }, 'One');
  await lib.save({ id: 'b', layout: 'topics', slots: {} }, 'Two');
  assert.equal(m.calls.register.length, 1, 'registers once, not per save');
  assert.equal(m.calls.register[0].slug, LIBRARY_SLUG, 'reserved library slug');
  assert.equal(m.calls.register[0].engine, LIBRARY_ENGINE, 'reserved library engine');
  assert.notEqual(m.calls.register[0].engine, 'codex-deck', 'NOT the deck engine (stays out of the deck list)');
});

test('save() deep-clones the slide, gives it a fresh id + the trimmed name, never mutates the source', async () => {
  const m = mockFacade();
  const lib = createLibrary({ facade: m.facade });
  const source = { id: 'orig', layout: 'cards', slots: { cards: [{ id: 'c1', parts: { body: true }, text: 'hi' }] } };
  const tpl = await lib.save(source, '  Pricing  ');
  assert.notEqual(tpl.id, 'orig', 'stored under a fresh id (detached from the source)');
  assert.equal(tpl.name, 'Pricing', 'name is trimmed');
  assert.equal(tpl.layout, 'cards', 'layout carried through');
  assert.equal(source.id, 'orig', 'source slide id untouched');
  assert.ok(!('name' in source), 'source slide is not tagged with the library name');
  tpl.slide.slots.cards[0].text = 'changed';
  assert.equal(source.slots.cards[0].text, 'hi', 'stored template is a DEEP copy of the source');
});

test('save() appends (never overwrites) so the container accumulates templates', async () => {
  const m = mockFacade();
  const lib = createLibrary({ facade: m.facade });
  await lib.save({ id: 'a', layout: 'quote', slots: {} }, 'Q1');
  await lib.save({ id: 'b', layout: 'split', slots: {} }, 'S1');
  const lastSaved = m.calls.save[m.calls.save.length - 1];
  assert.equal(lastSaved.slides.length, 2, 'both templates persisted in the container');
});

/* ---------- service: list ---------- */
test('list() maps the container slides to {id,name,layout,slide}, in insertion order', async () => {
  const m = mockFacade();
  const lib = createLibrary({ facade: m.facade });
  await lib.save({ id: 'x', layout: 'quote', slots: {} }, 'Q1');
  await lib.save({ id: 'y', layout: 'split', slots: {} }, 'S1');
  const out = await lib.list();
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((t) => t.name), ['Q1', 'S1']);
  assert.deepEqual(out.map((t) => t.layout), ['quote', 'split']);
  assert.ok(out.every((t) => typeof t.id === 'string' && t.slide && t.slide.layout === t.layout));
});

test('list() on a never-saved library returns [] (no container yet)', async () => {
  const m = mockFacade();
  const lib = createLibrary({ facade: m.facade });
  assert.deepEqual(await lib.list(), []);
  assert.equal(m.calls.register.length, 0, 'listing alone does not register the container');
});

/* ---------- service: remove ---------- */
test('remove() drops a template by id and persists the smaller container', async () => {
  const m = mockFacade();
  const lib = createLibrary({ facade: m.facade });
  const a = await lib.save({ id: 'x', layout: 'quote', slots: {} }, 'Q1');
  const b = await lib.save({ id: 'y', layout: 'split', slots: {} }, 'S1');
  await lib.remove(a.id);
  const out = await lib.list();
  assert.deepEqual(out.map((t) => t.id), [b.id], 'only the other template remains');
});

/* ---------- menus: addSlideMenu gating ---------- */
test('addSlideMenu gates the "from a template" entry on opts.templates', () => {
  const layouts = [{ id: 'cover', label: 'Capa' }, { id: 'cards', label: 'Cards' }];
  const without = addSlideMenu(layouts);
  assert.deepEqual(without.map((c) => c.id), ['add-cover', 'add-cards'], 'no template entry by default (back-compat)');
  const withT = addSlideMenu(layouts, { templates: true });
  const entry = withT.find((c) => c.id === 'from-template');
  assert.ok(entry, 'adds the from-template entry when templates enabled');
  assert.equal(entry.labelKey, 'slides.tpl_from');
  assert.equal(entry.type, 'button');
});

test('addSlideMenu from-template entry opens the template picker', () => {
  const e = addSlideMenu([{ id: 'cards', label: 'Cards' }], { templates: true }).find((c) => c.id === 'from-template');
  let opened = false;
  e.run({ openTemplatePicker: () => { opened = true; } });
  assert.ok(opened, 'runs app.openTemplatePicker');
});

/* ---------- menus: templateMenu ---------- */
test('templateMenu: each row inserts THAT template; empty library shows a disabled note', () => {
  const empty = templateMenu([]);
  assert.equal(empty.length, 1);
  assert.equal(empty[0].labelKey, 'slides.tpl_none');

  const tpls = [
    { id: 't1', name: 'Pricing', layout: 'cards', slide: {} },
    { id: 't2', name: '', layout: 'quote', slide: {} },
  ];
  const menu = templateMenu(tpls);
  assert.equal(menu.length, 2);
  assert.equal(menu[0].label, 'Pricing', 'a named template uses its name');
  assert.equal(menu[1].label, 'quote', 'an unnamed template falls back to its layout id');
  let inserted = null;
  menu[0].run({ insertTemplate: (t) => { inserted = t; } });
  assert.equal(inserted.id, 't1', 'runs insertTemplate with that template');
});

/* ---------- wiring contracts (source text) ---------- */
test('library.js reaches the backend ONLY through the facade (no callWorker, no raw actions)', () => {
  const src = read('../content/slides/adapters/library.js');
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker()');
  assert.ok(!/get_presentation_json|put_presentation_json|register_presentation|delete_presentation/.test(src),
    'names no raw Worker action strings (the facade owns them)');
  assert.match(src, /from\s+['"]\.\.\/\.\.\/\.\.\/js\/codex-api\.js['"]/, 'imports the slides facade');
  assert.ok(!/—/.test(src), 'no em dashes');
});

test('the library container uses a reserved, non-deck engine tag (invisible in the deck list)', () => {
  const src = read('../content/slides/adapters/library.js');
  assert.match(src, /LIBRARY_ENGINE\s*=\s*['"]codex-library['"]/, 'reserved library engine');
  assert.match(src, /LIBRARY_SLUG\s*=\s*['"]__library__['"]/, 'reserved library slug');
});

test('app.js reads an injected ctx.library and inserts DETACHED template clones', () => {
  const src = read('../content/slides/js/app.js');
  assert.match(src, /ctx\.library/, 'reads ctx.library (injected, like ctx.aiService)');
  assert.match(src, /saveCurrentAsTemplate\s*\(/, 'has saveCurrentAsTemplate');
  assert.match(src, /openTemplatePicker\s*\(/, 'has openTemplatePicker');
  assert.match(src, /insertTemplate\s*\(/, 'has insertTemplate');
  const ins = src.slice(src.indexOf('insertTemplate(tpl)'), src.indexOf('insertTemplate(tpl)') + 400);
  assert.match(ins, /clone\(/, 'deep-clones the template slide');
  assert.match(ins, /\.id\s*=\s*uid\(\)/, 'assigns a fresh slide id (detached)');
  assert.match(ins, /delete\s+\w+\.name/, 'strips the library-only name off the inserted slide');
});

test('the editor core never imports the library service directly (it is injected)', () => {
  const src = read('../content/slides/js/app.js');
  assert.ok(!/adapters\/library/.test(src), 'app.js does not import the library adapter');
});

test('slides.js injects the library service into the editor mount', () => {
  const src = read('../content/slides.js');
  assert.match(src, /createLibrary/, 'imports/creates the library service');
  assert.match(src, /library:/, 'passes library into the editor.mount ctx');
});
