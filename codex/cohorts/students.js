// cohorts/students.js
// "Alunos" sub-tab of Cohorts (track-28a2): the cross-turma deduped roster. One line per
// CANONICAL identity (ct_students). A single-turma person shows their turma + status inline;
// a multi-turma person shows a global summary + "Várias turmas", and the line expands to one
// sub-row per turma. Access stays per-turma (backend keeps it on the participant row); this
// view only READS. Look/feel mirrors the dossier Participantes list (.cdx-prow); the list sits
// in its own card. Names/initials come from js/names.js (derived from e-mail when unnamed).
// Routed here by cohorts.js when ctx.sub === 'alunos'.

import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import * as notice from '../js/notice.js';
import { displayName, isDerived, initials } from '../js/names.js';

let _viewEl = null;
let _students = [];
let _search = '';
let _fClient = '';    // '' = all clients
let _fStatus = '';    // '' | pending | denied | approved
let _fVerified = '';  // '' | yes | no
let _fTurmas = '';    // '' | single | multi
let _sort = 'name';   // name | turmas | last | status
let _expanded = {};

function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// ── time (frontend, Date is fine) ────────────────────────────────────────────────
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

// ── derived facts ─────────────────────────────────────────────────────────────────
function _name(s) { return displayName(s.name, s.email); }
function _hasStatus(s, st) { return s.turmas.some((x) => x.access_status === st); }
function _hasPending(s) { return _hasStatus(s, 'pending') || _hasStatus(s, 'denied'); }
function _worst(s) { return _hasStatus(s, 'pending') ? 0 : _hasStatus(s, 'denied') ? 1 : 2; }
function _statusMix(s) {
  const c = { approved: 0, pending: 0, denied: 0 };
  s.turmas.forEach((x) => { c[x.access_status] = (c[x.access_status] || 0) + 1; });
  return c;
}
function _clients() {
  const set = new Set();
  _students.forEach((s) => s.turmas.forEach((x) => x.client_slug && set.add(x.client_slug)));
  return Array.from(set).sort();
}

// ── shell (header on bg + a card holding tools + list) ────────────────────────────
function _opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }

function _toolsBar() {
  const clientOpts = _opt('', _fClient, t('alunos.f_all_clients')) +
    _clients().map((c) => _opt(c, _fClient, c)).join('');
  return '<div class="cdx-alunos-tools">' +
    '<input type="search" class="cdx-alunos-search" id="cdx-al-search" placeholder="' + esc(t('alunos.search_ph')) + '" autocomplete="off" value="' + esc(_search) + '">' +
    '<select class="cdx-alunos-sel" id="cdx-al-fclient" title="' + esc(t('alunos.f_client')) + '">' + clientOpts + '</select>' +
    '<select class="cdx-alunos-sel" id="cdx-al-fstatus" title="' + esc(t('alunos.f_status')) + '">' +
      _opt('', _fStatus, t('alunos.f_status')) + _opt('pending', _fStatus, t('alunos.opt_pending')) +
      _opt('denied', _fStatus, t('alunos.opt_denied')) + _opt('approved', _fStatus, t('alunos.opt_all_ok')) + '</select>' +
    '<select class="cdx-alunos-sel" id="cdx-al-fver" title="' + esc(t('alunos.f_verified')) + '">' +
      _opt('', _fVerified, t('alunos.f_verified')) + _opt('yes', _fVerified, t('alunos.opt_ver_yes')) +
      _opt('no', _fVerified, t('alunos.opt_ver_no')) + '</select>' +
    '<select class="cdx-alunos-sel" id="cdx-al-fturmas" title="' + esc(t('alunos.f_turmas')) + '">' +
      _opt('', _fTurmas, t('alunos.f_turmas')) + _opt('single', _fTurmas, t('alunos.opt_single')) +
      _opt('multi', _fTurmas, t('alunos.opt_multi')) + '</select>' +
    '<span class="cdx-alunos-spacer"></span>' +
    '<select class="cdx-alunos-sel" id="cdx-al-sort" title="' + esc(t('alunos.sort_by')) + '">' +
      _opt('name', _sort, t('alunos.sort_name')) + _opt('turmas', _sort, t('alunos.sort_turmas')) +
      _opt('last', _sort, t('alunos.sort_last')) + _opt('status', _sort, t('alunos.sort_status')) + '</select>' +
  '</div>';
}

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-alunos">' +
      '<div class="cdx-alunos-head">' +
        '<h1 class="cdx-alunos-h1">' + esc(t('alunos.title')) + '</h1>' +
        '<div class="cdx-alunos-stats" id="cdx-al-stats"></div>' +
      '</div>' +
      '<div class="cdx-alunos-card">' +
        _toolsBar() +
        '<div class="cdx-plist cdx-alunos-list" id="cdx-al-list"></div>' +
      '</div>' +
    '</div>';
}

