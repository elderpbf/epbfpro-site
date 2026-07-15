// cohorts/person-list.js
// THE list of people, for BOTH admin surfaces (track-28a2 stage "big move", Élder 2026-07-15).
//
// Élder: "both the participant list in the dossier and this one should be the same list looking
// exactly the same with the same options. The only difference is that in the cohort it is
// pre-filtered for that cohort and it doesn't show the other cohorts. It's a bigger move but it
// would stop us having to keep duplicating stuff."
//
// So there is ONE renderer and the scope is a parameter:
//   scope 'global' (Pessoas)  -> shows the turma column; a person with N turmas expands
//   scope 'turma'  (dossiê)   -> hides the turma column; every person has exactly one row
// Both read ct_list_people, which is the same query with turma_id as a FILTER.
//
// LAYOUT (Élder's sketch): the columns are a real grid, and the sub-rows are children of the SAME
// grid — so a per-turma line lands under the exact column its summary header does. A person with
// ONE turma does not expand at all: their single line IS the information.
//
//   │ nome/email        │ turma      │ aprovação │ validação │ acesso  │
//   │ Ariovaldo ✎       │ 2 turmas   │ 2/2       │ 1/2       │ 1/2     │   <- resumo
//   │ ario@jfse.jus.br ⁺│
//   │                   │ JFSE|gab.  │ Janela    │ validado  │ 12d     │   <- filhas, mesmas colunas
//   │                   │ JFSE|adm.  │ Manual    │ não valid.│ expirada│
//
// The WORDS come from js/access-model.js (never coined here) and the ACTIONS from
// participant-view.js + roster-actions.js, so nothing about a person is decided twice.

import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { relTime } from '../js/rel-time.js';
import { initials } from '../js/initials.js';
import { approvalTagHtml, approvalOf, validationOf, accessOf } from '../js/access-model.js';

// ── pure summaries (the aggregates on a multi-turma header) ────────────────────────
// "2/2" reads as: approved in 2 of the 2 turmas this person is in.
export function summarize(person, nowSec) {
  const rows = (person && person.rows) || [];
  const now = Number(nowSec) || Math.floor(Date.now() / 1000);
  return {
    total: rows.length,
    approved: rows.filter((r) => String(r.access_status || '').toLowerCase() === 'approved').length,
    validated: rows.filter((r) => !!r.email_verified).length,
    live: rows.filter((r) => accessOf(r, now).state === 'live').length,
    lastAccess: rows.reduce((m, r) => Math.max(m, Number(r.last_access_at || 0)), 0) || null,
  };
}

// A person only expands when there is genuinely more to show than their header already says.
export function isExpandable(person) {
  return (((person && person.rows) || []).length) > 1;
}

// ── time labels (ported verbatim from the dossiê chip, Élder 2026-07-13) ───────────
export function remainingSec(expiresAt, nowSec) {
  if (!expiresAt) return 0;
  const now = Number(nowSec) || Math.floor(Date.now() / 1000);
  return Math.max(0, Number(expiresAt) - now);
}
function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + 'h';
  if (m > 0) return m + 'min';
  return '<1min';
}
// Days-aware: 12d / 8h / 42min. Language-neutral — the "expira em" framing comes from i18n.
export function fmtLeft(sec) {
  const d = Math.floor(sec / 86400);
  if (d >= 1) return d + 'd';
  return fmtDur(sec);
}

