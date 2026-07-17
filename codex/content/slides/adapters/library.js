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

export function createLibrary({ facade } = {}) {
  const api = facade || slidesApi;
  let _ensured = false; // session cache: the container row exists, skip re-checking

  // The container deck JSON, or null if it has never been saved.
  async function _load() {
    const res = await api.getDeck({ slug: LIBRARY_SLUG });
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
  function _asTemplate(s) {
    return { id: s.id, name: s.name || '', layout: s.layout, slide: s };
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
    async save(slide, name) {
      await _ensure();
      const c = (await _load()) || { slides: [] };
      if (!Array.isArray(c.slides)) c.slides = [];
      const tpl = clone(slide);
      tpl.id = uid();
      tpl.name = String(name == null ? '' : name).trim();
      c.slides.push(tpl);
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
      return _asTemplate(tpl);
    },

    // Remove a template by id. Detached model: removing a template never touches a
    // deck that already inserted a copy.
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
        c.slides[i] = tpl;
        out.push(_asTemplate(tpl));
      }
      if (!out.length) return [];
      await api.saveDeck({ slug: LIBRARY_SLUG, data: c });
      return out;
    },
  };
}
