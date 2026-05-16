'use strict';

// ClassVault — boot. Display name: PensoCodex.

window.BS_AUTH.guard();
window.BS_AUTH.clearPasswordInputs();

window.Topbar.init({
  title: 'PensoIA',
  subtitle: 'PensoCodex',
  backLink: '/backstage/',
});

window.ClassVault = window.ClassVault || {};
ClassVault.active = null;
ClassVault.items = [];
ClassVault.filterType = null;  // null = "Tudo"
ClassVault.activeItemId = null;
ClassVault._prevRenderer = null;

(async function boot() {
  let data;
  try {
    data = await callWorker({ action: 'ct_list_all_turmas' });
  } catch (err) {
    _renderTurmaChipEmpty('Erro ao carregar turmas');
    return;
  }
  const turmas = (data && data.turmas) || [];
  if (!turmas.length) {
    _renderTurmaChipEmpty('Sem turmas');
    return;
  }
  const urlSel = new URLSearchParams(location.search).get('turma') || '';
  const sepIdx = urlSel.indexOf('--');
  const urlClient = sepIdx > 0 ? urlSel.slice(0, sepIdx) : '';
  const urlTurma  = sepIdx > 0 ? urlSel.slice(sepIdx + 2) : '';
  let active = turmas.find(t => t.client_slug === urlClient && t.turma_slug === urlTurma);
  if (!active) active = turmas[0];
  ClassVault.active = active;
  _renderTurmaChip(active, turmas);
  _wireItemClicks();
  _loadItems(active);
})();

function _wireItemClicks() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.addEventListener('click', e => {
    const sub = e.target.closest('.sub');
    if (!sub) return;
    const id = sub.getAttribute('data-item-id');
    const item = ClassVault.items.find(it => String(it.id) === id);
    if (!item) return;
    _selectItem(item, sub);
  });
}

function _selectItem(item, subEl) {
  document.querySelectorAll('.cv-sm-body .sub.is-active').forEach(el => el.classList.remove('is-active'));
  if (subEl) subEl.classList.add('is-active');
  _renderBreadcrumb(item);
  const view = document.querySelector('.cv-main-view');
  if (!view) return;
  if (ClassVault._prevRenderer) ClassVault._prevRenderer.cleanup(view);
  const renderer = _getRenderer(item.type);
  renderer.render(item, view);
  ClassVault._prevRenderer = renderer;
  ClassVault.activeItemId = item.id;
}

function _renderBreadcrumb(item) {
  const crumb = document.querySelector('.cv-main-crumb');
  if (!crumb) return;
  const turmaName = ClassVault.active ? (ClassVault.active.display_name || ClassVault.active.name) : '';
  const typeLabel = item.type_label || item.type;
  crumb.innerHTML =
    '<span>' + _esc(turmaName) + '</span>' +
    '<span class="cv-main-crumb-sep">/</span>' +
    '<span>' + _esc(typeLabel) + '</span>' +
    '<span class="cv-main-crumb-sep">/</span>' +
    '<strong>' + _esc(item.title) + '</strong>';
}

async function _loadItems(active) {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.innerHTML = '<div class="cv-sm-empty">Carregando itens...</div>';
  let data;
  try {
    data = await callWorker({
      action: 'cv_list_turma_items',
      client_slug: active.client_slug,
      turma_slug: active.turma_slug,
    });
  } catch (err) {
    body.innerHTML = '<div class="cv-sm-empty">Erro ao carregar itens.</div>';
    return;
  }
  ClassVault.items = (data && data.items) || [];
  _renderFilterChips(ClassVault.items);
  _renderItems(_filterItems(ClassVault.items));
}

