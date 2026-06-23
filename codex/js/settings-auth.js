// codex/js/settings-auth.js
// The AUTH component injected into the Settings drawer. This is where the auth
// coupling lives so the drawer shell (js/settings-drawer.js) carries none: the
// shell owns the drawer, this owns the auth sections. Each factory returns a
// drawer section descriptor { id, title, content, onInit?, onOpen? } the consumer
// (codex-topbar) hands to settings-drawer.init() alongside any other section.
//
//   googleSection()   - "Conta Google": connect / disconnect via window.BS_GOOGLE.
//   passwordSection() - "Segurança": change the password-hash fallback via
//                       callWorker('change_password') + the local hashPw + BS_AUTH.
//
// Auth globals (window in the browser; stubbed on globalThis in tests):
//   callWorker (api-client / worker-call), BS_AUTH (auth.js), BS_GOOGLE.
// hashPw is Codex-owned (below), no longer the backstage utils.js global.
import { t } from './i18n.js';

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// SHA-256 hex of a password, the bs_pw_hash fallback contract. Vendored from the
// legacy utils.js (its only on-Codex caller was this password-change form; the
// login page hashes on its own page). Exported for tests.
export async function hashPw(pw) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ── Google account ───────────────────────────────────────────────────────────
function _googleSectionHtml() {
  return (
    '<div id="sd-google-state" style="margin-bottom:.6rem;font-size:.92rem"></div>' +
    '<button class="bs-toggle-btn" id="sd-google-action" style="margin-bottom:.5rem"></button>' +
    '<p class="bs-hint">' + t('settings.google_hint') + '</p>'
  );
}

function _renderGoogleSection() {
  var stateEl = document.getElementById('sd-google-state');
  var btn = document.getElementById('sd-google-action');
  if (!stateEl || !btn) return;
  var bs = globalThis.BS_GOOGLE;
  var authed = !!(bs && bs.isAuthed && bs.isAuthed());
  if (authed) {
    var email = (bs.getEmail && bs.getEmail()) || '';
    stateEl.innerHTML = '<strong style="color:var(--primary)">' + t('settings.google_connected') + '</strong>' +
      (email ? '<br><span style="color:var(--text-secondary);font-size:.85rem">' + _esc(email) + '</span>' : '');
    btn.textContent = t('settings.google_disconnect');
  } else {
    stateEl.innerHTML = '<span style="color:var(--text-secondary)">' + t('settings.google_disconnected') + '</span>';
    btn.textContent = t('settings.google_connect');
  }
}

function _initGoogleSection() {
  var btn = document.getElementById('sd-google-action');
  if (!btn) return;
  _renderGoogleSection();
  btn.addEventListener('click', async function () {
    var bs = globalThis.BS_GOOGLE;
    if (!bs) return;
    if (bs.isAuthed && bs.isAuthed()) {
      try { bs.signOut(); } catch (_) {}
      _renderGoogleSection();
      return;
    }
    btn.disabled = true;
    try {
      await bs.requestToken({ prompt: 'consent' });
      if (typeof bs.init === 'function') bs.init();
    } catch (_) { /* render below reflects final state */ }
    btn.disabled = false;
    _renderGoogleSection();
  });
}

export function googleSection() {
  return {
    id: 'sd-google',
    title: t('settings.google_title'),
    content: _googleSectionHtml(),
    onInit: _initGoogleSection,
    // Re-render each time the drawer opens so it reflects any state change
    // (e.g. the user just connected via an inline Drive prompt).
    onOpen: _renderGoogleSection,
  };
}

// ── Password change ──────────────────────────────────────────────────────────
function _pwSectionHtml() {
  return (
    '<button class="bs-toggle-btn" id="sd-show-pw-form">' + t('settings.pw_change') + '</button>' +
    '<div id="sd-pw-form" hidden>' +
      '<div class="bs-field" style="margin-top:1rem">' +
        '<label>' + t('settings.pw_current') + '</label>' +
        '<input id="sd-pw-current" type="password" autocomplete="off">' +
      '</div>' +
      '<div class="bs-field">' +
        '<label>' + t('settings.pw_new') + '</label>' +
        '<input id="sd-pw-new" type="password" autocomplete="off">' +
      '</div>' +
      '<div class="bs-field">' +
        '<label>' + t('settings.pw_confirm') + '</label>' +
        '<input id="sd-pw-confirm" type="password" autocomplete="off">' +
      '</div>' +
      '<p class="bs-form-error" id="sd-pw-error"></p>' +
      '<button class="bs-save-btn" id="sd-pw-save">' + t('settings.pw_update') + '</button>' +
    '</div>'
  );
}

function _initPwChange() {
  var showBtn = document.getElementById('sd-show-pw-form');
  if (!showBtn) return;

  showBtn.addEventListener('click', function () {
    var form = document.getElementById('sd-pw-form');
    form.hidden = !form.hidden;
    if (!form.hidden) document.getElementById('sd-pw-current').focus();
  });

  document.getElementById('sd-pw-save').addEventListener('click', async function () {
    var btn     = this;
    var cur     = document.getElementById('sd-pw-current').value;
    var newPw   = document.getElementById('sd-pw-new').value;
    var confirm = document.getElementById('sd-pw-confirm').value;
    var err     = document.getElementById('sd-pw-error');
    err.textContent = '';
    err.style.color = '';

    if (newPw.length < 6) { err.textContent = t('settings.pw_min'); return; }
    if (newPw !== confirm) { err.textContent = t('settings.pw_mismatch'); return; }

    btn.disabled = true;
    try {
      var curHash = await hashPw(cur);
      var newHash = await hashPw(newPw);
      await globalThis.callWorker({ action: 'change_password', auth_token: curHash, new_hash: newHash });
      localStorage.setItem(globalThis.BS_AUTH ? globalThis.BS_AUTH.PW_KEY : 'bs_pw_hash', newHash);
      document.getElementById('sd-pw-current').value = '';
      document.getElementById('sd-pw-new').value = '';
      document.getElementById('sd-pw-confirm').value = '';
      err.style.color = 'var(--primary)';
      err.textContent = t('settings.pw_success');
      setTimeout(function () {
        err.textContent = '';
        err.style.color = '';
        document.getElementById('sd-pw-form').hidden = true;
      }, 2500);
    } catch (e) {
      err.textContent = t('settings.pw_wrong');
    } finally {
      btn.disabled = false;
    }
  });
}

export function passwordSection() {
  return {
    id: 'sd-security',
    title: t('settings.security_title'),
    content: _pwSectionHtml(),
    onInit: _initPwChange,
  };
}
