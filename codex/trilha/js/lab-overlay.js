// codex/trilha/js/lab-overlay.js
// Single source of truth for lab CONTENT on the Trail. Lab items are shipped
// artifacts (their title/summary/description/objective live in code, in
// js/labs-registry.js), but the backend seeds a copy of title/summary into
// ct_items when a lab is first released -- and that copy is insert-only, so a
// later rename in the registry never reached already-seeded turmas (students saw
// stale names like "Sinapse"). Instead of trusting the DB copy, we overlay the
// current registry values onto each released lab item by its lab_key. A rename in
// the registry now reaches students on the next load, and a lab that was removed
// from the registry (e.g. the retired k14) is dropped instead of lingering.
//
// Icon is intentionally NOT overlaid here: the Trail's per-type glyph (glyph:flask
// from ct_types) stays; per-lab glyphs are a separate, pending step.
import { findItem } from '../../js/labs-registry.js';

// The lab_key sits in meta_json ({ lab_key, url }), which arrives as an object or
// a JSON string depending on the endpoint. Fall back to parsing it out of the url.
function labKeyOf(item) {
  let meta = item && item.meta_json;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch (_) { meta = null; }
  }
  meta = meta || {};
  if (meta.lab_key) return String(meta.lab_key);
  const m = /\/codex\/labs\/([^/]+)\/?$/.exec(meta.url || '');
  return m ? m[1] : null;
}

// Mutates data.items in place: overlays registry text onto lab items and filters
// out labs whose key is no longer in the registry. Non-lab items pass through.
export function overlayLabItems(data) {
  if (!data || !Array.isArray(data.items)) return data;
  data.items = data.items.filter((item) => {
    if (!item || item.type !== 'lab') return true;
    const key = labKeyOf(item);
    const reg = key ? findItem('lab:' + key) : null;
    if (!reg) return false; // unknown / retired lab -> drop
    item.title = reg.title;
    item.summary = reg.summary;
    item.description = reg.description || '';
    item.objective = reg.objective || '';
    return true;
  });
  return data;
}
