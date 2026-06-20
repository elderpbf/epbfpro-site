// content/tarefas.js
// Codex Content tab, Tarefas (assignments) sub-tab: authoring + student answers.
// Native port of the legacy ClassTrail Phase-5 tarefas surface (ct-admin.js):
// cdx- styling, facade-only backend, every string via t(). A turma is chosen in
// the shared pill picker; each released 'tarefa' item is an accordion that opens
// a two-pane editor (content + field type + anon) and the answers list (search,
// CSV export, per-answer delete). New assignments are created and released in
// one step.
//
// The tarefa field registry is now a Codex module (js/tarefa-fields.js),
// imported below. Remaining shared global:
//   window.BSToast         (../backstage/js/bs-toast.js)          optional toast
import { content as api, releases as relApi, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { getField, listFields } from '../js/tarefa-fields.js';
import { glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as turmaPicker from './turma-picker.js';
import { installResizer } from '../js/resizable.js';

const LS_CLIENT = 'ct_admin_tarefas_last_client';
const LS_TURMA = 'ct_admin_tarefas_last_turma';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _client = null;
let _turma = null;
let _items = [];
let _itemTurmas = {};    // item_id -> [{ client_slug, turma_slug, ... }]
let _submissions = {};   // item_id -> [submission]
let _selectedId = null;  // selected tarefa id (master-detail)
let _picker = null;
let _cleanup = [];

// ── Pure rules (exported for tests) ──────────────────────────────────────────
export function parseMeta(metaJson) {
  if (!metaJson) return {};
  if (typeof metaJson !== 'string') return metaJson || {};
  try { return JSON.parse(metaJson) || {}; } catch (_) { return {}; }
}

// Released tarefas, ordered by aula number (no-aula sinks to the bottom), then
// title. `_aula_number` is attached from the release map before sorting.
export function sortTarefas(items) {
  return (items || []).slice().sort((a, b) => {
    const av = a._aula_number == null ? 9999 : a._aula_number;
    const bv = b._aula_number == null ? 9999 : b._aula_number;
    if (av !== bv) return av - bv;
    return (a.title || '').localeCompare(b.title || '', 'pt-BR');
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _toast(msg) { if (window.BSToast && window.BSToast.show) window.BSToast.show(msg); }
function _err(e) { return t('content.error') + ': ' + ((e && e.message) || e); }
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }
function _fields() { return listFields(); }
function _field(type) { return getField(type || 'text'); }
function _plural(n, one, many) { return n === 1 ? one : many; }

function _formatTs(unix) {
  if (!unix) return '';
  try {
    return new Date(unix * 1000).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return ''; }
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
  const first = bd.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 60);
  return bd;
}
function _closeModal(bd) {
  const target = bd || document.querySelector('.cdx-modal-backdrop');
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

// ── Load ──────────────────────────────────────────────────────────────────────
function _loadTarefas(clientSlug, turmaSlug) {
  _client = clientSlug;
  _turma = turmaSlug;
  _selectedId = null;
  const listEl = _q('cdx-tarefas-list');
  const metaEl = _q('cdx-tarefas-meta');
  if (!listEl || !clientSlug || !turmaSlug) return;
  listEl.innerHTML = '<div class="cdx-empty">' + t('tarefas.loading') + '</div>';
  if (metaEl) metaEl.innerHTML = '';
  const pv = _q('cdx-tarefas-preview');
  if (pv) pv.innerHTML = '<div class="cdx-preview-empty">' + t('tarefas.select') + '</div>';
  _submissions = {};

  cohortsApi.listTurmas({ client_slug: clientSlug }).then((td) => {
    const turma = ((td && td.turmas) || []).find((tu) => tu.slug === turmaSlug);
    if (!turma) throw new Error(t('releases.turma_not_found'));
    return Promise.all([
      api.listItems({ type: 'tarefa' }),
      relApi.turmaView({ client_slug: clientSlug, turma_slug: turmaSlug, token: turma.token }),
    ]);
  }).then((results) => {
    const allTarefas = ((results[0] && results[0].items) || []).filter((i) => i.type === 'tarefa');
    const releaseMap = {};
    ((results[1] && results[1].items) || []).forEach((i) => {
      if (i.type === 'tarefa') releaseMap[i.id] = i.aula_number == null ? null : i.aula_number;
    });
    _items = sortTarefas(allTarefas
      .filter((i) => Object.prototype.hasOwnProperty.call(releaseMap, i.id))
      .map((i) => { i._aula_number = releaseMap[i.id]; return i; }));
    _renderList();
  }).catch((err) => {
    listEl.innerHTML = '<div class="cdx-empty">' + t('tarefas.error_loading') + ': ' + _esc((err && err.message) || err) + '</div>';
  });
}

// ── List ──────────────────────────────────────────────────────────────────────
function _renderList() {
  const listEl = _q('cdx-tarefas-list');
  const metaEl = _q('cdx-tarefas-meta');
  if (!listEl) return;
  if (!_items.length) {
    listEl.innerHTML = '<div class="cdx-empty">' + t('tarefas.empty') + '</div>';
    if (metaEl) metaEl.innerHTML = '';
    return;
  }
  if (metaEl) {
    metaEl.textContent = _items.length + ' ' +
      _plural(_items.length, t('tarefas.released_one'), t('tarefas.released_many'));
  }
  listEl.innerHTML = _items.map(_rowHtml).join('');
  // Async per-row enrichment: where else the item is released + answer counts.
  _items.forEach((item) => { _fetchItemTurmas(item.id); _prefetchSubmissionCount(item.id); });
}

function _rowHtml(item) {
  const meta = parseMeta(item.meta_json);
  const anonOk = !!meta.allow_anonymous;
  const aulaLabel = (item._aula_number != null)
    ? t('cohorts.aula_label') + ' ' + item._aula_number
    : t('tarefas.no_aula');
  const subCount = (_submissions[item.id] && _submissions[item.id].length) || 0;
  const countCls = subCount === 0 ? 'cdx-tarefa-count is-zero' : 'cdx-tarefa-count';
  const anonBlock = anonOk ? ''
    : '<span class="cdx-tarefa-dot">·</span><span class="cdx-tarefa-anon-badge">' + t('tarefas.anon_required') + '</span>';
  const active = Number(item.id) === Number(_selectedId);
  return '<div class="cdx-item-row' + (active ? ' is-active' : '') + '" data-item-id="' + _esc(item.id) + '">' +
    '<span class="cdx-item-type-icon cdx-tarefa-icon">' + glyphSvg('clipboard', { size: 18 }) + '</span>' +
    '<div class="cdx-item-info">' +
      '<div class="cdx-item-title">' + _esc(item.title) + '</div>' +
      '<div class="cdx-item-sub cdx-tarefa-sub">' +
        '<span>' + _esc(aulaLabel) + '</span>' +
        '<span class="cdx-tarefa-dot">·</span>' +
        '<span class="' + countCls + '" data-count="' + _esc(item.id) + '">' +
          subCount + ' ' + _plural(subCount, t('tarefas.answer_one'), t('tarefas.answer_many')) +
        '</span>' +
        anonBlock +
        '<span class="cdx-tarefa-dot">·</span>' +
        '<span class="cdx-tarefa-reuse" data-reuse="' + _esc(item.id) + '">…</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _fetchItemTurmas(itemId) {
  if (_itemTurmas[itemId]) { _updateReuseLabel(itemId); return; }
  api.listItemTurmas({ item_id: itemId }).then((res) => {
    _itemTurmas[itemId] = (res && res.turmas) || [];
    _updateReuseLabel(itemId);
  }).catch(() => { _itemTurmas[itemId] = []; _updateReuseLabel(itemId); });
}

function _updateReuseLabel(itemId) {
  const el = _viewEl && _viewEl.querySelector('.cdx-tarefa-reuse[data-reuse="' + itemId + '"]');
  if (!el) return;
  const others = (_itemTurmas[itemId] || []).filter((e) =>
    !(e.client_slug === _client && e.turma_slug === _turma) && e.turma_status !== 'archived');
  if (!others.length) {
    el.textContent = t('tarefas.reuse_solo');
    el.className = 'cdx-tarefa-reuse is-solo';
  } else {
    const labels = others.map((e) => e.client_display_name + ' · ' + e.turma_display_name).join(', ');
    el.textContent = t('tarefas.reuse_also').replace('{labels}', labels);
    el.className = 'cdx-tarefa-reuse is-multi';
    el.title = labels;
  }
}

function _prefetchSubmissionCount(itemId) {
  api.listSubmissions({ item_id: itemId, client_slug: _client, turma_slug: _turma }).then((res) => {
    _submissions[itemId] = (res && res.submissions) || [];
    _updateSubmissionCount(itemId);
  }).catch((e) => { notice.internal(e); });
}

function _updateSubmissionCount(itemId) {
  const el = _viewEl && _viewEl.querySelector('.cdx-tarefa-count[data-count="' + itemId + '"]');
  if (!el) return;
  const cnt = (_submissions[itemId] || []).length;
  el.textContent = cnt + ' ' + _plural(cnt, t('tarefas.answer_one'), t('tarefas.answer_many'));
  el.classList.toggle('is-zero', cnt === 0);
}

// ── Selection: render the editor + answers into the right pane ────────────────
function _onListClick(e) {
  const row = e.target.closest('.cdx-item-row');
  if (!row) return;
  _select(Number(row.dataset.itemId));
}

function _select(itemId) {
  _selectedId = itemId;
  if (_viewEl) _viewEl.querySelectorAll('.cdx-item-row').forEach((r) => {
    r.classList.toggle('is-active', Number(r.dataset.itemId) === Number(itemId));
  });
  _renderPreview();
}

// Right pane: the selected tarefa's editor stacked above its answers.
function _renderPreview() {
  const pane = _q('cdx-tarefas-preview');
  if (!pane) return;
  if (_selectedId == null) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('tarefas.select') + '</div>';
    return;
  }
  const itemId = _selectedId;
  pane.innerHTML =
    '<div class="cdx-preview-body cdx-tarefa-panes">' +
      '<div class="cdx-tarefa-pane" data-pane="editor"><div class="cdx-empty">' + t('content.loading') + '</div></div>' +
      '<div class="cdx-tarefa-pane" data-pane="resp"><div class="cdx-empty">' + t('tarefas.loading_answers') + '</div></div>' +
    '</div>';
  api.getItem({ id: itemId }).then((res) => {
    if (Number(_selectedId) !== Number(itemId)) return;
    const ed = pane.querySelector('[data-pane="editor"]');
    if (ed) _renderEditor(ed, (res && res.item) || {});
  }).catch(() => {
    if (Number(_selectedId) !== Number(itemId)) return;
    const ed = pane.querySelector('[data-pane="editor"]');
    if (ed) ed.innerHTML = '<div class="cdx-empty">' + t('tarefas.error_content') + '</div>';
  });
  _loadSubmissions(itemId);
}

function _renderEditor(container, item) {
  const meta = parseMeta(item.meta_json);
  const fieldType = meta.field_type || 'text';
  const allowAnon = !!meta.allow_anonymous;
  const chips = _fields().map((f) => {
    const cls = 'cdx-field-chip-btn' + (f.slug === fieldType ? ' is-active' : '') + (f.disabled ? ' is-disabled' : '');
    const future = f.disabled ? '<span class="cdx-field-future">' + t('tarefas.field_future') + '</span>' : '';
    return '<button type="button" class="' + cls + '" data-slug="' + _esc(f.slug) + '"' + (f.disabled ? ' disabled' : '') + '>' + _esc(f.label) + future + '</button>';
  }).join('');

  container.innerHTML =
    '<h4 class="cdx-tarefa-pane-title">' + t('tarefas.content_title') + '</h4>' +
    '<div class="cdx-field"><label>' + t('editor.title_label') + '</label>' +
      '<input type="text" class="cdx-tf-title" value="' + _esc(item.title) + '"></div>' +
    '<div class="cdx-field"><label>' + t('tarefas.instructions_label') + '</label>' +
      '<textarea class="cdx-tf-body" rows="8">' + _esc(item.body_md || '') + '</textarea>' +
      '<p class="cdx-helper-text">' + t('tarefas.instructions_hint') + '</p></div>' +
    '<div class="cdx-field"><label>' + t('tarefas.field_type_label') + '</label>' +
      '<div class="cdx-field-chips">' + chips + '</div>' +
      '<p class="cdx-helper-text">' + t('tarefas.field_type_hint') + '</p></div>' +
    '<label class="cdx-toggle-label">' +
      '<span class="cdx-toggle"><input type="checkbox" class="cdx-tf-anon"' + (allowAnon ? ' checked' : '') + '><span class="cdx-toggle-slider"></span></span>' +
      '<span class="cdx-toggle-text">' + t('tarefas.allow_anon') + '</span></label>' +
    '<div class="cdx-tarefa-editor-actions">' +
      '<button class="cdx-btn cdx-btn-primary cdx-tf-save">' + t('tarefas.save_changes') + '</button>' +
      '<button class="cdx-btn cdx-tf-cancel">' + t('content.cancel') + '</button>' +
      '<button class="cdx-btn cdx-btn-danger cdx-tf-delete">' + t('tarefas.remove_btn') + '</button>' +
    '</div>';

  container.querySelectorAll('.cdx-field-chip-btn:not(.is-disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cdx-field-chip-btn').forEach((b) => { if (!b.disabled) b.classList.remove('is-active'); });
      btn.classList.add('is-active');
    });
  });
  container.querySelector('.cdx-tf-save').addEventListener('click', () => _saveTarefa(container, item));
  container.querySelector('.cdx-tf-cancel').addEventListener('click', () => _renderPreview());
  container.querySelector('.cdx-tf-delete').addEventListener('click', () => _deleteTarefa(item));
}

