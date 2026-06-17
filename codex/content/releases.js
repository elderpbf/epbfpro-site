// content/releases.js
// Codex Content tab, Releases (Liberações) sub-tab: the aula-centric composer
// that binds library items to a turma's lessons. Native port of the legacy
// ClassTrail releases surface (ct-admin.js): cdx- styling, facade-only backend,
// every string via t(). A turma is chosen in the shared pill picker; each lesson
// is an accordion whose composer toggles which items are released to it, plus an
// "Outros" bucket for items released without a lesson.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.BSToast   (../backstage/js/bs-toast.js)   optional transient toast
import { content as contentApi, releases as api, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { aulaStatus } from '../js/aula-status.js';
import { iconHtml as typeIconHtml, glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as turmaPicker from './turma-picker.js';

const LS_CLIENT = 'ct_admin_releases_last_client';
const LS_TURMA = 'ct_admin_releases_last_turma';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _clientSlug = null;
let _turmaSlug = null;
let _aulas = [];
let _allItems = [];
let _apostilaItems = [];
let _released = [];                 // ordered array of released item ids
let _releasedMeta = {};             // { item_id: { aula_number } }
let _types = [];
let _selectedAula = null;           // selected aula id (string) or 'outros' or null
let _picker = null;
let _cleanup = [];

// ── Pure rules (exported for tests) ──────────────────────────────────────────
// Lesson date status for the composer. Returns { key, date }; key is i18n-free so
// the renderer maps it through t() in the cohorts.date_* namespace. The RULE lives
// in the shared js/aula-status.js (same one the admin Cohorts view + the Trail use);
// here we keep the legacy { key, date } shape ('undefined' -> 'tbd'). `today` is
// injected (ISO yyyy-mm-dd) so it stays deterministic under test.
export function aulaDateStatusKey(aula, today) {
  const status = aulaStatus(aula, today);
  if (status === 'happened') return { key: 'happened', date: aula.happened_on || aula.scheduled_for };
  if (status === 'rescheduled') return { key: 'rescheduled', date: aula.scheduled_for };
  if (status === 'scheduled') return { key: 'scheduled', date: aula.scheduled_for };
  return { key: 'tbd', date: null };
}

// Diff a lesson composer's checked set against current release state. Returns the
// three id lists the save needs: newly released (not released anywhere yet), move
// into this lesson (already released elsewhere), and drop out of this lesson.
export function diffAulaSelection({ released, releasedMeta, aulaNum, poolIds, selectedIds }) {
  const rel = new Set((released || []).map(Number));
  const sel = new Set((selectedIds || []).map(Number));
  const toRelease = [], toSetAula = [], toDropAula = [];
  for (const raw of (poolIds || [])) {
    const id = Number(raw);
    const wasReleased = rel.has(id);
    const wasInAula = wasReleased && String((releasedMeta[id] || {}).aula_number) === String(aulaNum);
    const isChecked = sel.has(id);
    if (isChecked && !wasInAula) {
      if (!wasReleased) toRelease.push(id); else toSetAula.push(id);
    } else if (!isChecked && wasInAula) {
      toDropAula.push(id);
    }
  }
  return { toRelease, toSetAula, toDropAula };
}

// Diff the "Outros" (no-lesson) bucket: release newly checked items, unrelease
// items unchecked that were sitting in Outros (no aula_number).
export function diffOutrosSelection({ released, releasedMeta, poolIds, selectedIds }) {
  const rel = new Set((released || []).map(Number));
  const sel = new Set((selectedIds || []).map(Number));
  const toRelease = [], toUnrelease = [];
  for (const raw of (poolIds || [])) {
    const id = Number(raw);
    const inOtros = rel.has(id) && !(releasedMeta[id] || {}).aula_number;
    if (sel.has(id) && !rel.has(id)) toRelease.push(id);
    else if (!sel.has(id) && inOtros) toUnrelease.push(id);
  }
  return { toRelease, toUnrelease };
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
function _today() { return new Date().toISOString().slice(0, 10); }
// Debug gate: the shared Backstage bs_debug flag (same flag the live-host
// in-host simulator uses). Read at render time so toggling it just needs a reload.
function _isDebug() {
  return typeof localStorage !== 'undefined' && localStorage.getItem('bs_debug') === '1';
}

// NOVO freshness, mirrored from the sealed trilha/js/freshness.js (the admin app
// cannot import across the Trail boundary). Source of truth for the 5-day window
// lives there; keep these in sync. released_at is epoch seconds or an ISO string.
const _FRESH_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
function _relMs(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v * 1000;
  const ms = Date.parse(v);
  return isFinite(ms) ? ms : 0;
}
function _aulaReleasedIds(aulaNum) {
  return _released.filter((id) => String((_releasedMeta[id] || {}).aula_number) === String(aulaNum));
}
// Is any item in this aula currently inside the NOVO window (i.e. the badge shows)?
function _aulaIsFresh(aulaNum) {
  const now = Date.now();
  return _aulaReleasedIds(aulaNum).some((id) => {
    const ts = _relMs((_releasedMeta[id] || {}).released_at);
    return ts && (now - ts) < _FRESH_WINDOW_MS;
  });
}

function _fmtDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] : iso;
}

function _typeIcon(slug) {
  const ty = _types.find((x) => x.slug === slug);
  return ty && ty.icon;
}
// Count-chip / row glyph. Apostila + outros are section pseudo-types (fixed
// glyph); real slugs (tarefa, drive_file) draw their ct_types.icon.
function _countGlyph(kind, size) {
  size = size || 13;
  if (kind === 'apostila') return glyphSvg('book', { size });
  if (kind === 'outros') return glyphSvg('layers', { size });
  return typeIconHtml(_typeIcon(kind), { size });
}

// Item-pool predicates (mirror the legacy composer's filters).
function _isTarefa(i) { return !i.set_id && i.type === 'tarefa'; }
function _isDrive(i) { return i.type === 'drive_file'; }
function _isOutros(i) { return !i.set_id && i.type !== 'conteudo' && i.type !== 'tarefa' && i.type !== 'drive_file'; }
function _isBoundTo(id, aulaNum) {
  return _released.indexOf(Number(id)) !== -1 &&
    String((_releasedMeta[id] || {}).aula_number) === String(aulaNum);
}
function _inOutros(id) {
  return _released.indexOf(Number(id)) !== -1 && !(_releasedMeta[id] || {}).aula_number;
}

// ── Load ──────────────────────────────────────────────────────────────────────
function _loadReleases(clientSlug, turmaSlug) {
  _clientSlug = clientSlug;
  _turmaSlug = turmaSlug;
  _aulas = [];
  _releasedMeta = {};
  _apostilaItems = [];
  _selectedAula = null;
  const el = _q('cdx-releases-list');
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
  const pv = _q('cdx-releases-preview');
  if (pv) pv.innerHTML = '<div class="cdx-preview-empty">' + t('releases.select') + '</div>';

  const loadApostila = contentApi.listSets().then((data) => {
    const sets = ((data && data.sets) || []).filter((s) => (s.item_count || 0) > 0);
    if (!sets.length) return;
    const current = sets[sets.length - 1];   // newest set with items (matches student view)
    return contentApi.getSet({ id: current.id }).then((res) => {
      _apostilaItems = ((res && res.items) || []).slice()
        .sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
    });
  }).catch((e) => { notice.internal(_err(e)); });

  Promise.all([
    contentApi.listItems(),
    cohortsApi.listTurmas({ client_slug: clientSlug }),
    cohortsApi.listAulas({ client_slug: clientSlug, turma_slug: turmaSlug }),
    loadApostila,
  ]).then((results) => {
    _allItems = (results[0] && results[0].items) || [];
    _aulas = (results[2] && results[2].aulas) || [];
    const turma = ((results[1] && results[1].turmas) || []).find((tu) => tu.slug === turmaSlug);
    if (!turma) {
      if (el) el.innerHTML = '<div class="cdx-empty">' + t('releases.turma_not_found') + '</div>';
      return;
    }
    return api.turmaView({ client_slug: clientSlug, turma_slug: turmaSlug, token: turma.token }).then((vd) => {
      const items = (vd && vd.items) || [];
      _released = items.map((i) => i.id);
      _releasedMeta = {};
      items.forEach((i) => { _releasedMeta[i.id] = { aula_number: i.aula_number || null, released_at: i.released_at }; });
      _renderList();
    }).catch((err) => { _released = []; _releasedMeta = {}; _renderList(); notice.internal(_err(err)); });
  }).catch((err) => {
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('releases.error_loading') + '</div>';
    notice.internal(_err(err));
  });
}

// ── Render: lesson accordion ─────────────────────────────────────────────────
function _countFor(predicate, aulaNum) {
  return _allItems.filter((i) => predicate(i) && _isBoundTo(i.id, aulaNum)).length;
}

function _aulaCountsHtml(aulaNum) {
  const apostila = _apostilaItems.filter((i) => _isBoundTo(i.id, aulaNum)).length;
  const tarefa = _countFor(_isTarefa, aulaNum);
  const outros = _countFor(_isOutros, aulaNum);
  const drive = _countFor(_isDrive, aulaNum);
  let counts = '';
  if (apostila) counts += '<span class="cdx-rel-count">' + _countGlyph('apostila') + ' ' + apostila + '</span>';
  if (tarefa) counts += '<span class="cdx-rel-count">' + _countGlyph('tarefa') + ' ' + tarefa + '</span>';
  if (outros) counts += '<span class="cdx-rel-count">' + _countGlyph('outros') + ' ' + outros + '</span>';
  if (drive) counts += '<span class="cdx-rel-count">' + _countGlyph('drive_file') + ' ' + drive + '</span>';
  return counts || '<span class="cdx-rel-count cdx-rel-count-empty">' + t('releases.empty_chip') + '</span>';
}

// Outros (no-lesson) bucket count chips, mirrors _aulaCountsHtml for the bucket.
function _outrosCountsHtml() {
  const outrosSolo = _allItems.filter((i) => _isOutros(i) && _inOutros(i.id)).length;
  const driveSolo = _allItems.filter((i) => _isDrive(i) && _inOutros(i.id)).length;
  let counts = '';
  if (outrosSolo) counts += '<span class="cdx-rel-count">' + _countGlyph('outros') + ' ' + outrosSolo + '</span>';
  if (driveSolo) counts += '<span class="cdx-rel-count">' + _countGlyph('drive_file') + ' ' + driveSolo + '</span>';
  return counts || '<span class="cdx-rel-count cdx-rel-count-empty">' + t('releases.empty_chip') + '</span>';
}

// Left list: one selectable row per aula (number badge + title + date + count
// chips) plus the Outros bucket row. Selecting a row drives the right pane.
function _renderList() {
  const el = _q('cdx-releases-list');
  if (!el) return;
  let html = '';
  if (!_aulas.length) {
    html += '<div class="cdx-empty" style="margin-bottom:0.5rem">' + t('releases.no_aulas') + '</div>';
  }

  const debug = _isDebug();

  _aulas.forEach((aula) => {
    const n = aula.aula_number;
    const ds = aulaDateStatusKey(aula, _today());
    const dateText = t('cohorts.date_' + ds.key) + (ds.date ? ' ' + _fmtDate(ds.date) : '');
    const active = String(_selectedAula) === String(aula.id);
    const title = aula.title ? _esc(aula.title) : (t('cohorts.aula_label') + ' ' + _esc(n));
    // Debug-only toggle: hide/show the NOVO badge for every item in this lesson.
    // Only on lessons that actually have released items. The button reflects the
    // current state: "− NOVO" when the badge shows (click hides), "+ NOVO" when
    // hidden (click shows it back). It never unreleases anything.
    let clearBtn = '';
    if (debug && _aulaReleasedIds(n).length) {
      const fresh = _aulaIsFresh(n);
      const label = fresh ? '&minus; NOVO' : '+ NOVO';
      const title = _esc(fresh ? t('releases.clear_fresh') : t('releases.show_fresh'));
      clearBtn = '<button type="button" class="cdx-rel-clear-fresh cdx-dev-only' + (fresh ? '' : ' is-hidden-state') + '" data-toggle-fresh="' + _esc(n) + '" data-make-fresh="' + (fresh ? '0' : '1') + '" title="' + title + '">' + label + '</button>';
    }
    // "Marcar como ocorrida no dia marcado": only for a scheduled aula not yet
    // happened. Sets happened_on = scheduled_for (occurred on its planned day).
    let markBtn = '';
    if (ds.key !== 'happened' && aula.scheduled_for) {
      markBtn = '<button type="button" class="cdx-rel-mark-happened" data-mark-happened="' + _esc(aula.id) +
        '" title="' + _esc(t('releases.mark_happened_title')) + '">' + _esc(t('releases.mark_happened')) + '</button>';
    }
    html +=
      '<div class="cdx-item-row' + (active ? ' is-active' : '') + '" data-aula-id="' + _esc(aula.id) + '" data-aula-num="' + _esc(n) + '">' +
        '<span class="cdx-rel-aula-num">' + _esc(n) + '</span>' +
        '<div class="cdx-item-info">' +
          '<div class="cdx-item-title">' + title + '</div>' +
          '<div class="cdx-item-sub">' +
            '<span class="cdx-rel-aula-date is-' + ds.key + '">' + _esc(dateText) + '</span>' +
            '<span class="cdx-rel-aula-counts">' + _aulaCountsHtml(n) + '</span>' +
          '</div>' +
        '</div>' +
        markBtn +
        clearBtn +
      '</div>';
  });

  const outrosActive = _selectedAula === 'outros';
  html +=
    '<div class="cdx-item-row cdx-rel-outros-row' + (outrosActive ? ' is-active' : '') + '" data-aula-id="outros">' +
      '<span class="cdx-rel-aula-num cdx-rel-outros-icon">' + glyphSvg('layers', { size: 15 }) + '</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + t('releases.outros_label') + '</div>' +
        '<div class="cdx-item-sub">' +
          '<span class="cdx-rel-aula-title">' + t('releases.outros_sub') + '</span>' +
          '<span class="cdx-rel-aula-counts">' + _outrosCountsHtml() + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  el.innerHTML = html;
}

// ── Right pane: empty prompt | the selected aula's (or Outros) composer ──────
// No header: the selected left card already names the aula and shows its date +
// counts, so the pane is just the composer, maximising the picker.
function _renderPreview() {
  const pane = _q('cdx-releases-preview');
  if (!pane) return;
  if (_selectedAula == null) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('releases.select') + '</div>';
    return;
  }
  const isOutros = _selectedAula === 'outros';
  const aula = isOutros ? null : _aulas.find((a) => String(a.id) === String(_selectedAula));
  if (!isOutros && !aula) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('releases.select') + '</div>';
    return;
  }
  pane.innerHTML = '<div class="cdx-preview-body" data-composer></div>';
  const composer = pane.querySelector('[data-composer]');
  if (isOutros) _renderOutrosComposer(composer);
  else _renderAulaComposer(composer, aula);
}

