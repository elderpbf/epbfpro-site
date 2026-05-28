'use strict';

// CVLabViewer — fullscreen modal that iframes a lab page.
// API: CVLabViewer.openModal({ key, title }) and CVLabViewer.close().
// Self-contained: injects its CSS on first open; no external stylesheet.
// Used by Conteúdo > Labs subtab (preview button) and can be reused from
// the Aula labs section or trilha lab cards later.
window.CVLabViewer = (function () {

  let _overlay = null;
  let _onKey = null;
  let _stylesInjected = false;

  function _injectStylesOnce() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const css =
      '.cv-lab-viewer-overlay{' +
        'position:fixed;inset:0;background:rgba(0,0,0,0.85);' +
        'z-index:9500;display:flex;align-items:stretch;justify-content:stretch;' +
        'animation:cvLabFadeIn 180ms ease-out;' +
      '}' +
      '@keyframes cvLabFadeIn{from{opacity:0}to{opacity:1}}' +
      '.cv-lab-viewer-frame{' +
        'position:relative;flex:1;display:flex;flex-direction:column;' +
        'background:#0a0e1a;' +
      '}' +
      '.cv-lab-viewer-iframe{' +
        'flex:1;width:100%;height:100%;border:0;display:block;' +
      '}' +
      '.cv-lab-viewer-close{' +
        'position:absolute;top:0.75rem;right:0.75rem;width:40px;height:40px;' +
        'border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;border:0;' +
        'cursor:pointer;font-size:22px;line-height:1;display:flex;' +
        'align-items:center;justify-content:center;z-index:2;' +
        'transition:background 160ms,transform 120ms;' +
      '}' +
      '.cv-lab-viewer-close:hover{background:rgba(0,0,0,0.9);transform:scale(1.05);}';
    const style = document.createElement('style');
    style.setAttribute('data-cv-lab-viewer', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function close() {
    if (!_overlay) return;
    if (_onKey) {
      document.removeEventListener('keydown', _onKey);
      _onKey = null;
    }
    _overlay.remove();
    _overlay = null;
    document.body.classList.remove('cv-lab-viewer-open');
  }

  function openModal(opts) {
    opts = opts || {};
    const key = opts.key || '';
    if (!key) return;
    if (_overlay) close();

    _injectStylesOnce();

    _overlay = document.createElement('div');
    _overlay.className = 'cv-lab-viewer-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', opts.title || 'Lab');

    const frame = document.createElement('div');
    frame.className = 'cv-lab-viewer-frame';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cv-lab-viewer-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', close);

    const iframe = document.createElement('iframe');
    iframe.className = 'cv-lab-viewer-iframe';
    iframe.setAttribute('title', opts.title || ('Lab ' + key));
    iframe.setAttribute(
      'allow',
      'autoplay; encrypted-media; clipboard-write; fullscreen'
    );
    iframe.src = '/backstage/labs/' + encodeURIComponent(key) + '/';

    frame.appendChild(closeBtn);
    frame.appendChild(iframe);
    _overlay.appendChild(frame);

    _overlay.addEventListener('click', function (e) {
      if (e.target === _overlay) close();
    });

    _onKey = function (e) {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', _onKey);

    document.body.appendChild(_overlay);
    document.body.classList.add('cv-lab-viewer-open');
  }

  return { openModal: openModal, close: close };
})();
