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
import { createLoginFlow, validateEmail } from './student-login.js';
import { getKnownTurmas, getToken, setToken, forgetTurma } from './student-session.js';
import { mountEntry } from './support-contact.js';
import { glyphSvg } from '../../js/glyphs.js';

function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
      const kv = pair.split(':');
      if (kv.length === 2) el.setAttribute(kv[0].trim(), t(kv[1].trim()));
    });
  });
}

// The code arrives as ?code=XXXX or as the path segment /trilha/XXXX (the rewrite keeps the
// visible path). Pull the 4-char code from either: a 4-digit number (the new turma code) OR
// a legacy letter code like TVKV. The path branch takes the LAST segment and requires
// exactly 4 chars, so route words (/trilha/entrar) and longer slugs never read as a code.
export function readCode(search, pathname) {
  const isCode = (s) => /^[A-Za-z0-9]{4}$/.test(s);
  try {
    const q = new URLSearchParams(search || '').get('code');
    if (q && isCode(q.trim())) return q.trim();
  } catch (_) { /* fall through to the path */ }
  const seg = String(pathname || '').split('/').filter(Boolean).pop() || '';
  return isCode(seg) ? seg : '';
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
  try { res = await trail.resolveCode({ code }); } catch (_) { res = null; }
  if (res && res.found) {
    // The code is the turma's permanent URL in its own right: land ON it (/trilha/<code>) and
    // let the student page resolve it in place. We resolve here only to validate + show an
    // inline "not found" before navigating. The page re-resolves and picks up any open et.
    location.replace(location.origin + '/trilha/' + encodeURIComponent(code));
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
    // Do NOT prune the token on a failed check (Élder): a network blip throws and is
    // indistinguishable from a truly-dead session here, and deleting on a blip strands a
    // still-logged-in student on the registration screen (the bug a student hit). The token
    // is turma-specific and self-expires, so a dead one is harmless and just fails again;
    // only an explicit "sair" clears it. Fall through to the código + e-mail entry below.
  }
  if (els.state) els.state.textContent = ''; // none valid -> reveal the código + e-mail entry
  if (els.paths) els.paths.hidden = false;
}

