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
//     - 'search'  -- when titles are available; uses the generic 'select'
//                    pill kind (panel-pills.js) which renders a searchable
//                    dropdown listing "N. Title" entries. Filters by number
//                    AND by accent-insensitive title substring.
//     - 'stepper' -- when only IDs are present (no titles); click label
//                    becomes editable input, type number + Enter to jump.
//     - Override per-panel via config.slidePicker = 'search' | 'stepper'.
//       Force-disable both with config.slidePicker = 'off'.
//
// The pill itself is provided by engine/panel-pills.js. See that file's
// header for the full pill catalog.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.9';

const DEFAULT_URL = 'https://docs.google.com/presentation/d/e/REPLACE_WITH_PUBLISHED_ID/embed?start=false&loop=false&delayms=60000';

let mounted = null;
let pillHandle = null;

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
//
// Deck-level fallback rule:
//   - Only /pubembed URLs share slide IDs with runtime.manifest.slides
//     (the published-deck form). /embed URLs (e.g. panel-06's single-slide
//     copy) point to arbitrary other decks and must NOT inherit the deck
//     index, otherwise we'd offer a picker pointing at the wrong slides.
//   - Pinned /pubembed URLs (?slide=id.gXXX) DO inherit: the slide IDs
//     still come from the same deck as manifest.slides, so the picker
//     remains correct -- the URL just opens the deck on a specific slide.
//     This restores the picker on panel-09 (which uses ?slide=id.).
function resolveSlides(cfg, url) {
  if (Array.isArray(cfg.slides) && cfg.slides.length > 0) {
    const hasTitles = cfg.slides.every(s => s && typeof s.title === 'string');
    return { slides: cfg.slides, hasTitles };
  }
  if (Array.isArray(cfg.slideIds) && cfg.slideIds.length > 0) {
    return { slides: cfg.slideIds.map(id => ({ id })), hasTitles: false };
  }
  // Deck-level fallback only applies to /pubembed URLs from the SAME deck as
  // runtime.manifest.slides. /embed URLs (panel-06's single-slide copy) point
  // to arbitrary other decks and must not inherit.
  if (typeof url !== 'string' || !url.includes('/pubembed')) {
    return null;
  }
  const deckSlides = window.__panelsRuntime?.manifest?.slides;
  if (Array.isArray(deckSlides) && deckSlides.length > 0) {
    const hasTitles = deckSlides.every(s => s && typeof s.title === 'string');
    return { slides: deckSlides, hasTitles };
  }
  return null;
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

    const resolved = resolveSlides(cfg, url);
    if (cfg.slidePicker === 'off' || !resolved) return;

    const { slides, hasTitles } = resolved;
    const total = slides.length;
    const mode = cfg.slidePicker || (hasTitles ? 'search' : 'stepper');
    let current = detectInitialSlide(url, slides);

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    if (mode === 'search' && hasTitles) {
      // Select pill: searchable dropdown via the generic 'select' pill kind.
      const selectItems = slides.map((s, i) => ({
        value: s.id,
        label: s.title || ('Slide ' + (i + 1)),
        searchKeys: [String(i + 1)],
      }));

      pillHandle = attachPanelPills(container, {
        pills: [{
          kind: 'select',
          items: selectItems,
          value: slides[current - 1].id,
          format: (item) => {
            const idx = selectItems.indexOf(item);
            const num = idx !== -1 ? idx + 1 : '';
            return num + '. ' + item.label;
          },
          placeholder: 'Buscar slide por número ou título...',
          symbolMinus: '←',
          symbolPlus:  '→',
          onChange: (slideId) => {
            const idx = slides.findIndex(s => s.id === slideId);
            if (idx !== -1) {
              current = idx + 1;
              frame.src = withSlide(url, slideId);
            }
          },
        }],
      });
    } else {
      // Stepper pill: editable input for jump-by-number when no titles.
      pillHandle = attachPanelPills(container, {
        pills: [{
          kind: 'stepper',
          value: current,
          min: 1,
          max: total,
          step: 1,
          format: (v) => 'Slide ' + v + ' de ' + total,
          editable: true,
          symbolMinus: '←',
          symbolPlus:  '→',
          ariaLabelMinus: 'Slide anterior',
          ariaLabelPlus:  'Próximo slide',
          ariaLabelLabel: 'Número do slide',
          onChange: (v) => {
            current = v;
            frame.src = withSlide(url, slides[v - 1].id);
          },
        }],
      });
    }
  },
  unmount() {
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
