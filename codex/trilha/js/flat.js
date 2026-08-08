// codex/trilha/js/flat.js
// Flat-card layout for the Apostila ("Conteúdo do curso") and Outros materiais
// tabs. Cards expand inline (no sub-card nesting); body content comes from the
// Codex item renderer, the action row from Actions.appendFlatActionRow. Reuses
// the same cdx-tr- card styles as the Aulas timeline. Registers both renderers.
// Globals (set by the Trilha HTML boot, before the module boot):
//   window.CdxGlyphs (icon library)
import { state } from './state.js';
import { esc, isOutrosItem } from './utils.js';
import { isFresh } from './freshness.js';
import { appendFlatActionRow } from './actions.js';
import { trail } from './api.js';
import { registerRenderer } from './page.js';
import { renderItem } from '../../js/item-render.js';
import { renderTypeFilter, applyTypeFilter } from '../../js/type-filter.js';
import { interceptItemOpen } from './gate.js';
import { isProjeto, renderProjeto } from './projeto.js';
import { buildSub } from './sub.js';

export function renderApostilaTab() {
  const container = document.getElementById('cdx-tr-apostila-list');
  if (!container) return;
  const data = state.data || {};
  const apostilaSet = data.apostila_set;
  if (!apostilaSet) {
    container.innerHTML = '<div class="cdx-tr-empty">Nenhum conteúdo disponível ainda.</div>';
    return;
  }
  const items = data.items || [];
  const aulas = data.aulas || [];
  const sections = items
    .filter((it) => it.set_id === apostilaSet.id)
    .sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
  if (!sections.length) {
    container.innerHTML = '<div class="cdx-tr-empty">Nenhuma seção compilada ainda.</div>';
    return;
  }
  container.innerHTML = '';
  sections.forEach((item) => {
    const aulaForItem = item.aula_number ? aulas.find((a) => a.aula_number === item.aula_number) : null;
    let paddedAula = '';
    if (item.aula_number != null) {
      paddedAula = String(item.aula_number);
      if (paddedAula.length < 2) paddedAula = '0' + paddedAula;
    }
    const eyebrow = paddedAula
      ? 'Aula ' + paddedAula + (aulaForItem && aulaForItem.title ? ' · ' + aulaForItem.title : '')
      : '';
    container.appendChild(buildFlatCard(item, { eyebrow, isApostila: true }));
  });
}

export function renderOutrosTab() {
  const filterEl = document.getElementById('cdx-tr-outros-filter');
  const listEl = document.getElementById('cdx-tr-outros-list');
  if (!listEl) return;

  const data = state.data || {};
  const items = (data.items || []).filter(isOutrosItem);
  if (!items.length) {
    listEl.innerHTML = '<div class="cdx-tr-empty">Nenhum material avulso disponível ainda.</div>';
    return;
  }

  const seen = {};
  const types = [];
  items.forEach((it) => {
    if (seen[it.type]) return;
    seen[it.type] = true;
    types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
  });

  function renderList() {
    const filtered = applyTypeFilter(items, state.outrosTypeFilter);
    listEl.innerHTML = '';
    if (!filtered.length) { listEl.innerHTML = '<div class="cdx-tr-empty">Nenhum item neste filtro.</div>'; return; }
    filtered.forEach((item) => listEl.appendChild(buildFlatCard(item)));
  }
  function rerenderFilter() {
    renderTypeFilter({
      container: filterEl, types, items, selectedSlug: state.outrosTypeFilter,
      onChange: (slug) => { state.outrosTypeFilter = slug; rerenderFilter(); renderList(); },
    });
  }
  rerenderFilter();
  renderList();
}