function _saveTarefa(container, item) {
  const title = container.querySelector('.cdx-tf-title').value.trim();
  const body = container.querySelector('.cdx-tf-body').value;
  const anon = container.querySelector('.cdx-tf-anon').checked;
  const activeChip = container.querySelector('.cdx-field-chip-btn.is-active');
  const fieldType = activeChip ? activeChip.dataset.slug : 'text';
  if (!title) { _toast(t('editor.title_required')); return; }
  const meta = parseMeta(item.meta_json);
  meta.allow_anonymous = anon;
  meta.field_type = fieldType;
  api.updateItem({ id: item.id, title, body_md: body, meta_json: JSON.stringify(meta) }).then(() => {
    _toast(t('tarefas.updated'));
    item.title = title; item.body_md = body; item.meta_json = JSON.stringify(meta);
    const lib = _items.find((i) => i.id === item.id);
    if (lib) { lib.title = title; lib.meta_json = item.meta_json; }
    // Refresh the row's visible title + anon badge by re-rendering the list head.
    _renderList();
  }).catch((err) => notice.internal(_err(err)));
}

// Per-turma removal: take the tarefa OUT of this turma (unrelease). The library item
// and every other turma it's released to are untouched, re-releasing it in Liberações
// brings it (and the stored answers) back. Replaces the old global ct_delete_item,
// which wiped the tarefa from every turma at once (the per-turma delete bug).
function _deleteTarefa(item) {
  const html =
    '<div class="cdx-modal" style="max-width:460px">' +
      '<div class="cdx-modal-title">' + t('tarefas.remove_title') + '</div>' +
      '<p style="font-size:0.88rem;color:var(--text-secondary)">' + t('tarefas.remove_warning') + '</p>' +
      '<p class="cdx-tarefa-delete-quote">' + _esc(item.title) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" data-act="ok">' + t('tarefas.remove_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => {
    relApi.unrelease({ item_id: item.id, client_slug: _client, turma_slug: _turma }).then(() => {
      _closeModal(bd);
      _toast(t('tarefas.removed'));
      if (Number(_selectedId) === Number(item.id)) _selectedId = null;
      _loadTarefas(_client, _turma);
    }).catch((err) => notice.internal(_err(err)));
  });
}

