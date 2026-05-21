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
ClassVault.types = [];                       // ct_types, lazy-loaded for editor
ClassVault.tags = [];                        // ct_tags, lazy-loaded for editor
// Phase 3: three buckets keyed by section
ClassVault.vaultItems = [];                  // global vault library (audience='vault_only')
ClassVault.aulaPlanItems = [];               // Hoje: cv_aula_plan rows for active turma+aula
ClassVault.releaseItems = [];                // Trilha: ct_releases for active turma (audience='public', read-only)
ClassVault.aulas = [];                       // ct_aulas for active turma (powers aula picker)
ClassVault.aulaNumber = null;                // currently-selected aula (URL ?aula=N); null = "Todas"
ClassVault.collapsedSections = new Set(['hoje', 'vault', 'trilha', 'drive']);    // all sections (top-level + sub) collapsed by default; user expands as needed (sub keys: tag:X / aula:N / drive-folder:X)
ClassVault._seededCollapsedKeys = new Set(['hoje', 'vault', 'trilha', 'drive']);    // tracks which keys we've already initialized as collapsed; prevents re-collapsing after user expand
// Phase 5: Drive Mirror — synthetic items fetched browser-side via GIS token client.
ClassVault.driveItems = [];                  // synthetic Drive items (id prefixed with 'drive:')
ClassVault.activeItemId = null;
ClassVault._prevRenderer = null;
ClassVault.mode = 'render';                  // 'render' | 'editor' | 'creator'
ClassVault._editorHandle = null;             // CTItemForm handle when in editor mode
ClassVault._creatorHandle = null;            // CTItemCreator handle when in creator mode
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
  ClassVault.aulaNumber = _pickAula();
  _renderSidebarHead(active, turmas);
  _wireItemClicks();
  _wireSidebarFooter();
  _wireItemContextMenu();
  _wireDragReorder();
  // _loadCodex renders the sidebar; Drive section appends after codex resolves.
  await _loadCodex();
  if (window.CVDriveSync) CVDriveSync.init();
})();

function _pickAula() {
  const raw = new URLSearchParams(location.search).get('aula');
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

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

// Phase 3: load all three buckets + aulas in a single roundtrip.
async function _loadCodex() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.innerHTML = '<div class="cv-sm-empty">Carregando itens...</div>';
  const active = ClassVault.active;
  if (!active) return;
  let data;
  try {
    data = await callWorker({
      action: 'cv_get_codex_view',
      client_slug: active.client_slug,
      turma_slug: active.turma_slug,
      aula_number: ClassVault.aulaNumber
    });
  } catch (err) {
    body.innerHTML = '<div class="cv-sm-empty">Erro ao carregar itens.</div>';
    return;
  }
  ClassVault.vaultItems = (data && data.vault) || [];
  ClassVault.aulaPlanItems = (data && data.aula_plan) || [];
  ClassVault.releaseItems = (data && data.releases) || [];
  ClassVault.aulas = (data && data.aulas) || [];
  _renderAulaPicker();
  _renderSidebar();
}

// Locate an item across all buckets. Returns null if not found.
// Phase 5: string ids starting with 'drive:' look up ClassVault.driveItems (string compare).
function _findItem(itemId) {
  const idStr = String(itemId);
  if (idStr.startsWith('drive:')) {
    const it = ClassVault.driveItems.find(function(d) { return d.id === idStr; });
    return it ? { item: it, source: 'drive' } : null;
  }
  const idNum = Number(itemId);
  const match = (it) => Number(it.id) === idNum;
  let it = ClassVault.aulaPlanItems.find(match);
  if (it) return { item: it, source: 'aula_plan' };
  it = ClassVault.vaultItems.find(match);
  if (it) return { item: it, source: 'vault' };
  it = ClassVault.releaseItems.find(match);
  if (it) return { item: it, source: 'release' };
  return null;
}

function _renderSidebar() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  const html = [];

  // ── Hoje section (active aula only) ───────────────────────────
  if (ClassVault.aulaNumber != null) {
    html.push(_renderSection({
      key: 'hoje',
      label: 'Hoje · Aula ' + ClassVault.aulaNumber,
      count: ClassVault.aulaPlanItems.length,
      body: ClassVault.aulaPlanItems.length
        ? _renderAulaBody(ClassVault.aulaPlanItems, { draggable: true })
        : '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum item planejado. Clique direito num item do Vault → "Adicionar ao plano de hoje".</div>'
    }));
  }

  // ── Vault section (global, grouped by tag) ────────────────────
  html.push(_renderSection({
    key: 'vault',
    label: 'Vault',
    count: ClassVault.vaultItems.length,
    body: _renderVaultGroups(ClassVault.vaultItems)
  }));

  // ── Trilha section (read-only releases for turma) ─────────────
  html.push(_renderSection({
    key: 'trilha',
    label: 'Trilha · ' + (ClassVault.active.display_name || ClassVault.active.name),
    count: ClassVault.releaseItems.length,
    body: _renderTrilhaGroups(ClassVault.releaseItems)
  }));

  // ── Drive section (Phase 5: browser-side GIS mirror) ──────────
  html.push(_renderDriveSection());

  body.innerHTML = html.join('');

  if (ClassVault.activeItemId != null) {
    const el = body.querySelector('.sub[data-item-id="' + ClassVault.activeItemId + '"]');
    if (el) el.classList.add('is-active');
  }

  // Wire Drive section interactive buttons (sync, connect) after DOM is stamped.
  _wireDriveSyncButton();
}

