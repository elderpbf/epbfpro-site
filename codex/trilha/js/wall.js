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
import { esc, cooldownButton } from './utils.js';
import { t } from '../i18n.js';
import { createLoginFlow } from './student-login.js';
import { getPresence, extractEnrollToken } from './student-session.js';

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
  const main = root.querySelector('.cdx-trilha-main');
  if (!main) return;
  if (root.classList) root.classList.add('cdx-tr-has-wall');
  const tabs = main.querySelector('.cdx-trilha-tabs');
  const content = main.querySelector('.cdx-trilha-tabcontent');
  if (tabs) tabs.hidden = true;
  if (content) content.hidden = true;
  let wall = main.querySelector('.cdx-en-wall');
  if (!wall) {
    wall = document.createElement('section');
    // cdx-en-wall (NOT cdx-tr-wall): the tarefa modal's login overlay owns .cdx-tr-wall
    // with display:flex, which leaked onto this section and turned the grid + questions
    // line into side-by-side columns. The registration wall uses its own en- name.
    wall.className = 'cdx-en-wall';
    const footer = main.querySelector('.cdx-trilha-footer');
    main.insertBefore(wall, footer || null);
  }
  const access = (state.data || {}).access || {};
  if (access.status === 'denied') { renderDenied(wall); return; }
  if (access.status === 'pending') { renderPending(wall); return; }
  renderRegister(wall);
}

function renderPending(wall) {
  wall.innerHTML =
    '<div class="cdx-en-pending">' +
      '<div class="cdx-en-pending-icon" aria-hidden="true">⏳</div>' +
      '<h2 class="cdx-en-pending-title">' + esc(t('login.pending_title')) + '</h2>' +
      '<p class="cdx-en-pending-body">' + esc(t('login.pending_body')) + '</p>' +
    '</div>';
}

// Blocked (denied): the instructor cut this student off. Distinct from pending — no
// "aguarde aprovação"; they stay out until unblocked. Mirrors the pending layout.
function renderDenied(wall) {
  wall.innerHTML =
    '<div class="cdx-en-pending cdx-en-denied">' +
      '<div class="cdx-en-pending-icon" aria-hidden="true">🚫</div>' +
      '<h2 class="cdx-en-pending-title">' + esc(t('login.denied_title')) + '</h2>' +
      '<p class="cdx-en-pending-body">' + esc(t('login.denied_body')) + '</p>' +
    '</div>';
}