function buildFlatCard(item, opts = {}) {
  const card = document.createElement('div');
  card.className = 'cdx-tr-card';
  card.dataset.itemId = item.id;

  const iconHtml = (window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function' && item.type_icon)
    ? window.CdxGlyphs.iconHtml(item.type_icon, { size: 20 })
    : esc(item.type_icon || '•');
  const typeLabel = item.type_label || item.type || '';
  const zoneClass = 'cdx-tr-zone' + (opts.isApostila ? ' cdx-tr-zone--apostila' : '');

  const eyebrowHtml = opts.eyebrow ? '<span class="cdx-tr-meta-eyebrow">' + esc(opts.eyebrow) + '</span>' : '';
  const summaryHtml = item.summary ? '<div class="cdx-tr-summary">' + esc(item.summary) + '</div>' : '';
  const tagsHtml = (item.tags && item.tags.length)
    ? '<div class="cdx-tr-topics">' + item.tags.map((t) => '<span class="cdx-tr-topic-chip">' + esc(t) + '</span>').join('') + '</div>'
    : '';
  const novoPill = isFresh(item) ? '<span class="cdx-tr-novo-pill">NOVO</span>' : '';

  card.innerHTML =
    '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false">' +
      '<div class="' + zoneClass + '">' +
        '<span class="cdx-tr-zone-icon">' + iconHtml + '</span>' +
        '<span class="cdx-tr-zone-label">' + esc(typeLabel) + '</span>' +
      '</div>' +
      '<div class="cdx-tr-meta">' +
        eyebrowHtml +
        '<div class="cdx-tr-title">' + esc(item.title) + novoPill + '</div>' +
        summaryHtml +
        tagsHtml +
      '</div>' +
      '<div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div>' +
    '</div>';

  const headerEl = card.querySelector('.cdx-tr-card-header');
  if (headerEl) {
    headerEl.addEventListener('click', () => toggleFlatCard(card, item));
    headerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); toggleFlatCard(card, item); }
    });
  }
  return card;
}

async function toggleFlatCard(card, item) {
  const headerEl = card.querySelector('.cdx-tr-card-header');
  const existing = card.querySelector('.cdx-tr-body');

  if (card.classList.contains('open')) {
    card.classList.remove('open');
    if (headerEl) headerEl.setAttribute('aria-expanded', 'false');
    if (existing) existing.remove();
    return;
  }

  // Inline content gate (Phase 7): a gated turma needs an approved session to open
  // an item. interceptItemOpen routes anonymous -> login, pending -> notice (mounted
  // into the card body); no-op when LOGIN_ENABLED is off.
  if (interceptItemOpen((html) => {
    card.classList.add('open');
    if (headerEl) headerEl.setAttribute('aria-expanded', 'true');
    const notice = document.createElement('div');
    notice.className = 'cdx-tr-body';
    notice.innerHTML = html;
    card.appendChild(notice);
  })) return;

  card.classList.add('open');
  if (headerEl) headerEl.setAttribute('aria-expanded', 'true');

  const body = document.createElement('div');
  body.className = 'cdx-tr-body';
  body.innerHTML = '<div class="ctr-loading">Carregando...</div>';
  card.appendChild(body);

  try {
    const data = await trail.itemPublic({
      client_slug: state.clientSlug, turma_slug: state.turmaSlug, token: state.token,
      item_id: item.id, session_token: state.sessionToken, _silent: true,
    });
    body.innerHTML = '';
    const contentWrap = document.createElement('div');
    body.appendChild(contentWrap);
    // A folder opens the same way here and in the Aulas tab: the SAME renderProjeto, with the
    // SAME buildSub, so each child opens, copies, and downloads on its own. Without this, the
    // Outros (Others) card would show only the folder's text and a "Baixar tudo" (download all),
    // and the student would not reach what is inside without downloading the whole package.
    if (isProjeto(data.item)) renderProjeto(data.item, contentWrap, buildSub, {});
    else renderItem(data.item, contentWrap, { preview: true });
    appendFlatActionRow(body, data.item);
  } catch (e) {
    if (window.bsLog) window.bsLog('trilha flat itemPublic: ' + (e && e.message || e), 'error');
    body.innerHTML = '<div class="cdx-tr-empty">Erro ao carregar conteúdo.</div>';
  }
}

registerRenderer('apostila', renderApostilaTab);
registerRenderer('outros', renderOutrosTab);