function _renderSection({ key, label, count, body }) {
  const isCollapsed = ClassVault.collapsedSections.has(key);
  const sectionBody = isCollapsed ? '' : body;
  return (
    '<button type="button" class="cv-sm-section' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
      'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
      '<span class="cv-sm-section-chev">▾</span>' +
      '<span>' + _esc(label) + '</span>' +
      '<span class="cv-sm-section-line"></span>' +
      '<span class="cv-sm-section-count">' + count + '</span>' +
    '</button>' +
    sectionBody
  );
}

// Vault: group items by primary tag. Untagged items in a final "Sem tag" group.
function _renderVaultGroups(items) {
  if (!items.length) {
    return '<div class="cv-sm-empty cv-sm-empty--inline">Vault vazio. Use "+ Adicionar item" para criar.</div>';
  }
  const byTag = new Map();
  const untagged = [];
  for (const it of items) {
    const tags = it.tags || [];
    if (!tags.length) {
      untagged.push(it);
    } else {
      for (const t of tags) {
        const k = t.label;
        if (!byTag.has(k)) byTag.set(k, []);
        byTag.get(k).push(it);
      }
    }
  }
  const tagKeys = Array.from(byTag.keys()).sort((a, b) =>
    (byTag.get(b).length - byTag.get(a).length) || a.localeCompare(b)
  );
  if (untagged.length) tagKeys.push('__untagged__');

  return tagKeys.map(tagKey => {
    const groupItems = tagKey === '__untagged__' ? untagged : byTag.get(tagKey);
    const subKey = 'tag:' + tagKey;
    _seedCollapsedSubsection(subKey);
    const isCollapsed = ClassVault.collapsedSections.has(subKey);
    const headerLabel = tagKey === '__untagged__' ? 'Sem tag' : '#' + tagKey;
    return (
      '<button type="button" class="cv-sm-subsection' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-section="' + _esc(subKey) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-chev">▾</span>' +
        '<span>' + _esc(headerLabel) + '</span>' +
        '<span class="cv-sm-section-line"></span>' +
        '<span class="cv-sm-section-count">' + groupItems.length + '</span>' +
      '</button>' +
      (isCollapsed ? '' : _renderAulaBody(groupItems))
    );
  }).join('');
}

// Trilha: group released items by aula_number.
function _renderTrilhaGroups(items) {
  if (!items.length) {
    return '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum item liberado para esta turma ainda.</div>';
  }
  const groups = new Map();
  for (const it of items) {
    const k = it.aula_number != null ? String(it.aula_number) : '__none__';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return Number(a) - Number(b);
  });
  return keys.map(k => {
    const groupItems = groups.get(k);
    const subKey = 'trilha-aula:' + k;
    _seedCollapsedSubsection(subKey);
    const isCollapsed = ClassVault.collapsedSections.has(subKey);
    const headerLabel = k === '__none__' ? 'Sem aula' : 'Aula ' + k;
    return (
      '<button type="button" class="cv-sm-subsection' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-section="' + _esc(subKey) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-chev">▾</span>' +
        '<span>' + _esc(headerLabel) + '</span>' +
        '<span class="cv-sm-section-line"></span>' +
        '<span class="cv-sm-section-count">' + groupItems.length + '</span>' +
      '</button>' +
      (isCollapsed ? '' : _renderAulaBody(groupItems))
    );
  }).join('');
}

// ── Phase 5: Drive section ─────────────────────────────────────

// Re-render only the Drive section (called after sync completes without
// tearing down the full sidebar, preserving active selection).
function _renderDriveSectionOnly() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  // Find or create the Drive section placeholder.
  let placeholder = body.querySelector('.cv-sm-section--drive-wrapper');
  if (!placeholder) {
    // Drive section was not in the DOM yet; fall back to full sidebar re-render.
    _renderSidebar();
    return;
  }
  placeholder.outerHTML = _renderDriveSection();
  // Re-highlight active item if it's a Drive item.
  if (ClassVault.activeItemId && String(ClassVault.activeItemId).startsWith('drive:')) {
    const el = body.querySelector('.sub[data-item-id="' + ClassVault.activeItemId + '"]');
    if (el) el.classList.add('is-active');
  }
  _wireDriveSyncButton();
}

