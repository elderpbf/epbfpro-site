// slides-clip.test.mjs, copy/paste of slides = the standard way to share
// (track-35 C, Élder 2026-07-17).
//
// The rule these tests exist to pin down: **linked paste converts BOTH sides**.
// If only the pasted side becomes a ref, "editing one updates the other" is a lie
// half the time, and it's the half Élder doesn't look at (the source deck, which is
// closed). A one-way link passes any naive test: the new deck propagates beautifully.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlideClip, CLIP_KEY } from '../content/slides/adapters/slideClip.js';

// Fake localStorage (the adapter accepts an injected `storage` for exactly this).
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _raw: () => m };
}

// Fake library: counts publications, which is how you prove it does not republish.
function fakeLibrary() {
  const saved = [];
  return {
    saved,
    async save(content, name, opts) {
      const tpl = { id: 'L' + (saved.length + 1), name, from: (opts && opts.from) || null, slide: content };
      saved.push(tpl);
      return tpl;
    },
  };
}

// Fake facade: the decks by slug, and the record of saves.
function fakeFacade(decks) {
  const calls = { saves: [] };
  return {
    calls,
    async getDeck({ slug }) {
      if (!(slug in decks)) throw new Error('not found');
      return { data: JSON.parse(JSON.stringify(decks[slug])) };
    },
    async saveDeck({ slug, data }) { decks[slug] = data; calls.saves.push(slug); return { ok: true }; },
    _deck: (s) => decks[s],
  };
}

const slide = (id, text, ref) => ({ id, layout: 'statement', slots: { text }, ...(ref ? { ref } : {}) });

test('copy is a PURE capture: publishes nothing and does not touch the deck', () => {
  const storage = fakeStorage(), library = fakeLibrary();
  const clip = createSlideClip({ storage, library, facade: fakeFacade({}) });
  const s = slide('s1', 'oi');

  const out = clip.copy([s], { srcSlug: 'jurista', srcTitle: 'Deck Jurista' });

  assert.equal(out.items.length, 1);
  assert.equal(library.saved.length, 0, 'copy does NOT publish: that decision belongs to paste');
  assert.deepEqual(s, slide('s1', 'oi'), 'the source slide comes out of Ctrl+C intact');
  assert.equal(out.srcTitle, 'Deck Jurista', 'the source travels along (linked paste needs it)');
  assert.equal(JSON.parse(storage._raw().get(CLIP_KEY)).items[0].slideId, 's1');
});

test('LOOSE paste: independent copies, fresh id, no ref, does not touch the library', () => {
  const library = fakeLibrary();
  const clip = createSlideClip({ storage: fakeStorage(), library, facade: fakeFacade({}) });
  const payload = clip.copy([slide('s1', 'oi')], { srcSlug: 'jurista' });

  const out = clip.pasteLoose(payload);

  assert.equal(out.length, 1);
  assert.equal(out[0].ref, undefined, 'loose = no link, can diverge');
  assert.notEqual(out[0].id, 's1', 'fresh id');
  assert.equal(out[0].slots.text, 'oi');
  assert.equal(library.saved.length, 0);
});

test('LINKED paste converts BOTH sides (this is the whole rule behind the feature)', async () => {
  const decks = { jurista: { slides: [slide('s1', 'abertura'), slide('s2', 'outro')] } };
  const facade = fakeFacade(decks);
  const library = fakeLibrary();
  const clip = createSlideClip({ storage: fakeStorage(), library, facade });
  const payload = clip.copy([decks.jurista.slides[0]], { srcSlug: 'jurista', srcTitle: 'Deck Jurista' });

  const { slides, sourceFailed } = await clip.pasteLinked(payload);

  assert.equal(sourceFailed.length, 0);
  // pasted side
  assert.equal(slides[0].ref, 'L1', 'the pasted slide points to the new entry');
  assert.equal(slides[0].slots.text, 'abertura');
  // SOURCE side: the one nobody looks at, where the lie would live
  assert.deepEqual(decks.jurista.slides[0], { id: 's1', ref: 'L1' },
    'the SOURCE slide became a link: without this, editing there would change nothing here');
  assert.deepEqual(decks.jurista.slides[1], slide('s2', 'outro'), 'the source deck\'s other slides are untouched');
  assert.equal(library.saved[0].from.title, 'Deck Jurista', 'the entry keeps the source deck (the +slide sections)');
});