// ── status chip ───────────────────────────────────────────────────────────────────
function _statusChip(st) {
  const key = st === 'approved' ? 'st_approved' : st === 'denied' ? 'st_denied' : 'st_pending';
  return '<span class="cdx-al-st cdx-al-st--' + esc(st || 'pending') + '">' + esc(t('alunos.' + key)) + '</span>';
}

// ── collapsed row (one per identity) ────────────────────────────────────────────────
function _row(s) {
  const multi = s.turma_count > 1;
  const open = !!_expanded[s.id];
  const nm = _name(s);
  const derived = isDerived(s.name, s.email);
  const verified = s.email_verified
    ? '<span class="cdx-al-val ok" title="' + esc(t('alunos.verified')) + '">✓</span>'
    : '<span class="cdx-al-val no" title="' + esc(t('alunos.unverified')) + '">•</span>';

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
  const nameCls = 'cdx-prow-name' + (derived ? ' cdx-al-derived' : '');
  const nameTitle = derived ? ' title="' + esc(t('alunos.derived_name')) + '"' : '';

  return '<div class="cdx-prow cdx-al-row' + (open ? ' is-open' : '') + '" data-sid="' + s.id + '">' +
      caret +
      '<span class="cdx-al-av">' + esc(initials(nm)) + '</span>' +
      '<div class="cdx-prow-id">' +
        '<div class="' + nameCls + '"' + nameTitle + '>' + esc(nm) + ' ' + verified + '</div>' +
        '<div class="cdx-prow-mail">' + esc(s.email) + '</div>' +
      '</div>' +
      turmaCell +
      lastCell +
    '</div>' +
    (open ? _detail(s) : '');
}

// ── expanded detail (one sub-row per turma + name variants) ──────────────────────────
function _detail(s) {
  const variants = (s.name_variants && s.name_variants.length)
    ? '<div class="cdx-al-aka">' + esc(t('alunos.also_known').replace('{names}', s.name_variants.join(', '))) + '</div>'
    : '';
  const rows = s.turmas.map((x) => {
    const la = _relTime(x.last_access_at);
    return '<div class="cdx-al-trow">' +
        '<span class="cdx-al-tname">' + esc(x.turma_name) + '</span>' +
        _statusChip(x.access_status) +
        (x.approved_via ? '<span class="cdx-al-via">' + esc(x.approved_via) + '</span>' : '') +
        '<span class="cdx-al-tlast">' + (la ? esc(t('alunos.last_access') + ': ' + la) : esc(t('alunos.never'))) + '</span>' +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-al-open" data-client="' + esc(x.client_slug) + '" data-turma="' + esc(x.turma_slug) + '">' + esc(t('alunos.open_turma')) + '</button>' +
      '</div>';
  }).join('');
  return '<div class="cdx-al-detail">' + variants + rows + '</div>';
}

