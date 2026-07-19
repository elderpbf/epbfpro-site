// content/interativos.js
// Codex Content tab, Interativos sub-tab. Sibling of the Labs sub-tab: a native
// cdx- master-detail over the shipped-HTML "Interativo" registry
// (js/interativos-registry.js). Left = the list of interativos (shared list-rail);
// right = a LIVE, interactive iframe preview (an Interativo is meant to be explored
// in place, so — unlike Labs' scaled static preview — the frame is interactive),
// plus a "Tela cheia" button that opens the SAME shared fullscreen viewer
// (js/lab-viewer.js) by url.
//
// Deliberately leaner than content/labs.js: interativos are a small curated set of
// shipped artifacts, so there is no enable/disable, archive or reorder here. Adding
// one is a registry edit (see js/interativos-registry.js), not a UI action.
import { t } from '../js/i18n.js';
import { getAllItems, interativoIcon } from '../js/interativos-registry.js';
import { iconHtml as typeIconHtml } from '../js/glyphs.js';
import { openModal as openViewer } from '../js/lab-viewer.js';
import { mountRail } from '../js/list-rail.js';
import { esc as _esc } from '../js/dom.js';

let _viewEl = null;
let _selectedId = null;
let _rail = null;
let _onClick = null;

function _items() { return getAllItems(); }
function _byId(id) { return _items().find((it) => String(it.id) === String(id)) || null; }

// Keep the current selection if it still exists, else fall back to the first item.
function _resolveSelection(items, id) {
  if (!items || !items.length) return null;
  return items.some((it) => String(it.id) === String(id)) ? id : items[0].id;
}

function _key(item) { return String(item.id).replace(/^interativo:/, ''); }

function _rowMain(item) {
  return '<div class="cdx-inter-rowwrap">' +
      '<span class="cdx-item-type-icon">' + typeIconHtml(interativoIcon(_key(item)), { size: 16 }) + '</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + _esc(item.title) + '</div>' +
        (item.summary ? '<div class="cdx-item-sub">' + _esc(item.summary) + '</div>' : '') +
      '</div>' +
    '</div>';
}

function _previewHtml(item) {
  if (!item) return '<div class="cdx-preview-empty">' + _esc(t('interativos.select')) + '</div>';
  const meta = item.meta_json || {};
  return '<div class="cdx-preview-head">' +
      '<span class="cdx-item-type-icon">' + typeIconHtml(item.type_icon, { size: 22 }) + '</span>' +
      '<div class="cdx-preview-head-info">' +
        '<div class="cdx-preview-title">' + _esc(item.title) + '</div>' +
        '<span class="cdx-preview-type">' + _esc(item.type_label) + (item.summary ? ' &middot; ' + _esc(item.summary) : '') + '</span>' +
      '</div>' +
      '<div class="cdx-preview-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-action="fullscreen">' + _esc(t('interativos.fullscreen')) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-inter-frame-wrap">' +
      '<iframe class="cdx-inter-frame" title="' + _esc(item.title) + '" loading="lazy"' +
        ' allow="autoplay; encrypted-media; clipboard-write; fullscreen"' +
        ' src="' + _esc(meta.url || '') + '"></iframe>' +
    '</div>';
}

function _renderPreview() {
  const pane = _viewEl && _viewEl.querySelector('#cdx-inter-preview');
  if (!pane) return;
  pane.innerHTML = _previewHtml(_byId(_selectedId));
}

function _buildRail() {
  const el = _viewEl.querySelector('#cdx-inter-list');
  if (!el) return;
  _rail = mountRail(el, {
    title: '',
    items: () => _items(),
    getId: (it) => it.id,
    renderRow: (it) => ({ main: _rowMain(it) }),
    selectedId: () => _selectedId,
    onSelect: (id) => { _selectedId = id; _rail.render(); _renderPreview(); },
  });
}

function _render() {
  const items = _items();
  _selectedId = _resolveSelection(items, _selectedId);
  _viewEl.innerHTML =
    '<div class="cdx-inter">' +
      '<div class="cdx-labs-head">' +
        '<h2 class="cdx-labs-title">' + _esc(t('interativos.title')) + '</h2>' +
        '<div class="cdx-labs-hint">' + _esc(t('interativos.hint')) + '</div>' +
      '</div>' +
      '<div class="cdx-items-split">' +
        '<div class="cdx-items-list" id="cdx-inter-list"></div>' +
        '<div class="cdx-item-preview" id="cdx-inter-preview"></div>' +
      '</div>' +
    '</div>';
  if (_rail) { _rail.destroy(); _rail = null; }
  _buildRail();
  if (_rail) _rail.render();
  _renderPreview();
}

export function mount(viewEl) {
  _viewEl = viewEl;
  _render();
  _onClick = (e) => {
    if (e.target.closest('[data-action="fullscreen"]')) {
      e.preventDefault();
      const item = _byId(_selectedId);
      if (item && item.meta_json) openViewer({ url: item.meta_json.url, title: item.title });
    }
  };
  viewEl.addEventListener('click', _onClick);
}

export function unmount() {
  if (_rail) { _rail.destroy(); _rail = null; }
  if (_viewEl) {
    if (_onClick) _viewEl.removeEventListener('click', _onClick);
    _viewEl.innerHTML = '';
  }
  _viewEl = null;
  _onClick = null;
  _selectedId = null;
}
