// Codex own-login (item 11.2): the e-mail + OTP gate that replaces the legacy
// /codex/ -> /backstage/ redirect, so Codex authenticates against its OWN backend
// (codex-api: admin_otp_request / admin_otp_verify) with no Backstage dependency.
//
// The verified admin-session token is stored as bs_pw_hash, which is the exact slot
// worker-call.js already sends as auth_token on every codex-api call, so the rest of
// the app authenticates unchanged (no wiring beyond this module). On success the page
// reloads, so the normal boot re-runs with the app gated open.
//
// Google sign-in is intentionally absent for now: the login markup carries a hidden,
// reserved slot (#cdx-login-google-slot / #cdx-login-google-btn) to wire later.
//
// Errors surface to the shared debug pill (window.bsLog) AND an inline message, per the
// Codex rule that no error is swallowed into a generic message alone.

import { auth } from './codex-api.js';

const PW_KEY = 'bs_pw_hash';

function $(id) { return document.getElementById(id); }

function logErr(msg) {
  try { if (typeof window.bsLog === 'function') window.bsLog(msg, 'error'); } catch (_) {}
}

// Is the admin already authed on this device? Reads the same slot the transport sends.
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker (transport, js/worker-call.js); window.bsLog/window.dbg
//   (debug pill, backstage/js/debug.js); window.BS_GOOGLE (Google auth context)

export function isAuthed() {
  try { return !!localStorage.getItem(PW_KEY); } catch (_) { return false; }
}

// Sign out of Codex: drop the admin session (and any Google connection) and return to
// the Codex login. Codex-owned, so logout no longer bounces to /backstage/.
export function signOut() {
  try { localStorage.removeItem(PW_KEY); } catch (_) {}
  try { if (window.BS_GOOGLE && window.BS_GOOGLE.signOut) window.BS_GOOGLE.signOut(); } catch (_) {}
  try { sessionStorage.removeItem('bs_auth'); } catch (_) {}
  location.replace('/codex/');
}

// Map a worker error code to a human (pt-BR) message for the inline error line.
function messageFor(code) {
  switch (code) {
    case 'email_required': return 'Informe seu e-mail.';
    case 'not_authorized': return 'Este e-mail não tem acesso de administrador.';
    case 'invalid_code':   return 'Código inválido.';
    case 'code_used':      return 'Este código já foi usado. Peça um novo.';
    case 'code_expired':   return 'O código expirou. Peça um novo.';
    default:               return 'Não foi possível entrar. Tente novamente.';
  }
}

// Render the login screen and wire the two-step OTP flow. Called only when NOT authed.
export function mountLogin() {
  const login = $('screen-login');
  const app = $('screen-app');
  if (app) app.hidden = true;
  if (login) login.hidden = false;

  const emailStep = $('cdx-login-email-step');
  const codeStep = $('cdx-login-code-step');
  const emailEl = $('cdx-login-email');
  const codeEl = $('cdx-login-code');
  const errEl = $('cdx-login-error');
  const emailBtn = $('cdx-login-email-btn');
  const codeBtn = $('cdx-login-code-btn');
  const backBtn = $('cdx-login-back-btn');
  const resendBtn = $('cdx-login-resend-btn');
  const emailEcho = $('cdx-login-email-echo');
  let currentEmail = '';

  function setErr(msg) { if (errEl) errEl.textContent = msg || ''; }
  function showStep(which) {
    if (emailStep) emailStep.hidden = which !== 'email';
    if (codeStep) codeStep.hidden = which !== 'code';
    setErr('');
    if (which === 'email' && emailEl) emailEl.focus();
    if (which === 'code' && codeEl) { codeEl.value = ''; codeEl.focus(); }
  }

  async function requestCode(email) {
    setErr('');
    if (emailBtn) emailBtn.disabled = true;
    if (resendBtn) resendBtn.disabled = true;
    try {
      // callWorker throws on a worker {error}; reaching the next line means ok.
      await auth.otpRequest({ email: email });
      currentEmail = email;
      if (emailEcho) emailEcho.textContent = email;
      showStep('code');
    } catch (e) {
      const code = (e && e.data && e.data.error) || '';
      logErr('admin_otp_request failed: ' + (code || (e && e.message) || 'unknown'));
      setErr(messageFor(code));
    } finally {
      if (emailBtn) emailBtn.disabled = false;
      if (resendBtn) resendBtn.disabled = false;
    }
  }

  async function verifyCode(email, codeVal) {
    setErr('');
    if (codeBtn) codeBtn.disabled = true;
    try {
      const r = await auth.otpVerify({ email: email, code: codeVal });
      if (r && r.admin_session) {
        try { localStorage.setItem(PW_KEY, r.admin_session); } catch (_) {}
        location.reload();   // re-run the boot; isAuthed() is now true, the app mounts
        return;
      }
      setErr(messageFor(''));
    } catch (e) {
      const code = (e && e.data && e.data.error) || '';
      logErr('admin_otp_verify failed: ' + (code || (e && e.message) || 'unknown'));
      setErr(messageFor(code));
    } finally {
      if (codeBtn) codeBtn.disabled = false;
    }
  }

  if (emailBtn) emailBtn.addEventListener('click', function () {
    const email = ((emailEl && emailEl.value) || '').trim();
    if (!email) { setErr(messageFor('email_required')); return; }
    requestCode(email);
  });
  if (codeBtn) codeBtn.addEventListener('click', function () {
    const v = ((codeEl && codeEl.value) || '').trim();
    if (!v) { setErr(messageFor('invalid_code')); return; }
    verifyCode(currentEmail, v);
  });
  if (backBtn) backBtn.addEventListener('click', function () { showStep('email'); });
  if (resendBtn) resendBtn.addEventListener('click', function () { if (currentEmail) requestCode(currentEmail); });

  // Enter-to-submit on each field.
  if (emailEl) emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && emailBtn) emailBtn.click(); });
  if (codeEl) codeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && codeBtn) codeBtn.click(); });

  showStep('email');
}
