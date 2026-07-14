// cohorts/students.js
// "Alunos" sub-tab of Cohorts (track-28a2): the cross-turma deduped roster. One line per
// CANONICAL identity (ct_students). A single-turma person shows their turma + status inline;
// a multi-turma person shows a global summary + "Várias turmas", and the line expands to one
// sub-row per turma.
//
// ACTIONS HERE ARE GLOBAL (Élder 2026-07-14): aprovar/bloquear/desbloquear/remover apply to EVERY
// turma of the selected people, fanning out only over the turmas where the action actually applies.
// Per-turma changes are made inside the cohort. Access still LIVES per-turma on the participant row
// (the a1 invariant): this view writes many rows at once, it never keys authorization off the
// identity. The name edit writes the LOCKED canonical name, the single source of truth.
//
// The bulk toolbar + selection come from roster-actions.js and the edit modal from
// participant-edit.js, both shared with the turma Participantes panel (no duplicated code).
// Routed here by cohorts.js when ctx.sub === 'alunos'.

import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import * as notice from '../js/notice.js';
import { initials } from '../js/names.js';
import { hasStatus, hasPending, filterOptions } from './students-filters.js';
import { toolbarHtml, wireSelection } from './roster-actions.js';
import { openPersonEditModal } from './participant-edit.js';
import { dupesButtonHtml, openDupesModal } from './dupes-modal.js';
import { ACTION_RULES, actionTargetStatus } from './participant-view.js';

let _viewEl = null;
let _students = [];
let _search = '';
let _fClient = '';    // '' = all clients
let _fStatus = '';    // '' | pending | denied | approved
let _fVerified = '';  // '' | yes | no
let _fTurmas = '';    // '' | single | multi
let _sort = 'name';   // name | turmas | last | status
let _expanded = {};
let _dupes = [];      // candidate duplicate pairs awaiting a verdict (ct_find_duplicates)

function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }
function _byId(sid) { return _students.find((s) => String(s.id) === String(sid)); }

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
function _name(s) { return s.name || s.email; }
function _worst(s) { return hasStatus(s, 'pending') ? 0 : hasStatus(s, 'denied') ? 1 : 2; }
function _statusMix(s) {
  const c = { approved: 0, pending: 0, denied: 0 };
  s.turmas.forEach((x) => { c[x.access_status] = (c[x.access_status] || 0) + 1; });
  return c;
}
// The participant rows an action would actually touch for this person (participant-view rules).
function _targets(s, act) {
  const rule = ACTION_RULES[act];
  return rule ? s.turmas.filter((x) => rule(x.access_status)).map((x) => x.participant_id) : [];
}

// ── filters bar ───────────────────────────────────────────────────────────────────
function _opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }

function _toolsBar() {
  const opts = filterOptions(_students);
  // A filter select renders only when it has options that actually partition the roster
  // (students-filters.filterOptions); otherwise it is omitted. Élder 2026-07-14: hide filters
  // nobody needs. The '' option is the "no filter" default, carrying the filter's name.
  const sel = (id, cur, title, present, labelOf) => present.length
    ? '<select class="cdx-alunos-sel" id="' + id + '" title="' + esc(title) + '">' +
        _opt('', cur, title) + present.map((v) => _opt(v, cur, labelOf(v))).join('') +
      '</select>'
    : '';
  const statusLbl = { pending: t('alunos.opt_pending'), denied: t('alunos.opt_denied'), approved: t('alunos.opt_all_ok') };
  const verLbl    = { yes: t('alunos.opt_ver_yes'), no: t('alunos.opt_ver_no') };
  const turmaLbl  = { single: t('alunos.opt_single'), multi: t('alunos.opt_multi') };
  return '<div class="cdx-alunos-tools">' +
    '<input type="search" class="cdx-alunos-search" id="cdx-al-search" placeholder="' + esc(t('alunos.search_ph')) + '" autocomplete="off" value="' + esc(_search) + '">' +
    sel('cdx-al-fclient', _fClient, t('alunos.f_client'), opts.clients, (c) => c) +
    sel('cdx-al-fstatus', _fStatus, t('alunos.f_status'), opts.status, (v) => statusLbl[v]) +
    sel('cdx-al-fver', _fVerified, t('alunos.f_verified'), opts.verified, (v) => verLbl[v]) +
    sel('cdx-al-fturmas', _fTurmas, t('alunos.f_turmas'), opts.turmas, (v) => turmaLbl[v]) +
    '<span class="cdx-alunos-spacer"></span>' +
    '<select class="cdx-alunos-sel" id="cdx-al-sort" title="' + esc(t('alunos.sort_by')) + '">' +
      _opt('name', _sort, t('alunos.sort_name')) + _opt('turmas', _sort, t('alunos.sort_turmas')) +
      _opt('last', _sort, t('alunos.sort_last')) + _opt('status', _sort, t('alunos.sort_status')) + '</select>' +
    dupesButtonHtml(_dupes.length) +
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
        '<div id="cdx-al-tools"></div>' +
        '<div id="cdx-al-roster"></div>' +
      '</div>' +
    '</div>';
  // Delegated once on the stable hosts, so the inner HTML can be repainted freely.
  const tools = _q('#cdx-al-tools');
  if (tools) {
    tools.addEventListener('input', (e) => { if (e.target.id === 'cdx-al-search') { _search = e.target.value || ''; _paintList(); } });
    tools.addEventListener('change', (e) => {
      const id = e.target.id, v = e.target.value;
      if (id === 'cdx-al-fclient') _fClient = v;
      else if (id === 'cdx-al-fstatus') _fStatus = v;
      else if (id === 'cdx-al-fver') _fVerified = v;
      else if (id === 'cdx-al-fturmas') _fTurmas = v;
      else if (id === 'cdx-al-sort') _sort = v;
      else return;
      _paintList();
    });
    // The duplicates tool: its counter says how many pairs await a verdict.
    tools.addEventListener('click', (e) => {
      if (e.target.closest('#cdx-al-dupes')) openDupesModal(_dupes, () => _load());
    });
  }
  const roster = _q('#cdx-al-roster');
  if (roster) roster.addEventListener('click', (e) => {
    // Selection (checkbox) and the bulk toolbar are owned by roster-actions; ignore them here.
    if (e.target.closest('.cdx-pchk') || e.target.closest('.cdx-ptb')) return;
    const openBtn = e.target.closest('.cdx-al-open');
    if (openBtn) {
      e.stopPropagation();
      location.href = '/codex/?tab=cohorts&sub=turmas&client=' + encodeURIComponent(openBtn.dataset.client) + '&turma=' + encodeURIComponent(openBtn.dataset.turma);
      return;
    }
    const editBtn = e.target.closest('.cdx-al-edit');
    if (editBtn) { e.stopPropagation(); const s = _byId(editBtn.dataset.sid); if (s) _openEdit(s); return; }
    if (e.target.closest('.cdx-al-detail')) return;
    const row = e.target.closest('.cdx-al-row');
    if (!row) return;
    _expanded[row.dataset.sid] = !_expanded[row.dataset.sid];
    _paintList();
  });
}