// ── filter + sort + paint ────────────────────────────────────────────────────────────
function _filtered() {
  const q = _search.trim().toLowerCase();
  const rows = _students.filter((s) => {
    if (_fTurmas === 'single' && s.turma_count !== 1) return false;
    if (_fTurmas === 'multi' && s.turma_count <= 1) return false;
    if (_fClient && !s.turmas.some((x) => x.client_slug === _fClient)) return false;
    if (_fStatus === 'pending' && !_hasStatus(s, 'pending')) return false;
    if (_fStatus === 'denied' && !_hasStatus(s, 'denied')) return false;
    if (_fStatus === 'approved' && _hasPending(s)) return false;
    if (_fVerified === 'yes' && !s.email_verified) return false;
    if (_fVerified === 'no' && s.email_verified) return false;
    if (q && !(_name(s).toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))) return false;
    return true;
  });
  const byName = (a, b) => _name(a).localeCompare(_name(b));
  if (_sort === 'turmas') rows.sort((a, b) => (b.turma_count - a.turma_count) || byName(a, b));
  else if (_sort === 'last') rows.sort((a, b) => (Number(b.last_access_at || 0) - Number(a.last_access_at || 0)) || byName(a, b));
  else if (_sort === 'status') rows.sort((a, b) => (_worst(a) - _worst(b)) || byName(a, b));
  else rows.sort(byName);
  return rows;
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

// ── wire ───────────────────────────────────────────────────────────────────────────
function _wire() {
  const on = (id, ev, fn) => { const e = _q(id); if (e) e.addEventListener(ev, fn); };
  on('#cdx-al-search', 'input', (e) => { _search = e.target.value || ''; _paintList(); });
  on('#cdx-al-fclient', 'change', (e) => { _fClient = e.target.value; _paintList(); });
  on('#cdx-al-fstatus', 'change', (e) => { _fStatus = e.target.value; _paintList(); });
  on('#cdx-al-fver', 'change', (e) => { _fVerified = e.target.value; _paintList(); });
  on('#cdx-al-fturmas', 'change', (e) => { _fTurmas = e.target.value; _paintList(); });
  on('#cdx-al-sort', 'change', (e) => { _sort = e.target.value; _paintList(); });

  const list = _q('#cdx-al-list');
  if (list) list.addEventListener('click', (e) => {
    const open = e.target.closest ? e.target.closest('.cdx-al-open') : null;
    if (open) {
      e.stopPropagation();
      location.href = '/codex/?tab=cohorts&sub=turmas&client=' + encodeURIComponent(open.dataset.client) + '&turma=' + encodeURIComponent(open.dataset.turma);
      return;
    }
    const row = e.target.closest ? e.target.closest('.cdx-al-row') : null;
    if (!row) return;
    _expanded[Number(row.dataset.sid)] = !_expanded[Number(row.dataset.sid)];
    _paintList();
  });
}

// ── load ─────────────────────────────────────────────────────────────────────────
function _load() {
  const el = _q('#cdx-al-list');
  if (el) el.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.loading')) + '</span>';
  api.listStudents({}).then((d) => {
    _students = (d && d.students) || [];
    // clients dropdown depends on the data, so re-render the tools bar once loaded
    const card = _viewEl && _viewEl.querySelector('.cdx-alunos-card');
    if (card) { card.innerHTML = _toolsBar() + '<div class="cdx-plist cdx-alunos-list" id="cdx-al-list"></div>'; _wire(); }
    _repaint();
  }).catch((e) => {
    notice.internal('alunos: load students failed: ' + (e && e.message || e));
    if (el) el.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.load_error')) + '</span>';
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _students = []; _search = ''; _fClient = ''; _fStatus = ''; _fVerified = ''; _fTurmas = ''; _sort = 'name'; _expanded = {};
  _renderShell();
  _wire();
  _load();
}

export function unmount() {
  _viewEl = null;
  _students = [];
  _expanded = {};
}
