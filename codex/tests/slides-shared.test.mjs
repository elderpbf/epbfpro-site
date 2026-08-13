// slides-shared.test.mjs, shared slides (track-35 C): the slide that lives in
// several decks and, edited in one, changes in all of them.
//
// What these tests protect is ONE inversion. This design's failure mode is not
// "doesn't propagate" (Élder sees that right away), it is the OPPOSITE: hydrated content
// getting written back INSIDE the deck. Then every link silently becomes a detached copy,
// the deck keeps opening the same, and a naive smoke test passes. That's why the axis of
// these tests is the hydrate/dehydrate pair, not the UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSharedSlides, sharedContent, isRef, isLinked } from '../content/slides/adapters/sharedSlides.js';
import { createLibrary } from '../content/slides/adapters/library.js';

// Reads the SOURCE of a slides file, ALWAYS normalizing CRLF -> LF. The deploy gate runs on
// a fresh checkout where git (autocrlf) delivers files in CRLF; helpers that look for
// `\n}\n` or `\n    },` to find the end of a function break under `\r\n`. This passed here
// (LF worktree) and failed in the merge worktree, exactly what the gate exists to catch.
const readSrc = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// The core (app.js) mounts with DOM, so the app->adapter seam is read from the SOURCE. It's
// the same language as the repo's other contract tests (modules.test.mjs, slides-i18n-menus).
const APP_SRC = readSrc('../content/slides/js/app.js');
// ONE-LINE methods (`addSlide(id) { ...; },`) stop on their own line. Without this the cut
// would go to the NEXT multi-line method's `\n    },` and return the body of three methods
// together: a guard asking "does addSlide call commit?" would answer yes because the
// removeSlide further down did. A guard that reads its neighbor is not a guard.
const methodOf = (name) => {
  let i = APP_SRC.indexOf(`    ${name}(`);
  if (i < 0) i = APP_SRC.indexOf(`    async ${name}(`); // shareCurrentSlide is async
  assert.ok(i > 0, `${name} exists in app.js`);
  const oneLine = APP_SRC.slice(i, APP_SRC.indexOf('\n', i));
  if (/\},\s*$/.test(oneLine)) return oneLine;
  const end = APP_SRC.indexOf('\n    },', i);
  assert.ok(end > i, `${name} ends at the expected method close`);
  return APP_SRC.slice(i, end);
};

// A fake library with the surface sharedSlides uses. `writes` counts the trips to the
// server, which is what the dirty-check promises to save.
function fakeLibrary(templates = []) {
  const store = new Map(templates.map((t) => [t.id, t]));
  const lib = {
    writes: 0,
    async list() { return [...store.values()].map((t) => ({ id: t.id, name: t.name || '', layout: t.slide.layout, slide: t.slide })); },
    async updateMany(entries) {
      lib.writes++;
      for (const e of entries) {
        const cur = store.get(e.id);
        if (!cur) continue; // same as the real adapter: a vanished id does not come back
        store.set(e.id, { ...cur, slide: { ...e.slide, id: e.id, name: cur.name } });
      }
      return entries;
    },
    _peek: (id) => store.get(id),
  };
  return lib;
}

const tpl = (id, text) => ({ id, name: 'Abertura', slide: { id, name: 'Abertura', layout: 'statement', slots: { text }, notes: 'n' } });
const deckWith = (slides) => ({ id: 'd1', slides, canvas: { w: 1280, h: 720 } });

test('hydrate resolves the {id, ref} stub into the library content, keeping the ref', async () => {
  const lib = fakeLibrary([tpl('L1', 'do jurista')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 'inline', layout: 'cover', slots: {} }, { id: 's2', ref: 'L1' }]);

  await shared.hydrate(deck);

  assert.equal(deck.slides[0].layout, 'cover', 'the inline slide is untouched');
  const linked = deck.slides[1];
  assert.equal(linked.id, 's2', 'the deck-local id is preserved');
  assert.equal(linked.ref, 'L1', 'the ref SURVIVES hydration (otherwise saving turns it into a copy)');
  assert.equal(linked.slots.text, 'do jurista', 'the content came from the library');
  assert.equal(linked.name, undefined, '`name` is library metadata, not a slide field');
});

test('dehydrate turns the linked slide back into {id, ref} and does not touch the in-memory deck', async () => {
  const lib = fakeLibrary([tpl('L1', 'original')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }]);
  await shared.hydrate(deck);

  const out = await shared.dehydrate(deck);

  assert.deepEqual(out.slides[0], { id: 's1', ref: 'L1' }, 'on disk it is ONLY the link');
  assert.equal(deck.slides[0].slots.text, 'original', 'the deck the editor renders stays hydrated');
});