// ── Submissions (answers) ─────────────────────────────────────────────────────
function _loadSubmissions(itemId) {
  api.listSubmissions({ item_id: itemId, client_slug: _client, turma_slug: _turma }).then((res) => {
    _submissions[itemId] = (res && res.submissions) || [];
    _renderSubmissions(itemId);
    _updateSubmissionCount(itemId);
  }).catch(() => {
    if (Number(itemId) !== Number(_selectedId)) return;
    const pane = _viewEl && _viewEl.querySelector('#cdx-tarefas-preview [data-pane="resp"]');
    if (pane) pane.innerHTML = '<div class="cdx-empty">' + t('tarefas.error_answers') + '</div>';
  });
}

function _renderSubmissions(itemId) {
  if (Number(itemId) !== Number(_selectedId)) return;
  const pane = _viewEl && _viewEl.querySelector('#cdx-tarefas-preview [data-pane="resp"]');
  if (!pane) return;
  const subs = _submissions[itemId] || [];
  const count = subs.length;
  pane.innerHTML =
    '<h4 class="cdx-tarefa-pane-title">' + t('tarefas.answers_title') + ' (' + count + ')</h4>' +
    '<div class="cdx-resp-toolbar">' +
      '<input type="text" class="cdx-resp-search" placeholder="' + _esc(t('tarefas.answers_search')) + '">' +
      '<button class="cdx-btn cdx-btn-sm cdx-resp-export"' + (count === 0 ? ' disabled' : '') + '>' + t('tarefas.export_csv') + '</button>' +
    '</div>' +
    '<div class="cdx-resp-list">' +
      (count === 0
        ? '<div class="cdx-resp-empty">' + t('tarefas.answers_empty') + '</div>'
        : subs.map(_submissionCardHtml).join('')) +
    '</div>';

  pane.querySelectorAll('.cdx-resp-card-delete').forEach((btn) => {
    btn.addEventListener('click', () => _deleteSubmission(Number(btn.dataset.sid), itemId));
  });
  pane.querySelectorAll('.cdx-resp-card-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = (_submissions[itemId] || []).find((x) => x.id === Number(btn.dataset.sid));
      if (!s) return;
      _copySmall(_field(s.answer_type || 'text').toCsvValue(s.answer_json), btn);
    });
  });
  pane.querySelectorAll('.cdx-resp-card-expand').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.cdx-resp-card');
      if (!card) return;
      card.classList.toggle('is-expanded');
      btn.textContent = card.classList.contains('is-expanded') ? t('tarefas.collapse') : t('tarefas.see_full');
    });
  });
  const search = pane.querySelector('.cdx-resp-search');
  if (search) search.addEventListener('input', () => {
    const qq = (search.value || '').toLowerCase().trim();
    pane.querySelectorAll('.cdx-resp-card').forEach((card) => {
      const hay = (card.dataset.search || '').toLowerCase();
      card.style.display = (!qq || hay.indexOf(qq) !== -1) ? '' : 'none';
    });
  });
  const exportBtn = pane.querySelector('.cdx-resp-export');
  if (exportBtn) exportBtn.addEventListener('click', () => _exportCsv(_items.find((i) => i.id === itemId), subs));
}

