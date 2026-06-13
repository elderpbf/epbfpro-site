// codex/trilha/js/aulas.js
// Aulas tab: the timeline of aula cards + the inline-expand body (Tarefa /
// Conteúdo da aula / Outros materiais). On mobile, a single-open accordion
// invariant is enforced in JS to match the focus-mode CSS. Registers its
// renderer with the page orchestrator; the type-filter inside Outros uses the
// Codex type filter.
import { state } from './state.js';
import { esc, aulaStatus, aulaDateText, parseTopics } from './utils.js';
import { countFreshIn } from './freshness.js';
import { buildSub } from './sub.js';
import { registerRenderer } from './page.js';
import { renderTypeFilter, applyTypeFilter } from '../../js/type-filter.js';

let _wired = false;

function closeAulaRow(row) {
  if (!row) return;
  const card = row.querySelector('.cdx-tr-card');
  if (!card) return;
  const headerEl = row.querySelector('.cdx-tr-card-header');
  card.classList.remove('open');
  row.classList.remove('is-open');
  if (headerEl) headerEl.setAttribute('aria-expanded', 'false');
  const body = card.querySelector('.cdx-tr-body');
  if (body) body.remove();
}

function wireBackPill() {
  const btn = document.getElementById('cdx-tr-back-pill');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cdx-tr-tl-row.is-open').forEach(closeAulaRow);
  });
}

// If the viewport crosses into mobile while several aulas are open, collapse all
// but the first so the single-open invariant matches the CSS state.
function wireMqMobile() {
  const mq = state.mqMobile;
  if (!mq || !mq.addEventListener) return;
  mq.addEventListener('change', (e) => {
    if (!e.matches) return;
    const openRows = document.querySelectorAll('.cdx-tr-tl-row.is-open');
    for (let i = 1; i < openRows.length; i++) closeAulaRow(openRows[i]);
  });
}

export function renderAulas() {
  if (!_wired) { wireBackPill(); wireMqMobile(); _wired = true; }
  const container = document.getElementById('cdx-tr-aulas-timeline');
  if (!container) return;
  const data = state.data || {};
  const aulas = (data.aulas || []).slice().sort((a, b) => a.aula_number - b.aula_number);
  if (!aulas.length) {
    container.innerHTML = '<div class="cdx-tr-empty">Nenhuma aula disponível ainda.</div>';
    return;
  }
  container.innerHTML = '';
  aulas.forEach((aula) => container.appendChild(buildAulaRow(aula)));
}

function buildAulaRow(aula) {
  const data = state.data || {};
  const status = aulaStatus(aula);
  const dateText = aulaDateText(aula);
  const topics = parseTopics(aula.topics_json);
  const items = data.items || [];
  const aulaItems = items.filter((it) => it.aula_number === aula.aula_number);
  const tarefaCount = aulaItems.filter((it) => it.type === 'tarefa').length;
  const freshCount = countFreshIn(aulaItems);
  const statusBadge = status === 'done' ? '✓' : (status === 'upcoming' ? String(aula.aula_number) : '·');

  const row = document.createElement('div');
  row.className = 'cdx-tr-tl-row';
  row.dataset.aula = aula.aula_number;

  const topicsHtml = topics.length
    ? '<div class="cdx-tr-topics">' + topics.map((t) => '<span class="cdx-tr-topic-chip">' + esc(t) + '</span>').join('') + '</div>'
    : '';

  let tarefaPill = '';
  if (tarefaCount === 1) tarefaPill = '<span class="cdx-tr-tarefa-pill">✓ Tarefa</span>';
  else if (tarefaCount >= 2) tarefaPill = '<span class="cdx-tr-tarefa-pill">✓ Tarefas (' + tarefaCount + ')</span>';

  let paddedNum = String(aula.aula_number);
  if (paddedNum.length < 2) paddedNum = '0' + paddedNum;

  const novoBannerHtml = freshCount
    ? '<div class="cdx-tr-novo-banner" role="button" tabindex="0" aria-label="Abrir aula com material novo">' +
        '<span class="cdx-tr-novo-text">Novo material adicionado</span>' +
        '<span class="cdx-tr-novo-count">' + freshCount + '</span>' +
      '</div>'
    : '';

  row.innerHTML =
    '<div class="cdx-tr-tl-dot cdx-tr-tl-dot--' + status + '">' + esc(statusBadge) + '</div>' +
    '<div class="cdx-tr-card' + (freshCount ? ' cdx-tr-card--has-novo' : '') + '" data-aula="' + aula.aula_number + '">' +
      novoBannerHtml +
      '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false">' +
        '<div class="cdx-tr-zone cdx-tr-zone--' + status + '">' +
          '<span class="cdx-tr-zone-num">' + paddedNum + '</span>' +
          '<span class="cdx-tr-zone-label">Aula</span>' +
        '</div>' +
        '<div class="cdx-tr-meta">' +
          '<div class="cdx-tr-meta-row">' +
            '<span class="cdx-tr-date-pill">' + esc(dateText) + '</span>' +
            tarefaPill +
          '</div>' +
          '<div class="cdx-tr-title">' + esc(aula.title || ('Aula ' + aula.aula_number)) + '</div>' +
          topicsHtml +
        '</div>' +
        '<div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div>' +
      '</div>' +
    '</div>';

  const headerEl = row.querySelector('.cdx-tr-card-header');
  if (headerEl) {
    headerEl.addEventListener('click', () => toggleAula(row, aula));
    headerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); toggleAula(row, aula); }
    });
  }
  const bannerEl = row.querySelector('.cdx-tr-novo-banner');
  if (bannerEl) {
    const openAndScroll = () => {
      if (!row.classList.contains('is-open')) toggleAula(row, aula);
      requestAnimationFrame(() => {
        const firstFresh = row.querySelector('.cdx-tr-sub .cdx-tr-novo-pill');
        if (firstFresh && firstFresh.closest) {
          const subEl = firstFresh.closest('.cdx-tr-sub');
          if (subEl && subEl.scrollIntoView) subEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    };
    bannerEl.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); openAndScroll(); });
    bannerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); openAndScroll(); }
    });
  }
  return row;
}

