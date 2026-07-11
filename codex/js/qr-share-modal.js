// codex/js/qr-share-modal.js
// Codex-owned QR share modal. ES-module port of the legacy window.QRShareModal
// (backstage/js/qr-share-modal.js): a theme-aware card (light/dark via CSS vars)
// with a big centered title and a centered QR, no URL or code shown. When no
// joinUrl is given it opens with a notice instead of silently failing. Styling:
// css/qr-share-modal.css. The legacy backstage global stays live for the
// un-ported ClassPulse/projector pages.
//
// Public API: open({ joinUrl, title?, message?, code? }), close().
// `code` (track-36 h) shows the turma's 4-digit access code big under the QR, so the
// dossier's QR view carries the SAME código the live session screen projects (scan OR type).
// Consumed by the admin live host (questions/live-host.js). The public Trail
// header (trilha/js/pensoia-header.js) deliberately does NOT import it, so its
// code button stays inert there (students don't generate a join QR).

let _root = null;

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
      '<div class="qr-share-modal-code" hidden></div>' +
      '<div class="qr-share-modal-notice" hidden></div>' +
    '</div>';
  document.body.appendChild(_root);
  _root.querySelector('.qr-share-modal-backdrop').addEventListener('click', close);
  _root.querySelector('.qr-share-modal-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !_root.hidden) close();
  });
  return _root;
}

export function open(opts) {
  opts = opts || {};
  var r = _ensure();
  r.querySelector('.qr-share-modal-title').textContent = opts.title || 'Sua trilha de aprendizado';
  var img = r.querySelector('.qr-share-modal-img');
  var notice = r.querySelector('.qr-share-modal-notice');
  var codeEl = r.querySelector('.qr-share-modal-code');
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
  // The código (track-36 h): shown big under the QR when provided, so the dossier view
  // matches the live session screen (scan the QR OR type the código). Hidden when absent.
  if (codeEl) {
    if (opts.code) { codeEl.textContent = String(opts.code); codeEl.hidden = false; }
    else { codeEl.textContent = ''; codeEl.hidden = true; }
  }
  r.hidden = false;
}

export function close() {
  if (_root) _root.hidden = true;
}
