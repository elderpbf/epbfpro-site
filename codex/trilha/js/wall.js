// codex/trilha/js/wall.js
// THE registration wall, the only one. On an upfront-gated, not-yet-approved turma the page
// shows this instead of the timeline: the hero (already rendered) plus a benefits column and an
// INLINE register card. A student who registered but awaits approval sees the pending notice.
//
// This file owns everything that is the SAME for every turma: the shell, the benefits, and the
// status screens. The card, i.e. HOW you get in, is an ACCESS MODE plugged in from the
// ACCESS_MODES table below (wall-access-otp.js / wall-access-emergency.js).
//
// There used to be a second wall (wall-simple.js), a copy of this one for the Emergência turmas.
// It drifted immediately and silently: it still drew the aulas roadmap deleted here on
// 2026-07-11, used a 🚫 emoji where this file uses the glyph library, and knew 3 error codes to
// this file's 6. Decisions only ever landed on one of the two. Élder 2026-07-15: "elas deveriam
// todas acessar o mesmo código, só que existem algumas modificações de acesso, isso deveria ser
// plugável". A new way in is an entry in ACCESS_MODES, never another wall.
//
// PORT NOTE (copy-not-reconstruct): the a1 mock's CSS lives verbatim in
// trilha/css/wall.css under cdx-en-* classes; this file only ports the markup +
// wires the flow. The roadmap rows + compact date are the only data-derived bits,
// kept pure and unit-tested (trilha-wall.test.mjs); the DOM is verified on staging.
import { state } from './state.js';
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { entryHtml, contextFromState } from './support-contact.js';
import { mountNoticeSection, renderNoticeInto } from './notice-page.js';
import { mountOtpCard } from './wall-access-otp.js';
import { mountEmergencyCard } from './wall-access-emergency.js';

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// PURE. Compact "dd mmm" PT date from an ISO date (zero-padded day, like the a1 mock's
// "02 abr"). Empty string when the input is not a parseable YYYY-MM-DD.
export function shortDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr == null ? '' : dateStr));
  if (!m) return '';
  const mon = PT_MONTHS[Number(m[2]) - 1] || '';
  return mon ? m[3] + ' ' + mon : '';
}

// PURE. The roadmap rows ({ number, title, date }) from the turma's aulas, sorted by
// aula_number. Title falls back to "Aula N"; date is the compact form of the
// scheduled/happened date (empty when neither is set).
export function wallRoadmapRows(aulas) {
  return (Array.isArray(aulas) ? aulas : [])
    .slice()
    .sort((a, b) => (a.aula_number || 0) - (b.aula_number || 0))
    .map((a) => ({
      number: a.aula_number,
      title: a.title || ('Aula ' + a.aula_number),
      date: shortDate(a.scheduled_for || a.happened_on || ''),
    }));
}

// The access MODES, keyed by what the turma's access says. Adding a way in is an entry here plus
// a module that mounts a card, NOT a second wall: the shell, the benefits and every status screen
// below are the same for all of them. This table is the whole "plugável" (Élder 2026-07-15).
const ACCESS_MODES = {
  otp: mountOtpCard,             // the default, and what every real turma uses
  emergency: mountEmergencyCard, // break-glass, 12h-armed, normally unreachable
};

// PURE. Which mode a turma's access resolves to. `simple_enroll` already accounts for the 12h
// deadline (the worker's isSimpleEnrollOpen decides, the front never re-derives it).
export function accessModeFor(access) {
  return ((access || {}).simple_enroll) ? 'emergency' : 'otp';
}

// Benefit icons, ported verbatim from the a1 mock.
const ICONS = {
  conteudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  tarefa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
  forum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  cert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>',
};

function benefitsHtml() {
  const bene = (cls, icon, titleKey, descKey, tagKey) =>
    '<div class="cdx-en-bene">' +
      '<span class="cdx-en-bene-ic cdx-en-bene-ic--' + cls + '">' + icon + '</span>' +
      '<div>' +
        '<div class="cdx-en-bene-t">' + esc(t(titleKey)) +
          (tagKey ? '<span class="cdx-en-bene-tag">' + esc(t(tagKey)) + '</span>' : '') +
        '</div>' +
        '<div class="cdx-en-bene-d">' + esc(t(descKey)) + '</div>' +
      '</div>' +
    '</div>';
  return '<div class="cdx-en-benes">' +
    bene('conteudo', ICONS.conteudo, 'wall.bene_conteudo_t', 'wall.bene_conteudo_d') +
    bene('tarefa', ICONS.tarefa, 'wall.bene_tarefa_t', 'wall.bene_tarefa_d') +
    bene('forum', ICONS.forum, 'wall.bene_forum_t', 'wall.bene_forum_d') +
    bene('cert', ICONS.cert, 'wall.bene_cert_t', 'wall.bene_cert_d', 'wall.bene_cert_tag') +
  '</div>';
}

// The aulas roadmap was removed from the login wall (Élder 2026-07-11): the wall shows
// the benefits + register card only. wallRoadmapRows/shortDate stay (pure, unit-tested)
// for any future surface that wants the compact roadmap.

// Hide the timeline, mark the page so the scoped phone CSS applies, and render the
// register (or the pending notice if the student already registered). The hero stays.
export function renderWall(root) {
  // mountNoticeSection hides the timeline and returns the shared wall <section> — the same
  // host the pending/denied notices use (notice-page.js), so the wall and every status
  // screen sit in one place. The hero above stays.
  const wall = mountNoticeSection(root);
  if (!wall) return;
  const access = (state.data || {}).access || {};
  if (access.status === 'denied') { renderDenied(wall); return; }
  if (access.status === 'pending') { renderPending(wall); return; }
  renderRegister(wall);
}

// Registered but awaiting the instructor's approval: the shared full-page notice (clock glyph).
function renderPending(wall) {
  renderNoticeInto(wall, { glyph: 'clock', title: t('login.pending_title'), body: t('login.pending_body') });
}

// Blocked (denied): the instructor cut this student off. Distinct from pending — no
// "aguarde aprovação"; they stay out until unblocked. Same notice layout + a support box.
function renderDenied(wall) {
  renderNoticeInto(wall, { glyph: 'ban', cls: 'cdx-en-denied', title: t('login.denied_title'), body: t('login.denied_body') });
  wall.insertAdjacentHTML('beforeend', entryHtml(contextFromState(state), 'bloqueado'));
}

function renderRegister(wall) {
  wall.innerHTML =
    '<div class="cdx-en-grid">' +
      '<div>' +
        '<h2 class="cdx-en-lead-h">' + esc(t('wall.lead_title')) + '</h2>' +
        '<p class="cdx-en-lead-s">' + esc(t('wall.lead_sub')) + '</p>' +
        benefitsHtml() +
      '</div>' +
      '<div><div class="cdx-en-card cdx-en-reg is-open"></div></div>' +
    '</div>' +
    // Support box on the register screen for EVERY turma (Élder 2026-07-15: "o suporte deve
    // aparecer lá também"). It used to exist only on the Emergência copy, so the students who
    // could not get in on the normal wall were exactly the ones with no way to ask for help.
    entryHtml(contextFromState(state), 'registro');
  // The card is the ONLY thing an access mode owns. Everything above is the wall, identical for
  // every mode; an unknown mode falls back to the OTP door rather than rendering a bare card.
  const mount = ACCESS_MODES[accessModeFor((state.data || {}).access)] || ACCESS_MODES.otp;
  mount(wall.querySelector('.cdx-en-reg'));
}
