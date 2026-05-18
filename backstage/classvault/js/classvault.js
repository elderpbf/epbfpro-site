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
ClassVault.turmas = [];
ClassVault.items = [];
ClassVault.types = [];                       // ct_types, lazy-loaded for editor
ClassVault.tags = [];                        // ct_tags, lazy-loaded for editor
ClassVault.filterTypes = new Set();         // empty = no filter (Tudo)
ClassVault.collapsedAulas = new Set();      // empty = all expanded
ClassVault.activeItemId = null;
ClassVault._prevRenderer = null;
ClassVault.mode = 'render';                  // 'render' | 'editor'
ClassVault._editorHandle = null;             // CTItemForm handle when in editor mode
ClassVault._editorTarget = null;             // item being edited; null = create-new

(async function boot() {
  let data;
  try {
    data = await callWorker({ action: 'ct_list_all_turmas' });
  } catch (err) {
    _renderEmptySidebar('Erro ao carregar turmas');
    return;
  }
  const turmas = (data && data.turmas) || [];
  if (!turmas.length) {
    _renderEmptySidebar('Sem turmas');
    return;
  }
  ClassVault.turmas = turmas;
  const active = _pickActive(turmas);
  ClassVault.active = active;
  _renderSidebarHead(active, turmas);
  _wireItemClicks();
  _wireSidebarFooter();
  _wireItemContextMenu();
  _loadItems(active);
})();

function _pickActive(turmas) {
  const urlSel = new URLSearchParams(location.search).get('turma') || '';
  const sepIdx = urlSel.indexOf('--');
  const urlClient = sepIdx > 0 ? urlSel.slice(0, sepIdx) : '';
  const urlTurma  = sepIdx > 0 ? urlSel.slice(sepIdx + 2) : '';
  return turmas.find(t => t.client_slug === urlClient && t.turma_slug === urlTurma) || turmas[0];
}

function _renderEmptySidebar(label) {
  const head = document.querySelector('.cv-sm-head');
  if (head) head.innerHTML = '<div class="cv-sm-empty">' + _esc(label) + '</div>';
}

// ── Sidebar head: turma block (with dropdown) + category chips ─

function _renderSidebarHead(active, turmas) {
  const head = document.querySelector('.cv-sm-head');
  if (!head) return;
  head.innerHTML = '';

  const turmaBlock = document.createElement('button');
  turmaBlock.type = 'button';
  turmaBlock.className = 'cv-sm-turma';
  turmaBlock.setAttribute('aria-haspopup', 'true');
  turmaBlock.setAttribute('aria-expanded', 'false');
  turmaBlock.innerHTML =
    '<span class="cv-sm-turma-avatar">' + _esc(_initials(active)) + '</span>' +
    '<span class="cv-sm-turma-meta">' +
      '<span class="cv-sm-turma-eyebrow">' + _esc(active.client_display_name || active.client_slug) + '</span>' +
      '<span class="cv-sm-turma-name">' + _esc(active.display_name || active.name) + '</span>' +
    '</span>' +
    '<span class="cv-sm-turma-chev">▾</span>';
  head.appendChild(turmaBlock);

  const menu = document.createElement('div');
  menu.className = 'cv-turma-menu';
  menu.hidden = true;
  menu.innerHTML = turmas.map(t => {
    const key = t.client_slug + '--' + t.turma_slug;
    const isActive = (active.client_slug === t.client_slug && active.turma_slug === t.turma_slug);
    return '<button class="cv-turma-menu-item' + (isActive ? ' is-active' : '') + '" ' +
             'type="button" data-key="' + _esc(key) + '">' +
             '<span class="cv-turma-menu-eyebrow">' + _esc(t.client_display_name || t.client_slug) + '</span>' +
             '<span class="cv-turma-menu-name">' + _esc(t.display_name || t.name) + '</span>' +
           '</button>';
  }).join('');
  document.body.appendChild(menu);

  function positionMenu() {
    const r = turmaBlock.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = r.left + 'px';
    menu.style.width = r.width + 'px';
  }
  function openMenu() {
    menu.hidden = false;
    turmaBlock.setAttribute('aria-expanded', 'true');
    positionMenu();
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('resize', positionMenu);
  }
  function closeMenu() {
    menu.hidden = true;
    turmaBlock.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('resize', positionMenu);
  }
  function onDocClick(e) {
    if (turmaBlock.contains(e.target) || menu.contains(e.target)) return;
    closeMenu();
  }
  turmaBlock.addEventListener('click', () => menu.hidden ? openMenu() : closeMenu());
  menu.addEventListener('click', e => {
    const it = e.target.closest('.cv-turma-menu-item');
    if (!it) return;
    const key = it.getAttribute('data-key');
    const u = new URL(location.href);
    u.searchParams.set('turma', key);
    location.href = u.toString();
  });
}

