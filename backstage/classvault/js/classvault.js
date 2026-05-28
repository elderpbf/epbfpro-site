'use strict';

// ClassVault — boot. Display name: PensoCodex.

window.BS_AUTH.guard();
window.BS_AUTH.clearPasswordInputs();

window.Topbar.init({
  title: 'PensoIA',
  subtitle: 'PensoCodex',
  backLink: '/backstage/',
  tabs: window.Topbar.codexTabs('aula')
  // Aula has no sub-tabs → 64px topbar.
});
if (window.CVFocusMode) CVFocusMode.init();

// Bundle L Item 1: pin topbar in focus mode while Aula is empty (no item
// selected AND side menu hidden). Releases on side-menu open, item select,
// or focus mode off. Outside focus mode the body lacks .cv-focus, so the
// CSS rule (body.cv-focus.cv-topbar-pin .bs-topbar) is a no-op anyway.
function _updateTopbarPin() {
  var noItem = !window.ClassVault || !ClassVault.activeItemId;
  var focusOn = document.body.classList.contains('cv-focus');
  var sideOpen = document.body.classList.contains('cv-focus--side');
  var shouldPin = focusOn && noItem && !sideOpen;
  document.body.classList.toggle('cv-topbar-pin', shouldPin);
}
(function _watchBodyForPin() {
  if (typeof MutationObserver !== 'function') return;
  var obs = new MutationObserver(function() { _updateTopbarPin(); });
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
_updateTopbarPin();
// Bundle F text resize: +A / -A topbar buttons. Visible only when the active
// item supports text resize (per CVTypes.supportsTextResize). Scale persists
// in localStorage and applies via the --cv-content-scale CSS variable on the
// .cv-main-view element.
(function() {
  var SCALE_KEY = 'cv_content_scale';
  var MIN = 0.75, MAX = 1.6, STEP = 0.1;
  function clamp(s) { return Math.max(MIN, Math.min(MAX, +s.toFixed(2))); }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(SCALE_KEY); } catch (e) {}
    var n = parseFloat(raw);
    return Number.isFinite(n) ? clamp(n) : 1;
  }
  function save(v) { try { localStorage.setItem(SCALE_KEY, String(v)); } catch (e) {} }
  function apply(v) {
    // Scope the variable to .cv-main-view so it doesn't leak into the global
    // cascade. .cv-renderer-scroll lives inside .cv-main-view, so the CSS
    // calc(... * var(--cv-content-scale)) still resolves via inheritance.
    // During the very early boot tick the element may not exist yet; in that
    // case we retry once DOMContentLoaded fires.
    var target = document.querySelector('.cv-main-view');
    if (target) {
      target.style.setProperty('--cv-content-scale', String(v));
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function once() {
        document.removeEventListener('DOMContentLoaded', once);
        var el = document.querySelector('.cv-main-view');
        if (el) el.style.setProperty('--cv-content-scale', String(v));
      });
    }
  }
  window.CVTextResize = {
    apply: function() { apply(load()); },
    bump: function(delta) {
      var next = clamp(load() + delta);
      save(next);
      apply(next);
    },
    isApplicable: function(item) {
      return !!(item && window.CVTypes && CVTypes.supportsTextResize(item));
    },
    setButtonsVisible: function(visible) {
      var plus = document.getElementById('cv-text-plus');
      var minus = document.getElementById('cv-text-minus');
      if (plus) plus.style.display = visible ? '' : 'none';
      if (minus) minus.style.display = visible ? '' : 'none';
    }
  };
  CVTextResize.apply();
  if (window.Topbar) {
    // Pass HTML through `icon` so Topbar.addItem applies the bs-icon-btn box
    // styling (32x32 square) — matching the mock's icon-row appearance.
    var minus = Topbar.addItem({
      icon: '<span class="cv-text-icon">−A</span>',
      title: 'Diminuir texto',
      onClick: function() { CVTextResize.bump(-STEP); }
    });
    var plus = Topbar.addItem({
      icon: '<span class="cv-text-icon">+A</span>',
      title: 'Aumentar texto',
      onClick: function() { CVTextResize.bump(STEP); }
    });
    if (minus) minus.id = 'cv-text-minus';
    if (plus)  plus.id  = 'cv-text-plus';
    // Hidden until the user lands on a resizable item.
    CVTextResize.setButtonsVisible(false);
  }
})();

window.ClassVault = window.ClassVault || {};
ClassVault.active = null;
ClassVault.turmas = [];
ClassVault.types = [];                       // ct_types, lazy-loaded for editor
ClassVault.tags = [];                        // ct_tags, lazy-loaded for editor
// Bundle E: single bucket. Sidebar groups by content TYPE in classvault.js.
ClassVault.vaultItems = [];                  // global library of all authored items
// Top-level sidebar sections (Bundle E accordion: at most one open). The boot
// always opens 'favorites' and collapses everything else; search may expand
// sections temporarily to surface matches.
ClassVault.SECTION_KEYS = [
  'favorites', 'preset', 'llms', 'external', 'labs', 'drive', 'items', 'apostila', 'tarefas'
];
ClassVault.collapsedSections = new Set();    // (re)populated by _resetAccordion()
ClassVault._seededCollapsedKeys = new Set();

// PensoNexo live-session state. null = nothing live (Worker hasn't returned
// yet or no active session). Refreshed on boot and on demand via the refresh
// button inside the pinned PensoNexo card — no background polling.
ClassVault.liveSession = null;
ClassVault._liveSessionLoading = false;
async function _loadLiveSession() {
  ClassVault._liveSessionLoading = true;
  _renderPinnedNexo();
  let res;
  try { res = await callWorker({ action: 'cp_get_live_session', _silent: true }); }
  catch (e) { /* keep prior state on error */ }
  ClassVault._liveSessionLoading = false;
  ClassVault.liveSession = (res && res.session) || null;
  _renderPinnedNexo();
}