// The e-mail entry, driven by the SAME shared login flow the wall uses (createLoginFlow /
// student-login.js) so the two login surfaces behave IDENTICALLY (track-36: converge on one
// module, Élder). Turma-agnostic: the worker resolves the address's most-recent turma (a SIMPLE
// turma logs in on the spot); for any other enrolled turma we bind the flow and run the OTP code
// path (Élder 2026-07-14: /trilha is an active login at the form, so it is ALWAYS the code, never
// the link), landing on the code screen -> pendingApproval ("aguardando aprovação") -> authenticated.
function startEmail(emailEl, root) {
  if (!emailEl) return;
  let flow = null;       // the SHARED login flow, bound to the resolved turma
  let turmaRef = null;   // { client_slug, turma_slug, token } — the resolved turma, for the launch URL
  let pollTimer = null;
  const clearPoll = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };
  // The wall's locked cadence: 2s for the first ~6 calls, then 4/6/10/15s, capped ~30 (~5min).
  const POLL_CADENCE = [2000, 2000, 2000, 2000, 2000, 2000, 4000, 6000, 10000, 15000];
  const POLL_MAX = 30;

  const goToTurma = () => {
    clearPoll();
    location.href = buildTurmaUrl({ client_slug: turmaRef.client_slug, turma_slug: turmaRef.turma_slug, k: turmaRef.token });
  };

  // Route the flow state to its view — the SAME state machine as the wall's settle().
  function settle() {
    if (flow.state === 'authenticated') { goToTurma(); return; }
    if (flow.state === 'validating') { renderMagicSent(); startPoll('validation'); return; }
    if (flow.state === 'pendingApproval') { renderPending(); startPoll('approval'); return; }
    if (flow.state === 'code') { renderCodeStep(); return; } // 'code' turma: type the emailed OTP
    renderForm(); // needName can't happen for an enrolled e-mail; fall back to the form
  }

  function renderForm() {
    clearPoll();
    if (root) root.classList.remove('cdx-entrar-step-code');
    emailEl.innerHTML =
      '<h2 class="cdx-entrar-card-h">' + esc(t('entrar.email_h')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('entrar.email_lead')) + '</p>' +
      '<div class="cdx-entrar-error cdx-entrar-email-error" aria-live="polite"></div>' +
      '<input class="cdx-entrar-field cdx-entrar-email-input" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(t('login.email_placeholder')) + '" aria-label="' + esc(t('login.email_label')) + '">' +
      '<button class="cdx-entrar-btn cdx-btn cdx-btn-primary cdx-entrar-email-send" type="button">' + esc(t('login.enroll_cta')) + '</button>';
    const input = emailEl.querySelector('.cdx-entrar-email-input');
    const send = emailEl.querySelector('.cdx-entrar-email-send');
    const err = emailEl.querySelector('.cdx-entrar-email-error');
    const doSend = async () => {
      err.textContent = '';
      const email = validateEmail(input.value);
      if (!email) { err.textContent = t('login.email_invalid'); return; }
      send.disabled = true;
      send.textContent = t('login.sending');
      // Resolve the address's turma: a SIMPLE turma logs in here (no link) and we go straight in.
      let entry;
      try { entry = await trail.emailEntry({ email }); }
      catch (e) { entry = (e && e.data && typeof e.data === 'object') ? e.data : { error: 'error' }; }
      if (entry && entry.ok && entry.simple && entry.turma && entry.turma.session_token) {
        const tt = entry.turma;
        setToken(tt.client_slug, tt.turma_slug, tt.session_token);
        location.href = buildTurmaUrl({ client_slug: tt.client_slug, turma_slug: tt.turma_slug, k: tt.token });
        return;
      }
      // Not enrolled, or a hard error: surface it and stop (no link for an unknown e-mail).
      if (!entry || (!entry.ok && entry.error) || !entry.turma) {
        err.textContent = entryErrorText((entry && entry.error) || 'error');
        send.disabled = false; send.textContent = t('login.enroll_cta'); return;
      }
      // Enrolled: bind the SHARED flow to this turma and run the OTP code path (same module as the
      // wall). A code is e-mailed, the student types it back here (same tab), and verifying it cements
      // the e-mail. The magic link is reserved for the in-window take-home, not this active login.
      turmaRef = entry.turma;
      flow = createLoginFlow({ client: turmaRef.client_slug, turma: turmaRef.turma_slug, k: turmaRef.token, origin: (typeof location !== 'undefined') ? location.origin : undefined });
      await flow.requestCode(email);
      if (flow.state === 'email' && flow.error) { err.textContent = entryErrorText(flow.error, flow.retryAfter); send.disabled = false; send.textContent = t('login.enroll_cta'); return; }
      settle();
    };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
  }

  // Link sent: "confira seu e-mail" (envelope glyph, no emoji). The flow polls its poll_token, so a
  // click (here OR on the phone) advances the state; "Já validei" re-checks NOW. Dev link on staging.
  function renderMagicSent() {
    if (root) root.classList.add('cdx-entrar-step-code'); // hide the código card; focus the e-mail step
    const dev = flow.devMagicToken
      ? '<p class="cdx-entrar-dev"><strong>' + esc(t('login.dev_link')) + '</strong> <a href="/trilha/' + esc(turmaRef.client_slug) + '/' + esc(turmaRef.turma_slug) + '?lt=' + esc(flow.devMagicToken) + '&k=' + esc(turmaRef.token || '') + '">abrir link</a></p>'
      : '';
    emailEl.innerHTML =
      '<div class="cdx-entrar-wait-ic" aria-hidden="true">' + glyphSvg('mail', { size: 34 }) + '</div>' +
      '<h2 class="cdx-entrar-card-h">' + esc(t('wall.check_email_h')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('wall.check_email_sub')).replace('{email}', esc(flow.email || '')) + '</p>' +
      dev +
      '<button class="cdx-entrar-btn cdx-btn cdx-btn-primary cdx-entrar-already" type="button">' + esc(t('wall.already_validated')) + '</button>' +
      '<button class="cdx-entrar-link cdx-entrar-back" type="button">' + esc(t('entrar.other_email')) + '</button>';
    emailEl.querySelector('.cdx-entrar-already').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = t('login.sending');
      await flow.pollValidation();
      b.disabled = false; b.textContent = t('wall.already_validated');
      settle();
    });
    emailEl.querySelector('.cdx-entrar-back').addEventListener('click', () => { renderForm(); });
  }

  // 'code' turma: the student types the 4-letter OTP the worker e-mailed. verifyCode exchanges
  // (email, code) for the session, then settle() enters the turma (or shows pending approval).
  function renderCodeStep() {
    if (root) root.classList.add('cdx-entrar-step-code'); // hide the código card; focus the e-mail step
    const dev = flow.devCode
      ? '<p class="cdx-entrar-dev"><strong>' + esc(t('login.dev_link')) + '</strong> ' + esc(flow.devCode) + '</p>'
      : '';
    emailEl.innerHTML =
      '<div class="cdx-entrar-wait-ic" aria-hidden="true">' + glyphSvg('mail', { size: 34 }) + '</div>' +
      '<h2 class="cdx-entrar-card-h">' + esc(t('login.code_title')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('login.code_desc')) + '</p>' +
      '<input class="cdx-entrar-field cdx-entrar-code-input" type="text" inputmode="text" autocomplete="one-time-code" maxlength="4" placeholder="' + esc(t('login.code_ph')) + '" aria-label="' + esc(t('login.code_label')) + '">' +
      dev +
      '<div class="cdx-entrar-error cdx-entrar-code-error" aria-live="polite">' + esc(flow.codeStillValid ? t('login.code_still_valid') : entryErrorText(flow.error, flow.retryAfter)) + '</div>' +
      '<button class="cdx-entrar-btn cdx-btn cdx-btn-primary cdx-entrar-verify" type="button">' + esc(t('login.enroll_cta')) + '</button>' +
      '<button class="cdx-entrar-link cdx-entrar-back" type="button">' + esc(t('entrar.other_email')) + '</button>';
    const input = emailEl.querySelector('.cdx-entrar-code-input');
    const verify = emailEl.querySelector('.cdx-entrar-verify');
    const err = emailEl.querySelector('.cdx-entrar-code-error');
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 50);
    const doVerify = async () => {
      err.textContent = '';
      verify.disabled = true; verify.textContent = t('login.sending');
      await flow.verifyCode(input.value);
      if (flow.state === 'code' && flow.error) { err.textContent = entryErrorText(flow.error, flow.retryAfter); verify.disabled = false; verify.textContent = t('login.enroll_cta'); return; }
      settle();
    };
    verify.addEventListener('click', doVerify);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });
    emailEl.querySelector('.cdx-entrar-back').addEventListener('click', () => { renderForm(); });
  }

  // Validated but awaiting the instructor's approval — the SAME "aguardando aprovação" state the
  // wall shows (login.pending_*). The approval poll unlocks it, then we enter the turma.
  function renderPending() {
    if (root) root.classList.add('cdx-entrar-step-code');
    emailEl.innerHTML =
      '<div class="cdx-entrar-wait-ic" aria-hidden="true">' + glyphSvg('clock', { size: 34 }) + '</div>' +
      '<h2 class="cdx-entrar-card-h">' + esc(t('login.pending_title')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('login.pending_body')) + '</p>';
  }

  // Drive the locked cadence for whichever poll the state calls for (mirrors the wall's startPoll).
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

  renderForm();
}

export function start() {
  applyI18n(document);
  mountEntry(document.getElementById('cdx-entrar-support'), {}, 'login');
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
  // e-mail path (magic link by default, or a 4-letter OTP code when the turma's method is 'code').
  startEmail(els.email, els.root);
  // código link path: auto-resolve when the URL carried a 4-digit code.
  const code = readCode(location.search, location.pathname);
  if (code) { els.input.value = code; resolveAndGo(code, els); return; }
  // localStorage-first: a valid device session enters its turma directly (no banner/hub).
  autoEnter(els);
}
