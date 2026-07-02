// content/items.js
// Codex Content tab, Items sub-tab: the item library grid.
//
// The list / filter / tags / select / bulk / delete / duplicate surface is
// rebuilt clean (cdx-, facade-only, delegated events, i18n). The item EDITOR is
// the shared Backstage authoring form, kept as a window global for now and
// mounted behind one call; it gets its own Codex migration later (Lessons uses
// it too).
//
// The item renderer + type-filter are now Codex modules (js/item-render.js,
// js/type-filter.js), imported below.
// Type icons now come from the Codex glyph library (js/glyphs.js), not BSTypeIcon.
// The item editor and content-first creator are now Codex-native modules
// (item-form.js / item-creator.js), no longer the legacy window globals.
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as itemForm from './item-form.js';
import * as itemCreator from './item-creator.js';
import { renderItem } from '../js/item-render.js';
import { renderTypeFilter, applyTypeFilter } from '../js/type-filter.js';
import { iconHtml as typeIconHtml, glyphSvg, glyphKeys, GLYPH_PREFIX } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _items = [];
let _types = [];
let _tags = [];
let _selectedTypeFilter = null;
let _itemSearch = '';            // free-text filter over title + summary
let _itemSort = 'recent';        // recent (updated_at desc) | alpha (A-Z) | type
let _selectMode = false;
let _selectedIds = new Set();
let _selectedId = null;          // master-detail: id of the item shown in the preview
let _detailCache = new Map();    // id -> full item (with body_md) from getItem
let _previewReq = 0;             // monotonic token: only the latest fetch renders
let _cleanup = [];

// ── Pure rule (exported for tests) ──────────────────────────────────────────
// Types that are NOT standalone library items: imported course-content sections,
// tasks, and synced Drive files. The library grid hides them AND the new-item
// flows must not offer them; otherwise the AI creator can classify into one (e.g.
// `conteudo`) and the item gets saved but then filtered out of the grid, which
// reads as "create did nothing". One source of truth so the two can't drift.
const NON_LIBRARY_TYPES = ['tarefa', 'conteudo', 'drive_file'];

// The library grid hides set members and the non-library types above.
export function filterLibraryItems(items) {
  return (items || []).filter((it) =>
    !it.set_id && NON_LIBRARY_TYPES.indexOf(it.type) < 0);
}

// Master-detail selection (exported for tests). The preview always shows a
// valid item: keep the current selection if it survives the visible list, else
// fall back to the first item, else nothing.
export function resolveSelection(list, currentId) {
  if (!list || !list.length) return null;
  if (currentId != null && list.some((it) => Number(it.id) === Number(currentId))) {
    return Number(currentId);
  }
  return Number(list[0].id);
}

// After removing removedId, pick the neighbour that takes selection: the item
// that shifts into the freed slot, clamped to the new last item; null if empty.
export function selectionAfterRemoval(list, removedId) {
  const arr = list || [];
  const idx = arr.findIndex((it) => Number(it.id) === Number(removedId));
  const remaining = arr.filter((it) => Number(it.id) !== Number(removedId));
  if (!remaining.length) return null;
  if (idx < 0) return Number(remaining[0].id);
  return Number(remaining[Math.min(idx, remaining.length - 1)].id);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
import { esc as _esc } from '../js/dom.js';

function _slugify(s) {
  return (s || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Two shared notification surfaces, called directly (no per-page wrapper):
//   toast.ok / toast.err   transient status (bottom): success + validation
//   notice.warn            persistent actionable guidance (top), e.g. type_in_use
//   notice.internal        admin/technical error → debug pill; visible as a notice
//                          only when the pill is ON (users see only what they act on)
import { errMsg as _err } from '../js/content-err.js';

function _typeMeta(slug) {
  const ty = _types.find((x) => x.slug === slug);
  const label = ty ? ty.label : (slug || 'item');
  // iconHtml resolves "glyph:<key>" to an SVG, or a legacy emoji to its char.
  return { label, iconHtml: typeIconHtml(ty && ty.icon, { size: 18 }) };
}

function _fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts * 1000).toLocaleDateString('pt-BR'); } catch (_) { return ''; }
}

function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// ── Modal helpers (mirror the Cohorts tab) ──────────────────────────────────
import { openModal, closeModal } from '../js/modal.js';

