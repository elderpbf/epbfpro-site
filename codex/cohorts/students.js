// cohorts/students.js
// "Alunos" sub-tab of Cohorts (track-28a2): the cross-turma deduped roster, in GLOBAL scope.
//
// This file is now only the SCOPE: load (no turma filter), filter/sort/search, the dupes button
// and the global actions. The list itself — rows, columns, expansion, the "+", the hovers — is
// cohorts/person-list.js, the exact component the turma dossiê renders in `turma` scope. Élder:
// "both the participant list in the dossier and this one should be the same list looking exactly
// the same with the same options. The only difference is that in the cohort it is pre-filtered
// for that cohort." So: same component, same data (ct_list_people), different filter.
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
import { hasStatus, hasPending, filterOptions } from './students-filters.js';
import { toolbarHtml, wireSelection, applyRosterAction } from './roster-actions.js';
import { openPersonEditModal } from './participant-edit.js';
import { dupesButtonHtml, openDupesModal } from './dupes-modal.js';
import { cpfValid, wireCpfMask } from '../js/person-fields.js';
import { ACTION_RULES, actionTargetStatus } from './participant-view.js';
import { personListHtml } from './person-list.js';
import { openAliasPopover } from './alias-popover.js';

let _viewEl = null;
let _people = [];
let _search = '';
let _fClient = '';    // '' = all clients
let _fStatus = '';    // '' | pending | denied | approved
let _fVerified = '';  // '' | yes | no
let _fTurmas = '';    // '' | single | multi
let _sort = 'name';   // name | turmas | last | status
let _expanded = {};
let _dupes = [];      // candidate duplicate pairs awaiting a verdict (ct_find_duplicates)

function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }
function _byId(pid) { return _people.find((s) => String(s.id) === String(pid)); }

// ── derived facts ─────────────────────────────────────────────────────────────────
function _name(s) { return s.name || s.email; }
function _worst(s) { return hasStatus(s, 'pending') ? 0 : hasStatus(s, 'denied') ? 1 : 2; }
// The participant rows an action would actually touch for this person (shared participant-view
// rules, same list the turma panel uses).
function _targets(s, act) {
  const rule = ACTION_RULES[act];
  if (!rule) return [];
  return (s.rows || [])
    .filter((x) => rule({ status: x.access_status, verified: !!x.email_verified }))
    .map((x) => x.participant_id);
}

// ── filters bar ───────────────────────────────────────────────────────────────────
function _opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }

function _toolsBar() {
  const opts = filterOptions(_people);
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
    // "Ir para a turma" — on the person's own line (single turma) or on a per-turma sub-line.
    const goBtn = e.target.closest('.cdx-pl-go');
    if (goBtn) {
      e.stopPropagation();
      location.href = '/codex/?tab=cohorts&sub=turmas&client=' + encodeURIComponent(goBtn.dataset.client) + '&turma=' + encodeURIComponent(goBtn.dataset.turma);
      return;
    }
    // The "+": this person's other addresses, in a small window (Élder).
    const plus = e.target.closest('.cdx-pl-plus');
    if (plus) {
      e.stopPropagation();
      const s = _byId((plus.closest('.cdx-pl-row') || {}).dataset ? plus.closest('.cdx-pl-row').dataset.person : '');
      openAliasPopover(plus, (plus.dataset.aliases || '').split(',').filter(Boolean), s && s.email);
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      e.stopPropagation();
      const row = editBtn.closest('.cdx-pl-row');
      const s = row && _byId(row.dataset.person);
      if (s) _openEdit(s);
      return;
    }
    // Expansion is the caret's job alone: a person with ONE turma has nothing to open, and a
    // click anywhere on the row must not fight the checkbox for the same gesture.
    const caret = e.target.closest('[data-caret]');
    if (!caret) return;
    e.stopPropagation();
    const row = caret.closest('.cdx-pl-row');
    if (!row) return;
    _expanded[row.dataset.person] = !_expanded[row.dataset.person];
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains('cdx-pl-detail')) detail.hidden = !_expanded[row.dataset.person];
    caret.setAttribute('aria-expanded', _expanded[row.dataset.person] ? 'true' : 'false');
  });
}


// The rows themselves are person-list.js (the SAME component the dossiê renders). This file no
// longer owns a renderer: the old private _row/_detail here, and the dossiê's _pRow over in
// cohorts.js, were two implementations of one list — which is exactly how they came to disagree
// about the same data. Élder: "nothing inside of this project should duplicate code."

