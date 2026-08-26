// codex/trilha/js/item-card.js
// THE MARKUP OF AN ITEM CARD, in one place. Track-61 §26, step 2 (step A).
//
// The trail draws the same thing twice: a COMPACT row inside a lesson (Tarefa / Conteúdo da aula
// / Outros materiais) and a FULL card in a tab of its own (Conteúdo do curso, Outros materiais).
// Step 1 (item-open.js, 2026-08-18) unified what happens when you OPEN one. This is the other
// half: what one LOOKS like.
//
// WHY IT MATTERS, and it is not tidiness: the two builders had already drifted. The same lab read
// differently in the Outros tab than inside its own lesson (§26.2), because a fix landed in one
// copy and not the other. Every piece a card is made of (the type glyph, the lab badge, the NOVO
// pill, the type label) now has exactly one definition, so a change to any of them reaches both
// surfaces or neither.
//
// STEP A KEEPS BOTH SHAPES EXACTLY AS THEY WERE, to the byte. The two templates below are the old
// ones, moved, not rewritten: `tests/trilha-card-shell.test.mjs` holds the HTML the previous
// builders produced and asserts these produce the same string. Merging the two shapes into one
// (a single class family with a compact modifier) is step B, and that one moves pixels, so it
// waits for Élder's eye.
import { esc } from './utils.js';
import { isFresh } from './freshness.js';

// The item's own glyph, resolved through the Codex glyph library when the page has it. Falls back
// to the raw key as text, which is what both builders did: an item with no library must still
// show something rather than nothing.
export function itemIconHtml(item, size) {
  if (window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function' && item.type_icon) {
    return window.CdxGlyphs.iconHtml(item.type_icon, { size: size });
  }
  return esc(item.type_icon || '•');
}

// A lab wears a family marker over its per-lab glyph: a small flask badge in the corner, so labs
// read as one set even while each keeps its own icon.
export function labFlaskHtml() {
  if (!(window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function')) return '';
  return '<span class="cdx-tr-lab-flask">' + window.CdxGlyphs.iconHtml('glyph:flask', { size: 12 }) + '</span>';
}

// The NOVO pill, on anything released inside the freshness window. Which ELEMENT carries it still
// differs between the two shapes (the type line in the compact row, the title in the full card),
// and that is one of the things step B settles.
export function novoPillHtml(item) {
  return isFresh(item) ? '<span class="cdx-tr-novo-pill">NOVO</span>' : '';
}

// What the card calls this item's type. A tarefa says so regardless of the type registry.
export function typeLabelOf(item, o) {
  if (o && o.isTarefa) return 'Tarefa';
  return item.type_label || item.type || '';
}

// ── the compact row (inside a lesson) ───────────────────────────────────────
// Zone precedence, unchanged: tarefa, then apostila, then lab. A tarefa keeps its dedicated check
// mark instead of a type glyph.
export function compactCardClass(o) {
  return 'cdx-tr-sub' + (o && o.isTarefa ? ' cdx-tr-sub--tarefa' : '');
}

export function compactCardHtml(item, o) {
  const opts = o || {};
  const isLab = item.type === 'lab';
  let zoneClass = 'cdx-tr-sub-zone';
  if (opts.isTarefa) zoneClass += ' cdx-tr-sub-zone--tarefa';
  else if (opts.isApostila) zoneClass += ' cdx-tr-sub-zone--apostila';
  else if (isLab) zoneClass += ' cdx-tr-sub-zone--lab';

  let iconHtml = opts.isTarefa ? '✓' : itemIconHtml(item, 20);
  if (isLab) iconHtml += labFlaskHtml();

  return '<div class="' + zoneClass + '">' + iconHtml + '</div>' +
    '<div class="cdx-tr-sub-meta">' +
      '<span class="cdx-tr-sub-type">' + esc(typeLabelOf(item, opts)) + novoPillHtml(item) + '</span>' +
      '<span class="cdx-tr-sub-title">' + esc(item.title) + '</span>' +
      (item.summary ? '<span class="cdx-tr-sub-summary">' + esc(item.summary) + '</span>' : '') +
    '</div>' +
    '<div class="cdx-tr-sub-actions"></div>';
}

// ── the full card (a tab of its own) ────────────────────────────────────────
// It carries three things the compact row does not: an eyebrow (which lesson this section came
// from), the tag chips, and a chevron. The header IS the button; the body is appended to the card
// below it.
export function fullCardHtml(item, o) {
  const opts = o || {};
  const zoneClass = 'cdx-tr-zone' + (opts.isApostila ? ' cdx-tr-zone--apostila' : '');
  const eyebrowHtml = opts.eyebrow ? '<span class="cdx-tr-meta-eyebrow">' + esc(opts.eyebrow) + '</span>' : '';
  const summaryHtml = item.summary ? '<div class="cdx-tr-summary">' + esc(item.summary) + '</div>' : '';
  const tagsHtml = (item.tags && item.tags.length)
    ? '<div class="cdx-tr-topics">' + item.tags.map((t) => '<span class="cdx-tr-topic-chip">' + esc(t) + '</span>').join('') + '</div>'
    : '';

  return '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false">' +
      '<div class="' + zoneClass + '">' +
        '<span class="cdx-tr-zone-icon">' + itemIconHtml(item, 20) + '</span>' +
        '<span class="cdx-tr-zone-label">' + esc(typeLabelOf(item, opts)) + '</span>' +
      '</div>' +
      '<div class="cdx-tr-meta">' +
        eyebrowHtml +
        '<div class="cdx-tr-title">' + esc(item.title) + novoPillHtml(item) + '</div>' +
        summaryHtml +
        tagsHtml +
      '</div>' +
      '<div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div>' +
    '</div>';
}