function _renderFilterChips(items) {
  const head = document.querySelector('.cv-sm-head');
  if (!head) return;
  if (!items.length) { head.innerHTML = ''; return; }

  const counts = new Map();
  const labels = new Map();
  for (const it of items) {
    counts.set(it.type, (counts.get(it.type) || 0) + 1);
    if (!labels.has(it.type)) labels.set(it.type, it.type_label || it.type);
  }
  const sortedTypes = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  const chips = [
    '<button class="cv-sm-chip is-active" type="button" data-type="">' +
      'Tudo <span class="cv-sm-chip-count">' + items.length + '</span>' +
    '</button>'
  ];
  for (const [type, count] of sortedTypes) {
    chips.push(
      '<button class="cv-sm-chip" type="button" data-type="' + _esc(type) + '">' +
        _esc(labels.get(type)) + ' <span class="cv-sm-chip-count">' + count + '</span>' +
      '</button>'
    );
  }

  head.innerHTML = '<div class="cv-sm-chips">' + chips.join('') + '</div>';
  head.addEventListener('click', e => {
    const chip = e.target.closest('.cv-sm-chip');
    if (!chip) return;
    head.querySelectorAll('.cv-sm-chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    ClassVault.filterType = chip.getAttribute('data-type') || null;
    _renderItems(_filterItems(ClassVault.items));
  });
}

function _filterItems(items) {
  if (!ClassVault.filterType) return items;
  return items.filter(it => it.type === ClassVault.filterType);
}

function _renderItems(items) {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<div class="cv-sm-empty">Nenhum item nesta categoria.</div>';
    return;
  }
  body.innerHTML = items.map(_renderSubCard).join('');
}

function _renderSubCard(item) {
  const zoneClass = _zoneClassFor(item.type);
  const icon = item.type_icon || _zoneIconFor(item.type);
  return (
    '<div class="sub" data-item-id="' + _esc(String(item.id)) + '">' +
      '<div class="sub-zone' + (zoneClass ? ' ' + zoneClass : '') + '">' + _esc(icon || '•') + '</div>' +
      '<div class="sub-meta">' +
        '<span class="sub-type">' + _esc(item.type_label || item.type) + '</span>' +
        '<span class="sub-title">' + _esc(item.title) + '</span>' +
        (item.summary ? '<span class="sub-sub">' + _esc(item.summary) + '</span>' : '') +
      '</div>' +
    '</div>'
  );
}

function _zoneClassFor(type) {
  switch (type) {
    case 'tarefa':     return 'sub-zone--tarefa';
    case 'prompt':     return 'sub-zone--material';
    case 'guide':      return 'sub-zone--recurso';
    case 'material':   return 'sub-zone--material';
    case 'paper':      return 'sub-zone--recurso';
    case 'model_info': return 'sub-zone--recurso';
    case 'embed':      return 'sub-zone--recurso';
    case 'popup_url':  return 'sub-zone--llm';
    default:           return '';
  }
}
function _zoneIconFor(type) {
  switch (type) {
    case 'tarefa':     return '✓';
    case 'prompt':     return '¶';
    case 'guide':      return '★';
    case 'material':   return '¶';
    case 'paper':      return '📄';
    case 'model_info': return '✦';
    case 'slide':      return '▶';
    case 'embed':      return '⚙';
    case 'popup_url':  return '✦';
    default:           return '•';
  }
}

// ── Renderers (registry keyed by item.type) ──────────────────

ClassVault.renderers = {
  slide:     { render: _renderIframe,    cleanup: _cleanupClear },
  embed:     { render: _renderIframe,    cleanup: _cleanupClear },
  popup_url: { render: _renderPopupCard, cleanup: _cleanupClear },
};

function _getRenderer(type) {
  return ClassVault.renderers[type] || { render: _renderFallback, cleanup: _cleanupClear };
}