// Generic confirm modal (no window.confirm). opts: { title, message, confirmLabel, danger, onConfirm }
function _openConfirm(opts) {
  const cls = opts.danger ? ' cdx-btn-danger-solid' : ' cdx-btn-primary';
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + _esc(opts.message) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn' + cls + '" data-act="ok">' + _esc(opts.confirmLabel || t('content.confirm_delete_btn')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => { closeModal(bd); opts.onConfirm(); });
}

// Single-field prompt modal (no window.prompt). opts: { title, label, value, onSubmit }
function _openPrompt(opts) {
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<div class="cdx-field"><label>' + _esc(opts.label || '') + '</label>' +
        '<input type="text" data-fld="value" value="' + _esc(opts.value || '') + '">' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + t('content.save') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  const input = bd.querySelector('[data-fld="value"]');
  const submit = () => { closeModal(bd); opts.onSubmit(input.value.trim()); };
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

// ── Shell ────────────────────────────────────────────────────────────────────
// Sort glyph: decreasing horizontal lines + an up/down arrow. The button cycles
// the sort mode on click (recent -> A-Z -> type) and shows the active mode beside it.
const _SORT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h10M5 12h7M5 17h4"/><path d="M19 7v10M16.5 9.5 19 7l2.5 2.5M16.5 14.5 19 17l2.5-2.5"/></svg>';

function _sortLabel(s) {
  return s === 'alpha' ? t('content.sort_alpha') : s === 'type' ? t('content.sort_type') : t('content.sort_recent');
}
function _paintSortBtn() {
  const lbl = _q('cdx-items-sortlabel');
  if (lbl) lbl.textContent = _sortLabel(_itemSort);
  const btn = _q('cdx-items-sort');
  if (btn) btn.title = t('content.sort_label') + ' ' + _sortLabel(_itemSort);
}

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-items">' +
      '<div class="cdx-items-toolbar">' +
        '<h2 class="cdx-items-toolbar-title">' + t('content.items_title') + '</h2>' +
        '<div class="cdx-items-toolbar-actions">' +
          '<button class="cdx-btn cdx-btn-primary" id="cdx-btn-new-item">' + t('content.new_item') + '</button>' +
          '<button class="cdx-btn" id="cdx-btn-manage-tags">' + t('content.manage_tags') + '</button>' +
          '<button class="cdx-btn" id="cdx-btn-manage-types">' + t('content.manage_types') + '</button>' +
          '<button class="cdx-btn" id="cdx-btn-select">' + t('content.select') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-bulk-bar" id="cdx-items-bulk" style="display:none">' +
        '<span id="cdx-bulk-count"></span>' +
        '<button class="cdx-btn cdx-btn-danger cdx-btn-sm" id="cdx-btn-bulk-delete">' + t('content.bulk_delete') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" id="cdx-btn-bulk-cancel">' + t('content.bulk_cancel') + '</button>' +
      '</div>' +
      // Type-filter chips (Todos / Prompt para IA / …) as a full-width wrapping row ABOVE the
      // split, so they line up across the top instead of being cramped in the left panel (Élder).
      '<div id="cdx-items-filter"></div>' +
      '<div class="cdx-items-split" id="cdx-items-split">' +
        '<div class="cdx-items-listcol">' +
          // Search + sort at the TOP of the left panel (like the Turmas search),
          // kept out of the re-rendered grid so typing never loses focus. Sort is
          // a small toggle button that cycles recent -> A-Z -> type on click.
          '<div class="cdx-items-listhead">' +
            '<input type="search" id="cdx-items-search" class="cdx-input cdx-items-search" placeholder="' + _esc(t('content.search_ph')) + '" autocomplete="off" spellcheck="false">' +
            '<button type="button" id="cdx-items-sort" class="cdx-btn cdx-items-sortbtn" title="' + _esc(t('content.sort_label')) + '" aria-label="' + _esc(t('content.sort_label')) + '">' +
              _SORT_ICON + '<span class="cdx-items-sortlabel" id="cdx-items-sortlabel"></span>' +
            '</button>' +
          '</div>' +
          '<div class="cdx-items-list" id="cdx-items-grid">' +
            '<div class="cdx-empty">' + t('content.loading') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-item-preview" id="cdx-item-preview">' +
          '<div class="cdx-preview-empty">' + t('content.preview_empty') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  _q('cdx-btn-new-item').addEventListener('click', _newItem);
  _q('cdx-btn-manage-tags').addEventListener('click', _openTagManager);
  _q('cdx-btn-manage-types').addEventListener('click', _openTypeManager);
  _q('cdx-btn-select').addEventListener('click', _toggleSelectMode);
  _q('cdx-btn-bulk-delete').addEventListener('click', _bulkDelete);
  _q('cdx-btn-bulk-cancel').addEventListener('click', _exitSelectMode);
  const searchEl = _q('cdx-items-search');
  if (searchEl) searchEl.addEventListener('input', () => { _itemSearch = searchEl.value; _renderItems(); });
  const sortBtn = _q('cdx-items-sort');
  if (sortBtn) {
    _paintSortBtn();
    sortBtn.addEventListener('click', () => {
      const order = ['recent', 'alpha', 'type'];
      _itemSort = order[(order.indexOf(_itemSort) + 1) % order.length];
      _paintSortBtn();
      _renderItems();
    });
  }
  // Delegated listeners survive innerHTML re-renders of the list / preview.
  _q('cdx-items-grid').addEventListener('click', _onListClick);
  _q('cdx-item-preview').addEventListener('click', _onPreviewClick);
}

