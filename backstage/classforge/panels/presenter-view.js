// presenter-view.js
//
// Standalone script for presenter-view.html.
// - Reads `slug` and optional `panel` from the URL.
// - Subscribes to BroadcastChannel('panels-presenter-<slug>').
// - Updates the mirror iframe and notes panel on { type: 'panel' } messages.
// - Inline Markdown subset renderer (~30 lines): double-newline -> <p>,
//   **bold** -> <strong>, *italic* -> <em>, `code` -> <code>.
// - Draggable splitter between mirror and notes panes (persisted per slug).
// - Aspect-ratio toolbar (16:9 / 16:10 / 4:3 / Tela cheia / Personalizado),
//   persisted per slug; auto-switches to full frame for presenter-asymmetric
//   panels (those whose tools mounted via presenterMount).

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
  const mainEl         = document.getElementById('pv-main');
  const mirrorPane     = document.getElementById('pv-mirror-pane');
  const mirrorFrame    = document.getElementById('pv-mirror');
  const splitter       = document.getElementById('pv-splitter');
  const aspectToolbar  = document.getElementById('pv-aspect');
  const notesPanelTitle = document.getElementById('pv-notes-panel-title');
  const notesBody      = document.getElementById('pv-notes-body');
  const closeBtn       = document.getElementById('pv-close');

  // ------------------------------------------------------------------
  // Inline Markdown renderer (subset)
  // ------------------------------------------------------------------
  function renderMarkdown(text) {
    if (!text || !text.trim()) return null;

    function escHtml(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    const rawParas = text.split(/\n{2,}/);
    const fragment = document.createDocumentFragment();

    rawParas.forEach(raw => {
      const line = raw.trim();
      if (!line) return;

      const p = document.createElement('p');
      let rest = escHtml(line);

      const codeChunks = [];
      rest = rest.replace(/`([^`]+)`/g, (_, inner) => {
        codeChunks.push(inner);
        return '\x00CODE' + (codeChunks.length - 1) + '\x00';
      });

      rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      rest = rest.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      rest = rest.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
        return '<code>' + codeChunks[parseInt(i, 10)] + '</code>';
      });

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
  let totalPanels  = null;
  let isAsymmetricPanel = false;

  // ------------------------------------------------------------------
  // Splitter (persisted per slug)
  // ------------------------------------------------------------------
  const SPLIT_KEY = 'bs_pv_split_' + slug;
  const storedSplit = parseFloat(localStorage.getItem(SPLIT_KEY));
  if (Number.isFinite(storedSplit) && storedSplit >= 20 && storedSplit <= 80) {
    mirrorPane.style.flexBasis = storedSplit + '%';
  }

  let isDragging = false;
  splitter.addEventListener('mousedown', (e) => {
    isDragging = true;
    splitter.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = mainEl.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    mirrorPane.style.flexBasis = clamped + '%';
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const match = mirrorPane.style.flexBasis.match(/([\d.]+)%/);
    if (match) localStorage.setItem(SPLIT_KEY, match[1]);
  });

  // ------------------------------------------------------------------
  // Aspect-ratio toolbar (persisted per slug; full-frame override for
  // presenter-asymmetric panels)
  // ------------------------------------------------------------------
  const ASPECT_KEY = 'bs_pv_aspect_' + slug;
  const ASPECT_PRESETS = {
    '16:9':  { w: 16, h: 9 },
    '16:10': { w: 16, h: 10 },
    '4:3':   { w: 4,  h: 3 },
  };

  let storedRatio = localStorage.getItem(ASPECT_KEY) || '16:9';

  function parseRatio(ratio) {
    if (ASPECT_PRESETS[ratio]) return ASPECT_PRESETS[ratio];
    if (typeof ratio === 'string' && ratio.startsWith('custom:')) {
      const parts = ratio.slice(7).split(':');
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (w > 0 && h > 0) return { w, h };
    }
    return null;
  }

  function applyAspect() {
    const effective = isAsymmetricPanel ? 'full' : storedRatio;
    if (effective === 'full') {
      mirrorPane.classList.add('is-full');
      mirrorPane.style.removeProperty('--pv-aspect-w');
      mirrorPane.style.removeProperty('--pv-aspect-h');
    } else {
      const preset = parseRatio(effective) || ASPECT_PRESETS['16:9'];
      mirrorPane.classList.remove('is-full');
      mirrorPane.style.setProperty('--pv-aspect-w', preset.w);
      mirrorPane.style.setProperty('--pv-aspect-h', preset.h);
    }
    updateAspectButtons();
  }

  function updateAspectButtons() {
    const buttons = aspectToolbar.querySelectorAll('button');
    const visible = isAsymmetricPanel ? 'full'
      : (storedRatio.startsWith('custom:') ? 'custom' : storedRatio);
    buttons.forEach(btn => {
      const ratio = btn.dataset.ratio;
      btn.classList.toggle('is-active', ratio === visible);
      btn.disabled = isAsymmetricPanel && ratio !== 'full';
    });
  }

  aspectToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const ratio = btn.dataset.ratio;
    if (ratio === 'custom') {
      const input = prompt('Digite a proporção (ex: 21:9):', '21:9');
      if (input === null) return;
      const parts = input.split(':');
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        alert('Proporção inválida. Use o formato W:H (por exemplo, 21:9).');
        return;
      }
      storedRatio = 'custom:' + w + ':' + h;
    } else {
      storedRatio = ratio;
    }
    localStorage.setItem(ASPECT_KEY, storedRatio);
    applyAspect();
  });

  applyAspect();

  // ------------------------------------------------------------------
  // Mirror initial load
  // ------------------------------------------------------------------
  function buildMirrorSrc(index) {
    return '/backstage/classforge/panels/presentations/' + slug + '/?panel=' + index + '&presenter=mirror';
  }

  // Initial-load only. Once the mirror iframe is loaded, the embedded deck
  // listens for { type: 'panel', origin: 'deck' } broadcasts and calls
  // runtime.goto internally, so we never reload the iframe again -- avoids
  // flicker and preserves iframe state (Slides decks, video position, etc.).
  let mirrorInitialized = false;
  function initMirror(index) {
    if (mirrorInitialized) return;
    mirrorInitialized = true;
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

  bc.postMessage({ type: 'request-state', origin: 'presenter' });

  function broadcast(direction) {
    bc.postMessage({ type: 'navigate', direction, origin: 'presenter' });
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); broadcast('next'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); broadcast('prev'); }
  });

  document.getElementById('pv-prev')?.addEventListener('click', () => broadcast('prev'));
  document.getElementById('pv-next')?.addEventListener('click', () => broadcast('next'));

  bc.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.origin === 'presenter') return; // ignore our own navigate echoes

    if (msg.type === 'panel') {
      const idx  = typeof msg.index === 'number' ? msg.index : 0;
      const meta = msg.meta || null;
      if (typeof msg.total === 'number') totalPanels = msg.total;
      currentIndex = idx;

      const newAsymmetric = !!msg.presenterAsymmetric;
      if (newAsymmetric !== isAsymmetricPanel) {
        isAsymmetricPanel = newAsymmetric;
        applyAspect();
      }

      updateNotes(meta, idx);
      updateCounter(idx, totalPanels);
    }
  });

  // ------------------------------------------------------------------
  // Initial load (load deck at initPanel without waiting for a message)
  // ------------------------------------------------------------------
  if (slug) {
    titleEl.textContent = slug;
    initMirror(initPanel);
    updateCounter(initPanel, null);
    notesBody.innerHTML = '<p class="pv-notes-empty">(sem notas)</p>';
    notesPanelTitle.textContent = 'Painel ' + (initPanel + 1);
  }

  closeBtn.addEventListener('click', () => window.close());

})();