function _onListClick(e) {
  const markBtn = e.target.closest('.cdx-rel-mark-happened');
  if (markBtn) { _markAulaHappened(markBtn.dataset.markHappened); return; }
  const toggleBtn = e.target.closest('.cdx-rel-clear-fresh');
  if (toggleBtn) { _toggleFresh(toggleBtn.dataset.toggleFresh, toggleBtn.dataset.makeFresh === '1'); return; }
  const row = e.target.closest('.cdx-item-row');
  if (!row) return;
  _selectedAula = row.dataset.aulaId;   // 'outros' or an aula id (string)
  _renderList();
  _renderPreview();
}

// Mark an aula as occurred on its scheduled day, straight from Releases. ct_update_aula
// REPLACES every field, so rebuild the full aula payload (preserving title + dates) and
// only set happened_on = scheduled_for. aula-status.js then reads it as 'happened'.
function _markAulaHappened(aulaId) {
  const aula = _aulas.find((a) => String(a.id) === String(aulaId));
  if (!aula || !aula.scheduled_for) return;
  const payload = {
    client_slug: _clientSlug, turma_slug: _turmaSlug,
    id: aula.id, aula_number: aula.aula_number,
    title: aula.title || '',
    scheduled_for: aula.scheduled_for || null,
    happened_on: aula.scheduled_for,
    rescheduled_from: aula.rescheduled_from || null,
    rescheduled_note: aula.rescheduled_note || null,
  };
  cohortsApi.updateAula(payload).then((r) => {
    if (r && r.error) throw new Error(r.error);
    aula.happened_on = aula.scheduled_for;
    _toast(t('releases.mark_happened_done'));
    _renderList();
  }).catch((err) => notice.internal(_err(err)));
}