// ── Load ──────────────────────────────────────────────────────────────────────
function _load() {
  return Promise.all([
    api.listTypes().then((d) => { _types = (d && d.types) || []; }).catch((e) => { notice.internal(e); }),
    api.listTags().then((d) => { _tags = (d && d.tags) || []; }).catch((e) => { notice.internal(e); }),
  ]).then(_loadItems);
}

function _loadItems(opts) {
  opts = opts || {};
  const grid = _q('cdx-items-grid');
  if (grid && (!opts.silent || !_items.length)) {
    grid.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
  }
  return api.listItems().then((d) => {
    _items = (d && d.items) || [];
    _renderItems();
  }).catch((e) => {
    notice.internal(e);
    const g = _q('cdx-items-grid');
    if (g) g.innerHTML = '<div class="cdx-empty">' + t('content.error_loading') + '</div>';
  });
}

function _loadTags() {
  return api.listTags().then((d) => { _tags = (d && d.tags) || []; }).catch((e) => { notice.internal(e); });
}
function _loadTypes() {
  return api.listTypes().then((d) => { _types = (d && d.types) || []; }).catch((e) => { notice.internal(e); });
}

// ── Render grid ─────────────────────────────────────────────────────────────
// Pure, exported for tests: free-text search (title + summary) then the chosen
// sort. `typeLabelOf(type)` resolves a type's display label (used by 'type').
// Pure (slices before sorting) so the grid and selection-after-removal agree.
export function applyItemSearchSort(items, search, sort, typeLabelOf) {
  let arr = items || [];
  const q = (search || '').trim().toLowerCase();
  if (q) arr = arr.filter((it) =>
    String(it.title || '').toLowerCase().includes(q) ||
    String(it.summary || '').toLowerCase().includes(q));
  const label = (type) => String(typeLabelOf ? typeLabelOf(type) : (type || ''));
  const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  if (sort === 'alpha') arr = arr.slice().sort(byTitle);
  else if (sort === 'type') arr = arr.slice().sort((a, b) =>
    label(a.type).localeCompare(label(b.type), undefined, { sensitivity: 'base' }) || byTitle(a, b));
  else arr = arr.slice().sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0)); // recent
  return arr;
}

function _applySearchSort(items) {
  return applyItemSearchSort(items, _itemSearch, _itemSort, (type) => _typeMeta(type).label);
}

function _visibleItems() {
  const library = filterLibraryItems(_items);
  return _applySearchSort(applyTypeFilter(library, _selectedTypeFilter));
}

function _renderItems() {
  const library = filterLibraryItems(_items);
  _renderFilter(library);
  const grid = _q('cdx-items-grid');
  const split = _q('cdx-items-split');
  if (split) split.classList.toggle('is-bulk', _selectMode);
  if (!grid) return;
  if (!library.length) {
    _selectedId = null;
    grid.innerHTML = '<div class="cdx-empty">' + t('content.empty_library') + '</div>';
    _renderPreview(null);
    return;
  }
  const filtered = _applySearchSort(applyTypeFilter(library, _selectedTypeFilter));
  if (!filtered.length) {
    _selectedId = null;
    grid.innerHTML = '<div class="cdx-empty">' + t((_itemSearch || '').trim() ? 'content.empty_search' : 'content.empty_filter') + '</div>';
    _renderPreview(null);
    return;
  }
  _selectedId = resolveSelection(filtered, _selectedId);
  grid.innerHTML = filtered.map(_renderRow).join('');
  if (_selectMode) _renderPreview(null);
  else _showPreview(_selectedId);
}