// Favorites — persistent across sessions via localStorage.
// Stored as JSON-array of stringified item ids (works for numeric ct_items.id,
// 'drive:<gid>' and 'lab:<key>' synthetic ids alike).
const _FAVORITES_KEY = 'cv_favorites_v1';
ClassVault.favorites = (function() {
  try {
    const raw = localStorage.getItem(_FAVORITES_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch (e) { return new Set(); }
})();
function _saveFavorites() {
  try {
    localStorage.setItem(_FAVORITES_KEY, JSON.stringify(Array.from(ClassVault.favorites)));
  } catch (e) {}
}
function _toggleFavorite(item) {
  const id = String(item.id);
  if (ClassVault.favorites.has(id)) ClassVault.favorites.delete(id);
  else ClassVault.favorites.add(id);
  _saveFavorites();
  _renderSidebar();
}
// Phase 5: Drive Mirror — synthetic items fetched browser-side via GIS token client.
ClassVault.driveItems = [];                  // synthetic Drive items (id prefixed with 'drive:')
ClassVault.activeItemId = null;
ClassVault._prevRenderer = null;
ClassVault.mode = 'render';                  // 'render' | 'editor' | 'creator'
ClassVault._editorHandle = null;             // CTItemForm handle when in editor mode
ClassVault._creatorHandle = null;            // CTItemCreator handle when in creator mode
ClassVault._editorTarget = null;             // item being edited; null = create-new

// Bundle I (rebuild): Lesson Presets. allPresets caches cv_list_presets for
// the sidebar "Carregar preset" dropdown. activePreset holds the currently
// loaded preset (full object) — when non-null, _renderSidebar branches to a
// flat preset-view that shows ONLY the preset's items resolved via _findItem.
ClassVault.allPresets = [];
ClassVault.activePreset = null;

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
  ClassVault.active = _pickActive(turmas);
  _resetAccordion();    // every load opens Favorites and collapses the rest
  _renderSearchInput();
  _wireItemClicks();
  _wireItemContextMenu();
  await _loadCodex();
  _initPresetLoader();   // Bundle I (rebuild): mount Aula sidebar dropdown
  _renderPinnedNexo();   // initial paint (null state)
  _loadLiveSession();    // fetch once on boot; user clicks refresh to update
  _renderEmptyMainView();  // welcome state until user selects a sidebar item
})();

function _resetAccordion() {
  // Bundle E: every page load opens Favorites, collapses every other top-level
  // section. Subsections (Drive folders, Labs categories) seed independently
  // via _seedCollapsedSubsection.
  ClassVault.collapsedSections = new Set();
  for (const k of ClassVault.SECTION_KEYS) {
    if (k !== 'favorites') ClassVault.collapsedSections.add(k);
  }
  ClassVault._seededCollapsedKeys = new Set(ClassVault.collapsedSections);
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

// ── Items: fetch + render ─────────────────────────────────────

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
      turma_slug: active.turma_slug
    });
  } catch (err) {
    body.innerHTML = '<div class="cv-sm-empty">Erro ao carregar itens.</div>';
    return;
  }
  ClassVault.vaultItems = (data && data.vault) || [];
  _renderSidebar();
}

// Locate an item across the three id namespaces. Returns null if not found.
// String ids starting with 'drive:' / 'lab:' are synthetic; numeric ids hit
// the ct_items library.
function _findItem(itemId) {
  const idStr = String(itemId);
  if (idStr.indexOf('lab:') === 0) {
    if (window.CVLabs) {
      const it = CVLabs.findItem(idStr);
      if (it) return { item: it, source: 'lab' };
    }
    return null;
  }
  if (idStr.startsWith('drive:')) {
    // Legacy synthetic id from the pre-DB-cache browser sync. Stale favorites
    // may still carry these; resolve against the in-memory driveItems list.
    const it = (ClassVault.driveItems || []).find(function(d) { return d.id === idStr; });
    return it ? { item: it, source: 'drive' } : null;
  }
  const idNum = Number(itemId);
  const it = ClassVault.vaultItems.find(function(x) { return Number(x.id) === idNum; });
  if (!it) return null;
  // drive_file rows live in ct_items but render with the Drive section's
  // breadcrumb actions (Copiar texto etc.) rather than the editor button.
  if (it.type === 'drive_file') return { item: it, source: 'drive' };
  return { item: it, source: 'vault' };
}

// Bundle E section order: Favorites / LLMs / External / Labs / Drive / Items /
// Apostila / Tarefas. External and Apostila/Tarefas are conditional. The
// classifier below partitions the vault library into the type-keyed buckets.
function _classifyVault(items) {
  const bucket = { llm: [], external: [], items: [], apostila: [], tarefas: [], drive: [] };
  for (const it of items) {
    if (it.type === 'drive_file') bucket.drive.push(it);
    else if (it.type === 'tarefa') bucket.tarefas.push(it);
    else if (it.set_id != null) bucket.apostila.push(it);
    else if (it.type === 'llm') bucket.llm.push(it);
    else if (it.type === 'popup_url') bucket.external.push(it);
    else bucket.items.push(it);
  }
  // The Drive section's existing renderers read from ClassVault.driveItems for
  // back-compat. Point it at the DB-backed bucket so the sidebar shows what
  // cv_sync_drive_items persisted instead of the browser-fetch cache.
  ClassVault.driveItems = bucket.drive;
  return bucket;
}