function renderRegister(wall) {
  wall.innerHTML =
    '<div class="cdx-en-grid">' +
      '<div>' +
        '<h2 class="cdx-en-lead-h">' + esc(t('wall.lead_title')) + '</h2>' +
        '<p class="cdx-en-lead-s">' + esc(t('wall.lead_sub')) + '</p>' +
        benefitsHtml() +
        roadmapHtml() +
      '</div>' +
      '<div><div class="cdx-en-card cdx-en-reg"></div></div>' +
    '</div>' +
    '<p class="cdx-en-questions">' + esc(t('wall.q_lead')) + ' <b>' + esc(t('wall.q_bold')) + '</b> ' + esc(t('wall.q_tail')) + '</p>';

  const cardEl = wall.querySelector('.cdx-en-reg');
  // Capture the QR/código enrollment token NOW: page.js strips ?et= from the URL right
  // after the wall renders, so reading it here (and passing it through verify) lets the
  // worker approve a student who entered with the class código via the inscription window.
  const enrollToken = (typeof location !== 'undefined') ? extractEnrollToken(location.search) : null;
  const flow = createLoginFlow({
    client: state.clientSlug,
    turma: state.turmaSlug,
    presence: getPresence(state.clientSlug, state.turmaSlug),
    enrollToken,
  });
  // Simple sign-up mode (opt-in turma flag): the SAME register card, but the CTA registers
  // + unlocks on the spot (name + e-mail) instead of sending an OTP code. The OTP path is
  // untouched when the flag is off.
  const simpleMode = !!(state.data && state.data.access && state.data.access.simple_enroll);
  let name = '';
  let cooldownUntil = 0;  // Date.now() ms when "Reenviar" frees up again (60s gate)
  const startCooldown = (s) => { cooldownUntil = Date.now() + Math.max(0, s) * 1000; };

  function reload() {
    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
  }
  // The student typed their name up front (a1 collects it with the e-mail), so a
  // fresh registration's profile step is satisfied here without a second screen.
  async function settle() {
    if (flow.state === 'authenticated') { reload(); return; }
    if (flow.state === 'profile') { await flow.saveProfile(name, true); settle(); return; }
    renderCard();
  }
  function renderCard() {
    if (flow.state === 'code' || flow.state === 'verifying') renderCardCode();
    else renderCardForm();
  }

  function renderCardForm() {
    cardEl.innerHTML =
      '<h3 class="cdx-en-card-h">' + esc(t('wall.card_h')) + '</h3>' +
      '<p class="cdx-en-card-s">' + esc(t('wall.card_sub')) + '</p>' +
      '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-reg-toggle" data-toggle-reg aria-expanded="false">' + esc(t('wall.reg_toggle')) + '</button>' +
      '<div class="cdx-en-reg-fields">' +
        '<div class="cdx-en-field">' +
          '<label class="cdx-en-label" for="cdx-en-name">' + esc(t('login.name_label')) + '</label>' +
          '<input id="cdx-en-name" class="cdx-en-input" type="text" autocomplete="name" placeholder="' + esc(t('login.name_placeholder')) + '">' +
        '</div>' +
        '<div class="cdx-en-field">' +
          '<label class="cdx-en-label" for="cdx-en-email">' + esc(t('login.email_label')) + '</label>' +
          '<input id="cdx-en-email" class="cdx-en-input" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(t('login.email_placeholder')) + '">' +
        '</div>' +
        '<div class="cdx-en-error" aria-live="polite">' + esc(errorText(flow.error, flow.retryAfter)) + '</div>' +
        '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-cta">' + esc(t('wall.cta')) + '</button>' +
        '<p class="cdx-en-nopass">' + esc(t('wall.nopass')) + '</p>' +
        '<p class="cdx-en-haveacct">' + esc(t('wall.have_account')) + '</p>' +
        '<p class="cdx-en-consent">' + esc(t('login.consent_notice')) + '</p>' +
      '</div>';
    // On an error re-render, reveal the fields on mobile so the message is visible.
    if (flow.error) cardEl.classList.add('is-open');
    const toggle = cardEl.querySelector('[data-toggle-reg]');
    toggle.addEventListener('click', () => {
      cardEl.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      const first = cardEl.querySelector('.cdx-en-reg-fields input');
      if (first) first.focus();
    });
    const nameEl = cardEl.querySelector('#cdx-en-name');
    const emailEl = cardEl.querySelector('#cdx-en-email');
    const cta = cardEl.querySelector('.cdx-en-cta');
    if (name && nameEl) nameEl.value = name;
    const submit = async () => {
      name = (nameEl.value || '').trim();
      cta.disabled = true;
      cta.textContent = t('login.sending');
      // Simple sign-up: register + grant access on the spot (no code round-trip). settle()
      // saves the profile/consent if needed and reloads into the now-approved timeline.
      if (simpleMode) { await flow.simpleEnroll(emailEl.value, name); settle(); return; }
      await flow.requestCode(emailEl.value);
      if (flow.state === 'code' && !flow.codeStillValid) startCooldown(60); // a new code was just sent
      settle();
    };
    cta.addEventListener('click', submit);
    emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  function renderCardCode() {
    const dev = flow.devCode
      ? '<p class="cdx-en-nopass cdx-en-dev"><strong>' + esc(t('login.dev_code')) + '</strong> ' + esc(flow.devCode) + '</p>'
      : '';
    cardEl.classList.add('is-open');
    cardEl.innerHTML =
      '<h3 class="cdx-en-card-h">' + esc(t('login.code_title')) + '</h3>' +
      '<p class="cdx-en-card-s">' + esc(t('login.code_desc')) + '</p>' +
      '<div class="cdx-en-code-fields">' +
        '<div class="cdx-en-field">' +
          '<label class="cdx-en-label" for="cdx-en-code">' + esc(t('login.code_label')) + '</label>' +
          '<input id="cdx-en-code" class="cdx-en-input" type="text" maxlength="4" autocapitalize="characters" autocomplete="one-time-code" placeholder="' + esc(t('login.code_ph')) + '">' +
        '</div>' +
        dev +
        '<div class="cdx-en-error" aria-live="polite">' + esc(errorText(flow.error, flow.retryAfter)) + '</div>' +
        '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-cta">' + esc(t('login.verify')) + '</button>' +
        '<button type="button" class="cdx-en-resend" data-resend>' + esc(t('login.resend')) + '</button>' +
      '</div>';
    const codeEl = cardEl.querySelector('#cdx-en-code');
    if (flow.devCode) codeEl.value = flow.devCode;
    const cta = cardEl.querySelector('.cdx-en-cta');
    const errEl = cardEl.querySelector('.cdx-en-error');
    // Reused-code hint: re-entering the e-mail didn't fire a new code, the old one still works.
    if (flow.codeStillValid) { errEl.classList.add('cdx-en-ok'); errEl.textContent = t('login.code_still_valid'); }
    const submit = async () => { cta.disabled = true; await flow.verifyCode(codeEl.value); settle(); };
    cta.addEventListener('click', submit);
    codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    // Reenviar: re-request with the e-mail already in the flow (no retype). Gated to once a
    // minute — the button counts down ("Reenviar em 59s…") and resumes across re-renders.
    const resend = cardEl.querySelector('[data-resend]');
    let cancelCd = cooldownButton(resend, Math.ceil((cooldownUntil - Date.now()) / 1000), t('login.resend'), t('login.resend_in'));
    resend.addEventListener('click', async () => {
      if (resend.disabled) return;
      await flow.requestCode(flow.email, { resend: true });
      if (flow.error) { settle(); return; }                          // hour-cap / error -> form with the message
      cancelCd();
      const secs = flow.retryAfter || 60;                            // throttled -> wait; else a fresh 60s
      if (!flow.retryAfter) { if (flow.devCode) codeEl.value = flow.devCode; errEl.classList.add('cdx-en-ok'); errEl.textContent = t('login.resend_sent'); }
      startCooldown(secs);
      cancelCd = cooldownButton(resend, secs, t('login.resend'), t('login.resend_in'));
    });
    setTimeout(() => { try { codeEl.focus(); } catch (_) {} }, 50);
  }

  renderCard();
}