function _renderRow(item) {
  const meta = _typeMeta(item.type);
  const selected = _selectedIds.has(Number(item.id));
  const active = !_selectMode && Number(item.id) === Number(_selectedId);
  const setBadge = item.set_id
    ? '<span class="cdx-set-badge" title="' + t('content.set_badge_title') + '">' + t('content.set_badge') + '</span>'
    : '';
  const checkHtml = _selectMode
    ? '<span class="cdx-item-check' + (selected ? ' is-checked' : '') + '" aria-hidden="true"></span>'
    : '';
  return (
    '<div class="cdx-item-row' + (selected ? ' is-selected' : '') + (active ? ' is-active' : '') +
        '" data-item-id="' + _esc(item.id) + '">' +
      checkHtml +
      '<span class="cdx-item-type-icon">' + meta.iconHtml + '</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + _esc(item.title) + setBadge + '</div>' +
        '<div class="cdx-item-sub">' + _esc(meta.label) + ' · ' + _esc(_fmtDate(item.updated_at)) + '</div>' +
      '</div>' +
    '</div>'
  );
}

// ── Preview pane (master-detail) ─────────────────────────────────────────────
// Set the active selection, highlight its row, and render the preview. The full
// item (with body_md) comes from getItem and is cached; the light list item is
// shown immediately as a header while the body loads.
function _showPreview(id) {
  _selectedId = id == null ? null : Number(id);
  if (_viewEl) {
    _viewEl.querySelectorAll('.cdx-item-row').forEach((r) => {
      r.classList.toggle('is-active', Number(r.dataset.itemId) === Number(_selectedId));
    });
  }
  if (_selectedId == null) { _renderPreview(null); return; }
  const cached = _detailCache.get(_selectedId);
  if (cached) { _renderPreview(cached); return; }
  const light = _items.find((it) => Number(it.id) === Number(_selectedId));
  _renderPreview(light, { loading: true });
  const reqId = ++_previewReq;
  const wantId = _selectedId;
  api.getItem({ id: wantId }).then((d) => {
    if (reqId !== _previewReq) return;           // a newer selection superseded this fetch
    const full = (d && d.item) || light;
    if (full && full.id != null) _detailCache.set(Number(full.id), full);
    if (full && Number(full.id) === Number(_selectedId)) _renderPreview(full);
  }).catch((e) => { if (reqId === _previewReq) notice.internal(_err(e)); });
}

function _renderPreview(item, opts) {
  opts = opts || {};
  const pane = _q('cdx-item-preview');
  if (!pane) return;
  if (!item) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('content.preview_empty') + '</div>';
    return;
  }
  const meta = _typeMeta(item.type);
  const tagsHtml = (item.tags && item.tags.length)
    ? '<div class="cdx-item-tags">' + item.tags.map((tg) =>
        '<span class="cdx-tag-chip">' + _esc(tg.label) + '</span>').join('') + '</div>'
    : '';
  const setBadge = item.set_id
    ? '<span class="cdx-set-badge" title="' + t('content.set_badge_title') + '">' + t('content.set_badge') + '</span>'
    : '';
  pane.innerHTML =
    '<div class="cdx-preview-head">' +
      '<span class="cdx-item-type-icon">' + meta.iconHtml + '</span>' +
      '<div class="cdx-preview-head-info">' +
        '<div class="cdx-preview-title">' + _esc(item.title) + setBadge + '</div>' +
        '<span class="cdx-preview-type">' + _esc(meta.label) + ' · ' + _esc(_fmtDate(item.updated_at)) + '</span>' +
      '</div>' +
      '<div class="cdx-preview-actions">' +
        '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-pv-action="edit">' + t('content.edit') + '</button>' +
        '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-pv-action="duplicate" title="' + t('content.duplicate_title') + '">' + t('content.duplicate') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-pv-action="delete">' + t('content.delete') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-preview-body">' +
      tagsHtml +
      '<div class="cdx-preview-render" id="cdx-preview-render"></div>' +
    '</div>';
  const host = pane.querySelector('#cdx-preview-render');
  if (opts.loading) {
    host.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
    return;
  }
  try { renderItem(item, host, {}); }
  catch (_) { host.textContent = item.body_md || ''; }
}

