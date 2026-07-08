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
// imported below.
import { content as api, releases as relApi, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { getField, listFields } from '../js/tarefa-fields.js';
import { renderEditor, readEditor, wireEditor } from '../js/tarefa-editor.js';
import { glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
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
let _turmaReleasedIds = new Set(); // item ids released to the current turma (bank "já na turma" badge)
let _submissions = {};   // item_id -> [submission]
let _flags = {};         // item_id -> { reply_enabled, grade_enabled } (per-instance toggles)
let _selectedId = null;  // selected tarefa id (master-detail)
let _picker = null;
let _cleanup = [];
// Aula-locked mode (embedded in the Cohorts aula hub): when set, the list is
// filtered to this one aula and new tarefas are created bound to it; _onChange
// pings the host to refresh its aula badges after a create/remove. Both null in
// the standalone Content-tab mount.
let _lockedAula = null;  // aula number | null
let _onChange = null;
// t1b authoring (aula-locked pane): the bank (all tarefa items + sections) loaded lazily
// when ＋Adicionar opens; _adding toggles the inline add block; _addSel is the chosen bank
// template ({kind:'bank',id} | {kind:'new'} | null); _editCard is the instance card whose
// inline editor is open; _revealOn/_aulaHappened drive the per-card reveal badge.
let _revealOn = false;
let _aulaHappened = false;
let _bankItems = [];
let _bankSections = [];
let _bankLoaded = false;
let _adding = false;
let _addSel = null;
let _editCard = null;
// Bank-only mode (Content > Tarefas sub-tab): the bank page with NO turma, NO aula-release
// actions and NO answers, just create/edit/delete tarefas (guarded). Reuses the add-block bank.
let _bankOnly = false;

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
import { esc as _esc } from '../js/dom.js';
import { errMsg as _err } from '../js/content-err.js';
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }
// Where the answers list renders: inside the open instance card (t1b aula-locked) or the
// right pane (standalone). One lookup so the submissions machinery is shared by both.
function _respPaneFor(itemId) {
  if (!_viewEl) return null;
  if (_lockedAula != null) return _viewEl.querySelector('.cdx-t1b-answers[data-card="' + itemId + '"]');
  return _viewEl.querySelector('#cdx-tarefas-preview [data-pane="resp"]');
}
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
import { openModal, closeModal } from '../js/modal.js';

// ── Load ──────────────────────────────────────────────────────────────────────
function _loadTarefas(clientSlug, turmaSlug) {
  _client = clientSlug;
  _turma = turmaSlug;
  _selectedId = null;
  _editCard = null;
  if (!clientSlug || !turmaSlug) return;
  const listEl = _q('cdx-tarefas-list');     // standalone only; null in the t1b pane
  const metaEl = _q('cdx-tarefas-meta');
  if (listEl) listEl.innerHTML = '<div class="cdx-empty">' + t('tarefas.loading') + '</div>';
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
    _turmaReleasedIds = new Set();
    ((results[1] && results[1].items) || []).forEach((i) => {
      _turmaReleasedIds.add(Number(i.id));
      if (i.type === 'tarefa') releaseMap[i.id] = i.aula_number == null ? null : i.aula_number;
    });
    _items = sortTarefas(allTarefas
      .filter((i) => Object.prototype.hasOwnProperty.call(releaseMap, i.id))
      .map((i) => { i._aula_number = releaseMap[i.id]; return i; }));
    // Aula-locked embed: only this aula's released tarefas.
    if (_lockedAula != null) {
      _items = _items.filter((i) => Number(i._aula_number) === Number(_lockedAula));
      _renderLockedPane();
    } else {
      _renderList();
    }
  }).catch((err) => {
    const msg = '<div class="cdx-empty">' + t('tarefas.error_loading') + ': ' + _esc((err && err.message) || err) + '</div>';
    const host = _lockedAula != null ? _q('cdx-t1b-pane') : _q('cdx-tarefas-list');
    if (host) host.innerHTML = msg;
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
  if (!title) { toast.err(t('editor.title_required')); return; }
  const meta = parseMeta(item.meta_json);
  meta.allow_anonymous = anon;
  meta.field_type = fieldType;
  api.updateItem({ id: item.id, title, body_md: body, meta_json: JSON.stringify(meta) }).then(() => {
    toast.ok(t('tarefas.updated'));
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
    '<div class="cdx-modal cdx-modal--md">' +
      '<div class="cdx-modal-title">' + t('tarefas.remove_title') + '</div>' +
      '<p style="font-size:0.88rem;color:var(--text-secondary)">' + t('tarefas.remove_warning') + '</p>' +
      '<p class="cdx-tarefa-delete-quote">' + _esc(item.title) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger-solid" data-act="ok">' + t('tarefas.remove_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => {
    relApi.unrelease({ item_id: item.id, client_slug: _client, turma_slug: _turma }).then(() => {
      closeModal(bd);
      toast.ok(t('tarefas.removed'));
      if (Number(_selectedId) === Number(item.id)) _selectedId = null;
      _loadTarefas(_client, _turma);
      if (_onChange) _onChange();
    }).catch((err) => notice.internal(_err(err)));
  });
}

// ── Submissions (answers) ─────────────────────────────────────────────────────
function _loadSubmissions(itemId) {
  api.listSubmissions({ item_id: itemId, client_slug: _client, turma_slug: _turma }).then((res) => {
    _submissions[itemId] = (res && res.submissions) || [];
    _flags[itemId] = (res && res.flags) || { reply_enabled: false, grade_enabled: false };
    _renderSubmissions(itemId);
    _updateSubmissionCount(itemId);
  }).catch((e) => {
    if (window.bsLog) window.bsLog('tarefas _loadSubmissions: ' + (e && e.message || e), 'error');
    if (Number(itemId) !== Number(_selectedId)) return;
    const pane = _respPaneFor(itemId);
    if (pane) pane.innerHTML = '<div class="cdx-empty">' + t('tarefas.error_answers') + '</div>';
  });
}

function _renderSubmissions(itemId) {
  if (Number(itemId) !== Number(_selectedId)) return;
  const pane = _respPaneFor(itemId);
  if (!pane) return;
  const subs = _submissions[itemId] || [];
  const flags = _flags[itemId] || { reply_enabled: false, grade_enabled: false };
  const count = subs.length;
  pane.innerHTML =
    '<h4 class="cdx-tarefa-pane-title">' + t('tarefas.answers_title') + ' (' + count + ')</h4>' +
    // t1b: the Resposta/Nota toggles live in the card head; standalone keeps them here.
    (_lockedAula != null ? '' :
      '<div class="cdx-resp-flags">' +
        '<span class="cdx-resp-flags-label">' + t('tarefas.flags_label') + '</span>' +
        _flagToggleHtml('reply', flags.reply_enabled, t('tarefas.reply_toggle')) +
        _flagToggleHtml('grade', flags.grade_enabled, t('tarefas.grade_toggle')) +
      '</div>') +
    '<div class="cdx-resp-toolbar">' +
      '<input type="text" class="cdx-input cdx-resp-search" placeholder="' + _esc(t('tarefas.answers_search')) + '">' +
      '<button class="cdx-btn cdx-btn-sm cdx-resp-export"' + (count === 0 ? ' disabled' : '') + '>' + t('tarefas.export_csv') + '</button>' +
    '</div>' +
    '<div class="cdx-resp-list">' +
      (count === 0
        ? '<div class="cdx-resp-empty">' + t('tarefas.answers_empty') + '</div>'
        : subs.map((s) => _submissionCardHtml(s, flags)).join('')) +
    '</div>';

  pane.querySelectorAll('.cdx-resp-flag').forEach((btn) => {
    btn.addEventListener('click', () => _toggleFlag(itemId, btn.dataset.flag));
  });
  pane.querySelectorAll('.cdx-resp-reply-send').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inp = btn.parentElement.querySelector('.cdx-resp-reply-input');
      _saveReply(Number(btn.dataset.sid), inp ? inp.value.trim() : '', itemId);
    });
  });
  pane.querySelectorAll('.cdx-resp-grade-save').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inp = btn.parentElement.querySelector('.cdx-resp-grade-input');
      _saveGrade(Number(btn.dataset.sid), inp ? inp.value.trim() : '', itemId);
    });
  });

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

