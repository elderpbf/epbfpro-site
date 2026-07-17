// content/slides/adapters/library.js
// Template library service (4c.1, detached copies). ONE backend "presentation"
// holds every reusable slide template: a reserved slug (__library__) tagged with a
// reserved engine (codex-library, NOT the deck engine 'codex-deck' that
// content/slides.js's ourDecks() lists), so the container never shows in the deck
// list. Its deck-JSON `slides[]` array IS the template store, one slide per
// template, each carrying its display `name`.
//
// Reached ONLY through the codex-api slides facade (the FROZEN *_presentation
// actions, no new endpoint, no raw action strings), exactly like codexStore.js.
// `facade` is injected in tests. This lives in the integration/adapters layer, so
// the vendored editor core never imports it; app.js receives it via ctx.library.
//
// EXTENSIBILITY (Elder's "add things later without reshaping"): a template is just
// a slide object plus a `name`. More metadata later (a thumbnail, tags, a category)
// is another property on that object, never a migration, mirroring the composable
// cards `parts` decision. Branding is NOT stored: logo + theme are deck-level
// overlays the frame emits, so a template rebrands per deck for free.
// Globals: window.bsLog (debug pill, backstage/js/debug.js)
import { slides as slidesApi } from '../../../js/codex-api.js';
import { uid, clone } from '../js/core/schema.js';

export const LIBRARY_SLUG = '__library__';
export const LIBRARY_ENGINE = 'codex-library';
// The engine tag content/slides.js stamps on OUR authored decks. usedBy() scans those and
// only those: other rows on the shared table are not ours and hold no refs.
const DECK_ENGINE = 'codex-deck';