function _renderFilter(library) {
  const fc = _q('cdx-items-filter');
  if (!fc) return;
  if (!library.length) { fc.innerHTML = ''; return; }
  fc.innerHTML = '<div class="cdx-filter-row"><div id="cdx-type-filter-host"></div></div>';
  renderTypeFilter({
    container: fc.querySelector('#cdx-type-filter-host'),
    types: _types,
    items: library,
    selectedSlug: _selectedTypeFilter,
    onChange: (slug) => { _selectedTypeFilter = slug; _renderItems(); },
  });
}

// ── List + preview interaction (delegated) ──────────────────────────────────
// List click: in select mode toggle the checkbox; otherwise select the item for
// the preview pane (the editor opens from the preview's Editar button, not here).
function _onListClick(e) {
  const row = e.target.closest('.cdx-item-row');
  if (!row) return;
  const id = Number(row.dataset.itemId);
  if (_selectMode) { _toggleSelection(id); return; }
  _showPreview(id);
}

// Preview actions operate on the currently selected item.
function _onPreviewClick(e) {
  const btn = e.target.closest('[data-pv-action]');
  if (!btn || _selectedId == null) return;
  const a = btn.dataset.pvAction;
  if (a === 'edit') _openItem(_selectedId);
  else if (a === 'duplicate') _duplicateItem(_selectedId);
  else if (a === 'delete') _deleteItem(_selectedId);
}

// ── Select mode + bulk ──────────────────────────────────────────────────────
function _toggleSelectMode() { _selectMode ? _exitSelectMode() : _enterSelectMode(); }

function _enterSelectMode() {
  _selectMode = true;
  _selectedIds.clear();
  _renderItems();
  _updateBulkBar();
}
function _exitSelectMode() {
  _selectMode = false;
  _selectedIds.clear();
  _renderItems();
  _updateBulkBar();
}

function _toggleSelection(id) {
  if (_selectedIds.has(id)) _selectedIds.delete(id);
  else _selectedIds.add(id);
  const row = _viewEl.querySelector('.cdx-item-row[data-item-id="' + id + '"]');
  if (row) {
    const on = _selectedIds.has(id);
    row.classList.toggle('is-selected', on);
    const chk = row.querySelector('.cdx-item-check');
    if (chk) chk.classList.toggle('is-checked', on);
  }
  _updateBulkBar();
}

function _updateBulkBar() {
  const bar = _q('cdx-items-bulk');
  const btn = _q('cdx-btn-select');
  if (!bar || !btn) return;
  bar.style.display = _selectMode ? 'flex' : 'none';
  btn.textContent = _selectMode ? t('content.exit_select') : t('content.select');
  if (_selectMode) {
    const count = _selectedIds.size;
    const countEl = _q('cdx-bulk-count');
    if (countEl) countEl.textContent = count + ' ' + t('content.selected_suffix');
    const delBtn = _q('cdx-btn-bulk-delete');
    if (delBtn) delBtn.disabled = count === 0;
  }
}

function _bulkDelete() {
  const ids = Array.from(_selectedIds);
  if (!ids.length) { toast.err(t('content.no_selection')); return; }
  _openConfirm({
    title: t('content.delete_items_title'),
    message: t('content.confirm_bulk_delete'),
    danger: true,
    onConfirm() {
      ids.forEach((id) => {
        const idx = _items.findIndex((it) => Number(it.id) === Number(id));
        if (idx >= 0) _items.splice(idx, 1);
        _detailCache.delete(Number(id));
      });
      if (ids.some((id) => Number(id) === Number(_selectedId))) _selectedId = null;
      _selectedIds.clear();
      _selectMode = false;
      _renderItems();
      _updateBulkBar();
      api.bulkDeleteItems({ ids, _silent: true }).then(() => {
        toast.ok(ids.length + ' ' + t('content.items_deleted_suffix'));
      }).catch((e) => { notice.internal(_err(e)); _loadItems(); });
    },
  });
}

// ── Item CRUD ───────────────────────────────────────────────────────────────
function _deleteItem(id) {
  _openConfirm({
    title: t('content.delete_item_title'),
    message: t('content.confirm_delete_item'),
    danger: true,
    onConfirm() {
      // Move selection to a neighbour in the currently visible list first.
      const nextId = selectionAfterRemoval(_visibleItems(), id);
      const idx = _items.findIndex((it) => Number(it.id) === Number(id));
      if (idx >= 0) _items.splice(idx, 1);
      _detailCache.delete(Number(id));
      if (Number(_selectedId) === Number(id)) _selectedId = nextId;
      _renderItems();
      api.deleteItem({ id, _silent: true }).then(() => {
        toast.ok(t('content.item_deleted'));
      }).catch((e) => {
        // The item still exists server-side; resync truth rather than guess the slot.
        notice.internal(_err(e));
        _selectedId = Number(id);
        _loadItems();
      });
    },
  });
}