test('editing a linked slide writes to the library (this is what makes it change in other decks)', async () => {
  const lib = fakeLibrary([tpl('L1', 'antes')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }]);
  await shared.hydrate(deck);

  deck.slides[0].slots.text = 'depois';       // the editor edits the hydrated slide
  await shared.dehydrate(deck);                // autosave goes through here

  assert.equal(lib._peek('L1').slide.slots.text, 'depois', 'the library received the edit');
  assert.equal(lib._peek('L1').name, 'Abertura', 'the entry name is not lost on save');

  // And the other deck sees it: hydrating a NEW deck with the same ref brings the new text.
  const outro = deckWith([{ id: 'x9', ref: 'L1' }]);
  await createSharedSlides({ library: lib }).hydrate(outro);
  assert.equal(outro.slides[0].slots.text, 'depois', 'the 2nd deck reflects the 1st\'s edit');
});

test('COPYING is not linking: a slide with no ref never reaches the library', async () => {
  const lib = fakeLibrary([tpl('L1', 'da biblioteca')]);
  const shared = createSharedSlides({ library: lib });
  // What app.insertTemplate produces: a clone of the content, a fresh id, NO ref.
  const deck = deckWith([{ id: 'copia', layout: 'statement', slots: { text: 'da biblioteca' } }]);

  deck.slides[0].slots.text = 'editado só aqui';
  const out = await shared.dehydrate(deck);

  assert.equal(lib.writes, 0, 'no write: the copy is detached');
  assert.equal(lib._peek('L1').slide.slots.text, 'da biblioteca', 'the library did not change');
  assert.equal(out.slides[0].slots.text, 'editado só aqui', 'the copy persists in full in the deck');
});

test('autosave only writes to the library what CHANGED', async () => {
  const lib = fakeLibrary([tpl('L1', 'a'), tpl('L2', 'b')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }, { id: 's2', ref: 'L2' }, { id: 's3', layout: 'cover', slots: {} }]);
  await shared.hydrate(deck);

  await shared.dehydrate(deck);
  assert.equal(lib.writes, 0, 'saving without editing anything does not write to the library');

  deck.slides[2].slots.title = 'mexi no slide INLINE'; // not linked
  await shared.dehydrate(deck);
  assert.equal(lib.writes, 0, 'editing a regular slide does not drag the library along');

  deck.slides[0].slots.text = 'a2';
  await shared.dehydrate(deck);
  assert.equal(lib.writes, 1, 'a real edit writes');
  assert.equal(lib._peek('L2').slide.slots.text, 'b', 'the linked slide that did not change stays intact');

  await shared.dehydrate(deck);
  assert.equal(lib.writes, 1, 'saving again without editing does not rewrite');
});

test('a broken ref degrades visibly, keeps the link, and NEVER publishes the notice to the library', async () => {
  const lib = fakeLibrary([tpl('L1', 'viva')]);
  const shared = createSharedSlides({ library: lib, message: 'Slide compartilhado não encontrado' });
  const deck = deckWith([{ id: 's1', ref: 'SUMIU' }]);

  await shared.hydrate(deck);
  const s = deck.slides[0];
  assert.equal(s._broken, true, 'the slide declares itself broken (the ruler badges on this)');
  assert.equal(s.slots.text, 'Slide compartilhado não encontrado', 'the audience/editor sees the reason');
  assert.equal(s.ref, 'SUMIU', 'the ref is NOT thrown away: the link can still be fixed');

  const out = await shared.dehydrate(deck);
  assert.equal(lib.writes, 0, 'the placeholder does not become library content');
  assert.deepEqual(out.slides[0], { id: 's1', ref: 'SUMIU' }, 'on disk it is still the same link');
});

test('library unreachable: the deck OPENS, the link degrades, and the failure goes to the debug pill', async () => {
  const logged = [];
  globalThis.window = { bsLog: (m, lvl) => logged.push([m, lvl]) }; // debug pill (CLAUDE.md rule)
  try {
    const lib = { async list() { throw new Error('worker 500'); }, async updateMany() { throw new Error('nope'); } };
    const shared = createSharedSlides({ library: lib, message: 'não encontrado' });
    const deck = deckWith([{ id: 's1', ref: 'L1' }, { id: 's2', layout: 'cover', slots: {} }]);

    await shared.hydrate(deck); // must not reject
    assert.equal(deck.slides[0]._broken, true);
    assert.equal(deck.slides[1].layout, 'cover', 'the rest of the deck opens normally');
    assert.equal(logged.length, 1, 'the error is NOT swallowed');
    assert.equal(logged[0][1], 'error');
    assert.match(logged[0][0], /worker 500/, 'with the real detail, not a generic message');
  } finally {
    delete globalThis.window;
  }
});

test('a deck with nothing shared = like today: not even one call to the library', async () => {
  let touched = false;
  const lib = { async list() { touched = true; return []; }, async updateMany() { touched = true; } };
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', layout: 'cover', slots: { title: 'oi' } }]);

  await shared.hydrate(deck);
  const out = await shared.dehydrate(deck);

  assert.equal(touched, false, 'no ref => no trip to the library');
  assert.deepEqual(out, deck, 'the deck comes out the same as it went in');
});