function _renderSidebar() {
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;

  const html = [];
  const buckets = _classifyVault(ClassVault.vaultItems);

  const favSection = _renderFavoritesSection();
  if (favSection) html.push(favSection);

  // Bundle I (rebuild, v2): preset is a regular accordion section alongside
  // the rest of the sidebar, not an exclusive view. Behaves like Favorites
  // does: a preselected collection that does not remove access to the other
  // sections. Renders only when activePreset is set; otherwise no slot.
  const presetSection = _renderPresetSection();
  if (presetSection) html.push(presetSection);

  html.push(_renderLLMsSection(buckets.llm));

  if (buckets.external.length) {
    html.push(_renderSection({
      key: 'external',
      label: 'External',
      count: buckets.external.length,
      body: buckets.external.map(it => _renderSubCard(it, false)).join('')
    }));
  }

  if (window.CVLabs) {
    html.push(CVLabs.renderSection(ClassVault.collapsedSections));
  }

  html.push(_renderDriveSection());

  html.push(_renderSection({
    key: 'items',
    label: 'Items',
    count: buckets.items.length,
    body: _renderItemsByType(buckets.items)
  }));

  if (buckets.apostila.length) {
    html.push(_renderSection({
      key: 'apostila',
      label: 'Apostila',
      count: buckets.apostila.length,
      body: buckets.apostila.map(it => _renderSubCard(it, false)).join('')
    }));
  }

  if (buckets.tarefas.length) {
    html.push(_renderSection({
      key: 'tarefas',
      label: 'Tarefas',
      count: buckets.tarefas.length,
      body: buckets.tarefas.map(it => _renderSubCard(it, false)).join('')
    }));
  }

  body.innerHTML = html.join('');

  if (ClassVault.activeItemId != null) {
    const el = body.querySelector('.sub[data-item-id="' + ClassVault.activeItemId + '"]');
    if (el) el.classList.add('is-active');
  }

  _wireDriveSyncButton();

  // Re-apply search filter on re-render so collapse toggles don't reset it.
  const searchInput = document.querySelector('.cv-sm-search');
  if (searchInput && searchInput.value) _applySearchFilter(searchInput.value);
}

// Bundle I (rebuild v2): preset as a regular sidebar section. Resolves each
// preset.item_id via _findItem so numeric ct_items, 'drive:<gid>', and
// 'lab:<key>' all surface in the section. Items the preset references but
// that are not available right now are silently skipped; the section
// header surfaces a resolved-vs-total count for transparency.
function _renderPresetSection() {
  if (!ClassVault.activePreset) return '';
  const preset = ClassVault.activePreset;
  const ids = (preset.item_ids || []);
  const items = [];
  for (const id of ids) {
    const res = _findItem(id);
    if (res && res.item) items.push(res.item);
  }
  const label = 'Preset: ' + (preset.name || '(sem nome)') + ' (' + items.length + '/' + ids.length + ')';
  // Body uses _renderItemsByType so the preset section is sub-grouped by
  // type, matching the Items section visual. Empty preset still renders the
  // accordion header with a clear empty hint.
  const body = items.length
    ? _renderItemsByType(items)
    : '<div class="cv-sm-empty">Nenhum item do preset esta disponivel agora.</div>';
  return _renderSection({
    key: 'preset',
    label: label,
    count: items.length,
    body: body
  });
}

// Bundle I (rebuild): mount the Aula sidebar "Carregar preset" dropdown. Sits
// in #cv-sm-preset (between cv-sm-head and cv-sm-body). Silent on error; if
// the worker is unreachable, the loader simply hides. If no presets exist,
// the mount point collapses (the rule keeps the head clean for first-time
// users with no presets saved yet).
async function _initPresetLoader() {
  const mountEl = document.getElementById('cv-sm-preset');
  if (!mountEl || !window.CVPresetsAPI || !window.CVPresetsUI) return;
  let presets = [];
  try {
    presets = await CVPresetsAPI.list({ _silent: true });
  } catch (_) {
    return;
  }
  ClassVault.allPresets = presets;
  if (!presets.length) {
    mountEl.style.display = 'none';
    return;
  }
  mountEl.style.display = '';
  CVPresetsUI.mountPresetLoader(mountEl, {
    presets: presets,
    currentPresetId: null,
    onSelect: function(preset) {
      ClassVault.activePreset = preset;
      // Default the preset section to OPEN when the user loads one, so the
      // items are immediately visible. Other sections keep their current
      // collapse state (Bundle I rebuild v2 changed presets from exclusive
      // view to inline section; the rest of the sidebar stays accessible).
      ClassVault.collapsedSections.delete('preset');
      _renderSidebar();
    },
    onReset: function() {
      ClassVault.activePreset = null;
      _renderSidebar();
    }
  });
}

// Per-section glyphs for the neon-glow card headers. Colors come from CSS
// (--sec set by .cv-sm-section--<key> modifier classes in classvault.css).
const SECTION_GLYPHS = {
  favorites: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>',
  llms:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9 14 11l-2 5-2-5-4.5-2 4.7-1.4z"/><path d="M5 17l.7 1.8L7.5 19.5l-1.8.7L5 22l-.7-1.8L2.5 19.5l1.8-.7z"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/></svg>',
  nexo:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  items:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/></svg>',
  apostila: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z"/><path d="M4 4v16"/></svg>',
  tarefas:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  drive:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
  labs:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v6.5L4 18a3 3 0 002.6 4.5h10.8A3 3 0 0020 18l-5-8.5V3"/><path d="M8 3h8"/></svg>'
};

function _renderSection({ key, label, count, body }) {
  const isCollapsed = ClassVault.collapsedSections.has(key);
  const sectionBody = isCollapsed ? '' : body;
  const glyph = SECTION_GLYPHS[key] || '';
  return (
    '<button type="button" class="cv-sm-section cv-sm-section--' + _esc(key) + (isCollapsed ? ' is-collapsed' : '') + '" ' +
      'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
      '<span class="cv-sm-section-glyph">' + glyph + '</span>' +
      '<span class="cv-sm-section-label">' + _esc(label) + '</span>' +
      '<span class="cv-sm-section-count">' + count + '</span>' +
      '<span class="cv-sm-section-chev">▾</span>' +
    '</button>' +
    sectionBody
  );
}

