'use strict';
// Shared big-QR modal used by the live page (host.html) and the projector
// display page (go/display.html). Fullscreen overlay, huge QR centered, one
// big title above. No URL text. Esc closes.
window.QRShareModal = (function() {
  var _root = null;

  function _ensure() {
    if (_root) return _root;
    _root = document.createElement('div');
    _root.className = 'qr-share-modal';
    _root.hidden = true;
    _root.innerHTML =
      '<div class="qr-share-modal-backdrop"></div>' +
      '<div class="qr-share-modal-card" role="dialog" aria-modal="true">' +
        '<button class="qr-share-modal-close" type="button" aria-label="Fechar">×</button>' +
        '<div class="qr-share-modal-title"></div>' +
        '<img class="qr-share-modal-img" alt="QR Code">' +
      '</div>';
    document.body.appendChild(_root);
    _root.querySelector('.qr-share-modal-backdrop').addEventListener('click', close);
    _root.querySelector('.qr-share-modal-close').addEventListener('click', close);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !_root.hidden) close();
    });
    return _root;
  }

  function open(opts) {
    opts = opts || {};
    var url = opts.joinUrl;
    if (!url) return;
    var r = _ensure();
    r.querySelector('.qr-share-modal-title').textContent = opts.title || 'Entre na trilha';
    var img = r.querySelector('.qr-share-modal-img');
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=900x900&margin=2&data=' + encodeURIComponent(url);
    r.hidden = false;
  }

  function close() {
    if (_root) _root.hidden = true;
  }

  return { open: open, close: close };
})();