function _submissionCardHtml(s, flags) {
  flags = flags || {};
  const field = _field(s.answer_type || 'text');
  const who = s.student_name ? _esc(s.student_name) : '<em>' + t('tarefas.anonymous') + '</em>';
  const whoCls = s.student_name ? 'cdx-resp-who' : 'cdx-resp-who is-anon';
  const content = field.renderStored(s.answer_json);
  const rawText = field.toCsvValue(s.answer_json);
  const hay = (s.student_name || '') + ' ' + rawText;
  const gradeBadge = (flags.grade_enabled && s.grade != null && s.grade !== '')
    ? '<span class="cdx-resp-grade-badge">' + t('tarefas.grade_toggle') + ' ' + _esc(s.grade) + '</span>' : '';
  return '<div class="cdx-resp-card" data-search="' + _esc(hay) + '">' +
    '<div class="cdx-resp-meta">' +
      '<span class="' + whoCls + '">' + who + '</span>' + gradeBadge +
      '<span class="cdx-resp-when">' + _esc(_formatTs(s.submitted_at)) + '</span>' +
    '</div>' +
    '<div class="cdx-resp-content">' + content + '</div>' +
    '<div class="cdx-resp-actions">' +
      '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-resp-card-expand">' + t('tarefas.see_full') + '</button>' +
      '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-resp-card-copy" data-sid="' + _esc(s.id) + '">' + t('tarefas.copy') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-resp-card-delete" data-sid="' + _esc(s.id) + '">' + t('tarefas.answer_delete') + '</button>' +
    '</div>' +
    (flags.reply_enabled ? _replyBlockHtml(s) : '') +
    (flags.grade_enabled ? _gradeBlockHtml(s) : '') +
  '</div>';
}

// ── Per-tarefa instructor reply + grade (t1b): toggles ride on the release; the
// reply/grade ride on the submission. One reusable input row per capability. ──────
function _flagToggleHtml(flag, on, label) {
  return '<button class="cdx-btn cdx-btn-sm cdx-resp-flag' + (on ? ' is-on' : '') + '" data-flag="' + flag + '">' +
    (on ? '☑ ' : '☐ ') + _esc(label) + '</button>';
}
function _replyBlockHtml(s) {
  return '<div class="cdx-resp-reply">' +
    '<label class="cdx-resp-sublabel">' + t('tarefas.reply_label') + '</label>' +
    '<div class="cdx-resp-reply-row">' +
      '<input type="text" class="cdx-input cdx-resp-reply-input" placeholder="' + _esc(t('tarefas.reply_ph')) + '" value="' + (s.instructor_reply ? _esc(s.instructor_reply) : '') + '">' +
      '<button class="cdx-btn cdx-btn-sm cdx-resp-reply-send" data-sid="' + _esc(s.id) + '">' + t('tarefas.reply_send') + '</button>' +
    '</div>' +
  '</div>';
}
function _gradeBlockHtml(s) {
  return '<div class="cdx-resp-grade">' +
    '<label class="cdx-resp-sublabel">' + t('tarefas.grade_toggle') + '</label>' +
    '<div class="cdx-resp-grade-row">' +
      '<input type="text" class="cdx-input cdx-resp-grade-input" placeholder="' + _esc(t('tarefas.grade_ph')) + '" value="' + (s.grade != null ? _esc(s.grade) : '') + '">' +
      '<button class="cdx-btn cdx-btn-sm cdx-resp-grade-save" data-sid="' + _esc(s.id) + '">' + t('tarefas.grade_save') + '</button>' +
    '</div>' +
  '</div>';
}
function _toggleFlag(itemId, flag) {
  const cur = _flags[itemId] || { reply_enabled: false, grade_enabled: false };
  const key = flag === 'reply' ? 'reply_enabled' : 'grade_enabled';
  const next = !cur[key];
  const payload = { client_slug: _client, turma_slug: _turma, item_id: itemId };
  payload[key] = next ? 1 : 0;
  api.setTarefaFlags(payload).then(() => {
    cur[key] = next; _flags[itemId] = cur;
    // t1b: the toggle lives in the card head, flip just that button + re-render the answers
    // (so the reply/grade rows appear/disappear), never the whole pane.
    if (_lockedAula != null) {
      const card = _viewEl && _viewEl.querySelector('.cdx-t1b-card[data-card="' + itemId + '"]');
      const b = card && card.querySelector('.cdx-resp-flag[data-flag="' + flag + '"]');
      if (b) { b.classList.toggle('is-on', next); b.innerHTML = (next ? '☑ ' : '☐ ') + _esc(flag === 'reply' ? t('tarefas.reply_toggle') : t('tarefas.grade_toggle')); }
      _renderSubmissions(itemId);
    } else _renderSubmissions(itemId);
  }).catch((err) => notice.internal(_err(err)));
}
function _saveReply(sid, reply, itemId) {
  api.replySubmission({ id: sid, reply: reply }).then(() => {
    toast.ok(t('tarefas.saved'));
    const s = (_submissions[itemId] || []).find((x) => x.id === sid);
    if (s) s.instructor_reply = reply;
  }).catch((err) => notice.internal(_err(err)));
}
function _saveGrade(sid, grade, itemId) {
  api.gradeSubmission({ id: sid, grade: grade }).then(() => {
    toast.ok(t('tarefas.saved'));
    const s = (_submissions[itemId] || []).find((x) => x.id === sid);
    if (s) s.grade = grade;
    _renderSubmissions(itemId);
  }).catch((err) => notice.internal(_err(err)));
}

function _deleteSubmission(sid, itemId) {
  _openConfirmSimple(t('tarefas.confirm_delete_answer'), () => {
    api.deleteSubmission({ id: sid }).then(() => {
      toast.ok(t('tarefas.answer_deleted'));
      _loadSubmissions(itemId);
    }).catch((err) => notice.internal(_err(err)));
  });
}

