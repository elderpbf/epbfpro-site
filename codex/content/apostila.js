// content/apostila.js
// Codex Content tab, Apostila sub-tab (redesign 2026-07). A global LIBRARY of N apostilas,
// each a ct_item_sets row bound to a course. Sections are authored NATIVELY here (the
// Google Doc import is retired). Two edit modes:
//   * Ao vivo: edit the live sections directly (Élder's own quick edits); changes reach
//                students immediately.
//   * Cópia de trabalho: a temporary working copy (ct_apostila_drafts) the AI/bulk edits
//                land in; review, then "Convergir" applies it to the live items BY ID so
//                releases/access are preserved. New sections INSERT unreleased; a removed
//                section is deleted through the guarded "apagar de tudo" path.
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as itemForm from './item-form.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { renderItem } from '../js/item-render.js';
import { esc as _esc } from '../js/dom.js';
import { errMsg as _err } from '../js/content-err.js';
import { openModal, closeModal } from '../js/modal.js';
import { mountRail } from '../js/list-rail.js';
import { markChanges, DIFF_OPEN, DIFF_CLOSE } from '../js/text-diff.js';
import { markAddedInDom } from '../js/diff-dom.js';

// Word-diff highlight for PLAIN-TEXT fields (title/summary): escape, then swap the sentinels
// markChanges left around the changed runs for <mark>. The markdown BODY can't use this (a
// sentinel breaks block parsing / an inline <mark> can't span blocks); it highlights on the
// rendered DOM via _applyBodyDiff.
function _diffText(oldStr, newStr) {
  return _esc(markChanges(oldStr, newStr)).split(DIFF_OPEN).join('<mark class="cdx-diff">').split(DIFF_CLOSE).join('</mark>');
}

// ── Module state ──────────────────────────────────────────────────────────────
let _viewEl = null;
let _sets = [];               // library list
let _setId = null;            // open apostila id (null = library view)
let _setName = '';            // open apostila display name
let _mode = 'live';           // 'live' | 'draft'
let _live = [];               // live sections (ct_get_set items, no body_md)
let _draft = null;            // { exists, sections, removed } or null
let _selectedId = null;       // selected section id (live item id OR draft row id)
let _detailCache = new Map(); // live item id -> full item (with body_md)
let _types = [];
let _tags = [];
let _rail = null;             // the shared left-panel rail (js/list-rail.js); the section list