// ── chips ─────────────────────────────────────────────────────────────────────────
function _statusChip(st) {
  const key = st === 'approved' ? 'st_approved' : st === 'denied' ? 'st_denied' : 'st_pending';
  return '<span class="cdx-al-st cdx-al-st--' + esc(st || 'pending') + '">' + esc(t('alunos.' + key)) + '</span>';
}

// ── collapsed row (one per identity) ────────────────────────────────────────────────
function _row(s) {
  const multi = s.turma_count > 1;
  const open = !!_expanded[s.id];
  const nm = _name(s);
  const verified = s.email_verified
    ? '<span class="cdx-al-val ok" title="' + esc(t('alunos.verified')) + '">✓</span>'
    : '<span class="cdx-al-val no" title="' + esc(t('alunos.unverified')) + '">•</span>';
  // The identity is not students-only (ct_students.role); show the role when it is anything else.
  const role = (s.role && s.role !== 'student') ? '<span class="cdx-al-role">' + esc(s.role) + '</span>' : '';

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

  return '<div class="cdx-prow cdx-al-row' + (open ? ' is-open' : '') + '" data-sid="' + esc(String(s.id)) + '">' +
      '<input type="checkbox" class="cdx-pchk" aria-label="' + esc(nm) + '">' +
      caret +
      '<span class="cdx-al-av">' + esc(initials(nm)) + '</span>' +
      '<div class="cdx-prow-id">' +
        '<div class="cdx-prow-name">' + esc(nm) + ' ' + verified + role + '</div>' +
        '<div class="cdx-prow-mail">' + esc(s.email) + '</div>' +
      '</div>' +
      turmaCell +
      lastCell +
      '<button type="button" class="cdx-al-edit cdx-prow-edit" data-sid="' + esc(String(s.id)) + '" title="' + esc(t('alunos.edit_title')) + '">✎</button>' +
    '</div>' +
    (open ? _detail(s) : '');
}

// ── expanded detail (one sub-row per turma) ──────────────────────────────────────────
function _detail(s) {
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
  return '<div class="cdx-al-detail">' + rows + '</div>';
}