// Debug-only: hide/show the NOVO badge for every item in this aula by moving
// released_at relative to the 5-day window (makeFresh=false hides, true shows).
// Reversible, never unreleases an item, never changes its order. The local
// released_at mirror is updated so the button flips on the spot.
function _toggleFresh(aulaNum, makeFresh) {
  api.setFreshness({ client_slug: _clientSlug, turma_slug: _turmaSlug, aula_number: Number(aulaNum), fresh: makeFresh })
    .then((r) => {
      if (r && r.error) throw new Error(r.error);
      const ts = Math.floor(Date.now() / 1000) - (makeFresh ? 0 : 6 * 24 * 60 * 60);
      _aulaReleasedIds(aulaNum).forEach((id) => { (_releasedMeta[id] || (_releasedMeta[id] = {})).released_at = ts; });
      _toast(t(makeFresh ? 'releases.show_fresh_done' : 'releases.clear_fresh_done'));
      _renderList();
    })
    .catch((err) => notice.internal(_err(err)));
}

// ── Composer rendering (collapsible accordion, like the Presets picker) ──────
function _rowHtml(item, pool, checked, glyphHtml) {
  return '<label class="cdx-comp-item" data-title="' + _esc((item.title || '').toLowerCase()) + '">' +
    '<input type="checkbox" class="cdx-comp-cb" data-pool="' + pool + '" value="' + _esc(item.id) + '"' + (checked ? ' checked' : '') + '>' +
    '<span>' + (glyphHtml ? glyphHtml + ' ' : '') + _esc(item.title) + '</span>' +
  '</label>';
}

