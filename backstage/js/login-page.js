'use strict';

// Backstage login page boot. Bundle Q.
//
// Extracted from the inline <script> in backstage/index.html per AGENTS.md
// Rule 8. Owns the auth gate decision (skip-to-app vs show login), the
// password and Google sign-in handlers, and the safe return-URL redirect.
//
// Lazy Google policy (the Q change):
//   - init() does NOT call BS_GOOGLE.init() at boot. No silent token refresh.
//     Google is opt-in via the login button or the topbar G dot.
//   - Password auto-skip only requires localStorage.bs_pw_hash. The earlier
//     sessionStorage.bs_auth='1' co-requirement is dropped, so refreshing the
//     browser doesn't force a re-login when the hash is persisted.
//
// Depends on globals: BS_GOOGLE (optional), callWorker, hashPw, t.
// Consumers: backstage/index.html calls LoginPage.init() then LoginPage.bind().

(function () {
  var PW_KEY   = 'bs_pw_hash';
  var AUTH_KEY = 'bs_auth';

  function _showScreen(id) {
    var screens = ['screen-login', 'screen-app'];
    screens.forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.hidden = (s !== id);
    });
  }

  // Honor bs_auth_return when present, falling back to the dashboard. Same-
  // origin absolute paths only ('/foo' but not '//evil.com/foo'). Defense
  // against open-redirect via crafted sessionStorage entries.
  function _showApp() {
    try {
      var ret = sessionStorage.getItem('bs_auth_return');
      if (ret) {
        sessionStorage.removeItem('bs_auth_return');
        if (typeof ret === 'string' && ret.charAt(0) === '/' && ret.charAt(1) !== '/') {
          location.replace(ret);
          return;
        }
      }
    } catch (_) {}
    _showScreen('screen-app');
  }

  // Decides whether to show login or skip straight to app. Called once at
  // page boot. No GIS activity here; Google is opt-in.
  async function init() {
    if (window.BS_GOOGLE && window.BS_GOOGLE.isAuthed()) {
      _showApp();
      return;
    }
    if (localStorage.getItem(PW_KEY)) {
      try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (_) {}
      _showApp();
      return;
    }
    _showScreen('screen-login');
  }

  function _bindGoogleBtn() {
    var btn = document.getElementById('login-google-btn');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var err = document.getElementById('login-error');
      if (err) err.textContent = '';
      btn.disabled = true;
      try {
        if (window.BS_GOOGLE && typeof window.BS_GOOGLE.init === 'function') {
          await window.BS_GOOGLE.init();
        }
        await window.BS_GOOGLE.requestToken({ prompt: 'consent' });
        try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (_) {}
        _showApp();
      } catch (e) {
        var msg = e && e.message;
        if (err) {
          if (msg === 'gis_timeout') {
            err.textContent = 'Não foi possível carregar o login do Google. Verifique sua conexão.';
          } else if (msg === 'access_denied') {
            err.textContent = 'Acesso negado. Verifique se a conta está autorizada.';
          } else {
            err.textContent = 'Erro ao entrar com Google. Tente novamente.';
          }
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function _bindPwBtn() {
    var btn = document.getElementById('login-btn');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var pwEl = document.getElementById('login-pw');
      var err  = document.getElementById('login-error');
      var pw   = pwEl ? pwEl.value : '';
      if (err) err.textContent = '';
      btn.disabled = true;
      try {
        var hash   = await hashPw(pw);
        var result = await callWorker({ action: 'validate_auth', auth_token: hash });
        if (!result || !result.ok) {
          if (err) err.textContent = (typeof t === 'function') ? t('error_pw_wrong') : 'Senha incorreta.';
          if (pwEl) { pwEl.value = ''; pwEl.focus(); }
          return;
        }
        localStorage.setItem(PW_KEY, hash);
        try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (_) {}
        _showApp();
      } catch (e) {
        if (err) err.textContent = (typeof t === 'function') ? t('error_pw_wrong') : 'Senha incorreta.';
        if (pwEl) { pwEl.value = ''; pwEl.focus(); }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function _bindPwEnter() {
    var pwEl = document.getElementById('login-pw');
    if (!pwEl) return;
    pwEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var btn = document.getElementById('login-btn');
        if (btn) btn.click();
      }
    });
  }

  // Attach event handlers to the existing #login-* elements. Idempotent
  // re-binds are not handled here; call once per page load.
  function bind() {
    _bindGoogleBtn();
    _bindPwBtn();
    _bindPwEnter();
  }

  window.LoginPage = {
    init: init,
    bind: bind,
  };
})();
