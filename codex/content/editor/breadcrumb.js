// content/editor/breadcrumb.js
// The painter for the editor's navigation stack. Says where you are and gets you back.
//
// Split from editor/nav.js on purpose: nav.js is the pure engine (what the stack is, what is
// still unsaved), this is the only file that knows what it LOOKS like. Same split as
// js/item-list.js and content/item-members.js.
//
// It is a breadcrumb and not a "back" button because the depth can be three (a bundle inside a
// bundle inside nothing), and at three levels a single back button hides where you actually are.
import { esc as _esc } from '../../js/dom.js';
import { t } from '../../js/i18n.js';

// The trail as HTML. `path` is nav.path(): [{ key, title, isNew, isBundle }].
// The LAST crumb is where you are, so it is not clickable; every earlier one is.
export function breadcrumbHtml(path) {
  const list = path || [];
  if (list.length < 2) return '';   // a single level has nowhere to go back to
  const crumbs = list.map((e, i) => {
    const label = _esc(_crumbLabel(e));
    if (i === list.length - 1) return '<span class="cdx-crumb is-here">' + label + '</span>';
    return '<button type="button" class="cdx-crumb" data-crumb="' + i + '">' + label + '</button>';
  }).join('<span class="cdx-crumb-sep" aria-hidden="true">&#8250;</span>');
  return '<nav class="cdx-editor-crumbs" aria-label="' + _esc(t('editor.crumbs_label')) + '">' + crumbs + '</nav>';
}

// A title carries markdown markup ("# Prompt: ...") because that is how the corpus was authored;
// the crumb strips it, and falls back to a placeholder for something that has no title yet.
function _crumbLabel(entry) {
  const raw = String((entry && entry.title) || '').replace(/^#+\s*/, '').trim();
  if (raw) return raw.length > 40 ? raw.slice(0, 39) + '…' : raw;
  return t(entry && entry.isNew ? 'editor.crumb_new' : 'editor.crumb_untitled');
}

// Wire the clickable crumbs. `onGo(index)` receives the position clicked.
export function wireBreadcrumb(host, onGo) {
  if (!host) return;
  host.querySelectorAll('[data-crumb]').forEach((b) => {
    b.addEventListener('click', () => onGo(Number(b.dataset.crumb)));
  });
}