// Render the item pools as one search + a single-open accordion of sections,
// reusing the Presets picker classes (.cdx-picker*) so the layout is identical.
// Rows stay in the DOM when a section collapses (the checked state lives in the
// checkboxes, read at save time), so collapsing never drops an unsaved pick.
function _renderComposerAccordion(container, sections) {
  const groupsHtml = sections.map((s, idx) => {
    const open = idx === 0;
    return '<div class="cdx-picker-group" data-acc="' + s.key + '">' +
        '<button type="button" class="cdx-picker-group-label" data-acc-toggle="' + s.key + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="cdx-picker-group-caret" aria-hidden="true">&#8250;</span>' +
          '<span class="cdx-picker-group-name">' + s.label + ' (' + s.count + ')</span>' +
        '</button>' +
        '<div class="cdx-picker-group-rows' + (open ? '' : ' is-collapsed') + '">' + s.rowsHtml + '</div>' +
      '</div>';
  }).join('');
  container.innerHTML =
    '<div class="cdx-picker cdx-rel-acc">' +
      '<div class="cdx-picker-toolbar">' +
        '<input type="search" class="cdx-picker-search cdx-comp-search-all" placeholder="' + _esc(t('releases.search_placeholder')) + '" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="cdx-picker-list">' + groupsHtml + '</div>' +
    '</div>' +
    '<div class="cdx-comp-actions"><button class="cdx-btn cdx-btn-primary cdx-comp-save">' + t('content.save') + '</button></div>';
  _wireComposerAccordion(container);
}

