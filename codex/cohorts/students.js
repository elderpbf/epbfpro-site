// cohorts/students.js
// "Alunos" sub-tab of Cohorts (track-28a2): the cross-turma deduped roster. One line per
// CANONICAL identity (ct_students). A single-turma person shows their turma + status inline;
// a multi-turma person shows a global summary + "Várias turmas", and the line expands to one
// sub-row per turma with that turma's own status/activity. Access stays per-turma (the backend
// keeps it on the participant row); this view only READS. Look/feel mirrors the dossier
// Participantes list (.cdx-prow). Routed here by cohorts.js when ctx.sub === 'alunos'.

import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import * as notice from '../js/notice.js';

let _viewEl = null;
let _students = [];      // full roster from ct_list_students
let _search = '';        // live name/email filter
let _fMulti = false;     // "só várias turmas"
let _fPending = false;    // "com pendência" (pending/denied in some turma)
let _expanded = {};      // student id -> expanded?

function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// ── time (frontend, Date is fine here) ──────────────────────────────────────────
function _relTime(unix) {
  if (!unix) return null;
  const d = (Date.now() / 1000) - Number(unix);
  if (d < 60) return t('alunos.just_now');
  const days = Math.floor(d / 86400);
  if (days >= 1) return t('alunos.days_ago').replace('{n}', days);
  const hrs = Math.floor(d / 3600);
  if (hrs >= 1) return t('alunos.hours_ago').replace('{n}', hrs);
  return t('alunos.mins_ago').replace('{n}', Math.max(1, Math.floor(d / 60)));
}

// ── derived facts ───────────────────────────────────────────────────────────────
function _hasPending(s) { return s.turmas.some((x) => x.access_status === 'pending' || x.access_status === 'denied'); }
function _statusMix(s) {
  const c = { approved: 0, pending: 0, denied: 0 };
  s.turmas.forEach((x) => { c[x.access_status] = (c[x.access_status] || 0) + 1; });
  return c;
}
function _initials(s) {
  const n = (s.name || s.email || '?').trim();
  const parts = n.split(/\s+/);
  return ((parts[0] || '')[0] || '' ) + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '');
}

// ── shell ─────────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-alunos">' +
      '<div class="cdx-alunos-head">' +
        '<h1 class="cdx-alunos-h1">' + esc(t('alunos.title')) + '</h1>' +
        '<div class="cdx-alunos-stats" id="cdx-al-stats"></div>' +
      '</div>' +
      '<div class="cdx-alunos-tools">' +
        '<input type="search" class="cdx-alunos-search" id="cdx-al-search" placeholder="' + esc(t('alunos.search_ph')) + '" autocomplete="off">' +
        '<label class="cdx-alunos-filter"><input type="checkbox" id="cdx-al-fmulti">' + esc(t('alunos.filter_multi')) + '</label>' +
        '<label class="cdx-alunos-filter"><input type="checkbox" id="cdx-al-fpending">' + esc(t('alunos.filter_pending')) + '</label>' +
      '</div>' +
      '<div class="cdx-plist cdx-alunos-list" id="cdx-al-list"></div>' +
    '</div>';
}

// ── status chip ─────────────────────────────────────────────────────────────────
function _statusChip(st) {
  const key = st === 'approved' ? 'st_approved' : st === 'denied' ? 'st_denied' : 'st_pending';
  return '<span class="cdx-al-st cdx-al-st--' + esc(st || 'pending') + '">' + esc(t('alunos.' + key)) + '</span>';
}

// ── collapsed row (one per identity) ─────────────────────────────────────────────
function _row(s) {
  const multi = s.turma_count > 1;
  const open = !!_expanded[s.id];
  const verified = s.email_verified
    ? '<span class="cdx-al-val ok" title="' + esc(t('alunos.verified')) + '">✓</span>'
    : '<span class="cdx-al-val no" title="' + esc(t('alunos.unverified')) + '">•</span>';

  // The turma cell: single-turma shows the one turma + its status inline; multi shows the
  // "Várias turmas · N" summary + a status-mix breakdown, and the row expands for the detail.
  let turmaCell;
  if (multi) {
    const mix = _statusMix(s);
    const bits = [];
    if (mix.approved) bits.push('<span class="cdx-al-dot ok" title="' + esc(t('alunos.st_approved')) + '">' + mix.approved + '</span>');
    if (mix.pending) bits.push('<span class="cdx-al-dot pend" title="' + esc(t('alunos.st_pending')) + '">' + mix.pending + '</span>');
    if (mix.denied) bits.push('<span class="cdx-al-dot den" title="' + esc(t('alunos.st_denied')) + '">' + mix.denied + '</span>');
    turmaCell = '<span class="cdx-al-turma multi">' + esc(t('alunos.multi_label')) +
      ' <span class="cdx-al-n">' + t('alunos.turmas_n').replace('{n}', s.turma_count) + '</span>' +
      '<span class="cdx-al-mix">' + bits.join('') + '</span></span>';
  } else {
    const tm = s.turmas[0] || {};
    turmaCell = '<span class="cdx-al-turma">' + esc(tm.turma_name || '') + ' ' + _statusChip(tm.access_status) + '</span>';
  }

  const la = _relTime(s.last_access_at);
  const lastCell = '<span class="cdx-al-last">' + (la ? esc(la) : '<span class="cdx-al-never">' + esc(t('alunos.never')) + '</span>') + '</span>';
  const caret = '<span class="cdx-al-caret' + (open ? ' open' : '') + '">▸</span>';

  return '<div class="cdx-prow cdx-al-row' + (open ? ' is-open' : '') + '" data-sid="' + s.id + '">' +
      caret +
      '<span class="cdx-al-av">' + esc(_initials(s).toUpperCase()) + '</span>' +
      '<div class="cdx-prow-id">' +
        '<div class="cdx-prow-name">' + esc(s.name || s.email) + ' ' + verified + '</div>' +
        '<div class="cdx-prow-mail">' + esc(s.email) + '</div>' +
      '</div>' +
      turmaCell +
      lastCell +
    '</div>' +
    (open ? _detail(s) : '');
}

