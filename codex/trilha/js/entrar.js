// codex/trilha/js/entrar.js
// The single student entry surface at /trilha (bare) and /trilha/<code>. Three ways
// in, resolved on one page (no separate login page):
//   1. localStorage-first: the turmas this device already signed into, listed as the
//      "minhas turmas" hub (relaunch with no re-login).
//   2. class código (4 digits, on the live-room screen): resolveEnrollCode -> forward
//      into /trilha/<client>/<turma>?k=...&et=..., exactly as a QR scan would.
//   3. e-mail: a 4-letter OTP code -> the turma list (the hub). One code proves the
//      address across every turma; the magic link is retired.
import { trail } from './api.js';
import { t } from '../i18n.js';
import { esc } from './utils.js';
import { createLoginFlow } from './student-login.js';
import { getKnownTurmas } from './student-session.js';

function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
      const kv = pair.split(':');
      if (kv.length === 2) el.setAttribute(kv[0].trim(), t(kv[1].trim()));
    });
  });
}

// The code arrives as ?code=NNNN or as the path segment /trilha/NNNN (the rewrite keeps
// the visible path). Pull the 4-digit token from either.
export function readCode(search, pathname) {
  try {
    const q = new URLSearchParams(search || '').get('code');
    if (q && /^[0-9]{4}$/.test(q.trim())) return q.trim();
  } catch (_) { /* fall through to the path */ }
  const m = String(pathname || '').match(/(\d{4})\/?$/);
  return m ? m[1] : '';
}

// PURE. The launch URL for a known/verified turma (the hub links + the post-login
// redirect use it). Carries the public turma token k, same as the shared turma link.
export function buildTurmaUrl(entry, origin) {
  const base = origin || (typeof location !== 'undefined' ? location.origin : '');
  return base + '/trilha/' + encodeURIComponent(entry.client_slug) + '/' +
    encodeURIComponent(entry.turma_slug) + '?k=' + encodeURIComponent(entry.k || entry.token || '');
}

// Inline OTP error code -> student-facing message.
function entryErrorText(code) {
  if (!code) return '';
  if (code === 'email_invalid') return t('login.email_invalid');
  if (code === 'invalid_code') return t('login.code_invalid');
  if (code === 'code_expired' || code === 'code_used') return t('login.code_expired');
  return t('login.error');
}

async function resolveAndGo(code, els) {
  els.error.textContent = '';
  els.btn.disabled = true;
  els.state.textContent = t('entrar.entering');
  let res;
  try { res = await trail.resolveEnrollCode({ code }); } catch (_) { res = null; }
  if (res && res.found) {
    const url = location.origin + '/trilha/' + encodeURIComponent(res.client_slug) + '/' +
      encodeURIComponent(res.turma_slug) + '?k=' + encodeURIComponent(res.turma_token || '') +
      '&et=' + encodeURIComponent(res.enrollment_token || '');
    location.replace(url); // forward into the trilha as if the QR were scanned
    return;
  }
  els.state.textContent = '';
  els.btn.disabled = false;
  els.error.textContent = t('entrar.not_found');
}

// Render the "minhas turmas" hub from the device registry (or hide it when empty).
function renderHub(hubEl, turmas) {
  if (!hubEl) return;
  if (!turmas || !turmas.length) { hubEl.hidden = true; hubEl.innerHTML = ''; return; }
  hubEl.hidden = false;
  hubEl.innerHTML =
    '<h2 class="cdx-entrar-hub-h">' + esc(t('entrar.my_turmas')) + '</h2>' +
    '<div class="cdx-entrar-hub-list">' +
      turmas.map((tt) =>
        '<a class="cdx-entrar-hub-card" href="' + esc(buildTurmaUrl(tt)) + '">' +
          '<span class="cdx-entrar-hub-turma">' + esc(tt.turma_name || tt.turma_slug) + '</span>' +
          '<span class="cdx-entrar-hub-client">' + esc(tt.client_name || tt.client_slug) + '</span>' +
        '</a>').join('') +
    '</div>';
}

