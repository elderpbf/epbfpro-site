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
// Click-to-advance:
//   A transparent overlay covers the iframe (excluding the bottom 24 px so
//   the pill bar's hover zone stays reachable) and translates clicks into
//   pill `next` actions. Without this, clicking the iframe advances Google
//   Slides internally but our pill counter stays stuck on slide 1.
//
// Pin:
//   The pin pill toggles per-panel persistence of the current slide index
//   under `bs_pn_slides_<deck>_<panelId>`. When pinned, mounting restores
//   the saved slide; when unpinned, mounting starts at slide 1 (or the
//   `?slide=` URL hint, if present). The pin state itself persists, so
//   once pinned a deck stays pinned across sessions.
//
// The pill itself is provided by engine/panel-pills.js. See that file's
// header for the full pill catalog.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.9';
import { ICON_PIN } from '../../engine/pill-icons.js';

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

// Per-panel persistence key. Uses the active deck slug + the active panel
// meta id when available so each Slides panel in each deck gets its own
// memory. Falls back to a URL-derived key if the runtime hasn't published
// those yet (shouldn't happen post-mount but worth guarding).
function persistKey(url) {
  const rt = (typeof window !== 'undefined') ? window.__panelsRuntime : null;
  const slug = rt?.manifest?.id;
  const panelId = rt?.currentMeta?.id;
  if (slug && panelId) return 'bs_pn_slides_' + slug + '_' + panelId;
  return 'bs_pn_slides_url_' + url;
}

function readPinState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { pinned: false, slideIndex: null };
    const parsed = JSON.parse(raw) || {};
    return {
      pinned: !!parsed.pinned,
      slideIndex: Number.isInteger(parsed.slideIndex) ? parsed.slideIndex : null,
    };
  } catch (_) {
    return { pinned: false, slideIndex: null };
  }
}

function writePinState(key, state) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) {}
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

    // Restore pinned state. If pinned and the saved index is in range, use
    // it; otherwise fall back to the URL-derived initial slide.
    const key = persistKey(url);
    const saved = readPinState(key);
    let pinned = saved.pinned;
    const restored = pinned && saved.slideIndex && saved.slideIndex >= 1 && saved.slideIndex <= total
      ? saved.slideIndex : null;
    let current = restored || detectInitialSlide(url, slides);
    if (restored) frame.src = withSlide(url, slides[current - 1].id);

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    // Click-catcher: forwards iframe-area clicks to the pill's `next`. Sits
    // above the iframe (z-index 1) but below the pill hover zone (z-index 9)
    // so the bottom-edge reveal still works. Bottom inset matches the zone
    // height so a click on the bottom 24 px reaches the zone, not us.
    const clickzone = document.createElement('div');
    clickzone.className = 'slides-embed-clickzone';
    clickzone.setAttribute('aria-label', 'Avançar slide');
    root.appendChild(clickzone);
    clickzone.addEventListener('click', () => advance());

    function advanceTo(nextNum) {
      if (!pillHandle) return;
      if (mode === 'search' && hasTitles) {
        pillHandle.update(0, { value: slides[nextNum - 1].id });
      } else {
        pillHandle.update(0, { value: nextNum });
      }
    }

    function advance() {
      if (current >= total) return;
      advanceTo(current + 1);
    }

    function persistIfPinned() {
      if (pinned) writePinState(key, { pinned: true, slideIndex: current });
    }

    const pinPill = {
      kind: 'actions',
      buttons: [{
        icon: ICON_PIN,
        ariaLabel: 'Lembrar último slide',
        ariaLabelActive: 'Slide fixado (clique para esquecer)',
        isActive: () => pinned,
        onClick: ({ refresh }) => {
          pinned = !pinned;
          if (pinned) writePinState(key, { pinned: true, slideIndex: current });
          else writePinState(key, { pinned: false });
          refresh();
        },
      }],
    };

    if (mode === 'search' && hasTitles) {
      // Select pill: searchable dropdown via the generic 'select' pill kind.
      const selectItems = slides.map((s, i) => ({
        value: s.id,
        label: s.title || ('Slide ' + (i + 1)),
        searchKeys: [String(i + 1)],
      }));

      pillHandle = attachPanelPills(container, {
        pills: [
          {
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
                persistIfPinned();
              }
            },
          },
          pinPill,
        ],
      });
    } else {
      // Stepper pill: editable input for jump-by-number when no titles.
      pillHandle = attachPanelPills(container, {
        pills: [
          {
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
              persistIfPinned();
            },
          },
          pinPill,
        ],
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