// Produce the full Drive section HTML string (header + body).
// The header uses a <div role="button"> instead of <button> so the sync button
// (a true <button>) can be a valid child (nested buttons are invalid HTML).
function _renderDriveSection() {
  const key = 'drive';
  const isCollapsed = ClassVault.collapsedSections.has(key);
  // Google-authed: Drive syncs automatically at boot (no CTA needed).
  // Password-authed: show a small "Conectar para sincronizar Drive" prompt.
  const googleAuthed = window.BS_GOOGLE && window.BS_GOOGLE.isAuthed();
  const count = ClassVault.driveItems.length;

  const headerHtml =
    '<div role="button" tabindex="0" class="cv-sm-section cv-sm-section--drive' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
      'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
      '<span class="cv-sm-section-chev">▾</span>' +
      '<span>📁 Drive</span>' +
      '<span class="cv-sm-section-line"></span>' +
      '<button type="button" class="cv-drive-sync-btn" data-drive-action="sync" title="Sincronizar Drive" aria-label="Sincronizar Drive">↻</button>' +
      '<span class="cv-sm-section-count">' + count + '</span>' +
    '</div>';

  let bodyHtml = '';
  if (!isCollapsed) {
    if (googleAuthed && count > 0) {
      // Happy path: Google-authed and items loaded.
      bodyHtml = _renderDriveGroups(ClassVault.driveItems);
    } else if (googleAuthed && count === 0) {
      // Google-authed but no items yet (sync in progress or empty folder).
      bodyHtml = '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum arquivo encontrado na pasta Drive.</div>';
    } else {
      // Password-authed (or not authed at all): show upgrade prompt.
      bodyHtml =
        '<div class="cv-sm-empty cv-sm-empty--inline cv-drive-auth-prompt">' +
          '<button type="button" class="cv-drive-connect-btn" data-drive-action="connect">Conectar para sincronizar Drive</button>' +
        '</div>';
    }
  }

  // Wrap in a marker element so _renderDriveSectionOnly can find and replace it.
  return '<div class="cv-sm-section--drive-wrapper">' + headerHtml + bodyHtml + '</div>';
}

// Group Drive items by subfolder name and render subsections.
function _renderDriveGroups(items) {
  if (!items.length) {
    return '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum arquivo encontrado na pasta Drive.</div>';
  }

  // Preserve group order as synthesized (groups appear in folder-appearance order).
  const groups = [];
  const groupMap = new Map();
  for (const it of items) {
    const g = it._group || '__raiz__';
    if (!groupMap.has(g)) {
      groupMap.set(g, []);
      groups.push(g);
    }
    groupMap.get(g).push(it);
  }

  return groups.map(function(groupKey) {
    const groupItems = groupMap.get(groupKey);
    const subKey = 'drive-folder:' + groupKey;
    _seedCollapsedSubsection(subKey);
    const isCollapsed = ClassVault.collapsedSections.has(subKey);
    const headerLabel = groupKey === '__raiz__' ? '📁 (raiz)' : groupKey;
    return (
      '<button type="button" class="cv-sm-subsection' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-section="' + _esc(subKey) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-chev">▾</span>' +
        '<span>' + _esc(headerLabel) + '</span>' +
        '<span class="cv-sm-section-line"></span>' +
        '<span class="cv-sm-section-count">' + groupItems.length + '</span>' +
      '</button>' +
      (isCollapsed ? '' : groupItems.map(function(it) { return _renderSubCard(it, false); }).join(''))
    );
  }).join('');
}

// Wire the sync button and "Conectar Drive" button after the Drive section
// is stamped into the DOM. Called by _renderSidebar and by _renderDriveSectionOnly.
function _wireDriveSyncButton() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  const wrapper = body.querySelector('.cv-sm-section--drive-wrapper');
  if (!wrapper) return;

  // Sync button: stop propagation so the parent section header doesn't collapse.
  const syncBtn = wrapper.querySelector('[data-drive-action="sync"]');
  if (syncBtn) {
    syncBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.CVDriveSync) CVDriveSync.syncNow();
    });
  }

  // "Conectar Drive" CTA.
  const connectBtn = wrapper.querySelector('[data-drive-action="connect"]');
  if (connectBtn) {
    connectBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.CVDriveSync) CVDriveSync.connect();
    });
  }

  // Keyboard activation for the div[role="button"] Drive section header.
  const header = wrapper.querySelector('.cv-sm-section--drive');
  if (header) {
    header.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  }
}

