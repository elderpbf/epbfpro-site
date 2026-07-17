// content/slides/adapters/slideClip.js
// The slide clipboard, and with it the way slides are shared (track-35 C, Élder
// 2026-07-17: "a forma padrao de compartilhamento vai ser o copiar e colar").
//
// Ctrl+C on the rail selection, Ctrl+V in ANY deck, and the paste ASKS:
//
//   solto     -> detached copies. Different slides from here on; they may drift.
//   vinculado -> one slide in both places. Editing either edits both, so it goes to
//                the library.
//
// The question is asked even inside the same deck (Élder overrode his own earlier
// "same deck = loose copy": both answers are legitimate there too).
//
// WHY PASTE-LINKED WRITES THE SOURCE DECK. "Mexer num atualiza o outro" is only true if
// BOTH ends are refs. The pasted end is local and trivial. The source end is the deck the
// slide was COPIED from, which is usually closed by then, so its JSON is rewritten through
// the facade. That is the only operation in this feature that touches a deck the user does
// not have open, and it is why the clipboard carries the origin (slug + slide ids) and not
// just content. If the source cannot be converted (deck gone, slide deleted since the
// copy), the paste still succeeds and the caller is told: a half-linked pair is a lie, a
// linked paste plus a warning is not.
//
// The clipboard lives in localStorage, not module state: copying in one deck and pasting
// in another survives a reload, and it is how a copy reaches a second window.
// Globals: window.localStorage
import { slides as slidesApi } from '../../../js/codex-api.js';
import { uid, clone } from '../js/core/schema.js';
import { sharedContent } from './sharedSlides.js';

export const CLIP_KEY = 'cdx_slides_clip';

// What Ctrl+C stores. `ref` is set when the copied slide was ALREADY shared: pasting it
// linked must reuse that entry, never mint a second one for the same content (this is the
// "deixa compartilhar o mesmo slide infinitas vezes" complaint, fixed at the root).
// { srcSlug, srcTitle, items: [{ slideId, ref, content }] }

// `onOpenDeck(srcSlug, entries) -> bool` is injected by content/slides.js: when the source
// of a paste happens to be the deck currently on screen, its JSON must NOT be rewritten
// through the facade (the open editor's next autosave would clobber the write). The editor
// converts in memory instead and the callback returns true to say it handled it.
export function createSlideClip({ facade, library, storage, onOpenDeck } = {}) {
  const api = facade || slidesApi;
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);

  function read() {
    if (!store) return null;
    try {
      const raw = store.getItem(CLIP_KEY);
      const v = raw && JSON.parse(raw);
      return v && Array.isArray(v.items) && v.items.length ? v : null;
    } catch (_) {
      return null; // a corrupt clipboard is an empty clipboard, never a thrown paste
    }
  }

  return {
    read,

    // Ctrl+C: snapshot the given slides. Pure capture, NO side effect on the deck. The
    // decision (copy vs share) belongs to the paste, so copying can never publish anything.
    copy(slides, { srcSlug, srcTitle } = {}) {
      if (!store || !slides || !slides.length) return null;
      const payload = {
        srcSlug: srcSlug || null,
        srcTitle: srcTitle || '',
        items: slides.map((s) => ({ slideId: s.id, ref: s.ref || null, content: sharedContent(s) })),
      };
      try { store.setItem(CLIP_KEY, JSON.stringify(payload)); } catch (_) { return null; }
      return payload;
    },

    // "solto": detached copies. Fresh ids, no ref: from here they are ordinary slides of
    // THIS deck and may drift from whatever they were copied from. Pure.
    pasteLoose(clip) {
      return (clip.items || []).map((it) => ({ ...clone(it.content), id: uid() }));
    },

    /**
     * "vinculado": ONE slide in both places.
     *
     * Per item: reuse `ref` when the copy was already shared, else publish the content to
     * the library (named after the source deck, which is what the +slide Biblioteca tab
     * sections by) and remember that the SOURCE has to become a ref too.
     *
     * Returns { slides, sourceFailed }, where `slides` are the hydrated linked slides to
     * insert and `sourceFailed` names the origins that could not be converted, so the
     * caller can warn instead of silently leaving a one-way link.
     */
    async pasteLinked(clip, { name } = {}) {
      const slides = [];
      const toConvert = []; // [{ slideId, ref }] on clip.srcSlug
      for (const it of clip.items || []) {
        let ref = it.ref;
        if (!ref) {
          const tpl = await library.save(it.content, name || clip.srcTitle || '', {
            from: { slug: clip.srcSlug || null, title: clip.srcTitle || '' },
          });
          ref = tpl.id;
          if (it.slideId && clip.srcSlug) toConvert.push({ slideId: it.slideId, ref });
        }
        slides.push({ ...clone(it.content), id: uid(), ref });
      }
      const sourceFailed = toConvert.length ? await this.linkSource(clip.srcSlug, toConvert) : [];
      // The source slides are refs now (or failed loudly): a second paste of the same
      // clipboard must reuse those refs, not publish the content again.
      if (!sourceFailed.length) {
        for (const it of clip.items || []) {
          const hit = toConvert.find((c) => c.slideId === it.slideId);
          if (hit) it.ref = hit.ref;
        }
        try { store.setItem(CLIP_KEY, JSON.stringify(clip)); } catch (_) { /* best effort */ }
      }
      return { slides, sourceFailed };
    },

    /**
     * Rewrite the SOURCE deck so its copied slides become refs.
     *
     * Returns the ids it could NOT convert. Never throws: the paste already happened, and
     * the caller turns a non-empty return into a warning rather than an exception.
     */
    async linkSource(srcSlug, entries) {
      if (!srcSlug || !entries || !entries.length) return [];
      if (typeof onOpenDeck === 'function' && onOpenDeck(srcSlug, entries)) return [];
      try {
        const res = await api.getDeck({ slug: srcSlug });
        const deck = res && res.data;
        if (!deck || !Array.isArray(deck.slides)) return entries.map((e) => e.slideId);
        const missed = [];
        for (const e of entries) {
          const i = deck.slides.findIndex((s) => s && s.id === e.slideId);
          if (i < 0) { missed.push(e.slideId); continue; }
          deck.slides[i] = { id: e.slideId, ref: e.ref };
        }
        if (missed.length === entries.length) return missed; // nothing changed, do not save
        await api.saveDeck({ slug: srcSlug, data: deck });
        return missed;
      } catch (_) {
        return entries.map((e) => e.slideId);
      }
    },
  };
}
