// codex/trilha/js/wall.js
// The registration wall: the approved a1 entry mock ported into the cdx- contract.
// On an upfront-gated, not-yet-approved turma the page shows this instead of the
// timeline — the hero (already rendered) plus a benefits + aulas-roadmap column and
// an INLINE register card. The register drives the shared login controller
// (student-login.js) over the 4-letter OTP code, all on this page (no modal): the
// student fills name + e-mail, receives a code, types it back, and unlocks. A student
// who has registered but is awaiting approval sees the pending notice instead.
//
// PORT NOTE (copy-not-reconstruct): the a1 mock's CSS lives verbatim in
// trilha/css/wall.css under cdx-en-* classes; this file only ports the markup +
// wires the flow. The roadmap rows + compact date are the only data-derived bits,
// kept pure and unit-tested (trilha-wall.test.mjs); the DOM is verified on staging.
import { state } from './state.js';
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { createLoginFlow } from './student-login.js';
import { getPresence, extractEnrollToken } from './student-session.js';
import { entryHtml, contextFromState } from './support-contact.js';
import { consentNoticeHtml } from './consent-notice.js';
import { mountNoticeSection, renderNoticeInto } from './notice-page.js';
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

// Inline register error code -> student-facing message (the code step).
function errorText(code, retryAfter) {
  if (!code) return '';
  if (code === 'email_invalid') return t('login.email_invalid');
  if (code === 'access_blocked') return t('login.denied_body');
  if (code === 'rate_limited') return rateLimitedText(retryAfter);
  if (code === 'invalid_code') return t('login.code_invalid');
  if (code === 'code_expired' || code === 'code_used') return t('login.code_expired');
  return t('login.error');
}