// ── the acesso cell: the live session, which has a deadline and EXPIRES ────────────
// The dossiê's chip carried a styled popover with validado / aparelhos / último acesso /
// reentradas (access.md §Mecânica). That DATA is preserved here, in the cell's hover, so the
// unified list loses none of it — the hover is now the one mechanism, per Élder ("we may make
// every entry hoverable and each hover tells you what that is").
function accessDetail(row) {
  const bits = [];
  bits.push(t('cohorts.pop_devices') + ' ' + Number(row.active_sessions || 0));
  // ✓ acessou / ✕ nunca, with the recency (Élder 2026-07-09: one axis, two explicit marks — the
  // old ● read like the legend's "não logou" and the ⚠ was a different axis misfiring as an alarm).
  // The help legend shows these same two marks, so they must keep rendering.
  bits.push(t('cohorts.pop_last_access') + ' ' + (row.last_access_at
    ? '✓ ' + relTime(row.last_access_at)
    : '✕ ' + t('cohorts.pop_never')));
  const re = Number(row.reentry_count || 0);
  bits.push(t('cohorts.pop_reentries') + ' ' + (re > 0 && row.last_reentry_at
    ? re + ' · ' + t('cohorts.pop_reentry_last').replace('{t}', relTime(row.last_reentry_at))
    : String(re)));
  return bits.join('\n');
}

export function accessCell(row, nowSec) {
  const a = accessOf(row, nowSec);
  const more = '\n' + accessDetail(row);
  if (a.state === 'none') return { label: '', tone: 'off', title: t('access.h_none') };
  if (a.state === 'never') return { label: t('access.never'), tone: 'off', title: t('access.h_never') + more };
  if (a.state === 'lapsed') return { label: t('access.lapsed'), tone: 'off', title: t('access.h_lapsed') + more };
  const left = remainingSec(row.session_expires_at, nowSec);
  return {
    label: fmtLeft(left),
    tone: left <= 86400 ? 'soon' : 'ok',
    title: (a.provisional ? t('access.h_live_prov') : t('access.h_live')).replace('{t}', fmtLeft(left)) + more,
  };
}

// ── hover: every cell says what it is, in context ──────────────────────────────────
// Élder: "we may make every entry hoverable and each hover tells you what that is... if I hover
// over the approved it says where and when and how it was approved". approved_at / approved_via are
// stored, so aprovação can answer fully. Validation stores ONLY the flag (no when, no how), so its
// hover says what it can and does not invent the rest.
export function approvalTitle(row) {
  const a = approvalOf(row);
  if (a.kind === 'state') {
    return a.value === 'pending' ? t('access.h_pending')
      : a.value === 'denied' ? t('access.h_denied')
      : t('access.h_approved_plain');
  }
  const when = row.approved_at ? relTime(row.approved_at) : null;
  const how = t(a.i18n);
  return when
    ? t('access.h_approved_when').replace('{how}', how).replace('{t}', when)
    : t('access.h_approved').replace('{how}', how);
}

export function validationTitle(row) {
  return validationOf(row).validated ? t('access.h_validated') : t('access.h_unvalidated');
}

// ── render ────────────────────────────────────────────────────────────────────────
function avatar(person) {
  const rows = person.rows || [];
  // Tint by the person's worst standing across their rows: a blocked or pending row is the thing
  // worth seeing at a glance, and in turma scope there is only one row anyway.
  const has = (s) => rows.some((r) => String(r.access_status || 'pending').toLowerCase() === s);
  const tint = has('denied') ? 'cdx-pav--denied' : has('pending') ? 'cdx-pav--pending' : 'cdx-pav--approved';
  return '<span class="cdx-pav ' + tint + '">' + esc(initials(person.name || person.email || '')) + '</span>';
}

function aliasPlus(person) {
  const al = (person.aliases || []).filter(Boolean);
  if (!al.length) return '';   // no aliases -> no "+" at all (Élder: "if they don't have any the hover should do nothing")
  return '<button type="button" class="cdx-pl-plus" data-aliases="' + esc(al.join(',')) + '"' +
    ' title="' + esc(t('access.h_aliases').replace('{n}', String(al.length))) + '" aria-label="' +
    esc(t('access.h_aliases').replace('{n}', String(al.length))) + '">+</button>';
}

function cell(cls, html, title) {
  return '<span class="cdx-pl-c ' + cls + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + html + '</span>';
}

function turmaLabel(row) {
  return (row.client_slug ? row.client_slug + '|' : '') + (row.turma_name || row.turma_slug || '');
}

