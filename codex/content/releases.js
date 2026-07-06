// content/releases.js
// Codex Content tab, Releases (Liberações) sub-tab: the aula-centric composer
// that binds library items to a turma's lessons. Native port of the legacy
// ClassTrail releases surface (ct-admin.js): cdx- styling, facade-only backend,
// every string via t(). A turma is chosen in the shared pill picker; each lesson
// is an accordion whose composer toggles which items are released to it, plus an
// "Outros" bucket for items released without a lesson.
import { content as contentApi, releases as api, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { aulaStatus } from '../js/aula-status.js';
import { iconHtml as typeIconHtml, glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import * as turmaPicker from './turma-picker.js';
import { installResizer } from '../js/resizable.js';

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
// Aula-locked mode (embedded in the Cohorts aula hub): when set, the module skips
// the picker + the aula list + the resizer and renders ONLY this one aula's (or
// 'outros') composer. _onChange notifies the host so it can refresh its aula badges
// after a release save. Both null in the standalone Content-tab mount.
let _lockedAula = null;             // aula id (string) | 'outros' | null
let _onChange = null;

// ── Pure rules (exported for tests) ──────────────────────────────────────────
// Categorize one released item (a ct_get_turma_view row, which carries type +
// set_id) into its content bucket, mirroring EXACTLY the composer pool predicates
// below (_isTarefa/_isDrive/_isOutros + the apostila = set-item rule) so the Cohorts
// aula hub and this composer can never disagree on what an aula holds. Returns the
// bucket key, or null for a set-less 'conteudo' (which the composer never counts).
export function releaseItemBucket(it) {
  if (!it) return null;
  if (it.set_id) return 'apostila';
  if (it.type === 'tarefa') return 'tarefa';
  if (it.type === 'drive_file') return 'drive';
  if (it.type === 'conteudo') return null; // a set-less conteudo is not a pool item
  return 'outros';
}

// Per-aula content counts from a raw ct_get_turma_view items array. An item counts
// for an aula when its #23 multi-aula bindings (aula_numbers) include it, falling
// back to the single aula_number for legacy rows. Pure + exported so the Cohorts
// aula hub reuses it instead of re-deriving the same tallies.
export function aulaReleaseCounts(viewItems, aulaNum) {
  const counts = { apostila: 0, tarefa: 0, outros: 0, drive: 0, total: 0 };
  const n = String(aulaNum);
  (viewItems || []).forEach((it) => {
    const nums = Array.isArray(it.aula_numbers)
      ? it.aula_numbers
      : (it.aula_number != null ? [it.aula_number] : []);
    if (nums.map(String).indexOf(n) === -1) return;
    const bucket = releaseItemBucket(it);
    if (!bucket) return;
    counts[bucket]++;
    counts.total++;
  });
  return counts;
}

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

// #23: additive multi-aula diff for one aula's composer. Checking an item ADDS this
// aula to its bindings (instead of moving it); unchecking REMOVES this aula. Returns
// the ids needing a first ct_release and the per-item new aula_numbers list to save.
// `aulaNumbersOf(id)` yields the item's current bindings (array).
export function diffAulaMultiSelection({ released, aulaNumbersOf, aulaNum, poolIds, selectedIds }) {
  const rel = new Set((released || []).map(Number));
  const sel = new Set((selectedIds || []).map(Number));
  const n = Number(aulaNum);
  const toRelease = [], updates = [];
  for (const raw of (poolIds || [])) {
    const id = Number(raw);
    const cur = (aulaNumbersOf(id) || []).map(Number);
    const hasN = cur.indexOf(n) !== -1;
    const checked = sel.has(id);
    if (checked && !hasN) {
      if (!rel.has(id)) toRelease.push(id);
      updates.push({ id, aulaNumbers: [...new Set(cur.concat(n))].sort((a, b) => a - b) });
    } else if (!checked && hasN) {
      updates.push({ id, aulaNumbers: cur.filter((x) => x !== n) });
    }
  }
  return { toRelease, updates };
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
import { esc as _esc } from '../js/dom.js';
import { errMsg as _err } from '../js/content-err.js';
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
  return _released.filter((id) => _aulaNumbersOf(id).map(String).indexOf(String(aulaNum)) !== -1);
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
// #23: every aula an item is bound to. Falls back to the single aula_number for
// legacy items that only carry the old single binding.
function _aulaNumbersOf(id) {
  const m = _releasedMeta[id] || {};
  if (Array.isArray(m.aula_numbers)) return m.aula_numbers;
  return (m.aula_number != null && m.aula_number !== '') ? [m.aula_number] : [];
}
function _isBoundTo(id, aulaNum) {
  return _released.indexOf(Number(id)) !== -1 &&
    _aulaNumbersOf(id).map(String).indexOf(String(aulaNum)) !== -1;
}
function _inOutros(id) {
  return _released.indexOf(Number(id)) !== -1 && _aulaNumbersOf(id).length === 0;
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
  const lk = _q('cdx-releases-locked');
  if (lk) lk.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';

  // track-34 §B: keep the Labs ct_items rows in sync BEFORE listing items, so a
  // lab just enabled in Content > Labs shows up here without any manual step
  // (silent, best-effort -- a failure here must not block the composer load).
  contentApi.ensureLabItems().catch((e) => { notice.internal(_err(e)); }).then(() => Promise.all([
    contentApi.listItems(),
    cohortsApi.listTurmas({ client_slug: clientSlug }),
    cohortsApi.listAulas({ client_slug: clientSlug, turma_slug: turmaSlug }),
  ])).then((results) => {
    _allItems = (results[0] && results[0].items) || [];
    _aulas = (results[2] && results[2].aulas) || [];
    const turma = ((results[1] && results[1].turmas) || []).find((tu) => tu.slug === turmaSlug);
    if (!turma) {
      if (el) el.innerHTML = '<div class="cdx-empty">' + t('releases.turma_not_found') + '</div>';
      const lk2 = _q('cdx-releases-locked');
      if (lk2) lk2.innerHTML = '<div class="cdx-empty">' + t('releases.turma_not_found') + '</div>';
      return;
    }
    return api.turmaView({ client_slug: clientSlug, turma_slug: turmaSlug, token: turma.token }).then((vd) => {
      const items = (vd && vd.items) || [];
      _released = items.map((i) => i.id);
      _releasedMeta = {};
      items.forEach((i) => { _releasedMeta[i.id] = {
        aula_number: i.aula_number || null,
        aula_numbers: Array.isArray(i.aula_numbers) ? i.aula_numbers : (i.aula_number != null ? [i.aula_number] : []),
        released_at: i.released_at,
      }; });
      // Apostila pool = the set bound to THIS turma's course (vd.apostila_set, resolved
      // server-side by course_id -> apostila_set_id). Multi-apostila safe: no "newest set"
      // guess. Empty when the course has no apostila bound.
      const setId = vd && vd.apostila_set && vd.apostila_set.id;
      if (!setId) { _apostilaItems = []; _renderMain(); return; }
      return contentApi.getSet({ id: setId }).then((res) => {
        _apostilaItems = ((res && res.items) || []).slice()
          .sort((a, b) => (a.set_position || 0) - (b.set_position || 0));
        _renderMain();
      }).catch((e) => { _apostilaItems = []; _renderMain(); notice.internal(_err(e)); });
    }).catch((err) => { _released = []; _releasedMeta = {}; _apostilaItems = []; _renderMain(); notice.internal(_err(err)); });
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
      clearBtn = '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-rel-clear-fresh cdx-dev-only' + (fresh ? '' : ' is-hidden-state') + '" data-toggle-fresh="' + _esc(n) + '" data-make-fresh="' + (fresh ? '0' : '1') + '" title="' + title + '">' + label + '</button>';
    }
    // "Marcar como ocorrida no dia marcado": only for a scheduled aula not yet
    // happened. Sets happened_on = scheduled_for (occurred on its planned day).
    let markBtn = '';
    if (ds.key !== 'happened' && aula.scheduled_for) {
      markBtn = '<button type="button" class="cdx-btn cdx-btn-sm cdx-rel-mark-happened" data-mark-happened="' + _esc(aula.id) +
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

// Render dispatcher: in the aula-locked embed, draw only the one composer; in the
// standalone Content-tab mount, draw the selectable aula list as before.
function _renderMain() {
  if (_lockedAula != null) _renderLocked();
  else _renderList();
}

// Aula-locked embed: render just the selected aula's (or Outros) composer straight
// into the locked pane, no list, no preview split. Reuses the same composer
// builders the standalone path uses, so the surface is identical.
function _renderLocked() {
  const container = _q('cdx-releases-locked');
  if (!container) return;
  _selectedAula = _lockedAula;
  if (_lockedAula === 'outros') { _renderOutrosComposer(container); return; }
  const aula = _aulas.find((a) => String(a.id) === String(_lockedAula));
  if (!aula) { container.innerHTML = '<div class="cdx-empty">' + t('releases.no_aulas') + '</div>'; return; }
  _renderAulaComposer(container, aula);
}

// After a composer save: the locked embed re-renders its single composer and pings
// the host to refresh aula badges; the standalone path repaints list + preview.
function _afterSave() {
  if (_lockedAula != null) {
    _renderLocked();
    if (_onChange) _onChange();
  } else {
    _renderList();
    _renderPreview();
  }
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
    toast.ok(t('releases.mark_happened_done'));
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
      toast.ok(t(makeFresh ? 'releases.show_fresh_done' : 'releases.clear_fresh_done'));
      _renderList();
    })
    .catch((err) => notice.internal(_err(err)));
}

// ── Composer rendering (collapsible accordion, like the Presets picker) ──────
function _rowHtml(item, pool, checked, glyphHtml, elsewhereAula) {
  // elsewhereAula: the OTHER aulas this item is bound to (#23 multi-aula). The row
  // greys only when it is NOT bound to THIS aula (a "borrow" candidate); the marker
  // "já nas aulas 1, 3" shows whenever it is bound elsewhere. Checking it here ADDS
  // this aula (it no longer moves the item).
  const elsewhere = Array.isArray(elsewhereAula) ? elsewhereAula : (elsewhereAula != null && elsewhereAula !== '' ? [elsewhereAula] : []);
  const hasElsewhere = elsewhere.length > 0;
  const grey = hasElsewhere && !checked;
  return '<label class="cdx-comp-item' + (grey ? ' is-already-released' : '') + '" data-title="' + _esc((item.title || '').toLowerCase()) + '">' +
    '<input type="checkbox" class="cdx-comp-cb" data-pool="' + pool + '" value="' + _esc(item.id) + '"' + (checked ? ' checked' : '') + '>' +
    '<span>' + (glyphHtml ? glyphHtml + ' ' : '') + _esc(item.title) +
      (hasElsewhere ? ' <span class="cdx-comp-elsewhere">' + _esc(_elsewhereLabel(elsewhere)) + '</span>' : '') +
    '</span>' +
  '</label>';
}

// Display label for an item type slug (from the ct_types registry; fallback = slug).
function _typeLabel(slug) {
  const ty = _types.find((x) => x.slug === slug);
  return (ty && ty.label) || slug;
}

// Group items by their type, ordered by the ct_types registry order (unknown types
// last). Used to lay the release composer out "por tipo" instead of one Outros bucket.
function _groupByType(items) {
  const order = _types.map((tp) => tp.slug);
  const byType = new Map();
  items.forEach((i) => { if (!byType.has(i.type)) byType.set(i.type, []); byType.get(i.type).push(i); });
  return Array.from(byType.keys())
    .sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map((k) => ({ type: k, items: byType.get(k) }));
}

// The OTHER aulas this item is bound to (excluding aulaNum). Returns an array, or
// null if none. Drives the "já nas aulas 1, 3" marker (R1a + #23 multi-aula).
function _releasedElsewhere(id, aulaNum) {
  if (_released.indexOf(Number(id)) === -1) return null;
  const others = _aulaNumbersOf(id).filter((a) => String(a) !== String(aulaNum));
  return others.length ? others : null;
}

// "já na aula 1" (one) or "já nas aulas 1, 3" (several).
function _elsewhereLabel(aulas) {
  const list = (Array.isArray(aulas) ? aulas : [aulas]).map(String);
  if (list.length <= 1) return t('releases.already_aula').replace('{n}', list[0] || '');
  return t('releases.already_aulas').replace('{ns}', list.join(', '));
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

  // Apostila rows render inline (the set-position prefix isn't in _rowHtml), but
  // still carry the "já na aula N" grey marker when released to another aula (R1a/#22).
  const apostilaRows = _apostilaItems.length
    ? _apostilaItems.map((i) => {
        const checked = _isBoundTo(i.id, aulaNum);
        const elsewhere = _releasedElsewhere(i.id, aulaNum) || [];
        const hasElsewhere = elsewhere.length > 0;
        const grey = hasElsewhere && !checked;
        return '<label class="cdx-comp-item' + (grey ? ' is-already-released' : '') + '" data-title="' + _esc((i.title || '').toLowerCase()) + '">' +
          '<input type="checkbox" class="cdx-comp-cb" data-pool="apostila" value="' + _esc(i.id) + '"' + (checked ? ' checked' : '') + '>' +
          '<span>' + (i.set_position ? _esc(String(i.set_position)) + '. ' : '') + _esc(i.title) +
            (hasElsewhere ? ' <span class="cdx-comp-elsewhere">' + _esc(_elsewhereLabel(elsewhere)) + '</span>' : '') +
          '</span></label>';
      }).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_apostila') + '</div>';

  const tarefaGlyph = _countGlyph('tarefa', 15);
  const tarefaRows = tarefaItems.length
    ? tarefaItems.map((i) => _rowHtml(i, 'tarefa', _isBoundTo(i.id, aulaNum), tarefaGlyph, _releasedElsewhere(i.id, aulaNum))).join('')
    : '<div class="cdx-comp-empty">' + t('releases.empty_tarefa') + '</div>';

  // R3: lay the item list out por tipo. Apostila + Tarefas keep their own sections;
  // the former single "Outros" bucket splits into one section per item type.
  const sections = [
    { key: 'apostila', label: t('releases.section_apostila'), count: _apostilaItems.length, rowsHtml: apostilaRows },
    { key: 'tarefa', label: t('releases.section_tarefas'), count: tarefaItems.length, rowsHtml: tarefaRows },
  ];
  _groupByType(outrosItems).forEach((g) => {
    const glyph = typeIconHtml(_typeIcon(g.type), { size: 15 });
    const rows = g.items.map((i) => _rowHtml(i, 'outros', _isBoundTo(i.id, aulaNum), glyph, _releasedElsewhere(i.id, aulaNum))).join('');
    sections.push({ key: 'type-' + g.type, label: _typeLabel(g.type), count: g.items.length, rowsHtml: rows });
  });
  if (driveItems.length) {
    const driveGlyph = _countGlyph('drive_file', 15);
    const driveRows = driveItems.map((i) => _rowHtml(i, 'drive', _isBoundTo(i.id, aulaNum), driveGlyph, _releasedElsewhere(i.id, aulaNum))).join('');
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

  // R3: por tipo here too. Empty bucket keeps a single placeholder section.
  const sections = standalone.length
    ? _groupByType(standalone).map((g) => ({
        key: 'type-' + g.type,
        label: _typeLabel(g.type),
        count: g.items.length,
        rowsHtml: g.items.map((i) => _rowHtml(i, 'outros', _inOutros(i.id), typeIconHtml(_typeIcon(i.type), { size: 15 }))).join(''),
      }))
    : [{ key: 'outros', label: t('releases.section_outros_solo'), count: 0, rowsHtml: '<div class="cdx-comp-empty">' + t('releases.empty_outros_solo') + '</div>' }];
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
  // #23: additive, checking ADDS this aula, unchecking REMOVES it (no longer moves).
  const { toRelease, updates } = diffAulaMultiSelection({
    released: _released, aulaNumbersOf: _aulaNumbersOf, aulaNum, poolIds, selectedIds,
  });
  const base = { client_slug: _clientSlug, turma_slug: _turmaSlug };

  Promise.all(toRelease.map((id) => api.release(Object.assign({ item_id: id }, base))))
    .then(() => Promise.all(updates.map((u) =>
      api.setAulas(Object.assign({ item_id: u.id, aula_numbers: u.aulaNumbers }, base)))))
    .then(() => {
      toRelease.forEach((id) => { if (_released.indexOf(id) === -1) _released.push(id); });
      updates.forEach((u) => {
        const m = _releasedMeta[u.id] || (_releasedMeta[u.id] = {});
        m.aula_numbers = u.aulaNumbers;
        m.aula_number = u.aulaNumbers.length ? u.aulaNumbers[0] : null; // primary (Trail back-compat)
      });
      toast.ok(t('releases.saved'));
      _afterSave();
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
    toast.ok(t('releases.saved'));
    _afterSave();
  }).catch((err) => {
    btn.disabled = false;
    btn.textContent = t('content.save');
    notice.internal(_err(err));
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function _renderShell() {
  // Aula-locked embed: just a pane for the one composer (no picker, no split).
  if (_lockedAula != null) {
    _viewEl.innerHTML =
      '<div class="cdx-releases cdx-releases--locked">' +
        '<div class="cdx-rel-locked-pane" id="cdx-releases-locked">' +
          '<div class="cdx-empty">' + t('content.loading') + '</div>' +
        '</div>' +
      '</div>';
    return;
  }
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
export function mount(viewEl, ctx = {}) {
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
  _lockedAula = (ctx.aula != null && ctx.aula !== '') ? String(ctx.aula) : null;
  _onChange = (typeof ctx.onChange === 'function') ? ctx.onChange : null;
  _renderShell();
  contentApi.listTypes().then((d) => { _types = (d && d.types) || []; }).catch((e) => { notice.internal(_err(e)); });
  // Aula-locked embed (Cohorts aula hub): turma + aula already fixed, load straight in.
  if (_lockedAula != null) {
    if (ctx.clientSlug && ctx.turmaSlug) _loadReleases(ctx.clientSlug, ctx.turmaSlug);
    return;
  }
  // Draggable divider between the aula list and the composer (persisted).
  installResizer(_q('cdx-releases-split'), { storeKey: 'cdx_rz_releases_split', defaultPx: 380, min: 260, max: 680 });
  // Embedded in a turma dossiê (ctx.clientSlug/turmaSlug given): the turma is already
  // chosen, so hide the picker and load straight into it. Standalone (Content tab): the
  // picker drives selection as before.
  if (ctx.clientSlug && ctx.turmaSlug) {
    const pk = _q('cdx-rel-picker'); if (pk) pk.style.display = 'none';
    _loadReleases(ctx.clientSlug, ctx.turmaSlug);
  } else {
    _picker = turmaPicker.mount(_q('cdx-rel-picker'), {
      onSelect: (c, tu) => _loadReleases(c, tu),
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
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