test('the load->undo->save cycle preserves the link (the snapshot carries the ref along)', async () => {
  const lib = fakeLibrary([tpl('L1', 'v1')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }]);
  await shared.hydrate(deck);

  // history.js takes a snapshot of the WHOLE deck as JSON and reapplies it: it's the path
  // where a careless design would lose the ref and silently turn the link into a copy.
  const snap = JSON.parse(JSON.stringify(deck));
  deck.slides[0].slots.text = 'v2';
  const restored = JSON.parse(JSON.stringify(snap));

  assert.equal(restored.slides[0].ref, 'L1', 'undo returns a slide that is still linked');
  const out = await shared.dehydrate(restored);
  assert.deepEqual(out.slides[0], { id: 's1', ref: 'L1' });
});

test('sharedContent strips what belongs to the deck and keeps what belongs to the slide', () => {
  const c = sharedContent({ id: 'local', ref: 'L1', name: 'x', layout: 'topics', slots: { a: 1 }, notes: 'n', build: ['a:1'], buildFx: { 'a:1': { fx: 'zoom' } }, overrides: { k: {} } });
  assert.deepEqual(Object.keys(c).sort(), ['build', 'buildFx', 'notes', 'overrides', 'slots'].concat(['layout']).sort());
  assert.equal(c.id, undefined);
  assert.equal(c.ref, undefined);
  assert.equal(c.name, undefined);
  assert.equal(c.buildFx['a:1'].fx, 'zoom', 'animation is slide content, so it is shared');
});

test('isRef vs isLinked: on-disk stub vs hydrated slide', () => {
  assert.equal(isRef({ id: 's', ref: 'L1' }), true);
  assert.equal(isRef({ id: 's', ref: 'L1', layout: 'cover' }), false, 'already hydrated is no longer a stub');
  assert.equal(isRef({ id: 's', layout: 'cover' }), false);
  assert.equal(isLinked({ id: 's', ref: 'L1', layout: 'cover' }), true);
  assert.equal(isLinked({ id: 's', layout: 'cover' }), false);
});

// ── The app -> adapter seam (what Élder exercises by hand in the preview) ────

test('app.linkTemplate produces a slide the adapter recognizes as linked', () => {
  const src = methodOf('linkTemplate');
  assert.match(src, /s\.ref = tpl\.id/, 'the link points at the library entry\'s id');
  assert.match(src, /s\.id = uid\(\)/, 'the deck-local id is fresh (does not collide with another deck)');
  assert.match(src, /delete s\.name/, '`name` is library metadata, does not go on the slide');
  assert.match(src, /this\.commit\(\)/,
    'explicit commit(): goTo does not touch the store, and an unpersisted link = a link that never happened');
  // What it builds has to pass the adapter's guards.
  const built = { id: 'novo', ref: 'L1', layout: 'statement', slots: { text: 'x' } };
  assert.equal(isLinked(built), true);
  assert.equal(isRef(built), false, 'already hydrated, not a stub');
});

test('app.insertTemplate (COPY) still has no ref: that is the default and must not have changed', () => {
  const src = methodOf('insertTemplate');
  assert.doesNotMatch(src, /\.ref\s*=/, 'copying NEVER creates a link');
  assert.match(src, /s\.id = uid\(\)/);
});

test('app.detachSet removes the link and the broken state, keeping the content', () => {
  const src = methodOf('detachSet');
  assert.match(src, /delete s\.ref/, 'no ref => dehydrate persists the whole slide in the deck');
  assert.match(src, /delete s\._broken/, 'unlinking a ref clears the placeholder too');
  assert.match(src, /this\.record\(\)/, 'it is undoable');
  assert.match(methodOf('detachCurrent'), /this\.detachSet\(\[this\.cur\(\)\]\)/, 'the singular is the one-item set');
});

test('the share button EXISTS and states both states', () => {
  // I REMOVED the button, reading "it would be little used" as "take it out". Élder corrected
  // me right away (2026-07-17): "só disse que ele seria pouco usado, não que deveria deixar de
  // existir" (I only said it would be little used, not that it should stop existing). It is
  // the only door that works without a 2nd deck to paste into. This test exists so I do not
  // prune again what he told me to keep.
  const src = methodOf('syncShareBtn');
  assert.match(src, /shr_share/, 'regular slide -> share');
  assert.match(src, /shr_shared_tip/, 'already-shared slide -> still says "share", the tint shows the state');
  assert.doesNotMatch(src, /shr_detach/, 'the button does NOT become "detach" (Élder: no such notice on re-sharing)');
});

// The flow (which deck? linked or loose? unlink?) lives in edit/shareflow.js, no longer
// inline in wireChrome (Élder 2026-07-17: "nada a gente escreve inline" - we don't write
// anything inline). The flow tests read the module's SOURCE, like the rest of the repo does
// for the mounted core.
const SHAREFLOW_SRC = readSrc('../content/slides/js/edit/shareflow.js');
const shareFlowFn = (name) => {
  const start = SHAREFLOW_SRC.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists in shareflow.js');
  const end = SHAREFLOW_SRC.indexOf('\n}\n', start);
  return SHAREFLOW_SRC.slice(start, end > start ? end : undefined);
};