// Aula picker: dropdown chip rendered in the head, next to the turma chip.
function _renderAulaPicker() {
  const head = document.querySelector('.cv-sm-head');
  if (!head) return;
  let block = head.querySelector('.cv-sm-aula');
  if (!block) {
    block = document.createElement('button');
    block.type = 'button';
    block.className = 'cv-sm-aula';
    block.setAttribute('aria-haspopup', 'true');
    block.setAttribute('aria-expanded', 'false');
    head.appendChild(block);
  }
  const currentLabel = ClassVault.aulaNumber == null
    ? 'Todas as aulas'
    : ('Aula ' + ClassVault.aulaNumber);
  block.innerHTML =
    '<span class="cv-sm-aula-label">' + _esc(currentLabel) + '</span>' +
    '<span class="cv-sm-aula-chev">▾</span>';

  // Rebuild dropdown each render (cheap; aula list rarely changes)
  let menu = document.querySelector('.cv-aula-menu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.className = 'cv-aula-menu';
  menu.hidden = true;
  const aulas = ClassVault.aulas || [];
  const items = [
    { num: null, label: 'Todas as aulas' },
    ...aulas.map(a => ({ num: a.aula_number, label: 'Aula ' + a.aula_number + (a.title ? ' · ' + a.title : '') }))
  ];
  menu.innerHTML = items.map(o => {
    const isActive = (o.num === ClassVault.aulaNumber);
    const key = o.num == null ? '' : String(o.num);
    return '<button class="cv-aula-menu-item' + (isActive ? ' is-active' : '') + '" ' +
             'type="button" data-aula="' + _esc(key) + '">' + _esc(o.label) + '</button>';
  }).join('');
  document.body.appendChild(menu);

  function positionMenu() {
    const r = block.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = r.left + 'px';
    menu.style.width = r.width + 'px';
  }
  function openMenu() {
    menu.hidden = false;
    block.setAttribute('aria-expanded', 'true');
    positionMenu();
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('resize', positionMenu);
  }
  function closeMenu() {
    menu.hidden = true;
    block.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('resize', positionMenu);
  }
  function onDocClick(e) {
    if (block.contains(e.target) || menu.contains(e.target)) return;
    closeMenu();
  }
  block.onclick = () => menu.hidden ? openMenu() : closeMenu();
  menu.onclick = e => {
    const it = e.target.closest('.cv-aula-menu-item');
    if (!it) return;
    const raw = it.getAttribute('data-aula');
    const u = new URL(location.href);
    if (raw) u.searchParams.set('aula', raw);
    else u.searchParams.delete('aula');
    location.href = u.toString();
  };
}

// Within an aula, group items by type so the sidebar mirrors PensoTrilha's
// student-facing structure: Tarefa(s) first, Conteúdo second, Outros last.
// Sub-section labels render only when there's more than one populated group.
// opts.draggable === true marks .sub elements as HTML5-draggable (Hoje only).
function _renderAulaBody(aulaItems, opts) {
  const draggable = !!(opts && opts.draggable);
  const tarefa = aulaItems.filter(it => it.type === 'tarefa');
  const conteudo = aulaItems.filter(it => it.type === 'conteudo');
  const outros = aulaItems.filter(it => it.type !== 'tarefa' && it.type !== 'conteudo');
  const groups = [
    { label: tarefa.length === 1 ? 'Tarefa' : 'Tarefas', items: tarefa },
    { label: 'Conteúdo da aula', items: conteudo },
    { label: 'Outros', items: outros }
  ].filter(g => g.items.length);
  const renderCard = (it) => _renderSubCard(it, draggable);
  if (groups.length === 1) {
    return groups[0].items.map(renderCard).join('');
  }
  return groups.map(g =>
    '<div class="cv-sm-subgroup-label">' + _esc(g.label) + '</div>' +
    g.items.map(renderCard).join('')
  ).join('');
}

function _renderSubCard(item, draggable) {
  const zoneClass = _zoneClassFor(item.type);
  // BSTypeIcon (utils.js) returns a text-presentation Unicode glyph for known
  // types so the icon inherits the zone color via CSS, instead of clashing as
  // a multi-color emoji from the legacy ct_types.icon DB values. Falls back to
  // the DB icon (or _zoneIconFor) for any type without an override.
  const icon = (window.BSTypeIcon ? BSTypeIcon(item.type, item.type_icon || _zoneIconFor(item.type)) : (item.type_icon || _zoneIconFor(item.type)));
  const dragAttrs = draggable ? ' draggable="true" data-draggable="1"' : '';
  return (
    '<div class="sub' + (draggable ? ' sub--draggable' : '') + '"' +
      ' data-item-id="' + _esc(String(item.id)) + '"' + dragAttrs + '>' +
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
    const section = e.target.closest('.cv-sm-section, .cv-sm-subsection');
    if (section) {
      const key = section.getAttribute('data-section');
      if (ClassVault.collapsedSections.has(key)) {
        ClassVault.collapsedSections.delete(key);
      } else {
        ClassVault.collapsedSections.add(key);
      }
      _renderSidebar();
      return;
    }
    const sub = e.target.closest('.sub');
    if (!sub) return;
    const id = sub.getAttribute('data-item-id');
    const located = _findItem(id);
    if (!located) return;
    _selectItem(located.item, sub);
  });
}

function _selectItem(item, subEl) {
  if (!_dirtyCheckBeforeSwitch()) return;
  if (ClassVault.mode === 'editor') _teardownEditor();
  if (ClassVault.mode === 'creator') _teardownCreator();
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
  btn.addEventListener('click', () => _openCreator());
}

