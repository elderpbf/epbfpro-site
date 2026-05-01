// tools/slides-embed/index.js
//
// Phase 3AA. slides-embed: drops a full-bleed iframe pointing at a Google
// Slides URL (publish-to-web /d/e/<id>/embed or shared edit /d/<id>/embed).
// Used to test whether pre-built Slides animations and reveals survive the
// embed step and whether anchor-to-slide via the slide=ID parameter works
// inside a panel.
//
// Optional slide picker pill: if config.slideIds is provided (array of opaque
// slide IDs like ['gabc123', ...]), a hidden pill at the bottom of the panel
// auto-reveals on hover and lets the presenter jump to slide N. Without
// slideIds the panel renders a plain iframe (no pill chrome).

import { registerTool } from '../../engine/registry.js';

const DEFAULT_URL = 'https://docs.google.com/presentation/d/e/REPLACE_WITH_PUBLISHED_ID/embed?start=false&loop=false&delayms=60000';

let mounted = null;

// Replace the existing slide=... param (whether in query string or hash) with
// the new slide ID. Published URLs (/pubembed) carry it as a query param;
// /embed URLs carry it as a hash fragment. We strip whatever is there and
// re-add in the appropriate position.
function withSlide(originalUrl, newSlideId) {
  let url = originalUrl;
  // Remove existing slide= from query
  url = url.replace(/([?&])slide=[^&#]*/, '$1');
  // Remove existing #slide=
  url = url.replace(/#slide=[^&]*/, '');
  // Decide where to put the new param: published URLs use query, /embed URLs use hash
  if (url.indexOf('/pubembed') !== -1) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'slide=' + encodeURIComponent(newSlideId);
  } else {
    url += '#slide=' + encodeURIComponent(newSlideId);
  }
  return url;
}

function buildSlidePicker(root, iframe, originalUrl, slideIds) {
  const zone = document.createElement('div');
  zone.className = 'pn-slides-pill-zone';

  const pill = document.createElement('div');
  pill.className = 'pn-slides-pill';

  const label1 = document.createElement('span');
  label1.textContent = 'Slide ';
  pill.appendChild(label1);

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(slideIds.length);
  input.value = '1';
  input.className = 'pn-slides-pill__input';
  pill.appendChild(input);

  const label2 = document.createElement('span');
  label2.textContent = ' de ' + slideIds.length + ' ';
  pill.appendChild(label2);

  const goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'pn-slides-pill__go';
  goBtn.textContent = 'Ir';
  pill.appendChild(goBtn);

  function jumpTo(n) {
    if (!Number.isInteger(n) || n < 1 || n > slideIds.length) return;
    iframe.src = withSlide(originalUrl, slideIds[n - 1]);
  }

  goBtn.addEventListener('click', () => jumpTo(parseInt(input.value, 10)));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); jumpTo(parseInt(input.value, 10)); }
  });

  // Show/hide with grace period so the pill doesn't flicker when the cursor
  // crosses between zone and pill.
  let hideTimer = null;
  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    pill.classList.add('is-visible');
  }
  function hide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { pill.classList.remove('is-visible'); hideTimer = null; }, 600);
  }
  zone.addEventListener('mouseenter', show);
  pill.addEventListener('mouseenter', show);
  pill.addEventListener('mouseleave', hide);
  zone.addEventListener('mouseleave', hide);

  root.appendChild(zone);
  root.appendChild(pill);
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

    if (Array.isArray(cfg.slideIds) && cfg.slideIds.length > 0) {
      buildSlidePicker(root, frame, url, cfg.slideIds);
    }

    container.appendChild(root);
    mounted = root;
  },
  unmount() {
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