// ── filter + sort ────────────────────────────────────────────────────────────────────
function _filtered() {
  const q = _search.trim().toLowerCase();
  const rows = _people.filter((s) => {
    if (_fTurmas === 'single' && s.turma_count !== 1) return false;
    if (_fTurmas === 'multi' && s.turma_count <= 1) return false;
    if (_fClient && !(s.rows || []).some((x) => x.client_slug === _fClient)) return false;
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
    await applyRosterAction(act, ids);   // the SAME apply the turma panel uses
  } catch (e) {
    notice.internal('alunos: ' + act + ' failed: ' + (e && e.message || e));
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
    // The SAME fields as the turma panel (Élder: it must be the same modal). The CPF belongs to the
    // person, so editing it here writes it to every turma row they hold.
    fields: [
      { key: 'name', label: t('cohorts.participant_name'), value: s.name || '', required: true,
        validate: (v) => (v ? null : t('cohorts.name_required')) },
      { key: 'email', label: t('cohorts.participant_email'), value: s.email, readonly: true },
      { key: 'cpf', label: t('cohorts.participant_cpf'), value: s.cpf || '', maxlength: 14,
        placeholder: t('cohorts.participant_cpf_ph'), onMount: (el) => wireCpfMask(el), secret: true,
        validate: (v) => (!v.replace(/\D/g, '') || cpfValid(v) ? null : t('cohorts.cpf_invalid')) },
    ],
    onSave: async (vals) => {
      await api.setCanonicalName({ student_id: s.id, name: vals.name });
      const cpf = vals.cpf.replace(/\D/g, '') ? vals.cpf : null;
      if ((s.cpf || null) !== cpf) {
        for (const x of (s.rows || [])) await api.updateParticipant({ id: x.participant_id, cpf });
      }
      await _load();
    },
    savedMsg: t('cohorts.participant_updated'),
  });
}

// ── paint ────────────────────────────────────────────────────────────────────────────
function _paintStats() {
  const el = _q('#cdx-al-stats');
  if (!el) return;
  const total = _people.length;
  const multi = _people.filter((s) => s.turma_count > 1).length;
  const pend = _people.filter(hasPending).length;
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
  const keep = new Set(Array.prototype.slice.call(host.querySelectorAll('.cdx-pl-row .cdx-pchk'))
    .filter((c) => c.checked).map((c) => c.closest('.cdx-pl-row').dataset.person));

  if (!_people.length) { host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.empty')) + '</span>'; return; }
  const rows = _filtered();
  if (!rows.length) { host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.no_match')) + '</span>'; return; }
  // THE list, in global scope. The dossiê renders the same call with scope 'turma'.
  host.innerHTML = toolbarHtml(true) + personListHtml(rows, { scope: 'global' });

  Array.prototype.slice.call(host.querySelectorAll('.cdx-pl-row')).forEach((r) => {
    if (keep.has(r.dataset.person)) { const c = r.querySelector('.cdx-pchk'); if (c) c.checked = true; }
    // Re-open whatever was open before the repaint.
    if (_expanded[r.dataset.person]) {
      const d = r.nextElementSibling;
      if (d && d.classList.contains('cdx-pl-detail')) d.hidden = false;
      const car = r.querySelector('[data-caret]');
      if (car) car.setAttribute('aria-expanded', 'true');
    }
  });

  wireSelection(host, {
    rowSel: '.cdx-pl-row',
    chkSel: '.cdx-pchk',
    ignoreSel: '[data-edit],[data-caret],.cdx-pl-plus,.cdx-pl-go',
    rowClickToggles: false,           // a row-click expands here; the checkbox owns selection
    // EVERY selected person must be actionable, exactly like the participants panel: selecting a
    // batch that is mostly already approved must not offer "Aprovar" (Élder 2026-07-14).
    enabledFor: (act, rowEls) => rowEls.every((r) => { const s = _byId(r.dataset.person); return !!(s && _targets(s, act).length); }),
    onApply: (act, rowEls) => _applyGlobal(act, rowEls.map((r) => _byId(r.dataset.person)).filter(Boolean)),
  });
}

function _repaint() { _paintStats(); _paintTools(); _paintList(); }

// ── load ─────────────────────────────────────────────────────────────────────────
function _load() {
  const host = _q('#cdx-al-roster');
  if (host) host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.loading')) + '</span>';
  // The duplicate scan must never break the roster, so its failure degrades to "no candidates".
  return Promise.all([
    api.listPeople({}).then((d) => { _people = (d && d.people) || []; }),
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
  _people = []; _dupes = []; _search = ''; _fClient = ''; _fStatus = ''; _fVerified = ''; _fTurmas = ''; _sort = 'name'; _expanded = {};
  _renderShell();
  _load();
}

export function unmount() {
  _viewEl = null;
  _people = [];
  _dupes = [];
  _expanded = {};
}