// Phase 4: drag-to-reorder for Hoje items. Only .sub[data-draggable="1"] is
// draggable (set by _renderSubCard when Hoje requests it). Drop must land on
// another draggable .sub — non-Hoje items don't accept drops, so cross-section
// drags are silently ignored. On a valid drop, compute the new order from DOM
// and call cv_reorder_aula_plan.
function _wireDragReorder() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;

  let draggedId = null;

  body.addEventListener('dragstart', e => {
    const sub = e.target.closest('.sub[data-draggable="1"]');
    if (!sub) return;
    draggedId = sub.getAttribute('data-item-id');
    sub.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    }
  });

  body.addEventListener('dragend', e => {
    const sub = e.target.closest('.sub');
    if (sub) sub.classList.remove('is-dragging');
    body.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    draggedId = null;
  });

  body.addEventListener('dragover', e => {
    const sub = e.target.closest('.sub[data-draggable="1"]');
    if (!sub || sub.classList.contains('is-dragging')) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    body.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    sub.classList.add('is-drop-target');
  });

  body.addEventListener('drop', async e => {
    const sub = e.target.closest('.sub[data-draggable="1"]');
    if (!sub || !draggedId) return;
    e.preventDefault();
    body.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    if (sub.getAttribute('data-item-id') === draggedId) return;

    const allDraggable = Array.from(body.querySelectorAll('.sub[data-draggable="1"]'));
    const draggedEl = allDraggable.find(el => el.getAttribute('data-item-id') === draggedId);
    if (!draggedEl) return;

    const dropIdx = allDraggable.indexOf(sub);
    const draggedIdx = allDraggable.indexOf(draggedEl);
    const reordered = allDraggable.slice();
    reordered.splice(draggedIdx, 1);
    const newDropIdx = draggedIdx < dropIdx ? dropIdx - 1 : dropIdx;
    reordered.splice(newDropIdx, 0, draggedEl);
    const newOrder = reordered.map(el => Number(el.getAttribute('data-item-id')));

    try {
      const res = await callWorker({
        action: 'cv_reorder_aula_plan',
        client_slug: ClassVault.active.client_slug,
        turma_slug: ClassVault.active.turma_slug,
        aula_number: ClassVault.aulaNumber,
        item_ids: newOrder
      });
      if (res && res.error) throw new Error(res.error);
      await _loadCodex();
    } catch (err) {
      if (window.BSToast) BSToast.show('Erro ao reordenar: ' + (err.message || err));
    }
  });
}

// Right-click on an item opens a contextual menu whose options vary by where
// the item lives (vault / hoje / trilha).
function _wireItemContextMenu() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.addEventListener('contextmenu', e => {
    const sub = e.target.closest('.sub');
    if (!sub) return;
    e.preventDefault();
    const id = sub.getAttribute('data-item-id');
    const located = _findItem(id);
    if (!located) return;
    _openContextMenu(e.clientX, e.clientY, located);
  });
}

function _openContextMenu(x, y, located) {
  // Phase 5: Drive items are non-actionable, no context menu.
  if (located.source === 'drive') return;
  _closeContextMenu();
  const { item, source } = located;
  const items = [];
  items.push({ action: 'edit', label: '✏️ Editar...' });

  if (source === 'vault') {
    const aulaOk = ClassVault.aulaNumber != null;
    const inPlanAlready = ClassVault.aulaPlanItems.some(it => it.id === item.id);
    if (aulaOk && !inPlanAlready) {
      items.push({ action: 'add-to-hoje', label: '📌 Adicionar ao plano de hoje' });
    }
    items.push({ action: 'promote', label: '↗ Promover para Trilha' });
  } else if (source === 'aula_plan') {
    items.push({ action: 'remove-from-hoje', label: '✖ Remover do plano' });
    items.push({ action: 'release', label: '↗ Liberar para alunos' });
  } else if (source === 'release') {
    items.push({ action: 'demote', label: '↘ Mover para Vault' });
  }

  const menu = document.createElement('div');
  menu.className = 'cv-ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.innerHTML = items.map(o =>
    '<button type="button" class="cv-ctx-item" data-action="' + _esc(o.action) + '">' + o.label + '</button>'
  ).join('');
  document.body.appendChild(menu);
  ClassVault._ctxMenuEl = menu;
  menu.addEventListener('click', e => {
    const btn = e.target.closest('.cv-ctx-item');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    _closeContextMenu();
    if (action === 'edit') _openEditor(item);
    else if (action === 'add-to-hoje') _addToHoje(item);
    else if (action === 'remove-from-hoje') _removeFromHoje(item);
    else if (action === 'promote') _setItemAudience(item, 'public');
    else if (action === 'demote') _setItemAudience(item, 'vault_only');
    else if (action === 'release') _releaseItemToCurrentAula(item);
  });
  // Dismiss listeners. Use named handlers so _closeContextMenu can remove them
  // before the bubble reaches document on the NEXT contextmenu — otherwise the
  // stale dismiss handler would close the menu the body just opened.
  setTimeout(() => {
    document.addEventListener('click', _docDismissCtxMenu);
    document.addEventListener('contextmenu', _docDismissCtxMenu);
  }, 0);
}