function _openConfirmSimple(message, onConfirm) {
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<p style="margin:0 0 1.2rem;font-size:0.9rem;color:var(--text-primary)">' + _esc(message) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger-solid" data-act="ok">' + t('content.delete') + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => { closeModal(bd); onConfirm(); });
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
  if (!_client || !_turma) { toast.err(t('tarefas.select_turma_first')); return; }
  const html =
    '<div class="cdx-modal cdx-modal--lg">' +
      '<div class="cdx-modal-title">' + t('tarefas.new_title') + '</div>' +
      '<div class="cdx-field"><label>' + t('editor.title_label') + '</label>' +
        '<input type="text" data-fld="title" placeholder="' + _esc(t('tarefas.new_title_placeholder')) + '"></div>' +
      // Aula-locked embed: the aula is fixed by the hub, so carry it hidden instead
      // of asking again. Standalone: the optional aula-number field shows.
      (_lockedAula != null
        ? '<input type="hidden" data-fld="aula" value="' + _esc(String(_lockedAula)) + '">'
        : '<div class="cdx-field"><label>' + t('tarefas.aula_optional') + '</label>' +
            '<input type="number" data-fld="aula" placeholder="' + _esc(t('tarefas.aula_placeholder')) + '"></div>') +
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
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', function () {
    const title = bd.querySelector('[data-fld="title"]').value.trim();
    const body = bd.querySelector('[data-fld="body"]').value;
    const aula = bd.querySelector('[data-fld="aula"]').value.trim();
    const anon = bd.querySelector('[data-fld="anon"]').checked;
    if (!title) { toast.err(t('editor.title_required')); return; }
    const meta = { allow_anonymous: anon, field_type: 'text' };
    const base = { client_slug: _client, turma_slug: _turma };
    api.createItem({ type: 'tarefa', title, body_md: body, meta_json: JSON.stringify(meta) }).then((res) => {
      const item = res && res.item;
      return relApi.release(Object.assign({ item_id: item.id }, base)).then(() => {
        if (aula) return relApi.setAula(Object.assign({ item_id: item.id, aula_number_or_null: parseInt(aula, 10) }, base));
      });
    }).then(() => {
      closeModal(bd);
      toast.ok(t('tarefas.created'));
      _loadTarefas(_client, _turma);
      if (_onChange) _onChange();
    }).catch((err) => notice.internal(_err(err)));
  });
}

// ══ t1b aula-locked pane: instance cards + inline editor + bank-add ═════════════
// The aula hub gives us the aula list|detail; this renders the Tarefas sub-pane: a
// reveal hint, the ＋Adicionar inline block (bank with sections+drag | reusable editor),
// and the instance cards. A card expands inline to its editor + the turma's answers
// (reply/grade reused from Fatia 1). No local copy, every save lands in the bank.

function _renderLockedPane() {
  const host = _q('cdx-t1b-pane');
  if (!host) return;
  host.innerHTML =
    _revealBarHtml() +
    '<div class="cdx-t1b-addbar">' +
      '<button class="cdx-btn cdx-btn-sm' + (_adding ? '' : ' cdx-btn-primary') + ' cdx-t1b-addbtn" id="cdx-t1b-addbtn">' +
        (_adding ? '✕ ' + _esc(t('content.cancel')) : _esc(t('tarefas.add_btn'))) + '</button>' +
    '</div>' +
    '<div class="cdx-t1b-add" id="cdx-t1b-add"></div>' +
    '<div class="cdx-t1b-cards" id="cdx-t1b-cards">' + _lockedCardsHtml() + '</div>';
  const addBtn = _q('cdx-t1b-addbtn');
  if (addBtn) addBtn.addEventListener('click', _toggleAdd);
  _wireLockedCards();
  if (_adding) _renderAddBlock();
  // Prefetch answer counts so the badges are accurate and the "Retirar" button can gate
  // on zero-answers before the card is ever opened.
  _items.forEach((it) => _prefetchLockedCount(it.id));
}

function _prefetchLockedCount(itemId) {
  api.listSubmissions({ item_id: itemId, client_slug: _client, turma_slug: _turma }).then((res) => {
    _submissions[itemId] = (res && res.submissions) || [];
    _updateLockedCount(itemId);
  }).catch(() => { /* count stays 0; the remove click re-checks server-side */ });
}
function _updateLockedCount(itemId) {
  const card = _viewEl && _viewEl.querySelector('.cdx-t1b-card[data-card="' + itemId + '"]');
  if (!card) return;
  const n = (_submissions[itemId] || []).length;
  const countEl = card.querySelector('.cdx-t1b-ccount');
  if (countEl) countEl.textContent = n + ' ' + _plural(n, t('tarefas.answer_one'), t('tarefas.answer_many'));
  const rm = card.querySelector('.cdx-t1b-remove');
  if (rm) { rm.disabled = n > 0; if (n > 0) rm.title = t('tarefas.remove_has_answers'); }
}

function _revealBarHtml() {
  if (!_revealOn) return '';
  return '<div class="cdx-t1b-revbar">' + glyphSvg('clock', { size: 15 }) + '<span>' + _esc(t('tarefas.reveal_hint')) + '</span></div>';
}
function _revealBadgeHtml() {
  if (!_revealOn) return '';
  return _aulaHappened
    ? '<span class="cdx-t1b-badge is-avail">✓ ' + _esc(t('tarefas.reveal_available')) + '</span>'
    : '<span class="cdx-t1b-badge is-held">⏳ ' + _esc(t('tarefas.reveal_held')) + '</span>';
}

function _lockedCardsHtml() {
  if (!_items.length) return '<div class="cdx-empty">' + t('tarefas.empty_aula') + '</div>';
  return _items.map(_lockedCardHtml).join('');
}
function _lockedCardHtml(item) {
  const open = Number(item.id) === Number(_selectedId);
  const editing = Number(item.id) === Number(_editCard);
  const subCount = (_submissions[item.id] && _submissions[item.id].length) || 0;
  const flags = _flags[item.id] || {};
  const fromBank = item.tarefa_section_id != null;
  const tag = fromBank
    ? '<span class="cdx-t1b-tag">' + _esc(t('tarefas.from_bank')) + '</span>'
    : '<span class="cdx-t1b-tag is-avulsa">' + _esc(t('tarefas.avulsa')) + '</span>';
  return '<div class="cdx-t1b-card' + (open ? ' is-open' : '') + '" data-card="' + _esc(item.id) + '">' +
    '<div class="cdx-t1b-chead" data-card-head="' + _esc(item.id) + '">' +
      '<span class="cdx-t1b-cname">' + _esc(item.title) + '</span>' + _revealBadgeHtml() + tag +
      '<span class="cdx-t1b-ccount" data-count="' + _esc(item.id) + '">' + subCount + ' ' +
        _plural(subCount, t('tarefas.answer_one'), t('tarefas.answer_many')) + '</span>' +
      '<div class="cdx-t1b-toggles">' +
        _flagToggleHtml('reply', flags.reply_enabled, t('tarefas.reply_toggle')) +
        _flagToggleHtml('grade', flags.grade_enabled, t('tarefas.grade_toggle')) +
      '</div>' +
      '<button class="cdx-btn cdx-btn-sm cdx-t1b-edit' + (editing ? ' is-on' : '') + '" data-edit="' + _esc(item.id) + '">' +
        '✎ ' + _esc(editing ? t('tarefas.close_editor') : t('tarefas.edit_btn')) + '</button>' +
      '<span class="cdx-t1b-caret">▸</span>' +
    '</div>' +
    '<div class="cdx-t1b-cbody' + (open ? '' : ' is-hidden') + '">' +
      (editing ? '<div class="cdx-t1b-card-editor" data-card-editor="' + _esc(item.id) + '"></div>' : '') +
      '<div class="cdx-t1b-cbody-bar">' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-t1b-remove"' + (subCount > 0 ? ' disabled title="' + _esc(t('tarefas.remove_has_answers')) + '"' : '') + '>' +
          _esc(t('tarefas.remove_from_turma')) + '</button>' +
      '</div>' +
      '<div class="cdx-t1b-answers" data-card="' + _esc(item.id) + '"><div class="cdx-empty">' + t('tarefas.loading_answers') + '</div></div>' +
    '</div>' +
  '</div>';
}