// ── expanded detail (one sub-row per turma + name variants) ──────────────────────
function _detail(s) {
  const variants = (s.name_variants && s.name_variants.length)
    ? '<div class="cdx-al-aka">' + esc(t('alunos.also_known').replace('{names}', s.name_variants.join(', '))) + '</div>'
    : '';
  const rows = s.turmas.map((x) => {
    const la = _relTime(x.last_access_at);
    return '<div class="cdx-al-trow" data-client="' + esc(x.client_slug) + '" data-turma="' + esc(x.turma_slug) + '">' +
        '<span class="cdx-al-tname">' + esc(x.turma_name) + '</span>' +
        _statusChip(x.access_status) +
        (x.approved_via ? '<span class="cdx-al-via">' + esc(x.approved_via) + '</span>' : '') +
        '<span class="cdx-al-tlast">' + (la ? esc(t('alunos.last_access') + ': ' + la) : esc(t('alunos.never'))) + '</span>' +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-al-open" data-client="' + esc(x.client_slug) + '" data-turma="' + esc(x.turma_slug) + '">' + esc(t('alunos.open_turma')) + '</button>' +
      '</div>';
  }).join('');
  return '<div class="cdx-al-detail">' + variants + rows + '</div>';
}

// ── filter + paint ───────────────────────────────────────────────────────────────
function _filtered() {
  const q = _search.trim().toLowerCase();
  return _students.filter((s) => {
    if (_fMulti && s.turma_count <= 1) return false;
    if (_fPending && !_hasPending(s)) return false;
    if (q && !((s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))) return false;
    return true;
  });
}

function _paintStats() {
  const el = _q('#cdx-al-stats');
  if (!el) return;
  const total = _students.length;
  const multi = _students.filter((s) => s.turma_count > 1).length;
  const pend = _students.filter(_hasPending).length;
  el.innerHTML =
    '<span class="cdx-al-stat">' + t('alunos.stat_total').replace('{n}', total) + '</span>' +
    '<span class="cdx-al-stat">' + t('alunos.stat_multi').replace('{n}', multi) + '</span>' +
    (pend ? '<span class="cdx-al-stat warn">' + t('alunos.stat_pending').replace('{n}', pend) + '</span>' : '');
}

function _paintList() {
  const el = _q('#cdx-al-list');
  if (!el) return;
  const rows = _filtered();
  if (!_students.length) { el.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.empty')) + '</span>'; return; }
  if (!rows.length) { el.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.no_match')) + '</span>'; return; }
  el.innerHTML = rows.map(_row).join('');
}

function _repaint() { _paintStats(); _paintList(); }

// ── wire ─────────────────────────────────────────────────────────────────────────
function _wire() {
  const search = _q('#cdx-al-search');
  if (search) search.addEventListener('input', (e) => { _search = e.target.value || ''; _paintList(); });
  const fm = _q('#cdx-al-fmulti');
  if (fm) fm.addEventListener('change', (e) => { _fMulti = !!e.target.checked; _paintList(); });
  const fp = _q('#cdx-al-fpending');
  if (fp) fp.addEventListener('change', (e) => { _fPending = !!e.target.checked; _paintList(); });

  const list = _q('#cdx-al-list');
  if (list) list.addEventListener('click', (e) => {
    // "Abrir turma" jumps to that turma's dossier; don't toggle the row for that click.
    const open = e.target.closest ? e.target.closest('.cdx-al-open') : null;
    if (open) {
      e.stopPropagation();
      location.href = '/codex/?tab=cohorts&sub=turmas&client=' + encodeURIComponent(open.dataset.client) + '&turma=' + encodeURIComponent(open.dataset.turma);
      return;
    }
    const row = e.target.closest ? e.target.closest('.cdx-al-row') : null;
    if (!row) return;
    const id = Number(row.dataset.sid);
    _expanded[id] = !_expanded[id];
    _paintList();
  });
}

// ── load ───────────────────────────────────────────────────────────────────────
function _load() {
  const el = _q('#cdx-al-list');
  if (el) el.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.loading')) + '</span>';
  api.listStudents({}).then((d) => {
    _students = (d && d.students) || [];
    _repaint();
  }).catch((e) => {
    notice.internal('alunos: load students failed: ' + (e && e.message || e));
    if (el) el.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.load_error')) + '</span>';
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _students = []; _search = ''; _fMulti = false; _fPending = false; _expanded = {};
  _renderShell();
  _wire();
  _load();
}

export function unmount() {
  _viewEl = null;
  _students = [];
  _expanded = {};
}
