'use strict';

// CPHost.Utils -- pure-ish helpers used by multiple modules. The alert/screen
// helpers touch the DOM (#alert-success, .host-screen) but are stateless;
// stripHtml is a pure string transform.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function showScreen(id) {
    document.querySelectorAll('.host-screen').forEach(function (el) {
      el.classList.toggle('active', el.id === id);
    });
  }

  function showAlert(type, msg) {
    if (type === 'error') {
      if (typeof showToastError === 'function') showToastError(msg);
      return;
    }
    var el = document.getElementById('alert-' + type);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }

  function clearAlert() {
    var el = document.getElementById('alert-success');
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  }

  function stripHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  CPHost.Utils = {
    showScreen: showScreen,
    showAlert: showAlert,
    clearAlert: clearAlert,
    stripHtml: stripHtml,
  };
})();