function _submissionCardHtml(s) {
  const field = _field(s.answer_type || 'text');
  const who = s.student_name ? _esc(s.student_name) : '<em>' + t('tarefas.anonymous') + '</em>';
  const whoCls = s.student_name ? 'cdx-resp-who' : 'cdx-resp-who is-anon';
  const content = field.renderStored(s.answer_json);
  const rawText = field.toCsvValue(s.answer_json);
  const hay = (s.student_name || '') + ' ' + rawText;
  return '<div class="cdx-resp-card" data-search="' + _esc(hay) + '">' +
    '<div class="cdx-resp-meta">' +
      '<span class="' + whoCls + '">' + who + '</span>' +
      '<span class="cdx-resp-when">' + _esc(_formatTs(s.submitted_at)) + '</span>' +
    '</div>' +
    '<div class="cdx-resp-content">' + content + '</div>' +
    '<div class="cdx-resp-actions">' +
      '<button class="cdx-btn cdx-btn-sm cdx-resp-card-expand">' + t('tarefas.see_full') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm cdx-resp-card-copy" data-sid="' + _esc(s.id) + '">' + t('tarefas.copy') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-resp-card-delete" data-sid="' + _esc(s.id) + '">' + t('tarefas.answer_delete') + '</button>' +
    '</div>' +
  '</div>';
}