// ── Items: fetch, chips, group by aula, render ─────────────────

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
  _renderCategoryChips(ClassVault.items);
  _renderItems(_filterItems(ClassVault.items));
}

function _renderCategoryChips(items) {
  const head = document.querySelector('.cv-sm-head');
  if (!head) return;
  let strip = head.querySelector('.cv-sm-chips');
  const firstRender = !strip;
  if (firstRender) {
    strip = document.createElement('div');
    strip.className = 'cv-sm-chips';
    head.appendChild(strip);
    strip.addEventListener('click', _onChipClick);
  }

  // One chip per type present in items, sorted by count desc.
  const counts = new Map();
  const labels = new Map();
  for (const it of items) {
    counts.set(it.type, (counts.get(it.type) || 0) + 1);
    if (!labels.has(it.type)) labels.set(it.type, it.type_label || it.type);
  }
  const sortedTypes = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  const tudoActive = ClassVault.filterTypes.size === 0;
  const chips = [
    '<button class="cv-sm-chip' + (tudoActive ? ' is-active' : '') + '" type="button" data-type="">' +
      'Tudo <span class="cv-sm-chip-count">' + items.length + '</span></button>'
  ];
  for (const [type, count] of sortedTypes) {
    const isActive = ClassVault.filterTypes.has(type);
    chips.push(
      '<button class="cv-sm-chip' + (isActive ? ' is-active' : '') + '" ' +
        'type="button" data-type="' + _esc(type) + '">' +
        _esc(labels.get(type)) + ' <span class="cv-sm-chip-count">' + count + '</span>' +
      '</button>'
    );
  }
  strip.innerHTML = chips.join('');
}

function _onChipClick(e) {
  const chip = e.target.closest('.cv-sm-chip');
  if (!chip || chip.disabled) return;
  const type = chip.getAttribute('data-type');
  if (!type) {
    ClassVault.filterTypes.clear();           // "Tudo" → clear filters
  } else if (ClassVault.filterTypes.has(type)) {
    ClassVault.filterTypes.delete(type);      // toggle off
  } else {
    ClassVault.filterTypes.add(type);         // toggle on (multi-select)
  }
  _renderCategoryChips(ClassVault.items);
  _renderItems(_filterItems(ClassVault.items));
}

function _filterItems(items) {
  if (ClassVault.filterTypes.size === 0) return items;
  return items.filter(it => ClassVault.filterTypes.has(it.type));
}

function _renderItems(items) {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<div class="cv-sm-empty">Nenhum item nesta categoria.</div>';
    return;
  }

  // Group by aula_number; null aula → "Sem aula" section at the bottom.
  const groups = new Map();
  for (const it of items) {
    const key = (it.aula_number != null && it.aula_number !== '') ? String(it.aula_number) : '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return Number(a) - Number(b);
  });

  const html = [];
  for (const key of groupKeys) {
    const groupItems = groups.get(key);
    const label = key === '__none__' ? 'Sem aula' : 'Aula ' + key;
    const isCollapsed = ClassVault.collapsedAulas.has(key);
    html.push(
      '<button type="button" class="cv-sm-section' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-aula="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-chev">▾</span>' +
        '<span>' + _esc(label) + '</span>' +
        '<span class="cv-sm-section-line"></span>' +
        '<span class="cv-sm-section-count">' + groupItems.length + '</span>' +
      '</button>'
    );
    if (!isCollapsed) {
      html.push(_renderAulaBody(groupItems));
    }
  }
  body.innerHTML = html.join('');

  // Preserve active sub state across re-renders
  if (ClassVault.activeItemId != null) {
    const el = body.querySelector('.sub[data-item-id="' + ClassVault.activeItemId + '"]');
    if (el) el.classList.add('is-active');
  }
}

