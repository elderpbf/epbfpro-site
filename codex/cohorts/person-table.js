// cohorts/person-table.js
// THE assembly of the people table (track-42). person-list.js is the LIST; roster-actions.js is the
// toolbar+selection; person-filters.js is the bar; person-editor.js is the edit modal. This file is
// the thing that was missing: the glue that mounts all of them into a working table and wires it.
//
// Élder 2026-07-16: "acabamos de fazer todo esse trabalho só para ter mais trabalho para consertar."
// The pieces were shared, but the GLUE was copied — students.js (Usuários) and the dossiê block in
// cohorts.js each re-implemented paint + selection + expand + filter + apply their own way, and that
// is why a fix on one side kept leaving the other behind (the remove modal, the unblock gating). So
// there is now ONE assembly and the scope is a parameter, exactly like the list under it.
//
// What differs between the two surfaces is only: the scope, whether approval actions are offered
// (gated), the extra tool in the bar (the Limpeza button is global), where "ir para a turma" goes,
// and the REMOVE semantics (global = the person is gone; turma = out of this turma, see
// turma-remove.js). Everything else is identical and lives here once.

import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import * as notice from '../js/notice.js';
import { renderPreservingScroll } from '../js/list-sync.js';
import { emptyFilterState, filtersBarHtml, applyFilterChange, applyFilters, applySortClick } from './person-filters.js';
import { toolbarHtml, wireSelection, applyRosterAction } from './roster-actions.js';
import { personListHtml } from './person-list.js';
import { ACTION_RULES } from './participant-view.js';
import { openPersonEditor } from './person-editor.js';
import { openAliasPopover } from './alias-popover.js';

// PURE. The participant_ids a bulk action would actually touch for one person, using the SAME rules
// the toolbar gates on (participant-view.ACTION_RULES). In turma scope a person carries one row, so
// this is [pid] when the row is actionable and [] otherwise; in global scope it fans out across the
// turmas where the action applies. The enable check and the apply both read this, so a button that
// lights up always has something to act on — which is what keeps global and turma from disagreeing
// about the same selection (the latent unblock split).
export function actionTargets(person, act) {
  const rule = ACTION_RULES[act];
  if (!rule) return [];
  return ((person && person.rows) || [])
    .filter((x) => rule({ status: x.access_status, verified: !!x.email_verified }))
    .map((x) => x.participant_id);
}