// Vault: group items by primary tag. Untagged items in a final "Sem tag" group.
// Render all items grouped by item.type — used by the simplified Trilha section.
// Type order is opinionated to match how the teacher thinks about items in class:
// Tarefas first, then Conteúdo, then visual aids, then everything else.
const _TYPE_ORDER = ['tarefa', 'conteudo', 'slide', 'prompt', 'material', 'paper'];
const _TYPE_LABEL = {
  tarefa:   'Tarefas',
  conteudo: 'Conteúdo',
  slide:    'Slides',
  prompt:   'Prompts',
  material: 'Materiais',
  paper:    'Papers'
};
function _renderItemsByType(items) {
  if (!items.length) {
    return '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum item ainda.</div>';
  }
  const groups = new Map();
  for (const it of items) {
    const k = it.type || '__other__';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const ordered = [];
  for (const k of _TYPE_ORDER) if (groups.has(k)) ordered.push(k);
  for (const k of groups.keys()) if (ordered.indexOf(k) === -1) ordered.push(k);

  return ordered.map(typeKey => {
    const groupItems = groups.get(typeKey);
    const subKey = 'type:' + typeKey;
    _seedCollapsedSubsection(subKey);
    const isCollapsed = ClassVault.collapsedSections.has(subKey);
    const headerLabel = _TYPE_LABEL[typeKey]
      || (groupItems[0] && groupItems[0].type_label)
      || (typeKey === '__other__' ? 'Outros' : typeKey);
    return (
      '<button type="button" class="cv-sm-subsection' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-section="' + _esc(subKey) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-chev">▾</span>' +
        '<span>' + _esc(headerLabel) + '</span>' +
        '<span class="cv-sm-section-line"></span>' +
        '<span class="cv-sm-section-count">' + groupItems.length + '</span>' +
      '</button>' +
      (isCollapsed ? '' : groupItems.map(it => _renderSubCard(it, false)).join(''))
    );
  }).join('');
}

// Search input placed in the cv-sm-head. Live-filters items in the body by
// title substring. While the query is non-empty, every section with at least
// one match is forced open so results are visible; sections without matches
// stay collapsed. Clearing the query restores the accordion (Favorites open).
function _renderSearchInput() {
  const head = document.querySelector('.cv-sm-head');
  if (!head) return;
  head.innerHTML =
    '<div class="cv-sm-search-wrap">' +
      '<span class="cv-sm-search-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '</span>' +
      '<input type="search" class="cv-sm-search" placeholder="Buscar..." autocomplete="off" spellcheck="false">' +
    '</div>';
  const input = head.querySelector('.cv-sm-search');
  if (!input) return;
  input.addEventListener('input', () => _applySearchFilter(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      input.value = '';
      _applySearchFilter('');
      e.stopPropagation();
    }
  });
}

function _applySearchFilter(rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  const pinned = document.querySelector('.cv-sm-pinned');
  if (!q) {
    // Restore accordion: only Favorites open. Also restore the pinned card
    // (Perguntas launcher) which the non-empty branch may have hidden.
    _resetAccordion();
    _renderSidebar();
    if (pinned) pinned.style.display = '';
    return;
  }
  // Open every section that has matching items so users can see results.
  for (const k of ClassVault.SECTION_KEYS) ClassVault.collapsedSections.add(k);
  if (_sectionMatchesQuery('favorites', q)) ClassVault.collapsedSections.delete('favorites');
  if (_sectionMatchesQuery('llms', q))      ClassVault.collapsedSections.delete('llms');
  if (_sectionMatchesQuery('external', q))  ClassVault.collapsedSections.delete('external');
  if (_sectionMatchesQuery('labs', q))      ClassVault.collapsedSections.delete('labs');
  if (_sectionMatchesQuery('drive', q))     ClassVault.collapsedSections.delete('drive');
  if (_sectionMatchesQuery('items', q))     ClassVault.collapsedSections.delete('items');
  if (_sectionMatchesQuery('apostila', q))  ClassVault.collapsedSections.delete('apostila');
  if (_sectionMatchesQuery('tarefas', q))   ClassVault.collapsedSections.delete('tarefas');
  _renderSidebar();
  // Now hide individual .sub items whose title doesn't match.
  const body = document.querySelector('.cv-sm-body');
  if (!body) return;
  body.querySelectorAll('.sub').forEach(el => {
    const titleEl = el.querySelector('.sub-title');
    const title = titleEl ? titleEl.textContent.toLowerCase() : '';
    el.style.display = title.indexOf(q) !== -1 ? '' : 'none';
  });
  // Same for LLM launcher anchors and any section labels.
  body.querySelectorAll('.cv-sm-llm').forEach(el => {
    const name = el.textContent.toLowerCase();
    el.style.display = name.indexOf(q) !== -1 ? '' : 'none';
  });
  // Pinned card (Perguntas launcher) lives outside .cv-sm-body. Match against
  // its visible text so search is consistent across the whole sidebar.
  if (pinned) {
    const text = pinned.textContent.toLowerCase();
    pinned.style.display = text.indexOf(q) !== -1 ? '' : 'none';
  }
}

function _sectionMatchesQuery(key, q) {
  const buckets = _classifyVault(ClassVault.vaultItems);
  if (key === 'favorites') {
    if (!ClassVault.favorites || !ClassVault.favorites.size) return false;
    let any = false;
    ClassVault.favorites.forEach(function(id) {
      const located = _findItem(id);
      if (located && _itemMatchesQuery(located.item, q)) any = true;
    });
    return any;
  }
  if (key === 'llms') {
    const dbHit = buckets.llm.some(it => _itemMatchesQuery(it, q));
    const staticHit = ['chatgpt','claude','gemini','grok','notebooklm','perplexity'].some(n => n.indexOf(q) !== -1);
    return dbHit || staticHit;
  }
  if (key === 'external') return buckets.external.some(it => _itemMatchesQuery(it, q));
  if (key === 'items')    return buckets.items.some(it => _itemMatchesQuery(it, q));
  if (key === 'apostila') return buckets.apostila.some(it => _itemMatchesQuery(it, q));
  if (key === 'tarefas')  return buckets.tarefas.some(it => _itemMatchesQuery(it, q));
  if (key === 'drive')    return ClassVault.driveItems.some(it => _itemMatchesQuery(it, q));
  if (key === 'labs') {
    if (!window.CVLabs || !CVLabs.LABS) return false;
    return CVLabs.LABS.some(lab => _itemMatchesQuery(lab, q));
  }
  return false;
}