// Delegated click handling so a single card can be repainted without re-wiring, and view
// interactions (expand / edit / flag / remove) never rebuild the whole pane. Clicks inside
// the answers list or the inline editor have their own wiring and are ignored here.
function _wireLockedCards() {
  const cards = _q('cdx-t1b-cards');
  if (!cards) return;
  cards.addEventListener('click', _onCardsClick);
}
function _onCardsClick(e) {
  if (e.target.closest('.cdx-t1b-answers') || e.target.closest('.cdx-t1b-card-editor')) return;
  const card = e.target.closest('.cdx-t1b-card');
  if (!card) return;
  const id = Number(card.dataset.card);
  const flag = e.target.closest('.cdx-resp-flag');
  if (flag) { e.stopPropagation(); _toggleFlag(id, flag.dataset.flag); return; }
  if (e.target.closest('.cdx-t1b-edit')) { e.stopPropagation(); _toggleEdit(id); return; }
  if (e.target.closest('.cdx-t1b-remove')) { e.stopPropagation(); _removeFromTurma(id); return; }
  if (e.target.closest('.cdx-t1b-chead')) _toggleCard(id);
}

// Expand/collapse a card in place (no pane rebuild); answers load lazily on first open.
function _toggleCard(id) {
  const card = _viewEl && _viewEl.querySelector('.cdx-t1b-card[data-card="' + id + '"]');
  if (!card) return;
  const body = card.querySelector('.cdx-t1b-cbody');
  if (card.classList.contains('is-open')) {
    _selectedId = null; _editCard = null;
    card.classList.remove('is-open');
    if (body) body.classList.add('is-hidden');
    const ed = card.querySelector('.cdx-t1b-card-editor'); if (ed) ed.remove();
    const eb = card.querySelector('.cdx-t1b-edit'); if (eb) { eb.classList.remove('is-on'); eb.innerHTML = '✎ ' + _esc(t('tarefas.edit_btn')); }
  } else {
    _selectedId = id;
    card.classList.add('is-open');
    if (body) body.classList.remove('is-hidden');
    _loadSubmissions(id);
  }
}
// Open/close the inline editor inside a card, injected into the existing DOM.
function _toggleEdit(id) {
  const card = _viewEl && _viewEl.querySelector('.cdx-t1b-card[data-card="' + id + '"]');
  if (!card) return;
  if (!card.classList.contains('is-open')) _toggleCard(id);
  const body = card.querySelector('.cdx-t1b-cbody');
  const btn = card.querySelector('.cdx-t1b-edit');
  let ed = body && body.querySelector('.cdx-t1b-card-editor');
  if (ed) {
    ed.remove(); _editCard = null;
    if (btn) { btn.classList.remove('is-on'); btn.innerHTML = '✎ ' + _esc(t('tarefas.edit_btn')); }
  } else if (body) {
    _editCard = id;
    ed = document.createElement('div');
    ed.className = 'cdx-t1b-card-editor';
    ed.dataset.cardEditor = String(id);
    body.insertBefore(ed, body.firstChild);
    if (btn) { btn.classList.add('is-on'); btn.innerHTML = '✎ ' + _esc(t('tarefas.close_editor')); }
    api.getItem({ id }).then((res) => { if (Number(_editCard) === Number(id)) _renderCardEditor((res && res.item) || {}); }).catch((e) => notice.internal(_err(e)));
  }
}
// Repaint ONE card's node in place (title/count/badge changed), preserving open/edit state.
function _repaintCard(itemId) {
  const card = _viewEl && _viewEl.querySelector('.cdx-t1b-card[data-card="' + itemId + '"]');
  const item = _items.find((i) => Number(i.id) === Number(itemId));
  if (!card || !item) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _lockedCardHtml(item);
  const fresh = tmp.firstElementChild;
  if (!fresh) return;
  card.replaceWith(fresh);
  _updateLockedCount(itemId);
  if (Number(_selectedId) === Number(itemId)) _loadSubmissions(itemId);
  if (Number(_editCard) === Number(itemId)) _toggleEdit(itemId);
}

function _removeFromTurma(id) {
  // Gate server-side (the prefetched count can be stale if the fetch failed): only a tarefa
  // with zero answers can be taken out of the turma.
  api.listSubmissions({ item_id: id, client_slug: _client, turma_slug: _turma }).then((res) => {
    if (((res && res.submissions) || []).length > 0) { toast.err(t('tarefas.remove_has_answers')); return; }
    const item = _items.find((i) => Number(i.id) === Number(id)) || {};
    const html = '<div class="cdx-modal cdx-modal--md">' +
      '<div class="cdx-modal-title">' + t('tarefas.remove_title') + '</div>' +
      '<p style="font-size:0.88rem;color:var(--text-secondary)">' + t('tarefas.remove_warning') + '</p>' +
      '<p class="cdx-tarefa-delete-quote">' + _esc(item.title || '') + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger-solid" data-act="ok">' + t('tarefas.remove_from_turma') + '</button>' +
      '</div></div>';
    const bd = openModal(html);
    bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
    bd.querySelector('[data-act="ok"]').addEventListener('click', () => {
      relApi.unrelease({ item_id: id, client_slug: _client, turma_slug: _turma }).then(() => {
        closeModal(bd); toast.ok(t('tarefas.removed'));
        _selectedId = null; _editCard = null;
        _loadTarefas(_client, _turma);
        if (_onChange) _onChange();
      }).catch((err) => notice.internal(_err(err)));
    });
  }).catch((e) => notice.internal(_err(e)));
}

