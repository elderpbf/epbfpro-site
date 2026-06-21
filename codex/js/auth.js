'use strict';
window.BS_AUTH = (function() {
  var PW_KEY   = 'bs_pw_hash';
  var AUTH_KEY = 'bs_auth';
  var TOKEN    = localStorage.getItem(PW_KEY) || '';

  // Returns 'google' if signed in via Google, 'password' if via bs_pw_hash, null if not authed.
  function getMethod() {
    if (window.BS_GOOGLE && window.BS_GOOGLE.isAuthed()) return 'google';
    if (localStorage.getItem(PW_KEY)) return 'password';
    return null;
  }

  // Synchronous check with no BS_GOOGLE dependency. Reads localStorage directly.
  // Use on pages that need a display gate but don't load bs-google.js.
  function isAuthedLocal() {
    try {
      var raw = localStorage.getItem('bs_google_token_v1');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.token && p.expiresAt && Date.now() < p.expiresAt) return true;
      }
    } catch (_) {}
    return !!localStorage.getItem(PW_KEY);
  }

  // Gate for all Backstage tools. Redirects to login if neither path is authed.
  // Google is checked first; password hash is the fallback. Bundle L Item 3:
  // before redirecting, capture the current URL (path + query + hash) into
  // sessionStorage so the login page can return the user to where they were.
  function guard() {
    var googleOk = window.BS_GOOGLE && window.BS_GOOGLE.isAuthed();
    var passwordOk = !!localStorage.getItem(PW_KEY);
    if (!googleOk && !passwordOk) {
      try {
        var here = location.pathname + location.search + location.hash;
        if (here && here !== '/backstage/' && here !== '/backstage') {
          sessionStorage.setItem('bs_auth_return', here);
        }
      } catch (_) {}
      location.replace('/backstage/');
      return;
    }
    if (sessionStorage.getItem(AUTH_KEY) !== '1') {
      sessionStorage.setItem(AUTH_KEY, '1');
    }
  }

  // Sign out from both Google and password paths. Bundle L L.1: set a
  // sessionStorage flag the login page reads to skip its silent-refresh
  // attempt once (otherwise GIS sometimes flashes a popup after revoke).
  // Also clear the per-tab active-session marker so the Live sub-tab does
  // not linger across sign-in cycles.
  function signOut() {
    if (window.BS_GOOGLE) {
      try { window.BS_GOOGLE.signOut(); } catch (_) {}
    }
    localStorage.removeItem(PW_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    try { sessionStorage.removeItem('cp_active_session_code'); } catch (_) {}
    try { sessionStorage.setItem('bs_just_signed_out', '1'); } catch (_) {}
    location.replace('/backstage/');
  }

  // Legacy alias kept for callers that still call BS_AUTH.logout().
  function logout() {
    signOut();
  }

  function clearPasswordInputs() {
    document.querySelectorAll('input[type="password"]').forEach(function(el) { el.value = ''; });
  }

  return {
    PW_KEY: PW_KEY,
    AUTH_KEY: AUTH_KEY,
    TOKEN: TOKEN,
    getMethod: getMethod,
    isAuthedLocal: isAuthedLocal,
    guard: guard,
    signOut: signOut,
    logout: logout,
    clearPasswordInputs: clearPasswordInputs
  };
})();
