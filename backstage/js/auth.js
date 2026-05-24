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

  // Sign out from both Google and password paths.
  function signOut() {
    if (window.BS_GOOGLE) {
      try { window.BS_GOOGLE.signOut(); } catch (_) {}
    }
    localStorage.removeItem(PW_KEY);
    sessionStorage.removeItem(AUTH_KEY);
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
    guard: guard,
    signOut: signOut,
    logout: logout,
    clearPasswordInputs: clearPasswordInputs
  };
})();
