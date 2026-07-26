// cohorts/students.js
// "Alunos" sub-tab of Cohorts (track-28a2): the cross-turma deduped roster, in GLOBAL scope.
//
// This file is now ONLY the scope's chrome: the title, the stat line, the "?" legend, and the load
// (no turma filter, plus the two registry-wide cleanup scans). The table itself — the bar, the
// toolbar, the list, selection, expand, filter, edit, apply — is cohorts/person-table.js, the exact
// assembly the turma dossiê mounts in `turma` scope. Élder: "both the participant list in the
// dossier and this one should be the same list looking exactly the same with the same options."
//
// The only things this scope decides for itself are what person-table takes as parameters: the
// actions are GLOBAL (they fan out across every turma of the selected people), the bar carries the
// Limpeza button (duplicates + throwaway registrations are facts about the whole registry, not one
// turma), and REMOVE means the person is gone — so it opens the completa/anonimizar erase modal
// rather than a per-turma detach.
// Routed here by cohorts.js when ctx.sub === 'alunos'.

import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import * as notice from '../js/notice.js';
import { hasPending } from './students-filters.js';
import { createPersonTable } from './person-table.js';
import { openEraseModal } from './erase-modal.js';
import { cleanupButtonHtml, openCleanupModal } from './cleanup-modal.js';
import { legendButtonHtml, openPersonLegend } from './person-legend.js';

let _viewEl = null;
let _people = [];
let _dupes = [];      // candidate duplicate pairs awaiting a verdict (ct_find_duplicates)
let _tests = [];      // registrations that look like throwaway tests (ct_find_test_accounts)
let _table = null;    // the shared person-table assembly, mounted once

function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-alunos">' +
      '<div class="cdx-alunos-head">' +
        '<h1 class="cdx-alunos-h1">' + esc(t('alunos.title')) + '</h1>' +
        '<div class="cdx-alunos-stats" id="cdx-al-stats"></div>' +
        // The "?" beside the title (Élder): the same legend the dossiê opens, so the scheme explains
        // itself months from now on whichever list you happen to be looking at.
        legendButtonHtml() +
      '</div>' +
      '<div class="cdx-alunos-card">' +
        '<div id="cdx-al-table"></div>' +
      '</div>' +
    '</div>';
  // The "?" sits in the head, outside the table, so it gets its own listener there.
  const headEl = _q('.cdx-alunos-head');
  if (headEl) headEl.addEventListener('click', (e) => {
    if (e.target.closest('#cdx-pl-help')) openPersonLegend({ scope: 'global' });
  });
  // THE table (cohorts/person-table.js), in global scope — the exact assembly the dossiê mounts in
  // turma scope. Everything about rendering and acting on the list lives there; this file only feeds
  // it data and answers the parameters that are genuinely global.
  _table = createPersonTable(_q('#cdx-al-table'), {
    scope: 'global',
    gated: true,   // globally a person spans turmas of every kind; the approval actions always apply
    emptyKey: 'alunos.empty',
    noMatchKey: 'alunos.no_match',
    extraToolsHtml: () => cleanupButtonHtml(_dupes.length, _tests.length),
    // track-26 2.b: this sub-tab has no scrolling wrapper of its own, the page does.
    scrollHost: () => document.scrollingElement,
    onReload: () => _load(),
    // Remove is the person, gone — the completa/anonimizar modal, never a bare "tem certeza?". It
    // fans out across every turma and would purge the childless identity; the two modes let Élder
    // decide what happens to the content first (erase-modal.js).
    onRemove: (people) => openEraseModal(
      people.map((s) => ({ id: s.id, name: s.name, email: s.email })).filter((p) => p.id),
      () => _load()),
    // "Ir para a turma" — the f-prefixed params are the ones index.html's router reads (fclient, not
    // client), and fdtab is explicit because from a people list the panel you want is Participantes.
    onGo: (ds) => {
      location.href = '/codex/?tab=cohorts&sub=turmas&fclient=' + encodeURIComponent(ds.client || '') +
        '&fturma=' + encodeURIComponent(ds.turma || '') + '&fdtab=participantes';
    },
    // The Limpeza button lives in the bar: its counter says how much — duplicates + test
    // registrations — awaits a verdict.
    onToolsClick: (e) => {
      if (e.target.closest('#cdx-al-dupes')) openCleanupModal({ pairs: _dupes, tests: _tests }, () => _load());
    },
  });
}

// ── stats (the head line, this scope's own chrome) ─────────────────────────────────────
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

// ── load ─────────────────────────────────────────────────────────────────────────
function _load() {
  // Neither cleanup scan may ever break the roster, so each failure degrades to "no candidates" on
  // its own — the list is the job here, the Limpeza button is an extra.
  return Promise.all([
    api.listPeople({}).then((d) => { _people = (d && d.people) || []; }),
    api.findDuplicates({}).then((d) => { _dupes = (d && d.pairs) || []; })
      .catch((e) => { _dupes = []; notice.internal('alunos: duplicate scan failed: ' + (e && e.message || e)); }),
    api.findTestAccounts({}).then((d) => { _tests = (d && d.people) || []; })
      .catch((e) => { _tests = []; notice.internal('alunos: test-account scan failed: ' + (e && e.message || e)); }),
  ]).then(() => {
    _paintStats();
    if (_table) _table.setPeople(_people);
  }).catch((e) => {
    notice.internal('alunos: load students failed: ' + (e && e.message || e));
    const host = _q('#cdx-al-table');
    if (host) host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.load_error')) + '</span>';
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _people = []; _dupes = []; _tests = []; _table = null;
  _renderShell();
  _load();
}

export function unmount() {
  _viewEl = null;
  _people = [];
  _dupes = [];
  _tests = [];
  _table = null;
}