// ── filter + sort ────────────────────────────────────────────────────────────────────
function _filtered() {
  const q = _search.trim().toLowerCase();
  const rows = _students.filter((s) => {
    if (_fTurmas === 'single' && s.turma_count !== 1) return false;
    if (_fTurmas === 'multi' && s.turma_count <= 1) return false;
    if (_fClient && !s.turmas.some((x) => x.client_slug === _fClient)) return false;
    if (_fStatus === 'pending' && !hasStatus(s, 'pending')) return false;
    if (_fStatus === 'denied' && !hasStatus(s, 'denied')) return false;
    if (_fStatus === 'approved' && hasPending(s)) return false;
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

// ── global actions (fan out across every turma the action applies to) ────────────────
async function _applyGlobal(act, people) {
  const ids = [];
  people.forEach((s) => { _targets(s, act).forEach((id) => ids.push(id)); });
  if (!ids.length) return;
  if (act === 'remove' && typeof confirm === 'function' && !confirm(t('alunos.remove_confirm_global'))) return;
  try {
    if (act === 'remove') {
      for (const id of ids) {
        await api.deleteParticipant({ id }).catch((e) => notice.internal('alunos: remove failed: ' + (e && e.message || e)));
      }
    } else {
      const status = actionTargetStatus(act);
      const payload = { participant_ids: ids, status };
      if (status === 'approved') payload.origin = location.origin;
      await api.setParticipantAccess(payload).catch((e) => notice.internal('alunos: set access failed: ' + (e && e.message || e)));
    }
  } finally {
    _load();
  }
}

// The identity edit: the name writes the LOCKED canonical (one source of truth, every surface
// reading it gets the fix). The e-mail IS the identity key, so changing it is a merge, not an
// edit; that lives in the duplicates tool, hence read-only here (Élder 2026-07-14).
function _openEdit(s) {
  openPersonEditModal({
    title: t('alunos.edit_title'),
    fields: [
      { key: 'name', label: t('cohorts.participant_name'), value: s.name || '', required: true,
        validate: (v) => (v ? null : t('cohorts.name_required')) },
      { key: 'email', label: t('cohorts.participant_email'), value: s.email, readonly: true },
    ],
    onSave: (vals) => api.setCanonicalName({ student_id: s.id, name: vals.name }).then(() => _load()),
    savedMsg: t('cohorts.participant_updated'),
  });
}

// ── paint ────────────────────────────────────────────────────────────────────────────
function _paintStats() {
  const el = _q('#cdx-al-stats');
  if (!el) return;
  const total = _students.length;
  const multi = _students.filter((s) => s.turma_count > 1).length;
  const pend = _students.filter(hasPending).length;
  el.innerHTML =
    '<span class="cdx-al-stat">' + t('alunos.stat_total').replace('{n}', total) + '</span>' +
    '<span class="cdx-al-stat">' + t('alunos.stat_multi').replace('{n}', multi) + '</span>' +
    (pend ? '<span class="cdx-al-stat warn">' + t('alunos.stat_pending').replace('{n}', pend) + '</span>' : '');
}

function _paintTools() {
  const el = _q('#cdx-al-tools');
  if (el) el.innerHTML = _toolsBar();
}

function _paintList() {
  const host = _q('#cdx-al-roster');
  if (!host) return;
  // Carry the selection across a repaint (expand / filter / sort), keyed by identity.
  const keep = new Set(Array.prototype.slice.call(host.querySelectorAll('.cdx-al-row .cdx-pchk'))
    .filter((c) => c.checked).map((c) => c.closest('.cdx-al-row').dataset.sid));

  if (!_students.length) { host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.empty')) + '</span>'; return; }
  const rows = _filtered();
  if (!rows.length) { host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.no_match')) + '</span>'; return; }
  host.innerHTML = toolbarHtml(true) + '<div class="cdx-plist cdx-alunos-list">' + rows.map(_row).join('') + '</div>';

  Array.prototype.slice.call(host.querySelectorAll('.cdx-al-row')).forEach((r) => {
    if (!keep.has(r.dataset.sid)) return;
    const c = r.querySelector('.cdx-pchk');
    if (c) c.checked = true;
  });

  wireSelection(host, {
    rowSel: '.cdx-al-row',
    chkSel: '.cdx-pchk',
    rowClickToggles: false,           // a row-click expands here; the checkbox owns selection
    enabledFor: (act, rowEls) => rowEls.some((r) => { const s = _byId(r.dataset.sid); return !!(s && _targets(s, act).length); }),
    onApply: (act, rowEls) => _applyGlobal(act, rowEls.map((r) => _byId(r.dataset.sid)).filter(Boolean)),
  });
}

function _repaint() { _paintStats(); _paintTools(); _paintList(); }

// ── load ─────────────────────────────────────────────────────────────────────────
function _load() {
  const host = _q('#cdx-al-roster');
  if (host) host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.loading')) + '</span>';
  // The duplicate scan must never break the roster, so its failure degrades to "no candidates".
  return Promise.all([
    api.listStudents({}).then((d) => { _students = (d && d.students) || []; }),
    api.findDuplicates({}).then((d) => { _dupes = (d && d.pairs) || []; })
      .catch((e) => { _dupes = []; notice.internal('alunos: duplicate scan failed: ' + (e && e.message || e)); }),
  ]).then(() => _repaint()).catch((e) => {
    notice.internal('alunos: load students failed: ' + (e && e.message || e));
    if (host) host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.load_error')) + '</span>';
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _students = []; _dupes = []; _search = ''; _fClient = ''; _fStatus = ''; _fVerified = ''; _fTurmas = ''; _sort = 'name'; _expanded = {};
  _renderShell();
  _load();
}

export function unmount() {
  _viewEl = null;
  _students = [];
  _dupes = [];
  _expanded = {};
}