function toggleAula(row, aula) {
  const card = row.querySelector('.cdx-tr-card');
  const headerEl = row.querySelector('.cdx-tr-card-header');
  if (card.classList.contains('open')) { closeAulaRow(row); return; }

  const mobile = state.isFocusMode();
  if (mobile) {
    document.querySelectorAll('.cdx-tr-tl-row.is-open').forEach((other) => { if (other !== row) closeAulaRow(other); });
  }

  card.classList.add('open');
  row.classList.add('is-open');
  if (headerEl) headerEl.setAttribute('aria-expanded', 'true');
  card.appendChild(buildAulaBody(aula));

  if (mobile && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function buildAulaBody(aula) {
  const data = state.data || {};
  const items = data.items || [];
  const apostilaSet = data.apostila_set;
  const apostilaSetId = apostilaSet ? apostilaSet.id : null;
  const aulaItems = items.filter((it) => it.aula_number === aula.aula_number);

  const tarefaItems = aulaItems
    .filter((it) => it.type === 'tarefa')
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const apostilaItems = aulaItems
    .filter((it) => apostilaSetId !== null && it.set_id === apostilaSetId && it.type !== 'tarefa')
    .sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
  const outrosItems = aulaItems
    .filter((it) => {
      if (apostilaSetId !== null && it.set_id === apostilaSetId) return false;
      if (it.type === 'tarefa') return false;
      return true;
    })
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const body = document.createElement('div');
  body.className = 'cdx-tr-body';
  if (tarefaItems.length) body.appendChild(buildSection(tarefaItems.length === 1 ? 'Tarefa' : 'Tarefas', tarefaItems, { isTarefa: true }));
  if (apostilaItems.length) body.appendChild(buildSection('Conteúdo da aula', apostilaItems, { isApostila: true }));
  if (outrosItems.length) body.appendChild(buildOutrosSection(outrosItems));
  if (!tarefaItems.length && !apostilaItems.length && !outrosItems.length) {
    body.innerHTML = '<div class="cdx-tr-empty">Nenhum conteúdo disponível nesta aula ainda.</div>';
  }
  return body;
}

function buildSection(label, items, opts = {}) {
  const section = document.createElement('div');
  section.className = 'cdx-tr-section';
  section.innerHTML = '<div class="cdx-tr-section-label">' + esc(label) + '</div>';
  const list = document.createElement('div');
  list.className = 'cdx-tr-sub-list';
  items.forEach((item) => list.appendChild(buildSub(item, opts)));
  section.appendChild(list);
  return section;
}

// Outros materiais within an aula: a section with a type-filter chip strip
// (Codex type filter). Filter state is per-section (closure-scoped).
function buildOutrosSection(items) {
  const section = document.createElement('div');
  section.className = 'cdx-tr-section';
  section.innerHTML = '<div class="cdx-tr-section-label">Outros materiais</div>';

  const filterEl = document.createElement('div');
  filterEl.className = 'cdx-tr-type-filter';
  section.appendChild(filterEl);

  const list = document.createElement('div');
  list.className = 'cdx-tr-sub-list';
  section.appendChild(list);

  const seen = {};
  const types = [];
  items.forEach((it) => {
    if (seen[it.type]) return;
    seen[it.type] = true;
    types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
  });

  let selectedSlug = null;
  function renderList() {
    const filtered = applyTypeFilter(items, selectedSlug);
    list.innerHTML = '';
    filtered.forEach((item) => list.appendChild(buildSub(item)));
  }
  function rerenderFilter() {
    renderTypeFilter({
      container: filterEl, types, items, selectedSlug,
      onChange: (slug) => { selectedSlug = slug; rerenderFilter(); renderList(); },
    });
  }
  if (types.length > 1) rerenderFilter();
  else filterEl.style.display = 'none';
  renderList();
  return section;
}

registerRenderer('aulas', renderAulas);
