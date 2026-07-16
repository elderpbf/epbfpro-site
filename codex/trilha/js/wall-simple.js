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
import { entryHtml, contextFromState } from './support-contact.js';
import { consentNoticeHtml } from './consent-notice.js';
import { glyphSvg } from '../../js/glyphs.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// PURE. Compact "dd mmm" PT date (copied from wall.js so this page stands alone).
function shortDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr == null ? '' : dateStr));
  if (!m) return '';
  const mon = PT_MONTHS[Number(m[2]) - 1] || '';
  return mon ? m[3] + ' ' + mon : '';
}

// Benefit icons, same set as the OTP wall. This file stays a deliberate standalone COPY of
// wall.js's register surface, but that was never a reason to hand-draw icons twice: these
// come from the shared library (js/glyphs.js), same as wall.js. `cert` is the hold-out for
// the same reason it is there, the library's `award` is a different drawing of the same idea.
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
    entryHtml(contextFromState(state), 'bloqueado');
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
    entryHtml(contextFromState(state), 'registro');

  const cardEl = wall.querySelector('.cdx-en-reg');
  renderCardForm(cardEl);
}

function renderCardForm(cardEl) {
  // E-mail-FIRST, name revealed only for a new address (Élder 2026-07-14): the simple wall now behaves
  // exactly like the normal login. The name field starts hidden; the worker's ask_name -> needs_name
  // reveals it inline for a brand-new e-mail, and a known e-mail is granted on the spot with e-mail alone.
  cardEl.innerHTML =
    '<h3 class="cdx-en-card-h">' + esc(t('simplewall.card_h')) + '</h3>' +
    '<p class="cdx-en-card-s">' + esc(t('simplewall.card_sub')) + '</p>' +
    '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-reg-toggle" data-toggle-reg aria-expanded="false">' + esc(t('wall.reg_toggle')) + '</button>' +
    '<div class="cdx-en-reg-fields">' +
      '<div class="cdx-en-field cdx-en-namefield hidden">' +
        '<label class="cdx-en-label" for="cdx-en-name">' + esc(t('login.name_label')) + '</label>' +
        '<input id="cdx-en-name" class="cdx-en-input" type="text" autocomplete="name" placeholder="' + esc(t('login.name_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-en-field">' +
        '<label class="cdx-en-label" for="cdx-en-email">' + esc(t('login.email_label')) + '</label>' +
        '<input id="cdx-en-email" class="cdx-en-input" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(t('login.email_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-en-error" aria-live="polite"></div>' +
      '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-cta">' + esc(t('simplewall.cta')) + '</button>' +
      consentNoticeHtml() +
    '</div>';

  const toggle = cardEl.querySelector('[data-toggle-reg]');
  toggle.addEventListener('click', () => {
    cardEl.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    const email = cardEl.querySelector('#cdx-en-email');
    if (email) email.focus();
  });

  const nameField = cardEl.querySelector('.cdx-en-namefield');
  const nameEl = cardEl.querySelector('#cdx-en-name');
  const emailEl = cardEl.querySelector('#cdx-en-email');
  const cta = cardEl.querySelector('.cdx-en-cta');
  const errEl = cardEl.querySelector('.cdx-en-error');

  const submit = async () => {
    const email = (emailEl.value || '').trim().toLowerCase();
    const name = (nameEl.value || '').trim();
    errEl.classList.remove('cdx-en-ok');
    errEl.textContent = '';
    if (!EMAIL_RE.test(email)) { errEl.textContent = t('login.email_invalid'); return; }
    cta.disabled = true;
    cta.textContent = t('simplewall.submitting');
    // ask_name: a BRAND-NEW address is asked for the name inline BEFORE it is registered (e-mail-first,
    // same as the OTP wall). student_simple_enroll otherwise registers + approves + mints a session in
    // one call. callWorker throws on a worker { error }, so normalize that back into the error shape.
    let res;
    try { res = await trail.simpleEnroll({ client_slug: state.clientSlug, turma_slug: state.turmaSlug, email, name, ask_name: true }); }
    catch (e) { res = (e && e.data && typeof e.data === 'object') ? e.data : { error: (e && e.message) || 'error' }; }
    // Brand-new address: reveal the name field inline (lock the e-mail) and let them finish.
    if (res && res.needs_name) {
      if (nameField) nameField.classList.remove('hidden');
      emailEl.setAttribute('readonly', '');
      cta.disabled = false;
      cta.textContent = t('wall.continuar');
      setTimeout(() => { try { nameEl.focus(); } catch (_) {} }, 50);
      return;
    }
    if (!res || !res.ok || !res.session_token) {
      cta.disabled = false;
      cta.textContent = t('simplewall.cta');
      errEl.textContent = errorText(res && res.error);
      return;
    }
    sess.setToken(state.clientSlug, state.turmaSlug, res.session_token);
    // The name + e-mail the student just typed IS the consent act (the notice is shown on this card),
    // so stamp consent server-side for a fresh participation. Only when a name was actually typed (a
    // known e-mail entering with e-mail alone keeps its stored name).
    if (res.needs_profile && name) {
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
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}
