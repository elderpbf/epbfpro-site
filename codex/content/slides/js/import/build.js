// import/build.js, turn classified source slides into our deck JSON. Pure (no
// network): the UI layer persists the returned deck via the frozen Worker
// contract. Slot filling is GENERIC, driven by each layout's defaults() value
// types + slot name, never by a layout id, and runs through the SAME
// core/slots.normalizeSlots the AI-fill uses, so imported cards/topics come out
// as well-formed {id,…} items. Image slots are left at their default (null) for
// the text-first v1: Élder adds images by hand after import.
import { newDeck, newSlide } from '../core/deck.js';
import * as registry from '../layouts/registry.js';
import { normalizeSlots } from '../core/slots.js';

// A neutral content bundle distilled from a parsed source slide. Slot names map
// onto these fields below; unknown string slots default to the heading.
function contentFromSrc(src) {
  const paras = (src && src.paragraphs) || [];
  const heading = ((src && src.title) || '').trim();
  return {
    heading,
    items: paras,
    caption: heading || (paras[0] || '').trim(),
    sub: paras[0] || '',
    eyebrow: '',
  };
}

// Which content string feeds a given string slot (by slot NAME, not layout id).
function pickText(key, content) {
  if (key === 'caption') return content.caption;
  if (key === 'sub') return content.sub;
  if (key === 'eyebrow') return content.eyebrow;
  return content.heading; // title + any other string slot
}

// Build the raw slots a layout can accept from the content bundle, keyed by the
// layout's OWN slot names: list slots get the items, string slots get mapped
// text. Image/control slots are omitted (normalizeSlots would drop them anyway).
function rawSlotsFromContent(layout, content) {
  const d = layout.defaults();
  const raw = {};
  for (const [key, val] of Object.entries(d)) {
    if (Array.isArray(val)) raw[key] = content.items;
    else if (typeof val === 'string') raw[key] = pickText(key, content);
  }
  return raw;
}

// buildSlide, one classified slide -> one deck slide. Unknown layout ids fall
// back to topics so a bad classification can never produce an unrenderable slide.
export function buildSlide(classified) {
  const layout = registry.get(classified.layoutId) || registry.get('topics');
  const content = contentFromSrc(classified.src);
  const filled = normalizeSlots(rawSlotsFromContent(layout, content), layout);
  const slots = Object.assign(layout.defaults(), filled);
  return newSlide(layout.id, slots);
}

// buildDeck, classified slides -> a complete deck (theme/logo/assets from the
// standard seed). Never returns an empty deck; an import that yielded nothing
// keeps a single blank cover so the editor always has something to open.
export function buildDeck(classified, opts = {}) {
  const deck = newDeck();
  if (opts.title) deck.title = opts.title;
  const slides = (classified || []).map(buildSlide);
  deck.slides = slides.length ? slides : [newSlide('cover')];
  return deck;
}
