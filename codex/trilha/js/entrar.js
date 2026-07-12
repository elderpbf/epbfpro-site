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
import { validateEmail } from './student-login.js';
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

// The e-mail -> magic-link flow, rendered inline into the e-mail card (track-36: the OTP code is
// retired on the landing; the e-mail now gets the same 15-min validation LINK the wall sends).
// Turma-agnostic: the worker resolves the address's most-recent turma and we request the link for
// it. This device polls its poll_token, so a click (here OR on the phone) advances this tab into
// the turma; the turma page decides access (content / "Acesso em análise" / blocked).
function startEmail(emailEl, root) {
  if (!emailEl) return;
  let pollTimer = null;
  const clearPoll = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };
  // The wall's locked cadence: 2s for the first ~6 calls, then 4/6/10/15s, capped ~30 (~5min).
  const POLL_CADENCE = [2000, 2000, 2000, 2000, 2000, 2000, 4000, 6000, 10000, 15000];
  const POLL_MAX = 30;

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
      // e-mail-only fast path: a SIMPLE turma logs in here (no link) and we go straight in.
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
      // Enrolled (non-simple): send the 15-min validation LINK for the resolved turma.
      const tt = entry.turma;
      let res;
      try { res = await trail.authRequest({ client_slug: tt.client_slug, turma_slug: tt.turma_slug, email, k: tt.token, origin: (typeof location !== 'undefined') ? location.origin : undefined }); }
      catch (e) { res = (e && e.data && typeof e.data === 'object') ? e.data : { error: 'error' }; }
      if (res && res.ok) { renderMagicSent(email, tt, res.poll_token, res.dev_magic_token); return; }
      err.textContent = entryErrorText(res && res.error);
      send.disabled = false;
      send.textContent = t('login.enroll_cta');
    };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
  }

  // Link sent: "confira seu e-mail". This device polls its poll_token, so a click (here or on
  // another device) advances this tab into the turma; "Já validei" re-checks NOW. A dev link shows
  // on staging (no e-mail provider), exactly like the wall.
  function renderMagicSent(email, turma, pollToken, devToken) {
    if (root) root.classList.add('cdx-entrar-step-code'); // hide the código card; focus the e-mail step
    const dev = devToken
      ? '<p class="cdx-entrar-dev"><strong>' + esc(t('login.dev_link')) + '</strong> <a href="/trilha/' + esc(turma.client_slug) + '/' + esc(turma.turma_slug) + '?lt=' + esc(devToken) + '&k=' + esc(turma.token || '') + '">abrir link</a></p>'
      : '';
    emailEl.innerHTML =
      '<div class="cdx-entrar-wait-ic" aria-hidden="true">' + glyphSvg('mail', { size: 34 }) + '</div>' +
      '<h2 class="cdx-entrar-card-h">' + esc(t('wall.check_email_h')) + '</h2>' +
      '<p class="cdx-entrar-card-p">' + esc(t('wall.check_email_sub')).replace('{email}', esc(email || '')) + '</p>' +
      dev +
      '<button class="cdx-entrar-btn cdx-btn cdx-btn-primary cdx-entrar-already" type="button">' + esc(t('wall.already_validated')) + '</button>' +
      '<button class="cdx-entrar-link cdx-entrar-back" type="button">' + esc(t('entrar.other_email')) + '</button>';
    const already = emailEl.querySelector('.cdx-entrar-already');
    const back = emailEl.querySelector('.cdx-entrar-back');

    const goToTurma = (sessionToken) => {
      clearPoll();
      if (sessionToken) setToken(turma.client_slug, turma.turma_slug, sessionToken);
      location.href = buildTurmaUrl({ client_slug: turma.client_slug, turma_slug: turma.turma_slug, k: turma.token });
    };
    // Ask the worker whether the link was clicked yet. 'waiting' = not clicked; anything else means
    // the e-mail is proven (a session was minted for THIS device) -> enter the turma.
    const checkOnce = async () => {
      if (!pollToken) return false;
      let res; try { res = await trail.authPoll({ poll_token: pollToken, _silent: true }); } catch (_) { res = null; }
      if (res && res.ok && res.status && res.status !== 'waiting') { goToTurma(res.session_token); return true; }
      return false;
    };
    if (pollToken) {
      let i = 0;
      const tick = async () => {
        if (i >= POLL_MAX) return;
        if (await checkOnce()) return;
        i += 1;
        pollTimer = setTimeout(tick, POLL_CADENCE[Math.min(i, POLL_CADENCE.length - 1)]);
      };
      pollTimer = setTimeout(tick, POLL_CADENCE[0]);
    }
    already.addEventListener('click', async () => {
      already.disabled = true; already.textContent = t('login.sending');
      const done = await checkOnce();
      if (!done) { already.disabled = false; already.textContent = t('wall.already_validated'); }
    });
    back.addEventListener('click', () => { renderForm(); });
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
  // e-mail path (OTP).
  startEmail(els.email, els.root);
  // código link path: auto-resolve when the URL carried a 4-digit code.
  const code = readCode(location.search, location.pathname);
  if (code) { els.input.value = code; resolveAndGo(code, els); return; }
  // localStorage-first: a valid device session enters its turma directly (no banner/hub).
  autoEnter(els);
}
