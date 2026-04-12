'use strict';
window.BS_AUTH = (function() {
  var PW_KEY   = 'bs_pw_hash';
  var AUTH_KEY = 'bs_auth';
  var TOKEN    = localStorage.getItem(PW_KEY) || '';
  function guard() {
    if (!localStorage.getItem(PW_KEY)) { location.replace('/backstage/'); return; }
    if (sessionStorage.getItem(AUTH_KEY) !== '1') { sessionStorage.setItem(AUTH_KEY, '1'); }
  }
  function logout() {
    localStorage.removeItem(PW_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    location.replace('/backstage/');
  }
  function clearPasswordInputs() {
    document.querySelectorAll('input[type="password"]').forEach(function(el) { el.value = ''; });
  }
  return { PW_KEY: PW_KEY, AUTH_KEY: AUTH_KEY, TOKEN: TOKEN, guard: guard, logout: logout, clearPasswordInputs: clearPasswordInputs };
})();
