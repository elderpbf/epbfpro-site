// content/content.js
// Codex Content tab shell. Renders the in-view sub-tab nav and mounts the
// active sub-module into a sub-view. Each sub-tab is its own mount/unmount
// module (the contract's tab shape, one level down). Today only Items is
// migrated; Drive / Labs / Presets / Releases / Workbook / Assignments / Slides
// slot into SUBTABS as they land.
import { t } from '../js/i18n.js';
import * as items from './items.js';

// Order here is the nav order. A sub-tab is either NATIVE (carries a `module`
// with mount/unmount, rendered as a button that mounts in-place) or a LEGACY
// BRIDGE (carries an `href` to the not-yet-migrated ClassTrail page, rendered
// as a link). As each sub-tab migrates, swap its `href` for a `module`.
const SUBTABS = [
  { key: 'items',    labelKey: 'content.sub_items',    module: items },
  { key: 'apostila', labelKey: 'content.sub_apostila', href: '/backstage/classtrail/?tab=apostila' },
  { key: 'tarefas',  labelKey: 'content.sub_tarefas',  href: '/backstage/classtrail/?tab=tarefas' },
  { key: 'drive',    labelKey: 'content.sub_drive',    href: '/backstage/classtrail/?tab=drive' },
  { key: 'labs',     labelKey: 'content.sub_labs',     href: '/backstage/classtrail/?tab=labs' },
  { key: 'presets',  labelKey: 'content.sub_presets',  href: '/backstage/classtrail/?tab=presets' },
  { key: 'releases', labelKey: 'content.sub_releases', href: '/backstage/classtrail/?tab=liberacoes' },
];

let _viewEl = null;
let _activeKey = null;
let _activeModule = null;

function _navHtml(activeKey) {
  return SUBTABS.map((s) => {
    // Legacy bridge: a link out to the not-yet-migrated ClassTrail sub-tab.
    if (s.href) {
      return '<a class="cdx-subtab cdx-subtab--legacy" href="' + s.href + '">' +
        t(s.labelKey) + '<span class="cdx-subtab-ext" aria-hidden="true">↗</span></a>';
    }
    // Native sub-tab: mounts in place.
    return '<button type="button" role="tab" class="cdx-subtab' + (s.key === activeKey ? ' active' : '') + '" ' +
      'data-subtab="' + s.key + '"' + (s.key === activeKey ? ' aria-current="page"' : '') + '>' +
      t(s.labelKey) +
    '</button>';
  }).join('');
}

function _nativeSubtabs() { return SUBTABS.filter((s) => s.module); }

function _activate(key) {
  const entry = _nativeSubtabs().find((s) => s.key === key) || _nativeSubtabs()[0];
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
  const native = _nativeSubtabs();
  const initial = (ctx.sub && native.some((s) => s.key === ctx.sub)) ? ctx.sub : native[0].key;
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