// The field-type chips + anonymous toggle, shared by the card editor and the add editor
// (injected as the editor's `extra` slot so the reusable editor stays generic).
function _fieldExtraHtml(meta) {
  const fieldType = (meta && meta.field_type) || 'text';
  const allowAnon = !!(meta && meta.allow_anonymous);
  const chips = _fields().map((f) => {
    const cls = 'cdx-field-chip-btn' + (f.slug === fieldType ? ' is-active' : '') + (f.disabled ? ' is-disabled' : '');
    const future = f.disabled ? '<span class="cdx-field-future">' + t('tarefas.field_future') + '</span>' : '';
    return '<button type="button" class="' + cls + '" data-slug="' + _esc(f.slug) + '"' + (f.disabled ? ' disabled' : '') + '>' + _esc(f.label) + future + '</button>';
  }).join('');
  return '<div class="cdx-field"><label>' + t('tarefas.field_type_label') + '</label>' +
      '<div class="cdx-field-chips">' + chips + '</div></div>' +
    '<label class="cdx-toggle-label">' +
      '<span class="cdx-toggle"><input type="checkbox" class="cdx-tf-anon"' + (allowAnon ? ' checked' : '') + '><span class="cdx-toggle-slider"></span></span>' +
      '<span class="cdx-toggle-text">' + t('tarefas.allow_anon') + '</span></label>';
}
function _wireFieldExtra(container) {
  container.querySelectorAll('.cdx-field-chip-btn:not(.is-disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cdx-field-chip-btn').forEach((b) => { if (!b.disabled) b.classList.remove('is-active'); });
      btn.classList.add('is-active');
    });
  });
}
function _readFieldAnon(container) {
  const activeChip = container.querySelector('.cdx-field-chip-btn.is-active');
  const anonEl = container.querySelector('.cdx-tf-anon');
  return { field_type: activeChip ? activeChip.dataset.slug : 'text', allow_anonymous: !!(anonEl && anonEl.checked) };
}

// True if the editor's current values differ from `item`'s stored values (title/body/field/anon).
// Both "Sobrescrever" and "Salvar como nova" gate on this: no no-op overwrite, no identical fork.
function _editorChanged(host, item, vals) {
  const meta = parseMeta(item && item.meta_json);
  const fa = _readFieldAnon(host);
  return (vals.title || '') !== ((item && item.title) || '')
    || (vals.body || '') !== ((item && item.body_md) || '')
    || fa.field_type !== (meta.field_type || 'text')
    || !!fa.allow_anonymous !== !!meta.allow_anonymous;
}

// Inline editor inside an instance card: edits ALWAYS land in the bank (no local copy).
// Sobrescrever updates the bank item (reflects everywhere it's used); Salvar como nova
// forks a new bank item. Neither touches the aula binding.
function _renderCardEditor(item) {
  const host = _viewEl && _viewEl.querySelector('[data-card-editor="' + item.id + '"]');
  if (!host) return;
  const meta = parseMeta(item.meta_json);
  host.innerHTML = renderEditor({
    head: t('tarefas.edit_title'),
    titleLabel: t('editor.title_label'), bodyLabel: t('tarefas.instructions_label'),
    title: item.title, body: item.body_md || '',
    extra: _fieldExtraHtml(meta),
    buttons: [
      { key: 'overwrite', label: t('tarefas.save_overwrite'), primary: true },
      { key: 'new', label: t('tarefas.save_as_new') },
    ],
  });
  _wireFieldExtra(host);
  wireEditor(host, {
    overwrite: (vals) => _overwriteCardItem(item, vals, host),
    new: (vals) => _saveAsNew(vals, host, item),
  });
}
function _overwriteCardItem(item, vals, host) {
  if (!vals.title) { toast.err(t('editor.title_required')); return; }
  if (!_editorChanged(host, item, vals)) { toast.info(t('tarefas.no_changes')); return; }
  const fa = _readFieldAnon(host);
  const meta = parseMeta(item.meta_json);
  meta.field_type = fa.field_type; meta.allow_anonymous = fa.allow_anonymous;
  api.updateItem({ id: item.id, title: vals.title, body_md: vals.body, meta_json: JSON.stringify(meta) }).then(() => {
    toast.ok(t('tarefas.updated'));
    item.title = vals.title; item.body_md = vals.body; item.meta_json = JSON.stringify(meta);
    const lib = _items.find((i) => Number(i.id) === Number(item.id));
    if (lib) { lib.title = vals.title; lib.meta_json = item.meta_json; }
    _editCard = null;
    _repaintCard(item.id);
  }).catch((err) => notice.internal(_err(err)));
}

// ── ＋Adicionar: the inline add block (bank with sections+drag | reusable editor) ──
// Toggling shows/hides just the add block; the cards below are untouched.
function _toggleAdd() {
  _adding = !_adding; _addSel = null;
  const btn = _q('cdx-t1b-addbtn');
  if (btn) { btn.classList.toggle('cdx-btn-primary', !_adding); btn.innerHTML = _adding ? ('✕ ' + _esc(t('content.cancel'))) : _esc(t('tarefas.add_btn')); }
  const add = _q('cdx-t1b-add');
  if (_adding) _renderAddBlock();
  else if (add) add.innerHTML = '';
}

function _loadBank() {
  return Promise.all([api.listItems({ type: 'tarefa' }), api.listTarefaSections({})]).then((res) => {
    _bankItems = ((res[0] && res[0].items) || []).filter((i) => i.type === 'tarefa');
    _bankSections = (res[1] && res[1].sections) || [];
    _bankLoaded = true;
  });
}

function _renderAddBlock() {
  const host = _q('cdx-t1b-add');
  if (!host) return;
  if (!_bankLoaded) {
    host.innerHTML = '<div class="cdx-t1b-addwrap"><div class="cdx-empty">' + t('content.loading') + '</div></div>';
    _loadBank().then(() => { if (_adding) _renderAddBlock(); }).catch((e) => notice.internal(_err(e)));
    return;
  }
  host.innerHTML =
    '<div class="cdx-t1b-addwrap"><div class="cdx-t1b-wb">' +
      _bankPanelHtml() +
      '<div class="cdx-t1b-addeditor" id="cdx-t1b-addeditor">' + _addEditorHtml() + '</div>' +
    '</div></div>';
  _wireBankPanel();
  _wireAddEditor();
}

