// codex/trilha/js/notice-page.js
// The trail's full-page STATUS-NOTICE pattern. One centred card that REPLACES the
// timeline (hides the tabs + tab content) and shows a glyph + title + body + an
// OPTIONAL action button, on the page's own clean background (never a modal over a
// rendered trail). Every trail status screen renders through here, so a new status
// need never hand-rolls fresh markup:
//   - pending approval  -> renderPending          (wall.js)
//   - blocked / denied  -> renderDenied           (wall.js)
//   - e-mail validated  -> renderValidatedNotice  (page.js, the magic-link return)
// Markup is the .cdx-en-pending block (styles in trilha/css/wall.css); glyphs come from
// the shared library (js/glyphs.js), never emojis. Pattern doc: manifest/architecture/access.md.
import { esc } from './utils.js';
import { glyphSvg } from '../../js/glyphs.js';

// Hide the timeline and return the reusable wall <section> to draw a notice into. Mirrors
// what the register wall does, so a notice and the register share one host. Idempotent:
// reuses the section if it already exists.
export function mountNoticeSection(root) {
  const main = root && root.querySelector('.cdx-trilha-main');
  if (!main) return null;
  if (root.classList) root.classList.add('cdx-tr-has-wall');
  const tabs = main.querySelector('.cdx-trilha-tabs');
  const content = main.querySelector('.cdx-trilha-tabcontent');
  if (tabs) tabs.hidden = true;
  if (content) content.hidden = true;
  let wall = main.querySelector('.cdx-en-wall');
  if (!wall) {
    // cdx-en-wall (NOT cdx-tr-wall): the tarefa modal's login overlay owns .cdx-tr-wall with
    // display:flex, which leaked onto this section; the wall/notice uses its own en- name.
    wall = document.createElement('section');
    wall.className = 'cdx-en-wall';
    // Insert the wall as CONTENT: above the "Precisa de ajuda?" pill + the footer, so the
    // support entry stays just under the content and the footer stays at the bottom.
    const anchor = main.querySelector('#cdx-tr-support-footer') || main.querySelector('.cdx-trilha-footer');
    main.insertBefore(wall, anchor || null);
  }
  wall.hidden = false;
  return wall;
}

// Draw the notice card into an existing element. opts:
//   glyph   — key from the shared glyph library (js/glyphs.js); omitted = no icon
//   cls     — extra class on the .cdx-en-pending block (e.g. 'cdx-en-denied', 'cdx-en-ok')
//   title   — bold heading (required)
//   body    — secondary line (optional)
//   orLabel — a small muted separator line before the action (optional, e.g. 'ou')
//   action  — { label, onClick } to append a primary button (optional)
// Returns the element so callers can append extra markup (e.g. the support-contact box).
export function renderNoticeInto(el, opts) {
  opts = opts || {};
  if (!el) return el;
  const cls = opts.cls ? ' ' + opts.cls : '';
  const icon = opts.glyph
    ? '<div class="cdx-en-pending-icon" aria-hidden="true">' + glyphSvg(opts.glyph, { size: 36 }) + '</div>'
    : '';
  const body = opts.body ? '<p class="cdx-en-pending-body">' + esc(opts.body) + '</p>' : '';
  const or = opts.orLabel ? '<p class="cdx-en-pending-or">' + esc(opts.orLabel) + '</p>' : '';
  const btn = opts.action
    ? '<button type="button" class="tr-btn tr-btn-primary cdx-btn cdx-en-pending-cta">' + esc(opts.action.label) + '</button>'
    : '';
  el.innerHTML =
    '<div class="cdx-en-pending' + cls + '">' +
      icon +
      '<h2 class="cdx-en-pending-title">' + esc(opts.title || '') + '</h2>' +
      body + or + btn +
    '</div>';
  if (opts.action && typeof opts.action.onClick === 'function') {
    const b = el.querySelector('.cdx-en-pending-cta');
    if (b) b.addEventListener('click', opts.action.onClick);
  }
  return el;
}

// Full-page notice: hide the timeline, mount the wall section, draw the notice. Returns the
// section (or null if the page shell is absent). The one call a status screen needs.
export function renderNoticePage(root, opts) {
  const wall = mountNoticeSection(root);
  if (!wall) return null;
  return renderNoticeInto(wall, opts);
}