function _deleteSubmission(sid, itemId) {
  _openConfirmSimple(t('tarefas.confirm_delete_answer'), () => {
    api.deleteSubmission({ id: sid }).then(() => {
      _toast(t('tarefas.answer_deleted'));
      _loadSubmissions(itemId);
    }).catch((err) => notice.internal(_err(err)));
  });
}

function _openConfirmSimple(message, onConfirm) {
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
      '<p style="margin:0 0 1.2rem;font-size:0.9rem;color:var(--text-primary)">' + _esc(message) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" data-act="ok">' + t('content.delete') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => { _closeModal(bd); onConfirm(); });
}

// ── CSV export ────────────────────────────────────────────────────────────────
function _csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function _exportCsv(item, subs) {
  if (!item || !subs || !subs.length) return;
  const rows = [[t('tarefas.csv_student'), t('tarefas.csv_date'), t('tarefas.csv_type'), t('tarefas.csv_answer')]];
  subs.forEach((s) => {
    rows.push([
      s.student_name || t('tarefas.anonymous'),
      _formatTs(s.submitted_at),
      s.answer_type || 'text',
      _field(s.answer_type || 'text').toCsvValue(s.answer_json),
    ]);
  });
  const csv = rows.map((r) => r.map(_csvCell).join(',')).join('\r\n');
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (item.title || 'tarefa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.href = url;
  a.download = 'tarefa-' + (slug || 'tarefa') + '-respostas.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

function _copySmall(text, btn) {
  const flash = () => { const orig = btn.textContent; btn.textContent = t('tarefas.copied'); setTimeout(() => { btn.textContent = orig; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(() => _copyFallback(text, flash));
  } else { _copyFallback(text, flash); }
}
function _copyFallback(text, flash) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* ignore */ }
  document.body.removeChild(ta);
  flash();
}

// ── New tarefa ──────────────────────────────────────────────────────────────
function _openNew() {
  if (!_client || !_turma) { _toast(t('tarefas.select_turma_first')); return; }
  const html =
    '<div class="cdx-modal" style="max-width:520px">' +
      '<div class="cdx-modal-title">' + t('tarefas.new_title') + '</div>' +
      '<div class="cdx-field"><label>' + t('editor.title_label') + '</label>' +
        '<input type="text" data-fld="title" placeholder="' + _esc(t('tarefas.new_title_placeholder')) + '"></div>' +
      '<div class="cdx-field"><label>' + t('tarefas.aula_optional') + '</label>' +
        '<input type="number" data-fld="aula" placeholder="' + _esc(t('tarefas.aula_placeholder')) + '"></div>' +
      '<div class="cdx-field"><label>' + t('tarefas.instructions_label') + '</label>' +
        '<textarea data-fld="body" rows="6" placeholder="' + _esc(t('tarefas.new_body_placeholder')) + '"></textarea></div>' +
      '<label class="cdx-toggle-label">' +
        '<span class="cdx-toggle"><input type="checkbox" data-fld="anon"><span class="cdx-toggle-slider"></span></span>' +
        '<span class="cdx-toggle-text">' + t('tarefas.allow_anon') + '</span></label>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + t('tarefas.create_release') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', function () {
    const title = bd.querySelector('[data-fld="title"]').value.trim();
    const body = bd.querySelector('[data-fld="body"]').value;
    const aula = bd.querySelector('[data-fld="aula"]').value.trim();
    const anon = bd.querySelector('[data-fld="anon"]').checked;
    if (!title) { _toast(t('editor.title_required')); return; }
    const meta = { allow_anonymous: anon, field_type: 'text' };
    const base = { client_slug: _client, turma_slug: _turma };
    api.createItem({ type: 'tarefa', title, body_md: body, meta_json: JSON.stringify(meta) }).then((res) => {
      const item = res && res.item;
      return relApi.release(Object.assign({ item_id: item.id }, base)).then(() => {
        if (aula) return relApi.setAula(Object.assign({ item_id: item.id, aula_number_or_null: parseInt(aula, 10) }, base));
      });
    }).then(() => {
      _closeModal(bd);
      _toast(t('tarefas.created'));
      _loadTarefas(_client, _turma);
    }).catch((err) => notice.internal(_err(err)));
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-tarefas">' +
      '<div class="cdx-tarefas-toolbar">' +
        '<h2 class="cdx-tarefas-title">' + t('tarefas.title') + '</h2>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-tarefa-new">' + t('tarefas.new_btn') + '</button>' +
      '</div>' +
      '<div class="cdx-turma-picker" id="cdx-tar-picker"></div>' +
      '<div class="cdx-tarefas-meta" id="cdx-tarefas-meta"></div>' +
      '<div class="cdx-items-split cdx-tarefas-split" id="cdx-tarefas-split">' +
        '<div class="cdx-items-list" id="cdx-tarefas-list">' +
          '<div class="cdx-empty">' + t('tarefas.select_prompt') + '</div>' +
        '</div>' +
        '<div class="cdx-item-preview" id="cdx-tarefas-preview">' +
          '<div class="cdx-preview-empty">' + t('tarefas.select') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  _q('cdx-tarefa-new').addEventListener('click', _openNew);
  _q('cdx-tarefas-list').addEventListener('click', _onListClick);
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx = {}) {
  _viewEl = viewEl;
  _client = null;
  _turma = null;
  _items = [];
  _itemTurmas = {};
  _submissions = {};
  _selectedId = null;
  _cleanup = [];
  _renderShell();
  // Draggable divider between the tarefa list and the editor/answers (persisted).
  installResizer(_q('cdx-tarefas-split'), { storeKey: 'cdx_rz_tarefas_split', defaultPx: 380, min: 260, max: 680 });
  // Embedded in a turma dossiê (ctx.clientSlug/turmaSlug given): turma already chosen,
  // hide the picker and load it. Standalone (Content tab): the picker drives selection.
  if (ctx.clientSlug && ctx.turmaSlug) {
    const pk = _q('cdx-tar-picker'); if (pk) pk.style.display = 'none';
    _loadTarefas(ctx.clientSlug, ctx.turmaSlug);
  } else {
    _picker = turmaPicker.mount(_q('cdx-tar-picker'), {
      onSelect: (c, tu) => _loadTarefas(c, tu),
      storageKey: { client: LS_CLIENT, turma: LS_TURMA },
      autoRestore: true,
    });
  }
}

export function unmount() {
  if (_picker && _picker.destroy) _picker.destroy();
  _picker = null;
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _selectedId = null;
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}
