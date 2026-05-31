// core/store.js — Store interface + in-memory adapter.
//
// UI code talks ONLY to this interface (Architecture §4). Persistence is
// deliberately in-memory for now: a deck lives only while the page is open.
// Phase 2A/2B drops in localStore/fileStore; Codex drops in codexStore.
// None of the UI changes — app.js just injects a different adapter.

/** Minimal event emitter. */
function emitter() {
  const map = new Map();
  return {
    on(evt, cb) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(cb);
      return () => map.get(evt).delete(cb);
    },
    emit(evt, payload) {
      (map.get(evt) || []).forEach((cb) => cb(payload));
    },
  };
}

/**
 * In-memory Store. Holds the single active deck object. The deck is the same
 * JSON object the editor and AI both mutate in place (Conventions); `touch()`
 * announces a change so future autosave adapters have a seam to hook.
 */
export function createMemoryStore(initialDeck) {
  let deck = initialDeck;
  const bus = emitter();
  return {
    getDeck() {
      return deck;
    },
    setDeck(d) {
      deck = d;
      bus.emit("change", deck);
    },
    /** Call after any in-place mutation of the deck. No-op persistence today. */
    touch() {
      bus.emit("change", deck);
    },
    on: bus.on,
  };
}
