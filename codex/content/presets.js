// content/presets.js
// Codex Content tab, Presets sub-tab: named bundles of library items reused when
// planning a lesson. Full-native port of the legacy CVPresetsUI (list + editor)
// AND CVItemPicker: cdx- styling, facade-only backend, every string via t().
//
// Master-detail layout, same shell as the Items sub-tab: a left list of presets
// and a right pane that holds the inline editor for the selected (or new) preset,
// a name field plus the grouped multi-select item-picker. Reuses the Items split
// classes (cdx-items-split / cdx-items-list / cdx-item-row / cdx-item-preview),
// so there is one master-detail layout, not a per-tab copy. The editor is inline
// in the right pane (no modal); only the delete confirmation stays a small modal.
// The embedded picker is the same primitive Lessons (Phase 3) will reuse.
//
// The lab registry is the Codex-owned js/labs-registry.js module: its labs are
// merged into the picker so a preset can include lab demos.
import { presets as api, content as contentApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml, glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import { getAllItems as labItems } from '../js/labs-registry.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _presets = [];
let _items = [];          // full ct_list_items result (NOT the filtered library)
let _types = [];          // ct_types, for resolving each item's glyph
let _selectedId = null;   // selected preset id (null when none / creating)
let _creating = false;    // true when the right pane shows a blank new-preset editor
let _editName = '';       // working preset name (edited via the header button, not inline)
let _picker = null;       // the mounted item-picker instance (destroy on re-render)
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
function _err(e) { return t('content.error') + ': ' + ((e && e.message) || e); }
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// A synthetic 'lab' item keeps a fixed glyph (no real ct_types slug); every
// other item resolves its type's stored glyph from the loaded ct_types.
function _itemIconHtml(item) {
  if (item && item.type === 'lab') return glyphSvg('flask', { size: 16 });
  const ty = _types.find((x) => x.slug === (item && item.type));
  return typeIconHtml(ty && ty.icon, { size: 16 });
}

// Merge the full ct_items list with synthetic Labs items so a preset can include
// lab demos, mirroring the legacy preset editor.
function _pickerItems() {
  return _items.concat(labItems());
}

// ── Modal helpers (delete confirmation only; the editor is inline) ───────────
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
  let openGroup;            // single-open accordion: a group key, null (none open), or undefined (pre-init)

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
    // Single-open accordion: at most one group expanded at a time. First render
    // opens the first group; a live search overrides it and expands every group
    // with matches, so a search never hides a hit inside a collapsed group.
    const searching = q.length > 0;
    if (openGroup === undefined) openGroup = groups[0].key;
    listEl.innerHTML = groups.map((grp) => {
      const isOpen = searching || grp.key === openGroup;
      const rows = isOpen
        ? '<div class="cdx-picker-group-rows">' + grp.items.map(_renderRow).join('') + '</div>'
        : '';
      return '<div class="cdx-picker-group' + (isOpen ? ' is-open' : '') + '" data-group="' + grp.key + '">' +
          '<button type="button" class="cdx-picker-group-label" data-group-toggle="' + grp.key + '"' +
            ' aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
            '<span class="cdx-picker-group-caret" aria-hidden="true">&#8250;</span>' +
            '<span class="cdx-picker-group-name">' + t('presets.group_' + grp.key) + ' (' + grp.items.length + ')</span>' +
          '</button>' +
          rows +
        '</div>';
    }).join('');
  }

  function _renderCount() {
    countEl.textContent = selected.size + ' ' + t('content.selected_suffix');
  }

  function _onListClick(e) {
    const toggle = e.target.closest('[data-group-toggle]');
    if (toggle) {
      e.preventDefault();
      if (query.trim()) return; // groups are all expanded during a search
      const key = toggle.getAttribute('data-group-toggle');
      openGroup = (openGroup === key) ? null : key; // toggle; collapse if re-clicked
      _renderList();
      return;
    }
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

function _destroyPicker() {
  if (_picker && _picker.destroy) { try { _picker.destroy(); } catch (_) { /* ignore */ } }
  _picker = null;
}

// ── Left list ────────────────────────────────────────────────────────────────
function _renderList() {
  const el = _q('cdx-preset-list');
  if (!el) return;
  if (!_presets.length) {
    el.innerHTML = '<div class="cdx-empty">' + t('presets.empty') + '</div>';
    return;
  }
  el.innerHTML = _presets.map((p) => {
    const count = (p && p.item_ids && p.item_ids.length) || 0;
    const active = !_creating && Number(p.id) === Number(_selectedId);
    return '<div class="cdx-item-row' + (active ? ' is-active' : '') + '" data-id="' + _esc(p.id) + '">' +
      '<span class="cdx-item-type-icon cdx-preset-icon">' + glyphSvg('layers', { size: 18 }) + '</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + _esc((p && p.name) || t('presets.unnamed')) + '</div>' +
        '<div class="cdx-item-sub">' + count + ' ' + t('presets.item_count_suffix') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Right pane: empty prompt | the picker editor ─────────────────────────────
// The preset name + item count already show on the selected left card, so the
// pane drops a header entirely: the item-picker fills the whole body, and the
// footer holds Edit name + Delete on the left with Cancel/Save on the right.
function _editorPaneHtml(preset) {
  const isNew = !preset || !preset.id;
  const delBtn = isNew ? ''
    : '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delete">' + t('content.delete') + '</button>';
  return '<div class="cdx-preview-body">' +
      '<div class="cdx-preset-picker-mount" data-picker></div>' +
    '</div>' +
    '<div class="cdx-preset-editor-actions">' +
      '<div class="cdx-preset-actions-left">' +
        '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-act="rename">' + t('presets.edit_name') + '</button>' +
        delBtn +
      '</div>' +
      '<div class="cdx-preset-actions-right">' +
        '<button type="button" class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-primary" data-act="save">' + (isNew ? t('presets.create_btn') : t('content.save')) + '</button>' +
      '</div>' +
    '</div>';
}

function _renderPreview() {
  _destroyPicker();
  const pane = _q('cdx-preset-preview');
  if (!pane) return;
  const preset = _creating ? null : _presets.find((p) => Number(p.id) === Number(_selectedId));
  if (!_creating && !preset) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('presets.select') + '</div>';
    return;
  }
  if (preset) _editName = (preset.name || '');
  pane.innerHTML = _editorPaneHtml(preset);
  const initialItemIds = (preset && preset.item_ids) || [];
  _picker = _mountPicker(pane.querySelector('[data-picker]'), _pickerItems(), initialItemIds);
}

// Rename modal: edits the working name. For an existing preset the rename is
// persisted immediately (so the left card updates); for a new preset it is just
// staged for the create on Save.
function _openRename() {
  const editing = !_creating && _selectedId != null;
  const html =
    '<div class="cdx-modal" style="max-width:440px">' +
      '<div class="cdx-modal-title">' + t('presets.name_label') + '</div>' +
      '<div class="cdx-field">' +
        '<input id="cdx-preset-rename" type="text" maxlength="120" value="' + _esc(_editName) + '" placeholder="' + _esc(t('presets.name_placeholder')) + '">' +
        '<div class="cdx-field-error" data-error role="alert" aria-live="polite"></div>' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + t('content.save') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html, { disableBackdropClose: true });
  const input = bd.querySelector('#cdx-preset-rename');
  const errEl = bd.querySelector('[data-error]');
  setTimeout(() => input.focus(), 60);
  const submit = () => {
    const name = (input.value || '').trim();
    if (!name) { errEl.textContent = t('presets.name_required'); input.classList.add('is-invalid'); return; }
    _editName = name;
    _closeModal(bd);
    if (editing) {
      api.update({ id: _selectedId, name }).then(() => {
        notice.ok(t('presets.updated'));
        return _reload();
      }).then(() => _renderList()).catch((err) => notice.internal(_err(err)));
    }
  };
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

// ── Selection + actions ────────────────────────────────────────────────────────
function _onNew() {
  _creating = true;
  _selectedId = null;
  _editName = '';
  _renderList();
  _renderPreview();
}

function _onListClick(e) {
  const row = e.target.closest('.cdx-item-row');
  if (!row) return;
  _creating = false;
  _selectedId = Number(row.getAttribute('data-id'));
  _renderList();
  _renderPreview();
}

function _onPreviewClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.getAttribute('data-act');
  if (act === 'rename') {
    _openRename();
  } else if (act === 'save') {
    _save();
  } else if (act === 'delete') {
    const preset = _presets.find((p) => Number(p.id) === Number(_selectedId));
    if (preset) _confirmDelete(preset);
  } else if (act === 'cancel') {
    _creating = false;
    _renderList();
    _renderPreview();
  }
}

function _save() {
  const name = (_editName || '').trim();
  if (!name) { _openRename(); return; } // a preset needs a name; prompt for one
  const item_ids = _picker ? _picker.getSelected() : [];
  const editing = !_creating && _selectedId != null;
  const saver = editing
    ? api.update({ id: _selectedId, name, item_ids })
    : api.create({ name, item_ids });
  saver.then((res) => {
    notice.ok(editing ? t('presets.updated') : t('presets.created'));
    const createdId = (res && res.preset && res.preset.id != null) ? res.preset.id
      : ((res && res.id != null) ? res.id : null);
    _creating = false;
    return _reload().then(() => {
      if (editing) {
        // _selectedId stays put.
      } else if (createdId != null) {
        _selectedId = Number(createdId);
      } else {
        // Fallback when create does not echo an id: newest preset with this name.
        const matches = _presets.filter((p) => ((p && p.name) || '') === name);
        if (matches.length) _selectedId = Number(matches.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a)).id);
      }
      _renderList();
      _renderPreview();
    });
  }).catch((err) => notice.internal(_err(err)));
}

