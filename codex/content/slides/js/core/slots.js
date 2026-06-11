// core/slots.js, shared slot coercion, driven by layout.defaults() and NEVER by
// a layout id. Two consumers feed untrusted slot data through this:
//   - ai/aiService.js (AI-fill): the model returns content of unknown shape.
//   - import/build.js (pptx import): source slides yield raw text/lists.
// Both need the SAME guarantee: every list slot ends up as well-formed items with
// fresh unique ids, card `mode` stays renderable, and image/control slots are
// left to the editor. Keeping it here means one definition, one test surface.
import { uid } from './schema.js';

// Fields a content producer (AI or importer) never sets: identity, build-order,
// and the structural card `parts` map (which parts a card shows is a layout/editor
// decision, not content). These keep their template defaults so the renderer always
// gets a shape it can draw.
export const FIXED_ITEM_KEYS = new Set(['id', 'step', 'parts']);

// The per-item CONTENT shape for a list slot, derived from its default first item
// (e.g. topics -> {text}, cards -> {text}). Drops the fixed keys above. Used to
// show a model/importer the item shape without leaking id/step/mode.
export function itemTemplate(defItem) {
  const src = defItem && typeof defItem === 'object' ? defItem : { text: '' };
  const tpl = {};
  for (const k of Object.keys(src)) if (!FIXED_ITEM_KEYS.has(k)) tpl[k] = src[k];
  if (!Object.keys(tpl).length) tpl.text = '';
  return tpl;
}

// normalizeSlots, coerce a raw slots object into the exact shape the renderer
// needs, driven by layout.defaults():
//   - LIST slots  -> array of well-formed items, each with a fresh id (mirrors
//                    the schema.js migrate idiom); a stray string becomes {text}.
//   - STRING slots -> passed through (coerced to string defensively).
//   - everything else (boolean/number control flags, image/object slots) is
//     dropped, so a producer can never clobber geometry or a hand-placed image.
export function normalizeSlots(slots, layout) {
  const d = layout.defaults();
  const out = {};
  for (const [key, val] of Object.entries(slots || {})) {
    const def = d[key];
    if (Array.isArray(def)) {
      out[key] = normalizeList(val, def[0]);
    } else if (typeof def === 'string') {
      out[key] = typeof val === 'string' ? val : String(val == null ? '' : val);
    }
    // boolean/number/object defaults: not producer-filled, skip.
  }
  return out;
}

export function normalizeList(val, defItem) {
  const arr = Array.isArray(val) ? val : val == null ? [] : [val];
  return arr.map((raw) => normalizeItem(raw, defItem)).filter(Boolean);
}

// Build one list item from a raw value. Start from the DEFAULT item (minus
// identity/sequence) so structural fields like the card `mode` keep a renderable
// value, then let the producer set only the text-like content fields (everything
// except id/step/mode). A fresh id is always assigned on our side.
export function normalizeItem(raw, defItem) {
  const src = defItem && typeof defItem === 'object' ? defItem : { text: '' };
  const item = {};
  for (const k of Object.keys(src)) {
    if (k === 'id' || k === 'step') continue;
    const v = src[k];
    // clone object defaults (e.g. the card `parts` map) so items never share a ref
    item[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  }
  let contentKeys = Object.keys(src).filter((k) => !FIXED_ITEM_KEYS.has(k));
  if (!contentKeys.length) { item.text = ''; contentKeys = ['text']; }
  const textKey = contentKeys.find((k) => typeof src[k] === 'string') || contentKeys[0];

  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    item[textKey] = raw;
  } else if (raw && typeof raw === 'object') {
    for (const k of contentKeys) {
      if (k in raw && typeof raw[k] === typeof src[k]) item[k] = raw[k];
    }
    // Robustness: if the text field is still the default but raw carries some
    // other string, use it (covers a differently-named content field).
    if (item[textKey] === src[textKey]) {
      const anyStr = Object.values(raw).find((v) => typeof v === 'string' && v.trim());
      if (anyStr) item[textKey] = anyStr;
    }
  } else {
    return null;
  }
  item.id = uid();
  return item;
}
