// codex/trilha/js/wall-simple.js
// SEPARATE "simple sign-up" wall, used ONLY when the turma opts into the `simple_enroll`
// flag. It is a deliberate COPY of the register surface in wall.js (same cdx-en-* layout,
// benefits + roadmap + card) so the two look identical, but it does NOT share wall.js's
// e-mail-OTP login flow: here the student submits name + e-mail and is registered + granted
// access ON THE SPOT (no 4-letter code, no e-mail round-trip), via the public
// student_simple_enroll worker action. Kept fully standalone (no import from wall.js / the
// shared login controller) so the working OTP gate stays untouched.
import { state } from './state.js';
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { trail } from './api.js';
import * as sess from './student-session.js';
import { highlightHtml, contextFromState } from './support-contact.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// PURE. Compact "dd mmm" PT date (copied from wall.js so this page stands alone).
function shortDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr == null ? '' : dateStr));
  if (!m) return '';
  const mon = PT_MONTHS[Number(m[2]) - 1] || '';
  return mon ? m[3] + ' ' + mon : '';
}

// Benefit icons, same set as the OTP wall (copied verbatim).
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
  const aulas = (state.data || {}).aulas;
  const rows = (Array.isArray(aulas) ? aulas : [])
    .slice()
    .sort((a, b) => (a.aula_number || 0) - (b.aula_number || 0))
    .map((a) => ({ number: a.aula_number, title: a.title || ('Aula ' + a.aula_number), date: shortDate(a.scheduled_for || a.happened_on || '') }));
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

function errorText(code) {
  if (!code) return '';
  if (code === 'email_invalid') return t('login.email_invalid');
  if (code === 'access_blocked') return t('login.denied_body');
  return t('login.error');
}

// Mirror wall.js's renderWall shell: hide the timeline, mount the wall section, then render
// the denied notice (blocked student) or the simple register card.
export function renderSimpleWall(root) {
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
    wall.className = 'cdx-en-wall';
    const footer = main.querySelector('.cdx-trilha-footer');
    main.insertBefore(wall, footer || null);
  }
  const access = (state.data || {}).access || {};
  if (access.status === 'denied') { renderDenied(wall); return; }
  renderSimpleRegister(wall);
}

function renderDenied(wall) {
  wall.innerHTML =
    '<div class="cdx-en-pending cdx-en-denied">' +
      '<div class="cdx-en-pending-icon" aria-hidden="true">🚫</div>' +
      '<h2 class="cdx-en-pending-title">' + esc(t('login.denied_title')) + '</h2>' +
      '<p class="cdx-en-pending-body">' + esc(t('login.denied_body')) + '</p>' +
    '</div>' +
    highlightHtml(contextFromState(state));
}

function renderSimpleRegister(wall) {
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
    '<p class="cdx-en-questions">' + esc(t('wall.q_lead')) + ' <b>' + esc(t('wall.q_bold')) + '</b> ' + esc(t('wall.q_tail')) + '</p>' +
    highlightHtml(contextFromState(state));

  const cardEl = wall.querySelector('.cdx-en-reg');
  renderCardForm(cardEl);
}

function renderCardForm(cardEl) {
  cardEl.innerHTML =
    '<h3 class="cdx-en-card-h">' + esc(t('simplewall.card_h')) + '</h3>' +
    '<p class="cdx-en-card-s">' + esc(t('simplewall.card_sub')) + '</p>' +
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
      '<div class="cdx-en-error" aria-live="polite"></div>' +
      '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-cta">' + esc(t('simplewall.cta')) + '</button>' +
      '<p class="cdx-en-consent">' + esc(t('login.consent_notice')) + '</p>' +
    '</div>';

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
  const errEl = cardEl.querySelector('.cdx-en-error');

  const submit = async () => {
    const name = (nameEl.value || '').trim();
    const email = (emailEl.value || '').trim().toLowerCase();
    errEl.classList.remove('cdx-en-ok');
    errEl.textContent = '';
    if (!EMAIL_RE.test(email)) { errEl.textContent = t('login.email_invalid'); return; }
    cta.disabled = true;
    cta.textContent = t('simplewall.submitting');
    // student_simple_enroll registers + approves + mints a session in one call. callWorker
    // throws on a worker { error }, so normalize that back into the error shape here.
    let res;
    try { res = await trail.simpleEnroll({ client_slug: state.clientSlug, turma_slug: state.turmaSlug, email, name }); }
    catch (e) { res = (e && e.data && typeof e.data === 'object') ? e.data : { error: (e && e.message) || 'error' }; }
    if (!res || !res.ok || !res.session_token) {
      cta.disabled = false;
      cta.textContent = t('simplewall.cta');
      errEl.textContent = errorText(res && res.error);
      return;
    }
    sess.setToken(state.clientSlug, state.turmaSlug, res.session_token);
    // The name + e-mail the student just typed IS the consent act (the notice is shown on
    // this card), so stamp consent server-side when this is a fresh participation.
    if (res.needs_profile) {
      try {
        await trail.profileSave({
          session_token: res.session_token,
          display_name: name,
          consent: true,
          consent_version: sess.CONSENT_VERSION,
        });
      } catch (_) { /* access already granted; consent stamp is best-effort */ }
    }
    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
  };

  cta.addEventListener('click', submit);
  emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}