// A per-turma line: the SAME columns as the header, so everything lines up.
function detailLine(row, cfg) {
  const acc = accessCell(row, cfg.nowSec);
  const val = validationOf(row);
  return '<div class="cdx-pl-sub" data-pid="' + row.participant_id + '">' +
    '<span class="cdx-pl-c cdx-pl-chk"></span>' +
    '<span class="cdx-pl-c cdx-pl-av"></span>' +
    '<span class="cdx-pl-c cdx-pl-id"></span>' +
    cell('cdx-pl-turma', esc(turmaLabel(row)), turmaLabel(row)) +
    cell('cdx-pl-appr', approvalTagHtml(row), approvalTitle(row)) +
    cell('cdx-pl-val cdx-pl-val--' + (val.validated ? 'ok' : 'no'), esc(t(val.i18n)), validationTitle(row)) +
    cell('cdx-pl-acc cdx-pl-acc--' + acc.tone, esc(acc.label), acc.title) +
    '<span class="cdx-pl-c cdx-pl-act">' +
      '<button type="button" class="cdx-pl-go" data-client="' + esc(row.client_slug || '') + '" data-turma="' +
        esc(row.turma_slug || '') + '" title="' + esc(t('alunos.open_turma')) + '">→</button>' +
    '</span>' +
  '</div>';
}

// The person's line. With ONE row it carries that row's facts directly (no expansion — Élder:
// "if a person only has one cohort there's no need to open it"); with more it carries the
// aggregates and the per-turma lines drop below.
export function personRowHtml(person, cfg) {
  const c = cfg || {};
  const rows = person.rows || [];
  const one = rows.length === 1 ? rows[0] : null;
  const sum = summarize(person, c.nowSec);
  const expandable = isExpandable(person);

  let turmaCell, apprCell, valCell, accCell;
  if (one) {
    const acc = accessCell(one, c.nowSec);
    const val = validationOf(one);
    turmaCell = c.scope === 'turma' ? '' : cell('cdx-pl-turma', esc(turmaLabel(one)), turmaLabel(one));
    apprCell = cell('cdx-pl-appr', approvalTagHtml(one), approvalTitle(one));
    valCell = cell('cdx-pl-val cdx-pl-val--' + (val.validated ? 'ok' : 'no'), esc(t(val.i18n)), validationTitle(one));
    accCell = cell('cdx-pl-acc cdx-pl-acc--' + acc.tone, esc(acc.label), acc.title);
  } else {
    const frac = (n) => n + '/' + sum.total;
    const tone = (n) => (n === sum.total ? 'ok' : n === 0 ? 'off' : 'soon');
    turmaCell = cell('cdx-pl-turma', esc(t('alunos.n_turmas').replace('{n}', String(sum.total))),
      rows.map(turmaLabel).join(' · '));
    apprCell = cell('cdx-pl-appr cdx-pl-agg--' + tone(sum.approved), esc(frac(sum.approved)),
      t('access.h_agg_approved').replace('{n}', String(sum.approved)).replace('{m}', String(sum.total)));
    valCell = cell('cdx-pl-val cdx-pl-agg--' + tone(sum.validated), esc(frac(sum.validated)),
      t('access.h_agg_validated').replace('{n}', String(sum.validated)).replace('{m}', String(sum.total)));
    accCell = cell('cdx-pl-acc cdx-pl-agg--' + tone(sum.live), esc(frac(sum.live)),
      t('access.h_agg_live').replace('{n}', String(sum.live)).replace('{m}', String(sum.total)));
  }

  // data-status / data-verified drive the shared action gating (participant-view ACTION_RULES).
  // In turma scope they are the row's own; in global scope the person is only eligible for an
  // action when EVERY one of their rows is (Élder: a mostly-approved selection must not offer
  // Aprovar) — the surface computes that from these same rows.
  const st = one ? (one.access_status || 'pending') : (sum.approved === sum.total ? 'approved' : 'pending');
  const ver = one ? (one.email_verified ? 1 : 0) : (sum.validated === sum.total ? 1 : 0);

  return '<div class="cdx-pl-row' + (expandable ? ' cdx-pl-row--exp' : '') + '"' +
      ' data-person="' + esc(String(person.id == null ? '' : person.id)) + '"' +
      ' data-pids="' + esc(rows.map((r) => r.participant_id).join(',')) + '"' +
      ' data-status="' + esc(st) + '" data-verified="' + ver + '">' +
    '<span class="cdx-pl-c cdx-pl-chk"><input type="checkbox" class="cdx-pchk" aria-label="' + esc(person.name || person.email || '') + '"></span>' +
    '<span class="cdx-pl-c cdx-pl-av">' + avatar(person) + '</span>' +
    '<span class="cdx-pl-c cdx-pl-id">' +
      '<span class="cdx-pl-name">' + esc(person.name || t('alunos.no_name')) +
        '<button type="button" class="cdx-pl-edit" data-edit title="' + esc(t('cohorts.participant_edit_title')) + '">✎</button>' +
        (expandable ? '<button type="button" class="cdx-pl-caret" data-caret aria-expanded="false" title="' + esc(t('alunos.expand')) + '">▸</button>' : '') +
      '</span>' +
      '<span class="cdx-pl-mail">' + esc(person.email || '') + aliasPlus(person) + '</span>' +
    '</span>' +
    turmaCell +
    apprCell +
    valCell +
    accCell +
    '<span class="cdx-pl-c cdx-pl-act">' +
      (one && c.scope !== 'turma'
        ? '<button type="button" class="cdx-pl-go" data-client="' + esc(one.client_slug || '') + '" data-turma="' +
            esc(one.turma_slug || '') + '" title="' + esc(t('alunos.open_turma')) + '">→</button>'
        : '') +
    '</span>' +
  '</div>' +
  (expandable ? '<div class="cdx-pl-detail" hidden>' + rows.map((r) => detailLine(r, c)).join('') + '</div>' : '');
}