function _renderIframe(item, container) {
  const url = (item.meta_json && item.meta_json.url) || '';
  if (!url) {
    container.innerHTML = '<div class="cv-renderer-empty">URL não definida para este item.</div>';
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.className = 'cv-renderer-iframe';
  iframe.src = url;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; clipboard-write; fullscreen');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  container.innerHTML = '';
  container.appendChild(iframe);
}

function _renderPopupCard(item, container) {
  const url = (item.meta_json && item.meta_json.url) || '';
  container.innerHTML =
    '<div class="cv-popup-launcher">' +
      '<h2 class="cv-popup-launcher-title">' + _esc(item.title) + '</h2>' +
      (item.summary ? '<p class="cv-popup-launcher-desc">' + _esc(item.summary) + '</p>' : '') +
      '<button type="button" class="cv-popup-launcher-btn">Abrir em janela</button>' +
      (url ? '<p class="cv-popup-launcher-url">' + _esc(url) + '</p>' : '') +
    '</div>';
  const card = container.querySelector('.cv-popup-launcher');
  const btn = container.querySelector('.cv-popup-launcher-btn');
  btn.addEventListener('click', () => {
    if (!url) return;
    const popup = _openPopup(url);
    if (!popup) {
      const warn = document.createElement('p');
      warn.className = 'cv-popup-launcher-warn';
      warn.textContent = 'O navegador bloqueou o popup. Permita popups para este site e tente novamente.';
      card.appendChild(warn);
    }
  });
}

function _renderFallback(item, container) {
  container.innerHTML = '<div class="cv-renderer-fallback"></div>';
  const inner = container.querySelector('.cv-renderer-fallback');
  if (window.CTRenderer && CTRenderer.render) {
    CTRenderer.render(item, inner);
  } else {
    inner.innerHTML = '<div class="cv-renderer-empty">Tipo "' + _esc(item.type) + '" sem renderer.</div>';
  }
}

function _cleanupClear(container) {
  container.innerHTML = '';
}

function _openPopup(url) {
  const w = Math.max(800, Math.floor((window.outerWidth || window.innerWidth) - 80));
  const h = Math.max(600, Math.floor((window.outerHeight || window.innerHeight) - 80));
  const left = (typeof window.screenX === 'number' ? window.screenX : 0) + 40;
  const top  = (typeof window.screenY === 'number' ? window.screenY : 0) + 40;
  const features = [
    'popup=yes',
    'width=' + w,
    'height=' + h,
    'left=' + left,
    'top=' + top,
    'toolbar=no',
    'menubar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
  const popup = window.open(url, '_blank', features);
  if (popup && typeof popup.focus === 'function') popup.focus();
  return popup;
}

function _renderTurmaChip(active, turmas) {
  const topbarInner = document.querySelector('.bs-topbar-inner');
  const spacer = topbarInner && topbarInner.querySelector('.bs-topbar-spacer');
  if (!topbarInner || !spacer) return;

  const chip = document.createElement('button');
  chip.className = 'cv-turma-chip';
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', 'false');
  chip.innerHTML =
    '<span class="cv-turma-chip-avatar">' + _esc(_initials(active)) + '</span>' +
    '<span class="cv-turma-chip-label">' + _esc(active.display_name || active.name) + '</span>' +
    '<span class="cv-turma-chip-chev">▾</span>';

  const menu = document.createElement('div');
  menu.className = 'cv-turma-menu';
  menu.hidden = true;
  menu.innerHTML = turmas.map(t => {
    const key = t.client_slug + '--' + t.turma_slug;
    const isActive = (active.client_slug === t.client_slug && active.turma_slug === t.turma_slug);
    const client = t.client_display_name || t.client_slug;
    const turma  = t.display_name || t.name;
    return '<button class="cv-turma-menu-item' + (isActive ? ' is-active' : '') + '" ' +
             'type="button" data-key="' + _esc(key) + '">' +
             '<span class="cv-turma-menu-eyebrow">' + _esc(client) + '</span>' +
             '<span class="cv-turma-menu-name">' + _esc(turma) + '</span>' +
           '</button>';
  }).join('');

  function positionMenu() {
    const r = chip.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.left = r.left + 'px';
  }
  function openMenu() {
    menu.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
    positionMenu();
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
  }
  function closeMenu() {
    menu.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('resize', positionMenu);
    window.removeEventListener('scroll', positionMenu, true);
  }
  function onDocClick(e) {
    if (chip.contains(e.target) || menu.contains(e.target)) return;
    closeMenu();
  }

  chip.addEventListener('click', () => menu.hidden ? openMenu() : closeMenu());
  menu.addEventListener('click', e => {
    const item = e.target.closest('.cv-turma-menu-item');
    if (!item) return;
    const key = item.getAttribute('data-key');
    const u = new URL(location.href);
    u.searchParams.set('turma', key);
    location.href = u.toString();
  });

  topbarInner.insertBefore(chip, spacer);
  document.body.appendChild(menu);
}

function _renderTurmaChipEmpty(label) {
  const topbarInner = document.querySelector('.bs-topbar-inner');
  const spacer = topbarInner && topbarInner.querySelector('.bs-topbar-spacer');
  if (!topbarInner || !spacer) return;
  const chip = document.createElement('span');
  chip.className = 'cv-turma-chip';
  chip.style.cursor = 'default';
  chip.innerHTML =
    '<span class="cv-turma-chip-avatar">?</span>' +
    '<span class="cv-turma-chip-label">' + _esc(label) + '</span>';
  topbarInner.insertBefore(chip, spacer);
}

function _initials(t) {
  const src = (t && (t.client_display_name || t.name || t.display_name)) || '?';
  const words = src.trim().split(/\s+/).slice(0, 2);
  const out = words.map(w => (w[0] || '').toUpperCase()).join('');
  return out || '?';
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
