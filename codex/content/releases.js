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
let _picker = null;
let _cleanup = [];

// ── Pure rules (exported for tests) ──────────────────────────────────────────
// Lesson date status. Returns { key, date }; key is i18n-free so the renderer
// maps it through t() in the cohorts.date_* namespace. `today` is injected (ISO
// yyyy-mm-dd) so the rule is deterministic under test.
export function aulaDateStatusKey(aula, today) {
  if (!aula) return { key: 'tbd', date: null };
  if (aula.happened_on) return { key: 'happened', date: aula.happened_on };
  if (aula.scheduled_for) {
    if (aula.rescheduled_from && aula.scheduled_for > today) return { key: 'rescheduled', date: aula.scheduled_for };
    if (aula.scheduled_for > today) return { key: 'scheduled', date: aula.scheduled_for };
    return { key: 'happened', date: aula.scheduled_for };
  }
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
  const el = _q('cdx-releases-list');
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';

  const loadApostila = contentApi.listSets().then((data) => {
    const sets = ((data && data.sets) || []).filter((s) => (s.item_count || 0) > 0);
    if (!sets.length) return;
    const current = sets[sets.length - 1];   // newest set with items (matches student view)
    return contentApi.getSet({ id: current.id }).then((res) => {
      _apostilaItems = ((res && res.items) || []).slice()
        .sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
    });
  }).catch(() => {});

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
      items.forEach((i) => { _releasedMeta[i.id] = { aula_number: i.aula_number || null }; });
      _renderList();
    }).catch(() => { _released = []; _releasedMeta = {}; _renderList(); });
  }).catch(() => {
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('releases.error_loading') + '</div>';
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

function _renderList() {
  const el = _q('cdx-releases-list');
  if (!el) return;
  let html = '';
  if (!_aulas.length) {
    html += '<div class="cdx-empty" style="margin-bottom:1rem">' + t('releases.no_aulas') + '</div>';
  }

  _aulas.forEach((aula) => {
    const n = aula.aula_number;
    const ds = aulaDateStatusKey(aula, _today());
    const dateText = t('cohorts.date_' + ds.key) + (ds.date ? ' ' + _fmtDate(ds.date) : '');
    html +=
      '<div class="cdx-rel-aula" data-aula-id="' + _esc(aula.id) + '" data-aula-num="' + _esc(n) + '">' +
        '<div class="cdx-rel-aula-header">' +
          '<div class="cdx-rel-aula-info">' +
            '<span class="cdx-rel-aula-label">' + t('cohorts.aula_label') + ' ' + _esc(n) + '</span>' +
            (aula.title ? '<span class="cdx-rel-aula-title">' + _esc(aula.title) + '</span>' : '') +
            '<span class="cdx-rel-aula-date is-' + ds.key + '">' + _esc(dateText) + '</span>' +
          '</div>' +
          '<div class="cdx-rel-aula-meta">' +
            '<div class="cdx-rel-aula-counts">' + _aulaCountsHtml(n) + '</div>' +
            '<span class="cdx-rel-aula-chevron">&#8250;</span>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-rel-aula-composer"></div>' +
      '</div>';
  });

  const outrosSolo = _allItems.filter((i) => _isOutros(i) && _inOutros(i.id)).length;
  const driveSolo = _allItems.filter((i) => _isDrive(i) && _inOutros(i.id)).length;
  let outrosCounts = '';
  if (outrosSolo) outrosCounts += '<span class="cdx-rel-count">' + _countGlyph('outros') + ' ' + outrosSolo + '</span>';
  if (driveSolo) outrosCounts += '<span class="cdx-rel-count">' + _countGlyph('drive_file') + ' ' + driveSolo + '</span>';
  if (!outrosCounts) outrosCounts = '<span class="cdx-rel-count cdx-rel-count-empty">' + t('releases.empty_chip') + '</span>';

  html +=
    '<div class="cdx-rel-aula cdx-rel-outros">' +
      '<div class="cdx-rel-aula-header">' +
        '<div class="cdx-rel-aula-info">' +
          '<span class="cdx-rel-aula-label cdx-rel-outros-label">' + t('releases.outros_label') + '</span>' +
          '<span class="cdx-rel-aula-title">' + t('releases.outros_sub') + '</span>' +
        '</div>' +
        '<div class="cdx-rel-aula-meta">' +
          '<div class="cdx-rel-aula-counts">' + outrosCounts + '</div>' +
          '<span class="cdx-rel-aula-chevron">&#8250;</span>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-rel-aula-composer"></div>' +
    '</div>';

  el.innerHTML = html;

  el.querySelectorAll('.cdx-rel-aula').forEach((outer) => {
    const header = outer.querySelector('.cdx-rel-aula-header');
    const isOutros = outer.classList.contains('cdx-rel-outros');
    header.addEventListener('click', () => {
      const isOpen = header.classList.contains('is-open');
      el.querySelectorAll('.cdx-rel-aula-header.is-open').forEach((h) => {
        h.classList.remove('is-open');
        h.parentElement.querySelector('.cdx-rel-aula-composer').innerHTML = '';
      });
      if (!isOpen) {
        header.classList.add('is-open');
        const composer = outer.querySelector('.cdx-rel-aula-composer');
        if (isOutros) _renderOutrosComposer(composer);
        else _renderAulaComposer(composer, outer);
      }
    });
  });
}

// ── Composer rendering ───────────────────────────────────────────────────────
function _rowHtml(item, pool, checked, glyphHtml) {
  return '<label class="cdx-comp-item" data-title="' + _esc((item.title || '').toLowerCase()) + '">' +
    '<input type="checkbox" class="cdx-comp-cb" data-pool="' + pool + '" value="' + _esc(item.id) + '"' + (checked ? ' checked' : '') + '>' +
    '<span>' + (glyphHtml ? glyphHtml + ' ' : '') + _esc(item.title) + '</span>' +
  '</label>';
}

function _sectionHtml(label, listHtml, opts) {
  opts = opts || {};
  const search = opts.searchable
    ? '<input type="text" class="cdx-comp-search" data-search="' + opts.searchScope + '" placeholder="' + _esc(t('releases.search_placeholder')) + '">'
    : '';
  return '<div class="cdx-comp-section" data-scope="' + (opts.searchScope || '') + '">' +
    '<div class="cdx-comp-section-label">' + label + '</div>' + search +
    '<div class="cdx-comp-list">' + listHtml + '</div>' +
  '</div>';
}

function _wireSearch(container) {
  container.querySelectorAll('.cdx-comp-search').forEach((input) => {
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      const scope = input.dataset.search;
      const section = container.querySelector('.cdx-comp-section[data-scope="' + scope + '"]');
      if (!section) return;
      section.querySelectorAll('.cdx-comp-item').forEach((row) => {
        row.style.display = (!q || (row.dataset.title || '').indexOf(q) !== -1) ? '' : 'none';
      });
    });
  });
}

