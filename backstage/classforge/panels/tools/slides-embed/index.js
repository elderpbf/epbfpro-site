// tools/slides-embed/index.js
//
// Phase 3AA. slides-embed: drops a full-bleed iframe pointing at a Google
// Slides URL (publish-to-web /d/e/<id>/embed or shared edit /d/<id>/embed).
//
// Slide picker (auto-attached when slides metadata is available):
//
//   Source resolution (first hit wins):
//     1. config.slides         -- [{id, title}, ...] per-panel override
//     2. config.slideIds       -- ['id.gXXX', ...] legacy IDs-only form
//     3. runtime.manifest.slides -- deck-level [{id, title}, ...] fallback
//        (read via window.__panelsRuntime; lets every Slides panel inherit
//        the deck index without duplicating it per-panel)
//
//   Picker mode (auto, with override):
//     - 'search'  -- when titles are available; click label opens a
//                    searchable dropdown listing "N. Title" entries.
//                    Filters by number AND by accent-insensitive title
//                    substring. ←/↑ ↓/→ navigates results, Enter jumps,
//                    Esc closes.
//     - 'stepper' -- when only IDs are present (no titles); click label
//                    becomes editable input, type number + Enter to jump.
//     - Override per-panel via config.slidePicker = 'search' | 'stepper'.
//       Force-disable both with config.slidePicker = 'off'.
//
// The pill itself is provided by engine/panel-pills.js (stepper kind with
// '←'/'→' arrows). See that file's header for the pill catalog.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.2';

const DEFAULT_URL = 'https://docs.google.com/presentation/d/e/REPLACE_WITH_PUBLISHED_ID/embed?start=false&loop=false&delayms=60000';

let mounted = null;
let pillHandle = null;
let dropdownHandle = null;

// Strip diacritics for accent-insensitive matching.
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Parse a `slide=id.gXXX` from a URL (query or hash) and return the matching
// 1-based index in the slides array, or 1 if not found.
function detectInitialSlide(url, slides) {
  const m = url.match(/[?&#]slide=([^&#]+)/);
  if (!m) return 1;
  const id = decodeURIComponent(m[1]);
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].id === id) return i + 1;
  }
  return 1;
}

// Replace the existing slide=... param (whether in query string or hash) with
// the new slide ID. Published URLs (/pubembed) carry it as a query param;
// /embed URLs carry it as a hash fragment.
function withSlide(originalUrl, newSlideId) {
  let url = originalUrl;
  url = url.replace(/([?&])slide=[^&#]*/, '$1');
  url = url.replace(/#slide=[^&]*/, '');
  if (url.indexOf('/pubembed') !== -1) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'slide=' + encodeURIComponent(newSlideId);
  } else {
    url += '#slide=' + encodeURIComponent(newSlideId);
  }
  return url;
}

// Resolve the slides list from panel config or deck manifest.
// Returns { slides: [{id, title?}], hasTitles: boolean } or null if none.
function resolveSlides(cfg) {
  if (Array.isArray(cfg.slides) && cfg.slides.length > 0) {
    const hasTitles = cfg.slides.every(s => s && typeof s.title === 'string');
    return { slides: cfg.slides, hasTitles };
  }
  if (Array.isArray(cfg.slideIds) && cfg.slideIds.length > 0) {
    return { slides: cfg.slideIds.map(id => ({ id })), hasTitles: false };
  }
  const deckSlides = window.__panelsRuntime?.manifest?.slides;
  if (Array.isArray(deckSlides) && deckSlides.length > 0) {
    const hasTitles = deckSlides.every(s => s && typeof s.title === 'string');
    return { slides: deckSlides, hasTitles };
  }
  return null;
}

function buildDropdown(pillBarEl, slides, currentIndex, onPick) {
  const dialog = document.createElement('dialog');
  dialog.className = 'pn-slides-dropdown';
  dialog.setAttribute('aria-label', 'Selecionar slide');

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'pn-slides-dropdown__search';
  search.placeholder = 'Buscar slide por número ou título...';
  search.spellcheck = false;
  search.autocomplete = 'off';
  dialog.appendChild(search);

  const list = document.createElement('ul');
  list.className = 'pn-slides-dropdown__list';
  dialog.appendChild(list);

  // Build all items up front; filter by toggling .is-hidden.
  const items = slides.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'pn-slides-dropdown__item';
    li.setAttribute('data-index', String(i));
    li.tabIndex = -1;

    const num = document.createElement('span');
    num.className = 'pn-slides-dropdown__num';
    num.textContent = (i + 1) + '.';
    li.appendChild(num);

    const title = document.createElement('span');
    title.className = 'pn-slides-dropdown__title';
    title.textContent = s.title || '(sem título)';
    li.appendChild(title);

    li.addEventListener('click', () => onPick(i));
    list.appendChild(li);
    return { el: li, index: i, search: normalize((i + 1) + ' ' + (s.title || '')) };
  });

  let highlighted = currentIndex;
  let visibleIndices = items.map(it => it.index);

  function setHighlight(idx) {
    if (idx == null) return;
    items.forEach(it => it.el.classList.toggle('is-highlighted', it.index === idx));
    const item = items[idx];
    if (item && !item.el.classList.contains('is-hidden')) {
      item.el.scrollIntoView({ block: 'nearest' });
    }
    highlighted = idx;
  }

  function applyFilter(query) {
    const q = normalize(query);
    visibleIndices = [];
    for (const it of items) {
      const match = !q || it.search.includes(q);
      it.el.classList.toggle('is-hidden', !match);
      if (match) visibleIndices.push(it.index);
    }
    if (visibleIndices.length === 0) {
      highlighted = null;
      return;
    }
    if (highlighted == null || !visibleIndices.includes(highlighted)) {
      setHighlight(visibleIndices[0]);
    } else {
      setHighlight(highlighted);
    }
  }

  function moveHighlight(delta) {
    if (visibleIndices.length === 0) return;
    let pos = visibleIndices.indexOf(highlighted);
    if (pos === -1) pos = 0;
    pos = (pos + delta + visibleIndices.length) % visibleIndices.length;
    setHighlight(visibleIndices[pos]);
  }

  search.addEventListener('input', () => applyFilter(search.value));
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); moveHighlight(+1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); moveHighlight(-1); }
    else if (e.key === 'Enter')     { e.preventDefault(); if (highlighted != null) onPick(highlighted); }
    else if (e.key === 'Escape')    { e.preventDefault(); close(); }
  });

  // Intercept native Esc (which would close the dialog without our cleanup)
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });

  // Click outside the dialog box closes it (mousedown on the dialog element
  // itself, i.e. outside the content area, means a click in the backdrop).
  dialog.addEventListener('mousedown', e => {
    if (e.target === dialog) close();
  });

  function close() {
    if (dialog.open) dialog.close();
    if (dialog.parentNode) dialog.remove();
    dropdownHandle = null;
  }

  // Position: fixed, bottom of dropdown aligns to top of pill bar.
  function positionDialog() {
    const rect = pillBarEl.getBoundingClientRect();
    const dialogWidth = Math.min(640, window.innerWidth - 48);
    let left = rect.left + (rect.width / 2) - (dialogWidth / 2);
    left = Math.max(24, Math.min(left, window.innerWidth - dialogWidth - 24));
    dialog.style.left = left + 'px';
    dialog.style.bottom = (window.innerHeight - rect.top) + 'px';
    dialog.style.width = dialogWidth + 'px';
  }

  setHighlight(currentIndex);
  document.body.appendChild(dialog);
  positionDialog();
  dialog.show();
  requestAnimationFrame(() => search.focus());

  return { close, overlay: dialog };
}