function _duplicateItem(id) {
  api.duplicateItem({ id, _silent: true }).then((d) => {
    if (d && d.item) {
      _items.push(d.item);
      if (d.item.id != null) {
        _detailCache.set(Number(d.item.id), d.item);
        _selectedId = Number(d.item.id);   // jump the preview to the new copy
      }
      _renderItems();
      toast.ok(t('content.item_duplicated'));
    }
  }).catch((e) => notice.internal(_err(e)));
}

function _openItem(id) {
  api.getItem({ id }).then((d) => {
    _openItemEditorFull((d && d.item) || null, null, null);
  }).catch((e) => notice.internal(_err(e)));
}

// New item: content-first creator (step 1) → full editor (step 2).
function _newItem() {
  const bd = openModal('<div class="cdx-modal-body"></div>', { disableBackdropClose: true });
  itemCreator.mount(bd.querySelector('.cdx-modal-body'), {
    types: _types.filter((ty) => NON_LIBRARY_TYPES.indexOf(ty.slug) < 0),
    tags: _tags,
    titleLabel: t('content.new_item_step1'),
    closeLabel: t('content.close'),
    onClose: () => closeModal(bd),
    onCancel: () => closeModal(bd),
    onManual: (out) => { closeModal(bd); _openItemEditorFull(null, { body_md: out.body_md }, null); },
    onAIComplete: async (result) => {
      closeModal(bd);
      const tagIds = await _tagsByLabels(result.tagLabels || []);
      const prefill = Object.assign({}, result.prefill, { tag_ids: tagIds });
      _openItemEditorFull(null, prefill, result.aiContext);
    },
  });
}

function _openItemEditorFull(item, prefill, aiContext) {
  const isEdit = !!item;
  const bd = openModal('<div class="cdx-modal-body"></div>', { disableBackdropClose: true });
  itemForm.mount(bd.querySelector('.cdx-modal-body'), {
    item,
    prefill,
    aiContext,
    types: _types,
    tags: _tags,
    titleLabel: isEdit ? t('content.edit_item') : t('content.new_item_step2'),
    saveLabel: isEdit ? t('content.save') : t('content.create'),
    closeLabel: t('content.close'),
    excludeTypes: isEdit ? [] : NON_LIBRARY_TYPES,
    onCreateType: _openTypeCreateForm,
    onSave: () => {
      closeModal(bd);
      toast.ok(isEdit ? t('content.item_updated') : t('content.item_created'));
      _detailCache.clear();   // edited content is stale; preview re-fetches
      _loadItems({ silent: true });
      _loadTags();
    },
    onCancel: () => closeModal(bd),
  });
}

// Resolve tag labels to ids, creating any missing ones.
async function _tagsByLabels(labels) {
  const ids = [];
  for (const raw of labels) {
    const label = (raw || '').trim();
    if (!label) continue;
    const existing = _tags.find((tg) => tg.label.toLowerCase() === label.toLowerCase());
    if (existing) { ids.push(existing.id); continue; }
    try {
      const res = await api.createTag({ label });
      if (res && res.tag) {
        if (!_tags.find((tg) => tg.id === res.tag.id)) {
          _tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
        }
        ids.push(res.tag.id);
      }
    } catch (_) { /* skip */ }
  }
  return ids;
}