// "Aguarde ~X min" when the worker returns a retry window; a generic wait otherwise.
function rateLimitedText(retryAfter) {
  if (retryAfter && retryAfter > 0) return t('login.rate_limited_min').replace('{min}', String(Math.max(1, Math.ceil(retryAfter / 60))));
  return t('login.rate_limited');
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

function roadmapHtml() {
  const rows = wallRoadmapRows((state.data || {}).aulas);
  if (!rows.length) return '';
  return '<div class="cdx-en-road-h">' + esc(t('wall.roadmap_h')) + '</div>' +
    '<div class="cdx-en-road">' +
      rows.map((r) =>
        '<div class="cdx-en-road-row">' +
          '<span class="cdx-en-road-n">' + esc(String(r.number)) + '</span>' +
          '<span class="cdx-en-road-t">' + esc(r.title) + '</span>' +
          (r.date ? '<span class="cdx-en-road-d">' + esc(r.date) + '</span>' : '') +
        '</div>').join('') +
    '</div>';
}

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

// The locked poll cadence (Élder): 2s for the first ~6 calls, then 4/6/10/15s, capped at ~30
// calls (~5 min), then stop. Shared by both the validation poll and the approval poll.
const POLL_CADENCE = [2000, 2000, 2000, 2000, 2000, 2000, 4000, 6000, 10000, 15000];
const POLL_MAX = 30;

function renderRegister(wall) {
  wall.innerHTML =
    '<div class="cdx-en-grid">' +
      '<div>' +
        '<h2 class="cdx-en-lead-h">' + esc(t('wall.lead_title')) + '</h2>' +
        '<p class="cdx-en-lead-s">' + esc(t('wall.lead_sub')) + '</p>' +
        benefitsHtml() +
        roadmapHtml() +
      '</div>' +
      '<div><div class="cdx-en-card cdx-en-reg is-open"></div></div>' +
    '</div>' +
    '<p class="cdx-en-questions">' + esc(t('wall.q_lead')) + ' <b>' + esc(t('wall.q_bold')) + '</b> ' + esc(t('wall.q_tail')) + '</p>';

  const cardEl = wall.querySelector('.cdx-en-reg');
  // Capture the QR/código enrollment token NOW: page.js strips ?et= from the URL right after the
  // wall renders, so reading it here lets the single "Entrar" grant IN-ROOM provisional access
  // via the inscription window (student_provisional_enter) before falling back to the e-mail link.
  const enrollToken = (typeof location !== 'undefined') ? extractEnrollToken(location.search) : null;
  const flow = createLoginFlow({
    client: state.clientSlug,
    turma: state.turmaSlug,
    presence: getPresence(state.clientSlug, state.turmaSlug),
    enrollToken,
    k: state.token,
    origin: (typeof location !== 'undefined') ? location.origin : undefined,
  });
  let name = '';
  let pollTimer = null;
  const clearPoll = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };

  function reload() {
    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
  }

  // Route each flow state to its view. The name typed up front satisfies the profile step, so a
  // fresh sign-up never needs a second screen.
  async function settle() {
    if (flow.state === 'authenticated') { clearPoll(); reload(); return; }
    if (flow.state === 'profile') { await flow.saveProfile(name, true); settle(); return; }
    if (flow.state === 'validating') { renderValidating(); startPoll('validation'); return; }
    if (flow.state === 'pendingApproval') { renderPendingApproval(); startPoll('approval'); return; }
    renderCardForm(flow.state === 'needName');
  }

  // The single Entrar card: one e-mail field. The name field is present but hidden until the
  // worker says the address is NEW (needName), then revealed inline (no modal, same card).
  function renderCardForm(revealName) {
    cardEl.innerHTML =
      '<h3 class="cdx-en-card-h">' + esc(t('wall.entrar_h')) + '</h3>' +
      '<p class="cdx-en-card-s">' + esc(revealName ? t('wall.entrar_name_sub') : t('wall.entrar_sub')) + '</p>' +
      '<div class="cdx-en-field cdx-en-namefield' + (revealName ? '' : ' hidden') + '">' +
        '<label class="cdx-en-label" for="cdx-en-name">' + esc(t('login.name_label')) + '</label>' +
        '<input id="cdx-en-name" class="cdx-en-input" type="text" autocomplete="name" placeholder="' + esc(t('login.name_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-en-field">' +
        '<label class="cdx-en-label" for="cdx-en-email">' + esc(t('login.email_label')) + '</label>' +
        '<input id="cdx-en-email" class="cdx-en-input" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(t('login.email_placeholder')) + '"' + (revealName ? ' readonly' : '') + '>' +
      '</div>' +
      '<div class="cdx-en-error" aria-live="polite">' + esc(errorText(flow.error, flow.retryAfter)) + '</div>' +
      '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-cta">' + esc(revealName ? t('wall.continuar') : t('wall.entrar_cta')) + '</button>' +
      consentNoticeHtml();
    const nameEl = cardEl.querySelector('#cdx-en-name');
    const emailEl = cardEl.querySelector('#cdx-en-email');
    const cta = cardEl.querySelector('.cdx-en-cta');
    if (flow.email && emailEl) emailEl.value = flow.email;
    if (name && nameEl) nameEl.value = name;
    if (revealName && nameEl) setTimeout(() => { try { nameEl.focus(); } catch (_) {} }, 50);
    const submit = async () => {
      name = nameEl ? (nameEl.value || '').trim() : '';
      cta.disabled = true; cta.textContent = t('login.sending');
      await flow.entrar(emailEl.value, name);
      settle();
    };
    cta.addEventListener('click', submit);
    emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    if (nameEl) nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  // Sent the link: "check your e-mail". "Já validei" re-checks NOW (covers the cross-device case:
  // validated on the phone, unlock this device), and the locked cadence polls in the background.
  function renderValidating() {
    const dev = flow.devMagicToken
      ? '<p class="cdx-en-nopass cdx-en-dev"><strong>' + esc(t('login.dev_link')) + '</strong> <a href="?lt=' + esc(flow.devMagicToken) + '&k=' + esc(state.token || '') + '">abrir link</a></p>'
      : '';
    cardEl.innerHTML =
      '<div class="cdx-en-wait-ic" aria-hidden="true">' + glyphSvg('mail', { size: 34 }) + '</div>' +
      '<h3 class="cdx-en-card-h">' + esc(t('wall.check_email_h')) + '</h3>' +
      '<p class="cdx-en-card-s">' + esc(t('wall.check_email_sub')).replace('{email}', esc(flow.email || '')) + '</p>' +
      dev +
      '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-already">' + esc(t('wall.already_validated')) + '</button>';
    const already = cardEl.querySelector('.cdx-en-already');
    already.addEventListener('click', async () => {
      already.disabled = true; already.textContent = t('login.sending');
      await flow.pollValidation();
      already.disabled = false; already.textContent = t('wall.already_validated');
      settle();
    });
  }

  // Validated, but a NEW student is pending the instructor's approval (the e-sino). No action for
  // the student here; the approval poll unlocks the page the moment Élder approves.
  // Reuses the EXISTING pending message (renderPending / login.pending_*), not a new one — the
  // poll unlocks this card in place when the instructor approves in the e-sino.
  function renderPendingApproval() {
    cardEl.innerHTML =
      '<div class="cdx-en-wait-ic" aria-hidden="true">' + glyphSvg('clock', { size: 34 }) + '</div>' +
      '<h3 class="cdx-en-card-h">' + esc(t('login.pending_title')) + '</h3>' +
      '<p class="cdx-en-card-s">' + esc(t('login.pending_body')) + '</p>';
  }

  // Drive the locked cadence for whichever poll the state calls for. A state change re-renders via
  // settle(); reaching POLL_MAX stops quietly (the "Já validei" button stays as the manual escape).
  function startPoll(kind) {
    clearPoll();
    let i = 0;
    const tick = async () => {
      if (i >= POLL_MAX) return;
      if (kind === 'validation') await flow.pollValidation(); else await flow.pollApproval();
      if ((kind === 'validation' && flow.state !== 'validating') || (kind === 'approval' && flow.state === 'authenticated')) { settle(); return; }
      i += 1;
      pollTimer = setTimeout(tick, POLL_CADENCE[Math.min(i, POLL_CADENCE.length - 1)]);
    };
    pollTimer = setTimeout(tick, POLL_CADENCE[0]);
  }

  renderCardForm(false);
}