function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// ── Confirm modal (mirrors the Items sub-tab) ────────────────────────────────
function _openConfirm(opts) {
  const cls = opts.danger ? ' cdx-btn-danger-solid' : ' cdx-btn-primary';
  const html =
    '<div class="cdx-modal cdx-modal--md">' +
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

// Simple single-field prompt (create / rename apostila).
function _openPrompt(opts) {
  const html =
    '<div class="cdx-modal cdx-modal--md">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<div class="cdx-field"><label>' + _esc(opts.label) + '</label>' +
        '<input type="text" data-fld="v" value="' + _esc(opts.value || '') + '"></div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + _esc(opts.okLabel) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  const input = bd.querySelector('[data-fld="v"]');
  setTimeout(() => input.focus(), 0);
  const submit = () => {
    const v = input.value.trim();
    if (!v) { toast.err(t('editor.title_required')); return; }
    closeModal(bd); opts.onOk(v);
  };
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// ── Section editor (reuses itemForm via the saveFn hook) ─────────────────────
function _openEditor(opts) {
  const bd = openModal('<div class="cdx-modal-body"></div>', { disableBackdropClose: true });
  // Apostila sections are always type 'conteudo'; force it (new) so the picker never lands
  // on a foreign type from the creator's AI prefill.
  const prefill = opts.item ? null : Object.assign({}, opts.prefill || {}, { type: 'conteudo' });
  itemForm.mount(bd.querySelector('.cdx-modal-body'), {
    item: opts.item || null,
    prefill,
    aiContext: opts.aiContext || null,
    types: _types,
    tags: _tags,
    titleLabel: opts.titleLabel,
    saveLabel: t('content.save'),
    closeLabel: t('content.close'),
    excludeTypes: opts.item ? [] : _types.filter((ty) => ty.slug !== 'conteudo').map((ty) => ty.slug),
    saveFn: opts.saveFn,
    onSave: () => { closeModal(bd); opts.onDone && opts.onDone(); },
    onCancel: () => closeModal(bd),
  });
}

// ══ LIBRARY VIEW ══════════════════════════════════════════════════════════════
function _loadLibrary() {
  const el = _q('cdx-apostila-lib');
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
  return api.listSets().then((d) => {
    _sets = (d && d.sets) || [];
    _renderLibrary();
  }).catch((err) => {
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('apostila.error_loading') + '</div>';
    notice.internal(_err(err));
  });
}

function _renderLibrary() {
  const el = _q('cdx-apostila-lib');
  if (!el) return;
  if (!_sets.length) {
    el.innerHTML = '<div class="cdx-empty">' + t('apostila.lib_empty') + '</div>';
    return;
  }
  el.innerHTML = _sets.map((s) => {
    const name = (s.name && s.name.trim()) ? s.name : t('apostila.unnamed');
    const meta = t('apostila.meta_sections').replace('{n}', s.item_count || 0) +
      ' · ' + t('apostila.meta_courses').replace('{c}', s.course_count || 0);
    return '<div class="cdx-apostila-card" data-id="' + _esc(s.id) + '">' +
      '<div class="cdx-apostila-card-open" data-act="open">' +
        '<div class="cdx-apostila-card-name">' + _esc(name) + '</div>' +
        '<div class="cdx-apostila-card-meta">' + _esc(meta) + '</div>' +
      '</div>' +
      '<div class="cdx-apostila-card-actions">' +
        '<button class="cdx-btn cdx-btn-sm" data-act="rename">' + t('apostila.rename') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delete">' + t('content.delete') + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function _onLibraryClick(e) {
  const card = e.target.closest('.cdx-apostila-card');
  if (!card) return;
  const id = Number(card.dataset.id);
  const set = _sets.find((s) => Number(s.id) === id);
  const act = (e.target.closest('[data-act]') || {}).dataset ? e.target.closest('[data-act]').dataset.act : 'open';
  if (act === 'rename') return _renameApostila(set);
  if (act === 'delete') return _deleteApostila(set);
  _openApostila(id, (set && set.name) || '');
}

function _openNewApostila() {
  _openPrompt({
    title: t('apostila.new_title'), label: t('apostila.name_label'), okLabel: t('apostila.create'),
    onOk(name) {
      api.createSet({ name }).then((d) => {
        if (d && d.error) throw new Error(d.error);
        toast.ok(t('apostila.created'));
        _openApostila(d.set.id, d.set.name || '');
      }).catch((err) => notice.internal(_err(err)));
    },
  });
}

function _renameApostila(set) {
  if (!set) return;
  _openPrompt({
    title: t('apostila.rename_title'), label: t('apostila.name_label'),
    value: set.name || '', okLabel: t('apostila.rename'),
    onOk(name) {
      api.updateSet({ id: set.id, name }).then((d) => {
        if (d && d.error) throw new Error(d.error);
        toast.ok(t('apostila.renamed'));
        if (Number(_setId) === Number(set.id)) { _setName = name; const n = _q('cdx-apostila-name'); if (n) n.textContent = name; }
        _loadLibrary();
      }).catch((err) => notice.internal(_err(err)));
    },
  });
}

// Delete a whole apostila, reuses the guarded set-delete (refuses a released set unless
// force, then the strong-confirm "apagar de tudo").
function _deleteApostila(set) {
  if (!set) return;
  _openConfirm({
    title: t('apostila.delete_set_title'), message: t('apostila.confirm_delete_set'), danger: true,
    onConfirm() { _doDeleteApostila(set, false); },
  });
}
function _doDeleteApostila(set, force) {
  api.deleteSet({ id: set.id, force }).then((d) => {
    if (d && d.error) throw Object.assign(new Error(d.error), { data: d });
    toast.ok(t('apostila.set_deleted'));
    _loadLibrary();
  }).catch((err) => {
    const data = (err && err.data) || null;
    if (data && data.error === 'set_has_releases') {
      _openConfirm({
        title: t('apostila.delete_set_released_title'),
        message: t('apostila.delete_set_released_msg').replace('{n}', data.released_count).replace('{t}', data.turma_count),
        danger: true, confirmLabel: t('apostila.delete_set_released_confirm'),
        onConfirm() { _doDeleteApostila(set, true); },
      });
      return;
    }
    notice.internal(_err(err));
  });
}

// ══ APOSTILA DETAIL VIEW ══════════════════════════════════════════════════════
function _openApostila(id, name) {
  _setId = id;
  _setName = name || '';
  _mode = 'live';
  _selectedId = null;
  _detailCache = new Map();
  _draft = null;
  _renderShell();
  _loadMode();
}

function _backToLibrary() {
  if (_rail) { _rail.destroy(); _rail = null; }
  _setId = null;
  _selectedId = null;
  _renderShell();
  _loadLibrary();
}

function _setMode(mode) {
  if (_mode === mode) return;
  _mode = mode;
  _selectedId = null;
  _renderModeUi();
  _loadMode();
}

function _loadMode() {
  if (_mode === 'draft') return _loadDraft();
  return _loadLive();
}

// ── Live mode ─────────────────────────────────────────────────────────────────
function _loadLive() {
  const el = _q('cdx-apostila-list');
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
  return api.getSet({ id: _setId }).then((res) => {
    if (res && !res.set && res.error) throw new Error(res.error);
    if (res && res.set && res.set.name != null) { _setName = res.set.name || _setName; }
    _live = ((res && res.items) || []).slice().sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
    _renderList();
    _renderPreview();
  }).catch((err) => {
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('apostila.error_loading') + '</div>';
    notice.internal(_err(err));
  });
}

// ── Draft mode ────────────────────────────────────────────────────────────────
function _loadDraft() {
  const el = _q('cdx-apostila-list');
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
  return api.getDraft({ set_id: _setId }).then((res) => {
    if (res && res.error) throw new Error(res.error);
    _draft = res || { exists: false, sections: [], removed: [] };
    _renderList();
    _renderPreview();
    _renderDraftbar();
  }).catch((err) => {
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('apostila.error_loading') + '</div>';
    notice.internal(_err(err));
  });
}

function _startDraft() {
  api.startDraft({ set_id: _setId }).then((res) => {
    if (res && res.error) throw new Error(res.error);
    _draft = res;
    toast.ok(t('apostila.draft_started'));
    _renderList();
    _renderPreview();
    _renderDraftbar();
  }).catch((err) => notice.internal(_err(err)));
}

// ── Shared list render (live rows OR draft rows), now the shared list-rail ────
// The section list adopts js/list-rail.js (track-21 rollout). The rail lives INSIDE
// #cdx-apostila-list (which keeps its .cdx-items-list class, so the mobile drawer at
// codex.css:194 still applies). The draft-START state (no working copy yet) is not a
// row list, so it bypasses the rail with its own CTA; every row state is the rail.
function _sectionRowMain(it) {
  const pos = _mode === 'draft' ? it.position : it.set_position;
  // A small badge flags new/edited sections; the actual changed TEXT is highlighted in
  // the preview (right pane), not the row itself.
  const badge = (_mode === 'draft' && it.status && it.status !== 'unchanged')
    ? '<span class="cdx-apostila-badge cdx-apostila-badge--' + it.status + '">' + t('apostila.status_' + it.status) + '</span>'
    : '';
  return '<span class="cdx-apostila-pos">' + _esc(pos != null ? pos : '') + '</span>' +
    '<div class="cdx-item-info">' +
      '<div class="cdx-item-title">' + _esc(it.title || '') + badge + '</div>' +
      '<div class="cdx-item-sub">' + _esc((it.summary && it.summary.trim()) ? it.summary : t('apostila.no_summary')) + '</div>' +
    '</div>';
}

function _removedFooterHtml() {
  if (!(_mode === 'draft' && _draft && _draft.removed && _draft.removed.length)) return '';
  return '<div class="cdx-apostila-removed"><div class="cdx-apostila-removed-title">' + t('apostila.removed_title') + '</div>' +
    _draft.removed.map((r) => '<div class="cdx-apostila-removed-row">' + _esc(r.title || '') + '</div>').join('') + '</div>';
}

function _buildRail() {
  const el = _q('cdx-apostila-list');
  if (!el) return;
  _rail = mountRail(el, {
    title: '',
    items: () => (_mode === 'draft' ? (_draft && _draft.sections) || [] : _live),
    getId: (it) => it.id,
    renderRow: (it) => ({ main: _sectionRowMain(it) }),
    selectedId: () => _selectedId,
    onSelect: (id) => { _selectedId = Number(id); _rail.render(); _renderPreview(); },
    add: { label: '+', title: t('apostila.add_section'), onAdd: _addSection },
    dragHint: t('apostila.drag_hint'),
    emptyText: t('apostila.no_sections'),
    footer: _removedFooterHtml,
    reorder: { onReorder: _onReorder },
  });
}

function _renderList() {
  const el = _q('cdx-apostila-list');
  if (!el) return;
  // Draft-start (no working copy) is a CTA, not a list, so render it directly (no rail).
  if (_mode === 'draft' && (!_draft || !_draft.exists)) {
    if (_rail) { _rail.destroy(); _rail = null; }
    el.innerHTML =
      '<div class="cdx-apostila-draftstart">' +
        '<p class="cdx-helper-text">' + t('apostila.draft_none') + '</p>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="start">' + t('apostila.draft_start') + '</button>' +
      '</div>';
    const start = el.querySelector('[data-act="start"]');
    if (start) start.addEventListener('click', _startDraft);
    return;
  }
  if (!_rail) _buildRail();
  _rail.render();
}

// ── Preview pane (renders the selected section + its actions) ────────────────
function _renderPreview() {
  const pane = _q('cdx-apostila-preview');
  if (!pane) return;
  if (_selectedId == null) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('apostila.select') + '</div>';
    return;
  }
  if (_mode === 'draft') {
    const sec = (_draft.sections || []).find((s) => Number(s.id) === Number(_selectedId));
    if (!sec) { pane.innerHTML = '<div class="cdx-preview-empty">' + t('apostila.select') + '</div>'; return; }
    pane.innerHTML = _previewHtml(sec, 'draft');
    _renderBody({ ...sec, type: 'conteudo' }, sec.body_changed ? (sec.live_body || '') : null);
    return;
  }
  // live: fetch full item (getSet omits body_md)
  const itemId = _selectedId;
  const cached = _detailCache.get(Number(itemId));
  if (cached) { pane.innerHTML = _previewHtml(cached, 'live'); _renderBody(cached); return; }
  const light = _live.find((i) => Number(i.id) === Number(itemId)) || { title: '' };
  pane.innerHTML = _previewHtml(light, 'live', true);
  api.getItem({ id: itemId }).then((d) => {
    if (Number(_selectedId) !== Number(itemId)) return;
    const full = (d && d.item) || light;
    if (full && full.id != null) _detailCache.set(Number(full.id), full);
    pane.innerHTML = _previewHtml(full, 'live');
    _renderBody(full);
  }).catch((err) => {
    if (Number(_selectedId) !== Number(itemId)) return;
    const host = _q('cdx-apostila-render');
    if (host) host.innerHTML = '<div class="cdx-empty">' + t('apostila.error_loading') + '</div>';
    notice.internal(_err(err));
  });
}

function _previewHtml(item, mode, loading) {
  const removeLabel = mode === 'draft' ? t('apostila.remove_section') : t('content.delete');
  const draft = mode === 'draft';
  // Working copy: word-diff each field vs the live value and mark ONLY the changed runs
  // (a new section diffs against '' so all its text marks). Live mode renders plain.
  const titleHtml = (draft && item.title_changed) ? _diffText(item.live_title || '', item.title || '') : _esc(item.title || '');
  const summaryInner = (draft && item.summary_changed) ? _diffText(item.live_summary || '', item.summary || '') : _esc(item.summary || '');
  const summary = (item.summary && String(item.summary).trim())
    ? '<div class="cdx-preview-summary">' + summaryInner + '</div>'
    : '';
  return '<div class="cdx-preview-head">' +
      '<div class="cdx-preview-head-info">' +
        '<div class="cdx-preview-title">' + titleHtml + '</div>' +
        summary +
      '</div>' +
      '<div class="cdx-preview-actions">' +
        '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-act="edit">' + t('content.edit') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="remove">' + removeLabel + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-preview-body"><div class="cdx-preview-render" id="cdx-apostila-render">' +
      (loading ? '<div class="cdx-empty">' + t('content.loading') + '</div>' : '') +
    '</div></div>';
}

function _renderBody(item, diffOldBody) {
  const host = _q('cdx-apostila-render');
  if (!host) return;
  const plain = () => { try { renderItem(item, host, {}); } catch (_) { host.textContent = item.body_md || ''; } };
  if (diffOldBody == null) { plain(); return; }
  // Diff render: render the NEW body clean, render the OLD body off-screen for its text, then
  // highlight the added words on the rendered DOM (see _applyBodyDiff). renderMarkdown is
  // async until marked.js loads (a "Carregando..." placeholder first), so wait for marked or
  // the query for .ctr-prompt-body would miss and nothing would highlight.
  const doDiff = () => {
    try {
      renderItem(item, host, {});
      const bodyEl = host.querySelector('.ctr-prompt-body');
      if (!bodyEl) return;
      const tmp = document.createElement('div');
      renderItem(Object.assign({}, item, { body_md: diffOldBody || '' }), tmp, { preview: true });
      const oldBody = tmp.querySelector('.ctr-prompt-body') || tmp;
      markAddedInDom(bodyEl, oldBody.textContent || '');
    } catch (err) { notice.internal(_err(err)); plain(); }
  };
  if (window.marked) { doDiff(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  s.onload = doDiff;
  s.onerror = plain;
  document.head.appendChild(s);
}

function _onPreviewClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || _selectedId == null) return;
  if (btn.dataset.act === 'edit') _editSection(_selectedId);
  else if (btn.dataset.act === 'remove') _removeSection(_selectedId);
}

// ── Section create / edit / remove / move (mode-aware) ───────────────────────
// New section = the shared content-first creator (step 1: paste text / load a Google Doc /
// pick a file, organized by the AI) reused verbatim from the Items tab, then the editor
// (step 2). Only on CREATE; editing a section opens the editor directly.
function _addSection() {
  // One screen. The content-first step used to be a separate modal that funnelled every one of
  // its exits into this same editor; the step is a block inside the editor now, so the detour
  // and its three identical callbacks are gone.
  _openNewSectionEditor(null, null);
}

function _openNewSectionEditor(prefill, aiContext) {
  _openEditor({
    prefill: prefill || null,
    aiContext: aiContext || null,
    titleLabel: t('apostila.new_section'),
    saveFn: (params) => _mode === 'draft' ? _saveDraft(params) : _createLive(params),
    onDone: () => { toast.ok(t('apostila.section_created')); _loadMode(); },
  });
}

function _editSection(id) {
  if (_mode === 'draft') {
    const sec = (_draft.sections || []).find((s) => Number(s.id) === Number(id));
    if (!sec) return;
    _openEditor({
      item: { id: sec.id, type: 'conteudo', title: sec.title, summary: sec.summary, body_md: sec.body_md },
      titleLabel: t('content.edit_item'),
      saveFn: (params) => _saveDraft(params),
      onDone: () => { toast.ok(t('content.item_updated')); _loadDraft(); },
    });
    return;
  }
  api.getItem({ id }).then((d) => {
    const item = (d && d.item) || null;
    if (!item) return;
    _openEditor({
      item, titleLabel: t('content.edit_item'),
      // live edit: default itemForm path (updateItem preserves set_id), no saveFn.
      onDone: () => { toast.ok(t('content.item_updated')); _detailCache.delete(Number(id)); _loadLive(); },
    });
  }).catch((e) => notice.internal(_err(e)));
}

function _createLive(params) {
  return api.createItem({
    type: 'conteudo', title: params.title,
    summary: params.summary || null, body_md: params.body_md, set_id: _setId,
  });
}

function _saveDraft(params) {
  const payload = { set_id: _setId, title: params.title, body_md: params.body_md };
  if (params.id) payload.id = params.id;            // draft row id (edit)
  if (params.summary) payload.summary = params.summary; // else backend AI-regenerates
  return api.saveDraftSection(payload);
}

function _removeSection(id) {
  if (_mode === 'draft') {
    _openConfirm({
      title: t('apostila.remove_section'), message: t('apostila.remove_section') + '?', danger: true,
      confirmLabel: t('apostila.remove_section'),
      onConfirm() {
        if (Number(_selectedId) === Number(id)) _selectedId = null;
        api.deleteDraftSection({ id }).then((d) => {
          if (d && d.error) throw new Error(d.error);
          toast.ok(t('apostila.section_removed'));
          _loadDraft();
        }).catch((err) => notice.internal(_err(err)));
      },
    });
    return;
  }
  // live delete: guarded "apagar de tudo".
  _openConfirm({
    title: t('apostila.delete_section_title'), message: t('apostila.confirm_delete_section'), danger: true,
    onConfirm() { _doDeleteLive(id, false); },
  });
}

function _doDeleteLive(id, force) {
  api.deleteItem({ id, force, _silent: true }).then((d) => {
    if (d && d.error) throw Object.assign(new Error(d.error), { data: d });
    if (Number(_selectedId) === Number(id)) _selectedId = null;
    _detailCache.delete(Number(id));
    toast.ok(t('apostila.section_deleted'));
    _loadLive();
  }).catch((err) => {
    const data = (err && err.data) || null;
    if (data && data.error === 'item_released') {
      _openConfirm({
        title: t('apostila.delete_set_released_title'),
        message: t('apostila.delete_set_released_msg').replace('{n}', data.released_count).replace('{t}', data.turma_count),
        danger: true, confirmLabel: t('apostila.delete_set_released_confirm'),
        onConfirm() { _doDeleteLive(id, true); },
      });
      return;
    }
    notice.internal(_err(err));
  });
}

// Drag-reorder callback (from the shared js/reorder.js). The DOM is already in the new
// order; sync the local array + positions, persist, then re-render to fix the badges.
function _onReorder(orderedIds) {
  const ids = orderedIds.map(Number);
  const rows = _mode === 'draft' ? _draft.sections : _live;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const next = ids.map((id) => byId.get(id)).filter(Boolean);
  next.forEach((r, k) => { if (_mode === 'draft') r.position = k + 1; else r.set_position = k + 1; });
  if (_mode === 'draft') { _draft.sections = next; } else { _live = next; }
  _renderList();
  const call = _mode === 'draft'
    ? api.reorderDraft({ set_id: _setId, ordered_ids: ids })
    : api.reorderSetItems({ set_id: _setId, ordered_ids: ids });
  call.then((d) => { if (d && d.error) throw new Error(d.error); }).catch((err) => { notice.internal(_err(err)); _loadMode(); });
}

// ── Converge / discard ────────────────────────────────────────────────────────
function _renderDraftbar() {
  const bar = _q('cdx-apostila-draftbar');
  if (!bar) return;
  bar.hidden = !(_mode === 'draft' && _draft && _draft.exists);
}

function _converge(force) {
  // The facade THROWS on a worker {error} (the thrown Error carries .data), so the guarded
  // "released removals" case is handled in .catch via err.data, not in .then.
  api.convergeApostila({ set_id: _setId, force }).then((d) => {
    toast.ok(t('apostila.converged').replace('{u}', d.updated || 0).replace('{i}', d.inserted || 0).replace('{r}', d.removed || 0));
    _draft = null;
    _setMode('live');   // back to the (now updated) live view
  }).catch((err) => {
    const data = (err && err.data) || {};
    if (data.error === 'converge_removals_released') {
      _openConfirm({
        title: t('apostila.converge_released_title'),
        message: t('apostila.converge_released_msg').replace('{n}', (data.removals || []).length),
        danger: true, confirmLabel: t('apostila.converge_released_confirm'),
        onConfirm() { _converge(true); },
      });
      return;
    }
    notice.internal(_err(err));
  });
}

function _discard() {
  _openConfirm({
    title: t('apostila.discard_title'), message: t('apostila.discard_confirm'), danger: true,
    confirmLabel: t('apostila.discard'),
    onConfirm() {
      api.discardDraft({ set_id: _setId }).then((d) => {
        if (d && d.error) throw new Error(d.error);
        toast.ok(t('apostila.discarded'));
        _draft = { exists: false, sections: [], removed: [] };
        _selectedId = null;
        _renderList(); _renderPreview(); _renderDraftbar();
      }).catch((err) => notice.internal(_err(err)));
    },
  });
}

// ── Shell + mode UI ───────────────────────────────────────────────────────────
function _renderShell() {
  if (_setId == null) {
    _viewEl.innerHTML =
      '<div class="cdx-apostila">' +
        '<div class="cdx-apostila-toolbar">' +
          '<h2 class="cdx-apostila-title">' + t('apostila.lib_title') + '</h2>' +
          '<div class="cdx-apostila-toolbar-actions">' +
            '<button class="cdx-btn cdx-btn-primary" id="cdx-apostila-new">' + t('apostila.new_btn') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-apostila-lib" id="cdx-apostila-lib"><div class="cdx-empty">' + t('content.loading') + '</div></div>' +
      '</div>';
    _q('cdx-apostila-new').addEventListener('click', _openNewApostila);
    _q('cdx-apostila-lib').addEventListener('click', _onLibraryClick);
    return;
  }
  _viewEl.innerHTML =
    '<div class="cdx-apostila">' +
      '<div class="cdx-apostila-toolbar">' +
        '<button class="cdx-btn cdx-btn-sm" id="cdx-apostila-back">' + t('apostila.back') + '</button>' +
        '<h2 class="cdx-apostila-title" id="cdx-apostila-name">' + _esc(_setName || t('apostila.unnamed')) + '</h2>' +
        '<button class="cdx-btn cdx-btn-sm" id="cdx-apostila-rename">' + t('apostila.rename') + '</button>' +
        '<div class="cdx-apostila-modes" id="cdx-apostila-modes">' +
          '<button class="cdx-btn cdx-btn-sm" data-mode="live">' + t('apostila.mode_live') + '</button>' +
          '<button class="cdx-btn cdx-btn-sm" data-mode="draft">' + t('apostila.mode_draft') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-apostila-hint" id="cdx-apostila-hint"></div>' +
      '<div class="cdx-items-split cdx-apostila-split">' +
        '<div class="cdx-items-list" id="cdx-apostila-list"><div class="cdx-empty">' + t('content.loading') + '</div></div>' +
        '<div class="cdx-item-preview" id="cdx-apostila-preview"><div class="cdx-preview-empty">' + t('apostila.select') + '</div></div>' +
      '</div>' +
      '<div class="cdx-apostila-draftbar" id="cdx-apostila-draftbar" hidden>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-apostila-discard">' + t('apostila.discard') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-apostila-converge">' + t('apostila.converge') + '</button>' +
      '</div>' +
    '</div>';
  _q('cdx-apostila-back').addEventListener('click', _backToLibrary);
  _q('cdx-apostila-rename').addEventListener('click', () => _renameApostila(_sets.find((s) => Number(s.id) === Number(_setId)) || { id: _setId, name: _setName }));
  _q('cdx-apostila-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) _setMode(b.dataset.mode); });
  // The section list is the shared list-rail (built lazily by _renderList / _loadMode).
  // The DOM was just rebuilt, so drop any prior rail (its container is gone).
  if (_rail) { _rail.destroy(); _rail = null; }
  _q('cdx-apostila-preview').addEventListener('click', _onPreviewClick);
  _q('cdx-apostila-converge').addEventListener('click', () => _converge(false));
  _q('cdx-apostila-discard').addEventListener('click', _discard);
  _renderModeUi();
}

function _renderModeUi() {
  const modes = _q('cdx-apostila-modes');
  if (modes) modes.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === _mode));
  const hint = _q('cdx-apostila-hint');
  if (hint) hint.textContent = _mode === 'draft' ? t('apostila.draft_hint') : t('apostila.live_hint');
  _renderDraftbar();
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _sets = []; _setId = null; _setName = ''; _mode = 'live';
  _live = []; _draft = null; _selectedId = null; _detailCache = new Map();
  _types = []; _tags = [];
  _renderShell();
  Promise.all([
    api.listTypes().then((d) => { _types = (d && d.types) || []; }).catch((e) => { notice.internal(_err(e)); }),
    api.listTags().then((d) => { _tags = (d && d.tags) || []; }).catch((e) => { notice.internal(_err(e)); }),
  ]);
  _loadLibrary();
}

export function unmount() {
  if (_rail) { _rail.destroy(); _rail = null; }
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _setId = null; _selectedId = null; _draft = null;
  _detailCache = new Map();
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}

// Exported for tests: library shows every apostila (multi), no "current set" heuristic.
export function librarySets(sets) { return (sets || []).slice(); }
