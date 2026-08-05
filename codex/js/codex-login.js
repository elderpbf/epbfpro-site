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

// ── Dev-only shared preview session ──────────────────────────────────────────
// On the STAGING PREVIEW domain only, the admin session is mirrored into a cookie scoped to
// the parent domain (epbfpro-site-staging.pages.dev), so a login on ANY per-branch subdomain
// (slides-p89.…, labs.…, <hash>.…) carries to every other one: one 30-day login instead of one
// per branch. Gated hard on the host, so it is INERT on production (pensoia.com) and anywhere
// else — there it never reads, writes, or clears a cookie, and auth stays localStorage-only.
// Safe because only our own deploys can hold this domain and it is the admin's own token.
const DEV_COOKIE = 'cdx_dev_session';
const DEV_COOKIE_DOMAIN = 'epbfpro-site-staging.pages.dev';
const DEV_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // match the 30-day admin session TTL

function isPreviewHost() {
  try {
    const h = location.hostname;
    return h === DEV_COOKIE_DOMAIN || h.endsWith('.' + DEV_COOKIE_DOMAIN);
  } catch (_) { return false; }
}
function readDevCookie() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)cdx_dev_session=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  } catch (_) { return ''; }
}
function writeDevCookie(token) {
  if (!isPreviewHost() || !token) return;
  try {
    document.cookie = DEV_COOKIE + '=' + encodeURIComponent(token) +
      '; Domain=' + DEV_COOKIE_DOMAIN + '; Path=/; Max-Age=' + DEV_COOKIE_MAX_AGE + '; Secure; SameSite=Lax';
  } catch (_) {}
}
function clearDevCookie() {
  if (!isPreviewHost()) return;
  try {
    document.cookie = DEV_COOKIE + '=; Domain=' + DEV_COOKIE_DOMAIN + '; Path=/; Max-Age=0; Secure; SameSite=Lax';
  } catch (_) {}
}
// Adopt the shared cookie's token when this preview subdomain has no local session yet.
function hydrateFromDevCookie() {
  if (!isPreviewHost()) return;
  try {
    if (localStorage.getItem(PW_KEY)) return;
    const t = readDevCookie();
    if (t) localStorage.setItem(PW_KEY, t);
  } catch (_) {}
}

export function isAuthed() {
  hydrateFromDevCookie(); // no-op off the preview domain
  try { return !!localStorage.getItem(PW_KEY); } catch (_) { return false; }
}