// Within an aula, group items by type so the sidebar mirrors PensoTrilha's
// student-facing structure: Tarefa(s) first, Conteúdo second, Outros last.
// Sub-section labels render only when there's more than one populated group.
function _renderAulaBody(aulaItems) {
  const tarefa = aulaItems.filter(it => it.type === 'tarefa');
  const conteudo = aulaItems.filter(it => it.type === 'conteudo');
  const outros = aulaItems.filter(it => it.type !== 'tarefa' && it.type !== 'conteudo');
  const groups = [
    { label: tarefa.length === 1 ? 'Tarefa' : 'Tarefas', items: tarefa },
    { label: 'Conteúdo da aula', items: conteudo },
    { label: 'Outros', items: outros }
  ].filter(g => g.items.length);
  if (groups.length === 1) {
    return groups[0].items.map(_renderSubCard).join('');
  }
  return groups.map(g =>
    '<div class="cv-sm-subgroup-label">' + _esc(g.label) + '</div>' +
    g.items.map(_renderSubCard).join('')
  ).join('');
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

// ── Item click → renderer mount ────────────────────────────────

function _wireItemClicks() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.addEventListener('click', e => {
    const section = e.target.closest('.cv-sm-section');
    if (section) {
      const aulaKey = section.getAttribute('data-aula');
      if (ClassVault.collapsedAulas.has(aulaKey)) {
        ClassVault.collapsedAulas.delete(aulaKey);
      } else {
        ClassVault.collapsedAulas.add(aulaKey);
      }
      _renderItems(_filterItems(ClassVault.items));
      return;
    }
    const sub = e.target.closest('.sub');
    if (!sub) return;
    const id = sub.getAttribute('data-item-id');
    const item = ClassVault.items.find(it => String(it.id) === id);
    if (!item) return;
    _selectItem(item, sub);
  });
}

function _selectItem(item, subEl) {
  if (!_dirtyCheckBeforeSwitch()) return;
  if (ClassVault.mode === 'editor') _teardownEditor();
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

// ── Sidebar footer: "+ Adicionar" button (mounts editor in right pane) ──

function _wireSidebarFooter() {
  const aside = document.querySelector('.cv-sm');
  if (!aside) return;
  let footer = aside.querySelector('.cv-sm-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.className = 'cv-sm-footer';
    footer.innerHTML = '<button type="button" class="cv-sm-add-btn">+ Adicionar item</button>';
    aside.appendChild(footer);
  }
  const btn = footer.querySelector('.cv-sm-add-btn');
  btn.addEventListener('click', () => _openEditor(null));
}

// Right-click on an item opens a small contextual menu: Edit + audience flip.
function _wireItemContextMenu() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.addEventListener('contextmenu', e => {
    const sub = e.target.closest('.sub');
    if (!sub) return;
    e.preventDefault();
    const id = sub.getAttribute('data-item-id');
    const item = ClassVault.items.find(it => String(it.id) === id);
    if (!item) return;
    _openContextMenu(e.clientX, e.clientY, item);
  });
}

function _openContextMenu(x, y, item) {
  _closeContextMenu();
  const isVault = item.audience === 'vault_only';
  const flipLabel = isVault ? '↗ Promover para Trilha' : '↘ Mover para Vault';
  const menu = document.createElement('div');
  menu.className = 'cv-ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.innerHTML =
    '<button type="button" class="cv-ctx-item" data-action="edit">✏️ Editar...</button>' +
    '<button type="button" class="cv-ctx-item" data-action="flip">' + flipLabel + '</button>';
  document.body.appendChild(menu);
  ClassVault._ctxMenuEl = menu;
  menu.addEventListener('click', e => {
    const btn = e.target.closest('.cv-ctx-item');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    _closeContextMenu();
    if (action === 'edit') _openEditor(item);
    else if (action === 'flip') _flipItemAudience(item);
  });
  setTimeout(() => document.addEventListener('click', _closeContextMenu, { once: true }), 0);
  setTimeout(() => document.addEventListener('contextmenu', _closeContextMenu, { once: true }), 0);
}

function _closeContextMenu() {
  if (ClassVault._ctxMenuEl && ClassVault._ctxMenuEl.parentNode) {
    ClassVault._ctxMenuEl.parentNode.removeChild(ClassVault._ctxMenuEl);
  }
  ClassVault._ctxMenuEl = null;
}

async function _flipItemAudience(item) {
  const idx = ClassVault.items.findIndex(it => it.id === item.id);
  if (idx < 0) return;
  const current = item.audience === 'vault_only' ? 'vault_only' : 'public';
  const next = current === 'vault_only' ? 'public' : 'vault_only';
  ClassVault.items[idx].audience = next;
  try {
    const res = await callWorker({ action: 'ct_update_item', id: item.id, audience: next, _silent: true });
    if (res && res.error) throw new Error(res.error);
    if (window.BSToast) BSToast.show(next === 'vault_only' ? 'Movido para Vault.' : 'Promovido para Trilha.');
  } catch (err) {
    ClassVault.items[idx].audience = current;
    if (window.BSToast) BSToast.show('Erro: ' + (err.message || err));
  }
}