// The e-mail -> OTP -> hub flow, rendered inline into the email section. Turma-agnostic:
// the code proves the address, then verify returns every turma it belongs to.
function startEmail(emailEl, hubEl) {
  if (!emailEl) return;
  const flow = createLoginFlow({}); // no client/turma -> turma-agnostic (lands on 'hub')

  function renderForm() {
    emailEl.innerHTML =
      '<div class="cdx-entrar-sep">' + esc(t('entrar.or')) + '</div>' +
      '<p class="cdx-entrar-text">' + esc(t('entrar.email_lead')) + '</p>' +
      '<div class="cdx-entrar-form">' +
        '<div class="cdx-entrar-error cdx-entrar-email-error" aria-live="polite"></div>' +
        '<input class="cdx-entrar-email-input" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(t('login.email_placeholder')) + '" aria-label="' + esc(t('login.email_label')) + '">' +
        '<button class="cdx-entrar-btn cdx-entrar-email-send" type="button">' + esc(t('login.send_code')) + '</button>' +
      '</div>';
    const input = emailEl.querySelector('.cdx-entrar-email-input');
    const send = emailEl.querySelector('.cdx-entrar-email-send');
    const err = emailEl.querySelector('.cdx-entrar-email-error');
    const doSend = async () => {
      err.textContent = '';
      send.disabled = true;
      send.textContent = t('login.sending');
      await flow.requestCode(input.value);
      if (flow.state === 'code') { renderCode(); return; }
      err.textContent = entryErrorText(flow.error);
      send.disabled = false;
      send.textContent = t('login.send_code');
    };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
  }

  function renderCode() {
    const dev = flow.devCode
      ? '<p class="cdx-entrar-dev"><strong>' + esc(t('login.dev_code')) + '</strong> ' + esc(flow.devCode) + '</p>'
      : '';
    emailEl.innerHTML =
      '<div class="cdx-entrar-sep">' + esc(t('entrar.or')) + '</div>' +
      '<p class="cdx-entrar-text">' + esc(t('login.code_desc')) + '</p>' +
      '<div class="cdx-entrar-form">' +
        '<div class="cdx-entrar-error cdx-entrar-email-error" aria-live="polite"></div>' +
        '<input class="cdx-entrar-input cdx-entrar-code-input" type="text" maxlength="4" autocapitalize="characters" autocomplete="one-time-code" placeholder="' + esc(t('login.code_ph')) + '" aria-label="' + esc(t('login.code_label')) + '">' +
        dev +
        '<button class="cdx-entrar-btn cdx-entrar-code-verify" type="button">' + esc(t('login.verify')) + '</button>' +
      '</div>';
    const input = emailEl.querySelector('.cdx-entrar-code-input');
    if (flow.devCode) input.value = flow.devCode;
    const verify = emailEl.querySelector('.cdx-entrar-code-verify');
    const err = emailEl.querySelector('.cdx-entrar-email-error');
    const doVerify = async () => {
      err.textContent = '';
      verify.disabled = true;
      await flow.verifyCode(input.value);
      if (flow.state === 'hub') {
        const turmas = flow.turmas || [];
        if (turmas.length === 1) { location.href = buildTurmaUrl(turmas[0]); return; }
        if (!turmas.length) { err.textContent = t('entrar.no_turmas'); verify.disabled = false; return; }
        renderHub(hubEl, turmas);
        emailEl.innerHTML = '<p class="cdx-entrar-state">' + esc(t('entrar.hub_ready')) + '</p>';
        if (hubEl && hubEl.scrollIntoView) hubEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      err.textContent = entryErrorText(flow.error);
      verify.disabled = false;
    };
    verify.addEventListener('click', doVerify);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 50);
  }

  renderForm();
}

export function start() {
  applyI18n(document);
  const els = {
    form: document.getElementById('cdx-entrar-form'),
    input: document.getElementById('cdx-entrar-input'),
    btn: document.getElementById('cdx-entrar-btn'),
    error: document.getElementById('cdx-entrar-error'),
    state: document.getElementById('cdx-entrar-state'),
    hub: document.getElementById('cdx-entrar-hub'),
    email: document.getElementById('cdx-entrar-email'),
  };
  if (!els.form) return;
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = String(els.input.value || '').trim();
    if (!/^[0-9]{4}$/.test(code)) { els.error.textContent = t('entrar.invalid'); return; }
    resolveAndGo(code, els);
  });
  // localStorage-first: list the turmas this device already knows.
  renderHub(els.hub, getKnownTurmas());
  // e-mail path (OTP).
  startEmail(els.email, els.hub);
  // código link path: auto-resolve when the URL carried a 4-digit code.
  const code = readCode(location.search, location.pathname);
  if (code) { els.input.value = code; resolveAndGo(code, els); }
}