test('linked-pasting a slide ALREADY shared reuses the ref: does not republish', async () => {
  // This is the root of the "let me share the same slide infinite times" complaint.
  const decks = { jurista: { slides: [slide('s1', 'abertura', 'L9')] } };
  const facade = fakeFacade(decks);
  const library = fakeLibrary();
  const clip = createSlideClip({ storage: fakeStorage(), library, facade });
  const payload = clip.copy([decks.jurista.slides[0]], { srcSlug: 'jurista' });

  const { slides } = await clip.pasteLinked(payload);

  assert.equal(slides[0].ref, 'L9', 'points to the SAME entry');
  assert.equal(library.saved.length, 0, 'no new entry: one entry per slide, not per paste');
  assert.equal(facade.calls.saves.length, 0, 'does not even need to touch the source deck: it was already linked');
});

test('pasting the SAME clipboard twice does not create two entries', async () => {
  const decks = { jurista: { slides: [slide('s1', 'abertura')] } };
  const clip = createSlideClip({ storage: fakeStorage(), library: (() => { const l = fakeLibrary(); return l; })(), facade: fakeFacade(decks) });
  const library = fakeLibrary();
  const clip2 = createSlideClip({ storage: fakeStorage(), library, facade: fakeFacade(decks) });
  const payload = clip2.copy([slide('s1', 'abertura')], { srcSlug: 'jurista' });

  const a = await clip2.pasteLinked(payload);
  const b = await clip2.pasteLinked(payload);

  assert.equal(library.saved.length, 1, 'the 2nd paste reuses the 1st entry');
  assert.equal(a.slides[0].ref, b.slides[0].ref, 'both pasted slides point to the same slide');
  assert.notEqual(a.slides[0].id, b.slides[0].id, 'but they are different positions in the deck');
  void clip;
});

test('OPEN source: converts in memory and does NOT write from outside (autosave would clobber it)', async () => {
  const decks = { jurista: { slides: [slide('s1', 'abertura')] } };
  const facade = fakeFacade(decks);
  const seen = [];
  const clip = createSlideClip({
    storage: fakeStorage(), library: fakeLibrary(), facade,
    onOpenDeck: (srcSlug, entries) => { seen.push([srcSlug, entries]); return true; },
  });
  const payload = clip.copy([slide('s1', 'abertura')], { srcSlug: 'jurista' });

  const { sourceFailed } = await clip.pasteLinked(payload);

  assert.equal(sourceFailed.length, 0);
  assert.equal(seen.length, 1, 'the open editor handled it');
  assert.equal(seen[0][0], 'jurista');
  assert.equal(facade.calls.saves.length, 0, 'no write from outside the open editor');
});

test('missing source: the paste still HAPPENS and the failure is RETURNED (never a silent one-way link)', async () => {
  const facade = fakeFacade({}); // the source deck no longer exists
  const clip = createSlideClip({ storage: fakeStorage(), library: fakeLibrary(), facade });
  const payload = clip.copy([slide('s1', 'abertura')], { srcSlug: 'sumiu' });

  const { slides, sourceFailed } = await clip.pasteLinked(payload);

  assert.equal(slides[0].ref, 'L1', 'the pasted slide still comes in linked the same way');
  assert.deepEqual(sourceFailed, ['s1'], 'and the caller GETS the failure to warn about it');
});

test('slide deleted from the source deck since Ctrl+C: same rule', async () => {
  const decks = { jurista: { slides: [slide('outro', 'sobrou')] } };
  const facade = fakeFacade(decks);
  const clip = createSlideClip({ storage: fakeStorage(), library: fakeLibrary(), facade });
  const payload = clip.copy([slide('s1', 'abertura')], { srcSlug: 'jurista' });

  const { sourceFailed } = await clip.pasteLinked(payload);

  assert.deepEqual(sourceFailed, ['s1']);
  assert.equal(facade.calls.saves.length, 0, 'does not save a deck that did not change');
  assert.deepEqual(decks.jurista.slides, [slide('outro', 'sobrou')], 'and does not invent the slide back');
});

test('empty/corrupt clipboard = paste does nothing (never throws)', () => {
  const storage = fakeStorage();
  const clip = createSlideClip({ storage, library: fakeLibrary(), facade: fakeFacade({}) });
  assert.equal(clip.read(), null, 'empty');
  storage.setItem(CLIP_KEY, '{isto nao e json');
  assert.equal(clip.read(), null, 'corrupt reads as empty, not as an exception');
  storage.setItem(CLIP_KEY, JSON.stringify({ items: [] }));
  assert.equal(clip.read(), null, 'no items = no clipboard');
});

