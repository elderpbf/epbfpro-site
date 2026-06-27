// codex/trilha/js/entrar.js
// The single student entry surface at /trilha (bare) and /trilha/<code>. The model
// (approved mock D): enter the LAST class this device used (the "Continuar" banner),
// with both ways in always open below — class código (4 digits) and e-mail (4-letter
// OTP). NO "minhas turmas" hub: switching between saved classes happens inside the
// trilha (the student area). When the student picks e-mail, the código card hides so
// the e-mailed code is unmistakable.
import { trail } from './api.js';
import { t } from '../i18n.js';
import { esc, cooldownButton } from './utils.js';
import { createLoginFlow, validateEmail } from './student-login.js';
import { getKnownTurmas, getToken, setToken, forgetTurma, clearToken } from './student-session.js';

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

// Inline OTP error code -> student-facing message.
function entryErrorText(code, retryAfter) {
  if (!code) return '';
  if (code === 'email_invalid') return t('login.email_invalid');
  if (code === 'email_not_enrolled') return t('entrar.no_turmas');
  if (code === 'rate_limited') {
    if (retryAfter && retryAfter > 0) return t('login.rate_limited_min').replace('{min}', String(Math.max(1, Math.ceil(retryAfter / 60))));
    return t('login.rate_limited');
  }
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

// Auto-enter (Élder, 2026-06-20): NO "Continuar" banner and NO turma list. Having more
// than one turma on a device is near-zero, so the entry never asks — it validates the
// device's most-recent session SERVER-SIDE and, if it still opens, goes straight into
// that turma. A revoked/dead session (e.g. a deleted turma) is pruned so it can never
// resurface, and the código + e-mail entry is shown instead. Switching between saved
// turmas lives inside the trilha (student settings), not here.
async function autoEnter(els) {
  const known = getKnownTurmas();
  // Drop registry rows with no session on this device (a name with no way in).
  known.forEach((e) => { if (!getToken(e.client_slug, e.turma_slug)) forgetTurma(e.client_slug, e.turma_slug); });
  const live = known.filter((e) => getToken(e.client_slug, e.turma_slug));
  if (!live.length) return; // not logged in: the código + e-mail entry (already rendered) stays
  if (els.paths) els.paths.hidden = true;
  if (els.state) els.state.textContent = t('entrar.entering');
  for (const entry of live) {
    let res;
    try { res = await trail.sessionCheck({ session_token: getToken(entry.client_slug, entry.turma_slug), _silent: true }); }
    catch (_) { res = null; }
    if (res && res.ok) { location.replace(buildTurmaUrl(entry)); return; } // logged in for real -> straight in
    clearToken(entry.client_slug, entry.turma_slug);   // revoked/dead -> prune the token and the registry row
    forgetTurma(entry.client_slug, entry.turma_slug);
  }
  if (els.state) els.state.textContent = ''; // none valid -> reveal the código + e-mail entry
  if (els.paths) els.paths.hidden = false;
}

// The e-mail -> OTP flow, rendered inline into the e-mail card. Turma-agnostic: the code
// proves the address, verify returns every turma it belongs to (all remembered on this
// device), then we enter the most relevant one — no hub.
function startEmail(emailEl, root) {
  if (!emailEl) return;
  const flow = createLoginFlow({}); // unbound -> verify lands on 'hub' with the turma list
  let cooldownUntil = 0;  // Date.now() ms when "Reenviar" frees up again (60s gate)
  const startCooldown = (s) => { cooldownUntil = Date.now() + Math.max(0, s) * 1000; };

  function renderForm() {
    if (root) root.classList.remove('cdx-entrar-step-code');
    emailEl.innerHTML =
      '<h2 class="cdx-entrar-card-h">' + esc(t('entrar.email_h')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('entrar.email_lead')) + '</p>' +
      '<div class="cdx-entrar-error cdx-entrar-email-error" aria-live="polite"></div>' +
      '<input class="cdx-entrar-field cdx-entrar-email-input" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(t('login.email_placeholder')) + '" aria-label="' + esc(t('login.email_label')) + '">' +
      '<button class="cdx-entrar-btn cdx-btn cdx-btn-primary cdx-entrar-email-send" type="button">' + esc(t('login.send_code')) + '</button>';
    const input = emailEl.querySelector('.cdx-entrar-email-input');
    const send = emailEl.querySelector('.cdx-entrar-email-send');
    const err = emailEl.querySelector('.cdx-entrar-email-error');
    const doSend = async () => {
      err.textContent = '';
      const email = validateEmail(input.value);
      if (!email) { err.textContent = t('login.email_invalid'); return; }
      send.disabled = true;
      send.textContent = t('login.sending');
      // 4a (Élder): e-mail-only fast path. If the address's most-recent turma is SIMPLE, the
      // worker logs the student in here (no código) and we go straight into the trilha.
      let entry;
      try { entry = await trail.emailEntry({ email }); }
      catch (e) { entry = (e && e.data && typeof e.data === 'object') ? e.data : { error: 'error' }; }
      if (entry && entry.ok && entry.simple && entry.turma && entry.turma.session_token) {
        const tt = entry.turma;
        setToken(tt.client_slug, tt.turma_slug, tt.session_token);
        location.href = buildTurmaUrl({ client_slug: tt.client_slug, turma_slug: tt.turma_slug, k: tt.token });
        return;
      }
      // Not enrolled, or a hard error: surface it and stop (no código for an unknown e-mail).
      if (!entry || (!entry.ok && entry.error)) {
        err.textContent = entryErrorText((entry && entry.error) || 'error');
        send.disabled = false; send.textContent = t('login.send_code'); return;
      }
      // Enrolled but NOT a simple turma: fall back to the normal OTP código flow.
      await flow.requestCode(email);
      if (flow.state === 'code') { if (!flow.codeStillValid) startCooldown(60); renderCode(); return; }
      err.textContent = entryErrorText(flow.error, flow.retryAfter);
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
      '<p class="cdx-entrar-card-p cdx-entrar-hint">' + esc(t('login.not_received')) + '</p>' +
      '<button class="cdx-entrar-btn cdx-btn cdx-btn-primary cdx-entrar-code-verify" type="button">' + esc(t('login.verify')) + '</button>' +
      '<button class="cdx-entrar-link cdx-entrar-resend" type="button">' + esc(t('login.resend')) + '</button>' +
      '<button class="cdx-entrar-link cdx-entrar-back" type="button">' + esc(t('entrar.other_email')) + '</button>';
    const input = emailEl.querySelector('.cdx-entrar-code-input');
    if (flow.devCode) input.value = flow.devCode;
    const verify = emailEl.querySelector('.cdx-entrar-code-verify');
    const back = emailEl.querySelector('.cdx-entrar-back');
    const resend = emailEl.querySelector('.cdx-entrar-resend');
    const err = emailEl.querySelector('.cdx-entrar-email-error');
    // Reused-code hint: re-entering the e-mail didn't fire a new code — the old one works.
    if (flow.codeStillValid) { err.classList.add('cdx-entrar-ok'); err.textContent = t('login.code_still_valid'); }
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
      err.textContent = entryErrorText(flow.error, flow.retryAfter);
      verify.disabled = false;
    };
    verify.addEventListener('click', doVerify);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });
    back.addEventListener('click', () => { renderForm(); });
    // Reenviar: re-request with the e-mail in the flow (no retype), gated to once a minute —
    // the button counts down ("Reenviar em 59s…") and resumes across re-renders.
    let cancelCd = cooldownButton(resend, Math.ceil((cooldownUntil - Date.now()) / 1000), t('login.resend'), t('login.resend_in'));
    resend.addEventListener('click', async () => {
      if (resend.disabled) return;
      err.classList.remove('cdx-entrar-ok'); err.textContent = '';
      await flow.requestCode(flow.email, { resend: true });
      if (flow.error) { err.textContent = entryErrorText(flow.error, flow.retryAfter); return; }
      cancelCd();
      const secs = flow.retryAfter || 60;
      if (!flow.retryAfter) { if (flow.devCode) input.value = flow.devCode; err.classList.add('cdx-entrar-ok'); err.textContent = t('login.resend_sent'); }
      startCooldown(secs);
      cancelCd = cooldownButton(resend, secs, t('login.resend'), t('login.resend_in'));
    });
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
    paths: document.getElementById('cdx-entrar-paths'),
    email: document.getElementById('cdx-entrar-email'),
  };
  if (!els.form) return;
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = String(els.input.value || '').trim();
    if (!/^[0-9]{4}$/.test(code)) { els.error.textContent = t('entrar.invalid'); return; }
    resolveAndGo(code, els);
  });
  // e-mail path (OTP).
  startEmail(els.email, els.root);
  // código link path: auto-resolve when the URL carried a 4-digit code.
  const code = readCode(location.search, location.pathname);
  if (code) { els.input.value = code; resolveAndGo(code, els); return; }
  // localStorage-first: a valid device session enters its turma directly (no banner/hub).
  autoEnter(els);
}
