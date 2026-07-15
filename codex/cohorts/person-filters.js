// cohorts/person-filters.js
// The filter/search/sort bar for THE people list, shared by both scopes (track-28a2, 2026-07-15).
//
// WHY THIS EXISTS: the dossiê used to group people into Pendentes / Aprovados / Bloqueados
// sections while the global roster used a status FILTER — the same question answered two
// different ways. Élder: "if it's going to diverge from the persons list then it should either be
// part of both of them, [or] removed." Sections cannot be part of both: in global scope a person
// spans SEVERAL turmas and therefore several statuses at once (approved here, pending there), so
// there is no one section to put them in. That settles it — the sections go, and this bar (which
// works identically in both scopes) is what replaces them.
//
// The scope difference needs no special-casing: filterOptions() already drops any filter whose
// buckets do not partition the list, so inside ONE turma the client filter (one client) and the
// single/multi filter (everyone has exactly one row) disappear on their own. Élder's own rule
// — "don't show options that none have, this serves for all filters" — does the work.
//
// State is passed in, never held here: each surface owns its own filter state, so the two lists
// never fight over one global.

import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { filterOptions, hasStatus, hasPending } from './students-filters.js';

export function emptyFilterState() {
  return { search: '', client: '', status: '', verified: '', turmas: '', sort: 'name' };
}

// The <select> ids, exported so each surface can wire change events without re-deriving them.
export const FILTER_IDS = {
  search: 'cdx-al-search',
  client: 'cdx-al-fclient',
  status: 'cdx-al-fstatus',
  verified: 'cdx-al-fver',
  turmas: 'cdx-al-fturmas',
  sort: 'cdx-al-sort',
};

// Map a changed control back onto the state. Returns true when it was one of ours.
export function applyFilterChange(state, id, value) {
  const key = Object.keys(FILTER_IDS).find((k) => FILTER_IDS[k] === id);
  if (!key) return false;
  state[key] = value || '';
  return true;
}

function opt(v, cur, label) {
  return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
}

// `extra` is scope-specific HTML pinned to the right of the bar (the dupes button, global-only).
export function filtersBarHtml(state, people, extra) {
  const s = state || emptyFilterState();
  const opts = filterOptions(people || []);
  // A select renders only when its options actually partition the list; otherwise it is omitted.
  const sel = (id, cur, title, present, labelOf) => present.length
    ? '<select class="cdx-alunos-sel" id="' + id + '" title="' + esc(title) + '">' +
        opt('', cur, title) + present.map((v) => opt(v, cur, labelOf(v))).join('') +
      '</select>'
    : '';
  const statusLbl = { pending: t('alunos.opt_pending'), denied: t('alunos.opt_denied'), approved: t('alunos.opt_all_ok') };
  const verLbl = { yes: t('alunos.opt_ver_yes'), no: t('alunos.opt_ver_no') };
  const turmaLbl = { single: t('alunos.opt_single'), multi: t('alunos.opt_multi') };
  // The turma-count sort only means something when people can have more than one.
  const multiTurma = (people || []).some((p) => p.turma_count > 1);
  return '<div class="cdx-alunos-tools">' +
    '<input type="search" class="cdx-alunos-search" id="' + FILTER_IDS.search + '" placeholder="' +
      esc(t('alunos.search_ph')) + '" autocomplete="off" value="' + esc(s.search) + '">' +
    sel(FILTER_IDS.client, s.client, t('alunos.f_client'), opts.clients, (c) => c) +
    sel(FILTER_IDS.status, s.status, t('alunos.f_status'), opts.status, (v) => statusLbl[v]) +
    sel(FILTER_IDS.verified, s.verified, t('alunos.f_verified'), opts.verified, (v) => verLbl[v]) +
    sel(FILTER_IDS.turmas, s.turmas, t('alunos.f_turmas'), opts.turmas, (v) => turmaLbl[v]) +
    '<span class="cdx-alunos-spacer"></span>' +
    '<select class="cdx-alunos-sel" id="' + FILTER_IDS.sort + '" title="' + esc(t('alunos.sort_by')) + '">' +
      opt('name', s.sort, t('alunos.sort_name')) +
      (multiTurma ? opt('turmas', s.sort, t('alunos.sort_turmas')) : '') +
      opt('last', s.sort, t('alunos.sort_last')) +
      opt('status', s.sort, t('alunos.sort_status')) +
    '</select>' +
    (extra || '') +
  '</div>';
}

const nameOf = (p) => p.name || p.email || '';
// Worst standing first: something pending needs you before something merely blocked.
const worst = (p) => (hasStatus(p, 'pending') ? 0 : hasStatus(p, 'denied') ? 1 : 2);

// PURE. The filter + sort both scopes run — the same predicates, so "pendente" means the same
// thing in the dossiê as in the roster.
export function applyFilters(people, state) {
  const s = state || emptyFilterState();
  const q = String(s.search || '').trim().toLowerCase();
  const rows = (people || []).filter((p) => {
    if (s.turmas === 'single' && p.turma_count !== 1) return false;
    if (s.turmas === 'multi' && p.turma_count <= 1) return false;
    if (s.client && !(p.rows || []).some((x) => x.client_slug === s.client)) return false;
    if (s.status === 'pending' && !hasStatus(p, 'pending')) return false;
    if (s.status === 'denied' && !hasStatus(p, 'denied')) return false;
    if (s.status === 'approved' && hasPending(p)) return false;
    if (s.verified === 'yes' && !p.email_verified) return false;
    if (s.verified === 'no' && p.email_verified) return false;
    if (q && !(nameOf(p).toLowerCase().includes(q) || String(p.email || '').toLowerCase().includes(q))) return false;
    return true;
  });
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
  if (s.sort === 'turmas') rows.sort((a, b) => (b.turma_count - a.turma_count) || byName(a, b));
  else if (s.sort === 'last') rows.sort((a, b) => (Number(b.last_access_at || 0) - Number(a.last_access_at || 0)) || byName(a, b));
  else if (s.sort === 'status') rows.sort((a, b) => (worst(a) - worst(b)) || byName(a, b));
  else rows.sort(byName);
  return rows;
}