test('unlinking is not forced on share: it is an option, only when ALL are linked', () => {
  // Élder 2026-07-17: clicking share on an already-shared slide opened "Desvincular?"
  // (Unlink?). Sharing again is safe (it just points more decks at the same entry), so the
  // click goes to the normal flow; unlinking is an OPTION, and only appears when the whole
  // selection is linked (a mix = share only). The confirm only fires when the user chooses
  // to unlink.
  const src = shareFlowFn('openShareFlow');
  assert.match(src, /if \(allLinked\) options\.push\(\{ value: "__unlink__"/, 'unlink only when allLinked');
  assert.match(src, /const allLinked = nonBroken\.every\(\(s\) => app\.isShared\(s\)\)/, 'allLinked = all linked');
  assert.match(src, /if \(target === "__unlink__"\)[\s\S]{0,400}window\.confirm[\s\S]{0,120}app\.detachSet/, 'choosing unlink confirms and unlinks the set');
  const where = src.indexOf('__here__');
  const unlink = src.indexOf('__unlink__');
  assert.ok(where > 0 && unlink > where, 'unlink comes AFTER the destinations, at the end of the list');
});

test('this-deck only appears if SOMETHING is not yet linked (otherwise there is nothing to publish)', () => {
  const src = shareFlowFn('openShareFlow');
  assert.match(src, /const someUnlinked = nonBroken\.some\(\(s\) => !app\.isShared\(s\)\)/);
  assert.match(src, /if \(someUnlinked\) options\.push\(\{ value: "__here__"/, 'with no loose slide in the selection, "this deck" disappears');
});

test('the link glyph on the ruler is a clickable SHORTCUT to the same flow', () => {
  // Élder 2026-07-17: "os slides vinculados já têm aquele glifo... clicar nele deveria abrir o
  // modal de desvinculação, usando o que a gente tem" (linked slides already have that glyph...
  // clicking it should open the unlink modal, using what we already have). The badge became a
  // <button data-lnk> and leads to the SAME app.openShareFlow, with stopPropagation so it does
  // not turn into thumb navigation.
  const nav = readSrc('../content/slides/js/edit/navigator.js');
  assert.match(nav, /<button[^>]*class="lnkbadge[^"]*"[^>]*data-lnk="\$\{i\}"/, 'the badge is a button with data-lnk');
  assert.match(nav, /\[data-lnk\][\s\S]{0,220}stopPropagation\(\)[\s\S]{0,120}app\.openShareFlow\(\[s\]\)/, 'clicking opens the flow for that slide, without navigating');
});

test('the share button operates on the ruler\'s SELECTION, not just the current slide', () => {
  // Multi-pick + clicking share = act on all selected (Élder 2026-07-17: "pode selecionar
  // vários e clicar no botão de compartilhar" - you can select several and click the share
  // button, all in the same modal).
  assert.match(APP_SRC, /shareBtn\.onclick = \(\) => app\.openShareFlow\(app\.pickedSlides\(\)\)/, 'the button passes the selection to the flow');
  assert.match(methodOf('pickedSlides'), /this\.picked\(\)\.map/, 'pickedSlides = the selection as objects');
  // And shareSetTo handles a set: sends the whole array to sendLinked/sendLoose.
  assert.match(methodOf('shareSetTo'), /sendLoose\(target\.slug, set\.map/, 'loose-out sends the set');
  assert.match(methodOf('shareSetTo'), /sendLinked\(target\.slug, refs\)/, 'linked-out sends all the refs');
});

test('share does NOT ask for a name: it asks the DECK, then linked or loose', () => {
  // Élder 2026-07-17: "modal perguntando se é para esse deck ou outro, com opção de criar um
  // novo ali; depois abre o modal de vincular ou solto" (a modal asking whether it's for this
  // deck or another, with the option to create a new one there; then it opens the
  // linked-or-loose modal). The name leaves the picture.
  assert.doesNotMatch(SHAREFLOW_SRC, /window\.prompt/, 'no name prompt anywhere in the flow');
  assert.match(SHAREFLOW_SRC, /shr_where_title/, '1st question: which deck');
  assert.match(SHAREFLOW_SRC, /shr_where_new/, 'with the option to create a new deck right there');
  const src = shareFlowFn('openShareFlow');
  const where = src.indexOf('askChoice(app.root');
  const how = src.indexOf('askHowMode(app.root');
  assert.ok(where > 0 && how > where, 'the 2nd question (how) comes AFTER the 1st (where)');
  // The "how?" is askHowMode, the SAME function paste uses: one act, one vocabulary.
  assert.match(shareFlowFn('askHowMode'), /clip_paste_linked/, 'reuses paste\'s options, does not invent others');
  assert.match(methodOf('onPaste'), /askHowMode\(/, 'and paste calls the same function (no inline askChoice duplicate)');
});

test('sharing stamps the same source deck that paste does', () => {
  // Otherwise the SAME entry sections or not on the Library tab depending on which door it went through.
  assert.match(methodOf('shareSetTo'), /from: \{ slug: this\._slug, title: this\._deckTitle \}/);
});

test('LOOSE share publishes nothing to the library', () => {
  // Loose = independent copy. Publishing would create an entry nobody tracks.
  const src = methodOf('shareSetTo');
  const loose = src.indexOf('if (mode === "loose")');
  const save = src.indexOf('this._library.save');
  assert.ok(loose > 0 && save > loose, 'the loose path exits before any publish');
  assert.match(src, /duplicateSlide\(s\)/, 'loose within the same deck is duplicating each one (independent copy)');
});

test('LINKED share reuses the ref and does NOT create a twin (publishes in place)', () => {
  const src = methodOf('shareSetTo');
  assert.match(src, /let ref = s\.ref;[\s\S]{0,40}if \(!ref\)/, 'only publishes if it has no entry yet');
  assert.match(src, /s\.ref = ref;/, 'publishes IN PLACE: the slide itself becomes the shared one');
  assert.match(src, /if \(here\) return \{ ok: true, mode, here/, 'this-deck + linked does NOT insert a 2nd copy (no twin)');
  assert.doesNotMatch(src, /splice\([^)]*slideContent/, 'never splices a copy of the content in (the dead twin)');
});

test('inserting lands right AFTER the selected slide, never at the end', () => {
  // Élder 2026-07-17: "deve inserir logo após o slide que está selecionado na barra" (it
  // should insert right after the slide selected in the bar).
  for (const m of ['linkTemplate', 'insertTemplate', 'addSlide']) {
    assert.match(methodOf(m), /splice\(this\.index \+ 1, 0/, `${m} inserts after the current one`);
  }
});

test('paste lands after the LAST slide of the selection, not after the current one', () => {
  // Élder 2026-07-17: "se eu seleciono 1 e 2 e colo eles mesmos, vai ficar 1 e 2 (originais)
  // depois 1 e 2 colados" (if I select 1 and 2 and paste them onto themselves, it should end
  // up 1 and 2 (originals) then 1 and 2 pasted). With `index + 1` it would come out 1, 1', 2',
  // 2: the copy in the middle of the original.
  const src = methodOf('pasteClip');
  assert.match(src, /Math\.max\(\.\.\.this\.picked\(\)\) \+ 1/, 'the point is the end of the selection');
  const at = src.indexOf('const at =');
  const clear = src.indexOf('this.clearPick()');
  assert.ok(at > 0 && clear > at, 'picked() is read BEFORE clearing, otherwise the selection is already gone');
});

// ── library.updateMany: o lote que o dehydrate usa ───────────────────────────
function fakeFacade(container) {
  const calls = { get: 0, save: 0 };
  return {
    calls,
    async list() { return { presentations: [{ slug: '__library__' }] }; },
    async getDeck() { calls.get++; return { data: container }; },
    async saveDeck({ data }) { calls.save++; container = data; return { ok: true }; },
    async register() { return { ok: true }; },
    _peek: () => container,
  };
}

test('updateMany: N slides in ONE load + ONE save (otherwise autosave becomes 2N round-trips)', async () => {
  const facade = fakeFacade({ slides: [{ id: 'L1', name: 'um', layout: 'statement', slots: { text: 'a' } }, { id: 'L2', name: 'dois', layout: 'statement', slots: { text: 'b' } }] });
  const lib = createLibrary({ facade });

  await lib.updateMany([{ id: 'L1', slide: { layout: 'statement', slots: { text: 'A' } } }, { id: 'L2', slide: { layout: 'statement', slots: { text: 'B' } } }]);

  assert.equal(facade.calls.get, 1, 'only one load');
  assert.equal(facade.calls.save, 1, 'only one save');
  const out = facade._peek().slides;
  assert.equal(out[0].slots.text, 'A');
  assert.equal(out[1].slots.text, 'B');
  assert.equal(out[0].name, 'um', 'the entry name is preserved');
  assert.equal(out[0].id, 'L1', 'the entry id is preserved (it is the target of the refs)');
});

test('updateMany ignores an id that no longer exists (a deleted template does not come back)', async () => {
  const facade = fakeFacade({ slides: [{ id: 'L1', name: 'um', layout: 'statement', slots: { text: 'a' } }] });
  const lib = createLibrary({ facade });

  await lib.updateMany([{ id: 'SUMIU', slide: { layout: 'statement', slots: { text: 'zumbi' } } }]);

  assert.equal(facade.calls.save, 0, 'nothing to update => does not even save');
  assert.equal(facade._peek().slides.length, 1, 'the deleted one stays deleted');
});

test('EVERY op that mutates slides[] clears the ruler\'s multi-selection', () => {
  // `_pick` stores INDEXES. Select 2-3-4, delete 2, and the array shifts but the set stays
  // {2,3,4}: the lit-up thumbs become OTHER slides and Ctrl+C copies the wrong ones, with the
  // right highlight. Found in a review, not by a test, and the `_pick` comment went as far as
  // CLAIMING this already happened when it did not, in 5 of the 7 ops.
  const MUTATORS = ['addSlide', 'duplicate', 'removeSlide', 'reorder', 'insertTemplate', 'linkTemplate', 'pasteClip'];
  const missing = MUTATORS.filter((m) => !/this\.clearPick\(\)/.test(methodOf(m)));
  assert.deepEqual(missing, [], 'these mutate slides[] without clearing the index-based selection');
});

test('EVERY op that mutates slides[] arms the autosave (commit, directly or via refresh)', () => {
  // store.touch() is the ONLY autosave trigger (store.on('change') -> 800ms in
  // content/slides.js) and commit() is the only path to it. goTo() renders and does not touch
  // the store, so `splice + goTo` changes the deck and does NOT mark it dirty: the slide only
  // gets saved if you type into it afterward, because then the keystroke saves the whole deck.
  // That's how the bug hid. "Share -> this deck -> loose" (which falls into duplicate) is
  // exactly the case with no keystroke afterward: it said "shared" and vanished on reload.
  const MUTATORS = ['addSlide', 'duplicate', 'removeSlide', 'reorder', 'insertTemplate', 'linkTemplate', 'pasteClip'];
  const missing = MUTATORS.filter((m) => !/this\.(commit|refresh)\(/.test(methodOf(m)));
  assert.deepEqual(missing, [], 'these change slides[] without ever marking the deck dirty');
});

test('commit() is the only path to store.touch(), and goTo() is not one of them', () => {
  // The guard above only holds while these two things are true. Comment lines aside: they
  // TALK ABOUT store.touch() and call nothing.
  const code = APP_SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const n = (code.match(/store\.touch\(\)/g) || []).length;
  assert.equal(n, 1, 'only commit() touches the store');
  assert.match(methodOf('commit'), /store\.touch\(\)/);
  assert.ok(!/this\.commit\(|store\.touch/.test(methodOf('goTo')), 'goTo only navigates/renders');
});

test('twin sync starts from the EDITED slide, not the one on screen', () => {
  // The presenter window writes notes to ANY slide by index, not to cur(). With syncSameRef
  // always starting from cur(), a twin of the on-screen slide would receive cur()'s content
  // on top of the just-typed note: the same "twin eats the edit" this mechanism exists to
  // prevent, at the one point where the editor is not the one on screen.
  assert.match(methodOf('syncSameRef'), /const s = from \|\| this\.cur\(\)/);
  assert.match(methodOf('commit'), /syncSameRef\(from\)/);
  const pres = readSrc('../content/slides/js/present/presenter.js');
  assert.match(pres, /s\.notes = m\.notes; app\.commit\(s\)/, 'the presenter passes the slide it edited');
});

test('detaching is NOT the fix for a broken link', () => {
  // brokenSlide() is a NOTICE ("slide compartilhado não encontrado"), not content: the
  // content lived in the library entry that got deleted, and the deck only stores {id, ref}.
  // Detaching a broken slide used to freeze that notice as the slide's content and throw the
  // ref away, i.e. delivering garbage and calling it a fix. And shr_broken_tip told users to
  // do exactly that.
  assert.match(methodOf('detachSet'), /!s\.ref \|\| !s\._broken\) return false|s && s\.ref && !s\._broken/, 'the broken one is filtered out of unlinking');
  assert.match(methodOf('resetBroken'), /if \(!s \|\| !s\._broken\) return false;/, 'and it is the only one that accepts it');
  assert.match(methodOf('resetBroken'), /s\.slots = \{ text: "" \}/, 'clears the notice instead of promoting it to content');
});

test('the ruler preview APPENDS the thumb before rendering (otherwise a freed slide vanishes)', () => {
  // Élder 2026-07-17: "se a imagem dentro de um frame de imagem for resized, ela deixa de
  // mostrar na preview na barra" (if the image inside an image frame gets resized, it stops
  // showing in the bar preview). Cause: applyOverrides -> freedStyle walks offsetParent to
  // convert a freed element's canvas coordinate into a coordinate relative to the render root.
  // On a DETACHED node, offsetParent is null: the walk is skipped, every offset reads 0, and
  // the element is positioned against the wrong container once it finally enters the DOM. It
  // vanishes. Only shows up AFTER the element has an override, which is exactly "after resized".
  const src = readSrc('../content/slides/js/edit/navigator.js');
  const append = src.indexOf('nav.appendChild(th)');
  const render = src.indexOf('renderInto(th.querySelector(".scale")');
  assert.ok(append > 0 && render > 0, 'both lines exist');
  assert.ok(append < render, 'appending HAS to come before rendering');
});

test('the +slide preview cards follow the same rule (the same latent bug)', () => {
  const src = readSrc('../content/slides/js/edit/addslide.js');
  const i = src.indexOf('function card(parent, labelText, slide, onPick)');
  assert.ok(i > 0, 'card() receives the parent: without it there is no appending before rendering');
  const body = src.slice(i, src.indexOf('\n  }', i));
  assert.ok(body.indexOf('parent.appendChild(btn)') < body.indexOf('renderInto('), 'appends before rendering');
});

test('two slides with the SAME ref in a deck: save never lets the stale twin eat the edit', async () => {
  // Élder 2026-07-17: pasted linked into the same deck, edited, "a mudança só apareceu no
  // original depois de dar refresh" (the change only showed on the original after a refresh).
  // Worse than stale: both became an entry pointing at the SAME library id, updateMany applied
  // both in order and the LAST one won. In other words the twin you did NOT just edit
  // overwrote your edit. Silent data loss.
  const lib = fakeLibrary([tpl('L1', 'v1')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 'a', ref: 'L1' }, { id: 'b', ref: 'L1' }]);
  await shared.hydrate(deck);

  deck.slides[0].slots.text = 'editado no A'; // B stays at 'v1' in memory

  await shared.dehydrate(deck);

  assert.equal(lib._peek('L1').slide.slots.text, 'editado no A',
    'the edit survives: B (stale) cannot be written on top of it');
});

test('app.commit syncs the twins of the same ref (this is what prevents "only after a refresh")', () => {
  // The invariant a linked slide promises is ONE slide, N places. Inside a deck the twins are
  // different objects, so someone has to keep them equal; commit is the funnel every mutation
  // passes through on its way to the store, so it is the one place that can close this.
  assert.match(methodOf('commit'), /this\.syncSameRef\(from\)/, 'commit syncs');
  const src = methodOf('syncSameRef');
  assert.match(src, /o\.ref !== s\.ref/, 'only touches whoever has the same ref');
  assert.match(src, /id: o\.id/, 'each twin keeps its own deck-local id');
  assert.match(src, /s\._broken/, 'the broken placeholder does not spread "not found" to its siblings');
  assert.match(methodOf('commit'), /renderNav/, 'and the ruler reflects it right away, no refresh needed');
});

test('deleting from the library is REFUSED while any deck is still linking to it', async () => {
  // Élder deleted entries and ended up with decks full of "Slide compartilhado não encontrado",
  // with no warning at all. Codex's rule for something in use is to refuse the hard delete
  // (the same thing a course does with a turma pointing at it), not confirm and break it.
  const decks = [{ slug: 'jurista', title: 'Deck Jurista', engine: 'codex-deck' }];
  const json = { jurista: { slides: [{ id: 's1', ref: 'L1' }, { id: 's2', ref: 'L1' }] } };
  let removed = false;
  const facade = {
    async list() { return { presentations: [...decks, { slug: '__library__', engine: 'codex-library' }] }; },
    async getDeck({ slug }) {
      if (slug === '__library__') return { data: { slides: [{ id: 'L1', name: 'Abertura' }] } };
      return { data: json[slug] };
    },
    async saveDeck() { removed = true; return { ok: true }; },
    async register() { return { ok: true }; },
  };
  const lib = createLibrary({ facade });

  const used = await lib.usedBy('L1');

  assert.equal(used.length, 1);
  assert.equal(used[0].title, 'Deck Jurista');
  assert.equal(used[0].count, 2, 'counts BOTH positions, not the deck once');
  assert.equal(removed, false, 'usedBy is read-only');

  // And the library container does not count itself (it is not one of our decks).
  const none = await lib.usedBy('SEM-USO');
  assert.deepEqual(none, [], 'an entry with no use at all: nothing blocks its deletion');
});

test('usedBy prefers the deck OPEN in memory over its saved json', async () => {
  // The deck on screen can have a link autosave has not written yet. Reading the saved json
  // would say "not in use" and the deletion would go through, breaking the slide right in
  // front of Élder.
  const facade = {
    async list() { return { presentations: [{ slug: 'aberto', title: 'Aberto', engine: 'codex-deck' }] }; },
    async getDeck() { return { data: { slides: [] } } ; }, // the SAVED one does not have the link yet
    async saveDeck() { return { ok: true }; },
    async register() { return { ok: true }; },
  };
  const lib = createLibrary({ facade });
  const openDeck = { slug: 'aberto', deck: { slides: [{ id: 'x', ref: 'L1' }] } };

  const used = await lib.usedBy('L1', openDeck);

  assert.equal(used.length, 1, 'the not-yet-saved link counts');
  assert.equal(used[0].count, 1);
});

test('app.deleteTemplate returns inUse instead of deleting', () => {
  const src = methodOf('deleteTemplate');
  const check = src.indexOf('usedBy');
  const remove = src.indexOf('this._library.remove');
  assert.ok(check > 0 && remove > check, 'checks usage BEFORE removing');
  assert.match(src, /if \(used\.length\) return \{ inUse: used \}/, 'and returns it so the UI can say where');
});

test('duplicating a SHARED slide gives a loose copy, not a linked twin', async () => {
  // duplicateSlide used to clone the whole slide, ref and all. So the "duplicate" button
  // (which promises a copy) returned a second LINK, and editing the "copy" edited the other
  // decks. Worse: "share -> this deck -> LOOSE" goes through here, meaning loose came out
  // linked, the exact opposite of the one distinction Élder keeps testing.
  const { duplicateSlide } = await import('../content/slides/js/core/deck.js');
  const d = duplicateSlide({ id: 's1', ref: 'L1', layout: 'statement', slots: { text: 'oi' } });
  assert.equal(d.ref, undefined, 'duplicate = independent copy, no link');
  assert.notEqual(d.id, 's1');
  assert.equal(d.slots.text, 'oi', 'the content comes along');

  const b = duplicateSlide({ id: 's2', ref: 'X', _broken: true, layout: 'statement', slots: { text: 'não encontrado' } });
  assert.equal(b._broken, undefined, 'duplicating a broken placeholder does not spread the notice as content');
});

test('dehydrate writes ONCE per ref and picks the EDITED twin', async () => {
  const lib = fakeLibrary([tpl('L1', 'v1')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 'a', ref: 'L1' }, { id: 'b', ref: 'L1' }]);
  await shared.hydrate(deck);

  // The 2nd twin is the edited one (the 1st stays stale). Picking "the first" would lose the edit.
  deck.slides[1].slots.text = 'editado no B';
  await shared.dehydrate(deck);

  assert.equal(lib.writes, 1, 'one write, not two racing to the same id');
  assert.equal(lib._peek('L1').slide.slots.text, 'editado no B');
});

// ── share -> create a new deck (Élder 2026-07-17: "ela abre quebrada" - it opens broken) ───────────────
const SLIDES_JS = readSrc('../content/slides.js');
const fnOf = (name) => {
  const i = SLIDES_JS.indexOf('function ' + name + '(');
  const a = SLIDES_JS.indexOf('async function ' + name + '(');
  const start = i < 0 ? a : (a < 0 ? i : Math.min(i, a));
  assert.ok(start >= 0, name + ' exists in slides.js');
  const end = SLIDES_JS.indexOf('\n}\n', start);
  assert.ok(end > start, name + ' closes');
  return SLIDES_JS.slice(start, end);
};

test('uniqueTitle: a free name passes through, a taken one gets (1), (2)…', async () => {
  const { uniqueTitle } = await import('../content/slides.js');
  assert.equal(uniqueTitle('Aula', []), 'Aula', 'free passes unchanged');
  assert.equal(uniqueTitle('Aula', ['Aula']), 'Aula (1)', 'taken gets (1)');
  assert.equal(uniqueTitle('Aula', ['Aula', 'Aula (1)']), 'Aula (2)', 'climbs until it finds a slot');
  assert.equal(uniqueTitle('Aula', ['aula']), 'Aula (1)', 'collision is case- and edge-space-insensitive');
  assert.equal(uniqueTitle('  Aula  ', ['Aula']), 'Aula (1)', 'and the edge spaces disappear');
});

test('creating a new deck is a REAL deck, not an empty row (the "opens broken" bug)', () => {
  // The share-to-new path used to register only the row (D1) and let _append write a
  // {slides:[…]} with no canvas/theme/logo/default-slides: it opened blank, off screen, empty
  // list. Now _createDeck builds a complete newDeck() and PERSISTS it (saveDeck) before
  // sending the slide, both from the tab (open) and from share (open:false).
  const src = fnOf('_createDeck');
  assert.match(src, /newDeck\(\)/, 'always starts from a newDeck() (canvas + theme + 3 default slides)');
  assert.match(src, /_uniqueTitle\(/, 'and the name is unique');
  assert.match(src, /api\.saveDeck\(\{ slug, data: deck \}\)/, 'the open:false path PERSISTS the skeleton');
  assert.ok(!/return \{ slug, title: finalTitle \};[\s\S]{0,40}catch/.test(src) || /saveDeck/.test(src),
    'does not return before writing');
});

test('the share->new button does NOT ask for a name and creates without opening', () => {
  // Élder: "ele me perguntou o nome ao invés de dar um nome" (it asked me for the name
  // instead of just giving it one). The flow must not call window.prompt for the new deck;
  // it auto-names and creates with open:false to stay on the current slide.
  const i = SHAREFLOW_SRC.indexOf('target === "__new__"');
  const block = SHAREFLOW_SRC.slice(i, i + 400);
  assert.ok(!/window\.prompt/.test(block), 'no name prompt in the new-deck branch');
  assert.match(block, /_createDeck\(null, \{ open: false \}\)/, 'auto-name + does not open');
  assert.ok(!/shr_new_deck_prompt/.test(SHAREFLOW_SRC), 'and the prompt string is gone');
});

test('duplicating a deck and renaming also guarantee a unique name', () => {
  assert.match(fnOf('_duplicateDeck'), /_uniqueTitle\(/, 'duplicating does not produce two identical names');
  assert.match(fnOf('_renameDeck'), /_uniqueTitle\([^,]+, slug\)/, 'renaming excludes the deck itself from the collision check');
});
