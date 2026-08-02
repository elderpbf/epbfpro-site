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
import { SORT_DEFAULT_DIR } from './person-list.js';
import { accessOf } from '../js/access-model.js';
import { makeMatcher } from '../js/text-search.js';

export function emptyFilterState() {
  return { search: '', client: '', status: '', verified: '', turmas: '', sort: 'name', dir: 'asc' };
}

// The <select> ids, exported so each surface can wire change events without re-deriving them.
// No sort select any more: the column headers ARE the sort control (Élder 2026-07-15, "since we have
// column headers now, let's make them sort by those; so the sort dropdown is no longer needed").
export const FILTER_IDS = {
  search: 'cdx-al-search',
  client: 'cdx-al-fclient',
  status: 'cdx-al-fstatus',
  verified: 'cdx-al-fver',
  turmas: 'cdx-al-fturmas',
};

// Map a changed control back onto the state. Returns true when it was one of ours.
export function applyFilterChange(state, id, value) {
  const key = Object.keys(FILTER_IDS).find((k) => FILTER_IDS[k] === id);
  if (!key) return false;
  state[key] = value || '';
  return true;
}

// A header click: same column -> reverse; new column -> open on ITS natural end (name A→Z, but the
// others on "most turmas" / "worst standing" / "most live", which is what you click them to see).
export function applySortClick(state, key) {
  if (!key) return false;
  const s = state || {};
  if (s.sort === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  else { s.sort = key; s.dir = SORT_DEFAULT_DIR[key] || 'asc'; }
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
  return '<div class="cdx-alunos-tools">' +
    '<input type="search" class="cdx-alunos-search" id="' + FILTER_IDS.search + '" placeholder="' +
      esc(t('alunos.search_ph')) + '" autocomplete="off" value="' + esc(s.search) + '">' +
    sel(FILTER_IDS.client, s.client, t('alunos.f_client'), opts.clients, (c) => c) +
    sel(FILTER_IDS.status, s.status, t('alunos.f_status'), opts.status, (v) => statusLbl[v]) +
    sel(FILTER_IDS.verified, s.verified, t('alunos.f_verified'), opts.verified, (v) => verLbl[v]) +
    sel(FILTER_IDS.turmas, s.turmas, t('alunos.f_turmas'), opts.turmas, (v) => turmaLbl[v]) +
    '<span class="cdx-alunos-spacer"></span>' +
    (extra || '') +
  '</div>';
}

const nameOf = (p) => p.name || p.email || '';
// Worst standing first: something pending needs you before something merely blocked.
const worst = (p) => (hasStatus(p, 'pending') ? 0 : hasStatus(p, 'denied') ? 1 : 2);

// The acesso column shows the LIVE SESSION — time left, "sessão expirada", "nunca entrou" — so its
// header sorts by exactly that, in the order the cell reads: live (longest left first) > expirada >
// nunca > nada. Sorting it by último acesso would order the column by a number it does not display;
// último acesso lives in the cell's hover instead. (This replaces the old "último acesso" option of
// the dropdown, which no longer exists.)
function accessRank(p, now) {
  const rows = p.rows || [];
  if (!rows.length) return { tier: 3, left: 0 };
  let best = { tier: 3, left: 0 };
  for (const r of rows) {
    const a = accessOf(r, now);
    const tier = a.state === 'live' ? 0 : a.state === 'lapsed' ? 1 : a.state === 'never' ? 2 : 3;
    const left = a.state === 'live' ? Math.max(0, Number(r.session_expires_at || 0) - now) : 0;
    if (tier < best.tier || (tier === best.tier && left > best.left)) best = { tier, left };
  }
  return best;
}

// PURE. The filter + sort both scopes run — the same predicates, so "pendente" means the same
// thing in the dossiê as in the roster.
export function applyFilters(people, state) {
  const s = state || emptyFilterState();
  // Shared matcher (js/text-search.js): folds case AND accents, so "joao" finds
  // "João" and "inacio" finds "Inácio". A student roster is the surface where
  // that matters most — the name was typed by the student, the query by Élder.
  // Hoisted out of the filter: one matcher for the whole list, not per person.
  const hit = makeMatcher(s.search);
  const rows = (people || []).filter((p) => {
    if (s.turmas === 'single' && p.turma_count !== 1) return false;
    if (s.turmas === 'multi' && p.turma_count <= 1) return false;
    if (s.client && !(p.rows || []).some((x) => x.client_slug === s.client)) return false;
    if (s.status === 'pending' && !hasStatus(p, 'pending')) return false;
    if (s.status === 'denied' && !hasStatus(p, 'denied')) return false;
    if (s.status === 'approved' && hasPending(p)) return false;
    if (s.verified === 'yes' && !p.email_verified) return false;
    if (s.verified === 'no' && p.email_verified) return false;
    if (!hit(nameOf(p), p.email)) return false;
    return true;
  });
  // One comparator per COLUMN, each written in its natural ("asc") reading. The direction multiplies
  // the PRIMARY key only — the name tiebreak stays A→Z either way, so reversing "turmas" doesn't
  // hand back a list whose names read Z→A inside each group. (A plain .reverse() would do exactly
  // that, and it also flips ties, which makes a repaint look like the list moved on its own.)
  const now = Number(s.nowSec) || Math.floor(Date.now() / 1000);
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
  const primary = {
    name: byName,                                                                    // asc = A→Z
    turmas: (a, b) => a.turma_count - b.turma_count,                                 // asc = fewest first
    status: (a, b) => worst(a) - worst(b),                                           // asc = pending first
    validated: (a, b) => (a.email_verified ? 1 : 0) - (b.email_verified ? 1 : 0),    // asc = still owing proof first
    // asc = worst access first: nada > nunca > expirada > live (least time left).
    access: (a, b) => {
      const ra = accessRank(a, now), rb = accessRank(b, now);
      return (rb.tier - ra.tier) || (ra.left - rb.left);
    },
  };
  const key = primary[s.sort] ? s.sort : 'name';
  const mul = (s.dir || SORT_DEFAULT_DIR[key] || 'asc') === 'desc' ? -1 : 1;
  rows.sort((a, b) => (mul * primary[key](a, b)) || byName(a, b));
  return rows;
}
