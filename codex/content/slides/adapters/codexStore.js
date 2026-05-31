// content/slides/adapters/codexStore.js
// Store adapter: backs the Slides editor's in-memory Store interface with the
// Codex backend, reached ONLY through the codex-api slides facade (never raw
// callWorker, never raw action strings). The editor calls getDeck/setDeck/
// touch/on synchronously; persistence is the async load()/save() pair wrapping
// the frozen *_presentation actions (deck JSON in R2; the facade owns the key).
import { slides as slidesApi } from '../../../js/codex-api.js';

// Minimal event emitter (mirrors the in-memory store the editor ships with).
function emitter() {
  const map = new Map();
  return {
    on(evt, cb) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(cb);
      return () => map.get(evt).delete(cb);
    },
    emit(evt, payload) { (map.get(evt) || []).forEach((cb) => cb(payload)); },
  };
}

// createCodexStore({ slug, facade }) — `facade` defaults to the real slides
// facade and is injected in tests. Implements the editor's Store interface
// (getDeck/setDeck/touch/on) plus load()/save() for the R2-backed deck JSON.
export function createCodexStore({ slug, facade } = {}) {
  const api = facade || slidesApi;
  let deck = null;
  const bus = emitter();
  return {
    getDeck() { return deck; },
    setDeck(d) { deck = d; bus.emit('change', deck); },
    // Called after any in-place mutation; announces a change for autosave.
    touch() { bus.emit('change', deck); },
    on: bus.on,
    // Fetch the deck JSON from R2 (null if the presentation has none yet).
    async load() {
      const res = await api.getDeck({ slug });
      deck = (res && res.data) || null;
      bus.emit('change', deck);
      return deck;
    },
    // Persist the current deck JSON to R2 via the facade.
    async save() {
      const res = await api.saveDeck({ slug, data: deck });
      bus.emit('saved', deck);
      return res;
    },
  };
}
