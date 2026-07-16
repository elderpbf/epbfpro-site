// codex/trilha/js/wall-access-emergency.js
// The BREAK-GLASS way in ("Emergência" in the admin panel, `simple_enroll` in the DB): name +
// e-mail, registered and granted ON THE SPOT, no code and no e-mail round-trip. It exists for
// when mail cannot reach the students at all. The worker arms it for 12h and it then closes by
// itself (migration 0039), so this face is normally unreachable.
//
// This is an ACCESS MODE: it owns the CARD and nothing else.
//
// It used to be a whole SECOND WALL (wall-simple.js), a copy of wall.js that drifted the moment
// it was made: it kept rendering the aulas roadmap Élder deleted from the wall on 2026-07-11,
// drew the blocked screen with a 🚫 emoji instead of the glyph library, and handled 3 error codes
// where the real wall handled 6. Élder 2026-07-15: "não deveria ter sido feito a duplicação de
// código, isso foi um erro". The shell is wall.js's now; only the card below is ours.
import { state } from './state.js';
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { trail } from './api.js';
import * as sess from './student-session.js';
import { consentNoticeHtml } from './consent-notice.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorText(code) {
  if (!code) return '';
  if (code === 'email_invalid') return t('login.email_invalid');
  if (code === 'access_blocked') return t('login.denied_body');
  // The 12h ran out (or the instructor turned it off) between the page load and the submit. The
  // wall would not have drawn this card at all if it had known, so say the truthful thing and let
  // a reload land them on the real door.
  if (code === 'simple_enroll_disabled') return t('login.error');
  return t('login.error');
}

// Mount the emergency entry card into the wall's card host. E-mail-FIRST, name revealed only for
// a new address (Élder 2026-07-14), exactly like the OTP card: the worker's ask_name -> needs_name
// reveals it inline, and a known e-mail is granted with e-mail alone.
export function mountEmergencyCard(cardEl) {
  cardEl.innerHTML =
    '<h3 class="cdx-en-card-h">' + esc(t('simplewall.card_h')) + '</h3>' +
    '<p class="cdx-en-card-s">' + esc(t('simplewall.card_sub')) + '</p>' +
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
    consentNoticeHtml();

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
    // ask_name: a BRAND-NEW address is asked for the name inline BEFORE it is registered, so nobody
    // is ever created named after their own e-mail. student_simple_enroll otherwise registers +
    // approves + mints a session in one call. callWorker THROWS on a worker { error }, so normalize
    // that back into the error shape.
    let res;
    try { res = await trail.simpleEnroll({ client_slug: state.clientSlug, turma_slug: state.turmaSlug, email, name, ask_name: true }); }
    catch (e) { res = (e && e.data && typeof e.data === 'object') ? e.data : { error: (e && e.message) || 'error' }; }
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