registerTool({
  id: 'slides-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const url = (typeof cfg.url === 'string' && cfg.url) ? cfg.url : DEFAULT_URL;

    const root = document.createElement('div');
    root.className = 'slides-embed-root';

    const frame = document.createElement('iframe');
    frame.className = 'slides-embed-frame';
    frame.setAttribute('src', url);
    frame.setAttribute('title', 'Google Slides');
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('allowfullscreen', 'true');
    frame.setAttribute('allow', 'autoplay');
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    root.appendChild(frame);

    container.appendChild(root);
    mounted = root;

    const resolved = resolveSlides(cfg);
    if (cfg.slidePicker === 'off' || !resolved) return;

    const { slides, hasTitles } = resolved;
    const total = slides.length;
    const mode = cfg.slidePicker || (hasTitles ? 'search' : 'stepper');
    let current = detectInitialSlide(url, slides);

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    function navigate(slideNumber) {
      const idx = Math.max(1, Math.min(total, Math.round(slideNumber)));
      current = idx;
      frame.src = withSlide(url, slides[idx - 1].id);
      if (pillHandle) pillHandle.update(0, { value: idx });
    }

    function openDropdown() {
      if (dropdownHandle) { dropdownHandle.close(); return; }
      // pillHandle.barEl is the pill bar DOM element; used for fixed positioning.
      // attachPanelPills runs synchronously so pillHandle is set before any user
      // interaction can fire openDropdown.
      const anchorEl = pillHandle ? pillHandle.barEl : container;
      dropdownHandle = buildDropdown(anchorEl, slides, current - 1, (zeroIdx) => {
        if (dropdownHandle) dropdownHandle.close();
        navigate(zeroIdx + 1);
      });
    }

    pillHandle = attachPanelPills(container, {
      pills: [{
        kind: 'stepper',
        value: current,
        min: 1,
        max: total,
        step: 1,
        format: mode === 'search' && hasTitles
          ? (v) => v + '. ' + (slides[v - 1].title || ('Slide ' + v))
          : (v) => 'Slide ' + v + ' de ' + total,
        editable: mode === 'stepper',
        onLabelClick: mode === 'search' ? openDropdown : null,
        symbolMinus: '←',
        symbolPlus:  '→',
        ariaLabelMinus: 'Slide anterior',
        ariaLabelPlus:  'Próximo slide',
        ariaLabelLabel: mode === 'search' ? 'Abrir lista de slides' : 'Número do slide',
        onChange: (v) => {
          current = v;
          frame.src = withSlide(url, slides[v - 1].id);
        },
      }],
    });
  },
  unmount() {
    if (dropdownHandle) { dropdownHandle.close(); dropdownHandle = null; }
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
