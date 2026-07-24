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
import { glyphSvg } from '../../js/glyphs.js';

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

// Benefit icons. Three now come from the shared library (js/glyphs.js): they were verbatim
// copies of keys it already had, hand-drawn here AND again in wall-simple.js. size:null
// because wall.css (.cdx-en-bene-ic svg) owns the sizing.
//
// `cert` is the one hold-out, still drawn here on purpose. The library's `award` is the same
// IDEA (medal + ribbon) but not the same drawing: r=7 with a different ribbon, against this
// r=6. Converging it is a real visual change to the public wall, so it is a decision, not a
// refactor, and it is not being smuggled in under a "use the library" commit.
const ICONS = {
  conteudo: glyphSvg('book', { size: null }),
  tarefa: glyphSvg('send', { size: null }),
  forum: glyphSvg('message-square', { size: null }),
  cert: glyphSvg('award', { size: null }),
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
  // The certificate benefit only makes sense when THIS turma actually issues
  // certificates (dossiê toggle `certificates_enabled`, delivered in the turma view).
  // When it is off, the benefit is dropped entirely instead of promising a certificate
  // the student will never get; the old "se habilitado" tag was a hedge for exactly this
  // case and is now redundant, so it is gone.
  const certOn = !!(((state.data || {}).turma || {}).certificates_enabled);
  return '<div class="cdx-en-benes">' +
    bene('conteudo', ICONS.conteudo, 'wall.bene_conteudo_t', 'wall.bene_conteudo_d') +
    bene('tarefa', ICONS.tarefa, 'wall.bene_tarefa_t', 'wall.bene_tarefa_d') +
    bene('forum', ICONS.forum, 'wall.bene_forum_t', 'wall.bene_forum_d') +
    (certOn ? bene('cert', ICONS.cert, 'wall.bene_cert_t', 'wall.bene_cert_d') : '') +
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
    '</div>';
  // NO support box here. renderHero (page.js) already mounts one in the footer
  // (#cdx-tr-support-footer) on EVERY trilha page, the wall included, so "Precisa de ajuda?" is
  // already on this screen. Adding a second here duplicated it (Élder 2026-07-16). The old
  // wall-simple copy hand-rolled its own AND still got the footer — it was quietly showing two.
  // The card is the ONLY thing an access mode owns. Everything above is the wall, identical for
  // every mode; an unknown mode falls back to the OTP door rather than rendering a bare card.
  const mount = ACCESS_MODES[accessModeFor((state.data || {}).access)] || ACCESS_MODES.otp;
  mount(wall.querySelector('.cdx-en-reg'));
}
