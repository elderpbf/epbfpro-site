// content/apostila.js
// Codex Content tab, Apostila sub-tab: the imported course-content set. Native
// port of the legacy ClassTrail apostila surface (ct-admin.js): cdx- styling,
// facade-only backend, every string via t(). Content arrives by importing a
// Google Doc split into sections (one ct_item per section); this tab lists the
// newest non-empty set, lets you import a new one, edit/delete a section (reusing
// the native item editor), or delete the whole set.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.BSToast   (../backstage/js/bs-toast.js)   optional transient toast
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as itemForm from './item-form.js';
import * as notice from '../js/notice.js';
import { renderItem } from '../js/item-render.js';

// ── Pure rule (exported for tests) ──────────────────────────────────────────
// Of all sets, the tab shows the newest one that has items (matches the student
// view's apostila_set selection). Returns the chosen set row or null.
export function pickCurrentSet(sets) {
  const withItems = (sets || []).filter((s) => (s.item_count || 0) > 0);
  return withItems.length ? withItems[withItems.length - 1] : null;
}

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _set = null;
let _items = [];
let _types = [];
let _tags = [];
let _selectedId = null;        // selected section id (master-detail)
let _detailCache = new Map();  // id -> full item (with body_md) from getItem
let _cleanup = [];

// ── Helpers ─────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _toast(msg) { if (window.BSToast && window.BSToast.show) window.BSToast.show(msg); }
function _err(e) { return t('content.error') + ': ' + ((e && e.message) || e); }
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

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
  const first = bd.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 60);
  return bd;
}
function _closeModal(bd) {
  const target = bd || document.querySelector('.cdx-modal-backdrop');
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function _openConfirm(opts) {
  const cls = opts.danger ? ' cdx-btn-danger' : ' cdx-btn-primary';
  const html =
    '<div class="cdx-modal" style="max-width:440px">' +
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

// ── Load ──────────────────────────────────────────────────────────────────────
function _load() {
  const el = _q('cdx-apostila-list');
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
  return api.listSets().then((data) => {
    const current = pickCurrentSet((data && data.sets) || []);
    if (!current) { _set = null; _items = []; _render(); return; }
    return api.getSet({ id: current.id }).then((res) => {
      _set = (res && res.set) || null;
      _items = ((res && res.items) || []).slice().sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
      _render();
    });
  }).catch(() => {
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('apostila.error_loading') + '</div>';
  });
}

// ── Render ──────────────────────────────────────────────────────────────────
// Left list of sections. Selecting a row shows the section in the right pane.
function _render() {
  const labelEl = _q('cdx-apostila-label');
  const delBtn = _q('cdx-apostila-delete-set');
  const el = _q('cdx-apostila-list');
  if (!el) return;

  if (!_set) {
    if (labelEl) labelEl.textContent = t('apostila.title_default');
    if (delBtn) delBtn.style.display = 'none';
    el.innerHTML = '<div class="cdx-empty">' + t('apostila.empty') + '</div>';
    _renderPreview();
    return;
  }
  if (labelEl) labelEl.textContent = _set.category_label || t('apostila.title_default');
  if (delBtn) delBtn.style.display = '';

  if (!_items.length) {
    el.innerHTML = '<div class="cdx-empty">' + t('apostila.empty_sections') + '</div>';
    _renderPreview();
    return;
  }
  // ct_get_set omits body_md (payload size), so the sub-line shows the summary.
  el.innerHTML = _items.map((item) => {
    const sub = item.summary && item.summary.trim() ? item.summary : t('apostila.no_summary');
    const active = Number(item.id) === Number(_selectedId);
    return '<div class="cdx-item-row' + (active ? ' is-active' : '') + '" data-id="' + _esc(item.id) + '">' +
      '<span class="cdx-apostila-pos">' + _esc(item.set_position || '') + '</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + _esc(item.title) + '</div>' +
        '<div class="cdx-item-sub">' + _esc(sub) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  _renderPreview();
}

function _onListClick(e) {
  const row = e.target.closest('.cdx-item-row');
  if (!row) return;
  _select(Number(row.dataset.id));
}

function _select(id) {
  _selectedId = id;
  if (_viewEl) _viewEl.querySelectorAll('.cdx-item-row').forEach((r) => {
    r.classList.toggle('is-active', Number(r.dataset.id) === Number(id));
  });
  _renderPreview();
}

// ── Right pane: read-preview of the selected section (rendered like Items) ────
function _previewHtml(item, opts) {
  opts = opts || {};
  return '<div class="cdx-preview-head">' +
      '<div class="cdx-preview-head-info">' +
        '<div class="cdx-preview-title">' + _esc(item.title) + '</div>' +
      '</div>' +
      '<div class="cdx-preview-actions">' +
        '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-act="edit">' + t('content.edit') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delete">' + t('content.delete') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-preview-body"><div class="cdx-preview-render" id="cdx-apostila-render">' +
      (opts.loading ? '<div class="cdx-empty">' + t('content.loading') + '</div>' : '') +
    '</div></div>';
}

// Render the section body with the Codex item renderer (same module Items uses).
function _renderBody(item) {
  const host = _q('cdx-apostila-render');
  if (!host) return;
  try { renderItem(item, host, {}); }
  catch (_) { host.textContent = item.body_md || ''; }
}

function _renderPreview() {
  const pane = _q('cdx-apostila-preview');
  if (!pane) return;
  if (_selectedId == null) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('apostila.select') + '</div>';
    return;
  }
  const itemId = _selectedId;
  const cached = _detailCache.get(Number(itemId));
  if (cached) {
    pane.innerHTML = _previewHtml(cached, {});
    _renderBody(cached);
    return;
  }
  const light = _items.find((i) => Number(i.id) === Number(itemId)) || { title: '' };
  pane.innerHTML = _previewHtml(light, { loading: true });
  api.getItem({ id: itemId }).then((d) => {
    if (Number(_selectedId) !== Number(itemId)) return;
    const full = (d && d.item) || light;
    if (full && full.id != null) _detailCache.set(Number(full.id), full);
    pane.innerHTML = _previewHtml(full, {});
    _renderBody(full);
  }).catch(() => {
    if (Number(_selectedId) !== Number(itemId)) return;
    const host = _q('cdx-apostila-render');
    if (host) host.innerHTML = '<div class="cdx-empty">' + t('apostila.error_loading') + '</div>';
  });
}

function _onPreviewClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || _selectedId == null) return;
  if (btn.dataset.act === 'edit') _editSection(_selectedId);
  else if (btn.dataset.act === 'delete') _deleteSection(_selectedId);
}

// ── Section edit (reuses the native item editor) ─────────────────────────────
function _editSection(id) {
  api.getItem({ id }).then((d) => {
    const item = (d && d.item) || null;
    if (!item) return;
    const bd = _openModal('<div class="cdx-modal-body"></div>', { disableBackdropClose: true });
    itemForm.mount(bd.querySelector('.cdx-modal-body'), {
      item,
      types: _types,
      tags: _tags,
      titleLabel: t('content.edit_item'),
      saveLabel: t('content.save'),
      closeLabel: t('content.close'),
      // No onCreateType: editing imported course sections does not invent types.
      onSave: () => { _closeModal(bd); _toast(t('content.item_updated')); _detailCache.delete(Number(id)); _load(); },
      onCancel: () => _closeModal(bd),
    });
  }).catch((e) => notice.internal(_err(e)));
}

function _deleteSection(id) {
  _openConfirm({
    title: t('apostila.delete_section_title'),
    message: t('apostila.confirm_delete_section'),
    danger: true,
    onConfirm() {
      if (Number(_selectedId) === Number(id)) _selectedId = null;
      _detailCache.delete(Number(id));
      const idx = _items.findIndex((it) => Number(it.id) === Number(id));
      const snapshot = idx >= 0 ? _items[idx] : null;
      if (idx >= 0) { _items.splice(idx, 1); _render(); }
      api.deleteItem({ id, _silent: true }).then(() => {
        _toast(t('apostila.section_deleted'));
      }).catch((err) => {
        if (snapshot && idx >= 0) { _items.splice(idx, 0, snapshot); _render(); }
        notice.internal(_err(err));
      });
    },
  });
}

// ── Set delete ────────────────────────────────────────────────────────────────
function _deleteSet() {
  if (!_set) return;
  _openConfirm({
    title: t('apostila.delete_set_title'),
    message: t('apostila.confirm_delete_set'),
    danger: true,
    onConfirm() {
      api.deleteSet({ id: _set.id }).then(() => {
        _set = null;
        _items = [];
        _selectedId = null;
        _detailCache.clear();
        _render();
        _toast(t('apostila.set_deleted'));
      }).catch((err) => notice.internal(_err(err)));
    },
  });
}

// ── Google Doc import ─────────────────────────────────────────────────────────
function _openImport() {
  const html =
    '<div class="cdx-modal" style="max-width:520px">' +
      '<div class="cdx-modal-title">' + t('apostila.import_title') + '</div>' +
      '<p class="cdx-helper-text" style="margin:0 0 0.75rem">' + t('apostila.import_help') + '</p>' +
      '<div class="cdx-field"><label>' + t('apostila.import_url_label') + '</label>' +
        '<input type="text" data-fld="url" placeholder="https://docs.google.com/document/d/...">' +
        '<p class="cdx-helper-text">' + t('creator.gdoc_hint') + '</p>' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('apostila.import_marker_label') + '</label>' +
        '<select data-fld="marker">' +
          '<option value="h2" selected>' + t('apostila.marker_h2') + '</option>' +
          '<option value="h1">' + t('apostila.marker_h1') + '</option>' +
          '<option value="hr">' + t('apostila.marker_hr') + '</option>' +
        '</select>' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="import">' + t('apostila.import_confirm') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html, { disableBackdropClose: true });
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('[data-act="import"]').addEventListener('click', function () {
    const url = bd.querySelector('[data-fld="url"]').value.trim();
    if (!url) { _toast(t('creator.gdoc_url_required')); return; }
    const marker = bd.querySelector('[data-fld="marker"]').value;
    const btn = this;
    btn.disabled = true;
    btn.textContent = t('apostila.importing');
    api.ingestGdoc({ url, mode: 'set', marker }).then((res) => {
      _closeModal(bd);
      const n = (res && res.items_created) ? res.items_created
        : (res && res.count) ? res.count
        : (res && res.items) ? res.items.length : '?';
      _toast(t('apostila.imported').replace('{n}', n));
      _load();
    }).catch((err) => {
      btn.disabled = false;
      btn.textContent = t('apostila.import_confirm');
      // The doc not being shared publicly is the common, user-actionable cause.
      notice.warn(t('creator.gdoc_not_shared'));
      notice.internal(err);
    });
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-apostila">' +
      '<div class="cdx-apostila-toolbar">' +
        '<h2 class="cdx-apostila-title" id="cdx-apostila-label">' + t('apostila.title_default') + '</h2>' +
        '<div class="cdx-apostila-toolbar-actions">' +
          '<button class="cdx-btn cdx-btn-primary" id="cdx-apostila-import">' + t('apostila.import_btn') + '</button>' +
          '<button class="cdx-btn cdx-btn-danger" id="cdx-apostila-delete-set" style="display:none">' + t('apostila.delete_set_btn') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-items-split cdx-apostila-split" id="cdx-apostila-split">' +
        '<div class="cdx-items-list" id="cdx-apostila-list">' +
          '<div class="cdx-empty">' + t('content.loading') + '</div>' +
        '</div>' +
        '<div class="cdx-item-preview" id="cdx-apostila-preview">' +
          '<div class="cdx-preview-empty">' + t('apostila.select') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  _q('cdx-apostila-import').addEventListener('click', _openImport);
  _q('cdx-apostila-delete-set').addEventListener('click', _deleteSet);
  _q('cdx-apostila-list').addEventListener('click', _onListClick);
  _q('cdx-apostila-preview').addEventListener('click', _onPreviewClick);
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _set = null;
  _items = [];
  _types = [];
  _tags = [];
  _selectedId = null;
  _detailCache = new Map();
  _cleanup = [];
  _renderShell();
  // Types + tags feed the editor opened from "Editar"; load in parallel.
  Promise.all([
    api.listTypes().then((d) => { _types = (d && d.types) || []; }).catch(() => {}),
    api.listTags().then((d) => { _tags = (d && d.tags) || []; }).catch(() => {}),
  ]);
  _load();
}

export function unmount() {
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _selectedId = null;
  _detailCache = new Map();
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}