export function createLibrary({ facade } = {}) {
  const api = facade || slidesApi;
  let _ensured = false; // session cache: the container row exists, skip re-checking

  // The container deck JSON, or null if it has never been saved.
  //
  // "null if never saved" is what this always CLAIMED, and it was false: the frozen
  // deck-load action REJECTS with "not found" for a presentation row that exists with no
  // JSON yet, rather than returning empty data (the same scar codexStore.load documents).
  // The container hits that state for exactly one moment, and it is the worst one: _ensure()
  // has just REGISTERED the row, so the very FIRST save to the library threw. Élder, on the
  // first ever "colar vinculado": "nada aconteceu" (the throw became {error} in pasteClip
  // and only ever reached the debug pill).
  //
  // Genuine failures (network, auth) still propagate: only not-found is the empty container.
  async function _load() {
    let res;
    try {
      res = await api.getDeck({ slug: LIBRARY_SLUG });
    } catch (e) {
      if (!/not\s*found/i.test((e && e.message) || String(e))) throw e;
      return null;
    }
    return (res && res.data) || null;
  }

  // Make sure the container's presentation row exists before the first save.
  // Checks the list rather than blindly registering, so a duplicate-slug register
  // can never error on a second session; falls back to an optimistic register if
  // the list call itself fails.
  async function _ensure() {
    if (_ensured) return;
    try {
      const res = await api.list();
      const rows = (res && res.presentations) || [];
      if (!rows.some((p) => p && p.slug === LIBRARY_SLUG)) {
        await api.register({ slug: LIBRARY_SLUG, title: LIBRARY_SLUG, engine: LIBRARY_ENGINE });
      }
    } catch (_) {
      await api.register({ slug: LIBRARY_SLUG, title: LIBRARY_SLUG, engine: LIBRARY_ENGINE });
    }
    _ensured = true;
  }

  // A stored template slide -> the public shape the picker + tests consume.
  // `from` = the deck this entry was shared OUT of ({slug, title}), the section key of the
  // +slide "Biblioteca" tab (track-35 C, Élder 2026-07-17: sectioned by the origin deck).
  // Absent on entries saved before that, and on anything saved from outside a deck, so the
  // picker owns a catch-all section rather than this owning a fake origin. Exactly the
  // extensibility this file's header promised: another property, never a migration.
  function _asTemplate(s) {
    return { id: s.id, name: s.name || '', layout: s.layout, from: s.from || null, slide: s };
  }

  return {
    // List saved templates in insertion order. Each: { id, name, layout, slide }.
    // The container row only exists after the first save, so gate on it: calling
    // getDeck for a missing presentation makes the Worker log a not-found error
    // (which spammed the debug log every time the +slide modal opened).
    async list() {
      let exists = false;
      try {
        const res = await api.list();
        exists = ((res && res.presentations) || []).some((p) => p && p.slug === LIBRARY_SLUG);
      } catch (e) {
        // Not the not-found case (the `exists` gate below owns that): reaching here
        // means the listing itself failed (worker/network), so the +slide modal shows
        // an empty library when one may well exist. Degrade, but say so.
        if (window.bsLog) window.bsLog('slides library list: ' + ((e && e.message) || e), 'error');
        return [];
      }
      if (!exists) return [];
      const c = await _load();
      return ((c && c.slides) || []).map(_asTemplate);
    },

    // Save `slide` as a reusable template named `name`. Deep-clones the slide,
    // gives it a fresh id (detached from the source), tags the trimmed name, and
    // appends to the container. Returns the stored template.
    // `opts.from` ({slug, title}) records which deck it was shared out of; omitted by the
    // save-as-layout button, which has no origin deck to claim.
    async save(slide, name, opts) {
      await _ensure();
      const c = (await _load()) || { slides: [] };
      if (!Array.isArray(c.slides)) c.slides = [];
      const tpl = clone(slide);
      tpl.id = uid();
      tpl.name = String(name == null ? '' : name).trim();
      const from = opts && opts.from;
      if (from && from.slug) tpl.from = { slug: from.slug, title: String(from.title || '') };
      c.slides.push(tpl);
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
      return _asTemplate(tpl);
    },

    /**
     * Which decks LINK entry `id` -> [{slug, title, count}].
     *
     * Exists because deleting an entry is not a local act any more: a detached copy does not
     * care, but every `{ref}` pointing here turns into "slide compartilhado nao encontrado".
     * Élder hit exactly that (2026-07-17: deleted the library entries, then "ao voltar para o
     * deck original, aparece Slide compartilhado nao encontrado, tem varias inconsistencias").
     *
     * There is no index of refs, so this reads the decks. That is N round trips, which is why
     * only DELETE calls it: it is a rare, deliberate act, and the alternative is a delete
     * that silently breaks other decks. `openDeck` ({slug, deck}) lets the caller supply the
     * deck on screen, whose in-memory copy is fresher than its saved json.
     */
    async usedBy(id, openDeck) {
      const res = await api.list();
      const rows = ((res && res.presentations) || []).filter((p) => p && p.engine === DECK_ENGINE);
      const out = [];
      for (const row of rows) {
        let deck = null;
        if (openDeck && openDeck.slug === row.slug) deck = openDeck.deck;
        else {
          try {
            const r = await api.getDeck({ slug: row.slug });
            deck = r && r.data;
          } catch (_) { continue; } // never saved / unreadable: it holds no refs to break
        }
        const count = ((deck && deck.slides) || []).filter((s) => s && s.ref === id).length;
        if (count) out.push({ slug: row.slug, title: row.title || row.slug, count });
      }
      return out;
    },

    // Remove a template by id. Detached copies never cared; LINKS do, so the caller is
    // expected to check usedBy() first and refuse (the Codex rule for a thing in use, same
    // as a curso a turma still points at). This stays a plain delete: the guard belongs to
    // the caller that can ask the user, not to the storage.
    async remove(id) {
      const c = await _load();
      if (!c || !Array.isArray(c.slides)) return;
      c.slides = c.slides.filter((s) => s && s.id !== id);
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
    },

    // Rename a template in place (the only metadata edit a name change needs):
    // its id and content are untouched, so every deck that inserted a copy is
    // unaffected (detached model).
    async rename(id, name) {
      const c = await _load();
      if (!c || !Array.isArray(c.slides)) return;
      const s = c.slides.find((x) => x && x.id === id);
      if (!s) return;
      s.name = String(name == null ? '' : name).trim();
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
      return _asTemplate(s);
    },

    // Overwrite a template's CONTENT in place (the "edit a saved layout manually"
    // flow: insert it, edit it as a normal slide, save it back). `slide` is the
    // edited deck copy (a fresh id, name stripped); it is deep-cloned and forced
    // back onto the template's STABLE id so the library entry keeps its identity.
    // `name` null/undefined keeps the existing name. Detached: deck copies stay put.
    async update(id, slide, name) {
      const c = await _load();
      if (!c || !Array.isArray(c.slides)) return;
      const i = c.slides.findIndex((x) => x && x.id === id);
      if (i < 0) return;
      const tpl = clone(slide);
      tpl.id = id;
      tpl.name = name == null ? (c.slides[i].name || '') : String(name).trim();
      // `from` (the origin deck) belongs to the ENTRY, not to the content being written
      // over it: `slide` here is a deck copy and never carries it. Same rule as `name`.
      if (c.slides[i].from) tpl.from = c.slides[i].from;
      c.slides[i] = tpl;
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
      return _asTemplate(tpl);
    },

    // Batch form of update(): N entries [{id, slide}] in ONE load + ONE save.
    // Exists because a deck save (track-35 C) writes back every SHARED slide it holds,
    // and doing that through update() would be 2N round-trips per autosave. Same
    // contract per entry: content overwritten, id + name preserved. Entries whose id is
    // no longer in the library are skipped, not appended: a template deleted while a
    // deck was open must stay deleted (the deck's link degrades to broken on next load),
    // never be resurrected by a save.
    async updateMany(entries) {
      const list = (entries || []).filter((e) => e && e.id && e.slide);
      if (!list.length) return [];
      const c = await _load();
      if (!c || !Array.isArray(c.slides)) return [];
      const out = [];
      for (const e of list) {
        const i = c.slides.findIndex((x) => x && x.id === e.id);
        if (i < 0) continue;
        const tpl = clone(e.slide);
        tpl.id = e.id;
        tpl.name = c.slides[i].name || '';
        if (c.slides[i].from) tpl.from = c.slides[i].from; // entry metadata, see update()
        c.slides[i] = tpl;
        out.push(_asTemplate(tpl));
      }
      if (!out.length) return [];
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
      return out;
    },
  };
}
