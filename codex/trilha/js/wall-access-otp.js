// codex/trilha/js/wall-access-otp.js
// The DEFAULT way in, and the one every real turma uses: e-mail-first, driven by the shared
// login controller (student-login.js) over the magic link / 4-letter OTP.
//
// This is an ACCESS MODE: it owns the CARD and nothing else. The wall around it (shell,
// benefits, denied/pending notices) belongs to wall.js and is identical for every mode. Élder
// 2026-07-15: "elas deveriam todas acessar o mesmo código, só que existem algumas modificações
// de acesso, isso deveria ser plugável".
import { state } from './state.js';
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { createLoginFlow } from './student-login.js';
import { getPresence, extractEnrollToken } from './student-session.js';
import { consentNoticeHtml } from './consent-notice.js';
import { glyphSvg } from '../../js/glyphs.js';

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

// The locked poll cadence (Élder): 2s for the first ~6 calls, then 4/6/10/15s, capped at ~30
// calls (~5 min), then stop. Shared by both the validation poll and the approval poll.
const POLL_CADENCE = [2000, 2000, 2000, 2000, 2000, 2000, 4000, 6000, 10000, 15000];
const POLL_MAX = 30;

// Mount the OTP/magic entry card into the wall's card host. The poll lifetime lives INSIDE this
// closure: the mode that starts a timer is the mode that clears it.
export function mountOtpCard(cardEl) {
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
  // E-mail login is a hybrid keyed on the window, NO per-turma toggle (Élder 2026-07-14). The ONE window
  // OPEN (the "Janela" the instructor opens in class): the e-mail submit enters on the spot (15d for a
  // validated member, else 12h provisional + a magic take-home link e-mailed for later cementing), no
  // round-trip. Window CLOSED: the student is actively logging in at the form right now, so the fallback is
  // the 4-letter OTP code (typed back in this same tab; verifying it also cements the e-mail durably).
  // Both mechanisms live in the shared createLoginFlow.
  const windowOpen = !!(((state.data || {}).access || {}).window_open);
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
    if (flow.state === 'code') { renderCodeStep(); return; } // 'code' turma: type the emailed OTP
    renderCardForm(flow.state === 'needName');
  }

  // The single Entrar card: one e-mail field. The name field is present but hidden until the
  // worker says the address is NEW (needName), then revealed inline (no modal, same card).
  function renderCardForm(revealName) {
    cardEl.classList.remove('cdx-en-wait');
    // ONE e-mail-first form: the name field is revealed inline only when the worker says the address is
    // new (needName). In-window the submit enters instantly (reentry); otherwise it fires the OTP code
    // path (requestCode) and lands on the code screen.
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
      // Window open: try e-mail-only entry first (instant, no round-trip); if it closed mid-flight, fall
      // back to the OTP code. Window closed: the OTP code is the login (same-tab, cements the e-mail).
      if (windowOpen) {
        await flow.reentry(emailEl.value, name);
        if (flow.reentryClosed) await flow.requestCode(emailEl.value, { name });
      } else {
        await flow.requestCode(emailEl.value, { name });
      }
      settle();
    };
    cta.addEventListener('click', submit);
    emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    if (nameEl) nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  // The 'code' turma's second step: the student types the 4-letter OTP the worker e-mailed.
  // verifyCode exchanges (email, code) for the session (then the shared settle() lands them,
  // via the profile step for a first-time consent). "Reenviar" re-requests with a cooldown.
  function renderCodeStep() {
    cardEl.classList.add('cdx-en-wait');
    const dev = flow.devCode
      ? '<p class="cdx-en-nopass cdx-en-dev"><strong>' + esc(t('login.dev_link')) + '</strong> ' + esc(flow.devCode) + '</p>'
      : '';
    cardEl.innerHTML =
      '<div class="cdx-en-wait-ic" aria-hidden="true">' + glyphSvg('mail', { size: 34 }) + '</div>' +
      '<h3 class="cdx-en-card-h">' + esc(t('login.code_title')) + '</h3>' +
      '<p class="cdx-en-card-s">' + esc(t('login.code_desc')) + '</p>' +
      '<div class="cdx-en-field">' +
        '<label class="cdx-en-label" for="cdx-en-code">' + esc(t('login.code_label')) + '</label>' +
        '<input id="cdx-en-code" class="cdx-en-input" type="text" inputmode="text" autocomplete="one-time-code" maxlength="4" placeholder="' + esc(t('login.code_ph')) + '">' +
      '</div>' +
      dev +
      '<div class="cdx-en-error' + (flow.codeStillValid ? ' cdx-en-ok' : '') + '" aria-live="polite">' + esc(flow.codeStillValid ? t('login.code_still_valid') : errorText(flow.error, flow.retryAfter)) + '</div>' +
      '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-cta cdx-en-verify">' + esc(t('login.enroll_cta')) + '</button>' +
      '<button type="button" class="cdx-en-resend">' + esc(t('login.resend')) + '</button>';
    const codeEl = cardEl.querySelector('#cdx-en-code');
    const verify = cardEl.querySelector('.cdx-en-verify');
    const resend = cardEl.querySelector('.cdx-en-resend');
    setTimeout(() => { try { codeEl.focus(); } catch (_) {} }, 50);
    const doVerify = async () => {
      verify.disabled = true; verify.textContent = t('login.sending');
      await flow.verifyCode(codeEl.value);
      settle();
    };
    verify.addEventListener('click', doVerify);
    codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      await flow.requestCode(flow.email, { resend: true, name });
      resend.disabled = false;
      renderCodeStep();
    });
  }

  // Sent the link: "check your e-mail". "Já validei" re-checks NOW (covers the cross-device case:
  // validated on the phone, unlock this device), and the locked cadence polls in the background.
  function renderValidating() {
    const dev = flow.devMagicToken
      ? '<p class="cdx-en-nopass cdx-en-dev"><strong>' + esc(t('login.dev_link')) + '</strong> <a href="?lt=' + esc(flow.devMagicToken) + '&k=' + esc(state.token || '') + '">abrir link</a></p>'
      : '';
    cardEl.classList.add('cdx-en-wait');
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
  // Reuses the EXISTING pending message (login.pending_*), not a new one — the poll unlocks this
  // card in place when the instructor approves in the e-sino.
  function renderPendingApproval() {
    cardEl.classList.add('cdx-en-wait');
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
