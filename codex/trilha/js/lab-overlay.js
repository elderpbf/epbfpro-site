// codex/trilha/js/lab-overlay.js
// Single source of truth for lab CONTENT on the Trail. Lab items are shipped
// artifacts: their title/summary/description/objective live in code, in
// js/labs-registry.js. The backend seeds a COPY of title/summary into ct_items on
// first release, but that copy is insert-only, so a later rename in the registry
// never reached already-seeded turmas (students saw stale names like "Sinapse").
// Instead of trusting the DB copy, we overlay the current registry values onto
// each released lab by its lab_key -- a rename now reaches students on the next
// load, and a lab RETIRED from the registry (the old k14) is dropped.
//
// The registry is the DEFAULT name, not the last word. Since track-65 the admin's rename
// (Content > Labs, "Renomear") lives in `ct_lab_state` and the Worker sends it as
// `lab_display_name`, so it WINS over the registry title here. Before that, renaming a lab
// changed only what the admin saw and made no difference to any student, which Élder called out
// as the irrational half: a rename that renames nothing. Editing `title:` in the source is still
// the way to change a lab's default for everyone; the override is the per-installation name.
//
// The key comes from `lab_key` (the Trail list adds it via json_extract) or, on
// the expanded item, from meta_json. If NO key can be resolved we leave the item
// untouched (fail open) -- an overlay must never make a released lab disappear.
//
// The icon is also overlaid: each lab gets its per-lab glyph (labIcon) in place of
// the shared per-type glyph:flask; sub.js adds the small flask family badge on top.
import { findItem } from '../../js/labs-registry.js';

function labKeyOf(item) {
  if (item.lab_key) return String(item.lab_key);
  let meta = item.meta_json;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch (_) { meta = null; }
  }
  meta = meta || {};
  if (meta.lab_key) return String(meta.lab_key);
  const m = /\/codex\/labs\/([^/]+)\/?$/.exec(meta.url || '');
  return m ? m[1] : null;
}

// Overlay one lab item in place. Returns false when the item is a lab whose key is
// known but no longer in the registry (caller should drop it); true otherwise.
export function overlayLabItem(item) {
  if (!item || item.type !== 'lab') return true;
  const key = labKeyOf(item);
  if (!key) return true; // can't key it -> leave as-is, never drop
  const reg = findItem('lab:' + key);
  if (!reg) return false; // known key, retired from the registry -> drop
  // The admin's rename wins; a blank or absent one falls back to the registry's own title, which
  // is also what makes clearing the rename in the admin revert the student's view.
  const renamed = typeof item.lab_display_name === 'string' ? item.lab_display_name.trim() : '';
  item.title = renamed || reg.title;
  item.summary = reg.summary;
  item.description = reg.description || '';
  item.objective = reg.objective || '';
  if (reg.type_icon) item.type_icon = reg.type_icon; // per-lab glyph, not the shared flask
  return true;
}

// Overlay every lab in data.items, dropping labs retired from the registry.
export function overlayLabItems(data) {
  if (!data || !Array.isArray(data.items)) return data;
  data.items = data.items.filter((item) => overlayLabItem(item));
  return data;
}