function _wireComposerAccordion(container) {
  const list = container.querySelector('.cdx-picker-list');
  const search = container.querySelector('.cdx-comp-search-all');
  if (!list) return;
  const groups = Array.from(list.querySelectorAll('.cdx-picker-group'));
  let openGroup = groups.length ? groups[0].getAttribute('data-acc') : null;

  function setOpen(g, open) {
    const btn = g.querySelector('.cdx-picker-group-label');
    const rows = g.querySelector('.cdx-picker-group-rows');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (rows) rows.classList.toggle('is-collapsed', !open);
  }

  list.addEventListener('click', (e) => {
    const tgl = e.target.closest('[data-acc-toggle]');
    if (!tgl) return;
    if (search && search.value.trim()) return; // all expanded during a search
    const key = tgl.getAttribute('data-acc-toggle');
    openGroup = (openGroup === key) ? null : key; // toggle; collapse if re-clicked
    groups.forEach((g) => setOpen(g, g.getAttribute('data-acc') === openGroup));
  });

  if (search) search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    container.querySelectorAll('.cdx-comp-item').forEach((row) => {
      row.style.display = (!q || (row.dataset.title || '').indexOf(q) !== -1) ? '' : 'none';
    });
    groups.forEach((g) => setOpen(g, q ? true : g.getAttribute('data-acc') === openGroup));
  });
}

