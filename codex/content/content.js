// content/content.js
// Codex Content tab shell. Renders the in-view sub-tab nav and mounts the
// active sub-module into a sub-view. Each sub-tab is its own mount/unmount
// module (the contract's tab shape, one level down). Today only Items is
// migrated; Drive / Labs / Presets / Releases / Workbook / Assignments / Slides
// slot into SUBTABS as they land.
import { t } from '../js/i18n.js';
import * as items from './items.js';

// key → { labelKey, module }. Order here is the nav order.
const SUBTABS = [
  { key: 'items', labelKey: 'content.sub_items', module: items },
];

let _viewEl = null;
let _activeKey = null;
let _activeModule = null;

function _navHtml(activeKey) {
  return SUBTABS.map((s) =>
    '<button type="button" role="tab" class="cdx-subtab' + (s.key === activeKey ? ' active' : '') + '" ' +
      'data-subtab="' + s.key + '"' + (s.key === activeKey ? ' aria-current="page"' : '') + '>' +
      t(s.labelKey) +
    '</button>').join('');
}

function _activate(key) {
  const entry = SUBTABS.find((s) => s.key === key) || SUBTABS[0];
  if (_activeModule && _activeModule.unmount) {
    try { _activeModule.unmount(); } catch (_) { /* ignore */ }
  }
  _activeKey = entry.key;
  _activeModule = entry.module;
  // Reflect active state on the nav.
  _viewEl.querySelectorAll('.cdx-subtab').forEach((b) => {
    const on = b.dataset.subtab === _activeKey;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const sub = _viewEl.querySelector('#cdx-subview');
  if (sub && _activeModule && _activeModule.mount) _activeModule.mount(sub, {});
}

function _onNavClick(e) {
  const btn = e.target.closest('.cdx-subtab');
  if (!btn) return;
  const key = btn.dataset.subtab;
  if (key && key !== _activeKey) _activate(key);
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  ctx = ctx || {};
  const initial = (ctx.sub && SUBTABS.some((s) => s.key === ctx.sub)) ? ctx.sub : SUBTABS[0].key;
  viewEl.innerHTML =
    '<div class="cdx-content">' +
      '<nav class="cdx-subtabs" role="tablist" aria-label="Content">' + _navHtml(initial) + '</nav>' +
      '<div class="cdx-subview" id="cdx-subview"></div>' +
    '</div>';
  viewEl.querySelector('.cdx-subtabs').addEventListener('click', _onNavClick);
  _activate(initial);
}

export function unmount() {
  if (_activeModule && _activeModule.unmount) {
    try { _activeModule.unmount(); } catch (_) { /* ignore */ }
  }
  _activeModule = null;
  _activeKey = null;
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