// host: an element the table OWNS. It writes a tools area + a list area into it and delegates every
// click on it, so repainting the list never disturbs the bar (no focus hack — the bar simply is not
// re-rendered while you type). cfg:
//   scope 'global' | 'turma'
//   gated              bool | () => bool   which bulk actions the toolbar offers
//   extraToolsHtml     () => string        appended into the filter bar (global: the Limpeza button)
//   emptyKey           i18n key for "no people at all" (default 'alunos.empty')
//   noMatchKey         i18n key for "filtered to nothing" (default 'alunos.no_match')
//   onReload           () => void|Promise   the caller reloads its data and calls setPeople again
//   onRemove           (people) => void     scope-specific remove (the ONE thing that differs)
//   onGo               (dataset) => void     (global) navigate to a turma; omit in turma scope
//   onToolsClick       (event) => void       (optional) extra clicks in the bar (global: Limpeza)
//   scrollHost         () => Element|null    (optional, track-26 2.b) the element whose scroll
//     position must survive an edit/apply/reload repaint. The table itself never scrolls (see
//     content.css / codex.css) — turma scope's ancestor is the dossier's .cdx-doss-body, global
//     scope's is the page (document.scrollingElement), so only the caller knows which; omit to
//     skip preservation.
// Returns { setPeople(people), refresh }.
export function createPersonTable(host, cfg) {
  const c = cfg || {};
  let _people = [];
  const _filters = emptyFilterState();
  const _expanded = {};
  const _scrollHost = () => (typeof c.scrollHost === 'function' ? c.scrollHost() : null);

  host.innerHTML = '<div class="cdx-pt-tools"></div><div class="cdx-pt-list"></div>';
  const toolsEl = () => host.querySelector('.cdx-pt-tools');
  const listEl = () => host.querySelector('.cdx-pt-list');
  const gatedNow = () => (typeof c.gated === 'function' ? c.gated() : !!c.gated);

  // The person a row element belongs to. Global rows carry the identity id (data-person); an
  // identity-less turma row (a hand-added roster entry with no e-mail) has none, so it is keyed on
  // its single participant_id instead — the one path that must still resolve them.
  function _personOf(el) {
    const row = el && el.closest && el.closest('.cdx-pl-row');
    if (!row) return null;
    const pid = row.dataset.person;
    if (pid) return _people.find((p) => String(p.id) === pid) || null;
    const first = Number((row.dataset.pids || '').split(',')[0]);
    return _people.find((p) => Number((((p.rows || [])[0]) || {}).participant_id) === first) || null;
  }

  function _toggleExpand(row) {
    const key = row.dataset.person;
    _expanded[key] = !_expanded[key];
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains('cdx-pl-detail')) detail.hidden = !_expanded[key];
    const caret = row.querySelector('[data-caret]');
    if (caret) caret.setAttribute('aria-expanded', _expanded[key] ? 'true' : 'false');
  }

  function _edit(person) {
    openPersonEditor(person, { onSaved: () => c.onReload && c.onReload() });
  }

  // ── delegated wiring, attached ONCE (host survives every repaint) ──────────────────
  // Capture phase, so a +/edit/sort/→ click is handled and stopped BEFORE it reaches the row's
  // selection handler bound by wireSelection. A bare row-click is left alone in turma scope (it
  // means "select"); in global scope it expands.
  host.addEventListener('click', (e) => {
    // Selection (the row checkbox) and the bulk toolbar are wireSelection's; let those clicks pass
    // straight through — without this, a checkbox click on an expandable row would expand it here and
    // stopPropagation would swallow the selection (global scope).
    if (e.target.closest && (e.target.closest('.cdx-pchk') || e.target.closest('.cdx-ptb'))) return;
    const go = e.target.closest && e.target.closest('.cdx-pl-go');
    if (go) { e.stopPropagation(); if (c.onGo) c.onGo(go.dataset); return; }
    const plus = e.target.closest && e.target.closest('.cdx-pl-plus');
    if (plus) {
      e.stopPropagation();
      const p = _personOf(plus);
      openAliasPopover(plus, (plus.dataset.aliases || '').split(',').filter(Boolean), p && p.email);
      return;
    }
    const edit = e.target.closest && e.target.closest('[data-edit]');
    if (edit) { e.stopPropagation(); const p = _personOf(edit); if (p) _edit(p); return; }
    const sort = e.target.closest && e.target.closest('[data-sort]');
    if (sort) { e.stopPropagation(); if (applySortClick(_filters, sort.dataset.sort)) _paintList(); return; }
    if (c.scope !== 'turma') {
      const row = e.target.closest && e.target.closest('.cdx-pl-row');
      if (row && row.classList.contains('cdx-pl-row--exp')) { e.stopPropagation(); _toggleExpand(row); }
    }
  }, true);

  // The bar's own controls, and any extra tool the caller put in it (the Limpeza button). Bubble
  // phase — these live in the tools area, never in a row.
  host.addEventListener('input', (e) => {
    if (!applyFilterChange(_filters, e.target.id, e.target.value)) return;
    _paintList();   // typing repaints the LIST only; the bar under the cursor is left intact
  });
  host.addEventListener('change', (e) => {
    if (!applyFilterChange(_filters, e.target.id, e.target.value)) return;
    _paintTools();  // a select changed — its sibling options may need to hide/show
    _paintList();
  });
  if (c.onToolsClick) host.addEventListener('click', (e) => c.onToolsClick(e));

  // ── paint ──────────────────────────────────────────────────────────────────────────
  function _paintTools() {
    const el = toolsEl();
    if (el) el.innerHTML = filtersBarHtml(_filters, _people, c.extraToolsHtml ? c.extraToolsHtml() : '');
  }

  function _paintList() {
    const host2 = listEl();
    if (!host2) return;
    if (!_people.length) {
      host2.innerHTML = '<span class="cdx-empty">' + esc(t(c.emptyKey || 'alunos.empty')) + '</span>';
      return;
    }
    const rows = applyFilters(_people, _filters);
    if (!rows.length) {
      host2.innerHTML = '<span class="cdx-empty">' + esc(t(c.noMatchKey || 'alunos.no_match')) + '</span>';
      return;
    }
    // Carry the selection across the repaint (expand / filter / sort), keyed by identity.
    const keep = new Set(Array.prototype.slice.call(host2.querySelectorAll('.cdx-pl-row .cdx-pchk'))
      .filter((ch) => ch.checked).map((ch) => ch.closest('.cdx-pl-row').dataset.person));

    host2.innerHTML = toolbarHtml(gatedNow()) +
      personListHtml(rows, { scope: c.scope, emptyKey: c.emptyKey, sort: _filters.sort, dir: _filters.dir });

    Array.prototype.slice.call(host2.querySelectorAll('.cdx-pl-row')).forEach((r) => {
      if (keep.has(r.dataset.person)) { const ch = r.querySelector('.cdx-pchk'); if (ch) ch.checked = true; }
      if (_expanded[r.dataset.person]) {
        const d = r.nextElementSibling;
        if (d && d.classList.contains('cdx-pl-detail')) d.hidden = false;
        const car = r.querySelector('[data-caret]');
        if (car) car.setAttribute('aria-expanded', 'true');
      }
    });

    wireSelection(host2, {
      rowSel: '.cdx-pl-row',
      chkSel: '.cdx-pchk',
      ignoreSel: '[data-edit],[data-caret],.cdx-pl-plus,.cdx-pl-go',
      // In turma scope a row-click selects; in global it expands (handled above), so the checkbox
      // owns selection there.
      rowClickToggles: c.scope === 'turma',
      // EVERY selected person must be actionable, in both scopes: a batch that is mostly already
      // approved must not offer "Aprovar" (Élder 2026-07-14).
      enabledFor: (act, rowEls) => rowEls.every((r) => { const p = _personOf(r); return !!(p && actionTargets(p, act).length); }),
      onApply: _apply,
    });
  }

  async function _apply(act, rowEls) {
    const people = rowEls.map(_personOf).filter(Boolean);
    if (!people.length) return;
    if (act === 'remove') { if (c.onRemove) c.onRemove(people); return; }
    const ids = [];
    people.forEach((p) => actionTargets(p, act).forEach((id) => ids.push(id)));
    if (!ids.length) return;
    try {
      await applyRosterAction(act, ids);   // the SAME apply both surfaces make
    } catch (err) {
      notice.internal('person-table: ' + act + ': ' + (err && err.message || err));
    } finally {
      if (c.onReload) c.onReload();
    }
  }

  function setPeople(people) {
    _people = people || [];
    _paintTools();
    renderPreservingScroll(_scrollHost(), () => _paintList());
  }
  function refresh() {
    _paintTools();
    renderPreservingScroll(_scrollHost(), () => _paintList());
  }

  return { setPeople, refresh };
}
