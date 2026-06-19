// codex/trilha/js/student-login-modal.js
// The login/cadastro modal: a thin DOM renderer over the student-login flow
// controller. All decision logic (state transitions, email validation, consent
// gating) lives in student-login.js and is unit-tested; this file only builds
// the per-state markup and wires events, so it is verified visually on staging.
// Reuses the Trail's shared modal shell (.tr-modal*, .tr-btn*) from
// tarefa-modal.css. The consent notice is the LGPD disclosure (login.consent_notice).
import { t } from '../i18n.js';
import { createLoginFlow, flowOptsFrom } from './student-login.js';
import { esc } from './utils.js';

// Map a flow error code to a student-facing message (display glue).
function errorText(code) {
  if (!code) return '';
  if (code === 'email_invalid') return t('login.email_invalid');
  if (code === 'consent_required') return t('login.consent_required');
  if (code === 'token_expired' || code === 'token_used' || code === 'invalid_token') return t('login.token_invalid');
  return t('login.error');
}

// openLoginModal({ client, turma, onAuthenticated?, startToken?, api?, session? })
// startToken triggers the magic-link return path (verify immediately).
export function openLoginModal(opts = {}) {
  const client = opts.client;
  const turma = opts.turma;
  const onAuthenticated = opts.onAuthenticated || (() => {});
  // Forward client/turma/k plus the page origin into the flow (the magic link must
  // carry k AND return to this deployment, not always prod).
  const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : undefined;
  const flow = createLoginFlow(flowOptsFrom(opts, origin));

  // Direct-access mode (opt-in turma, no email provider yet): a live QR/code (?et=) means
  // the student is in the room, so the first screen registers + grants access on the spot
  // (email + name + consent), no magic link. Gated server-side by the turma's flag.
  const enroll = !!opts.enrollToken;

  const bd = document.createElement('div');
  bd.className = 'tr-modal-backdrop tr-login-backdrop';
  bd.innerHTML =
    '<div class="tr-modal tr-login">' +
      '<button class="tr-modal-close" type="button" aria-label="Fechar">×</button>' +
      '<div class="tr-login-body"></div>' +
    '</div>';
  document.body.appendChild(bd);
  document.body.classList.add('tr-modal-open');

  const bodyEl = bd.querySelector('.tr-login-body');
  const closeBtn = bd.querySelector('.tr-modal-close');

  function close() {
    if (bd.parentNode) bd.parentNode.removeChild(bd);
    document.body.classList.remove('tr-modal-open');
    document.removeEventListener('keydown', escHandler);
  }
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  closeBtn.addEventListener('click', close);

  // After any async step: authenticated -> close + resume; otherwise re-render.
  function settle() {
    if (flow.state === 'authenticated') { close(); onAuthenticated(); }
    else render();
  }

  function render() {
    const s = flow.state;
    if (enroll && (s === 'anonymous' || s === 'email')) return renderEnroll();
    if (s === 'sent') return renderSent();
    if (s === 'verifying') return renderVerifying();
    if (s === 'profile') return renderProfile();
    if (s === 'error') return renderError();
    return renderEmail();
  }

  // Direct-access single step: email + name + consent -> join (approved on the spot).
  function renderEnroll() {
    bodyEl.innerHTML =
      '<h2 class="tr-modal-title">' + esc(t('login.enroll_title')) + '</h2>' +
      '<p class="tr-login-subtitle">' + esc(t('login.enroll_subtitle')) + '</p>' +
      '<label class="tr-tarefa-field-label" for="tr-en-email">' + esc(t('login.email_label')) + '</label>' +
      '<input id="tr-en-email" type="email" class="tr-tarefa-name tr-en-email" placeholder="' + esc(t('login.email_placeholder')) + '" autocomplete="email" inputmode="email">' +
      '<label class="tr-tarefa-field-label" for="tr-en-name">' + esc(t('login.name_label')) + '</label>' +
      '<input id="tr-en-name" type="text" class="tr-tarefa-name tr-en-name" placeholder="' + esc(t('login.name_placeholder')) + '" autocomplete="name">' +
      '<div class="tr-login-consent">' +
        '<p class="tr-login-consent-notice">' + esc(t('login.consent_notice')) + '</p>' +
        '<label class="tr-login-consent-row">' +
          '<input type="checkbox" class="tr-en-consent">' +
          '<span>' + esc(t('login.consent_label')) + '</span>' +
        '</label>' +
      '</div>' +
      '<div class="tr-tarefa-error tr-login-error" aria-live="polite">' + esc(errorText(flow.error)) + '</div>' +
      '<div class="tr-tarefa-actions">' +
        '<button type="button" class="tr-btn tr-btn-primary tr-en-join">' + esc(t('login.enroll_cta')) + '</button>' +
      '</div>';
    const emailEl = bodyEl.querySelector('.tr-en-email');
    const nameEl = bodyEl.querySelector('.tr-en-name');
    const consentEl = bodyEl.querySelector('.tr-en-consent');
    const join = bodyEl.querySelector('.tr-en-join');
    join.addEventListener('click', async () => {
      if (!consentEl.checked) { flow.error = 'consent_required'; render(); return; }
      join.disabled = true;
      await flow.enrollJoin(emailEl.value, nameEl.value);
      if (flow.state === 'profile') await flow.saveProfile(nameEl.value, true); // consent already given
      settle();
    });
    setTimeout(() => { try { emailEl.focus(); } catch (_) {} }, 60);
  }

  function renderEmail() {
    bodyEl.innerHTML =
      '<h2 class="tr-modal-title">' + esc(t('login.title')) + '</h2>' +
      '<p class="tr-login-subtitle">' + esc(t('login.subtitle')) + '</p>' +
      '<label class="tr-tarefa-field-label" for="tr-login-email">' + esc(t('login.email_label')) + '</label>' +
      '<input id="tr-login-email" type="email" class="tr-tarefa-name tr-login-email" placeholder="' + esc(t('login.email_placeholder')) + '" autocomplete="email" inputmode="email">' +
      '<div class="tr-tarefa-error tr-login-error" aria-live="polite">' + esc(errorText(flow.error)) + '</div>' +
      '<div class="tr-tarefa-actions">' +
        '<button type="button" class="tr-btn tr-btn-primary tr-login-send">' + esc(t('login.send_link')) + '</button>' +
      '</div>';
    const input = bodyEl.querySelector('.tr-login-email');
    const send = bodyEl.querySelector('.tr-login-send');
    const doSend = async () => {
      send.disabled = true;
      send.textContent = t('login.sending');
      await flow.requestLink(input.value);
      settle();
    };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 60);
  }

  function renderSent() {
    let dev = '';
    if (flow.devToken) {
      dev =
        '<div class="tr-login-dev">' +
          '<p class="tr-tarefa-hint">' + esc(t('login.dev_link')) + '</p>' +
          '<button type="button" class="tr-btn tr-btn-ghost tr-login-dev-continue">' + esc(t('login.verifying')) + '</button>' +
        '</div>';
    }
    bodyEl.innerHTML =
      '<h2 class="tr-modal-title">' + esc(t('login.sent_title')) + '</h2>' +
      '<p class="tr-login-subtitle">' + esc(t('login.sent_desc')) + '</p>' +
      dev;
    const cont = bodyEl.querySelector('.tr-login-dev-continue');
    if (cont) {
      cont.addEventListener('click', async () => {
        cont.disabled = true;
        await flow.verify(flow.devToken);
        settle();
      });
    }
  }

  function renderVerifying() {
    bodyEl.innerHTML =
      '<h2 class="tr-modal-title">' + esc(t('login.verifying')) + '</h2>' +
      '<div class="tr-login-spinner" aria-hidden="true"></div>';
  }

  function renderProfile() {
    bodyEl.innerHTML =
      '<h2 class="tr-modal-title">' + esc(t('login.profile_title')) + '</h2>' +
      '<p class="tr-login-subtitle">' + esc(t('login.profile_desc')) + '</p>' +
      '<label class="tr-tarefa-field-label" for="tr-login-name">' + esc(t('login.name_label')) + '</label>' +
      '<input id="tr-login-name" type="text" class="tr-tarefa-name tr-login-name" placeholder="' + esc(t('login.name_placeholder')) + '" autocomplete="name">' +
      '<div class="tr-login-consent">' +
        '<p class="tr-login-consent-notice">' + esc(t('login.consent_notice')) + '</p>' +
        '<label class="tr-login-consent-row">' +
          '<input type="checkbox" class="tr-login-consent-cb">' +
          '<span>' + esc(t('login.consent_label')) + '</span>' +
        '</label>' +
      '</div>' +
      '<div class="tr-tarefa-error tr-login-error" aria-live="polite">' + esc(errorText(flow.error)) + '</div>' +
      '<div class="tr-tarefa-actions">' +
        '<button type="button" class="tr-btn tr-btn-primary tr-login-finish">' + esc(t('login.finish')) + '</button>' +
      '</div>';
    const name = bodyEl.querySelector('.tr-login-name');
    const consent = bodyEl.querySelector('.tr-login-consent-cb');
    const finish = bodyEl.querySelector('.tr-login-finish');
    finish.addEventListener('click', async () => {
      finish.disabled = true;
      await flow.saveProfile(name.value, !!consent.checked);
      finish.disabled = false;
      settle();
    });
    setTimeout(() => { try { name.focus(); } catch (_) {} }, 60);
  }

  function renderError() {
    bodyEl.innerHTML =
      '<h2 class="tr-modal-title">' + esc(t('login.title')) + '</h2>' +
      '<div class="tr-tarefa-error tr-login-error">' + esc(errorText(flow.error)) + '</div>' +
      '<div class="tr-tarefa-actions">' +
        '<button type="button" class="tr-btn tr-btn-primary tr-login-retry">' + esc(t('login.send_link')) + '</button>' +
      '</div>';
    bodyEl.querySelector('.tr-login-retry').addEventListener('click', () => {
      flow.state = 'email';
      flow.error = null;
      render();
    });
  }

  // Entry: the magic-link return path verifies straight away; otherwise show email.
  if (opts.startToken) {
    render(); // shows nothing yet (anonymous->email); switch to verifying then verify.
    flow.state = 'verifying';
    renderVerifying();
    flow.verify(opts.startToken).then(settle);
  } else {
    render();
  }

  return { close };
}