function _renderAulaComposer(container, aula) {
  if (!aula) return;
  const aulaNum = aula.aula_number;

  const tarefaItems = _allItems.filter(_isTarefa);
  const driveItems = _allItems.filter(_isDrive);
  const outrosItems = _allItems.filter(_isOutros);

  const apostilaRows = _apostilaItems.length
    ? _apostilaItems.map((i) =>
        '<label class="cdx-comp-item" data-title="' + _esc((i.title || '').toLowerCase()) + '"><input type="checkbox" class="cdx-comp-cb" data-pool="apostila" value="' + _esc(i.id) + '"' + (_isBoundTo(i.id, aulaNum) ? ' checked' : '') + '>' +
        '<span>' + (i.set_position ? _esc(String(i.set_position)) + '. ' : '') + _esc(i.title) + '</span></label>').join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_apostila') + '</div>';

  const tarefaGlyph = _countGlyph('tarefa', 15);
  const tarefaRows = tarefaItems.length
    ? tarefaItems.map((i) => _rowHtml(i, 'tarefa', _isBoundTo(i.id, aulaNum), tarefaGlyph)).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_tarefa') + '</div>';

  const outrosRows = outrosItems.length
    ? outrosItems.map((i) => _rowHtml(i, 'outros', _isBoundTo(i.id, aulaNum), typeIconHtml(_typeIcon(i.type), { size: 15 }))).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_outros') + '</div>';

  const sections = [
    { key: 'apostila', label: t('releases.section_apostila'), count: _apostilaItems.length, rowsHtml: apostilaRows },
    { key: 'tarefa', label: t('releases.section_tarefas'), count: tarefaItems.length, rowsHtml: tarefaRows },
    { key: 'outros', label: t('releases.section_outros'), count: outrosItems.length, rowsHtml: outrosRows },
  ];
  if (driveItems.length) {
    const driveGlyph = _countGlyph('drive_file', 15);
    const driveRows = driveItems.map((i) => _rowHtml(i, 'drive', _isBoundTo(i.id, aulaNum), driveGlyph)).join('');
    sections.push({ key: 'drive', label: t('releases.section_drive'), count: driveItems.length, rowsHtml: driveRows });
  }

  _renderComposerAccordion(container, sections);
  container.querySelector('.cdx-comp-save').addEventListener('click', () =>
    _saveAula(container, aulaNum, { tarefaItems, outrosItems, driveItems }));
}

function _renderOutrosComposer(container) {
  // Eligible: standalone items unreleased OR currently in Outros (no aula).
  const eligible = _allItems.filter((i) => {
    if (i.set_id || i.type === 'conteudo' || i.type === 'tarefa') return false;
    if (_released.indexOf(Number(i.id)) === -1) return true;
    return !(_releasedMeta[i.id] || {}).aula_number;
  });
  const standalone = eligible.filter((i) => !_isDrive(i));
  const driveItems = eligible.filter(_isDrive);

  const standaloneRows = standalone.length
    ? standalone.map((i) => _rowHtml(i, 'outros', _inOutros(i.id), typeIconHtml(_typeIcon(i.type), { size: 15 }))).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_outros_solo') + '</div>';

  const sections = [
    { key: 'outros', label: t('releases.section_outros_solo'), count: standalone.length, rowsHtml: standaloneRows },
  ];
  if (driveItems.length) {
    const driveGlyph = _countGlyph('drive_file', 15);
    const driveRows = driveItems.map((i) => _rowHtml(i, 'drive', _inOutros(i.id), driveGlyph)).join('');
    sections.push({ key: 'drive', label: t('releases.section_drive'), count: driveItems.length, rowsHtml: driveRows });
  }

  _renderComposerAccordion(container, sections);
  container.querySelector('.cdx-comp-save').addEventListener('click', () =>
    _saveOutros(container, { standalone, driveItems }));
}

// ── Save ────────────────────────────────────────────────────────────────────
function _checkedIds(container) {
  const ids = [];
  container.querySelectorAll('.cdx-comp-cb:checked').forEach((cb) => ids.push(Number(cb.value)));
  return ids;
}