function _bankPanelHtml() {
  const bySection = {};
  const ungrouped = [];
  _bankItems.forEach((it) => {
    if (it.tarefa_section_id != null) (bySection[it.tarefa_section_id] = bySection[it.tarefa_section_id] || []).push(it);
    else ungrouped.push(it);
  });
  const secHtml = _bankSections.map((s) => _bankSectionHtml(s.id, s.name, bySection[s.id] || [])).join('');
  const ungHtml = ungrouped.length ? _bankSectionHtml(null, t('tarefas.no_section'), ungrouped) : '';
  return '<div class="cdx-t1b-wbank">' +
    '<div class="cdx-t1b-wbh"><span>' + _esc(t('tarefas.bank_title')) + '</span>' +
      '<span class="cdx-t1b-wb-new" id="cdx-t1b-new">＋ ' + _esc(t('tarefas.new_short')) + '</span></div>' +
    '<input class="cdx-input cdx-t1b-srch" placeholder="' + _esc(t('tarefas.bank_search')) + '">' +
    '<div class="cdx-t1b-secs">' + (secHtml + ungHtml || '<div class="cdx-empty">' + t('tarefas.bank_empty') + '</div>') + '</div>' +
    '<div class="cdx-t1b-addsec" id="cdx-t1b-addsec">＋ ' + _esc(t('tarefas.add_section')) + '</div>' +
  '</div>';
}
function _bankSectionHtml(secId, name, items) {
  const rows = items.map((it) => {
    const sel = (_addSel && _addSel.kind === 'bank' && Number(_addSel.id) === Number(it.id)) ? ' is-sel' : '';
    const released = _turmaReleasedIds.has(Number(it.id));
    const relBadge = released
      ? '<span class="cdx-t1b-tag is-released" title="' + _esc(t('tarefas.bank_released_hint')) + '">' + _esc(t('tarefas.bank_released_badge')) + '</span>'
      : '';
    return '<div class="cdx-t1b-brow' + sel + (released ? ' is-released' : '') + '" draggable="true" data-bank="' + _esc(it.id) + '">' +
      '<span class="cdx-t1b-grip">⠿</span><span class="cdx-t1b-bname">' + _esc(it.title) + '</span>' + relBadge + '</div>';
  }).join('');
  // Real sections get rename/delete affordances; the synthetic "Sem seção" group (secId null) does not.
  const acts = (secId != null)
    ? '<span class="cdx-t1b-secacts">' +
        '<button type="button" class="cdx-t1b-secedit" data-sec-edit="' + _esc(secId) + '" title="' + _esc(t('tarefas.section_rename')) + '">✎</button>' +
        '<button type="button" class="cdx-t1b-secdel" data-sec-del="' + _esc(secId) + '" title="' + _esc(t('tarefas.section_delete')) + '">🗑</button>' +
      '</span>'
    : '';
  return '<div class="cdx-t1b-sec is-open" data-sec="' + _esc(secId == null ? '' : secId) + '" data-secname="' + _esc(name) + '">' +
    '<div class="cdx-t1b-sechd"><span class="cdx-t1b-seccar">▸</span><span class="cdx-t1b-secname">' + _esc(name) + '</span>' +
      '<span class="cdx-t1b-secn">' + items.length + '</span>' + acts + '</div>' +
    '<div class="cdx-t1b-secrows">' + rows + '</div>' +
  '</div>';
}

function _wireBankPanel() {
  const host = _q('cdx-t1b-add');
  if (!host) return;
  host.querySelectorAll('.cdx-t1b-sechd').forEach((hd) => hd.addEventListener('click', (e) => {
    if (e.target.closest('.cdx-t1b-secedit') || e.target.closest('.cdx-t1b-secdel')) return;
    hd.parentElement.classList.toggle('is-open');
  }));
  host.querySelectorAll('.cdx-t1b-secedit').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const sec = b.closest('.cdx-t1b-sec');
    _renameSection(Number(b.dataset.secEdit), sec ? sec.dataset.secname : '');
  }));
  host.querySelectorAll('.cdx-t1b-secdel').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const sec = b.closest('.cdx-t1b-sec');
    _deleteSection(Number(b.dataset.secDel), sec ? sec.dataset.secname : '');
  }));
  host.querySelectorAll('.cdx-t1b-brow').forEach((row) => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.bank);
      _addSel = { kind: 'bank', id: id, item: null };
      api.getItem({ id }).then((res) => {
        if (_addSel && _addSel.kind === 'bank' && _addSel.id === id) { _addSel.item = (res && res.item) || {}; _renderAddBlock(); }
      }).catch((e) => notice.internal(_err(e)));
      _renderAddBlock();
    });
  });
  const newBtn = host.querySelector('#cdx-t1b-new');
  if (newBtn) newBtn.addEventListener('click', () => { _addSel = { kind: 'new' }; _renderAddBlock(); });
  const addSec = host.querySelector('#cdx-t1b-addsec');
  if (addSec) addSec.addEventListener('click', _createSection);
  const srch = host.querySelector('.cdx-t1b-srch');
  if (srch) srch.addEventListener('input', () => {
    const qq = (srch.value || '').toLowerCase().trim();
    host.querySelectorAll('.cdx-t1b-brow').forEach((r) => {
      const nm = ((r.querySelector('.cdx-t1b-bname') || {}).textContent || '').toLowerCase();
      r.style.display = (!qq || nm.indexOf(qq) !== -1) ? '' : 'none';
    });
  });
  _wireBankDrag(host);
}

function _wireBankDrag(host) {
  let dragId = null;
  host.querySelectorAll('.cdx-t1b-brow').forEach((row) => {
    row.addEventListener('dragstart', () => { dragId = Number(row.dataset.bank); row.classList.add('is-dragging'); });
    row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); dragId = null; });
    row.addEventListener('dragover', (e) => e.preventDefault());
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = Number(row.dataset.bank);
      if (!dragId || dragId === target) return;
      const sec = row.closest('.cdx-t1b-sec');
      _moveBankItem(dragId, sec && sec.dataset.sec ? Number(sec.dataset.sec) : null, target);
    });
  });
  host.querySelectorAll('.cdx-t1b-sec').forEach((sec) => {
    sec.addEventListener('dragover', (e) => e.preventDefault());
    sec.addEventListener('drop', (e) => {
      if (e.target.closest('.cdx-t1b-brow')) return;
      e.preventDefault();
      if (!dragId) return;
      _moveBankItem(dragId, sec.dataset.sec ? Number(sec.dataset.sec) : null, null);
    });
  });
}
function _moveBankItem(itemId, sectionId, beforeId) {
  let position = null;
  if (beforeId != null) {
    const sibs = _bankItems.filter((i) => Number(i.tarefa_section_id || 0) === Number(sectionId || 0) && i.id !== itemId);
    const idx = sibs.findIndex((i) => i.id === beforeId);
    if (idx >= 0) position = idx;
  }
  api.setItemSection({ item_id: itemId, section_id: sectionId, position: position })
    .then(() => _loadBank()).then(() => { if (_adding) _renderAddBlock(); })
    .catch((e) => notice.internal(_err(e)));
}
function _createSection() {
  _openPrompt(t('tarefas.section_name_prompt'), '', (name) => {
    if (!name) return;
    api.createTarefaSection({ name: name }).then(() => _loadBank()).then(() => { if (_adding) _renderAddBlock(); })
      .catch((e) => notice.internal(_err(e)));
  });
}