function _docDismissCtxMenu(e) {
  // Don't dismiss if the click/right-click landed inside the menu itself —
  // the menu's own click handler will close it after running the action.
  if (ClassVault._ctxMenuEl && ClassVault._ctxMenuEl.contains(e.target)) return;
  _closeContextMenu();
}

function _closeContextMenu() {
  document.removeEventListener('click', _docDismissCtxMenu);
  document.removeEventListener('contextmenu', _docDismissCtxMenu);
  if (ClassVault._ctxMenuEl && ClassVault._ctxMenuEl.parentNode) {
    ClassVault._ctxMenuEl.parentNode.removeChild(ClassVault._ctxMenuEl);
  }
  ClassVault._ctxMenuEl = null;
}

async function _addToHoje(item) {
  if (ClassVault.aulaNumber == null) return;
  try {
    const res = await callWorker({
      action: 'cv_add_to_aula_plan',
      client_slug: ClassVault.active.client_slug,
      turma_slug: ClassVault.active.turma_slug,
      aula_number: ClassVault.aulaNumber,
      item_id: item.id
    });
    if (res && res.error) throw new Error(res.error);
    if (window.BSToast) BSToast.show('Adicionado ao plano de hoje.');
    await _loadCodex();
  } catch (err) {
    if (window.BSToast) BSToast.show('Erro: ' + (err.message || err));
  }
}

async function _removeFromHoje(item) {
  if (ClassVault.aulaNumber == null) return;
  try {
    const res = await callWorker({
      action: 'cv_remove_from_aula_plan',
      client_slug: ClassVault.active.client_slug,
      turma_slug: ClassVault.active.turma_slug,
      aula_number: ClassVault.aulaNumber,
      item_id: item.id
    });
    if (res && res.error) throw new Error(res.error);
    if (window.BSToast) BSToast.show('Removido do plano.');
    await _loadCodex();
  } catch (err) {
    if (window.BSToast) BSToast.show('Erro: ' + (err.message || err));
  }
}

async function _setItemAudience(item, nextAudience) {
  const current = item.audience === 'vault_only' ? 'vault_only' : 'public';
  if (current === nextAudience) return;
  try {
    const res = await callWorker({
      action: 'ct_update_item',
      id: item.id,
      audience: nextAudience,
      _silent: true
    });
    if (res && res.error) throw new Error(res.error);
    if (window.BSToast) BSToast.show(
      nextAudience === 'vault_only' ? 'Movido para Vault.' : 'Promovido para Trilha.'
    );
    await _loadCodex();
  } catch (err) {
    if (window.BSToast) BSToast.show('Erro: ' + (err.message || err));
  }
}

// "Liberar para alunos" on a Hoje item: release to current turma+aula via
// ct_release_item and flip audience to public. After release the item moves
// from Hoje → Trilha.
async function _releaseItemToCurrentAula(item) {
  if (ClassVault.aulaNumber == null) return;
  try {
    const release = await callWorker({
      action: 'ct_release_item',
      client_slug: ClassVault.active.client_slug,
      turma_slug: ClassVault.active.turma_slug,
      item_id: item.id,
      aula_number: ClassVault.aulaNumber
    });
    if (release && release.error) throw new Error(release.error);
    if (item.audience !== 'public') {
      const upd = await callWorker({
        action: 'ct_update_item', id: item.id, audience: 'public', _silent: true
      });
      if (upd && upd.error) throw new Error(upd.error);
    }
    await callWorker({
      action: 'cv_remove_from_aula_plan',
      client_slug: ClassVault.active.client_slug,
      turma_slug: ClassVault.active.turma_slug,
      aula_number: ClassVault.aulaNumber,
      item_id: item.id
    });
    if (window.BSToast) BSToast.show('Liberado para alunos.');
    await _loadCodex();
  } catch (err) {
    if (window.BSToast) BSToast.show('Erro: ' + (err.message || err));
  }
}

// ── Right-pane editor mount/unmount ─────────────────────────────

async function _openEditor(itemOrNull, prefill, aiContext) {
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
  // Tear down any previous editor or creator
  if (ClassVault._editorHandle) {
    try { ClassVault._editorHandle.destroy(); } catch (_) {}
    ClassVault._editorHandle = null;
  }
  if (ClassVault._creatorHandle) {
    try { ClassVault._creatorHandle.destroy(); } catch (_) {}
    ClassVault._creatorHandle = null;
  }
  ClassVault.mode = 'editor';
  ClassVault._editorTarget = itemOrNull;
  _renderEditorBreadcrumb(itemOrNull);

  const isEdit = !!itemOrNull;
  ClassVault._editorHandle = CTItemForm.mount(view, {
    item: itemOrNull,
    prefill: prefill || null,
    aiContext: aiContext || null,
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
      turma_slug: ClassVault.active.turma_slug,
      // If the user picks audience=public in the form, also release to current
      // turma+aula as a convenience. Worker no-ops this for audience=vault_only.
      release_to_turma: true,
      aula_number: ClassVault.aulaNumber
    },
    onSave: async function(savedItem) {
      if (window.BSToast) BSToast.show(isEdit ? 'Item atualizado.' : 'Item adicionado.');
      ClassVault._editorHandle = null;
      ClassVault.mode = 'render';
      ClassVault._editorTarget = null;
      await _loadCodex();
      const located = savedItem ? _findItem(savedItem.id) : null;
      if (located) _selectItem(located.item, null);
      else _renderEmptyMainView();
    },
    onCancel: function() { _teardownEditor(); _restoreLastRendered(); },
    onDirtyChange: function() { /* no visual indicator yet */ }
  });
  if (isEdit && itemOrNull && itemOrNull.id) {
    _renderReuseHint(view, itemOrNull.id);
  }
}