function _itemMatchesQuery(item, q) {
  const title = (item && item.title ? String(item.title) : '').toLowerCase();
  return title.indexOf(q) !== -1;
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

// Produce the full Drive section HTML string (header + body). Sync surface
// lives in Conteudo > Drive now; the sidebar is read-only.
function _renderDriveSection() {
  const key = 'drive';
  const isCollapsed = ClassVault.collapsedSections.has(key);
  const count = ClassVault.driveItems.length;

  const headerHtml =
    '<button type="button" class="cv-sm-section cv-sm-section--drive' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
      'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
      '<span class="cv-sm-section-glyph">' + SECTION_GLYPHS.drive + '</span>' +
      '<span class="cv-sm-section-label">Drive</span>' +
      '<span class="cv-sm-section-count">' + count + '</span>' +
      '<span class="cv-sm-section-chev">▾</span>' +
    '</button>';

  let bodyHtml = '';
  if (!isCollapsed) {
    if (count > 0) {
      bodyHtml = _renderDriveGroups(ClassVault.driveItems);
    } else {
      bodyHtml = '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum arquivo cacheado. Sincronize na aba Conteudo &gt; Drive.</div>';
    }
  }

  return '<div class="cv-sm-section--drive-wrapper">' + headerHtml + bodyHtml + '</div>';
}

// Group Drive items by folder name and render subsections. Items come from
// the ct_items cv_sync_drive_items cache and carry meta_json.folder_name;
// legacy synthesized items still in memory expose their group via _group.
function _renderDriveGroups(items) {
  if (!items.length) {
    return '<div class="cv-sm-empty cv-sm-empty--inline">Nenhum arquivo encontrado na pasta Drive.</div>';
  }

  let groupResult;
  if (window.CVDriveCache && typeof window.CVDriveCache.groupByFolder === 'function') {
    groupResult = window.CVDriveCache.groupByFolder(items);
  } else {
    const fallback = [];
    const map = new Map();
    for (const it of items) {
      const m = it.meta_json || {};
      const key = (m.folder_name && String(m.folder_name).trim()) ||
                  (it._group && it._group !== '__raiz__' ? it._group : '(raiz)');
      if (!map.has(key)) { map.set(key, []); fallback.push({ name: key, items: [] }); }
      map.get(key).push(it);
    }
    fallback.forEach(function (g) { g.items = map.get(g.name); });
    groupResult = { groups: fallback };
  }

  return groupResult.groups.map(function(g) {
    const subKey = 'drive-folder:' + g.name;
    _seedCollapsedSubsection(subKey);
    const isCollapsed = ClassVault.collapsedSections.has(subKey);
    const headerLabel = g.name === '(raiz)' ? '📁 (raiz)' : g.name;
    return (
      '<button type="button" class="cv-sm-subsection' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-section="' + _esc(subKey) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-chev">▾</span>' +
        '<span>' + _esc(headerLabel) + '</span>' +
        '<span class="cv-sm-section-line"></span>' +
        '<span class="cv-sm-section-count">' + g.items.length + '</span>' +
      '</button>' +
      (isCollapsed ? '' : g.items.map(function(it) { return _renderSubCard(it, false); }).join(''))
    );
  }).join('');
}

// Vestigial after the sidebar Drive section lost its sync button. The Drive
// header is now a real <button> so native click + keyboard handling apply;
// no extra wiring needed. Kept as a no-op so existing callers do not need
// edits in this commit.
function _wireDriveSyncButton() { /* no-op */ }

// ── LLMs section ───────────────────────────────────────────────
// Hard-coded launchers for the major web LLM tools (open in a new tab) plus
// any DB-stored type='llm' items the teacher authored. Favicons come from
// Google's S2 service so we don't depend on each provider's own favicon.
function _renderLLMsSection(dbItems) {
  const key = 'llms';
  const isCollapsed = ClassVault.collapsedSections.has(key);
  const llms = [
    { name: 'ChatGPT',    url: 'https://chatgpt.com/',          domain: 'chatgpt.com' },
    { name: 'Claude',     url: 'https://claude.ai/',            domain: 'claude.ai' },
    { name: 'Gemini',     url: 'https://gemini.google.com/',    domain: 'gemini.google.com' },
    { name: 'Grok',       url: 'https://grok.com/',             domain: 'grok.com' },
    { name: 'NotebookLM', url: 'https://notebooklm.google.com/', domain: 'notebooklm.google.com' },
    { name: 'Perplexity', url: 'https://www.perplexity.ai/',    domain: 'perplexity.ai' }
  ];
  const dbCount = Array.isArray(dbItems) ? dbItems.length : 0;
  const total = llms.length + dbCount;
  const headerHtml =
    '<button type="button" class="cv-sm-section cv-sm-section--llms' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
      'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
      '<span class="cv-sm-section-glyph">' + SECTION_GLYPHS.llms + '</span>' +
      '<span class="cv-sm-section-label">LLMs</span>' +
      '<span class="cv-sm-section-count">' + total + '</span>' +
      '<span class="cv-sm-section-chev">▾</span>' +
    '</button>';
  let bodyHtml = '';
  if (!isCollapsed) {
    bodyHtml = llms.map(function(l) {
      return '<a class="cv-sm-llm" href="' + _esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
               '<img class="cv-sm-llm-favicon" src="https://www.google.com/s2/favicons?domain=' + _esc(l.domain) + '&sz=64" alt="" loading="lazy" referrerpolicy="no-referrer">' +
               '<span class="cv-sm-llm-name">' + _esc(l.name) + '</span>' +
             '</a>';
    }).join('');
    if (dbCount) {
      bodyHtml += dbItems.map(it => _renderSubCard(it, false)).join('');
    }
  }
  return headerHtml + bodyHtml;
}

// ── Favoritos section ──────────────────────────────────────────
// Renders nothing when there are no favorites (avoids an empty card).
// Uncollapsed by default. Looks up favorited ids against the currently-loaded
// item buckets (vault, drive, lab); items that no longer resolve are skipped.
function _renderFavoritesSection() {
  if (!ClassVault.favorites || ClassVault.favorites.size === 0) return '';
  const items = [];
  ClassVault.favorites.forEach(function(idStr) {
    const located = _findItem(idStr);
    if (located) items.push(located.item);
  });
  if (!items.length) return '';
  const key = 'favorites';
  const isCollapsed = ClassVault.collapsedSections.has(key);
  const headerHtml =
    '<button type="button" class="cv-sm-section cv-sm-section--favorites' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
      'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
      '<span class="cv-sm-section-glyph">' + SECTION_GLYPHS.favorites + '</span>' +
      '<span class="cv-sm-section-label">Favoritos</span>' +
      '<span class="cv-sm-section-count">' + items.length + '</span>' +
      '<span class="cv-sm-section-chev">▾</span>' +
    '</button>';
  const bodyHtml = isCollapsed ? '' : items.map(it => _renderSubCard(it, false)).join('');
  return headerHtml + bodyHtml;
}

// ── PensoNexo pinned card (lives in .cv-sm-pinned, not in .cv-sm-body) ─
// Label and link target depend on whether a ClassPulse session is currently
// live (any question.status='active'). The card itself is the launcher; a
// refresh button on the right re-fetches live state on demand (no polling).
// _wireItemClicks special-cases data-section="nexo" to open data-href instead
// of toggling collapse. The refresh button stops propagation so clicking it
// doesn't open the launcher.
function _renderPinnedNexo() {
  const pinned = document.querySelector('.cv-sm-pinned');
  if (!pinned) return;
  const live = ClassVault.liveSession;
  const loading = ClassVault._liveSessionLoading;
  const tail = live ? live.name : 'Abrir sessões';
  const titleAttr = (live ? 'Perguntas · ' + live.name : 'Perguntas · Abrir sessões');
  const href = live
    ? '/backstage/classpulse/host.html?code=' + encodeURIComponent(live.id)
    : '/backstage/classpulse/';
  // Outer element is a <div role="button"> instead of <button> so the inner
  // refresh <button> is valid HTML (nested buttons are invalid and most
  // browsers reflow the inner one outside the outer, which is what made the
  // refresh icon land below the card).
  pinned.innerHTML =
    '<div role="button" tabindex="0" class="cv-sm-section cv-sm-section--nexo" ' +
      'data-section="nexo" data-href="' + _esc(href) + '" ' +
      'title="' + _esc(titleAttr) + '">' +
      '<span class="cv-sm-section-glyph">' + SECTION_GLYPHS.nexo + '</span>' +
      '<span class="cv-sm-section-label">' +
        // Single brand label "Perguntas" (was "PensoNexo / Nexo" pre-Bundle F);
        // cramp detection no longer needs a fallback since the label is short.
        '<span class="cv-nexo-brand cv-nexo-brand--full">Perguntas</span>' +
        ' · ' + _esc(tail) +
      '</span>' +
      '<button type="button" class="cv-nexo-refresh-btn' + (loading ? ' is-loading' : '') + '" ' +
        'data-nexo-action="refresh" title="Atualizar" aria-label="Atualizar sessão ao vivo">' +
        '<span class="cv-spin-glyph">↻</span>' +
      '</button>' +
      (live ? '<span class="cv-sm-section-live-dot" aria-label="Sessão ao vivo"></span>' : '') +
    '</div>';

  const card = pinned.querySelector('.cv-sm-section--nexo');
  if (card) {
    card.addEventListener('click', function(e) {
      // Defensive: clicks that originated on the refresh button (or its
      // descendants) must not trigger the launcher even if stopPropagation
      // upstream is bypassed for any reason.
      if (e.target && e.target.closest && e.target.closest('[data-nexo-action="refresh"]')) return;
      const url = card.getAttribute('data-href');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    // Keyboard activation for the div[role="button"].
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  }
  const btn = pinned.querySelector('[data-nexo-action="refresh"]');
  if (btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (ClassVault._liveSessionLoading) return;
      _loadLiveSession();
    });
  }
  _detectNexoCramp();
}

// After paint, check whether the label overflows its flex slot. If so, switch
// the brand span from "PensoNexo" to "Nexo" so the session name has room.
function _detectNexoCramp() {
  const labelEl = document.querySelector('.cv-sm-pinned .cv-sm-section-label');
  if (!labelEl) return;
  labelEl.classList.remove('is-cramped');
  // Read after a microtask so layout has settled.
  requestAnimationFrame(function() {
    if (labelEl.scrollWidth > labelEl.clientWidth + 1) {
      labelEl.classList.add('is-cramped');
    }
  });
}

// Bundle E dropped _renderAulaPicker and _renderAulaBody. The aula picker UI
// hadn't been rendered since the 2026-05-22 turma-free pivot; the per-aula
// grouping went away with Hoje.

function _renderSubCard(item) {
  const zoneClass = _zoneClassFor(item.type);
  // BSTypeIcon (utils.js) returns a text-presentation Unicode glyph for known
  // types so the icon inherits the zone color via CSS, instead of clashing as
  // a multi-color emoji from the legacy ct_types.icon DB values. Falls back to
  // the DB icon (or _zoneIconFor) for any type without an override.
  const icon = (window.BSTypeIcon ? BSTypeIcon(item.type, item.type_icon || _zoneIconFor(item.type)) : (item.type_icon || _zoneIconFor(item.type)));
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
    const topSection = e.target.closest('.cv-sm-section');
    if (topSection) {
      const key = topSection.getAttribute('data-section');
      const wasCollapsed = ClassVault.collapsedSections.has(key);
      // Accordion: opening a section collapses every other top-level section.
      // Closing a section just collapses it (no auto-open elsewhere).
      if (wasCollapsed) {
        for (const k of ClassVault.SECTION_KEYS) ClassVault.collapsedSections.add(k);
        ClassVault.collapsedSections.delete(key);
      } else {
        ClassVault.collapsedSections.add(key);
      }
      _renderSidebar();
      return;
    }
    const subSection = e.target.closest('.cv-sm-subsection');
    if (subSection) {
      const key = subSection.getAttribute('data-section');
      if (ClassVault.collapsedSections.has(key)) ClassVault.collapsedSections.delete(key);
      else ClassVault.collapsedSections.add(key);
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
  if (window.CVTextResize) {
    CVTextResize.setButtonsVisible(CVTextResize.isApplicable(item));
  }
  _updateTopbarPin();
}

// Bundle D removed the sidebar "+ Adicionar" footer. Authoring moves to the
// Conteúdo tab in Bundle F. _openCreator stays in this file so Bundle F can
// rewire it without re-implementation; _openEditor is still reached via the
// item context menu's "Editar..." action.

// Right-click on an item opens a contextual menu whose options vary by where
// the item lives (vault / drive / lab).
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
  _closeContextMenu();
  const { item, source } = located;
  const items = [];

  // Favorite toggle — available on every item type, always first option.
  const isFav = ClassVault.favorites.has(String(item.id));
  items.push({
    action: isFav ? 'unfavorite' : 'favorite',
    label: isFav ? '★ Desfavoritar' : '☆ Favoritar'
  });

  // Drive + Lab items: read-only synthetic items. Favorite is the only action.
  if (source !== 'drive' && source !== 'lab') {
    items.push({ action: 'edit', label: '✏️ Editar...' });
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
    if (action === 'favorite' || action === 'unfavorite') _toggleFavorite(item);
    else if (action === 'edit') _openEditor(item);
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

// Bundle E dropped _addToHoje / _removeFromHoje / _releaseItemToCurrentAula
// along with the cv_aula_plan table. Release management moves to the Turmas
// three-column UI in Bundle G; until then the ClassTrail Liberações tab is
// reachable directly via URL.

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
  if (view) {
    view.innerHTML =
      '<div class="cv-empty-welcome">' +
        '<div class="cv-empty-icon" aria-hidden="true">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>' +
            '<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>' +
          '</svg>' +
        '</div>' +
        '<h2 class="cv-empty-title">PensoCodex</h2>' +
        '<p class="cv-empty-hint">Selecione um item na barra lateral para começar.</p>' +
        '<div class="cv-empty-shortcuts">' +
          '<kbd class="cv-empty-kbd">F</kbd><span class="cv-empty-kbd-label">Modo foco</span>' +
          '<span class="cv-empty-sep">·</span>' +
          '<kbd class="cv-empty-kbd">Esc</kbd><span class="cv-empty-kbd-label">Sair do foco</span>' +
        '</div>' +
      '</div>';
  }
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

  // Labs: path-only breadcrumb. No actions (no edit, no add-to-hoje), since
  // labs are shipped read-only artifacts launched directly from the registry.
  if (source === 'lab') {
    crumb.innerHTML =
      '<span>PensoCodex</span>' +
      '<span class="cv-main-crumb-sep">/</span>' +
      '<span>Labs</span>' +
      '<span class="cv-main-crumb-sep">/</span>' +
      '<strong>' + _esc(item.title) + '</strong>';
    return;
  }

  // Phase 5: Drive items get path-only breadcrumb. Drive items whose mime
  // type is text-extractable (Google Docs, .txt, .md) also get a "Copiar
  // texto" button; PDFs aren't supported yet (need pdf.js).
  if (source === 'drive') {
    const dMime = (item.meta_json && item.meta_json.mimeType) || '';
    const canCopy = _driveItemCanCopyText(dMime, item.title);
    let dHtml =
      '<span>PensoCodex</span>' +
      '<span class="cv-main-crumb-sep">/</span>' +
      '<span>Drive</span>' +
      '<span class="cv-main-crumb-sep">/</span>' +
      '<strong>' + _esc(item.title) + '</strong>' +
      '<span class="cv-main-crumb-spacer"></span>';
    if (canCopy) {
      dHtml += '<button type="button" class="cv-crumb-btn" data-action="copy-drive-text" title="Copiar texto do arquivo">📋 Copiar texto</button>';
    }
    // Content actions (↗ Janela, etc.) belong in the bottom bar, same as
    // non-Drive items — not floating over the content.
    if (window.CVTypes) {
      for (const a of CVTypes.actionsFor(item)) {
        dHtml += '<button type="button" class="cv-crumb-btn" data-action="type:' + _esc(a.id) +
          '"' + (a.title ? ' title="' + _esc(a.title) + '"' : '') + '>' + _esc(a.label) + '</button>';
      }
    }
    crumb.innerHTML = dHtml;
    if (canCopy) {
      crumb.querySelector('[data-action="copy-drive-text"]')
        .addEventListener('click', () => _copyDriveFileText(item));
    }
    _wireCrumbActions(crumb, item, source);
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

  // Content-type actions (popup, copy, etc.) from CVTypes registry.
  if (window.CVTypes) {
    const typeActions = CVTypes.actionsFor(item);
    for (const a of typeActions) {
      html += '<button type="button" class="cv-crumb-btn" data-action="type:' + _esc(a.id) +
        '"' + (a.title ? ' title="' + _esc(a.title) + '"' : '') + '>' + _esc(a.label) + '</button>';
    }
  }

  html += '<button type="button" class="cv-crumb-btn" data-action="edit" title="Editar item">✏️ Editar</button>';
  crumb.innerHTML = html;
  _wireCrumbActions(crumb, item, source);
}

function _wireCrumbActions(crumb, item, source) {
  crumb.querySelectorAll('.cv-crumb-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      if (btn.disabled) return;
      const action = btn.getAttribute('data-action');
      if (action === 'edit') _openEditor(item);
      else if (action && action.startsWith('type:') && window.CVTypes) {
        const handler = CVTypes.handlerFor(item, action.slice(5));
        if (handler) handler(item);
      }
    });
  });
}