// ── Right-pane editor mount/unmount ─────────────────────────────

async function _openEditor(itemOrNull) {
  if (!_dirtyCheckBeforeSwitch()) return;
  if (!ClassVault.active) return;
  await _ensureTypesAndTagsLoaded();
  const view = document.querySelector('.cv-main-view');
  if (!view) return;
  // Tear down any previous renderer
  if (ClassVault._prevRenderer) {
    ClassVault._prevRenderer.cleanup(view);
    ClassVault._prevRenderer = null;
  }
  // Tear down any previous editor
  if (ClassVault._editorHandle) {
    try { ClassVault._editorHandle.destroy(); } catch (_) {}
    ClassVault._editorHandle = null;
  }
  ClassVault.mode = 'editor';
  ClassVault._editorTarget = itemOrNull;
  _renderEditorBreadcrumb(itemOrNull);

  const isEdit = !!itemOrNull;
  ClassVault._editorHandle = CTItemForm.mount(view, {
    item: itemOrNull,
    types: ClassVault.types,
    tags: ClassVault.tags,
    defaultAudience: 'vault_only',
    titleLabel: isEdit ? 'Editar item' : 'Adicionar item',
    saveLabel: isEdit ? 'Salvar' : 'Adicionar',
    closeLabel: '',
    excludeTypes: isEdit ? [] : ['conteudo', 'tarefa'],
    createAction: 'cv_create_item',
    createExtraParams: {
      client_slug: ClassVault.active.client_slug,
      turma_slug: ClassVault.active.turma_slug
    },
    onSave: async function(savedItem) {
      if (window.BSToast) BSToast.show(isEdit ? 'Item atualizado.' : 'Item adicionado.');
      ClassVault._editorHandle = null;
      ClassVault.mode = 'render';
      ClassVault._editorTarget = null;
      await _loadItems(ClassVault.active);
      const fresh = ClassVault.items.find(it => savedItem && it.id === savedItem.id);
      if (fresh) _selectItem(fresh, null);
      else _renderEmptyMainView();
    },
    onCancel: function() { _teardownEditor(); _restoreLastRendered(); },
    onDirtyChange: function() { /* no visual indicator yet */ }
  });
}

function _teardownEditor() {
  if (ClassVault._editorHandle) {
    try { ClassVault._editorHandle.destroy(); } catch (_) {}
    ClassVault._editorHandle = null;
  }
  ClassVault.mode = 'render';
  ClassVault._editorTarget = null;
}

function _restoreLastRendered() {
  if (ClassVault.activeItemId) {
    const item = ClassVault.items.find(it => it.id === ClassVault.activeItemId);
    if (item) { _selectItem(item, null); return; }
  }
  _renderEmptyMainView();
}

function _renderEmptyMainView() {
  const view = document.querySelector('.cv-main-view');
  if (view) view.innerHTML = '';
  const crumb = document.querySelector('.cv-main-crumb');
  if (crumb) crumb.innerHTML = '';
}

function _renderEditorBreadcrumb(item) {
  const crumb = document.querySelector('.cv-main-crumb');
  if (!crumb) return;
  const turmaName = ClassVault.active ? (ClassVault.active.display_name || ClassVault.active.name) : '';
  const label = item ? ('Editar / ' + (item.title || '')) : 'Adicionar item';
  crumb.innerHTML =
    '<span>' + _esc(turmaName) + '</span>' +
    '<span class="cv-main-crumb-sep">/</span>' +
    '<strong>' + _esc(label) + '</strong>';
}

function _dirtyCheckBeforeSwitch() {
  if (ClassVault.mode !== 'editor' || !ClassVault._editorHandle) return true;
  if (!ClassVault._editorHandle.isDirty()) return true;
  return window.confirm('Descartar alterações não salvas?');
}