test('copying SEVERAL slides preserves the ruler order', () => {
  const clip = createSlideClip({ storage: fakeStorage(), library: fakeLibrary(), facade: fakeFacade({}) });
  const out = clip.copy([slide('a', '1'), slide('b', '2'), slide('c', '3')], { srcSlug: 'd' });
  assert.deepEqual(out.items.map((i) => i.slideId), ['a', 'b', 'c']);
  assert.deepEqual(clip.pasteLoose(out).map((s) => s.slots.text), ['1', '2', '3']);
});

// ── The +slide "Library" tab, sectioned by source deck ─────────────
import { groupTemplates } from '../content/slides/js/edit/addslide.js';

const tplFrom = (id, slug, title) => ({ id, name: id, layout: 'cover', from: slug ? { slug, title } : null });

test('groupTemplates sections by the source DECK, alphabetically', () => {
  const out = groupTemplates([
    tplFrom('a', 'jurista', 'Deck Jurista'),
    tplFrom('b', 'advogado', 'Deck Advogado'),
    tplFrom('c', 'jurista', 'Deck Jurista'),
  ]);
  assert.deepEqual(out.map((g) => g.title), ['Deck Advogado', 'Deck Jurista']);
  assert.deepEqual(out[1].items.map((t2) => t2.id), ['a', 'c'], 'the order within a section is insertion order');
});

test('the section title is the deck\'s CURRENT name: renaming the deck renames the section', () => {
  // `from.title` is the name at share time. Freezing on it would leave a section with a
  // name that no longer exists anywhere else on screen.
  const out = groupTemplates([tplFrom('a', 'jurista', 'Nome Velho')], (slug) => (slug === 'jurista' ? 'Nome Novo' : null));
  assert.equal(out[0].title, 'Nome Novo');
});

test('DELETED source deck: falls back to the saved name, does not vanish from the library', () => {
  const out = groupTemplates([tplFrom('a', 'sumiu', 'Deck Que Sumiu')], () => null);
  assert.equal(out[0].title, 'Deck Que Sumiu', 'the entry is still insertable');
});

test('entries WITHOUT a source (save-as-layout, or from before `from` existed) become ONE section, last', () => {
  const out = groupTemplates([
    tplFrom('legado', null),
    tplFrom('a', 'zzz', 'Ultimo Alfabetico'),
    tplFrom('outro-legado', null),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Ultimo Alfabetico');
  assert.equal(out[1].key, '__none__', 'the catch-all is always last');
  assert.deepEqual(out[1].items.map((t2) => t2.id), ['legado', 'outro-legado'], 'nothing is hidden');
});

// ── The "linked paste: nothing happened" bug (Élder 2026-07-17) ────────────
import { createLibrary } from '../content/slides/adapters/library.js';

test('the FIRST save to the library works (the frozen action rejects, does not return empty)', async () => {
  // The exact state: _ensure() just REGISTERED the row, so it exists and has no json.
  // At that instant get_presentation_json REJECTS "not found". _load() swore it would
  // return null there, and did not: it threw. Every 1st publish to the library died, and
  // the throw only reached the debug pill, so on screen "nothing happened".
  const rows = [];
  let container = null;
  const facade = {
    async list() { return { presentations: rows }; },
    async register({ slug }) { rows.push({ slug }); return { ok: true }; },
    async getDeck() {
      if (container === null) throw new Error('not found');
      return { data: container };
    },
    async saveDeck({ data }) { container = data; return { ok: true }; },
  };
  const lib = createLibrary({ facade });

  const tpl = await lib.save({ layout: 'cover', slots: { title: 'oi' } }, 'Primeira');

  assert.equal(tpl.name, 'Primeira');
  assert.equal(container.slides.length, 1, 'the entry really exists in the container');
  // And the second one keeps working (now _load finds json).
  await lib.save({ layout: 'cover', slots: { title: 'dois' } }, 'Segunda');
  assert.equal(container.slides.length, 2);
});

test('a real failure (network/auth) in the library still PROPAGATES: only not-found is an empty container', async () => {
  const facade = {
    async list() { return { presentations: [{ slug: '__library__' }] }; },
    async register() { return { ok: true }; },
    async getDeck() { throw new Error('401 unauthorized'); },
    async saveDeck() { return { ok: true }; },
  };
  const lib = createLibrary({ facade });
  await assert.rejects(() => lib.save({ layout: 'cover' }, 'x'), /401/,
    'swallowing this as "empty container" would wipe the whole library on the next save');
});
