// presenter-view.js
//
// Standalone script for presenter-view.html.
// - Reads `slug` and optional `panel` from the URL.
// - Subscribes to BroadcastChannel('panels-presenter-<slug>').
// - Updates the mirror iframe and notes panel on { type: 'panel' } messages.
// - Inline Markdown subset renderer (~30 lines): double-newline -> <p>,
//   **bold** -> <strong>, *italic* -> <em>, `code` -> <code>.

(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || '';
  const initPanel = params.get('panel') !== null ? parseInt(params.get('panel'), 10) : 0;

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const titleEl        = document.getElementById('pv-topbar-title');
  const counterEl      = document.getElementById('pv-counter');
  const mirrorPane     = document.getElementById('pv-mirror-pane');
  const mirrorFrame    = document.getElementById('pv-mirror');
  const notesPanelTitle = document.getElementById('pv-notes-panel-title');
  const notesBody      = document.getElementById('pv-notes-body');
  const closeBtn       = document.getElementById('pv-close');

  // ------------------------------------------------------------------
  // Inline Markdown renderer (subset)
  // ------------------------------------------------------------------
  function renderMarkdown(text) {
    if (!text || !text.trim()) return null;

    // Escape HTML entities first to prevent injection.
    function escHtml(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Split on double newlines to form paragraphs.
    const rawParas = text.split(/\n{2,}/);
    const fragment = document.createDocumentFragment();

    rawParas.forEach(raw => {
      const line = raw.trim();
      if (!line) return;

      const p = document.createElement('p');
      // Process inline spans: `code`, **bold**, *italic*.
      // Order matters: code first (its content is literal), then bold, then italic.
      const parts = [];
      let rest = escHtml(line);

      // Replace `code` spans with a placeholder, then bold/italic, then restore.
      const codeChunks = [];
      rest = rest.replace(/`([^`]+)`/g, (_, inner) => {
        codeChunks.push(inner);
        return '\x00CODE' + (codeChunks.length - 1) + '\x00';
      });

      // **bold**
      rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // *italic* (single star, not already consumed by bold)
      rest = rest.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // Restore code chunks.
      rest = rest.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
        return '<code>' + codeChunks[parseInt(i, 10)] + '</code>';
      });

      // Single newlines within a paragraph become a space.
      rest = rest.replace(/\n/g, ' ');

      p.innerHTML = rest;
      fragment.appendChild(p);
    });

    return fragment;
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  let currentIndex = initPanel;
  let totalPanels  = null; // will be set when first message arrives

  function buildMirrorSrc(index) {
    return '/backstage/classforge/panels/presentations/' + slug + '/?panel=' + index + '&presenter=mirror';
  }

  function updateMirror(index) {
    mirrorPane.classList.add('is-loading');
    mirrorFrame.onload = () => mirrorPane.classList.remove('is-loading');
    mirrorFrame.src = buildMirrorSrc(index);
  }

  function updateNotes(meta, index) {
    const panelTitle = (meta && (meta.title || meta.id)) || ('Painel ' + (index + 1));
    notesPanelTitle.textContent = panelTitle;

    notesBody.innerHTML = '';
    const notes = meta && meta.notes;
    if (notes && notes.trim()) {
      const rendered = renderMarkdown(notes);
      if (rendered) {
        notesBody.appendChild(rendered);
      } else {
        const empty = document.createElement('p');
        empty.className = 'pv-notes-empty';
        empty.textContent = '(sem notas)';
        notesBody.appendChild(empty);
      }
    } else {
      const empty = document.createElement('p');
      empty.className = 'pv-notes-empty';
      empty.textContent = '(sem notas)';
      notesBody.appendChild(empty);
    }
  }

  function updateCounter(index, total) {
    const t = total !== null ? total : '?';
    counterEl.textContent = 'Painel ' + (index + 1) + ' / ' + t;
  }

  // ------------------------------------------------------------------
  // BroadcastChannel
  // ------------------------------------------------------------------
  if (!slug) {
    titleEl.textContent = 'Vista do apresentador -- slug ausente';
    return;
  }

  const bc = new BroadcastChannel('panels-presenter-' + slug);

  bc.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'panel') {
      const idx  = typeof msg.index === 'number' ? msg.index : 0;
      const meta = msg.meta || null;
      currentIndex = idx;
      if (meta && typeof meta.total === 'number') totalPanels = meta.total;
      updateMirror(idx);
      updateNotes(meta, idx);
      updateCounter(idx, totalPanels);
    }
    // { type: 'theme' } intentionally ignored in v1.
  });

  // ------------------------------------------------------------------
  // Initial load (load deck at initPanel without waiting for a message)
  // ------------------------------------------------------------------
  if (slug) {
    titleEl.textContent = slug;
    updateMirror(initPanel);
    updateCounter(initPanel, null);
    // Show empty notes until the first broadcast arrives.
    notesBody.innerHTML = '<p class="pv-notes-empty">(sem notas)</p>';
    notesPanelTitle.textContent = 'Painel ' + (initPanel + 1);
  }

  // ------------------------------------------------------------------
  // Close button
  // ------------------------------------------------------------------
  closeBtn.addEventListener('click', () => window.close());

})();
