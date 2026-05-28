'use strict';

// CVDriveViewer: shared Drive file rendering. Both ClassVault Aula (mounts
// inline in the main view) and the ClassTrail Drive sub-tab (opens a modal)
// use this so the URL contract and iframe attributes stay in one place.
//
//   CVDriveViewer.previewSrcFor(item) -> string
//     Returns the Drive preview URL for a ct_items row with type='drive_file'.
//     Slides honor their stored embed URL; everything else uses /file/d/<id>/preview.
//
//   CVDriveViewer.mountInContainer(item, container)
//     Replaces container contents with the preview iframe.
//
//   CVDriveViewer.openModal(item) -> { close() }
//     Creates a modal shell, mounts the preview iframe inside, returns a
//     handle the caller can close programmatically. Esc and backdrop click
//     also close.

(function (global) {
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _extractFileId(url) {
    const m = String(url || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : '';
  }

  function _isSlide(item) {
    const meta = (item && item.meta_json) || {};
    return meta.mimeType === 'application/vnd.google-apps.presentation';
  }

  function previewSrcFor(item) {
    const meta = (item && item.meta_json) || {};
    if (_isSlide(item) && meta.url) {
      return meta.url;
    }
    const id = meta.file_id || _extractFileId(meta.url);
    return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
  }

  // isSlide=true adds the slide-clip shell (oversize + overflow:hidden hides
  // Google's bottom control bar) so slide content is never cropped. EVERY Drive
  // embed gets the top-right corner mask, which covers Google's chrome there:
  // the Slides "Open in Slides" badge and, on /preview files, the "open in new
  // window" pop-out button. Styles live in classvault.css.
  function _buildIframeWrap(src, isSlide) {
    const wrap = document.createElement('div');
    wrap.className = isSlide ? 'cv-renderer-iframe-wrap cv-slides-clip' : 'cv-renderer-iframe-wrap';
    const iframe = document.createElement('iframe');
    iframe.className = 'cv-renderer-iframe';
    iframe.src = src;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; clipboard-write; fullscreen');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    wrap.appendChild(iframe);
    const mask = document.createElement('div');
    mask.className = 'cv-slides-corner-mask';
    mask.setAttribute('aria-hidden', 'true');
    wrap.appendChild(mask);
    return wrap;
  }

  function mountInContainer(item, container) {
    if (!container) return;
    const src = previewSrcFor(item);
    if (!src) {
      container.innerHTML = '<div class="cv-renderer-empty">Arquivo Drive sem file_id (ou URL inválida).</div>';
      return;
    }
    container.innerHTML = '';
    container.appendChild(_buildIframeWrap(src, _isSlide(item)));
  }

  function openModal(item) {
    const overlay = document.createElement('div');
    overlay.className = 'cv-drive-viewer-overlay';

    const modal = document.createElement('div');
    modal.className = 'cv-drive-viewer-modal';

    const header = document.createElement('div');
    header.className = 'cv-drive-viewer-header';
    const title = document.createElement('span');
    title.className = 'cv-drive-viewer-title';
    title.textContent = (item && item.title) || 'Arquivo';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cv-drive-viewer-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'cv-drive-viewer-body';

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    mountInContainer(item, body);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function onBackdrop(e) { if (e.target === overlay) close(); }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);

    return { close: close };
  }

  global.CVDriveViewer = {
    previewSrcFor:    previewSrcFor,
    mountInContainer: mountInContainer,
    openModal:        openModal
  };
}(window));