function _addEditorHtml() {
  if (!_addSel) return '<div class="cdx-empty cdx-t1b-addhint">' + t('tarefas.add_choose') + '</div>';
  if (_addSel.kind === 'new') {
    // Bank-only page has no aula to release into, so drop "Salvar e incluir na aula".
    const buttons = _bankOnly
      ? [{ key: 'save', label: t('tarefas.save_to_bank'), primary: true }]
      : [{ key: 'save', label: t('tarefas.save_to_bank') },
         { key: 'saveInclude', label: t('tarefas.save_and_include'), primary: true }];
    return renderEditor({
      head: t('tarefas.new_title'),
      titleLabel: t('editor.title_label'), bodyLabel: t('tarefas.instructions_label'),
      title: '', body: '', extra: _fieldExtraHtml({}),
      buttons: buttons,
    });
  }
  const tmpl = _addSel.item || _bankItems.find((i) => i.id === _addSel.id) || {};
  // Bank-only page: no "Usar como está" (that releases into an aula); just overwrite / fork / delete.
  const buttons = _bankOnly
    ? [{ key: 'overwrite', label: t('tarefas.save_overwrite'), primary: true },
       { key: 'new', label: t('tarefas.save_as_new') }]
    : [{ key: 'include', label: t('tarefas.use_as_is'), primary: true },
       { key: 'overwrite', label: t('tarefas.save_overwrite') },
       { key: 'new', label: t('tarefas.save_as_new') }];
  return renderEditor({
    head: _bankOnly ? t('tarefas.edit_title') : t('tarefas.adapt').replace('{name}', tmpl.title || ''),
    headExtra: '<button type="button" class="cdx-t1b-delbank" data-delbank="' + _esc(tmpl.id) + '">🗑 ' + _esc(t('tarefas.delete_bank_btn')) + '</button>',
    titleLabel: t('editor.title_label'), bodyLabel: t('tarefas.instructions_label'),
    title: tmpl.title || '', body: tmpl.body_md || '',
    extra: _fieldExtraHtml(parseMeta(tmpl.meta_json)),
    buttons: buttons,
  });
}
function _wireAddEditor() {
  const ed = _q('cdx-t1b-addeditor');
  if (!ed) return;
  _wireFieldExtra(ed);
  const del = ed.querySelector('.cdx-t1b-delbank');
  if (del) del.addEventListener('click', () => _deleteFromBank(Number(del.dataset.delbank)));
  if (!_addSel) return;
  if (_addSel.kind === 'new') {
    wireEditor(ed, {
      save: (vals) => _createToBank(vals, ed, false),
      saveInclude: (vals) => _createToBank(vals, ed, true),
    });
  } else {
    const tmpl = _addSel.item || _bankItems.find((i) => i.id === _addSel.id) || {};
    wireEditor(ed, {
      include: () => _includeInAula(tmpl.id),
      overwrite: (vals) => _overwriteInBank(tmpl, vals, ed),
      new: (vals) => _saveAsNew(vals, ed, tmpl),
    });
  }
}

// Bank ≠ aula. Saves land in the bank only; "Incluir na aula" is the sole release action.
function _afterAdd() {
  _adding = false; _addSel = null;
  _loadTarefas(_client, _turma);
  if (_onChange) _onChange();
}
function _refreshBank() { return _loadBank().then(() => { if (_adding) _renderAddBlock(); }); }

function _includeInAula(itemId) {
  const base = { client_slug: _client, turma_slug: _turma };
  relApi.release(Object.assign({ item_id: itemId }, base))
    .then(() => relApi.setAula(Object.assign({ item_id: itemId, aula_number_or_null: Number(_lockedAula) }, base)))
    .then(() => { toast.ok(t('tarefas.added')); _afterAdd(); })
    .catch((err) => {
      if (/already released/i.test((err && err.message) || '')) { toast.info(t('tarefas.already_in_aula')); _afterAdd(); return; }
      notice.internal(_err(err));
    });
}
function _createToBank(vals, ed, include) {
  if (!vals.title) { toast.err(t('editor.title_required')); return; }
  const fa = _readFieldAnon(ed);
  const meta = { allow_anonymous: fa.allow_anonymous, field_type: fa.field_type };
  api.createItem({ type: 'tarefa', title: vals.title, body_md: vals.body, meta_json: JSON.stringify(meta) })
    .then((res) => {
      const id = res && res.item && res.item.id;
      if (include) { _includeInAula(id); return; }
      toast.ok(t('tarefas.saved_to_bank'));
      _addSel = { kind: 'bank', id: id, item: res.item };
      _refreshBank();
    }).catch((err) => notice.internal(_err(err)));
}
function _overwriteInBank(tmpl, vals, ed) {
  if (!vals.title) { toast.err(t('editor.title_required')); return; }
  if (!_editorChanged(ed, tmpl, vals)) { toast.info(t('tarefas.no_changes')); return; }
  const fa = _readFieldAnon(ed);
  const meta = parseMeta(tmpl.meta_json);
  meta.field_type = fa.field_type; meta.allow_anonymous = fa.allow_anonymous;
  api.updateItem({ id: tmpl.id, title: vals.title, body_md: vals.body, meta_json: JSON.stringify(meta) })
    .then(() => {
      toast.ok(t('tarefas.updated'));
      const lib = _items.find((i) => Number(i.id) === Number(tmpl.id));
      if (lib) { lib.title = vals.title; lib.meta_json = JSON.stringify(meta); _repaintCard(tmpl.id); }
      if (_addSel && _addSel.item) { _addSel.item.title = vals.title; _addSel.item.body_md = vals.body; _addSel.item.meta_json = JSON.stringify(meta); }
      _refreshBank();
    }).catch((err) => notice.internal(_err(err)));
}
function _saveAsNew(vals, ed, src) {
  if (!vals.title) { toast.err(t('editor.title_required')); return; }
  // A fork identical to its source is a pointless duplicate: only save as new when something changed.
  if (src && !_editorChanged(ed, src, vals)) { toast.info(t('tarefas.no_changes_fork')); return; }
  const fa = _readFieldAnon(ed);
  const meta = { allow_anonymous: fa.allow_anonymous, field_type: fa.field_type };
  api.createItem({ type: 'tarefa', title: vals.title, body_md: vals.body, meta_json: JSON.stringify(meta) })
    .then((res) => {
      toast.ok(t('tarefas.saved_as_new'));
      // switch selection to the fork so the next click can include it; if we forked from a
      // card editor there is no add block open, and _refreshBank is a no-op there.
      _addSel = { kind: 'bank', id: res.item.id, item: res.item };
      _refreshBank();
    }).catch((err) => notice.internal(_err(err)));
}

function _deleteFromBank(itemId) {
  const it = _bankItems.find((i) => Number(i.id) === Number(itemId)) || (_addSel && _addSel.item) || {};
  // Guard: a tarefa still released to any turma cannot be deleted from the bank, that would wipe
  // it (and its answers) from every turma. Make the user unrelease it first; ctDeleteItem enforces
  // the same rule server-side as a backstop.
  api.listItemTurmas({ item_id: itemId }).then((res) => {
    const released = ((res && res.turmas) || []).filter((e) => e.turma_status !== 'archived');
    if (released.length) {
      _openReleasedBlock(it.title || '', released.map((e) => e.client_display_name + ' · ' + e.turma_display_name));
      return;
    }
    _openTitleConfirm(it.title || '', () => {
      api.deleteItem({ id: itemId }).then(() => {
        toast.ok(t('tarefas.deleted_from_bank'));
        _addSel = null;
        _refreshBank();
        if (_items.some((i) => Number(i.id) === Number(itemId))) _loadTarefas(_client, _turma);
      }).catch((err) => {
        if (/item_released/i.test((err && err.message) || '')) { notice.warn(t('tarefas.delete_bank_blocked_generic')); _refreshBank(); return; }
        notice.internal(_err(err));
      });
    });
  }).catch((err) => notice.internal(_err(err)));
}

