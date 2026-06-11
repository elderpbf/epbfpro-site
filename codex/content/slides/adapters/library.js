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
      } catch (_) {
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
  };
}