// ── Renderers (registry keyed by item.type) ────────────────────

ClassVault.renderers = {
  slide:        { render: _renderIframe,      cleanup: _cleanupClear },
  embed:        { render: _renderIframe,      cleanup: _cleanupClear },
  lab:          { render: _renderIframe,      cleanup: _cleanupClear },
  popup_url:    { render: _renderPopupCard,   cleanup: _cleanupClear },
  drive_folder: { render: _renderDriveFolder, cleanup: _cleanupClear },
  drive_file:   { render: _renderDriveFile,   cleanup: _cleanupClear },
  video:        { render: _renderVideo,       cleanup: _cleanupClear },
};

function _getRenderer(type) {
  return ClassVault.renderers[type] || { render: _renderFallback, cleanup: _cleanupClear };
}

function _mountIframe(url, container, emptyMsg, opts) {
  opts = opts || {};
  if (!url) {
    container.innerHTML = '<div class="cv-renderer-empty">' + _esc(emptyMsg || 'URL não definida para este item.') + '</div>';
    return;
  }
  container.innerHTML = '';
  const wrap = document.createElement('div');
  // opts.slide marks a Slides /embed: add cv-slides-clip so the oversize+clip
  // rule (classvault.css) hides the bottom playbar. No corner mask — /embed has
  // no top chrome to cover. Non-slide iframes keep the plain wrap.
  wrap.className = opts.slide ? 'cv-renderer-iframe-wrap cv-slides-clip' : 'cv-renderer-iframe-wrap';
  const iframe = document.createElement('iframe');
  iframe.className = 'cv-renderer-iframe';
  iframe.src = url;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; clipboard-write; fullscreen');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  wrap.appendChild(iframe);
  container.appendChild(wrap);
}