// Show "Também liberado em: ..." beneath the editor header when the item being
// edited is released to turmas other than the currently active one. Silent if
// the item is vault-only or only released to the active turma.
async function _renderReuseHint(view, itemId) {
  let res;
  try {
    res = await callWorker({ action: 'ct_list_item_turmas', item_id: itemId });
  } catch (_) { return; }
  if (!res || !res.turmas || !res.turmas.length) return;
  // Editor may have been torn down or replaced while we awaited
  if (!ClassVault._editorHandle || ClassVault._editorTarget !== _editorTargetById(itemId)) return;
  const active = ClassVault.active || {};
  const others = res.turmas.filter(function(t) {
    return !(t.client_slug === active.client_slug && t.turma_slug === active.turma_slug);
  });
  if (!others.length) return;
  const header = view.querySelector('.ct-editor-header');
  if (!header) return;
  const labels = others.map(function(t) {
    return _esc((t.client_display_name || t.client_name) + ' / ' + (t.turma_display_name || t.turma_name));
  }).join(' · ');
  const hint = document.createElement('div');
  hint.className = 'cv-reuse-hint';
  hint.innerHTML = '<span class="cv-reuse-hint-label">Também liberado em:</span> ' + labels;
  header.insertAdjacentElement('afterend', hint);
}

function _editorTargetById(itemId) {
  const t = ClassVault._editorTarget;
  return (t && t.id === itemId) ? t : null;
}

// Step-1 content-first flow for new items. Edit mode skips this and goes
// straight to the editor.
async function _openCreator() {
  if (!_dirtyCheckBeforeSwitch()) return;
  if (!ClassVault.active) return;
  await _ensureTypesAndTagsLoaded();
  const view = document.querySelector('.cv-main-view');
  if (!view) return;
  if (ClassVault._prevRenderer) {
    ClassVault._prevRenderer.cleanup(view);
    ClassVault._prevRenderer = null;
  }
  if (ClassVault._editorHandle) {
    try { ClassVault._editorHandle.destroy(); } catch (_) {}
    ClassVault._editorHandle = null;
  }
  if (ClassVault._creatorHandle) {
    try { ClassVault._creatorHandle.destroy(); } catch (_) {}
    ClassVault._creatorHandle = null;
  }
  ClassVault.mode = 'creator';
  _renderCreatorBreadcrumb();

  ClassVault._creatorHandle = CTItemCreator.mount(view, {
    types: ClassVault.types,
    tags: ClassVault.tags,
    titleLabel: 'Adicionar item · 1 de 2',
    closeLabel: '',
    onCancel: function() { _teardownCreator(); _restoreLastRendered(); },
    onManual: function(out) {
      _teardownCreator();
      _openEditor(null, { body_md: out.body_md }, null);
    },
    onAIComplete: async function(result) {
      _teardownCreator();
      const tagIds = await _resolveTagLabels(result.tagLabels || []);
      const prefill = Object.assign({}, result.prefill, { tag_ids: tagIds });
      _openEditor(null, prefill, result.aiContext);
    }
  });
}

function _teardownCreator() {
  if (ClassVault._creatorHandle) {
    try { ClassVault._creatorHandle.destroy(); } catch (_) {}
    ClassVault._creatorHandle = null;
  }
  ClassVault.mode = 'render';
}

function _renderCreatorBreadcrumb() {
  const crumb = document.querySelector('.cv-main-crumb');
  if (!crumb) return;
  const turmaName = ClassVault.active ? (ClassVault.active.display_name || ClassVault.active.name) : '';
  crumb.innerHTML =
    '<span>' + _esc(turmaName) + '</span>' +
    '<span class="cv-main-crumb-sep">/</span>' +
    '<strong>Adicionar item · 1 de 2</strong>';
}