// The column header. Rendered once, on the same grid, so the labels sit over their columns.
export function headerHtml(cfg) {
  const c = cfg || {};
  return '<div class="cdx-pl-head">' +
    '<span class="cdx-pl-c cdx-pl-chk"></span>' +
    '<span class="cdx-pl-c cdx-pl-av"></span>' +
    '<span class="cdx-pl-c cdx-pl-id">' + esc(t('access.col_person')) + '</span>' +
    (c.scope === 'turma' ? '' : '<span class="cdx-pl-c cdx-pl-turma">' + esc(t('access.col_turma')) + '</span>') +
    '<span class="cdx-pl-c cdx-pl-appr">' + esc(t('access.col_approval')) + '</span>' +
    '<span class="cdx-pl-c cdx-pl-val">' + esc(t('access.col_validation')) + '</span>' +
    '<span class="cdx-pl-c cdx-pl-acc">' + esc(t('access.col_access')) + '</span>' +
    '<span class="cdx-pl-c cdx-pl-act"></span>' +
  '</div>';
}

// The status SECTIONS (Pendentes / Aprovados / Bloqueados) are gone (Élder 2026-07-15: "if it's
// going to diverge from the persons list then it should either be part of both of them, [or]
// removed"). They cannot be part of both: in global scope a person spans several turmas and
// therefore several statuses at once, so there is no one section to put them in. The shared
// filter bar (cohorts/person-filters.js) answers the same question in both scopes instead.

export function personListHtml(people, cfg) {
  const c = cfg || {};
  const list = people || [];
  if (!list.length) return '<div class="cdx-empty">' + esc(t(c.emptyKey || 'alunos.empty')) + '</div>';
  const body = list.map((p) => personRowHtml(p, c)).join('');
  return '<div class="cdx-pl' + (c.scope === 'turma' ? ' cdx-pl--turma' : '') + '">' +
    headerHtml(c) + body +
  '</div>';
}
