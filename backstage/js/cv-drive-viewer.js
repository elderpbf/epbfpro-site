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

  // slidesEmbedUrl(urlOrId): canonical Google Slides embed contract for the
  // whole app. Returns the published /embed player URL (chrome-free except a
  // bottom playbar, which cv-slides-clip clips) for ANY Slides input — a raw
  // file id, a /presentation/d/<id>/* link, or a /presentation/d/e/<pubid>/*
  // published link. Already-embed forms pass through. Unknown input returns
  // as-is. This is what ClassForge effectively did; reuse it anywhere a Google
  // Slides needs to render without Google's chrome.
  function slidesEmbedUrl(urlOrId) {
    const s = String(urlOrId == null ? '' : urlOrId).trim();
    if (!s) return '';
    if (/\/(embed|pubembed)\b/.test(s)) return s;
    const pub = s.match(/\/presentation\/d\/e\/([a-zA-Z0-9_-]+)/);
    if (pub) return 'https://docs.google.com/presentation/d/e/' + pub[1] + '/embed?start=false&loop=false';
    const m = s.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/) ||
      (/^[a-zA-Z0-9_-]{20,}$/.test(s) ? [null, s] : null);
    if (m) return 'https://docs.google.com/presentation/d/' + m[1] + '/embed?start=false&loop=false';
    return s;
  }

  function previewSrcFor(item) {
    const meta = (item && item.meta_json) || {};
    // Presentations render through the chrome-free Slides /embed player (what
    // ClassForge used); the generic /file/d/<id>/preview viewer (used for
    // Docs/PDFs) carries Google's pop-out and is only for non-presentation files.
    if (_isSlide(item)) {
      const src = slidesEmbedUrl(meta.file_id || meta.url);
      if (src) return src;
    }
    const id = meta.file_id || _extractFileId(meta.url);
    return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
  }

  // isSlide=true uses the slide-clip shell (oversize + overflow:hidden) to clip
  // the Slides /embed bottom playbar. No corner mask: /embed has no top-right
  // pop-out, so there's nothing to cover (the old mask is what showed as a white
  // square). Non-slide Drive files (/preview) render plain; Google's pop-out
  // there auto-hides and the bottom-bar ↗ Janela is the clean open affordance.
  function _buildIframeWrap(src, isSlide) {
    const wrap = document.createElement('div');
    wrap.className = isSlide ? 'cv-renderer-iframe-wrap cv-slides-clip' : 'cv-renderer-iframe-wrap';
    const iframe = document.createElement('iframe');
    iframe.className = 'cv-renderer-iframe';
    iframe.src = src;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; clipboard-write; fullscreen');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    wrap.appendChild(iframe);
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
    slidesEmbedUrl:   slidesEmbedUrl,
    previewSrcFor:    previewSrcFor,
    mountInContainer: mountInContainer,
    openModal:        openModal
  };
}(window));