// Sign out of Codex: drop the admin session (and any Google connection) and return to
// the Codex login. Codex-owned, so logout no longer bounces to /backstage/.
export function signOut() {
  try { localStorage.removeItem(PW_KEY); } catch (_) {}
  clearDevCookie(); // drop the shared preview session too (logout is deck-wide across previews)
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
    // Os três que faltavam. `too_many_attempts` já podia chegar aqui e caía no texto genérico, que
    // manda a pessoa "tentar de novo" justamente quando tentar de novo não adianta mais.
    case 'too_many_attempts': return 'Muitas tentativas neste código. Clique em reenviar para receber um novo.';
    case 'resend_too_soon':   return 'Aguarde um instante antes de pedir outro código.';
    // E este é o que separa erro NOSSO de erro de quem digitou: transporte fora do ar não pode
    // aparecer como "código inválido", que acusa o usuário de um erro que é da casa.
    case 'otp_unavailable':   return 'O serviço de código está indisponível. Tente de novo em instantes.';
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
  // Um só campo de código no site inteiro (js/code-input.js): maiúsculo no VALOR (não só no
  // que se vê), tamanho certo e centralizado. Antes disto o comportamento estava no HTML.
  if (window.CodeInput) window.CodeInput.attach(codeEl, { length: 4 });
  const errEl = $('cdx-login-error');
  const emailBtn = $('cdx-login-email-btn');
  const codeBtn = $('cdx-login-code-btn');
  const backBtn = $('cdx-login-back-btn');
  const resendBtn = $('cdx-login-resend-btn');
  const emailEcho = $('cdx-login-email-echo');
  const noteEl = $('cdx-login-note');
  let currentEmail = '';

  // A ESPERA ENTRE REENVIOS, VISÍVEL. São 60s do lado do servidor (o módulo `otp` da plataforma
  // recusa antes disso), e enquanto ela era invisível o botão "Reenviar código" respondia com um
  // erro seco a um clique que parecia legítimo. Contagem regressiva no próprio rótulo: a pessoa vê
  // quando pode pedir de novo em vez de descobrir tentando.
  const ESPERA_REENVIO_SEG = 60;
  const ROTULO_REENVIO = (resendBtn && resendBtn.textContent) || 'Reenviar código';
  let faltam = 0;
  let relogio = null;

  function pintarReenvio() {
    if (!resendBtn) return;
    resendBtn.disabled = faltam > 0;
    resendBtn.textContent = faltam > 0 ? (ROTULO_REENVIO + ' em ' + faltam + 's') : ROTULO_REENVIO;
  }
  // Começa (ou RECOMEÇA) a espera. Recomeçar é o ponto: depois de um reenvio bem-sucedido a conta
  // volta do zero, senão o segundo clique cai no mesmo erro invisível que este código veio matar.
  function esperar(segundos) {
    faltam = Math.max(0, Math.round(segundos || 0));
    if (relogio) clearInterval(relogio);
    pintarReenvio();
    if (!faltam) return;
    relogio = setInterval(function () {
      faltam -= 1;
      pintarReenvio();
      if (faltam <= 0) { clearInterval(relogio); relogio = null; }
    }, 1000);
  }

  function setErr(msg) { if (errEl) errEl.textContent = msg || ''; }
  function setNote(msg) { if (noteEl) noteEl.textContent = msg || ''; }
  function showStep(which) {
    if (emailStep) emailStep.hidden = which !== 'email';
    if (codeStep) codeStep.hidden = which !== 'code';
    setErr('');
    setNote('');
    if (which === 'email' && emailEl) emailEl.focus();
    if (which === 'code' && codeEl) { codeEl.value = ''; codeEl.focus(); }
  }

  // `reenvio` escolhe a ação, e as duas existem de propósito: pedir e reenviar deixaram de ser a
  // mesma coisa quando o login passou a falar com o módulo `otp` da plataforma. Pedir com código
  // vivo NÃO manda outro e-mail (senão a pessoa fica com dois na caixa e digita o errado); só o
  // reenvio explícito emite. Chamar `otpRequest` no "não recebi" responderia ok e não mandaria nada.
  async function requestCode(email, reenvio) {
    setErr('');
    setNote('');
    if (emailBtn) emailBtn.disabled = true;
    if (resendBtn) resendBtn.disabled = true;
    try {
      // callWorker throws on a worker {error}; reaching the next line means ok.
      await (reenvio ? auth.otpResend({ email: email }) : auth.otpRequest({ email: email }));
      currentEmail = email;
      if (emailEcho) emailEcho.textContent = email;
      if (reenvio) {
        // NO REENVIO NÃO SE TROCA DE PASSO: a pessoa já está na tela do código. `showStep` limparia
        // o campo e a confirmação, e o clique voltaria a não ter resposta visível nenhuma, que é
        // exatamente o defeito. Aqui ela VÊ que outro código saiu.
        setNote('Enviamos um novo código para ' + email + '. O anterior deixou de valer.');
      } else {
        showStep('code');
      }
      esperar(ESPERA_REENVIO_SEG);
    } catch (e) {
      const code = (e && e.data && e.data.error) || '';
      logErr('admin_otp_request failed: ' + (code || (e && e.message) || 'unknown'));
      setErr(messageFor(code));
      // O servidor sabe quanto falta; obedecer ao número dele em vez de recomeçar 60 do nosso lado
      // evita o relógio da tela e o do servidor divergirem depois de um recarregamento de página.
      const faltamNoServidor = e && e.data && e.data.retry_after;
      if (code === 'resend_too_soon' && faltamNoServidor) esperar(faltamNoServidor);
    } finally {
      if (emailBtn) emailBtn.disabled = false;
      // NÃO reabilita o reenvio à força: quem manda no estado dele é a contagem regressiva, e um
      // `disabled = false` aqui a atropelaria justo no clique que a acabou de iniciar.
      pintarReenvio();
    }
  }

  async function verifyCode(email, codeVal) {
    setErr('');
    setNote('');
    if (codeBtn) codeBtn.disabled = true;
    try {
      const r = await auth.otpVerify({ email: email, code: codeVal });
      if (r && r.admin_session) {
        try { localStorage.setItem(PW_KEY, r.admin_session); } catch (_) {}
        writeDevCookie(r.admin_session); // share this login across all preview subdomains (no-op off preview)
        location.reload();   // re-run the boot; isAuthed() is now true, the app mounts
        return;
      }
      setErr(messageFor(''));
      if (window.CodeInput) window.CodeInput.clear(codeEl);
    } catch (e) {
      const code = (e && e.data && e.data.error) || '';
      logErr('admin_otp_verify failed: ' + (code || (e && e.message) || 'unknown'));
      setErr(messageFor(code));
      // Código errado sai do campo, com o foco de volta (Élder 2026-07-31).
      if (window.CodeInput) window.CodeInput.clear(codeEl);
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
  if (resendBtn) resendBtn.addEventListener('click', function () { if (currentEmail) requestCode(currentEmail, true); });

  // Enter-to-submit on each field.
  if (emailEl) emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && emailBtn) emailBtn.click(); });
  if (codeEl) codeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && codeBtn) codeBtn.click(); });

  showStep('email');
}
