'use strict';
// Shared QR share modal, used by the live page (host.html) and the projector
// display page (go/display.html). Theme-aware card (light/dark via CSS vars),
// big centered title, centered QR. No URL or code displayed. When no joinUrl
// is provided, the modal opens with a notice instead of silently failing.
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
        '<button class="qr-share-modal-close" type="button" aria-label="Fechar">&times;</button>' +
        '<div class="qr-share-modal-title"></div>' +
        '<img class="qr-share-modal-img" alt="QR Code">' +
        '<div class="qr-share-modal-notice" hidden></div>' +
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
    var r = _ensure();
    r.querySelector('.qr-share-modal-title').textContent = opts.title || 'Sua trilha de aprendizado';
    var img = r.querySelector('.qr-share-modal-img');
    var notice = r.querySelector('.qr-share-modal-notice');
    var url = opts.joinUrl;
    if (url) {
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=2&data=' + encodeURIComponent(url);
      img.hidden = false;
      notice.hidden = true;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      notice.textContent = opts.message || 'Nenhuma turma vinculada à sessão. Vincule uma turma no painel ao vivo para gerar o QR da trilha.';
      notice.hidden = false;
    }
    r.hidden = false;
  }

  function close() {
    if (_root) _root.hidden = true;
  }

  return { open: open, close: close };
})();
