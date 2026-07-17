// content/slides/adapters/sharedSlides.js
// Shared slides (track-35 C): a slide that lives in MANY decks and, edited in one,
// changes in all of them. A LINK, not a seed.
//
// The store already existed: adapters/library.js keeps every reusable slide in the
// reserved __library__ presentation, one slide per entry, each with a stable id. This
// module adds only the missing half, the REFERENCE and its resolution:
//
//   on disk (deck JSON):   { id: "<deck-local>", ref: "<library id>" }
//   in memory (the core):  { ...libraryContent, id: "<deck-local>", ref: "<library id>" }
//
// COPY vs LINK is therefore two insertion modes over ONE store, exactly as track-35 C
// specifies: app.insertTemplate drops a detached clone (today's behaviour, untouched),
// app.linkTemplate drops a `{ref}`. Only decks that CHOSE to link ever see propagation.
//
// WHY THE SEAM IS load/save AND NOT THE EDIT PATH. The obvious design, "write through
// to the library whenever a linked slide is edited", would have to intercept every
// mutation in editor.js / animpanel / select / …, i.e. every place that touches
// slide.slots. Miss one and the edit is silently lost. Instead the deck is hydrated
// ONCE at load and collapsed ONCE at save, which is the single chokepoint to disk.
// The editor, history (whole-deck JSON snapshots) and undo/redo all operate on the
// hydrated deck and need to know NOTHING about refs, a snapshot carries `.ref` along
// with the content, so undo can never silently turn a link into a copy. That inverse
// failure (a resolved slide persisted back into the deck = every link quietly becomes a
// detached copy, and it would pass a naive smoke test) is the one this design forecloses.
//
// PROPAGATION is at load: deck B shows deck A's edit the next time B is opened. There is
// no live channel between two decks open at once, and the library write is last-writer-wins.
// One person authoring: fine, and said out loud rather than pretended otherwise.
//
// WHAT IS SHARED = the slide object (layout, slots, notes, build/buildFx, overrides,
// textStyle). NOT shared, i.e. the per-deck overlay of architecture/slides.md §10:
// theme, logo, aspect and transition are DECK-level fields, so a shared slide rebrands
// per deck for free. Free-placed assets are also per-deck: they live in deck.assets
// keyed by slideId, never inside the slide, which is exactly how the template library
// has always behaved, so linking adds no new inconsistency here.
// Globals: window.bsLog (debug pill, backstage/js/debug.js)
import { clone } from '../js/core/schema.js';

// A slide that is a bare link (never rendered as-is; hydrate resolves it first).
export const isRef = (s) => !!(s && s.ref && !s.layout);
// A hydrated slide that came from the library (content + its ref).
export const isLinked = (s) => !!(s && s.ref);

// The library-owned half of a hydrated slide: everything except the deck-local id and
// the ref itself. This is what gets written back, and what dirty-checking compares.
export function sharedContent(slide) {
  const out = clone(slide);
  delete out.id;
  delete out.ref;
  delete out.name; // library-only metadata, never a slide field
  delete out.from; // ditto: the origin deck is a property of the ENTRY, not of the slide
  return out;
}

// The placeholder a broken ref renders as: the target was deleted from the library (or
// the library failed to load). Degrade LOUDLY but never destroy, `ref` is kept, so a
// later save re-emits {id, ref} untouched and the link survives to be fixed. `_broken`
// tells dehydrate not to write this placeholder over the library entry.
export function brokenSlide(stub, message) {
  return {
    id: stub.id,
    ref: stub.ref,
    _broken: true,
    layout: 'statement',
    slots: { text: message },
    notes: '',
  };
}

/**
 * createSharedSlides({ library, message }), the hydrate/dehydrate pair the store hooks
 * into, plus the dirty-tracking that keeps autosave from rewriting the library container
 * on every keystroke. `message` is the i18n'd broken-ref text (injected: this is the
 * adapter layer, and the string belongs to the caller).
 */
export function createSharedSlides({ library, message } = {}) {
  // ref id -> JSON of the content as we last saw it agree with the library. A linked
  // slide is written back only when its content actually differs from this.
  const seen = new Map();

  const mark = (ref, content) => seen.set(ref, JSON.stringify(content));
  const changed = (ref, content) => seen.get(ref) !== JSON.stringify(content);

  return {
    // Test/inspection seam: what the dirty-check believes is on the server.
    _seen: seen,

    /**
     * Resolve every {id, ref} stub into a full slide. Mutates + returns the deck (it is
     * the freshly loaded one; nothing else holds it yet). A ref with no library entry
     * becomes a visible broken placeholder instead of throwing away the deck.
     */
    async hydrate(deck) {
      if (!deck || !Array.isArray(deck.slides)) return deck;
      if (!deck.slides.some(isRef)) return deck; // no links: not even a library call

      let byId = null;
      try {
        const list = library ? await library.list() : [];
        byId = new Map(list.map((tpl) => [tpl.id, tpl]));
      } catch (e) {
        // The library itself is unreachable. Every link degrades to the placeholder
        // (which keeps its ref), rather than the deck failing to open at all.
        if (window.bsLog) window.bsLog('shared slides: library unreachable: ' + ((e && e.message) || e), 'error');
        byId = new Map();
      }

      deck.slides = deck.slides.map((s) => {
        if (!isRef(s)) return s;
        const tpl = byId.get(s.ref);
        if (!tpl || !tpl.slide) return brokenSlide(s, message || 'shared slide not found');
        const content = sharedContent(tpl.slide);
        mark(s.ref, content);
        return { ...clone(content), id: s.id, ref: s.ref };
      });
      return deck;
    },

    /**
     * The persistable form of `deck`: a CLONE in which every linked slide is collapsed
     * back to {id, ref}. Content that changed is written back to the library first, so
     * the deck's own save and the propagation happen in one operation.
     *
     * The in-memory deck is never touched, the editor keeps rendering the hydrated one.
     */
    async dehydrate(deck) {
      if (!deck || !Array.isArray(deck.slides)) return deck;
      const linked = deck.slides.filter(isLinked);
      if (!linked.length) return deck;

      // Write back only what actually differs, so the 800ms autosave does not rewrite the
      // whole library container on every change to an unrelated slide. A broken
      // placeholder is never written back: that would publish "not found" as the content.
      const dirty = linked
        .filter((s) => !s._broken)
        .map((s) => ({ id: s.ref, slide: sharedContent(s) }))
        .filter((e) => changed(e.id, e.slide));

      if (dirty.length && library) {
        await library.updateMany(dirty);
        for (const e of dirty) mark(e.id, e.slide);
      }

      const out = clone(deck);
      out.slides = deck.slides.map((s) => (isLinked(s) ? { id: s.id, ref: s.ref } : clone(s)));
      return out;
    },
  };
}