// ── Inline "new type" form (invoked by the item editor) ─────────────────────
function _openTypeCreateForm(callback) {
  let chosenIcon = GLYPH_PREFIX + 'file-text';
  const html =
    '<div class="cdx-modal" style="max-width:380px">' +
      '<div class="cdx-modal-title">' + t('content.new_type_title') + '</div>' +
      '<div class="cdx-field"><label>' + t('content.type_name') + '</label>' +
        '<input type="text" data-fld="label" placeholder="' + t('content.type_name_placeholder') + '"></div>' +
      '<div class="cdx-field"><label>' + t('content.type_slug') + '</label>' +
        '<input type="text" data-fld="slug" placeholder="' + t('content.type_slug_placeholder') + '"></div>' +
      '<div class="cdx-field"><label>' + t('content.type_icon') + '</label>' +
        '<button type="button" class="cdx-btn cdx-glyph-choose" data-fld="icon-btn">' +
          '<span class="cdx-glyph-choose-icon">' + typeIconHtml(chosenIcon, { size: 20 }) + '</span>' +
          '<span>' + t('content.choose_glyph') + '</span>' +
        '</button></div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + t('content.create') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  const done = (slug) => { closeModal(bd); if (callback) callback(slug); };
  const iconBtn = bd.querySelector('[data-fld="icon-btn"]');
  iconBtn.addEventListener('click', () => {
    _openGlyphPicker(chosenIcon, (val) => {
      chosenIcon = val;
      iconBtn.querySelector('.cdx-glyph-choose-icon').innerHTML = typeIconHtml(chosenIcon, { size: 20 });
    });
  });
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => done(null));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => {
    const label = bd.querySelector('[data-fld="label"]').value.trim();
    const slug = bd.querySelector('[data-fld="slug"]').value.trim() || _slugify(label);
    if (!label || !slug) { toast.err(t('content.name_required')); return; }
    api.createType({ slug, label, icon: chosenIcon }).then(() => _loadTypes()).then(() => {
      toast.ok(t('content.type_created'));
      done(slug);
    }).catch((e) => notice.internal(_err(e)));
  });
}

// Reusable glyph picker: a grid of the shared glyph library. onPick gets the
// chosen "glyph:<key>" string.
function _openGlyphPicker(currentIcon, onPick) {
  const cur = (typeof currentIcon === 'string' && currentIcon.indexOf(GLYPH_PREFIX) === 0)
    ? currentIcon.slice(GLYPH_PREFIX.length) : null;
  const grid = glyphKeys().map((k) =>
    '<button type="button" class="cdx-glyph-option' + (k === cur ? ' is-active' : '') +
      '" data-glyph="' + _esc(k) + '" title="' + _esc(k) + '">' + glyphSvg(k, { size: 22 }) + '</button>'
  ).join('');
  const html =
    '<div class="cdx-modal" style="max-width:440px">' +
      '<div class="cdx-modal-title">' + t('content.pick_glyph') + '</div>' +
      '<div class="cdx-glyph-grid">' + grid + '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('.cdx-glyph-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-glyph]');
    if (!btn) return;
    closeModal(bd);
    onPick(GLYPH_PREFIX + btn.dataset.glyph);
  });
}

// ── Types manager modal (glyph / rename / delete; create via the inline form) ──
function _openTypeManager() {
  const html =
    '<div class="cdx-modal" style="max-width:560px">' +
      '<div class="cdx-modal-title">' + t('content.types_title') + '</div>' +
      '<div class="cdx-type-manager-actions">' +
        '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-act="new">' + t('content.new_type_btn') + '</button>' +
      '</div>' +
      '<div class="cdx-type-manager-list" data-list></div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="close">' + t('content.close') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  const listEl = bd.querySelector('[data-list]');

  function render() {
    if (!_types.length) {
      listEl.innerHTML = '<div class="cdx-empty">' + t('content.no_types') + '</div>';
      return;
    }
    listEl.innerHTML = _types.map((ty) =>
      '<div class="cdx-type-row" data-slug="' + _esc(ty.slug) + '">' +
        '<button type="button" class="cdx-type-glyph-btn" data-action="glyph" title="' + t('content.change_glyph') + '">' +
          typeIconHtml(ty.icon, { size: 20 }) + '</button>' +
        '<span class="cdx-type-row-label">' + _esc(ty.label) + '</span>' +
        '<span class="cdx-type-row-slug">' + _esc(ty.slug) + '</span>' +
        '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-action="rename">' + t('content.rename') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="delete">' + t('content.delete') + '</button>' +
      '</div>').join('');
  }

  bd.querySelector('[data-act="new"]').addEventListener('click', () => {
    _openTypeCreateForm((slug) => { if (slug) render(); });
  });
  bd.querySelector('[data-act="close"]').addEventListener('click', () => closeModal(bd));

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.cdx-type-row');
    if (!row) return;
    const slug = row.dataset.slug;
    const ty = _types.find((x) => x.slug === slug);
    if (!ty) return;
    const action = e.target.closest('[data-action]') && e.target.closest('[data-action]').dataset.action;
    if (action === 'glyph') {
      _openGlyphPicker(ty.icon, (iconVal) => {
        api.updateType({ slug, icon: iconVal }).then(() => _loadTypes()).then(() => {
          render(); _renderItems(); toast.ok(t('content.type_updated'));
        }).catch((er) => notice.internal(_err(er)));
      });
    } else if (action === 'rename') {
      _openPrompt({
        title: t('content.type_rename_title'), label: t('content.type_name'), value: ty.label,
        onSubmit(n) {
          if (!n || n === ty.label) return;
          api.updateType({ slug, label: n }).then(() => _loadTypes()).then(() => {
            render(); _renderItems(); toast.ok(t('content.type_updated'));
          }).catch((er) => notice.internal(_err(er)));
        },
      });
    } else if (action === 'delete') {
      _openConfirm({
        title: t('content.delete_type_title'), message: t('content.confirm_delete_type'), danger: true,
        onConfirm() {
          // Not _silent: let api-client log the failure to the pill. type_in_use
          // is user-actionable, so it surfaces as a persistent warn notice.
          api.deleteType({ slug }).then(() => _loadTypes()).then(() => {
            render(); _renderItems(); toast.ok(t('content.type_deleted'));
          }).catch((er) => {
            if (er && er.data && er.data.error === 'type_in_use') {
              notice.warn(t('content.type_in_use').replace('{n}', er.data.count));
            } else {
              notice.internal(er);
            }
          });
        },
      });
    }
  });

  render();
}

