// codex/trilha/js/sub.js
// Compact sub-card used inside an aula body (Tarefa / Conteúdo da aula / Outros
// materiais). Clicking expands inline below it with the rendered item content
// (via the Codex item renderer) + a right-side action button. Item content is
// fetched through the Trail facade (ct_get_item_public).
// Globals (set by the Trilha HTML boot, before the module boot):
//   window.CdxGlyphs (icon library)
import { state } from './state.js';
import { esc } from './utils.js';
import { isFresh } from './freshness.js';
import { injectActionButton } from './actions.js';
import { trail } from './api.js';
import { renderItem } from '../../js/item-render.js';
import { interceptItemOpen } from './gate.js';
import { overlayLabItem } from './lab-overlay.js';
import { overlayInterativoItem } from './interativo-overlay.js';
import { isProjeto, renderProjeto } from './projeto.js';

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
  exp.innerHTML = '<div class="ctr-loading">Carregando...</div>';
  sub.parentNode.insertBefore(exp, sub.nextSibling);

  try {
    const data = await trail.itemPublic({
      client_slug: state.clientSlug,
      turma_slug: state.turmaSlug,
      token: state.token,
      item_id: item.id,
      session_token: state.sessionToken,
      _silent: true,
    });
    // Lab content (title/summary/description/objective) comes from the code
    // registry, not the seeded DB copy -- overlay the fetched item before render.
    overlayLabItem(data.item);
    overlayInterativoItem(data.item);
    exp.innerHTML = '';
    // A wrapper doesn't render content, it lists its children (track-61). Each child is a row
    // just like any other, built by the same buildSub.
    if (isProjeto(data.item)) renderProjeto(data.item, exp, buildSub, opts);
    else renderItem(data.item, exp, { preview: true });
    injectActionButton(sub, data.item, opts);
  } catch (e) {
    if (window.bsLog) window.bsLog('trilha sub itemPublic: ' + (e && e.message || e), 'error');
    exp.innerHTML = '<div class="cdx-tr-empty">Erro ao carregar conteúdo.</div>';
  }
}