async function _ensureTypesAndTagsLoaded() {
  if (ClassVault.types.length && ClassVault.tags.length) return;
  try {
    const [typesRes, tagsRes] = await Promise.all([
      callWorker({ action: 'ct_list_types' }),
      callWorker({ action: 'ct_list_tags' })
    ]);
    ClassVault.types = (typesRes && typesRes.types) || [];
    ClassVault.tags = (tagsRes && tagsRes.tags) || [];
  } catch (e) {
    if (window.BSToast) BSToast.show('Erro carregando tipos/tags.');
  }
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

// ── Renderers (registry keyed by item.type) ────────────────────

ClassVault.renderers = {
  slide:        { render: _renderIframe,      cleanup: _cleanupClear },
  embed:        { render: _renderIframe,      cleanup: _cleanupClear },
  popup_url:    { render: _renderPopupCard,   cleanup: _cleanupClear },
  drive_folder: { render: _renderDriveFolder, cleanup: _cleanupClear },
  drive_file:   { render: _renderDriveFile,   cleanup: _cleanupClear },
  video:        { render: _renderVideo,       cleanup: _cleanupClear },
};

function _getRenderer(type) {
  return ClassVault.renderers[type] || { render: _renderFallback, cleanup: _cleanupClear };
}

function _mountIframe(url, container, emptyMsg) {
  if (!url) {
    container.innerHTML = '<div class="cv-renderer-empty">' + _esc(emptyMsg || 'URL não definida para este item.') + '</div>';
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

function _renderIframe(item, container) {
  const url = (item.meta_json && item.meta_json.url) || '';
  _mountIframe(url, container);
}

function _renderDriveFolder(item, container) {
  const meta = item.meta_json || {};
  const id = meta.folder_id || _extractDriveFolderId(meta.url || '');
  const src = id ? 'https://drive.google.com/embeddedfolderview?id=' + encodeURIComponent(id) : '';
  _mountIframe(src, container, 'Pasta Drive sem folder_id (ou URL inválida).');
}

function _renderDriveFile(item, container) {
  const meta = item.meta_json || {};
  const id = meta.file_id || _extractDriveFileId(meta.url || '');
  const src = id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
  _mountIframe(src, container, 'Arquivo Drive sem file_id (ou URL inválida).');
}

function _renderVideo(item, container) {
  const url = (item.meta_json && item.meta_json.url) || '';
  const embed = _toVideoEmbedUrl(url);
  _mountIframe(embed, container, 'URL de vídeo não reconhecida (esperado YouTube ou TikTok).');
}

function _extractDriveFolderId(url) {
  const m = String(url).match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function _extractDriveFileId(url) {
  const m = String(url).match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function _toVideoEmbedUrl(url) {
  const s = String(url || '');
  if (!s) return '';
  // YouTube: watch?v=, youtu.be/, shorts/, embed/
  let m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  // TikTok: /@user/video/<id>
  m = s.match(/tiktok\.com\/[^/]+\/video\/(\d+)/);
  if (m) return 'https://www.tiktok.com/embed/v2/' + m[1];
  return '';
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
  container.innerHTML = '';

  // Outer card: flex column, no overflow. Header (fixed) + scroll (bounded).
  const card = document.createElement('div');
  card.className = 'cv-renderer-fallback';

  const md = item.body_md || '';
  if (md) {
    const header = document.createElement('div');
    header.className = 'cv-renderer-header';
    const topBtn = document.createElement('button');
    topBtn.type = 'button';
    topBtn.className = 'cv-renderer-copy-btn';
    topBtn.textContent = 'Copiar';
    topBtn.addEventListener('click', () => _cvCopy(md, topBtn));
    header.appendChild(topBtn);
    card.appendChild(header);
  }

  const scroll = document.createElement('div');
  scroll.className = 'cv-renderer-scroll';
  card.appendChild(scroll);

  const body = document.createElement('div');
  body.className = 'cv-renderer-body';
  scroll.appendChild(body);

  container.appendChild(card);

  if (window.CTRenderer && CTRenderer.render) {
    CTRenderer.render(item, body);
    _hideBottomBtnIfFits(scroll, body);
  } else {
    body.innerHTML = '<div class="cv-renderer-empty">Tipo "' + _esc(item.type) + '" sem renderer.</div>';
  }
}

// CTRenderer may mount its copy button synchronously (prompt) or after
// dynamically loading marked.js (guide/material/paper). Try once, then
// observe for the async case.
function _hideBottomBtnIfFits(scrollContainer, bodyMount) {
  const apply = () => {
    const btn = bodyMount.querySelector('.ctr-copy-btn');
    if (!btn) return false;
    const fits = scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1;
    btn.style.display = fits ? 'none' : '';
    return true;
  };
  if (apply()) return;
  const obs = new MutationObserver(() => { if (apply()) obs.disconnect(); });
  obs.observe(bodyMount, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 3000);
}

function _cvCopy(text, btn) {
  const orig = btn.textContent;
  const flash = () => {
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    flash();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(fallback);
  } else {
    fallback();
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

// ── Utilities ──────────────────────────────────────────────────

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