// ── Tags manager modal ──────────────────────────────────────────────────────
function _openTagManager() {
  const html =
    '<div class="cdx-modal" style="max-width:520px">' +
      '<div class="cdx-modal-title">' + t('content.tags_title') + '</div>' +
      '<div class="cdx-tag-manager-create">' +
        '<input type="text" data-fld="new" placeholder="' + t('content.tag_new_placeholder') + '">' +
        '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-act="add">' + t('content.add') + '</button>' +
      '</div>' +
      '<div class="cdx-tag-manager-list" data-list></div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="close">' + t('content.close') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  const newInput = bd.querySelector('[data-fld="new"]');
  const listEl = bd.querySelector('[data-list]');

  const addTag = () => {
    const label = newInput.value.trim();
    if (!label) return;
    api.createTag({ label }).then(() => _loadTags()).then(() => {
      newInput.value = '';
      render();
      toast.ok(t('content.tag_added'));
    }).catch((e) => notice.internal(_err(e)));
  };

  function render() {
    if (!_tags.length) {
      listEl.innerHTML = '<div class="cdx-empty">' + t('content.no_tags') + '</div>';
      return;
    }
    listEl.innerHTML = _tags.map((tg) =>
      '<div class="cdx-tag-row" data-id="' + _esc(tg.id) + '">' +
        '<span class="cdx-tag-row-label">' + _esc(tg.label) + '</span>' +
        '<span class="cdx-tag-row-count">' + (tg.item_count || 0) + '</span>' +
        '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-action="rename">' + t('content.rename') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="delete">' + t('content.delete') + '</button>' +
      '</div>').join('');
  }

  // Delegated handlers inside the manager modal.
  bd.querySelector('[data-act="add"]').addEventListener('click', addTag);
  bd.querySelector('[data-act="close"]').addEventListener('click', () => closeModal(bd));
  newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.cdx-tag-row');
    if (!row) return;
    const id = parseInt(row.dataset.id, 10);
    const tag = _tags.find((tg) => tg.id === id);
    if (!tag) return;
    const action = e.target.closest('[data-action]') && e.target.closest('[data-action]').dataset.action;
    if (action === 'rename') {
      _openPrompt({
        title: t('content.tag_rename_title'), label: t('content.tag_name'), value: tag.label,
        onSubmit(n) {
          if (!n || n === tag.label) return;
          api.renameTag({ id, label: n }).then(() => _loadTags()).then(() => {
            render(); toast.ok(t('content.tag_renamed')); _loadItems({ silent: true });
          }).catch((er) => notice.internal(_err(er)));
        },
      });
    } else if (action === 'delete') {
      _openConfirm({
        title: t('content.delete_tag_title'), message: t('content.confirm_delete_tag'), danger: true,
        onConfirm() {
          api.deleteTag({ id }).then(() => _loadTags()).then(() => {
            render(); toast.ok(t('content.tag_deleted')); _loadItems({ silent: true });
          }).catch((er) => notice.internal(_err(er)));
        },
      });
    }
  });

  render();
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _items = [];
  _types = [];
  _tags = [];
  _selectedTypeFilter = null;
  _selectMode = false;
  _selectedIds = new Set();
  _selectedId = null;
  _detailCache = new Map();
  _previewReq = 0;
  _cleanup = [];
  _renderShell();
  _load();
}

export function unmount() {
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  _selectedId = null;
  _detailCache = new Map();
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}
