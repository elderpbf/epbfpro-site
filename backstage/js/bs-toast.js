'use strict';

// Backstage shared toast notification.
// Mount-free: call BSToast.show(message[, duration_ms]).
// CSS rule `.bs-toast` (+ `.bs-toast.show` toggle) is the pre-existing
// Site/backstage/css/shared-components.css rule that started with
// utils.js's showToast(); BSToast.show() follows the same enter/exit
// pattern so the CSS stays one canonical block.
window.BSToast = (function() {

  function show(msg, duration) {
    var el = document.createElement('div');
    el.className = 'bs-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { el.classList.add('show'); }, 10);
    var dwell = duration || 2500;
    setTimeout(function() {
      el.classList.remove('show');
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, dwell);
  }

  return { show: show };

})();
