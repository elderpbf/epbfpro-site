// cohorts/alias-popover.js
// The small window the "+" beside an e-mail opens (track-28a2, Élder 2026-07-15): "we should put
// a + just not a huge thing, a simple + besides the email that we can click on it and it opens a
// small window with the other emails. And remember this has to be the same behaviour on both
// tables, this one and the participants one."
//
// So it lives here, not inside either list. position:fixed and placed from the button's rect, for
// the same reason the expiry popover is: both lists scroll, and a positioned-in-flow popover gets
// clipped by the scroll container.

import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';

let _el = null;
let _onDoc = null;

export function closeAliasPopover() {
  if (_el && _el.parentNode) _el.parentNode.removeChild(_el);
  _el = null;
  if (_onDoc) {
    document.removeEventListener('mousedown', _onDoc, true);
    document.removeEventListener('keydown', _onDoc, true);
    _onDoc = null;
  }
}

// btn = the "+" element; aliases = the person's OTHER addresses (never the canonical one).
export function openAliasPopover(btn, aliases, canonical) {
  closeAliasPopover();
  const list = (aliases || []).filter(Boolean);
  if (!btn || !list.length) return;

  _el = document.createElement('div');
  _el.className = 'cdx-pl-alias-pop';
  _el.setAttribute('role', 'dialog');
  _el.innerHTML = '<h4>' + esc(t('access.aliases_title')) + '</h4>' +
    (canonical ? '<div><b>' + esc(canonical) + '</b></div>' : '') +
    list.map((a) => '<div>' + esc(a) + '</div>').join('');
  document.body.appendChild(_el);

  // Prefer below-right of the "+", but never off-screen.
  const r = btn.getBoundingClientRect();
  const w = _el.offsetWidth;
  const h = _el.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  _el.style.left = left + 'px';
  _el.style.top = top + 'px';

  // Any click outside, or Escape, closes it. Capture phase so a list row's own handler cannot
  // swallow the event first and leave the popover orphaned.
  _onDoc = (ev) => {
    if (ev.type === 'keydown' && ev.key !== 'Escape') return;
    if (ev.type === 'mousedown' && (_el.contains(ev.target) || btn.contains(ev.target))) return;
    closeAliasPopover();
  };
  document.addEventListener('mousedown', _onDoc, true);
  document.addEventListener('keydown', _onDoc, true);
}