// Resolve a list of tag labels to existing tag IDs, creating any missing
// ones. Mirrors ct-admin.js _tagsByLabels but mutates ClassVault.tags.
async function _resolveTagLabels(labels) {
  const ids = [];
  for (let i = 0; i < labels.length; i++) {
    const label = (labels[i] || '').trim();
    if (!label) continue;
    const existing = ClassVault.tags.find(t => t.label.toLowerCase() === label.toLowerCase());
    if (existing) { ids.push(existing.id); continue; }
    try {
      const res = await callWorker({ action: 'ct_create_tag', label: label });
      if (res && res.tag) {
        if (!ClassVault.tags.find(t => t.id === res.tag.id)) {
          ClassVault.tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
        }
        ids.push(res.tag.id);
      }
    } catch (e) {}
  }
  return ids;
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
    const located = _findItem(ClassVault.activeItemId);
    if (located) { _selectItem(located.item, null); return; }
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
  const located = _findItem(item.id);
  const source = located ? located.source : null;

  // Phase 5: Drive items get path-only breadcrumb, no action buttons.
  if (source === 'drive') {
    crumb.innerHTML =
      '<span>PensoCodex</span>' +
      '<span class="cv-main-crumb-sep">/</span>' +
      '<span>Drive</span>' +
      '<span class="cv-main-crumb-sep">/</span>' +
      '<strong>' + _esc(item.title) + '</strong>';
    return;
  }

  // Path + actions area
  let html =
    '<span>' + _esc(turmaName) + '</span>' +
    '<span class="cv-main-crumb-sep">/</span>' +
    '<span>' + _esc(typeLabel) + '</span>' +
    '<span class="cv-main-crumb-sep">/</span>' +
    '<strong>' + _esc(item.title) + '</strong>' +
    '<span class="cv-main-crumb-spacer"></span>';

  // Primary action varies by where the item lives
  if (source === 'vault') {
    const disabled = ClassVault.aulaNumber == null;
    html += '<button type="button" class="cv-crumb-btn cv-crumb-btn--primary" data-action="add-to-hoje"' +
      (disabled ? ' disabled title="Selecione uma aula no menu lateral para planejar"' : '') +
      '>📌 Adicionar ao plano</button>';
  } else if (source === 'aula_plan') {
    html += '<button type="button" class="cv-crumb-btn cv-crumb-btn--primary" data-action="release">↗ Liberar para alunos</button>';
  } else if (source === 'release') {
    html += '<button type="button" class="cv-crumb-btn cv-crumb-btn--primary" data-action="demote">↘ Mover para Vault</button>';
  }

  html += '<button type="button" class="cv-crumb-btn" data-action="edit" title="Editar item">✏️ Editar</button>';
  if (_hasCrumbOverflow(source)) {
    html += '<button type="button" class="cv-crumb-btn cv-crumb-btn--icon" data-action="overflow" title="Mais ações" aria-haspopup="true">⋮</button>';
  }
  crumb.innerHTML = html;
  _wireCrumbActions(crumb, item, source);
}

function _hasCrumbOverflow(source) {
  // Vault items have "Promover para Trilha" as secondary; Hoje has "Remover do plano".
  // Trilha items currently have no secondary actions beyond Editar/Mover para Vault.
  return source === 'vault' || source === 'aula_plan';
}

function _wireCrumbActions(crumb, item, source) {
  crumb.querySelectorAll('.cv-crumb-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      if (btn.disabled) return;
      const action = btn.getAttribute('data-action');
      if (action === 'edit') _openEditor(item);
      else if (action === 'add-to-hoje') _addToHoje(item);
      else if (action === 'release') _releaseItemToCurrentAula(item);
      else if (action === 'demote') _setItemAudience(item, 'vault_only');
      else if (action === 'overflow') _openCrumbOverflowMenu(e.currentTarget, item, source);
    });
  });
}

function _openCrumbOverflowMenu(anchor, item, source) {
  _closeContextMenu();
  const items = [];
  if (source === 'vault') {
    items.push({ action: 'promote', label: '↗ Promover para Trilha' });
  } else if (source === 'aula_plan') {
    items.push({ action: 'remove-from-hoje', label: '✖ Remover do plano' });
  }
  if (!items.length) return;
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'cv-ctx-menu';
  menu.style.left = Math.max(8, rect.right - 220) + 'px';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.innerHTML = items.map(o =>
    '<button type="button" class="cv-ctx-item" data-action="' + _esc(o.action) + '">' + o.label + '</button>'
  ).join('');
  document.body.appendChild(menu);
  ClassVault._ctxMenuEl = menu;
  menu.addEventListener('click', e => {
    const btn = e.target.closest('.cv-ctx-item');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    _closeContextMenu();
    if (action === 'promote') _setItemAudience(item, 'public');
    else if (action === 'remove-from-hoje') _removeFromHoje(item);
  });
  setTimeout(() => {
    document.addEventListener('click', _docDismissCtxMenu);
    document.addEventListener('contextmenu', _docDismissCtxMenu);
  }, 0);
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

// Seed a sub-section key as collapsed the first time we see it (per session).
// If user later expands and we hit a re-render, _seededCollapsedKeys retains
// the key so we don't re-collapse over their choice.
function _seedCollapsedSubsection(key) {
  if (ClassVault._seededCollapsedKeys.has(key)) return;
  ClassVault._seededCollapsedKeys.add(key);
  ClassVault.collapsedSections.add(key);
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
