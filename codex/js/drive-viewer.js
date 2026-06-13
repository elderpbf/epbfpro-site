// codex/js/drive-viewer.js
// Codex-owned shared Drive file rendering. ES-module port of the legacy
// window.CVDriveViewer (backstage/js/cv-drive-viewer.js): one place for the Drive
// preview URL contract + iframe attributes, used by Lessons (mounts inline) and
// the Content > Drive sub-tab (opens a modal). The legacy backstage global stays
// live for the un-ported ClassVault. Styling: css/drive-viewer.css (.cv- classes
// kept verbatim so rendering is identical; prefix-scoped, no clash with cdx-).
//
// Public API:
//   slidesEmbedUrl(urlOrId) -> string   canonical Google Slides /embed URL
//   previewSrcFor(item)     -> string   Drive preview URL for a drive_file row
//   mountInContainer(item, container)   replace container with the preview iframe
//   openModal(item) -> { close() }      modal shell + preview; Esc/backdrop close

function _extractFileId(url) {
  const m = String(url || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function _isSlide(item) {
  const meta = (item && item.meta_json) || {};
  return meta.mimeType === 'application/vnd.google-apps.presentation';
}

// slidesEmbedUrl(urlOrId): canonical Google Slides embed contract for the whole
// app. Returns the published /embed player URL (chrome-free except a bottom
// playbar, which cv-slides-clip clips) for ANY Slides input — a raw file id, a
// /presentation/d/<id>/* link, or a /presentation/d/e/<pubid>/* published link.
// Already-embed forms pass through. Unknown input returns as-is.
export function slidesEmbedUrl(urlOrId) {
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

export function previewSrcFor(item) {
  const meta = (item && item.meta_json) || {};
  // Presentations render through the chrome-free Slides /embed player; the generic
  // /file/d/<id>/preview viewer (used for Docs/PDFs) carries Google's pop-out and
  // is only for non-presentation files.
  if (_isSlide(item)) {
    const src = slidesEmbedUrl(meta.file_id || meta.url);
    if (src) return src;
  }
  const id = meta.file_id || _extractFileId(meta.url);
  return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
}

// isSlide=true uses the slide-clip shell (oversize + overflow:hidden) to clip the
// Slides /embed bottom playbar. Non-slide Drive files (/preview) render plain.
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

export function mountInContainer(item, container) {
  if (!container) return;
  const src = previewSrcFor(item);
  if (!src) {
    container.innerHTML = '<div class="cv-renderer-empty">Arquivo Drive sem file_id (ou URL inválida).</div>';
    return;
  }
  container.innerHTML = '';
  container.appendChild(_buildIframeWrap(src, _isSlide(item)));
}

export function openModal(item) {
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