function _renderAulaComposer(container, outer) {
  const aulaNum = parseInt(outer.dataset.aulaNum, 10);
  const aula = _aulas.find((a) => String(a.id) === outer.dataset.aulaId);
  if (!aula) return;

  const tarefaItems = _allItems.filter(_isTarefa);
  const driveItems = _allItems.filter(_isDrive);
  const outrosItems = _allItems.filter(_isOutros);

  const apostilaHtml = _apostilaItems.length
    ? _apostilaItems.map((i) =>
        '<label class="cdx-comp-item"><input type="checkbox" class="cdx-comp-cb" data-pool="apostila" value="' + _esc(i.id) + '"' + (_isBoundTo(i.id, aulaNum) ? ' checked' : '') + '>' +
        '<span>' + (i.set_position ? _esc(String(i.set_position)) + '. ' : '') + _esc(i.title) + '</span></label>').join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_apostila') + '</div>';

  const tarefaGlyph = _countGlyph('tarefa', 15);
  const tarefaHtml = tarefaItems.length
    ? tarefaItems.map((i) => _rowHtml(i, 'tarefa', _isBoundTo(i.id, aulaNum), tarefaGlyph)).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_tarefa') + '</div>';

  const outrosHtml = outrosItems.length
    ? outrosItems.map((i) => _rowHtml(i, 'outros', _isBoundTo(i.id, aulaNum), typeIconHtml(_typeIcon(i.type), { size: 15 }))).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_outros') + '</div>';

  let html = '<div class="cdx-rel-composer-body">' +
    _sectionHtml(t('releases.section_apostila'), apostilaHtml, {}) +
    _sectionHtml(t('releases.section_tarefas'), tarefaHtml, {}) +
    _sectionHtml(t('releases.section_outros'), outrosHtml, { searchable: true, searchScope: 'outros' });
  if (driveItems.length) {
    const driveGlyph = _countGlyph('drive_file', 15);
    const driveHtml = driveItems.map((i) => _rowHtml(i, 'drive', _isBoundTo(i.id, aulaNum), driveGlyph)).join('');
    html += _sectionHtml(t('releases.section_drive'), driveHtml, { searchable: true, searchScope: 'drive' });
  }
  html += '<div class="cdx-comp-actions"><button class="cdx-btn cdx-btn-primary cdx-comp-save">' + t('content.save') + '</button></div></div>';
  container.innerHTML = html;

  _wireSearch(container);
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

  const listHtml = standalone.length
    ? standalone.map((i) => _rowHtml(i, 'outros', _inOutros(i.id), typeIconHtml(_typeIcon(i.type), { size: 15 }))).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_outros_solo') + '</div>';

  let html = '<div class="cdx-rel-composer-body">' +
    _sectionHtml(t('releases.section_outros_solo'), listHtml, { searchable: true, searchScope: 'outros' });
  if (driveItems.length) {
    const driveGlyph = _countGlyph('drive_file', 15);
    const driveHtml = driveItems.map((i) => _rowHtml(i, 'drive', _inOutros(i.id), driveGlyph)).join('');
    html += _sectionHtml(t('releases.section_drive'), driveHtml, { searchable: true, searchScope: 'drive' });
  }
  html += '<div class="cdx-comp-actions"><button class="cdx-btn cdx-btn-primary cdx-comp-save">' + t('content.save') + '</button></div></div>';
  container.innerHTML = html;

  _wireSearch(container);
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
      '<div class="cdx-releases-list" id="cdx-releases-list">' +
        '<div class="cdx-empty">' + t('releases.select_prompt') + '</div>' +
      '</div>' +
    '</div>';
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
  _cleanup = [];
  _renderShell();
  contentApi.listTypes().then((d) => { _types = (d && d.types) || []; }).catch(() => {});
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