// Blocking notice when the tarefa is still released: list the turmas and tell the user to remove
// it from each first. No delete path here, that is the whole point of the guard.
function _openReleasedBlock(title, turmaLabels) {
  const list = turmaLabels.map((l) => '<li>' + _esc(l) + '</li>').join('');
  const html = '<div class="cdx-modal cdx-modal--lg">' +
    '<div class="cdx-modal-title">' + t('tarefas.delete_bank_blocked_title') + '</div>' +
    '<p style="font-size:0.88rem;color:var(--text-secondary)">' + t('tarefas.delete_bank_blocked_body') + '</p>' +
    '<p class="cdx-tarefa-delete-quote">' + _esc(title) + '</p>' +
    '<ul class="cdx-tarefa-blocked-list">' + list + '</ul>' +
    '<div class="cdx-modal-actions">' +
      '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + t('tarefas.blocked_ok') + '</button>' +
    '</div></div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => closeModal(bd));
}
function _renameSection(secId, curName) {
  _openPrompt(t('tarefas.section_rename_prompt'), curName || '', (name) => {
    if (!name || name === curName) return;
    api.renameTarefaSection({ id: secId, name: name }).then(() => _refreshBank()).catch((e) => notice.internal(_err(e)));
  });
}
function _deleteSection(secId, name) {
  const html = '<div class="cdx-modal cdx-modal--md">' +
    '<div class="cdx-modal-title">' + t('tarefas.section_delete_title') + '</div>' +
    '<p style="font-size:0.88rem;color:var(--text-secondary)">' + t('tarefas.section_delete_warning') + '</p>' +
    '<p class="cdx-tarefa-delete-quote">' + _esc(name || '') + '</p>' +
    '<div class="cdx-modal-actions">' +
      '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
      '<button class="cdx-btn cdx-btn-danger-solid" data-act="ok">' + t('content.delete') + '</button>' +
    '</div></div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => {
    api.deleteTarefaSection({ id: secId }).then(() => { closeModal(bd); _refreshBank(); }).catch((e) => notice.internal(_err(e)));
  });
}

// Delete-from-bank guard: retype the tarefa title (case-insensitive) to confirm, since it
// removes the tarefa from EVERY turma, not just this one.
function _openTitleConfirm(title, onOk) {
  const html = '<div class="cdx-modal cdx-modal--lg">' +
    '<div class="cdx-modal-title">' + t('tarefas.delete_bank_title') + '</div>' +
    '<p style="font-size:0.88rem;color:var(--text-secondary)">' + t('tarefas.delete_bank_warning') + '</p>' +
    '<p class="cdx-tarefa-delete-quote">' + _esc(title) + '</p>' +
    '<div class="cdx-field"><label>' + t('tarefas.delete_bank_confirm_label') + '</label>' +
      '<input type="text" class="cdx-input cdx-confirm-input" placeholder="' + _esc(title) + '"></div>' +
    '<div class="cdx-modal-actions">' +
      '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
      '<button class="cdx-btn cdx-btn-danger-solid" data-act="ok" disabled>' + t('tarefas.delete_bank_btn') + '</button>' +
    '</div></div>';
  const bd = openModal(html);
  const input = bd.querySelector('.cdx-confirm-input');
  const okBtn = bd.querySelector('[data-act="ok"]');
  const match = () => input.value.trim().toLowerCase() === String(title).trim().toLowerCase();
  input.addEventListener('input', () => { okBtn.disabled = !match(); });
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  okBtn.addEventListener('click', () => { if (okBtn.disabled || !match()) return; closeModal(bd); onOk(); });
}

function _openPrompt(label, initial, onOk) {
  const html = '<div class="cdx-modal cdx-modal--sm">' +
    '<div class="cdx-modal-title">' + _esc(label) + '</div>' +
    '<div class="cdx-field"><input type="text" class="cdx-prompt-input" value="' + _esc(initial || '') + '"></div>' +
    '<div class="cdx-modal-actions">' +
      '<button class="cdx-btn" data-act="cancel">' + t('content.cancel') + '</button>' +
      '<button class="cdx-btn cdx-btn-primary" data-act="ok">' + t('content.save') + '</button>' +
    '</div></div>';
  const bd = openModal(html);
  bd.querySelector('[data-act="cancel"]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-act="ok"]').addEventListener('click', () => {
    const v = (bd.querySelector('.cdx-prompt-input').value || '').trim();
    closeModal(bd); onOk(v);
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function _renderShell() {
  // Aula-locked embed: the t1b authoring pane (cards + inline editor + bank-add). The
  // aula hub already provides the list|detail + the aula header, so this is just the pane.
  if (_lockedAula != null) {
    _viewEl.innerHTML = '<div class="cdx-tarefas cdx-tarefas--t1b"><div class="cdx-t1b-pane" id="cdx-t1b-pane"></div></div>';
    return;
  }
  const toolbar =
    '<div class="cdx-tarefas-toolbar">' +
      '<h2 class="cdx-tarefas-title">' + t('tarefas.title') + '</h2>' +
      '<button class="cdx-btn cdx-btn-primary" id="cdx-tarefa-new">' + t('tarefas.new_btn') + '</button>' +
    '</div>';
  _viewEl.innerHTML =
    '<div class="cdx-tarefas">' +
      toolbar +
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

// Bank-only page shell (Content > Tarefas sub-tab): the bank panel + reusable editor, permanently
// open. Reuses the aula pane's add block (_renderAddBlock) with _adding pinned true; the toggle
// button, instance cards, aula-release and answers all belong to the aula pane and never render here.
function _renderBankShell() {
  _viewEl.innerHTML =
    '<div class="cdx-tarefas cdx-tarefas--bank">' +
      '<div class="cdx-tarefas-toolbar"><h2 class="cdx-tarefas-title">' + t('tarefas.bank_title') + '</h2></div>' +
      '<div class="cdx-t1b-add" id="cdx-t1b-add"></div>' +
    '</div>';
  _adding = true;
  _renderAddBlock();
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx = {}) {
  _viewEl = viewEl;
  _client = null;
  _turma = null;
  _items = [];
  _itemTurmas = {};
  _turmaReleasedIds = new Set();
  _submissions = {};
  _selectedId = null;
  _cleanup = [];
  _adding = false;
  _addSel = null;
  _editCard = null;
  _bankLoaded = false;
  _bankItems = [];
  _bankSections = [];
  _bankOnly = !!ctx.bankOnly;
  _lockedAula = (ctx.aulaNumber != null && ctx.aulaNumber !== '') ? Number(ctx.aulaNumber) : null;
  _revealOn = !!ctx.revealOn;
  _aulaHappened = !!ctx.aulaHappened;
  _onChange = (typeof ctx.onChange === 'function') ? ctx.onChange : null;
  // Bank-only page (Content > Tarefas): render the always-open bank + editor, no turma/picker/split.
  if (_bankOnly) { _renderBankShell(); return; }
  _renderShell();
  // Draggable divider only in the standalone split; the t1b aula-locked pane stacks cards.
  if (_lockedAula == null) {
    installResizer(_q('cdx-tarefas-split'), { storeKey: 'cdx_rz_tarefas_split', defaultPx: 380, min: 260, max: 680 });
  }
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
  _lockedAula = null;
  _onChange = null;
  _adding = false;
  _addSel = null;
  _editCard = null;
  _bankLoaded = false;
  _bankItems = [];
  _bankSections = [];
  _bankOnly = false;
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _selectedId = null;
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => bd.parentNode && bd.parentNode.removeChild(bd));
}
