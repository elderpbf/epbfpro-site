// content/slides/adapters/codexStore.js
// Store adapter: backs the Slides editor's in-memory Store interface with the
// Codex backend, reached ONLY through the codex-api slides facade (never raw
// callWorker, never raw action strings). The editor calls getDeck/setDeck/
// touch/on synchronously; persistence is the async load()/save() pair wrapping
// the frozen *_presentation actions (deck JSON in R2; the facade owns the key).
import { slides as slidesApi, assetUrl } from '../../../js/codex-api.js';

// Image src/url values in a deck point at the Worker's /r2/ route. We persist
// them ORIGIN-LESS (a leading "/r2/..." path) so a deck never hard-codes which
// Worker served it (backstage-api before the Stage 2 cutover, codex-api after),
// and we re-absolutize against the CURRENT Worker on load via the facade's
// assetUrl(). So an old deck that baked an absolute backstage-api origin self-
// heals on its next load+save; no R2 data migration is required.
const R2_ABS = /^https?:\/\/[^/]+(\/r2\/.*)$/;   // any origin + /r2/ path
const R2_REL = /^(\/r2\/.*)$/;                    // already origin-less

// Deep-map every string leaf of a JSON-shaped deck through fn, returning a clone
// (the in-memory deck the editor holds is never mutated).
function mapStrings(node, fn) {
  if (typeof node === 'string') return fn(node);
  if (Array.isArray(node)) return node.map((v) => mapStrings(v, fn));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k in node) out[k] = mapStrings(node[k], fn);
    return out;
  }
  return node;
}

// Persisted form: strip the Worker origin so only "/r2/..." is stored.
function toRelativeR2(deck) {
  if (!deck) return deck;
  return mapStrings(deck, (s) => { const m = s.match(R2_ABS); return m ? m[1] : s; });
}

// Hydrated form: point every "/r2/..." path (and any stale absolute Worker /r2/
// origin) at the CURRENT Worker, so old decks follow the cutover automatically.
function toAbsoluteR2(deck) {
  if (!deck) return deck;
  return mapStrings(deck, (s) => {
    const m = s.match(R2_ABS) || s.match(R2_REL);
    return m ? assetUrl(m[1]) : s;
  });
}

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
    // A presentation row that exists but has no saved deck JSON makes the frozen
    // deck-load action REJECT with "not found" rather than return empty data.
    // Treat that as the documented "null if none" so callers can seed a fresh
    // deck (a new certificate template hits this on its first open). Genuine
    // failures (network, auth, etc.) still propagate.
    async load() {
      let res;
      try {
        res = await api.getDeck({ slug });
      } catch (e) {
        const msg = (e && e.message) || String(e);
        if (!/not\s*found/i.test(msg)) throw e;
        res = null;
      }
      deck = toAbsoluteR2((res && res.data) || null);
      bus.emit('change', deck);
      return deck;
    },
    // Persist the current deck JSON to R2 via the facade. Image URLs are stored
    // origin-less (/r2/...) so the deck is Worker-independent; the in-memory deck
    // the editor keeps using stays absolute (toRelativeR2 returns a clone).
    async save() {
      const res = await api.saveDeck({ slug, data: toRelativeR2(deck) });
      bus.emit('saved', deck);
      return res;
    },
  };
}