function _renderIframe(item, container) {
  let url = (item.meta_json && item.meta_json.url) || '';
  const isSlide = item.type === 'slide';
  // Presentations (any pasted Google Slides link) render chrome-free through the
  // shared /embed contract + cv-slides-clip. lab/embed keep their host chrome.
  if (isSlide && window.CVDriveViewer && CVDriveViewer.slidesEmbedUrl) {
    url = CVDriveViewer.slidesEmbedUrl(url);
  }
  _mountIframe(url, container, undefined, { slide: isSlide });
}

function _renderDriveFolder(item, container) {
  const meta = item.meta_json || {};
  const id = meta.folder_id || _extractDriveFolderId(meta.url || '');
  const src = id ? 'https://drive.google.com/embeddedfolderview?id=' + encodeURIComponent(id) : '';
  _mountIframe(src, container, 'Pasta Drive sem folder_id (ou URL inválida).');
}

function _renderDriveFile(item, container) {
  // Shared with the ClassTrail Drive sub-tab modal so the embed URL contract
  // stays in one place.
  if (window.CVDriveViewer && typeof window.CVDriveViewer.mountInContainer === 'function') {
    window.CVDriveViewer.mountInContainer(item, container);
    return;
  }
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

function _driveItemCanCopyText(mimeType, fileName) {
  if (mimeType === 'application/vnd.google-apps.document') return true;
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') return true;
  if (fileName && /\.(txt|md)$/i.test(fileName)) return true;
  return false;
}

async function _copyDriveFileText(item) {
  const meta = item.meta_json || {};
  const fileId = meta.file_id;
  const mimeType = meta.mimeType || '';
  if (!fileId) return;
  if (!window.BS_GOOGLE) {
    if (window.BSToast) BSToast.show('Drive indisponível: BS_GOOGLE não carregado.');
    return;
  }
  // Inline-trigger pattern (Bundle Q follow-up): if not connected, prompt
  // consent right here so the user doesn't have to find a separate Connect
  // button. Toast only fires if consent fails or is cancelled.
  if (!BS_GOOGLE.isAuthed()) {
    try {
      await BS_GOOGLE.requestToken({ prompt: 'consent' });
      if (typeof BS_GOOGLE.init === 'function') BS_GOOGLE.init();
    } catch (_) {
      if (window.BSToast) BSToast.show('Conexão Google necessária para copiar texto.');
      return;
    }
    if (!BS_GOOGLE.isAuthed()) {
      if (window.BSToast) BSToast.show('Conexão Google necessária para copiar texto.');
      return;
    }
  }
  try {
    const text = await BS_GOOGLE.drive.getText(fileId, mimeType);
    await navigator.clipboard.writeText(text);
    if (window.BSToast) BSToast.show('Texto copiado.');
  } catch (err) {
    const msg = (err && err.message) || 'erro desconhecido';
    if (window.BSToast) BSToast.show('Erro ao copiar texto: ' + msg);
  }
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
  const isDrive = String(item.id || '').startsWith('drive:');

  // Drive Slides: render full-bleed inline through the chrome-free /embed
  // contract (shared helper) + cv-slides-clip for the bottom playbar. No mask —
  // /embed has no top chrome. "↗ Janela" lives in the bottom bar via CVTypes.
  // Falls back to the launcher card below when not a Drive item.
  if (isDrive && url) {
    const embedUrl = (window.CVDriveViewer && CVDriveViewer.slidesEmbedUrl)
      ? CVDriveViewer.slidesEmbedUrl(url) : url;
    container.innerHTML =
      '<div class="cv-slides-inline">' +
        '<iframe class="cv-renderer-iframe" src="' + _esc(embedUrl) + '" ' +
          'allow="autoplay; encrypted-media; clipboard-write; fullscreen" ' +
          'referrerpolicy="no-referrer"></iframe>' +
      '</div>';
    return;
  }

  // Launch lives in the bottom action bar (↗ Janela via CVTypes popup_url),
  // not as an in-content button floating over the viewport. The card just
  // describes the item and points at the bar.
  container.innerHTML =
    '<div class="cv-popup-launcher">' +
      '<h2 class="cv-popup-launcher-title">' + _esc(item.title) + '</h2>' +
      (item.summary ? '<p class="cv-popup-launcher-desc">' + _esc(item.summary) + '</p>' : '') +
      '<p class="cv-popup-launcher-hint">Use ↗ Janela na barra inferior para abrir.</p>' +
      (url ? '<p class="cv-popup-launcher-url">' + _esc(url) + '</p>' : '') +
    '</div>';
}

function _renderFallback(item, container) {
  container.innerHTML = '';

  // Outer card: flex column, no overflow. Single scroll area; the per-renderer
  // "Copiar" button moved to the bottom action bar via CVTypes registry.
  const card = document.createElement('div');
  card.className = 'cv-renderer-fallback';

  const scroll = document.createElement('div');
  scroll.className = 'cv-renderer-scroll';
  card.appendChild(scroll);

  const body = document.createElement('div');
  body.className = 'cv-renderer-body';
  scroll.appendChild(body);

  container.appendChild(card);

  if (window.CTRenderer && CTRenderer.render) {
    CTRenderer.render(item, body);
    _hideCtrCopyBtn(body);
  } else {
    body.innerHTML = '<div class="cv-renderer-empty">Tipo "' + _esc(item.type) + '" sem renderer.</div>';
  }
}

// CTRenderer may mount its own copy button (prompt-style). Hide it
// unconditionally — the bottom action bar exposes Copiar via the registry.
function _hideCtrCopyBtn(bodyMount) {
  const apply = () => {
    const btn = bodyMount.querySelector('.ctr-copy-btn');
    if (!btn) return false;
    btn.style.display = 'none';
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
