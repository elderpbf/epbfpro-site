// codex/trilha/js/sub.js
// Compact sub-card used inside an aula body (Tarefa / Conteúdo da aula / Outros
// materiais). Clicking expands inline below it with the rendered item content
// (via the Codex item renderer) + a right-side action button. Item content is
// fetched through the Trail facade (ct_get_item_public).
// Globals (set by the Trilha HTML boot, before the module boot):
//   window.CdxGlyphs (icon library)
import { esc } from './utils.js';
import { isFresh } from './freshness.js';
import { injectActionButton } from './actions.js';
import { interceptItemOpen } from './gate.js';
import { openItemInto } from './item-open.js';

export function buildSub(item, opts = {}) {
  const sub = document.createElement('div');
  sub.className = 'cdx-tr-sub' + (opts.isTarefa ? ' cdx-tr-sub--tarefa' : '');
  sub.dataset.itemId = item.id;
  // Keyboard-operable (a11y): the sub-card is an expander, so expose it as a
  // button and toggle on Enter/Space, mirroring the click handler below.
  sub.setAttribute('role', 'button');
  sub.setAttribute('tabindex', '0');

  const isLab = item.type === 'lab';
  let zoneClass = 'cdx-tr-sub-zone';
  if (opts.isTarefa) zoneClass += ' cdx-tr-sub-zone--tarefa';
  else if (opts.isApostila) zoneClass += ' cdx-tr-sub-zone--apostila';
  else if (isLab) zoneClass += ' cdx-tr-sub-zone--lab';

  // A content item's icon comes from its type (item.type_icon: a "glyph:<key>"
  // resolved to an SVG by the Codex glyph library) rendered through CdxGlyphs.
  // The Tarefa zone keeps its dedicated check mark. Falls back to escaped text.
  let iconHtml;
  if (opts.isTarefa) {
    iconHtml = '✓';
  } else if (window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function' && item.type_icon) {
    iconHtml = window.CdxGlyphs.iconHtml(item.type_icon, { size: 20 });
  } else {
    iconHtml = esc(item.type_icon || '•');
  }
  // A lab wears a family marker over its per-lab glyph: a small flask badge in the
  // corner, so labs read as one set even while each keeps its own icon.
  if (isLab && window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function') {
    iconHtml += '<span class="cdx-tr-lab-flask">' + window.CdxGlyphs.iconHtml('glyph:flask', { size: 12 }) + '</span>';
  }
  const typeLabel = opts.isTarefa ? 'Tarefa' : (item.type_label || item.type || '');
  const novoPill = isFresh(item) ? '<span class="cdx-tr-novo-pill">NOVO</span>' : '';

  sub.innerHTML =
    '<div class="' + zoneClass + '">' + iconHtml + '</div>' +
    '<div class="cdx-tr-sub-meta">' +
      '<span class="cdx-tr-sub-type">' + esc(typeLabel) + novoPill + '</span>' +
      '<span class="cdx-tr-sub-title">' + esc(item.title) + '</span>' +
      (item.summary ? '<span class="cdx-tr-sub-summary">' + esc(item.summary) + '</span>' : '') +
    '</div>' +
    '<div class="cdx-tr-sub-actions"></div>';

  sub.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.cdx-tr-item-action')) return;
    // When open, clicks on the action-area padding (not the button) are dead space.
    if (sub.classList.contains('is-expanded') && e.target && e.target.closest && e.target.closest('.cdx-tr-sub-actions')) return;
    toggleSub(sub, item, opts);
  });
  sub.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target && e.target.closest && e.target.closest('.cdx-tr-item-action')) return;
    e.preventDefault();
    toggleSub(sub, item, opts);
  });
  return sub;
}

export async function toggleSub(sub, item, opts = {}) {
  const alreadyExpanded = sub.classList.contains('is-expanded');

  const list = sub.parentNode;
  list.querySelectorAll('.cdx-tr-sub-expanded').forEach((el) => el.remove());
  list.querySelectorAll('.cdx-tr-sub.is-expanded').forEach((el) => {
    el.classList.remove('is-expanded');
    const a = el.querySelector('.cdx-tr-sub-actions');
    if (a) a.innerHTML = '';
  });

  if (alreadyExpanded) return;

  // Inline content gate (Phase 7): on a gated turma, opening an item needs an
  // approved session. interceptItemOpen routes anonymous -> login, pending -> notice
  // (rendered into the expand slot); it is a no-op when LOGIN_ENABLED is off.
  if (interceptItemOpen((html) => {
    sub.classList.add('is-expanded');
    const notice = document.createElement('div');
    notice.className = 'cdx-tr-sub-expanded';
    notice.innerHTML = html;
    sub.parentNode.insertBefore(notice, sub.nextSibling);
  })) return;

  sub.classList.add('is-expanded');
  const exp = document.createElement('div');
  exp.className = 'cdx-tr-sub-expanded';
  sub.parentNode.insertBefore(exp, sub.nextSibling);

  // Everything from here on is shared with the flat card (item-open.js). What stays here is the
  // only part that is genuinely this card's: the body is a SIBLING node, and the action goes
  // into the row's own action slot.
  await openItemInto(exp, item, {
    aulaNumber: opts.aulaNumber,
    subBuilder: buildSub,
    opts,
    mountAction: (fetched) => injectActionButton(sub, fetched, opts),
    logTag: 'sub',
  });
}