function _saveAula(container, aulaNum, pools) {
  const btn = container.querySelector('.cdx-comp-save');
  btn.disabled = true;
  btn.textContent = t('releases.saving');
  const selectedIds = _checkedIds(container);
  const poolIds = _apostilaItems.map((i) => Number(i.id))
    .concat(pools.tarefaItems.map((i) => Number(i.id)))
    .concat(pools.outrosItems.map((i) => Number(i.id)))
    .concat((pools.driveItems || []).map((i) => Number(i.id)));
  const { toRelease, toSetAula, toDropAula } = diffAulaSelection({
    released: _released, releasedMeta: _releasedMeta, aulaNum, poolIds, selectedIds,
  });
  const base = { client_slug: _clientSlug, turma_slug: _turmaSlug };

  Promise.all(toRelease.map((id) => api.release(Object.assign({ item_id: id }, base))))
    .then(() => {
      const setCalls = toRelease.concat(toSetAula).map((id) =>
        api.setAula(Object.assign({ item_id: id, aula_number_or_null: aulaNum }, base)));
      const dropCalls = toDropAula.map((id) =>
        api.setAula(Object.assign({ item_id: id, aula_number_or_null: null }, base)));
      return Promise.all(setCalls.concat(dropCalls));
    }).then(() => {
      toRelease.forEach((id) => { _released.push(id); _releasedMeta[id] = { aula_number: aulaNum }; });
      toSetAula.forEach((id) => { (_releasedMeta[id] || (_releasedMeta[id] = {})).aula_number = aulaNum; });
      toDropAula.forEach((id) => { if (_releasedMeta[id]) _releasedMeta[id].aula_number = null; });
      _toast(t('releases.saved'));
      _renderList();
      _renderPreview();
    }).catch((err) => {
      btn.disabled = false;
      btn.textContent = t('content.save');
      notice.internal(_err(err));
    });
}

function _saveOutros(container, pools) {
  const btn = container.querySelector('.cdx-comp-save');
  btn.disabled = true;
  btn.textContent = t('releases.saving');
  const selectedIds = _checkedIds(container);
  const poolIds = pools.standalone.map((i) => Number(i.id)).concat((pools.driveItems || []).map((i) => Number(i.id)));
  const { toRelease, toUnrelease } = diffOutrosSelection({
    released: _released, releasedMeta: _releasedMeta, poolIds, selectedIds,
  });
  const base = { client_slug: _clientSlug, turma_slug: _turmaSlug };

  Promise.all(
    toRelease.map((id) => api.release(Object.assign({ item_id: id }, base)))
      .concat(toUnrelease.map((id) => api.unrelease(Object.assign({ item_id: id }, base))))
  ).then(() => {
    toRelease.forEach((id) => { _released.push(id); _releasedMeta[id] = { aula_number: null }; });
    toUnrelease.forEach((id) => {
      const idx = _released.indexOf(id);
      if (idx !== -1) _released.splice(idx, 1);
      delete _releasedMeta[id];
    });
    _toast(t('releases.saved'));
    _renderList();
    _renderPreview();
  }).catch((err) => {
    btn.disabled = false;
    btn.textContent = t('content.save');
    notice.internal(_err(err));
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-releases">' +
      '<div class="cdx-turma-picker" id="cdx-rel-picker"></div>' +
      '<div class="cdx-items-split cdx-releases-split" id="cdx-releases-split">' +
        '<div class="cdx-items-list" id="cdx-releases-list">' +
          '<div class="cdx-empty">' + t('releases.select_prompt') + '</div>' +
        '</div>' +
        '<div class="cdx-item-preview" id="cdx-releases-preview">' +
          '<div class="cdx-preview-empty">' + t('releases.select') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  _q('cdx-releases-list').addEventListener('click', _onListClick);
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _clientSlug = null;
  _turmaSlug = null;
  _aulas = [];
  _allItems = [];
  _apostilaItems = [];
  _released = [];
  _releasedMeta = {};
  _types = [];
  _selectedAula = null;
  _cleanup = [];
  _renderShell();
  contentApi.listTypes().then((d) => { _types = (d && d.types) || []; }).catch((e) => { notice.internal(_err(e)); });
  _picker = turmaPicker.mount(_q('cdx-rel-picker'), {
    onSelect: (c, tu) => _loadReleases(c, tu),
    storageKey: { client: LS_CLIENT, turma: LS_TURMA },
    autoRestore: true,
  });
}

export function unmount() {
  if (_picker && _picker.destroy) _picker.destroy();
  _picker = null;
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
