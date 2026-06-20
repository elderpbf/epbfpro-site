// codex/trilha/js/entrar.js
// The single student entry surface at /trilha (bare) and /trilha/<code>. The model
// (approved mock D): enter the LAST class this device used (the "Continuar" banner),
// with both ways in always open below — class código (4 digits) and e-mail (4-letter
// OTP). NO "minhas turmas" hub: switching between saved classes happens inside the
// trilha (the student area). When the student picks e-mail, the código card hides so
// the e-mailed code is unmistakable.
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

// PURE. The launch URL for a known/verified turma (the Continuar banner + the post-login
// redirect use it). Carries the public turma token k, same as the shared turma link.
export function buildTurmaUrl(entry, origin) {
  const base = origin || (typeof location !== 'undefined' ? location.origin : '');
  return base + '/trilha/' + encodeURIComponent(entry.client_slug) + '/' +
    encodeURIComponent(entry.turma_slug) + '?k=' + encodeURIComponent(entry.k || entry.token || '');
}

// PURE. Up to two uppercase initials for the Continuar avatar.
export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const take = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return take.toUpperCase();
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

// Fill the Continuar banner from the most-recent known turma (or hide it + the separator
// when this device knows none). One tap relaunches the last class without re-login.
function renderContinue(contEl, orEl, entry) {
  if (!contEl) return;
  if (!entry) { contEl.hidden = true; if (orEl) orEl.hidden = true; return; }
  contEl.href = buildTurmaUrl(entry);
  contEl.innerHTML =
    '<span class="cdx-entrar-cont-av" aria-hidden="true">' + esc(initials(entry.client_name || entry.client_slug)) + '</span>' +
    '<span class="cdx-entrar-cont-tx">' +
      '<span class="cdx-entrar-cont-k">' + esc(t('entrar.continue')) + '</span>' +
      '<span class="cdx-entrar-cont-name">' + esc(entry.turma_name || entry.turma_slug) + '</span>' +
      '<span class="cdx-entrar-cont-client">' + esc(entry.client_name || entry.client_slug) + '</span>' +
    '</span>' +
    '<span class="cdx-entrar-cont-go" aria-hidden="true">→</span>';
  contEl.hidden = false;
  if (orEl) orEl.hidden = false;
}

// The e-mail -> OTP flow, rendered inline into the e-mail card. Turma-agnostic: the code
// proves the address, verify returns every turma it belongs to (all remembered on this
// device), then we enter the most relevant one — no hub.
function startEmail(emailEl, root) {
  if (!emailEl) return;
  const flow = createLoginFlow({}); // unbound -> verify lands on 'hub' with the turma list

  function renderForm() {
    if (root) root.classList.remove('cdx-entrar-step-code');
    emailEl.innerHTML =
      '<h2 class="cdx-entrar-card-h">' + esc(t('entrar.email_h')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('entrar.email_lead')) + '</p>' +
      '<div class="cdx-entrar-error cdx-entrar-email-error" aria-live="polite"></div>' +
      '<input class="cdx-entrar-field cdx-entrar-email-input" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(t('login.email_placeholder')) + '" aria-label="' + esc(t('login.email_label')) + '">' +
      '<button class="cdx-entrar-btn cdx-entrar-email-send" type="button">' + esc(t('login.send_code')) + '</button>';
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
    if (root) root.classList.add('cdx-entrar-step-code'); // hide the código card; focus the e-mailed code
    const dev = flow.devCode
      ? '<p class="cdx-entrar-dev"><strong>' + esc(t('login.dev_code')) + '</strong> ' + esc(flow.devCode) + '</p>'
      : '';
    emailEl.innerHTML =
      '<h2 class="cdx-entrar-card-h">' + esc(t('login.code_title')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('entrar.code_sent')) + ' <strong>' + esc(flow.email || '') + '</strong>.</p>' +
      '<div class="cdx-entrar-error cdx-entrar-email-error" aria-live="polite"></div>' +
      '<input class="cdx-entrar-otp cdx-entrar-code-input" type="text" maxlength="4" autocapitalize="characters" autocomplete="one-time-code" placeholder="' + esc(t('login.code_ph')) + '" aria-label="' + esc(t('login.code_label')) + '">' +
      dev +
      '<button class="cdx-entrar-btn cdx-entrar-code-verify" type="button">' + esc(t('login.verify')) + '</button>' +
      '<button class="cdx-entrar-link cdx-entrar-back" type="button">' + esc(t('entrar.other_email')) + '</button>';
    const input = emailEl.querySelector('.cdx-entrar-code-input');
    if (flow.devCode) input.value = flow.devCode;
    const verify = emailEl.querySelector('.cdx-entrar-code-verify');
    const back = emailEl.querySelector('.cdx-entrar-back');
    const err = emailEl.querySelector('.cdx-entrar-email-error');
    const doVerify = async () => {
      err.textContent = '';
      verify.disabled = true;
      await flow.verifyCode(input.value);
      if (flow.state === 'hub') {
        const turmas = flow.turmas || [];
        if (!turmas.length) { err.textContent = t('entrar.no_turmas'); verify.disabled = false; return; }
        // No hub: enter the first turma (every turma was just remembered on this device,
        // so switching to another happens inside the trilha).
        location.href = buildTurmaUrl(turmas[0]);
        return;
      }
      err.textContent = entryErrorText(flow.error);
      verify.disabled = false;
    };
    verify.addEventListener('click', doVerify);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });
    back.addEventListener('click', () => { renderForm(); });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 50);
  }

  renderForm();
}

export function start() {
  applyI18n(document);
  const els = {
    root: document.getElementById('cdx-entrar'),
    form: document.getElementById('cdx-entrar-form'),
    input: document.getElementById('cdx-entrar-input'),
    btn: document.getElementById('cdx-entrar-btn'),
    error: document.getElementById('cdx-entrar-error'),
    state: document.getElementById('cdx-entrar-state'),
    cont: document.getElementById('cdx-entrar-cont'),
    or: document.getElementById('cdx-entrar-or'),
    email: document.getElementById('cdx-entrar-email'),
  };
  if (!els.form) return;
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = String(els.input.value || '').trim();
    if (!/^[0-9]{4}$/.test(code)) { els.error.textContent = t('entrar.invalid'); return; }
    resolveAndGo(code, els);
  });
  // Continuar: the last class this device used (the most-recent-first registry).
  const known = getKnownTurmas();
  renderContinue(els.cont, els.or, known.length ? known[0] : null);
  // e-mail path (OTP).
  startEmail(els.email, els.root);
  // código link path: auto-resolve when the URL carried a 4-digit code.
  const code = readCode(location.search, location.pathname);
  if (code) { els.input.value = code; resolveAndGo(code, els); }
}
