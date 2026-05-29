// content/presets.js
// Codex Content tab, Presets sub-tab: named bundles of library items reused when
// planning a lesson. Full-native port of the legacy CVPresetsUI (list + editor)
// AND CVItemPicker: cdx- styling, facade-only backend, every string via t(). The
// embedded multi-select picker is the same primitive Lessons (Phase 3) will reuse.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.BSToast   (../backstage/js/bs-toast.js)   optional transient toast
//   window.CVLabs    (legacy ClassVault labs, OPTIONAL) merged into the picker
//     so a preset can include lab demos. Absent on Codex until the Labs sub-tab
//     migration loads it; the picker simply omits the Labs group until then.
import { presets as api, content as contentApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml, glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _presets = [];
let _items = [];          // full ct_list_items result (NOT the filtered library)
let _types = [];          // ct_types, for resolving each item's glyph
let _cleanup = [];

// ── Pure rule (exported for tests) ──────────────────────────────────────────
// The picker places each item in the FIRST matching group. Apostila is a set
// membership check (set_id), so it must precede any type check. Returns the
// non-empty groups in display order as [{ key, items }]; labels are resolved
// at render time via t() in the presets.group_* namespace (keys stay i18n-free here).
const GROUPS = [
  { key: 'apostila', match: (it) => it && it.set_id != null },
  { key: 'tarefa',   match: (it) => it && it.type === 'tarefa' },
  { key: 'llm',      match: (it) => it && it.type === 'llm' },
  { key: 'external', match: (it) => it && it.type === 'popup_url' },
  { key: 'lab',      match: (it) => it && (it.type === 'lab' || (typeof it.id === 'string' && it.id.indexOf('lab:') === 0)) },
  { key: 'drive',    match: (it) => it && it.type === 'drive_file' },
  { key: 'outros',   match: () => true },
];

export function groupPickerItems(items) {
  const buckets = {};
  for (const g of GROUPS) buckets[g.key] = [];
  for (const it of (items || [])) {
    for (const g of GROUPS) {
      if (g.match(it)) { buckets[g.key].push(it); break; }
    }
  }
  return GROUPS.map((g) => ({ key: g.key, items: buckets[g.key] }))
    .filter((grp) => grp.items.length > 0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _toast(msg) {
  if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
}
function _err(e) { return t('content.error') + ': ' + ((e && e.message) || e); }
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// A synthetic 'lab' item keeps a fixed glyph (no real ct_types slug); every
// other item resolves its type's stored glyph from the loaded ct_types.
function _itemIconHtml(item) {
  if (item && item.type === 'lab') return glyphSvg('flask', { size: 16 });
  const ty = _types.find((x) => x.slug === (item && item.type));
  return typeIconHtml(ty && ty.icon, { size: 16 });
}

// Merge the full ct_items list with synthetic Labs items (when CVLabs is loaded)
// so a preset can include lab demos, mirroring the legacy preset editor.
function _pickerItems() {
  const labItems = (window.CVLabs && typeof window.CVLabs.getAllItems === 'function')
    ? window.CVLabs.getAllItems() : [];
  return _items.concat(labItems);
}

// ── Modal helpers (mirror the Items sub-tab) ─────────────────────────────────
function _openModal(html, opts) {
  opts = opts || {};
  const bd = document.createElement('div');
  bd.className = 'cdx-modal-backdrop';
  bd.innerHTML = html;
  if (!opts.disableBackdropClose) {
    bd.addEventListener('click', (e) => { if (e.target === bd) _closeModal(bd); });
  }
  const escHandler = (e) => {
    if (e.key !== 'Escape') return;
    const all = document.querySelectorAll('.cdx-modal-backdrop');
    if (all.length && all[all.length - 1] !== bd) return;
    _closeModal(bd);
    document.removeEventListener('keydown', escHandler);
  };
  document.addEventListener('keydown', escHandler);
  _cleanup.push(() => document.removeEventListener('keydown', escHandler));
  document.body.appendChild(bd);
  return bd;
}
function _closeModal(bd) {
  const target = bd || document.querySelector('.cdx-modal-backdrop');
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function _openConfirm(opts) {
  const cls = opts.danger ? ' cdx-btn-danger' : ' cdx-btn-primary';
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + _esc(opts.message) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn' + cls + '" data-act="ok">' + _esc(opts.confirmLabel || t('content.confirm_delete_btn')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => { _closeModal(bd); opts.onConfirm(); });
}

// ── Item picker (ported CVItemPicker) ────────────────────────────────────────
// Grouped multi-select over library items. Returns { getSelected, destroy }.
// The unconditional preventDefault on row click cancels BOTH the <label>'s
// forward-to-checkbox default and the checkbox's own toggle, which otherwise
// fire two click events per interaction and net to no change (the legacy bug).
function _mountPicker(host, pickerItems, selectedIds) {
  const selected = new Set();
  for (const v of (selectedIds || [])) { if (v != null) selected.add(String(v)); }
  let query = '';

  host.innerHTML =
    '<div class="cdx-picker">' +
      '<div class="cdx-picker-toolbar">' +
        '<input type="search" class="cdx-picker-search" placeholder="' + _esc(t('presets.picker_search')) + '" autocomplete="off" spellcheck="false">' +
        '<span class="cdx-picker-count" data-count></span>' +
      '</div>' +
      '<div class="cdx-picker-list" data-list></div>' +
    '</div>';

  const listEl = host.querySelector('[data-list]');
  const countEl = host.querySelector('[data-count]');
  const searchEl = host.querySelector('.cdx-picker-search');

  function _selectedIds() { return Array.from(selected); }

  function _renderRow(item) {
    const idStr = String(item.id);
    const isSel = selected.has(idStr);
    return '<label class="cdx-picker-row' + (isSel ? ' is-selected' : '') + '" data-id="' + _esc(idStr) + '">' +
      '<input type="checkbox" class="cdx-picker-check"' + (isSel ? ' checked' : '') + '>' +
      '<span class="cdx-picker-icon">' + _itemIconHtml(item) + '</span>' +
      '<span class="cdx-picker-title">' + _esc((item && item.title) || t('presets.unnamed')) + '</span>' +
    '</label>';
  }

  function _renderList() {
    const q = query.trim().toLowerCase();
    const filtered = pickerItems.filter((it) => {
      if (!q) return true;
      return String((it && it.title) || '').toLowerCase().indexOf(q) !== -1;
    });
    const groups = groupPickerItems(filtered);
    if (!groups.length) {
      listEl.innerHTML = '<div class="cdx-picker-empty">' + t('presets.picker_empty') + '</div>';
      return;
    }
    listEl.innerHTML = groups.map((grp) =>
      '<div class="cdx-picker-group" data-group="' + grp.key + '">' +
        '<div class="cdx-picker-group-label">' + t('presets.group_' + grp.key) + ' (' + grp.items.length + ')</div>' +
        '<div class="cdx-picker-group-rows">' + grp.items.map(_renderRow).join('') + '</div>' +
      '</div>').join('');
  }

  function _renderCount() {
    countEl.textContent = selected.size + ' ' + t('content.selected_suffix');
  }

  function _onListClick(e) {
    const row = e.target.closest('.cdx-picker-row');
    if (!row) return;
    e.preventDefault();
    const id = row.getAttribute('data-id');
    if (!id) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    row.classList.toggle('is-selected', selected.has(id));
    const check = row.querySelector('.cdx-picker-check');
    if (check) check.checked = selected.has(id);
    _renderCount();
  }
  function _onSearch(e) { query = (e.target && e.target.value) || ''; _renderList(); }

  listEl.addEventListener('click', _onListClick);
  searchEl.addEventListener('input', _onSearch);
  _renderList();
  _renderCount();

  return {
    getSelected: _selectedIds,
    destroy() {
      listEl.removeEventListener('click', _onListClick);
      searchEl.removeEventListener('input', _onSearch);
      host.innerHTML = '';
    },
  };
}

// ── Editor (ported mountPresetEditor) ────────────────────────────────────────
function _openEditor(preset) {
  const isNew = !preset || !preset.id;
  const initialName = (preset && preset.name) || '';
  const initialItemIds = (preset && preset.item_ids) || [];

  const html =
    '<div class="cdx-modal cdx-modal--wide">' +
      '<div class="cdx-modal-title">' + (isNew ? t('presets.new_title') : t('presets.edit_title')) + '</div>' +
      '<form class="cdx-preset-editor" novalidate>' +
        '<div class="cdx-field">' +
          '<label for="cdx-preset-name">' + t('presets.name_label') + '</label>' +
          '<input id="cdx-preset-name" type="text" maxlength="120" required value="' + _esc(initialName) + '" placeholder="' + _esc(t('presets.name_placeholder')) + '">' +
          '<div class="cdx-field-error" data-error role="alert" aria-live="polite"></div>' +
        '</div>' +
        '<div class="cdx-field cdx-field--picker">' +
          '<label>' + t('presets.items_label') + '</label>' +
          '<div class="cdx-preset-picker-mount" data-picker></div>' +
        '</div>' +
        '<div class="cdx-modal-actions">' +
          '<button type="button" class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
          '<button type="submit" class="cdx-btn cdx-btn-primary">' + (isNew ? t('presets.create_btn') : t('content.save')) + '</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  const bd = _openModal(html, { disableBackdropClose: true });
  const formEl = bd.querySelector('.cdx-preset-editor');
  const nameEl = bd.querySelector('#cdx-preset-name');
  const errorEl = bd.querySelector('[data-error]');
  const picker = _mountPicker(bd.querySelector('[data-picker]'), _pickerItems(), initialItemIds);

  const clearError = () => { errorEl.textContent = ''; nameEl.classList.remove('is-invalid'); };
  nameEl.addEventListener('input', clearError);
  setTimeout(() => nameEl.focus(), 60);

  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => { picker.destroy(); _closeModal(bd); });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();
    const name = (nameEl.value || '').trim();
    if (!name) {
      errorEl.textContent = t('presets.name_required');
      nameEl.classList.add('is-invalid');
      nameEl.focus();
      return;
    }
    const item_ids = picker.getSelected();
    const saver = (preset && preset.id)
      ? api.update({ id: preset.id, name, item_ids })
      : api.create({ name, item_ids });
    saver.then(() => {
      picker.destroy();
      _closeModal(bd);
      _toast((preset && preset.id) ? t('presets.updated') : t('presets.created'));
      _reload();
    }).catch((err) => notice.internal(_err(err)));
  });
}

// ── List ──────────────────────────────────────────────────────────────────────
function _renderList() {
  const el = _q('cdx-preset-list');
  if (!el) return;
  if (!_presets.length) {
    el.innerHTML = '<div class="cdx-empty">' + t('presets.empty') + '</div>';
    return;
  }
  el.innerHTML = _presets.map((p) => {
    const count = (p && p.item_ids && p.item_ids.length) || 0;
    return '<div class="cdx-preset-row" data-id="' + _esc(p.id) + '">' +
      '<span class="cdx-preset-name">' + _esc((p && p.name) || t('presets.unnamed')) + '</span>' +
      '<span class="cdx-preset-count">' + count + ' ' + t('presets.item_count_suffix') + '</span>' +
      '<div class="cdx-preset-row-actions">' +
        '<button class="cdx-btn cdx-btn-sm" data-act="edit">' + t('content.edit') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delete">' + t('content.delete') + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function _onListClick(e) {
  const row = e.target.closest('.cdx-preset-row');
  if (!row) return;
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(row.getAttribute('data-id'));
  const preset = _presets.find((p) => Number(p.id) === id);
  if (!preset) return;
  if (btn.dataset.act === 'edit') _openEditor(preset);
  else if (btn.dataset.act === 'delete') _confirmDelete(preset);
}

function _confirmDelete(preset) {
  _openConfirm({
    title: t('presets.delete_title'),
    message: t('presets.confirm_delete').replace('{name}', (preset && preset.name) || ''),
    danger: true,
    onConfirm() {
      api.remove({ id: preset.id }).then(() => {
        _toast(t('presets.deleted'));
        _reload();
      }).catch((err) => notice.internal(_err(err)));
    },
  });
}

// ── Load ──────────────────────────────────────────────────────────────────────
function _reload() {
  return api.list().then((d) => {
    _presets = (d && d.presets) || [];
    _renderList();
  }).catch((err) => {
    const el = _q('cdx-preset-list');
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('presets.error_loading') + '</div>';
    notice.internal(err);
  });
}

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-presets">' +
      '<div class="cdx-presets-toolbar">' +
        '<h2 class="cdx-presets-title">' + t('presets.title') + '</h2>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-preset-new">' + t('presets.new') + '</button>' +
      '</div>' +
      '<div class="cdx-preset-list" id="cdx-preset-list">' +
        '<div class="cdx-empty">' + t('content.loading') + '</div>' +
      '</div>' +
    '</div>';
  _q('cdx-preset-new').addEventListener('click', () => _openEditor(null));
  _q('cdx-preset-list').addEventListener('click', _onListClick);
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _presets = [];
  _items = [];
  _types = [];
  _cleanup = [];
  _renderShell();
  // Presets list paints first; types + items load in parallel for the editor's
  // picker (icons need ct_types, rows need the full item list).
  Promise.all([
    contentApi.listTypes().then((d) => { _types = (d && d.types) || []; }).catch(() => {}),
    contentApi.listItems().then((d) => { _items = (d && d.items) || []; }).catch(() => {}),
  ]);
  _reload();
}

export function unmount() {
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}
