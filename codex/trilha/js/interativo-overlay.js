// codex/trilha/js/interativo-overlay.js
// Single source of truth for interativo CONTENT on the Trail. Interativo items are
// shipped artifacts: their title/summary/description/objective live in code, in
// js/interativos-registry.js. The backend seeds a COPY of title/summary into ct_items
// on first release, but that copy is insert-only, so a later rename in the registry
// never reaches already-seeded turmas. Instead of trusting the DB copy, we overlay the
// current registry values onto each released interativo by its interativo_key -- a
// rename now reaches students on the next load, and an interativo RETIRED from the
// registry is dropped. Twin of lab-overlay.js.
//
// The key comes from `interativo_key` (the turma view adds it via json_extract) or, on
// the expanded item, from meta_json. If NO key can be resolved we leave the item
// untouched (fail open) -- an overlay must never make a released interativo disappear.
import { findItem } from '../../js/interativos-registry.js';

function interativoKeyOf(item) {
  if (item.interativo_key) return String(item.interativo_key);
  let meta = item.meta_json;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch (_) { meta = null; }
  }
  meta = meta || {};
  if (meta.interativo_key) return String(meta.interativo_key);
  const m = /\/codex\/interativos\/([^/]+)\/?$/.exec(meta.url || '');
  return m ? m[1] : null;
}

// Overlay one interativo item in place. Returns false when the item is an interativo
// whose key is known but no longer in the registry (caller should drop it); true otherwise.
export function overlayInterativoItem(item) {
  if (!item || item.type !== 'interativo') return true;
  const key = interativoKeyOf(item);
  if (!key) return true; // can't key it -> leave as-is, never drop
  const reg = findItem('interativo:' + key);
  if (!reg) return false; // known key, retired from the registry -> drop
  item.title = reg.title;
  item.summary = reg.summary;
  item.description = reg.description || '';
  item.objective = reg.objective || '';
  if (reg.type_icon) item.type_icon = reg.type_icon; // per-item registry icon
  return true;
}

// Overlay every interativo in data.items, dropping ones retired from the registry.
export function overlayInterativoItems(data) {
  if (!data || !Array.isArray(data.items)) return data;
  data.items = data.items.filter((item) => overlayInterativoItem(item));
  return data;
}