function _confirmDelete(preset) {
  _openConfirm({
    title: t('presets.delete_title'),
    message: t('presets.confirm_delete').replace('{name}', (preset && preset.name) || ''),
    danger: true,
    onConfirm() {
      api.remove({ id: preset.id }).then(() => {
        notice.ok(t('presets.deleted'));
        if (Number(_selectedId) === Number(preset.id)) { _selectedId = null; _creating = false; }
        return _reload().then(() => _renderPreview());
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
      '<div class="cdx-items-split cdx-presets-split" id="cdx-presets-split">' +
        '<div class="cdx-items-list" id="cdx-preset-list">' +
          '<div class="cdx-empty">' + t('content.loading') + '</div>' +
        '</div>' +
        '<div class="cdx-item-preview" id="cdx-preset-preview">' +
          '<div class="cdx-preview-empty">' + t('presets.select') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  _q('cdx-preset-new').addEventListener('click', _onNew);
  _q('cdx-preset-list').addEventListener('click', _onListClick);
  _q('cdx-preset-preview').addEventListener('click', _onPreviewClick);
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _presets = [];
  _items = [];
  _types = [];
  _selectedId = null;
  _creating = false;
  _editName = '';
  _picker = null;
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
  _destroyPicker();
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _selectedId = null;
  _creating = false;
  _editName = '';
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}
